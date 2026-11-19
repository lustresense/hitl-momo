# R20-FIX Audit Correction Report — Sequential Low-Light A4v2, True CDP Network (Page + Worker), & 90s CPU Worker Ownership Audit

- **Date:** 2026-11-19 WIB
- **Branch:** `research-can` (baseline `a458c1871568246f4db228024c4e77e0178cae26`, product baseline `main@8969502df4e106d8428055c2ca6f80f4f59250ee`)
- **Execution Mode:** Single main Agy agent (0 subagents, 0 swarm/delegation per §19.1)
- **Evidence Scope:** `OFFLINE_DATASET` / `SYNTHETIC` / `BROWSER_SIMULATED_VIDEO` (`--disable-gpu`, CPU-only). **`PHYSICAL_WEBCAM = NOT_TESTED`** (R20 retains `[WIP]`).

---

## Executive Summary of Audit Corrections (P0.1–P0.4)

| Audit Item | Prior Defect Found | Correction Applied & Measured Outcome | Honest Gate Status |
|---|---|---|---|
| **P0.1 Adaptive Low-Light A4** | `augment_hg5g.py` reported `union_ok` (3-call stateless oracle upper bound) as adaptive recall; old shipped `P3_shipped_alt` actually achieved only `34.24%` vs `P0_raw = 34.23%` (`+0.01 pp`), and `dim_g008 = 2.10%` was falsely treated as acceptable. | Separated `oracle_union_recall_upper_bound` (`31.87%`) from sequential stateful VIDEO-mode policies (`10,080` frames across `420` ref-detectable sequences). Root-caused additive CLAHE chroma washout + sRGB noise amplification and replaced it with **A4v2** (`applyA4ChromaRecoveryInPlace`: motion-gated EMA + separable 1D median-of-5 + chroma-preserving Reinhard LUT). Sequential VIDEO-mode recall jumped **`34.23% -> 85.42%`** (`1.000` detector calls/frame, `0.000` recovery call overhead; `dim_g008` near-black **`0.0% -> 85.6%`**). Detector-vs-classifier separation proved `DETECTOR_MISS` fell **`65.36% -> 11.79%`** while `C4/C7` conditional accuracy stayed **`98.34%`** with **`0` false press**. | **`PASS` on synthetic sequential VIDEO; `PHYSICAL_WEBCAM = NOT_TESTED`** |
| **P0.2 True CDP Network `< 25 MB`** | `run_r20_browser_harness.mjs` estimated `coldTotalBUserBytes` from local server logs + hardcoded 180-byte header constant and did not verify real `deploy/Caddyfile` compression rules against unmodified `main` student journeys. | Replaced with true CDP `Network.loadingFinished.encodedDataLength` on **both Page and Web Worker** targets (`Target.setAutoAttach`), reconciled directly against exact HTTP socket `bytesWritten` across 3 deployment profiles (`caddy_default_zstd_gzip`, `gzip_standard`, `uncompressed_dev`). **Journey 1 (R20 NUI Lab static export, CacheStorage dedup):** **`10,966,014 B` (`10.46 MiB` CDP; server `10,971,923 B`)** under `caddy_default_zstd_gzip` (**PASS `< 25 MB`**). **Journey 2A (Unmodified Student `main` SPA):** **`26,801,677 B` (`25.56 MiB` CDP == server, `delta = 0 B`)** — **FAIL `< 25 MB`** because unmodified `src/camera/hand-landmarker.ts` fetches `/models/hand_landmarker.task` `3×` (`23.46 MB`). | **Journey 1 NUI Lab: `PASS` (`10.46 MiB` zstd / `10.59 MiB` gzip); Unmodified Student `main` J2: `FAIL` (`25.56 MiB`)** |
| **P0.3 Runtime, Ownership & 90s Long Session** | Previous `B3` worker only checked large jumps (`<= 0.25`) while locked at `numHands=1` (vulnerable to close-range bystander takeover) and ran only 25–30s. | Added **`WorkerOwnerGuard`** (`jump <= 0.18`, size ratio `<= 1.6`, close-range handedness verification `>= 0.78`, periodic 2-hand bystander audit every `45` frames, `30`-frame bystander cooldown). Audited over **90.07s continuous CPU-only (`--disable-gpu`)**: `60.00 FPS` UI (`p5 = 60.00`), `0` LongTasks, `heapGrowth = +0.86 MB`, `0` stuck keys across `tab-hidden`/`worker-restart`/`stop()`, `e2e p95 = 105.2 ms <= 150 ms`. **Measured tradeoff:** MediaPipe WASM `setOptions({ numHands })` costs `26.8 ms p50 / 34.0 ms p95`; under frequent hard scene cuts (`r20_sim_cam.y4m`), `232` `setOptions` calls reduced `B3v2` throughput to **`15.11 Hz`** (vs `B1` fixed `numHands=2` `13.78 Hz`, `B2` `numHands=1` **`24.25 Hz`**, and NUI Lab steady single-hand **`26 Hz`**). | **UI/Lag/Safety/Leak: `PASS`; Throughput: `26 Hz` steady / `24.25 Hz` B2 `PASS`, `15.11 Hz` under synthetic hard-cut stress (`setOptions` cost); `PHYSICAL_WEBCAM = NOT_TESTED`** |
| **P0.4 GPU Training & Comparators** | Dual-GPU training unnecessary if single RTX A5000 suffices; avoid blind retraining without root-cause evidence. | Kept 1× RTX A5000 as default; retained **`C0 (R19)`**, **`C4 (R20)`**, and **`C7 (R20 distilled)`** as pinned SHA-256 comparators. Detector-vs-classifier separation proved `98.34%` conditional accuracy (`0` false press) — no retraining needed until physical night webcam error logs show classifier root cause. | **`PASS` (no wasteful retraining; comparators preserved)** |

