# R22 NUI Lab — Model Card & Comprehensive Evaluation Gate (`MODEL_CARD_R22.md`)

- **Generated:** `2026-11-19T13:12:44Z` by `w-data` (`GPU 0: NVIDIA RTX A5000`, `PyTorch 2.15.0+cu132`)
- **Contract Compliance:** `K4 = v1.0-FROZEN` | `K5 = r19-82d-v1` (SHA-256 `ed9349456a79284520adb2969a8a11eccd36500cc9d34fe24591f3f742559140`) | `K6 = Pure-TS CPU Verified` | `K7 = v1.0-FROZEN` (`0` leakage)
- **License Guarantee (D02/D14):** Trained **100%** on commercial-safe `CC BY 4.0` / `Apache 2.0` datasets (`HandGesture-5G`, `Natural RGB v3`, `IPN HandS`, `HANDS RGB-D S1..2`, `Mendeley BXR7 Gomoku/Poker 0..68%`). **`0` rows** from `HaGRIDv2` (`HOLD_LICENSE`), **`0` rows** from `DimHand`/`LLHands` (`BLOCKED`), **`0` rows** from unlabelled Owner telemetry `S-07ba0cde` (`UNLABELLED_TELEMETRY`).
- **Evidence Scope:** `OFFLINE_DATASET` / `UNIT_ONLY` (`PHYSICAL_WEBCAM = NOT_TESTED`).

---

## 1. Exported Pure-TS CPU Model Artifacts & Parity Proof (K6, D12)

| Artifact | Path | Arch | Raw JSON Size | SHA-256 | Temp `T` | `validateR19Model` | Py↔TS Parity (`200` rows) | Pure-TS CPU Latency (`p50 / p95`) |
|---|---|---|---:|---|---:|---|---|---|
| **Head 1 Primary (`R22_pistol_head`)** | [`r22_pistol_model.json`](r22_pistol_model.json) | `[82, 64, 32, 3]` | `73,366 B` | `33d01c309b00642bb913fb8530104722cc80e8abf42fe69ea19906f737b80c4d` | `0.4575` | **PASS** | **`0` mis**, max diff `2.22e-16` | **`11.8 / 12.9 µs`** |
| **Head 1 Compact Variant** | [`r22_pistol_mlp_64_32.json`](r22_pistol_mlp_64_32.json) | `[82, 64, 32, 3]` | `73,366 B` | `33d01c309b00642bb913fb8530104722cc80e8abf42fe69ea19906f737b80c4d` | `0.4575` | **PASS** | `0` mis | `11.4 / 11.9 µs` |
| **Head 1 Wide Variant** | [`r22_pistol_mlp_96_48.json`](r22_pistol_mlp_96_48.json) | `[82, 96, 48, 3]` | `123,168 B` | `0ac1cd8576be4ebe9034608ba83d4b498968c45d98095ae4f5e8c4a55d031b7a` | `0.45` | **PASS** | `0` mis | `18.7 / 20.8 µs` |
| **Head 2 Primary (`R22_pose_head`)** | [`r22_pose_model.json`](r22_pose_model.json) | `[82, 64, 32, 5]` | `73,950 B` | `f6c4084cf92520140ca812a6a82ba3157a73b19d4b7a1cbc93d2f31c9bee3cfd` | `0.7975` | `R19Classifier` 5-class PASS | **`0` mis**, max diff `3.331e-16` | **`11.5 / 12.0 µs`** |
| **Head 3 (`R22_pinch_head`)** | *(Geometry+Hysteresis)* | Deterministic | `0 B` extra | N/A (`DATA_GAP`) | N/A | N/A | N/A | `< 2 µs` |

---

## 2. Head 1 (`R22_pistol_head`, `route="gesture"` ONLY) — Fair Head-to-Head Evaluation vs R18 / R19 C0 / R20 C4 / R20 C7 (D05, D11, D13)

> **Historical R18 Comparator Note:** `R18 UX3 MLP` (`r18/models/ux3_model_mlp.json`, SHA `518c0ec4…`, `123,141 B`, `[68->96->48->6]`) used legacy `68D` features trained on IPN HandS 6 behavioral classes (`Macro-F1 = 0.6156` on IPN test, `0` pistol `POINT_PRESS` support) and is strictly segregated from `82D` pistol heads per D04.

