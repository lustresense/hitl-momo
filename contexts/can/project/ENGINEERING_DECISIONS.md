# Engineering Decisions

## ED-001 — Repository-owned portable AI brain
Governance, hot context, long memory, and handoffs live in the repository instead of one AI vendor's chat history.

## ED-002 — ECC memory is context, not policy
Persisted ECC-style memory remains unreviewed context until validated.

## ED-003 — Hot context remains small
`PROJECT_MEMORY.md` and `WORKING_CONTEXT.md` are intentionally compact.

## ED-004 — Migration does not select the application stack
Historical KAPLAY/Kaboom/MediaPipe/TensorFlow/etc. mentions do not become active stack choices solely because they exist.

## ED-005 — Dangerous automation is opt-in
No auto push, destructive cleanup, governance mutation, or remote backup deletion.

## ED-006 — Runtime role protocol
Explicit delegated `ROLE: WORKER` wins. Otherwise a direct IT harness defaults to IT Orchestrator.

## ED-007 — Cross-team interchange through `.ops`
R&D, visual, task, result, and review artifacts use repository-owned `.ops` paths.

## ED-008 — Conservative Drive backup
Project tooling uses rclone `copy`, not mirror `sync`.

## ED-009 — PRD supplied after worker bootstrap
Base v2 contains no product PRD. R&D supplies it after the chosen IT worker is started.
