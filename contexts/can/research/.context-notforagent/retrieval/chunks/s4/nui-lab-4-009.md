# NUI Lab 4 | pesan 83-86

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afb0520-54b0-83ec-b789-6680fdb7cb15
> Source Git blob: e04d43f2ce0067c893759488179e9a36c826be8a

## L4-M083 | Assistant | waktu tidak ada


Gw salah arah. Lu minta **riset dan diskusi teknis dulu**, bukan prompt buat Ujang atau keputusan implementasi. Gw bakal bedah kelayakan sistem yang lu bayangin dari riset dan source nyata, termasuk model yang bisa dilatih, dataset low-light, opsi arsitektur, dan peluang memenuhi batas download 15 MB. Gw belum akan mengarahkan eksekusi ke siapa pun.

Temuan riset yang mulai kelihatan justru penting buat target lu. **Training classifier gesture bisa dibuat jauh lebih kuat, tapi tidak otomatis menyelamatkan tangan yang gagal ditemukan MediaPipe saat gelap.** Selain itu, pipeline Model Maker Google membuang contoh gambar yang tidak berhasil dideteksi tangannya saat persiapan data. Jadi kalau kita mengandalkannya mentah-mentah, contoh low-light yang paling sulit malah bisa tidak ikut training. Gw lagi bandingkan jalur yang benar-benar bisa memperbaiki dua masalah itu tanpa membengkakkan runtime.

## 2. Temuan penting dari riset model dan dataset

### A. Google memang menyediakan custom Gesture Recognizer

Ini bukan sekadar teori. Dokumentasi dan source Google menyediakan jalur training classifier gesture berbasis *pretrained hand embedding*, kemudian mengekspor model ke format `.task` yang dapat dipakai MediaPipe.

Tetapi bagian palm detector dan hand landmark detector tetap memakai bobot pretrained. Artinya, jalur ini cocok untuk meningkatkan akurasi gesture, **bukan untuk melatih ulang kemampuan melihat tangan dalam gelap**\. Google juga menyatakan Model Maker masih tersedia tetapi sudah tidak aktif dipelihara.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/model_maker?utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/dataset.py?utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/gesture_recognizer.py?utm_source=chatgpt.com)

Ada masalah tersembunyi yang gw temukan di source training Google. Gambar yang gagal menghasilkan landmark **dibuang dari dataset training gesture**\. Jadi kalau kita memasukkan seribu gambar gelap dan ratusan tidak terdeteksi, model gesture tidak otomatis belajar dari ratusan kegagalan tersebut.  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/dataset.py?utm_source=chatgpt.com)

### B. Ada riset khusus untuk hand detection dalam cahaya ekstrem

