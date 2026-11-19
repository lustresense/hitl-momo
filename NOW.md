# NOW.md — Status integrasi bersama

## 2026-11-19 — Project berjalan end-to-end setelah migrasi Dias (0.29.1-alpha, di `main`, belum deploy)
- E2E kelas penuh di browser 19/19 dengan model asli dan kesulitan AI per level aktif. Cek label di `classroom-e2e.mjs` sekarang lewat `label-map.ts`.
- `vitest` game penuh: 2299 lulus, 22 gagal. Ke-22 tes itu sudah gagal di `68a7d9a` (pra-migrasi), di area kamera/penghapus Can.
- Ringkasan perubahan dan tugas Can/Dias: `docs/migration/dias-94120d4/PERUBAHAN-DAN-LANGKAH-SELANJUTNYA.md`.

## 2026-11-19 — Kesulitan AI per level AKTIF (0.29.0-alpha, di `main`, belum deploy)
- Kesepakatan Can + Dias 2026-11-19 (disampaikan Dias). Game build mengirim `levelId` (`NEXT_PUBLIC_PREDICTION_SEND_CONTEXT=1` di `docker-compose.yml` dan `frontend/implementation/Dockerfile`); default level Bab 1 = 0, Bab 2 = 40, Bab 3 = 70 (aktif, bisa diubah superadmin di `/admin/kesulitan`). CORS backend mengizinkan `X-Contract-Version`.
- Siswa di Bab 2 dan 3 akan melihat confidence lebih rendah; di Bab 3 sebagian gambar menampilkan label mirip di peringkat 1 dengan jawaban model asli di peringkat 2.
- Bukti: backend `pytest tests/integration` 21/21 (flag on/off), uvicorn: preflight CORS + body persis seperti game untuk 3 level; game: vitest `tests/api`+`tests/prediction` 164/164 dan `next build` 24/24 dengan `SEND_CONTEXT=1`, validator game menerima respons Bab 3. Docker, deploy, browser E2E: `NOT_TESTED`.
- Perlu: Can mencatat keputusan di `contexts/can/DECISIONS.md` (tidak diubah oleh agent).

## 2026-11-19 — Kesulitan AI dinyalakan di backend (0.28.1-alpha, di `main`, belum deploy)
- Keputusan Dias: `AI_DIFFICULTY_ENABLED=1` di `docker-compose.yml`/`.env.example`. Semua level masih mati sampai superadmin mengatur di `/admin/kesulitan`.
- **Siswa belum terdampak:** game belum mengirim `levelId` (`NEXT_PUBLIC_PREDICTION_SEND_CONTEXT` tidak diubah, keputusan Can/K1). Respons `/predict` menambah field `difficulty` (aditif).
- Bukti: `pytest tests/integration` 20/20 (flag on & off), uji HTTP uvicorn flag on, admin `tsc` + build. Docker/deploy: `NOT_TESTED`.

## 2026-11-19 — Migrasi menyeluruh repo Dias `94120d4` (0.28.0-alpha, di `main`, belum deploy)
- Branch `integration/dias-repo-migration-20261119` dari `main@68a7d9a`, di-push ke `main` (fast-forward) atas instruksi Dias 2026-11-19; izin ini hanya untuk tugas ini, bukan izin push `main` berikutnya. 754/754 file Dias berstatus (`docs/migration/dias-94120d4/MANIFEST.csv`), 51 blob yang tak ada di riwayat monorepo diarsip byte-exact.
- Dibawa: script training/evaluasi 6 arsitektur, label model dari `.labels.json` (fallback kategori lama, perilaku model sekarang sama), kesulitan AI per level + `/admin/kesulitan` **di balik `AI_DIFFICULTY_ENABLED` default mati**, tes black-box, dokumen & bukti Dias di `contexts/dias/`.
- Tidak di-port: edit Dias di `frontend/implementation/` (label level baru, `SEND_CONTEXT`), arsip patch. Keputusan K1 (kesulitan AI) dan K2 (model retrain + label level) menunggu Can + Dias.
- Bukti: `pytest tests/integration` 20/20, `verify_backend.py` 20/20 `REAL_MODEL`, `blackbox.py` 10/10 via uvicorn, admin `tsc`+`next build` PASS. `frontend/implementation`, Docker, training, webcam: `NOT_TESTED`.

