#!/usr/bin/env python3
"""Curate HandGesture-5G (CC BY 4.0) via HTTP Range Streaming ONLY (zero zip saved to disk).

Steps:
1. Check disk guard (free >= 2.0 GiB).
2. Parse ZIP64 Central Directory via HTTP Range, deduplicate exact CRC32 entries (expect 846 dups, 1,807 unique).
3. Stream unique entries into RAM via ThreadPoolExecutor prefetching, attempt HEIC decode & log skips,
   extract EXIF (DateTimeOriginal, Make, Model, Orientation, ExposureBias, BrightnessValue, ISO),
   decode JPEG via cv2.imdecode (honoring EXIF orientation), compute 64-bit dHash (9x8).
4. Run MediaPipe hand_landmarker.task (RunningMode.IMAGE, MIN_DET_CONF=0.6, MIN_PRES_CONF=0.45, NUM_HANDS=2)
   on L0 RAW and L1 320px exact CLAHE for every decoded image.
5. Build cluster-disjoint Train/Val/Test split grouping dHash hamming <= 8 and timestamp bursts <= 15s
   (same camera model & class) via Union-Find.
6. Write compact JSONL, summary stats JSON, and hg5g_samples_audit.jpg (< 2 MiB). Keep dir < 50 MiB.
"""
from __future__ import annotations

import collections
import concurrent.futures
import datetime as dt
import io
import json
import os
import shutil
import subprocess
import sys
import time
from typing import Any, Optional

import cv2
import numpy as np
from PIL import ExifTags, Image

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/r19-sandbox/work")
from mp_common import build_landmarker, detect_l0_l1
from range_zip import RangeZipReader, ZipEntry

URL = "https://data.mendeley.com/public-files/datasets/wj25crzdbm/files/be3aa0e6-8b18-4563-8201-37e46eadd025/file_downloaded"
OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/handgesture_5g_derived"
MIN_FREE_BYTES = 2 * 1024 * 1024 * 1024  # 2.0 GiB


def check_disk_guard(path: str = "/") -> int:
    usage = shutil.disk_usage(path)
    if usage.free < MIN_FREE_BYTES:
        raise RuntimeError(f"DISK GUARD ABORT: free={usage.free} < {MIN_FREE_BYTES}")
    return usage.free


def _to_float(val: Any) -> Optional[float]:
    if val is None:
        return None
    try:
        return float(val)
    except Exception:
        return None


def extract_exif(raw_bytes: bytes) -> dict[str, Any]:
    out: dict[str, Any] = {
        "orientation": 1,
        "make": None,
        "model": None,
        "datetime_original": None,
        "datetime_epoch": None,
        "exposure_bias": None,
        "brightness_value": None,
        "iso": None,
        "exposure_time": None,
        "f_number": None,
        "raw_width": None,
        "raw_height": None,
    }
    try:
        with Image.open(io.BytesIO(raw_bytes)) as im:
            out["raw_width"], out["raw_height"] = im.size
            ex = im.getexif()
            if ex:
                out["orientation"] = int(ex.get(274, 1) or 1)
                make = ex.get(271)
                model = ex.get(272)
                out["make"] = str(make).strip() if make else None
                out["model"] = str(model).strip() if model else None
                dt_str = ex.get(306)
                ifd = ex.get_ifd(0x8769)
                if ifd:
                    dto = ifd.get(36867) or ifd.get(36868) or dt_str
                    out["exposure_bias"] = _to_float(ifd.get(37380))
                    out["brightness_value"] = _to_float(ifd.get(37379))
                    iso_v = ifd.get(34855)
                    if isinstance(iso_v, (tuple, list)):
                        iso_v = iso_v[0] if iso_v else None
                    out["iso"] = int(iso_v) if iso_v is not None else None
                    out["exposure_time"] = _to_float(ifd.get(33434))
                    out["f_number"] = _to_float(ifd.get(33437))
                else:
                    dto = dt_str
                if dto:
                    dto_s = str(dto).strip()
                    out["datetime_original"] = dto_s
                    try:
                        parsed = dt.datetime.strptime(dto_s, "%Y:%m:%d %H:%M:%S")
                        out["datetime_epoch"] = parsed.timestamp()
                    except Exception:
                        pass
    except Exception:
        pass
    return out


