# CAN Agent Session Checkpoint — 2026-11-18

This is a short portable handoff for switching Codex, Claude Code and Antigravity accounts. It is **not** a decision log. Always read root `AGENTS.md` and `contexts/can/AGENTS.md`, then check `git branch --show-current`, `git rev-parse HEAD` and `git status --short` before using this snapshot.

- Repository `lustresense/hitl-momo`. Working dir: `/srv/sketchbook/mediapipe-optimize/main-r19` (clone of `main`).
- **Current version:** `0.26.0-alpha` (bumped from 0.25.0-alpha by R19 integration).
- **Current task (2026-11-18):** R19 G4 Hybrid integration as SOLE NUI Lab engine. Owner mandate M-R19-01. All Baseline/R17/R18 UI toggles removed. Fail-closed model load. Lifecycle guards. Virtual keyboard diagnostics.
- **R19 engine:** `G1 Geometry + G3 MLP [82→96→48→3] + PistolVirtualKeyFSM`. Source from `research-can/r19/candidates/` (never merged — selective copy only).
- **Model:** `/models/r19-pistol-model.json` (122,768 B, sha256 `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293`).
- **R19 source files in main:**
  - `frontend/implementation/src/components/nui-lab/r19/` — engine modules (pistol_types, pistol_geometry, pistol_fsm, r19_safety_guards, r19_features, r19_model, r19_integrated, r19_loader)
  - `frontend/implementation/src/components/nui-lab/NuiLabPage.tsx` — sole R19 UI (1355 lines)
  - `frontend/implementation/src/components/nui-lab/lab-analyzer.ts` — R19 G4 Hybrid sole engine (1050 lines)
  - `frontend/implementation/app/nui-lab/{page,gesture/page,canvas/page,diagnostics/page}.tsx` — routes
  - `frontend/implementation/tests/nui-lab/` — 195/195 tests
- **Deleted:** `public/models/r18-ux3-model.json`, `src/components/nui-lab/r18/`
- **Test results:** `tests/nui-lab` 195/195 PASS; `tests/app/domain/prediction/events/config/api/manifest` 327/327 PASS; `tsc --noEmit` 0 errors; `lint` 0 new warnings; build 24/24 static pages.
- **Pre-existing failures:** 13 in `tests/input/tests/camera` (fist-erase/GPU baseline — REVISIONS R16-10, NOT caused by R19).
- **Webcam:** `NOT_TESTED`. Synthetic tests ≠ physical webcam evidence.
- **Scope strictly observed:** `app/level1..3`, `src/game/*`, `src/input/{gameplay-hand-driver,mediapipe-input,arbiter}.ts`, `backend/`, `contracts/`, `DECISIONS.md`, `SOUL.md` — NOT TOUCHED.
- **Git:** committed to `main` as `0.26.0-alpha`. See root `CHANGELOG.md` for SHA.
- **Next QA:** Owner physical webcam test for pistol gesture. Verify RIGHT→RIGHT+JUMP→RIGHT continuity. Test dorsal (back-of-hand facing camera, right hand pointing left).
- **research-can:** source-only branch, never merged into main. R19 R&D docs remain on that branch.
- **Open:** Physical webcam test; potential Playwright E2E browser QA (script at scratch dir); DimHand dataset integration (future R19 iteration if needed).
