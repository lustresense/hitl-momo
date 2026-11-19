# Migrasi repo Dias ke monorepo: apa yang diubah dan langkah selanjutnya

**Untuk:** Can dan Dias · **Tanggal:** 2026-11-19 · **Versi:** `0.29.1-alpha` di `main`

Dokumen ini merangkum semua yang berubah sejak `main@68a7d9a` (`0.27.0-alpha`, sebelum migrasi), cara memastikan project berjalan, dan pekerjaan yang masih harus dilakukan oleh masing-masing. Detail audit per file ada di [`README.md`](README.md) dan [`MANIFEST.csv`](MANIFEST.csv).

Persetujuan: Dias menyampaikan bahwa Can dan Dias sudah menyetujui perubahan file di kedua sisi (2026-11-19). Persetujuan ini belum tercatat di `contexts/can/DECISIONS.md`.

---

## 1. Ringkasan dalam lima kalimat

1. Semua pekerjaan dari repo `MuhammadDias/HITL` (commit `94120d4`, 754 file) sudah dipindahkan ke repo ini. Setiap file punya status di `MANIFEST.csv`, dan tidak ada yang hilang.
2. Repo ini sekarang satu-satunya tempat pengembangan. `MuhammadDias/HITL` hanya dibaca sebagai arsip.
3. Fitur baru dari Dias aktif: script training enam arsitektur, label model dari file `.labels.json`, dan **kesulitan AI per level** (Bab 1 = 0, Bab 2 = 40, Bab 3 = 70).
4. Game, backend, dan dashboard diuji bersama di browser: E2E kelas 19/19 lulus dengan model asli.
5. Belum di-deploy. Build Docker belum diuji karena Docker tidak tersedia di mesin pengujian.

---

## 2. Riwayat commit di `main`

| Commit | Versi | Isi |
|---|---|---|
| `4708fe2` | — | Arsip byte-exact 51 file Dias yang belum ada di riwayat monorepo, patch edit Dias di area Can, script manifest |
| `a746d05` | — | Script training dan evaluasi Dias (`train/`), `config.py`, `utils.py` |
| `0339cf1` | — | Backend: label dari `.labels.json`, kesulitan AI (mula-mula mati) |
| `7405a9a` | — | Dashboard: halaman `/admin/kesulitan` |
| `143b03a` | — | Dokumen, bukti evaluasi, dan panduan setup Dias di `contexts/dias/` |
| `023d061` | 0.28.0 | Kontrak API, tes baru, versi |
| `6675b73` | — | `MANIFEST.csv` |
| `b6554aa` | — | Status migrasi: di `main` |
| `7be2030` | 0.28.1 | Kesulitan AI menyala di backend (keputusan Dias) |
| `e3e74bf` | 0.29.0 | Kesulitan AI per level aktif penuh: game mengirim `levelId`, default level aktif, CORS |
| (commit ini) | 0.29.1 | Perbaikan cek E2E label, README dan dokumen ini |

---

## 3. Apa yang diubah, per area

### 3.1 Training dan model (Dias)

| File | Perubahan |
|---|---|
| `train/03`–`08_*.py` | Baru di monorepo: Custom CNN, EfficientNet-B0, SqueezeNet, (06 MobileNetV2 sudah ada), ResNet-18, SketchNN |
| `train/compare_models.py`, `evaluate_model.py`, `evaluate_legacy_models.py` | Baru: perbandingan dan evaluasi model |
| `train/train_all_models.sh`, `train_in_docker.sh`, `evaluate_in_docker.sh` | Baru: training/evaluasi di container GPU |
| `train/01_download_dataset.py`, `02_preprocess_data.py` | Versi Dias: unduh kategori baru, preprocessing hemat RAM |
| `config.py` | `CATEGORIES` sekarang 20 kategori baru untuk game (tangga, jembatan, kaktus, …) dengan label Indonesia di `LABELS_ID`. Kategori model lama disimpan sebagai `LEGACY_CATEGORIES` |
| `utils.py` | Versi Dias |
| `weights/` | **Tidak berubah.** Keenam file identik dengan repo Dias |

Tidak ada training yang dijalankan selama migrasi.

### 3.2 Backend (Dias)

