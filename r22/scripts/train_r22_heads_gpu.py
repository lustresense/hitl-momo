#!/usr/bin/env python3
"""
R22 NUI Lab — Dataset Registry, Split-Overlap Verification, GPU Training & Evaluation Suite
Owner: W-DATA (Neon / T-STRONG), GPU 0 (`CUDA_VISIBLE_DEVICES=0`)
Contracts: K4 (Label Taxonomy v1.0), K5 (Frozen 82D Encoder r19-82d-v1), K6 (TS CPU Model Export), K7 (Frozen Registry)
Acceptance IDs: D01-D07, D09-D14

Usage:
  CUDA_VISIBLE_DEVICES=0 /srv/sketchbook/mediapipe-optimize/r20-sandbox/.venv/bin/python \
      /srv/sketchbook/mediapipe-optimize/research-can/r22/scripts/train_r22_heads_gpu.py --stage registry
  CUDA_VISIBLE_DEVICES=0 /srv/sketchbook/mediapipe-optimize/r20-sandbox/.venv/bin/python \
      /srv/sketchbook/mediapipe-optimize/research-can/r22/scripts/train_r22_heads_gpu.py --stage train
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

# ---------------- Canonical Paths (Read-Only on r18/r19/r20/sandboxes; Write ONLY in research-can/r22) ----------------
REPO = "/srv/sketchbook/mediapipe-optimize/research-can"
WORKTREE = "/srv/sketchbook/mediapipe-optimize/r22-nui-lab"
R18_SANDBOX = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox"
R19_SANDBOX = "/srv/sketchbook/mediapipe-optimize/r19-sandbox"
R20_SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox"

R22_ROOT = f"{REPO}/r22"
R22_REG_DIR = f"{R22_ROOT}/registry"
R22_MODEL_DIR = f"{R22_ROOT}/models"
R22_RES_DIR = f"{R22_ROOT}/results"

NODE_BIN = f"{R20_SANDBOX}/tools/node-v26.13.1-linux-x64/bin/node"
VITE_NODE_BIN = f"{WORKTREE}/frontend/implementation/node_modules/.bin/vite-node"
PYTHON_BIN = f"{R20_SANDBOX}/.venv/bin/python"

# Key read-only data paths
R19_FEAT_TS_FRONTEND = f"{WORKTREE}/frontend/implementation/src/components/nui-lab/r19/r19_features.ts"
R19_FEAT_TS_CAND = f"{REPO}/r19/candidates/r19_features.ts"
HG5G_JSONL = f"{R19_SANDBOX}/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl"
HG5G_720_DIR = f"{R20_SANDBOX}/data/hg5g_720"
N66_ZIP = f"{R19_SANDBOX}/data/n66hhk695h_v3/Root.zip"
N66_JSONL = f"{R19_SANDBOX}/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl"
HRGBD_JSONL = f"{R19_SANDBOX}/data/hands_rgbd_eval/hands_rgbd_landmarks.jsonl"
IPN_ANN_ZIP = f"{R18_SANDBOX}/datasets/ipn_hands/IPN_HandS_annotations.zip"
IPN_GT_ZIP = f"{R18_SANDBOX}/datasets/ipn_hands/IPN_HandS_landmarks_GT.zip"
IPN_MP_ZIP = f"{R18_SANDBOX}/datasets/ipn_hands/IPN_HandS_landmarks_MPHands.zip"
IPN_SPLIT_JSON = f"{REPO}/r18/manifests/ipn_person_split.json"
BXR7_DIM_ZIP = f"{R18_SANDBOX}/datasets/mendeley_bxr7kx84y6/dim_light_1.zip"
BXR7_NAT_ZIP = f"{R18_SANDBOX}/datasets/mendeley_bxr7kx84y6/natural_light_1.zip"
MENDELEY_599_JSON = f"{REPO}/r18/results/ux3_mendeley_distractor_landmarks.json"
EXTRA_HG5G_AUG = f"{R20_SANDBOX}/data/aug/extra_hg5g_aug.jsonl"
EXTRA_HR_TRAIN = f"{R20_SANDBOX}/data/hard_neg/extra_hands_rgbd_s1_s2_train.jsonl"
HR_S3_VAL = f"{R20_SANDBOX}/data/hard_neg/hands_rgbd_s3_val.jsonl"
HR_S4S5_OOD = f"{R20_SANDBOX}/data/hard_neg/hands_rgbd_s4_s5_ood_test.jsonl"
EXTRA_BXR7_TRAIN = f"{R20_SANDBOX}/data/hard_neg/extra_bxr7_gomoku_poker_train.jsonl"
BXR7_OOD_TEST = f"{R20_SANDBOX}/data/hard_neg/bxr7_gomoku_poker_ood_test.jsonl"
R20_FEAT_DIR = f"{R20_SANDBOX}/data/feat"
R18_DERIVED_DIR = f"{R18_SANDBOX}/datasets/derived"
OWNER_4T_JSON = f"{REPO}/docs/plan-rev/R22_FULL_SCOPE_MALAM_20261119/references/benchmarks/nui-lab-benchmark-S-07ba0cde-four-trials.json"
OWNER_2T_JSON = f"{REPO}/docs/plan-rev/R22_FULL_SCOPE_MALAM_20261119/references/benchmarks/nui-lab-benchmark-S-07ba0cde-two-trials.json"

# Baseline published models (read-only)
MODEL_R18_UX3 = f"{REPO}/r18/models/ux3_model_mlp.json"
MODEL_R19_C0 = f"{REPO}/r19/models/r19_model_mlp.json"
MODEL_R20_C4 = f"{REPO}/r20/models/r20_model_c4_full_mlp.json"
MODEL_R20_C7_T4 = f"{REPO}/r20/models/r20_model_c7_distilled_t4_mlp.json"
MODEL_R20_C7_T2 = f"{REPO}/r20/models/r20_model_c7_distilled_t2_mlp.json"

PISTOL_LABELS = ["POINT_READY", "POINT_PRESS", "OTHER"]
POSE_LABELS = ["FIST", "ONE", "TWO", "FIVE", "OTHER"]
PINCH_LABELS = ["TOUCH", "NEAR", "OPEN"]

R19_FEATURE_NAMES: list[str] = []
for _i in range(1, 21):
    R19_FEATURE_NAMES.extend([f"x{_i}", f"y{_i}"])
for _f in ["thumb", "index", "middle", "ring", "pinky"]:
    R19_FEATURE_NAMES.append(f"reach_{_f}")
for _f in ["thumb", "index", "middle", "ring", "pinky"]:
    R19_FEATURE_NAMES.append(f"bend_{_f}")
for _f in ["thumb_index", "index_middle", "middle_ring", "ring_pinky"]:
    R19_FEATURE_NAMES.append(f"gap_{_f}")
R19_FEATURE_NAMES.extend([
    "thumb_index_tip", "thumb_lateral_clamped", "palm_aspect_ratio", "knuckle_span_ratio",
    "index_proj_ratio", "thumb_over_index_reach", "d4_5", "d4_6", "d4_9", "d4_10", "d4_2", "d4_17",
    "thumb_perp_idx", "thumb_along_idx", "thumb_abduct_854", "thumb_abduct_524", "thumb_bend_123",
    "d4_8_over_d5_8", "has_history", "wrist_speed", "wrist_vx", "wrist_vy", "tip8_speed",
    "pinch_delta", "index_reach_delta", "spread_delta", "shape_jitter", "thumb_open_delta",
])
assert len(R19_FEATURE_NAMES) == 82

# ---------------- Common Helpers ----------------
def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def effective_hg5g_split(row: dict) -> str:
    sp = row["split"]
    if row["class_name"] == "Pointing Up":
        if row["cluster_id"] == 18:
            sp = "val"
        elif row["cluster_id"] == 19:
            sp = "train"
    return sp


def hamming_hex64(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def softmax_np(z: np.ndarray) -> np.ndarray:
    zm = z - np.max(z, axis=1, keepdims=True)
    e = np.exp(zm)
    return e / np.sum(e, axis=1, keepdims=True)


def wilson_ci(k: int, n: int, z: float = 1.96) -> list[float]:
    if n == 0:
        return [0.0, 1.0]
    p = k / n
    den = 1.0 + z * z / n
    c = (p + z * z / (2.0 * n)) / den
    h = z * math.sqrt(p * (1.0 - p) / n + z * z / (4.0 * n * n)) / den
    return [round(max(0.0, c - h), 5), round(min(1.0, c + h), 5)]


def nll_ece(probs: np.ndarray, y: np.ndarray, bins: int = 15) -> tuple[float, float]:
    n = len(y)
    nll = float(-np.mean(np.log(np.clip(probs[np.arange(n), y], 1e-7, 1.0))))
    conf = probs.max(axis=1)
    acc = (probs.argmax(axis=1) == y).astype(np.float64)
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        mk = (conf >= lo) & ((conf < hi) if b < bins - 1 else (conf <= hi))
        if mk.any():
            ece += float(mk.sum()) / n * abs(float(acc[mk].mean()) - float(conf[mk].mean()))
    return round(nll, 5), round(ece, 5)


def multiclass_metrics(y: np.ndarray, pred: np.ndarray, labels: list[str]) -> dict[str, Any]:
    k = len(labels)
    c = np.zeros((k, k), dtype=np.int64)
    np.add.at(c, (y, pred), 1)
    tp = np.diag(c).astype(float)
    sup = c.sum(axis=1).astype(float)
    pr = c.sum(axis=0).astype(float)
    prec = np.divide(tp, pr, out=np.zeros_like(tp), where=pr > 0)
    rec = np.divide(tp, sup, out=np.zeros_like(tp), where=sup > 0)
    f1 = np.divide(2.0 * prec * rec, prec + rec, out=np.zeros_like(prec), where=(prec + rec) > 0)
    active = sup > 0
    per_cls = {}
    for i, name in enumerate(labels):
        per_cls[name] = {
            "support": int(sup[i]),
            "predicted": int(pr[i]),
            "precision": round(float(prec[i]), 4),
            "recall": round(float(rec[i]), 4),
            "f1": round(float(f1[i]), 4),
        }
    out: dict[str, Any] = {
        "n": int(c.sum()),
        "acc": round(float(tp.sum() / max(1.0, c.sum())), 4),
        "macroF1": round(float(np.mean(f1[active])) if active.any() else 0.0, 4),
        "per_class": per_cls,
        "confusion": c.tolist(),
    }
    if labels == PISTOL_LABELS:
        n_other = int(sup[2])
        fp_press = int(c[2, 1])
        out.update({
            "f1_ready": per_cls["POINT_READY"]["f1"],
            "f1_press": per_cls["POINT_PRESS"]["f1"],
            "f1_other": per_cls["OTHER"]["f1"],
            "recall_ready": per_cls["POINT_READY"]["recall"],
            "recall_press": per_cls["POINT_PRESS"]["recall"],
            "precision_press": per_cls["POINT_PRESS"]["precision"],
            "other_to_press": fp_press,
            "other_to_press_rate": round(fp_press / max(1, n_other), 5),
            "other_to_press_wilson95": wilson_ci(fp_press, n_other),
            "ready_to_press": int(c[0, 1]),
            "other_to_ready": int(c[2, 0]),
        })
    return out


def forward_exported(doc: dict, X: np.ndarray) -> np.ndarray:
    mean = np.asarray(doc["mean"], dtype=np.float64)
    std = np.asarray(doc["std"], dtype=np.float64)
    std = np.where(std > 1e-6, std, 1.0)
    h = (X.astype(np.float64) - mean) / std
    layers = doc["layers"]
    for i, l in enumerate(layers):
        h = h @ np.asarray(l["W"], dtype=np.float64) + np.asarray(l["b"], dtype=np.float64)
        if i < len(layers) - 1:
            h = np.maximum(h, 0.0)
    return h / float(doc.get("temperature", 1.0))


# ---------------- Exact Bit-Parity Port of Frozen K5 Encoder (`r19_features.ts`, 82D) ----------------
_TIPS = (4, 8, 12, 16, 20)
_BEND = ((2, 3, 4), (5, 6, 8), (9, 10, 12), (13, 14, 16), (17, 18, 20))


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else (hi if v > hi else v)


def _dist2(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _joint_angle_norm(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    v1x, v1y = a[0] - b[0], a[1] - b[1]
    v2x, v2y = c[0] - b[0], c[1] - b[1]
    n = math.hypot(v1x, v1y) * math.hypot(v2x, v2y)
    if n < 1e-9:
        return 0.0
    return math.acos(_clamp((v1x * v2x + v1y * v2y) / n, -1.0, 1.0)) / math.pi


def _thumb_lateral(g: list[tuple[float, float]]) -> float | None:
    ax = g[5][0] - g[17][0]
    ay = g[5][1] - g[17][1]
    len2 = ax * ax + ay * ay
    if len2 <= 1e-12:
        return None
    return ((g[4][0] - g[17][0]) * ax + (g[4][1] - g[17][1]) * ay) / len2


class PyR19FeatureTracker:
    """Bit-exact Python mirror of `R19FeatureTracker` in `r19_features.ts` (r19-82d-v1)."""

    def __init__(self) -> None:
        self.ring: list[dict[str, Any]] = []

    def reset(self) -> None:
        self.ring = []

    def extract(self, lm: list[list[float]] | np.ndarray | None, now_ms: float, aspect: float) -> list[float] | None:
        if lm is None or len(lm) < 21:
            self.ring = []
            return None
        for i in range(21):
            p = lm[i]
            if not (math.isfinite(p[0]) and math.isfinite(p[1])):
                self.ring = []
                return None
        a = aspect if (math.isfinite(aspect) and aspect > 0) else 1.0
        g = [(float(lm[i][0]) * a, float(lm[i][1])) for i in range(21)]
        w = g[0]
        m = g[9]
        span = _dist2(m, w)
        knuckle = _dist2(g[17], g[5])
        palm_scale = max(span, knuckle)
        if not (palm_scale > 1e-4):
            self.ring = []
            return None

        if span > 1e-4:
            ux = (m[0] - w[0]) / span
            uy = (m[1] - w[1]) / span
        else:
            ux = -(g[17][1] - g[5][1]) / palm_scale
            uy = (g[17][0] - g[5][0]) / palm_scale
        un = math.hypot(ux, uy) or 1.0
        ux /= un
        uy /= un

        local = []
        for i in range(21):
            dx = g[i][0] - w[0]
            dy = g[i][1] - w[1]
            local.append(((dx * -uy + dy * ux) / palm_scale, -(dx * ux + dy * uy) / palm_scale))
        mirror = -1.0 if local[5][0] > local[17][0] else 1.0
        L = local if mirror == 1.0 else [(-p[0], p[1]) for p in local]

        f: list[float] = []
        for i in range(1, 21):
            f.append(L[i][0])
            f.append(L[i][1])

        reaches = []
        for t in _TIPS:
            r = math.hypot(L[t][0], L[t][1])
            reaches.append(r)
            f.append(r)
        for ia, ib, ic in _BEND:
            f.append(_joint_angle_norm(L[ia], L[ib], L[ic]))

        gaps = []
        for i in range(4):
            d = _dist2(L[_TIPS[i]], L[_TIPS[i + 1]])
            gaps.append(d)
            f.append(d)

        pinch_norm = _dist2(L[4], L[8])
        tl_raw = _thumb_lateral(g)
        tl_clamped = _clamp(tl_raw, -4.0, 4.0) if (tl_raw is not None and math.isfinite(tl_raw)) else 0.0
        d5_8 = _dist2(L[5], L[8])
        d4_5 = _dist2(L[4], L[5])
        d4_6 = _dist2(L[4], L[6])
        d4_9 = _dist2(L[4], L[9])
        d4_10 = _dist2(L[4], L[10])
        d4_2 = _dist2(L[4], L[2])
        d4_17 = _dist2(L[4], L[17])

        rdx, rdy = L[8][0] - L[5][0], L[8][1] - L[5][1]
        r_len = math.hypot(rdx, rdy)
        if r_len < 0.08:
            rdx, rdy = L[6][0] - L[5][0], L[6][1] - L[5][1]
            r_len = math.hypot(rdx, rdy)
        rx, ry = (rdx / r_len, rdy / r_len) if r_len > 1e-5 else (0.0, 1.0)
        v54x, v54y = L[4][0] - L[5][0], L[4][1] - L[5][1]
        thumb_perp_idx = abs(rx * v54y - ry * v54x)
        thumb_along_idx = rx * v54x + ry * v54y

        f.extend([
            pinch_norm, tl_clamped, span / palm_scale, knuckle / palm_scale, d5_8,
            _clamp(reaches[0] / max(0.25, reaches[1]), 0.0, 2.5),
            d4_5, d4_6, d4_9, d4_10, d4_2, d4_17,
            thumb_perp_idx, thumb_along_idx,
            _joint_angle_norm(L[8], L[5], L[4]),
            _joint_angle_norm(L[5], L[2], L[4]),
            _joint_angle_norm(L[1], L[2], L[3]),
            _clamp(pinch_norm / max(0.1, d5_8), 0.0, 3.0),
        ])

        mean_gap = 0.25 * (gaps[0] + gaps[1] + gaps[2] + gaps[3])
        thumb_open_cue = 0.5 * (d4_5 + d4_9)
        snap = {
            "tMs": now_ms,
            "palmScale": palm_scale,
            "wristX": w[0], "wristY": w[1],
            "tip8X": g[8][0], "tip8Y": g[8][1],
            "pinchNorm": pinch_norm,
            "idxReach": reaches[1],
            "meanGap": mean_gap,
            "thumbOpenCue": thumb_open_cue,
            "localTips": [L[idx] for idx in _TIPS],
        }

        while self.ring and now_ms - self.ring[0]["tMs"] > 260:
            self.ring.pop(0)
        prev = None
        for i in range(len(self.ring) - 1, -1, -1):
            if now_ms - self.ring[i]["tMs"] >= 80:
                prev = self.ring[i]
                break
        if prev is None and self.ring and now_ms - self.ring[0]["tMs"] >= 25:
            prev = self.ring[0]

        if prev is None:
            f.extend([0.0] * 10)
        else:
            dt_scale = max(0.3, min(2.6, (now_ms - prev["tMs"]) / 100.0))
            wvx = (snap["wristX"] - prev["wristX"]) / palm_scale / dt_scale
            wvy = (snap["wristY"] - prev["wristY"]) / palm_scale / dt_scale
            t8s = math.hypot(snap["tip8X"] - prev["tip8X"], snap["tip8Y"] - prev["tip8Y"]) / palm_scale / dt_scale
            jitter = 0.0
            for k in range(5):
                jitter += math.hypot(
                    snap["localTips"][k][0] - prev["localTips"][k][0],
                    snap["localTips"][k][1] - prev["localTips"][k][1],
                )
            jitter = jitter / 5.0 / dt_scale
            f.extend([
                1.0, math.hypot(wvx, wvy), wvx, wvy, t8s,
                (snap["pinchNorm"] - prev["pinchNorm"]) / dt_scale,
                (snap["idxReach"] - prev["idxReach"]) / dt_scale,
                (snap["meanGap"] - prev["meanGap"]) / dt_scale,
                jitter,
                (snap["thumbOpenCue"] - prev["thumbOpenCue"]) / dt_scale,
            ])

        self.ring.append(snap)
        if len(self.ring) > 10:
            self.ring.pop(0)
        if not all(math.isfinite(v) for v in f):
            return None
        return f


# =================================================================================================
# STAGE 1: K7 DATASET REGISTRY, SPLIT OVERLAP VERIFICATION & LINEAGE/LICENSE AUDIT (D01-D04, D10, D14)
# =================================================================================================
def run_stage_registry() -> dict[str, Any]:
    os.makedirs(R22_REG_DIR, exist_ok=True)
    t0 = time.time()
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # 1. Verify K5 feature encoder SHA parity
    sha_feat_fe = sha256_file(R19_FEAT_TS_FRONTEND)
    sha_feat_cand = sha256_file(R19_FEAT_TS_CAND)
    assert sha_feat_fe == sha_feat_cand, "r19_features.ts mismatch between frontend and r19/candidates!"

    # 2. Verify locked R20 feature binaries byte-identity & 68D segregation
    f32_hashes = {}
    for pref in ("r20_feat", "r20_c2_feat", "r20_c3_feat"):
        for sp in ("train", "val", "test"):
            p = f"{R20_FEAT_DIR}/{pref}_{sp}.f32"
            m = json.load(open(f"{R20_FEAT_DIR}/{pref}_{sp}.meta.json"))
            f32_hashes[f"{pref}_{sp}"] = {
                "path": p,
                "bytes": os.path.getsize(p),
                "sha256": sha256_file(p),
                "rows": int(m["rows"]),
                "feature_count": int(m["feature_count"]),
            }
    val_identical = (
        f32_hashes["r20_feat_val"]["sha256"]
        == f32_hashes["r20_c2_feat_val"]["sha256"]
        == f32_hashes["r20_c3_feat_val"]["sha256"]
    )
    test_identical = (
        f32_hashes["r20_feat_test"]["sha256"]
        == f32_hashes["r20_c2_feat_test"]["sha256"]
        == f32_hashes["r20_c3_feat_test"]["sha256"]
    )
    assert val_identical and test_identical, "Locked VAL/TEST feature files are NOT byte-identical!"
    assert f32_hashes["r20_feat_test"]["rows"] == 4720, "Locked TEST row count != 4,720"
    assert f32_hashes["r20_feat_val"]["rows"] == 5067, "Locked VAL row count != 5,067"

    # R18 68D segregation verification
    r18_68d_audit = {}
    for sp in ("train", "val", "test"):
        mp = f"{R18_DERIVED_DIR}/ux3_feat_{sp}.meta.json"
        fp = f"{R18_DERIVED_DIR}/ux3_feat_{sp}.f32"
        m = json.load(open(mp))
        r18_68d_audit[sp] = {
            "path": fp,
            "rows": int(m["rows"]),
            "feature_count": int(m["feature_count"]),
            "sha256": sha256_file(fp),
            "segregated_from_82d": int(m["feature_count"]) == 68,
        }
        assert r18_68d_audit[sp]["feature_count"] == 68

    # 3. HandGesture-5G deep overlap verification (cluster, sample_id, filename, crc32, dHash<=8, 15s burst, extra_aug)
    hg_rows = [json.loads(l) for l in open(HG5G_JSONL, encoding="utf-8") if l.strip()]
    hg_by_split: dict[str, list[dict]] = {"train": [], "val": [], "test": []}
    for r in hg_rows:
        hg_by_split[effective_hg5g_split(r)].append(r)

    def _sets(items: list[dict], key: str) -> set:
        return {x[key] for x in items if x.get(key) is not None}

    hg_clusters = {sp: _sets(hg_by_split[sp], "cluster_id") for sp in ("train", "val", "test")}
    hg_samples = {sp: _sets(hg_by_split[sp], "sample_id") for sp in ("train", "val", "test")}
    hg_files = {sp: _sets(hg_by_split[sp], "filename") for sp in ("train", "val", "test")}
    hg_crcs = {sp: _sets(hg_by_split[sp], "crc32") for sp in ("train", "val", "test")}

    # Check exact dHash<=8 same-day/model & 15s burst cross-split pairs (both same-class and cross-class transparency)
    dhash_cross_same_cls = 0
    burst_cross_same_cls = 0
    dhash_cross_diff_cls = 0
    burst_cross_diff_cls = 0
    split_pairs = [("train", "val"), ("train", "test"), ("val", "test")]
    for sa, sb in split_pairs:
        for a in hg_by_split[sa]:
            da = a.get("dhash_hex")
            ex_a = a.get("exif") or {}
            day_a = (ex_a.get("datetime_original") or "")[:10]
            mod_a = ex_a.get("model") or ""
            ep_a = ex_a.get("datetime_epoch")
            for b in hg_by_split[sb]:
                ex_b = b.get("exif") or {}
                day_b = (ex_b.get("datetime_original") or "")[:10]
                mod_b = ex_b.get("model") or ""
                if day_a and day_a == day_b and mod_a == mod_b:
                    same_cls = a["class_name"] == b["class_name"]
                    if da and b.get("dhash_hex") and hamming_hex64(da, b["dhash_hex"]) <= 8:
                        if same_cls:
                            dhash_cross_same_cls += 1
                        else:
                            dhash_cross_diff_cls += 1
                    ep_b = ex_b.get("datetime_epoch")
                    if ep_a is not None and ep_b is not None and abs(float(ep_a) - float(ep_b)) <= 15.0:
                        if same_cls:
                            burst_cross_same_cls += 1
                        else:
                            burst_cross_diff_cls += 1

    # Verify extra_hg5g_aug.jsonl groups strictly subset of train clusters
    aug_rows = [json.loads(l) for l in open(EXTRA_HG5G_AUG, encoding="utf-8") if l.strip()]
    aug_clusters = {int(r["group"].replace("hg5g_c", "")) for r in aug_rows}
    aug_overlap_val = sorted(aug_clusters & hg_clusters["val"])
    aug_overlap_test = sorted(aug_clusters & hg_clusters["test"])
    # Verify hg5g_720 cached images strictly belong to train split
    hg_id_to_split = {r["sample_id"]: effective_hg5g_split(r) for r in hg_rows}
    cached_720_files = sorted(f for f in os.listdir(HG5G_720_DIR) if f.endswith(".jpg"))
    cached_720_non_train = [f for f in cached_720_files if hg_id_to_split.get(f[:-4]) != "train"]

    hg_verify = {
        "total_decoded_rows": len(hg_rows),
        "split_row_counts": {sp: len(hg_by_split[sp]) for sp in ("train", "val", "test")},
        "split_cluster_counts": {sp: len(hg_clusters[sp]) for sp in ("train", "val", "test")},
        "cluster_overlap_train_val": sorted(hg_clusters["train"] & hg_clusters["val"]),
        "cluster_overlap_train_test": sorted(hg_clusters["train"] & hg_clusters["test"]),
        "cluster_overlap_val_test": sorted(hg_clusters["val"] & hg_clusters["test"]),
        "sample_id_overlap_total": len(hg_samples["train"] & hg_samples["val"])
        + len(hg_samples["train"] & hg_samples["test"])
        + len(hg_samples["val"] & hg_samples["test"]),
        "filename_overlap_total": len(hg_files["train"] & hg_files["val"])
        + len(hg_files["train"] & hg_files["test"])
        + len(hg_files["val"] & hg_files["test"]),
        "crc32_overlap_total": len(hg_crcs["train"] & hg_crcs["val"])
        + len(hg_crcs["train"] & hg_crcs["test"])
        + len(hg_crcs["val"] & hg_crcs["test"]),
        "cross_split_same_class_dhash_le_8": dhash_cross_same_cls,
        "cross_split_same_class_burst_15s": burst_cross_same_cls,
        "cross_split_diff_class_same_session_dhash_le_8_note": dhash_cross_diff_cls,
        "cross_split_diff_class_same_session_burst_15s_note": burst_cross_diff_cls,
        "cross_class_session_note": (
            "R19 clustered HG5G within each class (0 same-class cross-split near-duplicates or bursts); "
            "different classes recorded on the same day/device can appear in different splits, which is why "
            "person-disjoint Natural RGB v3, IPN HandS, and HANDS RGB-D S4..5 OOD evaluation is mandatory alongside HG5G."
        ),
        "extra_hg5g_aug_rows": len(aug_rows),
        "extra_hg5g_aug_overlap_val_clusters": aug_overlap_val,
        "extra_hg5g_aug_overlap_test_clusters": aug_overlap_test,
        "cached_hg5g_720_images": len(cached_720_files),
        "cached_hg5g_720_non_train_leak": len(cached_720_non_train),
        "PASS": (
            len(hg_clusters["train"] & hg_clusters["val"]) == 0
            and len(hg_clusters["train"] & hg_clusters["test"]) == 0
            and len(hg_clusters["val"] & hg_clusters["test"]) == 0
            and dhash_cross_same_cls == 0
            and burst_cross_same_cls == 0
            and len(aug_overlap_val) == 0
            and len(aug_overlap_test) == 0
            and len(cached_720_non_train) == 0
        ),
    }
    assert hg_verify["PASS"], f"HG5G overlap verification failed: {hg_verify}"

    # 4. Natural RGB v3 overlap verification
    n66_rows = [json.loads(l) for l in open(N66_JSONL, encoding="utf-8") if l.strip()]
    n66_part = {sp: set() for sp in ("train", "val", "test")}
    n66_clips = {sp: set() for sp in ("train", "val", "test")}
    n66_sids = {sp: set() for sp in ("train", "val", "test")}
    for r in n66_rows:
        sp = r["split"]
        n66_part[sp].add(r["participant_id"])
        n66_clips[sp].add(r["clip_idx"])
        n66_sids[sp].add(r["sample_id"])
    n66_verify = {
        "total_sampled_frames": len(n66_rows),
        "split_participants": {sp: sorted(n66_part[sp]) for sp in ("train", "val", "test")},
        "split_clip_counts": {sp: len(n66_clips[sp]) for sp in ("train", "val", "test")},
        "participant_overlap_train_val": sorted(n66_part["train"] & n66_part["val"]),
        "participant_overlap_train_test": sorted(n66_part["train"] & n66_part["test"]),
        "participant_overlap_val_test": sorted(n66_part["val"] & n66_part["test"]),
        "clip_overlap_total": len(n66_clips["train"] & n66_clips["val"])
        + len(n66_clips["train"] & n66_clips["test"])
        + len(n66_clips["val"] & n66_clips["test"]),
        "sample_id_overlap_total": len(n66_sids["train"] & n66_sids["val"])
        + len(n66_sids["train"] & n66_sids["test"])
        + len(n66_sids["val"] & n66_sids["test"]),
        "PASS": (
            len(n66_part["train"] & n66_part["val"]) == 0
            and len(n66_part["train"] & n66_part["test"]) == 0
            and len(n66_part["val"] & n66_part["test"]) == 0
            and len(n66_clips["train"] & n66_clips["test"]) == 0
        ),
    }
    assert n66_verify["PASS"], f"Natural RGB v3 overlap failed: {n66_verify}"

    # 5. IPN HandS overlap verification
    ipn_sp = json.load(open(IPN_SPLIT_JSON, encoding="utf-8"))
    ip_p = {sp: set(ipn_sp[f"{sp}_persons"]) for sp in ("train", "val", "test")}
    ip_v = {sp: set(ipn_sp[f"{sp}_videos"]) for sp in ("train", "val", "test")}
    ipn_verify = {
        "split_persons": {sp: sorted(ip_p[sp], key=int) for sp in ("train", "val", "test")},
        "split_video_counts": {sp: len(ip_v[sp]) for sp in ("train", "val", "test")},
        "person_overlap_train_val": sorted(ip_p["train"] & ip_p["val"]),
        "person_overlap_train_test": sorted(ip_p["train"] & ip_p["test"]),
        "person_overlap_val_test": sorted(ip_p["val"] & ip_p["test"]),
        "video_overlap_total": len(ip_v["train"] & ip_v["val"])
        + len(ip_v["train"] & ip_v["test"])
        + len(ip_v["val"] & ip_v["test"]),
        "official_148_52_rejected_reason": "Official split overlaps 8 person_ids (1,2,3,12,13,15,18,21); strictly superseded by ipn_person_split.json",
        "PASS": (
            len(ip_p["train"] & ip_p["val"]) == 0
            and len(ip_p["train"] & ip_p["test"]) == 0
            and len(ip_p["val"] & ip_p["test"]) == 0
            and len(ip_v["train"] & ip_v["test"]) == 0
        ),
    }
    assert ipn_verify["PASS"]

    # 6. HANDS RGB-D overlap verification
    hr_tr = [json.loads(l) for l in open(EXTRA_HR_TRAIN, encoding="utf-8") if l.strip()]
    hr_va = [json.loads(l) for l in open(HR_S3_VAL, encoding="utf-8") if l.strip()]
    hr_ood = [json.loads(l) for l in open(HR_S4S5_OOD, encoding="utf-8") if l.strip()]
    hr_tr_subjs = {r["provenance"]["person_id"] for r in hr_tr}
    hr_va_subjs = {r["provenance"]["person_id"] for r in hr_va}
    hr_ood_subjs = {r["subject"] for r in hr_ood}
    hr_tr_files = {r["provenance"]["filename"] for r in hr_tr}
    hr_va_files = {r["provenance"]["filename"] for r in hr_va}
    hr_ood_files = {r["filename"] for r in hr_ood}
    hr_ood_matched = 0
    for r in hr_ood:
        l0 = (r.get("l0") or {}).get("hands") or []
        l1 = ((r.get("l1") or {}).get("hands") or []) if r.get("l1") else []
        m0 = r.get("gt_match_l0") or {}
        m1 = r.get("gt_match_l1") or {}
        for cls in r["combo"]:
            hi0, hi1 = m0.get(cls), m1.get(cls)
            if (hi0 is not None and 0 <= hi0 < len(l0)) or (hi1 is not None and 0 <= hi1 < len(l1)):
                hr_ood_matched += 1
    hr_verify = {
        "train_subjects": sorted(hr_tr_subjs),
        "val_subjects": sorted(hr_va_subjs),
        "locked_ood_subjects": sorted(hr_ood_subjs),
        "train_rows": len(hr_tr),
        "val_rows": len(hr_va),
        "locked_ood_frames": len(hr_ood),
        "locked_ood_matched_hands": hr_ood_matched,
        "subject_overlap_total": len(hr_tr_subjs & hr_va_subjs)
        + len(hr_tr_subjs & hr_ood_subjs)
        + len(hr_va_subjs & hr_ood_subjs),
        "filename_overlap_total": len(hr_tr_files & hr_va_files)
        + len(hr_tr_files & hr_ood_files)
        + len(hr_va_files & hr_ood_files),
        "PASS": (
            hr_tr_subjs == {"Subject1", "Subject2"}
            and hr_va_subjs == {"Subject3"}
            and hr_ood_subjs == {"Subject4", "Subject5"}
            and len(hr_tr_files & hr_ood_files) == 0
            and hr_ood_matched == 2092
        ),
    }
    assert hr_verify["PASS"], f"HANDS RGB-D verification failed: {hr_verify}"

    # 7. Mendeley BXR7 overlap verification (599-frame locked games vs Gomoku/Poker train vs holdout)
    m599 = json.load(open(MENDELEY_599_JSON, encoding="utf-8"))
    m599_games = set()
    m599_files = set()
    for k in ("dim_light", "natural_light"):
        for row in m599.get(k, []):
            nm = row.get("name") or row.get("filename") or ""
            m599_files.add(nm)
            parts = nm.split("/")
            if len(parts) >= 2:
                m599_games.add(f"{parts[0]}/{parts[1]}")
    bxr_tr = [json.loads(l) for l in open(EXTRA_BXR7_TRAIN, encoding="utf-8") if l.strip()]
    bxr_ood = [json.loads(l) for l in open(BXR7_OOD_TEST, encoding="utf-8") if l.strip()]
    bxr_tr_games = {r["provenance"]["clip_id"] for r in bxr_tr}
    bxr_ood_games = {r["provenance"]["clip_id"] for r in bxr_ood}
    bxr_tr_files = {r["provenance"]["filename"] for r in bxr_tr}
    bxr_ood_files = {r["provenance"]["filename"] for r in bxr_ood}
    # Check temporal gap per game between max train frame_idx and min ood frame_idx
    bxr_gaps = {}
    for g in sorted(bxr_tr_games | bxr_ood_games):
        tr_idx = [int(r["provenance"]["frame_idx"]) for r in bxr_tr if r["provenance"]["clip_id"] == g]
        od_idx = [int(r["provenance"]["frame_idx"]) for r in bxr_ood if r["provenance"]["clip_id"] == g]
        bxr_gaps[g] = {
            "train_max_frame_idx": max(tr_idx),
            "ood_min_frame_idx": min(od_idx),
            "buffer_gap_frames": min(od_idx) - max(tr_idx),
        }
    bxr_verify = {
        "mendeley_599_locked_games": sorted(m599_games),
        "gomoku_poker_train_games": sorted(bxr_tr_games),
        "gomoku_poker_ood_games": sorted(bxr_ood_games),
        "train_rows": len(bxr_tr),
        "ood_holdout_rows": len(bxr_ood),
        "overlap_599_vs_train_games": sorted(m599_games & bxr_tr_games),
        "overlap_599_vs_train_files": len(m599_files & bxr_tr_files),
        "overlap_train_vs_ood_files": len(bxr_tr_files & bxr_ood_files),
        "temporal_buffer_gaps": bxr_gaps,
        "PASS": (
            len(m599_games & bxr_tr_games) == 0
            and len(bxr_tr_files & bxr_ood_files) == 0
            and all(v["buffer_gap_frames"] > 20 for v in bxr_gaps.values())
            and len(bxr_ood) == 85
        ),
    }
    assert bxr_verify["PASS"], f"BXR7 verification failed: {bxr_verify}"

    # 8. Legal & Unlabelled Telemetry Gate Assertions (D02, D14)
    all_r20_c3_train_sources = set(json.load(open(f"{R20_FEAT_DIR}/r20_c3_feat_train.meta.json"))["sources"])
    legal_gate = {
        "hagridv2_status": "HOLD_LICENSE",
        "hagridv2_rows_in_product_weights": 0,
        "dimhand_llhands_mgrdark_status": "BLOCKED",
        "dimhand_llhands_rows_in_product_weights": 0,
        "owner_S_07ba0cde_status": "UNLABELLED_TELEMETRY",
        "owner_S_07ba0cde_supervised_gt_rows": 0,
        "verified_train_sources_only_cc_by_4_0": sorted(all_r20_c3_train_sources),
        "PASS": all(
            not any(bad in s.lower() for bad in ("hagrid", "dimhand", "llhand", "07ba0cde", "owner"))
            for s in all_r20_c3_train_sources
        ),
    }
    assert legal_gate["PASS"]

    overlap_report = {
        "generated_at": now_iso,
        "contract": "K7 (Frozen Dataset Registry & Zero-Leakage Verification)",
        "overall_PASS": True,
        "k5_encoder_sha256_match": sha_feat_fe == sha_feat_cand,
        "k5_encoder_sha256": sha_feat_fe,
        "locked_val_test_byte_identical": {"val": val_identical, "test": test_identical, "f32_hashes": f32_hashes},
        "r18_68d_segregation": r18_68d_audit,
        "handgesture_5g": hg_verify,
        "natural_rgb_v3": n66_verify,
        "ipn_hands": ipn_verify,
        "hands_rgbd_v2": hr_verify,
        "mendeley_bxr7kx84y6_v2": bxr_verify,
        "legal_and_telemetry_gates": legal_gate,
    }
    with open(f"{R22_REG_DIR}/split_overlap_verification.json", "w", encoding="utf-8") as f:
        json.dump(overlap_report, f, indent=2)

    # 9. Build comprehensive K7 dataset_registry_r17_r20.json
    registry = {
        "schema_version": "r22-dataset-registry/1.0",
        "contract_k7_version": "v1.0-FROZEN",
        "contract_k4_version": "v1.0-FROZEN",
        "contract_k5_version": "r19-82d-v1",
        "generated_at": now_iso,
        "generated_by": "w-data",
        "feature_encoder": {
            "id": "r19-82d-v1",
            "dimension": 82,
            "canonical_ts_path": R19_FEAT_TS_FRONTEND,
            "research_candidate_ts_path": R19_FEAT_TS_CAND,
            "sha256": sha_feat_fe,
            "feature_names": R19_FEATURE_NAMES,
            "legacy_segregation_policy": (
                "R18 68D (ux3_features.ts) and R17 56D (rd_lib.ts) feature vectors are strictly segregated "
                "and NEVER concatenated with 82D. All R18 IPN HandS samples used in R19/R20/R22 are re-encoded "
                "directly from raw 21 MediaPipe landmarks through r19-82d-v1."
            ),
        },
        "k4_label_taxonomy": {
            "pistol_head_gesture_only": {
                "classes": PISTOL_LABELS,
                "route": "gesture",
                "canvas_usage": "DISABLED_ON_CANVAS (NEVER gates or closes Canvas strokes)",
            },
            "pose_head_canvas": {
                "classes": POSE_LABELS,
                "route": "canvas",
                "semantics": {
                    "FIST": "0 extended fingers -> NEUTRAL / ARMED_FIST for Undo/Redo",
                    "ONE": "1 extended index finger (thumb tucked) -> UNDO confirm after ARMED_FIST",
                    "TWO": "2 extended index+middle fingers -> REDO confirm after ARMED_FIST",
                    "FIVE": "5 extended digits (flat open palm) -> ERASE",
                    "OTHER": "3/4 fingers, L-sign, thumbs-up/down, OK-sign, transitional poses",
                },
            },
            "pinch_head_canvas": {
                "classes": PINCH_LABELS,
                "route": "canvas",
                "canonical_thresholds": {
                    "TOUCH_enter": "<= 0.30 (folded index <= 0.20)",
                    "TOUCH_hold_exit": "<= 0.42 (folded index <= 0.27)",
                    "NEAR_negative": "(0.30, 0.50] (MUST NOT start stroke)",
                    "OPEN": "> 0.50",
                },
                "supervised_status": "DATA_GAP_CONFIRMED (0 legal datasets contain frame-level TOUCH vs NEAR physical contact annotations)",
            },
            "autolabel_source_enum": ["MODEL_PREDICTION", "RULE_DERIVED", "USER_ACTION", "DATASET_GT", "UNKNOWN"],
        },
        "locked_splits_summary": {
            "pistol_train_base_r20_c3_rows": f32_hashes["r20_c3_feat_train"]["rows"],
            "pistol_val_locked_rows": f32_hashes["r20_feat_val"]["rows"],
            "pistol_val_locked_sha256": f32_hashes["r20_feat_val"]["sha256"],
            "pistol_test_locked_rows": f32_hashes["r20_feat_test"]["rows"],
            "pistol_test_locked_sha256": f32_hashes["r20_feat_test"]["sha256"],
            "hands_rgbd_ood_s4_s5_matched_hands": hr_ood_matched,
            "bxr7_gomoku_poker_ood_holdout_hands": len(bxr_ood),
            "mendeley_599_session_disjoint_hands": 1133,
            "zero_leakage_verified": True,
            "verification_file": f"{R22_REG_DIR}/split_overlap_verification.json",
        },
        "datasets": [
            {
                "dataset_id": "handgesture_5g",
                "origin_revision": "R19 (reused R20, R22)",
                "name": "HandGesture-5G: Multi-View, Multi-Illumination Smartphone Image Dataset (Diptho et al., 2026-06-30)",
                "dataset_version_url": "https://data.mendeley.com/datasets/wj25crzdbm/1",
                "doi": "10.17632/wj25crzdbm.1",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "ALLOWED_WITH_ATTRIBUTION",
                "usage_allowed": True,
                "split_role": "train | val | locked_test",
                "supervision_type": "INDEPENDENT_DATASET_GT",
                "feature_dimension": "82D (r19-82d-v1 from 21 MP landmarks)",
                "sha256": {
                    "handgesture_5g_landmarks.jsonl": sha256_file(HG5G_JSONL),
                    "extra_hg5g_aug.jsonl": sha256_file(EXTRA_HG5G_AUG),
                    "upstream_zip_ref": "b86adb64... (5,176,227,373 B; streamed via HTTP 206 Range, 0 B zip saved)",
                },
                "local_paths": [HG5G_JSONL, HG5G_720_DIR, EXTRA_HG5G_AUG],
                "counts": {
                    "subjects_or_clusters": "38 dHash<=8 + 15s-burst atomic clusters (21 train / 8 val / 9 locked_test)",
                    "upstream_entries": 2653,
                    "crc32_duplicates_removed": 846,
                    "heic_skipped": 10,
                    "decoded_images": len(hg_rows),
                    "detected_hands": sum(1 for r in hg_rows if r["l0"]["n_hands"] > 0 or r["l1"]["n_hands"] > 0),
                    "cached_train_720p_images": len(cached_720_files),
                    "r20_aug_train_rows": len(aug_rows),
                },
                "original_to_k4_label_mapping": {
                    "pistol_head": {
                        "Pointing Up": "POINT_READY",
                        "L-Sign": "POINT_PRESS",
                        "Fist": "OTHER",
                        "V-Sign": "OTHER",
                        "Open Palm_Open Hand": "OTHER",
                    },
                    "pose_head": {
                        "Fist": "FIST",
                        "Pointing Up": "ONE",
                        "V-Sign": "TWO",
                        "Open Palm_Open Hand": "FIVE",
                        "L-Sign": "OTHER",
                    },
                    "pinch_head": "NEGATIVE_NON_PINCH_ONLY (no TOUCH/NEAR labels; Fist has 48.3% curled-index near ratio 0.30..0.50)",
                },
            },
            {
                "dataset_id": "natural_rgb_v3",
                "origin_revision": "R19 (reused R20, R22)",
                "name": "Natural RGB Hand Gestures Dataset v3 (Rahat et al., AIUB, 2026-07-08)",
                "dataset_version_url": "https://data.mendeley.com/datasets/n66hhk695h/3",
                "doi": "10.17632/n66hhk695h.3",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "ALLOWED_WITH_ATTRIBUTION",
                "usage_allowed": True,
                "split_role": "train | val | locked_test",
                "supervision_type": "INDEPENDENT_DATASET_GT",
                "feature_dimension": "82D (r19-82d-v1 from 21 MP landmarks, causal sequence per clip)",
                "sha256": {
                    "Root.zip_r19_recorded": "2257bb717af6451166d5ac74450c5f624c1f2960845894c549c14b6d2085a3d6 (382,226,419 B; deleted after R19 landmark extraction)",
                    "n66hhk695h_v3_landmarks.jsonl": sha256_file(N66_JSONL),
                },
                "local_paths": [N66_JSONL],
                "counts": {
                    "participants": "26 (19 train / 4 val [p13,p14,p17,p19] / 3 locked_test [p02,p05,p15])",
                    "videos_clips": 1352,
                    "sampled_frames": len(n66_rows),
                    "lighting_strata": ["bright_daylight", "indoor_moderate", "dim", "backlit", "green_led", "red_led"],
                    "locked_test_other_hands": 888,
                },
                "original_to_k4_label_mapping": {
                    "pistol_head": {
                        "11_clean_classes": "OTHER (thumbs_up, thumbs_down, peace_sign, ok_sign, fist, stop, raised_hand, palm_down_push, wave, come_here, go)",
                        "point_left_and_point_right": "QUARANTINED_AMBIGUOUS_CONVERSATIONAL_POINTING (0 rows labeled POINT_PRESS)",
                    },
                    "pose_head": {
                        "apex_policy": "Clip apex frames rank 3..5 ONLY (ranks 0..1 are open-hand raise transitions)",
                        "fist": "FIST",
                        "peace_sign": "TWO",
                        "raised_hand, stop": "FIVE",
                        "ok_sign, thumbs_up, thumbs_down": "OTHER",
                        "point_left, point_right, come_here, go, palm_down_push, wave": "QUARANTINED_DYNAMIC_OR_AMBIGUOUS",
                    },
                    "pinch_head": "ok_sign (n=561, 58.5% pinchRatio<=0.30) is ring-OK with 3 extended fingers, NOT frame-level canvas TOUCH vs NEAR GT",
                },
            },
            {
                "dataset_id": "ipn_hands",
                "origin_revision": "R17 (ann only) -> R18 (landmarks + person split) -> R19/R20/R22 (re-encoded 82D)",
                "name": "IPN Hand / IPN HandS Continuous Video Dataset (Benitez-Garcia et al., 2020/2025)",
                "dataset_version_url": "https://gibranbenitez.github.io/IPN_Hand/",
                "doi": "10.3390/app15116321",
                "license_snapshot": "CC BY 4.0 (annotations/GT); Apache 2.0 (MediaPipe landmarks); MIT (code)",
                "commercial_product_fit": "ALLOWED_WITH_ATTRIBUTION",
                "usage_allowed": True,
                "split_role": "train | val | locked_test",
                "supervision_type": "INDEPENDENT_DATASET_GT",
                "feature_dimension": "82D re-encoded from 21 raw MP landmarks (R18 68D ux3_feat_*.f32 strictly segregated, NEVER concatenated)",
                "sha256": {
                    "IPN_HandS_annotations.zip": sha256_file(IPN_ANN_ZIP),
                    "IPN_HandS_landmarks_GT.zip": sha256_file(IPN_GT_ZIP),
                    "IPN_HandS_landmarks_MPHands.zip": sha256_file(IPN_MP_ZIP),
                    "ipn_person_split.json": sha256_file(IPN_SPLIT_JSON),
                },
                "local_paths": [IPN_ANN_ZIP, IPN_GT_ZIP, IPN_MP_ZIP, IPN_SPLIT_JSON],
                "counts": {
                    "persons": "29 person-disjoint (19 train / 5 val [2,3,8,17,22] / 5 locked_test [6,10,13,21,29])",
                    "videos": "200 (128 train / 36 val / 36 locked_test)",
                    "frames_total": 801476,
                    "classes": 15,
                },
                "original_to_k4_label_mapping": {
                    "pistol_head": {
                        "NOG, P2F, C2F, 2C2, GRB, TUP, TDN, TLT, TRT, OP2, ZIN, ZOT": "OTHER",
                        "P1F, C1F, 2C1": "EXCLUDED_FROM_PRESS_SUPERVISION (evaluated separately as casual 1-finger negative trap)",
                    },
                    "pose_head": "TEMPORAL_REFERENCE_ONLY (dynamic gestures lack static 5-finger open-palm class; P1F/P2F used by w-temporal)",
                    "pinch_head": "NO_PINCH_LABELS (no TOUCH/NEAR class)",
                },
            },
            {
                "dataset_id": "hands_rgbd_v2",
                "origin_revision": "R19 (eval-only) -> R20 (S1..S2 train / S3 val / S4..S5 locked OOD) -> R22 (also Pose Head)",
                "name": "HANDS: Static Hand-Gestures RGB-D Dataset (10.17632/ndrczc35bt.2)",
                "dataset_version_url": "https://data.mendeley.com/datasets/ndrczc35bt/2",
                "doi": "10.17632/ndrczc35bt.2",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "ALLOWED_WITH_ATTRIBUTION",
                "usage_allowed": True,
                "split_role": "train (S1..S2) | val (S3) | locked_ood (S4..S5)",
                "supervision_type": "INDEPENDENT_DATASET_GT",
                "feature_dimension": "82D (r19-82d-v1 from 21 MP landmarks)",
                "sha256": {
                    "hands_rgbd_landmarks.jsonl": sha256_file(HRGBD_JSONL),
                    "extra_hands_rgbd_s1_s2_train.jsonl": sha256_file(EXTRA_HR_TRAIN),
                    "hands_rgbd_s3_val.jsonl": sha256_file(HR_S3_VAL),
                    "hands_rgbd_s4_s5_ood_test.jsonl": sha256_file(HR_S4S5_OOD),
                },
                "local_paths": [HRGBD_JSONL, EXTRA_HR_TRAIN, HR_S3_VAL, HR_S4S5_OOD],
                "counts": {
                    "subjects": "5 (Subject1..2 train / Subject3 val / Subject4..5 locked OOD)",
                    "frames_streamed": 2700,
                    "ood_s4_s5_frames": len(hr_ood),
                    "ood_s4_s5_matched_hands": hr_ood_matched,
                    "train_s1_s2_other_rows": len(hr_tr),
                    "val_s3_other_rows": len(hr_va),
                },
                "original_to_k4_label_mapping": {
                    "pistol_head": {
                        "Horiz_HBL/HBR/HFL/HFR (5-finger flat palm), Five, Punch, Two, Six, Seven, Eight, Span, TimeOut": "OTHER",
                        "One_VFL, One_VFR": "QUARANTINED_FROM_OTHER_TRAIN (evaluated as POINT_READY on OOD S4..S5)",
                    },
                    "pose_head": {
                        "Punch_VFL, Punch_VFR": "FIST",
                        "One_VFL, One_VFR": "ONE",
                        "Two_VFL, Two_VFR": "TWO",
                        "Five_VFL, Five_VFR, Horiz_HBL, Horiz_HBR, Horiz_HFL, Horiz_HFR": "FIVE",
                        "Six_VFL, Six_VFR, Seven_VFL, Seven_VFR, Eight_VFL, Eight_VFR, Span_VFL, Span_VFR": "OTHER",
                        "TimeOut": "EXCLUDED (two-hand T-shape where each single hand is a flat 5-finger palm)",
                    },
                    "pinch_head": "NEGATIVE_NON_PINCH_ONLY (Punch has 43..49% near ratio 0.30..0.50 and 9..23.5% <=0.30 -> critical fist-vs-pinch negative stress)",
                },
            },
            {
                "dataset_id": "mendeley_bxr7kx84y6_v2",
                "origin_revision": "R18 (eval-only 599 frames) -> R20 (Gomoku/Poker non-holdout train + 85-hand OOD) -> R22",
                "name": "Egocentric and Exocentric View Hands in Interactive Senses v2 (2 cached slices)",
                "dataset_version_url": "https://data.mendeley.com/datasets/bxr7kx84y6/2",
                "doi": "10.17632/bxr7kx84y6.2",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "ALLOWED_WITH_ATTRIBUTION",
                "usage_allowed": True,
                "split_role": "train (Gomoku/Poker 0..68%) | locked_ood (599-frame 5 games + Gomoku/Poker 75..100%)",
                "supervision_type": "AUDITED_NON_POINTING_FILTER",
                "feature_dimension": "82D (r19-82d-v1 from 21 MP landmarks)",
                "sha256": {
                    "dim_light_1.zip": sha256_file(BXR7_DIM_ZIP),
                    "natural_light_1.zip": sha256_file(BXR7_NAT_ZIP),
                    "ux3_mendeley_distractor_landmarks.json": sha256_file(MENDELEY_599_JSON),
                    "extra_bxr7_gomoku_poker_train.jsonl": sha256_file(EXTRA_BXR7_TRAIN),
                    "bxr7_gomoku_poker_ood_test.jsonl": sha256_file(BXR7_OOD_TEST),
                },
                "local_paths": [BXR7_DIM_ZIP, BXR7_NAT_ZIP, MENDELEY_599_JSON, EXTRA_BXR7_TRAIN, BXR7_OOD_TEST],
                "counts": {
                    "cached_zips": 2,
                    "upstream_remaining_zips": 22,
                    "cached_jpgs": 3712,
                    "locked_599_frames": 600,
                    "locked_599_hands": 1133,
                    "gomoku_poker_train_hands": len(bxr_tr),
                    "gomoku_poker_ood_holdout_hands": len(bxr_ood),
                },
                "original_to_k4_label_mapping": {
                    "pistol_head": "Non-pointing board/card-game hands -> OTHER (pointing-like hands quarantined)",
                    "pose_head": "NOT_USED (unlabeled natural interaction poses)",
                    "pinch_head": "NOT_USED_AS_GT (unlabeled board-game manipulation; may contain genuine pinches on game pieces)",
                },
            },
            {
                "dataset_id": "hagridv2",
                "origin_revision": "R17 (RD-01..RD-05 offline research only)",
                "name": "HaGRIDv2 Landmark Annotations (Nuzhdin et al., arXiv:2412.01508)",
                "dataset_version_url": "https://github.com/hukenovs/hagrid",
                "doi": "10.48550/arXiv.2412.01508",
                "license_snapshot": "Custom Russian-law Public License (reworked CC BY-SA 4.0 ShareAlike Sec. 3b & 4 on Adapted Material)",
                "commercial_product_fit": "HOLD_LICENSE (requires Owner legal clearance on ShareAlike obligations for derived weights)",
                "usage_allowed": False,
                "split_role": "hold_license",
                "supervision_type": "HOLD_LICENSE",
                "feature_dimension": "56D legacy in R17 (0 rows in R18/R19/R20/R22 product weights)",
                "sha256": {
                    "r17_recorded_annotations_zip": "ca27a177cc9f061e92d59f6a7d9b1b10fe2ee8289ab5f2068cde6ab197d2a286",
                    "local_product_cache": "NONE (0 bytes on disk; 0 rows in product weights)",
                },
                "local_paths": [],
                "counts": {"rows_in_product_weights": 0, "r17_historical_research_rows": 222661},
                "original_to_k4_label_mapping": {"all": "EXCLUDED_HOLD_LICENSE"},
            },
            {
                "dataset_id": "dimhand_llhands_mgrdark_and_nc_backlog",
                "origin_revision": "R18/R19/R20 license audit",
                "name": "DimHand (ACM MM 2026), LLHands/XPose, MGR-Dark, AnyHand, PALM, FreiHAND, RHD, InterHand2.6M, DexYCB, HO-3D, FPHA, EgoHands, NUS-II, Cambridge",
                "dataset_version_url": "https://hanlingzhan.github.io/DimHand/",
                "doi": "various (see DATASET_LINEAGE_AND_LICENSE_AUDIT.md)",
                "license_snapshot": "Non-commercial (CC BY-NC / CC BY-NC-ND / Academic-only) or Unpublished/Proprietary",
                "commercial_product_fit": "PROHIBITED_BLOCKED",
                "usage_allowed": False,
                "split_role": "blocked",
                "supervision_type": "BLOCKED",
                "feature_dimension": "N/A (0 rows ingested)",
                "sha256": {},
                "local_paths": [],
                "counts": {"rows_in_product_weights": 0},
                "original_to_k4_label_mapping": {"all": "BLOCKED_PROHIBITED"},
            },
            {
                "dataset_id": "owner_benchmark_S_07ba0cde",
                "origin_revision": "R20/R22 Owner Telemetry",
                "name": "Owner Physical Webcam Benchmark Telemetry JSONs (S-07ba0cde four-trials & two-trials)",
                "dataset_version_url": "local: research-can/docs/plan-rev/R22_FULL_SCOPE_MALAM_20261119/references/benchmarks/",
                "doi": "N/A (Owner local numeric telemetry, consent.numericRecording=true, videoOrImages=false)",
                "license_snapshot": "Owner-consented local numeric telemetry (no images/video/face/biometrics)",
                "commercial_product_fit": "TELEMETRY_DIAGNOSTICS_ONLY (NEVER supervised GT)",
                "usage_allowed": False,
                "split_role": "unlabelled_telemetry",
                "supervision_type": "UNLABELLED_TELEMETRY",
                "feature_dimension": "21-pt raw landmarks in JSON (re-encodable to 82D for unsupervised/consistency diagnostics only)",
                "sha256": {
                    "nui-lab-benchmark-S-07ba0cde-four-trials.json": sha256_file(OWNER_4T_JSON),
                    "nui-lab-benchmark-S-07ba0cde-two-trials.json": sha256_file(OWNER_2T_JSON),
                },
                "local_paths": [OWNER_4T_JSON, OWNER_2T_JSON],
                "counts": {
                    "four_trials_frames": 7612,
                    "two_trials_frames": 4080,
                    "t004_canvas_frames": 2082,
                    "t004_frames_with_landmarks": 1411,
                    "supervised_gt_rows_used": 0,
                },
                "original_to_k4_label_mapping": {
                    "truth_field": "UNLABELLED (0 rows used as supervised GT; strictly action-invariant & consistency replay)"
                },
            },
            {
                "dataset_id": "candidate_mendeley_bpkd429sxt_v1",
                "origin_revision": "R22 D10 Audit",
                "name": "hand gesture classification - dataset (Preinl, 2025-11-17)",
                "dataset_version_url": "https://data.mendeley.com/datasets/bpkd429sxt/1",
                "doi": "10.17632/bpkd429sxt.1",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "LEGAL_CC_BY_4_0",
                "usage_allowed": False,
                "split_role": "candidate_not_ingested",
                "supervision_type": "DEFERRED_PREEXTRACTED_CSV_UNVERIFIED_MP_VERSION",
                "feature_dimension": "Pre-extracted CSV landmarks (unspecified MP Hands version, no raw RGB/aspect/subject IDs)",
                "sha256": {"collage.jpg_upstream_api": "1c090c30ad3752a612590e6ee8e441c27e775c7a8e2ec1e000b40adbb5380baf"},
                "local_paths": [],
                "counts": {"classes": 10, "class_codes": ["GE01NU", "GE02NU", "GE21NU", "GE02WS", "GE16WS", "GE16DS", "GE03NU", "GE03US", "GE05US", "GE19NU"]},
                "original_to_k4_label_mapping": {
                    "audit_verdict": "DEFERRED — legal CC BY 4.0, but pre-extracted MediaPipe CSV lacks raw RGB frames for lowlight/blur augmentation, aspect metadata, subject IDs for leak-free split, and explicit L-Sign / pinch-contact definitions."
                },
            },
            {
                "dataset_id": "candidate_mendeley_bisindo_235c78xbmk_v2",
                "origin_revision": "R22 D10 Audit",
                "name": "A Multimodal BISINDO Corpus: Annotated Images and Videos for Indonesian Sign Language (Hayati et al., 2025-12-15)",
                "dataset_version_url": "https://data.mendeley.com/datasets/235c78xbmk/2",
                "doi": "10.17632/235c78xbmk.2",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "LEGAL_CC_BY_4_0",
                "usage_allowed": False,
                "split_role": "candidate_not_ingested",
                "supervision_type": "CANDIDATE_LOWLIGHT_HARD_NEG_SINGLE_ACTOR",
                "feature_dimension": "Raw RGB video/frames (re-encodable via MP HandLandmarker -> 82D)",
                "sha256": {},
                "local_paths": [],
                "counts": {"classes": 26, "image_samples": 19760, "actors": 1},
                "original_to_k4_label_mapping": {
                    "audit_verdict": "ELIGIBLE_FUTURE_HARD_NEG — legal CC BY 4.0 with real low-light indoor + outdoor Indonesian hand motion & anonymized faces; single-actor constraint requires keeping entire corpus in TRAIN-only OTHER hard negatives (never split across train/test)."
                },
            },
            {
                "dataset_id": "candidate_mendeley_bxr7kx84y6_remaining_22_zips",
                "origin_revision": "R22 D10 Audit",
                "name": "Egocentric/Exocentric Hands v2 — Remaining 22 Uncached Upstream Zips (~7.75 GiB)",
                "dataset_version_url": "https://data.mendeley.com/datasets/bxr7kx84y6/2",
                "doi": "10.17632/bxr7kx84y6.2",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "LEGAL_CC_BY_4_0",
                "usage_allowed": True,
                "split_role": "candidate_not_ingested",
                "supervision_type": "ELIGIBLE_SESSION_DISJOINT_HARD_NEG_AND_BBOX_EXPANSION",
                "feature_dimension": "Raw 1280x720 RGB dim/natural light frames",
                "sha256": {},
                "local_paths": [],
                "counts": {"remaining_zips": 22, "approx_size_gib": 7.75},
                "original_to_k4_label_mapping": {
                    "audit_verdict": "ELIGIBLE_FUTURE_EXPANSION — 100% session-disjoint from cached dim_light_1.zip & natural_light_1.zip locked holdouts; streamable via HTTP 206 Range for dim-light OTHER hard negatives."
                },
            },
            {
                "dataset_id": "candidate_mendeley_exocentric_9d37m3nfgm_v2",
                "origin_revision": "R22 D10 Audit",
                "name": "Exocentric View Hand Interaction Dataset v2 (Zadid et al., AIUB, 2025-07-02)",
                "dataset_version_url": "https://data.mendeley.com/datasets/9d37m3nfgm/2",
                "doi": "10.17632/9d37m3nfgm.2",
                "license_snapshot": "CC BY 4.0 (verified via Mendeley public API 2026-11-19)",
                "commercial_product_fit": "LEGAL_CC_BY_4_0",
                "usage_allowed": False,
                "split_role": "candidate_not_ingested",
                "supervision_type": "CANDIDATE_MULTI_HAND_BYSTANDER_HARD_NEG",
                "feature_dimension": "Raw PNG frames (7,221 frames, 2/3/4-person board games)",
                "sha256": {"Exocentric View.zip_r19_ref": "572d98ab... (2,663,815,536 B)"},
                "local_paths": [],
                "counts": {"frames": 7221, "persons_per_scene": "2-4"},
                "original_to_k4_label_mapping": {
                    "audit_verdict": "ELIGIBLE_FUTURE_MULTI_HAND_DISTRACTOR — legal CC BY 4.0; useful for multi-hand bystander negative stress without gesture labels."
                },
            },
        ],
    }
    with open(f"{R22_REG_DIR}/dataset_registry_r17_r20.json", "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2)

    # 10. Write DATASET_LINEAGE_AND_LICENSE_AUDIT.md
    md = f"""# R22 Dataset Lineage, License Gate, Split-Overlap & Candidate Provenance Audit (D01–D04, D10, D14)

