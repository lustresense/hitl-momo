# Rekonsiliasi Copy Siswa — Migrasi Sandbox r8.3

| Atribut | Nilai |
|---|---|
| Tanggal | 2026-11-25 |
| Basis repo | `lustresense/hitl-momo` branch lokal `r83-migration` (`main` @ `3908119`) |
| Sumber rencana | `docs/migration-r83/R83_MIGRATION_PLAN.md` (Lampiran B, §2.4 butir 5, §4 O-8) |
| Model label aktif (DIAS) | 20 kelas di `weights/model_4_mobilenetv2.labels.json`: `tangga`, `anak tangga`, `jembatan`, `bangku`, `meja`, `papan luncur`, `kaktus`, `api unggun`, `petir`, `gergaji`, `pisau`, `pedang`, `ular`, `laba-laba`, `pagar`, `zigzag`, `garis`, `awan`, `ember`, `payung` |

---

## 1. Tabel Rekonsiliasi Copy (PLAN Lampiran B)

| # | Lokasi | Teks sekarang | Masalah | Usulan | Status Persetujuan Owner |
|---|---|---|---|---|---|
| 1 | **Kartu 2** (`proto-html/r83/shared/kartu/kartu.js:27`; juga `src/domain/tutorial-script.ts:22` di `main`) | `"Gambar benda padat kayak balok atau tangga biar Thinman bisa lewat. Hindari benda bahaya kayak duri biar bukunya nggak sobek."` | `"balok"` dan `"duri"` tidak ada di 20 kelas model DIAS (`weights/model_4_mobilenetv2.labels.json`). | `"Gambar benda padat kayak tangga atau jembatan biar Thinman bisa lewat. Hindari benda bahaya kayak kaktus biar bukunya nggak sobek."` | **`PENDING_OWNER`** — Sebelum disetujui Owner, worker P4 memakai teks sandbox apa adanya dan menandainya `// COPY-PENDING-OWNER`. |
| 2 | **Alasan gagal Level** (`proto-html/r83/shared/level/play.js:10`) | `"Thinman kena duri. Cari jalan yang lebih aman."` (`"kena duri"`) | `"duri"` di sini adalah hazard lingkungan panggung Level 2/3, bukan label objek gambar siswa. | **Biarkan** (tetap `"kena duri"`). | **DISETUJUI_DEFAULT** (tanpa perubahan copy). |
| 3 | **Intro dunia Level 3** (`src/domain/world-intro-script.ts:22,42`) | `"Lorong ini berkabut dan lantainya penuh duri."` / `"Lantainya penuh duri. Kamu mau gambar benda yang aman buat {character} di langit?"` (`"lantainya penuh duri"`) | Sama seperti #2: hazard lingkungan panggung, bukan label objek gambar siswa. | **Biarkan** (tetap `"lantainya penuh duri"`). | **DISETUJUI_DEFAULT** (tanpa perubahan copy). |
| 4 | **Rekap contoh penutup** (`proto-html/r83/shared/end/end.js:33-37`, dirujuk Lampiran B sebagai `end.js:35-36`) | Data `SAMPLE`: `papan`, `balok`, `tangga`, `tali` | Data contoh khusus sandbox (dan sebagian label tidak ada di 20 kelas model). | **Tidak di-port.** Rekap penutup TS wajib membaca data sesi siswa asli (tanpa data contoh/dummy). | **DISETUJUI_PLAN** (aturan keras: tanpa data palsu). |
| 5 | **Judul Level** (`src/domain/levels.ts:157,175,202`) | `"Bab 1 · Jembatan Pertama"`, `"Bab 2 · Menara Lipatan"`, `"Bab 3 · Lorong Kabut Penghapus"` | Permintaan dosen: dilarang memakai kata `"Bab"` di teks siswa. | `"Level 1 · Jembatan Pertama"`, `"Level 2 · Menara Lipatan"`, `"Level 3 · Lorong Kabut Penghapus"` di modul copy r83 (`src/domain/copy/*`). | **DISETUJUI_OWNER (O-8)** — Sudah disetujui Owner (`O-8 = YA`), langsung diterapkan di copy r83. |
| 6 | **Papan petunjuk akhir level** (`src/components/stage-preview/StageArtwork.tsx:64-65`) | `1: { small: 'Lanjut ke', big: 'Bab 2' }`, `2: { small: 'Lanjut ke', big: 'Bab 3' }` | Sama seperti #5: mengandung kata `"Bab"`. | `"Lanjut ke / Level 2"` dan `"Lanjut ke / Level 3"` lewat prop opsional pada `StageArtwork` (default lama tetap dipakai layar lama saat flag = 0). | **DISETUJUI_OWNER (O-8)** — Sudah disetujui Owner (`O-8 = YA`), langsung diterapkan di mode r83 via prop opsional. |

