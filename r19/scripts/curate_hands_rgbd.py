#!/usr/bin/env python3
"""Curate HANDS RGB-D (10.17632/ndrczc35bt.2, CC BY 4.0, EVAL_ONLY) selective slice via HTTP Range.

Checks df -B1 / >= 2.2 GiB before running.
Streams ONLY RGB PNGs (never Depth zips, 0 B zip stored) for:
  - ALL Horiz_HBL+HFR (750) and Horiz_HFL+HBR (750) across Subject1..5
  - Stratified 30/subject (150 each) of Punch_VFR+VFL, Five_VFR+VFL (open/stop), TimeOut, Span_VFR+VFL, One_VFR+VFL, Two_VFR+VFL
  - Stratified 20/subject (100 each) of Six_VFR+VFL, Seven_VFR+VFL, Eight_VFR+VFL (thumb/index L-shape check)
Extracts MediaPipe landmarks (L0 RAW & L1 320px CLAHE), preserves GT bounding boxes,
and writes < 20 MiB to /srv/sketchbook/mediapipe-optimize/r19-sandbox/data/hands_rgbd_eval/
plus hands_rgbd_horiz_audit.jpg (< 2 MiB).
"""
from __future__ import annotations

import collections
import concurrent.futures
import csv
import io
import json
import os
import shutil
import sys
import time
import urllib.request
from typing import Any

import cv2
import numpy as np

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/r19-sandbox/work")
from mp_common import build_landmarker, detect_l0_l1
from range_zip import RangeZipReader, ZipEntry

API_URL = "https://data.mendeley.com/api/datasets/ndrczc35bt/files?version=2"
OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/hands_rgbd_eval"
MIN_START_FREE_BYTES = int(2.2 * 1024 * 1024 * 1024)
MIN_FLOOR_BYTES = 2 * 1024 * 1024 * 1024  # 2.0 GiB


def check_disk(min_bytes: int) -> int:
    free = shutil.disk_usage("/").free
    if free < min_bytes:
        raise RuntimeError(f"DISK GUARD ABORT: free={free} < {min_bytes}")
    return free


def parse_bbox(s: str) -> list[int] | None:
    s = s.strip().strip("[]")
    parts = [int(round(float(x))) for x in s.split()]
    if len(parts) == 4 and any(v != 0 for v in parts):
        return parts
    return None


def draw_audit_sheet(tiles: list[tuple[str, np.ndarray]], out_path: str, cols: int = 8) -> dict[str, Any]:
    if not tiles:
        return {"saved": False}
    tw, th = 224, 210
    rows = (len(tiles) + cols - 1) // cols
    canvas = np.full((rows * th, cols * tw, 3), 24, dtype=np.uint8)
    for idx, (caption, img_rgb) in enumerate(tiles):
        r, c = divmod(idx, cols)
        y0, x0 = r * th, c * tw
        ih, iw = img_rgb.shape[:2]
        scale = min(220 / max(1, iw), 166 / max(1, ih))
        nw, nh = max(1, int(round(iw * scale))), max(1, int(round(ih * scale)))
        resized = cv2.resize(img_rgb, (nw, nh), interpolation=cv2.INTER_AREA)
        dy = (170 - nh) // 2
        dx = (tw - nw) // 2
        canvas[y0 + dy : y0 + dy + nh, x0 + dx : x0 + dx + nw] = resized
        for li, line in enumerate(caption.split("\n")[:2]):
            cv2.putText(
                canvas,
                line[:33],
                (x0 + 4, y0 + 186 + li * 15),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.35,
                (235, 235, 235),
                1,
                cv2.LINE_AA,
            )
    bgr = cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR)
    cv2.imwrite(out_path, bgr, [cv2.IMWRITE_JPEG_QUALITY, 86])
    return {"saved": True, "path": out_path, "tiles": len(tiles), "bytes": os.path.getsize(out_path)}


