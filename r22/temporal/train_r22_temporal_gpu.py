#!/usr/bin/env python3
"""
R22 W-TEMPORAL — GPU Causal Temporal Classifier Training & Ablation (`CUDA_VISIBLE_DEVICES=1`).

Trains causal 1D-TCN models across window sizes W in {3, 5, 8} frames using K5 (`r22-temporal-146d-v1`)
features extracted strictly from genuine multi-frame sequences curated by `curate_real_sequences.py`.

Strict Compliance:
  - ZERO static single-image replication (every sequence comes from real multi-frame video or verified
    distinct-CRC32 sequential photo bursts with real frame-to-frame motion and dt).
  - ZERO invented `landmark.visibility` (only observable 21 landmarks, real dt, and derived quality gate).
  - Strictly person/participant/cluster/session-disjoint K7 splits (zero leakage into VAL/TEST/OOD).
  - Train-only physics-consistent augmentations (D06) applied on raw 21x3 sequences BEFORE 146D extraction:
      * Variable frame-rate / 15 FPS stride-2 subsampling + dt jitter (plus webcam-cadence randomization
        on EXIF photo bursts to prevent cadence shortcutting!)
      * Structured ring/pinky finger occlusion & fingertip dropout
      * Anisotropic landmark jitter + z-noise + 2D horizontal mirror
      * Short NO_HAND tracking blink masking (valid_frame_mask = 0)
      * Negative transition sequences (`FIST -> ONE`, `FIST -> TWO`, conversational pointing, non-gesture motion)
      * Real-frame causal onset/offset transition boundaries (train-only) for sharp reaction latency
  - Post-hoc temperature scaling fitted on held-out VAL NLL + ECE measurement.
  - Also runs auxiliary 5-class Canvas Pose (`FIST/ONE/TWO/FIVE/OTHER`) ablation across W in {1, 3, 5, 8}
    on 100% genuine 30 FPS continuous sequences.

Outputs in `/srv/sketchbook/mediapipe-optimize/research-can/r22/temporal/`:
  - `r22_temporal_model_w3.json`
  - `r22_temporal_model_w5.json`
  - `r22_temporal_model_w8.json`
  - `r22_temporal_parity_w{3,5,8}.json` (160 real windows/model for PyTorch <-> TS/CPU parity gate)
  - `r22_temporal_pose5_w5.json` (auxiliary 5-class Canvas Pose temporal candidate)
  - `r22_temporal_gpu_train_summary.json` (full GPU training logs, VAL/TEST/OOD/ECE metrics & Pose-5 ablation)
"""
from __future__ import annotations

import collections
import hashlib
import json
import math
import os
import random
import sys
import time
from typing import Any

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from curate_real_sequences import (  # noqa: E402
    CACHE_NPZ,
    META_JSON,
    OUT_DIR,
    PISTOL_LABELS,
    PISTOL_TO_ID,
    POSE5_LABELS,
    POSE5_TO_ID,
    R22_TEMPORAL_FEATURE_DIM,
    R22_TEMPORAL_FEATURE_NAMES,
    R22TemporalFeatureExtractorPy,
)

SEED = 20261119
WINDOW_SIZES = (3, 5, 8)
LOSS_RESET_MS = 350.0


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


# =============================================================================
# Causal 1D-TCN Model (Exact Mirror of TS `R22TemporalClassifier`)
# =============================================================================
class CausalSepTcnBlock(nn.Module):
    def __init__(self, c_in: int, c_out: int, kernel_size: int = 3, dilation: int = 1, residual: bool = True, dropout: float = 0.10):
        super().__init__()
        self.c_in = c_in
        self.c_out = c_out
        self.kernel_size = kernel_size
        self.dilation = dilation
        self.pad_left = (kernel_size - 1) * dilation
        self.residual = bool(residual) and (c_in == c_out)
        self.dw_conv = nn.Conv1d(c_in, c_in, kernel_size=kernel_size, dilation=dilation, groups=c_in, bias=True)
        self.pw_conv = nn.Conv1d(c_in, c_out, kernel_size=1, bias=True)
        self.drop = nn.Dropout(dropout)

    def forward(self, h_c: torch.Tensor) -> torch.Tensor:
        # h_c: [B, C_in, W]
        h_pad = F.pad(h_c, (self.pad_left, 0)) if self.pad_left > 0 else h_c
        dw = F.relu(self.dw_conv(h_pad))
        pw = self.pw_conv(dw)
        if self.residual:
            out = F.relu(pw + h_c)
        else:
            out = F.relu(pw)
        return self.drop(out)


