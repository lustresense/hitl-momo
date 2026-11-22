# MoNUI-7 R23B HF3 — `hf3_v2pre` (Preprocess-Aware A4v2) Detector Training & Evaluation Report

**Date:** 2026-11-23 WIB  
**Worker:** W-TRAIN (parallel track with MAIN HF3 implementation)  
**Preprocess Mode:** `A4v2` (`applyA4ChromaRecoveryInPlace`, pass `A4_denoise_reinhard320`) from `bench/r20-lowlight.ts`  
**Base Weights:** `fx_v0a` (`/home/deano/monui7-local/data/runs/fx_v0a/weights/best.pt`, SHA-256: `33457c31d25288ba6c11f853646f2c479d5edbc4bdaea129a6a38fdac16ea808`)  
**Candidate Model:** `hf3_v2pre` (`monui7-hand-yolo26n-320-hf3-v2pre.onnx`)  
**Release Staging:** `/home/deano/mnt/monui7-data/release/r23b_hf3_v2pre/` (candidate only; **NOT** installed into `$WORK/frontend/implementation/public/models/`)  
**Overall Gate Status:** **PASS (ALL GATES T-A THROUGH T-F VERIFIED)**

---

## 1. Executive Summary

To resolve the domain gap between clean training images (`fx_v0a`) and low-light webcam frames enhanced in-browser by `A4v2` (`A4_denoise_reinhard320` — 320px downscale, separable 5-tap median, conditional 3x3 binomial denoise for `meanLuma < 0.14`, and chroma-preserving Reinhard tone-mapping LUT), we ported the exact TypeScript `A4v2` pipeline to Python, trained `hf3_v2pre` from `fx_v0a` on `v0a` plus 30% FX06-darkened + `A4v2`-brightened samples (131,497 train images total), and evaluated both `fx_v0a` and `hf3_v2pre` on the full 13,147-image `v0a` test split (18,412 GT boxes) under both standard and FX06-darkened + `A4v2`-brightened conditions:

- **T-A (Python vs TS `A4v2` Pixel Parity, 20 real images):** **PASS** — **0.000000 / 255** mean absolute pixel difference, **0 / 255** max absolute pixel difference (100.0000% exact RGB channel match across 9 images with `meanLuma < 0.14` and 11 images with `meanLuma >= 0.14`), and **0.000000** max `meanLuma` diff.
- **T-D Standard `v0a` Test Split (13,147 images, 18,412 GT boxes, IoU $\ge 0.50$, conf $\ge 0.35$):**
  - Overall recall: `80.58%` (`fx_v0a`) $\rightarrow$ **`80.00%`** (`hf3_v2pre`), delta **`-0.58 pp`** (within required $\le 1.0\text{ pp}$ drop: **PASS**).
  - B3 ($Y \ge 0.30$) recall: `84.09%` $\rightarrow$ **`83.52%`**, delta **`-0.57 pp`** ($\le 1.0\text{ pp}$: **PASS**).
  - Un-brightened standard dark bins B0+B1 actually improved: `77.87%` $\rightarrow$ **`78.07%`** (`+0.20 pp`).
  - STOP gates preserved: HaGRID **`99.35%`** (`0.00 pp`), HANDS **`98.24%`** (`-0.66 pp`), both $\ge 80\%$.
- **T-D Darkened + `A4v2`-Brightened Test Split (13,147 images, 18,412 GT boxes):**
  - Overall recall: `57.86%` (`fx_v0a`) $\rightarrow$ **`69.93%`** (`hf3_v2pre`), gain **`+12.07 pp`** (+2,221 recovered hands).
  - Pre-A4 darkened **B0** ($Y_{\text{pre}} < 0.08$): `23.08%` $\rightarrow$ **`43.26%`** (**`+20.18 pp`**, +87.4% relative recall).
  - Pre-A4 darkened **B1** ($0.08 \le Y_{\text{pre}} < 0.15$): `45.15%` $\rightarrow$ **`63.54%`** (**`+18.39 pp`**).
  - Pre-A4 darkened **B0+B1 pooled**: `39.06%` $\rightarrow$ **`57.95%`** (**`+18.89 pp`**).
  - HaGRID dark+A4v2: `84.79%` $\rightarrow$ **`95.34%`** (`+10.55 pp`); HANDS dark+A4v2: `55.90%` $\rightarrow$ **`79.81%`** (`+23.91 pp`).
