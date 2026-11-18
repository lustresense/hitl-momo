# CAN-FRONTEND-AUDIT — audit frontend Can, 2026-11-10

Dasar: branch `claude-monorepo`, HEAD `1b880fa`. Keputusan yang dibaca: `contexts/can/DECISIONS.md` pada commit `fe73df3`, `contexts/can/NOW.md`. Pembanding: `d4bbaec` (branch `can`), `9f9d35d`, `5c05cc3`, `8926992`, `8520cda`, `be7c8b2`.
Cara: lima auditor read-only membaca source dan riwayat git. Semua temuan statis. Tidak ada pengukuran runtime dan tidak ada kamera fisik.
Tanda: SESUAI, RUSAK, HILANG, MOCK, BELUM TERBUKTI.

## Ringkasan lead

1. **Animasi "dipercepat".** Dua sebab. (a) Commit Can `8520cda` mempersingkat kartu: deal 0,95 s menjadi 0,7 s, buka dan flip 0,95 s menjadi 0,8 s, tutup 0,5 s menjadi 0,42 s. Nilai normal ada di `9f9d35d`. (b) Jalur `prefers-reduced-motion`: kartu `timeScale(6)`, buka buku menjadi fade 0,2 s, Zzz satu huruf diam, morph kamera dan fly-in dihapus. Screenshot Owner (satu "z" diam) hanya bisa berasal dari jalur (b). BELUM TERBUKTI di perangkat Owner.
2. **Level 4** ditambahkan tim AI pada `9ba76d2` dan `1b880fa`. Salah. Dihapus.
3. **Momo tidur** tidak punya napas. **Bangun** tanpa kedip, tidak melayang ke tengah. Kamera cover melompat ke pojok sekitar 21 detik setelah lambaian, tanpa animasi (morph di-bypass `be7c8b2`).
4. **Penggaris**: judul besar masih tampil, Momo tidak menjadi fokus, dan Momo bertanya "Bener nomor absenmu 20?" 0,6 detik setelah layar terbuka tanpa siswa memilih.
5. **Kartu** (tim AI, `9ba76d2`): kartu 1 auto-jalan setelah cubit, cincin cubit menggantikan jempol, tanpa jeda baca 10 detik, kartu 3 hanya pointer dan lulus tanpa mencoba semua alat.
6. **Level**: jempol bisa memotong ucapan Momo di intro, Momo naik sendiri, prompt idle 10 detik tidak ada, Momo bergeser saat menebak, penempatan tanpa cincin, rotasi tidak ada.
7. **Penutup**: portal, rekap, dan tempat kuis tidak ada.
8. **NUI**: MediaPipe 0.10.14 saja. ONNX, CLAHE, fill-light tidak ada. Redo memakai telapak terbelah, brief menyebut telapak terbuka.
9. **REST**: label backend berbahasa Inggris tidak cocok dengan kosakata level. Kandidat mock bisa terkirim ke submissions tanpa tanda.

Yang SESUAI dan tidak disentuh: render hasil gambar tanpa kotak, gating Bab 2 dan 3, arah dan durasi normal buka buku (0,9 s), deteksi lambaian, alur HITL Terima/Pilih lain/Bukan semua, outbox.

---


# Lampiran A1-timing

# A1 - Audit regresi kecepatan animasi (READ-ONLY)

Auditor read-only. Tidak ada file repo yang diubah, tidak ada commit/checkout/stash/build/run.

**Sumber**: `/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/ref/momo` (branch `claude-monorepo`, HEAD `1b880fa`, working tree bersih).

- Path game di HEAD: `frontend/implementation/...`. Di SHA sebelum fe73df3 (monorepo): `implementation/...`. Berlaku untuk 9f9d35d, 5c05cc3, 8926992, d4bbaec.
- `file:baris` di tabel = posisi di HEAD, kecuali ditulis lain.
- Baseline "natural" = nilai di **9f9d35d** (0.0.14). Induk dari 8520cda (230f273) memegang nilai yang sama dengan 9f9d35d untuk seluruh kartu.
- d4bbaec = 8926992 untuk semua file animasi. Diff 8926992..d4bbaec hanya menyentuh wiring sesi di `implementation/src/app/SketchbookApp.tsx`.
- `-` = belum ada di SHA tersebut.

Status: SESUAI / RUSAK / HILANG / MOCK / BELUM TERBUKTI.

---

## 1. Temuan utama

1. **Percepatan kartu terjadi di 8520cda, bukan di 9ba76d2 atau 1b880fa.** 8520cda ("Owner revision round 2") memangkas hampir seluruh durasi kartu. CHANGELOG-nya sendiri menulis "shorter, firmer motion" (`implementation/CHANGELOG.md` di 8520cda, baris 32). Deal 0,95 s menjadi 0,7 s. Buka kartu 0,95 s menjadi 0,8 s. Flip 0,95 s menjadi 0,8 s. Tutup 0,5/0,7/0,85 s menjadi 0,42/0,5/0,6 s. Kartu selesai 0,6 s menjadi 0,45 s dan arahnya berbalik. Semua nilai itu terbawa ke 5c05cc3, 8926992, d4bbaec, dan HEAD. Status: **RUSAK**.

2. **Jalur produksi yang mempercepat seluruh kartu: `timeScale(6)` saat `prefers-reduced-motion`** (`onboarding/TutorialBrochure.tsx:422, 439`, sudah ada sejak 9f9d35d di L367 dan L384). Dengan pengaturan "kurangi gerakan" aktif, semua timeline kartu berjalan 6 kali lebih cepat. Pada mode itu juga: buku hanya fade 0,2 s (`ui/BookFlip.tsx:65-67`), morph kamera dilewati (`camera/GlobalCamera.tsx:73-75`), dan fly-in intro level dilewati (`level/LevelIntro.tsx:121-126`). Gejala ini cocok dengan keluhan Owner: "buka bukunya gak ada", "terlalu cepet", Momo "cuma kayak ngestak". Status: **BELUM TERBUKTI**. Konfirmasi dulu pengaturan OS/browser Owner (lihat bagian 6).

3. **Buka buku ada di kode, tetapi tidak di semua transisi.** Cover ke penggaris memakai BookFlip 0,9 s (`camera/GlobalCamera.tsx:566`, dipicu `finishCover` di L166-172). Penggaris ke kartu tidak punya buku sama sekali: `app/SketchbookApp.tsx:152` langsung `navigateTo("/onboarding/card")`. Status: **HILANG**, dan melanggar BIGPROMPT §5 butir 7 ("jangan melompat").

4. **Momo tidak terbang ke tengah di cover.** Momo cover dikunci di kanan bawah (`app/styles/100-guide.css:11`, `.momo-guide--cover`) dan tidak punya tween posisi. Status: **HILANG** (BIGPROMPT §6.1.3).

5. **Tidak ada jeda baca 10 detik sebelum ring jempol kartu.** Ring dirender begitu kartu terbuka (`TutorialBrochure.tsx:639-641`, `isReady && open === i`). `setOpen` terjadi 1,25 s setelah kartu mulai (`:381`), jadi jeda baca efektif sekitar 0 s. Status: **HILANG** (BIGPROMPT §6.3 minta minimal 10 s).

6. **Percepatan lain yang tidak tercatat di PRD:** delay Momo cover 1400 ms menjadi 1100 ms (8926992, `camera/GlobalCamera.tsx:539`). Delay cerita intro 1500 ms menjadi 600 ms (8926992, `level/LevelIntro.tsx:181`). Kartu 1 kini berjalan sendiri 1,4 s setelah satu pinch (9ba76d2, `TutorialBrochure.tsx:82`), yang dilarang BIGPROMPT §6.3.

7. **Timer auto-lanjut yang menutup/menaikkan sendiri:** intro level naik sendiri setelah 4,5 s (`LevelIntro.tsx:33, 141`; 2,2 s sampai 5c05cc3, 4,5 s sejak 8926992). Dialog sukses menutup sendiri setelah 3,2 s (`game/SuccessPopup.tsx:13, 50`).

8. `onboarding/CameraIntro.tsx` adalah **kode mati**. Tidak pernah diimpor `SketchbookApp.tsx` (9f9d35d, 5c05cc3, 8926992, HEAD). Cover yang berjalan adalah `GlobalCamera`.

---

## 2. Tabel timing per animasi

### 2.1 Cover (kamera dan Momo)

| # | Animasi | file:baris (HEAD) | 9f9d35d | 5c05cc3 | 8926992 | d4bbaec | HEAD 1b880fa | Diubah oleh (SHA) | Status | Rekomendasi pemulihan |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Jeda sebelum tracker lambaian | `camera/GlobalCamera.tsx:43` WAKE_SETTLE_MS (prop `waveStartDelayMs` L97) | - | 3400 ms | 0 ms | 0 ms | 0 ms | 8926992 (PRD R1, PRD baris 23) | SESUAI PRD. BIGPROMPT §6.1.3 melarang menghapus satu penyebutan timing tanpa kompromi: BELUM TERBUKTI | Pertahankan 0 ms sesuai PRD R1. Untuk "setelah kamera on", pakai prop yang sudah ada dan tanyakan Owner |
| 2 | Momo mulai bicara setelah bangun (startDelay) | `GlobalCamera.tsx:539` | - | 1400 ms | 1100 ms (saat awake) | 1100 ms | 1100 ms | 8926992 | RUSAK kecil: dipercepat 300 ms, tidak ada di PRD | Kembalikan 1400 ms |
| 3 | Kaget lalu lambai (timer) | `GlobalCamera.tsx:153` | - | 900 ms | 900 ms | 900 ms | 900 ms | 5c05cc3 | SESUAI | Pertahankan 900 ms |
| 4 | Jeda baca baris terakhir cover sebelum buku terbuka | `GlobalCamera.tsx:46, 161-163` COVER_LAST_LINE_DWELL_MS | - (onWave langsung) | - (onWave langsung) | 1600 ms | 1600 ms | 1600 ms | 8926992 (PRD R2) | SESUAI | Pertahankan 1600 ms |
| 5 | Kamera tengah ke PIP kiri (morph GSAP, power2.out) | `GlobalCamera.tsx:49, 90` MORPH_DURATION | 0,6 s | 0,6 s | 0,6 s | 0,6 s | 0,6 s | 9f9d35d | SESUAI. Hilang untuk reduced-motion (`GlobalCamera.tsx:73-75`) | Pertahankan 0,6 s. Untuk reduced-motion pakai fade 0,6 s, jangan lompat |
| 6 | Momo lambai satu sayap (wave) | `momo/momo-engine.ts:207-213` | - | r -4 (0,25 s); wv -48 (0,22 s); yoyo 0,2 s x8; kembali 0,4 s | sama | sama | sama | 5c05cc3 | SESUAI | Pertahankan |
| 7 | Momo tidur: melayang dan napas | `momo-engine.ts:262-264`; spec Ngantuk `:102` (spd 0,55, amp 0,7) | - (belum ada cover Momo) | Ada. Periode efektif sekitar 7,6 s (4,2 s / 0,55), amplitudo 0,7 x 55 | sama | sama | sama | 5c05cc3 | SESUAI secara kode. Reduced-motion memakai faktor 0,35 (`:30-31`) sehingga tampak statis: BELUM TERBUKTI di browser | Pertahankan. Keputusan Owner bila tidur harus tetap hidup saat reduced-motion |
| 8 | Momo tidur: huruf zzz | `app/styles/100-guide.css:18-26` momo-zzz | - | 3,2 s, delay 0/1/2 s | sama | sama | sama | 5c05cc3 | SESUAI | Pertahankan |
| 9 | Kedip Momo | `momo-engine.ts:150-155` | 2,4-5,8 s; tutup 0,07 s, buka 0,12 s (sejak 64eb305) | sama | sama | sama | sama | 64eb305 | SESUAI. Saat tidur tidak tampak karena `el=0` (`:201-203`, `:289`) | Pertahankan |
| 10 | Petunjuk lambaian di samping Momo | `app/styles/101-onboarding.css:58` cover-wave-bye | - | - | 1,1 s infinite | 1,1 s | 1,1 s | 8926992 | SESUAI | Pertahankan |
| 11 | Momo terbang ke tengah saat bangun (emphasis) | `GlobalCamera.tsx:531-543`; `100-guide.css:11` | - | docked kanan bawah, tanpa tween | docked, tanpa tween | docked | docked, tanpa tween | (tidak pernah ada) | HILANG (BIGPROMPT §6.1.3; PRD R1 "emphasis") | Tambah tween Momo dari kanan bawah ke tengah, skala sekitar x1,5, 0,9 s power2.out setelah lambaian pertama. Kembali ke kanan bawah sekitar 0,6 s saat penggaris. Angka usulan, belum ada referensi di source |
| 12 | Buka buku cover ke penggaris (BookFlip open) | `ui/BookFlip.tsx:30, 72, 76`; dipasang di `GlobalCamera.tsx:566` | - (navigasi langsung) | - (navigasi langsung) | 0,9 s power2.inOut | 0,9 s | 0,9 s | 8926992 (PRD R2: "kira-kira 0,9 s") | SESUAI PRD. Keluhan Owner "tidak ada": BELUM TERBUKTI (lihat bagian 6) | Pertahankan 0,9 s power2.inOut. Rekam Chromium mode normal dan reduced |
| 13 | Buka buku, reduced-motion | `BookFlip.tsx:31, 65-67` | - | - | fade 0,2 s | 0,2 s | 0,2 s | 8926992 (PRD R2) | SESUAI PRD. Tetapi buku tidak terlihat bagi pengguna reduced-motion | Keputusan Owner: fade 0,2 s (PRD) atau flip 0,9 s dengan rotasi dikurangi. Jangan dibiarkan jadi default tanpa keputusan |

### 2.2 Penggaris (StudentRulerSelector)

| # | Animasi | file:baris (HEAD) | 9f9d35d | 5c05cc3 | 8926992 | d4bbaec | HEAD 1b880fa | Diubah oleh (SHA) | Status | Rekomendasi pemulihan |
|---|---|---|---|---|---|---|---|---|---|---|
| 14 | Penggaris ke kartu | `app/SketchbookApp.tsx:152` navigateTo("/onboarding/card") | langsung | langsung | langsung | langsung | langsung | 9f9d35d (tidak pernah ada BookFlip) | HILANG. Melanggar BIGPROMPT §5 butir 7 | Tambah transisi: BookFlip open 0,9 s, atau dissolve 0,6-0,9 s. Panggil navigateTo di onMidpoint |
| 15 | Penggaris settle (R3) | `onboarding/StudentRulerSelector.tsx:18, 66-77` RULER_SETTLE_MS | - | - | 600 ms | 600 ms | 600 ms | 8926992 (PRD R3) | SESUAI | Pertahankan |
| 16 | Momo bertanya nomor (startDelay) | `StudentRulerSelector.tsx:249` | - | 700 ms | 700 ms | 700 ms | 700 ms | 5c05cc3 (8926992 menambah kondisi settled) | SESUAI | Pertahankan |
| 17 | Bump angka penggaris | `StudentRulerSelector.css:56, 59` ruler-bump | 0,3 s | 0,3 s | 0,3 s | 0,3 s | 0,3 s | 65c9878 | SESUAI | Pertahankan |
| 18 | Ring konfirmasi nomor (ThumbConfirm) | `StudentRulerSelector.tsx:253` | - | - | 2000 ms | 2000 ms | 2000 ms | 8926992 (PRD: 2 s) | SESUAI | Pertahankan |

### 2.3 Tiga kartu (TutorialBrochure dan CSS kartu)

