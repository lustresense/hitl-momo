# Audit kesiapan monorepo untuk `main`

Tanggal: 2026-11-09. Cabang yang diaudit: `claude-monorepo`. Pembanding: `main` (`ed5ea60`), `can` (`d4bbaec`).

## Putusan

**Layak dijadikan `main`, dengan syarat.** Syaratnya: isi `main` lama tetap ada (cabang cadangan dan riwayat), tidak ada force push, dan daftar yang belum terbukti di bawah ditulis terbuka di README.

Alasan layak:

- Alur kelas jalan dari ujung ke ujung dengan model asli, lewat Caddy asli: link kelas, join, prediksi, submit, database, dashboard guru. E2E 17/17.
- Retry aman. Respons pertama sengaja dijatuhkan setelah server menyimpan, retry dijawab `duplicate`, database tetap satu baris.
- Kontrak sama di dua sisi lewat fixture bersama.
- Tidak ada file sumber yang hilang: 1982 baris di `SOURCE_MAP.csv`, satu baris per file. Bobot model tidak berubah.
- Gameplay Can tidak diubah. Perubahan di game hanya di jalur kirim data dan wiring kelas.
- `main` lama hanya berisi dokumen proposal dan lisensi. Tidak ada kode yang tertimpa.

Alasan bersyarat (belum terbukti, bukan kegagalan):

- Build image Docker belum pernah jalan. Daemon Docker tidak ada di mesin audit.
- Outcome gameplay dari browser belum diuji. Endpoint dan client lulus test, kolom `outcome` di database masih `NULL` pada E2E.
- Kamera fisik dan MediaPipe belum diuji.
- Perubahan kontrak belum disetujui formal oleh Can dan Dias.

## Temuan audit dan tindak lanjut

Audit memakai tiga cara: pemeriksaan repo (git), tinjauan kode oleh reviewer terpisah, dan menjalankan ulang semua bukti dari nol.

| # | Temuan | Berat | Status |
|---|---|---|---|
| 1 | 253 file Can di `contexts/can/.ops/results/` dan `tools/scratch/` diabaikan diam-diam oleh `contexts/can/.gitignore`, jadi tidak masuk commit | Tinggi (kehilangan data) | Diperbaiki: `git add -f`. Catatan di README troubleshooting |
| 2 | 26 file kehilangan bit eksekusi saat disalin | Sedang | Diperbaiki |
| 3 | Game tidak punya `.dockerignore`, konteks build membawa `node_modules` dan rekaman | Sedang | Diperbaiki |
| 4 | Job outbox yang tertinggal di `sending` (tab ditutup) tidak pernah dikirim ulang | Tinggi | Diperbaiki: `resume()`, ada test |
| 5 | Job yang kena 401 (sesi habis) mati permanen walau siswa bergabung lagi | Tinggi | Diperbaiki: `requeueUnauthorized()`, ada test |
| 6 | Outcome yang menunggu submission terblokir memutar loop 20 kali dan membaca penyimpanan 41 kali | Sedang | Diperbaiki, test: paling banyak 3 pembacaan |
| 7 | Setelah reload tanpa `?kelas=`, konteks kelas hilang dan keputusan berhenti terkirim tanpa pesan | Tinggi | Diperbaiki: token kelas ikut tersimpan di sesi siswa |
| 8 | Snapshot dengan kurang dari 3 kandidat membuat adapter melempar error ke gameplay | Sedang | Diperbaiki, kegagalan kirim tidak sampai ke gameplay |
| 9 | Tabel `student_sessions` tidak pernah dibersihkan | Rendah | Diperbaiki: dibersihkan saat join |
| 10 | `/predict` tanpa auth dan tanpa batas ukuran | Sedang | Sebagian: batas 20.000 titik dan 1 MB di Caddy. Auth belum |
| 11 | Laporan lama menyebut "byte-preserved" padahal 672 file CRLF diubah ke LF | Rendah | Dikoreksi di `UNRESOLVED.md` B12 |

## Bukti run ulang

Semua dijalankan ulang setelah perbaikan, bukan memakai log lama.

| Pemeriksaan | Hasil |
|---|---|
| Typecheck game dan dashboard | PASS |
| `vitest run` game | 104 file, 681 test PASS |
| `pytest tests/integration` | 14/14 PASS |
| `verify_backend.py` (bobot model asli) | 20/20 PASS |
| E2E classroom lewat Caddy 2.10.2 asli | 17/17 PASS |
| Build game (mode partner dan mock), build dashboard | PASS |
| `caddy validate` untuk `deploy/Caddyfile` | PASS |

## Cara `main` diperbarui

1. Cabang cadangan `backup/main-ed5ea60` dibuat dari `main` lama dan didorong dulu.
2. `claude-monorepo` digabung ke `main` dengan `--allow-unrelated-histories`. Riwayat `main` lama tetap ada.
3. `LICENSE.md` dan `Proposal/` dari `main` lama dipertahankan. `README.md` lama diarsipkan di `docs/history/main/README.pre-monorepo.md`, README baru menggantikannya.
4. Push biasa, tanpa force.

## Yang tetap terbuka

Lengkap di [`UNRESOLVED.md`](UNRESOLVED.md). Yang paling penting: build Docker, persetujuan kontrak Can dan Dias, keputusan pemilik soal logika game ke backend, ukuran repo 1,2 GB, dan dokumen infra di `contexts/can/docs/`.
