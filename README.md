# CAN Research Workspace — `research-can`

**Repo:** [lustresense/hitl-momo](https://github.com/lustresense/hitl-momo)  
**Branch:** `research-can`, intentionally orphan and unrelated to `main` history.  
**Owner:** CAN · **Terminal executor:** Agy / explicitly authorized agent.  
**Role:** reproducible NUI and MediaPipe-oriented R&D, not deployed product source or a PA decision register.

## Current status

- **R20-01 execution (`[WIP]`, Waves A0–A5 / Stages P0–P4 COMPLETE on `2x NVIDIA RTX A5000` GPU + CPU Browser; physical night webcam `NOT_TESTED`):** [`[WIP] NUI R20-01 v0.2.0`](docs/plan-rev/%5BWIP%5D%20NUI_R20-01_v0.2.0_GPU_Teacher_Student_CPU_Only_LowLight_Execution_Plan.md) (executed 100% by single main Agy session with **0 subagents** per §19.1; see [latest LOG](LOG.md) `R20-EXEC-20261119-01`), [R20 Model Card (`73,275 B` raw / `29,088 B` wire)](r20/models/MODEL_CARD.md), [Preflight & C0 Baseline](r20/results/R20_PREFLIGHT_AND_BASELINE.md), [GPU Training & 8-Suite Eval Report](r20/results/R20_TRAINING_AND_EVAL_REPORT.md), [CPU Worker & `< 25 MB` Network Benchmark](r20/results/R20_CPU_RUNTIME_AND_NETWORK_BENCHMARK.md), [Owner Night Webcam Protocol & Handoff](r20/results/R20_OWNER_NIGHT_WEBCAM_PROTOCOL_AND_HANDOFF.md), [GPU Cohort & KD Ablation](r20/experiments/exp_r20_gpu_teacher_student_and_cohort_ablation.md), [Low-Light Detector & CPU Worker Ablation](r20/experiments/exp_r20_lowlight_detector_and_cpu_worker.md), and standalone candidates ([r20_model.ts](r20/candidates/r20_model.ts), [r20_lowlight_frame_source.ts](r20/candidates/r20_lowlight_frame_source.ts), [r20_hand_landmarker_cpu.ts](r20/candidates/r20_hand_landmarker_cpu.ts), [r20_hand_landmarker.worker.ts](r20/candidates/r20_hand_landmarker.worker.ts)).
  - **Measured Waves A0–A5 / Gates `G20-A..G20-D` highlights (`OFFLINE_DATASET` / `SYNTHETIC` / `BROWSER_SIMULATED_VIDEO`):**
    - **`G20-A` GPU Training, CPU-Only User (`PASS` offline/browser):** Trained `C1..C4`, `T-IMG` (`ResNet9-GroupNorm-SiLU` 5-fold OOF on `769` `128x128` RGB crops), `T-ENSEMBLE`, `C6 vs C7` distillation, `T-TEMP -> S-TEMP`, and `S3 QAT` on `2x NVIDIA RTX A5000` (`CUDA 13.2`). Winner **`C4_Full_Focal` (`[82->64->32->3]`, [`r20_model_c4_full_mlp.json`](r20/models/r20_model_c4_full_mlp.json))** is **`73,275 B` raw JSON** (`-40.3%` vs R19 `122,768 B`), **`29,088 B` zstd wire** (`-38.5%` vs R19 `47,288 B`), **`30,624 B` FP32 binary (`S0`)**, **`8,844 B` packed INT8 (`S1`, `0` argmax mismatch across all `4,720` TEST rows!)**, `0` argmax mismatch on 160-row Python/GPU ↔ TS/CPU parity across all 9 models, pure TS CPU **`p50/p95 = 8.12/9.67 µs`**, and browser runtime verified **`delegate = "CPU"` (`gpuDelegateAttempted = false`, `gpuDelegateActive = false`)**.
    - **`G20-B` CPU Responsiveness & Anti-Lag (`PASS` on `BROWSER_SIMULATED_VIDEO` with `B3` / `B2`; Physical Intent-to-Key `NOT_TESTED`):** Offloading `HandLandmarker` CPU to [`r20_hand_landmarker.worker.ts`](r20/candidates/r20_hand_landmarker.worker.ts) via transferable `320x180` `ImageBitmap` (`maxInFlight = 1` latest-frame-wins) reduced main-thread dispatch `p95` **`41x` (`74.9 ms -> 1.8 ms`)**, reduced main-thread LongTasks `>50ms` from **`314` (`12.6/s`) to `0`**, raised UI FPS from **`15.19 FPS (p5 = 13.77)` to `60.04 FPS (p5 = 60.00)`**, and with **`B3_cpu_web_worker_dynamic_owner_lock`** (`numHands=2` on acquire/loss -> `numHands=1` while locked w/ `jumpDist<=0.25` guard) raised CPU detector rate from `15.59 Hz` (fixed `numHands=2` diagnosis floor) to **`24.70 Hz` (`>= 20 Hz` gate PASS; `B2 numHands=1` ablation = `27.62 Hz`)** with **`0` stuck keys** across `tab-hidden`, `worker-restart`, and `stop()`.
    - **`G20-C` Cold First-Use Download `< 25 MB` (`PASS` on Both Journeys):** Clean-profile cold `B-USER` (counting 100% of main-thread + Web Worker WASM, `hand_landmarker.task`, `blaze_face_short_range.tflite`, R20 student, and Next.js JS/CSS): **Journey 1 (NUI Lab) = `9,345,570 B` (`8.91 MiB` zstd; `11,320,653 B` if `.task` uncompressed) `< 25,000,000 B`**; **Journey 2 (Student Onboarding -> Canvas -> Gameplay) = `9,432,085 B` (`9.00 MiB` zstd; `11,407,168 B` if `.task` uncompressed) `< 25,000,000 B`** (`0` duplicate downloads, `0 B` warm refresh #1/#2).
    - **`G20-D` Low-Light & Anti-Distraction (`PASS` offline/OOD/sim-video; `PHYSICAL_WEBCAM = NOT_TESTED`):** `A4` adaptive low-light fallback (`A0 RAW` -> `A3 Mild 3x3 Denoise + Gamma + Moderated CLAHE 320` on detector miss) improves far/small dim-hand detection **`+8.22 pp` (`30.98% -> 39.20%`)** and near-black `dim_g008` **`3.7x` over `L1 CLAHE 320` (`2.10%` vs `0.57%`)** without degrading bright frames (`72.08%`). On Locked TEST (`4,720` rows), **`C4_Full_Focal` achieves `Macro-F1 = 0.9873`** (`+3.06 pp` vs `C0 = 0.9567`), **`F1_READY = 0.9767`**, **`F1_PRESS = 0.9855`**, **`0 / 4,664` false presses**, `0 / 888` on Natural RGB v3, `0.00 / 0.00 / 0.09` (`C7_T2`: `0.00 / 0.00 / 0.00`) `KD/min` on IPN, `0 / 2,092` G4 false press on person-disjoint `HANDS RGB-D Subject4..5`, `0 / 85` on session-disjoint `bxr7 Gomoku/Poker`, and `100%` pass on `O1..O3` bystander ownership stress tests.
  - **Open Gate:** Owner physical night webcam (`N1..N6` in [R20 Night Webcam Protocol](r20/results/R20_OWNER_NIGHT_WEBCAM_PROTOCOL_AND_HANDOFF.md)) remains **`NOT_TESTED`** (`[WIP]` retained; `main@8969502` untouched).

- **R19 execution (`[WIP]`, Stages P0–P4 COMPLETE offline/browser; physical webcam `NOT_TESTED`):** [R19-01 WIP plan](docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md), [Model Card (`122,768 B`)](r19/models/MODEL_CARD.md), [Training & Eval Report](r19/results/R19_TRAINING_REPORT.md), [Data Curation Summary](r19/results/data_curation_summary.md), [Stage P3 Ablation](r19/experiments/exp_r19_p3_training_ablation.md), [180 s Browser Benchmark](r19/results/R19_RUNTIME_BENCHMARK.md), [Main NUI Lab Handoff](r19/results/R19_MAIN_INTEGRATION_HANDOFF.md), and standalone code ([r19_features.ts](r19/candidates/r19_features.ts), [r19_integrated.ts](r19/candidates/r19_integrated.ts), [pistol_geometry.ts](r19/candidates/pistol_geometry.ts), [pistol_fsm.ts](r19/candidates/pistol_fsm.ts)).
  - **Measured P1–P4 highlights (`OFFLINE_DATASET` / `SYNTHETIC` / `BROWSER_SIMULATED_VIDEO`):**
    - Replacing raw `hand_size` fixed the `x0.22` webcam-scale collapse (`G5_r18feat = 2/33` -> `G3_82dim = 33/33`, `max_aspect_invariant_diff = 1.577e-14` across `82/82` features); pure JS `G3` `p50/p95 = 23.35/26.55 µs` (`G4` `54.07/86.12 µs`).
    - Locked `CC BY 4.0` test (`17,086 / 5,067 / 4,720`): `G3_MLP` (`[82->96->48->3]`, `T = 1.27`, `47,288 B` HTTP wire) **`Acc = 0.9985` / `Macro-F1 = 0.9567`** (`ECE = 0.00137`, vs `G2_LR 0.9786 / 0.6748`).
    - `G4_Hybrid` (`G1 + G3 + FSM`): `HG5G test` (`n = 230`) `0.9826` (`97.14%` `L-Sign` recall, `0%` `READY->PRESS`), `Natural RGB v3 test` (`888` hands) **`0.00%` FSM active** (`G0 = 61.60%`), `IPN test` (`36` vid) **`0.00 / 0.04 / 0.09` `KD/min`** on `NOG/P2F/P1F` (`G1 = 1.11/0.64/8.50`, `G0 NOG = 57.98%`), `Mendeley (599)` & `N0/N1 (33)` = `0%`, `JumpAssist 50 Hz` = `100%` horizontal continuity at `75/60/30/15 Hz`.
    - Out-of-domain **`HANDS RGB-D`** (`2,700` HTTP-Range frames, `3,911` GT-matched hands): **`G4_Hybrid = 0.00%` (`0/3,911`) false `POINT_PRESS`** (`ALL_HORIZ_POINTING`: `100%` `OTHER` vs `G0 = 99.33%` steer; `STRICT_OTHER`: `98.93%` `OTHER` vs `G0 = 68.58%`, `G2_LR = 13.69%` `PRESS`, `G3_MLP = 0.38%` `PRESS`), and **`99.09%` (`109/110`) `POINT_READY`** on tiny `One_VFR` (`hand_size p50 = 0.113`, vs `G5_r18feat = 39.09%`).
    - `180 s` Chromium WASM (`r19_sim_cam.y4m`): **`10.83 MiB` < `25 MB`** total wire, `14.18` MP FPS (`81.88%` adaptive det w/ CLAHE), `r19Ms p95 = 0.2 ms`, **`50/50/50` `KeyDown/KeyUp/Jump` (`0` stuck)**, `0` page errors, `stoppedCleanly = true`.
  - **Open Gate:** Physical webcam (`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md` Scenarios 1–10) remains **`NOT_TESTED`** (`[WIP]` retained; `main` untouched).
- **R18 existing plan:** [R18-01 v0.3.0 WIP](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md), [model card](r18/models/MODEL_CARD.md) and [manifest](r18/manifests/dataset_manifest.json) remain baseline reference evidence.
- **Product source (read-only reference):** R19 NUI Lab integration on [main@8969502](https://github.com/lustresense/hitl-momo/commit/8969502df4e106d8428055c2ca6f80f4f59250ee); this R20 execution is **research-only**, not deployed or product approved. Physical webcam R20 remains `NOT_TESTED`.
- **Latest record:** [LOG.md](LOG.md), `R20-EXEC-20261119-01`. Every research commit updates README+LOG atomically.

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

Current artifacts: [R20](r20/), [R20 Model Card](r20/models/MODEL_CARD.md), [R20 Training & Eval Report](r20/results/R20_TRAINING_AND_EVAL_REPORT.md), [R20 CPU & `<25MB` Benchmark](r20/results/R20_CPU_RUNTIME_AND_NETWORK_BENCHMARK.md), [R20 Night Webcam Protocol](r20/results/R20_OWNER_NIGHT_WEBCAM_PROTOCOL_AND_HANDOFF.md), [R20 Preflight](r20/results/R20_PREFLIGHT_AND_BASELINE.md), [R20 GPU Cohort & KD Ablation](r20/experiments/exp_r20_gpu_teacher_student_and_cohort_ablation.md), [R20 Low-Light & Worker Ablation](r20/experiments/exp_r20_lowlight_detector_and_cpu_worker.md), [R20 manifests](r20/manifests/) | [R19](r19/), [R19 Model Card](r19/models/MODEL_CARD.md), [R19 Training Report](r19/results/R19_TRAINING_REPORT.md), [R19 Curation Summary](r19/results/data_curation_summary.md), [HANDS RGB-D Eval](r19/results/r19_hands_rgbd_eval.json), [R19 Runtime Benchmark](r19/results/R19_RUNTIME_BENCHMARK.md), [R19 Main Handoff](r19/results/R19_MAIN_INTEGRATION_HANDOFF.md), [R19 Dataset Audit](r19/results/R19_DATASET_AUDIT.md), [R19 Stage P2](r19/experiments/exp_r19_p2_pistol_geometry_fsm.md), [R19 Stage P3](r19/experiments/exp_r19_p3_training_ablation.md), [R19 manifests](r19/manifests/) | Baseline: [R18](r18/), [consolidated report](r18/results/R18_MASTER_REPORT.md), [R18 experiments](r18/experiments/), [candidates](r18/candidates/), [scripts](r18/scripts/), [results](r18/results/), [models](r18/models/), [manifests](r18/manifests/).

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
