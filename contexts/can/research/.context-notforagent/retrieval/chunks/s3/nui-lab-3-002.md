# NUI Lab 3 | pesan 8-15

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afacbc9-6d4c-83ec-bf1a-02c09c6d5c15
> Source Git blob: f8a59b5787461c4c113edb821fc7d16a53a31fcb

## L3-M008 | Assistant | waktu tidak ada


Dari konteks Sketchbook Universe, masalah lu sekarang bukan sekadar memilih model. Ada dua kegagalan yang berbeda, garis gambar gemeter dan tangan kehilangan tracking saat dekat wajah. Gue bakal pisahkan solusinya, lalu cek keputusan proyek supaya usulannya nggak mengubah flow yang sudah dikunci.

**Bisa diterapkan di Sketchbook Universe, tapi setelah memahami masalah kamera yang lu alami, gw justru nggak merekomendasikan OpenPose server sebagai solusi utama. Gw lebih memilih memperbaiki tracking MediaPipe dan pemrosesan input gambar di client-side terlebih dahulu.**

Alasannya, proyek lu bukan cuma mendeteksi gestur. Siswa SMP kelas 7–9 harus bisa menggambar menggunakan ujung jari, menghapus, memilih keputusan AI, sampai berinteraksi dengan gameplay 2D. Semuanya membutuhkan respons yang konsisten, bahkan ketika kamera laptop siswa kurang bagus.

Dari percobaan lu di laptop ASUS gaming, ada dua masalah berbeda.

1. **Jitter saat menggambar.** Ujung jari terdeteksi, tetapi koordinatnya bergeser-geser sehingga garis bergetar. Penyebabnya bisa noise kamera, landmark yang tidak stabil, atau tremor tangan alami.
2. **Tracking hilang saat tangan mendekati wajah.** Ini bisa disebabkan occlusion, kemiripan warna kulit, perubahan orientasi tangan, atau kegagalan detector menemukan kembali telapak tangan. Belum tentu MediaPipe benar-benar mengira wajah lu sebagai tangan.

Keduanya perlu solusi berbeda. Mengganti model belum tentu menyelesaikan salah satunya.

## 1. Apakah internet pengguna berpengaruh?

| Proses | Bergantung pada internet selama interaksi? |
|--------|--------|
| Kamera melalui browser | Tidak |
| MediaPipe inference lokal | Tidak, setelah aset model tersedia |
| Smoothing dan menggambar | Tidak |
| Klasifikasi sketsa | Tergantung implementasi model partner |
| OpenPose di server | Ya, jika server berada di jaringan lain |
| Logging ke backend | Ya, untuk pengiriman ke server |

Kalau siswa menggunakan Wi-Fi sekolah yang tidak stabil, OpenPose server bisa menghasilkan koreksi terlambat atau gagal diterima.

**Target arsitektur yang gw sarankan adalah finger tracking dan semua kontrol langsung tetap bisa berjalan lokal tanpa menunggu jaringan.** Ini tidak otomatis berarti seluruh Sketchbook Universe sudah mendukung offline, karena jalur klasifikasi dan logging partner harus diperiksa terpisah.

## 2. Arsitektur yang paling masuk akal

**Kamera RGB siswa**

Resolusi dan FPS adaptif sesuai kemampuan perangkat

**Browser lokal** (Jalur utama)

**Backend Sketchbook Universe**

Klasifikasi sketsa, logging, dan jika diperlukan pengujian estimator tambahan. Bukan pengendali langsung kursor.

### A. Mengatasi gambar yang gemeter

Gw sarankan **One Euro Filter** untuk menstabilkan koordinat jari sebelum dipakai Canvas.

