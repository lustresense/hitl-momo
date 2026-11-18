# LOG.md — CAN Research R&D Activity and Evidence Ledger

**Branch:** `research-can`, orphan branch of `lustresense/hitl-momo`  
**Status source:** GitHub commit/tree for published files; referenced R18 reports for experimental claims.  
**Format:** newest entry at the top; no `NOW.md` or separate VERSION file. The branch root README holds only the current snapshot and links to this full log.  
**Meaning:** `OBSERVED_REMOTE` = independently inspected GitHub; `KATA-TOOL` = measurements reported by Agy, not rerun by ChatGPT; `NOT_TESTED` = no evidence of execution. `PASS` must always include what was actually tested.

---

## R19-EXEC-20261118-02 — R19 Batch 2: `CC BY 4.0` Data Curation, Scale-Invariant `G3` MLP + `G4` Hybrid, Ablations & `180 s` Chromium WASM Benchmark (`KATA-TOOL` / `OFFLINE_DATASET` / `BROWSER_SIMULATED_VIDEO`)

- **Trigger:** R&D mandate [`[WIP] NUI_R19-01 v0.1.0`](docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md) Stages P1 (curated real datasets), P3 (feature invariance, lightweight model training/calibration, end-to-end eval & main NUI Lab handoff), and P4 (isolated `180 s` Chromium WASM benchmark).
- **Published Deliverables (`research-can/r19/` — 44 total files under `r19/`, ~600 KB total):**
  - **Candidates (strict TypeScript pass, 214/214 sandbox parity, standalone):** [`r19_features.ts`](r19/candidates/r19_features.ts) (`82`-dim scale/aspect/rotation-invariant features), [`r19_model.ts`](r19/candidates/r19_model.ts), [`r19_safety_guards.ts`](r19/candidates/r19_safety_guards.ts), [`r19_integrated.ts`](r19/candidates/r19_integrated.ts) (`G4_Hybrid` + `PistolVirtualKeyFSM`), and [`browser_harness/{harness.ts,index.html}`](r19/candidates/browser_harness/harness.ts).
  - **Models (`CC BY 4.0` only, zero `HaGRIDv2`/`DimHand`):** Primary [`r19_model_mlp.json`](r19/models/r19_model_mlp.json) (`122,768 B` raw / `47,288 B` HTTP wire, `[82 -> 96 -> 48 -> 3]`, `T = 1.27`, SHA-256 `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293`), linear baseline [`r19_model_lr.json`](r19/models/r19_model_lr.json) (`5,092 B`, SHA-256 `64821aa20b1cc3b959a0d6b3dbe984ed9f190249be01ad757cfaaed321842737`), and [`MODEL_CARD.md`](r19/models/MODEL_CARD.md).
  - **Reports, Ablations & Manifests:** [`exp_r19_p3_training_ablation.md`](r19/experiments/exp_r19_p3_training_ablation.md), [`R19_TRAINING_REPORT.md`](r19/results/R19_TRAINING_REPORT.md), [`R19_RUNTIME_BENCHMARK.md`](r19/results/R19_RUNTIME_BENCHMARK.md), [`R19_GESTURE_LABEL_SCHEMA.md`](r19/results/R19_GESTURE_LABEL_SCHEMA.md), [`R19_MAIN_INTEGRATION_HANDOFF.md`](r19/results/R19_MAIN_INTEGRATION_HANDOFF.md), [`r19_eval_all.json`](r19/results/r19_eval_all.json), [`r19_browser_runtime.json`](r19/results/r19_browser_runtime.json), [`dataset_manifest.json`](r19/manifests/dataset_manifest.json), [`published_vs_excluded_manifest.json`](r19/manifests/published_vs_excluded_manifest.json), and [`SHA256SUMS.txt`](r19/manifests/SHA256SUMS.txt).
