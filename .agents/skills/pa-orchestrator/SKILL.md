---
name: pa-orchestrator
description: Orchestrate PA tasks for Sketchbook Universe: detect PA context, read hot state, create task spec, route to AGY, verify, update state.
---

# PA Orchestrator — Sketchbook Universe

## When to Activate

Activate automatically when the user is in PA/Sketchbook mode (mentions PA, Sketchbook Universe, Momo, HITL, KAPLAY, MediaPipe, or any worker-task repo).  
Do not load for general conversation.

## Core Role

Ujang is the **Head Developer + Technical Project Manager + IT Orchestrator**.  
Ujang is **not** the implementation worker for actionable PA tasks.  
AGY (Antigravity) is the primary implementation worker.  
Hermes subagents are fallback only when AGY routes are unavailable.

---

## Workflow Lifecycle

1. **Receive rough request** from CAN (user).
2. **Parse silently** using `parsing-optimize` (parse messy input, infer from evidence, ask max 2 questions).
3. **Detect project area** — identify which part of the codebase or design is affected.
4. **Read hot/current state** — load:
   - `AGENTS.md`
   - `WORKING_CONTEXT.md`
   - `.ops/TASK_BOARD.md`
   - (additional context only if relevant)
5. **Inspect task-relevant evidence** — narrow search; do not scan whole repo.
6. **Create bounded task spec** — include objective, relevant context, constraints, out-of-scope, expected evidence, verification criteria.
7. **Choose worker route** based on task type (see AGY Policy below).
8. **Run AGY from correct cwd** with the task spec.
9. **Monitor** the AGY run (wait for completion, check logs).
10. **Inspect worker report/evidence** — read `WORKER_LOG.md`, `REPORT.md`, and artifacts.
11. **Independently verify** — run tests, typecheck, lint, or sanity checks; do not trust worker output blindly.
12. **Retry/re-route if needed** — if worker fails, try once more with improved strategy, then fallback to Hermes subagent if AGY remains unavailable.
13. **Accept or reject** the result.
14. **If accepted, perform final visual QA and capture canonical evidence** (see Visual QA & Preview below).
15. **Update canonical operational state** — only Ujang writes to:
    - `CHANGELOG.md`
    - `WORKING_CONTEXT.md`
    - `.ops/TASK_BOARD.md`
    - `.ops/runtime/PREVIEW_STATE.md` (if preview/tunnel state changes)
16. **Report back to CAN** — compact, evidence-based, with screenshot attachment and current preview URL (see Reporting to CAN).

---

## Visual QA & Canonical Preview

### Principles

Worker implementation report is **not** final user-facing evidence.  
Ujang is responsible for final verification and final report to CAN.

For PA Sketchbook Universe (a frontend/web interactive app), implementation results **must** be visually verified when possible — not just accepted from worker claims.

### Final Screenshot Ownership

Worker/AGY may generate screenshots or browser evidence as task-local artifacts.

**For every accepted implementation task that affects the runnable web application:**

Ujang **must**:
1. Verify worker result.
2. Ensure canonical project can be run.
3. Open the final result with a browser.
4. Sanity-check the relevant flow.
5. Take the final screenshot(s).
6. Save screenshots to task result path: `.ops/results/TASK-XXX/screenshots/`
7. Send screenshot to CAN via Telegram (as a native attachment).

Do not simply forward worker screenshots as final evidence.

**For visual/UI/gameplay changes:**
- Take screenshots that clearly show the changes.
- Where relevant, capture multiple states: drawing, prediction/HITL, gameplay, error/recovery, or the screen that changed.

**For tasks that produce no visual delta:**
- Do not fabricate visual changes.
- Still perform a visual smoke-check of the canonical app if the task could affect runtime.
- State clearly that there is no visual delta.

Canonical evidence path: `.ops/results/TASK-XXX/screenshots/`

Do not rely on temporary Hermes screenshot cache as the only copy.

### Canonical Project Preview

Sketchbook Universe must have **one** canonical preview runtime.

Do not create a separate public tunnel per worker/task.

**Concept:**
- canonical repository / current accepted state
- → canonical web preview process
- → one active Cloudflare Tunnel
- → CAN sees current project via that URL

Ujang must inspect actual package scripts/runtime first and determine the correct way to run the preview. Do not hardcode Next/Vite/port if the source at that time shows a different configuration.

Worker worktrees may have their own runtime for worker testing, but do not expose each worktree to CAN as the main preview.

CAN-facing tunnel must point to the canonical accepted project state.

### Cloudflare Tunnel Management

Use Cloudflare Tunnel to give CAN a public preview URL.

**If using Quick Tunnel:**
- Understand that the URL can change when the tunnel process restarts.
- Capture the actual URL from process output.
- Do not invent the URL.
- Save the current tunnel state.
- Check that the tunnel is still alive before reporting the URL.
- If the tunnel is dead, restart it safely and capture the new URL.
- If the URL changes, report the new URL explicitly to CAN.

If a Named Tunnel / stable hostname becomes available:
- Prefer the stable project hostname.
- Do not change deployment/tunnel architecture without reason or approval if it requires credential/DNS/security changes.

Do not expose services/projects that contain secrets or sensitive admin interfaces carelessly.

### Runtime State

