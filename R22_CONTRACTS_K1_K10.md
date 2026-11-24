# R22 Interface Contracts (K1–K10) & Strict Non-Overlapping File Ownership (A1–A7)

- **Published by:** `ORCH` (`Gemini 4 Argon (High)`)
- **Timestamp:** `2026-11-19T19:38:30+07:00`
- **Status:** `DRAFT v1` (Active immediately per `06_ADDENDUM_INTEGRASI_CLAUDE.md` §A7 so all workers proceed in parallel without blocking)
- **Worktree:** `/srv/sketchbook/mediapipe-optimize/r22-nui-lab` (`branch: r22-nui-lab`, based on `origin/main@745bb6d840793dcab8558f65aef6bfac58807e79` `0.29.1-alpha`, above `e3e74bf`)
- **Research Output Dir:** `/srv/sketchbook/mediapipe-optimize/research-can/r22/`

---

## 1. Strict File Ownership Table (§A1 — ZERO Overlap Allowed)

| Worker | Model Tier | Owned Files in `/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation/` | Owned Files in `/srv/sketchbook/mediapipe-optimize/research-can/r22/` |
|---|---|---|---|
| **ORCH** | Argon (`T-ORCH`) | `R22_CONTRACTS_K1_K10.md`, `R22_HANDOFF_STATE.md`, final merge/integration review | `r22/results/R22_MASTER_EXECUTION_REPORT.md` |
| **w-runtime** | Neon (`T-STRONG`) | `src/components/nui-lab/bench/frame-scheduler.ts` (NEW), `src/components/nui-lab/bench/r20-hand.worker.ts`, `src/components/nui-lab/bench/r20-worker-client.ts`, `src/components/nui-lab/bench/worker-owner-guard.ts` | `r22/results/r22_numhands_fixed1_vs_fixed2_ablation.json`, `r22/scripts/bench_numhands_ablation.ts` |
| **w-canvas** | Neon (`T-STRONG`) | `src/components/nui-lab/bench/action-resolver.ts` (NEW), `src/components/nui-lab/lab-analyzer.ts`, `src/input/hand-stroke-pipeline.ts` *(optional NUI-Lab param only, zero gameplay change)* | `r22/results/r22_canvas_t004_before_after.json` |
| **w-data** | Neon (`T-STRONG`) | *(Read-only on frontend)* | `r22/registry/*`, `r22/scripts/train_r22_heads_gpu.py` (`CUDA_VISIBLE_DEVICES=0`), `r22/models/*`, `r22/results/r22_heads_eval.json` |
| **w-temporal** | Neon (`T-STRONG`) | `src/components/nui-lab/bench/r22-temporal.ts` (NEW pure-TS inference module) | `r22/temporal/*` (`CUDA_VISIBLE_DEVICES=1`), `r22/results/r22_temporal_eval.json` |
| **w-ui** | Hydrogen (`T-LIGHT`) | `app/nui-lab/page.tsx`, `src/components/nui-lab/NuiLabPage.tsx`, `src/components/nui-lab/NuiLabPage.css`, `src/components/nui-lab/bench/BenchControls.tsx` | — |
| **w-bench** | Hydrogen (`T-LIGHT`) | `src/components/nui-lab/bench/schema.ts`, `src/components/nui-lab/bench/manager.ts`, `src/components/nui-lab/bench/stats.ts`, `src/components/nui-lab/bench/export.ts`, `src/components/nui-lab/bench/canvas-tracker.ts`, `src/components/nui-lab/bench/config.ts`, `src/components/nui-lab/bench/engines.ts`, `src/components/nui-lab/bench/env.ts` | `r22/scripts/analyze_nui_bench_r22.py` |
| **w-robust** | Hydrogen (`T-LIGHT`) | `src/components/nui-lab/bench/r20-lowlight.ts`, `src/components/nui-lab/bench/one-euro.ts` (NEW) | `r22/detector/*`, `r22/experiments/*`, `r22/results/r22_preprocessing_and_detector_ablation.json` |
| **w-qa** | Hydrogen (`T-LIGHT`) | `tests/nui-lab/r22-t004-replay.test.ts` (NEW), `tests/nui-lab/r22-frame-freshness-and-worker.test.ts` (NEW), `tests/nui-lab/r22-ui-and-autolabel.test.tsx` (NEW) | `r22/scripts/run_r22_e2e_and_perf_audit.mjs`, `r22/results/R22_QA_AND_ACCEPTANCE_EVIDENCE.md`, `r22/results/screenshots/*` |

