# CHANGELOG — Sketchbook Universe Engineering

Satu-satunya changelog engineering yang aktif. Riwayat lama diarsipkan di `docs/history/`.

## [Unreleased]

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
- Feature (usulan): Level 4 "Pembuktian" dan layar tamat setelahnya.
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
