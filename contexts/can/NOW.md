# NOW

## 2026-11-15 — batch REV-B04 setelah GAS (0.18.0-alpha, STATIC_ONLY)
- Baseline `ujang-monorepo` 24e17c4 (0.17.1-alpha). Perubahan source untuk B04-001 loader readiness/staging, B04-002 static route cam/bubble, B04-003 wave diagnostic dan single-owner warm reuse 30 s. B04-004 hanya opsi dan tidak diaktifkan.
- Evaluasi: source dan test file berubah, **BELUM DIJALANKAN** typecheck, lint, Vitest, Next build, Playwright/static-host, webcam fisik, performance trace. Tidak ada bukti deployment Ujang. Nama versi batch merujuk root `VERSION`, bukan klaim deploy.
- Invarian: Card kamera lama, Card 1/3 mapping 0.17.1, jempol selesai, wave wake cover, visual Claude, model mock, `main` tidak diubah.
- Laporan untuk implementer `frontend/implementation/docs/execution/REV-B04-0.18.0-alpha.md`; revisi Owner `REVISIONS.md`.

## 2026-11-15 — status aktif GitHub Can / NUI
- **Branch kerja atas permintaan Owner:** `ujang-monorepo`, HEAD sumber `cebbaa4797c963da80090d54728a5b0e39c811e4`, versi global `0.17.0-alpha`; `main` tidak boleh diubah tanpa perintah baru Owner.
- **Source yang benar-benar terlihat:** perbaikan gesture/icon, Card 3, BookFlip, Momo recovery kamera, NUI Lab, instalasi/handoff; patch sebelumnya `0.16.1-alpha` mencakup FaceAnchor/backlight/wave. Inspeksi dan commit via GitHub membuktikan keberadaan source, BUKAN runtime.
- **Bukti:** `STATIC_ONLY` dan `NOT_TESTED` untuk typecheck, lint, Vitest, build, E2E, kamera fisik dan URL deployed. Tidak ada CI sukses pada `cebbaa4` ketika diperiksa. Jangan mengubah status menjadi PASS sebelum log konkret.
- **Keputusan:** D-20261115-01 mengunci artwork ikon gesture yang dibuat sendiri; D-20261115-02 menandai konflik mapping Card 1/Card 3 dengan D-20261110-06/07 sebagai Belum dikunci.
- **Sumber terbaru:** `REVISIONS.md` R15-01..06, `project/OWNER_MANDATES.md` M-032/033, `frontend/implementation/docs/execution/UJANG_HANDOFF_0.17.0-alpha.md`, `CHANGELOG.md` root.
- **Next:** Ujang verifikasi `scripts/ujang-verify-web.sh`, browser E2E serta webcam USB dan deploy; Owner cukup membuka URL web setelah Ujang memberikan bukti.

Base ancestry: `54ebec1830760fe0b692d7a40b25ceb041bfdef9` (descendant of `840973b4d4e76d829b8e2059912ee393051616c7`)

Diperbarui: 2026-11-05. Satu halaman: keadaan paling baru. Keputusan: `DECISIONS.md` (D-20261105-01..24; riwayat GPT di Lampiran). Aturan kerja/TOV: `SOUL.md`. Instruksi Owner satu per satu: `project/OWNER_MANDATES.md`. Perubahan teknis per versi: `implementation/CHANGELOG.md` (0.0.13). Laporan progres yang bisa dibaca Owner dan Ujang: `implementation/docs/execution/PROGRESS_REPORT_2026-11-05.md`.

