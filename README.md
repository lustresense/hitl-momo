# Sketchbook Universe — Monorepo (staging)

Satu produk, dua area tanggung jawab: **game siswa** (Can) dan **backend, dashboard guru, model, dan deployment** (Dias).

> **Status: `LOCAL_STAGING`.** Branch `claude-monorepo` di atas `can`. Belum dirilis, belum dideploy ke server, belum direview pemilik. Status per komponen: [`NOW.md`](NOW.md). Bukti: [`docs/migration/INTEGRATION_REPORT.md`](docs/migration/INTEGRATION_REPORT.md).

## Yang sudah terbukti (lokal)

- **Alur classroom end-to-end**: link kelas → join (dapat token sesi) → gambar → **model asli** di backend → Accept → submission ke database → tampil di dashboard guru. Juga lewat Caddy. Test: `frontend/implementation/e2e/classroom-e2e.mjs`, 17/17.
- **Retry dan idempotensi**: respons pertama sengaja dijatuhkan setelah server menyimpan, outbox mengirim ulang, dan hasilnya tetap satu baris.
- **Kontrak**: fixture `contracts/fixtures/` dicek oleh test Python (11) dan test Can (3).
- **Game Can**: typecheck, 102 file / 672 unit test, build, dua suite gameplay (mock).
- **Backend**: 20/20 probe runtime dengan bobot asli.
- **Caddy 2.10.2** dengan `deploy/Caddyfile` ini melayani game, admin, API, dan `/predict`.

## Belum terbukti

- Build image Docker dan `docker compose up` (daemon Docker tidak tersedia di lingkungan pengujian).
- Outcome gameplay dari browser (endpoint dan client sudah diuji lewat test).
- Kamera fisik dan MediaPipe (pengujian memakai fallback tombol).

## Arsitektur runtime

```text
Browser siswa (game Can)              Browser guru (admin Dias)
frontend/implementation               frontend/admin  (base path /admin)
Next.js static export                 Next.js standalone
        │ REST                                 │ REST (Bearer)
        └──────────────┬───────────────────────┘
                       ▼
             Caddy (deploy/Caddyfile)
               /  → game (static)   /admin → admin   /api, /predict, /health → backend
                       ▼
             backend/  FastAPI (Dias): model Keras (weights/) + SQLite
```

Satu backend HTTP. Gameplay, physics, dan state machine tetap di browser siswa. Lihat [`docs/architecture/README.md`](docs/architecture/README.md).

## Kepemilikan

| Path | Owner | Catatan |
|---|---|---|
| `frontend/implementation/` | Can | Game siswa, baseline `can` @ `d4bbaec` |
| `frontend/admin/` | Dias | Dashboard guru |
| `backend/`, `train/`, `weights/`, `config.py`, `utils.py` | Dias | API, inferensi, training manual |
| `contracts/` | Bersama | Kontrak REST. Perubahan breaking butuh persetujuan Can dan Dias |
| `deploy/`, `docker-compose.yml`, `.env.example` | Bersama | Deployment |
| `contexts/can/` | Can | Governance dan konteks Can (`DECISIONS.md` tidak diubah) |
| `contexts/dias/` | Dias | Konteks dan catatan Dias |
| `docs/history/` | Arsip | Changelog dan dokumen lama. Tidak aktif |

AI agent mulai dari [`AGENTS.md`](AGENTS.md).

## Struktur folder

```text
.  README.md AGENTS.md CHANGELOG.md NOW.md .gitignore .gitattributes .env.example .dockerignore
├── docker-compose.yml  deploy/Caddyfile
├── frontend/implementation/   game (Next.js static export; Dockerfile untuk service web)
├── frontend/admin/            dashboard (Next.js standalone; Dockerfile)
├── backend/                   FastAPI + SQLite
├── train/  weights/           training manual dan bobot model (binary asli)
├── config.py  utils.py  requirements.txt  run-all.py
├── contracts/                 API_INVENTORY.md, openapi.json, fixtures/
├── tests/integration/         test_classroom_contract.py, verify_backend.py, probe_client_contract.py, seed_e2e.py
├── contexts/can/  contexts/dias/
└── docs/                      architecture/, migration/ (laporan + bukti), history/ (arsip)
```

