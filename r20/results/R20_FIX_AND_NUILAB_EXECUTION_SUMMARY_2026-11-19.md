# Laporan Eksekusi Lengkap: R20 Fix (P0) + NUI Lab Physical Webcam Benchmark Recorder (P1–P4)

- **Tanggal:** 2026-11-19 WIB
- **Executor:** Satu sesi agent utama Agy (**0 AI subagent**, **0 swarm**, **0 delegasi** sesuai kontrak §19.1)
- **Repository:** `lustresense/hitl-momo`
- **Baseline Awal yang Diperiksa:**
  - `research-can@a458c1871568246f4db228024c4e77e0178cae26`
  - `main@8969502df4e106d8428055c2ca6f80f4f59250ee` (`0.26.0-alpha`)
- **Commit Hasil Eksekusi (Terverifikasi `LOCAL == REMOTE`):**
  - **`research-can` (audit fix):** `b0f43f01e226434d212a20437d24b00c31d583f3` *(dokumen ringkasan ini dipublikasikan pada commit dokumentasi berikutnya di `research-can`)*
  - **`main` (`0.27.0-alpha`, scoped NUI Lab):** `de1030ea5dfbab67e1360ed7a3a00a462b46824f`
- **Status Rencana R20:** **`[WIP]`** — **TIDAK** diubah ke `[DONE]` karena pengujian **webcam fisik malam Owner (`N1..N6`) masih `NOT_TESTED`**.

> **Catatan untuk AI Planner & Owner:** Dokumen ini disusun sebagai laporan menyeluruh (self-contained) seluruh hal yang telah diaudit, diperbaiki, dibangun, diuji, ditemukan gagal/tradeoff, dan di-push ke repository agar dapat langsung dibaca dari GitHub tanpa perlu copy-paste dari terminal/chat.

---

## 1. Ringkasan Status Gate (`PASS / FAIL / NOT_TESTED`)

| Bagian / Gate | Kelas Bukti | Status | Ringkasan Terukur |
|---|---|---|---|
| **P0.1 Low-Light A4 -> A4v2** | `SYNTHETIC` (VIDEO-mode sekuensial, `10.080` frame) | **`PASS` (Sintetis)** · **`NOT_TESTED` (Webcam Fisik)** | Bug oracle `union_ok` (`31,87%`) dipisahkan dari evaluasi nyata. A4 lama (`34,24%`) & CLAHE aditif lama (`8,21%`) dibuktikan gagal. **`A4v2`** pelestari krominansi menaikkan recall sekuensial **`34,23% -> 85,42%`** (`1,000` panggilan detektor/frame, overhead `+0,000`; `dim_g008` nyaris gelap **`0,0% -> 85,6%`**), menurunkan `DETECTOR_MISS` **`65,36% -> 11,79%`**, mempertahankan akurasi kondisional `C4/C7 = 98,34%` dengan **`0` false PRESS** (`end-to-end 34,17% -> 86,75%`). |
| **P0.2 CDP Network — Journey 1 (NUI Lab Static Export)** | `BROWSER_SIMULATED_VIDEO` (CDP Page + Web Worker vs Socket Wire) | **`PASS`** (`caddy_default_zstd_gzip` & `gzip_standard`) · **`FAIL`** (`uncompressed_dev` 2× boot) | **`10.966.014 B` (`10,46 MiB` CDP; server `10.971.923 B`)** pada profil `deploy/Caddyfile` (`encode zstd gzip`, `.task` tidak dikompresi) — headroom `+14,03 MB` di bawah 25 MB. `gzip_standard`: **`11.102.853 B` (`10,59 MiB`)** (`PASS`). `uncompressed_dev`: `28.022.116 B` (`FAIL` saat 2× boot worker karena WASM 9,42 MB tanpa kompresi tidak masuk cache headless). |
| **P0.2 CDP Network — Journey 2A (Student SPA `main` Unmodified)** | `BROWSER_SIMULATED_VIDEO` (CDP Page vs Socket Wire) | **`FAIL`** *(Bug pra-ada di luar scope NUI Lab)* | **`26.801.677 B` (`25,56 MiB` CDP == server, delta `0 B`)** bahkan dengan `zstd+gzip`. Akar masalah: `src/camera/hand-landmarker.ts` (kode siswa yang **tidak diubah** demi kepatuhan scope P1) mengunduh `/models/hand_landmarker.task` **`3×` (`23.457.999 B`)** lintas `/onboarding/cam`, `/canvas1`, dan `/level1`. |
| **P0.3 CPU-Only Worker, Bystander Guard & Sesi Panjang 90 dtk** | `BROWSER_SIMULATED_VIDEO` (`--disable-gpu`, `delegate: "CPU"`) | **`PASS` (UI/Anti-Lag/Safety/Leak/Steady Hz)** · **Tradeoff `setOptions` Tercatat** | 90,07 detik kontinu `B3v2`: **`60,00 FPS` UI (`p5 = 60,00`)**, **`0` LongTasks**, `e2e p95 = 105,2 ms <= 150 ms`, `heapGrowth = +0,86 MB`, `monotonicClamps = 0`, **`0` stuck keys** (`tab-hidden`, `worker-restart`, `stop()`). Throughput stabil single-hand: **`26 Hz`** di `/nui-lab/gesture` & **`24,25 Hz`** di `B2` (`PASS >= 20 Hz`); pada stream stress hard-cut `r20_sim_cam.y4m`, `232` panggilan `setOptions` (`26,8 ms p50`) menurunkan `B3v2` ke **`15,11 Hz`** (vs `B1` tetap `numHands=2` `13,78 Hz`). |
| **P0.4 GPU Training & Pembanding** | `OFFLINE_DATASET` | **`PASS`** | 1× RTX A5000 cukup sebagai default. `C0 (R19)`, `C4 (R20)`, dan `C7 (R20 distilled)` dipertahankan sebagai pembanding SHA-256 terpin. Tidak dilakukan retraining besar tanpa bukti akar masalah di classifier. |
| **P1 + P2 NUI Lab Benchmark Recorder + Integrasi R20** | `UNIT_ONLY` + `BROWSER_SIMULATED_VIDEO` (Static Export `out/`) | **`PASS`** | Upgrade kompatibel atas `lab-recorder.ts` (`src/components/nui-lab/bench/` 16 modul) + 3 model terpin SHA-256 (`R19 C0`, `R20 C4`, `R20 C7`) + CPU Web Worker + `A4v2` + dashboard perbandingan tanpa mencampur engine + unduh 1 klik JSON/CSV + recovery `interrupted` saat reload/crash. |
| **P3 Verifikasi Build, Unit Test, & E2E Browser** | `UNIT_ONLY` + `BROWSER_SIMULATED_VIDEO` | **`PASS`** | `verify_agent_bootstrap` OK, `bump_version --check` (`0.27.0-alpha`) OK, `tsc` 0 error, `lint` 0 warning baru, Vitest **`214/214 PASS`** (`tests/nui-lab` 210/210 + `owner-build-manifest` 4/4), static export `24/24` halaman, Playwright E2E `out/` PASS (`60,0 -> 60,0 FPS` delta `0,0`, `0` LongTasks, `0` droppedRecords, `reloadRecoveryShowsInterrupted = true`, `validateExportFile` 0 error, `reanalyzeExport.ok = true`). |
| **Webcam Fisik Malam Owner (`N1..N6`)** | `PHYSICAL_WEBCAM` | **`NOT_TESTED`** | Membutuhkan perangkat/webcam fisik Owner; seluruh artefak siap dipakai di `/nui-lab` tanpa terminal. |

