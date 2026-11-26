# BASELINE P0 — migrasi r8.3

Tanggal: 2026-11-25 (WIB). Repo `hitl-momo`, branch lokal `r83-migration` @ `3908119` (0.29.6-alpha). APP_DIR = `frontend/implementation`. Windows, PowerShell. Tidak ada perubahan di `src/`, `package.json`, `package-lock.json`.

## 1. Sandbox r8.3

- Zip: `F:\Downloads\sketchbook-universe-sandbox-r8.3.zip`, sha256 `d37e02f2bca6dc388133c7cc7c14d35030800a5706db2b0eb17db96f255e8695` (sama dengan angka di rencana).
- `proto-html/r83/` berisi 63 file (diverifikasi), `SHA256SUMS` (63 baris, path relatif) ditulis di sana. Catatan: kecocokan byte-identik isi folder dengan zip tidak dibandingkan ulang oleh QA; SHA256SUMS dihitung dari isi folder saat ini.

## 2. Versi tool

node v24.19.0, npm 12.2.3 (README menyebut Node ≥ 20), playwright-core 1.64.1, Chromium Playwright `chromium-1248` (`%LOCALAPPDATA%\ms-playwright\chromium-1248\chrome-win64\chrome.exe`).

## 3. Hasil perintah (di APP_DIR, berurutan)

| # | Perintah | Exit | Durasi | Catatan |
|---|---|---|---|---|
| 1 | `npm ci` | 0 | 77 s | postinstall berjalan; `package-lock.json` tidak berubah |
| 2 | `npm run typecheck` | 0 | 11 s | |
| 3 | `npm run lint` | 0 | 14 s | 1 warning `react-hooks/exhaustive-deps` di `GestureRing.tsx:128` |
| 4 | `npm test` (vitest run) | **1** | 254 s | 37 tes gagal + 1 suite gagal-muat; 2391 lulus / 2428 (17 file gagal dari 289) |
| 5 | `$env:NEXT_PUBLIC_TEST_HOOKS=0; npm run build` | 0 | 36 s | export statis ke `./out` |
| 6 | `node e2e/normal-journey.mjs` | **1** | 180 s | FAIL (lihat §5) |
| 7 | `node e2e/recovery-paths.mjs` | **1** | 161 s | FAIL (lihat §5) |
| 8 | `node e2e/classroom-e2e.mjs` | — | — | **NOT_TESTED**: butuh backend (API_BASE, DB_PATH, akun guru, admin) |
| 9 | `node e2e/route-canvas.mjs` | 0 | 286 s | 15/15 PASS |
| 10 | `node e2e/guide-flow.mjs` | 0 | 140 s | semua PASS, tanpa page error |

E2E dijalankan dengan `CHROMIUM_PATH` di atas, `NO_VIDEO=1`, serve `./out` (server statis harness, port acak 127.0.0.1), output dialihkan ke `e2e/r83/out/` (default skrip menulis ke `docs/execution/evidence`, di luar allowlist). `e2e/run.mjs` tidak dijalankan (STALE).

Sisi efek: `npm test` mengubah `tests/fixtures/synthetic-k8-v2-2-export.json` (ditulis oleh tes); dikembalikan dengan `git checkout -- <file>`. Tes dijalankan dua kali (run pertama via `npm test`, run kedua `npx vitest run --reporter=json` untuk nama tes): hasil sama, 37 gagal.

## 4. Tes unit gagal (37 tes + 1 suite)

Ekspektasi orkestrator ~22 di area kamera/eraser; **aktual 37**, dan ada beberapa di luar area itu (perilaku level, model YOLO, env-factory). Daftar lengkap juga di `e2e/r83/logs/failed-tests.txt`; JSON penuh `e2e/r83/logs/test-results.json`. Penyebab tidak diselidiki.

**Suite gagal-muat:** `tests/owner-build-manifest.test.ts` ("Invalid or unexpected token").

Kamera / ring / tutorial (10):
- `tests/camera/global-camera-lifecycle.test.tsx` — GPU -> CPU delegate fallback is surfaced > retries on CPU once when GPU creation fails and shows the delegate
- `tests/components/components.test.tsx` — GlobalCamera: renders centered hero cover view when mode is cover, without a skip button
- idem: renders docked floating widget with toggle-card styling when mode is floating
- idem: keeps the exact same card + <video> node across cover -> floating (no unmount)
- idem: recesses on the drawing canvas without unmounting the camera card
- idem: toggle switch changes camera active state
- `tests/components/components.test.tsx` — LevelRibbonBookmark shelf: renders three bookmarks on the spiral binding with a short heading
- idem: marks the first level open and later ribbons locked with a padlock
- `tests/components/tutorial-pinch.test.tsx` — card 1: a pinch drags Thinman with the hand, and letting go stops him where he is
- idem: a pinch that reaches the flag stops him there, and he cannot be pushed on

