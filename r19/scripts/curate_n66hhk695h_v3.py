#!/usr/bin/env python3
"""Curate Natural RGB Hand Gestures v3 (10.17632/n66hhk695h.3, CC BY 4.0) from Root.zip.

Reads Root.zip directly (extracts 1 temporary MP4 at a time to /dev/shm and immediately deletes it),
inspects metadata.csv, samples 8 frames evenly across all 1,352 clips (~10,816 frames),
runs MediaPipe hand_landmarker.task (RunningMode.IMAGE, MIN_DET_CONF=0.6, MIN_PRES_CONF=0.45, NUM_HANDS=2)
on L0 RAW (plus L1 320px exact CLAHE on all L0 misses AND on a stratified lighting subset),
runs a paired sequential RunningMode.VIDEO vs RunningMode.IMAGE + L0 vs L1 benchmark across lighting strata,
performs participant-disjoint Train/Val/Test split (p01..p26 -> 18/4/4),
analyzes point_left/point_right thumb & palm/dorsal indicators, and renders point_samples_audit.jpg (< 2 MiB).
"""
from __future__ import annotations

import collections
import csv
import hashlib
import io
import json
import os
import re
import shutil
import sys
import time
import zipfile
from typing import Any, Optional

import cv2
import mediapipe as mp
import numpy as np

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/r19-sandbox/work")
from mp_common import (
    build_landmarker,
    clahe_rgb_exact,
    compute_luma_stats,
    detect_l0_l1,
    extract_mp_result,
)

ZIP_PATH = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/n66hhk695h_v3/Root.zip"
EXPECTED_SHA256 = "2257bb717af6451166d5ac74450c5f624c1f2960845894c549c14b6d2085a3d6"
EXPECTED_BYTES = 382226419
OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/n66hhk695h_v3_derived"
MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024  # 2.0 GiB
SHM_TMP_MP4 = "/dev/shm/r19_n66_clip.mp4"


def check_disk_guard(path: str = "/") -> int:
    free = shutil.disk_usage(path).free
    if free < MIN_FREE_BYTES:
        raise RuntimeError(f"DISK GUARD ABORT: free={free} < {MIN_FREE_BYTES}")
    return free


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def infer_lighting_tag(rgb: np.ndarray, luma_info: dict[str, Any]) -> dict[str, Any]:
    """Classify frame lighting & color cast cleanly from 320px RGB."""
    s = luma_info["scaled_320"].astype(np.float32)
    r_m = float(s[..., 0].mean() / 255.0)
    g_m = float(s[..., 1].mean() / 255.0)
    b_m = float(s[..., 2].mean() / 255.0)
    ml = float(luma_info["mean_luma"])
    cl = float(luma_info["center_luma"])
    is_bl = bool(luma_info["is_backlight"])
    is_dk = bool(luma_info["is_dark"])

    # Color cast detection for green-LED / red-LED / warm / neutral
    if g_m > max(r_m, b_m) * 1.25 and (g_m - max(r_m, b_m)) > 0.04:
        cast = "green_led"
    elif r_m > max(g_m, b_m) * 1.30 and (r_m - max(g_m, b_m)) > 0.05:
        cast = "red_led"
    elif is_bl:
        cast = "backlit"
    elif ml < 0.28:
        cast = "dim"
    elif ml >= 0.45:
        cast = "bright_daylight"
    else:
        cast = "indoor_moderate"

    return {
        "lighting_stratum": cast,
        "rgb_means": [round(r_m, 4), round(g_m, 4), round(b_m, 4)],
        "is_dark_trigger": is_dk,
        "is_backlight_trigger": is_bl,
    }