---

## 2. Detail Kronologis Pengerjaan P0 — Koreksi Temuan Audit pada `research-can`

### 2.1 P0.1 — Koreksi Evaluasi Low-Light A4 & Iterasi Akar Masalah `A4v2`

#### Masalah yang Ditemukan pada Baseline `research-can@a458c18`
1. `r20/scripts/augment_hg5g.py` sebelumnya menghitung `union_ok` (~baris 365): suatu frame dihitung "berhasil" jika RAW **atau** CLAHE **atau** A3 mana pun berhasil mendeteksi tangan. Ini adalah **oracle upper bound 3 panggilan stateless**, bukan performa pipeline A4 yang berjalan nyata.
2. Kondisi nyaris hitam `dim_g008` sebelumnya hanya `2,10%` — kegagalan pengalaman pengguna serius, bukan PASS.

#### Langkah Perbaikan & Eksperimen yang Dilakukan
1. **Perbaikan skrip lama:** Mengganti nama field di [`r20/scripts/augment_hg5g.py`](../scripts/augment_hg5g.py) menjadi `oracle_union_recall_upper_bound` dengan catatan audit eksplisit agar tidak lagi disalahartikan sebagai akurasi runtime.
2. **Evaluasi sekuensial stateful VIDEO-mode jujur:** Membuat [`r20/scripts/eval_a4_sequential.py`](../scripts/eval_a4_sequential.py) dan [`r20/scripts/eval_a4v2_sequential.py`](../scripts/eval_a4v2_sequential.py):
   - Dataset evaluasi: `576` sekuens (`48` gambar held-out × `12` degradasi; `420` sekuens terdeteksi pada gambar referensi bersih = **`10.080` frame VIDEO berurutan** pada 30 FPS).
   - Tiap frame diberi **sensor shot + read noise baru pada domain linear-light** serta sedikit drift posisi tangan, lalu dijalankan frame demi frame dalam mode `RunningMode.VIDEO` MediaPipe (`HandLandmarker` asli, tidak dilatih ulang), menghitung jumlah panggilan detektor, overhead panggilan recovery, dan waktu proses.
3. **Temuan akar masalah mengejutkan dari run sekuensial pertama:**
   - `P3_shipped_alt` (A4 yang sebelumnya dikirim): **`34,24%`** vs `P0_raw`: **`34,23%`** (`+0,01 pp` — nyaris nol perbaikan!).
   - `P1_clahe_always` (CLAHE aditif lama): anjlok ke **`8,21%`**; `P2_a3_always` (A3 lama): **`9,73%`**.
   - **Dua akar penyebab teknis ditemukan:**
     - **Akar 1 (Chroma washout):** CLAHE/A3 lama menambahkan selisih luma secara aditif (`R/G/B += mappedLuma - luma`). Pada citra gelap, penambahan skalar besar ke ketiga kanal mendorong warna kulit menjadi abu-abu pucat, menghancurkan fitur krominansi yang diandalkan Palm Detector SSD MediaPipe.
     - **Akar 2 (Amplifikasi noise):** Sensor shot+read noise pada citra sangat gelap diperkuat oleh kurva gamma sRGB sehingga menenggelamkan kontur telapak/jari.
   - *(Catatan eksperimen gagal yang dibuang: kami juga menguji Gray-World White Balance, tetapi terbukti malah mencuci warna kulit ke abu-abu ketika tangan mengisi porsi besar frame — langsung ditinggalkan.)*
