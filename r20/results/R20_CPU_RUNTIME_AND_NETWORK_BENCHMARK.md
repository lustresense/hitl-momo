# R20 CPU-Only Browser Runtime, Web Worker & `< 25 MB` Cold Network Benchmark Report

- **Revision:** `R20-01 v0.2.0` (`2026-11-19 WIB`, single-agent execution per §19.1)
- **Machine-Readable Evidence:** [`r20_browser_runtime.json`](r20_browser_runtime.json), [`r20_network_journeys.json`](r20_network_journeys.json), [`r20_lowlight_detector_ablation.json`](r20_lowlight_detector_ablation.json)
- **Candidate Source:** [`r20_hand_landmarker_cpu.ts`](../candidates/r20_hand_landmarker_cpu.ts), [`r20_hand_landmarker.worker.ts`](../candidates/r20_hand_landmarker.worker.ts), [`r20_lowlight_frame_source.ts`](../candidates/r20_lowlight_frame_source.ts), [`r20_model.ts`](../candidates/r20_model.ts), [`browser_harness/harness.ts`](../candidates/browser_harness/harness.ts)
- **Evidence Type:** `BROWSER_SIMULATED_VIDEO` (`r20_sim_cam.y4m`, `510` frames @ `30 FPS`, `640x360`, on `Intel Xeon Silver 4314 CPU @ 2.40GHz` 4-vCPU VM + Playwright Chromium Headless Shell `159.0.8154.6`). `PHYSICAL_WEBCAM = NOT_TESTED`.

---

## 1. Gate `G20-A` — 100% CPU-Only Vision Inference (`PASS` on `SOURCE` + `BROWSER_SIMULATED_VIDEO`)

1. **Zero GPU Delegate Attempted or Active:**
   - `r20_hand_landmarker.worker.ts` and `r20_hand_landmarker_cpu.ts` instantiate `HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetBuffer, delegate: "CPU" }, runningMode: "VIDEO", ... })` unconditionally.
   - `src/camera/face-anchor.ts` on `main@8969502` already uses `baseOptions: { modelAssetPath, delegate: "CPU" }`.
   - `r20_model.ts` executes the `[82 -> 64 -> 32 -> 3]` student classifier in pure TypeScript on CPU (`p50 / p95 = 8.12 / 9.67 µs`).
   - All 4 browser runtime runs recorded `delegate: "CPU"`, `gpuDelegateAttempted: false`, `gpuDelegateActive: false`, `0` console errors, `0` page errors.

---

## 2. Gate `G20-B` — CPU Responsiveness, Anti-Lag & Web Worker vs Main-Thread A/B (`PASS` on `BROWSER_SIMULATED_VIDEO` with `B2 / B3`)

Executed on the same 30-FPS multi-condition simulated camera feed (`r20_sim_cam.y4m`, `510` frames, `640x360`, alternating bright, dim, and backlit `READY <-> PRESS` cycles + `V-Sign / Fist` + Mendeley `dim_light / natural_light` + `N0/N1` distractors):

