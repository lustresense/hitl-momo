# CAN frontend implementation SOP

For Claude Code, Codex, Antigravity or any agent, start from **root `AGENTS.md`** and explicitly read `contexts/can/AGENTS.md`, including every mandatory bootstrap source it names. Do not assume nested files are loaded automatically.

Then read the CAN-approved product decisions (`contexts/can/DECISIONS.md`), `contexts/can/NOW.md`, `contexts/can/REVISIONS.md`, `contexts/can/SESSION_HANDOFF.md`, `docs/execution/ARCHITECTURE_ACTUAL.md`, `docs/execution/RUN_GUIDE.md`, and task-relevant actual code/tests. Use repository-root-relative paths for CAN contexts.

## Implementation invariants

- Visual system (orange/green, dots, outlines, shadows) remains Owner-governed. Do not redesign without the latest explicit Owner authorization.
- Frontend displays model Top-3/confidence, HITL choices and gameplay. DIAS owns classifier/model, backend/database, admin and training. Never fabricate REAL prediction, API, logs, database or dashboard.
- Keep the gesture-mode router, camera permissions/lifecycle, fallback pointer and guarded UI. NUI tests with synthetic landmarks are NOT proof of real webcam accuracy or robustness. Keep existing `data-testid` identifiers and only enable `NEXT_PUBLIC_TEST_HOOKS=1` for tests.
- For relevant work run `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`, and relevant `e2e/` flows, then real camera tests when hardware is available. Report blocked gates instead of invented PASS.
- Audit-only requests must not edit. Editing, commit, push, merge and deploy are separate permissions. Ujang owns installation/deployment unless the user explicitly changes this. A branch instruction from a historical session is not current permission.

After changes reconcile task-relevant CAN mandates, REVISIONS, NOW/WORKING_CONTEXT, handoff, architecture/run guide, root VERSION/CHANGELOG per root SOP. Product `DECISIONS.md` only changes through explicit Owner approval.
