# Working Context

### 2026-11-16 — NUI Lab auto-reacquire & diagnostics eksperimen 0.22.0-alpha (STATIC_ONLY)
- Source `main` diperluas: `lab-hand-lock.ts`, `lab-analyzer.ts`, NUI Lab UI, opsi `experimentalRobust` di classifier/pipeline tanpa mengubah default game. Prioritas adalah hand tracking kontinu, auto-release saat tidak ada tangan, dan rearm tindakan pasca-acquire baru.
- Aturan lab baru menggunakan 2 sample kamera tanpa hand dan jeda 300ms sebelum melepaskan pemilik lama; jika background hand tetap terlihat, lock tidak dipromosikan. Parameter prototype; perlu tes kamera depan/crowd/distraksi.
- V8 direct lock test source 12/12 PASS (tes sintetis saja). npm/Vitest/build/real webcam **BELUM-TERBUKTI**. Opsional A/B UI, no raw dataset recorded.


### 2026-11-16 — NUI lab experiment masuk `main` (source only)
- Branch `nui-lab` sudah tidak ada di GitHub saat pengecekan. `ujang-monorepo` SHA 4d9ebb0 memiliki dua-ruang lab dan gesture 5-jari lebih baru dari `main` SHA 6e89a47. Integrasi terpilih pada `main` tidak menyentuh source gameplay baru.
- Routes App Router `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics`; satu pipeline MediaPipe dengan gesture HUD/hand cursor/Momo dan strict full-frame hand lock.
- Koreksi `fist` inert, `countExtendedFingers === 5` Hapus. Test synthetic source tersedia, tetapi hasil build/webcam dan tunnel masih BELUM-TERBUKTI; Ujang pemilik QA/deploy.


Last updated: 2026-11-05 (sesi eksekusi teknis; diperbarui oleh IT ORCHESTRATOR atas permintaan Owner)

## NOW (baca ini dulu)
### GAMEPLAY 2026-11-16 — hitbox objek mengikuti gambar (dikerjakan dari `main`, M-036)
- `src/game/runtime/footprint.ts` `inkFootprint()` menghitung kotak objek dari gambar siswa (proporsi dijaga, diperbesar sampai kotak terbesar level); batas per bab di `src/game/object-limits.ts`. `createPendingCreation` memakainya; placement membaca ukuran hidup dari telemetry kanvas (`objectWidth/Height`).
- `integratedPlacementAllowed` menolak kotak di atas badan spawn Thinman dan bendera (`spawnBodyOf`); objek bahaya melukai hanya di dalam `hazardZone` (12% lebih kecil).
- `e2e/lib/level-plans.json`: tiap siklus membawa `w`,`h` (block 130,6 x 49,5 untuk Bab 3 siklus 1; spike 80,5 x 58,8). Alat: `e2e/collider-audit.mjs`, `e2e/signpost-shot.mjs`, `UNLOCK_ALL=1 LEVELS=n` untuk `normal-journey`.
- Bukti: `normal-journey` Bab 1-3, `recovery-paths` 16/16, `finish-thumb-flow` 12/12, `route-canvas` 15/15 (mock, mouse+keyboard); kamera fisik NOT_TESTED. Rincian `frontend/implementation/docs/execution/gameplay/README.md`.

### KOREKSI OWNER B04-004 2026-11-15 — stream-ready replaces waving (0.18.1-alpha)
- Owner secara eksplisit menolak implementasi 0.18.0-alpha yang mempertahankan wave dan meminta PRD REV-B04 opsi kamera ON diterapkan. Keputusan produk D-20261115-03, mandat M-035.
- `GlobalCamera` cover kini tanpa WaveTracker/ring wave/nudge. Setelah getUserMedia dan playback video berhasil, satu kali `wakeMomo()` menjalankan animasi kamera PIP, Momo kaget/terbang, chat perkenalan, jempol menuju penggaris. Kamera OFF atau permission ditolak, video gagal, stale request tidak otomatis membangunkan Momo. Fallback manual saat tidak ada kamera tetap.
- WaveTracker terpisah tetap ada sebagai modul riset; mapping Card1/3, card kamera Claude, Momo sayap menyapa dan loading/route B04-001..003 tidak dirombak.
- Tests cover/lifecycle diubah sesuai kontrak baru. `STATIC_ONLY / NOT_TESTED`. Belum ada npm, CI, E2E, webcam, screenshot maupun deploy terverifikasi. Ujang pemilik validasi.

