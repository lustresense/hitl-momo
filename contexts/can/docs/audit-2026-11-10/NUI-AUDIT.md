# NUI-AUDIT — inventaris pipeline NUI dan klien REST, 2026-11-10

Dasar: HEAD `1b880fa`. Statis, tanpa pengukuran runtime, tanpa kamera fisik.

# A5 — Inventaris pipeline NUI dan klien REST

**Repo yang diaudit:** `/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/ref/momo`, branch `claude-monorepo`, HEAD `1b880fa`. Working tree bersih (`git status` kosong).
**Cara:** hanya baca (`cat -n`, grep, `ls -l`, `sha256sum`, `git grep`, `git log`). Tidak ada checkout, build, atau dev server.
**Konvensi path:** `FE/` = `frontend/implementation/`, `BE/` = `backend/app/`. Nomor baris dari berkas pada HEAD kecuali disebut lain.
**Tanda:** SESUAI, RUSAK, HILANG, MOCK, BELUM TERBUKTI. Tambahan: RISIKO (terlihat dari kode, belum diuji di runtime).
**Commit acuan:** `8926992` (0.0.16: lambaian, cincin jempol, `split-palm`/`open-palm` pertama kali), `d4bbaec` (HEAD cabang `can`), `9ba76d2` (tim AI 2026-11-09: stage 4 dan NUI dwell), `1b880fa` (HEAD).

---

## Ringkasan untuk lead

1. **Stack kamera.** `@mediapipe/tasks-vision` 0.10.14; satu model `hand_landmarker.task` (7.819.105 B). Wasm di `FE/public/mediapipe/wasm/` identik byte-per-byte dengan paket terpasang. ONNX, CLAHE, fill-light, dan RTMPose tidak ada di kode (HILANG, bukan MOCK).
2. **Pembaca tangan.** Empat pembaca (gambar, gameplay, thumb-tracker, wave) masing-masing membuat HandLandmarker. Semua `detectForVideo` di main thread dalam rAF, tanpa worker. Pada alur utama tidak ditemukan dua landmarker aktif bersamaan; penjagaannya berbasis desain (ref-count, `readerLive`, `externalThumbUp`). Celah laten: `CameraIntro.tsx` (tidak dipakai, tetapi membuka kamera dan WaveTracker kedua bila dipasang).
3. **Lambaian bukan `open-palm`.** Lambaian memakai sapuan pergelangan (`detectWave`). `open-palm` didefinisikan (`hand-gesture.ts:230`) tetapi tidak punya konsumen. Redo memakai `split-palm`. Keputusan redo (telapak terbuka vs telapak terbelah) belum diputuskan Owner.
4. **Gestur yang hilang atau rusak.** Rotasi lima jari HILANG. Pinch untuk memindahkan objek tanpa ring konfirmasi (RUSAK). Konfirmasi "Taruh di sini", "Masukkan ke dunia", "Gambar lagi" (header), dan pemilihan nomor absen tidak punya jalur tangan (HILANG).
5. **Tutorial.** Kartu 1 berjalan otomatis setelah cincin cubit, bukan seret dengan tangan. Kartu 1–3 maju dengan cincin cubit, bukan jempol. Tidak ada jeda baca 10 detik. Kartu 3 hanya pointer, dan syarat lulusnya hanya coret + mundur (RUSAK/HILANG).
6. **Level 4** (`stage-4-proof`, "Bab 4 · Pembuktian") ada di data dan tampil di daftar level sejak `9ba76d2` (RUSAK; bertentangan dengan "tiga level").
7. **REST.** Default mode `mock` (confidence tetap per stage). Dockerfile default `partner`. Prediksi mock yang dijawab siswa di kelas dikirim ke `POST /api/submissions` tanpa penanda provenance (RISIKO data). Token sesi siswa dikirim sebagai `Authorization: Bearer` ke endpoint `/predict` partner (RISIKO keamanan). `GET /api/v1/model-info` tidak ada di backend (kode mati).

---

## 1. MediaPipe

### 1.1 Versi, aset, konfigurasi

| Item | Nilai | Bukti | Tanda |
|---|---|---|---|
| Paket | `@mediapipe/tasks-vision` `^0.10.14`; terkunci `0.10.14` | `FE/package.json:17`; `FE/package-lock.json:731-734`; `node_modules` terpasang 0.10.14 | SESUAI |
| Wasm | `FE/public/mediapipe/wasm/`: `vision_wasm_internal.js` 209.826 B; `vision_wasm_internal.wasm` 9.423.986 B; `vision_wasm_nosimd_internal.js` 209.735 B; `vision_wasm_nosimd_internal.wasm` 9.294.247 B. sha256 sama dengan paket | `ls -l`; `sha256sum` | SESUAI |
| Model | `FE/public/models/hand_landmarker.task` 7.819.105 B, sha256 `fbc2a300…cde1`; `FE/out/models/` identik. Versi model tidak tercatat di repo | `ls -l`; `sha256sum` | BELUM TERBUKTI (versi model) |
| URL model default | `/models/hand_landmarker.task` (`FE/src/config/env.ts:85-87`) | kode | SESUAI |
| URL model yang sampai ke pembaca | Env `NEXT_PUBLIC_MEDIAPIPE_MODEL_URL` hanya dibaca `GlobalCamera` (WaveTracker): `FE/src/app/SketchbookApp.tsx:237`. Gambar (`FE/src/input/index.ts:95`), gameplay (`FE/src/input/gameplay-hand-driver.ts:71,112`), dan thumb (`FE/src/camera/thumb-tracker.ts:47`) memakai default tetap. `configureThumbTracker` tidak punya pemanggil (`thumb-tracker.ts:101`) | grep | RUSAK (konfigurasi tidak konsisten) |
| wasmRoot | `/mediapipe/wasm` di semua pembuat: `FE/src/camera/hand-landmarker.ts:29`, `FE/src/input/mediapipe-input.ts:108`, `FE/src/input/gameplay-hand-driver.ts:70`, `FE/src/camera/thumb-tracker.ts:48` | kode | SESUAI |
| runningMode | `"VIDEO"` (`FE/src/camera/hand-landmarker.ts:33`); pemanggilan `detectForVideo` | kode | SESUAI |
| numHands | Gambar **2** (`FE/src/input/mediapipe-input.ts:110`); gameplay **1** (default `hand-landmarker.ts:34`, pemanggil `gameplay-hand-driver.ts:154`); thumb **1** (`thumb-tracker.ts:164`); wave **1** (`wave-tracker.ts:68-71`) | kode | SESUAI (per pemakai) |
| Delegate | GPU dulu; gagal → satu percobaan CPU (`hand-landmarker.ts:36-40`); label "CPU (cadangan)" (`:44-46`) | kode | BELUM TERBUKTI (tanpa pengukuran) |
| Inisialisasi | Tiap `createHandLandmarker` memanggil `FilesetResolver.forVisionTasks` baru (`hand-landmarker.ts:29`); tidak ada cache wasm/model bersama antar-layar | kode | BELUM TERBUKTI (biaya cold start) |

### 1.2 Penjadwal, thread, timestamp, error, pelepasan

