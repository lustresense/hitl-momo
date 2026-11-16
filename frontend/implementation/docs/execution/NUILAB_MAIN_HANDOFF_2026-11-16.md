# Handoff NUI Lab dalam monorepo `main`

**Tanggal:** 16 November 2026. **Versi integrasi:** `0.21.0-alpha`. **Bukti:** `STATIC_ONLY / NOT_TESTED`.

## Mandat Owner

Owner menghendaki agar NUI Lab menjadi bagian frontend monorepo pada `main` supaya tunnel dev Ujang tidak perlu mengganti branch. Lab tidak melewati gameplay ataupun onboarding. Mapping wajib: **pinch Coret, telapak dengan lima jari Hapus, satu jari Undo, dua jari Redo; kepalan tidak pernah menghapus**. UI canvas memiliki cursor dan smoothing seperti drawing game. Tracking lab tidak menggunakan batas ROI berbasis wajah dan menjaga satu tangan yang telah di-lock, di area mana pun dalam frame.

## URL Next.js static export

- `/nui-lab`: landing eksperimen.
- `/nui-lab/gesture`: katalog pose action drawing (jempol, pinch, 1/2/3 jari, split-palm, open-palm) tanpa kepalan sebagai tool. Classifier internal masih dapat menamai fist, tetapi tidak dipakai sebagai Hapus; overlay, hand lock, frame/luma/latency.
- `/nui-lab/canvas`: canvas 1280x720 internal, kamera kecil di kiri bawah desktop, toolbar kanan, Momo, cursor live, pinch/erase/undo/redo, fallback pointer.
- `/nui-lab/diagnostics`: panel diagnostik lama.

Semua halaman di `frontend/implementation/app/nui-lab`; share `NuiLabPage`, `LabAnalyzer`, `HandStrokePipeline`, `StrokeStore`, `gesture-mode` dan `gesture-commands`. Di halaman utama hanya ada pilihan route tanpa prompt webcam. Kamera hanya diminta setelah klik ON.

## Arsitektur lock

`lab-hand-lock.ts` menggunakan wrist location + ukuran tangan antar-frame; perlu 2 frame konsisten untuk lock awal. Tidak membatasi tangan dekat wajah/ROI ataupun quadran tengah. Jika dua kandidat ambigu atau tangan terkunci tidak muncul, input ditolak; relock manual diminta. Jangan menyebutnya identifikasi orang secara biometrik dan jangan menjamin kemampuan mendeteksi saat sebagian besar tangan di luar frame. Ukuran kecil dan model MediaPipe tetap membatasi respons di tepi, terutama blur/gelap.

**Produk game:** `primary-hand.ts` global tetap memiliki filter berbasis wajah. Mode full-frame ini baru untuk NUI Lab eksperimental, bukan perubahan policy siswa yang telah teruji.

## Urutan Ujang

1. Periksa working tree VM dan snapshot backup sebelum pull. `git fetch origin main`; jika working tree bersih, `git switch main`, `git pull --ff-only origin main`. Jangan reset/force merge. Pastikan SHA yang di-checkout sama dengan SHA main terkini.
2. Baca `AGENTS.md`, `contexts/can/AGENTS.md`, handoff ini dan `frontend/implementation/docs/execution/RUN_GUIDE.md`.
3. Dari root `python3 scripts/bump_version.py --check`.
4. Dari `frontend/implementation`: `npm ci && npm run typecheck && npm run lint && npm test && NEXT_PUBLIC_TEST_HOOKS=0 npm run build`.
5. Deploy `out/` dari `main` ke tunnel dev yang biasa. Pastikan direct reload semua route (termasuk nested), HTTPS webcam permissions dan assets MediaPipe WASM/model berjalan.
6. Rekam uji webcam fisik untuk edge kiri/kanan/atas/bawah, pergantian pose, mulusnya pinch drawing, lima jari erase, satu/dua jari undo/redo, dua tangan saling silang, tangan di depan muka, kamera lowlight/backlight, lost/relock, ON/OFF 10x dan refresh navigasi.
7. Laporkan versi, SHA, URL, output gates, trace FPS/inference rate/jitter, screenshot/rekaman dan kegagalan yang masih tersisa.

## Batas bukti saat commit sumber

Belum ada tes browser webcam, Ujang deploy, CI, atau npm install/build dijalankan di sesi GitHub connector. Test file yang ada hanya memuat skenario sintetis sampai dijalankan oleh Ujang. Jangan menyamakan `STATIC_ONLY` dengan PASS. Jangan mengedit backend partner atau mengubah game state machine tanpa mandat baru.
