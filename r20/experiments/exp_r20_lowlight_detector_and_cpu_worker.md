# Experiment Report — R20 Low-Light Detector Preprocessing (`H20-03`), CPU Web Worker (`H20-04`), & `< 25 MB` Cold Network (`H20-05`)

- **Experiment ID:** `EXP-R20-P3-LOWLIGHT-CPU-WORKER-NET`
- **Date:** `2026-11-19 WIB`
- **Environment:** `Intel(R) Xeon(R) Silver 4314 CPU @ 2.40GHz` (`4` vCPU VM), Playwright Chromium Headless Shell `159.0.8154.6`, MediaPipe `@mediapipe/tasks-vision@0.10.14` (`XNNPACK` WASM CPU delegate).
- **Evidence Type:** `OFFLINE_DATASET` (`6,276` paired frames across 12 photometric conditions) + `BROWSER_SIMULATED_VIDEO` (`r20_sim_cam.y4m`, `510` frames @ `30 FPS`, `640x360`, 4 variants + 2 cold network journeys). `PHYSICAL_WEBCAM = NOT_TESTED`.

---

## 1. Paired Low-Light Detector Preprocessing Ablation (`H20-03`, `§6`, `§13.1`)

We evaluated the frozen MediaPipe `HandLandmarker` (`MIN_DET_CONF = 0.60`, `MIN_PRES_CONF = 0.45`) on `523` HandGesture-5G TRAIN images (`173 L-Sign`, `200 Pointing Up`, `150` stratified `OTHER`) across **12 deterministic photometric/geometric strata** (`6,276` frames total), comparing:
- **`L0 / A0_raw`**: Native RAW resolution (`720p`), `0 ms` preprocessing.
- **`L2 / A1_raw320`**: Downscaled `320 px` RAW (isolates downscale effect from histogram enhancement).
- **`L1 / A2_clahe320`**: Existing `320 px` `8x8` CLAHE (`clipLimit = 2.0`).
- **`L3_clahe480`**: `480 px` `8x8` CLAHE (`clipLimit = 2.0`).
- **`L4 / A3_gamma_denoise_clahe320`**: Candidate luma-aware `3x3` Gaussian/box denoise (active when `mean_luma < 0.22` to suppress Poisson/read noise before local contrast stretch, per MDPI 2026 cited in `§13.1`) + noise-floor soft clamp + moderated CLAHE (`clipLimit = 1.6` when `mean_luma < 0.14`, else `2.0`) + adaptive gamma LUT (`γ = 0.72..0.85`).
- **`A4_adaptive_fallback` (`r20_lowlight_frame_source.ts`)**: Runs `A0_raw` while hand tracking succeeds; on a detector miss (`consecutiveMisses >= 1`) when `mean_luma < 0.36` or `backlightCandidate`, probes `A3_gamma_denoise_clahe320` on the next detection frame.

### 1.1 Per-Stratum Paired Detection Recall (`n = 523` images per stratum, `6,276` frames)

| Photometric Stratum | Mean Luma | `L0 / A0` RAW Recall | `L1 / A2` CLAHE 320 Recall | `L4 / A3` Gamma+Denoise+CLAHE 320 Recall | `A4` Adaptive Fallback (`L0 -> A3` on miss) | `A4` Gain over `L0` RAW | Detector Miss (`All Modes`) |
|---|---:|---:|---:|---:|---:|---:|---:|
| **`raw` (unmodified)** | `0.6218` | **`71.89%`** | `44.55%` (`-27.34 pp`) | `45.70%` | **`72.08%`** | `+0.19 pp` | `146 / 523` |
| **`flip` (horizontal mirror)** | `0.6217` | **`71.32%`** | `44.74%` (`-26.58 pp`) | `47.61%` | **`73.04%`** | **`+1.72 pp`** | `141 / 523` |
| **`backlight` (dark subject, bright border)** | `0.6346` | `64.24%` | `41.49%` | `44.55%` | **`65.97%`** | **`+1.73 pp`** | `178 / 523` |
| **`jpeg_q25` (compression artifacts)** | `0.6220` | `63.67%` | `33.08%` | `34.80%` | **`64.63%`** | **`+0.96 pp`** | `185 / 523` |
| **`blur_dim` (9px motion blur + gain 0.30)** | `0.3586` | `61.76%` | `37.48%` | `37.67%` | **`62.52%`** | **`+0.76 pp`** | `196 / 523` |
| **`scale_x048_dim` (far/small hand 0.48x in dim room)** | `0.3616` | `30.98%` | `34.23%` | `34.42%` | **`39.20%`** | **`+8.22 pp`** (`+26.5%` rel) | `318 / 523` |
| **`dim_g045` (linear gain 0.45 + Poisson/read noise)** | `0.4316` | `30.21%` | `26.77%` | `27.72%` | **`34.23%`** | **`+4.02 pp`** (`+13.3%` rel) | `344 / 523` |
| **`dim_g020` (linear gain 0.20 + Poisson/read noise)** | `0.2975` | `5.54%` | `7.65%` | `6.69%` | **`8.22%`** | **`+2.68 pp`** (`+48.4%` rel) | `480 / 523` |
| **`flip_dim_g020` (dorsal/mirror + linear gain 0.20)** | `0.2974` | `5.16%` | `6.69%` | `6.31%` | **`6.69%`** | **`+1.53 pp`** (`+29.7%` rel) | `488 / 523` |
| **`dim_cool_mon` (monitor-only cool cast, gain 0.15)** | `0.2526` | `4.02%` | `4.59%` | `4.02%` | **`5.16%`** | **`+1.14 pp`** (`+28.4%` rel) | `496 / 523` |
| **`dim_warm_led` (warm LED cast, gain 0.18)** | `0.2826` | `3.44%` | `3.63%` | `3.82%` | **`4.40%`** | **`+0.96 pp`** (`+27.9%` rel) | `500 / 523` |
| **`dim_g008` (near-black, linear gain 0.08)** | `0.1937` | `0.00%` | `0.57%` | **`2.10%`** | **`2.10%`** | **`+2.10 pp`** (`3.7x` vs `L1`) | `512 / 523` |

