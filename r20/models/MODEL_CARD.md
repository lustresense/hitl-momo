# R20 Gesture Classifier Model Card (`C4_Full_Focal` & `C7_Distilled` Students)

- **Revision:** `R20-01 v0.2.0` (`2026-11-19 WIB`, single-agent execution per §19.1, zero subagents)
- **Baseline:** `research-can@5a3eb290464fa74ae4b1ee709e241980bd1c79c9` (`R19 G3_MLP [82 -> 96 -> 48 -> 3]`, `122,768 B` raw JSON / `47,288 B` wire)
- **Product Read-Only Reference:** `main@8969502df4e106d8428055c2ca6f80f4f59250ee` (`0.26.0-alpha`, untouched)
- **Training Hardware:** `2x NVIDIA RTX A5000` (`24,564 MiB` VRAM each, Driver `595.99.02`, CUDA `13.2`, PyTorch `2.15.0+cu132`)
- **User Runtime Target:** **100% CPU-Only (`G20-A`)** — pure TypeScript/CPU student inference (`p95 = 9.67 µs`), MediaPipe HandLandmarker CPU inside dedicated Web Worker (`delegate: "CPU"`), FaceDetector CPU (`delegate: "CPU"`), zero GPU inference delegate, zero teacher models shipped to browser.

---

## 1. Published Model Artifacts (`r20/models/`)

| Model ID / File | Role | Architecture | Temp `T` | Raw JSON Bytes | HTTP Wire (`zstd`) | `S0` FP32 Binary | `S1/S3` INT8 Packed | SHA-256 |
|---|---|---|---:|---:|---:|---:|---:|---|
| [`r20_model_c4_full_mlp.json`](r20_model_c4_full_mlp.json) | **Primary R20 Student Winner (`C4_Full_Focal`)** | `[82 -> 64 -> 32 -> 3]` | `0.6225` | **`73,275 B`** (`-40.3%` vs R19) | **`29,088 B`** (`-38.5%` vs R19) | `30,624 B` | `8,844 B` (`0` mismatch vs FP32) | `be7207ee9610b0fb0bc1c6fd56bd3cc803ee674520810a569e6ebfb91616b681` |
| [`r20_model_c7_distilled_t4_mlp.json`](r20_model_c7_distilled_t4_mlp.json) | **Teacher–Student Distilled Compact Student (`C7_l050_T4`)** | `[82 -> 64 -> 32 -> 3]` | `0.7475` | **`73,138 B`** | `~29,050 B` | `30,624 B` | `8,844 B` | `781020cb3ccff53839b83ee2c144cb4773e6a116380a0f988c0dc758df1a37ee` |
| [`r20_model_c7_distilled_t2_mlp.json`](r20_model_c7_distilled_t2_mlp.json) | **Teacher–Student Distilled Zero-IPN-FP Student (`C7_l050_T2`)** | `[82 -> 96 -> 48 -> 3]` | `0.7975` | `122,894 B` | `~47,300 B` | `51,744 B` | `14,460 B` | `dc7c152cd1bc100997cc13a2617954cb19044be1597101f4fc9a0cb313f53e25` |
| [`r20_model_c1_balanced_mlp.json`](r20_model_c1_balanced_mlp.json) | **R19 3-Dataset Capped-Balanced Control (`C1_Balanced`)** | `[82 -> 64 -> 32 -> 3]` | `2.0525` | `73,300 B` | `~29,120 B` | `30,624 B` | `8,844 B` | `ee7fa5685d407c70bb7255175d98cb1e70058fc5c4f824ff91a20e87ed374434` |
| [`r20_model_c4_full_lr.json`](r20_model_c4_full_lr.json) | **Linear Logistic Regression Comparator (`C4_LR`)** | `[82 -> 3]` | `0.3700` | `5,151 B` | `~2,150 B` | `1,328 B` | `592 B` | `ec3cf0c832f9e1d84bf6abdf7565ff25bf8ee71c804fcfe5bc9c907bf833d296` |

All published model binaries strictly obey the `<= 200,000 B` raw prototype budget (`§0.3`, `§5`, `§7`, `§14.3`) and the `<= 10 MiB` `AGENTS.md §5` limit.

---

## 2. Dataset Provenance, Licensing & Zero-Leakage Split Discipline

All training data is strictly **`CC BY 4.0`** (zero `HaGRIDv2`, zero `DimHand/LLHands/MGR-Dark`, zero unconsented PII):

