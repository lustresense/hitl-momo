# REVISI DESAIN & NUI SKETCHBOOK UNIVERSE (10 November 2026)

Dokumen catatan audit visual langsung dari screenshot runtime pengguna (`dev.momominum.tech`).

---

## 1. Kamera Mini (Global Camera PIP)
- **Masalah:** Saat ini mini camera berada di pojok kiri atas dan terpotong/mepet layar (`top: 24px, left: 24px`).
- **Instruksi Owner:** Kamera **BUKAN di atas kiri**, melainkan harus di **kiri bawah (bottom-left)** secara konsisten di semua halaman.
- **Perbaikan CSS/Layout:**
  - Kembalikan anchoring floating mini PIP di `60-global-camera.css` ke `bottom: 24px !important; left: 24px !important; top: auto !important;`.
  - Pastikan padding dan viewport margin tidak membuat kotak video terpotong atau off-screen.

---

## 2. Animasi Kartu Tutorial (Onboarding)
- **Masalah:** Animasi kartu (deal, fan-out, flip, unfold) masih terlalu cepat/ngebut.
- **Perbaikan:**
  - Kalibrasi GSAP timeline di `TutorialBrochure.tsx`: perlambat durasi flip, unfold, dan transisi antar-kartu agar terasa seperti membalik halaman buku kertas fisik yang nyata.
  - Periksa apakah flag atau media query `prefers-reduced-motion` aktif secara tidak sengaja yang memicu `timeScale(6)`.

---

## 3. Konten & Petunjuk Gestur Kartu 1
- **Masalah:** Teks di kotak gestur masih menyebut *"Cubit tanganmu, lalu tahan sampai cincin penuh."* padahal mekanik sudah diubah menjadi drag Thinman manual ke bendera.
- **Perbaikan:**
  - Ganti hint gestur kartu 1 menjadi: *"Cubit dan geser Thinman ke kanan sampai menyentuh bendera."*
  - Pastikan ring jempol konfirmasi baru muncul setelah Thinman menyentuh bendera DAN waktu membaca 10 detik terpenuhi.

---

## 4. Log Masukan Screenshot & Temuan Runtime

### Screenshot 1: Onboarding Card 1 (`img_5fdc5eebc905.jpg`)
- **Visual & NUI Defect:**
  1. **Tombol Lanjut Bentuk Web Button Kaku:** Masih berupa tombol kotak panjang bertuliskan `Lanjut 🔒`. Inkonsisten dengan filosofi NUI. Balon Momo di kanan bawah sudah menginstruksikan *"Angkat jempolmu buat lanjut"*, tetapi tombol di kartu masih tombol klik web biasa.
  2. **Bentuk Target NUI:** Ganti tombol kotak menjadi **UI Circular Ring Thumb** (ikon jempol dalam lingkaran ber-ring progress). Saat belum eligible (Thinman belum tiba / gate 10 detik belum tuntas), ring thumb ditampilkan dalam state abu-abu / terkunci (locked badge). Saat eligible dan gestur jempol terdeteksi, ring progress terisi melingkar sampai penuh untuk memicu navigasi ke kartu berikutnya.
  3. **Parameter Lanjut Tidak Transparan:** Pengguna tidak tahu kenapa lanjut masih terkunci padahal Thinman sudah sampai. Perlu indikator visual reading-gate/progress yang jelas sebelum ring jempol aktif.
  4. **Copy Hint Gestur Usang:** Teks masih *"Cubit tanganmu, lalu tahan sampai cincin penuh."* — ganti menjadi *"Cubit dan geser Thinman ke kanan sampai menyentuh bendera."*
  5. **Posisi Kamera PIP Masih Kiri Atas:** Terkonfirmasi secara visual floating box kamera ada di `top: 24px, left: 24px`. Wajib dipindah ke pojok kiri bawah (`bottom: 24px, left: 24px`).

---

## 5. Model NUI Kombo & Mitigasi Coldstart Latency
- **Masalah:**
  1. **Model Gestur Kombo Belum Ter-set:** Pipeline deteksi gestur kombo (misal kombinasi pinch + swipe, hold, multi-finger transitions) belum terkonfigurasi secara terstruktur dan terpadu di input runtime.
  2. **Coldstart & Latensi Awal Terasa Berat (Lag):** Pengguna merasakan lag/stutter saat inisialisasi MediaPipe HandLandmarker / Tasks-Vision WASM di browser. Beban kompilasi GPU shader dan download model asset terjadi saat user sudah mulai berinteraksi.
- **Rencana Perbaikan:**
  - **Preload & Background Warmup:** Inisialisasi awal HandLandmarker dipicu sedini mungkin (saat halaman cover / idle) dengan dummy inference (warmup frame) agar shader WebGL terkompilasi sebelum pengguna masuk ke sesi interaksi kritis.
  - **Arsitektur Model Kombo:** Daftarkan state machine gestur kombo secara eksplisit (pinch-drag, fist-hold, thumb-ack, palm-idle) dengan debounce dan buffer transisi yang stabil.
  - **Graceful Fallback:** Pastikan logging delegate (GPU vs CPU) transparan dan status kesiapan model tercermin ke UI tanpa blocking frame rate.

---

## 6. Revisi Koreografi Cover & Waving Hand NUI
- **Temuan Runtime & Masukan Owner:**
  1. **Deteksi Lambaian Sulit & Motion Blur:**
     - Gerakan tangan sering mengalami motion blur pada webcam biasa sehingga deteksi landmark terputus dan lambaian harus dilakukan terlalu lama.
     - Ambang batas frekuensi/stroke wave di `wave-tracker.ts` perlu diselaraskan agar lebih responsif terhadap lambaian wajar tanpa harus heboh.
  2. **Ring Progress Waving Hand (NUI Feedback):**
     - Siswa tidak tahu harus melambai seberapa banyak atau kapan lambaian selesai.
     - Tambahkan visual circular progress ring (indikator progres lambaian terisi melingkar) di overlay kamera/layar saat gestur lambaian terdeteksi hingga mencapai 100%.
  3. **Koreografi Transisi Cover (Kamera PIP + Momo Terbang):**
     - Saat kamera aktif dan lambaian selesai, kamera cover melakukan morphing mengecil lalu meluncur ke pojok kiri bawah (`bottom: 24px, left: 24px`).
     - Momo terbangun, terbang dari sudut menuju ke tengah layar.
     - Teks awal cover memudar hilang, panggung sepenuhnya diserahkan ke dialog interaktif Momo.
  4. **Animasi Buka Buku (BookFlip Open) ke Atas:**
     - Animasi 3D buku terbuka (`BookFlip.tsx` flip ke atas) harus ter-render penuh saat transisi meninggalkan cover sebelum masuk ke onboarding tutorial kartu.

