# NUI Lab Persistent Benchmark Recorder & R20 C4/C7 CPU Worker Integration — Handoff

- **Date:** 2026-11-19 WIB
- **Version:** `0.27.0-alpha`
- **Branch:** `main` (scoped exclusively to `/nui-lab*` + monorepo version metadata sync)
- **Research Source:** `research-can@b0f43f01e226434d212a20437d24b00c31d583f3` (selective copy only — `research-can` is NEVER merged into `main`)
- **Physical Webcam Status:** **`NOT_TESTED`** (all browser evidence below is on Chromium `--disable-gpu` simulated video; R20 plan remains `[WIP]`)

---

## 1. What Was Built (Strictly Scoped to NUI Lab)

### A. Upgraded Persistent Multi-Trial Benchmark Recorder (`src/components/nui-lab/bench/`)
Compatibly upgrades existing `lab-recorder.ts` (zero duplicate legacy recorder; all 20 legacy `lab-recorder.test.ts` checks still pass):
- **Explicit Consent Gate:** Zero telemetry is recorded before the tester ticks numeric-recording consent and clicks **Mulai Sesi Benchmark** on `/nui-lab`. Camera still starts only on explicit user action.
- **Persistent IndexedDB Storage + Batched `ChunkWriter`:** Survives navigation across `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, and `/nui-lab/diagnostics` without re-clicking record.
- **Crash / Refresh / Pagehide Protection:** Same-tab `sessionStorage` active-session tracking + heartbeat marks interrupted sessions `"interrupted"` on reload without silently losing stored frames/events.
- **Zero Silent Loss:** Quota warnings, `droppedRecords` (`frames/events/perf`), and `storageFailures` counters are tracked visibly in the UI bar and inside every export.
- **Complete Non-Identifying Telemetry:**
  - Session metadata: app version, git commit, engine/model ID + verified SHA-256, non-identifying browser/OS/CPU cores/RAM/viewport, camera resolution/FPS + virtual-vs-physical heuristic (raw camera name discarded immediately), preprocessing mode, CPU delegate.
  - Detection & perf: `DETECTOR_MISS` frames preserved (never silently dropped), hand count, owner lock & rejection reasons, mean/center luma, backlight flag, actual preprocess pass (`A0_raw` / `A4_denoise_reinhard320`), MediaPipe/preprocess/classifier/pipeline `p50/p95`, effective `detectHz`, real UI FPS / RAF intervals / LongTasks (`PerformanceObserver`), real `performance.memory` only when exposed.
  - Gesture Lab: 21 numeric landmarks (when detected), RAW vs stabilized gesture, Top-3 probabilities, geometry guard & thumb/finger states, model veto, FSM state, `KEYDOWN`/`HELD`/`KEYUP`/`RELEASE_ALL`, manual Ground-Truth labels (`UNLABELLED` default).
  - Canvas Lab: pinch draw start/end, stroke ID/points/path length/duration, raw vs smoothed jitter, unexpected stroke breaks & gaps, 5-finger erase hit/miss, swipe undo/redo, rejected actions, and explicit `source: "pointer" | "gesture"` separation.
  - Privacy: Zero images, video, audio, faces, personal identity, or network uploads.
- **One-Click Browser Export & Explicit Local Wipe:** **Unduh Semua Hasil Sesi** downloads complete machine-readable JSON (`nui-lab-bench-export/1`, including metadata, trials, frames, events, perf, per-config grouped summaries, validation status) + **Unduh Ringkasan CSV** + **Hapus Data Lokal**.

### B. R20 Candidate Integration in NUI Lab (Selectable & Strictly Separated)
| Engine ID | Label | Model File (`public/models/`) | Raw Bytes | Pinned SHA-256 |
|---|---|---|---:|---|
| `r19-c0` | **R19 C0 (Baseline)** | `r19-pistol-model.json` | 122,768 B | `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293` |
| `r20-c4` | **R20 C4 (Student Utama)** | `r20-c4-model.json` | 73,275 B | `e863ef1afe459a3b0a4cf0b0b2594a1db853b382d669add2d7be234e64710a27` |
| `r20-c7` | **R20 C7 (Distilled T4)** | `r20-c7-t4-model.json` | 73,138 B | `66acbde9f73868f8e6afada647a6d513d7efab6252a937bf88dede933147d730` |

- **100% CPU-Only Web Worker (`bench/r20-hand.worker.ts` + `bench/r20-worker-client.ts`):** `delegate: "CPU"` (`gpuDelegateAttempted: false`), transferable `320×180` `ImageBitmap` (`maxInFlight = 1`), `CacheStorage` deduplication of `/models/hand_landmarker.task` (1 download across `/gesture` & `/canvas`), bounded auto-restart, zero competing detector instances, fail-closed SHA-256 verification.
- **Fixed Low-Light Preprocessing (`bench/r20-lowlight.ts` — `A4v2`):** Selectable `RAW` / `CLAHE` / `A4` (default `A4` chroma-preserving Reinhard + motion-gated EMA + separable median-of-5).
- **Hardened Owner-Lock Guard (`bench/worker-owner-guard.ts`):** Close-range bystander defense (`jump <= 0.18`, size ratio `<= 1.6`, handedness check `>= 0.78`, periodic 2-hand audit every 45 frames, 30-frame bystander cooldown).
- **Dashboard & Comparison (`/nui-lab`):** Shows active session status, trial count, active engine/preprocess, live UI FPS / detectHz / pipeline p95 / dropped frames / missing-hand rate, safety warnings, and per-configuration comparison table (never mixing `r19-c0`, `r20-c4`, and `r20-c7` into one untraceable aggregate).

---

## 2. Owner Physical Webcam Test Flow (`N1..N6` — Zero Terminal Required)

1. Open `/nui-lab` in Chrome/Edge on your target CPU laptop/PC.
2. On the **Benchmark Session** card:
   - Tick the numeric-data consent checkbox.
   - Select the starting configuration (e.g., **Engine `R20 C4`**, **Preprocess `A4`**, **Detector `CPU Worker`**, and scenario tag `N1`..`N6`).
   - Click **Mulai Sesi Benchmark**.
3. Open **Gesture Lab** (`/nui-lab/gesture`) and click **Mulai Kamera**.
   - Trials open and record automatically (no need to press record per gesture).
   - Optionally select manual Ground-Truth labels (`POINT_READY`, `POINT_PRESS`, `OTHER`, or leave `UNLABELLED`).
   - Run your paired `N1..N6` scenarios (normal dim room, near-dark screen glow, backlight, dorsal hand, bystander walk-in, rapid gesture transitions).
   - Switch engine between **`R19 C0`**, **`R20 C4`**, and **`R20 C7`** (or preprocess `RAW` vs `A4`) directly from the top benchmark bar — each change cleanly closes the previous trial and starts a new isolated trial.
4. Open **Canvas Lab** (`/nui-lab/canvas`) to test pinch drawing, 5-finger erase, swipe undo/redo, and mouse/touch fallback — all recorded under the same session with source tags (`gesture` vs `pointer`).
5. Return to `/nui-lab` (or use the top bar), click **Selesaikan Sesi**, and click **Unduh Semua Hasil Sesi (JSON)** (and **Unduh Ringkasan CSV** if desired).
6. Send the downloaded JSON/CSV file for offline analysis (never commit raw webcam exports to the public Git repo). Use **Hapus Data Lokal** when you want to clear browser IndexedDB.

---

## 3. Verification Evidence (`0.27.0-alpha`)

| Check | Result | Notes |
|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **PASS (exit 0)** | 0 TypeScript errors |
| `npm run lint` (`next lint`) | **PASS (exit 0)** | 0 new warnings (only pre-existing `GestureRing.tsx:128`) |
| `npx vitest run tests/nui-lab` | **PASS (17/17 files, 210/210 tests)** | Includes 15 new tests (`bench-recorder`, `bench-worker-and-lowlight`, `bench-ui-flow`) + all 195 existing R19/Lab tests |
| `npx vitest run tests/owner-build-manifest.test.ts` | **PASS (4/4)** | Static export manifest checks clean |
| `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` | **PASS (24/24 static pages)** | Clean static export in `out/` |
| Playwright Chromium (`--disable-gpu`) NUI Lab E2E on `out/` | **PASS** | Consent gate, `60.0 -> 60.0 FPS` (`delta 0.0`, `0` LongTasks), `0` dropped records, 3 isolated trials (`r20-c4`, `r19-c0` gesture, `r19-c0` canvas w/ `pointerStrokes=1`), `reloadRecoveryShowsInterrupted=true`, `287,559 B` download passes `validateExportFile` (`0` errors) & `reanalyzeExport` (`ok: true, mismatches: []`) |
| True CDP Cold Transfer (`deploy/Caddyfile` zstd+gzip, Page + Worker) | **PASS on NUI Lab (`10,966,014 B` / `10.46 MiB`)** | **Note:** Unmodified student `main` SPA (`/onboarding/cam -> /canvas1 -> /level1`) measured **`26,801,677 B` (`25.56 MiB`, FAIL)** due to pre-existing `3×` `.task` fetch in untouched `src/camera/hand-landmarker.ts` (out of scope here; tracked for future Student PR) |
| Physical Night Webcam (`N1..N6`) | **`NOT_TESTED`** | Requires Owner hardware; R20 stays `[WIP]` |

---

## 4. What Was NOT Touched & Staging Handoff

- **Untouched:** `app/level1..3`, `app/canvas1..3`, `app/onboarding/*`, `src/game/*`, `src/input/{gameplay-hand-driver,mediapipe-input,arbiter}.ts`, `src/camera/*`, `backend/app/*` logic (version string synced only via `bump_version.py`), `contracts/`, `DECISIONS.md`, `SOUL.md`, `/etc/caddy/Caddyfile`, and running server processes owned by `can`/Ujang.
- **Dev / Staging Deployment Note:** Ujang's dev tunnel tracks `main`. Once `main` is pulled by Ujang and verified via `bash frontend/implementation/scripts/ujang-verify-web.sh`, `/nui-lab` is immediately live for Owner webcam testing.
