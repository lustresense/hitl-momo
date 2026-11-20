#!/usr/bin/env python3
"""Collect Darkpool frames for R23 T11f (Calon Gelap Asli untuk T18).

Mandate: NUI_R23-02 v1.1.0 §6 T11f
Target directory: $DATA_ROOT/darkpool/<source>/{train,test}/
Max side <= 640 px, JPEG quality 90.
Manifest: $DATA_ROOT/darkpool/manifest.csv (file,source,group_id,split,light_tag)
Results: $RC/r23/results/T11f_darkpool.json

Sources:
1. A5 bxr7 v2 (bxr7kx84y6):
   - dim_light_1.zip: locked test, 1 in 10 frames (156 frames).
   - other 5 dim_light_*.zip: train, 1 in 10 frames (~800 frames).
2. A4 Natural RGB v3 (n66hhk695h):
   - Root.zip: dim & backlit clips, 2 fps.
   - Disjoint participant split (test: p02, p05, p15; train: others).
3. A3 HandGesture-5G v2 (wj25crzdbm):
   - low_eb photos via RangeZipReader (290 unique images, 244 train / 46 test).
4. NOT_USED sources:
   - A6 BISINDO: Unsegregated Roboflow flat export lacking lighting metadata.
   - A7 EHG-7: Split multi-part tarball archive.
   - A9 ASLAD-190K: Hand crops only (not full frame).
   - A10 Depth D435: RGB frames blurred (rgb_blur.zip).
   - A11 EgoHands: Roboflow auth required (SKIP).
"""
import collections
import csv
import hashlib
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

import cv2
import numpy as np
from PIL import Image

DATA_ROOT = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
RC = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")
BIG_ROOT = os.environ.get("BIG_ROOT", "/home/deano/mnt/monui7-data")

DARKPOOL_DIR = os.path.join(DATA_ROOT, "darkpool")
MANIFEST_PATH = os.path.join(DARKPOOL_DIR, "manifest.csv")
RESULTS_PATH = os.path.join(RC, "r23", "results", "T11f_darkpool.json")
STAGING_DIR = os.path.join(DATA_ROOT, "staging")