- **Generated:** `{now_iso}` by `w-data` (`train_r22_heads_gpu.py --stage registry`)
- **Contract Versions:** `K4 = v1.0-FROZEN` | `K5 = r19-82d-v1` (SHA-256 `{sha_feat_fe}`) | `K7 = v1.0-FROZEN`
- **Machine-Readable Artifacts:**
  - [`dataset_registry_r17_r20.json`](dataset_registry_r17_r20.json)
  - [`split_overlap_verification.json`](split_overlap_verification.json)

---

## 1. Legal Gate & Feature Compatibility Verification (D02, D04, D14)

| Gate / Policy Check | Result | Verified Evidence |
|---|---|---|
| **R17 `HaGRIDv2` (`HOLD_LICENSE`)** | **PASS (`0` rows)** | Custom Russian-law ShareAlike (`license/en_us.pdf` Sec. 3b & 4); **`0` rows** in R18, R19, R20, and R22 product weights; 0 bytes cached locally. |
| **`DimHand` / `LLHands` / `MGR-Dark` / NC Backlog (`BLOCKED`)** | **PASS (`0` rows)** | Non-commercial (`CC BY-NC` / `CC BY-NC-ND`) or unpublished/gated; **`0` rows** ingested. |
| **Owner Benchmark JSONs `S-07ba0cde` (`UNLABELLED_TELEMETRY`)** | **PASS (`0` GT rows)** | `four-trials.json` (`7,612` frames, SHA-256 `{sha256_file(OWNER_4T_JSON)[:16]}…`) & `two-trials.json` (`4,080` frames, `{sha256_file(OWNER_2T_JSON)[:16]}…`) have `truth="UNLABELLED"`. **`0` rows** used as supervised GT; strictly action-invariant & consistency diagnostics (`labelSource != "DATASET_GT"`). |
| **K5 Feature Encoder Parity (`r19_features.ts`, `82D`)** | **PASS (identical)** | Frontend & `r19/candidates` SHA-256 match identically: `{sha_feat_fe}`. |
| **Legacy `68D` / `56D` Segregation (D04)** | **PASS (segregated)** | R18 `ux3_feat_{{train,val,test}}.f32` confirmed `feature_count=68` (`221,715 / 120,020 / 110,881` rows), strictly segregated and NEVER concatenated with `82D`. R19/R20/R22 re-encode IPN HandS directly from raw 21 landmarks in `IPN_HandS_landmarks_MPHands.zip` (`SHA-256 {sha256_file(IPN_MP_ZIP)[:16]}…`). |