- **Commands & Verified Results (`exit 0`):**
  1. **Curated `CC BY 4.0` Real Datasets (`handgesture_5g_stats.json`, `n66hhk695h_v3_stats.json`):**
     - `HandGesture-5G` (`wj25crzdbm.1`, HTTP Range in-memory, `0 B` zip saved): `2,659` entries -> `846` CRC32 dups removed -> `1,807` unique -> `1,797` decoded (`10` `.HEIC` skipped), `38` session/dHash-disjoint clusters (`train 1,095 / val 445 / test 257`, `min dt = 24.0 s`); visual audit verified `L-Sign` open-thumb Pistol across palmar/dorsal vs `Pointing Up` thumb-folded `POINT_READY`.
     - `Natural RGB Hand Gestures v3` (`n66hhk695h.3`): `1,352` clips (`10,816` frames), participant-disjoint `19 / 4 / 3` (`test = p02,p05,p15`); paired `VIDEO + M3 CLAHE` vs `IMAGE L0` (`60` clips, `4,285` frames): detection `48.12% -> 56.62%` (`dim 40.44% -> 59.33%`, `green_led 15.44% -> 31.05%`); conversational `point_left`/`point_right` (`76.1%`/`81.16%` `thumb_lateral >= 1.3`) held out cleanly.
  2. **Scale-Shortcut Fix & Exact Invariants (`test_r19_invariants_and_latency.ts`):**
     - Replaced raw screen `hand_size` (`hs`) with `thumb_over_index_reach` after discovering `hs` shortcut collapsed `G5_r18feat` (`68`-dim) to **`2/33 (6.06%)`** on `x0.22` webcam-scale `L-Sign`.
     - New `82`-dim vector achieves **`max_aspect_invariant_diff = 1.577e-14`** across all `82/82` features (`5` aspects × `3` scales `0.22..0.85`) and **`33/33 (100%)`** across `x1.0..x0.22` scales & `0°..180°/-135°` 16:9 projected rotations; pure JS `p50/p95 = 22.29 / 27.44 µs`, full `G4` `55.60 / 87.12 µs`.
  3. **Training, Calibration & End-to-End Evaluation (`train_r19_models.py`, `eval_r19_all.ts`):**
     - Clean splits: `train = 17,086`, `val = 5,067`, `test = 4,720`. `G3_MLP` (`mlp_96_48_n03`, `T = 1.27`): locked `test Acc = 0.9985`, **`Macro-F1 = 0.9567`**, `ECE = 0.00137` (`G2_LR = 0.9786 / 0.6748`). Python-vs-TS parity (`150` rows): `max_abs_diff = 2.494e-6`, `0` argmax mismatches.
     - `G4_Hybrid` (`tauPress = 0.38`, `tauPressRescue = 0.60`, `otherVetoTau = 0.72` tuned on `VAL`): `HG5G test` (`n = 230` M3) `0.9826` acc (`97.14%` `L-Sign` recall, `0%` `READY->PRESS`, `0%` `OTHER->PRESS`); `Natural RGB v3 test` (`11` OTHER cls, `888` hands) **`0.00%` FSM active / `0` `KEYDOWN`** vs `G0 = 61.60%`; `IPN test` (`36` videos) `NOG = 0.00 KD/min` (`G1 = 1.11`, `G0 = 57.98%`), `P2F = 0.04/min`, `P1F = 0.09/min` (`G1 = 8.50/min`), `C1F/2C1/GRB/TUP/OP2/ZOT = 0.00/min`; Mendeley (`599`) & `N0/N1` (`33`) = `0.00%` / `0/33`; synthetic `JumpAssist 50 Hz` = `100%` horizontal continuity & `1` jump at `75/60/30/15 Hz`.
     - Ablation `G5_p1f_trap` (`P1F==PRESS`) proved conflation failure: `HG5G Pointing Up -> PRESS` `0% -> 19.05%`, `IPN NOG` `0.04% -> 27.40%`, `P2F` `0.09% -> 25.26%`.
  4. **Isolated `180 s` Chromium WASM Benchmark (`run_r19_browser_harness.mjs`, `BROWSER_SIMULATED_VIDEO`):**
     - Cold wire transfer (`B-USER` across `11` routes + harness): **`11,356,084 B` (`10.83 MiB` < `25 MB` PASS)**; `r19_model_mlp.json` HTTP wire **`47,288 B`** (`<= 200 KB` PASS).
     - `180.53 s` playback of held-out `r19_sim_cam.y4m` (`640x360@10fps`, `396f`): `2,560` frames (`14.18` MP FPS), `adaptiveDetRate = 81.88%` (`+79/309` CLAHE hits, `claheMs p95 = 2.1 ms`), `r19Ms p50/p95/max = 0.1 / 0.2 / 3.0 ms`, `e2eMs p50/p95 = 68.9 / 101.8 ms`, `jsHeapUsed = 7.01 -> 7.89 MB`, **`50/50/50` matched `KeyDown/KeyUp/Jump` (`0` stuck keys)**, `0` page errors, `stoppedCleanly = true`.
