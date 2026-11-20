# R22B — HandState Foundation, Canvas UX Recovery & v2.1 Telemetry Execution & QA Report

- **Governance & Candidate Packaging (Owner Decision 2026-11-20 WIB):** No remote code branches (`origin/r22-nui-lab` and `origin/r22b-handstate` deleted after migration). **`research-can` is the sole active branch.** Application code is published as deterministic Git patch candidates against `main@745bb6d840793dcab8558f65aef6bfac58807e79`:
  - **R22 Candidate (`r22-nui-lab`):** [`r22/candidates/r22-nui-lab/r22_main-745bb6d_to_1bb1a71.patch`](../../r22/candidates/r22-nui-lab/r22_main-745bb6d_to_1bb1a71.patch) (`1,368,922 B`, SHA-256 `5b88637ddcf9230c793e2d73cd12e56b42f9cb708015fda680d4fa86fb54fef1`, verified `git write-tree` = **`bed64432519e12fa42d927d5e5883df98df3a36c`**) + [`APPLY.md`](../../r22/candidates/r22-nui-lab/APPLY.md).
  - **R22B Cumulative DEV Candidate (`r22b-handstate`):** [`r22b/candidates/r22b-handstate/r22b_main-745bb6d_to_8f74db4.patch`](../candidates/r22b-handstate/r22b_main-745bb6d_to_8f74db4.patch) (`2,865,989 B`, SHA-256 `4d677b8f08a8fafb43071428564e6172f6a555ca1970535be9cb44da6e929f19`, verified `git write-tree` = **`16806cb23382a0655c040b3398903feeeaf0fe7b`**) + incremental review patch [`r22b_incremental_1bb1a71_to_8f74db4.patch`](../candidates/r22b-handstate/r22b_incremental_1bb1a71_to_8f74db4.patch) (`1,624,784 B`, SHA-256 `fd921befab295471f359d92dfe984fac4136c5f74d6fbe102e3952ad933edfad`) + [`APPLY.md`](../candidates/r22b-handstate/APPLY.md).
- **Local Snapshot Reference:** `8f74db42896fae6428b7050ad3ea092d0237a885` (`8f74db4`, local worktree `/srv/sketchbook/mediapipe-optimize/r22b-handstate` retained locally without remote branch push)
- **Primary Mandate:** [`docs/plan-rev/R22B/[WIP] 02_MANDAT_AGY_R22B.md`](../../docs/plan-rev/R22B/%5BWIP%5D%2002_MANDAT_AGY_R22B.md) (backed by [`01_BUKTI_DAN_PENALARAN_S970.md`](../../docs/plan-rev/R22B/01_BUKTI_DAN_PENALARAN_S970.md) & [`00_BACA_DULU.md`](../../docs/plan-rev/R22B/00_BACA_DULU.md))
- **App Version Badge (`B8.2`):** `0.29.1-alpha+r22b` (`NEXT_PUBLIC_GIT_BRANCH=research-can/r22b-handstate`, `NEXT_PUBLIC_GIT_COMMIT=<SHA research-can>`)
- **Student Gameplay / `src/input/**` Isolation:** `0` lines modified in `frontend/implementation/src/input/**`; detached-worktree verification from `main@745bb6d` confirmed **`23/23` files (`264/264` tests PASS)** on `npx vitest run tests/nui-lab tests/owner-build-manifest.test.ts` and **`39/48 PASS, 9/48 FAIL`** on legacy gameplay `tests/input/{hand-stroke-surface,two-hand-surface,eraser-controls}.test.ts` (identical to `main@745bb6d`).
- **Deployment Boundary:** Zero deployment, zero container restart, zero Cloudflare/public tunnel (`dev.momominum.tech` and `app.momominum.tech` untouched; Owner instructs Ujang to follow [`r22b/candidates/r22b-handstate/APPLY.md`](../candidates/r22b-handstate/APPLY.md)).

---

## 1. A9 Model & Swarm Execution Disclosure

