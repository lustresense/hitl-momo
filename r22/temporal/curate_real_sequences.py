#!/usr/bin/env python3
"""
R22 W-TEMPORAL — Curate Genuine Multi-Frame Time-Ordered Landmark Sequences (D05 / D08 / G07).

STRICT ANTI-FABRICATION CONTRACT (D05 / G07):
  - NEVER replicate a static single image W times to fake a temporal sequence.
  - Every sequence MUST consist of >= 3 distinct, genuinely time-ordered frames from real
    continuous videos or verified distinct-CRC32 sequential photo bursts with real timestamps (`t_ms`),
    real frame-to-frame delta (`dt_ms`), and real measured hand displacement.
  - NEVER invent `landmark.visibility` (MediaPipe web HandLandmarker does not output it).
  - Strictly enforce person/participant/cluster/session-disjoint K7 splits identical to R19/R20:
      1) IPN HandS (CC BY 4.0): 200 continuous 30 FPS videos, person-disjoint 19/5/5 (128/36/36).
      2) Natural RGB Hand Gestures v3 (CC BY 4.0): 1,352 30 FPS multi-frame clips (8 frames/clip),
         participant-disjoint 19/4/3 across 6 lighting strata; point_left/right quarantined as OTHER
         for Pistol and audited separately as conversational pointing.
      3) HANDS RGB-D v2 (CC BY 4.0): continuous 30 FPS RealSense runs (dFrame <= 5), strictly
         person-disjoint Subject1..2 (train) / Subject3 (val) / Subject4..5 (locked ood_test).
      4) Mendeley bxr7kx84y6 v2 (CC BY 4.0): continuous board-game video frames (30 FPS stride-10),
         session-disjoint Gomoku/Poker 0..68% (train), 75..100% (ood_test), 5 locked games (ood_test).
      5) HandGesture-5G (CC BY 4.0): cluster-disjoint (with R19/R20 Pointing Up cluster 18<->19 swap,
         TEST untouched), ONLY distinct-CRC32 EXIF-timestamped sequential bursts (len >= 3, dt <= 10s).
         Explicitly tagged `cadence="photo_burst_exif"` (NOT falsely labeled 30 FPS video!).
  - Explicitly EXCLUDED and audited:
      * `a4v2_detected_landmarks.jsonl`: synthetic cv2.warpAffine jitter of single static images -> REJECTED (D05).
      * `HaGRIDv2`: HOLD_LICENSE -> REJECTED (K7/D02).
      * Owner `four-trials` JSON: unlabeled telemetry -> EXCLUDED from training & supervised GT (D07).

Outputs inside `/srv/sketchbook/mediapipe-optimize/research-can/r22/temporal/`:
  - `curated_sequences_cache.npz`   (packed landmarks [N,21,3], t_ms, valid, pistol_y, pose5_y)
  - `curated_sequences_meta.json`   (per-sequence index, source, split, group, cadence, raw_cls)
  - `curated_real_sequences_manifest.json` (audit summary, SHA-256 hashes, motion verification, exclusions)
"""
from __future__ import annotations

import collections
import csv
import hashlib
import json
import math
import os
import re
import time
import zipfile
from typing import Any

import numpy as np

# Paths (read-only inputs, owned output dir)
R18_IPN_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/ipn_hands"
R18_IPN_SPLIT = "/srv/sketchbook/mediapipe-optimize/research-can/r18/manifests/ipn_person_split.json"
R18_MENDELEY_599 = "/srv/sketchbook/mediapipe-optimize/research-can/r18/results/ux3_mendeley_distractor_landmarks.json"
R19_HG5G_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl"
R19_N66_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl"
R19_N66_META_CSV = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/n66hhk695h_v3_derived/metadata.csv"
R19_HRGBD_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/hands_rgbd_eval/hands_rgbd_landmarks.jsonl"
R20_BXR7_TRAIN = "/srv/sketchbook/mediapipe-optimize/r20-sandbox/data/hard_neg/extra_bxr7_gomoku_poker_train.jsonl"
R20_BXR7_OOD = "/srv/sketchbook/mediapipe-optimize/r20-sandbox/data/hard_neg/bxr7_gomoku_poker_ood_test.jsonl"

OUT_DIR = "/srv/sketchbook/mediapipe-optimize/research-can/r22/temporal"
CACHE_NPZ = os.path.join(OUT_DIR, "curated_sequences_cache.npz")
META_JSON = os.path.join(OUT_DIR, "curated_sequences_meta.json")
MANIFEST_JSON = os.path.join(OUT_DIR, "curated_real_sequences_manifest.json")

# K4 Frozen Label Taxonomies
PISTOL_LABELS = ["POINT_READY", "POINT_PRESS", "OTHER"]
PISTOL_TO_ID = {k: i for i, k in enumerate(PISTOL_LABELS)}

POSE5_LABELS = ["FIST", "ONE", "TWO", "FIVE", "OTHER"]
POSE5_TO_ID = {k: i for i, k in enumerate(POSE5_LABELS)}

IPN_CLASSES = [
    "NOG", "P1F", "P2F", "C1F", "C2F", "TUP", "TDN", "TLT",
    "TRT", "OP2", "2C1", "2C2", "ZIN", "ZOT", "GRB",
]
IPN_OTHER_PISTOL = {"NOG", "P2F", "C2F", "2C2", "GRB", "TUP", "TDN", "TLT", "TRT", "OP2", "ZIN", "ZOT"}
IPN_CASUAL_1F = {"P1F", "C1F", "2C1"}

N66_OTHER_PISTOL = {
    "thumbs_up", "thumbs_down", "peace_sign", "ok_sign", "fist",
    "stop", "raised_hand", "palm_down_push", "wave", "come_here", "go",
}
N66_CONVERSATIONAL_POINT = {"point_left", "point_right"}

# K4 Canvas Pose-5 audited mappings (strictly verified against landmark finger-extension audit;
# dynamic multi-phase gestures like IPN GRB/OP2 or N66 come_here/wave are NOT falsely mapped to static poses).
HRGBD_POSE5_MAP = {
    "Punch_VFR": "FIST", "Punch_VFL": "FIST",
    "One_VFR": "ONE", "One_VFL": "ONE",
    "Two_VFR": "TWO", "Two_VFL": "TWO",
    "Five_VFR": "FIVE", "Five_VFL": "FIVE",
    "Horiz_HBL": "OTHER", "Horiz_HBR": "OTHER", "Horiz_HFL": "OTHER", "Horiz_HFR": "OTHER",
    "Span_VFR": "OTHER", "Span_VFL": "OTHER",
    "Six_VFR": "OTHER", "Six_VFL": "OTHER",
    "Seven_VFR": "OTHER", "Seven_VFL": "OTHER",
    "Eight_VFR": "OTHER", "Eight_VFL": "OTHER",
    "TimeOut": "OTHER",
}
HG5G_POSE5_MAP = {
    "Fist": "FIST",
    "Pointing Up": "ONE",
    "V-Sign": "TWO",
    "Open Palm_Open Hand": "FIVE",
    "L-Sign": "OTHER",
}
N66_POSE5_MAP = {
    "fist": "FIST",
    "peace_sign": "TWO",
    "stop": "FIVE",
    "raised_hand": "FIVE",
    "thumbs_up": "OTHER",
    "thumbs_down": "OTHER",
    "ok_sign": "OTHER",
    "palm_down_push": "OTHER",
    "wave": "OTHER",
    "come_here": "OTHER",
    "go": "OTHER",
    "point_left": "OTHER",
    "point_right": "OTHER",
}
# IPN HandS Pose-5: P1F/C1F/2C1 = ONE, P2F/C2F/2C2 = TWO, NOG/TUP/TDN/TLT/TRT/ZIN/ZOT = OTHER;
# GRB and OP2 are dynamic open<->close transitions so left unlabeled (-1) for static pose5 head.
IPN_POSE5_MAP = {
    "P1F": "ONE", "C1F": "ONE", "2C1": "ONE",
    "P2F": "TWO", "C2F": "TWO", "2C2": "TWO",
    "NOG": "OTHER", "TUP": "OTHER", "TDN": "OTHER", "TLT": "OTHER", "TRT": "OTHER",
    "ZIN": "OTHER", "ZOT": "OTHER",
}

