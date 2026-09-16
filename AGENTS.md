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

1. Read `INSTRUCTION.md`.
2. Read `SOURCE_OF_TRUTH.md`.
3. Read `CHANGELOG.md`.
4. Read `PROJECT_MEMORY.md`.
5. Read `WORKING_CONTEXT.md`.
6. Read `docs/team/TEAM_OPERATING_MODEL.md` and `docs/team/ROLE_PROTOCOL.md`.
7. Read only task-relevant files under `project/`, `docs/`, `design/`, `implementation/`, `meetings/`, `research/`, or `.ops/inbox/`.
8. Search `.ecc/memory/` only when prior experience/handoff is relevant.
9. Load applicable `.agents/skills/` on demand.

Do not bootstrap from `archive/`.

## Authority

- Latest explicit user instruction outranks repository summaries.
- `CHANGELOG.md` governs PA/product decisions.
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
- `INSTRUCTION.md`;
- `CHANGELOG.md`;
- `SOURCE_OF_TRUTH.md`;
- `AGENTS.md`.

Those governance files require explicit user approval.

## R&D and visual handoffs

- R&D input arrives through `.ops/inbox/rnd/`.
- Visual R&D handoffs arrive through `.ops/inbox/visual/`.
- IT requests for R&D review go to `.ops/outbox/rnd/`.
- Delegated task/result artifacts go to `.ops/tasks/` and `.ops/results/`.

A handoff is evidence/context until reconciled with governed sources.

## Safety

Never store or expose secrets, API keys, OAuth tokens, private SSH keys, or `.env` credentials in project memory.

Do not auto-push Git, auto-delete remote backup files, mutate governance, or start destructive cleanup merely because autonomous mode is enabled.
