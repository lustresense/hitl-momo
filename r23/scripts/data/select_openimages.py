#!/usr/bin/env python3
"""Stream, filter and select Open Images V7 Human hand images (mandate §6 T11b)."""
import csv
import io
import json
import os
import random
import sys
import time
import urllib.request

seed = int(os.environ.get("SEED", "20261120"))
random.seed(seed)

LABEL_ID = "/m/0k65p"  # Human hand

data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
meta_oi = os.path.join(data_root, "meta/oi")
staging_oi = os.path.join(data_root, "staging/oi")
os.makedirs(meta_oi, exist_ok=True)
os.makedirs(staging_oi, exist_ok=True)

rotation_urls = {
    "validation": "https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv",
    "test": "https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv",
    "train": "https://storage.googleapis.com/openimages/2018_04/train/train-images-boxable-with-rotation.csv",
}

bbox_urls = {
    "validation": "https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv",
    "test": "https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv",
    "train": "https://storage.googleapis.com/openimages/v6/oidv6-train-annotations-bbox.csv",
}

split_quotas = {
    "train": 30000,
    "validation": 5000,
    "test": 5000
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
    valid_rotations = {}
    
    # 1. Parse Rotations
    for split, r_url in rotation_urls.items():
        print(f"\nProcessing rotations for {split}...")
        t0 = time.time()
        header, reader = stream_csv_rows(r_url)
        col_map = {name: i for i, name in enumerate(header)}
        id_idx = col_map["ImageID"]
        rot_idx = col_map.get("Rotation", -1)
        
        valid_set = set()
        count = 0
        for row in reader:
            count += 1
            if rot_idx >= 0 and len(row) > rot_idx:
                rot = row[rot_idx].strip()
                if rot in ("", "0", "0.0"):
                    valid_set.add(row[id_idx])
            else:
                valid_set.add(row[id_idx])
            if count % 500000 == 0:
                print(f"  {split} rotation rows: {count}, valid: {len(valid_set)}")
        valid_rotations[split] = valid_set
        print(f"  {split} finished in {time.time()-t0:.1f}s: {len(valid_set)}/{count} valid rotations")
        
    # 2. Filter Bboxes
    selected_images = {}
    for split, b_url in bbox_urls.items():
        print(f"\nProcessing bounding boxes for {split}...")
        t0 = time.time()
        header, reader = stream_csv_rows(b_url)
        col_map = {name: i for i, name in enumerate(header)}
        id_idx = col_map["ImageID"]
        lbl_idx = col_map["LabelName"]
        grp_idx = col_map.get("IsGroupOf", -1)
        dep_idx = col_map.get("IsDepiction", -1)
        
        out_boxes_csv = os.path.join(meta_oi, f"hand_boxes_{split}.csv")
        dirty_images = set()
        image_boxes = {}
        
        with open(out_boxes_csv, "w", newline="", encoding="utf-8") as f_out:
            writer = csv.writer(f_out)
            writer.writerow(header)
            
            row_count = 0
            hand_box_count = 0
            for row in reader:
                row_count += 1
                if row[lbl_idx] == LABEL_ID:
                    hand_box_count += 1
                    writer.writerow(row)
                    img_id = row[id_idx]
                    
                    is_grp = row[grp_idx] == "1" if grp_idx >= 0 and len(row) > grp_idx else False
                    is_dep = row[dep_idx] == "1" if dep_idx >= 0 and len(row) > dep_idx else False
                    
                    if is_grp or is_dep:
                        dirty_images.add(img_id)
                    else:
                        if img_id not in image_boxes:
                            image_boxes[img_id] = []
                        image_boxes[img_id].append(row)
                        
                if row_count % 1000000 == 0:
                    print(f"  {split} bbox rows: {row_count}, hand boxes: {hand_box_count}")
                    
        print(f"  Saved {hand_box_count} hand boxes to {out_boxes_csv} in {time.time()-t0:.1f}s")
        
        # Eligible candidates: in valid_rotations, in image_boxes, not in dirty_images
        valid_set = valid_rotations[split]
        eligible = [img_id for img_id in image_boxes.keys() if img_id in valid_set and img_id not in dirty_images]
        eligible.sort()
        random.shuffle(eligible)
        
        quota = split_quotas[split]
        chosen = eligible[:quota]
        selected_images[split] = chosen
        print(f"  {split} eligible: {len(eligible)}, selected: {len(chosen)}")
        
    # 3. Write Selection CSV
    selection_csv = os.path.join(meta_oi, "selection.csv")
    downloader_input = os.path.join(meta_oi, "downloader_input.txt")
    
    with open(selection_csv, "w", newline="", encoding="utf-8") as f_sel, \
         open(downloader_input, "w", encoding="utf-8") as f_dl:
        writer = csv.DictWriter(f_sel, fieldnames=["ImageID", "split"])
        writer.writeheader()
        
        for split, ids in selected_images.items():
            # For YOLO mapping: 'validation' -> 'val'
            yolo_split = "val" if split == "validation" else split
            for img_id in ids:
                writer.writerow({"ImageID": img_id, "split": yolo_split})
                # Downloader expects <split>/<ImageID>
                f_dl.write(f"{split}/{img_id}\n")
                
    print(f"\nSelection complete in {time.time()-t_start:.1f}s!")
    print(f"Written selection to {selection_csv}")
    print(f"Written downloader input to {downloader_input}")
    for s, ids in selected_images.items():
        print(f"  {s}: {len(ids)}")

if __name__ == "__main__":
    main()
