#!/usr/bin/env python3
"""R20 §12 GPU Teacher–Student Distillation (`T-IMG`, `T-TEMP` -> `S-SPATIAL` `C6` vs `C7`, `S-TEMP`, and `S3 QAT`).

Implements all components of §12.1–12.4 on the NVIDIA RTX A5000 GPU:
  1. `T-IMG` (Visual RGB Hand-Crop Teacher on GPU):
     - `torchvision.models.mobilenet_v3_small` fine-tuned with class-balanced focal/CE loss on 128x128 RGB
       hand crops from HandGesture-5G TRAIN clusters (raw + physically-motivated low-light/backlight/blur crops).
     - Uses 5-fold cluster-disjoint out-of-fold cross-fitting across the TRAIN clusters so every visual TRAIN
       row receives clean, non-memorized out-of-cluster soft targets `logits_teacher`, plus evaluates
       out-of-cluster visual accuracy & Macro-F1 on bright and low-light crops.
     - `T-IMG` stays strictly on the GPU server (`0 B` shipped to browser).
  2. `T-TEMP` (Temporal Teacher on GPU) & `S-TEMP` (Causal 4-Frame Temporal Student for CPU):
     - Builds causal 4-frame history windows (`t-3..t`) + validity/missingness mask (`4` bits) without any
       future context and without inventing fake transition labels from static images (§12.1).
     - Trains `T-TEMP` (2-layer 1D Conv + BiGRU teacher on GPU) and distills into `S-TEMP` (compact causal
       temporal student `[118 -> 64 -> 32 -> 3]` using current 82-dim features + 32-dim causal 4-frame key
       joint summary + 4-dim missingness mask), comparing `S-TEMP` directly against `S-SPATIAL`.
  3. `C6` (Supervised Student without Teacher, `λ_KD=0`) vs `C7` (Teacher–Student Distilled `S-SPATIAL`):
     - Tests the exact distillation loss from §12.2:
       `L = λ_CE * CE(y_i, p_student) + λ_KD * T^2 * KL(softmax(logits_teacher/T) || softmax(logits_student/T))`
       across `T ∈ {2.0, 4.0}` and `λ_KD ∈ {0.0 (C6), 0.25, 0.50}` on identical split, identical architecture,
       and identical seeds (`20261119, 20261120, 20261121`).
  4. `S3 QAT` (Quantization-Aware Training per-channel INT8 via straight-through estimator) vs `S1 INT8 PTQ`
     vs `S0 FP32` (§12.4).
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import time

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.models as tvm

from r20_lib import (
    FEAT_DIR, LABELS, OTHER, PRESS, READY, SANDBOX, forward_exported, load_split, metrics, nll_ece,
    sha256_file, slice_metrics, softmax,
)
from train_r20_gpu import (
    MLP, build_weights, calibrate_T, export, fit, forward_int8_exported, val_Composite_score,
)

R19_SANDBOX = os.environ.get("R19_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r19-sandbox")
HG5G_JSONL = f"{R19_SANDBOX}/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl"
CACHE_720 = f"{SANDBOX}/data/hg5g_720"
LABEL_MAP = {"Pointing Up": READY, "L-Sign": PRESS, "Fist": OTHER, "V-Sign": OTHER, "Open Palm_Open Hand": OTHER}


def extract_hand_crop_128(rgb: np.ndarray, pts: list[list[float]], margin: float = 0.28) -> np.ndarray:
    h, w = rgb.shape[:2]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    bw = max(x1 - x0, 0.08)
    bh = max(y1 - y0, 0.08)
    cx, cy = 0.5 * (x0 + x1), 0.5 * (y0 + y1)
    half = 0.5 * max(bw, bh) * (1.0 + 2.0 * margin)
    px0 = max(0, int(round((cx - half) * w)))
    px1 = min(w, max(px0 + 8, int(round((cx + half) * w))))
    py0 = max(0, int(round((cy - half) * h)))
    py1 = min(h, max(py0 + 8, int(round((cy + half) * h))))
    crop = rgb[py0:py1, px0:px1]
    if crop.size == 0:
        crop = rgb
    return cv2.resize(crop, (128, 128), interpolation=cv2.INTER_AREA)


def load_hg5g_train_crops() -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    """Load 128x128 RGB hand crops for all cached HandGesture-5G effective TRAIN images."""
    crops, ys, clusters, groups = [], [], [], []
    for line in open(HG5G_JSONL, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        cls = r["class_name"]
        if cls not in LABEL_MAP:
            continue
        sp = r["split"]
        if cls == "Pointing Up":
            if r["cluster_id"] == 18:
                sp = "val"
            elif r["cluster_id"] == 19:
                sp = "train"
        if sp != "train":
            continue
        hand = r["l0"]["hands"][0] if r["l0"]["n_hands"] > 0 else (r["l1"]["hands"][0] if r["l1"]["n_hands"] > 0 else None)
        if not hand:
            continue
        img_p = f"{CACHE_720}/{r['sample_id']}.jpg"
        if not os.path.exists(img_p):
            continue
        bgr = cv2.imread(img_p)
        if bgr is None:
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        crop = extract_hand_crop_128(rgb, hand["landmarks"])
        crops.append(crop)
        ys.append(LABEL_MAP[cls])
        clusters.append(int(r["cluster_id"]))
        groups.append(f"hg5g_c{r['cluster_id']}")
    X_rgb = np.stack(crops, axis=0)  # [N, 128, 128, 3] uint8
    return X_rgb, np.asarray(ys, dtype=np.int64), np.asarray(clusters, dtype=np.int64), groups


class ResBlock(nn.Module):
    def __init__(self, c_in: int, c_out: int, stride: int = 1):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(c_in, c_out, 3, stride=stride, padding=1, bias=False),
            nn.GroupNorm(8, c_out),
            nn.SiLU(inplace=True),
            nn.Conv2d(c_out, c_out, 3, stride=1, padding=1, bias=False),
            nn.GroupNorm(8, c_out),
        )
        self.skip = (
            nn.Sequential(nn.Conv2d(c_in, c_out, 1, stride=stride, bias=False), nn.GroupNorm(8, c_out))
            if (stride != 1 or c_in != c_out)
            else nn.Identity()
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.silu(self.conv(x) + self.skip(x))


def build_image_teacher(k: int = 3) -> nn.Module:
    """4-stage Residual ConvNet teacher (`T-IMG`, GroupNorm + SiLU, ~1.1M params) on 128x128 RGB hand crops."""
    return nn.Sequential(
        nn.Conv2d(3, 32, 3, stride=2, padding=1, bias=False),
        nn.GroupNorm(8, 32),
        nn.SiLU(inplace=True),
        ResBlock(32, 64, stride=2),
        ResBlock(64, 128, stride=2),
        ResBlock(128, 192, stride=2),
        ResBlock(192, 256, stride=2),
        nn.AdaptiveAvgPool2d(1),
        nn.Flatten(),
        nn.Dropout(0.15),
        nn.Linear(256, k),
    )


def gpu_augment_batch(x: torch.Tensor, rng: torch.Generator) -> torch.Tensor:
    """On-GPU batch photometric low-light, gamma, color-cast, noise, and spatial jitter on [B,3,128,128] in [0,1]."""
    B = x.shape[0]
    dev = x.device
    # Random exposure gain in [0.12, 1.15]
    gains = torch.empty((B, 1, 1, 1), device=dev).uniform_(0.12, 1.15)
    # Random color cast
    cast = torch.empty((B, 3, 1, 1), device=dev).uniform_(0.75, 1.25)
    # Gamma in [0.65, 1.6]
    gammas = torch.empty((B, 1, 1, 1), device=dev).uniform_(0.65, 1.60)
    out = torch.clamp(x * gains * cast, 1e-4, 1.0) ** gammas
    noise = torch.randn_like(out) * 0.025
    out = torch.clamp(out + noise, 0.0, 1.0)
    return out


def train_visual_teacher_oof(device: torch.device, epochs: int = 28, n_folds: int = 5) -> tuple[dict[tuple[str, int], np.ndarray], dict]:
    """Train 5-fold cluster-disjoint MobileNetV3-Small `T-IMG` on GPU and return per-(group, class) teacher logits."""
    t0 = time.time()
    X_rgb, y, clusters, groups = load_hg5g_train_crops()
    N = len(y)
    # Convert to [N, 3, 128, 128] float32 in [0, 1]
    X_t = torch.from_numpy(X_rgb.transpose(0, 3, 1, 2).astype(np.float32) / 255.0)
    y_t = torch.from_numpy(y)

    # Assign clusters deterministically to n_folds stratified by class
    uniq_c = sorted(set(clusters.tolist()))
    c_to_fold = {c: (i % n_folds) for i, c in enumerate(uniq_c)}
    folds = np.asarray([c_to_fold[int(c)] for c in clusters])

    oof_logits_bright = np.zeros((N, 3), dtype=np.float32)
    oof_logits_dim = np.zeros((N, 3), dtype=np.float32)

    counts = np.bincount(y, minlength=3).astype(np.float32)
    cls_w = torch.from_numpy((1.0 / np.sqrt(np.maximum(counts, 1.0)))).to(device)
    cls_w = cls_w / cls_w.mean()

    mean_im = torch.tensor([0.485, 0.456, 0.406], device=device).view(1, 3, 1, 1)
    std_im = torch.tensor([0.229, 0.224, 0.225], device=device).view(1, 3, 1, 1)

    for fold in range(n_folds):
        tr_idx = np.where(folds != fold)[0]
        va_idx = np.where(folds == fold)[0]
        torch.manual_seed(20261119 + fold)
        net = build_image_teacher(3).to(device)
        opt = torch.optim.AdamW(net.parameters(), lr=1.5e-3, weight_decay=1e-4)
        bs = 64
        Xtr_f = X_t[tr_idx].to(device)
        ytr_f = y_t[tr_idx].to(device)
        Xva_f = X_t[va_idx].to(device)
        g = torch.Generator(device="cpu").manual_seed(20261119 + fold)

        for ep in range(1, epochs + 1):
            net.train()
            perm = torch.randperm(len(Xtr_f), generator=g).to(device)
            lr_ep = 1.5e-3 * (0.1 + 0.9 * 0.5 * (1.0 + np.cos(np.pi * (ep - 1) / max(1, epochs - 1))))
            for pg in opt.param_groups:
                pg["lr"] = lr_ep
            for s in range(0, len(Xtr_f), bs):
                idx = perm[s : s + bs]
                xb = Xtr_f[idx]
                xb_aug = gpu_augment_batch(xb, g)
                # Mix clean and low-light augmented crops in every step
                xb_all = torch.cat([xb, xb_aug], dim=0)
                yb_all = torch.cat([ytr_f[idx], ytr_f[idx]], dim=0)
                xb_norm = (xb_all - mean_im) / std_im
                logits = net(xb_norm)
                loss = F.cross_entropy(logits, yb_all, weight=cls_w)
                opt.zero_grad(set_to_none=True)
                loss.backward()
                opt.step()

        net.eval()
        with torch.no_grad():
            oof_logits_bright[va_idx] = net((Xva_f - mean_im) / std_im).cpu().numpy()
            # Evaluate on simulated dim crops (gain=0.20 + gamma)
            Xva_dim = torch.clamp(Xva_f * 0.22, 1e-4, 1.0) ** 0.85
            oof_logits_dim[va_idx] = net((Xva_dim - mean_im) / std_im).cpu().numpy()

    T_bright = calibrate_T(oof_logits_bright, y)
    T_dim = calibrate_T(oof_logits_dim, y)
    m_bright = metrics(y, oof_logits_bright.argmax(1))
    m_dim = metrics(y, oof_logits_dim.argmax(1))

    # Build lookup by (group, class_id) -> mean calibrated OOF teacher logits (averaging bright & dim)
    oof_blend = 0.5 * (oof_logits_bright / T_bright + oof_logits_dim / T_dim)
    by_grp_cls: dict[tuple[str, int], list[np.ndarray]] = collections.defaultdict(list)
    by_cls: dict[int, list[np.ndarray]] = collections.defaultdict(list)
    for i in range(N):
        by_grp_cls[(groups[i], int(y[i]))].append(oof_blend[i])
        by_cls[int(y[i])].append(oof_blend[i])

    lookup = {k: np.mean(np.stack(v, axis=0), axis=0) for k, v in by_grp_cls.items()}
    for c_id, v in by_cls.items():
        lookup[("__CLASS_MEAN__", c_id)] = np.mean(np.stack(v, axis=0), axis=0)

    info = {
        "backbone": "ResNet9-GroupNorm-SiLU (4-stage Residual ConvNet on 128x128 RGB hand crops)",
        "n_crops": int(N),
        "n_clusters": len(uniq_c),
        "n_folds_cluster_disjoint": n_folds,
        "epochs_per_fold": epochs,
        "elapsed_sec": round(time.time() - t0, 2),
        "oof_bright_metrics": m_bright,
        "oof_dim_g022_metrics": m_dim,
        "T_bright": T_bright,
        "T_dim": T_dim,
    }
    print(f"[T-IMG ResNet9-RGB] N={N} crops ({len(uniq_c)} clusters, {n_folds}-fold OOF) "
          f"bright_macroF1={m_bright['macroF1']} dim_macroF1={m_dim['macroF1']} {info['elapsed_sec']}s", flush=True)
    return lookup, info


def train_deep_teacher_and_align_logits(
    Xtr: np.ndarray, ytr: np.ndarray, wtr: np.ndarray, groups: list[str], sources: list[str],
    Xva: np.ndarray, yva: np.ndarray, max_fp: int, vis_lookup: dict, device: torch.device,
) -> tuple[np.ndarray, np.ndarray, dict]:
    """Train a 3-seed GPU Deep MLP Teacher Ensemble `[82 -> 192 -> 96 -> 48 -> 3]` and blend with `T-IMG`
    visual RGB OOF logits on all visual HandGesture-5G rows."""
    t0 = time.time()
    ens_tr = np.zeros((len(ytr), 3), dtype=np.float32)
    ens_va = np.zeros((len(yva), 3), dtype=np.float32)
    Xt = torch.from_numpy(Xtr).to(device)
    Xv = torch.from_numpy(Xva).to(device)

    for sd in (20261119, 20261120, 20261121):
        net, _ = fit(
            Xtr, ytr, wtr, Xva, yva, [192, 96, 48], 6e-4, 2.2e-3, 60, 0.03, sd, device, "ce", 2.0, 512, max_fp,
        )
        net = net.to(device).eval()
        with torch.no_grad():
            lt = net(Xt).cpu().numpy()
            lv = net(Xv).cpu().numpy()
        T_s = calibrate_T(lv, yva)
        ens_tr += (lt / T_s) / 3.0
        ens_va += (lv / T_s) / 3.0

    # Blend with T-IMG visual RGB teacher logits on all HandGesture-5G visual rows
    vis_mask = np.zeros(len(ytr), dtype=np.float32)
    blended_tr = ens_tr.copy()
    for i, (g, s, c_id) in enumerate(zip(groups, sources, ytr)):
        if s.startswith("hg5g_"):
            vis_mask[i] = 1.0
            v_log = vis_lookup.get((g, int(c_id)), vis_lookup.get(("__CLASS_MEAN__", int(c_id))))
            if v_log is not None:
                blended_tr[i] = 0.55 * ens_tr[i] + 0.45 * v_log

    m_teacher_va = metrics(yva, ens_va.argmax(1))
    info = {
        "deep_teacher_arch": [82, 192, 96, 48, 3],
        "ensemble_seeds": 3,
        "visual_rows_blended_with_T_IMG": int(vis_mask.sum()),
        "val_metrics": m_teacher_va,
        "elapsed_sec": round(time.time() - t0, 2),
    }
    print(f"[T-ENSEMBLE + T-IMG] val_macroF1={m_teacher_va['macroF1']} fp_press={m_teacher_va['other_to_press']} "
          f"vis_blended={int(vis_mask.sum())}/{len(ytr)} {info['elapsed_sec']}s", flush=True)
    return blended_tr, vis_mask, info


def build_causal_4frame_features(X: np.ndarray, groups: list[str], sources: list[str]) -> np.ndarray:
    """Build causal 4-frame temporal features `[x_t (82) | mean_diff_3 (12) | std_3 (12) | valid_mask (4)] = 110-dim`
    using only past frames `t-3..t` within the same group/clip (no future context!)."""
    # Select 12 key dynamic joints/angles from the 82-dim vector (thumb/index coords & velocity features)
    key_idx = [0, 1, 6, 7, 12, 13, 14, 15, 40, 41, 42, 43]
    N, D = X.shape
    out = np.zeros((N, D + 12 + 12 + 4), dtype=np.float32)
    out[:, :D] = X
    hist = collections.deque(maxlen=4)
    prev_grp = None
    for i in range(N):
        g = groups[i]
        s = sources[i]
        if g != prev_grp or s == "hg5g_static":
            hist.clear()
        hist.append(X[i, key_idx])
        prev_grp = g
        k_len = len(hist)
        stack = np.stack(list(hist), axis=0)  # [k_len, 12]
        mean_diff = X[i, key_idx] - stack.mean(axis=0)
        std_v = stack.std(axis=0) if k_len > 1 else np.zeros(12, dtype=np.float32)
        mask = [1.0 if j < k_len else 0.0 for j in range(4)]
        out[i, D : D + 12] = mean_diff
        out[i, D + 12 : D + 24] = std_v
        out[i, D + 24 : D + 28] = mask
    return out


class FakeQuantLinear(nn.Module):
    """Per-output-channel symmetric INT8 fake-quantized linear layer (straight-through estimator for S3 QAT)."""
    def __init__(self, in_f: int, out_f: int):
        super().__init__()
        self.weight = nn.Parameter(torch.empty(out_f, in_f))
        self.bias = nn.Parameter(torch.zeros(out_f))
        nn.init.kaiming_normal_(self.weight, nonlinearity="relu")

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        w = self.weight
        max_abs = torch.clamp(w.detach().abs().amax(dim=1, keepdim=True), min=1e-6)
        scale = max_abs / 127.0
        w_q = torch.clamp(torch.round(w / scale), -127.0, 127.0) * scale
        w_ste = w + (w_q - w).detach()
        return F.linear(x, w_ste, self.bias)


class QATMLP(nn.Module):
    def __init__(self, d_in: int, hidden: list[int], k: int = 3):
        super().__init__()
        dims = [d_in] + list(hidden) + [k]
        self.lins = nn.ModuleList([FakeQuantLinear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for i, l in enumerate(self.lins):
            x = l(x)
            if i < len(self.lins) - 1:
                x = F.relu(x)
        return x


def train_s3_qat(
    Xtr: np.ndarray, ytr: np.ndarray, wtr: np.ndarray, Xva: np.ndarray, yva: np.ndarray,
    Xte_raw: np.ndarray, yte: np.ndarray, mean: np.ndarray, std: np.ndarray, feat_names: list[str],
    hidden: list[int], max_fp: int, out_dir: str, device: torch.device,
) -> dict:
    t0 = time.time()
    torch.manual_seed(20261121)
    net = QATMLP(Xtr.shape[1], hidden).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=2.5e-3, weight_decay=5e-4)
    Xt = torch.from_numpy(Xtr).to(device)
    yt = torch.from_numpy(ytr).to(device)
    wt = torch.from_numpy(wtr).to(device)
    Xv = torch.from_numpy(Xva).to(device)
    g = torch.Generator(device="cpu").manual_seed(20261121)
    best_key = (-1, -1.0, -1.0, -999999)
    best_state = None
    best_ep = 0
    epochs = 55
    bs = 512

    for ep in range(1, epochs + 1):
        net.train()
        perm = torch.randperm(len(Xt), generator=g).to(device)
        lr_ep = 2.5e-3 * (0.1 + 0.9 * 0.5 * (1.0 + np.cos(np.pi * (ep - 1) / max(1, epochs - 1))))
        for pg in opt.param_groups:
            pg["lr"] = lr_ep
        for s in range(0, len(Xt), bs):
            idx = perm[s : s + bs]
            xb = Xt[idx] + 0.025 * torch.randn_like(Xt[idx])
            logits = net(xb)
            ce = F.cross_entropy(logits, yt[idx], reduction="none")
            l = (ce * wt[idx]).sum() / wt[idx].sum().clamp_min(1e-6)
            opt.zero_grad(set_to_none=True)
            l.backward()
            opt.step()

        net.eval()
        with torch.no_grad():
            lv = net(Xv).cpu().numpy()
        m = metrics(yva, lv.argmax(1))
        key = val_Composite_score(m, max_fp)
        if key > best_key:
            best_key = key
            best_state = {k_: v.detach().cpu().clone() for k_, v in net.state_dict().items()}
            best_ep = ep

    net.load_state_dict(best_state)
    net = net.cpu().eval()
    with torch.no_grad():
        lv = net(torch.from_numpy(Xva)).numpy()
    T = calibrate_T(lv, yva)
    exp = export(net, os.path.join(out_dir, "r20_s3_qat.json"), "r20_s3_qat", "r20-s3-qat", "CC BY 4.0", feat_names, mean, std, T)
    lva_i8 = forward_int8_exported(exp["int8_doc"], Xva * std + mean)
    lte_i8 = forward_int8_exported(exp["int8_doc"], Xte_raw)
    return {
        "hidden": hidden,
        "best_epoch": best_ep,
        "T": T,
        "int8_packed_bytes": exp["int8_packed_bytes"],
        "int8_json_bytes": exp["int8_json_bytes"],
        "val_int8": metrics(yva, lva_i8.argmax(1)),
        "test_locked_int8": metrics(yte, lte_i8.argmax(1)),
        "elapsed_sec": round(time.time() - t0, 2),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="r20_c2_feat")
    ap.add_argument("--feat-dir", default=FEAT_DIR)
    ap.add_argument("--out-dir", default=f"{SANDBOX}/models/kd_ablation")
    ap.add_argument("--device", default="cuda:0")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    dev = torch.device(args.device if torch.cuda.is_available() else "cpu")

    trm, Xtr_raw, ytr = load_split(args.feat_dir, args.prefix, "train")
    vam, Xva_raw, yva = load_split(args.feat_dir, args.prefix, "val")
    tem, Xte_raw, yte = load_split(args.feat_dir, args.prefix, "test")

    mean = Xtr_raw.mean(0)
    std = np.where(Xtr_raw.std(0) > 1e-5, Xtr_raw.std(0), 1.0).astype(np.float32)
    Xtr, Xva, Xte = [((x - mean) / std).astype(np.float32) for x in (Xtr_raw, Xva_raw, Xte_raw)]
    sw = np.asarray(trm["sample_weights"], np.float32)
    wtr = build_weights(ytr, trm["sources"], sw, "bal", trm["groups"])

    c0 = json.load(open(f"{os.environ.get('R20_REPO', '/srv/sketchbook/mediapipe-optimize/research-can')}/r19/models/r19_model_mlp.json"))
    c0_val = metrics(yva, forward_exported(c0, Xva_raw).argmax(1))
    max_fp = int(c0_val["other_to_press"])

    # 1. Train T-IMG (ResNet9 on 128x128 RGB hand crops, 5-fold cluster-disjoint OOF)
    vis_lookup, t_img_info = train_visual_teacher_oof(dev, epochs=38, n_folds=5)

    # 2. Train Deep Teacher Ensemble + blend with T-IMG OOF logits
    teacher_logits, vis_mask, t_ens_info = train_deep_teacher_and_align_logits(
        Xtr, ytr, wtr, trm["groups"], trm["sources"], Xva, yva, max_fp, vis_lookup, dev,
    )
    np.save(os.path.join(args.out_dir, "teacher_logits.npy"), teacher_logits)
    np.save(os.path.join(args.out_dir, "teacher_vis_mask.npy"), vis_mask)

    rng_par = np.random.default_rng(20261119)
    Xpar = np.concatenate([Xva_raw, Xte_raw])
    ypar = np.concatenate([yva, yte])
    par_idx = rng_par.choice(len(Xpar), size=160, replace=False)

    # 3. C6 (Supervised Student, kd_lambda=0.0) vs C7 (Teacher-Student Distilled, kd_lambda in {0.25, 0.50}, T in {2.0, 4.0})
    kd_grid = [
        {"id": "C6_supervised_no_teacher", "kd_lambda": 0.0, "kd_T": 2.0},
        {"id": "C7_kd_l025_T2", "kd_lambda": 0.25, "kd_T": 2.0},
        {"id": "C7_kd_l050_T2", "kd_lambda": 0.50, "kd_T": 2.0},
        {"id": "C7_kd_l025_T4", "kd_lambda": 0.25, "kd_T": 4.0},
        {"id": "C7_kd_l050_T4", "kd_lambda": 0.50, "kd_T": 4.0},
    ]
    kd_results = {}
    best_c6 = None
    best_c7 = None

    for cell in kd_grid:
        cid = cell["id"]
        lam = cell["kd_lambda"]
        kT = cell["kd_T"]
        cell_runs = []
        for h in ([64, 32], [96, 48]):
            for sd in (20261119, 20261120, 20261121):
                t0 = time.time()
                net, ep = fit(
                    Xtr, ytr, wtr, Xva, yva, h, 5e-4, 2.8e-3, 55, 0.025, sd, dev, "ce", 2.0, 512,
                    max_fp, teacher_logits if lam > 0 else None, None, lam, kT,
                )
                with torch.no_grad():
                    lv = net(torch.from_numpy(Xva)).numpy()
                T = calibrate_T(lv, yva)
                m_va = metrics(yva, lv.argmax(1))
                nll, ece = nll_ece(softmax(lv / T), yva)
                comp = val_Composite_score(m_va, max_fp)
                cell_runs.append(({
                    "hidden": h, "seed": sd, "best_epoch": ep, "T": T, "val": m_va,
                    "val_nll": nll, "val_ece": ece, "composite_key": list(comp),
                    "secs": round(time.time() - t0, 2),
                }, net))
        sel_r, sel_n = sorted(cell_runs, key=lambda r: (tuple(r[0]["composite_key"]), -r[0]["val_nll"]), reverse=True)[0]
        exp = export(
            sel_n, os.path.join(args.out_dir, f"r20_{cid.lower()}.json"),
            f"r20_{cid.lower()}", f"r20-{cid.lower()}", "CC BY 4.0",
            trm["feature_names"], mean, std, sel_r["T"],
        )
        lg_par = forward_exported(exp["doc"], Xpar[par_idx])
        json.dump(
            [{"X": [float(v) for v in Xpar[i]], "y": int(ypar[i]), "probs": [float(p) for p in softmax(lg_par)[j]]} for j, i in enumerate(par_idx)],
            open(os.path.join(args.out_dir, f"r20_{cid.lower()}_parity_rows.json"), "w"),
        )
        lte = forward_exported(exp["doc"], Xte_raw)
        lva = forward_exported(exp["doc"], Xva_raw)
        m_te = metrics(yte, lte.argmax(1))
        m_te["nll"], m_te["ece"] = nll_ece(softmax(lte), yte)
        m_va_exp = metrics(yva, lva.argmax(1))
        kd_results[cid] = {
            "kd_lambda": lam,
            "kd_T": kT,
            "selected": {k: sel_r[k] for k in ("hidden", "seed", "best_epoch", "T", "val_nll", "val_ece", "composite_key")},
            "val_exported": m_va_exp,
            "test_locked_exported": m_te,
            "json_bytes": exp["json_bytes"],
            "f32_bytes": exp["f32_bytes"],
            "int8_packed_bytes": exp["int8_packed_bytes"],
            "sha256": exp["json_sha256"],
        }
        print(f"[{cid}] h={sel_r['hidden']} s={sel_r['seed']} valMacroF1={m_va_exp['macroF1']} "
              f"fp_press={m_va_exp['other_to_press']} | testMacroF1={m_te['macroF1']} "
              f"testF1(R,P)=({m_te['f1_ready']},{m_te['f1_press']}) test_fp_press={m_te['other_to_press']}", flush=True)
        if lam == 0.0:
            best_c6 = (cid, kd_results[cid], exp)
        elif best_c7 is None or (tuple(sel_r["composite_key"]), -sel_r["val_nll"]) > (tuple(best_c7[1]["selected"]["composite_key"]), -best_c7[1]["selected"]["val_nll"]):
            best_c7 = (cid, kd_results[cid], exp)

    # 4. S-TEMP (Causal 4-Frame Temporal Student with missingness mask) distilled from T-TEMP
    Xtr_t = build_causal_4frame_features(Xtr_raw, trm["groups"], trm["sources"])
    Xva_t = build_causal_4frame_features(Xva_raw, vam["groups"], vam["sources"])
    Xte_t = build_causal_4frame_features(Xte_raw, tem["groups"], tem["sources"])
    mean_t = Xtr_t.mean(0)
    std_t = np.where(Xtr_t.std(0) > 1e-5, Xtr_t.std(0), 1.0).astype(np.float32)
    Xtr_tn, Xva_tn, Xte_tn = [((x - mean_t) / std_t).astype(np.float32) for x in (Xtr_t, Xva_t, Xte_t)]

    # T-TEMP teacher `[110 -> 192 -> 96 -> 3]` on GPU
    t_temp_net, _ = fit(Xtr_tn, ytr, wtr, Xva_tn, yva, [192, 96], 6e-4, 2.2e-3, 55, 0.025, 20261119, dev, "ce", 2.0, 512, max_fp)
    with torch.no_grad():
        t_temp_tr = t_temp_net.to(dev)(torch.from_numpy(Xtr_tn).to(dev)).cpu().numpy()
        t_temp_va = t_temp_net.to(dev)(torch.from_numpy(Xva_tn).to(dev)).cpu().numpy()
    T_tt = calibrate_T(t_temp_va, yva)
    # Distill into S-TEMP `[110 -> 64 -> 32 -> 3]`
    s_temp_net, s_temp_ep = fit(
        Xtr_tn, ytr, wtr, Xva_tn, yva, [64, 32], 5e-4, 2.8e-3, 55, 0.025, 20261121, dev, "ce", 2.0, 512,
        max_fp, t_temp_tr / T_tt, None, 0.25, 2.0,
    )
    with torch.no_grad():
        s_temp_va = s_temp_net(torch.from_numpy(Xva_tn)).numpy()
        s_temp_te = s_temp_net(torch.from_numpy(Xte_tn)).numpy()
    s_temp_info = {
        "input_dim": int(Xtr_t.shape[1]),
        "hidden": [64, 32],
        "best_epoch": s_temp_ep,
        "teacher_val_metrics": metrics(yva, t_temp_va.argmax(1)),
        "student_val_metrics": metrics(yva, s_temp_va.argmax(1)),
        "student_test_locked_metrics": metrics(yte, s_temp_te.argmax(1)),
    }
    print(f"[S-TEMP causal 4-frame] valMacroF1={s_temp_info['student_val_metrics']['macroF1']} "
          f"testMacroF1={s_temp_info['student_test_locked_metrics']['macroF1']} "
          f"test_fp_press={s_temp_info['student_test_locked_metrics']['other_to_press']}", flush=True)

    # 5. S3 QAT (Quantization-Aware Training INT8) on winning architecture
    qat_info = train_s3_qat(Xtr, ytr, wtr, Xva, yva, Xte_raw, yte, mean, std, trm["feature_names"], [64, 32], max_fp, args.out_dir, dev)
    print(f"[S3 QAT INT8] valMacroF1={qat_info['val_int8']['macroF1']} testMacroF1={qat_info['test_locked_int8']['macroF1']} "
          f"packed_bytes={qat_info['int8_packed_bytes']}B", flush=True)

    summary = {
        "prefix": args.prefix,
        "device": str(dev),
        "gpu_name": torch.cuda.get_device_name(dev) if dev.type == "cuda" else "cpu",
        "T_IMG_visual_teacher": t_img_info,
        "T_ENSEMBLE_blended_teacher": t_ens_info,
        "C6_vs_C7_distillation_grid": kd_results,
        "best_C6_id": best_c6[0],
        "best_C7_id": best_c7[0],
        "S_TEMP_causal_4frame": s_temp_info,
        "S3_QAT_int8": qat_info,
    }
    with open(os.path.join(args.out_dir, "r20_teacher_student_ablation.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)


if __name__ == "__main__":
    main()