---

## 1. P0.1 — Sequential Low-Light Evaluation Fix & A4v2 Chroma-Preserving Recovery

### 1.1 Exposing the `union_ok` Oracle Bug & Additive CLAHE Root Cause
- Fixed [`r20/scripts/augment_hg5g.py`](../scripts/augment_hg5g.py) to rename `adaptive_union_recall` -> `oracle_union_recall_upper_bound` with an explicit audit disclaimer.
- Built [`r20/scripts/eval_a4_sequential.py`](../scripts/eval_a4_sequential.py) and [`r20/scripts/eval_a4v2_sequential.py`](../scripts/eval_a4v2_sequential.py): `576` sequences (`48` held-out stills × `12` degradations, `420` reference-detectable = `10,080` sequential VIDEO frames at 30 FPS with fresh per-frame linear-light sensor shot+read noise and mild hand drift).
- **Root cause discovered:**
  1. Old `L1 CLAHE` / `A3` added luma deltas additively (`R/G/B += mappedLuma - luma`), which desaturated dark skin tones toward neutral gray and collapsed MediaPipe's palm SSD CNN (`P1_clahe_always = 8.21%`, `P2_a3_always = 9.73%`).
  2. Old shipped `P3_shipped_alt` (alternating RAW/A3 on miss) only reached `34.24%` vs `P0_raw = 34.23%` (`+0.01 pp`), and `P4_a4s_sameframe` burned `1.461` detector calls/frame for only `34.63%`.
  3. Linear-light shot+read noise amplified by sRGB gamma overwhelmed the palm detector on `dim_g020`, `dim_g008`, `dim_warm_led`, and `dim_cool_mon` (`0.0%` raw recall).

### 1.2 A4v2 Solution (`applyA4ChromaRecoveryInPlace`)
Implemented in [`r20/candidates/r20_lowlight_frame_source.ts`](../candidates/r20_lowlight_frame_source.ts) and mirrored identically in NUI Lab (`bench/r20-lowlight.ts`):
1. **Adaptive gate:** Only triggers after `A0_raw` misses when `meanLuma < 0.52 || isBacklight` (bright scenes pay `0 ms` preprocess cost and keep `100.0%` raw recall).
2. **Motion-gated temporal EMA** (`3/8 curr + 5/8 prev` per channel when per-pixel L1 diff `<= 28`, snap to `curr` on motion -> suppresses sensor read noise with zero hand ghosting).
3. **Exact separable 1D median-of-5** (`sepMedian5RgbaInPlace`, 6-comparison branchless network, horizontal + vertical -> suppresses impulse shot noise while preserving finger edges) plus mild 3×3 denoise in near-black (`meanLuma < 0.14`).
4. **Chroma-preserving multiplicative Reinhard exposure LUT** (`gain = k / (1 + (k - 1) * y)` applied multiplicatively to R/G/B -> lifts shadow exposure cleanly while preserving skin chrominance ratios!).