| # | Animasi | file:baris (HEAD) | 9f9d35d | 5c05cc3 | 8926992 | d4bbaec | HEAD 1b880fa | Diubah oleh (SHA) | Status | Rekomendasi pemulihan |
|---|---|---|---|---|---|---|---|---|---|---|
| 19 | Deal: kartu masuk dan kipas | `onboarding/TutorialBrochure.tsx:437-438` | 0,95 s back.out(1.25), stagger 0,13, "+=0,3" (L382-383) | 0,7 s power3.out, stagger 0,09, "+=0,25" | sama | sama | sama | 8520cda | RUSAK (durasi -26%, stagger -31%, ease pantul hilang) | 0,95 s back.out(1.25), stagger 0,13, "+=0,3" |
| 20 | Deal: posisi awal y | `:434` | y -0,6 vh (L379) | y -0,55 vh | sama | sama | sama | 8520cda | RUSAK kecil | y -0,6 vh |
| 21 | Kartu lain turun ke baris bawah (tuck) | `:373` | 0,75 s power3.inOut (L320) | 0,55 s | 0,55 s | 0,55 s | 0,55 s | 8520cda | RUSAK | 0,75 s |
| 22 | Kartu terbang ke tengah | `:375` | 0,95 s power3.inOut (L322) | 0,8 s | 0,8 s | 0,8 s | 0,8 s | 8520cda | RUSAK | 0,95 s |
| 23 | Flip kartu (rotationY 0 ke 180) | `:376` | 0,95 s power2.inOut (L323) | 0,8 s | 0,8 s | 0,8 s | 0,8 s | 8520cda | RUSAK | 0,95 s |
| 24 | Halaman praktik terbuka | `:378-380` | rot 0,8 s dan x 0,8 s power3.out pada 0,88 (L325-326), tanpa brightness | brightness 0,55 s pada 0,72; rot 0,6 s dan x 0,6 s pada 0,72 | sama | sama | sama | 8520cda | RUSAK | rot 0,8 s dan x 0,8 s pada 0,88. Brightness boleh dipertahankan dengan durasi 0,8 s |
| 25 | Setelah terbuka: setOpen (ring mulai muncul) | `:381` | 1,45 s (L327) | 1,25 s | 1,25 s | 1,25 s | 1,25 s | 8520cda | RUSAK (lihat 33) | 1,45 s, lalu gate baca 10 s (lihat 33) |
| 26 | Tutup: lipat halaman praktik | `:396-398` | rot -92 deg 0,5 s power2.in pada 0; opacity 0 pada 0,5 (L342-343) | 0,42 s; opacity 0 pada 0,42 | sama | sama | sama | 8520cda | RUSAK | 0,5 s; opacity 0 pada 0,5 |
| 27 | Tutup: kartu geser, flip, kembali ke baris | `:399-401` | x 0,5 s pada 0; flip 0,7 s pada 0,38; rest 0,85 s pada 0,42 (L344-346) | x 0,42 pada 0; flip 0,5 pada 0,32; rest 0,6 pada 0,36 | sama | sama | sama | 8520cda | RUSAK | x 0,5 pada 0; flip 0,7 pada 0,38; rest 0,85 pada 0,42 |
| 28 | Offset buka kartu berikutnya | `:415` | 0,5 s (L360) | 0,55 s | 0,55 s | 0,55 s | 0,55 s | 8520cda | RUSAK kecil | 0,5 s |
| 29 | Kartu 3 selesai, kartu keluar, lalu daftar level | `:419-420` | y -vh, rot +-8 deg, 0,6 s power2.in, stagger 0,07 pada 1,05; onStart pada 1,55 (L364-365) | y +vh, opacity 0, 0,45 s power2.in, stagger 0,05 pada 0,95; onStart pada 1,45 | sama | sama | sama | 8520cda | RUSAK (durasi berubah dan arah berbalik dari naik ke turun) | y -vh, rot +-8 deg, 0,6 s, stagger 0,07 pada 1,05, onStart 1,55 |
| 30 | Kartu 1: Thinman berjalan | `:82` WALK_MS 1400; `:569` reduced 300 ms | - (drag saja, selesai di atas 76%) | - (drag saja) | - (drag saja) | - (drag saja) | 1400 ms, interval 16 ms, smoothstep | 9ba76d2 | RUSAK terhadap BIGPROMPT §6.3 Kartu 1 (dilarang pinch lalu jalan sendiri) | Hapus auto-jalan sebagai default. Thinman ikut tangan atau drag, lalu berhenti di bendera. Auto-jalan hanya bila Owner memilih |
| 31 | Kartu 1: hold ring/tombol "Lanjut" | `:84` PINCH_HOLD_MS; `:583` | - (tombol klik) | - (tombol klik) | 1000 ms | 1000 ms | 1200 ms | 9ba76d2 (naik dari 1000 ke 1200) | RUSAK terhadap PRD R5 (1 s) | 1000 ms |
| 32 | Kartu 2: ring "Lanjut" | `:584` holdMs 1000 | - | - | 1000 ms | 1000 ms | 1000 ms | 8926992 | SESUAI PRD (1 s) | Pertahankan |
| 33 | Jeda baca minimal 10 s sebelum ring jempol (kartu 1-3) | ring `:639-641` | - | - | - | - | ring muncul sekitar 1,25 s setelah buka (sekitar 0 s baca) | (tidak pernah ada) | HILANG. BIGPROMPT §6.3 dan Lampiran 17 minta 10 detik. PRD_REVISI_0.0.16.md:88 hanya 1 s dan 2 s: KONFLIK, perlu keputusan Owner | Tambah `READ_MS = 10000` setelah kartu terbuka dan tugas interaktif selesai, baru render ring. Jangan auto-tutup |
| 34 | Kartu 3: ring "Mulai Level 1" | `:585` holdMs 2000 | - | - | 2000 ms | 2000 ms | 2000 ms | 8926992 | SESUAI PRD (2 s) | Pertahankan |
| 35 | Momo di kartu: jeda sebelum baris | `:670` startDelay (900 untuk deal, 250 lainnya) | - (belum ada Momo di kartu) | 900 / 250 ms | 900 / 250 ms | 900 / 250 ms | 900 / 250 ms | 5c05cc3 | SESUAI | Pertahankan |
| 36 | CSS kartu: cta-ready 0,7 s, tut-wave 0,45 s, tut-pop 0,55 s, tut-hop 1,1 s, tut-ouch 0,5 s, tut-sweep 2,2 s (loop) | `app/styles/99-tutorial.css:30, 46, 54, 57, 72, 73` | sama (tut-sweep 2,2 s sudah ada di 9f9d35d) | sama | sama | sama | sama. Antara 9f9d35d dan HEAD hanya posisi hop/ouch yang bergeser (left 20% ke 23,5%, 68% ke 70%); durasi tidak berubah | 9f9d35d (diperkenalkan; durasi tidak berubah sampai HEAD) | SESUAI | Pertahankan |

### 2.4 Chat Momo (MomoChat)

| # | Animasi | file:baris (HEAD) | 9f9d35d | 5c05cc3 | 8926992 | d4bbaec | HEAD 1b880fa | Diubah oleh (SHA) | Status | Rekomendasi pemulihan |
|---|---|---|---|---|---|---|---|---|---|---|
| 37 | Titik ketik sebelum baris (typingMs) | `momo/MomoChat.tsx:18-20` | min(900, 380+7n) (L13-14) | min(800, 320+6n) | sama | sama | sama | 8520cda | BELUM TERBUKTI. Lebih cepat sekitar 100 ms, tidak ada keluhan spesifik | Opsional: kembali ke min(900, 380+7n) bila Owner ingin persis 0.0.14 |
| 38 | Jeda antar-baris (dwellMs) | `MomoChat.tsx:34-36` | jeda 260 ms (L84), tanpa dwell | 900+34n | 900+34n | 900+34n | 900+34n | 8520cda | BELUM TERBUKTI. Sekarang lebih lama: baris 60 huruf 2940 ms, sebelumnya 260 ms | Keputusan Owner. PRD baris 55 menuntut chat terasa lebih cepat daripada konfirmasi 1 s |
| 39 | Ketik per huruf (LETTER_MS, TYPING_CAP_MS) | `MomoChat.tsx:23, 25, 28-31` | - (baris muncul sekaligus) | - | - | - | 30 ms per huruf; cap 2500 ms (titik plus huruf) | 9ba76d2 | BELUM TERBUKTI. Menambah sekitar 1,8 s pada baris 60 huruf | Pertahankan 30 ms dan cap 2500 ms |
| 40 | Ketuk untuk tampilkan baris penuh | `MomoChat.tsx:223-224` (skip, lalu finishLine) | - | - | - | - | ada | 9ba76d2 | SESUAI. Tidak melewati percakapan | Pertahankan |
| 41 | Chat dalam reduced-motion | `MomoChat.tsx:177-179` | - | - | RUSAK: `instant` hanya menampilkan baris terakhir (`MomoChat.tsx:90-93` di 8926992) | - | semua baris tampil, dwell tetap berjalan | 9ba76d2 (perbaikan) | SESUAI di HEAD | Pertahankan |

### 2.5 Intro level, pita, dan Momo terbang

| # | Animasi | file:baris (HEAD) | 9f9d35d | 5c05cc3 | 8926992 | d4bbaec | HEAD 1b880fa | Diubah oleh (SHA) | Status | Rekomendasi pemulihan |
|---|---|---|---|---|---|---|---|---|---|---|
| 42 | Halaman intro jatuh (falling page) | (tidak ada di HEAD) | root yPercent -100 ke 0, 0,95 s back.out(1.35) (L102-106) | sama | - (diganti BookFlip) | - | - | 8926992 (PRD R6: hapus halaman jatuh) | SESUAI PRD | - |
| 43 | Intro menunggu buku terbuka | `level/LevelIntro.tsx:35, 129` BOOK_OPEN_MS | - (halaman jatuh) | - (halaman jatuh) | 900 ms | 900 ms | 900 ms | 8926992 | SESUAI PRD R6 | Pertahankan |
| 44 | Momo terbang masuk ke posisi cerita | `LevelIntro.tsx:128-132` (y -260 ke posisi cerita, 0,95 s power3.out) | 0,95 s pada 0,7 (L107-108) | sama | 0,95 s pada 0 (setelah 0,9 s) | sama | sama | 8926992 | SESUAI PRD R6 dan R7. Reduced-motion melewati seluruh fly-in (`:121-126`): HILANG | Pertahankan 0,95 s. Reduced-motion: fade 0,3 s, jangan skip |
| 45 | Jeda sebelum baris cerita Momo | `LevelIntro.tsx:181` startDelay | 1500 ms (L146) | 1500 ms | 600 ms | 600 ms | 600 ms | 8926992 | RUSAK: dipercepat 900 ms, tidak ada di PRD | 1500 ms |
| 46 | Kamera naik "Ke langit" | `LevelIntro.tsx:106-107` | 1,55 s power2.inOut pada 0,36 (L82); tanpa layer dekat | 2,1 s, plus layer dekat (y -220 ke 260, 2,1 s) | sama | sama | sama | 5c05cc3 | Diperlambat +35%, bukan percepatan | Pertahankan 2,1 s. 1,55 s hanya bila Owner ingin persis 0.0.14 |
| 47 | Naik sendiri tanpa jempol (INTRO_LINGER_MS) | `LevelIntro.tsx:33, 139-145` | 2200 ms | 2200 ms | 4500 ms | 4500 ms | 4500 ms | 8926992 | BELUM TERBUKTI. Auto-advance (BIGPROMPT §5 butir 7) | Matikan auto-naik dan biarkan jempol (ThumbConfirm 1000 ms, `:217`). Atau pertahankan dengan petunjuk jelas |
| 48 | Tahan level list sebelum intro (ENTRY_HOLD_MS) | `app/hooks/useEntryHold.ts:7` | 1300 ms (800 ms sampai 1daf499) | 1300 ms | 1300 ms | 1300 ms | 1300 ms | 9f9d35d | SESUAI | Pertahankan |
| 49 | Pita: tarik, snap, pantul, buka | `level/LevelRibbonBookmark.tsx:205-208` | snap 0,14/0,09/0,09/0,08 s + goyang 0,13-0,15 s; relax elastic 0,7 s (L128-141) | sama | pantul: snap 0,12 s power2.out + kendur 0,18 s; pantul y -22% 0,42 s back.out(2.2) pada 0,12; jatuh 0,5 s bounce.out pada 0,62 | sama | sama, plus auto-pull diam 1,2 s (komentar `:5`) | 8926992 (PRD R6); 1b880fa (NUI) | SESUAI PRD R6. Auto-pull BELUM TERBUKTI | Pertahankan pantulan. Tinjau auto-pull 1,2 s (lihat J15) |

### 2.6 Dialog, penutup, dan Momo companion

| # | Animasi | file:baris (HEAD) | 9f9d35d | 5c05cc3 | 8926992 | d4bbaec | HEAD 1b880fa | Diubah oleh (SHA) | Status | Rekomendasi pemulihan |
|---|---|---|---|---|---|---|---|---|---|---|
| 50 | Dialog sukses: flap kedua | `game/SuccessPopup.tsx:11, 38` | 1100 ms | 1100 ms | 1100 ms | 1100 ms | 1100 ms | (tidak berubah) | SESUAI | Pertahankan |
| 51 | Dialog sukses: auto-lanjut | `SuccessPopup.tsx:13, 50` SUCCESS_LINGER_MS | 3200 ms | 3200 ms | 3200 ms | 3200 ms | 3200 ms | 9f9d35d | BELUM TERBUKTI. Dialog menutup sendiri (BIGPROMPT §5 butir 7) | Tahan sampai baris Momo selesai dan jempol, keputusan Owner |
| 52 | Penutup: tahap (ENDING_TIMING) | `ending/ending-types.ts:35`; `ending/CenterOfPage.tsx:33-38` | - | - | page 2200, alive 5200 | sama | sama | 8926992 | BELUM TERBUKTI (diaudit di audit penutup) | Pertahankan |
| 53 | Momo di dunia: jeda beat (RELIEF_BEAT_MS) | `game/WorldMomo.tsx:47, 66` | - | - | 2000 ms | 2000 ms | 2000 ms | 8926992 | BELUM TERBUKTI | Pertahankan |
| 54 | Momo companion geser di halaman gambar | `app/styles/70-drawing-screen.css:168`; `drawing/hooks/useMomoCompanionLayout.ts:11` (ARRIVAL_SAFETY_MS 460) | 400 ms | 400 ms | 400 ms | 400 ms | 400 ms | (tidak berubah) | SESUAI. Reduced-motion: tanpa geser (`:54, 58`) | Pertahankan |
| 55 | Tepi buku berjalan (PageEdgeWalkers) | `level/PageEdgeWalkers.tsx:13` (260 ms); `app/styles/98-kit-flow.css` page-edge-walk 28 s | - | - | 260 ms; 28 s linear | sama | sama | 8926992 | BELUM TERBUKTI (dekoratif) | Pertahankan |

---

## 3. Jalur mempercepat dan melewati

| # | Jalur | Lokasi | Sejak | Efek | Status | Rekomendasi |
|---|---|---|---|---|---|---|
| J1 | `tl.timeScale(6)` saat prefers-reduced-motion | `onboarding/TutorialBrochure.tsx:422, 439` | 9f9d35d (L367, L384) | Semua timeline kartu (deal, buka, tutup, selesai) berjalan 6 kali lebih cepat | RUSAK. Penyebab paling mungkin keluhan "terlalu cepet" jika OS Owner memakai kurangi gerakan. BELUM TERBUKTI | Hapus `timeScale(6)`. Reduced-motion pakai crossfade dengan durasi normal |
| J2 | BookFlip reduced: fade 0,2 s | `ui/BookFlip.tsx:31, 65-67` | 8926992 | Buku tampak tidak ada | SESUAI PRD, tetapi dampaknya HILANG untuk reduced-motion | Keputusan Owner (lihat row 13) |
| J3 | Morph kamera dilewati | `camera/GlobalCamera.tsx:73-75` | 9f9d35d | PIP kamera pindah langsung, tidak mengerucut | HILANG untuk reduced-motion | Ganti dengan fade 0,6 s |
| J4 | Fly-in intro level dilewati | `LevelIntro.tsx:121-126`; startDelay 0 di `:181` | 9f9d35d (cabang reduced ada di 9f9d35d, 5 pemanggilan) | Momo tidak terbang, cerita langsung muncul | HILANG. PRD R7: "animasi Momo terbang wajib terlihat" | Fade 0,3 s, jangan skip |
| J5 | Momo engine "calm" dan faktor 0,35 | `momo/momo-engine.ts:30-31, 170-172, 177-181, 144-147` | 9f9d35d (calm dan rm sudah ada) | Tidur dan melayang x0,35; tanpa hop, goyang, dan tetesan | SESUAI kode. Tampak statis, sesuai keluhan "cuma kayak ngestak" | Keputusan Owner. Minimal jangan pangkas float saat tidur |
| J6 | Chat reduced-motion hanya baris terakhir | `MomoChat.tsx:90-93` (8926992) | 8926992 | Baris Momo terlewati | RUSAK. Sudah diperbaiki 9ba76d2 (`MomoChat.tsx:177-179`) | Pertahankan HEAD |
| J7 | Reduced-motion CSS global `animation-duration:.01ms` | `app/prototype-camera.css:266` (`.camera-prototype-root *`) | HEAD (sejak kapan: BELUM DIVERIFIKASI) | Animasi CSS di subtree kamera dan cover (zzz, petunjuk) menjadi instan | SESUAI kode. Efek di browser BELUM TERBUKTI | Keputusan Owner |
| J8 | Test hook: tombol "w" dan `window.__skbWave` | `camera/GlobalCamera.tsx:173-186` (hanya NEXT_PUBLIC_TEST_HOOKS=1) | 8926992 | Momo bangun tanpa lambaian | MOCK (hanya build uji) | Pastikan build Owner memakai TEST_HOOKS=0 (AGENTS.md) |
| J9 | Tombol "Bangunkan Momo" tanpa kamera | `GlobalCamera.tsx:556-562` | HEAD (hanya saat inputMode fallback) | Melewati lambaian | SESUAI PRD R13 (hanya fallback) | Pertahankan. Jangan tampil sejak awal (BIGPROMPT §5) |
| J10 | Tombol "Lewati" kartu tutorial (fallback) | `onboarding/TutorialBrochure.tsx:590-591` lalu `app/SketchbookApp.tsx:161` navigateTo("/levels") | 9f9d35d | Melewati tiga kartu tanpa praktik | RUSAK (BIGPROMPT §5 dan §6.3) | Hapus. Jangan melewati kartu tanpa praktik |
| J11 | Tombol "Lewati cerita" intro | `level/LevelIntro.tsx:230` (intro-skip, lalu finish) | 9f9d35d | Melewati cerita dan fly-in | RUSAK (PRD R7: video sebelumnya melewati intro) | Hapus, atau jadikan kontrol yang disetujui Owner |
| J12 | Naik sendiri intro 4,5 s | `LevelIntro.tsx:33, 141` | 8926992 (4500; 2200 sebelumnya) | Intro naik tanpa aksi | BELUM TERBUKTI | Lihat row 47 |
| J13 | Buku menutup sendiri 1,6 s setelah baris cover terakhir | `GlobalCamera.tsx:161-163` | 8926992 | Buku terbuka tanpa aksi (sesuai PRD R2) | SESUAI PRD | Pertahankan |
| J14 | Dialog sukses auto-lanjut 3,2 s | `SuccessPopup.tsx:50` | 9f9d35d | Dialog tutup tanpa aksi | BELUM TERBUKTI | Lihat row 51 |
| J15 | Ribbon: diam 1,2 s memicu tarik sendiri (NUI) | `LevelRibbonBookmark.tsx:5` (komentar 1b880fa). CHANGELOG 8520cda baris 15: "click auto-pulls" | 8520cda (klik); 1b880fa (diam 1,2 s) | Level terbuka tanpa aksi | BELUM TERBUKTI. Handler belum ditelusuri | Verifikasi. Tanpa aksi siswa, jangan memulai level |
| J16 | Pengaman buku tutup 2 s | `SketchbookApp.tsx:89-94` | 8926992 | Paksa keluar jika animasi tutup buku tidak selesai | SESUAI (pengaman) | Pertahankan |