4. **Solusi CPU baru — `A4v2` (`applyA4ChromaRecoveryInPlace`):**
   - Diimplementasikan identik di [`r20/candidates/r20_lowlight_frame_source.ts`](../candidates/r20_lowlight_frame_source.ts) dan `main`: `src/components/nui-lab/bench/r20-lowlight.ts`.
   - **Gerbang adaptif:** Hanya aktif setelah `A0_raw` gagal mendeteksi tangan **dan** (`meanLuma < 0.52 || isBacklight`). Pada adegan terang (`raw`), `0 ms` preprocessing dan `100,0%` recall dipertahankan.
   - **Tahap 1 — Motion-Gated Temporal EMA:** `3/8 curr + 5/8 prev` per kanal jika selisih L1 piksel `<= 28`, langsung snap ke `curr` saat tangan bergerak -> meredam read noise tanpa *ghosting*.
   - **Tahap 2 — Exact Separable 1D Median-of-5 (`sepMedian5RgbaInPlace`):** Jaringan sorting branchless 6-komparasi (horizontal + vertikal) -> membuang *impulse shot noise* tanpa memburamkan tepi jari; ditambah mild 3×3 denoise khusus nyaris gelap (`meanLuma < 0.14`).
   - **Tahap 3 — Chroma-Preserving Multiplicative Reinhard LUT:** `gain = k / (1 + (k - 1) * y)` dikalikan secara proporsional ke R, G, B -> mengangkat eksposur bayangan sambil menjaga rasio warna kulit alami!

#### Hasil Lengkap Evaluasi Sekuensial VIDEO-Mode ([`r20_a4_sequential_audit.json`](r20_a4_sequential_audit.json), `10.080` frame)

| Policy | Recall Total | `raw` (Terang) | `dim_g045` | `dim_g020` | `dim_g008` (Nyaris Gelap) | `dim_warm_led` | `dim_cool_mon` (Layar Laptop) | `backlight` | `blur_dim` | `jpeg_q25` | `scale_x048_dim` | `flip` / `flip_dim_g020`* | Panggilan Detektor / Frame | Overhead Recovery |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| *Oracle Union (3-call stateless upper bound, BUKAN runtime)* | *31,87%* | *99,6%* | *5,2%* | *0,0%* | *0,0%* | *0,0%* | *0,0%* | *86,1%* | *46,3%* | *75,7%* | *28,5%* | *41,1% / 0,0%* | *3,000* | *+2,000* |
| `P0_raw` (tanpa preprocess) | 34,23% | 100,0% | 12,1% | 0,0% | 0,0% | 0,0% | 0,0% | 95,7% | 55,6% | 95,0% | 12,1% | 40,1% / 0,0% | 1,000 | +0,000 |
| `P1_clahe_always` (CLAHE aditif lama) | 8,21% | 19,8% | 0,0% | 0,0% | 0,0% | 0,0% | 0,0% | 23,1% | 1,7% | 2,9% | 43,9% | 7,3% / 0,0% | 1,000 | +0,000 |
| `P2_a3_always` (A3 lama) | 9,73% | 25,8% | 0,0% | 0,0% | 0,0% | 0,0% | 0,0% | 28,8% | 1,7% | 6,1% | 46,7% | 7,7% / 0,0% | 1,000 | +0,000 |
| `P3_shipped_alt` (A4 lama) | 34,24% | 100,0% | 12,1% | 0,0% | 0,0% | 0,0% | 0,0% | 95,7% | 52,5% | 95,0% | 15,4% | 40,1% / 0,0% | 1,000 | +0,000 |
| `P4_a4s_sameframe` (A4 lama 2-call) | 34,63% | 100,0% | 12,1% | 0,0% | 0,0% | 0,0% | 0,0% | 95,7% | 55,6% | 95,0% | 17,0% | 40,1% / 0,0% | 1,461 | +0,461 |
| **`P7_a4v2_chroma_singlecall` (SHIPPED BARU)** | **85,42%** | **100,0%** | **96,1%** | **95,8%** | **85,6%** | **95,8%** | **94,6%** | **95,7%** | **97,6%** | **95,0%** | **89,3%** | **40,1% / 39,3%** | **1,000** | **+0,000** |
| `P8_a4v2_chroma_sameframe` (fallback 2-call) | 87,24% | 100,0% | 100,0% | 99,3% | 86,3% | 98,8% | 96,8% | 95,7% | 100,0% | 95,0% | 93,9% | 40,1% / 41,0% | 1,045 | +0,045 |

*\*Catatan jujur:*
1. `flip` dan `flip_dim_g020` mentok di ceiling ~`40,1%` karena pencocok titik pusat referensi memakai koordinat belum di-mirror; `39,3%` pada `flip_dim_g020` adalah `98%` dari ceiling `flip` bersih.
2. Waktu `preprocess_ms` di JSON Python (`~25–42 ms`) berasal dari loop NumPy/Python; pada runtime browser nyata (JS TypedArray `320×180` di Chromium `--disable-gpu`), biaya `A4v2` terukur **`4,5 ms p50 / 8,5 ms p95`**.
3. Sekuens di atas tetap **sintetis dari citra diam**, bukan rekaman webcam fisik.