---

## 7. Animasi Tidur & Idle Momo di Cover
- **Temuan Visual (`img_b2f118627a95.jpg`):**
  1. **Momo Tidur Terlalu Statis:** Avatar Momo tidur tidak bergerak sama sekali (seperti gambar mati tanpa nyawa). Perlu ditambahkan animasi subtle pernapasan/mengapung idle (`momo-sleep-breathe`: naik-turun halus ~6-8px dan tilt rotasi ~2 derajat lembut berulang).
  2. **Animasi ZZZ Stuck/Mati:** Huruf `z` hanya muncul satu huruf kecil dan macet tidak beranimasi melayang.
     - **Investigasi:** CSS memiliki aturan reduced motion yang menonaktifkan animasi; belum terbukti apakah aturan itu aktif pada perangkat Owner atau penyebab gejala. Screenshot tunggal tidak membuktikan gerakan.
     - **Target:** animasi `z` melayang bertingkat pada mode normal; hormati preferensi reduced motion dengan alternatif yang sesuai, bukan mengabaikannya.

---

## 8. Revisi Pemilihan Nomor Absen (`/onboarding/number`)
- **Temuan Visual & Masukan Owner (`img_eeb8441681c2.jpg`):**
  1. **Nilai Default Harus Nomor 1:**
     - Saat ini penggaris default di angka 18/20.
     - Penggaris harus selalu start di nomor `1` untuk siswa baru yang baru pertama kali masuk.
  2. **Konfirmasi Jempol Muncul Terlalu Dini (Premature Prompt):**
     - Saat halaman baru dibuka (600ms), Momo langsung bertanya *"Bener nomor absenmu 18?"* beserta ring jempol sebelum siswa menyentuh apa pun.
     - Perbaikan: Syaratkan interaksi nyata terlebih dahulu (`hasInteracted`). Sebelum penggaris digeser, Momo tetap menampilkan panduan umum (`NUMBER_STEP`) tanpa tombol jempol. Baru setelah penggaris digeser ke suatu nomor dan berhenti (settle), Momo menanyakan konfirmasi nomor tersebut.
  3. **Visual Affordance Kotak / Handle Penggaris (Grip Slider):**
     - Penunjuk tengah saat ini hanya berupa garis jarum 6px polos (`student-ruler-needle`) yang tidak memberikan kesan bisa digeser.
     - Tambahkan elemen kotak handle di tengah indikator (`student-ruler-handle`): jendela/slider tactile papercraft berukuran ~48x70px dengan garis grip/tekstur pegangan, sehingga siswa secara intuitif langsung paham bahwa penggaris tersebut dapat digeser.
  4. **Interaksi NUI Pinch untuk Menggeser Penggaris:**
     - Penggaris saat ini hanya menerima pointer/mouse drag biasa, belum terhubung ke MediaPipe hand tracking.
     - Integrasikan `useHandGesture`: saat siswa mencubit tangan (`gesture.pinch`) di depan kamera, gerakan tangan horizontal (`cursor.x`) langsung menggeser posisi penggaris secara real-time, dan saat cubitan dilepas penggaris melakukan auto-snap ke nomor terdekat.

---

## 9. Cacat NUI Pinch Drag Thinman di Tutorial Kartu 1
- **Temuan Runtime & Masukan Owner (`img_b277fd1fe7f5.jpg`):**
  1. **Kemajuan yang Terbukti Berhasil:**
     - Posisi kamera PIP di pojok kiri bawah terkonfirmasi aktif (`bottom: 24px, left: 24px`).
     - Tombol kotak kaku berhasil diganti circular ring `ThumbConfirm` NUI.
     - Saat Thinman digeser sampai bendera via mouse, ring jempol langsung aktif (`walked === true`), Momo berganti dialog, dan kartu bisa lanjut.
  2. **Masalah Akar:**
     - Saat kamera ON, gestur cubit (pinch) tangan sama sekali tidak menggerakkan Thinman.
     - **Penyebab Teknis di `WalkPlayground` (`TutorialBrochure.tsx`):** Komponen `WalkPlayground` hanya mengikat event handler DOM `onPointerMove` dan `onPointerDown`. Komponen sama sekali tidak memiliki listener / hook ke MediaPipe hand tracking (`useHandGesture`). Dulu kartu 1 hanya mengandalkan auto-walk timer saat pinch ring penuh; begitu auto-walk dicabut, Thinman kehilangan bridge NUI ke webcam.
  3. **Solusi Perbaikan:**
     - Pasang hook `useHandGesture(mode === "camera")` di dalam `WalkPlayground`.
     - Saat `gesture.pinch === true`, catat anchor titik awal `gesture.cursor.x` dan posisi Thinman.
     - Setiap perubahan `gesture.cursor.x` saat pinch berlangsung langsung memanggil `place(next)` secara proporsional menggeser Thinman ke kanan.
     - Begitu mencapai bendera (`next >= WALK_END`), panggil `onComplete()` agar ring jempol otomatis terbuka.

---

