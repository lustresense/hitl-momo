# R20 GPU Teacher–Student Training & 8-Suite End-to-End Evaluation Report

- **Revision:** `R20-01 v0.2.0` (`2026-11-19 WIB`, single-agent execution per §19.1)
- **Machine-Readable Evidence:** [`r20_eval_all.json`](r20_eval_all.json), [`r20_cohort_training_summary.json`](r20_cohort_training_summary.json), [`r20_teacher_student_ablation.json`](r20_teacher_student_ablation.json), [`r20_hard_neg_curation_summary.json`](r20_hard_neg_curation_summary.json), [`r20_invariants_and_ownership.json`](r20_invariants_and_ownership.json)
- **Evidence Type:** `OFFLINE_DATASET` / `SYNTHETIC` / `UNIT_ONLY` (`PHYSICAL_WEBCAM = NOT_TESTED`).

---

## 1. Executive Summary of R20 GPU Training vs Frozen `C0 (R19)`

1. **Primary Compact Student Winner — `C4_R20_full_focal` ([`r20_model_c4_full_mlp.json`](../models/r20_model_c4_full_mlp.json)):**
   - **Architecture & Size:** `[82 -> 64 -> 32 -> 3]`, **`73,275 B` raw JSON** (**`-40.3%` smaller** than `C0` `122,768 B`), **`29,088 B` HTTP wire (`zstd`)** (`-38.5%` smaller than `C0` `47,288 B`), **`30,624 B` compact binary FP32 (`S0`)**, **`8,844 B` packed INT8 (`S1`)**.
   - **CPU Inference Latency (pure TypeScript):** **`p50 / p95 = 8.12 / 9.67 µs`** (`-40.0%` faster than `C0` `14.55 / 16.09 µs`); full `G4_Hybrid` pipeline **`p50 / p95 = 35.1 / 46.8 µs`**.
   - **Locked Unified Test (`n = 4,720`):** **`Macro-F1 = 0.9873`** (`+3.06 pp` over `C0 = 0.9567`), **`F1_READY = 0.9767`** (`+6.37 pp` over `C0 = 0.9130`), **`F1_PRESS = 0.9855`** (`+2.78 pp` over `C0 = 0.9577`), **`OTHER -> PRESS = 0 / 4,664` (`0.000%` false press rate; 95% Wilson CI `[0.0000, 0.0008]`)**, **`READY -> PRESS = 0 / 21` (`0.00%`)**.
   - **S1 INT8 Post-Training Quantization (`8,844 B`):** **`Macro-F1 = 0.9873`, `0` argmax mismatch across all `4,720` Locked TEST rows** vs FP32.
2. **Distilled Teacher–Student Winners — `C7_R20_distilled_l050_T4` ([`r20_model_c7_distilled_t4_mlp.json`](../models/r20_model_c7_distilled_t4_mlp.json)) & `C7_R20_distilled_l050_T2` ([`r20_model_c7_distilled_t2_mlp.json`](../models/r20_model_c7_distilled_t2_mlp.json)):**
   - Distilled from `T-IMG` (`ResNet9-GroupNorm-SiLU` 5-fold cluster-disjoint out-of-fold visual teacher on `128x128` RGB hand crops) blended with `T-ENSEMBLE` (`3`-seed `[82 -> 192 -> 96 -> 48 -> 3]` GPU teacher).
   - **`C7_l050_T4` (`[82 -> 64 -> 32 -> 3]`, `73,138 B`):** Achieves the highest VAL Macro-F1 (**`0.9891`** vs `C6` supervised control `0.9801`), **`0.9826` Locked TEST Macro-F1** (`+2.36 pp` over `C6 = 0.9590`), and **`0.00 / 0.04 / 0.00` `KD/min`** on IPN `NOG / P2F / P1F`.
   - **`C7_l050_T2` (`[82 -> 96 -> 48 -> 3]`, `122,894 B`):** Achieves **`0.00 / 0.00 / 0.00` `KD/min`** across all `36` IPN test videos (`NOG`, `P2F`, and `P1F`), **`0 / 4,664` false presses** on Locked TEST, and only **`1 / 528` raw MLP false press (`0 / 2,092` G4 Hybrid)** on person-disjoint `HANDS RGB-D Subject4..5`.

---

