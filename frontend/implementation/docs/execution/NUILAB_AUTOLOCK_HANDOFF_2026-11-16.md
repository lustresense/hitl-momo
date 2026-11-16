# Handoff NUI Lab Auto-Lock & Gesture Observability (0.22.0-alpha)

Tanggal: 16 November 2026 WIB  
Source: branch `main` at the new versioned commit, Owner mandate M-039.  
Evidence: `STATIC_ONLY / NOT_TESTED` for repository build, browser, webcam, model, and tunnel.

## Target UX

MediaPipe Hand Landmarker remains the **only hand landmark detector**. No custom model, biometric identity, face authentication, or fingerprint. In NUI Lab (`/nui-lab/gesture` and `/nui-lab/canvas`):
- One valid hand seen for consecutive inference frames is auto-acquired anywhere inside the frame; cursor can appear even when no pinch.
- Lost hand causes cursor and new actions to stop. If two sampled no-hand frames span at least 300 ms (prototype), the old owner is released. A single stable new candidate is acquired automatically; no manual button required.
- As long as a different hand remains in frame after the owner disappears, never silently promote it. With overlapping candidates ambiguity freezes input until matching track returns; manual select/relock remains optional escape hatch.
- After **new ownership epoch**, old line and gesture hold state are reset. A fresh pose release is necessary before a new draw/erase/undo/redo command. A short recoverable dropout of the same track retains continuity only within the existing stroke jump limit.
- No extra image data recorded by default. Diagnostics show ratios/reasons, not model-probabilities.

## Files changed

- `src/components/nui-lab/lab-hand-lock.ts`: auto-empty release, temporal acquisition, validation, ambiguity and epoch increments.
- `src/components/nui-lab/lab-analyzer.ts`: ownership action gate, A/B classifier, pinch ratio/finger state/last rejection telemetry.
- `src/components/nui-lab/NuiLabPage.tsx`: diagnostics panel, experimental/baseline toggle, simpler lock messaging.
- `src/components/nui-lab/lab-metrics.ts`: fist is diagnostic, not eraser.
- `src/input/hand-gesture.ts` and `src/input/hand-stroke-pipeline.ts`: optional experimental classifier and action guard, *default game behavior unchanged*.
- Synthetic Vitest files extend coverage for auto reacquire, fresh pinch, rotated/near-straight third finger, false takeover and crowd.

## Prototype parameters, not product conclusions

- Empty reset `LAB_EMPTY_RESET_MS=300` and ≥2 empty frame observations.
- New candidate confirmation `LAB_ACQUIRE_FRAMES=2`; geometry still references `MAX_JUMP=0.18`, size ratio `1.7`, presence/loss `LOCK_LOST_MS=600`.
- Existing normal pinch enter/exit `0.42 / 0.55`. Folded-index baseline `0.15 / 0.20`. Lab experimental folded-index pinch `0.20 / 0.27`.
- Experimental almost-straight ring rule requires minimum interior PIP angle `154°` and tip-to-wrist distance `> 1.02× PIP-to-wrist`.
- No reliability/accuracy improvement has been measured yet. The experimental mode can be turned OFF at runtime to compare the strict baseline.

## Do not change while testing

- Existing product mapping remains pinch Coret, **five-finger** palm Hapus, one-finger Undo, two-fingers Redo; fist never erases.
- Undo/Redo **swipe** has not been selected, therefore not implemented.
- Student game/default classifier continues to use the legacy rules; the experimental enhancements apply to NUI Lab only.
- P3 local opt-in dataset collection, model retraining, and offline benchmark remain future work. Do not download HaGRID/IPN videos into student frontend.

## Ujang QA (mandatory before calling these fixes good)

1. Back up local changes, fetch/pull `main` safely, verify `VERSION=0.22.0-alpha`.
2. From root: `python3 scripts/bump_version.py --check`.
3. From `frontend/implementation`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`.
4. Smoke test deep links `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics` on HTTPS tunnel, direct refresh.
5. Use real RGB webcam: camera OFF/ON 10x, single hand left/right/top/bottom and in front of face; one-frame dropout; empty-camera >300 ms; hand returning far away; second/background hand persists; cross-hands; blank->two hands; pinching during fresh acquisition, release then pinch; 3 slightly bent fingers/hand rotation, false fist/false palm, high-speed strokes, and lowlight/backlight.
6. Compare baseline vs experimental on **same recorded test conditions** (consent and local retention if video used). Record first-cursor time, false hand takeover, erasure mistakes, false pinch/three, stroke jumps, p50/p95 inference, CPU busy, and bundle size.
7. Report PASS/FAIL per case, SHA, screenshots (no personal data), console errors, actual URL and deploy status. Do not treat unit or browser screenshots as `REAL_MODEL` evidence by themselves.

## Evidence from the implementation chat

- Direct V8 evaluation of proposed hand-lock class after TypeScript annotation removal: **12/12 synthetic scenarios PASS** in this session; this does not execute Vitest, typecheck, Next build or real MediaPipe in Chromium.
- New Vitest regression source created but not executed locally. GitHub connector cannot run Node/npm or access a physical webcam.
- No model `.task` modified; no raw hand data collected; no new data training.
