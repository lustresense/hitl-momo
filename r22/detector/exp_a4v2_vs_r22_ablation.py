#!/usr/bin/env python3
"""
R22 Same-Frame Preprocessing, Glare/Blur/Noise Quality & ROI Mask/Crop Ablation (`exp_a4v2_vs_r22_ablation.py`).

Acceptance IDs: P01, P02, P03, P04, P05, P06, P09, O03, G05.

Evaluates on IDENTICAL input frames across:
  - Normal lighting (T2 activation threshold audit: legacy 0.52 vs calibrated 0.32; HandGesture-5G + physical natural_light_1)
  - Dim lighting (HandGesture-5G sequential dim strata + physical mendeley_bxr7kx84y6 dim_light_1)
  - Monitor glare (dark room with wall chroma noise + monitor-lit bright hand highlights > 0.78)
  - Motion blur (blurProxy calibration & detection fail-safe degradation)
  - 2-hand bystander crossing + far/small hand ROI Crop/Remap vs ROI Mask vs FullFrame (metamorphic transform O03 + P09 bystander visibility)
"""
from __future__ import annotations

import collections
import json
import math
import os
import sys
import time
import zipfile
from typing import Any

import cv2
import mediapipe as mp
import numpy as np

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/research-can/r20/scripts")
from augment_hg5g import AUGS, CACHE, motion_blur, select_cohort_rows, train_rows  # noqa: E402
from eval_a4_sequential import FRAME_MS, HIT_RADIUS, N_FRAMES, hand_center, is_correct, make_sequence  # noqa: E402
from mp_common import build_landmarker, compute_luma_stats, extract_mp_result, pixel_luma  # noqa: E402

R18_SANDBOX = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox"
OUT_JSON = "/srv/sketchbook/mediapipe-optimize/research-can/r22/detector/r22_preprocessing_ablation.json"

R20_LEGACY_DIM_LUMA = 0.52
R22_CALIBRATED_DIM_LUMA = 0.32
R22_BLUR_WARN_MIN = 40.0


# ---------------------------------------------------------------- exact Python mirrors of r20-lowlight.ts
def analyze_frame_luma_py(
    rgb: np.ndarray,
    hand_roi: tuple[float, float, float, float] | None = None,
    dim_threshold: float = R22_CALIBRATED_DIM_LUMA,
    step: int = 2,
) -> dict[str, Any]:
    h, w = rgb.shape[:2]
    sh = max(1, int(round((320 * h) / max(1, w))))
    s320 = cv2.resize(rgb, (320, sh), interpolation=cv2.INTER_AREA) if w != 320 else rgb
    lp = pixel_luma(s320).astype(np.int32)
    sub = lp[::step, ::step]
    mean_luma = float(sub.mean() / 255.0) if sub.size else 0.0

    x0 = int(math.floor(320 * 0.25))
    x1 = min(320, max(x0 + 1, int(math.ceil(320 * 0.75))))
    y0 = int(math.floor(sh * 0.20))
    y1 = min(sh, max(y0 + 1, int(math.ceil(sh * 0.85))))
    csub = lp[y0:y1:step, x0:x1:step]
    center_luma = float(csub.mean() / 255.0) if csub.size else 0.0

    p10, p50, p95 = (np.percentile(sub, [10, 50, 95]) / 255.0).tolist() if sub.size else (0.0, 0.0, 0.0)

    near_white_pct = None
    if hand_roi is not None:
        rx0 = max(0, min(320 - 1, int(math.floor(hand_roi[0] * 320))))
        rx1 = max(rx0 + 1, min(320, int(math.ceil(hand_roi[2] * 320))))
        ry0 = max(0, min(sh - 1, int(math.floor(hand_roi[1] * sh))))
        ry1 = max(ry0 + 1, min(sh, int(math.ceil(hand_roi[3] * sh))))
        roi_lp = lp[ry0:ry1, rx0:rx1]
        if roi_lp.size:
            near_white_pct = round(float((roi_lp >= 250).mean() * 100.0), 2)

    if sh >= 3 and 320 >= 3:
        center = lp[1:-1:step, 1:-1:step]
        left = lp[1:-1:step, :-2:step]
        right = lp[1:-1:step, 2::step]
        up = lp[:-2:step, 1:-1:step]
        down = lp[2::step, 1:-1:step]
        mh = min(center.shape[0], left.shape[0], right.shape[0], up.shape[0], down.shape[0])
        mw = min(center.shape[1], left.shape[1], right.shape[1], up.shape[1], down.shape[1])
        lap = 4 * center[:mh, :mw] - left[:mh, :mw] - right[:mh, :mw] - up[:mh, :mw] - down[:mh, :mw]
        blur_proxy = float(np.var(lap)) if lap.size else 0.0
        noise_proxy = float(np.median(np.abs(lap)) * 0.3315) if lap.size else 0.0
    else:
        blur_proxy = 0.0
        noise_proxy = 0.0

    is_backlight = (center_luma < 0.36) and ((mean_luma - center_luma) >= 0.18)
    is_dark = (mean_luma < 0.28) or is_backlight
    is_glare_risk = (p95 >= 0.94) or (near_white_pct is not None and near_white_pct >= 8.0)
    is_blurry = blur_proxy < R22_BLUR_WARN_MIN
    should_activate = (mean_luma < dim_threshold) or is_backlight
    return {
        "meanLuma": round(mean_luma, 4),
        "centerLuma": round(center_luma, 4),
        "p10": round(float(p10), 4),
        "p50": round(float(p50), 4),
        "p95": round(float(p95), 4),
        "nearWhiteHandPct": near_white_pct,
        "blurProxy": round(blur_proxy, 2),
        "noiseProxy": round(noise_proxy, 2),
        "isDark": bool(is_dark),
        "isBacklight": bool(is_backlight),
        "isGlareRisk": bool(is_glare_risk),
        "isBlurry": bool(is_blurry),
        "shouldActivateDimRecovery": bool(should_activate),
    }