- **detectForVideo di main thread:** ya. Empat pemanggilan sinkron di dalam `requestAnimationFrame`: `FE/src/input/mediapipe-input.ts:204`, `FE/src/input/gameplay-hand-driver.ts:281`, `FE/src/camera/thumb-tracker.ts:206`, `FE/src/camera/wave-tracker.ts:125`. Tidak ada `Worker` atau `OffscreenCanvas` di `FE/src` (grep kosong). Worker belum dievaluasi terukur (PANDUAN `PANDUAN-NUI.md:66`). BELUM TERBUKTI.
- **Penjadwal frame:** setiap tick rAF membaca frame saat ini. Tick dilewati bila `video.currentTime` belum berubah (`mediapipe-input.ts:195-201`, `thumb-tracker.ts:202`, `wave-tracker.ts:121`, `gameplay-hand-driver.ts:272-276`) atau tab tersembunyi (`mediapipe-input.ts:193`, `thumb-tracker.ts:201`, `wave-tracker.ts:120`, `gameplay-hand-driver.ts:258-262`). Tidak ada antrean "latest frame" eksplisit, tidak ada budget atau frame-skip berbasis durasi. RUSAK ringan terhadap PANDUAN §3.
- **Satu inferensi in-flight:** `detectForVideo` sinkron (tanpa promise), sehingga satu driver tidak pernah menumpuk inferensi. Empat driver dapat hidup bersamaan bila pemakainya aktif bersamaan (lihat §2).
- **Timestamp:** `performance.now()` setiap panggilan (`mediapipe-input.ts:194`, `thumb-tracker.ts:206`, `wave-tracker.ts:125`, `gameplay-hand-driver.ts:270`). Monoton, tetapi bukan timestamp frame kamera. PANDUAN (`PANDUAN-NUI.md:130`) meminta timestamp frame untuk dt. RUSAK ringan.
- **Kamera macet / hilang:** drawing `CAMERA_STALL_MS = 500` (`mediapipe-input.ts:299`); gameplay 300 ms (`gameplay-hand-driver.ts:69`); thumb dan wave tidak punya deteksi macet.
- **Error:** drawing gagal pada error pertama (`mediapipe-input.ts:203-210`); wave dan thumb toleran 3 error berturut-turut (`wave-tracker.ts:43, 127-133`; `thumb-tracker.ts:207-213`); gameplay berhenti pada error pertama (`gameplay-hand-driver.ts:282-294`). RUSAK ringan (tidak konsisten).
- **Pelepasan saat stop/unmount:**
  - Drawing: rAF dibatalkan (`mediapipe-input.ts:239`), landmarker ditutup (`:262`), track hanya dihentikan bila milik sendiri (`:253-256`), listener visibilitas dan langganan stream dilepas (`:242-247`). SESUAI.
  - Gameplay: rAF (`gameplay-hand-driver.ts:180`), listener (`:184-188`), landmarker (`:313-326`). Stream dipinjam, tidak dihentikan (`:198`). SESUAI.
  - Thumb: `unbind()` saat holder terakhir lepas: rAF (`thumb-tracker.ts:183`), landmarker (`:187`), video (`:188-191`). Landmarker yang selesai dimuat setelah lepas ditutup (`:165-167`). SESUAI.
  - Wave: `release()` (`wave-tracker.ts:103-113`) dipanggil saat `stop()`, setelah wave (`:143-147`), dan setelah 3 error. Landmarker yang selesai setelah `stop()` ditutup (`:72-75`). SESUAI.
  - GlobalCamera unmount: `stopStream()` (`FE/src/components/camera/GlobalCamera.tsx:242`, `:299-315`) menghentikan track dan memanggil `setSharedStream(null)`. SESUAI.
  - `ThumbConfirm` tidak membersihkan `setTimeout` pulse 450 ms saat unmount (`FE/src/components/ui/ThumbConfirm.tsx:89`); `PinchRing` membersihkannya (`PinchRing.tsx:89-94`). RUSAK kecil.

---

## 2. Pembaca tangan dan kapan aktif

**Definisi pembaca**

- **thumb-tracker** (`FE/src/camera/thumb-tracker.ts`): satu instans, ref-count (`:124-134`), numHands 1. Aktif bila ada pemakai `useHandGesture` (`FE/src/hooks/useHandGesture.ts:17-29`): ThumbConfirm, PinchRing, atau useDwell tanpa pembaca halaman.
- **WaveTracker** (`FE/src/camera/wave-tracker.ts`): dibuat hanya oleh GlobalCamera (`FE/src/components/camera/GlobalCamera.tsx:188-212`). Aktif hanya pada mode `cover` (`:249-256`).
- **HandDrawingDriver** (`FE/src/input/mediapipe-input.ts`): aktif bila `DrawingSurface.setMode("hand")` (`FE/src/input/index.ts:81-127`). `beginReader()` mempublikasikan pembaca "drawing" sejak awal (`mediapipe-input.ts:74, 130-134`).
- **GameplayHandDriver** (`FE/src/input/gameplay-hand-driver.ts`): dijalankan `useHandControl` saat `readerWanted` = siap ∧ mode kamera ∧ belum ada hasil ∧ fase placing/gameplay (`FE/src/components/game/hooks/useHandControl.ts:47`).
- **hand-cursor-store** (`FE/src/camera/hand-cursor-store.ts`): bukan pembaca. Menyimpan kursor. Prioritas drawing/gameplay di atas tracker (`:51-61`). TTL 500 ms (`:27`).

**Per layar** (fase/route dari `FE/src/app/SketchbookApp.tsx`)

| Layar | Pembaca yang berjalan | Landmarker | Pemicu dan catatan | Tanda |
|---|---|---|---|---|
| Cover (`onboarding=camera`) | WaveTracker, hanya setelah tombol "Nyalakan Kamera" ditekan (`GlobalCamera.tsx:481-490` → `startCamera` `:347` → `startWaveTracking` `:383-389`). Berhenti saat wave (`wave-tracker.ts:143-147`), saat `finishCover` (`GlobalCamera.tsx:169`), atau mode berubah (`:254`) | 1 | Tidak ada DwellButton atau cincin di cover | SESUAI |
| Penggaris (`onboarding=number`) | ThumbConfirm 2000 ms, hanya setelah angka menetap 600 ms (`FE/src/components/onboarding/StudentRulerSelector.tsx:18, 72-77, 246-255`) → thumb-tracker | 0 atau 1 | Tidak ada jalur tangan untuk memilih angka: berkas tidak punya referensi tangan, kursor, dwell, atau gestur. Angka awal 20 atau angka tersimpan (`:37-45`) | HILANG |
| Tutorial kartu 1 | PinchRing (`FE/src/components/onboarding/TutorialBrochure.tsx:636-646`; siap `:555`) → thumb-tracker (`FE/src/components/ui/PinchRing.tsx:36`) | 1 | Cincin cubit memanggil `pinchWalk` (`TutorialBrochure.tsx:567-570`), lalu Thinman berjalan otomatis lewat interval 16 ms (`:131-149`) | RUSAK |
| Tutorial kartu 2 | PinchRing sama (`:639-646`); `ready(1) = true` (`:555`) | 1 | Tanpa jeda baca 10 detik | RUSAK |
| Tutorial kartu 3 | PinchRing hanya setelah `used.draw && used.undo` (`:555`). Kanvas latihan hanya event pointer (`:276`); tombol alat hanya klik (`:268-272`) | 1 | Tidak ada pembaca gambar tangan di kartu 3 | RUSAK; HILANG (jalur tangan) |
| Daftar level | `useDwell` per bookmark (`FE/src/components/level/LevelRibbonBookmark.tsx:319`); ThumbConfirm 2000 pada bookmark berikutnya (`:388-397`; `externalThumbUp = pageThumb` = `undefined` karena tidak ada pembaca halaman) → thumb-tracker. Dinonaktifkan saat `paused` (`:395`) | 1 | Daftar tampil dengan 4 bab (`FE/src/app/screens/LevelEntryScreen.tsx:25`; lihat §10 butir Level 4) | RUSAK (Level 4) |
| Intro level (overlay di atas halaman gambar) | HandDrawingDriver berjalan karena `DrawingFlowScreen` aktif saat fase drawing (`FE/src/app/SketchbookApp.tsx:170-187`; `FE/src/app/screens/DrawingFlowScreen.tsx:62`). `LevelIntro` memakai `pageThumb` (`FE/src/components/level/LevelIntro.tsx:72, 216-223`; `use-page-thumb.ts:19`) dan DwellButton (`LevelIntro.tsx:203-213, 228`) → tidak membuka tracker kedua | 1 (drawing, numHands 2) | Ini desain pembaca tunggal yang benar | SESUAI |
| Gambar, mode kamera (hand) | HandDrawingDriver (`FE/src/components/drawing/hooks/useDrawingSurface.ts:40-53`; `FE/src/input/index.ts:81-127`). Mode kamera selalu memakai tangan (`FE/src/components/drawing/DrawingScreen.tsx:81-90`). Finish ThumbConfirm 2000 dengan `externalThumbUp` (`FE/src/components/drawing/DrawingActions.tsx:46-55`; `DrawingScreen.tsx:232`). DwellButton "Tebak Gambarku" 2000 ms (`DrawingActions.tsx:83-93`) dan pojok (`DrawingScreen.tsx:143-171`) → `readerLive` true, tidak membuka tracker | 1 (numHands 2) | `beginReader` sinkron saat start | SESUAI |
| Gambar, mode pointer dalam sesi kamera (toggle "Pointer" di GlobalCamera `GlobalCamera.tsx:500-503`) | Tidak ada driver. DwellButton (`useDwell.ts:59-69`) membuka thumb-tracker setelah 300 ms. Finish ring menerima `externalThumbUp = false` (`DrawingScreen.tsx:232`) sehingga jempol tidak mengisi cincin | 1 (tracker) | Cincin "selesai gambar" mati di mode ini; hanya dwell yang bekerja | RUSAK (ringan) |
| Top-3, predicting, evaluating | `DrawingScreen` aktif = false → `setMode("pointer")` (`useDrawingSurface.ts:101-103`), tidak ada driver. DwellButton di Top3Panel, DecisionPanel, PredictingScreen, MomoGuessChat → thumb-tracker. HandCursor tampil (`FE/src/components/ui/HandCursor.tsx:33`) | 1 (tracker) | Terima = DwellButton 1200 ms, bukan jempol 2 detik (§10 butir 2) | RUSAK |
| Penempatan (`placing`) | GameplayHandDriver (`useHandControl.ts:47`; `enableJump: true` `:70`). Pinch langsung memindahkan objek (`:102-103`; `FE/src/components/game/hooks/usePlacement.ts:76-90`) tanpa ring. "Taruh di sini" hanya klik (`FE/src/components/game/PlacementControls.tsx:15-23`) | 1 (numHands 1) | Tidak ada konfirmasi tangan untuk menaruh objek | RUSAK; HILANG |
| Gameplay | GameplayHandDriver (sama). Pinch yang ditahan = lompat (`FE/src/input/gameplay-gesture.ts:216`; `FE/src/components/game/ControlGuide.tsx:23`). Chip status "(uji coba)" (`FE/src/components/game/GameStage.tsx:197-199`; `FE/src/app/screens/GameplayScreen.tsx:42` `integrated={true}`) | 1 | Panduan kontrol auto-buka 6 detik (`FE/src/components/game/hooks/useControlGuide.ts:8, 28-42`) | RUSAK (label) |
| Gagal (`outcome=fail`) | GameplayHandDriver berhenti (`useHandControl.ts:47`). FailOverlay: DwellButton ×3 (`FE/src/components/game/FailOverlay.tsx:29,37,45`) → thumb-tracker | 1 | "Gambar ulang" lewat dwell | SESUAI |
| Sukses | GameplayHandDriver berhenti. SuccessPopup ThumbConfirm 1000 (`FE/src/components/game/SuccessPopup.tsx:70`) → thumb-tracker | 1 | — | SESUAI |
| Tamat (`CenterOfPage`, `SketchbookApp.tsx:220`) | ThumbConfirm 1000 (`FE/src/components/ending/CenterOfPage.tsx:87, 94`), ThumbConfirm (`:115`), DwellButton (`:104`) → thumb-tracker | 1 | — | SESUAI |

