# R19 Gesture Label Schema & Conflict-Resolution Specification

- **Plan Reference:** [`[WIP] NUI_R19-01 v0.1.0`](../../docs/plan-rev/%5BWIP%5D%20NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md)
- **Classifier Label Space (`R19_LABELS`):** `["POINT_READY", "POINT_PRESS", "OTHER"]` (`0, 1, 2`)
- **Causal Feature Vector (`r19_features.ts`):** `82` 2D aspect-corrected canonical features (`0`-lookahead causal ring buffer `~80..260 ms`)
- **Primary License Provenance:** `100%` verified commercial-safe **`CC BY 4.0`** (`HandGesture-5G` + `Natural RGB Hand Gestures v3` + `IPN HandS`). Zero `HOLD_LICENSE` (`HaGRIDv2`), zero `BLOCKED` (`DimHand`), zero `CC BY-NC*` data used.

---

## 1. Canonical Pistol Control States & Thinman Semantics

| State | Thumb & Finger Geometry | Virtual Key State (`PistolVirtualKeyFSM`) | Thinman Output |
|---|---|---|---|
| **`POINT_READY`** | Index straight (`bendIndex >= 135°`, `reach >= 1.15`, `d5_8 >= 0.65`), middle/ring/pinky folded (`noOtherExtended`), thumb **folded** (`thumbOpen = false`) | Arms direction hover **with keys OFF** (`left=false, right=false, jump=false`) | Idle aim only; prevents involuntary walking/jumping while resting or aiming |
| **`POINT_PRESS`** | Index straight, middle/ring/pinky folded, thumb **open (`L-Sign` / Pistol trigger)** (`thumbOpen = true`, non-pinch, non-thumb-up) | Emits `KEYDOWN` after causal dwell (`50 ms` same / `66 ms` opposite); sustains `HELD` (`left` / `right`) and `60 ms` jump pulse + `130 ms` lockout (`J3_pulse_consumed`) | `right` (`|theta| < 30°`), `left` (`|theta| > 150°`), `right+jump` (`45..75°`), `left+jump` (`105..135°`), `jump` (`75..105°`), `stop` (`30..45°`, `135..150°`, `< -30°`) |
| **`OTHER`** | Thumb-up (`isThumbUpPistolGuard`), Pinch (`pinch`), Fist, 2–5 extended fingers, or non-plausible/degenerate hand | Immediate **`KEYUP`** (0-frame stickiness) -> neutral `{left:false, right:false, jump:false}` | Allows existing `Pinch` draw, `Five`-finger erase, or `Swipe` undo/redo when safety guards permit |
| **`NO_HAND`** | `landmarks === undefined` / `< 21` pts / `palmScale <= 1e-4` | Immediate **`KEYUP`**, ring buffer reset, phase carryover barrier cleared cleanly | Safe neutral |

---

## 2. Dataset-to-Label Mapping & Empirical Justification

| Dataset (DOI / License) | Upstream Classes | Assigned `R19` Target | Supervised in Train? | Visual & Quantitative Audit Justification |
|---|---|---|---|---|
| **HandGesture-5G** (`10.17632/wj25crzdbm.1`, `CC BY 4.0`) | `Pointing Up` (`284` uniq; `147` M3 det) | **`POINT_READY`** (`y=0`) | **Yes** (`cluster`-disjoint `train/val/test`, w/ `18<->19` val rebalance -> `104`+`104`+`94` train, `22` val, `21` test) | Contact sheet (`hg5g_samples_audit.jpg`) confirms index straight up with thumb folded tight across palm/index (`thumb_lateral p10..p90 = [0.498, 0.681, 0.889]`). Note `legacy_thumb_ratio` failed up to `2.122` p90 due to knuckle foreshortening. |
| **HandGesture-5G** (`wj25crzdbm.1`, `CC BY 4.0`) | `L-Sign` (`365` uniq; `234` M3 det) | **`POINT_PRESS`** (`y=1`) | **Yes** (`cluster`-disjoint, `88`+`88`+`20` train, `111` val [`iPhone 14 Pro Max` cross-device], `35` test) | Contact sheet confirms open-thumb Pistol L-shape across both palmar (`facing=+`) & dorsal/side (`facing=-`) views (`thumb_lateral p10..p90 = [1.851, 2.095, 2.369]`, completely disjoint from `Pointing Up`). |
| **HandGesture-5G** (`wj25crzdbm.1`, `CC BY 4.0`) | `Fist`, `V-Sign`, `Open Palm_Open Hand` | **`OTHER`** (`y=2`) | **Yes** (`577`+`577` train, `168` val, `174` test) | Clean canonical non-pistol shapes across Low / Correct / High exposure buckets (`846` exact CRC32 zip duplicates removed before clustering). |
| **Natural RGB Hand Gestures v3** (`10.17632/n66hhk695h.3`, `CC BY 4.0`) | `thumbs_up`, `thumbs_down`, `peace_sign`, `ok_sign`, `fist`, `stop`, `raised_hand`, `palm_down_push`, `wave`, `come_here`, `go` | **`OTHER`** (`y=2`) | **Yes** (`participant`-disjoint `19/4/3`: `3,947` train, `840` val, `888` test) | `11` verified negative gestures spanning `bright_daylight`, `indoor_moderate`, `dim`, `green_led`, `red_led`, `backlit` in both `hand_only` and `full_body` distances (`640x640 @ 30fps`). |
| **Natural RGB Hand Gestures v3** (`n66hhk695h.3`, `CC BY 4.0`) | `point_left`, `point_right` | **`AMBIGUOUS_CONVERSATIONAL_POINTING`** (**Held out from supervision**) | **No** (Dedicated out-of-sample audit slice) | Visual contact sheet (`point_samples_audit.jpg`) + quantitative stats prove unscripted conversational pointing has mixed thumb states: **`76.10%` of `point_left`** and **`81.16%` of `point_right`** have `thumb_lateral >= 1.3`, alongside flat/palm-like frames. Forcing either `POINT_READY` or `POINT_PRESS` corrupts supervision. |
| **IPN HandS** (`10.3390/app15116321`, `CC BY 4.0`) | `NOG`, `P2F`, `C2F`, `2C2`, `GRB`, `TUP`, `TDN`, `TLT`, `TRT`, `OP2`, `ZIN`, `ZOT` | **`OTHER`** (`y=2`) | **Yes** (`person`-disjoint `19/5/5`, strided in extraction & full-stream evaluated at test) | Continuous 30 Hz casual hand/idle/swipe/grab/zoom sequences anchoring dynamic `OTHER` stability (`0` phantom keydowns in idle `NOG`). |
| **IPN HandS** (`CC BY 4.0`) | `P1F`, `C1F`, `2C1` | **`AMBIGUOUS_CASUAL_1F`** (**Held out from supervision**) | **No** (Ablation `--p1f-trap` + full `test` seq evaluation) | IPN annotates 1-finger pointing regardless of thumb spread. As proven in our `--p1f-trap` ablation (`g5_p1f_trap`), conflating `P1F == POINT_PRESS` causes **`27.40%`** false `POINT_PRESS` on idle `NOG`, **`25.26%`** on `P2F`, and **`19.05%`** `POINT_READY -> POINT_PRESS` false triggers on `HandGesture-5G Pointing Up`. |
| **Mendeley `bxr7kx84y6.2` + `HANDS RGB-D ndrczc35bt.2`** (`CC BY 4.0`) | `DimLight`/`NaturalLight` + `Horiz_HBL/HBR/HFL/HFR`, `One`, `Two`, `Six`, `Five`, `TimeOut`, `Punch` | **`EVAL_ONLY`** (Zero training touch) | **No** | Independent out-of-domain negatives & real dorsal right-hand-pointing-left (`Horiz_HBL`) benchmark. |

