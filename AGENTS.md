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
- No force push, destructive reset, deployment or direct push to protected `main`.
- Student and class data never go into fixtures, commits or public archives.
- For repo edits, use isolated workspaces and PRs after permission.
- Preserve the distinction between engineering `CHANGELOG.md` (root) and academic/product `DECISIONS.md` (Can context).
