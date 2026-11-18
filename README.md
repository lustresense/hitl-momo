# CAN Research Workspace — `research-can`

**Repository:** [lustresense/hitl-momo](https://github.com/lustresense/hitl-momo)  
**Branch:** `research-can` (independent **orphan**, no `main` history)  
**Owner:** CAN · **Executor:** authorized terminal agent / Agy  
**Baseline Product Target (`main`):** `3ef4cc3685fc64bce729c5ae54bc29689f6d3446` (`0.24.1-alpha`, read-only comparison)  
**Purpose:** R&D for Sketchbook Universe's NUI / MediaPipe finger tracking, low-light robustness, gesture recognition, hand lock, and adjacent interaction experiments.

This is **NOT** a second product, official PA decision record, `main` checkout, or deployment branch. The product and authoritative CAN decisions remain on `main`. File selection and artifact hygiene apply strictly to keep raw datasets, secrets, caches, and compiled bundles out of Git.

---

## Navigate

- [AGENTS.md](AGENTS.md) — mandatory operational contract, permissions, publication whitelist, evidence and reporting.
- [docs/plan-rev/](docs/plan-rev/) — revision plans using filename status markers (`[WIP]` / `[DONE]` / unmarked):
  - [`[WIP] NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md`](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md)
- [docs/attachments/](docs/attachments/) — vetted Owner references and checklists (**not** a plan queue):
  - [`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`](docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md)
  - [`DIMHAND_AUDIT_SUMMARY.md`](docs/attachments/DIMHAND_AUDIT_SUMMARY.md)
- [r18/](r18/) — curated R18 experiments, candidate TypeScript/browser implementations, models, manifests, scripts, and JSON/Markdown evidence:
  - [`r18/experiments/`](r18/experiments/) (`exp_r18_ux0_baseline.md` .. `exp_r18_ux5_browser_sim_harness.md`)
  - [`r18/candidates/`](r18/candidates/) (`ux1_candidates.ts`, `ux3_features.ts`, `ux3_model.ts`, `ux3_integrated.ts`, `browser_harness/`)
  - [`r18/models/`](r18/models/) (`ux3_model_mlp.json`, `ux3_model_lr.json`, [`MODEL_CARD.md`](r18/models/MODEL_CARD.md))
  - [`r18/results/`](r18/results/) ([`R18_MASTER_REPORT.md`](r18/results/R18_MASTER_REPORT.md) + `r18_ux*.json`, `ux3_*.json`)
  - [`r18/scripts/`](r18/scripts/) (`r18_ux0_*`, `r18_ux1_ab.ts`, `r18_ux2_adaptive.py`, `ux3_*`, `make_sim_camera_y4m.py`, `run_browser_harness.mjs`)
  - [`r18/manifests/`](r18/manifests/) (`dataset_manifest.json`, `ipn_person_split.json`, `published_vs_excluded_manifest.json`, `SHA256SUMS.txt`)

**Only one root `AGENTS.md` and one root `README.md`.**

---

## Local-to-branch mapping preserved

| Verified local source (`/srv/sketchbook/mediapipe-optimize/`) | Destination on `research-can` | Treatment |
| --- | --- | --- |
| `docs/plan-rev/NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md` | [`docs/plan-rev/[WIP] NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md`](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md) | Retained verbatim + appended execution tracker; local original untouched |
| Vetted Owner protocols & dataset notes | `docs/attachments/` | [`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`](docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md), [`DIMHAND_AUDIT_SUMMARY.md`](docs/attachments/DIMHAND_AUDIT_SUMMARY.md) |
| `r18-ux0-sandbox/{candidates,scripts,harness-src,results}` (curated ~1.3 MiB) | `r18/` | Curated allowlist only; raw datasets (`1.6G`), `.venv` (`559M`), `repo` (`754M`), `.pw-browsers` (`278M`), tools (`269M`), `ipn_*_seq.json` (`187M`), `sim_cam.y4m` (`50M`), compiled JS excluded |

---

## Plan lifecycle

| Filename in `docs/plan-rev/` | Meaning | Current Document |
| --- | --- | --- |
| `Rencana.md` | Not yet discussed/started | — |
| `[WIP] Rencana.md` | In progress, including blocked/failed tests | [`[WIP] NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md`](docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md) |
| `[DONE] Rencana.md` | All deliverables & acceptance gates evidenced | Not yet reached (`UX4 DimHand` `BLOCKED`; physical webcam `NOT_TESTED`) |

---

## Current progress register (newest-first)

| Revision / Stage | Plan | Work & Verification Type | Linked Evidence | Status |
| --- | --- | --- | --- | --- |
| **R18-UX5 (Sim Pre-Check)** | `[WIP] NUI_R18-01 v0.3.0` | Headless Chromium WASM (`180.43s`, `2,271` frames Mendeley+N0 `.y4m`) + cold `zstd` wire transfer (`10.811 MB < 25 MB`) (`BROWSER_SIMULATED_VIDEO`) | [`exp_r18_ux5_browser_sim_harness.md`](r18/experiments/exp_r18_ux5_browser_sim_harness.md), [`r18_ux4_browser_runtime.json`](r18/results/r18_ux4_browser_runtime.json) | **PASS** *(Sim-Video; CPU XNNPACK `2,057` Long Tasks; physical webcam **NOT_TESTED**)* |
| **R18-UX5 (Physical)** | `[WIP] NUI_R18-01 v0.3.0` | Live 480p low-light / ceiling / backlight / skin-bg / classroom hardware validation | [`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`](docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md) | **NOT_TESTED** *(No `/dev/video*` on VM)* |
| **R18-UX4** | `[WIP] NUI_R18-01 v0.3.0` | DimHand ACM MM 2026 project/repo/`supp.pdf` audit | [`exp_r18_ux4_dimhand_audit.md`](r18/experiments/exp_r18_ux4_dimhand_audit.md), [`DIMHAND_AUDIT_SUMMARY.md`](docs/attachments/DIMHAND_AUDIT_SUMMARY.md) | **BLOCKED** *(Manual approval form, `NC-ND` license, >4 GiB size)* |
| **R18-UX3** | `[WIP] NUI_R18-01 v0.3.0` | Person-disjoint IPN `CC BY 4.0` `[68->96->48->6]` MLP (`123 KB`), TS parity (`7.24e-6`), locked TEST + Mendeley 600f + static `FIVE/FOUR/Pinch` (`REAL_MODEL` + `OFFLINE_DATASET`) | [`exp_r18_ux3_ipn_classifier.md`](r18/experiments/exp_r18_ux3_ipn_classifier.md), [`ux3_training_metrics.json`](r18/results/ux3_training_metrics.json), [`r18_ux3_exported_eval.json`](r18/results/r18_ux3_exported_eval.json) | **PASS** *(Partial residual: `1/35 N0_raw` false erase if static `5x`, `21/15` P1F/P2F false swipe)* |
| **R18-UX2** | `[WIP] NUI_R18-01 v0.3.0` | `RAW-first` sticky `CLAHE-320` recovery vs `auto_320` on 240f DimLight/NaturalLight + 40 `N0/N1` (`OFFLINE_DATASET` + `SYNTHETIC`) | [`exp_r18_ux2_adaptive_clahe.md`](r18/experiments/exp_r18_ux2_adaptive_clahe.md), [`r18_ux2_adaptive.json`](r18/results/r18_ux2_adaptive.json) | **PASS** *(Det `64.58%` DimLight, `59.17%` NaturalLight)* |
| **R18-UX1** | `[WIP] NUI_R18-01 v0.3.0` | Aspect angle (`0°`), skeleton gate v2 (`99.6–99.8%`), `P2_balanced`, `VirtualKeySteeringFSM`, `F10`, `J2_edge`, `FaceAnchor` (`UNIT_ONLY` + `OFFLINE_DATASET`) | [`exp_r18_ux1_geometry_fsm.md`](r18/experiments/exp_r18_ux1_geometry_fsm.md), [`r18_ux1_ab.json`](r18/results/r18_ux1_ab.json) | **PASS** *(Residual `P1F`/`P2F` false swipes -> motivated UX3)* |
| **R18-UX0** | `[WIP] NUI_R18-01 v0.3.0` | Audit of `main` (`3ef4cc3685fc`) build, scoped Vitest, IPN/Mendeley/N0/geometry errors | [`exp_r18_ux0_baseline.md`](r18/experiments/exp_r18_ux0_baseline.md), [`r18_ux0_b_ipn_rules.json`](r18/results/r18_ux0_b_ipn_rules.json) | **PASS** *(Baseline audit complete; R17 `.json` weights absent on VM)* |

---

## Candidate index

| Candidate ID | Base SHA | Hypothesis / Change | Evaluation Evidence | Limitations | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `ux1-geom-fsm-v2` ([`ux1_candidates.ts`](r18/candidates/ux1_candidates.ts)) | `3ef4cc3685fc` | Aspect-corrected `indexPointAngleAspect`, inclusive `palmScale` skeleton gate, `P2_balanced` intent, `VirtualKeySteeringFSM` (`F10`, `J2_edge` sustained re-arm `>=130ms`), `SafeSwipeGuard`, `isSafeEraseFrame` | `0°` multi-aspect error (`r18_ux1_ab.json`); `99.60%` TEST real hands kept; `NOG` steer `57.99% -> 2.57%`, `dirFlip = 0/min`, `P2F` steer `74.04% -> 1.42%`, held jump `26 -> 1` | Rule-only Erase still fires on dynamic `GRB` (`7.71%`), `OP2` (`11.09%`), `TUP` (`19.85%`); `SafeSwipeGuard` fires `21/15` on continuous `P1F/P2F` | Foundation candidate for steering/geometry/FSM; pair with UX3 vetoes & physical test |
| `ux2-raw-first-m3` ([`r18_ux2_adaptive.py`](r18/scripts/r18_ux2_adaptive.py)) | `3ef4cc3685fc` | Run `RAW` first; invoke `CLAHE-320` + 5-frame sticky recovery only on dark/backlit RAW misses | DimLight det `52.08% (RAW) -> 60.83% (M0) -> 64.58% (M3)`; NaturalLight `37.50% -> 50.00% -> 59.17%`; avoids `10/35` CLAHE `N0_fan_sticks` hits in bright scenes | Fallback dual-pass increases worst-case `p95` frame latency (`42.8 ms` Python, `99.6 ms` WASM CPU) | Candidate preprocessing replacement for `auto_320`, pending physical low-light webcam check |
| `ux3-ipn-mlp-hybrid` ([`ux3_integrated.ts`](r18/candidates/ux3_integrated.ts), [`ux3_model_mlp.json`](r18/models/ux3_model_mlp.json)) | `3ef4cc3685fc` | Person-disjoint IPN `CC BY 4.0` `[68->96->48->6]` MLP (`123 KB`, `T=1.2325`) + UX1 geometry/FSM + `FIVE`-safe Erase veto (`NOG/THROW`/jitter) | Locked TEST: `macroF1=0.6156`, `POINT_1F F1=0.8898`, TS parity `max_diff=7.24e-6` (`20.8 µs`); `NOG` steer `0.27%`, `NOG` erase `0.76%`, `TUP` erase `0.84%`; Mendeley 600f false steer/erase `0.00%`; `FIVE` `3/3`, `FOUR` `0/3`, Pinch `10/10` (`<=0.25`) vs `0/10` (`>=0.35`); Browser 180s sim-video `10.811 MB` wire, `[0, 0]` false steer/erase | IPN lacks static `FIVE/FOUR` class; `N0_raw` `1/35` false erase if identical frame `5x`; `P1F`/`P2F` continuous sweeps still emit `21`/`15` swipes; physical webcam `NOT_TESTED` | Top candidate for Owner physical-webcam acceptance trial (`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`); **do not merge to `main` yet** |

---

## Mandatory batch report (`R18 UX0–UX4 + Browser Sim-Video` — 2026-11-18 WIB)

Full structured report: [`r18/results/R18_MASTER_REPORT.md`](r18/results/R18_MASTER_REPORT.md) (summary below; inspect [`r18/manifests/published_vs_excluded_manifest.json`](r18/manifests/published_vs_excluded_manifest.json) and [`r18/manifests/SHA256SUMS.txt`](r18/manifests/SHA256SUMS.txt) for per-file audit).

- **Status:** `UX0–UX3` **PASS** *(offline/unit/synth/exported TS)*; `UX5 Pre-Check` **PASS (BROWSER_SIMULATED_VIDEO only)**; `UX4 DimHand` **BLOCKED**; `UX5 Physical Webcam` **NOT_TESTED**.
- **Regressions / failures / ambiguities:** Continuous pointing sweeps still overlap 1/2-finger swipe (`21` on `P1F`, `15` on `P2F` over 23+ min each); `1/35` `N0_raw` false erase under `5x` repeated identical frames; headless CPU WASM produced `2,057` Long Tasks (`detect p95 = 99.6 ms`); baseline `main` scoped Vitest had `14/852` pre-existing/gate-leak test failures (`r18_ux0_a_bundle.json`).
- **Decisions NOT made:** No changes to `main`, deployment, backend, DB, or product NUI runtime; no approval of `ux3_model_mlp.json` for shipping; no HaGRIDv2 ShareAlike clearance; no claim of real physical-webcam pass.
- **Owner action needed:** Review `research-can` results & run [`OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`](docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md) on real student cameras before authorizing any scoped product integration PR to `main`.