**Apakah ada dua HandLandmarker bersamaan?**

- Pada alur utama: tidak ditemukan. Penjaganya:
  - thumb-tracker ref-count satu instans (`thumb-tracker.ts:124-134`);
  - `useDwell` memeriksa `readerLive` (`FE/src/hooks/useDwell.ts:56-69`);
  - `usePageThumb` mengembalikan `undefined` hanya bila tidak ada pembaca (`use-page-thumb.ts:15-20`);
  - finish ring memakai `externalThumbUp` (`DrawingActions.tsx:47-51`);
  - WaveTracker hanya di cover, dan driver gambar dibuat sesudahnya (`GlobalCamera.tsx:254`).
- **Celah yang tercatat:**
  1. `FE/src/components/onboarding/CameraIntro.tsx` tidak dipakai (satu-satunya rujukan: komentar `FE/src/camera/wave-tracker.ts:2`). Bila dipasang, ia memanggil `getUserMedia` sendiri (`CameraIntro.tsx:100`) dan membuat WaveTracker kedua (`:47`): dua kamera dan dua landmarker. Hapus. RUSAK laten.
  2. `PinchRing` (`PinchRing.tsx:36`) dan `ThumbConfirm` tanpa `externalThumbUp` (`ThumbConfirm.tsx:49`) tidak memeriksa `readerLive`. Aman sekarang karena tidak ada layar yang memasang keduanya bersama driver, tetapi tidak dijaga kode.
  3. Transisi pointer↔tangan: dwell membuka tracker setelah 300 ms tanpa pembaca (`useDwell.ts:21-22, 59-69`) dan melepasnya begitu driver memublikasikan (`mediapipe-input.ts:130-134` → `readerLive`). Di antara keduanya tracker boleh sedang memuat landmarker. Penutupan tertunda dijaga `generation` (`thumb-tracker.ts:165-167`). BELUM TERBUKTI (perlu hitung landmarker di DevTools).

---

## 3. Kamus gestur sekarang

Semua ambang dalam satuan rasio terhadap span tangan (pergelangan ke pangkal jari tengah, `hand-gesture.ts:192-196`) kecuali disebut lain.

| Gestur | Klasifikasi (file:baris) | Ambang | Voting / histeresis / hold / cooldown | Konteks aktif | Tanda |
|---|---|---|---|---|---|
| **Lambaian / dada-dada** | `FE/src/camera/wave-tracker.ts:21-29` (`detectWave`), `:115-148` | ≥ 8 sampel dalam 1,3 s (`:23`, `:44`); span sumbu-x pergelangan > 0,22 (`:27`); selisih awal-akhir < 0,18 (`:28`); pergelangan `landmarks[0][0]` (`:135`) | Tanpa voting. Sampel dibuang bila tangan hilang (`:136-138`). Sekali deteksi lalu release (`:143-147`). Tanpa cooldown terpisah | Cover saja | SESUAI (kode); BELUM TERBUKTI (ambang di kamera nyata) |
| Lambaian: batas fps | Perhitungan dari `mediapipe-input.ts:296-298` (kamera redup ~6 fps) | 1,3 s × 6 fps ≈ 8 sampel, tepat di batas. Di bawah 6 fps tidak pernah terpenuhi | — | Cover | BELUM TERBUKTI (perhitungan, bukan pengukuran) |
| **Jempol** | `FE/src/input/hand-gesture.ts:119-140` (`isThumbUp`); prioritas `:197` | `minLift` 0,45 (`:119`, `:129`); empat jari tertekuk, tip lebih dekat pergelangan daripada PIP (`:136`); ujung jempol paling tinggi (`:137`) | Thumb-tracker: per frame, tanpa voting. ThumbConfirm: isi `dt/holdMs`, turun ×0,5 (`ThumbConfirm.tsx:36, 81`), latch (`:61-63, 73-78`). Drawing: voting 3 dari 5 (`hand-stroke-pipeline.ts:21-23, 182`) | ThumbConfirm (1000 atau 2000 ms) | SESUAI |
| **Cubit (pinch) — gambar** | `hand-gesture.ts:200-206` (touch < 0,42; 0,55 bila ditahan `:152-153`; telunjuk tertekuk: 0,15 / 0,20 `:159-160`) | Di atas | Stroke mulai setelah 2 frame cubit (`hand-stroke-pipeline.ts:25, 254`). Stroke selesai setelah 3 dari 5 frame tanpa cubit (`:27, 274-275`). Loss grace 150 ms (`:29`, `:220-233`) | Gambar | SESUAI |
| **Cubit — PinchRing (tutorial)** | `FE/src/camera/thumb-tracker.ts:54-61` (`pinchHeld` dari frame sebelumnya = histeresis 0,42/0,55) | — | Isi `dt/holdMs`, turun ×0,5 (`PinchRing.tsx:30-31, 67`). Latch (`:47-48, 59-64`) | Tutorial kartu 1–3 | RUSAK (lihat §10) |
| **Cubit — gameplay / placing** | `FE/src/input/gameplay-gesture.ts:78, 186-195` | Engage < 0,42; konfirmasi 2 frame (`:128`); lepas > 0,50 (`:124`) | Reacquire 3 frame (`:126`) | Placing: seret objek (`arbiter.ts:294-314`). Gameplay: lompat (`gameplay-gesture.ts:216`) | SESUAI (fase) |
| **Kepal (Hapus)** | `hand-gesture.ts:162, 208-214` (empat jari tertekuk; `thumbLift < 0,3`) | Di atas | Erase saat stable fist (`hand-stroke-pipeline.ts:187, 197-200`). Radius default 28 px (`FE/src/input/eraser.ts:5`); rentang 12–56 px (`:7-8`). Dua tangan dapat mengubah radius (`hand-stroke-pipeline.ts:110, 164-173`; `eraser.ts:35-36, 43`) | Gambar, saat Hapus aktif atau kepal | RUSAK (menyimpang dari saran Owner "radius tetap": BIGPROMPT:148, PANDUAN:175) |
| **Dua jari (Mundur / undo)** | `hand-gesture.ts:216-222` (index/middle tidak tertekuk, satu lurus; ring dan kelingking tidak lurus) | Di atas | Hold 300 ms, edge-triggered, reset saat pose berubah (`FE/src/components/drawing/gesture-commands.ts:11, 21-41`). Voting 3/5 | Gambar | SESUAI (kode); BELUM TERBUKTI (dicoba di kamera) |
| **Telapak terbelah (Maju / redo)** | `hand-gesture.ts:224-229` (semua jari tidak tertekuk; celah tengah–manis > 0,25 span `:168` dan > 1,8× celah lain `:166`) | Di atas | Hold 300 ms (`gesture-commands.ts:11`) | Gambar | RUSAK/belum diputuskan (§10 butir 7) |
| **Telapak terbuka (`open-palm`)** | `hand-gesture.ts:230` (semua jari lurus, bila bukan split) | — | Tidak ada konsumen: `open-palm` hanya di `hand-gesture.ts:147, 149, 230` | — | HILANG (tidak ada aksi) |
| **Telunjuk dwell** | `FE/src/hooks/useDwell.ts:18` (1200 ms default); kursor dari store, mirrored (`:99`); paling atas (`:45-51`); latch (`:83, 104-116`); turun ×0,5 (`:20, 107`) | Tebak 2000 ms (`DrawingActions.tsx:85`); keluar 1800 ms (`DrawingScreen.tsx:161`); lainnya 1200 ms | Latch: satu aktivasi, lalu harus keluar dulu (`useDwell.ts:104-116`) | Top-3, Decision, Intro, Gagal, Tamat, Bookmark, Gambar | SESUAI (tanpa kalibrasi) |
| **Lima jari memutar (rotasi)** | Tidak ada. Grep `rotat|putar|rotasi|spin|angle` di `FE/src/input`, `FE/src/game`, `FE/src/components/game`, `FE/src/domain`: hanya kode runtime fisika dan BookFlip | — | — | — | HILANG |
| **Lompat (gameplay)** | Pinch yang ditahan: `gameplay-gesture.ts:216`; `enableJump: true` (`useHandControl.ts:70`); teks "Satukan telunjuk dan jempol untuk lompat" (`ControlGuide.tsx:23`) | — | — | Gameplay | BELUM TERBUKTI (tidak ada di brief; DECISIONS:95-97 menyebut kontrol karakter belum terkunci) |