## 10. Skala Brosur Tutorial & NUI Kanvas Kartu 3
- **Temuan Visual & Masukan Owner/Prof TB (`img_19c98676da0f.jpg`):**
  1. **Ukuran Brosur Terlalu Kecil (Whitespace Berlebih):**
     - Sesuai arahan bimbingan Prof TB, kotak buku/brosur di tengah panggung terlalu kecil dan menyisakan ruang kosong beige yang terlampau lebar di sekelilingnya.
     - Perbesar nilai kalkulasi di `computeLayout()`:
       - `gw` dinaikkan ke batas 320–480px.
       - `pw` dinaikkan ke rasio lebar ~1.6x `gw`.
       - `oh` (tinggi buku) dinaikkan hingga 480–720px (`vh * 0.76`).
       - Pertahankan margin bawah aman (~22% vh) agar buku tidak menyenggol kamera PIP di kiri bawah maupun Momo di kanan bawah.
  2. **Animasi Menaruh Kartu ke Bawah Terlalu Ngebut:**
     - Transisi dari kartu 1 ke kartu 2 saat ini terlalu cepat melipat dan membanting kartu ke bawah.
     - Perlambat durasi `closeTimeline` menjadi ~1.0s dengan easing `power2.out`, dan beri delay pembukaan kartu berikutnya (`~1.0–1.2s`) agar pergerakan terasa anggun dan memanjakan mata pengguna layaknya menutup buku fisik.
  3. **NUI Gesture Drawing di Kartu 3 Belum Berfungsi:**
     - Komponen `DrawPlayground` di `TutorialBrochure.tsx` hanya memiliki listener `onPointerDown`/`onPointerMove` DOM mouse.
     - Hubungkan `useHandGesture` dan koordinat cursor tangan ke kanvas latihan agar gestur cubit (Coret), kepalan (Hapus), peace (Mundur), dan telapak (Maju) langsung menggerakkan kuas dan mencentang checklist 4 alat.

---

## 11. Seleksi Level via Gestur Jari di `/levels`
- **Temuan Visual & Masukan Owner (`img_0953bbdfb4ff.jpg`):**
  1. **Ganti Ikon Panah Bawah (`arrow-down`) dengan Ikon Gestur Jari:**
     - Pada lingkaran bawah tiap pita bookmark (`.bm-ring`), ganti ikon panah ke bawah menjadi ikon jari spesifik:
       - **Bab 1:** Ikon 1 jari telunjuk mengarah ke atas (`finger-1` / `point-up`).
       - **Bab 2:** Ikon 2 jari / gestur peace (`finger-2` / `peace`).
       - **Bab 3:** Ikon 3 jari terangkat (`finger-3` / `three-fingers`).
     - Ini memberikan affordance NUI yang jelas bagi siswa tanpa harus membaca teks rumit.
  2. **Pengenalan Gestur Pemilihan Level:**
     - Hubungkan pengenal gestur jumlah jari (finger count / pose recognition):
       - Tunjukkan 1 jari -> otomatis memilih Bab 1.
       - Tunjukkan 2 jari (peace) -> otomatis memilih Bab 2.
       - Tunjukkan 3 jari -> otomatis memilih Bab 3.
  3. **Penyelarasan Copy Momo:**
     - Ubah dialog Momo di `/levels` agar menjelaskan gestur: *"Tunjukkan 1, 2, atau 3 jarimu ke kamera buat memilih bab yang mau kamu mainkan!"* (atau tarik pitanya pada mode mouse).

---

## 12. Koreografi Intro Level & Penjelasan Momo di Dunia Gameplay (`LevelIntro.tsx`)
- **Temuan Visual & Masukan Owner (`img_c7e961e75368.jpg`):**
  1. **Delay 10 Detik Sebelum Momo Bicara:**
     - Momo tidak langsung menjelaskan objektif saat masuk level dan sempat hening terlalu lama.
     - Hilangkan delay idle; Momo langsung menyambut dan bercerita begitu transisi buka level selesai.
  2. **Spotlight / Dark Backdrop Panggung Saat Penjelasan:**
     - Latar gameplay saat ini terlalu terang sehingga fokus anak terdistraksi dari penceritaan maskot.
     - Pasang semi-transparent dark backdrop overlay (`rgba(0, 0, 0, 0.55)`) pada panggung dunia saat fase penjelasan cerita. Hanya Momo, balon dialog, dan area objek yang sedang dijelaskan yang tetap menonjol dan terang.
  3. **Ukuran Momo Lebih Besar & Maju ke Depan (Depth/Scale):**
     - Ukuran Momo saat ini terlalu kecil (`avatarHeight=170px`) dan tampak datar di latar belakang.
     - Perbesar avatar Momo menjadi ~280–300px dengan efek kedalaman "maju mendekat ke layar siswa" saat mode bercerita agar terasa interaktif dan akrab.
  4. **Koreografi Gerak Dinamis Momo (Kiri ke Kanan):**
     - Momo saat ini diam di satu posisi statis tebing kiri.
     - Buat pergerakan dinamis GSAP:
       - Saat mengenalkan Thinman di kalimat pertama, Momo melayang di dekat Thinman di tebing kiri.
       - Saat menjelaskan rintangan dan tujuan menyeberang, Momo meluncur melayang ke arah kanan menunjuk jurang dan plang tujuan di tebing kanan.
  5. **Pilihan Objek Gambar (`Balok, Papan, Batu, Tangga`) Dipindah ke Layar Kanvas:**
     - Opsi kartu gambar (`intro-cards`) saat ini menempel di balon dialog dunia gameplay dan menutupi pandangan serta membebani kognisi sebelum menggambar.
     - Pindahkan katalog pilihan referensi objek yang bisa digambar ke dalam **layar kanvas gambar** (saat kamera terbang ke langit / DrawingScreen), bukan di panggung gameplay dunia. Di gameplay, Momo murni bercerita dan mengajak terbang ke langit.

---