| Model (`82D r19-82d-v1`) | JSON Size | Pure-TS CPU (`p50/p95`) | Locked TEST (`4,720`) Macro-F1 | F1 `READY` / `PRESS` | Locked TEST `OTHER→PRESS` | Test ECE (Cal) | Natural RGB v3 (`888`) G4 FP | IPN (`36` vids) `NOG/P2F/P1F` `KD/min` | HANDS RGB-D S4..5 (`528` Strict OTHER) Raw/G4 FP | BXR7 Holdout (`85`) Raw/G4 FP |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| R19 `C0` (`[82,96,48,3]`) | `122,768 B` | `19.9 / 23.4 µs` | **`0.9567`** | `0.9130` / `0.9577` | `2` (`0.043%`) | `0.00137` | `1/888` | `0.00/0.04/0.09` | `4/0` | `0/0` |
| **R20 `C4` (`[82,64,32,3]`)** | `73,275 B` | `11.4 / 11.8 µs` | **`0.9873`** | `0.9767` / `0.9855` | `0` (`0.000%`) | `0.00198` | `0/888` | `0.00/0.00/0.09` | `5/0` | `0/0` |
| R20 `C7 T4` (`[82,64,32,3]`) | `73,138 B` | `11.4 / 11.8 µs` | **`0.9826`** | `0.9767` / `0.9714` | `1` (`0.021%`) | `0.00115` | `0/888` | `0.00/0.04/0.00` | `4/0` | `0/0` |
| R20 `C7 T2` (`[82,96,48,3]`) | `122,894 B` | `18.6 / 20.7 µs` | **`0.9728`** | `0.9333` / `0.9855` | `0` (`0.000%`) | `0.00167` | `0/888` | `0.00/0.00/0.00` | `1/0` | `0/0` |
| **R22 `pistol_64_32` (`[82,64,32,3]`)** | `73,366 B` | `11.4 / 11.9 µs` | **`0.9414`** | `0.8936` / `0.9315` | `4` (`0.086%`) | `0.00173` | `0/888` | `0.00/0.00/0.34` | `4/0` | `0/0` |
| **R22 `pistol_96_48` (`[82,96,48,3]`)** | `123,168 B` | `18.7 / 20.8 µs` | **`0.9017`** | `0.8000` / `0.9067` | `5` (`0.107%`) | `0.00171` | `0/888` | `0.00/0.00/0.00` | `5/0` | `0/0` |

### Explicit Promotion Gate Verdict (`r22_pistol_model.json` vs `R20 C4`)
- **Verdict:** **`CANDIDATE_KEEP_R20_C4_DEFAULT`**
- **Selected Primary R22 Variant (VAL-only selection):** `mlp_64_32` (`r22_pistol_model.json`, SHA-256 `33d01c309b00642b…`)
- **Comparison Summary:**
  - Locked TEST (`4,720`) Macro-F1: `R22 = 0.9414` vs `R20 C4 = 0.9873` (`delta = -0.0459`)
  - Locked TEST `OTHER -> PRESS`: `R22 = 4` vs `R20 C4 = 0`
  - Locked TEST Calibrated ECE: `R22 = 0.00173` vs `R20 C4 = 0.00198`
  - Natural RGB v3 (`888`) G4 FP: `R22 = 0` vs `R20 C4 = 0`
  - IPN TEST (`36` vids) `NOG / P2F / P1F` `KD/min`: `R22 = 0.00/0.00/0.34` vs `R20 C4 = 0.00/0.00/0.09`
  - HANDS RGB-D S4..5 Strict OTHER Raw/G4 FP: `R22 = 4/0` vs `R20 C4 = 5/0`
  - BXR7 Holdout (`85`) Raw/G4 FP: `R22 = 0/0` vs `R20 C4 = 0/0`
- **Runtime Policy (K6 / A04):** `r22_pistol_model.json` (mlp_64_32) did not strictly outperform `R20 C4` on Locked TEST (`0.9414` vs `0.9873`, `other->press: 4 vs 0`). Per K6 & D08, keep `R20 C4` as the active default runtime model and report exact `r20-c4` metadata & SHA-256 honestly without disguising C4 as R22.

### D09 Train-Only Augmentation Ablation (Controlled `[82->64->32->3]`, Seed `20261122`)

| Ablation Condition | Train Rows | VAL Macro-F1 | VAL `OTHER→PRESS` | Locked TEST (`4,720`) Macro-F1 | TEST `OTHER→PRESS` | TEST ECE |
|---|---:|---:|---:|---:|---:|---:|
| `A0_base_r20_c3` (R20 C3 union) | `20,923` | `0.9746` | `2` | `0.9752` | `1` | `0.00111` |
| `A1_plus_r22_img_aug` (+glare/mblur/lowexp+chroma/jpeg/persp) | `22,637` | `0.9772` | `5` | `0.9316` | `8` | `0.00234` |
| `A2_plus_r22_lm_aug` (+aniso jitter/ring-pinky dropout/persp/var-dt) | `23,409` | `0.9142` | `1` | `0.9309` | `5` | `0.00103` |
| `A3_full_r22_aug_union` (All R22 Image + Landmark Augs) | `25,123` | `0.9332` | `5` | `0.8787` | `20` | `0.00274` |