| Role / Swarm Roster | Task Scope | Actual Model Used | Tier | Model Switch / Fallback Reason |
| --- | --- | --- | --- | --- |
| `coordinator` (Primary Implementer & QA Executor) | Contracts (`K3.1`, `K4 v1.1`, `K7`, `K8 v2.1`, `K11`), B1–B5, B7, B8 Vitest (`22/22` files, `260/260` tests), static build, Playwright live audit + fault injection | `Gemini 4 Neon (XHigh)` -> `Gemini 4 Argon (High)` | `T-STRONG` -> `T-HIGH` | Ran on `Gemini 4 Neon (XHigh)` for all implementation, Vitest, and Playwright audits until Neon quota reached `1%`; switched via `swarm(action: "model", model: "gemini-4-argon-high")` to `Gemini 4 Argon (High)` for final commit, build, and `research-can` publication. Zero Flash downgrade (`DOWNGRADED_MODEL = false`). |
| `r22b-reviewer` (Independent-Model Reviewer) | Independent code & QA audit across `action-resolver.ts`, `lab-stroke-driver.ts`, `lab-analyzer.ts`, `NuiLabPage.tsx`, `r20-lowlight.ts`, `schema.ts`, `analyze_r22b.py`, `build_r22b_dataset.py` | `Gemini 4 Hydrogen (XHigh)` | `T-STRONG` | Independent model family per §2.2; identified 4 concrete findings (B1.8 `allow-after-confirm` frame-2 distance bypass, B3 `analyze_r22b.py` `ev.data` vs `ev.detail` & `NO_HAND` scoring, B1.2 latched post-FIST onset guard, and metadata/validation hygiene) — all fixed and covered by unit tests prior to commit `8f74db4`. |

---

## 2. Workstream Status, Commit SHA, Files, Commands & Verified Metrics (§8)

### 2.1 Contracts (`K3.1`, `K4 v1.1`, `K5`, `K7`, `K8 v2.1`, `K11`)
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `R22_CONTRACTS_K1_K10.md` (§3 R22B Contract Upgrades)
  - `R22_HANDOFF_STATE.md` (§5 R22B Wave 1/Wave 2 handoff state)
  - `frontend/implementation/src/components/nui-lab/bench/presets.ts`
  - `frontend/implementation/src/components/nui-lab/bench/guided-capture-protocol.ts`
  - [`r22b/contracts/K4_v1.1_TAXONOMY.md`](../contracts/K4_v1.1_TAXONOMY.md)
- **Verification:** `npx tsc --noEmit` (`0` errors) + `tests/nui-lab/r22b-handstate.test.tsx` (`11/11 PASS`).

### 2.2 Workstream B1 — Canvas Logic, Fist-vs-Pinch Gate `G1'`, Hysteresis & Presets (`B1.1–B1.10`)
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/bench/action-resolver.ts`
  - `frontend/implementation/src/components/nui-lab/bench/lab-stroke-driver.ts`
  - `frontend/implementation/src/components/nui-lab/lab-analyzer.ts`
  - `frontend/implementation/tests/nui-lab/r22b-handstate.test.tsx`
  - `frontend/implementation/tests/fixtures/s970_t004_handstate_weaklabels_v1.json`
  - `frontend/implementation/tests/fixtures/s970-t002-landmark-replay-v1.json`
- **Verification Commands:**
  - `python3 -I docs/plan-rev/R22B/eval_fist_pinch_gate.py docs/plan-rev/R22B/s970_t004_handstate_weaklabels_v1.json` (`exit 0`)
  - `python3 r22b/scripts/eval_r22b_baselines.py` -> [`r22b/results/r22b_b0_vs_b1_baseline.json`](r22b_b0_vs_b1_baseline.json)
  - `npx vitest run tests/nui-lab/r22b-handstate.test.tsx tests/nui-lab/r22-t004-replay.test.ts` (`24/24 PASS`)
- **Measured Metrics (`weak-s970-t004-v1`, `996` frames, `WEAK_REGRESSION_ONLY_NOT_DATASET_GT`, verbatim from [`r22b_b0_vs_b1_baseline.json`](r22b_b0_vs_b1_baseline.json)):**

| Bucket (`weak-s970-t004-v1`) | Frames | `B0` (R22 Legacy Heuristic) | `B1` (`R22B G1'` Gate) | Target / Role | Status |
| --- | --- | --- | --- | --- | --- |
| `S-970f4cb0-T002:FIST_OR_TRANSITION/NOT_PINCH/None` | `13` | `13 / 13` (`100.0%` false pinch) | **`0 / 13` (`0.0%` — `13/13` blocked)** | Block `13/13` false fist pinch | **PASS** |
| `S-970f4cb0-T002:FIST/NONE/None` | `44` | `0 / 44` (`0.0%`) | **`0 / 44` (`0.0%`)** | `0` false pinch | **PASS** |
| `S-970f4cb0-T002:PINCH/TOUCH/CLOSED` | `303` | `303 / 303` (`100.0%`) | **`299 / 303` (`98.68%`)** | Preserve `>= 98%` CLOSED pinch | **PASS** |
| `S-970f4cb0-T002:PINCH/TOUCH/OK` | `103` | `103 / 103` (`100.0%`) | **`103 / 103` (`100.0%`)** | Preserve `100%` OK pinch | **PASS** |
| `S-970f4cb0-T002:PINCH/TOUCH/None` | `29` | `29 / 29` (`100.0%`) | **`24 / 29` (`82.76%`)** | Ambiguous pinch frames | **OBSERVED** |
| `S-07ba0cde-T004:PINCH/TOUCH/CLOSED` | `198` | `198 / 198` (`100.0%`) | **`198 / 198` (`100.0%`)** | Cross-device T004 recall | **PASS** |
| `S-07ba0cde-T004:PINCH/TOUCH/None` | `6` | `6 / 6` (`100.0%`) | **`6 / 6` (`100.0%`)** | Total T004 pinch = `204/204` (`100.0%`) | **PASS** |
| `S-970f4cb0-T002:FIVE/OPEN/None` / `ONE/OPEN/None` / `TRANSITION/NOT_PINCH/None` | `186` / `110` / `4` | `0` / `0` / `0` | **`0` / `0` / `0`** | `0` false pinch | **PASS** |

