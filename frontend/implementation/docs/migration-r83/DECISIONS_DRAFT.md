# Draf Pembaruan Keputusan Produk — Migrasi Sandbox r8.3

| Atribut | Nilai |
|---|---|
| Status dokumen | **DRAF SAJA — BELUM DITERAPKAN** (O-10 = TIDAK) |
| Tanggal draf | 2026-11-25 |
| Basis repo | `lustresense/hitl-momo` branch lokal `r83-migration` (basis `main` @ `3908119`, `0.29.6-alpha`) |
| Basis sandbox | `proto-html/r83/` (63 file, sha256 zip `d37e02f2bca6dc388133c7cc7c14d35030800a5706db2b0eb17db96f255e8695`) |
| Sumber rencana | `docs/migration-r83/R83_MIGRATION_PLAN.md` (§3, §4, Lampiran C, Lampiran E, Lampiran F) |
| Target akhir bila disetujui | `contexts/can/DECISIONS.md` (Protokol Pembaruan Semi-Otomatis) |

> **Catatan O-10 (SOP CAN):** File ini **hanya draf usulan patch keputusan**. Berkas master `contexts/can/DECISIONS.md` **belum disentuh dan tidak diubah** oleh agent. Keputusan baru dan revisi terhadap keputusan lama baru sah menjadi sumber kebenaran setelah Owner meninjau dan menyetujui secara eksplisit per ID (misalnya `SETUJUI D-20261125-01` s.d. `SETUJUI D-20261125-07` atau `TOLAK <ID>`).

---

## 1. Status Keputusan Lama yang Tersentuh (PLAN §3)

Migrasi r8.3 menyentuh **empat keputusan berstatus Aktif** (`D-20261110-07`, `D-20261110-02`, `D-20261116-01`, `D-20261105-23`) dan **dua keputusan berstatus Belum dikunci** (`D-20261105-15`, `D-20261115-02`) di `contexts/can/DECISIONS.md`, serta alur penggaris nomor absen (`D-20261110-05`, Aktif) yang terblokir kontrak lintas-owner.

