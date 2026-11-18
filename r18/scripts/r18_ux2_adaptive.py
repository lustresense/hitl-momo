#!/usr/bin/env python3
"""R18-UX2: Paired Adaptive Preprocessing A/B (RAW vs 320px CLAHE vs 480px CLAHE vs RAW-first Recovery CLAHE).

Evaluates on:
  1) Sequential Mendeley CC BY 4.0 DimLight & NaturalLight frame blocks (measures detection recall/continuity,
     raw_only preservation, temporal tip-8 jitter, mode switching oscillation, and total frame latency)
  2) N0/N1 Non-hand Distractor Suite (`N0_fan_sticks`, `N1_poster_hand`, dark noise, skin blobs)
"""
import json
import os
import time
import zipfile
import cv2
import mediapipe as mp
import numpy as np

from r18_ux0_c_mendeley import (
    ENHANCE_WIDTH, DARK_LUMA, BACKLIGHT_CENTER_MAX, BACKLIGHT_LUMA_GAP,
    build_landmarker, clahe_rgb_exact, pixel_luma, mean_luma, center_luma, summarize_hands,
)
from r18_ux0_e_n0_negatives import make_n0_n1_scenes

RESULTS_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results"


def plausible_skeleton_np(lm_list, aspect: float = 16 / 9) -> bool:
    if not lm_list or len(lm_list) < 21:
        return False
    pts = np.array([[p.x, p.y] for p in lm_list], dtype=np.float32)
    if not np.all(np.isfinite(pts)):
        return False
    bw = float(pts[:, 0].max() - pts[:, 0].min())
    bh = float(pts[:, 1].max() - pts[:, 1].min())
    hs = max(bw, bh)
    if hs < 0.06 or hs > 1.25:
        return False
    p = pts.copy()
    p[:, 0] *= aspect
    span = float(np.linalg.norm(p[9] - p[0]))
    knuckle = float(np.linalg.norm(p[17] - p[5]))
    ps = max(span, knuckle)
    if ps < 0.045:
        return False
    if (bw * aspect * bh) < 0.0028:
        return False
    idx_c = float(np.linalg.norm(p[6]-p[5]) + np.linalg.norm(p[7]-p[6]) + np.linalg.norm(p[8]-p[7])) / ps
    mid_c = float(np.linalg.norm(p[10]-p[9]) + np.linalg.norm(p[11]-p[10]) + np.linalg.norm(p[12]-p[11])) / ps
    if idx_c < 0.14 or idx_c > 2.8 or mid_c < 0.14 or mid_c > 3.0:
        return False
    return True


