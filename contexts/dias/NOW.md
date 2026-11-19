# Dias — Status kerja

**As of:** 2026-11-19. Snapshot integrator, bukan keputusan Dias.
**Source:** `MuhammadDias/HITL` @ `94120d4` → branch `integration/dias-repo-migration-20261119` → di-push ke `main` (fast-forward) 2026-11-19 atas instruksi Dias. Belum di-deploy.

| Item | Status | Bukti |
|---|---|---|
| Migrasi seluruh file Dias | 754/754 berstatus, 0 tanpa status | `docs/migration/dias-94120d4/MANIFEST.csv` |
| Backend: join, submission (token, idempoten), outcome, auth | PASS | `pytest tests/integration` 20/20, `verify_backend.py` 20/20 |
| Inferensi model asli | PASS (`REAL_MODEL`, MobileNetV2 default) | `verify_backend.py` |
| Black-box Dias lewat HTTP (uvicorn lokal) | 10/10 | `backend/tests/blackbox.py` |
| Kesulitan AI per level | **Backend ON** di deploy (`AI_DIFFICULTY_ENABLED=1` di compose, keputusan Dias 2026-11-19). Semua level masih mati sampai diatur di `/admin/kesulitan`. Game belum mengirim `levelId` (menunggu Can) | `tests/integration` 20/20 (flag on & off), uji HTTP uvicorn flag on |
| Dashboard build (termasuk `/kesulitan`) | PASS | `tsc` 0, `next build` |
| Script training 6 arsitektur + evaluasi | Dimigrasikan, **tidak dijalankan** | — |
| Docker image build | NOT_TESTED | — |

## Yang perlu diputuskan Dias
1. Serahkan model retrain + `.labels.json` (atau putuskan tetap model lama). Lihat K2.
2. Backend sudah ON (Dias). Can: nyalakan `NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1` di build game atau tidak (K1).
3. Konfirmasi adaptasi `blackbox.py` ke kontrak token (K4).
4. Masih terbuka dari iterasi lalu: kontrak submission, CORS production, auth `/predict`, hash token admin, `safe_mode=False`.
