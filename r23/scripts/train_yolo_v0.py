#!/usr/bin/env python3
"""
MoNUI-7 R23 YOLO v0 Training & Evaluation Script (T17).

Trains YOLO26n / YOLO11n on monui7_hand_v0 (v0a) or monui7_hand_v0_dark (v0b)
per Mandate v1.1.0 §6 T17.
Parameters:
  imgsz=320, batch=64, epochs=100, patience=15, lr0=0.01, lrf=0.01,
  cos_lr=True, mosaic=1.0, mixup=0.1, seed=42.
Evaluates:
  - Overall recall (IoU 0.5)
  - Recall per source dataset
  - Recall per luminance bin (B0, B1, B2, B3)
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np


def compute_frame_luma(image_bgr):
    """Computes mean BT.601 luminance normalized to [0, 1]."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray)) / 255.0


def get_luma_bin(luma):
    if luma < 0.10:
        return "B0"
    elif luma < 0.25:
        return "B1"
    elif luma < 0.50:
        return "B2"
    else:
        return "B3"


def compute_iou(box1, box2):
    """box: [x1, y1, x2, y2] normalized."""
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])

    inter = max(0, xB - xA) * max(0, yB - yA)
    areaA = (box1[2] - box1[0]) * (box1[3] - box1[1])
    areaB = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = areaA + areaB - inter
    return inter / union if union > 0 else 0.0


def evaluate_model_by_bins(model, test_images_dir, test_labels_dir, min_score=0.35, min_iou=0.5):
    """
    Evaluates detections against ground truth labels per source and per luminance bin.
    """
    test_files = sorted(list(Path(test_images_dir).glob("*.jpg")))
    print(f"Evaluating {len(test_files)} test images...")

    results_by_source = {}
    results_by_bin = {"B0": {"tp": 0, "fn": 0, "total": 0},
                      "B1": {"tp": 0, "fn": 0, "total": 0},
                      "B2": {"tp": 0, "fn": 0, "total": 0},
                      "B3": {"tp": 0, "fn": 0, "total": 0}}
    total_tp = 0
    total_fn = 0
    total_gt = 0

    for img_path in test_files:
        name = img_path.name
        source = name.split("__")[0] if "__" in name else "other"
        if source not in results_by_source:
            results_by_source[source] = {"tp": 0, "fn": 0, "total": 0}

        label_path = Path(test_labels_dir) / f"{img_path.stem}.txt"
        gt_boxes = []
        if label_path.exists():
            with open(label_path) as lf:
                for line in lf:
                    parts = line.strip().split()
                    if len(parts) >= 5:
                        cx, cy, w, h = map(float, parts[1:5])
                        gt_boxes.append([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2])

        if not gt_boxes:
            continue

        img_bgr = cv2.imread(str(img_path))
        if img_bgr is None:
            continue
        luma = compute_frame_luma(img_bgr)
        luma_bin = get_luma_bin(luma)

        preds = model(img_path, imgsz=320, conf=min_score, verbose=False)[0]
        pred_boxes = []
        if preds.boxes is not None and len(preds.boxes) > 0:
            h, w = img_bgr.shape[:2]
            xyxy = preds.boxes.xyxy.cpu().numpy()
            for b in xyxy:
                pred_boxes.append([b[0] / w, b[1] / h, b[2] / w, b[3] / h])

        # Match GT to predictions (IoU >= 0.5)
        for gt in gt_boxes:
            total_gt += 1
            results_by_bin[luma_bin]["total"] += 1
            results_by_source[source]["total"] += 1

            matched = False
            for pb in pred_boxes:
                if compute_iou(gt, pb) >= min_iou:
                    matched = True
                    break

            if matched:
                total_tp += 1
                results_by_bin[luma_bin]["tp"] += 1
                results_by_source[source]["tp"] += 1
            else:
                total_fn += 1
                results_by_bin[luma_bin]["fn"] += 1
                results_by_source[source]["fn"] += 1

    overall_recall = total_tp / total_gt if total_gt > 0 else 0.0

    recall_by_bin = {}
    for b, counts in results_by_bin.items():
        recall_by_bin[b] = {
            "recall": round(counts["tp"] / counts["total"], 4) if counts["total"] > 0 else 0.0,
            "tp": counts["tp"],
            "fn": counts["fn"],
            "total_gt": counts["total"],
        }

    recall_by_source = {}
    for s, counts in results_by_source.items():
        recall_by_source[s] = {
            "recall": round(counts["tp"] / counts["total"], 4) if counts["total"] > 0 else 0.0,
            "tp": counts["tp"],
            "fn": counts["fn"],
            "total_gt": counts["total"],
        }

    return {
        "overall_recall": round(overall_recall, 4),
        "total_gt": total_gt,
        "total_tp": total_tp,
        "total_fn": total_fn,
        "by_bin": recall_by_bin,
        "by_source": recall_by_source,
    }


def main():
    parser = argparse.ArgumentParser(description="MoNUI-7 YOLO v0 Training (T17)")
    parser.add_argument("--variant", choices=["v0a", "v0b"], required=True)
    parser.add_argument("--data", required=True, help="Path to yaml config")
    parser.add_argument("--device", default="0", help="GPU device ID")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--batch", type=int, default=64)
    parser.add_argument("--imgsz", type=int, default=320)
    parser.add_argument("--patience", type=int, default=15)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output-dir", default="/home/deano/monui7-local/data/runs")
    args = parser.parse_args()

    from ultralytics import YOLO

    os.environ["CUDA_VISIBLE_DEVICES"] = str(args.device)
    print(f"=== Starting YOLO Training: {args.variant} on GPU {args.device} ===")

    # Initialize model (YOLO26n / YOLO11n pretrained base)
    model = YOLO("yolo11n.pt")

    train_args = {
        "data": args.data,
        "epochs": args.epochs,
        "batch": args.batch,
        "imgsz": args.imgsz,
        "patience": args.patience,
        "lr0": 0.01,
        "lrf": 0.01,
        "cos_lr": True,
        "mosaic": 1.0,
        "mixup": 0.1,
        "seed": args.seed,
        "device": 0,  # inside CUDA_VISIBLE_DEVICES
        "project": args.output_dir,
        "name": args.variant,
        "exist_ok": True,
        "verbose": True,
    }

    print("Training parameters:", json.dumps(train_args, indent=2))
    results = model.train(**train_args)

    best_pt = Path(args.output_dir) / args.variant / "weights" / "best.pt"
    print(f"Training completed. Best weights: {best_pt}")

    # Evaluate on test split
    with open(args.data) as f:
        import yaml
        data_cfg = yaml.safe_load(f)

    base_path = Path(data_cfg.get("path", "/home/deano/monui7-local"))
    test_img_dir = base_path / data_cfg["test"]
    test_lbl_dir = base_path / data_cfg["test"].replace("images", "labels")

    best_model = YOLO(str(best_pt))
    eval_metrics = evaluate_model_by_bins(best_model, test_img_dir, test_lbl_dir)

    out_metrics_path = Path(args.output_dir) / f"{args.variant}_metrics.json"
    with open(out_metrics_path, "w") as f:
        json.dump(eval_metrics, f, indent=2)
    print(f"Saved evaluation metrics to {out_metrics_path}")
    print(json.dumps(eval_metrics, indent=2))


if __name__ == "__main__":
    main()
