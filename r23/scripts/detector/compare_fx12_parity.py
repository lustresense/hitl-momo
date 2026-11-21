#!/usr/bin/env python3
"""Compare Python predictions vs TS predictions for FX12.

Rules:
- 20 test images.
- For each image, box count must match.
- Every paired bounding box must satisfy:
    IoU >= 0.99
    abs(score_py - score_ts) <= 0.01
    classId match
- No averaging allowed.
- Outputs detailed results to $RC/r23/results/FX12_ts_parity.json.
"""
import argparse
import json
import math
import os
import sys

def compute_iou(b1, b2):
    xA = max(b1[0], b2[0])
    yA = max(b1[1], b2[1])
    xB = min(b1[2], b2[2])
    yB = min(b1[3], b2[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    a1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    a2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0.0 else 0.0

def main():
    parser = argparse.ArgumentParser(description="Compare Python vs TS Parity")
    parser.add_argument("--py-preds", default="/home/deano/monui7-local/data/qa/fx12/py_preds.json")
    parser.add_argument("--ts-preds", default="/home/deano/monui7-local/data/qa/fx12/ts_preds.json")
    parser.add_argument("--out-json", default="/srv/sketchbook/research-can/r23/results/FX12_ts_parity.json")
    parser.add_argument("--min-iou", type=float, default=0.99)
    parser.add_argument("--max-score-diff", type=float, default=0.01)
    args = parser.parse_args()

    if not os.path.exists(args.py_preds):
        print(f"Error: {args.py_preds} does not exist.")
        return 1
    if not os.path.exists(args.ts_preds):
        print(f"Error: {args.ts_preds} does not exist.")
        return 1

    with open(args.py_preds, "r", encoding="utf-8") as f:
        py_data = json.load(f)
    with open(args.ts_preds, "r", encoding="utf-8") as f:
        ts_data = json.load(f)

    images = sorted(set(py_data.keys()).union(ts_data.keys()))
    print(f"Comparing {len(images)} images between Python and TS predictions...")

    all_passed = True
    image_reports = []
    total_py_boxes = 0
    total_ts_boxes = 0
    min_observed_iou = 1.0
    max_observed_score_diff = 0.0

    for name in images:
        py_boxes = py_data.get(name, [])
        ts_boxes = ts_data.get(name, [])
        total_py_boxes += len(py_boxes)
        total_ts_boxes += len(ts_boxes)

        img_passed = True
        img_failures = []

        if len(py_boxes) != len(ts_boxes):
            img_passed = False
            img_failures.append(f"Box count mismatch: Py={len(py_boxes)} vs TS={len(ts_boxes)}")

        paired_ts = set()
        pairs = []

        for p_idx, p_det in enumerate(py_boxes):
            best_iou = -1.0
            best_t_idx = -1
            p_box = p_det["box"]

            for t_idx, t_det in enumerate(ts_boxes):
                if t_idx in paired_ts:
                    continue
                iou = compute_iou(p_box, t_det["box"])
                if iou > best_iou:
                    best_iou = iou
                    best_t_idx = t_idx

            if best_t_idx >= 0:
                paired_ts.add(best_t_idx)
                t_det = ts_boxes[best_t_idx]
                score_diff = abs(p_det["score"] - t_det["score"])
                min_observed_iou = min(min_observed_iou, best_iou)
                max_observed_score_diff = max(max_observed_score_diff, score_diff)

                pass_pair = True
                if best_iou < args.min_iou:
                    pass_pair = False
                    img_failures.append(f"Box {p_idx} IoU {best_iou:.4f} < {args.min_iou}")
                if score_diff > args.max_score_diff:
                    pass_pair = False
                    img_failures.append(f"Box {p_idx} score diff {score_diff:.4f} > {args.max_score_diff}")
                if p_det.get("classId", 0) != t_det.get("classId", 0):
                    pass_pair = False
                    img_failures.append(f"Box {p_idx} class mismatch: Py={p_det.get('classId')} vs TS={t_det.get('classId')}")

                if not pass_pair:
                    img_passed = False

                pairs.append({
                    "py_box": p_box,
                    "ts_box": t_det["box"],
                    "py_score": p_det["score"],
                    "ts_score": t_det["score"],
                    "iou": round(best_iou, 5),
                    "score_diff": round(score_diff, 5),
                    "passed": pass_pair
                })
            else:
                img_passed = False
                img_failures.append(f"Py box {p_idx} has no matching TS box")

        if not img_passed:
            all_passed = False

        image_reports.append({
            "name": name,
            "py_box_count": len(py_boxes),
            "ts_box_count": len(ts_boxes),
            "passed": img_passed,
            "failures": img_failures,
            "pairs": pairs
        })

    result = {
        "passed": all_passed,
        "image_count": len(images),
        "total_py_boxes": total_py_boxes,
        "total_ts_boxes": total_ts_boxes,
        "min_observed_iou": round(min_observed_iou, 5) if total_py_boxes > 0 else 1.0,
        "max_observed_score_diff": round(max_observed_score_diff, 5),
        "min_required_iou": args.min_iou,
        "max_allowed_score_diff": args.max_score_diff,
        "images": image_reports
    }

    os.makedirs(os.path.dirname(args.out_json), exist_ok=True)
    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print("\n=== FX12 TS vs PYTHON PARITY SUMMARY ===")
    print(f"Overall Result: {'PASS' if all_passed else 'FAIL'}")
    print(f"Images tested: {len(images)}")
    print(f"Total Boxes: Py={total_py_boxes}, TS={total_ts_boxes}")
    print(f"Min Observed IoU: {result['min_observed_iou']} (req >= {args.min_iou})")
    print(f"Max Observed Score Diff: {result['max_observed_score_diff']} (req <= {args.max_score_diff})")
    print(f"Saved to: {args.out_json}")

    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())