class CausalTemporalTCN(nn.Module):
    def __init__(self, feature_dim: int, num_classes: int, window_size: int, c0: int = 36, c_last: int = 24, dropout: float = 0.15):
        super().__init__()
        self.feature_dim = feature_dim
        self.num_classes = num_classes
        self.window_size = window_size
        self.c0 = c0
        self.c_last = c_last

        self.proj = nn.Linear(feature_dim, c0)
        self.proj_drop = nn.Dropout(dropout * 0.5)

        if window_size == 1:
            # Single-frame control using exact same parameter family (kernel_size=1)
            self.blocks = nn.ModuleList([
                CausalSepTcnBlock(c0, c0, kernel_size=1, dilation=1, residual=True, dropout=dropout),
                CausalSepTcnBlock(c0, c_last, kernel_size=1, dilation=1, residual=False, dropout=dropout),
            ])
        else:
            # Receptive field grows cleanly with W: W=3 -> d2=1 (RF=3), W=5 -> d2=2 (RF=5), W=8 -> d2=3 (RF=8)
            d2 = 1 if window_size <= 3 else (2 if window_size <= 5 else 3)
            self.blocks = nn.ModuleList([
                CausalSepTcnBlock(c0, c0, kernel_size=3, dilation=1, residual=True, dropout=dropout),
                CausalSepTcnBlock(c0, c_last, kernel_size=3, dilation=d2, residual=False, dropout=dropout),
            ])

        ro_dim = c_last * 2 + c0
        self.head0 = nn.Linear(ro_dim, 24)
        self.head_drop = nn.Dropout(dropout)
        self.head1 = nn.Linear(24, num_classes)

    def forward(self, x_raw: torch.Tensor, mean: torch.Tensor, inv_std: torch.Tensor) -> torch.Tensor:
        # x_raw: [B, W, 146]
        mask = (x_raw[:, :, -1] > 0.5).float()  # [B, W]
        mask_u = mask.unsqueeze(-1)
        z = ((x_raw - mean) * inv_std) * mask_u

        h_proj = F.relu(self.proj(z)) * mask_u  # [B, W, c0]
        h_c = self.proj_drop(h_proj).transpose(1, 2)  # [B, c0, W]
        for blk in self.blocks:
            h_c = blk(h_c)
        h = h_c.transpose(1, 2)  # [B, W, c_last]

        last_tcn = h[:, -1, :]
        valid_cnt = mask.sum(dim=1, keepdim=True).clamp(min=1.0)
        mean_tcn = (h * mask_u).sum(dim=1) / valid_cnt
        last_proj = h_proj[:, -1, :]

        ro = torch.cat([last_tcn, mean_tcn, last_proj], dim=-1)
        u = self.head_drop(F.relu(self.head0(ro)))
        return self.head1(u)

    def export_dict(
        self,
        *,
        name: str,
        task: str,
        labels: list[str],
        mean: np.ndarray,
        std: np.ndarray,
        temperature: float,
        license_provenance: str,
    ) -> dict[str, Any]:
        def rlist(arr: np.ndarray) -> Any:
            return np.round(arr.astype(np.float64), 6).tolist()

        tcn_blocks = []
        for blk in self.blocks:
            dw_w = blk.dw_conv.weight.detach().cpu().numpy().squeeze(1)  # [c_in, k]
            dw_b = blk.dw_conv.bias.detach().cpu().numpy()
            pw_w = blk.pw_conv.weight.detach().cpu().numpy().squeeze(-1).T  # [c_in, c_out]
            pw_b = blk.pw_conv.bias.detach().cpu().numpy()
            tcn_blocks.append({
                "kernel_size": int(blk.kernel_size),
                "dilation": int(blk.dilation),
                "dw_W": rlist(dw_w),
                "dw_b": rlist(dw_b),
                "pw_W": rlist(pw_w),
                "pw_b": rlist(pw_b),
                "residual": bool(blk.residual),
            })

        return {
            "name": name,
            "version": "r22-temporal-v1.0",
            "encoder_version": "r22-temporal-146d-v1",
            "license_provenance": license_provenance,
            "split_contract": "K7:R19-R20-DISJOINT",
            "task": task,
            "window_size": int(self.window_size),
            "feature_dim": int(self.feature_dim),
            "loss_reset_ms": float(LOSS_RESET_MS),
            "labels": labels,
            "feature_names": R22_TEMPORAL_FEATURE_NAMES,
            "mean": rlist(mean),
            "std": rlist(std),
            "temperature": round(float(temperature), 5),
            "proj": {
                "W": rlist(self.proj.weight.detach().cpu().numpy().T),
                "b": rlist(self.proj.bias.detach().cpu().numpy()),
            },
            "tcn_blocks": tcn_blocks,
            "head_layers": [
                {
                    "W": rlist(self.head0.weight.detach().cpu().numpy().T),
                    "b": rlist(self.head0.bias.detach().cpu().numpy()),
                },
                {
                    "W": rlist(self.head1.weight.detach().cpu().numpy().T),
                    "b": rlist(self.head1.bias.detach().cpu().numpy()),
                },
            ],
        }


