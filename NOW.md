# NOW.md — Status integrasi bersama

## 2026-11-16 — NUI Lab di `main` (0.21.0-alpha, STATIC_ONLY)
- Instruksi Owner memindahkan NUI Lab dari workflow branch ke URL monorepo aktif agar tunnel dev Ujang tetap menggunakan `main`. Routes `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics` ada di frontend Next.js, tanpa alur game.
- Pemetaan drawing game dan lab: pinch Coret, 5 jari Hapus, satu jari Undo, dua jari Redo; kepalan tidak menghapus. Canvas lab memakai cursor, stroke smoothing, Momo, dan alat fallback mouse/touch.
- FullFrameHandLock lab memilih satu tangan dari semua lokasi frame tanpa face ROI; jika kehilangan/ambigu butuh relock eksplisit. Ini bukan verifikasi biometrik dan tidak mengatasi hilangnya landmark di pinggir frame secara ajaib.
- Integrasi source ke `main` mempertahankan 13 commit gameplay yang ada di `main`; `ujang-monorepo` tidak ditimpa. Belum ada npm/CI/build/webcam/tunnel (`STATIC_ONLY / NOT_TESTED`). Lihat `frontend/implementation/docs/execution/NUILAB_MAIN_HANDOFF_2026-11-16.md`.


## Koreksi Can REV-B04-004 2026-11-15 — Global 0.18.1-alpha (STATIC_ONLY)
- Owner memilih B04-004 opsi B setelah melihat 0.18.0-alpha salah mempertahankan lambaian. **Wake cover:** kamera OFF→user ON→stream playable→Momo bangun/animasi, tanpa kewajiban wave; fallback tanpa kamera masih ada.
- Patch source/tests, keputusan D-20261115-03, M-035 dan handoff terbaru. B04-001..003 dari 0.18.0-alpha tidak diulang. Camera card Claude dan gesture 0.17.1-alpha dipertahankan.
- **Evidence:** `STATIC_ONLY / NOT_TESTED`, bukan build PASS, webcam PASS, browser PASS atau deployed. Ujang wajib menguji melalui tunnel dev ketika gates lolos, `main` tidak disentuh.

## Batch Can REV-B04 2026-11-15 — Global 0.18.0-alpha (STATIC_ONLY)
- **Owner GAS:** source change berdasarkan PRD dan tiket REV-B04-001..004, target `ujang-monorepo`, baseline `24e17c4` versi 0.17.1-alpha.
- **B04-001..003:** warmup setelah intro, readiness gate/awan dan fail-retry, static route `/onboarding/cam` dan bubble Momo CSS, reuse single-owner model wave dengan idle cap; instrumentasi diagnosis. Source/test disiapkan, **BELUM ada build/CI/E2E/webcam/deploy**.
- **B04-004:** mengganti bangun Momo menjadi toggle ON masih pilihan belum disahkan. Wave lama tetap. Kamera card Claude serta gestur Card1/3 versi 0.17.1-alpha tidak diubah.
- **Rujukan:** `contexts/can/REVISIONS.md`, `frontend/implementation/docs/execution/REV-B04-0.18.0-alpha.md`, `CHANGELOG.md`. Ujang tetap pemilik tes, instalasi dan deploy. `main` tidak disentuh.

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