---

## 2. Aturan Penerapan untuk Worker (Wajib Dipatuhi)

1. **Scope penulisan copy r83:** Seluruh perubahan pada tabel di atas hanya masuk ke modul copy baru `src/domain/copy/*` dan prop opsional pada `StageArtwork.tsx`.
2. **Isolasi layar lama:** `src/domain/levels.ts`, `src/domain/tutorial-script.ts`, dan seluruh copy layar lama **tidak boleh diubah** selama layar lama masih ada di balik flag `NEXT_PUBLIC_UI_R83=0`, agar suite E2E lama (`guide-flow`, `route-canvas`, dll.) tetap identik dengan baseline P0.
3. **Baris O-8 (Item #5 dan #6):** Sudah disetujui Owner (`O-8 = YA`), sehingga worker P5 (Pilih level), P7 (Dunia), P6 (Kanvas), dan P8 (Penutup) langsung menerapkan `"Level"` pada copy r83.
4. **Baris `PENDING_OWNER` (Item #1 — Kartu 2):** Selama status masih `PENDING_OWNER`, worker P4 (Kartu tutorial) **wajib menyalin teks sandbox r8.3 apa adanya** (`"balok atau tangga"` / `"duri"`) dan menambahkan komentar `// COPY-PENDING-OWNER` tepat di baris konstanta tersebut. Penggantian ke `"tangga atau jembatan"` / `"kaktus"` hanya dilakukan setelah Owner menyetujuinya di bawah.
5. **Larangan mengubah copy di luar tabel:** Worker **tidak boleh** mengubah, merapikan, atau menulis ulang copy sandbox r8.3 di luar tabel Lampiran B di atas. Semua kalimat Momo dan label layar lain disalin 1:1 dari sandbox r8.3.

---

## 3. Catatan Tambahan untuk Perhatian Owner (Di Luar Tabel Perubahan)

- **Kalimat `AI_TALK` di penutup (`proto-html/r83/shared/end/end.js:12-13`):** Sandbox r8.3 memuat komentar `PROPOSAL (E-4)` dengan 3 baris: `"Aku ini gambaran dari AI, bukan AI yang sebenarnya."`, `"Aku menebak dari pola goresan yang pernah kulihat, jadi tebakanku bisa salah."`, dan `"Kamu yang memutuskan benda apa yang masuk ke dunia ini."` (juga dicatat di `proto-html/r83/MAP.md:61`). Sesuai mandat r8.3, worker P8 menyalin teks sandbox r8.3 apa adanya ke `src/domain/copy/ending.ts` tanpa menyentuh `src/domain/ending-script.ts` lama; Owner dapat mengubahnya bila diperlukan saat tinjauan P8/G9.
- **Label runtime katalog & tebakan:** Daftar kandidat Top-3 dan katalog "Bukan ini, pilih lainnya" (katalog level dikurangi label Top-3) **selalu** berasal dari provider prediksi dan `src/domain/levels.ts` (20 kelas model DIAS), **bukan** dari `shared/level/data.js` sandbox.

---

## 4. Persetujuan Owner untuk Item `PENDING_OWNER`

| Item | Keputusan Owner (centang satu) | Tanggal | Catatan Owner |
|---|---|---|---|
| **#1 Kartu 2:** `"balok"` / `"duri"` → `"tangga"` / `"jembatan"` / `"kaktus"` | [ ] **SETUJUI usulan** / [ ] **TETAP teks sandbox** / [ ] **Revisi lain:** … | `____-__-__` | |
