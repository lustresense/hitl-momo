#!/usr/bin/env python3
"""R18-UX0-C: Paired RGB-only MediaPipe HandLandmarker baseline on Mendeley CC BY 4.0 frames.

Reads JPEG/PNG frames directly from zip archives (no disk extraction bloat),
applies an exact Python/NumPy port of `src/camera/luma.ts`, `src/camera/clahe.ts`,
and `src/camera/frame-source.ts` (320px scaled and 320px CLAHE), and compares
RAW vs 320px Scaled vs 320px CLAHE using the exact repo `hand_landmarker.task`
and `hand-config.ts` thresholds.
"""
import argparse
import json
import math
import os
import time
import zipfile

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

TASK_PATH = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/public/models/hand_landmarker.task"

# Match src/camera/hand-config.ts and src/camera/frame-source.ts exactly
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


def clahe_rgb_exact(rgb: np.ndarray, tiles_x: int = 8, tiles_y: int = 8, clip_limit: float = 2.0) -> np.ndarray:
    """Exact port of frontend/implementation/src/camera/clahe.ts."""
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

    # Axis maps matching axisMap()
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
    out = np.clip(rgb.astype(np.int32) + delta[..., None], 0, 255).astype(np.uint8)
    return out


def build_landmarker():
    opts = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=TASK_PATH),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_hands=NUM_HANDS,
        min_hand_detection_confidence=MIN_DET_CONF,
        min_hand_presence_confidence=MIN_PRES_CONF,
        min_tracking_confidence=MIN_TRACK_CONF,
    )
    return mp_vision.HandLandmarker.create_from_options(opts)


def summarize_hands(res) -> dict:
    hands = res.hand_landmarks or []
    sizes = []
    min_hand_size = 0.08
    large_count = 0
    for lm in hands:
        xs = [p.x for p in lm]
        ys = [p.y for p in lm]
        sz = max(max(xs) - min(xs), max(ys) - min(ys))
        sizes.append(sz)
        if sz >= min_hand_size:
            large_count += 1
    return {
        "n_hands": len(hands),
        "n_large": large_count,
        "sizes": [round(s, 4) for s in sizes],
        "first_tip8": [round(hands[0][8].x, 4), round(hands[0][8].y, 4)] if hands else None,
        "first_wrist": [round(hands[0][0].x, 4), round(hands[0][0].y, 4)] if hands else None,
    }