### 1.3 Sequential VIDEO-Mode Results (`r20_a4_sequential_audit.json`, `10,080` frames)

| Policy | Overall Recall | `dim_g045` | `dim_g020` | `dim_g008` (Near-Black) | `dim_warm_led` | `dim_cool_mon` | `blur_dim` | `scale_x048_dim` | `raw` (Bright) | Det Calls / Frame | Recovery Call Overhead |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| *Oracle Union (3-call stateless upper bound, NOT runtime)* | *31.87%* | *5.2%* | *0.0%* | *0.0%* | *0.0%* | *0.0%* | *46.3%* | *28.5%* | *99.6%* | *3.000* | *+2.000* |
| `P0_raw` (no preprocess) | 34.23% | 12.1% | 0.0% | 0.0% | 0.0% | 0.0% | 55.6% | 12.1% | 100.0% | 1.000 | +0.000 |
| `P1_clahe_always` (old additive CLAHE) | 8.21% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 1.7% | 43.9% | 19.8% | 1.000 | +0.000 |
| `P2_a3_always` (old A3) | 9.73% | 0.0% | 0.0% | 0.0% | 0.0% | 0.0% | 1.7% | 46.7% | 25.8% | 1.000 | +0.000 |
| `P3_shipped_alt` (old R20 A4) | 34.24% | 12.1% | 0.0% | 0.0% | 0.0% | 0.0% | 52.5% | 15.4% | 100.0% | 1.000 | +0.000 |
| `P4_a4s_sameframe` (old A4 2-call) | 34.63% | 12.1% | 0.0% | 0.0% | 0.0% | 0.0% | 55.6% | 17.0% | 100.0% | 1.461 | +0.461 |
| **`P7_a4v2_chroma_singlecall` (NEW SHIPPED)** | **85.42%** | **96.1%** | **95.8%** | **85.6%** | **95.8%** | **94.6%** | **97.6%** | **89.3%** | **100.0%** | **1.000** | **+0.000** |
| `P8_a4v2_chroma_sameframe` (2-call fallback) | 87.24% | 100.0% | 99.3% | 86.3% | 98.8% | 96.8% | 100.0% | 93.9% | 100.0% | 1.045 | +0.045 |

*Notes:* (a) `flip` (`40.1%`) and `flip_dim_g020` (`39.3%`, 98% of ceiling) were capped because the reference center matcher used unmirrored coordinates; (b) `preprocess_ms` in `r20_a4_sequential_audit.json` (`25.9 ms` Python/NumPy) reflects unoptimized Python loops, whereas real browser JS TypedArray A4v2 at `320×180` measured **`p50 = 4.5 ms / p95 = 8.5 ms`** in headless Chromium (`r20_fix_runtime_and_nuilab_e2e.json`); (c) sequences are synthetic perturbations of still images, NOT physical webcam footage.

### 1.4 Detector Failure vs Classifier Failure Separation (`r20_a4_detector_vs_classifier.json`, `2,520` frames)

| Model | Policy | Total Frames | `DETECTOR_MISS` | Detected Frames | Conditional Classifier Acc | Classifier Errors | False `PRESS` on Non-Press | End-to-End Correct Rate |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `C0 (R19)` | `P0_raw` | 2,520 | 1,647 (65.36%) | 873 | 98.28% | 15 | 0 | 34.05% |
| `C0 (R19)` | **`P7_a4v2`** | 2,520 | **297 (11.79%)** | **2,223** | 98.11% | 42 | **0** | **86.55%** |
| `C4 (R20)` | `P0_raw` | 2,520 | 1,647 (65.36%) | 873 | 98.63% | 12 | 0 | 34.17% |
| `C4 (R20)` | **`P7_a4v2`** | 2,520 | **297 (11.79%)** | **2,223** | **98.34%** | 37 | **0** | **86.75%** |
| `C7 (R20 Distilled)` | `P0_raw` | 2,520 | 1,647 (65.36%) | 873 | 98.63% | 12 | 0 | 34.17% |
| `C7 (R20 Distilled)` | **`P7_a4v2`** | 2,520 | **297 (11.79%)** | **2,223** | **98.34%** | 37 | **0** | **86.75%** |

