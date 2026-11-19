#!/usr/bin/env python3
"""R20 GPU trainer for the compact gesture classifier (candidates C1/C2/C3/C4/C6/C7).

- Features come from the FROZEN R19 82-dim TS tracker (extract_r20_features.ts).
- z-score stats, class weights, sampling, augmentation: TRAIN only.
- Architecture / seed / threshold selection and temperature: VAL only.
- Locked TEST is scored once for the final selected model per candidate (and never used for selection).
- Also trains a linear Logistic Regression (`[82 -> 3]`) comparator per §5.
- Optional knowledge distillation (C7): `--teacher-logits NPY` holds teacher logits aligned to TRAIN rows,
  with `--teacher-mask NPY` optional mask for rows where RGB teacher crop exists.
- Exports the SAME JSON schema as R19 (`R19Classifier` in TS loads it directly) plus compact f32 & int8 binaries.
"""
from __future__ import annotations

import argparse
import json
import os
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

from r20_lib import (
    FEAT_DIR, LABELS, OTHER, PRESS, READY, forward_exported, load_split, metrics, nll_ece, sha256_file,
    slice_metrics, softmax,
)


class MLP(nn.Module):
    def __init__(self, d_in: int, hidden: list[int], k: int = 3, dropout: float = 0.0):
        super().__init__()
        self.hidden = list(hidden)
        dims = [d_in] + list(hidden) + [k]
        self.lins = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])
        self.dropout = dropout
        for i, l in enumerate(self.lins):
            if i < len(self.lins) - 1:
                nn.init.kaiming_normal_(l.weight, nonlinearity="relu")
            else:
                nn.init.xavier_normal_(l.weight)
            nn.init.zeros_(l.bias)

    def forward(self, x):
        for i, l in enumerate(self.lins):
            x = l(x)
            if i < len(self.lins) - 1:
                x = F.relu(x)
                if self.dropout > 0 and self.training:
                    x = F.dropout(x, p=self.dropout, training=True)
        return x


def build_weights(ytr: np.ndarray, sources: list[str], sw: np.ndarray, mode: str, groups: list[str]) -> np.ndarray:
    """Per-row loss weights (TRAIN only) with capped class balancing and source-aware hard-negative emphasis."""
    k = 3
    counts = np.bincount(ytr, minlength=k).astype(np.float64)
    if mode == "r19":
        cw = 1.0 / np.sqrt(np.maximum(counts, 1.0))
        cw = cw / cw.mean()
        return (cw[ytr] * sw).astype(np.float32)
    if mode == "bal":
        # Capped inverse power class weight + lighting/hard-negative source boost
        cw = 1.0 / np.power(np.maximum(counts, 1.0), 0.52)
        # Cap positive-to-OTHER ratio at 14.0 so OTHER safety boundary remains rock-solid
        max_other_ratio = 14.0
        cw[READY] = min(cw[READY], cw[OTHER] * max_other_ratio)
        cw[PRESS] = min(cw[PRESS], cw[OTHER] * max_other_ratio)
        cw = cw / cw.mean()

        w = cw[ytr] * sw.astype(np.float64)
        for i, s in enumerate(sources):
            if ytr[i] == OTHER:
                if s in ("n66_dim", "n66_backlit", "n66_green_led", "n66_red_led"):
                    w[i] *= 1.35
                elif s.startswith(("hrgbd_", "bxr7_")):
                    w[i] *= 1.40
                elif s.startswith("hg5g_"):
                    w[i] *= 1.20
            else:
                if s.startswith("hg5g_aug_") or s == "hg5g_l1_clahe":
                    w[i] *= 1.15
        w = w / w.mean()
        return w.astype(np.float32)
    raise ValueError(mode)


def val_Composite_score(m: dict, max_fp_press: int) -> tuple[int, float, float, int]:
    """Lexicographic VAL tuple (higher is better):
    1. Meets hard safety constraint other_to_press <= max_fp_press AND ready_to_press == 0
    2. Meets other_to_press <= max_fp_press
    3. Macro-F1
    4. 0.5 * (F1_READY + F1_PRESS)
    5. Negative other_to_ready (fewer false READY)
    """
    fp = m["other_to_press"]
    r2p = m["ready_to_press"]
    tier = 2 if (fp <= max_fp_press and r2p == 0) else (1 if fp <= max_fp_press else 0)
    return (tier, round(m["macroF1"], 4), round(0.5 * (m["f1_ready"] + m["f1_press"]), 4), -m["other_to_ready"])


