# R19 Stage P4 — Isolated Chromium WASM Browser Runtime Benchmark (`180 s`)

- **Artifact Verified:** [`r19_browser_runtime.json`](./r19_browser_runtime.json)
- **Model Under Test:** [`r19/models/r19_model_mlp.json`](../models/r19_model_mlp.json) (`[82 -> 96 -> 48 -> 3]`, `T = 1.27`, **`122,768 B`** raw / **`47,288 B`** HTTP wire) + [`r19_integrated.ts`](../candidates/r19_integrated.ts) (`G4_Hybrid`, `tauPress = 0.38`, `tauPressRescue = 0.60`, `otherVetoTau = 0.72`)
- **Evidence Class:** **`BROWSER_SIMULATED_VIDEO`** (headless `chromium-headless-shell` via `--use-file-for-fake-video-capture`)
- **Physical Webcam Status:** **`NOT_TESTED`** (simulated `.y4m` playback does not substitute for physical webcam hand-ergonomics or laptop GPU WebGL validation)

---

## 1. Multi-Condition Test Video (`r19_sim_cam.y4m`)

Built strictly from held-out **`TEST`** splits (zero train/val overlap):
- **Format:** `640x360` YUV420p @ `10 fps`, `396` frames (`39.6 s` loop cycling ~`4.55x` over `180.53 s`), `136,860,054 B` local harness fixture (excluded from git push).
- **Composition:**
  - `HandGesture-5G test`: `L-Sign` (`112` frames), `Pointing Up` (`80` frames), `V-Sign` (`32` frames), `Fist` (`32` frames) interleaved `Pointing Up <-> L-Sign`
  - `Natural RGB v3 test` (`p02`, `p05`): `point_left`, `point_right`, `thumbs_up`, `peace_sign`, `dim`, `green_led`, `backlit` (`70` frames)
  - Cached `Mendeley bxr7kx84y6`: `DimLight` (`30` frames), `NaturalLight` (`20` frames)
  - Adversarial `N0` distractors: `N0_l_sticks` (`10` frames), `N0_dark_room` (`10` frames)

---

## 2. Cold First-Use Wire Transfer Budget (`B-USER < 25 MB`)

Visited all `11` app routes (`/`, `/onboarding/{card,number,cam}`, `/levels`, `/canvas1..3`, `/level1..3`) plus `/r19-harness/index.html` (`CDP Network.loadingFinished`):

| Payload Group | Measured Wire Bytes | Size | Budget Status |
|---|---:|---:|---|
| Next.js app routes + MediaPipe WASM/Task + BlazeFace | `11,006,521` B | `10.50 MiB` | Baseline (`hand_landmarker.task` `7.82 MB` + `vision_wasm_internal.wasm` `2.72 MB`) |
| `harness.bundle.js` (`G0+G1+R19+CLAHE`) | `71,733` B | `70.05 KiB` | Small JS overhead |
| **`r19_model_mlp.json` (compressed over HTTP)** | **`47,288` B** | **`46.18 KiB`** | **`<= 200 KB` PASS** (`122,768 B` raw) |
| **Total First-Use + NUI Cold Wire (`B-USER`)** | **`11,356,084` B** | **`10.83 MiB`** | **`PASS` (`< 25 MB` headroom `13.17 MB`)** |

---

## 3. Sustained `180 s` Checkpoints (`20 s`, `60 s`, `120 s`, `180 s`)

| Checkpoint | Frames (`mpFps`) | Det Rate (`Adaptive`) | CLAHE Hits / Calls | `detectMs` `p50 / p95` | `r19Ms` `p50 / p95` | `e2eMs` `p95` | `JSHeapUsed` | `KeyDown / KeyUp / Jump` |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **`20 s`** | `249` (`12.31`) | `96.39%` | `0 / 0` | `68.3 / 120.1 ms` | **`0.1 / 0.2 ms`** | `121.7 ms` | `7.01 MB` | `10 / 10 / 10` |
| **`60 s`** | `822` (`13.63`) | `85.28%` | `21 / 74` | `67.7 / 118.4 ms` | **`0.1 / 0.2 ms`** | `120.2 ms` | `7.82 MB` | `20 / 20 / 20` |
| **`120 s`** | `1,696` (`14.09`) | `79.36%` | `61 / 229` | `67.1 / 97.3 ms` | **`0.1 / 0.2 ms`** | `107.6 ms` | `8.10 MB` | `31 / 31 / 31` |
| **`180 s`** | `2,559` (`14.18`) | `81.87%` | `79 / 309` | `67.1 / 75.7 ms` | **`0.1 / 0.2 ms`** | `101.8 ms` | `7.89 MB` | **`50 / 50 / 50`** |

- **Final After-Stop Totals (`180.53 s`):** `2,560` frames (`14.18` effective MP FPS), `rawHits = 2,017` -> **`adaptiveTotalHits = 2,096` (`81.88%`)** via `+79` CLAHE recoveries (`claheMs p50 = 1.9 ms, p95 = 2.1 ms`), `r19Ms` `p50 = 0.1 ms` / `p95 = 0.2 ms` / `max = 3.0 ms`.
- **Clean Lifecycle & Error Check:** `page_errors = []`, `console_errors = 3` TFLite XNNPACK info messages only (`INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`), `stoppedCleanly = true` (`tracksEndedCount = 1 / 1`), `postStopCdpPerf.jsHeapUsedMB = 8.20 MB` (`nodes = 194`, zero leak).
- **Behavioral Safety (`2,560` frames):**
  - Baseline `G0_main` misfired `1,550` steering frames (`Pointing Up`, `V-Sign`, `Fist`, `thumbs_up`, distractors).
  - **`R19 G4_Hybrid`** separated `r19ReadyFrames = 318` vs `r19PressFrames = 761` vs `r19OtherFrames = 1,017`, firing **`50` `KEYDOWN`, `50` `KEYUP`, `50` `Jump` (`0` stuck keys)** alongside `r19EraseFrames = 29`, `r19PinchFrames = 170`, and **`0` accidental `Swipe` triggers**.
- **LongTasks Caveat:** Headless Chromium uses CPU XNNPACK (`delegate = "CPU"`, `reason = "software-renderer"`), so synchronous ~`67 ms` WASM `detectForVideo` calls generate `2,349` main-thread `>50 ms` LongTasks (`max = 184 ms`). R19 inference itself contributes `< 0.2 ms` p95 (`< 0.3%`); real WebGL GPU delegate latency must still be checked on Owner hardware.