**Ikon toolbar dan keputusan R12**

- Toolbar: Gambar = `hand-draw` (pinch), Hapus = `hand-erase` (kepal), Mundur = `hand-undo` (dua jari), Maju = `hand-redo` (telapak terbelah). `FE/src/components/drawing/DrawingToolbar.tsx:71-95`. Glyph dari `FE/src/components/ui/Icon.tsx:14-39`.
- SVG sumber ada di `contexts/can/design/visual/drawing-gestures/` (pinch, kepal, dua-jari, telapak-terbelah). Komentar `Icon.tsx:9` menulis `design/visual/...` tanpa `contexts/can/`. Kecil.
- **Keputusan tercatat:**
  - `contexts/can/PRD_REVISI_0.0.16.md` → `contexts/can/project/PRD_REVISI_0.0.16.md:166-170` (R12): pemetaan "telapak terbelah = Maju" masih **usulan, perlu konfirmasi Owner**.
  - `contexts/can/DECISIONS.md:96` (di bagian "Yang Sengaja Tidak Difinalkan"): Redo/Ulang = ikon telapak terbuka (emoji tangan terbuka); pipeline kamera sebagai input belum dikunci.
  - BIGPROMPT §6.3 (`BIGPROMPT.md:149`) dan PANDUAN (`PANDUAN-NUI.md:81`) menyebut Redo = telapak terbuka.
- **Riwayat:** `split-palm` untuk redo sudah ada di cabang `can` (`git show d4bbaec:implementation/src/input/hand-gesture.ts:194-204`) dan di `8926992`. `open-palm` ada di `8926992` (`hand-gesture.ts:185`) dan tidak pernah dikonsumsi. Komentar `hand-gesture.ts:145-146` pada HEAD menyebut "open palm used for the wave". Komentar itu usang; `wave-tracker.ts` tidak pernah memakainya (`d4bbaec` dan `8926992` sama).

---

## 4. Router gestur, konflik, dan latch

**Bentuk router.** Tidak ada satu router. Keputusan gestur tersebar per layar:

- Gambar: `HandStrokePipeline` (`FE/src/input/hand-stroke-pipeline.ts`) untuk tinta dan hapus; `gesture-commands.ts` untuk undo/redo; `DrawingActions` untuk finish ring.
- Gameplay: `GameplayHandDriver` → `GameplayGestureFilter` → `InputArbiter` (`FE/src/input/arbiter.ts`, dipakai `FE/src/components/game/hooks/useGameplayInput.ts:54-56` dan `useHandControl.ts:55-95`). Arbiter menjalankan aturan R1–R10 hanya untuk placing dan gameplay.
- Konfirmasi dan dwell: ThumbConfirm, PinchRing, DwellButton membaca store atau tracker bersama.
- Cover: WaveTracker berdiri sendiri.
- **Dokumentasi usang:** `arbiter.ts:7` ("NOT wired into the UI yet") dan `FE/docs/execution/INPUT_ARCHITECTURE.md:23` ("NOT wired yet") tidak sesuai kode. Arbiter sudah dipakai gameplay. RUSAK (dokumen).

**Konflik dari PANDUAN §4 dan BIGPROMPT §8**

| Konflik | Mekanisme sekarang | Tanda |
|---|---|---|
| Jempol sebagai ack vs submit | Finish ring hanya tampil bila `isDrawingPhase && active && hasInk && !finishPaused` (`DrawingActions.tsx:43`). Submit lewat `handleSubmitDrawing` yang memeriksa fase `drawing` (`FE/src/app/SketchbookApp.tsx:116-119`). Tidak ada arbiter prioritas eksplisit lintas layar | SESUAI (berbasis state) |
| Telapak (redo) vs rotasi lima jari | Rotasi tidak ada. `open-palm` tidak dikonsumsi | HILANG (rotasi) |
| Cubit kuas vs cubit seret Thinman vs cubit objek | Dipisah per fase: gambar (`HandStrokePipeline`), placing (`arbiter.ts:294-314`), gameplay (`arbiter.ts:316-327`), tutorial (PinchRing). Di gameplay cubit = lompat (`gameplay-gesture.ts:216`), tidak terkunci di dokumen (`DECISIONS.md:95-97`) | SESUAI (per fase); RISIKO (gameplay) |
| Lambaian vs telapak | Lambaian hanya di cover, telapak hanya di gambar. Tidak bertabrakan karena layar terpisah | SESUAI |
| Dwell vs jempol pada layar yang sama | `useDwell` punya `dwellOwner` tunggal (`useDwell.ts:25, 110-118`) untuk dwell. Tidak ada arbitrasi antar jenis (dwell vs ThumbConfirm) | BELUM TERBUKTI |
| Ack ganda akibat jitter atau tangan tertahan | ThumbConfirm satu `onConfirm` per latch (`ThumbConfirm.tsx:86-91`). `SketchbookApp` submit memeriksa fase. gesture-commands fire-once (`gesture-commands.ts:33-38`) | SESUAI |

**Latch lintas transisi layar (mekanisme yang ada)**

- ThumbConfirm dan PinchRing mulai dengan `latchedRef = true` dan hanya terpasang setelah melihat "tidak ada jempol/cubit" (`ThumbConfirm.tsx:61-63, 73-78`; `PinchRing.tsx:47-48, 59-64`).
- DwellButton: `armed = false` bila jari sudah di atas tombol saat tombol muncul. Tombol menunggu satu kali keluar dulu (`useDwell.ts:83, 104-108`).
- `useDrawingSurface` mereset pose ke `none` saat status bukan ready/drawing (`useDrawingSurface.ts:44-45`).
- Arbiter: `needsHandRelease` (`arbiter.ts:257-261, 299-302`) dan `handDirLockout` (`:323`).

**Dua gejala dari analisis fase**

- Gesture tertahan melintasi modal: tercakup latch di atas. Tidak ada uji runtime.
- Gesture yang tetap aktif saat Top-3 terbuka: `DrawingScreen` aktif = false membuat pointer (`useDrawingSurface.ts:101-103`), jadi tidak ada cubit atau kepal yang menulis tinta.

---

## 5. Smoothing (`FE/src/input/smoothing.ts`)

Algoritma: 1€ Filter (`OneEuroFilter`, `:7-47`), dengan dt dari timestamp `performance.now()`. Ada juga cabang EMA (`PointSmoother` dengan `alphaParam`, `:96-121`), tetapi tidak ada pemanggil yang memberi alpha, jadi jalur itu tidak terpakai.

| Pemakai | Filter | minCutoff / beta / dCutoff | Lokasi | Jalur |
|---|---|---|---|---|
| Tinta gambar | One Euro | 1,0 / **5,0** / 1,0 (`DRAWING_ONE_EURO`, `:90`) | `hand-stroke-pipeline.ts:81, 189` | Gesture (tinta) |
| Telapak penghapus | One Euro | 1,0 / 5,0 / 1,0 | `hand-stroke-pipeline.ts:82, 198` | Gesture (hapus) |
| Posisi placement (cursor gameplay) | One Euro default | 0,8 / **0,015** / 1,0 (`DEFAULT_ONE_EURO`, `:84`) | `gameplay-gesture.ts:159, 177`; dipakai `useHandControl.ts:102-103` | Gesture (posisi) |
| Zona gameplay | Tanpa filter (raw) + histeresis 0,35/0,65 masuk, 0,40/0,60 keluar | — | `gameplay-gesture.ts:23-24, 121-122, 197-207` | Gesture |
| Kursor store (dwell, HandCursor) | Tanpa filter (raw, mirrored) | — | `hand-gesture.ts:23-27`; `hand-cursor-store.ts:31` (epsilon 0,003 hanya ambang notifikasi) | Pointer |
| Pointer mouse/touch | Tanpa filter | — | `FE/src/input/pointer-input.ts` | Pointer |
| WaveTracker | Tanpa filter (wrist raw) | — | `wave-tracker.ts:135` | — |