- **Landmark Replay & Behavioral Unit Gates (`r22b-handstate.test.tsx`, `11/11 PASS`):**
  - Full `s970-t002-landmark-replay-v1.json` (`1,685` frames): **`0` `STROKE_START`** inside `undoWindowMs [155800, 168000]`, **`>= 5` `UNDO`** preceded by `ARMED_FIST`, and all 8 long strokes preserved.
  - 2-frame onset confirmation + onset point backfill (`LabStrokeDriver`), latched `>= 300 ms` post-`FIST`/FSM onset guard, `>= 150 ms` release debounce + `PINCH_RELEASE_BRIDGED` + retro-trim, `<= 100 ms` fist flicker tolerance, strict `FIVE` (`B1.5`), smoothed pinch variant (`OK` vs `CLOSED`), `reacquirePinchPolicy` (`require-release` default vs `allow-after-confirm` with frozen `lastLostTipNorm <= 0.12`), and all 5 K11 presets (`default-any-pinch`, `ok-pinch-only`, `closed-pinch-only`, `three-imr-action`, `three-mrp-vs-ok`).

### 2.3 Workstream B2 — Canvas UI/UX Recovery, Stale Guard, Presets, Guided Capture & Local Raw Recorder (`B2.1–B2.8`)
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/NuiLabPage.tsx` & `NuiLabPage.css`
  - `frontend/implementation/app/nui-lab/page.tsx`
  - `frontend/implementation/src/components/nui-lab/bench/GuidedCapturePanel.tsx`
  - `frontend/implementation/src/components/nui-lab/bench/RawVideoRecorder.tsx`
- **Measured Metrics (`BROWSER_SIMULATED_VIDEO` using `/tmp/r22_real_hand_15fps.y4m` via [`r22b/scripts/run_r22b_qa_audit.mjs`](../scripts/run_r22b_qa_audit.mjs) -> [`r22b_live_qa_and_perf_audit.json`](r22b_live_qa_and_perf_audit.json)):**
  - **B2.1 / B8.3 Stale Banner & Non-Blanking Skeleton Overlay (`faultInjectionB21.pass = true`):** Injected `750 ms` worker stall on `/nui-lab/canvas`:
    - `beforeStall`: `bannerVisible = false`, `overlayNonZeroAlphaPixels = 6473`.
    - `duringStall`: `bannerVisible = true`, `bannerText = "Kamera tersendat (594 ms tanpa hasil baru)"`, `overlayDataStale = true`, **`overlayNonZeroAlphaPixels = 6473`** (skeleton overlay preserved, never blanked).
    - `afterRecovery`: `bannerVisible = false`, `overlayDataStale = false`, `overlayNonZeroAlphaPixels = 6556`.
  - **B2.2 Command Pill Expiry:** `lastCommand` expires automatically after `1,500 ms` or after `> 300 ms` of `NO_HAND`.
  - **B2.3 Compositional HUD:** Displays `Kontak / Varian / Jari` + warning badge `"Ditahan: mirip kepal"` whenever pinch onset is blocked by `G1'`.
  - **B2.4 Preset Selector:** All 5 K11 presets (`default-any-pinch`, `ok-pinch-only`, `closed-pinch-only`, `three-imr-action`, `three-mrp-vs-ok`) selectable via dropdown or `?preset=` URL query (`inspectPresetRiskFlags` enabled).
  - **B2.5 Guided Capture (`?capture=1`):** Supports `p1-full` (`100` steps) and `p2-short`, audio/visual cues, `700 ms` post-cue start mask and `300 ms` pre-end mask (`truthMasked: true`), and `truthMasked` exclusion from live `TrialAggregator` confusion matrix.
  - **B2.6 Local Raw Video Recorder (`?rawrec=1`):** Separate explicit checkbox consent, local-only WebM download (`362,056 B`, `video/webm;codecs=vp8`, `104` frames), zero network upload, and `mpMs` `p50 = 66.25 ms / p95 = 79.76 ms` vs baseline `p50 = 66.90 ms / p95 = 79.13 ms` (**`deltaMpMsP50 = -0.65 ms`, `deltaMpMsP95 = +0.63 ms` / `+0.8%` -> `PASS <= +15%`**).

