# AGY — R22 NUI Lab, eksekusi 3 hari (versi final setelah audit Claude)

**Status:** belum dikirim. Dikirim hanya oleh Owner. Prompt ini **menggantikan prioritas** di `R22_AGY_EXECUTION_PROMPT.md` v2. Dokumen v2 (`R22_RISET_DAN_RENCANA_LENGKAP.md`, `R22_ACCEPTANCE_MATRIX.md`, `R22_AUDIT_GOOGLE_AI_DAN_KEPUTUSAN_TEKNIS.md`) tetap jadi latar belakang dan aturan kejujuran, tapi kalau bertentangan dengan prompt ini, ikuti prompt ini.

Baca dulu `R22_AUDIT_CLAUDE.md` dan jalankan `python3 analyze_nui_bench.py nui-lab-benchmark-S-07ba0cde.json`. Angka di bawah berasal dari sana.

## Aturan kerja
- Base: **`main@e3e74bf` (0.29.0-alpha)**, bukan `68a7d9a`. Worktree/branch terisolasi `r22-nui-lab`. Jangan push ke `main`, jangan deploy, jangan sentuh gameplay siswa/production tanpa izin Owner terpisah.
- Scope hanya `frontend/implementation/src/components/nui-lab/**` dan test NUI Lab. Kalau perlu menyentuh file lain, berhenti dan laporkan.
- Jangan klaim "akurasi", "100%", "0 false press", "anti-blur", "MediaPipe fine-tuned". Tanpa ground truth, tulis metrik proxy dan `NOT_TESTED`.

## Bukti yang menentukan prioritas (dari benchmark Owner, jangan diabaikan)
1. Miss di jendela aktif 6–20%, kedip ≤3 frame cuma ~1%; miss mentah 20–54% didominasi periode tanpa tangan. **Jangan bangun detector tambahan.**
2. Sesi bukan low-light (luma 0,44–0,48). Low-light belum pernah diukur fisik.
3. `setOptions({numHands})` dipanggil berulang oleh owner guard; di tasks-vision 0.10.14 itu memanggil `setGraph` → tracking reset.
4. Kamera 15 FPS, inferensi 22–30 Hz → frame duplikat diinferensi.
5. Canvas T004: 208 frame pinch ditolak re-arm; 29/54 PINCH_ON tanpa stroke; 3/5 stroke putus karena miss 62–220 ms; 205 frame `POINT_READY` mematikan tinta di Canvas.

## Hari 1 — Fondasi runtime + UI
1. **Zero `setOptions`.** Hapus toggle `numHands` dari `bench/worker-owner-guard.ts` / `r20-hand.worker.ts`. Ukur dua varian pada mesin yang sama, masing-masing ±2 menit tangan bergerak + 1 tangan kedua masuk sesekali: (a) `numHands` tetap 1, (b) tetap 2. Laporkan `mpMs` p50/p95, kedip ≤3 frame, dan apakah tangan kedua terdeteksi. Pilih default dari data; ownership tetap di main-thread (jump/size/ambiguity, fail-closed).
2. **Frame pacing.** Akar duplikat sudah ketemu: `runFrame` di `NuiLabPage.tsx:896–906` sudah punya guard frame baru (`totalVideoFrames`/`currentTime`), tapi callback hasil worker di `NuiLabPage.tsx:822–825` langsung memanggil `submitFrame()` lagi **tanpa guard itu**, sehingga frame kamera yang sama diinferensi ulang. Hapus pump tanpa guard itu atau lewatkan lewat guard yang sama; idealnya submit hanya dari `requestVideoFrameCallback`. Rekam `captureFps` (frame kamera unik) terpisah dari `processedHz` dan `uiFps`. Semua ambang FSM/gate jadi milidetik (mis. "4 frame stabil" → ±250 ms) supaya tidak bergantung FPS.
3. **A4 trigger.** Naikkan syarat aktif A4 ke cahaya benar-benar gelap (kandidat `meanLuma < 0.30`, konstanta dapat diubah). Rekam per frame: `lumaP95`, persentase piksel ≥250 di bbox tangan (bukti glare), dan pass aktif. Jangan klaim A4 lebih baik sebelum ada sesi low-light fisik.
4. **UI `/nui-lab`:** dua tombol besar Coba Gestur / Coba Canvas. Desktop: kamera kiri sticky selalu terlihat, panel kanan scroll independen. Hapus dari UI Owner: selector engine C4/C7, cahaya, detektor, skenario, label GT. Satu label status: `NUI R22 · CPU · Otomatis`. Konfigurasi asli tetap tercatat di manifest export. Overlay landmark/pose/aksi pakai frame ID; kalau umur frame > 150 ms tampilkan "data lama".
5. **Recorder:** consent sekali, auto-record per route, trial ditutup otomatis saat pindah route/`pagehide`/hidden > N detik (tandai `endReason`), sehingga periode tanpa tangan saat user pergi tidak tercampur. Export satu JSON. Tambahkan field: `captureFrameId`, `numHandsActive`, `setOptionsCalls` (harus 0), gap reason, `lumaP95`, `nearWhiteHandPct`.