| Metric / Gate Criterion (`§7`, `§14.3`, `§19.2`) | Target Gate | `A_cpu_main_thread` (`numHands=2` on UI thread) | `B1_cpu_web_worker` (`numHands=2` fixed) | **`B3_cpu_web_worker_dynamic_owner_lock`** (`2-hand acquire -> 1-hand locked`) | **`B2_cpu_web_worker_numHands1`** (`numHands=1` ablation) |
|---|---|---|---|---|---|
| **ML Delegate** | `100% CPU` (`0` GPU) | `CPU` (`PASS`) | `CPU` (`PASS`) | **`CPU` (`PASS`)** | **`CPU` (`PASS`)** |
| **UI Frame Rate (`Mean / p5 / p50`)** | **`>= 30 FPS`** | `15.19 / 13.77 / 15.16 FPS` (**`FAIL`**) | `60.00 / 60.00 / 60.00 FPS` (`PASS`) | **`60.04 / 60.00 / 60.01 FPS` (`PASS`)** | **`59.99 / 60.00 / 60.00 FPS` (`PASS`)** |
| **Detector-Caused Main-Thread LongTasks `>50ms`** | **`0` on worker variant** | `314` in `25 s` (`12.6/s`, **`FAIL`**) | **`0` in `30 s` (`PASS`)** | **`0` in `25 s` (`PASS`)** | **`0` in `25 s` (`PASS`)** |
| **Main-Thread Dispatch Cost (`p50 / p95`)** | Non-blocking UI | `68.5 / 74.9 ms` (blocks UI) | **`0.9 / 1.6 ms`** | **`0.9 / 1.8 ms`** | **`1.0 / 2.0 ms`** |
| **Effective CPU Hand Detector Rate (`effectiveMpFps`)** | **`>= 20 Hz` target** (`15 Hz` floor diagnosis only) | `15.19 Hz` (diagnosis floor only) | `15.59 Hz` (diagnosis floor only) | **`24.70 Hz` (`PASS >= 20 Hz`)** | **`27.62 Hz` (`PASS >= 20 Hz`)** |
| **Detector Inference Latency (`p50 / p95`)** | Low latency | `68.4 / 73.2 ms` | `65.3 / 68.3 ms` | **`32.2 / 67.6 ms`** | **`32.0 / 37.1 ms`** |
| **E2E Frame-to-Classifier Latency (`p50 / p95`)** | **`p95 <= 150 ms`** (simulated frame-to-event) | `68.5 / 74.9 ms` | `66.8 / 70.1 ms` | **`33.6 / 69.3 ms` (`PASS`)** | **`33.6 / 39.2 ms` (`PASS`)** |
| **R20 Student Classifier Latency (`p50 / p95`)** | Sub-millisecond | `0.1 / 0.1 ms` | `0.1 / 0.1 ms` | **`0.1 / 0.2 ms`** | **`0.1 / 0.1 ms`** |
| **Max In-Flight Frames (`maxInFlightObserved`)** | **`1` (latest-frame-wins, no backlog)** | `1` | **`1` (`PASS`)** | **`1` (`PASS`)** | **`1` (`PASS`)** |
| **Fail-Closed Lifecycle (`tab-hidden`, `worker-restart`, `stop`)** | **`0` stuck keys** | `0` stuck (`PASS`) | **`0` stuck (`PASS`)** | **`0` stuck (`PASS`)** | **`0` stuck (`PASS`)** |
| **JS Heap After Run / After Stop** | Bounded memory | `44.99 / 45.01 MB` | `31.69 / 31.49 MB` | **`30.08 / 30.08 MB`** | **`30.51 / 30.51 MB`** |

### Key Technical Takeaway for `G20-B`

- Moving `HandLandmarker` CPU to a dedicated Web Worker (`B1`, `B2`, `B3`) with transferable `320x180` `ImageBitmap` + `OffscreenCanvas` completely eliminates UI thread blocking: **main-thread dispatch time drops `41x` (`74.9 ms -> 1.8 ms`), main-thread LongTasks (>50 ms) drop from `314` (`12.6/s`) to `0`, and UI FPS rises from `15.19 FPS` (`p5 = 13.77 FPS`) to a rock-solid `60.0 FPS` (`p5 = 60.0 FPS`)**.
- On a single-player camera stream, fixed `numHands = 2` (`B1`) runs at `15.59 Hz` because MediaPipe's `VIDEO` mode re-runs the full-frame SSD Palm Detector (`~33 ms`) on every single-hand frame when `tracked_hands (1) < numHands (2)`.
- **`B3_cpu_web_worker_dynamic_owner_lock`** solves this by running `numHands = 2` during initial acquisition and after any tracking loss (preserving 2-hand disambiguation), and switching via `landmarker.setOptions({ numHands: 1 })` once the owner's hand is locked for `>= 2` consecutive frames (with a `jumpDist <= 0.25` spatial continuity guard that immediately triggers fail-closed `RELEASE_ALL` and reverts to `numHands = 2` on any sudden jump). This achieves **`24.70 Hz` effective CPU detection rate (`>= 20 Hz` gate PASS)** with **`60.04 FPS` UI** and **`0` main-thread LongTasks**.

