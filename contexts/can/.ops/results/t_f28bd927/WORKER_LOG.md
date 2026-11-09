# Worker Log — Gesture UX Research for MediaPipe Hands
**Task ID:** `t_f28bd927`  
**Card Title:** `[Riset] Gesture UX untuk drawing MediaPipe — cursor preview, pinch threshold, undo gesture`  
**Worker:** Antigravity (AGY)  
**Date:** 2026-08-26  

---

## 1. Context & Task Intake
- Checked task brief from Kanban board and card prompt for `t_f28bd927`.
- Objective: Comprehensive, scientifically grounded UX research report on hand-tracked drawing gestures using MediaPipe Hands (`@mediapipe/tasks-vision` 0.10.x).
- Scope constraints: Read-only on `src/` — NO implementation/code changes to application files. Research and engineering specifications only.
- Output locations:
  - `/srv/sketchbook/Sketchbook-Universe-v2/.ops/research/gesture-ux/`
  - `/srv/sketchbook/Sketchbook-Universe-v2/.ops/results/t_f28bd927/`

---

## 2. Codebase & State Inspection
- Inspected baseline gesture implementation files:
  - `implementation/src/input/hand-gesture.ts`: Found provisional single threshold ($0.42$) without hysteresis, index tip mirroring, and absence of hover pre-pinch cursor.
  - `implementation/src/input/mediapipe-input.ts`: HandLandmarker video detection loop, frame processing, tracking-lost handlers.
  - `implementation/src/input/smoothing.ts`: Found simple fixed Exponential Moving Average (EMA) with $\alpha = 0.45$.
  - `implementation/src/input/index.ts`: DrawingSurface orchestration, canvas rendering, high-DPI scaling, basic stroke store.
  - `implementation/src/components/drawing/DrawingScreen.tsx`: UI layout, Momo dialogue cues, fallback handling.
  - `implementation/package.json`: Confirmed `@mediapipe/tasks-vision` version `^0.10.14`.

---

## 3. Academic & Technical Research Execution
- Conducted targeted literature searches across peer-reviewed HCI venues (ACM CHI, UIST, INTERACT) and computer vision archives:
  - **Zhang et al. (2020)**: MediaPipe Hands architecture, 21 anatomical landmark definitions, palm detection + landmark regression pipeline.
  - **Buxton (1990)**: Three-State Model of Graphical Input (State 0: Out-of-range, State 1: Hover/Tracking, State 2: Engaged/Inking) applied to mid-air hover preview.
  - **Jota et al. (2013) & Vogel & Balakrishnan (2005)**: Direct-touch and mid-air pointing latency bounds ($< 30\text{ ms}$ for direct manipulation), targeting accuracy without tactile resistance.
  - **Casiez, Roussel, & Vogel (2012)**: 1€ Filter (One Euro Filter) formulation for speed-adaptive cutoff filtering to eliminate jitter without inducing high-speed lag.
  - **Hincapié-Ramos et al. (2014)**: Consumed Endurance metric for arm fatigue ("Gorilla Arm" effect) and mitigation strategies.
  - **Guiard (1987), Wobbrock et al. (2009), Piumsomboon et al. (2013), Jacob (1990)**: Bimanual kinematic chain, user-defined gesture elicitation, AR gestures, and Midas Touch avoidance for destructive actions.

---

## 4. Synthesis & Deliverables Production
- Formulated the exact normalized pinch metric using Carpal/Metacarpal baseline ($L_0 \to L_9$) and Schmitt trigger hysteresis ($D_{close} \le 0.35$, $D_{open} \ge 0.52$).
- Conducted multi-criteria trade-off analysis of 4 undo gesture candidates, selecting Single-Hand V-Sign with 400ms dwell confirmation.
- Formulated 1€ Filter configuration parameters ($f_{c,min} = 1.0\text{ Hz}$, $\beta = 0.008$) and stroke debounce rules ($T_{min} \ge 80\text{ ms}$, $L_{min} \ge 6\text{ px}$).
- Wrote full Indonesian executive summary and English technical analysis in `RESEARCH_GESTURE_UX.md`.
- Wrote executive summary in `REPORT.md`.
- Synchronized all artifacts to both `.ops/research/gesture-ux/` and `.ops/results/t_f28bd927/`.

---

## 5. Verification & Final Status
- Checked deliverables against all 5 research focus areas in the prompt.
- Verified 100% of citations are authentic with proper author names, years, DOIs, and venues.
- Confirmed zero edits were made to `src/` or runtime application files.
- Status: COMPLETE (Ready for Orchestrator review).
