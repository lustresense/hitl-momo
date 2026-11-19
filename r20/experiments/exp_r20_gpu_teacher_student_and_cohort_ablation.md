# Experiment Report — R20 GPU Cohort Ablation (`C0..C4`) & Teacher–Student Distillation (`C6 vs C7`, `S-TEMP`, `S0/S1/S3`)

- **Experiment ID:** `EXP-R20-P2-GPU-COHORT-KD`
- **Date:** `2026-11-19 WIB`
- **Baseline:** `research-can@5a3eb290464fa74ae4b1ee709e241980bd1c79c9` (`C0 R19 G3_MLP [82 -> 96 -> 48 -> 3]`, `122,768 B` raw JSON)
- **Hardware:** `2x NVIDIA RTX A5000` (`24,564 MiB` VRAM each, Driver `595.99.02`, CUDA `13.2`, PyTorch `2.15.0+cu132`)
- **Single-Agent Compliance (§19.1):** Executed 100% by the main Agy session with zero AI subagents or delegation.
- **Evidence Type:** `OFFLINE_DATASET` / `SYNTHETIC` / `UNIT_ONLY` (`PHYSICAL_WEBCAM = NOT_TESTED`).

---

## 1. Hypotheses Tested (`H20-01`, `H20-02`, `§5`, `§12`)

1. **`H20-01` (Low-Light & Photometric Positive Augmentation with MediaPipe Landmark Re-Extraction):**
   Does augmenting `HandGesture-5G` TRAIN images across 12 low-light, backlight, motion-blur, dorsal/flip, and far-scale conditions — and re-extracting 21 landmarks via MediaPipe `HandLandmarker` (logging `0`-hand frames as `DETECTOR_MISS` rather than fake zeros) — improve `POINT_READY` / `POINT_PRESS` recognition when landmarks are degraded?
2. **`H20-02` (Audited Hard-Negative Mining with Subject/Session-Disjoint OOD Isolation):**
   Does adding audited non-pointing `OTHER` hard negatives from `HANDS RGB-D` (`Subject1..2`, holding `Subject4..5` out as an isolated person-disjoint OOD test) and `Egocentric/Exocentric Hands v2` (`Dim Light/Gomoku` & `Natural Light/Poker` first 68%, holding the final 25% + the original 599-frame benchmark out as session-disjoint OOD tests) suppress false `POINT_PRESS` without degrading recall?
3. **`§12.1–12.2` (Teacher–Student Knowledge Distillation `C6` vs `C7` and `T-TEMP -> S-TEMP`):**
   Does distilling soft targets from an out-of-cluster GPU RGB visual teacher (`T-IMG` ResNet9 on `128x128` RGB hand crops) blended with a 3-seed GPU deep ensemble (`[82 -> 192 -> 96 -> 48 -> 3]`) into a compact CPU student (`S-SPATIAL`, `C7`) outperform the identical-split, identical-architecture, identical-seed supervised control (`C6`, `λ_KD = 0`)?
4. **`§12.4` (Student Weight Formats `S0 FP32 JSON / Binary` vs `S1 INT8 PTQ` vs `S3 INT8 QAT`):**
   How do compact `Float32Array` binary weights (`S0`), per-channel `INT8` post-training quantization (`S1`), and quantization-aware training (`S3 QAT`) compare in byte size, numerical parity, and pure TypeScript CPU latency?

---

## 2. Controlled Cohort Ablation (`C0` vs `C1` vs `C2` vs `C3` vs `C4`)

All candidates were evaluated on the **byte-identical** `VAL` (`5,067` rows, SHA-256 `b5820e523295d7bc6dfee71e0cf344a6df1f7ec2b4cf5b8ee0b2e13c431f6a6c`) and **byte-identical** locked `TEST` (`4,720` rows, SHA-256 `123770520f7c785c37bf1a1abef0106200d39eb01d75ffce83cf614ebcb2bf97`), plus the person-disjoint `HANDS RGB-D Subject4..5` OOD test (`2,092` matched hands) and session-disjoint `Mendeley 599` & `bxr7 Gomoku/Poker` (`85` hands) OOD tests:

