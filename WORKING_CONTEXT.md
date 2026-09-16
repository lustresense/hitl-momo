# Working Context

Last updated: 2026-08-27

## Active objective

UI Redesign campaign complete and reconciled. All implementation cards reviewed and verified. Engineering state is green. Next phase: CAN visual audit of the new Unified Research Dashboard and MediaPipe camera manual QA.

## Current operating model

- `CAN(USER)` is Project Owner / Product & R&D Lead / Final Approver.
- R&D AI prepares requirements, research reasoning, PRDs, and audits.
- Dola produces visual R&D/references.
- Direct IT harness with no delegated role is an orchestrator.
- Explicit `ROLE: WORKER` makes the current session a worker.
- Workers return results; orchestrators promote validated project-state/memory updates.

See `docs/team/`.

## Current implementation state (verified from source)

- **Framework:** Next.js 14.2.35 (App Router, static export) — present in source, not yet a governed decision.
- **UI:** React 18.3.1 + TypeScript 5.6 (strict)
- **Design System:** Applied 'Junior Illustrator's Field Desk' design with custom CSS tokens, tactile buttons, dossier grid, stamp badges, and Momo comic bubble (from task t_cfd4898e).
- **Game engine:** KAPLAY.js 3001 (client-only, `global: false`)
- **Hand tracking:** `@mediapipe/tasks-vision` 0.10 (HandLandmarker, pinch gesture)
- **Testing:** Vitest 2.1 + Playwright-core (E2E)
- **Lint:** ESLint + next/core-web-vitals

These are current implementation choices made by workers; they are not yet ratified as final product/engineering decisions.

## Known verification failures

- ~~Typecheck: FAIL — TS2882~~ **FIXED** (added CSS module declaration)
- ~~Tests: 1 failed out of 10~~ **RESOLVED** (component test restored; 10/10 test files pass, 67/67 tests)
- ~~E2E: Not yet run (Linux environment, requires manual)~~ **RESOLVED** (E2E 19/19 checks PASS, exit 0)
- ~~Final browser/visual QA: Not run~~ **RESOLVED** (19 screenshots, all core flows verified, mobile viewport fix applied)
- ~~UI Redesign: Not applied~~ **APPLIED** (complete "Junior Illustrator's Field Desk" design system, all 10 anti-slop tells eliminated, typecheck/tests/lint/build/E2E PASS)
- ~~Reconciliation: Pending~~ **COMPLETE** (all 6 implementation cards reviewed and promoted)
- **MediaPipe camera:** Code integrated but physical camera verification pending (manual QA)
- **CAN visual audit:** Pending — review new design system in browser at http://100.115.156.202:3000

## Immediate next steps

- **Evidence correction:** Genuine fallback/danger screenshots verified and accepted; false claims retracted. Corrected evidence at `.ops/results/t_abac7f8e/screenshots/`.
1. **CAN visual audit** — review the "Junior Illustrator's Field Desk" design system in browser (http://100.115.156.202:3000)
2. **Physical camera (MediaPipe) manual QA** — webcam test
3. After approval: final screenshots for proposal and academic presentation materials

## Preview

- **NetBird URL:** http://100.115.156.202:3000
- **Cloudflare tunnel:** intentionally removed
- **Screenshots:** `.ops/results/t_a5a6455c/screenshots/` (10 states, desktop & mobile)

## Backup

Backup is intentionally **copy-only**, not mirror-sync:
- use rclone `copy`;
- preview with `--dry-run`;
- never use `rclone sync` from project tooling;
- remote-only/stale files are not automatically deleted.

See `docs/backup/BACKUP_POLICY.md`.

## Unresolved product/engineering items

Use `project/OPEN_QUESTIONS.md`.

Do not infer final stack, MediaPipe/camera use, classifier architecture, database schema, confidence manipulation, character controls, or final level scripts.