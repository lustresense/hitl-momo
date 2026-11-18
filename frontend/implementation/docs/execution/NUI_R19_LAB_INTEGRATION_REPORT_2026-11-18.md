# NUI R19 G4 Hybrid — Lab Integration Report

**Date:** 2026-11-18  
**Version:** 0.26.0-alpha  
**Branch:** `main` (commit TBD — see CHANGELOG.md)  
**Source R&D:** `research-can/r19/candidates/`  

---

## 1. Engine

**R19 G4 Hybrid = G1 Geometry + G3 MLP + PistolVirtualKeyFSM**

| Component | Description |
|---|---|
| G1 Geometry | Pure geometry pistol detector (threshold-based, no WASM dependency) |
| G3 MLP | Multilayer perceptron [82→96→48→3], softmax output: `POINT_READY` / `POINT_PRESS` / `OTHER` |
| PistolVirtualKeyFSM | FSM mapping pose → virtual key: `LEFT`, `JUMP`, `RIGHT`, `UP_RIGHT`, `UP_LEFT`, `DOWN` |

**Model file:** `public/models/r19-pistol-model.json`  
**Size:** 122,768 bytes  
**SHA-256:** `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293`

---

## 2. Pistol Gesture Contract

| Pose | Output |
|---|---|
| Index finger extended, thumb folded | `POINT_READY` (no movement) |
| Index finger extended, thumb open | `POINT_PRESS` (key active) |
| Thumb folded back | Release |
| Finger pointing RIGHT | `RIGHT` (walk right) |
| Finger pointing LEFT | `LEFT` (walk left) |
| Finger pointing UP | `JUMP` |
| Finger pointing UP+RIGHT | `RIGHT` + `JUMP` |
| Finger pointing UP+LEFT | `LEFT` + `JUMP` |
| Finger pointing DOWN | `DOWN` (neutral) |
| Hand lost | Release all keys |

---

## 3. Routes

| Route | Implementation | Notes |
|---|---|---|
| `/nui-lab` | `app/nui-lab/page.tsx` (client) | Landing, passive camera API readiness, no `getUserMedia` on mount, nav to gesture + canvas |
| `/nui-lab/gesture` | `app/nui-lab/gesture/page.tsx` → `<NuiLabPage variant="gesture" />` | Full R19 diagnostics, virtual keyboard Left/Jump/Right |
| `/nui-lab/canvas` | `app/nui-lab/canvas/page.tsx` → `<NuiLabPage variant="canvas" />` | R19 pinch draw, 5-finger erase, swipe undo/redo, pistol read-only |
| `/nui-lab/diagnostics` | `app/nui-lab/diagnostics/page.tsx` → `<NuiLabPage variant="gesture" />` | Alias to gesture lab (no server redirect, static export compatible) |

---

## 4. Files Changed

### Added
- `src/components/nui-lab/r19/pistol_types.ts`
- `src/components/nui-lab/r19/pistol_geometry.ts`
- `src/components/nui-lab/r19/pistol_fsm.ts`
- `src/components/nui-lab/r19/r19_safety_guards.ts`
- `src/components/nui-lab/r19/r19_features.ts`
- `src/components/nui-lab/r19/r19_model.ts`
- `src/components/nui-lab/r19/r19_integrated.ts`
- `src/components/nui-lab/r19/r19_loader.ts`
- `public/models/r19-pistol-model.json` (122,768 B)
- `tests/nui-lab/r19-loader.test.ts` (8 tests)
- `tests/nui-lab/r19-pistol-e2e.test.ts` (12 tests)
- `docs/execution/NUI_R19_LAB_INTEGRATION_REPORT_2026-11-18.md` (this file)

### Modified
- `src/components/nui-lab/NuiLabPage.tsx` — R19 sole engine, all R17/R18 toggles removed
- `src/components/nui-lab/NuiLabPage.css` — R19 UI styles
- `src/components/nui-lab/lab-analyzer.ts` — R19 G4 Hybrid sole engine
- `src/components/nui-lab/lab-metrics.ts` — R19 metrics
- `src/components/nui-lab/lab-recorder.ts` — R19 recording
- `app/nui-lab/page.tsx` — R19 landing
- `app/nui-lab/gesture/page.tsx`
- `app/nui-lab/canvas/page.tsx`
- `app/nui-lab/diagnostics/page.tsx`
- `tests/nui-lab/lab-analyzer.test.ts`
- `tests/nui-lab/lab-r17-e2e.test.ts`
- `tests/nui-lab/lab-recorder.test.ts`
- `tests/nui-lab/lab-rig.ts`
- `tests/nui-lab/nui-lab-page.test.tsx`

### Deleted
- `public/models/r18-ux3-model.json`
- `src/components/nui-lab/r18/ux1_candidates.ts`
- `src/components/nui-lab/r18/ux3_features.ts`
- `src/components/nui-lab/r18/ux3_integrated.ts`
- `src/components/nui-lab/r18/ux3_model.ts`

---

## 5. Test Results

| Suite | Files | Tests | Status |
|---|---|---|---|
| `tests/nui-lab` | 14 | **195/195** | ✅ PASS |
| `tests/app/domain/prediction/events/config/api/manifest` | 48 | **327/327** | ✅ PASS |
| `tests/input/tests/camera` | — | 13 fail | ⚠️ PRE-EXISTING (fist-erase/GPU baseline, NOT R19 regression) |

**TypeScript:** `tsc --noEmit` → exit 0  
**Lint:** `npm run lint` → exit 0, 0 new warnings (pre-existing: `GestureRing.tsx:128` react-hooks/exhaustive-deps)  
**Build:** `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` → exit 0, **24/24 static pages**

---

## 6. What Was NOT Changed

- `app/level1`, `app/level2`, `app/level3` — student gameplay routes
- `src/game/*` — KAPLAY game runtime
- `src/input/gameplay-hand-driver.ts`, `mediapipe-input.ts`, `arbiter.ts` — game input
- `backend/` — backend server
- `contracts/` — partner contracts
- `DECISIONS.md`, `SOUL.md` — governance documents

---

## 7. Files Excluded from Commit

| File/Category | Reason |
|---|---|
| `research-can/` branch | Source-only, never merged. R&D branch remains separate. |
| R18 model weights (deleted) | Superseded; not needed |
| `.next/` cache | Build artifact, not in git |
| Raw dataset (not in repo) | Never existed in main |
| `out/` static output | Generated artifact |

---

## 8. Known Limitations

| Issue | Status |
|---|---|
| Physical webcam test | **NOT_TESTED** — must be validated by Owner on real device before presentation |
| RIGHT→RIGHT+JUMP→RIGHT horizontal continuity | Synthetic test only; physical validation pending |
| Dorsal (back-of-hand facing camera, right hand pointing left) | Synthetic test only |
| `tests/input/tests/camera` 13 failures | Pre-existing baseline (fist-erase/GPU), NOT caused by R19 |

---

## 9. Next Actions

1. **Owner:** test physical webcam with pistol gesture on actual device
2. Validate `RIGHT → RIGHT+JUMP → RIGHT` continuity (no unintended bunny-hop)
3. Test dorsal: right hand, back facing camera, pointing left
4. If webcam test reveals issues: iterate on `pistol_geometry.ts` thresholds
5. Update `NOT_TESTED` → `PASS` in this report when physical webcam confirmed
