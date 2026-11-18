# R19 Classifier Training, Calibration, Ablation & End-to-End Evaluation Report

- **Plan Reference:** [`[WIP] NUI_R19-01 v0.1.0`](../../docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md)
- **Evaluated Family Lineage:** `G0_main` -> `R18_UX1` (`P2_balanced`) -> `G1_pistol` (pure geometry + FSM) -> `G2_LR` (`82`-dim linear) -> `G3_MLP` (`[82->96->48->3]`) -> **`G4_Hybrid` (`G1 + G3 + PistolVirtualKeyFSM`)** + Ablations `G5_r18feat` (`68`-dim) & `G5_p1f_trap` (`P1F==PRESS`).
- **Evidence Discipline:** Real-data results marked `OFFLINE_DATASET`; kinematic/3D->2D/distractor checks marked `SYNTHETIC`; physical webcam remains **`NOT_TESTED`**.

---

## 1. End-to-End Comparison Table (`G0_main` .. `G4_Hybrid` + Ablations)

| Architecture / Candidate | Model Size | Locked Test Acc / Macro-F1 (`17,086 / 5,067 / 4,720`) | `HG5G test` (`n=230` M3) Acc / `POINT_PRESS` Rec | `L-Sign` `x0.22` Webcam Scale Rec | `N66 test` `OTHER` (`11` cls, `n=888`) False Active | `IPN test` (`36` vid) `NOG` / `P2F` / `P1F` `KD/min` | Mendeley (`599`) / `N0-N1` (`33`) False Fires |
|---|---:|---:|---:|---:|---:|---:|---:|
| **`G0_main` Baseline** | `0 B` | — | `69.57%` steer on `OTHER` | — | `61.60%` false steer | `57.98%` / `74.04%` / `72.10%` steer | `27.71%` / `33/33` |
| **`R18_UX1` (`P2_balanced`)** | `0 B` | — | `0.57%` `POINT` on `OTHER` | — | `1.69%` false `POINT` | `5.62%` / `5.95%` / `40.85%` steer | `2.67%` / `0/33` |
| **`G1_pistol` (Rules + FSM)** | `0 B` | — | `0.9826` / `97.14%` (`0` FP) | **`33/33` (`100%`)** | `0.34%` frame PRESS (`0` FSM*) | `1.11` / `0.64` / `8.50` | `0.83%` (`0` seq) / `0/33` |
| **`G2_LR` (`82`-dim Linear)** | `5,092 B` | `0.9786` / `0.6748` | `0.9957` / `97.14%` (`0` FP) | — | — | — | — |
| **`G3_MLP` (`mlp_96_48_n03`, `T=1.27`)** | **`122,768 B`** | **`0.9985` / `0.9567`** (`ECE=0.00137`) | **`0.9957` / `97.14%` (`0` FP)** | **`33/33` (`100%`)** | **`0.00%`** (`0/888` PRESS) | `0.04%` / `0.09%` / `0.07%` frame | `0.67%` (`4/599`) / `0/33` |
| **`G4_Hybrid` (`G1 + G3 + FSM`)** | **`122,768 B`** (`47,288 B` wire) | Same calibrated `G3` + hard `G1` barriers | `0.9826` / **`97.14%`** (`0%` `READY->PRESS`, `0%` `OTHER->PRESS`) | **`33/33` (`100%`)** | **`0.00%` FSM active / `0` `KEYDOWN`** | **`0.00` / `0.04` / `0.09` `KD/min`** | **`0.00%` seq / `0/33`** |
| *Ablation `G5_r18feat` (`68`-dim)* | `109,884 B` | `0.9998` / `0.9951` *(cheats via `hand_size`)* | `0.9957` / `97.14%` | **`2/33` (`6.06%` COLLAPSE)** | — | — | — |
| *Ablation `G5_p1f_trap` (`P1F==PRESS`)* | `73,270 B` | `0.8973` / `0.8709` | `0.9826` (`19.05%` `READY->PRESS`!) | — | — | `27.40%` / `25.26%` / `96.18%` frame | — |

*\*Note: On `HandGesture-5G test`, `G1_pistol` and `G4_Hybrid` miss `3/21` static `Pointing Up` into `OTHER` (keep keys OFF); `G3_MLP` achieves `21/21 (100%)` on `Pointing Up`. Note that `Natural RGB v3` (`n=888`) is `OFFLINE_DATASET` unseen participants (`p02,p05,p15`).*