Filter ini adaptif. Ketika jari bergerak pelan, noise dikurangi lebih kuat. Ketika jari bergerak cepat, filtering dilonggarkan agar gerakan tetap responsif. Metode ini memang dirancang untuk menyeimbangkan jitter dan latency pada interaksi manusia-komputer.  [direction.bordeaux.inria.fr](https://direction.bordeaux.inria.fr/~roussel/publications/2012-CHI-one-euro-filter.pdf?utm_source=chatgpt.com)

Contoh ilustrasinya seperti ini.

Sebelum filtering

Landmark dengan noise

Setelah filtering

```svg
<svg viewBox="0 0 160 120" width="100%" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="160" height="120" rx="9" fill="#f8f6ef" /><path d="M8 76 C30 74 42 72 57 66 S87 59 104 50 S138 36 153 29" fill="none" stroke="#278b70" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" /><circle cx="153" cy="29" r="4" fill="#278b70" /></svg>
```

Gerakan lebih stabil

Ilustrasi konseptual, bukan hasil pengukuran dari webcam lu.

Tapi filter saja tidak cukup. Harus ada pemisahan antara **gerakan kursor, gestur Coret, dan status pena aktif**\. Ketika tracking hilang, sistem jangan menyambungkan koordinat lama ke koordinat baru. Itu bisa menghasilkan garis panjang yang tidak sengaja digambar siswa.

### B. Mengatasi tangan yang tertutup wajah

Ini bagian yang lebih rumit.

MediaPipe Hand Landmarker menggunakan palm detector dan hand landmark model. Dalam mode video, lokasi tangan dari frame sebelumnya digunakan untuk membantu tracking frame berikutnya. Jika tracking gagal, palm detection dipanggil kembali.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?utm_source=chatgpt.com)

Jadi gw menyarankan tiga mekanisme tambahan.

1. **Hand continuity.** Pertahankan identitas tangan berdasarkan posisi sebelumnya, skala, orientasi, dan pola geraknya. Jangan langsung menerima kandidat tangan baru yang tiba-tiba melompat jauh.
2. **Occlusion recovery.** Ketika landmark hilang sebentar, tahan tampilan kursor dan angkat pena secara logis. Setelah tangan ditemukan kembali, validasi kestabilannya sebelum mengizinkan coretan baru.
3. **ROI-aware reacquisition.** Eksperimen dengan area pencarian di sekitar lokasi tangan terakhir, lalu perluas kembali ketika tidak ditemukan. Ini butuh integrasi khusus dan tidak otomatis tersedia sebagai pengaturan standar MediaPipe Web.

Gw **tidak menyarankan langsung memakai face masking** untuk menghilangkan wajah dari gambar. Kalau tangan sedang berada di depan muka, mask wajah yang agresif justru bisa menghapus sebagian tangan. Ini perlu diuji, bukan diasumsikan membantu.

Dan ada batas fisiknya. Kalau wajah benar-benar menutupi ujung jari dari sudut pandang kamera, tidak ada algoritma berbasis satu kamera RGB yang bisa menjamin koordinat jari itu tetap akurat.

### C. Menyesuaikan kemampuan kamera siswa

Daripada mengunci semua siswa ke 1080p, gunakan pendekatan *adaptive camera profile*\.

| Profil pengujian | Konfigurasi awal |
|--------|--------|
| Kamera low-end | 640×480, target 30 FPS |
| Kamera standar | 1280×720, target 30 FPS |
| Perangkat lambat | Kurangi resolusi atau frekuensi inference |
| Low-light | Uji exposure, noise dan preprocessing selektif |

Angka itu parameter awal pengujian, bukan jaminan performa. Perangkat bisa saja tidak memenuhi FPS yang diminta.

Untuk browser, penting juga memastikan MediaPipe tidak membuat UI tersendat. Dokumentasi Google mencatat bahwa `detectForVideo()` bersifat sinkron dan bisa memblokir main thread. Memisahkan inference ke Web Worker, selama didukung konfigurasi yang dipakai, adalah salah satu langkah optimasi.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js?authuser=01&utm_source=chatgpt.com)

## 3. Pengujian yang perlu lu kerjakan sekarang

Sebelum mengintegrasikan OpenPose, gw akan menjalankan satu benchmark lokal pada laptop ASUS lu.

| Skenario | Apa yang diperiksa |
|--------|--------|
| Jari diam selama 10 detik | Jitter landmark mentah vs hasil filter |
| Gambar garis lurus dan lingkaran | Deviasi garis, respons dan keterlambatan |
| Tangan bergerak melewati wajah | Tracking loss, false detection, waktu reacquisition |
| Ruangan terang dan redup | Detection rate, FPS dan kestabilan |
| Gesture Coret, Hapus, Undo, Redo | Salah aktivasi dan keberhasilan pengenalan |

