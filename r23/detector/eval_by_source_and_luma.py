#!/usr/bin/env python3
"""
MoNUI-7 R23 YOLO Detection Evaluation by Source and Luminance Bin (T17).
Mandate: NUI_R23-02 v1.1.0 §6 T17

Calculates recall@IoU 0.5 at confidence >= 0.35 per source dataset and
per luminance bin of the ground-truth hand bounding box ROI.
Luma formula: Y = 0.299*R + 0.587*G + 0.114*B in range [0, 1].

Luminance bins:
  - B0: Y < 0.08
  - B1: 0.08 <= Y < 0.15
  - B2: 0.15 <= Y < 0.30
  - B3: Y >= 0.30
"""

import argparse
import collections
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np


def compute_iou(box1, box2):
    """
    Computes Intersection over Union for two boxes in normalized [x1, y1, x2, y2].
    """
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])

    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, box1[2] - box1[0]) * max(0.0, box1[3] - box1[1])
    areaB = max(0.0, box2[2] - box2[0]) * max(0.0, box2[3] - box2[1])
    union = areaA + areaB - inter
    return inter / union if union > 0.0 else 0.0


def compute_box_luma(image_bgr, box_xyxy_norm):
    """
    Computes mean luminance Y inside the normalized box [x1, y1, x2, y2].
    Y = 0.299*R + 0.587*G + 0.114*B normalized to [0, 1].
    """
    h, w = image_bgr.shape[:2]
    x1 = int(round(np.clip(box_xyxy_norm[0] * w, 0, w - 1)))
    y1 = int(round(np.clip(box_xyxy_norm[1] * h, 0, h - 1)))
    x2 = int(round(np.clip(box_xyxy_norm[2] * w, 0, w)))
    y2 = int(round(np.clip(box_xyxy_norm[3] * h, 0, h)))

    if x2 <= x1 or y2 <= y1:
        # Fallback to whole frame if box area is degenerated
        crop = image_bgr
    else:
        crop = image_bgr[y1:y2, x1:x2]

    # Convert BGR to RGB floats [0, 1]
    crop_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    r = crop_rgb[:, :, 0]
    g = crop_rgb[:, :, 1]
    b = crop_rgb[:, :, 2]
    y_channel = 0.299 * r + 0.587 * g + 0.114 * b
    return float(np.mean(y_channel))


def get_luma_bin(luma):
    if luma < 0.08:
        return "B0"
    elif luma < 0.15:
        return "B1"
    elif luma < 0.30:
        return "B2"
    else:
        return "B3"