| Keputusan (status di `contexts/can/DECISIONS.md`) | Isi sekarang di `DECISIONS.md` | Yang diubah oleh r8.3 | Draf pengganti / pengunci |
|---|---|---|---|
| **D-20261110-07** (`Aktif`) | Gestur menurut mode, tanpa kursor: pilih bab/Top-3/gagal dengan 1/2/3 jari, telapak = Bukan ini, cubit = Gambar lagi, redo = telapak terbuka/terbelah; semua aksi dengan cincin progres (`src/input/gesture-mode.ts`). | Diganti model hybrid empat aturan **A/B/C/D** dengan satu gestur **cubit**, kursor hanya tampil di kanvas (pensil/hapus), tanpa gestur jari 1/2/3 atau telapak. | `D-20261125-01`, `D-20261125-06` |
| **D-20261110-02** (`Aktif`) | Momo diam selama menggambar. Tebakan dan Top-3 hanya setelah siswa menahan jempol "selesai". Setelah **10 detik** diam, Momo bertanya dan indikator jempol menyala, tanpa menebak otomatis. | Jempol diganti ring **"Tebak Gambarku"** (cubit-tahan 2000 ms, mode `point`). Momo tetap diam tanpa gumam tebakan sementara (O-13 = MATI). Waktu diam sebelum Momo bertanya dan ring muncul berubah dari 10 detik menjadi **1 detik** (`GUESS_IDLE_MS = 1000`, O-14). | `D-20261125-01`, `D-20261125-07` |
| **D-20261116-01** (`Aktif`, M-036) | (1) Collider objek siswa = kotak gambarnya sendiri; (2) tidak menimpa spawn/bendera; (3) objek bahaya melukai di dalam gambarnya; (4) papan petunjuk akhir bab satu panah; (5) hanya tiga bab, semua teks siswa memakai kata **"Bab"**. | Istilah **"Bab"** di seluruh teks siswa diganti **"Level"** sesuai permintaan dosen (O-8). Collider kotak pada butir (1) direncanakan beralih ke **bentuk goresan** r8.3 di P7b sesuai O-6 (setelah P7 lulus dengan kotak). | `D-20261125-02`, `D-20261125-04` |
| **D-20261105-23** (`Aktif`, juga M-035) | PRD Revisi 0.0.16: semua jempol punya cincin progres (2 detik konfirmasi, 1 detik percakapan) dengan deteksi jempol nyata; Terima = jempol 2 detik; sampul dikonfirmasi jempol. | Semua gestur jempol diganti **cubit**. Sampul memakai ring **"Ayo!"** (aturan A, ikon cubit, 1000 ms). Durasi progres 1 detik (aksi biasa) / 2 detik (keputusan penting) dipertahankan; "Taruh di sini" 1,5 detik. | `D-20261125-01` |
| **D-20261105-15** (`Belum dikunci`, status: `RISET`) | Penutup permainan setelah Level 3 masih tahap riset (kajian gabungan Opsi A + B: Thinman berjalan di atas 3 objek pilihan siswa + rekap). | Dikunci ke penutup r8.3: 5 fase (`payung` terjun payung → `kolam` tinta dengan joystick → `bicara` penjelasan Momo dengan Thinman pose depan `thinrig` → `rekap` ala chat Momo dari data sesi asli → `akhir` ring "Kembali ke sampul" 2000 ms). | `D-20261125-05` |
| **D-20261115-02** (`Belum dikunci`, konflik keputusan dan kode) | Ketidakselarasan mapping gestur Card 1 (sudut telunjuk vs cubit-drag) dan Card 3 (cubit/telapak/1 jari/2 jari vs D-20261110-06/07). | Diselesaikan oleh model NUI tunggal r8.3: Kartu 1 memakai **joystick cubit** (geser kiri/kanan, tap/sentil lompat); Kartu 3 menjadi latihan kursor kanvas + **5 alat** (Pensil, Hapus parsial, Mundur, Maju, Bersihkan) dengan tunjuk lalu cubit. | `D-20261125-01`, `D-20261125-06` |
| **Identitas siswa — penggaris nomor absen** (`D-20261110-05`, `Aktif`) | Pemilihan nomor absen melalui penggaris horizontal tanpa tombol (`/onboarding/number`), mengirim `Siswa <n>`. | Diganti kenalan **nama lewat suara** (STT) tanpa nomor absen (arahan Owner, Nov 2026). **Terblokir kontrak backend DIAS** (§5.5): sementara tetap memakai alur nama + penggaris khusus bila masuk lewat link kelas (O-3 default `(b)`). | `D-20261125-03` |

---

## 2. Draf Patch Keputusan Baru (PLAN Lampiran C)

Format mengikuti Protokol Pembaruan Semi-Otomatis di `contexts/can/DECISIONS.md`.

### D-20261125-01 — [Usulan Aktif] — NUI hybrid satu gestur (cubit, aturan A/B/C/D)

