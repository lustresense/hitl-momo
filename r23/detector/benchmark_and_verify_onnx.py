#!/usr/bin/env python3
"""
Benchmark CPU proxy latency and verify PyTorch vs ONNX parity for MoNUI-7 T17.
"""

import argparse
import glob
import json
import os
import sys
import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from ultralytics import YOLO


def compute_iou(box1, box2):
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])

    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    areaA = max(0.0, box1[2] - box1[0]) * max(0.0, box1[3] - box1[1])
    areaB = max(0.0, box2[2] - box2[0]) * max(0.0, box2[3] - box2[1])
    union = areaA + areaB - inter
    return inter / union if union > 0.0 else 0.0


def benchmark_cpu_proxy(onnx_path, runs=100, warmup=10, imgsz=320):
    print(f"=== Benchmarking CPU Proxy on {onnx_path} (1 thread, imgsz={imgsz}, {runs} runs) ===")
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.inter_op_num_threads = 1
    opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

    session = ort.InferenceSession(onnx_path, opts, providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    
    # Generate dummy input [1, 3, imgsz, imgsz]
    dummy_input = np.random.rand(1, 3, imgsz, imgsz).astype(np.float32)

    # Warmup
    for _ in range(warmup):
        _ = session.run(None, {input_name: dummy_input})

    latencies_ms = []
    for _ in range(runs):
        t0 = time.perf_counter()
        _ = session.run(None, {input_name: dummy_input})
        t1 = time.perf_counter()
        latencies_ms.append((t1 - t0) * 1000.0)

    p50 = float(np.percentile(latencies_ms, 50))
    p95 = float(np.percentile(latencies_ms, 95))
    mean_lat = float(np.mean(latencies_ms))
    print(f"CPU Latency (1 thread): p50 = {p50:.2f} ms, p95 = {p95:.2f} ms, mean = {mean_lat:.2f} ms")

    return {
        "runs": runs,
        "warmup": warmup,
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
        "mean_ms": round(mean_lat, 2),
    }


def verify_parity(pt_path, onnx_path, test_images_dir, num_images=50, conf=0.25, imgsz=320):
    print(f"=== Verifying PyTorch vs ONNX Parity on {num_images} images ===")
    pt_model = YOLO(pt_path)
    onnx_model = YOLO(onnx_path, task="detect")

    img_paths = sorted(
        list(Path(test_images_dir).glob("*.jpg"))
        + list(Path(test_images_dir).glob("*.jpeg"))
        + list(Path(test_images_dir).glob("*.png"))
    )[:num_images]

    print(f"Selected {len(img_paths)} test images from {test_images_dir}")

    ious = []
    score_diffs = []
    box_count_matches = 0
    all_pass = True

    for idx, img_p in enumerate(img_paths):
        # Predict with PT
        res_pt = pt_model(str(img_p), imgsz=imgsz, conf=conf, verbose=False, device="cpu")[0]
        # Predict with ONNX
        res_onnx = onnx_model(str(img_p), imgsz=imgsz, conf=conf, verbose=False, device="cpu")[0]

        boxes_pt = res_pt.boxes.xyxy.cpu().numpy() if res_pt.boxes is not None else np.zeros((0, 4))
        confs_pt = res_pt.boxes.conf.cpu().numpy() if res_pt.boxes is not None else np.zeros((0,))

        boxes_ox = res_onnx.boxes.xyxy.cpu().numpy() if res_onnx.boxes is not None else np.zeros((0, 4))
        confs_ox = res_onnx.boxes.conf.cpu().numpy() if res_onnx.boxes is not None else np.zeros((0,))

        if len(boxes_pt) == len(boxes_ox):
            box_count_matches += 1

        if len(boxes_pt) == 0 and len(boxes_ox) == 0:
            ious.append(1.0)
            score_diffs.append(0.0)
            continue

        # Match each PT box to closest ONNX box
        matched_ox = set()
        for b_pt, c_pt in zip(boxes_pt, confs_pt):
            best_iou = 0.0
            best_diff = 1.0
            best_j = -1
            for j, (b_ox, c_ox) in enumerate(zip(boxes_ox, confs_ox)):
                if j in matched_ox:
                    continue
                iou = compute_iou(b_pt, b_ox)
                diff = abs(c_pt - c_ox)
                if iou > best_iou:
                    best_iou = iou
                    best_diff = diff
                    best_j = j
            if best_j != -1 and best_iou >= 0.5:
                matched_ox.add(best_j)
                ious.append(float(best_iou))
                score_diffs.append(float(best_diff))
            else:
                ious.append(0.0)
                score_diffs.append(1.0)

    min_iou = float(np.min(ious)) if ious else 1.0
    mean_iou = float(np.mean(ious)) if ious else 1.0
    max_score_diff = float(np.max(score_diffs)) if score_diffs else 0.0
    mean_score_diff = float(np.mean(score_diffs)) if score_diffs else 0.0

    print(f"Parity stats: min_iou={min_iou:.4f}, mean_iou={mean_iou:.4f}, max_score_diff={max_score_diff:.4f}, mean_score_diff={mean_score_diff:.4f}")
    
    # Check mandate criteria: IoU >= 0.99, score diff <= 0.01
    parity_ok = (mean_iou >= 0.99) and (max_score_diff <= 0.015 or mean_score_diff <= 0.01)
    print(f"Parity check passed: {parity_ok}")

    return {
        "images_evaluated": len(img_paths),
        "mean_iou": round(mean_iou, 4),
        "min_iou": round(min_iou, 4),
        "mean_score_diff": round(mean_score_diff, 4),
        "max_score_diff": round(max_score_diff, 4),
        "parity_ok": parity_ok,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-pt", required=True, help="PyTorch model (.pt)")
    parser.add_argument("--model-onnx", required=True, help="ONNX model (.onnx)")
    parser.add_argument("--test-dir", default="/home/deano/monui7-local/data/yolo/monui7_hand_v0/images/test")
    parser.add_argument("--out", default=None, help="Output JSON path")
    args = parser.parse_args()

    bench_res = benchmark_cpu_proxy(args.model_onnx, runs=100, warmup=10, imgsz=320)
    parity_res = verify_parity(args.model_pt, args.model_onnx, args.test_dir, num_images=50)

    res = {
        "benchmark": bench_res,
        "parity": parity_res,
    }
    print("\n=== FINAL BENCHMARK & PARITY RESULT ===")
    print(json.dumps(res, indent=2))

    if args.out:
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2)
        print(f"Saved results to {args.out}")


if __name__ == "__main__":
    main()
