# NUI Lab 2 | pesan 16-25

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afaa44b-c470-83ec-8ecd-191ab1a01290
> Source Git blob: a7a305e4e66d795ed4e51997028d260dd79bef5a

## L2-M016 | Assistant | waktu tidak ada


Ada gap yang cukup serius, dan gw nggak mau bilang stack ini sudah aman hanya karena tes rigging selesai. Gw akan audit ulang hasil uji, asumsi soal deteksi wajah, dan ukuran unduhan, lalu pisahkan mana yang sudah terbukti, mana yang masih risiko saat lu tes di webcam asli.

**Ada gap yang serius, dan setelah gw audit ulang source code StressLab, gw menemukan satu kelemahan yang lebih fundamental dari hasil sebelumnya.** Stack NUI yang kita bahas masih layak, tetapi belum cukup terbukti untuk langsung dipasang sebagai sistem finger tracking utama Sketchbook Universe.

Gue paham kenapa lu merasa waktunya terbuang. Lu sudah mengembangkan UI dan gameplay, tetapi baru menemukan bahwa komponen input paling penting belum stabil. Itu memang urutan pengerjaan yang kurang ideal. Namun, pekerjaan UI sebelumnya tidak otomatis sia-sia. Sekarang prioritasnya harus dibalik, **buktikan interaksi kamera lebih dulu, baru lanjut polishing UI**\.

## 1. Temuan audit ulang yang paling penting

Gw membuka ulang ZIP StressLab tanggal 14 November dan menjalankan kembali unit test-nya. Hasilnya tetap 7 dari 7 PASS.

Tapi ketika gw periksa implementasinya, ada masalah ini.

- Rig menghasilkan 21 landmark, tetapi algoritma `SafeStroke` yang diuji **hanya menerima koordinat ujung jari**, bukan keseluruhan 21 landmark.
- Belum ada pemeriksaan anatomi tangan untuk membedakan landmark asli dan salah deteksi.
- Belum ada *hand identity lock* yang benar-benar mengidentifikasi dan mempertahankan tangan target.
- Deteksi palsu disimulasikan dengan koordinat buatan, bukan dihasilkan oleh model MediaPipe yang membaca gambar.
- Unit test memeriksa hal-hal dasar seperti filter, putusnya coretan, dan lompatan koordinat, bukan keberhasilan deteksi tangan di depan wajah.

Jadi **51.000 frame sintetis itu membuktikan sebagian logika simulasi berjalan, bukan membuktikan engine MediaPipe tahan 51.000 frame worst-case.**

**Kondisi aktual eksperimen** (Belum lolos validasi kamera)

| Rig 21 titik dan simulasi | Dijalankan |
|--------|--------|
| Filter One Euro dan Stroke Guard dasar | Diuji sintetis |
| Hand identity lock 21 landmark | Belum diuji |
| MediaPipe pada video kamera nyata | Belum diuji |
| Performa web dengan gameplay aktif | Belum diuji |

Yang paling mengkhawatirkan adalah hasil **184 dari 284 false detection yang tetap lolos pada simulasi tangan di depan wajah**, sekitar 64,8%.

Itu bukan false-positive rate MediaPipe, melainkan rasio lolosnya observasi palsu yang sengaja disuntikkan ke pipeline. Tetapi hasilnya tetap cukup untuk menunjukkan bahwa logika pengamanan saat ini belum memadai.

## 2. Lima gap yang paling mungkin muncul ketika lu tes sendiri

(P0)

**Tangan melewati wajah, tracking tertukar atau hilang**