def compute_dhash64(rgb: np.ndarray) -> int:
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    small = cv2.resize(gray, (9, 8), interpolation=cv2.INTER_AREA)
    diff = small[:, 1:] > small[:, :-1]
    val = 0
    for bit in diff.ravel():
        val = (val << 1) | int(bool(bit))
    return val


def classify_exposure(exif: dict[str, Any], mean_luma: float) -> str:
    eb = exif.get("exposure_bias")
    if eb is not None:
        if eb <= -0.3:
            return "low_eb"
        if eb >= 0.3:
            return "high_eb"
        return "correct_eb"
    if mean_luma < 0.35:
        return "low_luma_no_eb"
    if mean_luma > 0.72:
        return "high_luma_no_eb"
    return "mid_luma_no_eb"


def attempt_heic_decode(raw_bytes: bytes, filename: str) -> dict[str, Any]:
    errors = []
    try:
        with Image.open(io.BytesIO(raw_bytes)) as im:
            im.load()
        return {"ok": True, "method": "PIL"}
    except Exception as exc:
        errors.append(f"PIL:{type(exc).__name__}:{exc}")

    arr = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if arr is not None:
        return {"ok": True, "method": "cv2"}
    errors.append("cv2:imdecode_returned_None")

    p_in = "/dev/shm/hg5g_probe.heic"
    p_out = "/dev/shm/hg5g_probe.png"
    try:
        with open(p_in, "wb") as f:
            f.write(raw_bytes)
        proc = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", p_in, p_out],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode == 0 and os.path.exists(p_out):
            return {"ok": True, "method": "ffmpeg"}
        errors.append(f"ffmpeg:rc={proc.returncode}:{proc.stderr.strip()[:180]}")
    except Exception as exc:
        errors.append(f"ffmpeg:{type(exc).__name__}:{exc}")
    finally:
        for p in (p_in, p_out):
            if os.path.exists(p):
                os.remove(p)

    return {"ok": False, "filename": filename, "bytes": len(raw_bytes), "errors": errors}


def build_clusters(records: list[dict[str, Any]]) -> tuple[list[int], dict[str, Any]]:
    """Group burst captures (<=15s same model/class) and same-day/same-model/same-class dHash<=8 into atomic clusters."""
    n = len(records)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> bool:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra
            return True
        return False

    dhash_ints = [int(r["dhash_hex"], 16) for r in records]
    # Exact/near-duplicate dHash hamming <= 8 within same (day, camera_model, class)
    # Prevents plain Lab 302 background wall from transitively chaining unrelated capture days/cameras.
    dhash_edges = 0
    for i in range(n):
        hi = dhash_ints[i]
        di = (records[i]["exif"].get("datetime_original") or "")[:10]
        mi = records[i]["exif"].get("model") or ""
        ci = records[i]["class_name"]
        for j in range(i + 1, n):
            if (
                records[j]["class_name"] == ci
                and (records[j]["exif"].get("model") or "") == mi
                and (records[j]["exif"].get("datetime_original") or "")[:10] == di
                and (hi ^ dhash_ints[j]).bit_count() <= 8
            ):
                if union(i, j):
                    dhash_edges += 1

    # Timestamp burst <= 15s within same (camera_model, gesture_class)
    burst_edges = 0
    by_mc: dict[tuple[str, str], list[tuple[float, int]]] = collections.defaultdict(list)
    for idx, r in enumerate(records):
        ep = r["exif"].get("datetime_epoch")
        mdl = r["exif"].get("model") or "UNKNOWN"
        if ep is not None:
            by_mc[(mdl, r["class_name"])].append((float(ep), idx))
    for key, arr in by_mc.items():
        arr.sort(key=lambda x: x[0])
        for k in range(len(arr) - 1):
            t0, i0 = arr[k]
            for m in range(k + 1, len(arr)):
                t1, i1 = arr[m]
                if t1 - t0 <= 15.0:
                    if union(i0, i1):
                        burst_edges += 1
                else:
                    break

    roots = [find(i) for i in range(n)]
    root_map: dict[int, int] = {}
    cids = []
    for rt in roots:
        if rt not in root_map:
            root_map[rt] = len(root_map)
        cids.append(root_map[rt])

    cluster_sizes = collections.Counter(cids)
    return cids, {
        "num_clusters": len(root_map),
        "dhash_same_day_model_cls_le8_union_edges": dhash_edges,
        "burst_15s_union_edges": burst_edges,
        "max_cluster_size": max(cluster_sizes.values()) if cluster_sizes else 0,
        "median_cluster_size": float(np.median(list(cluster_sizes.values()))) if cluster_sizes else 0.0,
        "singleton_clusters": sum(1 for v in cluster_sizes.values() if v == 1),
    }