Eraser / input (11):
- `tests/input/drawing-surface-eraser-radius.test.ts` — setEraserRadius(48) makes the same fist cut that line in place
- idem: the radius is in CSS px: on a 2x backing store a 28 px fist reaches 56 canvas px
- `tests/input/drawing-surface-fixed-eraser.test.ts` — default eraser (level canvas) still resizes the wheel, [ ] and a widening second hand all change the radius
- `tests/input/eraser-controls.test.ts` — a ring as wide as the current radius is drawn at the knuckles
- idem: the ring carries the size number
- `tests/input/hand-stroke-surface.test.ts` — Hapus tool on: command poses never erase a split palm under the eraser tool neither erases nor draws
- `tests/input/two-hand-surface.test.ts` — a pinching second hand draws nothing while the first hand is a fist
- idem: a fist listed second is still the eraser, and the other hand does not draw
- idem: widening the second hand's gap grows the radius, closing it shrinks the radius
- idem: the radius stays inside the min and max bounds with two hands
- idem: the radius moves only while a fist and a second hand are both in view
- idem: one pass with a changing radius is one undo step that restores the whole line

Perilaku level / flow / domain (14):
- `tests/app/gamelabel-behavior.test.ts` — accept uses the rank 1 gameLabel; correct uses the chosen rank's gameLabel; override takes a level label from the level list directly (3; menerima 'unresolved' bukan 'solid'/'danger')
- `tests/app/state-machine.test.ts` — AC-01/02/03/07 happy path accept → falling → placing → gameplay → complete (stage 1); AC-10 danger fail returns to drawing with recovery
- `tests/components/mission-briefing.test.tsx` — renders title, goal and example objects as Momo chat
- `tests/domain/behavior-resolver.test.ts` — context-aware: same label differs across levels; Level 2 maps tangga as solid scaffold
- `tests/domain/mission-config.test.ts` — generates stage 1 horizontal gap mission config; interpolates configured character name in stage 2 and 3
- `tests/game/three-level-progression.test.ts` — Level 1 gap width requires solid object; Level 2 requires height positioning to reach elevated roof goal; Level 3 spikes on ground, tali to danger

Lain-lain (2):
- `tests/nui-lab/monui7-yolo.test.ts` — verifies release ONNX model at public/models matches expected YOLO_MODEL_SHA256
- `tests/prediction/env-factory.test.ts` — createPredictionProvider ... provider built from env forwards sanitized headers, context and vocabulary policy to fetch

Pola yang tampak (hipotesis, belum dibuktikan): beberapa gagal terkait `gameLabel`/`unresolved` dan label level (kemungkinan data katalog/`levels.ts` vs tes), serta tes eraser/kamera yang tertinggal dari UI. Mungkin juga ada faktor environment (mis. file model ONNX, manifest). Tidak diperbaiki.

## 5. Hasil E2E

- **normal-journey: FAIL** (exit 1). `RESULT FAIL attempts=[] consoleErrors=0`. Berhenti di langkah override: `locator.waitFor` timeout 15 s menunggu `[data-testid="override-option-balok"]` terlihat. Tidak ada percobaan gameplay yang tercatat; Level 1–3 dan ending tidak tercapai.
- **recovery-paths: FAIL** (exit 1). `checks=3/3` PASS (Top-3 panel tiga kandidat, panel ≤ 340 px, tanpa error konsol), lalu FAILURE sama: timeout menunggu `override-option-balok`. Langkah recovery selanjutnya tidak terjalankan. Sinyal yang sama dengan unit test gagal "override takes a level label from the level list directly" (indikasi kuat satu akar masalah, tidak diselidiki).
- **classroom-e2e: NOT_TESTED** (butuh backend + DB + akun guru).
- **route-canvas: PASS** 15/15, 0 error konsol.
- **guide-flow: PASS** semua cek, tanpa page error.

Log: `e2e/r83/logs/*.log`, ringkasan `summary.tsv`, `e2e-summary.tsv`; artefak `e2e/r83/out/`.

## 6. Kelas bukti jujur

| Area | Kelas | Dasar |
|---|---|---|
| typecheck, lint, build | STATIC / lulus | exit 0 |
| Logika domain, input, kamera | UNIT_ONLY | vitest dengan jsdom/sintetis; 37 gagal + 1 suite error, jadi tidak hijau |
| Prediksi di E2E | MOCK_MODEL | fixture deterministik harness, bukan model Dias |
| Kamera/tangan nyata, webcam | NOT_TESTED | tidak ada kamera fisik; E2E hanya mouse/keyboard |
| Backend `/predict` nyata, kelas guru (classroom-e2e) | NOT_TESTED | butuh backend |
| route-canvas, guide-flow | MOCK_MODEL (browser nyata, input mouse, prediksi mock) | PASS |
| normal-journey, recovery-paths | MOCK_MODEL, **FAIL** | lihat §5 |
| Paritas visual vs sandbox r8.3 | NOT_TESTED | screenshot acuan opsional tidak dibuat |

## 7. Catatan

- Baseline TIDAK hijau: gerbang "Flag 0: E2E lama sama dengan baseline" harus dibandingkan terhadap angka ini (37 tes gagal + 1 suite; normal-journey & recovery-paths FAIL di override balok).
- Screenshot acuan sandbox r8.3 (§9.2) belum dibuat (opsional, dilewati).
- Tidak ada proses node/playwright milik QA yang tertinggal.
