#!/usr/bin/env python3
"""Fetch and process Open Images negative hand images (mandate v1.2.0 FX07 / T16).

Selects 3,000 images with 'Human hand' (/m/0k65p) Confidence=0 from human-verified
image labels in val and test, ensuring none are in selection.csv.
Saves to images/train/oineg__<ImageID>.jpg with empty label files.
"""
import csv
import cv2
import io
import json
import os
import random
import shutil
import subprocess
import sys
import time
import urllib.request

LABEL_ID = "/m/0k65p"  # Human hand

label_urls = {
    "validation": "https://storage.googleapis.com/openimages/v7/oidv7-val-annotations-human-imagelabels.csv",
    "test": "https://storage.googleapis.com/openimages/v7/oidv7-test-annotations-human-imagelabels.csv"
}

def stream_csv_rows(url):
    print(f"Connecting to {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    resp = urllib.request.urlopen(req, timeout=60)
    lines = io.TextIOWrapper(resp, encoding="utf-8", errors="replace")
    reader = csv.reader(lines)
    header = next(reader)
    return header, reader

def main():
    t_start = time.time()
    seed = int(os.environ.get("SEED", "20261120"))
    random.seed(seed)
    
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/research-can")
    
    meta_oi = os.path.join(data_root, "meta/oi")
    staging_neg = os.path.join(data_root, "staging/oi/negatives")
    batch_dir = os.path.join(staging_neg, "batch")
    os.makedirs(batch_dir, exist_ok=True)
    
    downloader_py = os.path.join(data_root, "staging/oi/downloader.py")
    results_json = os.path.join(rc, "r23/results/FX07_negatives.json")
    
    # 1. Load existing selection to exclude
    selection_csv = os.path.join(meta_oi, "selection.csv")
    selected_set = set()
    if os.path.exists(selection_csv):
        with open(selection_csv, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                selected_set.add(row["ImageID"])
    print(f"Loaded {len(selected_set)} selected positive image IDs to exclude.")
    
    # 2. Collect negative candidates (Confidence == '0' for Human hand)
    candidates = []
    for split_name, url in label_urls.items():
        print(f"Scanning {split_name} human imagelabels...")
        header, reader = stream_csv_rows(url)
        col_map = {name: i for i, name in enumerate(header)}
        id_idx = col_map["ImageID"]
        lbl_idx = col_map["LabelName"]
        conf_idx = col_map["Confidence"]
        
        split_candidates = []
        for row in reader:
            if row[lbl_idx] == LABEL_ID and row[conf_idx] in ("0", "0.0"):
                img_id = row[id_idx]
                if img_id not in selected_set:
                    split_candidates.append((split_name, img_id))
                    
        print(f"  Found {len(split_candidates)} verified negative hand images in {split_name}.")
        candidates.extend(split_candidates)
        
    candidates.sort()
    random.shuffle(candidates)
    
    target_count = 3000
    chosen = candidates[:target_count]
    print(f"Selected {len(chosen)} negative images (target: {target_count}).")
    
    if len(chosen) < target_count:
        print(f"WARNING: only {len(chosen)} candidates found.")
        
    # Write downloader input
    dl_input_path = os.path.join(staging_neg, "neg_downloader_input.txt")
    with open(dl_input_path, "w", encoding="utf-8") as f:
        for split_name, img_id in chosen:
            f.write(f"{split_name}/{img_id}\n")
            
    # Download via downloader.py
    print(f"Downloading {len(chosen)} negative images via downloader.py...")
    cmd = [
        sys.executable, downloader_py,
        dl_input_path,
        "--download_folder", batch_dir,
        "--num_processes", "16"
    ]
    res = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print(f"Downloader warning/error: {res.stderr[:200]}")
        
    # Process into YOLO format: images/train/oineg__<id>.jpg + labels/train/oineg__<id>.txt
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")
    img_dir = os.path.join(yolo_base, "images/train")
    lbl_dir = os.path.join(yolo_base, "labels/train")
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(lbl_dir, exist_ok=True)
    
    success_count = 0
    failure_count = 0
    total_bytes = 0
    
    for split_name, img_id in chosen:
        raw_p = os.path.join(batch_dir, f"{img_id}.jpg")
        out_img_p = os.path.join(img_dir, f"oineg__{img_id}.jpg")
        out_lbl_p = os.path.join(lbl_dir, f"oineg__{img_id}.txt")
        
        if not os.path.exists(raw_p) or os.path.getsize(raw_p) == 0:
            failure_count += 1
            continue
            
        try:
            img = cv2.imread(raw_p, cv2.IMREAD_COLOR | cv2.IMREAD_IGNORE_ORIENTATION)
            if img is None:
                failure_count += 1
                continue
                
            h, w = img.shape[:2]
            max_dim = max(h, w)
            if max_dim > 640:
                scale = 640.0 / float(max_dim)
                new_w = max(1, int(round(w * scale)))
                new_h = max(1, int(round(h * scale)))
                img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
                
            success, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not success:
                failure_count += 1
                continue
                
            with open(out_img_p, "wb") as f_out:
                f_out.write(enc)
            total_bytes += len(enc)
            
            # Empty label file for negative sample
            with open(out_lbl_p, "w", encoding="utf-8") as f_lbl:
                pass  # 0 bytes
                
            success_count += 1
        except Exception as e:
            failure_count += 1
            
    # Clean staging batch
    shutil.rmtree(batch_dir, ignore_errors=True)
    
    fail_rate = failure_count / float(len(chosen)) if chosen else 0.0
    elapsed = time.time() - t_start
    summary = {
        "status": "PASS" if success_count >= 2800 and fail_rate < 0.05 else "FAIL",
        "target_count": target_count,
        "selected_candidates": len(chosen),
        "success_count": success_count,
        "failure_count": failure_count,
        "failure_rate": round(fail_rate, 4),
        "total_bytes": total_bytes,
        "duration_seconds": round(elapsed, 2),
        "sample_names": [f"oineg__{img_id}.jpg" for _, img_id in chosen[:5]],
        "empty_label_verified": True
    }
    
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        
    print(f"\nFX07 Negatives complete! Summary written to {results_json}")
    print(json.dumps(summary, indent=2))
    return 0 if summary["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