## 13. Alur Koreografi Kanvas, Animasi Naik ke Awan & NUI Intent Gating
- **Temuan Visual & Masukan Owner (`img_073a3a95e2a1.jpg` & `img_0dfa2cc7d16a.jpg`):**
  1. **Animasi Naik ke Awan (LevelIntro -> DrawingScreen):**
     - Jangan gunakan dissolve/fade instan.
     - Jalankan animasi kamera panning vertikal meluncur ke langit melewati pita awan (`CloudBand`).
     - Momo terbang ke atas mengiringi kamera, lalu mendarat/melayang anggun di langit saat kamera berhenti dengan mantap (*plek*) di atas kanvas.
  2. **Fase Edukasi Kanvas (Backdrop Gelap & Flashback Alat):**
     - Saat tiba di kanvas langit, aktifkan mode fokus gelap (`img_073a3a95e2a1.jpg`).
     - Momo menjelaskan singkat ulasan (flashback) 4 alat di toolbar kanan (Coret = cubit, Hapus = kepal, Mundur = 2 jari, Maju = telapak).
     - Tampilkan pilihan rekomendasi benda yang relevan (Balok, Papan, Tangga).
     - Tombol/ring konfirmasi jempol `(ikon jempol) Mulai Menggambar` menutup backdrop gelap dan mengaktifkan kanvas.
  3. **Timing Kemunculan Panel AI Top-3 Prediksi:**
     - Saat siswa sedang aktif menggambar di kanvas, panel Top-3 **DILARANG MUNCUL** agar tidak menutupi kanvas atau memecah konsentrasi. Momo hanya memberi celetukan/reaksi ringan.
     - Panel UI Top-3 (`img_0dfa2cc7d16a.jpg`) **HANYA MUNCUL** setelah siswa selesai menggambar dan menekan/memicu `Tebak Gambarku`.
  4. **NUI Intent Gating (Cegah Coretan Nyasar dari Gestur Jempol):**
     - **Bug Saat Ini:** Siswa yang mengacungkan jempol (thumb-up) membuat kanvas ikut tercoret secara tidak sengaja.
     - **Perbaikan Kritis:** Kuas kanvas (`beginStroke`/`moveStroke`) HANYA diizinkan menorehkan tinta jika pose tangan adalah `PINCH` valid. Jika pose adalah `THUMB_UP`, `OPEN_PALM`, atau `POINT`, kuas menggambar wajib di-gate/diblokir total sehingga jempol tidak meninggalkan coretan kotor di kanvas.

---

## 14. Pengingat Selesai Menggambar: Idle 10 Detik
- Masukan Owner, screenshot `img_6b908b732c5f.jpg`: indikator jempol selesai di pojok kanan bawah jangan mengganggu saat menggambar atau menghapus.
- Saat pengguna aktif memakai kuas/pinch atau menghapus, indikator tetap tampak sangat pudar. Hitung ulang idle setiap aktivitas tersebut.
- Setelah 10 detik tanpa aktivitas kuas/pinch atau menghapus, indikator menjadi jelas dan menonjol sejenak dengan animasi playful “tuwing” selama 3 detik sebagai pengingat, bukan konfirmasi otomatis.
- Jika pengguna kembali beraktivitas, indikator memudar lagi dan penghitungan 10 detik dimulai ulang. Hormati prefers-reduced-motion.
- Verifikasi timing, reset saat menggambar maupun menghapus, dan gestur jempol tidak menyebabkan coretan.

## 15. Gestur Panel Top 3
- Tidak ada cursor: jangan mewajibkan user mengarahkan tangan ke kontrol.
- 1, 2, atau 3 jari memilih kandidat sesuai urutan; tahan hingga ring progres penuh untuk konfirmasi.
- Override / “Bukan ini”: gestur lima jari terbuka (high-five), tahan hingga ring penuh. Rancangan pemilihan setelah override perlu diselaraskan tanpa cursor.
- Gambar ulang: pinch dan tahan hingga ring penuh, tanpa cursor.
- Saat panel Top 3 aktif, nonaktifkan gestur tools kanvas. Uji pemisahan mode, transisi pose, dan cegah aktivasi tak sengaja.

## 16. Inventaris Screenshot dan Caption Owner: Audit Cakupan Penuh
- `img_5fdc5eebc905.jpg`: Kartu 1, kamera kiri bawah, CTA ring jempol terkunci dan terbuka setelah praktik, copy drag. Lihat §1–4.
- `img_b2f118627a95.jpg`: Momo tidur tampak statis, ZZZ macet; idle dan ZZZ hidup. Lihat §7.
- `img_eeb8441681c2.jpg`: Penggaris mulai nomor 1 saat pertama masuk; konfirmasi hanya setelah digeser; kotak pegangan intuitif dan pinch drag. Lihat §8.
- `img_b277fd1fe7f5.jpg`: Owner sudah mencoba pinch saat kamera hidup, Thinman gagal bergerak; mouse berhasil ke bendera dan jempol bisa lanjut. Kamera sengaja dimatikan saat screenshot demi privasi, bukan bukti tes dilakukan dengan kamera mati. Lihat §9.
- `img_19c98676da0f.jpg`: NUI kartu 3 gagal dicoba; perbesar brosur mendekati area merah tanpa menyenggol kamera/Momo, jaga whitespace; transisi menaruh kartu 1 ke bawah terlalu cepat, animasi awal sudah oke. Usulan pemisahan endpoint/interaksi perlu dievaluasi, bukan diasumsikan perlu. Lihat §10.
- `img_0953bbdfb4ff.jpg`: Ikon panah bookmark diganti gestur 1/2/3 jari untuk bab 1/2/3; status locked/unlocked tetap jelas, jangan melewati kunci. Lihat §11.
- `img_c7e961e75368.jpg`: Owner mengalami hening sekitar 10 detik saat masuk level; fokus gelapkan sekitar, terangkan Momo, dialog dan objek yang dijelaskan; Momo lebih besar dan bergerak dari Thinman ke target; opsi objek di kanvas, bukan gameplay. Lihat §12.
- `img_073a3a95e2a1.jpg` dan `img_0dfa2cc7d16a.jpg`: Animasi Momo dan kamera naik melewati awan, berhenti di kanvas tanpa dissolve mendadak; fokus gelap, review singkat alat kanan, lalu opsi gambar; Momo boleh menebak saat menggambar tanpa UI Top 3, tampilkan setelah selesai. Jempol jangan mencoret. Lihat §13.
- `img_480a954278b4.jpg`: Top 3 visual sudah benar; pilih kandidat pakai 1/2/3 jari, override high-five, gambar ulang pinch, semua dengan ring progres; tanpa cursor. Mode panel memisahkan gestur dari tools. Lihat §15.
- `img_6b908b732c5f.jpg`: Jempol selesai pudar ketika aktif; setelah 10 detik idle menyala dan menonjol 3 detik, kembali pudar bila lanjut; ulangi timer. Lihat §14.
- `img_744b2e7a7ce9.jpg`: Layar kanvas Level 1 masih menampilkan URL `/level1`. Mandat rute mandiri `/canvas1`. Lihat §17.
- **Rangkaian Screenshot 5 Gambar Terverifikasi (10 November 2026):**
  - **Gambar 1 (`img_f370e933360e.jpg` / `img_3d1fd9f9837a.jpg`):** Layar Kanvas Gambar & Pemicu Tebakan. Menampilkan kanvas gambar, balon Momo *"Kalau sudah, coba acungkan jempol, ya!"*, tombol oranye `[✨ Tebak Gambarku]`, tombol circular jempol di kanan bawah `Tahan jempol kalau sudah selesai`, hingga stiker objek hasil tebakan muncul menempel di kanvas menjadi tombol oranye **"Lempar"** + **"Gambar lagi"**. Lihat §18.
  - **Gambar 2 (`img_24c68d9356ee.jpg`):** Transisi Pelemparan Stiker. Stiker meluncur dan melayang dari kanvas turun menuju panggung dunia gameplay. Tombol oranye bertuliskan **"Lempar"** dan tombol **"Gambar lagi"** di kiri bawah. Lihat §18.
  - **Gambar 3 (`img_700e7140f979.jpg`):** Layar Penempatan di Dunia Gameplay. Stiker mendarat di posisi target di panggung dunia. Tombol oranye berubah menjadi **"Taruh di sini"** + tombol **"Gambar lagi"**. Lihat §18.
  - **Gambar 4 (`img_bcfa09fd1a3c.jpg`):** Tampilan Gameplay Utuh. Panggung gameplay tebing, rintangan, Thinman, floating mini camera di kiri bawah, dan bottom bar kontrol di bagian bawah. Lihat §18.
  - **Gambar 5 (`img_ca09c4b06352.jpg`):** Crop Bar Kontrol Bawah Gameplay. Menampilkan kontrol keyboard/mouse: `[A] Kiri`, `[D] Kanan`, `[Spasi] Lompat`, `[Klik Kiri + Geser] Geser Objek`. Wajib berganti menjadi kontrol gestur NUI saat mode kamera aktif. Lihat §18.
  - **Screenshot Tambahan (`img_59ba91d8b598.jpg`):** Layar Recovery Kegagalan *"Jatuh ke jurang!"*. 3 tombol aksi horizontal: `Coba lagi` (1 jari), `Geser objek` (2 jari), `Gambar lagi` (3 jari). Lihat §20.