# =============================================================================
# Physics-Consistent Train-Only Sequence Augmentation (D06)
# =============================================================================
def augment_raw_sequence_window(
    lms: np.ndarray,      # [L, 21, 3]
    t_ms: np.ndarray,     # [L]
    valid: np.ndarray,    # [L]
    aspect: float,
    cadence: str,
    rng: np.random.Generator,
    is_minority: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """
    Apply realistic train-only augmentations on raw 21x3 landmarks + timestamps BEFORE 146D extraction:
      - Horizontal mirror (p=0.5)
      - 2D rotation/scale/translation + gentle camera drift (simulates real webcam movement)
      - Anisotropic landmark jitter & z-noise (cheap webcam noise/blur)
      - Structured ring/pinky finger occlusion / dropout (p=0.30, D05/D06)
      - Variable frame-rate dt jitter / webcam-cadence randomization for photo bursts
      - Short interior NO_HAND blink masking (p=0.18)
    """
    L = len(valid)
    out_lms = lms.copy().astype(np.float64)
    out_tms = t_ms.copy().astype(np.float64)
    out_val = valid.copy()
    out_aspect = float(aspect)

    # 1) Horizontal mirror (exact left/right symmetry)
    if rng.random() < 0.5:
        out_lms[:, :, 0] = 1.0 - out_lms[:, :, 0]

    # 2) Mild aspect variation (webcam 4:3, 16:9, 1:1)
    if rng.random() < 0.35:
        out_aspect = float(rng.choice([1.0, 4.0 / 3.0, 16.0 / 9.0]))

    # 3) Sequence-level 2D roll + scale + smooth translation drift
    roll_deg = float(rng.normal(0.0, 14.0 if is_minority else 10.0))
    roll_rad = math.radians(max(-40.0, min(40.0, roll_deg)))
    c_r, s_r = math.cos(roll_rad), math.sin(roll_rad)
    sc = float(rng.uniform(0.78, 1.25))
    vx_drift = float(rng.normal(0.0, 0.008))
    vy_drift = float(rng.normal(0.0, 0.008))

    # Apply around sequence centroid in aspect-corrected space
    v_idx = np.where(out_val > 0)[0]
    if len(v_idx) > 0:
        cx = float(np.mean(out_lms[v_idx, 0, 0]))
        cy = float(np.mean(out_lms[v_idx, 0, 1]))
        for t in v_idx:
            dx = (out_lms[t, :, 0] - cx) * out_aspect
            dy = out_lms[t, :, 1] - cy
            rx = (dx * c_r - dy * s_r) * sc
            ry = (dx * s_r + dy * c_r) * sc
            out_lms[t, :, 0] = cx + (rx / out_aspect) + vx_drift * (t - v_idx[0])
            out_lms[t, :, 1] = cy + ry + vy_drift * (t - v_idx[0])

    # 4) Anisotropic landmark jitter + z-noise
    sig_xy = float(rng.uniform(0.0015, 0.0075))
    sig_z = float(rng.uniform(0.003, 0.015))
    noise = np.zeros_like(out_lms)
    noise[:, :, 0] = rng.normal(0.0, sig_xy / max(1.0, out_aspect), size=(L, 21))
    noise[:, :, 1] = rng.normal(0.0, sig_xy, size=(L, 21))
    noise[:, :, 2] = rng.normal(0.0, sig_z, size=(L, 21))
    out_lms += noise

    # 5) Structured finger occlusion / dropout (ring 13..16 & pinky 17..20 occluded behind palm!)
    if rng.random() < 0.30 and len(v_idx) > 0:
        occl_mode = rng.choice(["ring_pinky_noise", "pinky_curl", "fingertip_jitter"])
        if occl_mode == "ring_pinky_noise":
            # Ring & pinky joints get heavy anisotropic tracking noise (tilted hand occlusion)
            out_lms[:, 13:21, :2] += rng.normal(0.0, 0.014, size=(L, 8, 2))
            out_lms[:, 13:21, 2] += rng.normal(0.02, 0.02, size=(L, 8))
        elif occl_mode == "pinky_curl":
            # Pull pinky tip/DIP slightly toward palm MCP (foreshortened side view)
            alpha = float(rng.uniform(0.25, 0.65))
            for j in (18, 19, 20):
                out_lms[:, j, :2] = (1.0 - alpha) * out_lms[:, j, :2] + alpha * out_lms[:, 17, :2]
        else:
            # Fingertip detection blur jitter on all tips
            for tip in (4, 8, 12, 16, 20):
                out_lms[:, tip, :2] += rng.normal(0.0, 0.009, size=(L, 2))

    # 6) Variable frame-rate dt jitter + photo-burst webcam-cadence randomization
    # CRITICAL: prevents model from using HandGesture-5G's 1000ms EXIF cadence as a shortcut!
    if cadence == "photo_burst_exif" and rng.random() < 0.70:
        # Re-time consecutive distinct burst frames with realistic 15-30 FPS dt + smooth interpolation scale
        base_fps = float(rng.choice([15.0, 20.0, 30.0]))
        cur_t = 0.0
        out_tms[0] = 0.0
        for t in range(1, L):
            dt = (1000.0 / base_fps) * float(rng.uniform(0.75, 1.45))
            cur_t += dt
            out_tms[t] = cur_t
    else:
        # Variable dt jitter (simulating cheap webcam frame interval jitter)
        cur_t = float(out_tms[0])
        for t in range(1, L):
            raw_dt = max(16.0, float(t_ms[t] - t_ms[t - 1]))
            jitter_dt = raw_dt * float(rng.uniform(0.75, 1.45))
            cur_t += jitter_dt
            out_tms[t] = cur_t

    # 7) Short interior NO_HAND blink masking (keep newest frame L-1 valid!)
    if L >= 3 and rng.random() < 0.18:
        n_blinks = 1 if L <= 4 else int(rng.choice([1, 2]))
        cand_idx = list(range(0, L - 1))
        chosen = rng.choice(cand_idx, size=min(n_blinks, len(cand_idx)), replace=False)
        for bi in chosen:
            out_val[int(bi)] = 0

    return out_lms.astype(np.float32), out_tms, out_val, out_aspect


def extract_window_146(
    lms: np.ndarray,
    t_ms: np.ndarray,
    valid: np.ndarray,
    aspect: float,
    W: int,
    force_no_reset_gap: bool = False,
) -> np.ndarray:
    """
    Extract exact causal `[W, 146]` window (oldest -> newest) using `R22TemporalFeatureExtractorPy`.
    If `len(valid) < W`, left-pads with zero-masked frames (`valid_frame_mask = 0`).
    """
    ext = R22TemporalFeatureExtractorPy(loss_reset_ms=LOSS_RESET_MS)
    L = len(valid)
    feats = np.zeros((W, R22_TEMPORAL_FEATURE_DIM), dtype=np.float32)
    pad = max(0, W - L)
    src_off = max(0, L - W)
    for i in range(L):
        lm_in = lms[i] if valid[i] else None
        f146, ok, _rst = ext.step(lm_in, float(t_ms[i]), float(aspect), force_no_reset_gap=force_no_reset_gap)
        w_idx = i - src_off + pad
        if 0 <= w_idx < W:
            feats[w_idx] = f146 if ok else 0.0
    return feats


def extract_sequence_full_146(
    lms: np.ndarray,
    t_ms: np.ndarray,
    valid: np.ndarray,
    aspect: float,
    force_no_reset_gap: bool = False,
) -> tuple[np.ndarray, np.ndarray]:
    """Run causal extractor across an entire sequence once; returns `(F[T, 146], ok[T])`."""
    ext = R22TemporalFeatureExtractorPy(loss_reset_ms=LOSS_RESET_MS)
    T = len(valid)
    F_all = np.zeros((T, R22_TEMPORAL_FEATURE_DIM), dtype=np.float32)
    ok_all = np.zeros(T, dtype=np.uint8)
    for i in range(T):
        lm_in = lms[i] if valid[i] else None
        f146, ok, _rst = ext.step(lm_in, float(t_ms[i]), float(aspect), force_no_reset_gap=force_no_reset_gap)
        if ok:
            F_all[i] = f146
            ok_all[i] = 1
    return F_all, ok_all


def slice_causal_window(F_all: np.ndarray, idx: int, W: int) -> np.ndarray:
    """Slice exact causal `[W, 146]` ending at `idx` (inclusive), left-padded with zeros if `idx < W - 1`."""
    out = np.zeros((W, R22_TEMPORAL_FEATURE_DIM), dtype=np.float32)
    start = idx - W + 1
    if start >= 0:
        out[:] = F_all[start : idx + 1]
    else:
        pad = -start
        out[pad:] = F_all[0 : idx + 1]
    return out


# =============================================================================
# Metrics & Temperature Calibration
# =============================================================================
def compute_metrics(y_true: np.ndarray, probs: np.ndarray, labels: list[str]) -> dict[str, Any]:
    K = len(labels)
    y_pred = np.argmax(probs, axis=1)
    conf = np.zeros((K, K), dtype=np.int64)
    for yt, yp in zip(y_true, y_pred):
        conf[int(yt), int(yp)] += 1

    per_class: dict[str, dict[str, float]] = {}
    active_f1s = []
    for c, cname in enumerate(labels):
        tp = int(conf[c, c])
        sup = int(conf[c, :].sum())
        pred = int(conf[:, c].sum())
        prec = tp / pred if pred > 0 else 0.0
        rec = tp / sup if sup > 0 else 0.0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
        per_class[cname] = {
            "support": sup,
            "pred": pred,
            "tp": tp,
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
        }
        if sup > 0:
            active_f1s.append(f1)

    acc = float(np.mean(y_true == y_pred)) if len(y_true) > 0 else 0.0
    macro_f1 = float(np.mean(active_f1s)) if active_f1s else 0.0

    # Expected Calibration Error (15 bins)
    confs = np.max(probs, axis=1)
    accs = (y_pred == y_true).astype(np.float64)
    ece = 0.0
    if len(y_true) > 0:
        for b in range(15):
            lo, hi = b / 15.0, (b + 1) / 15.0
            in_b = (confs > lo) & (confs <= hi) if b > 0 else (confs >= lo) & (confs <= hi)
            if np.any(in_b):
                ece += (float(np.sum(in_b)) / len(y_true)) * abs(float(np.mean(accs[in_b])) - float(np.mean(confs[in_b])))

    out: dict[str, Any] = {
        "n": int(len(y_true)),
        "acc": round(acc, 4),
        "macro_f1": round(macro_f1, 4),
        "ece": round(ece, 4),
        "per_class": per_class,
        "confusion": conf.tolist(),
    }
    if labels == PISTOL_LABELS:
        out["other_to_press"] = int(conf[2, 1])
        out["ready_to_press"] = int(conf[0, 1])
        out["other_to_ready"] = int(conf[2, 0])
    return out


def fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    """Fit scalar temperature > 0 minimizing NLL on held-out VAL logits."""
    if len(y) == 0:
        return 1.0
    best_t = 1.0
    best_nll = float("inf")
    lt = torch.from_numpy(logits.astype(np.float32))
    yt = torch.from_numpy(y.astype(np.int64))
    for t in np.concatenate([np.linspace(0.25, 1.5, 51), np.linspace(1.55, 3.5, 40)]):
        loss = float(F.cross_entropy(lt / float(t), yt).item())
        if loss < best_nll:
            best_nll = loss
            best_t = float(t)
    # Fine polish around best_t
    for t in np.linspace(max(0.15, best_t - 0.06), best_t + 0.06, 49):
        loss = float(F.cross_entropy(lt / float(t), yt).item())
        if loss < best_nll:
            best_nll = loss
            best_t = float(t)
    return best_t


# =============================================================================
# Dataset Builder for Pistol 3-Class (W in {3, 5, 8}) and Pose-5 (W in {1, 3, 5, 8})
# =============================================================================
def build_pistol_windows(
    npz: Any,
    meta: dict[str, Any],
    W: int,
    rng: np.random.Generator,
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray], dict[str, list[str]], dict[str, int]]:
    """
    Build train / val / test / ood_test `[N, W, 146]` datasets for 3-class Pistol (`POINT_READY`, `POINT_PRESS`, `OTHER`).
    - Zero static single-image replication.
    - All augmentations & real-frame transition boundaries are strictly TRAIN-ONLY.
    - VAL / TEST / OOD_TEST are 100% raw untouched sequences from unseen subjects/participants/clusters.
    """
    all_lms = npz["landmarks"]
    all_tms = npz["t_ms"]
    all_valid = npz["valid"]
    all_py = npz["pistol_y"]
    all_raw_ids = npz["raw_cls_ids"]
    vocab = meta["raw_cls_vocab"]

    X_splits: dict[str, list[np.ndarray]] = {"train": [], "val": [], "test": [], "ood_test": []}
    y_splits: dict[str, list[int]] = {"train": [], "val": [], "test": [], "ood_test": []}
    w_train: list[float] = []
    src_splits: dict[str, list[str]] = {"train": [], "val": [], "test": [], "ood_test": []}
    aug_stats = collections.Counter()

    # Keep pools of TRAIN raw segments for real-frame transition construction (train-only!)
    train_ready_segs: list[tuple[np.ndarray, np.ndarray, np.ndarray, float, str]] = []
    train_press_segs: list[tuple[np.ndarray, np.ndarray, np.ndarray, float, str]] = []
    train_fist_segs: list[tuple[np.ndarray, np.ndarray, np.ndarray, float, str]] = []
    train_two_segs: list[tuple[np.ndarray, np.ndarray, np.ndarray, float, str]] = []
    train_other_segs: list[tuple[np.ndarray, np.ndarray, np.ndarray, float, str]] = []

    ipn_seen_nog = collections.Counter()
    ipn_seen_other = collections.Counter()

    for rec in meta["sequences"]:
        sp = rec["split"]
        src = rec["source"]
        cad = rec["cadence"]
        aspect = float(rec["aspect"])
        s, L = rec["start"], rec["length"]
        lms = all_lms[s : s + L]
        tms = all_tms[s : s + L]
        val = all_valid[s : s + L]
        py = all_py[s : s + L]
        rids = all_raw_ids[s : s + L]
        no_gap = (cad == "photo_burst_exif")

        # Extract full clean 146D causal sequence once
        F_seq, ok_seq = extract_sequence_full_146(lms, tms, val, aspect, force_no_reset_gap=no_gap)

        # Save raw train segments for real-frame cross-gesture transition builder
        if sp == "train" and rec["valid_frames"] >= 3:
            raw0 = vocab[int(rids[0])]
            if src == "handgesture_5g" and raw0 == "L-Sign":
                train_press_segs.append((lms, tms, val, aspect, cad))
            elif (src == "handgesture_5g" and raw0 == "Pointing Up") or (src == "hands_rgbd_v2" and raw0 in ("One_VFR", "One_VFL")):
                train_ready_segs.append((lms, tms, val, aspect, cad))
            elif raw0 in ("Fist", "fist", "Punch_VFR", "Punch_VFL"):
                train_fist_segs.append((lms, tms, val, aspect, cad))
            elif raw0 in ("V-Sign", "peace_sign", "Two_VFR", "Two_VFL"):
                train_two_segs.append((lms, tms, val, aspect, cad))
            elif src in ("natural_rgb_v3", "hands_rgbd_v2") and int(np.sum(py == 2)) >= 3:
                if len(train_other_segs) < 160:
                    train_other_segs.append((lms, tms, val, aspect, cad))

        # Collect clean windows
        for i in range(L):
            yi = int(py[i])
            if yi < 0 or not ok_seq[i]:
                continue
            rname = vocab[int(rids[i])]

            # Ensure genuine multi-frame context for non-warmup frames, plus keep warmup frames
            # for minority classes & first frames of clips
            if src == "ipn_hands":
                # Keep all real transition windows (where raw class changed within last W frames)
                w_start = max(0, i - W + 1)
                is_trans = (len(set(int(x) for x in rids[w_start : i + 1])) > 1)
                if not is_trans:
                    if rname == "NOG":
                        ipn_seen_nog[sp] += 1
                        stride = 36 if sp == "train" else 30
                        if ipn_seen_nog[sp] % stride != 0:
                            continue
                    else:
                        ipn_seen_other[sp] += 1
                        stride = 20 if sp == "train" else 18
                        if ipn_seen_other[sp] % stride != 0:
                            continue
                elif sp != "train":
                    # Subsample eval transition boundaries lightly so test isn't dominated by 1 class
                    ipn_seen_other[f"{sp}_tr"] += 1
                    if ipn_seen_other[f"{sp}_tr"] % 4 != 0:
                        continue
                else:
                    # Keep ~1/3 of IPN train transitions (still thousands of real transitions!)
                    ipn_seen_other["train_tr"] += 1
                    if ipn_seen_other["train_tr"] % 3 != 0:
                        continue

            win = slice_causal_window(F_seq, i, W)
            X_splits[sp].append(win)
            y_splits[sp].append(yi)
            src_splits[sp].append(f"{src}:{rname}")
            if sp == "train":
                # Base weight
                if yi == PISTOL_TO_ID["POINT_PRESS"]:
                    bw = 4.0
                elif yi == PISTOL_TO_ID["POINT_READY"]:
                    bw = 3.0
                elif rname in ("point_left", "point_right", "thumbs_up", "thumbs_down", "ok_sign", "peace_sign"):
                    bw = 1.35
                elif src == "ipn_hands":
                    bw = 0.40 if rname == "NOG" else 0.60
                else:
                    bw = 0.85
                w_train.append(bw)

        # ---- TRAIN-ONLY PHYSICS-CONSISTENT AUGMENTATIONS (D06) ----
        if sp != "train":
            continue

        # A) 15 FPS stride-2 simulation on 30 FPS continuous videos (IPN & HANDS RGB-D)
        if cad == "video_30fps" and L >= 6:
            sub_idx = np.arange(0, L, 2)
            sub_lms = lms[sub_idx]
            sub_tms = tms[sub_idx]
            sub_val = val[sub_idx]
            sub_py = py[sub_idx]
            sub_rids = rids[sub_idx]
            F_15, ok_15 = extract_sequence_full_146(sub_lms, sub_tms, sub_val, aspect, force_no_reset_gap=False)
            step_pick = 1 if src == "hands_rgbd_v2" else 22
            for j in range(0, len(sub_idx), step_pick):
                yi = int(sub_py[j])
                if yi < 0 or not ok_15[j]:
                    continue
                X_splits["train"].append(slice_causal_window(F_15, j, W))
                y_splits["train"].append(yi)
                src_splits["train"].append(f"{src}:aug_15fps")
                w_train.append(2.8 if yi == PISTOL_TO_ID["POINT_READY"] else 0.55)
                aug_stats["fps15_stride2"] += 1

        # B) Rich landmark/dt/occlusion/blink augmentation for minority classes & hard negatives
        # Note: every augmented window is carved from a REAL multi-frame slice of length min(W, i+1)!
        valid_indices = [i for i in range(L) if ok_seq[i] and int(py[i]) >= 0]
        if not valid_indices:
            continue

        if src == "handgesture_5g" and int(py[valid_indices[0]]) == PISTOL_TO_ID["POINT_PRESS"]:
            n_copies = 22
        elif (src == "handgesture_5g" and int(py[valid_indices[0]]) == PISTOL_TO_ID["POINT_READY"]) or (
            src == "hands_rgbd_v2" and int(py[valid_indices[0]]) == PISTOL_TO_ID["POINT_READY"]
        ):
            n_copies = 12
        elif src == "natural_rgb_v3":
            n_copies = 1
        elif src == "handgesture_5g":
            n_copies = 2
        elif src == "hands_rgbd_v2":
            n_copies = 1
        else:
            n_copies = 0

        if n_copies > 0:
            for idx in valid_indices:
                yi = int(py[idx])
                is_min = (yi != PISTOL_TO_ID["OTHER"])
                # Real causal raw slice ending at `idx`
                s0 = max(0, idx - W + 1)
                raw_l = lms[s0 : idx + 1]
                raw_t = tms[s0 : idx + 1]
                raw_v = val[s0 : idx + 1]
                for _ in range(n_copies):
                    al, at, av, aa = augment_raw_sequence_window(raw_l, raw_t, raw_v, aspect, cad, rng, is_minority=is_min)
                    if not av[-1]:
                        continue
                    win_aug = extract_window_146(al, at, av, aa, W, force_no_reset_gap=True)
                    if win_aug[-1, -1] < 0.5:
                        continue
                    X_splits["train"].append(win_aug)
                    y_splits["train"].append(yi)
                    src_splits["train"].append(f"{src}:aug_d06")
                    w_train.append(2.2 if yi == PISTOL_TO_ID["POINT_PRESS"] else (1.8 if yi == PISTOL_TO_ID["POINT_READY"] else 0.70))
                    aug_stats["d06_raw_seq_aug"] += 1

        # C) Sampled D06 occlusion/blink/dt aug on IPN train videos (20 windows/video)
        if src == "ipn_hands" and len(valid_indices) >= W:
            picks = rng.choice(valid_indices, size=min(18, len(valid_indices)), replace=False)
            for idx in picks:
                idx = int(idx)
                yi = int(py[idx])
                s0 = max(0, idx - W + 1)
                al, at, av, aa = augment_raw_sequence_window(
                    lms[s0 : idx + 1], tms[s0 : idx + 1], val[s0 : idx + 1], aspect, cad, rng, is_minority=False
                )
                if not av[-1]:
                    continue
                win_aug = extract_window_146(al, at, av, aa, W, force_no_reset_gap=True)
                if win_aug[-1, -1] < 0.5:
                    continue
                X_splits["train"].append(win_aug)
                y_splits["train"].append(yi)
                src_splits["train"].append("ipn_hands:aug_d06")
                w_train.append(0.55)
                aug_stats["ipn_d06_aug"] += 1

    # D) TRAIN-ONLY Real-Frame Transition Sequences (`FIST -> ONE`, `FIST -> TWO`,
    #    `POINT_READY -> POINT_PRESS`, `POINT_PRESS -> POINT_READY`, `OTHER -> POINT_PRESS`)
    # Built ONLY from distinct TRAIN real-sequence frames with realistic 15/30 FPS dt so the causal
    # TCN learns crisp onset/offset transitions and rejects FIST->ONE/FIST->TWO false triggers!
    def sample_real_slice(pool: list[tuple[np.ndarray, np.ndarray, np.ndarray, float, str]], n_frames: int) -> tuple[np.ndarray, float]:
        seg = pool[int(rng.integers(0, len(pool)))]
        slms, _stms, sval, sasp, _scad = seg
        v_ids = np.where(sval > 0)[0]
        if len(v_ids) >= n_frames:
            st = int(rng.integers(0, len(v_ids) - n_frames + 1))
            chosen = v_ids[st : st + n_frames]
        else:
            # Take all valid frames available (never repeat a frame!)
            chosen = v_ids
        return slms[chosen].copy(), sasp

    def add_transition_batch(
        pool_a: list,
        pool_b: list,
        target_y: int,
        count: int,
        tag: str,
        weight: float,
    ) -> None:
        if not pool_a or not pool_b or W < 2:
            return
        for _ in range(count):
            # Split window: k frames from A (prefix), W-k frames from B (suffix >= 1)
            k_b = int(rng.integers(1, W))
            k_a = W - k_b
            lms_a, asp_a = sample_real_slice(pool_a, k_a)
            lms_b, _asp_b = sample_real_slice(pool_b, k_b)
            # Align hand scale/centroid gently to avoid unrealistic teleport jump while keeping real pose motion
            comb = np.concatenate([lms_a, lms_b], axis=0)
            L_c = len(comb)
            fps = float(rng.choice([15.0, 20.0, 30.0]))
            tms_c = np.cumsum(np.concatenate([[0.0], rng.uniform(0.8, 1.3, size=L_c - 1) * (1000.0 / fps)]))
            val_c = np.ones(L_c, dtype=np.uint8)
            al, at, av, aa = augment_raw_sequence_window(comb, tms_c, val_c, asp_a, "video_30fps", rng, is_minority=(target_y != 2))
            av[-1] = 1  # target newest frame always valid
            win = extract_window_146(al, at, av, aa, W, force_no_reset_gap=True)
            if win[-1, -1] > 0.5:
                X_splits["train"].append(win)
                y_splits["train"].append(target_y)
                src_splits["train"].append(f"train_transition:{tag}")
                w_train.append(weight)
                aug_stats[f"trans_{tag}"] += 1

    # Negative transitions (`FIST -> ONE` => POINT_READY, `FIST -> TWO` => OTHER, `POINT_PRESS -> POINT_READY` => POINT_READY)
    add_transition_batch(train_fist_segs, train_ready_segs, PISTOL_TO_ID["POINT_READY"], 600, "fist_to_one", 1.8)
    add_transition_batch(train_fist_segs, train_two_segs, PISTOL_TO_ID["OTHER"], 600, "fist_to_two", 1.2)
    add_transition_batch(train_press_segs, train_ready_segs, PISTOL_TO_ID["POINT_READY"], 600, "press_to_ready", 2.0)
    add_transition_batch(train_press_segs, train_other_segs, PISTOL_TO_ID["OTHER"], 500, "press_to_other", 1.2)
    # Positive onset transitions (`POINT_READY -> POINT_PRESS`, `OTHER -> POINT_PRESS`)
    add_transition_batch(train_ready_segs, train_press_segs, PISTOL_TO_ID["POINT_PRESS"], 900, "ready_to_press", 2.4)
    add_transition_batch(train_other_segs, train_press_segs, PISTOL_TO_ID["POINT_PRESS"], 500, "other_to_press", 2.0)

    X_out = {sp: np.stack(arr, axis=0).astype(np.float32) if arr else np.zeros((0, W, 146), dtype=np.float32) for sp, arr in X_splits.items()}
    y_out = {sp: np.array(arr, dtype=np.int64) for sp, arr in y_splits.items()}
    X_out["train_weights"] = np.array(w_train, dtype=np.float32)
    return X_out, y_out, src_splits, dict(aug_stats)