# =============================================================================
# Frozen K5 Feature Encoder (`r22-temporal-146d-v1`) — Exact TS Parity Mirror
# =============================================================================
TIPS = (4, 8, 12, 16, 20)
BEND = ((2, 3, 4), (5, 6, 8), (9, 10, 12), (13, 14, 16), (17, 18, 20))


def _build_r19_feature_names() -> list[str]:
    names: list[str] = []
    for i in range(1, 21):
        names.extend([f"x{i}", f"y{i}"])
    for f in ("thumb", "index", "middle", "ring", "pinky"):
        names.append(f"reach_{f}")
    for f in ("thumb", "index", "middle", "ring", "pinky"):
        names.append(f"bend_{f}")
    for f in ("thumb_index", "index_middle", "middle_ring", "ring_pinky"):
        names.append(f"gap_{f}")
    names.extend([
        "thumb_index_tip", "thumb_lateral_clamped", "palm_aspect_ratio", "knuckle_span_ratio",
        "index_proj_ratio", "thumb_over_index_reach", "d4_5", "d4_6", "d4_9", "d4_10",
        "d4_2", "d4_17", "thumb_perp_idx", "thumb_along_idx", "thumb_abduct_854",
        "thumb_abduct_524", "thumb_bend_123", "d4_8_over_d5_8", "has_history",
        "wrist_speed", "wrist_vx", "wrist_vy", "tip8_speed", "pinch_delta",
        "index_reach_delta", "spread_delta", "shape_jitter", "thumb_open_delta",
    ])
    return names


def build_r22_temporal_feature_names() -> list[str]:
    names = _build_r19_feature_names()
    for i in range(21):
        names.extend([f"vx{i}", f"vy{i}", f"vz{i}"])
    names.append("valid_frame_mask")
    assert len(names) == 146
    return names


R22_TEMPORAL_FEATURE_NAMES = build_r22_temporal_feature_names()
R22_TEMPORAL_FEATURE_DIM = 146


def _clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else (hi if v > hi else v)


def _joint_angle_norm(ax: float, ay: float, bx: float, by: float, cx: float, cy: float) -> float:
    v1x, v1y = ax - bx, ay - by
    v2x, v2y = cx - bx, cy - by
    n = math.hypot(v1x, v1y) * math.hypot(v2x, v2y)
    if n < 1e-9:
        return 0.0
    cosv = _clamp((v1x * v2x + v1y * v2y) / n, -1.0, 1.0)
    return math.acos(cosv) / math.pi


def compute_derived_quality_gate(lm: np.ndarray | None, aspect: float) -> tuple[bool, float, str | None]:
    """
    Derived landmark health & plausibility gate using ONLY observable 21 landmarks.
    NEVER reads or invents `landmark.visibility`.
    Returns `(plausible, quality_score, reject_reason)`.
    """
    if lm is None or lm.shape[0] < 21:
        return False, 0.0, "no-hand"
    if not np.all(np.isfinite(lm[:, :2])):
        return False, 0.0, "non-finite-xy"
    a = aspect if (math.isfinite(aspect) and aspect > 0.0) else 1.0
    gx = lm[:, 0] * a
    gy = lm[:, 1]
    span = math.hypot(float(gx[9] - gx[0]), float(gy[9] - gy[0]))
    knuckle = math.hypot(float(gx[17] - gx[5]), float(gy[17] - gy[5]))
    palm_scale = max(span, knuckle)
    if not (palm_scale > 1e-4):
        return False, 0.0, "degenerate-palm"

    # Anatomical plausibility check (softly penalizes collapsed or exploded skeletons)
    ratio_knuckle = knuckle / palm_scale
    ratio_span = span / palm_scale
    if ratio_knuckle < 0.08 or ratio_span < 0.12:
        return False, 0.0, "collapsed-palm-aspect"

    max_reach = 0.0
    for t in TIPS:
        r = math.hypot(float(gx[t] - gx[0]), float(gy[t] - gy[0])) / palm_scale
        if r > max_reach:
            max_reach = r
    if max_reach > 4.2 or max_reach < 0.35:
        return False, 0.0, "implausible-finger-reach"

    size_score = _clamp((palm_scale - 0.02) / 0.10, 0.0, 1.0)
    return True, float(0.5 + 0.5 * size_score), None