**Takeaway:** Low-light failure was overwhelmingly a **detector/preprocessing** bottleneck (`65.36%` miss), NOT a classifier bottleneck. Fixing preprocessing cut misses to `11.79%` and lifted end-to-end accuracy `+52.58 pp` (`34.17% -> 86.75%`) with **zero false PRESS**.

---

## 2. P0.2 — True CDP Network Transfer (Page + Web Worker) & Compression Audit

Measured by [`r20/scripts/run_r20_fix_browser_audit.mjs`](../scripts/run_r20_fix_browser_audit.mjs) (`--mode=network`, output [`r20_fix_network_cdp_audit.json`](r20_fix_network_cdp_audit.json)) against the real Next.js static export (`main-r19/frontend/implementation/out`), capturing CDP `Network.loadingFinished.encodedDataLength` from **both Page and Web Worker targets** (`Target.setAutoAttach`) reconciled against actual Node HTTP socket `bytesWritten`. Note: `deploy/Caddyfile` uses `encode zstd gzip`, which compresses `.html/.js/.css/.json/.wasm/.svg` but leaves binary `application/octet-stream` (`.task` and `.tflite`) **uncompressed**.

| Compression Profile | Journey | CDP Total (Page + Worker) | CDP Page | CDP Worker | Server Socket Wire | Delta (`CDP - Server`) | `< 25,000,000 B` Gate |
|---|---|---:|---:|---:|---:|---:|---|
| **`caddy_default_zstd_gzip`** (`deploy/Caddyfile`) | **J1: Real NUI Lab** (`/nui-lab` -> `/gesture` -> `/canvas`, R20 C4 + Worker + CacheStorage) | **10,966,014 B (10.46 MiB)** | 326,346 B | 10,639,668 B | 10,971,923 B | -5,909 B | **PASS** (+14.03 MB headroom) |
| **`caddy_default_zstd_gzip`** | **J2A: Unmodified Student SPA** (`/` -> onboarding -> `/canvas1` -> `/level1`) | **26,801,677 B (25.56 MiB)** | 26,801,677 B | 0 B | 26,801,677 B | **0 B** | **FAIL** (+1.80 MB over) |
| **`caddy_default_zstd_gzip`** | J2B: Unmodified Student Hard Reloads | 26,615,335 B (25.38 MiB) | 26,615,335 B | 0 B | 34,434,668 B | -7,819,333 B | **FAIL** |
| **`gzip_standard`** | **J1: Real NUI Lab** | **11,102,853 B (10.59 MiB)** | 309,781 B | 10,793,072 B | 11,108,284 B | -5,431 B | **PASS** (+13.90 MB headroom) |
| **`gzip_standard`** | **J2A: Unmodified Student SPA** | **26,941,497 B (25.69 MiB)** | 26,941,497 B | 0 B | 26,941,497 B | **0 B** | **FAIL** |
| `uncompressed_dev` | J1: Real NUI Lab (2 worker boots) | 28,022,116 B (26.72 MiB) | 1,009,017 B | 27,013,099 B | 28,037,811 B | -15,695 B | **FAIL** (uncompressed 9.42 MB WASM misses headless disk cache on 2nd boot) |
| `uncompressed_dev` | J2A: Unmodified Student SPA | 62,642,900 B (59.74 MiB) | 62,642,900 B | 0 B | 62,642,900 B | **0 B** | **FAIL** |

