#!/usr/bin/env python3
"""Validate YOLO labels, splits, source distribution, and YAMLs for MoNUI-7 R23 FX08.

Mandate FX08 requirements:
1. Counts per split per source. HaGRID must be present in val and test.
2. Empty labels only allowed for 'oineg__*'. All other sources must have 0 empty labels.
3. Check find $DATA_ROOT/yolo -name 'darkaug_dp_*' | wc -l == 0.
4. Contact sheets for new HaGRID, new Open Images.
5. Write monui7_hand_v0.yaml and monui7_hand_v0_dark.yaml.
6. Write $RC/r23/results/FX08_label_validation.json.
"""
import glob
import json
import os
import random
import subprocess
import sys
import time
import cv2
import numpy as np

def create_contact_sheet(image_paths, label_dir, out_path, grid_rows=4, grid_cols=4, cell_size=160):
    sheet = np.zeros((grid_rows * cell_size, grid_cols * cell_size, 3), dtype=np.uint8)
    for idx, img_p in enumerate(image_paths[:grid_rows * grid_cols]):
        r = idx // grid_cols
        c = idx % grid_cols
        img = cv2.imread(img_p)
        if img is None:
            continue
        h, w = img.shape[:2]
        base = os.path.basename(img_p)[:-4]
        lbl_p = os.path.join(label_dir, f"{base}.txt")
        if os.path.exists(lbl_p):
            with open(lbl_p) as f:
                for line in f:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        cx, cy, bw, bh = map(float, parts[1:5])
                        x1 = int((cx - bw / 2.0) * w)
                        y1 = int((cy - bh / 2.0) * h)
                        x2 = int((cx + bw / 2.0) * w)
                        y2 = int((cy + bh / 2.0) * h)
                        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cell = cv2.resize(img, (cell_size, cell_size))
        sheet[r * cell_size:(r + 1) * cell_size, c * cell_size:(c + 1) * cell_size] = cell
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    cv2.imwrite(out_path, sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])