def assign_cluster_splits(records: list[dict[str, Any]], cids: list[int]) -> dict[str, Any]:
    classes = sorted({r["class_name"] for r in records})
    clusters: dict[int, list[int]] = collections.defaultdict(list)
    for i, cid in enumerate(cids):
        clusters[cid].append(i)

    dhash_ints = [int(r["dhash_hex"], 16) for r in records]
    ratios = {"train": 0.70, "val": 0.15, "test": 0.15}
    sps = ("train", "val", "test")
    cid_to_split: dict[int, str] = {}

    # Optimize per class independently since every cluster is single-class, ensuring >=1 cluster per split
    for c in classes:
        c_ids = sorted([cid for cid, idxs in clusters.items() if records[idxs[0]]["class_name"] == c], key=lambda x: (-len(clusters[x]), x))
        tot_c = sum(len(clusters[cid]) for cid in c_ids)
        adj_le8: dict[tuple[int, int], int] = {}
        for a_i in range(len(c_ids)):
            for b_i in range(a_i + 1, len(c_ids)):
                ca, cb = c_ids[a_i], c_ids[b_i]
                cnt = sum(1 for i in clusters[ca] for j in clusters[cb] if (dhash_ints[i] ^ dhash_ints[j]).bit_count() <= 8)
                if cnt:
                    adj_le8[(ca, cb)] = adj_le8[(cb, ca)] = cnt

        best_score = (1e18, 1e18, 1e18)
        best_assign: list[int] = []
        if len(c_ids) <= 10:
            def search(k: int, counts: list[int], assign: list[int]) -> None:
                nonlocal best_score, best_assign
                if k == len(c_ids):
                    if any(counts[s] == 0 for s in range(3)):
                        return
                    cross = sum(adj_le8.get((c_ids[a], c_ids[b]), 0) for a in range(len(c_ids)) for b in range(a + 1, len(c_ids)) if assign[a] != assign[b])
                    rerr = sum(((counts[s] - tot_c * ratios[sps[s]]) ** 2) / max(1.0, tot_c * ratios[sps[s]]) for s in range(3))
                    pen = 1 if (counts[0] < tot_c * 0.45 or counts[1] < 25 or counts[2] < 25) else 0
                    sc = (pen, cross, rerr)
                    if sc < best_score:
                        best_score = sc
                        best_assign = list(assign)
                    return
                if (len(c_ids) - k) < sum(1 for s in range(3) if counts[s] == 0):
                    return
                sz = len(clusters[c_ids[k]])
                for s in range(3):
                    counts[s] += sz
                    assign[k] = s
                    search(k + 1, counts, assign)
                    counts[s] -= sz
            search(0, [0, 0, 0], [0] * len(c_ids))
        else:
            assign = [0] * len(c_ids)
            assign[1] = 1
            assign[2] = 2
            for k in range(3, len(c_ids)):
                best_s, bs = 0, (1e18, 1e18)
                for s in range(3):
                    assign[k] = s
                    cnts = [0, 0, 0]
                    for i2 in range(k + 1):
                        cnts[assign[i2]] += len(clusters[c_ids[i2]])
                    cross = sum(adj_le8.get((c_ids[a], c_ids[b]), 0) for a in range(k + 1) for b in range(a + 1, k + 1) if assign[a] != assign[b])
                    rerr = sum(((cnts[ss] - tot_c * ratios[sps[ss]]) ** 2) / max(1.0, tot_c * ratios[sps[ss]]) for ss in range(3))
                    if (cross, rerr) < bs:
                        bs, best_s = (cross, rerr), s
                assign[k] = best_s
            for _ in range(5):
                for k in range(len(c_ids)):
                    best_s = assign[k]
                    for s in range(3):
                        assign[k] = s
                        cnts = [0, 0, 0]
                        for i2 in range(len(c_ids)):
                            cnts[assign[i2]] += len(clusters[c_ids[i2]])
                        if any(x == 0 for x in cnts):
                            continue
                        cross = sum(adj_le8.get((c_ids[a], c_ids[b]), 0) for a in range(len(c_ids)) for b in range(a + 1, len(c_ids)) if assign[a] != assign[b])
                        rerr = sum(((cnts[ss] - tot_c * ratios[sps[ss]]) ** 2) / max(1.0, tot_c * ratios[sps[ss]]) for ss in range(3))
                        pen = 1 if (cnts[0] < tot_c * 0.45 or cnts[1] < 25 or cnts[2] < 25) else 0
                        if (pen, cross, rerr) < best_score:
                            best_score = (pen, cross, rerr)
                            best_s = s
                    assign[k] = best_s
            best_assign = assign
        for k, s in enumerate(best_assign):
            cid_to_split[c_ids[k]] = sps[s]

    for i, cid in enumerate(cids):
        records[i]["cluster_id"] = int(cid)
        records[i]["split"] = cid_to_split[cid]

    # Leakage verification across splits
    split_indices = {sp: [i for i, r in enumerate(records) if r["split"] == sp] for sp in ratios}
    cross_same_cls_day_mdl_le8 = 0
    cross_same_cls_le8_any_day = 0
    cross_same_cls_le4_any_day = 0
    cross_burst_le15 = 0
    min_cross_dt_s: Optional[float] = None
    for s1, s2 in [("train", "val"), ("train", "test"), ("val", "test")]:
        for i in split_indices[s1]:
            hi = dhash_ints[i]
            ri = records[i]
            epi = ri["exif"].get("datetime_epoch")
            mi = ri["exif"].get("model") or "UNKNOWN"
            di = (ri["exif"].get("datetime_original") or "")[:10]
            ci = ri["class_name"]
            for j in split_indices[s2]:
                rj = records[j]
                if rj["class_name"] == ci:
                    hd = (hi ^ dhash_ints[j]).bit_count()
                    if hd <= 4:
                        cross_same_cls_le4_any_day += 1
                    if hd <= 8:
                        cross_same_cls_le8_any_day += 1
                        if (rj["exif"].get("model") or "UNKNOWN") == mi and (rj["exif"].get("datetime_original") or "")[:10] == di:
                            cross_same_cls_day_mdl_le8 += 1
                if (rj["exif"].get("model") or "UNKNOWN") == mi and rj["class_name"] == ci:
                    epj = rj["exif"].get("datetime_epoch")
                    if epi is not None and epj is not None:
                        dt_s = abs(epi - epj)
                        if min_cross_dt_s is None or dt_s < min_cross_dt_s:
                            min_cross_dt_s = dt_s
                        if dt_s <= 15.0:
                            cross_burst_le15 += 1

    split_counts = {
        sp: {
            "total": len(split_indices[sp]),
            "clusters": len({cids[i] for i in split_indices[sp]}),
            "by_class": {
                c: sum(1 for i in split_indices[sp] if records[i]["class_name"] == c)
                for c in classes
            },
        }
        for sp in ("train", "val", "test")
    }
    return {
        "split_counts": split_counts,
        "leakage_audit": {
            "cross_split_shared_clusters": 0,
            "cross_split_same_cls_day_model_dhash_le_8": cross_same_cls_day_mdl_le8,
            "cross_split_same_cls_le_4_any_day": cross_same_cls_le4_any_day,
            "cross_split_same_cls_le_8_diff_day_model": cross_same_cls_le8_any_day - cross_same_cls_day_mdl_le8,
            "cross_split_burst_le_15s": cross_burst_le15,
            "min_cross_split_same_model_class_dt_s": round(min_cross_dt_s, 2) if min_cross_dt_s is not None else None,
        },
    }


