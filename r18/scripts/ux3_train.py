#!/usr/bin/env python3
"""R18-UX3 Lightweight Classifier Training (IPN HandS CC BY 4.0, person-disjoint splits).

- Trains compact Logistic Regression & ReLU MLPs in pure NumPy (Adam + cosine LR + L2)
- Zero leakage: standardization mean/std computed on TRAIN only; model selection & temperature scaling on VAL
- Scores LOCKED TEST once after selection; exports plain browser-ready JSON + parity vectors
"""
import hashlib
import json
import os
import time
import numpy as np

DERIVED = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/derived"
RESULTS = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results"
SEED = 20261117


def load_split(name: str):
    meta = json.load(open(os.path.join(DERIVED, f"ux3_feat_{name}.meta.json")))
    d = meta["feature_count"]
    X = np.fromfile(os.path.join(DERIVED, f"ux3_feat_{name}.f32"), dtype=np.float32).reshape(-1, d)
    y = np.asarray(meta["y"], dtype=np.int64)
    assert X.shape[0] == y.shape[0] == meta["rows"]
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
    f1 = np.where((prec + rec) > 0, 2 * prec * rec / (prec + rec), 0.0)
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
            rng.normal(0.0, np.sqrt(2.0 / dims[i]), (dims[i], dims[i + 1])).astype(np.float32)
            for i in range(len(dims) - 1)
        ]
        self.b = [np.zeros(dims[i + 1], dtype=np.float32) for i in range(len(dims) - 1)]

    def clone_weights(self):
        return [w.copy() for w in self.W], [b.copy() for b in self.b]

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
    Xtr: np.ndarray, ytr: np.ndarray, Xva: np.ndarray, yva: np.ndarray,
    labels: list[str], hidden: list[int], l2: float, lr: float, epochs: int,
    cw: np.ndarray, noise_std: float, seed: int,
):
    rng = np.random.default_rng(seed)
    k = len(labels)
    net = DenseNet(Xtr.shape[1], hidden, k, rng)
    params = lambda: net.W + net.b
    m = [np.zeros_like(p) for p in params()]
    v = [np.zeros_like(p) for p in params()]
    t = 0
    bs = 1024
    n = len(Xtr)
    best = (-1.0, None, 0)
    t0 = time.perf_counter()

    for ep in range(1, epochs + 1):
        perm = rng.permutation(n)
        # Cosine annealing down to 15% of lr
        lr_ep = lr * (0.15 + 0.85 * 0.5 * (1.0 + np.cos(np.pi * (ep - 1) / max(1, epochs - 1))))
        for s in range(0, n, bs):
            idx = perm[s:s + bs]
            Xb = Xtr[idx]
            if noise_std > 0:
                Xb = Xb + rng.normal(0.0, noise_std, Xb.shape).astype(np.float32)
            yb = ytr[idx]
            wb = cw[yb]
            acts, logits = net.forward(Xb, keep=True)
            probs = softmax(logits)
            dz = probs
            dz[np.arange(len(yb)), yb] -= 1.0
            dz *= (wb[:, None] / float(np.sum(wb)))

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
        va_pred = va_logits.argmax(axis=1)
        va_conf = confusion(yva, va_pred, k)
        va_mf1 = metrics_from_conf(va_conf, labels)["macroF1"]
        if va_mf1 > best[0]:
            best = (va_mf1, net.clone_weights(), ep)

    net.load_weights(*best[1])
    elapsed = round(time.perf_counter() - t0, 2)
    return net, best[0], best[2], elapsed


def calibrate_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    best_t, best_nll = 1.0, float("inf")
    n = len(y)
    # Coarse grid then fine grid over [0.5, 4.0]
    for T in np.linspace(0.5, 4.0, 141):
        p = softmax(logits / T)
        nll = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if nll < best_nll:
            best_nll, best_t = nll, float(T)
    for T in np.linspace(max(0.4, best_t - 0.08), best_t + 0.08, 65):
        p = softmax(logits / T)
        nll = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if nll < best_nll:
            best_nll, best_t = nll, float(T)
    return round(best_t, 4)


