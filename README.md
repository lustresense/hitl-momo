# Sketchbook Universe — Monorepo (staging)

Satu produk, dua area tanggung jawab: **game siswa** (Can) dan **backend, dashboard guru/admin, model, dan deployment** (Dias).

> **Status: `LOCAL_STAGING`.** Repo ini hasil integrasi lokal. Belum dirilis, belum dideploy, dan belum melalui review pemilik. Lihat [`NOW.md`](NOW.md) untuk status per komponen dan [`docs/migration/INTEGRATION_REPORT.md`](docs/migration/INTEGRATION_REPORT.md) untuk bukti.

## Arsitektur runtime

```text
Browser siswa (game Can)              Browser guru (admin Dias)
frontend/implementation               frontend/admin
Next.js static export                 Next.js (base path /admin)
Canvas, MediaPipe, KAPLAY, Momo       kelas + dashboard
        │ REST (HTTPS)                        │ REST (HTTPS)
        └──────────────┬───────────────────────┘
                       ▼
             Caddy (deploy/Caddyfile)
               /        → game (static)
               /admin   → admin
               /api, /predict, /health → backend
                       ▼
             backend/  FastAPI (Dias)
               ├─ weights/  model Keras (inferensi)
               └─ SQLite   kelas, siswa, submissions
```

Ada **satu backend HTTP**. Logika gameplay (KAPLAY, physics, state machine, interaksi) berjalan di browser siswa, bukan di server. Backend hanya melayani prediksi dan data. Lihat [`docs/architecture/README.md`](docs/architecture/README.md).

## Kepemilikan

| Path | Owner | Catatan |
|---|---|---|
| `frontend/implementation/` | Can | Game siswa. Baseline: `can` pada SHA `d4bbaec` |
| `frontend/admin/` | Dias | Dashboard guru/admin |
| `backend/`, `train/`, `weights/`, `config.py`, `utils.py` | Dias | API, inferensi, training manual |
| `contracts/` | Bersama | Kontrak REST. Perubahan breaking wajib disetujui kedua owner |
| `deploy/`, `docker-compose.yml`, `.env.example` | Bersama, teknis Dias | Deployment |
| `contexts/can/` | Can | Governance, SOUL, DECISIONS, konteks AI Can |
| `contexts/dias/` | Dias | Konteks dan catatan Dias |
| `docs/history/` | Arsip | Changelog dan dokumen lama Can dan Dias, tidak aktif |

Membaca AI agent: mulai dari [`AGENTS.md`](AGENTS.md). Ia mengarahkan ke router owner yang relevan.

## Yang sudah terbukti vs belum

Bukti lengkap ada di `docs/migration/INTEGRATION_REPORT.md`. Ringkasnya:

- **Terbukti (lokal):** typecheck, unit test (100 file, 667 test), dan build game Can. Typecheck dan build admin. Import dan endpoint backend dengan model asli (`REAL_MODEL`). Validasi `docker compose config`. E2E journey game dengan prediksi mock (`MOCK_MODEL`).
- **Gagal:** kontrak classroom client Can ke backend Dias (A11). Lihat `contracts/API_INVENTORY.md`.
- **Belum dites:** build image Docker (daemon tidak tersedia di lingkungan ini), start server uvicorn live, dan alur classroom end-to-end (join → submit → DB → dashboard).

## Struktur folder

```text
.
├── README.md  AGENTS.md  CHANGELOG.md  NOW.md
├── .gitignore  .env.example  .dockerignore
├── docker-compose.yml  deploy/Caddyfile
├── frontend/
│   ├── implementation/      game Can (Next.js static export)
│   └── admin/               dashboard Dias (Next.js)
├── backend/                 FastAPI + SQLite (Dias)
├── train/                   skrip training manual (Dias)
├── weights/                 bobot model (binary, ~124 MB)
├── config.py  utils.py  requirements.txt  run-all.py   root Dias (diperlukan backend/training)
├── contracts/               README, API_INVENTORY.md, openapi.json, fixtures
├── contexts/
│   ├── can/                 governance & konteks Can (AGENTS.md = router + kebijakan asli)
│   └── dias/                README, AGENTS, NOW, catatan Dias
└── docs/
    ├── architecture/  integration/  migration/  product/  team/  ai-workflow/
    └── history/             arsip changelog dan dokumen pra-monorepo
```

Pemetaan setiap file sumber ada di [`docs/migration/SOURCE_MAP.csv`](docs/migration/SOURCE_MAP.csv).

## Prasyarat

Versi di bawah diambil dari manifest dan Dockerfile. Yang belum diverifikasi ditandai `VERIFY`.

| Komponen | Versi | Sumber |
|---|---|---|
| Node.js (game dan admin) | 22 terverifikasi lokal. Dockerfile memakai `node:20-alpine`. | `VERIFY`: samakan ke 20 atau 22 |
| npm | 10.9.9 (lokal) | — |
| Python (backend) | 3.13 terverifikasi lokal. Dockerfile memakai `python:3.12-slim`. | `VERIFY` |
| TensorFlow / Keras | 2.21.0 / 3.15.1 | `backend/requirements.txt` |
| FastAPI / uvicorn | 0.141.1 / 0.54.0 | `backend/requirements.txt` |
| Docker Compose | — | `VERIFY`: hanya `config` yang teruji |

## Quick start

Semua perintah dijalankan dari root repo, kecuali disebut lain. Semua command di bawah sudah dijalankan di lingkungan staging.

### Game (Can)

```bash
cd frontend/implementation
npm ci
npm run typecheck        # PASS
npm test                 # PASS: 100 file, 667 test
npm run build            # PASS: menghasilkan out/
```