**Temuan**

- PANDUAN (`PANDUAN-NUI.md:130`) memberi `minCutoff=1.0`, `beta=0.007` sebagai contoh awal. Kode memakai beta 5,0 untuk tinta (alasan di komentar `smoothing.ts:86-89`, tanpa pengukuran) dan 0,015 untuk placement. BELUM TERBUKTI.
- Placement memakai koordinat yang dihaluskan dengan beta 0,015. PANDUAN (`:130`) melarang jalur gesture memakai koordinat display-smoothing secara buta. Komentar `smoothing.ts:86-89` menyebut lag sekitar 0,2 s pada beta lama. RUSAK (potensi lag placement; BELUM TERBUKTI).
- Timestamp untuk dt: `performance.now()` saat diproses, bukan timestamp frame (lihat §1.2). RUSAK ringan.
- Pemisahan jalur: tinta dan telapak dipisah (sudah), tetapi pointer UI dan jalur gesture memakai dua cara berbeda tanpa pengukuran. BELUM TERBUKTI.

---

## 6. CLAHE, fill-light, ONNX, RTMPose

- `FE/package.json` deps: `@mediapipe/tasks-vision`, `@playwright/test`, `gsap`, `kaplay`, `next`, `react`, `react-dom` (`package.json:15-24`). Tidak ada `onnxruntime`.
- `grep -rniE "onnx|clahe|rtmpose|fill[-_ ]?light"` di seluruh repo (tanpa node_modules, .next, out): satu hasil, yaitu biner `implementation/docs/evidence/videos/page@….webm` (kecocokan acak di dalam biner, bukan kode).
- Status: **HILANG**. Tidak ada CLAHE, fill-light, ONNX, atau RTMPose di kode. Bukan MOCK. Konsekuensinya tidak ada baseline A/B dan gate PANDUAN §7 belum relevan.

---

## 7. Fallback dan instruksi keyboard

**Per kegagalan (kamera ditolak, tidak ada, atau MediaPipe gagal)**

| Layar | Perilaku | Tanda |
|---|---|---|
| Cover | `reportCameraFailure` (`GlobalCamera.tsx:318-326`) → label "Izin kamera ditolak. Pakai mouse atau keyboard." (`FE/src/camera/messages.ts:17`). Hint "Kamera tidak bisa dipakai. Tekan Bangunkan Momo." (`FE/src/domain/guide-script.ts:28`) dan tombol "Bangunkan Momo" (`GlobalCamera.tsx:556-564`) | SESUAI (PRD R13, `PRD_REVISI_0.0.16.md:172-178`) |
| Penggaris | ThumbConfirm fallback: tahan dengan mouse, Enter, atau Spasi (`ThumbConfirm.tsx:149-183`). Angka dipilih dengan pointer, keyboard, roda (`StudentRulerSelector.tsx:151`) | SESUAI |
| Tutorial | "Lewati Tutorial" hanya saat fallback (`TutorialBrochure.tsx:590-595`). PinchRing fallback: tahan tombol (`PinchRing.tsx:141-175`) | SESUAI |
| Daftar level | Ribbon ditarik dengan pointer; ThumbConfirm fallback | SESUAI |
| Intro level | DwellButton fallback berupa tombol biasa (`DwellButton.tsx:4`) | SESUAI |
| Gambar | Switch "Mouse / Kamera" hanya di fallback (`DrawingActions.tsx:57-78`) | SESUAI (R13) |
| Top-3, decision, gagal, tamat | DwellButton fallback = tombol biasa | SESUAI |
| Gameplay | `mode = fallback` memakai GameplayControls aktif (`GameStage.tsx:47-54`); panduan keyboard auto-buka 6 detik (`ControlGuide.tsx:28-32`, `useControlGuide.ts:8`) | SESUAI (hanya dalam fallback) |
| Penempatan "Taruh di sini" | Hanya klik (`PlacementControls.tsx:15-23`). Tidak ada jalur tangan | HILANG |
| "Masukkan ke dunia" dan "Gambar ulang" (EnterWorldPopup) | Hanya `<button>` (`FE/src/components/game/EnterWorldPopup.tsx:29-36`) | HILANG |
| "Gambar lagi" di header gameplay | Hanya klik (`FE/src/components/game/StageHeader.tsx:50-52`) | HILANG |
| "Reposisi" objek dan shortcut | Hanya klik (`GameplayControls.tsx:62`; `CreationShortcuts.tsx:17`) | HILANG |

Catatan: DECISIONS `D-20261027-05` (`contexts/can/DECISIONS.md:874-876`) menuntut jalur kamera yang berfungsi untuk semua interaksi inti. Baris HILANG di atas melanggar itu.

**Instruksi keyboard dan mouse sejak awal (Owner: jangan)**

- Mode kamera: tidak ada teks keyboard di copy normal. `ControlGuide` mode kamera hanya kartu tangan (`ControlGuide.tsx:17-26`). Copy tutorial kamera juga tanpa keyboard (`TutorialBrochure.tsx:86-99`). SESUAI.
- **Tombol arah gameplay tampil dari awal di mode kamera** sebagai indikator (`GameplayControls.tsx:46-58`; `DirectionButton.tsx:41-55` tanpa handler tekan). PRD R13 (`PRD_REVISI_0.0.16.md:177`) menyatakan tombol panah harus disembunyikan di mode kamera. RUSAK (ringan).
- **Label dev terlihat siswa di mode kamera:**
  - "NUI NOT VERIFIED" sebagai status awal (`FE/src/components/game/hooks/useHandControl.ts:44`) dan "Kamera belum tersedia · NUI NOT VERIFIED" (`:62`).
  - Chip `{hand.status} (uji coba)` (`GameStage.tsx:198`, integrated = true di `GameplayScreen.tsx:42`).
  - RUSAK (copy).
- Label "FALLBACK pointer/keyboard — BUKAN NUI TERVERIFIKASI" (`GameStage.tsx:202`) hanya untuk pemakaian `integrated=false` (mis. halaman preview). Catatan kecil.
- Pesan kegagalan kamera memuat kata "keyboard" (`messages.ts:17-24`; `useHandControl.ts:16-17`). Hanya tampil setelah kegagalan, boleh menurut R13, dicatat.

---

## 8. REST Dias dan klien

### 8.1 Endpoint

| Panggilan | Klien | Backend (repo) | Tanda |
|---|---|---|---|
| `POST {NEXT_PUBLIC_PREDICTION_ENDPOINT atau API_BASE/predict}`, body `{drawing}` | `FE/src/prediction/partner-http-provider.ts:86-91, 165`; `FE/src/config/env.ts:54-59, 131-163` | `BE/main.py:60-63` → `{"candidates": [...]}`. Tanpa `predictionId` atau `modelVersion` | SESUAI (field opsional) |
| `POST /api/submissions` | `FE/src/api/submission-client.ts:13-27, 58` | `BE/classroom.py:124-136` (`SubmissionBody`), `:151-194` (dedup `submission_key`, 201 atau 200) | SESUAI (struktur); RISIKO data (§8.4) |
| `PATCH /api/submissions/{id}/outcome` | `submission-client.ts:61-71`; `FE/src/api/submission-adapter.ts:83-91` | `BE/classroom.py:139-142, 196-207` | SESUAI |
| `GET /api/join/{token}` | `FE/src/api/classroom-client.ts:100-102`; `FE/src/app/hooks/useClassroomSession.ts:97-117` | `BE/classroom.py:60` | SESUAI |
| `POST /api/join/{token}/students` | `classroom-client.ts:104-121`; `SketchbookApp.tsx:147-151` | `BE/classroom.py:77` | SESUAI |
| `GET /api/v1/model-info` | `classroom-client.ts:123-125` (tidak dipanggil) | Tidak ada di backend (`contracts/API_INVENTORY.md:33`; `docs/migration/UNRESOLVED.md:42` "Kode mati"; `tests/integration/verify_backend.py:100-101`) | RUSAK (kode mati) |
| Event sink | `FE/src/events/http-batch-sink.ts` (DRAFT) | `NEXT_PUBLIC_EVENT_ENDPOINT` kosong = nonaktif (`env.ts:94-96`) | SESUAI |

