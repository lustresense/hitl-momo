# CAN Research Workspace — `research-can`

**Repo:** [lustresense/hitl-momo](https://github.com/lustresense/hitl-momo)  
**Branch:** `research-can`, intentionally orphan and unrelated to `main` history.  
**Owner:** CAN · **Terminal executor:** Agy / explicitly authorized agent.  
**Role:** reproducible NUI and MediaPipe-oriented R&D, not deployed product source or a PA decision register.

## Current status

- **R22B Wave 1 execution (`[WIP]`, Wave 1 HandState `G1'` Gate + Canvas UX Recovery + Schema `v2.1` + `?mdc=&mpc=&mtc=` + Recalibrated Lowlight Diagnostics COMPLETE in `r22b-handstate@8f74db4`; Wave 2 Owner Guided Capture / Model Training B6 / Physical Webcam `U1..U7` `NOT_TESTED`):** Mandate [`docs/plan-rev/R22B/02_MANDAT_AGY_R22B.md`](docs/plan-rev/R22B/02_MANDAT_AGY_R22B.md) & evidence [`01_BUKTI_DAN_PENALARAN_S970.md`](docs/plan-rev/R22B/01_BUKTI_DAN_PENALARAN_S970.md); see [latest LOG](LOG.md) `R22B-EXEC-20261120-01`, **[R22B Full Execution & QA Report (Planner-Ready)](r22b/results/R22B_EXECUTION_AND_QA_REPORT.md)**, [`K4_v1.1_TAXONOMY.md`](r22b/contracts/K4_v1.1_TAXONOMY.md), [`dataset_registry_r22b.json`](r22b/registry/dataset_registry_r22b.json), [`r22b_b0_vs_b1_baseline.json`](r22b/results/r22b_b0_vs_b1_baseline.json), [`r22b_live_qa_and_perf_audit.json`](r22b/results/r22b_live_qa_and_perf_audit.json), and scripts ([`analyze_r22b.py`](r22b/scripts/analyze_r22b.py), [`build_r22b_dataset.py`](r22b/scripts/build_r22b_dataset.py), [`eval_r22b_baselines.py`](r22b/scripts/eval_r22b_baselines.py), [`replay_lowlight_offline.mjs`](r22b/scripts/replay_lowlight_offline.mjs), [`run_r22b_qa_audit.mjs`](r22b/scripts/run_r22b_qa_audit.mjs)).
  - **Wave 1 Highlights (`UNIT_ONLY` / `OFFLINE_DATASET` / `BROWSER_SIMULATED_VIDEO`, code branch `r22b-handstate@8f74db42896fae6428b7050ad3ea092d0237a885`, `0` edits to `src/input/**`):**
    - **B1 (`G1'` Fist-vs-Pinch Gate + Hysteresis + Strict `FIVE` + Presets):** On `weak-s970-t004-v1` (`996` frames), `B1` blocked **`13/13` (`100%`)** S-970 `FIST_OR_TRANSITION` false pinches (`13/13 -> 0/13`), preserved **`299/303` (`98.68%`)** S-970 `PINCH/CLOSED`, **`103/103` (`100%`)** S-970 `PINCH/OK`, and **`204/204` (`100%`)** cross-device T004 pinch; full `s970-t002-landmark-replay-v1.json` replay achieved `0` `STROKE_START` in `undoWindowMs` & `>= 5` `UNDO`.
    - **B2 & B8.3 (Canvas UX Recovery + Non-Blanking Skeleton Overlay):** Under an injected `750 ms` worker stall (`"Kamera tersendat (594 ms tanpa hasil baru)"`), the overlay preserved **`6,473` skeleton pixels** (zero blanking), then recovered cleanly (`6,556` px). Added 5 K11 presets (`default-any-pinch`, `ok-pinch-only`, `closed-pinch-only`, `three-imr-action`, `three-mrp-vs-ok`), `?capture=1` guided capture (`700 ms` / `300 ms` `truthMasked`), `?rawrec=1` local-only WebM recorder (`+0.8%` `mpMs p95` overhead), `?camdev=1` UVC panel, `> 3s` backlight tip card, and `> 600ms` hand-lost ghost cursor.
    - **B3, B4 & B7 (`nui-lab-bench-export/2.1`, `?mdc=&mpc=&mtc=`, Lowlight Recalibration):** Added `analyze_r22b.py` (`--session`, time-based active-window miss, lost episodes `>500ms/>1s`, strict unmasked `DATASET_GT` accuracy), verified `0` runtime `setOptions` calls for `?mdc=0.5&mpc=0.35&mtc=0.35` (`mpMs p50 = 66.8 ms` vs `66.9 ms` default), and recalibrated `GLARE_CANDIDATE >= 25%` + `backlightCandidate`.
    - **B8 QA:** `tsc` `0` errors, `lint` `0` errors, **`22/22` NUI Lab Vitest files (`260/260` tests PASS)**, legacy gameplay `39/48 PASS` unchanged, static build `24/24` pages (`0.29.1-alpha+r22b`), `0` hydration/console errors across 5 routes, independent code review by `Gemini 4 Hydrogen (XHigh)` completed with all 4 findings fixed.
  - **Open Wave 2 Gate:** Owner physical guided capture (`guided-capture-p1-v1`, `p2-v1`), B6 model training (`M1`, `M1x`, `M2`), B7.3–B7.5 offline lowlight replay on Owner's local WebM clips, and live physical webcam `U1..U7` remain **`NOT_TESTED (menunggu Owner)`**.

- **R20-01 execution (`[WIP]`, Audit-Corrected Waves A0–A5 + R20-FIX P0.1–P0.4 COMPLETE on GPU + CPU Browser; physical night webcam `NOT_TESTED`):** [`[WIP] NUI R20-01 v0.2.0`](docs/plan-rev/%5BWIP%5D%20NUI_R20-01_v0.2.0_GPU_Teacher_Student_CPU_Only_LowLight_Execution_Plan.md) (100% single main Agy session, **0 subagents** per §19.1; see [latest LOG](LOG.md) `R20-FIX-20261119-03`, **[Full Execution & NUI Lab Summary (Planner-Ready)](r20/results/R20_FIX_AND_NUILAB_EXECUTION_SUMMARY_2026-11-19.md)**, and [R20-FIX Audit Correction Report](r20/results/R20_FIX_AUDIT_REPORT.md)), [R20 Model Card (`73,275 B` raw / `29,088 B` wire)](r20/models/MODEL_CARD.md), [Preflight & C0 Baseline](r20/results/R20_PREFLIGHT_AND_BASELINE.md), [GPU Training & 8-Suite Eval Report](r20/results/R20_TRAINING_AND_EVAL_REPORT.md), [CPU Worker & `< 25 MB` Network Benchmark](r20/results/R20_CPU_RUNTIME_AND_NETWORK_BENCHMARK.md) *(network & A4 superseded by [R20-FIX Audit Report](r20/results/R20_FIX_AUDIT_REPORT.md))*, [Owner Night Webcam Protocol & Handoff](r20/results/R20_OWNER_NIGHT_WEBCAM_PROTOCOL_AND_HANDOFF.md), and standalone candidates ([r20_model.ts](r20/candidates/r20_model.ts), [r20_lowlight_frame_source.ts](r20/candidates/r20_lowlight_frame_source.ts), [r20_worker_owner_guard.ts](r20/candidates/r20_worker_owner_guard.ts), [r20_hand_landmarker_cpu.ts](r20/candidates/r20_hand_landmarker_cpu.ts), [r20_hand_landmarker.worker.ts](r20/candidates/r20_hand_landmarker.worker.ts)).
  - **Audit-Corrected Highlights (`OFFLINE_DATASET` / `SYNTHETIC` / `BROWSER_SIMULATED_VIDEO`, `R20-FIX-20261119-02`):**
    - **`G20-A` GPU Training, CPU-Only User (`PASS` offline/browser):** Single RTX A5000 sufficient; `C0 (R19)`, `C4 (R20, 73,275 B)`, and `C7 (R20 distilled, 73,138 B)` retained as pinned SHA-256 comparators; `0` argmax mismatch GPU↔TS/CPU; browser verified `delegate = "CPU"` (`gpuDelegateAttempted = false`).
    - **`G20-B` CPU Responsiveness & Anti-Lag (`PASS` UI/Lag/Safety/Leak over 90s; `setOptions` Tradeoff Reported; Physical `NOT_TESTED`):** `90.07 s` continuous CPU-only (`--disable-gpu`) `B3v2` with close-range bystander `WorkerOwnerGuard` achieved **`60.00 FPS` UI (`p5 = 60.00`)**, **`0` LongTasks**, `e2e p95 = 105.2 ms <= 150 ms`, `heapGrowth = +0.86 MB`, and **`0` stuck keys** (`tab-hidden`, `worker-restart`, `stop()`). Steady single-hand throughput: **`26 Hz`** on real NUI Lab `/nui-lab/gesture` and **`24.25 Hz`** on `B2` (`>= 20 Hz` PASS); under synthetic hard scene cuts (`r20_sim_cam.y4m`), `232` guard-triggered `setOptions` rebuilds (`26.8 ms p50`) reduced `B3v2` to **`15.11 Hz`** (vs `B1` fixed `numHands=2` `13.78 Hz`).
    - **`G20-C` True CDP Cold Transfer `< 25 MB` (Page + Web Worker, Reconciled vs Socket Wire):** **Journey 1 (Real NUI Lab static export, R20 C4 + Worker + `CacheStorage` dedup):** **`10,966,014 B` (`10.46 MiB` CDP; server `10,971,923 B`)** under `deploy/Caddyfile` (`caddy_default_zstd_gzip`, `.task` uncompressed) -> **`PASS`** (`11,102,853 B` under `gzip_standard` -> **`PASS`**; `28,022,116 B` uncompressed dev -> `FAIL`). **Journey 2A (Unmodified Student `main` SPA):** **`26,801,677 B` (`25.56 MiB` CDP == server, `delta = 0 B`) -> `FAIL`** (exposes pre-existing `3×` fetch of `hand_landmarker.task` in untouched `src/camera/hand-landmarker.ts`).
    - **`G20-D` Low-Light & Anti-Distraction (`PASS` synthetic sequential VIDEO / OOD; `PHYSICAL_WEBCAM = NOT_TESTED`):** Corrected `union_ok` oracle bug (`oracle_union_recall_upper_bound = 31.87%`; old shipped `P3_shipped_alt` was only `34.24%` vs `P0_raw = 34.23%`) and shipped chroma-preserving **`A4v2`** (`applyA4ChromaRecoveryInPlace`, browser `p50/p95 = 4.5 / 8.5 ms`): sequential VIDEO-mode recall jumped **`34.23% -> 85.42%`** (`1.000` detector calls/frame, `dim_g008` near-black **`0.0% -> 85.6%`**), cutting `DETECTOR_MISS` **`65.36% -> 11.79%`** while `C4/C7` conditional accuracy stayed **`98.34%`** with **`0` false PRESS** (`end-to-end 34.17% -> 86.75%`).
  - **Open Gate:** Owner physical night webcam (`N1..N6`) remains **`NOT_TESTED`** (`[WIP]` retained). Scoped NUI Lab benchmark recorder + R20 C4/C7 integration shipped to `main` under explicit Owner P1/P2 authorization so Owner can run `N1..N6` directly in browser and download JSON/CSV in one click.

- **R19 execution (`[WIP]`, Stages P0–P4 COMPLETE offline/browser; physical webcam `NOT_TESTED`):** [R19-01 WIP plan](docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md), [Model Card (`122,768 B`)](r19/models/MODEL_CARD.md), [Training & Eval Report](r19/results/R19_TRAINING_REPORT.md), [Data Curation Summary](r19/results/data_curation_summary.md), [Stage P3 Ablation](r19/experiments/exp_r19_p3_training_ablation.md), [180 s Browser Benchmark](r19/results/R19_RUNTIME_BENCHMARK.md), [Main NUI Lab Handoff](r19/results/R19_MAIN_INTEGRATION_HANDOFF.md), and standalone code ([r19_features.ts](r19/candidates/r19_features.ts), [r19_integrated.ts](r19/candidates/r19_integrated.ts), [pistol_geometry.ts](r19/candidates/pistol_geometry.ts), [pistol_fsm.ts](r19/candidates/pistol_fsm.ts)).
  - **Measured P1–P4 highlights (`OFFLINE_DATASET` / `SYNTHETIC` / `BROWSER_SIMULATED_VIDEO`):**
    - Replacing raw `hand_size` fixed the `x0.22` webcam-scale collapse (`G5_r18feat = 2/33` -> `G3_82dim = 33/33`, `max_aspect_invariant_diff = 1.577e-14` across `82/82` features); pure JS `G3` `p50/p95 = 23.35/26.55 µs` (`G4` `54.07/86.12 µs`).
    - Locked `CC BY 4.0` test (`17,086 / 5,067 / 4,720`): `G3_MLP` (`[82->96->48->3]`, `T = 1.27`, `47,288 B` HTTP wire) **`Acc = 0.9985` / `Macro-F1 = 0.9567`** (`ECE = 0.00137`, vs `G2_LR 0.9786 / 0.6748`).
    - `G4_Hybrid` (`G1 + G3 + FSM`): `HG5G test` (`n = 230`) `0.9826` (`97.14%` `L-Sign` recall, `0%` `READY->PRESS`), `Natural RGB v3 test` (`888` hands) **`0.00%` FSM active** (`G0 = 61.60%`), `IPN test` (`36` vid) **`0.00 / 0.04 / 0.09` `KD/min`** on `NOG/P2F/P1F` (`G1 = 1.11/0.64/8.50`, `G0 NOG = 57.98%`), `Mendeley (599)` & `N0/N1 (33)` = `0%`, `JumpAssist 50 Hz` = `100%` horizontal continuity at `75/60/30/15 Hz`.
    - Out-of-domain **`HANDS RGB-D`** (`2,700` HTTP-Range frames, `3,911` GT-matched hands): **`G4_Hybrid = 0.00%` (`0/3,911`) false `POINT_PRESS`** (`ALL_HORIZ_POINTING`: `100%` `OTHER` vs `G0 = 99.33%` steer; `STRICT_OTHER`: `98.93%` `OTHER` vs `G0 = 68.58%`, `G2_LR = 13.69%` `PRESS`, `G3_MLP = 0.38%` `PRESS`), and **`99.09%` (`109/110`) `POINT_READY`** on tiny `One_VFR` (`hand_size p50 = 0.113`, vs `G5_r18feat = 39.09%`).
    - `180 s` Chromium WASM (`r19_sim_cam.y4m`): **`10.83 MiB` < `25 MB`** total wire, `14.18` MP FPS (`81.88%` adaptive det w/ CLAHE), `r19Ms p95 = 0.2 ms`, **`50/50/50` `KeyDown/KeyUp/Jump` (`0` stuck)**, `0` page errors, `stoppedCleanly = true`.
  - **Open Gate:** Physical webcam (`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md` Scenarios 1–10) remains **`NOT_TESTED`** (`[WIP]` retained; `main` untouched).
- **R18 existing plan:** [R18-01 v0.3.0 WIP](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md), [model card](r18/models/MODEL_CARD.md) and [manifest](r18/manifests/dataset_manifest.json) remain baseline reference evidence.
- **Product source (scoped NUI Lab integration authorized 2026-11-19):** NUI Lab benchmark recorder + R20 C4/C7 CPU worker integrated into `main` (`0.27.0-alpha`); student gameplay/storyline/HITL untouched. Physical webcam R20 remains `NOT_TESTED`.
- **Latest record:** [LOG.md](LOG.md), `R22B-EXEC-20261120-01`. Every research commit updates README+LOG atomically.

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

Current artifacts: [R20](r20/), [R20 Full Execution Summary (2026-11-19)](r20/results/R20_FIX_AND_NUILAB_EXECUTION_SUMMARY_2026-11-19.md), [R20-FIX Audit Report](r20/results/R20_FIX_AUDIT_REPORT.md), [R20 Model Card](r20/models/MODEL_CARD.md), [R20 Training & Eval Report](r20/results/R20_TRAINING_AND_EVAL_REPORT.md), [R20 CPU & `<25MB` Benchmark](r20/results/R20_CPU_RUNTIME_AND_NETWORK_BENCHMARK.md), [R20 Night Webcam Protocol](r20/results/R20_OWNER_NIGHT_WEBCAM_PROTOCOL_AND_HANDOFF.md), [R20 Preflight](r20/results/R20_PREFLIGHT_AND_BASELINE.md), [R20 GPU Cohort & KD Ablation](r20/experiments/exp_r20_gpu_teacher_student_and_cohort_ablation.md), [R20 Low-Light & Worker Ablation](r20/experiments/exp_r20_lowlight_detector_and_cpu_worker.md), [R20 manifests](r20/manifests/) | [R19](r19/), [R19 Model Card](r19/models/MODEL_CARD.md), [R19 Training Report](r19/results/R19_TRAINING_REPORT.md), [R19 Curation Summary](r19/results/data_curation_summary.md), [HANDS RGB-D Eval](r19/results/r19_hands_rgbd_eval.json), [R19 Runtime Benchmark](r19/results/R19_RUNTIME_BENCHMARK.md), [R19 Main Handoff](r19/results/R19_MAIN_INTEGRATION_HANDOFF.md), [R19 Dataset Audit](r19/results/R19_DATASET_AUDIT.md), [R19 Stage P2](r19/experiments/exp_r19_p2_pistol_geometry_fsm.md), [R19 Stage P3](r19/experiments/exp_r19_p3_training_ablation.md), [R19 manifests](r19/manifests/) | Baseline: [R18](r18/), [consolidated report](r18/results/R18_MASTER_REPORT.md), [R18 experiments](r18/experiments/), [candidates](r18/candidates/), [scripts](r18/scripts/), [results](r18/results/), [models](r18/models/), [manifests](r18/manifests/).

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
