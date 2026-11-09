# INTEGRATION_REPORT — acceptance A01–A18

**Date:** 2026-11-09. **Mode:** local staging. Nothing was pushed, merged, or deployed by the integrator.
**Can source:** `d4bbaec` · **Dias source:** `81bab5e` · Pinned in `SOURCE_MANIFEST.md`.

Legend: `PASS` / `FAIL` / `BLOCKED` / `NOT_TESTED`. Evidence class: `REAL_MODEL`, `MOCK_MODEL`, `UNIT_ONLY`, `STATIC_ONLY`, `NOT_TESTED`.

## Ringkasan

- **PASS:** 11 gate (A01, A02, A03, A05, A06, A07, A08, A10, A12, A13, A16). **FAIL:** 2 (A04, A11). **PARTIAL:** 4 (A09, A14, A17, A18). **NOT_TESTED:** 1 (A15, diblokir A11).
- **Kesimpulan jujur:** staging ini auditable dan sumbernya lengkap. Tetapi **alur classroom belum berfungsi end-to-end** karena kontrak submission tidak cocok. Bukan "siap demo".

## Tabel gate

| ID | Gate | Status | Kelas bukti | Bukti (path / command) |
|---|---|---|---|---|
| A01 | Empat sumber dipin | **PASS** | STATIC_ONLY | `SOURCE_MANIFEST.md`: can `d4bbaec`, Dias `81bab5e`, kandidat `monorepo 7803189`, `test 7c563de`, `main ed5ea60`. Status clean |
| A02 | Zero-loss mapping | **PASS** | STATIC_ONLY | `SOURCE_MAP.csv`: 1981 file sumber, tepat satu baris tiap file, 0 hilang, 0 duplikat. Satu baris tambahan (Dockerfile). Hash target cocok untuk semua baris salinan. Status: `IMPORTED` 1293, `ARCHIVED` 637, `PORT_NEEDED` 50, `REVIEW_REQUIRED` 1, `BLOCKED_SECRET` 1 |
| A03 | Game Can terbaru + tes relevan | **PASS** | UNIT_ONLY | `diff -rq` vs `can`: hanya beda di 1 test (path, dicatat). `npm test`: 100 file, 667 test PASS (`logs/can-test-rerun.log`) |
| A04 | Fitur classroom donor tidak hilang | **FAIL** | UNIT_ONLY + probe | Klien join/submission Can sudah ada (`classroom-client.ts`, `submission-client.ts`, `outbox.ts`). Tetapi kontrak submission ke backend gagal. Lihat A11 |
| A05 | Backend/admin/train/weights Dias utuh | **PASS** | STATIC_ONLY + REAL_MODEL | Hash file sama dengan sumber. Bobot 6 file (SHA di manifest). Backend import dan prediksi dengan bobot asli (A13) |
| A06 | Satu changelog engineering aktif | **PASS** | STATIC_ONLY | Hanya `CHANGELOG.md` root yang aktif. Arsip di `docs/history/can/` dan `docs/history/dias/` |
| A07 | Governance Can bukan global | **PASS** | STATIC_ONLY | `AGENTS.md` root netral. `contexts/can/AGENTS.md` = router + kebijakan asli di bawah pemisah. `contexts/dias/AGENTS.md` dibuat dari source |
| A08 | Tidak ada `CLAUDE.md` baru | **PASS** | STATIC_ONLY | `find . -name CLAUDE.md` kosong. `CLAUDE.md` Can diarsipkan sebagai `docs/history/can/CLAUDE.pre-monorepo.md` |
| A09 | README sesuai repo | **PARTIAL** | — | Perintah game (typecheck, test, build) dan admin (typecheck, build) teruji. Backend uvicorn live **NOT_TESTED**. `npm run e2e` menunjuk ke file LEGACY, ditandai di README |
| A10 | HTTP contract sesuai FastAPI | **PASS** | REAL_MODEL | `contracts/openapi.json` diekspor dari app live (17 path). `API_INVENTORY.md` dibuat dari decorator route |
| A11 | Client–server schema cocok | **FAIL** | probe | `probe_client_contract.py`: payload Can ditolak **422** (kurang `join_token`, `student_id`, `candidates`). `PATCH /api/submissions/{id}/outcome` mengembalikan **404** |
| A12 | Build frontend Can | **PASS** | STATIC_ONLY | `npm run build` exit 0 (`logs/can-build.log`). Typecheck exit 0 |
| A13 | Backend import/tes dan ketersediaan model | **PASS** | REAL_MODEL | `verify_backend.py`: 16/16 PASS dengan bobot asli. Tidak ada suite pytest di repo |
| A14 | Dashboard build dan routing | **PARTIAL** | STATIC_ONLY | `npm run build` exit 0 dan typecheck exit 0. Routing `/admin` lewat Caddy **NOT_TESTED** |
| A15 | Classroom E2E: join → submit → DB → dashboard | **NOT_TESTED** (diblokir A11) | — | Tidak dijalankan karena submit pasti ditolak. Tidak diklaim lulus |
| A16 | Gameplay HITL tidak regresi | **PASS** | MOCK_MODEL | `normal-journey.mjs`: **PASS** 3 level, accept/correct/override dan redraw dengan provider mock. `recovery-paths.mjs`: **PASS** 16/16 (fail jurang, retry, bahaya, redraw). Bukan inferensi nyata |
| A17 | Deployment wiring | **PARTIAL** | STATIC_ONLY | `docker compose config` exit 0 dengan `PUBLIC_URL`. Build image **NOT_TESTED** (daemon Docker tidak tersedia). `deploy/Caddyfile` dibaca, tidak dijalankan |
| A18 | Security dan reproducibility | **PARTIAL** | STATIC_ONLY | Secret scan pola: 0 secret. Hit `TOKEN_KEY` hanya nama konstanta localStorage. Dokumen infra (tunnel, port, SSH) dikarantina sebagai `BLOCKED_SECRET`. Tidak ada symlink atau pointer LFS. Hash ZIP lihat bagian Artefak. Risiko CORS dan submission dicatat |