---

## 4. Dampak 9ba76d2 dan 1b880fa pada rasa kecepatan

| Commit | Perubahan | Nilai lama | Nilai baru | Efek pada rasa kecepatan |
|---|---|---|---|---|
| 9ba76d2 | Kartu 1 berjalan sendiri (`WALK_MS`, `TutorialBrochure.tsx:82`) | Drag saja, selesai saat posisi mencapai 76% (8926992, tanpa auto-jalan) | 1400 ms, interval 16 ms, smoothstep | Kartu 1 lebih cepat selesai. Melanggar BIGPROMPT §6.3 |
| 9ba76d2 | Hold ring kartu 1 (`PINCH_HOLD_MS`, `:84`) | 1000 ms (8926992 L509) | 1200 ms | Lebih lambat 200 ms. Tidak sesuai PRD 1 s |
| 9ba76d2 | Ketik per huruf (`MomoChat.tsx:23-31`) | Baris muncul sekaligus setelah titik ketik (680 ms untuk 60 huruf) | 30 ms per huruf, cap 2500 ms (sekitar 2480 ms untuk 60 huruf) | Chat lebih lambat sekitar 1,8 s per baris panjang |
| 9ba76d2 | Ketuk untuk tampil penuh (`:223-224`) | Tidak ada | Ada | Lebih cepat hanya jika siswa mengetuk |
| 9ba76d2 | Transisi PinchRing/DwellButton (0,15 s, pulse 0,45 s); dwell 2000 dan 1800 ms di DrawingActions/DrawingScreen | - | - | Dwell NUI, bukan animasi kartu |
| 1b880fa | Skip intro jadi dwell 60 px; "Ke langit" ThumbConfirm 1000 ms tetap | Sama | Sama | Tidak mengubah kecepatan |
| 1b880fa | Diam 1,2 s di pita memicu tarik (komentar `LevelRibbonBookmark.tsx:5`) | Klik atau drag | Diam juga menarik | Dapat memasukkan level tanpa aksi. BELUM TERBUKTI |
| 8520cda (tidak di daftar brief, sumber utama) | Kartu dan chat (lihat row 19-37) | Lihat 2.3 dan 2.4 | Lihat 2.3 dan 2.4 | Kartu lebih cepat. Chat diubah bersamaan: dots lebih cepat, dwell lebih lama |

Ringkasan: 8520cda membuat kartu lebih cepat. 9ba76d2 menambah kecepatan kartu 1 (auto-jalan) dan memperlambat chat (ketik per huruf). Tidak ada perubahan 1b880fa yang mempercepat animasi kartu atau buku.

---

## 5. Konflik spesifikasi (dicatat, tidak diselesaikan diam-diam)

1. **Jeda baca kartu.** `contexts/can/project/PRD_REVISI_0.0.16.md:88` menetapkan ThumbConfirm 1 s dan 2 s, dan kartu lain "sudah bagus". BIGPROMPT §6.3 dan Lampiran 17 minta 10 detik sebelum ring. BIGPROMPT lebih baru, tetapi perlu konfirmasi Owner.
2. **Jeda tracker lambaian.** PRD R1 (baris 13 dan 23) menghapus 3,4 s. BIGPROMPT §6.1.3 minta dua penyebutan timing dijaga.
3. **Buka buku reduced-motion.** PRD R2 (baris 34): 0,9 s, reduced fade 0,2 s. Keluhan Owner menunjukkan buku tidak terlihat.
4. **Kartu 1 berjalan sendiri.** PRD baris 87 meminta animasi jalan rig dengan langkah mengikuti geser. BIGPROMPT §6.3 melarang auto-jalan setelah satu pinch.
5. **Penggaris ke kartu tanpa transisi.** BIGPROMPT §5 butir 7 melarang lompat langsung. HEAD melakukan `navigateTo` langsung.

---

## 6. Yang belum terbukti (tidak bisa diputuskan dari source)

1. **Pengaturan "kurangi gerakan" di OS atau browser Owner.** Jika aktif, J1 sampai J5 menjelaskan keluhan "buku tidak ada", "terlalu cepet", kamera tidak mengerucut, dan Momo tampak statis. Cara cek: DevTools, Rendering, Emulate CSS media `prefers-reduced-motion: reduce`. Bandingkan dua mode dengan rekaman.
2. `onCoverLinesDone` (`GlobalCamera.tsx:159`) terpanggil setelah baris Momo terakhir selesai (lewat `MomoChat` onDone). Belum dijalankan.
3. Handler auto-pull pita 1,2 s (`LevelRibbonBookmark.tsx:5`) belum ditelusuri.
4. Tidak ada rekaman video 0.0.14 yang dibandingkan. "Natural" di sini berarti nilai source 9f9d35d.

---

## 7. Rekomendasi pemulihan (urut prioritas)

1. **`onboarding/TutorialBrochure.tsx`**: kembalikan timing 9f9d35d (kolom 9f9d35d di 2.3).
   - L373: 0,55 ke 0,75 s.
   - L375-376: 0,8 ke 0,95 s.
   - L378-380: rot dan x 0,6 ke 0,8 s pada 0,88 (brightness boleh tetap, 0,8 s).
   - L396-401: 0,42/0,42/0,42/0,5/0,6 ke 0,5 (play), 0,5 (opacity pada 0,5), x 0,5 pada 0, flip 0,7 pada 0,38, rest 0,85 pada 0,42.
   - L415: 0,55 ke 0,5 s.
   - L419-420: y -vh, 0,6 s, stagger 0,07, pada 1,05, onStart 1,55.
   - L434: y -0,55 ke -0,6 vh.
   - L437-438: 0,7 ke 0,95 s back.out(1.25), stagger 0,09 ke 0,13, "+=0,25" ke "+=0,3".
2. **`TutorialBrochure.tsx:422, 439`**: hapus `timeScale(6)`.
3. **Reduced-motion** (J2 sampai J5): ganti semua "lewati" dengan fade durasi normal. Keputusan Owner: 0,2 s (PRD) atau 0,9 s.
4. **`TutorialBrochure.tsx:82, 569`**: hapus auto-jalan sebagai default. Ikuti opsi BIGPROMPT (Thinman ikut tangan, berhenti di bendera).
5. **`TutorialBrochure.tsx:84, 583`**: 1200 ke 1000 ms (PRD 1 s), kecuali Owner menetapkan lain.
6. **`TutorialBrochure.tsx:639-641`**: tambah gate `READ_MS = 10000` sebelum ring dirender. Mulai setelah tugas interaktif kartu 3 selesai. Jangan auto-tutup.
7. **`app/SketchbookApp.tsx:152`**: tambah transisi penggaris ke kartu. BookFlip open 0,9 s, navigasi di `onMidpoint`.
8. **`camera/GlobalCamera.tsx:539`**: 1100 ke 1400 ms.
9. **`level/LevelIntro.tsx:181`**: 600 ke 1500 ms. **`LevelIntro.tsx:33, 141`**: matikan naik sendiri (atau keputusan Owner).
10. **`camera/GlobalCamera.tsx` (cover)**: tambah tween Momo ke tengah (row 11). Angka usulan, perlu persetujuan Owner.
11. **`TutorialBrochure.tsx:590-591`**: hapus tombol "Lewati" kartu. **`LevelIntro.tsx:230`**: hapus atau setujui Owner.
12. **`momo/MomoChat.tsx:18-20, 34-36`** (opsional): tetap 320+6n dan 900+34n, atau kembali ke 380+7n jika Owner minta. LETTER_MS 30 dipertahankan.


# Lampiran A2-cover-momo

# A2 — Cover, Momo tidur/bangun, kamera, buku, penggaris (ringkasan lead dari laporan auditor)

Root path relatif: `frontend/implementation/`. HEAD `1b880fa`.

## Dugaan utama (BELUM TERBUKTI di perangkat Owner)
Gejala Owner cocok dengan jalur `prefers-reduced-motion`: Zzz tinggal satu huruf statis (`app/styles/100-guide.css:46`), buku hanya fade 0,2 s (`src/components/ui/BookFlip.tsx:31,65-67`), kartu `timeScale(6)` (`TutorialBrochure.tsx:422,439`). Blanket: `app/prototype-camera.css:266` (`.camera-prototype-root *{animation-duration:.01ms!important}`), `app/styles/96-kit-base.css:118-122`.
Keputusan lead: animasi CERITA tetap berdurasi normal saat reduced motion (amplitudo boleh dikurangi). Tidak ada lagi jalur yang mempersingkat/menghapus animasi cerita.

## Momo tidur (momo-engine.ts)
- Ada: `sleep()` `:201-203` menutup kelopak; melayang `step()` `:264` ±4,7 px periode ≈7,6 s; anggukan `react()` Ngantuk `:102,:191` tiap 4–7,5 s; sayap droop `fl:8`, `flut:.5`; Zzz 3 huruf loop 3,2 s (`100-guide.css:18-31`, `MomoGuide.tsx:48-54`).
- HILANG: napas (skala). Gate `calm` (`:170-172,:178-181`, ditambah di `9ba76d2`) mematikan anggukan saat reduced motion = regresi.
- Perbaikan: (1) properti `breath` dibaca di `step()` (`:281`): scaleY = 1+breath, scaleX = 1−0,6·breath; tween di `sleep()` `gsap.to(this,{breath:0.015,duration:2.1,yoyo:true,repeat:-1,ease:"sine.inOut"})`; bunuh di `set()`/`destroy()`; jangan pakai `P.sx/P.sy` (direset `react()` `:190`). (2) `SPECS.Ngantuk.flut` 0,5→0,15 dan tween lambat `mo.fl` 8→12 (3 s yoyo). (3) Zzz reduced: tetap 3 huruf, opacity-only 4,8 s. (4) hapus early-return `calm` di `react()`, pakai skala ×0,35 yang ada.

## Bangun
- HILANG: kedip sebelum melek (mata buka satu tween 0,5 s `:164`; `blink()` `:150-155` tak berefek saat tertutup). HILANG: Momo melayang ke tengah & membesar (`.momo-guide--cover` tetap pojok kanan bawah `100-guide.css:11`; `height={250}` `GlobalCamera.tsx:534`). HILANG: jempol setelah dialog cover (buku terbuka otomatis 1,6 s `GlobalCamera.tsx:46,159-164`).
- Ada: Kaget+kepak (`GlobalCamera.tsx:152`), dadah `wave()` `:207-214` dipicu +900 ms (`GlobalCamera.tsx:153`).
- Perbaikan: `wake()` di engine: timeline `F.el/F.er` 0→0,35 (0,15 s)→0 (0,12 s)→0,5 (0,14 s)→0 (0,10 s)→1 (0,30 s back.out) lalu `set(expression)` (`set()` memakai overwrite, jadi kedip harus jalan dulu). Momo tween ke tengah + 250→320 px dalam 1,1 s mulai ≈0,75 s; `trackMotion` (`MomoAvatar.tsx:10`). Dialog `startDelay` 1100→2000 ms (`GlobalCamera.tsx:539`). Setelah dialog: `ThumbConfirm holdMs={1000}` sebagai children MomoGuide dengan `extrasFrom="last"`; buka buku saat `onConfirm`.

## Kamera cover
- `CameraIntro.tsx` tidak dipakai runtime; cover = `GlobalCamera` (`SketchbookApp.tsx:235-241`).
- Kamera tengah besar SESUAI (`99-tutorial.css:100`). Mengecil+pindah RUSAK: morph GSAP ada (`GlobalCamera.tsx:70-95`, 0,6 s `:49`) tetapi mode floating di-bypass (`:267-271`, commit `be7c8b2`, dikunci `tests/components/global-camera-stationary.test.tsx:64-77`). Pemicu pindah = akhir dialog (`:171` → `SketchbookApp.tsx:239`), ≈21 s setelah lambaian.
- `60-global-camera.css:75-76` mengunci width/height PIP `!important`: morph harus `transform: scale + translate` (318→150 px ≈ ×0,47), 0,8 s `power2.inOut`, satu kali cover→PIP, mulai ≈0,75 s setelah wake. Video tetap hidup (`:433-436`).
- Lambaian nyata SESUAI di kode (`wave-tracker.ts:21-29,143-147`; `GlobalCamera.tsx:193-196`); tombol "Bangunkan Momo" hanya tanpa kamera (`:556-564`).
- Teks "Lambaikan Tanganmu!" headline `GlobalCamera.tsx:408`, subteks `:409-411`, dirender tanpa syarat `:441`. Owner: HILANGKAN; ganti petunjuk visual halus (ikon tangan `:545-554` sudah ada) + bantuan progresif bila lama tak ada lambaian.
- Copy cover `src/domain/guide-script.ts:17-25` tidak sama dengan brief. Brief: "Aku Momo, gambar satu-satunya yang hidup di dunia Sketchbook Universe." / "Aku barusan menemukan **Thinman**. Kayaknya dia butuh bantuanmu supaya bisa hidup juga sepertiku." / "Yuk, antar dia ke tempat yang tepat." Nama tebal: `MomoChat` hanya string polos (`MomoChat.tsx:285`), perlu segmen tebal yang kompatibel dengan ketik per huruf.
- Ejaan: keputusan aktif D-20261105-24 = **Thinman** (349 pemakaian). Brief menulis Tinman. Lead: pakai nama dari `src/config/character-tokens.ts` (Thinman), catat sebagai delta untuk Owner.

## Buka buku
- Arah naik dari tepi atas SESUAI (`BookFlip.tsx:70-72`, `101-onboarding.css:12-17`), 0,9 s `power2.inOut` (`:30,:72`), midpoint 0,45 s.
- RUSAK: reduced motion = fade 0,2 s. RUSAK: `onWave` dipanggil di AWAL flip (`GlobalCamera.tsx:171`) sehingga penggaris langsung muncul dan Momo cover unmount seketika (`:531`). Perbaikan: navigasi di `onMidpoint`; Momo cover fade-out 0,3 s setelah midpoint. HILANG: transisi penggaris→kartu (`SketchbookApp.tsx:152`).

## Penggaris (`StudentRulerSelector.tsx/.css`)
- RUSAK: H1 "GESER PENGGARIS SESUAI NOMOR ABSENMU" terlihat (`:217`); Owner: hanya angka + penggaris (jadikan `visually-hidden`).
- HILANG: Momo besar di tengah + latar gelap, lalu mengecil ke pojok kanan.
- RUSAK (risiko data): `useEffect(() => armSettle(), [])` (`:79-84`) membuat Momo bertanya "Bener nomor absenmu 20?" 0,6 s setelah mount tanpa siswa memilih (default 20 `:59`); `NUMBER_STEP` tak sempat tampil. Perbaikan: settle hanya setelah interaksi pertama (atau ada nomor tersimpan).
- Pertanyaan: "Bener nomor absenmu ${value}?" (`guide-script.ts:37`) → "Benar ini nomor absenmu, ${value}?". Jempol 2 s SESUAI (`:253`); bisa membetulkan SESUAI. Cincin: `extrasFrom="last"`.
- Sesi kelas: `onConfirm` simpan localStorage lalu `joinClass` hanya bila `joinToken` ada; error join ditelan (`SketchbookApp.tsx:142-152`). Perlu bubble Momo jujur saat kelas belum terhubung; jangan mengarang ID.


# Lampiran A3-cards

# A3: Audit tiga kartu tutorial dan pilihan level

**Mode:** READ-ONLY. Tidak ada perubahan repo, tidak ada build atau run. Semua klaim berasal dari source, `git show`, `git log`, `git diff`, dan grep.

**Repo:** `/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/ref/momo`, branch `claude-monorepo`, HEAD `1b880fa`, working tree bersih.

**Pembanding:** `d4bbaec` (Can, folder `implementation/`). `TutorialBrochure.tsx` identik di `8926992` dan `d4bbaec` (blob `1074c4f`). HEAD berbeda (blob `746fb93`) karena `9ba76d2` (2026-11-09).

**Konvensi path:** tanpa awalan berarti `frontend/implementation/` (HEAD). `d4:` berarti `implementation/` di `d4bbaec`.

**Aturan yang dipakai:** `BIGPROMPT.md` (instruksi Owner, bagian 1.2, 6.3, 6.4, 7, 15, 16, 17), `contexts/can/DECISIONS.md` (HEAD).

**Batas bukti:** pembaca tangan, kamera fisik, timing di browser, dan kalibrasi tangan ke layar belum diuji. Semua status di bawah berasal dari baca source.

**Legenda:** SESUAI = cocok dengan instruksi Owner dan keputusan. RUSAK = ada tetapi salah atau melanggar. HILANG = wajib tetapi tidak ada. MOCK = ada tetapi tiruan, bukan input nyata. BELUM TERBUKTI = perlu bukti runtime atau keputusan Owner.

---

## 1. Ringkasan

