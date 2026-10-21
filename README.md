# Sketchbook Universe — AI Team Brain v2

Portable PA repository + project brain for **Sketchbook Universe / AI HITL**.

This base package intentionally contains the project, governance, memory, team protocol, AI adapters, archive, research, academic files, and backup tooling **without a bundled product PRD**. The next PRD is supplied by the R&D team through `.ops/inbox/rnd/` after the chosen IT worker is running.

## Start here

Human:
1. `docs/team/TEAM_OPERATING_MODEL.md`
2. `INSTRUCTION.md`
3. `CHANGELOG.md`
4. `project/OPEN_QUESTIONS.md`

AI:
1. `AGENTS.md`
2. `INSTRUCTION.md`
3. `SOURCE_OF_TRUTH.md`
4. `CHANGELOG.md`
5. `PROJECT_MEMORY.md`
6. `WORKING_CONTEXT.md`

## Main domains

- `academic/` formal/current/history academic material
- `research/` primary papers and research workspace
- `meetings/` latest source notes/transcript material
- `design/` current design work + Dola reference slots
- `implementation/` active codebase location
- `project/` ownership/open questions/engineering decisions
- `docs/` team, AI workflow, backup, product handoff docs
- `.ops/` cross-team inbox/outbox/task/result interchange
- `.ecc/` ECC-compatible long-term memory
- `.agents/` shared rules and procedural skills
- `.kilo/` Kilo adapter/commands
- `tools/` portable AI and backup utilities
- `archive/` cold history only
- `scratch/` temporary work

## Important

`archive/` is not active project truth.
Proposal history and old AI chats must never silently override current governance.

---

## Documentation Index

| File | Purpose |
|------|---------|
| [PRD.md](./PRD.md) | Product Requirements Document (konsolidasi dari existing docs) |
| [SPEC.md](./SPEC.md) | Spec template for new features |
| [CHANGELOG.md](./CHANGELOG.md) | Decision log (single source of truth untuk keputusan) |
| [DESIGN_RESEARCH.md](./DESIGN_RESEARCH.md) | Design research & competitive analysis |
| [BAB_4_Implementasi_dan_Pengujian.md](./BAB_4_Implementasi_dan_Pengujian.md) | Implementation & testing specification |
| [DESIGN_TOKENS_EXTRACTION.md](./DESIGN_TOKENS_EXTRACTION.md) | Design system tokens |
| [SECURITY_GATE.md](./SECURITY_GATE.md) | Security requirements & gates |
| [Laporan-Progres.md](./Laporan-Progres.md) | Academic progress report |
| [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md) | Source of truth definitions |
| [PROJECT_MEMORY.md](./PROJECT_MEMORY.md) | Project context & memory |
| [WORKING_CONTEXT.md](./WORKING_CONTEXT.md) | Current working context |
| [INSTRUCTION.md](./INSTRUCTION.md) | AI agent instructions |
| [AGENTS.md](./AGENTS.md) | Agent orchestration config |

---

## Development Workflow (Proposed)

1. **Review PRD** → isi open questions (section 7)
2. **Technical architecture decision** → tentukan stack
3. **Create SPEC** dari template `SPEC.md` → `SPEC-<feature>.md`
4. **Implement** dengan TDD
5. **Validate**: lint, typecheck, test, build
6. **Commit** conventional commits
7. **Push** → CI/CD → Deploy

---

## Current Status

**Phase**: Pre-development / Architecture decision needed
**Blocker**: Open questions di PRD section 7 butuh keputusan Owner
**Next**: Architecture session → tentukan tech stack → setup repo structure