### REV-B04 2026-11-15 — implementasi source (STATIC_ONLY)
- Owner: GAS mengeksekusi PRD B04 berdasarkan tiket asli. Target `ujang-monorepo`; branch `main` tetap tidak boleh diubah.
- Source disiapkan untuk loader (80% gate dan retry, 90% awan), canonical route `/onboarding/cam`, bubble Momo CSS, wave model reuse 30 s, diagnostic counters. Card kamera dan gestur 0.17.1-alpha tetap.
- Tests baru/direvisi tetapi belum dijalankan; seluruh typecheck/lint/unit/build/E2E/profiling webcam/deploy `NOT_TESTED`. Bug wave low-light/face occlusion belum boleh disebut solved.
- B04-004 opsi toggle ON masih belum dikunci. Jangan menulis ulang D-20261110-04 tanpa keputusan Owner.
- Rujukan root CHANGELOG `0.18.0-alpha`, `REVISIONS.md`, dan laporan `frontend/implementation/docs/execution/REV-B04-0.18.0-alpha.md`.

### STATUS TERBARU 2026-11-15 (menggantikan snapshot 2026-11-05 di bawah)
- **TERBUKTI dari connector GitHub:** branch `ujang-monorepo` pada `cebbaa4797c963da80090d54728a5b0e39c811e4`, versi `0.17.0-alpha`. Perubahan 0.16.1 dan 0.17.0 ada pada source remote; `main` tetap pada `56bdc2e4b430f80af6b196825d7748d9abb882d5` ketika terakhir diverifikasi.
- **STATIC_ONLY:** ikon tangan SVG, Card 1/3, Momo recovery, BookFlip, NUI Lab, FaceAnchor/backlight/wave, requirements frontend dokumenter dan skrip Ujang. Sebanyak 35 file berubah di commit `cebbaa4`; bukan jaminan fitur lolos runtime.
- **NOT_TESTED / BELUM-TERBUKTI:** `npm ci`, typecheck, lint, Vitest, Next.js build, E2E browser, performa kamera, low light dan deploy server. Perintah Owner adalah Ujang menginstal dan men-deploy; Owner hanya membuka situs.
- **Governance:** instruksi M-033 mewajibkan membaca `contexts/can/AGENTS.md` dan melacak seluruh MD relevan per perubahan. `DECISIONS.md` hanya untuk keputusan produk; status/tool di file ini. D-20261115-02 adalah konflik mapping yang belum diratifikasi.
- **Lanjutan:** R15-01..06, `frontend/implementation/docs/execution/UJANG_HANDOFF_0.17.0-alpha.md`, `CHANGELOG.md` root. Snapshot lama di bawah adalah arsip, bukan keadaan terbaru.


> Versi satu halaman yang selalu diperbarui: **`NOW.md`** di root repo. Bagian di bawah adalah ringkasannya.

- **Branch kerja:** `claude/pa-sketchbook-universe-fs0dbf` (lokal, BELUM di-push; baseline `54ebec1`; `can` tidak disentuh). Rincian lengkap + prompt lanjut sesi: `implementation/docs/execution/SESSION_HANDOFF.md`.
- **Status:** prototype playable end-to-end dengan prediksi MOCK. Onboarding -> L1 -> L2 (2 objek) -> L3 menang dengan input mouse/keyboard asli; jalur gagal/retry/Redraw/geser terbukti. 548/548 unit test, tsc, lint, build, E2E journey + recovery (16/16) + hand-control (6/6, kamera palsu) + MediaPipe init lulus (commit teruji `383c3bc`, evidence `implementation/docs/execution/evidence/final-383c3bc/`).
- **Yang paling baru dikerjakan:** (1) Momo = artwork animasi Owner, besar dan bebas, lebih besar dari Thinman; (2) panel Top-3 dikecilkan, keputusan langsung berlaku, pop-up "Masukkan ke dunia", pop-up sukses di dalam dunia dengan latar digelapkan; (3) tombol "Gambar lagi" digabung, "Petunjuk misi" ke kanan atas, switch Mouse|Kamera, label demo kalimat biasa; (4) modularisasi kode tanpa perubahan perilaku; (5) rapikan branch jadi satu.
- **Menunggu Owner:** nama+email commit (agar Claude tidak tercatat sebagai kontributor), nama branch GitHub (usulan `pa/frontend-integrated-2026-11`), pilihan evidence (apa adanya / bersih), izin tulis ulang riwayat lokal, lalu persetujuan push. Owner juga akan memberi "prompt revisi besar" berikutnya.
- **PERINGATAN:** commit hanya ada di container sesi ini. Sesi baru = clone baru dari remote -> kerja ini HILANG kalau belum di-push (atau diekspor). Jangan ganti sesi sebelum push disetujui.