def sep_median5_rgb(rgb: np.ndarray) -> np.ndarray:
    a = np.pad(rgb, ((0, 0), (2, 2), (0, 0)), mode="edge")
    hmed = np.median(np.stack([a[:, :-4], a[:, 1:-3], a[:, 2:-2], a[:, 3:-1], a[:, 4:]], axis=0), axis=0).astype(np.uint8)
    b = np.pad(hmed, ((2, 2), (0, 0), (0, 0)), mode="edge")
    return np.median(np.stack([b[:-4], b[1:-3], b[2:-2], b[3:-1], b[4:]], axis=0), axis=0).astype(np.uint8)


def motion_gated_ema(curr: np.ndarray, prev: np.ndarray | None, thresh: int = 24) -> tuple[np.ndarray, np.ndarray]:
    if prev is None or prev.shape != curr.shape:
        cp = curr.copy()
        return cp, cp.copy()
    diff = np.abs(curr.astype(np.int16) - prev.astype(np.int16))
    still = (diff[..., 0] < thresh) & (diff[..., 1] < thresh) & (diff[..., 2] < thresh)
    blended = ((curr.astype(np.int16) * 3 + prev.astype(np.int16) * 5 + 4) >> 3).astype(np.uint8)
    out = np.where(still[..., None], blended, curr)
    return out, out.copy()


def suppress_shadow_chroma_noise(rgb: np.ndarray, max_luma_norm: float = 0.045, strength: float = 0.65) -> np.ndarray:
    max_byte = max(1, int(round(max_luma_norm * 255)))
    l = pixel_luma(rgb).astype(np.float32)
    mask = l < max_byte
    if not np.any(mask):
        return rgb
    w = np.where(mask, strength * (1.0 - l / max_byte), 0.0)[..., None]
    out = np.rint(rgb.astype(np.float32) + w * (l[..., None] - rgb.astype(np.float32)))
    return np.clip(out, 0, 255).astype(np.uint8)


def apply_highlight_soft_knee(rgb: np.ndarray, knee_start: float = 0.78, knee_ceiling: float = 0.94) -> np.ndarray:
    headroom = 1.0 - knee_start
    target_headroom = knee_ceiling - knee_start
    knee_byte = int(math.floor(knee_start * 255))
    scale_lut = np.ones(256, dtype=np.float32)
    c = headroom / target_headroom - 1.0
    for i in range(knee_byte + 1, 256):
        x = i / 255.0
        u = (x - knee_start) / headroom
        s = u / (1.0 + c * u)
        y = knee_start + target_headroom * s
        scale_lut[i] = y / x
    peak = rgb.max(axis=2)
    sc = scale_lut[peak][..., None]
    return np.clip(np.rint(rgb.astype(np.float32) * sc), 0, 255).astype(np.uint8)


def reinhard_lut(rgb: np.ndarray, mean_l: float, target: float = 0.48) -> np.ndarray:
    m = max(mean_l, 0.015)
    k = float(np.clip(target / m, 1.0, 14.0))
    if k <= 1.04:
        return rgb
    x = np.arange(256, dtype=np.float32) / 255.0
    y = (k * x) / (1.0 + (k - 1.0) * x)
    lut = np.rint(np.clip(y, 0.0, 1.0) * 255.0).astype(np.uint8)
    return lut[rgb]


def reinhard_with_soft_knee(
    rgb: np.ndarray,
    mean_l: float,
    target: float = 0.48,
    knee_start: float = 0.78,
    knee_ceiling: float = 0.94,
) -> np.ndarray:
    m = max(mean_l, 0.015)
    k = float(np.clip(target / m, 1.0, 14.0))
    if k <= 1.04:
        return apply_highlight_soft_knee(rgb, knee_start, knee_ceiling)
    headroom = 1.0 - knee_start
    target_headroom = knee_ceiling - knee_start
    c = headroom / target_headroom - 1.0 if headroom > 1e-6 else 0.0
    lut = np.zeros(256, dtype=np.uint8)
    for i in range(256):
        x = i / 255.0
        y_raw = (k * x) / (1.0 + (k - 1.0) * x)
        y = y_raw
        if y_raw > knee_start and headroom > 1e-6:
            u = (y_raw - knee_start) / headroom
            s = u / (1.0 + c * u)
            y = knee_start + target_headroom * s
        lut[i] = int(np.clip(round(y * 255.0), 0, 255))
    return lut[rgb]


def apply_a4v2(s320: np.ndarray, mean_l: float, prev: np.ndarray | None) -> tuple[np.ndarray, np.ndarray]:
    ema_out, next_prev = motion_gated_ema(s320, prev, 24)
    med = sep_median5_rgb(ema_out)
    if mean_l < 0.14:
        med = cv2.GaussianBlur(med, (3, 3), 0.75)
    return reinhard_lut(med, mean_l, 0.48), next_prev


