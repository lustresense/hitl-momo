# NUI Lab 4 | pesan 55-64

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afb0520-54b0-83ec-b789-6680fdb7cb15
> Source Git blob: e04d43f2ce0067c893759488179e9a36c826be8a

## L4-M055 | Assistant | waktu tidak ada


Gw bikinin **satu file MD skrip bimbingan** yang bisa langsung lu baca sambil buka NUI Lab Canvas. Istilahnya harus tepat. Yang dilatih ulang bukan MediaPipe, melainkan **classifier gesture tambahan** dengan data landmark MediaPipe.

Gw juga cek kode swipe terbaru dulu supaya bisa jelasin kenapa Undo/Redo belum bereaksi, tanpa ngarang penyebab atau mengklaim sudah berhasil di webcam.

**Buat bimbingan, bilang bahwa lu sudah melakukan eksperimen pelatihan classifier gesture tambahan berbasis MediaPipe, bukan retraining model inti MediaPipe.** Hasil dataset-nya menjanjikan, tetapi belum terbukti pada webcam nyata.

Soal Undo/Redo, gw sudah cek source terbaru. Fitur swipe memang ada, tetapi pengujiannya masih sintetis. Jadi kalau sekarang belum bekerja saat lu coba, **jangan demonstrasikan sebagai fitur yang sudah berhasil**\.

HASIL EKSPERIMEN DATASET HAGRIDV2

# 44,8%

Macro-F1 baseline

# 78,2%

Heuristik revisi

# 98,7%

Pilot MLP

Perbandingan macro-F1 tujuh kelas pada dataset uji, bukan tingkat keberhasilan aplikasi di perangkat siswa. Model MLP belum dipasang ke NUI Lab maupun gameplay.

## File skrip bimbingan siap

**[Download SKRIP BIMBINGAN NUI LAB.md](sandbox:/mnt/data/SKRIP_BIMBINGAN_NUI_LAB_2026-11-17.md)**

Naskah bicara 3–4 menit, urutan demo Canvas, hasil training, keterbatasan, dan jawaban pertanyaan dosen

## Soal Undo/Redo yang belum bekerja

Di kode terbaru, swipe **memang sudah diimplementasikan**, tetapi ada persyaratan yang cukup ketat.

Coba sekarang di Canvas Lab.

1. Pastikan **mode eksperimen ON**, bukan baseline.
2. Selesaikan satu coretan menggunakan pinch, lalu lepaskan.
3. Tahan **satu jari diam sebentar**, kemudian geser ke kiri secara horizontal dengan gerakan tegas.
4. Untuk Redo, tahan **dua jari**, lalu geser ke kanan.

Swipe mensyaratkan gerakan minimal **1,3 kali rentang tangan dalam 600 milidetik**, setelah pose stabil. Jika gerak terlalu pendek, lambat, atau pose berubah, perintah dibatalkan.

Kalau masih gagal, lihat panel diagnostik `Swipe phase`, `Last cancel`, dan `Last command`\. Itu bisa membedakan apakah gerakannya ditolak atau Undo/Redo terpanggil tetapi tidak ada perubahan pada stroke.

**Jangan utak-atik threshold tepat sebelum bimbingan.** Di naskah, gw sudah siapkan kalimat untuk menjelaskan secara akademik bahwa swipe masih dalam validasi webcam, sementara hasil pelatihan classifier masih sebatas eksperimen dataset.

Inti presentasi lu adalah **progres interaksi NUI, alasan melakukan eksperimen training, hasil perbandingan, dan rencana pengujian berikutnya**\. Bukan mengklaim semua fitur sudah sempurna.

📦 **Files delivered** · 2026-11-17 14:00
- 📎 **SKRIP_BIMBINGAN_NUI_LAB_2026-11-17.md** · MD

---

---

## L4-M056 | User | 2026-11-17 14:14:04


message time: 2026-11-17 14:14:04

ini gw bimbingan cuma modal tunnel sama github, ga bawa laptop. gimana bukanya buka apa aja ulangin mdnya

---

---

## L4-M057 | Assistant | waktu tidak ada


Gw revisi skripnya khusus buat bimbingan lewat HP, cukup pakai tunnel NUI Lab dan GitHub. Gw cek naskah sebelumnya serta link yang tersedia, lalu bikin urutan buka halaman, demo yang aman, dan kalimat presentasinya dalam satu MD.