Ini bukan kasus langka. Ada laporan GitHub MediaPipe tentang tracking yang hilang ketika tangan mendekati wajah. Salah satu pengembang menjelaskan bahwa kemiripan warna kulit tangan dan wajah memang menyulitkan palm detection. Laporan itu berasal dari 2020, sehingga bukan bukti performa versi terbaru.  [GitHub](https://github.com/google-ai-edge/mediapipe/issues/614?utm_source=chatgpt.com)

Solusi yang perlu diuji adalah konsistensi 21 landmark, prediksi lokasi ROI berdasarkan riwayat tangan, dan validasi ulang ketika tangan muncul kembali. Jangan langsung mengunci area wajah sebagai wilayah terlarang.

---

(P0)

**Gestur palsu bisa menghasilkan coretan atau perintah salah**

Filter koordinat tidak memahami maksud gesture. Bahkan tracking yang relatif stabil bisa salah mengenali keadaan pena, atau satu gerakan memicu dua aksi.

Kita perlu *gesture hysteresis*, pemisahan mode DRAW/PROBE/PLACE/PLAY, serta aturan bahwa kehilangan tracking otomatis menghentikan coretan. Mapping gesture yang sudah dipilih jangan diganti tanpa pengujian.

---

(P1)

**Smoothing memperhalus garis tetapi mengorbankan respons**

One Euro Filter dapat mengurangi jitter, namun parameter yang terlalu agresif bisa membulatkan sudut gambar dan membuat kursor tertinggal.

Harus diukur pada gambar lurus, zigzag, lingkaran, perubahan arah cepat, dan gestur berhenti mendadak. Gunakan timestamp frame asli, bukan mengasumsikan FPS selalu tetap.

---

(P1)

**Kamera siswa dan pencahayaan tidak konsisten**

Webcam ASUS lu belum mewakili perangkat siswa. Bahkan penelitian yang membandingkan MediaPipe, OpenPose, dan model lain menemukan degradasi serius akibat motion blur, occlusion, dan variasi pencahayaan.  [IEEE Xplore](https://ieeexplore.ieee.org/abstract/document/10190429?utm_source=chatgpt.com)

Karena itu, perlu pengujian perangkat low-end, cahaya redup, backlight, auto-exposure, dan kamera yang menghasilkan FPS tidak stabil.

---

(P1)

**Browser melambat saat game dan kamera aktif bersamaan**

`detectForVideo()` di MediaPipe Web bersifat sinkron. Jika dijalankan di main thread, inference dapat mengganggu rendering. Web Worker menjadi opsi, tetapi jalur pemindahan frame dan dukungan GPU/browser harus benar-benar diuji.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js?authuser=01&utm_source=chatgpt.com)

Tes terpisah MediaPipe yang lancar belum membuktikan MediaPipe plus animasi Momo, Canvas, dan gameplay akan lancar.

Ada satu keterbatasan tambahan. Output standar Hand Landmarker menyediakan koordinat 21 landmark dan informasi handedness, tetapi bukan confidence yang terkalibrasi untuk setiap ujung jari. Jadi kita tidak bisa menganggap semua titik sama-sama dapat dipercaya hanya karena tangan terdeteksi.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?utm_source=chatgpt.com)

## 3. Apakah stack di bawah 50 MB realistis?

**Ya, target di bawah 50 MB realistis untuk dipertahankan sebagai batas desain. Tetapi angka 16–21 MB kemarin adalah perkiraan aset NUI, bukan ukuran build produksi yang sudah terukur.**

Setelah cek ulang sumber file, ukurannya kira-kira sebagai berikut.

