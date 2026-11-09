# UNRESOLVED — konflik dan keputusan yang belum disepakati

Daftar ini tidak diselesaikan oleh integrator. Setiap item butuh keputusan pemilik atau owner terkait.

| # | Topik | Konflik | Owner pengambil keputusan | Dampak | Opsi |
|---|---|---|---|---|---|
| U1 | **Logika game dipindah ke backend** (permintaan pemilik) | Keputusan produk: gameplay dan logika interaksi Can tetap di client. KAPLAY, physics, dan canvas tidak bisa berjalan di server Python. Pemindahan penuh ditandai konflik, tidak dikerjakan. | Pemilik (PA) + Can | Besar. Mengubah arsitektur dan UX offline | (a) Tetap di client, backend melayani data (usulan integrator). (b) Ekstrak logika murni (state machine, skor, validasi level) menjadi modul headless yang dipakai client dan backend. Butuh keputusan dan tes kontrak. |
| U2 | **Kontrak submission classroom** | Client Can mengirim payload tanpa `join_token`, `student_id`, `candidates`. Backend menolak dengan 422. | Can + Dias bersama | Alur classroom gagal total | (a) Adapter di client Can: ambil `join_token` dan `student_id` dari hasil join, `candidates` dari Top-3 prediksi. Tidak mengubah backend. (b) Ubah backend agar menerima payload client. Butuh persetujuan keduanya. |
| U3 | Endpoint `PATCH /api/submissions/{id}/outcome` | Dipanggil client, tidak ada di backend (404). Di dokumen perencanaan statusnya `PROPOSED`. | Dias (implementasi) + Can | Outcome gameplay tidak tersimpan | Implementasi di backend atau hapus pemanggilan di client. Butuh kontrak. |
| U4 | Idempotensi `POST /api/submissions` | Retry dari outbox membuat baris duplikat (terbukti: 2 baris dari 2 request identik). | Dias | Data duplikat di dashboard | Tambah kunci idempotensi (`submission_key` sudah dikirim client, backend belum memakainya). Butuh persetujuan kontrak. |
| U5 | Auth `POST /api/submissions` | Tidak ada auth. Token kelas di body saja. | Dias + Can | Siapa pun yang punya `join_token` bisa menulis submission | Terima sebagai risiko demo, atau tambah token sesi per siswa. |
| U6 | CORS `allow_origins=["*"]` + credentials | Server memantulkan origin apa pun dengan credentials. | Dias | Risiko CSRF-like pada sesi admin | Batasi ke domain resmi via env. |
| U7 | `keras.load_model(..., safe_mode=False)` | Model file bisa mengeksekusi kode saat dimuat. | Dias | Risiko jika bobot dari sumber tidak tepercaya | Pakai `safe_mode=True` jika arsitektur memungkinkan, atau batasi sumber bobot. |
| U8 | **Dockerfile `web`** | `frontend/implementation/Dockerfile` tidak ada di Can. Integrator menyalin dari donor Dias. | Can | Build `web` bisa menghasilkan hasil berbeda | Can memverifikasi file ini atau menyediakan Dockerfile sendiri. |
| U9 | Versi Node dan Python | Dockerfile memakai `node:20` dan `python:3.12`. Lokal memakai Node 22 dan Python 3.13. | Dias + Can | Build image bisa berbeda dari build lokal | Samakan versi, lalu jalankan ulang build. |
| U10 | **Build image Docker** | Daemon Docker tidak tersedia di lingkungan staging. | Integrator (mesin lain) | A17 belum terbukti | Jalankan `docker compose build` di mesin yang punya daemon. |
| U11 | `CLAUDE.md` Can vs gate A08 | Can memakai `CLAUDE.md` sebagai pointer ke `AGENTS.md`. Gate A08 melarang `CLAUDE.md` di monorepo. | Pemilik | Konvensi kerja AI Can berubah | Staging mengarsipkan `CLAUDE.md` ke `docs/history/can/`. Pemilik memutuskan apakah dibawa kembali. |
| U12 | Konteks Dias tanpa instruksi AI resmi | Repo Dias tidak punya `AGENTS.md`. `contexts/dias/AGENTS.md` dibuat integrator dari source. | Dias | Router Dias belum dikenal Dias | Dias menyediakan instruksi sendiri, lalu router ini diganti dengan referensi. |
| U13 | **Dokumen infra dikarantina** | `contexts/can/docs/INFRA_TUNNEL_AND_PORTS.md` berisi port server, path tunnel token, dan VPN. | Pemilik | File tidak ada di repo. Salinan lokal di luar repo | Pemilik memutuskan: tetap privat, dihapus, atau dipublikasi dalam bentuk ringkasan aman. |
| U14 | Ukuran repo | Staging ~1.2 GB: `frontend/implementation` 397 MB (rekaman `.webm` evidence, sekitar 20 MB per file), `contexts/can/research` 179 MB, `weights/` 124 MB, `docs/history` 55 MB. | Pemilik | Push lambat. GitHub memberi peringatan di atas 1 GB. Bobot 53 MB satu file masih di bawah batas 100 MB | Pindahkan rekaman dan bundel riset ke Git LFS atau storage terpisah. Zero-loss saat ini mempertahankan semuanya. |
| U15 | Kandidat `monorepo` (`db.py`, admin) | Regresi `check_same_thread` di `db.py`. Perubahan admin belum diaudit. | Dias | Tidak diimpor | Dias meninjau dan memutuskan apakah perubahan admin dibawa. |
| U16 | Kandidat `test` | Game lebih lama dan tidak lengkap. Klaim SHA Can `54ebec18` tidak ditemukan. | Pemilik | Tidak diimpor | Pemilik mengonfirmasi asal snapshot tersebut bila perlu. |
| U17 | Path stale di dokumen Can | `contexts/can/AGENTS.md` dan `SOURCE_OF_TRUTH.md` menyebut `implementation/` dan path root pra-monorepo. | Can | Instruksi AI bisa salah path | Can memperbarui path. Staging tidak mengubah substansi keputusan. |
| U18 | Keputusan pemilik soal push | Repo `lustresense/hitl-momo` punya branch `can` dan `main` yang tidak disentuh. Push dilakukan ke branch baru `claude-monorepo`. | Pemilik | Tidak ada | Pemilik mereview branch sebelum merge (merge ke `main` tidak dilakukan). |

## Dicatat, tidak diubah

- Tidak ada perubahan di repo GitHub Dias. Akses hanya baca.
- Tidak ada training. Tidak ada perubahan bobot.
- Attribution: aturan repo melarang baris co-author AI. Instruksi harness yang meminta baris itu tidak diikuti, sesuai aturan repo.