### 1.2 Verdict on `H20-03`

1. **Permanent `CLAHE 320` (`A2`) or `CLAHE 480` (`L3`) is rejected as a default:** On normal/bright frames (`raw`), permanent `320 px` CLAHE drops MediaPipe detection recall from `71.89% -> 44.55%` (`-27.34 pp`), and `L3_clahe480` takes `p95 = 41.08 ms` (`+8.58 ms` slower than `320 px`) without improving recall (`2.50%` vs `2.64%` on the 6-mode subset).
2. **`A3` (`gamma_denoise_clahe320`) outperforms raw `CLAHE 320` (`A2`) in near-black scenes (`dim_g008`: `2.10%` vs `0.57%`) and normal scenes (`45.70%` vs `44.55%`)** by suppressing Poisson/read noise with a `3x3` blur before local histogram stretching.
3. **`A4 Adaptive Fallback` (`r20_lowlight_frame_source.ts`, keeping `A0 RAW` while tracking succeeds and probing `A3` on detector miss in dim/backlit lighting) achieves the best recall on every single stratum**, boosting far/small dim-hand detection by **`+8.22 pp` (`30.98% -> 39.20%`)**, moderate dim by **`+4.02 pp` (`30.21% -> 34.23%`)**, and low dim (`gain=0.20`) by **`+2.68 pp` (`+48.4%` relative)**.

---

## 2. CPU-Only Main-Thread vs Dedicated Web Worker Benchmark (`H20-04`, `G20-A`, `G20-B`)

All 4 variants were executed on the exact same `30 FPS` multi-condition simulated camera stream (`r20_sim_cam.y4m`, `510` frames, `640x360`, alternating bright, dim, backlit `READY <-> PRESS` cycles + `V-Sign / Fist` + Mendeley `dim_light / natural_light` + `N0/N1` distractors) in Chromium Headless Shell with **`delegate: "CPU"` (`gpuDelegateAttempted: false`, `gpuDelegateActive: false`)**:

| Variant | Execution Mode & `numHands` Policy | Delegate (`GPU Active?`) | Effective Detector Rate (`mpFps`) | UI Frame Rate (`Mean / p5 / p50`) | Main-Thread Dispatch (`p50 / p95`) | Detector Latency (`p50 / p95`) | Main-Thread LongTasks `>50ms` | R20 Classifier (`p50 / p95`) | Stuck Keys / Clean Stop |
|---|---|---|---:|---|---:|---:|---:|---:|---|
| **`A_cpu_main_thread`** | Synchronous `detectForVideo` on UI thread (`numHands=2`) | `CPU` (`false`) | `15.19 Hz` | **`15.19 / 13.77 / 15.16 FPS` (FAIL `<30`)** | `68.5 / 74.9 ms` | `68.4 / 73.2 ms` | **`314` in 25 s (`12.6/s`, FAIL)** | `0.1 / 0.1 ms` | `0` / `true` |
| **`B1_cpu_web_worker_numHands2`** | Web Worker + transferable `ImageBitmap` (`numHands=2` fixed) | `CPU` (`false`) | `15.59 Hz` | **`60.00 / 60.00 / 60.00 FPS` (PASS)** | **`0.9 / 1.6 ms`** | `65.3 / 68.3 ms` | **`0` in 30 s (PASS)** | `0.1 / 0.1 ms` | `0` / `true` |
| **`B2_cpu_web_worker_numHands1`** | Web Worker + transferable `ImageBitmap` (`numHands=1` ablation) | `CPU` (`false`) | **`27.62 Hz` (PASS `>=20 Hz`)** | **`59.99 / 60.00 / 60.00 FPS` (PASS)** | **`1.0 / 2.0 ms`** | **`32.0 / 37.1 ms`** | **`0` in 25 s (PASS)** | `0.1 / 0.1 ms` | `0` / `true` |
| **`B3_cpu_web_worker_dynamic_owner_lock`** | Web Worker (`numHands=2` on acquire/loss -> `numHands=1` while locked w/ `jumpDist<=0.25` guard) | `CPU` (`false`) | **`24.70 Hz` (PASS `>=20 Hz`)** | **`60.04 / 60.00 / 60.01 FPS` (PASS)** | **`0.9 / 1.8 ms`** | **`32.2 / 67.6 ms`** | **`0` in 25 s (PASS)** | `0.1 / 0.2 ms` | `0` / `true` |