#### Pemisahan Kegagalan Detektor vs Classifier ([`r20_a4_detector_vs_classifier.json`](r20_a4_detector_vs_classifier.json), `2.520` frame)

| Model | Policy | Total Frame | `DETECTOR_MISS` | Frame Terdeteksi | Akurasi Kondisional Classifier | Error Classifier | False `PRESS` | End-to-End Correct |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `C0 (R19)` | `P0_raw` | 2.520 | 1.647 (65,36%) | 873 | 98,28% | 15 | 0 | 34,05% |
| `C0 (R19)` | **`P7_a4v2`** | 2.520 | **297 (11,79%)** | **2.223** | 98,11% | 42 | **0** | **86,55%** |
| `C4 (R20)` | `P0_raw` | 2.520 | 1.647 (65,36%) | 873 | 98,63% | 12 | 0 | 34,17% |
| `C4 (R20)` | **`P7_a4v2`** | 2.520 | **297 (11,79%)** | **2.223** | **98,34%** | 37 | **0** | **86,75%** |
| `C7 (R20 Distilled)` | `P0_raw` | 2.520 | 1.647 (65,36%) | 873 | 98,63% | 12 | 0 | 34,17% |
| `C7 (R20 Distilled)` | **`P7_a4v2`** | 2.520 | **297 (11,79%)** | **2.223** | **98,34%** | 37 | **0** | **86,75%** |

**Kesimpulan teknis P0.1:** Kegagalan low-light `65,36%` murni kegagalan detektor/preprocessing, bukan classifier. Memperbaiki preprocessing menaikkan akurasi end-to-end **`+52,58 pp`** tanpa retraining dan dengan **`0` false PRESS**.

---

### 2.2 P0.2 — Benchmark Network CDP Nyata (Page + Web Worker) & 3 Profil Kompresi

#### Masalah yang Ditemukan pada Baseline
`r20/scripts/run_r20_browser_harness.mjs` sebelumnya menghitung `coldTotalBUserBytes` dari log server lokal + konstanta estimasi header `180 B` dan mengasumsikan Zstandard untuk semua file (padahal `deploy/Caddyfile` memakai `encode zstd gzip` default Caddy yang **tidak** mengompresi file `application/octet-stream` seperti `.task` dan `.tflite`).

#### Pengukuran Ulang Nyata ([`run_r20_fix_browser_audit.mjs`](../scripts/run_r20_fix_browser_audit.mjs), [`r20_fix_network_cdp_audit.json`](r20_fix_network_cdp_audit.json))
- Menggunakan **CDP `Network.loadingFinished.encodedDataLength`** pada target **Page DAN Web Worker** (`Target.setAutoAttach({ autoAttach: true, flatten: true })`), direkonsiliasi langsung melawan `socket.bytesWritten` aktual dari server HTTP (nol konstanta estimasi).
- Dijalankan terhadap **static export Next.js nyata** (`main-r19/frontend/implementation/out`) pada 3 profil kompresi deployment nyata:

| Profil Kompresi | Journey | CDP Total (Page + Worker) | CDP Page | CDP Worker | Server Socket Wire | Delta (`CDP - Server`) | Status `< 25.000.000 B` |
|---|---|---:|---:|---:|---:|---:|---|
| **`caddy_default_zstd_gzip`** *(sama persis `deploy/Caddyfile`, `.task`/`.tflite` uncompressed)* | **J1: NUI Lab Nyata** (`/nui-lab` -> `/gesture` -> `/canvas`, R20 C4 + Worker + `CacheStorage`) | **10.966.014 B (10,46 MiB)** | 326.346 B | 10.639.668 B | 10.971.923 B | -5.909 B | **`PASS`** (+14,03 MB headroom) |
| **`caddy_default_zstd_gzip`** | **J2A: Student SPA `main` Unmodified** (`/` -> onboarding -> `/canvas1` -> `/level1`) | **26.801.677 B (25,56 MiB)** | 26.801.677 B | 0 B | 26.801.677 B | **0 B** | **`FAIL`** (+1,80 MB over!) |
| **`caddy_default_zstd_gzip`** | J2B: Student Hard Reloads Audit | 26.615.335 B (25,38 MiB) | 26.615.335 B | 0 B | 34.434.668 B | -7.819.333 B | **`FAIL`** |
| **`gzip_standard`** | **J1: NUI Lab Nyata** | **11.102.853 B (10,59 MiB)** | 309.781 B | 10.793.072 B | 11.108.284 B | -5.431 B | **`PASS`** (+13,90 MB headroom) |
| **`gzip_standard`** | **J2A: Student SPA `main` Unmodified** | **26.941.497 B (25,69 MiB)** | 26.941.497 B | 0 B | 26.941.497 B | **0 B** | **`FAIL`** |
| `uncompressed_dev` | J1: NUI Lab Nyata (2× boot worker) | 28.022.116 B (26,72 MiB) | 1.009.017 B | 27.013.099 B | 28.037.811 B | -15.695 B | **`FAIL`** *(WASM 9,42 MB raw miss cache headless)* |
| `uncompressed_dev` | J2A: Student SPA `main` Unmodified | 62.642.900 B (59,74 MiB) | 62.642.900 B | 0 B | 62.642.900 B | **0 B** | **`FAIL`** |