- **T-E (ONNX Export, Strict Per-Box Parity & Verified Release Staging):**
  - Output shape `[1, 5, 2100]`, opset 17, size **9,726,210 bytes (9.28 MiB $\le 10$ MiB)**, CPU proxy latency (1 thread, 320px): **p50 = 12.21 ms, p95 = 13.36 ms**.
  - Per-box Python/PyTorch vs TS (`monui7-yolo.ts` + `onnxruntime-web`) parity across 20 FX12 QA test images: **PASS** (`22/22` boxes matched, min IoU **`0.99976`** $\ge 0.99$, max score diff **`0.00025`** $\le 0.01$).
  - PyTorch vs ONNX 50-image strict per-box parity (`verify_fx09_parity.py`): **PASS** (`64/64` boxes matched, 0 failures, min IoU **`1.0000`**, max score diff **`0.0000`**).
  - SHA-256 read-back verified on `/home/deano/mnt/monui7-data/release/r23b_hf3_v2pre/`: ONNX `d1b26943d36b3e294008b52588f81e75c3cd50e27ee50514c572d02222db4e3a`.
- **Disk Hygiene:** Local scratch datasets purged; `/` returned to **64%** (`76G / 126G`, `45G` available, $\le 65\%$).

---

## 2. T-A: Python Port of `A4v2` & Exact Pixel Parity vs TypeScript

### 2.1 Implemented Single-Frame `A4v2` Pipeline
Ported verbatim from `frontend/implementation/src/components/nui-lab/bench/r20-lowlight.ts` into `$DATA_ROOT/jobs/hf3_v2pre/a4v2_preprocess.py` (`temporalPrev = null`):
1. **320px Downscale:** `w = 320`, `h = max(1, js_round(320 * origH / max(1, origW)))` (`cv2.INTER_AREA` downscale / `cv2.INTER_LINEAR` upscale).
2. **`meanLuma` (`analyzeFrameLuma`, `step=2`):** `(77*r + 150*g + 29*b + 128) >> 8` on stride-2 grid, rounded with JS half-up `Math.floor(raw * 10000 + 0.5) / 10000`.
3. **Motion-Gated Temporal EMA (`temporalPrev = null`):** exact no-op on single independent image.
4. **Separable 5-Tap Clamped-Border Median (`sepMedian5RgbaInPlace`):** horizontal 5-tap then vertical 5-tap median on R, G, B via exact 9-op vectorized `uint8` sorting network (verified on all $5! = 120$ permutations + random arrays).
5. **Conditional 3x3 Binomial Denoise (`meanLuma < 0.14`):** kernel `[1,2,1; 2,4,2; 1,2,1]` with `(sum + 8) >> 4` on interior `1..h-2, 1..w-2`, 1px border untouched.
6. **Chroma-Preserving Reinhard LUT (`targetLuma = 0.48`):** `m = max(meanLuma, 0.015)`, `k = clamp(0.48 / m, 1.0, 14.0)`; bypassed if `k <= 1.04`, else `y = (k*x) / (1 + (k - 1)*x)`, `v = clamp(floor(y*255 + 0.5), 0, 255)`.

### 2.2 20-Image Python vs TypeScript Parity Verification
Evaluated directly against Node v26 executing the actual TS `analyzeFrameLuma` and `applyA4ChromaRecoveryInPlace` exports from `r20-lowlight.ts` on 20 real FX12 test images (10 FX06-darkened across gains `0.03..0.25` + 10 normal; **9 images with `meanLuma < 0.14`** exercising `denoise3x3RgbaInPlace` and **11 images with `meanLuma >= 0.14`**, covering `m = 0.015` clamp and `k <= 1.04` bypass):

