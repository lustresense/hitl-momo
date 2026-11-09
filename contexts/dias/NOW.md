# Dias — Status kerja (snapshot)

**As of:** 2026-11-09. Snapshot integrator, bukan keputusan Dias.
**Source:** `MuhammadDias/HITL` @ `81bab5eba9364d1daede82a5904c1a6e31f3553a`

## Status

| Item | Status | Bukti |
|---|---|---|
| Backend import dan endpoint dasar | PASS | `tests/integration/verify_backend.py`, 16 PASS |
| Model asli dimuat dan menghasilkan top-3 | PASS | `REAL_MODEL` |
| Admin typecheck dan build | PASS | log lokal |
| Dockerfile backend dan admin | NOT_TESTED (daemon Docker tidak ada) | — |
| Server uvicorn live | NOT_TESTED | — |
| Kontrak dengan client Can | FAIL | `tests/integration/probe_client_contract.py` |
| Training | tidak dijalankan (manual) | — |

## Blocker untuk Dias

1. Kontrak submission belum cocok dengan client Can. Perlu keputusan bersama.
2. CORS dan auth submission perlu ditinjau.
3. Docker build perlu dijalankan di mesin yang punya daemon.

## Next action

- Dias menentukan apakah `/api/submissions` menerima `join_token`, `student_id`, dan `candidates` seperti sekarang, atau kontrak berubah.
- Dias menentukan kebijakan CORS.
- Setelah kontrak sepakat, jalankan ulang `tests/integration/probe_client_contract.py` dan verifikasi bahwa hasilnya `PASS`.