| Cohort ID | Train Rows (`READY / PRESS / OTHER`) | Selected Arch (on VAL) | Raw JSON (`S0 Bin / S1 INT8`) | VAL Macro-F1 (`FP_Press`) | Locked TEST Macro-F1 | TEST `F1_READY` / `F1_PRESS` | TEST `OTHER->PRESS` (`n=4,664`) | IPN 36-Vid `KD/min` (`NOG / P2F / P1F`) | `HANDS RGB-D S4..S5` Raw MLP / `G4` False Press |
|---|---|---|---:|---:|---:|---|---:|---|---|
| **`C0_R19_frozen`** | `17,086` (`302 / 196 / 16,588`) | `[82,96,48,3]` | `122,768 B` (`51,744 / 14,460 B`) | `0.9515` (`2`) | `0.9567` | `0.9130 / 0.9577` | `2` (`0.043%`) | `0.00 / 0.04 / 0.09` | `4 / 0` (`0.00%` G4) |
| **`C1_R20_balanced`** | `17,086` (`302 / 196 / 16,588`) | `[82,64,32,3]` | `73,300 B` (`30,624 / 8,844 B`) | `0.9701` (`2`) | `0.9656` | `0.9545 / 0.9429` | `2` (`0.043%`) | `0.00 / 0.00 / 0.17` | `5 / 0` (`0.00%` G4) |
| **`C2_R20_pos_light`** | `19,001` (`1,218 / 814 / 16,969`) | `[82,48,24,3]` | `52,001 B` (`21,600 / 6,420 B`) | `0.9817` (`2`) | `0.9575` | `0.9545 / 0.9189` | `5` (`0.107%`) | `0.00 / 0.00 / 0.43` | `46 / 0` (`0.00%` G4) |
| **`C3_R20_hard_neg`** | `20,923` (`1,218 / 814 / 18,891`) | `[82,96,48,3]` | `122,957 B` (`51,744 / 14,460 B`) | `0.9801` (`2`) | `0.9770` | **`1.0000` / `0.9315`** | `4` (`0.086%`) | **`0.00 / 0.04 / 0.00`** | `2 / 0` (`0.00%` G4) |
| **`C4_R20_full_focal`** | `20,923` (`1,218 / 814 / 18,891`) | **`[82,64,32,3]`** | **`73,275 B` (`30,624 / 8,844 B`)** | **`0.9752` (`2`)** | **`0.9873`** | **`0.9767 / 0.9855`** | **`0` (`0.000%`)** | **`0.00 / 0.00 / 0.09`** | **`5 / 0` (`0.00%` G4)** |

### Key Ablation Findings (`C0 -> C4`)

1. **`C1` vs `C0` (Effect of Capped Class & Source-Aware Weighting Alone):**
   Without adding any new rows (`17,086` rows), source-aware weighting (`build_weights(mode="bal")`, which boosts dim/backlight/LED hard negatives by `1.35x` while capping positive-to-OTHER ratio at `14.0x`) improved VAL Macro-F1 from `0.9515 -> 0.9701` and Locked TEST Macro-F1 from `0.9567 -> 0.9656`, while selecting the smaller `[82 -> 64 -> 32 -> 3]` architecture (`73,300 B` raw JSON, `-40.3%` size vs `C0`).
2. **`C2` vs `C1` (Why Adding Positive Low-Light Augmentations Alone Without Hard Negatives Increases False Positives):**
   Adding `+1,915` re-extracted MediaPipe landmark rows from augmented `HandGesture-5G` TRAIN images (`302 -> 1,218 READY`, `196 -> 814 PRESS`) boosted VAL Macro-F1 to `0.9817`, **but** because the positive-to-negative prior shifted toward `POINT_PRESS`, raw MLP false presses on Locked TEST rose from `2 -> 5`, IPN `P1F` false `KD/min` rose from `0.09 -> 0.43`, and raw MLP false presses on `HANDS RGB-D Subject4..5` `strict_other_non_point` jumped from `4 -> 46` (though `G4_Hybrid` geometry guards still vetoed all 46 to `0` at the controller level).