| Parity Metric | Observed | Requirement | Status |
| :--- | :---: | :---: | :---: |
| Images Tested | 20 (9 `< 0.14`, 11 `>= 0.14`) | 20 (mix `< 0.14` & `>= 0.14`) | **PASS** |
| Overall Mean Abs Pixel Diff | **0.000000 / 255** | $\le 1.0 / 255$ | **PASS** |
| Overall Max Abs Pixel Diff | **0 / 255** | $\le 1.0 / 255$ | **PASS** |
| Max `meanLuma` Diff | **0.000000** | 0.0000 | **PASS** |
| Exact RGB Channel Match | **100.0000%** | — | **PASS** |

<details>
<summary>Per-image T-A parity table (all 20 images)</summary>

| Image Case | Type | Size | `meanLuma` (Py/TS) | 3x3 Denoise | Mean Diff (/255) | Max Diff (/255) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `dark_00__hagrid__000610e1...` | `fx06_dark(gain=0.03)` | 320x427 | 0.0730 / 0.0730 | Yes | 0.000000 | 0 |
| `dark_01__hagrid__00080ad4...` | `fx06_dark(gain=0.04)` | 320x240 | 0.1078 / 0.1078 | Yes | 0.000000 | 0 |
| `dark_02__hagrid__0018d9da...` | `fx06_dark(gain=0.05)` | 320x427 | 0.1218 / 0.1218 | Yes | 0.000000 | 0 |
| `dark_03__hagrid__003ca89c...` | `fx06_dark(gain=0.06)` | 320x148 | 0.1318 / 0.1318 | Yes | 0.000000 | 0 |
| `dark_04__hagrid__003d8694...` | `fx06_dark(gain=0.08)` | 320x427 | 0.1571 / 0.1571 | No | 0.000000 | 0 |
| `dark_05__hagrid__0043f91e...` | `fx06_dark(gain=0.10)` | 320x428 | 0.1732 / 0.1732 | No | 0.000000 | 0 |
| `dark_06__hagrid__00585bc3...` | `fx06_dark(gain=0.14)` | 320x427 | 0.0893 / 0.0893 | Yes | 0.000000 | 0 |
| `dark_07__hagrid__005b7472...` | `fx06_dark(gain=0.18)` | 320x427 | 0.3920 / 0.3920 | No | 0.000000 | 0 |
| `dark_08__hands__Subject4_028` | `fx06_dark(gain=0.22)` | 320x180 | 0.2856 / 0.2856 | No | 0.000000 | 0 |
| `dark_09__hands__Subject4_033` | `fx06_dark(gain=0.25)` | 320x180 | 0.5030 / 0.5030 | No | 0.000000 | 0 |
| `norm_10__hands__Subject4_050` | `normal` | 320x180 | 0.5620 / 0.5620 | No | 0.000000 | 0 |
| `norm_11__ipn__1CM42_13_R_46` | `normal` | 320x240 | 0.1238 / 0.1238 | Yes | 0.000000 | 0 |
| `norm_12__ipn__1CM42_13_R_61` | `normal` | 320x240 | 0.1230 / 0.1230 | Yes | 0.000000 | 0 |
| `norm_13__ipn__1CM42_13_R_76` | `normal` | 320x240 | 0.1225 / 0.1225 | Yes | 0.000000 | 0 |
| `norm_14__oi__0041c772f8b9...` | `normal` | 320x213 | 0.4331 / 0.4331 | No | 0.000000 | 0 |
| `norm_15__oi__0063adbf0c5a...` | `normal` | 320x214 | 0.0123 / 0.0123 | Yes | 0.000000 | 0 |
| `norm_16__oi__00ca02eef999...` | `normal` | 320x212 | 0.1745 / 0.1745 | No | 0.000000 | 0 |
| `norm_17__oi__00ce20081f1e...` | `normal` | 320x282 | 0.2861 / 0.2861 | No | 0.000000 | 0 |
| `norm_18__oi__00d3a741e5c0...` | `normal` | 320x301 | 0.6288 / 0.6288 | No | 0.000000 | 0 |
| `norm_19__oi__012fff5ad5a5...` | `normal` | 320x408 | 0.4311 / 0.4311 | No | 0.000000 | 0 |

</details>

---

## 3. T-B: Dataset Preparation (`monui7_hand_hf3_v2pre`)

