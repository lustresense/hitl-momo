# CAN Research Workspace — `research-can`

**Repository:** [lustresense/hitl-momo](https://github.com/lustresense/hitl-momo)  
**Branch:** `research-can` (independent **orphan**, no `main` history)  
**Owner:** CAN · **Executor:** authorized terminal agent / Agy  
**Purpose:** R&D for Sketchbook Universe's NUI / MediaPipe finger tracking, low-light robustness, gesture recognition, hand lock, and adjacent interaction experiments.

This is **NOT** a second product, official PA decision record, `main` checkout, or deployment branch. The product and authoritative CAN decisions remain on `main`. A standalone orphan branch keeps the checkout lean but **does not reduce the repository's total Git object storage by itself**. File selection and artifact hygiene matter.

> **Current state:** branch scaffold only. No experiment, training, physical webcam result, or candidate has been imported or validated by this bootstrap. Agy owns subsequent organization and publication after inspecting the **real** local workspace.

## Navigate

- [AGENTS.md](AGENTS.md) — mandatory operational contract, permissions, publication whitelist, evidence and reporting.
- [docs/plan-rev/](docs/plan-rev/) — revision plans; filename states are described below.
- [docs/attachments/](docs/attachments/) — safe context documents and attachments, **not** a second plan queue.
- `r18/`, `r19/`, `rNN/` — revision-specific experiment artifacts, **created by Agy only when actual work exists**. No empty revision folders are pre-created.

```text
research-can (orphan branch)
├── AGENTS.md
├── README.md
├── .gitignore
├── .gitattributes
├── docs/
│   ├── plan-rev/
│   └── attachments/
└── rNN/                        # not created until Agy has real revision artifacts
    ├── experiments/            # actual experiments
    ├── candidates/             # candidate source/config/patch
    ├── results/                # sanitized evidence, metrics & summaries
    ├── scripts/                # reproducible test/training/eval scripts
    ├── models/                 # only reviewed publishable small models
    └── manifests/              # provenance, exclusions and SHA-256
```

**Only one root AGENTS and one root README.** Within a revision, use meaningful file names and link all key artifacts here. Do not create nested README/AGENTS policy duplicates. Revision numbers are controlled by actual plans, not this diagram.

## Local-to-branch mapping for Agy

| Existing local source (verify first) | Destination on this branch | Treatment |
| --- | --- | --- |
| `/srv/sketchbook/mediapipe-optimize/docs/plan-rev/` | `docs/plan-rev/` | Curate and preserve plan names/status |
| Approved context images/notes/reference files | `docs/attachments/` | Check privacy, licensing and relevance |
| `/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/` | `r18/` | **Curate**, not full-folder copy; preserve originals |
| Later genuine revision sandbox | `rNN/` | Agy creates directories and updates index |

Agy must inventory current local files, sizes, actual version, scripts and evidence before deciding what maps where. Do not assume the historical `r18-ux0-sandbox` exists or that R18/UX1–UX4 results are reproducible without checking.

## Plan lifecycle (filenames, not generic progress claims)

| Filename in `docs/plan-rev/` | Meaning |
| --- | --- |
| `Rencana.md` | Not yet discussed/started |
| `[WIP] Rencana.md` | In progress, including blocked/failed tests |
| `[DONE] Rencana.md` | Plan deliverables evidenced and completed; **not** product adoption |

Agy renames the **existing exact plan filename** when the work begins, documents progress and reports actual evidence. A failed or incomplete experiment remains `[WIP]`; a document marked `[DONE]` still may have untested real camera behavior, which must be disclosed. The Owner's reference materials in `docs/attachments/` do not become product decisions or plans automatically.

## Current progress register

| Revision | Plan | Work/result | Evidence | Status |
| --- | --- | --- | --- | --- |
| R18 (expected from prior discussion) | Awaiting inventory from Agy | No contents imported | No GitHub/physical-camera evidence in this branch | **NOT_TESTED / NOT_IMPORTED** |
| Later revisions | Not created | — | — | Not started |

**Agy updates this table newest-first after each verified publication.** Link exact plan, candidate and result paths, commit SHA, baseline SHA and measurable acceptance evidence. Do not claim a PASS based only on source files or a worker summary.

## Candidate index

| Candidate ID | Base SHA | Hypothesis / change | Evaluation evidence | Limitations | Recommendation |
| --- | --- | --- | --- | --- | --- |
| — | — | No candidate published yet | — | — | Await Agy inventory |

For candidate evidence store code/config (and any patch), exact reproduction commands, dataset source/license, controlled baseline comparison, actual captured metrics, counterexamples and status. Never write invented accuracy, FPS, latency, light level, thresholds or model downloads. Dataset/model improvement, low-light safety, and gameplay feel require relevant real tests.

### NUI R&D issues to keep visible

R18 discussions covered robustness in low-light and ceiling/back lighting, distractors including **non-hand objects**, backgrounds and different skin tones, hand ownership/reacquisition and edge-of-frame tracking, pinch/draw, five-finger eraser (not a closed fist), unreliable 3-finger gestures, and Thinman directional control feel. They are **research tasks and observations**, not blanket assertions that solutions are implemented or proven. MediaPipe remains the primary base. Compare against actual game and lab code on `main` **read-only** when authorized.

## What gets pushed

**Include:** plans, safe Owner references, source of all meaningful experiments, configs and scripts, sanitized metrics/result summaries, all relevant auditable candidates, model cards, small permission-cleared model files, provenance/retained-vs-excluded file map, SHA-256 manifest and this index. Include failed candidates too if their results are instructive.

**Exclude:** unfiltered full sandbox, large/raw datasets, raw camera captures, biometric/student data, private chat exports, databases, secrets/credentials, bulky caches, `.venv`, `node_modules`, generated builds and repeated checkpoints. Default **prototype 10 MiB individual binary review limit** is a conservative publish guard, **not a measured product budget**. Large artifacts can stay local/external with manifest, checksum and explicit non-published status.

For each published candidate, Agy should create only the folders with real contents, generally `rNN/{candidates,results,experiments,scripts,models,manifests}/` as needed. Agy must never stage blindly from the local R18 sandbox.

## Agy step-by-step workflow

1. **Read [AGENTS.md](AGENTS.md) fully first.** Establish branch, permissions, baseline and exact task. On this orphan branch, do not import `main` sources or read `.context-notforagent/`.
2. Verify Git remote and authentication. Use an isolated checkout/worktree. Inspect the local `mediapipe-optimize` folders **read-only** and build a file/size/provenance inventory.
3. Select the first actual plan and mark `[WIP]` only when starting work. Register planned experiments, baseline, quality gates, and what constitutes measurable success.
4. Preserve all relevant experiment versions and publish **curated** code/config/result/report. Separate candidates from results and clearly mark FAIL/BLOCKED/NOT_TESTED.
5. Inspect staged files for secrets/private/large material, generate SHA-256 manifest, verify relative links, then update **this README** in the same commit.
6. Commit and push only to `origin research-can` under Owner-approved task scope. Verify remote commit and artifact paths. Never push to `main`, force, merge, deploy or delete local original.
7. Report using the mandatory contract below. Repeat for next revision; Agy creates `r19/`, etc. **only when work actually starts**.

If the branch exists on remote but not locally, prefer `git fetch origin research-can` and use an isolated worktree from the correct ref. Confirm the existing source checkout and avoid destructive `git switch --orphan` in the live product or training directory.

## Mandatory report from Agy to CAN after each batch

```md
### R&D <revision / candidate> — <date/time WIB>
- Status: PASS / FAIL / PARTIAL / BLOCKED / NOT_TESTED
- Scope performed:
- Baseline and candidate SHA / configuration:
- Real tests run (commands, environment, camera, lighting, dataset):
- Quantitative metrics and evidence links (or NOT_MEASURED):
- Changed / new candidate files and why:
- Regressions, failures, ambiguous cases:
- Published URL, remote SHA, number of files, total bytes, checksum manifest:
- Excluded items and why (size/privacy/cache/licensing), retained local paths:
- Blockers / proposed next action:
- Owner approval needed (if any):
```

Status should name the exact test type: synthetic landmarks, unit tests, offline dataset evaluation, physical webcam, or runtime product deployment. A report without physical-camera proof **must not claim real-world robustness**. If R&D ends with a promising but unselected candidate, report it as a **candidate**, not a product decision.

## Promoting research into `main`

Promotion is **separate, explicit and selective**. ChatGPT Web/Owner reviews the candidate/evidence first. Then, only with fresh authorization, transfer approved safe research files into `main:contexts/can/research/` through an appropriately scoped commit/PR. A product-code change needs another explicit scope and product regression checks. **Do not merge unrelated orphan histories** (`--allow-unrelated-histories` is not the process). Do not copy all of `research-can`, this branch's root governance, large results or restricted archives into `main`.

This repository is public. Instructions to avoid a path do not stop external readers or Git history access. Restrict access for true confidentiality.