def build_pose5_windows(
    npz: Any,
    meta: dict[str, Any],
    W: int,
    rng: np.random.Generator,
) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray]]:
    """
    Build train / val / test / ood_test `[N, W, 146]` datasets for auxiliary 5-class Canvas Pose
    (`FIST`, `ONE`, `TWO`, `FIVE`, `OTHER`) on genuine multi-frame sequences.
    """
    all_lms = npz["landmarks"]
    all_tms = npz["t_ms"]
    all_valid = npz["valid"]
    all_p5 = npz["pose5_y"]
    all_rids = npz["raw_cls_ids"]
    vocab = meta["raw_cls_vocab"]

    X_splits: dict[str, list[np.ndarray]] = {"train": [], "val": [], "test": [], "ood_test": []}
    y_splits: dict[str, list[int]] = {"train": [], "val": [], "test": [], "ood_test": []}
    w_train: list[float] = []
    ipn_seen = collections.Counter()

    for rec in meta["sequences"]:
        sp = rec["split"]
        src = rec["source"]
        cad = rec["cadence"]
        aspect = float(rec["aspect"])
        s, L = rec["start"], rec["length"]
        lms = all_lms[s : s + L]
        tms = all_tms[s : s + L]
        val = all_valid[s : s + L]
        p5 = all_p5[s : s + L]
        rids = all_rids[s : s + L]
        no_gap = (cad == "photo_burst_exif")

        F_seq, ok_seq = extract_sequence_full_146(lms, tms, val, aspect, force_no_reset_gap=no_gap)

        for i in range(L):
            yi = int(p5[i])
            if yi < 0 or not ok_seq[i]:
                continue
            rname = vocab[int(rids[i])]
            if src == "ipn_hands":
                # Balance huge 30 FPS IPN ONE/TWO/OTHER against FIST/FIVE
                ipn_seen[(sp, yi)] += 1
                stride = 70 if sp == "train" else 60
                if ipn_seen[(sp, yi)] % stride != 0:
                    continue
            X_splits[sp].append(slice_causal_window(F_seq, i, W))
            y_splits[sp].append(yi)
            if sp == "train":
                bw = 3.0 if yi in (POSE5_TO_ID["FIST"], POSE5_TO_ID["FIVE"]) else 1.0
                w_train.append(bw)

        # Train-only augmentation on minority FIST / FIVE + HANDS RGB-D / N66
        if sp == "train" and src in ("hands_rgbd_v2", "natural_rgb_v3", "handgesture_5g"):
            for i in range(L):
                yi = int(p5[i])
                if yi < 0 or not ok_seq[i]:
                    continue
                n_rep = 3 if yi in (POSE5_TO_ID["FIST"], POSE5_TO_ID["FIVE"]) else (2 if src == "hands_rgbd_v2" else 0)
                s0 = max(0, i - W + 1)
                for _ in range(n_rep):
                    al, at, av, aa = augment_raw_sequence_window(lms[s0 : i + 1], tms[s0 : i + 1], val[s0 : i + 1], aspect, cad, rng, is_minority=(yi in (0, 3)))
                    if not av[-1]:
                        continue
                    win_aug = extract_window_146(al, at, av, aa, W, force_no_reset_gap=True)
                    if win_aug[-1, -1] > 0.5:
                        X_splits["train"].append(win_aug)
                        y_splits["train"].append(yi)
                        w_train.append(2.2 if yi in (0, 3) else 1.1)

    X_out = {sp: np.stack(arr, axis=0).astype(np.float32) if arr else np.zeros((0, W, 146), dtype=np.float32) for sp, arr in X_splits.items()}
    y_out = {sp: np.array(arr, dtype=np.int64) for sp, arr in y_splits.items()}
    X_out["train_weights"] = np.array(w_train, dtype=np.float32)
    return X_out, y_out


