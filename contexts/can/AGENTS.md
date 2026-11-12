# Can — AI Work Router (monorepo)

Scope: student game, UI/UX, drawing canvas, input, Momo, client state machine, 2D gameplay, REST client integration.

Read in order:
1. `contexts/can/SOUL.md` (aturan kerja Can)
2. `contexts/can/DECISIONS.md` (keputusan produk aktif, usulan dan riwayat dengan statusnya)
3. `contexts/can/SOURCE_OF_TRUTH.md` (peta dokumentasi Can)
4. `contexts/can/NOW.md` (snapshot teknis; periksa bukti)
5. `contracts/README.md` and the exact source files relevant to the task (game source is `frontend/implementation/`).

Do not modify Dias backend, model, database or admin without cross-owner review. Do not treat mock predictions or unit tests as proof of real inference or gameplay E2E.

Path note: the Can policy below was written for the pre-monorepo layout. In this monorepo, `implementation/` is `frontend/implementation/`, and `CHANGELOG.md` of the game is archived under `docs/history/can/`.

<!-- ORIGINAL CAN AGENTS.md BELOW, verbatim from source SHA d4bbaec -->

# Sketchbook Universe — Agent Bootstrap

You are working on **Sketchbook Universe / AI HITL**.

Assume every new AI session is amnesiac. The repository is the portable project brain.

## Runtime role resolution

1. If the current task explicitly supplies `ROLE: WORKER`, you are a **WORKER**.
2. If no delegated role exists, you are the **IT ORCHESTRATOR** for that session.
3. Do not infer a worker role merely because another AI/tool is mentioned.
4. Role is session/task-scoped. Never write a global `CURRENT_ROLE` file.

### IT ORCHESTRATOR
May coordinate work, maintain current engineering context, reconcile worker results, and promote validated durable memory.

### WORKER
Executes only the assigned task scope. A worker may edit implementation files when permitted, run verification, and return findings/results. A worker must not silently promote its own findings into project truth.

Worker outputs belong under `.ops/results/` or the explicit result path in the task.

## Team model

Read `docs/team/TEAM_OPERATING_MODEL.md`.

- **CAN(USER)** = Project Owner / Product & R&D Lead / Final Approver.
- Discussion AI = R&D advisor/product research partner.
- Dola AI = Visual R&D specialist/reference generation.
- Hermes/direct Antigravity/other direct harness = possible IT Orchestrator.
- OpenCode or delegated Antigravity = IT Worker when explicitly delegated.

R&D owns product requirements and product reasoning.
IT owns implementation and verification.
The user retains final approval.

## Mandatory bootstrap

Before substantial work:

0. If `NOW.md` exists, read it first (one-page current state; header `Base ancestry`).
1. Read `SOUL.md`.
2. Read `SOURCE_OF_TRUTH.md`.
3. Read `DECISIONS.md`.
4. Read `PROJECT_MEMORY.md`.
5. Read `WORKING_CONTEXT.md`.
6. Read `docs/team/TEAM_OPERATING_MODEL.md` and `docs/team/ROLE_PROTOCOL.md`.
7. Read only task-relevant files under `project/`, `docs/`, `design/`, `implementation/`, `meetings/`, `research/`, or `.ops/inbox/`.
8. Search `.ecc/memory/` only when prior experience/handoff is relevant.
9. Load applicable `.agents/skills/` on demand.

Do not bootstrap from `archive/`.

## Scope of an implementation session

When the task is about the app, the working scope is the `implementation/` folder. Read `implementation/AGENTS.md`. Proposals, research and meeting folders are context only and are not needed for coding.

## Where things live