Catatan: `BE/` adalah backend Dias dalam monorepo. Kontrak dibaca hanya untuk verifikasi, tidak diubah.

### 8.2 Alur

Konfirmasi penggaris → `joinClass` bila ada `joinToken` (`SketchbookApp.tsx:147-151`). `enterLevel` membuat provider per level (`FE/src/app/hooks/useLevelSession.ts:100`). Tombol Tebak → `submitDrawing` (`FE/src/app/state-machine.ts:184-196`; guard fase `drawing`, `:185`). `runPrediction` memanggil `provider.predict` (`state-machine.ts:215-237`, pemanggilan `:220`). Hasil: fase `evaluating`. Gagal: `prediction-error` (`:228-234`). Keputusan `decideAccept`, `decideCorrect`, atau `decideOverride` → `applyDecision` → `onDecisionApplied` → `handleDecisionApplied` (`useLevelSession.ts:116-118`; `submission-adapter.ts:51-81`) → outbox → `POST /api/submissions` (bila `classContext` ada). Hasil gameplay → `onGameplayResult` → `handleGameplayResult` → PATCH outcome (`useLevelSession.ts:119-121`; `submission-adapter.ts:83-91`). Panggilan submit dan outcome dibungkus `.catch(() => {})` (`useLevelSession.ts:117, 120`) sehingga kegagalan logging tidak membekukan game. SESUAI.

### 8.3 Mock vs live dan label

- Default `NEXT_PUBLIC_PREDICTION_MODE` = `mock` bila tidak di-set (`FE/src/config/env.ts:38-40`). `.env.example:9` juga `mock`.
- **Dockerfile default `partner`** (`FE/Dockerfile:11`) dan endpoint wajib (`:18`). Dua default berbeda: env.ts dan .env.example = mock; Dockerfile = partner. RUSAK ringan (konsistensi).
- `MockPredictionProvider`: label dipilih dari hash input; confidence tetap per stage, misalnya stage 1 `[0.86, 0.09, 0.05]` (`FE/src/prediction/mock-prediction-provider.ts:49-54`); latency 500 ms (`env.ts:173`; `mock-prediction-provider.ts:90`); provenance `"mock"` (`:113`). MOCK. Kodenya sendiri menyatakan "values are invented dev fixtures" (`:7-16`).
- Label UI:
  - "Mode demo: tebakan masih simulasi" (`FE/src/components/shared/DevBanner.tsx:11`), tampil bila `SHOW_MOCK_NOTICE = true` (`FE/src/config/demo.ts:5`).
  - "Demo: tebakan simulasi" (`FE/src/components/prediction/MomoGuessChat.tsx:72`; `Top3PredictionPopup.tsx:89`).
  - SESUAI dengan D-20261105-07 (`DECISIONS.md:84`).
  - Catatan: label dihitung dari env (`FE/src/app/hooks/useLevelSession.ts:101`), bukan dari instance provider. Bila env salah eja, label "mock" tetapi provider = `configErrorProvider` (`env.ts:135-139`). Kecil.
- Partner: endpoint wajib `http(s)` (`partner-http-provider.ts:74-76`). Error dipetakan ke `PredictionError` (`:92-98`, `:130-141`).

### 8.4 RISIKO data: mock masuk data kelas

- `handleDecisionApplied` tidak memeriksa `providerMode` atau provenance (`submission-adapter.ts:51-81`). Hanya `label` dan `confidence` yang dikirim (`:69-73`).
- `CreateSubmissionRequest` tidak punya field provenance atau mode (`submission-client.ts:13-27`).
- Backend menyimpan `candidates_json` dan `top1_confidence` apa adanya (`BE/classroom.py:173-176`).
- Kondisi terpenuhi bila siswa bergabung kelas: join token dari URL (`join`, `join_token`, `kelas`, `useClassroomSession.ts:83-94`) atau sesi tersimpan.
- `D-20261027-03` (`contexts/can/DECISIONS.md:894-901`) menyatakan prediksi asli dan mock "harus bisa dibedakan dalam data". Kode tidak memenuhinya. RUSAK (integritas data).

### 8.5 RISIKO keamanan: token sesi siswa ke endpoint partner

- `FE/src/app/SketchbookApp.tsx:45` → `tokenProvider: () => classroomRef.current.session?.student_session_token`.
- `useLevelSession.ts:100` → `createPredictionProvider(level, sessionOptions?.tokenProvider)`.
- `env.ts:131-134, 163` → `PartnerHttpPredictionProvider({ tokenProvider })`.
- `partner-http-provider.ts:152-160` → header `authorization: Bearer <token>` untuk setiap `POST` ke endpoint prediksi. Endpoint itu bisa lintas-origin.
- Komentar `partner-http-provider.ts:44-47` menyatakan tokenProvider "Never wired to env" dan ditujukan untuk autentikasi masa depan. Kenyataannya sudah tersambung ke token sesi siswa.
- Dampak: token sesi siswa bocor ke endpoint prediksi (bisa pihak ketiga) selama sesi berlaku, lalu bisa dipakai untuk submission/outcome atas nama siswa (`BE/classroom.py:153`, `:197-200`).
- Status: RISIKO (kode terverifikasi statis; belum diuji di runtime). BELUM TERBUKTI (runtime).

### 8.6 Timeout, retry, offline

| Lapis | Perilaku | Bukti | Tanda |
|---|---|---|---|
| Predict | Timeout 8000 ms (`env.ts:60-63`; `partner-http-provider.ts:83`). Tanpa retry (`:80-141`). Retry manual siswa (`state-machine.ts:199-205`). Offline: fetch gagal → `PredictionError("unknown")` (`partner-http-provider.ts:135-138`) → `prediction-error` (`state-machine.ts:228-234`). Tidak ada cek `navigator.onLine` untuk predict | kode | SESUAI (fallback jelas); BELUM TERBUKTI (offline di runtime) |
| HTTP klien (submission, join) | Timeout 8000 (`FE/src/api/http-client.ts:81`). Error dipetakan ke `ApiError` (`:191-218`) | kode | SESUAI |
| Outbox (submission dan outcome) | IndexedDB (`FE/src/api/outbox.ts:184-188`). Backoff eksponensial 1 s → 30 s + jitter 30% (`outbox.ts:179-180, 322-326`). Retry untuk network, timeout, 5xx, 429 (`:328-336`). Tanpa batas percobaan (`:392`, `:450`). Non-retryable (400/401/403/404/409/413/422) → `blocked` (`:419-429`, `:469-472`). Proses ulang saat event `online` (`:191-193`) | kode | SESUAI; RISIKO (antrean tanpa batas) |
| Idempotensi | `submission_key` dibuat klien (`submission-client.ts:14`); server dedup (`BE/classroom.py:145-151`, `:157-160`) | kode | SESUAI |
| Sesi siswa | `sessionStorage` per tab (`FE/src/api/classroom-client.ts:37-82`) | kode | SESUAI |
| Event sink | Retry dan backoff di `http-batch-sink.ts:10-12`; nonaktif bila endpoint kosong | kode | SESUAI (nonaktif default) |

### 8.7 Kontrak yang belum terbukti

- `partner` DRAFT tidak diuji terhadap endpoint nyata. Komentar: "NOT TESTED beyond injected fake fetch" (`partner-http-provider.ts:18-19`). BELUM TERBUKTI.
- `X-Model-Version` dan `predictionId` tidak dikirim backend. Klien menerima keduanya sebagai opsional (`partner-http-provider.ts:113-117`; `model-contract.ts:219`). SESUAI sebagai opsi.
- Validasi respons (`FE/src/prediction/validation.ts:34-86`): tepat 3 kandidat (`:47`), confidence [0,1] (`:65`), tanpa duplikat (`:75`), urut menurun (`:78-80`). Label di luar kosakata: `allow` (default) → "unresolved"; `reject` opt-in (`:83-85`). SESUAI.

---

## 9. Test hooks (`__skb*`) dan simulasi

Semua hook dipasang hanya bila `NEXT_PUBLIC_TEST_HOOKS === "1"`. `FE/Dockerfile` tidak men-set variabel ini (grep). Gate diperiksa saat jalan, bukan dieliminasi saat build, sehingga kode simulasi tetap ada di bundle. BELUM TERBUKTI (apakah bundle produksi menyertakan kode simulasi).