def annotate_frame(rgb: np.ndarray, bboxes: dict[str, list[int]], mp_hands: list[dict[str, Any]]) -> np.ndarray:
    out = rgb.copy()
    h, w = out.shape[:2]
    for lbl, (bx, by, bw, bh) in bboxes.items():
        cv2.rectangle(out, (bx, by), (bx + bw, by + bh), (255, 190, 0), 2)
        cv2.putText(out, lbl, (bx, max(12, by - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 190, 0), 1)
    edges = [
        (0,1),(1,2),(2,3),(3,4),
        (0,5),(5,6),(6,7),(7,8),
        (5,9),(9,10),(10,11),(11,12),
        (9,13),(13,14),(14,15),(15,16),
        (13,17),(17,18),(18,19),(19,20),(0,17),
    ]
    for hd in mp_hands:
        pts = [(int(round(p[0] * w)), int(round(p[1] * h))) for p in hd["landmarks"]]
        for a, b in edges:
            cv2.line(out, pts[a], pts[b], (0, 230, 120), 2)
        cv2.circle(out, pts[4], 4, (255, 60, 60), -1)
        cv2.circle(out, pts[8], 4, (60, 160, 255), -1)
    return out


def match_hands_to_bboxes(hands: list[dict[str, Any]], bboxes: dict[str, list[int]], w: int, h: int) -> dict[str, Any]:
    """Match detected MediaPipe hands to GT bounding boxes by center containment / distance."""
    matched = {}
    for lbl, (bx, by, bw, bh) in bboxes.items():
        cx_gt = (bx + bw * 0.5) / max(1, w)
        cy_gt = (by + bh * 0.5) / max(1, h)
        best = None
        best_d = 1e9
        for idx, hd in enumerate(hands):
            pts = hd["landmarks"]
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            hx = sum(xs) / len(xs)
            hy = sum(ys) / len(ys)
            in_box = (bx / w - 0.04 <= hx <= (bx + bw) / w + 0.04) and (by / h - 0.04 <= hy <= (by + bh) / h + 0.04)
            d = ((hx - cx_gt) ** 2 + (hy - cy_gt) ** 2) ** 0.5
            if in_box and d < best_d:
                best_d = d
                best = idx
        matched[lbl] = best
    return matched


def main() -> None:
    t_start = time.perf_counter()
    free0 = check_disk(MIN_START_FREE_BYTES)
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Start HANDS RGB-D selective Range curation | free={free0} (>= 2.2 GiB ok)", flush=True)

    with urllib.request.urlopen(urllib.request.Request(API_URL, headers={"User-Agent": "R19/1.0"}), timeout=25) as r:
        api_files = {f["filename"]: f for f in json.loads(r.read().decode("utf-8"))}

    # Selection budget per scene combo per subject
    combo_quotas = {
        ("Horiz_HBL", "Horiz_HFR"): 150,  # all 150/subj = 750
        ("Horiz_HFL", "Horiz_HBR"): 150,  # all 150/subj = 750
        ("Punch_VFR", "Punch_VFL"): 30,   # 150 total
        ("Five_VFR", "Five_VFL"): 30,     # 150 total (open palm / stop)
        ("TimeOut",): 30,                 # 150 total
        ("Span_VFR", "Span_VFL"): 30,     # 150 total
        ("One_VFR", "One_VFL"): 30,       # 150 total
        ("Two_VFR", "Two_VFL"): 30,       # 150 total
        ("Six_VFR", "Six_VFL"): 20,       # 100 total
        ("Seven_VFR", "Seven_VFL"): 20,   # 100 total
        ("Eight_VFR", "Eight_VFL"): 20,   # 100 total
    }

    det_l0 = build_landmarker("IMAGE")
    det_l1 = build_landmarker("IMAGE")

    records: list[dict[str, Any]] = []
    cd_summary = {}
    audit_tiles: dict[str, list[tuple[str, np.ndarray]]] = collections.defaultdict(list)

    for subj in range(1, 6):
        txt_fn = f"Subject{subj}.txt"
        zip_fn = f"Subject{subj}.zip"
        with urllib.request.urlopen(
            urllib.request.Request(api_files[txt_fn]["content_details"]["download_url"], headers={"User-Agent": "R19/1.0"}),
            timeout=25,
        ) as r:
            txt = r.read().decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(txt))
        cls_cols = [c for c in reader.fieldnames if c not in ("rgb", "depth")]

        by_combo: dict[tuple[str, ...], list[tuple[str, dict[str, list[int]]]]] = collections.defaultdict(list)
        for row in reader:
            bn = row["rgb"].replace("\\", "/").split("/")[-1]
            bboxes = {}
            for c in cls_cols:
                bb = parse_bbox(row[c])
                if bb is not None:
                    bboxes[c] = bb
            combo = tuple(c for c in cls_cols if c in bboxes)
            if combo in combo_quotas:
                by_combo[combo].append((bn, bboxes))

        rz = RangeZipReader(
            api_files[zip_fn]["content_details"]["download_url"],
            timeout=30.0,
            max_retries=8,
            expected_size=int(api_files[zip_fn]["size"]),
        )
        entries = rz.parse_central_directory()
        entry_by_bn = {e.filename.split("/")[-1]: e for e in entries if e.filename.lower().endswith(".png")}
        cd_summary[zip_fn] = {"zip_bytes": rz.total_size, "png_entries": len(entry_by_bn)}

        selected_items: list[tuple[ZipEntry, tuple[str, ...], dict[str, list[int]]]] = []
        for combo, q in combo_quotas.items():
            cands = sorted(by_combo[combo], key=lambda x: x[0])
            if q >= len(cands):
                chosen = cands
            else:
                step = max(1, len(cands) // q)
                chosen = cands[::step][:q]
            for bn, bboxes in chosen:
                if bn in entry_by_bn:
                    selected_items.append((entry_by_bn[bn], combo, bboxes))

        print(f"Subject{subj}: CD={len(entry_by_bn)} PNGs, streaming {len(selected_items)} selected RGB PNGs...", flush=True)

        batch_size = 40
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            for b0 in range(0, len(selected_items), batch_size):
                batch = selected_items[b0 : b0 + batch_size]
                futs = [pool.submit(rz.fetch_entry_bytes, item[0], True) for item in batch]
                for (entry, combo, bboxes), fut in zip(batch, futs):
                    raw = fut.result()
                    bgr = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
                    if bgr is None:
                        continue
                    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                    h, w = rgb.shape[:2]
                    mp_res = detect_l0_l1(rgb, det_l0, det_l1, run_l1_always=True)

                    # Strip world_landmarks from L1 to keep JSONL well under 20 MiB while preserving full L0 & L1 landmarks+geom
                    if mp_res["l1"] is not None:
                        for hd in mp_res["l1"]["hands"]:
                            hd.pop("world_landmarks", None)

                    m_l0 = match_hands_to_bboxes(mp_res["l0"]["hands"], bboxes, w, h)
                    m_l1 = match_hands_to_bboxes(mp_res["l1"]["hands"], bboxes, w, h) if mp_res["l1"] else {}

                    rec = {
                        "sample_id": f"hrgbd_s{subj}_{len(records):04d}",
                        "subject": f"Subject{subj}",
                        "filename": entry.filename,
                        "combo": list(combo),
                        "gt_bboxes": bboxes,
                        "gt_match_l0": m_l0,
                        "gt_match_l1": m_l1,
                        "detector_miss_l0_any": any(v is None for v in m_l0.values()),
                        "detector_miss_l0_all": mp_res["l0"]["n_hands"] == 0,
                        "detector_miss_l1_any": any(v is None for v in m_l1.values()) if m_l1 else True,
                        **mp_res,
                    }
                    records.append(rec)

                    ckey = "+".join(combo)
                    is_horiz = ckey.startswith("Horiz_")
                    max_ok = 6 if is_horiz else 2
                    max_miss = 4 if is_horiz else 1
                    if len(audit_tiles[ckey]) < max_ok or (rec["detector_miss_l0_any"] and len(audit_tiles[f"{ckey}_miss"]) < max_miss):
                        vis = annotate_frame(rgb, bboxes, mp_res["l0"]["hands"])
                        # Crop tightly around active GT boxes for readability on contact sheet
                        xs = [bb[0] for bb in bboxes.values()] + [bb[0] + bb[2] for bb in bboxes.values()]
                        ys = [bb[1] for bb in bboxes.values()] + [bb[1] + bb[3] for bb in bboxes.values()]
                        x0 = max(0, min(xs) - 40)
                        y0 = max(0, min(ys) - 40)
                        x1 = min(w, max(xs) + 40)
                        y1 = min(h, max(ys) + 40)
                        crop = vis[y0:y1, x0:x1]
                        cap = (
                            f"S{subj}|{ckey[:20]}\n"
                            f"L0:{mp_res['l0']['n_hands']} L1:{mp_res['l1']['n_hands']} m0={list(m_l0.values())}"
                        )
                        if rec["detector_miss_l0_any"] and len(audit_tiles[f"{ckey}_miss"]) < max_miss:
                            audit_tiles[f"{ckey}_miss"].append((cap, crop))
                        elif len(audit_tiles[ckey]) < max_ok:
                            audit_tiles[ckey].append((cap, crop))

    det_l0.close()
    det_l1.close()

    check_disk(MIN_FLOOR_BYTES)
    jsonl_path = os.path.join(OUT_DIR, "hands_rgbd_landmarks.jsonl")
    with open(jsonl_path, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    ordered_tiles = []
    for k in sorted(audit_tiles.keys(), key=lambda x: (0 if x.startswith("Horiz_") else 1, x)):
        ordered_tiles.extend(audit_tiles[k])
    sheet_path = os.path.join(OUT_DIR, "hands_rgbd_horiz_audit.jpg")
    sheet_meta = draw_audit_sheet(ordered_tiles[:48], sheet_path, cols=8)

    # Compute per-hand-label recall (using GT bbox matching!) for L0 vs L1 vs M3
    by_label = collections.defaultdict(lambda: {
        "gt_instances": 0, "l0_matched": 0, "l1_matched": 0, "m3_matched": 0,
        "l0_miss_l1_rec": 0, "facing_pos": 0, "facing_neg": 0,
        "thumb_lateral": [], "legacy_thumb_ratio": [], "index_angle_cor_deg": [],
        "handedness": collections.Counter(),
    })
    for r in records:
        use_l1_for_m3 = r["is_dark"]
        for lbl in r["gt_bboxes"]:
            st = by_label[lbl]
            st["gt_instances"] += 1
            idx0 = r["gt_match_l0"].get(lbl)
            idx1 = r["gt_match_l1"].get(lbl)
            ok0 = idx0 is not None
            ok1 = idx1 is not None
            ok_m3 = ok0 if (ok0 or not use_l1_for_m3) else ok1
            if ok0:
                st["l0_matched"] += 1
                hd = r["l0"]["hands"][idx0]
                g = hd["geom"]
                st["handedness"][hd["handedness"] or "None"] += 1
                if g["facing_indicator"] == 1.0: st["facing_pos"] += 1
                elif g["facing_indicator"] == -1.0: st["facing_neg"] += 1
                if g["thumb_lateral"] is not None: st["thumb_lateral"].append(g["thumb_lateral"])
                st["legacy_thumb_ratio"].append(g["legacy_thumb_ratio"])
                if g["index_angle_cor_deg"] is not None: st["index_angle_cor_deg"].append(g["index_angle_cor_deg"])
            else:
                if ok1:
                    st["l0_miss_l1_rec"] += 1
            if ok1:
                st["l1_matched"] += 1
            if ok_m3:
                st["m3_matched"] += 1

    label_summary = {}
    for lbl, st in sorted(by_label.items()):
        n = max(1, st["gt_instances"])
        label_summary[lbl] = {
            "gt_instances": st["gt_instances"],
            "l0_matched": st["l0_matched"],
            "l0_recall_pct": round(100.0 * st["l0_matched"] / n, 2),
            "l0_miss": st["gt_instances"] - st["l0_matched"],
            "l1_matched": st["l1_matched"],
            "l1_recall_pct": round(100.0 * st["l1_matched"] / n, 2),
            "m3_matched": st["m3_matched"],
            "m3_recall_pct": round(100.0 * st["m3_matched"] / n, 2),
            "l0_miss_l1_recovered": st["l0_miss_l1_rec"],
            "handedness_l0": dict(st["handedness"]),
            "facing_pos": st["facing_pos"],
            "facing_neg": st["facing_neg"],
            "thumb_lateral_p10_p50_p90": [round(float(np.percentile(st["thumb_lateral"], p)), 3) for p in (10, 50, 90)] if st["thumb_lateral"] else [],
            "legacy_thumb_p10_p50_p90": [round(float(np.percentile(st["legacy_thumb_ratio"], p)), 3) for p in (10, 50, 90)] if st["legacy_thumb_ratio"] else [],
            "index_angle_cor_p10_p50_p90": [round(float(np.percentile(st["index_angle_cor_deg"], p)), 1) for p in (10, 50, 90)] if st["index_angle_cor_deg"] else [],
        }

    free1 = check_disk(MIN_FLOOR_BYTES)
    summary = {
        "dataset": "HANDS RGB-D (10.17632/ndrczc35bt.2, EVAL_ONLY)",
        "license": "CC BY 4.0",
        "streaming_mode": "HTTP Range 206 selective RGB PNGs in RAM (0 B zip/depth stored)",
        "central_directories": cd_summary,
        "frames_streamed": len(records),
        "by_hand_label": label_summary,
        "artifacts": {
            "jsonl_path": jsonl_path,
            "jsonl_bytes": os.path.getsize(jsonl_path),
            "audit_sheet": sheet_meta,
        },
        "elapsed_s": round(time.perf_counter() - t_start, 2),
        "disk_free_bytes_after": free1,
    }
    stats_path = os.path.join(OUT_DIR, "hands_rgbd_eval_stats.json")
    with open(stats_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