### Breakdown of Assets Included (CDP, `caddy_default_zstd_gzip`)
- **Journey 1 (R20 NUI Lab — `10,966,014 B`):** `mediapipe_hand_model` (`/models/hand_landmarker.task` ×1 via `CacheStorage` dedup) = `7,819,333 B`, `wasm` (`vision_wasm_internal.wasm` zstd ×1 + 1 cache hit) = `2,723,455 B`, `app_js` (Next.js + worker chunk + `vision_wasm_internal.js`) = `356,404 B`, `student_model` (`r20-c4-model.json` zstd) = `29,165 B`, `css` = `29,095 B`, `html` = `5,128 B`, `other` (RSC `.txt`) = `3,434 B`, `fonts` = `0 B` (system fonts only).
- **Journey 2A (Unmodified Student `main` — `26,801,677 B` — REAL PRODUCTION BUG EXPOSED):** `mediapipe_hand_model` = **`23,457,999 B` (`3×` full fetches of `hand_landmarker.task`!)**, `wasm` = `2,723,455 B` (1 fetch + 3 cache hits), `app_js` = `346,269 B`, `mediapipe_face_model` (`blaze_face_short_range.tflite`) = `229,973 B`, `css` = `37,298 B`, `html` = `6,683 B`.
  - **Root cause:** Unmodified `main` `src/camera/hand-landmarker.ts` passes `modelAssetPath: "/models/hand_landmarker.task"` directly without `CacheStorage` buffer caching, causing Chromium to re-fetch the 7.82 MB binary on `/onboarding/cam`, `/canvas1`, and `/level1`.
  - **Scope compliance:** `src/camera/hand-landmarker.ts` is shared student gameplay code and was deliberately **not** edited in this NUI-Lab-scoped task. Promoting NUI Lab's 12-line `CacheStorage` loader to `src/camera/hand-landmarker.ts` in a future authorized Student PR will drop Student SPA from `26.80 MB` to **`~11.16 MB`** (`PASS`).

---

## 3. P0.3 — Close-Range Bystander Ownership Audit & 90s Long-Session CPU Worker Benchmark

Implemented [`r20/candidates/r20_worker_owner_guard.ts`](../candidates/r20_worker_owner_guard.ts) inside [`r20/candidates/r20_hand_landmarker.worker.ts`](../candidates/r20_hand_landmarker.worker.ts) (and mirrored in NUI Lab `bench/worker-owner-guard.ts` + `bench/r20-hand.worker.ts`):
- Tighter spatial continuity jump threshold while locked (`<= 0.18` vs old `0.25`).
- Close-range hand-size ratio discontinuity check (`max(r, 1/r) > 1.6`).
- Close-range handedness flip probe (`handednessScore >= 0.78`) forcing immediate `numHands=2` verification.
- Periodic 2-hand bystander audit (`auditIntervalFrames = 45`, `lockConfirmFrames = 3`) plus `30`-frame `bystanderCooldown` keeping `numHands=2` active whenever a second hand is seen so `FullFrameHandLock` receives all hands.

### 90s Continuous CPU-Only (`--disable-gpu`) Browser Audit (`r20_fix_runtime_and_nuilab_e2e.json`)

| Variant | Duration | Delegate | UI FPS (Mean / p5) | Main-Thread LongTasks | Effective Detect Rate | Detect `p50 / p95` | `setOptions` Calls (`p50 / p95`) | Preprocess `p50 / p95` | Classifier `p50 / p95` | E2E `p50 / p95` | Heap Growth | Stuck Keys (`tabHidden` / `restart` / `stop`) |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **`B3v2` Guarded Owner-Lock** | **90.07 s** | `CPU` (`gpuAttempted=false`) | **60.00 / 60.00** | **0** | **15.11 Hz** *(hard-cut stress)* | 36.4 / 93.4 ms | **232** (26.8 / 34.0 ms) | 4.5 / 8.5 ms | 0.0 / 0.1 ms | 67.8 / 105.2 ms | **+0.86 MB** (3.37 -> 4.23 MB) | **0** (`releaseAll=3`, `monotonicClamps=0`) |
| `B1` Fixed `numHands=2` | 30.04 s | `CPU` | 60.02 / 59.99 | 0 | 13.78 Hz | 66.9 / 69.7 ms | 0 | 4.5 / 8.6 ms | 0.0 / 0.1 ms | 73.3 / 79.2 ms | -1.41 MB | **0** |
| `B2` Single-Hand `numHands=1` | 25.03 s | `CPU` | 60.00 / 60.00 | 0 | **24.25 Hz** | 32.9 / 35.8 ms | 0 | 4.4 / 8.6 ms | 0.0 / 0.1 ms | 39.0 / 44.4 ms | +0.91 MB | **0** |
| Real NUI Lab `/nui-lab/gesture` (E2E) | ~14 s | `CPU` | **60.00 / —** (`raf p95 = 16.7 ms`) | **0** (`recDelta = 0.0 FPS`) | **26 Hz** *(steady readout)* / 15.3–16.1 Hz avg w/ cuts | 35.1 / 94.3 ms | — | 4.4 / 11.2 ms | 0.1 / 0.2 ms | 55.6 / 108.3 ms | — | **0** (`droppedRecords = 0`, `storageFailures = 0`) |