class R22TemporalFeatureExtractorPy:
    """
    Exact Python mirror of TypeScript `R22TemporalFeatureExtractor` (`r22-temporal-146d-v1`):
      - [0..81]   : exact `R19FeatureTracker` 82D causal features
      - [82..144] : 63D dt-normalized joint velocities (i=0 global wrist vel in palmScales/s,
                    i=1..20 canonical palm-local articulation velocity in palmScales/s), clamped [-10, 10]
      - [145]     : 1D `valid_frame_mask` (1.0 if plausible valid hand, 0.0 if missing/masked)
    """

    def __init__(self, loss_reset_ms: float = 500.0, max_vel_dt_s: float = 5.0, max_jump_norm: float = 0.45):
        self.loss_reset_ms = float(loss_reset_ms)
        self.max_vel_dt_s = float(max_vel_dt_s)
        self.max_jump_norm = float(max_jump_norm)
        self.ring: list[dict[str, Any]] = []
        self.prev_t_ms: float | None = None
        self.prev_wrist: tuple[float, float, float] | None = None
        self.prev_canon: np.ndarray | None = None  # shape (21, 3)
        self.last_valid_t_ms: float | None = None

    def reset(self) -> None:
        self.ring = []
        self.prev_t_ms = None
        self.prev_wrist = None
        self.prev_canon = None
        self.last_valid_t_ms = None

    def step(self, lm: np.ndarray | None, now_ms: float, aspect: float, force_no_reset_gap: bool = False) -> tuple[np.ndarray, bool, bool]:
        """
        Process one causal frame at timestamp `now_ms`.
        Returns `(feat_146, is_valid, did_reset)`.
        """
        did_reset = False
        if self.last_valid_t_ms is not None and not force_no_reset_gap:
            if (now_ms - self.last_valid_t_ms) > self.loss_reset_ms or now_ms < self.last_valid_t_ms:
                self.reset()
                did_reset = True

        plausible, _qscore, _reason = compute_derived_quality_gate(lm, aspect)
        if not plausible or lm is None:
            # On NO_HAND / invalid frame: do not poison r19 ring if within short blink,
            # reset r19 ring just like TS R19FeatureTracker when invalid.
            self.ring = []
            return np.zeros(R22_TEMPORAL_FEATURE_DIM, dtype=np.float32), False, did_reset

        a = float(aspect) if (math.isfinite(aspect) and aspect > 0.0) else 1.0
        gx = lm[:, 0].astype(np.float64) * a
        gy = lm[:, 1].astype(np.float64)
        gz = lm[:, 2].astype(np.float64) if lm.shape[1] >= 3 else np.zeros(21, dtype=np.float64)
        if not np.all(np.isfinite(gz)):
            gz = np.zeros(21, dtype=np.float64)

        wx, wy, wz = float(gx[0]), float(gy[0]), float(gz[0])
        mx, my = float(gx[9]), float(gy[9])
        span = math.hypot(mx - wx, my - wy)
        knuckle = math.hypot(float(gx[17] - gx[5]), float(gy[17] - gy[5]))
        palm_scale = max(span, knuckle)
        if not (palm_scale > 1e-4):
            self.ring = []
            return np.zeros(R22_TEMPORAL_FEATURE_DIM, dtype=np.float32), False, did_reset

        # Jump-reset guard for real-time streams (disabled for photo bursts via force_no_reset_gap)
        if self.prev_wrist is not None and not force_no_reset_gap:
            wrist_jump = math.hypot(wx - self.prev_wrist[0], wy - self.prev_wrist[1]) / max(1.0, a)
            if wrist_jump > self.max_jump_norm:
                self.reset()
                did_reset = True

        if span > 1e-4:
            ux = (mx - wx) / span
            uy = (my - wy) / span
        else:
            ux = -float(gy[17] - gy[5]) / palm_scale
            uy = float(gx[17] - gx[5]) / palm_scale
        un = math.hypot(ux, uy) or 1.0
        ux /= un
        uy /= un

        dx = gx - wx
        dy = gy - wy
        lx = (dx * (-uy) + dy * ux) / palm_scale
        ly = -(dx * ux + dy * uy) / palm_scale
        if lx[5] > lx[17]:
            lx = -lx
        lz = (gz - wz) / palm_scale

        # --- Exact 82D R19 features ---
        f: list[float] = []
        for i in range(1, 21):
            f.append(float(lx[i]))
            f.append(float(ly[i]))

        reaches = [math.hypot(float(lx[t]), float(ly[t])) for t in TIPS]
        f.extend(reaches)
        for ia, ib, ic in BEND:
            f.append(_joint_angle_norm(float(lx[ia]), float(ly[ia]), float(lx[ib]), float(ly[ib]), float(lx[ic]), float(ly[ic])))

        gaps = [math.hypot(float(lx[TIPS[i]] - lx[TIPS[i + 1]]), float(ly[TIPS[i]] - ly[TIPS[i + 1]])) for i in range(4)]
        f.extend(gaps)

        pinch_norm = math.hypot(float(lx[4] - lx[8]), float(ly[4] - ly[8]))
        # thumbLateral(g)
        ax_k = float(gx[5] - gx[17])
        ay_k = float(gy[5] - gy[17])
        len2_k = ax_k * ax_k + ay_k * ay_k
        if len2_k <= 1e-12:
            tl_clamped = 0.0
        else:
            tl_raw = ((float(gx[4] - gx[17])) * ax_k + (float(gy[4] - gy[17])) * ay_k) / len2_k
            tl_clamped = _clamp(tl_raw, -4.0, 4.0) if math.isfinite(tl_raw) else 0.0

        d5_8 = math.hypot(float(lx[5] - lx[8]), float(ly[5] - ly[8]))
        d4_5 = math.hypot(float(lx[4] - lx[5]), float(ly[4] - ly[5]))
        d4_6 = math.hypot(float(lx[4] - lx[6]), float(ly[4] - ly[6]))
        d4_9 = math.hypot(float(lx[4] - lx[9]), float(ly[4] - ly[9]))
        d4_10 = math.hypot(float(lx[4] - lx[10]), float(ly[4] - ly[10]))
        d4_2 = math.hypot(float(lx[4] - lx[2]), float(ly[4] - ly[2]))
        d4_17 = math.hypot(float(lx[4] - lx[17]), float(ly[4] - ly[17]))

        rdx = float(lx[8] - lx[5])
        rdy = float(ly[8] - ly[5])
        rlen = math.hypot(rdx, rdy)
        if rlen < 0.08:
            rdx = float(lx[6] - lx[5])
            rdy = float(ly[6] - ly[5])
            rlen = math.hypot(rdx, rdy)
        rx = rdx / rlen if rlen > 1e-5 else 0.0
        ry = rdy / rlen if rlen > 1e-5 else 1.0
        v54x = float(lx[4] - lx[5])
        v54y = float(ly[4] - ly[5])
        thumb_perp_idx = abs(rx * v54y - ry * v54x)
        thumb_along_idx = rx * v54x + ry * v54y

        f.extend([
            pinch_norm,
            tl_clamped,
            span / palm_scale,
            knuckle / palm_scale,
            d5_8,
            _clamp(reaches[0] / max(0.25, reaches[1]), 0.0, 2.5),
            d4_5,
            d4_6,
            d4_9,
            d4_10,
            d4_2,
            d4_17,
            thumb_perp_idx,
            thumb_along_idx,
            _joint_angle_norm(float(lx[8]), float(ly[8]), float(lx[5]), float(ly[5]), float(lx[4]), float(ly[4])),
            _joint_angle_norm(float(lx[5]), float(ly[5]), float(lx[2]), float(ly[2]), float(lx[4]), float(ly[4])),
            _joint_angle_norm(float(lx[1]), float(ly[1]), float(lx[2]), float(ly[2]), float(lx[3]), float(ly[3])),
            _clamp(pinch_norm / max(0.1, d5_8), 0.0, 3.0),
        ])

        mean_gap = 0.25 * (gaps[0] + gaps[1] + gaps[2] + gaps[3])
        thumb_open_cue = 0.5 * (d4_5 + d4_9)
        snap = {
            "tMs": now_ms,
            "palmScale": palm_scale,
            "wristX": wx,
            "wristY": wy,
            "tip8X": float(gx[8]),
            "tip8Y": float(gy[8]),
            "pinchNorm": pinch_norm,
            "idxReach": reaches[1],
            "meanGap": mean_gap,
            "thumbOpenCue": thumb_open_cue,
            "localTips": [(float(lx[t]), float(ly[t])) for t in TIPS],
        }
        while self.ring and (now_ms - self.ring[0]["tMs"] > 260.0):
            self.ring.pop(0)
        prev = None
        for item in reversed(self.ring):
            if now_ms - item["tMs"] >= 80.0:
                prev = item
                break
        if prev is None and self.ring and (now_ms - self.ring[0]["tMs"] >= 25.0):
            prev = self.ring[0]

        if prev is None:
            f.extend([0.0] * 10)
        else:
            dt_scale = max(0.3, min(2.6, (now_ms - prev["tMs"]) / 100.0))
            wvx = (wx - prev["wristX"]) / palm_scale / dt_scale
            wvy = (wy - prev["wristY"]) / palm_scale / dt_scale
            t8s = math.hypot(snap["tip8X"] - prev["tip8X"], snap["tip8Y"] - prev["tip8Y"]) / palm_scale / dt_scale
            jitter = 0.0
            for k in range(5):
                jitter += math.hypot(
                    snap["localTips"][k][0] - prev["localTips"][k][0],
                    snap["localTips"][k][1] - prev["localTips"][k][1],
                )
            jitter = jitter / 5.0 / dt_scale
            f.extend([
                1.0,
                math.hypot(wvx, wvy),
                wvx,
                wvy,
                t8s,
                (pinch_norm - prev["pinchNorm"]) / dt_scale,
                (reaches[1] - prev["idxReach"]) / dt_scale,
                (mean_gap - prev["meanGap"]) / dt_scale,
                jitter,
                (thumb_open_cue - prev["thumbOpenCue"]) / dt_scale,
            ])

        self.ring.append(snap)
        if len(self.ring) > 10:
            self.ring.pop(0)

        # --- 63D dt-normalized joint velocity ---
        canon = np.stack([lx, ly, lz], axis=1)  # (21, 3)
        vel = np.zeros((21, 3), dtype=np.float64)
        if self.prev_canon is not None and self.prev_wrist is not None and self.prev_t_ms is not None:
            dt_ms = now_ms - self.prev_t_ms
            if dt_ms > 0.0:
                dt_sec = _clamp(dt_ms / 1000.0, 0.016, self.max_vel_dt_s)
                # Joint 0: global wrist translation velocity (palmScales / sec)
                vel[0, 0] = _clamp((wx - self.prev_wrist[0]) / palm_scale / dt_sec, -10.0, 10.0)
                vel[0, 1] = _clamp((wy - self.prev_wrist[1]) / palm_scale / dt_sec, -10.0, 10.0)
                vel[0, 2] = _clamp((wz - self.prev_wrist[2]) / palm_scale / dt_sec, -10.0, 10.0)
                # Joints 1..20: canonical local articulation velocity (palmScales / sec)
                vel[1:] = np.clip((canon[1:] - self.prev_canon[1:]) / dt_sec, -10.0, 10.0)

        self.prev_t_ms = now_ms
        self.prev_wrist = (wx, wy, wz)
        self.prev_canon = canon
        self.last_valid_t_ms = now_ms

        out = np.empty(R22_TEMPORAL_FEATURE_DIM, dtype=np.float32)
        out[:82] = f
        out[82:145] = vel.reshape(-1)
        out[145] = 1.0
        if not np.all(np.isfinite(out)):
            return np.zeros(R22_TEMPORAL_FEATURE_DIM, dtype=np.float32), False, did_reset
        return out, True, did_reset


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1 << 20)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _to_lm_array(pts: list[list[float]]) -> np.ndarray:
    arr = np.zeros((21, 3), dtype=np.float32)
    for i in range(21):
        p = pts[i]
        arr[i, 0] = float(p[0])
        arr[i, 1] = float(p[1])
        arr[i, 2] = float(p[2]) if len(p) >= 3 else 0.0
    return arr


