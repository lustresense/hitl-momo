# Model Card — `ux3_model_mlp.json` (`r18-ux3-v1`)

- **Published Paths (`research-can`):** `r18/models/ux3_model_mlp.json` (plus linear baseline `r18/models/ux3_model_lr.json`)
- **Size:** `123,141 B` (`120.3 KiB`) uncompressed JSON; **`44,065 B` (`~43 KiB`)** over HTTP (`zstd` wire length measured in Chromium CDP test)
- **SHA-256:** `518c0ec4df9f34009125abf01225e1d3d8d5f33aba797a159accce4b7aa41d3f` (`ux3_model_lr.json`: `6,791 B`, SHA-256 `45ebb7206d5df770bf542ff17079027dc3e22446625b2eb29b7bef1179c3dda2`)
- **Architecture:** Dense ReLU MLP `[68 -> 96 -> 48 -> 6]` (`mlp_96_48_n02`, Adam + cosine LR + L2 `3e-4` + input noise `0.03`, best epoch `26`), z-score standardization fit on TRAIN only, and post-hoc temperature scaling (`T = 1.2325` tuned on VAL)
- **License & Provenance:** Trained strictly on **IPN HandS** (`CC BY 4.0`, MediaPipe landmarks `Apache 2.0`), zero HaGRIDv2 (`ShareAlike`) annotations/weights, zero DimHand (`BLOCKED / NC-ND`) data.

## Data Split (Strict `person_id`-Disjoint)
Official IPN HandS `148/52` splits overlap 8 subjects (`1,2,3,12,13,15,18,21`). We enforce a strictly disjoint partition ([r18/manifests/ipn_person_split.json](../manifests/ipn_person_split.json)):
- **Train:** `19` persons, `128` videos, `221,715` rows (`NOG=44454, POINT_1F=71203, POINT_2F=69917, GRAB_FIST=7138, THROW_SWIPE=13177, OPEN_ZOOM=15826`; dense `NOG/P1F/P2F` stride-2 sampled *after* sequential temporal feature extraction)
- **Val:** `5` persons (`2, 3, 8, 17, 22`), `36` videos, `120,020` rows (architecture selection, `T` calibration, `tauPoint1f` selection)
- **Test (Locked):** `5` persons (`6, 10, 13, 21, 29`), `36` videos, `110,881` rows

## Input Features & Classes
- **68 Causal Features ([r18/candidates/ux3_features.ts](../candidates/ux3_features.ts)):** `56` rotation/scale/handedness-invariant spatial features normalized by `palmScale = max(||w-m||, ||idxMCP-pinkyMCP||)` + `12` aspect-foreshortening, scale, and 0-lookahead causal motion features (~80–180 ms lag: wrist speed/vx/vy, tip8 speed, pinch delta, index reach delta, finger spread delta, multi-tip jitter).
- **6 Behavioral Classes (`UX3_LABELS`):** `NOG`, `POINT_1F` (`P1F+C1F+2C1`), `POINT_2F` (`P2F+C2F+2C2`), `GRAB_FIST` (`GRB`), `THROW_SWIPE` (`TUP+TDN+TLT+TRT`), `OPEN_ZOOM` (`OP2+ZIN+ZOT`).

## Verified Performance (`REAL_MODEL` Exported JS Inference)
- **Locked Test Frame Metrics ([r18/results/ux3_training_metrics.json](../results/ux3_training_metrics.json)):** Accuracy **`0.8045`** (LR `0.7869`), Macro-F1 **`0.6156`** (LR `0.5765`), Calibrated NLL **`0.54665`**, ECE **`0.01671`** (`VAL ECE: 0.03032 -> 0.00360`)
  - Per-class F1 (`TEST`): `POINT_1F = 0.8898` (`P=0.9034, R=0.8766`), `POINT_2F = 0.8649` (`P=0.8859, R=0.8449`), `NOG = 0.7406` (`P=0.7454, R=0.7359`), `OPEN_ZOOM = 0.5314`, `THROW_SWIPE = 0.3995`, `GRAB_FIST = 0.2676`
- **Python vs TS Parity ([r18/results/r18_ux3_exported_eval.json](../results/r18_ux3_exported_eval.json)):** `120` unseen rows -> `max_abs_prob_diff = 7.239e-6`, `0` argmax mismatches
- **Pure JS Latency:** Node `p50 = 20.83 µs`, `p95 = 41.04 µs` per hand; Chromium browser UX3 pipeline `p50 = 0.0–0.1 ms`, `p95 = 0.2 ms`

## Known Limitations & Boundaries
1. **Out-of-distribution static `FIVE`/`FOUR`:** IPN HandS has no static open-palm `FIVE` class, so Erase (`Hapus`) pairs `isSafeEraseFrame` (100% static `FIVE`, 0% `FOUR`/`THREE`) with calibrated `NOG`/`THROW_SWIPE`/motion vetoes rather than shape overrides.
2. **Continuous pointing coverage (`P1F`):** ~52.81% active zone coverage on IPN `P1F` because many IPN subjects point toward the camera (depth foreshortened / inside deadband).
3. **`N0_raw` identical-frame repeat edge case:** Repeating 1 of 4 raw `N0_fan_sticks` hallucinations `5x` identically triggered `1/35` Erase (`0` on `N0_clahe320`, `0` on `N1`).
4. **Physical Webcam:** **`NOT_TESTED`** (only simulated `.y4m` Chromium WASM test was run: [r18/results/r18_ux4_browser_runtime.json](../results/r18_ux4_browser_runtime.json)).