### 2.4 Workstream B3 — Benchmark Schema `nui-lab-bench-export/2.1` & `analyze_r22b.py`
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/bench/{schema.ts,stats.ts,manager.ts,export.ts,canvas-tracker.ts,lab-recorder.ts}`
  - [`r22b/scripts/analyze_r22b.py`](../scripts/analyze_r22b.py)
- **Verification:**
  - Verified on live browser export (`analyzerLiveCheck`: `schemaVersion = "nui-lab-bench-export/2.1"`, `checksum.ok = true`, `S-afb47c30-T001`, `detectorConfig`, `presetId`, `reacquirePinchPolicy`) and synthetic v2.1 unit verification (`--session rev2`, `onsetBlockedByReason == {"blocked-by-g1-prime": 1}`, `undoSuccessRate == 1.0`, `NO_HAND` recall `== 1.0`, `staticClassAccuracy == 1.0`).
  - Supports v1/v2/v2.1 exports, `--session` filter, time-based & frame-based active-window miss rate, lost episodes `> 500 ms` & `> 1,000 ms`, event breakdown (`PINCH_ONSET_BLOCKED`, `PINCH_ONSET_CONFIRMED`, `PINCH_RELEASE_BRIDGED`, `UNDO/REDO` `changed`, `THREE_ACTION`), and strict unmasked `DATASET_GT` evaluation.

### 2.5 Workstream B4 — MediaPipe Confidence Experiment (`?mdc=&mpc=&mtc=`)
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/bench/{config.ts,env.ts,r20-hand.worker.ts,r20-worker-client.ts}`
- **Measured Metrics (`BROWSER_SIMULATED_VIDEO`, headless Chromium `--disable-gpu`, `/tmp/r22_real_hand_15fps.y4m`):**

| Profile | URL Query | `minDetectionConfidence` | `minPresenceConfidence` | `minTrackingConfidence` | Frames (`handFrames`) | Runtime `setOptions` Calls | `mpMs` `p50 / p95` | `pipelineMs` `p50 / p95` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Default (`R22/R22B`) | `/nui-lab/canvas` | `0.60` | `0.45` | `0.45` | `98` (`98`) | **`0`** (init-only) | `66.90 / 79.13 ms` | `68.85 / 80.86 ms` |
| Low Confidence (`B4.3`) | `/nui-lab/canvas?mdc=0.5&mpc=0.35&mtc=0.35` | `0.50` | `0.35` | `0.35` | `97` (`97`) | **`0`** (init-only) | `66.80 / 80.18 ms` | `68.90 / 82.44 ms` |