- **Keputusan/ubahannya:**
  - Satu gestur **cubit** dipakai untuk seluruh aksi siswa setelah kamera menyala, menggantikan gestur jari 1/2/3, telapak terbuka, dan jempol.
  - Empat aturan interaksi (`src/nui/`):
    - **Aturan A (satu pilihan):** hanya satu target aktif; cubit-tahan di mana saja (di luar elemen chrome) mengisi ring target.
    - **Aturan B (beberapa pilihan):** target terdekat ke tangan menyala tanpa kursor; target dikunci saat cubit mulai agar tangan goyang tidak memindahkan pilihan; lepas cubit untuk mengganti.
    - **Aturan C (menggerakkan sesuatu):** cubit lalu geser > 26 px = tarik (ring berhenti terisi). Thinman memakai **joystick** dari titik awal cubit (deadzone 14 px, makin jauh makin cepat; tap < 230 ms & geser ≤ 10 px atau sentil ke atas > 40 px/140 ms = lompat). Penempatan benda & pita pilih level memakai **tarik relatif** (ambang mulai 12 px). Stiker memakai **sentil ke atas** (> 50 px/160 ms) untuk Lempar.
    - **Aturan D (kanvas):** satu-satunya tempat kursor tampil (ikon pensil atau bulatan hapus 44 px); alat dan ring di kanvas memakai mode `point` (harus ditunjuk lalu dicubit).
  - Semua ring memakai ikon cubit milik Owner dengan durasi: **1000 ms** aksi biasa (termasuk ring "Ayo!" sampul dan ring stiker efektif 1000 ms), **2000 ms** keputusan penting ("Ya, itu namaku", "Tebak Gambarku", pilihan baris tebakan/katalog, "Kembali ke sampul"), dan **1500 ms** untuk "Taruh di sini".
  - Kecepatan turun ring saat cubit terlepas memakai **0,5× kecepatan isi** (`RING_DRAIN_RATIO = 0,5`, keputusan Owner O-5) untuk toleransi putus cubit singkat di cahaya redup.
  - Input tangan kamera memakai resep R1 (jangkar MCP5, One Euro di ruang px, cubit dengan hysteresis 0,30/0,42 berkoreksi aspek, rollback klik 200 ms, tahan celah hilang tangan `T_gap`), wajib divalidasi Owner di gerbang webcam fisik **G2** dan **G9** (O-11).
- **Mengubah entri lama:** `D-20261110-07` (digantikan seluruhnya untuk mode r8.3), `D-20261110-02` (bagian gestur jempol selesai gambar), `D-20261105-23` (bagian "semua jempol" dan konfirmasi sampul dengan jempol), serta menyelesaikan konflik `D-20261115-02` (Card 1 joystick, Card 3 latihan kursor + 5 alat).
- **Bukti:** Diskusi Owner–Claude November 2026, masukan Bu Hesti (referensi interaksi gaya Meta Quest), riset kursor tangan webcam stabil (resep R1), mandat Owner atas sandbox `sketchbook-universe-sandbox-r8.3` (`proto-html/r83/shared/hand.js`), dan opsi O-5 / O-11 di `R83_NEON_PROMPT.md`.
- **Dampak:** Desain, kode (`src/nui/**`, seluruh layar `src/features/**`), dokumen PA, presentasi.
- **Alasan status:** Arahan eksplisit Owner pada sandbox r8.3 dan konfigurasi O-5/O-11; validasi rasa tangan webcam nyata menunggu G2 & G9.
- **Menunggu:** `SETUJUI` atau `TOLAK` Owner.

---

### D-20261125-02 — [Usulan Aktif] — Istilah "Level" menggantikan "Bab" di teks siswa

- **Keputusan/ubahannya:**
  - Kata **"Level"** menggantikan kata **"Bab"** di seluruh teks yang dilihat siswa pada mode r8.3 (judul level, pilih level, papan petunjuk "Lanjut ke Level 2/3", CTA kartu tutorial "Pilih level", dan kalimat Momo).
  - Identifier internal kode dan teks layar lama (di balik flag `NEXT_PUBLIC_UI_R83=0`) tetap dipertahankan selama layar lama masih ada agar suite E2E lama tidak pecah.
- **Mengubah entri lama:** `D-20261116-01` bagian istilah (butir "semua teks siswa memakai kata Bab" / dirujuk sebagai butir (3) pada ringkasan PLAN §3 & Lampiran C).
- **Bukti:** Permintaan dosen pembimbing; persetujuan eksplisit Owner **O-8 = YA** di `R83_NEON_PROMPT.md`; sandbox r8.3 (`proto-html/r83/MAP.md` Revisi 8.3).
- **Dampak:** Copy siswa (`src/domain/copy/*`), `StageArtwork.tsx` (prop opsional), dokumen PA, presentasi.
- **Alasan status:** Keputusan eksplisit Owner (O-8) berdasarkan arahan dosen.
- **Menunggu:** `SETUJUI` atau `TOLAK` Owner.

---

### D-20261125-03 — [Usulan Aktif — Bertahap / Terblokir Kontrak DIAS] — Identitas siswa menggunakan nama lewat suara (STT), nomor absen dihapus