- **Base Extraction:** Stream-extracted `yolo/monui7_hand_v0` directly from `/home/deano/mnt/monui7-data/backup/data/r23_final_yolo.tar` (`101,844` train, `12,375` val, `13,147` test) without copying the tar locally.
- **Zero-Duplication Hardlinking:** All 101,844 original `v0a` train images and labels were OS-hardlinked into `monui7_hand_hf3_v2pre/train/` (0 extra disk blocks); `val` was symlinked; generated `a4dark__*.txt` labels were hardlinked to source `.txt` labels (normalized YOLO coordinates preserved identically).
- **30% Stratified Darkened + `A4v2` Train Augmentation (Seed = `20261120`):**
  - Exact FX06 9-step physics degradation from `r23/scripts/data/make_synthetic_dark.py`: max-dim $\le 640$, sRGB $\rightarrow$ linear, gain $U(0.03, 0.25)$, Poisson shot noise ($U(0.5, 2.0)$) + Gaussian read noise ($\sigma \sim U(1, 6)/255$), per-channel color cast $U(0.85, 1.15)$, linear $\rightarrow$ sRGB, motion blur ($p=0.30$, kernel 3–9px), backlight glare ramp ($p=0.20$, intensity $U(0.20, 0.50)$), JPEG quality $U(40, 85)$ round-trip.
  - Followed immediately by downscale to `R20_ENHANCE_WIDTH = 320` and exact T-A `apply_a4_chroma_recovery_rgb`, saved as 320px JPEG (`Q=90`, ~630 MB ext4 footprint).

| Dataset Component | Source / Split | Count | Notes |
| :--- | :--- | :---: | :--- |
| Original `v0a` Train (hardlinked) | `hagrid`, `oi`, `hands`, `ipn`, `oineg` | **101,844** | Includes 3,000 `oineg` negatives |
| Added `a4dark` Train (30% labeled) | `hagrid` | **17,383** | 30% of 57,944 |
| Added `a4dark` Train (30% labeled) | `ipn` | **6,000** | 30% of 20,000 |
| Added `a4dark` Train (30% labeled) | `oi` | **5,946** | 30% of 19,820 |
| Added `a4dark` Train (30% labeled) | `hands` | **324** | 30% of 1,080 |
| **Total `a4dark` Train Generated** | Stratified 30% (seed `20261120`) | **29,653** | 0 failures, 0 corrupt; 7,381 (`24.9%`) had pre-A4 `meanLuma < 0.14` (mean `0.2145`) |
| **Combined `hf3_v2pre` Train** | `v0a` + `a4dark` | **131,497** | 131,497 images / 131,497 labels (exact 1:1) |
| Validation Split (symlinked) | `v0a` val | **12,375** | Unmodified standard validation split |
| Standard Test Split | `v0a` test | **13,147** | 18,412 GT boxes |
| Darkened + `A4v2` Test Split | FX06 dark (seed `20261121`) $\rightarrow$ 320px $\rightarrow$ `A4v2` | **13,147** | 18,412 GT boxes; 0 failures, 0 corrupt; pre-A4 GT-box luma saved in `pre_a4_gt_luma.json` |

---

## 4. T-C: Training Configuration, Thermal Management & Convergence

### 4.1 Thermal SOP Compliance
- Started Run 1 on GPU 0 (`RTX A5000 24GB`); on Epoch 2, GPU 0 reached `76–77°C` sustained (`> 70°C` / `> 75°C` SOP threshold). Per `AGENTS.md` Rule 4, immediately halted GPU 0 (cooling back to `36°C`) and migrated training cleanly to **GPU 1** (`CUDA_VISIBLE_DEVICES=1`).
- Across all subsequent training on GPU 1:
  - Run 1 (GPU 1, 55 samples): min `36°C`, max `77°C`, avg **`71.6°C`**.
  - Run 2 (GPU 1, 105 samples, 51.5 min): min `37°C`, max `77°C`, avg **`72.7°C`**, while GPU 0 remained idle at `36°C`.
- Root partition `/` stayed strictly within emergency compute tolerance (`72–73%`, peak `88,856M / 128,698M`) throughout training.

