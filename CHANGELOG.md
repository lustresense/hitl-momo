# CHANGELOG — Sketchbook Universe Engineering

Satu-satunya changelog engineering yang aktif. Riwayat lama tidak dihapus, hanya diarsipkan:

- Can: `docs/history/can/` (termasuk `implementation-CHANGELOG.md` dan `CLAUDE.pre-monorepo.md`)
- Dias: `docs/history/dias/CHANGELOG.md`

## [Unreleased]

### Can — Student Game
- Staging: game dipindah dari `implementation/` ke `frontend/implementation/` pada SHA `d4bbaec` (`lustresense/hitl-momo`, branch `can`).
- Staging: `frontend/implementation/Dockerfile` ditambahkan dari donor Dias, karena service `web` di Compose membutuhkannya.
- Staging: `contexts/can/` berisi governance Can secara byte-preserved. `AGENTS.md` mendapat router di atas, kebijakan asli tetap di bawah pemisah.
- Staging: path aset di `frontend/implementation/tests/components/icon-gestures.test.tsx` diubah ke `contexts/can/design/` (restrukturisasi, bukan perubahan perilaku).

### Dias — Backend, Model, Admin
- Staging: `backend/`, `frontend/admin/`, `train/`, `weights/`, `deploy/`, `docker-compose.yml`, dan file root diambil dari `MuhammadDias/HITL` pada SHA `81bab5eb`.
- Staging: donor `frontend/implementation/` Dias diarsipkan di `docs/history/dias/frontend-implementation-donor/`. File yang menyentuh classroom ditandai `PORT_NEEDED`.
- Staging: `contexts/dias/` berisi README asli, DEPLOY asli, dan catatan arsip (`notes/`).

### Shared Integration
- Staging: `.gitattributes` Can disalin ke root (berlaku untuk seluruh repo; salinan asli tetap di `contexts/can/`).
- Staging: monorepo dibangun dari dua sumber. Hasilnya ditandai `LOCAL_STAGING`. Belum dirilis dan belum dideploy.
- Staging: `contracts/API_INVENTORY.md` dibuat dari route FastAPI yang benar-benar ada. `contracts/openapi.json` diekspor dari aplikasi live.
- Staging: `docs/migration/` memuat SOURCE_MANIFEST, SOURCE_MAP (1 baris per file tracked), BRANCH_COMPARISON, INTEGRATION_REPORT, dan UNRESOLVED.
- Known: kontrak submission client Can tidak cocok dengan backend (lihat `contracts/API_INVENTORY.md`). Perbaikan belum dilakukan.

## Pre-monorepo history
- Can: `docs/history/can/` (riwayat changelog dan dokumen pra-monorepo).
- Dias: `docs/history/dias/` (riwayat changelog dan dokumen pra-monorepo).