| File | Perubahan |
|---|---|
| `backend/app/inference.py` | Label output model dibaca dari `<model>.labels.json`. Kalau file itu tidak ada (kondisi sekarang), dipakai `LEGACY_CATEGORIES`, sehingga model sekarang tetap memberi label yang sama seperti sebelumnya. Backend menolak start bila jumlah label tidak sama dengan jumlah output model |
| `backend/app/difficulty.py` | Baru. Kesulitan per level: confidence diratakan (temperature), dan pada sebagian gambar label yang mirip dinaikkan ke peringkat 1, dengan jawaban asli model di peringkat 2. Hasilnya tetap sama untuk gambar yang sama (deterministik). Default: Bab 1 = 0, Bab 2 = 40, Bab 3 = 70, semua aktif. Flag `AI_DIFFICULTY_ENABLED` |
| `backend/app/main.py` | `/predict` menerima `levelId` opsional. Kalau kesulitan efektif 0 (tanpa level, level dimatikan, atau flag mati), dipakai jalur model mentah yang sama persis seperti sebelumnya. CORS mengizinkan header `X-Contract-Version` yang dikirim game |
| `backend/app/db.py` | Tabel baru `level_difficulty` (dibuat otomatis, tidak mengubah tabel lama) |
| `backend/app/dashboard.py` | `GET /api/settings/difficulty` (login), `PUT /api/settings/difficulty` (superadmin). Respons GET berisi `active` |
| `backend/tests/blackbox.py`, `run_tests_in_docker.sh` | Tes black-box Dias. Kasus 7 disesuaikan ke kontrak token sesi + `submission_key` |

Yang tetap dari monorepo dan **tidak** diganti versi lama Dias: token sesi siswa, submission idempoten, endpoint outcome, CORS dari `CORS_ORIGINS`, batas 20.000 titik di `/predict`.

### 3.3 Dashboard (Dias)

- Halaman baru `/admin/kesulitan` (menu "Kesulitan AI"). Superadmin mengatur on/off dan nilai 0–100 per bab, dengan pratinjau efeknya.
- Pengaturan yang disimpan di halaman ini selalu mengalahkan nilai default di kode.
- Halaman memberi tahu bila flag backend mati.

### 3.4 Game (Can)

Kode sumber game **tidak diubah**. Yang berubah hanya konfigurasi build:

| File | Perubahan |
|---|---|
| `frontend/implementation/Dockerfile` | `NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1`: game mengirim `levelId`, `attemptId`, `contractVersion` dan header `X-Contract-Version` ke `/predict`. Fitur ini sudah ada di game sejak sebelumnya (`partner-http-provider.ts`), hanya dinyalakan |
| `frontend/implementation/package.json` | Hanya nomor versi (kebijakan versi tunggal) |
| `frontend/implementation/e2e/classroom-e2e.mjs` | Cek "UI menampilkan label dari server" sekarang membandingkan lewat `src/prediction/label-map.ts` (misalnya `car` → "Mobil"). Cek lama gagal karena menganggap label tampil persis seperti dari model |

Edit Dias di kode game (`levels.ts` dengan label Indonesia model baru, `Icon.tsx`, `TutorialBrochure.tsx`, dan 5 tes) **tidak** di-port, karena membutuhkan model baru yang belum ada (lihat §6, langkah D1/C1). Patch-nya ada di `contexts/dias/archive/source-94120d4/`.

### 3.5 Deployment dan konfigurasi bersama

| File | Perubahan |
|---|---|
| `docker-compose.yml` | Backend: `AI_DIFFICULTY_ENABLED: ${AI_DIFFICULTY_ENABLED:-1}`. Game: `NEXT_PUBLIC_PREDICTION_SEND_CONTEXT: ${PREDICTION_SEND_CONTEXT:-1}` |
| `.env.example` | `AI_DIFFICULTY_ENABLED=1`, `PREDICTION_SEND_CONTEXT=1` |
| `.gitignore` | `.train-home/`, `.eval-home/` (cache training Docker) |

### 3.6 Kontrak API (bersama)

Semua perubahan bersifat **aditif**: tidak ada field yang dihapus atau dijadikan wajib.

| Endpoint | Perubahan |
|---|---|
| `POST /predict` | Request: `levelId`, `attemptId`, `contractVersion` opsional. Respons: tetap `candidates` (tepat 3, terurut), ditambah `difficulty: {levelId, value}` |
| `GET /api/settings/difficulty` | Baru (dashboard) |
| `PUT /api/settings/difficulty` | Baru (superadmin) |

