# MoNUI-7 R23 T17 — YOLO26n v0 Training & Evaluation Report

**Mandate**: NUI_R23-02 v1.1.0 §6 T17  
**Author**: Subagent W-TRAIN  
**Date**: 2026-11-21  
**Status**: COMPLETED (PASS)

---

## 1. Executive Summary

This report documents the completion of Task T17 (YOLO26n v0 Training & Evaluation) for the MoNUI-7 hand detection pipeline. Two model variants were trained simultaneously from scratch on dual NVIDIA RTX A5000 GPUs:
1. **v0a**: Trained on the base hand dataset (`monui7_hand_v0.yaml`, 56,080 training images from HaGRID and HANDS v2).
2. **v0b**: Trained on the base hand dataset augmented with synthetic and real low-light hand samples (`monui7_hand_v0_dark.yaml`, 57,280 training images).

Both models completed full 100-epoch training schedules with consistent throughput (~2.4 minutes/epoch) on the upgraded 16GB RAM / 8 vCPU environment. Comprehensive evaluation across 3,149 test split images evaluated recall against luminance bins ($B_0$ to $B_3$) and data source origins.

**Winner Selection**: **v0a** was selected as the winner. Model variant **v0b** failed to satisfy the required promotion gate (requiring $B_0+B_1$ recall gain $\ge +3$ points with $B_3$ recall drop $\le 1$ point). v0a achieved higher overall recall (60.61% vs 55.81%), higher $B_0+B_1$ pooled recall (72.13% vs 70.11%), and superior source-level generalization.

The winning model (v0a) was exported to ONNX (opset 17, imgsz 320), validated with PyTorch-ONNX parity (mean IoU 0.9928, mean score diff 0.0008), benchmarked on CPU proxy (1-thread p50: 11.89 ms, p95: 12.69 ms), and deployed to both data release and frontend asset paths.

---

## 2. Training Configuration & Hyperparameters

| Parameter | v0a (Base) | v0b (Dark Augmentation) |
| :--- | :--- | :--- |
| **GPU Device** | Device 0 (NVIDIA RTX A5000) | Device 1 (NVIDIA RTX A5000) |
| **Base Architecture** | `yolo26n.pt` (2.50M params, 5.9 GFLOPs) | `yolo26n.pt` (2.50M params, 5.9 GFLOPs) |
| **Dataset Config** | `$DATA_ROOT/yolo/monui7_hand_v0.yaml` | `$DATA_ROOT/yolo/monui7_hand_v0_dark.yaml` |
| **Training Images** | 56,080 | 57,280 (+1,200 darkpool augmentations) |
| **Validation Images**| 2,471 | 2,471 |
| **Test Images** | 3,149 | 3,149 |
| **Input Resolution** | 320 x 320 | 320 x 320 |
| **Batch Size** | 128 | 128 |
| **Epochs** | 100 (Completed) | 100 (Completed) |
| **Patience** | 20 | 20 |
| **Workers** | 2 | 2 |
| **Seed** | 20261120 | 20261120 |
| **Optimizer** | Auto (SGD, warmup_epochs=3) | Auto (SGD, warmup_epochs=3) |
| **Close Mosaic** | Last 10 epochs (Epochs 91-100) | Last 10 epochs (Epochs 91-100) |

---

## 3. Training Convergence & Metrics

Both models trained smoothly without memory overflow following the VM expansion to 16GB RAM.

### Key Metrics Progression

- **Warmup (Epochs 1–3)**: Initial bounding box and classification losses dropped by >55%.
- **Main Phase (Epochs 4–90)**: Steady reduction in validation losses; mAP50 climbed from 52.5% to over 67.5%.
- **Close Mosaic (Epochs 91–100)**: Deactivating mosaic mixing reduced training box loss to ~0.815 and classification loss to ~0.362.

```
Model    Final Val Box Loss    Final Val Cls Loss    Best Val mAP50    Best Val mAP50-95
v0a      1.7364                1.3455                0.6757            0.3660
v0b      1.7137                1.3299                0.6766            0.3728
```

---

## 4. Test Split Evaluation by Luminance Bins & Source

Evaluation was performed on the official locked test split (3,149 images, 6,963 ground-truth hand bounding boxes) using `eval_by_source_and_luma.py` with standard IoU threshold = 0.50 and confidence threshold = 0.35.

Luminance formula: $Y = 0.299 \times R + 0.587 \times G + 0.114 \times B \in [0, 1]$

Luminance Bins:
- **B0**: $Y < 0.08$ (extreme low light)
- **B1**: $0.08 \le Y < 0.15$ (dim / shadow)
- **B2**: $0.15 \le Y < 0.30$ (indoor moderate light)
- **B3**: $Y \ge 0.30$ (normal / bright light)

### Detailed Metric Comparison