### Root-Cause Analysis of `numHands=2` (`15.59 Hz`) vs `B3 Dynamic Owner-Lock` (`24.70 Hz`) & `B2 numHands=1` (`27.62 Hz`)

1. **Why fixed `numHands=2` (`B1`) runs at `15.59 Hz` (`detP50 = 65.3 ms`) on single-hand frames:**
   In MediaPipe `HandLandmarker` (`runningMode: "VIDEO"`), temporal ROI tracking skips the heavy full-frame SSD Palm Detector (`~33 ms` on single-core XNNPACK WASM) **only when `tracked_hands >= numHands`**. When `numHands = 2` is permanently set and a single player (`1` hand) is playing, `tracked_hands (1) < numHands (2)` on every frame — forcing MediaPipe to run the full-frame SSD Palm Detector (`~33 ms`) + the 21-landmark regression model (`~32 ms`) = **`65.3 ms` (`15.59 Hz`)** on every single frame!
2. **How `B3_cpu_web_worker_dynamic_owner_lock` (`24.70 Hz`) solves this without sacrificing multi-hand acquisition or bystander safety:**
   - While unlocked or re-acquiring, `B3` runs with `numHands = 2` so all visible hands are detected and disambiguated.
   - Once the owner's hand is locked for `>= 2` consecutive frames, the worker calls `landmarker.setOptions({ numHands: 1 })`, allowing MediaPipe `VIDEO` mode to track the locked owner hand's ROI crop at **`detP50 = 32.2 ms` (`24.70 Hz` overall including no-hand distractor segments; `27.62 Hz` during continuous hand tracking!)**.
   - On every frame in `numHands = 1` mode, the worker checks palm-center spatial continuity (`jumpDist <= 0.25`). If the hand is lost or jumps spatially (`> 0.25`), the worker immediately rejects the frame (`RELEASE_ALL`) and switches back to `numHands = 2`.

---

## 3. Cold First-Use Network Transfer (`H20-05`, `G20-C`, `< 25,000,000 B`)

Measured in two separate, fresh clean browser profiles (`browser.newContext()`, Service Workers blocked, counting 100% of main-thread AND Web Worker HTTP responses):

| Journey | Routes Visited + Vision Stack | Cold `B-USER` (`zstd` wire) | Cold `B-USER` (uncompressed `.task`/`.tflite`) | Hard Limit | Headroom (`zstd`) | Unique / Total Requests | Warm Refresh #1 / #2 | Gate `G20-C` |
|---|---|---:|---:|---:|---:|---|---:|---|
| **Journey 1: NUI Lab Webcam Test** | `/nui-lab` -> `/nui-lab/gesture` -> `/nui-lab/canvas` + Web Worker (`vision_wasm_internal.wasm`, `hand_landmarker.task`, `blaze_face_short_range.tflite`, `r20_model_c4_full_mlp.json`) | **`9,345,570 B` (`8.91 MiB`)** | **`11,320,653 B` (`10.80 MiB`)** | `< 25,000,000 B` | **`+15,654,430 B` (`62.6%` under budget)** | `29` unique / `30` total (`0` duplicate model downloads) | `0 B` / `0 B` (100% cached) | **`PASS`** |
| **Journey 2: Student Onboarding -> Canvas -> Gameplay** | `/` -> `/onboarding/card` -> `/onboarding/number` -> `/onboarding/cam` -> `/levels` -> `/canvas1` -> `/level1` + full MediaPipe WASM/Task/BlazeFace/R20 stack | **`9,432,085 B` (`9.00 MiB`)** | **`11,407,168 B` (`10.88 MiB`)** | `< 25,000,000 B` | **`+15,567,915 B` (`62.3%` under budget)** | `37` unique / `38` total (`0` duplicate model downloads via `CacheStorage` deduplication) | `0 B` / `0 B` (100% cached) | **`PASS`** |
