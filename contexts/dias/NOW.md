# Dias — Status kerja (snapshot integrator)

**As of:** 2026-11-09. Snapshot, bukan keputusan Dias.
**Source:** `MuhammadDias/HITL` @ `81bab5e` · branch `claude-monorepo` di `lustresense/hitl-momo`

| Item | Status | Bukti |
|---|---|---|
| Backend: join, submission (token, idempoten), outcome | PASS | `tests/integration/test_classroom_contract.py` (11), `verify_backend.py` (20) |
| Inferensi model asli | PASS | `REAL_MODEL` lewat frontend (E2E) |
| Dashboard: login, daftar kelas, jumlah jawaban | PASS | `classroom-e2e.mjs` |
| CORS dibatasi lewat `CORS_ORIGINS` | PASS | test CORS |
| Admin build dan routing `/admin` lewat Caddy | PASS | Caddy asli |
| Dockerfile backend dan admin | BLOCKED (daemon Docker tidak ada) | — |
| Training | tidak dijalankan | — |

## Yang perlu diputuskan Dias
1. Terima perubahan kontrak submission (`contracts/API_INVENTORY.md`).
2. Kebijakan CORS production (`CORS_ORIGINS`).
3. Auth untuk `/predict`.
4. Token admin disimpan mentah di tabel `sessions`. Pertimbangkan hash.
5. `safe_mode=False` pada `load_model`.
