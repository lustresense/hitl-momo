# Arsitektur — batas komponen

## Runtime

- **Browser siswa:** game Can. Canvas, MediaPipe, KAPLAY, state machine, dan interaksi berjalan di sini.
- **Browser guru:** dashboard admin Dias.
- **Caddy:** satu pintu masuk. Route: `/` (game statis), `/admin` (admin), `/api`, `/predict`, `/health` (backend).
- **Backend FastAPI:** melayani prediksi dan data. Model dibaca dari `weights/`. Data disimpan di SQLite.

Sisi browser bukan server backend kedua. Browser tidak memanggil server Next untuk game. `frontend/api` atau server Next tambahan tidak dibuat.

## Alur data classroom (kondisi staging)

```text
Canvas (game) → normalisasi stroke → POST /predict → Top-3 + confidence
  → Accept/Correct/Override → gameplay lokal di client
  → POST /api/submissions            [GAGAL: kontrak tidak cocok]
  → database SQLite → dashboard admin
```

## Pemisahan kepemilikan

| Lapisan | Owner | Keterangan |
|---|---|---|
| Gameplay, physics, state machine, UI | Can | Di client |
| Kontrak REST | Bersama | `contracts/` |
| Backend, model, DB | Dias | `backend/`, `weights/` |
| Dashboard | Dias | `frontend/admin/` |
| Deployment | Bersama | `deploy/`, `docker-compose.yml` |

## Keputusan yang terkait arsitektur

- Logika game tetap di client (keputusan produk dan kebutuhan offline). Usulan memindah logika game ke backend ditandai konflik di `docs/migration/UNRESOLVED.md`.
- Komunikasi antar aplikasi memakai REST. Tidak ada WebSocket, broker, atau Redis.
- Satu backend, satu SQLite. Migrasi database tidak dilakukan demi estetika monorepo.