Untuk bimbingan lewat HP, cukup siapkan **dua tab wajib**. Pertama, URL tunnel yang berakhir `/nui-lab/canvas`. Kedua, laporan hasil A/B classifier di GitHub. Halaman Gesture Lab dan commit cukup jadi cadangan kalau dosen minta detail.

Gw belum bisa memastikan tunnel yang dulu dipakai masih aktif, jadi di skrip gw pakai URL tunnel terbaru dari Ujang. Kalau kamera HP atau gesture gagal, presentasinya tetap bisa lanjut lewat laporan GitHub tanpa mengklaim demo berhasil.

**Gw udah bikin ulang skrip bimbingannya khusus buat lu yang cuma bawa HP, akses tunnel, dan GitHub.** Nggak perlu laptop, terminal, atau membuka VS Code.

**[Download Skrip Bimbingan NUI Lab via HP.md](sandbox:/mnt/data/SKRIP_BIMBINGAN_NUI_LAB_HP_TUNNEL_GITHUB_2026-11-17.md)**

Naskah bicara 2–3 menit, tautan, urutan demo, jawaban pertanyaan dosen, dan rencana cadangan

## Buka dua tab ini di HP

**Tab 1. NUI Lab Canvas**

Buka URL tunnel terbaru dari Ujang, ditambah `/nui-lab/canvas`\.

Perlihatkan kanvas, pelacakan tangan, pinch dan gesture yang tersedia. Kalau kamera HP tidak memungkinkan, cukup tunjukkan UI dan lanjut ke laporan.

---

**Tab 2. Hasil training dan benchmark GitHub**

[Buka laporan R&D](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md)

Perlihatkan tabel perbandingan classifier dan jelaskan bahwa MediaPipe tetap utama.

## Tiga hal yang wajib lu sampaikan

- **MediaPipe tidak di-retrain.** Yang dilatih adalah classifier gesture tambahan menggunakan landmark.
- **Hasil pilot MLP macro-F1 0,987**, dibandingkan baseline 0,448 pada dataset uji. Ini bukan klaim akurasi webcam siswa.
- **Undo/Redo swipe masih bermasalah saat pengujian langsung**, meskipun kode dan tes sintetis sudah tersedia.

Di MD, gw juga siapkan **skrip darurat 30 detik** kalau waktu bimbingan pendek atau tunnel tidak berjalan.

Yang penting sebelum berangkat, buka dua tab tersebut dan pastikan URL tunnel dari Ujang masih aktif. Jangan mengandalkan domain lama yang belum terverifikasi.

📦 **Files delivered** · 2026-11-17 14:16
- 📎 **SKRIP_BIMBINGAN_NUI_LAB_HP_TUNNEL_GITHUB_2026-11-17.md** · MD

---

---

## L4-M058 | User | 2026-11-17 14:16:54


message time: 2026-11-17 14:16:54

jadi kalo bisa nunjukin kode github jg oke dimana2nya gt

---

---

## L4-M059 | Assistant | waktu tidak ada


Gw tambahin ke skrip HP tadi bagian **buka kode GitHub sambil jelasin ke dosen**, lengkap dengan link file dan bagian kode yang perlu ditunjuk. Gw pilih yang paling relevan buat MediaPipe, klasifikasi gesture, swipe, dan training, supaya lu nggak perlu cari-cari di GitHub saat bimbingan.

**Bisa, malah lebih bagus kalau lu nunjukin kode GitHub juga.** Dosen jadi bisa lihat bahwa NUI dan eksperimen training-nya punya implementasi, bukan cuma tampilan atau laporan.

Gw sudah tambahkan link langsung ke baris kode dalam skrip bimbingan HP sebelumnya.

**[Download Skrip Bimbingan HP + Kode GitHub](sandbox:/mnt/data/SKRIP_BIMBINGAN_NUI_LAB_HP_GITHUB_KODE_2026-11-17.md)**

Skrip lengkap, link kode, urutan demo, hasil eksperimen, dan jawaban untuk dosen

## Buka kode ini saat bimbingan

Cukup gunakan satu tab GitHub. Buka link sesuai kebutuhan, nggak perlu cari folder manual.

1