def read_clip_frames(
    zf: zipfile.ZipFile, member: str, n_samples: int = 8
) -> tuple[list[tuple[int, np.ndarray]], dict[str, Any]]:
    raw = zf.read(member)
    with open(SHM_TMP_MP4, "wb") as f:
        f.write(raw)
    frames: list[tuple[int, np.ndarray]] = []
    meta: dict[str, Any] = {"ok": False, "total_frames": 0, "fps": 0.0, "w": 0, "h": 0}
    try:
        cap = cv2.VideoCapture(SHM_TMP_MP4)
        if not cap.isOpened():
            return frames, meta
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        # Read sequentially so VFR/H264 frame count inaccuracies don't break seeking
        all_bgr = []
        while True:
            ok, bgr = cap.read()
            if not ok or bgr is None:
                break
            all_bgr.append(bgr)
        cap.release()
        actual_n = len(all_bgr)
        meta = {
            "ok": actual_n > 0,
            "reported_frames": total,
            "actual_frames": actual_n,
            "fps": round(fps, 3),
            "w": w,
            "h": h,
        }
        if actual_n == 0:
            return frames, meta
        if actual_n <= n_samples:
            idxs = list(range(actual_n))
        else:
            lo = max(0, int(round(0.06 * (actual_n - 1))))
            hi = min(actual_n - 1, int(round(0.94 * (actual_n - 1))))
            if hi - lo + 1 < n_samples:
                lo, hi = 0, actual_n - 1
            idxs = sorted({int(round(x)) for x in np.linspace(lo, hi, n_samples)})
            # Ensure exact n_samples if rounding collapsed any
            cand = 0
            while len(idxs) < n_samples and cand < actual_n:
                if cand not in idxs:
                    idxs.append(cand)
                cand += 1
            idxs.sort()
        for idx in idxs:
            rgb = cv2.cvtColor(all_bgr[idx], cv2.COLOR_BGR2RGB)
            frames.append((idx, rgb))
    finally:
        if os.path.exists(SHM_TMP_MP4):
            os.remove(SHM_TMP_MP4)
    return frames, meta


def read_full_clip_rgb(zf: zipfile.ZipFile, member: str, max_frames: int = 90) -> tuple[list[np.ndarray], float]:
    raw = zf.read(member)
    with open(SHM_TMP_MP4, "wb") as f:
        f.write(raw)
    out: list[np.ndarray] = []
    fps = 30.0
    try:
        cap = cv2.VideoCapture(SHM_TMP_MP4)
        if cap.isOpened():
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
            while len(out) < max_frames:
                ok, bgr = cap.read()
                if not ok or bgr is None:
                    break
                out.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        cap.release()
    finally:
        if os.path.exists(SHM_TMP_MP4):
            os.remove(SHM_TMP_MP4)
    return out, fps


