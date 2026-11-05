# Working Context

Last updated: 2026-11-05 (sesi eksekusi teknis; diperbarui oleh IT ORCHESTRATOR atas permintaan Owner)

## NOW (baca ini dulu)

> Versi satu halaman yang selalu diperbarui: **`NOW.md`** di root repo. Bagian di bawah adalah ringkasannya.

- **Branch kerja:** `claude/pa-sketchbook-universe-fs0dbf` (lokal, BELUM di-push; baseline `54ebec1`; `can` tidak disentuh). Rincian lengkap + prompt lanjut sesi: `implementation/docs/execution/SESSION_HANDOFF.md`.
- **Status:** prototype playable end-to-end dengan prediksi MOCK. Onboarding -> L1 -> L2 (2 objek) -> L3 menang dengan input mouse/keyboard asli; jalur gagal/retry/Redraw/geser terbukti. 548/548 unit test, tsc, lint, build, E2E journey + recovery (16/16) + hand-control (6/6, kamera palsu) + MediaPipe init lulus (commit teruji `383c3bc`, evidence `implementation/docs/execution/evidence/final-383c3bc/`).
- **Yang paling baru dikerjakan:** (1) Momo = artwork animasi Owner, besar dan bebas, lebih besar dari Thinman; (2) panel Top-3 dikecilkan, keputusan langsung berlaku, pop-up "Masukkan ke dunia", pop-up sukses di dalam dunia dengan latar digelapkan; (3) tombol "Gambar lagi" digabung, "Petunjuk misi" ke kanan atas, switch Mouse|Kamera, label demo kalimat biasa; (4) modularisasi kode tanpa perubahan perilaku; (5) rapikan branch jadi satu.
- **Menunggu Owner:** nama+email commit (agar Claude tidak tercatat sebagai kontributor), nama branch GitHub (usulan `pa/frontend-integrated-2026-11`), pilihan evidence (apa adanya / bersih), izin tulis ulang riwayat lokal, lalu persetujuan push. Owner juga akan memberi "prompt revisi besar" berikutnya.
- **PERINGATAN:** commit hanya ada di container sesi ini. Sesi baru = clone baru dari remote -> kerja ini HILANG kalau belum di-push (atau diekspor). Jangan ganti sesi sebelum push disetujui.

## Operating model

- `CAN(USER)` = Project Owner / Product & R&D Lead / Final Approver. Ujang = infrastruktur, `can`, backup, deploy (jangan disentuh).
- Direct IT harness tanpa role delegasi = orchestrator; `ROLE: WORKER` eksplisit = worker. Worker mengembalikan hasil; orchestrator mempromosikan state tervalidasi.
- Governance (`INSTRUCTION.md`, `DECISIONS.md`, `SOURCE_OF_TRUTH.md`, `AGENTS.md`) hanya diubah dengan persetujuan Owner. Sejak 2026-11-05 `CHANGELOG.md` diganti nama `DECISIONS.md` atas instruksi Owner (D-20261105-10); perubahan teknis ada di `implementation/CHANGELOG.md`.

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
