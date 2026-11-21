# MoNUI-7 R23 FX09 — YOLO26n v0 Training & Evaluation Report

**Mandate**: NUI_R23-02 v1.2.0 §4 FX09  
**Status**: COMPLETED (PASS)  
**Date**: 2026-11-21  
**Author**: Antigravity (MoNUI-7 Autonomous Remediation)

---

## 1. Executive Summary

This report documents the execution of FX09 under Mandate v1.2.0. Two models were trained simultaneously on dual NVIDIA RTX A5000 GPUs using the Ultralytics CLI with architecture `yolo26n.pt` and single class detection (`single_cls=True`):
1. **`fx_v0a`**: Trained on `monui7_hand_v0.yaml` (101,844 train images across HaGRID, Open Images, IPN, HANDS, and 3,000 Open Images negative samples).
2. **`fx_v0b`**: Trained on `monui7_hand_v0_dark.yaml` (131,497 train images, adding 29,653 synthetic dark degraded hand samples from FX06).

Both models completed training using early stopping / epoch limit (`patience=15`, max 60 epochs). Full test split evaluation across 13,147 test images (18,412 ground-truth hand boxes) was conducted using `eval_by_source_and_luma.py` at IoU threshold 0.50 and confidence threshold 0.35.

**Winner Selection**: **`fx_v0a`** is selected as the winner. Model `fx_v0b` failed the promotion rule: pooled B0+B1 recall dropped by -1.70 points (required gain $\ge +3$ points), and B3 recall dropped by -4.06 points (required drop $\le 1$ point).

`fx_v0a` passed all STOP gates:
- HaGRID test recall: **99.35%** (threshold $\ge 80.0\%$)
- HANDS test recall: **98.90%** (threshold $\ge 80.0\%$)
- Strict per-box PyTorch vs ONNX parity: **PASS** (100% of 65 boxes across 50 test images matched with IoU $\ge 0.99$ and score diff $\le 0.01$).
- ONNX output shape: `[1, 5, 2100]` (9.3 MB, $\le 10$ MiB).
- CPU proxy latency (1 thread, 320px): **p50 = 13.82 ms, p95 = 14.62 ms**.

---

## 2. Model Training Configuration

| Parameter | fx_v0a | fx_v0b |
| :--- | :--- | :--- |
| **GPU Device** | Device 0 (RTX A5000 24GB) | Device 1 (RTX A5000 24GB) |
| **Command Line Model** | `yolo26n.pt` | `yolo26n.pt` |
| **Parameters** | 2,533,886 (260 layers, fused 121 layers 2.39M) | 2,533,886 (260 layers, fused 121 layers 2.39M) |
| **Dataset Config** | `monui7_hand_v0.yaml` | `monui7_hand_v0_dark.yaml` |
| **Training Images** | 101,844 | 131,497 |
| **Validation Images** | 12,375 | 12,375 |
| **Test Images** | 13,147 | 13,147 |
| **Input Resolution** | 320 x 320 | 320 x 320 |
| **Batch Size** | 128 | 128 |
| **Workers** | 3 | 3 |
| **Epochs Completed** | 39 (early stopped) | 59 |
| **Seed** | 20261120 | 20261120 |

---

## 3. Test Split Evaluation by Luminance Bins & Source

Evaluated on 13,147 images and 18,412 ground truth boxes using `r23/detector/eval_by_source_and_luma.py`.

### Luminance Bins Comparison

| Metric | fx_v0a (Base) | fx_v0b (+Synth Dark) | Delta ($v0b - v0a$) | Gate Requirement | Decision |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Overall Recall** | **80.58%** (14837/18412) | 76.60% (14104/18412) | -3.98% | - | v0a superior |
| **B0 Recall** ($Y < 0.08$) | **59.38%** (95/160) | 56.25% (90/160) | -3.13% | - | v0a superior |
| **B1 Recall** ($0.08 \le Y < 0.15$) | **81.38%** (686/843) | 79.95% (674/843) | -1.43% | - | v0a superior |
| **B0 + B1 Pooled Recall** | **77.87%** (781/1003) | 76.17% (764/1003) | **-1.70%** | **Gain $\ge +3.0$ pts** | **FAILED** |
| **B2 Recall** ($0.15 \le Y < 0.30$) | **62.03%** (1640/2644) | 57.64% (1524/2644) | -4.39% | - | v0a superior |
| **B3 Recall** ($Y \ge 0.30$) | **84.09%** (12416/14765) | 80.03% (11816/14765) | **-4.06%** | **Drop $\le 1.0$ pt** | **FAILED** |

### Per-Source Breakdown

| Source | fx_v0a Recall | fx_v0a TP / Total | fx_v0b Recall | fx_v0b TP / Total | STOP Gate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **HaGRID** | **99.35%** | 6271 / 6312 | 98.91% | 6243 / 6312 | PASS ($\ge 80\%$) |
| **HANDS** | **98.90%** | 2077 / 2100 | 97.67% | 2051 / 2100 | PASS ($\ge 80\%$) |
| **IPN** | **75.43%** | 3875 / 5137 | 73.33% | 3767 / 5137 | - |
| **Open Images** | **53.75%** | 2614 / 4863 | 42.01% | 2043 / 4863 | - |
| **oineg (negatives)** | tidak diukur | (train-only) | tidak diukur | (train-only) | - |

---

## 4. Promotion Rule & STOP Gate Decision

1. **Promotion Rule (T17 v1.1.0 / FX09 v1.2.0)**:
   - Pooled B0+B1 recall delta: **-1.70 pts** (< +3.0 pts target).
   - B3 recall delta: **-4.06 pts** (exceeds allowable drop of $\le 1.0$ pt).
   - **Winner**: **`fx_v0a`**.
2. **STOP Gate**:
   - HaGRID test recall: **99.35%** $\ge 80.0\%$ (PASS).
   - HANDS test recall: **98.90%** $\ge 80.0\%$ (PASS).
   - Gate status: **PASSED**.

---

## 5. Winning Model ONNX Export, Parity & Latency

- **Model File**: `/home/deano/monui7-local/data/release/monui7-hand-yolo26n-320.onnx`
- **SHA-256**: `97f778ea77f4dbf160e91dff021a463ab464cdbf27a34d067d5f28708dbf1ddb`
- **Output Shape**: `[1, 5, 2100]` (Raw YOLO anchor format; NMS required in post-processing).
- **File Size**: 9.3 MB (9,726,203 bytes, $\le 10$ MiB).
- **Parity Test**: 50 test images, 65 candidate boxes.
  - Zero failing boxes (100% matched with IoU = 1.0, score diff = 0.0).
  - Status: **PASS**.
- **CPU Proxy Latency** (1 thread, 320px input, 100 runs):
  - **p50**: **13.82 ms**
  - **p95**: **14.62 ms**
  - **Mean**: 13.81 ms

---

## 6. Checklist Completion

- [x] `args.yaml` verified `yolo26n.pt` architecture.
- [x] Evaluation metrics per source and per luma bin calculated on full test split.
- [x] STOP gate passed ($\ge 80\%$ for HaGRID and HANDS).
- [x] Strict per-box parity test passed ($IoU \ge 0.99, \Delta score \le 0.01$).
- [x] ONNX exported and verified $\le 10$ MiB.
- [x] Released to `$DATA_ROOT/release/monui7-hand-yolo26n-320.onnx` + `model_meta.json`.
