# CAN Research Workspace — `research-can`

**Repo:** [lustresense/hitl-momo](https://github.com/lustresense/hitl-momo)  
**Branch:** `research-can`, intentionally orphan and unrelated to `main` history.  
**Owner:** CAN · **Terminal executor:** Agy / explicitly authorized agent.  
**Role:** reproducible NUI and MediaPipe-oriented R&D, not deployed product source or a PA decision register.

## Current status

- **Active plan:** [R18-01 v0.3.0, WIP](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md).
- **Evidence:** UX0–UX3 offline work, UX4 dataset access/license BLOCKED, UX5 180s simulated-camera browser run reported by Agy. Physical webcam: **NOT_TESTED**.
- **Best trial candidate, not adopted product:** [UX3 MLP + hybrid safety](r18/candidates/ux3_integrated.ts), [model](r18/models/ux3_model_mlp.json), [model card](r18/models/MODEL_CARD.md). MediaPipe remains the primary hand landmark detector.
- **Pilot source prepared:** [draft PR #6](https://github.com/lustresense/hitl-momo/pull/6) adds the trained UX3 MLP to existing `/nui-lab/gesture` and `/nui-lab/canvas` modes, without creating a separate URL. **NOT BUILT, NOT DEPLOYED, webcam NOT_TESTED.** No DimHand data used.
- **Pending:** Ujang verifies typecheck/tests/build/browser, then Owner tests actual webcam; close false swipe/erase cases. No production/gameplay integration approved.
- **Latest activity, measurements, evidence and blockers:** **[LOG.md](LOG.md)**, newest first. Updated in the SAME commit as README after **every** R&D publication.

This README is the short front page. **LOG.md is the sole active chronology**. Do not create `NOW.md`, a separate `VERSION`, duplicate `AGENTS.md`, or nested README files. R&D versions follow actual revision IDs and immutable Git commits; they do not bump product SemVer.

## Workspace and files

```text
research-can (orphan)
├── AGENTS.md                 # mandatory agent contract
├── README.md                 # this quick index / status
├── LOG.md                    # append-only newest-first R&D history
├── .gitignore
├── .gitattributes
├── docs/
│   ├── plan-rev/             # plans named [WIP], [DONE] or unmarked
│   └── attachments/          # Owner context and vetted attachments
└── rNN/                      # Agy creates only for actual revisions
    ├── experiments/         # experiment methods and comparisons
    ├── candidates/          # candidate source and configuration
    ├── results/             # measured evidence and failure reports
    ├── scripts/             # reproduction, evaluation and training
    ├── models/              # safe reviewed small model artifacts
    └── manifests/           # dataset provenance, exclusions and checksums
```

Current artifacts: [R18](r18/), [consolidated report](r18/results/R18_MASTER_REPORT.md), [R18 experiments](r18/experiments/), [candidates](r18/candidates/), [scripts](r18/scripts/), [results](r18/results/), [models](r18/models/), [manifests](r18/manifests/).

## Local source mapping for Agy

| Local, inspect before use | Curated research branch destination |
| --- | --- |
| `/srv/sketchbook/mediapipe-optimize/docs/plan-rev/` | `docs/plan-rev/` |
| Selected safe context/reference files | `docs/attachments/` |
| `/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/` | `r18/` (selective results, never the entire sandbox) |
| Real future revision outputs | `rNN/`, created only when needed |

**Plan naming:** unmarked = not discussed; `[WIP]` = being worked on or blocked; `[DONE]` = specific plan deliverables evidenced, **not** deployed or formally adopted. Do not mark DONE based only on a tool summary. Preserve originals and complete provenance.

## Agy's mandatory publication cycle

1. Read [AGENTS.md](AGENTS.md), this README and [LOG.md](LOG.md). Confirm branch/HEAD, scope, Owner permission, actual local evidence, and baseline. No read/search of `main:contexts/can/research/.context-notforagent/` by terminal agents.
2. Stage only reviewed source, candidates, relevant failed/positive results, safe lightweight metrics, scripts, checksums and excluded-file inventory. Never full sandbox, raw datasets, identifiable camera footage, student information, secret, database or bulky checkpoint.
3. Run relevant checks; distinguish `UNIT_ONLY`, `OFFLINE_DATASET`, `BROWSER_SIMULATED_VIDEO`, `PHYSICAL_WEBCAM`, `NOT_TESTED`. Do not report unverified PASS.
4. **Update [LOG.md](LOG.md) newest first** with what changed, evidence, actual failures and next action. **Update this README's Current status in the same commit** with a short link to the new LOG entry. Review both changes before pushing. No log + README = **NO PUSH**.
5. Commit only to `research-can`, verify remote head, list published and excluded files, report exact SHA, QA evidence, failed scenarios, blockers, and Owner decision needed. No force-push, merge, deployment, or editing product `main`.

## Product promotion

Product documentation lives at `main:contexts/can/research/`. Once explicitly selected and authorized by the Owner, transfer **only vetted, safe, relevant** documentation/evidence into that directory via a scoped product PR. The orphan branch must **not** be merged wholesale into `main` with `--allow-unrelated-histories`. NUI Lab proof-of-concept code is a separate scoped integration and real webcam/UX acceptance gate, not automatic approval of a new gameplay model. See [LOG](LOG.md) and the [R18 physical-camera protocol](docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md).

**Security reminder:** all branches in this GitHub repository are public. Markdown restrictions do not protect private archives. Store confidential data outside public Git history.