- **Keputusan/ubahannya:**
  - Identitas siswa di alur onboarding berubah dari penggaris nomor absen menjadi **kenalan nama lewat suara (STT)** di halaman "SIAPA NAMAMU?" (ring "Mulai bicara" aturan A 1000 ms, waktu dengar 7000 ms, normalisasi nama maks 3 kata / 24 karakter, konfirmasi aturan B: "Ulangi" 1000 ms / "Ya, itu namaku" 2000 ms).
  - **Tahap transisi (O-3 default `(b)`):** Karena `POST /api/join/{token}/students` milik DIAS saat ini mewajibkan `number` dan melakukan upsert `(class_id, number)` yang menimpa `name` (`backend/app/classroom.py:72-93`), penghapusan nomor secara total baru diaktifkan setelah kontrak join berbasis nama tanpa nomor dari DIAS tersedia (`docs/migration-r83/CONTRACT_PROPOSALS.md`). Selama masa transisi:
    - Main tanpa link kelas: cukup langkah nama, tanpa penggaris nomor.
    - Masuk lewat link kelas: langkah nama diikuti penggaris nomor absen (`rulerPlusName`), sementara adapter `nameOnly` tetap mati di balik flag `NEXT_PUBLIC_JOIN_NAME_ONLY`.
  - **Provider STT & fallback (O-4, O-15):** Provider `stt-lab` dibuat sebagai stub gagal-tertutup sampai ada kontrak DIAS; fallback ketik oleh guru di elemen chrome selalu tersedia agar tidak ada dead-end; Web Speech API dan nama contoh `"Bima"` hanya boleh berjalan di mode dev (`NEXT_PUBLIC_DEV_TOOLS=1`) berlabel `SIMULASI`.
  - **Privasi anak:** Nama siswa tidak dicatat di event telemetri, `console`, `localStorage`, atau laporan; tidak ada rekaman audio yang disimpan.
- **Mengubah entri lama:** `D-20261110-05` (penggaris nomor absen) dan bagian identitas pada `D-20261105-23` secara bertahap (penuh setelah kontrak DIAS tersedia).
- **Bukti:** Arahan Owner (November 2026), sandbox r8.3 (`proto-html/r83/onboarding/cam/index.html:1110-1189`), audit backend `backend/app/classroom.py:72-93`, keputusan Owner O-3, O-4, dan O-15 di `R83_NEON_PROMPT.md`.
- **Dampak:** Kode (`src/features/cover/name/*`, `src/features/cover/join/*`), kontrak lintas-owner ke DIAS (`CONTRACT_PROPOSALS.md`), dokumen PA.
- **Alasan status:** Arahan eksplisit Owner dengan ketergantungan kontrak backend DIAS (bertahap).
- **Menunggu:** `SETUJUI` atau `TOLAK` Owner (serta kesepakatan kontrak DIAS untuk fase penuh `nameOnly` dan `stt-lab`).

---

### D-20261125-04 — [Usulan Aktif — Bertahap P7 → P7b] — Collider objek mengikuti bentuk goresan (O-6)

- **Keputusan/ubahannya:**
  - Sesuai opsi **O-6**, collider objek hasil gambar siswa di mode r8.3 mengikuti **bentuk goresan** (gaya sandbox r8.3 `shared/level/shape.js`, L-7: goresan setebal `T = 3,2` satuan sumber, area tertutup padat, daftar persegi per rotasi, tanjakan ≤ 5 satuan).
  - Pengerjaan dilakukan bertahap: fase **P7** lulus terlebih dahulu dengan collider kotak eksisting sebagai titik aman teruji, kemudian collider bentuk goresan (`src/game/runtime/shape-collider.ts`) ditambahkan di fase **P7b** di balik opsi dengan syarat seluruh invariant tetap terpenuhi (konstanta fisika 1600/130/520 tetap, minimal 2 objek per level, "satu objek tidak cukup", dan tes keterselesaian Level 1–3 lulus).