## Prasyarat

| Komponen | Versi yang diuji | Sumber versi |
|---|---|---|
| Node.js | 22 (lokal) | Dockerfile memakai `node:20-alpine`. `VERIFY`: samakan |
| Python | 3.13 (lokal) | Dockerfile memakai `python:3.12-slim`. `VERIFY` |
| TensorFlow / Keras / FastAPI | 2.21.0 / 3.15.1 / 0.141.1 | `backend/requirements.txt` |
| Caddy | 2.10.2 | `caddy:2.10-alpine` di Dockerfile |
| Docker Compose | — | hanya `config` yang diuji |

## Cara menjalankan (semua dari root repo kecuali disebut)

### Game (Can)
```bash
cd frontend/implementation
npm ci
npm run typecheck      # PASS
npx vitest run         # PASS: 102 file, 672 test
npm run build          # PASS. Menghasilkan out/
```
Build untuk alur kelas memakai `NEXT_PUBLIC_PREDICTION_MODE=partner`, `NEXT_PUBLIC_PREDICTION_ENDPOINT=<PUBLIC_URL>/predict`, dan `NEXT_PUBLIC_API_BASE_URL` kosong (same-origin lewat Caddy). Tanpa itu, prediksi memakai mock.

`npm run e2e` menunjuk ke `e2e/run.mjs`, yang berstatus LEGACY. Suite yang dipakai: `e2e/normal-journey.mjs`, `e2e/recovery-paths.mjs`, dan `e2e/classroom-e2e.mjs`.

### Admin (Dias)
```bash
cd frontend/admin
npm ci
npm run typecheck      # PASS
NEXT_PUBLIC_API_URL=<PUBLIC_URL> NEXT_PUBLIC_GAME_URL=<PUBLIC_URL> NEXT_BASE_PATH=/admin npm run build   # PASS
NEXT_BASE_PATH=/admin node .next/standalone/server.js   # perlu salin .next/static ke .next/standalone/.next/static dulu (sama seperti Dockerfile)
```

### Backend (Dias)
```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
python -m pytest tests/integration/test_classroom_contract.py -q        # 11 PASS
MOMO_DB_PATH=/path/ke/momo.sqlite CORS_ORIGINS=http://localhost:3344 \
  uvicorn backend.app.main:app --host 127.0.0.1 --port 8000           # server (terverifikasi lokal)
python tests/integration/verify_backend.py "$PWD" /tmp/backend_verify.json   # 20 PASS, bobot asli
```
Model default: `weights/model_4_mobilenetv2_best.keras` (env `MODEL_PATH`). Database default: `backend/data/momo.sqlite` (env `MOMO_DB_PATH`). `config.py` membuat folder `data/` dan `output/` di root saat diimpor. Hapus keduanya bila tidak diperlukan.

### Caddy (reverse proxy)
```bash
SITE_ADDRESS=:8080 caddy run --config deploy/Caddyfile --adapter caddyfile
```
Caddyfile memakai nama host `backend` dan `admin`, serta root `/srv/game`. Di luar Compose, petakan nama tersebut ke localhost dan tautkan `/srv/game` ke `frontend/implementation/out`.

### Compose terintegrasi
```bash
cp .env.example .env     # isi PUBLIC_URL. Jangan commit .env
docker compose config -q                   # PASS
docker compose up -d --build               # BLOCKED di lingkungan pengujian (daemon Docker tidak ada)
```

### E2E classroom
```bash
# DB sementara, lalu backend di 8000, admin di 3002, dan game melalui Caddy di 8080
E2E_TEACHER_PASSWORD='<password-uji>' python tests/integration/seed_e2e.py /tmp/e2e.sqlite tok-e2e-1
cd frontend/implementation
GAME_BASE=http://localhost:8080 JOIN_TOKEN=tok-e2e-1 DB_PATH=/tmp/e2e.sqlite \
  TEACHER_PASSWORD='<password-uji>' API_BASE=http://localhost:8080 ADMIN_BASE=http://localhost:8080/admin \
  PYTHON=python3 E2E_OUT=/tmp/e2e-out node e2e/classroom-e2e.mjs
```

