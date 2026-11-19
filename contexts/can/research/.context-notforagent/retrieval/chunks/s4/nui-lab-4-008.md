# NUI Lab 4 | pesan 77-82

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afb0520-54b0-83ec-b789-6680fdb7cb15
> Source Git blob: e04d43f2ce0067c893759488179e9a36c826be8a

## L4-M077 | Assistant | waktu tidak ada


Bisa, Ujang yang jalankan training sementara di VM, lalu bersihkan environment training setelah artefak dan hasil tes diamankan. **Tapi GitHub MCP cuma buat akses source dan hasil kerja, bukan penyedia GPU.** Gw cek dulu keputusan R&amp;D kita dan opsi fine-tuning MediaPipe yang benar-benar didukung, supaya lu nggak keluar biaya training tapi masalah low-light tetap nggak terjawab.

**Bisa. Gw setuju Ujang yang ngurus training sementara di VM, bukan memaksakan Claude Code cloud.** Tapi ada satu hal teknis penting. Kalau lu mau **fine-tuning beneran**, kita harus memilih bagian model pretrained yang mau dilatih ulang, bukan sekadar melatih classifier baru lalu menyebutnya fine-tuning.

Gw sudah cocokkan dengan dokumen R17 REV4 kita.

## 1. Sebenarnya apa yang mau kita fine-tune?

**Webcam siswa**

**A. MediaPipe Hand Landmarker**

Mendeteksi tangan dan menghasilkan 21 landmark. Ini bagian yang gagal saat low-light atau backlight ekstrem.

(Belum di-fine-tune)

**B. Gesture classifier**

Mengenali tiga jari, lima jari, pinch dan pose lain dari landmark.

(MLP sudah dilatih offline)

**Hand lock + gesture FSM + aksi canvas**

**R&amp;D lama kita sebenarnya memilih jalur B.** MediaPipe dipertahankan dan classifier pendamping dilatih. Claude sudah menjalankan bagian itu.

Sekarang lu meminta fine-tuning. Itu perubahan pendekatan yang perlu dibedakan.

Google menyediakan **MediaPipe Model Maker** untuk mengustomisasi Gesture Recognizer dengan model embedding pretrained dan lapisan classifier yang dilatih pada data gesture baru. Tetapi itu **bukan fine-tuning bobot palm detector atau hand landmark detector**\. Dokumentasi Google juga menyatakan Model Maker sudah tidak dipelihara secara aktif.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/customization/gesture_recognizer?utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/gesture_recognizer.py?utm_source=chatgpt.com)

Artinya, untuk tujuan lu\:

- **Kesalahan membaca tiga atau lima jari** bisa ditangani melalui training atau transfer learning classifier gesture.
- **Tangan tidak terdeteksi saat low-light** memerlukan perbaikan di level input atau detektor landmark. Mengubah classifier saja tidak cukup.

Gw akan mempertahankan MediaPipe sebagai baseline dan menjadikan fine-tuning detector sebagai eksperimen terpisah bila memang tersedia model pretrained yang bisa dilatih dan tetap ringan di browser.

## 2. Claude Code punya VRAM nggak?

**Belum diketahui.** Claude Code bukan GPU training service. GPU yang digunakan tergantung mesin tempat perintah training dijalankan.

Ada hal menarik dari catatan infrastruktur kita. VM 111 **pernah dilaporkan memiliki passthrough dua RTX A5000**, masing-masing sekitar 24 GB VRAM. Tapi itu kondisi historis, belum terbukti masih tersedia sekarang.

Jadi Ujang perlu memeriksa VM sebenarnya.

PEMERIKSAAN YANG UJANG PERLU JALANKAN

```bash
nvidia-smi
free -h
df -h /
lscpu | grep -E 'Model name|CPU$s$'
```

Yang penting adalah GPU/VRAM tersedia, VRAM sedang dipakai berapa, RAM bebas, dan kapasitas disk. Jangan menghentikan service Ujang untuk membebaskan GPU tanpa audit.

Kalau GPU tersedia, kita bisa menggunakan VM secara sementara. Kalau tidak, classifier kecil masih bisa dilatih dengan CPU, sedangkan eksperimen detector yang lebih berat perlu dievaluasi kelayakannya.