| # | Temuan | Status | Bukti |
|---|---|---|---|
| 1 | Kartu 1 kamera: cubit tahan lalu Thinman AUTO jalan 1,4 detik, lalu kartu tutup tanpa aksi menyeret. Ini yang ditolak Owner. | **RUSAK** | `TutorialBrochure.tsx:555, 566-570, 131-151, 82` |
| 2 | Tidak ada jalur tangan ke Thinman. Kartu 1 hanya menerima pointer mouse. | **HILANG** | `TutorialBrochure.tsx:155`. Grep `new PointerEvent`, `new MouseEvent`, `dispatchEvent` di `src/` dan `app/` tidak menemukan sintesis pointer dari tangan. |
| 3 | Cincin cubit (`PinchRing`) dipakai sebagai tombol "Lanjut" di ketiga kartu, menggantikan jempol (`ThumbConfirm`). | **RUSAK** | `TutorialBrochure.tsx:18, 641-646` (`9ba76d2`) |
| 4 | Tidak ada jeda baca 10 detik. Cincin tampil saat kartu terbuka atau saat syarat terpenuhi, tanpa menunggu Momo selesai bicara. | **RUSAK** | `TutorialBrochure.tsx:555, 639`. `MomoGuide` tidak dipasang `onDone` (`L670`). |
| 5 | Kartu 3: kanvas hanya pointer dan klik. Tidak ada gestur tangan untuk coret, hapus, mundur, dan maju. | **MOCK** | `TutorialBrochure.tsx:276, 287` |
| 6 | Kartu 3 lulus hanya dengan coret dan Mundur. Hapus dan Maju tidak wajib. Tanda "dicoba" muncul walau tidak ada aksi. | **RUSAK** | `TutorialBrochure.tsx:555, 536, 542, 551` |
| 7 | Level 4 "Bab 4 · Pembuktian" (komentar sendiri: "PROPOSAL, not yet approved") masuk `LEVELS`. Akibatnya 4 pita dan penutup setelah Bab 4. Owner menolak keras. | **RUSAK (kritis)** | `src/domain/levels.ts:145, 150-183, 185, 188`. Melanggar `BIGPROMPT.md:53-55, 154-155, 307, 344`. |
| 8 | Gating Bab 2 dan 3, highlight "Mulai Bab 1" dengan jempol 2 detik, dan pesan pita terkunci sudah benar. | **SESUAI** | `level-progress.ts:39-60`, `LevelRibbonBookmark.tsx:388-398, 424-425, 437-439` |
| 9 | Timing buka dan tutup kartu identik dengan `d4bbaec`. Tidak ada hunk diff di rentang baris itu. | **SESUAI** | Diff `d4` ke HEAD: hunk hanya di d4 baris 75, 271, 491, 505, 523, 554, 574. Timing ada di d4 315-321, 362, 379. |

**Commit penyebab:** `9ba76d2` (2026-11-09) mengubah kartu (ThumbConfirm ke PinchRing, auto-walk, STAGE_4). `1b880fa` (2026-11-09) menambah dwell tarik pita dan E2E baru.

---

## 2. Kartu 1: Thinman dan bendera

### 2.1 Cara Thinman bergerak sekarang (HEAD)

- **Kamera (default). RUSAK.** Ring cubit sudah aktif sejak kartu terbuka: `ready(0) = walked || inputMode === "camera"` (`TutorialBrochure.tsx:555`). Ring dirender bila `isReady && open === i` (`L639-646`). Cubit tahan 1200 ms (`PINCH_HOLD_MS` `L84`, `holdMs` `L582-585`) memanggil `pinchWalk()` (`L566-570`). Ini menyalakan `walkRequest` berdurasi 1400 ms (`WALK_MS` `L82`). Thinman berjalan sendiri dengan interval 16 ms (`L131-151`), lalu `onWalkDone` memanggil `goNext(0)` (`L559-565`). **Tidak ada aksi menyeret.** Ini persis "cubit tahan lalu AUTO jalan" yang ditolak Owner (`BIGPROMPT.md:138, 348`).
- **Mouse atau fallback. RUSAK (ringan).** Posisi X pointer di panel menentukan Thinman (`move`, `L123-128`). Handler `onPointerMove` dan `onPointerDown` dipasang tanpa cek tombol (`L155`). Jadi Thinman bergerak saat mouse hanya lewat (hover), bukan saat ditekan dan diseret. Posisi di atas 76% (`WALK_END` `L80`) membuat `walked = true` (`L560-561`) dan ring langsung aktif. Setelah bendera, Thinman masih bisa maju sampai 78% (`L125`). Tidak ada aturan "berhenti di bendera" yang tegas.
- **Visual bendera. BELUM TERBUKTI.** Bendera di CSS `right: 7%` (`app/styles/99-tutorial.css:52`), sedangkan selesai di 76% (`L80`). Selisih visual belum diukur.

### 2.2 Input yang tersedia

- `useHandGesture(active)` (`src/hooks/useHandGesture.ts:17-29`) memberi `HandGestureState` (`src/camera/thumb-tracker.ts:17-26`): `pinch`, `thumbUp`, `handVisible`, dan `cursor` (ujung telunjuk, dicerminkan dan dijepit 0..1, baris 24-25).
- Tracker hanya aktif saat komponen pemanggil ter-mount (`useHandGesture.ts:19-27`, `acquireThumbTracker` di `thumb-tracker.ts:124`). Di tutorial, satu-satunya pemanggil adalah `PinchRing` (`PinchRing.tsx:36`). Jadi tracker hanya jalan saat ring tampil. **HILANG** (untuk latihan kartu 3, tracker mati karena ring belum tampil).
- `cursor` dan `pinch` tersedia tetapi **tidak dipakai** Thinman. **HILANG** (data ada, konsumen tidak ada).
- Pola hand ke elemen sudah ada di `src/hooks/useDwell.ts:47-49, 99` (`elementFromPoint`), tetapi untuk tombol, bukan untuk menggerakkan karakter.
- Fallback tanpa kamera: ring menjadi tombol tahan mouse, sentuh, Enter, atau Spasi (`PinchRing.tsx:141-175`). Hint fallback sebelum jalan adalah "Geser Thinman ke bendera dulu." (`TutorialBrochure.tsx:92`).

### 2.3 Versi d4bbaec (Can): bagaimana Thinman bergerak

- Thinman mengikuti posisi X pointer (`d4:79, 93, 98`). Tidak ada auto-jalan.
- Copy kartu: "Dia mau menyeberangi buku gambar ini. Geser tanganmu ke kanan dan kiri buat ajak dia jalan ke bendera." (`d4:509`).
- Ring jempol (`ThumbConfirm`, 1000 ms, `d4:508-509, 560`) hanya aktif setelah `walked` (`d4:494`).
- Tidak ada jalur tangan ke Thinman di d4 (`git grep` pada `d4bbaec`: hanya `CustomEvent` status di `GlobalCamera.tsx:501-502` dan `input/index.ts:137, 144`).
- **Penilaian: MOCK untuk kamera.** Alurnya paling dekat dengan Owner (tidak auto-jalan, jempol setelah bendera), tetapi input kamera tidak tersambung dan tidak ada jeda 10 detik.

### 2.4 Kapan ring muncul: sekarang dan yang diminta

| Kondisi | HEAD sekarang | d4bbaec | Owner (`BIGPROMPT.md:138-140, 348`) |
|---|---|---|---|
| Kamera | Saat kartu terbuka (0 ms, `L555, 639`) | Tidak tersedia (ring hanya setelah `walked`, yang tidak terjadi lewat kamera) | Setelah sampai bendera dan baca minimal 10 detik |
| Mouse | Saat Thinman mencapai 76% | Saat Thinman mencapai 76% | Sama, ditambah 10 detik baca |
| Jenis konfirmasi | Cubit tahan 1200 ms | Jempol tahan 1000 ms | Jempol "sudah paham" |
| Setelah konfirmasi | Auto-jalan, lalu tutup | Klik ring, lalu tutup | Tutup pelan dengan animasi normal |

### 2.5 Status butir kartu 1

- Thinman mengikuti tangan saat cubit (seret kiri ke kanan): **HILANG**.
- Berhenti saat lepas dan selesai di bendera: **RUSAK** (tidak ada aturan lepas, hanya hover).
- Tanpa auto-jalan: **RUSAK** di HEAD (`WALK_MS` `L82`). Versi d4 sudah bebas auto-jalan.
- Ring hanya setelah sampai bendera: **RUSAK** di kamera (`L555`).
- Baca minimal 10 detik sebelum jempol: **HILANG** (`grep` 10000 dan 10 detik nol hasil di `TutorialBrochure.tsx`).
- Konfirmasi jempol, bukan cubit: **RUSAK** (`L641-646`).
- Tutup dengan animasi normal: **SESUAI** (timing sama dengan d4). Pemicunya yang salah.

---

## 3. Kartu 2: aman vs bahaya

- **Isi dan interaksi. SESUAI.** Judul "Pijakan aman, atau bahaya" dan copy "Gambar benda padat ... Hindari benda bahaya kayak duri ..." (`L584`). Ilustrasi statis dua zona (`SafetyPlayground` `L186-245`). Animasi `hop` dan `ouch` hanya dekor CSS (`99-tutorial.css:72-73`). **Tidak ada demo atau latihan interaktif.** Owner: "user membaca konten" (`BIGPROMPT.md:143`). Tidak ada yang perlu dipertahankan.
- **Gate ring. RUSAK.** `ready(1) = true` (`L555`). Ring tampil saat kartu terbuka (`L639`) tanpa menunggu Momo selesai bicara, karena `MomoGuide` tidak memakai `onDone` (`L670`). Tahan cubit 1000 ms (`L584`). Melanggar aturan 10 detik (`BIGPROMPT.md:144`) dan larangan menyela dialog Momo (`BIGPROMPT.md:122`).
- **Copy tidak cocok dengan UI. RUSAK.** `guide-script.ts:56`: "Sudah paham? Angkat jempolmu." Ring yang tampil adalah cubit.
- **Pisau. RUSAK terhadap keputusan terbaru.** Ilustrasi danger memuat pisau (`TutorialBrochure.tsx:231-235`). `DECISIONS.md:128` (D-20261105-24): "Benda bahaya cukup duri; ... kata 'pisau' dihapus dari tutorial". Konflik internal: `DECISIONS.md:74` masih menulis "duri/pisau". **BELUM TERBUKTI:** keputusan final soal pisau. Ubah lewat governance, bukan diam-diam (`BIGPROMPT.md:283`).

---

## 4. Kartu 3: kanvas latihan

### 4.1 Input di kanvas

- **Kanvas hanya pointer. MOCK.** `DrawPlayground` memakai `onPointerDown/Move/Up` (`TutorialBrochure.tsx:276`). Tombol alat memakai `onClick` (`L287`). Tidak ada pembaca gestur yang terhubung.
- **Pembaca tangan di tutorial. HILANG.** Impor tangan di `TutorialBrochure.tsx:11-23` hanya `PinchRing` (L18) dan `useInputMode` (L19). `DrawingSurface`, `HandDrawingDriver`, `useDrawingSurface`, dan `gesture-commands` tidak dipakai. Saat latihan, ring belum tampil, jadi tracker mati.
- **Pemetaan gestur yang sudah ada, hanya untuk layar gambar.** `src/input/hand-gesture.ts:262-265`: pinch ke draw, fist ke erase, two-fingers ke undo, split-palm ke redo. Undo dan redo perlu tahan 300 ms (`src/components/drawing/gesture-commands.ts:11, 21-51`). Dipasang di `src/components/drawing/hooks/useDrawingSurface.ts:38-39`.
- **Istilah redo. BELUM TERBUKTI.** Owner menulis "Redo telapak terbuka" (`BIGPROMPT.md:149`). Kode memakai `split-palm` (telapak terbelah). `open-palm` dipakai untuk lambaian (`hand-gesture.ts:146`). Perlu konfirmasi bentuk gestur.

### 4.2 Status "sudah dicoba" (`used`)

| Alat | Ditandai di | Masalah | Status |
|---|---|---|---|
| Coret | `moveStroke` `L515` | Pointer, bukan pinch | **MOCK** |
| Hapus | `L515` saat menghapus, dan `L551` saat tombol Hapus diklik | Klik saja sudah menandai | **RUSAK** |
| Mundur | `L536`: `mark("undo")` sebelum cek riwayat | Tanda muncul walau tidak ada yang di-undo | **RUSAK** |
| Maju | `L542`: `mark("redo")` sebelum cek | Sama seperti Mundur | **RUSAK** |

- **Riwayat undo. RUSAK (trace kode, belum dijalankan).** `undoDrawing` (`L532-540`) memanggil `historyRef.pop()` dulu, lalu cek `previous`. Pada undo di snapshot dasar, `previous` menjadi `undefined`, fungsi berhenti, dan snapshot dasar sudah terbuang. Urutan Mundur, Mundur, Maju, Mundur tidak mengubah kanvas.
- **Owner minta "stroke buffer"** (`BIGPROMPT.md:149`). Kode memakai snapshot `ImageData`, bukan buffer stroke. `DrawingSurface.undo()` dan `redo()` (`src/input/index.ts:294-303`) sudah mengembalikan boolean, bisa dipakai untuk tanda yang jujur.

### 4.3 Gate lanjut

- **RUSAK.** `ready(2) = Boolean(used.draw && used.undo)` (`L555`). Lanjut bisa tanpa hapus dan tanpa maju. Owner: "semua harus dicoba dulu" (`BIGPROMPT.md:150, 319`).
- **RUSAK.** Ring aktif setelah dua tanda, tanpa jeda baca 10 detik (`L639`).
- **RUSAK.** Copy Momo: "Dua gestur itu yang membuka Level 1." (`guide-script.ts:58`). Harus empat gestur.

### 4.4 Ukuran penghapus

- **Tutorial: tetap. SESUAI** dengan preferensi Owner "difiksin" (`BIGPROMPT.md:148, 363`). Garis hapus `lineWidth = 26` (`TutorialBrochure.tsx:507`), tanpa pengatur dua tangan.
- **Game: tidak tetap. RUSAK** terhadap preferensi Owner, di luar kartu. Radius tetap 28 px (`src/input/eraser.ts:5`), tetapi masih bisa diubah lewat roda mouse dan tombol `[`/`]` (`src/input/index.ts:45-59`), `setEraserRadius` (`L263`), pengatur dua tangan (`hand-stroke-pipeline.ts:63`, `mediapipe-input.ts:36`), dan kontrol UI (`DrawingScreen.tsx:135`). Keputusan untuk auditor layar gambar.
- **Ketidaksamaan ukuran. BELUM TERBUKTI secara visual.** Tutorial 26 satuan layout (diameter), di-scale dengan `fit` (`L53`). Game radius 28 px (diameter sekitar 56 px). Perlu ukur di layar.

### 4.5 Progres per gestur

- Owner: "berikan progress status tiap gesture tanpa mengubah state kalau gerak ambigu" (`BIGPROMPT.md:149`). Chip `tut-tool__tick` (`L290-292`) hanya tanda klik. **HILANG.**

---

## 5. Perubahan tim AI yang harus dibatalkan atau diubah

### 5.1 Ringkasan diff `d4bbaec` ke HEAD (`TutorialBrochure.tsx`, `9ba76d2`)

| Bagian | d4bbaec (Can) | HEAD |
|---|---|---|
| Ring kartu | `ThumbConfirm` (`d4:18, 560`) | `PinchRing` (`L18, 641-646`) |
| Syarat ring kartu 1 | `walked` (`d4:494`) | `walked \|\| camera` (`L555`) |
| Setelah ring kartu 1 | Klik, lalu `next(0)` | `pinchWalk`, auto-walk 1400 ms, `goNext` (`L566-570, 131-151`) |
| Tanda konfirmasi | Jempol 1000 / 1000 / 2000 ms (`d4:508-510`) | Cubit 1200 / 1000 / 2000 ms (`L84, 582-586`) |
| Copy kartu 1 | "Geser tanganmu ke kanan dan kiri ..." (`d4:509`) | "Bantu dia jalan sampai ke bendera." (`L583`) |
| Doc header | "Holding the thumbs-up on Lanjut" (`d4:4`) | "Holding a pinch on Lanjut" (`L4`) |
| Kanvas dan undo | Sama (`d4:447, 476, 482`) | Sama (`L507, 536, 542`), dengan bug tanda (bagian 4) |
| Timing buka dan tutup | Sama (`d4:315-321, 362, 379`) | Sama (`L375-381, 422, 439`) |

Komponen baru di `9ba76d2`: `src/components/ui/PinchRing.tsx` (176 baris), `PinchRing.css`, `src/hooks/useHandCursor.ts`, `src/camera/hand-cursor-store.ts`, `HandCursor.tsx`, `DwellButton.tsx`, dan `TutorialBrochure.css` (ditambah ke `9ba76d2`, tidak ada di d4).

### 5.2 Yang harus dibatalkan atau diganti