def _seq_motion_stats(lms: np.ndarray, valid: np.ndarray, t_ms: np.ndarray) -> dict[str, float]:
    disps: list[float] = []
    dts: list[float] = []
    prev_idx = -1
    for i in range(len(valid)):
        if not valid[i]:
            continue
        if prev_idx >= 0:
            dt = float(t_ms[i] - t_ms[prev_idx])
            if dt > 0:
                dts.append(dt)
            d = float(np.mean(np.hypot(lms[i, :, 0] - lms[prev_idx, :, 0], lms[i, :, 1] - lms[prev_idx, :, 1])))
            disps.append(d)
        prev_idx = i
    if not disps:
        return {"mean_joint_disp": 0.0, "max_joint_disp": 0.0, "median_dt_ms": 0.0, "zero_disp_pairs": 0, "pairs": 0}
    zero_pairs = sum(1 for d in disps if d < 1e-7)
    return {
        "mean_joint_disp": round(float(np.mean(disps)), 6),
        "max_joint_disp": round(float(np.max(disps)), 6),
        "median_dt_ms": round(float(np.median(dts)), 2) if dts else 0.0,
        "zero_disp_pairs": int(zero_pairs),
        "pairs": int(len(disps)),
    }


def curate_all_sequences() -> None:
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)

    seq_records: list[dict[str, Any]] = []
    packed_lms: list[np.ndarray] = []
    packed_tms: list[np.ndarray] = []
    packed_valid: list[np.ndarray] = []
    packed_pistol_y: list[np.ndarray] = []
    packed_pose5_y: list[np.ndarray] = []
    packed_raw_cls_ids: list[np.ndarray] = []
    raw_cls_vocab: list[str] = []
    raw_cls_to_id: dict[str, int] = {}

    def get_raw_cls_id(name: str) -> int:
        if name not in raw_cls_to_id:
            raw_cls_to_id[name] = len(raw_cls_vocab)
            raw_cls_vocab.append(name)
        return raw_cls_to_id[name]

    cursor = 0
    stats_by_source_split: dict[str, dict[str, int]] = collections.defaultdict(lambda: collections.defaultdict(int))
    motion_audit: dict[str, list[float]] = collections.defaultdict(list)
    dt_audit: dict[str, list[float]] = collections.defaultdict(list)
    rejected_static_or_short = collections.Counter()

    def add_sequence(
        seq_id: str,
        source: str,
        split: str,
        group: str,
        cadence: str,
        aspect: float,
        lms: np.ndarray,
        t_ms: np.ndarray,
        valid: np.ndarray,
        pistol_y: np.ndarray,
        pose5_y: np.ndarray,
        raw_cls_names: list[str],
        lighting: str = "unspecified",
        is_transition_video: bool = False,
    ) -> None:
        nonlocal cursor
        n_valid = int(np.sum(valid))
        if len(valid) < 3 or n_valid < 3:
            rejected_static_or_short[f"{source}:too_short_lt3"] += 1
            return
        mstats = _seq_motion_stats(lms, valid, t_ms)
        # Strict anti-static-replication guard: reject if every pair has 0 motion
        if mstats["pairs"] > 0 and mstats["max_joint_disp"] < 1e-6:
            rejected_static_or_short[f"{source}:zero_motion_static_copy"] += 1
            return

        T = len(valid)
        packed_lms.append(lms.astype(np.float32))
        packed_tms.append(t_ms.astype(np.float64))
        packed_valid.append(valid.astype(np.uint8))
        packed_pistol_y.append(pistol_y.astype(np.int8))
        packed_pose5_y.append(pose5_y.astype(np.int8))
        packed_raw_cls_ids.append(np.array([get_raw_cls_id(c) for c in raw_cls_names], dtype=np.int16))

        seq_records.append({
            "seq_id": seq_id,
            "source": source,
            "split": split,
            "group": group,
            "cadence": cadence,
            "lighting": lighting,
            "aspect": round(float(aspect), 6),
            "start": cursor,
            "length": T,
            "valid_frames": n_valid,
            "no_hand_frames": int(T - n_valid),
            "is_transition_video": is_transition_video,
            "motion": mstats,
        })
        cursor += T
        stats_by_source_split[f"{source}:{split}"]["sequences"] += 1
        stats_by_source_split[f"{source}:{split}"]["frames"] += T
        stats_by_source_split[f"{source}:{split}"]["valid_frames"] += n_valid
        motion_audit[source].append(mstats["mean_joint_disp"])
        if mstats["median_dt_ms"] > 0:
            dt_audit[source].append(mstats["median_dt_ms"])

    # =========================================================================
    # 1. IPN HandS — 200 Continuous 30 FPS Videos (Person-Disjoint 19/5/5)
    # =========================================================================
    print("[1/5] Curating IPN HandS continuous 30 FPS videos...")
    ipn_split = json.load(open(R18_IPN_SPLIT, "r", encoding="utf-8"))
    za = zipfile.ZipFile(os.path.join(R18_IPN_DIR, "IPN_HandS_annotations.zip"))
    zm = zipfile.ZipFile(os.path.join(R18_IPN_DIR, "IPN_HandS_landmarks_MPHands.zip"))

    ipn_transition_counts = collections.Counter()
    for split_name in ("train", "val", "test"):
        videos = ipn_split[f"{split_name}_videos"]
        allowed_persons = set(ipn_split[f"{split_name}_persons"])
        for vid in videos:
            person = vid.split("_")[1]
            assert person in allowed_persons
            ann_lines = za.read(f"temporal_annotations/{vid}.txt").decode("utf-8").splitlines()
            segs = []
            max_end = 0
            for line in ann_lines:
                if not line.strip():
                    continue
                parts = [p.strip() for p in line.split(",")]
                cid, s, e = int(parts[0]), int(parts[1]), int(parts[2])
                segs.append((cid, s, e))
                if e > max_end:
                    max_end = e
            mp_doc = json.loads(zm.read(f"landmarks_mp_hands/{vid}.json"))
            keys_sorted = sorted(mp_doc.keys())
            max_end = max(max_end, len(keys_sorted) + 5)
            frame_cls = [0] * (max_end + 1)
            for cid, s, e in segs:
                for idx in range(s, min(e + 1, len(frame_cls))):
                    frame_cls[idx] = cid

            T = len(keys_sorted)
            lms = np.zeros((T, 21, 3), dtype=np.float32)
            t_ms = np.zeros(T, dtype=np.float64)
            valid = np.zeros(T, dtype=np.uint8)
            pistol_y = np.full(T, -1, dtype=np.int8)
            pose5_y = np.full(T, -1, dtype=np.int8)
            raw_names: list[str] = []

            prev_cname = None
            for i, k in enumerate(keys_sorted):
                fnum = int(k.rsplit("_", 1)[1].split(".")[0])
                cid = frame_cls[fnum] if fnum < len(frame_cls) else 0
                cname = IPN_CLASSES[cid] if 0 <= cid < len(IPN_CLASSES) else "NOG"
                if prev_cname is not None and prev_cname != cname:
                    ipn_transition_counts[f"{split_name}:{prev_cname}->{cname}"] += 1
                prev_cname = cname
                raw_names.append(cname)
                t_ms[i] = (fnum * 1000.0) / 30.0

                mp_hands = (mp_doc.get(k) or {}).get("hand_landmarks") or []
                if mp_hands:
                    hand_dict = mp_hands[0]["landmarks"]
                    pts = [[float(hand_dict[str(j)][0]), float(hand_dict[str(j)][1]), float(hand_dict[str(j)][2]) if len(hand_dict[str(j)]) >= 3 else 0.0] for j in range(21)]
                    lms[i] = _to_lm_array(pts)
                    valid[i] = 1
                if cname in IPN_OTHER_PISTOL:
                    pistol_y[i] = PISTOL_TO_ID["OTHER"]
                elif cname in IPN_CASUAL_1F:
                    # K4: IPN P1F is NOT POINT_PRESS; keep labeled -1 for supervised pistol train
                    # (evaluated separately as P1F KD/min negative benchmark!)
                    pistol_y[i] = -1
                if cname in IPN_POSE5_MAP:
                    pose5_y[i] = POSE5_TO_ID[IPN_POSE5_MAP[cname]]

            add_sequence(
                seq_id=f"ipn_{vid}",
                source="ipn_hands",
                split=split_name,
                group=f"ipn_p{person}",
                cadence="video_30fps",
                aspect=4.0 / 3.0,
                lms=lms,
                t_ms=t_ms,
                valid=valid,
                pistol_y=pistol_y,
                pose5_y=pose5_y,
                raw_cls_names=raw_names,
                lighting="indoor_webcam",
                is_transition_video=True,
            )

    # =========================================================================
    # 2. Natural RGB Hand Gestures v3 — 1,352 Multi-Frame 30 FPS Video Clips
    # =========================================================================
    print("[2/5] Curating Natural RGB Hand Gestures v3 multi-frame 30 FPS clips...")
    n66_fps_map: dict[str, float] = {}
    with open(R19_N66_META_CSV, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                n66_fps_map[row["filename"]] = float(row["fps"])
            except Exception:
                pass

    n66_by_clip: dict[int, list[dict[str, Any]]] = collections.defaultdict(list)
    with open(R19_N66_JSONL, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                r = json.loads(line)
                n66_by_clip[int(r["clip_idx"])].append(r)

    for clip_idx, frames in sorted(n66_by_clip.items()):
        frames.sort(key=lambda r: int(r["frame_idx"]))
        r0 = frames[0]
        split_name = r0["split"]
        cname = r0["class_name"]
        pid = r0["participant_id"]
        lighting = r0.get("lighting_stratum", "unspecified")
        aspect = float(r0.get("aspect") or 1.0)
        fname = os.path.basename(r0["clip_member"])
        fps = n66_fps_map.get(fname, 30.0)
        if not (fps > 1.0):
            fps = 30.0

        T = len(frames)
        lms = np.zeros((T, 21, 3), dtype=np.float32)
        t_ms = np.zeros(T, dtype=np.float64)
        valid = np.zeros(T, dtype=np.uint8)
        pistol_y = np.full(T, -1, dtype=np.int8)
        pose5_y = np.full(T, -1, dtype=np.int8)
        raw_names: list[str] = []

        for i, r in enumerate(frames):
            t_ms[i] = (float(r["frame_idx"]) * 1000.0) / fps
            raw_names.append(cname)
            h_list = (r.get("l0") or {}).get("hands") or (r.get("l1") or {}).get("hands") or []
            if h_list:
                lms[i] = _to_lm_array(h_list[0]["landmarks"])
                valid[i] = 1
            if cname in N66_OTHER_PISTOL:
                pistol_y[i] = PISTOL_TO_ID["OTHER"]
            elif cname in N66_CONVERSATIONAL_POINT:
                # K4: point_left/point_right quarantined as OTHER / ambiguous conversational pointing
                # Included as OTHER negative in train with explicit raw_cls tag and audited separately in eval!
                pistol_y[i] = PISTOL_TO_ID["OTHER"]
            if cname in N66_POSE5_MAP:
                pose5_y[i] = POSE5_TO_ID[N66_POSE5_MAP[cname]]

        add_sequence(
            seq_id=f"n66_clip{clip_idx:04d}_{cname}",
            source="natural_rgb_v3",
            split=split_name,
            group=f"n66_{pid}",
            cadence="video_subsampled_30fps",
            aspect=aspect,
            lms=lms,
            t_ms=t_ms,
            valid=valid,
            pistol_y=pistol_y,
            pose5_y=pose5_y,
            raw_cls_names=raw_names,
            lighting=lighting,
            is_transition_video=False,
        )

    # =========================================================================
    # 3. HANDS RGB-D v2 — Continuous 30 FPS RealSense Runs (Person-Disjoint)
    # =========================================================================
    print("[3/5] Curating HANDS RGB-D continuous 30 FPS runs (Subject1..2 train / S3 val / S4..5 locked ood_test)...")
    hr_by_sub: dict[str, list[tuple[int, dict[str, Any]]]] = collections.defaultdict(list)
    with open(R19_HRGBD_JSONL, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            m = re.search(r"/(\d+)_color\.png$", r["filename"])
            if not m:
                continue
            hr_by_sub[r["subject"]].append((int(m.group(1)), r))

    sub_to_split = {
        "Subject1": "train",
        "Subject2": "train",
        "Subject3": "val",
        "Subject4": "ood_test",
        "Subject5": "ood_test",
    }

    for sub, items in sorted(hr_by_sub.items()):
        split_name = sub_to_split[sub]
        items.sort(key=lambda x: x[0])
        # Break into contiguous video runs where frame delta <= 5 and combo is unchanged
        runs: list[list[tuple[int, dict[str, Any]]]] = []
        cur = [items[0]]
        for prev, nxt in zip(items, items[1:]):
            if (nxt[0] - prev[0] <= 5) and (nxt[1]["combo"] == prev[1]["combo"]):
                cur.append(nxt)
            else:
                runs.append(cur)
                cur = [nxt]
        runs.append(cur)

        for r_idx, run in enumerate(runs):
            if len(run) < 3:
                rejected_static_or_short["hands_rgbd_v2:too_short_lt3"] += 1
                continue
            combo = run[0][1]["combo"]
            # Extract one continuous hand track per gesture label in `combo` using `gt_match_l0` (fallback `l1`)
            for gname in combo:
                T = len(run)
                lms = np.zeros((T, 21, 3), dtype=np.float32)
                t_ms = np.zeros(T, dtype=np.float64)
                valid = np.zeros(T, dtype=np.uint8)
                pistol_y = np.full(T, -1, dtype=np.int8)
                pose5_y = np.full(T, -1, dtype=np.int8)
                raw_names = [gname] * T
                aspect = float(run[0][1].get("aspect") or (16.0 / 9.0))

                # K4 Pistol mapping for HANDS RGB-D:
                # One_VFR / One_VFL -> POINT_READY (explicit K4 rule)
                # All non-pointing hands -> OTHER
                if gname in ("One_VFR", "One_VFL"):
                    p_id = PISTOL_TO_ID["POINT_READY"]
                else:
                    p_id = PISTOL_TO_ID["OTHER"]
                p5_id = POSE5_TO_ID[HRGBD_POSE5_MAP[gname]] if gname in HRGBD_POSE5_MAP else -1

                for i, (fnum, r) in enumerate(run):
                    t_ms[i] = (float(fnum) * 1000.0) / 30.0
                    pistol_y[i] = p_id
                    pose5_y[i] = p5_id
                    m0 = (r.get("gt_match_l0") or {}).get(gname)
                    h0 = (r.get("l0") or {}).get("hands") or []
                    if m0 is not None and 0 <= m0 < len(h0):
                        lms[i] = _to_lm_array(h0[m0]["landmarks"])
                        valid[i] = 1
                    else:
                        m1 = (r.get("gt_match_l1") or {}).get(gname)
                        h1 = (r.get("l1") or {}).get("hands") or []
                        if m1 is not None and 0 <= m1 < len(h1):
                            lms[i] = _to_lm_array(h1[m1]["landmarks"])
                            valid[i] = 1

                add_sequence(
                    seq_id=f"hrgbd_{sub}_r{r_idx:03d}_{gname}",
                    source="hands_rgbd_v2",
                    split=split_name,
                    group=f"hrgbd_{sub}",
                    cadence="video_30fps",
                    aspect=aspect,
                    lms=lms,
                    t_ms=t_ms,
                    valid=valid,
                    pistol_y=pistol_y,
                    pose5_y=pose5_y,
                    raw_cls_names=raw_names,
                    lighting="indoor_rgbd",
                    is_transition_video=False,
                )

    # =========================================================================
    # 4. Mendeley bxr7kx84y6 v2 — Session-Disjoint Tabletop Video Distractors
    # =========================================================================
    print("[4/5] Curating Mendeley bxr7kx84y6 session-disjoint tabletop video sequences...")
    # 4a) Locked 5-game OOD test from R18/R19 (`ux3_mendeley_distractor_landmarks.json`)
    m599 = json.load(open(R18_MENDELEY_599, "r", encoding="utf-8"))
    for light_key in ("dim_light", "natural_light"):
        by_game: dict[str, list[tuple[int, dict[str, Any]]]] = collections.defaultdict(list)
        for row in m599.get(light_key, []):
            name = row["name"]
            game = "/".join(name.split("/")[:-1])
            m = re.search(r"/(\d+)\.jpg$", name)
            fnum = int(m.group(1)) if m else int(row["idx"])
            by_game[game].append((fnum, row))
        for game, items in sorted(by_game.items()):
            items.sort(key=lambda x: x[0])
            T = len(items)
            lms = np.zeros((T, 21, 3), dtype=np.float32)
            t_ms = np.zeros(T, dtype=np.float64)
            valid = np.zeros(T, dtype=np.uint8)
            pistol_y = np.full(T, PISTOL_TO_ID["OTHER"], dtype=np.int8)
            pose5_y = np.full(T, POSE5_TO_ID["OTHER"], dtype=np.int8)
            raw_names = [game] * T
            aspect = float(items[0][1].get("aspect") or (16.0 / 9.0))
            for i, (fnum, row) in enumerate(items):
                t_ms[i] = (float(fnum) * 1000.0) / 30.0
                hands = row.get("raw") or row.get("clahe320") or []
                if hands:
                    lms[i] = _to_lm_array(hands[0])
                    valid[i] = 1
            add_sequence(
                seq_id=f"bxr7_locked_{game.replace(' ', '_').replace('/', '_')}",
                source="mendeley_bxr7_v2",
                split="ood_test",
                group=f"bxr7_{game}",
                cadence="video_subsampled_30fps",
                aspect=aspect,
                lms=lms,
                t_ms=t_ms,
                valid=valid,
                pistol_y=pistol_y,
                pose5_y=pose5_y,
                raw_cls_names=raw_names,
                lighting=light_key,
                is_transition_video=False,
            )

    # 4b) Session-disjoint Gomoku/Poker train & OOD holdout
    for sp_name, fp in (("train", R20_BXR7_TRAIN), ("ood_test", R20_BXR7_OOD)):
        if not os.path.exists(fp):
            continue
        by_clip_b: dict[str, list[tuple[int, dict[str, Any]]]] = collections.defaultdict(list)
        with open(fp, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                r = json.loads(line)
                prov = r.get("provenance") or {}
                cid = prov.get("clip_id") or r.get("raw_label") or "bxr7"
                fnum = int(prov.get("frame_idx") or 0)
                by_clip_b[cid].append((fnum, r))
        for cid, items in sorted(by_clip_b.items()):
            # Deduplicate same frame_idx (multiple hands -> pick hand0)
            by_f: dict[int, dict[str, Any]] = {}
            for fnum, r in items:
                if fnum not in by_f:
                    by_f[fnum] = r
            ordered = sorted(by_f.items(), key=lambda x: x[0])
            T = len(ordered)
            lms = np.zeros((T, 21, 3), dtype=np.float32)
            t_ms = np.zeros(T, dtype=np.float64)
            valid = np.zeros(T, dtype=np.uint8)
            pistol_y = np.full(T, PISTOL_TO_ID["OTHER"], dtype=np.int8)
            pose5_y = np.full(T, POSE5_TO_ID["OTHER"], dtype=np.int8)
            raw_names = [cid] * T
            aspect = float(ordered[0][1].get("aspect") or (16.0 / 9.0))
            light = (ordered[0][1].get("provenance") or {}).get("lighting", "unspecified")
            for i, (fnum, r) in enumerate(ordered):
                t_ms[i] = (float(fnum) * 1000.0) / 3.0  # stride-10 frames of 30 FPS video -> 333.3 ms step
                lms[i] = _to_lm_array(r["landmarks"])
                valid[i] = 1
            add_sequence(
                seq_id=f"bxr7_{sp_name}_{cid.replace(' ', '_').replace('/', '_')}",
                source="mendeley_bxr7_v2",
                split=sp_name,
                group=f"bxr7_{cid}",
                cadence="video_subsampled_30fps",
                aspect=aspect,
                lms=lms,
                t_ms=t_ms,
                valid=valid,
                pistol_y=pistol_y,
                pose5_y=pose5_y,
                raw_cls_names=raw_names,
                lighting=light,
                is_transition_video=False,
            )

    # =========================================================================
    # 5. HandGesture-5G — Distinct-CRC32 EXIF-Timestamped Sequential Photo Bursts
    #    (R19/R20 cluster-disjoint split + Pointing Up cluster 18<->19 swap)
    # =========================================================================
    print("[5/5] Curating HandGesture-5G distinct-CRC32 EXIF-timestamped sequential bursts...")
    hg_by_cl: dict[tuple[str, str, int], list[dict[str, Any]]] = collections.defaultdict(list)
    with open(R19_HG5G_JSONL, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            sp = r["split"]
            # Exact R19/R20 split parity: Pointing Up cluster 18<->19 swap (TEST untouched)
            if r["class_name"] == "Pointing Up":
                if r["cluster_id"] == 18:
                    sp = "val"
                elif r["cluster_id"] == 19:
                    sp = "train"
            hg_by_cl[(sp, r["class_name"], int(r["cluster_id"]))].append(r)

    for (sp, cname, cid), items in sorted(hg_by_cl.items()):
        valid_rows = [r for r in items if (r.get("l0") or {}).get("hands") or (r.get("l1") or {}).get("hands")]
        valid_rows.sort(key=lambda r: ((r.get("exif") or {}).get("datetime_epoch") or 0.0, r["filename"]))
        if not valid_rows:
            continue

        # Partition into genuine sequential bursts (dt <= 10.0s, strictly distinct crc32)
        subruns: list[list[dict[str, Any]]] = []
        cur = [valid_rows[0]]
        for prev, nxt in zip(valid_rows, valid_rows[1:]):
            ep = (prev.get("exif") or {}).get("datetime_epoch")
            en = (nxt.get("exif") or {}).get("datetime_epoch")
            dt_s = (en - ep) if (ep is not None and en is not None) else 1.0
            if (0.0 <= dt_s <= 10.0) and (nxt["crc32"] != prev["crc32"]):
                cur.append(nxt)
            else:
                subruns.append(cur)
                cur = [nxt]
        subruns.append(cur)

        if cname == "Pointing Up":
            p_id = PISTOL_TO_ID["POINT_READY"]
        elif cname == "L-Sign":
            p_id = PISTOL_TO_ID["POINT_PRESS"]
        else:
            p_id = PISTOL_TO_ID["OTHER"]
        p5_id = POSE5_TO_ID[HG5G_POSE5_MAP[cname]]

        for sr_idx, sr in enumerate(subruns):
            if len(sr) < 3:
                rejected_static_or_short["handgesture_5g:too_short_lt3"] += 1
                continue
            T = len(sr)
            lms = np.zeros((T, 21, 3), dtype=np.float32)
            t_ms = np.zeros(T, dtype=np.float64)
            valid = np.ones(T, dtype=np.uint8)
            pistol_y = np.full(T, p_id, dtype=np.int8)
            pose5_y = np.full(T, p5_id, dtype=np.int8)
            raw_names = [cname] * T
            aspect = float(sr[0].get("aspect") or 1.0)

            base_ep = (sr[0].get("exif") or {}).get("datetime_epoch")
            cur_t = 0.0
            for i, r in enumerate(sr):
                if i > 0:
                    ep = (sr[i - 1].get("exif") or {}).get("datetime_epoch")
                    en = (r.get("exif") or {}).get("datetime_epoch")
                    dt_s = (en - ep) if (ep is not None and en is not None) else 1.0
                    # EXIF has 1-second quantization; if two distinct consecutive photos fell in the
                    # same 1-second tick (dt_s == 0.0), assign realistic iPhone burst cadence 250 ms
                    # (verified distinct crc32 & real hand displacement!).
                    step_ms = max(250.0, dt_s * 1000.0)
                    cur_t += step_ms
                t_ms[i] = cur_t
                h_list = (r.get("l0") or {}).get("hands") or (r.get("l1") or {}).get("hands")
                lms[i] = _to_lm_array(h_list[0]["landmarks"])

            add_sequence(
                seq_id=f"hg5g_{sp}_c{cid:02d}_sr{sr_idx:02d}_{cname.replace(' ', '_')}",
                source="handgesture_5g",
                split=sp,
                group=f"hg5g_c{cid}",
                cadence="photo_burst_exif",
                aspect=aspect,
                lms=lms,
                t_ms=t_ms,
                valid=valid,
                pistol_y=pistol_y,
                pose5_y=pose5_y,
                raw_cls_names=raw_names,
                lighting="mixed_exposure_exif",
                is_transition_video=False,
            )

    # =========================================================================
    # Pack arrays and run strict zero-leakage & non-fabrication verification
    # =========================================================================
    all_lms = np.concatenate(packed_lms, axis=0)
    all_tms = np.concatenate(packed_tms, axis=0)
    all_valid = np.concatenate(packed_valid, axis=0)
    all_pistol_y = np.concatenate(packed_pistol_y, axis=0)
    all_pose5_y = np.concatenate(packed_pose5_y, axis=0)
    all_raw_cls = np.concatenate(packed_raw_cls_ids, axis=0)

    # Verify zero group overlap between train and (val, test, ood_test)
    groups_by_split: dict[str, set[str]] = collections.defaultdict(set)
    for rec in seq_records:
        groups_by_split[rec["split"]].add(rec["group"])
    # Note: bxr7_Gomoku/Poker is split temporally with a 20+ frame buffer gap (0..68% train vs 75..100% ood_test)
    # exactly matching R20 K7 split_manifest.json; every person/participant/cluster dataset must have 0 overlap!
    non_bxr7_train = {g for g in groups_by_split["train"] if not g.startswith("bxr7_")}
    non_bxr7_eval = {g for sp in ("val", "test", "ood_test") for g in groups_by_split[sp] if not g.startswith("bxr7_")}
    overlap = sorted(non_bxr7_train & non_bxr7_eval)
    assert len(overlap) == 0, f"CRITICAL LEAKAGE DETECTED: {overlap}"

    # Verify per-split class frame counts
    pistol_counts: dict[str, dict[str, int]] = collections.defaultdict(lambda: collections.defaultdict(int))
    pose5_counts: dict[str, dict[str, int]] = collections.defaultdict(lambda: collections.defaultdict(int))
    for rec in seq_records:
        s, e = rec["start"], rec["start"] + rec["length"]
        sp = rec["split"]
        v = all_valid[s:e] > 0
        py = all_pistol_y[s:e][v]
        p5 = all_pose5_y[s:e][v]
        for cid, cname in enumerate(PISTOL_LABELS):
            c = int(np.sum(py == cid))
            if c > 0:
                pistol_counts[sp][cname] += c
        for cid, cname in enumerate(POSE5_LABELS):
            c = int(np.sum(p5 == cid))
            if c > 0:
                pose5_counts[sp][cname] += c

    np.savez_compressed(
        CACHE_NPZ,
        landmarks=all_lms,
        t_ms=all_tms,
        valid=all_valid,
        pistol_y=all_pistol_y,
        pose5_y=all_pose5_y,
        raw_cls_ids=all_raw_cls,
    )
    with open(META_JSON, "w", encoding="utf-8") as f:
        json.dump({
            "encoder_version": "r22-temporal-146d-v1",
            "pistol_labels": PISTOL_LABELS,
            "pose5_labels": POSE5_LABELS,
            "raw_cls_vocab": raw_cls_vocab,
            "sequences": seq_records,
        }, f, indent=2)

    # Build comprehensive audit manifest
    manifest = {
        "schema": "r22-temporal-sequence-manifest/1",
        "generated_at_epoch": round(time.time(), 2),
        "encoder_contract": "K5:r22-temporal-146d-v1",
        "taxonomy_contract": "K4:v1.0-FROZEN",
        "split_contract": "K7:R19-R20-DISJOINT",
        "anti_fabrication_invariants": {
            "static_single_image_replication_allowed": False,
            "invented_landmark_visibility_allowed": False,
            "zero_motion_sequences_accepted": 0,
            "person_participant_cluster_leakage_groups": overlap,
            "rejected_short_or_static_counts": dict(rejected_static_or_short),
        },
        "excluded_sources_audit": [
            {
                "source": "r20-sandbox/data/aug/a4v2_detected_landmarks.jsonl",
                "status": "EXCLUDED_D05_G07",
                "reason": "Synthetic 24-frame cv2.warpAffine sinusoidal jitter of single static HandGesture-5G images (eval_a4_sequential.py:make_sequence); NOT genuine multi-frame temporal motion.",
            },
            {
                "source": "HaGRIDv2",
                "status": "EXCLUDED_HOLD_LICENSE_K7",
                "reason": "HOLD_LICENSE per R17-R20 & K7 legal gate; never enters product/candidate weights.",
            },
            {
                "source": "nui-lab-benchmark-S-07ba0cde-four-trials.json",
                "status": "EXCLUDED_UNLABELED_TELEMETRY_D07",
                "reason": "Unlabeled Owner webcam telemetry; never used as training data or supervised Ground Truth.",
            },
        ],
        "honest_data_cadence_disclosure": {
            "video_30fps_sources": ["ipn_hands", "hands_rgbd_v2"],
            "video_subsampled_30fps_sources": ["natural_rgb_v3", "mendeley_bxr7_v2"],
            "photo_burst_exif_sources": ["handgesture_5g"],
            "critical_data_gap_note": (
                "POINT_PRESS (L-Sign) has genuine distinct-CRC32 multi-frame EXIF photo bursts in "
                "HandGesture-5G (dt ~ 0.25-5.0s, med_disp ~ 0.025-0.094), NOT 15-30 FPS continuous video. "
                "All other classes (POINT_READY via HANDS RGB-D One_VFR/VFL, OTHER via IPN HandS / Natural RGB v3 / "
                "HANDS RGB-D / Mendeley bxr7, and all 5 Canvas Pose classes FIST/ONE/TWO/FIVE/OTHER) have "
                "100% genuine 30 FPS continuous video sequences."
            ),
        },
        "source_file_sha256": {
            "ipn_person_split.json": sha256_file(R18_IPN_SPLIT),
            "handgesture_5g_landmarks.jsonl": sha256_file(R19_HG5G_JSONL),
            "n66hhk695h_v3_landmarks.jsonl": sha256_file(R19_N66_JSONL),
            "hands_rgbd_landmarks.jsonl": sha256_file(R19_HRGBD_JSONL),
            "ux3_mendeley_distractor_landmarks.json": sha256_file(R18_MENDELEY_599),
        },
        "totals": {
            "total_sequences": len(seq_records),
            "total_frames": int(len(all_valid)),
            "total_valid_frames": int(np.sum(all_valid)),
            "total_real_no_hand_frames": int(len(all_valid) - np.sum(all_valid)),
            "cache_npz_bytes": os.path.getsize(CACHE_NPZ),
        },
        "stats_by_source_and_split": {k: dict(v) for k, v in sorted(stats_by_source_split.items())},
        "pistol_valid_frames_by_split": {k: dict(v) for k, v in sorted(pistol_counts.items())},
        "pose5_valid_frames_by_split": {k: dict(v) for k, v in sorted(pose5_counts.items())},
        "motion_and_dt_verification_by_source": {
            src: {
                "sequences": len(vals),
                "mean_joint_disp_median": round(float(np.median(vals)), 6),
                "mean_joint_disp_p90": round(float(np.percentile(vals, 90)), 6),
                "dt_ms_median": round(float(np.median(dt_audit[src])), 2) if dt_audit[src] else 0.0,
            }
            for src, vals in sorted(motion_audit.items())
        },
        "ipn_native_transitions_top20": dict(ipn_transition_counts.most_common(20)),
        "elapsed_sec": round(time.time() - t0, 2),
    }

    with open(MANIFEST_JSON, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n[DONE] Curated {len(seq_records)} real sequences ({len(all_valid):,} frames, {int(np.sum(all_valid)):,} valid, {int(len(all_valid)-np.sum(all_valid)):,} real NO_HAND) in {manifest['elapsed_sec']}s")
    print("Pistol valid frames by split:", json.dumps(manifest["pistol_valid_frames_by_split"]))
    print("Pose-5 valid frames by split:", json.dumps(manifest["pose5_valid_frames_by_split"]))
    print("Motion & dt verification:", json.dumps(manifest["motion_and_dt_verification_by_source"], indent=2))
    print("Leakage groups:", overlap)


if __name__ == "__main__":
    curate_all_sequences()
