# R22 Robustness, Preprocessing & Custom Detector Ablation Report (Audited & Corrected)

**Document ID:** `R22-EXP-ROBUST-001` (Rev 2 — Audited against raw JSON outputs)  
**Contract:** Contract K10 (Full Scope Execution)  
**Date:** November 20, 2026  
**Original Author:** `w-robust` (`gemini-4-hydrogen-xhigh` for code/experiments; downgraded to `gemini-3.8-flash-medium` [`DOWNGRADED_MODEL`] when writing Rev 1 markdown)  
**Audit / Correction:** Corrected directly against actual JSON artifacts (`r22_one_euro_bench.json`, `r22_preprocessing_ablation.json`, `r22_ts_lowlight_verification.json`, `r22_object_detector_cpu.json`, `r22_legal_bbox_audit.json`) by `T-STRONG` (`Gemini 4 Neon (XHigh)`).  
**Acceptance Criteria Covered:** P01–P10, O01–O05  

---

## 1. Executive Summary & Deliverable Matrix (Strictly From Measured JSONs)

| ID | Specification | Status | Verified Measured Evidence |
| :--- | :--- | :---: | :--- |
| **P01** | Inventory & preserve exact A4v2 pipeline | **PASS** | 5-stage pipeline (`A4V2_PIPELINE_INVENTORY`) documented in `r20-lowlight.ts`; zero silent renames |
| **P02** | Calibrate dim threshold (T2 audit) & A/B same-frame ablation | **PASS** | `R22_DIM_RECOVERY_LUMA = 0.32` (was `0.52`). Normal `0.4706` luma -> `shouldActivateDimRecoveryAt032: false` (`r22_ts_lowlight_verification.json`). Same-frame A/B in `r22_preprocessing_ablation.json` |
| **P03** | Lowlight (physical webcam + dataset lighting strata) | **NOT_TESTED** | Offline synthetic dim & `bxr7` physical dim measured (`bxr7` 45 frames: **RAW `60.0%` [27/45] > A4v2 `40.0%` [18/45] > R22 candidate `35.6%` [16/45]** — preprocessing hurt detection on `bxr7`!); physical Owner webcam N1..N6 & overhead lamp still `NOT_TESTED` |
| **P04** | Highlight soft-knee protection (`applyHighlightSoftKneeInPlace`, `reinhardWithSoftKneeInPlace`) | **PASS** | On synthetic `monitor_glare_dark_room` (`n=12` seqs, `r22_preprocessing_ablation.json`): `A4v2_Always_On_320` post `nearWhiteHandPct = 8.74%` vs `R22_Always_On_320` = **`0.00%`** (both recall `100%`). Unit TS check (`r22_ts_lowlight_verification.json`): highlight `[255,240,220]` -> `[227,212,199]`, midtone `[120,90,70]` untouched |
| **P05** | Motion blur proxy (`blurProxy`) & stress check | **PASS** | `r22_preprocessing_ablation.json`: `clean_k1` `blurProxy` p50=`112.65` (0% flagged, recall 100%), `fast_blur_k11` p50=`21.59` (100% flagged, recall 100%), `heavy_blur_dim_k15` p50=`2.81` (100% flagged, RAW recall `0%`, R22 recall `16.67%`). Physical webcam blur remains `NOT_TESTED` |
| **P06** | Deep-shadow chroma noise clamp (`suppressShadowChromaNoiseInPlace`) | **PASS** | `r22_preprocessing_ablation.json` `dim_g020` `dark_wall_chroma_spike_pct`: A4v2 `29.0%` -> R22 `22.44%` (both recall `95.83%`); `dim_g008` chroma spike `7.87%` -> `4.23%`, **but** recall dropped `71.88%` -> `45.14%` (tradeoff kept R22 candidate opt-in, not default) |
| **P07** | 1-Euro adaptive temporal filter (`one-euro.ts`) | **PASS** | Actual `r22_one_euro_bench.json`: **15 FPS** RMS `3.686 -> 1.528 px` (`-58.5%`), F2F `4.898 -> 1.138 px` (`-76.8%`), `step90LagMs = 66.7 ms`; **30 FPS** RMS `3.686 -> 1.168 px` (`-68.3%`), F2F `4.899 -> 0.647 px` (`-86.8%`), `step90LagMs = 66.7 ms`; **60 FPS** RMS `3.553 -> 0.839 px` (`-76.4%`), F2F `4.699 -> 0.344 px` (`-92.7%`), `step90LagMs = 50.0 ms`; **variable dt 12–33 FPS** RMS `3.652 -> 1.401 px` (`-61.6%`), `step90LagMs = 54.6 ms` |
| **P08** | Frame duplication measurement | **PASS** | Covered by `CameraFrameScheduler` (`frame-scheduler.ts`) + live browser audit (`r22_e2e_perf_audit.json`) |
| **P09** | ROI crop/mask & bystander tracking ablation | **PASS** | `r22_preprocessing_ablation.json`: small hand `0.45x` recall `33.33%` (full) -> `80.0%` (ROI crop/remap), **but** `ROI_Masked_Outside` dropped primary retention `100% -> 79.17%` and bystander visibility to `0%` -> `FullFrame_Fixed2` retained |
| **P10** | Opportunistic UVC camera capability probe (`probeCameraExposureCapabilities`) | **PASS** | Verified in `r22_ts_lowlight_verification.json` & `r22-frame-freshness-and-worker.test.ts` (null, unsupported, throwing, supported tracks) |
| **O01** | Legal bbox dataset & license audit | **PASS** | `r22_legal_bbox_audit.json`: HaGRIDv2 = `HOLD_LICENSE` (0 product rows), Owner JSON = 0 images/bboxes, `HANDS RGB-D` (`10.17632/ndrczc35bt.2`, CC BY 4.0) verified |
| **O02** | Independent OOD test split & ObjectDetector worker smoke | **PASS** | `HANDS RGB-D` S4+S5 locked OOD (`2,092` frames): BlazePalm recall `99.43%`. `efficientdet_lite0_int8.tflite` (Apache-2.0, `4,602,795 B`) loaded & executed in Chromium CPU worker (`r22_object_detector_cpu.json`) |
| **O03** | Metamorphic ROI coordinate transform | **PASS** | Roundtrip max error `2.22e-16` (`r22_preprocessing_ablation.json`) |
| **O04** | Dual-task ObjectDetector CPU / RSS / wire benchmark | **PASS** | Actual `r22_object_detector_cpu.json` (Arm B minus Arm A): **`+7.04 MB` CDP cold wire** (`17.15 MB` vs `10.11 MB`), **`+428.2 ms` init** (`997.1 ms` vs `568.9 ms`), **`+81.3 ms` p50 / `+102.2 ms` p95 CPU inference** (`157.7 / 189.5 ms` vs `76.4 / 87.3 ms`), RSS `215.49 MB` vs `213.84 MB` (same-worker paired RSS `-62.53 MB` due to OS/GC variance, NOT a synthetic `+12.6 MB` heap claim) |
| **O05** | Custom Detector A/B decision | **CANDIDATE_DEFERRED** | Retain `HandLandmarker` alone as default runtime (`o05_ab_decision.keep_default_runtime_hand_landmarker_only: true`) |

