#!/usr/bin/env python3
"""R20 C2 low-light / photometric augmentation of HandGesture-5G TRAIN images (CC BY 4.0)
AND Paired Low-Light Detector Preprocessing Benchmark (L0/A0 RAW, L1/A2 CLAHE 320, L2/A1 RAW 320,
L3 RAW 480 / CLAHE 480, L4/A3 Mild Gamma + Noise-Floor Denoise + CLAHE 320, A4 Adaptive Luma-Gated).

Stage `cache`   : HTTP-Range stream unique entries needed (effective TRAIN split only), decode (EXIF-orientation
                  aware), downscale long side to 720 px (webcam-like), store as JPEG q92 in the sandbox.
Stage `augment` :
  - Selects 100% of positive TRAIN images (`173 L-Sign` + `200 Pointing Up` = 373 images) plus
    150 stratified `OTHER` TRAIN images (`50 Fist`, `50 V-Sign`, `50 Open Palm_Open Hand`) = 523 images.
  - Applies 12 deterministic photometric/geometric conditions (`raw`, `dim_g045`, `dim_g020`, `dim_g008`,
    `dim_warm_led`, `dim_cool_mon`, `backlight`, `blur_dim`, `jpeg_q25`, `flip`, `flip_dim_g020`, `scale_x045_dim`).
  - Runs the FROZEN MediaPipe HandLandmarker (IMAGE mode, same options as R19) on augmented RAW (`L0`) and
    320px CLAHE (`L1`), plus on a stratified 120-image × 8-condition benchmark subset (960 frames) evaluates
    ALL 6 preprocessing modes (`A0_raw`, `A1_raw320`, `A2_clahe320`, `A3_clahe480`, `A3_gamma_denoise_clahe320`,
    `A4_adaptive_luma_routed`) with per-frame CPU latency (`ms`) and detection recall!
  - Writes:
      (a) `extra_hg5g_aug.jsonl` (TRAIN-only extra landmark rows where MediaPipe returned a valid hand;
          detector misses are recorded as misses, never converted into fake zero features),
      (b) `hg5g_aug_coverage.json` & `lowlight_detector_ablation.json` (H20-03 paired evidence).
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import json
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mp_common import build_landmarker, clahe_rgb_exact, compute_luma_stats, extract_mp_result, pixel_luma  # noqa: E402
from range_zip import RangeZipReader  # noqa: E402
import mediapipe as mp  # noqa: E402

SANDBOX = os.environ.get("R20_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r20-sandbox")
R19 = os.environ.get("R19_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r19-sandbox")
JSONL = f"{R19}/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl"
CACHE = f"{SANDBOX}/data/hg5g_720"
OUT = f"{SANDBOX}/data/aug"
URL = "https://data.mendeley.com/public-files/datasets/wj25crzdbm/files/be3aa0e6-8b18-4563-8201-37e46eadd025/file_downloaded"
LABEL = {
    "Pointing Up": "POINT_READY",
    "L-Sign": "POINT_PRESS",
    "Fist": "OTHER",
    "V-Sign": "OTHER",
    "Open Palm_Open Hand": "OTHER",
}


def effective_split(r: dict) -> str:
    sp = r["split"]
    if r["class_name"] == "Pointing Up":
        if r["cluster_id"] == 18:
            sp = "val"
        elif r["cluster_id"] == 19:
            sp = "train"
    return sp


def train_rows() -> list[dict]:
    rows = []
    for line in open(JSONL, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        if r["class_name"] in LABEL and effective_split(r) == "train":
            rows.append(r)
    prio = {"L-Sign": 0, "Pointing Up": 1, "V-Sign": 2, "Open Palm_Open Hand": 3, "Fist": 4}
    rows.sort(key=lambda r: (prio.get(r["class_name"], 9), r["sample_id"]))
    return rows


def cache_stage(workers: int) -> None:
    os.makedirs(CACHE, exist_ok=True)
    rows = train_rows()
    need = [r for r in rows if not os.path.exists(f"{CACHE}/{r['sample_id']}.jpg")]
    print(f"[cache] train rows={len(rows)} need={len(need)}", flush=True)
    if not need:
        return
    rz = RangeZipReader(URL, timeout=60.0, max_retries=8)
    ents = {e.filename: e for e in rz.parse_central_directory()}

    def work(r):
        e = ents[r["filename"]]
        raw = rz.fetch_entry_bytes(e, True)
        bgr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if bgr is None:
            return r["sample_id"], False
        h, w = bgr.shape[:2]
        s = 720.0 / max(h, w)
        if s < 1:
            bgr = cv2.resize(bgr, (int(round(w * s)), int(round(h * s))), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f"{CACHE}/{r['sample_id']}.jpg", bgr, [cv2.IMWRITE_JPEG_QUALITY, 92])
        return r["sample_id"], True

    done = bad = 0
    t0 = time.time()
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for sid, ok in ex.map(work, need):
            done += 1
            bad += (not ok)
            if done % 100 == 0:
                print(f"[cache] {done}/{len(need)} bad={bad} {time.time() - t0:.0f}s", flush=True)
    print(f"[cache] finished done={done} bad={bad}", flush=True)


# ---------------- photometric augmentations (operate on uint8 RGB) -----------------
def srgb_to_lin(x):
    return np.power(np.clip(x, 0, 1), 2.2)


def lin_to_srgb(x):
    return np.power(np.clip(x, 0, 1), 1 / 2.2)


def low_light(rgb, gain, read_sigma, rng, cast=(1.0, 1.0, 1.0)):
    """Physically-motivated low light: darken in linear light, add shot (Poisson) + read noise, re-encode."""
    lin = srgb_to_lin(rgb.astype(np.float32) / 255.0) * gain * np.asarray(cast, np.float32)
    peak = 255.0 * 4
    shot = rng.poisson(np.clip(lin, 0, None) * peak).astype(np.float32) / peak
    noisy = shot + rng.normal(0, read_sigma, lin.shape).astype(np.float32)
    return (lin_to_srgb(noisy) * 255.0 + 0.5).astype(np.uint8)


def backlight(rgb, rng):
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w * (0.5 + 0.1 * rng.uniform(-1, 1)), h * (0.55 + 0.1 * rng.uniform(-1, 1))
    d = np.sqrt(((xx - cx) / (0.45 * w)) ** 2 + ((yy - cy) / (0.5 * h)) ** 2)
    gain = np.clip(0.26 + 0.95 * d, 0.26, 1.65)[..., None]
    lin = srgb_to_lin(rgb.astype(np.float32) / 255.0) * gain
    return (lin_to_srgb(lin) * 255 + 0.5).astype(np.uint8)


def motion_blur(rgb, k, ang):
    ker = np.zeros((k, k), np.float32)
    ker[k // 2, :] = 1.0
    M = cv2.getRotationMatrix2D((k / 2 - 0.5, k / 2 - 0.5), ang, 1.0)
    ker = cv2.warpAffine(ker, M, (k, k))
    ker /= max(ker.sum(), 1e-6)
    return cv2.filter2D(rgb, -1, ker)


def jpeg(rgb, q):
    ok, buf = cv2.imencode(".jpg", cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, q])
    return cv2.cvtColor(cv2.imdecode(buf, cv2.IMREAD_COLOR), cv2.COLOR_BGR2RGB)


def scale_far_dim(rgb, rng, scale=0.48):
    """Simulate a farther/smaller hand in a dim room by letterboxing at 0.48x inside dark ambient frame."""
    h, w = rgb.shape[:2]
    nw, nh = max(16, int(round(w * scale))), max(16, int(round(h * scale)))
    small = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
    bg_color = np.median(rgb.reshape(-1, 3), axis=0).astype(np.uint8)
    canvas = np.broadcast_to(bg_color, (h, w, 3)).copy()
    y0 = (h - nh) // 2
    x0 = (w - nw) // 2
    canvas[y0 : y0 + nh, x0 : x0 + nw] = small
    return low_light(canvas, 0.25, 0.005, rng)


AUGS = {
    "raw": lambda im, rng: im,
    "dim_g045": lambda im, rng: low_light(im, 0.45, 0.004, rng),
    "dim_g020": lambda im, rng: low_light(im, 0.20, 0.006, rng),
    "dim_g008": lambda im, rng: low_light(im, 0.08, 0.008, rng),
    "dim_warm_led": lambda im, rng: low_light(im, 0.18, 0.006, rng, cast=(1.25, 0.95, 0.60)),
    "dim_cool_mon": lambda im, rng: low_light(im, 0.15, 0.006, rng, cast=(0.80, 0.95, 1.30)),
    "backlight": lambda im, rng: backlight(im, rng),
    "blur_dim": lambda im, rng: motion_blur(low_light(im, 0.30, 0.005, rng), 9, float(rng.uniform(0, 180))),
    "jpeg_q25": lambda im, rng: jpeg(im, 25),
    "flip": lambda im, rng: im[:, ::-1].copy(),
    "flip_dim_g020": lambda im, rng: low_light(im[:, ::-1].copy(), 0.20, 0.006, rng),
    "scale_x048_dim": lambda im, rng: scale_far_dim(im, rng, 0.48),
}


def preprocess_a3_gamma_denoise_clahe320(s320: np.ndarray, mean_l: float) -> np.ndarray:
    """Candidate L4/A3 (§6 & §13.1): luma LUT mild gamma + noise-floor clamp + 3x3 box denoise + moderated CLAHE.
    Avoids amplifying pure black noise when mean_luma < 0.12 (per MDPI 2026 finding cited in §13.1)."""
    # 1. Mild 3x3 denoise on very dark frames to suppress Poisson/read noise before local histogram stretch
    if mean_l < 0.22:
        work = cv2.GaussianBlur(s320, (3, 3), 0.75)
    else:
        work = s320
    # 2. Noise-floor soft clamp + adaptive gamma LUT on luma channel
    gamma = 0.72 if mean_l < 0.16 else (0.82 if mean_l < 0.28 else 0.92)
    clip_lim = 1.6 if mean_l < 0.14 else 2.0
    clahe_im = clahe_rgb_exact(work, tiles_x=8, tiles_y=8, clip_limit=clip_lim)
    if gamma < 0.95:
        lut = np.array([int(round(255.0 * (max(0.0, (i - 3) / 252.0) ** gamma))) for i in range(256)], dtype=np.uint8)
        return lut[clahe_im]
    return clahe_im


def detect(det, rgb_u8):
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb_u8))
    return det.detect(img)


def select_cohort_rows(all_rows: list[dict]) -> list[dict]:
    """Select 100% of positive TRAIN images (L-Sign + Pointing Up = 373) + 50 per OTHER class (150) = 523."""
    selected = []
    other_per_cls = collections.Counter()
    for r in all_rows:
        if not os.path.exists(f"{CACHE}/{r['sample_id']}.jpg"):
            continue
        cls = r["class_name"]
        if cls in ("L-Sign", "Pointing Up"):
            selected.append(r)
        else:
            if other_per_cls[cls] < 50:
                other_per_cls[cls] += 1
                selected.append(r)
    return selected


def augment_chunk(args):
    rows, seed0, bench_ids = args
    det0 = build_landmarker("IMAGE")
    det1 = build_landmarker("IMAGE")
    out_rows, cover, bench_rows = [], [], []
    for r in rows:
        bgr = cv2.imread(f"{CACHE}/{r['sample_id']}.jpg")
        if bgr is None:
            continue
        base = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        h, w = base.shape[:2]
        aspect = w / h
        lbl = LABEL[r["class_name"]]
        is_bench = r["sample_id"] in bench_ids

        for ai, (an, fn) in enumerate(AUGS.items()):
            rng = np.random.default_rng(seed0 + int(r["sample_id"].split("_")[1]) * 97 + ai)
            im = fn(base, rng)
            luma = compute_luma_stats(im)
            s320 = luma["scaled_320"]

            t0 = time.perf_counter()
            p0 = extract_mp_result(detect(det0, im), aspect)
            ms_a0 = (time.perf_counter() - t0) * 1000.0

            t1 = time.perf_counter()
            c320 = clahe_rgb_exact(s320)
            p1 = extract_mp_result(detect(det1, c320), aspect)
            ms_a2 = (time.perf_counter() - t1) * 1000.0

            t3 = time.perf_counter()
            a3_im = preprocess_a3_gamma_denoise_clahe320(s320, luma["mean_luma"])
            p3 = extract_mp_result(detect(det1, a3_im), aspect)
            ms_a3 = (time.perf_counter() - t3) * 1000.0

            cover.append({
                "sample_id": r["sample_id"],
                "cls": r["class_name"],
                "label": lbl,
                "aug": an,
                "mean_luma": luma["mean_luma"],
                "center_luma": luma["center_luma"],
                "is_dark": luma["is_dark"],
                "is_backlight": luma["is_backlight"],
                "l0": p0["n_hands"],
                "l1_clahe320": p1["n_hands"],
                "l4_a3_gamma_denoise_clahe320": p3["n_hands"],
            })

            if is_bench:
                # Also benchmark A1 (RAW 320) and L3 (CLAHE 480) to isolate resize vs enhancement (§6 & §13.1)
                t_a1 = time.perf_counter()
                p_a1 = extract_mp_result(detect(det1, s320), aspect)
                ms_a1 = (time.perf_counter() - t_a1) * 1000.0

                t_480 = time.perf_counter()
                sh480 = max(1, int(round((480 * h) / w)))
                s480 = cv2.resize(im, (480, sh480), interpolation=cv2.INTER_LINEAR)
                c480 = clahe_rgb_exact(s480)
                p_480 = extract_mp_result(detect(det1, c480), aspect)
                ms_480 = (time.perf_counter() - t_480) * 1000.0

                # A4 adaptive routing: use A3 if dark or backlight, else A1 RAW 320 (or A0 RAW)
                use_enh = luma["is_dark"] or luma["is_backlight"] or (luma["mean_luma"] < 0.30)
                a4_hands = p3["n_hands"] if use_enh else p0["n_hands"]
                ms_a4 = ms_a3 if use_enh else ms_a0

                bench_rows.append({
                    "sample_id": r["sample_id"],
                    "cls": r["class_name"],
                    "label": lbl,
                    "aug": an,
                    "mean_luma": luma["mean_luma"],
                    "A0_raw_hit": int(p0["n_hands"] > 0),
                    "A0_raw_ms": round(ms_a0, 2),
                    "A1_raw320_hit": int(p_a1["n_hands"] > 0),
                    "A1_raw320_ms": round(ms_a1, 2),
                    "A2_clahe320_hit": int(p1["n_hands"] > 0),
                    "A2_clahe320_ms": round(ms_a2, 2),
                    "L3_clahe480_hit": int(p_480["n_hands"] > 0),
                    "L3_clahe480_ms": round(ms_480, 2),
                    "A3_gamma_denoise_clahe320_hit": int(p3["n_hands"] > 0),
                    "A3_gamma_denoise_clahe320_ms": round(ms_a3, 2),
                    "A4_adaptive_hit": int(a4_hands > 0),
                    "A4_adaptive_ms": round(ms_a4, 2),
                })

            if an == "raw":
                continue
            hand = (
                p0["hands"][0]
                if p0["n_hands"]
                else (p3["hands"][0] if p3["n_hands"] else (p1["hands"][0] if p1["n_hands"] else None))
            )
            if hand is None:
                continue
            out_rows.append({
                "source": f"hg5g_aug_{an}",
                "raw_label": r["class_name"],
                "label": lbl,
                "group": f"hg5g_c{r['cluster_id']}",
                "aspect": round(aspect, 5),
                "weight": 0.65 if lbl != "OTHER" else 0.35,
                "landmarks": hand["landmarks"],
                "has_history": bool(ai % 2),
                "from_clahe": p0["n_hands"] == 0,
            })
    return out_rows, cover, bench_rows


def summarize_benchmark(bench_rows: list[dict], cover_rows: list[dict]) -> dict:
    modes = [
        ("A0_raw", "A0_raw_hit", "A0_raw_ms"),
        ("A1_raw320", "A1_raw320_hit", "A1_raw320_ms"),
        ("A2_clahe320", "A2_clahe320_hit", "A2_clahe320_ms"),
        ("L3_clahe480", "L3_clahe480_hit", "L3_clahe480_ms"),
        ("A3_gamma_denoise_clahe320", "A3_gamma_denoise_clahe320_hit", "A3_gamma_denoise_clahe320_ms"),
        ("A4_adaptive", "A4_adaptive_hit", "A4_adaptive_ms"),
    ]
    by_mode = {}
    for mname, hkey, mkey in modes:
        hits = [r[hkey] for r in bench_rows]
        times = [r[mkey] for r in bench_rows]
        dark_hits = [r[hkey] for r in bench_rows if r["aug"] in ("dim_g020", "dim_g008", "dim_warm_led", "dim_cool_mon", "backlight", "blur_dim", "flip_dim_g020", "scale_x048_dim")]
        by_mode[mname] = {
            "n_total": len(hits),
            "recall_all": round(float(np.mean(hits)), 4) if hits else 0.0,
            "n_lowlight_strata": len(dark_hits),
            "recall_lowlight": round(float(np.mean(dark_hits)), 4) if dark_hits else 0.0,
            "ms_p50": round(float(np.percentile(times, 50)), 2) if times else 0.0,
            "ms_p95": round(float(np.percentile(times, 95)), 2) if times else 0.0,
        }

    by_aug = {}
    for aug in AUGS:
        sub = [r for r in cover_rows if r["aug"] == aug]
        if not sub:
            continue
        n = len(sub)
        l0_ok = sum(1 for r in sub if r["l0"] > 0)
        l1_ok = sum(1 for r in sub if r["l1_clahe320"] > 0)
        l4_ok = sum(1 for r in sub if r["l4_a3_gamma_denoise_clahe320"] > 0)
        # NOTE (R20-FIX P0.1 audit): `oracle_union_recall` is a stateless 3-call ORACLE UPPER BOUND
        # (any of RAW, CLAHE, or A3 hitting counts as ok). It is NOT actual sequential pipeline recall;
        # see `eval_a4v2_sequential.py` and `r20/results/r20_a4_sequential_audit.json` for honest stateful VIDEO evaluation.
        union_ok = sum(1 for r in sub if (r["l0"] > 0 or r["l1_clahe320"] > 0 or r["l4_a3_gamma_denoise_clahe320"] > 0))
        by_aug[aug] = {
            "n": n,
            "mean_luma_avg": round(float(np.mean([r["mean_luma"] for r in sub])), 4),
            "l0_raw_recall": round(l0_ok / n, 4),
            "l1_clahe320_recall": round(l1_ok / n, 4),
            "l4_a3_gamma_denoise_clahe320_recall": round(l4_ok / n, 4),
            "oracle_union_recall_upper_bound": round(union_ok / n, 4),
            "detector_miss_all": n - union_ok,
        }
    return {
        "benchmark_6mode_subset": by_mode,
        "full_cohort_by_augmentation": by_aug,
    }


def augment_stage(workers: int, limit: int | None) -> None:
    os.makedirs(OUT, exist_ok=True)
    rows = select_cohort_rows(train_rows())
    if limit:
        rows = rows[:limit]
    # Pick 60 stratified images (20 L-Sign, 20 Pointing Up, 20 OTHER) for the 6-mode latency+recall benchmark (60*12=720 frames)
    bench_ids = set()
    bc = collections.Counter()
    for r in rows:
        bkey = r["class_name"] if r["class_name"] in ("L-Sign", "Pointing Up") else "OTHER"
        if bc[bkey] < 20:
            bc[bkey] += 1
            bench_ids.add(r["sample_id"])

    chunks = [rows[i::workers] for i in range(workers)]
    t0 = time.time()
    all_rows, all_cover, all_bench = [], [], []
    with cf.ProcessPoolExecutor(max_workers=workers) as ex:
        for o, c, b in ex.map(augment_chunk, [(ch, 20261119, bench_ids) for ch in chunks]):
            all_rows += o
            all_cover += c
            all_bench += b
    with open(f"{OUT}/extra_hg5g_aug.jsonl", "w", encoding="utf-8") as f:
        for r in all_rows:
            f.write(json.dumps(r) + "\n")
    with open(f"{OUT}/hg5g_aug_coverage.json", "w", encoding="utf-8") as f:
        json.dump(all_cover, f)
    summary = summarize_benchmark(all_bench, all_cover)
    summary["images_processed"] = len(rows)
    summary["extra_train_rows_emitted"] = len(all_rows)
    summary["elapsed_sec"] = round(time.time() - t0, 2)
    with open(f"{OUT}/lowlight_detector_ablation.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("stage", choices=["cache", "augment"])
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--limit", type=int, default=None)
    a = ap.parse_args()
    cache_stage(a.workers) if a.stage == "cache" else augment_stage(a.workers, a.limit)
