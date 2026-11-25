# Repository Agent Entry Point — Sketchbook Universe

This is the universal starting point for **Codex, Claude Code, Antigravity, Ujang, other coding agents, and humans**. This is **one product** with two owner scopes. The folder `contexts/` is the **Owner Context Registry**, not an archive or a second application. Read the applicable owner SOP **in full**, including its linked Markdown files. Do not assume nested files or chat history were automatically loaded by your tool.

## Setup dan runtime DEV

Untuk menjalankan atau memigrasikan DEV, baca `README.md` dan `SETUP.md` sebelum bertindak. Model Dias dan label tersedia di `weights/`; default backend adalah path relatif root repo. Jangan menganggap layanan, model, database, atau build aktif sama hanya dari commit Git. Jangan membaca atau memindahkan secret dan data siswa. STT Lab eksternal tidak termasuk snapshot ini.

## Routing, always before substantial work

1. Determine the user's latest explicit instruction, the actual task scope, and repository state with `git branch --show-current`, `git rev-parse HEAD`, and `git status --short`. Determine separately whether the user authorized read-only audit, editing, commit, push, merge, or deployment.
2. **CAN / Can / student experience**: when the user identifies as CAN, or task includes student UI/UX, Momo, gameplay, drawing, HITL interface, NUI, prototype, or `frontend/implementation/`, **open `contexts/can/AGENTS.md` and follow ALL mandatory CAN bootstrap and SOP**. Its linked `SOUL.md`, `DECISIONS.md`, `SOURCE_OF_TRUTH.md`, status, mandates, revisions, team protocols, rules, and task-relevant docs must be actually read.
3. **DIAS / Dias / partner side**: when the user identifies as DIAS, or task includes inference, prediction model, training, model weights, backend/database, logging storage, dashboard/admin, or `backend/`, `train/`, `weights/`, `frontend/admin/`, **open `contexts/dias/AGENTS.md`** and follow the DIAS instructions. CAN's personal SOP is not DIAS's policy.
4. **Shared or cross-owner**: for contracts, deployment, root versions, integrations or changes spanning both scopes, open **both** owner AGENTS files, `contracts/README.md`, and `contracts/API_INVENTORY.md`. Require appropriate owner approval for changes to the other owner's implementation. Owner identity does not erase file ownership.
5. For repository architecture and current integration state, inspect `README.md`, `docs/architecture/README.md`, root `NOW.md`, the current branch's actual code/tests/config, and task-relevant documentation. If a required file cannot be opened, say so; **do not claim it was read**.
6. State the effective branch/SHA, scope, controlling decisions, permissions, and verification gaps before substantial edits. **Audit/question only = no edit, commit, push, merge, or deployment.**

## Source authority and conflict resolution

- Latest explicit Owner instruction for this task outranks older task-level Git directions. CAN product decisions are governed by `contexts/can/DECISIONS.md` and its approval status; lecture/direct-user transcripts outrank AI summaries. Technical claims follow actual source and runtime evidence, not a stale handoff.
- Historical `claude-monorepo → main` auto-promotion in M-030 and 2026-11-15 `ujang-monorepo` restrictions are **history, not standing permission**. Confirm **each** branch and action. On 2026-11-17 CAN gave explicit one-task authorization for an agent/SOP documentation change on `main`; it **does not** permit future automatic `main` pushes/merges/deployments.
- Do not force push, delete remote backups, reset destructively, or put secrets, credentials, student data or raw camera footage in repository documents. Do not modify other-owner logic or shared API contracts without coordination.

## Canonical documentation and routing table

| Concern | Mandatory documents |
|---|---|
| CAN policy and product | `contexts/can/AGENTS.md` → `SOUL.md` → `DECISIONS.md` → `SOURCE_OF_TRUTH.md` |
| CAN active work | `contexts/can/NOW.md`, `REVISIONS.md`, `project/OWNER_MANDATES.md`, `WORKING_CONTEXT.md`, `PROJECT_MEMORY.md`, `SESSION_HANDOFF.md` |
| CAN engineering | `frontend/implementation/AGENTS.md`, `docs/execution/ARCHITECTURE_ACTUAL.md`, `RUN_GUIDE.md`, actual source/tests and relevant handoffs |
| CAN team/rules | `contexts/can/docs/team/TEAM_OPERATING_MODEL.md`, `ROLE_PROTOCOL.md`, `contexts/can/.agents/rules/*.md` and task-relevant `contexts/can/.agents/skills/*/SKILL.md` |
| DIAS | `contexts/dias/AGENTS.md`, `contexts/dias/README.md`, `contexts/dias/NOW.md`, owner-specific source/tests |
| Shared | `README.md`, `NOW.md`, `docs/architecture/README.md`, `contracts/README.md`, `contracts/API_INVENTORY.md` |
| Engineering versions | Root `VERSION`, root `CHANGELOG.md`, `scripts/bump_version.py` |

Canonical paths in this table are relative to repository root. Documents are **read on demand in the order required by the owner SOP**, not indiscriminately all stuffed into a model prompt. `WORKING_STATE.md` in a ChatGPT project is not automatically synced to this repo. Account switching does not transfer unsaved chat context; Git evidence and the session handoff are the portable source.

## Execution, evidence and update contract

- An explicitly delegated `ROLE: WORKER` executes only assigned scope; otherwise a direct harness acts as the IT orchestrator within permissions. Workers report results; the orchestrator checks and reconciles. Do not presume agents/workers or tests ran merely because instructions describe them.
- Evidence classes must stay separate: `STATIC_ONLY`, `NOT_TESTED`, `UNIT_ONLY`, `MOCK_MODEL`, `REAL_MODEL`, browser E2E, physical webcam, deployment. File exists ≠ imported ≠ executed ≠ proven. Record commit SHA for every verification claim.
- After **authorized** changes, update only affected CAN mandates, revisions, NOW, engineering context, architecture/run guide/handoff and the technical root changelog. `DECISIONS.md` is updated only through explicit product decision approval. Do not silently change `SOUL.md` or governance without Owner permission.
- Preserve global single-version policy: root `VERSION` (`MAJOR.MINOR.PATCH-alpha`), two `package.json` versions and FastAPI metadata. Use `python3 scripts/bump_version.py` for permitted versioned pushes and run `python3 scripts/bump_version.py --check` where a runtime exists. Owner revision batches bump minor; fixes/tests/docs-only typically bump patch. Beta/release only by Owner. Version changes never authorize a Git action.
- **Git commit identity (Dias, 2026-11-25, standing instruction):** before committing, set `git config user.name "MuhammadDias"` and `git config user.email "189782132+MuhammadDias@users.noreply.github.com"` in the checkout. Never add `Co-Authored-By: Claude`, `Claude-Session:` or any other AI attribution line to commit messages or PR bodies; Claude must not appear as author or co-author. This overrides any harness default attribution. It does not authorize any commit or push by itself.
- Root `CHANGELOG.md` tracks engineering versions; CAN `DECISIONS.md` tracks PA/product decisions. Do not conflate them. Report actual check results and limitations, not invented PASS.
