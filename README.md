# CAN Research Workspace — `research-can`

**Repo:** [lustresense/hitl-momo](https://github.com/lustresense/hitl-momo)  
**Branch:** `research-can`, intentionally orphan and unrelated to `main` history.  
**Owner:** CAN · **Terminal executor:** Agy / explicitly authorized agent.  
**Role:** reproducible NUI and MediaPipe-oriented R&D, not deployed product source or a PA decision register.

## Current status

- **R19 execution (`[WIP]`, Batch 1 — Stages P0/P1 Audit + P2 Geometry/FSM COMPLETE):** [R19-01 WIP plan](docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md), [22-Dataset Provenance & License Audit](r19/results/R19_DATASET_AUDIT.md), [Stage P2 Geometry & FSM Experiment](r19/experiments/exp_r19_p2_pistol_geometry_fsm.md), and standalone `G1_pistol` code ([pistol_geometry.ts](r19/candidates/pistol_geometry.ts), [pistol_fsm.ts](r19/candidates/pistol_fsm.ts)).
  - **Measured P2 highlights:** `0.00°` multi-aspect error (`0` mismatches vs `G0` `44` on `9:16`), `99.11%` 3-class acc on `10,500` synthetic 3D palmar/dorsal poses (`100%` std & `92%` dorsal-short Dorsal Right Pointing Left, `0%` false pinch/PRESS on `OTHER`), `100%` horizontal `RIGHT -> RIGHT+JUMP -> RIGHT` continuity across `75/60/30/15 Hz` with exact `1` jump (`J3_pulse_consumed`), and `0.24%` (`1.11/min`) FSM false activation on unseen `IPN NOG` vs `57.98%` `G0` (`IPN P1F` still sees `5.59%` relaxed-thumb `PRESS`).
  - **Active in VM sandbox (Batch 2 pending):** `Natural RGB v3` (`n66hhk695h.3`), `HandGesture-5G` Range stream (`1,807` CRC32-unique entries), `HANDS RGB-D Horiz_H*` Range slice, followed by `G2..G5` training/calibration, `L0..L2`, and isolated browser WASM harness. Physical webcam remains **`NOT_TESTED`**.
- **R18 existing plan:** [R18-01 v0.3.0 WIP](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md), [model card](r18/models/MODEL_CARD.md) and [manifest](r18/manifests/dataset_manifest.json) remain baseline reference evidence.
- **Product source:** [PR #6](https://github.com/lustresense/hitl-momo/pull/6) merged to `main@c14b1d0` for existing `/nui-lab/gesture` and `/nui-lab/canvas` only; student gameplay and deployment untouched.
- **Latest record:** [LOG.md](LOG.md), `R19-EXEC-20261118-01`. Every research commit updates README+LOG atomically.

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

Current artifacts: [R19](r19/), [R19 Dataset Audit](r19/results/R19_DATASET_AUDIT.md), [R19 Stage P2](r19/experiments/exp_r19_p2_pistol_geometry_fsm.md), [R19 manifests](r19/manifests/), | Baseline: [R18](r18/), [consolidated report](r18/results/R18_MASTER_REPORT.md), [R18 experiments](r18/experiments/), [candidates](r18/candidates/), [scripts](r18/scripts/), [results](r18/results/), [models](r18/models/), [manifests](r18/manifests/).

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
