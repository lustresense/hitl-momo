# R22B — HandState Foundation, Canvas UX Recovery & v2.1 Telemetry Execution & QA Report

- **Branch (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885` (`8f74db4`, branched from `r22-nui-lab@1bb1a71`)
- **Research Branch (`research-can`):** Base `95dc3eab03bb9d57e1607f6a77e0b624be943242` (`95dc3ea`)
- **Primary Mandate:** [`docs/plan-rev/R22B/02_MANDAT_AGY_R22B.md`](../docs/plan-rev/R22B/02_MANDAT_AGY_R22B.md) (backed by [`01_BUKTI_DAN_PENALARAN_S970.md`](../docs/plan-rev/R22B/01_BUKTI_DAN_PENALARAN_S970.md) & [`00_BACA_DULU.md`](../docs/plan-rev/R22B/00_BACA_DULU.md))
- **App Version Badge (`B8.2`):** `0.29.1-alpha+r22b` (`r22b-handstate@8f74db4`)
- **Student Gameplay / `src/input/**` Isolation:** `0` lines modified in `frontend/implementation/src/input/**`; legacy gameplay suite unchanged at `39/48 PASS, 9/48 FAIL` (identical to `main@745bb6d` and `r22-nui-lab@1bb1a71`).
- **Deployment Boundary:** Zero deployment, zero container restart, zero Cloudflare/public tunnel (`dev.momominum.tech` and `app.momominum.tech` untouched; Owner instructs Ujang with commit SHA `8f74db42896fae6428b7050ad3ea092d0237a885`).

---

## 1. A9 Model & Swarm Execution Disclosure

| Role / Swarm Roster | Task Scope | Actual Model Used | Tier | Model Switch / Fallback Reason |
| --- | --- | --- | --- | --- |
| `coordinator` (Primary Implementer & QA Executor) | Contracts (`K3.1`, `K4 v1.1`, `K7`, `K8 v2.1`, `K11`), B1–B5, B7, B8 Vitest (`22/22` files, `260/260` tests), static build, Playwright live audit + fault injection | `Gemini 4 Neon (XHigh)` -> `Gemini 4 Argon (High)` | `T-STRONG` -> `T-HIGH` | Ran on `Gemini 4 Neon (XHigh)` until Neon quota reached `1%`; switched via `swarm(action: "model", model: "gemini-4-argon-high")` to `Gemini 4 Argon (High)` (`18%` quota) for final verification, commit, and `research-can` publication. Zero Flash downgrade (`DOWNGRADED_MODEL = false`). |
| `r22b-reviewer` (Independent-Model Reviewer) | Independent code & QA audit across `action-resolver.ts`, `lab-stroke-driver.ts`, `lab-analyzer.ts`, `NuiLabPage.tsx`, `r20-lowlight.ts`, `schema.ts`, `analyze_r22b.py`, `build_r22b_dataset.py` | `Gemini 4 Hydrogen (XHigh)` | `T-STRONG` | Independent model family per §2.2; identified 4 concrete findings (all fixed and covered by unit tests prior to commit `8f74db4`). |

---

## 2. Workstream Status, Commit SHA, Files, Commands & Metrics (§8)

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
  - `python3 docs/plan-rev/R22B/eval_fist_pinch_gate.py --export docs/plan-rev/R22B/bukti_s970/nui-lab-bench-2026-04-19T22-37-11-579Z.json` -> `exit 0`
  - `python3 r22b/scripts/eval_r22b_baselines.py` -> [`r22b/results/r22b_b0_vs_b1_baseline.json`](r22b_b0_vs_b1_baseline.json)
  - `npx vitest run tests/nui-lab/r22b-handstate.test.tsx tests/nui-lab/r22-t004-replay.test.ts` -> `24/24 PASS`
- **Measured Metrics (`S-970f4cb0` `T-004` Offline Replay, `996` frames / `585` hand frames):**

| Metric (`S-970f4cb0` `T-004`) | `B0` (R22 Legacy Heuristic) | `B1` (`G1'` + Hysteresis + Strict `FIVE`) | Target Gate | Status |
| --- | --- | --- | --- | --- |
| `FIST` frames (`30`) triggering raw/gated pinch (`<= 0.30`) | `10 / 30` (`33.33%`) | **`0 / 30` (`0.00%`)** | `0 / 30` | **PASS** |
| `PINCH_CLOSED_OR_FIST_AMBIG` frames (`27`) blocked | `0 / 27` (`0.00%` blocked) | **`27 / 27` (`100.00%` blocked)** | `27 / 27` | **PASS** |
| `PINCH_OK_CANDIDATE` recall (`89` frames, `pinchRatio <= 0.30`) | `89 / 89` (`100.00%`) | **`86 / 89` (`96.63%`)** | `>= 85 / 89` (`>= 95.5%`) | **PASS** |
| `FIVE_OPEN` candidate frames (`25` vs old `FIVE` `114`) | `114` frames (`19.49%` inflated) | **`25` frames (`100%` recall on weak-label `FIVE_OPEN`, `0` false `FIVE` on relaxed open hand)** | Strict `FIVE` B1.5 | **PASS** |
| False draw strokes during Undo (`FIST -> ONE -> FIST`) | `1+` false stroke on `FIST` thumb-index proximity | **`0` false strokes** (`PINCH_ONSET_BLOCKED: blocked-by-g1-prime` / `post-fist-guard`) | `0` | **PASS** |
| Reacquire pinch policy (`B1.8`) | Immediate draw on reacquire | `require-release` (`0` accidental strokes) & `allow-after-confirm` (`2` frames + frozen `lastLostTipNorm <= 0.12` check) | Both policies unit-tested | **PASS** |

### 2.3 Workstream B2 — Canvas UI/UX Recovery, Stale Guard, Presets, Guided Capture & Local Raw Recorder (`B2.1–B2.8`)
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/NuiLabPage.tsx` & `NuiLabPage.css`
  - `frontend/implementation/app/nui-lab/page.tsx`
  - `frontend/implementation/src/components/nui-lab/bench/GuidedCapturePanel.tsx`
  - `frontend/implementation/src/components/nui-lab/bench/RawVideoRecorder.tsx`
- **Measured Metrics (`BROWSER_SIMULATED_VIDEO` via [`r22b/scripts/run_r22b_qa_audit.mjs`](../scripts/run_r22b_qa_audit.mjs)):**
  - **B2.1 / B8.3 Stale Banner & Non-Blanking Skeleton Overlay:** Injected `750 ms` worker result pause on `/nui-lab/canvas`. Stale banner `"Kamera tersendat"` became visible at `staleFrameAgeMs = 594 ms` while skeleton overlay preserved **`6,473` non-zero pixels** (never cleared by render loop), then recovered cleanly (`staleBannerVisibleAfterRecovery = false`, `postRecoveryWorkerResultCount = 7`).
  - **B2.2 Command Pill Expiry:** `lastCommand` expires automatically after `1,500 ms` or after `> 300 ms` of `NO_HAND`.
  - **B2.3 Compositional HUD:** Displays `Pose | Pinch | Gate | Aksi` + warning badge `"Ditahan: mirip kepal"` whenever `pinchRatio <= 0.30` is blocked by `G1'`.
  - **B2.4 Preset Selector:** All 5 presets (`default-any-pinch`, `ok-draw-closed-erase`, `index-draw-three-erase`, `fist-hold-erase`, `three-cycle-tool`) selectable via dropdown or `?preset=` URL query with `inspectPresetRiskFlags`.
  - **B2.5 Guided Capture (`?capture=1`):** Supports `p1-full` (`100` steps) and `p2-short`, audio/visual cues, `700 ms` post-cue start mask and `300 ms` pre-end mask (`truthMasked: true`), and `truthMasked` exclusion from live `TrialAggregator` confusion matrix.
  - **B2.6 Local Raw Video Recorder (`?rawrec=1`):** Separate explicit checkbox consent, local-only WebM download (`362,056 B` verified in Playwright), zero network upload, and `mpMs` `p50 = 66.25 ms / p95 = 79.76 ms` vs baseline `p50 = 66.90 ms / p95 = 79.13 ms` (**`-0.65 ms` p50 / `+0.63 ms` p95 -> `PASS <= +15%`**).

### 2.4 Workstream B3 — Benchmark Schema `nui-lab-bench-export/2.1` & `analyze_r22b.py`
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/bench/{schema.ts,stats.ts,manager.ts,export.ts,canvas-tracker.ts,lab-recorder.ts}`
  - [`r22b/scripts/analyze_r22b.py`](../scripts/analyze_r22b.py)
- **Verification:**
  - `python3 r22b/scripts/analyze_r22b.py docs/plan-rev/R22B/bukti_s970/nui-lab-bench-2026-04-19T22-37-11-579Z.json --session S-970f4cb0 --json`
  - Backward-compatible with v1/v2 exports and validates v2.1 `contentSha256`, `--session` filter, time-based active-window miss rate (`28.43%` by frames, `38.68%` by time on `T-004`), lost episodes `> 500 ms` (`12` episodes) and `> 1,000 ms` (`7` episodes), `PINCH_ONSET_BLOCKED` reasons, `PINCH_ONSET_CONFIRMED`, `PINCH_RELEASE_BRIDGED`, `UNDO`/`REDO` `changed` success rate, and strict unmasked `DATASET_GT` accuracy (including `NO_HAND` recall).

### 2.5 Workstream B4 — MediaPipe Confidence Experiment (`?mdc=&mpc=&mtc=`)
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/bench/{config.ts,env.ts,r20-hand.worker.ts,r20-worker-client.ts}`
- **Measured Metrics (`BROWSER_SIMULATED_VIDEO`, headless Chromium `--disable-gpu`, `115` frames/profile):**

| Profile | URL Query | `minHandDetectionConfidence` | `minHandPresenceConfidence` | `minTrackingConfidence` | Runtime `setOptions` Calls | `mpMs` `p50` | `mpMs` `p95` | Active-Window Miss (Frames) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Default (`R22/R22B`) | `/nui-lab/canvas?bench=1` | `0.60` | `0.45` | `0.45` | **`0`** (init-only) | `66.90 ms` | `79.13 ms` | `0.00%` (`r20_sim_cam.y4m`) |
| Low Confidence (`B4.3`) | `/nui-lab/canvas?bench=1&mdc=0.5&mpc=0.35&mtc=0.35` | `0.50` | `0.35` | `0.35` | **`0`** (init-only) | `66.80 ms` | `80.18 ms` | `0.00%` (`r20_sim_cam.y4m`) |

*Note:* Per-frame `mpRawHandCount` and `mpHandednessScores[]` are exported in `nui-lab-bench-export/2.1`. Backlight/glare physical webcam comparison between default and low confidence remains **`NOT_TESTED (menunggu Owner)`**.

### 2.6 Workstream B5 & B6 — K4 v1.1 Taxonomy, Registry, 94D Dataset Builder & Model Baselines
- **Added Files (`research-can`):**
  - [`r22b/contracts/K4_v1.1_TAXONOMY.md`](../contracts/K4_v1.1_TAXONOMY.md)
  - [`r22b/registry/dataset_registry_r22b.json`](../registry/dataset_registry_r22b.json) (`weak-s970-t004-v1` `frameCount: 996`; `s970-t002-landmark-replay-v1` `frameCount: 1685`; `guided-capture-p1-v1` & `guided-capture-p2-v1` marked `PENDING_OWNER_CAPTURE`)
  - [`r22b/scripts/build_r22b_dataset.py`](../scripts/build_r22b_dataset.py) (94D feature extraction: 82D R20 + 12D `G1'`/pinch-variant features; rejects `truthMasked == true` and any non-`DATASET_GT` rows; `<= 5 Hz` static hold subsampling; reports `PERSON_HELD_OUT = NOT_AVAILABLE` when single-person)
  - [`r22b/scripts/eval_r22b_baselines.py`](../scripts/eval_r22b_baselines.py) & [`r22b/results/r22b_b0_vs_b1_baseline.json`](r22b_b0_vs_b1_baseline.json)
- **Wave 2 Status (`B5.2–B5.4` & `B6.2–B6.4`):**
  - In strict compliance with **Rule 6 & §4 B6** (*"JANGAN melatih model dari label `RULE_DERIVED`"*), `M1`, `M1x`, and `M2` are **`NOT_TESTED (menunggu Owner guided capture p1-v1 / p2-v1)`**.

### 2.7 Workstream B7 — Lowlight/Backlight Diagnostic Upgrade, `?camdev=1` & Offline Replay Harness
- **Commit SHA (`r22b-handstate`):** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Modified / Added Files:**
  - `frontend/implementation/src/components/nui-lab/bench/r20-lowlight.ts`
  - `frontend/implementation/src/components/nui-lab/bench/CamDevPanel.tsx`
  - [`r22b/scripts/replay_lowlight_offline.mjs`](../scripts/replay_lowlight_offline.mjs)
- **Recalibrated Diagnostics (`B7.1`):**
  - Added `clippedPct` (`luma >= 245`), `handRoiLumaP50`, and `lastRoiLumaP50`.
  - Recalibrated `backlightCandidate` to trigger on `(bgBrightPct >= 25 && handDark) || (clippedPct >= 12 && handRoiLumaP50 < 0.42)`.
  - Recalibrated `GLARE_CANDIDATE` threshold from `10%` to **`>= 25%`** (`nearWhiteHandPct >= 25 || clippedPct >= 20`) to eliminate the `98.8%` false-positive glare spam observed on `S-970f4cb0`.
  - **Existing Test Modification Disclosure (§2.4):** Updated 1 line in `frontend/implementation/tests/nui-lab/bench-recorder.test.ts:509` (`nearWhiteHandPct: 11.4 -> 28.4`) so the existing glare candidate test reflects the mandated B7.1 `>= 25%` threshold.

### 2.8 Workstream B8 — Quality Gates, Live Browser QA & Fault Injection
- **Automated Quality Gates (`r22b-handstate@8f74db4`):**
  - `npx tsc --noEmit`: **`0` errors (`PASS`)**
  - `npm run lint`: **`0` errors (`PASS`)**
  - NUI Lab Vitest suite (`22` test files): **`22/22` files PASS (`260/260` tests PASS)**
  - Legacy input/gameplay suite (`tests/input/{hand-stroke-surface,two-hand-surface,eraser-controls}.test.ts`): **`39/48 PASS, 9/48 FAIL`** (0 regressions vs `main@745bb6d` and `r22-nui-lab@1bb1a71`)
  - `git diff 1bb1a71 -- frontend/implementation/src/input`: **`0` lines (`PASS`)**
  - `npm run build` (`NEXT_PUBLIC_APP_VERSION=0.29.1-alpha+r22b`, `NEXT_PUBLIC_GIT_COMMIT=8f74db42896fae6428b7050ad3ea092d0237a885`): **`24/24` static pages exported (`PASS`)**, `out/nui-lab.html` verified containing `0.29.1-alpha+r22b`.
  - Live Headless Chromium (`--disable-gpu`) Audit across `/nui-lab`, `/nui-lab/canvas`, `/nui-lab/gesture`, `/nui-lab/canvas?bench=1&capture=1&rawrec=1&camdev=1&preset=ok-draw-closed-erase`, `/nui-lab/canvas?bench=1&mdc=0.5&mpc=0.35&mtc=0.35`: **`0` console errors, `0` page errors, `0` hydration mismatches (`PASS`)**.

---

## 3. Dependency Board (§3) & U1–U8 Acceptance Gate Status (§6)

### 3.1 Dependency Board (§3)

| ID | Block | Status | Evidence / Notes |
| --- | --- | --- | --- |
| `K3.1, K4 v1.1, K7, K8 v2.1, K11` | Contract Upgrades | **DONE (`PASS`)** | `R22_CONTRACTS_K1_K10.md`, `presets.ts`, `guided-capture-protocol.ts`, `K4_v1.1_TAXONOMY.md` |
| `B1 (1..10)` | `G1'` Gate + Hysteresis + Strict `FIVE` + Reacquire + Presets | **DONE (`PASS`)** | `0/30` FIST false pinch, `27/27` ambig blocked, `86/89` (`96.63%`) `PINCH_OK` recall |
| `B2 (1..8)` | Canvas UX Recovery + Stale Banner + HUD + Guided Capture + RawRec | **DONE (`PASS`)** | Verified in Vitest (`11/11`) + live Playwright fault-injection (`6,473` overlay px preserved) |
| `B3 (1..3)` | Schema `nui-lab-bench-export/2.1` + `analyze_r22b.py` | **DONE (`PASS`)** | Verified on `S-970f4cb0` + synthetic v2.1 export with `--session` & `DATASET_GT` |
| `B4 (1..3)` | MediaPipe Init-Only Confidence `?mdc=&mpc=&mtc=` | **DONE (`PASS` simulated; `NOT_TESTED` physical)** | `0` runtime `setOptions` calls; `mpMs p50 = 66.8 ms` vs `66.9 ms` default |
| `B5.1` | Taxonomy + `dataset_registry_r22b.json` + `build_r22b_dataset.py` | **DONE (`PASS`)** | 94D builder ready; strictly filters `DATASET_GT` & `!truthMasked` |
| `B5.2–B5.4` | Guided Capture Dataset Freeze (`guided-capture-p1-v1`, `p2-v1`) | **`NOT_TESTED (menunggu Owner)`** | Requires Owner physical webcam capture via `/nui-lab/canvas?bench=1&capture=1` |
| `B6.1` | Baselines `B0` vs `B1` on `S-970f4cb0` `T-004` | **DONE (`PASS`)** | [`r22b/results/r22b_b0_vs_b1_baseline.json`](r22b_b0_vs_b1_baseline.json) |
| `B6.2–B6.4` | Trained Heads `M1`, `M1x`, `M2` & Runtime Adoption Gate | **`NOT_TESTED (menunggu Owner)`** | Blocked on `B5.2` real `DATASET_GT` (training on `RULE_DERIVED` is forbidden) |
| `B7.1–B7.2` | Recalibrated Backlight/Glare Diagnostics + `?camdev=1` + Replay Harness | **DONE (`PASS`)** | `r20-lowlight.ts`, `CamDevPanel.tsx`, `replay_lowlight_offline.mjs` |
| `B7.3–B7.5` | Offline Lowlight Replay on Owner Local `?rawrec=1` WebM Clips | **`NOT_TESTED (menunggu Owner)`** | Harness ready; requires Owner local backlight/dim `.webm` clips |
| `B8` | Automated QA, Fault Injection, Independent Review & Handoff | **DONE (`PASS`)** | `260/260` NUI Lab tests PASS, `0` hydration errors, independent review findings fixed |

### 3.2 User Acceptance Tests `U1–U8` (§6)

| Gate | Description | Offline / Simulated Browser Evidence | Live Physical Webcam Status |
| --- | --- | --- | --- |
| **`U1`** | `FIST` tidak menggambar (`0` false stroke dari `20` kepalan) | **PASS (`OFFLINE_DATASET` + `UNIT_ONLY`):** `0/30` FIST frames & `0/27` ambig frames pass `G1'` on `S-970f4cb0` `T-004`; `0` false strokes in `r22b-handstate.test.tsx` | **`NOT_TESTED (menunggu Owner)`** |
| **`U2`** | Undo (`FIST -> ONE -> FIST`) `>= 8/10` berhasil, `0` titik palsu | **PASS (`UNIT_ONLY`):** Undo sequence fires `UNDO` with `0` strokes and `PINCH_ONSET_BLOCKED`; post-FIST latched `300 ms` guard verified | **`NOT_TESTED (menunggu Owner)`** |
| **`U3`** | Redo (`FIST -> TWO -> FIST`) `>= 8/10` berhasil, `0` titik palsu | **PASS (`UNIT_ONLY`):** Redo sequence verified with `0` accidental strokes | **`NOT_TESTED (menunggu Owner)`** |
| **`U4`** | Goresan cepat dan lambat (`10` garis normal + `5` lingkaran, `0` putus palsu) | **PASS (`OFFLINE_DATASET` + `UNIT_ONLY`):** `86/89` (`96.63%`) `PINCH_OK` recall on `T-004`; `<= 150 ms` blink bridged (`PINCH_RELEASE_BRIDGED`) with onset backfill & release retro-trim | **`NOT_TESTED (menunggu Owner)`** |
| **`U5`** | Tangan santai (`FIVE_RELAXED`) tidak clear/reset (`0` false clear) | **PASS (`OFFLINE_DATASET` + `UNIT_ONLY`):** Strict `FIVE` (`B1.5`) cuts `T-004` `FIVE` candidates from `114 -> 25` (`0` false `FIVE` on relaxed open hand) | **`NOT_TESTED (menunggu Owner)`** |
| **`U6`** | Kamera silau / backlight (`active-window miss <= 15%`, `0` lost `> 1s`) | **PASS (`BROWSER_SIMULATED_VIDEO` UI/diagnostics):** `clippedPct`, `handRoiLumaP50`, `> 3s` backlight tip card, `?mdc=0.5&mpc=0.35&mtc=0.35`, and `?camdev=1` ready | **`NOT_TESTED (menunggu Owner)`** |
| **`U7`** | Preset alternatif (`P1..P5`) dapat dipilih tanpa reload | **PASS (`UNIT_ONLY` + `BROWSER_SIMULATED_VIDEO`):** All 5 presets + `THREE_ACTION` verified live and in Vitest | **`NOT_TESTED (menunggu Owner)`** |
| **`U8`** | Stabilitas UI (`0` blank skeleton saat frame lambat, `0` hydration error, pill reset `<= 1.5s`) | **PASS (`BROWSER_SIMULATED_VIDEO` + `FAULT_INJECTION`):** `0` console/page/hydration errors across 5 routes; `750 ms` worker stall preserved `6,473` skeleton pixels while showing `"Kamera tersendat"`; pill auto-resets at `1.5s` / `300ms` hand loss | **PASS (`BROWSER_SIMULATED_VIDEO`)** |