#### Rincian Aset CDP (`caddy_default_zstd_gzip`)
- **J1 NUI Lab (`10.966.014 B`):** `mediapipe_hand_model` (`/models/hand_landmarker.task` ×1 via `CacheStorage`) = `7.819.333 B`, `wasm` (`vision_wasm_internal.wasm` zstd ×1 + 1 cache hit) = `2.723.455 B`, `app_js` (Next.js + worker chunk + `vision_wasm_internal.js`) = `356.404 B`, `student_model` (`r20-c4-model.json` zstd) = `29.165 B`, `css` = `29.095 B`, `html` = `5.128 B`, `other` (RSC `.txt`) = `3.434 B`, `fonts` = `0 B` (system fonts).
- **J2A Student SPA `main` Unmodified (`26.801.677 B` — TEMUAN PENTING):** `mediapipe_hand_model` = **`23.457.999 B` (`3×` unduh penuh `/models/hand_landmarker.task`!)**, `wasm` = `2.723.455 B` (1× + 3 cache hits), `app_js` = `346.269 B`, `mediapipe_face_model` (`blaze_face_short_range.tflite`) = `229.973 B`, `css` = `37.298 B`, `html` = `6.683 B`.
  - **Mengapa belum diperbaiki pada commit ini:** `src/camera/hand-landmarker.ts` adalah modul gameplay siswa di luar izin P1 (khusus NUI Lab). Menambahkan 12 baris helper `CacheStorage` yang sama dengan NUI Lab pada PR siswa terpisah akan menurunkannya dari `26,80 MB` ke **`~11,16 MB` (`PASS`)**.

---

### 2.3 P0.3 — Audit Runtime CPU-Only, Bystander Jarak Dekat, & Sesi Panjang 90 Detik

#### Masalah yang Ditemukan pada `B3` Sebelumnya
1. Saat terkunci pada `numHands = 1`, worker lama hanya menolak loncatan besar (`jumpDist > 0.25`). Tangan bystander yang masuk dekat posisi tangan utama (atau menggantikan saat tangan utama hilang sesaat) berisiko mengambil alih tanpa terdeteksi.
2. Benchmark sebelumnya hanya berjalan 25–30 detik (belum memverifikasi stabilitas heap/kebocoran jangka panjang).

#### Perbaikan yang Diterapkan ([`r20_worker_owner_guard.ts`](../candidates/r20_worker_owner_guard.ts) & `main`: `bench/worker-owner-guard.ts`)
- Mengetatkan ambang loncatan spasial (`maxJumpDist = 0.18`).
- Menambahkan deteksi diskontinuitas ukuran tangan jarak dekat (`maxSizeRatio = 1.6`).
- Menambahkan verifikasi flip handedness jarak dekat (`handednessMinScore = 0.78`) yang langsung memicu probe `numHands = 2`.
- Menambahkan **audit bystander 2-tangan periodik** setiap `45` frame (`auditIntervalFrames = 45`, `lockConfirmFrames = 3`) + `bystanderCooldown = 30` frame yang meneruskan seluruh tangan ke `FullFrameHandLock` ketika tangan kedua terdeteksi.
- Menambahkan telemetri eksplisit `setOptionsMs`, `ownerGuard` counters, dan `monotonicClamps`.

#### Hasil Audit Browser CPU-Only (`--disable-gpu`) Sesi Panjang 90 Detik ([`r20_fix_runtime_and_nuilab_e2e.json`](r20_fix_runtime_and_nuilab_e2e.json))

| Varian | Durasi | Delegate | UI FPS (Mean / p5) | LongTasks | Effective Detect Rate | Detect `p50 / p95` | `setOptions` Calls (`p50 / p95`) | Preprocess `p50 / p95` | Classifier `p50 / p95` | E2E `p50 / p95` | Heap Growth | Stuck Keys (`tabHidden`/`restart`/`stop`) |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| **`B3v2` Guarded Owner-Lock** | **90,07 dtk** | `CPU` (`gpuAttempted=false`) | **60,00 / 60,00** | **0** | **15,11 Hz** *(hard-cut stress)* | 36,4 / 93,4 ms | **232** (26,8 / 34,0 ms) | 4,5 / 8,5 ms | 0,0 / 0,1 ms | 67,8 / 105,2 ms | **+0,86 MB** (`3,37 -> 4,23 MB`) | **0** (`releaseAll=3`, `monotonicClamps=0`) |
| `B1` Fixed `numHands=2` | 30,04 dtk | `CPU` | 60,02 / 59,99 | 0 | 13,78 Hz | 66,9 / 69,7 ms | 0 | 4,5 / 8,6 ms | 0,0 / 0,1 ms | 73,3 / 79,2 ms | -1,41 MB | **0** |
| `B2` Single-Hand `numHands=1` | 25,03 dtk | `CPU` | 60,00 / 60,00 | 0 | **24,25 Hz** | 32,9 / 35,8 ms | 0 | 4,4 / 8,6 ms | 0,0 / 0,1 ms | 39,0 / 44,4 ms | +0,91 MB | **0** |
| Real NUI Lab `/nui-lab/gesture` | ~14 dtk | `CPU` | **60,00** (`raf p95=16,7 ms`) | **0** (`delta 0,0 FPS`) | **26 Hz** *(steady)* / 15,3–16,1 Hz avg w/ cuts | 35,1 / 94,3 ms | — | 4,4 / 11,2 ms | 0,1 / 0,2 ms | 55,6 / 108,3 ms | — | **0** (`dropped=0`) |