- **Open Work / Unresolved Blockers:**
  - `HANDS RGB-D` (`10.17632/ndrczc35bt.2`, `EVAL_ONLY`) selective `Horiz_H*` HTTP Range curation across `Subject1..Subject5` is active on VM and will be evaluated out-of-domain in Batch 3.
  - Physical webcam runtime (`Scenario 1..10`) remains **`NOT_TESTED`**; `[WIP]` retained on `NUI_R19-01` and `main` gameplay/deployment remain untouched (handoff scoped strictly to `/nui-lab/gesture` & `/nui-lab/canvas`).

---

## R19-EXEC-20261118-01 — R19 Stage P0/P1 Dataset Audit & Stage P2 Pistol Geometry + Virtual-Key FSM (`G0` vs `R18_UX1` vs `G1`)

- **Date:** 2026-11-18 ~17:46 WIB.
- **Source baseline:** `research-can@00c18235338ee46031703e1dd16bc9318b4ab4d7`, `main@c14b1d0502634cd63cc1a7be7c1e02270b15abc1` (`0.25.0-alpha`), [R19-01 WIP plan](docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md).
- **Changed files (Batch 1):**
  - Renamed plan `docs/plan-rev/NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md` -> `[WIP] NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md` per SOP on execution start.
  - Added [R19 Dataset Audit](r19/results/R19_DATASET_AUDIT.md) (all 22 sources in `NUI_R19-01` Sec. 3: `3 SELECT`, `2 EVAL_ONLY`, `1 HOLD_LICENSE` HaGRIDv2, `3 BLOCKED` incl. DimHand, `13 REJECT`; discovered `846` exact CRC32 duplicates inside `HandGesture-5G` `4.82 GiB` zip via HTTP Range leaving `1,807` unique entries, and `HANDS RGB-D` `CC BY 4.0` `Horiz_HBL` dorsal right-hand-pointing-left `EVAL_ONLY` Range slice).
  - Added standalone `G1_pistol` candidates: [pistol_types.ts](r19/candidates/pistol_types.ts), [pistol_geometry.ts](r19/candidates/pistol_geometry.ts), [pistol_fsm.ts](r19/candidates/pistol_fsm.ts) (`tsc --strict`: exit `0`).
  - Added reproducible Stage P2 evaluation scripts and metrics: [exp_r19_p2_pistol_geometry_fsm.md](r19/experiments/exp_r19_p2_pistol_geometry_fsm.md), [g0_g1_eval.json](r19/results/g0_g1_eval.json), [ipn_test_g0_g1_baseline.json](r19/results/ipn_test_g0_g1_baseline.json), [n0_n1_distractor_landmarks.json](r19/results/n0_n1_distractor_landmarks.json), [n0_n1_p2_eval.json](r19/results/n0_n1_p2_eval.json), [published_vs_excluded_manifest.json](r19/manifests/published_vs_excluded_manifest.json), [SHA256SUMS.txt](r19/manifests/SHA256SUMS.txt).
  - Updated root `LOG.md` and `README.md`. Zero edits to `main`, deployment, or student gameplay.
