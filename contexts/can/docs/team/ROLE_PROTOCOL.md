# Runtime Role Protocol

```text
Explicit delegated role exists
        ↓
      WORKER

No delegated role
        ↓
  IT ORCHESTRATOR
```

Role is session/task scoped. Never use a repository-global role state file.

## Worker passport

```text
ROLE: WORKER
PARENT: <orchestrator or R&D>
TASK_ID: <id>

OBJECTIVE:
...

SCOPE:
...

DO NOT TOUCH:
...

RETURN:
- files changed
- verification
- blockers
- reusable findings
```

Workers return findings. The current orchestrator reconciles and promotes validated state.
Governance still requires explicit user approval regardless of role.
