#!/usr/bin/env python3
"""Shared MediaPipe HandLandmarker, exact R18 320px CLAHE port, luma, and geometry diagnostics."""
from __future__ import annotations

import math
import time
from typing import Any, Optional

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

TASK_PATH = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/public/models/hand_landmarker.task"

# Match src/camera/hand-config.ts and src/camera/frame-source.ts
NUM_HANDS = 2
MIN_DET_CONF = 0.6
MIN_PRES_CONF = 0.45
MIN_TRACK_CONF = 0.45
ENHANCE_WIDTH = 320
DARK_LUMA = 0.28
BACKLIGHT_CENTER_MAX = 0.36
BACKLIGHT_LUMA_GAP = 0.18


def pixel_luma(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.int32)
    g = rgb[..., 1].astype(np.int32)
    b = rgb[..., 2].astype(np.int32)
    return ((77 * r + 150 * g + 29 * b + 128) >> 8).astype(np.uint8)


def mean_luma(luma_plane: np.ndarray, step: int = 2) -> float:
    sub = luma_plane[::step, ::step]
    return float(sub.mean() / 255.0) if sub.size else 0.0


def center_luma(luma_plane: np.ndarray, step: int = 2) -> float:
    h, w = luma_plane.shape
    x0 = int(math.floor(w * 0.25))
    x1 = min(w, max(x0 + 1, int(math.ceil(w * 0.75))))
    y0 = int(math.floor(h * 0.20))
    y1 = min(h, max(y0 + 1, int(math.ceil(h * 0.85))))
    sub = luma_plane[y0:y1:step, x0:x1:step]
    return float(sub.mean() / 255.0) if sub.size else 0.0


def compute_luma_stats(rgb: np.ndarray) -> dict[str, Any]:
    h, w, _ = rgb.shape
    sh = max(1, int(round((ENHANCE_WIDTH * h) / w)))
    s320 = cv2.resize(rgb, (ENHANCE_WIDTH, sh), interpolation=cv2.INTER_LINEAR)
    lp = pixel_luma(s320)
    ml = mean_luma(lp, 2)
    cl = center_luma(lp, 2)
    is_backlight = (cl < BACKLIGHT_CENTER_MAX) and ((ml - cl) >= BACKLIGHT_LUMA_GAP)
    is_dark = (ml < DARK_LUMA) or is_backlight
    return {
        "scaled_320": s320,
        "mean_luma": round(ml, 5),
        "center_luma": round(cl, 5),
        "is_backlight": bool(is_backlight),
        "is_dark": bool(is_dark),
    }


