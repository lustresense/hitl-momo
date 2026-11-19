# R20 Owner Night Low-Light Physical Webcam Protocol & Safe Staging Handoff (`P4 / P5`, `§8`, `§9`, `§16`, `§19.2`)

- **Revision:** `R20-01 v0.2.0` (`2026-11-19 WIB`)
- **Physical Webcam Gate (`G20-D`):** **`NOT_TESTED`** (requires Owner hardware, physical webcam, and room lighting conditions `N1..N6`; per `§0.5`, `§9`, `§11`, `§19.3`, offline/synthetic/simulated-video PASS is never converted into a `PHYSICAL_WEBCAM` PASS, and the R20 plan remains **`[WIP]`** until Owner physical webcam evidence is recorded).
- **Product Boundary (`§0.7`, `§8 P4`, `§10`, `§19.2`):** `main@8969502df4e106d8428055c2ca6f80f4f59250ee` is **100% untouched**. All R20 models, Web Worker CPU runtime, and low-light adaptive fallback modules are staged cleanly in `research-can/r20/`.

---

## 1. Gate Status Summary (`§19.2` Gates `G20-A..G20-D`)

| Gate ID | Requirement (`§19.2`) | Offline / Synthetic / Browser Simulated Evidence | Physical Webcam Evidence | Overall Gate Status |
|---|---|---|---|---|
| **`G20-A` GPU Training, CPU User** | GPU used for training (`C1..C4`, `T-IMG`, `T-TEMP`, `C6/C7`, `S3 QAT`); `0 B` teacher/dataset shipped to user; `100% CPU` vision inference (`HandLandmarker` + `FaceDetector` + `R20 Student`), `0` GPU delegate | **`PASS` (`OBSERVED` / `BROWSER_SIMULATED_VIDEO`)**: trained on `2x NVIDIA RTX A5000` (`cuda:0`, `cuda:1`); student `[82->64->32->3]` is `73,275 B` raw JSON (`29,088 B` wire, `9.67 µs` pure TS CPU); `delegate === "CPU"`, `gpuDelegateAttempted === false`, `gpuDelegateActive === false` | Pending Owner run | **`PASS` (Offline/Browser CPU-Only); Pending Owner Webcam** |
| **`G20-B` CPU Enteng & Anti-Lag** | Detector `>= 20 Hz` (`15 Hz` floor diagnosis only), UI `>= 30 FPS`, event `p95 <= 150 ms`, `0` detector-caused main-thread long tasks on worker variant, `0` stuck keys | **`PASS` (`BROWSER_SIMULATED_VIDEO` on `B3` / `B2`)**: `B3_cpu_web_worker_dynamic_owner_lock` achieves **`24.70 Hz`** (`B2 numHands=1`: **`27.62 Hz`**; fixed `numHands=2` `B1`: `15.59 Hz` diagnosis floor), **`60.04 FPS` UI (`p5 = 60.00 FPS`)**, **`0` main-thread LongTasks `>50ms`** (vs `314` on main thread), **`1.8 ms` main-thread dispatch `p95`**, **`69.3 ms` e2e `p95`**, **`0` stuck keys** | **`NOT_TESTED`** (true physical-intent-to-key latency requires Owner physical timestamp ground truth per `§7` & `§16`) | **`PASS` (Browser Simulated Video); `NOT_TESTED` (Physical Intent-to-Key)** |
| **`G20-C` Download `< 25 MB`** | Cold first-use `< 25,000,000 B` for NUI Lab journey and Student Onboarding -> Canvas -> Gameplay journey measured separately | **`PASS` (`BROWSER_SIMULATED_VIDEO` CDP + Server Wire)**: Journey 1 (NUI Lab) = **`9,345,570 B` (`8.91 MiB`)** (`11,320,653 B` if `.task` uncompressed); Journey 2 (Student Gameplay) = **`9,432,085 B` (`9.00 MiB`)** (`11,407,168 B` if `.task` uncompressed); `0` duplicate downloads; `> 15.5 MB` headroom | Same static bundle | **`PASS`** |
| **`G20-D` Low-Light & Anti-Distraksi** | Measurable improvement over frozen `C0 (R19)` on low-light, backlight, dorsal, and distraction without false `PRESS`/erase/takeover/stuck-key regression | **`PASS` (`OFFLINE_DATASET` + `SYNTHETIC` + `BROWSER_SIMULATED_VIDEO`)**: `A4` adaptive low-light fallback boosts far-dim detection `+8.22 pp` (`30.98% -> 39.20%`) and moderate-dim `+4.02 pp` without hurting bright frames (`72.08%`); `C4_Full_Focal` achieves **`0.9873` Locked TEST Macro-F1** (`+3.06 pp` vs `C0 = 0.9567`, **`0 / 4,664` false presses**), `0 / 888` on Natural RGB v3 (`6` lighting strata), `0 / 2,092` G4 false press on unseen `HANDS RGB-D Subject4..5`, `0 / 85` on unseen `bxr7 Gomoku/Poker`, `0.00 / 0.00 / 0.09` (`C7_T2`: `0.00 / 0.00 / 0.00`) `KD/min` on IPN, and `100%` pass on `O1..O3` bystander ownership stress tests | **`NOT_TESTED`** (`N1..N6` Owner night physical webcam protocol pending) | **`PASS` (Offline/OOD/Sim-Video); `NOT_TESTED` (Physical Night Webcam)** |