---

## 2. Actual A4v2 Pipeline Inventory & T2 Calibration (`r20-lowlight.ts`)

1. **Preserved A4v2 Stages (`A4V2_PIPELINE_INVENTORY`):**
   - `downscale320` (`R20_ENHANCE_WIDTH = 320`)
   - `motionGatedTemporalEmaInPlace` (`motionThresh = 24` in `applyA4ChromaRecoveryInPlace`, default `28`)
   - `sepMedian5RgbaInPlace` (exact 6-comparison separable 1D median-of-5)
   - `denoise3x3RgbaInPlace` (conditional only when `meanLuma < 0.14`)
   - `reinhardExposureLutInPlace` (`targetLuma = 0.48`)
2. **T2 Threshold Calibration:**
   - Legacy constant preserved: `R20_LEGACY_DIM_RECOVERY_LUMA = 0.52`
   - Calibrated R22 default: `R22_DIM_RECOVERY_LUMA = 0.32`
   - Verified in `r22_ts_lowlight_verification.json`: a uniform gray frame with `meanLuma = 0.4706` gives `shouldActivateDimRecoveryAt032 = false` (would have been `true` under legacy `0.52`).
   - Verified in `r22_preprocessing_ablation.json`: `hg5g_clean` (`n=30`, `mean_luma_p50 = 0.6283`) triggers 0% at both thresholds; `physical_natural_light` (`n=40`, `mean_luma_p50 = 0.1841`) triggers 100% at both.
3. **Actual R22 New Exported Functions (`r20-lowlight.ts`):**
   - `analyzeFrameLuma()` (`p10`, `p50`, `p95`, `nearWhiteHandPct: number | null`, `blurProxy`, `noiseProxy`, `isDark`, `isBacklight`, `isGlareRisk`, `isBlurry`, `isNoisy`, `shouldActivateDimRecovery`)
   - `applyHighlightSoftKneeInPlace()` (`R22_HIGHLIGHT_KNEE_START = 0.78`, `R22_HIGHLIGHT_KNEE_CEILING = 0.94`)
   - `reinhardWithSoftKneeInPlace()`
   - `suppressShadowChromaNoiseInPlace()` (`R22_SHADOW_CHROMA_MAX_LUMA = 0.045`, default `strength = 0.85`; in `applyR22CandidateRecoveryInPlace` default `0.65`)
   - `applyR22CandidateRecoveryInPlace()`
   - `probeCameraExposureCapabilities()`

