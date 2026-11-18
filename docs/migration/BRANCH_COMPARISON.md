# BRANCH_COMPARISON — can vs monorepo vs test (dan donor Dias)

Semua angka dihitung dari clone referensi, bukan dari ingatan. Perintah yang dipakai: `git ls-files`, `diff -rq`, dan `git merge-base`.

## Ringkasan

| Kandidat | Commit | Tracked | Riwayat terkait `can` | Game (`frontend/implementation`) | Backend | Admin | Dipakai? |
|---|---|---|---|---|---|---|---|
| **can** (baseline game) | `d4bbaec` | 1240 | — | referensi | — | — | **Ya**: basis game |
| **Dias** (baseline backend/admin) | `81bab5e` | 741 | — | 137 path beda dari `can` (versi lama) | referensi | referensi | **Ya**: basis backend/admin/model |
| monorepo | `7803189` | 1027 | **tidak ada merge-base** | 1 file beda dari `can` | 1 file beda dari Dias (`db.py`, **regresi**) | 5 file beda dari Dias | **Tidak diimpor** |
| test | `7c563de` | 567 | **tidak ada merge-base** | 203 path beda dari `can` (113 hilang, 9 baru) | identik Dias | identik Dias | **Tidak diimpor** |

## Kandidat `monorepo` (`7803189`)

- **Game:** hanya satu file yang beda dari `can`: `tests/components/icon-gestures.test.tsx`. Versi kandidat menambah fallback `existsSync` ke `../../design/...`. Di layout staging, fallback itu tetap salah. Staging memakai `../../contexts/can/design/...`. Tidak ada perubahan gameplay di kandidat.
- **Backend `db.py`:** kandidat **menghapus** `check_same_thread=False` dari `sqlite3.connect`. Dias memasangnya dengan komentar alasan (FastAPI bisa memakai koneksi lintas thread). Kandidat ini regresi, jadi versi Dias dipertahankan.
- **Admin:** kandidat beda di `lib/api.ts`, `lib/auth.tsx`, `next.config.mjs`, dan tidak punya `Dockerfile` serta `.dockerignore`. Perubahan ini belum diaudit dan belum dibangun, jadi tidak diimpor. Status: `REVIEW_REQUIRED` untuk Dias.
- **Kontrak dan dokumen:** kandidat punya `contracts/fixtures/*` dan `docs/migration/*`. Fixture tidak diverifikasi terhadap source, jadi tidak diimpor. Inventaris endpoint dibuat ulang dari source.
- **Bobot:** identik dengan Dias (SHA-256 sama untuk keenam file).
- **Deployment:** kandidat `monorepo` tidak punya `deploy/` dan tidak punya `docker-compose.yml`. Deployment diambil dari Dias.

## Kandidat `test` (`7c563de`)

- **Game:** 113 file ada di `can` tetapi tidak ada di `test`, dan 9 file hanya ada di `test`. `NOW.md` kandidat mengutip Can SHA `54ebec18…`. SHA itu tidak ditemukan di clone lokal, jadi klaimnya tidak bisa diverifikasi. Snapshot ini lebih lama dan tidak lengkap, sehingga **ditolak** sebagai basis game.
- **Backend dan admin:** identik dengan Dias. Tidak ada yang perlu diporting.
- **Konteks:** `contexts/can/` berisi 177 file salinan dokumen Can. Ini berpotensi duplikat dengan `can` dan tidak diimpor sebagai sumber otoritatif.
- **Deploy:** `deploy/Caddyfile` identik byte-per-byte dengan Dias (diverifikasi dengan `cmp`). Tidak diimpor ulang karena sudah sama.

## Donor Dias `frontend/implementation`

- 572 file, 137 path beda dari `can` (versi lebih lama).
- `src/classroom/session.ts` adalah klien join dan submission versi lama. Versi Can sudah punya `src/api/classroom-client.ts`, `submission-client.ts`, `outbox.ts`, dan `submission-adapter.ts`. Jadi port classroom bukan pekerjaan dari nol, tetapi **kontrak Can belum cocok dengan backend** (lihat `contracts/API_INVENTORY.md`).
- Seluruh donor diarsipkan di `docs/history/dias/frontend-implementation-donor/`. File dengan kata kunci classroom ditandai `PORT_NEEDED` (50 file).

## Keputusan per komponen

| Komponen | Keputusan | Alasan | Bukti |
|---|---|---|---|
| Game siswa | `can` @ `d4bbaec` | Paling baru dan lengkap. Kandidat `monorepo` identik kecuali satu test | diff tree |
| Backend | Dias @ `81bab5e` | Kandidat `monorepo` regresi di `db.py`, `test` identik | diff |
| Admin | Dias @ `81bab5e` | Kandidat `monorepo` belum diaudit dan tidak punya Dockerfile | diff, `REVIEW_REQUIRED` |
| Model dan bobot | Dias | Identik di semua kandidat, dan Dias sumber aslinya | SHA-256 di `SOURCE_MANIFEST.md` |
| Kontrak REST | Dibuat dari source FastAPI | Kandidat `contracts/` tidak diverifikasi | `API_INVENTORY.md`, `openapi.json` |
| Changelog | Satu root `CHANGELOG.md` | Sesuai aturan. Riwayat diarsipkan | `docs/history/` |
| Governance Can | `contexts/can/` byte-preserved | Sesuai aturan. `AGENTS.md` diberi router, isi asli tetap | SHA di `SOURCE_MAP.csv` |

## Catatan

- Riwayat `monorepo` dan `test` tidak terkait dengan `can`. Jika monorepo akhirnya dibangun di atas `can`, perbandingan di atas tetap berlaku.
- Kandidat `test` memuat `README`, `NOW`, dan `CHANGELOG` versi integrator sebelumnya. Dokumen itu bukan sumber kebenaran dan tidak dipakai sebagai acuan status.