Catatan: `npm run e2e` di `package.json` menunjuk ke `e2e/run.mjs`, yang berstatus LEGACY. Suite yang dipelihara ada di `e2e/normal-journey.mjs` dan `e2e/recovery-paths.mjs`.

### Admin (Dias)

```bash
cd frontend/admin
npm ci
npm run typecheck        # PASS
npm run build            # PASS
```

Admin butuh `NEXT_PUBLIC_API_URL` dan `NEXT_PUBLIC_GAME_URL` saat build (lihat `frontend/admin/Dockerfile`).

### Backend (Dias)

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
# Uji import + endpoint dengan model asli (tanpa server live):
#   <venv>/bin/python tests/integration/verify_backend.py $PWD /tmp/backend_verify.json
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000   # UNVERIFIED sebagai server live
```

Model default: `weights/model_4_mobilenetv2_best.keras`. Ganti dengan env `MODEL_PATH`. Lokasi database: env `MOMO_DB_PATH` (default `backend/data/momo.sqlite`, ada di `.gitignore`).

### Compose terintegrasi

```bash
cp .env.example .env     # isi PUBLIC_URL dan lainnya. Jangan commit .env
docker compose config -q # PASS (validasi saja)
docker compose up -d --build   # NOT_TESTED: daemon Docker tidak tersedia saat staging
```

## Endpoint

Daftar lengkap ada di [`contracts/API_INVENTORY.md`](contracts/API_INVENTORY.md). Skema OpenAPI diekspor dari aplikasi live ke [`contracts/openapi.json`](contracts/openapi.json).

Endpoint yang dipakai game: `POST /predict`, `GET /api/join/{token}`, `POST /api/join/{token}/students`, `POST /api/submissions`. Endpoint `PATCH /api/submissions/{id}/outcome` dipanggil client Can tetapi **tidak ada** di backend.

## Environment

- `.env.example` hanya berisi contoh nilai. Tidak ada secret di repo.
- `PUBLIC_URL` dipakai Compose untuk build game dan admin. Nilainya terikat saat build.
- Game memilih prediksi lewat `NEXT_PUBLIC_PREDICTION_MODE` (`mock` atau `partner`). Nilai yang bukan `partner` akan memakai mock.
- CORS backend saat ini `allow_origins=["*"]` dengan `allow_credentials=True`. Lihat catatan risiko di `contracts/API_INVENTORY.md`.

## Keamanan dan data

- Database SQLite menyimpan data siswa dan kelas. **Jangan** commit `backend/data/`, `*.sqlite`, atau salinan database nyata. Keduanya diabaikan `.gitignore`.
- Game statis tidak boleh memuat secret. Semua nilai `NEXT_PUBLIC_*` terlihat oleh siapa pun yang membuka halaman.
- Kebijakan (dari rencana): kamera siswa tidak di-stream ke backend; yang dikirim hanya stroke. Belum diaudit ulang di kode staging.
- `keras.models.load_model(..., safe_mode=False)` di `backend/app/inference.py` mengeksekusi kode dari file model. Hanya muat bobot dari sumber tepercaya.

## Alur kelas

1. Guru membuat kelas di admin. Sistem memberi `join_token`.
2. Siswa membuka link kelas di game. Client memanggil `GET /api/join/{token}`.
3. Siswa memilih nomor absen. Client memanggil `POST /api/join/{token}/students`.
4. Siswa menggambar. Client memanggil `POST /predict`, menampilkan Top-3 dan confidence, lalu siswa memilih Accept, Correct, atau Override.
5. Keputusan dikirim ke `POST /api/submissions`. **Saat ini kontrak tidak cocok** (lihat `contracts/API_INVENTORY.md`).
6. Guru melihat hasil di dashboard admin.

Saat offline atau timeout, client menyimpan keputusan di outbox. Perilaku retry belum diuji end-to-end.

## Kerja lintas owner

- Satu fitur, satu branch pendek. Gabung lewat PR dengan CI dan review silang.
- Perubahan kontrak API (`contracts/`) butuh persetujuan Can dan Dias.
- Perubahan yang menyentuh tampilan game atau alur gameplay Can dikonsultasikan ke Can dulu.
- Catatan perubahan: satu `CHANGELOG.md` root. Arsip lama ada di `docs/history/`.

## Troubleshooting

- **Mismatch asset atau static export:** `web` dibangun dari `frontend/implementation`. Jika path route berbeda, periksa `deploy/Caddyfile` (`try_files`).
- **Import Python dari root:** backend mengimpor `config` dari root repo. Jalankan dari root, bukan dari `backend/`.
- **Pointer LFS:** tidak ada pointer LFS di repo ini. Semua bobot adalah binary asli. Jika clone memakai `GIT_LFS_SKIP_SMUDGE`, verifikasi ukuran file.
- **Storage volume:** database ada di volume `backend-data`. Backup sebelum `docker compose down -v`.
- **CORS:** admin dan game memanggil API lintas origin. Cek header `Access-Control-Allow-Origin` jika request ditolak browser.
- **`config.py` membuat folder `data/` dan `output/` di root saat diimpor.** Hapus keduanya setelah menjalankan skrip di `tests/integration/`. Keduanya tidak boleh masuk commit.
- **Path test Can:** `frontend/implementation/tests/components/icon-gestures.test.tsx` membaca aset dari `contexts/can/design/`. Path ini diubah di staging dan dicatat di `docs/migration/SOURCE_MAP.csv`.

## Referensi

- Rencana dan keputusan integrasi: `docs/migration/`
- Kontrak REST: `contracts/`
- Governance per owner: `contexts/can/`, `contexts/dias/`
- Provenance sumber: `docs/migration/SOURCE_MANIFEST.md`
