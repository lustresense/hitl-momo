# CHANGELOG — Sketchbook Universe Engineering

Satu-satunya changelog engineering yang aktif. Riwayat lama diarsipkan di `docs/history/`.

## [Unreleased]

### Can — Student Game: restorasi dan NUI (Owner 2026-11-10, big prompt + REVISI-NUI)
Draft keputusan: `contexts/can/docs/audit-2026-11-10/DECISIONS-DRAFT-2026-11-10.md`. Audit: `CAN-FRONTEND-AUDIT.md`, `NUI-AUDIT.md` di folder yang sama.
- Revert: Level 4 dihapus. Hanya tiga level; penutup setelah Bab 3.
- Restore: durasi kartu kembali ke `9f9d35d`; tutup kartu 1,0 s + jeda 1,1 s; `timeScale(6)` dan aturan `animation-duration:.01ms` dihapus. Reduced motion mengurangi amplitudo, tidak memotong durasi cerita.
- Momo: tidur bernapas, mengapung, miring; Zzz tiga huruf; bangun dengan dua kedipan; teks tebal; tidak ada skip efek ketik.
- Cover: cincin progres lambaian; kartu kamera mengecil ke PIP kiri bawah (juga tanpa kamera); Momo terbang ke tengah; cerita baru; jempol "Aku mengerti" membuka buku; warmup model tangan.
- Penggaris: mulai nomor 1; Momo fokus di tengah lalu ke kanan; pertanyaan hanya setelah digeser; pegangan 48×70; cubit untuk menggeser.
- Tutorial: brosur lebih besar; kartu 1 seret cubit ke bendera; cincin jempol terkunci dengan progres baca 10 s; kartu 3 semua alat dicoba dengan tangan, penghapus ukuran tetap.
- Pilih bab dengan 1/2/3 jari + cincin; intro level dengan latar gelap, Momo 290 px bergerak, naik awan 2,1 s; route kanvas `/canvas1..3`.
- Kanvas: fase fokus (sekali per level); hanya cubit menggores; telapak terbuka = maju; diam 10 s → Momo bertanya + indikator jempol menyala.
- Top-3 dan layar gagal: pilih dengan jari + cincin (tanpa kursor); jempol tidak memilih kandidat.
- Stiker di kanvas: "Lempar" (jempol) dan "Gambar lagi" (telapak); popup "Masukkan ke dunia" dihapus.
- Penempatan: Taruh (jempol), Geser (cubit), Putar 90° (telapak) dengan collider berputar. Kontrol Thinman dengan sudut telunjuk + speedometer.
- Penutup: portal, pesan Momo tentang AI, rekap netral, tempat kuis dengan flag (`contracts/QUIZ_TOGGLE_PROPOSAL.md`).
- Prediksi: pemetaan label model Dias ke tampilan Indonesia (`contracts/LABEL_MAP_PROPOSAL.md`); tebakan demo tidak dikirim ke data kelas; token siswa tidak dikirim ke endpoint prediksi.
- Input: `countExtendedFingers`, pose satu/tiga jari, router mode tunggal `src/input/gesture-mode.ts`, pembaca tangan bersama untuk tombol.

