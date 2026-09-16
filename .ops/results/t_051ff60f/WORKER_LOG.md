# Worker Log - Task t_051ff60f

## Context & Inspection
- **Objective:** Run `npm run e2e` on Linux, diagnose and fix failing tests.
- **Initial Inspection:** Checked `implementation/package.json` for e2e script. E2E runs via `node e2e/run.mjs` using Playwright Chromium headless.
- **Initial Test Run:** Ran `npm run e2e`.
  - **Result:** Failed with `Timeout 20000ms exceeded` waiting for `[data-testid=outcome-overlay]`.

## Debugging: Timeout on outcome-overlay
- **Diagnosis:** Inspected `src/components/game/GameStage.tsx`, `src/game/game-controller.ts`, and `src/game/kaplay-runtime.ts`.
- **Action:** Added console logs to `e2e/run.mjs` to capture page console output immediately.
- **Observation:** Found KAPLAY warning about double initialization. Identified a React StrictMode double-mounting race condition in `GameStage.tsx` where async component import allowed multiple instances of `GameController` to invoke `c.mount()` concurrently.
- **Fix 1:** Added robust `cancelled` and `destroyed` checks inside `GameStage.tsx` and `GameController.ts` to abort stale mount attempts.
- **Follow-up:** Test still timed out.
- **Diagnosis 2:** Investigated `kaplay-runtime.ts` and `behavior-spawner.ts`. Found the `y` coordinate for spawned bridge objects (`topY = canvasHeight - GROUND_Y_OFFSET - GROUND_THICKNESS`) was 14 pixels higher than the top of the ground collision mesh (`groundY = 320`). This caused the physics body of the player to collide with a 14-pixel step and get stuck indefinitely.
- **Fix 2:** Altered `topY` calculation in `behavior-spawner.ts` to be flush with the ground (`topY = canvasHeight - GROUND_Y_OFFSET`), so the player crosses smoothly.

## Debugging: Stage 2 Test Assertions & Select Option Timeout
- **Test Run:** Tests progressed further but failed on two new assertions.
- **Failure 1:** `[FAIL] 14 solid/fallback success advances (AC-09)`
  - **Diagnosis:** The deterministic hashing in the mock provider caused `#3` to yield a `solid` label instead of `danger`. Being the 2nd successful cycle out of a required 2, the app correctly navigated to the "Level Complete" screen, not back to the drawing canvas as the test expected.
  - **Fix 3:** Updated `e2e/run.mjs` assertion for Stage 2 cycle 2 success to check for `getByRole("heading", { name: /level selesai/i })`.
- **Failure 2:** Timeout on `selectOption` for `#override-select`.
  - **Diagnosis:** `selectOption({ index: 0 })` was trying to select the `<option disabled>` placeholder. Playwright waits indefinitely for disabled options.
  - **Fix 4:** Changed to `index: 1`.

## Debugging: Hand Landmark Test Failure
- **Failure 3:** `hand landmark injection produces stroke activity` failed.
  - **Diagnosis:** Evaluated `hand-gesture.ts`. The `isPinched` calculation uses a normalized threshold based on the hand `span` (distance between wrist and middle MCP). The mock landmarks provided by the test used identical coordinates for both points, resulting in a span of 0.
  - **Fix 5:** Adjusted `e2e/run.mjs` mock landmarks to give wrist and middle MCP distinct coordinates.

## Final Validation
- **Action:** Ran `npm run e2e` a final time.
- **Result:** `E2E RESULT: ALL PASS` (Code 0). Core flows are thoroughly covered.