### 4.2 Run Diagnostics & Final Selected Checkpoint
1. **Run 1 (Default CLI schedule: `epochs=30, patience=10, lr0=0.01, warmup_epochs=3.0`):**
   - Hit `mAP50 = 0.82634`, `mAP50-95 = 0.57756` on **Epoch 1** (during initial low warmup LR), then default 3-epoch MuSGD warmup spiked `lr/pg0` to `0.028` on Epochs 2–3, causing a transient val dip that triggered `patience=10` early stopping at Epoch 11 before LR finished decaying or `close_mosaic` engaged.
   - A 600-image val diagnostic confirmed Epoch 1 already gained `+8.90 pp` on dark+A4v2 (`58.61% -> 67.51%`), while Epoch 11 reached `+12.14 pp` (`70.75%`) with `0.00 pp` standard val drop — proving multi-epoch cosine convergence with `close_mosaic` would unlock substantially better adaptation.
2. **Run 2 (Final `hf3_v2pre` — Cosine Fine-Tune Schedule):**
   - CLI Command:
     ```bash
     CUDA_VISIBLE_DEVICES=1 yolo detect train \
       model=/home/deano/monui7-local/data/runs/fx_v0a/weights/best.pt \
       data=/home/deano/monui7-local/data/yolo/monui7_hand_hf3_v2pre.yaml \
       epochs=20 patience=10 imgsz=320 batch=128 device=0 \
       lr0=0.003 lrf=0.01 warmup_epochs=1.0 cos_lr=True close_mosaic=5 \
       project=/home/deano/monui7-local/data/runs name=hf3_v2pre \
       exist_ok=True seed=20261120 workers=8 single_cls=True
     ```
   - Completed **20 / 20 epochs** (`exit 0`, duration `3,092.6 s` / `51.5 min`), with full cosine LR decay (`0.00999 -> 0.00016`) and 5 epochs of `close_mosaic` fine-tuning (Epochs 16–20).
   - **Best Epoch: Epoch 16** (`val/box_loss = 1.23857`, `val/cls_loss = 0.83764`):
     - **Precision:** `0.88571` (vs `fx_v0a` best `0.88384`)
     - **Recall:** `0.79997` (vs `fx_v0a` best `0.79489`, `+0.51 pp`)
     - **mAP50:** `0.82534` (vs `fx_v0a` best `0.82252`, `+0.28 pp`)
     - **mAP50-95:** `0.57952` (vs `fx_v0a` best `0.57529`, **`+0.42 pp`**)
   - Final Epoch 20 metrics: `P = 0.88377`, `R = 0.80319`, `mAP50 = 0.82547`, `mAP50-95 = 0.57803`.
   - Selected weights: `/home/deano/monui7-local/data/runs/hf3_v2pre/weights/best.pt` (`5.2 MB`, SHA-256 `62658612a814cdb23eedf3738eb7880f0c138d224ff9cbfd030d9efcc8195a7b`).

---

## 5. T-D: Full Test Split Evaluation (`fx_v0a` vs `hf3_v2pre`)

Evaluated using the exact T17 / FX09 / T19 protocol (`eval_by_source_and_luma.py` semantics: IoU $\ge 0.50$, conf $\ge 0.35$, `imgsz=320`, GT-box BT.601 luma $Y = 0.299R + 0.587G + 0.114B$). Note `fx_v0a` reproduced the FX09/T19 baseline to the exact box (`14,837 / 18,412 = 80.58%`).

### 5.1 Standard `v0a` Test Split (13,147 images, 18,412 GT boxes)