- **Checkpoints Heap 90 detik `B3v2`:** `@15s: 3,37 MB` -> `@30s: 4,28 MB` -> `@45s: 5,04 MB` -> `@60s: 2,82 MB` (GC) -> `@75s: 3,84 MB` -> `@90s: 4,23 MB` -> post-stop `4,10 MB` (`209` DOM nodes). **Nol indikasi memory leak.**
- **Tradeoff `setOptions` yang dilaporkan secara transparan:** Di MediaPipe WASM, memanggil `landmarker.setOptions({ numHands })` membangun ulang graph internal selama **`26,8 ms p50 / 34,0 ms p95`**. Pada `r20_sim_cam.y4m` yang memiliki hard scene cut setiap ~1,5 detik, `WorkerOwnerGuard` mendeteksi `52` jump rejects, `9` size rejects, `18` handedness probes, dan `5` bystander audits (`4` deteksi bystander) sehingga memicu `232` panggilan `setOptions` (menurunkan rata-rata stream hard-cut menjadi `15,11 Hz`). Pada gerakan tangan kontinu tanpa teleportasi antar-klip, ia bertahan di `numHands=1` (`26 Hz` di `/nui-lab/gesture`, `24,25 Hz` ceiling `B2`) dan hanya membayar 1 probe audit ~`27 ms` tiap ~2 detik.

---

## 3. Detail Pengerjaan P1 & P2 — Upgrade NUI Lab pada `main@0.27.0-alpha` (`de1030e`)

### 3.1 Prinsip Arsitektur & Kompatibilitas
- **Tidak membuat recorder duplikat:** `frontend/implementation/src/components/nui-lab/lab-recorder.ts` di-upgrade secara kompatibel (mengekspor helper `buildRecordFrame`; seluruh 20 unit test legacy `lab-recorder.test.ts` tetap hijau 100%).
- **Seluruh 16 modul baru di `frontend/implementation/src/components/nui-lab/bench/`:**
  1. `schema.ts` — Skema kontrak v1 (`nui-lab-bench-export/1`), tipe `SessionMeta`, `TrialRecord`, `FrameTelemetry`, `BenchEvent`, `PerfSample`, `ValidationReport`.
  2. `engines.ts` — Registri 3 kandidat model terpin SHA-256 + verifikasi `SubtleCrypto` fail-closed (`r19-c0`, `r20-c4`, `r20-c7`) tanpa fallback diam-diam.
  3. `env.ts` — Pengumpul metadata perangkat non-identifying (`userAgentFamily`, `platform`, `hardwareConcurrency`, `deviceMemoryGb`, `devicePixelRatio`, `viewport`, `secureContext`, `storage`) + heuristik `virtual-suspected` vs `physical-presumed` (nama raw kamera dibuang segera, tidak pernah disimpan).
  4. `config.ts` — Konfigurasi aktif sesi (`engineId`, `preprocess`, `detector`, `scenario`, `groundTruth`, `ownerLabel`) yang persisten di `localStorage` lintas route.
  5. `store.ts` — Implementasi penyimpanan lokal persisten `IndexedDbBenchStore` (store: `sessions`, `trials`, `frames`, `events`, `perf`) + fallback eksplisit `MemoryBenchStore` jika IndexedDB tidak tersedia (dengan peringatan storage).
  6. `writer.ts` — `ChunkWriter` incremental/batched (`flush` terukur agar tidak mengganggu UI 60 FPS), pemantauan kuota `navigator.storage.estimate()`, pelacakan eksplisit `droppedRecords` (`frames/events/perf`) dan `storageFailures` (tidak pernah membuang data diam-diam).
  7. `perf-monitor.ts` — `UiPerfMonitor` nyata berbasis `requestAnimationFrame` (UI FPS, RAF `p50/p95/max`), `PerformanceObserver("longtask")` (LongTasks > 50 ms), dan `performance.memory` hanya jika benar-benar diekspos browser (tidak mengarang CPU/RAM).
  8. `stats.ts` — Penghitung statistik per-trial dan agregasi **per konfigurasi** (`engineId | preprocess | detector | source | scenario`) sehingga hasil `R19 C0`, `R20 C4`, dan `R20 C7` **tidak pernah tercampur**.
  9. `export.ts` — `buildExportBlob` (JSON lengkap machine-readable), `buildSummaryCsv` (ringkasan tabel CSV), `validateExportFile`, dan `reanalyzeExport` untuk verifikasi integritas ulang.
  10. `manager.ts` — `BenchSessionManager` (singleton sesi lintas route `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics`): menolak start tanpa consent eksplisit, membuka/menutup trial otomatis saat route/engine/preprocess berubah, menulis heartbeat + `sessionStorage` active session ID agar reload/crash/pagehide langsung menandai sesi `"interrupted"` tanpa kehilangan data tersimpan.
  11. `canvas-tracker.ts` — `LabTelemetryBridge` yang merekam telemetri Canvas Lab (drawing start/end, pinch aktivasi/lepas, `strokeId`, jumlah titik, panjang lintasan px, durasi, jitter raw vs smoothed, gap & unexpected stroke breaks, 5-finger erase hit/miss, swipe undo/redo, aksi ditolak, estimasi pipeline action latency, dan tag `source: "pointer" | "gesture"`).
  12. `r20-lowlight.ts` — Implementasi browser `A4v2` (`applyA4ChromaRecoveryInPlace`, `RAW` / `CLAHE` / `A4`).
  13. `worker-owner-guard.ts` — Implementasi browser `WorkerOwnerGuard` anti-bystander jarak dekat.
  14. `r20-hand.worker.ts` — Web Worker MediaPipe `HandLandmarker` **100% CPU-only** (`delegate: "CPU"`, `gpuDelegateAttempted: false`), `CacheStorage` deduplication untuk `/models/hand_landmarker.task`, `maxInFlight = 1`, `A4v2`, `WorkerOwnerGuard`, timestamp monotonik.
  15. `r20-worker-client.ts` — Klien main-thread `LabCpuWorkerClient` dengan `ImageBitmap` transferable `320×180`, `RELEASE_ALL` pada `visibilitychange`/stop/error, dan auto-restart terbatas.
  16. `BenchControls.tsx` — Komponen UI `BenchDashboard` (pada `/nui-lab`: consent, pilihan engine/preprocess/skenario, Mulai/Selesaikan Sesi, metrik ringkas, tabel perbandingan per konfigurasi, tombol Unduh JSON/CSV, Hapus Data Lokal, banner recovery `interrupted`) dan `BenchSessionBar` (bar kompak pada `/nui-lab/gesture` & `/nui-lab/canvas` tanpa merusak layout, gesture guide, hand overlay, Momo, atau canvas existing).