def evaluate(model_path, data_yaml, conf_thresh=0.35, iou_thresh=0.5, imgsz=320):
    from ultralytics import YOLO

    try:
        import yaml
        with open(data_yaml) as f:
            data_cfg = yaml.safe_load(f)
    except ImportError:
        from ultralytics.utils import YAML
        data_cfg = YAML.load(data_yaml)

    print(f"Loading YOLO model from {model_path}...")
    model = YOLO(model_path)

    base_dir = Path(data_cfg.get("path", "/home/deano/monui7-local"))
    test_rel = data_cfg["test"]
    test_img_dir = base_dir / test_rel
    # If test_rel is path to images/test, labels are in labels/test
    test_lbl_dir = base_dir / str(test_rel).replace("images", "labels")

    image_paths = sorted(list(test_img_dir.glob("*.jpg")) + list(test_img_dir.glob("*.jpeg")) + list(test_img_dir.glob("*.png")))
    print(f"Found {len(image_paths)} test images in {test_img_dir}")

    results_by_source = collections.defaultdict(lambda: {"tp": 0, "fn": 0, "total": 0})
    results_by_bin = {
        "B0": {"tp": 0, "fn": 0, "total": 0},
        "B1": {"tp": 0, "fn": 0, "total": 0},
        "B2": {"tp": 0, "fn": 0, "total": 0},
        "B3": {"tp": 0, "fn": 0, "total": 0},
    }
    total_tp = 0
    total_fn = 0
    total_gt = 0

    t_start = time.time()
    for idx, img_path in enumerate(image_paths):
        name = img_path.name
        source = name.split("__")[0] if "__" in name else "other"

        lbl_path = test_lbl_dir / f"{img_path.stem}.txt"
        gt_boxes = []
        if lbl_path.exists():
            with open(lbl_path, "r", encoding="utf-8") as lf:
                for line in lf:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        cls_id = int(parts[0])
                        cx, cy, w, h = map(float, parts[1:5])
                        gt_boxes.append({
                            "box": [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
                            "matched": False
                        })

        if not gt_boxes:
            continue

        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            continue

        # Predict
        preds = model(str(img_path), imgsz=imgsz, conf=conf_thresh, verbose=False)[0]
        pred_boxes = []
        if preds.boxes is not None and len(preds.boxes) > 0:
            h, w = img_bgr.shape[:2]
            xyxy = preds.boxes.xyxy.cpu().numpy()
            confs = preds.boxes.conf.cpu().numpy()
            for b_idx, b in enumerate(xyxy):
                pred_boxes.append({
                    "box": [b[0] / w, b[1] / h, b[2] / w, b[3] / h],
                    "conf": float(confs[b_idx])
                })

        # Evaluate each GT box
        for gt in gt_boxes:
            total_gt += 1
            luma = compute_box_luma(img_bgr, gt["box"])
            l_bin = get_luma_bin(luma)

            results_by_bin[l_bin]["total"] += 1
            results_by_source[source]["total"] += 1

            matched = False
            for pb in pred_boxes:
                if compute_iou(gt["box"], pb["box"]) >= iou_thresh:
                    matched = True
                    break

            if matched:
                total_tp += 1
                results_by_bin[l_bin]["tp"] += 1
                results_by_source[source]["tp"] += 1
            else:
                total_fn += 1
                results_by_bin[l_bin]["fn"] += 1
                results_by_source[source]["fn"] += 1

        if (idx + 1) % 500 == 0 or (idx + 1) == len(image_paths):
            elapsed = time.time() - t_start
            print(f"[{idx+1}/{len(image_paths)}] processed in {elapsed:.1f}s...")

    overall_recall = total_tp / total_gt if total_gt > 0 else 0.0

    eval_summary = {
        "model_path": str(model_path),
        "data_yaml": str(data_yaml),
        "conf_threshold": conf_thresh,
        "iou_threshold": iou_thresh,
        "total_test_images": len(image_paths),
        "total_gt_boxes": total_gt,
        "total_tp": total_tp,
        "total_fn": total_fn,
        "overall_recall": round(overall_recall, 4),
        "by_bin": {},
        "by_source": {},
        "duration_seconds": round(time.time() - t_start, 2)
    }

    for b, counts in results_by_bin.items():
        rec = counts["tp"] / counts["total"] if counts["total"] > 0 else 0.0
        eval_summary["by_bin"][b] = {
            "recall": round(rec, 4),
            "tp": counts["tp"],
            "fn": counts["fn"],
            "total": counts["total"]
        }

    for s, counts in sorted(results_by_source.items()):
        rec = counts["tp"] / counts["total"] if counts["total"] > 0 else 0.0
        eval_summary["by_source"][s] = {
            "recall": round(rec, 4),
            "tp": counts["tp"],
            "fn": counts["fn"],
            "total": counts["total"]
        }

    return eval_summary


def main():
    parser = argparse.ArgumentParser(description="Evaluate YOLO by Source and Luma Bins")
    parser.add_argument("--model", required=True, help="Path to .pt model weights")
    parser.add_argument("--data", required=True, help="Path to data YAML config")
    parser.add_argument("--conf", type=float, default=0.35, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.5, help="IoU threshold")
    parser.add_argument("--imgsz", type=int, default=320, help="Image size")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    res = evaluate(args.model, args.data, conf_thresh=args.conf, iou_thresh=args.iou, imgsz=args.imgsz)
    print("\n=== EVALUATION RESULTS ===")
    print(json.dumps(res, indent=2))

    if args.out:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2)
        print(f"Results written to {args.out}")


if __name__ == "__main__":
    main()