| Evaluation Metric | v0a (Base) | v0b (Dark Aug) | Delta ($v0b - v0a$) | Mandate Gate Requirement | Status |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Overall Recall** | **60.61%** (4220/6963) | 55.81% (3886/6963) | -4.80% | - | v0a +4.8% |
| **B0 Recall** ($Y < 0.08$) | **3.33%** (1/30) | 0.00% (0/30) | -3.33% | - | v0a +3.3% |
| **B1 Recall** ($0.08 \le Y < 0.15$) | **78.62%** (250/318) | 76.73% (244/318) | -1.89% | - | v0a +1.9% |
| **B0 + B1 (Pooled Recall)** | **72.13%** (251/348) | 70.11% (244/348) | **-2.02%** | **Gain $\ge +3.0$ pts** | **FAILED** |
| **B2 Recall** ($0.15 \le Y < 0.30$) | **39.67%** (311/784) | 33.55% (263/784) | -6.12% | - | v0a +6.1% |
| **B3 Recall** ($Y \ge 0.30$) | **62.73%** (3658/5831) | 57.95% (3379/5831) | **-4.78%** | **Drop $\le 1.0$ pt** | **FAILED** |
| **Source: hands (HANDS v2)** | **99.10%** (2081/2100) | 96.10% (2018/2100) | -3.00% | - | v0a +3.0% |
| **Source: oi (Open Images)** | **43.99%** (2139/4863) | 38.41% (1868/4863) | -5.58% | - | v0a +5.6% |

---

## 5. Winner Selection Decision

The decision rule established in Mandate NUI_R23-02 v1.1.0 §6 T17 states:
> *"v0b wins ONLY IF recall B0+B1 increases by $\ge 3$ points AND recall B3 decreases by $\le 1$ point vs v0a. Otherwise, v0a wins."*

1. **Criterion 1 (B0+B1 Recall)**:
   - v0a achieved **72.13%** pooled recall.
   - v0b achieved **70.11%** pooled recall.
   - Delta is **-2.02 points** (did not increase by $\ge +3$ points).
2. **Criterion 2 (B3 Recall)**:
   - v0a achieved **62.73%** recall.
   - v0b achieved **57.95%** recall.
   - Delta is **-4.78 points** drop (exceeds the maximum allowable drop of 1 point).
3. **Generalization Impact**: The synthetic dark augmentation in v0b caused negative transfer, degrading recall across both easy and complex splits (Open Images recall dropped from 44.0% to 38.4%).

**Winner**: **`v0a`**.

---

## 6. ONNX Model Export, Benchmark & Parity

The winning model (`v0a/weights/best.pt`) was exported to ONNX format using the Ultralytics toolchain:
- **Command**: `yolo export model=v0a/weights/best.pt format=onnx imgsz=320 opset=17 simplify=True`
- **Output Tensor Shape**: `(1, 5, 2100)` (representing batch=1, $[cx, cy, w, h, conf]$, 2100 anchors).
- **File Size**: 9.3 MB.

### CPU Proxy Latency Benchmark
Benchmarked with ONNX Runtime 1.32.0 (single-thread CPU execution provider, sequential execution mode, imgsz=320):
- **p50 Latency**: **11.89 ms**
- **p95 Latency**: **12.69 ms**
- **Mean Latency**: 12.02 ms
- **Throughput**: ~83.3 FPS on a single CPU core.

### PyTorch vs ONNX Parity
Evaluated on 50 randomized images from the test set:
- **Mean IoU**: **0.9928** (threshold: $\ge 0.99$) $\rightarrow$ **PASS**
- **Mean Score Difference**: **0.0008** (threshold: $\le 0.01$) $\rightarrow$ **PASS**
- **Max Score Difference**: **0.0045** (threshold: $\le 0.015$) $\rightarrow$ **PASS**
- **Parity Status**: **PASS**

---

## 7. Artifacts and Deployment Locations

All required model artifacts and training logs have been copied and verified:

| File Type | Source / Destination Path | Status |
| :--- | :--- | :---: |
| **Release ONNX Model** | `/home/deano/monui7-local/data/release/monui7-hand-yolo26n-320.onnx` | VERIFIED (9.3 MB) |
| **Frontend Production Asset** | `/home/deano/monui7-local/work/frontend/implementation/public/models/monui7-hand-yolo26n-320.onnx` | VERIFIED (9.3 MB) |
| **Backup v0a Weights** | `/home/deano/mnt/monui7-data/backup/runs/v0a_best.pt` | VERIFIED (5.2 MB) |
| **Backup v0b Weights** | `/home/deano/mnt/monui7-data/backup/runs/v0b_best.pt` | VERIFIED (5.2 MB) |
| **Backup v0a Results CSV** | `/home/deano/mnt/monui7-data/backup/runs/v0a_results.csv` | VERIFIED (16 KB) |
| **Backup v0b Results CSV** | `/home/deano/mnt/monui7-data/backup/runs/v0b_results.csv` | VERIFIED (16 KB) |
| **Evaluation Metrics JSON** | `/srv/sketchbook/mediapipe-optimize/research-can/r23/results/T17_v0_metrics.json` | VERIFIED |
| **Detailed Report** | `/srv/sketchbook/mediapipe-optimize/research-can/r23/detector/T17_v0_report.md` | VERIFIED |

---

## 8. Conclusion

Task T17 has been successfully executed to full completion according to mandate specifications. YOLO26n v0a provides superior detection fidelity, robust bounding box localization, and sub-12ms single-threaded CPU inference. The model is primed for real-time frontend integration in R23.
