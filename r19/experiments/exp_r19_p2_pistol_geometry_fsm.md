# Experiment R19 Stage P2 — Pure Pistol Geometry (`G1`) & Virtual-Key FSM vs `G0_main` & `R18_UX1`

- **Candidates Evaluated:**
  - `G0_main`: Baseline `main` (`c14b1d0502` / `3ef4cc3685`) `evaluateGameplayGesture`, `GameplayGestureFilter`, `classifyHandPose`, `countExtendedFingers`
  - `R18_UX1`: R18 rule candidate ([r18/candidates/ux1_candidates.ts](../../r18/candidates/ux1_candidates.ts), `P2_balanced`, `J2_edge`)
  - `G1_pistol`: R19 Pure Pistol Geometry & Virtual-Key FSM ([../candidates/pistol_geometry.ts](../candidates/pistol_geometry.ts), [../candidates/pistol_fsm.ts](../candidates/pistol_fsm.ts), [../candidates/pistol_types.ts](../candidates/pistol_types.ts))
- **Reproducible Scripts & Raw Results:**
  - [../scripts/run_g0_g1_eval.ts](../scripts/run_g0_g1_eval.ts) -> [../results/g0_g1_eval.json](../results/g0_g1_eval.json)
  - [../scripts/stream_ipn_split.py](../scripts/stream_ipn_split.py) | [../scripts/eval_g1_on_ipn_test.ts](../scripts/eval_g1_on_ipn_test.ts) -> [../results/ipn_test_g0_g1_baseline.json](../results/ipn_test_g0_g1_baseline.json)
  - [../scripts/n0_n1_pistol_distractors.py](../scripts/n0_n1_pistol_distractors.py) -> [../scripts/eval_p2_n0_n1.ts](../scripts/eval_p2_n0_n1.ts) -> [../results/n0_n1_p2_eval.json](../results/n0_n1_p2_eval.json)
- **Evidence Tiers:** Aspect, 3D->2D pose, `N0/N1`, and dynamic `JumpAssist` checks are **`SYNTHETIC` / `UNIT_ONLY`**; IPN HandS and Mendeley tabletop checks are **`OFFLINE_DATASET`**; physical webcam remains **`NOT_TESTED`**.

---

## 1. Key Fixes Implemented in `G1_pistol`
1. **Aspect-Corrected Finger Diagnostic (`fingerDiagnosticStatesAspect`):** Fixes `hand-gesture.ts` calling `fingerStates()` on raw unscaled coordinates even when `experimentalRobust=true`.
2. **Dorsal / Side-On Resilient Multi-Cue Thumb Open Metrics:** Replaces reliance on `thumbLateral()` (dividing by `||5 - 17||^2`, which collapses/explodes under dorsal roll) with aspect-corrected `palmScale = max(dist(0,9), dist(5,17))` normalized features: `d4_5`, `d4_6`, `d4_9`, `d4_10`, `d4_2`, `d4_8`, `thumbPerpFromIndexRay`, `thumbSignedRadial`, `thumbSignedPalmPlane`, `thumbAngle123Deg`, `thumbAngle234Deg`, `thumbAbduction854Deg`, and `thumbAbduction524Deg`.
3. **Dorsal Right-Hand Pointing Left (`O0/O1`) Non-Pinch Guard:** Separates true close pinch from dorsal thumb projection near `5`/`6` (`tip 8` far left so `d4_8 >= 0.40` -> `false_pinch = false`).
4. **Collision Resolution:** Requires curled `middle`, `ring`, `pinky` for `POINT_READY`/`POINT_PRESS` (blocking `two-fingers` and `countExtendedFingers === 2` collisions), and requires all 4 fingers curled for `thumb-up` (blocking 90° vertical pointing collisions).
5. **Virtual-Key Continuity & `JumpAssist` Safe Triggering (`PistolVirtualKeyFSM`, `J3_pulse_consumed`):**
   - `POINT_READY` -> keys strictly OFF (`{left:false, right:false, jump:false}`).
   - `POINT_PRESS` -> `KEYDOWN`/`HELD` on zone; `POINT_RELEASE` (`READY`/`OTHER`/`NO_HAND`) -> immediate `KEYUP`.
   - Preserves horizontal keys (`right` / `left`) seamlessly across the upper-quadrant `30°..45°` / `135°..150°` deadband seam during **`RIGHT -> RIGHT+JUMP -> RIGHT`**.
   - `J3_pulse_consumed` emits a bounded `60 ms` pulse + `130 ms` non-jump lockout (+ `notifyJumpConsumed()` hook) so 50 Hz `JumpAssist` + 100 ms `InputArbiter` neither misses high-FPS single-frame edges (`75 Hz` `J2` bug) nor bunny-hops across landing (`J1` bug).