**[MediaPipe Hand Landmarker](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/src/camera/hand-landmarker.ts#L80-L103)**

Tunjuk bagaimana MediaPipe dibuat sebagai pendeteksi tangan utama.

---

2

**[Gesture menjadi aksi di Canvas](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/src/components/nui-lab/lab-analyzer.ts#L263-L308)**

Tunjuk proses klasifikasi jari, pinch, Undo/Redo, dan pengiriman aksi ke kanvas.

---

3

**[Training classifier LR dan MLP](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/scripts/nui-rd/rd_train.py#L148-L214)**

Ini bukti kode eksperimen training. Jelaskan bahwa yang dilatih adalah classifier tambahan, bukan MediaPipe.

---

4

**[Hasil perbandingan A/B](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md#L66-L98)**

Tunjuk macro-F1 baseline 0,448, heuristik revisi 0,782, dan pilot MLP 0,987.

**Urutan paling enak buat lu\:** buka Canvas lewat tunnel → tunjukkan kode MediaPipe → kode pengendalian gesture → kode training → tabel hasil eksperimen.

Kalau dosen bertanya kenapa Undo/Redo masih gagal, skrip juga punya link ke `lab-swipe.ts` serta penjelasan bahwa implementasi sudah ada, tetapi pengujian webcam nyata belum berhasil membuktikan keandalannya.

Semua link kode mengarah ke commit `3ef4cc3`, jadi nomor barisnya tetap meskipun branch `main` berubah.

📦 **Files delivered** · 2026-11-17 14:18
- 📎 **SKRIP_BIMBINGAN_NUI_LAB_HP_GITHUB_KODE_2026-11-17.md** · MD

---

---

## L4-M060 | User | 2026-11-17 14:21:58


message time: 2026-11-17 14:21:58

intinya gw mau jelasin progres gw ini prof dll gitu gw retrain lagi modelnya krn masalah apa aja sebutin terus solvenya sejauh ini sampe gini gitu nah low light masih belum gitu dan user nanti download seberapa gitu kea beneran skrip gw ngomonh cok. jadi bacaannya itu bahan bacaan tapi ttep bikin gw paham kea gw jelasin, overall ini ok buat bacaan tp kea agak gimana gw kurang runtut. nah kode2 itu masukin jg di md kea sambil jelasin ini buat apanya buat lock apa. jadi semua sistem nui gw jelasin krn kemarin gw cuma bimbinhan gamenya dan flow, bukan teknisnya, ini yg utama cok

---

---

## L4-M061 | Assistant | waktu tidak ada


Gw bikin ulang MD-nya jadi **naskah presentasi teknis NUI yang runtut**, bukan kumpulan poin. Alurnya dari masalah yang lu temui saat mencoba kamera, cara kerja sistem dari webcam sampai aksi di canvas, alasan training classifier tambahan, hasil eksperimen, lalu keterbatasan low-light dan kebutuhan download model.

Gw bakal selipkan tautan kode GitHub tepat di bagian yang sedang lu jelaskan, termasuk hand lock, pinch, Hapus, swipe, dan training. Angka yang belum diukur, terutama ukuran download total saat siswa membuka aplikasi, nggak akan gw karang.

Gw menemukan angka yang bisa lu sampaikan dengan aman saat dosen bertanya soal download. Di repo ada model tangan MediaPipe berukuran **7,82 MB** dan runtime WASM sekitar **9,42 MB** untuk varian SIMD. Itu ukuran file mentah, **bukan ukuran total download aplikasi**, karena JavaScript, CSS, model wajah, kompresi, dan cache browser belum dihitung.

Gw juga akan jelaskan bahwa dataset ratusan MB dan bobot pilot MLP tidak ikut diunduh siswa. Itu hanya dipakai di eksperimen offline sejauh implementasi saat ini.

**Gw sudah rombak skripnya jadi paparan teknis NUI dari awal sampai akhir, dengan gaya ngomong ke dosen yang runtut.** Jadi bukan sekadar daftar kode dan hasil eksperimen.

**[Download Skrip Bimbingan Teknis NUI Lengkap.md](sandbox:/mnt/data/SKRIP_BIMBINGAN_TEKNIS_NUI_LAB_2026-11-17.md)**

Naskah bicara ±8 menit • 9 bagian utama • 15 referensi komponen kode • Tanya jawab dosen

Skrip sekarang dimulai dengan menghubungkan **bimbingan kemarin tentang gameplay** ke pembahasan teknis hari ini. Setelah itu lu menjelaskan perjalanan input dari kamera sampai canvas, termasuk MediaPipe, 21 landmark, auto-lock, smoothing, classifier, dan bagaimana gesture memicu aksi.

Baru kemudian lu menjelaskan masalah yang lu alami, perbaikan yang sudah dilakukan, alasan training classifier tambahan, dan hasil perbandingannya.

Gw juga masukin dua hal penting yang sebelumnya kurang jelas.

**Pertama, masalah low-light belum selesai.** Classifier tambahan membantu mengenali pose ketika landmark tersedia, tetapi tidak otomatis memperbaiki kegagalan MediaPipe mendeteksi tangan dalam pencahayaan buruk.

**Kedua, kebutuhan download siswa.** Ukuran model tangan MediaPipe di repo sekitar **7,82 MB**, ditambah salah satu runtime WASM sekitar **9,3 sampai 9,4 MB**\. Total download aplikasi yang sebenarnya masih perlu diukur. Dataset training dan model MLP pilot belum dikirim ke siswa.

Setiap bagian teknis punya link kode GitHub yang bisa lu buka **tepat saat menjelaskan fungsi tersebut**, bukan dipisahkan sebagai daftar kode tanpa konteks.

Di bagian akhir ada jawaban siap pakai jika dosen bertanya tentang retraining, IPN HandS, akurasi 98,7%, performa, atau Undo/Redo yang masih gagal pada webcam.

**Buka Canvas Lab dulu, ikuti naskah bagian 1 sampai 9, lalu pakai link kode ketika diperlukan.** Seluruhnya dirancang supaya bisa lu presentasikan dari HP tanpa laptop.

📦 **Files delivered** · 2026-11-17 14:27
- 📎 **SKRIP_BIMBINGAN_TEKNIS_NUI_LAB_2026-11-17.md** · MD

---

---

## L4-M062 | User | 2026-11-17 14:36:33


message time: 2026-11-17 14:36:33

JELASIN LANGSUNG KE SINI PAKE VISUAL PLS BURUANNNNNNN GAADA WAKTU BANYAK

---

---

## L4-M063 | Assistant | waktu tidak ada


**Lu jelasin ke dosen mulai dari masalah yang lu temukan, cara kerja NUI, perbaikan, sampai alasan melatih classifier tambahan.** Ini urutan ngomongnya. Buka **NUI Lab Canvas lewat tunnel** dulu, lalu pindah ke GitHub sesuai link di bawah.

## 1. Pembukaan. Kenapa sekarang membahas NUI?

TAMPILKAN NUI LAB CANVAS

> "Pak/Bu, pada bimbingan sebelumnya saya sudah menjelaskan gameplay dan alur interaksi Sketchbook Universe. Hari ini saya ingin menjelaskan progres teknis Natural User Interface atau NUI, khususnya bagaimana kamera membaca tangan siswa untuk mengontrol kanvas."
>
> "Saya juga menemukan beberapa masalah ketika mencobanya secara langsung. Karena itu saya melakukan revisi pada sistem pengenalan gesture dan eksperimen pelatihan model tambahan."

## 2. Cara kerja sistem NUI secara keseluruhan

**Webcam siswa**

Mengambil frame video

**MediaPipe Hand Landmarker**

Mendeteksi tangan dan menghasilkan 21 landmark

**Hand Lock**

Memilih tangan aktif dan mencegah pengambilalihan

**Gesture Classifier**

Membaca pose pinch, 1–5 jari

**Stabilization + Gesture State Machine**

Memastikan pose stabil, gerak memenuhi syarat, dan tinta tidak bergetar

**Aksi di Canvas / Gameplay**

Coret, Hapus, Undo, Redo dan aksi sesuai mode

**Bacaan lu**

> "Sistem dimulai dari kamera yang diproses oleh MediaPipe. MediaPipe menghasilkan 21 titik landmark tangan, yaitu koordinat pada pergelangan, sendi, dan ujung jari."
>
> "Landmark itu tidak langsung menjadi perintah. Ada lapisan hand lock untuk menentukan tangan mana yang berhak mengontrol, kemudian classifier membaca bentuk jari, dan state machine menentukan kapan sebuah gerakan boleh menjadi aksi."
>
> "Karena ini aplikasi berbasis web, proses deteksi MediaPipe dijalankan di browser pengguna."

Buka [Kode MediaPipe utama](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/src/camera/hand-landmarker.ts#L80-L103)\.

## 3. Fungsi setiap komponen NUI

**Hand Lock**

> "Ketika ada dua tangan atau tangan lain lewat di belakang, sistem tidak boleh tiba-tiba pindah kendali. Karena itu saya memakai mekanisme auto-lock dan recovery berdasarkan kontinuitas posisi dan ukuran tangan, bukan mengenali identitas orang."

[Buka kode auto-lock dan recovery](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/src/components/nui-lab/lab-hand-lock.ts#L24-L129)

---

**Gesture Classifier**

> "Classifier membaca hubungan antarlandmark. Jadi untuk menentukan tiga atau lima jari, sistem tidak cukup hanya menghitung ujung jari yang terlihat, tetapi harus memperhitungkan posisi jempol dan bentuk telapak."

[Buka kode pembacaan jari](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/src/input/hand-gesture.ts#L190-L270)

---

**Smoothing dan Pipeline Aksi**

> "Ketika tangan diam, landmark bisa sedikit bergetar. Saya memakai One Euro Filter untuk menghaluskan koordinat tinta. Sementara itu, aturan pose stabil dipakai supaya noise sesaat tidak langsung menghasilkan aksi."

[Buka kode One Euro Filter](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/src/input/smoothing.ts#L89-L99)

[Buka pipeline gambar dan penghapus](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/src/input/hand-stroke-pipeline.ts#L195-L270)

---

**Pengaturan Performa**

> "Ada juga inference scheduler supaya proses pembacaan tangan dan wajah tidak membebani browser secara berlebihan. Sistem mendukung penggunaan GPU dengan fallback CPU."

[Buka kode inference scheduler](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/src/camera/inference-scheduler.ts#L19-L56)

## 4. Masalah apa yang bikin lu melakukan revisi?

TAMPILKAN GESTURE DI CANVAS LAB

**Tiga jari terbaca empat**

Posisi jempol tertentu menyebabkan perhitungan jari salah.

---

**Lima jari tidak selalu dikenali**

Gesture Hapus bisa gagal atau terpicu pada pose yang salah.

---

**Pinch terlalu sensitif**

Tinta berpotensi muncul sebelum kedua jari benar-benar rapat.

**Bacaan lu**

> "Saat saya mencoba langsung, bahkan pada pencahayaan terang, ada gesture yang salah dibaca. Misalnya tiga jari terbaca empat, lima jari belum konsisten, dan pinch kadang memulai coretan terlalu dini."
>
> "Saya menemukan bahwa sebagian masalahnya ada pada aturan klasifikasi landmark, bukan semata-mata pada pendeteksian tangan."
>
> "Saya kemudian memperbaiki pembacaan jempol, memperhitungkan rasio video kamera, memperketat pinch, dan membuat penghapus lebih mampu memotong garis di antara titik-titik stroke."
>
> "Untuk Undo dan Redo, saya sudah membuat prototype berbasis swipe. Satu jari bergerak kiri untuk Undo dan dua jari bergerak kanan untuk Redo. Namun dari percobaan terbaru, fitur ini masih belum konsisten di webcam."

[Buka kode swipe Undo/Redo](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/src/components/nui-lab/lab-swipe.ts#L21-L160)

## 5. Kenapa sampai training model lagi?

**MediaPipe**

Tetap digunakan

**21 landmark**

Data fitur

**MLP / LR**

Classifier tambahan

---

Training menggunakan data HaGRIDv2 secara offline. Model hasil training belum digunakan oleh aplikasi.

**Bacaan lu**

> "Setelah memperbaiki aturan manual, saya juga ingin mengetahui apakah pendekatan machine learning dapat mengenali gesture lebih baik daripada aturan geometris saja."
>
> "Saya melakukan eksperimen pelatihan classifier tambahan menggunakan fitur landmark dari dataset HaGRIDv2. Model yang dibandingkan adalah Logistic Regression dan Multi-Layer Perceptron atau MLP."
>
> "Jadi, saya tidak melakukan retraining bobot MediaPipe. MediaPipe tetap menjadi pendeteksi tangan. Yang dilatih adalah model tambahan untuk menginterpretasikan landmark menjadi kelas gesture."
>
> "Saya juga mengevaluasi IPN HandS, terutama untuk landmark terkoreksi dan gesture temporal, tetapi data landmark-nya belum berhasil diunduh akibat kuota Google Drive. Jadi hasil training sekarang berasal dari HaGRIDv2, bukan IPN HandS."

[Tunjukkan kode training model LR dan MLP](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/scripts/nui-rd/rd_train.py#L148-L214)

## 6. Ini hasil eksperimen yang bisa lu tunjukkan

BUKA TABEL A/B DI GITHUB

**Perbandingan Macro-F1 pada 7 kelas gesture**

*Dataset HaGRIDv2. Lebih tinggi berarti lebih baik. Bukan pengujian webcam.*

| Category | Macro-F1 |
| --- | ---: |
| Baseline | 44.8% |
| Revisi aturan | 78.2% |
| Pilot LR | 97.6% |
| Pilot MLP | 98.7% |

Perbandingan menggunakan test set 50.607 sampel dengan 3.707 subjek. Angka dibulatkan.

**Bacaan lu**

> "Untuk evaluasi awal, empat pendekatan dibandingkan pada data uji yang sama, yaitu sistem baseline, aturan geometris revisi, Logistic Regression, dan MLP."
>
> "Hasil macro-F1 tujuh kelas meningkat dari 0,448 pada baseline menjadi 0,782 setelah revisi aturan. Kemudian model MLP pada eksperimen offline menghasilkan 0,987."
>
> "Hasil ini menunjukkan pendekatan classifier tambahan berpotensi lebih baik. Tetapi nilainya masih diperoleh dari dataset gambar statis, belum dari penggunaan webcam siswa secara langsung. Karena itu model MLP belum saya pasang ke aplikasi."

[Buka hasil benchmark lengkap di GitHub](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md#L66-L98)

## 7. Low-light masih belum selesai

Terang, landmark lebih mudah didapat

Low-light atau backlight, deteksi lebih sulit

**Bacaan lu**

> "Masalah yang belum selesai adalah kondisi low-light dan backlight. Ketika pencahayaan kurang baik, MediaPipe bisa gagal mendapatkan landmark atau hasilnya tidak stabil."
>
> "Classifier MLP yang saya latih tidak otomatis menyelesaikan hal tersebut. Jika landmark tidak tersedia, classifier tidak mempunyai data yang cukup untuk membaca gesture."
>
> "Jadi saya memisahkan dua persoalan. Pertama, kualitas deteksi landmark pada kondisi pencahayaan berbeda. Kedua, akurasi pengenalan gesture setelah landmark berhasil didapat."
>
> "Tahap berikutnya perlu pengujian pada kondisi nyata, misalnya pencahayaan ruangan biasa, cahaya dari belakang, dan kamera perangkat siswa."

## 8. Berapa ukuran yang di-download siswa?

Model tangan MediaPipe **7,82 MB**

Runtime WASM SIMD **9,42 MB**

---

Subtotal ukuran file mentah

## 17,24 MB

Belum termasuk JavaScript, CSS, model wajah, dan aset aplikasi. Total transfer sebenarnya harus diukur lewat Network browser.

**Bacaan lu**

> "Karena aplikasi berbasis web, model dan runtime perlu dimuat oleh browser. Model tangan MediaPipe di repository sekitar 7,82 MB dan runtime WASM salah satu variannya sekitar 9,42 MB."
>
> "Namun angka itu bukan total download aplikasi. Saya masih perlu mengukur transfer aktual, termasuk aset frontend dan pengaruh caching."
>
> "Dataset HaGRIDv2 tidak ikut diunduh pengguna. Model MLP hasil eksperimen juga belum masuk aplikasi. Jadi training dilakukan secara offline, bukan setiap siswa membuka game."

[Lihat file model MediaPipe di GitHub](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/public/models/hand_landmarker.task)

## 9. Penutup ke dosen

> "Jadi progres teknis NUI saya saat ini sudah mencakup pipeline kamera dan MediaPipe, pengelolaan hand lock, klasifikasi gesture, smoothing, serta aksi menggambar dan menghapus di canvas."
>
> "Saya sudah melakukan revisi aturan gesture berdasarkan masalah yang ditemukan dan eksperimen pelatihan classifier tambahan. Hasil dataset menunjukkan peningkatan, tetapi pengujian webcam nyata masih diperlukan."
>
> "Prioritas berikutnya adalah memastikan gesture konsisten dalam penggunaan langsung, menyelesaikan masalah Undo/Redo swipe, menguji low-light dan backlight, serta mengukur performa dan kebutuhan download di perangkat pengguna."
>
> "Saya ingin meminta arahan Bapak/Ibu mengenai prioritas evaluasi teknis ini sebelum saya mengintegrasikan perbaikannya lebih jauh ke gameplay utama."

---

**Kalau waktu lu tinggal 2 menit**, fokus ke urutan ini.

1. **Canvas Tunnel**\. Tunjukkan sistem NUI dan jelaskan webcam → MediaPipe → landmark → lock → gesture → aksi.
2. **Masalah**\. Tiga jari, lima jari, pinch prematur, Undo/Redo dan low-light.
3. **Training**\. Tegaskan bukan retrain MediaPipe, melainkan MLP tambahan dari HaGRIDv2.
4. **GitHub Benchmark**\. Tunjukkan 0,448 → 0,782 → 0,987, lalu tekankan hasil dataset belum membuktikan performa webcam.
5. **Rencana berikutnya**\. Validasi webcam, perbaikan low-light, swipe, dan ukur performa perangkat.

**Kalimat terpenting yang harus lu ingat adalah "MediaPipe tetap model utama untuk mendeteksi tangan. Saya melatih classifier tambahan untuk memperbaiki pembacaan gesture, tetapi model hasil training masih dalam tahap evaluasi dan belum dipasang ke gameplay."**

![isolated male hand showing number three](https://images.openai.com/static-rsc-4/5BMPL8gfogjeAjpH4JDF65ccVqVZTzXx71blKT6p9FraliF46p33WiBr2p8pi1mHZe50rOHeF2yd0mrotTlTQvOmEXkQ1wMVc8D3962d8UDJuR2szJq3VBh0bdU97ka1X84MZLiC5_doWyCUXQjVQNGnw0PrWMPlZC24Bg8zWInJKs4MHAulViV3dujMigw_?purpose=fullsize)

![Hand with outstretched fingers counts '5'](https://images.openai.com/static-rsc-4/7_2erX_8v0Xlv7zIQM_ljxFhW3uZN0ORj7YFgRL-LWK4SKL1fITLCZmJQgOlcrG8XyiLV3qBlrnTSCcDO4sciHMCs1CBMfNZAdGbXe-ZPrnvPzSllDirMC9n_2JhxtDMAZo1Ckn4HW_7OZWMtCfJIQeHVAUx8z9lOXNswtt8mZEHcHMqAY22tu8zvomQwBSZ?purpose=fullsize)

![Man holding something on white background, closeup](https://images.openai.com/static-rsc-4/dbgFLqv1nPXQ4dl8ctnYtz1frJt5ELzEC8IRo9E7-Jib22dtL5nYpPIAEg0CHVJb-yRZT2h9Qrv8nNxnnDLTPmHS_IIPRvxAGQ2AP9fl-AfdQUQ1GYGXbBAOu10nxDoEffGYwjL91jfa6CJ3rNlckydjHZumdvgxR6Gnc1b93wSOlMA5eB-NlMhSn6K8hq7k?purpose=fullsize)

![Open hand palm gesture | Free Photo - rawpixel](https://images.openai.com/static-rsc-4/l86itiSL-tWotvkdtwDEFw4Ldv_ZPiWQLoYdKo0mZVlmScRYhb7Ce3FVFzAhnFikYoasMhhCGXYk3331UPNovLc-BnxXjxIEugkNmvJNsy_NHfbVh1aYtFlbZUp3TlloNvZ9J7DRq0YJppTQBrMhVIet2GQcQZVgy8siCgBqra1DztBEYL7qT69XSUc6cQrU?purpose=fullsize)

![Hand Outstretched Against Illuminated Window](https://images.openai.com/static-rsc-4/eeTL_jRCCdRt1ni5lWNIiLU2NZbO6wkG6NVExd1ACDoAvS9tJgIJzwaSl8mLuXRiMyBop7w03c_WkGJmlsCu3d6Mkx88rHmUVRQGkDkMJ6nrFt3xLBAeeAQvNok71l6yrl-33G1WDzDad9iFtn11DtyXQ7hkT2PxXEv-hFwu24zgSpT9_Iag8Km5rWAdC68b?purpose=fullsize)

---

---

## L4-M064 | User | 2026-11-17 14:44:42


message time: 2026-11-17 14:44:42

ULANGINNN SAMA PERMASALAHAN GW JANCOK MD TERAKHIR UDH OK CUMA TERLALU RINCI ANJJNGGGG BURUAN TERUS NUNJUKIN DATASET2 MANA JANCOKKKKK

---

---