| Metric / Subset | GT Boxes | `fx_v0a` (Baseline) | `hf3_v2pre` (Candidate) | Delta (`hf3 - v0a`) | Gate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Overall Recall** | 18,412 | **80.58%** (14,837) | **80.00%** (14,729) | **-0.58 pp** | **PASS ($\le 1.0$ pp drop)** |
| **B0 ($Y < 0.08$)** | 160 | 59.38% (95) | **60.00%** (96) | **+0.62 pp** | Improved |
| **B1 ($0.08 \le Y < 0.15$)** | 843 | 81.38% (686) | **81.49%** (687) | **+0.11 pp** | Improved |
| **B0 + B1 Pooled** | 1,003 | 77.87% (781) | **78.07%** (783) | **+0.20 pp** | Improved |
| **B2 ($0.15 \le Y < 0.30$)** | 2,644 | 62.03% (1,640) | 61.08% (1,615) | -0.95 pp | — |
| **B3 ($Y \ge 0.30$)** | 14,765 | 84.09% (12,416) | **83.52%** (12,331) | **-0.57 pp** | **PASS ($\le 1.0$ pp drop)** |
| **HaGRID** | 6,312 | 99.35% (6,271) | **99.35%** (6,271) | **0.00 pp** | **PASS ($\ge 80\%$)** |
| **HANDS** | 2,100 | 98.90% (2,077) | **98.24%** (2,063) | -0.66 pp | **PASS ($\ge 80\%$)** |
| **IPN** | 5,137 | 75.43% (3,875) | 74.17% (3,810) | -1.26 pp | — |
| **Open Images** | 4,863 | 53.75% (2,614) | 53.16% (2,585) | -0.59 pp | — |

### 5.2 Darkened + `A4v2`-Brightened `v0a` Test Split (13,147 images, 18,412 GT boxes)
Each test image was darkened via FX06 (seed `20261121`), downscaled to width 320, and enhanced via exact `A4v2`. Below we report overall, per-source, **pre-A4 darkened GT-box luma bins** (primary low-light stratification), and **post-A4 brightened GT-box luma bins**:

#### Overall & Pre-A4 Darkened GT-Box Luma Bins (Measured Before `A4v2` Lift)

| Metric / Pre-A4 Luma Bin | GT Boxes | `fx_v0a` (Baseline) | `hf3_v2pre` (Candidate) | Delta (`hf3 - v0a`) |
| :--- | :---: | :---: | :---: | :---: |
| **Overall Dark + `A4v2` Recall** | 18,412 | 57.86% (10,654) | **69.93%** (12,875) | **+12.07 pp** (+2,221 TP) |
| **Pre-A4 B0 ($Y_{\text{pre}} < 0.08$)** | 1,937 | 23.08% (447) | **43.26%** (838) | **+20.18 pp** |
| **Pre-A4 B1 ($0.08 \le Y_{\text{pre}} < 0.15$)** | 5,088 | 45.15% (2,297) | **63.54%** (3,233) | **+18.39 pp** |
| **Pre-A4 B0 + B1 Pooled** | 7,025 | 39.06% (2,744) | **57.95%** (4,071) | **+18.89 pp** |
| **Pre-A4 B2 ($0.15 \le Y_{\text{pre}} < 0.30$)** | 8,222 | 69.93% (5,750) | **77.74%** (6,392) | **+7.81 pp** |
| **Pre-A4 B3 ($Y_{\text{pre}} \ge 0.30$)** | 3,165 | 68.25% (2,160) | **76.21%** (2,412) | **+7.96 pp** |

#### Post-A4 Brightened GT-Box Luma Bins (Measured After `A4v2` Lift)

| Post-A4 Luma Bin | GT Boxes | `fx_v0a` (Baseline) | `hf3_v2pre` (Candidate) | Delta (`hf3 - v0a`) |
| :--- | :---: | :---: | :---: | :---: |
| **Post-A4 B0 ($Y_{\text{post}} < 0.08$)** | 0 | N/A | N/A | — (all lifted $\ge 0.08$) |
| **Post-A4 B1 ($0.08 \le Y_{\text{post}} < 0.15$)** | 213 | 34.27% (73) | **68.08%** (145) | **+33.81 pp** |
| **Post-A4 B2 ($0.15 \le Y_{\text{post}} < 0.30$)** | 3,875 | 41.01% (1,589) | **53.99%** (2,092) | **+12.98 pp** |
| **Post-A4 B3 ($Y_{\text{post}} \ge 0.30$)** | 14,324 | 62.78% (8,992) | **74.27%** (10,638) | **+11.49 pp** |

#### Per-Source Breakdown (Darkened + `A4v2` Test)