## 2. Comprehensive 8-Suite Evaluation Table (`eval_r20_all.ts`, `exit 0`)

| Evaluation Suite / Metric | `C0_R19_frozen` (`[82,96,48,3]`) | `C1_R20_balanced` (`[82,64,32,3]`) | `C2_R20_pos_light` (`[82,48,24,3]`) | `C3_R20_hard_neg` (`[82,96,48,3]`) | **`C4_R20_full_focal` (`[82,64,32,3]`)** | `C6_supervised` (`λ_KD=0`) | **`C7_distilled_T2` (`λ_KD=0.5, T=2`)** | **`C7_distilled_T4` (`λ_KD=0.5, T=4`)** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| **1. Raw JSON Size (`<=200 KB` gate)** | `122,768 B` | `73,300 B` | `52,001 B` | `122,957 B` | **`73,275 B`** | `122,836 B` | `122,894 B` | **`73,138 B`** |
| **1b. Python/GPU ↔ TS/CPU Parity (`160` rows)** | `0` mis | `0` mis | `0` mis | `0` mis | **`0` mis** | `0` mis | **`0` mis** | **`0` mis** |
| **1c. Pure TS CPU Latency `p50 / p95` (`µs`)** | `14.6 / 16.1` | `8.0 / 9.1` | `5.8 / 6.5` | `14.6 / 16.6` | **`8.1 / 9.7`** | `14.5 / 16.0` | `14.6 / 16.0` | **`8.1 / 9.7`** |
| **2. Locked Unified TEST Macro-F1 (`n=4,720`)** | `0.9567` | `0.9656` | `0.9575` | `0.9770` | **`0.9873`** | `0.9590` | **`0.9728`** | **`0.9826`** |
| **2b. Locked Unified TEST `OTHER->PRESS` (`n=4,664`)** | `2` (`0.043%`) | `2` (`0.043%`) | `5` (`0.107%`) | `4` (`0.086%`) | **`0` (`0.000%`)** | `3` (`0.064%`) | **`0` (`0.000%`)** | `1` (`0.021%`) |
| **2c. HandGesture-5G TEST Raw / `G4` Macro-F1 (`n=230`)** | `0.9942 / 0.9449` | `0.9883 / 0.9449` | `0.9942 / 0.9449` | `0.9942 / 0.9449` | **`0.9942 / 0.9449`** | `0.9942 / 0.9449` | **`0.9942 / 0.9449`** | **`0.9942 / 0.9449`** |
| **2d. HG5G TEST Dorsal Slice `G4` Acc (`n=17`)** | `100.00%` | `100.00%` | `100.00%` | `100.00%` | **`100.00%`** | `100.00%` | **`100.00%`** | **`100.00%`** |
| **3. Natural RGB v3 TEST `G4` False Press (`n=888` hands, 6 lighting strata)** | `1` (`0.11%`, `0%` FSM) | **`0` (`0.00%`, `0%` FSM)** | **`0` (`0.00%`, `0%` FSM)** | **`0` (`0.00%`, `0%` FSM)** | **`0` (`0.00%`, `0%` FSM)** | **`0` (`0.00%`, `0%` FSM)** | **`0` (`0.00%`, `0%` FSM)** | **`0` (`0.00%`, `0%` FSM)** |
| **3b. Natural RGB v3 `point_left/right` Ambiguous Holdout `G4` Press (`n=246`)** | `0.81%` | `0.81%` | `0.81%` | `0.81%` | **`0.81%`** | `0.81%` | **`0.81%`** | **`0.81%`** |
| **4. IPN HandS TEST (`36` vids) `NOG` `KD/min`** | `0.00` | `0.00` | `0.00` | `0.00` | **`0.00`** | `0.00` | **`0.00`** | **`0.00`** |
| **4b. IPN HandS TEST (`36` vids) `P2F` `KD/min`** | `0.04` (`1` KD) | **`0.00` (`0` KD)** | **`0.00` (`0` KD)** | `0.04` (`1` KD) | **`0.00` (`0` KD)** | `0.04` (`1` KD) | **`0.00` (`0` KD)** | `0.04` (`1` KD) |
| **4c. IPN HandS TEST (`36` vids) `P1F` Casual 1F `KD/min`** | `0.09` (`2` KD) | `0.17` (`4` KD) | `0.43` (`10` KD) | **`0.00` (`0` KD)** | `0.09` (`2` KD) | **`0.00` (`0` KD)** | **`0.00` (`0` KD)** | **`0.00` (`0` KD)** |
| **4d. IPN HandS TEST Stuck Keys After No-Hand** | `0` | `0` | `0` | `0` | **`0`** | `0` | **`0`** | **`0`** |
| **5. Mendeley `bxr7` 599-Frame Session-Disjoint (`n=1,133` hands) Raw / `G4` FP** | `4 / 3` (`0.26%`) | `4 / 3` (`0.26%`) | `19 / 3` (`0.26%`) | `3 / 3` (`0.26%`) | **`3 / 3` (`0.26%`)** | `3 / 3` (`0.26%`) | **`3 / 3` (`0.26%`)** | **`3 / 3` (`0.26%`)** |
| **6. New `bxr7 Gomoku/Poker` Session-Disjoint Holdout (`n=85` hands) Raw / `G4` FP** | `0 / 0` (`0.00%`) | `0 / 0` (`0.00%`) | `1 / 0` (`0.00%`) | `0 / 0` (`0.00%`) | **`0 / 0` (`0.00%`)** | `0 / 0` (`0.00%`) | **`0 / 0` (`0.00%`)** | **`0 / 0` (`0.00%`)** |
| **7. Person-Disjoint `HANDS RGB-D S4..S5` `Horiz_*` (`n=965`) Raw / `G4` FP** | `0 / 0` (`0.00%`) | `0 / 0` (`0.00%`) | `0 / 0` (`0.00%`) | `0 / 0` (`0.00%`) | **`0 / 0` (`0.00%`)** | `0 / 0` (`0.00%`) | **`0 / 0` (`0.00%`)** | **`0 / 0` (`0.00%`)** |
| **7b. Person-Disjoint `HANDS RGB-D S4..S5` `Strict_OTHER` (`n=528`) Raw / `G4` FP** | `4 / 0` (`0.00%` G4) | `5 / 0` (`0.00%` G4) | `46 / 0` (`0.00%` G4) | **`2 / 0` (`0.00%` G4)** | **`5 / 0` (`0.00%` G4)** | `2 / 0` (`0.00%` G4) | **`1 / 0` (`0.00%` G4)** | `4 / 0` (`0.00%` G4) |
| **7c. Person-Disjoint `HANDS RGB-D S4..S5` Tiny `One_VFR` (`n=50`) `POINT_READY` Recall** | `100.00%` | `100.00%` | `100.00%` | `100.00%` | **`100.00%`** | `100.00%` | **`100.00%`** | **`100.00%`** |
| **8. `N0/N1` Pistol Distractors (`n=17`) `G4` FP & `JumpAssist` 50 Hz Continuity (`75/60/30/15 Hz`)** | `0%` / `100%` | `0%` / `100%` | `0%` / `100%` | `0%` / `100%` | **`0%` / `100%`** | `0%` / `100%` | **`0%` / `100%`** | **`0%` / `100%`** |

---

## 3. Feature Invariance & Multi-Hand Ownership / Bystander Anti-Distraction Verification (`test_r20_invariants_and_ownership.ts`, `exit 0`)

- **Scale & Aspect Invariance (`82/82` features across `scale ∈ {0.11, 0.22, 0.45, 0.75}` and `aspect ∈ {4:3, 16:9, 1:1}`):**
  `maxScaleDiff = 0`, `maxAspectDiff = 1.577e-14` (`PASS`).
- **Scenario O1 (Larger Bystander Enters Doing `POINT_PRESS` While Owner Hand is Locked):**
  `bystanderStoleLock = false`, `bystanderTriggeredPress = false` (`PASS`).
- **Scenario O2 (Owner Hand Exits While Holding `POINT_PRESS`, Bystander Hand Remains in Frame):**
  `bystanderImmediateJumpTakeover = false` (`FullFrameHandLock` rejects `0.38 > MAX_JUMP = 0.18` jump), `stuckKeysAfterOwnerExit = false` (`PASS`).
- **Scenario O3 (Face-Anchor Disambiguation `pickPrimaryHand`):**
  `faceAnchorPickedOwner = true` (`PASS`).
