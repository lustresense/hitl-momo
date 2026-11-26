# NOW.md — Status integrasi bersama

## 2026-11-26 — Migrasi UI r8.3 (0.32.1-alpha, di-push ke `main` 2026-11-26)
- Tampilan bawaan: r8.3 (nama panggilan diketik di DreamLoader, tanpa penggaris/STT). "Lewati" mengikuti sandbox, Alt+Q, saklar admin/skrip.
- Keputusan D-20261126-03 s.d. -06 disetujui Owner: identitas tanpa STT, onboarding/tutorial, pemisahan NUI produk/lab, tiga tingkat interaksi. Revisi mekanisme ring berbasis kursor belum terbukti dikerjakan; tools kanvas tetap. Source main yang diaudit `4c71664`, versi 0.32.1-alpha; tidak ada pengujian ulang atau deploy dalam rekonsiliasi dokumentasi ini.
- `origin/main` 0.30.3-alpha sudah digabung. Kode terakhir `64248dc`.
- Bukti: tsc 0 error; lint 0 warning; unit tanpa kegagalan baru (38 kegagalan bawaan main; satu tes tampilan lama tidak stabil saat jalan paralel); tes backend 21/21; E2E r83-flow 42/42 (sebelum Alt+Q); telusur penuh hanya dengan Alt+Q sampai ending; cek data skip vs manual dengan model asli. Webcam fisik, klik halaman admin, dan E2E tampilan lama: NOT_TESTED.
- Masalah yang diketahui: siswa yang membuka tab baru tercatat sebagai siswa baru (kelas bisa "penuh"); join bernomor dengan `client_id` yang sama membalas HTTP 500 (hanya bisa terjadi dari tampilan lama atau klien API, tampilan r8.3 tidak mengirim nomor).
- Berikutnya: revisi Owner yang sedang dikumpulkan, review Dias, uji webcam.

