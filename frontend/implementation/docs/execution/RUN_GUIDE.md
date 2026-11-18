# Run guide

Requirements: Node ≥ 20 (frontend Dockerfile saat ini menggunakan node:20-alpine), a Chromium for E2E (`CHROMIUM_PATH`, or `/opt/pw-browsers/chromium`), ffmpeg compatible with playwright-core only if you want video.

```bash
cd frontend/implementation
npm ci
npm run dev                          # http://localhost:3000 (MOCK predictions, DEV banner)
NEXT_PUBLIC_TEST_HOOKS=0 npx next build   # static export -> ./out (any static host; deploy at domain root)
```
Quality gates: `npx vitest run` · `npx tsc --noEmit` · `npx next lint` · build above.

E2E (all serve `./out`, so build first; trusted mouse/keyboard only):
```bash
node e2e/normal-journey.mjs   # Onboarding -> L1 -> L2 -> L3 -> Summary + video (set NO_VIDEO=1 to skip)
node e2e/recovery-paths.mjs   # fall->retry->win, hazard->Redraw->reposition->win
node e2e/mediapipe-probe.mjs  # fake-camera MediaPipe init/lifecycle (not real hands)
node e2e/probe-l1-physics.mjs # trajectory probe (diagnostic)
node e2e/run.mjs              # legacy hook-based functional suite (starts next dev with TEST_HOOKS=1)
```
Evidence lands under `docs/execution/evidence/`. Real partner mode: copy `.env.example`, set `NEXT_PUBLIC_PREDICTION_MODE=partner` + endpoint **only after** the contract is agreed (see `PARTNER_CONTRACT_ACTUAL.md`).

## Owner handoff update 2026-11-15 (0.17.0-alpha source / documentation sync 0.17.1-alpha)
- Runtime Next.js ini memasang dependency dari `package.json` dan `package-lock.json` dengan `npm ci`; **jangan** jalankan `pip install -r frontend/implementation/requirements.txt`. File requirements frontend adalah penjelas untuk Ujang.
- Untuk Ujang, dari root repository: `bash frontend/implementation/scripts/ujang-verify-web.sh`. Urutannya `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`.
- Sesudah lolos, ulangi E2E relevan termasuk cover, penggaris, Card 1, Card 3, gesture icons, fallback kamera, dan perjalanan game menggunakan browser nyata. Kemudian validasi webcam USB via `/nui-lab` untuk low-light/backlight dan false-trigger.
- Commit di `ujang-monorepo` tidak otomatis membuat web ter-deploy; hanya Ujang yang menangani instalasi, deployment, HTTPS dan URL. Owner cukup membuka situs setelah ada bukti.
- Evidence commit `cebbaa4` adalah `STATIC_ONLY`/`NOT_TESTED`. Build/E2E/webcam/deployment harus dilaporkan terpisah.

## Verifikasi REV-B04 0.18.0-alpha (belum dijalankan)

Dari repo root `python3 scripts/bump_version.py --check`. Dari `frontend/implementation` jalankan `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, dan `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`. Berhenti bila ada satu gate gagal, perbaiki dulu. Untuk QA, serve static `out/` dengan host yang menangani direct URL `/onboarding/cam`, lalu cek root -> loader -> cover dan direct refresh, Back/Forward, satu camera card, bubble mobile/desktop. Uji `/nui-lab` dan kamera USB nyata untuk wave, face occlusion, lampu atas/backlight/low-light, FPS efektif, on/off x10 serta izin kamera ditolak; lihat matriks pada `REV-B04-0.18.0-alpha.md`.

**Status sekarang:** GitHub source / tests staged, `STATIC_ONLY`. Perintah ini belum dieksekusi. Ujang pemilik npm, browser, kamera fisik, server dan deploy. `main` tidak tersentuh; Card 3 tetap 0.17.1-alpha.

## Verifikasi koreksi B04-004 kamera ON → Momo bangun (0.18.1-alpha)

Sesudah `npm ci`, `npm run typecheck`, `npm run lint`, `npm test` dan `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`, uji lewat tunnel dev menggunakan browser nyata dengan **test hooks OFF**. Saat masuk `/onboarding/cam`, kamera harus OFF dan Momo tidur. Setelah user ON dan izin diberikan serta stream playable, Momo harus bangun dan kamera card asli morph ke PIP **tanpa waving**. Pastikan Momo mengatakan seluruh kalimat sebelum jempol `Aku mengerti` dan baru berpindah ke penggaris ketika buku mencapai midpoint.

Kasus negatif wajib adalah permission denied, browser tanpa kamera, video playback error, OFF selama permission prompt, ON/OFF cepat, unmount/pagehide, stream ended, direct refresh dan dua kamera. Tidak boleh auto-wake hanya karena click, tidak boleh membuka kamera otomatis selama loader. Fallback pointer/mouse tetap dapat dipakai tanpa webcam. Kamera card visual Claude dan mapping Card3 versi 0.17.1-alpha harus sama. Lampirkan screenshot/video, hasil test, SHA deploy dan URL. Sumber: D-20261115-03, `REV-B04-0.18.1-alpha.md`. Status source pada pembuatan catatan ini `STATIC_ONLY`.

## Alat audit gameplay (2026-11-16)
- Overlay collider: `NO_VIDEO=1 SHAPE=free LEVELS=1 OUT=<dir> node e2e/collider-audit.mjs` (pink = objek, biru = tanah, hijau = bendera, oranye = pemain; screenshot polos dan overlay). Satu bab per run.
- Papan petunjuk: `OUT=<dir> node e2e/signpost-shot.mjs`.
- Satu bab saja: `UNLOCK_ALL=1 LEVELS=2 NO_VIDEO=1 node e2e/normal-journey.mjs`.
- Rencana level: `e2e/lib/level-plans.json` (tiap siklus membawa `w`,`h`); jaga dengan `npx vitest run tests/game`.

## NUI Lab integrated into main 0.21.0-alpha (2026-11-16)
- Entry pages in the existing Next.js static-export build are `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics`. No branch-specific deployment configuration needed if Ujang deploys `main`.
- Source and gesture action mapping are shared with the game: pinch Coret, five extended fingers Hapus (not fist), 1-finger Undo, 2-finger Redo. Lab has full-frame hand lock and manual relock; webcam browser testing not yet run.
- Use `NUILAB_MAIN_HANDOFF_2026-11-16.md` for static export, deep-link, build, device permission and hard-case validation. Status at source push: STATIC_ONLY / NOT_TESTED.

## NUI Lab 0.22.0-alpha (P0-P2 Auto-Lock source only, 2026-11-16)
- `main` routes unchanged: `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas` and `/nui-lab/diagnostics`.
- Experimental classifier toggle is lab-only; MediaPipe hand_landmarker.task and game drawing defaults untouched. Lock automatically resets only after ≥2 empty detection samples across ≥300 ms; crossing and bystander scenarios require real tests.
- Handoff: `NUILAB_AUTOLOCK_HANDOFF_2026-11-16.md`; status STATIC_ONLY/NOT_TESTED until Ujang QA (typecheck/lint/Vitest/Next build/webcam/tunnel).