## Hari 2 — Canvas dan gestur
6. **Route Canvas tidak menjalankan classifier/gate pistol sama sekali.** Tidak ada `POINT_READY`/`POINT_PRESS` yang boleh menutup stroke di Canvas. Pistol hanya untuk route Gesture.
7. **Satu penilai pinch** dengan hysteresis (pakai satu sumber, hapus ketidaksepakatan `classifyHandPose` vs `r19Step.pinchActive` vs `HandStrokePipeline`). **Satu `ActionIntentResolver`** jadi satu-satunya penulis `StrokeStore` per frame; `ink.feed()` tidak boleh mengubah store bila resolver menolak.
8. **Grace tracking-loss — JANGAN bikin baru, sudah ada tapi dibypass.** `src/input/hand-stroke-pipeline.ts` sudah punya `LOSS_GRACE_MS = 150` (`:32`), `lost()` yang menahan stroke selama grace (`:291–304`), dan resume yang memutus garis kalau posisi melompat (`:334–341`). Tapi `lab-analyzer.ts` memanggil `ink.reset()` langsung saat satu frame `NO_HAND` (`:568–576` via `releaseAllInternal`, dan `:711–716`), sehingga stroke ditutup dan `armed.draw` di-reset sebelum grace sempat bekerja. Perbaikan: saat tangan hilang, panggil jalur `lost()` milik pipeline (mis. `ink.feed(undefined, now)`), bukan `reset()`; reset penuh + re-arm hanya setelah grace lewat atau saat tangan yang kembali bukan tangan yang sama (posisi/ukuran). Ukur apakah 150 ms cukup untuk kamera 15 FPS (1 frame = ±67 ms); kandidat 200–250 ms. Ambang lain di pipeline masih berbasis frame (`VOTE_WINDOW = 5`, `DRAW_START_FRAMES = 2`, `DRAW_RELEASE_FRAMES = 3`) dan ikut terdistorsi frame duplikat.
9. **Gestur Canvas:** pinch = gambar; telapak 5 jari = hapus; kepal = netral/arming; kepal stabil → 1 jari stabil = Undo satu kali; kepal stabil → 2 jari stabil = Redo satu kali; edge-triggered, cooldown, harus kepal lagi untuk aksi berikutnya; tangan hilang di tengah transisi = batal. Hapus swipe dari flow utama.
9b. **Jangan longgarkan ambang pinch.** Owner sudah minta pinch harus benar-benar rapat supaya tidak tercoret sebelum jari menempel. Perbaikan nomor 7–8 hanya mengubah cara menangani tangan hilang dan penilai ganda, bukan ambang kontak. Lock: saat tidak ada tangan, tangan baru yang stabil langsung jadi pemilik (tanpa tombol relock); tangan kedua tidak boleh merebut pemilik yang masih terlihat.
10. **Regression fixture** dari T004: replay rangkaian frame stroke 9/10/11 (miss 1–5 frame lalu pinch lanjut) → stroke tidak boleh berakhir; PINCH_ON pada tangan yang sama setelah kedip tidak boleh ditolak re-arm; frame `POINT_READY` di Canvas tidak boleh menutup stroke. Plus test: tangan kedua tidak mengambil alih, near-pinch tidak memulai stroke, kepal sendiri tidak memicu aksi, satu Undo/Redo per arming.

## Hari 3 — Uji dan serah
11. Owner merekam (tanpa label): 3 menit Canvas cahaya normal, 3 menit Canvas kamar gelap + layar terang, 2 menit Gesture. Jalankan `analyze_nui_bench.py` versi sebelum vs sesudah.
12. Target proxy (bukan akurasi): `setOptionsCalls = 0`; `processedHz ≤ captureFps`; stroke putus akibat miss ≤ 250 ms = 0; frame pinch ditolak re-arm setelah kedip = 0; frame pistol di Canvas = 0; PINCH_ON → stroke naik jelas dari 19/54; 0 stuck key, 0 ghost stroke di replay; UI 60 FPS tanpa LongTasks.
13. Laporan: SHA, file berubah, hasil test aktual, perbandingan before/after dari script, screenshot UI, keterbatasan, dan `NOT_TESTED` di yang belum diuji.

## Di luar jalur kritis (jangan memblokir Hari 1–3)
- **Retrain classifier dari data R17–R20:** boleh paralel di branch terpisah hanya kalau GPU nganggur; ikuti aturan lisensi/split dokumen v2; dipakai hanya kalau menang di held-out. Kalau tidak sempat, R22 pakai C4 dan manifest bilang begitu.
- Ditunda: custom ObjectDetector/YOLO/ONNX, ROI crop/mask, temporal TCN/C8/C9, fine-tune MediaPipe, OpenCV.

## Catatan untuk Owner (bukan untuk AGY)
Jangan suruh AGY membaca `contexts/can/research/.context-notforagent/`. `AGENTS.md` di folder itu melarang agent lain membacanya, dan semua yang relevan dari arsip sudah dirangkum di `R22_AUDIT_CLAUDE.md` §1b.

Deploy ke dev tetap tertahan oleh 14 test lama yang juga gagal di R19. Kalau mau R22 bisa lu coba di `dev.momominum.tech` hari ke-3, lu harus kasih Ujang **pengecualian eksplisit khusus dev** (gate tetap dicatat FAIL, rollback siap, production tidak disentuh). Tanpa itu, R22 cuma bisa dicoba lokal.
