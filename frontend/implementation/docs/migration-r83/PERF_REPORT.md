# Laporan Performa & Guardrails — Migrasi Sandbox r8.3

| Atribut | Nilai |
|---|---|
| Tanggal laporan | 2026-11-25 (WIB) |
| Branch lokal | `r83-migration` (basis `main` @ `3908119`, `0.29.6-alpha`) |
| Cakupan audit | `app/styles/110-114*.css`, `src/**/*.css`, `src/features/shared/*`, `src/app/monui-hand-detector.ts`, `src/components/nui-lab/bench/r20-hand.worker.ts`, `e2e/r83/logs/build.log`, `e2e/r83/logs/r83-perf-report.json` |
| Status rebuild akhir Flag=0 / Flag=1 | **LULUS Wave 5 (`MOCK_MODEL` + `UNIT_ONLY` + `STATIC_ONLY`)** |

> **Aturan kejujuran bukti (§9.4):** Seluruh angka runtime Flag=1 pra-fix di §3 berasal dari snapshot baseline `2026-11-25T08:17:25.727Z` (`23/24 PASS`). Hasil build akhir Flag=0 (`route-canvas.mjs`, `guide-flow.mjs`) & Flag=1 (`e2e/r83/r83-flow.mjs` **40/40 PASS** pasca-perbaikan) tercatat pada §4 di bawah. Uji webcam fisik & CPU nyata tetap berstatus **`NOT_TESTED`** hingga Gerbang **G9** Owner.

---

## 1. Guardrails Performa CSS & Render (`STATIC_ONLY`)

Audit langsung pada seluruh CSS r8.3 (`app/styles/110-r83-fonts.css` s.d. `114-r83-momo.css`, `src/features/**/*.css`) dan `src/**/*.css` sesuai PLAN §5.6:

| Invariant (PLAN §5.6) | Status Verifikasi | Bukti Langsung dari Berkas Repo |
|---|---|---|
| `mix-blend-mode` di layer layar penuh | **0 temuan** | `Select-String` pada `app/styles/110-114*.css` dan seluruh `src/**/*.css` menghasilkan `0` baris `mix-blend-mode`. |
| `backdrop-filter` baru di r8.3 | **0 temuan di r8.3** | `0` baris `backdrop-filter` di `app/styles/110-114*.css` dan `src/features/**/*.css`. (Satu temuan lama di `src/components/onboarding/DreamLoader.css:188` adalah komponen legacy flag=0 dan tidak dipakai di `src/features/**` maupun `R83SketchbookShell`.) |
| Live fullscreen SVG `<filter>` pada `[data-ui="r83"]` | **0 overlay fullscreen** | `PaperOverlay.tsx:85-115` memakai tile grain statis `256×256` (`data:image/svg+xml` dengan `feTurbulence baseFrequency='0.65' numOctaves='3'`) yang di-repeat via `backgroundImage` dengan `opacity: 0.32` (identik `lc.js:22-33`). `cover.css:153` hanya memakai `filter: blur(8px)` pada `#perch-shadow` (`120×10px`); `112-r83-paper.css` / `113-r83-nui.css` hanya `drop-shadow` / `grayscale(1)` elemen lokal. Dua ilustrasi SVG panggung (`StageArtwork.tsx:16-19` & `CenterArt.tsx:38-41,90`) mempertahankan `<filter>` kasar lokal pada `<g>` tanah statis 1:1 dengan sandbox/main, bukan filter fullscreen. |
| 0 React commit/frame akibat gerak NUI | **Terverifikasi (`UNIT_ONLY`)** | `NuiController`, `NuiRing`, `CanvasCursor`, `PipHand`, `MomoStage`, dan `R83Bubble` menulis posisi/progres langsung ke DOM ref (`transform`, `strokeDashoffset`, `left`/`top`) di loop rAF. |
| Pembatasan render figur & layout bubble | **Terverifikasi (`STATIC_ONLY`)** | `CardWalk.tsx:154` dan `CardSafeDanger.tsx:37` membatasi render SVG `CharacterAnimationAdapter` ke `FIGURE_FPS = 30` dengan cache diff string; `bubble-placement.ts:5` men-throttle re-layout bubble/ring via `BUBBLE_REPLACE_MS = 200` dan signature. |

---

## 2. Arsitektur Detektor Tangan O-11 & Wave 5 P9a (`MoNUI-7`)