def apply_r22_softknee_shadowclamp(s320: np.ndarray, mean_l: float, prev: np.ndarray | None) -> tuple[np.ndarray, np.ndarray]:
    work = suppress_shadow_chroma_noise(s320, 0.045, 0.65)
    ema_out, next_prev = motion_gated_ema(work, prev, 24)
    med = sep_median5_rgb(ema_out)
    if mean_l < 0.14:
        med = cv2.GaussianBlur(med, (3, 3), 0.75)
    return reinhard_with_soft_knee(med, mean_l, 0.48, 0.78, 0.94), next_prev


def resize_320(rgb: np.ndarray) -> np.ndarray:
    h, w = rgb.shape[:2]
    sh = max(1, int(round((320 * h) / max(1, w))))
    return cv2.resize(rgb, (320, sh), interpolation=cv2.INTER_AREA)


def mp_detect(det, rgb: np.ndarray, ts_ms: int | None = None) -> dict[str, Any]:
    h, w = rgb.shape[:2]
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
    raw = det.detect_for_video(img, ts_ms) if ts_ms is not None else det.detect(img)
    return extract_mp_result(raw, w / max(1, h))


def bbox_from_lm(lm: list[list[float]], pad: float = 0.05) -> tuple[float, float, float, float]:
    xs = [p[0] for p in lm]
    ys = [p[1] for p in lm]
    return (
        max(0.0, min(xs) - pad),
        max(0.0, min(ys) - pad),
        min(1.0, max(xs) + pad),
        min(1.0, max(ys) + pad),
    )


def map_crop_landmarks_to_full_frame(
    lm: list[list[float]],
    crop_norm: tuple[float, float, float, float],
) -> list[list[float]]:
    x0, y0, x1, y1 = crop_norm
    cw = max(1e-6, x1 - x0)
    ch = max(1e-6, y1 - y0)
    return [[x0 + p[0] * cw, y0 + p[1] * ch, p[2]] for p in lm]


def run_policy_sequence(
    frames: list[np.ndarray],
    policy: str,
    dim_threshold: float,
    ref_center: tuple[float, float] | None,
    hand_roi_for_diag: tuple[float, float, float, float] | None = None,
) -> dict[str, Any]:
    det = build_landmarker("VIDEO")
    ts = 0
    misses = 0
    recovery_worked = False
    temporal_prev = None
    last_diag = None
    hits = 0
    pre_ms_list: list[float] = []
    det_ms_list: list[float] = []
    passes = collections.Counter()
    near_white_post: list[float] = []
    dark_wall_false_skin: list[float] = []

    for k, f in enumerate(frames):
        ts += FRAME_MS
        if last_diag is None or k % 12 == 0:
            last_diag = analyze_frame_luma_py(f, hand_roi=hand_roi_for_diag, dim_threshold=dim_threshold)
        mean_l = last_diag["meanLuma"]
        is_dim = last_diag["shouldActivateDimRecovery"]

        t_p0 = time.perf_counter()
        if policy == "RAW":
            inp = f
            pass_name = "A0_raw"
            pre_ms = 0.0
        elif policy in ("A4v2_052", "A4v2_032"):
            enhance = is_dim and (recovery_worked or misses >= 1)
            if enhance:
                s320 = resize_320(f)
                inp, temporal_prev = apply_a4v2(s320, mean_l, temporal_prev)
                pass_name = "A4_denoise_reinhard320"
            else:
                if is_dim:
                    temporal_prev = resize_320(f)
                else:
                    temporal_prev = None
                inp = f
                pass_name = "A0_raw"
            pre_ms = (time.perf_counter() - t_p0) * 1000.0
        elif policy == "R22_SoftKnee_ShadowClamp":
            enhance = is_dim and (recovery_worked or misses >= 1)
            if enhance:
                s320 = resize_320(f)
                inp, temporal_prev = apply_r22_softknee_shadowclamp(s320, mean_l, temporal_prev)
                pass_name = "R22_softknee_shadowclamp320"
            else:
                if is_dim:
                    temporal_prev = resize_320(f)
                else:
                    temporal_prev = None
                inp = f
                pass_name = "A0_raw"
            pre_ms = (time.perf_counter() - t_p0) * 1000.0
        elif policy == "R22_Always_On_320":
            # Forced on for direct pixel-quality comparison in monitor-glare & dark-wall tests
            s320 = resize_320(f)
            inp, temporal_prev = apply_r22_softknee_shadowclamp(s320, mean_l, temporal_prev)
            pass_name = "R22_softknee_shadowclamp320"
            pre_ms = (time.perf_counter() - t_p0) * 1000.0
        elif policy == "A4v2_Always_On_320":
            s320 = resize_320(f)
            inp, temporal_prev = apply_a4v2(s320, mean_l, temporal_prev)
            pass_name = "A4_denoise_reinhard320"
            pre_ms = (time.perf_counter() - t_p0) * 1000.0
        else:
            raise ValueError(policy)

        pre_ms_list.append(pre_ms)
        passes[pass_name] += 1

        # Measure post-LUT glare & dark-wall false-skin chroma artifacts on sample frames
        if k % 6 == 0:
            inp_s320 = resize_320(inp) if inp.shape[1] != 320 else inp
            raw_s320 = resize_320(f) if f.shape[1] != 320 else f
            post_diag = analyze_frame_luma_py(inp_s320, hand_roi=hand_roi_for_diag, dim_threshold=dim_threshold)
            if post_diag["nearWhiteHandPct"] is not None:
                near_white_post.append(post_diag["nearWhiteHandPct"])
            raw_l = pixel_luma(raw_s320)
            dark_mask = raw_l < 20  # raw luma < 0.08
            if np.any(dark_mask):
                chroma_spread = inp_s320.max(axis=2).astype(np.int16) - inp_s320.min(axis=2).astype(np.int16)
                false_skin_pct = float((chroma_spread[dark_mask] >= 20).mean() * 100.0)
                dark_wall_false_skin.append(false_skin_pct)

        t_d0 = time.perf_counter()
        res = mp_detect(det, inp, ts)
        det_ms_list.append((time.perf_counter() - t_d0) * 1000.0)

        hit = is_correct(res, ref_center)
        hits += int(hit)
        if res["n_hands"] > 0:
            misses = 0
            recovery_worked = pass_name != "A0_raw"
        else:
            misses += 1
            if pass_name != "A0_raw" and misses % 4 == 0:
                recovery_worked = False

    det.close()
    return {
        "frames": len(frames),
        "hits": hits,
        "recall": round(hits / max(1, len(frames)), 4),
        "pre_ms_p50": round(float(np.percentile(pre_ms_list, 50)), 2),
        "det_ms_p50": round(float(np.percentile(det_ms_list, 50)), 2),
        "passes": dict(passes),
        "near_white_hand_pct_mean": round(float(np.mean(near_white_post)), 2) if near_white_post else None,
        "dark_wall_chroma_spike_pct_mean": round(float(np.mean(dark_wall_false_skin)), 2) if dark_wall_false_skin else None,
    }