## 3. GitHub MCP dipakai buat apa?

**GitHub MCP**

Source, branch, laporan, PR

**VM Ujang**

Dataset, GPU/CPU, training, benchmark

---

Hasil model + laporan + checksum

**Staging hasil terverifikasi**

Artefak disimpan aman, dataset sementara dan environment dibersihkan setelah verifikasi

GitHub MCP tidak mengeksekusi training. Ujang harus mempunyai akses terminal VM sendiri untuk menjalankan Python dan memanfaatkan GPU.

**Jangan langsung menghapus semua file setelah training.** Dataset sementara dan environment boleh dibersihkan, tetapi model terbaik, konfigurasi, manifest, metrik, dan checksum harus disimpan dulu. Artefak berbatas lisensi jangan otomatis dipush ke repo publik.

## 4. Prompt untuk Ujang

Ini mandat yang menurut gw paling sesuai dengan kebutuhan lu saat ini.

> **Chat message**
> 
> # Mandat R&D Fine-Tuning NUI Sketchbook Universe
> 
> Saya ingin melanjutkan R&D NUI R17 dengan pendekatan fine-tuning atau transfer learning berbasis model pretrained, bukan hanya mengulangi training classifier MLP dari nol.
> 
> **Tujuan:** meningkatkan ketepatan pengenalan gesture sekaligus meneliti kegagalan MediaPipe saat low-light, backlight, posisi tangan berubah, dan background ramai. Sistem harus tetap ringan untuk browser siswa SMP.
> 
> ## Konteks wajib
> 
> Baca `AGENTS.md` dan seluruh SOP CAN yang relevan di repository `lustresense/hitl-momo`.
> 
> Pelajari kembali:
> 
> - `NUI-REVISION R17-01 REV4`
> - `R17_NUI_CLASSIFIER_AB_REPORT.md`
> - `R17_NUI_DATASET_FEASIBILITY.md`
> - `rd_train.py`, `rd_model.ts`, `rd05_ab.ts`
> - Pipeline MediaPipe, NUI Lab, CLAHE, hand lock, gesture FSM, dan inference scheduler
> 
> Bedakan pekerjaan RD-04 yang telah menghasilkan MLP offline dari pekerjaan fine-tuning baru. Jangan menyatakan bobot MediaPipe sudah dilatih ulang.
> 
> ## Fase 1. Audit environment VM
> 
> Gunakan akses terminal VM Ujang untuk memeriksa GPU, VRAM, RAM, disk, driver CUDA, dan proses yang sedang memakai resource.
> 
> Catatan historis menyebut VM pernah menggunakan dua RTX A5000. Verifikasi ulang, jangan menganggap masih tersedia.
> 
> Laporkan kemampuan training sebenarnya dan risiko terhadap Hermes, gateway, tunnel, serta service produksi.
> 
> GitHub MCP digunakan untuk membaca repository, membuat branch, dan mengelola laporan hasil. Training dilakukan melalui eksekusi proses di VM, bukan melalui GitHub MCP.
> 
> ## Fase 2. Pilih jalur fine-tuning yang benar
> 
> Lakukan feasibility teknis dua jalur secara terpisah.
> 
> **Jalur A, gesture recognition:** evaluasi penggunaan pretrained gesture embedding/MediaPipe Gesture Recognizer dengan classifier yang diadaptasi menggunakan dataset gesture proyek. Periksa kompatibilitas Model Maker, status maintenance, dependensi, dan alternatif yang tetap ringan di browser. Jelaskan bagian bobot mana yang dilatih dan mana yang dibekukan.
> 
> **Jalur B, low-light hand detection:** periksa apakah bobot hand/palm landmark MediaPipe yang dipakai benar-benar bisa di-fine-tune dengan pipeline training yang tersedia. Jika tidak, jangan mengklaim fine-tuning MediaPipe. Evaluasi alternatif pretrained hand detector/landmarker yang bisa dilatih ulang, dengan biaya inference browser sebagai kriteria utama.
> 
> Pertahankan MediaPipe asli sebagai baseline dan fallback.
> 
> ## Fase 3. Dataset
> 
> Gunakan hasil R&D sebelumnya sebagai landasan:
> 
> - HaGRIDv2 untuk pose tangan dan hard negatives.
> - IPN HandS untuk landmark/gesture temporal jika dataset tersedia dan integritasnya terverifikasi.
> - Data webcam nyata berizin untuk kondisi normal, lampu atas, low-light, backlight, near-pinch, no-gesture, tangan kedua, dan occlusion.
> 
> Jangan mengunduh dataset besar secara membabi buta. Jangan menganggap anotasi landmark sama dengan dataset gambar yang dibutuhkan untuk fine-tuning vision model.
> 
> Pastikan pemisahan subjek train/validation/test dan tidak ada data leakage. Periksa hak penggunaan dan redistribusi dataset/model.
> 
> ## Fase 4. Training terisolasi
> 
> Jika resource, data, lisensi, dan pipeline sudah layak, jalankan training kandidat di workspace sementara khusus, tanpa mengganggu service Ujang atau repo aktif.
> 
> Simpan baseline, konfigurasi, seed, checkpoint, hasil validasi, metrik per kelas, confusion matrix, dan kebutuhan GPU/RAM/disk.
> 
> Jangan mengganti model yang sedang dipakai aplikasi. Jangan push weights ke GitHub publik sebelum lisensi diverifikasi.
> 
> Kalau fine-tuning detector ternyata tidak feasible, laporkan blocker secara faktual dan lanjutkan hanya eksperimen yang aman. Jangan mengganti pekerjaan dengan training from scratch lalu menamainya fine-tuning.
> 
> ## Fase 5. Benchmark dan cleanup
> 
> Bandingkan kandidat terhadap sistem sekarang menggunakan data yang sama, termasuk webcam target.
> 
> Ukur false Hapus, missed gesture, no-gesture, near-pinch, recall tangan saat low-light, stabilitas lock, FPS, latency p95, RAM browser, ukuran model dan cold download.
> 
> Pisahkan kualitas landmark dari kualitas klasifikasi gesture.
> 
> Setelah hasil diamankan dan checksum diverifikasi, bersihkan hanya environment, cache, dan dataset sementara milik job ini. Jangan menghapus backup, weights proyek lain, volume Docker atau data produksi.
> 
> ## Batas otorisasi
> 
> Training terisolasi boleh dilakukan jika preflight aman. Jangan mengubah `main`, gameplay, kontrak produk, SOP, ataupun deployment. Integrasi model ke NUI Lab memerlukan laporan evaluasi dan review Owner terlebih dahulu.
> 
> ## Laporan yang saya butuhkan
> 
> Berikan status GPU/VRAM aktual, kelayakan fine-tuning setiap jalur, sumber dataset, eksperimen yang benar-benar dijalankan, perbandingan hasil, ukuran model, penggunaan resource, serta daftar artefak yang disimpan dan data sementara yang dibersihkan.
> 
> Jika tidak ada GPU, jelaskan apakah eksperimen dapat dikerjakan dengan CPU atau perlu lingkungan GPU terpisah. Jangan mengklaim training selesai tanpa checkpoint dan metrik nyata.
> 
> Mulai dari preflight VM dan audit feasibility. Lanjutkan training terisolasi hanya pada jalur yang terbukti layak.