---

## 2. Quantitative Results Comparison

### 2.1 Multi-Aspect Sweep (`SYNTHETIC`, `100` samples per aspect)
| Aspect | `G0_main` Max Err | `G0_main` Zone Mismatch | `G0` Raw `fingerStates` Err | `G1_pistol` Max Err | `G1_pistol` Zone Mismatch | `G1` Aspect `fingerStates` Err | `G1` `POINT_PRESS` Recall |
|---|---:|---:|---:|---:|---:|---:|---:|
| `1:1` | `0.00°` | `0` | `0` | **`0.00°`** | **`0`** | **`0`** | **`100%`** |
| `5:4` | `6.36°` | `12` | `1` | **`0.00°`** | **`0`** | **`0`** | **`100%`** |
| `4:3` | `8.17°` | `12` | `1` | **`0.00°`** | **`0`** | **`0`** | **`100%`** |
| `16:9` | `16.17°` | `28` | `1` | **`0.00°`** | **`0`** | **`0`** | **`100%`** |
| `9:16` | `16.22°` | `44` | `0` | **`0.00°`** | **`0`** | **`0`** | **`100%`** |

### 2.2 Rotated / Pitched / Rolled 3D->2D Suite (`SYNTHETIC`, `10,500` hands across `15` poses, rolls `[-35°..+35°]`, pitches `[-40°..+40°]`)
- **`G1_pistol` 3-class accuracy (`POINT_READY` / `POINT_PRESS` / `OTHER`):** **`99.11%`** (15-family subclass accuracy: **`96.62%`**).
- **`POINT_READY` (`1,400` hands):** **`100%`** recall, **`0.00%`** false `PRESS` (vs `G0` `71.43%` false steer, `R18_UX1` `100%` steer).
- **`POINT_PRESS` (`1,400` hands):** `POINT_PRESS_std` **`100%`**; `POINT_PRESS_dorsal_short` **`91.86%`** (`8.14%` fell safely to `POINT_READY` under extreme `±35°/±40°` corner foreshortening; overall `PRESS` recall **`95.93%`**).
- **`OTHER` (`7,700` hands — `PinchTouch`, `PinchNear`, `ThumbUp`, `V-Sign`, `Three`, `Four`, `OpenPalm`, `Fist`):**
  - `G0_main` false steer: **`77.29%`** | `R18_UX1` false pointing: **`16.22%`** (`PinchNear_straight 81.71%`, `PinchNear_arched 96.71%`) | **`G1_pistol` false `POINT_PRESS`: `0.00%`** (only `5.14%` of `PinchNear_straight` fell into `POINT_READY`; `100%` exact `OTHER` on all other 10 non-pistol classes!).
- **Dorsal Right-Hand Pointing Left (`O0`/`O1` slice):**
  - Standard `POINT_PRESS`: `G1_pistol` **`50/50 (100%)`** vs `G0_main` `one-finger` **`0/50`**.
  - Shortened `POINT_PRESS_dorsal_short`: `G1_pistol` **`46/50 (92%)`**, **`0`** false pinch vs `G0_main` `one-finger` **`3/50`**.
  - `POINT_READY`: `G1_pistol` **`100/100 (100%)`**, **`0`** false `PRESS` vs `G0` `50/100` / `R18_UX1` `100/100` false steer.
  - Explicit `tip 4` overlapping `5` (`d4_5=0.13, d4_8=0.838`) & `6` (`d4_5=0.365, d4_8=0.588`) dorsal-left edge checks: **`false_pinch = false`**, `G1 = POINT_READY` (whereas `G0` collapsed `tip4_over_6` to `"none"`).

### 2.3 Dynamic Continuity & 50 Hz `JumpAssist` + 100 ms `InputArbiter` (`SYNTHETIC`)
| Controller / Policy | `75 Hz` Right Cont% (Jumps) | `60 Hz` Right Cont% (Jumps) | `30 Hz` Right Cont% (Jumps) | `15 Hz` Right Cont% (Jumps) | 30 Hz Double Re-Press (`Exp=2`) |
|---|---:|---:|---:|---:|---:|
| `G0_main` | `97.8%` (`3` bunny-hops) | `96.7%` (`3`) | `95.6%` (`3`) | `95.6%` (`3`) | `100%` (`2`) |
| `R18_UX1_J1` | `92.31%` (`2`) | `93.41%` (`2`) | `93.41%` (`2`) | `100%` (`3`) | `100%` (`2`) |
| `R18_UX1_J2` | `92.31%` (**`0` MISSED!**) | `93.41%` (`1`) | `93.41%` (`1`) | `100%` (`2`) | `100%` (`3`) |
| `G1_J1` | `100%` (`2` bunny-hops) | `100%` (`2`) | `100%` (`2`) | `100%` (`2`) | `100%` (`2`) |
| `G1_J2` | `100%` (**`0` MISSED!**) | `100%` (`1`) | `100%` (`1`) | `100%` (`1`) | `100%` (`2`) |
| **`G1_J3` (`J3_pulse_consumed`)** | **`100%` (`1` exact)** | **`100%` (`1` exact)** | **`100%` (`1` exact)** | **`100%` (`1` exact)** | **`100%` (`2` exact)** |