Durasi 10 detik hanya parameter benchmark awal. Simpan video pengujian secara lokal dengan persetujuan subjek dan pisahkan dari logging siswa.

Yang perlu dicatat bukan cuma FPS, tetapi juga **jitter dalam piksel, persentase frame kehilangan tracking, waktu pemulihan, dan error gestur**\. Dari situ baru bisa diputuskan apakah masalah sebenarnya ada pada model, kamera, filtering, atau state machine.

## Verdict buat Sketchbook Universe

**MediaPipe tetap engine utama. OpenPose jangan dulu masuk ke jalur gambar real-time.**

Kalau setelah optimasi lokal masih bermasalah, RTMPose dan OpenPose bisa dibandingkan menggunakan rekaman pengujian yang sama. OpenPose mungkin berguna sebagai estimator pembanding di server, tetapi belum ada bukti bahwa dia akan mengatasi masalah wajah dan jitter yang lu alami.

Prioritas sekarang adalah membuat interaksi kamera tahan terhadap variasi perangkat, menjaga coretan siswa tidak rusak ketika tracking hilang, dan mempertahankan semua gestur berbasis tangan yang sudah menjadi arah interaksi proyek.

**Saran update WORKING\_STATE**

- **Yang berubah\:** FAKTA-USER, pengujian kamera ASUS gaming menunjukkan jitter saat menggambar dan tracking loss saat tangan mendekati wajah. Rekomendasi arsitektur lokal, filtering dan recovery masih KATA-TOOL, belum diimplementasikan atau diuji.
- **Bagian terdampak\:** Status integrasi NUI MediaPipe, pengujian kamera fisik, serta blocker kualitas input Canvas.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L3-M009 | User | 2026-11-14 10:45:42


message time: 2026-11-14 10:45:42

gw mau lu cari sendiri lu uji sendiri pake karakter rigging gitu cari juga di internet lah pokoknya tes dengan segala worst case dan harus deteksi fokus banget ke tangan hanya dengan kamera

---

---

## L3-M010 | Assistant | waktu tidak ada


Gw bakal kerjain dua jalur. Pertama, riset metode hand tracking dan dataset untuk kondisi ekstrem. Kedua, bikin benchmark yang bisa dijalankan di environment gw, pakai tangan berartikulasi dengan variasi cahaya, wajah, occlusion, dan gerakan. Gw bakal pisahkan hasil tes sungguhan dari simulasi, karena environment gw belum tentu punya webcam atau GPU seperti perangkat siswa.

Gw sudah cek sumber teknis dan menemukan jalur yang lebih cocok daripada OpenPose server. MediaPipe punya parameter untuk mengatur kapan palm detector dipanggil ulang, dan RTMPose punya model hand-only sebagai pembanding. Untuk tes lokal, environment gw ternyata tidak punya webcam, GPU, atau paket model MediaPipe, dan unduhan model juga gagal. Jadi gw akan menguji **rig artikulasi dan logika recovery/smoothing** secara nyata, tetapi tidak akan menyebutnya benchmark akurasi MediaPipe.

Stress test-nya sudah gw perluas menjadi **51.000 frame sintetis dalam 17 skenario**, dan 7 unit test lolos. Hasil yang paling penting justru kegagalannya: pada simulasi tangan di depan wajah, 184 dari 284 deteksi palsu masih lolos filter. Paket berisi video rig, ground truth, hasil CSV, kode pengujian, dan laporan sudah gw verifikasi.

**Gw sudah menjalankan stress test awal memakai rig tangan berartikulasi 21 titik, dan hasilnya menunjukkan bahwa smoothing saja tidak cukup.** Kita juga perlu mekanisme yang menolak deteksi mencurigakan dan memutus coretan saat tangan hilang.

Tes awal mencakup 15 skenario, masing-masing 5 seed dan 150 frame, sehingga totalnya **11.250 frame simulasi**\.