**Langkah lu sekarang cukup kirim prompt itu ke Ujang.** Hasil pertama yang gw butuhkan adalah output pemeriksaan GPU/VRAM dan verdict apakah fine-tuning model gesture serta detector layak dilakukan di VM tersebut.

Ada satu konflik yang harus dicatat. R17 REV4 sebelumnya mempertahankan bobot MediaPipe dan memilih classifier pendamping. Permintaan lu sekarang memperluas R&amp;D ke fine-tuning model pretrained, tetapi **belum berarti mengganti model di produk siswa**\.

⚠️ Kandidat perubahan **keputusan** terdeteksi

- Ringkasan: R&amp;D NUI diarahkan mengevaluasi fine-tuning atau transfer learning model pretrained, termasuk kemungkinan perbaikan detector untuk low-light.
- Entri lama yang mungkin terdampak: Arah penggunaan MediaPipe sebagai fondasi NUI dan batas integrasi model baru ke aplikasi siswa.
- Status bukti: keputusan eksplisit untuk arah R&amp;D, belum cukup bukti untuk perubahan model produk.
- Tindakan: `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

### Saran update WORKING\_STATE

- Yang berubah: Rencana menggunakan VM Ujang sebagai training worker sementara melalui source GitHub MCP. Status GPU, VRAM, dataset dan kelayakan fine-tuning masih belum diverifikasi.
- Bagian terdampak: Tooling R&amp;D NUI, resource VM 111, training pipeline, penyimpanan artefak dan cleanup.
- Tindakan: ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L4-M078 | User | 2026-11-17 17:52:32


message time: 2026-11-17 17:52:32

Gini, kan logikanya sih dia bisa training MobileNet yang cepet. Jadi TensorFlow kecil itu. Tato keras itu. Nah, gue pengen sebisa mungkin kita re-architecture MediaPipe. Base-nya memang MediaPipe, harusnya di judo gue tetap aman. Tapi gue retrain lagi MediaPipe. Aman aja, di server gue ada 24 GB RAM. Retrain aja, cepat. Retrain yang sama, saat retrain yang jadinya model kayak keras gitu yang bisa di-download inference. Kalau ya model dan dataset dari dia itu kan gede. Gue kan juga sama tuh MediaPipe. Tapi jadiin maksimal di retrain. Terus kalau bisa di-download user itu di bawah 15 MB. Jadi ya pas runtime dan lain-lain bisa enteng. Ini jatuhnya re-architecture dalam waktu dekat. coba risetin, bisa ga ya

---

---

## L4-M079 | Assistant | waktu tidak ada


Gw riset kelayakan **re-architecture NUI berbasis MediaPipe**, bukan sekadar melatih classifier tambahan. Gw bakal cek tiga hal yang menentukan apakah target lu realistis, yaitu apakah bobot detektor/landmark MediaPipe bisa dilatih ulang, apakah hasilnya bisa dipakai langsung di browser, dan apakah **total download NUI di bawah 15 MB** bisa dicapai tanpa bikin runtime makin berat. Angka RAM server 24 GB belum otomatis menjawab kebutuhan GPU atau VRAM, jadi itu juga gw pisahkan.

**Bisa kita lakukan re-architecture NUI berbasis MediaPipe dengan target download di bawah 15 MB. Tapi melatih ulang seluruh MediaPipe belum bisa gw nyatakan feasible.** Hasil riset awal justru menunjukkan jalur resmi Google tidak menyediakan fine-tuning langsung untuk model pendeteksi telapak dan 21 landmark tangan.

Ada tiga fakta penting.

1. **MediaPipe Hand Landmarker bukan satu model Keras biasa.** Di dalamnya ada palm detector dan hand landmark model. Keduanya bekerja bersama untuk menemukan tangan dan melacak 21 titik jari.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md?utm_source=chatgpt.com)
2. **Google mendukung customization Gesture Recognizer**, tetapi yang dilatih adalah bagian klasifikasi gesture, bukan bobot pendeteksi tangan. Model Maker-nya juga sudah berstatus deprecated dan tidak aktif dipelihara.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/model_maker?utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/gesture_recognizer.py?utm_source=chatgpt.com) [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe/issues/5667?utm_source=chatgpt.com)
3. **RAM server 24 GB bukan VRAM GPU.** Training model kecil bisa saja dilakukan di CPU. Namun fine-tuning detektor visual membutuhkan arsitektur model, bobot pretrained yang bisa dilatih, pipeline training, dan dataset gambar beranotasi. GPU besar tidak otomatis menyediakan semuanya.

Jadi gw tidak akan menyuruh Ujang menjalankan training besar sebelum kita tahu apakah model yang ingin dilatih memang tersedia dan hasilnya bisa diekspor ke browser.

## 1. Target download di bawah 15 MB ternyata lebih masuk akal daripada melatih ulang seluruh MediaPipe

Gw cek langsung file di `lustresense/hitl-momo`, commit `3ef4cc3`\.

| Aset NUI saat ini | Ukuran |
|--------|--------|
| `hand_landmarker.task` | 7,82 MB |
| WASM SIMD | 9,42 MB |
| JavaScript loader WASM | 0,21 MB |
| BlazeFace untuk bantuan deteksi wajah | 0,23 MB |
| **Total mentah** | **17,68 MB** |

Alternatif WASM non-SIMD tersedia, tetapi bukan berarti kedua varian harus diunduh sekaligus.

**Ukuran file NUI mentah** 17,68 MB

Target transfer 15 MB Selisih 2,68 MB

Ada temuan bagus. **Caddy di repo utama sudah mengaktifkan `encode zstd gzip`\.** Jadi file yang dikirim melalui jalur Caddy bisa dikompresi. Kompresi HTTP memang dapat mengurangi transfer tanpa mengubah arsitektur model.  [Caddy Documentation](https://caddyserver.com/docs/caddyfile/directives/encode?utm_source=chatgpt.com)

Artinya, **mungkin saja transfer aktual NUI sudah di bawah 15 MB sekarang**, meskipun total file mentahnya 17,68 MB. Namun gw belum punya angka dari Network browser untuk membuktikannya. Model `.task` juga sudah menggunakan float16 menurut dokumentasi Google, sehingga tidak bisa diasumsikan akan menyusut setengah lagi hanya dengan memilih float16.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?utm_source=chatgpt.com) [developers.google.com](https://developers.google.com/edge/litert/conversion/tensorflow/quantization/post_training_quantization?utm_source=chatgpt.com)

Kalau target 15 MB lu berarti **seluruh website beserta game, ilustrasi, animasi dan NUI**, pengukuran di atas belum cukup. Kita harus menghitung seluruh transfer sejak halaman pertama dibuka sampai kamera siap.

## 2. Tiga jalur re-architecture yang realistis

**Jalur A. Optimalkan MediaPipe sekarang**

Kelayakan tinggi • Prioritas pertama

Tetap gunakan Hand Landmarker, tetapi benahi cara inferensi, ukuran input, kamera, model loading, dan pemrosesan low-light. Tidak membutuhkan retraining.

Google menyatakan `detectForVideo()` di web berjalan sinkron dan memblokir thread pemanggil. **Web Worker** dapat memindahkan pekerjaan itu dari thread UI.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js?authuser=01&utm_source=chatgpt.com)

Ini potensi perbaikan lag terbesar yang layak diuji dahulu.

---

**Jalur B. Transfer learning Gesture Recognizer**

Kelayakan teknis ada • Perlu verifikasi tooling dan lisensi

Menggunakan pretrained hand embedding milik MediaPipe, kemudian melatih classifier gesture khusus. Hasil Model Maker dapat diekspor sebagai `.task` untuk inferensi, bukan mengirim file `.keras` ke browser.  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/gesture_recognizer.py?utm_source=chatgpt.com) [developers.google.cn](https://developers.google.cn/edge/mediapipe/solutions/vision/gesture_recognizer/index?authuser=3&utm_source=chatgpt.com)

Ini paling dekat dengan keinginan lu untuk training berbasis pretrained model, tetapi **belum memperbaiki palm detection ketika cahaya buruk**\.

---

**Jalur C. Fine-tune detektor dan landmark visual**

R&amp;D lebih berat • Belum layak dijanjikan cepat

Ini yang benar-benar lu maksud dengan retrain MediaPipe. Tetapi bobot training dan pipeline fine-tuning resmi untuk Hand Landmarker tidak tersedia melalui Model Maker.  [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe/issues/5667?utm_source=chatgpt.com)

Alternatifnya menggunakan arsitektur pretrained hand-keypoint lain yang menyediakan training, kemudian mengekspor ke TFLite dan mengadaptasi pipeline inferensinya. Google juga menyediakan model palm dan landmark versi lite pada MediaPipe Hands lama, tetapi itu **bukan pengganti langsung** untuk `.task` modern.  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/models.md?plain=1&utm_source=chatgpt.com)

## 3. Kenapa dataset Claude belum cukup untuk fine-tuning detektor?

Karena data yang Claude gunakan untuk eksperimen R17 adalah **anotasi landmark HaGRIDv2**, bukan kumpulan gambar mentah untuk melatih ulang jaringan visual MediaPipe.

**Landmark**

Koordinat dan label gesture

Cocok untuk classifier

**Gambar + anotasi**

Piksel, posisi telapak, 21 titik benar

Dibutuhkan untuk training vision

Untuk memperbaiki deteksi dalam low-light, kita membutuhkan gambar yang mewakili kondisi gelap, cahaya dari belakang, noise kamera, tangan sebagian tertutup, serta anotasi yang dapat dipercaya.

Ada dataset hand-keypoint publik seperti [Ultralytics Hand Keypoints](https://docs.ultralytics.com/datasets/pose/hand-keypoints/)\. Tetapi sebagian anotasinya dibuat otomatis menggunakan MediaPipe. Jika MediaPipe sendiri gagal di kondisi gelap, kita tidak boleh langsung menganggap pseudo-label tersebut benar untuk kasus sulit.  [Ultralytics](https://docs.ultralytics.com/datasets/pose/hand-keypoints?utm_source=chatgpt.com)

Ini alasan kenapa **training maksimal bukan berarti training menggunakan data sebanyak-banyaknya**\. Data yang salah atau tidak mewakili kondisi siswa malah bisa menghasilkan model yang buruk pada webcam nyata.

## 4. Arsitektur yang gw rekomendasikan

**Webcam**

Video tetap normal di layar siswa

**Adaptive preprocessing**

Raw frame / low-light enhancement bila membantu

**MediaPipe di Web Worker**

Hand Landmarker, palm detection, 21 landmarks

**Gesture classifier kecil**

MLP Claude atau custom classifier yang lolos evaluasi

**Hand Lock → Gesture FSM → Canvas**

Penting, gambar di atas adalah **arsitektur kandidat**, bukan yang sudah terimplementasi.

Ada beberapa perbaikan khusus pada source sekarang yang sebaiknya diperiksa Ujang.

- **Low-light preprocessing.** Source menggunakan CLAHE pada frame selebar 320 piksel. Itu bisa membantu kontras, tetapi juga berpotensi menghilangkan detail jari atau memperkuat noise. Uji `off`, `scaled`, dan `auto` terhadap webcam yang sama.
- **Face detection tambahan.** BlazeFace berjalan hingga 4 kali per detik. Uji biaya tambahannya dan apakah fitur yang sedang dipakai benar-benar membutuhkannya.
- **Synchronous inference.** Uji migrasi MediaPipe ke Web Worker, termasuk dukungan GPU dan fallback CPU. Jangan menganggap pindah thread otomatis mempercepat inference.
- **Model warm-up.** Audit RAM ketika kamera OFF dan setelah warm-up, karena source memiliki cache model selama 30 detik.

## 5. Jadi Ujang seharusnya melakukan apa dulu?

Gw sarankan **satu eksperimen pembanding terisolasi**, bukan mengganti model utama dulu.

| Tahap | Yang diuji | Bukti yang dibutuhkan |
|--------|--------|--------|
| A | MediaPipe sekarang | Baseline download, RAM, FPS, deteksi low-light |
| B | MediaPipe + optimasi preprocessing/Worker | Perubahan performa dan akurasi pada perangkat yang sama |
| C | MediaPipe + MLP Claude | Kesalahan gesture dan overhead runtime |
| D | Custom pretrained gesture model `.task` | Kompatibilitas, ukuran, hasil webcam |
| E | Kandidat fine-tuned hand detector | Hanya dilanjutkan jika pretrained weights, data, dan training pipeline tersedia |

Untuk target lu, **15 MB menjadi batas transfer NUI kandidat**, bukan jaminan RAM rendah. RAM aktif, RAM idle, waktu muat, FPS dan respons menggambar harus diukur terpisah.

Ujang bisa menggunakan VM sebagai tempat training sementara. Tapi sebelum itu, minta verifikasi `nvidia-smi`, RAM bebas, disk, dan apakah GPU dapat digunakan tanpa mengganggu layanan server. GitHub MCP dipakai untuk source, branch, PR dan laporan, sedangkan training berjalan pada VM.

## Verdict riset

**Re-architecture ringan dengan MediaPipe sebagai fondasi itu layak dikerjakan dalam waktu dekat. Full fine-tuning model landmark Google sendiri bukan jalur cepat yang sudah tersedia.**

Prioritas gw adalah membuktikan apakah kita bisa memenuhi batas download dan menghilangkan lag dengan optimasi pipeline yang ada, sambil mengevaluasi transfer learning gesture secara terpisah. Kalau low-light tetap gagal pada level deteksi tangan, baru kita masuk eksperimen pretrained detector yang benar-benar bisa dilatih ulang.

Dengan begitu lu tetap mempertahankan pendekatan MediaPipe untuk PA, tidak membuang hasil training Claude, dan tidak mempertaruhkan performa browser siswa hanya demi klaim sudah melakukan fine-tuning.

⚠️ Kandidat perubahan **keputusan** terdeteksi

- Ringkasan: Lu mengarahkan R&amp;D menuju re-architecture NUI berbasis MediaPipe, dengan target paket download di bawah 15 MB, dan menginginkan fine-tuning model pretrained bila feasible.
- Entri lama yang mungkin terdampak: Implementasi NUI/MediaPipe, batas eksperimen classifier R17 dan arsitektur inferensi.
- Status bukti: keputusan eksplisit untuk arah R&amp;D, belum cukup bukti untuk mengganti model produksi.
- Tindakan: `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