---

## 3. Gate `G20-C` — Cold First-Use Network Transfer `< 25,000,000 B` (`PASS` on Both Journeys)

Measured in fresh, isolated clean browser contexts (`browser.newContext()`, Service Workers blocked, counting 100% of main-thread AND Web Worker assets):

### 3.1 Journey Summary (`r20_network_journeys.json`)

| Journey | Routes + Vision Stack | Cold `B-USER` (`zstd` wire) | Cold `B-USER` (if `.task`/`.tflite` uncompressed) | Hard Limit | Headroom | Duplicate Model Downloads | Warm Refresh #1 / #2 | Status |
|---|---|---:|---:|---:|---:|---:|---|
| **Journey 1 (`NUI Lab Webcam Test`)** | `/nui-lab` -> `/nui-lab/gesture` -> `/nui-lab/canvas` + Web Worker + MediaPipe WASM/Task/BlazeFace + R20 Student | **`9,345,570 B` (`8.91 MiB`)** | `11,320,653 B` (`10.80 MiB`) | `25,000,000 B` | **`+15,654,430 B`** | **`0`** (`CacheStorage` deduplicated) | `0 B / 0 B` | **`PASS`** |
| **Journey 2 (`Student Onboarding -> Canvas -> Gameplay`)** | `/` -> `/onboarding/card` -> `/onboarding/number` -> `/onboarding/cam` -> `/levels` -> `/canvas1` -> `/level1` + full Vision stack | **`9,432,085 B` (`9.00 MiB`)** | `11,407,168 B` (`10.88 MiB`) | `25,000,000 B` | **`+15,567,915 B`** | **`0`** (`CacheStorage` deduplicated) | `0 B / 0 B` | **`PASS`** |

### 3.2 Top Wire Assets Breakdown (Journey 2 Cold First-Use)

| Asset Path | Content-Encoding | Raw Decoded Bytes | Wire Bytes (`B-USER`) | Requests | Purpose |
|---|---|---:|---:|---:|---|
| `/models/hand_landmarker.task` | `zstd` (`none` fallback: `7,819,285 B`) | `7,819,105 B` | `5,853,967 B` | `1` | MediaPipe Palm Detector + 21-Keypoint Hand Landmark Bundle |
| `/mediapipe/wasm/vision_wasm_internal.wasm` | `zstd` | `8,926,619 B` | `2,723,391 B` | `1` | MediaPipe XNNPACK CPU WASM Runtime |
| `/mediapipe/blaze_face_short_range.tflite` | `zstd` (`none` fallback: `229,926 B`) | `229,746 B` | `218,167 B` | `1` | MediaPipe BlazeFace Short-Range CPU Model |
| `/_next/static/chunks/472-75217ee4e78b0ed8.js` | `zstd` | `327,892 B` | `98,442 B` | `1` | Gameplay / Kaplay engine chunk |
| `/r20-harness/harness.bundle.js` | `zstd` | `296,431 B` | `74,565 B` | `1` | R20 diagnostic harness bundle |
| `/_next/static/chunks/fd9d1056-52b97c009c25bc25.js` | `zstd` | `172,580 B` | `55,927 B` | `1` | React framework chunk |
| `/mediapipe/wasm/vision_wasm_internal.js` | `zstd` | `223,541 B` | `55,155 B` | `1` | MediaPipe WASM JS loader |
| `/r20-harness/r20_worker.bundle.js` | `zstd` | `208,772 B` | `52,141 B` | `1` | R20 Dedicated CPU Web Worker bundle |
| `/r20-harness/r20_winner_model.json` | `zstd` | **`73,275 B`** | **`29,088 B`** | `1` | **R20 `C4_Full_Focal` `[82->64->32->3]` Student Weights** (`-38.5%` vs R19 `47,193 B`) |