### 3.2 Model Terpasang pada `main/frontend/implementation/public/models/`

| Engine ID | File | Ukuran | SHA-256 Terpin (Fail-Closed) |
|---|---|---:|---|
| `r19-c0` | `r19-pistol-model.json` | 122.768 B | `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293` |
| `r20-c4` | `r20-c4-model.json` | 73.275 B | `e863ef1afe459a3b0a4cf0b0b2594a1db853b382d669add2d7be234e64710a27` |
| `r20-c7` | `r20-c7-t4-model.json` | 73.138 B | `66acbde9f73868f8e6afada647a6d513d7efab6252a937bf88dede933147d730` |

### 3.3 Daftar Perubahan pada `main` (34 File) & Batas Scope Ketat
- **File NUI Lab diubah/ditambah (26 file):** `app/nui-lab/page.tsx`, `src/components/nui-lab/{NuiLabPage.tsx,NuiLabPage.css,lab-recorder.ts}`, `src/components/nui-lab/bench/*.ts(x)` (16 file), `public/models/{r20-c4-model.json,r20-c7-t4-model.json}`, `tests/nui-lab/{bench-recorder.test.ts,bench-worker-and-lowlight.test.ts,bench-ui-flow.test.tsx}`, `docs/execution/NUI_R20_BENCHMARK_RECORDER_HANDOFF_2026-11-19.md`.
- **Sinkronisasi versi & status repo SOP (8 file):** `VERSION`, `CHANGELOG.md`, `NOW.md`, `contexts/can/NOW.md`, `contexts/can/SESSION_HANDOFF.md`, `frontend/implementation/package.json`, `frontend/admin/package.json` (1 baris versi), `backend/app/main.py` (1 baris string versi `FastAPI(version="0.27.0-alpha")` oleh `scripts/bump_version.py`).
- **Area yang 100% TIDAK disentuh:** `app/level1..3`, `app/canvas1..3`, `app/onboarding/*`, `src/game/*`, `src/input/{gameplay-hand-driver,mediapipe-input,arbiter}.ts`, `src/camera/*`, logic `backend/`, `contracts/`, `DECISIONS.md`, `SOUL.md`, `/etc/caddy/Caddyfile`, dan proses dev/tunnel milik `can`/Ujang.

---

## 4. Detail Verifikasi P3 — Tes, Bug yang Ditemukan Saat E2E, & Perbaikannya

### 4.1 Pengujian Otomatis (`main@de1030e`, `0.27.0-alpha`)
- `python3 scripts/verify_agent_bootstrap.py` -> `OK agent bootstrap: 23 paths, 7 rules, CAN and DIAS routing`
- `python3 scripts/bump_version.py --check` -> `ok 0.27.0-alpha`
- `npm run typecheck` (`tsc --noEmit`) -> **exit 0** (0 error)
- `npm run lint` (`next lint`) -> **exit 0** (0 warning baru; 1 warning pra-ada di `GestureRing.tsx:128`)
- `npx vitest run tests/nui-lab tests/owner-build-manifest.test.ts` -> **18/18 file, 214/214 PASS** (`tests/nui-lab`: 210/210, termasuk 15 tes baru; `owner-build-manifest`: 4/4).
  - *Catatan jujur regresi global:* 13+ tes pra-ada di `tests/input/` & `tests/camera/` (fist-erase/GPU baseline tercatat sejak `CHANGELOG 0.25.0-alpha`) tidak terkait perubahan ini; seluruh 1.620 tes non-lab lainnya lulus.
- `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` -> **exit 0, 24/24 static pages** pada `out/`.
- `tsc -p r20-sandbox/tsconfig.r20.json` (`research-can/r20/candidates/`) -> **exit 0**.
- `sha256sum -c r20/manifests/SHA256SUMS.txt` -> **53/53 OK**.