---

## 2. How to Stage R20 in NUI Lab for Owner Night Testing (`§8 P4`, `§14.1`)

When authorized by the Owner to stage R20 in `/nui-lab/gesture` and `/nui-lab/canvas` (or inside the isolated sandbox copy `/srv/sketchbook/mediapipe-optimize/r20-sandbox/app/`):
1. **Model Drop-In (`0` schema changes required):**
   - [`r20/models/r20_model_c4_full_mlp.json`](../models/r20_model_c4_full_mlp.json) (`73,275 B` raw / `29,088 B` wire, `[82 -> 64 -> 32 -> 3]`) and [`r20/models/r20_model_c7_distilled_t4_mlp.json`](../models/r20_model_c7_distilled_t4_mlp.json) (`73,138 B` raw) use the **exact same JSON schema** as `public/models/r19-pistol-model.json` and pass `validateR19Model()` in `src/components/nui-lab/r19/r19_loader.ts` with zero code edits.
2. **CPU-Only Web Worker & Adaptive `A4` Low-Light Integration:**
   - Wire [`r20/candidates/r20_hand_landmarker_cpu.ts`](../candidates/r20_hand_landmarker_cpu.ts), [`r20/candidates/r20_hand_landmarker.worker.ts`](../candidates/r20_hand_landmarker.worker.ts), and [`r20/candidates/r20_lowlight_frame_source.ts`](../candidates/r20_lowlight_frame_source.ts) behind a diagnostic toggle in NUI Lab (`C0 R19 CPU` vs `R20 C4/C7 CPU Worker`, and `A0 RAW` vs `A2 CLAHE 320` vs `A4 Adaptive Gamma+Denoise+CLAHE 320 Fallback`).
   - Instant rollback: selecting `C0 R19` in the toggle or reverting to `main@8969502` restores the exact frozen baseline.

---

## 3. Owner Night Physical Webcam Paired Test Protocol (`N1..N6`, `§9`, `§16`)

### 3.1 Pre-Scenario Telemetry Checklist (`§9` line 200, `§16` line 384)
Record before and during each scenario (write `NOT_MEASURED` for any unavailable field):
- Device, OS, Browser & version, actual `<video>` resolution & camera FPS, lighting setup (no lux meter required if unavailable), handedness.
- Active delegate (`must be CPU`), cold download bytes, `meanLuma`, `centerLuma`, active low-light pass (`A0_raw` vs `A2_clahe320` vs `A3_gamma_denoise_clahe320`), `effectiveMpFps` (`detectHz`), `detectMs` (`p50 / p95`), `uiFps`, `r20Ms`, model ID (`C0_R19` vs `R20_C4` / `R20_C7`), owner lock ID & release reasons.

### 3.2 Paired Scenario Matrix (`N1..N6`, rotate order between `C0 R19 CPU` and `R20 CPU`)

| Scenario | Duration | Physical Actions | Required Paired Measurements (`C0 R19 CPU` vs `R20 CPU`, `RAW` vs `CLAHE/A4`) |
|---|---:|---|---|
| **`N1` Overhead Room Light (no front lamp)** | `60–90 s` | `READY <-> PRESS` right & left hand | Detector coverage `%`, conditional `PRESS` recall, false `KEYDOWN/min`, release delay |
| **`N2` Dim Room / Monitor-Only Light** | `60–90 s` | `READY <-> PRESS` near (`~40 cm`) and far (`~90 cm`) | `DETECTOR_MISS` rate (`RAW` vs `A4 Adaptive`), valid `PRESS` count, camera FPS |
| **`N3` Strong Backlight (silhouette hand)** | `60–90 s` | `PRESS` left, up, and dorsal view | Backlight flag trigger rate, wrong-hand/false `OTHER` rate, `A4` vs `RAW` recovery |
| **`N4` Real Gameplay Motion** | `60 s` | Repeated `RIGHT -> RIGHT+JUMP -> RIGHT` + thumb release | Horizontal stop glitches (`target = 0`), exact `1` jump per intent, `0` stuck keys |
| **`N5` Anti-Distraction Postures & Objects** | `60–90 s` | Peace, thumbs-up, five-finger open palm, pinch, fist, holding pen/object | False `PRESS/min`, false `Erase/min`, false `Pinch/min`, false owner switch |
| **`N6` Hand Enter/Exit & Bystander Crossing** | `60 s` | Owner hand exits/re-enters, second person/hand crosses behind or closer | Immediate `RELEASE_ALL` on loss, clean re-arm required, `0` ghost/bystander events |