| Hook / fungsi | Pemasangan | Gate | Jenis |
|---|---|---|---|
| `window.__skbWave()` dan tombol `W` | `FE/src/components/camera/GlobalCamera.tsx:173-186` (set `:177`, key `:178-181`) | `:175` | Simulasi lambaian tanpa kamera |
| `__skbThumb`, `__skbPinch`, `__skbInputMode` | `FE/src/hooks/useHandGesture.ts:37-52` | `:48` | Simulasi jempol, cubit, mode input |
| `simulateThumb`, `simulatePinch` | `FE/src/camera/thumb-tracker.ts:107-121`; efek `effective()` menimpa pembacaan nyata (`:64-68`) | via hook | Simulasi |
| `window.__skbTestHooks.surface` | `FE/src/components/drawing/hooks/useDrawingSurface.ts:56-59, 72-74` | `:56` | Akses `DrawingSurface` |
| `feedHandLandmarksForTest`, `feedHandsForTest`, `pushTestCursor` | `FE/src/input/index.ts:199-232` (methods; akses lewat surface) | via surface | Simulasi landmark masuk pipeline |
| `feedLandmarksForTest` | `FE/src/input/mediapipe-input.ts:178-185` | "di pemanggil" (tidak ada gate langsung) | Simulasi landmark |
| `publishHandForTest` | `FE/src/camera/thumb-tracker.ts:112-115` | Tidak ada pemanggil di `FE/src` | Simulasi (cek test) |
| `__skbSetInput`, `__skbOverrideInput` | `FE/src/components/game/hooks/useGameplayInput.ts:84, 93-96` | `:84`, `:94` | Simulasi arah (bypass) |
| `__skbMovePlacement` | `FE/src/components/game/hooks/usePlacement.ts:46-49` | `:47` | Bypass posisi placement |
| `__skbGameController` | `FE/src/components/game/hooks/useGameController.ts:64` | gate | Akses controller |
| `__skbMock` (MockPredictionProvider, mode fail atau malformed) | `FE/src/app/hooks/useLevelSession.ts:102-105` | `:103` | Simulasi provider |
| `forceInputMode` | `FE/src/input/input-mode.ts:67-71`; dipakai `__skbInputMode` | via hook | Simulasi kamera gagal |
| Ring buffer event | `FE/src/events/index.ts:22-50` | aktif bila test hooks | Pengamatan uji |

**Hanya simulasi (tidak mengukur kamera atau model nyata):** semua `__skb*` di atas; `MockPredictionProvider` (fixture DEV). Hasil uji yang memakai hook ini tidak boleh dilabeli PASS untuk kamera fisik (PANDUAN §11, `PANDUAN-NUI.md:198`).

---

## 10. Konflik keputusan vs kode (existing → requested → konflik → resolusi)

Prioritas: instruksi Owner terbaru (`BIGPROMPT.md` 2026-11-10) > DECISIONS aktif > PRD > kode. Konflik antar-sumber dicatat, tidak diselesaikan diam-diam.

| # | Butir | Existing (kode) | Diminta | Konflik | Resolusi / persetujuan | Tanda |
|---|---|---|---|---|---|---|
| 1 | Teks "Lambaikan Tanganmu!" | Headline saat kamera aktif (`GlobalCamera.tsx:408`); preview "Menunggu lambaian tanganmu..." (`:382`) | Teks "Lambaikan tanganmu" hilang (`BIGPROMPT.md:116`, `:314`, `:363`). PRD R1 meminta judul berganti "Lambaikan Tanganmu!" (`PRD_REVISI_0.0.16.md:17`) | Antar-sumber: PRD (2026-11-07) vs instruksi Owner terbaru (2026-11-10) | Ikuti instruksi terbaru. Owner konfirmasi untuk mencabut R1 baris 17 | RUSAK |
| 2 | Terima (accept) | DwellButton 1200 ms (`Top3Panel.tsx:59-76`); DecisionPanel "Bukan ini", "Pakai", "Gambar ulang" juga DwellButton (`DecisionPanel.tsx:65-122`) | Terima = jempol ke atas, tahan 2 detik, "sudah dipilih Owner" (`PRD:67`, `:73`, `:242`). Pilih lain dan Bukan semua: cincin 2 detik sementara (`PRD:83`) | Konflik langsung | Ganti Terima ke ThumbConfirm holdMs 2000 pada `Top3Panel.tsx`. Pilih lain dan Bukan ini ke cincin 2000 ms | RUSAK |
| 3 | Lanjut kartu 1–2 | PinchRing 1200 ms (kartu 1) dan 1000 ms (kartu 2) (`TutorialBrochure.tsx:582-586`, `:636-646`) | ThumbConfirm 1 s (`PRD:88`); jempol hanya setelah ≥10 s baca (`BIGPROMPT.md:139, 144, 198-200`) | RUSAK | Ganti ke ThumbConfirm holdMs 1000. Tambah reading window ≥10 s sebelum ring muncul (`TutorialBrochure.tsx:555, 639`) | RUSAK |
| 4 | Kartu 3 "Mulai Level 1" | PinchRing 2000 ms (`:585`) | ThumbConfirm 2 s (`PRD:88`) | RUSAK | ThumbConfirm 2000 ms, setelah syarat dan reading window | RUSAK |
| 5 | Kartu 1: seret Thinman | Pinch-hold memicu jalan otomatis 1,4 s (`:131-149`, `:567-570`) | Thinman ikut tangan atau berhenti di bendera; "jangan pinch lalu auto-jalan" (`BIGPROMPT.md:138`) | RUSAK | Implementasi seret tangan (cubit tahan = gerak, lepas = berhenti). Tidak auto-walk. Berhenti di bendera (`WALK_END`, `:80`) | RUSAK |
| 6 | Kartu 3 syarat lulus | `used.draw && used.undo` (`:555`) | Coret, hapus, mundur, dan maju semua harus dicoba (`BIGPROMPT.md:149-150`; teks `:585`; DECISIONS:75) | RUSAK | `ready(2) = used.draw && used.erase && used.undo && used.redo` | RUSAK |
| 7 | Kartu 3 jalur tangan | Kanvas pointer-only (`:276`); tombol klik (`:268-272`) | Pinch kuas, kepal hapus, dua jari mundur, telapak maju (`BIGPROMPT.md:147-149`) | HILANG | Sambungkan HandStrokePipeline dan gesture-commands ke kanvas latihan | HILANG |
| 8 | Redo: telapak terbuka atau terbelah | `split-palm` (`hand-gesture.ts:265`) | Telapak terbuka (`BIGPROMPT.md:149`, `PANDUAN-NUI.md:81`; `DECISIONS.md:96` emoji telapak terbuka). PRD R12: telapak terbelah, usulan (`PRD:170`) | Konflik terbuka | Keputusan Owner. Setelah itu: petakan `open-palm` ke redo, atau pertahankan split. Jangan biarkan dua pose bersaing | BELUM TERBUKTI (perlu keputusan) |
| 9 | Rotasi lima jari | Tidak ada | `BIGPROMPT.md:177`; Lampiran 17 | HILANG | Tambah state rotasi di placement dengan ring konfirmasi. Dibedakan dari `open-palm` diam | HILANG |
| 10 | Konfirmasi placement (ring, lepas untuk taruh) | Pinch langsung memindahkan (`useHandControl.ts:102-103`); "Taruh" hanya klik (`PlacementControls.tsx:15-23`) | Ring progres sebelum pindah; lepas untuk taruh (`BIGPROMPT.md:176`) | RUSAK; HILANG | Ring cubit sebelum mode pindah; "Taruh" = lepas cubit atau jempol 2 s | RUSAK |
| 11 | Level 4 | `LEVELS` memuat stage 4 "Bab 4 · Pembuktian" (`FE/src/domain/levels.ts:151-155`, `:185`), tampil di daftar (`LevelEntryScreen.tsx:25`). Sejak `9ba76d2` | Tiga level saja; tidak ada Level 4 (`BIGPROMPT.md:11`, `:55`, `:185`) | RUSAK (berat) | Hapus stage 4 dari `LEVELS`; cek `FINAL_LEVEL_STAGE` (`levels.ts:188`) dan tipe `stage: 1 | 2 | 3 | 4` (`mock-prediction-provider.ts:25`) | RUSAK |
| 12 | Jempol di gambar, mode pointer | Ring selesai gambar mati (`DrawingScreen.tsx:232`) | Konfirmasi jempol dalam NUI (`BIGPROMPT.md:170`) | RUSAK (ringan) | Jika pointer, biarkan ThumbConfirm membuka tracker sendiri (`externalThumbUp` = undefined) | RUSAK |
| 13 | Ukuran penghapus | Dua tangan mengubah radius saat kepal (`hand-stroke-pipeline.ts:110`) | Ukuran tetap (`BIGPROMPT.md:148`; `PANDUAN-NUI.md:175`) | Preferensi Owner | Matikan `sizeFrom` default; biarkan sebagai opsi eksperimen | RUSAK (ringan) |
| 14 | Tombol arah di awal (mode kamera) | Tampil sebagai indikator (`GameplayControls.tsx:46-58`) | Tidak tampil di mode kamera (`PRD:177`) | RUSAK (ringan) | Sembunyikan saat `mode === "camera"` | RUSAK |
| 15 | Placement "Taruh" tanpa tangan | Hanya klik (`PlacementControls.tsx:15-23`) | Jalur kamera untuk interaksi inti (`DECISIONS.md:874-876`) | HILANG | DwellButton atau cubit tahan | HILANG |
| 16 | "Masukkan ke dunia" dan "Gambar ulang" (EnterWorldPopup) | Hanya klik (`EnterWorldPopup.tsx:29-36`) | Jalur kamera | HILANG | DwellButton | HILANG |
| 17 | "Gambar lagi" di header gameplay | Hanya klik (`StageHeader.tsx:50-52`) | NUI untuk Gambar lagi (`BIGPROMPT.md:178`) | HILANG | DwellButton | HILANG |
| 18 | Pilih nomor absen | Tidak ada jalur tangan (`StudentRulerSelector.tsx`) | Momo mengajak pilih; ring setelah konfirmasi (`BIGPROMPT.md:127-130`) | HILANG | Dwell atau seret tangan pada angka | HILANG |
| 19 | Label dev di UI siswa | "NUI NOT VERIFIED", "(uji coba)" (`useHandControl.ts:44`; `GameStage.tsx:198`) | Status uji tidak boleh jadi copy siswa (prinsip label jujur, DECISIONS:84) | RUSAK (copy) | Hapus dari mode integrated; log ke konsol dev | RUSAK |
| 20 | Dokumentasi arbiter | "NOT wired" (`arbiter.ts:7`; `INPUT_ARCHITECTURE.md:23`) | Dokumen sesuai kode | RUSAK (dokumen) | Perbarui dua teks | RUSAK |
| 21 | Mock masuk data kelas | Ya (§8.4) | Prediksi asli dan mock dibedakan dalam data (`DECISIONS.md:894-901`); tidak boleh tampil sebagai model asli (`BIGPROMPT.md:213`) | RUSAK (integritas) | Tambah `provenance` ke `CreateSubmissionRequest`; kirim `candidates` hanya bila `provenance.mode === "partner"`; atau tolak submit mock | RUSAK |
| 22 | Token sesi ke partner | Token sesi dikirim (§8.5) | Token tidak pernah diset ke env (`partner-http-provider.ts:44-47`) | RISIKO keamanan | Jangan teruskan `tokenProvider` ke `createPredictionProvider`. Partner hanya menerima header non-rahasia | RISIKO |
| 23 | Model URL | Env hanya dipakai wave (§1.1) | Konfigurasi konsisten | RUSAK (ringan) | Teruskan `env.mediapipeModelUrl` ke DrawingSurface, GameplayHandDriver, dan `configureThumbTracker` | RUSAK |
| 24 | Default mode | `env.ts`/.env.example = mock; Dockerfile = partner | Satu default | RUSAK (ringan) | Samakan. Usul: Dockerfile default mock, atau tegaskan partner pada build produksi | RUSAK |
| 25 | `GET /api/v1/model-info` | Klien ada, server tidak | PROPOSED (`API_INVENTORY.md:33`) | RUSAK (kode mati) | Hapus `getModelInfo` (`classroom-client.ts:123-125`) | RUSAK |
| 26 | Keyboard di awal | Tidak ada (copy kamera) | Tidak tampil dari awal (`BIGPROMPT.md:106`; `PRD:172-178`) | SESUAI | — | SESUAI |