## Operating model

- `CAN(USER)` = Project Owner / Product & R&D Lead / Final Approver. Ujang = infrastruktur, `can`, backup, deploy (jangan disentuh).
- Direct IT harness tanpa role delegasi = orchestrator; `ROLE: WORKER` eksplisit = worker. Worker mengembalikan hasil; orchestrator mempromosikan state tervalidasi.
- Governance (`SOUL.md`, `DECISIONS.md`, `SOURCE_OF_TRUTH.md`, `AGENTS.md`) hanya diubah dengan persetujuan Owner. Sejak 2026-11-05 `CHANGELOG.md` diganti nama `DECISIONS.md` atas instruksi Owner (D-20261105-10); perubahan teknis ada di `implementation/CHANGELOG.md`.

## Current implementation state (verified from source/tests)

- Next.js 14 static export, React 18, KAPLAY 3001 (gameplay), `@mediapipe/tasks-vision` (tangan), gsap (Momo + ribbon), vitest, playwright-core. Arsitektur aktual: `implementation/docs/execution/ARCHITECTURE_ACTUAL.md`. Cara menjalankan: `RUN_GUIDE.md`.
- Sistem visual (oranye/hijau/dots/outline) DIKUNCI Owner; jangan ganti palet/tipografi/background. Redesign yang ditolak ada di branch lokal `claude/tolol`.
- Prediksi: MOCK (`MockPredictionProvider`, label "Demo: tebakan simulasi"). `PartnerHttpProvider` adalah adapter saja, belum ada model/endpoint nyata.
- Logging: sink DEV console; sink HTTP batch (offline/retry) mati kecuali `NEXT_PUBLIC_EVENT_ENDPOINT` diisi; tanpa stroke dan nomor absen secara default.
- Input: pointer; MediaPipe pinch untuk menggambar; gameplay: keyboard / tombol layar / opt-in "Kontrol tangan" lewat `InputArbiter`. Tangan nyata BELUM diuji.
- Gameplay: coyote time + jump buffer 100 ms (belum diratifikasi Owner).

## Open items (urut kira-kira prioritas)

1. Push aman ke GitHub (branch baru, bukan `can`) + identitas commit (lihat NOW).
2. Revisi besar dari Owner (prompt belum diterima saat catatan ini ditulis).
3. Momo "maju-mundur" yang benar-benar bergerak (mengikuti Thinman/menjauh-mendekat layar); saat ini hanya ukuran per momen.
4. Ratifikasi coyote time; fitur hapus objek; akhir permainan setelah L3; layout 390 px belum dicek di HP.
5. Bersihkan sisa: class `null` di DirectionButton, `src/app/app-reducer.ts` kemungkinan tak terpakai, `e2e/run.mjs` LEGACY.
6. BLOCKED: model nyata/logging backend (partner), webcam fisik (hardware), evaluasi siswa (Owner).

## Unresolved product/engineering items

Gunakan `project/OPEN_QUESTIONS.md`. Jangan menyimpulkan stack final, penggunaan kamera, arsitektur classifier, skema database, manipulasi confidence, kontrol karakter final, atau skrip level final.

## Backup

Backup bersifat copy-only (rclone `copy`, `--dry-run` dulu, jangan `rclone sync`). Lihat `docs/backup/BACKUP_POLICY.md`.
