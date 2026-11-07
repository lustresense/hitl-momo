# PRD Revisi 0.0.16: Momo, jempol, buku, dan penutup level

Status: **RENCANA. Belum dikerjakan.** Kerjakan hanya setelah Owner menulis `SETUJUI PRD 0.0.16` (boleh per bagian, misalnya `SETUJUI R1-R4`).
Sumber: feedback Owner 2026-11-07 atas video full run (M-019), digabung dengan rencana penutup permainan (`project/OPSI_PENUTUP_PERMAINAN.md`, D-20261105-15, masih RISET).
Keputusan: D-20261105-23. Perubahan teknis nanti dicatat di `implementation/CHANGELOG.md` 0.0.16.

Kode yang diacu (kondisi sekarang): `src/components/camera/GlobalCamera.tsx`, `src/camera/wave-tracker.ts`, `src/input/hand-gesture.ts`, `src/components/momo/{MomoGuide,MomoChat}.tsx`, `src/domain/guide-script.ts`, `src/components/onboarding/{StudentRulerSelector,TutorialBrochure}.tsx`, `src/components/level/{LevelRibbonBookmark,LevelIntro}.tsx`, `src/components/game/*`, `src/game/runtime/constants.ts`, `e2e/*`.

---

## R1. Cover: kamera nyala belum membangunkan Momo; lambaian yang membangunkan

**Sekarang:** `hasStream` langsung membangunkan Momo (`GlobalCamera`, efek `awake = hasStream`). Pelacak lambaian ditunda 3,4 detik dan lambaian berarti "lanjut".

**Mau Owner:**
1. Kamera mati: judul "Jarimu Adalah Kuas Ajaibnya!" (tetap). Momo tidur.
2. Kamera nyala: judul berganti "Lambaikan Tanganmu!", Momo **tetap tidur**. Ada petunjuk lambaian (ikon tangan dada-dada beranimasi dekat Momo).
3. Siswa melambai (dada-dada): Momo bangun kaget, menyapa dengan satu sayap, bicara: "Halo! Aku Momo." lalu "Ayo ikut aku masuk ke dunia Sketchbook!"
4. Setelah kalimat terakhir: **transisi buka buku** langsung ke halaman penggaris (R2). Tidak ada tombol "Pilih nomor absen" di cover.

**Teknis:**
- `awake` berasal dari `onWave` (event `WaveTracker`), bukan `hasStream`. `onWave` tidak lagi langsung `navigateTo`; navigasi terjadi setelah `MomoChat.onDone` + transisi buku.
- Hapus penundaan `waveStartDelayMs` untuk start tracker (Momo masih tidur, jadi jeda load model tidak merusak animasi bangun). Pertahankan prop untuk test.
- Tanpa kamera / kamera gagal / MediaPipe gagal: tombol "Lewati" tetap ada (jalur aksesibilitas dan e2e). Lewati = Momo bangun lalu transisi yang sama.
- Mode dev/e2e: hook keyboard tersembunyi (mis. tombol `W` hanya saat `NEXT_PUBLIC_TEST_HOOKS=1`) untuk mensimulasikan lambaian di kamera palsu.
- Ambang lambaian di `wave-tracker.ts` perlu dicek ulang pada siswa (berapa kali bolak-balik, amplitudo). Belum ada data.

## R2. Transisi buka buku (cover ke penggaris)

**Mau Owner:** buku landscape dibuka dari bawah ke atas, semi 3D, gerak dari kanan bawah ke kiri atas.

**Teknis:**
- Komponen baru `BookFlip` (GSAP + CSS 3D): lapisan "sampul" = snapshot halaman cover, `transform-origin: top`, `rotateX` 0 ke -180 derajat dengan sedikit `rotateZ` dan `skew` sehingga sudut kanan bawah terangkat lebih dulu (kanan bawah ke kiri atas). Bayangan dan gelap di sisi balik.
- Durasi kira-kira 0,9 s, ease `power2.inOut`. `prefers-reduced-motion`: fade 0,2 s.
- Satu komponen dipakai ulang di R6 (buka buku ke dunia) dan R8 (tutup buku saat kembali ke pilih level, arah dibalik: atas ke bawah).
- Kamera PIP tetap satu node (aturan `GlobalCamera`), transisi tidak boleh me-remount video.

## R3. Penggaris: tipografi konsisten, konfirmasi oleh Momo, tanpa tombol