def extract_participant_id(row: dict[str, str], member: str) -> str:
    for key in ("participant", "participant_id", "subject", "subject_id", "person", "user"):
        if key in row and row[key].strip():
            return row[key].strip()
    m = re.search(r"(p\d{2})", member, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    for v in row.values():
        m2 = re.search(r"(p\d{2})", v or "", re.IGNORECASE)
        if m2:
            return m2.group(1).lower()
    return "unknown"


def assign_participant_splits(
    clip_records: list[dict[str, Any]],
) -> dict[str, str]:
    """Strict participant-disjoint split (~70/15/15 by clip count & lighting strata).

    Only p01 and p02 contain hand_only clips (78 each); placing p01 in train and p02 in test
    ensures both train and held-out test evaluate unseen-participant hand_only + full_body clips.
    """
    by_p: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for c in clip_records:
        by_p[c["participant_id"]].append(c)
    pids = sorted(by_p.keys())

    strata_keys = sorted({c["clip_lighting_stratum"] for c in clip_records})
    tot_clips = len(clip_records)
    tot_vec = collections.Counter(c["clip_lighting_stratum"] for c in clip_records)
    p_vecs = {p: collections.Counter(c["clip_lighting_stratum"] for c in by_p[p]) for p in pids}
    p_clips = {p: len(by_p[p]) for p in pids}

    ratios = {"train": 0.70, "val": 0.15, "test": 0.15}
    cur_clips = {"train": 0, "val": 0, "test": 0}
    cur_p = {"train": 0, "val": 0, "test": 0}
    cur_vec = {sp: collections.Counter() for sp in ratios}
    p_to_split: dict[str, str] = {}

    for pinned_p, pinned_sp in [("p01", "train"), ("p02", "test")]:
        if pinned_p in by_p:
            p_to_split[pinned_p] = pinned_sp
            cur_clips[pinned_sp] += p_clips[pinned_p]
            cur_p[pinned_sp] += 1
            cur_vec[pinned_sp].update(p_vecs[pinned_p])

    remaining = [p for p in pids if p not in p_to_split]
    # Sort largest clip count & rarest lighting strata first
    def sort_key(p: str):
        rarity = sum(p_vecs[p][k] / max(1, tot_vec[k]) for k in strata_keys)
        return (-p_clips[p], -rarity, p)

    for p in sorted(remaining, key=sort_key):
        best_sp = "train"
        best_delta = float("inf")
        for sp in ("train", "val", "test"):
            tgt_c = tot_clips * ratios[sp]
            d_c = (((cur_clips[sp] + p_clips[p] - tgt_c) ** 2) - ((cur_clips[sp] - tgt_c) ** 2)) / max(1.0, tgt_c)
            delta = d_c
            for k in strata_keys:
                tgt_k = max(1.0, tot_vec[k] * ratios[sp])
                d_k = (((cur_vec[sp][k] + p_vecs[p][k] - tgt_k) ** 2) - ((cur_vec[sp][k] - tgt_k) ** 2)) / tgt_k
                delta += 0.5 * d_k
            if delta < best_delta:
                best_delta = delta
                best_sp = sp
        p_to_split[p] = best_sp
        cur_clips[best_sp] += p_clips[p]
        cur_p[best_sp] += 1
        cur_vec[best_sp].update(p_vecs[p])
    return p_to_split


def draw_point_contact_sheet(tiles: list[tuple[str, np.ndarray]], out_path: str, cols: int = 8) -> dict[str, Any]:
    if not tiles:
        return {"saved": False}
    tw, th = 224, 246
    rows = (len(tiles) + cols - 1) // cols
    canvas = np.full((rows * th, cols * tw, 3), 24, dtype=np.uint8)
    for idx, (caption, img_rgb) in enumerate(tiles):
        r, c = divmod(idx, cols)
        y0, x0 = r * th, c * tw
        ih, iw = img_rgb.shape[:2]
        scale = min(220 / max(1, iw), 196 / max(1, ih))
        nw, nh = max(1, int(round(iw * scale))), max(1, int(round(ih * scale)))
        resized = cv2.resize(img_rgb, (nw, nh), interpolation=cv2.INTER_AREA)
        dy = (200 - nh) // 2
        dx = (tw - nw) // 2
        canvas[y0 + dy : y0 + dy + nh, x0 + dx : x0 + dx + nw] = resized
        for li, line in enumerate(caption.split("\n")[:2]):
            cv2.putText(
                canvas,
                line[:33],
                (x0 + 4, y0 + 218 + li * 16),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.36,
                (235, 235, 235),
                1,
                cv2.LINE_AA,
            )
    bgr = cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR)
    cv2.imwrite(out_path, bgr, [cv2.IMWRITE_JPEG_QUALITY, 86])
    return {"saved": True, "path": out_path, "tiles": len(tiles), "bytes": os.path.getsize(out_path)}


def draw_landmarks_overlay(rgb: np.ndarray, lm_pts: list[list[float]]) -> np.ndarray:
    out = rgb.copy()
    h, w = out.shape[:2]
    edges = [
        (0,1),(1,2),(2,3),(3,4),
        (0,5),(5,6),(6,7),(7,8),
        (5,9),(9,10),(10,11),(11,12),
        (9,13),(13,14),(14,15),(15,16),
        (13,17),(17,18),(18,19),(19,20),(0,17),
    ]
    pts_px = [(int(round(p[0] * w)), int(round(p[1] * h))) for p in lm_pts]
    for a, b in edges:
        cv2.line(out, pts_px[a], pts_px[b], (0, 220, 120), 2)
    for i, (px, py) in enumerate(pts_px):
        col = (255, 70, 70) if i == 4 else ((70, 170, 255) if i == 8 else (255, 255, 0))
        cv2.circle(out, (px, py), 4 if i in (4, 8) else 2, col, -1)
    return out