---

## 11. Rekomendasi perbaikan (prioritas)

Angka timing di bawah adalah nilai konstanta sekarang dan usulan. Belum diukur: A5 tidak menjalankan browser. Ukuran yang diusulkan: DevTools Performance (long task, frame time), dan `inference ms` per frame dari `mediapipe-input.ts:204`.

1. **Hapus jalur mock dari data kelas** (butir 21). `FE/src/api/submission-adapter.ts:51-81`, `FE/src/api/submission-client.ts:13-27`. Tambah `provenance` dan tolak submit bila mode mock. Sebelum: tanpa penanda. Sesudah: penanda wajib.
2. **Hentikan kebocoran token** (butir 22). `FE/src/app/SketchbookApp.tsx:44-46`, `FE/src/app/hooks/useLevelSession.ts:100`. Hapus `tokenProvider` dari jalur predict.
3. **Hapus Level 4** (butir 11). `FE/src/domain/levels.ts:151-155` dan `:185`. Verifikasi daftar tampil tiga bab (`LevelEntryScreen.tsx:25`).
4. **Ganti jalur jempol dan kartu tutorial** (butir 2–6). `FE/src/components/onboarding/TutorialBrochure.tsx`: ganti PinchRing (`:636-646`) ke ThumbConfirm 1000 ms (kartu 1–2) dan 2000 ms (kartu 3). Tambah reading window 10 s sebelum ring (`:555`, `:639`). Kartu 1: seret tangan, tanpa auto-walk (`:131-149`, `:567-570`). Kartu 3: `ready` butuh draw, erase, undo, redo (`:555`), dan sambungkan pipeline gesture ke kanvas (`:276`). Sebelum: 1200/1000/2000 ms pinch, auto-walk 1,4 s. Sesudah: thumb 1000/2000 ms, gerak 1:1, reading ≥10 s.
5. **Jalur tangan untuk tombol inti** (butir 15–18). `PlacementControls.tsx:15-23`, `EnterWorldPopup.tsx:29-36`, `StageHeader.tsx:50-52`, `StudentRulerSelector.tsx`. Pakai DwellButton 1200 ms (default) atau ThumbConfirm 2000 ms. Ukuran sebelum: nol jalur tangan. Sesudah: setiap tombol punya DwellButton.
6. **Terima pakai jempol 2 detik** (butir 2). `FE/src/components/prediction/Top3Panel.tsx:59-76`. Sebelum: dwell 1200 ms. Sesudah: ThumbConfirm 2000 ms (PRD `:67`).
7. **Putuskan redo** (butir 8). Owner memilih telapak terbuka atau terbelah. Setelah itu ubah `classifyHandPose` (`hand-gesture.ts:224-230`) dan `drawingCommandFor` (`:265`). Sebelum: split-palm dengan celah ≥1,8×. Sesudah: pose sesuai keputusan, dan uji dengan tangan siswa (BELUM TERBUKTI).
8. **Rotasi lima jari** (butir 9). Tambah state di placement; ring 2 detik sebelum rotasi. Tidak ada angka saat ini.
9. **Wave pada kamera redup** (§3). `FE/src/camera/wave-tracker.ts:23, 44`. Sebelum: 8 sampel dalam 1300 ms. Usulan: 6 sampel dalam 2000 ms. Ukur di kamera redup sebelum mengubah.
10. **Hapus `CameraIntro.tsx`** (§2 celah 1) dan hapus `getModelInfo` (butir 25).
11. **Model URL konsisten** (butir 23). Teruskan `env.mediapipeModelUrl` ke tiga pembaca lain dan `configureThumbTracker`.
12. **Smoothing** (§5). Ukur beta 0,007 vs 5,0 (tinta) dan 0,015 (placement) pada perangkat. Usulan: placement memakai raw cursor untuk seret, dengan One Euro terpisah.
13. **Dokumen usang** (butir 20). Perbarui `arbiter.ts:7` dan `FE/docs/execution/INPUT_ARCHITECTURE.md:23`.
14. **Hapus label dev dari UI siswa** (butir 19). `useHandControl.ts:44, 62`, `GameStage.tsx:198`. Sebelum: "NUI NOT VERIFIED (uji coba)". Sesudah: status ramah siswa atau kosong.
15. **Sembunyikan tombol arah di mode kamera** (butir 14). `GameplayControls.tsx:46-58`.
16. **Konsistensi default mode** (butir 24). Samakan `env.ts:38-40`, `.env.example:9`, dan `Dockerfile:11`.

---

## 12. Batas bukti

- Semua temuan statis: kode dibaca, grep, `ls -l`, `sha256sum`, dan `git grep` pada HEAD `1b880fa`. Tidak ada kamera, browser, build, atau run.
- Dua landmarker bersamaan dan transisi pointer↔tangan: dinyatakan dari desain kode, belum diukur (BELUM TERBUKTI).
- Fps dan jumlah sampel wave: perhitungan dari konstanta, bukan pengukuran.
- Versi model `.task` tidak tercatat dan tidak bisa dibuktikan dari file (hanya ukuran dan hash).
- Endpoint prediksi partner: hanya mock dan kontrak DRAFT. Belum diuji terhadap endpoint nyata.
- Keputusan R12 (redo) dan R1 (judul lambaian): menunggu Owner. Tidak diputuskan di laporan ini.
- Audit mengikuti brief: repo referensi, bukan `/home/user/hitl-momo`.
