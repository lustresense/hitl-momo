# Migrasi `MuhammadDias/HITL` → `lustresense/hitl-momo` (Dias @ `94120d4`)

**Tanggal:** 2026-11-19 · **Branch:** `integration/dias-repo-migration-20261119` · **Status:** di-push ke `main` (fast-forward dari `68a7d9a`) atas instruksi eksplisit Dias 2026-11-19. **Belum di-deploy.**

| | SHA |
|---|---|
| Sumber Dias (lokal, 1 commit di depan `origin/main` Dias) | `94120d46f4dcd59dd16a2f1982751d9f14c12e8d` |
| Sumber Dias `origin/main` (GitHub) | `3572d40745010a4b7e5e7adfcbd2c42e8f696bb6` |
| Basis integrasi sebelumnya (dipakai `docs/migration/SOURCE_MANIFEST.md`) | `81bab5eba9364d1daede82a5904c1a6e31f3553a` |
| Monorepo `main` saat branch dibuat | `68a7d9a607c433452884ce5c3fd4f1b3c5289890` (`0.27.0-alpha`) |

Baseline di mandat (`3ef4cc3`, `0.24.1-alpha`) sudah tertinggal; monorepo sudah maju ke `68a7d9a`. Tidak ada perubahan Can yang di-reset.

## 1. Metode audit

1. Semua 754 file yang dilacak Git di Dias `94120d4` dibandingkan dengan pohon monorepo berdasarkan **Git blob SHA**, lalu dengan isi setelah normalisasi CRLF→LF (`.gitattributes` monorepo: `*.py eol=lf`).
2. Perubahan Dias sejak integrasi terakhir dihitung dengan `git diff 81bab5e 94120d4` (43 file, 15 commit). Untuk setiap file itu dicek apakah monorepo juga mengubahnya (*3-way*).
3. File yang tidak ada di monorepo dicek keterjangkauannya di riwayat `origin/*` monorepo (`git rev-list --objects`).
4. Manifest per file dibuat ulang secara mekanis dengan `build_manifest.py` → `MANIFEST.csv`. Script keluar dengan kode 1 jika ada file tanpa status.

Angka audit awal di mandat terverifikasi ulang: 754 file, 452 identik di path sama, 172 berbeda, 130 tidak ada di path sama (104 ada salinan identik di path lain). Setelah migrasi:

| Kategori | Jumlah | Arti |
|---|---:|---|
| `1-IDENTICAL` | 467 | Blob sama persis di path sama (termasuk file baru yang dibawa) |
| `1-IDENTICAL-RELOCATED` | 248 | Blob sama persis di path lain (mis. `docs/history/dias/frontend-implementation-donor/`, `contexts/dias/notes/`) |
| `2-INTEGRATED` | 5 | Isi sama setelah CRLF→LF (`config.py`, `utils.py`, `train/01`, `train/02`, `train/06`) |
| `3-ADAPTED` | 8 | Digabung dengan perubahan monorepo (lihat §3) |
| `4-ARCHIVED-DIAS-CONTEXT` | 6 | Dokumen Dias disalin ke `contexts/dias/docs/`, dokumen kanonik tidak ditimpa |
| `4-ARCHIVED-CAN-AREA` | 9 | Edit Dias di kode Can, **tidak di-port** |
| `4-ARCHIVED-NOT-ENABLED` | 1 | `docker-compose.yml` (mengaktifkan kirim `levelId`) |
| `4-ARCHIVED` | 7 | `archive_unused/` versi lama script training |
| `4-HISTORICAL-DIVERGENCE` | 3 | Dias tidak mengubahnya sejak `81bab5e`; monorepo punya versi lebih baru |
| `5-SECRET` | 0 | Tidak ada secret/DB/data siswa di file terlacak |
| **Total** | **754** | 0 `UNRESOLVED` |

Angka di atas dihasilkan terhadap `023d061` (`python3 docs/migration/dias-94120d4/build_manifest.py <dias_repo> 94120d4 81bab5e HEAD docs/migration/dias-94120d4/MANIFEST.csv`).

**Bukti dapat dipulihkan:** 51 blob Dias yang tidak terjangkau dari riwayat monorepo disimpan byte-exact di `contexts/dias/archive/source-94120d4/files-not-in-monorepo.tar.gz` (dibuat `git archive 94120d4`). 703 blob lainnya terjangkau dari `origin/*` monorepo.