| Komponen | Lokasi | Mekanisme & Jaminan Performa |
|---|---|---|
| Dock tunggal lintas-rute (**O-11**) | `src/app/R83SketchbookShell.tsx:23`, `src/app/R83CameraDock.tsx`, `src/app/hooks/useR83Camera.ts` | Satu `MediaStream` bersama (`src/camera/shared-stream.ts`) dan satu komponen `R83CameraDock` (`#cam-pip`) bertahan across routes (disembunyikan di Cover, tampil di Tutorial/Levels/Canvas/World/Ending). |
| Adapter **MoNUI-7** (`P9a`) | `src/app/monui-hand-detector.ts:38-255` | Membungkus `LabCpuWorkerClient` -> `r20-hand.worker.ts` sebagai implementasi `HandDetector` dengan fallback aman ke `WebcamHandDetector` bila Web Worker / `createImageBitmap` tidak tersedia atau gagal init. |
| Web Worker CPU & anti-thrash | `src/components/nui-lab/bench/r20-worker-client.ts`, `r20-hand.worker.ts:5,496-516,545-560` | **1× `HandLandmarker`** di Web Worker dengan `delegate = "CPU"` (zero GPU/WebGL fallback crash), `numHandsPolicy: "fixed-2"` (`runtimeSetOptionsCalls === 0`), max `1` frame `inFlight` (`framesDroppedBusy` untuk frame ekstra), duplikat `captureFrameId` guard, `captureWidth: 320`, `bitmap.close()` di `finally`, serta `CacheStorage` (`nui-lab-models-v1`) agar `hand_landmarker.task` (`7.819.105 B`) hanya diunduh sekali. |
| **HF3** Low-Light Auto-Preprocess | `r20-hand.worker.ts:410-439,711-729` | `AutoPreprocessHysteresis` membaca luma pra-LUT (`handRoiLumaP50` lalu `lumaP50`) dan hanya mengaktifkan `A4_denoise_reinhard320` saat gelap tanpa membebani kondisi terang (`A0_raw`). |
| **MoNUI-7 YOLO Rescue FSM** | `r20-hand.worker.ts:295-330,747-837` | `RescueFSM` + `onnxruntime-web` WASM (`/ort/`) dengan verifikasi SHA-256 fail-closed dan penjaga latensi otomatis (`rescueAutoOff`: turun ke 5 Hz jika P50 > 60 ms, nonaktif penuh jika P50 > 120 ms). |

> **Status penyambungan Wave 5 P9a (terverifikasi):** `src/app/R83CameraDock.tsx` sudah memakai `MonuiHandDetector` (dengan guard StrictMode `queueMicrotask`, atribut imperatif `data-monui-mode` / `data-monui-rescue` / `data-monui-pass` tanpa re-render React, serta perbaikan `enqueueInFlight` pada `loop()` agar frame tidak terjebak drop). Diverifikasi oleh 9/9 unit test `tests/app/monui-hand-detector.test.ts` (`UNIT_ONLY`) dan atribut runtime `data-monui-mode="idle"` pada E2E headless Flag=1 (`40/40 PASS`).

---

## 3. Baseline Pra-Fix (Snapshot Sebelum Perbaikan Wave 5 P9/P9a)

### 3.1 Baseline Bundle Build P0 (`e2e/r83/logs/build.log`, `2026-11-25 10:31 WIB`, Flag=0)
- **Next.js:** `14.2.35` (`output: "export"`, 24 static pages pada P0, sebelum route `/ending` ditambah di Wave 4).
- **First Load JS shared by all:** `87.6 kB` (`chunks/966-a8fed9ded89e4fa0.js` `31.8 kB`, `chunks/fd9d1056-52b97c009c25bc25.js` `53.6 kB`, shared lain `2.16 kB`).
- **Route app utama (P0):** `/`, `/levels`, `/level1..3`, `/canvas1..3`, `/onboarding/*` masing-masing `155–156 B` route chunk (`278 kB` First Load JS).

### 3.2 Baseline Runtime Flag=1 Pra-Fix (`e2e/r83/logs/r83-perf-report.json` @ `2026-11-25T08:17:25.727Z`)
- **Kelas bukti:** `MOCK_MODEL` (Chromium headless `1280×720`, `./out` statis, tanpa kamera fisik).
- **Skor ringkas pra-fix:** **23/24 PASS, 1 FAIL** (`Zero runtime console/page errors`).
- **Metrik performa pra-fix:**
  - `routeTimingsMs.coverMount`: **`283 ms`**
  - `canvasMoveLongTasks` (20 gerakan kursor di `/canvas1`): **`0`**
  - `longTasks` (> 50 ms selama seluruh sesi): **`[]` (`0` longtask)**
  - `camPipNodes`: **`[1, 1]`** (tercatat 1 node `#cam-pip` pada cek `/levels` & `/ending`; cek posisi `fixed bottom-left y > 400` dan `data-monui-mode` belum ada di run 08:17Z)