def eval_normal_and_t2_threshold(base_samples: list[dict[str, Any]]) -> dict[str, Any]:
    # 1. HandGesture-5G clean 720p normal frames
    hg_diag_052 = []
    hg_diag_032 = []
    det = build_landmarker("IMAGE")
    raw_hits = 0
    for item in base_samples:
        d52 = analyze_frame_luma_py(item["rgb"], hand_roi=item["ref_bbox"], dim_threshold=R20_LEGACY_DIM_LUMA)
        d32 = analyze_frame_luma_py(item["rgb"], hand_roi=item["ref_bbox"], dim_threshold=R22_CALIBRATED_DIM_LUMA)
        hg_diag_052.append(d52)
        hg_diag_032.append(d32)
        res = mp_detect(det, item["rgb"])
        raw_hits += int(is_correct(res, item["ref_center"]))
    det.close()

    # 2. Physical mendeley_bxr7kx84y6/natural_light_1.zip frames
    zf = zipfile.ZipFile(f"{R18_SANDBOX}/datasets/mendeley_bxr7kx84y6/natural_light_1.zip")
    names = sorted(n for n in zf.namelist() if n.lower().endswith(".jpg"))[:40]
    nat_052 = 0
    nat_032 = 0
    nat_lumas = []
    for n in names:
        bgr = cv2.imdecode(np.frombuffer(zf.read(n), np.uint8), cv2.IMREAD_COLOR)
        if bgr is None:
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        d52 = analyze_frame_luma_py(rgb, dim_threshold=R20_LEGACY_DIM_LUMA)
        d32 = analyze_frame_luma_py(rgb, dim_threshold=R22_CALIBRATED_DIM_LUMA)
        nat_lumas.append(d32["meanLuma"])
        nat_052 += int(d52["shouldActivateDimRecovery"])
        nat_032 += int(d32["shouldActivateDimRecovery"])

    return {
        "hg5g_clean_n": len(base_samples),
        "hg5g_mean_luma_p50": round(float(np.median([d["meanLuma"] for d in hg_diag_032])), 4),
        "hg5g_legacy_052_trigger_rate": round(np.mean([d["shouldActivateDimRecovery"] for d in hg_diag_052]), 4),
        "hg5g_r22_032_trigger_rate": round(np.mean([d["shouldActivateDimRecovery"] for d in hg_diag_032]), 4),
        "hg5g_raw_recall": round(raw_hits / max(1, len(base_samples)), 4),
        "physical_natural_light_n": len(nat_lumas),
        "physical_natural_luma_p50": round(float(np.median(nat_lumas)), 4),
        "physical_natural_legacy_052_trigger_rate": round(nat_052 / max(1, len(nat_lumas)), 4),
        "physical_natural_r22_032_trigger_rate": round(nat_032 / max(1, len(nat_lumas)), 4),
    }


