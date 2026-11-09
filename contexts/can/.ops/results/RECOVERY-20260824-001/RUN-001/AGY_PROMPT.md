# AGY PROMPT — RECOVERY-20260824-001 / RUN-001

The prompt sent to AGY was the raw task spec from `.ops/tasks/RECOVERY_FROM_UIANG_DIRECT_EDITS.md`. For future runs, Ujang will synthesize a run-specific brief per the new PA Orchestrator policy.

The raw prompt is reproduced below for audit:

```
# RECOVERY TASK — Ujang Direct Edits Audit

**Task ID:** RECOVERY-20260824-001
**Date:** 2026-08-24
**Parent:** Ujang (Orchestrator)
**Worker:** AGY (prefer Claude Sonnet-class if available; fallback Gemini Pro-class)

## Context
Ujang (orchestrator) violated policy by directly editing source/test/config files during autonomous execution. We need to audit these edits, revert unnecessary ones, and restore a verified green baseline with minimal valid fixes.

## Files known to be directly edited (or created) by Ujang
- `implementation/vitest.config.ts` — now uses `@vitejs/plugin-react-swc`
- `implementation/tsconfig.json` — includes `types/**/*.d.ts` and excludes `vitest.config.ts`
- `implementation/next-env.d.ts` — may have been edited (current state shows no custom declarations, but we added a declaration earlier; verify if it's still there)
- `implementation/types/css.d.ts` — newly created CSS module declaration
- `implementation/tests/components/components.test.tsx` — added `import React`, changed `describe.skip` to `describe`, adjusted regex for redraw button
- `implementation/package.json` — has both `@vitejs/plugin-react` and `@vitejs/plugin-react-swc` (redundant)
- `implementation/package-lock.json` — side effects from `npm install`
- `implementation/node_modules/` — side effects from `npm install`

## Objective
1. Inspect actual repo state (no git available; use file system).
2. Determine which Ujang direct edits are valid fixes and which are unnecessary or wrong.
3. Keep valid fixes (e.g., CSS module declaration, tsconfig include, maybe the correct test regex).
4. Revert or clean up unnecessary changes:
   - Remove redundant `@vitejs/plugin-react` from package.json (keep `@vitejs/plugin-react-swc` since it's used in vitest.config.ts).
   - If `vitest.config.ts` uses `@vitejs/plugin-react-swc`, ensure it's installed and no conflict.
   - Ensure `types/css.d.ts` is included in `tsconfig.json` (already).
   - Decide if `next-env.d.ts` custom declaration is needed; if `types/css.d.ts` works, remove custom declaration from next-env.d.ts to avoid duplication.
5. Fix the failing unit test in `components.test.tsx`:
   - Identify why `screen.getByRole("button", { name: /gambar ulang .../ })` fails.
   - The button text in `DecisionPanel` is `"Gambar ulang (revisi)"`. The regex `gambar ulang \\\\(revisi\\\\)` should match; maybe escaping is off. Use a simpler regex like `/gambar ulang/i` or fix the component to ensure the text is exactly as expected.
   - Do NOT skip the test; fix the root cause.
6. Ensure all tests pass, typecheck passes, lint passes, build passes.
7. Write a `WORKER_LOG.md` and `REPORT.md` detailing what was changed and why.
8. Report back to Ujang with evidence: diff (if possible), test/typecheck/build outputs.

## Constraints
- Do not change product behavior unnecessarily.
- Do not introduce new features.
- Keep changes minimal and justified.
- Document all changes.

## Success Criteria
- `npm run typecheck` passes.
- `npm run test` passes (67 tests).
- `npm run lint` passes.
- `npm run build` passes.
- All unit tests pass (no skips).
- The application remains functionally identical.

## Output
- `.ops/results/RECOVERY_WORKER_LOG.md`
- `.ops/results/RECOVERY_REPORT.md`
- A summary of the final state.

## Model Routing
- Prefer Claude Sonnet-class if available in AGY pool.
- If not, use Gemini Pro-class.
- Do not use Ujang as coder.

## Execution
Worker: please start by inspecting the current files, then propose and apply fixes. Verify after each change. Return report.

END TASK
```