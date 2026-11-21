#!/usr/bin/env python3
"""Process IPN Hand dataset (mandate v1.2.0 FX05 / T11c).

1. Downloads IPN video archives (videos01.tgz .. videos05.tgz) from Google Drive.
   If quota exceeded: records BLOCKED (IPN_GDRIVE) and exits cleanly.
2. Extracts MP4s one archive at a time.
3. Samples frames at 2 fps (i % 15 == 0).
4. Annotates with GT hand landmarks from IPN_HandS_landmarks_GT.zip (min 15 pts, 15% margin).
5. Splits into train (<=20000), val (<=5000), test (<=5000) based on ipn_person_split.json.
6. Moves .tgz archives to $BIG_ROOT/raw/ipn/ and removes extracted MP4s.
7. Produces contact sheet with skeleton overlay on 3 sample videos.
"""
import csv
import glob
import json
import os
import random
import shutil
import subprocess
import sys
import tarfile
import time
import zipfile
import cv2
import numpy as np

IPN_ARCHIVES = [
    ("videos01.tgz", "1HylyDnApIRNMloREqvKYWWhB88q7Z1Cg"),
    ("videos02.tgz", "1tqR2FF8OlXGmYACw3TSxyS6QGDit_s3a"),
    ("videos03.tgz", "1Dk7l-jAAvNLlb0faypAco88XYLWPa9g_"),
    ("videos04.tgz", "1x0mDr-QHQtDkfcQAm9bKdWBR7Lj3fLcV"),
    ("videos05.tgz", "1PCjldH6hmVYV7EObPf-jtNWCtDK60o6n"),
]

# MediaPipe Hand skeleton edges (pairs of landmark indices)
HAND_EDGES = [
    ("0", "1"), ("1", "2"), ("2", "3"), ("3", "4"),       # Thumb
    ("0", "5"), ("5", "6"), ("6", "7"), ("7", "8"),       # Index
    ("5", "9"), ("9", "10"), ("10", "11"), ("11", "12"),   # Middle
    ("9", "13"), ("13", "14"), ("14", "15"), ("15", "16"), # Ring
    ("13", "17"), ("17", "18"), ("18", "19"), ("19", "20"),# Pinky
    ("0", "17")                                           # Palm base
]

