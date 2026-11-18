# CAN — Agent SOP and Documentation Router

**Mandatory for any agent, model, IDE or account working on CAN's domain.** Always start with root `AGENTS.md`. The repository is Sketchbook Universe, a **single** AI-HITL student product with separated CAN and DIAS ownership. All paths below are from repository root. Follow this SOP in full; a tool reading only root AGENTS is not sufficient.

## Mandatory bootstrap (before planning, code edits, or delegation)

1. Read `contexts/can/SOUL.md`, **Part A and Part B**. This is CAN's one working and tone policy, including Cermin Jujur, anti-hallucination and document governance. **No `SOUL-SESSION.md`** is needed.
2. Read `contexts/can/DECISIONS.md` and distinguish **Aktif**, **Direvisi**, **Dicabut**, **Belum dikunci** and proposals. New code or AI suggestions do not approve PA features. Read `contexts/can/SOURCE_OF_TRUTH.md` for evidence hierarchy and correct monorepo paths.
3. Read live work context: `contexts/can/NOW.md`, root `NOW.md`, `contexts/can/REVISIONS.md`, `contexts/can/project/OWNER_MANDATES.md`, `contexts/can/WORKING_CONTEXT.md`, `contexts/can/PROJECT_MEMORY.md`, and the current checkpoint `contexts/can/SESSION_HANDOFF.md`. These are snapshots, **verify** against current Git SHA and actual code/tests before treating them as runtime truth.
4. Read `contexts/can/docs/team/TEAM_OPERATING_MODEL.md` and `contexts/can/docs/team/ROLE_PROTOCOL.md`. Inspect six `contexts/can/.agents/rules/*.md`; in a root workspace nested rules might not be loaded automatically. Open relevant `contexts/can/.agents/skills/*/SKILL.md` only for the actual task (project-resume, pa-orchestrator, verification-loop, parsing-optimize, audit-project-decisions, etc.).
5. When coding CAN, read `frontend/implementation/AGENTS.md`, `frontend/implementation/docs/execution/ARCHITECTURE_ACTUAL.md`, `frontend/implementation/docs/execution/RUN_GUIDE.md`, the relevant execution handoff and actual source/tests. For NUI inspect `NUILAB_AUTOLOCK_HANDOFF_2026-11-16.md`, current PR and live code, rather than repeating an older patch.
6. For academic/research work, read the active formal proposal, direct bimbingan transcript, and actual supplied Dapus sources as needed. Do **not** invent unverified files, bibliography, lecturer claims or evaluation results. Read `contexts/can/project/OPEN_QUESTIONS.md` when unresolved requirements matter.
7. Before changes, report briefly actual branch/SHA, permission, affected files and owner, controlling decision IDs and evidence gaps. If unavailable, mark required docs unread; never pretend to have read them.

## Authority and team scope

- **CAN**: student interface, canvas, drawing flow, Top-3/confidence **display**, Accept / Correct / Override decision UI, Redraw as recovery, NUI, gameplay 2D, Momo text bubble, and frontend event flow. SMP grades 7–9. The experience hierarchy is Interaksi → Gameplay/Storyline → Edukasi.
- **DIAS**: prediction/model and confidence **generation**, backend, database and logging storage, training, dashboard/admin. Read `contexts/dias/AGENTS.md` and shared contracts before cross-owner changes, and get applicable approval.
- **Product truth**: latest explicit CAN instruction > `DECISIONS.md` approved statuses > active formal proposal and direct lecturer/user statements > relevant repo assets > archived conversations. Old decisions never reactivate themselves. **Technical truth**: current branch source, config and actual runtime evidence; snapshots, PR descriptions and AI reports are supporting context.
- **Core invariant**: student draws → Top-3 + confidence → Accept/Correct/Override → label/behavior → gameplay 2D → logging. Redraw is a recovery/iteration route, **not a fourth HITL choice**. Momo has no free conversation, voice, NLP or LLM.

## Orchestrator, worker and action controls

- Task explicitly marked `ROLE: WORKER` = worker with bounded file ownership and a result report. Otherwise direct session = IT orchestrator. No vendor, account or permanent role file defines authority.
- Agent lead plans, delegates where available, checks outputs and prevents parallel writes to the same files. Workers cannot silently promote test summaries or approve decisions. Delegation is optional, not an excuse to skip tasks.
- Editing, committing, pushing, merging, and deploying are separate permissions. Check the latest CAN instruction for branch. The 2026-11-15 `ujang-monorepo` restriction and M-030 `claude-monorepo` promotion are historical unless reissued. The explicit 2026-11-17 `main` authorization applies **only to the agent-bootstrap documentation task**.
- Do not force-push, reset destructively, delete backup, leak secrets, include AI coauthor trailers contrary to Owner commit policy, or touch DIAS implementation without review.
- Quality gates, when accessible: `npm ci`, typecheck, lint, Vitest, Next build and relevant browser E2E; physical webcam test is separate. `STATIC_ONLY / NOT_TESTED` when tools or camera aren't available. Distinguish `MOCK_MODEL` vs `REAL_MODEL` and never infer production from source.

## Documentation reconciliation (after an authorized change)

| Evidence/change | Applicable document(s) |
|---|---|
| New direct Owner mandate/process | `contexts/can/project/OWNER_MANDATES.md` |
| Tasks, blockers, next QA | `contexts/can/REVISIONS.md` |
| Approved product decision | `contexts/can/DECISIONS.md`, by explicit decision-ID approval only |
| Engineering status/experiments | `contexts/can/NOW.md`, `contexts/can/WORKING_CONTEXT.md`, root `NOW.md`, short `PROJECT_MEMORY.md` |
| Code/API/build/deploy | source and tests; affected `contracts/`, `ARCHITECTURE_ACTUAL.md`, `RUN_GUIDE.md` and technical handoffs |
| Agent/account session continuity | `contexts/can/SESSION_HANDOFF.md` with branch/SHA, uncommitted files, proof, blocker, next action |
| Authorized push | Root `VERSION` and `CHANGELOG.md`, synchronized package/backend version metadata; no change of decision status by implication |

**Keep history but do not maintain competing live SOP copies.** Old `implementation/` path, old `docs/team/` root path, and obsolete branch instructions are not current directions. Rules/skills are helpers and do not override `AGENTS.md`, `SOUL.md` or `DECISIONS.md`.