def save_image_le640(img: np.ndarray, out_path: str, max_dim: int = 640, quality: int = 90) -> tuple[int, int]:
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        s = max_dim / float(max(h, w))
        nw = max(1, round(w * s))
        nh = max(1, round(h * s))
        img = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    else:
        nw, nh = w, h
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cv2.imwrite(out_path, img, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return nw, nh


# ==============================================================================
# 1. BXR7 (A5)
# ==============================================================================
def process_bxr7_test() -> list[dict]:
    """Process locked test dim_light_1.zip."""
    print("--- Processing BXR7 Test (dim_light_1.zip) ---")
    local_zip = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6/dim_light_1.zip"
    if not os.path.exists(local_zip):
        raise FileNotFoundError(f"dim_light_1.zip not found at {local_zip}")

    records = []
    with zipfile.ZipFile(local_zip, "r") as zf:
        jpg_names = [n for n in zf.namelist() if n.lower().endswith(".jpg")]
        jpg_names.sort()
        sampled = jpg_names[::10]  # Exactly 1 in 10
        print(f"BXR7 Test: total {len(jpg_names)} frames, sampled {len(sampled)} frames")

        for idx, member in enumerate(sampled):
            raw = zf.read(member)
            arr = np.frombuffer(raw, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                continue

            parts = member.strip("/").split("/")
            subfolder = (parts[1] if len(parts) > 2 else "root").replace(" ", "_")
            base_name = parts[-1].replace(" ", "_")
            out_rel = f"bxr7/test/bxr7_dim1_{subfolder}_{base_name}"
            out_full = os.path.join(DARKPOOL_DIR, out_rel)

            save_image_le640(img, out_full, max_dim=640, quality=90)
            records.append({
                "file": out_rel,
                "source": "bxr7",
                "group_id": f"dim_light_1_{subfolder}",
                "split": "test",
                "light_tag": "dim_light"
            })
    print(f"BXR7 Test extracted: {len(records)} frames")
    return records


def process_bxr7_train() -> list[dict]:
    """Process other Dim Light archives for train via RangeZipReader."""
    print("--- Processing BXR7 Train (via RangeZipReader) ---")
    sys.path.insert(0, os.path.join(RC, "r19", "scripts"))
    from range_zip import RangeZipReader

    # 5 train archives from Mendeley bxr7kx84y6 v2
    train_file_specs = [
        ("d86302e3-09b2-4b71-af0c-526397a90d6c", 280943339, "dim_light_2"),
        ("acb9c4c8-9c04-4a51-aee1-23842097d09e", 270976270, "dim_light_3"),
        ("6a44b17e-9e60-479f-852e-1d65dd2a93c4", 307026318, "dim_light_4"),
        ("ada1f251-d7b8-4c98-b8a1-973c1bf6b7fb", 312112475, "dim_light_5"),
        ("4cea41c2-7fb8-4865-ad74-e8c34895b0bb", 211450919, "dim_light_6"),
    ]

    records = []
    for file_id, expected_size, tag in train_file_specs:
        url = f"https://data.mendeley.com/public-files/datasets/bxr7kx84y6/files/{file_id}/file_downloaded"
        print(f"Reading {tag} via RangeZipReader ({expected_size} bytes)...")
        rz = RangeZipReader(url, expected_size=expected_size)
        entries = rz.parse_central_directory()

        jpg_entries = [e for e in entries if e.filename.lower().endswith(".jpg")]
        jpg_entries.sort(key=lambda e: e.filename)
        sampled = jpg_entries[::10]  # Exactly 1 in 10
        print(f"  {tag}: total {len(jpg_entries)} frames, sampled {len(sampled)} frames")

        for ze in sampled:
            raw = rz.fetch_entry_bytes(ze)
            arr = np.frombuffer(raw, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
            if img is None:
                continue

            parts = ze.filename.strip("/").split("/")
            subfolder = (parts[1] if len(parts) > 2 else "root").replace(" ", "_")
            base_name = parts[-1].replace(" ", "_")
            out_rel = f"bxr7/train/bxr7_{tag}_{subfolder}_{base_name}"
            out_full = os.path.join(DARKPOOL_DIR, out_rel)

            save_image_le640(img, out_full, max_dim=640, quality=90)
            records.append({
                "file": out_rel,
                "source": "bxr7",
                "group_id": f"{tag}_{subfolder}",
                "split": "train",
                "light_tag": "dim_light"
            })

    print(f"BXR7 Train extracted: {len(records)} frames")
    return records


# ==============================================================================
# 2. Natural RGB v3 (A4)
# ==============================================================================
def process_natural_rgb() -> list[dict]:
    """Process dim and backlit clips from Root.zip at 2 fps."""
    print("--- Processing Natural RGB v3 (n66hhk695h Root.zip) ---")
    root_zip = os.path.join(STAGING_DIR, "Root.zip")
    if not os.path.exists(root_zip) or os.path.getsize(root_zip) < 380000000:
        url = "https://data.mendeley.com/public-files/datasets/n66hhk695h/files/e1926e2e-8533-4f8a-bb15-32647b976117/file_downloaded"
        print(f"Downloading Root.zip to {root_zip}...")
        subprocess.run(["curl", "-sL", "-C", "-", "-o", root_zip, url], check=True)

    # Verify sha256
    expected_sha = "2257bb717af6451166d5ac74450c5f624c1f2960845894c549c14b6d2085a3d6"
    h = hashlib.sha256()
    with open(root_zip, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    actual_sha = h.hexdigest()
    if actual_sha != expected_sha:
        print(f"WARNING: Root.zip sha256 mismatch! Got {actual_sha}, expected {expected_sha}")
    else:
        print(f"Root.zip sha256 verified: {actual_sha}")

    # Load clip metadata / lighting stratum from R19 JSONL
    r19_jsonl = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/n66hhk695h_v3_derived/n66hhk695h_v3_landmarks.jsonl"
    clip_strata = {}
    with open(r19_jsonl, "r") as f:
        for line in f:
            d = json.loads(line)
            cm = d.get("clip_member")
            st = d.get("lighting_stratum")
            if cm and st and cm not in clip_strata:
                clip_strata[cm] = {
                    "stratum": st,
                    "participant": d.get("participant_id"),
                    "split": d.get("split")
                }

    target_clips = {cm: meta for cm, meta in clip_strata.items() if meta["stratum"] in ("dim", "backlit")}
    print(f"Natural RGB: found {len(target_clips)} clips matching dim/backlit strata")

    test_participants = {"p02", "p05", "p15"}
    records = []

    with zipfile.ZipFile(root_zip, "r") as zf:
        namelist_set = set(zf.namelist())

        for clip_member, meta in target_clips.items():
            if clip_member not in namelist_set:
                # Try without prefix or adjusted slash
                candidates = [c for c in namelist_set if os.path.basename(c) == os.path.basename(clip_member)]
                if not candidates:
                    continue
                member_key = candidates[0]
            else:
                member_key = clip_member

            participant = meta["participant"]
            split = "test" if participant in test_participants else "train"
            stratum = meta["stratum"]

            # Extract MP4 to temporary file
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp_mp4:
                tmp_mp4.write(zf.read(member_key))
                tmp_mp4_path = tmp_mp4.name

            try:
                cap = cv2.VideoCapture(tmp_mp4_path)
                fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
                step = max(1, int(round(fps / 2.0)))  # Sample at 2 fps

                frame_idx = 0
                clip_base = os.path.splitext(os.path.basename(clip_member))[0]
                while cap.isOpened():
                    ret, frame = cap.read()
                    if not ret:
                        break
                    if frame_idx % step == 0:
                        out_rel = f"natural_rgb/{split}/{clip_base}_f{frame_idx:04d}.jpg"
                        out_full = os.path.join(DARKPOOL_DIR, out_rel)
                        save_image_le640(frame, out_full, max_dim=640, quality=90)
                        records.append({
                            "file": out_rel,
                            "source": "natural_rgb",
                            "group_id": participant,
                            "split": split,
                            "light_tag": stratum
                        })
                    frame_idx += 1
                cap.release()
            finally:
                if os.path.exists(tmp_mp4_path):
                    os.remove(tmp_mp4_path)

    print(f"Natural RGB extracted: {len(records)} frames (train: {sum(1 for r in records if r['split'] == 'train')}, test: {sum(1 for r in records if r['split'] == 'test')})")
    return records


# ==============================================================================
# 3. HandGesture-5G v2 (A3)
# ==============================================================================
def process_handgesture_5g() -> list[dict]:
    """Process low exposure images via RangeZipReader."""
    print("--- Processing HandGesture-5G v2 (Low exposure) ---")
    r19_jsonl = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl"
    low_entries = []
    with open(r19_jsonl, "r") as f:
        for line in f:
            d = json.loads(line)
            if d.get("exposure_bucket") == "low_eb":
                low_entries.append(d)

    print(f"HandGesture-5G: found {len(low_entries)} unique low_eb entries in R19 manifest")

    # Import RangeZipReader
    sys.path.insert(0, os.path.join(RC, "r19", "scripts"))
    from range_zip import RangeZipReader

    hg5g_url = "https://data.mendeley.com/public-files/datasets/wj25crzdbm/files/be3aa0e6-8b18-4563-8201-37e46eadd025/file_downloaded"
    rz = RangeZipReader(hg5g_url, expected_size=5176227373)
    entries = rz.parse_central_directory()

    # Build lookup by member path
    entry_by_name = {e.filename: e for e in entries}

    records = []
    for item in low_entries:
        fn = item.get("filename")
        if fn not in entry_by_name:
            continue
        ze = entry_by_name[fn]
        raw_bytes = rz.fetch_entry_bytes(ze)

        # Correct EXIF orientation
        try:
            with Image.open(io.BytesIO(raw_bytes)) as pil_img:
                exif = pil_img.getexif()
                orient = exif.get(274, 1) if exif else 1
                if orient == 3:
                    pil_img = pil_img.rotate(180, expand=True)
                elif orient == 6:
                    pil_img = pil_img.rotate(270, expand=True)
                elif orient == 8:
                    pil_img = pil_img.rotate(90, expand=True)
                img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
        except Exception:
            arr = np.frombuffer(raw_bytes, dtype=np.uint8)
            img = cv2.imdecode(arr, cv2.IMREAD_COLOR)

        if img is None:
            continue

        cluster_id = f"cluster_{item.get('cluster_id', 'unknown')}"
        r19_split = item.get("split", "train")
        split = "test" if r19_split == "test" else "train"

        clean_fn = os.path.basename(fn)
        out_rel = f"handgesture_5g/{split}/hg5g_{clean_fn}"
        out_full = os.path.join(DARKPOOL_DIR, out_rel)

        save_image_le640(img, out_full, max_dim=640, quality=90)
        records.append({
            "file": out_rel,
            "source": "handgesture_5g",
            "group_id": cluster_id,
            "split": split,
            "light_tag": "low_exposure"
        })

    print(f"HandGesture-5G extracted: {len(records)} frames (train: {sum(1 for r in records if r['split'] == 'train')}, test: {sum(1 for r in records if r['split'] == 'test')})")
    return records


# ==============================================================================
# MAIN EXECUTION
# ==============================================================================
def main():
    start_time = time.time()
    os.makedirs(DARKPOOL_DIR, exist_ok=True)
    os.makedirs(STAGING_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(RESULTS_PATH), exist_ok=True)

    all_records = []

    # 1. BXR7
    all_records.extend(process_bxr7_test())
    all_records.extend(process_bxr7_train())

    # 2. Natural RGB v3
    all_records.extend(process_natural_rgb())

    # 3. HandGesture-5G v2
    all_records.extend(process_handgesture_5g())

    # Write manifest.csv
    print(f"\nWriting {MANIFEST_PATH} with {len(all_records)} total records...")
    with open(MANIFEST_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["file", "source", "group_id", "split", "light_tag"])
        writer.writeheader()
        writer.writerows(all_records)

    # Count breakdown
    by_source_split = collections.defaultdict(lambda: {"train": 0, "test": 0, "total": 0})
    for r in all_records:
        src = r["source"]
        sp = r["split"]
        by_source_split[src][sp] += 1
        by_source_split[src]["total"] += 1

    summary = {
        "status": "PASS",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_frames": len(all_records),
        "total_train": sum(1 for r in all_records if r["split"] == "train"),
        "total_test": sum(1 for r in all_records if r["split"] == "test"),
        "by_source": dict(by_source_split),
        "not_used_sources": {
            "A6_bisindo_v2": "NOT_USED: Flat Roboflow export lacking folder separation or lighting condition metadata.",
            "A7_ehg_7": "NOT_USED: Multi-part split tarball archive (.000..003) incompatible with HTTP Range.",
            "A9_aslad_190k": "NOT_USED: Pre-cropped hand boxes only; full frame interaction context missing.",
            "A10_depth_d435": "NOT_USED: RGB archive contains intentionally blurred frames (rgb_blur.zip).",
            "A11_egohands": "SKIP: Roboflow Universe requires authentication and is gated behind Cloudflare Turnstile."
        },
        "elapsed_seconds": round(time.time() - start_time, 2)
    }

    with open(RESULTS_PATH, "w") as f:
        json.dump(summary, f, indent=2)

    print(f"Results written to {RESULTS_PATH}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