- **Mengubah entri lama:** `D-20261116-01` butir (1) (collider = kotak gambar) pada mode r8.3 setelah P7b aktif. Jalur kotak tetap tersedia sebagai default pada mode lama.
- **Bukti:** Sandbox r8.3 (`proto-html/r83/MAP.md` Revisi 2 L-7, `shared/level/shape.js`), keputusan Owner **O-6** di `R83_NEON_PROMPT.md`.
- **Dampak:** Kode (`src/game/runtime/shape-collider.ts`, `creations.ts`, `integrated-scene.ts`), uji keterselesaian level, dokumen PA.
- **Alasan status:** Keputusan eksplisit Owner (O-6), penerapannya menunggu gerbang P7 dan P7b lulus.
- **Menunggu:** `SETUJUI` atau `TOLAK` Owner.

---

### D-20261125-05 — [Usulan Aktif — Mengunci Riset] — Penutup permainan r8.3 (5 fase)

- **Keputusan/ubahannya:**
  - Penutup setelah Level 3 selesai ditempatkan pada route statis `/ending` (dengan guard: hanya dapat diakses setelah Level 3 selesai) mengikuti urutan **5 fase sandbox r8.3**:
    1. **Terjun payung (`payung`):** Thinman mendarat menggunakan parasut ke Pusat Halaman dengan kamera zoom berbasis tinggi layar (Thinman 21%).
    2. **Kolam tinta (`kolam`):** siswa menuntun Thinman dengan joystick menuju kolam tinta ajaib; Thinman menyelam dan keluar bercahaya lalu menjadi oranye (`"Eh! Kamu... hidup?"`).
    3. **Penjelasan Momo (`bicara`):** Thinman berjalan ke kiri-tengah menghadap siswa dengan rig GSAP `thinrig` (bernapas, melambai, mengangguk — tidak lagi dijalankan), Momo di sebelah kanan (anchor `ending`), menjelaskan peran AI dan siswa, diakhiri ring `"Aku mengerti"` (aturan A, 1000 ms).
    4. **Rekap (`rekap`):** rekap gaya chat Momo menampilkan gambar/keputusan siswa per level dari **data sesi asli** (tanpa data contoh/dummy).
    5. **Selesai (`akhir`):** ring `"Kembali ke sampul"` (aturan A, 2000 ms) di dalam/sekitar bubble Momo.
- **Mengubah entri lama:** Mengunci **D-20261105-15** (sebelumnya berstatus `Belum dikunci / RISET`).
- **Bukti:** Sandbox r8.3 (`proto-html/r83/shared/end/*`, `MAP.md` Revisi 2, 6, 7, 8.3), mandat Owner "plek UI & UX r8.3" (`R83_MIGRATION_PLAN.md` §7.6 & Lampiran F butir 5).
- **Dampak:** Desain, kode (`app/ending/page.tsx`, `src/features/ending/**`, `src/domain/copy/ending.ts`), dokumen PA, presentasi.
- **Alasan status:** Prototipe r8.3 disetujui Owner sebagai acuan UI & UX; mengunci status RISET sebelumnya.
- **Menunggu:** `SETUJUI` atau `TOLAK` Owner.

---

### D-20261125-06 — [Usulan Aktif] — Kanvas lima alat (dengan Bersihkan yang bisa di-undo) tanpa gestur jari undo/redo

- **Keputusan/ubahannya:**
  - Kanvas menggambar dan Kartu Tutorial 3 menyediakan **5 alat** yang dipilih melalui aturan D (tunjuk tombol alat, lalu cubit): **Pensil**, **Hapus parsial** (bulatan 44 px, memotong segmen goresan `eraseSegments = true` sesuai O-7), **Mundur (Undo)**, **Maju (Redo)**, dan **Bersihkan (`StrokeStore.wipe()`)**.
  - Alat **Bersihkan** mengosongkan kanvas sebagai satu langkah riwayat undo/redo (`StoreOp` erase), sehingga siswa dapat mengembalikan seluruh goresan dengan Mundur. Perilaku `StrokeStore.clear()` (dipakai jalur Redraw) tidak berubah.
  - Gestur satu jari / dua jari / telapak terbuka untuk undo/redo/hapus dihapus di mode r8.3.
  - Kartu Tutorial 3 baru tercentang lengkap setelah seluruh **5 alat** dicoba (`TUTORIAL_TOOLS_REQUIRED = 5`).