### Honest Tradeoff Finding (`setOptions` Graph Rebuild Latency)
- Calling MediaPipe WASM `landmarker.setOptions({ numHands })` rebuilds the internal graph and takes **`26.8 ms (p50) / 34.0 ms (p95)`** on CPU.
- On `r20_sim_cam.y4m` (which concatenates clips with frequent hard scene cuts every ~1.5s), `WorkerOwnerGuard`'s close-range bystander safety guards legitimately flagged `52` spatial jumps, `9` size discontinuities, `18` handedness probes, and `5` bystander audits (`4` bystander detections), triggering `232` `setOptions` switches over 90s and reducing throughput on that hard-cut stream to **`15.11 Hz`** (still faster than fixed `numHands=2` at `13.78 Hz` while preserving `60.0 FPS` UI, `0` LongTasks, `e2e p95 = 105.2 ms`, and `+0.86 MB` heap stability).
- During steady continuous single-hand tracking (no hard scene teleports), `B3v2` stays locked in `numHands=1` (as observed in the real NUI Lab readout **`Det 26 Hz`** and `B2` ceiling **`24.25 Hz`**), paying only one `~27 ms` audit probe every 45 frames (~2s).
- **Remaining physical gate:** Continuous human hand motion + real close-range bystander walk-in under night lighting (`N1..N6`) remains **`PHYSICAL_WEBCAM = NOT_TESTED`**.

---

## 4. Real NUI Lab Static Export E2E Verification (`main` Integration Preview)

Verified in headless Chromium (`--disable-gpu`) on real Next.js static export `out/` (`r20_fix_runtime_and_nuilab_e2e.json`):
- **Consent Gate:** Start button disabled before consent (`startDisabledBeforeConsent: true`).
- **Recording Overhead:** Recording OFF = `60.0 FPS` (`raf p95 = 16.7 ms`, `0` LongTasks) vs Recording ON = `60.0 FPS` (`raf p95 = 16.7 ms`, `0` LongTasks) -> **`recordingFpsDelta = 0.0`**.
- **Multi-Trial Engine Separation:** 3 trials recorded across route & engine switches without losing history: `S-*-T001` (`gesture`, `r20-c4`, `124` frames: `71` hand + `53` `DETECTOR_MISS`), `S-*-T002` (`gesture`, `r19-c0`, `50` frames: `11` hand + `39` `DETECTOR_MISS`), `S-*-T003` (`canvas`, `r19-c0`, `45` frames + `1` `pointerStrokes` separated from `0` `gestureStrokes`). All `modelHashVerified: true`.
- **Browser Download & Independent Re-Analysis:** `287,559 B` JSON exported directly via browser download (`containsForbiddenDataUrl: false`, `storageBackend: "indexeddb"`, `droppedRecords: {0,0,0}`, `storageFailures: 0`, `physicalWebcamEvidence: "VIRTUAL_OR_SIMULATED_SUSPECTED"`). Independent `validateExportFile` + `reanalyzeExport` returned **`0` validation problems, `ok: true, mismatches: []`**.
- **Reload / Crash Persistence:** Mid-session reload preserved IndexedDB session and surfaced `"interrupted"` recovery banner (`reloadRecoveryShowsInterrupted: true`).