def fit(
    Xtr, ytr, wtr, Xva, yva, hidden, l2, lr, epochs, noise, seed, device, loss, focal_gamma, bs,
    max_fp_press: int = 2, teacher=None, teacher_mask=None, kd_lambda=0.0, kd_T=2.0,
):
    torch.manual_seed(seed)
    np.random.seed(seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(seed)
    net = MLP(Xtr.shape[1], hidden).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=l2)
    Xt = torch.from_numpy(Xtr).to(device)
    yt = torch.from_numpy(ytr).to(device)
    wt = torch.from_numpy(wtr).to(device)
    Xv = torch.from_numpy(Xva).to(device)
    tl = torch.from_numpy(teacher).to(device) if teacher is not None else None
    tm = torch.from_numpy(teacher_mask.astype(np.float32)).to(device) if teacher_mask is not None else None
    g = torch.Generator(device="cpu").manual_seed(seed)
    best_key = (-1, -1.0, -1.0, -999999)
    best_state = None
    best_ep = 0
    n = len(Xt)

    for ep in range(1, epochs + 1):
        net.train()
        perm = torch.randperm(n, generator=g).to(device)
        lr_ep = lr * (0.10 + 0.90 * 0.5 * (1.0 + np.cos(np.pi * (ep - 1) / max(1, epochs - 1))))
        for pg in opt.param_groups:
            pg["lr"] = lr_ep
        for s in range(0, n, bs):
            idx = perm[s : s + bs]
            xb = Xt[idx]
            if noise > 0:
                xb = xb + noise * torch.randn_like(xb)
            logits = net(xb)
            ce = F.cross_entropy(logits, yt[idx], reduction="none")
            if loss == "focal":
                pt = torch.exp(-ce)
                ce = ((1.0 - pt) ** focal_gamma) * ce
            wb = wt[idx]
            l = (ce * wb).sum() / wb.sum().clamp_min(1e-6)
            if tl is not None and kd_lambda > 0:
                kd = F.kl_div(
                    F.log_softmax(logits / kd_T, dim=1),
                    F.softmax(tl[idx] / kd_T, dim=1),
                    reduction="none",
                ).sum(dim=1)
                if tm is not None:
                    kd_w = wb * tm[idx]
                else:
                    kd_w = wb
                if kd_w.sum() > 1e-6:
                    l = l + kd_lambda * (kd_T ** 2) * (kd * kd_w).sum() / kd_w.sum().clamp_min(1e-6)
            opt.zero_grad(set_to_none=True)
            l.backward()
            opt.step()

        net.eval()
        with torch.no_grad():
            lv = net(Xv).cpu().numpy()
        m = metrics(yva, lv.argmax(1))
        key = val_Composite_score(m, max_fp_press)
        if key > best_key:
            best_key = key
            best_state = {k_: v.detach().cpu().clone() for k_, v in net.state_dict().items()}
            best_ep = ep

    net.load_state_dict(best_state)
    return net.cpu().eval(), best_ep


def calibrate_T(logits: np.ndarray, y: np.ndarray) -> float:
    n = len(y)
    best_t, best = 1.0, 1e9
    for T in np.linspace(0.45, 4.0, 143):
        p = softmax(logits / T)
        v = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if v < best:
            best, best_t = v, float(T)
    for T in np.linspace(max(0.35, best_t - 0.08), best_t + 0.08, 65):
        p = softmax(logits / T)
        v = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if v < best:
            best, best_t = v, float(T)
    return round(best_t, 4)