---

## 17. Route kanvas terpisah per level
- Screenshot `img_744b2e7a7ce9.jpg`: Layar kanvas Level 1 masih menampilkan URL `/level1`. Instruksi Owner: kanvas harus punya route baru tersendiri, bukan ikut route level; Level 1 memakai **`/canvas1`**.
- Terapkan pola terpisah untuk tiga level (`/canvas1`, `/canvas2`, `/canvas3`); pertahankan konteks level dan alur transisi animasi dunia–awan–kanvas. Uji navigasi, refresh dan kembali tanpa kehilangan state penting; jangan menambah Level 4.
- Ini kebutuhan route halaman, bukan keputusan mengganti endpoint API atau implementasi yang sudah selesai.

---

## 18. Siklus Stiker, Lempar, Penempatan dan Kontrol Gameplay Kamera (Gambar 1–5)

### A. Alur Kanvas & Stiker (Gambar 1, 2, 3 Saling Berhubungan)
1. **Gambar 1 (`img_f370e933360e.jpg` / `img_3d1fd9f9837a.jpg`): Layar Kanvas Gambar, Pemicu Tebakan, dan Transisi ke Stiker:**
   - **Kondisi Awal (Pra-Tebak):** Siswa telah selesai menggambar sketsa pada kanvas kertas.
     - Balon dialog Momo di kiri atas: *"Kalau sudah, coba acungkan jempol, ya!"*.
     - Tombol oranye lonjong di tengah bawah: `[✨ Tebak Gambarku]`.
     - Tombol circular thumb di pojok kanan bawah: `Tahan jempol kalau sudah selesai`.
     - **Interaksi NUI Pemicu:** Siswa mengacungkan jempol (*Thumb-Up*) di depan kamera hingga circular ring confirmation terisi penuh untuk memicu tombol oranye `[✨ Tebak Gambarku]`.
   - **Kondisi Pasca-Tebak (Stiker Muncul):** Begitu AI mengenali gambar, stiker objek berwarna (misal ilustrasi anjing) dimunculkan menempel **pas di atas permukaan kanvas**.
     - **Tombol Oranye Berubah Menjadi "Lempar":** Tetap menggunakan **Gestur Jempol (Thumb-Up)** dengan **Circular Progress Ring Confirmation** untuk melempar stiker ke dunia gameplay.
     - **Tombol "Gambar lagi" (Kiri Bawah):** Menggunakan **Gestur 5 Jari Terbuka (High-Five / Hi-5)** dengan **Circular Progress Ring Confirmation** untuk menghapus stiker dan membuka kanvas agar siswa bisa menggambar ulang.

2. **Gambar 2 (`img_24c68d9356ee.jpg`): Koreografi Transisi Pelemparan:**
   - Saat konfirmasi jempol "Lempar" terpenuhi, stiker terlepas dari kanvas dengan animasi terbang/meluncur turun melintasi awan menuju panggung dunia gameplay.
   - Di bagian bawah tetap ada tombol oranye "Lempar" dan tombol "Gambar lagi". Transisi menjaga kontinuitas visual spasial antara kanvas langit dan dunia tebing di bawah.

3. **Gambar 3 (`img_700e7140f979.jpg`): Penempatan & Tombol "Taruh di sini":**
   - Stiker telah mendarat di panggung gameplay dan melayang mengikuti target penempatan.
   - **Tombol Oranye Berubah Menjadi "Taruh di sini":** Menggunakan **Gestur Jempol (Thumb-Up)** dengan **Circular Progress Ring Confirmation**. Mengunci stiker di panggung menjadi objek fisik permainan.
   - **Tombol "Gambar lagi" (Kiri Bawah):** Tetap aktif dengan **Gestur 5 Jari Terbuka (High-Five)** dengan ring konfirmasi untuk kembali ke kanvas jika siswa ingin menggambar bentuk lain.
   - Tombol circular jempol di kanan bawah (`Tahan jempol kalau sudah selesai`) tersinkronisasi sebagai indikator konfirmasi pose jempol.