---

## 2. Dataset Quality, Anti-Leakage & Split Hygiene (`R19_TRAINING_METRICS`)

1. **`HandGesture-5G` (`wj25crzdbm.1`, HTTP Range, `0 B` raw zip):**
   - `2,659` entries -> `846` exact CRC32 duplicates removed -> `1,807` unique -> `1,797` decoded (`10` unreadable `.HEIC` skipped; `100% EXIF Orientation=1`).
   - `38` session/day/model/class/dHash-disjoint clusters (`0` cross-split clusters, `0` bursts `<= 15 s`, `min dt = 24.0 s`). Cross-device `iPhone 14 Pro Max` forms `VAL L-Sign` (`111` det) against `iPhone 15 Pro Max` `TRAIN/TEST`, plus explicit cluster `18 <-> 19` rebalance inside `train/val` raising `VAL POINT_READY` from `6 -> 22` without touching `TEST`.
2. **`Natural RGB Hand Gestures v3` (`n66hhk695h.3`, `1,352` MP4 clips, `10,816` frames):**
   - `0` decode failures; `26` participants split `19 / 4 / 3` (`train p01..p26` `7,488f`, `val p13,p14,p17,p19` `1,560f`, `test p02,p05,p15` `1,768f`).
   - **VIDEO vs IMAGE Benchmark (`60` clips, `4,285` frames):** Sequential `VIDEO + M3 CLAHE` lifted MediaPipe detection from `img_l0 = 48.12%` (`82` dropouts) -> `vid_m3 = 56.62%` (`51` dropouts); `dim` `40.44% -> 59.33%`, `green_led` `15.44% -> 31.05%`, `red_led` `8.22% -> 12.75%`.
3. **`IPN HandS` (`train 19 / val 5 / test 5` persons):**
   - Zero scene/subject leakage; `TRAIN` subsamples `NOG` (stride `28`) & other negative gestures (stride `20`) *after* continuous `30 Hz` causal velocity computation; `TEST` runs un-subsampled across all `36` videos (`162k+` frames).

---

## 3. Deeper Slice Findings (`r19_eval_all.json`)

- **Critical Invariance Discovery (`H3.2`):** With raw `hand_size` present, close-up `HandGesture-5G` (`hs ~ 0.66`) vs distant webcam `IPN/n66` (`hs ~ 0.27`) trained `G5_r18feat` (`68`-dim) to reject small hands (`2/33 = 6.06%` at `x0.22`). Replacing `hand_size` with `thumb_over_index_reach` gives **`1.577e-14` exact invariance across all `82/82` features × 5 aspects × 3 scales** and **`33/33 (100%)`** across `1.0x..0.22x` scales AND `0°, 90°, 180°, -135°` 16:9 projected rotations.
- **`HandGesture-5G test` Breakdown (`G4_Hybrid`):** `low_eb` **`100%` (`44/44`)**, `correct_eb` **`98.08%` (`153/156`)**, `high_eb` **`96.67%` (`29/30`)**, `L0_det` **`98.67%`** (`33/33 L-Sign`), `L1_recovered` **`75.00%` (`3/4`)**.
- **`Natural RGB v3 test` Lighting Breakdown (`G4_Hybrid` vs `G0_main`):**
  - `bright_daylight` (`527` det): `G0 = 60.72%`, **`G4 = 0.00%`**
  - `green_led` (`99` det): `G0 = 92.93%`, **`G4 = 0.00%`**
  - `red_led` (`37` det): `G0 = 78.38%`, **`G4 = 0.00%`**
  - `dim` (`98` det): `G0 = 56.12%`, **`G4 = 0.00%`**
  - `backlit` (`8` det): `G0 = 12.50%`, **`G4 = 0.00%`**
  - `indoor_moderate` (`119` det): `G0 = 42.02%`, **`G4 = 0.00%`**
  - Casual held-out `point_left` (`87` det, `60` w/ `thumb_lateral >= 1.3`) / `point_right` (`80` det, `65` w/ `thumb_lateral >= 1.3`): `G4` flags `0/87` (`point_left`) and `7/80` (`point_right`, where full-body L-shape spread strongly).
