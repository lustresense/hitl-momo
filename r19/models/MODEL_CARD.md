# Model Card — `r19_model_mlp.json` (`r19-p3`, G3 / G4 Hybrid Pistol Classifier)

- **Published Paths (`research-can`):**
  - Primary MLP (`G3`): [`r19/models/r19_model_mlp.json`](./r19_model_mlp.json) (**`122,768 B`** / `119.89 KiB`, SHA-256 `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293`)
  - Linear Baseline (`G2`): [`r19/models/r19_model_lr.json`](./r19_model_lr.json) (**`5,092 B`** / `4.97 KiB`, SHA-256 `64821aa20b1cc3b959a0d6b3dbe984ed9f190249be01ad757cfaaed321842737`)
- **Size Budget Status:** `122,768 B <= 200 KB` classifier sub-budget (and full cold browser wire incl. WASM + app < `25 MB` B-USER).
- **Architecture:** Dense ReLU MLP `[82 -> 96 -> 48 -> 3]` (`mlp_96_48_n03`, Adam + cosine LR `2.5e-3`, L2 `4e-4`, input noise `0.03`, best epoch `18` in `2.68 s`), z-score standardization fit strictly on `TRAIN`, and post-hoc temperature scaling (`T = 1.27` fit strictly on `VAL`).
- **Hybrid Operating Point (`G4` tuned strictly on `VAL`):** `tauPress = 0.38`, `tauPressRescue = 0.60`, `otherVetoTau = 0.72`, `tauPointAny = 0.40`, `emaAlpha = 0.68`, `allowSoftDorsalRescue = true`, paired with `G1` hard geometric barriers and `PistolVirtualKeyFSM` (`J3_pulse_consumed`).

---

## 1. License & Data Provenance (100% Commercial-Safe `CC BY 4.0`)

Trained exclusively on verified **`CC BY 4.0`** sources:
1. **HandGesture-5G** (`10.17632/wj25crzdbm.1`, `CC BY 4.0`): Cluster-disjoint (`min dt >= 24s`, `0` shared session/dhash clusters); `L-Sign` -> `POINT_PRESS`, `Pointing Up` -> `POINT_READY`, `{Fist, V-Sign, Open Palm_Open Hand}` -> `OTHER`. Includes both static (`has_history=0`), causal steady-hold tremor (`has_history=1`), and `320px CLAHE L1` landmarks in **`TRAIN` only** (`VAL` & `TEST` raw only).
2. **Natural RGB Hand Gestures v3** (`10.17632/n66hhk695h.3`, `CC BY 4.0`): Participant-disjoint `19/4/3` split; `11` verified negative classes (`thumbs_up`, `thumbs_down`, `peace_sign`, `ok_sign`, `fist`, `stop`, `raised_hand`, `palm_down_push`, `wave`, `come_here`, `go`) across `bright_daylight`, `indoor_moderate`, `dim`, `green_led`, `red_led`, `backlit` -> `OTHER`. Conversational `point_left`/`point_right` held out as `AMBIGUOUS_CONVERSATIONAL_POINTING`.
3. **IPN HandS** (`10.3390/app15116321`, `CC BY 4.0` / MP `Apache 2.0`): Person-disjoint `19/5/5` split; continuous 30 Hz `{NOG, P2F, C2F, 2C2, GRB, TUP, TDN, TLT, TRT, OP2, ZIN, ZOT}` -> `OTHER`. `{P1F, C1F, 2C1}` held out from supervision (`AMBIGUOUS_CASUAL_1F`; audited separately and verified via `g5_p1f_trap` ablation).
4. **Excluded:** Zero `HaGRIDv2` (`HOLD_LICENSE` ShareAlike Sec. 3b/4), zero `DimHand` (`BLOCKED`), zero `CC BY-NC*` datasets, zero `HANDS RGB-D` (`EVAL_ONLY`), zero `bxr7kx84y6` (`EVAL_ONLY`).

---

## 2. Split Row Counts

- **Train (`17,086` rows):** `POINT_READY = 302`, `POINT_PRESS = 196`, `OTHER = 16,588`
- **Val (`5,067` rows):** `POINT_READY = 22`, `POINT_PRESS = 111`, `OTHER = 4,934` (`selected_mlp`: `val_macroF1 = 0.9515`, `val_acc = 0.9972`, `val ECE: 0.00120 -> 0.00132`)
- **Test Locked (`4,720` rows):** `POINT_READY = 21`, `POINT_PRESS = 35`, `OTHER = 4,664`

