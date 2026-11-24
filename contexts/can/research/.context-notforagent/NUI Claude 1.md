# NUI Claude 1 — catatan konteks teknis terkurasi

- Sumber: ekspor Owner `Claude_NUI-Lab_20261124-2000.md`, percakapan 19–24 November 2026.
- Tanggal kurasi: 24 November 2026.
- Status: ARSIP / REFERENSI HISTORIS, bukan mandat implementasi, bukan DECISIONS.md.
- Ini ringkasan terkurasi, bukan salinan verbatim. Ekspor mentah, gambar embedded, URL percakapan privat, identitas, rincian akses server dan kelas tidak dipublikasikan.
- Catatan tambahan atas permintaan Owner. Tidak menggantikan NUI_LAB_HISTORY.toon atau retrieval/MAP.md; belum diindeks oleh generator arsip.
- Untuk ChatGPT Web atas izin Owner. Agent terminal tidak membuka folder ini. Ikuti AGENTS.md di folder ini.

## 1. R20 ke R22 (19–20 Nov)
Masalah utama terukur di benchmark S-07ba0cde dan T004: 208 frame pinch ditahan re-arm, 31 frame ditolak gate R19 (205 frame terkait POINT_READY), 3 dari 5 stroke terputus setelah loss singkat 62–220 ms. Claude mengaudit jalur worker, setOptions dinamis, frame scheduler, ink reset dan grace period. Angka inferensi duplikat sekitar 40% adalah estimasi dari cadence, bukan hitung per-frame; luma sensor 0,47 bukan bukti ruangan terang.
Owner tetap meminta R22 full scope, termasuk training lintas R17–R20, eksperimen temporal dan detector, UI sederhana, rekam otomatis, tanpa label manual saat tes bebas. R22 memisahkan pistol dari canvas, memperbaiki re-arm/loss dan fixed numHands serta RVFC. Retrain pistol R22 kalah dari C4 pada locked test (0,9414 vs 0,9873 macro-F1); jangan mengklaim model baru dipromosikan. QA Rev 1 ditolak auditor karena rujukan test/bukti fiktif dan cold transfer hanya landing. Rev 2 menurut Claude: 248/248 test NUI, gameplay 39/48 PASS 9 FAIL sama baseline; full-journey gzip 10,61 MiB, bukan 0,53 MB; fixed-2 sekitar 70 ms p50 vs fixed-1 32,9 ms di CPU server. Physical webcam tidak otomatis lulus. Data bxr7 kecil memperlihatkan RAW 60%, A4v2 40%, R22 35,6%; jangan klaim semua preprocessing lebih baik.
 
## 2. R22B dan MoNUI-7 / R23
R22B: gate fist-vs-pinch, hysteresis, preset pinch, recovery overlay yang tidak langsung blank saat worker stall, guided capture dan telemetry v2.1. R22 dan R22B dipublikasikan sebagai patch candidates di research-can; branch kode remote lama dihapus. research-can orphan adalah lab, bukan product branch; tidak di-merge ke main.
R23 MoNUI-7: MediaPipe HandLandmarker tetap ekstraktor 21 landmark; YOLO26n hand detector sebagai rescue saat tangan hilang, bukan pengganti MediaPipe; classifier HandState dan FSM terpisah. Training di 2 RTX A5000, inference user CPU browser. Dataset, lisensi, split dan promosi model wajib terdokumentasi. Mandat R23 v1.1.0 mengganti v1.0.0; worker data dan training terpisah. Model rescue fx_v0a dipakai pada HF3 menurut laporan; kandidat v2pre belum dipromosikan. Hasil simulasi tidak sama dengan validasi webcam siswa. 
HF3 membawa peningkatan kamera, rescue, telemetry dan capture. Menurut percakapan, HF3 telah dideploy DEV; kamera fisik dan integrasi seluruh gameplay tetap perlu bukti terpisah. HF4 v1 pernah dirancang untuk mode alat/ring, lalu Claude menyarankan revisi menjadi hybrid gaya Quest; jangan mengirim mandat lama tanpa keputusan.