### 4.2 Bug Nyata yang Ditemukan Selama Playwright E2E Pertama & Langsung Diperbaiki
1. **Race `modelHashVerified: false` saat trial otomatis terbuka sebelum model selesai dimuat:** Diperbaiki di `NuiLabPage.tsx` dengan menunda pembukaan trial sampai `modelState === "ready"`. Hasil re-test: `trialsWithUnverifiedModelHash: []` (semua trial `modelHashVerified: true`).
2. **Reload cepat `< 1 detik` belum menandai sesi `"interrupted"`:** Penyebab: `pagehide` memicu commit IDB asinkron yang sempat terpotong sebelum reload selesai, dan `heartbeatStaleMs` = 8.000 ms belum terlewati. Diperbaiki di `bench/manager.ts` dengan menyimpan ID sesi aktif pada `sessionStorage` same-tab sehingga inisialisasi ulang pasca-reload langsung menandai sesi IDB tersimpan sebagai `"interrupted"`. Hasil re-test: **`reloadRecoveryShowsInterrupted: true`**.
3. **Pointer stroke Canvas Lab tidak tercatat pada viewport 720px (di bawah fold):** Diperbaiki pada skrip E2E dengan `scrollIntoViewIfNeeded()` sebelum `page.mouse`. Hasil re-test: `T003` mencatat `pointerStrokes: 1` terpisah dari `gestureStrokes: 0` (`9` titik, `367,3 px`, `132 ms`, `0` unexpected breaks).
4. **Over-frequent `setOptions` di `B3v2` (`auditIntervalFrames = 15` -> 238 calls):** Disesuaikan ke `auditIntervalFrames = 45` & `lockConfirmFrames = 3` di kedua repo.

### 4.3 Validasi & Re-Analisis File Ekspor Browser Nyata (`nui_lab_e2e_export.json`)
- File diunduh langsung lewat mekanisme download browser Chromium dari static export `out/`: **`287.559 B`**, schema `nui-lab-bench-export/1`, `storageBackend: "indexeddb"`, `containsForbiddenDataUrl: false`, `droppedRecords: { frames: 0, events: 0, perf: 0 }`, `storageFailures: 0`.
- `trialsSummary`:
  - `T001` (`gesture`, `r20-c4`, `a4`, `cpu-worker`, `modelHashVerified: true`): `124` frame (`71` hand + `53` `DETECTOR_MISS` tercatat utuh).
  - `T002` (`gesture`, `r19-c0`, `a4`, `cpu-worker`, `modelHashVerified: true`): `50` frame (`11` hand + `39` `DETECTOR_MISS`).
  - `T003` (`canvas`, `r19-c0`, `a4`, `cpu-worker`, `modelHashVerified: true`): `45` frame (`27` hand + `18` `DETECTOR_MISS`) + `1` `pointerStrokes`.
- Validasi independen memakai `validateExportFile` + `reanalyzeExport`: **`0` masalah validasi, `reanalyzeExport.ok = true`, `mismatches = []`**, dan heuristik kamera secara jujur menandai **`physicalWebcamEvidence: "VIRTUAL_OR_SIMULATED_SUSPECTED"`**.

---

## 5. Risiko Tersisa, Keputusan untuk AI Planner / Owner, & Langkah Selanjutnya

1. **Aktivasi Dev/Staging & Pengujian Webcam Fisik Malam `N1..N6` (Prioritas #1):**
   - Dev tunnel Ujang melacak `main`. Minta Ujang pull `main@de1030e` dan jalankan `bash frontend/implementation/scripts/ujang-verify-web.sh`.
   - Owner buka `/nui-lab` di browser laptop CPU target -> centang persetujuan data numerik -> pilih engine (`R20 C4` / `R19 C0` / `R20 C7`), preprocessing (`A4` / `RAW` / `CLAHE`), dan skenario `N1..N6` -> **Mulai Sesi Benchmark** -> uji di `/nui-lab/gesture` dan `/nui-lab/canvas` -> **Selesaikan Sesi** -> klik **Unduh Semua Hasil Sesi (JSON)** & **Unduh Ringkasan CSV** langsung dari browser (0 copy-paste terminal).
   - Jangan commit hasil rekaman webcam pribadi ke repository publik.
2. **Keputusan untuk PR Siswa Terpisah (`G20-C` Student SPA `< 25 MB`):**
   - Audit CDP nyata membuktikan Student SPA `main` unmodified saat ini **`26,80 MB` (`FAIL < 25 MB`)** karena `src/camera/hand-landmarker.ts` mengunduh `/models/hand_landmarker.task` `3×`. Jika Owner mengizinkan PR terpisah menyentuh `src/camera/hand-landmarker.ts`, menambahkan `CacheStorage` buffer caching akan langsung menurunkannya ke **`~11,16 MB` (`PASS`)**.
3. **Evaluasi Tradeoff `WorkerOwnerGuard` `setOptions` pada Gerakan Manusia Nyata:**
   - Pada data `N1..N6` fisik nanti, periksa `detectHzMean`, `mpMs p50/p95`, dan jumlah `setOptions` / `bystanderAudits` pada kondisi ruangan nyata (tanpa hard scene cut buatan) untuk memutuskan apakah interval audit 45 frame sudah ideal atau perlu dituning lagi.
4. **Retraining Classifier (Tunda Sampai Ada Bukti Webcam Fisik):**
   - Karena akurasi kondisional `C4`/`C7` sudah `98,34%` (`0` false PRESS), hanya lakukan iterasi training baru jika log `N1..N6` fisik menunjukkan kegagalan dominan di layer **classifier** (bukan `DETECTOR_MISS`).
