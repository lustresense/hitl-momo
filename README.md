# CAN Research Workspace — `research-can`

**Repo:** [lustresense/hitl-momo](https://github.com/lustresense/hitl-momo)  
**Branch:** `research-can`, intentionally orphan and unrelated to `main` history.  
**Owner:** CAN · **Terminal executor:** Agy / explicitly authorized agent.  
**Role:** reproducible NUI and MediaPipe-oriented R&D, not deployed product source or a PA decision register.

## Current status

- **R20-01 R&D plan (NOT_STARTED / unmarked; next training window 19 Nov 2026):** [NUI R20-01 v0.2.0 — GPU Teacher–Student / CPU-only low-light](docs/plan-rev/NUI_R20-01_v0.2.0_GPU_Teacher_Student_CPU_Only_LowLight_Execution_Plan.md) (**58,083 B**, SHA-256 `af57896202a0e02e8e6cdade8886d17c7e03d531285b9e924989da1e665b818e`). Scope: retrain classifier R19-derived on GPU server, test teacher–student vs supervised student, no change to MediaPipe model; CPU-only HandLandmarker/face/student inference at NUI, cold-first-use <25,000,000 B as **unproven gate**, low-light/anti-distractor tests on Owner hardware. **No R20 datasets curated/training/model/CPU benchmark/webcam test yet.** Plan remains unmarked until Agy starts. See [latest LOG](LOG.md) `R20-PLAN-20261118-01`.

- **R19 execution (`[WIP]`, Stages P0–P4 COMPLETE offline/browser; physical webcam `NOT_TESTED`):** [R19-01 WIP plan](docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md), [Model Card (`122,768 B`)](r19/models/MODEL_CARD.md), [Training & Eval Report](r19/results/R19_TRAINING_REPORT.md), [Data Curation Summary](r19/results/data_curation_summary.md), [Stage P3 Ablation](r19/experiments/exp_r19_p3_training_ablation.md), [180 s Browser Benchmark](r19/results/R19_RUNTIME_BENCHMARK.md), [Main NUI Lab Handoff](r19/results/R19_MAIN_INTEGRATION_HANDOFF.md), and standalone code ([r19_features.ts](r19/candidates/r19_features.ts), [r19_integrated.ts](r19/candidates/r19_integrated.ts), [pistol_geometry.ts](r19/candidates/pistol_geometry.ts), [pistol_fsm.ts](r19/candidates/pistol_fsm.ts)).
  - **Measured P1–P4 highlights (`OFFLINE_DATASET` / `SYNTHETIC` / `BROWSER_SIMULATED_VIDEO`):**
    - Replacing raw `hand_size` fixed the `x0.22` webcam-scale collapse (`G5_r18feat = 2/33` -> `G3_82dim = 33/33`, `max_aspect_invariant_diff = 1.577e-14` across `82/82` features); pure JS `G3` `p50/p95 = 23.35/26.55 µs` (`G4` `54.07/86.12 µs`).
    - Locked `CC BY 4.0` test (`17,086 / 5,067 / 4,720`): `G3_MLP` (`[82->96->48->3]`, `T = 1.27`, `47,288 B` HTTP wire) **`Acc = 0.9985` / `Macro-F1 = 0.9567`** (`ECE = 0.00137`, vs `G2_LR 0.9786 / 0.6748`).
    - `G4_Hybrid` (`G1 + G3 + FSM`): `HG5G test` (`n = 230`) `0.9826` (`97.14%` `L-Sign` recall, `0%` `READY->PRESS`), `Natural RGB v3 test` (`888` hands) **`0.00%` FSM active** (`G0 = 61.60%`), `IPN test` (`36` vid) **`0.00 / 0.04 / 0.09` `KD/min`** on `NOG/P2F/P1F` (`G1 = 1.11/0.64/8.50`, `G0 NOG = 57.98%`), `Mendeley (599)` & `N0/N1 (33)` = `0%`, `JumpAssist 50 Hz` = `100%` horizontal continuity at `75/60/30/15 Hz`.
    - Out-of-domain **`HANDS RGB-D`** (`2,700` HTTP-Range frames, `3,911` GT-matched hands): **`G4_Hybrid = 0.00%` (`0/3,911`) false `POINT_PRESS`** (`ALL_HORIZ_POINTING`: `100%` `OTHER` vs `G0 = 99.33%` steer; `STRICT_OTHER`: `98.93%` `OTHER` vs `G0 = 68.58%`, `G2_LR = 13.69%` `PRESS`, `G3_MLP = 0.38%` `PRESS`), and **`99.09%` (`109/110`) `POINT_READY`** on tiny `One_VFR` (`hand_size p50 = 0.113`, vs `G5_r18feat = 39.09%`).
    - `180 s` Chromium WASM (`r19_sim_cam.y4m`): **`10.83 MiB` < `25 MB`** total wire, `14.18` MP FPS (`81.88%` adaptive det w/ CLAHE), `r19Ms p95 = 0.2 ms`, **`50/50/50` `KeyDown/KeyUp/Jump` (`0` stuck)**, `0` page errors, `stoppedCleanly = true`.
  - **Open Gate:** Physical webcam (`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md` Scenarios 1–10) remains **`NOT_TESTED`** (`[WIP]` retained; `main` untouched).
- **R18 existing plan:** [R18-01 v0.3.0 WIP](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md), [model card](r18/models/MODEL_CARD.md) and [manifest](r18/manifests/dataset_manifest.json) remain baseline reference evidence.
- **Product source (read-only reference):** R19 NUI Lab integration on [main@8969502](https://github.com/lustresense/hitl-momo/commit/8969502df4e106d8428055c2ca6f80f4f59250ee); this R20 plan is **research-only**, not deployed or product approved. Physical webcam R20 remains `NOT_TESTED`.
- **Latest record:** [LOG.md](LOG.md), `R20-PLAN-20261118-01`. Every research commit updates README+LOG atomically.

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

Current artifacts: [R19](r19/), [R19 Model Card](r19/models/MODEL_CARD.md), [R19 Training Report](r19/results/R19_TRAINING_REPORT.md), [R19 Curation Summary](r19/results/data_curation_summary.md), [HANDS RGB-D Eval](r19/results/r19_hands_rgbd_eval.json), [R19 Runtime Benchmark](r19/results/R19_RUNTIME_BENCHMARK.md), [R19 Main Handoff](r19/results/R19_MAIN_INTEGRATION_HANDOFF.md), [R19 Dataset Audit](r19/results/R19_DATASET_AUDIT.md), [R19 Stage P2](r19/experiments/exp_r19_p2_pistol_geometry_fsm.md), [R19 Stage P3](r19/experiments/exp_r19_p3_training_ablation.md), [R19 manifests](r19/manifests/) | Baseline: [R18](r18/), [consolidated report](r18/results/R18_MASTER_REPORT.md), [R18 experiments](r18/experiments/), [candidates](r18/candidates/), [scripts](r18/scripts/), [results](r18/results/), [models](r18/models/), [manifests](r18/manifests/).

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