- **Additional Verified `G1_J3` Safety Checks (`g0_g1_eval.json`):** `READY` false keys = `0`, `PRESS -> KEYDOWN` = `1` frame, immediate `KEYUP` on release to `READY`/`OTHER`/`NO_HAND` (`0` stuck frames), coyote + pre-landing buffer both `true`, opposite flip `0` simultaneous L+R (`66 ms`), 1-frame `NO_HAND` dropout = immediate `KEYUP` + `1` total jump, phase barrier carryover = `0`, noisy non-pistol jitter (`840` frames, `σ=0.01`): `G0=597/840`, `UX1=153/840`, **`G1=0/840`**.

### 2.4 Real Unseen Offline Datasets & Adversarial Non-Hands
1. **IPN HandS Locked Person-Disjoint Test (`OFFLINE_DATASET`, `36` videos, `5` unseen subjects `[6,10,13,21,29]`):** *(Note: IPN has NO explicit Pistol `PRESS` class; `P1F`/`C1F` are casual 1-finger monitor pointing, and `NOG/P2F/GRB/TUP/OP2` are `OTHER` negatives.)*
   - **`NOG` (`22,795` MP hands):** `G0_main` steer `57.98%` | `UX1` steer `2.40%` | **`G1` `OTHER = 96.32%`, `PRESS = 0.64%`, FSM active = `0.24%` (`1.11` `KEYDOWN/min`)**.
   - **`P2F` (`35,676` MP hands):** `G0_main` steer `74.04%` | `UX1` steer `1.31%` | **`G1` `OTHER = 96.60%`, `PRESS = 0.33%`, FSM active = `0.10%` (`0.64` `KEYDOWN/min`)**.
   - **`TUP` (`1,073` hands) / `OP2` (`1,930` hands) / `GRB` (`1,180` hands):** `G1` `OTHER` = `99.16%` (`0.00/min`), `98.86%` (`0.00/min`), `96.36%`.
   - **`P1F` (`36,865` MP hands):** `G1` `POINT_READY = 55.34%`, **`POINT_PRESS = 5.59%`** (`FSM active = 2.35%`, `8.50` `KEYDOWN/min` when casual subjects naturally let thumb swing outward while pointing), `OTHER = 39.07%` (straight-at-camera foreshortening/folded curl).
2. **Cached Mendeley Tabletop Hands (`ux3_mendeley_distractor_landmarks.json`, `1,133` hands):**
   - `G0_main` false steer **`29.39%` (`333/1133`)** | `R18_UX1` false point **`7.50%` (`85/1133`)** | `G1_pistol` single-frame `PRESS` **`1.15%` (`13/1133`)**, sequential FSM false active frames **`0`**.
3. **Adversarial `N0`/`N1` Distractors (`55` scenes, `n0_n1_p2_eval.json`, `SYNTHETIC`):**
   - MediaPipe rejected `10/10` `N0_l_sticks` (`0` FP) & `5/5` `N1_poster_pistol` (`0` FP), while triggering on `N0_fan_sticks` (`4/10` raw, `10/10` scaled/CLAHE) and `N1_poster_hand` (`3/5`). Downstream on all hallucinated skeletons: `G0_eval_steer` **`7/7` (`100%`) raw, `13/13` (`100%`) scaled/CLAHE** vs **`G1` `0/7` & `0/13` `PRESS`/`READY` (`100% OTHER`, `0` FSM active across `5x` hold)**.

---

## 3. Residual Limitations Entering Stage P3 (`G2..G5`)
1. `IPN P1F` shows **`5.59%`** relaxed-thumb `G1` `POINT_PRESS` false triggers (`8.50 KEYDOWN/min`), and `POINT_PRESS_dorsal_short` misses **`8.14%`** under extreme synthetic roll+pitch (`±35°/±40°`).
2. `G1` relies on an 11-way hard threshold conjunction for `thumbOpen`; calibrated lightweight classifiers (`G2` LR, `G3` MLP, `G4` Hybrid) over real `HandGesture-5G L-Sign`, `Natural RGB v3`, `IPN`, and `HANDS RGB-D` are required next to tighten real-world precision/recall and calibration (`ECE`).