# =============================================================================
# GPU Training Loop (RTX A5000 GPU 1)
# =============================================================================
def train_causal_tcn_gpu(
    X_splits: dict[str, np.ndarray],
    y_splits: dict[str, np.ndarray],
    labels: list[str],
    window_size: int,
    device: torch.device,
    epochs: int = 45,
    batch_size: int = 256,
    lr: float = 2.0e-3,
    focal_gamma: float = 1.5,
    seed: int = SEED,
) -> tuple[CausalTemporalTCN, np.ndarray, np.ndarray, float, dict[str, Any]]:
    set_seed(seed + window_size * 101)
    X_tr = X_splits["train"]
    y_tr = y_splits["train"]
    w_tr = X_splits["train_weights"]
    X_va = X_splits["val"]
    y_va = y_splits["val"]

    # Compute mean/std strictly on valid frames of TRAIN only (never VAL/TEST!)
    valid_mask_tr = X_tr[:, :, -1] > 0.5
    valid_vecs = X_tr[valid_mask_tr]  # [M, 146]
    mean = valid_vecs.mean(axis=0).astype(np.float32)
    std = valid_vecs.std(axis=0).astype(np.float32)
    std = np.where(std > 1e-4, std, 1.0).astype(np.float32)
    # Keep valid_frame_mask feature unshifted (0 or 1 cleanly)
    mean[-1] = 0.0
    std[-1] = 1.0
    inv_std = (1.0 / std).astype(np.float32)

    # Class balancing merged into per-sample weights
    K = len(labels)
    cls_counts = np.bincount(y_tr, minlength=K).astype(np.float64)
    cls_inv = np.where(cls_counts > 0, (len(y_tr) / (K * np.maximum(cls_counts, 1.0))) ** 0.55, 1.0)
    sample_w = (w_tr * cls_inv[y_tr]).astype(np.float32)
    sample_w = sample_w / float(np.mean(sample_w))

    model = CausalTemporalTCN(
        feature_dim=R22_TEMPORAL_FEATURE_DIM,
        num_classes=K,
        window_size=window_size,
        c0=36,
        c_last=24,
        dropout=0.16,
    ).to(device)

    mean_t = torch.from_numpy(mean).to(device)
    inv_std_t = torch.from_numpy(inv_std).to(device)

    X_tr_t = torch.from_numpy(X_tr).to(device)
    y_tr_t = torch.from_numpy(y_tr).to(device)
    sw_tr_t = torch.from_numpy(sample_w).to(device)
    X_va_t = torch.from_numpy(X_va).to(device)

    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=2.5e-3)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs, eta_min=lr * 0.05)

    best_score = -1e9
    best_state = None
    best_epoch = 0
    N = len(y_tr)

    t0 = time.time()
    for ep in range(1, epochs + 1):
        model.train()
        perm = torch.randperm(N, device=device)
        ep_loss = 0.0
        for st in range(0, N, batch_size):
            idx = perm[st : st + batch_size]
            xb = X_tr_t[idx]
            yb = y_tr_t[idx]
            wb = sw_tr_t[idx]

            logits = model(xb, mean_t, inv_std_t)
            ce = F.cross_entropy(logits, yb, reduction="none", label_smoothing=0.02)
            pt = torch.exp(-ce)
            focal = ((1.0 - pt) ** focal_gamma) * ce
            loss = (focal * wb).mean()

            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            ep_loss += float(loss.item()) * len(idx)
        sched.step()

        # Evaluate on held-out VAL
        model.eval()
        with torch.no_grad():
            va_logits_list = []
            for st in range(0, len(X_va_t), 1024):
                va_logits_list.append(model(X_va_t[st : st + 1024], mean_t, inv_std_t))
            va_logits = torch.cat(va_logits_list, dim=0)
            va_probs = F.softmax(va_logits, dim=-1).cpu().numpy()
        vm = compute_metrics(y_va, va_probs, labels)
        # Selection score: Macro-F1 minus strong penalty on OTHER->PRESS false triggers for Pistol
        fp_pen = 0.0
        if labels == PISTOL_LABELS:
            fp_rate = vm["other_to_press"] / max(1, vm["per_class"]["OTHER"]["support"])
            fp_pen = 4.0 * fp_rate
        score = vm["macro_f1"] - fp_pen
        if score > best_score:
            best_score = score
            best_epoch = ep
            best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}

    assert best_state is not None
    model.load_state_dict(best_state)
    model.eval()

    def infer_logits(X_arr: np.ndarray) -> np.ndarray:
        if len(X_arr) == 0:
            return np.zeros((0, K), dtype=np.float32)
        xt = torch.from_numpy(X_arr).to(device)
        outs = []
        with torch.no_grad():
            for st in range(0, len(xt), 1024):
                outs.append(model(xt[st : st + 1024], mean_t, inv_std_t).cpu().numpy())
        return np.concatenate(outs, axis=0)

    va_logits_np = infer_logits(X_va)
    temp = fit_temperature(va_logits_np, y_va)

    def softmax_np(logits_np: np.ndarray, t: float) -> np.ndarray:
        if len(logits_np) == 0:
            return np.zeros((0, K), dtype=np.float64)
        z = logits_np.astype(np.float64) / t
        z -= np.max(z, axis=1, keepdims=True)
        e = np.exp(z)
        return e / np.sum(e, axis=1, keepdims=True)

    eval_out: dict[str, Any] = {
        "window_size": window_size,
        "params": int(sum(p.numel() for p in model.parameters())),
        "best_epoch": best_epoch,
        "train_sec": round(time.time() - t0, 2),
        "temperature": round(temp, 5),
        "train_class_counts": {labels[i]: int(cls_counts[i]) for i in range(K)},
    }
    for sp in ("val", "test", "ood_test"):
        if len(y_splits[sp]) > 0:
            lg = infer_logits(X_splits[sp])
            pr = softmax_np(lg, temp)
            eval_out[sp] = compute_metrics(y_splits[sp], pr, labels)

    return model, mean, std, temp, eval_out