### B. Bar Kontrol Gameplay Mode Kamera & Model Kemudi Sudut (Gambar 4 & 5)
1. **Gambar 4 (`img_bcfa09fd1a3c.jpg`) & Gambar 5 (`img_ca09c4b06352.jpg`):**
   - Pada gameplay saat ini, bar kontrol bawah menampilkan teks dan tombol kaku keyboard/mouse:
     - `[A] Kiri`
     - `[D] Kanan`
     - `[Spasi] Lompat`
     - `[Klik Kiri + Geser] Geser Objek`
2. **Transformasi Menjadi Kontrol Gestur NUI (Mode Cam):**
   - Saat mode kamera aktif (`mode === 'camera'`), petunjuk keyboard/mouse pada bar bawah **WAJIB DIUBAH TOTAL** menjadi visual affordance ikon gestur tangan:
     - **Model Kemudi Sudut Jarum Speedometer (Angular Steering):**
       - Navigasi Thinman menggunakan kemiringan arah jari telunjuk/tangan dengan kalkulasi sudut derajat ($\theta$):
         - **Sudut ~90° (Tegak lurus ke atas):** Lompat lurus di tempat.
         - **Sudut ~45°–75° (Miring ke kanan atas):** Lompat sambil maju ke kanan (combo jump + right).
         - **Sudut ~105°–135° (Miring ke kiri atas):** Lompat sambil maju ke kiri (combo jump + left).
         - **Sudut horizontal (<30° atau >150°):** Jalan biasa ke kiri atau kanan.
       - Bar kontrol bawah menampilkan visual speedometer/kompas sudut dinamis yang memberi feedback real-time arah kemiringan jari siswa.
     - **Geser Objek:** Menggunakan **Gestur Pinch** dengan **Circular Progress Ring Confirmation** sebelum memegang/menggeser objek fisik di dunia.
     - **Kontrol Baru "Rotate" (Putar Objek):** Ditambahkan tepat di sebelah kanan kontrol Geser Objek. Menggunakan **Gestur 5 Jari Terbuka (High-Five / Hi-5)** dengan **Circular Progress Ring Confirmation** untuk memutar orientasi objek 90°.
     - **Penanganan Fisika Kolisi Objek (KAPLAY):** Saat objek diputar 90°, dimensi bounding box collider ditukar ($w \leftrightarrow h$) secara dinamis agar Thinman dapat memijak permukaan objek tanpa amblas atau tersangkut tanah.

### C. Pengalaman Satu Dunia Sinematik (Awwwards-Tier Continuous Spatial Transition)
- Meskipun route URL di browser berpindah secara teknis (`/level1` $\leftrightarrow$ `/canvas1` via Next.js `window.history.pushState`), **pengalaman pengguna WAJIB terasa sebagai satu kesatuan dunia yang utuh tanpa jeda/reload**:
  - Dari gameplay tebing (`/level1`), kamera melakukan continuous panning meluncur naik menembus pita awan ke langit (`/canvas1`).
  - Setelah stiker selesai dan dilempar, stiker melayang turun mengiringi pergerakan kamera kembali ke tanah tebing panggung gameplay (`/level1`).
  - Menerapkan prinsip *continuous spatial continuity* (Awwwards standard): zero white/blank flash, background gradient langit bersambung mulus, dan state karakter serta objek terjaga utuh.

### C. Pemisahan Mode & Anti-Conflict State Machine (Intent Gating)
- Mengingat gestur yang sama digunakan untuk aksi berbeda di konteks berbeda:
  - **High-Five (5 Jari):** Dipakai untuk "Gambar lagi" di kanvas & penempatan (Gambar 1, 2, 3), "Override Bukan Ini" di Top 3 Panel (§15), dan "Rotate" di gameplay mode cam (Gambar 5).
  - **Thumb-Up (Jempol):** Dipakai untuk pemicu tebakan `[Tebak Gambarku]` (Gambar 1), "Lempar" (Gambar 1 & 2), "Taruh di sini" (Gambar 3), dan konfirmasi navigasi umum (§4, §8, §13).
  - **Pinch (Cubit):** Dipakai untuk goresan kuas (Kanvas §13), "Gambar Ulang" di panel Top 3 (§15), dan "Geser Objek" di gameplay (Gambar 5).
- **Aturan State Machine Wajib:**
  1. `MODE_CANVAS_DRAWING`: Hanya `PINCH` yang menggores tinta. `THUMB_UP` dan `OPEN_PALM` diblokir total dari kanvas (mencegah coretan nyasar).
  2. `MODE_CANVAS_PREDICT_TRIGGER`: Gestur `THUMB_UP` memicu ring tombol oranye `[✨ Tebak Gambarku]`.
  3. `MODE_CANVAS_STAMP_READY`: Kuas nonaktif. `THUMB_UP` memicu ring tombol oranye "Lempar". `OPEN_PALM` memicu ring "Gambar lagi".
  4. `MODE_GAMEPLAY_PLACEMENT`: `THUMB_UP` memicu ring tombol oranye "Taruh di sini". `OPEN_PALM` memicu ring "Gambar lagi".
  5. `MODE_GAMEPLAY_EXPLORATION_CAM`: `PINCH` memicu ring "Geser Objek". `OPEN_PALM` memicu ring "Rotate Objek". Seluruh aksi memerlukan konfirmasi ring agar tidak terpantik tanpa sengaja.
  6. `MODE_TOP3_PANEL`: Tools kanvas mati total. Jari 1–3 memilih kandidat, `OPEN_PALM` override, `PINCH` gambar ulang.

---

## 19. Batas bukti dan audit sebelum implementasi
- Screenshot tidak membuktikan perilaku gerak atau deteksi kamera; laporan pengalaman Owner adalah bukti utama perilaku yang dialami. Jangan simpulkan penyebab dari screenshot saja.
- Detail teknis, angka ukuran dan durasi usulan sebelumnya bukan keputusan Owner. Validasi runtime, layout dan kode sebelum memilih implementasi.
- Pemetaan gestur alat pada §10 dan §13 adalah dugaan sebelumnya, bukan keputusan baru; cek mekanik yang disepakati/terpasang, jangan ubah gestur tanpa dasar. Pisahkan pose konfirmasi dari kuas berdasarkan uji nyata.
- §3–4 menyebut gate 10 detik setelah sampai bendera; bertentangan dengan laporan Owner bahwa jempol muncul setelah drag selesai. Jangan jadikan gate itu syarat baru tanpa verifikasi instruksi terkait.
- Trigger pengecilan kamera pada §6: Owner menyatakan saat kamera sudah menyala; jangan mengasumsikan harus menunggu wave selesai. Urutan interaksi wave dan bangun Momo perlu dicocokkan mandat terdahulu.
- HOLD Dalang tetap aktif; dokumen catatan revisi, bukan implementasi atau mandat eksekusi baru.

