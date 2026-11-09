# REPORT.md — Executive Summary: Gesture UX Research

**Task:** t_f28bd927  
**Date:** 2026-08-26  
**Deliverables Path:** `.ops/research/gesture-ux/`

---

## Objective

Research best-practice gesture UX design for the existing MediaPipe hand-tracking drawing system in Sketchbook Universe v2. Produce verified recommendations for: (1) pre-pinch cursor feedback, (2) pinch thresholds and hysteresis, (3) a reliable undo gesture, (4) additional gestures (minimal), and (5) ergonomic/anti-false-positive measures.

No source code changes were made.

---

## Results Summary

### Q1 — Pre-Pinch Cursor

**Finding:** Show a small cursor dot at index fingertip (landmark 8) whenever hand is tracked but not pinching.

**Model:** Buxton's Three-State Input Model (1990) — State 1 = tracking (show cursor), State 2 = engaged (drawing). This is the established mental model for pen-like tools.

**Action required:** Expose `cursor: {x, y}` via `HandInputStatus` or a separate callback, and render an overlay dot in the game renderer. Use the smoothed cursor, not raw landmarks.

---

### Q2 — Pinch Thresholds

**Finding:** Current `threshold = 0.42` is too permissive (~2x too large). The normalization approach (thumb-index distance / wrist-to-middle-MCP span) is correct.

**Recommended values:**

| Parameter | Current | Recommended |
|-----------|---------|-------------|
| Pinch-close threshold | 0.42 (only) | **0.28** |
| Pinch-open threshold | none | **0.40** |
| Close debounce | 0 frames | **3 frames** |
| Open debounce | 0 frames | **4 frames** |

Hysteresis (separate close/open thresholds) prevents stroke stuttering from finger tremor near the engagement boundary.

---

### Q3 — Undo Gesture

**Recommendation: Left-hand closed fist, held for 400 ms.**

Rationale:
- Guiard's bimanual asymmetry model (1987): off-hand handles context/control; dominant hand handles precision drawing.
- Dwell requirement (400 ms ~= 12 frames at 30 fps) eliminates false positives from incidental fist clenches.
- Detectable with existing landmarks — no new classifier needed.
- Requires: `numHands: 2`, reading `result.handedness[i]` to route left vs. right hand.
- Visual feedback: a progress arc that fills during the dwell and cancels if fist releases early.

---

### Q4 — Additional Gestures

**Recommended addition:** None at this time. Clear canvas and submit should use UI buttons to avoid false positives on destructive actions.

Optional future addition: thumbs-up (right hand) for "submit/confirm" — deferred.

---

### Q5 — Ergonomics and Anti-False-Positive

- **Gorilla arm:** Expected in mid-air drawing; mitigate with short sessions and elbow-support UX guidance.
- **Minimum stroke filter:** Discard strokes with < 3 points or < 5 px arc length in `StrokeStore.endStroke()`.
- **Smoother:** Consider alpha ~0.50–0.55 for cursor dot (more responsive), keep 0.45 for stroke recording; or use two separate `PointSmoother` instances.
- **Cooldown after undo:** ~30 frames (~1 s) after triggering undo to prevent repeated triggers from sustained fist.

---

## Changed Files

**None — research-only task. No src/ modifications.**

---

## Validation

| Check | Result |
|-------|--------|
| src/ files read-only | PASS — no edits made |
| Citations verified | PASS — all academic citations have real DOIs; practitioner claims labeled as community consensus |
| Indonesian summary present | PASS — in RESEARCH_GESTURE_UX.md |
| Deliverables complete | PASS — 3 files in `.ops/research/gesture-ux/` and 3 files in `.ops/results/t_f28bd927/` |
| No fabricated test results | PASS |

---

## Unresolved Issues / Recommended Follow-up

1. **Pinch threshold empirical tuning:** The recommended values (0.28 close / 0.40 open) are derived from community data and literature ranges. Must be calibrated against real users with webcam during QA. The existing `threshold` parameter makes this easy to adjust.

2. **Handedness label inversion:** MediaPipe reports handedness assuming front-facing (selfie) camera. Our code mirrors X (`1 - tip.x`) — this should correctly invert the label such that MediaPipe's "Right" = user's physical right hand. Requires explicit QA confirmation.

3. **numHands: 1 -> 2:** Enabling 2-hand detection increases compute load. Should be profiled on target device (student laptop). GPU delegate already enabled which should absorb this.

4. **Left-hand fist false-positive rate:** Recommend pilot-testing with 3–5 students before finalizing dwell duration; 400 ms is a starting point.

5. **Overlay rendering architecture:** How the cursor dot is composited (separate `<canvas>` element vs. KAPLAY layer) is an implementation decision not resolved in this research.

---

## Evidence Paths

- Full report: `.ops/research/gesture-ux/RESEARCH_GESTURE_UX.md`
- Worker log: `.ops/research/gesture-ux/WORKER_LOG.md`
- Source files inspected: `implementation/src/input/mediapipe-input.ts`, `hand-gesture.ts`, `types.ts`, `smoothing.ts`