| Lokasi | Sekarang | Kembalikan atau ganti dengan |
|---|---|---|
| `TutorialBrochure.tsx:18` | `import { PinchRing }` | `import { ThumbConfirm } from "../ui/ThumbConfirm"` (seperti `d4:18`) |
| `L636-646` | `<PinchRing holdMs label onConfirm={i===0 ? pinchWalk : () => next(i)} testId="tutorial-pinch-N">` | `<ThumbConfirm holdMs disabled={!readDone} onConfirm={THUMB_CONFIRMED} testId="tutorial-thumb-N">` (seperti `d4:560`) |
| `L582-586` | `holdMs: PINCH_HOLD_MS` (1200), 1000, 2000 | `1000 \| 2000` seperti `d4:508-510`: 1000, 1000, 2000 |
| `L80-84` | `WALK_MS = 1400`, `PINCH_HOLD_MS = 1200` | Hapus keduanya. `WALK_END = 76` tetap sebagai ambang bendera |
| `L131-151` | Efek auto-walk (`setInterval`) | Hapus |
| `L332-333`, `L566-570` | `walkRequest`, `advanceAfterWalk`, `pinchWalk` | Hapus |
| `L555-565` | `ready` dan `onWalkDone` dengan tiga jalur maju | Ganti dengan FSM (bagian 6) |
| `L86-99` | Hint "Cubit tanganmu ... cincin penuh", "cubit dan tahan" | Teks jempol dan gestur yang sesuai |
| `L4` | Doc "Holding a pinch on Lanjut" | Doc jempol |
| `TutorialBrochure.css:9-12` | Selektor `.pinch-ring` | Selektor `.thumb-confirm` (cek markup `ThumbConfirm`) |
| `guide-script.ts:52-60` | Copy tutorial | Lihat 5.3 |
| `e2e/lib/harness.mjs:219-236` | `playTutorial` dan `holdPinch` memakai `tutorial-pinch-N` | Ganti ke `tutorial-thumb-N` |
| `tests/components/tutorial-pinch.test.tsx:63-147` | Menguji auto-walk dan cubit | Tulis ulang sesuai FSM |
| `tests/components/tutorial-motion-remediation.test.tsx:31-39` | Komentar "pinch ring is the practice" | Sesuaikan |

**Jangan dihapus:** `src/components/ui/PinchRing.tsx`. Owner meminta pinch dengan cincin konfirmasi untuk menangkap dan memindah objek (`BIGPROMPT.md:176`). Yang dilarang hanya memakainya sebagai tombol "Lanjut" kartu.

### 5.3 Copy yang ikut berubah

- `guide-script.ts:58`: "Dua gestur itu yang membuka Level 1." Ubah ke empat gestur.
- `guide-script.ts:54, 56, 60`: sudah bicara "jempol", cocok dengan `ThumbConfirm`. Setelah revert, copy ini benar.
- `guide-script.ts:52`: "Coba geser tanganmu ke kanan dan kiri." Cocok dengan tujuan drag, tetapi bertentangan dengan hint `L89` ("Cubit tanganmu"). Samakan.

---

## 6. Gate tutorial (BIGPROMPT bagian 7): peta sekarang dan usulan FSM

### 6.1 Peta state dan timer (HEAD)

- **State React:** `active` (`L317`), `open` (`L320`), `walked` (`L321`), `tool` (`L322`), `used` (`L323`), `walkRequest` (`L332`), `advanceAfterWalk` (`L333`), `moment` (`L573`).
- **Timer:**
  - `setInterval` 16 ms untuk auto-walk, dibersihkan (`L140, L150`). **SESUAI.**
  - rAF ring (`PinchRing.tsx:55-83`), dibatalkan (`L82`). **SESUAI.**
  - `setTimeout` pulse `PinchRing` (`L75`), dibersihkan (`L91`). **SESUAI.**
  - `setTimeout` 450 ms di `ThumbConfirm.tsx:89`, tidak disimpan dan tidak dibersihkan. **RUSAK ringan.**
  - rAF resize kanvas (`L462`), tidak dibatalkan. **RUSAK ringan.**
  - GSAP: buka (`L365-381`, `setOpen` pada 1,25 detik), tutup (`L388-405`), `goNext` (`L407-425`), mount (`L435-438`, dibersihkan `L451-455`). **SESUAI.**
  - Timer 10 detik: **tidak ada.** **HILANG.**
- **Jalur maju kartu:** tiga. Selesai jalan (`L559-565`), `pinchWalk` (`L566-570`), dan ring (`L644`). Guard `busyRef` (`L409`) hanya mencegah tumpang tindih, bukan sumber tunggal. **RUSAK.**
- **Momo selesai bicara:** `MomoGuide.onDone` ada (`src/components/momo/MomoGuide.tsx:26, 65`; `MomoChat.tsx:213-220`), tetapi tidak dipasang (`TutorialBrochure.tsx:670`). **HILANG.**
- **Kecepatan:** `timeScale(6)` saat `prefers-reduced-motion` (`L422, L439`). Kartu jadi 6 kali lebih cepat. Baseline d4 sama (`d4:362, 379`). **BELUM TERBUKTI** apakah ini penyebab "dipercepat" di mesin Owner. Bila kartu harus normal, jangan percepat timer; kurangi gerak lewat CSS saja.

### 6.2 Bentuk FSM kecil per kartu (usulan)

```ts
// usulan: src/components/onboarding/tutorial-card-gate.ts (fungsi murni, tanpa React)
export const READ_MS = 10_000; // BIGPROMPT bagian 7: minimal 10 detik baca

export interface CardGate {
  open: boolean; momoDone: boolean; practiceDone: boolean; readDone: boolean; closing: boolean;
}
export type CardEvent =
  | { type: "OPEN" } | { type: "MOMO_DONE" } | { type: "PRACTICE_DONE" }
  | { type: "READ_DONE" } | { type: "THUMB_CONFIRMED" } | { type: "CLOSE_DONE" };

export function cardGate(s: CardGate, e: CardEvent): CardGate {
  switch (e.type) {
    case "OPEN": return { open: true, momoDone: false, practiceDone: false, readDone: false, closing: false };
    case "MOMO_DONE": return s.open && !s.closing ? { ...s, momoDone: true } : s;
    case "PRACTICE_DONE": return s.open && !s.closing ? { ...s, practiceDone: true } : s;
    case "READ_DONE": return s.momoDone && s.practiceDone ? { ...s, readDone: true } : s; // hanya membuka kelayakan
    case "THUMB_CONFIRMED": return s.readDone && !s.closing ? { ...s, closing: true } : s; // satu-satunya jalan ke NEXT
    case "CLOSE_DONE": return { ...s, open: false };
  }
}
// Di komponen:
// - setTimeout(READ_DONE, READ_MS) dibuat saat momoDone && practiceDone && !readDone; dibersihkan saat unmount atau transisi.
// - ThumbConfirm: disabled={!readDone}; onConfirm -> THUMB_CONFIRMED. Latch ThumbConfirm (L61-63) mencegah jempol terbawa.
// - Setiap event membawa indeks kartu; reducer menolak event basi dari kartu sebelumnya.
// - Timer baca memakai setTimeout wall-clock, tidak ikut timeScale.
```

**Aturan:**
- `READ_DONE` hanya membuka kelayakan. Tidak pernah maju sendiri, sehingga tidak ada auto-skip.
- `THUMB_CONFIRMED` adalah satu-satunya event menuju NEXT.
- Kartu 1: `PRACTICE_DONE` saat Thinman mencapai `WALK_END`, dari seret mouse yang ditekan atau pinch-drag tangan.
- Kartu 2: `PRACTICE_DONE` dikirim saat `OPEN`, karena tidak ada aksi.
- Kartu 3: `PRACTICE_DONE` saat empat alat tercatat dengan aksi nyata (draw, erase, undo, redo).
- `MOMO_DONE` dari `MomoGuide.onDone`.

---

## 7. Pilih level

### 7.1 Sesuai

- **Gating. SESUAI.** Bab N+1 terbuka setelah Bab N menang (`src/app/level-progress.ts:5-6, 39-47`). Progres ditulis saat menang (`49-60`). Pengguna baru hanya Bab 1 yang terbuka (`39-40`).
- **Highlight pengguna baru. SESUAI.** `nextStageToPlay` (`LevelRibbonBookmark.tsx:424-425`) menandai pita berikutnya `is-next` (`L470`), dengan pil "Mulai Bab 1" yang memakai jempol 2000 ms (`L388-398`). Cocok dengan `BIGPROMPT.md:154`.
- **Copy pengguna baru. SESUAI untuk arah Bab 1.** `levelListStep(≤1)` (`guide-script.ts:66`): "Ini bab-bab bukunya. Pilih Bab 1, lalu tarik pitanya ke bawah." Kata "tarik" tidak cocok dengan jalur kamera (lihat 7.2).
- **Pita terkunci. SESUAI.** `onLockedTug` (`LevelRibbonBookmark.tsx:437-439`): "Selesaikan Bab {n-1} dulu", hilang setelah 2400 ms (`L443`). Tidak membuka sendiri.
- **Fallback. SESUAI.** Pil menjadi tombol (`ThumbConfirm.tsx:162-183`).

### 7.2 Rusak atau perlu keputusan

- **Level 4 ada. RUSAK (kritis).**
  - `levels.ts:145` (komentar "PROPOSAL, not yet approved by Can/Owner"), `L150-183` (`STAGE_4`), `L185` (`LEVELS` berisi 4), `L188` (`FINAL_LEVEL_STAGE` = 4).
  - Dampak: 4 pita (`LevelEntryScreen.tsx:25`, `LevelRibbonBookmark.tsx:459`). Penutup muncul setelah Bab 4.
  - Melanggar `BIGPROMPT.md:53-55` (tidak ada Level 4 atau tes Level 4), `154-155`, `307`, dan `344`.
  - **Perbaikan:** hapus `STAGE_4` dari `LEVELS` (`levels.ts:150-185`); `FINAL_LEVEL_STAGE` otomatis menjadi 3.
  - **Jejak yang ikut dibersihkan (di luar A3):** `src/game/stage-geometry-final.ts`, `src/components/stage-preview/StageArtworkFinal.tsx`, `src/domain/momo-script.ts:97`, `src/domain/world-intro-script.ts:27, 48`, `e2e/normal-journey.mjs:13`, `e2e/lib/harness.mjs:418`. Tes: `tests/domain/level-four-definition.test.ts`, `tests/domain/level-four-copy.test.ts`, `tests/components/level-ribbon-four.test.tsx`, `tests/game/four-level-progression.test.ts`, `tests/game/final-level-solvability.test.ts`, `tests/game/stage-geometry-final.test.ts`, `tests/components/stage-artwork-final.test.tsx`, dan `tests/components/ending-center-of-page.test.tsx:50-54`.
- **Hitungan jumlah. RUSAK (akibat Level 4).** "Semua bab sudah kebuka!" (`guide-script.ts:68`) dihitung dari `LEVELS` (`LevelEntryScreen.tsx:20`). Dengan 4 level dan 3 terbuka, kalimat "semua" keliru. Benar setelah STAGE_4 dihapus.
- **Bypass gating. RUSAK.** `?unlock=all` (`level-progress.ts:19-29, 42`) membuka semua bab tanpa penanda build atau tes. **Perbaikan:** bungkus dengan `NEXT_PUBLIC_TEST_HOOKS === "1"`, seperti `src/hooks/useHandGesture.ts:48`.
- **Dwell tarik pita 1200 ms. RUSAK, perlu keputusan.** `LevelRibbonBookmark.tsx:317-326` (`useDwell`, default 1200 ms di `src/hooks/useDwell.ts:18`): jari diam di pita langsung membukanya. `DECISIONS.md:196` (D-20261105-13): "gestur jempol untuk NUI nanti". Owner: jangan auto sebelum user paham (`BIGPROMPT.md:154`). **Usulan:** matikan dwell tarik pita, pakai pil jempol 2000 ms.
- **Copy "tarik pitanya" tidak cocok dengan kamera. RUSAK ringan.** Di kamera, jalurnya jempol di pil. Usulan: "Pilih Level 1, lalu angkat jempol di pitanya." (perlu koordinasi copy).
- **Istilah Bab atau Level. BELUM TERBUKTI.** UI memakai "Bab": tag visual `LevelRibbonBookmark.tsx:368`, judul `levels.ts:52, 80, 117`, `guide-script.ts:66-68`, pil "Mulai Bab N" (`L392`). Aria memakai "Level N" (`L332`). Tutorial memakai "Mulai Level 1" (`TutorialBrochure.tsx:585`, `DECISIONS.md:78`). Owner menulis "Level 1" (`BIGPROMPT.md:154, 348`). Perlu satu keputusan.

### 7.3 Layout

- `shelfLayout` (`LevelRibbonBookmark.tsx:81-95`) memakai `LEVELS.length`. Setelah STAGE_4 dihapus, layout tiga pita tetap berfungsi. Tes `tests/components/level-ribbon-shelf.test.tsx` menyesuaikan sendiri. **SESUAI** (cek tes setelah perubahan).

---

## 8. Urutan perbaikan

1. **Hapus Level 4** di `src/domain/levels.ts`. Kritis, menolak instruksi Owner. (**RUSAK**)
2. **Kembalikan `ThumbConfirm`** di tiga kartu. Hapus `pinchWalk`, `WALK_MS`, dan `ready(0)` untuk kamera. (**RUSAK**)
3. **Pasang FSM** (bagian 6.2) dengan `MomoGuide.onDone`, timer 10000 ms, dan `disabled` pada ring. (**HILANG**)
4. **Sambungkan tangan.**
   - Kartu 1: `useHandGesture().cursor` dan `pinch`, plus seret mouse yang ditekan.
   - Kartu 3: pakai `useDrawingSurface` (`src/components/drawing/hooks/useDrawingSurface.ts:20`) atau tambahkan `pose` ke tracker.
   - Satu pembaca tangan: ring memakai `externalThumbUp` (`ThumbConfirm.tsx:26-30`). (**HILANG, MOCK**)
5. **Tanda `used` hanya setelah aksi nyata.** Pakai boolean `DrawingSurface.undo()` (`src/input/index.ts:294-303`). Gate: draw, erase, undo, redo. (**RUSAK**)
6. **Riwayat undo.** Pakai `StrokeStore` sesuai "stroke buffer", atau perbaiki snapshot dasar. (**RUSAK**)
7. **Copy.** `guide-script.ts:52-60` dan `:66-68` disesuaikan dengan jempol, empat gestur, dan istilah yang diputuskan.
8. **Keputusan Owner:** istilah Bab atau Level, dwell tarik pita, ukuran penghapus, gestur redo, pisau (`DECISIONS.md:74` vs `:128`), dan percepatan reduced-motion (6 kali).

---

## 9. Batas bukti dan BELUM TERBUKTI

- Semua hasil berasal dari source. Kamera fisik, MediaPipe, dan animasi di browser belum dijalankan. `BIGPROMPT.md:246` melarang klaim hardware camera PASS dari synthetic events.
- E2E (`e2e/lib/harness.mjs:219-236`) memakai drag mouse dan hook tes (`src/hooks/useHandGesture.ts:48-51`). Bukan bukti kamera.
- Kalibrasi tangan ke layar belum ada. Koordinat `cursor` (0..1) ke persen kartu 1 belum dibuktikan. `mapToCanvas` (`src/input/hand-gesture.ts:30`) bisa dipakai sebagai dasar.
- Penyebab "dipercepat" belum terbukti. Kandidat: `timeScale(6)` saat reduced-motion (`L422, L439`). Baseline "normal" butuh commit sebelum `8926992` (di luar A3).
- Bug riwayat undo dan ukuran penghapus visual: hasil trace dan ukur, belum dijalankan.
- Posisi bendera visual dibanding `WALK_END` 76%: belum diukur.


# Lampiran A4-levels

# A4 — Level, menggambar, Top-3, penempatan, gameplay, penutup, dan jejak Level 4

**Repo yang dibaca:** `/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/ref/momo` (branch `claude-monorepo`, HEAD `1b880fa`).
Path di bawah relatif terhadap repo itu. Baseline sebelum Level 4: `777e181`. Baseline Can: `d4bbaec` (`implementation/`, di sana `LEVELS` tetap tiga entri, `implementation/src/domain/levels.ts:144`, dan penutup setelah Level 3, `implementation/src/app/SketchbookApp.tsx:212`).
Penyebab utama: `9ba76d2` (Level 4, alur gambar, render tanpa kotak) dan `1b880fa` (NUI daftar level/penutup, e2e, dokumen).

**Metode:** read-only. Hanya `git grep`, `git show`, `git diff`, `git log -S`. Tidak ada build, test, checkout, atau perubahan berkas. PNG/webm tidak dibuka isinya.

**Tanda:** `SESUAI` · `RUSAK` · `HILANG` · `MOCK` · `BELUM TERBUKTI`.

**Sumber aturan:** BIGPROMPT.md §1.2, §6.5–6.9, §7, §9, §15, §17 dan Lampiran §16. Keputusan: `contexts/can/DECISIONS.md` (HEAD).

---

## 0. Ringkasan

1. **Level 4 masih hidup di kode, data, e2e, dan dokumen.** Ada 10 berkas baru (semua dari `9ba76d2`) dan puluhan lokasi baris di berkas lama (daftar di §1.2). Efek nyata: penutup dipicu setelah Level 4 (`SketchbookApp.tsx:211`), signpost Level 3 bertuliskan "Pembuktian" (`StageArtwork.tsx:61`), dan daftar level/slide preview menampilkan empat entri. Usulan revert ada di §1.
2. **Dialog intro (RUSAK):** jempol bisa dikonfirmasi sejak baris pertama dialog Momo mulai diketik, sehingga bisa memotong ucapan (`LevelIntro.tsx:197, 216-223`; `MomoChat.tsx:240-241`). Momo juga naik sendiri 4.500 ms setelah dialog selesai tanpa jempol (`LevelIntro.tsx:33, 139-145`).
3. **Layar gambar:**
   - Prompt idle 10 detik **HILANG**.
   - Saat menebak, Momo **bergeser ke kanan** (`useMomoCompanionLayout.ts:46-47`) dan **mengecil** dari 170 ke 136 px (`DrawingScreen.tsx:198`). Owner minta pojok kiri atas dan sedikit membesar.
   - Top-3 hanya setelah jempol: SESUAI. Anti submit ganda: SESUAI.
