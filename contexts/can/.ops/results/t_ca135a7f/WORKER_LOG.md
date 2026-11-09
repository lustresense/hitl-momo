# Worker Log — Gesture UX Upgrade Implementation
**Task ID:** `t_ca135a7f`  
**Card Title:** `[Implement] Gesture UX upgrade — cursor preview, pinch hysteresis, V-sign undo, 1€ Filter`  
**Worker:** Antigravity (AGY)  
**Date:** 2026-08-26  

---

## 1. Context & Task Intake
- Intake from Kanban task board for task `t_ca135a7f`.
- Read approved research specification: `.ops/research/gesture-ux/RESEARCH_GESTURE_UX.md` from prior research task `t_f28bd927`.
- Requirements:
  1. Pre-pinch cursor preview: HOVER green reticle ($r=6\text{px}$ `#2e7d32` $\alpha=0.7$) at index fingertip L8 + contracting proximity ring ($r=14\to 6\text{px}$); DRAWING solid dot ($r=4\text{px}$ `#23324d`). Buxton 3-state model.
  2. Pinch hysteresis: $D_{pinch} = \|P_4 - P_8\|_2 / \|P_9 - P_0\|_2$ in 2D normalized space; close $\le 0.35$, open $\ge 0.52$.
  3. Undo: Single-hand V-sign gesture (L8 + L12 extended, L16 + L20 curled, $D_{pinch} > 0.60$) held 400ms with circular dwell gauge -> undo last stroke. `numHands` stays 1.
  4. Replace EMA filter with 1€ Filter (One Euro Filter: $f_{c,min}=1.0\text{Hz}$, $\beta=0.008$, $f_{c,d}=1.0\text{Hz}$).
  5. Debounce: discard strokes $<80\text{ms}$ AND $<6\text{px}$; tracking-loss grace buffer 100ms.
  6. Disciplinary Scope: Canvas clear and submit remain strictly on on-screen UI buttons (never bound to mid-air gestures).

---

## 2. Implementation Execution

### Step 1: 1€ Filter (One Euro Filter)
- File: `src/input/smoothing.ts`
- Implemented `OneEuroFilter` according to Casiez, Roussel, & Vogel (CHI 2012) with speed-adaptive cutoff:
  - Low-pass derivative filter with cutoff $f_{c,d} = 1.0\text{ Hz}$.
  - Adaptive cutoff $f_c = f_{c,min} + \beta \cdot \text{speed}$ with $f_{c,min} = 1.0\text{ Hz}$ and $\beta = 0.008$.
  - Low-pass position filter with dynamic $\alpha(dt, f_c)$.
  - Backward-compatible `PointSmoother` subclass/wrapper.

### Step 2: Landmark Math & Pinch Hysteresis State Machine
- File: `src/input/hand-gesture.ts`
- Implemented anatomically normalized pinch distance $D_{pinch} = \|P_4 - P_8\|_2 / \max(\|P_9 - P_0\|_2, 10^{-5})$.
- Built `HandGestureStateMachine` with:
  - Buxton 3-State Model: `lost` (State 0), `hover` (State 1), `drawing` (State 2), `undo-pending`, `undo-triggered`.
  - Schmitt Trigger Hysteresis: enters inking at $D_{pinch} \le 0.35$, exits at $D_{pinch} \ge 0.52$, deadband $\Delta = 0.17$ prevents edge jitter.
  - Continuous feedforward proximity calculation for hover: $0.0$ (far) to $1.0$ (ready to pinch).
  - V-sign detection ($y_8 < y_6$, $y_{12} < y_{10}$, $y_{16} > y_{14}$, $y_{20} > y_{18}$, $D_{pinch} > 0.60$, finger gap $\ge 0.18 \times S_{palm}$) with 400ms dwell confirmation and single-fire lock per hold.

### Step 3: Stroke Store Debounce
- File: `src/input/types.ts`
- Added stroke start timestamping and duration tracking to `StrokeStore`.
- Implemented Euclidean cumulative path length calculation.
- Implemented micro-tap debounce rule: discards strokes with duration $< 80\text{ms}$ AND path length $< 6\text{px}$.
- Extended `HandInputStatus` type union with `hover`, `undo-pending`, and `undo-triggered`.

### Step 4: MediaPipe Driver Upgrade & Tracking-Loss Grace Buffer
- File: `src/input/mediapipe-input.ts`
- Swapped fixed EMA smoother for `OneEuroFilter`.
- Integrated `HandGestureStateMachine`.
- Implemented 100ms tracking-loss grace buffer: temporary camera tracking drops ($\le 100\text{ms}$) hold active stroke state rather than prematurely severing ink or triggering jump lines.
- Handled `undo-triggered` events to invoke `store.undo()`.
- Added `onFrame` callback to stream cursor position, state, proximity, and dwell progress to the surface orchestrator.

### Step 5: Buxton 3-State Cursor Preview & Dwell Gauge Rendering
- File: `src/input/index.ts`
- Updated `DrawingSurface`:
  - Hover State: Green reticle ($r=6\text{px}$, `#2e7d32`, $\alpha=0.7$, line width 2px) + dynamic contracting proximity ring ($r=14\to 6\text{px}$, $\alpha=0.4$, line width 1.5px).
  - Drawing State: Solid compact dot ($r=4\text{px}$, `#23324d` filled).
  - Undo State: Green reticle + circular dwell gauge track ($r=16\text{px}$) and active progress arc ($-\pi/2 \to -\pi/2 + 2\pi \cdot \text{undoProgress}$, line width 3px).
  - Updated test injection hook `feedHandLandmarksForTest` to handle gesture states, smoothing, and undo triggers.

### Step 6: UI Chip & Feedback Alignment
- File: `src/components/drawing/DrawingScreen.tsx`
- Updated `cameraChipText` to provide informative status for `hover`, `drawing`, `undo-pending`, and `undo-triggered`.

---

## 3. Verification & Validation
- **TypeScript Check**: `npm run typecheck` — 0 errors.
- **Unit Tests**: `npm run test` — 10/10 test files passed, 76/76 tests passed (including 17 comprehensive hand gesture tests).
- **Production Build**: `npm run build` — Next.js 14 static export build completed cleanly (code 0).
- **Playwright E2E**: `npm run e2e` — 19/19 checks passed (exit code 0).
- **Visual & Full Flow QA**: `node e2e/qa-visual-verify.mjs` — 31/31 checks passed, 0 failures.

---

## 4. Final Status
- Status: **COMPLETED (PASS)**.
- All deliverables generated in `.ops/results/t_ca135a7f/`.