---

## 3. Anti-Shortcut & Invariance Guarantees Discovered During Execution

1. **Removal of Screen-Scale Confounder (`hand_size -> thumb_over_index_reach`):**
   - Because `HandGesture-5G` close-up iPhone photos have `hand_size p10..p90 = [0.58, 0.77]` whereas `Natural RGB v3` (`full_body`) and `IPN HandS` have `[0.16, 0.52]`, an earlier prototype (`r18` `68`-dim `Ux3FeatureTracker` and initial `r19` with raw `hs`) learned `hand_size < 0.35 => OTHER` — achieving `99.98%` on `HandGesture-5G test` while collapsing to **`0/33` (`r19_v0`) and `2/33` (`G5_r18feat`) at webcam scale `0.22x`**.
   - Replacing `hand_size` with `thumb_over_index_reach` (`reaches[0] / max(0.25, reaches[1])`) yields **exact `82/82` mathematical invariance** (`max_diff = 1.577e-14` across 5 aspects × 3 scales) and restores **`33/33` (`100%`)** recall across every scale (`1.0x..0.22x`) and projected 16:9 rotation (`0°, 90°, 180°, -135°`).
2. **Removal of `has_history == 0` Confounder (`hg5g_static` + `hg5g_causal` + `hg5g_l1_clahe`):**
   - Adding deterministic causal steady-hold sequences (`has_history = 1` via tiny webcam tremor `±0.0018` in `TRAIN` only) and `320px CLAHE L1` landmarks in `TRAIN` prevents models from exploiting `has_history == 0` (static photo vs video stream), while keeping `VAL` and `TEST` 100% un-augmented raw landmarks.
3. **Coexistence Rules with Gesture Canvas & Menu Modes:**
   - **Erase (Five-finger palm):** Requires `isSafeEraseFrame` (`>= 4` frames) **AND** `hybridCls.subClass !== "pistol" && hybridCls.subClass !== "ready"` -> zero conflict with pointing.
   - **Pinch (Draw / Grab):** Requires `isSafePinchFrame` **AND** `hybridCls.state === "OTHER"` (`pinchSkeleton(0.05..0.25)` triggers 10/10 pinch with `0` false PRESS; `0.35..0.80` open gaps trigger `0` pinch and `0` false PRESS).
   - **Swipe (Undo/Redo):** Requires `hybridCls.state === "OTHER"` and `pOther >= 0.25`; two-finger `V-Sign`/`P2F` and closed `Fist` remain cleanly in `OTHER`.

---

## 4. Known Scope Gap (Explicitly Flagged)
- No public commercial-safe (`CC BY 4.0`) dataset contains natural continuous video transitions of **`POINT_READY <-> POINT_PRESS <-> POINT_RELEASE`** (e.g., thumb tapping repeatedly on a single fixed aiming vector). Frame classification is backed by held-out `CC BY 4.0` datasets; transition continuity (`100%` horizontal continuity, `1` jump per intent across `75/60/30/15 Hz`) is verified on **`SYNTHETIC`** kinematic suites + multi-condition browser `.y4m` playback, while real thumb-tap ergonomics await **`OWNER PHYSICAL WEBCAM TEST`** (`NOT_TESTED`).