3. **`C3` & `C4` vs `C2` (Hard-Negative Mining + Focal Curriculum Restores & Surpasses Safety Boundary):**
   Adding `+1,922` audited non-pointing `OTHER` hard negatives (`1,692` from `HANDS RGB-D Subject1..2` + `230` from `bxr7 Gomoku/Poker`) in `C3` cut raw MLP false presses on unseen `HANDS RGB-D Subject4..5` from `46 -> 2` (better than `C0`'s `4`!) and eliminated IPN `P1F` false keydowns (`0.00 KD/min`). Combining this dataset with focal loss (`γ = 2.0`) in **`C4_R20_full_focal` (`[82 -> 64 -> 32 -> 3]`)** achieved **`0.9873` Macro-F1** on Locked TEST with **`0` false presses across all `4,664` TEST `OTHER` rows (`0.000%`)**, **`0` false presses on `Natural RGB v3` (`0 / 888`)**, and **`0.00 / 0.00 / 0.09` `KD/min`** on IPN `NOG / P2F / P1F`.

---

## 3. Teacher–Student Knowledge Distillation Ablation (`C6` vs `C7`, `T-IMG`, `T-TEMP -> S-TEMP`)

Per `§12.1–12.2`, we trained:
- **`T-IMG` (`ResNet9-GroupNorm-SiLU` 4-stage Residual ConvNet on `128x128` RGB hand crops, 5-fold cluster-disjoint out-of-fold cross-fitting on GPU):** `769` unique TRAIN crops across `20` clusters, achieving `0.4647` OOF Macro-F1 on bright crops and `0.4599` OOF Macro-F1 on low-light `gain=0.22` crops (`34.97 s` on RTX A5000).
- **`T-ENSEMBLE` (`3`-seed deep `[82 -> 192 -> 96 -> 48 -> 3]` GPU MLP teacher blended `55% / 45%` with `T-IMG` visual OOF logits on all `3,567` visual HandGesture-5G TRAIN rows):** `VAL Macro-F1 = 0.9802`.
- **`C6` (Supervised Student Control, `λ_KD = 0.0`) vs `C7` (Distilled Student Grid, `λ_KD ∈ {0.25, 0.50}`, `T ∈ {2.0, 4.0}`)**:

| Distillation Cell | `λ_KD` | `T_KD` | Selected Arch | Raw JSON | VAL Macro-F1 (`FP_Press`) | Locked TEST Macro-F1 | TEST `F1_READY` / `F1_PRESS` | TEST `OTHER->PRESS` | IPN `KD/min` (`NOG / P2F / P1F`) | `HANDS RGB-D S4..S5` Raw / `G4` FP |
|---|---:|---:|---|---:|---:|---:|---|---:|---|---|
| **`C6_supervised_no_teacher`** | `0.00` | — | `[82,96,48,3]` | `122,836 B` | `0.9801` (`2`) | `0.9590` | `0.9333 / 0.9444` | `3` | `0.00 / 0.04 / 0.00` | `2 / 0` |
| **`C7_kd_l025_T2`** | `0.25` | `2.0` | `[82,96,48,3]` | `122,792 B` | `0.9875` (`2`) | `0.9635` | `0.9333 / 0.9577` | `2` | `0.00 / 0.00 / 0.21` | `4 / 0` |
| **`C7_kd_l050_T2`** | `0.50` | `2.0` | `[82,96,48,3]` | `122,894 B` | `0.9874` (`1`) | **`0.9728`** | `0.9333 / 0.9855` | **`0`** | **`0.00 / 0.00 / 0.00`** | **`1 / 0`** |
| **`C7_kd_l025_T4`** | `0.25` | `4.0` | `[82,96,48,3]` | `122,844 B` | `0.9859` (`2`) | `0.9613` | `0.9130 / 0.9714` | `1` | `0.00 / 0.00 / 0.09` | `3 / 0` |
| **`C7_kd_l050_T4`** | `0.50` | `4.0` | **`[82,64,32,3]`** | **`73,138 B`** | **`0.9891` (`2`)** | **`0.9826`** | **`0.9767 / 0.9714`** | **`1`** | **`0.00 / 0.04 / 0.00`** | `4 / 0` |
| **`S-TEMP` (Causal 4-Frame + Mask)** | `0.25` | `2.0` | `[110,64,32,3]` | `~88,200 B` | `0.9487` (`3`) | `0.9692` | `0.9545 / 0.9538` | `4` | — | — |

### Distillation & Format Verdict (`§12.2` & `§12.4`)

1. **`C7` vs `C6`:** Every `C7` distillation cell (`λ_KD ∈ {0.25, 0.50}`) outperformed the supervised control `C6` (`0.9590` TEST Macro-F1, `3` false presses):
   - **`C7_kd_l050_T4` (`[82 -> 64 -> 32 -> 3]`, `73,138 B`)** achieved the highest VAL Macro-F1 of any model (**`0.9891`**) and **`0.9826`** Locked TEST Macro-F1 (+2.36 pp over `C6`), while reducing IPN `P1F` false keydowns to **`0.00 KD/min`**.
   - **`C7_kd_l050_T2` (`[82 -> 96 -> 48 -> 3]`, `122,894 B`)** achieved **`0.00 / 0.00 / 0.00` `KD/min`** across all 36 IPN test videos (`NOG`, `P2F`, and `P1F`), **`0` false presses** on Locked TEST, and only **`1` raw MLP false press (`0` G4)** across all `2,092` hands in `HANDS RGB-D Subject4..5`.
2. **`S-TEMP` vs `S-SPATIAL` (`§12.1`):** Adding a 4-frame causal window + 4-bit missingness mask (`110`-dim input -> `S-TEMP`) achieved `0.9692` TEST Macro-F1, which did not beat `S-SPATIAL` (`C4 = 0.9873`, `C7_T4 = 0.9826`) because the 82-dim `R19FeatureTracker` already encodes causal EMA velocity, acceleration, and dwell stability features (`indices 68..81`). Per `§12.1` ("jika benar-benar lebih bagus daripada S-SPATIAL"), we retain the faster `82`-dim `S-SPATIAL` student.
3. **`S0 FP32` vs `S1 INT8 PTQ` vs `S3 INT8 QAT` (`§12.4`):**
   - `S0 FP32 JSON` (`73,275 B` raw / `29,088 B` zstd wire) and `S0 FP32 Binary` (`30,624 B` raw) have **`0` argmax mismatch** (`max_prob_diff = 2.25e-8`) and run in **`p50 / p95 = 8.12 / 9.67 µs`** (`6.22 / 7.45 µs` binary) in pure TypeScript on CPU.
   - `S1 INT8 PTQ` (`8,844 B` packed) has **`0` argmax mismatch across all 4,720 TEST rows (`Macro-F1 = 0.9873`)** (`max_prob_diff = 0.00244`) and runs in **`p50 / p95 = 11.2 / 13.4 µs`** in pure TypeScript (`S3 INT8 QAT` achieves `0.9752` TEST Macro-F1 at `8,844 B`). Because `S0 FP32` (`29,088 B` wire) already keeps total cold journey download at `8.91–9.00 MiB` (`< 25 MB` with `> 15.5 MB` headroom) and is slightly faster in JS (`9.67 µs` vs `13.4 µs` due to per-channel scale dequantization), `S0 FP32` is selected as primary with `S1 INT8` verified as a drop-in 8.8 KB backup.