- **`IPN test` Negatives (`G4_Hybrid` `KEYDOWN/min` vs `G1_pistol`):**
  - `NOG`: `1.11 -> 0.00/min`; `P2F`: `0.64 -> 0.04/min`; `GRB`: `5.83 -> 0.00/min`; `C1F`: `24.49 -> 0.00/min`; `2C1`: `14.95 -> 0.00/min`; `ZOT`: `2.71 -> 0.00/min`; `P1F`: `8.50 -> 0.09/min`; `TUP/TRT/TLT/TDN/OP2/2C2/C2F`: all `0.00/min`.
- **Ownership & `JumpAssist 50 Hz` Physics Compatibility (`SYNTHETIC`):**
  - `MEDIAN_SKELETONS`: `palm` (`3/3` Erase), `stop` (`3/3` Erase), `four/three/one/two_up/peace/fist` (`0` steer, `0` PRESS, `0` Erase, `0` Pinch).
  - `pinchSkeleton(0.05..0.80)`: `10/10` Pinch at `0.05..0.25`; `0/10` Pinch at `0.35..0.80`; `0` false PRESS across all gaps.
  - `RIGHT -> RIGHT+JUMP -> RIGHT` across **`75 / 60 / 30 / 15 Hz`**: **`100%` horizontal continuity (`0` drops)** and **`1` exact jump per intent**; phase carryover barrier `active = false`.
- **Parity & Speed:** `150` locked test rows `max_abs_diff = 2.494e-6`, `0` argmax mismatches; JS `p50 = 21.53 µs`, `p95 = 25.08 µs`.

---

## 4. Out-of-Domain Real `HANDS RGB-D` Matched-BBox Evaluation (`EVAL_ONLY`, [`r19_hands_rgbd_eval.json`](./r19_hands_rgbd_eval.json))

Visual audit ([`data_curation_summary.md`](./data_curation_summary.md), `hands_rgbd_horiz_audit.jpg`) across `2,700` RGB PNGs streamed via HTTP Range (`Subject1..Subject5`, `0 B` raw zip stored; [`hands_rgbd_eval_stats.json`](./hands_rgbd_eval_stats.json)) confirmed `Horiz_HBL/HFR/HFL/HBR` are horizontal **5-finger flat open palms** (`OTHER` under Pistol rules), `One_VFL/VFR` are vertical **1-finger tucked-thumb pointing** (`POINT_READY`, `hand_size p50 = 0.113`), and `Span/Two/Five/Punch/TimeOut/Six/Seven/Eight` are non-pistol `OTHER` distractors:

- **Zero False Pistol Presses Across Every Class (`3,911` GT-matched instances):** **`G4_Hybrid` (`G1 + G3 + FSM`) fired `0 / 3,911 (0.00%)` `POINT_PRESS`** across `ALL_HORIZ_POINTING` (`n = 2,391`, **`0.00%` PRESS / `0.00%` READY / `100%` `OTHER`** vs **`G0_main = 99.33%` false steer**; `Horiz_HBL = 99.05%` `G0` vs **`0.00%` `G4`**), `STRICT_OTHER_NON_POINT` (`Punch`, `Five`, `TimeOut`, `Span`, `Two`, `Six`, `Seven`, `Eight`, `n = 1,308`: **`G4 = 0.00%` PRESS / `1.07%` READY / `98.93%` `OTHER`** vs `G0 = 68.58%` steer, `G2_LR = 13.69%` PRESS [up to `98.28%` on thumb+pinky `Span_VFR`], `G3_MLP = 0.38%` PRESS & `75.64%` `Eight_VFR` `READY`), and `One_VFL/VFR` (`n = 212`: `0.00%` PRESS).
- **Scale-Invariance Confirmed Out-of-Domain on Tiny Upper-Body `One_VFR` (`hand_size p50 = 0.113`, `n = 110`):** Scale-invariant **`G3_MLP` & `G4_Hybrid`** achieve **`99.09%` (`109/110`) `POINT_READY`** (`0.00%` `POINT_PRESS`, `G0_main = 100.00%` false JUMP), whereas **`G5_r18feat` (`68`-dim w/ `hand_size`) collapses to `39.09%`** (`5.88%` on `One_VFL` vs `54.90%` `G4_Hybrid`).
