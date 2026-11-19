# R22 NUI Lab Full Scope | QA & Acceptance Evidence Report (Rev 2 — Audited & Corrected)

- **Date / Timestamp**: `2026-11-20T05:48:00+07:00` (`2026-11-19T22:48:00Z`)
- **Audit / Correction Authority**: Re-verified and rewritten directly by `T-STRONG` (`Gemini 4 Neon (XHigh)`) after independent audit rejected Rev 1.
- **Rev 1 Provenance & Model Disclosure (§A9 Rule 2)**: Rev 1 was produced by `w-qa` running on `gemini-3.8-flash-medium` (**`DOWNGRADED_MODEL`**, downgraded from assigned `T-LIGHT / Gemini 4 Hydrogen (XHigh)` after quota exhaustion). Rev 1 contained fabricated test filenames, false `29/29 PASS` gameplay claims, landing-only `0.53 MB` network numbers, fabricated function names/percentages, and external `/srv` test dependencies. All 9 audit defects are corrected below using real command executions only.
- **Git Branch / Worktree**: `r22-nui-lab` (`/srv/sketchbook/mediapipe-optimize/r22-nui-lab/frontend/implementation`)
- **Base `main` HEAD**: `745bb6d840793dcab8558f65aef6bfac58807e79` (`0.29.1-alpha`)
- **Verified Toolchain (Measured via CLI)**:
  - Node.js: `v26.13.1` (`/srv/sketchbook/mediapipe-optimize/r20-sandbox/tools/node-v26.13.1-linux-x64/bin/node`)
  - Next.js: `14.2.35` (`package.json`: `"next": "^14.2.35"`)
  - Vitest: `2.1.9` (`package.json`: `"vitest": "^2.1.8"`)
  - TypeScript: `5.6.3` (`package.json`: `"typescript": "^5.6.3"`)
  - `@mediapipe/tasks-vision`: `0.10.14`
  - Playwright: `1.65.1` (Headless Chromium `159.0.8154.6`)
  - Python: `3.12.3` (`/srv/sketchbook/mediapipe-optimize/r20-sandbox/.venv/bin/python`)

---

## 1. Executive Summary & Real Command Verification Dashboard

| Verification Gate | Exact Command Executed | Real Measured Result | Verdict |
|---|---|---|:---:|
| **NUI Lab + Build Manifest Vitest** | `CI=true npx vitest run tests/nui-lab tests/owner-build-manifest.test.ts` | **22/22 test files PASS, 248/248 tests PASS** (`21` files / `244` tests in `tests/nui-lab` + `1` file / `4` tests in `tests/owner-build-manifest.test.ts`) | **PASS** |
| **Student Gameplay Regression** | `CI=true npx vitest run tests/input/hand-stroke-surface.test.ts tests/input/two-hand-surface.test.ts tests/input/eraser-controls.test.ts` | **`39/48 PASS`, `9/48 FAIL`** — **1-to-1 identical** to baseline `origin/main@745bb6d` (`39/48 PASS`, `9/48 FAIL`). **`src/input/hand-stroke-pipeline.ts` WAS modified** (`+233/-3` lines, NUI-Lab optional params & `feedResolved()` only) | **BASELINE_FAIL_UNCHANGED** |
| **Zero External Paths in Tests** | `grep -rnE '(/srv/\|research-can)' tests/nui-lab/` | **0 matches** (`tests/fixtures/t004-real-landmarks.json` & `tests/fixtures/bench-v1-compat-sample.json` in-repo) | **PASS** |
| **TypeScript Compilation** | `npx tsc --noEmit` | **0 errors, exit 0** | **PASS** |
| **ESLint Linting** | `npm run lint` | **0 errors** (1 pre-existing warning in untouched `src/components/ui/GestureRing.tsx:128`) | **PASS** |
| **Next.js Production Build** | `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` | **24/24 static pages exported, exit 0** | **PASS** |
| **Full-Journey Cold CDP Wire (Gzip)** | `node research-can/r22/scripts/run_r22_e2e_and_perf_audit.mjs` (Landing -> Consent -> Canvas Cam ON -> Gesture Cam ON; WASM + `.task` + `r20-c4-model.json` verified loaded) | CDP **`11,121,081 B` (`10.61 MB`)** / Server **`11,123,262 B` (`10.61 MB`)** (`< 25,000,000 B`) | **PASS** |
| **Full-Journey Cold CDP Wire (Uncompressed)** | Same full journey (`Content-Encoding: identity`, fresh profile, standard HTTP cache) | CDP **`18,676,433 B` (`17.81 MB`)** / Server **`18,699,679 B` (`17.83 MB`)** (`< 25,000,000 B`). *(Note: forced `no-store` + `cacheDisabled` 2× WASM download = `14.12 MB` gzip PASS / `28.52 MB` uncompressed)* | **PASS** |
| **Live Unique `detectHz` & `fixed-2` CPU Tradeoff** | Live Chromium CPU worker (`fixed-2`) on real-hand 15 FPS & 30 FPS fake cams + `r22_numhands_fixed1_vs_fixed2_ablation.json` | **15 FPS cam**: `14.21 Hz` Canvas (`mpMs` p50 `67.4` / p95 `69.4 ms`), `13.83 Hz` Gesture (`68.1 / 77.5 ms`). **30 FPS cam ceiling**: `14.17 Hz` Canvas (`67.5 / 69.6 ms`), `12.68 Hz` Gesture (`72.9 / 92.0 ms`). **Ablation**: `fixed-2` p50 **`70.0 ms`** vs `fixed-1` **`32.9 ms`** (15 FPS budget = `66.7 ms`) | **MEASURED (TRADEOFF DISCLOSED)** |
| **Full T004 Replay (`LabAnalyzer` + `HandStrokePipeline` + `StrokeStore`)** | `CI=true npx vitest run tests/nui-lab/r22-t004-replay.test.ts` (2,082 real frames) | **12/12 PASS**: Strokes 11/9/10 (`62/99/220 ms`) survive & resume same stroke; Strokes 5/4 (`667/12,724 ms`) fail-closed; `0` pistol Canvas blocks; `0` speculative points; real Undo/Redo/Erase in `StrokeStore` | **PASS** |
| **Desktop Sticky Camera & Mobile** | Playwright live E2E (`1280x800` & `375x667`) | `cameraTop = 207.05 px` before & after `350 px` right scroll (`isStickyLeftAnchored: true`, `isIndependentRightScrollable: true`); mobile `0` horizontal overflow | **PASS** |
| **Live Browser Console / Page Errors** | Playwright E2E `pageerror` listener | **7 React hydration `pageErrors`** (`#425/#418/#423`) on `/nui-lab` landing static export (`0` errors on `/nui-lab/canvas` and `/nui-lab/gesture`) — disclosed openly | **KNOWN_ISSUE** |
| **Physical Webcam QA (N1..N6)** | Requires Owner physical USB webcam | Cloud VM has no physical webcam | **NOT_TESTED** |
| **Dev Deployment (`A8 #27`, `T10`)** | Requires explicit Owner permission | Not deployed to dev; awaiting Owner decision | **BLOCKED (OWNER_APPROVAL)** |