| Komponen | Ukuran sumber |
|--------|--------|
| MediaPipe Hand Landmarker `.task` | 7,82 MB  [Leo-TX/mediapipe-hand at main](https://huggingface.co/Leo-TX/mediapipe-hand/blob/main/hand_landmarker.task?utm_source=chatgpt.com) |
| WASM SIMD, salah satu versi paket | 8,91 MB  [UNPKG](https://app.unpkg.com/%40mediapipe/tasks-vision%400.10.7/files/wasm/vision_wasm_internal.wasm?utm_source=chatgpt.com) |
| WASM non-SIMD, versi lain | 10,6 MB  [UNPKG](https://app.unpkg.com/%40mediapipe/tasks-vision%400.10.32/files/wasm/vision_wasm_nosimd_internal.wasm?utm_source=chatgpt.com) |
| Hand lock, filter, gesture, stroke guard | Belum diukur setelah build |
| Aset game dan model klasifikasi | Belum diukur |

WASM SIMD dan non-SIMD merupakan alternatif runtime, bukan otomatis dua file yang semuanya perlu diunduh. Ukuran aktual tergantung versi dan cara packaging.

Usulan alokasi budget unduhan awal

NUI

## 23 MB

App + aset

## 22 MB

Cadangan

## 5 MB

---

**Batas target total**

# 50 MB

Ini anggaran engineering yang diusulkan, bukan pengukuran bundle. Termasuk penghitungan semua request aset pada kunjungan pertama, bukan sekadar ukuran file JavaScript utama.

Model klasifikasi milik partner, aset gameplay, animasi, dan font harus masuk anggaran tersebut. Kalau ternyata melewati batas, solusinya bukan langsung mengurangi kualitas tracking. Lebih aman melakukan lazy loading berdasarkan tahapan game, kompresi aset visual, dan caching file model dengan versi tetap.

Dan ada perbedaan penting antara **ukuran download dan konsumsi RAM**\. Aplikasi 20 MB bisa memakai memori jauh lebih besar saat kamera, WASM, dan tekstur GPU aktif.

## 4. Yang harus lolos sebelum NUI dianggap siap

Gw akan menjadikan hasil uji kamera nyata sebagai syarat penerimaan, bukan banyaknya unit test sintetis.

| Metrik penerimaan | Target awal untuk diuji |
|--------|--------|
| Coretan palsu saat tidak ada tangan | 0 dalam sesi pengujian 5 menit |
| Coretan liar setelah tracking hilang | 0 |
| Respons kursor saat menggambar | p95 di bawah 80 ms |
| Pemulihan tracking | Diukur dan dibandingkan pada semua perangkat |
| Hand crossing face | Tidak berpindah ke tangan atau objek palsu |
| Perangkat low-end | Tetap bisa menggambar tanpa freezing panjang |
| Cold download | Tidak melebihi 50 MB |

Target di atas adalah kriteria prototype usulan, bukan standar baku atau capaian yang sudah terukur. Nilai akhirnya harus mempertimbangkan hasil percobaan siswa.

Gw juga tidak akan langsung menambahkan face detector, segmentation, atau MediaPipe Holistic. Masing-masing membutuhkan komputasi tambahan. Holistic memang memiliki mekanisme pose-guided hand localization untuk mengurangi kekeliruan bagian tubuh, tetapi bukan berarti otomatis akan lebih akurat untuk Sketchbook Universe.  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/holistic.md?plain=1&utm_source=chatgpt.com)

## 5. Urutan yang sekarang paling masuk akal

Gw sarankan kita menghentikan dulu revisi visual yang tidak mendesak dan memusatkan pekerjaan pada satu *vertical slice* interaksi.

1. **MediaPipe baseline di browser asli**
   
   Rekam dan ukur masalah yang sekarang lu alami pada ASUS tanpa filter tambahan.
2. **Tambah One Euro Filter dan Stroke Guard**
   
   Bandingkan video yang sama, bukan mencoba kondisi berbeda lalu menebak mana lebih baik.
3. **Implementasi hand identity dan recovery yang sebenarnya**
   
   Gunakan 21 landmark, arah gerak, ukuran tangan, dan kesinambungan posisi. Uji khusus tangan melintas di depan wajah.
4. **Integrasikan dengan Canvas dan seluruh gesture NUI**
   
   Uji transisi menggambar, menghapus, memilih keputusan, sampai kontrol gameplay dengan input kamera.
5. **Benchmark perangkat dan ukuran build**
   
   Periksa FPS, latency, false stroke, akurasi gesture, dan ukuran unduhan dengan cache kosong serta cache aktif.

Baru setelah baseline itu kita tahu apakah RTMPose perlu ditambahkan sebagai pembanding. **OpenPose server tetap tidak gw rekomendasikan untuk jalur real-time sekarang**, karena belum ada bukti dia memberi peningkatan yang sebanding dengan biaya dan latency-nya.

Ada satu hal yang gw ingin tekankan. Jangan menjadikan tujuan *anti-muka 100%* sebagai janji teknis. Dengan kamera RGB tunggal, tangan yang sepenuhnya tidak terlihat tidak bisa dipulihkan secara akurat hanya melalui filtering. Sistem harus tahu kapan berhenti menggambar, bukan terus menghasilkan koordinat seolah yakin.

Keputusan produk yang sudah ada, termasuk pilihan **Mouse &#124; Kamera**, tidak perlu dibuka ulang. Kualitas dan keterandalan jalur kamera yang harus dibuktikan.

**Langkah konkret sekarang\:** jadikan pengujian MediaPipe dengan webcam nyata sebagai blocker utama sebelum Ujang melakukan polishing UI berikutnya. Minta bukti video input, output landmark, garis Canvas, dan metrik latency dari build yang sama.

---

**Saran update WORKING\_STATE**

- **Yang berubah\:** TERBUKTI, audit ulang source StressLab dan 7 unit test PASS. TERBUKTI, `SafeStroke` saat ini hanya menggunakan koordinat ujung jari dan belum mengimplementasikan validasi 21 landmark atau hand identity lock. KATA-TOOL, anggaran download dan kriteria pengujian NUI baru.
- **Bagian terdampak\:** Eksperimen finger tracking, status kesiapan NUI, blocker pengujian kamera, serta packaging browser.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L2-M017 | User | 2026-11-14 20:14:27


message time: 2026-11-14 20:14:27

lu solve dah anti celah, gw tunggu. lakukan best practice pad worst case

---

---

## L2-M018 | Assistant | waktu tidak ada


Gw sudah bikin dan menjalankan **NUI Guard v0.1** untuk Sketchbook Universe. Fokusnya memperbaiki celah pada lapisan tracking dan keamanan coretan, bukan mengganti MediaPipe dengan OpenPose.

**Hasil pengujian baru** (10/10 unit test PASS)

TypeScript

## Compiled

Ukuran ZIP kode

## 6,4 KB

[Download NUI Guard v0.1 + source + tests + laporan](sandbox:/mnt/data/Sketchbook_Universe_NUI_Guard_v0.1_2026-11-14.zip)

### Yang sudah gw implementasikan

- Validasi 21 landmark, termasuk nilai tidak valid, geometri runtuh, dan confidence jika tersedia.
- Penghentian coretan saat tangan hilang, berpindah terlalu jauh, atau identitasnya berubah.
- Penolakan sementara ketika dua tangan terdeteksi dan identitas target ambigu.
- Recovery yang mensyaratkan beberapa frame stabil sebelum mulai menggambar lagi.
- One Euro Filter untuk koordinat kursor.
- Event terpisah untuk memulai, melanjutkan, dan menghentikan coretan.

Saat pengujian, gw juga menemukan bug pada penghitung frame acquisition. Bug itu sudah diperbaiki dan seluruh 10 tes dijalankan ulang hingga lulus.

### Tapi masih ada celah P0

**Gw belum bisa menyatakan sistem ini anti-wajah atau aman untuk seluruh worst-case.**

Masalah utamanya adalah deteksi palsu yang menghasilkan 21 landmark dengan geometri masuk akal masih bisa lolos. Filter tidak punya cara untuk memastikan landmark itu berasal dari tangan asli hanya berdasarkan koordinat.

Selain itu, pengenalan gesture, akurasi MediaPipe pada video nyata, FPS, latency, dan ukuran unduhan aplikasi belum diuji. ZIP 6,4 KB tadi hanya source guard, bukan ukuran runtime MediaPipe.

| Komponen | Status |
|--------|--------|
| MediaPipe Hand Landmarker | Tetap kandidat engine utama |
| NUI Guard v0.1 | Kode dibuat, tes sintetis lulus |
| One Euro Filter | Implementasi awal diuji |
| Gesture recognition | Belum terintegrasi |
| Anti-distraksi wajah | Belum terbukti |
| OpenPose server | Tidak direkomendasikan untuk jalur real-time |
| Total download di bawah 50 MB | Target, belum terukur |

**Langkah berikutnya yang wajib adalah menguji MediaPipe asli pada rekaman webcam**, terutama tangan melintas di depan wajah, tangan tertutup, low-light, dan gerakan menggambar cepat. Kita harus mengukur apakah guard mengurangi false stroke tanpa terlalu sering menolak tangan yang sebenarnya valid.

Gw nggak akan menyebutnya solusi tanpa celah sebelum pengujian tersebut lolos. Yang sekarang tersedia adalah fondasi kode yang bisa diuji dan dikembangkan, bukan sistem NUI siap produksi.

---

**Saran update WORKING\_STATE**

- **Yang berubah\:** TERBUKTI, source NUI Guard v0.1 dibuat, TypeScript berhasil dikompilasi, dan 10 unit test sintetis lulus. BELUM-TERBUKTI, ketahanan kamera nyata dan integrasi aplikasi.
- **Bagian terdampak\:** Eksperimen NUI, hand tracking, stroke safety, dan blocker pengujian webcam.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-14 20:16
- 📎 **Sketchbook_Universe_NUI_Guard_v0.1_2026-11-14.zip** · ZIP

---

---

## L2-M019 | User | 2026-11-14 20:38:45


message time: 2026-11-14 20:38:45

Guru amat gue mau lo jalankan celahnya itu harus bisa ditutup. Harus kelihatan pecelah. P0 harus bisa disolve. Lu research dimanapun itu di online, eh sorry, di online community, Reddit, GitHub, apapun yang based on community di ranah HCI kayak gini. Siapa tahu udah ada yang solve gitu

---

---

## L2-M020 | Assistant | waktu tidak ada


**Gw nemu akar P0-nya dari riset komunitas GitHub dan HCI. Masalah tangan yang hilang atau salah dikenali saat melewati wajah ternyata sudah pernah dilaporkan langsung ke pengembang MediaPipe.**

Di [MediaPipe Issue #614](https://github.com/google-ai-edge/mediapipe/issues/614), pengembang menjelaskan bahwa kemiripan warna kulit wajah dan telapak tangan menyulitkan palm detection. Memperbesar model berpotensi meningkatkan presisi, tetapi mengorbankan kecepatan.  [GitHub](https://github.com/google-ai-edge/mediapipe/issues/614?utm_source=chatgpt.com)

Ada temuan kedua yang lebih penting. [MediaPipe Issue #3008](https://github.com/google-ai-edge/mediapipe/issues/3008) menjelaskan bahwa model tetap memprediksi landmark meskipun sebagian tangan tertutup. Artinya, **21 titik yang terlihat masuk akal belum membuktikan bahwa seluruh jari benar-benar terlihat kamera.**  [GitHub](https://github.com/google-ai-edge/mediapipe/issues/3008?utm_source=chatgpt.com)

Jadi solusi P0 tidak cukup dengan memvalidasi 21 titik. Kita membutuhkan pengendalian kepercayaan terhadap hasil tracking dan mekanisme yang memastikan prediksi meragukan tidak berubah menjadi coretan.

## Solusi yang ditemukan dari komunitas dan riset HCI

| Pendekatan | Bukti | Keputusan teknis gw |
|--------|--------|--------|
| Hand continuity + occlusion-aware tracking | Penelitian *Hidden Hands* menggunakan kamera RGB tunggal dan data gerakan sebelumnya  [Open Access CVF](https://openaccess.thecvf.com/content_cvpr_2016_workshops/w21/html/Rangesh_Hidden_Hands_Tracking_CVPR_2016_paper.html?utm_source=chatgpt.com) | Diadopsi sebagai pendekatan |
| Pose-guided hand localization | MediaPipe Holistic memakai informasi tubuh untuk menjaga konsistensi identitas tangan  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/holistic.md?plain=1&utm_source=chatgpt.com) | Kandidat fallback, bukan runtime wajib |
| One Euro Filter | Diskusi pengembang AR di Reddit merekomendasikan filtering dan pemilihan joint yang stabil  [Reddit](https://www.reddit.com/r/Spectacles/comments/1hpcgpg?utm_source=chatgpt.com) | Dipertahankan |
| Face masking | Tidak ada bukti cukup bahwa masking wajah aman saat tangan menutup wajah | Tidak digunakan sebagai solusi utama |
| OpenPose server | Belum ada bukti mengatasi masalah ini lebih baik pada webcam pengguna | Tetap tidak digunakan |

Satu pelajaran dari penelitian *Hidden Hands* adalah mempertahankan riwayat identitas tangan selama occlusion, bukan sekadar memilih deteksi terdekat setiap frame. Tetapi metode penelitian tersebut belum otomatis tersedia sebagai komponen browser siap pakai.

## Implementasi tambahan yang gw kerjakan

Gw buat prototype **P0 Safety Layer** di atas NUI Guard sebelumnya, dan TypeScript berhasil dikompilasi.

[Download P0 Safety Prototype, source dan catatan batasan](sandbox:/mnt/data/Sketchbook_NUI_P0_Safety_Prototype_2026-11-14.zip)

Prototype ini menambahkan pemeriksaan perubahan bentuk tangan, kontinuitas gerakan, verifikasi beberapa frame setelah tracking hilang, serta penghentian pena ketika ada indikasi overlap wajah atau kualitas gambar buruk.

Namun ada batasan yang perlu gw tegaskan. **Ini belum menutup P0 secara menyeluruh.** Pemeriksaan overlap wajah masih membutuhkan detektor eksternal, dan tangan palsu yang konsisten selama beberapa frame masih bisa lolos. Prototype juga belum menjalankan inference MediaPipe atau benchmark webcam.

Pendekatan *fail-closed* membuat coretan dihentikan saat input meragukan. Itu mengurangi risiko coretan salah, tetapi dapat mengganggu siswa yang menggambar ketika tangannya benar-benar berada di depan wajah.

## Apa yang masih harus dibuktikan?

Gw membagi P0 menjadi dua sasaran berbeda.

- **P0 keselamatan interaksi\:** jangan membuat coretan atau menjalankan perintah ketika identitas tangan tidak dapat dipercaya. Ini bisa diperkuat lewat state machine, gesture gating, dan recovery.
- **P0 ketepatan persepsi\:** tetap menemukan tangan yang benar dalam kondisi gelap, blur, atau tertutup wajah. Ini memerlukan bukti dari model vision pada gambar nyata. Kode filtering saja tidak cukup.

Untuk sasaran kedua, kandidat yang paling relevan diuji berikutnya adalah **MediaPipe Hand Landmarker dibandingkan dengan MediaPipe Holistic**, karena Holistic menggunakan konteks tubuh untuk membantu konsistensi lokasi tangan. Tetapi Holistic juga lebih kompleks, dan belum ada bukti bahwa dia akan lebih baik pada perangkat lu.

**Verdict gw setelah riset komunitas\:** kita menemukan pendekatan yang dapat memperkecil risiko P0, bukan solusi yang sudah terbukti menghilangkannya. Mengklaim anti-wajah 100% sekarang justru akan menyesatkan pengujian PA.

Langkah engineering berikutnya harus berupa pengujian dua estimator pada video webcam yang identik, khususnya saat tangan menutupi wajah. Dari sana kita bisa menentukan apakah perlu estimator tambahan atau cukup memperbaiki jalur MediaPipe lokal.

---

**Saran update WORKING\_STATE**

- **Yang berubah\:** TERBUKTI, source P0 Safety Prototype dibuat dan TypeScript berhasil dikompilasi. KATA-TOOL, temuan komunitas tentang occlusion, temporal tracking, dan pose-guided localization. BELUM-TERBUKTI, keberhasilan menghilangkan false detection wajah.
- **Bagian terdampak\:** NUI, recovery tracking, riset HCI, dan blocker validasi kamera nyata.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-14 20:38
- 📎 **Sketchbook_NUI_P0_Safety_Prototype_2026-11-14.zip** · ZIP

---

---

## L2-M021 | User | 2026-11-14 20:56:27


message time: 2026-11-14 20:56:27

yaudah buruan kerjakan

---

---

## L2-M022 | Assistant | waktu tidak ada


Gw sudah lanjutkan implementasinya menjadi **NUI P0 Guard v0.2**, lengkap dengan source TypeScript, pengujian adversarial, dan halaman pengujian MediaPipe menggunakan webcam asli.

[Download NUI P0 Guard v0.2 + Camera Test Harness](sandbox:/mnt/data/Sketchbook_NUI_P0_Guard_v0.2_CameraHarness_2026-11-14.zip)

**Hasil eksekusi** (13/13 tes PASS)

TypeScript

## Compiled

ZIP paket

## 10 KB

Pengujian yang lulus adalah tes sequence sintetis. Halaman webcam sudah dibuat, tetapi belum dijalankan dengan kamera fisik.

### Perbaikan yang sudah dibuat

- Tracking hilang, pena langsung berhenti.
- Tracking kembali, pena tidak otomatis menggambar sebelum gesture dilepas dan diaktifkan lagi.
- Dua deteksi tangan sekaligus menghentikan input untuk menghindari perpindahan identitas.
- Perubahan bentuk tangan, perpindahan ujung jari, dan perubahan handedness diperiksa.
- Frame yang macet atau timestamp tidak valid menghentikan coretan.
- Event `strokeStart`, `strokeMove`, dan `strokeEnd` dipisahkan.

**Satu tes sengaja membuktikan celah yang masih ada.** Deteksi tangan palsu dengan 21 landmark yang konsisten masih bisa diterima sebagai tangan valid. Jadi P0 persepsi belum tertutup.

### Cara menjalankan pengujian kamera

Ekstrak ZIP, buka terminal di folder `browser`, kemudian jalankan\:

```bash
python3 -m http.server 8000
```

Buka `http://localhost:8000`, tekan **Start camera**, lalu uji tangan melintasi wajah, kondisi gelap, gerakan cepat, dan dua tangan. Tombol **Export log JSON** menyimpan hasil diagnostik untuk dianalisis.

Halaman tersebut menggunakan MediaPipe asli, tetapi belum menyertakan deteksi wajah independen, pengenalan gesture jari, atau perbandingan Holistic. Karena itu, keberhasilan pada halaman tersebut belum cukup untuk menyatakan masalah anti-wajah selesai.

**Statusnya sekarang adalah guard yang lebih ketat dan harness pengujian kamera yang siap dicoba, bukan P0 yang sudah terselesaikan.** Langkah paling penting berikutnya adalah menjalankan harness pada webcam ASUS lu dan memeriksa log saat tangan menutupi wajah.

---

**Saran update WORKING\_STATE**

- **Yang berubah\:** TERBUKTI, NUI Guard v0.2 dibuat, TypeScript dikompilasi, 13 tes sintetis lulus, dan browser camera harness dikemas. BELUM-TERBUKTI, performa webcam dan ketahanan terhadap false detection wajah.
- **Bagian terdampak\:** NUI, pengujian kamera, stroke safety, dan validasi runtime.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-14 20:58
- 📎 **Sketchbook_NUI_P0_Guard_v0.2_CameraHarness_2026-11-14.zip** · ZIP

---

---

## L2-M023 | User | 2026-11-14 21:25:21


message time: 2026-11-14 21:25:21

jangan buru2 kl ngerjain cok cari lah berselancar di internet tentang hci, emang ini solusi engineer tp agak susah sih cam biasa

---

---

## L2-M024 | Assistant | waktu tidak ada


**Lu benar soal pendekatannya. Gw terlalu cepat bikin guard dan menambah aturan filtering, padahal persoalan utamanya belum gw bedah sebagai masalah HCI dengan keterbatasan kamera RGB biasa.**

Ada perbedaan antara *tracking yang akurat* dan *interaksi yang tetap bisa dipakai ketika tracking tidak akurat*\. Untuk Sketchbook Universe, kita butuh keduanya.

Gw juga perlu koreksi satu asumsi sebelumnya. **Menghentikan semua input setiap kali tangan melewati wajah belum tentu solusi HCI yang bagus.** Memang bisa mencegah coretan liar, tetapi kalau siswa sering kehilangan kontrol saat menggambar, sistem tetap gagal secara usability.

Dengan webcam laptop biasa, target desainnya harus realistis. Siswa bisa menggambar tanpa alat tambahan, tidak perlu menjaga tangan pada posisi yang melelahkan, tidak sering melakukan kalibrasi ulang, dan mendapat feedback yang jelas saat sistem kehilangan tracking.

## Temuan yang lebih relevan dari komunitas

Gw menemukan diskusi Reddit Oktober 2026 tentang proyek MediaPipe untuk mengendalikan browser dan game. Pengembangnya menggunakan rekaman landmark untuk menguji threshold, debug panel, gesture relatif terhadap posisi awal, dan eksperimen kamera 480p/60fps. Ada juga tanggapan yang mendukung One Euro Filter untuk mengurangi efek kursor terasa mengambang.  [Reddit](https://www.reddit.com/r/computervision/comments/1x28vyp/making_mediapipe_hand_landmarks_stable_enough_to/?utm_source=chatgpt.com)

Ini lebih relevan dengan kebutuhan kita daripada sekadar membandingkan model AI berdasarkan akurasi dataset.

Temuan lain dari dokumentasi resmi MediaPipe menjelaskan bahwa sistemnya sudah memakai lokasi tangan pada frame sebelumnya untuk tracking, lalu melakukan deteksi ulang ketika kehilangan tangan. Jadi kalau kita membuat *hand lock*, kita harus menambahkan perlindungan identitas dan state interaksi, bukan menduplikasi tracking internal MediaPipe.  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md?utm_source=chatgpt.com)

## Pendekatan HCI yang menurut gw lebih tepat

| Masalah | Solusi interaksi yang perlu diuji |
|--------|--------|
| Tangan melewati wajah | Pena berhenti sementara ketika identitas atau posisi ujung jari meragukan, tanpa menghapus gambar |
| Jari bergetar | Adaptive smoothing, tetapi gerakan cepat tetap responsif |
| Siswa kelelahan mengangkat tangan | Area interaksi nyaman, posisi istirahat, dan sesi menggambar pendek |
| Tangan hilang lalu muncul | Kursor boleh kembali setelah stabil, tetapi stroke lama tidak otomatis tersambung |
| Gesture tidak sengaja aktif | Pemisahan gerakan mengarahkan kursor dan aksi yang benar-benar mengeksekusi perintah |
| Kamera buruk | Feedback kualitas tracking dan jalur Mouse sebagai alternatif yang sudah ada |

Yang paling penting adalah **memisahkan tiga hal yang sebelumnya kita campur**\.

1. *Hand detection* menentukan apakah tangan ditemukan.
2. *Hand tracking* memperkirakan posisi dan mempertahankan kontinuitasnya.
3. *Interaction intent* menentukan apakah siswa memang sedang ingin menggambar atau menjalankan perintah.

Deteksi tangan yang benar belum tentu berarti siswa ingin menggambar. Sebaliknya, saat deteksi gagal sesaat, sistem tidak harus kehilangan seluruh konteks interaksi.

### Soal kamera biasa

Gw tidak akan mengusulkan depth camera, sarung tangan sensor, atau GPU server sebagai syarat. Itu bertentangan dengan tujuan aksesibilitas Sketchbook Universe.

MediaPipe Holistic tetap layak menjadi pembanding karena menggunakan informasi pose tubuh untuk membantu pelokalan tangan. Namun, itu menambah pekerjaan inferensi dan belum terbukti lebih baik pada laptop lu.  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/holistic.md?plain=1&utm_source=chatgpt.com)

**Arah yang gw pilih untuk riset berikutnya adalah interaction-first, bukan filter-first.** Kita perlu membandingkan beberapa desain aktivasi pena, pemulihan tracking, dan feedback visual pada video webcam yang sama. Setelah itu baru menentukan perubahan algoritma yang benar-benar dibutuhkan.

Gw juga tidak akan mengklaim P0 sudah tertutup. Dari sumber komunitas yang diperiksa, belum ditemukan solusi siap pakai yang menjamin tracking jari akurat saat tertutup wajah menggunakan satu webcam RGB biasa.

Langkah konkretnya adalah membuat protokol pengujian HCI berbasis tugas menggambar, lalu membandingkan kondisi tanpa guard, guard yang sudah dibuat, dan rancangan interaksi yang lebih toleran terhadap tracking loss. **Jangan tambah modul baru sebelum kita punya bukti bahwa perubahan itu memperbaiki pengalaman menggambar, bukan cuma angka filter.**

---

**Saran update WORKING\_STATE**

- **Yang berubah\:** KATA-TOOL, hasil riset komunitas tentang tracking wajah, pengujian landmark rekaman, dan pendekatan interaction-first. BELUM-TERBUKTI, efektivitas rancangan HCI pada siswa dan webcam nyata.
- **Bagian terdampak\:** Riset NUI, protokol usability, prioritas pengujian kamera, dan evaluasi guard.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L2-M025 | User | 2026-11-14 21:26:41


message time: 2026-11-14 21:26:41

cepet amat jancok reasoning yg bener cari riset yg bener riset mendalam. bikin plan dulu lengkap pake md sebelum gw kasih nyala ini plugin deep research. ada yang ditanyain jg ga silakan

---

---