def export(net: MLP, out_path: str, name: str, version: str, prov: str, feat_names, mean, std, T) -> dict:
    layers = []
    for l in net.lins:
        W = l.weight.detach().numpy().T  # [in,out]
        b = l.bias.detach().numpy()
        layers.append({"W": [[round(float(v), 6) for v in row] for row in W], "b": [round(float(v), 6) for v in b]})
    doc = {
        "name": name, "version": version, "license_provenance": prov, "labels": LABELS,
        "feature_names": feat_names, "mean": [round(float(x), 6) for x in mean],
        "std": [round(float(x), 6) for x in std], "temperature": T, "layers": layers,
    }
    raw = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    with open(out_path, "wb") as f:
        f.write(raw)
    # S0 compact f32 binary: [mean(82) std(82) T(1) then per layer W(in*out) b(out)] little-endian
    chunks = [np.asarray(doc["mean"], np.float32), np.asarray(doc["std"], np.float32), np.asarray([T], np.float32)]
    for l in layers:
        chunks += [np.asarray(l["W"], np.float32).ravel(), np.asarray(l["b"], np.float32)]
    binp = out_path.replace(".json", ".f32")
    np.concatenate(chunks).astype("<f4").tofile(binp)

    # S1 per-channel INT8 quantized weights + float32 scales & biases
    int8_layers = []
    int8_bytes_count = 82 * 4 * 2 + 4  # mean + std + T in f32
    for l in layers:
        W_arr = np.asarray(l["W"], dtype=np.float32)  # [in, out]
        b_arr = np.asarray(l["b"], dtype=np.float32)
        max_abs = np.maximum(np.max(np.abs(W_arr), axis=0), 1e-6)  # per-output-channel scale
        scales = (max_abs / 127.0).astype(np.float32)
        W_q = np.clip(np.rint(W_arr / scales[None, :]), -127, 127).astype(np.int8)
        int8_layers.append({
            "W_q": W_q.tolist(),
            "scales": [round(float(s), 7) for s in scales],
            "b": [round(float(v), 6) for v in b_arr],
        })
        int8_bytes_count += W_q.size + scales.size * 4 + b_arr.size * 4
    int8_doc = {
        "name": f"{name}_int8",
        "version": version,
        "quantization": "S1_per_channel_int8_weights_fp32_activations",
        "license_provenance": prov,
        "labels": LABELS,
        "feature_names": feat_names,
        "mean": doc["mean"],
        "std": doc["std"],
        "temperature": T,
        "layers": int8_layers,
        "packed_binary_bytes": int8_bytes_count,
    }
    int8_path = out_path.replace(".json", "_int8.json")
    with open(int8_path, "wb") as f:
        f.write(json.dumps(int8_doc, separators=(",", ":")).encode("utf-8"))

    return {
        "json": out_path,
        "json_bytes": len(raw),
        "json_sha256": sha256_file(out_path),
        "f32_path": binp,
        "f32_bytes": os.path.getsize(binp),
        "f32_sha256": sha256_file(binp),
        "int8_json_path": int8_path,
        "int8_json_bytes": os.path.getsize(int8_path),
        "int8_packed_bytes": int8_bytes_count,
        "int8_sha256": sha256_file(int8_path),
        "doc": doc,
        "int8_doc": int8_doc,
    }


def forward_int8_exported(int8_doc: dict, X: np.ndarray) -> np.ndarray:
    mean = np.asarray(int8_doc["mean"], dtype=np.float64)
    std = np.asarray(int8_doc["std"], dtype=np.float64)
    std = np.where(std > 1e-6, std, 1.0)
    h = (X.astype(np.float64) - mean) / std
    layers = int8_doc["layers"]
    for i, l in enumerate(layers):
        W_deq = np.asarray(l["W_q"], dtype=np.float64) * np.asarray(l["scales"], dtype=np.float64)[None, :]
        h = h @ W_deq + np.asarray(l["b"], dtype=np.float64)
        if i < len(layers) - 1:
            h = np.maximum(h, 0.0)
    return h / float(int8_doc.get("temperature", 1.0))