def draw_contact_sheet(tiles: list[tuple[str, np.ndarray]], out_path: str, cols: int = 8) -> dict[str, Any]:
    if not tiles:
        return {"saved": False}
    tw, th = 224, 244
    rows = (len(tiles) + cols - 1) // cols
    canvas = np.full((rows * th, cols * tw, 3), 24, dtype=np.uint8)
    for idx, (caption, img_rgb) in enumerate(tiles):
        r, c = divmod(idx, cols)
        y0, x0 = r * th, c * tw
        # Letterbox 224x200
        ih, iw = img_rgb.shape[:2]
        scale = min(220 / max(1, iw), 196 / max(1, ih))
        nw, nh = max(1, int(round(iw * scale))), max(1, int(round(ih * scale)))
        resized = cv2.resize(img_rgb, (nw, nh), interpolation=cv2.INTER_AREA)
        dy = (200 - nh) // 2
        dx = (tw - nw) // 2
        canvas[y0 + dy : y0 + dy + nh, x0 + dx : x0 + dx + nw] = resized
        # Caption bar (2 lines)
        lines = caption.split("\n")[:2]
        for li, line in enumerate(lines):
            cv2.putText(
                canvas,
                line[:32],
                (x0 + 4, y0 + 216 + li * 16),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.38,
                (235, 235, 235),
                1,
                cv2.LINE_AA,
            )
    bgr = cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR)
    cv2.imwrite(out_path, bgr, [cv2.IMWRITE_JPEG_QUALITY, 86])
    sz = os.path.getsize(out_path)
    return {"saved": True, "path": out_path, "tiles": len(tiles), "bytes": sz}