4. **Prediksi partner (RUSAK, pemblokir):** label model di backend adalah 20 kelas bahasa Inggris (`config.py:8-14`). Label level berbahasa Indonesia (`levels.ts:61, 95, 131, 171`). Irisannya kosong, jadi setiap tebakan partner menjadi "unresolved". Selain itu, `SubmissionAdapter` mengirim kandidat mock ke `/api/submissions` tanpa cek mode (`submission-adapter.ts:51-78`, `useLevelSession.ts:117`).
5. **Render hasil gambar:** `9ba76d2` menghapus kotak dan kartu (`creation-renderer.ts:21-26`). Ini sejalan dengan "jangan dikotakin lagi". **Pertahankan HEAD.**
6. **Penempatan:** tidak ada cincin konfirmasi sebelum pindah (HILANG). Lepas jari tidak menaruh objek (RUSAK). Penaruhan hanya lewat tombol klik "Taruh di sini" (`PlacementControls.tsx:15-23`), bukan NUI. **Rotasi objek TIDAK ADA** (HILANG). Hitbox AABB.
7. **Gagal/ulang:** tombol bernama "Gambar ulang" (`FailOverlay.tsx:51`, `DecisionPanel.tsx:117-121`). Keputusan D-20261105-06 mewajibkan "Gambar lagi" (RUSAK, copy).
8. **Penutup:** portal HILANG. Kuis/survei HILANG. Ukuran performa netral HILANG. Thinman hidup dan ringkasan data-driven SESUAI. Ada konflik D-20261105-15 vs D-20261105-24 yang perlu keputusan Owner (§9.8).

---

## 1. Jejak Level 4 (wajib dihapus; Owner: hanya 3 level)

### 1.1 Berkas yang dihapus seluruhnya

Semua dibuat di `9ba76d2` (`git log --diff-filter=A`), jadi "nilai sebelum" = tidak ada di `777e181`.

| Path | Aksi |
|---|---|
| `frontend/implementation/src/components/stage-preview/StageArtworkFinal.tsx` | Hapus. Artwork "Pembuktian" (`:5, :13`). |
| `frontend/implementation/src/game/stage-geometry-final.ts` | Hapus. Geometri L4 (`:2, :12-14, :40-55`). |
| `frontend/implementation/tests/app/level-summary-final.test.ts` | Hapus. `describe("Bab 4 summary copy")` (`:5`). |
| `frontend/implementation/tests/components/level-ribbon-four.test.tsx` | Hapus. "level list with four bookmarks (Bab 4 Pembuktian)" (`:16-23`). |
| `frontend/implementation/tests/components/stage-artwork-final.test.tsx` | Hapus. "Bab 4 artwork matches its colliders" (`:10-11`). |
| `frontend/implementation/tests/domain/level-four-copy.test.ts` | Hapus. Copy dan nada L4 (`:11, :43-57`). |
| `frontend/implementation/tests/domain/level-four-definition.test.ts` | Hapus. `expect(FINAL_LEVEL_STAGE).toBe(4)` dan `stage-4-proof` (`:9-12`). |
| `frontend/implementation/tests/game/final-level-solvability.test.ts` | Hapus. Solvability L4 (`:1-4, :48`). |
| `frontend/implementation/tests/game/four-level-progression.test.ts` | Hapus. `isLevelUnlocked(4)`, `nextStageToPlay([1,2,3,4])` (`:20-28, :65-68`). |
| `frontend/implementation/tests/game/stage-geometry-final.test.ts` | Hapus. Geometri L4 (`:10-39`). |
| `docs/migration/evidence/iter4/journey/evidence.json` | Hapus, atau buat ulang tanpa run L4. Dibuat di `1b880fa`. Memuat `"stage": 4` (`:44, :52, :60, :68`), `"=== LEVEL 4 ==="` (`:672`), dan daftar "Bab 4 Pembuktian" (`:1054`). |

### 1.2 Baris yang dikembalikan (berkas sudah ada di 777e181)

**`frontend/implementation/src/domain/levels.ts`**
- `:144-183` blok `const STAGE_4` beserta komentar "PROPOSAL, not yet approved" (`:145-149`). **Hapus.**
- `:185` `export const LEVELS: LevelDefinition[] = [STAGE_1, STAGE_2, STAGE_3, STAGE_4];`. **Sebelum (777e181:144):** `export const LEVELS: LevelDefinition[] = [STAGE_1, STAGE_2, STAGE_3];`
- `:187-188` `FINAL_LEVEL_STAGE`. **Sebelum:** tidak ada. Jika ingin dipertahankan, nilainya otomatis 3 setelah `LEVELS` dikembalikan.

**`frontend/implementation/src/domain/mission-config.ts`**
- `:12` `stage: 1 | 2 | 3 | 4;` → sebelum `stage: 1 | 2 | 3;`
- `:24` komentar "Stage 4: wide gap over spikes…" → hapus (sebelum tidak ada).
- `:31` `Record<1 | 2 | 3 | 4, StageTemplate>` → sebelum `Record<1 | 2 | 3, StageTemplate>`
- `:47-52` blok `4: { titleTemplate: "Bantu {character} sampai ke menara!", … }` → hapus.
- `:64` `level.stage <= 4 … as 1 | 2 | 3 | 4` → sebelum `level.stage <= 3 … as 1 | 2 | 3`

**`frontend/implementation/src/domain/momo-script.ts`**
- `:93` `Record<1 | 2 | 3 | 4, MomoLevelTone>` → sebelum `Record<1 | 2 | 3, MomoLevelTone>`
- `:97-98` komentar dan `4: { tone: "humble", fog: 1, guessMood: "Khawatir" }` → hapus.
- `:101` komentar "(1..4)" → "(1..3)".
- `:103` `stage <= 4 … as 1 | 2 | 3 | 4` → sebelum `(stage === 2 || stage === 3 ? stage : 1) as 1 | 2 | 3`
- Jangan ikut mengembalikan `momoLine` (`:48-50`, `string[]`). Itu bukan L4.

**`frontend/implementation/src/domain/world-intro-script.ts`**
- `:10` `Record<1 | 2 | 3 | 4, string[]>` → sebelum `Record<1 | 2 | 3, string[]>`
- `:27-32` komentar "Bab 4" dan blok `4: [ "Ini bab terakhir…", … ]` → hapus.
- `:36` `stage <= 4 … as 1 | 2 | 3 | 4` → sebelum `stage <= 3 … as 1 | 2 | 3`
- `:44` `Record<1 | 2 | 3 | 4, string>` → sebelum `Record<1 | 2 | 3, string>`
- `:48-49` komentar dan `4: "Satu pijakan belum cukup…"` → hapus.
- `:53` `stage <= 4 … as 1 | 2 | 3 | 4` → sebelum `stage <= 3 … as 1 | 2 | 3`
- `:22-24` (dua baris untuk L3) bukan L4. Lihat §8.

**`frontend/implementation/src/domain/types.ts`**
- `:62` `stage: 1 | 2 | 3 | 4;` → sebelum `stage: 1 | 2 | 3;`

**`frontend/implementation/src/game/stage-geometry.ts`**
- `:2` `import { getFinalStageGeometry } from './stage-geometry-final';` → hapus.
- `:8-9` `stage` dan `sceneIndex: 1 | 2 | 3 | 4` → sebelum `1 | 2 | 3`
- `:34-35` `getStageGeometry(stage: 1 | 2 | 3 | 4)` dan `if (stage === 4) return getFinalStageGeometry();` → sebelum `getStageGeometry(stage: 1 | 2 | 3)` tanpa baris `if`.
- Perubahan geometri Level 2 (`case 2`, `:52-77`) berasal dari `9ba76d2` tetapi bukan L4. Lihat §8.

**`frontend/implementation/src/components/stage-preview/scene-metadata.ts`**
- `:2` `SceneIndex = 0 | 1 | 2 | 3 | 4` → sebelum `0 | 1 | 2 | 3`
- `:9` `{ index: 4, title: 'Pembuktian', level: 4, caption: '…' }` → hapus.

**`frontend/implementation/src/components/stage-preview/StageArtwork.tsx`**
- `:60` komentar "Bab 4 has a flag…" → hapus.
- `:61` `Record<1|2|3|4, string> = { 1: 'Menara Lipatan', 2: 'Lorong Kabut', 3: 'Pembuktian', 4: 'Pusat Halaman' }` → **sebelum (777e181):** `Record<1 | 2 | 3, string> = { 1: 'Menara Lipatan', 2: 'Lorong Kabut', 3: 'Pusat Halaman' }`. Ini penting: signpost Level 3 **harus** berujung ke "Pusat Halaman". Sekarang berujung ke "Pembuktian".
- `:67` `level: 1 | 2 | 3 | 4` → `1 | 2 | 3`

**`frontend/implementation/src/components/stage-preview/StageWorld.tsx`**
- `:2` `import { StageArtworkFinal } …` → hapus.
- `:20` `{scene === 4 ? <StageArtworkFinal …/> : <StageArtwork …/>}` → sebelum `<StageArtwork scene={scene} gameplay={gameplay} />`

**`frontend/implementation/src/components/level/LevelIntro.tsx`**
- `:17` `import { FINAL_LEVEL_STAGE, type LevelDefinition }` → sebelum `import type { LevelDefinition } from "@/src/domain/levels";`
- `:22` `import { getFinalStageGeometry }` dan `:23` `import type { SceneIndex }` → hapus.
- `:74-75` `spawn = (level.stage === FINAL_LEVEL_STAGE ? getFinalStageGeometry() : getStageGeometry(level.stage as 1|2|3)).spawn` → sebelum `const spawn = getStageGeometry(level.stage as 1 | 2 | 3).spawn;`
- `:166-167` komentar "Scene 4 needs StageWorld…" dan `scene={level.stage as SceneIndex}` → sebelum `<StageWorld scene={level.stage} gameplay />`
- Hati-hati: `LevelIntro.tsx` juga memuat perubahan NUI dari `9ba76d2` dan `1b880fa` (`DwellButton`, `usePageThumb`). Itu bukan L4 dan tidak boleh ikut dikembalikan.

**`frontend/implementation/src/app/SketchbookApp.tsx`**
- `:3` `import { FINAL_LEVEL_STAGE, getLevel, … }` → sebelum `import { getLevel, type LevelDefinition } from "@/src/domain/levels";`
- `:211` `if (level.stage === FINAL_LEVEL_STAGE) wonFinalRef.current = true;` → sebelum `if (level.stage === 3) wonFinalRef.current = true;` (`777e181:221`). Akibatnya penutup kini dipicu setelah Level 4. Setelah revert, setelah Level 3.

**`frontend/implementation/src/prediction/mock-prediction-provider.ts`**
- `:25` `stage: 1 | 2 | 3 | 4` → `1 | 2 | 3`
- `:49` `Record<1 | 2 | 3 | 4, [number, number, number]>` → `Record<1 | 2 | 3, …>`
- `:53` `4: [0.5, 0.33, 0.17],` → hapus.

**`frontend/implementation/src/components/level/LevelRibbonBookmark.tsx`**
- `:41` komentar "Narrowest ribbon that still fits "Pembuktian" (the longest label)". **Salah sejak awal:** label terpanjang sebenarnya "Lorong Kabut Penghapus" (Bab 3, `levels.ts:117`), karena `stageName()` memakai bagian judul setelah "·" (`:134-135`). Perbaiki komentar. Hitung ulang `MIN_RIBBON_W = 84` (`:42`) terhadap label terpanjang yang tersisa.
- `:68` "When four ribbons cannot keep…" → sesuaikan dengan jumlah level.

**Tes (berkas lama yang ikut berubah):**
- `frontend/implementation/tests/app/route-guard.test.ts:21-24`: `it("opens Bab 4 only after…")` dengan `"/level4"`. Hapus. Di 777e181 berkas ini 36 baris tanpa tes ini.
- `frontend/implementation/tests/components/components.test.tsx:218-221`: `it("renders four bookmarks…")` dan `toHaveLength(4)`. Hapus (tidak ada di 777e181).
- `frontend/implementation/tests/components/ending-center-of-page.test.tsx:49-55`: `it("the overview has one card per finished level, Bab 4 included")`. Hapus.
- `frontend/implementation/tests/components/stage-artwork.test.tsx:55-56`: `next = { …, 3: "Pembuktian" }`. **Sebelum:** `3: "Pusat Halaman"` (komentar R15 di 777e181). `:68-70`: `it("provides the gameplay scene and the four level scenes")` dengan `toHaveLength(5)`. **Sebelum:** `it("provides exactly four original scene metadata entries")` dengan `toHaveLength(4)` dan judul `["Gameplay Screen","Halaman yang Sobek","Menara Lipatan","Lorong Kabut Penghapus"]`.
- `frontend/implementation/tests/components/level-ribbon-shelf.test.tsx` (berkas baru dari `9ba76d2`): `:36-38`, `:42-45`, `:58-62` menyebut "four bookmarks", "4 * (84+7)+3*14". Ganti ke jumlah level 3 dan hitung ulang angkanya. **BELUM TERBUKTI** setelah diubah.
- `frontend/implementation/tests/domain/momo-script-lines.test.ts:33` `for (const stage of [1, 2, 3, 4])` → `[1, 2, 3]` (berkas baru dari `9ba76d2`).
- `frontend/implementation/tests/game/level-reachability.ts:38` `buildWorld(stage: 1 | 2 | 3 | 4, …)`. **Sebelum (777e181):** `buildWorld(stage: 1 | 2 | 3, …)`.
- `frontend/implementation/tests/game/level-solvability.test.ts:13` `[1, 2, 3, 4] as const` → **sebelum:** `[1, 2, 3] as const`. `:41` `[1, 2, 3, 4]` dan judul "L1-L4 are NOT solvable" → `[1, 2, 3]` dan "L1-L3". `:47` `as 1 | 2 | 3 | 4` → `as 1 | 2 | 3`. Blok L2 (`getStageGeometry(2)` dan `runPlan` 5 langkah) bukan L4. Lihat §8.
- `frontend/implementation/tests/responsive-viewports.mjs:94` mengharapkan "3 level cards visible". Tes ini memegang aturan tiga level. Di HEAD akan gagal (empat kartu).

**e2e:**
- `frontend/implementation/e2e/lib/level-plans.json`: hapus kunci `"4"` (`:105-144`). Ubah `:104` `},` menjadi `}`. **Sebelum (777e181):** hanya kunci `"_note"`, `"objectSize"`, `"1"`, `"2"`, `"3"`.
- `frontend/implementation/e2e/normal-journey.mjs:12` `process.env.LEVELS || "1,2,3,4"` → **sebelum:** `"1,2,3"` (`777e181:12`).
- `:13-14` komentar "the ending… follows the FINAL level (Bab 4)" dan `const ENDING_AFTER = 4;` → **sebelum:** `if (stage === 3)` dan `if (stage < 3 && …)` (`777e181:154, 169`).
- `frontend/implementation/e2e/lib/harness.mjs:418` komentar "after the final level (Bab 4)" → **sebelum:** "after the L3 win" (`777e181:357`).

**Dokumen root:**
- `CHANGELOG.md:25` "Feature (usulan): Level 4 "Pembuktian" dan layar tamat setelahnya." (dari `1b880fa`). **Hapus.**
- `docs/migration/INTEGRATION_REPORT.md:74` kalimat "Level 4 lolos di browser pada percobaan ke-3 …" (dari `1b880fa`). **Hapus kalimat.**
- `docs/migration/UNRESOLVED.md:55` baris E3 "Level 4 "Pembuktian" (usulan saya…)" (dari `1b880fa`). **Hapus atau tandai dibatalkan.** Mengubah ini butuh persetujuan governance bila dianggap dokumen keputusan.

### 1.3 Di luar daftar, tetapi tetap jejak

- `frontend/implementation/src/components/stage-preview/StagePreview.tsx:106-112` merender slide dengan `Level {scene.level}` dari `STAGE_SCENES`. Di HEAD ada slide "Level 4 - Pembuktian". Hilang otomatis setelah `scene-metadata.ts` dikembalikan.
- `frontend/implementation/src/components/ending/CenterOfPage.tsx:3` komentar "After Level 3…", sedangkan kode di HEAD memicu setelah Level 4 (`SketchbookApp.tsx:211`). Komentar ini sudah benar sebelum L4.
- **Bukan level, jangan dihapus:** `contexts/can/BAB_4_Implementasi_dan_Pengujian.md` dan naskah akademik (`contexts/can/academic/…`) memakai "Bab 4" sebagai bab skripsi. `contexts/can/project/storyline.md:33` "Babak 4" adalah babak cerita.
- Tidak ada kalimat "Level 4" di `contexts/can/DECISIONS.md`, `NOW.md`, atau `project/OWNER_MANDATES.md`. Satu-satunya jejak keputusan adalah usulan di kode, `CHANGELOG.md`, dan `docs/migration/UNRESOLVED.md`.
- PNG di `docs/migration/evidence/iter4/{finish-flow,recovery}/` tidak diverifikasi isinya (biner). Metadata JSON-nya tidak memuat level 4.

### 1.4 Verifikasi setelah revert (saran)

```
git grep -n -E 'STAGE_4|FINAL_LEVEL_STAGE|stage-geometry-final|StageArtworkFinal|Pembuktian|stage-4|stage-proof|level-four|Bab 4|SIGNPOST' -- frontend/implementation docs/migration CHANGELOG.md README.md
```

Hasilnya harus kosong, kecuali komentar yang disengaja. Lalu jalankan `tests/responsive-viewports.mjs` dan vitest untuk `tests/game`, `tests/components`, `tests/domain`, `tests/app`.

---

## 2. Intro level (`LevelIntro.tsx`)

**Alur:** story → nudge → rise → finish. `LevelIntro.tsx:154-241`, `phase` dari `:37`.