## 2026-11-11 — keadaan terbaru (monorepo `claude-monorepo`)
- **Daftar tugas revisi Owner dan statusnya: `REVISIONS.md`.** Mulai dari sana kalau melanjutkan pekerjaan di sesi/agent lain.
- Keputusan D-20261110-01..10 disahkan Owner 2026-11-11; D-20261111-01 (data dikirim saat cincin keputusan Top-3).
- Lokasi game sekarang: `frontend/implementation/` di monorepo (branch `claude-monorepo`). Branch `can` tidak diubah.
- Instruksi Owner 10 Nov (big prompt + REVISI-NUI) dikerjakan oleh tim AI. Audit, storyboard, rencana, rekonsiliasi dan draft keputusan: `contexts/can/docs/audit-2026-11-10/`. `DECISIONS.md` belum diubah; draft `D-20261110-01..10` menunggu `SETUJUI`.
- Hanya tiga level (Level 4 dari 2026-11-09 dihapus).
- Bukti: lihat `RESULTS-2026-11-11.md` di folder audit (unit test, E2E browser mode mouse, screenshot). Kamera fisik BELUM diuji.
- Pemblokir dari partner: model Dias mengenali 20 kelas umum yang tidak cocok dengan benda level; dengan model asli semua keputusan menjadi "tidak dikenali" di gameplay (`contracts/LABEL_MAP_PROPOSAL.md`).
- Menunggu Owner: `SETUJUI` draft keputusan; nama Thinman/Tinman; keputusan label model bersama Dias; uji dengan kamera.

## Posisi (2026-11-05, arsip)
- Branch kerja: `can` (sudah memuat semua kerja sesi sebelumnya; revisi 0.0.14 ditambahkan di atasnya).
- Prototype playable end-to-end dengan prediksi **MOCK**: Onboarding -> L1 -> L2 -> L3 menang dengan mouse/keyboard asli; gagal/retry/Redraw/geser terbukti.
- Commit terakhir yang diuji penuh: `383c3bc` (548/548 unit test, tsc, lint, build, E2E journey + recovery 16/16 + hand-control 6/6 + MediaPipe init dengan kamera palsu). Bukti: `implementation/docs/execution/evidence/final-383c3bc/`. Sesudahnya hanya dokumen dan struktur folder yang berubah.

