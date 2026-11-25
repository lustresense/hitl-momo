# Setup DEV monorepo

## Scope dan batas
Snapshot ini berisi source game, admin, backend serta model dan label Dias DEV. Root repo sama untuk semua komponen; prosesnya berbeda. STT Lab saat ini layanan eksperimen terpisah di VM dan **tidak termasuk** snapshot ini. Clone tidak membawa database, user admin, secret, konfigurasi Cloudflare atau build hasil mesin lain. Kesamaan runtime tidak dijamin sampai diuji di laptop tujuan.

## Routing DEV teramati di WSL

| Komponen | Port/bind DEV | Sumber |
|---|---|---|
| Caddy | 127.0.0.1:5555 | `frontend/implementation/out/` untuk halaman game |
| Backend FastAPI | 127.0.0.1:5800 | `backend/` |
| Admin Next.js | 127.0.0.1:5802 | `frontend/admin/`, base path `/admin` |
| STT eksperimen | 127.0.0.1:5877 di WSL melalui SSH menuju VM | tidak disertakan |

Caddy route: `/api/*`, `/predict`, `/health` ke backend; `/admin*` ke admin; path lain ke static export game, dengan fallback `index.html`. Route `/stt-lab` dan `/api/stt/*` menuju STT eksternal, tidak tersedia pada clone ini. Tunnel DEV meneruskan ke Caddy; jangan salin kredensial atau konfigurasi tunnel ke repo.

## Model Dias

Backend default membaca `weights/model_4_mobilenetv2_best.keras`, dengan label `weights/model_4_mobilenetv2.labels.json` di sebelahnya. `backend/app/inference.py` memakai root repo secara default; `WEIGHTS_DIR` dan `MODEL_FILE` hanya override. Jangan set `WEIGHTS_DIR` ke cache WSL lama di laptop.

SHA-256 model `ecd1638605ecdd61596bb518d80771af444e2698670a2babf16c109ac71d69bc`; JSON `e687804d8498a302065f025f32220dcb984f270684aaae817185877fc8cb0553`. DEV aktif membaca model dari `weights/` dalam checkout monorepo.

## Menjalankan lokal dengan port DEV

Dari terminal Linux atau WSL Ubuntu, clone branch `main` lalu masuk root repo. Prasyarat: Git, Python 3.12 dengan modul venv, Node.js 22 (diuji 22.23.4) beserta npm, dan Caddy 2. Python 3.11 tidak cocok dengan NumPy yang dipatok; Python 3.14 tidak cocok dengan TensorFlow yang dipatok. Pastikan perintah berikut tersedia sebelum lanjut:

```bash
git --version
python3.12 --version
node --version
npm --version
caddy version
git clone https://github.com/lustresense/hitl-momo.git
cd hitl-momo
```

Jika Ubuntu belum punya Python 3.12/venv atau Caddy, instal melalui package manager atau dokumentasi resminya sesuai distro. `npm ci` memasang node_modules dari lockfile, tidak perlu disalin dari mesin lain. Jalankan tiap service di terminal terpisah; semua perintah `cd` berikut dimulai dari root repo.

1. Backend:

```bash
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 127.0.0.1 --port 5800
```

2. Game, build satu origin lokal:

```bash
cd frontend/implementation
npm ci
NEXT_PUBLIC_PREDICTION_MODE=partner NEXT_PUBLIC_PREDICTION_ENDPOINT=http://127.0.0.1:5555/predict NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:5555 npm run build
```

3. Admin, dari root pada terminal lain:

```bash
cd frontend/admin
npm ci
NEXT_BASE_PATH=/admin NEXT_PUBLIC_API_URL=http://127.0.0.1:5555 NEXT_PUBLIC_GAME_URL=http://127.0.0.1:5555 npm run build
NEXT_BASE_PATH=/admin npm run start -- -p 5802
```

4. Jalankan Caddy memakai konfigurasi DEV yang tercatat di repo. Dari root repo:

```bash
export GAME_ROOT="$(pwd)/frontend/implementation/out"
caddy validate --config deploy/Caddyfile.dev --adapter caddyfile
caddy run --config deploy/Caddyfile.dev --adapter caddyfile
```

Buka http://127.0.0.1:5555/. Jalur `/stt-lab` dan `/api/stt/*` diarahkan ke `127.0.0.1:5877`, sama dengan DEV. STT merupakan layanan terpisah dan tidak termasuk clone; tanpa layanan itu jalur STT tidak berfungsi. `deploy/Caddyfile` tetap untuk Docker, jangan ditukar dengan Caddyfile DEV.

Buat admin lokal dari root menggunakan `.venv/bin/python backend/create_superadmin.py --email <email> --name <nama>` dan masukkan password melalui prompt. Data admin dan database tidak ikut clone.

**Status verifikasi:** clone bersih WSL, Python 3.12, instalasi backend, load dan prediksi model, npm ci serta build game dan admin berhasil. Routing Caddy, login dan alur gameplay pada clone bersih belum diuji end-to-end. Isi database, akun, URL publik, state browser, dependency, OS dan build flags dapat memengaruhi hasil. Jangan menyatakan identik hanya karena source dan model sama. Perubahan tunnel/production butuh izin terpisah.