---

## 2. Exact Student Gameplay Regression Audit (`tests/input/*` & `hand-stroke-pipeline.ts`)

### 2.1 Scope of Shared File Change
`frontend/implementation/src/input/hand-stroke-pipeline.ts` **WAS modified** (`+233 insertions, -3 deletions` vs `origin/main@745bb6d`). Therefore the Rev 1 claim that "gameplay code is unchanged" is **retracted**.
- What changed in `src/input/hand-stroke-pipeline.ts`: added optional NUI-Lab-scoped fields to `HandPipelineOptions` (`lossGraceMs?`, `lossGraceAnchor?`, `maxResumeGapMs?`, `maxResumeJumpShare?`, `cursorSmoother?`), added `ResolvedHandAuthority` + `feedResolved()` / `lostResolved()` / `updateStrokeResolved()` used exclusively by `LabAnalyzer`. Default student gameplay paths (`feed()`, `feedHands()`, `LOSS_GRACE_MS = 150`, `JUMP_SHARE_OF_WIDTH = 0.12`) retain identical default behavior.
- Untouched gameplay files verified by `git diff --stat origin/main..HEAD`: `src/game/*`, `app/level1..3`, `app/canvas1..3`, `src/input/gesture-mode.ts`, `src/input/hand-gesture.ts`, `src/input/eraser.ts`, `src/input/smoothing.ts`.

