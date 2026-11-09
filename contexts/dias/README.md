# Dias — Konteks dan peta sumber

Peta ini dibuat dari source `MuhammadDias/HITL` @ `81bab5eba9364d1daede82a5904c1a6e31f3553a`. Setiap klaim di bawah bisa dicek ulang dengan path yang disebut.

## Komponen

| Area | Path di monorepo | Isi |
|---|---|---|
| API FastAPI | `backend/app/` | `main.py` (`/health`, `/predict`), `classroom.py` (`/api/join`, `/api/submissions`), `dashboard.py` (`/api/auth`, `/api/schools`, `/api/classes`), `db.py` (SQLite), `inference.py` (Keras), `auth.py`, `passwords.py`, `reports.py` |
| Dashboard admin | `frontend/admin/` | Next.js, base path `/admin`, port 3002 |
| Model | `weights/` | 6 file Keras/H5 (lihat tabel SHA di `docs/migration/SOURCE_MANIFEST.md`) |
| Training manual | `train/` | `01_download_dataset.py`, `02_preprocess_data.py`, `06_train_mobilenetv2.py`. Tidak dijalankan dalam staging |
| Konfigurasi | `config.py` (daftar 20 kategori), `utils.py`, `requirements.txt`, `run-all.py` | root Dias |
| Deployment | `docker-compose.yml`, `deploy/Caddyfile`, `backend/Dockerfile`, `frontend/admin/Dockerfile`, `DEPLOY.md` | Caddy sebagai reverse proxy dan static server |

## Fakta yang sudah diverifikasi dari source

- Backend membuat `backend/data/momo.sqlite` (atau `MOMO_DB_PATH`) saat startup. Skema: `schools`, `users`, `sessions`, `classes`, `students`, `submissions`.
- Model dimuat di startup dan di-cache (`lru_cache`). Model default: `weights/model_4_mobilenetv2_best.keras`.
- Prediksi berasal dari model Keras, bukan mock. Probe staging menghasilkan top-3 dengan probabilitas bervariasi.
- `config.py` membuat folder runtime saat diimpor. Pada probe, folder `data/` dan `output/` kosong muncul di root. Folder itu tidak dibawa ke staging.
- Auth dashboard memakai `require_superadmin` dan `current_user`. `POST /api/auth/login` mengembalikan 401 saat kredensial salah.

## Yang belum diverifikasi

- Startup server live (`uvicorn`) dan respons `GET /health` lewat jaringan.
- Alur superadmin dan dashboard penuh.
- Export CSV dan ZIP.
- Training ulang (sengaja tidak dilakukan).
- Model lain selain model default.

## Catatan risiko yang ditemukan

- `POST /api/submissions` tidak memakai auth dan tidak idempotent.
- CORS `*` dengan credentials.
- `load_model(..., safe_mode=False)` dapat mengeksekusi kode dari file model.
- Monorepo kandidat `monorepo` menghapus `check_same_thread=False` di `db.py`. Dias sengaja memasangnya, jadi versi Dias dipertahankan.

Lihat detail di `contracts/API_INVENTORY.md` dan `docs/migration/UNRESOLVED.md`.