### Can — Student Game
- Staging: game dipindah ke `frontend/implementation/` (baseline `d4bbaec`). Governance Can di `contexts/can/` (byte-preserved).
- Fix: outbox tidak pernah mengirim setelah enqueue. Sekarang `enqueue*` memicu proses, dan retry dijadwalkan setelah backoff (`tests/api/outbox-delivery.test.ts`).
- Fix: `submission-adapter` mengirim `join_token`, `student_id`, dan `candidates`. Tidak mengirim saat di luar kelas.
- Fix: parameter link `?kelas=` diterima (link dari dashboard).
- Contract: `submission-client.ts` mengikuti skema backend. Respons `{id, status}`. Outcome `PATCH`.
- Fix: konteks kelas dibaca lewat ref (`SketchbookApp.tsx`), bukan closure usang.
- Test: `tests/api/contract-fixtures.test.ts` memakai fixture bersama dengan backend.
- Fix: outbox `resume()` mengirim ulang job yang tertinggal di `sending`. `requeueUnauthorized()` mengirim ulang job yang diblokir 401 setelah join ulang. Outcome yang menunggu submission tidak lagi memutar loop.
- Fix: token kelas disimpan bersama sesi siswa (`classContextFrom`), jadi reload tanpa `?kelas=` tetap mengirim. Kegagalan kirim tidak jadi unhandled rejection di gameplay.
- Change (Owner 2026-11-09): selesai gambar = tahan jempol 2 detik. Momo diam selama menggambar, tebakan dan Top-3 baru muncul setelah itu. Menggantikan R11 (auto-ask setelah tangan diam dan tebakan sementara). Tombol Tebak tetap ada untuk mouse.
- Fix: klasifikasi pose tangan. Cubit tidak lagi terbaca kepal. Histeresis dan voting 3 dari 5 frame. Coretan tidak putus oleh hilang tracking di bawah 150 ms. Undo dan redo dilonggarkan untuk tangan anak.
- Feature: penghapus sebagian (kepal), ukuran diatur tangan kedua (cubit), roda mouse, `[` dan `]`, tombol S/M/L.
- Feature: kartu tutorial memakai cincin cubit. Kontras cincin jempol dan cubit diperbaiki.
- Feature: `DwellButton` (pilih dengan melayang ±1,2 detik) dan `hand-cursor-store`: satu pembaca tangan memberi kursor ke semua tombol. Dipakai di Top-3, keputusan, layar gagal, tombol sudut, Tebak, misi.
- Feature: panduan kontrol Thinman (kiri, kanan, lompat). Kontrol tangan otomatis di mode kamera.
- Fix: collider Level 2. Tiga gedung menjadi blok padat sampai dasar halaman. Pijakan bawah diperpanjang ke dinding (gambar ikut berubah).
- Feature: gambar asli siswa tampil sebagai objek di dunia, dengan label, tanpa kotak pembungkus.
- Revert: Level 4 "Pembuktian" (ditambah 2026-11-09) dihapus atas instruksi Owner 2026-11-10. Produk hanya tiga level; penutup setelah Bab 3.
- Fix: cincin selesai-gambar tertutup kartu kamera di kiri bawah. Dipindah ke kanan bawah.
- Change: UX chat Momo. Efek ketik bisa dilewati, `prefers-reduced-motion` dihormati, baris panjang dipecah.
- Staging: `frontend/implementation/Dockerfile` ditambahkan dari donor Dias (service `web` membutuhkannya).
- Staging: `frontend/implementation/.dockerignore` ditambahkan.
- Staging: path aset di `icon-gestures.test.tsx` dipindah ke `contexts/can/design/`.

### Dias — Backend, Model, Admin
- Feature: join kelas mengembalikan `student_session_token` (SHA-256 disimpan di `student_sessions`).
- Feature: `POST /api/submissions` wajib Bearer token. Idempoten lewat `submission_key` (unique `(student_id, submission_key)`). Respons 201 `created` atau 200 `duplicate`.
- Feature: `PATCH /api/submissions/{id}/outcome` (sebelumnya tidak ada).
- Security: CORS dari env `CORS_ORIGINS`, `allow_credentials=False`. Sebelumnya `*` dengan credentials.
- Migrasi: kolom submission ditambahkan otomatis (`_migrate` di `db.py`).
- Compose: `CORS_ORIGINS` untuk backend.
- Security: sesi siswa kedaluwarsa dihapus saat join. `/predict` menolak gambar di atas 20.000 titik (422).
- Deploy: Caddy membatasi badan permintaan ke backend 1 MB.

### Shared Integration
- Test: `tests/integration/test_classroom_contract.py` (11), `tests/integration/verify_backend.py` (20 probe runtime dengan bobot asli).
- Test: `frontend/implementation/e2e/classroom-e2e.mjs` (17 cek, langsung dan via Caddy).
- Kontrak: `contracts/fixtures/` dipakai dua sisi. `contracts/openapi.json` diekspor ulang (18 path). `API_INVENTORY.md` diperbarui.
- Audit: `docs/migration/PORT_AUDIT.md`. 50 file donor `PORT_NEEDED` dicek satu per satu.
- Bukti: `docs/migration/evidence/`.
- Known: `prediction_id` belum dihasilkan backend. Build image Docker belum dibuktikan (daemon tidak ada).

## Pre-monorepo history
- Can: `docs/history/can/`
- Dias: `docs/history/dias/`