def run_sequential_video_vs_image_benchmark(
    zf: zipfile.ZipFile,
    clip_records: list[dict[str, Any]],
) -> dict[str, Any]:
    """Run sequential VIDEO mode vs IMAGE mode and L0 RAW vs L1 CLAHE320 on stratified lighting clips."""
    # Pick up to 8 clips per lighting stratum across diverse classes & participants
    by_stratum: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for c in clip_records:
        by_stratum[c["clip_lighting_stratum"]].append(c)

    selected: list[dict[str, Any]] = []
    for stratum in sorted(by_stratum.keys()):
        cands = sorted(by_stratum[stratum], key=lambda x: x["clip_member"])
        step = max(1, len(cands) // 10)
        selected.extend(cands[::step][:10])

    det_img_l0 = build_landmarker("IMAGE")
    det_img_l1 = build_landmarker("IMAGE")

    stratum_stats = collections.defaultdict(lambda: {
        "clips": 0, "frames": 0,
        "img_l0": 0, "img_l1": 0, "img_m3": 0,
        "vid_l0": 0, "vid_l1": 0, "vid_m3": 0,
        "vid_l0_dropouts": 0, "img_l0_dropouts": 0,
    })

    for clip in selected:
        frames, fps = read_full_clip_rgb(zf, clip["clip_member"], max_frames=90)
        if not frames:
            continue
        det_vid_l0 = build_landmarker("VIDEO")
        det_vid_l1 = build_landmarker("VIDEO")
        st = stratum_stats[clip["clip_lighting_stratum"]]
        st["clips"] += 1

        prev_img_l0 = False
        prev_vid_l0 = False
        dt_ms = max(1, int(round(1000.0 / max(1.0, fps))))
        for fi, rgb in enumerate(frames):
            h, w = rgb.shape[:2]
            luma_info = compute_luma_stats(rgb)
            c320 = clahe_rgb_exact(luma_info["scaled_320"])
            mp_raw = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
            mp_c320 = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c320))
            ts_ms = (fi + 1) * dt_ms

            r_il0 = det_img_l0.detect(mp_raw)
            r_il1 = det_img_l1.detect(mp_c320)
            r_vl0 = det_vid_l0.detect_for_video(mp_raw, ts_ms)
            r_vl1 = det_vid_l1.detect_for_video(mp_c320, ts_ms)

            il0 = len(r_il0.hand_landmarks or []) > 0
            il1 = len(r_il1.hand_landmarks or []) > 0
            vl0 = len(r_vl0.hand_landmarks or []) > 0
            vl1 = len(r_vl1.hand_landmarks or []) > 0
            im3 = il0 if (il0 or not luma_info["is_dark"]) else il1
            vm3 = vl0 if (vl0 or not luma_info["is_dark"]) else vl1

            st["frames"] += 1
            if il0: st["img_l0"] += 1
            if il1: st["img_l1"] += 1
            if im3: st["img_m3"] += 1
            if vl0: st["vid_l0"] += 1
            if vl1: st["vid_l1"] += 1
            if vm3: st["vid_m3"] += 1
            if prev_img_l0 and not il0: st["img_l0_dropouts"] += 1
            if prev_vid_l0 and not vl0: st["vid_l0_dropouts"] += 1
            prev_img_l0 = il0
            prev_vid_l0 = vl0

        det_vid_l0.close()
        det_vid_l1.close()

    det_img_l0.close()
    det_img_l1.close()

    out = {}
    tot_all = {"clips": 0, "frames": 0, "img_l0": 0, "img_l1": 0, "img_m3": 0, "vid_l0": 0, "vid_l1": 0, "vid_m3": 0, "img_l0_dropouts": 0, "vid_l0_dropouts": 0}
    for k, v in sorted(stratum_stats.items()):
        f = max(1, v["frames"])
        out[k] = {
            **v,
            "img_l0_pct": round(100.0 * v["img_l0"] / f, 2),
            "img_l1_pct": round(100.0 * v["img_l1"] / f, 2),
            "img_m3_pct": round(100.0 * v["img_m3"] / f, 2),
            "vid_l0_pct": round(100.0 * v["vid_l0"] / f, 2),
            "vid_l1_pct": round(100.0 * v["vid_l1"] / f, 2),
            "vid_m3_pct": round(100.0 * v["vid_m3"] / f, 2),
        }
        for kk in tot_all:
            tot_all[kk] += v[kk]
    fa = max(1, tot_all["frames"])
    out["OVERALL"] = {
        **tot_all,
        "img_l0_pct": round(100.0 * tot_all["img_l0"] / fa, 2),
        "img_l1_pct": round(100.0 * tot_all["img_l1"] / fa, 2),
        "img_m3_pct": round(100.0 * tot_all["img_m3"] / fa, 2),
        "vid_l0_pct": round(100.0 * tot_all["vid_l0"] / fa, 2),
        "vid_l1_pct": round(100.0 * tot_all["vid_l1"] / fa, 2),
        "vid_m3_pct": round(100.0 * tot_all["vid_m3"] / fa, 2),
    }
    return out