### Saran update WORKING\_STATE

- Yang berubah: Audit menunjukkan jalur fine-tuning Hand Landmarker resmi tidak tersedia; opsi transfer learning gesture dan optimasi pipeline teridentifikasi. Caddy sudah mendukung kompresi, tetapi target transfer dan RAM belum diukur.
- Bagian terdampak: R&amp;D NUI, MediaPipe browser runtime, model training, performa dan VM Ujang.
- Tindakan: ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L4-M080 | User | 2026-11-17 17:56:26


message time: 2026-11-17 17:56:26

nah tapi tetep sesuai rnd kita, jadi recognitionnya di finetuning biar jadi sangat akurat dan aman di lowlight gituloh dengan tetep memerhatikan size buat user cokkkk. kea yang dilakukan claude tapi versi maksimal, gw bilang fine tune biar gampang aja padahal bukan ya, gimana ya bilangnya

---

---

## L4-M081 | Assistant | waktu tidak ada


**Istilah yang paling pas buat keinginan lu adalah *Robust Lightweight Hand Gesture Recognition* berbasis MediaPipe, dengan *classifier retraining, domain adaptation*, dan optimasi pipeline untuk low-light.**

Jadi lu **bukan sekadar mau fine-tuning MediaPipe**\. Lu mau mengembangkan sistem NUI yang sudah ada supaya pengenalan gesture jauh lebih akurat, tahan terhadap kondisi kamera nyata, dan tetap ringan buat browser siswa.