def main():
    t_start = time.time()
    seed = int(os.environ.get("SEED", "20261120"))
    random.seed(seed)
    
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    big_root = os.environ.get("BIG_ROOT", "/home/deano/mnt/monui7-data")
    rc = os.environ.get("RC", "/srv/sketchbook/research-can")
    
    staging_ipn = os.path.join(data_root, "staging/ipn")
    staging_vids = os.path.join(staging_ipn, "videos")
    big_raw_ipn = os.path.join(big_root, "raw/ipn")
    os.makedirs(staging_vids, exist_ok=True)
    os.makedirs(big_raw_ipn, exist_ok=True)
    
    results_json = os.path.join(rc, "r23/results/FX05_ipn.json")
    cs_path = os.path.join(rc, "r23/results/FX05_ipn_contact_sheet.jpg")
    
    # Check landmarks zip
    gt_zip_path = os.path.join(data_root, "meta/ipn/IPN_HandS_landmarks_GT.zip")
    if not os.path.exists(gt_zip_path):
        res = {
            "status": "BLOCKED (IPN_LANDMARKS_MISSING)",
            "reason": f"Landmarks GT zip not found at {gt_zip_path}",
            "date": time.strftime("%Y-%m-%d")
        }
        with open(results_json, "w") as f:
            json.dump(res, f, indent=2)
        print(json.dumps(res, indent=2))
        return 1
        
    zf_gt = zipfile.ZipFile(gt_zip_path, "r")
    gt_namelist = set(zf_gt.namelist())
    print(f"Loaded landmarks GT zip: {len(gt_namelist)} entries.")
    
    # Check person split manifest
    split_manifest_path = os.path.join(rc, "r18/manifests/ipn_person_split.json")
    if not os.path.exists(split_manifest_path):
        res = {
            "status": "BLOCKED (IPN_SPLIT_MANIFEST_MISSING)",
            "reason": f"Split manifest not found at {split_manifest_path}",
            "date": time.strftime("%Y-%m-%d")
        }
        with open(results_json, "w") as f:
            json.dump(res, f, indent=2)
        print(json.dumps(res, indent=2))
        return 1
        
    with open(split_manifest_path) as f:
        split_data = json.load(f)
        
    train_videos = set(split_data.get("train_videos", []))
    val_videos = set(split_data.get("val_videos", []))
    test_videos = set(split_data.get("test_videos", []))
    print(f"Video splits: train={len(train_videos)}, val={len(val_videos)}, test={len(test_videos)}")
    
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")
    for s in ["train", "val", "test"]:
        os.makedirs(os.path.join(yolo_base, "images", s), exist_ok=True)
        os.makedirs(os.path.join(yolo_base, "labels", s), exist_ok=True)
        
    # Test gdown on first archive
    first_archive, first_id = IPN_ARCHIVES[0]
    first_tar_local = os.path.join(staging_ipn, first_archive)
    first_tar_big = os.path.join(big_raw_ipn, first_archive)
    
    # Check if already in big_root
    archive_available = os.path.exists(first_tar_big) and os.path.getsize(first_tar_big) > 500_000_000
    if not archive_available:
        print(f"Testing download of {first_archive} (ID: {first_id})...")
        import gdown
        try:
            res_dl = gdown.download(f"https://drive.google.com/uc?id={first_id}", output=first_tar_local, quiet=False)
        except Exception as e:
            print(f"gdown exception: {e}")
            res_dl = None
            
        if not res_dl or not os.path.exists(first_tar_local) or os.path.getsize(first_tar_local) < 500_000_000:
            res = {
                "status": "BLOCKED (IPN_GDRIVE)",
                "reason": "Google Drive quota exceeded or download failed on video archive.",
                "file": first_archive,
                "file_id": first_id,
                "date": time.strftime("%Y-%m-%d")
            }
            with open(results_json, "w") as f:
                json.dump(res, f, indent=2)
            print(json.dumps(res, indent=2))
            return 0  # Clean non-halting BLOCKED per mandate
            
    # Process archives sequentially
    counts = {"train": 0, "val": 0, "test": 0}
    contact_frames = []
    
    for arc_name, arc_id in IPN_ARCHIVES:
        tar_local = os.path.join(staging_ipn, arc_name)
        tar_big = os.path.join(big_raw_ipn, arc_name)
        
        if os.path.exists(tar_big) and os.path.getsize(tar_big) > 500_000_000:
            print(f"Archive {arc_name} found in BIG_ROOT.")
            tar_path = tar_big
        else:
            if not os.path.exists(tar_local) or os.path.getsize(tar_local) < 500_000_000:
                print(f"Downloading {arc_name}...")
                import gdown
                try:
                    res_dl = gdown.download(f"https://drive.google.com/uc?id={arc_id}", output=tar_local, quiet=False)
                except Exception as e:
                    print(f"gdown exception on {arc_name}: {e}")
                    res_dl = None
                if not res_dl or not os.path.exists(tar_local) or os.path.getsize(tar_local) < 500_000_000:
                    print(f"Failed to download {arc_name}, stopping archive ingestion.")
                    break
            tar_path = tar_local
            
        print(f"Extracting MP4s from {tar_path}...")
        with tarfile.open(tar_path, "r") as tf:
            for member in tf.getmembers():
                if member.name.lower().endswith((".mp4", ".avi")):
                    tf.extract(member, staging_vids)
                    
        # Process extracted videos
        vids = sorted(glob.glob(os.path.join(staging_vids, "**/*.mp4"), recursive=True) + glob.glob(os.path.join(staging_vids, "**/*.avi"), recursive=True))
        print(f"Found {len(vids)} videos in archive {arc_name}.")
        
        for vid_p in vids:
            vid_base = os.path.splitext(os.path.basename(vid_p))[0]
            if vid_base in train_videos:
                split = "train"
                cap = 20000
            elif vid_base in val_videos:
                split = "val"
                cap = 5000
            elif vid_base in test_videos:
                split = "test"
                cap = 5000
            else:
                os.remove(vid_p)
                continue
                
            if counts[split] >= cap:
                os.remove(vid_p)
                continue
                
            # Load video landmarks
            gt_entry = f"landmarks_gt/{vid_base}.json"
            if gt_entry not in gt_namelist:
                os.remove(vid_p)
                continue
                
            vid_gt = json.load(zf_gt.open(gt_entry))
            
            cap_vid = cv2.VideoCapture(vid_p)
            frame_idx = 0
            while True:
                ret, frame = cap_vid.read()
                if not ret:
                    break
                    
                if frame_idx % 15 == 0:  # 2 fps
                    ann_idx = frame_idx + 1
                    key = f"{vid_base}_{ann_idx:06d}.jpg"
                    
                    if key in vid_gt:
                        entry = vid_gt[key]
                        hand_landmarks = entry.get("hand_landmarks", [])
                        valid_boxes = []
                        
                        for hl in hand_landmarks:
                            lm_dict = hl.get("landmarks", {})
                            valid_pts = []
                            for idx_s, pt in lm_dict.items():
                                if len(pt) >= 2:
                                    x, y = float(pt[0]), float(pt[1])
                                    if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0:
                                        valid_pts.append((x, y))
                                        
                            if len(valid_pts) >= 15:
                                xs = [p[0] for p in valid_pts]
                                ys = [p[1] for p in valid_pts]
                                min_x, max_x = min(xs), max(xs)
                                min_y, max_y = min(ys), max(ys)
                                bw = max_x - min_x
                                bh = max_y - min_y
                                mx = 0.15 * bw
                                my = 0.15 * bh
                                x1 = max(0.0, min_x - mx)
                                y1 = max(0.0, min_y - my)
                                x2 = min(1.0, max_x + mx)
                                y2 = min(1.0, max_y + my)
                                
                                cx = (x1 + x2) / 2.0
                                cy = (y1 + y2) / 2.0
                                cw = x2 - x1
                                ch = y2 - y1
                                valid_boxes.append((cx, cy, cw, ch))
                                
                        if valid_boxes and counts[split] < cap:
                            out_img_p = os.path.join(yolo_base, "images", split, f"ipn__{vid_base}_{ann_idx:06d}.jpg")
                            out_lbl_p = os.path.join(yolo_base, "labels", split, f"ipn__{vid_base}_{ann_idx:06d}.txt")
                            
                            # Save JPEG Q=90
                            cv2.imwrite(out_img_p, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                            with open(out_lbl_p, "w", encoding="utf-8") as f_lbl:
                                for (cx, cy, cw, ch) in valid_boxes:
                                    f_lbl.write(f"0 {cx:.6f} {cy:.6f} {cw:.6f} {ch:.6f}\n")
                            counts[split] += 1
                            
                            if len(contact_frames) < 16 and random.random() < 0.1:
                                contact_frames.append((frame.copy(), valid_boxes, hand_landmarks))
                                
                frame_idx += 1
                
            cap_vid.release()
            os.remove(vid_p)
            
        # Move tar to big_root if local
        if tar_path == tar_local and os.path.exists(tar_local):
            print(f"Moving {tar_local} to {big_raw_ipn}...")
            shutil.move(tar_local, tar_big)
            
    # Contact sheet
    if contact_frames:
        sheet = np.zeros((4 * 240, 4 * 320, 3), dtype=np.uint8)
        for i, (fr, boxes, hls) in enumerate(contact_frames[:16]):
            r_idx = i // 4
            c_idx = i % 4
            h, w = fr.shape[:2]
            for (cx, cy, cw, ch) in boxes:
                x1 = int((cx - cw / 2.0) * w)
                y1 = int((cy - ch / 2.0) * h)
                x2 = int((cx + cw / 2.0) * w)
                y2 = int((cy + ch / 2.0) * h)
                cv2.rectangle(fr, (x1, y1), (x2, y2), (0, 255, 0), 2)
            for hl in hls:
                lms = hl.get("landmarks", {})
                for (i1, i2) in HAND_EDGES:
                    if i1 in lms and i2 in lms:
                        p1 = (int(lms[i1][0] * w), int(lms[i1][1] * h))
                        p2 = (int(lms[i2][0] * w), int(lms[i2][1] * h))
                        cv2.line(fr, p1, p2, (0, 0, 255), 1)
            cell = cv2.resize(fr, (320, 240))
            sheet[r_idx * 240:(r_idx + 1) * 240, c_idx * 320:(c_idx + 1) * 320] = cell
        cv2.imwrite(cs_path, sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
        
    summary = {
        "status": "PASS" if sum(counts.values()) > 0 else "BLOCKED (IPN_EMPTY)",
        "counts_by_split": counts,
        "contact_sheet": cs_path if contact_frames else None,
        "duration_seconds": round(time.time() - t_start, 2),
        "note": "IPN Hand 2 fps extraction with GT landmarks and 15% margin."
    }
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(f"\nFX05 IPN complete! Summary written to {results_json}")
    print(json.dumps(summary, indent=2))
    return 0

if __name__ == "__main__":
    sys.exit(main())
