# NOW.md — Shared Integration Status

**As of:** 2026-11-09
**Status:** `LOCAL_STAGING`. Belum dirilis, belum dideploy, belum direview pemilik.
**Can source:** `lustresense/hitl-momo` branch `can` @ `d4bbaecfdf5d446560c0b4f9c28d90cbde0fa77d`
**Dias source:** `MuhammadDias/HITL` branch `main` @ `81bab5eba9364d1daede82a5904c1a6e31f3553a`

Legenda: `PASS` = dijalankan dan lolos, `FAIL` = dijalankan dan gagal, `NOT_TESTED` = belum dijalankan. Bukti ada di `docs/migration/INTEGRATION_REPORT.md`.

## Status per komponen

| Komponen | Path | Owner | Status | Bukti |
|---|---|---|---|---|
| Game siswa | `frontend/implementation/` | Can | typecheck PASS, unit PASS (667), build PASS, E2E journey PASS (MOCK) | `UNIT_ONLY` + `MOCK_MODEL` |
| Dashboard admin | `frontend/admin/` | Dias | typecheck PASS, build PASS | `STATIC_ONLY` |
| Backend FastAPI | `backend/` | Dias | import PASS, endpoint probe 16/16 PASS dengan model asli | `REAL_MODEL` |
| Inferensi model | `weights/` | Dias | PASS (model asli, probabilitas bervariasi) | `REAL_MODEL` |
| Training | `train/` | Dias | **tidak dijalankan** (manual, sesuai aturan) | — |
| Classroom (client ↔ API) | `api/` ↔ `classroom.py` | Bersama | **FAIL**: payload ditolak 422, outcome 404 | `UNIT_ONLY` + probe |
| Deployment (Compose) | `docker-compose.yml`, `deploy/` | Bersama | `config` PASS; build dan run NOT_TESTED | `STATIC_ONLY` |
| Kontrak REST | `contracts/` | Bersama | inventaris dari route source; `openapi.json` diekspor | `STATIC_ONLY` + live app |

## Keputusan teknis yang belum disepakati

1. **Kontrak submission.** Client Can tidak mengirim `join_token`, `student_id`, dan `candidates`, yang wajib di backend. Client juga memanggil `PATCH .../outcome` yang tidak ada. Perbaikan bisa di sisi Can (adapter) atau di kontrak (butuh Dias). Keputusan belum diambil.
2. **Idempotensi submission.** Retry outbox membuat baris duplikat (terbukti lewat probe).
3. **CORS** `allow_origins=["*"]` dengan credentials. Perlu keputusan Dias.
4. **Permintaan pemilik:** game logic dipindah ke backend. KAPLAY dan physics tidak bisa jalan di server. Ini konflik dengan keputusan produk dan dicatat di `docs/migration/UNRESOLVED.md`.

## Blocker

- Docker daemon tidak tersedia di lingkungan staging, sehingga build image tidak bisa dibuktikan.
- Repo Dias bisa dibaca (publik), tetapi belum ada akses push. Tidak ada perubahan di GitHub dalam fase ini.

## Next action

1. Pemilik memutuskan jalur perbaikan kontrak submission (Can adapter vs kontrak bersama).
2. Build image Docker di mesin yang punya daemon.
3. Uji alur classroom penuh (join → submit → DB → dashboard) setelah kontrak sepakat.

## Evidence

- Pin SHA dan file: `docs/migration/SOURCE_MANIFEST.md`
- Pemetaan file: `docs/migration/SOURCE_MAP.csv`
- Perbandingan branch: `docs/migration/BRANCH_COMPARISON.md`
- Kontrak: `contracts/API_INVENTORY.md`
- Status per owner: `contexts/can/NOW.md`, `contexts/dias/NOW.md`