## 2026-11-19 — NUI Lab Persistent Benchmark Recorder + R20 C4/C7 CPU Worker Integration (0.27.0-alpha, UNIT 210/210, E2E PASS, BUILD 24/24, WEBCAM NOT_TESTED)
- **Upgrade Recorder (`/nui-lab*`):** Ekstensi kompatibel `lab-recorder.ts` (`src/components/nui-lab/bench/`) dengan gerbang consent numerik eksplisit, IndexedDB + batched `ChunkWriter`, perekaman otomatis multi-trial lintas `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, dan `/nui-lab/diagnostics`, recovery `interrupted` saat reload/crash, peringatan kuota + counter `droppedRecords`/`storageFailures`, pemisahan label `pointer` vs `gesture`, label GT manual (`UNLABELLED` default), dashboard perbandingan terpisah per konfigurasi, serta ekspor 1 klik JSON (`nui-lab-bench-export/1`) + CSV & hapus data lokal di browser. Zero gambar/video/audio/identitas/upload.
- **Engine NUI Lab (CPU-only & Fail-Closed SHA-256):** Pemilih eksplisit `R19 C0` (`122,768 B`, baseline), `R20 C4` (`73,275 B`, student utama), dan `R20 C7 distilled` (`73,138 B`, pembanding) beserta mode `RAW` / `CLAHE` / `A4` (`A4v2` chroma-preserving Reinhard + motion-gated EMA + separable median-5) dan Web Worker `HandLandmarker` CPU-only (`delegate: "CPU"`, `CacheStorage` dedup, `WorkerOwnerGuard` anti-bystander).
- **Bukti:** `tests/nui-lab` 210/210 PASS (17 file), `tests/owner-build-manifest` 4/4 PASS, `tsc --noEmit` 0 errors, `npm run lint` 0 new warnings, `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` 24/24 static pages, Playwright Chromium `--disable-gpu` static-export E2E PASS (`60.0 -> 60.0 FPS` delta 0, `0` LongTasks, `0` droppedRecords, 3 trial terpisah `r20-c4`/`r19-c0` gesture+canvas w/ `pointerStrokes=1`, `reloadRecoveryShowsInterrupted: true`, `validateExportFile` 0 masalah & `reanalyzeExport.ok: true`). CDP cold transfer NUI Lab `10,966,014 B` (`10.46 MiB` < 25 MB PASS under `deploy/Caddyfile` zstd+gzip).
- **Temuan jujur lintas-scope (tidak disentuh):** Audit CDP pada Student SPA `main` unmodified (`/onboarding/cam -> /canvas1 -> /level1`) menunjukkan `26,801,677 B` (`25.56 MiB`, FAIL < 25 MB) karena `src/camera/hand-landmarker.ts` mengunduh `hand_landmarker.task` 3×; sengaja tidak diubah karena berada di luar ruang lingkup NUI Lab.
- **Webcam fisik (`N1..N6`):** `NOT_TESTED` — R20 tetap `[WIP]`. Sumber R20 selektif dari `research-can@b0f43f0` (bukan merge branch).
- **Game siswa, storyline, HITL, backend logic, contracts, DECISIONS.md, SOUL.md:** tidak disentuh (hanya metadata versi monorepo `0.27.0-alpha` via `bump_version.py`).
- Handoff: `frontend/implementation/docs/execution/NUI_R20_BENCHMARK_RECORDER_HANDOFF_2026-11-19.md`.

## 2026-11-18 — R19 G4 Hybrid sebagai satu-satunya engine NUI Lab (0.26.0-alpha, UNIT 195/195, BUILD 24/24, WEBCAM NOT_TESTED)
- **Engine:** `R19 G4 Hybrid = G1 Geometry + G3 MLP [82→96→48→3] + PistolVirtualKeyFSM`. R18 UX3, Baseline, R17, semua toggle pemilihan engine dihapus dari UI NUI Lab.
- **Model:** `/models/r19-pistol-model.json` (122,768 B, sha256 `c6130bd56850534889372a7295d45e7704083cbf60115626cd08b57c6e000293`). Loaded on-demand, fail-closed: jika gagal dimuat tampilkan error bahasa Indonesia + retry, bukan fallback diam ke engine lama.
- **Routes:** `/nui-lab` (landing R19, passive camera API, no getUserMedia on mount), `/nui-lab/gesture` (full R19 diagnostics, virtual keyboard Left/Jump/Right, MLP softmax probabilities berlabel), `/nui-lab/canvas` (R19 pinch draw, 5-finger erase, swipe undo/redo, pointer fallback; pistol read-only), `/nui-lab/diagnostics` (render `<NuiLabPage variant="gesture" />`, tidak ada server redirect).
- **Lifecycle guards:** `visibilitychange` → `releaseAll("browser-hidden")`, track `ended` → `releaseAll("stream-ended")`, route change/unmount → reset state. Zero ghost PRESS, zero stuck key.
- **Bukti:** `tests/nui-lab` 195/195 PASS (14 file); `tests/app/domain/prediction/events/config/api/manifest` 327/327 PASS; `tsc --noEmit` 0 errors; `npm run lint` 0 new warnings; `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` exit 0, 24/24 static pages.
- **Kegagalan pra-ada (bukan regresi R19):** 13 tes di `tests/input/tests/camera` (fist-erase/GPU baseline, tercatat REVISIONS R16-10 dan CHANGELOG 0.25.0-alpha).
- **Webcam fisik:** `NOT_TESTED` — tes sintetis tidak diklaim sebagai bukti webcam.
- **Sumber R19:** `research-can/r19/candidates/` (selektif, bukan raw sandbox). `research-can` tidak dimerge ke `main`.
- **Game siswa, backend, contracts, DECISIONS.md, SOUL.md:** tidak disentuh.
- Handoff: `frontend/implementation/docs/execution/NUI_R19_LAB_INTEGRATION_REPORT_2026-11-18.md`.

## 2026-11-18 — R18 UX3 Live Lab sebagai engine NUI (0.25.0-alpha, UNIT 195/195, WEBCAM NOT_TESTED)
- Sesi ini **sudah digantikan oleh R19 G4 Hybrid (0.26.0-alpha)**. R18 UX3 dihapus dari UI NUI Lab per mandat Owner 2026-11-18.
- Handoff lama: `frontend/implementation/docs/execution/NUI_R18_UX3_LIVE_LAB_HANDOFF_2026-11-18.md`.

## 2026-11-17 — NUI R17-01 REV4: lima/tiga jari, pinch, swipe, R&D (0.24.0-alpha, UNIT + DATASET, WEBCAM NOT_TESTED)
- Lab saja (`experimentalRobust`); game memakai aturan lama. Jempol dinilai di koordinat lateral terkoreksi aspek, pinch lab masuk 0.30 / lepas 0.42 pada geometri terkoreksi aspek, penghapus memotong segmen antar-titik, Undo/Redo lab lewat FSM geser (kandidat uji: satu jari kiri = Undo, dua jari kanan = Redo; **bukan keputusan**). Panel diagnostik R17 dan perekam angka landmark opt-in di `/nui-lab/gesture`.
- Landmark publik nyata (HaGRIDv2, 50,607 baris uji, 3,707 subjek): `four` erase-eligible 84.4% → 0.2%, `three` terbaca 3 jari 16.8% → 98.3%, `palm` 54.7% → 100%. Sisa risiko: tangan alami 33.8%, `grabbing` naik ke 18%.
- Pilot classifier landmark (LR/MLP kecil) lolos anggaran **hanya pada dataset**; webcam target NOT_TESTED, tidak dipasang ke gameplay atau lab. RD-06 tidak dimulai. IPN HandS landmark BLOCKED (Drive quota). Laporan: `frontend/implementation/docs/nui-rd/` dan `docs/execution/NUI_R17_REV4_HANDOFF_2026-11-17.md`.
- Vitest: set 22 tes gagal pra-ada identik sebelum/sesudah. `DECISIONS.md` tidak disentuh, PR #5 tidak di-merge.

## 2026-11-17 — Universal CAN SOP routing (0.23.0-alpha, static documentation)
- Root `AGENTS.md` is the universal entry for Claude Code, Antigravity and Codex. CAN instructions link SOUL A+B, governed DECISIONS, SOURCE_OF_TRUTH, NOW, REVISIONS, OWNER_MANDATES, WORKING_CONTEXT, PROJECT_MEMORY, team protocols, rules, skills and current code. The `contexts/` directory is the Owner Context Registry, not renamed.
- Antigravity root rule added and six CAN modular rules now have valid `trigger: always_on` YAML. Fresh sessions must explicitly read nested CAN SOP; this is not proof that a particular agent complied.
- New `contexts/can/SESSION_HANDOFF.md` tracks portable session status. Old 2026-11-05 execution handoff marked historical. NUI `0.22.0-alpha` source and draft PR #5 remain as before. `STATIC_ONLY / NOT_TESTED` for runtime and new agent behavior.


## 2026-11-16 — NUI Lab P0–P2 auto-lock/gesture baseline-vs-experiment (0.22.0-alpha)
- `main`: NUI Lab punya auto-reacquire saat kamera benar-benar kosong, safety untuk multi-hand ambiguitas, sesi aksi baru tanpa stale ink, finger-state diagnostics, pinch ratio dan A/B rules. Game siswa tetap memakai aturan default tanpa eksperimen.
- Evidence: JS V8 synthetic lock 12/12 PASS, tes source baru ditulis namun belum dijalankan via Vitest, tidak ada webcam/browser/build/deploy. `STATIC_ONLY / NOT_TESTED`; Ujang perlu verifikasi.
- No fingerprint, training dataset atau swipe Undo/Redo. Handoff `frontend/implementation/docs/execution/NUILAB_AUTOLOCK_HANDOFF_2026-11-16.md`.


## 2026-11-16 — NUI Lab di `main` (0.21.0-alpha, STATIC_ONLY)
- Instruksi Owner memindahkan NUI Lab dari workflow branch ke URL monorepo aktif agar tunnel dev Ujang tetap menggunakan `main`. Routes `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics` ada di frontend Next.js, tanpa alur game.
- Pemetaan drawing game dan lab: pinch Coret, 5 jari Hapus, satu jari Undo, dua jari Redo; kepalan tidak menghapus. Canvas lab memakai cursor, stroke smoothing, Momo, dan alat fallback mouse/touch.
- FullFrameHandLock lab memilih satu tangan dari semua lokasi frame tanpa face ROI; jika kehilangan/ambigu butuh relock eksplisit. Ini bukan verifikasi biometrik dan tidak mengatasi hilangnya landmark di pinggir frame secara ajaib.
- Integrasi source ke `main` mempertahankan 13 commit gameplay yang ada di `main`; `ujang-monorepo` tidak ditimpa. Belum ada npm/CI/build/webcam/tunnel (`STATIC_ONLY / NOT_TESTED`). Lihat `frontend/implementation/docs/execution/NUILAB_MAIN_HANDOFF_2026-11-16.md`.