def main() -> None:
    t_start = time.perf_counter()
    free0 = check_disk_guard("/")
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Start HandGesture-5G HTTP Range curation | free_bytes={free0}", flush=True)

    rz = RangeZipReader(URL, timeout=30.0, max_retries=6)
    entries = rz.parse_central_directory()
    img_entries = [
        e for e in entries
        if not e.filename.endswith("/")
        and not e.filename.startswith("__MACOSX")
        and e.filename.lower().endswith((".jpg", ".jpeg", ".png", ".heic"))
    ]
    # Deterministic order favoring canonical filename (shorter name first before " 2.JPG")
    img_entries.sort(key=lambda e: (len(e.filename), e.filename))

    seen_crc: dict[int, ZipEntry] = {}
    unique_entries: list[ZipEntry] = []
    dup_count = 0
    for e in img_entries:
        if e.crc32 not in seen_crc:
            seen_crc[e.crc32] = e
            unique_entries.append(e)
        else:
            dup_count += 1

    print(
        f"CD parsed: total_zip_bytes={rz.total_size}, total_entries={len(entries)}, "
        f"img_entries={len(img_entries)}, unique_crc={len(unique_entries)}, dup_skipped={dup_count}",
        flush=True,
    )

    det_l0 = build_landmarker("IMAGE")
    det_l1 = build_landmarker("IMAGE")

    records: list[dict[str, Any]] = []
    heic_skips: list[dict[str, Any]] = []
    decode_errors: list[dict[str, Any]] = []

    # Reservoirs for audit contact sheet (keep <= 56 tiles total)
    sheet_buckets: dict[str, list[tuple[str, np.ndarray]]] = {
        "L-Sign_pos_facing": [],
        "L-Sign_neg_facing": [],
        "L-Sign_miss": [],
        "Pointing Up_ok": [],
        "Pointing Up_miss": [],
        "Other_ok": [],
        "L1_recovered": [],
        "Both_miss": [],
    }

    batch_size = 48
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for b0 in range(0, len(unique_entries), batch_size):
            batch = unique_entries[b0 : b0 + batch_size]
            futs = [pool.submit(rz.fetch_entry_bytes, e, True) for e in batch]
            for e, fut in zip(batch, futs):
                raw_bytes = fut.result()
                parts = e.filename.split("/")
                cls_name = parts[1] if len(parts) >= 3 and parts[0].startswith("GESTURE") else parts[0]
                ext = e.filename.rsplit(".", 1)[-1].lower()

                if ext == "heic":
                    hres = attempt_heic_decode(raw_bytes, e.filename)
                    if not hres["ok"]:
                        heic_skips.append(hres)
                        continue

                exif = extract_exif(raw_bytes)
                bgr = cv2.imdecode(np.frombuffer(raw_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
                if bgr is None:
                    decode_errors.append({"filename": e.filename, "bytes": len(raw_bytes)})
                    continue
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                dhash_int = compute_dhash64(rgb)
                dhash_hex = f"{dhash_int:016x}"

                mp_res = detect_l0_l1(rgb, det_l0, det_l1, run_l1_always=True)

                # Exposure & clipping stats
                gray = cv2.cvtColor(cv2.resize(rgb, (320, max(1, int(round(320 * rgb.shape[0] / rgb.shape[1])))), interpolation=cv2.INTER_AREA), cv2.COLOR_RGB2GRAY)
                exp_bucket = classify_exposure(exif, mp_res["mean_luma"])

                l0_n = mp_res["l0"]["n_hands"]
                l1_n = mp_res["l1"]["n_hands"] if mp_res["l1"] else 0
                m3_n = l0_n if (l0_n > 0 or not mp_res["is_dark"]) else l1_n

                rec = {
                    "sample_id": f"hg5g_{len(records):04d}",
                    "filename": e.filename,
                    "class_name": cls_name,
                    "crc32": f"{e.crc32:08x}",
                    "comp_size": e.comp_size,
                    "uncomp_size": e.uncomp_size,
                    "dhash_hex": dhash_hex,
                    "exif": exif,
                    "exposure_bucket": exp_bucket,
                    "luma_p05": round(float(np.percentile(gray, 5)) / 255.0, 4),
                    "luma_p50": round(float(np.percentile(gray, 50)) / 255.0, 4),
                    "luma_p95": round(float(np.percentile(gray, 95)) / 255.0, 4),
                    "pct_clipped_low": round(float((gray <= 10).mean() * 100.0), 3),
                    "pct_clipped_high": round(float((gray >= 250).mean() * 100.0), 3),
                    "detector_miss_l0": l0_n == 0,
                    "detector_miss_l1": l1_n == 0,
                    "detector_miss_both": (l0_n == 0 and l1_n == 0),
                    "m3_detected": m3_n > 0,
                    **mp_res,
                }
                records.append(rec)

                # Populate audit contact sheet buckets
                thumb = cv2.resize(rgb, (224, max(1, int(round(224 * rgb.shape[0] / rgb.shape[1])))), interpolation=cv2.INTER_AREA)
                if thumb.shape[0] > 224:
                    thumb = cv2.resize(rgb, (max(1, int(round(224 * rgb.shape[1] / rgb.shape[0]))), 224), interpolation=cv2.INTER_AREA)

                primary_l0 = mp_res["l0"]["hands"][0] if l0_n > 0 else None
                facing = primary_l0["geom"]["facing_indicator"] if primary_l0 else None
                tlat = primary_l0["geom"]["thumb_lateral"] if primary_l0 else None
                hd = (primary_l0["handedness"] or "?")[:1] if primary_l0 else "-"
                cap = (
                    f"{cls_name[:9]}|{os.path.basename(e.filename)[:12]}\n"
                    f"L0:{l0_n} L1:{l1_n} y={mp_res['mean_luma']:.2f} {hd} f={facing} u={tlat}"
                )
                if l0_n == 0 and l1_n > 0 and len(sheet_buckets["L1_recovered"]) < 8:
                    sheet_buckets["L1_recovered"].append((cap, thumb))
                elif l0_n == 0 and l1_n == 0 and len(sheet_buckets["Both_miss"]) < 8:
                    sheet_buckets["Both_miss"].append((cap, thumb))
                elif cls_name == "L-Sign":
                    if l0_n == 0 and len(sheet_buckets["L-Sign_miss"]) < 6:
                        sheet_buckets["L-Sign_miss"].append((cap, thumb))
                    elif facing == 1.0 and len(sheet_buckets["L-Sign_pos_facing"]) < 10:
                        sheet_buckets["L-Sign_pos_facing"].append((cap, thumb))
                    elif facing == -1.0 and len(sheet_buckets["L-Sign_neg_facing"]) < 10:
                        sheet_buckets["L-Sign_neg_facing"].append((cap, thumb))
                elif cls_name == "Pointing Up":
                    if l0_n == 0 and len(sheet_buckets["Pointing Up_miss"]) < 4:
                        sheet_buckets["Pointing Up_miss"].append((cap, thumb))
                    elif l0_n > 0 and len(sheet_buckets["Pointing Up_ok"]) < 8:
                        sheet_buckets["Pointing Up_ok"].append((cap, thumb))
                elif l0_n > 0 and len(sheet_buckets["Other_ok"]) < 6:
                    sheet_buckets["Other_ok"].append((cap, thumb))

            if (b0 + len(batch)) % 240 < batch_size or (b0 + len(batch)) == len(unique_entries):
                print(
                    f"Progress: {b0 + len(batch)}/{len(unique_entries)} streamed | decoded={len(records)} | "
                    f"heic_skips={len(heic_skips)} | elapsed={time.perf_counter()-t_start:.1f}s",
                    flush=True,
                )

    det_l0.close()
    det_l1.close()

    # Clustering & split
    cids, cluster_stats = build_clusters(records)
    split_info = assign_cluster_splits(records, cids)

    check_disk_guard("/")
    jsonl_path = os.path.join(OUT_DIR, "handgesture_5g_landmarks.jsonl")
    with open(jsonl_path, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    # Save contact sheet
    ordered_tiles = []
    for k in [
        "L-Sign_pos_facing",
        "L-Sign_neg_facing",
        "Pointing Up_ok",
        "Other_ok",
        "L1_recovered",
        "L-Sign_miss",
        "Pointing Up_miss",
        "Both_miss",
    ]:
        ordered_tiles.extend(sheet_buckets[k])
    sheet_path = os.path.join(OUT_DIR, "hg5g_samples_audit.jpg")
    sheet_meta = draw_contact_sheet(ordered_tiles[:56], sheet_path, cols=8)

    # Aggregate statistics
    by_class = collections.defaultdict(lambda: {"total": 0, "l0_det": 0, "l1_det": 0, "m3_det": 0, "both_miss": 0, "l0_miss_l1_rec": 0, "l0_det_l1_miss": 0, "thumb_lateral_l0": [], "legacy_thumb_l0": [], "facing_pos": 0, "facing_neg": 0})
    by_exp = collections.defaultdict(lambda: {"total": 0, "l0_det": 0, "l1_det": 0, "m3_det": 0, "both_miss": 0})
    ori_counts = collections.Counter()
    model_counts = collections.Counter()

    for r in records:
        ori_counts[r["exif"]["orientation"]] += 1
        model_counts[r["exif"]["model"] or "UNKNOWN"] += 1
        c = by_class[r["class_name"]]
        e = by_exp[r["exposure_bucket"]]
        l0_d = not r["detector_miss_l0"]
        l1_d = not r["detector_miss_l1"]
        m3_d = r["m3_detected"]
        for d in (c, e):
            d["total"] += 1
            if l0_d: d["l0_det"] += 1
            if l1_d: d["l1_det"] += 1
            if m3_d: d["m3_det"] += 1
            if not l0_d and not l1_d: d["both_miss"] += 1
        if not l0_d and l1_d:
            c["l0_miss_l1_rec"] += 1
        if l0_d and not l1_d:
            c["l0_det_l1_miss"] += 1
        if l0_d:
            g = r["l0"]["hands"][0]["geom"]
            if g["thumb_lateral"] is not None:
                c["thumb_lateral_l0"].append(g["thumb_lateral"])
            c["legacy_thumb_l0"].append(g["legacy_thumb_ratio"])
            if g["facing_indicator"] == 1.0:
                c["facing_pos"] += 1
            elif g["facing_indicator"] == -1.0:
                c["facing_neg"] += 1

    def summarize_bucket(d: dict[str, Any]) -> dict[str, Any]:
        tot = max(1, d["total"])
        res = {
            "total": d["total"],
            "l0_detected": d["l0_det"],
            "l0_recall_pct": round(100.0 * d["l0_det"] / tot, 2),
            "l0_miss": d["total"] - d["l0_det"],
            "l1_clahe320_detected": d["l1_det"],
            "l1_recall_pct": round(100.0 * d["l1_det"] / tot, 2),
            "m3_detected": d["m3_det"],
            "m3_recall_pct": round(100.0 * d["m3_det"] / tot, 2),
            "both_miss": d["both_miss"],
        }
        if "l0_miss_l1_rec" in d:
            res["l0_miss_l1_recovered"] = d["l0_miss_l1_rec"]
            res["l0_det_l1_missed"] = d["l0_det_l1_miss"]
            res["facing_pos_count"] = d["facing_pos"]
            res["facing_neg_count"] = d["facing_neg"]
            if d["thumb_lateral_l0"]:
                arr = np.array(d["thumb_lateral_l0"])
                res["thumb_lateral_p10_p50_p90"] = [round(float(np.percentile(arr, p)), 3) for p in (10, 50, 90)]
            if d["legacy_thumb_l0"]:
                arr2 = np.array(d["legacy_thumb_l0"])
                res["legacy_thumb_ratio_p10_p50_p90"] = [round(float(np.percentile(arr2, p)), 3) for p in (10, 50, 90)]
        return res

    free1 = check_disk_guard("/")
    dir_bytes = sum(
        os.path.getsize(os.path.join(OUT_DIR, fn))
        for fn in os.listdir(OUT_DIR)
        if os.path.isfile(os.path.join(OUT_DIR, fn))
    )
    summary = {
        "dataset": "HandGesture-5G (10.17632/wj25crzdbm.1)",
        "license": "CC BY 4.0",
        "streaming_mode": "HTTP Range 206 in-memory only (0 B zip saved)",
        "zip_total_bytes": rz.total_size,
        "zip_total_entries": len(entries),
        "zip_image_entries": len(img_entries),
        "crc32_duplicates_skipped": dup_count,
        "unique_crc32_entries": len(unique_entries),
        "decoded_images": len(records),
        "heic_decode_attempts": len(heic_skips),
        "heic_skips": heic_skips,
        "other_decode_errors": decode_errors,
        "exif_orientations": dict(ori_counts),
        "camera_models": dict(model_counts),
        "overall": summarize_bucket({
            "total": len(records),
            "l0_det": sum(1 for r in records if not r["detector_miss_l0"]),
            "l1_det": sum(1 for r in records if not r["detector_miss_l1"]),
            "m3_det": sum(1 for r in records if r["m3_detected"]),
            "both_miss": sum(1 for r in records if r["detector_miss_both"]),
        }),
        "by_class": {k: summarize_bucket(v) for k, v in sorted(by_class.items())},
        "by_exposure_bucket": {k: summarize_bucket(v) for k, v in sorted(by_exp.items())},
        "cluster_stats": cluster_stats,
        "splits": split_info,
        "artifacts": {
            "jsonl_path": jsonl_path,
            "jsonl_bytes": os.path.getsize(jsonl_path),
            "contact_sheet": sheet_meta,
            "total_dir_bytes_before_summary": dir_bytes,
        },
        "elapsed_s": round(time.perf_counter() - t_start, 2),
        "disk_free_bytes_after": free1,
    }
    stats_path = os.path.join(OUT_DIR, "handgesture_5g_stats.json")
    with open(stats_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