*Note:* Per-frame `mpRawHandCount` (`hasMpRawHandCount: true`) and `mpHandednessScores[]` (`handednessScoreFrames: 98/98` and `97/97`) are exported in `nui-lab-bench-export/2.1`. Physical webcam backlight/glare comparison remains **`NOT_TESTED (menunggu Owner)`**.

### 2.6 Workstream B5 & B6 — K4 v1.1 Taxonomy, Registry, 94D Dataset Builder & Model Baselines
- **Added Files (`research-can`):**
  - [`r22b/contracts/K4_v1.1_TAXONOMY.md`](../contracts/K4_v1.1_TAXONOMY.md)
  - [`r22b/registry/dataset_registry_r22b.json`](../registry/dataset_registry_r22b.json) (`weak-s970-t004-v1` `frameCount: 996`; `s970-t002-landmark-replay-v1` `frameCount: 1685`; `guided-capture-p1-v1` & `guided-capture-p2-v1` marked `PENDING_OWNER_CAPTURE`)
  - [`r22b/scripts/build_r22b_dataset.py`](../scripts/build_r22b_dataset.py) (94D feature extraction: 82D R20 + 12D `G1'`/pinch-variant features; drops `truthMasked == true` and any non-`DATASET_GT` rows; `<= 5 Hz` static hold subsampling; emits `PERSON_HELD_OUT = NOT_AVAILABLE` when single-person)
  - [`r22b/scripts/eval_r22b_baselines.py`](../scripts/eval_r22b_baselines.py) & [`r22b/results/r22b_b0_vs_b1_baseline.json`](r22b_b0_vs_b1_baseline.json)
- **Wave 2 Status (`B5.2–B5.4` & `B6.2–B6.4`):**
  - In strict compliance with **Mandate §1 & B6** (*"Melatih model dengan label `RULE_DERIVED` sebagai kebenaran dilarang"*), `M1`, `M1x`, and `M2` are **`NOT_TESTED (menunggu Owner guided-capture DATASET_GT)`**.