def eval_zip(zip_path: str, label: str, max_frames: int) -> dict:
    zf = zipfile.ZipFile(zip_path)
    img_names = sorted(
        n for n in zf.namelist()
        if n.lower().endswith((".jpg", ".jpeg", ".png")) and not n.startswith("__MACOSX")
    )
    if not img_names:
        return {"error": f"no images in {zip_path}"}
    # Deterministic uniform stride across the archive
    stride = max(1, len(img_names) // max_frames)
    sampled = img_names[::stride][:max_frames]

    lm_raw = build_landmarker()
    lm_scaled = build_landmarker()
    lm_clahe = build_landmarker()

    lumas, clumas = [], []
    dark_triggers = 0
    backlight_triggers = 0
    res_stats = {"raw": [], "scaled": [], "clahe": []}
    clahe_ms = []
    infer_ms = {"raw": [], "scaled": [], "clahe": []}
    paired = {"both_detect": 0, "raw_only": 0, "clahe_only": 0, "neither": 0, "scaled_only_vs_raw": 0, "raw_only_vs_scaled": 0}
    disagreements = []

    for idx, name in enumerate(sampled):
        buf = np.frombuffer(zf.read(name), dtype=np.uint8)
        bgr = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if bgr is None:
            continue
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        h, w, _ = rgb.shape
        sh = max(1, int(round((ENHANCE_WIDTH * h) / w)))
        scaled_rgb = cv2.resize(rgb, (ENHANCE_WIDTH, sh), interpolation=cv2.INTER_LINEAR)

        lp = pixel_luma(scaled_rgb)
        ml = mean_luma(lp, 2)
        cl = center_luma(lp, 2)
        bl = (cl < BACKLIGHT_CENTER_MAX) and ((ml - cl) >= BACKLIGHT_LUMA_GAP)
        dk = (ml < DARK_LUMA) or bl
        lumas.append(ml)
        clumas.append(cl)
        if dk:
            dark_triggers += 1
        if bl:
            backlight_triggers += 1

        t0 = time.perf_counter()
        clahe_rgb = clahe_rgb_exact(scaled_rgb)
        clahe_ms.append((time.perf_counter() - t0) * 1000.0)

        for key, frame_arr, detector in [
            ("raw", rgb, lm_raw),
            ("scaled", scaled_rgb, lm_scaled),
            ("clahe", clahe_rgb, lm_clahe),
        ]:
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(frame_arr))
            ti = time.perf_counter()
            out = detector.detect(mp_img)
            infer_ms[key].append((time.perf_counter() - ti) * 1000.0)
            res_stats[key].append(summarize_hands(out))

        r_det = res_stats["raw"][-1]["n_hands"] > 0
        s_det = res_stats["scaled"][-1]["n_hands"] > 0
        c_det = res_stats["clahe"][-1]["n_hands"] > 0
        if r_det and c_det:
            paired["both_detect"] += 1
        elif r_det and not c_det:
            paired["raw_only"] += 1
            if len(disagreements) < 10:
                disagreements.append({"frame": name, "luma": round(ml, 3), "type": "raw_only"})
        elif c_det and not r_det:
            paired["clahe_only"] += 1
            if len(disagreements) < 10:
                disagreements.append({"frame": name, "luma": round(ml, 3), "type": "clahe_only"})
        else:
            paired["neither"] += 1
        if s_det and not r_det:
            paired["scaled_only_vs_raw"] += 1
        elif r_det and not s_det:
            paired["raw_only_vs_scaled"] += 1

    lm_raw.close()
    lm_scaled.close()
    lm_clahe.close()

    n = len(res_stats["raw"])
    def agg(key: str) -> dict:
        arr = res_stats[key]
        det1 = sum(1 for x in arr if x["n_hands"] >= 1)
        det2 = sum(1 for x in arr if x["n_hands"] >= 2)
        large1 = sum(1 for x in arr if x["n_large"] >= 1)
        ms = sorted(infer_ms[key])
        return {
            "frames": n,
            "pct_ge_1_hand": round(100 * det1 / max(1, n), 2),
            "pct_ge_2_hands": round(100 * det2 / max(1, n), 2),
            "pct_ge_1_large_hand": round(100 * large1 / max(1, n), 2),
            "infer_p50_ms": round(ms[len(ms)//2], 2) if ms else None,
            "infer_p95_ms": round(ms[int(0.95 * (len(ms)-1))], 2) if ms else None,
        }

    # Luma quantiles & breakdown on dark vs non-dark slices
    luma_arr = np.array(lumas)
    return {
        "label": label,
        "zip_path": os.path.basename(zip_path),
        "total_images_in_zip": len(img_names),
        "sampled_frames": n,
        "native_resolution": f"{w}x{h}" if n else None,
        "luma_stats": {
            "mean_luma_p10": round(float(np.percentile(luma_arr, 10)), 4),
            "mean_luma_p50": round(float(np.percentile(luma_arr, 50)), 4),
            "mean_luma_p90": round(float(np.percentile(luma_arr, 90)), 4),
            "pct_triggering_auto_dark_lt_0_28_or_backlight": round(100 * dark_triggers / max(1, n), 2),
            "pct_triggering_backlight": round(100 * backlight_triggers / max(1, n), 2),
        },
        "modes": {
            "raw": agg("raw"),
            "scaled_320": agg("scaled"),
            "clahe_320": agg("clahe"),
        },
        "paired_raw_vs_clahe": paired,
        "clahe_cpu_p50_ms_numpy": round(float(np.median(clahe_ms)), 3) if clahe_ms else None,
        "sample_disagreements": disagreements,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dim-zip", required=True)
    ap.add_argument("--nat-zip", required=False)
    ap.add_argument("--max-frames", type=int, default=300)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out = {"task_model": os.path.basename(TASK_PATH), "results": []}
    out["results"].append(eval_zip(args.dim_zip, "Mendeley_bxr7kx84y6_DimLight", args.max_frames))
    if args.nat_zip:
        out["results"].append(eval_zip(args.nat_zip, "Mendeley_bxr7kx84y6_NaturalLight", args.max_frames))
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