def clahe_rgb_exact(rgb: np.ndarray, tiles_x: int = 8, tiles_y: int = 8, clip_limit: float = 2.0) -> np.ndarray:
    """Exact port of frontend/implementation/src/camera/clahe.ts (matching r18_ux0_c_mendeley.py)."""
    h, w, _ = rgb.shape
    tx = max(1, min(tiles_x, w))
    ty = max(1, min(tiles_y, h))
    luma = pixel_luma(rgb)
    lut = np.zeros((ty, tx, 256), dtype=np.uint8)
    for tyi in range(ty):
        y0 = (tyi * h) // ty
        y1 = ((tyi + 1) * h) // ty
        for txi in range(tx):
            x0 = (txi * w) // tx
            x1 = ((txi + 1) * w) // tx
            tile = luma[y0:y1, x0:x1]
            hist = np.bincount(tile.ravel(), minlength=256).astype(np.int64)
            area = tile.size
            limit = max(1, int((clip_limit * area) // 256))
            excess = int(np.maximum(hist - limit, 0).sum())
            hist = np.minimum(hist, limit)
            batch = excess // 256
            residual = excess % 256
            hist += batch
            if residual > 0:
                step = max(1, 256 // residual)
                left = residual
                for b in range(0, 256, step):
                    if left <= 0:
                        break
                    hist[b] += 1
                    left -= 1
            before = np.cumsum(hist) - hist
            mapped = np.rint(((before + hist / 2.0) * 255.0) / area).astype(np.int32)
            lut[tyi, txi] = np.clip(mapped, 0, 255).astype(np.uint8)

    def axis_map(size: int, tiles: int):
        f = ((np.arange(size) + 0.5) * tiles) / size - 0.5
        lo = np.floor(f).astype(np.int32)
        wgt = f - lo
        lo_mask_low = lo < 0
        lo_mask_hi = lo >= tiles - 1
        lo = np.where(lo_mask_low, 0, np.where(lo_mask_hi, tiles - 1, lo))
        wgt = np.where(lo_mask_low | lo_mask_hi, 0.0, wgt)
        hi = np.minimum(lo + 1, tiles - 1)
        return lo, hi, wgt

    xa, xb, wx = axis_map(w, tx)
    ya, yb, wy = axis_map(h, ty)

    l00 = lut[ya[:, None], xa[None, :], luma]
    l01 = lut[ya[:, None], xb[None, :], luma]
    l10 = lut[yb[:, None], xa[None, :], luma]
    l11 = lut[yb[:, None], xb[None, :], luma]
    top = l00 + (l01.astype(np.float32) - l00) * wx[None, :]
    bot = l10 + (l11.astype(np.float32) - l10) * wx[None, :]
    mapped_luma = np.rint(top + (bot - top) * wy[:, None]).astype(np.int32)
    delta = mapped_luma - luma.astype(np.int32)
    return np.clip(rgb.astype(np.int32) + delta[..., None], 0, 255).astype(np.uint8)


def build_landmarker(mode: str = "IMAGE"):
    rm = mp_vision.RunningMode.VIDEO if mode == "VIDEO" else mp_vision.RunningMode.IMAGE
    opts = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=TASK_PATH),
        running_mode=rm,
        num_hands=NUM_HANDS,
        min_hand_detection_confidence=MIN_DET_CONF,
        min_hand_presence_confidence=MIN_PRES_CONF,
        min_tracking_confidence=MIN_TRACK_CONF,
    )
    return mp_vision.HandLandmarker.create_from_options(opts)


def extract_mp_result(res, aspect: float) -> dict[str, Any]:
    """Serialize MediaPipe HandLandmarkerResult cleanly with geometry/thumb/palm-dorsal diagnostics."""
    hands_lm = res.hand_landmarks or []
    hands_world = getattr(res, "hand_world_landmarks", None) or []
    handedness = getattr(res, "handedness", None) or []
    out_hands = []
    for idx, lm in enumerate(hands_lm):
        pts = [[round(float(p.x), 5), round(float(p.y), 5), round(float(p.z), 5)] for p in lm]
        wpts = (
            [[round(float(p.x), 5), round(float(p.y), 5), round(float(p.z), 5)] for p in hands_world[idx]]
            if idx < len(hands_world)
            else None
        )
        hd_label = None
        hd_score = None
        if idx < len(handedness) and handedness[idx]:
            cat = handedness[idx][0]
            hd_label = getattr(cat, "category_name", None) or getattr(cat, "display_name", None)
            hd_score = round(float(getattr(cat, "score", 0.0)), 4)

        geom = compute_hand_geometry(lm, aspect, hd_label)
        out_hands.append(
            {
                "handedness": hd_label,
                "handedness_score": hd_score,
                "landmarks": pts,
                "world_landmarks": wpts,
                "geom": geom,
            }
        )
    return {
        "n_hands": len(out_hands),
        "hands": out_hands,
    }


def _dist2(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _angle_deg(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    ax, ay = a[0] - b[0], a[1] - b[1]
    bx, by = c[0] - b[0], c[1] - b[1]
    denom = math.hypot(ax, ay) * math.hypot(bx, by)
    if denom <= 1e-9:
        return 0.0
    cos_v = max(-1.0, min(1.0, (ax * bx + ay * by) / denom))
    return math.degrees(math.acos(cos_v))


def compute_hand_geometry(lm, aspect: float, handedness_label: Optional[str]) -> dict[str, Any]:
    """Compute aspect-corrected and raw thumb/finger/palm-dorsal diagnostics matching hand-gesture.ts."""
    raw = [(float(p.x), float(p.y), float(p.z)) for p in lm]
    asp = aspect if (math.isfinite(aspect) and aspect > 0) else 1.0
    cor = [(x * asp, y, z) for (x, y, z) in raw]

    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    bbox_w = max(xs) - min(xs)
    bbox_h = max(ys) - min(ys)
    hand_size = max(bbox_w, bbox_h)

    span_raw = _dist2(raw[0][:2], raw[9][:2])
    span_cor = _dist2(cor[0][:2], cor[9][:2])
    knuckle_cor = _dist2(cor[5][:2], cor[17][:2])
    palm_scale_cor = max(span_cor, knuckle_cor, 1e-6)

    # Legacy raw thumb ratio & robust lateral projection (exact match to hand-gesture.ts)
    ip_gap_raw = _dist2(raw[3][:2], raw[5][:2])
    legacy_ratio = _dist2(raw[4][:2], raw[5][:2]) / ip_gap_raw if ip_gap_raw > 1e-9 else 0.0

    ax = cor[5][0] - cor[17][0]
    ay = cor[5][1] - cor[17][1]
    len2 = ax * ax + ay * ay
    thumb_lateral = (
        ((cor[4][0] - cor[17][0]) * ax + (cor[4][1] - cor[17][1]) * ay) / len2
        if len2 > 1e-12
        else None
    )

    # Normalized thumb distances and angles in aspect-corrected space
    thumb_ip_angle = _angle_deg(cor[2][:2], cor[3][:2], cor[4][:2])
    thumb_mcp_angle = _angle_deg(cor[1][:2], cor[2][:2], cor[3][:2])
    thumb_to_index_mcp_norm = _dist2(cor[4][:2], cor[5][:2]) / palm_scale_cor
    thumb_to_index_pip_norm = _dist2(cor[4][:2], cor[6][:2]) / palm_scale_cor
    thumb_to_index_tip_norm = _dist2(cor[4][:2], cor[8][:2]) / palm_scale_cor
    thumb_lift_norm = (cor[2][1] - cor[4][1]) / max(span_cor, 1e-6)

    # Finger tip/pip wrist ratios (raw and aspect-corrected)
    finger_names = ["index", "middle", "ring", "pinky"]
    tips = [8, 12, 16, 20]
    pips = [6, 10, 14, 18]
    mcps = [5, 9, 13, 17]
    finger_ratios_raw = {}
    finger_ratios_cor = {}
    finger_pip_angles = {}
    for nm, t_i, p_i, m_i in zip(finger_names, tips, pips, mcps):
        pw_r = _dist2(raw[p_i][:2], raw[0][:2])
        tw_r = _dist2(raw[t_i][:2], raw[0][:2])
        finger_ratios_raw[nm] = round(tw_r / pw_r, 4) if pw_r > 1e-9 else 0.0

        pw_c = _dist2(cor[p_i][:2], cor[0][:2])
        tw_c = _dist2(cor[t_i][:2], cor[0][:2])
        finger_ratios_cor[nm] = round(tw_c / pw_c, 4) if pw_c > 1e-9 else 0.0
        finger_pip_angles[nm] = round(_angle_deg(cor[m_i][:2], cor[p_i][:2], cor[t_i][:2]), 2)

    # 2D palm winding cross product: (0->5) x (0->17) in image coords (x right, y down)
    v5x, v5y = cor[5][0] - cor[0][0], cor[5][1] - cor[0][1]
    v17x, v17y = cor[17][0] - cor[0][0], cor[17][1] - cor[0][1]
    palm_cross_z = v5x * v17y - v5y * v17x
    # Normalize by ||0->5|| * ||0->17||
    denom_c = math.hypot(v5x, v5y) * math.hypot(v17x, v17y)
    palm_cross_sin = palm_cross_z / denom_c if denom_c > 1e-9 else 0.0

    # Note: MediaPipe Image handedness assumes un-mirrored camera image where "Right" means person's right hand.
    # For a person's Right hand facing camera with palm toward camera (fingers up), 0->5 (left in img) x 0->17 (right in img):
    # v5=(-0.1, -0.3), v17=(+0.1, -0.3) -> cross = (-0.1)(-0.3) - (-0.3)(0.1) = +0.06 > 0!
    # Wait: if dorsal faces camera (fingers up, right hand), thumb/index are on right (+0.1), pinky on left (-0.1) -> cross < 0!
    # For Left hand: palm facing camera -> thumb/index on right (+0.1), pinky on left (-0.1) -> cross < 0; dorsal > 0!
    # Let's store raw palm_cross_sin AND signed facing indicator (sign * (+1 if Right else -1)) so downstream can verify visually!
    facing_sign = None
    if handedness_label == "Right":
        facing_sign = 1.0 if palm_cross_sin >= 0 else -1.0
    elif handedness_label == "Left":
        facing_sign = 1.0 if palm_cross_sin <= 0 else -1.0

    # Index pointing angle (aspect-corrected, degrees, 0=right, 90=up, +-180=left, -90=down, matching gameplay-gesture.ts)
    idx_dx = cor[8][0] - cor[5][0]
    idx_dy = cor[5][1] - cor[8][1]
    idx_angle_cor = round(math.degrees(math.atan2(idx_dy, idx_dx)), 2) if math.hypot(idx_dx, idx_dy) > 1e-6 else None

    return {
        "hand_size": round(hand_size, 4),
        "span_raw": round(span_raw, 4),
        "palm_scale_cor": round(palm_scale_cor, 4),
        "legacy_thumb_ratio": round(legacy_ratio, 4),
        "thumb_lateral": round(thumb_lateral, 4) if thumb_lateral is not None else None,
        "thumb_ip_angle_deg": round(thumb_ip_angle, 2),
        "thumb_mcp_angle_deg": round(thumb_mcp_angle, 2),
        "thumb_to_index_mcp_norm": round(thumb_to_index_mcp_norm, 4),
        "thumb_to_index_pip_norm": round(thumb_to_index_pip_norm, 4),
        "thumb_to_index_tip_norm": round(thumb_to_index_tip_norm, 4),
        "thumb_lift_norm": round(thumb_lift_norm, 4),
        "finger_ratios_raw": finger_ratios_raw,
        "finger_ratios_cor": finger_ratios_cor,
        "finger_pip_angles_deg": finger_pip_angles,
        "palm_cross_sin": round(palm_cross_sin, 4),
        "facing_indicator": facing_sign,  # Note: verify sign convention empirically via visual contact sheet!
        "index_angle_cor_deg": idx_angle_cor,
    }


def detect_l0_l1(
    rgb: np.ndarray,
    det_l0,
    det_l1,
    run_l1_always: bool = False,
) -> dict[str, Any]:
    """Run L0 RAW and optionally L1 320px CLAHE (always or only on L0 miss)."""
    h, w, _ = rgb.shape
    aspect = w / max(1, h)
    luma_info = compute_luma_stats(rgb)

    t0 = time.perf_counter()
    mp_raw = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
    res_l0 = det_l0.detect(mp_raw)
    l0_ms = (time.perf_counter() - t0) * 1000.0
    l0_parsed = extract_mp_result(res_l0, aspect)

    l1_parsed: Optional[dict[str, Any]] = None
    l1_ms: Optional[float] = None
    clahe_ms: Optional[float] = None

    if run_l1_always or l0_parsed["n_hands"] == 0:
        tc = time.perf_counter()
        c320 = clahe_rgb_exact(luma_info["scaled_320"])
        clahe_ms = (time.perf_counter() - tc) * 1000.0
        t1 = time.perf_counter()
        mp_c = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c320))
        res_l1 = det_l1.detect(mp_c)
        l1_ms = (time.perf_counter() - t1) * 1000.0
        l1_parsed = extract_mp_result(res_l1, aspect)

    return {
        "width": int(w),
        "height": int(h),
        "aspect": round(aspect, 5),
        "mean_luma": luma_info["mean_luma"],
        "center_luma": luma_info["center_luma"],
        "is_backlight": luma_info["is_backlight"],
        "is_dark": luma_info["is_dark"],
        "l0": l0_parsed,
        "l0_ms": round(l0_ms, 3),
        "l1": l1_parsed,
        "l1_ms": round(l1_ms, 3) if l1_ms is not None else None,
        "clahe_ms": round(clahe_ms, 3) if clahe_ms is not None else None,
    }