- **Evidence & Measured Checks (with explicit tiers):**
  - `UNIT_ONLY` / TypeScript `--strict` check on `r19/candidates/*.ts`: **PASS** (`0` errors, exit `0`).
  - `SYNTHETIC` Multi-aspect sweep (`5` aspects × `100`): `G0_main` max error `16.22°` (`9:16`) / `44` zone mismatches -> `G1_pistol` **`0.00°` max error, `0` zone mismatches, `0` `fingerStates` aspect errors, `100%` PRESS recall** (command `vite-node r19/scripts/run_g0_g1_eval.ts`, exit `0`).
  - `SYNTHETIC` 3D->2D Rotated/Pitched/Rolled (`10,500` hands across `15` poses, rolls `±35°`, pitches `±40°`): `G1_pistol` 3-class acc **`99.11%`** (`POINT_READY` `100%` / `0%` false PRESS, `POINT_PRESS` `95.93%` [`100%` std, `91.86%` dorsal-short], `OTHER` `0.00%` false PRESS vs `G0` `77.29%` steer / `UX1` `16.22%`). Dorsal Right-Hand Pointing Left (`O0/O1`): `G1` `50/50 (100%)` std & `46/50 (92%)` dorsal-short with `0` false pinch; explicit `tip4`-over-`5/6` overlap `false_pinch = false`.
  - `SYNTHETIC` Dynamic `RIGHT -> RIGHT+JUMP -> RIGHT` + 50 Hz `JumpAssist` + 100 ms `InputArbiter`: `G1_J3` achieves **`100%` horizontal continuity across `75/60/30/15 Hz`** (`0` drop steps), exact **`1` jump** per raise (`75 Hz J2` single-edge missed with `0`), `0` bunny-hops, `0` carried-over keys after `onPhaseChange()`, `0` stuck keys on `READY`/`OTHER`/`NO_HAND`, and `0/840` noisy non-pistol false keys (`G0=597/840`, `UX1=153/840`).
  - `OFFLINE_DATASET` Cached IPN HandS locked `person_id`-disjoint test (`36` videos, `5` unseen subjects): `NOG` `G1` `OTHER = 96.32%` (`0.24%` FSM steer, `1.11 KEYDOWN/min` vs `G0` `57.98%`), `P2F` `96.60%` (`0.10%` FSM steer), `TUP/OP2` `0.00/min` false `KEYDOWN`; casual 1-finger `P1F` triggers `55.34% POINT_READY`, `5.59% POINT_PRESS` (`2.35%` FSM active, `8.50/min`), `39.07% OTHER` (straight-at-camera curl).
  - `OFFLINE_DATASET` Cached Mendeley `1,133` distractor hands: `G0` steer `29.39%`, `UX1` point `7.50%`, `G1` static `PRESS` `1.15%` (`0` sequential FSM active frames).
  - `SYNTHETIC` Adversarial `N0/N1` (`55` scenes, `eval_p2_n0_n1.ts` exit `0`): `0` MediaPipe FPs on `10 N0_l_sticks` & `5 N1_poster_pistol`; on hallucinated `N0_fan_sticks`/`N1_poster_hand` skeletons, `G0_eval_steer` `7/7` raw & `13/13` scaled/CLAHE vs **`G1` `0/7` & `0/13` PRESS/FSM**.
  - `NOT_TESTED` in Batch 1: Stage P1 data curation completion (actively streaming in VM sandbox), `G2..G5` classifier training, `L0..L2` image dataset runs, browser WASM runtime, physical webcam.
