# R22_HANDOFF_STATE.md — Live Orchestration, Audit & Dev Preview Handoff (§A7–A9)

- **Last Updated:** `2026-11-20T06:26:00+07:00`
- **Base `main` HEAD:** `745bb6d840793dcab8558f65aef6bfac58807e79` (`0.29.1-alpha`, untouched)
- **Active Branch / Deployed Code Commit:** `r22-nui-lab` (`968f9df9dbd0a700f1ac73a4e5ac9af910d3b304`)
- **Isolated Worktree:** `/srv/sketchbook/mediapipe-optimize/r22-nui-lab`
- **Research Output Workspace:** `/srv/sketchbook/mediapipe-optimize/research-can/r22/`
- **Current Phase:** **DEV_PREVIEW_DEPLOYED — READY FOR OWNER PHYSICAL WEBCAM QA (N1..N6)**

---

## 1. Live Dev Preview Deployment & Rollback (Production Untouched)

- **Live Isolated Dev Preview URL (HTTPS):** `https://outsourcing-yarn-crops-maine.trycloudflare.com`
  - Landing: `https://outsourcing-yarn-crops-maine.trycloudflare.com/nui-lab`
  - Canvas (default `fixed-2`, `raw`): `https://outsourcing-yarn-crops-maine.trycloudflare.com/nui-lab/canvas`
  - Canvas (`?hands=1` -> `fixed-1` CPU override): `https://outsourcing-yarn-crops-maine.trycloudflare.com/nui-lab/canvas?hands=1`
  - Gesture (default `fixed-2`, `raw`): `https://outsourcing-yarn-crops-maine.trycloudflare.com/nui-lab/gesture`
  - Gesture (`?hands=1` -> `fixed-1` CPU override): `https://outsourcing-yarn-crops-maine.trycloudflare.com/nui-lab/gesture?hands=1`