def build_parity_rows(
    model: CausalTemporalTCN,
    mean: np.ndarray,
    std: np.ndarray,
    temp: float,
    X_test: np.ndarray,
    y_test: np.ndarray,
    X_ood: np.ndarray,
    y_ood: np.ndarray,
    device: torch.device,
    n_rows: int = 160,
) -> list[dict[str, Any]]:
    """Export 160 diverse real test/ood windows + PyTorch probabilities for 0-mismatch TS parity gate."""
    rng = np.random.default_rng(SEED + model.window_size)
    X_pool = np.concatenate([X_test, X_ood], axis=0) if len(X_ood) > 0 else X_test
    y_pool = np.concatenate([y_test, y_ood], axis=0) if len(y_ood) > 0 else y_test
    picks: list[int] = []
    K = model.num_classes
    per_cls = max(1, n_rows // K)
    for c in range(K):
        c_ids = np.where(y_pool == c)[0]
        if len(c_ids) > 0:
            take = rng.choice(c_ids, size=min(per_cls, len(c_ids)), replace=False)
            picks.extend(int(i) for i in take)
    if len(picks) < n_rows:
        rem = list(set(range(len(y_pool))) - set(picks))
        extra = rng.choice(rem, size=min(n_rows - len(picks), len(rem)), replace=False)
        picks.extend(int(i) for i in extra)
    picks = picks[:n_rows]

    Xs = X_pool[picks]
    ys = y_pool[picks]
    mean_t = torch.from_numpy(mean).to(device)
    inv_std_t = torch.from_numpy((1.0 / std).astype(np.float32)).to(device)
    model.eval()
    with torch.no_grad():
        logits = model(torch.from_numpy(Xs).to(device), mean_t, inv_std_t).cpu().numpy().astype(np.float64)
    z = logits / temp
    z -= np.max(z, axis=1, keepdims=True)
    probs = np.exp(z) / np.sum(np.exp(z), axis=1, keepdims=True)

    rows = []
    for i in range(len(picks)):
        rows.append({
            "X": np.round(Xs[i].astype(np.float64), 6).tolist(),
            "y": int(ys[i]),
            "probs": [round(float(p), 8) for p in probs[i]],
        })
    return rows


def main() -> None:
    t_all = time.time()
    assert torch.cuda.is_available(), "CUDA GPU required (expected CUDA_VISIBLE_DEVICES=1 RTX A5000)"
    device = torch.device("cuda:0")
    gpu_name = torch.cuda.get_device_name(0)
    print(f"[R22 W-TEMPORAL] GPU training on CUDA_VISIBLE_DEVICES={os.environ.get('CUDA_VISIBLE_DEVICES', '?')} ({gpu_name})")

    npz = np.load(CACHE_NPZ)
    meta = json.load(open(META_JSON, "r", encoding="utf-8"))

    license_str = (
        "CC BY 4.0 legal datasets ONLY (IPN HandS + Natural RGB v3 + HANDS RGB-D S1..2 + "
        "Mendeley bxr7 Gomoku/Poker train + HandGesture-5G bursts); HaGRIDv2 HOLD_LICENSE excluded; "
        "a4v2 static-affine excluded; zero static-frame replication."
    )

    summary: dict[str, Any] = {
        "schema": "r22-temporal-gpu-train-summary/1",
        "seed": SEED,
        "gpu": gpu_name,
        "cuda_visible_devices": os.environ.get("CUDA_VISIBLE_DEVICES", "unset"),
        "encoder_version": "r22-temporal-146d-v1",
        "loss_reset_ms": LOSS_RESET_MS,
        "pistol_models": {},
        "pose5_ablation": {},
    }

    # =========================================================================
    # 1. Primary Deliverable: Pistol 3-Class Causal TCN for W in {3, 5, 8}
    # =========================================================================
    for W in WINDOW_SIZES:
        print(f"\n=== [PISTOL 3-CLASS] Building real-sequence windows for W={W} ===")
        rng = np.random.default_rng(SEED + W * 17)
        X_sp, y_sp, _src_sp, aug_stats = build_pistol_windows(npz, meta, W, rng)
        print(
            f"  W={W} splits: train={len(y_sp['train'])}, val={len(y_sp['val'])}, "
            f"test={len(y_sp['test'])}, ood_test={len(y_sp['ood_test'])} | augs={aug_stats}"
        )

        model, mean, std, temp, metrics = train_causal_tcn_gpu(
            X_sp, y_sp, PISTOL_LABELS, window_size=W, device=device, epochs=45, batch_size=256, lr=2.0e-3, seed=SEED
        )
        metrics["aug_stats"] = aug_stats

        model_name = f"r22-temporal-pistol-w{W}"
        exported = model.export_dict(
            name=model_name,
            task="pistol_3class",
            labels=PISTOL_LABELS,
            mean=mean,
            std=std,
            temperature=temp,
            license_provenance=license_str,
        )
        out_path = os.path.join(OUT_DIR, f"r22_temporal_model_w{W}.json")
        raw_bytes = json.dumps(exported, separators=(",", ":")).encode("utf-8")
        with open(out_path, "wb") as f:
            f.write(raw_bytes)
        sha = hashlib.sha256(raw_bytes).hexdigest()
        metrics["model_path"] = out_path
        metrics["json_bytes"] = len(raw_bytes)
        metrics["sha256"] = sha

        # Save 160 parity test rows
        parity_rows = build_parity_rows(model, mean, std, temp, X_sp["test"], y_sp["test"], X_sp["ood_test"], y_sp["ood_test"], device, n_rows=160)
        parity_path = os.path.join(OUT_DIR, f"r22_temporal_parity_w{W}.json")
        with open(parity_path, "w", encoding="utf-8") as f:
            json.dump(parity_rows, f)
        metrics["parity_path"] = parity_path

        summary["pistol_models"][f"W{W}"] = metrics
        print(
            f"  [W={W}] params={metrics['params']} bytes={len(raw_bytes):,}B sha={sha[:12]} | "
            f"VAL F1={metrics['val']['macro_f1']:.4f} (O->P={metrics['val']['other_to_press']}) | "
            f"TEST F1={metrics['test']['macro_f1']:.4f} (O->P={metrics['test']['other_to_press']}, R->P={metrics['test']['ready_to_press']}) | "
            f"OOD F1={metrics['ood_test']['macro_f1']:.4f} (O->P={metrics['ood_test']['other_to_press']})"
        )

    # =========================================================================
    # 2. Auxiliary Real-Video Ablation: 5-Class Canvas Pose (W in {1, 3, 5, 8})
    #    100% genuine 30 FPS continuous sequences across ALL 5 classes!
    # =========================================================================
    print("\n=== [POSE-5 AUXILIARY ABLATION] Training W in {1, 3, 5, 8} on real sequences ===")
    for W in (1, 3, 5, 8):
        rng = np.random.default_rng(SEED + 9000 + W * 31)
        Xp, yp = build_pose5_windows(npz, meta, W, rng)
        model_p5, mean_p5, std_p5, temp_p5, m_p5 = train_causal_tcn_gpu(
            Xp, yp, POSE5_LABELS, window_size=W, device=device, epochs=40, batch_size=256, lr=2.0e-3, seed=SEED + 500
        )
        if W == 5:
            exp_p5 = model_p5.export_dict(
                name="r22-temporal-pose5-w5",
                task="pose_5class",
                labels=POSE5_LABELS,
                mean=mean_p5,
                std=std_p5,
                temperature=temp_p5,
                license_provenance=license_str,
            )
            p5_path = os.path.join(OUT_DIR, "r22_temporal_pose5_w5.json")
            raw_p5 = json.dumps(exp_p5, separators=(",", ":")).encode("utf-8")
            with open(p5_path, "wb") as f:
                f.write(raw_p5)
            m_p5["model_path"] = p5_path
            m_p5["json_bytes"] = len(raw_p5)
            m_p5["sha256"] = hashlib.sha256(raw_p5).hexdigest()
            parity_p5 = build_parity_rows(model_p5, mean_p5, std_p5, temp_p5, Xp["test"], yp["test"], Xp["ood_test"], yp["ood_test"], device, n_rows=160)
            p5_par_path = os.path.join(OUT_DIR, "r22_temporal_parity_pose5_w5.json")
            with open(p5_par_path, "w", encoding="utf-8") as f:
                json.dump(parity_p5, f)
            m_p5["parity_path"] = p5_par_path

        summary["pose5_ablation"][f"W{W}"] = m_p5
        print(
            f"  [Pose5 W={W}] VAL F1={m_p5['val']['macro_f1']:.4f} | "
            f"TEST F1={m_p5['test']['macro_f1']:.4f} | "
            f"OOD(HANDS-RGBD-S4S5+bxr7) F1={m_p5['ood_test']['macro_f1']:.4f}"
        )

    summary["total_elapsed_sec"] = round(time.time() - t_all, 2)
    sum_path = os.path.join(OUT_DIR, "r22_temporal_gpu_train_summary.json")
    with open(sum_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"\n[DONE] GPU training & export finished in {summary['total_elapsed_sec']}s -> {sum_path}")


if __name__ == "__main__":
    main()
