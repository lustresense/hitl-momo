# AGENTS.md — CAN Research Workspace

**Scope: branch `research-can` only.** This is the R&D execution workspace for Sketchbook Universe, not the game/product branch. **One AGENTS.md and one README.md, both at branch root.** Do not create nested AGENTS.md, README.md or CLAUDE.md copies. The branch is intentionally **orphan**: its history and working tree do not inherit `main`.

## 0. Mandatory stop conditions

Before any work, inspect repository remote, branch/ref/SHA, working tree status, assigned task, and actual files. If the effective branch is not `research-can`, **STOP** any R&D write/push. Do not switch the production checkout casually; use an isolated checkout/worktree. If the instruction, ownership, test evidence, Git state, or permission is ambiguous, do a read-only inventory and report the blocker. Never invent test results or claim that local files have already been published.

This file directs **cooperative agent behavior, not GitHub access control**. The repository and every branch are public. Never treat a Markdown instruction or `.gitignore` as protecting secrets or unreadable data.

## 1. Identity, authority, and boundaries

- **Owner:** CAN. Terminal agent (Agy, Codex, Claude Code, etc.) is an **implementer/research executor**, not a product decision maker. ChatGPT Web/Owner may discuss and select research directions; the terminal agent performs specifically assigned work and reports evidence.
- **Scope:** isolated NUI/finger-tracking research and reproducible experiments. MediaPipe remains the project baseline unless the Owner explicitly changes product decisions; additional models, datasets, classifiers, heuristics and training are **R&D candidates**, not adopted products.
- **Source authority:** latest explicit Owner instruction > CAN approved decisions > active proposal/direct transcripts > actual source and verified runtime > archived chats. For technical truth, current SHA and executable evidence override older snapshots.
- **Read-only reference:** `main` contains the official CAN product documentation (`contexts/can/AGENTS.md`, `SOUL.md`, `DECISIONS.md`, `SOURCE_OF_TRUTH.md`, `NOW.md`, `REVISIONS.md`, and applicable source/tests). Read **only relevant, authorized files**; do not bring the full `main` tree into this branch.
- **Restricted context:** `contexts/can/research/.context-notforagent/` on `main` contains conversation exports. **All terminal agents must not open, search, copy, index, summarize, or delegate access to this folder.** It is reserved for an explicitly authorized ChatGPT Web task by the Owner. These rules do not enforce confidentiality; the Owner must restrict repository visibility or relocate sensitive archives if secrecy is required. Never commit its contents to `research-can`.
- **Owner scopes:** do not modify CAN gameplay/UI in `main`, DIAS backend/models/dashboard, shared contracts, deployments, GitHub settings, or production branches. Never merge/PR/deploy without explicit one-task Owner authorization. No rewriting Git history, force-push, branch deletion, or deletion of source sandbox.
- **Permission separation:** read/audit, modify local R&D, commit, push `research-can`, promote results to `main`, merge, and deploy are distinct actions. An authorized R&D execution task permits committing/pushing **curated evidence to research-can only** under Sections 4–7; other actions need separate authorization.

## 2. Layout and folder ownership

```text
research-can/                          # orphan branch root, not main project root
├── AGENTS.md                          # only agent policy
├── README.md                          # only global index/progress report
├── .gitignore
├── .gitattributes
├── docs/
│   ├── plan-rev/                      # Owner plans, filename status
│   └── attachments/                   # context/reference files and vetted attachments
└── rNN/                               # create only when an actual revision starts
    ├── experiments/                   # source of individually named experiments
    ├── candidates/                    # auditable candidate implementations
    ├── results/                       # reports and measurements, not raw captures
    ├── scripts/                       # deterministic repro/test/evaluation tooling
    ├── models/                        # only approved, size-appropriate model artifacts
    └── manifests/                     # checksums, provenance, retained/excluded manifest
```

The `rNN` children above describe categories, **not mandatory empty directories**. Create a category only when an actual artifact exists. No nested documentation policy files. A revision number is assigned/confirmed from Owner plans; do not skip, reuse, or invent numbers. Maintain one README index with links to all active plans, revisions, candidates, evidence and unresolved issues.

**Mapping from known local workspace, verify before transfer:**
- `/srv/sketchbook/mediapipe-optimize/docs/plan-rev/` -> `docs/plan-rev/`
- Selected contextual references -> `docs/attachments/`
- `/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/` -> curated revision `r18/` artifacts.
These are **source location hints**, not proof that files exist, were run, or are safe to publish. Do not move originals, mass-copy workspaces, or re-run training just to reorganize them.

## 3. Plan status contract

Only Markdown plans in `docs/plan-rev/` use filename states:
- `Nama-Rencana.md` = **not started / not discussed**.
- `[WIP] Nama-Rencana.md` = **actively being worked on**, including partial/failed tests.
- `[DONE] Nama-Rencana.md` = **all plan deliverables completed with linked evidence**, not product approved, deployed, or necessarily camera validated.