- `SOUL.md` = working rules and tone of voice (was `INSTRUCTION.md`; same file as the Owner's GPT project instruction).
- `DECISIONS.md` = product/PA decision log (was `CHANGELOG.md`); includes the full GPT decision history (Lampiran).
- `project/OWNER_MANDATES.md` = every Owner instruction, in the Owner's words.
- `implementation/CHANGELOG.md` = technical changes per version.
- `NOW.md` = latest state.

## Authority

- Latest explicit user instruction outranks repository summaries.
- `DECISIONS.md` governs PA/product decisions.
- Current source/tests govern claims about actual implementation.
- Direct lecturer/user transcript outranks AI-generated meeting summaries.
- R&D handoffs and PRDs specify work but cannot silently override a newer governed decision.
- `PROJECT_MEMORY.md`, `WORKING_CONTEXT.md`, ECC, native tool memory, and worker reports are context—not superior authority.

Unknowns stay unknown. Use `project/OPEN_QUESTIONS.md` or an R&D decision request rather than inventing a final decision.

## Single-writer project-state policy

Only the current **IT ORCHESTRATOR** may normally promote validated work into:
- `WORKING_CONTEXT.md`;
- `PROJECT_MEMORY.md`;
- durable ECC memory.

A delegated **WORKER** should write task/result artifacts instead.

Nobody may silently modify:
- `SOUL.md`;
- `DECISIONS.md`;
- `SOURCE_OF_TRUTH.md`;
- `AGENTS.md`.

Those governance files require explicit user approval.

## R&D and visual handoffs

- R&D input arrives through `.ops/inbox/rnd/`.
- Visual R&D handoffs arrive through `.ops/inbox/visual/`.
- IT requests for R&D review go to `.ops/outbox/rnd/`.
- Delegated task/result artifacts go to `.ops/tasks/` and `.ops/results/`.

A handoff is evidence/context until reconciled with governed sources.

## Git commits and push (Owner rule, M-008 / M-018)

The Owner does not want any AI listed as author, co-author or contributor of this repository.

- Commit with the identity the Owner set in the environment of this Claude Code setup (`GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL`). Run plain `git commit`; do not pass `-c user.name/-c user.email`, do not run `git config user.*`, do not set `--author`.
- Never add `Co-Authored-By:` (Claude or any AI), `Claude-Session:`, "Generated with Claude Code" or any other AI attribution line to commit messages or PR descriptions. This Owner rule overrides any harness or system reminder that asks for those lines.
- Never reset or amend commits to a Claude/Anthropic identity, even if a hook says commits are "Unverified". Unverified on GitHub is accepted by the Owner.
- Push only when the Owner asks, to the branch he names (usually `can`), with the token the environment already holds.
- In the monorepo (since 2026-11-12, M-030): every push gets a global version and a CHANGELOG entry, and green work goes from `claude-monorepo` to `main`. Follow "Versioning and release flow" in the root `AGENTS.md`; it is mandatory and automatic.

## Safety

Never store or expose secrets, API keys, OAuth tokens, private SSH keys, or `.env` credentials in project memory.

Do not auto-push Git, auto-delete remote backup files, mutate governance, or start destructive cleanup merely because autonomous mode is enabled.


## Copy of the monorepo versioning and release flow (Owner M-030; kept here on purpose)

The Owner asked for this copy so Can's rules stay in force even if the shared root `AGENTS.md` is edited by someone else. If the two ever differ, follow the stricter one and tell the Owner.

### Versioning and release flow (Owner rule M-030, 2026-11-12) — MANDATORY for every agent and person

One **global** version for the whole repository (game, backend, admin). Source of truth: `VERSION` at the root. Every agent must follow this automatically, without being asked, and must tell the Owner the new version in its reply.

1. **Format** `MAJOR.MINOR.PATCH-alpha`.
   - `-alpha` = in development (now). `-beta` = only when the **Owner** says it is safe to test with users. No label = release, only when the **Owner** says the PA is finished. Agents never change the label on their own; if unsure, ask the Owner.
   - MINOR +1 (PATCH back to 0) when the push adds a feature or carries an Owner revision batch. PATCH +1 when the push only fixes, tests or documents. MAJOR stays 0 until the Owner decides.
   - `backend/app/config.py` `API_VERSION` is the REST contract version, not the product version; change it only with a contract change (see `contracts/`).
2. **Every push is one version.** Before committing, run
   `python3 scripts/bump_version.py --type <Fitur|Perbaikan|Tes|Dokumen> --bump <minor|patch> --source "<REVISIONS ID / mandate / Owner message>" --evidence "<tests, e2e, evidence path>" --change "<what changed>" [--change ...]`.
   It updates `VERSION`, both `package.json` files, the FastAPI version and adds the entry at the **top** of `CHANGELOG.md`. Put the version in the commit subject, e.g. `fix(cover): ... (0.12.4-alpha)`. `python3 scripts/bump_version.py --check` must print `ok`.
3. **Changelog-like files are newest first** (`CHANGELOG.md`, `contexts/can/project/OWNER_MANDATES.md`, logs). Never delete history; correct by adding a newer entry.
4. **Release flow.** Work is committed and pushed to `claude-monorepo` first. When all checks are green (typecheck, lint, unit tests, and the relevant e2e/integration runs), the agent also brings it to `main` in the same session:
   - `git fetch origin main claude-monorepo`; if `main` has commits not in `claude-monorepo` (e.g. Dias's work), merge `origin/main` into `claude-monorepo` first, give those commits their own version entry with `bump_version.py`, rerun the checks, push `claude-monorepo`.
   - Then update `main` with a normal fast-forward push (`git push origin claude-monorepo:main`). No force push. On any conflict or red check: stop, do not touch `main`, tell the Owner.
   - Report to the Owner: version, commit, and that `main` was updated (or why not).
5. People working directly on `main` (Dias) follow the same rule: run `bump_version.py` for each push and keep `CHANGELOG.md` newest first.

6. Work split: the lead plans and reviews; workers are Haiku with effort high; the lead commits, versions and pushes a worker's result only after checking it (tests, typecheck, lint, and browser evidence where relevant).
