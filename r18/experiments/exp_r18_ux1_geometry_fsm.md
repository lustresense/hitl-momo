# Experiment R18-UX1 — Aspect Geometry, Pointing Intent, Virtual-Key FSM & Ownership

- **Test Types:** `UNIT_ONLY`, `SYNTHETIC`, `OFFLINE_DATASET` (`IPN HandS` person-disjoint splits)
- **Baseline:** `main` (`3ef4cc3685fc`) `GameplayGestureFilter`, `evaluateGameplayGesture`, `classifyHandPose`, `SwipeCommander`
- **Candidate File:** `r18/candidates/ux1_candidates.ts`
- **Script & Results:** `npx vite-node r18/scripts/r18_ux1_ab.ts` -> `r18/results/r18_ux1_ab.json` (executed against sandbox checkout at `repo/frontend/implementation`)

## Changes Evaluated
1. `indexPointAngleAspect(lm, aspect)` — scales `dx` by `aspect = w / h` (`F9` / `G03`).
2. `isPlausibleHandSkeleton(lm, aspect)` — normalized via `palmScale = max(dist(0,9), dist(5,17))` after discovering strict `knuckle/palmArea` thresholds dropped `~7.9%` of valid side-view pointing hands. Refined v2 bounds retain **`99.78%` VAL** (`118,938 / 119,205`) and **`99.60%` TEST** (`109,657 / 110,097`).
3. `isIntentionalPointing` (`P2_balanced`) — requires plausible skeleton, `projLen >= 0.22 * palmScale`, non-pinch separation, and extended index dominance (or `between` index only when `mid/ring/pinky` are `curled`).
4. `VirtualKeySteeringFSM` — `onPhaseChange()` `F10` neutral-rearm barrier, `50 ms` zone dwell (`66 ms` cross-axis opposite dwell), `J2_edge` jump firing once per raise and re-arming only after sustained non-jump (`>= 130 ms` outside `[40°, 140°]` so 1-frame flicker never causes double-jumps).
5. `SafeSwipeGuard`, `isSafeEraseFrame`, `isSafePinchFrame` — requires `220 ms` stillness pre-arm, `>= 2.0` `palmScale` travel, speed `>= 3.0 /s`, `straight >= 0.85` for swipe.

## Quantitative Summary (`r18/results/r18_ux1_ab.json`)
- **Multi-Aspect Numerical Accuracy (`21` test angles):** Max error reduced `6.34° (5:4)`, `8.13° (4:3)`, `16.22° (16:9 / 9:16)` -> **`0.00°`** everywhere.
- **Scenario Checks:** `F10` phase barrier `baseCarryoverMoved=true` vs `candCarryoverMoved=false` (moves after neutral); 30-frame held jump `j1=26` frames vs `j2=1` + `rearm=1`; `FaceAnchor` drop keeps player lock (`true/true`); deliberate Undo/Redo swipe fires at `330 ms`.
- **Locked Disjoint IPN TEST (`P2_balanced, 50ms` vs Baseline):**
  - `NOG`: active steer `57.99% -> 2.57%`, dir flips `6.04 -> 0/min`, jump triggers `18.09 -> 1.68/min`, erase `22.12% (base) / 15.6% (rev) -> 7.27%`.
  - `P2F`: steer `74.04% -> 1.42%`, false swipe `51 -> 15`. `GRB`/`OP2`/`TLT`/`TRT`/`TUP` false steer all cut to `0.28%–1.69%`.
  - `P1F`: `51.79%` active zone (`C1F` `65.97%`), `dir_flips = 0/min`, false Hapus `0.08%`, false swipe `106 -> 21` (`p50` activation delay `166.7 ms`).

## Residual Limitations
- Pure rules `SafeSwipeGuard` still yields `21` (`P1F`) / `15` (`P2F`) false triggers over `23+` minutes each when rapid pause-then-sweep kinematics mimic Undo/Redo.
- Dynamic `GRB` (`7.71%`), `OP2` (`11.09%`), and `TUP` (`19.85%`) still trigger rule-only Erase -> motivated R18-UX3 learned veto.