- **Hosting Architecture:** Dedicated isolated Docker containers (`r22-nui-lab-dev-web` on `127.0.0.1:8086` running `caddy:2.10-alpine` with `encode zstd gzip`, `Cache-Control: public, max-age=3600` on `/models/*`, `/mediapipe/*`, `/_next/static/*`, `no-cache` on HTML + `r22-nui-lab-dev-tunnel` running `cloudflare/cloudflared:latest`).
- **Production & Existing Services Untouched:** `app.momominum.tech`, `hitl-web-1` (`:8006`), `hitl-admin-1`, `hitl-backend-1`, `hitl-tunnel`, and `main` branch were NOT modified.
- **Note on `dev.momominum.tech`:** `dev.momominum.tech` is hosted under the separate `agentops` (Ujang) user tunnel, which `deano` has no write access to modify. Ujang can point `dev.momominum.tech` to `/srv/sketchbook/mediapipe-optimize/r22-dev-deploy/releases/968f9df` (or build commit `968f9df9dbd0a700f1ac73a4e5ac9af910d3b304` with `NEXT_PUBLIC_TEST_HOOKS=0 NEXT_PUBLIC_GIT_COMMIT=968f9df9dbd0a700f1ac73a4e5ac9af910d3b304 NEXT_PUBLIC_GIT_BRANCH=r22-nui-lab npm run build`).
- **Pinned Artifact SHA-256 (`/srv/sketchbook/mediapipe-optimize/r22-dev-deploy/releases/968f9df/SHA256SUMS.txt`):**
  - `nui-lab.html`: `47df811643c549ae89e7890a4799b0571f45f6ce4d12ca34fc6c7cb289f0b7f7`
  - `nui-lab/canvas.html`: `b64ac36ccc4cc0b82523d0e3670fa730d95bb59bf568d6e8ddf87f26a5f63d11`
  - `nui-lab/gesture.html`: `328c083e998323affdddb80540ba1a3cd661cf8561b418a5162769bd586ebea8`
  - `models/hand_landmarker.task`: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`
  - `models/r20-c4-model.json`: `e863ef1afe459a3b0a4cf0b0b2594a1db853b382d669add2d7be234e64710a27`
  - `mediapipe/wasm/vision_wasm_internal.wasm`: `f82a8e6c05e08a44cc9f9e7ec5f845935bcbb1b1500ebe8c2f4812fb4e2917dc`
- **Rollback Commands (`/srv/sketchbook/mediapipe-optimize/r22-dev-deploy/rollback.sh`):**
  - Instant teardown (stops & removes isolated R22 dev containers): `/srv/sketchbook/mediapipe-optimize/r22-dev-deploy/rollback.sh teardown`
  - Switch staged release symlink: `/srv/sketchbook/mediapipe-optimize/r22-dev-deploy/rollback.sh switch <short-sha>`

---

## 2. Owner Decisions Applied (2026-11-20, Commit `968f9df`)

1. **Split Palm (`A8 #11`):** In NUI Lab (`action-resolver.ts`, `lab-analyzer.ts`), **5-finger split palm = HAPUS** (consistent with `gesture-mode.ts:80`); 4-finger split palm (thumb tucked) does NOT erase. Student gameplay & legacy tests (`tests/input/*`, `gesture-mode.ts`) untouched.
2. **`numHands` Policy & Hidden Override:** Default `fixed-2`; hidden URL override `?hands=1` -> `fixed-1` (zero UI selector), recorded in `TrialMeta.engine`, `TrialMeta.detectorConfig.numHandsOverride = "url:?hands=1"`, `TRIAL_START` event, and per-frame `numHandsActive`. Verified live: `fixed-1` dropped 15 FPS `mpMs` p50 from `105.6 ms` (`10.4 Hz`) to `53.8 ms` (`15.3 Hz`, `runtimeSetOptionsCalls = 0`).
3. **Default Preprocessing (`engines.ts:62`):** Changed `DEFAULT_PREPROCESS` from `"a4"` to `"raw"` (also worker initial default `"raw"`); `a4` and `r22-soft-knee-shadow-clamp` retained as candidates and recorded in `TrialMeta.preprocessConfig`.
4. **7 React Hydration Errors Fixed:** Added deterministic `getServerSnapshot` on `LabBenchConfigStore` (`SSR_DEFAULT_BENCH_CONFIG`) and `BenchSessionManager` (`SSR_BENCH_STATE`) for `useSyncExternalStore`. Live Playwright verification on cold load, reload after consent, and all live Caddy routes: **`0` `pageErrors`**.
5. **Code-Level Review of `w-canvas` & `w-runtime` Completed:** Full line-by-line audit performed by `Gemini 4 Neon (XHigh)`; 6 concrete defects fixed directly in `968f9df` (zero-empty-frame stall > 360 ms bridge fix in `action-resolver.ts` & `hand-stroke-pipeline.ts`, fragile Indonesian string `isStale` comparison replaced with boolean in `lab-analyzer.ts`, unhandled promise rejections on worker crash auto-restart in `r20-worker-client.ts`, hidden `framesDroppedBeforeDispatch` surfaced in `NuiLabPage.tsx:recordPerfTick`, bystander glare leak & `temporalPrev` retention fixed in `r20-hand.worker.ts`, redundant tautology & JSDoc mismatch fixed in `worker-owner-guard.ts`). Remaining tradeoffs (double-lock threshold drift between `WorkerOwnerGuard` & `FullFrameHandLock`, `crossing-handedness-flip` liveness tradeoff, `cursorFilterMode` default in `NuiLabPage.tsx`) documented in `R22_QA_AND_ACCEPTANCE_EVIDENCE.md` §8.

---

## 3. Model Mapping, Mid-Run Switches & `DOWNGRADED_MODEL` Audit (§A6 & §A9)

