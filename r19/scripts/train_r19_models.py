#!/usr/bin/env python3
"""R19 Stage P3 Lightweight Classifier Training, Calibration & Feature Ablation (`G2`, `G3`, `G5`).

Reads strict subject/cluster-disjoint float32 feature buffers extracted by TS feature trackers
(`R19FeatureTracker` 82-dim or `Ux3FeatureTracker` 68-dim) so training and browser runtime share
100% identical feature math.

Trains:
  - G2: Linear Logistic Regression (`[d -> 3]`)
  - G3: Compact ReLU MLP sweep (`[d -> 64 -> 32 -> 3]`, `[d -> 96 -> 48 -> 3]`, L2/noise variants)
  - G5: Identical-split R18 `68`-feature MLP ablation + optional `P1F == PRESS` conflation trap demo

Zero leakage discipline:
  - Z-score mean/std fit strictly on TRAIN.
  - Architecture selection & post-hoc temperature scaling `T` fit strictly on VAL.
  - Locked TEST scored once per model family; exports JSON <= 200 KB + 150 raw parity rows.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
import numpy as np

SEED = 20261118


def load_split(derived_dir: str, prefix: str, split_name: str):
    meta_path = os.path.join(derived_dir, f"{prefix}_{split_name}.meta.json")
    bin_path = os.path.join(derived_dir, f"{prefix}_{split_name}.f32")
    with open(meta_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
    d = int(meta["feature_count"])
    X = np.fromfile(bin_path, dtype=np.float32).reshape(-1, d)
    y = np.asarray(meta["y"], dtype=np.int64)
    assert X.shape[0] == y.shape[0] == int(meta["rows"]), f"Row mismatch in {meta_path}"
    assert np.all(np.isfinite(X)), f"Non-finite features in {bin_path}"
    return meta, X, y


def softmax(z: np.ndarray) -> np.ndarray:
    zm = z - z.max(axis=1, keepdims=True)
    e = np.exp(zm)
    return e / e.sum(axis=1, keepdims=True)


def confusion(y: np.ndarray, p: np.ndarray, k: int) -> np.ndarray:
    c = np.zeros((k, k), dtype=np.int64)
    np.add.at(c, (y, p), 1)
    return c


def metrics_from_conf(c: np.ndarray, labels: list[str]) -> dict:
    tp = np.diag(c).astype(float)
    sup = c.sum(1).astype(float)
    pred = c.sum(0).astype(float)
    prec = np.divide(tp, pred, out=np.zeros_like(tp), where=pred > 0)
    rec = np.divide(tp, sup, out=np.zeros_like(tp), where=sup > 0)
    f1 = np.divide(2.0 * prec * rec, prec + rec, out=np.zeros_like(prec), where=(prec + rec) > 0)
    per_cls = [
        {
            "label": labels[i],
            "support": int(sup[i]),
            "precision": round(float(prec[i]), 4),
            "recall": round(float(rec[i]), 4),
            "f1": round(float(f1[i]), 4),
        }
        for i in range(len(labels))
    ]
    return {
        "acc": round(float(tp.sum() / max(1.0, c.sum())), 4),
        "macroF1": round(float(np.mean(f1[sup > 0])), 4),
        "perClass": per_cls,
        "confusion": c.tolist(),
    }


def nll_and_ece(probs: np.ndarray, y: np.ndarray, bins: int = 15) -> tuple[float, float]:
    n = len(y)
    p_true = np.clip(probs[np.arange(n), y], 1e-7, 1.0)
    nll = float(-np.mean(np.log(p_true)))
    conf = probs.max(axis=1)
    acc = (probs.argmax(axis=1) == y).astype(np.float32)
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        mask = (conf >= lo) & (conf < hi if b < bins - 1 else conf <= hi)
        if np.any(mask):
            ece += float(np.sum(mask) / n) * abs(float(acc[mask].mean()) - float(conf[mask].mean()))
    return round(nll, 5), round(ece, 5)


class DenseNet:
    def __init__(self, d_in: int, hidden: list[int], k: int, rng: np.random.Generator):
        dims = [d_in] + list(hidden) + [k]
        self.W = [
            rng.normal(0.0, np.sqrt(2.0 / max(1, dims[i])), (dims[i], dims[i + 1])).astype(np.float32)
            for i in range(len(dims) - 1)
        ]
        self.b = [np.zeros(dims[i + 1], dtype=np.float32) for i in range(len(dims) - 1)]

    def clone_weights(self):
        return [w.copy() for w in self.W], [bb.copy() for bb in self.b]

    def load_weights(self, W, b):
        self.W = [w.copy() for w in W]
        self.b = [bb.copy() for bb in b]

    def forward(self, X: np.ndarray, keep: bool = False):
        acts = [X] if keep else None
        h = X
        for i, (W, b) in enumerate(zip(self.W, self.b)):
            h = h @ W + b
            if i < len(self.W) - 1:
                h = np.maximum(h, 0.0)
            if keep:
                acts.append(h)
        return acts, h


def fit_model(
    Xtr: np.ndarray,
    ytr: np.ndarray,
    wtr: np.ndarray,
    Xva: np.ndarray,
    yva: np.ndarray,
    labels: list[str],
    hidden: list[int],
    l2: float,
    lr: float,
    epochs: int,
    noise_std: float,
    seed: int,
    batch_size: int = 512,
):
    rng = np.random.default_rng(seed)
    k = len(labels)
    net = DenseNet(Xtr.shape[1], hidden, k, rng)
    params = lambda: net.W + net.b
    m = [np.zeros_like(p) for p in params()]
    v = [np.zeros_like(p) for p in params()]
    t = 0
    n = len(Xtr)
    best = (-1.0, None, 0)
    t0 = time.perf_counter()

    for ep in range(1, epochs + 1):
        perm = rng.permutation(n)
        lr_ep = lr * (0.12 + 0.88 * 0.5 * (1.0 + np.cos(np.pi * (ep - 1) / max(1, epochs - 1))))
        for s in range(0, n, batch_size):
            idx = perm[s:s + batch_size]
            Xb = Xtr[idx]
            if noise_std > 0:
                Xb = Xb + rng.normal(0.0, noise_std, Xb.shape).astype(np.float32)
            yb = ytr[idx]
            wb = wtr[idx]
            acts, logits = net.forward(Xb, keep=True)
            probs = softmax(logits)
            dz = probs
            dz[np.arange(len(yb)), yb] -= 1.0
            dz *= wb[:, None] / float(max(1e-6, np.sum(wb)))

            grads_W = [None] * len(net.W)
            grads_b = [None] * len(net.b)
            dh = dz
            for l in range(len(net.W) - 1, -1, -1):
                grads_W[l] = acts[l].T @ dh + l2 * net.W[l]
                grads_b[l] = dh.sum(axis=0)
                if l > 0:
                    dh = (dh @ net.W[l].T) * (acts[l] > 0.0)

            t += 1
            bc1 = 1.0 - 0.9 ** t
            bc2 = 1.0 - 0.999 ** t
            for pi, (p, g) in enumerate(zip(params(), grads_W + grads_b)):
                m[pi] = 0.9 * m[pi] + 0.1 * g
                v[pi] = 0.999 * v[pi] + 0.001 * (g * g)
                p -= (lr_ep * (m[pi] / bc1) / (np.sqrt(v[pi] / bc2) + 1e-8)).astype(np.float32)

        _, va_logits = net.forward(Xva, keep=False)
        va_conf = confusion(yva, va_logits.argmax(axis=1), k)
        va_mf1 = metrics_from_conf(va_conf, labels)["macroF1"]
        if va_mf1 > best[0]:
            best = (va_mf1, net.clone_weights(), ep)

    net.load_weights(*best[1])
    elapsed = round(time.perf_counter() - t0, 2)
    return net, best[0], best[2], elapsed


def calibrate_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    best_t, best_nll = 1.0, float("inf")
    n = len(y)
    for T in np.linspace(0.45, 4.0, 143):
        p = softmax(logits / T)
        nll = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if nll < best_nll:
            best_nll, best_t = nll, float(T)
    for T in np.linspace(max(0.35, best_t - 0.08), best_t + 0.08, 65):
        p = softmax(logits / T)
        nll = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if nll < best_nll:
            best_nll, best_t = nll, float(T)
    return round(best_t, 4)


def export_model(
    out_dir: str,
    net: DenseNet,
    name: str,
    version: str,
    provenance: str,
    labels: list[str],
    feat_names: list[str],
    mean: np.ndarray,
    std: np.ndarray,
    temp: float,
) -> tuple[dict, dict]:
    doc = {
        "name": name,
        "version": version,
        "license_provenance": provenance,
        "labels": labels,
        "feature_names": feat_names,
        "mean": [round(float(x), 6) for x in mean],
        "std": [round(float(x), 6) for x in std],
        "temperature": temp,
        "layers": [
            {
                "W": [[round(float(v), 6) for v in row] for row in W],
                "b": [round(float(v), 6) for v in b],
            }
            for W, b in zip(net.W, net.b)
        ],
    }
    raw = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    out_path = os.path.join(out_dir, f"{name}.json")
    with open(out_path, "wb") as f:
        f.write(raw)
    sha = hashlib.sha256(raw).hexdigest()
    return doc, {"path": out_path, "bytes": len(raw), "sha256": sha}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--derived-dir", required=True)
    ap.add_argument("--prefix", required=True, help="Feature prefix e.g. r19_feat or r18_ablation_feat")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--model-tag", default="r19")
    ap.add_argument("--provenance", default="HandGesture-5G (CC BY 4.0) + IPN HandS (CC BY 4.0) + Natural RGB v3 (CC BY 4.0)")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    tr_m, Xtr_raw, ytr = load_split(args.derived_dir, args.prefix, "train")
    va_m, Xva_raw, yva = load_split(args.derived_dir, args.prefix, "val")
    te_m, Xte_raw, yte = load_split(args.derived_dir, args.prefix, "test")

    labels = list(tr_m["labels"])
    feat_names = list(tr_m["feature_names"])
    k = len(labels)

    mean = Xtr_raw.mean(axis=0)
    std = np.where(Xtr_raw.std(axis=0) > 1e-5, Xtr_raw.std(axis=0), 1.0).astype(np.float32)

    Xtr = (Xtr_raw - mean) / std
    Xva = (Xva_raw - mean) / std
    Xte = (Xte_raw - mean) / std

    counts = np.bincount(ytr, minlength=k).astype(np.float32)
    cw_cls = (1.0 / np.sqrt(np.maximum(counts, 1.0)))
    cw_cls = cw_cls / cw_cls.mean()
    sample_w = cw_cls[ytr]
    if "sample_weights" in tr_m and len(tr_m["sample_weights"]) == len(ytr):
        extra_w = np.asarray(tr_m["sample_weights"], dtype=np.float32)
        sample_w = sample_w * extra_w

    configs = [
        {"name": "lr_l2_3e4", "hidden": [], "l2": 3e-4, "lr": 6e-3, "epochs": 35, "noise": 0.0},
        {"name": "mlp_48_24_n02", "hidden": [48, 24], "l2": 3e-4, "lr": 3e-3, "epochs": 40, "noise": 0.02},
        {"name": "mlp_64_32_n02", "hidden": [64, 32], "l2": 3e-4, "lr": 3e-3, "epochs": 42, "noise": 0.025},
        {"name": "mlp_96_48_n03", "hidden": [96, 48], "l2": 4e-4, "lr": 2.5e-3, "epochs": 45, "noise": 0.03},
        {"name": "mlp_96_48_l2_1e3", "hidden": [96, 48], "l2": 1e-3, "lr": 2.5e-3, "epochs": 45, "noise": 0.035},
    ]

    sweep = []
    lr_net = None
    best_mlp = None
    for i, c in enumerate(configs):
        net, _, best_ep, secs = fit_model(
            Xtr, ytr, sample_w, Xva, yva, labels, c["hidden"], c["l2"], c["lr"], c["epochs"], c["noise"], SEED + i
        )
        _, va_logits = net.forward(Xva, keep=False)
        probs_uncal = softmax(va_logits)
        nll0, ece0 = nll_and_ece(probs_uncal, yva)
        T = calibrate_temperature(va_logits, yva)
        probs_cal = softmax(va_logits / T)
        nll1, ece1 = nll_and_ece(probs_cal, yva)
        m_val = metrics_from_conf(confusion(yva, va_logits.argmax(1), k), labels)
        row = {
            **c,
            "val_macroF1": m_val["macroF1"],
            "val_acc": m_val["acc"],
            "best_epoch": best_ep,
            "seconds": secs,
            "temp": T,
            "val_nll_before_after": [nll0, nll1],
            "val_ece_before_after": [ece0, ece1],
            "val_perClass": m_val["perClass"],
            "val_confusion": m_val["confusion"],
        }
        sweep.append(row)
        print(f"[{args.model_tag}:{c['name']}] val_macroF1={m_val['macroF1']} val_acc={m_val['acc']} ep={best_ep} T={T} ECE={ece0}->{ece1}", flush=True)
        if not c["hidden"]:
            lr_net = (net, T, row)
        elif best_mlp is None or m_val["macroF1"] > best_mlp[2]["val_macroF1"]:
            best_mlp = (net, T, row)

    _, lr_meta = export_model(
        args.out_dir, lr_net[0], f"{args.model_tag}_model_lr", f"{args.model_tag}-p3", args.provenance, labels, feat_names, mean, std, lr_net[1]
    )
    _, mlp_meta = export_model(
        args.out_dir, best_mlp[0], f"{args.model_tag}_model_mlp", f"{args.model_tag}-p3", args.provenance, labels, feat_names, mean, std, best_mlp[1]
    )

    def eval_split(net: DenseNet, T: float, Xsp: np.ndarray, ysp: np.ndarray):
        _, lg = net.forward(Xsp, keep=False)
        p0 = softmax(lg)
        p1 = softmax(lg / T)
        m = metrics_from_conf(confusion(ysp, lg.argmax(1), k), labels)
        nll0, ece0 = nll_and_ece(p0, ysp)
        nll1, ece1 = nll_and_ece(p1, ysp)
        return {**m, "nll_uncal": nll0, "nll_cal": nll1, "ece_uncal": ece0, "ece_cal": ece1}, p1

    test_lr, _ = eval_split(lr_net[0], lr_net[1], Xte, yte)
    test_mlp, p1_mlp = eval_split(best_mlp[0], best_mlp[1], Xte, yte)

    rng = np.random.default_rng(SEED)
    pidx = rng.choice(len(Xte_raw), size=min(150, len(Xte_raw)), replace=False)
    parity = [
        {"X": [float(v) for v in Xte_raw[j]], "y": int(yte[j]), "probs": [float(p) for p in p1_mlp[j]]}
        for j in pidx
    ]
    with open(os.path.join(args.out_dir, f"{args.model_tag}_parity_rows.json"), "w", encoding="utf-8") as f:
        json.dump(parity, f)

    report = {
        "model_tag": args.model_tag,
        "feature_prefix": args.prefix,
        "feature_count": int(Xtr_raw.shape[1]),
        "labels": labels,
        "split_rows": {"train": int(len(ytr)), "val": int(len(yva)), "test": int(len(yte))},
        "train_class_counts": {labels[i]: int(counts[i]) for i in range(k)},
        "val_sweep": sweep,
        "selected_mlp": best_mlp[2]["name"],
        "exported_artifacts": {"lr": lr_meta, "mlp": mlp_meta},
        "test_locked": {"lr": test_lr, "mlp": test_mlp},
    }
    with open(os.path.join(args.out_dir, f"{args.model_tag}_training_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\n=== [{args.model_tag}] LOCKED TEST ({best_mlp[2]['name']}) ===", flush=True)
    print("LR  test acc:", test_lr["acc"], "macroF1:", test_lr["macroF1"], "bytes:", lr_meta["bytes"])
    print("MLP test acc:", test_mlp["acc"], "macroF1:", test_mlp["macroF1"], "ECE:", test_mlp["ece_cal"], "bytes:", mlp_meta["bytes"])


if __name__ == "__main__":
    main()