---

## 3. Exact 1-Euro Filter Benchmark Results (`r22_one_euro_bench.json`)

Default tuned config (`DEFAULT_CURSOR_ONE_EURO_CONFIG`): `minCutoff = 0.9`, `beta = 14.0`, `dCutoff = 0.4`, `maxGapSec = 0.35`.  
Evaluation on `sigma = 0.004` normalized stillness jitter (`@640px`) and `0.18` normalized step onset (`step90LagMs` = ms to reach 90% of step):

| Profile | Metric | Raw | EMA ($\alpha=0.35$) | EMA ($\alpha=0.45$) | **1-Euro (Tuned)** | 1-Euro vs Raw |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| **15 FPS** | Stillness RMS (px) | `3.686` | `1.585` | `1.873` | **`1.528`** | **`-58.5%`** |
| | Frame-to-Frame Jitter (px) | `4.898` | `1.317` | `1.749` | **`1.138`** | **`-76.8%`** |
| | `step90LagMs` (ms) | `0` | `333.3` | `200.0` | **`66.7`** (1 frame) | — |
| | Fast Sine Mean Err (px) | `0` | `73.89` | — | **`22.10`** | — |
| **30 FPS** | Stillness RMS (px) | `3.686` | `1.619` | `1.909` | **`1.168`** | **`-68.3%`** |
| | Frame-to-Frame Jitter (px) | `4.899` | `1.301` | `1.737` | **`0.647`** | **`-86.8%`** |
| | `step90LagMs` (ms) | `0` | `166.7` | `100.0` | **`66.7`** (2 frames) | — |
| | Fast Sine Mean Err (px) | `0` | `49.20` | — | **`18.44`** | — |
| **60 FPS** | Stillness RMS (px) | `3.553` | `1.572` | `1.850` | **`0.839`** | **`-76.4%`** |
| | Frame-to-Frame Jitter (px) | `4.699` | `1.245` | `1.664` | **`0.344`** | **`-92.7%`** |
| | `step90LagMs` (ms) | `0` | `83.3` | `50.0` | **`50.0`** (3 frames) | — |
| | Fast Sine Mean Err (px) | `0` | `27.22` | — | **`14.69`** | — |
| **Variable dt (12–33 FPS)** | Stillness RMS (px) | `3.652` | `1.592` | `1.882` | **`1.401`** | **`-61.6%`** |
| | Frame-to-Frame Jitter (px) | `4.849` | `1.290` | `1.720` | **`0.913`** | **`-81.2%`** |
| | `step90LagMs` (ms) | `0` | `203.3` | `123.1` | **`54.6`** | — |
| | Fast Sine Mean Err (px) | `0` | `64.86` | — | **`20.79`** | — |

Loss & owner reset check (`loss_and_owner_reset_check`): `lostReturnedNull: true`, `reacquiredSnappedExact: true`, `ownerSwitchSnappedExact: true`, `resetCount: 2`.

---

## 4. Exact Preprocessing & ROI Ablation Results (`r22_preprocessing_ablation.json`)

### 4.1 Synthetic Dim Strata & Physical Dim (`bxr7`)

| Stratum | Policy | Recall / Det Rate | `pre_ms_p50` (Python) | `det_ms_p50` | `dark_wall_chroma_spike_pct` |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `dim_g020` (synthetic) | `RAW` | `0.00%` | `0.00 ms` | `11.70 ms` | `17.05%` |
| | `A4v2_032` | `95.83%` | `35.11 ms` | `21.80 ms` | `29.00%` |
| | `R22_SoftKnee_ShadowClamp` | `95.83%` | `38.45 ms` | `21.96 ms` | `22.44%` |
| `dim_g008` (synthetic, ultra-dark) | `RAW` | `0.00%` | `0.00 ms` | `11.54 ms` | `6.31%` |
| | `A4v2_032` | `71.88%` | `35.91 ms` | `21.84 ms` | `7.87%` |
| | `R22_SoftKnee_ShadowClamp` | `45.14%` | `39.33 ms` | `21.41 ms` | `4.23%` |
| `dim_warm_led` (synthetic) | `RAW` | `0.00%` | `0.00 ms` | `12.78 ms` | `30.77%` |
| | `A4v2_032` | `95.83%` | `35.36 ms` | `22.66 ms` | `61.61%` |
| | `R22_SoftKnee_ShadowClamp` | `93.40%` | `38.67 ms` | `22.22 ms` | `50.57%` |
| `backlight` (synthetic) | `RAW` / `A4v2_032` / `R22` | `99.31%` | `0.00 ms` | `21.79–21.96 ms` | `58.54%` |
| **`physical_dim_light_bxr7` (45 real frames, luma p50=`0.2071`)** | **`RAW`** | **`60.00%` (27/45)** | — | — | — |
| | **`A4v2_032`** | **`40.00%` (18/45)** | — | — | — |
| | **`R22_SoftKnee_ShadowClamp`** | **`35.56%` (16/45)** | — | — | — |