## 2. Yang dibawa (file baru di monorepo)

- **Training & evaluasi** (`train/`): `03_train_custom_cnn.py`, `04_train_efficientnet.py`, `05_train_squeezenet.py`, `07_train_resnet18.py`, `08_train_sketchnn.py`, `compare_models.py`, `evaluate_model.py`, `evaluate_legacy_models.py`, `train_all_models.sh`, `train_in_docker.sh`, `evaluate_in_docker.sh`. `01`, `02`, `config.py`, `utils.py` diperbarui ke versi Dias (20 kategori baru berlabel Indonesia; `LEGACY_CATEGORIES` untuk model lama). **Tidak ada training yang dijalankan.**
- **Backend:** `backend/app/difficulty.py`; `inference.py` membaca label dari `<model>.labels.json` dan jatuh ke `LEGACY_CATEGORIES` bila tidak ada (perilaku model sekarang tidak berubah); endpoint `GET/PUT /api/settings/difficulty`.
- **Dashboard:** halaman `/admin/kesulitan` dan menu-nya.
- **Tes:** `backend/tests/blackbox.py`, `backend/tests/run_tests_in_docker.sh`, `tests/integration/test_difficulty.py` (baru).
- **Dokumen Dias:** `contexts/dias/docs/` (`DOKUMENTASI-TEKNIS.md`, `DIAGRAM.md`, `USULAN-LABEL-LEVEL.md`, `DEPLOY.md`, `CHANGELOG-dias.md`, `README-dias.md`).
- **Bukti eksperimen:** `contexts/dias/evidence/server-20261113/` (hasil training 6 arsitektur, evaluasi, laporan pengujian) dan `contexts/dias/evidence/evaluation-legacy/` (dari working tree Dias, belum di-commit di repo Dias). URL quick-tunnel Cloudflare di laporan pengujian disensor.

## 3. Yang diadaptasi

| File | Keputusan |
|---|---|
| `backend/app/main.py` | Versi monorepo dipertahankan (CORS env, batas 20.000 titik, versi). Ditambah `levelId` opsional dan kesulitan AI **di balik `AI_DIFFICULTY_ENABLED` (default mati)**. Saat mati, `/predict` mengabaikan `levelId` dan respons **tetap `{"candidates": [3]}`** (dibuktikan `test_difficulty.py`). |
| `backend/app/db.py` | Monorepo (`student_sessions`, `_migrate`) + tabel `level_difficulty` (aditif, `CREATE TABLE IF NOT EXISTS`). |
| `backend/app/difficulty.py`, `dashboard.py` | Versi Dias + `difficulty_enabled()`; `GET /api/settings/difficulty` mengembalikan `active`. |
| `frontend/admin/lib/api.ts`, `kesulitan/page.tsx` | Versi Dias + banner "belum aktif di server" saat flag mati. |
| `backend/tests/blackbox.py` | Kasus 7 memakai kontrak sekarang (Bearer `student_session_token` + `submission_key`). |
| `tests/integration/verify_backend.py` | Label prediksi dicek terhadap label model yang dimuat, bukan `config.CATEGORIES` (yang kini berisi 20 kategori baru). |
| `.gitignore` | `.gitignore` monorepo + `.train-home/`, `.eval-home/`. |

## 4. Yang tidak di-port (arsip)

- **Kode Can** (`frontend/implementation/`): `src/domain/levels.ts` (label level → label Indonesia model baru, satu aturan perilaku untuk semua level), `Icon.tsx`, `TutorialBrochure.tsx`, `Dockerfile` (`NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1`), 5 file tes. Patch: `contexts/dias/archive/source-94120d4/frontend-implementation-dias-delta-81bab5e..94120d4.patch`.
- **`docker-compose.yml`**: satu-satunya perubahan Dias menyalakan `NEXT_PUBLIC_PREDICTION_SEND_CONTEXT`.
- **Root `README.md`, `CHANGELOG.md`, `DEPLOY.md`** Dias: tidak menimpa dokumen kanonik; salinan di `contexts/dias/docs/`.
- **153 file `frontend/implementation/` lain yang berbeda** adalah *historical divergence*: versi Dias = versi `81bab5e` yang sudah diintegrasikan lalu dikembangkan Can. Salinannya sudah ada di `docs/history/dias/frontend-implementation-donor/`.
- Perubahan working tree Dias yang belum di-commit: `docs/DOKUMENTASI-TEKNIS.md` (patch di arsip), penghapusan `pesawat_*.png` di root (file tetap ada di monorepo di `contexts/dias/notes/`).