## 2026-11-19 — NUI Lab Benchmark Recorder Persisten + Integrasi R20 C4/C7 CPU Worker (0.27.0-alpha, UNIT 210/210, E2E PASS, BUILD 24/24, WEBCAM NOT_TESTED)
- **Recorder NUI Lab:** Upgrade kompatibel atas `lab-recorder.ts` (`src/components/nui-lab/bench/`) dengan gerbang consent eksplisit, penyimpanan persisten IndexedDB + batched `ChunkWriter`, multi-trial lintas `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, dan `/nui-lab/diagnostics`, recovery status `interrupted` saat reload/crash, peringatan kuota + penghitung `droppedRecords`/`storageFailures`, dashboard perbandingan per konfigurasi (R19 vs R20 tidak dicampur), serta unduh 1 klik JSON+CSV & hapus data lokal langsung dari browser. Tanpa rekaman gambar/video/audio/identitas/upload.
- **Engine & Model NUI Lab (SHA-256 fail-closed):** Baseline `R19 C0` (`122,768 B`), kandidat utama `R20 C4` (`73,275 B`), dan pembanding `R20 C7 distilled` (`73,138 B`) dari `research-can@b0f43f0`. Detektor `HandLandmarker` Web Worker 100% CPU-only (`delegate: "CPU"`, `CacheStorage` dedup), `WorkerOwnerGuard` anti-bystander jarak dekat, serta mode preprocessing `RAW`/`CLAHE`/`A4` (`A4v2` chroma-preserving Reinhard + motion-gated EMA + separable median-5).
- **Bukti:** `tests/nui-lab` 210/210 (17 file), `tests/owner-build-manifest` 4/4, `tsc` 0 errors, `lint` 0 new warnings, build 24/24 static pages, Playwright Chromium `--disable-gpu` static-export E2E PASS (`60.0 -> 60.0 FPS`, `0` LongTasks, `0` droppedRecords, `reloadRecoveryShowsInterrupted: true`, `reanalyzeExport.ok: true`), CDP cold transfer NUI Lab `10,966,014 B` (`10.46 MiB` < 25 MB PASS). Catatan audit: Student SPA `main` belum disentuh masih `26,801,677 B` (FAIL < 25 MB karena fetch `.task` 3× di `src/camera/hand-landmarker.ts`).
- **Webcam fisik (`N1..N6`):** `NOT_TESTED` (R20 tetap `[WIP]`). Game siswa, storyline, HITL, backend logic, `DECISIONS.md`, `SOUL.md`: tidak disentuh.
- Handoff: `frontend/implementation/docs/execution/NUI_R20_BENCHMARK_RECORDER_HANDOFF_2026-11-19.md`. CAN: `contexts/can/NOW.md`.

## 2026-11-18 — R19 G4 Hybrid sebagai satu-satunya engine NUI Lab (0.26.0-alpha, UNIT 195/195, BUILD 24/24, WEBCAM NOT_TESTED)
- **Engine:** `R19 G4 Hybrid = G1 Geometry + G3 MLP [82→96→48→3] + PistolVirtualKeyFSM`. R18 UX3 dan semua toggle Baseline/R17/R18 dihapus dari UI NUI Lab per mandat Owner.
- **Model:** `/models/r19-pistol-model.json` (122,768 B, sha256 `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293`). Fail-closed: gagal load → error eksplisit, bukan fallback diam.
- **Routes:** `/nui-lab` (landing), `/nui-lab/gesture` (full R19 diagnostics + virtual keyboard), `/nui-lab/canvas` (R19 pinch draw + erase + swipe; pistol read-only), `/nui-lab/diagnostics` (alias gesture, no server redirect).
- **Bukti:** `tests/nui-lab` 195/195, `tsc` 0 errors, `lint` 0 new warnings, build 24/24 static pages. 13 tes camera legacy (fist-erase/GPU) tetap gagal (bukan regresi R19, tercatat CHANGELOG 0.25.0-alpha).
- **Webcam fisik:** `NOT_TESTED`. Game siswa, backend, `DECISIONS.md`, `SOUL.md`: tidak disentuh.
- Handoff: `frontend/implementation/docs/execution/NUI_R19_LAB_INTEGRATION_REPORT_2026-11-18.md`. CAN: `contexts/can/NOW.md`.

## 2026-11-18 — R18 UX3 Live Lab (0.25.0-alpha) — DIGANTIKAN R19
- Dihapus dari UI NUI Lab per mandat Owner 2026-11-18. Arsip: `NUI_R18_UX3_LIVE_LAB_HANDOFF_2026-11-18.md`.

## 2026-11-17 — Agent bootstrap multi-harness (0.23.0-alpha, documentation-only)
- Root AGENTS now routes any coding agent to CAN or DIAS owner contexts; `contexts/` is the Owner Context Registry. CAN SOP, source map and scoped frontend guide were consolidated. Antigravity rules gained valid frontmatter and a root workspace rule; portable checkpoint is `contexts/can/SESSION_HANDOFF.md`.
- Historical auto-promotion and 15 Nov branch limits are not standing permission. Owner explicitly allowed this single docs repair on `main`, not future agent pushes/merges/deployments. No product decisions approved, NUI source changed or PR #5 merged.
- Evidence `STATIC_ONLY / NOT_TESTED` for live model adherence, code-server checks and webcam. PR #5 `0.22.1-alpha` remains draft; its version must be reconciled after this `0.23.0-alpha` documentation batch.


## 2026-11-16 — NUI Lab P0–P2 auto-lock/gesture baseline-vs-experiment (0.22.0-alpha)
- `main`: NUI Lab punya auto-reacquire saat kamera benar-benar kosong, safety untuk multi-hand ambiguitas, sesi aksi baru tanpa stale ink, finger-state diagnostics, pinch ratio dan A/B rules. Game siswa tetap memakai aturan default tanpa eksperimen.
- Evidence: JS V8 synthetic lock 12/12 PASS, tes source baru ditulis namun belum dijalankan via Vitest, tidak ada webcam/browser/build/deploy. `STATIC_ONLY / NOT_TESTED`; Ujang perlu verifikasi.
- No fingerprint, training dataset atau swipe Undo/Redo. Handoff `frontend/implementation/docs/execution/NUILAB_AUTOLOCK_HANDOFF_2026-11-16.md`.


## 2026-11-16 — NUI Lab di `main` (0.21.0-alpha, STATIC_ONLY)
- Instruksi Owner memindahkan NUI Lab dari workflow branch ke URL monorepo aktif agar tunnel dev Ujang tetap menggunakan `main`. Routes `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics` ada di frontend Next.js, tanpa alur game.
- Pemetaan drawing game dan lab: pinch Coret, 5 jari Hapus, satu jari Undo, dua jari Redo; kepalan tidak menghapus. Canvas lab memakai cursor, stroke smoothing, Momo, dan alat fallback mouse/touch.
- FullFrameHandLock lab memilih satu tangan dari semua lokasi frame tanpa face ROI; jika kehilangan/ambigu butuh relock eksplisit. Ini bukan verifikasi biometrik dan tidak mengatasi hilangnya landmark di pinggir frame secara ajaib.
- Integrasi source ke `main` mempertahankan 13 commit gameplay yang ada di `main`; `ujang-monorepo` tidak ditimpa. Belum ada npm/CI/build/webcam/tunnel (`STATIC_ONLY / NOT_TESTED`). Lihat `frontend/implementation/docs/execution/NUILAB_MAIN_HANDOFF_2026-11-16.md`.
