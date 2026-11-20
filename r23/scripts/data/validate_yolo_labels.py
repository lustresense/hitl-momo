#!/usr/bin/env python3
"""Validate YOLO labels and splits for MoNUI-7 R23 T13."""
import json
import os
import sys
import time

def main():
    t_start = time.time()
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")
    results_json = os.path.join(rc, "r23/results/T13_label_validation.json")
    yaml_path = os.path.join(data_root, "yolo/monui7_hand_v0.yaml")

    print(f"Validating YOLO dataset at {yolo_base}...")
    splits = ["train", "val", "test"]
    stats = {}
    total_errors = []

    yaml_exists = os.path.exists(yaml_path)

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

        # Check pairing
        missing_labels = [img_basenames[b] for b in img_basenames if b not in lbl_basenames]
        orphan_labels = [lbl_basenames[b] for b in lbl_basenames if b not in img_basenames]

        for m in missing_labels[:10]:
            total_errors.append(f"Missing label for image {split}/{m}")
        if len(missing_labels) > 10:
            total_errors.append(f"... and {len(missing_labels) - 10} more missing labels in {split}")

        # Check format and values of each label
        split_boxes = 0
        empty_labels = 0
        format_errors = 0
        prefix_counts = {}

        for b, lbl_fn in lbl_basenames.items():
            prefix = b.split('__')[0] if '__' in b else b.split('_')[0]
            prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1

            lbl_path = os.path.join(lbl_dir, lbl_fn)
            try:
                with open(lbl_path, "r", encoding="utf-8") as f:
                    lines = [line.strip() for line in f if line.strip()]

                if not lines:
                    empty_labels += 1
                    continue

                for line_idx, line in enumerate(lines):
                    parts = line.split()
                    if len(parts) != 5:
                        format_errors += 1
                        if len(total_errors) < 50:
                            total_errors.append(f"Bad column count ({len(parts)} != 5) in {split}/{lbl_fn}:{line_idx+1}")
                        continue

                    cls_str, cx_s, cy_s, w_s, h_s = parts
                    try:
                        cls_id = int(cls_str)
                        cx = float(cx_s)
                        cy = float(cy_s)
                        w = float(w_s)
                        h = float(h_s)
                    except ValueError:
                        format_errors += 1
                        if len(total_errors) < 50:
                            total_errors.append(f"Non-float values in {split}/{lbl_fn}:{line_idx+1}")
                        continue

                    if cls_id != 0:
                        format_errors += 1
                        if len(total_errors) < 50:
                            total_errors.append(f"Invalid class {cls_id} != 0 in {split}/{lbl_fn}:{line_idx+1}")

                    if not (0.0 <= cx <= 1.0 and 0.0 <= cy <= 1.0 and 0.0 <= w <= 1.0 and 0.0 <= h <= 1.0):
                        format_errors += 1
                        if len(total_errors) < 50:
                            total_errors.append(f"Box coordinates out of bounds [0, 1] in {split}/{lbl_fn}:{line_idx+1}: {parts[1:]}")

                    if w <= 0.0 or h <= 0.0:
                        format_errors += 1
                        if len(total_errors) < 50:
                            total_errors.append(f"Non-positive box width/height in {split}/{lbl_fn}:{line_idx+1}")

                    split_boxes += 1
            except Exception as e:
                format_errors += 1
                if len(total_errors) < 50:
                    total_errors.append(f"Error reading {split}/{lbl_fn}: {e}")

        stats[split] = {
            "image_count": len(img_basenames),
            "label_count": len(lbl_basenames),
            "missing_label_count": len(missing_labels),
            "orphan_label_count": len(orphan_labels),
            "total_boxes": split_boxes,
            "empty_label_count": empty_labels,
            "format_errors": format_errors,
            "prefix_distribution": prefix_counts
        }

    status = "PASS" if len(total_errors) == 0 and yaml_exists else "FAIL"

    summary = {
        "status": status,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "yaml_file": {
            "path": yaml_path,
            "exists": yaml_exists
        },
        "split_stats": stats,
        "total_images": sum(s["image_count"] for s in stats.values()),
        "total_labels": sum(s["label_count"] for s in stats.values()),
        "total_boxes": sum(s["total_boxes"] for s in stats.values()),
        "total_errors_count": len(total_errors),
        "error_samples": total_errors[:50],
        "duration_seconds": round(time.time() - t_start, 2)
    }

    os.makedirs(os.path.dirname(results_json), exist_ok=True)
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"Validation complete! Status: {status}")
    print(json.dumps(summary, indent=2))
    return 0 if status == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