def main():
    t_start = time.time()
    random.seed(20261120)
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")
    
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")
    results_json = os.path.join(rc, "r23/results/FX08_label_validation.json")
    v0_yaml_path = os.path.join(data_root, "yolo/monui7_hand_v0.yaml")
    dark_yaml_path = os.path.join(data_root, "yolo/monui7_hand_v0_dark.yaml")
    
    print(f"Validating YOLO dataset at {yolo_base}...")
    splits = ["train", "val", "test"]
    stats = {}
    total_errors = []
    
    # 1. Darkpool residue check
    cmd = f"find {data_root}/yolo -name 'darkaug_dp_*' | wc -l"
    res = subprocess.check_output(cmd, shell=True, text=True).strip()
    dp_residue = int(res)
    if dp_residue > 0:
        total_errors.append(f"Residual darkpool files found: {dp_residue}")
        
    for split in splits:
        img_dir = os.path.join(yolo_base, "images", split)
        lbl_dir = os.path.join(yolo_base, "labels", split)
        
        if not os.path.exists(img_dir) or not os.path.exists(lbl_dir):
            total_errors.append(f"Directory missing for split {split}")
            continue
            
        img_files = set(os.listdir(img_dir))
        lbl_files = set(os.listdir(lbl_dir))
        
        img_basenames = {os.path.splitext(f)[0]: f for f in img_files if f.lower().endswith(('.jpg', '.jpeg', '.png'))}
        lbl_basenames = {os.path.splitext(f)[0]: f for f in lbl_files if f.endswith('.txt')}
        
        missing_labels = [img_basenames[b] for b in img_basenames if b not in lbl_basenames]
        orphan_labels = [lbl_basenames[b] for b in lbl_basenames if b not in img_basenames]
        
        for m in missing_labels[:10]:
            total_errors.append(f"Missing label for image {split}/{m}")
            
        split_boxes = 0
        empty_labels_total = 0
        empty_labels_non_neg = 0
        format_errors = 0
        prefix_img_counts = {}
        prefix_box_counts = {}
        
        for b, lbl_fn in lbl_basenames.items():
            prefix = b.split('__')[0] if '__' in b else b.split('_')[0]
            prefix_img_counts[prefix] = prefix_img_counts.get(prefix, 0) + 1
            
            lbl_path = os.path.join(lbl_dir, lbl_fn)
            try:
                with open(lbl_path, "r", encoding="utf-8") as f:
                    lines = [line.strip() for line in f if line.strip()]
                    
                if not lines:
                    empty_labels_total += 1
                    if prefix != "oineg":
                        empty_labels_non_neg += 1
                        if len(total_errors) < 50:
                            total_errors.append(f"Empty label for non-negative image {split}/{lbl_fn}")
                    continue
                    
                for line_idx, line in enumerate(lines):
                    parts = line.split()
                    if len(parts) != 5:
                        format_errors += 1
                        continue
                    cls_str, cx_s, cy_s, w_s, h_s = parts
                    cls_id = int(cls_str)
                    cx, cy, w, h = map(float, [cx_s, cy_s, w_s, h_s])
                    if cls_id != 0 or not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0 and 0.0 <= w <= 1.0 and 0.0 <= h <= 1.0):
                        format_errors += 1
                        continue
                    split_boxes += 1
                    prefix_box_counts[prefix] = prefix_box_counts.get(prefix, 0) + 1
            except Exception as e:
                format_errors += 1
                
        stats[split] = {
            "image_count": len(img_basenames),
            "label_count": len(lbl_basenames),
            "missing_label_count": len(missing_labels),
            "orphan_label_count": len(orphan_labels),
            "total_boxes": split_boxes,
            "empty_labels_total": empty_labels_total,
            "empty_labels_non_negative": empty_labels_non_neg,
            "format_errors": format_errors,
            "prefix_img_counts": prefix_img_counts,
            "prefix_box_counts": prefix_box_counts
        }
        
    # Check HaGRID presence in val and test
    if stats.get("val", {}).get("prefix_img_counts", {}).get("hagrid", 0) == 0:
        total_errors.append("HaGRID missing in val split")
    if stats.get("test", {}).get("prefix_img_counts", {}).get("hagrid", 0) == 0:
        total_errors.append("HaGRID missing in test split")
        
    # 2. Write YAMLs
    v0_yaml_content = f"""path: {yolo_base}
train: images/train
val: images/val
test: images/test
names:
  0: hand
"""
    with open(v0_yaml_path, "w", encoding="utf-8") as f:
        f.write(v0_yaml_content)
    print(f"Wrote {v0_yaml_path}")
    
    dark_train_dir = "../monui7_hand_v0_dark/images/train"
    dark_yaml_content = f"""path: {yolo_base}
train:
  - images/train
  - {dark_train_dir}
val: images/val
test: images/test
names:
  0: hand
"""
    with open(dark_yaml_path, "w", encoding="utf-8") as f:
        f.write(dark_yaml_content)
    print(f"Wrote {dark_yaml_path}")
    
    # 3. Create Contact Sheets
    cs_hagrid_path = os.path.join(rc, "r23/results/FX08_contact_sheet_hagrid.jpg")
    cs_oi_path = os.path.join(rc, "r23/results/FX08_contact_sheet_oi.jpg")
    cs_ipn_path = os.path.join(rc, "r23/results/FX08_contact_sheet_ipn.jpg")
    
    hagrid_samples = sorted(glob.glob(os.path.join(yolo_base, "images/train/hagrid__*.jpg")))
    random.shuffle(hagrid_samples)
    create_contact_sheet(hagrid_samples, os.path.join(yolo_base, "labels/train"), cs_hagrid_path)
    
    oi_samples = sorted(glob.glob(os.path.join(yolo_base, "images/train/oi__*.jpg")))
    random.shuffle(oi_samples)
    create_contact_sheet(oi_samples, os.path.join(yolo_base, "labels/train"), cs_oi_path)
    
    ipn_samples = sorted(glob.glob(os.path.join(yolo_base, "images/train/ipn__*.jpg")))
    if ipn_samples:
        random.shuffle(ipn_samples)
        create_contact_sheet(ipn_samples, os.path.join(yolo_base, "labels/train"), cs_ipn_path)
    
    status = "PASS" if len(total_errors) == 0 else "FAIL"
    summary = {
        "status": status,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "darkpool_residue": dp_residue,
        "yamls": {
            "v0": v0_yaml_path,
            "v0_dark": dark_yaml_path
        },
        "contact_sheets": {
            "hagrid": cs_hagrid_path,
            "openimages": cs_oi_path,
            "ipn": cs_ipn_path if ipn_samples else None
        },
        "split_stats": stats,
        "total_images": sum(s["image_count"] for s in stats.values()),
        "total_labels": sum(s["label_count"] for s in stats.values()),
        "total_boxes": sum(s["total_boxes"] for s in stats.values()),
        "total_errors": total_errors
    }
    
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        
    print(f"\nFX08 Validation complete! Status: {status}")
    print(json.dumps(summary, indent=2))
    return 0 if status == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