1. **HandGesture-5G (`10.17632/wj25crzdbm.1`, `CC BY 4.0`):**
   - `Pointing Up -> POINT_READY`, `L-Sign -> POINT_PRESS`, `Fist / V-Sign / Open Palm_Open Hand -> OTHER`.
   - Cluster-disjoint split (`dHash <= 8` + `<= 15 s` timestamp burst Union-Find; `Pointing Up` cluster `18 <-> 19` swap identical to R19).
   - **R20 Low-Light & Photometric Augmentation (TRAIN only, `augment_hg5g.py`):** 100% of positive TRAIN images (`173 L-Sign` + `200 Pointing Up` = `373` images) + `150` stratified `OTHER` TRAIN images (`523` images total) augmented across 12 conditions (`raw`, `dim_g045`, `dim_g020`, `dim_g008`, `dim_warm_led`, `dim_cool_mon`, `backlight`, `blur_dim`, `jpeg_q25`, `flip`, `flip_dim_g020`, `scale_x048_dim`) and re-run through MediaPipe `HandLandmarker` (`IMAGE` mode) to extract real degraded 21-landmark vectors (`+1,915` valid TRAIN rows). Frames where MediaPipe returned 0 hands were logged as `DETECTOR_MISS` (`r20_lowlight_detector_ablation.json`) and never converted into fake zero features (`§12.2`).
2. **Natural RGB Hand Gestures v3 (`10.17632/n66hhk695h.3`, `CC BY 4.0`):**
   - Participant-disjoint `19 / 4 / 3` split across 6 real lighting strata (`bright_daylight`, `indoor_moderate`, `dim`, `backlit`, `green_led`, `red_led`), 11 non-pointing classes -> `OTHER`.
   - `point_left` and `point_right` remain strictly quarantined in `AMBIGUOUS_CONVERSATIONAL_POINTING` (`0` rows trained as `POINT_PRESS`).
3. **IPN HandS (`CC BY 4.0`):**
   - Person-disjoint `19 / 5 / 5` split (`36` locked test videos across `5` unseen subjects). `NOG`, `P2F`, `C2F`, `2C2`, `GRB`, `T*`, `OP2`, `Z*` -> `OTHER`. `P1F / C1F / 2C1` casual 1-finger pointing excluded from `POINT_PRESS`.
4. **HANDS RGB-D v2 (`10.17632/ndrczc35bt.2`, `CC BY 4.0`) — Strict Person-Disjoint Partition (`§3` line 65):**
   - `Subject1, Subject2`: `+1,692` audited non-pointing `OTHER` hard negatives (`Horiz_H*` 5-finger flat horizontal palms + `Punch/Five/TimeOut/Span/Two/Six/Seven/Eight`) promoted to `C3 / C4 / C6 / C7` TRAIN (`One_VFL/One_VFR` vertical 1-finger pointing quarantined from `OTHER` training).
   - `Subject3`: `221` rows held out for VAL.
   - `Subject4, Subject5`: **`1,080` frames (`2,092` GT-matched hands) strictly isolated as Person-Disjoint Locked OOD TEST (`HANDS_RGBD_OOD_TEST_S4_S5`)** — 0 overlap with `Subject1..3`.
5. **Egocentric/Exocentric Hands v2 (`10.17632/bxr7kx84y6.2`, `CC BY 4.0`) — Strict Session-Disjoint Partition (`§3` line 65):**
   - Locked 599-frame R18/R19 benchmark (`Dim Light/{Chinese Chess, Dice, Meeting Chess}` + `Natural Light/{Aeroplane Chess, Checkers, Dice}`) kept **100% untouched**.
   - Previously unused sessions `Dim Light/Gomoku` (`331` frames) and `Natural Light/Poker` (`555` frames) audited with MediaPipe + geometric pointing-quarantine filter: first 68% (`+230` rows) promoted to `C3 / C4 / C6 / C7` TRAIN; final 25% after a >20-frame buffer gap (`85` hands) isolated as **`BXR7_OOD_TEST_GOMOKU_POKER`**.
6. **Byte-for-Byte Zero-Leakage Proof:** `cmp` and SHA-256 verification confirm `r20_feat_val.f32` (`5,067` rows, SHA-256 `b5820e523295d7bc6dfee71e0cf344a6df1f7ec2b4cf5b8ee0b2e13c431f6a6c`) and `r20_feat_test.f32` (`4,720` rows, SHA-256 `123770520f7c785c37bf1a1abef0106200d39eb01d75ffce83cf614ebcb2bf97`) are **100% byte-identical** across `C0`, `C1`, `C2`, `C3`, `C4`, `C6`, and `C7`.

---

## 3. Quantitative Performance & Python/GPU ↔ TypeScript/CPU Parity (`OFFLINE_DATASET`)