def run_sequence_modes(frames_rgb: list[np.ndarray]) -> dict:
    det_raw = build_landmarker()
    det_c320 = build_landmarker()
    det_c480 = build_landmarker()

    modes = {
        "M0_baseline_auto_320": [],
        "M1_raw_720p": [],
        "M2_clahe_480p": [],
        "M3_raw_first_recovery_clahe320": [],
        "M4_raw_first_recovery_clahe480_plus_skel": [],
    }
    latencies = {k: [] for k in modes}

    # Hysteresis state for M3 and M4: sticky recovery stays active for up to 5 frames or until RAW works again
    rec_active_3 = 0
    rec_active_4 = 0
    switches_3 = 0
    switches_4 = 0
    last_mode_3 = "raw"
    last_mode_4 = "raw"

    for rgb in frames_rgb:
        h, w, _ = rgb.shape
        # Check luma (as frame-source.ts does on 320px)
        sh320 = max(1, int(round((320 * h) / w)))
        s320 = cv2.resize(rgb, (320, sh320), interpolation=cv2.INTER_LINEAR)
        lp = pixel_luma(s320)
        ml = mean_luma(lp, 2)
        cl = center_luma(lp, 2)
        bl = (cl < BACKLIGHT_CENTER_MAX) and ((ml - cl) >= BACKLIGHT_LUMA_GAP)
        is_dark = (ml < DARK_LUMA) or bl

        # 1. RAW
        t0 = time.perf_counter()
        out_raw = det_raw.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        ms_raw = (time.perf_counter() - t0) * 1000.0
        n_raw = len(out_raw.hand_landmarks)

        # 2. CLAHE 320
        t0 = time.perf_counter()
        c320 = clahe_rgb_exact(s320)
        ms_c320_prep = (time.perf_counter() - t0) * 1000.0
        t0 = time.perf_counter()
        out_c320 = det_c320.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c320)))
        ms_c320_det = (time.perf_counter() - t0) * 1000.0

        # 3. CLAHE 480
        sh480 = max(1, int(round((480 * h) / w)))
        t0 = time.perf_counter()
        s480 = cv2.resize(rgb, (480, sh480), interpolation=cv2.INTER_LINEAR)
        c480 = clahe_rgb_exact(s480)
        ms_c480_prep = (time.perf_counter() - t0) * 1000.0
        t0 = time.perf_counter()
        out_c480 = det_c480.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c480)))
        ms_c480_det = (time.perf_counter() - t0) * 1000.0

        # Record M0 (auto_320)
        if is_dark:
            modes["M0_baseline_auto_320"].append(out_c320.hand_landmarks)
            latencies["M0_baseline_auto_320"].append(ms_c320_prep + ms_c320_det)
        else:
            modes["M0_baseline_auto_320"].append(out_raw.hand_landmarks)
            latencies["M0_baseline_auto_320"].append(ms_raw)

        # Record M1 (raw)
        modes["M1_raw_720p"].append(out_raw.hand_landmarks)
        latencies["M1_raw_720p"].append(ms_raw)

        # Record M2 (clahe 480 if dark else raw)
        if is_dark:
            modes["M2_clahe_480p"].append(out_c480.hand_landmarks)
            latencies["M2_clahe_480p"].append(ms_c480_prep + ms_c480_det)
        else:
            modes["M2_clahe_480p"].append(out_raw.hand_landmarks)
            latencies["M2_clahe_480p"].append(ms_raw)

        # M3: RAW-first; if sticky recovery active try CLAHE320 first (probe RAW every 6 frames),
        # or if RAW misses & is_dark -> fallback CLAHE320
        cur_m3 = "raw"
        if rec_active_3 > 0:
            rec_active_3 -= 1
            cur_m3 = "clahe320"
            if len(out_c320.hand_landmarks) > 0:
                modes["M3_raw_first_recovery_clahe320"].append(out_c320.hand_landmarks)
                latencies["M3_raw_first_recovery_clahe320"].append(ms_c320_prep + ms_c320_det)
            else:
                modes["M3_raw_first_recovery_clahe320"].append(out_raw.hand_landmarks)
                latencies["M3_raw_first_recovery_clahe320"].append(ms_c320_prep + ms_c320_det + ms_raw)
                rec_active_3 = 0
        else:
            if n_raw > 0 or not is_dark:
                modes["M3_raw_first_recovery_clahe320"].append(out_raw.hand_landmarks)
                latencies["M3_raw_first_recovery_clahe320"].append(ms_raw)
            else:
                cur_m3 = "clahe320"
                modes["M3_raw_first_recovery_clahe320"].append(out_c320.hand_landmarks)
                latencies["M3_raw_first_recovery_clahe320"].append(ms_raw + ms_c320_prep + ms_c320_det)
                if len(out_c320.hand_landmarks) > 0:
                    rec_active_3 = 5
        if cur_m3 != last_mode_3:
            switches_3 += 1
            last_mode_3 = cur_m3

        # M4: RAW-first + CLAHE480 sticky recovery + skeleton plausibility filter
        cur_m4 = "raw"
        aspect = w / max(1, h)
        raw_valid = [hl for hl in out_raw.hand_landmarks if plausible_skeleton_np(hl, aspect)]
        c480_valid = [hl for hl in out_c480.hand_landmarks if plausible_skeleton_np(hl, aspect)]
        if rec_active_4 > 0:
            rec_active_4 -= 1
            cur_m4 = "clahe480"
            if len(c480_valid) > 0:
                modes["M4_raw_first_recovery_clahe480_plus_skel"].append(c480_valid)
                latencies["M4_raw_first_recovery_clahe480_plus_skel"].append(ms_c480_prep + ms_c480_det)
            else:
                modes["M4_raw_first_recovery_clahe480_plus_skel"].append(raw_valid)
                latencies["M4_raw_first_recovery_clahe480_plus_skel"].append(ms_c480_prep + ms_c480_det + ms_raw)
                rec_active_4 = 0
        else:
            if len(raw_valid) > 0 or not is_dark:
                modes["M4_raw_first_recovery_clahe480_plus_skel"].append(raw_valid)
                latencies["M4_raw_first_recovery_clahe480_plus_skel"].append(ms_raw)
            else:
                cur_m4 = "clahe480"
                modes["M4_raw_first_recovery_clahe480_plus_skel"].append(c480_valid)
                latencies["M4_raw_first_recovery_clahe480_plus_skel"].append(ms_raw + ms_c480_prep + ms_c480_det)
                if len(c480_valid) > 0:
                    rec_active_4 = 5
        if cur_m4 != last_mode_4:
            switches_4 += 1
            last_mode_4 = cur_m4

    det_raw.close()
    det_c320.close()
    det_c480.close()

    summary = {}
    for mname, seq in modes.items():
        det_frames = sum(1 for h in seq if len(h) > 0)
        # Sequential tip-8 delta (frame-to-frame motion + jitter proxy when tracked consecutively)
        deltas = []
        dropouts = 0
        for i in range(1, len(seq)):
            if len(seq[i - 1]) > 0 and len(seq[i]) == 0:
                dropouts += 1
            if len(seq[i - 1]) > 0 and len(seq[i]) > 0:
                t0 = np.array([seq[i - 1][0][8].x, seq[i - 1][0][8].y])
                t1 = np.array([seq[i][0][8].x, seq[i][0][8].y])
                deltas.append(float(np.linalg.norm(t1 - t0)))
        lats = sorted(latencies[mname])
        summary[mname] = {
            "frames": len(seq),
            "det_rate_pct": round(100 * det_frames / max(1, len(seq)), 2),
            "track_dropouts": dropouts,
            "tip8_step_p50_norm": round(float(np.median(deltas)), 5) if deltas else None,
            "tip8_step_p95_norm": round(float(np.percentile(deltas, 95)), 5) if deltas else None,
            "lat_p50_ms": round(lats[len(lats) // 2], 2),
            "lat_p95_ms": round(lats[int(0.95 * (len(lats) - 1))], 2),
        }
    summary["mode_switches_M3"] = switches_3
    summary["mode_switches_M4"] = switches_4
    return summary


def load_contiguous_blocks(zip_path: str, per_block: int = 80, blocks: int = 3) -> list[np.ndarray]:
    zf = zipfile.ZipFile(zip_path)
    imgs = sorted(n for n in zf.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png")) and not n.startswith("__MACOSX"))
    out = []
    step = max(1, len(imgs) // blocks)
    for b in range(blocks):
        start = b * step
        for nm in imgs[start:start + per_block]:
            bgr = cv2.imdecode(np.frombuffer(zf.read(nm), dtype=np.uint8), cv2.IMREAD_COLOR)
            if bgr is not None:
                out.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    return out


def eval_negatives() -> dict:
    scenes = make_n0_n1_scenes()
    det_r, det_320, det_480 = build_landmarker(), build_landmarker(), build_landmarker()
    counts = {
        s: {m: {"total": 0, "fp_raw_out": 0, "fp_after_skel": 0} for m in ("raw_720", "clahe_320", "clahe_480")}
        for s in ("N0", "N1")
    }
    for name, strata, rgb in scenes:
        h, w, _ = rgb.shape
        s320 = cv2.resize(rgb, (320, max(1, int(round((320 * h) / w)))), interpolation=cv2.INTER_LINEAR)
        c320 = clahe_rgb_exact(s320)
        s480 = cv2.resize(rgb, (480, max(1, int(round((480 * h) / w)))), interpolation=cv2.INTER_LINEAR)
        c480 = clahe_rgb_exact(s480)
        for mname, arr, det in [("raw_720", rgb, det_r), ("clahe_320", c320, det_320), ("clahe_480", c480, det_480)]:
            res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(arr)))
            counts[strata][mname]["total"] += 1
            if len(res.hand_landmarks) > 0:
                counts[strata][mname]["fp_raw_out"] += 1
            if any(plausible_skeleton_np(hl, w / max(1, h)) for hl in res.hand_landmarks):
                counts[strata][mname]["fp_after_skel"] += 1
    det_r.close(); det_320.close(); det_480.close()
    return counts


def main():
    dim_frames = load_contiguous_blocks(
        "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6/dim_light_1.zip",
        per_block=80, blocks=3,
    )
    nat_frames = load_contiguous_blocks(
        "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6/natural_light_1.zip",
        per_block=80, blocks=3,
    )
    out = {
        "dim_light_contiguous_240frames": run_sequence_modes(dim_frames),
        "natural_light_contiguous_240frames": run_sequence_modes(nat_frames),
        "n0_n1_negatives": eval_negatives(),
    }
    with open(os.path.join(RESULTS_DIR, "r18_ux2_adaptive.json"), "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