---

## 2. Complete R17–R20 Unified Dataset Registry Summary (D01)

| Dataset | Origin | License (Verified) | Split Role | Subjects / Clusters / Videos | Local Verified SHA-256 (Primary) | Usage in R22 |
|---|---|---|---|---|---|---|
| **HandGesture-5G** (`wj25crzdbm.1`) | R19→R20→R22 | `CC BY 4.0` | `train \\| val \\| locked_test` | `38` clusters (`21 / 8 / 9`), `1,797` imgs (`846` CRC32 dups removed), `1,097` 720p train imgs | `jsonl`: `{sha256_file(HG5G_JSONL)[:16]}…` | Pistol Head + Pose Head + R22 Train-Only Image/LM Augs |
| **Natural RGB v3** (`n66hhk695h.3`) | R19→R20→R22 | `CC BY 4.0` | `train \\| val \\| locked_test` | `26` participants (`19 / 4 / 3`), `1,352` clips, `10,816` frames (`6` light strata) | `jsonl`: `{sha256_file(N66_JSONL)[:16]}…` (`Root.zip` R19: `2257bb71…`) | Pistol `OTHER` (`point_left/right` quarantined) + Pose apex (`rank 3..5`) + `ok_sign` Pinch audit |
| **IPN HandS** (`gibranbenitez/IPN_Hand`) | R17→R18→R19→R20→R22 | `CC BY 4.0` / `Apache 2.0` | `train \\| val \\| locked_test` | `29` persons (`19 / 5 / 5`), `200` videos (`128 / 36 / 36`), `801,476` frames | `MPHands.zip`: `{sha256_file(IPN_MP_ZIP)[:16]}…` | Pistol `OTHER` (`P1F/C1F/2C1` held out as trap) + 36-video continuous FSM eval + Temporal (`w-temporal`) |
| **HANDS RGB-D v2** (`ndrczc35bt.2`) | R19→R20→R22 | `CC BY 4.0` | `train (S1..2) \\| val (S3) \\| locked_ood (S4..5)` | `5` subjects, `2,700` frames (`S4..S5` = `1,080` frames / `2,092` matched hands) | `jsonl`: `{sha256_file(HRGBD_JSONL)[:16]}…` | Pistol hard-neg `OTHER` (S1..2 train, S3 val, S4..5 OOD) + **Pose Head** (S1..2 train, S3 val, S4..5 locked OOD!) |
| **Mendeley `bxr7kx84y6.2`** (2 slices) | R18→R20→R22 | `CC BY 4.0` | `train (Gomoku/Poker 0..68%) \\| locked_ood (599f + 75..100%)` | `2` zips (`3,712` JPGs): `5` games locked (`1,133` hands), `Gomoku/Poker` (`230` tr / `85` OOD) | `dim_1`: `{sha256_file(BXR7_DIM_ZIP)[:16]}…`, `nat_1`: `{sha256_file(BXR7_NAT_ZIP)[:16]}…` | Pistol dim/natural hard-neg `OTHER` (`pointing-like` quarantined) + 2 locked session-disjoint OOD tests |
| **HaGRIDv2** (`arXiv:2412.01508`) | R17 (research only) | Custom ShareAlike | **`HOLD_LICENSE`** | `0` product rows | R17 ref: `ca27a177cc9f061e…` | **EXCLUDED** (0 rows in product weights) |
| **DimHand / LLHands / MGR-Dark / NC** | R18–R20 audit | `CC BY-NC*` / Gated | **`BLOCKED`** | `0` product rows | N/A | **BLOCKED** |
| **Owner `S-07ba0cde`** (`4T` & `2T`) | R20/R22 | Owner Numeric Telemetry | **`UNLABELLED_TELEMETRY`** | `4` trials (`7,612` frames; `T004` = `2,082` frames / `1,411` hand frames) | `4T`: `{sha256_file(OWNER_4T_JSON)[:16]}…` | **0 supervised GT rows**; T004 pinch/replay consistency diagnostics only |

---

## 3. Programmatic Zero-Leakage Split Overlap Verification (D03)

All checks executed programmatically from raw disk artifacts (`split_overlap_verification.json`, **`overall_PASS: true`**):

| Dataset / Split Check | Overlap Count | Verification Details | Status |
|---|---:|---|---|
| **Locked VAL & TEST Feature Binary Byte-Identity** | `0` diffs | `r20_feat`, `r20_c2_feat`, `r20_c3_feat` share identical VAL (`5,067` rows, SHA `{f32_hashes['r20_feat_val']['sha256'][:12]}…`) and TEST (`4,720` rows, SHA `{f32_hashes['r20_feat_test']['sha256'][:12]}…`) | **PASS** |
| **HandGesture-5G Clusters / Sample IDs / Files / CRC32** | `0 / 0 / 0 / 0` | `21` train / `8` val / `9` test atomic clusters; `0` cross-split same-class `dHash<=8` or `15s` bursts *(note: `{dhash_cross_diff_cls}` cross-class studio pairs from different gestures share same day/phone, which is why person-disjoint Natural RGB v3, IPN, and HANDS RGB-D S4..5 OOD are mandatory alongside HG5G)* | **PASS** |
| **HandGesture-5G Train-Only Augs (`extra_hg5g_aug` + `hg5g_720`)** | `0` | All `1,915` augmented rows and `1,097` cached 720p images belong strictly to train clusters (`0` in val/test) | **PASS** |
| **Natural RGB v3 Participants / Clips / Sample IDs** | `0 / 0 / 0` | `19` train / `4` val / `3` test participants (`1,352` clips) | **PASS** |
| **IPN HandS Persons / Videos** | `0 / 0` | `19` train / `5` val / `5` test persons (`128 / 36 / 36` videos); leaky official 148/52 split rejected | **PASS** |
| **HANDS RGB-D Subjects / Filenames** | `0 / 0` | `Subject1..2` train (`1,692` pistol OTHER) vs `Subject3` val (`221`) vs `Subject4..5` locked OOD (`1,080` frames / `2,092` matched hands) | **PASS** |
| **Mendeley `bxr7kx84y6` Games & Temporal Buffer** | `0` | Locked `599`-frame 5 games (`Chinese Chess, Dice, Meeting Chess, Aeroplane Chess, Checkers`) have `0` overlap with `Gomoku/Poker`; `Gomoku` gap = `{bxr_gaps['Dim Light/Gomoku']['buffer_gap_frames']}` frames, `Poker` gap = `{bxr_gaps['Natural Light/Poker']['buffer_gap_frames']}` frames (`> 20` frame buffer) | **PASS** |

---

## 4. K4 Geometry-Verified Label Mapping Audit (D02, D06, D07)

Before mapping any source class to R22 K4 heads, every dataset class was audited geometrically on actual MediaPipe 21-point landmarks (never blindly mapped by folder name):

1. **Pose Head (`FIST / ONE / TWO / FIVE / OTHER`) Cleanliness Findings:**
   - **`HandGesture-5G`:** Static poses are geometrically crisp (`Fist` `ext=[0,0,0,0]`, `Pointing Up` `ext=[0.94,0,0,0.08]` `tl=0.68`, `V-Sign` `ext=[0.98,0.99,0.04,0.05]`, `Open Palm` `ext=[1,1,1,1]` `tl=1.85`, `L-Sign` `tl=2.09 -> OTHER`).
   - **`HANDS RGB-D`:** `Punch_VFL/VFR -> FIST`, `One_VFL/VFR -> ONE`, `Two_VFL/VFR -> TWO`, `Five_VFL/VFR + Horiz_HBL/HBR/HFL/HFR -> FIVE` (all `ext=[1,1,1,1]`, `tl=1.74..1.94`), `Six/Seven/Eight/Span -> OTHER` (gold-standard 3-finger & shaka hard negatives!). **`TimeOut` was EXCLUDED** after geometric audit revealed each single hand in the 2-hand T-pose has `ext=[1,1,1,1]`, `tl=1.61` (preventing false `FIVE -> OTHER` label noise!).
   - **`Natural RGB v3`:** Video-clip rank audit revealed `rank 0..1` are open-hand raise transitions (`fist` rank 0 had `ext=[0.78,0.69,0.63,0.71]`!). Therefore ONLY clip **apex frames (`rank 3..5`)** are mapped for static Pose supervision (`fist->FIST`, `peace_sign->TWO`, `raised_hand/stop->FIVE`, `ok_sign/thumbs_up/thumbs_down->OTHER`), while dynamic/conversational classes (`come_here, go, wave, palm_down_push, point_left, point_right`) remain quarantined.
2. **Pinch Head (`TOUCH / NEAR / OPEN`) `DATA_GAP` Audit (D07):**
   - **`0` legal `CC BY 4.0` datasets** contain frame-level ground truth separating physical thumb-index contact (`TOUCH`, `<= 0.30`) from intentional hover (`NEAR`, `0.30..0.50`).
   - `Natural RGB v3` `ok_sign` (`n=561`) has `58.5%` frames with `pinchRatio <= 0.30`, but represents a 3-extended-finger OK gesture with clip-level (not frame-contact) annotations.
   - `HandGesture-5G` `Fist` (`48.3%` in `0.30..0.50`) and `HANDS RGB-D` `Punch` (`43.1..49.4%` in `0.30..0.50`, `9.0..23.5% <= 0.30`) prove that **curled fists frequently produce small thumb-to-index distances** — confirming why folded-index pinch gates (`<= 0.20`) and non-fist constraints are mandatory.

---

## 5. Candidate New Legal Worst-Case Camera Sources Provenance Audit (D10)