Ini pengujian kode tracking dan stroke recovery dengan landmark yang sengaja diberi noise, dropout, serta false detection. Bukan pengukuran akurasi MediaPipe atau OpenPose. Bentuk tangan dan wajah yang dirender masih karakter sintetis sederhana, bukan rekaman webcam sungguhan.

Temuan penting dari percobaan pertama adalah jalur stroke aman berhasil mencegah segmen garis lebih dari 60 piksel dalam simulasi, tetapi masih menerima sebagian deteksi salah ketika tangan berdekatan dengan wajah. Jadi, **filter temporal dan pemeriksaan lompatan koordinat belum cukup untuk menjamin sistem benar-benar fokus pada tangan**\.

## Hasil stress test setelah diperluas

Frame sintetis

# 51.000

Skenario uji

# 17

Unit test lulus

# 7/7

Hasil ini hanya mengukur pipeline simulasi. Tidak ada inferensi model MediaPipe, OpenPose, atau RTMPose yang berhasil dieksekusi di environment ini.

| Kasus | Hasil simulasi | Penilaian |
|--------|--------|--------|
| Jitter saat jari diam | Error mentah 6,76 px, output terfilter 2,83 px | Filtering menjanjikan |
| Tangan depan wajah | 184 dari 284 deteksi palsu masih lolos | Belum aman |
| Tangan lain masuk frame | 226 dari 550 deteksi palsu masih lolos | Belum aman |
| Low-light | Cakupan simulasi 73,3% | Belum bisa disimpulkan untuk kamera nyata |
| Extreme darkness | Cakupan simulasi 11,9% | Recovery menjadi sangat terbatas |

Perbandingan error jitter di atas memakai sampel yang tidak sepenuhnya sama karena gate membuang sebagian frame. Jadi persentase peningkatan akurasi model belum boleh disimpulkan.

## File hasil pengujian

**Sketchbook Universe Hand Tracking StressLab**

ZIP, 6,2 MB • script Python, rig 21 joint, video sintetis, ground truth, CSV, unit test, dan runner MediaPipe

[Unduh seluruh paket pengujian](sandbox:/mnt/data/Sketchbook_Universe_Hand_Tracking_StressLab_2026-11-14.zip)

---

[Lihat preview 17 skenario rig](sandbox:/mnt/data/hand_tracking_stresslab/results/rigged_worst_cases.jpg)

[Lihat grafik jitter sebelum/sesudah](sandbox:/mnt/data/hand_tracking_stresslab/results/static_jitter_comparison.png)

[Baca laporan pengujian lengkap](sandbox:/mnt/data/hand_tracking_stresslab/HASIL_UJI_2026-11-14.md)

## Temuan riset yang menentukan arah engineering

Ada tiga sumber yang menurut gw layak dipakai untuk memperdalam benchmark berikutnya.