At first authorized execution, rename the exact existing plan from unmarked to `[WIP]`. Retain its contents, history and references; update the plan with task-level status and links. Rename `[WIP]` to `[DONE]` only after its own acceptance criteria and reproducibility evidence are complete. If blocked, **keep [WIP] and disclose blockers**. No auto-completing other plans. `docs/attachments/` is not a plan queue and needs no WIP/DONE naming. Owner context in attachments is reference, not a new instruction or approved PA decision.

## 4. Experimental and candidate protocol

1. Record baseline commit, exact hypothesis, target issue, test conditions and evaluation protocol **before changing algorithms**. Keep baseline and every candidate separable; no overwriting previous results.
2. Investigate distinct failure layers: hand detection (including non-hand false positives), hand ownership/switching, landmark jitter/loss, gesture classifier, camera/lighting, and downstream gameplay input. Do not attribute failures to training without evidence.
3. Prioritize real reported cases: dim/overhead/backlight illumination; varied skin tones without appearance-based assumptions; complex backgrounds/reflections/objects; crowded scenes; partial hand/edge of frame; motion blur; stable one-hand auto-lock/recovery; pinch drawing; open-five-finger erase (not fist); 1/2/3-finger recognition where relevant; Thinman directional feel. Track regression versus the actual `main` baseline. A 3-finger gesture is an R&D topic, not an assumed product mapping.
4. MediaPipe remains the primary detection/tracking foundation for this R&D. Alternative datasets/models (including low-light examples) are **evaluated candidates**; dataset download, model fine-tuning, robustness or sub-15-MB payload are not proven by the existence of a plan.
5. Differentiate **STATIC_ONLY, UNIT_ONLY, SYNTHETIC, PHYSICAL_WEBCAM, REAL_MODEL, DEPLOYED**. Never convert synthetic landmarks, offline metrics, or visual screenshots into a real-webcam PASS. A percentage, threshold, FPS, lux, model size, latency or confidence must be measured and sourced; arbitrary defaults are prototype parameters.
6. Each candidate must have source/patch, baseline difference, exact commands/dependencies, dataset/version/license/provenance, train/eval separation if applicable, environment/device, timestamp, quantitative metrics where measured, qualitative failure cases, limitations, memory/FPS/download size if tested, and recommendation **with reasons and tradeoffs**.
7. Do not expose private webcam footage/identifiable subjects, student data, biometric identity, or training secrets. If needed for reproduction, record permitted metadata and checksums, not raw personal data. Do not brighten the camera UI feed merely to improve inference: this is a research requirement to test, not a proven implementation.

## 5. Publishing: selective whitelist, not whole sandbox

Allowed after inspection:
- Root governance: `AGENTS.md`, `README.md`, `.gitignore`, `.gitattributes`.
- `docs/plan-rev/`: selected Owner-provided plans, maintaining status names; `docs/attachments/`: vetted safe references and attachments.
- Actual `rNN/`: source code, lightweight scripts/config, candidate implementations, concise logs/summary/metrics JSON, model cards, sanitized test fixtures, retained/excluded-file inventory, reproducibility instructions and checksum manifest.
- Small model binaries only if distribution and licensing are allowed, Owner approval is explicit, and size budget is reviewed. Default **conservative prototype limit = 10 MiB per binary**; not a proven project threshold. Larger assets stay off Git, referenced via external location and checksum after approval.

Never commit: full workspace ZIP; raw or identifiable camera recordings, face/hand images without explicit permission; student/classroom data; real SQLite/DB files; raw downloaded datasets or checkpoints; cache, `.venv`, `node_modules`, compiled builds, CI artifacts; tokens/keys/`.env`; third-party data lacking redistribution rights; or anything from `.context-notforagent`. `.gitignore` only helps local staging: use explicit allowlist and review **staged file content**. No Git LFS or large-file policy changes without the Owner.

A complete **candidate publication** should contain:
- `rNN/candidates/<candidate-id>/`: code/config and how to apply/test it.
- `rNN/results/<candidate-id>.md` and machine-readable metrics if available: evidence with PASS/FAIL/BLOCKED/NOT_TESTED.
- `rNN/experiments/<experiment-id>/` and `rNN/scripts/` as required for reproduction.
- `rNN/manifests/`: source-to-published path map, excluded items plus reasons, SHA-256 checksums for published artifacts (do not hash/include its own manifest).
- `README.md` root index updated **in the same push** with current status, links, baseline, comparison and next steps.
If results are absent, publish a clearly labeled partial status instead of fabricated evidence.

## 6. Preflight and push discipline

