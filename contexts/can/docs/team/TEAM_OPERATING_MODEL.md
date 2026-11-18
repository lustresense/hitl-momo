# Sketchbook Universe — Team Operating Model

```text
                     CAN(USER)
      PROJECT OWNER / PRODUCT & R&D LEAD
             FINAL APPROVER
                    │
       ┌────────────┴─────────────┐
       │                          │
       ▼                          ▼
   R&D TEAM                    IT TEAM
       │                          │
 ┌─────┴──────┐            ┌─────┴──────────┐
 │            │            │                │
 ▼            ▼            ▼                ▼
Discussion   Dola       IT Orchestrator   IT Worker
AI           AI
 │            │        Hermes / direct    OpenCode
 │            │        Antigravity /      Antigravity
 │            │        other harness      delegated
 │            │
 ▼            ▼
Product      Visual
Research     R&D
Reasoning
PRD
Requirements
```

## CAN(USER)

**Project Owner / Product & R&D Lead / Final Approver.**

CAN(USER):
- describes goals/problems;
- chooses final direction;
- approves substantive product/research decisions;
- selects visual direction;
- can accept/reject R&D and IT proposals;
- remains above runtime orchestrators.

## R&D Team

### Discussion AI
Examples: ChatGPT or another model used for project reasoning.

Responsibilities:
- product research;
- requirement analysis;
- challenge/critique;
- UX/gameplay reasoning;
- research synthesis;
- PRD creation;
- R&D handoffs;
- audit of IT output.

Discussion AI is not the default coding worker and does not pretend to have the user's local filesystem.

### Dola AI
**Visual R&D Specialist.**

Used for visual reference generation, UI exploration, Momo/character exploration, composition, and visual language.

Dola is not the frontend engineer. Selected Dola references guide IT; exploratory outputs are not automatically approvals.

## IT Team

### IT Orchestrator
Examples:
- Hermes started directly;
- Antigravity started directly;
- another direct harness with no delegated worker role.

Responsibilities:
- inspect actual implementation state;
- break down engineering work;
- delegate bounded tasks;
- integrate results;
- verify;
- maintain engineering continuation context;
- escalate product decisions to R&D/CAN(USER).

### IT Worker
Examples:
- OpenCode session explicitly assigned `ROLE: WORKER`;
- Antigravity invoked/delegated by Hermes;
- another explicitly delegated agent.

Responsibilities:
- execute assigned scope;
- edit implementation within permission;
- test/verify;
- report findings/blockers.

Worker does not silently become product authority or rewrite project governance.

## Shared office

The repository is the shared operational brain.

- R&D → IT: `.ops/inbox/rnd/`
- Visual R&D → IT: `.ops/inbox/visual/`
- IT → R&D review: `.ops/outbox/rnd/`
- Orchestrator → worker: `.ops/tasks/`
- Worker → orchestrator/R&D: `.ops/results/`

Tool/model vendors are replaceable. The operating model stays stable.
