# NOW.md — Status integrasi bersama

## Snapshot per 2026-11-15 (status terbaru bagi implementasi Can)
- **Can source:** `ujang-monorepo` commit `cebbaa4797c963da80090d54728a5b0e39c811e4`, global `0.17.0-alpha`, dengan patch 0.16.1 dan 0.17.0 (NUI/gesture, SVG original, Momo recovery, BookFlip, instalasi). `main` tetap `56bdc2e4b430f80af6b196825d7748d9abb882d5` dalam verifikasi terakhir.
- **Evidence:** `STATIC_ONLY` dari GitHub. Tidak ada verifikasi CI, typecheck, lint, unit, build, E2E, USB webcam maupun deployment pada commit terbaru. Hasil integration lama di bawah berlaku pada tanggal dan SHA masing-masing, bukan klaim untuk versi 0.17.0.
- **Product truth:** `contexts/can/DECISIONS.md` D-20261115-01 menetapkan artwork ikon custom; D-20261115-02 menandai konflik mapping Card 1/Card 3 dengan keputusan lama sebagai belum dikunci. Task R15-01..06 di `contexts/can/REVISIONS.md`.
- **Owner's process:** hanya `ujang-monorepo` untuk perubahan ChatGPT; `main` jangan disentuh. Ujang bertugas install/test/deploy, Owner cukup membuka web setelah URL diverifikasi.
- **Next action:** Ujang menjalankan `frontend/implementation/scripts/ujang-verify-web.sh` lalu browser/physical-camera acceptance dan deployment; tidak perlu menambah paket pip ke frontend Next.js.


**As of:** 2026-11-09 · **Status:** `LOCAL_STAGING` (branch `claude-monorepo` di atas `can`; belum dirilis, belum dideploy)
**Can source:** `d4bbaec` · **Dias source:** `81bab5e` · Bukti: `docs/migration/INTEGRATION_REPORT.md`

| Komponen | Owner | Status | Kelas bukti |
|---|---|---|---|
| Game siswa (typecheck, unit, build) | Can | PASS: 681 unit test | UNIT_ONLY |
| Gameplay HITL (normal-journey, recovery) | Can | PASS | MOCK_MODEL |
| Alur classroom end-to-end (join → predict → submit → DB → dashboard) | Bersama | PASS 17/17, langsung dan via Caddy | REAL_MODEL |
| Kontrak submission (fixture dua sisi) | Bersama | PASS: Python 11, Can 3 | UNIT_ONLY |
| Idempotensi submission | Dias | PASS: retry dijatuhkan lalu `duplicate` | REAL_MODEL |
| Identitas sesi siswa dan CORS | Dias | PASS (401, 403, CORS asing ditolak) | UNIT_ONLY + runtime |
| Backend FastAPI + inferensi | Dias | PASS: probe 20/20 | REAL_MODEL |
| Dashboard admin (build, login, kelas) | Dias | PASS | REAL_MODEL |
| Caddy (routing) | Bersama | PASS dengan Caddy 2.10.2 asli | runtime |
| Docker Compose | Bersama | `config` PASS; build image BLOCKED | STATIC_ONLY |
| Training | Dias | tidak dijalankan (manual) | — |

## Keputusan yang belum disepakati
1. **Perubahan kontrak** (token sesi wajib, `submission_key` wajib, outcome aktif): dilakukan atas instruksi pemilik. Persetujuan formal Can dan Dias belum ada.
2. **Logika game ke backend** (permintaan pemilik): konflik dengan keputusan produk. Belum dikerjakan (`UNRESOLVED.md` U1).
3. **`prediction_id`** belum dihasilkan backend. Kolom tersimpan `NULL`.

## Blocker
- Daemon Docker tidak tersedia. Build image dan `compose up` belum dibuktikan.
- Outcome gameplay dari browser belum diuji E2E.

## Next action
1. Can dan Dias meninjau perubahan kontrak di `contracts/API_INVENTORY.md`.
2. Build dan jalankan image Docker di mesin dengan daemon.
3. Tambahkan E2E untuk outcome gameplay dari browser.