Penelitian XPose: Towards Extreme Low Light Hand Pose Estimation memperkenalkan dataset **LLHands** dengan sekitar 120 ribu gambar dan anotasi pose tangan, menggunakan informasi pasangan kondisi gelap dan terang untuk membantu training. Hasilnya menunjukkan bahwa peningkatan low-light hand pose estimation memang memungkinkan lewat pendekatan visual dan training yang tepat.  [openaccess.thecvf.com](https://openaccess.thecvf.com/content/WACV2025/html/Rosh_XPose_Towards_Extreme_Low_Light_Hand_Pose_Estimation_WACV_2025_paper.html?utm_source=chatgpt.com)

Tetapi belum ada bukti dari riset tersebut bahwa hasil modelnya memenuhi batas 15 MB, kompatibel dengan MediaPipe Tasks di browser, atau lancar pada perangkat siswa. Ketersediaan dataset dan bobot siap pakainya juga belum gw verifikasi.

### C. Dataset Claude belum mewakili seluruh kebutuhan lu

Dari laporan R17 di repo utama\:

| Dataset | Sudah digunakan | Cocok untuk |
|--------|--------|--------|
| HaGRIDv2 landmark | Ya | Gesture statis, tiga/empat/lima jari, pose tangan biasa |
| IPN HandS temporal | Belum, unduhan landmark terblokir | Swipe dan transisi gesture |
| Rekaman webcam target | Belum ada pengujian yang tercatat | Near-pinch, low-light, backlight, false Hapus |
| LLHands dari XPose | Baru ditemukan dalam riset | Penelitian deteksi pose tangan pada cahaya ekstrem |

HaGRIDv2 sendiri mencakup variasi cahaya indoor dan kondisi dekat jendela, tetapi **dataset yang dipakai Claude adalah landmark hasil deteksi**, sehingga tidak melatih jaringan visual yang menghasilkan landmark itu.  [GitHub](https://github.com/hukenovs/hagrid/?utm_source=chatgpt.com)

Kesimpulan sementara, **kita perlu mengembangkan classifier dan ketahanan detektor sebagai dua eksperimen yang saling terhubung, bukan menjadikan semuanya satu proses retraining.**

## 3. Arsitektur mana yang paling cocok dengan target lu?

Setelah membandingkan jalur Google, hasil R17 Claude, alternatif hand-pose model, dan riset low-light, gw melihat empat pendekatan.

| Pendekatan | Akurasi gesture | Ketahanan low-light | Ukuran browser | Penilaian |
|--------|--------|--------|--------|--------|
| MediaPipe + heuristik sekarang | Masih ada salah baca | Bergantung pada MediaPipe | Baseline | Pembanding wajib |
| MediaPipe + MLP yang dilatih lebih lanjut | Berpotensi meningkat | Hanya jika landmark tersedia | Tambahan sangat kecil | **Kandidat paling kuat** |
| MediaPipe custom Gesture Recognizer | Berpotensi meningkat | Detektor tetap sama | Perlu ukur bundle baru | Layak dibandingkan |
| Detektor/landmark visual baru yang dilatih ulang | Bisa meningkatkan deteksi gelap | Potensinya lebih besar | Risiko ukuran dan komputasi | R&amp;D jangka lebih panjang |

Ada alternatif trainable seperti RTMPose-Hand, tetapi contoh implementasi LiteRT yang gw temukan memakai model FP16 sekitar **28 MB**, bahkan sebelum memperhitungkan kebutuhan mendeteksi posisi tangan dan runtime browser. Itu tidak cocok langsung dengan target ukuran lu.  [Hugging Face](https://huggingface.co/litert-community/RTMPose-Hand-LiteRT?utm_source=chatgpt.com)

Jadi membangun ulang seluruh pipeline visual belum tentu membuatnya lebih ringan ataupun lebih akurat.

### Arsitektur kandidat yang paling masuk akal

**Kamera siswa**

Preview tetap normal, tanpa mengubah tampilan siswa

**Adaptive image processing**

Pilih frame normal atau enhancement berdasarkan kondisi dan hasil evaluasi

**MediaPipe hand detection + 21 landmarks**

Tetap menjadi fondasi utama, dengan tracking dan fallback

**Classifier gesture khusus yang dilatih lebih lanjut**

Hard negatives, domain adaptation, confidence calibration

**Temporal recognition + safety gates**

Menentukan kapan gesture sudah cukup stabil untuk menghasilkan aksi

**Coret / Hapus / Undo / Redo**

Perubahan terpenting bukan menambahkan banyak model. Justru **satu detector yang efisien, satu classifier kecil yang kuat, dan satu mekanisme temporal yang aman**\.

## 4. Kenapa training Claude yang mencapai 0,987 belum cukup?

Ini bagian yang perlu gw tekankan.

Dalam laporan R17, MLP Claude memang jauh lebih baik daripada heuristik revisi pada data uji HaGRIDv2.

Heuristik revisi

# 0,782

Macro-F1 tujuh label

MLP Claude

# 0,987

Macro-F1 tujuh label

Tetapi sampelnya adalah **pose statis** yang sudah menghasilkan landmark. Tidak menguji tangan yang hilang dari tracking, perubahan pose ketika bergerak, near-pinch versus touch, atau kamera siswa dalam low-light.

Bahkan metrik *false Hapus* sebesar 0,04% pada dataset belum bisa diterjemahkan menjadi frekuensi kejadian saat siswa menggambar selama sepuluh menit.

Sumber auditnya ada di [R17 Classifier A/B Report](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md)\.

Agar classifier menjadi lebih kuat, gw melihat empat komponen training yang relevan secara teknis, bukan empat model berbeda.

**Pertama, hard-negative mining.** Model perlu lebih banyak contoh tangan biasa, pose antara tiga dan empat jari, tangan yang sedang bergerak, dan tangan yang hampir terbuka penuh. Ini penting karena kesalahan Hapus bisa menghilangkan pekerjaan siswa.

**Kedua, domain adaptation.** Model harus mengenali landmark dari kamera nyata yang berbeda dengan sumber HaGRID. Termasuk landmark yang jitter, berubah bentuk akibat orientasi, atau tidak stabil ketika pencahayaan turun.

**Ketiga, penolakan prediksi yang tidak aman.** Ketika bukti gesture belum cukup, sistem seharusnya tidak memaksakan aksi. Ini lebih penting untuk Hapus daripada sekadar menaikkan angka akurasi rata-rata.

**Keempat, temporal modeling.** Gerakan tangan membutuhkan informasi beberapa frame. Ini terutama relevan untuk swipe, transisi gesture, dan membedakan pinch yang baru mendekat dengan pinch yang sudah aktif.

Riset IEEE tahun 2026 mengenai continuous gesture spotting juga menunjukkan manfaat menggabungkan MediaPipe landmarks dengan model sekuens dan pemodelan probabilistik untuk menekan deteksi aksi palsu. Namun model dalam penelitian itu tidak otomatis cocok untuk ukuran dan runtime proyek lu.  [IEEE Xplore](https://ieeexplore.ieee.org/abstract/document/11536421?utm_source=chatgpt.com)

## 5. Low-light justru punya hambatan dataset yang berbeda

Source NUI Lab sekarang punya preprocessing CLAHE adaptif. Itu relevan sebagai eksperimen awal, tetapi **belum ada pengujian terukur yang menunjukkan pengurangan kegagalan deteksi webcam lu**\.

Selain itu, perekam RD-02 saat ini hanya menyimpan angka landmark dan label pengujian. Itu bagus untuk mengevaluasi classifier, tetapi tidak cukup untuk melatih ulang detektor visual. Ketika tidak ada landmark, rekaman angka tidak memberikan informasi piksel yang menyebabkan kegagalan.

Untuk memperbaiki detector, dibutuhkan gambar dengan anotasi yang sah dan relevan. Jadi strategi berbasis dataset bisa berbeda.

- Untuk classifier, data landmark nyata, hard negatives, dan urutan gerak.
- Untuk deteksi low-light, frame gambar dengan anotasi posisi tangan/landmark, variasi cahaya dan noise, serta data evaluasi gelap yang terpisah dari training.

Kita juga harus membedakan **cahaya ruangan yang redup** dari kondisi ekstrem saat detail tangan nyaris tidak tertangkap kamera. Enhancer tidak bisa menjamin mengembalikan informasi yang sejak awal tidak tertangkap sensor.

Maka target yang tepat adalah meningkatkan detection recall dan mengurangi false action **pada rentang kondisi pencahayaan yang diuji**, bukan menjanjikan tangan selalu terdeteksi dalam gelap.

## 6. Apakah download di bawah 15 MB bisa dicapai?

**Masih mungkin, tetapi belum terbukti.**

Source `main` menyediakan subtotal file NUI mentah sebesar sekitar 17,68 MB. Angka itu mencakup hand landmarker, satu jalur WASM SIMD, loader JS, dan model wajah.

Konfigurasi Caddy memang mengaktifkan `zstd` dan `gzip`\. Gw cek dokumentasi Caddy lebih jauh, dan ternyata ada detail penting. Secara default Caddy mengompresi tipe `application/wasm`, tetapi tidak mencantumkan `application/octet-stream` dalam daftar default-nya. Jadi bobot `.task` belum tentu ikut dikompresi jika disajikan sebagai data biner generik.  [Caddy Documentation](https://caddyserver.com/docs/caddyfile/directives/encode?utm_source=chatgpt.com)

Implikasinya cukup besar. Kita belum boleh menyimpulkan target 15 MB pasti tercapai hanya karena kompresi server sudah aktif.

Selain itu, **model yang kecil tidak otomatis berarti RAM kecil**\. Biaya decoded frame, tensor sementara, WASM memory, dan GPU tetap perlu diperhatikan.

Dari dokumentasi MediaPipe, `detectForVideo()` web berjalan sinkron. Memindahkan inferensi ke Worker berpotensi memperbaiki respons UI, tetapi tidak menjamin inference lebih cepat dan bisa menambah overhead pemindahan frame.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js?authuser=01&utm_source=chatgpt.com)

Untuk pengguna SMP, gw akan menganggap tiga aspek terpisah sebagai syarat kualitas.

| Aspek | Yang sebenarnya harus dibuktikan |
|--------|--------|
| Download | Total byte jaringan untuk mengaktifkan NUI pertama kali, termasuk model, WASM dan JS pendukung |
| RAM | Pemakaian saat idle, setelah warm-up, saat aktif, serta sesudah kamera OFF |
| Respons | Frame-time UI, jeda gesture menjadi aksi, dan kegagalan tracking pada perangkat target |

Dataset training tidak diunduh siswa. Jadi penggunaan dataset besar pada mesin training **tidak otomatis memperbesar paket pengguna**\. Yang memengaruhi paket browser adalah arsitektur model hasil ekspor, format bobot, runtime, dan dependensi yang benar-benar dimuat.

## 7. Hasil riset yang paling menentukan arah kita

**Layak diteliti lebih lanjut**

Melanjutkan classifier R17 menggunakan dataset tambahan yang lebih mewakili kamera siswa, memperbaiki penanganan ketidakpastian, dan menambah evaluasi temporal. Biaya model tambahannya berpotensi tetap sangat kecil.

**Layak diuji sebagai optimasi**

MediaPipe yang sudah ada ditambah preprocessing adaptif, scheduler yang mempertahankan respons UI, dan pengaturan ukuran frame. Hasilnya harus dinilai pada kondisi terang maupun gelap.

**Belum terbukti feasible**

Fine-tuning seluruh bobot palm detector dan hand landmark Google lalu mengemas ulang sebagai `.task` browser yang lebih kecil. Belum ada training pipeline resmi yang siap memenuhi kebutuhan itu.

**Masih perlu bukti fisik**

Bahwa transfer NUI benar-benar kurang dari 15 MB serta cukup responsif dalam low-light pada laptop dan ponsel siswa. Tidak ada laporan benchmark webcam dan RAM perangkat target yang sudah membuktikannya.

## Kesimpulan riset gw

Keinginan lu bukan sekadar *fine-tuning*\. Secara teknis, ini adalah **pengembangan sistem pengenalan gesture yang lebih robust dengan optimalisasi domain, model, dan runtime**, tetap menggunakan MediaPipe sebagai fondasi utama.

Gw **tidak menyarankan langsung mengganti model Hand Landmarker**\. Hasil R17 memberi alasan kuat untuk memperdalam training classifier kecil, tetapi riset low-light menunjukkan masalah detector perlu jalur pengujian tersendiri. Menggabungkan keduanya menjadi satu pekerjaan retraining besar justru berisiko menghabiskan waktu tanpa menyelesaikan masalah yang lu alami.

Ada satu hal yang menurut gw wajib dipastikan lebih dulu sebelum memilih arsitektur baru, yaitu **berapa banyak kegagalan lu berasal dari landmark yang tidak muncul, landmark yang salah posisi, dan classifier yang salah membaca landmark yang benar**\.

Ketiga kategori itu membutuhkan solusi yang berbeda. Tanpa memisahkannya, kita bisa memperoleh model dengan macro-F1 sangat tinggi tetapi pengalaman menggambar siswa tetap buruk.

Untuk sekarang ini tetap **hasil riset dan opsi arsitektur**, bukan instruksi eksekusi, keputusan model baru, atau klaim bahwa sistem sudah memenuhi target 15 MB.

---

---

## L4-M084 | User | 2026-11-17 18:10:27


message time: 2026-11-17 18:10:27

dari semua riset lu, tetep dasarnya mediapipe tapi dikuatin makanya gw bilang fine tune, tapi fine tune ini caranya lain ya kea yang gw bilang gitu bukan fine tune from scratch atau sesuai definisi di llm

---

---

## L4-M085 | Assistant | waktu tidak ada


**IYA, sekarang gw paham. Yang lu maksud dengan *fine-tuning* itu bukan definisi teknis fine-tuning bobot model, melainkan memperkuat keseluruhan sistem MediaPipe melalui training tambahan, optimasi, dan perubahan arsitektur.**

Jadi **MediaPipe tetap fondasinya**, bukan diganti. Kita mengambil kemampuan MediaPipe yang sudah ada, lalu mengembangkan bagian-bagian yang masih lemah.

Secara teknis, pendekatannya lebih tepat disebut **MediaPipe-Based Robust Gesture Recognition Enhancement**\.

## Bentuk sistem yang lu maksud

**MediaPipe Hand Landmarker**

Fondasi pretrained, tetap dipertahankan

**Robustness Enhancement**

Low-light, backlight, noise, orientasi, tracking

**Trained Gesture Classifier**

Pengembangan lanjutan MLP Claude dengan data relevan

**Temporal Recognition + Safety Gates**

Stabilitas gesture, false Hapus, pinch, swipe, hand lock

**Lightweight Browser Runtime**

Target transfer NUI kurang dari 15 MB dan interaksi lancar

Ada perbedaan penting antara tiga istilah.

| Istilah | Maksud |
|--------|--------|
| *Model fine-tuning* | Memperbarui bobot model pretrained |
| *Training classifier tambahan* | Melatih model untuk membaca landmark MediaPipe, seperti yang Claude lakukan |
| **Pipeline-level optimization** | Memperkuat deteksi, recognition, tracking, dan runtime sebagai satu sistem |

**Yang lu mau adalah kombinasi kedua dan ketiga**, dengan kemungkinan fine-tuning model visual jika penelitian membuktikan itu diperlukan dan memungkinkan.

Dan gw nangkep satu hal lagi. **Lu nggak sekadar mau nambah classifier lalu selesai.** Lu mau seluruh NUI lebih bagus dibanding MediaPipe standar, termasuk pada kondisi lampu ruangan yang sebelumnya bikin deteksi gagal.

Tapi tetap ada batas teknis. Training classifier bisa mengurangi kesalahan membaca landmark, sedangkan low-light yang menyebabkan landmark hilang perlu perbaikan di tahap deteksi atau preprocessing.

Jadi arah riset kita adalah **memaksimalkan kemampuan MediaPipe sebagai sistem**, bukan memaksakan retraining semua bobotnya. Hasil Claude menjadi titik awal pengembangan, bukan hasil akhir.

Untuk sekarang kita masih membahas arsitekturnya. **Belum ada model baru yang dipilih, belum ada training lanjutan, dan belum ada instruksi implementasi ke Ujang.**

---

---

## L4-M086 | User | 2026-11-17 18:11:44


message time: 2026-11-17 18:11:44

jadi gimana? riisetin lagi, gw belum baca output lu yang tadi krn belum sesuai yang gw bilang, lakukan riset mendalam lagi

---

---