- **Dialog Momo: SESUAI.** Story memakai `introLines` (`world-intro-script.ts:10-26`). Nudge mengajak memilih benda (`:44-49`), dan kartu benda hanya saran (`LevelIntro.tsx:201-215`). Copy Level 1: "Di dunia ini, cuma beberapa benda yang bisa hidup dari gambarmu." (`:55`).
- **Jempol memotong ucapan: RUSAK** (BIGPROMPT §6.5 dan §7).
  - `ThumbConfirm` "Ke langit" (`holdMs=1000`, `:216-223`) berada di dalam `MomoChat` nudge (`:190-224`).
  - `MomoChat` menampilkan `children` sejak huruf pertama baris pertama muncul (`extrasFrom="first"`, `LevelIntro.tsx:197`; `MomoChat.tsx:240-241`).
  - `rise()` hanya memeriksa `phase` dan `finishedRef` (`LevelIntro.tsx:91-92`). Tidak memeriksa `storyDone`. Jadi jempol bisa menaikkan Momo ketika baris kedua dan ketiga masih diketik. Fade-out 0,3 s (`:88`) memotong sisanya.
  - **Sebelum (d4bbaec, `MomoChat.tsx:118`):** `index >= 0`, yaitu children tampil bahkan sebelum huruf pertama. HEAD lebih ketat tetapi masih salah.
  - **Usul:** tambahkan `if (!storyDone) return;` di `rise()` (`LevelIntro.tsx:91-92`), atau pakai `extrasFrom="last"`. Ring jempol baru aktif setelah `onDone` nudge (`:198`).
- **Auto-rise 4,5 s: RUSAK** (BIGPROMPT §7, "jangan auto-skip"; §6.5, "konfirmasi jempol bukan skip").
  - `INTRO_LINGER_MS = 4500` (`LevelIntro.tsx:33`). `setTimeout(rise, 4500)` setelah `storyDone` (`:139-145`).
  - Momo naik tanpa jempol. Sudah ada di d4bbaec (`implementation/src/components/level/LevelIntro.tsx:24, 129-130`).
  - **Usul:** hapus `lingerRef`. Atau jadikan opsi yang diputuskan Owner. **Angka:** sebelum 4500 ms otomatis; sesudah tidak ada otomatis, hanya jempol 1000 ms.
- **Momo terbang ke atas: SESUAI** (animasi ada, tidak terpotong).
  - Timeline: Momo `y += 16` (0,28 s), Momo ke (0,0) selama 1,15 s, kamera `yPercent 0` selama 2,1 s, awan dekat `y: -220 → 260` selama 2,1 s, rotasi yoyo 0,5 s (`LevelIntro.tsx:104-109`).
  - Setelah timeline, `finish()` memudarkan seluruh intro 0,3 s (`:88`). Ini bukan "diam" di posisi tujuan, melainkan fade.
  - **Reduced motion: RUSAK kecil.** `if (!camera || !momo || reducedMotion()) finish()` (`:98`) membuat Momo langsung hilang tanpa terbang. BIGPROMPT §6.5 melarang hilang tiba-tiba. **Usul:** untuk reduced motion, pakai durasi 0 atau fade pendek, bukan lompat.
  - BELUM TERBUKTI visual (tidak ada rekaman yang diperiksa).
- **Kamera naik: SESUAI.** `CAMERA_START = -66.6667` (`:39`) dan `.to(camera, {yPercent: 0, duration: 2.1})` (`:106`).
- Timing intro tidak berubah sejak d4bbaec. Diff `777e181..HEAD` untuk timeline nol.

---

## 3. Layar gambar (`DrawingScreen.tsx`, `useMomoCompanionLayout.ts`, `momo-cue.ts`, `DrawingActions.tsx`)

- **Posisi Momo saat menggambar: SESUAI.** `IDLE_POSITION = {x: 28, y: 24}` (`useMomoCompanionLayout.ts:12`), pojok kiri atas.
- **Posisi Momo saat menebak: RUSAK** (BIGPROMPT §6.6.1 dan §15: "Momo pojok kiri atas saat gambar/menebak; emphasis boleh sedikit lebih besar").
  - Saat `isProbe` (fase bukan `drawing`), `x = popup.right − section.left + 16` dan `y = popup.top − section.top` (`useMomoCompanionLayout.ts:46-47`). Popup geometri ada di `left: 28px`, `width: min(440px, …)` (`app/styles/85-top3-popup.css:6-12`). Jadi Momo bergeser ke sekitar x ≈ 484 px.
  - `transform` dan transisi 400 ms (`DrawingScreen.tsx:185`; `app/styles/70-drawing-screen.css:161-168`).
  - Sudah ada di d4bbaec. `useMomoCompanionLayout.ts` identik antara d4bbaec dan HEAD (md5 sama).
  - **Usul:** pakai `IDLE_POSITION` untuk semua fase (`useMomoCompanionLayout.ts:46-47` selalu mengembalikan `IDLE_POSITION`), sehingga Momo dan chat tebakan tetap di pojok kiri atas. Pergerakan dan `ARRIVAL_SAFETY_MS` (`:11`) bisa dihapus. Popup geometri (`85-top3-popup.css:6-12`) tinggal dipakai untuk ukuran.
- **Ukuran emphasis: RUSAK.** `avatarHeight={showGuess ? 136 : 170}` (`DrawingScreen.tsx:198`). Saat menebak Momo **mengecil** 20%. Owner minta sedikit lebih besar.
  - **Usul:** misalnya `showGuess ? 186 : 170` (sekitar +10%), tanpa menutupi area gambar. Angka ini usulan, bukan dari brief.
- **Prompt idle 10 detik: HILANG** (BIGPROMPT §6.6.3 dan §15: "Idle 10 detik hanya membuat pertanyaan Momo, tidak otomatis menebak").
  - Tidak ada timer idle di fase gambar. `setTimeout` di `components/drawing` hanya `useMomoCompanionLayout.ts:57`. Tidak ada kalimat "acungkan".
  - Penyebab: `9ba76d2` menghapus R11 auto-ask (`GUESS_IDLE_MS = 1000`, `777e181:frontend/implementation/src/components/prediction/guess-stream.ts:9`) berdasarkan instruksi Owner 2026-11-09 (`CHANGELOG.md:17`; `DrawingScreen.tsx:54-56`).
  - **Konflik instruksi:** Owner 2026-11-09 minta Momo diam saat menggambar. BIGPROMPT (2026-11-10) minta pertanyaan setelah 10 detik idle. Keduanya bisa didamaikan: diam saat aktif menggambar, bertanya saat idle 10 detik. Belum ada keputusan tertulis.
  - **Usul:** timer 10 000 ms yang di-reset setiap ada goresan baru (`hasInk` dari `useDrawingSurface` di `DrawingScreen.tsx:84`; sinyal goresan belum ada, perlu ditambah). Saat habis, tampilkan `"Sudah selesai gambarnya? Kalau sudah, coba acungkan jempol, ya."` di bubble. **Jangan** memanggil predict. Minta konfirmasi Owner dulu.
  - Catatan M-020 (`contexts/can/project/OWNER_MANDATES.md`): "Momo nebak sambil gambar". Itu sudah digantikan instruksi 2026-11-09. Pertanyaan idle tidak menebak, jadi tidak bertentangan langsung.
- **Top-3 hanya setelah jempol: SESUAI.**
  - Jempol "selesai gambar" = `ThumbConfirm holdMs=2000` (`DrawingActions.tsx:46-55`) memanggil `onSubmit`.
  - `SketchbookApp.tsx:116-119` hanya lanjut bila fase `drawing`.
  - `state-machine.ts:184-196` `submitDrawing` memanggil `require("drawing")`, lalu `runPrediction` (`:215-218`) mengubah fase ke `predicting` secara sinkron.
  - `showGuess` hanya untuk `evaluating` atau `prediction-error` (`DrawingScreen.tsx:117`).
- **Anti submit ganda: SESUAI.**
  - `ThumbConfirm` menerapkan latch: setelah konfirmasi harus dilepas dulu (`ThumbConfirm.tsx:61-63`, `:73-92`).
  - Guard fase di `SketchbookApp.tsx:117` dan `state-machine.ts:185`.
  - Tombol "Tebak Gambarku" (`DrawingActions.tsx:83-93`, dwell 2000 ms) juga memanggil `onSubmit`, tetapi dijaga oleh guard fase yang sama.
- **Narasi saat menggambar: SESUAI** dengan instruksi 2026-11-09. `momo-cue.ts:28` "Gambar objekmu dulu, ya. Nanti aku coba tebak!". Catatan: `momo-script.ts:31` "drawing-cue" tidak pernah dipakai (ditimpa `momoCue.message`). Itu kode mati.

---

## 4. Prediksi (provider, env, error, `/predict`, submissions)

### 4.1 Mock vs partner: SESUAI (mekanisme), dengan catatan

- Default `mock`. Partner hanya bila `NEXT_PUBLIC_PREDICTION_MODE` persis `partner` (`config/env.ts:38-41`).
- Endpoint: `NEXT_PUBLIC_PREDICTION_ENDPOINT` atau `${NEXT_PUBLIC_API_BASE_URL}/predict` (`env.ts:54-58`). Timeout default 8000 ms (`env.ts:60-63`).
- Mode tidak dikenal atau endpoint kosong: `configErrorProvider`, bukan mock (`prediction-provider.ts:135-144`). Tidak ada fabrikasi.
- Mock: `latencyMs: 500` (`prediction-provider.ts:170-174`).

### 4.2 Pemanggilan `/predict`: SESUAI (format)

- Body `{ drawing: input }` (`partner-http-provider.ts:164-165`). Backend `DrawingPayload { drawing: dict }` (`backend/app/main.py:42-43`), respons `{ candidates: [...] }` (`main.py:60-63`).
- Respons backend `{label, confidence}` dengan `confidence` float 0..1 (`backend/app/inference.py:147-157`). Validator memeriksa 3 kandidat, confidence 0..1, urutan menurun, dan label unik (`validation.ts:34-105`). Angka tidak diubah (`:65`).

### 4.3 Label model vs kosakata level: RUSAK (pemblokir integrasi)

- Backend mengambil label dari `config.py:8-14`: `apple, banana, bicycle, bird, book, car, cat, cloud, dog, fish, flower, house, moon, star, sun, tree, airplane, sailboat, chair, mountain`. Ini label QuickDraw bahasa Inggris (`backend/app/inference.py:17-18, 151`).
- Kosakata level: L1 `["papan","batu","tangga","balok"]` (`levels.ts:61`), L2 `["papan","balok","duri","tangga"]` (`:95`), L3 `["papan","tali","tangga","ember"]` (`:131`), L4 `["papan","balok","tangga","tali","batu","ember"]` (`:171`).
- **Irisannya kosong.** Dengan `providerVocabulary` (`levels.ts:196`), setiap label partner jatuh ke "allow" (`validation.ts:69-70`) lalu menjadi placeholder `unresolved` (`model-contract.ts:22-23`). Dengan `NEXT_PUBLIC_PREDICTION_OOV_POLICY=reject`, setiap prediksi gagal (`validation.ts:83-88`).
- Tidak ada pemetaan label di frontend atau di `contracts/` (grep `apple|quickdraw|label map` nihil).
- Ada **tiga** kosakata berbeda di repo: kosakata level (Indonesia, `levels.ts`), kelas model backend (Inggris, `config.py:8-14`), dan fixture kontrak `contracts/fixtures/submission-request.json` (`"kucing"`, `"anjing"`, `"bebek"`). Fixture kontrak tidak cocok dengan kelas model maupun kosakata level.
- Ini hanya bisa dibuktikan dengan runtime model. Berkas `weights/*.keras` tidak dibuka. Jika `MODEL_PATH` memakai model yang dilatih dengan label Indonesia, sumber ini keliru. **BELUM TERBUKTI** di runtime, tetapi sumber repo menunjukkan ketidaksesuaian.
- **Usul:** keputusan Dias dan Owner: (a) latih ulang dengan label kosakata level, atau (b) tambah tabel pemetaan di backend (kontrak `contracts/openapi.json`), atau (c) tambah pemetaan di adapter klien. Opsi (c) hanya sementara dan harus dicatat.

### 4.4 Error, timeout, retry: SESUAI

- Abort timeout (`partner-http-provider.ts:82-83`), non-2xx → `provider-unavailable` (`:92-98`), JSON rusak → `malformed-response` (`:101-108`), abort → `timeout` (`:130-138`).
- UI: `MomoGuessChat.tsx:38-65` menampilkan `errorDetail`, "Coba lagi" (`retryPrediction`, `state-machine.ts:199-205`), dan "Revisi gambar" (`redrawFromError`, `:208-213`).
- Loading: Momo berkata "Hmm... ini gambar apa, ya?" (`momo-cue.ts:29-30`). Ini cukup sebagai status loading.
- Tidak ada retry otomatis. Hanya tombol.

### 4.5 Label asal prediksi (demo): MOCK (sebagian terlihat)

- Mock menghasilkan label dengan hash geometri goresan (`mock-prediction-provider.ts:31-46, 56-69, 103-104`). Confidence tetap per level: L1 0.86/0.09/0.05, L2 0.42/0.35/0.23, L3 0.55/0.38/0.07, L4 0.5/0.33/0.17 (`:49-54`). Ini fixture DEV, bukan model.
- Provenance `mock` (`:113-114`). Label visual: `MomoGuessChat.tsx:71-73` **di dalam `visually-hidden`**. Tampilan yang terlihat hanya pita "Mode demo: tebakan masih simulasi" (`DevBanner.tsx:11`, `config/demo.ts:5`).
- Kalimat Momo mengutip persen mock tanpa label: "Ini pasti X, 86%" (`momo-cue.ts:34`, `momo-script.ts:119`).
- **Usul:** tampilkan badge terlihat di area Top-3 ("Demo: tebakan simulasi" atau "Model partner"), bukan visually-hidden. Owner minta jangan disamarkan (BIGPROMPT §9).

### 4.6 Submissions/outbox: RUSAK (integritas data penelitian)

- `SubmissionAdapter.handleDecisionApplied` mengirim jika ada `classContext`, tanpa cek mode atau provenance (`api/submission-adapter.ts:51-78`). Dipanggil dari `app/hooks/useLevelSession.ts:117`.
- Gameplay juga (`submission-adapter.ts:83-91`, `useLevelSession.ts:120`).
- Akibat: dalam sesi kelas, kandidat mock (fixture) masuk ke `POST /api/submissions` sebagai data penelitian. Kontrak submission tidak punya kolom provenance (`contracts/openapi.json`, `contracts/fixtures/submission-request.json`).
- **Usul:** di `handleDecisionApplied`, kembalikan `""` bila `snapshot.prediction.provenance?.mode !== "partner"` (provenance sudah ada di `prediction/provenance.ts`). Jangan ubah backend Dias tanpa koordinasi (BIGPROMPT §2).

---

## 5. Hasil gambar → objek dunia (`creation-renderer.ts`, `creations.ts`, `sketch-renderer.ts`)

### 5.1 Perbandingan d4bbaec (Can) vs HEAD

`creation-renderer.ts` identik di 777e181, d4bbaec, dan 8926992 (md5 sama). `sketch-renderer.ts` identik di 777e181 dan d4bbaec.

| Aspek | d4bbaec (= 8926992 = 777e181 untuk berkas ini) | HEAD (`9ba76d2`) |
|---|---|---|
| Kotak berwarna | Ya. `k.rect(item.w, item.h)`, warna per perilaku (solid 170,130,85; danger 195,92,52; lain 140,150,160), outline 2 px. `implementation/src/game/runtime/creation-renderer.ts:14-18, 38-45` | Tidak. `creation-renderer.ts:21-26` hanya `k.pos` dan `z: -1`. |
| Kartu kertas | Ya. `sketch-renderer.ts:144-148`: rect `bgFill` dengan border dan `paper-shadow`, plus garis tekstur. | Tidak. `frame: "none"` (`creations.ts:84-91`; `sketch-renderer.ts` `card` hanya bila `frame !== "none"`, `:155-167`). |
| Goresan siswa | Ada, di atas kotak dan kartu (`creation-renderer.ts:64-77`). | Ada, ink saja (`creation-renderer.ts:47-54`). |
| Label chip | Ada (`:46-61`) | Ada (`:31-45`). Chip oranye dan "!" hanya untuk danger (`:33, :40`). |
| Collider | `rectArea` (`:79`) | `rectArea` (`:56`). Tidak terlihat. |

### 5.2 Verdict

- Versi d4bbaec memiliki **dua lapis kotak**: rect berwarna lalu kartu kertas. Ini persis "dikotakin".
- Versi HEAD menghapus keduanya. Ini sejalan dengan BIGPROMPT §6.5 ("pertahankan bentuk rendering … yang alami, tidak membungkusnya ke kotak generik"). Owner juga secara umum tidak suka kotak: M-006 "tidak dikurung kotak", M-013 "petunjuk misi tanpa kotak". Catatan d4bbaec `implementation/CHANGELOG.md:97` "no boxes".
- **Rekomendasi: PERTAHANKAN HEAD.** Jangan kembalikan `k.rect` atau kartu di `sketch-renderer`.
- Data level 1 tidak berubah (`levels.ts:46-75`, 777e181 = HEAD).

### 5.3 Risiko yang perlu dicek visual (BELUM TERBUKTI)