Dicatat di `contracts/API_INVENTORY.md`; `contracts/openapi.json` diekspor ulang dari aplikasi (19 path). Validator game (`validation.ts`) menerima respons baru; ini dicek langsung dengan respons Bab 3 dari backend.

### 3.7 Dokumentasi

- `contexts/dias/README.md`, `NOW.md`: peta sumber dan status Dias yang baru, termasuk panduan setup.
- `contexts/dias/docs/`: dokumentasi teknis, diagram, usulan label level, panduan deploy, changelog Dias (v0.6–v0.8).
- `contexts/dias/evidence/`: hasil training enam arsitektur dan evaluasi dari server (13 Nov), evaluasi model lama.
- `README.md` root: perintah jalan lokal, tabel tes dan konfigurasi diperbarui.
- `NOW.md`, `CHANGELOG.md`, `contracts/API_INVENTORY.md`, `docs/architecture/README.md` §8a, `docs/migration/UNRESOLVED.md` (catatan persetujuan).

---

## 4. Bukti bahwa project berjalan

Diuji pada `main` sebelum commit ini (`e3e74bf`), plus perbaikan cek E2E di commit ini. Python 3.12 + TensorFlow 2.21 (CPU), Node 20.20.2, Chromium headless.

| Cek | Hasil | Kelas |
|---|---|---|
| Backend `pytest tests/integration` (flag mati dan menyala) | 21/21 | UNIT + REAL_MODEL |
| `verify_backend.py` (model asli, join, submission idempoten, outcome, auth, CORS) | 20/20 | REAL_MODEL |
| `blackbox.py` via uvicorn | 10/10 | backend E2E |
| **E2E kelas penuh di browser** (`classroom-e2e.mjs`): link kelas → join → gambar → `/predict` asli dengan `levelId` → Top-3 → Terima → submission (retry dijawab `duplicate`) → database → dashboard guru | **19/19** | E2E, REAL_MODEL |
| Backend live, tiga level dengan body persis seperti dari game | Bab 1 = 0, Bab 2 = 40, Bab 3 = 70; CORS preflight 200 | E2E backend |
| Game `tsc` | 0 error | BUILD |
| Game `next build` dengan `SEND_CONTEXT=1` | 24/24 halaman | BUILD |
| Game `vitest` tests/api + tests/prediction | 164/164 | UNIT |
| Game `vitest` penuh | 2299 lulus, **22 gagal** (lihat bawah) | UNIT |
| Game `lint` | lulus, 1 warning lama (`react-hooks/exhaustive-deps`) | STATIC |
| Dashboard `tsc` + `next build` (termasuk `/kesulitan`) | lulus | BUILD |
| Build image Docker, `docker compose up`, deploy | **belum diuji** | NOT_TESTED |
| Webcam fisik / MediaPipe | **belum diuji** | NOT_TESTED |

**22 tes game yang gagal bukan akibat migrasi.** Delapan file yang sama gagal dengan 22 tes yang sama persis pada `68a7d9a` (sebelum migrasi). Semuanya di area kamera dan input tangan Can: `tests/camera/global-camera-lifecycle`, `tests/components/components` (GlobalCamera, LevelRibbonBookmark), `tests/components/tutorial-pinch`, `tests/input/drawing-surface-eraser-radius`, `drawing-surface-fixed-eraser`, `eraser-controls`, `hand-stroke-surface`, `two-hand-surface`. Sebagian besar menguji "kepalan menghapus", padahal keputusan terbaru menyatakan kepalan tidak menghapus. Lihat langkah C3.

---

## 5. Cara menjalankan (ringkas)

Lokal tanpa Docker (empat terminal, dari root repo):

```bash
# 1. Backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
python backend/create_superadmin.py --email guru@contoh.test --name "Guru Uji"
AI_DIFFICULTY_ENABLED=1 uvicorn backend.app.main:app --host 127.0.0.1 --port 8000

# 2. Game
cd frontend/implementation && npm ci
NEXT_PUBLIC_PREDICTION_MODE=partner NEXT_PUBLIC_PREDICTION_ENDPOINT=http://localhost:8000/predict \
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1 npm run dev -- -p 3000

# 3. Dashboard
cd frontend/admin && npm ci
NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_GAME_URL=http://localhost:3000 npm run dev   # http://localhost:3002/login
```

Produksi (belum diuji di mesin ini):