**[FreiHAND](https://lmb.informatik.uni-freiburg.de/resources/datasets/FreihandDataset.en.html)**

Dataset tangan RGB nyata dengan anotasi 21 keypoints. Cocok untuk mengukur ketepatan pose pada gambar, bukan langsung mengukur stabilitas video.  [lmb.informatik.uni-freiburg.de](https://lmb.informatik.uni-freiburg.de/resources/datasets/FreihandDataset.en.html?utm_source=chatgpt.com)

---

**[HaGRIDv2](https://github.com/hukenovs/hagrid)**

Mencakup beragam pencahayaan, latar, jarak kamera, dan kelas no-gesture. Berguna untuk menguji salah deteksi tangan dan gestur, tetapi bukan benchmark lengkap akurasi fingertip.  [GitHub](https://github.com/hukenovs/hagrid?utm_source=chatgpt.com)

---

**[AnyHand 2026](https://chen-si-cs.github.io/projects/AnyHand/)**

Dataset sintetis berbasis Blender dengan variasi pose, tekstur, pencahayaan, dan occlusion. Jauh lebih realistis dibanding rig sederhana yang gw buat.  [chen-si-cs.github.io](https://chen-si-cs.github.io/projects/AnyHand/?utm_source=chatgpt.com)

Ketiga sumber tersebut adalah bahan riset teknis dari internet, belum menjadi sitasi resmi proposal PA lu.

## Rekomendasi teknis untuk Sketchbook Universe

Gw sekarang lebih yakin bahwa kita harus menguji **hand identity lock berbasis 21 landmark**, bukan sekadar meningkatkan smoothing titik telunjuk.

Pipeline kandidatnya adalah MediaPipe lokal, pemeriksaan konsistensi bentuk dan posisi tangan, filtering adaptif, lalu state machine yang mengangkat pena saat tracking diragukan. Jangan otomatis menolak tangan di area wajah karena justru akan merusak interaksi saat tangan benar-benar melewati wajah.

MediaPipe menyediakan parameter detection, presence, dan tracking yang dapat dituning.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Python&utm_source=chatgpt.com) Kalau baseline itu masih gagal pada video nyata, RTMPose Hand menjadi pembanding berikutnya karena tersedia detektor dan pose khusus tangan.  [GitHub](https://github.com/Tau-J/rtmlib/blob/main/rtmlib/tools/solution/hand.py?utm_source=chatgpt.com)

**Batas yang tidak bisa dihilangkan\:** satu kamera RGB tidak dapat menjamin akurasi ujung jari yang sepenuhnya tertutup. Saat informasi visual hilang, perilaku yang benar untuk Canvas adalah menghentikan coretan sementara, bukan menebak posisi jari.

Jadi status pekerjaan sekarang adalah **stress test logika tracking sudah dijalankan, tetapi kemampuan deteksi tangan pada kamera nyata belum terverifikasi**\. Paket tersebut juga memuat runner MediaPipe untuk benchmark asli, namun runner itu sendiri belum bisa dieksekusi di environment gw karena paket dan modelnya tidak tersedia.

---

⚠️ Kandidat perubahan **keputusan** terdeteksi

- Ringkasan: Penegasan target interaksi yang hanya mengandalkan kamera RGB, berfokus pada tangan, dan harus diuji dalam kondisi ekstrem.
- Entri lama yang mungkin terdampak: MediaPipe/camera, NUI, dan desain interaksi Canvas.
- Status bukti: keputusan eksplisit untuk kebutuhan produk, belum ada bukti kemampuan tersebut tercapai.
- Tindakan: `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

**Saran update WORKING\_STATE**

- **Yang berubah\:** TERBUKTI, eksperimen sintetis 51.000 frame, 17 skenario, 7 unit test PASS, dan artefak benchmark dibuat. BELUM-TERBUKTI, ketepatan MediaPipe/OpenPose/RTMPose pada webcam nyata.
- **Bagian terdampak\:** Pengujian NUI/finger tracking, blocker kamera, riset hand-only detection, dan QA sintetis.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

![Mediapipe를 이용한 손 인식](https://images.openai.com/static-rsc-4/VoLe3ij_1jgXTDWDC6CoWt-bG8s5uZsHScE819d87Un_iwd4M1WTV_od6LLeyNedJoVedIktXplMuoaOWMkyzyd-FKrim0IDf1Pg_K-vjg0r_9vl0VsSryBjvH2IxMHNEf3I2n124Evdu2L4ot4_BD7VnmWGPWMX34zz1bSGg00i3cuHS1td4BBPquJWNTFW?purpose=fullsize)

![HaGRID - HAnd Gesture Recognition Image Dataset | DeepAI](https://images.openai.com/static-rsc-4/DsM3DOjQOYNKvQNndHNqoNZv6GHC6_C4pNIwJ6-TfS3cGslEW06Q0ORP4l-LXVxjYfdLQ213N3QpYTAfIXind6TRxzjMmV-USyvtIehFE6j6xULqIITEOtj7ml4rNJ1BNvEOcQgDLjhrzwu2NA1FGX_9Rqw2se67lyjYFQgOqVxhViPp2MESpUL2MgCn-4DE?purpose=fullsize)

![GitHub - DART2022/DART: DART: Articulated Hand Model with Diverse Accessories and Rich Textures (NeurIPS 2022 - Datasets and Benchmarks Track) · GitHub](https://images.openai.com/static-rsc-4/TR5qLms54TPVjbZrO1FCYcBbHX9wG0p89_JrtspN8akdf69mV7o51t9dX_Rxocrw2GzYlPlhQTJExqS1-y6tLsfqNvLvcKS_r-wIvzgFgsmkOehk40IdPkXa2Sa-ODFG4ULD7CuMIV0srvQFznAxp-OIe0uaSbJdXeS8vorHEQhF_uKxXd-wns5Kpk6Sikvk?purpose=fullsize)

📦 **Files delivered** · 2026-11-14 10:52
- 📎 **Sketchbook_Universe_Hand_Tracking_StressLab_2026-11-14.zip** · ZIP
- 📎 **rigged_worst_cases.jpg** · results · JPG
- 📎 **static_jitter_comparison.png** · results · PNG
- 📎 **HASIL_UJI_2026-11-14.md** · hand_tracking_stresslab · MD

---

---

## L3-M011 | User | 2026-11-14 11:47:35


message time: 2026-11-14 11:47:35

jadinya pake stack apa aja ini buat nui??? gajadi openpose? terus benchmark runtime nanti dipake terus user download berapa mbnya

---

---

## L3-M012 | Assistant | waktu tidak ada


Stack NUI-nya gw kunci sebagai rekomendasi dulu, bukan keputusan PA resmi. Gw cek ukuran model dan runtime browser yang benar-benar perlu diunduh pengguna, lalu pisahkan dari paket benchmark yang cuma dipakai saat development.

**Stack NUI yang gw rekomendasikan untuk Sketchbook Universe tetap MediaPipe Hands di client-side, tanpa OpenPose server.** Kita tambahkan lapisan stabilisasi, validasi tangan, dan recovery. Benchmark tetap dipakai selama development dan QA, **bukan ikut diunduh setiap siswa**\.

## 1. Stack NUI yang dipakai

**Webcam RGB**

getUserMedia + pengaturan kamera adaptif

**NUI Engine di Browser** (Rekomendasi)

**React + TypeScript + HTML Canvas**

Interaksi menggambar dan integrasi gameplay melalui input router yang ada

Komponen tambahan seperti Hand Identity Lock, One Euro Filter, dan Stroke Guard merupakan kode TypeScript ringan. Tidak membutuhkan model machine learning baru.

Untuk pengenalan gesture, gw memilih aturan geometri landmark dan state machine terlebih dahulu, bukan langsung menambahkan Gesture Recognizer model kedua. Pemetaan gesture yang sudah ditetapkan pada UI tutorial tetap dipertahankan. Akurasi aktualnya belum tervalidasi.

## 2. Jadi OpenPose benar-benar nggak dipakai?

**Untuk runtime siswa, nggak.**

| Teknologi | Status rekomendasi |
|--------|--------|
| MediaPipe Hand Landmarker | Engine utama |
| One Euro Filter | Dipakai sebagai kandidat stabilisasi |
| Hand Identity Lock | Dikembangkan dan diuji |
| Stroke Guard + Recovery | Prioritas tinggi |
| OpenPose | Tidak masuk runtime siswa |
| RTMPose Hand | Pembanding saat benchmark |
| StressLab + Playwright | Hanya development dan QA |

OpenPose bisa diuji sebagai pembanding offline, tetapi tidak perlu disiapkan sebagai backend aktif.

Alasannya sederhana. Kalau OpenPose tidak memberikan peningkatan akurasi yang terukur, kita hanya menambahkan beban GPU, internet, latency, dan kompleksitas deployment.

## 3. Berapa MB yang diunduh siswa?

Estimasi aset NUI untuk kunjungan pertama

# 16–21 MB

Perkiraan ukuran file mentah, bukan hasil pengukuran Network pada build Sketchbook Universe.

---

| Hand Landmarker model | 7,5–7,9 MB |
|--------|--------|
| MediaPipe WASM runtime | 8–11 MB |
| JS loader, filter dan gesture logic | Relatif kecil |
| StressLab / benchmark video | 0 MB |
| OpenPose | 0 MB |

Model resmi yang direplikasi pada repo Google berukuran sekitar 7,46 MB. Beberapa versi MediaPipe WASM berukuran sekitar 9–11 MB. Browser hanya perlu memuat varian WASM yang sesuai, bukan seluruh folder paket.  [GitHub](https://github.com/google-ai-edge/mediapipe-samples/blob/main/examples/hand_landmarker/ios/HandLandmarker/hand_landmarker.task?utm_source=chatgpt.com) [UNPKG](https://app.unpkg.com/%40mediapipe/tasks-vision%400.10.32/files/wasm/vision_wasm_nosimd_internal.wasm?utm_source=chatgpt.com) [tnr.co.id](https://tnr.co.id/node_modules/%40mediapipe/tasks-vision/wasm/?utm_source=chatgpt.com)

Ini **belum termasuk aset game, font, gambar Momo, React, KAPLAY, dan model klasifikasi partner**\. Jadi jangan menganggap 21 MB sebagai total ukuran aplikasi PA.

Nantinya kita bisa memakai HTTP caching atau service worker untuk menyimpan aset NUI setelah unduhan pertama. Selama cache masih tersedia dan versinya belum berubah, siswa tidak perlu mengunduh semuanya lagi.

Performa juga perlu dibedakan dari download. Model 8 MB tidak berarti hanya memakai RAM 8 MB. Ketika dijalankan, WASM, frame kamera, tekstur GPU, dan model membutuhkan memori tambahan.

## 4. Benchmark runtime dipakai terus nggak?

**Dipakai terus oleh developer untuk regresi, tetapi tidak terus berjalan di browser siswa.**

**Development dan CI**

StressLab sintetis, Playwright, virtual camera, video tangan nyata, dan tes kondisi worst-case dijalankan setiap ada perubahan penting pada NUI.

**Runtime siswa**

Hanya engine MediaPipe dan lapisan postprocessing. Monitoring ringan seperti FPS, tracking-lost count, dan latency boleh dihitung lokal tanpa menjalankan benchmark video penuh.

**Yang tidak ikut diunduh**

Dataset FreiHAND, HaGRID, rig sintetis, video stress test, OpenPose, RTMPose, dan seluruh file ground truth.

ZIP StressLab yang kemarin sekitar **6,2 MB** itu paket pengujian developer. Bukan dependency website.

## 5. Satu masalah yang masih belum terselesaikan

Pengujian kemarin menunjukkan **184 dari 284 false detection pada skenario tangan di depan wajah masih lolos filter**\.

Artinya, kita belum boleh menyebut pipeline ini sudah tahan distraksi.

Prioritas engineering berikutnya harus menguji hand identity dan reacquisition terhadap video kamera asli. Tujuannya bukan sekadar membuat garis lebih halus, tetapi memastikan tangan yang salah tidak diambil alih sebagai input menggambar.

**Kesimpulan pilihan stack gw sekarang adalah MediaPipe + TypeScript hand tracking safeguards + One Euro Filter + state machine, seluruhnya lokal.** Tidak perlu OpenPose dalam jalur produksi untuk saat ini. Ini rekomendasi arsitektur, bukan klaim implementasi yang sudah berhasil.

---

**Saran update WORKING\_STATE**

- **Yang berubah\:** KATA-TOOL, rekomendasi stack NUI lokal tanpa OpenPose server, beserta perkiraan aset NUI 16–21 MB. BELUM-TERBUKTI, ukuran build produksi, ketahanan tracking wajah, dan performa kamera siswa.
- **Bagian terdampak\:** Stack NUI, deployment web, strategi cache, benchmark dan QA.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L3-M013 | User | 2026-11-14 11:51:46


message time: 2026-11-14 11:51:46

itu bisa dibundle jadi satu ga nantinya di stack?

---

---

## L3-M014 | Assistant | waktu tidak ada


**Bisa banget. Seluruh stack NUI itu bisa kita bundle jadi satu modul internal `@sketchbook/nui`**, sehingga komponen lain di Sketchbook Universe cukup menggunakan satu API.

Tapi perlu dibedakan antara **satu modul** dan **satu file besar**\. Gw merekomendasikan satu modul dengan beberapa komponen internal agar tetap mudah dioptimasi dan dites.

## Struktur bundle yang gw sarankan

```text
@sketchbook/nui
├── core/
│   ├── mediapipe.ts          # Hand tracking
│   ├── hand-identity.ts      # Kunci target tangan
│   ├── one-euro-filter.ts    # Stabilisasi
│   ├── occlusion-recovery.ts # Pemulihan tracking
│   ├── stroke-guard.ts       # Cegah coretan liar
│   └── gesture-engine.ts     # Pengenalan gestur
├── worker/
│   └── tracking.worker.ts    # Inference bila kompatibel
├── adapters/
│   └── canvas-adapter.ts     # Integrasi canvas
└── index.ts                  # Public API
```

**Sketchbook Universe**

React, Canvas, Gameplay

\@sketchbook/nui

MediaPipe

Identity Lock

One Euro Filter

Stroke Guard

Gesture Engine

Recovery

**Output terstandarisasi**

Pointer, gesture, tracking status, stroke events

Pemakaian dari aplikasi bisa dibuat sesederhana ini.

```ts
import { createNUI } from "@sketchbook/nui";

const nui = await createNUI({
  camera: "adaptive",
  smoothing: "adaptive",
  handLock: true,
  strokeGuard: true,
});

nui.on("pointerMove", ({ x, y }) => {
  canvas.movePointer(x, y);
});

nui.on("strokeStart", () => canvas.beginStroke());
nui.on("strokeEnd", () => canvas.endStroke());
```

Contoh rancangan API, belum merupakan kode implementasi yang terverifikasi.

## Dampaknya terhadap download

Bundle ini tidak otomatis memperbesar ukuran unduhan. Kode filter dan state machine relatif kecil dibanding model MediaPipe dan runtime WASM.

Gw justru menyarankan **lazy loading**\.

- UI dan gameplay bisa dimuat terlebih dahulu.
- NUI dimuat ketika masuk onboarding kamera atau Drawing Canvas.
- Model MediaPipe dan WASM disimpan dalam cache setelah diunduh.
- StressLab, video benchmark, dan dataset tidak disertakan dalam production build.

Dengan begitu pengguna hanya mengunduh modul yang dibutuhkan. Estimasi sebelumnya sekitar 16–21 MB untuk aset NUI mentah masih perlu diverifikasi dari hasil build dan Network browser.

**Satu catatan penting\:** bundling tidak otomatis menyelesaikan jitter, occlusion, atau salah deteksi tangan. Itu tanggung jawab algoritma dan pengujian internal modul. Namun, arsitektur seperti ini membuat perbaikan NUI tidak perlu mengacak-acak kode Canvas dan gameplay.

Ini desain paket yang gw rekomendasikan, **belum keputusan stack resmi atau implementasi yang sudah berjalan**\. Sebelum dipakai, Ujang perlu memeriksa struktur repo dan build system aktual agar modul tidak menduplikasi dependency yang sudah ada.

---

**Saran update WORKING\_STATE**

- **Yang berubah\:** KATA-TOOL, rancangan bundling NUI menjadi satu modul internal dengan dependency MediaPipe, WASM dan komponen stabilisasi.
- **Bagian terdampak\:** Arsitektur frontend, packaging, lazy loading dan strategi caching.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L3-M015 | User | 2026-11-14 17:40:52


message time: 2026-11-14 17:40:52

Yakini itu dari hasil riset lu. Gue beneran pengen yang akurat, ya gue lihat sih, lo udah uji coba pakai rigging gitu lah ya. Terus biar anti kena muka gitu dan lain-lain. Kira-kira dari percobaan lo tadi, adakah celah yang ternyata pas gue cobain sendiri masih bisa nih? Ya memang ini tuh harus dicoba sendiri kan. Ini tahap uji coba harusnya, tapi gue melewatkan banyak waktu uji coba. Gue malah lempar ke Ujang tentang UI game dan lain-lain, padahal yang harus gue coba duluan adalah media pipe-nya. Tapi sedang udah deket baru gue malah, malah gue baru coba-coba tentang MediaPipe-nya. Kayak it's wasting time for me, sorry for myself. Sorry buat diri gue sendiri. Tapi ya gimana? Gue mau minta tolong lo tentang hal ini. Kira-kira adakah yang sangat-sangat visible? Kalau bisa ya download-nya enteng di bawah 50 MB bagi user. Dan dari benchmark lo cuma 21-an MB gitu. It's okay. Tapi adakah gap dari situ?

---

---
