# Dias — Konteks dan peta sumber

Sumber terakhir yang dimigrasikan: `MuhammadDias/HITL` @ `94120d46f4dcd59dd16a2f1982751d9f14c12e8d` (2026-11-19). Peta sebelumnya dibuat dari `81bab5e`. Laporan migrasi: `docs/migration/dias-94120d4/README.md`; status per file: `docs/migration/dias-94120d4/MANIFEST.csv`.

**Setelah PR migrasi di-merge, pengembangan Dias dilanjutkan di repo ini.** `MuhammadDias/HITL` menjadi referensi sejarah (baca saja). Jangan mengembangkan dua implementasi aktif.

## Komponen

| Area | Path di monorepo | Isi |
|---|---|---|
| API FastAPI | `backend/app/` | `main.py` (`/health`, `/predict`), `classroom.py` (`/api/join`, `/api/submissions`, outcome), `dashboard.py` (`/api/auth`, `/api/schools`, `/api/classes`, `/api/settings/difficulty`), `difficulty.py`, `db.py` (SQLite), `inference.py` (Keras), `auth.py`, `passwords.py`, `reports.py` |
| Dashboard admin | `frontend/admin/` | Next.js, base path `/admin`, port 3002. Halaman `/admin/kesulitan` (superadmin) |
| Model | `weights/` | Model DEV `model_4_mobilenetv2_best.keras` dan `model_4_mobilenetv2.labels.json`; default backend membaca `weights/` repo. Lihat `docs/DEV-MIGRATION.md`. |
| Training manual | `train/` | `01`–`08` (Custom CNN, EfficientNet-B0, SqueezeNet, MobileNetV2, ResNet-18, SketchNN), `compare_models.py`, `evaluate_model.py`, `evaluate_legacy_models.py`, `train_all_models.sh`, `train_in_docker.sh`, `evaluate_in_docker.sh` |
| Konfigurasi | `config.py` (20 kategori baru + `LABELS_ID` + `LEGACY_CATEGORIES`), `utils.py`, `requirements.txt`, `run-all.py` | |
| Tes | `tests/integration/` (kontrak, kesulitan, `verify_backend.py`), `backend/tests/blackbox.py`, `backend/tests/run_tests_in_docker.sh` | |
| Deployment | `docker-compose.yml`, `deploy/Caddyfile`, `backend/Dockerfile`, `frontend/admin/Dockerfile` | Panduan Dias: `contexts/dias/docs/DEPLOY.md` |
| Dokumen & bukti Dias | `contexts/dias/docs/`, `contexts/dias/evidence/`, `contexts/dias/archive/` | |

## Setup lokal (Dias, di monorepo)

```bash
git clone https://github.com/lustresense/hitl-momo.git && cd hitl-momo
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt pytest httpx      # runtime backend + tes
# training: pip install -r train/requirements.txt (atau train/train_in_docker.sh untuk GPU)

# Backend (DB lokal di backend/data/, di-ignore Git)
python backend/create_superadmin.py --email <email> --name <nama> --password <password>
uvicorn backend.app.main:app --port 8000

# Tes
python -m pytest tests/integration -q
python tests/integration/verify_backend.py . /tmp/verify.json   # menulis ulang contracts/openapi.json
python backend/tests/blackbox.py --base http://127.0.0.1:8000 --email <email> --password <password>

# Dashboard
cd frontend/admin && npm ci && npm run dev    # http://localhost:3002/admin
```

Variabel penting: `WEIGHTS_DIR` dan `MODEL_FILE` (default model MobileNetV2), `MOMO_DB_PATH`, `CORS_ORIGINS`, `AI_DIFFICULTY_ENABLED` (kode default `0`; `docker-compose.yml` dan `.env.example` menyalakan `1`. Untuk uvicorn lokal set manual), `PREDICTION_SEND_CONTEXT` (build game, default `1` sejak 0.29.0-alpha).

**Memakai model hasil retrain:** taruh `<nama>.keras` dan `<nama>.labels.json` (dibuat oleh script training) di `weights/`, set `WEIGHTS_DIR` dan `MODEL_FILE`. Backend memeriksa jumlah output = jumlah label. Label yang dikirim ke game ikut berubah, jadi butuh koordinasi dengan Can (`levels.ts`).

## Yang belum diverifikasi

- Build image Docker, training ulang, model selain default, deployment.
- Model DEV dan JSON label disertakan pada branch ini; verifikasi runtime laptop tetap diperlukan.

## Risiko yang masih ada

- `/predict` tanpa auth; token admin di `sessions` disimpan mentah; `load_model(..., safe_mode=False)`.
- `check_same_thread=False` di `db.py` sengaja dipertahankan.

Detail: `contracts/API_INVENTORY.md`, `docs/migration/UNRESOLVED.md`, `docs/migration/dias-94120d4/README.md` §5.