| Member | Assigned Tier (§A6) | Initial Model | Mid-Run Switch(es) & Timestamps | Downgrade Flag | Code/QA Review Status |
|---|---|---|---|---|---|
| `coordinator` (`ORCH`) | `T-ORCH` (Argon) | `gemini-4-argon-high` | `Gemini 3.8 Flash (High)` (`20:26`) -> **`Gemini 4 Neon (XHigh)`** (`05:30`) | `DOWNGRADED_MODEL` (`20:26–20:50`); restored to `T-STRONG` | Executed Rev 2 audit, code-level review, Owner decisions (`968f9df`), and isolated dev deploy |
| `w-qa` | `T-LIGHT` (Hydrogen) | `gemini-4-hydrogen-xhigh` | **`gemini-3.8-flash-medium`** (`20:11`) | **`DOWNGRADED_MODEL`** (Rev 1 rejected) | Fully rewritten & re-verified by `Gemini 4 Neon (XHigh)` |
| `w-runtime` | `T-STRONG` (Neon) | `gemini-4-neon-xhigh` | Completed `[done]` (#18) on Neon; switched to `gemini-3.8-flash-medium` post-done (`20:11`) | Post-done switch only | Full line-by-line code review completed; 4 fixes applied in `968f9df` |
| `w-canvas` | `T-STRONG` (Neon) | `gemini-4-neon-xhigh` | `gemini-4-argon-high` -> **`gemini-3.8-flash-medium`** (`20:11`, finished `[done]` #29) | **`DOWNGRADED_MODEL`** (finalization) | Full line-by-line code review completed; 3 fixes + Owner split-palm decision applied in `968f9df` |
| `w-data` | `T-STRONG` (Neon) | `gemini-4-neon-xhigh` | **`gemini-3.8-flash-medium`** (`20:11`, `[done]` #30) | **`DOWNGRADED_MODEL`** | Verified eval JSON, SHA-256, zero leakage, honest `R20 C4` retention |
| `w-temporal` | `T-STRONG` (Neon) | `gemini-4-neon-xhigh` | **`gemini-3.8-flash-medium`** (`20:11`, `[done]` #31) | **`DOWNGRADED_MODEL`** | Verified + direct unit tests `r22-temporal.test.ts` (3/3 PASS) |
| `w-ui` | `T-LIGHT` (Hydrogen) | `gemini-4-hydrogen-xhigh` | `gemini-4-argon-high` (`[done]` #20) -> `gemini-3.8-flash-medium` (`20:11`) | None during execution | Verified + 7 hydration errors fixed (`0` `pageErrors`) |
| `w-bench` | `T-LIGHT` (Hydrogen) | `gemini-4-hydrogen-xhigh` | 1-line fix (#27) on **`gemini-3.8-flash-medium`** (`20:11`) | **`DOWNGRADED_MODEL`** (1-line fix) | Verified via Vitest, live export checksum, `?hands=1` & RAW metadata |
| `w-robust` | `T-LIGHT` (Hydrogen) | `gemini-4-hydrogen-xhigh` | **`gemini-3.8-flash-medium`** (`20:11`, Rev 1 report) | **`DOWNGRADED_MODEL`** (Rev 1 had fabricated numbers) | Report rewritten directly against raw JSONs |
| `monitor` | `T-ORCH` | `gemini-4-argon-high` | `gemini-3.8-flash-medium` (`20:11`) | `DOWNGRADED_MODEL` | Inactive |

---

## 4. Verified Quality & Measurement Summary (`r22-nui-lab@968f9df`)

- **NUI Lab + Build Manifest Vitest:** **`22/22` files PASS, `253/253` tests PASS** (0 external `/srv` paths).
- **Student Gameplay Legacy Suite (`tests/input/*` — untouched):** **`39/48 PASS, 9/48 FAIL`** (identical 1-to-1 to `origin/main@745bb6d`).
- **Typecheck / Lint / Static Build:** `tsc --noEmit` = **0 errors**; `npm run lint` = **0 errors / 0 new warnings**; `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` = **24/24 static pages**.
- **Hydration & Live Browser E2E:** **`0` `pageErrors`** on cold load, reload after consent, `/nui-lab/canvas`, `/nui-lab/canvas?hands=1`, and `/nui-lab/gesture`.
- **Full-Journey Cold CDP Wire (`r22_e2e_perf_audit.json`):** Gzip **`11,121,924 B` (`10.61 MB`)** / Server `11,124,070 B` (**PASS `< 25 MB`**); Uncompressed **`18,679,991 B` (`17.81 MB`)** / Server `18,703,156 B` (**PASS `< 25 MB`**).
- **Remaining Physical Tests (`NOT_TESTED`):** Owner physical webcam recordings N1..N6 (P03, A8 #2 hand near/covering face, A8 #3 low-light / overhead lamp / backlight, T07 live physical feel).

---

## 5. R22B HandState, Canvas UX, Telemetry v2.1 & Low-Light Diagnostics (`r22b-handstate`, Wave 1 Complete / Wave 2 Pending Owner Capture)

- **Last Updated:** `2026-11-20T10:45:00+07:00`
- **Base Commit:** `r22-nui-lab@1bb1a71` (untouched; `main@745bb6d` untouched; `src/input/**` diff = 0 lines)
- **Active Branch / Worktree:** `r22b-handstate` (`/srv/sketchbook/mediapipe-optimize/r22b-handstate`) — **NO DEPLOY** (Owner instructs Ujang with final `r22b-handstate` SHA)
- **Research Output Workspace:** `/srv/sketchbook/mediapipe-optimize/research-can/r22b/`
- **Mandate Reference:** `research-can/docs/plan-rev/R22B/02_MANDAT_AGY_R22B.md`
- **Contract Versions:** `K3.1` (Pinch Gate G1' + Onset/Release/Preset), `K4 v1.1` (Compositional HandState), `K7` (Dataset Registry), `K8 v2.1` (Export `schemaVersion: "nui-lab-bench-export/2.1"`), `K11` (`CanvasMechanismPreset`, 5 presets)

### 5.1 R22B Model Mapping & Independent Review Audit (§A9 / B8)
- **Implementation & QA Execution:** `Gemini 4 Neon (XHigh)` (`T-STRONG`, 0 mid-run downgrades)
- **Independent-Model Code & QA Review (`r22b-reviewer`):** `Gemini 4 Hydrogen (XHigh)` (`T-STRONG`, different model family per B8/A9; identified 2 HIGH + 2 MEDIUM real findings — B1.8 `allow-after-confirm` frame-2 distance bypass, B3 `analyze_r22b.py` `ev.data` vs `ev.detail` & `NO_HAND` scoring, B1.2 latched post-FIST onset guard, and metadata/validation hygiene — ALL fixed and regression-tested before final commit).

### 5.2 R22B Wave 1 vs Wave 2 Status
- **Wave 1 (COMPLETE & VERIFIED):**
  - **B1 (1–10):** G1' onset gate (`13/13` S-970 `FIST_OR_TRANSITION` blocked, `299/303 = 98.7%` S-970 CLOSED, `103/103 = 100%` S-970 OK, `204/204 = 100%` T004), full S-970 T002 landmark replay (`0` `STROKE_START` in `undoWindowMs [155800, 168000]`, `>= 5` `UNDO` preceded by `ARMED_FIST`, all 8 long strokes preserved), 2-frame onset + backfill (`LabStrokeDriver`), latched `>= 300 ms` post-FIST/ONE/TWO onset guard, `>= 150 ms` release debounce + `PINCH_RELEASE_BRIDGED` + retro-trim, `<= 100 ms` fist hold flicker tolerance, strict FIVE, `lastCommand` 1,500 ms / 300 ms hand-loss expiry, 5 K11 presets, `reacquirePinchPolicy` (`require-release` default vs `allow-after-confirm`).
  - **B2 (1–8):** Result-arrival stale banner (`> max(250, 2.5*p50)`, `"Kamera tersendat"` only `> 500 ms`, NEVER blanks skeleton overlay), auto-expiring command pill, compositional HUD (`Kontak/Varian/Jari` + `"Ditahan: mirip kepal"`), K11 preset selector (`?preset=`), guided capture (`?capture=1`, 700ms/300ms edge masking), local dev `?rawrec=1` WebM recorder (separate consent, zero uploads), sustained >3s backlight tip card, >600ms hand-lost ghost cursor + banner.
  - **B3:** Export `schemaVersion: "nui-lab-bench-export/2.1"` (backwards compatible with `schema: "nui-lab-bench-export/2"`), `analyze_r22b.py` (`--session`, time-based active-window miss, lost episodes `>500ms/>1s`, event breakdown, unmasked `DATASET_GT` eval).
  - **B4:** `?mdc=&mpc=&mtc=` init-only confidence plumbing (`runtimeSetOptionsCalls === 0`), `mpRawHandCount`, `mpHandednessScores[]`, same-machine default vs low confidence benchmark (`mpMs p50 = 66.9 vs 66.8 ms`).
  - **B5.1 & Scaffolding:** `K4_v1.1_TAXONOMY.md`, `dataset_registry_r22b.json`, `build_r22b_dataset.py` (94D feature extraction, `truthMasked` drop, `<= 5 Hz` static subsampling, `PERSON_HELD_OUT = NOT_AVAILABLE` rule).
  - **B7.1–B7.2 + B7.3 Harness:** Recalibrated `backlightCandidate` (`clippedPct >= 8% && (handRoiLumaP50 <= 0.35 || lastRoiLumaP50 <= 0.35)`) & `GLARE_CANDIDATE` (`nearWhiteHandPct >= 25%`), `?camdev=1` UVC dev panel, `replay_lowlight_offline.mjs` scaffold.
  - **B8 QA:** `tsc --noEmit` (0 errors), `npm run lint` (0 errors), `tests/nui-lab/` (`22/22` files, `260/260` PASS), `tests/input/*` (`39/48 PASS, 9 FAIL` baseline intact, `0` lines changed in `src/input/**`), `next build` (`24/24` static pages with `r22b` version badge), live Playwright Chromium audit (`0` hydration/page errors, B8.3 fault injection PASS — 6,473 overlay pixels preserved during stall & clean recovery).
- **Wave 2 (`NOT_TESTED (menunggu Owner)`):**
  - Guided capture P1 (`~20 min`) & optional P2 (`~10 min`) dataset freeze (`guided-capture-p1-v1`, `guided-capture-p2-v1`).
  - B6 supervised training (`M1`, `M1x`, `M2`) & adoption gate (forbidden to train on `RULE_DERIVED`).
  - B7.3–B7.5 offline low-light replay on Owner's local `?rawrec=1` WebM clips.
  - Owner live physical webcam acceptance tests `U1–U7`.