def eval_dim_synthetic_and_physical(base_samples: list[dict[str, Any]]) -> dict[str, Any]:
    strata = ["dim_g020", "dim_g008", "dim_warm_led", "backlight"]
    policies = [
        ("RAW", R22_CALIBRATED_DIM_LUMA),
        ("A4v2_032", R22_CALIBRATED_DIM_LUMA),
        ("R22_SoftKnee_ShadowClamp", R22_CALIBRATED_DIM_LUMA),
    ]
    by_stratum = {}
    subset = base_samples[:12]
    for st in strata:
        agg = {p: {"hits": 0, "frames": 0, "pre_ms": [], "det_ms": [], "chroma": []} for p, _ in policies}
        for idx, item in enumerate(subset):
            frames = make_sequence(item["rgb"], AUGS[st], 20261130 + idx * 17)
            for pol, thr in policies:
                r = run_policy_sequence(frames, pol, thr, item["ref_center"], item["ref_bbox"])
                agg[pol]["hits"] += r["hits"]
                agg[pol]["frames"] += r["frames"]
                agg[pol]["pre_ms"].append(r["pre_ms_p50"])
                agg[pol]["det_ms"].append(r["det_ms_p50"])
                if r["dark_wall_chroma_spike_pct_mean"] is not None:
                    agg[pol]["chroma"].append(r["dark_wall_chroma_spike_pct_mean"])
        by_stratum[st] = {
            pol: {
                "recall": round(v["hits"] / max(1, v["frames"]), 4),
                "pre_ms_p50": round(float(np.median(v["pre_ms"])), 2),
                "det_ms_p50": round(float(np.median(v["det_ms"])), 2),
                "dark_wall_chroma_spike_pct": round(float(np.mean(v["chroma"])), 2) if v["chroma"] else None,
            }
            for pol, v in agg.items()
        }

    # Physical low-light frames from mendeley_bxr7kx84y6/dim_light_1.zip
    zf = zipfile.ZipFile(f"{R18_SANDBOX}/datasets/mendeley_bxr7kx84y6/dim_light_1.zip")
    names = sorted(n for n in zf.namelist() if n.lower().endswith(".jpg"))
    # Sample 45 frames across directories (Chinese Chess, Dice, Gomoku)
    picked = names[:: max(1, len(names) // 45)][:45]
    phys_frames = []
    for n in picked:
        bgr = cv2.imdecode(np.frombuffer(zf.read(n), np.uint8), cv2.IMREAD_COLOR)
        if bgr is not None:
            phys_frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

    phys_lumas = [analyze_frame_luma_py(f) for f in phys_frames]
    phys_res = {}
    for pol, thr in policies:
        # Run sequential video evaluation on physical dim frames
        det = build_landmarker("VIDEO")
        ts = 0
        hits = 0
        misses = 0
        rec_worked = False
        tprev = None
        last_d = None
        passes = collections.Counter()
        for k, f in enumerate(phys_frames):
            ts += FRAME_MS
            if last_d is None or k % 12 == 0:
                last_d = analyze_frame_luma_py(f, dim_threshold=thr)
            if pol == "RAW":
                inp, pnm = f, "A0_raw"
            else:
                enh = last_d["shouldActivateDimRecovery"] and (rec_worked or misses >= 1)
                if enh:
                    s320 = resize_320(f)
                    if pol == "A4v2_032":
                        inp, tprev = apply_a4v2(s320, last_d["meanLuma"], tprev)
                        pnm = "A4_denoise_reinhard320"
                    else:
                        inp, tprev = apply_r22_softknee_shadowclamp(s320, last_d["meanLuma"], tprev)
                        pnm = "R22_softknee_shadowclamp320"
                else:
                    tprev = resize_320(f) if last_d["shouldActivateDimRecovery"] else None
                    inp, pnm = f, "A0_raw"
            passes[pnm] += 1
            res = mp_detect(det, inp, ts)
            if res["n_hands"] > 0:
                hits += 1
                misses = 0
                rec_worked = pnm != "A0_raw"
            else:
                misses += 1
                if pnm != "A0_raw" and misses % 4 == 0:
                    rec_worked = False
        det.close()
        phys_res[pol] = {
            "frames": len(phys_frames),
            "hands_detected_frames": hits,
            "detection_rate": round(hits / max(1, len(phys_frames)), 4),
            "passes": dict(passes),
        }

    return {
        "synthetic_dim_strata": by_stratum,
        "physical_dim_light_bxr7": {
            "frames": len(phys_frames),
            "mean_luma_p50": round(float(np.median([d["meanLuma"] for d in phys_lumas])), 4),
            "p10_p50_p95": [
                round(float(np.median([d["p10"] for d in phys_lumas])), 4),
                round(float(np.median([d["p50"] for d in phys_lumas])), 4),
                round(float(np.median([d["p95"] for d in phys_lumas])), 4),
            ],
            "noise_proxy_p50": round(float(np.median([d["noiseProxy"] for d in phys_lumas])), 2),
            "blur_proxy_p50": round(float(np.median([d["blurProxy"] for d in phys_lumas])), 2),
            "policies": phys_res,
        },
    }


def make_monitor_glare_frame(rgb: np.ndarray, bbox: tuple[float, float, float, float], rng: np.random.Generator) -> np.ndarray:
    """Dark room surround (luma ~ 0.05 with RGB chroma sensor noise) + bright monitor-lit hand (highlights > 0.80)."""
    h, w = rgb.shape[:2]
    x0, y0, x1, y1 = bbox
    cx = 0.5 * (x0 + x1) * w
    cy = 0.5 * (y0 + y1) * h
    rx = max(24.0, 0.52 * (x1 - x0) * w)
    ry = max(24.0, 0.52 * (y1 - y0) * h)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dist2 = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2
    mask = np.clip(np.exp(-0.75 * np.maximum(0.0, dist2 - 0.55) ** 2), 0.0, 1.0)[..., None]

    lin = np.power(np.clip(rgb.astype(np.float32) / 255.0, 0.0, 1.0), 2.2)
    # Dark wall with realistic read noise + warm/cool monitor glare on hand
    dark_wall = lin * 0.045 + rng.normal(0.008, 0.012, lin.shape).astype(np.float32)
    bright_hand = lin * np.array([1.75, 1.80, 1.95], np.float32)
    mixed = dark_wall * (1.0 - mask) + bright_hand * mask
    mixed += rng.normal(0.0, 0.004, lin.shape).astype(np.float32)
    srgb = np.power(np.clip(mixed, 0.0, 1.0), 1.0 / 2.2)
    return np.clip(srgb * 255.0 + 0.5, 0, 255).astype(np.uint8)


def eval_monitor_glare_and_motion_blur(base_samples: list[dict[str, Any]]) -> dict[str, Any]:
    subset = base_samples[:12]
    glare_policies = ["RAW", "A4v2_032", "R22_SoftKnee_ShadowClamp", "A4v2_Always_On_320", "R22_Always_On_320"]
    glare_agg = {p: {"hits": 0, "frames": 0, "nw": [], "chroma": []} for p in glare_policies}
    pre_glare_nw = []

    for idx, item in enumerate(subset):
        frames = []
        for k in range(N_FRAMES):
            rng = np.random.default_rng(7700 + idx * 100 + k)
            frames.append(make_monitor_glare_frame(item["rgb"], item["ref_bbox"], rng))
        d0 = analyze_frame_luma_py(frames[0], hand_roi=item["ref_bbox"], dim_threshold=R22_CALIBRATED_DIM_LUMA)
        if d0["nearWhiteHandPct"] is not None:
            pre_glare_nw.append(d0["nearWhiteHandPct"])
        for pol in glare_policies:
            r = run_policy_sequence(frames, pol, R22_CALIBRATED_DIM_LUMA, item["ref_center"], item["ref_bbox"])
            glare_agg[pol]["hits"] += r["hits"]
            glare_agg[pol]["frames"] += r["frames"]
            if r["near_white_hand_pct_mean"] is not None:
                glare_agg[pol]["nw"].append(r["near_white_hand_pct_mean"])
            if r["dark_wall_chroma_spike_pct_mean"] is not None:
                glare_agg[pol]["chroma"].append(r["dark_wall_chroma_spike_pct_mean"])

    # Motion blur evaluation
    blur_levels = [("clean_k1", 1, 1.0), ("fast_blur_k11", 11, 1.0), ("heavy_blur_dim_k15", 15, 0.30)]
    blur_res = {}
    det = build_landmarker("IMAGE")
    for bname, ksize, gain in blur_levels:
        blurs = []
        warned = 0
        raw_hits = 0
        r22_hits = 0
        for idx, item in enumerate(subset):
            im = item["rgb"]
            if gain < 1.0:
                rng = np.random.default_rng(8800 + idx)
                im = AUGS["dim_g020"](im, rng) if gain <= 0.25 else (np.clip(im.astype(np.float32) * gain, 0, 255).astype(np.uint8))
            if ksize > 1:
                im = motion_blur(im, ksize, float((idx * 35) % 180))
            d = analyze_frame_luma_py(im, hand_roi=item["ref_bbox"])
            blurs.append(d["blurProxy"])
            warned += int(d["isBlurry"])
            raw_hits += int(is_correct(mp_detect(det, im), item["ref_center"]))
            s320 = resize_320(im)
            enh, _ = apply_r22_softknee_shadowclamp(s320, d["meanLuma"], None)
            r22_hits += int(is_correct(mp_detect(det, enh if d["shouldActivateDimRecovery"] else im), item["ref_center"]))
        blur_res[bname] = {
            "n": len(subset),
            "blur_proxy_p10_p50_p90": [round(float(v), 2) for v in np.percentile(blurs, [10, 50, 90])],
            "is_blurry_flagged_rate": round(warned / len(subset), 4),
            "raw_recall": round(raw_hits / len(subset), 4),
            "r22_recall": round(r22_hits / len(subset), 4),
        }
    det.close()

    return {
        "monitor_glare_dark_room": {
            "sequences_per_policy": len(subset),
            "pre_lut_near_white_hand_pct_mean": round(float(np.mean(pre_glare_nw)), 2) if pre_glare_nw else None,
            "policies": {
                p: {
                    "recall": round(v["hits"] / max(1, v["frames"]), 4),
                    "post_near_white_hand_pct_mean": round(float(np.mean(v["nw"])), 2) if v["nw"] else None,
                    "dark_wall_chroma_spike_pct_mean": round(float(np.mean(v["chroma"])), 2) if v["chroma"] else None,
                }
                for p, v in glare_agg.items()
            },
        },
        "motion_blur_stress": blur_res,
    }


def eval_roi_and_bystander_ablation(base_samples: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Tests P09 (ROI crop/mask vs full-frame) & O03 (metamorphic coordinate transform) on:
      1. Small/far hands (`scale_x045`) where ROI zoom helps vs FullFrame.
      2. 2-hand bystander crossing sequences (primary hand + crossing bystander hand).
    """
    det_img = build_landmarker("IMAGE")

    # 1. Metamorphic ROI transform check + small hand zoom test
    metamorphic_max_err = 0.0
    align_errs: list[float] = []
    small_full_hits = 0
    small_crop_hits = 0
    n_small = 15

    for idx, item in enumerate(base_samples[:n_small]):
        rgb = item["rgb"]
        h, w = rgb.shape[:2]
        # Place hand at 0.45x scale on 640x360 dark indoor canvas
        cw, ch = 640, 360
        nw, nh = int(round(cw * 0.45)), int(round(ch * 0.45))
        small = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
        canvas = np.full((ch, cw, 3), 38, dtype=np.uint8)
        ox, oy = (cw - nw) // 2, (ch - nh) // 2
        canvas[oy : oy + nh, ox : ox + nw] = small

        # Expected full-frame center of hand
        rx, ry = item["ref_center"]
        exp_cx = (ox + rx * nw) / cw
        exp_cy = (oy + ry * nh) / ch
        # Padded ROI box around true hand location (1.8x bbox)
        bx0, by0, bx1, by1 = item["ref_bbox"]
        fx0 = max(0.0, (ox + bx0 * nw) / cw - 0.08)
        fy0 = max(0.0, (oy + by0 * nh) / ch - 0.08)
        fx1 = min(1.0, (ox + bx1 * nw) / cw + 0.08)
        fy1 = min(1.0, (oy + by1 * nh) / ch + 0.08)
        crop_norm = (fx0, fy0, fx1, fy1)

        # Metamorphic identity test: map (0,0), (1,1), (0.5,0.5) forward & inverse
        px, py = 0.37, 0.61
        mapped = map_crop_landmarks_to_full_frame([[px, py, 0.0]], crop_norm)[0]
        inv_x = (mapped[0] - fx0) / (fx1 - fx0)
        inv_y = (mapped[1] - fy0) / (fy1 - fy0)
        metamorphic_max_err = max(metamorphic_max_err, abs(inv_x - px), abs(inv_y - py))

        full_res = mp_detect(det_img, canvas)
        full_hit = is_correct(full_res, (exp_cx, exp_cy))
        small_full_hits += int(full_hit)

        cx0, cy0 = int(round(fx0 * cw)), int(round(fy0 * ch))
        cx1, cy1 = int(round(fx1 * cw)), int(round(fy1 * ch))
        crop_img = canvas[cy0:cy1, cx0:cx1]
        # Exact normalized box for actual integer pixel slice
        exact_crop_norm = (cx0 / cw, cy0 / ch, cx1 / cw, cy1 / ch)
        crop_up = cv2.resize(crop_img, (320, max(1, int(round(320 * crop_img.shape[0] / max(1, crop_img.shape[1]))))), interpolation=cv2.INTER_LINEAR)
        crop_res = mp_detect(det_img, crop_up)
        if crop_res["n_hands"] > 0:
            remapped = map_crop_landmarks_to_full_frame(crop_res["hands"][0]["landmarks"], exact_crop_norm)
            rcx = 0.5 * (remapped[0][0] + remapped[9][0])
            rcy = 0.5 * (remapped[0][1] + remapped[9][1])
            if math.hypot(rcx - exp_cx, rcy - exp_cy) <= HIT_RADIUS:
                small_crop_hits += 1
            if full_hit:
                flm = full_res["hands"][0]["landmarks"]
                dists = [math.hypot(remapped[j][0] - flm[j][0], remapped[j][1] - flm[j][1]) for j in range(21)]
                align_errs.append(float(np.mean(dists)))

    det_img.close()

    # 2. 2-Hand Bystander Crossing Sequences (10 sequences x 24 frames = 240 frames)
    n_seq = 10
    modes = ["FullFrame_Fixed2", "ROI_Crop_Remap", "ROI_Masked_Outside"]
    bystander_stats = {
        m: {"frames": 0, "primary_hits": 0, "bystander_detected_when_present": 0, "bystander_present_frames": 0, "det_ms": []}
        for m in modes
    }

    for si in range(n_seq):
        p_item = base_samples[si]
        b_item = base_samples[(si + 7) % len(base_samples)]
        pw_rgb = cv2.resize(p_item["rgb"], (180, 180), interpolation=cv2.INTER_AREA)
        bw_rgb = cv2.resize(b_item["rgb"], (180, 180), interpolation=cv2.INTER_AREA)

        seq_frames = []
        p_centers = []
        b_centers = []
        for k in range(N_FRAMES):
            canvas = np.full((360, 640, 3), 42, dtype=np.uint8)
            # Primary hand oscillates around left-center (x ~ 0.25..0.38)
            px_off = int(round(75 + 28 * math.sin(2 * math.pi * k / 16.0)))
            py_off = 90
            canvas[py_off : py_off + 180, px_off : px_off + 180] = pw_rgb
            p_cx = (px_off + p_item["ref_center"][0] * 180) / 640.0
            p_cy = (py_off + p_item["ref_center"][1] * 180) / 360.0
            p_centers.append((p_cx, p_cy))

            # Bystander enters from right (frames 4..19) and approaches primary ROI!
            if 4 <= k <= 19:
                t = (k - 4) / 15.0
                bx_off = int(round(455 - 230 * math.sin(math.pi * t)))
                by_off = 90
                canvas[by_off : by_off + 180, bx_off : bx_off + 180] = bw_rgb
                b_cx = (bx_off + b_item["ref_center"][0] * 180) / 640.0
                b_cy = (by_off + b_item["ref_center"][1] * 180) / 360.0
                b_centers.append((b_cx, b_cy))
            else:
                b_centers.append(None)
            seq_frames.append(canvas)

        for mode in modes:
            det = build_landmarker("VIDEO")
            ts = 0
            # Track primary ROI from previous frame (seeded by frame 0 primary box)
            roi_box = (0.08, 0.18, 0.44, 0.82)
            for k, frame in enumerate(seq_frames):
                ts += FRAME_MS
                bystander_stats[mode]["frames"] += 1
                if b_centers[k] is not None:
                    bystander_stats[mode]["bystander_present_frames"] += 1

                t0 = time.perf_counter()
                if mode == "FullFrame_Fixed2":
                    res = mp_detect(det, frame, ts)
                    hands_full = res["hands"]
                elif mode == "ROI_Crop_Remap":
                    x0, y0, x1, y1 = roi_box
                    cx0, cy0 = max(0, int(round(x0 * 640))), max(0, int(round(y0 * 360)))
                    cx1, cy1 = min(640, int(round(x1 * 640))), min(360, int(round(y1 * 360)))
                    crop = frame[cy0:cy1, cx0:cx1]
                    exact_norm = (cx0 / 640.0, cy0 / 360.0, cx1 / 640.0, cy1 / 360.0)
                    res = mp_detect(det, crop, ts)
                    hands_full = []
                    for hobj in res["hands"]:
                        remapped = map_crop_landmarks_to_full_frame(hobj["landmarks"], exact_norm)
                        hands_full.append({"landmarks": remapped})
                else:
                    # ROI_Masked_Outside: black out pixels outside tracked primary ROI
                    masked = np.zeros_like(frame)
                    x0, y0, x1, y1 = roi_box
                    cx0, cy0 = max(0, int(round(x0 * 640))), max(0, int(round(y0 * 360)))
                    cx1, cy1 = min(640, int(round(x1 * 640))), min(360, int(round(y1 * 360)))
                    masked[cy0:cy1, cx0:cx1] = frame[cy0:cy1, cx0:cx1]
                    res = mp_detect(det, masked, ts)
                    hands_full = res["hands"]

                bystander_stats[mode]["det_ms"].append((time.perf_counter() - t0) * 1000.0)
                pcx, pcy = p_centers[k]
                p_hit = any(math.hypot(hand_center(hobj)[0] - pcx, hand_center(hobj)[1] - pcy) <= 0.16 for hobj in hands_full)
                bystander_stats[mode]["primary_hits"] += int(p_hit)

                if b_centers[k] is not None:
                    bcx, bcy = b_centers[k]
                    b_hit = any(math.hypot(hand_center(hobj)[0] - bcx, hand_center(hobj)[1] - bcy) <= 0.16 for hobj in hands_full)
                    bystander_stats[mode]["bystander_detected_when_present"] += int(b_hit)

                # Update ROI box from primary hand if detected
                for hobj in hands_full:
                    hx, hy = hand_center(hobj)
                    if math.hypot(hx - pcx, hy - pcy) <= 0.16:
                        roi_box = bbox_from_lm(hobj["landmarks"], pad=0.08)
                        break
            det.close()

    return {
        "metamorphic_coord_roundtrip_max_err": float(f"{metamorphic_max_err:.2e}"),
        "small_hand_scale_0_45_test": {
            "n": n_small,
            "full_frame_recall": round(small_full_hits / n_small, 4),
            "roi_crop_remap_recall": round(small_crop_hits / n_small, 4),
            "mean_landmark_alignment_diff_vs_full_frame": round(float(np.mean(align_errs)), 5) if align_errs else None,
        },
        "two_hand_bystander_crossing": {
            m: {
                "frames": v["frames"],
                "primary_track_retention": round(v["primary_hits"] / max(1, v["frames"]), 4),
                "bystander_visibility_rate": round(
                    v["bystander_detected_when_present"] / max(1, v["bystander_present_frames"]), 4
                ),
                "det_ms_p50": round(float(np.percentile(v["det_ms"], 50)), 2),
                "det_ms_p95": round(float(np.percentile(v["det_ms"], 95)), 2),
            }
            for m, v in bystander_stats.items()
        },
    }


def main() -> None:
    t0 = time.time()
    all_rows = select_cohort_rows(train_rows())
    # Pick 30 diverse reference-detected HandGesture-5G images (10 L-Sign, 10 Pointing Up, 10 OTHER)
    picked = []
    counts = collections.Counter()
    det_ref = build_landmarker("IMAGE")
    for r in all_rows:
        key = r["class_name"] if r["class_name"] in ("L-Sign", "Pointing Up") else "OTHER"
        if counts[key] >= 10:
            continue
        bgr = cv2.imread(f"{CACHE}/{r['sample_id']}.jpg")
        if bgr is None:
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        res = mp_detect(det_ref, rgb)
        if res["n_hands"] == 0:
            continue
        lm = res["hands"][0]["landmarks"]
        picked.append({
            "sample_id": r["sample_id"],
            "class_name": r["class_name"],
            "rgb": rgb,
            "ref_center": hand_center(res["hands"][0]),
            "ref_bbox": bbox_from_lm(lm, pad=0.04),
        })
        counts[key] += 1
        if sum(counts.values()) >= 30:
            break
    det_ref.close()

    print(f"[r22-ablation] Loaded {len(picked)} ref-verified images. Running evaluations...", flush=True)
    normal_t2 = eval_normal_and_t2_threshold(picked)
    print("[r22-ablation] 1/4 normal & T2 threshold done", flush=True)
    dim_res = eval_dim_synthetic_and_physical(picked)
    print("[r22-ablation] 2/4 dim synthetic + physical bxr7 done", flush=True)
    glare_blur_res = eval_monitor_glare_and_motion_blur(picked)
    print("[r22-ablation] 3/4 monitor glare + motion blur done", flush=True)
    roi_res = eval_roi_and_bystander_ablation(picked)
    print("[r22-ablation] 4/4 ROI & 2-hand bystander crossing done", flush=True)

    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsed_sec": round(time.time() - t0, 2),
        "t2_threshold_and_normal_lighting": normal_t2,
        "dim_lighting_ablation": dim_res,
        "glare_and_motion_blur_ablation": glare_blur_res,
        "roi_crop_mask_and_bystander_ablation": roi_res,
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
