#!/usr/bin/env python3
"""Select HaGRID images according to mandate §6 T11a."""
import csv
import gzip
import json
import os
import random
import sys
import zipfile

seed = int(os.environ.get("SEED", "20261120"))
random.seed(seed)

target_classes = [
    "fist", "ok", "palm", "stop", "one", "two_up", "peace", 
    "three", "three2", "three3", "thumb_index", "thumb_index2", 
    "grip", "four", "like", "call", "no_gesture"
]

quotas = {
    "train": 3530,
    "val": 294,
    "test": 294
}

cd_index_path = os.path.expandvars("$DATA_ROOT/meta/hagrid/cd_index.json.gz")
print("Loading cd_index...")
with gzip.open(cd_index_path, "rt", encoding="utf-8") as f:
    cd_index = json.load(f)
print(f"cd_index loaded: {len(cd_index)} entries")

annotations_zip = os.path.expandvars("$DATA_ROOT/meta/hagrid/annotations.zip")
zf = zipfile.ZipFile(annotations_zip, "r")

selection_rows = []
boxes_rows = []
stats = {}

for split, target_n in quotas.items():
    stats[split] = {}
    for cls in target_classes:
        fname = f"annotations/{split}/{cls}.json"
        with zf.open(fname) as f:
            data = json.load(f)
        
        valid_candidates = []
        for img_id, item in data.items():
            if img_id not in cd_index:
                continue
            bboxes = item.get("bboxes", [])
            if not bboxes:
                continue
            valid = True
            for b in bboxes:
                if len(b) < 4 or b[2] <= 0 or b[3] <= 0:
                    valid = False
                    break
            if not valid:
                continue
            valid_candidates.append(img_id)
        
        valid_candidates.sort()
        random.shuffle(valid_candidates)
        
        selected = valid_candidates[:target_n]
        stats[split][cls] = {
            "available": len(valid_candidates),
            "selected": len(selected)
        }
        
        for img_id in selected:
            item = data[img_id]
            user_id = item.get("user_id", "")
            bboxes = item.get("bboxes", [])
            labels = item.get("labels", [])
            selection_rows.append({
                "image_id": img_id,
                "class": cls,
                "split": split,
                "user_id": user_id,
                "n_boxes": len(bboxes)
            })
            for b_idx, (b, lbl) in enumerate(zip(bboxes, labels)):
                boxes_rows.append({
                    "image_id": img_id,
                    "split": split,
                    "box_idx": b_idx,
                    "label": lbl,
                    "x": b[0],
                    "y": b[1],
                    "w": b[2],
                    "h": b[3],
                    "user_id": user_id
                })

selection_csv = os.path.expandvars("$DATA_ROOT/meta/hagrid/selection.csv")
with open(selection_csv, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["image_id", "class", "split", "user_id", "n_boxes"])
    writer.writeheader()
    writer.writerows(selection_rows)

boxes_csv = os.path.expandvars("$DATA_ROOT/meta/hagrid/boxes.csv")
with open(boxes_csv, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=["image_id", "split", "box_idx", "label", "x", "y", "w", "h", "user_id"])
    writer.writeheader()
    writer.writerows(boxes_rows)

print(f"Selection CSV written: {len(selection_rows)} images -> {selection_csv}")
print(f"Boxes CSV written: {len(boxes_rows)} boxes -> {boxes_csv}")
totals = {s: sum(st[c]["selected"] for c in target_classes) for s, st in stats.items()}
print("Totals per split:", totals)
