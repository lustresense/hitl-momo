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