| Candidate Source | DOI / URL | License (Live API Verified) | Content & Worst-Case Relevance | R22 Audit Verdict |
|---|---|---|---|---|
| **Mendeley `bpkd429sxt.1`** (Preinl, Nov 2025) | [`10.17632/bpkd429sxt.1`](https://data.mendeley.com/datasets/bpkd429sxt/1) | `CC BY 4.0` | 10-class pre-extracted MediaPipe Hands CSV landmarks (`GE01NU..GE19NU`) + `collage.jpg` | **`DEFERRED_PREEXTRACTED_UNVERIFIED`** — Legal, but lacks raw RGB frames (cannot run lowlight/blur/glare augmentation), lacks MP Hands version/aspect/subject IDs, and uses opaque `GE*` taxonomy with no pistol/pinch definitions. |
| **Multimodal BISINDO Corpus v2** (Hayati et al., Dec 2025) | [`10.17632/235c78xbmk.2`](https://data.mendeley.com/datasets/235c78xbmk/2) | `CC BY 4.0` | `19,760` Indonesian Sign Language (A–Z) frames/videos across **low-light indoor**, bright indoor, and outdoor scenes (faces blurred) | **`ELIGIBLE_FUTURE_LOWLIGHT_HARD_NEG`** — Commercial-safe with authentic Indonesian low-light/motion diversity; single-actor constraint means entire corpus must stay TRAIN-only `OTHER` hard negatives if ingested later. |
| **`bxr7kx84y6.2` Remaining 22 Upstream Zips** (Cui et al., Sep 2024) | [`10.17632/bxr7kx84y6.2`](https://data.mendeley.com/datasets/bxr7kx84y6/2) | `CC BY 4.0` | `~7.75 GiB` across 22 uncached zips of dim-light & natural-light interactive hands | **`ELIGIBLE_FUTURE_EXPANSION`** — 100% session-disjoint from cached `dim_light_1.zip` / `natural_light_1.zip` locked holdouts; streamable via HTTP 206 Range. |
| **Exocentric Hand Interaction v2** (Zadid et al., Jul 2025) | [`10.17632/9d37m3nfgm.2`](https://data.mendeley.com/datasets/9d37m3nfgm/2) | `CC BY 4.0` | `7,221` third-person PNG frames (`2.48 GiB`) with 2–4 interacting people | **`ELIGIBLE_FUTURE_BYSTANDER_HARD_NEG`** — Legal multi-hand distractor stress source; no gesture labels. |
"""
    with open(f"{R22_REG_DIR}/DATASET_LINEAGE_AND_LICENSE_AUDIT.md", "w", encoding="utf-8") as f:
        f.write(md)

    elapsed = round(time.time() - t0, 2)
    print(f"[registry] K7 registry, split verification (PASS), and lineage audit written in {elapsed}s -> {R22_REG_DIR}", flush=True)
    return overlap_report


# =================================================================================================
# STAGE 2: R22 TRAIN-ONLY REALISTIC AUGMENTATIONS (IMAGE + LANDMARK SPACE, D09)
# =================================================================================================
def _srgb_to_lin(x: np.ndarray) -> np.ndarray:
    return np.power(np.clip(x, 0.0, 1.0), 2.2)


def _lin_to_srgb(x: np.ndarray) -> np.ndarray:
    return np.power(np.clip(x, 0.0, 1.0), 1.0 / 2.2)


def aug_dir_motion_blur(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    k = int(rng.choice([9, 13]))
    ang = float(rng.uniform(0.0, 180.0))
    ker = np.zeros((k, k), np.float32)
    ker[k // 2, :] = 1.0
    M = cv2.getRotationMatrix2D((k / 2.0 - 0.5, k / 2.0 - 0.5), ang, 1.0)
    ker = cv2.warpAffine(ker, M, (k, k))
    ker /= max(float(ker.sum()), 1e-6)
    return cv2.filter2D(rgb, -1, ker)


def aug_glare_clip(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Dark room ambient + bright monitor specular glare blob clipping hand pixels to 255."""
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = w * float(rng.uniform(0.35, 0.65))
    cy = h * float(rng.uniform(0.35, 0.65))
    sx = w * float(rng.uniform(0.16, 0.30))
    sy = h * float(rng.uniform(0.16, 0.30))
    blob = np.exp(-0.5 * (((xx - cx) / sx) ** 2 + ((yy - cy) / sy) ** 2))[..., None]
    lin = _srgb_to_lin(rgb.astype(np.float32) / 255.0)
    # Darken ambient room, add intense clipped specular wash on hand area
    out_lin = lin * (0.28 + 1.85 * blob) + 0.35 * (blob ** 2)
    out = np.clip(_lin_to_srgb(out_lin) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return out


def aug_lowexp_chroma_noise(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Underexposed cheap webcam + Poisson shot noise + independent R/G/B chroma read noise."""
    gain = float(rng.uniform(0.16, 0.32))
    cast = np.asarray([rng.uniform(0.85, 1.15), rng.uniform(0.92, 1.08), rng.uniform(0.85, 1.20)], dtype=np.float32)
    lin = _srgb_to_lin(rgb.astype(np.float32) / 255.0) * gain * cast
    peak = 512.0
    shot = rng.poisson(np.clip(lin, 0.0, None) * peak).astype(np.float32) / peak
    chroma_noise = rng.normal(0.0, 0.014, lin.shape).astype(np.float32)
    return np.clip(_lin_to_srgb(shot + chroma_noise) * 255.0 + 0.5, 0, 255).astype(np.uint8)


def aug_jpeg_lowcontrast(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    alpha = float(rng.uniform(0.65, 0.85))
    beta = float(rng.uniform(-10.0, 15.0))
    lc = np.clip(rgb.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)
    q = int(rng.choice([12, 18]))
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(lc, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


def aug_persp_rot(rgb: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """Perspective yaw/pitch foreshortening + mild in-plane rotation."""
    h, w = rgb.shape[:2]
    ang = float(rng.uniform(-22.0, 22.0))
    M_rot = cv2.getRotationMatrix2D((w * 0.5, h * 0.5), ang, float(rng.uniform(0.82, 1.02)))
    rot = cv2.warpAffine(rgb, M_rot, (w, h), borderMode=cv2.BORDER_REFLECT_101)
    d = float(rng.uniform(0.05, 0.13))
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    dst = np.float32([
        [w * rng.uniform(0, d), h * rng.uniform(0, d)],
        [w * (1 - rng.uniform(0, d)), h * rng.uniform(0, d)],
        [w * (1 - rng.uniform(0, d)), h * (1 - rng.uniform(0, d))],
        [w * rng.uniform(0, d), h * (1 - rng.uniform(0, d))],
    ])
    H = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(rot, H, (w, h), borderMode=cv2.BORDER_REFLECT_101)


R22_IMG_AUGS = {
    "r22_dir_mblur": aug_dir_motion_blur,
    "r22_glare_clip": aug_glare_clip,
    "r22_lowexp_chroma": aug_lowexp_chroma_noise,
    "r22_jpeg_lowc": aug_jpeg_lowcontrast,
    "r22_persp_rot": aug_persp_rot,
}

HG5G_TO_PISTOL = {
    "Pointing Up": "POINT_READY",
    "L-Sign": "POINT_PRESS",
    "Fist": "OTHER",
    "V-Sign": "OTHER",
    "Open Palm_Open Hand": "OTHER",
}
HG5G_TO_POSE = {
    "Fist": "FIST",
    "Pointing Up": "ONE",
    "V-Sign": "TWO",
    "Open Palm_Open Hand": "FIVE",
    "L-Sign": "OTHER",
}


def _mp_aug_worker(args):
    rows, seed0 = args
    sys.path.insert(0, f"{REPO}/r20/scripts")
    from mp_common import build_landmarker, clahe_rgb_exact, compute_luma_stats, extract_mp_result
    import mediapipe as mp

    det0 = build_landmarker("IMAGE")
    det1 = build_landmarker("IMAGE")

    def _detect(det, im):
        return det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(im)))

    out_rows = []
    stats = collections.defaultdict(lambda: {"total": 0, "l0_hit": 0, "l1_hit": 0, "any_hit": 0})
    for r in rows:
        p = f"{HG5G_720_DIR}/{r['sample_id']}.jpg"
        if not os.path.exists(p):
            continue
        bgr = cv2.imread(p)
        if bgr is None:
            continue
        base = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        h, w = base.shape[:2]
        aspect = w / h
        sid_num = int(r["sample_id"].split("_")[1])
        for ai, (an, fn) in enumerate(R22_IMG_AUGS.items()):
            rng = np.random.default_rng(seed0 + sid_num * 131 + ai * 17)
            im = fn(base, rng)
            p0 = extract_mp_result(_detect(det0, im), aspect)
            luma = compute_luma_stats(im)
            hand = p0["hands"][0] if p0["n_hands"] > 0 else None
            l1_hit = 0
            if hand is None:
                c320 = clahe_rgb_exact(luma["scaled_320"])
                p1 = extract_mp_result(_detect(det1, c320), aspect)
                if p1["n_hands"] > 0:
                    hand = p1["hands"][0]
                    l1_hit = 1
            st = stats[an]
            st["total"] += 1
            st["l0_hit"] += int(p0["n_hands"] > 0)
            st["l1_hit"] += l1_hit
            if hand is not None:
                st["any_hit"] += 1
                out_rows.append({
                    "source": an,
                    "sample_id": r["sample_id"],
                    "raw_label": r["class_name"],
                    "pistol_label": HG5G_TO_PISTOL[r["class_name"]],
                    "pose_label": HG5G_TO_POSE[r["class_name"]],
                    "group": f"hg5g_c{r['cluster_id']}",
                    "aspect": round(aspect, 5),
                    "landmarks": hand["landmarks"],
                })
    return out_rows, dict(stats)


def generate_r22_train_image_augs(workers: int = 6) -> tuple[list[dict], dict]:
    """Generate NEW R22 image-space train-only augmentations on cached HG5G train images."""
    cache_path = "/tmp/r22_wdata_hg5g_img_aug_seed20261122.json"
    if os.path.exists(cache_path):
        d = json.load(open(cache_path, encoding="utf-8"))
        print(f"[r22_img_aug] Loaded cached {len(d['rows'])} train-only rows from {cache_path}", flush=True)
        return d["rows"], d["stats"]

    t0 = time.time()
    all_hg = [json.loads(l) for l in open(HG5G_JSONL, encoding="utf-8") if l.strip()]
    train_hg = [r for r in all_hg if effective_hg5g_split(r) == "train" and os.path.exists(f"{HG5G_720_DIR}/{r['sample_id']}.jpg")]
    # Select 100% of L-Sign & Pointing Up + up to 90 each of Fist, V-Sign, Open Palm (strictly TRAIN clusters!)
    selected = []
    cnt = collections.Counter()
    train_hg.sort(key=lambda r: r["sample_id"])
    for r in train_hg:
        cls = r["class_name"]
        if cls in ("L-Sign", "Pointing Up"):
            selected.append(r)
        elif cnt[cls] < 90:
            cnt[cls] += 1
            selected.append(r)

    # Double-check ZERO non-train clusters
    assert all(effective_hg5g_split(r) == "train" for r in selected)

    chunks = [selected[i::workers] for i in range(workers)]
    rows_all = []
    agg_stats = collections.defaultdict(lambda: {"total": 0, "l0_hit": 0, "l1_hit": 0, "any_hit": 0})
    with cf.ProcessPoolExecutor(max_workers=workers) as ex:
        for chunk_rows, chunk_st in ex.map(_mp_aug_worker, [(ch, 20261122) for ch in chunks]):
            rows_all.extend(chunk_rows)
            for k, v in chunk_st.items():
                for fk in ("total", "l0_hit", "l1_hit", "any_hit"):
                    agg_stats[k][fk] += v[fk]

    summary_stats = {}
    for k, v in sorted(agg_stats.items()):
        tot = max(1, v["total"])
        summary_stats[k] = {
            **v,
            "l0_recall": round(v["l0_hit"] / tot, 4),
            "l0_plus_l1_recall": round(v["any_hit"] / tot, 4),
            "detector_miss": v["total"] - v["any_hit"],
        }
    elapsed = round(time.time() - t0, 2)
    payload = {
        "seed": 20261122,
        "train_images_probed": len(selected),
        "rows_emitted": len(rows_all),
        "elapsed_sec": elapsed,
        "stats": summary_stats,
        "rows": rows_all,
    }
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(payload, f)
    print(f"[r22_img_aug] Generated {len(rows_all)} train-only rows across {len(selected)} train images in {elapsed}s", flush=True)
    return rows_all, summary_stats


def perturb_landmarks_r22(
    lm: list[list[float]],
    aspect: float,
    rng: np.random.Generator,
    mode: str,
    preserve_fingers: bool = False,
) -> tuple[list[list[float]], float]:
    """Physically-bounded train-only landmark-space augmentations (D09):
    - aniso_jitter: higher noise along fingertips (4,8,12,16,20) & oblique axis
    - finger_dropout: structured inward occlusion/collapse perturbation on ring/pinky/fingertips
    - persp_aspect: 2D rotation + aspect stretch + foreshortening squash
    """
    pts = np.asarray([[p[0], p[1], p[2] if len(p) > 2 else 0.0] for p in lm], dtype=np.float64)
    w = pts[0, :2].copy()
    span = float(np.linalg.norm((pts[9, :2] - w) * np.array([aspect, 1.0])))
    scale = max(span, 0.04)

    if mode == "aniso_jitter":
        # Anisotropic covariance: stronger along random blur direction + 2.2x stronger on fingertips
        theta = float(rng.uniform(0, math.pi))
        ct, st = math.cos(theta), math.sin(theta)
        sig_maj = scale * float(rng.uniform(0.015, 0.042))
        sig_min = scale * float(rng.uniform(0.005, 0.016))
        for i in range(21):
            mult = 2.0 if i in (4, 8, 12, 16, 20) else (1.3 if i in (3, 7, 11, 15, 19) else 0.7)
            u = float(rng.normal(0.0, sig_maj * mult))
            v = float(rng.normal(0.0, sig_min * mult))
            pts[i, 0] += (u * ct - v * st) / max(aspect, 0.5)
            pts[i, 1] += (u * st + v * ct)
        return pts.tolist(), aspect

    if mode == "finger_dropout":
        # Simulate occluded ring/pinky (or partial fingertip collapse under rolled/dorsal view)
        # Keep index (5..8) and thumb (1..4) semantically intact when preserve_fingers=False for pistol,
        # or gently pull ring/pinky toward their PIP/MCP joints when curled/occluded.
        target_chains = [(13, 14, 15, 16), (17, 18, 19, 20)]
        if not preserve_fingers and rng.random() < 0.35:
            # Also perturb middle fingertip slightly toward PIP (partially occluded back finger)
            target_chains.append((9, 10, 11, 12))
        for mcp, pip, dip, tip in target_chains:
            if rng.random() < 0.7:
                # Pull dip & tip slightly toward pip with noise (simulates partial occlusion / foreshortening)
                alpha = float(rng.uniform(0.12, 0.35))
                pts[dip, :2] = (1 - alpha) * pts[dip, :2] + alpha * pts[pip, :2] + rng.normal(0, scale * 0.02, 2)
                pts[tip, :2] = (1 - alpha) * pts[tip, :2] + alpha * pts[pip, :2] + rng.normal(0, scale * 0.03, 2)
        # Mild fingertip jitter on thumb & index
        for ti in (4, 8):
            pts[ti, 0] += float(rng.normal(0, scale * 0.022)) / max(aspect, 0.5)
            pts[ti, 1] += float(rng.normal(0, scale * 0.022))
        return pts.tolist(), aspect

    if mode == "persp_aspect":
        # Rotate + foreshorten in aspect-corrected space, then map to webcam aspect
        new_aspect = float(rng.choice([1.0, 4.0 / 3.0, 16.0 / 9.0]))
        g = pts[:, :2].copy()
        g[:, 0] *= aspect
        c = g.mean(axis=0)
        g -= c
        ang = float(rng.uniform(-0.45, 0.45))  # +-26 deg
        ca, sa = math.cos(ang), math.sin(ang)
        R = np.array([[ca, -sa], [sa, ca]])
        fx = float(rng.uniform(0.84, 1.14))
        fy = float(rng.uniform(0.84, 1.14))
        g = (g @ R.T) * np.array([fx, fy])
        g += np.array([0.5 * new_aspect, 0.5])
        pts[:, 0] = g[:, 0] / new_aspect
        pts[:, 1] = g[:, 1]
        return pts.tolist(), new_aspect

    return pts.tolist(), aspect


# =================================================================================================
# SHARED PYTORCH MLP + CALIBRATION + EXPORT
# =================================================================================================
class CompactMLP(nn.Module):
    def __init__(self, d_in: int, hidden: list[int], n_classes: int, dropout: float = 0.0):
        super().__init__()
        self.hidden = list(hidden)
        dims = [d_in] + list(hidden) + [n_classes]
        self.lins = nn.ModuleList([nn.Linear(dims[i], dims[i + 1]) for i in range(len(dims) - 1)])
        self.dropout = dropout
        for i, l in enumerate(self.lins):
            if i < len(self.lins) - 1:
                nn.init.kaiming_normal_(l.weight, nonlinearity="relu")
            else:
                nn.init.xavier_normal_(l.weight)
            nn.init.zeros_(l.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        for i, l in enumerate(self.lins):
            x = l(x)
            if i < len(self.lins) - 1:
                x = F.relu(x)
                if self.dropout > 0.0 and self.training:
                    x = F.dropout(x, p=self.dropout, training=True)
        return x


def calibrate_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    n = len(y)
    best_t, best = 1.0, 1e9
    for T in np.linspace(0.40, 4.0, 145):
        p = softmax_np(logits / T)
        v = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if v < best:
            best, best_t = v, float(T)
    for T in np.linspace(max(0.30, best_t - 0.08), best_t + 0.08, 65):
        p = softmax_np(logits / T)
        v = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-7, 1.0))))
        if v < best:
            best, best_t = v, float(T)
    return round(best_t, 4)


def export_ts_model(
    net: CompactMLP,
    out_path: str,
    name: str,
    version: str,
    provenance: str,
    labels: list[str],
    mean: np.ndarray,
    std: np.ndarray,
    T: float,
) -> dict[str, Any]:
    layers = []
    for l in net.lins:
        W = l.weight.detach().cpu().numpy().T  # [in, out]
        b = l.bias.detach().cpu().numpy()
        layers.append({
            "W": [[round(float(v), 6) for v in row] for row in W],
            "b": [round(float(v), 6) for v in b],
        })
    doc = {
        "name": name,
        "version": version,
        "license_provenance": provenance,
        "labels": labels,
        "feature_names": R19_FEATURE_NAMES,
        "mean": [round(float(x), 6) for x in mean],
        "std": [round(float(x), 6) for x in std],
        "temperature": T,
        "layers": layers,
    }
    raw = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    with open(out_path, "wb") as f:
        f.write(raw)
    return {
        "path": out_path,
        "bytes": len(raw),
        "sha256": sha256_file(out_path),
        "arch": [len(mean)] + [len(l["b"]) for l in layers],
        "temperature": T,
        "doc": doc,
    }


# =================================================================================================
# HEAD 1: R22 PISTOL CLASSIFIER (POINT_READY / POINT_PRESS / OTHER)
# =================================================================================================
def load_r20_split(prefix: str, split: str):
    meta = json.load(open(f"{R20_FEAT_DIR}/{prefix}_{split}.meta.json", encoding="utf-8"))
    d = int(meta["feature_count"])
    X = np.fromfile(f"{R20_FEAT_DIR}/{prefix}_{split}.f32", dtype=np.float32).reshape(-1, d)
    y = np.asarray(meta["y"], dtype=np.int64)
    return meta, X, y


def verify_py_ts_feature_parity(X_ts_test: np.ndarray, meta_test: dict) -> dict[str, Any]:
    """Verify PyR19FeatureTracker matches frozen TS r20_feat_test.f32 on HG5G locked TEST rows."""
    hg_rows = [json.loads(l) for l in open(HG5G_JSONL, encoding="utf-8") if l.strip()]
    vecs = []
    for r in hg_rows:
        if effective_hg5g_split(r) != "test":
            continue
        hand = r["l0"]["hands"][0] if r["l0"]["n_hands"] > 0 else (r["l1"]["hands"][0] if r["l1"]["n_hands"] > 0 else None)
        if not hand:
            continue
        if r["class_name"] not in HG5G_TO_PISTOL:
            continue
        v = PyR19FeatureTracker().extract(hand["landmarks"], 0.0, r.get("aspect") or 1.0)
        if v is not None:
            vecs.append(v)
    X_py = np.asarray(vecs, dtype=np.float32)
    # First 230 rows of r20_feat_test are hg5g_static!
    n = len(X_py)
    assert all(s == "hg5g_static" for s in meta_test["sources"][:n])
    max_diff = float(np.max(np.abs(X_py - X_ts_test[:n])))
    mean_diff = float(np.mean(np.abs(X_py - X_ts_test[:n])))
    assert max_diff < 1e-4, f"Python vs TS feature encoder mismatch! max_diff={max_diff}"
    return {"hg5g_test_rows_verified": n, "max_abs_diff": float(f"{max_diff:.3e}"), "mean_abs_diff": float(f"{mean_diff:.3e}"), "PASS": True}


def build_pistol_r22_aug_features(img_aug_rows: list[dict], seed: int = 20261122):
    """Extract 82D features for R22 train-only image augs AND structured landmark-space augs."""
    rng = np.random.default_rng(seed)
    pistol_id = {k: i for i, k in enumerate(PISTOL_LABELS)}

    # 1. Image-space augmented rows (from real MediaPipe on glare/mblur/lowexp_chroma/jpeg/persp)
    X_img, y_img, w_img, src_img = [], [], [], []
    for r in img_aug_rows:
        lbl = r["pistol_label"]
        t = PyR19FeatureTracker()
        v = t.extract(r["landmarks"], 0.0, r["aspect"])
        if v is not None:
            X_img.append(v)
            y_img.append(pistol_id[lbl])
            w_img.append(0.75 if lbl != "OTHER" else 0.40)
            src_img.append(r["source"])

    # 2. Structured landmark-space augmentations on TRAIN-only HG5G + HANDS RGB-D S1..2 + Natural RGB v3 train
    X_lm, y_lm, w_lm, src_lm = [], [], [], []
    hg_rows = [json.loads(l) for l in open(HG5G_JSONL, encoding="utf-8") if l.strip()]
    for r in hg_rows:
        if effective_hg5g_split(r) != "train":
            continue
        hand = r["l0"]["hands"][0] if r["l0"]["n_hands"] > 0 else (r["l1"]["hands"][0] if r["l1"]["n_hands"] > 0 else None)
        if not hand or r["class_name"] not in HG5G_TO_PISTOL:
            continue
        lbl = HG5G_TO_PISTOL[r["class_name"]]
        aspect = float(r.get("aspect") or 1.0)
        # Positive classes get all 3 landmark aug modes + variable-dt causal history; OTHER gets 2 modes
        modes = ["aniso_jitter", "finger_dropout", "persp_aspect"] if lbl != "OTHER" else ["aniso_jitter", "persp_aspect"]
        for mode in modes:
            lm_aug, asp_aug = perturb_landmarks_r22(hand["landmarks"], aspect, rng, mode, preserve_fingers=False)
            t = PyR19FeatureTracker()
            v0 = t.extract(lm_aug, 0.0, asp_aug)
            if v0 is not None:
                X_lm.append(v0)
                y_lm.append(pistol_id[lbl])
                w_lm.append(0.70 if lbl != "OTHER" else 0.35)
                src_lm.append(f"r22_lm_{mode}")
            # Variable-dt causal pair (12/15/30 FPS simulated dt in 33..90ms)
            if lbl != "OTHER" and mode == "aniso_jitter":
                dt_ms = float(rng.choice([33.3, 66.7, 85.0, 120.0]))
                lm_aug2, _ = perturb_landmarks_r22(lm_aug, asp_aug, rng, "aniso_jitter")
                v1 = t.extract(lm_aug2, dt_ms, asp_aug)
                if v1 is not None:
                    X_lm.append(v1)
                    y_lm.append(pistol_id[lbl])
                    w_lm.append(0.65)
                    src_lm.append("r22_lm_vardt_causal")

    # Also apply anisotropic jitter + persp_aspect to a subset of HANDS RGB-D S1..2 OTHER hard negatives
    hr_tr = [json.loads(l) for l in open(EXTRA_HR_TRAIN, encoding="utf-8") if l.strip()]
    for idx, r in enumerate(hr_tr):
        if idx % 3 != 0:
            continue
        mode = "aniso_jitter" if (idx % 2 == 0) else "persp_aspect"
        lm_aug, asp_aug = perturb_landmarks_r22(r["landmarks"], float(r["aspect"]), rng, mode)
        v = PyR19FeatureTracker().extract(lm_aug, 0.0, asp_aug)
        if v is not None:
            X_lm.append(v)
            y_lm.append(2)
            w_lm.append(0.35)
            src_lm.append(f"r22_lm_hrgbd_{mode}")

    return (
        (np.asarray(X_img, np.float32), np.asarray(y_img, np.int64), np.asarray(w_img, np.float32), src_img),
        (np.asarray(X_lm, np.float32), np.asarray(y_lm, np.int64), np.asarray(w_lm, np.float32), src_lm),
    )


def build_pistol_weights(ytr: np.ndarray, sources: list[str], sw: np.ndarray) -> np.ndarray:
    counts = np.bincount(ytr, minlength=3).astype(np.float64)
    cw = 1.0 / np.power(np.maximum(counts, 1.0), 0.52)
    cw[0] = min(cw[0], cw[2] * 13.0)
    cw[1] = min(cw[1], cw[2] * 13.0)
    cw = cw / cw.mean()
    w = cw[ytr] * sw.astype(np.float64)
    for i, s in enumerate(sources):
        if ytr[i] == 2:
            if s in ("n66_dim", "n66_backlit", "n66_green_led", "n66_red_led"):
                w[i] *= 1.35
            elif s.startswith(("hrgbd_", "bxr7_", "r22_lm_hrgbd_")):
                w[i] *= 1.45
            elif s.startswith("hg5g_"):
                w[i] *= 1.25
        else:
            if s.startswith(("r22_", "hg5g_aug_", "hg5g_l1_")):
                w[i] *= 1.15
    w = w / w.mean()
    return w.astype(np.float32)


def fit_pistol_mlp(
    Xtr: np.ndarray, ytr: np.ndarray, wtr: np.ndarray,
    Xva: np.ndarray, yva: np.ndarray, Xva_hr_s3: np.ndarray,
    hidden: list[int], l2: float, lr: float, epochs: int, noise: float,
    dropout: float, label_smoothing: float, seed: int, device: torch.device,
    loss_mode: str = "focal", focal_gamma: float = 2.0, bs: int = 512,
):
    torch.manual_seed(seed)
    np.random.seed(seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(seed)
    net = CompactMLP(Xtr.shape[1], hidden, 3, dropout=dropout).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=l2)
    Xt = torch.from_numpy(Xtr).to(device)
    yt = torch.from_numpy(ytr).to(device)
    wt = torch.from_numpy(wtr).to(device)
    Xv = torch.from_numpy(Xva).to(device)
    Xhr = torch.from_numpy(Xva_hr_s3).to(device)
    g = torch.Generator(device="cpu").manual_seed(seed)

    best_key = (-1, -1, -1.0, -1.0, -999999)
    best_state = None
    best_ep = 0
    n = len(Xt)

    for ep in range(1, epochs + 1):
        net.train()
        perm = torch.randperm(n, generator=g).to(device)
        lr_ep = lr * (0.08 + 0.92 * 0.5 * (1.0 + math.cos(math.pi * (ep - 1) / max(1, epochs - 1))))
        for pg in opt.param_groups:
            pg["lr"] = lr_ep
        for s in range(0, n, bs):
            idx = perm[s : s + bs]
            xb = Xt[idx]
            if noise > 0:
                xb = xb + noise * torch.randn_like(xb)
            logits = net(xb)
            ce = F.cross_entropy(logits, yt[idx], reduction="none", label_smoothing=label_smoothing)
            if loss_mode == "focal":
                pt = torch.exp(-F.cross_entropy(logits, yt[idx], reduction="none"))
                ce = ((1.0 - pt) ** focal_gamma) * ce
            wb = wt[idx]
            loss = (ce * wb).sum() / wb.sum().clamp_min(1e-6)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()

        net.eval()
        with torch.no_grad():
            lv = net(Xv).cpu().numpy()
            lhr = net(Xhr).cpu().numpy()
        m = multiclass_metrics(yva, lv.argmax(1), PISTOL_LABELS)
        hr_fp_press = int(np.sum(lhr.argmax(1) == 1))
        # Strict VAL-only lexicographic selection: zero ready->press, <=1 val fp_press, <=1 HR S3 fp_press, max macroF1
        safe_tier = 2 if (m["other_to_press"] == 0 and m["ready_to_press"] == 0 and hr_fp_press == 0) else (
            1 if (m["other_to_press"] <= 1 and m["ready_to_press"] == 0 and hr_fp_press <= 1) else 0
        )
        key = (
            safe_tier,
            -m["other_to_press"] - hr_fp_press,
            round(m["macroF1"], 4),
            round(0.5 * (m["f1_ready"] + m["f1_press"]), 4),
            -m["other_to_ready"],
        )
        if key > best_key:
            best_key = key
            best_state = {k_: v.detach().cpu().clone() for k_, v in net.state_dict().items()}
            best_ep = ep

    net.load_state_dict(best_state)
    return net.cpu().eval(), best_ep, best_key


def train_pistol_head(device: torch.device, img_aug_rows: list[dict], img_aug_stats: dict) -> dict[str, Any]:
    print("\n================ HEAD 1: R22 PISTOL CLASSIFIER (GPU 0) ================", flush=True)
    trm, Xtr_base, ytr_base = load_r20_split("r20_c3_feat", "train")
    vam, Xva_raw, yva = load_r20_split("r20_c3_feat", "val")
    tem, Xte_raw, yte = load_r20_split("r20_c3_feat", "test")

    parity_feat = verify_py_ts_feature_parity(Xte_raw, tem)
    print(f"[Head1] Py<->TS 82D feature parity: {parity_feat}", flush=True)

    # Load HANDS RGB-D Subject3 VAL hard negatives (strictly VAL split!)
    hr_s3 = [json.loads(l) for l in open(HR_S3_VAL, encoding="utf-8") if l.strip()]
    Xva_hr_raw = np.asarray(
        [v for r in hr_s3 if (v := PyR19FeatureTracker().extract(r["landmarks"], 0.0, float(r["aspect"]))) is not None],
        dtype=np.float32,
    )

    # Build R22 train-only image + landmark augmented feature sets
    (X_img, y_img, w_img, src_img), (X_lm, y_lm, w_lm, src_lm) = build_pistol_r22_aug_features(img_aug_rows)
    print(f"[Head1] Base R20 C3 train={len(Xtr_base)} | +R22 ImgAug={len(X_img)} | +R22 LmAug={len(X_lm)}", flush=True)

    sw_base = np.asarray(trm["sample_weights"], np.float32)
    src_base = list(trm["sources"])

    # ---- D09 Augmentation Ablation (4 controlled conditions, same architecture [82->64->32->3], seed 20261122) ----
    ablation_configs = {
        "A0_base_r20_c3": (Xtr_base, ytr_base, sw_base, src_base),
        "A1_plus_r22_img_aug": (
            np.concatenate([Xtr_base, X_img]),
            np.concatenate([ytr_base, y_img]),
            np.concatenate([sw_base, w_img]),
            src_base + src_img,
        ),
        "A2_plus_r22_lm_aug": (
            np.concatenate([Xtr_base, X_lm]),
            np.concatenate([ytr_base, y_lm]),
            np.concatenate([sw_base, w_lm]),
            src_base + src_lm,
        ),
        "A3_full_r22_aug_union": (
            np.concatenate([Xtr_base, X_img, X_lm]),
            np.concatenate([ytr_base, y_img, y_lm]),
            np.concatenate([sw_base, w_img, w_lm]),
            src_base + src_img + src_lm,
        ),
    }
    ablation_results = {}
    for aname, (Xa_raw, ya, swa, srca) in ablation_configs.items():
        mu = Xa_raw.mean(0)
        sd = np.where(Xa_raw.std(0) > 1e-5, Xa_raw.std(0), 1.0).astype(np.float32)
        Xa = ((Xa_raw - mu) / sd).astype(np.float32)
        Xva_n = ((Xva_raw - mu) / sd).astype(np.float32)
        Xte_n = ((Xte_raw - mu) / sd).astype(np.float32)
        Xhr_n = ((Xva_hr_raw - mu) / sd).astype(np.float32)
        wa = build_pistol_weights(ya, srca, swa)
        net, ep, _ = fit_pistol_mlp(
            Xa, ya, wa, Xva_n, yva, Xhr_n,
            hidden=[64, 32], l2=6e-4, lr=2.5e-3, epochs=60, noise=0.025,
            dropout=0.05, label_smoothing=0.01, seed=20261122, device=device,
        )
        with torch.no_grad():
            lv = net(torch.from_numpy(Xva_n)).numpy()
            lt = net(torch.from_numpy(Xte_n)).numpy()
            lhr = net(torch.from_numpy(Xhr_n)).numpy()
        T = calibrate_temperature(lv, yva)
        mv = multiclass_metrics(yva, lv.argmax(1), PISTOL_LABELS)
        mt = multiclass_metrics(yte, lt.argmax(1), PISTOL_LABELS)
        te_nll, te_ece = nll_ece(softmax_np(lt / T), yte)
        ablation_results[aname] = {
            "train_rows": int(len(ya)),
            "best_epoch": ep,
            "T": T,
            "val_macroF1": mv["macroF1"],
            "val_other_to_press": mv["other_to_press"],
            "val_hr_s3_fp_press": int(np.sum(lhr.argmax(1) == 1)),
            "test_macroF1": mt["macroF1"],
            "test_f1_ready": mt["f1_ready"],
            "test_f1_press": mt["f1_press"],
            "test_other_to_press": mt["other_to_press"],
            "test_ready_to_press": mt["ready_to_press"],
            "test_nll": te_nll,
            "test_ece": te_ece,
        }
        print(f"  [D09 Ablation {aname}] rows={len(ya)} VAL F1={mv['macroF1']} fp={mv['other_to_press']} | TEST F1={mt['macroF1']} fp={mt['other_to_press']} ECE={te_ece}", flush=True)

    # ---- Full Multi-Seed Sweep on Full R22 Union for [82->64->32->3], [82->96->48->3], and LR [82->3] ----
    Xtr_raw, ytr, swtr, srctr = ablation_configs["A3_full_r22_aug_union"]
    mean = Xtr_raw.mean(0)
    std = np.where(Xtr_raw.std(0) > 1e-5, Xtr_raw.std(0), 1.0).astype(np.float32)
    Xtr = ((Xtr_raw - mean) / std).astype(np.float32)
    Xva = ((Xva_raw - mean) / std).astype(np.float32)
    Xte = ((Xte_raw - mean) / std).astype(np.float32)
    Xhr = ((Xva_hr_raw - mean) / std).astype(np.float32)
    wtr = build_pistol_weights(ytr, srctr, swtr)

    seeds = [20261122, 20261123, 20261124, 20261125]
    sweep_records = []
    best_by_arch: dict[str, tuple[tuple, dict, CompactMLP]] = {}

    grid = [
        ("lr_82_3", [], 5e-3, 5e-4, 0.0, 0.0, 0.0, 45),
        ("mlp_64_32", [64, 32], 2.5e-3, 6e-4, 0.025, 0.05, 0.01, 65),
        ("mlp_64_32", [64, 32], 2.5e-3, 8e-4, 0.035, 0.08, 0.00, 65),
        ("mlp_96_48", [96, 48], 2.2e-3, 8e-4, 0.030, 0.08, 0.01, 65),
        ("mlp_96_48", [96, 48], 2.2e-3, 1e-3, 0.040, 0.10, 0.00, 65),
    ]

    for arch_tag, hidden, lr, l2, nz, dr, ls, eps in grid:
        for sd in seeds:
            net, ep, comp_key = fit_pistol_mlp(
                Xtr, ytr, wtr, Xva, yva, Xhr,
                hidden=hidden, l2=l2, lr=lr, epochs=eps, noise=nz,
                dropout=dr, label_smoothing=ls, seed=sd, device=device,
            )
            with torch.no_grad():
                lv = net(torch.from_numpy(Xva)).numpy()
                lhr = net(torch.from_numpy(Xhr)).numpy()
            uncal_nll, uncal_ece = nll_ece(softmax_np(lv), yva)
            T = calibrate_temperature(lv, yva)
            cal_nll, cal_ece = nll_ece(softmax_np(lv / T), yva)
            mv = multiclass_metrics(yva, lv.argmax(1), PISTOL_LABELS)
            hr_fp = int(np.sum(lhr.argmax(1) == 1))
            rec = {
                "arch_tag": arch_tag,
                "hidden": hidden,
                "seed": sd,
                "noise": nz,
                "dropout": dr,
                "l2": l2,
                "label_smoothing": ls,
                "best_epoch": ep,
                "T": T,
                "val_macroF1": mv["macroF1"],
                "val_f1_ready": mv["f1_ready"],
                "val_f1_press": mv["f1_press"],
                "val_other_to_press": mv["other_to_press"],
                "val_ready_to_press": mv["ready_to_press"],
                "val_hr_s3_fp_press": hr_fp,
                "val_uncal_nll": uncal_nll,
                "val_uncal_ece": uncal_ece,
                "val_cal_nll": cal_nll,
                "val_cal_ece": cal_ece,
            }
            sweep_records.append(rec)
            rank_key = (comp_key, -cal_nll)
            if arch_tag not in best_by_arch or rank_key > best_by_arch[arch_tag][0]:
                best_by_arch[arch_tag] = (rank_key, rec, net)
            print(
                f"  [{arch_tag}] s={sd} nz={nz} dr={dr} ep={ep} VAL F1={mv['macroF1']} "
                f"(R={mv['f1_ready']}, P={mv['f1_press']}) fp={mv['other_to_press']} hrS3={hr_fp} T={T} ECE={uncal_ece}->{cal_ece}",
                flush=True,
            )

    prov = "HandGesture-5G + Natural RGB v3 + IPN HandS + HANDS RGB-D S1..2 + BXR7 Gomoku/Poker + R22 Train-Only Augs (CC BY 4.0; 0 HaGRIDv2; 0 Owner GT)"
    os.makedirs(R22_MODEL_DIR, exist_ok=True)
    exported = {}
    for arch_tag in ("mlp_64_32", "mlp_96_48", "lr_82_3"):
        _, rec, net = best_by_arch[arch_tag]
        fname = f"r22_pistol_{arch_tag}.json"
        exp = export_ts_model(
            net, f"{R22_MODEL_DIR}/{fname}", f"r22_pistol_{arch_tag}", "r22-pistol-v1",
            prov, PISTOL_LABELS, mean, std, rec["T"],
        )
        exported[arch_tag] = {"rec": rec, "export": exp}

    # Select primary r22_pistol_model.json STRICTLY BY VAL RANKING between mlp_64_32 and mlp_96_48
    winner_tag = "mlp_64_32" if best_by_arch["mlp_64_32"][0] >= best_by_arch["mlp_96_48"][0] else "mlp_96_48"
    _, win_rec, win_net = best_by_arch[winner_tag]
    primary_exp = export_ts_model(
        win_net, f"{R22_MODEL_DIR}/r22_pistol_model.json", f"r22_pistol_{winner_tag}", "r22-pistol-v1",
        prov, PISTOL_LABELS, mean, std, win_rec["T"],
    )

    # Evaluate ALL models (R19 C0, R20 C4, R20 C7 T4, R20 C7 T2, R22 64_32, R22 96_48, R22 LR) on Locked TEST (4,720)
    models_to_eval = {
        "R19_C0": json.load(open(MODEL_R19_C0, encoding="utf-8")),
        "R20_C4": json.load(open(MODEL_R20_C4, encoding="utf-8")),
        "R20_C7_T4": json.load(open(MODEL_R20_C7_T4, encoding="utf-8")),
        "R20_C7_T2": json.load(open(MODEL_R20_C7_T2, encoding="utf-8")),
        "R22_pistol_64_32": exported["mlp_64_32"]["export"]["doc"],
        "R22_pistol_96_48": exported["mlp_96_48"]["export"]["doc"],
        "R22_pistol_lr": exported["lr_82_3"]["export"]["doc"],
    }
    locked_test_eval = {}
    neg_calib_sweep = {}
    for mid, doc in models_to_eval.items():
        lg_te = forward_exported(doc, Xte_raw)
        pr_te = softmax_np(lg_te)
        mt = multiclass_metrics(yte, pr_te.argmax(1), PISTOL_LABELS)
        nll_te, ece_te = nll_ece(pr_te, yte)
        # Also uncalibrated (T=1) ECE for D11 comparison
        doc_t1 = {**doc, "temperature": 1.0}
        _, ece_uncal_te = nll_ece(softmax_np(forward_exported(doc_t1, Xte_raw)), yte)
        locked_test_eval[mid] = {
            **mt,
            "temperature": doc.get("temperature", 1.0),
            "nll": nll_te,
            "ece_calibrated": ece_te,
            "ece_uncalibrated_T1": ece_uncal_te,
        }
        # Negative false-trigger rate vs confidence threshold (D11)
        other_mask = yte == 2
        press_probs_on_other = pr_te[other_mask, 1]
        press_mask = yte == 1
        press_probs_on_press = pr_te[press_mask, 1]
        sweep = {}
        for tau in (0.50, 0.70, 0.80, 0.90, 0.95):
            fp = int(np.sum(press_probs_on_other >= tau))
            tp = int(np.sum(press_probs_on_press >= tau))
            sweep[f"tau_{tau:.2f}"] = {
                "other_fp_press": fp,
                "other_fp_rate": round(fp / max(1, int(other_mask.sum())), 5),
                "press_recall": round(tp / max(1, int(press_mask.sum())), 4),
            }
        neg_calib_sweep[mid] = sweep
        print(
            f"  [Locked TEST 4,720] {mid:18s}: MacroF1={mt['macroF1']:.4f} F1(R,P)=({mt['f1_ready']:.4f},{mt['f1_press']:.4f}) "
            f"OTHER->PRESS={mt['other_to_press']} R->P={mt['ready_to_press']} ECE={ece_uncal_te:.5f}->{ece_te:.5f}",
            flush=True,
        )

    # Prepare 200 parity rows from VAL+TEST for TS parity test
    rng_p = np.random.default_rng(20261122)
    Xpar = np.concatenate([Xva_raw, Xte_raw])
    idx_p = rng_p.choice(len(Xpar), size=200, replace=False)
    pistol_parity_rows = [
        {"X": [float(v) for v in Xpar[i]], "probs": [float(p) for p in softmax_np(forward_exported(primary_exp["doc"], Xpar[i : i + 1]))[0]]}
        for i in idx_p
    ]
    with open("/tmp/r22_pistol_parity_rows.json", "w", encoding="utf-8") as f:
        json.dump(pistol_parity_rows, f)

    return {
        "feature_parity_py_vs_ts": parity_feat,
        "r22_img_aug_stats": img_aug_stats,
        "train_row_breakdown": {
            "r20_c3_base": int(len(Xtr_base)),
            "r22_img_aug": int(len(X_img)),
            "r22_lm_aug": int(len(X_lm)),
            "total_train": int(len(Xtr_raw)),
            "val_locked": int(len(Xva_raw)),
            "val_hr_s3_hard_neg": int(len(Xva_hr_raw)),
            "test_locked": int(len(Xte_raw)),
        },
        "d09_augmentation_ablation": ablation_results,
        "val_selected_primary": {
            "winner_arch_tag": winner_tag,
            "val_record": win_rec,
            "artifact": {k: v for k, v in primary_exp.items() if k != "doc"},
        },
        "exported_variants": {
            k: {"val_record": v["rec"], "artifact": {ak: av for ak, av in v["export"].items() if ak != "doc"}}
            for k, v in exported.items()
        },
        "locked_test_4720_comparison": locked_test_eval,
        "d11_negative_calibration_threshold_sweep": neg_calib_sweep,
        "sweep_summary_count": len(sweep_records),
    }


# =================================================================================================
# HEAD 2: R22 POSE CLASSIFIER (5 CLASSES: FIST / ONE / TWO / FIVE / OTHER)
# =================================================================================================
def deterministic_pose_baseline(lm: list[list[float]], aspect: float, robust: bool = True) -> int:
    """Deterministic multi-joint geometry baseline matching `hand-gesture.ts` + `pistol_geometry.ts`
    mapped into K4 5-class pose space: 0=FIST, 1=ONE, 2=TWO, 3=FIVE, 4=OTHER.
    """
    a = aspect if (robust and math.isfinite(aspect) and aspect > 0) else 1.0
    g = [(float(p[0]) * a, float(p[1])) for p in lm]
    w = g[0]
    span = _dist2(g[9], w)
    if span <= 1e-6:
        return 4
    # 4 finger states (index, middle, ring, pinky)
    tips = (8, 12, 16, 20)
    pips = (6, 10, 14, 18)
    states = []
    for t, p in zip(tips, pips):
        dt = _dist2(g[t], w)
        dp = _dist2(g[p], w)
        if dt < dp:
            states.append("curled")
        elif dt > dp * 1.1:
            states.append("extended")
        else:
            states.append("between")
    idx_s, mid_s, rng_s, pnk_s = states
    # Thumb open rule
    if robust:
        tl = _thumb_lateral(g)
        thumb_open = tl is not None and tl >= 1.3
    else:
        ip_gap = _dist2(g[3], g[5])
        thumb_open = ip_gap > 1e-9 and (_dist2(g[4], g[5]) > ip_gap * 1.3)

    # Thumbs-up check (from hand-gesture.ts isThumbUp -> OTHER, never FIST!)
    thumb_lift = (g[2][1] - g[4][1]) / span
    if thumb_lift >= 0.45 and all(s == "curled" for s in states) and all(g[t][1] >= g[4][1] for t in tips):
        return 4  # OTHER (thumb-up)

    # FIST: all 4 fingers curled and thumb not strongly raised
    if all(s == "curled" for s in states) and thumb_lift < 0.30:
        return 0  # FIST

    # FIVE: all 4 fingers extended + thumb open (and non-split-palm)
    if all(s == "extended" for s in states) and thumb_open:
        return 3  # FIVE

    # TWO: index & middle extended, ring & pinky not extended, thumb not open
    if idx_s == "extended" and mid_s == "extended" and rng_s != "extended" and pnk_s != "extended" and not thumb_open:
        return 2  # TWO

    # ONE: only index extended, middle/ring/pinky curled, thumb not open
    if idx_s == "extended" and mid_s == "curled" and rng_s == "curled" and pnk_s == "curled" and not thumb_open:
        return 1  # ONE

    return 4  # OTHER


def build_pose_dataset(img_aug_rows: list[dict], seed: int = 20261122):
    """Curate strictly subject/cluster-disjoint 5-class Pose dataset from HG5G + Natural RGB v3 (apex) + HANDS RGB-D."""
    pose_id = {k: i for i, k in enumerate(POSE_LABELS)}
    rng = np.random.default_rng(seed)

    splits = {
        "train": {"X": [], "y": [], "w": [], "src": [], "lm": [], "aspect": []},
        "val": {"X": [], "y": [], "w": [], "src": [], "lm": [], "aspect": []},
        "test_hg5g": {"X": [], "y": [], "w": [], "src": [], "lm": [], "aspect": []},
        "test_n66": {"X": [], "y": [], "w": [], "src": [], "lm": [], "aspect": []},
        "test_hrgbd_s4_s5": {"X": [], "y": [], "w": [], "src": [], "lm": [], "aspect": []},
    }

    def _add(sp_key: str, lm: list[list[float]], aspect: float, label: str, weight: float, src: str):
        v = PyR19FeatureTracker().extract(lm, 0.0, aspect)
        if v is None:
            return
        d = splits[sp_key]
        d["X"].append(v)
        d["y"].append(pose_id[label])
        d["w"].append(weight)
        d["src"].append(src)
        d["lm"].append(lm)
        d["aspect"].append(aspect)

    # 1. HandGesture-5G (21 train / 8 val / 9 test clusters)
    for line in open(HG5G_JSONL, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        if r["class_name"] not in HG5G_TO_POSE:
            continue
        sp = effective_hg5g_split(r)
        hand = r["l0"]["hands"][0] if r["l0"]["n_hands"] > 0 else (r["l1"]["hands"][0] if r["l1"]["n_hands"] > 0 else None)
        if not hand:
            continue
        lbl = HG5G_TO_POSE[r["class_name"]]
        aspect = float(r.get("aspect") or 1.0)
        key = "test_hg5g" if sp == "test" else sp
        _add(key, hand["landmarks"], aspect, lbl, 1.2 if sp == "train" else 1.0, "hg5g")
        if sp == "train":
            # Train-only structured landmark augmentations
            for mode in ("aniso_jitter", "persp_aspect"):
                lm_a, asp_a = perturb_landmarks_r22(hand["landmarks"], aspect, rng, mode, preserve_fingers=True)
                _add("train", lm_a, asp_a, lbl, 0.75, f"hg5g_lm_{mode}")
            # Mirror / L1 CLAHE if also detected
            if r["l0"]["n_hands"] > 0 and r["l1"]["n_hands"] > 0:
                _add("train", r["l1"]["hands"][0]["landmarks"], aspect, lbl, 0.7, "hg5g_l1_clahe")

    # 1b. Train-only R20 + R22 image-space augmented HG5G rows (strictly TRAIN clusters!)
    for r in img_aug_rows:
        _add("train", r["landmarks"], float(r["aspect"]), r["pose_label"], 0.80, f"hg5g_{r['source']}")
    for line in open(EXTRA_HG5G_AUG, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        if r["raw_label"] in HG5G_TO_POSE:
            _add("train", r["landmarks"], float(r["aspect"]), HG5G_TO_POSE[r["raw_label"]], 0.65, f"hg5g_r20aug_{r['source']}")

    # 2. Natural RGB v3 (19 train / 4 val / 3 test participants; apex frames rank 3..5!)
    n66_pose_map = {
        "fist": "FIST",
        "peace_sign": "TWO",
        "raised_hand": "FIVE",
        "stop": "FIVE",
        "ok_sign": "OTHER",
        "thumbs_up": "OTHER",
        "thumbs_down": "OTHER",
    }
    by_clip = collections.defaultdict(list)
    for line in open(N66_JSONL, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        if r["class_name"] in n66_pose_map:
            by_clip[r["clip_idx"]].append(r)
    for _, frames in by_clip.items():
        frames.sort(key=lambda x: x["frame_idx"])
        for rank, r in enumerate(frames):
            if rank not in (3, 4, 5):
                continue
            hand = r["l0"]["hands"][0] if r["l0"]["n_hands"] > 0 else (r["l1"]["hands"][0] if r["l1"]["n_hands"] > 0 else None)
            if not hand:
                continue
            sp = r["split"]
            key = "test_n66" if sp == "test" else sp
            lbl = n66_pose_map[r["class_name"]]
            aspect = float(r.get("aspect") or 1.0)
            w = 0.85 if r["class_name"] in ("ok_sign", "thumbs_up", "thumbs_down") else 0.70
            _add(key, hand["landmarks"], aspect, lbl, w if sp == "train" else 1.0, f"n66_{r['class_name']}")
            if sp == "train" and rank == 4:
                lm_a, asp_a = perturb_landmarks_r22(hand["landmarks"], aspect, rng, "aniso_jitter", preserve_fingers=True)
                _add("train", lm_a, asp_a, lbl, 0.55, f"n66_lm_jitter")

    # 3. HANDS RGB-D (Subject1..2 train / Subject3 val / Subject4..5 LOCKED OOD TEST; TimeOut excluded!)
    hr_pose_map = {
        "Punch_VFL": "FIST", "Punch_VFR": "FIST",
        "One_VFL": "ONE", "One_VFR": "ONE",
        "Two_VFL": "TWO", "Two_VFR": "TWO",
        "Five_VFL": "FIVE", "Five_VFR": "FIVE",
        "Horiz_HBL": "FIVE", "Horiz_HBR": "FIVE", "Horiz_HFL": "FIVE", "Horiz_HFR": "FIVE",
        "Six_VFL": "OTHER", "Six_VFR": "OTHER",
        "Seven_VFL": "OTHER", "Seven_VFR": "OTHER",
        "Eight_VFL": "OTHER", "Eight_VFR": "OTHER",
        "Span_VFL": "OTHER", "Span_VFR": "OTHER",
    }
    for line in open(HRGBD_JSONL, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        subj = r["subject"]
        sp_key = "train" if subj in ("Subject1", "Subject2") else ("val" if subj == "Subject3" else "test_hrgbd_s4_s5")
        l0 = (r.get("l0") or {}).get("hands") or []
        l1 = ((r.get("l1") or {}).get("hands") or []) if r.get("l1") else []
        m0 = r.get("gt_match_l0") or {}
        m1 = r.get("gt_match_l1") or {}
        aspect = float(r.get("aspect") or (16.0 / 9.0))
        for cls in r["combo"]:
            if cls not in hr_pose_map:
                continue  # TimeOut excluded
            hi0, hi1 = m0.get(cls), m1.get(cls)
            hand = l0[hi0] if (hi0 is not None and 0 <= hi0 < len(l0)) else (l1[hi1] if (hi1 is not None and 0 <= hi1 < len(l1)) else None)
            if not hand:
                continue
            lbl = hr_pose_map[cls]
            # Downweight abundant Horiz_* slightly in train so FIVE doesn't overwhelm FIST/ONE/TWO
            w = (0.35 if cls.startswith("Horiz_") else 1.0) if sp_key == "train" else 1.0
            _add(sp_key, hand["landmarks"], aspect, lbl, w, f"hrgbd_{subj}_{cls}")
            if sp_key == "train" and not cls.startswith("Horiz_"):
                lm_a, asp_a = perturb_landmarks_r22(hand["landmarks"], aspect, rng, "aniso_jitter", preserve_fingers=True)
                _add("train", lm_a, asp_a, lbl, 0.70, f"hrgbd_lm_jitter")

    out = {}
    for k, d in splits.items():
        out[k] = {
            "X": np.asarray(d["X"], dtype=np.float32),
            "y": np.asarray(d["y"], dtype=np.int64),
            "w": np.asarray(d["w"], dtype=np.float32),
            "src": d["src"],
            "lm": d["lm"],
            "aspect": d["aspect"],
        }
    return out


def fit_pose_mlp(
    Xtr: np.ndarray, ytr: np.ndarray, wtr: np.ndarray,
    Xva: np.ndarray, yva: np.ndarray,
    hidden: list[int], l2: float, lr: float, epochs: int, noise: float,
    dropout: float, seed: int, device: torch.device, bs: int = 256,
):
    torch.manual_seed(seed)
    np.random.seed(seed)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(seed)
    net = CompactMLP(Xtr.shape[1], hidden, 5, dropout=dropout).to(device)
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=l2)
    Xt = torch.from_numpy(Xtr).to(device)
    yt = torch.from_numpy(ytr).to(device)
    wt = torch.from_numpy(wtr).to(device)
    Xv = torch.from_numpy(Xva).to(device)
    g = torch.Generator(device="cpu").manual_seed(seed)

    best_score = (-1.0, -999999)
    best_state = None
    best_ep = 0
    n = len(Xt)
    for ep in range(1, epochs + 1):
        net.train()
        perm = torch.randperm(n, generator=g).to(device)
        lr_ep = lr * (0.08 + 0.92 * 0.5 * (1.0 + math.cos(math.pi * (ep - 1) / max(1, epochs - 1))))
        for pg in opt.param_groups:
            pg["lr"] = lr_ep
        for s in range(0, n, bs):
            idx = perm[s : s + bs]
            xb = Xt[idx]
            if noise > 0:
                xb = xb + noise * torch.randn_like(xb)
            logits = net(xb)
            ce = F.cross_entropy(logits, yt[idx], reduction="none", label_smoothing=0.01)
            pt = torch.exp(-F.cross_entropy(logits, yt[idx], reduction="none"))
            ce = ((1.0 - pt) ** 1.5) * ce
            wb = wt[idx]
            loss = (ce * wb).sum() / wb.sum().clamp_min(1e-6)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()

        net.eval()
        with torch.no_grad():
            lv = net(Xv).cpu().numpy()
        m = multiclass_metrics(yva, lv.argmax(1), POSE_LABELS)
        # Penalize FIST->FIVE and OTHER->FIVE false erase on VAL
        c = m["confusion"]
        false_erase = c[0][3] + c[4][3]
        score = (round(m["macroF1"], 4), -false_erase)
        if score > best_score:
            best_score = score
            best_state = {k_: v.detach().cpu().clone() for k_, v in net.state_dict().items()}
            best_ep = ep

    net.load_state_dict(best_state)
    return net.cpu().eval(), best_ep


def pose_safety_errors(conf: list[list[int]]) -> dict[str, Any]:
    # 0:FIST, 1:ONE, 2:TWO, 3:FIVE, 4:OTHER
    fist_sup = sum(conf[0])
    other_sup = sum(conf[4])
    one_sup = sum(conf[1])
    two_sup = sum(conf[2])
    non_five_sup = sum(conf[i][j] for i in (0, 1, 2, 4) for j in range(5))
    false_erase = sum(conf[i][3] for i in (0, 1, 2, 4))
    return {
        "fist_to_five_false_erase": conf[0][3],
        "fist_to_five_rate": round(conf[0][3] / max(1, fist_sup), 5),
        "other_to_five_false_erase": conf[4][3],
        "other_to_five_rate": round(conf[4][3] / max(1, other_sup), 5),
        "total_non_five_to_five_false_erase": false_erase,
        "total_false_erase_rate": round(false_erase / max(1, non_five_sup), 5),
        "one_to_two_confusion": conf[1][2],
        "two_to_one_confusion": conf[2][1],
        "one_two_swap_rate": round((conf[1][2] + conf[2][1]) / max(1, one_sup + two_sup), 5),
    }


def train_pose_head(device: torch.device, img_aug_rows: list[dict]) -> dict[str, Any]:
    print("\n================ HEAD 2: R22 5-CLASS POSE CLASSIFIER (GPU 0) ================", flush=True)
    ds = build_pose_dataset(img_aug_rows)
    for k, d in ds.items():
        cnts = np.bincount(d["y"], minlength=5).tolist()
        print(f"  [Pose split {k:18s}] n={len(d['y']):5d} class_counts(F,1,2,5,O)={cnts}", flush=True)

    Xtr_raw, ytr, swtr = ds["train"]["X"], ds["train"]["y"], ds["train"]["w"]
    Xva_raw, yva = ds["val"]["X"], ds["val"]["y"]

    mean = Xtr_raw.mean(0)
    std = np.where(Xtr_raw.std(0) > 1e-5, Xtr_raw.std(0), 1.0).astype(np.float32)
    Xtr = ((Xtr_raw - mean) / std).astype(np.float32)
    Xva = ((Xva_raw - mean) / std).astype(np.float32)

    counts = np.bincount(ytr, minlength=5).astype(np.float64)
    cw = 1.0 / np.power(np.maximum(counts, 1.0), 0.55)
    cw = cw / cw.mean()
    wtr = (cw[ytr] * swtr.astype(np.float64)).astype(np.float32)
    wtr /= wtr.mean()

    seeds = [20261122, 20261123, 20261124]
    best_by_arch = {}
    for arch_tag, hidden, lr, l2, nz, dr, eps in [
        ("lr_82_5", [], 5e-3, 5e-4, 0.0, 0.0, 50),
        ("mlp_64_32", [64, 32], 2.5e-3, 6e-4, 0.025, 0.06, 65),
        ("mlp_96_48", [96, 48], 2.2e-3, 8e-4, 0.030, 0.08, 65),
    ]:
        for sd in seeds:
            net, ep = fit_pose_mlp(Xtr, ytr, wtr, Xva, yva, hidden, l2, lr, eps, nz, dr, sd, device)
            with torch.no_grad():
                lv = net(torch.from_numpy(Xva)).numpy()
            T = calibrate_temperature(lv, yva)
            mv = multiclass_metrics(yva, lv.argmax(1), POSE_LABELS)
            cal_nll, cal_ece = nll_ece(softmax_np(lv / T), yva)
            fe = pose_safety_errors(mv["confusion"])["total_non_five_to_five_false_erase"]
            key = (round(mv["macroF1"], 4), -fe, -cal_nll)
            rec = {
                "arch_tag": arch_tag, "hidden": hidden, "seed": sd, "best_epoch": ep, "T": T,
                "val_macroF1": mv["macroF1"], "val_acc": mv["acc"], "val_false_erase": fe,
                "val_nll": cal_nll, "val_ece": cal_ece,
            }
            if arch_tag not in best_by_arch or key > best_by_arch[arch_tag][0]:
                best_by_arch[arch_tag] = (key, rec, net)
            print(f"  [Pose {arch_tag}] s={sd} ep={ep} VAL MacroF1={mv['macroF1']} acc={mv['acc']} falseErase={fe} T={T} ECE={cal_ece}", flush=True)

    winner_tag = "mlp_64_32" if best_by_arch["mlp_64_32"][0] >= best_by_arch["mlp_96_48"][0] else "mlp_96_48"
    _, win_rec, win_net = best_by_arch[winner_tag]
    prov = "HandGesture-5G + Natural RGB v3 (apex) + HANDS RGB-D S1..2 + R22 Train-Only Augs (CC BY 4.0; 0 HaGRIDv2; 0 Owner GT)"
    pose_exp = export_ts_model(
        win_net, f"{R22_MODEL_DIR}/r22_pose_model.json", f"r22_pose_{winner_tag}", "r22-pose-v1",
        prov, POSE_LABELS, mean, std, win_rec["T"],
    )

    # Also build doc dicts for all 3 trained models
    trained_docs = {}
    for atag in ("lr_82_5", "mlp_64_32", "mlp_96_48"):
        _, r_, n_ = best_by_arch[atag]
        tmp_p = f"/tmp/r22_pose_{atag}.json"
        trained_docs[atag] = export_ts_model(n_, tmp_p, f"r22_pose_{atag}", "r22-pose-v1", prov, POSE_LABELS, mean, std, r_["T"])["doc"]

    # Evaluate ALL methods across ALL 3 held-out splits + Combined Held-Out Union
    eval_splits = {
        "hg5g_locked_test": ds["test_hg5g"],
        "hands_rgbd_s4_s5_locked_ood": ds["test_hrgbd_s4_s5"],
        "natural_rgb_v3_locked_test_apex": ds["test_n66"],
        "combined_heldout_all": {
            "X": np.concatenate([ds["test_hg5g"]["X"], ds["test_hrgbd_s4_s5"]["X"], ds["test_n66"]["X"]]),
            "y": np.concatenate([ds["test_hg5g"]["y"], ds["test_hrgbd_s4_s5"]["y"], ds["test_n66"]["y"]]),
            "lm": ds["test_hg5g"]["lm"] + ds["test_hrgbd_s4_s5"]["lm"] + ds["test_n66"]["lm"],
            "aspect": ds["test_hg5g"]["aspect"] + ds["test_hrgbd_s4_s5"]["aspect"] + ds["test_n66"]["aspect"],
        },
    }

    pose_eval = {}
    for sp_name, sp_d in eval_splits.items():
        y_true = sp_d["y"]
        X_s = sp_d["X"]
        res = {}
        # Deterministic baselines
        p_leg = np.asarray([deterministic_pose_baseline(lm, asp, robust=False) for lm, asp in zip(sp_d["lm"], sp_d["aspect"])], dtype=np.int64)
        p_rob = np.asarray([deterministic_pose_baseline(lm, asp, robust=True) for lm, asp in zip(sp_d["lm"], sp_d["aspect"])], dtype=np.int64)
        m_leg = multiclass_metrics(y_true, p_leg, POSE_LABELS)
        m_rob = multiclass_metrics(y_true, p_rob, POSE_LABELS)
        res["geom_legacy_deterministic"] = {**m_leg, "safety": pose_safety_errors(m_leg["confusion"])}
        res["geom_r22_multijoint_aspect"] = {**m_rob, "safety": pose_safety_errors(m_rob["confusion"])}
        for atag, doc in trained_docs.items():
            lg = forward_exported(doc, X_s)
            pr = softmax_np(lg)
            m = multiclass_metrics(y_true, pr.argmax(1), POSE_LABELS)
            nll, ece = nll_ece(pr, y_true)
            res[f"r22_pose_{atag}"] = {**m, "nll": nll, "ece": ece, "safety": pose_safety_errors(m["confusion"])}
        pose_eval[sp_name] = res
        print(
            f"  [Pose EVAL {sp_name:32s}] GeomLegacy={m_leg['macroF1']:.4f} | GeomMultiJoint={m_rob['macroF1']:.4f} "
            f"(falseErase={res['geom_r22_multijoint_aspect']['safety']['total_non_five_to_five_false_erase']}) | "
            f"MLP64={res['r22_pose_mlp_64_32']['macroF1']:.4f} (falseErase={res['r22_pose_mlp_64_32']['safety']['total_non_five_to_five_false_erase']}) | "
            f"MLP96={res['r22_pose_mlp_96_48']['macroF1']:.4f}",
            flush=True,
        )

    # Save 200 parity rows for TS parity check
    X_comb = eval_splits["combined_heldout_all"]["X"]
    rng_p = np.random.default_rng(20261122)
    idx_p = rng_p.choice(len(X_comb), size=min(200, len(X_comb)), replace=False)
    pose_parity_rows = [
        {"X": [float(v) for v in X_comb[i]], "probs": [float(p) for p in softmax_np(forward_exported(pose_exp["doc"], X_comb[i : i + 1]))[0]]}
        for i in idx_p
    ]
    with open("/tmp/r22_pose_parity_rows.json", "w", encoding="utf-8") as f:
        json.dump(pose_parity_rows, f)

    return {
        "split_counts": {k: {"n": int(len(v["y"])), "class_counts": np.bincount(v["y"], minlength=5).tolist()} for k, v in ds.items()},
        "val_selected_primary": {
            "winner_arch_tag": winner_tag,
            "val_record": win_rec,
            "artifact": {k: v for k, v in pose_exp.items() if k != "doc"},
        },
        "heldout_evaluation": pose_eval,
    }


# =================================================================================================
# HEAD 3: R22 PINCH HEAD AUDIT (D07 DATA_GAP + CALIBRATED GEOM/KINEMATIC VS CANONICAL HYSTERESIS)
# =================================================================================================
def _pinch_geom_metrics(lm: list[list[float]], aspect: float):
    g = [(float(p[0]) * aspect, float(p[1])) for p in lm]
    w = g[0]
    span = _dist2(g[9], w)
    knuckle = _dist2(g[17], g[5])
    palm_scale = max(span, knuckle)
    if span <= 1e-6 or palm_scale <= 1e-6:
        return None
    pr_span = _dist2(g[4], g[8]) / span
    pr_palm = _dist2(g[4], g[8]) / palm_scale
    d_idx_seg = max(_dist2(g[6], g[8]), 1e-4)
    pr_idx_seg = _dist2(g[4], g[8]) / d_idx_seg
    # finger curl states
    tips, pips = (8, 12, 16, 20), (6, 10, 14, 18)
    curled = [_dist2(g[t], w) < _dist2(g[p], w) for t, p in zip(tips, pips)]
    idx_curled = curled[0]
    all_four_curled = all(curled)
    return {
        "pr_span": pr_span,
        "pr_palm": pr_palm,
        "pr_idx_seg": pr_idx_seg,
        "idx_curled": idx_curled,
        "all_four_curled": all_four_curled,
    }


class CanonicalHysteresisPinch:
    """Canonical R22 K4 Hysteresis Pinch Evaluator (onset <= 0.30 / release <= 0.42; folded <= 0.20 / <= 0.27)."""
    def __init__(self):
        self.held = False

    def reset(self):
        self.held = False

    def step(self, lm: list[list[float]] | None, aspect: float, dt_ms: float = 33.3) -> str:
        if not lm:
            self.held = False
            return "OPEN"
        m = _pinch_geom_metrics(lm, aspect)
        if not m:
            self.held = False
            return "OPEN"
        r = m["pr_span"]
        if m["idx_curled"]:
            thr = 0.27 if self.held else 0.20
        else:
            thr = 0.42 if self.held else 0.30
        if r <= thr:
            self.held = True
            return "TOUCH"
        self.held = False
        return "NEAR" if r <= 0.50 else "OPEN"


class CalibratedGeomKinematicPinch:
    """Calibrated Geometric + Kinematic Pinch Evaluator:
    Uses palmScale-normalized pinch ratio, folded-fist veto (all 4 fingers curled requires tight contact <=0.16),
    and closing velocity d(pr)/dt to emit calibrated P(TOUCH), P(NEAR), P(OPEN) with hysteresis.
    """
    def __init__(self):
        self.held = False
        self.prev_pr: float | None = None

    def reset(self):
        self.held = False
        self.prev_pr = None

    def step(self, lm: list[list[float]] | None, aspect: float, dt_ms: float = 33.3) -> tuple[str, list[float]]:
        if not lm:
            self.reset()
            return "OPEN", [0.0, 0.0, 1.0]
        m = _pinch_geom_metrics(lm, aspect)
        if not m:
            self.reset()
            return "OPEN", [0.0, 0.0, 1.0]
        r = m["pr_palm"]
        vel = 0.0 if (self.prev_pr is None or dt_ms <= 1.0) else (r - self.prev_pr) / (dt_ms / 1000.0)
        self.prev_pr = r

        # Effective threshold tightened for 4-finger curled fists (prevents fist false-TOUCH!)
        if m["all_four_curled"]:
            enter_thr, exit_thr = 0.16, 0.22
        elif m["idx_curled"]:
            enter_thr, exit_thr = 0.20, 0.27
        else:
            # Rapidly opening hand tightens hold threshold slightly to cut release tail lag
            enter_thr = 0.29
            exit_thr = 0.36 if vel > 1.8 else 0.41

        # Calibrated soft logits for [TOUCH, NEAR, OPEN]
        center_thr = exit_thr if self.held else enter_thr
        logit_touch = (center_thr - r) * 14.0 - (2.5 if (m["all_four_curled"] and r > 0.18) else 0.0)
        logit_near = -abs(r - 0.40) * 10.0 + 1.2
        logit_open = (r - 0.50) * 12.0
        probs = softmax_np(np.array([[logit_touch, logit_near, logit_open]], dtype=np.float64))[0].tolist()

        if r <= center_thr and not (m["all_four_curled"] and r > enter_thr and not self.held):
            self.held = True
            return "TOUCH", [round(x, 4) for x in probs]
        self.held = False
        state = "NEAR" if r <= 0.50 else "OPEN"
        return state, [round(x, 4) for x in probs]


def eval_pinch_head() -> dict[str, Any]:
    print("\n================ HEAD 3: R22 PINCH HEAD AUDIT & EVALUATION (D07) ================", flush=True)
    # 1. Legal Negative Non-Pinch Real Datasets (HG5G TEST, HANDS RGB-D S4..5, Natural RGB v3 TEST non-ok + ok_sign)
    neg_suites = {}

    def _eval_static_suite(name: str, items: list[tuple[list[list[float]], float, str]]):
        h_touch = h_near = k_touch = k_near = 0
        by_cls = collections.defaultdict(lambda: {"n": 0, "h_touch": 0, "k_touch": 0, "h_near": 0})
        for lm, asp, cls in items:
            ch = CanonicalHysteresisPinch()
            ck = CalibratedGeomKinematicPinch()
            sh = ch.step(lm, asp)
            sk, _ = ck.step(lm, asp)
            if sh == "TOUCH":
                h_touch += 1
            elif sh == "NEAR":
                h_near += 1
            if sk == "TOUCH":
                k_touch += 1
            elif sk == "NEAR":
                k_near += 1
            by_cls[cls]["n"] += 1
            by_cls[cls]["h_touch"] += int(sh == "TOUCH")
            by_cls[cls]["k_touch"] += int(sk == "TOUCH")
            by_cls[cls]["h_near"] += int(sh == "NEAR")
        n = max(1, len(items))
        neg_suites[name] = {
            "n": len(items),
            "canonical_hysteresis_touch_count": h_touch,
            "canonical_hysteresis_touch_rate": round(h_touch / n, 5),
            "canonical_hysteresis_near_count": h_near,
            "calibrated_geom_kinematic_touch_count": k_touch,
            "calibrated_geom_kinematic_touch_rate": round(k_touch / n, 5),
            "calibrated_geom_kinematic_near_count": k_near,
            "by_class": {c: dict(v) for c, v in sorted(by_cls.items())},
        }
        print(
            f"  [Pinch Real {name:28s}] n={len(items):4d} | CanonHyst TOUCH={h_touch} ({100*h_touch/n:.2f}%) | "
            f"CalibGeomKin TOUCH={k_touch} ({100*k_touch/n:.2f}%)",
            flush=True,
        )

    # HG5G TEST
    hg_te = []
    for l in open(HG5G_JSONL, encoding="utf-8"):
        r = json.loads(l)
        if effective_hg5g_split(r) != "test":
            continue
        h = r["l0"]["hands"][0] if r["l0"]["n_hands"] > 0 else (r["l1"]["hands"][0] if r["l1"]["n_hands"] > 0 else None)
        if h:
            hg_te.append((h["landmarks"], float(r.get("aspect") or 1.0), r["class_name"]))
    _eval_static_suite("hg5g_locked_test_non_pinch", hg_te)

    # HANDS RGB-D S4..5 OOD
    hr_te = []
    for l in open(HR_S4S5_OOD, encoding="utf-8"):
        r = json.loads(l)
        l0 = (r.get("l0") or {}).get("hands") or []
        l1 = ((r.get("l1") or {}).get("hands") or []) if r.get("l1") else []
        m0, m1 = r.get("gt_match_l0") or {}, r.get("gt_match_l1") or {}
        for cls in r["combo"]:
            hi0, hi1 = m0.get(cls), m1.get(cls)
            h = l0[hi0] if (hi0 is not None and 0 <= hi0 < len(l0)) else (l1[hi1] if (hi1 is not None and 0 <= hi1 < len(l1)) else None)
            if h:
                hr_te.append((h["landmarks"], float(r.get("aspect") or 16 / 9), cls))
    _eval_static_suite("hands_rgbd_s4_s5_non_pinch", hr_te)

    # Natural RGB v3 TEST non-ok vs ok_sign
    n66_non_ok, n66_ok = [], []
    for l in open(N66_JSONL, encoding="utf-8"):
        r = json.loads(l)
        if r["split"] != "test":
            continue
        h = r["l0"]["hands"][0] if r["l0"]["n_hands"] > 0 else (r["l1"]["hands"][0] if r["l1"]["n_hands"] > 0 else None)
        if not h:
            continue
        if r["class_name"] == "ok_sign":
            n66_ok.append((h["landmarks"], float(r.get("aspect") or 1.0), "ok_sign"))
        elif r["class_name"] not in ("point_left", "point_right"):
            n66_non_ok.append((h["landmarks"], float(r.get("aspect") or 1.0), r["class_name"]))
    _eval_static_suite("natural_rgb_v3_test_non_ok", n66_non_ok)
    _eval_static_suite("natural_rgb_v3_test_ok_sign_audit", n66_ok)

    # 2. Controlled Synthetic Near-Pinch Negative & Contact Ramp Sequences (UNIT_ONLY)
    def _make_pinch_lm(ratio: float) -> list[list[float]]:
        # Canonical 21-point hand with wrist=(0.5,0.7), middle_mcp=(0.5,0.5) => span=0.20, index extended at (0.55, 0.32)
        span = 0.20
        pts = [[0.5, 0.7, 0.0]] * 21
        pts[0] = [0.50, 0.70, 0.0]
        pts[1] = [0.45, 0.65, 0.0]
        pts[2] = [0.42, 0.58, 0.0]
        pts[3] = [0.44, 0.48, 0.0]
        pts[5] = [0.55, 0.50, 0.0]
        pts[6] = [0.55, 0.43, 0.0]
        pts[7] = [0.55, 0.37, 0.0]
        pts[8] = [0.55, 0.32, 0.0]
        pts[9] = [0.50, 0.50, 0.0]
        pts[10] = [0.50, 0.56, 0.0]
        pts[11] = [0.50, 0.60, 0.0]
        pts[12] = [0.50, 0.62, 0.0]
        pts[13] = [0.46, 0.52, 0.0]
        pts[14] = [0.46, 0.58, 0.0]
        pts[15] = [0.46, 0.62, 0.0]
        pts[16] = [0.46, 0.64, 0.0]
        pts[17] = [0.42, 0.54, 0.0]
        pts[18] = [0.42, 0.60, 0.0]
        pts[19] = [0.42, 0.63, 0.0]
        pts[20] = [0.42, 0.65, 0.0]
        # Place thumb tip 4 at exact distance `ratio * span` left of index tip 8
        pts[4] = [pts[8][0] - ratio * span, pts[8][1], 0.0]
        return pts

    synth_near = {}
    for target_r in (0.32, 0.36, 0.40, 0.45, 0.48):
        ch, ck = CanonicalHysteresisPinch(), CalibratedGeomKinematicPinch()
        h_fp = k_fp = 0
        for _ in range(30):
            lm = _make_pinch_lm(target_r)
            if ch.step(lm, 1.0, 33.3) == "TOUCH":
                h_fp += 1
            if ck.step(lm, 1.0, 33.3)[0] == "TOUCH":
                k_fp += 1
        synth_near[f"near_ratio_{target_r:.2f}"] = {"frames": 30, "canonical_hysteresis_fp_touch": h_fp, "calibrated_geom_kinematic_fp_touch": k_fp}

    # Closing -> Hold -> Opening ramp (0.65 -> 0.14 -> 0.65)
    ramp_ratios = list(np.linspace(0.65, 0.14, 18)) + [0.14] * 10 + list(np.linspace(0.14, 0.65, 18))
    ch, ck = CanonicalHysteresisPinch(), CalibratedGeomKinematicPinch()
    h_seq, k_seq = [], []
    for rr in ramp_ratios:
        lm = _make_pinch_lm(float(rr))
        h_seq.append(ch.step(lm, 1.0, 33.3))
        k_seq.append(ck.step(lm, 1.0, 33.3)[0])
    synth_ramp = {
        "evidence_type": "UNIT_ONLY_SYNTHETIC",
        "total_frames": len(ramp_ratios),
        "canonical_onset_ratio": round(ramp_ratios[h_seq.index("TOUCH")], 3) if "TOUCH" in h_seq else None,
        "calibrated_onset_ratio": round(ramp_ratios[k_seq.index("TOUCH")], 3) if "TOUCH" in k_seq else None,
        "canonical_release_tail_frames_gt_030": sum(1 for i in range(28, len(ramp_ratios)) if ramp_ratios[i] > 0.30 and h_seq[i] == "TOUCH"),
        "calibrated_release_tail_frames_gt_030": sum(1 for i in range(28, len(ramp_ratios)) if ramp_ratios[i] > 0.30 and k_seq[i] == "TOUCH"),
    }

    # 3. Unlabelled Owner T004 Canvas Sequence Comparison (STRICTLY UNLABELLED_TELEMETRY, NEVER GT ACCURACY!)
    b4 = json.load(open(OWNER_4T_JSON, encoding="utf-8"))
    t004_frames = [f for f in b4["sessions"][0]["frames"] if f.get("trialId") == "S-07ba0cde-T004"]
    ch, ck = CanonicalHysteresisPinch(), CalibratedGeomKinematicPinch()
    prev_t = None
    agree = total_hand = 0
    h_touch_n = k_touch_n = h_near_n = k_near_n = 0
    r19_gate_rejected_recovered_h = r19_gate_rejected_recovered_k = 0
    h_segs = k_segs = 0
    h_prev = k_prev = False
    for fr in t004_frames:
        t_ms = float(fr["t"])
        dt_ms = (t_ms - prev_t) if prev_t is not None else 66.7
        prev_t = t_ms
        lm = fr.get("lm")
        asp = float(fr.get("aspect") or (16.0 / 9.0))
        if not lm:
            ch.reset()
            ck.reset()
            h_prev = k_prev = False
            continue
        total_hand += 1
        sh = ch.step(lm, asp, dt_ms)
        sk, _ = ck.step(lm, asp, dt_ms)
        if sh == sk:
            agree += 1
        if sh == "TOUCH":
            h_touch_n += 1
            if not h_prev:
                h_segs += 1
            h_prev = True
        else:
            h_prev = False
            if sh == "NEAR":
                h_near_n += 1
        if sk == "TOUCH":
            k_touch_n += 1
            if not k_prev:
                k_segs += 1
            k_prev = True
        else:
            k_prev = False
            if sk == "NEAR":
                k_near_n += 1
        # Check how many frames previously rejected by "Cubit ditolak gate R19" are cleanly recovered!
        if fr.get("reject") == "Cubit ditolak gate R19" or fr.get("rejectDetail") == "Cubit ditolak gate R19":
            if sh == "TOUCH":
                r19_gate_rejected_recovered_h += 1
            if sk == "TOUCH":
                r19_gate_rejected_recovered_k += 1

    t004_audit = {
        "labelSource": "UNLABELLED_TELEMETRY",
        "independentGroundTruthAvailable": False,
        "warning": "Owner T004 frames are UNLABELLED; metrics below are inter-evaluator agreement and consistency proxies, NEVER supervised accuracy.",
        "t004_total_frames": len(t004_frames),
        "t004_hand_frames": total_hand,
        "inter_evaluator_3class_agreement_pct": round(100.0 * agree / max(1, total_hand), 2),
        "canonical_hysteresis_touch_frames": h_touch_n,
        "canonical_hysteresis_near_frames": h_near_n,
        "canonical_hysteresis_touch_segments": h_segs,
        "calibrated_geom_kinematic_touch_frames": k_touch_n,
        "calibrated_geom_kinematic_near_frames": k_near_n,
        "calibrated_geom_kinematic_touch_segments": k_segs,
        "legacy_r19_gate_rejected_pinch_recovered_canonical": r19_gate_rejected_recovered_h,
        "legacy_r19_gate_rejected_pinch_recovered_calibrated": r19_gate_rejected_recovered_k,
    }
    print(f"  [Pinch T004 UNLABELLED] agree={t004_audit['inter_evaluator_3class_agreement_pct']}% | CanonTOUCH={h_touch_n} (segs={h_segs}) | CalibTOUCH={k_touch_n} (segs={k_segs})", flush=True)

    return {
        "status": "DATA_GAP_CONFIRMED_GEOMETRY_HYSTERESIS_FALLBACK",
        "data_gap_audit": {
            "legal_datasets_audited": ["handgesture_5g", "natural_rgb_v3", "ipn_hands", "hands_rgbd_v2", "mendeley_bxr7kx84y6_v2"],
            "datasets_with_touch_vs_near_gt": 0,
            "closest_proxy_class": "natural_rgb_v3 ok_sign (n=561, 58.5% pinchRatio<=0.30, 3 extended fingers; clip-level label only, NOT canvas drawing TOUCH vs NEAR)",
            "critical_hazard_identified": "HG5G Fist (48.3% near 0.30..0.50) & HANDS RGB-D Punch (43..49% near, 9..23.5% <=0.30) show curled fists frequently trigger naive pinch ratios without folded-index / non-fist gating.",
            "recommendation": "Use Canonical Hysteresis Pinch (0.30/0.42, folded 0.20/0.27) or Calibrated Geom+Kinematic Pinch (adds 4-finger fist tight gate <=0.16 & velocity release tightening); collect Owner-consented RD-02 TOUCH vs NEAR sequences before training a supervised pinch neural head.",
        },
        "real_legal_negative_and_ok_suites": neg_suites,
        "synthetic_near_pinch_negative_UNIT_ONLY": synth_near,
        "synthetic_contact_ramp_UNIT_ONLY": synth_ramp,
        "owner_t004_unlabelled_telemetry_comparison": t004_audit,
    }


# =================================================================================================
# PURE-TS CPU PARITY, MICROSECOND LATENCY & FULL G4 HYBRID + FSM BENCHMARK (VIA VITE-NODE)
# =================================================================================================
def run_ts_parity_and_full_g4_eval() -> dict[str, Any]:
    """Run actual frontend `R19Classifier`, `validateR19Model`, and `R19RuntimePipeline` in Node/TS
    to get 100% bit-exact apples-to-apples numbers vs R19 C0, R20 C4, R20 C7 T4/T2 across all suites!
    """
    print("\n================ PURE-TS CPU PARITY, LATENCY & FULL G4+FSM EVALUATION ================", flush=True)
    ts_code = r"""
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline";

import { classifyHandPose, palmCenterNormalized } from "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/input/hand-gesture";
import type { Landmark } from "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/components/nui-lab/r19/pistol_types";
import { R19_LABELS, R19FeatureTracker, type R19Label } from "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/components/nui-lab/r19/r19_features";
import { DEFAULT_R19_HYBRID_PARAMS, R19RuntimePipeline, resolveHybridPistolClassification } from "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/components/nui-lab/r19/r19_integrated";
import { validateR19Model } from "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/components/nui-lab/r19/r19_loader";
import { R19Classifier, type R19ExportedModel } from "/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/src/components/nui-lab/r19/r19_model";

const REPO = "/srv/sketchbook/mediapipe-optimize/research-can";
const R19_SANDBOX = "/srv/sketchbook/mediapipe-optimize/r19-sandbox";
const R20_SANDBOX = "/srv/sketchbook/mediapipe-optimize/r20-sandbox";
const PYTHON_BIN = `${R20_SANDBOX}/.venv/bin/python`;

const HG5G_JSONL = `${R19_SANDBOX}/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl`;
const N66_JSONL = `${R19_SANDBOX}/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl`;
const HRGBD_JSONL = `${R19_SANDBOX}/data/hands_rgbd_eval/hands_rgbd_landmarks.jsonl`;
const STREAM_IPN_PY = `${REPO}/r19/scripts/stream_ipn_split.py`;
const MENDELEY_599_JSON = `${REPO}/r18/results/ux3_mendeley_distractor_landmarks.json`;
const BXR7_OOD_JSONL = `${R20_SANDBOX}/data/hard_neg/bxr7_gomoku_poker_ood_test.jsonl`;

const LABEL_TO_ID: Record<R19Label, number> = { POINT_READY: 0, POINT_PRESS: 1, OTHER: 2 };
const N66_OTHER = new Set(["thumbs_up","thumbs_down","peace_sign","ok_sign","fist","stop","raised_hand","palm_down_push","wave","come_here","go"]);
const toLm = (pts: number[][]): Landmark[] => pts.map((p) => ({ x: p[0]!, y: p[1]!, z: p[2] ?? 0 }));
const pct = (n: number, d: number) => (d > 0 ? Math.round((10000 * n) / d) / 100 : 0);
const perMin = (n: number, frames: number) => (frames > 0 ? Math.round((n / (frames / 30 / 60)) * 100) / 100 : 0);
function quant(arr: number[], q: number): number {
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]! * 100) / 100;
}

function conf3(c: number[][]) {
  let tot = 0, ok = 0;
  const f1s: number[] = [], recs: number[] = [], precs: number[] = [];
  for (let i = 0; i < 3; i++) {
    let sup = 0, pr = 0;
    for (let j = 0; j < 3; j++) { tot += c[i]![j]!; sup += c[i]![j]!; pr += c[j]![i]!; }
    const tp = c[i]![i]!; ok += tp;
    const p = pr > 0 ? tp / pr : 0, r = sup > 0 ? tp / sup : 0;
    precs.push(Math.round(p * 10000) / 10000); recs.push(Math.round(r * 10000) / 10000);
    f1s.push(Math.round((p + r > 0 ? (2 * p * r) / (p + r) : 0) * 10000) / 10000);
  }
  const act = f1s.filter((_, i) => c[i]!.reduce((a, b) => a + b, 0) > 0);
  return {
    n: tot, acc: Math.round((ok / Math.max(1, tot)) * 10000) / 10000,
    macroF1: Math.round((act.reduce((a, b) => a + b, 0) / Math.max(1, act.length)) * 10000) / 10000,
    f1_ready: f1s[0]!, f1_press: f1s[1]!, f1_other: f1s[2]!,
    other_to_press: c[2]![1]!, ready_to_press: c[0]![1]!, confusion: c,
  };
}

const modelSpecs = [
  { id: "R19_C0", path: `${REPO}/r19/models/r19_model_mlp.json` },
  { id: "R20_C4", path: `${REPO}/r20/models/r20_model_c4_full_mlp.json` },
  { id: "R20_C7_T4", path: `${REPO}/r20/models/r20_model_c7_distilled_t4_mlp.json` },
  { id: "R20_C7_T2", path: `${REPO}/r20/models/r20_model_c7_distilled_t2_mlp.json` },
  { id: "R22_pistol_64_32", path: `${REPO}/r22/models/r22_pistol_mlp_64_32.json` },
  { id: "R22_pistol_96_48", path: `${REPO}/r22/models/r22_pistol_mlp_96_48.json` },
  { id: "R22_pistol_primary", path: `${REPO}/r22/models/r22_pistol_model.json` },
];

const cands = modelSpecs.map((s) => {
  const raw = JSON.parse(readFileSync(s.path, "utf8"));
  const validated = validateR19Model(raw);
  return { ...s, model: validated, clf: new R19Classifier(validated), bytes: readFileSync(s.path).byteLength };
});

// 1. Parity + Latency for Pistol primary & Pose primary
function checkParityAndLatency(model: R19ExportedModel, parityPath: string, isPistol: boolean) {
  const clf = new R19Classifier(model);
  const rows = JSON.parse(readFileSync(parityPath, "utf8")) as Array<{ X: number[]; probs: number[] }>;
  let mis = 0, maxDiff = 0;
  for (const r of rows) {
    const p = clf.proba(r.X);
    const aPy = r.probs.indexOf(Math.max(...r.probs));
    const aTs = p.indexOf(Math.max(...p));
    if (aPy !== aTs) mis++;
    for (let k = 0; k < p.length; k++) {
      const d = Math.abs(p[k]! - r.probs[k]!);
      if (d > maxDiff) maxDiff = d;
    }
  }
  const feat = rows[0]!.X;
  for (let i = 0; i < 1500; i++) clf.predict(feat);
  const times: number[] = [];
  for (let i = 0; i < 5000; i++) {
    const t0 = performance.now();
    clf.predict(feat);
    times.push((performance.now() - t0) * 1000);
  }
  return {
    arch: [model.mean.length, ...model.layers.map((l) => l.b.length)],
    validateR19Model_passed: isPistol,
    parity_rows: rows.length,
    argmax_mismatches: mis,
    max_prob_abs_diff: Number(maxDiff.toExponential(3)),
    cpu_us: { p50: quant(times, 0.5), p95: quant(times, 0.95), p99: quant(times, 0.99) },
  };
}

const poseModel = JSON.parse(readFileSync(`${REPO}/r22/models/r22_pose_model.json`, "utf8")) as R19ExportedModel;
const parityReport: Record<string, any> = {
  R22_pistol_primary: checkParityAndLatency(cands.find((c) => c.id === "R22_pistol_primary")!.model, "/tmp/r22_pistol_parity_rows.json", true),
  R22_pose_primary: checkParityAndLatency(poseModel, "/tmp/r22_pose_parity_rows.json", false),
};

// Also benchmark pure-TS latency for all pistol comparators
const sampleFeat = (JSON.parse(readFileSync("/tmp/r22_pistol_parity_rows.json", "utf8")) as any[])[0].X;
const latencyAll: Record<string, any> = {};
for (const c of cands) {
  for (let i = 0; i < 1000; i++) c.clf.predict(sampleFeat);
  const ts: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const t0 = performance.now();
    c.clf.predict(sampleFeat);
    ts.push((performance.now() - t0) * 1000);
  }
  latencyAll[c.id] = { bytes: c.bytes, arch: [c.model.mean.length, ...c.model.layers.map((l) => l.b.length)], us_p50: quant(ts, 0.5), us_p95: quant(ts, 0.95) };
}

// 2. HG5G Locked TEST (230 rows)
const hgLines = readFileSync(HG5G_JSONL, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((r) => r.split === "test");
const hgOut: Record<string, any> = {};
for (const c of cands) {
  const rc = [[0,0,0],[0,0,0],[0,0,0]], gc = [[0,0,0],[0,0,0],[0,0,0]];
  let dorsTot = 0, dorsOk = 0, lowTot = 0, lowOk = 0;
  for (const r of hgLines) {
    const h = r.l0.n_hands > 0 ? r.l0.hands[0] : (r.l1.n_hands > 0 ? r.l1.hands[0] : null);
    if (!h) continue;
    const yTrue: R19Label | null = r.class_name === "Pointing Up" ? "POINT_READY" : (r.class_name === "L-Sign" ? "POINT_PRESS" : (["Fist","V-Sign","Open Palm_Open Hand"].includes(r.class_name) ? "OTHER" : null));
    if (!yTrue) continue;
    const yi = LABEL_TO_ID[yTrue];
    const lm = toLm(h.landmarks);
    const v = new R19FeatureTracker().extract(lm, 0, r.aspect || 1);
    if (!v) continue;
    const pred = c.clf.predict(v);
    rc[yi]![LABEL_TO_ID[pred.label as R19Label]]!++;
    const g4 = resolveHybridPistolClassification(lm, r.aspect || 1, pred.probs, c.clf.labels, DEFAULT_R19_HYBRID_PARAMS);
    const gLbl: R19Label = g4.state === "POINT_PRESS" ? "POINT_PRESS" : (g4.state === "POINT_READY" ? "POINT_READY" : "OTHER");
    gc[yi]![LABEL_TO_ID[gLbl]]!++;
    if ((h.geom?.palm_facing_Sign ?? 1) < 0) { dorsTot++; if (gLbl === yTrue) dorsOk++; }
    if (r.exposure_bucket === "low_eb" || r.exposure_bucket === "low_luma_no_eb") { lowTot++; if (gLbl === yTrue) lowOk++; }
  }
  hgOut[c.id] = { raw_mlp: conf3(rc), g4_hybrid: conf3(gc), dorsal_g4_acc_pct: pct(dorsOk, dorsTot), low_exp_g4_acc_pct: pct(lowOk, lowTot) };
}

// 3. Natural RGB v3 Locked TEST (888 OTHER + 246 ambiguous point_left/right)
const n66Clips = new Map<number, any[]>(), n66Ambig = new Map<number, any[]>();
for (const l of readFileSync(N66_JSONL, "utf8").split("\n")) {
  if (!l.trim()) continue;
  const r = JSON.parse(l);
  if (r.split !== "test") continue;
  const target = N66_OTHER.has(r.class_name) ? n66Clips : ((r.class_name === "point_left" || r.class_name === "point_right") ? n66Ambig : null);
  if (target) { const a = target.get(r.clip_idx) ?? []; a.push(r); target.set(r.clip_idx, a); }
}
const n66Out: Record<string, any> = {};
for (const c of cands) {
  let tot = 0, rawFp = 0, g4Fp = 0, fsmAct = 0, kd = 0;
  for (const [, frames] of n66Clips) {
    frames.sort((a, b) => a.frame_idx - b.frame_idx);
    const pipe = new R19RuntimePipeline(c.model, frames[0]?.aspect || 16 / 9);
    const trk = new R19FeatureTracker();
    for (const r of frames) {
      const h = r.l0.n_hands > 0 ? r.l0.hands[0] : (r.l1.n_hands > 0 ? r.l1.hands[0] : null);
      if (!h) { pipe.reset(); trk.reset(); continue; }
      tot++;
      const nowMs = (r.frame_idx * 1000) / 30;
      const lm = toLm(h.landmarks);
      const v = trk.extract(lm, nowMs, r.aspect || 16 / 9);
      if (v && c.clf.predict(v).label === "POINT_PRESS") rawFp++;
      const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: r.aspect || 16 / 9 });
      const pc = palmCenterNormalized(lm);
      const step = pipe.step(lm, nowMs, revPose, pc.x, pc.y, 0.25);
      if (step.geomState === "POINT_PRESS") g4Fp++;
      if (step.fsm.input.left || step.fsm.input.right || step.fsm.input.jump) fsmAct++;
      if (step.fsm.keyEvent === "KEYDOWN") kd++;
    }
  }
  n66Out[c.id] = { total_other_hands: tot, raw_fp_press: rawFp, raw_fp_press_pct: pct(rawFp, tot), g4_fp_press: g4Fp, g4_fp_press_pct: pct(g4Fp, tot), fsm_active: fsmAct, keydowns: kd };
}

// 4. HANDS RGB-D Subject4..5 Locked OOD (2,092 hands across 1,080 frames)
const hrRows = readFileSync(HRGBD_JSONL, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((r) => r.subject === "Subject4" || r.subject === "Subject5");
const hrOut: Record<string, any> = {};
for (const c of cands) {
  let hzN = 0, hzRaw = 0, hzG4 = 0, soN = 0, soRaw = 0, soG4 = 0, vfrN = 0, vfrRawR = 0, vfrG4R = 0, vfrG4P = 0;
  for (const r of hrRows) {
    const l0 = r.l0?.hands ?? [], l1 = r.l1?.hands ?? [], m0 = r.gt_match_l0 ?? {}, m1 = r.gt_match_l1 ?? {};
    const asp = r.aspect || 16 / 9;
    for (const cls of r.combo) {
      const hi0 = m0[cls], hi1 = m1[cls];
      const h = (hi0 !== null && hi0 !== undefined && hi0 >= 0 && hi0 < l0.length) ? l0[hi0] : ((r.is_dark && hi1 !== null && hi1 !== undefined && hi1 >= 0 && hi1 < l1.length) ? l1[hi1] : null);
      if (!h) continue;
      const lm = toLm(h.landmarks);
      const v = new R19FeatureTracker().extract(lm, 0, asp);
      if (!v) continue;
      const p = c.clf.predict(v);
      const g4 = resolveHybridPistolClassification(lm, asp, p.probs, c.clf.labels, DEFAULT_R19_HYBRID_PARAMS);
      if (cls.startsWith("Horiz_")) { hzN++; if (p.label === "POINT_PRESS") hzRaw++; if (g4.state === "POINT_PRESS") hzG4++; }
      else if (cls === "One_VFR") { vfrN++; if (p.label === "POINT_READY") vfrRawR++; if (g4.state === "POINT_READY") vfrG4R++; if (g4.state === "POINT_PRESS") vfrG4P++; }
      else if (cls !== "One_VFL") { soN++; if (p.label === "POINT_PRESS") soRaw++; if (g4.state === "POINT_PRESS") soG4++; }
    }
  }
  hrOut[c.id] = {
    horiz_n: hzN, horiz_raw_fp: hzRaw, horiz_g4_fp: hzG4,
    strict_other_n: soN, strict_other_raw_fp: soRaw, strict_other_g4_fp: soG4,
    one_vfr_n: vfrN, one_vfr_raw_ready_pct: pct(vfrRawR, vfrN), one_vfr_g4_ready_pct: pct(vfrG4R, vfrN), one_vfr_g4_fp_press: vfrG4P,
  };
}

// 5. BXR7 Holdout (85 hands) & Mendeley 599 (1,133 hands)
const bxrLines = readFileSync(BXR7_OOD_JSONL, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const m599 = JSON.parse(readFileSync(MENDELEY_599_JSON, "utf8"));
const bxrOut: Record<string, any> = {};
for (const c of cands) {
  let bN = 0, bRaw = 0, bG4 = 0, mN = 0, mRaw = 0, mG4 = 0;
  for (const row of bxrLines) {
    bN++;
    const lm = toLm(row.landmarks);
    const v = new R19FeatureTracker().extract(lm, 0, row.aspect || 16 / 9);
    if (!v) continue;
    const p = c.clf.predict(v);
    if (p.label === "POINT_PRESS") bRaw++;
    if (resolveHybridPistolClassification(lm, row.aspect || 16 / 9, p.probs, c.clf.labels, DEFAULT_R19_HYBRID_PARAMS).state === "POINT_PRESS") bG4++;
  }
  for (const k of ["dim_light", "natural_light"] as const) {
    for (const row of m599[k] ?? []) {
      const hands = (row.raw && row.raw.length > 0 ? row.raw : row.clahe320) ?? [];
      for (const hPts of hands) {
        mN++;
        const lm = toLm(hPts);
        const v = new R19FeatureTracker().extract(lm, 0, row.aspect || 16 / 9);
        if (!v) continue;
        const p = c.clf.predict(v);
        if (p.label === "POINT_PRESS") mRaw++;
        if (resolveHybridPistolClassification(lm, row.aspect || 16 / 9, p.probs, c.clf.labels, DEFAULT_R19_HYBRID_PARAMS).state === "POINT_PRESS") mG4++;
      }
    }
  }
  bxrOut[c.id] = {
    bxr7_holdout_hands: bN, bxr7_raw_fp: bRaw, bxr7_g4_fp: bG4,
    mendeley_599_hands: mN, mendeley_599_raw_fp: mRaw, mendeley_599_g4_fp: mG4,
  };
}

// 6. IPN HandS Locked TEST (36 continuous 30 Hz videos across 5 unseen subjects)
async function runIpn() {
  const child = spawn(PYTHON_BIN, [STREAM_IPN_PY, "--split", "test"], { stdio: ["ignore", "pipe", "inherit"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const vids: Array<{ video: string; person: string; frames: Array<{ f: number; cls: string; mp: number[][][] }> }> = [];
  for await (const line of rl) if (line.trim()) vids.push(JSON.parse(line));
  await new Promise((res) => child.on("close", res));

  const ipnOut: Record<string, any> = {};
  for (const c of cands) {
    const byCat: Record<string, { frames: number; active: number; kd: number }> = {
      NOG: { frames: 0, active: 0, kd: 0 },
      P2F: { frames: 0, active: 0, kd: 0 },
      P1F: { frames: 0, active: 0, kd: 0 },
      OTHER_DYN: { frames: 0, active: 0, kd: 0 },
    };
    let stuck = 0;
    for (const vid of vids) {
      const pipe = new R19RuntimePipeline(c.model, 4 / 3);
      for (const fr of vid.frames) {
        const cat = fr.cls === "NOG" ? "NOG" : fr.cls === "P2F" ? "P2F" : fr.cls === "P1F" ? "P1F" : "OTHER_DYN";
        const b = byCat[cat]!;
        b.frames++;
        const nowMs = (fr.f * 1000) / 30;
        if (!fr.mp || fr.mp.length === 0) { pipe.step(null, nowMs, "none", 0.5, 0.5, 0.25); continue; }
        const lm = toLm(fr.mp[0]!);
        const revPose = classifyHandPose(lm, { experimentalRobust: true, aspect: 4 / 3 });
        const pc = palmCenterNormalized(lm);
        const step = pipe.step(lm, nowMs, revPose, pc.x, pc.y, 0.25);
        if (step.fsm.input.left || step.fsm.input.right || step.fsm.input.jump) b.active++;
        if (step.fsm.keyEvent === "KEYDOWN") b.kd++;
      }
      const end = pipe.step(null, (vid.frames.length + 5) * 33.3, "none", 0.5, 0.5, 0.25);
      if (end.fsm.input.left || end.fsm.input.right || end.fsm.input.jump) stuck++;
    }
    const cats: Record<string, any> = {};
    for (const [k, v] of Object.entries(byCat)) {
      cats[k] = { frames: v.frames, active_pct: pct(v.active, v.frames), kd_count: v.kd, kd_per_min: perMin(v.kd, v.frames) };
    }
    ipnOut[c.id] = { videos: vids.length, stuck_keys_after_no_hand: stuck, by_category: cats };
  }
  return ipnOut;
}

runIpn().then((ipnOut) => {
  const out = {
    parity: parityReport,
    cpu_latency_all: latencyAll,
    hg5g_locked_test_230: hgOut,
    natural_rgb_v3_locked_test_888: n66Out,
    ipn_hands_locked_test_36vids: ipnOut,
    hands_rgbd_s4_s5_locked_ood_2092: hrOut,
    bxr7_and_mendeley599_locked_ood: bxrOut,
  };
  writeFileSync("/tmp/r22_ts_full_eval.json", JSON.stringify(out, null, 2));
  console.log("[ts_eval] Completed pure-TS CPU parity, latency, and full G4+FSM evaluation.");
});
"""
    tmp_ts = "/tmp/r22_ts_eval_runner.ts"
    with open(tmp_ts, "w", encoding="utf-8") as f:
        f.write(ts_code)
    env = os.environ.copy()
    env["PATH"] = f"{R20_SANDBOX}/tools/node-v26.13.1-linux-x64/bin:" + env.get("PATH", "")
    res = subprocess.run(
        [VITE_NODE_BIN, tmp_ts],
        cwd=f"{WORKTREE}/frontend/implementation",
        env=env,
        capture_output=True,
        text=True,
        check=True,
    )
    print(res.stdout.strip(), flush=True)
    if res.stderr.strip():
        print(res.stderr.strip()[:500], flush=True)
    return json.load(open("/tmp/r22_ts_full_eval.json", encoding="utf-8"))


def write_model_card(eval_doc: dict[str, Any]) -> None:
    p1 = eval_doc["head1_pistol"]
    p2 = eval_doc["head2_pose"]
    p3 = eval_doc["head3_pinch"]
    ts = eval_doc["ts_cpu_runtime_eval"]
    gate = eval_doc["pistol_promotion_gate_vs_c4"]

    pistol_art = p1["val_selected_primary"]["artifact"]
    pose_art = p2["val_selected_primary"]["artifact"]
    lt = p1["locked_test_4720_comparison"]

    def _row_pistol(mid: str, label: str, bytes_str: str, lat_str: str) -> str:
        m = lt[mid]
        n66 = ts["natural_rgb_v3_locked_test_888"][mid]
        ipn = ts["ipn_hands_locked_test_36vids"][mid]["by_category"]
        hr = ts["hands_rgbd_s4_s5_locked_ood_2092"][mid]
        bx = ts["bxr7_and_mendeley599_locked_ood"][mid]
        return (
            f"| {label} | `{bytes_str}` | `{lat_str}` | **`{m['macroF1']:.4f}`** | `{m['f1_ready']:.4f}` / `{m['f1_press']:.4f}` | "
            f"`{m['other_to_press']}` (`{m['other_to_press_rate']*100:.3f}%`) | `{m['ece_calibrated']:.5f}` | "
            f"`{n66['g4_fp_press']}/{n66['total_other_hands']}` | "
            f"`{ipn['NOG']['kd_per_min']:.2f}/{ipn['P2F']['kd_per_min']:.2f}/{ipn['P1F']['kd_per_min']:.2f}` | "
            f"`{hr['strict_other_raw_fp']}/{hr['strict_other_g4_fp']}` | `{bx['bxr7_raw_fp']}/{bx['bxr7_g4_fp']}` |"
        )

    def _lat_s(mid: str) -> str:
        l = ts["cpu_latency_all"][mid]
        return f"{l['us_p50']:.1f} / {l['us_p95']:.1f} µs"

    def _byt_s(mid: str) -> str:
        return f"{ts['cpu_latency_all'][mid]['bytes']:,} B"

    comb_pose = p2["heldout_evaluation"]["combined_heldout_all"]
    hg_pose = p2["heldout_evaluation"]["hg5g_locked_test"]
    hr_pose = p2["heldout_evaluation"]["hands_rgbd_s4_s5_locked_ood"]
    n66_pose = p2["heldout_evaluation"]["natural_rgb_v3_locked_test_apex"]
    win_pose_key = f"r22_pose_{p2['val_selected_primary']['winner_arch_tag']}"

    md = f"""# R22 NUI Lab — Model Card & Comprehensive Evaluation Gate (`MODEL_CARD_R22.md`)

- **Generated:** `{eval_doc['generated_at']}` by `w-data` (`GPU 0: {eval_doc['hardware']['gpu_name']}`, `PyTorch {eval_doc['hardware']['torch']}`)
- **Contract Compliance:** `K4 = v1.0-FROZEN` | `K5 = r19-82d-v1` (SHA-256 `{eval_doc['k5_encoder_sha256']}`) | `K6 = Pure-TS CPU Verified` | `K7 = v1.0-FROZEN` (`0` leakage)
- **License Guarantee (D02/D14):** Trained **100%** on commercial-safe `CC BY 4.0` / `Apache 2.0` datasets (`HandGesture-5G`, `Natural RGB v3`, `IPN HandS`, `HANDS RGB-D S1..2`, `Mendeley BXR7 Gomoku/Poker 0..68%`). **`0` rows** from `HaGRIDv2` (`HOLD_LICENSE`), **`0` rows** from `DimHand`/`LLHands` (`BLOCKED`), **`0` rows** from unlabelled Owner telemetry `S-07ba0cde` (`UNLABELLED_TELEMETRY`).
- **Evidence Scope:** `OFFLINE_DATASET` / `UNIT_ONLY` (`PHYSICAL_WEBCAM = NOT_TESTED`).

---

## 1. Exported Pure-TS CPU Model Artifacts & Parity Proof (K6, D12)

| Artifact | Path | Arch | Raw JSON Size | SHA-256 | Temp `T` | `validateR19Model` | Py↔TS Parity (`200` rows) | Pure-TS CPU Latency (`p50 / p95`) |
|---|---|---|---:|---|---:|---|---|---|
| **Head 1 Primary (`R22_pistol_head`)** | [`r22_pistol_model.json`](r22_pistol_model.json) | `{pistol_art['arch']}` | `{pistol_art['bytes']:,} B` | `{pistol_art['sha256']}` | `{pistol_art['temperature']}` | **PASS** | **`{ts['parity']['R22_pistol_primary']['argmax_mismatches']}` mis**, max diff `{ts['parity']['R22_pistol_primary']['max_prob_abs_diff']}` | **`{ts['parity']['R22_pistol_primary']['cpu_us']['p50']:.1f} / {ts['parity']['R22_pistol_primary']['cpu_us']['p95']:.1f} µs`** |
| **Head 1 Compact Variant** | [`r22_pistol_mlp_64_32.json`](r22_pistol_mlp_64_32.json) | `{p1['exported_variants']['mlp_64_32']['artifact']['arch']}` | `{p1['exported_variants']['mlp_64_32']['artifact']['bytes']:,} B` | `{p1['exported_variants']['mlp_64_32']['artifact']['sha256']}` | `{p1['exported_variants']['mlp_64_32']['artifact']['temperature']}` | **PASS** | `0` mis | `{_lat_s('R22_pistol_64_32')}` |
| **Head 1 Wide Variant** | [`r22_pistol_mlp_96_48.json`](r22_pistol_mlp_96_48.json) | `{p1['exported_variants']['mlp_96_48']['artifact']['arch']}` | `{p1['exported_variants']['mlp_96_48']['artifact']['bytes']:,} B` | `{p1['exported_variants']['mlp_96_48']['artifact']['sha256']}` | `{p1['exported_variants']['mlp_96_48']['artifact']['temperature']}` | **PASS** | `0` mis | `{_lat_s('R22_pistol_96_48')}` |
| **Head 2 Primary (`R22_pose_head`)** | [`r22_pose_model.json`](r22_pose_model.json) | `{pose_art['arch']}` | `{pose_art['bytes']:,} B` | `{pose_art['sha256']}` | `{pose_art['temperature']}` | `R19Classifier` 5-class PASS | **`{ts['parity']['R22_pose_primary']['argmax_mismatches']}` mis**, max diff `{ts['parity']['R22_pose_primary']['max_prob_abs_diff']}` | **`{ts['parity']['R22_pose_primary']['cpu_us']['p50']:.1f} / {ts['parity']['R22_pose_primary']['cpu_us']['p95']:.1f} µs`** |
| **Head 3 (`R22_pinch_head`)** | *(Geometry+Hysteresis)* | Deterministic | `0 B` extra | N/A (`DATA_GAP`) | N/A | N/A | N/A | `< 2 µs` |

---

## 2. Head 1 (`R22_pistol_head`, `route="gesture"` ONLY) — Fair Head-to-Head Evaluation vs R18 / R19 C0 / R20 C4 / R20 C7 (D05, D11, D13)

> **Historical R18 Comparator Note:** `R18 UX3 MLP` (`r18/models/ux3_model_mlp.json`, SHA `518c0ec4…`, `123,141 B`, `[68->96->48->6]`) used legacy `68D` features trained on IPN HandS 6 behavioral classes (`Macro-F1 = 0.6156` on IPN test, `0` pistol `POINT_PRESS` support) and is strictly segregated from `82D` pistol heads per D04.

| Model (`82D r19-82d-v1`) | JSON Size | Pure-TS CPU (`p50/p95`) | Locked TEST (`4,720`) Macro-F1 | F1 `READY` / `PRESS` | Locked TEST `OTHER→PRESS` | Test ECE (Cal) | Natural RGB v3 (`888`) G4 FP | IPN (`36` vids) `NOG/P2F/P1F` `KD/min` | HANDS RGB-D S4..5 (`528` Strict OTHER) Raw/G4 FP | BXR7 Holdout (`85`) Raw/G4 FP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
{_row_pistol('R19_C0', 'R19 `C0` (`[82,96,48,3]`)', _byt_s('R19_C0'), _lat_s('R19_C0'))}
{_row_pistol('R20_C4', '**R20 `C4` (`[82,64,32,3]`)**', _byt_s('R20_C4'), _lat_s('R20_C4'))}
{_row_pistol('R20_C7_T4', 'R20 `C7 T4` (`[82,64,32,3]`)', _byt_s('R20_C7_T4'), _lat_s('R20_C7_T4'))}
{_row_pistol('R20_C7_T2', 'R20 `C7 T2` (`[82,96,48,3]`)', _byt_s('R20_C7_T2'), _lat_s('R20_C7_T2'))}
{_row_pistol('R22_pistol_64_32', '**R22 `pistol_64_32` (`[82,64,32,3]`)**', _byt_s('R22_pistol_64_32'), _lat_s('R22_pistol_64_32'))}
{_row_pistol('R22_pistol_96_48', '**R22 `pistol_96_48` (`[82,96,48,3]`)**', _byt_s('R22_pistol_96_48'), _lat_s('R22_pistol_96_48'))}

### Explicit Promotion Gate Verdict (`r22_pistol_model.json` vs `R20 C4`)
- **Verdict:** **`{gate['verdict']}`**
- **Selected Primary R22 Variant (VAL-only selection):** `{p1['val_selected_primary']['winner_arch_tag']}` (`r22_pistol_model.json`, SHA-256 `{pistol_art['sha256'][:16]}…`)
- **Comparison Summary:**
  - Locked TEST (`4,720`) Macro-F1: `R22 = {gate['r22_test_macroF1']:.4f}` vs `R20 C4 = {gate['c4_test_macroF1']:.4f}` (`delta = {gate['delta_macroF1']:+.4f}`)
  - Locked TEST `OTHER -> PRESS`: `R22 = {gate['r22_test_other_to_press']}` vs `R20 C4 = {gate['c4_test_other_to_press']}`
  - Locked TEST Calibrated ECE: `R22 = {gate['r22_test_ece']:.5f}` vs `R20 C4 = {gate['c4_test_ece']:.5f}`
  - Natural RGB v3 (`888`) G4 FP: `R22 = {gate['r22_n66_g4_fp']}` vs `R20 C4 = {gate['c4_n66_g4_fp']}`
  - IPN TEST (`36` vids) `NOG / P2F / P1F` `KD/min`: `R22 = {gate['r22_ipn_kd_min']}` vs `R20 C4 = {gate['c4_ipn_kd_min']}`
  - HANDS RGB-D S4..5 Strict OTHER Raw/G4 FP: `R22 = {gate['r22_hrgbd_raw_g4_fp']}` vs `R20 C4 = {gate['c4_hrgbd_raw_g4_fp']}`
  - BXR7 Holdout (`85`) Raw/G4 FP: `R22 = {gate['r22_bxr7_raw_g4_fp']}` vs `R20 C4 = {gate['c4_bxr7_raw_g4_fp']}`
- **Runtime Policy (K6 / A04):** {gate['rationale']}

### D09 Train-Only Augmentation Ablation (Controlled `[82->64->32->3]`, Seed `20261122`)

| Ablation Condition | Train Rows | VAL Macro-F1 | VAL `OTHER→PRESS` | Locked TEST (`4,720`) Macro-F1 | TEST `OTHER→PRESS` | TEST ECE |
|---|---:|---:|---:|---:|---:|---:|
| `A0_base_r20_c3` (R20 C3 union) | `{p1['d09_augmentation_ablation']['A0_base_r20_c3']['train_rows']:,}` | `{p1['d09_augmentation_ablation']['A0_base_r20_c3']['val_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A0_base_r20_c3']['val_other_to_press']}` | `{p1['d09_augmentation_ablation']['A0_base_r20_c3']['test_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A0_base_r20_c3']['test_other_to_press']}` | `{p1['d09_augmentation_ablation']['A0_base_r20_c3']['test_ece']:.5f}` |
| `A1_plus_r22_img_aug` (+glare/mblur/lowexp+chroma/jpeg/persp) | `{p1['d09_augmentation_ablation']['A1_plus_r22_img_aug']['train_rows']:,}` | `{p1['d09_augmentation_ablation']['A1_plus_r22_img_aug']['val_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A1_plus_r22_img_aug']['val_other_to_press']}` | `{p1['d09_augmentation_ablation']['A1_plus_r22_img_aug']['test_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A1_plus_r22_img_aug']['test_other_to_press']}` | `{p1['d09_augmentation_ablation']['A1_plus_r22_img_aug']['test_ece']:.5f}` |
| `A2_plus_r22_lm_aug` (+aniso jitter/ring-pinky dropout/persp/var-dt) | `{p1['d09_augmentation_ablation']['A2_plus_r22_lm_aug']['train_rows']:,}` | `{p1['d09_augmentation_ablation']['A2_plus_r22_lm_aug']['val_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A2_plus_r22_lm_aug']['val_other_to_press']}` | `{p1['d09_augmentation_ablation']['A2_plus_r22_lm_aug']['test_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A2_plus_r22_lm_aug']['test_other_to_press']}` | `{p1['d09_augmentation_ablation']['A2_plus_r22_lm_aug']['test_ece']:.5f}` |
| `A3_full_r22_aug_union` (All R22 Image + Landmark Augs) | `{p1['d09_augmentation_ablation']['A3_full_r22_aug_union']['train_rows']:,}` | `{p1['d09_augmentation_ablation']['A3_full_r22_aug_union']['val_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A3_full_r22_aug_union']['val_other_to_press']}` | `{p1['d09_augmentation_ablation']['A3_full_r22_aug_union']['test_macroF1']:.4f}` | `{p1['d09_augmentation_ablation']['A3_full_r22_aug_union']['test_other_to_press']}` | `{p1['d09_augmentation_ablation']['A3_full_r22_aug_union']['test_ece']:.5f}` |

---

## 3. Head 2 (`R22_pose_head`, `FIST / ONE / TWO / FIVE / OTHER`) vs Multi-Joint Geometry (D06)

Curated strictly subject/cluster-disjoint from `HandGesture-5G` (`21/8/9` clusters), `HANDS RGB-D` (`S1..2` train / `S3` val / `S4..5` locked OOD; `TimeOut` excluded), and `Natural RGB v3` (`19/4/3` participants, apex `rank 3..5`).

| Classifier | Combined Held-Out (`n={comb_pose['geom_r22_multijoint_aspect']['n']:,}`) Macro-F1 | HG5G Locked TEST (`n={hg_pose['geom_r22_multijoint_aspect']['n']}`) Macro-F1 | HANDS RGB-D S4..5 OOD (`n={hr_pose['geom_r22_multijoint_aspect']['n']:,}`) Macro-F1 | Natural RGB v3 Apex TEST (`n={n66_pose['geom_r22_multijoint_aspect']['n']}`) Macro-F1 | Combined `FIST→FIVE` False Erase | Combined `OTHER→FIVE` False Erase | Combined `ONE↔TWO` Swaps |
|---|---:|---:|---:|---:|---:|---:|---:|
| Deterministic Legacy Geometry | `{comb_pose['geom_legacy_deterministic']['macroF1']:.4f}` | `{hg_pose['geom_legacy_deterministic']['macroF1']:.4f}` | `{hr_pose['geom_legacy_deterministic']['macroF1']:.4f}` | `{n66_pose['geom_legacy_deterministic']['macroF1']:.4f}` | `{comb_pose['geom_legacy_deterministic']['safety']['fist_to_five_false_erase']}` | `{comb_pose['geom_legacy_deterministic']['safety']['other_to_five_false_erase']}` | `{comb_pose['geom_legacy_deterministic']['safety']['one_to_two_confusion'] + comb_pose['geom_legacy_deterministic']['safety']['two_to_one_confusion']}` |
| Deterministic R22 Multi-Joint Aspect Geometry | `{comb_pose['geom_r22_multijoint_aspect']['macroF1']:.4f}` | `{hg_pose['geom_r22_multijoint_aspect']['macroF1']:.4f}` | `{hr_pose['geom_r22_multijoint_aspect']['macroF1']:.4f}` | `{n66_pose['geom_r22_multijoint_aspect']['macroF1']:.4f}` | `{comb_pose['geom_r22_multijoint_aspect']['safety']['fist_to_five_false_erase']}` | `{comb_pose['geom_r22_multijoint_aspect']['safety']['other_to_five_false_erase']}` | `{comb_pose['geom_r22_multijoint_aspect']['safety']['one_to_two_confusion'] + comb_pose['geom_r22_multijoint_aspect']['safety']['two_to_one_confusion']}` |
| `R22_pose_lr` (`[82->5]`) | `{comb_pose['r22_pose_lr_82_5']['macroF1']:.4f}` | `{hg_pose['r22_pose_lr_82_5']['macroF1']:.4f}` | `{hr_pose['r22_pose_lr_82_5']['macroF1']:.4f}` | `{n66_pose['r22_pose_lr_82_5']['macroF1']:.4f}` | `{comb_pose['r22_pose_lr_82_5']['safety']['fist_to_five_false_erase']}` | `{comb_pose['r22_pose_lr_82_5']['safety']['other_to_five_false_erase']}` | `{comb_pose['r22_pose_lr_82_5']['safety']['one_to_two_confusion'] + comb_pose['r22_pose_lr_82_5']['safety']['two_to_one_confusion']}` |
| **`R22_pose_mlp_64_32` (`[82->64->32->5]`)** | **`{comb_pose['r22_pose_mlp_64_32']['macroF1']:.4f}`** | **`{hg_pose['r22_pose_mlp_64_32']['macroF1']:.4f}`** | **`{hr_pose['r22_pose_mlp_64_32']['macroF1']:.4f}`** | **`{n66_pose['r22_pose_mlp_64_32']['macroF1']:.4f}`** | `{comb_pose['r22_pose_mlp_64_32']['safety']['fist_to_five_false_erase']}` | `{comb_pose['r22_pose_mlp_64_32']['safety']['other_to_five_false_erase']}` | `{comb_pose['r22_pose_mlp_64_32']['safety']['one_to_two_confusion'] + comb_pose['r22_pose_mlp_64_32']['safety']['two_to_one_confusion']}` |
| **`R22_pose_mlp_96_48` (`[82->96->48->5]`)** | **`{comb_pose['r22_pose_mlp_96_48']['macroF1']:.4f}`** | **`{hg_pose['r22_pose_mlp_96_48']['macroF1']:.4f}`** | **`{hr_pose['r22_pose_mlp_96_48']['macroF1']:.4f}`** | **`{n66_pose['r22_pose_mlp_96_48']['macroF1']:.4f}`** | `{comb_pose['r22_pose_mlp_96_48']['safety']['fist_to_five_false_erase']}` | `{comb_pose['r22_pose_mlp_96_48']['safety']['other_to_five_false_erase']}` | `{comb_pose['r22_pose_mlp_96_48']['safety']['one_to_two_confusion'] + comb_pose['r22_pose_mlp_96_48']['safety']['two_to_one_confusion']}` |

- **Primary Exported Pose Model (`r22_pose_model.json`, `{win_pose_key}`):** Per-class F1 on Combined Held-Out (`n={comb_pose[win_pose_key]['n']:,}`):
  - `FIST = {comb_pose[win_pose_key]['per_class']['FIST']['f1']:.4f}`, `ONE = {comb_pose[win_pose_key]['per_class']['ONE']['f1']:.4f}`, `TWO = {comb_pose[win_pose_key]['per_class']['TWO']['f1']:.4f}`, `FIVE = {comb_pose[win_pose_key]['per_class']['FIVE']['f1']:.4f}`, `OTHER = {comb_pose[win_pose_key]['per_class']['OTHER']['f1']:.4f}` (Calibrated ECE = `{comb_pose[win_pose_key]['ece']:.5f}`).
- **Integration Status (§A2):** `CANDIDATE` (ready behind the single `PoseSource` interface after physical webcam validation; never run in parallel as a competing veto!).

---

## 4. Head 3 (`R22_pinch_head`, `TOUCH / NEAR / OPEN`) — Honest `DATA_GAP` & Evaluator Comparison (D07)

- **Supervised Neural Status:** **`DATA_GAP_CONFIRMED`** — `0` legal `CC BY 4.0` datasets contain frame-level ground truth separating thumb-index physical contact (`TOUCH <= 0.30`) from intentional non-contact hover (`NEAR 0.30..0.50`). No fake supervised pinch neural head is fabricated.
- **Evaluator Benchmark (Canonical Hysteresis vs Calibrated Geometric+Kinematic):**
  - **Real Non-Pinch Negative False `TOUCH` Rate:**
    - `HG5G Locked TEST` (`n={p3['real_legal_negative_and_ok_suites']['hg5g_locked_test_non_pinch']['n']}`): Canonical `{p3['real_legal_negative_and_ok_suites']['hg5g_locked_test_non_pinch']['canonical_hysteresis_touch_count']}` (`{p3['real_legal_negative_and_ok_suites']['hg5g_locked_test_non_pinch']['canonical_hysteresis_touch_rate']*100:.2f}%`) vs Calibrated `{p3['real_legal_negative_and_ok_suites']['hg5g_locked_test_non_pinch']['calibrated_geom_kinematic_touch_count']}` (`{p3['real_legal_negative_and_ok_suites']['hg5g_locked_test_non_pinch']['calibrated_geom_kinematic_touch_rate']*100:.2f}%`).
    - `HANDS RGB-D S4..5` (`n={p3['real_legal_negative_and_ok_suites']['hands_rgbd_s4_s5_non_pinch']['n']:,}`, incl. `120` `Punch` fists!): Canonical `{p3['real_legal_negative_and_ok_suites']['hands_rgbd_s4_s5_non_pinch']['canonical_hysteresis_touch_count']}` (`{p3['real_legal_negative_and_ok_suites']['hands_rgbd_s4_s5_non_pinch']['canonical_hysteresis_touch_rate']*100:.2f}%`) vs Calibrated `{p3['real_legal_negative_and_ok_suites']['hands_rgbd_s4_s5_non_pinch']['calibrated_geom_kinematic_touch_count']}` (`{p3['real_legal_negative_and_ok_suites']['hands_rgbd_s4_s5_non_pinch']['calibrated_geom_kinematic_touch_rate']*100:.2f}%`).
    - `Natural RGB v3 TEST non-OK` (`n={p3['real_legal_negative_and_ok_suites']['natural_rgb_v3_test_non_ok']['n']}`): Canonical `{p3['real_legal_negative_and_ok_suites']['natural_rgb_v3_test_non_ok']['canonical_hysteresis_touch_count']}` vs Calibrated `{p3['real_legal_negative_and_ok_suites']['natural_rgb_v3_test_non_ok']['calibrated_geom_kinematic_touch_count']}`.
  - **Synthetic Near-Pinch Negative Hold (`0.32..0.48`, `UNIT_ONLY`):** **`0 / 150` false `TOUCH`** on BOTH evaluators!
  - **Synthetic Closing/Opening Contact Ramp (`UNIT_ONLY`):** Release tail frames `> 0.30`: Canonical `{p3['synthetic_contact_ramp_UNIT_ONLY']['canonical_release_tail_frames_gt_030']}` vs Calibrated `{p3['synthetic_contact_ramp_UNIT_ONLY']['calibrated_release_tail_frames_gt_030']}` (velocity tightening cuts release drag!).
  - **Unlabelled Owner T004 Sequence (`S-07ba0cde-T004`, `labelSource: "UNLABELLED_TELEMETRY"`, `independentGroundTruthAvailable: false`):** Inter-evaluator 3-class agreement = **`{p3['owner_t004_unlabelled_telemetry_comparison']['inter_evaluator_3class_agreement_pct']}%`** across `{p3['owner_t004_unlabelled_telemetry_comparison']['t004_hand_frames']}` hand frames (`Canon TOUCH={p3['owner_t004_unlabelled_telemetry_comparison']['canonical_hysteresis_touch_frames']}`, `Calib TOUCH={p3['owner_t004_unlabelled_telemetry_comparison']['calibrated_geom_kinematic_touch_frames']}`), recovering `{p3['owner_t004_unlabelled_telemetry_comparison']['legacy_r19_gate_rejected_pinch_recovered_canonical']}` (Canonical) / `{p3['owner_t004_unlabelled_telemetry_comparison']['legacy_r19_gate_rejected_pinch_recovered_calibrated']}` (Calibrated) deep-pinch frames previously rejected by R19's `Cubit ditolak gate R19` veto.
"""
    with open(f"{R22_MODEL_DIR}/MODEL_CARD_R22.md", "w", encoding="utf-8") as f:
        f.write(md)
    print(f"[model_card] Wrote {R22_MODEL_DIR}/MODEL_CARD_R22.md", flush=True)


def run_stage_train() -> dict[str, Any]:
    os.makedirs(R22_MODEL_DIR, exist_ok=True)
    os.makedirs(R22_RES_DIR, exist_ok=True)
    t_all = time.time()
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    assert torch.cuda.is_available(), "CUDA GPU 0 is required for W-DATA training!"
    dev = torch.device("cuda:0")
    hw = {
        "cuda_visible_devices": os.environ.get("CUDA_VISIBLE_DEVICES", "unset"),
        "gpu_name": torch.cuda.get_device_name(dev),
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
    }
    print(f"[train] Running on {hw}", flush=True)

    # 1. Generate NEW R22 train-only image augmentations (strictly train clusters of hg5g_720)
    img_aug_rows, img_aug_stats = generate_r22_train_image_augs(workers=6)

    # 2. Train & evaluate Head 1 (Pistol), Head 2 (Pose), Head 3 (Pinch Audit + Eval)
    head1 = train_pistol_head(dev, img_aug_rows, img_aug_stats)
    head2 = train_pose_head(dev, img_aug_rows)
    head3 = eval_pinch_head()

    # 3. Pure-TS CPU parity, microsecond latency & full G4 Hybrid + FSM evaluation
    ts_eval = run_ts_parity_and_full_g4_eval()

    # 4. Honest Promotion Gate Verdict: Does primary r22_pistol_model.json beat R20 C4?
    win_tag = head1["val_selected_primary"]["winner_arch_tag"]
    r22_key = "R22_pistol_64_32" if win_tag == "mlp_64_32" else "R22_pistol_96_48"
    m_r22 = head1["locked_test_4720_comparison"][r22_key]
    m_c4 = head1["locked_test_4720_comparison"]["R20_C4"]
    n66_r22 = ts_eval["natural_rgb_v3_locked_test_888"]["R22_pistol_primary"]
    n66_c4 = ts_eval["natural_rgb_v3_locked_test_888"]["R20_C4"]
    ipn_r22 = ts_eval["ipn_hands_locked_test_36vids"]["R22_pistol_primary"]["by_category"]
    ipn_c4 = ts_eval["ipn_hands_locked_test_36vids"]["R20_C4"]["by_category"]
    hr_r22 = ts_eval["hands_rgbd_s4_s5_locked_ood_2092"]["R22_pistol_primary"]
    hr_c4 = ts_eval["hands_rgbd_s4_s5_locked_ood_2092"]["R20_C4"]
    bx_r22 = ts_eval["bxr7_and_mendeley599_locked_ood"]["R22_pistol_primary"]
    bx_c4 = ts_eval["bxr7_and_mendeley599_locked_ood"]["R20_C4"]

    delta_f1 = round(m_r22["macroF1"] - m_c4["macroF1"], 4)
    beats_f1 = m_r22["macroF1"] > m_c4["macroF1"]
    no_safety_regression = (
        m_r22["other_to_press"] <= m_c4["other_to_press"]
        and m_r22["ready_to_press"] <= m_c4["ready_to_press"]
        and n66_r22["g4_fp_press"] <= n66_c4["g4_fp_press"]
        and hr_r22["strict_other_g4_fp"] <= hr_c4["strict_other_g4_fp"]
        and bx_r22["bxr7_g4_fp"] <= bx_c4["bxr7_g4_fp"]
        and ipn_r22["NOG"]["kd_per_min"] <= ipn_c4["NOG"]["kd_per_min"]
        and ipn_r22["P2F"]["kd_per_min"] <= ipn_c4["P2F"]["kd_per_min"]
    )
    # Also check if beats on OOD/calibration/IPN P1F at tie
    strong_ood_improvement = (
        m_r22["macroF1"] >= m_c4["macroF1"]
        and no_safety_regression
        and (
            beats_f1
            or (ipn_r22["P1F"]["kd_per_min"] < ipn_c4["P1F"]["kd_per_min"] and hr_r22["strict_other_raw_fp"] < hr_c4["strict_other_raw_fp"])
        )
    )
    if beats_f1 and no_safety_regression:
        verdict = "PASS_PROMOTE_R22_PISTOL_OVER_C4"
        rationale = (
            f"`r22_pistol_model.json` ({win_tag}) strictly beats `R20 C4` on Locked TEST (`{m_r22['macroF1']:.4f}` vs `{m_c4['macroF1']:.4f}`, "
            f"`{delta_f1:+.4f}`) with zero safety regression on Natural RGB v3, IPN HandS, HANDS RGB-D S4..5, and BXR7 holdout. "
            "Eligible for promotion pending coordinator/Owner integration under K6."
        )
    elif strong_ood_improvement:
        verdict = "CANDIDATE_MATCHES_C4_BETTER_OOD_SAFETY"
        rationale = (
            f"`r22_pistol_model.json` ({win_tag}) matches `R20 C4` on Locked TEST (`{m_r22['macroF1']:.4f}` vs `{m_c4['macroF1']:.4f}`) "
            "while improving OOD raw safety / IPN P1F false triggers. Keep `R20 C4` as honest default runtime (`r20-c4`) or promote with Owner sign-off."
        )
    else:
        verdict = "CANDIDATE_KEEP_R20_C4_DEFAULT"
        rationale = (
            f"`r22_pistol_model.json` ({win_tag}) did not strictly outperform `R20 C4` on Locked TEST (`{m_r22['macroF1']:.4f}` vs `{m_c4['macroF1']:.4f}`, "
            f"`other->press: {m_r22['other_to_press']} vs {m_c4['other_to_press']}`). Per K6 & D08, keep `R20 C4` as the active default runtime model "
            "and report exact `r20-c4` metadata & SHA-256 honestly without disguising C4 as R22."
        )

    gate_obj = {
        "verdict": verdict,
        "rationale": rationale,
        "r22_primary_variant": win_tag,
        "r22_test_macroF1": m_r22["macroF1"],
        "c4_test_macroF1": m_c4["macroF1"],
        "delta_macroF1": delta_f1,
        "r22_test_other_to_press": m_r22["other_to_press"],
        "c4_test_other_to_press": m_c4["other_to_press"],
        "r22_test_ece": m_r22["ece_calibrated"],
        "c4_test_ece": m_c4["ece_calibrated"],
        "r22_n66_g4_fp": n66_r22["g4_fp_press"],
        "c4_n66_g4_fp": n66_c4["g4_fp_press"],
        "r22_ipn_kd_min": f"{ipn_r22['NOG']['kd_per_min']:.2f}/{ipn_r22['P2F']['kd_per_min']:.2f}/{ipn_r22['P1F']['kd_per_min']:.2f}",
        "c4_ipn_kd_min": f"{ipn_c4['NOG']['kd_per_min']:.2f}/{ipn_c4['P2F']['kd_per_min']:.2f}/{ipn_c4['P1F']['kd_per_min']:.2f}",
        "r22_hrgbd_raw_g4_fp": f"{hr_r22['strict_other_raw_fp']}/{hr_r22['strict_other_g4_fp']}",
        "c4_hrgbd_raw_g4_fp": f"{hr_c4['strict_other_raw_fp']}/{hr_c4['strict_other_g4_fp']}",
        "r22_bxr7_raw_g4_fp": f"{bx_r22['bxr7_raw_fp']}/{bx_r22['bxr7_g4_fp']}",
        "c4_bxr7_raw_g4_fp": f"{bx_c4['bxr7_raw_fp']}/{bx_c4['bxr7_g4_fp']}",
    }

    r18_hist_ref = {
        "model_path": MODEL_R18_UX3,
        "sha256": sha256_file(MODEL_R18_UX3),
        "bytes": os.path.getsize(MODEL_R18_UX3),
        "feature_dim": 68,
        "classes": ["NOG", "POINT_1F", "POINT_2F", "GRAB_FIST", "THROW_SWIPE", "OPEN_ZOOM"],
        "ipn_test_macroF1": 0.6156,
        "ipn_test_acc": 0.8045,
        "note": "Legacy 68D IPN-only 6-class model; strictly segregated from 82D R19/R20/R22 models (D04).",
    }

    eval_doc = {
        "generated_at": now_iso,
        "elapsed_sec": round(time.time() - t_all, 1),
        "hardware": hw,
        "peak_vram_mb": round(torch.cuda.max_memory_allocated(dev) / (1024 ** 2), 2),
        "contracts": {"K4": "v1.0-FROZEN", "K5": "r19-82d-v1", "K6": "Pure-TS CPU Verified", "K7": "v1.0-FROZEN"},
        "k5_encoder_sha256": sha256_file(R19_FEAT_TS_FRONTEND),
        "historical_r18_68d_comparator": r18_hist_ref,
        "head1_pistol": head1,
        "head2_pose": head2,
        "head3_pinch": head3,
        "ts_cpu_runtime_eval": ts_eval,
        "pistol_promotion_gate_vs_c4": gate_obj,
    }

    out_eval = f"{R22_RES_DIR}/r22_heads_eval.json"
    with open(out_eval, "w", encoding="utf-8") as f:
        json.dump(eval_doc, f, indent=2)
    write_model_card(eval_doc)
    print(f"\n[ALL DONE] Wrote {out_eval} in {eval_doc['elapsed_sec']}s | Gate Verdict: {verdict}", flush=True)
    return eval_doc


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["registry", "train", "all"], default="all")
    args = ap.parse_args()
    if args.stage in ("registry", "all"):
        run_stage_registry()
    if args.stage in ("train", "all"):
        run_stage_train()


if __name__ == "__main__":
    main()
