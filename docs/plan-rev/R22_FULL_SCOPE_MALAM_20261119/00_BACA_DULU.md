# R22 NUI Lab | Paket eksekusi FULL SCOPE malam 19 November 2026

**Status:** dokumen pengarahan, bukan bukti implementasi. Dibuat dari audit Claude terbaru, paket riset GPT v2, source repository yang dibaca secara read-only, dua export JSON benchmark Owner, dan instruksi Owner paling baru.

## Keputusan Owner yang mengikat paket ini

- Target eksekusi **malam ini**, tanpa pembagian timeline tiga hari dan tanpa pengurangan scope sepihak.
- Pengguna non-engineer cukup membuka `/nui-lab`, memilih **Coba Gestur** atau **Coba Canvas**, memakai kamera, dan mendapatkan benchmark yang **direkam otomatis**. Tanpa memilih C4/C7, jenis detector, cahaya, skenario, maupun label ground truth.
- Runtime pengguna **CPU-only**, satu pilihan otomatis dengan MediaPipe Hand Landmarker tetap sebagai basis. Dalam pengalaman pengguna, MediaPipe, preprocessing, classifier dan FSM harus terasa sebagai satu sistem.
- Kamera tetap di kiri pada desktop; sisi kanan scroll independen. Overlay landmark, gestur, dan data sinkron per frame, bukan terpisah/tertinggal.
- Canvas: pinch rapat menggambar, telapak lima jari menghapus, kepal netral, kepal lalu satu jari untuk Undo, kepal lalu dua jari untuk Redo, tanpa swipe. Tangan lain tidak boleh mengambil alih; recovery otomatis tanpa tombol manual.
- Perbaiki **seluruh masalah** yang terbukti, termasuk re-arm, gate pistol Canvas, keutuhan stroke, frame pacing, owner guard, lowlight/glare/blur, validitas benchmark, serta QA regresi.
- **Retrain semua classifier yang relevan** melalui audit gabungan sumber R17–R20 yang eligible, termasuk eksperimen temporal dan robustness baru. Jangan mengabaikan training sebagai pekerjaan opsional.
- **Teliti dan prototipe kandidat detektor tambahan** bila perlu untuk kegagalan upstream, namun tidak boleh memaksakannya ke runtime utama tanpa evaluasi CPU/wire/ownership dan data bbox sah.
- Repo **read-only bagi penulis paket ini**. Saat Owner menyerahkan prompt ke AGY, implementasi dilakukan AGY di branch/worktree terisolasi; push ke `main`/deploy/production perlu otorisasi sesuai batas yang berlaku.

## Urutan pakai satu paket ini

1. **Kirim seluruh ZIP** ke AGY, terutama `01_MANDAT_AGY_EKSEKUSI_SEKARANG.md` dan `02_MASTER_SPEC_R22.md`. Kedua dokumen baru ini menjadi instruksi aktif dan **menggantikan pembagian tiga hari serta pemangkasan scope** di prompt Claude lama.
2. Berikan referensi `references/claude` dan `references/previous-research` sebagai **bukti atau opsi riset**, bukan instruksi yang mengalahkan mandat baru. AGY **tidak boleh** membuka folder GitHub `.context-notforagent` karena batas aksesnya; bukti yang relevan sudah dicantumkan di paket ini.
3. Minta AGY mengeksekusi workstream paralel tanpa file overlap, menghasilkan source + model + test + benchmark + UI + handoff; jangan hanya membalas rencana.
4. Gunakan `03_ACCEPTANCE_MATRIX.md` untuk memutuskan apakah semuanya benar-benar terselesaikan. Jika pengujian atau model belum terbukti, tandai `FAIL`/`NOT_TESTED`, jangan menyebutnya selesai.

## Tiga batas kebenaran penting

- **Autolabel** yang diminta = prediksi gestur, confidence, keputusan action, alasan reject, kondisi cahaya, kondisi tracking, label peristiwa dan estimasi kualitas **otomatis**. Ini tidak sama dengan *ground-truth* yang divalidasi independen. Jangan meminta Owner mengisi label manual, tapi jangan menghitung akurasi dari model yang melabel dirinya sendiri.
- Tidak ada algoritme yang dapat menjamin anti-lowlight, anti-motion-blur, anti-glare, dan anti-distraksi 100% pada kamera RGB murah. Semua metode mitigasi **wajib dicoba, diukur, dan dinilai**, tanpa membuat janji performa yang tidak dibuktikan.
- Meminta scope lengkap selesai malam ini adalah **target eksekusi**, bukan bukti lulus. Jangan mencoret fitur demi memenuhi tenggat; kerjakan dan laporkan setiap komponen secara transparan.

## File utama

- `01_MANDAT_AGY_EKSEKUSI_SEKARANG.md`: perintah siap tempel untuk AGY
- `02_MASTER_SPEC_R22.md`: spesifikasi teknis penuh, dataset, arsitektur, UI, recorder, safety, training, eksperimen
- `03_ACCEPTANCE_MATRIX.md`: kriteria dan bukti untuk semua komponen, termasuk kondisi buruk
- `04_AUDIT_BUKTI_DAN_KOREKSI.md`: data benchmark, temuan Claude, koreksi klaim Google AI/GPT
- `05_PENGIRIMAN_DAN_DEPLOYMENT.md`: perbatasan repo, permission, penggabungan, dev deployment
- `06_ADDENDUM_INTEGRASI_CLAUDE.md`: aturan kepemilikan file, satu sumber keputusan per jenis, urutan merge, model per worker (Argon/Neon/Hydrogen), peta dependensi wajib Argon termasuk training (A7), tabel ketertelusuran semua masalah Owner (A8), serta fallback model dan serah-terima bila pelaksana bukan AGY atau kena limit (A9); menambah aturan, tidak memangkas scope
- `references/claude/`: audit, prompt lama, script analisis, dan output yang diberikan Owner
- `references/previous-research/`: riset GPT/Google AI v2, arsip ide yang harus diaudit ulang
- `references/benchmarks/`: dua ekspor JSON benchmark Owner (mengandung telemetry penggunaan, simpan privat)

**Perhatian:** Paket mengandung data pengujian pengguna. Jangan unggah data ini ke repo publik atau pihak ketiga tanpa izin eksplisit. Semua evidence dan model yang hendak dipublikasikan wajib ditinjau lisensi dan privasinya.