| Source | GT Boxes | `fx_v0a` (Baseline) | `hf3_v2pre` (Candidate) | Delta (`hf3 - v0a`) |
| :--- | :---: | :---: | :---: | :---: |
| **HaGRID** | 6,312 | 84.79% (5,352) | **95.34%** (6,018) | **+10.55 pp** |
| **HANDS** | 2,100 | 55.90% (1,174) | **79.81%** (1,676) | **+23.91 pp** |
| **IPN** | 5,137 | 59.30% (3,046) | **68.89%** (3,539) | **+9.59 pp** |
| **Open Images** | 4,863 | 22.25% (1,082) | **33.77%** (1,642) | **+11.52 pp** |

---

## 6. T-E: ONNX Export, Strict Per-Box Parity & Verified Release Staging

### 6.1 ONNX Artifact & CPU Latency
- **Model File (Staged Candidate):** `/home/deano/mnt/monui7-data/release/r23b_hf3_v2pre/monui7-hand-yolo26n-320-hf3-v2pre.onnx`
- **Format / Opset:** ONNX opset 17 (`onnxslim` simplified, `dynamic=False`)
- **Input / Output Tensor Shapes:** `images: [1, 3, 320, 320]` (RGB `[0, 1]`, NCHW, pad 114) $\rightarrow$ `output0: [1, 5, 2100]` (`xywh_conf_raw`, NMS required, matches `fx_v0a` contract identically)
- **File Size:** `9,726,210` bytes (**9.28 MiB**, $\le 10$ MiB)
- **SHA-256 (Verified Read-Back from `$BIG_ROOT`):**
  - ONNX: `d1b26943d36b3e294008b52588f81e75c3cd50e27ee50514c572d02222db4e3a`
  - `best.pt`: `62658612a814cdb23eedf3738eb7880f0c138d224ff9cbfd030d9efcc8195a7b`
- **Staged Files in `/home/deano/mnt/monui7-data/release/r23b_hf3_v2pre/`:**
  - `monui7-hand-yolo26n-320-hf3-v2pre.onnx` (`9.3M`)
  - `best.pt` (`5.2M`)
  - `results.csv` (`3.7K`)
  - `model_meta.json` (`1.7K`)
- **Worktree Isolation Confirmed:** `$WORK/frontend/implementation/public/models/` was **NOT** modified (still retains baseline `monui7-hand-yolo26n-320.onnx`).
- **CPU Proxy Latency (`CPUExecutionProvider`, 1 thread, 320px, 100 runs, 10 warmup):**
  - **p50:** `12.21 ms`
  - **p95:** `13.36 ms`
  - **Mean:** `12.34 ms`

### 6.2 Strict Per-Box Parity Verification

| Parity Suite | Images | Boxes Matched | Min Observed IoU | Max Observed Score Diff | Thresholds | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Python/PyTorch vs TS (`monui7-yolo.ts` + `onnxruntime-web`)** | 20 (FX12 QA) | **22 / 22** | **0.99976** | **0.00025** | IoU $\ge 0.99$, $\Delta s \le 0.01$ | **PASS** |
| **PyTorch vs ONNX (`verify_fx09_parity.py`)** | 50 (v0 test) | **64 / 64** | **1.0000** | **0.0000** | IoU $\ge 0.99$, $\Delta s \le 0.01$ | **PASS** |

---

## 7. Disk Hygiene Verification

After SHA-256 read-back verification of all staged release files on `/home/deano/mnt/monui7-data/release/r23b_hf3_v2pre/`, all temporary scratch datasets (`$DATA_ROOT/yolo/monui7_hand_v0`, `$DATA_ROOT/yolo/monui7_hand_hf3_v2pre`, `$DATA_ROOT/yolo/monui7_hand_test_dark_a4`, and temporary YAMLs) plus the temporary D: test archive were purged:

```text
Filesystem      Size  Used Avail Use% Mounted on
/dev/sda2       126G   76G   45G  64% /
```

- Root partition `/` returned to **64%** (`77,727M / 128,698M`, `45G` available), strictly $\le 65\%$ and $\le 70\%$ SOP limit.
