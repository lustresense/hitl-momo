# Implementation scope (Sketchbook Universe app)

You are working on the app in this folder. Proposals, research, meetings and design folders at the repo root are context only; you do not need them to code.

Read first: `../../contexts/can/AGENTS.md`, `../../contexts/can/SOUL.md`, `../../contexts/can/DECISIONS.md`, `../../contexts/can/NOW.md`, then `docs/execution/ARCHITECTURE_ACTUAL.md` and `docs/execution/RUN_GUIDE.md`.

Rules that cannot be broken without the Owner (CAN):
- The visual system (orange/green palette, dots background, outlines, shadows) is locked. Improve flow, placement and wording, never the system.
- Prediction is MOCK until the partner delivers a model; never fabricate model output, endpoints, database or dashboard. Keep MOCK/REAL/PASS/FAIL/BLOCKED/NOT TESTED separate.
- No push/merge/deploy to `can` without the Owner's approval. Ujang owns infrastructure and deployment.
- E2E uses trusted mouse/keyboard only; `window.__skb*` hooks exist only with `NEXT_PUBLIC_TEST_HOOKS=1`. Keep every `data-testid`.
- Gates before claiming done: `npx vitest run`, `npx tsc --noEmit`, `npx next lint`, `NEXT_PUBLIC_TEST_HOOKS=0 npx next build`, then the E2E suites in `e2e/` (see `docs/execution/RUN_GUIDE.md`).
- Product decisions: `../../contexts/can/DECISIONS.md`. Owner instructions: `../../contexts/can/project/OWNER_MANDATES.md`. Revision tasks: `../../contexts/can/REVISIONS.md`. Current state: `../../contexts/can/NOW.md`. Technical changes: root `../../CHANGELOG.md` (one version per push). Game-local historical changelog is archived, NOT live.

## Documentation gate for current ChatGPT branch (Owner M-033, 2026-11-15)
- Work only on `ujang-monorepo` until Owner changes permission. Do not touch `main`, deploy or modify Dias code for a documentation-only sync.
- For every change, reconcile the affected `DECISIONS.md`, `OWNER_MANDATES.md`, `REVISIONS.md`, Can `NOW.md`, technical `WORKING_CONTEXT.md`, short `PROJECT_MEMORY.md`, source/run guide and global `CHANGELOG.md`. Update only semantically applicable docs; preserve historical entries.
- When source is only read/edited through GitHub, report `STATIC_ONLY`; tests and production are `NOT_TESTED`. A new unit-test file is not a passing test.
- Version and changelog are required even for documentation-only pushes. From **repo root**, run `python3 scripts/bump_version.py --check` on Ujang's runtime; GitHub connector cannot execute it.
- Frontend installation: `npm ci` from this folder using `package-lock.json`; the local `requirements.txt` is an explanatory handoff, not pip dependencies.