**Mau Owner:**
- Judul dan angka di penggaris kegedean dan tidak konsisten dengan halaman lain.
- Tidak ada tombol "Lanjut ke Tutorial".
- Momo memandu: "Sebelum masuk, pilih dulu nomor absenmu." Saat penggaris **berhenti** di sebuah angka (mis. 20), Momo bertanya: "Bener nomor absenmu 20?" dengan tombol jempol konfirmasi (R4). Kalau digeser lagi, pertanyaan hilang dan muncul lagi saat berhenti.

**Teknis:**
- Skala tipografi bersama di `96-kit-base.css`: token `--nb-h1`, `--nb-h2`, `--nb-body`, `--nb-display` (angka). Audit semua layar (cover, penggaris, tutorial, level, game) supaya memakai token yang sama. Angka penggaris turun dari ukuran display sekarang ke ukuran yang disepakati (usul: maks 96 px desktop, 64 px HP).
- `StudentRulerSelector`: event "settled" saat snap selesai dan tidak ada drag 600 ms. Teruskan `value` ke `guide-script` (`numberConfirm(value)`).
- Nomor sudah dipakai: Momo bingung, tidak ada jempol.
- Konfirmasi jempol = simpan nomor + transisi ke tutorial.

## R4. Jempol sebagai konfirmasi, dengan cincin progres

**Mau Owner:** setiap jempol di UI (konfirmasi ke Momo) punya **cincin progres** di sekeliling lingkaran jempol. Siswa harus mengangkat jempol dan ditahan; cincin terisi; penuh = setuju. Dua kecepatan:
- **Konfirmasi penting** (nomor absen, mulai level, masuk dunia, keputusan): **2 detik**.
- **Percakapan** (lanjut kalimat Momo, "Lanjut" setelah menang): **1 detik**.

**Teknis:**
- Deteksi jempol baru di `src/input/hand-gesture.ts`: `isThumbUp(landmarks)`: ujung ibu jari jauh di atas pangkal jari (y lebih kecil), empat jari lain tertekuk (ujung lebih dekat ke pergelangan daripada PIP), tangan relatif tegak. Cocokkan dengan kerangka MediaPipe HandLandmarker yang sudah dipakai (`hand-landmarker.ts`), tidak menambah model.
- Komponen `ThumbConfirm` (pengganti `gesture-cue`): props `holdMs` (1000 atau 2000), `onConfirm`. Cincin SVG `stroke-dashoffset` digerakkan oleh durasi tahan. Jempol hilang dari kamera = cincin mundur pelan (tidak langsung nol) supaya tidak frustrasi. Penuh = denyut + `onConfirm`.
- Tanpa kamera: klik/tahan mouse atau tombol Enter juga mengisi cincin (tahan sama lamanya), supaya pengujian dan aksesibilitas tetap ada.
- Status deteksi jempol dibagikan lewat satu hook `useHandGesture()` yang membaca `shared-stream`, satu pelacak untuk semua layar (jangan buka kamera kedua).
- Risiko: performa (pelacak tangan jalan terus di semua layar). Jalankan hanya saat ada `ThumbConfirm` di layar.

## R5. Tutorial

- Kartu 1: Thinman harus memakai **animasi jalan** rig asli (`CharacterAnimationAdapter`, `walkT`), bukan dua pose bergantian sambil digeser. Kecepatan langkah mengikuti kecepatan geser.
- Kartu 1 sampai 3 lainnya: dianggap sudah bagus oleh Owner, tidak diubah selain tombol "Lanjut" diganti `ThumbConfirm` 1 detik dan "Mulai Level 1" diganti `ThumbConfirm` 2 detik.

## R6. Pilih level: jempol, pita mental ke atas, buku terbuka ke dunia

**Mau Owner:** setelah jempol (2 detik) di pita bab, pita (penanda halaman) **mental ke atas**, lalu buku terbuka ke atas (seperti transisi cover, R2) masuk ke dunia level. Bukan dunia jatuh dari atas ke bawah seperti sekarang.

**Teknis:**
- `LevelRibbonBookmark`: tarik pita tetap bisa dengan mouse; dengan tangan = jempol pada pita yang terpilih. Setelah konfirmasi: animasi pita memantul ke atas (GSAP `y` negatif + `back.out`), lalu `BookFlip` membuka.
- `LevelIntro` mulai setelah buku terbuka; hapus animasi halaman jatuh (`yPercent -100` ke 0).
- Bab baru terbuka setelah menang: tampil terbuka dengan animasi kecil saja (tanpa langsung pindah ke mana pun).

## R7. Video bukti harus memperlihatkan semua animasi

Video full run sebelumnya melewati cerita intro (tombol lewati) dan halaman gambar terlalu cepat. Owner menegaskan **animasi Momo terbang naik ke kanvas di langit wajib terlihat**, juga mode gambar.
- e2e perekaman baru `e2e/record-full-showcase.mjs`: tidak menekan lewati intro; menunggu kamera naik sampai kanvas; menggambar pelan dengan gerakan yang terlihat; menunggu tebakan; jeda wajar di tiap layar. Output satu MP4 dari cover sampai L3 dan penutup.