- **Kegagalan yang tertangkap di baseline pra-fix (`08:17Z`):**
  - `20` `pageerror` React minified hydration mismatch (**17× React `#418`**, **3× React `#423`**) akibat state rute/storage dibaca langsung saat SSR hydration sebelum perbaikan Wave 5.

---

## 4. Verifikasi Pasca-Rebuild Akhir Wave 5 (`P9` + `P9a`)

Seluruh gerbang di bawah dijalankan berurutan setelah edit kode terakhir pada branch `r83-migration`:

| Gerbang / Metrik Akhir | Nilai Pasca-Rebuild | Status | Sumber Log |
|---|---|---|---|
| `npm run typecheck` (`tsc --noEmit`) & `npm run lint` | Exit `0`; `npx eslint --max-warnings 0` pada ke-22 berkas `src/` Wave 5 exit `0` (0 warning) | **LULUS (`STATIC_ONLY`)** | sweep shell Wave 5 |
| `npx vitest run` (suite penuh baseline P0) | **2734 passed / 37 failed / 2771 total** (987/1021 suite lulus; **`NEW_FAILS=0`** vs `failed-tests.txt`) | **LULUS (`UNIT_ONLY`)** | `e2e/r83/logs/vitest-wave5.json` |
| `npm run build` Flag=0 (`NEXT_PUBLIC_UI_R83=0`) | Exit `0`, 26 halaman statis (`/ending` ikut export), First Load JS shared `87.6 kB`; E2E `route-canvas.mjs` PASS (`1..7`) + `guide-flow.mjs` PASS | **LULUS (`MOCK_MODEL`)** | output `next build` Flag=0 |
| `npm run build` Flag=1 (`NEXT_PUBLIC_UI_R83=1`) | Exit `0`, 26 halaman statis (`First Load JS` shared `87.6 kB`, route app `168–169 B / 394 kB`) | **LULUS (`STATIC_ONLY`)** | output `next build` Flag=1 |
| `node e2e/r83/r83-flow.mjs` (`./out` Flag=1) | **40/40 PASS** (Cover -> Nama `"Rani"` -> Tutorial 3 Kartu -> `/levels` -> guard `/level2` `"Level"` -> `/level1` -> `/canvas1` Top-3 & stiker -> `/ending`) | **LULUS (`MOCK_MODEL`)** | `e2e/r83/logs/r83-perf-report.json` |
| React hydration errors (`#418`, `#423`, `Hydration failed`) | **`[]` (`0` error)** sepanjang sesi maupun muat langsung `/ending`, `/onboarding/card`, `/levels`, `/canvas1`, `/level1` | **LULUS (`MOCK_MODEL`)** | `e2e/r83/logs/r83-perf-report.json` |
| `#cam-pip` `fixed bottom-left` & `data-monui-mode` (`O-11` / `P9a`) | `1` node `#cam-pip` (`[1,1,1,1]`), `fixed`, `x: 20, y: 595`, `width: 133, height: 106`, `insideR83Scope: true`, `data-monui-mode: "idle"` | **LULUS (`MOCK_MODEL`)** | `e2e/r83/logs/r83-perf-report.json` |
| `routeTimingsMs.coverMount`, `canvasMoveLongTasks`, `longTasks` | `coverMount = 235 ms`, `canvasMoveLongTasks = 0`, `longTasks = []` (`0` longtask > 50 ms) | **LULUS (`MOCK_MODEL`)** | `e2e/r83/logs/r83-perf-report.json` |
| Privasi anak & istilah `O-8` / `O-13` | `0` kemunculan `'Rani'` di storage; `0` `'Bab'` di UI r8.3; provenance `"Mode Mock: tebakan simulasi"` (0 `'Demo'`) | **LULUS (`MOCK_MODEL`)** | `e2e/r83/logs/r83-perf-report.json` |
| CPU webcam nyata vs `proto-html/r83` (`≤ sandbox +15%`) | **`NOT_TESTED`** (opsional `.onnx` `public/models/monui7-hand-yolo26n-320.onnx` fail-closed saat belum disalin; menunggu Gerbang **G9** Owner di `WEBCAM_QA.md`) | **`NOT_TESTED`** | — |