## Paling baru (terbaru di atas)
00000000. PRD 0.0.16 dikerjakan lewat agent team (D-20261105-23, D-20261105-24; teknis di `implementation/CHANGELOG.md` 0.0.16). Gate: vitest 646/646, tsc, lint, build lulus; e2e journey L1-L3 + penutup, recovery 16/16, guide-flow, hand-control, mediapipe, audit sayap lulus di putaran sebelum perbaikan terakhir (jempol anti-carry, picker disembunyikan di mode kamera, Lanjut jempol 1 detik, mulai gambar dengan tangan). E2E diulang setelah perbaikan itu (2026-11-09) dan lulus semua: vitest 646/646, journey L1-L3 + penutup, recovery 16/16, guide-flow, hand-control, mediapipe, audit sayap. Video showcase dibatalkan Owner (hemat token). Di-push ke `can` atas perintah Owner untuk dicoba di deploy sendiri.
0000000. PRD Revisi 0.0.16 ditulis (RENCANA, belum dikerjakan): `project/PRD_REVISI_0.0.16.md`, D-20261105-23, M-019. Menunggu `SETUJUI PRD 0.0.16`.
000000. Momo memandu semua halaman sebelum game (M-016, D-20261105-19; teknis di `implementation/CHANGELOG.md` 0.0.15): cover (tidur, bangun saat kamera menyala, menyapa satu sayap, menunjuk penggaris), penggaris, tutorial tiga kartu, daftar level; lanjut ke intro/gambar/dunia yang sudah dipandu Momo. Video di `implementation/docs/execution/evidence/momo-guide-2026-11-05/`. Sudah di-push ke `can` atas perintah Owner (D-20261105-20).
00000. Sayap Momo diperbaiki di semua animasi: sudut atas dan tepi tempel diam, hanya ujung bawah naik-turun (D-20261105-17, M-015, `momo-wing.ts`). Papan Momo diekspor ulang. Seluruh isi percakapan sesi ini diklasifikasikan di D-20261105-18.
0000. Buku karakter dibuat sebagai **dua papan 1:1** (Thinman, Momo) di satu folder `academic/progress-book/karakter/`: HTML mandiri + PNG/MP4/GIF untuk PPT dan Word (Thinman kiri/kanan/depan/belakang + animasi lari/loncat/lari+loncat; Momo besar + 12 ekspresi + status pemakaian). Dibangun dari kode lewat `node tools/character-book/build.mjs` dan `export.mjs`. Keputusan D-20261105-16. Detail gabungan A+B penutup (objek pilihan siswa + kategori Solid/Danger + ikon keputusan) dicatat di D-20261105-15, masih RISET. Aturan: ubah isi `implementation/` -> `implementation/CHANGELOG.md`; keputusan dan dokumen di luar `implementation/` -> `DECISIONS.md`.
000. Keputusan sesi revisi dicatat di `DECISIONS.md`: D-20261105-12 (Momo chat, akhir level langsung ke pilih level), D-13 (tarik pita, intro cerita, kamera ke langit, petunjuk oleh Momo), D-14 (bahasa visual: shadow hanya di elemen, bukan teks). **D-20261105-15 masih RISET (belum dikunci):** penutup setelah L3, arah yang dikaji A+B, C ditunda; dokumen diskusi dosen `project/OPSI_PENUTUP_PERMAINAN.md`. Jangan diimplementasikan sebelum `SETUJUI D-20261105-15`.
00. Revisi besar visual/flow (M-012, changelog 0.0.14) di branch `can`: kit UI bersama, Momo sebagai chat, intro cerita + kamera naik ke langit, pilih level baru (progres L1->L2->L3 terbukti E2E), tutorial 3 kartu baru. 549 unit test, lint, build, E2E journey/recovery/hand-control/MediaPipe lulus. Bukti: `implementation/docs/execution/evidence/ui-pass-2026-11-05/`. Usulan keputusan (belum dikunci, butuh persetujuan Owner): cerita Momo di awal level menggantikan modal petunjuk SISTEM (D-20261101-01 berstatus belum aktif).
0. Zip project GPT diimpor: `INSTRUCTION.md` -> `SOUL.md` (isi versi GPT 2026-11-02); riwayat keputusan GPT (14 entri, 59 ID) digabung ke `DECISIONS.md` tambah-saja dengan peta konflik; teks instruksi native GPT versi baru di `docs/ai-workflow/GPT_PROJECT_INSTRUCTION.md`. Keputusan `D-20261105-11`.
1. Dokumen dirapikan: `CHANGELOG.md` -> `DECISIONS.md`; rilis teknis ke `implementation/CHANGELOG.md`; `project/OWNER_MANDATES.md`; `NOW.md` format Ujang; berkas coretan dipindah ke `tools/scratch/` dan `implementation/scripts/scratch/` (tidak ada yang dihapus).
2. Semua kerja dikumpulkan di satu branch (`claude/tolol` = redesign palet yang ditolak, jangan dipakai).
3. Modularisasi frontend tanpa perubahan perilaku/tampilan.
4. Momo (artwork animasi Owner) besar dan bebas, Thinman lebih kecil, "Gambar lagi" satu tombol, "Petunjuk misi" kanan atas.
5. Alur HITL baru: keputusan langsung berlaku, "Masukkan ke dunia", pop-up sukses di dalam dunia.

## Menunggu
- Owner: persetujuan push (nama branch GitHub usulan `pa/frontend-integrated-2026-11`; pilihan evidence: apa adanya atau bersih); prompt revisi besar. Identitas commit sudah beres: 45 commit atas nama Owner, tanpa baris Claude.
- Ujang: baca laporan progres; konfirmasi format `NOW.md` (di sini hanya header "Base ancestry" yang diketahui).

## Peringatan
Revisi 0.0.14 sudah di-push ke `origin/can`. Kerja baru setelah push hanya ada di container sampai di-push lagi.

## Masih terbuka
Momo yang bergerak maju-mundur sendiri; ratifikasi coyote time; hapus objek; akhir permainan setelah L3 (D-20261105-15, masih riset); layout 390 px di HP. BLOCKED: model nyata dan logging backend (partner), webcam fisik (hardware), evaluasi siswa (Owner).