---

## 3. Head 2 (`R22_pose_head`, `FIST / ONE / TWO / FIVE / OTHER`) vs Multi-Joint Geometry (D06)

Curated strictly subject/cluster-disjoint from `HandGesture-5G` (`21/8/9` clusters), `HANDS RGB-D` (`S1..2` train / `S3` val / `S4..5` locked OOD; `TimeOut` excluded), and `Natural RGB v3` (`19/4/3` participants, apex `rank 3..5`).

| Classifier | Combined Held-Out (`n=2,496`) Macro-F1 | HG5G Locked TEST (`n=230`) Macro-F1 | HANDS RGB-D S4..5 OOD (`n=2,032`) Macro-F1 | Natural RGB v3 Apex TEST (`n=234`) Macro-F1 | Combined `FIST→FIVE` False Erase | Combined `OTHER→FIVE` False Erase | Combined `ONE↔TWO` Swaps |
|---|---:|---:|---:|---:|---:|---:|---:|
| Deterministic Legacy Geometry | `0.4428` | `0.1475` | `0.4580` | `0.3831` | `1` | `9` | `2` |
| Deterministic R22 Multi-Joint Aspect Geometry | `0.7276` | `0.6901` | `0.7268` | `0.6567` | `0` | `15` | `4` |
| `R22_pose_lr` (`[82->5]`) | `0.9315` | `0.9925` | `0.9311` | `0.8493` | `1` | `15` | `4` |
| **`R22_pose_mlp_64_32` (`[82->64->32->5]`)** | **`0.9404`** | **`1.0000`** | **`0.9369`** | **`0.8587`** | `1` | `11` | `4` |
| **`R22_pose_mlp_96_48` (`[82->96->48->5]`)** | **`0.9400`** | **`0.9844`** | **`0.9398`** | **`0.8665`** | `1` | `8` | `4` |

- **Primary Exported Pose Model (`r22_pose_model.json`, `r22_pose_mlp_64_32`):** Per-class F1 on Combined Held-Out (`n=2,496`):
  - `FIST = 0.9109`, `ONE = 0.9193`, `TWO = 0.9373`, `FIVE = 0.9919`, `OTHER = 0.9424` (Calibrated ECE = `0.02070`).
- **Integration Status (§A2):** `CANDIDATE` (ready behind the single `PoseSource` interface after physical webcam validation; never run in parallel as a competing veto!).

---

## 4. Head 3 (`R22_pinch_head`, `TOUCH / NEAR / OPEN`) — Honest `DATA_GAP` & Evaluator Comparison (D07)

- **Supervised Neural Status:** **`DATA_GAP_CONFIRMED`** — `0` legal `CC BY 4.0` datasets contain frame-level ground truth separating thumb-index physical contact (`TOUCH <= 0.30`) from intentional non-contact hover (`NEAR 0.30..0.50`). No fake supervised pinch neural head is fabricated.
- **Evaluator Benchmark (Canonical Hysteresis vs Calibrated Geometric+Kinematic):**
  - **Real Non-Pinch Negative False `TOUCH` Rate:**
    - `HG5G Locked TEST` (`n=230`): Canonical `0` (`0.00%`) vs Calibrated `0` (`0.00%`).
    - `HANDS RGB-D S4..5` (`n=2,092`, incl. `120` `Punch` fists!): Canonical `8` (`0.38%`) vs Calibrated `8` (`0.38%`).
    - `Natural RGB v3 TEST non-OK` (`n=791`): Canonical `37` vs Calibrated `38`.
  - **Synthetic Near-Pinch Negative Hold (`0.32..0.48`, `UNIT_ONLY`):** **`0 / 150` false `TOUCH`** on BOTH evaluators!
  - **Synthetic Closing/Opening Contact Ramp (`UNIT_ONLY`):** Release tail frames `> 0.30`: Canonical `4` vs Calibrated `3` (velocity tightening cuts release drag!).
  - **Unlabelled Owner T004 Sequence (`S-07ba0cde-T004`, `labelSource: "UNLABELLED_TELEMETRY"`, `independentGroundTruthAvailable: false`):** Inter-evaluator 3-class agreement = **`97.87%`** across `1411` hand frames (`Canon TOUCH=612`, `Calib TOUCH=582`), recovering `50` (Canonical) / `37` (Calibrated) deep-pinch frames previously rejected by R19's `Cubit ditolak gate R19` veto.