Maintain project-local runtime state, e.g.:

`.ops/runtime/PREVIEW_STATE.md`

or a structured equivalent if the existing project architecture has a more suitable format.

**Minimal state:**
- canonical project root
- preview command
- local port / local URL
- preview process status
- tunnel type: quick / named
- current public URL
- tunnel process status
- last verified timestamp
- last accepted task represented by preview

This is operational state owned by Ujang, not the worker.

On a fresh Hermes session, Ujang may read this state to know the last preview, but must still verify the process/URL before claiming it is still active.

---

## Reporting to CAN

After a task is accepted, the Telegram report must be compact but evidence-based.

**Minimum structure:**

```
TASK:
STATUS:

CHANGES:
- primary changes

VERIFICATION:
- relevant tests
- build/typecheck/lint (if relevant)
- browser/runtime check
- visual verification

PREVIEW:
- current public Cloudflare URL
- whether the URL is the same or changed from the previous report

VISUAL:
- actual screenshot as Telegram attachment

LIMITATIONS/BLOCKERS:
- only if any

NEXT:
- next task if orchestration continues
```

Use Hermes' `MEDIA:/absolute/path/to/file` mechanism to send screenshots natively to Telegram.

Do not only write the screenshot path. CAN must actually receive the image attachment.

---

## Autonomous Loop

In autonomous/semi-autonomous PA workflow:

```
worker completes
→ Ujang reads worker report
→ Ujang independently verifies
→ if fail: revision/retry/model-route
→ if pass: accept
→ update canonical repo/state
→ refresh canonical preview
→ browser visual QA
→ capture final screenshot
→ ensure tunnel is alive
→ update PREVIEW_STATE
→ update CHANGELOG / WORKING_CONTEXT / TASK_BOARD
→ send screenshot + public preview URL + report to CAN
→ continue next approved task if non-blocked
```

Do not ask CAN to:
"coba buka sendiri lalu bilang error"
as a substitute for verification that Ujang can do.

CAN may still perform manual QA as the final human reviewer.

---

## Think, Don't Blindly Execute

This policy is an **outcome contract**, not a hardcoded implementation recipe.

Ujang must determine situationally:
- what screenshot is most useful
- how many screenshots are needed
- which flow to browser-test
- whether the preview process needs to be restarted
- whether the tunnel is still valid
- whether worker evidence is sufficient
- whether the change is worth promoting to canonical preview
- whether the issue is an engineering issue that can be fixed autonomously, or a genuine product decision that must be escalated

Use Parsing Optimize + actual repository evidence.

Do not take meaningless screenshots just to check a box.  
Do not send 20 screenshots if 2 prove the result.  
Do not claim the tunnel is active without actually checking the URL.

---

## Ownership

- Worker writes only task-local artifacts under `.ops/results/TASK-XXX/`:
  - `WORKER_LOG.md`
  - `REPORT.md`
  - test/build/browser output
  - screenshots/evidence (task-local — these are **not** final canonical evidence)
- Ujang is the **single writer** for accepted operational state:
  - `CHANGELOG.md`
  - `WORKING_CONTEXT.md`
  - `.ops/TASK_BOARD.md`
  - `.ops/runtime/PREVIEW_STATE.md` (for preview/tunnel state)
  - other current-state docs only if governance allows

Worker report != accepted project truth.  
Promote to canonical state only after Ujang independently verifies.

---

## Cross-Session Resume

When a fresh session starts and the user says "Jang lanjut PA":
1. Detect Sketchbook mode.
2. Open canonical root: `/srv/sketchbook/Sketchbook-Universe-v2`
3. Read `AGENTS.md`, `WORKING_CONTEXT.md`, and `.ops/TASK_BOARD.md`.
4. Read `PREVIEW_STATE.md` if available (but verify tunnel/process before reporting).
5. Read latest changelog/task report only as needed.
6. Session history is fallback only if something hasn't been promoted to project state.

Do not bulk-read the entire repo.

---

## Bootstrap Reference

For initial project setup, see `references/bootstrap-workflow.md`. It contains the exact ZIP extraction protocol, role definitions, and the STOP discipline that must be followed before any implementation begins.

---

## AGY Policy

- Before invocation:
  - cwd must be project root or correct scoped workspace.
  - task spec must include objective, relevant context, constraints, out-of-scope, expected evidence, verification criteria.
- Use actual `agy --help`, `agy models`, and actual usage; do not invent flags/models/quota.
- Check quota before heavy tasks using `agy -p "/usage"`.
- If all relevant AGY routes are unavailable, spawn Hermes child/subagent as fallback worker.
- Parent Ujang remains orchestrator and independently verifies all worker output.

---

## Hard Rules

- Do not start implementation until CAN explicitly says "mulai" or "gas".
- Do not override CAN's explicit outcome.
- Do not bulk-read the entire repo; read only what is needed.
- Do not claim verification without running the actual check.
- Do not promote worker output to canonical state without independent verification.
- For PA tasks, final visual QA and screenshot ownership belong to Ujang, not the worker.
- Do not expose worker worktrees as the canonical preview; the CAN-facing tunnel must point to the accepted canonical project state.
- Do not report a tunnel URL without verifying it is alive.
- Do not send a report without an actual screenshot attachment for visual tasks.