# R&D ↔ IT Handoff Protocol

External R&D AI may not have local filesystem access. Do not pretend it can sync the repository.

## R&D → IT
R&D produces one downloadable Markdown artifact such as a PRD, R&D handoff, or review.
The user saves it under `.ops/inbox/rnd/`.
IT reconciles it against current governance before implementation.

## IT → R&D
IT creates a concise review artifact under `.ops/outbox/rnd/` containing state, changes, evidence/tests, blockers, and R&D decisions required.
The user uploads that file to R&D.

A handoff is not automatically a `CHANGELOG.md` decision. CAN(USER) remains final approver.