---

## 20. Layar Recovery Kegagalan: "Jatuh ke Jurang!" (Screenshot `img_59ba91d8b598.jpg`)
- **Visual Defect & Kondisi Runtime:**
  - Saat karakter atau jembatan objek gambar gagal menopang dan jatuh ke jurang, Momo muncul dengan ekspresi layangan sedih/menangis dan dialog balon *"Jatuh ke jurang!"*.
  - Terdapat bar horizontal berisi 3 tombol aksi:
    1. `Coba lagi` (tombol 1 - warna latar oranye, ikon reload)
    2. `Geser objek` (tombol 2 - warna latar putih, ikon panah bolak-balik)
    3. `Gambar lagi` (tombol 3 - warna latar putih, ikon pensil)
- **Mandat Gestur NUI (1, 2, 3 Jari):**
  - Sesuai instruksi langsung Owner: pemilihan ketiga tombol aksi ini menggunakan **gestur jumlah jari (1, 2, 3 jari) tanpa kursor mouse**:
    - **Tunjukkan 1 Jari (Telunjuk):** Memilih tombol oranye **`Coba lagi`**.
    - **Tunjukkan 2 Jari (Peace):** Memilih tombol **`Geser objek`**.
    - **Tunjukkan 3 Jari (Tiga Jari):** Memilih tombol **`Gambar lagi`**.
  - Setiap pose gestur dilengkapi **Circular Progress Ring Confirmation** yang melingkar pada tombol terkait sebelum aksi tereksekusi, mencegah false trigger atau perpindahan mode yang tidak disengaja.
  - Ini konsisten dengan pola NUI seleksi level (§11) dan seleksi Top-3 kandidat AI (§15).

---

## 21. Hasil Audit Teknis Kode WSL (`ujang-monorepo`) & Rencana Eksekusi Komponen

Berdasarkan audit langsung pada worktree `/home/user_06/projects/sketchbook-ujang-claude-base/frontend/implementation` (commit `0dc2c7d`), berikut adalah pemetaan file komponen, status implementasi saat ini, dan rancangan teknis solusinya:

### A. Routing & Arsitektur Halaman Kanvas Terpisah (`/canvas1`, `/canvas2`, `/canvas3`)
- **File Terdampak:**
  - `app/route-guard.ts`: Fungsi `resolveAppRoute(path)` saat ini hanya mengenali regex `/^\/level(\d+)$/` dan single hardcode `/canvas`.
    - **Solusi Teknis:** Tambahkan regex `/^\/canvas(\d+)$/`. Jika cocok, validasi level unlock (`isLevelUnlocked(stage)`) dan kembalikan `{ kind: "canvas", level, stage }`.
  - `app/hooks/useRouteSync.ts`: Tambahkan penanganan rute canvas bertahap (`path.includes("/canvas")`), sinkronkan stage level yang aktif, dan integrasikan transisi tanpa memicu unmount controller yang merusak state tebakan/stiker.
  - `app/canvas1/page.tsx`, `app/canvas2/page.tsx`, `app/canvas3/page.tsx`: Buat page router Next.js statis yang me-render `<SketchbookApp />` dengan sinkronisasi stage masing-masing.

### B. Siklus Stiker, Tombol "Lempar", dan Transisi Langit-ke-Dunia (Gambar 1–3)
- **File Terdampak:**
  - `src/components/drawing/DrawingActions.tsx` & `src/components/drawing/DrawingScreen.tsx`:
    - Saat ini: Kanvas hanya memiliki tombol `Tebak Gambarku` dan circular thumb `Tahan jempol kalau sudah selesai`. Setelah tebakan selesai, AI menampilkan popup terpisah `EnterWorldPopup` bertuliskan "Masukkan ke dunia".
    - **Solusi Teknis:**
      1. Begitu AI menghasilkan stiker objek, stiker langsung dirender pas di atas kanvas kertas (`DrawingCanvas`), bukan popup kartu terpisah.
      2. Tombol oranye tengah berubah menjadi **"Lempar"** (ikon roket/lempar), didampingi tombol **"Gambar lagi"** di kiri bawah.
      3. Tombol "Lempar" di-drive oleh pose `thumb-up` dengan circular ring confirm 2 detik.
      4. Tombol "Gambar lagi" di-drive oleh pose `open-palm` (5 jari / hi-5) dengan circular ring confirm 2 detik.
  - Transisi Lempar: Trigger GSAP timeline melepaskan stiker dari kanvas meluncur ke bawah melewati awan (`CloudBand`) menuju koordinat gap dunia tebing di `GameStage`.

### C. Mode Kamera Bar Bawah Gameplay & Rotasi Objek (Gambar 4 & 5)
- **File Terdampak:**
  - `src/components/game/GameplayControls.tsx`:
    - Saat ini: Bar kontrol bawah menampilkan tombol arah keyboard (`[A] Kiri`, `[D] Kanan`, `[Spasi] Lompat`) dan tombol `[Klik Kiri + Geser] Geser objek`.
    - **Solusi Teknis:**
      1. Tambahkan state affordance khusus saat `mode === "camera"`. Sembunyikan label key keyboard `[A]`, `[D]`, `[Spasi]`.
      2. Ganti label dan visual menjadi affordance gestur tangan (ikon gestur arah tilt/kemiringan untuk gerak, dan fist-up untuk lompat).
      3. Tombol `Geser objek`: Beri visual ring pinch indicator. Gestur `pinch` mengaktifkan manipulasi objek.
      4. **Tambah Tombol Baru "Rotate" (Putar Objek):** Tempatkan di samping kanan tombol "Geser objek". Beri ikon putar (`Icon name="rotate"` / swap-clockwise). Dipicu oleh gestur `open-palm` (5 jari / hi-5) dengan ring confirm.
  - `src/game/runtime/integrated-scene.ts` & `src/components/game/hooks/usePlacement.ts`:
    - Saat ini: `setPlacement(x, y)` hanya menerima koordinat translasi `(x, y)` dan `this.pendingArt.pos = this.k.vec2(x, y)`. Belum ada penanganan sudut rotasi.
    - **Solusi Teknis:** Tambahkan properti `angle` (rotasi 90 derajat per trigger hi-5: 0, 90, 180, 270) pada pending creation: `this.pendingArt.angle = angle`, dan sesuaikan bounding box physics geometry agar kalkulasi legal placement tetap akurat.

