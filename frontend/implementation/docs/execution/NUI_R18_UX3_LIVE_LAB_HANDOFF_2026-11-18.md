# NUI Lab UX3 pilot, handoff to Ujang

**Scope** Existing `/nui-lab/gesture` and `/nui-lab/canvas` only. No new R18 route.  
**Status** Source on PR #6, NOT_TESTED in build/browser/physical webcam.  
**Model** `research-can@664de03`, trained on IPN HandS, NOT DimHand.

## Code changes
- R18 MLP JSON and supporting TS candidate code ported into NUI Lab only.
- `NuiLabPage` switches between the existing baseline, R17 and R18 modes. The same webcam, lock and `LabAnalyzer` are reused.
- Gesture Lab shows classifier predictions, confidence, and action gates. Canvas Lab uses R18 safety gates for pinch / five-finger erase and the R18 swipe candidate; old R17 and baseline still work.
- Thinman virtual-key output is diagnostic only. Gameplay/student routes, model and backend unchanged. UX2 adaptive RAW-first M3 was not ported.
- No access to DimHand, no claims of physical-camera or build success.

## QA and deployment contract
1. Checkout PR #6 branch in isolated worktree. Ensure no `/nui-lab/r18` route exists.
2. Run `npm ci`, `npm run typecheck`, relevant Vitest, lint and `npm run build`; compare baseline failures.
3. Browser-test existing `/nui-lab/gesture` and `/nui-lab/canvas`; toggle baseline/R17/R18, verify actual MLP JSON network load, probability changes, camera ON/OFF, hand lock/reacquire.
4. In Canvas Lab test real drawing/erasing/undo-redo with same camera, switch modes safely; measure false actions, latency and FPS; do not confuse diagnostics-only with gameplay.
5. If verified, update versioning/changelog per main SOP, merge PR #6, backup deployment, pull/build on VM, verify **existing tunnel** and its original NUI routes. Do not modify student gameplay or create a separate tunnel.
6. Report commit, actual test commands and exit codes, existing tunnel URL, rollback and NOT_TESTED cases.
