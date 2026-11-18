# Experiment R18-UX5 (Pre-Check) — Isolated Headless Chromium WASM 180s Run (`BROWSER_SIMULATED_VIDEO`)

- **Test Types:** `REAL_MODEL` + `BROWSER_SIMULATED_VIDEO` (`NOT_TESTED` on physical webcam!)
- **Candidate Harness:** `r18/candidates/browser_harness/harness.ts`, `index.html`, `r18/models/ux3_model_mlp.json`, `r18/scripts/make_sim_camera_y4m.py`, `r18/scripts/run_browser_harness.mjs`
- **Results JSON:** `r18/results/r18_ux4_browser_runtime.json`
- **Simulated Camera Feed:** `sim_cam.y4m` (`640x360`, 150 frames @ 12 fps: 60 Mendeley `DimLight` + 60 `NaturalLight` + 30 `N0_fan_sticks` looped continuously for `180.43 s`). *Excluded from Git (`51.8 MB`), regenerable via `make_sim_camera_y4m.py`.*

## Verified Browser Measurements (`r18/results/r18_ux4_browser_runtime.json`)
- **Cold First-Use Wire Transfer (`B-USER < 25 MB`):**
  - Visited real `next build` routes (`/`, `/onboarding/{card,number,cam}`, `/levels`, `/canvas{1..3}`, `/level{1..3}`) + `/r18-harness` (`vision_wasm_internal.{js,wasm}`, `hand_landmarker.task`, `blaze_face_short_range.tflite`, `ux3_model_mlp.json`, `harness.bundle.js`) behind Node `zstd`/`gzip` matching `Caddyfile`:
  - Total unique wire bytes: **`11,336,623 B` (`10.811 MB`)** (`PASS < 25 MB`; `ux3_model_mlp.json` wire = `44,065 B`).
- **Continuous 180-Second Stability (`2,271` frames processed, `180.43 s`):**
  - Delegate: `CPU` (`reason: software-renderer`, headless Chromium without GPU).
  - Throughput & Timing: `effectiveMpFps = 12.59 fps`, `detectMs p50 = 41.0 ms / p95 = 99.6 ms`, `claheMs p50 = 2.0 ms / p95 = 2.2 ms`, **`ux3Ms p50 = 0.0 ms / p95 = 0.2 ms`**, `e2eMs p50 = 75.5 ms / p95 = 114.7 ms`, `rafIntervalMs p95 = 116.7 ms`.
  - CPU Software Jitter Note: `2,057` Long Tasks observed (max `205 ms`), caused by MediaPipe WASM running synchronously on software CPU XNNPACK without GPU delegate.
  - Action Safety Over `2,271` Simulated Worst-Case Frames: Baseline `[falseSteer=370, falseErase=141]` vs **UX3 Exported `[falseSteer=0, falseErase=0, falseSwipe=0]`**; adaptive M3 recovered `309` missed dark/natural frames (`48.04%` det vs `34.43%` raw).
  - Memory & Cleanup: `cdpPerf.jsHeapUsedMB` `10.77 MB (20s) -> 7.34 MB (60s) -> 7.84 MB (120s) -> 8.89 MB (180s) -> 8.31 MB (post-stop)`, `0` page errors (`4` console INFO lines from TFLite CPU delegate), `tracksEndedCount = 1/1`, `stoppedCleanly = true`.

## Mandatory Disclosure
- **`physical_webcam_status: NOT_TESTED`.** This run does **not** substitute for real 480p webcam, ceiling shadow, backlight, skin-tone clutter, or student gameplay ergonomics. Next required gate: `docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`.