- **Open issues / blockers:** Hard-rule `G1` still fires `5.59%` relaxed-thumb `PRESS` on casual `IPN P1F` and falls back to `READY` on `8.14%` extreme corner-rolled dorsal-short `PRESS`; `DimHand` remains `BLOCKED` (`NC-ND`), `HaGRIDv2` remains `HOLD_LICENSE` (`ShareAlike`).
- **Next:** Complete Stage P1 `CC BY 4.0` dataset extraction (`Natural RGB v3`, `HandGesture-5G` Range stream, `HANDS RGB-D` `Horiz_H*`), visually verify `point_left/point_right` thumb states, train/calibrate `G2..G5` models (<= 200 KB) & run `L0..L2` + browser WASM benchmark (Stages P3–P5).
- **Publication:** this commit batch, see branch history for exact SHA.

## R19-PLAN-20261118-01 — Pistol PRESS dataset/training/runtime research plan

- **Date:** 2026-11-18 sekitar 16:35 WIB (timestamp sesi Owner).
- **Source baseline:** `research-can@86b3e8577b64c8db1009666f8bdae0dbca4b9958`, `main@c14b1d0502634cd63cc1a7be7c1e02270b15abc1`, R18 model card/manifest. Proposed R19 candidate `POINT_READY`/`POINT_PRESS`/virtual-key FSM; training and physical webcam `NOT_TESTED`.
- **Changed files:** added [R19-01 plan](docs/plan-rev/NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md), updated root LOG.md and README.md. No source/model code or PA decisions changed.
- **Evidence/checks:** `PASS SOURCE` inspected GitHub R18/gesture sources and research AGENTS/README/LOG; `PASS PUBLIC_WEB` primary Mendeley HandGesture-5G, Natural RGB, Ego/Exocentric and Exocentric Interaction dataset pages; `NOT_TESTED` R19 data download, model training, typecheck, browser and webcam physical.
- **Correction:** earlier R18 pilot entry saying PR #6 draft is historical; [PR #6](https://github.com/lustresense/hitl-momo/pull/6) was merged to main at `c14b1d0`. This is not a tunnel/Webcam PASS.
- **Publication scope:** one Markdown plan and ledger updates. No raw datasets, personal webcam footage, binaries, artifacts or secrets added. Git tree records file sizes.
- **Next:** Owner sends plan link to R&D agent; agent checks branch, renames [WIP] on actual start, audits datasets/licensing/storage, trains and measures only what is accessible, updates root LOG+README every push. Product adoption, main merge and deployment require separate permissions.
- **Publication:** this commit batch, see branch history for exact SHA.

## R18-PILOT-20261118-03 — Corrected pilot to existing NUI Lab routes