## 5. Konflik yang perlu keputusan

| # | Konflik | Owner | Status |
|---|---|---|---|
| K1 | **Kesulitan AI mengubah Top-3 yang dilihat siswa** (mengaburkan confidence, menukar label mirip ke peringkat 1). Menyentuh invariant HITL dan desain edukasi Can. | Can + Dias | Kode ada, **mati**. Perlu keputusan sebelum `AI_DIFFICULTY_ENABLED=1` dan `NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1`. |
| K2 | **Label baru vs model yang ada.** `config.CATEGORIES` dan `levels.ts` versi Dias memakai 20 kategori Indonesia (tangga, jembatan, …). Model yang ada di `weights/` (dan di repo Dias) masih model lama 20 kategori Inggris. Model hasil retrain (`*.labels.json`) **tidak ada di kedua repo** (ada di server Dias; `*.json` di-ignore di repo Dias). | Dias (model) + Can (level) | Backend aman: tanpa `.labels.json` memakai `LEGACY_CATEGORIES`. `levels.ts` Can tidak diubah. Dias perlu menyerahkan model baru + `.labels.json`, lalu Can memutuskan pemetaan level. |
| K3 | `/predict` mendapat field opsional `levelId` dan endpoint baru `/api/settings/difficulty` | Can + Dias | Aditif, didokumentasikan di `contracts/API_INVENTORY.md`. Respons `/predict` tidak berubah saat flag mati. |
| K4 | `blackbox.py` Dias ditulis untuk kontrak submission lama (tanpa token) | Dias | Diadaptasi ke kontrak monorepo; Dias perlu mengonfirmasi. |
| K5 | Versi Dias (`v0.6–v0.8`, `CHANGELOG-dias.md`) vs versi tunggal monorepo | Dias | Riwayat Dias tetap sebagai arsip; ke depan memakai `VERSION` root. |

## 6. Hasil verifikasi (commit branch, Python 3.12, TF 2.21.0 CPU, Node 20.20.2)

| Cek | Hasil | Kelas |
|---|---|---|
| Baseline `main@68a7d9a`: `test_classroom_contract.py` | 14/14 | UNIT |
| Baseline `main@68a7d9a`: `verify_backend.py` | 20/20 | REAL_MODEL |
| Branch: `pytest tests/integration` (kontrak + kesulitan) | 20/20 | UNIT + REAL_MODEL |
| Branch: `verify_backend.py` (inferensi model asli, join, submission idempoten, outcome, auth, CORS, ekspor OpenAPI 19 path) | 20/20 | REAL_MODEL |
| Branch: `blackbox.py` via `uvicorn` lokal (HTTP nyata, DB sementara) | 10/10, `/predict` rata-rata 73 ms (20 run) | E2E (backend saja) |
| Branch: `frontend/admin` `npm ci`, `tsc --noEmit`, `next build` | PASS (termasuk `/kesulitan`) | BUILD |
| `scripts/bump_version.py --check` | ok `0.28.0-alpha` | STATIC_ONLY |
| `frontend/implementation` | Tidak diubah kecuali metadata versi `package.json` | NOT_TESTED |
| Docker image build, training, deploy | Tidak dijalankan | NOT_TESTED |
| Pemindaian secret | Tidak ada token/kunci; password hanya akun uji sekali pakai (`ujicoba12345` di DB sementara); email placeholder; IP dokumentasi `203.0.113.10` | STATIC_ONLY |

## 7. Model dan weights

Ke-6 file di `weights/` identik byte-per-byte (blob SHA sama) antara Dias `94120d4` dan monorepo; tidak ada duplikasi yang dibuat. Model default `weights/model_4_mobilenetv2_best.keras` (sha256 `8e7fb60a0c0dd5217c362294a740dcdc560bd096d700f13395f52c80ab5eefdc`) dimuat dan menghasilkan Top-3 nyata pada `verify_backend.py`.
