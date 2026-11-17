# CAN Agent Session Checkpoint — 2026-11-17

This is a short portable handoff for switching Codex, Claude Code and Antigravity accounts. It is **not** a decision log. Always read root `AGENTS.md` and `contexts/can/AGENTS.md`, then check `git branch --show-current`, `git rev-parse HEAD` and `git status --short` before using this snapshot.

- Repository `lustresense/hitl-momo`. The source baseline before the agent governance patch was `main` commit `f19b04d`, `0.22.0-alpha`.
- **Current task (2026-11-17)**: user explicitly authorized a universal agent-bootstrap/doc/SOP repair **on main**. This is one-task permission and does not permit future automatic merge/deploy. No game, backend logic, model, or PA product decisions were changed by this scope.
- **Existing NUI**: `0.22.0-alpha` source added Lab auto-reacquire/observability, with `STATIC_ONLY / NOT_TESTED` evidence for full browser/webcam runtime. No claim of reliable low-light tracking.
- **Open QA**: draft [PR #5](https://github.com/lustresense/hitl-momo/pull/5), branch `nui-lab-qa-0.22.1`, source version `0.22.1-alpha`, **not merged** on 2026-11-17. This documentation batch bumps to `0.23.0-alpha`; PR's version must be reconciled when evaluated for merge, without silently overwriting.
- **Decisions divergence**: `ujang-monorepo` has CAN DECISIONS audit addenda absent from `main`. Several are pending approval; do not treat a Git push as product decision approval, or assume the branches have equivalent code.
- **Ownership**: CAN frontend and student experience, DIAS model/backend/admin; Ujang installs/deploys. Read `contexts/can/DECISIONS.md`, `REVISIONS.md`, `NOW.md`, `WORKING_CONTEXT.md` for current detail and verify source.
- **Next QA**: run `python3 scripts/bump_version.py --check` and `python3 scripts/verify_agent_bootstrap.py` in code-server; run frontend typecheck, lint, tests/build, and actual webcam tests when available. A file in GitHub is not a passing runtime test.
- **Manual account switching**: no chat history, account authorization or uncommitted work is transferred by Git automatically. Capture changed files, SHA, failed gates, blockers, and consent-safe evidence here before handing off.
