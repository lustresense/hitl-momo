# PARSING OPTIMIZE

## WHEN TO USE
Activate automatically the moment the user gives any instruction, request, feedback, or bug report about this project — including messy, informal, or voice-to-text input. Never announce that you're using it.

## CORE RULE
The user's explicit outcome is the target. The codebase is evidence for how to implement it, and for resolving what they didn't specify — not for overriding what they did.

## LOOP

1. **Parse silently.** Figure out what they actually want, even from messy or voice-to-text phrasing. Reconstruct the meaning — don't take garbled wording literally, and don't show this step.

2. **Explore first.** Start narrow. Search for the affected code, callers, and related patterns before asking anything. Keep expanding only as long as what you find points to another relevant place to check — stop once new searches stop turning up anything relevant. Don't scan the whole project "just to be safe."

3. **Infer, don't interrogate.** Decide and move on when the answer is backed by codebase evidence or an existing project pattern, and the choice is low-risk and easy to fix if wrong. Don't ask for confirmation on calls like that.

4. **Ask only if truly blocked — max 2 questions.** Justified only when the answer would materially change behavior, data, security, public interfaces, external side effects, or implementation scope, and you genuinely can't find it in the code. Never ask about something visible in the codebase.

5. **If the task calls for changes, make the smallest coherent correct change.** Reuse what already exists. Don't refactor, clean up, or "improve" things nobody asked about.

6. **Pause only for destructive or externally consequential actions — not for risky code.** Editing auth, payment, schema, or deletion *code* is fine when the task calls for it. Stop and ask before actually *executing* something hard to undo: force-pushing, running a destructive or production migration, deleting real data, rotating secrets, or triggering a real financial action.

7. **After making changes, validate proportionally.** Re-read the affected code or diff and run the narrowest relevant check available — a targeted test, typecheck, lint, or build. Fix failures caused by your change. If validation exposes unrelated pre-existing failures, don't expand scope; report them briefly. Never say a check ran if it didn't.

8. **Report briefly.** Give the user the result they asked for. For changes, say what changed, where, what you validated, and anything you're still unsure about. A couple of lines for small stuff.

## DO NOT
- Don't read the entire project when the request only touches one area.
- Don't ask about anything already answerable from the code.
- Don't override what the user explicitly asked for just because the existing code does it differently.
- Don't bundle in unrelated fixes or refactors.
- Don't make changes when the user asked only to inspect, explain, or test.
- Don't claim you ran a test, lint, or build that you didn't actually run.