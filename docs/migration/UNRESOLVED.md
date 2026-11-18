# UNRESOLVED — konflik, keputusan, dan risiko yang belum selesai (iterasi 2)

Daftar ini tidak diselesaikan oleh integrator sendiri. Setiap item butuh keputusan pemilik, Can, atau Dias.

## A. Perubahan kontrak yang sudah dikerjakan, menunggu persetujuan

| # | Perubahan | Owner | Yang perlu |
|---|---|---|---|
| A1 | Join mengembalikan `student_session_token`; submission dan outcome wajib Bearer | Can + Dias | Persetujuan formal. Client sudah menyesuaikan. |
| A2 | `POST /api/submissions` wajib `submission_key`, `join_token`, `student_id`, `candidates` | Can + Dias | Sama dengan A1 |
| A3 | `PATCH .../outcome` diimplementasikan (sebelumnya 404) | Dias | Konfirmasi bentuk body (`behavior` tiga nilai) |
| A4 | Respons submission: `{id, status}` dengan `created` atau `duplicate` | Can + Dias | Konfirmasi |
| A5 | CORS dibatasi lewat `CORS_ORIGINS`, tanpa credentials | Dias | Konfirmasi daftar origin production |

## B. Masih terbuka dari iterasi pertama

| # | Topik | Owner | Dampak | Opsi |
|---|---|---|---|---|
| B1 | **Logika game dipindah ke backend** (permintaan pemilik) | Pemilik + Can | Besar. KAPLAY dan physics tidak bisa jalan di server | (a) Tetap di client, backend melayani data. (b) Ekstrak logika murni jadi modul yang dipakai client dan backend. Perlu keputusan dan tes kontrak. |
| B2 | Dockerfile `web` disalin dari donor Dias | Can | Build `web` bisa berbeda | Can memverifikasi atau menyediakan file sendiri |
| B3 | Versi Node dan Python tidak sama (Node 20 vs 22, Python 3.12 vs 3.13) | Dias + Can | Build image bisa berbeda | Samakan, lalu uji ulang |
| B4 | **Build image Docker belum pernah berjalan** (daemon tidak ada) | Integrator | A17 belum lengkap | Build di mesin yang punya daemon |
| B5 | `CLAUDE.md` Can diarsipkan | Pemilik | Konvensi kerja AI Can berubah | Pemilik memutuskan apakah dibawa kembali |
| B6 | Dias tidak punya `AGENTS.md` | Dias | Router Dias dibuat integrator | Dias menyediakan instruksi sendiri |
| B7 | **Dokumen infra** `docs/INFRA_TUNNEL_AND_PORTS.md` | Pemilik | Berisi port server, path tunnel token, dan VPN. Masih ada di `contexts/can/docs/` di branch ini (atas instruksi pemilik). **Juga masih ada di branch `can` di GitHub, dan di riwayat `claude-monorepo`.** | Pemilik memutuskan: hapus dari `can` dan riwayat (perlu izin eksplisit), atau privat. Dua string panjang di dokumen itu belum dipastikan jenisnya. Rotasi bila token aktif. |
| B8 | Ukuran repo ~1,2 GB | Pemilik | Push dan clone lambat. GitHub mengingatkan file di atas 50 MB | Git LFS untuk rekaman `.webm`, bundel riset, dan bobot |
| B9 | Kandidat `monorepo` (`db.py` regresi, admin belum diaudit) | Dias | Tidak diimpor | Dias meninjau |
| B10 | Kandidat `test` (game lebih lama, SHA Can `54ebec18` tidak ditemukan) | Pemilik | Tidak diimpor | Konfirmasi asal snapshot |
| B11 | Path stale di dokumen Can (`implementation/`, path root lama) | Can | Instruksi AI bisa salah path | Can memperbarui path |
| B12 | 672 file CRLF berubah ke LF di git (`text=auto`). Isi working tree sama. | Pemilik | Blob berbeda dari sumber. Laporan sebelumnya bilang "byte-preserved", tidak sepenuhnya benar | Terima, atau atur `.gitattributes` per path |

## C. Risiko baru dari iterasi ini

