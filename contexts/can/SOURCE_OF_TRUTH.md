# CAN Source of Truth — monorepo path and authority map

The folder `contexts/` is the **Owner Context Registry**. Do not rename it casually: all agents route via root `AGENTS.md` to `contexts/can/AGENTS.md` or `contexts/dias/AGENTS.md`. This file maps references and authority; **it is not a second decision ledger**.

R8.3 reconciliation: D-20261126-03 through -06 control the approved product changes. Current `main` is the implementation reference, not an automatic approval of every behavior or residue. STT stub, DEV route, legacy gesture paths and lab history do not supersede decisions. Report approved design separately from verified implementation.

| Need | Source, in priority order |
|---|---|
| Current user task / permission | Most recent direct user instruction; current Git branch, SHA and working tree. Historic branch directives cannot authorize future auto-merge |
| CAN product decision | Current direct Owner instruction → `contexts/can/DECISIONS.md` (Aktif/Belum dikunci/Direvisi/Dicabut) → active formal proposal/direct lecturer or user transcript |
| CAN working/TOV instructions | `contexts/can/SOUL.md` Part A+B; routed via root and CAN `AGENTS.md` |
| Actual implementation | Current `frontend/implementation/` source/config/tests → verified current runtime; code presence alone is STATIC_ONLY |
| Current CAN progress | `contexts/can/NOW.md`, `REVISIONS.md`, `WORKING_CONTEXT.md`, `PROJECT_MEMORY.md`, `project/OWNER_MANDATES.md` |
| Portable session continuation | `contexts/can/SESSION_HANDOFF.md`; always compare with actual Git state |
| Team/roles/rules | `contexts/can/docs/team/TEAM_OPERATING_MODEL.md`, `ROLE_PROTOCOL.md`, `contexts/can/.agents/rules/*.md` |
| CAN coding details | `frontend/implementation/AGENTS.md`, `docs/execution/ARCHITECTURE_ACTUAL.md`, `RUN_GUIDE.md`, relevant handoffs |
| Shared contracts | `contracts/README.md`, `contracts/API_INVENTORY.md` plus both owner routers |
| Engineering versions | Root `VERSION` and root `CHANGELOG.md`. Legacy `implementation/CHANGELOG.md` is history only |
| Research and academic | Current formal proposal, direct notulensi, actually available Dapus papers; AI meeting summaries do not count as lecturer approval |

Never interpret the ChatGPT Project `WORKING_STATE.md` as automatically imported into this repository. No agent account automatically retains another account's chat session, uncommitted changes or verification evidence. Unavailable file or unresolved conflict must be reported, not invented.

Latest explicit CAN request on 2026-11-17 authorized a **single `main` documentation bootstrap repair**, not a standing right to push, deploy or merge. Old references to `ujang-monorepo` or `claude-monorepo` remain historical evidence.