## Ini sebenarnya yang lu mau

**MediaPipe sebagai fondasi**

Hand detection + 21 landmarks

**Robustness**

Low-light, backlight, occlusion, noise kamera

**Recognition**

Training lanjutan classifier gesture Claude

**Hand Lock + Gesture FSM + Canvas**

Tidak boleh salah aksi atau mengganggu kelancaran menggambar

Ada **dua masalah berbeda yang harus diperbaiki bersamaan**\.

- **Detection robustness** supaya tangan tetap terdeteksi pada kondisi pencahayaan sulit.
- **Recognition accuracy** supaya landmark yang sudah terdeteksi tidak salah dibaca sebagai tiga jari, lima jari, pinch, atau gesture lainnya.

Kalau MediaPipe gagal mendeteksi tangan, classifier sebagus apa pun tidak bisa menyelesaikan masalahnya sendirian.

## Kalimat yang bisa lu kasih ke Ujang atau Claude

> **Chat message**
> 
> Saya ingin melanjutkan R&D NUI R17 dengan pendekatan **end-to-end robustness optimization dan lightweight gesture recognition berbasis MediaPipe**.
> 
> MediaPipe tetap menjadi fondasi utama hand detection dan landmark tracking. Saya ingin mengembangkan hasil eksperimen classifier Claude sebelumnya menjadi sistem yang jauh lebih akurat, stabil, dan efisien untuk browser siswa SMP.
> 
> **Target pengembangan:**
> 
> 1. **Recognition accuracy.** Lanjutkan pengembangan dan training classifier ringan dari eksperimen LR/MLP R17. Gunakan dataset yang relevan, hard-negative mining, data augmentation, dan domain adaptation dari landmark webcam nyata. Prioritaskan kesalahan tiga/empat/lima jari, false Hapus, no-gesture, serta pinch hampir menyentuh dibanding pinch benar-benar menyentuh.
> 
> 2. **Low-light robustness.** Tingkatkan ketahanan deteksi tangan terhadap cahaya ruangan, low-light, backlight, noise, orientasi tangan, occlusion, dan background ramai. Evaluasi preprocessing adaptif dan alternatif optimasi detector jika landmark MediaPipe gagal. Jangan menganggap training classifier otomatis memperbaiki hand detection.
> 
> 3. **Temporal reliability.** Pertahankan hand lock, auto-recovery, smoothing, dan gesture FSM. Evaluasi pengenalan gesture dinamis seperti swipe menggunakan data berurutan, bukan hanya gambar statis.
> 
> 4. **Model optimization.** Gunakan arsitektur sekecil mungkin yang memenuhi target kualitas. Evaluasi quantization, pruning, kompresi, dan implementasi browser-native tanpa framework ML berat bila memungkinkan.
> 
> 5. **Browser performance.** Targetkan total transfer aset NUI **di bawah 15 MB**, bukan hanya ukuran classifier. Optimalkan RAM idle dan aktif, inference latency, FPS, cold start, dan respons canvas. Ukur pada perangkat siswa nyata.
> 
> 6. **Evaluasi.** Bandingkan pipeline sekarang, heuristik revisi, MLP R17, dan setiap kandidat baru pada data serta kondisi pengujian yang setara. Laporkan trade-off akurasi, robustness, false trigger, ukuran transfer, RAM, dan latency. Hindari klaim akurasi tinggi hanya berdasarkan dataset statis.
> 
> 7. **Training environment.** Gunakan VM Ujang untuk eksperimen terisolasi setelah memeriksa GPU/VRAM, RAM, disk, dan lisensi dataset. Simpan artefak dan metrik yang dapat direproduksi sebelum membersihkan file sementara.
> 
> **Tujuan akhirnya bukan sekadar menghasilkan model baru, tetapi pipeline NUI yang terbukti lebih akurat dan robust dalam penggunaan webcam nyata, tanpa membuat browser siswa terasa berat.**
> 
> Lanjutkan dari hasil R&D R17 yang sudah ada. Jangan mengulang riset dari nol, jangan mengubah gameplay utama, dan jangan memasang model baru sebelum kualitas serta performanya terverifikasi.

**Satu hal yang perlu lu bedakan.** Target di bawah 15 MB itu batas ukuran transfer, bukan jaminan browser lancar. Model 5 MB pun bisa lag kalau inferensinya berat, sedangkan model 10 MB bisa lebih responsif jika arsitekturnya efisien.

Jadi kalau mau menyebut proyek teknis ini dengan satu nama, gw pilih\:

**MediaPipe-Based Robust and Lightweight Hand Gesture Recognition Optimization.**

Itu mencakup pengembangan classifier Claude, perbaikan low-light pada pipeline deteksi, dan optimasi inference browser tanpa salah mengklaim bahwa bobot internal MediaPipe sudah di-fine-tune.

---

---

## L4-M082 | User | 2026-11-17 17:59:03


message time: 2026-11-17 17:59:03

JANGAN KE UJANG DULU JANCOK GW MAU NGOBROL DULU ASU. ANJING NIH. RISET DULU MENDALAM SOAL PROMPT GW BARU2 INI

---

---