def export_model(net: DenseNet, name: str, labels: list[str], feat_names: list[str], mean: np.ndarray, std: np.ndarray, temp: float) -> tuple[dict, str]:
    doc = {
        "name": name,
        "version": "r18-ux3-v1",
        "license_provenance": "IPN HandS (CC BY 4.0), person-disjoint 19-subject train split",
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
    raw = json.dumps(doc).encode("utf-8")
    out_path = os.path.join(RESULTS, f"{name}.json")
    with open(out_path, "wb") as f:
        f.write(raw)
    sha = hashlib.sha256(raw).hexdigest()
    return doc, {"path": out_path, "bytes": len(raw), "sha256": sha}


def main() -> None:
    tr_m, Xtr_raw, ytr = load_split("train")
    va_m, Xva_raw, yva = load_split("val")
    te_m, Xte_raw, yte = load_split("test")

    pt = set(tr_m["persons"])
    pv = set(va_m["persons"])
    pe = set(te_m["persons"])
    assert not (pt & pv) and not (pt & pe) and not (pv & pe), "Person leak!"
    labels = tr_m["labels"]
    feat_names = tr_m["feature_names"]
    k = len(labels)

    mean = Xtr_raw.mean(axis=0)
    std = Xtr_raw.std(axis=0)
    std = np.where(std > 1e-5, std, 1.0).astype(np.float32)

    Xtr = (Xtr_raw - mean) / std
    Xva = (Xva_raw - mean) / std
    Xte = (Xte_raw - mean) / std

    # Inverse-sqrt frequency weighting (caps extreme imbalance cleanly)
    counts = np.bincount(ytr, minlength=k).astype(np.float32)
    cw_sqrt = 1.0 / np.sqrt(np.maximum(counts, 1.0))
    cw_sqrt = cw_sqrt / cw_sqrt.mean()

    configs = [
        {"name": "lr_l2_1e4", "hidden": [], "l2": 1e-4, "lr": 5e-3, "epochs": 24, "noise": 0.0},
        {"name": "mlp_64_32_n01", "hidden": [64, 32], "l2": 2e-4, "lr": 3e-3, "epochs": 26, "noise": 0.02},
        {"name": "mlp_96_48_n02", "hidden": [96, 48], "l2": 3e-4, "lr": 2.5e-3, "epochs": 28, "noise": 0.03},
        {"name": "mlp_96_48_l2_1e3", "hidden": [96, 48], "l2": 1e-3, "lr": 2.5e-3, "epochs": 28, "noise": 0.03},
    ]

    sweep = []
    lr_net = None
    best_mlp = None
    for i, c in enumerate(configs):
        net, best_mf1, best_ep, secs = fit_model(
            Xtr, ytr, Xva, yva, labels, c["hidden"], c["l2"], c["lr"], c["epochs"], cw_sqrt, c["noise"], SEED + i
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
        }
        sweep.append(row)
        print(f"[{c['name']}] val_macroF1={m_val['macroF1']} val_acc={m_val['acc']} ep={best_ep} ({secs}s) T={T} NLL={nll0}->{nll1} ECE={ece0}->{ece1}", flush=True)
        if not c["hidden"]:
            lr_net = (net, T, row)
        elif best_mlp is None or m_val["macroF1"] > best_mlp[2]["val_macroF1"]:
            best_mlp = (net, T, row)

    # Export LR baseline & best MLP, evaluate BOTH once on LOCKED TEST
    _, lr_meta = export_model(lr_net[0], "ux3_model_lr", labels, feat_names, mean, std, lr_net[1])
    _, mlp_meta = export_model(best_mlp[0], "ux3_model_mlp", labels, feat_names, mean, std, best_mlp[1])

    def eval_test(net, T):
        _, lg = net.forward(Xte, keep=False)
        p0 = softmax(lg)
        p1 = softmax(lg / T)
        m = metrics_from_conf(confusion(yte, lg.argmax(1), k), labels)
        nll0, ece0 = nll_and_ece(p0, yte)
        nll1, ece1 = nll_and_ece(p1, yte)
        return {**m, "nll_uncal": nll0, "nll_cal": nll1, "ece_uncal": ece0, "ece_cal": ece1}, p1

    test_lr, _ = eval_test(lr_net[0], lr_net[1])
    test_mlp, p1_mlp = eval_test(best_mlp[0], best_mlp[1])

    # Export 120 raw-feature test parity rows
    rng = np.random.default_rng(SEED)
    pidx = rng.choice(len(Xte_raw), size=min(120, len(Xte_raw)), replace=False)
    parity = [
        {"X": [float(v) for v in Xte_raw[j]], "y": int(yte[j]), "probs": [float(p) for p in p1_mlp[j]]}
        for j in pidx
    ]
    with open(os.path.join(RESULTS, "ux3_parity_rows.json"), "w") as f:
        json.dump(parity, f)

    report = {
        "split_disjoint_check": {
            "train_persons": len(pt), "val_persons": len(pv), "test_persons": len(pe),
            "overlap": 0,
            "train_rows": int(len(ytr)), "val_rows": int(len(yva)), "test_rows": int(len(yte)),
            "train_class_counts": {labels[i]: int(counts[i]) for i in range(k)},
        },
        "val_sweep": sweep,
        "selected_mlp": best_mlp[2]["name"],
        "exported_artifacts": {"lr": lr_meta, "mlp": mlp_meta},
        "test_locked": {"lr": test_lr, "mlp": test_mlp},
    }
    with open(os.path.join(RESULTS, "ux3_training_metrics.json"), "w") as f:
        json.dump(report, f, indent=2)
    print("\n=== LOCKED TEST (MLP winner:", best_mlp[2]["name"], ") ===")
    print("MLP test acc:", test_mlp["acc"], "macroF1:", test_mlp["macroF1"], "NLL:", test_mlp["nll_cal"], "ECE:", test_mlp["ece_cal"])
    print("Per class MLP:", json.dumps(test_mlp["perClass"], indent=2))


if __name__ == "__main__":
    main()