### 2.7 Workstream B7 — Lowlight/Backlight Diagnostic Upgrade, `?camdev=1` & Offline Replay Harness
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/bench/r20-lowlight.ts`
  - `frontend/implementation/src/components/nui-lab/bench/CamDevPanel.tsx`
  - [`r22b/scripts/replay_lowlight_offline.mjs`](../scripts/replay_lowlight_offline.mjs)
- **Recalibrated Diagnostics (`B7.1`, verbatim from `r20-lowlight.ts`):**
  - Added `clippedPct` (`luma >= 0.96`, byte `>= 245`), `handRoiLumaP50`, and `lastRoiLumaP50` (last known hand ROI expanded `x1.5` on lost frames).
  - Recalibrated `backlightCandidate`: `clippedPct >= 8.0` (`R22B_BACKLIGHT_CLIPPED_MIN_PCT`) paired with dark hand ROI (`handRoiLumaP50 <= 0.35 || lastRoiLumaP50 <= 0.35`, `R22B_BACKLIGHT_ROI_LUMA_MAX`).
  - Recalibrated `GLARE_CANDIDATE` threshold (`R22_GLARE_NEAR_WHITE_WARN_PCT`) from `8.0%` to **`25.0%`** to eliminate the `~99%` false glare spam observed in R22.
  - **Existing Test Modification Disclosure (§2.4):** Updated 1 line in `frontend/implementation/tests/nui-lab/bench-recorder.test.ts:509` (`nearWhiteHandPct: 11.4 -> 28.4`) so the existing glare candidate test reflects the mandated B7.1 `>= 25%` threshold.

### 2.8 Workstream B8 — Quality Gates, Live Browser QA & Fault Injection
- **Automated Quality Gates (`r22b-handstate@8f74db4`):**
  - `npx tsc --noEmit`: **`0` errors (`PASS`)**
  - `npm run lint`: **`0` errors (`PASS`)**
  - NUI Lab Vitest suite (`22` test files): **`22/22` files PASS (`260/260` tests PASS)**
  - Legacy input/gameplay suite (`tests/input/{hand-stroke-surface,two-hand-surface,eraser-controls}.test.ts`): **`39/48 PASS, 9/48 FAIL`** (0 regressions vs `main@745bb6d` and `r22-nui-lab@1bb1a71`)
  - `git diff 1bb1a71 -- frontend/implementation/src/input`: **`0` lines (`PASS`)**
  - `npm run build` (`NEXT_PUBLIC_TEST_HOOKS=0`, `NEXT_PUBLIC_APP_VERSION=0.29.1-alpha+r22b`, `NEXT_PUBLIC_GIT_BRANCH=r22b-handstate`, `NEXT_PUBLIC_GIT_COMMIT=8f74db42896fae6428b7050ad3ea092d0237a885`): **`24/24` static pages exported (`PASS`)**, `out/nui-lab.html` verified containing `0.29.1-alpha+r22b`.
  - Live Headless Chromium (`--disable-gpu`) Audit across 5 routes (`/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/canvas?preset=ok-pinch-only`, `/nui-lab/canvas?capture=1&rawrec=1&camdev=1`): **`0` page errors, `0` hydration errors (`PASS`)**.

---

## 3. Dependency Board (§3) & User Acceptance Gates `U1–U8` (§6)

### 3.1 Dependency Board (§3)

| ID | Block | Status | Evidence / Notes |
| --- | --- | --- | --- |
| `K3.1, K4 v1.1, K7, K8 v2.1, K11` | Contract Upgrades | **DONE (`PASS`)** | `R22_CONTRACTS_K1_K10.md`, `presets.ts`, `guided-capture-protocol.ts`, `K4_v1.1_TAXONOMY.md` |
| `B1 (1..10)` | `G1'` Gate + Hysteresis + Strict `FIVE` + Reacquire + Presets | **DONE (`PASS`)** | `13/13` S-970 `FIST_OR_TRANSITION` blocked, `299/303` (`98.68%`) CLOSED, `103/103` (`100%`) OK, `204/204` (`100%`) T004 |
| `B2 (1..8)` | Canvas UX Recovery + Stale Banner + HUD + Guided Capture + RawRec | **DONE (`PASS`)** | Verified in Vitest (`11/11`) + live Playwright fault injection (`6,473` overlay px preserved during `594 ms` stall) |
| `B3 (1..3)` | Schema `nui-lab-bench-export/2.1` + `analyze_r22b.py` | **DONE (`PASS`)** | Verified on live v2.1 export (`checksum.ok = true`) + `--session` + unmasked `DATASET_GT` (`NO_HAND` included) |
| `B4 (1..3)` | MediaPipe Init-Only Confidence `?mdc=&mpc=&mtc=` | **DONE (`PASS` simulated; `NOT_TESTED` physical)** | `0` runtime `setOptions` calls; `mpMs p50 = 66.80 ms` vs `66.90 ms` default |
| `B5.1` | Taxonomy + `dataset_registry_r22b.json` + `build_r22b_dataset.py` | **DONE (`PASS`)** | 94D builder ready; strictly filters `DATASET_GT` & `!truthMasked` |
| `B5.2–B5.4` | Guided Capture Dataset Freeze (`guided-capture-p1-v1`, `p2-v1`) | **`NOT_TESTED (menunggu Owner)`** | Requires Owner physical webcam capture via `/nui-lab/canvas?bench=1&capture=1` |
| `B6.1` | Baselines `B0` vs `B1` on `weak-s970-t004-v1` | **DONE (`PASS`)** | [`r22b/results/r22b_b0_vs_b1_baseline.json`](r22b_b0_vs_b1_baseline.json) |
| `B6.2–B6.4` | Trained Heads `M1`, `M1x`, `M2` & Runtime Adoption Gate | **`NOT_TESTED (menunggu Owner)`** | Blocked on `B5.2` real `DATASET_GT` (training on `RULE_DERIVED` is forbidden) |
| `B7.1–B7.2` | Recalibrated Backlight/Glare Diagnostics + `?camdev=1` + Replay Harness | **DONE (`PASS`)** | `r20-lowlight.ts`, `CamDevPanel.tsx`, `replay_lowlight_offline.mjs` |
| `B7.3–B7.5` | Offline Lowlight Replay on Owner Local `?rawrec=1` WebM Clips | **`NOT_TESTED (menunggu Owner)`** | Harness ready; requires Owner local backlight/dim `.webm` clips |
| `B8` | Automated QA, Fault Injection, Independent Review & Handoff | **DONE (`PASS`)** | `260/260` NUI Lab tests PASS, `0` hydration errors, independent review findings fixed |