## R8. Gameplay dan HUD

1. **Kecepatan Thinman** terlalu kencang: `WALK_SPEED` di `src/game/runtime/constants.ts` = 200 px/s. Usul 140 px/s (-30 %). Periksa ulang `level-plans.json` dan uji e2e L1-L3 karena jarak lompat dan waktu bisa berubah; kalau lompatan ikut tidak terjangkau, kecepatan horizontal saat melompat disesuaikan, bukan lebar celah.
2. **Panel tebakan (Top-3) dikecilkan**, kira-kira 80 % dari sekarang (lebar, font, padding), tetap bisa dibaca. `85-top3-popup.css`.
3. **Elemen selain Momo, Thinman, dan objek game dikecilkan** (tidak penting): label "Dunia Thinman" kiri atas, chip label objek, chip status input, label demo. **"Gambar lagi" tetap sebesar sekarang** (pemicu penting).
4. Momo yang mengikuti objek ("Geser objekmu ke tempat yang pas") dan ukuran Momo: sudah oke, tidak diubah.
5. Notifikasi menang Momo: sudah oke. Jempol "Lanjut" di situ = `ThumbConfirm` 1 detik.
6. **Kembali ke pilih level setelah menang: buku menutup (atas ke bawah)**, lalu daftar bab tampil; memilih bab lain membuka buku lagi (R6).

## R9. Penutup permainan setelah Level 3 (digabung dari OPSI_PENUTUP_PERMAINAN.md)

Tetap status **RISET** sampai Owner `SETUJUI D-20261105-15`. Bentuk yang disarankan (A + B):
- Setelah L3, buku membuka halaman penutup: Thinman berjalan **sendiri** di atas tiga objek gambaran siswa (goresan asli dari tiap level, label akhir pilihan siswa, kategori Solid/Danger).
- Di atas tiap objek: ikon keputusan siswa (Terima / Pilih lain / Bukan semua) dan tebakan pertama Momo.
- Momo menutup dengan satu kalimat; jempol 2 detik untuk "Selesai" atau "Main lagi".
- Data sudah ada di alur (label akhir, perilaku, keputusan). Perlu simpan goresan per level di sesi.
- Opsi C (sandbox) ditunda; risiko gambar tidak pantas ada di dokumen opsi.

---

## Urutan kerja yang diusulkan

| Tahap | Isi | Risiko |
|---|---|---|
| 1 | R3 tipografi + R8.2/R8.3 ukuran HUD + R8.1 kecepatan | rendah; ubah e2e plan jika lompatan bergeser |
| 2 | R4 `ThumbConfirm` (mouse dulu, lalu deteksi jempol) | sedang; akurasi deteksi jempol di kamera nyata |
| 3 | R1 lambaian membangunkan Momo + R2 `BookFlip` | sedang; ambang lambaian |
| 4 | R6 pita + buku membuka, R8.6 buku menutup, R5 animasi jalan tutorial | rendah |
| 5 | R7 video showcase penuh | rendah |
| 6 | R9 penutup (hanya jika disetujui) | butuh keputusan dosen |

## Kriteria selesai

- Semua jempol punya cincin progres; 2 detik untuk konfirmasi, 1 detik untuk percakapan; bisa juga dengan mouse/Enter.
- Cover: kamera nyala tidak membangunkan Momo; lambaian membangunkan; transisi buka buku ke penggaris tanpa tombol.
- Penggaris: tanpa tombol; Momo menyebut angka yang dipilih dan menunggu jempol.
- Pita mental ke atas lalu buku terbuka; kembali = buku menutup.
- Thinman 30 % lebih pelan; L1-L3 tetap bisa dimenangkan (e2e).
- HUD sekunder lebih kecil; "Gambar lagi" tetap.
- Video showcase memperlihatkan intro lengkap, Momo terbang ke kanvas di langit, menggambar, tebakan, dunia, menang, kembali.
- Unit test, tsc, lint, build, e2e journey/recovery/hand-control/mediapipe lulus.

## Pertanyaan terbuka untuk Owner

1. Jempol 2 detik juga untuk keputusan HITL (Terima/Pilih lain/Bukan semua), atau keputusan tetap klik?
2. Tanpa kamera (sekolah tanpa webcam): cukup tahan klik, atau tombol biasa?
3. Kecepatan Thinman 140 px/s cukup, atau mau dicoba beberapa nilai di video dulu?
