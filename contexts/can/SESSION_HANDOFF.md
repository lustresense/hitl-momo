# CAN Agent Session Checkpoint — 2026-11-26

- Di-push ke `main` 2026-11-26 atas perintah Owner, versi `0.32.1-alpha` (commit game `64248dc`). `main` sebelum migrasi tersimpan di branch `backup/main-sebelum-r83`.
- Commit lokal `c8a9cfb`, `f115612`, dan `9b6b0f2` ternyata memiliki tree rusak (entri folder ganda, file admin dan kontrak hilang dari commit; file di disk utuh). Commit itu tidak di-push; riwayat disusun ulang dari index dan dicocokkan dengan disk. Sebelum push, periksa isi commit, bukan hanya `git status`.
- Keputusan baru: D-20261126-01 (tampilan r8.3), -02 (Lewati), -03 (nama ketik tanpa STT/penggaris), -04 (onboarding/tutorial), -05 (pemisahan NUI produk/lab), -06 (tiga tingkat interaksi). Empat keputusan terakhir telah disetujui Owner; revisi ring kursor belum terbukti diimplementasikan. Jangan lanjutkan STT hanya karena stub/routing tersisa. Rekonsiliasi dokumentasi berdasarkan main `4c71664`; tidak ada perubahan kode atau deploy.
- Bukti: tsc 0 error; lint 0 warning; unit tanpa kegagalan baru (38 kegagalan bawaan main; satu tes tampilan lama tidak stabil saat jalan paralel); tes backend 21/21; E2E r83-flow 42/42 (sebelum Alt+Q); telusur penuh hanya dengan Alt+Q sampai ending; cek data skip vs manual dengan model asli. Webcam fisik, klik halaman admin, dan E2E tampilan lama: NOT_TESTED.
- Masih terbuka: revisi Owner yang sedang dikumpulkan, review Dias untuk perubahan backend, backup database sebelum deploy, uji webcam.

# CAN Agent Session Checkpoint — 2026-11-19

This is a short portable handoff for switching Codex, Claude Code and Antigravity accounts. It is **not** a decision log. Always read root `AGENTS.md` and `contexts/can/AGENTS.md`, then check `git branch --show-current`, `git rev-parse HEAD` and `git status --short` before using this snapshot.

- Repository `lustresense/hitl-momo`. Working dir: `/srv/sketchbook/mediapipe-optimize/main-r19` (clone of `main`).
- **Current version:** `0.27.0-alpha` (bumped from `0.26.0-alpha` via `scripts/bump_version.py`).
- **Current task (2026-11-19):** NUI Lab persistent multi-trial benchmark recorder (`IndexedDB` + batched `ChunkWriter` + 1-click JSON/CSV browser export + crash/reload `interrupted` recovery) + R20 `C4`/`C7` CPU-only Web Worker & `A4v2` chroma-preserving low-light integration (preserving `R19 C0` baseline as explicit selectable comparator).
- **Pinned Models (`public/models/`, SHA-256 fail-closed):**
  - `r19-pistol-model.json` (`122,768 B`, sha256 `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293`) — Baseline `R19 C0`
  - `r20-c4-model.json` (`73,275 B`, sha256 `e863ef1afe459a3b0a4cf0b0b2594a1db853b382d669add2d7be234e64710a27`) — Candidate `R20 C4`
  - `r20-c7-t4-model.json` (`73,138 B`, sha256 `66acbde9f73868f8e6afada647a6d513d7efab6252a937bf88dede933147d730`) — Comparator `R20 C7`
- **New/Updated NUI Lab source files in `main`:**
  - `frontend/implementation/src/components/nui-lab/bench/` — 16 modules (`schema`, `engines`, `stats`, `store`, `writer`, `export`, `manager`, `perf-monitor`, `env`, `config`, `canvas-tracker`, `r20-lowlight`, `worker-owner-guard`, `r20-hand.worker`, `r20-worker-client`, `BenchControls`)
  - `frontend/implementation/src/components/nui-lab/{NuiLabPage.tsx,NuiLabPage.css,lab-recorder.ts}`
  - `frontend/implementation/app/nui-lab/page.tsx`
  - `frontend/implementation/tests/nui-lab/{bench-recorder.test.ts,bench-worker-and-lowlight.test.ts,bench-ui-flow.test.tsx}`
  - `frontend/implementation/docs/execution/NUI_R20_BENCHMARK_RECORDER_HANDOFF_2026-11-19.md`
- **Test & E2E results:** `tests/nui-lab` 210/210 PASS (17 files); `tests/owner-build-manifest.test.ts` 4/4 PASS; `tsc --noEmit` 0 errors; `lint` 0 new warnings; `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` 24/24 static pages; Playwright Chromium `--disable-gpu` static-export E2E PASS (`60.0 -> 60.0 FPS` delta 0, `0` LongTasks, `0` droppedRecords, `reloadRecoveryShowsInterrupted: true`, `validateExportFile` 0 errors, `reanalyzeExport.ok: true`); true CDP cold transfer on NUI Lab `10,966,014 B` (`10.46 MiB` < 25 MB PASS under `deploy/Caddyfile` zstd+gzip).
- **Pre-existing non-lab findings (NOT modified):** 13+ legacy tests in `tests/input/` & `tests/camera/` (fist-erase/GPU baseline from 0.25.0-alpha); true CDP audit on unmodified Student SPA `main` showed `26,801,677 B` (`25.56 MiB` FAIL < 25 MB due to `3×` `.task` fetch in untouched `src/camera/hand-landmarker.ts`).
- **Physical Webcam (`N1..N6`):** **`NOT_TESTED`**. R20 plan on `research-can@b0f43f01e226434d212a20437d24b00c31d583f3` remains `[WIP]`.
- **Scope strictly observed:** `app/level1..3`, `app/canvas1..3`, `app/onboarding/*`, `src/game/*`, `src/input/{gameplay-hand-driver,mediapipe-input,arbiter}.ts`, `src/camera/*`, `backend/` logic, `contracts/`, `DECISIONS.md`, `SOUL.md`, and running Caddy/Ujang services — NOT TOUCHED.
- **Next QA:** Ujang pulls `main` + runs `bash frontend/implementation/scripts/ujang-verify-web.sh`; Owner opens `/nui-lab`, consents, runs `N1..N6` physical night webcam paired tests across `R19 C0` / `R20 C4` / `R20 C7`, and downloads full JSON + CSV archive in 1 click.
