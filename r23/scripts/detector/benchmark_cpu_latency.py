#!/usr/bin/env python3
"""Benchmark CPU proxy latency for ONNX model (mandate v1.2.0 FX09 step 9).

Requirements:
- ONNX Runtime 1 thread (CPUExecutionProvider).
- 320x320 px input tensor.
- 100 inference runs.
- Reports p50 and p95 latency.
"""
import json
import os
import sys
import time
import numpy as np
import onnxruntime as ort

def benchmark_model(onnx_path, runs=100, imgsz=320):
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 1
    opts.inter_op_num_threads = 1
    opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL

    sess = ort.InferenceSession(onnx_path, sess_options=opts, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    output_name = sess.get_outputs()[0].name

    # Create dummy input [1, 3, 320, 320]
    dummy_input = np.random.randn(1, 3, imgsz, imgsz).astype(np.float32)

    # Warmup 10 runs
    for _ in range(10):
        _ = sess.run([output_name], {input_name: dummy_input})

    # Benchmark runs
    latencies_ms = []
    for _ in range(runs):
        t0 = time.perf_counter()
        _ = sess.run([output_name], {input_name: dummy_input})
        dt = (time.perf_counter() - t0) * 1000.0
        latencies_ms.append(dt)

    latencies_ms.sort()
    p50 = float(np.percentile(latencies_ms, 50))
    p95 = float(np.percentile(latencies_ms, 95))
    mean = float(np.mean(latencies_ms))
    min_lat = float(np.min(latencies_ms))
    max_lat = float(np.max(latencies_ms))

    res = {
        "model_path": onnx_path,
        "runs": runs,
        "input_shape": [1, 3, imgsz, imgsz],
        "threads": 1,
        "provider": "CPUExecutionProvider",
        "p50_ms": round(p50, 2),
        "p95_ms": round(p95, 2),
        "mean_ms": round(mean, 2),
        "min_ms": round(min_lat, 2),
        "max_ms": round(max_lat, 2)
    }
    return res

def main():
    if len(sys.argv) < 2:
        print("Usage: benchmark_cpu_latency.py <onnx_path> [out_json]")
        return 1
    onnx_path = sys.argv[1]
    out_json = sys.argv[2] if len(sys.argv) > 2 else None

    res = benchmark_model(onnx_path)
    print("\n=== CPU PROXY BENCHMARK RESULTS ===")
    print(json.dumps(res, indent=2))

    if out_json:
        os.makedirs(os.path.dirname(out_json), exist_ok=True)
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2)
        print(f"Written to {out_json}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