## 3. Integrasi produk dan pemisahan lapisan (23–24 Nov)
Saran Claude: pisahkan mesin sensor (kamera, MediaPipe, rescue, worker, preprocessing) dari bahasa gestur. HF5-mesin adalah kandidat port mesin MoNUI-7 ke gameplay tanpa mengubah gestur; HF4-hybrid adalah kandidat uji UX di NUI Lab; HF6-aturan baru setelah pengujian. Penamaan/tahapan ini masih usulan, bukan bukti implementasi. Main bukan tempat eksperimen mentah.
Alur kerja yang dibahas: AGY -> research-can patch -> worktree integrasi Ujang -> DEV -> izin Owner + koordinasi Dias -> main. Patch berikut harus rebase pada main terkini agar tidak menimpa backend/model Dias. Jangan menafsirkan laporan agent sebagai izin push/deploy.
Integrasi Dias: backend FastAPI + TensorFlow MobileNetV2, 20 label, Caddy satu origin, Docker Compose, weights eksternal read-only, preprocessing QuickDraw perlu parity. Ujang dan Claude melaporkan sejumlah masalah join, tombol prediksi dan QA, lalu integrasi bergerak ke main. Status live harus diperiksa dari runtime, bukan arsip.

## 4. Masukan HCI dan kandidat interaksi Quest (24 Nov)
Owner melaporkan masukan dosen HCI bahwa gestur HF3 masih rumit; eksplorasi hand cursor gaya Quest agar lebih intuitif. Claude mengusulkan UI arahkan+cubit, anchor pangkal telunjuk untuk cursor UI, ujung telunjuk untuk pena canvas, tidak mengganti mode selama cubit, snapping hanya pada UI bukan canvas, ring konfirmasi 2 detik pada keputusan penting. Koreksi posisi klik memakai histori 200–300 ms, ukuran tombol 64/96 px dan spacing 24 px adalah kandidat berdasarkan analisis, bukan standar tervalidasi siswa. Laporan Claude menyebut jitter 43->20 px dan click offset 119->7–17 px pada data Owner; belum diuji independen di sini; sampel satu dewasa dan kondisi gelap terbatas.
Perlu putusan eksplisit untuk mengganti D-20261110-07 (tanpa kursor), aturan HF4, mapping gameplay, dan variasi mekanik per bab. Pada akhir ekspor Owner meminta alur per halaman yang intuitif; Claude masih menanyakan keputusan kontrol gameplay dan mekanik per bab. Jangan menyatakan HF4-hybrid sudah diimplementasikan atau disetujui dosen.

## 5. Snapshot repo yang diperiksa ChatGPT Web (24 Nov)
- main sebelum commit arsip: 81758b312d189904c7abf05c68108e154de8118b.
- research-can: 00539e14524a199a985bde4178f835a5c4de42ab.
- frontend/implementation/package.json: 0.29.3-alpha+r23b-monui7-hf3; Next static export, MediaPipe tasks-vision, onnxruntime-web 1.31.1; prebuild copy-ort-wasm.mjs menyiapkan public/ort/.
- MoNUI-7 source terdapat di src/components/nui-lab/bench/monui7-yolo.ts dan monui7-rescue.ts. Model URL /models/monui7-hand-yolo26n-320.onnx, bobot tidak ditemukan di tree main. Jangan menyimpulkan model aktif hanya karena source ada.
- Docker Compose existing: backend, admin, web; Caddy merutekan /api/*, /predict, /health ke backend; static frontend dan /admin terpisah. WEIGHTS_DIR wajib diisi.
- HF4 belum terlihat di versi main; status DEV terbaru tidak diuji dalam kurasi ini.
- Keputusan PA master dan status teknis harus dicek ulang. Ini bukan mandat AGY/Ujang.

## Rujukan repo
- https://github.com/lustresense/hitl-momo/tree/research-can
- https://github.com/lustresense/hitl-momo/tree/81758b312d189904c7abf05c68108e154de8118b