def parse_archs(spec: str) -> list[list[int]]:
    out = []
    for part in spec.split(";"):
        part = part.strip()
        if part in ("", "lr", "LR", "0"):
            out.append([])
        else:
            out.append([int(v) for v in part.split(",")])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--feat-dir", default=FEAT_DIR)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--tag", required=True, help="candidate id e.g. c1_balanced")
    ap.add_argument("--device", default="cuda:0")
    ap.add_argument("--weights", default="bal", choices=["r19", "bal"])
    ap.add_argument("--archs", default="lr;48,24;64,32;96,48")
    ap.add_argument("--seeds", default="20261119,20261120,20261121")
    ap.add_argument("--noise", default="0.0,0.025,0.04")
    ap.add_argument("--loss", default="ce", choices=["ce", "focal"])
    ap.add_argument("--epochs", type=int, default=55)
    ap.add_argument("--lr", type=float, default=2.8e-3)
    ap.add_argument("--l2", type=float, default=5e-4)
    ap.add_argument("--bs", type=int, default=512)
    ap.add_argument("--max-val-fp-press", type=int, default=None)
    ap.add_argument("--teacher-logits", default=None)
    ap.add_argument("--teacher-mask", default=None)
    ap.add_argument("--kd-lambda", type=float, default=0.0)
    ap.add_argument("--kd-T", type=float, default=2.0)
    ap.add_argument("--provenance", default="HandGesture-5G + IPN HandS + Natural RGB v3 (CC BY 4.0)")
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    dev = torch.device(a.device if torch.cuda.is_available() else "cpu")
    gpu = {
        "device": str(dev),
        "name": torch.cuda.get_device_name(dev) if dev.type == "cuda" else "cpu",
        "device_count": torch.cuda.device_count() if dev.type == "cuda" else 0,
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
    }
    t_all = time.time()

    trm, Xtr_raw, ytr = load_split(a.feat_dir, a.prefix, "train")
    vam, Xva_raw, yva = load_split(a.feat_dir, a.prefix, "val")
    tem, Xte_raw, yte = load_split(a.feat_dir, a.prefix, "test")
    mean = Xtr_raw.mean(0)
    std = np.where(Xtr_raw.std(0) > 1e-5, Xtr_raw.std(0), 1.0).astype(np.float32)
    Xtr, Xva, Xte = [((x - mean) / std).astype(np.float32) for x in (Xtr_raw, Xva_raw, Xte_raw)]
    sw = np.asarray(trm["sample_weights"], np.float32)
    wtr = build_weights(ytr, trm["sources"], sw, a.weights, trm["groups"])
    teacher = np.load(a.teacher_logits).astype(np.float32) if a.teacher_logits else None
    teacher_mask = np.load(a.teacher_mask).astype(np.float32) if a.teacher_mask else None
    if teacher is not None:
        assert len(teacher) == len(ytr), f"teacher logits len {len(teacher)} != train len {len(ytr)}"

    c0 = json.load(open(f"{os.environ.get('R20_REPO', '/srv/sketchbook/mediapipe-optimize/research-can')}/r19/models/r19_model_mlp.json"))
    c0_val = metrics(yva, forward_exported(c0, Xva_raw).argmax(1))
    max_fp = a.max_val_fp_press if a.max_val_fp_press is not None else int(c0_val["other_to_press"])

    archs = parse_archs(a.archs)
    seeds = [int(s) for s in a.seeds.split(",")]
    noises = [float(s) for s in a.noise.split(",")]
    runs = []
    lr_runs = []
    for h in archs:
        nz_list = [0.0] if len(h) == 0 else noises
        for nz in nz_list:
            for sd in seeds:
                t0 = time.time()
                net, ep = fit(
                    Xtr, ytr, wtr, Xva, yva, h, a.l2, a.lr if h else 5e-3, a.epochs, nz, sd, dev,
                    a.loss, 2.0, a.bs, max_fp, teacher, teacher_mask, a.kd_lambda, a.kd_T,
                )
                with torch.no_grad():
                    lv = net(torch.from_numpy(Xva)).numpy()
                T = calibrate_T(lv, yva)
                m = metrics(yva, lv.argmax(1))
                nll, ece = nll_ece(softmax(lv / T), yva)
                comp = val_Composite_score(m, max_fp)
                row = {
                    "hidden": h,
                    "noise": nz,
                    "seed": sd,
                    "best_epoch": ep,
                    "secs": round(time.time() - t0, 2),
                    "T": T,
                    "val": m,
                    "val_nll": nll,
                    "val_ece": ece,
                    "val_score": round(0.5 * (m["f1_ready"] + m["f1_press"]), 4),
                    "composite_key": list(comp),
                    "ok_fp": bool(m["other_to_press"] <= max_fp),
                }
                if len(h) == 0:
                    lr_runs.append((row, net))
                else:
                    runs.append((row, net))
                print(
                    f"[{a.tag}] h={h} nz={nz} s={sd} ep={ep} valMacroF1={m['macroF1']} "
                    f"F1(R,P)=({m['f1_ready']},{m['f1_press']}) fp_press={m['other_to_press']} "
                    f"r2p={m['ready_to_press']} T={T} {row['secs']}s",
                    flush=True,
                )

    sel_row, sel_net = sorted(
        runs,
        key=lambda r: (tuple(r[0]["composite_key"]), -r[0]["val_nll"]),
        reverse=True,
    )[0]
    T = sel_row["T"]
    name = f"r20_{a.tag}"
    exp = export(sel_net, os.path.join(a.out_dir, f"{name}.json"), name, f"r20-{a.tag}", a.provenance, trm["feature_names"], mean, std, T)

    lr_test_metrics = None
    if lr_runs:
        lr_row, lr_net = sorted(lr_runs, key=lambda r: (r[0]["val"]["macroF1"], -r[0]["val_nll"]), reverse=True)[0]
        lr_exp = export(lr_net, os.path.join(a.out_dir, f"{name}_lr.json"), f"{name}_lr", f"r20-{a.tag}-lr", a.provenance, trm["feature_names"], mean, std, lr_row["T"])
        lr_lte = forward_exported(lr_exp["doc"], Xte_raw)
        lr_test_metrics = {
            "val": lr_row["val"],
            "test_locked": metrics(yte, lr_lte.argmax(1)),
            "bytes": lr_exp["json_bytes"],
            "sha256": lr_exp["json_sha256"],
        }

    # Evaluate EXPORTED (rounded) FP32 and INT8 models in float64
    lte = forward_exported(exp["doc"], Xte_raw)
    lva = forward_exported(exp["doc"], Xva_raw)
    test = metrics(yte, lte.argmax(1))
    pte = softmax(lte)
    test["nll"], test["ece"] = nll_ece(pte, yte)
    val = metrics(yva, lva.argmax(1))

    lte_int8 = forward_int8_exported(exp["int8_doc"], Xte_raw)
    test_int8 = metrics(yte, lte_int8.argmax(1))
    int8_argmax_mismatch = int(np.sum(lte.argmax(1) != lte_int8.argmax(1)))

    c0_test = metrics(yte, forward_exported(c0, Xte_raw).argmax(1))
    rep = {
        "tag": a.tag,
        "prefix": a.prefix,
        "gpu": gpu,
        "weights": a.weights,
        "loss": a.loss,
        "kd": {"lambda": a.kd_lambda, "T": a.kd_T, "teacher": a.teacher_logits},
        "rows": {"train": len(ytr), "val": len(yva), "test": len(yte)},
        "train_class_counts": np.bincount(ytr, minlength=3).tolist(),
        "train_source_counts": trm["source_counts"],
        "c0_val": c0_val,
        "val_fp_press_max": max_fp,
        "selected": {k: sel_row[k] for k in ("hidden", "noise", "seed", "best_epoch", "T", "val_nll", "val_ece", "composite_key")},
        "sweep": [r[0] for r in (lr_runs + runs)],
        "lr_comparator": lr_test_metrics,
        "val_exported": val,
        "test_locked_exported": test,
        "test_locked_int8_ptq": {**test_int8, "argmax_mismatch_vs_fp32": int8_argmax_mismatch},
        "c0_test_locked": c0_test,
        "test_slices_by_source": slice_metrics(yte, lte.argmax(1), tem["sources"]),
        "c0_test_slices_by_source": slice_metrics(yte, forward_exported(c0, Xte_raw).argmax(1), tem["sources"]),
        "artifact": {k: v for k, v in exp.items() if k not in ("doc", "int8_doc")},
        "wall_seconds": round(time.time() - t_all, 1),
        "peak_vram_mb": round(torch.cuda.max_memory_allocated(dev) / 2**20, 2) if dev.type == "cuda" else 0,
    }
    # parity rows (VAL+TEST, 160) for TS parity test
    rng = np.random.default_rng(20261119)
    Xpar = np.concatenate([Xva_raw, Xte_raw])
    ypar = np.concatenate([yva, yte])
    idx = rng.choice(len(Xpar), size=160, replace=False)
    lg = forward_exported(exp["doc"], Xpar[idx])
    json.dump(
        [{"X": [float(v) for v in Xpar[i]], "y": int(ypar[i]), "probs": [float(p) for p in softmax(lg)[j]]} for j, i in enumerate(idx)],
        open(os.path.join(a.out_dir, f"{name}_parity_rows.json"), "w"),
    )
    json.dump(rep, open(os.path.join(a.out_dir, f"{name}_training_metrics.json"), "w"), indent=2)
    print(
        f"\n=== {a.tag}: SELECTED {sel_row['hidden']} nz={sel_row['noise']} seed={sel_row['seed']} "
        f"ep={sel_row['best_epoch']} T={T} json={exp['json_bytes']}B f32={exp['f32_bytes']}B int8_packed={exp['int8_packed_bytes']}B ==="
    )
    print("VAL  :", {k: val[k] for k in ("macroF1", "f1_ready", "f1_press", "other_to_press", "ready_to_press")}, "| C0:", {k: c0_val[k] for k in ("macroF1", "f1_ready", "f1_press", "other_to_press", "ready_to_press")})
    print("TEST :", {k: test[k] for k in ("macroF1", "f1_ready", "f1_press", "recall_press", "other_to_press", "ready_to_press")}, "| C0:", {k: c0_test[k] for k in ("macroF1", "f1_ready", "f1_press", "recall_press", "other_to_press", "ready_to_press")})
    print("INT8 :", {k: test_int8[k] for k in ("macroF1", "f1_ready", "f1_press", "other_to_press")}, "mismatch_vs_fp32:", int8_argmax_mismatch)


if __name__ == "__main__":
    main()