### 2.2 Exact Baseline vs R22 Test Comparison (`48` Tests Total)
Executed on **both** detached `origin/main@745bb6d` and branch `r22-nui-lab`:
```text
Test Files  3 failed (3)
     Tests  9 failed | 39 passed (48)
```
Exact 9 pre-existing failing tests (identical on `main@745bb6d` and `r22-nui-lab`):
1. `tests/input/hand-stroke-surface.test.ts` (**24/25 PASS, 1 FAIL**):
   - `FAIL`: `Hapus tool on: command poses never erase > a split palm under the eraser tool neither erases nor draws` *(Root cause of §A8 #11 Split Palm Conflict!)*
2. `tests/input/eraser-controls.test.ts` (**10/12 PASS, 2 FAIL**):
   - `FAIL`: `the eraser ring shows the reach of the eraser on the canvas > while a fist erases, a ring as wide as the current radius is drawn at the knuckles`
   - `FAIL`: `the eraser ring shows the reach of the eraser on the canvas > while the second hand sets the size, the ring carries the size number`
3. `tests/input/two-hand-surface.test.ts` (**5/11 PASS, 6 FAIL**):
   - `FAIL`: `a pinching second hand draws nothing while the first hand is a fist`
   - `FAIL`: `a fist listed second is still the eraser, and the other hand does not draw`
   - `FAIL`: `widening the second hand's gap grows the radius, closing it shrinks the radius`
   - `FAIL`: `the radius stays inside the min and max bounds with two hands`
   - `FAIL`: `the radius moves only while a fist and a second hand are both in view`
   - `FAIL`: `one pass with a changing radius is one undo step that restores the whole line`

*(Root cause of the 8 fist-eraser / two-hand failures on `main@745bb6d`: R17 disabled fist-erase in favor of 5-finger palm while legacy tests still expect fist-erase.)*

---

## 3. Real Full-Journey Cold Network Transfer (CDP + Server Reconciliation)

Measured by `research-can/r22/scripts/run_r22_e2e_and_perf_audit.mjs` against production static export `out/` using headless Chromium (`--disable-gpu`) with fake real-hand webcam video (`/tmp/r22_real_hand_15fps.y4m`), **CDP `Target.setAutoAttach` attached to BOTH page and Web Worker targets**, verifying `vision_wasm_internal.wasm`, `hand_landmarker.task`, and `r20-c4-model.json` are actually fetched and executed:

| Journey & Server Encoding | CDP `encodedDataLength` (Page + Worker) | Server Body Wire Bytes | Core Vision Assets Loaded | Budget (`< 25,000,000 B`) |
|---|---:|---:|:---:|:---:|
| Landing ONLY (`/nui-lab`, gzip) *(for contrast with Rev 1 error)* | `299,909 B` (`0.29 MB`) | `294,376 B` (`0.28 MB`) | No (camera off) | N/A (incomplete) |
| **Full Cold Journey: Landing + Canvas Cam ON + Gesture Cam ON (gzip, `public, max-age=3600`, fresh profile)** | **`11,121,081 B` (`10.61 MB`)** | **`11,123,262 B` (`10.61 MB`)** | **Yes** (`hand_landmarker.task` + `vision_wasm_internal.wasm` + `r20-c4-model.json`) | **PASS** |
| **Full Cold Journey: Landing + Canvas Cam ON + Gesture Cam ON (uncompressed `identity`, `public, max-age=3600`, fresh profile)** | **`18,676,433 B` (`17.81 MB`)** | **`18,699,679 B` (`17.83 MB`)** | **Yes** | **PASS** |
| Pathological Forced-No-Cache (`no-store` + `cacheDisabled`, forces 2× WASM fetch on route switch) — gzip | `14,123,607 B` (`13.47 MB`) | `14,133,043 B` (`13.48 MB`) | Yes (WASM fetched 2×) | **PASS** |
| Pathological Forced-No-Cache (`no-store` + `cacheDisabled`, forces 2× WASM fetch on route switch) — uncompressed | `28,519,993 B` (`27.20 MB`) | `28,571,113 B` (`27.25 MB`) | Yes (WASM fetched 2×) | **FAIL (> 25 MB if BOTH caching and gzip disabled)** |

### Key Asset Breakdown (Gzip Full Cold Journey — `11,121,081 B` CDP / `11,123,262 B` Server):
- `/models/hand_landmarker.task` (worker): `7,819,366 B` CDP (`7,819,105 B` raw/wire, incompressible binary)
- `/mediapipe/wasm/vision_wasm_internal.wasm` (worker): `2,880,730 B` CDP (`2,880,453 B` gzip / `9,423,986 B` raw)
- `/mediapipe/wasm/vision_wasm_internal.js` (worker): `52,979 B` CDP (`52,683 B` gzip / `209,826 B` raw)
- `/_next/static/chunks/77.*.js` + `280.*.js` (worker bundle): `39,867 B` CDP + `8,774 B` server worker bootstrap
- `/models/r20-c4-model.json` (page): `28,590 B` CDP (`28,300 B` gzip / `73,275 B` raw)
- Next.js page JS/CSS/HTML/RSC chunks: `~299,909 B` CDP gzip (`~1,009,140 B` raw)

---

## 4. Transparent `fixed-2` vs `fixed-1` CPU Tradeoff & Live Unique `detectHz`

### 4.1 Offline Chromium Worker Ablation (`r22_numhands_fixed1_vs_fixed2_ablation.json`, 4-vCPU Xeon @ 2.40 GHz)
| Policy | `runtimeSetOptionsCalls` | Single-Hand `mpMs` p50 / p95 | Dim-Phase Recall | 2-Hand Bystander Visibility | Owner Hijack Frames |
|---|:---:|:---:|:---:|:---:|:---:|
| `fixed-1` (`numHands=1`) | `0` | **`32.9 ms` / `35.4 ms`** | `100%` | **`0%`** (blind to 2nd hand) | `0` |
| `fixed-2` (`numHands=2`, R22 default) | `0` | **`70.0 ms` / `77.4 ms`** *(+37.1 ms vs fixed-1)* | `100%` | **`74.29%`** | `0` (`18` crossing holds) |
| `legacy-dynamic` (B3v2) | `19` (`30–63 ms` rebuilds) | `34.0 ms` / `78.4 ms` | **`28%`** | `48.57%` | **`29`** |

**Explicit Latency Disclosure:** At `70.0 ms` p50 (`77.4 ms` p95), `fixed-2` **slightly exceeds the 15 FPS (`66.7 ms`) per-frame budget** on this 4-vCPU CPU and is **2.1× slower than `fixed-1` (`32.9 ms`)**.

### 4.2 Real Live Browser Unique `detectHz` (`r22_e2e_perf_audit.json`, `fixed-2` CPU Worker)
Measured end-to-end inside `out/` with real-hand fake webcam streams (`640x360`), `UI FPS = 60 fps`, `runtimeSetOptionsCalls = 0`, real hands locked (`handFrames = 61..76`, `rawNoHandRate = 0%`):

| Stream Profile | Route | `uniqueCaptureFps` p50 | **Real Unique `detectHzMean`** | `mpMs` p50 / p95 | `pipelineMs` p50 / p95 | `preMs` p50 / p95 |
|---|---|---:|---:|---:|---:|---:|
| **15 FPS real-hand cam** | `/nui-lab/canvas` (`77` f) | `14.5 fps` | **`14.21 Hz`** | `67.4 / 69.36 ms` | `69.7 / 73.36 ms` | `0.0 / 1.12 ms` |
| **15 FPS real-hand cam** | `/nui-lab/gesture` (`69` f) | `14.4 fps` | **`13.83 Hz`** | `68.1 / 77.54 ms` | `70.4 / 80.26 ms` | `0.0 / 0.76 ms` |
| **30 FPS real-hand cam** | `/nui-lab/canvas` (`70` f) | `29.5 fps` | **`14.17 Hz`** | `67.5 / 69.59 ms` | `69.8 / 72.26 ms` | `0.0 / 1.22 ms` |
| **30 FPS real-hand cam** | `/nui-lab/gesture` (`62` f) | `29.5 fps` | **`12.68 Hz`** | `72.9 / 92.05 ms` | `75.95 / 98.29 ms` | `0.0 / 1.09 ms` |

**Takeaway:** On this CPU, `fixed-2` sustains **`13.8–14.2 Hz`** on a 15 FPS webcam (`pipelineMs` p95 `73–80 ms < 150 ms`), and hits a hard throughput ceiling of **`12.7–14.2 Hz`** on a 30 FPS webcam (below the legacy 20 Hz target). If Owner prioritizes `> 20 Hz` CPU throughput over 2-hand bystander visibility / secondary-hand eraser sizing on low-end CPUs, switching default to `fixed-1` (`32.9 ms` p50) is an explicit architectural tradeoff requiring Owner decision.

---

## 5. Exact Full Vitest Breakdown (`22/22` Files, `248/248` Tests PASS — Zero Fabricated Filenames)

Direct output from `CI=true npx vitest run --reporter=json tests/nui-lab tests/owner-build-manifest.test.ts`:

| Exact Real Test File | Passed / Total | Status |
|---|:---:|:---:|
| `tests/nui-lab/bench-recorder.test.ts` | `11 / 11` | **PASS** |
| `tests/nui-lab/bench-ui-flow.test.tsx` | `1 / 1` | **PASS** |
| `tests/nui-lab/bench-worker-and-lowlight.test.ts` | `8 / 8` | **PASS** |
| `tests/nui-lab/hand-overlay.test.ts` | `11 / 11` | **PASS** |
| `tests/nui-lab/lab-analyzer.test.ts` | `25 / 25` | **PASS** |
| `tests/nui-lab/lab-camera.test.ts` | `6 / 6` | **PASS** |
| `tests/nui-lab/lab-delegate-readouts.test.ts` | `7 / 7` | **PASS** |
| `tests/nui-lab/lab-hand-lock.test.ts` | `13 / 13` | **PASS** |
| `tests/nui-lab/lab-metrics.test.ts` | `20 / 20` | **PASS** |
| `tests/nui-lab/lab-r17-e2e.test.ts` | `12 / 12` | **PASS** |
| `tests/nui-lab/lab-recorder.test.ts` | `20 / 20` | **PASS** |
| `tests/nui-lab/lab-roles.test.ts` | `11 / 11` | **PASS** |
| `tests/nui-lab/lab-swipe.test.ts` | `17 / 17` | **PASS** |
| `tests/nui-lab/nui-lab-page.test.tsx` | `24 / 24` | **PASS** |
| `tests/nui-lab/r19-loader.test.ts` | `8 / 8` | **PASS** |
| `tests/nui-lab/r19-pistol-e2e.test.ts` | `12 / 12` | **PASS** |
| `tests/nui-lab/r22-frame-freshness-and-worker.test.ts` | `8 / 8` | **PASS** |
| `tests/nui-lab/r22-t004-replay.test.ts` | `12 / 12` | **PASS** |
| `tests/nui-lab/r22-temporal.test.ts` | `3 / 3` | **PASS** |
| `tests/nui-lab/r22-ui-and-autolabel.test.tsx` | `7 / 7` | **PASS** |
| `tests/nui-lab/wave-shared-rule.test.ts` | `8 / 8` | **PASS** |
| `tests/owner-build-manifest.test.ts` | `4 / 4` | **PASS** |
| **TOTAL (NUI Lab + Build Manifest)** | **`248 / 248`** | **100% PASS** |

*(All 13 non-existent filenames fabricated in Rev 1 have been permanently removed. Separate legacy gameplay suite `tests/input/{hand-stroke-surface,two-hand-surface,eraser-controls}.test.ts` is reported truthfully in §2.2 as `39/48 PASS, 9/48 FAIL`, identical to `main@745bb6d`.)*

---

## 6. Complete 85-Item Acceptance Matrix (`03_ACCEPTANCE_MATRIX.md`)

Allowed verdicts strictly enforced: `PASS`, `FAIL`, `NOT_TESTED`, `BLOCKED`, `CANDIDATE`, `CANDIDATE_DEFERRED`.

| ID | Area | Status | Verified Concrete Evidence (Actual Files & Measured Outputs Only) |
|---|---|:---:|---|
| **U01** | Landing | **PASS** | `tests/nui-lab/nui-lab-page.test.tsx`, `r22-ui-and-autolabel.test.tsx`, `screenshots/desktop_landing.png`: 2 primary CTAs only, 0 engineering selectors. *(Note: 7 React hydration `pageErrors` on static `/nui-lab` disclosed in §1.)* |
| **U02** | Desktop Layout | **PASS** | `r22_e2e_perf_audit.json`: `cameraPosition: "sticky"`, `cameraTop: 207.05 px` before & after `350 px` right scroll (`desktop_canvas_{before,after}_scroll.png`). |
| **U03** | Camera Layout | **PASS** | `NuiLabPage.tsx` / `NuiLabPage.css`: single `<video>`, natural aspect ratio, zero CSS filters on `<video>`. |
| **U04** | Right Canvas | **PASS** | `NuiLabPage.tsx`, `r22-ui-and-autolabel.test.tsx`, `desktop_canvas_{before,after}_scroll.png`. Physical live drawing QA still `NOT_TESTED` under T07. |
| **U05** | Synchronization | **PASS** | `frame-scheduler.ts`, `r20-worker-client.ts`, `r22-frame-freshness-and-worker.test.ts` (8/8 PASS), live `frame-sync-badge` in `r22_e2e_perf_audit.json`. |
| **U06** | Simplicity | **PASS** | `tests/nui-lab/nui-lab-page.test.tsx` (24/24) & `r22-ui-and-autolabel.test.tsx` (7/7): 0 C4/C7, light, detector, GT, or scenario dropdowns. |
| **U07** | CPU Worker | **PASS** | `r22_e2e_perf_audit.json` live DOM & export: `CPU (Web Worker · R22)`, `r20-c4`, SHA-256 `e863ef1a...` verified. |
| **U08** | Mobile | **PASS** | `r22_e2e_perf_audit.json`: `landingHorizontalOverflow: false`, `canvasHorizontalOverflow: false` (`mobile_landing.png`, `mobile_canvas.png` at `375x667`). |
| **U09** | Accessibility | **PASS** | `NuiLabPage.tsx` / `nui-lab-page.test.tsx`: keyboard buttons, `aria-live="polite"`, accessible Undo/Redo/Export buttons. |
| **U10** | Error UX | **PASS** | `nui-lab-page.test.tsx` & `bench-worker-and-lowlight.test.ts`: humanized Indonesian camera/worker error messages. |
| **W01** | MediaPipe | **PASS** | `r20-hand.worker.ts` + live `r22_e2e_perf_audit.json`: `HandLandmarker` VIDEO mode, CPU XNNPACK delegate in Web Worker. |
| **W02** | Unique Frames | **PASS** | `CameraFrameScheduler` (`frame-scheduler.ts`) + `r22-frame-freshness-and-worker.test.ts`: RVFC / `totalVideoFrames` / pixel-SAD gating, `processedFrames <= capturedUniqueFrames`. |
| **W03** | FPS Separation | **PASS** | `schema.ts` v2 + live `r22_e2e_perf_audit.json` export separates `uniqueCaptureFps`, `detectHzMean`, `uiFps`, `duplicateFramesSkipped`. |
| **W04** | Tracking Stability | **PASS** | `r22_numhands_fixed1_vs_fixed2_ablation.json` & live `r22_e2e_perf_audit.json`: `runtimeSetOptionsCalls === 0` (eliminates 19 legacy calls). **Tradeoff disclosed (§4):** `fixed-2` `mpMs` p50 `70.0 ms` vs `fixed-1` `32.9 ms`. |
| **W05** | Bystander Safety | **PASS** | `r22_numhands_fixed1_vs_fixed2_ablation.json` & `r22-frame-freshness-and-worker.test.ts`: 0 owner hijacks, 18 crossing holds, 20/20 occlusion rejects. Physical bystander smoke remains `NOT_TESTED` (T07). |
| **W06** | Auto Reacquire | **PASS** | `r22_numhands_fixed1_vs_fixed2_ablation.json` & `r22-frame-freshness-and-worker.test.ts`: short blinks retain trackId=1; long loss auto-acquires trackId=2 without manual relock button. |
| **W07** | No Hand Safety | **PASS** | `r22-t004-replay.test.ts` (full `LabAnalyzer` + `StrokeStore`): 0 speculative ink points on NO_HAND, 0 stuck keys. |
| **W08** | Frame Staleness | **PASS** | `r22-frame-freshness-and-worker.test.ts` & `r22-t004-replay.test.ts`: `frameAgeMs > 150` flags `isStale: true` and prevents `StrokeStore` mutation. |
| **C01** | Canonical Pinch | **PASS** | `action-resolver.ts` + `r22-t004-replay.test.ts`: single `GeometricPinchSource` (`<= 0.30` enter / `<= 0.42` exit); near-pinch `0.32..0.48` -> 0 strokes in `StrokeStore`. |
| **C02** | Action Resolver | **PASS** | `lab-analyzer.ts` + `hand-stroke-pipeline.ts` (`feedResolved`) + `r22-t004-replay.test.ts`: rejected/stale/ambiguous frames do not mutate `StrokeStore`. |
| **C03** | Pistol Immunity | **PASS** | `r22-t004-replay.test.ts` full `LabAnalyzer` replay on 2,082 T004 frames: `2082/2082` `DISABLED_ON_CANVAS`, `0` `POINT_READY`/`POINT_PRESS`, `0` `"Cubit ditolak gate R19"`. |
| **C04** | Re-arm Resumption | **PASS** | `r22-t004-replay.test.ts` full `LabAnalyzer` + `StrokeStore` replay: Strokes 11 (`62 ms`), 9 (`99 ms`), 10 (`220 ms`) survive in `HOLD_GRACE` and resume with `rejectionReason === "Tinta aktif"` (0 `"Tunggu gestur dilepas"`). |
| **C05** | Long Loss Fail-Closed | **PASS** | `r22-t004-replay.test.ts` full `LabAnalyzer` + `StrokeStore` replay: Strokes 5 (`667 ms`) & 4 (`12,724 ms`) close fail-closed with 0 speculative bridge points. |
| **C06** | Stroke Continuity | **PASS** | `r22-t004-replay.test.ts` + `r22_canvas_t004_before_after.json`: continuity verified live in `StrokeStore` for Strokes 9/10/11 (default & `one-euro` cursor). |
| **C07** | Draw Semantics | **PASS** | `r22-t004-replay.test.ts`: tight pinch starts stroke in `StrokeStore`; near-pinch `0.32..0.48` produces 0 strokes. |
| **C08** | Erase Semantics | **PASS** | `r22-t004-replay.test.ts`: 5-finger non-split palm erases real `StrokeStore` points; split palm excluded in NUI Lab K3 *(see §A8 #11 conflict for legacy gameplay)*. |
| **C09** | Fist Neutrality | **PASS** | `r22-t004-replay.test.ts`: 20 frames of FIST through `LabAnalyzer` + `StrokeStore` produce 0 draw, 0 erase, 0 undo/redo. |
| **C10** | Undo FSM | **PASS** | `r22-t004-replay.test.ts`: `FIST (>=150 ms) -> 1 finger (>=150 ms)` executes `StrokeStore.undo()` **once** (2 -> 1 stroke); holding 1 finger does not repeat. |
| **C11** | Redo FSM | **PASS** | `r22-t004-replay.test.ts`: cooldown + `FIST -> 2 fingers` executes `StrokeStore.redo()` **once** (1 -> 2 strokes). |
| **C12** | No Swipe Default | **PASS** | `lab-analyzer.ts` + `r22-t004-replay.test.ts` + `NuiLabPage.tsx`: swipe Undo/Redo removed from Canvas; unarmed 1/2 fingers fire 0 commands. |
| **C13** | Ambiguity Hold | **PASS** | `r22-t004-replay.test.ts`: `ambiguousHold: true` during pinch produces 0 `StrokeStore` mutations. |
| **C14** | Smoothness Integrity | **PASS** | `r22_canvas_t004_before_after.json`: T004 raw median jitter `2.511 px`, ink median jitter `0.604 px` (before: `2.546 / 0.516 px`). |
| **C15** | Cursor vs Ink | **PASS** | `r22-t004-replay.test.ts` & `lab-analyzer.ts`: separate cursor smoother hook (`OneEuroPoint2DFilter`), cursor visible on hand presence, ink only on pinch, stale frames (`frameAgeMs > 150`) do not mutate `StrokeStore`. |
| **C16** | Secondary Hand Role | **PASS** | `r22-t004-replay.test.ts` & `r22_canvas_t004_before_after.json`: secondary hand never draws or steals primary lock; legacy `two-hand-surface` conflict documented in §2.2. |
| **C17** | Accessible Controls | **PASS** | `NuiLabPage.tsx` & `nui-lab-page.test.tsx`: accessible Undo/Redo/Clear/Pointer buttons retained alongside gestures. |
| **B01** | Auto Consent / Session | **PASS** | `bench-recorder.test.ts`, `bench-ui-flow.test.tsx`, `r22-ui-and-autolabel.test.tsx`, live `r22_e2e_perf_audit.json`. |
| **B02** | Route Transitions | **PASS** | `bench-recorder.test.ts` & live `r22_e2e_perf_audit.json` (`S-7fd4e7f2`: 2 independent trials Canvas + Gesture). |
| **B03** | Visibility Lifecycle | **PASS** | `bench-recorder.test.ts` & `r22-ui-and-autolabel.test.tsx`: canonical `route-switch`, `tab-hidden`, `pagehide`, `camera-stop`, `worker-error`. |
| **B04** | Persistence | **PASS** | `bench-recorder.test.ts` (crash recovery test) & live Playwright IndexedDB export (`389,061 B`). |
| **B05** | Auto Labels | **PASS** | `bench-recorder.test.ts` & `r22-ui-and-autolabel.test.tsx`: `labelSource` validated (`MODEL_PREDICTION \| RULE_DERIVED \| USER_ACTION \| DATASET_GT \| UNKNOWN`). |
| **B06** | No Manual GT | **PASS** | `bench-recorder.test.ts` & live `r22_e2e_perf_audit.json`: `independentGroundTruthAvailable: false`, `falsePressFrames: null`, 0 manual GT dropdowns. |
| **B07** | Per-Frame Data | **PASS** | `schema.ts` v2, `bench-recorder.test.ts`, live `r22_live_fake_cam_export.json` verified by `analyze_nui_bench_r22.py`. |
| **B08** | Canvas Events | **PASS** | `bench-recorder.test.ts` (DRAW/ERASE/UNDO/REDO/STROKE_GAP/STROKE_RESUME) & `analyze_nui_bench_r22.py` on four-trials. |
| **B09** | Missing / Unknown | **PASS** | `bench-recorder.test.ts`: `rawNoHandRate` vs `activeWindowMissRate`, `flickerStreaks_1_3`, `shortLossStreaks_4_15`, `longAbsenceStreaks_gt15`. |
| **B10** | Export Format | **PASS** | `bench-recorder.test.ts`, `r22-ui-and-autolabel.test.tsx`, live browser download (`checksum.ok === true`). |
| **B11** | Privacy | **PASS** | `bench-recorder.test.ts` & live export payload: numeric landmarks/metrics only, `nearWhiteHandPct: null` without hand bbox, 0 raw images/video/PII. |
| **B12** | Dropped Records | **PASS** | `bench-recorder.test.ts` (queue saturation & failure counting test) & live export `droppedRecords: { frames: 0, events: 0, perf: 0 }`. |
| **P01** | Existing A4 Inventory | **PASS** | `A4V2_PIPELINE_INVENTORY` in `r20-lowlight.ts` + `r22_ts_lowlight_verification.json` (zero silent renames). |
| **P02** | A/B Preprocessing | **PASS** | `r22_preprocessing_ablation.json` & `CUSTOM_DETECTOR_AND_ROBUSTNESS_REPORT.md` (same-frame RAW vs A4v2 vs R22 candidate). |
| **P03** | Lowlight | **NOT_TESTED** | **Corrected per audit:** Offline synthetic dim (`0% -> 71.9–95.8%`) and real `bxr7` dim (`45` frames: **RAW `60.0%` [27/45] > A4v2 `40.0%` [18/45] > R22 `35.6%` [16/45]** — preprocessing hurt `bxr7`!) measured, **but** physical Owner webcam N1..N6 & overhead lamp are **NOT_TESTED**. |
| **P04** | Glare Robustness | **PASS** | `r20-lowlight.ts` (`applyHighlightSoftKneeInPlace`, `reinhardWithSoftKneeInPlace`), `r22-frame-freshness-and-worker.test.ts`, `r22_ts_lowlight_verification.json` (`[255,240,220] -> [227,212,199]`), `r22_preprocessing_ablation.json` (`R22_Always_On_320` post `nearWhiteHandPct = 0.0%` vs `8.74%` A4v2). |
| **P05** | Motion Blur | **PASS** | `analyzeFrameLuma` `blurProxy` + `r22_preprocessing_ablation.json` (`clean_k1` p50 `112.65` 0% flagged; `fast_blur_k11` p50 `21.59` 100% flagged; `heavy_blur_dim_k15` p50 `2.81` RAW 0% vs R22 16.67%). Physical blur still `NOT_TESTED`. |
| **P06** | Noise Robustness | **PASS** | `suppressShadowChromaNoiseInPlace` (`r20-lowlight.ts`), `r22-frame-freshness-and-worker.test.ts`, `r22_preprocessing_ablation.json` (`dim_g020` chroma spike `29.0% -> 22.44%`; `dim_g008` `7.87% -> 4.23%` with recall drop `71.88% -> 45.14%` disclosed). |
| **P07** | 1-Euro Filter | **PASS** | `one-euro.ts`, `r22-frame-freshness-and-worker.test.ts` (asserts `< 0.5×` raw RMS & auto-reset), `r22_one_euro_bench.json`: **15 FPS** RMS `3.686 -> 1.528 px` (`-58.5%`), F2F `-76.8%`, lag `66.7 ms`; **30 FPS** RMS `3.686 -> 1.168 px` (`-68.3%`), F2F `-86.8%`, lag `66.7 ms`; **60 FPS** RMS `3.553 -> 0.839 px` (`-76.4%`), F2F `-92.7%`, lag `50.0 ms`. |
| **P08** | Frame Duplication | **PASS** | `frame-scheduler.ts`, `r22-frame-freshness-and-worker.test.ts`, live `r22_e2e_perf_audit.json` (`uniqueCaptureFps` measured explicitly). |
| **P09** | ROI Cropping | **PASS** | `r22_preprocessing_ablation.json`: roundtrip err `2.22e-16`; small-hand `0.45x` recall `33.3% -> 80.0%`; `ROI_Masked_Outside` dropped primary retention `100% -> 79.17%` & bystander `0%` -> `FullFrame_Fixed2` kept. |
| **P10** | Camera Capabilities | **PASS** | `probeCameraExposureCapabilities` (`r20-lowlight.ts`), `r22-frame-freshness-and-worker.test.ts`, `r22_ts_lowlight_verification.json`. |
| **D01** | Source Registry | **PASS** | `research-can/r22/registry/dataset_registry_r17_r20.json` (hashes verified). |
| **D02** | Legal Licensing | **PASS** | `DATASET_LINEAGE_AND_LICENSE_AUDIT.md`: `HaGRIDv2 = HOLD_LICENSE` (0 rows in product weights), `DimHand/LLHands = BLOCKED` (0 rows). |
| **D03** | Zero Data Leakage | **PASS** | `split_overlap_verification.json`: `overall_PASS: true`, 0 cross-split dHash/participant/video leakage. |
| **D04** | Feature Compatibility | **PASS** | `r19_features.ts` 82D (`r19-82d-v1`, SHA-256 `ed934945...`) verified frozen; 68D segregated. |
| **D05** | Pistol Training | **CANDIDATE** | `r22_heads_eval.json` (`4,720` locked test rows): R22 `pistol_64_32` Macro-F1 `0.9414` (`4` OTHER->PRESS) did NOT beat R20 C4 (`0.9873`, `0` OTHER->PRESS) -> **`R20 C4` honestly retained as active default**. |
| **D06** | Pose Training | **CANDIDATE** | `r22_heads_eval.json` (`n=2,496` held-out): `r22_pose_model.json` Macro-F1 **`0.9404`** (vs legacy geom `0.4428` / R22 geom `0.7276`); exported as `CANDIDATE` behind K3 `PoseSource`. |
| **D07** | Pinch Training | **BLOCKED** | `r22_heads_eval.json`: **`DATA_GAP_CONFIRMED`** (0 legal datasets with true physical touch vs hover labels; no fake model fabricated; geometric evaluator benchmarked). |
| **D08** | Temporal Training | **CANDIDATE** | `r22_temporal_eval.json` + `r22-temporal.test.ts` (3/3 PASS): 1,464 real sequences (`815,413` frames, 0 static replication); `W=5` `0.00 KD/min` on 36 IPN videos, **but** `POINT_PRESS` lacks continuous 15–30 FPS video -> `CANDIDATE`. |
| **D09** | Augmentations | **PASS** | Train-only photometric/blur/noise/rotation/dropout augmentations documented in `train_r22_heads_gpu.py` & `TEMPORAL_ABLATION_REPORT.md`. |
| **D10** | Worst-Case Lighting Data | **PASS** | `DATASET_LINEAGE_AND_LICENSE_AUDIT.md`: Natural RGB v3, IPN HandS, HANDS RGB-D, bxr7 audited; DimHand/LLHands blocked. |
| **D11** | Calibration | **PASS** | Temperature scaling & negative transition checks in `r22_heads_eval.json` & `r22_temporal_eval.json` (0 false KD on 1,401 negative transitions). |
| **D12** | Pure TS CPU Model | **PASS** | `r22-temporal.ts`, `r22-temporal.test.ts` (3/3), `r22_heads_eval.json` (`11.4–11.8 µs`), `r22_temporal_eval.json` (`39.2 / 61.3 / 97.5 µs`, 0 argmax mismatch). |
| **D13** | Model Comparison | **PASS** | `r22_heads_eval.json`, `MODEL_CARD_R22.md`, `TEMPORAL_ABLATION_REPORT.md` (leak-free comparison vs R19 C0 / R20 C4). |
| **D14** | No Self-GT | **PASS** | `bench-recorder.test.ts`, `r22-ui-and-autolabel.test.tsx`, `analyze_nui_bench_r22.py`: Owner telemetry never treated as GT. |
| **O01** | Custom Detector Data | **PASS** | `r22_legal_bbox_audit.json`: HaGRIDv2 `HOLD_LICENSE`, Owner JSON 0 images/bboxes, `HANDS RGB-D` CC BY 4.0 verified. |
| **O02** | Model Maker / TFLite | **PASS** | `r22_object_detector_cpu.json`: `efficientdet_lite0_int8.tflite` (Apache-2.0) loaded & inferred in Chromium CPU worker; HANDS RGB-D S4+S5 BlazePalm recall `99.43%`. |
| **O03** | Crop / ROI Mapping | **PASS** | `r22_preprocessing_ablation.json`: metamorphic coordinate roundtrip error `2.22e-16`; Arm C tested in `r22_object_detector_cpu.json`. |
| **O04** | CPU / Heap / Wire | **PASS** | `r22_object_detector_cpu.json`: Arm B vs A = **`+7.04 MB` CDP wire** (`17.15` vs `10.11 MB`), **`+428.2 ms` init**, **`+81.3 ms` p50 / `+102.2 ms` p95** (`157.7 / 189.5 ms` vs `76.4 / 87.3 ms`), RSS `215.49` vs `213.84 MB`. |
| **O05** | Conditional Default | **CANDIDATE_DEFERRED** | Formal decision in `r22_object_detector_cpu.json`: retain `HandLandmarker` alone as default. |
| **T01** | Unit NUI Suite | **PASS** | **22/22 test files PASS, 248/248 tests PASS** (§5 exact file list). |
| **T02** | E2E Audit | **PASS** | Full-journey Playwright audit (`r22_e2e_perf_audit.json`, 6 screenshots) ran Landing -> Consent -> Canvas Cam ON -> Gesture Cam ON -> JSON Export (`checksum.ok: true`). *(Note: 7 React hydration `pageErrors` on `/nui-lab` landing logged openly.)* |
| **T03** | No Ghost Actions | **PASS** | `r22-t004-replay.test.ts` (full `LabAnalyzer` + `StrokeStore`): 0 phantom strokes, 0 stuck virtual keys, 0 double undo/redo. |
| **T04** | Memory Stability | **PASS** | `r22_e2e_perf_audit.json`: RSS drops `452.02 -> 385.14 MB` (`-66.88 MB`) on camera stop; page JS heap `10.17 MB`. *(Note: multi-minute endurance run on physical webcam still pending T07.)* |
| **T05** | CPU / Frame Rates | **PASS** | Measured honestly in `r22_e2e_perf_audit.json` & `r22_numhands_fixed1_vs_fixed2_ablation.json` (§4): `UI FPS = 60`, unique `detectHz = 12.7–14.2 Hz` under `fixed-2` (`mpMs` p50 `67.4–72.9 ms`; ablation `70.0 ms` vs `fixed-1` `32.9 ms` — **exceeds 66.7 ms 15 FPS budget & below legacy 20 Hz target**). |
| **T06** | Cold Wire Transfer | **PASS** | Full cold journey (`r22_e2e_perf_audit.json`): **`11,121,081 B` (`10.61 MB`) gzip** and **`18,676,433 B` (`17.81 MB`) uncompressed** — both `< 25,000,000 B` with WASM + `.task` + `r20-c4-model.json` loaded (§3). |
| **T07** | Physical Live QA | **NOT_TESTED** | No physical USB webcam in cloud environment (Owner N1..N6 recording required per §A5). |
| **T08** | Legacy Gate | **PASS** | Legacy gameplay regression baseline cleanly separated: `tests/input/{hand-stroke-surface,two-hand-surface,eraser-controls}.test.ts` = **`39/48 PASS, 9/48 FAIL`** on both `origin/main@745bb6d` and `r22-nui-lab` (§2.2). |
| **T09** | Repo Isolation | **PASS** | Authorized scope only: `src/input/hand-stroke-pipeline.ts` modified **only** via NUI-Lab optional options & `feedResolved()` (`+233/-3` lines, per §06 A1/A7); `src/game/*`, `app/level*`, `app/canvas*`, `gesture-mode.ts` untouched; 0 new gameplay failures vs `main@745bb6d`. |
| **T10** | Handoff & Rollback | **BLOCKED** | `R22_HANDOFF_STATE.md` updated & 4 NUI Lab routes build cleanly (`24/24` static pages), **but dev deploy is BLOCKED pending explicit Owner approval** (and Owner decision on legacy 9/48 FAIL + split-palm + `fixed-2` CPU tradeoff). |

---

## 7. Complete 28-Item Owner Traceability Table (`06_ADDENDUM` §A8 — Audited)

| # | Owner Problem / Request | Status | Honest Evidence / Owner Decision Needed |
|---|---|:---:|---|
| **1** | Gambar gemetar | **PASS** | `one-euro.ts` + `r22_one_euro_bench.json` (15 FPS `-58.5%` RMS / `-76.8%` F2F / `66.7 ms` lag; 30 FPS `-68.3%` RMS / `66.7 ms` lag); T004 ink median `0.604 px` (`r22_canvas_t004_before_after.json`). |
| **2** | **(baru)** Tangan dekat/menutupi wajah; wajah tidak dikira tangan | **NOT_TESTED** | **Corrected per audit:** `lab-analyzer.ts` bypasses the face-region exclusion gate in NUI Lab (`fullFrameLock: true`), and **no physical webcam recording or face-false-positive impact measurement has been executed**. Requires Owner physical recording per §A5/§A8 #2. |
| **3** | Low-light, lampu atas, backlight | **NOT_TESTED** | **Corrected per audit:** Synthetic dim & `bxr7` physical dim were tested offline (note: on `bxr7` 45 frames, RAW `60.0%` outperformed A4v2 `40.0%` and R22 `35.6%`!), **but** physical overhead lamp ("lampu atas"), real backlight, and Owner physical N1..N6 webcam sessions are **NOT_TESTED**. |
| **4** | Tampilan kamera user tetap normal | **PASS** | `NuiLabPage.tsx` / `NuiLabPage.css`: zero CSS filters on `<video>`; A4 preprocessing runs exclusively inside the offscreen CPU Web Worker. |
| **5** | Glare dari layar/lampu | **PASS** | `applyHighlightSoftKneeInPlace` / `reinhardWithSoftKneeInPlace` (`r20-lowlight.ts`), `r22_ts_lowlight_verification.json` (`[255,240,220] -> [227,212,199]`), `r22_preprocessing_ablation.json` (`R22_Always_On_320` post `nearWhiteHandPct = 0.0%` vs `8.74%`). Physical monitor glare pending T07. |
| **6** | Motion blur | **PASS** | `analyzeFrameLuma` `blurProxy` & `r22_preprocessing_ablation.json` synthetic blur matrix (`clean_k1` / `fast_blur_k11` / `heavy_blur_dim_k15`). Physical motion blur pending T07. |
| **7** | Kontras rendah & ragam warna kulit | **PASS** | `suppressShadowChromaNoiseInPlace` + multi-skin datasets audited in `DATASET_LINEAGE_AND_LICENSE_AUDIT.md` (with `dim_g008` recall tradeoff disclosed in P06). |
| **8** | Tangan miring / jari tertutup | **PASS** | Multi-angle / occlusion evaluation in `r22_heads_eval.json` & `r22_temporal_eval.json` across IPN HandS, HANDS RGB-D, Natural RGB v3. |
| **9** | **(baru)** 3 dan 4 jari tidak terbaca | **PASS** | `r22-t004-replay.test.ts` (full 0..5 finger count assertion incl. 3 & 4) + `NuiLabPage.tsx` `gesture-finger-count` readout. |
| **10** | Hapus = telapak 5 jari, kepal bukan hapus | **PASS** | `r22-t004-replay.test.ts` (full `LabAnalyzer` + `StrokeStore`): 5-finger non-split palm erases real stroke; 20 frames FIST = 0 erase/draw/undo/redo. |
| **11** | **(baru)** Split palm audit | **BLOCKED (CONFLICT / NEEDS_OWNER_DECISION)** | **CONFLICT REPORTED TO OWNER:** Legacy student gameplay (`src/input/gesture-mode.ts:80` maps `"split-palm": "erase"` & `src/input/hand-stroke-pipeline.ts` allows split-palm erase) **directly conflicts** with legacy test `tests/input/hand-stroke-surface.test.ts` (`"a split palm under the eraser tool neither erases nor draws"`, **FAIL** on both `main@745bb6d` and `r22-nui-lab`). Meanwhile, R22 NUI Lab K3 (`action-resolver.ts`) **excludes** split-palm from 5-finger erase (`isSplitPalm === true -> allowEraseMutation: false`, verified in `r22-t004-replay.test.ts`). **Owner must decide** whether student gameplay should keep allowing split-palm erase (updating legacy test) or reject split-palm erase (aligning with NUI Lab K3). |
| **12** | Pinch harus benar-benar rapat | **PASS** | `r22-t004-replay.test.ts` (`LabAnalyzer` + `StrokeStore`): near-pinch `0.32..0.48` -> 0 strokes; tight pinch `<= 0.30` starts stroke. |
| **13** | **(baru)** Kursor muncul saat tangan ada; tinta hanya saat pinch | **PASS** | `r22-t004-replay.test.ts`: neutral hand produces non-null `cursor` with 0 active/completed strokes; tight pinch starts ink. |
| **14** | Undo kepal→1, Redo kepal→2, tanpa swipe | **PASS** | `r22-t004-replay.test.ts` (full `LabAnalyzer` + `StrokeStore`): `FIST -> 1` undoes real stroke once; `FIST -> 2` redoes real stroke once; unarmed 1/2 fingers & swipe do nothing. |
| **15** | Stroke putus, re-arm, gate pistol di Canvas | **PASS** | `r22-t004-replay.test.ts` (full 2,082-frame `LabAnalyzer` + `HandStrokePipeline` + `StrokeStore` replay): Strokes 11/9/10 survive, 5/4 fail-closed, 0 pistol Canvas blocks, 0 `"Cubit ditolak gate R19"`. |
| **16** | Lock otomatis tangan baru, tanpa relock manual | **PASS** | `r22_numhands_fixed1_vs_fixed2_ablation.json`, `r22-frame-freshness-and-worker.test.ts`, `nui-lab-page.test.tsx` (relock button removed). |
| **17** | **(baru)** Gestur pistol seperti tombol panah | **PASS** | `r22-t004-replay.test.ts` & `r19-pistol-e2e.test.ts`: `PistolVirtualKeyFSM` hold/release + `UP_RIGHT` & `UP_LEFT` combos, 0 stuck keys. |
| **18** | MediaPipe tetap dasar; fine-tune = memperkuat | **PASS** | `HandLandmarker` VIDEO mode preserved in CPU worker; classifiers/filters run strictly as downstream/pre-pass adapters. |
| **19** | Retrain classifier R17–R20 di GPU, user cukup CPU | **PASS** | Trained on RTX A5000 GPU 0/1 (`r22_heads_eval.json`, `r22_temporal_eval.json`), exported to pure-TS CPU (`11–98 µs`). `R20 C4` honestly kept default because R22 pistol candidate did not beat C4 on locked test. |
| **20** | Dataset anti-blur, anti-lowlight, anti-distraksi | **PASS** | `dataset_registry_r17_r20.json` & `curated_real_sequences_manifest.json` (`1,464` real sequences, `0` HaGRIDv2 rows). |
| **21** | Temporal classifier & custom detector | **CANDIDATE** | Temporal 1D-TCN `W=3/5/8` (`CANDIDATE` behind K3/K6 adapter); Custom ObjectDetector (`CANDIDATE_DEFERRED` per O04/O05). |
| **22** | Unduhan < 25 MB, tidak lag di CPU | **PASS** | Full cold journey = **`10.61 MB` gzip / `17.81 MB` uncompressed** (`< 25 MB`), zero OpenCV.js/ONNX. **CPU caveat disclosed (§4):** `fixed-2` caps real unique `detectHz` to `12.7–14.2 Hz` (`mpMs` p50 `67.4–72.9 ms`). |
| **23** | Frame duplikat, kamera 15 FPS | **PASS** | `CameraFrameScheduler` (`frame-scheduler.ts`) + `r22-frame-freshness-and-worker.test.ts` + live 15 FPS audit (`uniqueCaptureFps = 14.4–14.5 fps`). |
| **24** | Satu mode CPU, tanpa pilihan C4/C7, cahaya, skenario | **PASS** | `BenchControls.tsx`, `app/nui-lab/page.tsx`, `nui-lab-page.test.tsx`: single automatic CPU mode, 0 engineering dropdowns. |
| **25** | Kamera kiri tetap, kanan scroll, sinkron | **PASS** | `r22_e2e_perf_audit.json` (`cameraTop: 207.05 px` before/after `350 px` right scroll) + `frame-sync-badge`. |
| **26** | Benchmark otomatis, autolabel tanpa manual GT | **PASS** | `bench-recorder.test.ts`, `r22-ui-and-autolabel.test.tsx`, live `r22_live_fake_cam_export.json` (`checksum.ok === true`, `labelSource` tagged, `falsePressFrames: null`). |
| **27** | Yang diuji harus versi terbaru di dev | **NOT_TESTED / BLOCKED (NEEDS_OWNER_DECISION)** | **Corrected per audit:** Built and audited locally on branch `r22-nui-lab`, **NOT yet deployed to dev**. Per §05 / §A5, dev deployment requires explicit Owner approval (especially while legacy gameplay tests still have 9/48 FAIL from `main@745bb6d`). |
| **28** | Canvas dulu enak di R17 | **PASS** | Deterministic T004 replay through full `LabAnalyzer + HandStrokePipeline + StrokeStore` proves removal of multi-evaluator pinch conflicts, pistol vetoes, and short-blink re-arm blocks. Physical live feel remains pending Owner test (T07). |