### D. Layar Recovery "Jatuh ke Jurang!" (Screenshot `img_59ba91d8b598.jpg` - §20)
- **File Terdampak:**
  - `src/components/game/FailOverlay.tsx`:
    - Saat ini: Memakai `DwellButton` berbasis fingertip dwell pointer hover (`dwellMs=2000`).
    - **Solusi Teknis:**
      1. Sambungkan hook `useHandGesture(true)` langsung ke dalam `FailOverlay`.
      2. Ganti trigger dwell dengan deteksi jumlah jari (`fingerCount`):
         - `fingerCount === 1`: Aktifkan circular ring progress pada tombol oranye `Coba lagi`.
         - `fingerCount === 2`: Aktifkan circular ring progress pada tombol `Geser objek`.
         - `fingerCount === 3`: Aktifkan circular ring progress pada tombol `Gambar lagi`.
      3. Durasi hold ring confirm disetel 1.5–2 detik dengan visual circular SVG ring melingkar di setiap kartu aksi.

### E. Pipeline Pengenalan Gestur Multi-Jari & Ekstensi Hook Hand Tracking
- **File Terdampak:**
  - `src/input/hand-gesture.ts`:
    - Saat ini: `classifyHandPose` sudah mengenali `thumb-up`, `fist`, `pinch`, `two-fingers`, `split-palm`, `open-palm`. Namun fungsi hitung jari diskrit belum diekspos sebagai angka.
    - **Solusi Teknis:**
      1. Tambahkan fungsi murni `countExtendedFingers(landmarks: Landmark[]): number` yang menghitung jari-jari yang terangkat lurus (`extended`) secara presisi (membedakan 1, 2, 3, 4, 5 jari).
      2. Perluas tipe `HandPose` untuk mencakup pose `one-finger` (pointing) dan `three-fingers`.
  - `src/camera/thumb-tracker.ts`:
    - Saat ini: `HandGestureState` hanya berisi `{ ready, handVisible, thumbUp, pinch, cursor }`.
    - **Solusi Teknis:** Tambahkan field `pose: HandPose` dan `fingerCount: number` ke dalam `HandGestureState` agar seluruh UI dapat membacanya langsung.
  - `src/hooks/useHandGesture.ts`: Otomatis mengekspos `pose` dan `fingerCount` terbaru ke komponen konsumen React.

### F. Perbaikan Komponen Onboarding & Brosur Tutorial
- **File Terdampak:**
  - `src/components/onboarding/StudentRulerSelector.tsx`:
    - Bug terbukti di baris 41 & 56: Nilai default penggaris di-hardcode ke angka `20`.
    - **Solusi Teknis:** Ubah fallback default `readSavedNumber()` menjadi `1`, serta initial state `position=0, target=0, shownNumber=1, value=1`.
    - Tambahkan state `hasInteracted`: Balon Momo konfirmasi jempol hanya muncul setelah penggaris digeser dan settle (`RULER_SETTLE_MS`).
    - Pasang tactile grab handle box berukuran 48x70px pada indikator tengah penggaris.
  - `src/components/onboarding/TutorialBrochure.tsx`:
    - Bug terbukti di `WalkPlayground`: Komponen hanya memiliki event handler mouse `onPointerMove` dan timer auto-walk yang sudah dicabut.
    - **Solusi Teknis:** Pasang `useHandGesture(mode === "camera")`. Saat `gesture.pinch === true`, petakan perubahan `gesture.cursor.x` langsung ke pergerakan Thinman `place(next)`.
    - Kalibrasi `computeLayout()`: Naikkan lebar dan tinggi buku agar tidak terlalu kecil, serta perlambat transisi lipat kartu menjadi ~1.0s.
  - `src/components/level/LevelRibbonBookmark.tsx`:
    - Bug terbukti di baris 378: Ikon bawah bookmark di-hardcode `<Icon name="arrow-down" />`.
    - **Solusi Teknis:** Ganti secara dinamis berdasarkan bab: Bab 1 = `finger-1`, Bab 2 = `finger-2`, Bab 3 = `finger-3`. Hubungkan ke `fingerCount` untuk auto-pull pita bab via gestur jari.

---

## 22. Status Kesiapan Implementasi & Rencana Gate
1. **Hold Status:** Tetap mematuhi Dalang HOLD. Tidak ada modifikasi kode pada workspace WSL sebelum izin atau `/dalang unhold` diberikan Owner.
2. **Kesesuaian Arsitektur:** Seluruh rencana teknis menggunakan stack native yang sudah ada (React 19, GSAP, MediaPipe Tasks-Vision, Next.js App Router, KAPLAY physics engine) tanpa menambah library eksternal baru.
3. **Pemisahan Domain (Workstream Partitioning):**
   - Domain A: Input pipeline & Hand Tracking (`src/input/hand-gesture.ts`, `src/camera/thumb-tracker.ts`, `src/hooks/useHandGesture.ts`).
   - Domain B: Onboarding & Tutorial (`StudentRulerSelector.tsx`, `TutorialBrochure.tsx`, `LevelRibbonBookmark.tsx`).
   - Domain C: Routing & Flow Canvas (`app/route-guard.ts`, `useRouteSync.ts`, `app/canvas[1-3]/page.tsx`).
   - Domain D: Canvas & Stiker Interaksi (`DrawingActions.tsx`, `DrawingScreen.tsx`, lempar timeline).
   - Domain E: Gameplay & Recovery (`GameplayControls.tsx`, `usePlacement.ts`, `integrated-scene.ts`, `FailOverlay.tsx`).