- **Date:** 2026-11-18 WIB.
- **Change:** Owner rejected the added `/nui-lab/r18` URL. The prior pilot plan in `R18-PILOT-20261118-02` is superseded for routing only.
- **Observed remote:** draft [PR #6](https://github.com/lustresense/hitl-momo/pull/6), branch `nui-r18-ux3-live-lab@558b297729c5445aa307545adb41d3f361994d33`. Now extends **existing** `/nui-lab/gesture` and `/nui-lab/canvas` through shared `NuiLabPage` and `LabAnalyzer`. The candidate R18 MLP and weights remain the original IPN HandS trained files.
- **Candidate behavior:** Gesture Lab displays R18 predictions and guards, Canvas Lab applies R18 pinch/erase/swipe guards for experiment modes. Main student/gameplay untouched. Extra pilot route and page removed.
- **Evidence:** `SOURCE_ONLY`; TypeScript/typecheck, test, build, live browser and physical webcam all `NOT_TESTED`. Do not merge/deploy before Ujang validates and reports proof.
- **Next:** Ujang check PR #6, test two **original NUI Lab URLs** and ship via existing tunnel after QA and scoped merge. No new route/tunnel.
- **DimHand:** NOT_USED, ACCESS_NOT_GRANTED. Training source IPN HandS.

## R18-PILOT-20261118-02 — NUI Lab live UX3 candidate PR prepared

- **Date:** 2026-11-18 WIB.
- **Status:** `OBSERVED_REMOTE` PR source present, `STATIC_ONLY / NOT_TESTED` in target build, browser and physical webcam.
- **Source:** R18 UX3 model and candidate TypeScript at `research-can@664de0382b5164818a5c22fe79029c8e3c8ba4a1`.
- **Candidate promotion:** selective copy to `nui-r18-ux3-live-lab` and [draft PR #6](https://github.com/lustresense/hitl-momo/pull/6) targeting `main`; orphan histories were NOT merged. New route `/nui-lab/r18`, same-frame heuristics vs UX3 model predictions, and **shadow-only** hypothetical actions.
- **Main:** not changed by this PR, and no tunnel deployment or real webcam test has occurred.
- **DimHand:** NOT_DOWNLOADED / NOT_USED; official project site requires manual academic-use request and disallows commercial use and redistribution. UX3 was trained on IPN HandS, not DimHand.
- **Caution:** UX2 RAW-first M3 fallback is NOT ported; pilot low-light buttons use existing RAW/AUTO/CLAHE modes only. R18 known false swipe/erase edge cases and CPU long tasks remain open.
- **Next action:** Ujang run typecheck, lint, tests, build, then show a verified browser URL and perform physical-webcam testing. Do NOT merge/deploy or wire R18 actions into student gameplay without explicit Owner approval and QA.
- **References:** [pilot handoff](https://github.com/lustresense/hitl-momo/blob/nui-r18-ux3-live-lab/frontend/implementation/docs/execution/NUI_R18_UX3_LIVE_LAB_HANDOFF_2026-11-18.md), [R18 report](r18/results/R18_MASTER_REPORT.md), [model](r18/models/MODEL_CARD.md).

## R18-DOC-20261118-01 — R&D log discipline and NUI Lab integration-readiness audit

- **Date:** 2026-11-18 WIB.
- **Type:** documentation/governance, read-only feasibility audit; no change to R18 classifier, PA decisions, `main`, product code or runtime.
- **Status:** `OBSERVED_REMOTE` for GitHub paths; `NOT_TESTED` for local browser/Webcam reproduction.
- **Baseline:** `research-can` head before this batch `664de0382b5164818a5c22fe79029c8e3c8ba4a1`; product source R18 report baseline `main@3ef4cc3685fc64bce729c5ae54bc29689f6d3446`. More recent `main@0ad23cb06155db003443598ca0e82ffcd2565a88` was observed during this audit. Main remains unchanged by this batch.
- **Changed in this batch:** create root `LOG.md`, strengthen root `AGENTS.md` to mandate a newest-first log entry and README status update in **every** published commit, and shorten root `README.md` to an operational index. Log all subsequent R&D batches here, never in a new `NOW.md`.
- **R18 artifact status:** published classifier code and `ux3_model_mlp.json` exist at [candidate](r18/candidates/ux3_integrated.ts), [weights](r18/models/ux3_model_mlp.json), [training script](r18/scripts/ux3_train.py), [model card](r18/models/MODEL_CARD.md), and [metrics](r18/results/ux3_training_metrics.json). `KATA-TOOL` reports training and person-disjoint evaluation, not independently rerun here.
- **Main NUI Lab status:** `frontend/implementation/src/components/nui-lab/lab-analyzer.ts` in main currently routes between baseline and an existing **heuristic** experiment via `setExperimentalMode`. Its `NuiLabPage.tsx` uses that lab analyzer. **No evidence of UX3 MLP being loaded in the live main NUI Lab**. Importing files into an orphan R&D branch does not install a model in the product.
- **Residual risks:** failures on continuous `P1F/P2F` swipes, `N0_raw` false erase, simulated-browser CPU long tasks; privacy and license checks; physical-camera lighting, hand takeover and gameplay safety are `NOT_TESTED`.
- **Next action:** a separately scoped, explicitly authorized **NUI Lab-only** A/B prototype using the candidate's actual TypeScript feature extraction, MLP inference, guards and performance counters. Compare baseline heuristics versus UX3 with identical camera frames. Preserve default student/game mapping and `main` safety; Ujang owns local build/tunnel deployment and physical-camera validation. Do not promote into gameplay until measured, reviewed and approved.
- **Publication:** this entry and the README/AGENTS update are published together in a new commit. See `research-can` branch history for its SHA, then report exact remote SHA to Owner.

## R18-PUB-20261118-01 — Agy published curated R18 evidence

- **Date:** 2026-11-18 09:51 WIB (GitHub commit timestamp).
- **Branch/commit:** `research-can@664de0382b5164818a5c22fe79029c8e3c8ba4a1`, parent `56f68121968c09c608acfdf34af7ecedeeaceb1f`. `OBSERVED_REMOTE`.
- **Publication:** 57 file blobs (~1.40 MB total), 51 curated entries in [published/excluded manifest](r18/manifests/published_vs_excluded_manifest.json). 12 excluded local items totaling 3,771,622,767 bytes reported, including datasets, sandbox checkout, caches and video. Manifest file paths and sizes match inspected Git tree. The SHA-256 list is present and consistent with manifest-listed hashes; full byte-for-byte independent checksum recomputation and VM source-file preservation were not performed.
- **R18 plan:** [WIP](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md), not DONE. Code/evidence for UX0–UX5 published.
- **Reported R18 outcomes (`KATA-TOOL`, not independently reproduced):**
  - UX0 baseline offline audit and tests performed; remaining baseline test failures documented.
  - UX1 aspect-corrected geometry, hand ownership/action FSM and guards: offline tests reported PASS; residual false swipe errors.
  - UX2 RAW-first adaptive CLAHE: reported DimLight detection 52.08% raw vs 64.58% M3 on limited dataset slices; this is **not physical webcam performance**.
  - UX3 trained auxiliary IPN HandS MLP `[68,96,48,6]`: model JSON 123,141 bytes; person-disjoint test accuracy 0.8045, macro-F1 0.6156, POINT_1F F1 0.8898; static FIVE class absent from IPN and protected by heuristics. Classifier training and JS export files published, but not integrated into main NUI Lab.
  - UX4 DimHand access/license/storage BLOCKED; not used for model training.
  - UX5 Headless Chromium simulated-camera 180.43s / 2,271 frames: reported PASS for simulated video only; 12.59 effective fps, CPU 2,057 long tasks, physical camera NOT_TESTED.
- **Known residuals:** `N0_raw` static repeated image 1/35 false erase; `P1F/P2F` still produce 21/15 residual false swipes in evaluation; not an exhibition-ready robustness proof.
- **Evidence:** [R18_MASTER_REPORT](r18/results/R18_MASTER_REPORT.md), [Model Card](r18/models/MODEL_CARD.md), [UX3 metrics](r18/results/ux3_training_metrics.json), [Browser simulated experiment](r18/experiments/exp_r18_ux5_browser_sim_harness.md), [Webcam validation protocol](docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md).
- **No product changes:** source remains a candidate. **Next:** investigate and address remaining false actions, then A/B pilot with physical-camera acceptance.

## R18-BOOT-20261118-01 — Orphan research workspace initialized

- **Date:** 2026-11-18 WIB.
- **Branch:** independent orphan history (no main parent), initial documentation-only bootstrap. `AGENTS.md`, `README.md`, `.gitignore`, `.gitattributes` and `docs/{plan-rev,attachments}` created.
- **Documented ref:** `56f68121968c09c608acfdf34af7ecedeeaceb1f` before the Agy publication. `OBSERVED_REMOTE`.
- **R&D status at initial bootstrap:** no research results imported then; R18 publication followed in subsequent commit above.
- **No main changes; no webcam or deployment evidence.**