- **Mengubah entri lama:** `D-20261110-07` (bagian gestur alat kanvas dan redo telapak) dan menyelesaikan `D-20261115-02` (bagian Card 3).
- **Bukti:** Sandbox r8.3 (`proto-html/r83/MAP.md` Revisi 8.3, `shared/level/canvas.js`, `shared/kartu/kartu.js:148-151`), keputusan Owner **O-7 = YA** di `R83_NEON_PROMPT.md`.
- **Dampak:** Kode (`src/input/types.ts` `wipe()`, `src/features/canvas/**`, `src/features/tutorial/cards/CardCanvasTools.tsx`), tes unit & E2E.
- **Alasan status:** Keputusan eksplisit Owner pada r8.3 dan O-7.
- **Menunggu:** `SETUJUI` atau `TOLAK` Owner.

---

### D-20261125-07 — [Usulan Aktif] — Perilaku Momo di kanvas (tanpa gumam tebakan sementara; jeda tanya 1 detik)

- **Keputusan/ubahannya:**
  - Sesuai **O-13 = MATI**, Momo **tidak** menggumamkan tebakan sementara saat siswa masih menggambar di kanvas. Momo hanya menampilkan kalimat cue saat kertas kosong, tanpa data tebakan heuristik palsu dan tanpa pemanggilan `/predict` berulang saat siswa sedang menggambar.
  - Sesuai **O-14**, setelah ada goresan dan tangan diam selama **1000 ms** (`GUESS_IDLE_MS = 1000`), Momo bertanya dan ring **"Tebak Gambarku"** (mode `point`, cubit-tahan 2000 ms) muncul di samping area gambar. Prediksi tetap hanya dikirim ke provider setelah siswa menyelesaikan ring tersebut (tidak pernah menebak otomatis).
- **Mengubah entri lama:** `D-20261110-02` (mempertahankan prinsip "Momo diam selama menggambar" dan "tidak menebak otomatis", tetapi mengubah jeda tangan diam dari **10 detik** menjadi **1 detik** dan mengganti jempol selesai menjadi ring "Tebak Gambarku" 2000 ms).
- **Bukti:** Keputusan Owner **O-13** dan **O-14** di `R83_NEON_PROMPT.md`; `R83_MIGRATION_PLAN.md` §0 butir 6, §4, dan Lampiran C; `proto-html/r83/shared/level/canvas.js:9`.
- **Dampak:** Kode (`src/features/canvas/GuessRing.tsx`, `src/nui/core/constants.ts`), perilaku HITL, dokumen PA.
- **Alasan status:** Keputusan eksplisit Owner (O-13 & O-14).
- **Menunggu:** `SETUJUI` atau `TOLAK` Owner.

---

## 3. Ringkasan Persetujuan Owner

Untuk menerapkan draf ini ke `contexts/can/DECISIONS.md` (pada fase rekonsiliasi atau setelah izin tertulis Owner mengubah O-10), Owner cukup membalas status tiap ID:

- [ ] `D-20261125-01` — NUI hybrid satu gestur (A/B/C/D)
- [ ] `D-20261125-02` — Istilah "Level" menggantikan "Bab"
- [ ] `D-20261125-03` — Identitas siswa nama lewat suara (bertahap sesuai kontrak DIAS)
- [ ] `D-20261125-04` — Collider objek bentuk goresan (P7b, O-6)
- [ ] `D-20261125-05` — Penutup permainan r8.3 5 fase (mengunci D-20261105-15)
- [ ] `D-20261125-06` — Kanvas 5 alat + Bersihkan yang bisa di-undo
- [ ] `D-20261125-07` — Momo di kanvas (O-13 mati, O-14 jeda 1000 ms)
