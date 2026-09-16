# IT WORKER TASK
# TASK-RND-20260822-001 — Full Author-Side Implementation

**ROLE:** WORKER  
**PARENT:** R&D  
**TASK_ID:** TASK-RND-20260822-001  
**DATE:** 2026-08-22

---

## OBJECTIVE

Take the actual current repository from its current implementation state to a working, verified **author-side vertical product implementation** satisfying:

`.ops/inbox/rnd/PRD_SKETCHBOOK_UNIVERSE_v1.0.md`

Do not stop at scaffolding.

Implement all author-side scope that can be completed without taking over partner-owned work or inventing unresolved product decisions.

---

## REQUIRED CONTEXT

Read/reconcile:
1. `INSTRUCTION.md`
2. `SOURCE_OF_TRUTH.md`
3. `CHANGELOG.md`
4. `AGENTS.md`
5. `PROJECT_MEMORY.md`
6. `WORKING_CONTEXT.md`
7. `docs/team/TEAM_OPERATING_MODEL.md`
8. `docs/team/ROLE_PROTOCOL.md`
9. `.ops/inbox/rnd/PRD_SKETCHBOOK_UNIVERSE_v1.0.md`
10. actual current `implementation/`
11. selected current design assets, if any
12. supporting proposal/meeting/research evidence only when needed

Do not re-read the entire archive or all papers merely to claim coverage. Use targeted retrieval.

---

## SCOPE

You may implement/edit:
- `implementation/**`
- implementation tests/config/docs;
- implementation-local package/build config;
- implementation-local assets/placeholders;
- explicit development mocks;
- `.ops/results/**`;
- `.ops/outbox/rnd/**` only for genuine R&D questions/blockers.

---

## EXPECTED DELIVERY AREAS

1. application foundation;
2. drawing/input;
3. input normalization;
4. mock prediction provider;
5. Top-3/confidence UI;
6. Accept;
7. Correct rank 2;
8. Correct rank 3;
9. Override;
10. final decision state;
11. Redraw/retry;
12. level/context config;
13. Solid;
14. Danger;
15. 2D gameplay consequence;
16. fail/recovery;
17. repeat cycle;
18. level complete;
19. Momo contextual bubble;
20. prediction adapter seam;
21. event/logging seam;
22. tests;
23. developer run instructions;
24. final worker report.

---

## ENGINEERING AUTONOMY

If no active stack exists, choose the smallest maintainable stack satisfying the PRD.

You may decide reversible engineering details yourself:
- frontend framework;
- 2D/game/rendering library;
- state approach;
- test framework;
- module structure;
- implementation-local dependencies.

Do not wait for R&D approval solely because old proposal/history mentions another library.

Document:
- chosen stack;
- rationale;
- tradeoffs;
- how partner integration remains isolated.

---

## ESCALATION CONDITIONS

Do not stop for normal engineering decisions.

Create:

`.ops/outbox/rnd/RND_DECISION_REQUIRED.md`

only if implementation genuinely requires changing/finalizing a product decision such as:
- Accept/Correct/Override semantics;
- Redraw semantics;
- Momo role/lore;
- author/partner ownership;
- required input modality;
- visual direction;
- level meaning;
- target user;
- evaluation method;
- production partner contract.

If one question blocks only one area, document it and continue all non-blocked work.

---

## DO NOT TOUCH

Without explicit CAN(USER) approval, do not modify:
- `INSTRUCTION.md`
- `CHANGELOG.md`
- `SOURCE_OF_TRUTH.md`
- `AGENTS.md`
- `PROJECT_MEMORY.md`
- root `WORKING_CONTEXT.md`
- formal proposal files
- meeting transcripts
- research source papers
- `archive/**`
- partner model/training implementation

Do not:
- `git push`;
- `git reset --hard`;
- `git clean`;
- mass-delete;
- remove backups;
- exfiltrate credentials;
- fabricate model metrics;
- claim supervisor approval.

---

## DEVELOPMENT MOCK POLICY

Allowed:
- mock Top-3 predictions;
- mock confidence values;
- local/no-op event sink;
- placeholder Momo asset;
- temporary level data.

They must be clearly marked `DEV / MOCK / PLACEHOLDER`.

Never represent them as:
- real model performance;
- real partner output;
- final R&D visual;
- final level design.

---

## WORK MODE

R&D grants autonomy for ordinary reversible engineering choices within this task.

Recommended loop:

```text
AUDIT ACTUAL REPO
      ↓
CHOOSE/CONFIRM STACK
      ↓
IMPLEMENT VERTICAL SLICE
      ↓
TARGETED TESTS
      ↓
FIX
      ↓
IMPLEMENT REMAINING PRD SCOPE
      ↓
BROADER VERIFICATION
      ↓
REPORT
```

Plan Mode may be used to structure work, but this assignment itself authorizes implementation after the audit. Do not wait for another R&D approval unless a true product decision is blocked.

---

## FIRST OUTPUT

Before major implementation, create:

`implementation/IMPLEMENTATION_AUDIT.md`

Include:
- actual starting state;
- stack found/chosen;
- architecture/modules;
- integration seams;
- test strategy;
- implementation sequence;
- real blockers only.

Then continue implementation.

Do not stop after the audit unless a genuine product decision blocks progress.

---

## DEFINITION OF DONE

Use PRD v1.0 Definition of Done.

Minimum evidence:
- build/start success;
- core decision tests;
- complete drawing → prediction → decision → gameplay mock vertical slice;
- Redraw recovery;
- Solid consequence;
- Danger consequence;
- provider error recovery;
- final report.

---

## RETURN

At completion create:

`.ops/results/OPENCODE_WORKER_REPORT.md`

Required sections:
1. STATUS — COMPLETE / PARTIAL / BLOCKED
2. PRD VERSION
3. STARTING STATE
4. STACK USED
5. ARCHITECTURE SUMMARY
6. FILES CREATED/CHANGED
7. PRD REQUIREMENTS COMPLETED
8. TESTS / COMMANDS RUN
9. PASS / FAIL RESULTS
10. MANUAL VERIFICATION
11. MOCK INTEGRATIONS
12. REAL INTEGRATIONS
13. PARTNER DEPENDENCIES
14. UNRESOLVED PRODUCT ITEMS
15. R&D DECISIONS REQUIRED
16. KNOWN TECHNICAL DEBT
17. EXACT RUN INSTRUCTIONS
18. RECOMMENDED NEXT TASK

Do not update root governance/memory as part of worker completion.
