# LOG.md — CAN Research R&D Activity and Evidence Ledger

**Branch:** `research-can`, orphan branch of `lustresense/hitl-momo`  
**Status source:** GitHub commit/tree for published files; referenced R18 reports for experimental claims.  
**Format:** newest entry at the top; no `NOW.md` or separate VERSION file. The branch root README holds only the current snapshot and links to this full log.  
**Meaning:** `OBSERVED_REMOTE` = independently inspected GitHub; `KATA-TOOL` = measurements reported by Agy, not rerun by ChatGPT; `NOT_TESTED` = no evidence of execution. `PASS` must always include what was actually tested.

---

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
