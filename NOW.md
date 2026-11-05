# NOW

Base ancestry: `54ebec1830760fe0b692d7a40b25ceb041bfdef9` (descendant of `840973b4d4e76d829b8e2059912ee393051616c7`)

Diperbarui: 2026-11-05. Satu halaman: keadaan paling baru. Keputusan: `DECISIONS.md` (D-20261105-01..19; riwayat GPT di Lampiran). Aturan kerja/TOV: `SOUL.md`. Instruksi Owner satu per satu: `project/OWNER_MANDATES.md`. Perubahan teknis per versi: `implementation/CHANGELOG.md` (0.0.13). Laporan progres yang bisa dibaca Owner dan Ujang: `implementation/docs/execution/PROGRESS_REPORT_2026-11-05.md`.

## Posisi
- Branch kerja: `can` (sudah memuat semua kerja sesi sebelumnya; revisi 0.0.14 ditambahkan di atasnya).
- Prototype playable end-to-end dengan prediksi **MOCK**: Onboarding -> L1 -> L2 -> L3 menang dengan mouse/keyboard asli; gagal/retry/Redraw/geser terbukti.
- Commit terakhir yang diuji penuh: `383c3bc` (548/548 unit test, tsc, lint, build, E2E journey + recovery 16/16 + hand-control 6/6 + MediaPipe init dengan kamera palsu). Bukti: `implementation/docs/execution/evidence/final-383c3bc/`. Sesudahnya hanya dokumen dan struktur folder yang berubah.

## Paling baru (terbaru di atas)
000000. Momo memandu semua halaman sebelum game (M-016, D-20261105-19): cover (tidur, bangun saat kamera menyala, menyapa satu sayap, menunjuk penggaris), penggaris, tutorial tiga kartu, daftar level; lanjut ke intro/gambar/dunia yang sudah dipandu Momo. Video di `implementation/docs/execution/evidence/momo-guide-2026-11-05/`. Commit, belum push.
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
Commit hanya ada di container sesi ini. Sesi baru meng-clone dari remote, jadi pekerjaan ini hilang jika belum di-push atau diekspor.

## Masih terbuka
Momo yang bergerak maju-mundur sendiri; ratifikasi coyote time; hapus objek; akhir permainan setelah L3 (D-20261105-15, masih riset); layout 390 px di HP. BLOCKED: model nyata dan logging backend (partner), webcam fisik (hardware), evaluasi siswa (Owner).
