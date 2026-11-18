# NUI Lab R18-UX3 live webcam pilot — handoff for Ujang

**Date:** 2026-11-18 WIB  
**Source:** \`research-can@664de0382b5164818a5c22fe79029c8e3c8ba4a1\`, R18 candidate \`ux3-ipn-mlp-hybrid\`  
**Target:** main-based feature branch \`nui-r18-ux3-live-lab\`. **Do not merge orphan research-can history.**  
**Evidence class for this port:** \`STATIC_ONLY / NOT_TESTED\` on target build, hardware webcam and tunnel until Ujang verifies.  
**Scope:** isolated diagnostics page \`/nui-lab/r18\` only. No gameplay, Canvas Lab gesture routing, backend, Dashboards, model training, or production NUI replacement.

## What is implemented in this candidate branch

- A new entry in \`/nui-lab\` leading to \`/nui-lab/r18\`.
- Copy of trained R18 MLP weights (\`123141\` bytes) to \`public/models/r18-ux3-model.json\`; copy of pure TypeScript R18 features/model, UX1 guards/FSM, and R18 UX3 integrated pipeline to \`src/components/nui-lab/r18/\`. Original sandbox imports adapted to main's \`@/src\` alias.
- R18 live diagnostic pilot that uses the **existing** MediaPipe HandLandmarker, isolated per-camera FullFrameHandLock, current frame-source and inference scheduler, and R18 \`Ux3RuntimePipeline\`. The same locked camera landmark frames are sent to baseline R17 heuristic and trained R18 model. Display shows candidate gesture class/confidence, lock state, hypothetical pinch/erase/swipe/virtual-key actions, FPS and timing.
- **Important:** hypothetical R18 actions are DISPLAY ONLY. They do not erase ink, move Thinman, issue Undo/Redo, write logs/database, or touch game mappings. The existing \`/nui-lab/gesture\` and \`/nui-lab/canvas\` keep their behavior.
- The RAW / AUTO / CLAHE controls use **existing** \`frame-source\` modes. **UX2 M3 RAW-first sticky recovery is NOT integrated** and the UI labels that limitation.
- **DimHand data were not used to train UX3.** The dataset site requires an application and academic, noncommercial, no-redistribution commitment. Do not claim this pilot solves 0.1–10 lux cases or uses DimNet.

## Mandatory Ujang verification BEFORE merge/deploy

1. In a **separate checkout/worktree** of \`nui-r18-ux3-live-lab\`, run \`npm ci\`, \`npm run typecheck\`, \`npm run lint\`, targeted Vitest, and \`NEXT_PUBLIC_TEST_HOOKS=0 npm run build\` from \`frontend/implementation\`. Compare against \`main\` baseline and correct type errors, imports, asset paths or regressions before any merge. No PASS claim until commands run.
2. Check \`/nui-lab\` and \`/nui-lab/r18\` from built web output and verify \`/models/r18-ux3-model.json\` exists and browser loads it without cross-origin fetch or wrong MIME. The model must not load on ordinary student/game routes.
3. With **real webcam** verify camera ON/OFF cleanup and permission failures; baseline R17 vs R18 labels on same locked hand; FIVE and THREE, pinch near/touch, open-palm idle, deliberately controlled Undo/Redo-like swipes, hand loss/reacquire, other hands/crossing, no-hand object distractors, ceiling/back/side lighting, dim and near-skin-color background. Track not just detection percentage but unintended action/minute and delayed release. Do not collect video or identifying data automatically.
4. Time cold load, MediaPipe delegate, effective detection FPS, p95 latency, frame-time stutter and memory on target device. CPU-only simulation in prior R18 report yielded 12.59 FPS and 2057 long tasks, so do not infer webcam readiness from a tiny MLP model.
5. Until proven stable, leave model actions as **shadow-only**. Do not connect \`ux3Output\` to actual game or canvas actions. Design and new thresholds remain candidate R&D.
6. Make a scoped feature PR to \`main\` after tests, reconcile \`VERSION\`, global technical \`CHANGELOG.md\`, related CAN NOW/REVISIONS/handoff under existing root SOP and obtain Owner's permission for merge/deploy. Main and active tunnel are **not changed by this candidate branch**.

## Known risks

- \`P1F/P2F\` false swipes remain in offline R18 evidence; \`N0_raw\` repeated identical frames can create false erase.
- IPN HandS lacks a static FIVE class; five-finger erase is guarded by a geometric rule plus MLP veto.
- Adaptive CLAHE M3 may improve miss recovery but can raise p95 latency; not in this pilot.
- Browser physical webcam not yet tested here. DimHand access not obtained. The reported offline test accuracy 0.8045/macro-F1 0.6156 is not physical camera accuracy.

## Links

- [R18 model card](https://github.com/lustresense/hitl-momo/blob/research-can/r18/models/MODEL_CARD.md)
- [R18 report](https://github.com/lustresense/hitl-momo/blob/research-can/r18/results/R18_MASTER_REPORT.md)
- [Physical camera test protocol](https://github.com/lustresense/hitl-momo/blob/research-can/docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md)

No claim of build PASS, camera PASS or deployment is made by this handoff.
