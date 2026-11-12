# AGENTS.md — Sketchbook Universe (Shared Repository)

## Purpose
This repository contains one product with two owner scopes. This is a **neutral routing guide**, not the personal instruction set of Can or Dias.

## First read
1. `README.md` — architecture, commands, prerequisites, status.
2. `docs/architecture/README.md` — component and runtime boundaries.
3. `contracts/README.md` and `contracts/API_INVENTORY.md` — shared REST interface.
4. `NOW.md` — current integration status (not proof without linked evidence).

## Route by area
- Game, canvas, interaction, Momo, gameplay: read `contexts/can/AGENTS.md` (router + Can policy), then `frontend/implementation/AGENTS.md`, then the relevant source.
- FastAPI, AI inference, training, database, admin: read `contexts/dias/AGENTS.md`, then the relevant source.
- Shared API, deployment, cross-owner refactor: read BOTH owner routers and the API contract, then identify review requirements.

## Ownership and boundaries
- `frontend/implementation/` = Can.
- `frontend/admin/`, `backend/`, `train/`, `weights/` = Dias.
- `contracts/`, root docs and deployment composition = shared review.
- Do not treat Can's `SOUL.md` or `DECISIONS.md` as global agent policy for Dias.
- Do not overwrite another owner's code or update an API contract unilaterally.

## Source of truth
- Verify source, commit SHA, configuration and test results; never equate file presence with successful runtime.
- For Can product decisions, consult `contexts/can/DECISIONS.md`. Product changes still require the owner's decision process.
- Model outputs, mocks, skipped tests and inferred architecture are not production evidence.
- Evidence classes: `REAL_MODEL`, `MOCK_MODEL`, `UNIT_ONLY`, `STATIC_ONLY`, `NOT_TESTED`. Do not merge them.

## Safety
- No secrets in Git, logs, fixtures, prompts or screenshots.
- No force push, destructive reset or deployment. `main` is updated only by the merge procedure in "Versioning and release flow" below (Owner rule M-030); never push unreviewed work straight to `main`.
- Student and class data never go into fixtures, commits or public archives.
- For repo edits, use isolated workspaces and PRs after permission.
- Preserve the distinction between engineering `CHANGELOG.md` (root) and academic/product `DECISIONS.md` (Can context).

## Versioning and release flow (Owner rule M-030, 2026-11-12) — MANDATORY for every agent and person

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