def main() -> None:
    t_start = time.perf_counter()
    free0 = check_disk_guard("/")
    os.makedirs(OUT_DIR, exist_ok=True)

    actual_bytes = os.path.getsize(ZIP_PATH)
    actual_sha = sha256_file(ZIP_PATH)
    if actual_bytes != EXPECTED_BYTES or actual_sha != EXPECTED_SHA256:
        raise RuntimeError(
            f"Root.zip integrity mismatch: bytes={actual_bytes} (exp {EXPECTED_BYTES}), "
            f"sha256={actual_sha} (exp {EXPECTED_SHA256})"
        )
    print(f"Verified Root.zip bytes={actual_bytes}, sha256={actual_sha}, free={free0}", flush=True)

    zf = zipfile.ZipFile(ZIP_PATH)
    names = zf.namelist()
    meta_members = [n for n in names if os.path.basename(n).lower() == "metadata.csv"]
    if not meta_members:
        raise RuntimeError("metadata.csv not found inside Root.zip")
    meta_csv_bytes = zf.read(meta_members[0])
    with open(os.path.join(OUT_DIR, "metadata.csv"), "wb") as f:
        f.write(meta_csv_bytes)

    meta_text = meta_csv_bytes.decode("utf-8-sig", errors="replace")
    meta_rows = list(csv.DictReader(io.StringIO(meta_text)))
    print(f"metadata.csv columns={list(meta_rows[0].keys()) if meta_rows else []}, rows={len(meta_rows)}", flush=True)

    mp4_members = sorted(n for n in names if n.lower().endswith(".mp4") and not n.startswith("__MACOSX"))
    mp4_by_basename = {os.path.basename(n): n for n in mp4_members}
    mp4_by_rel = {n: n for n in mp4_members}
    # Index metadata rows by filename/path
    meta_lookup: dict[str, dict[str, str]] = {}
    for row in meta_rows:
        for val in row.values():
            if val and val.strip().lower().endswith(".mp4"):
                v = val.strip().replace("\\", "/")
                meta_lookup[v] = row
                meta_lookup[os.path.basename(v)] = row

    det_l0 = build_landmarker("IMAGE")
    det_l1 = build_landmarker("IMAGE")

    frame_records: list[dict[str, Any]] = []
    clip_records: list[dict[str, Any]] = []
    missing_mp4_in_meta = 0
    clip_decode_failures: list[str] = []

    # Buckets for point_left / point_right contact sheet (diversify by participant)
    point_tiles: dict[str, list[tuple[str, np.ndarray]]] = {
        "point_left_thumb_out": [],
        "point_left_thumb_in": [],
        "point_left_miss": [],
        "point_right_thumb_out": [],
        "point_right_thumb_in": [],
        "point_right_miss": [],
    }
    point_seen_p: dict[str, set[str]] = collections.defaultdict(set)

    for ci, member in enumerate(mp4_members):
        row = meta_lookup.get(member) or meta_lookup.get(os.path.basename(member)) or {}
        if not row:
            missing_mp4_in_meta += 1
        parts = member.split("/")
        # Typical layout: Root/<modality>/<class>/<file>.mp4 or <class>/<file>.mp4
        cls_name = row.get("label") or row.get("gesture") or row.get("class") or (parts[-2] if len(parts) >= 2 else "unknown")
        modality = row.get("modality") or row.get("view") or ("hand_only" if "hand_only" in member.lower() else ("full_body" if "full_body" in member.lower() else "unknown"))
        pid = extract_participant_id(row, member)

        sampled, clip_meta = read_clip_frames(zf, member, n_samples=8)
        if not clip_meta["ok"]:
            clip_decode_failures.append(member)
            continue

        clip_strata = []
        clip_lumas = []
        # Run paired L1 on every 4th clip (100% of frames in those 338 clips across all classes/participants)
        # AND always on any L0 miss!
        run_l1_paired_clip = (ci % 4 == 0)

        for fi_pos, (frame_idx, rgb) in enumerate(sampled):
            luma_info = compute_luma_stats(rgb)
            light_tag = infer_lighting_tag(rgb, luma_info)
            clip_strata.append(light_tag["lighting_stratum"])
            clip_lumas.append(luma_info["mean_luma"])

            # Run L0 RAW; run L1 on L0 miss OR if paired clip OR if dark/backlit/red/green LED frame
            is_stress = (
                run_l1_paired_clip
                or light_tag["lighting_stratum"] in ("dim", "backlit", "green_led", "red_led")
            )
            mp_res = detect_l0_l1(rgb, det_l0, det_l1, run_l1_always=is_stress)
            l0_n = mp_res["l0"]["n_hands"]
            l1_n = mp_res["l1"]["n_hands"] if mp_res["l1"] is not None else None
            m3_n = l0_n if (l0_n > 0 or not mp_res["is_dark"]) else (l1_n or 0)

            rec = {
                "sample_id": f"n66v3_{len(frame_records):05d}",
                "clip_idx": ci,
                "clip_member": member,
                "participant_id": pid,
                "class_name": cls_name,
                "modality": modality,
                "frame_idx": frame_idx,
                "clip_total_frames": clip_meta["actual_frames"],
                "is_stratified_paired_clip": run_l1_paired_clip,
                "paired_l1_evaluated": mp_res["l1"] is not None,
                "lighting_stratum": light_tag["lighting_stratum"],
                "rgb_means": light_tag["rgb_means"],
                "detector_miss_l0": l0_n == 0,
                "detector_miss_l1": (l1_n == 0) if l1_n is not None else None,
                "m3_detected": m3_n > 0,
                **mp_res,
            }
            frame_records.append(rec)

            # Audit point_left / point_right frames for visual contact sheet
            if cls_name in ("point_left", "point_right") and fi_pos in (3, 4):
                primary = mp_res["l0"]["hands"][0] if l0_n > 0 else (mp_res["l1"]["hands"][0] if l1_n else None)
                vis = draw_landmarks_overlay(rgb, primary["landmarks"]) if primary else rgb
                if primary:
                    g = primary["geom"]
                    tlat = g["thumb_lateral"]
                    leg = g["legacy_thumb_ratio"]
                    hd = (primary["handedness"] or "?")[:1]
                    fac = g["facing_indicator"]
                    cap = (
                        f"{cls_name}|{pid}|{modality[:4]}|{light_tag['lighting_stratum'][:5]}\n"
                        f"{hd} f={fac} u={tlat} r={leg:.2f} ang={g['index_angle_cor_deg']}"
                    )
                    if tlat is not None and tlat >= 1.3:
                        bname = f"{cls_name}_thumb_out"
                    else:
                        bname = f"{cls_name}_thumb_in"
                else:
                    cap = f"{cls_name}|{pid}|{modality[:4]}|{light_tag['lighting_stratum'][:5]}\nMISS L0=0 L1={l1_n}"
                    bname = f"{cls_name}_miss"
                if len(point_tiles[bname]) < 8 and (pid not in point_seen_p[bname] or ci > 900):
                    point_tiles[bname].append((cap, vis))
                    point_seen_p[bname].add(pid)

        dom_stratum = collections.Counter(clip_strata).most_common(1)[0][0]
        clip_records.append({
            "clip_idx": ci,
            "clip_member": member,
            "participant_id": pid,
            "class_name": cls_name,
            "modality": modality,
            "clip_lighting_stratum": dom_stratum,
            "mean_luma_clip": round(float(np.mean(clip_lumas)), 4),
        })
        if (ci + 1) % 200 == 0 or (ci + 1) == len(mp4_members):
            print(
                f"Clips progress: {ci + 1}/{len(mp4_members)} | frames={len(frame_records)} | elapsed={time.perf_counter()-t_start:.1f}s",
                flush=True,
            )

    det_l0.close()
    det_l1.close()

    # Strict participant-disjoint split
    p_to_split = assign_participant_splits(clip_records)
    clip_split = {c["clip_idx"]: p_to_split[c["participant_id"]] for c in clip_records}
    for r in frame_records:
        r["split"] = clip_split[r["clip_idx"]]

    # Sequential VIDEO vs IMAGE benchmark on stratified lighting subset
    print("Running sequential VIDEO vs IMAGE benchmark on stratified clips...", flush=True)
    seq_bench = run_sequential_video_vs_image_benchmark(zf, clip_records)

    check_disk_guard("/")
    jsonl_path = os.path.join(OUT_DIR, "n66hhk695h_v3_landmarks.jsonl")
    with open(jsonl_path, "w") as f:
        for r in frame_records:
            f.write(json.dumps(r) + "\n")

    # Contact sheet for point_left & point_right
    ordered_point = []
    for k in [
        "point_left_thumb_out",
        "point_left_thumb_in",
        "point_left_miss",
        "point_right_thumb_out",
        "point_right_thumb_in",
        "point_right_miss",
    ]:
        ordered_point.extend(point_tiles[k])
    sheet_path = os.path.join(OUT_DIR, "point_samples_audit.jpg")
    sheet_meta = draw_point_contact_sheet(ordered_point[:48], sheet_path, cols=8)

    # Quantitative point_left / point_right inspection
    point_audit: dict[str, Any] = {}
    for cls in ("point_left", "point_right"):
        sub = [r for r in frame_records if r["class_name"] == cls]
        l0_hands = [r["l0"]["hands"][0] for r in sub if r["l0"]["n_hands"] > 0]
        tlats = [h["geom"]["thumb_lateral"] for h in l0_hands if h["geom"]["thumb_lateral"] is not None]
        legs = [h["geom"]["legacy_thumb_ratio"] for h in l0_hands]
        tips_norm = [h["geom"]["thumb_to_index_tip_norm"] for h in l0_hands]
        mcps_norm = [h["geom"]["thumb_to_index_mcp_norm"] for h in l0_hands]
        ip_angs = [h["geom"]["thumb_ip_angle_deg"] for h in l0_hands]
        angs = [h["geom"]["index_angle_cor_deg"] for h in l0_hands if h["geom"]["index_angle_cor_deg"] is not None]
        idx_ext = [h["geom"]["finger_ratios_cor"]["index"] for h in l0_hands]
        mid_ext = [h["geom"]["finger_ratios_cor"]["middle"] for h in l0_hands]
        hd_cnt = collections.Counter(h["handedness"] for h in l0_hands)
        fac_cnt = collections.Counter(h["geom"]["facing_indicator"] for h in l0_hands)
        point_audit[cls] = {
            "total_frames": len(sub),
            "l0_detected": len(l0_hands),
            "handedness_l0": dict(hd_cnt),
            "facing_indicator_l0": {str(k): v for k, v in fac_cnt.items()},
            "thumb_lateral_pct_ge_1_3": round(100.0 * sum(1 for x in tlats if x >= 1.3) / max(1, len(tlats)), 2),
            "thumb_lateral_quantiles_p10_p25_p50_p75_p90": [round(float(np.percentile(tlats, p)), 3) for p in (10, 25, 50, 75, 90)] if tlats else [],
            "legacy_thumb_ratio_pct_gt_1_3": round(100.0 * sum(1 for x in legs if x > 1.3) / max(1, len(legs)), 2),
            "legacy_thumb_ratio_p10_p50_p90": [round(float(np.percentile(legs, p)), 3) for p in (10, 50, 90)] if legs else [],
            "thumb_ip_angle_p10_p50_p90": [round(float(np.percentile(ip_angs, p)), 1) for p in (10, 50, 90)] if ip_angs else [],
            "thumb_to_index_mcp_norm_p10_p50_p90": [round(float(np.percentile(mcps_norm, p)), 3) for p in (10, 50, 90)] if mcps_norm else [],
            "thumb_to_index_tip_norm_p10_p50_p90": [round(float(np.percentile(tips_norm, p)), 3) for p in (10, 50, 90)] if tips_norm else [],
            "index_ratio_cor_pct_ge_1_1": round(100.0 * sum(1 for x in idx_ext if x >= 1.1) / max(1, len(idx_ext)), 2),
            "middle_ratio_cor_pct_lt_1_0": round(100.0 * sum(1 for x in mid_ext if x < 1.0) / max(1, len(mid_ext)), 2),
            "index_angle_cor_p10_p50_p90": [round(float(np.percentile(angs, p)), 1) for p in (10, 50, 90)] if angs else [],
        }

    # Aggregate recall by class and by lighting stratum (paired L0 vs L1 vs M3 on paired subset + all L0)
    by_class = collections.defaultdict(lambda: {"frames": 0, "l0_det": 0, "l0_miss": 0, "l0_miss_l1_rec": 0, "paired_n": 0, "paired_l0": 0, "paired_l1": 0, "paired_m3": 0})
    by_light = collections.defaultdict(lambda: {"frames": 0, "l0_det": 0, "l0_miss": 0, "l0_miss_l1_rec": 0, "paired_n": 0, "paired_l0": 0, "paired_l1": 0, "paired_m3": 0})
    split_frames = collections.Counter()
    split_clips = collections.Counter()
    split_pids = collections.defaultdict(set)
    for c in clip_records:
        sp = p_to_split[c["participant_id"]]
        split_clips[sp] += 1
        split_pids[sp].add(c["participant_id"])

    for r in frame_records:
        split_frames[r["split"]] += 1
        l0_d = not r["detector_miss_l0"]
        l1_d = (r["l1"] is not None) and (r["l1"]["n_hands"] > 0)
        m3_d = r["m3_detected"]
        for d in (by_class[r["class_name"]], by_light[r["lighting_stratum"]]):
            d["frames"] += 1
            if l0_d:
                d["l0_det"] += 1
            else:
                d["l0_miss"] += 1
                if l1_d:
                    d["l0_miss_l1_rec"] += 1
            if r["paired_l1_evaluated"]:
                d["paired_n"] += 1
                if l0_d: d["paired_l0"] += 1
                if l1_d: d["paired_l1"] += 1
                if m3_d: d["paired_m3"] += 1

    def fmt_agg(d: dict[str, int]) -> dict[str, Any]:
        fr = max(1, d["frames"])
        pn = max(1, d["paired_n"])
        return {
            **d,
            "l0_recall_pct": round(100.0 * d["l0_det"] / fr, 2),
            "paired_l0_pct": round(100.0 * d["paired_l0"] / pn, 2) if d["paired_n"] else None,
            "paired_l1_clahe320_pct": round(100.0 * d["paired_l1"] / pn, 2) if d["paired_n"] else None,
            "paired_m3_pct": round(100.0 * d["paired_m3"] / pn, 2) if d["paired_n"] else None,
        }

    free1 = check_disk_guard("/")
    summary = {
        "dataset": "Natural RGB Hand Gestures v3 (10.17632/n66hhk695h.3)",
        "license": "CC BY 4.0",
        "root_zip_bytes": actual_bytes,
        "root_zip_sha256": actual_sha,
        "metadata_csv_rows": len(meta_rows),
        "mp4_clips_in_zip": len(mp4_members),
        "clips_decoded": len(clip_records),
        "clip_decode_failures": clip_decode_failures,
        "sampled_frames_total": len(frame_records),
        "missing_mp4_in_metadata_rows": missing_mp4_in_meta,
        "participants_total": len(p_to_split),
        "participant_disjoint_splits": {
            sp: {
                "participants": sorted(split_pids[sp]),
                "n_participants": len(split_pids[sp]),
                "clips": split_clips[sp],
                "frames": split_frames[sp],
            }
            for sp in ("train", "val", "test")
        },
        "overall_sampled": fmt_agg({
            "frames": len(frame_records),
            "l0_det": sum(1 for r in frame_records if not r["detector_miss_l0"]),
            "l0_miss": sum(1 for r in frame_records if r["detector_miss_l0"]),
            "l0_miss_l1_rec": sum(1 for r in frame_records if r["detector_miss_l0"] and r["l1"] and r["l1"]["n_hands"] > 0),
            "paired_n": sum(1 for r in frame_records if r["is_stratified_paired_clip"]),
            "paired_l0": sum(1 for r in frame_records if r["is_stratified_paired_clip"] and not r["detector_miss_l0"]),
            "paired_l1": sum(1 for r in frame_records if r["is_stratified_paired_clip"] and r["l1"] and r["l1"]["n_hands"] > 0),
            "paired_m3": sum(1 for r in frame_records if r["is_stratified_paired_clip"] and r["m3_detected"]),
        }),
        "by_class": {k: fmt_agg(v) for k, v in sorted(by_class.items())},
        "by_lighting_stratum": {k: fmt_agg(v) for k, v in sorted(by_light.items())},
        "sequential_video_vs_image_benchmark": seq_bench,
        "point_left_right_quantitative_audit": point_audit,
        "artifacts": {
            "jsonl_path": jsonl_path,
            "jsonl_bytes": os.path.getsize(jsonl_path),
            "point_samples_audit": sheet_meta,
        },
        "elapsed_s": round(time.perf_counter() - t_start, 2),
        "disk_free_bytes_after": free1,
    }
    stats_path = os.path.join(OUT_DIR, "n66hhk695h_v3_stats.json")
    with open(stats_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