## Endpoint

Daftar lengkap: [`contracts/API_INVENTORY.md`](contracts/API_INVENTORY.md). Skema OpenAPI: [`contracts/openapi.json`](contracts/openapi.json).

- Join kelas: `GET /api/join/{token}`, `POST /api/join/{token}/students`. Respons join berisi `student_session_token` (berlaku 8 jam).
- Submission: `POST /api/submissions` dengan `Authorization: Bearer <token>` dan `submission_key`. Kirim ulang dengan key yang sama aman (respons `duplicate`).
- Outcome: `PATCH /api/submissions/{id}/outcome` dengan Bearer token pemilik.
- Prediksi: `POST /predict`. Belum butuh auth (lihat risiko).

## Environment

- `.env.example` hanya berisi contoh. Tidak ada secret di repo.
- `CORS_ORIGINS` (backend): daftar origin yang boleh memanggil API, dipisah koma. Di Compose diisi dari `PUBLIC_URL`. Default untuk pengembangan lokal sudah termasuk port 3344, 3002, dan 3000.
- `NEXT_PUBLIC_*` terlihat oleh siapa pun yang membuka halaman. Jangan taruh secret di sana.

## Keamanan dan data

- Database SQLite menyimpan data siswa dan kelas. Jangan commit `backend/data/`, `*.sqlite`, atau salinan database nyata.
- Token sesi siswa disimpan sebagai SHA-256. Token sesi admin masih disimpan mentah (lihat `UNRESOLVED.md`).
- Kebijakan: kamera siswa tidak di-stream ke backend. Hanya stroke yang dikirim.
- `keras.load_model(..., safe_mode=False)` di `backend/app/inference.py` dapat mengeksekusi kode dari file model. Muat hanya bobot tepercaya.

## Alur kelas

1. Guru membuat kelas di dashboard. Link kelas memakai `?kelas=<token>`. Game juga menerima `join` dan `join_token`.
2. Siswa membuka link. Game memanggil `GET /api/join/{token}`.
3. Siswa memilih nomor absen. Game memanggil `POST /api/join/{token}/students` dan menyimpan `student_session_token`.
4. Siswa menggambar. Game memanggil `POST /predict` dan menampilkan Top-3 dengan confidence.
5. Siswa memilih Accept, Correct, atau Override. Keputusan masuk outbox dan dikirim ke `POST /api/submissions`. Gagal jaringan dicoba ulang dengan backoff dan key yang sama.
6. Gameplay outcome dikirim ke `PATCH .../outcome` setelah submission diterima.
7. Guru melihat jumlah jawaban per murid di dashboard.

Saat di luar kelas (tanpa join), keputusan tidak dikirim.

## Kerja lintas owner

- Satu fitur, satu branch pendek, PR, CI, dan review silang.
- Perubahan kontrak (`contracts/`) butuh persetujuan Can dan Dias.
- Perubahan tampilan atau gameplay Can dikonsultasikan ke Can.
- Satu `CHANGELOG.md` di root. Arsip lama di `docs/history/`.

## Troubleshooting

- **Build game gagal dengan path aset:** gambar dan SVG desain ada di `contexts/can/design/`. Test `icon-gestures` memakai path itu.
- **Import Python dari root:** jalankan dari root repo, bukan dari `backend/`.
- **`config.py` membuat `data/` dan `output/`:** dibuat saat diimpor. Hapus setelah tes.
- **Kiriman submission gagal 401 setelah lama:** token sesi siswa berlaku 8 jam. Siswa bergabung ulang.
- **Admin kosong atau error chunk:** build admin dan proses server harus dari build yang sama. Restart proses setelah rebuild.
- **CORS ditolak:** tambahkan origin ke `CORS_ORIGINS`. Di Caddy (same-origin) tidak perlu.
- **LFS:** repo tidak memakai Git LFS. Bobot adalah binary biasa (ukuran sampai 53 MB per file).

## Referensi

- Laporan dan bukti: `docs/migration/`
- Kontrak: `contracts/`
- Governance: `contexts/can/`, `contexts/dias/`