**FORBIDDEN FOR ALL WORKERS:** Never open, search, or read `contexts/can/research/.context-notforagent/`. Never push to `main` or touch student gameplay (`app/level1..3`, `app/canvas1..3`, `src/game/*`, `DECISIONS.md`, `SOUL.md`).

---

## 2. Contracts K1–K10 Specification (§A7)

### K4 — R22 Label Taxonomy & Dataset Mapping (`v1.0-FROZEN`)
- **Pistol Head (`route="gesture"` ONLY, NEVER gates Canvas):**
  - Classes: `0: POINT_READY`, `1: POINT_PRESS`, `2: OTHER`.
  - Mapping rule: `POINT_READY` = index extended + thumb folded (`HandGesture-5G Pointing Up`, `HANDS RGB-D One_VFR/VFL`); `POINT_PRESS` = index extended + thumb open L-shape (`HandGesture-5G L-Sign`); `OTHER` = all other poses + conversational pointing (`Natural RGB v3 point_left/right` quarantined as `OTHER`/ambiguous, IPN `P1F` NOT mapped to `POINT_PRESS`).
- **Canvas Static Pose Head / Rule (`route="canvas"`):**
  - Classes: `0: FIST`, `1: ONE`, `2: TWO`, `3: FIVE`, `4: OTHER` (+ diagnostics `THREE`, `FOUR` for Gesture Lab 0–5 finger display per A8 #9).
  - Mapping rule: `FIST` = 0 extended fingers (neutral/arming); `ONE` = only index extended (Undo confirm after `ARMED_FIST`); `TWO` = index+middle extended (Redo confirm after `ARMED_FIST`); `FIVE` = all 5 digits extended (Erase, non-split-palm); `OTHER` = 3/4 fingers or transitional poses.
- **Pinch Head / Evaluator (`route="canvas"`):**
  - States: `TOUCH` (contact confirmed, tight threshold `pinchRatio <= 0.30` onset / `<= 0.42` hold hysteresis), `NEAR` (`0.30 < pinchRatio <= 0.50` — explicit negative test case, MUST NOT start stroke!), `OPEN` (`> 0.50`).
- **Autolabel `labelSource` Enum (Mandatory on all recorded predictions/actions):**
  - `"MODEL_PREDICTION" | "RULE_DERIVED" | "USER_ACTION" | "DATASET_GT" | "UNKNOWN"`

### K5 — Frozen Feature Encoder (`v1.0-FROZEN`)
- Spatial encoder: `extractR19Features(landmarks)` -> **82-dim** scale/aspect/rotation-invariant `Float32Array` (`src/components/nui-lab/r19/r19_features.ts`, version tag `"r19-82d-v1"`). Never concatenate 68D features with 82D without re-encoding from 21 raw landmarks.
- Temporal sequence encoder (`r22-temporal-146d-v1`): per frame `[82D r19_features, 63D dt-normalized joint velocity (dx/dt, dy/dt, dz/dt), 1D valid_frame_mask]` across window `W in {3, 5, 8}` causal frames (NO `landmark.visibility` field invented).

### K1 — `frame-scheduler.ts` Interface (`w-runtime` -> `w-ui`, `w-bench`, `w-canvas`, `w-qa`)
```ts
export interface CameraFrameTick {
  captureFrameId: number;       // Monotonic unique camera frame ID (1, 2, 3...)
  captureTimestampMs: number;   // performance.now() at unique frame arrival
  mediaTimeSec: number;         // video.currentTime
  dtMs: number;                 // Delta since previous unique camera frame
  uniqueCaptureFps: number;     // Rolling unique camera FPS (honest 12-15 FPS if camera is 15 FPS)
  framesSkippedDuplicate: number;
  videoWidth: number;
  videoHeight: number;
}
```
- **Rule:** Worker completion callback in `NuiLabPage.tsx` MUST NOT re-submit the same `video` frame without checking `frame-scheduler`. `processedFrames <= capturedUniqueFrames`.

### K2 — Worker Result Message (`w-runtime` -> `w-canvas`, `w-bench`, `w-robust`)
Extends `LabWorkerResultMsg` with:
- `captureFrameId: number`, `processedFrameId: number`, `captureTimestampMs: number`
- `numHandsActive: 1 | 2`, `initSetOptionsCalls: number`, `runtimeSetOptionsCalls: number` (**MUST be `0`** during tracking!)
- `lumaStats: { mean: number; center: number; p10: number; p50: number; p95: number; nearWhiteHandPct: number | null; blurProxy: number; noiseProxy: number; isBacklight: boolean; passUsed: string }`
- `ownerTrack: { locked: boolean; trackId: number; handCount: number; ambiguousHold: boolean; rejectReason: string | null }`

### K3 — `ActionIntentResolver` & Single Source of Decision (`w-canvas` -> `w-ui`, `w-bench`, `w-qa`)
- Per route, **exactly one** `PinchSource` and **exactly one** `PoseSource`.
- On `route === "canvas"`:
  - Pistol classifier (`POINT_READY`/`POINT_PRESS`) is **DISABLED** (`r19State = "DISABLED_ON_CANVAS"`). It NEVER closes or blocks a canvas stroke.
  - `ActionIntentResolver.resolve(frame)` returns `{ actionIntent: "DRAW" | "ERASE" | "UNDO" | "REDO" | "HOLD_GRACE" | "NEUTRAL", actionAccepted: boolean, rejectReason: string | null, labelSource: LabelSource, fingerCount: 0 | 1 | 2 | 3 | 4 | 5 }`.
  - When `hands === 0` during an active stroke, call `HandStrokePipeline.lost(nowMs)` (grace window `240 ms` so T004 62/99/220 ms breaks survive while 603/12657 ms breaks close cleanly), do NOT reset `armed.draw` on a short blink, and NEVER draw speculative segments across the unobserved gap.
  - Undo/Redo FSM: `NEUTRAL -> ARMED_FIST (>=160ms stable fist) -> CONFIRM_ONE (>=160ms stable 1-finger -> fire UNDO once) / CONFIRM_TWO (>=160ms stable 2-finger -> fire REDO once) -> FIRED (cooldown + require FIST re-arm)`. Zero swipe Undo/Redo.

### K6 — Model Export Format & Honest Metadata (`w-data`, `w-temporal`, `w-bench`)
- Models in `bench/engines.ts` must verify SHA-256 via `SubtleCrypto`.
- Default automatic runtime reports `"NUI R22 · CPU · Otomatis"` in the primary UI, while recording the exact underlying model ID (`r20-c4` or `r22-pistol-v1` if it beats C4 on held-out test) and full SHA-256 in diagnostics and JSON export (never disguising C4 as a newly trained model in metadata).

### K7 — Frozen Dataset Registry & Splits (`w-data` -> `w-temporal`, `w-robust`, `w-qa`)
- Output at `/srv/sketchbook/mediapipe-optimize/research-can/r22/registry/dataset_registry_r17_r20.json`.
- `HaGRIDv2` = `HOLD_LICENSE` (excluded from product weights). Locked TEST (`4,720` rows) and `HANDS RGB-D Subject4..5` / `BXR7 holdout` remain strictly locked evaluation splits (zero leakage into train).

### K8 — Auto-Benchmark Schema & Summary (`w-bench` -> `w-ui`, `w-qa`)
- Compatible upgrade of `nui-lab-bench-export/1` (`schemaVersion: "nui-lab-bench-export/2"`, reader accepts v1 and v2).
- Separates `rawNoHandRate`, `activeWindowMissRate` (between first & last hand detection), `flickerStreaks_1_3`, `shortLossStreaks_4_15`, `longAbsenceStreaks_gt15`, `hiddenDurationMs`, and `setOptionsRuntimeCalls`. Never reports self-prediction as ground-truth accuracy.

### K9 — T004 Replay Fixture (`w-qa` -> `w-canvas`, `w-runtime`)
- Extracted from `/srv/sketchbook/mediapipe-optimize/research-can/docs/plan-rev/R22_FULL_SCOPE_MALAM_20261119/references/benchmarks/nui-lab-benchmark-S-07ba0cde-four-trials.json` (`S-07ba0cde-T004`, 2,082 frames, breaks at 62, 99, 220, 603, 12,657 ms).

### K10 — Custom Detector Legal BBox & Prototype Gate (`w-robust`)
- Prototype `@mediapipe/tasks-vision` `ObjectDetector` in CPU worker + ROI coordinate transform + CDP wire/heap/latency measurement. Remains `CANDIDATE`/`DEFERRED` unless A/B proves superiority under `< 25 MB` budget.

---

## 3. R22B Contract Upgrades (Published by ORCH / Neon `2026-11-20` — Status: `ACTIVE v1.1`)

Applies to branch **`r22b-handstate`** (based on `r22-nui-lab@1bb1a71`) and research dir **`research-can/r22b/`**. Rules A1–A9 and K1–K10 remain active; upgraded/new contracts below take precedence for R22B.

### K3.1 — `PinchReading`, Onset Gate `G1'`, Compositional `HandState` (`W-CANVAS` -> `W-UI`, `W-BENCH`, `W-QA`)
- `PinchGateResult`:
  ```ts
  export interface PinchGateResult {
    path: "OK" | "CLOSED";
    passed: boolean;
    reasons: string[];
    indexPipDeg: number;         // aspect-corrected 2D angle(5, 6, 7)
    thumbTipToIndexMcp: number;  // aspect-corrected |4 - 5| / |0 - 9|
    thumbOpen: boolean;
    mrpExtendedCount: number;    // count of middle/ring/pinky === "extended"
  }
  ```
- `PinchReading` adds:
  - `variant: "CLOSED" | "OK" | null`
  - `gate: PinchGateResult`
  - `onset: "NONE" | "PENDING" | "CONFIRMED"`
- Onset gate `G1'` (applied at onset only; existing `pinchRatio` thresholds unchanged until B6 refit):
  - `mrpExtendedCount >= 2` -> `path: "OK"` -> `passed: true`
  - else -> `path: "CLOSED"` -> `passed: indexPipDeg >= 60 && (thumbOpen || thumbTipToIndexMcp >= 0.33)`
- Onset confirmation + backfill:
  - Normal: 2 consecutive G1'-passing frames; within 400 ms of FIST/ONE/TWO or when `undoRedoFsmState !== "NEUTRAL"`: `>= 300 ms` time-based continuous G1' hold.
  - Backfill all pending points from frame #1 on confirmation (`PINCH_ONSET_CONFIRMED{waitedMs, backfilledPoints}`).
- Release debounce + retro-trim (separate from `HOLD_GRACE` for missing hands):
  - Pinch release must persist `>= 150 ms`; re-pinch before 150 ms continues the same stroke (`PINCH_RELEASE_BRIDGED{gapMs}`).
  - Confirmed release discards points accumulated during debounce (retro-trim).
- Fist hold tolerance: single non-FIST frame `<= 100 ms` that is not `ONE`/`TWO`/`FIVE` does not reset `fistHoldStartMs`; G1'-blocked pinch frames count as FIST-compatible.
- Strict `FIVE` (when preset enables both `PINCH_OK` draw and `FIVE` erase): all 5 fingers EXT + `pinchRatio >= 0.55` + `indexPipDeg(5,6,7) >= 160°` + `>= 160 ms` stable hold.
- `lastCommand` expiration: cleared after `1,500 ms` or when hand is lost `>= 300 ms`.
- `reacquirePinchPolicy: "require-release" | "allow-after-confirm"` (default `"require-release"`; `"allow-after-confirm"` allows stroke start without releasing pinch when returning `<= 1.5 s`, within `<= 12%` canvas diagonal, and G1' passes `>= 3` frames).

### K4 v1.1 — Additive Compositional HandState Taxonomy (`W-DATA` / `ORCH` -> all)
- Compositional representation: `contact ∈ {TOUCH, NEAR, OPEN}` × `{thumb, index, middle, ring, pinky} ∈ {EXT, CURL, BETWEEN}`.
- Derived classes: `FIST`, `ONE`, `TWO`, `THREE_IMR`, `THREE_TIM`, `THREE_MRP`, `FOUR`, `FIVE`, `PINCH_CLOSED`, `PINCH_OK`, `NEAR_PINCH`, `OTHER`.
- Mapping table `v1.0 ↔ v1.1`:
  - `FIST ↔ FIST`, `ONE ↔ ONE`, `TWO ↔ TWO`, `FIVE ↔ FIVE`, `OTHER ↔ OTHER | FOUR | THREE_* | NEAR_PINCH`
  - `PINCH (v1.0) -> PINCH_CLOSED | PINCH_OK (v1.1)`
  - `THREE (v1.0) -> THREE_IMR (default) | THREE_TIM | THREE_MRP (v1.1)`
- Provenance: add `labelProvenance?: string | null` (e.g. `"guided-capture-v1"`, `"weak-s970-v1"`); `labelSource` enum unchanged (`MODEL_PREDICTION | RULE_DERIVED | USER_ACTION | DATASET_GT | UNKNOWN`).

### K5 — Feature Encoder (`v1.0-FROZEN`)
- Runtime encoder remains **82D** (`extractR19Features`, `"r19-82d-v1"`). Candidate 12D extra features (`handstate-extra-12d-v1`, 94D total) are evaluated offline in B6 only and require a new version if adopted.

### K7 — R22B Dataset Registry (`W-DATA` -> `W-TEMPORAL`, `W-QA`)
- Adds `weak-s970-t004-v1` (eval/hard-negative ONLY, never train), `s970-t002-landmark-replay-v1` (replay eval ONLY), and slots for `guided-capture-p1-v1` / `guided-capture-p2-v1`.

### K8 v2.1 — Benchmark Export & Analyzer (`W-BENCH` -> `W-UI`, `W-QA`, `analyze_r22b.py`)
- Backwards-compatible extension of `nui-lab-bench-export/2` (`schemaVersion: "nui-lab-bench-export/2.1"`):
  - `TrialMeta`: full `CameraExposureCapabilities` + current settings, MediaPipe confidence params (`mdc/mpc/mtc`), `presetId`, `reacquirePinchPolicy`, guided-capture & rawrec metadata.
  - Per frame: `mpRawHandCount`, `mpHandednessScores[]`, `pinchGate`, `handState`, `clippedPct` (`luma >= 0.96`), `handRoiLumaP50`, `lastRoiLumaP50`, `truth`, `truthMasked`, `labelProvenance`, `captureStep`, `variation`, `lighting`, `subjectCode`.
  - Recalibrated diagnostic-only tags (B7.1): `backlightCandidate = clippedPct >= 8% && (handRoiLumaP50 <= 0.35 || lastRoiLumaP50 <= 0.35)`; `GLARE_CANDIDATE = nearWhiteHandPct >= 25%`.

### K11 — `CanvasMechanismPreset` (`W-CANVAS` -> `W-UI`, `W-QA`, gameplay later)
```ts
export interface CanvasMechanismPreset {
  id: string;
  label: string;
  draw: Array<"PINCH_CLOSED" | "PINCH_OK">;
  three: null | { variant: "IMR" | "TIM" | "MRP"; action: "THREE_ACTION" };
  undoRedo: "FIST_ONE_TWO" | "OFF";
  erase: "FIVE" | "OFF";
  experimental?: boolean;
}
```
Built-in Lab presets: `default-any-pinch`, `ok-pinch-only`, `closed-pinch-only`, `three-imr-action`, `three-mrp-vs-ok` (`experimental: true`). Classes outside active preset never trigger actions.