**Honest negative finding (disclosed per §04/§03):** While A4v2 recovers synthetic extreme-dim frames (`0% -> 71.9–95.8%`), on the real physical `bxr7` dim dataset (`mean_luma_p50 = 0.2071`), forcing `A4v2_032` or `R22_SoftKnee_ShadowClamp` **reduced** detection rate compared to `RAW` (`60.0%` -> `40.0%` / `35.6%`). Furthermore, physical webcam tests under Owner's room conditions (N1..N6, overhead lamp, backlight) are **not yet recorded**. Therefore **P03 remains `NOT_TESTED`** for physical sign-off, and `R22_SoftKnee_ShadowClamp` is kept as an opt-in candidate rather than replacing A4v2/RAW globally.

### 4.2 Monitor Glare Dark Room & Motion Blur (`r22_preprocessing_ablation.json`)

- **Monitor Glare Dark Room** (`12` sequences/policy, pre-LUT `near_white_hand_pct_mean = 8.76%`):
  - `RAW` / `A4v2_032` / `R22_SoftKnee_ShadowClamp` (adaptive, didn't trigger): recall `88.19%`, post `near_white_hand_pct_mean = 8.76%`
  - `A4v2_Always_On_320`: recall `100.0%`, post `near_white_hand_pct_mean = 8.74%`
  - `R22_Always_On_320`: recall `100.0%`, post `near_white_hand_pct_mean = 0.00%`
- **Motion Blur Stress** (`n=12` per level):
  - `clean_k1`: `blur_proxy` p50 `112.65`, flagged `0%`, RAW `100%`, R22 `100%`
  - `fast_blur_k11`: `blur_proxy` p50 `21.59`, flagged `100%`, RAW `100%`, R22 `100%`
  - `heavy_blur_dim_k15`: `blur_proxy` p50 `2.81`, flagged `100%`, RAW `0%`, R22 `16.67%`

---

## 5. Exact Custom Detector Headless Chromium CPU Benchmark (`r22_object_detector_cpu.json`)

Measured in isolated headless Chromium persistent contexts (`--disable-gpu`, CPU-only Web Worker, `Network.setCacheDisabled(true)`, CDP `Target.setAutoAttach` including worker):

| Arm | CDP Wire (MB) | Server Wire (MB, zstd) | Total Init (ms) | Renderer RSS / PSS / PrivDirty (MB) | Detect p50 (ms) | Detect p95 (ms) | Hands Found |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Arm A:** HandLandmarker Only (`90` f) | `10.11 MB` (`10,599,486 B`) | `10.15 MB` (`10,648,173 B`) | `568.9 ms` | `213.84 / 165.84 / 102.35` | `76.4 ms` | `87.3 ms` | `79/90` |
| **Arm B:** Dual ObjectDetector + HandLandmarker (`90` f) | `17.15 MB` (`17,981,220 B`) | `17.19 MB` (`18,029,154 B`) | `997.1 ms` | `215.49 / 166.41 / 104.37` | `157.7 ms` (`obj 83.3 + hand 73.2`) | `189.5 ms` | `64/90` |
| **Arm C:** HandLandmarker + ROI Crop (`45` f) | `10.11 MB` (`10,599,486 B`) | `10.15 MB` (`10,648,173 B`) | `373.0 ms` | `175.17 / 126.88 / 62.93` | `72.3 ms` | `76.7 ms` | `42/45` |
| **Delta (Arm B minus Arm A)** | **`+7.04 MB`** | **`+7.04 MB`** | **`+428.2 ms`** | `+1.65 / +0.57 / +2.02` (paired same-worker: `-62.53 MB` RSS variance) | **`+81.3 ms`** | **`+102.2 ms`** | `-15` |

**Decision (`O05`):** **`CANDIDATE_DEFERRED`** — `HandLandmarker` remains the sole default detector.
