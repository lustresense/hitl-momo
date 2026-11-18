# Experiment R18-UX3 — Lightweight `CC BY 4.0` Classifier & Exported Browser-Runtime A/B

- **Test Types:** `REAL_MODEL`, `OFFLINE_DATASET` (`IPN HandS` & `Mendeley`), `SYNTHETIC` (`realistic-hands` & `N0/N1`), `UNIT_ONLY`
- **Why R18-UX3 Was Needed:** Pure geometric UX1 rules still triggered false Hapus on `TUP` (`19.85%`), `OP2` (`11.09%`), `GRB` (`7.71%`), and `NOG` (`7.27%`), while R17 `.json` weights are unavailable on VM and HaGRIDv2 uses a ShareAlike license requiring Owner legal sign-off.
- **Candidate Modules:** `r18/candidates/ux3_features.ts`, `ux3_model.ts`, `ux3_integrated.ts`, `r18/models/ux3_model_mlp.json` (`123,141 B`)
- **Reproduction Commands:**
  1. `python r18/scripts/ux3_stream_train.py | vite-node r18/scripts/ux3_extract_ts.ts`
  2. `python r18/scripts/ux3_train.py`
  3. `vite-node r18/scripts/ux3_eval_exported.ts`

## Training & Calibration (`r18/results/ux3_training_metrics.json`)
- **Strict `person_id`-Disjoint Split (`0` overlap):** `19` train (`128` videos, `221,715` rows), `5` val (`36` videos, `120,020` rows), `5` locked test (`36` videos, `110,881` rows).
- **Bug Found & Fixed During Execution:** Initial extraction shared a mutable `Float32Array` buffer across queued Node `WriteStream` writes (yielding `0.21` val F1); replaced with synchronous `writeSync` chunk flushing (`ux3_extract_ts.ts`) — feature statistics immediately aligned and validation macro-F1 jumped to **`0.7006`** (`mlp_96_48_n02`).
- **Locked Test (Frame Classification):** `mlp_96_48_n02` acc **`0.8045`**, macro-F1 **`0.6156`**, `POINT_1F F1 = 0.8898`, `T = 1.2325`, `VAL ECE = 0.03032 -> 0.00360`, `TEST ECE = 0.01671`.
- **TS Parity:** `max_abs_prob_diff = 7.239e-6` (`120` unseen rows, `0` argmax mismatch), JS `p50 = 20.83 µs / p95 = 41.04 µs`.

## Exported Model A/B & Failure Catch (`r18/results/r18_ux3_exported_eval.json`)
- **Initial Regression Caught Before Browser Testing:** An early Erase veto (`sum(GRAB+THROW+1F+2F) >= 0.55`) dropped static `MEDIAN_SKELETONS.palm/stop` (`FIVE`) to `0/3` Erase because IPN HandS has no static `FIVE` class. Revised `isUx3SafeEraseFrame` vetoes only `NOG >= 0.50`, `THROW_SWIPE >= 0.45`, or high motion jitter (`wristSpeed > 1.3 || shapeJitter > 0.9`).
- **Static & Pinch Check After Fix:** Static `FIVE` (`palm`, `stop`) **`3/3` Erase**, `four`/`three`/`fist`/`one`/`two_up`/`peace` **`0/3` Erase**, `one` steers `walk-left` (`85°`), `jump` (`0°`), `walk-right` (`-85°`). Pinch gap `0.05..0.25` -> **`10/10` active**; `0.35..0.80` -> **`0/10`**.
- **IPN Locked Test Sequences (`Baseline -> UX1 -> UX3`):**
  - `NOG`: steer `57.99% -> 2.57% -> 0.27%`, jump `18.09 -> 1.68 -> 0.15/min`, erase `22.12% -> 7.27% -> 0.76%`.
  - `TUP` erase `19.29% (base) / 31.22% (rev) -> 0.84%`; `GRB` erase `18.05% (rev) -> 7.71% -> 3.39%`; `OP2` erase `18.91% (rev) -> 11.09% -> 6.74%`.
  - `P1F` active zone `52.81%` (`0` dir-flips/min), `C1F` `65.77%`, `p50` activation delay `200 ms`.
- **Unseen Mendeley (`600` frames RAW / CLAHE320 / M3):** False Steer `9.0%–11.33% (Base) -> 0.00% (UX3)`; False Erase `10.67%–32.00% -> 0.00%`; False Swipe `0`.
- **`N0`/`N1` Distractors:** `0` false steer/pinch/swipe everywhere, `0` false erase on `N0_clahe320` and `N1`, **`1/35` false erase on `N0_raw`** if identical static frame repeated `5x`.
