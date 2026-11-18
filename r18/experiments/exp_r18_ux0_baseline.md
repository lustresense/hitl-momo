# Experiment R18-UX0 — Baseline Audit on `main` (`3ef4cc3685fc`)

- **Test Types:** `UNIT_ONLY`, `OFFLINE_DATASET`, `SYNTHETIC`, `STATIC_BUNDLE`
- **Baseline Product Target:** `lustresense/hitl-momo` `main` commit `3ef4cc3685fc64bce729c5ae54bc29689f6d3446` (`0.24.1-alpha`)
- **Environment:** Linux VM (`/dev/sda2` `63 GiB`, `~4.0–4.8 GiB` free), Node `v22.23.5`, Python `3.12` (`mediapipe 1.2.3`, `opencv 5.0.0.93`, `numpy 2.5.5`), zero physical camera (`/dev/video*` absent)

## Scope & Commands Executed
1. **UX0-A Bundle & Scoped Tests (`r18/scripts/r18_ux0_a_bundle.py`, `r18/results/r18_ux0_a_bundle.json`):**
   - `tsc --noEmit`, `next lint`, `NEXT_PUBLIC_TEST_HOOKS=0 ... next build` -> static export (`97` files in `out/`).
   - Scoped Vitest (`tests/input tests/camera tests/nui-lab`): `75/82` files passed (`838/852` tests passed, `14` failures across `7` files: 6 pre-existing R17 files + `gameplay-primary-hand.test.ts` missing `sharedDetectionGate` reset).
   - First-use transfer upper-bound: `app` (`1,884,891 B` raw) + `nui_simd` (`17,682,663 B` raw) = **`19,567,554 B`** raw (`9,524,134 B` gzip / `9,491,799 B` zstd all; **`11,463,810 B`** zstd if Caddy skips `.task`/`.tflite`).
2. **UX0-B IPN HandS Detection & Rules (`r18/scripts/r18_ux0_b_ipn.py`, `r18_ux0_b_eval.ts` -> `r18_ux0_b_ipn_detection.json`, `r18_ux0_b_ipn_rules.json`):**
   - Verified IPN HandS (`CC BY 4.0`, `200` videos, `801,476` frames) SHA-256 & observed official `148/52` train/test shares **8 `person_id`s** (`1,2,3,12,13,15,18,21`).
   - MediaPipe miss rate: `10.45%` train (`51,180 / 489,828`), `7.54%` test (`14,356 / 190,455`; `P2F 13.65%`, `TRT 10.92%`, `P1F 10.23%`); false hand when GT empty: `3.75%` train, `2.28%` test.
   - Legacy & R17 revised rules on IPN test GT: `NOG` false Hapus `16.40%` (`base`) / `11.95%` (`rev`), false Pinch `25.42%` / `22.31%`, false Thinman move/jump **`48.38%`**; `SwipeCommander` `131/161` false Undo/Redo on `P1F`/`P2F` MP.
3. **UX0-C Mendeley & Negative Distractors (`r18/scripts/r18_ux0_c_mendeley.py`, `r18_ux0_c_negatives.py`, `r18_ux0_e_n0_negatives.py` -> `r18_ux0_c_mendeley.json`, `r18_ux0_c_negatives.json`, `r18_ux0_e_n0_n1.json`):**
   - Mendeley `bxr7kx84y6` v2 (`CC BY 4.0`, 300 frames each): `clahe_320` raised detection (`47.0% -> 62.0%` DimLight; `40.33% -> 58.67%` NaturalLight) vs `raw`, **but** dropped `raw_only` large hands (`9/11`), shifted `tip8`, and escalated `N0_fan_sticks` false positives from **`4/35` (`raw`) -> `10/35` (`scaled_320`/`clahe_320`)**. `N1_poster_hand` triggered `3/5` in all modes.
4. **UX0-D Geometry (`r18/scripts/r18_ux0_d_geometry.ts` -> `r18_ux0_d_geometry.json`):**
   - Baseline `indexPointAngle()` (`evaluateGameplayGesture`) without aspect scaling yields `6.37°` max error (`5:4`), `8.21°` (`4:3`), **`16.22°`** (`16:9` & `9:16` with `8/24` and `13/24` zone mismatches).