### 3.2 User Acceptance Tests `U1–U8` (§6)

| Gate | Description | Offline / Simulated Browser Evidence | Live Physical Webcam Status |
| --- | --- | --- | --- |
| **`U1`** | `FIST` tidak menggambar (`0` false stroke dari `20` kepalan) | **PASS (`OFFLINE_DATASET` + `UNIT_ONLY`):** `13/13` S-970 `FIST_OR_TRANSITION` & `44/44` `FIST` blocked by `G1'`; `0` `STROKE_START` in `undoWindowMs [155800, 168000]` on `s970-t002-landmark-replay-v1.json` | **`NOT_TESTED (menunggu Owner)`** |
| **`U2`** | Undo (`FIST -> ONE -> FIST`) `>= 8/10` berhasil, `0` titik palsu | **PASS (`OFFLINE_DATASET` + `UNIT_ONLY`):** `>= 5` `UNDO` preceded by `ARMED_FIST` & `0` strokes in S-970 replay; latched `300 ms` post-FIST guard unit-tested | **`NOT_TESTED (menunggu Owner)`** |
| **`U3`** | Redo (`FIST -> TWO -> FIST`) `>= 8/10` berhasil, `0` titik palsu | **PASS (`UNIT_ONLY`):** Redo sequence verified with `0` accidental strokes | **`NOT_TESTED (menunggu Owner)`** |
| **`U4`** | Goresan cepat dan lambat (`10` garis normal + `5` lingkaran, `0` putus palsu) | **PASS (`OFFLINE_DATASET` + `UNIT_ONLY`):** `299/303` (`98.68%`) S-970 CLOSED, `103/103` (`100%`) S-970 OK, `204/204` (`100%`) T004 pinch; `<= 150 ms` blink bridged (`PINCH_RELEASE_BRIDGED`) + onset backfill & release retro-trim | **`NOT_TESTED (menunggu Owner)`** |
| **`U5`** | Tangan santai (`FIVE_RELAXED`) tidak clear/reset (`0` false clear) | **PASS (`UNIT_ONLY`):** Strict `FIVE` (`B1.5`) verified in `r22b-handstate.test.tsx` (`0` false `FIVE` on relaxed open hand) | **`NOT_TESTED (menunggu Owner)`** |
| **`U6`** | Kamera silau / backlight (`active-window miss <= 15%`, `0` lost `> 1s`) | **PASS (`BROWSER_SIMULATED_VIDEO` diagnostics/UI):** `clippedPct >= 8%` + `handRoiLumaP50/lastRoiLumaP50 <= 0.35`, `GLARE_CANDIDATE >= 25%`, `> 3s` backlight tip card, `?mdc=0.5&mpc=0.35&mtc=0.35`, and `?camdev=1` ready | **`NOT_TESTED (menunggu Owner)`** |
| **`U7`** | Preset alternatif (`P1..P5`) dapat dipilih tanpa reload | **PASS (`UNIT_ONLY` + `BROWSER_SIMULATED_VIDEO`):** All 5 K11 presets (`default-any-pinch`, `ok-pinch-only`, `closed-pinch-only`, `three-imr-action`, `three-mrp-vs-ok`) + `THREE_ACTION` verified | **`NOT_TESTED (menunggu Owner)`** |
| **`U8`** | Stabilitas UI (`0` blank skeleton saat frame lambat, `0` hydration error, pill reset `<= 1.5s`) | **PASS (`BROWSER_SIMULATED_VIDEO` + `FAULT_INJECTION`):** `0` page/hydration errors across 5 routes; `750 ms` worker stall preserved `6,473` skeleton pixels while showing `"Kamera tersendat (594 ms tanpa hasil baru)"`; pill auto-resets at `1.5s` / `300ms` hand loss | **PASS (`BROWSER_SIMULATED_VIDEO`)** |
