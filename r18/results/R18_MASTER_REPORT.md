# R18 NUI R&D Consolidated Report (`research-can` Publication)

- **Baseline Target:** `lustresense/hitl-momo` `main` @ `3ef4cc3685fc64bce729c5ae54bc29689f6d3446` (`0.24.1-alpha`)
- **Plan Reference:** [docs/plan-rev/[WIP] NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md](../../docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md)
- **Owner Physical Camera Protocol:** [docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md](../../docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md)

## R&D report — r18 (UX0–UX4 + Sim Browser Pre-Check) — 2026-11-18 WIB
- **Status:**
  - `UX0 Baseline / Bundle / Dataset Audit`: **PASS** (`OFFLINE_DATASET`, `UNIT_ONLY`, `STATIC_BUNDLE`)
  - `UX1 Geometry / VirtualKey FSM / Ownership / Action Safety`: **PASS** (`UNIT_ONLY`, `SYNTHETIC`, `OFFLINE_DATASET`)
  - `UX2 Adaptive RAW-first Sticky CLAHE (M3)`: **PASS** (`OFFLINE_DATASET` + `SYNTHETIC`)
  - `UX3 Exported IPN CC BY 4.0 MLP + Hybrid Guard`: **PASS** (`REAL_MODEL`, `OFFLINE_DATASET`, `SYNTHETIC`, `UNIT_ONLY`)
  - `UX4 DimHand (ACM MM 2026)`: **BLOCKED** (manual form, `NC-ND` non-commercial license, disk limit)
  - `UX5 Isolated Chromium WASM 180s Run`: **PASS (BROWSER_SIMULATED_VIDEO only)**
  - `UX5 Physical Webcam & Classroom Devices`: **NOT_TESTED** (no `/dev/video*` on VM)
  - Residual / Partial Failures: `SafeSwipeGuard` (`106 -> 21` on `P1F`, `51 -> 15` on `P2F`), `N0_raw` (`1/35` false Erase when static identical frame repeated `5x`), Chromium headless CPU XNNPACK `2,057` Long Tasks (`detect p95 = 99.6 ms`), scoped Vitest on baseline `main` `75/82` files (`838/852` tests, `14` fail).
- **Task & scope:** Curate and publish verified R18 UX0–UX5 pre-physical-camera research code, models, reproducible scripts, manifests, and sanitized JSON results to orphan branch `research-can` without modifying `main`, deployment, databases, or local sandbox originals.
- **Branch / remote commit SHA:** Verified against `lustresense/hitl-momo` branch `research-can` (populated alongside `README.md`, `r18/manifests/SHA256SUMS.txt`, and `r18/manifests/published_vs_excluded_manifest.json`).
- **Baseline & candidate comparison:**
  - *Geometry (`r18_ux1_ab.json`):* Baseline `indexPointAngle()` max error `16.22°` (`16:9` & `9:16`), `8.13°` (`4:3`), `6.34°` (`5:4`) -> Candidate `indexPointAngleAspect()` **`0.00°`** across all aspects.
  - *Thinman FSM & Safety on Locked IPN Test (`r18_ux3_exported_eval.json`, 5 unseen persons, 36 videos):*
    - `NOG`: steer `57.99% (Base) -> 2.57% (UX1) -> 0.27% (UX3)`, dir flips `6.04 -> 0 -> 0/min`, jump `18.09 -> 1.68 -> 0.15/min`, erase `22.12% (Base) / 15.60% (Rev) -> 7.27% (UX1) -> 0.76% (UX3)`.
    - `P1F`: steer `72.10%` (`J1_hold` base) vs `51.79%` (UX1) -> `52.81%` (UX3 active zone), dir flips `1.03 -> 0/min`, swipe `106 (Rev) -> 21`.
    - `P2F`: steer `74.04% -> 1.42% (UX1) -> 0.54% (UX3)`, swipe `51 (Rev) -> 15`.
    - `TUP` erase: `19.29% (Base) / 31.22% (Rev) -> 19.85% (UX1) -> 0.84% (UX3)`.
    - `GRB` erase: `5.59% (Base) / 18.05% (Rev) -> 7.71% (UX1) -> 3.39% (UX3)`.
  - *Low-Light Recovery (`r18_ux2_adaptive.json`, 240 contiguous Mendeley frames):* DimLight det `52.08% (RAW) -> 60.83% (auto_320) -> 64.58% (M3)`; NaturalLight det `37.50% (RAW) -> 50.00% (auto_320) -> 59.17% (M3)`.
  - *Mendeley 600 unseen frames (`r18_ux3_exported_eval.json`):* False steer `9.0%–11.33% (Base) -> 0.00% (UX3)`, false erase `10.67%–32.00% (Base) -> 0.00% (UX3)`.
  - *Static & Pinch (`r18_ux3_exported_eval.json`):* `palm`/`stop` (`FIVE`) `3/3` Erase; `four`/`three`/`fist`/`one`/`two_up`/`peace` `0/3` Erase; Pinch `10/10` (`<=0.25` span), `0/10` (`>=0.35` span).
- **Environment:** Linux VM (`63 GiB` disk, `~4.0 GiB` free), Node `v22.23.5`, Python `3.12.x` (`mediapipe 1.2.3`, `opencv 5.0.0.93`, `numpy 2.5.5`), Chromium Headless Shell `156.0.8078.4` (`v1248`, software CPU XNNPACK delegate), IPN HandS (`CC BY 4.0`), Mendeley `bxr7kx84y6` (`CC BY 4.0`).
- **Evidence & Sizes:** `ux3_model_mlp.json` (`123,141 B` raw / `44,065 B` wire `zstd`; TEST `acc=0.8045`, `macroF1=0.6156`, `POINT_1F F1=0.8898`, `ECE=0.01671`, TS parity `max_diff=7.239e-6`, `p50=20.83 µs`); Browser cold transfer **`10.811 MB` (`11,336,623 B`) < 25 MB**; 180s sim-video `2,271` frames (`12.59 fps`, `ux3 p95=0.2 ms`, `[falseSteer=0, falseErase=0, falseSwipe=0]` vs base `[370, 141]`, `cdpPerf.jsHeapUsedMB=8.89 -> 8.31 MB`, track stop `1/1`, `0` page errors).
- **Failure cases / ambiguity:** Residual `P1F`/`P2F` false swipe overlap (`21`/`15`); `1/35` `N0_raw` false erase if held static `5x`; IPN HandS lacks static `FIVE`/`FOUR` classes so Erase relies on `isSafeEraseFrame` + dynamic vetoes; headless CPU WASM triggers Long Tasks; physical webcam `NOT_TESTED`.
- **Published / Excluded manifests:** See [../manifests/published_vs_excluded_manifest.json](../manifests/published_vs_excluded_manifest.json) and [../manifests/SHA256SUMS.txt](../manifests/SHA256SUMS.txt).
- **Decisions NOT made:** No changes to `main`, no adoption of `ux3_model_mlp.json` or UX1/UX2 thresholds into production source/UI, no HaGRIDv2 ShareAlike legal approval, no physical-camera robustness sign-off.
- **Owner action needed:** Review `research-can` artifacts and execute physical-camera live checklist in [../../docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md](../../docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md) on real student devices before authorizing any scoped product integration PR.