| Candidate | Arch | Raw JSON | TS Parity (`160` rows) | TS CPU `p50 / p95` | VAL Macro-F1 (`n=5,067`) | Locked TEST Macro-F1 (`n=4,720`) | TEST `F1_READY` (`n=21`) | TEST `F1_PRESS` (`n=35`) | TEST `OTHER->PRESS` (`n=4,664`) | IPN Test `KD/min` (`NOG / P2F / P1F`) | `HANDS RGB-D S4..S5` OOD `G4` False Press (`n=2,092`) |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---|---:|
| **`C0_R19_frozen`** | `[82,96,48,3]` | `122,768 B` | `0` mis (`1.2e-7`) | `14.55 / 16.09 µs` | `0.9515` | `0.9567` | `0.9130` | `0.9577` | `2` (`0.043%`) | `0.00 / 0.04 / 0.09` | `0 / 2,092` (`0.00%`, raw MLP `4`) |
| **`C1_R20_balanced`** | `[82,64,32,3]` | `73,300 B` | `0` mis (`1.1e-7`) | `8.04 / 9.12 µs` | `0.9701` | `0.9656` | `0.9545` | `0.9429` | `2` (`0.043%`) | `0.00 / 0.00 / 0.17` | `0 / 2,092` (`0.00%`, raw MLP `5`) |
| **`C2_R20_pos_light`** | `[82,48,24,3]` | `52,001 B` | `0` mis (`9.5e-8`) | `5.82 / 6.51 µs` | `0.9817` | `0.9575` | `0.9545` | `0.9189` | `5` (`0.107%`) | `0.00 / 0.00 / 0.43` | `0 / 2,092` (`0.00%`, raw MLP `46`) |
| **`C3_R20_hard_neg`** | `[82,96,48,3]` | `122,957 B` | `0` mis (`1.1e-7`) | `14.62 / 16.55 µs` | `0.9801` | `0.9770` | **`1.0000`** | `0.9315` | `4` (`0.086%`) | **`0.00 / 0.04 / 0.00`** | `0 / 2,092` (`0.00%`, raw MLP `2`) |
| **`C4_R20_full_focal` (Primary Winner)** | **`[82,64,32,3]`** | **`73,275 B`** | **`0` mis (`9.7e-8`)** | **`8.12 / 9.67 µs`** | **`0.9752`** | **`0.9873`** | **`0.9767`** | **`0.9855`** | **`0` (`0.000%`, 95% Wilson `[0, 0.0008]`)** | **`0.00 / 0.00 / 0.09`** | **`0 / 2,092` (`0.00%`, raw MLP `5`)** |
| **`C6_supervised_no_teacher`** | `[82,96,48,3]` | `122,836 B` | `0` mis (`1.1e-7`) | `14.51 / 15.96 µs` | `0.9801` | `0.9590` | `0.9333` | `0.9444` | `3` (`0.064%`) | `0.00 / 0.04 / 0.00` | `0 / 2,092` (`0.00%`, raw MLP `2`) |
| **`C7_distilled_l050_T2`** | `[82,96,48,3]` | `122,894 B` | `0` mis (`1.0e-7`) | `14.58 / 16.00 µs` | `0.9874` | `0.9728` | `0.9333` | **`0.9855`** | **`0` (`0.000%`)** | **`0.00 / 0.00 / 0.00`** | **`0 / 2,092` (`0.00%`, raw MLP `1`)** |
| **`C7_distilled_l050_T4`** | `[82,64,32,3]` | `73,138 B` | `0` mis (`1.1e-7`) | `8.11 / 9.67 µs` | **`0.9891`** | **`0.9826`** | **`0.9767`** | `0.9714` | `1` (`0.021%`) | **`0.00 / 0.04 / 0.00`** | `0 / 2,092` (`0.00%`, raw MLP `4`) |

---

## 4. Limitations & Intended Scope

1. **Landmark Dependency (`§12.1`, `§13`, `§17.5`):** As a landmark-based student, `C4_Full_Focal` / `C7_Distilled` only executes when MediaPipe `HandLandmarker` outputs 21 hand landmarks. When `DETECTOR_MISS` occurs in near-black lighting (`mean_luma < 0.20`), the runtime relies on the `A4` adaptive photometric fallback (`A0 RAW` -> `A3 Mild Denoise + Gamma + Moderated CLAHE 320` on detector miss) and fail-closed `PistolVirtualKeyFSM` (`RELEASE_ALL`).
2. **Physical Webcam Gate (`G20-D`):** All offline, OOD, and Chromium simulated-camera tests pass, but Owner physical night webcam validation (`N1..N6` in `§9`) requires Owner hardware and remains **`NOT_TESTED`**.
