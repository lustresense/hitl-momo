# Experiment R19 Stage P3/P4 — Pistol Classifier Training, Scale/Aspect Confounder Fix & Browser Benchmark

- **Date:** `2026-11-18`
- **Plan:** [`[WIP] NUI_R19-01 v0.1.0`](../../docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md)
- **Evidence Tiers Used:** `OFFLINE_DATASET` (`HandGesture-5G`, `Natural RGB v3`, `IPN HandS`, `Mendeley bxr7kx84y6`), `SYNTHETIC` (`82/82` invariants, `N0/N1`, `MEDIAN_SKELETONS`, `JumpAssist` physics loop), `BROWSER_SIMULATED_VIDEO` (`180 s` Chromium WASM). Physical webcam remains **`NOT_TESTED`**.

---

## 1. Hypotheses Tested
- **H3.1 (Compact ReLU MLP + Calibration over Linear LR):** Replacing R18's linear head / LR baseline (`G2`) with a regularized ReLU MLP `[82 -> 96 -> 48 -> 3]` (`G3`) + VAL temperature scaling suppresses non-linear distractors (`V-Sign`, `thumbs_up`, `NOG`, `P2F`) while preserving high `L-Sign` recall.
- **H3.2 (Scale Shortcut Discovery & Elimination):** Naive inclusion of raw screen `hand_size` (`hs`) causes models trained on close-up `HandGesture-5G` (`hs ~ 0.66`) vs distant webcam `IPN/Natural RGB v3` (`hs ~ 0.27`) to memorize `hand_size < 0.35 => OTHER`, collapsing real-world small-hand `L-Sign` recall. Replacing `hs` with normalized `thumb_over_index_reach` enforces full scale + aspect + rotation invariance.
- **H3.3 (Conflation Anti-Pattern `P1F == POINT_PRESS`):** Training `IPN P1F/C1F/2C1` as `POINT_PRESS` destroys `POINT_READY` vs `POINT_PRESS` specificity and inflates phantom triggers on `NOG`/`P2F`.
- **H3.4 (`G4` Hybrid Safety + Browser Budget):** Fusing `G1` hard geometric barriers + `G3` MLP veto/rescue + `PistolVirtualKeyFSM` maintains `< 200 KB` model size, `< 25 MB` cold wire budget, `<= 0.2 ms` JS inference p95, and zero key stickiness over `180 s`.

---

## 2. Commands & Measured Results

1. **Invariant & Micro-Latency Gate (`test_r19_invariants_and_latency.ts`, `exit 0`):**
   - `feature_count = 82` -> `max_aspect_invariant_diff = 1.577e-14` across all `82/82` features, `5` aspects (`1:1..9:16`), and `3` scales (`0.22, 0.45, 0.85`).
   - Knuckle collapse (`5 == 17`) finite; pure MLP `p50 = 22.29 µs`, `p95 = 27.44 µs`; full `G4` pipeline `p50 = 55.60 µs`, `p95 = 87.12 µs`.
2. **Unified Feature Extraction (`extract_r19_unified.ts` + `--p1f-trap`, `exit 0`):**
   - Clean splits: `train = 17,086`, `val = 5,067`, `test = 4,720`. `P1F`-trap ablation: `train = 50,317`, `val = 12,057`, `test = 11,326`.
3. **Training & Calibration (`train_r19_models.py`, `exit 0`):**
   - Selected **`G3` (`mlp_96_48_n03`)**: `val_macroF1 = 0.9515` (`T = 1.27`), locked `test acc = 0.9985`, **`test macroF1 = 0.9567`**, `ECE = 0.00137`, **`122,768 B` (`119.89 KiB`)**.
   - Linear `G2` (`lr_l2_3e4`): `test acc = 0.9786`, `macroF1 = 0.6748`, `5,092 B`.
   - Ablation `G5_r18feat` (`68`-dim): `test L-Sign` recall at `x0.22` webcam scale drops from **`33/33 (100%, G3_82dim)` -> `2/33 (6.06%)`**.
   - Ablation `G5_p1f_trap`: `NOG` false `POINT_PRESS` jumps from **`0.04%` (`G3`) -> `27.40%`**, `P2F` **`0.09%` -> `25.26%`**, `HG5G Pointing Up -> PRESS` **`0.00%` -> `19.05%`**.
4. **Full End-to-End Evaluation (`eval_r19_all.ts`, `exit 0`):**
   - Parity `150` rows: `max_abs_diff = 2.494e-6`, `0` argmax mismatches.
   - `VAL` selected `G4` Hybrid: `tauPress = 0.38`, `tauPressRescue = 0.60`, `otherVetoTau = 0.72`, `allowSoftDorsalRescue = true`.
   - Held-out `Natural RGB v3` (`888` neg hands): `G0 = 61.60%` false steer, `G3 = 0.00%`, **`G4_Hybrid = 0.00%` FSM active / `0` keydowns**.
   - Locked `IPN` (`36` videos): `G4_Hybrid` **`0.00/min`** on `NOG` (`G1 = 1.11`), **`0.04/min`** on `P2F` (`G1 = 0.64`), **`0.09/min`** on casual `P1F` (`G1 = 8.50`).
   - Mendeley (`599`) & `N0/N1` (`33`): `G4 = 0.00%` active & `0/33`. Synthetic `JumpAssist` `50 Hz`: `100%` horizontal continuity & `1` jump at `75/60/30/15 Hz`.
5. **180 s Chromium WASM Benchmark (`run_r19_browser_harness.mjs`, `exit 0`):**
   - `10.83 MB < 25 MB` wire (`r19_model_mlp.json = 47,288 B` wire), `14.18` MP FPS (`81.88%` adaptive det w/ `+79` CLAHE hits), `r19Ms p95 = 0.2 ms`, `50/50` matched `KeyDown/KeyUp/Jump`, `0` page errors, `stoppedCleanly = true`.

---

## 3. Pending Item for Stage Finalization
- `HANDS RGB-D` (`ndrczc35bt.2`, `EVAL_ONLY`) HTTP Range curation across `Subject1..Subject5` is running in parallel to add out-of-domain real `Horiz_HBL` (dorsal right-hand pointing left) evaluation metrics.