1. **Perilaku tidak lagi terlihat dari warna.** Solid dan netral sama-sama chip kertas. Hanya danger yang beda (`creation-renderer.ts:33, 40`). Ini kehilangan informasi, bukan bug. Usul: ikon kecil di chip (mis. garis bawah tebal untuk solid), bukan kotak.
2. **Ukuran.** Ink di-fit ke collider 130,6×19,6 (`e2e/lib/level-plans.json` `objectSize`). Dengan `fitInkToBox` (`sketch-renderer.ts:65`) gambar tinggi menjadi sangat kecil. Ini sama di d4bbaec, jadi bukan regresi.
3. **Chip menutupi area atas objek** (`creation-renderer.ts:36`, `y = -h-6`).

---

## 6. Penempatan objek ("placing"), lepas, dan rotasi

### 6.1 Cara memindah sekarang

- **Mouse/sentuh:** `usePlacement.ts:58-73, 92-108`. Pointer down memindahkan langsung. Tidak ada cincin.
- **Tangan:** `useHandControl.ts:100-104`, `if (phase === "placing" && frame.cursor && frame.pinched) movePlacementToHandCursor(frame.cursor)`. Lalu `arbiter.ts:294-314` (`handDragFrame`): pinch langsung memulai drag (`drag-begin`, `:307-312`) tanpa tahap konfirmasi.

### 6.2 Cincin konfirmasi sebelum pindah: HILANG

- BIGPROMPT §6.7: "ring progress confirmation sebelum mode pindah dimulai". Di gameplay tidak ada. `PinchRing` hanya dipakai di `TutorialBrochure.tsx:641`.
- **Usul:** di `arbiter.ts` `handDragFrame`, tambahkan tahap `grab-pending`. Pinch harus ditahan `GRAB_MS` (usul 1000–2000 ms; M-019 menyebut 2 detik untuk jempol) dengan `PinchRing`. Setelah itu `drag-begin`. Gunakan `PinchRing` (`components/ui/PinchRing.tsx`) yang sudah ada.

### 6.3 Lepas = taruh: RUSAK (BIGPROMPT §6.7 "release untuk meletakkan")

- `arbiter.ts:304-305`: bila jari tidak lagi pinch dan drag dimiliki tangan, panggil `endDrag(base, "release")`. Tidak ada commit di jalur ini.
- Penaruhan hanya lewat `PlacementControls.tsx:15-23`, tombol `<button className="nb-btn …">Taruh di sini</button>`, lalu `useStageActions.ts:52-59` → `commitPlacementAt` (`integrated-scene.ts:286-306`).
- Tombol ini bukan `DwellButton`. Dalam mode kamera (NUI penuh) siswa tidak punya cara menekannya tanpa mouse. **Pelanggaran NUI penuh.**
- **Usul:** di `endDrag(…, "release")` panggil commit bila `isLegalPlacement` (`placement-rules.ts:2-4`). Tambahkan juga dwell ke tombol "Taruh di sini" sebagai cadangan.

### 6.4 Rotasi objek: HILANG (tidak ada sama sekali)

- `WorldCreation` (`game/creation-store.ts:4-13`) tidak punya sudut.
- Kolisi AABB: `rectArea` (`creation-renderer.ts:56`), `rectanglesOverlap` (`game/runtime/rules.ts:7`), `isLegalPlacement` (`placement-rules.ts:2-4`).
- Tidak ada `k.rotate` atau `angle` di `game/`, `components/game/`, `input/`, atau `hooks/` (kecuali rig karakter).
- Gesture yang tersedia: `open-palm` (semua jari terbuka, `hand-gesture.ts:230`) dan `split-palm` (redo, `:229, :265`). Landmark: `MIDDLE_MCP = 9` (`:18`).

**Yang diperlukan untuk "lima jari terbuka + gerak memutar":**

1. **Data:** tambah `angle: number` (radian, default 0) di `WorldCreation` (`creation-store.ts:4-13`) dan di `cloneCreation` (`game/runtime/creations.ts:10-20`).
2. **Render:** `creation-renderer.ts:22-26` buat `art` di pusat, anak di `(-w/2, -h/2)`, lalu `k.rotate(angle)`. Chip dan ink ikut berputar.
3. **Fisik (pilih salah satu):**
   - A. Langkah 90° saja. Tukar `w` dan `h`, tetap AABB. Paling aman untuk `level-solvability` dan `placement-rules`.
   - B. Rotasi bebas. Ganti `rectArea` dengan polygon (`k.area({shape: …})`) dan ubah `rules.ts` dan `placement-rules.ts` ke SAT. Solvability perlu dibangun ulang.
   - **Keputusan Owner/R&D.** Usul awal: A, karena tidak mengubah fisik yang sudah "oke".
4. **Sudut gesture:** θ = `atan2(lm[9].y − lm[0].y, lm[9].x − lm[0].x)` (landmark 0 pergelangan, 9 pangkal jari tengah). Δθ = `wrap(θ_t − θ_{t−1})` ke (−π, π]. Akumulasi selama pose `open-palm` (`hand-gesture.ts:230`) dan bukan `split-palm` (`:229`).
5. **Routing berdasarkan state:** di gameplay, `open-palm` = putar (setelah ring). Di tutorial gambar, `split-palm` = redo, jadi tidak bentrok. Gunakan histeresis seperti `hand-stroke-pipeline.ts:21-26` (vote 3 dari 5 frame).
6. **Ring masuk mode putar:** sama dengan §6.2.
7. **Hitbox:** rotasi tidak mengubah collider AABB pada opsi A. Pada opsi B, collider baru harus dibuktikan dengan tes.

**BELUM TERBUKTI.** Tidak ada kode, tes, atau bukti runtime untuk rotasi.

---

## 7. Gagal/ulang (`FailOverlay.tsx`)

- Tiga aksi: "Coba lagi" (`btn-retry-cycle`), "Geser objek" (`btn-reposition`), dan "Gambar ulang" (`btn-redraw-gameplay`). `FailOverlay.tsx:28-53`. Momo menyapa "Belum berhasil, tidak apa-apa." (`:21-23`).
- **Copy: RUSAK.** `FailOverlay.tsx:51` dan `components/decision/DecisionPanel.tsx:117-121` memakai "Gambar ulang". Keputusan **D-20261105-06** (`contexts/can/DECISIONS.md:247`) menyatakan "Gambar ulang" + "Ciptakan objek lagi" digabung menjadi satu tombol "**Gambar lagi**". Konfirmasi juga di `NOW.md:24` dan `project/PRD_REVISI_0.0.16.md:111, 236`. `MomoGuessChat.tsx:53-59` memakai "Revisi gambar" di layar error (copy lain).
- **Gesture:** dwell 1200 ms (`hooks/useDwell.ts:18`). Ini NUI yang dipilih. Tidak ada gesture khusus. Owner meminta "gestur apa gitu" (BIGPROMPT §6.7). **BELUM DIPUTUSKAN.**
- Esc kembali ke gambar (`MomoGuessChat.tsx:30-36`). Fallback keyboard, tidak ditampilkan di awal.

---

## 8. Level 2 dan 3

| Aspek | Level 1 | Level 2 | Level 3 | Catatan |
|---|---|---|---|---|
| Gap | 150 (`levels.ts:18`) | 180 (`:86`) | 220 (`:123`) | Progresi SESUAI |
| Siklus wajib | 1 | 2 (`:78`) | 1 (`:115`) | SESUAI |
| Danger | batu (`:59`) | duri (`:93`) | tali (`:127`) | Lihat catatan M-020 |
| Tone | confident | doubtful | humble | `momo-script.ts:94-96` |
| Fog | 0 | 0.4 | 0.9 | `momo-script.ts:94-96`; render `MomoAvatar.tsx:46`; `data-foggy` `MomoChat.tsx:256` |

- **Progresi "lebih sulit": SESUAI** (gap dan jumlah siklus). **Momo halu: BELUM TERBUKTI.** Yang berubah hanya nada dan kabut (`momo-script.ts:76-104`). Tidak ada narasi "salah yang jujur" di kode. Kalimat untuk nada humble: "Aku nggak bisa lihat jelas… mungkin X, Y%. Terserah kamu ya." (`:125`).
- **Angka confidence di partner: SESUAI.** Angka dari respons (`momo-cue.ts:31-34`; `confidencePercent` `momo-script.ts:106-109`). Tidak direkayasa (`validation.ts:65`).
- **Angka confidence di mock: MOCK.** Konstan per level (`mock-prediction-provider.ts:49-54`). Berlabel demo di chat tersembunyi dan pita. Lihat §4.5.
- **Danger L3 = tali (`levels.ts:127`).** M-020 (`OWNER_MANDATES.md`): "bahaya cukup duri". Level 1 pakai batu, Level 3 pakai tali. **Pertanyaan ke Owner**, bukan temuan pasti.
- **Perubahan Level 2 dari `9ba76d2` (di luar brief L4):**
  - `stage-geometry.ts` `case 2` (`:52-77`): gedung menjadi blok padat, pijakan bawah diperpanjang 58 → 68 (`StageArtwork.tsx:145`), gable padat.
  - `e2e/lib/level-plans.json` L2: `steps` 6 → 5.
  - Owner tidak menyebut Level 2 sebagai "sudah oke". CHANGELOG menyebutnya "Fix: collider Level 2" (`CHANGELOG.md:23`). **Perlu verifikasi dan persetujuan Owner.** Jangan revert tanpa bukti cacat.

---

## 9. Penutup (`CenterOfPage.tsx`, `ending-types.ts`, `SketchbookApp.tsx`)

### 9.1 Pemicu

- `wonFinalRef` diset saat menang Level 4 di HEAD (`SketchbookApp.tsx:211`). Setelah revert, Level 3. Lihat §1.2.

### 9.2 Portal: HILANG

- Tidak ada animasi portal. Grep `portal` di `src/` dan `app/styles/`: hanya `createPortal` di `components/ui/HandCursor.tsx:8` dan `.css:2`.
- BIGPROMPT §6.9: "Tinman masuk portal, dengan animasi meyakinkan bahwa ia sekarang bisa hidup".

### 9.3 Thinman hidup: SESUAI

- Tahap `alive` (`CenterOfPage.tsx:55-57`) dengan kelas `is-alive` dan animasi `center-ink-fill 1.6s` (`app/styles/104-hitl.css:18`).
- Thinman berjalan ke Momo (`:56`), lalu Momo kaget "Eh! Kamu... hidup?" (`:59-65`).
- Durasi: page 2200 ms, alive 5200 ms (`ending-types.ts:35`).

### 9.4 Ringkasan: SESUAI untuk data, dengan catatan

- Setiap kartu (`CenterOfPage.tsx:70-89`) berisi judul Bab, goresan asli siswa (`strokesToPath`, `ending-types.ts:38-50`), label akhir, kategori, keputusan (`DECISION_TEXT`, `:21-25`), dan "Tebakan pertama Momo".
- **Sumber data:** `recapFromFlow` (`app/hooks/useLevelSession.ts:21-33`), disimpan per level di `recordRecap` (`:57-61`), dipanggil dari `SketchbookApp.tsx:69-71`. **Bukan** `creation-store`.
- **Catatan MOCK:** "Tebakan pertama Momo" (`firstGuess`) di mode mock adalah fixture hash, tanpa label demo di kartu.
- **Kategori** tampil sebagai enum mentah (`{r.category}`, `:80`): "padat", "bahaya", "netral". Terbaca, tetapi belum dipoles.
- **Jumlah:** implisit dari jumlah kartu (`<li>`, `:73`). Tidak ada kalimat "jumlah". **Sebagian.**

### 9.5 Performa netral dan "tidak tercatat": HILANG

- Tidak ada metrik performa di penutup. BIGPROMPT §6.9: "ukuran performa interaksi yang netral… Jika tidak ada data valid, tampilkan `tidak tercatat`".
- Data yang tersedia: `redrawCount` (`state-machine.ts:48, 77`), tipe keputusan, dan `sourceRank`.
- **Usul:** tambah ke `LevelRecap` (`ending-types.ts:4-17`) `redrawCount` dan `cycles`. Tampilkan dalam kalimat netral, misalnya "Kamu menggambar ulang 1 kali", atau "tidak tercatat" bila kosong.

### 9.6 Kuis/survei: HILANG

- Tidak ada kode, flag, atau kalimat kuis di `src/`, `app/`, atau komponen.
- BIGPROMPT §6.9: "Kuis/survei diletakkan SETELAH portal dan recap… toggle admin/superadmin". Ini harus ada placement dan gate. Toggle admin ada di scope Dias. Usul: flag konfigurasi di Can (`env`) dan kontrak usulan ke Dias di `contracts/`. Jangan ubah dashboard Dias.
- Titik sisipan: setelah `epilog` dan sebelum `choice` (`CenterOfPage.tsx:91-123`).

### 9.7 Navigasi akhir: SESUAI (dengan catatan)

- "Main lagi" menutup penutup dan kembali ke daftar level. Tidak ada auto-Level 1 (`SketchbookApp.tsx:101-104`). SESUAI §6.9.
- "Selesai" mengeset `finished` (`:103`), yang menampilkan `PageEdgeWalkers` di daftar level (`LevelEntryScreen.tsx:26`). Ini **easter egg tidak diminta**. Catatan untuk Owner.
- Penutup dipicu setiap kali Level terakhir dimenangkan (`:211`). D-20261105-15 minta "Penutup penuh hanya pada kemenangan pertama" (lihat 9.8). **BELUM SESUAI.**

### 9.8 Konflik keputusan penutup

- **D-20261105-15** (`contexts/can/DECISIONS.md:179-185`): status "Belum dikunci (RISET)". Tertulis: "Jangan diimplementasikan sebelum Owner menulis `SETUJUI D-20261105-15`". Arah: Opsi A+B, Thinman berjalan di atas tiga benda, ikon keputusan di atas tiap benda, satu kalimat Momo. "Penutup penuh hanya pada kemenangan pertama".
- **D-20261105-24** (`:126-131`, Aktif): menulis "Mengubah entri lama: D-20261105-15 (arah penutup disetujui)". Ini klaim tanpa `SETUJUI` tertulis.
- Commit `8926992` mengimplementasikan "Pusat Halaman closing".
- Owner (BIGPROMPT §6.9, Lampiran §16) sekarang menyebut "portal", bukan Opsi A+B. Desain di kode (overview teks, tanpa portal) berbeda dari D-15 dan dari brief.
- **Status: BELUM TERBUKTI sebagai keputusan yang disetujui.** Jangan ubah `DECISIONS.md` tanpa persetujuan (AGENTS.md, Single-writer). Minta Owner tulis `SETUJUI D-20261105-15`, atau keputusan baru yang menggantikannya.

---

## 10. Prioritas perbaikan (usulan)

**P0 (harus sebelum demo):**
1. Kembalikan tiga level (§1.2). Ini memperbaiki signpost L3, pemicu penutup, dan daftar level.
2. Gating jempol intro: `rise()` cek `storyDone` (`LevelIntro.tsx:91-92`). Hapus auto-rise `INTRO_LINGER_MS` (`:33, :139-145`) atau minta keputusan Owner.
3. Pemetaan label partner vs kosakata level (§4.3). Keputusan Dias dan Owner.
4. Gating submission ke `partner` (§4.6, `submission-adapter.ts:51-53`).

**P1 (NUI dan UX yang diminta Owner):**
5. Momo tetap pojok kiri atas saat menebak, dan tidak mengecil (§3). `useMomoCompanionLayout.ts:46-54`, `DrawingScreen.tsx:198`.
6. Prompt idle 10 detik (§3). Minta konfirmasi Owner atas konflik 2026-11-09.
7. Placing: ring sebelum pindah (§6.2), lepas = taruh (§6.3), tombol "Taruh di sini" juga bisa dwell.
8. Copy "Gambar lagi" (§7): `FailOverlay.tsx:51`, `DecisionPanel.tsx:117-121`.
9. Label demo terlihat di Top-3 (§4.5): `MomoGuessChat.tsx:71-73`.

**P2 (fitur baru atau desain):**
10. Rotasi (§6.4): pilih opsi A atau B, lalu gesture.
11. Portal, kuis gate, performa netral (§9.2, §9.5, §9.6). Setelah `SETUJUI D-20261105-15`.
12. Komentar dan konstanta ribbon (§1.2 `LevelRibbonBookmark.tsx:41-42`).

**Pertahankan:** render ink tanpa kotak (§5), gate 2 detik selesai-gambar (§3), guard fase (§3), validasi provider (§4.2), FailOverlay dwell (§7), Thinman hidup (§9.3), recap data-driven (§9.4).

## 11. Pertanyaan untuk Owner (tidak bisa diputuskan auditor)

1. Idle 10 detik: sesuai BIGPROMPT (tanya) atau 2026-11-09 (diam)? Keduanya bisa didamaikan. Mohon konfirmasi.
2. `SETUJUI D-20261105-15` atau keputusan baru untuk penutup (portal, Opsi A+B, "hanya kemenangan pertama").
3. Danger L1 batu, L2 duri, L3 tali. Sesuai "bahaya cukup duri" (M-020)?
4. Perubahan geometri Level 2 dari `9ba76d2`: diterima atau tidak?
5. Rotasi: langkah 90° (opsi A) atau rotasi bebas (opsi B)?
6. Pemetaan label model: keputusan Dias (latih ulang atau pemetaan).
7. Keterangan: Easter egg "PageEdgeWalkers" setelah penutup (`LevelEntryScreen.tsx:26`): dipertahankan?

## 12. Yang belum diperiksa

- Visual: tidak ada rekaman atau screenshot baru yang diverifikasi. Semua status "visual" di atas BELUM TERBUKTI.
- Runtime model Dias (`weights/*.keras`): tidak dibuka.
- CSS intro dan posisi `.intro-momo` (`app/styles/*`): tidak dibuka secara rinci.
- Tes tidak dijalankan (aturan read-only).