## Bukti rinci

### Game Can (A03, A12, A16)
- Typecheck: exit 0.
- Unit test: **1 file gagal pada salinan awal** (`icon-gestures.test.tsx`, 4 test). Penyebab: path aset `../design/…` tidak ada setelah `design/` pindah ke `contexts/can/design/`. Setelah path diubah, suite penuh **100 file / 667 test PASS**.
- Build: exit 0. Konfigurasi Node di Dockerfile donor 20; lokal 22. Belum disamakan (lihat UNRESOLVED).
- `normal-journey.mjs` (3 level, provider mock): **PASS**. Log `logs/can-e2e-normal-journey.log`.
- `recovery-paths.mjs` (16 cek): **PASS**. Log `logs/can-e2e-recovery-paths.log`.
- Catatan: `e2e/run.mjs` berstatus LEGACY (tidak dipakai). Warning jsdom `getContext` tidak gagal tes.

### Dashboard Dias (A05, A14)
- `npm ci`, typecheck, dan build exit 0 (`logs/admin-*.log`).
- Tidak ada test unit di admin.

### Backend Dias (A05, A10, A13, A11)
- `pip install -r backend/requirements.txt` exit 0 (TensorFlow 2.21.0, Keras 3.15.1, FastAPI 0.141.1) di Python 3.13.
- Probe dengan bobot asli (`REAL_MODEL`):
  - `/health` 200.
  - `/predict` 200, 3 kandidat, label dari `config.CATEGORIES`, confidence bervariasi dan jumlahnya ≤ 1 (contoh: airplane 0.486, bird 0.270, star …). **Bukan mock.**
  - Classroom: join info 200, join tidak dikenal 404, join siswa 200 (upsert nomor sama mempertahankan `student_id`), submit valid 201, decision tidak valid 422.
  - Auth `/api/auth/me` tanpa login 401.
  - Endpoint PROPOSED (`/api/v1/model-info`, `PATCH .../outcome`) 404 — **tidak ada di backend**, sesuai `API_INVENTORY`.
- Temuan:
  - Retry submission identik menghasilkan **2 baris** (tidak idempotent).
  - `POST /api/submissions` menerima tanpa auth.
  - CORS memantulkan origin apa pun (lihat `API_INVENTORY.md`).
- Log: `logs/backend_verify.json`, `logs/backend_verify.out`.

### Kontrak classroom (A11, A04)
- `probe_client_contract.py` dengan bentuk payload **persis** dari `CreateSubmissionRequest` di Can:
  - `POST /api/submissions` → **422**, field hilang: `join_token`, `student_id`, `candidates`.
  - `PATCH /api/submissions/1/outcome` → **404**.
- Field yang dikirim client tetapi tidak dipakai backend: `submission_key`, `attempt_id`, `prediction_id`, `redraw_count`. Pydantic mengabaikannya, jadi tidak tersimpan.
- Respons: client mengharapkan `{id, status}`, backend mengembalikan `{id}`.

### Deployment (A17)
- `docker compose config -q` exit 0 (`PUBLIC_URL=http://localhost`). Service `backend`, `admin`, `web` punya context dan Dockerfile yang benar.
- Service `web` memakai `frontend/implementation/Dockerfile`. File ini **tidak ada di source Can**, jadi disalin dari Dockerfile Dias (lihat `SOURCE_MAP.csv`).
- Build image dan `docker compose up` **NOT_TESTED**: daemon Docker tidak tersedia di lingkungan ini.

### Keamanan (A18)
- Secret scan pola (AWS, GitHub token, OpenAI-style, private key, Google API key, assignment password/token): **0 hit**.
- Scan IPv4 dan istilah SSH/tunnel: `contexts/can/docs/INFRA_TUNNEL_AND_PORTS.md` berisi port server produksi, path tunnel token, dan VPN. **Dikarantina** keluar dari repo (status `BLOCKED_SECRET`, salinan lokal di luar repo). Pemilik harus memutuskan sebelum dipublikasikan.
- `contexts/can/SECURITY_GATE.md` menyebut CIDR dalam diagram spesifikasi. Dibiarkan, tidak mengandung host.
- `frontend/admin/lib/api.ts` berisi `TOKEN_KEY` (nama konstanta). Bukan secret.
- Tidak ada symlink. Tidak ada pointer LFS. Tidak ada file > 100 MB.
- Artefak build (`node_modules`, `.next`, `out`, `tsbuildinfo`, `data/`, `output/`, `__pycache__`) dihapus dari staging.

## Yang hanya mock

- Prediksi di E2E game (`normal-journey`, `recovery-paths`): provider **mock** deterministik. Ini membuktikan logika gameplay, bukan model.
- Prediksi backend (`/predict`) memakai model asli. Bukti `REAL_MODEL` untuk backend, bukan untuk alur game.

## Bagian yang tidak diuji

- Build image Docker (A17).
- Server uvicorn live dan Caddy sebagai proxy (A09, A17).
- Dashboard di browser (login, kelas, submissions) (A14).
- Alur classroom penuh (A15).
- Perilaku retry outbox ketika server menolak (A11).
- Training ulang model (sengaja tidak dilakukan).

## Artefak

- ZIP staging dan SHA-256: lihat ringkasan jawaban (dikirim sebagai file).
- Branch Git: `claude-monorepo` di `lustresense/hitl-momo` (dipush sesuai izin pemilik; lihat ringkasan).