```bash
cp .env.example .env      # isi PUBLIC_URL; AI_DIFFICULTY_ENABLED dan PREDICTION_SEND_CONTEXT sudah 1
docker compose up -d --build   # --build wajib: flag game tertanam saat build
```

Tes:

```bash
python -m pytest tests/integration -q
python tests/integration/verify_backend.py "$PWD" /tmp/verify.json
cd frontend/implementation && npx vitest run && npm run typecheck
```

---

## 6. Langkah selanjutnya

### Dias

| # | Tugas | Kenapa |
|---|---|---|
| D1 | **Masukkan model hasil retrain** (`.keras` + `.labels.json`) ke `weights/` dan set `MODEL_FILE`. Catatan: `*.json` di-ignore di repo lama Dias, jadi file label belum pernah ter-commit. Di monorepo `.json` tidak di-ignore | Model di `weights/` masih model lama (apel, mobil, kucing, …). Label baru (tangga, jembatan, kaktus, …) dan daftar label mirip di `difficulty.py` baru berfungsi penuh dengan model baru. Dengan model lama, Bab 3 menukar ke jawaban peringkat 2 dari model itu sendiri |
| D2 | Deploy ulang dengan `docker compose up -d --build`, lalu cek `/health`, `/admin/kesulitan` (banner "aktif"), dan satu permainan per bab | Belum ada yang di-deploy. Build Docker belum pernah diuji |
| D3 | Atur nilai kesulitan sesuai kebutuhan kelas di `/admin/kesulitan` | Default 0/40/70 hanya titik awal |
| D4 | Push commit lokal `94120d4` ke `MuhammadDias/HITL`, lalu tandai repo itu arsip (README "pindah ke hitl-momo") | Commit ini hanya ada di laptop Dias. Isinya sudah di monorepo |
| D5 | Kerjakan berikutnya hanya di `lustresense/hitl-momo` (area `backend/`, `train/`, `weights/`, `frontend/admin/`) | Supaya tidak ada dua implementasi |
| D6 | Risiko lama: auth `/predict`, hash token admin di tabel `sessions`, `load_model(safe_mode=False)` | Masih terbuka di `docs/migration/UNRESOLVED.md` |

### Can

| # | Tugas | Kenapa |
|---|---|---|
| C1 | Setelah model baru masuk (D1): sesuaikan `src/domain/levels.ts` dan `src/prediction/label-map.ts` ke 20 label baru. Usulan Dias ada di `contexts/dias/docs/USULAN-LABEL-LEVEL.md` dan patch `contexts/dias/archive/source-94120d4/frontend-implementation-dias-delta-81bab5e..94120d4.patch` | Sekarang game memetakan label model lama (misalnya `car` → "Mobil") |
| C2 | Catat keputusan "kesulitan AI per level aktif" dan persetujuan perubahan kontrak (A1–A5) di `contexts/can/DECISIONS.md` dengan ID keputusan | Agent tidak boleh mengubah `DECISIONS.md` |
| C3 | Perbaiki atau perbarui 22 tes kamera/input yang sudah gagal sebelum migrasi (§4) | Mereka membuat `vitest` penuh merah dan menutupi regresi baru |
| C4 | Uji di browser bahwa di Bab 3 siswa masih bisa memilih jawaban benar lewat "Pilih lain" saat label mirip ada di peringkat 1 | Bagian dari desain HITL; backend menjamin jawaban asli tetap di peringkat 2 |

### Berdua

| # | Tugas |
|---|---|
| B1 | Uji `docker compose up -d --build` di mesin yang punya Docker, lalu jalankan `classroom-e2e.mjs` lewat Caddy (`GAME_BASE`) |
| B2 | Sepakati cara kerja satu repo: branch per fitur, siapa yang review perubahan di area pemilik lain, dan bahwa kontrak API diubah lewat `contracts/` |
| B3 | Bila model baru masuk, ulangi E2E kelas dan cek label yang tampil di game |

---

## 7. Catatan untuk yang memeriksa

- Persetujuan Can dan Dias disampaikan lewat Dias dalam sesi ini, bukan dicatat langsung oleh Can.
- Angka tes di atas berasal dari mesin pengembang (WSL, tanpa Docker, tanpa GPU), bukan dari server produksi.
- Untuk E2E, pustaka sistem Chromium (`libnspr4`, `libnss3`, `libasound2`) dipasang sementara di luar repo. Tidak ada yang ditambahkan ke repo untuk itu.