---

## 3. Verified Offline Metrics (`G3` MLP vs `G2` LR & `G4` Hybrid)

- **Locked Test Matrix (`r19_training_metrics.json`):**
  - `G3_MLP`: Accuracy **`0.9985`**, Macro-F1 **`0.9567`**, Calibrated NLL **`0.00710`**, ECE **`0.00137`** (`POINT_READY F1=0.9130`, `POINT_PRESS F1=0.9577 [P=0.9444, R=0.9714]`, `OTHER F1=0.9992`; confusion `[[21,0,0],[0,34,1],[4,2,4658]]`)
  - `G2_LR`: Accuracy `0.9786`, Macro-F1 `0.6748`, Calibrated NLL `0.07033`, ECE `0.00739` (`92` more `OTHER` false triggers)
- **Scale, Rotation & Aspect Invariance (`82/82` exact features):**
  - `max_aspect_invariant_diff = 1.577e-14` (`1:1..9:16` × `0.22..0.85` scales)
  - Real `HandGesture-5G L-Sign` test recall: **`33/33 (100%)`** across `x1.0, x0.6, x0.35, x0.22` scales and `0°, 90°, 180°, -135°` 16:9 projected rotations (`G5_R18_68dim` with raw `hand_size` drops to **`2/33 (6.06%)`** at `x0.22`!).
- **Locked Multi-Dataset & Sequence Safety (`r19_eval_all.json`):**
  - `Natural RGB v3` held-out `test` (`3` unseen participants, `888` detected `OTHER` hands across dim/LED/backlit): **`G3 = 0.00%` false PRESS**, **`G4_Hybrid = 0.00%` FSM active / `0` `KEYDOWN`** (`G0_main = 61.60%` false steer).
  - `IPN HandS` locked `test` (`36` videos, `5` unseen subjects): **`G4_Hybrid`** cuts false `KEYDOWN/min` to **`0.00/min`** on `NOG` (`G1=1.11`, `G0=57.98%` steer), **`0.04/min`** on `P2F` (`G1=0.64`), **`0.00/min`** on `TUP/GRB/ZOT`, and **`0.09/min`** on casual `P1F` (`G1=8.50/min`).
  - Cached `Mendeley bxr7kx84y6` (`599` hands) & `N0/N1` adversarial distractors (`33` hands): **`G4_Hybrid = 0.00%` sequential active / `0/33` hallucinated fires**.
  - Synthetic `RIGHT -> RIGHT+JUMP -> RIGHT` (`50 Hz JumpAssist + InputArbiter`): **`100%` horizontal continuity** & exact **`1` jump** at `75/60/30/15 Hz`.
- **Python vs TS Parity & Speed:** `150` locked test rows -> `max_abs_diff = 2.494e-6`, `0` argmax mismatches; pure JS `G3` `p50 = 21.53 µs`, `p95 = 25.08 µs` (`full G4 pipeline p50 = 55.60 µs`, `p95 = 87.12 µs`).

---

## 4. Known Limitations & Test Boundaries
1. **No natural continuous `POINT_READY <-> POINT_PRESS` video benchmark in public `CC BY 4.0` datasets:** Thumb-toggle ergonomics are evaluated via `SYNTHETIC` 3D->2D/kinematic suites and `.y4m` Chromium playback; real webcam responsiveness remains **`PHYSICAL_WEBCAM = NOT_TESTED`**.
2. **Low-light / colored LED front-end bottleneck:** Even with adaptive CLAHE + VIDEO tracking (`vid_m3`), MediaPipe HandLandmarker detects only `14.72%` (`green_led`) / `21.99%` (`red_led`) / `51.67%` (`dim`) on distant full-body clips in `Natural RGB v3` — when MediaPipe outputs zero landmarks, downstream gesture classifiers fail safe (`KEYUP`).
3. **Standalone NUI Lab Scope Only:** Artifact targets `/nui-lab/gesture` and `/nui-lab/canvas` diagnostics; student gameplay remains completely untouched pending Owner approval.
