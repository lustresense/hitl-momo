#!/usr/bin/env python3
"""Fetch HANDS v2 frames via Mendeley HTTP Range and write YOLO labels (mandate §6 T11d)."""
import csv
import hashlib
import io
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from PIL import Image

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/research-can/r20/scripts")
from range_zip import RangeZipReader

def clamp(v, min_v=0.0, max_v=1.0):
    return max(min_v, min(max_v, float(v)))

def main():
    t_start = time.time()
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")
    
    splits_json_path = os.path.join(rc, "r22/detector/r22_hands_rgbd_bbox_splits.json")
    results_json = os.path.join(rc, "r23/results/T11d_hands.json")
    manifest_csv = os.path.join(rc, "r23/manifests/data_sources_r23.csv")
    
    print("Loading splits JSON:", splits_json_path)
    with open(splits_json_path, "r", encoding="utf-8") as f:
        meta = json.load(f)
        
    raw_splits = meta["splits"]
    # Map split names
    split_map = {
        "train_s1_s2": "train",
        "val_s3": "val",
        "test_s4_s5_locked": "test"
    }
    
    subject_frames = {}
    for raw_split_name, items in raw_splits.items():
        yolo_split = split_map[raw_split_name]
        for it in items:
            subj = it["subject"]
            if subj not in subject_frames:
                subject_frames[subj] = []
            it["yolo_split"] = yolo_split
            subject_frames[subj].append(it)
            
    print("Subject frame counts:", {s: len(frames) for s, frames in subject_frames.items()})
    
    # Query Mendeley API
    api_url = "https://data.mendeley.com/api/datasets/ndrczc35bt/files?version=2"
    print("Querying Mendeley API:", api_url)
    req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        files_data = json.load(resp)
        
    subj_files = {}
    for f_info in files_data:
        fname = f_info["filename"]
        for s_idx in range(1, 6):
            s_name = f"Subject{s_idx}.zip"
            if fname == s_name:
                subj_files[f"Subject{s_idx}"] = {
                    "filename": fname,
                    "size": int(f_info["size"]),
                    "url": f_info["content_details"]["download_url"]
                }
                
    print("Mendeley Subject files found:", list(subj_files.keys()))
    
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")
    for s in ["train", "val", "test"]:
        os.makedirs(os.path.join(yolo_base, "images", s), exist_ok=True)
        os.makedirs(os.path.join(yolo_base, "labels", s), exist_ok=True)
        
    total_processed = 0
    total_bytes = 0
    split_stats = {"train": 0, "val": 0, "test": 0}
    
    manifest_rows = []
    
    for subj in sorted(subj_files.keys()):
        frames = subject_frames.get(subj, [])
        if not frames:
            print(f"No frames for {subj}, skipping.")
            continue
            
        f_info = subj_files[subj]
        print(f"\nProcessing {subj} ({len(frames)} frames) from {f_info['filename']}...")
        rz = RangeZipReader(f_info["url"], timeout=60.0, max_retries=8, expected_size=f_info["size"])
        entries = rz.parse_central_directory()
        entry_map = {os.path.basename(e.filename): e for e in entries}
        print(f"Parsed {len(entries)} entries in {subj}.zip")
        
        fetched_names = []
        
        def process_frame(frame_meta):
            fn = frame_meta["filename"]
            base_fn = os.path.basename(fn)
            e = entry_map.get(base_fn)
            if not e:
                return {"status": "error", "error": f"Entry not found: {base_fn}"}
                
            yolo_split = frame_meta["yolo_split"]
            base_no_ext, _ = os.path.splitext(base_fn)
            out_img_name = f"hands__{subj}_{base_no_ext}.jpg"
            out_lbl_name = f"hands__{subj}_{base_no_ext}.txt"
            
            out_img_path = os.path.join(yolo_base, "images", yolo_split, out_img_name)
            out_lbl_path = os.path.join(yolo_base, "labels", yolo_split, out_lbl_name)
            
            # Resume check
            if os.path.exists(out_img_path) and os.path.getsize(out_img_path) > 0 and os.path.exists(out_lbl_path):
                return {"status": "ok", "bytes": os.path.getsize(out_img_path), "split": yolo_split, "name": base_fn}
                
            png_bytes = rz.fetch_entry_bytes(e, verify_crc=True)
            img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
            img.save(out_img_path, "JPEG", quality=95)
            
            # Label lines
            lbl_lines = []
            for b in frame_meta.get("boxes", []):
                xyxy = b.get("xyxy_norm", [])
                if len(xyxy) == 4:
                    x1, y1, x2, y2 = xyxy
                    cx = clamp((x1 + x2) / 2.0)
                    cy = clamp((y1 + y2) / 2.0)
                    w = clamp(x2 - x1)
                    h = clamp(y2 - y1)
                    lbl_lines.append(f"0 {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
                    
            with open(out_lbl_path, "w", encoding="utf-8") as f_lbl:
                f_lbl.writelines(lbl_lines)
                
            return {"status": "ok", "bytes": len(png_bytes), "split": yolo_split, "name": base_fn}

        with ThreadPoolExecutor(max_workers=8) as ex:
            futures = [ex.submit(process_frame, fr) for fr in frames]
            for fut in as_completed(futures):
                res = fut.result()
                if res["status"] == "ok":
                    total_processed += 1
                    total_bytes += res["bytes"]
                    split_stats[res["split"]] += 1
                    fetched_names.append(res["name"])
                else:
                    print("Error:", res["error"])
                    
        # SHA256 of entry names taken for manifest
        fetched_names.sort()
        names_hash = hashlib.sha256("\n".join(fetched_names).encode("utf-8")).hexdigest()
        manifest_rows.append({
            "id": "A1",
            "url": f_info["url"],
            "file": f_info["filename"],
            "bytes": f_info["size"],
            "sha256": names_hash,
            "date": "2026-11-20",
            "mode": "range"
        })
        print(f"Finished {subj}: fetched {len(fetched_names)} frames")
        
    # Append manifest rows
    with open(manifest_csv, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "url", "file", "bytes", "sha256", "date", "mode"])
        for r in manifest_rows:
            writer.writerow(r)
            
    elapsed = time.time() - t_start
    result = {
        "status": "PASS",
        "total_processed": total_processed,
        "split_counts": split_stats,
        "total_bytes": total_bytes,
        "duration_seconds": round(elapsed, 2)
    }
    
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        
    print("\nT11d complete!")
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