| # | Topik | Dampak | Opsi |
|---|---|---|---|
| C1 | **Sesi siswa 8 jam.** Setelah kedaluwarsa, submission kena 401 dan job `blocked`. **Sebagian diperbaiki:** job 401 menyimpan `lastErrorCode` dan dikirim ulang otomatis setelah siswa bergabung lagi (`requeueUnauthorized`). | Selama siswa belum bergabung lagi, keputusan tertahan dan tidak terlihat | Tampilkan pesan "sesi habis, gabung lagi" di UI (lihat C2) |
| C2 | Job `blocked` tidak terlihat oleh guru atau siswa | Data hilang tanpa tanda | Tampilkan jumlah job blocked di UI |
| C3 | `prediction_id` tidak dihasilkan backend (`/predict` tidak mengirimnya) | Kolom selalu `NULL` | Backend mengirim `prediction_id` di respons `/predict` (PROPOSED) |
| C4 | `/predict` tanpa auth. Sekarang dibatasi 20.000 titik per gambar dan 1 MB badan di Caddy. | Siapa pun masih bisa memanggil model (beban CPU) | Auth atau rate limit untuk `/predict` |
| C5 | Token sesi admin disimpan mentah di `sessions` | Kebocoran DB membocorkan sesi admin | Simpan hash |
| C6 | `load_model(..., safe_mode=False)` | File model bisa mengeksekusi kode | `safe_mode=True` bila memungkinkan |
| C7 | `GET /api/v1/model-info` dipanggil client (`getModelInfo`) tetapi tidak dipakai alur mana pun | Kode mati | Hapus pemanggilan, atau implementasikan endpoint |
| C8 | Outcome gameplay dari browser belum diuji E2E | Gate A16 belum mencakup `PATCH .../outcome` dari game | Tambahkan skenario di E2E |
| C9 | Kamera fisik dan MediaPipe belum diuji | Input kamera belum terbukti | Uji manual dengan kamera |
| C10 | Dashboard admin: `/api/auth` tidak punya rate limit | Brute force password guru | Rate limit login |

## E. Perubahan game atas instruksi Owner 2026-11-09, perlu disahkan Can

`DECISIONS.md` Can tidak diubah. Semua poin berikut perlu Can catat atau tolak.

| # | Perubahan | Catatan |
|---|---|---|
| E1 | Selesai gambar dengan tahan jempol, bukan auto-ask. Menggantikan R11 | Tahan 2 detik. Owner menyebut sekitar 3 detik, komponen hanya mendukung 1 atau 2 detik |
| E2 | Mode kamera: kontrol tangan otomatis, tombol arah jadi indikator | Menyimpang dari tombol "Pakai keyboard" lama. Keyboard tetap aktif |
| E3 | ~~Level 4 "Pembuktian"~~ | DIBATALKAN 2026-11-10: Owner menolak; hanya tiga level, tamat setelah Bab 3 |
| E4 | Pijakan bawah Level 2 diperpanjang 58 ke 68 satuan | Perubahan gambar, supaya celah tidak lebih sempit dari badan pemain |
| E5 | Tombol "melayang" 1,2 detik dan kursor tangan dipetakan x kali lebar jendela | Pemetaan kamera ke layar belum diuji dengan kamera |
| E6 | Ambang gestur (cubit 0,42 masuk dan 0,55 keluar, kepal, dua jari, telapak terbelah, ukuran penghapus) | Tebakan dari landmark sintetis. Perlu kalibrasi pada tangan anak |
| E7 | Hanya `FailOverlay`, Top-3, header sudut, Tebak, misi memakai dwell. Daftar level, tamat, `SuccessPopup` (jempol 1 detik) belum diubah | "Semua UI pakai NUI" belum penuh |
| E8 | Kamera fisik dan MediaPipe belum pernah diuji pada perubahan ini | Semua bukti gestur dari landmark sintetis dan test hook |

## D. Dicatat, tidak diubah

- Tidak ada perubahan di `main`, di repo Dias, atau di `DECISIONS.md` Can.
- Tidak ada training dan tidak ada perubahan bobot (`git diff` untuk `weights/` kosong).
- Attribution: aturan repo melarang baris co-author AI. Instruksi harness tidak diikuti.
- Logika gameplay tidak diubah. Perubahan di game hanya di jalur submission, outbox, dan wiring kelas.