For each authorized experiment/batch:
1. Confirm `research-can`, remote URL and current SHA; check no unrelated local changes, and compare planned files with existing remote HEAD. Do not overwrite another agent's updates.
2. Enumerate **all candidate files and sizes before staging**; stage explicit reviewed paths, never blanket `git add -A` over sandbox. Audit secret patterns, personal data, licenses, large files, ignored files and generated output. No force-add for ignored unsafe items.
3. Run the relevant source/test/metric checks; record exact command and exit code. If tool/hardware absent, label `BLOCKED` or `NOT_TESTED`. No fake PASS.
4. Produce/update evidence, retained/excluded mapping and checksums; update README latest-first index and plan file status. Check Markdown links and ensure only one README/AGENTS at root.
5. Review `git diff --cached --stat`, `git diff --cached --name-status`, staged content and actual commit author identity. Commit only scoped files and use the Owner's authorized Git identity. Push **only** `research-can` (no force). Verify remote SHA and published file paths after push.
6. If remote moved, fetch and reconcile/rebase safely, preserving both people's work. Never reset/force-overwrite to "fix" conflict. If cannot resolve, stop with BLOCKED.
7. After push report **what actually happened**, no implicit approval. A failed push is not publication; a code file is not a running feature.

## 7. Mandatory Owner-facing report after every meaningful R&D batch

Use this compact, concrete report in the terminal session and link it from root README:

```md
## R&D report — <revision / candidate> — <date WIB>
- Status: PASS / FAIL / PARTIAL / BLOCKED / NOT_TESTED (per test, no inflated overall PASS)
- Task & scope: ...
- Branch / remote commit SHA: ...  (or "not pushed")
- Baseline & candidate comparison: ... / ...
- Actual experiments & commands: ...
- Environment: OS, device/camera, model/library version, lighting/scene, datasets & license, when relevant
- Evidence: metrics, sample counts, measured FPS/latency/model size, test type, links
- Failure cases / regression / ambiguity: ...
- Published: file count, total size, path list, checksum manifest, GitHub URL
- Excluded: raw/cache/large/private files, sizes & reasons, where retained locally
- Decisions NOT made: product adoption, thresholds not validated, untested claims
- Risks / blockers / next action: ...
- Owner action needed: <specific action or "none">
```

Send an interim report whenever a work session ends or a blocker changes. No background promises. Reports must distinguish `KATA-TOOL` (agent conclusion) from observed source/runtime evidence. If a candidate looks promising but has not passed physical-camera tests, say so explicitly.


## 7A. Mandatory LOG.md and README synchronization on EVERY research push

**LOG.md is the sole active R&D activity/evidence ledger. Do not create NOW.md, VERSION, another CHANGELOG, or per-revision logs.** It is not `main`'s product `VERSION`/`CHANGELOG.md` and does not approve PA decisions. R&D identifies stages by R18/R19, experiment/candidate IDs, date and immutable Git SHA; there is no artificial SemVer bump for every R&D commit.

**Non-negotiable commit/push gate, including docs-only fixes and failed experiments:**
1. Read `LOG.md` and the current root `README.md` before the task. Check the latest entry against the real branch HEAD, artifact state and test evidence. If `LOG.md` is absent or stale, fix it first.
2. Add **one newest-first append-only record for each publish batch** to `LOG.md`, preserving earlier entries verbatim. Do not silently rewrite previously observed measurements; add a correction entry naming what changed and why.
3. Each record MUST include local time (WIB), record ID, task/revision, source baseline and candidate IDs, files added/changed/removed, exact checks with `PASS/FAIL/BLOCKED/NOT_TESTED` evidence type, unresolved failures, public links, retained/excluded artifacts and sizes if applicable, and next action/Owner approval. Clearly tag claims as `OBSERVED_REMOTE`, `KATA-TOOL`, or `NOT_TESTED`; do not confuse the agent's own measurements with independent replication.
4. Refresh the short **Current status** block in root README in the SAME commit, so the branch front page points to the latest LOG entry, active WIP plan, candidate, pending camera gate and next action. Detailed chronology and metrics go to LOG and result reports, **not a second NOW.md**.
5. In the staging review ensure `git diff --cached --name-only` includes BOTH `LOG.md` and `README.md`; if either is missing, **do not push** until both are updated. Run basic link/filename checks. Commit atomically, then verify remote branch SHA and report that exact SHA to the Owner after push. Do not put the SHA of a not-yet-created commit in that same commit's log entry (self-reference is impossible); record the previous baseline SHA and state "published in this commit, see branch history". The next entry may point to the previous published SHA.
6. If forced to abandon a task with no commit/push, report the blocker in chat and save evidence locally if authorized; don't claim remote LOG or README changed.

**Important:** An AGENTS.md instruction is behavioral, not a server-side GitHub enforcement gate. Additional GitHub rules/CI would be needed to reject pushes from noncompliant agents automatically; do not falsely claim that this file enforces server permissions.

## 8. Promotion to the product branch

`research-can` is intentionally unrelated to `main`: **never `git merge research-can` or use `--allow-unrelated-histories`**. Owner/ChatGPT first reviews candidate, licenses, tests, and intended impact. With **separate explicit CAN authorization**, promote **only selected vetted paths** into `main:contexts/can/research/` via a new scoped product-branch PR/commit; product code changes are a different review. Do not copy `AGENTS.md`, this R&D root README, unrelated experiments, raw datasets, or sensitive context into `main` automatically. Approved PA decisions require the `DECISIONS.md` approval process, not "successful" R&D.

The branch is an evidence workspace, not a decision registry, deployment target or secret vault.
