RECOVERY TASK — Direct-Edit Violation Remediation

CONTEXT:
Parent Ujang (orchestrator) violated the coding ban by making direct implementation edits during previous session. These edits MUST be fixed/reverted/refactored by AGY worker, not by orchestrator.

FILES MODIFIED BY ORCHESTRATOR (capture via inspection):
1. `src/game/behavior-spawner.ts` — planSpawn: fixed topY calculation (GROUND_Y_OFFSET/GROUND_THICKNESS hoisting), added spawnPlan validation
2. `src/domain/levels.ts` — providerVocabulary: filtered to only behaviors with defined behaviorResolver; STAGE_1 objectBehavior entries updated
3. `src/game/kaplay-runtime.ts` — destroy(): fixed kaplayInstance reference to k.quit(); added console.error debug logging; fixed kaplay initialization logic
4. `src/game/entities/level-props.ts` — addPlayer: added missing PlayerObj properties (area, body, anchor, scale)
5. `debug-e2e.mjs` — created new debug script (should be removed or moved to proper location)
6. `.ops/TASK_BOARD.md` — updated dev server task to PASS (operational state, acceptable)

CURRENT VERIFIED STATE:
- Typecheck: PASS (tsc --noEmit)
- Unit tests: PASS (npm run test)
- Build: PASS (static export to out/)
- Dev server: runs on port 3000, serves HTML
- E2E test: FAILS (exit 1 or timeout 124s) — root cause unknown, minimal output
- Playwright Chromium installed at `/home/agentops/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`
- No xvfb for virtual display

OBJECTIVE:
Fix/revert/refactor the 4 implementation files to correct working state that:
- Passes typecheck, tests, build
- Makes E2E test pass (hand-tracking + canvas + MediaPipe load + hand detection)
- Removes debug-e2e.mjs or relocates properly
- Maintains architectural invariants (React passes resolved behavior only, no raw rank-1 output)

CONSTRAINTS:
- DO NOT modify: package.json, tsconfig, playwright config, e2e/run.mjs (unless absolutely necessary with justification)
- DO NOT modify: .ops/TASK_BOARD.md, CHANGELOG.md, WORKING_CONTEXT.md (orchestrator owns these)
- MediaPipe hand-tracking must work in browser (CDN load, window.HandLandmarker available)
- Kaplay canvas must initialize and render game entities
- Spawn planning must match behaviorResolver mappings

VERIFICATION (orchestrator will run independently after worker finishes):
1. `npm run typecheck` — PASS
2. `npm run test` — PASS
4. `npm run build` — PASS
4. Start dev server on port 3210, run E2E: `EDGE_PATH=... E2E_PORT=3210 E2E_HEADLESS=1 node e2e/run.mjs` — PASS (exit 0)
5. Manual browser check: MediaPipe loads, canvas renders, hand detection triggers

WORKER ARTIFACTS REQUIRED (write to .ops/results/TASK-RECOVERY-20260825-001/RUN-001/):
- WORKER_LOG.md — chronological log of inspection, commands, edits, validations
- WORKER_CHANGELOG.md — files changed/created/deleted, reasons, known limitations
- REPORT.md — objective, result, changed files, verification performed, pass/fail, unresolved issues

DONE CRITERIA:
All 4 verification steps PASS. Worker artifacts complete. No new direct edits by orchestrator.