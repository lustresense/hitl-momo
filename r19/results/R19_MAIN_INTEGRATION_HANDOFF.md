# R19 Integration Handoff Guide for `main` NUI Lab (`/nui-lab/gesture` & `/nui-lab/canvas`)

- **Branch / Policy Constraint:** `research-can` **R&D only**. Zero edits made to `main`, deployment, `src/input/`, `src/game/`, or student gameplay routes.
- **Target Scope in `main@c14b1d0502`:** Strictly scoped to the existing **NUI Lab** routes (`/nui-lab/gesture` and `/nui-lab/canvas`), reusing the observer architecture already established in PR #6 (`c14b1d0502`, `v0.25.0-alpha`).
- **Pre-Promotion Blocker Status:** **`PHYSICAL_WEBCAM = NOT_TESTED`** — NUI Lab diagnostic integration may be tested manually by Owner behind an explicit lab toggle, **NOT** promoted into student gameplay until `DECISIONS.md` (`D-20261110-09`) and Owner physical webcam gates pass.

---

## 1. Exact Existing Entry Points in `main@c14b1d0502`

From audited `main@c14b1d0502` (`v0.25.0-alpha` — PR #6):
1. **No new routes needed:** `NuiLabPage.tsx` (`906` lines) already serves `variant = "gesture"` (`/nui-lab/gesture`: `fullFrameLock: true`, `enableInk: false`, `experimentalRobust: true`) and `variant = "canvas"` (`/nui-lab/canvas`: `fullFrameLock: true`, `enableInk: true`, `experimentalRobust: true`), rendering `<section data-testid="lab-gesture-diagnostics">` exclusively when `variant !== "diagnostics"`.
2. **Existing R18 Integration Pattern (`src/components/nui-lab/`):**
   - `r18/` holds standalone pure-TS candidate & feature modules (`ux1_candidates.ts`, `ux3_features.ts`, `ux3_model.ts`, `ux3_integrated.ts`).
   - `lab-analyzer.ts` (`594` lines) owns `LabAnalyzer`, `LabSnapshot`, `enableR18(model, nowMs)`, `disableR18(nowMs)`, and enforces all **5 reset/lock-loss cleanup hooks** (`setExperimentalMode`, missing `lm`, `acquisitionId !== lastAcquisition`, `reset()`, `resetHandLock()`).
   - `public/models/r18-ux3-model.json` stores exported weights fetched lazily on toggle.

---

## 2. Recommended R19 Lab Diagnostic Wiring (Additive, Non-Breaking)

When Owner authorizes an R19 NUI Lab evaluation PR on `main`:

1. **Copy Verified R19 Candidate Modules & Model Weight:**
   - Add standalone directory `frontend/implementation/src/components/nui-lab/r19/` containing:
     - `pistol_types.ts`, `pistol_geometry.ts`, `pistol_fsm.ts` (from `research-can/r19/candidates/`)
     - `r19_features.ts`, `r19_model.ts`, `r19_integrated.ts` (from `research-can/r19/candidates/` — updating import path to relative `../../../input/*` & `../../../candidates/ux1_candidates` inside app src)
   - Publish `public/models/r19-pistol-model.json` (`r19_model_mlp.json`, **`122,768 B` / `119.9 KB`**, `sha256` tracked in `r19/models/MODEL_CARD.md`).
2. **Extend `LabAnalyzer` (`lab-analyzer.ts`):**
   - Add `classifierMode` option `"r19"` alongside `"baseline" | "experiment" | "r18"` via `enableR19(model: R19ExportedModel, nowMs)` / `disableR19(nowMs)`.
   - Inside `analyse(lm, nowMs)` when `r19` active and `fullLock.status === "locked"`:
     - Construct `R19RuntimePipeline` lazily with current camera `this.aspect` (`re-instantiate if |r19Aspect - this.aspect| > 0.01`, matching existing R18 pattern).
     - Call `r19Pipe.step(lm, nowMs, revPose, palmCenter.x, palmCenter.y, palmScale)`.
     - Ensure `r19Pipe.reset()` runs on **every one of the 5 lifecycle paths** (`disableR19`, `setExperimentalMode`, `!lm`, `acquisitionId` change, `reset()` / `resetHandLock()`).
     - Fix direction readout formatting for R19 (`"Kiri+Lompat"`, `"Kanan+Lompat"`, `"Lompat"`, `"Kiri"`, `"Kanan"`, `"Netral (READY)"`, `"Netral (OTHER)"`) — avoiding R18's minor bug where `left+jump` collapsed to `"Kiri"`.
   - Expose read-only `r19` telemetry on `LabSnapshot`:
     - `state`: `"POINT_READY" | "POINT_PRESS" | "OTHER" | "NONE"`
     - `subClass`: `"ready" | "pistol" | "pinch" | "thumb-up" | "fist" | "two-fingers" | ...`
     - `probs`: `[P(POINT_READY), P(POINT_PRESS), P(OTHER)]`
     - `virtualKey`: `{ event: "KEYDOWN" | "HELD" | "KEYUP" | null, zone, left, right, jump, jumpFiredThisFrame }`
     - `guards`: `{ eraseActive, pinchActive, swipeAction }`
     - `latencyMs`: `r19` inference + FSM duration
3. **Extend `NuiLabPage.tsx` (Toggle & Diagnostics Panel Only):**
   - Add `data-testid="lab-r19-toggle"` ("Pistol R19 (Diagnostik)") beside `lab-r18-toggle`, fetching `/models/r19-pistol-model.json` on demand (zero cold-boot penalty when inactive).
   - Render `<dl data-testid="lab-r19-metrics">` displaying `Status Pistol` (`POINT_READY` aim-only vs `POINT_PRESS` virtual key active vs `OTHER`), `Probabilitas R19`, `Virtual Key Event` (`KEYDOWN`/`HELD`/`KEYUP`), `Arah & Lompat Diagnostik`, `Guard Pinch/Hapus/Swipe`, and clear badge **`Hanya diagnostik NUI Lab — gameplay siswa tidak diubah`**.
4. **Extend `lab-recorder.ts` (`TRUTH_LABELS`) for Physical Webcam Annotation:**
   - Currently `TRUTH_LABELS` lacks `POINT_READY` and `POINT_PRESS`. Adding `"POINT_READY"` and `"POINT_PRESS"` to `TRUTH_LABELS` lets the Owner record synchronized JSONL landmark + self-labeled ground-truth traces directly on `/nui-lab/gesture` for real-webcam recall/precision calibration.

---

## 3. Owner Physical Webcam Test Protocol Additions (R19 Pistol Extension)

In addition to Scenarios 1–5 in [`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`](../../docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md), Owner must verify these Pistol-specific scenarios on physical webcam before unlocking student gameplay:
- **Scenario 6 — `POINT_READY` Aim Idle (`60s`):** Hold index straight (`thumb` folded against palm) while panning `0°..180°` -> must show `POINT_READY`, **0** virtual keydowns, **0** Thinman walk/jump drift.
- **Scenario 7 — `POINT_PRESS` Deliberate Pistol & Quick Thumb-Tap:** Raise thumb out (`L-Sign`) while pointing Right/Left -> crisp `KEYDOWN` within ~`50 ms`, steady hold, immediate `KEYUP` on thumb fold (`POINT_READY`), Fist, or hand drop -> **0** stuck keys.
- **Scenario 8 — Dorsal Right-Hand Pointing Left (`O0/O1`):** Extend **right** arm horizontally across chest pointing **left** (`0° -> 180°`, back of hand facing camera) and tap thumb up/down -> must stay `"Kiri"` without `"two-fingers"` Redo, `"stop"` deadband, or false `"pinch"`.
- **Scenario 9 — `RIGHT -> RIGHT+JUMP -> RIGHT` Continuity:** Point Right with thumb open (`L-Sign`), tilt smoothly `~55–65°` without lowering horizontal aim -> must fire **1** jump per flick while holding `"Kanan"` continuously (`0` horizontal stop glitches, `0` bunny-hopping while tilted).
- **Scenario 10 — Canvas & Coexistence Negatives:** Perform `thumbs_up` (`OTHER`, `0` PRESS), `V-Sign` (`OTHER`, `0` PRESS), `Pinch` draw (`pinchActive`), and rest hand / hold pen (`0` false PRESS over `60s`).
