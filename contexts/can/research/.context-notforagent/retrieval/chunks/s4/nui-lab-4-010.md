# NUI Lab 4 | pesan 87-90

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afb0520-54b0-83ec-b789-6680fdb7cb15
> Source Git blob: e04d43f2ce0067c893759488179e9a36c826be8a

## L4-M087 | Assistant | waktu tidak ada


Gw ulang risetnya dari kebutuhan lu, bukan dari definisi *fine-tuning*. Targetnya **MediaPipe tetap fondasi, recognition dilatih dan diperkuat seperti eksperimen Claude tetapi lebih matang, low-light benar-benar ditangani, dan paket browser dijaga di bawah 15 MB**. Gw bakal cek ulang source R17, penelitian yang relevan, serta opsi arsitektur dan trade-off-nya. Belum masuk ke prompt atau implementasi.

Gw nemu dua hal yang mengubah arah riset. Pertama, **Google punya contoh resmi Hand Landmarker di Web Worker**, jadi pemisahan inferensi dari UI bukan sekadar ide, walaupun kompatibilitas GPU/browser tetap harus diuji. Kedua, ada dataset **DimHand 2026** yang memang meneliti gerakan tangan dalam low-light dinamis, bukan hanya foto gesture statis. Ini lebih relevan untuk kasus lu daripada sekadar memperbanyak sampel HaGRID.

Gw sudah cek **kode training Google langsung**, bukan cuma dokumentasinya. Ada batas yang sangat relevan. Model Maker memang melatih classifier dengan embedding pretrained, tetapi gambar yang gagal dideteksi MediaPipe **dikeluarkan dari data latih**. Jadi untuk kebutuhan lu, memaksimalkan training gesture dan mengatasi kegagalan low-light harus didesain sebagai dua bagian yang terhubung. Satu model kecil saja nggak akan menyelesaikan keduanya.

**Hasil riset ulang gw, sistem yang lu inginkan memang bisa dikembangkan tanpa mengganti MediaPipe sebagai fondasi. Pendekatan paling menjanjikan adalah memperkuat MediaPipe dengan classifier gesture yang dilatih khusus, adaptasi kondisi kamera nyata, pemrosesan low-light, dan pengenalan gesture berbasis waktu. Semuanya harus dioptimalkan sebagai satu pipeline browser.**

Ini bukan sekadar mengulang MLP Claude. Kita menggunakan eksperimen R17 sebagai baseline, lalu mengembangkan kemampuan recognition dan ketahanan sistem secara menyeluruh.

Ada satu temuan penting yang sebelumnya belum gw jelaskan dengan benar.

## 1. MediaPipe sendiri bisa punya classifier hasil training kita

Google menyediakan **Gesture Recognizer Model Maker**\. Kita bisa melatih classifier gesture kustom memakai data sendiri, kemudian mengekspornya menjadi `gesture_recognizer.task`\.

Model bundle hasil ekspornya mencakup deteksi tangan, hand landmarks, dan custom gesture classifier. Artinya, secara arsitektur kita bisa memiliki **satu MediaPipe task yang sudah dilengkapi classifier khusus**, bukan menjalankan dua pipeline hand detection yang terpisah.  [developers.google.cn](https://developers.google.cn/edge/api/mediapipe/python/mediapipe_model_maker/gesture_recognizer/GestureRecognizer?utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/gesture_recognizer.py?utm_source=chatgpt.com) [developers.google.cn](https://developers.google.cn/edge/mediapipe/solutions/vision/gesture_recognizer/index?authuser=3&utm_source=chatgpt.com)

**MediaPipe Gesture Recognizer**

Fondasi pretrained

**Custom Gesture Classifier**

Dilatih dengan dataset gesture dan kondisi penggunaan Sketchbook Universe

**Satu bundle `.task`**

Landmark + klasifikasi gesture, dijalankan di browser

Namun ini baru **kandidat arsitektur**, bukan berarti kita harus mengganti Hand Landmarker sekarang. Tool Model Maker sudah dinyatakan tidak aktif dipelihara Google. Versi library, dukungan gesture khusus, hasil ekspor, dan kompatibilitasnya perlu diperiksa sebelum dipilih.

Alternatif lainnya justru mempertahankan **Hand Landmarker + MLP TypeScript Claude**, karena ukuran classifier-nya hanya sekitar 127 KB dan lebih mudah dikendalikan untuk eksperimen pinch, Hapus, serta gesture temporal.

**Dua arsitektur ini sama-sama mempertahankan MediaPipe.** Perbedaannya ada pada cara custom classifier diintegrasikan, bukan pada tujuan produk.

## 2. Masalah lu harus ditangani dalam tiga lapisan

Dari laporan R17, source MediaPipe, dan penelitian low-light, gw menemukan bahwa tiga jenis kegagalan NUI lu membutuhkan pendekatan yang berbeda.

| Masalah yang lu alami | Penyebab yang mungkin | Pendekatan yang relevan |
|--------|--------|--------|
| Tiga jari terbaca empat, lima jari gagal Hapus | Interpretasi landmark dan variasi bentuk tangan | Training classifier dengan hard negatives |
| Tangan hilang ketika lampu dari atas atau belakang | Input kamera dan hand detection tidak cukup kuat | Adaptive preprocessing, tracking recovery, evaluasi visual low-light |
| Pinch salah aktif, swipe gagal, gesture tidak stabil | Perubahan pose antarfame dan timing keputusan | Temporal recognition dan action safety |

**Training classifier tambahan bisa memperbaiki masalah pertama secara langsung.** Masalah kedua dan ketiga harus ikut diperkuat pada pipeline yang sama supaya pengalaman siswa benar-benar membaik.

Yang menarik, MediaPipe sendiri sudah menggunakan tracking antarframe untuk mengurangi pemanggilan palm detector. Jadi kita tidak perlu membangun hand tracking baru dari nol. Kita perlu mengevaluasi dan memperkuat perilaku yang sudah ada.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?utm_source=chatgpt.com)

## 3. Temuan riset low-light yang paling relevan

Ini bagian yang paling penting buat kondisi lampu ruangan lu.

**[DimHand, ACM Multimedia 2026](https://hanlingzhan.github.io/DimHand/)**

Penelitian ini menggunakan **745.280 frame** gerakan tangan pada intensitas cahaya 0,1 sampai 10 lux. Datasetnya mencakup 15 subjek dan 15 jenis gerakan, termasuk *finger counting*, *finger pinching*, dan *finger bending*\.

Ini relevan karena masalah lu muncul ketika tangan **bergerak**, bukan hanya saat memperlihatkan pose statis. Akses dataset dilakukan melalui permohonan, bukan unduhan bebas tanpa syarat.  [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com)

---

**[XPose / LLHands, WACV 2025](https://openaccess.thecvf.com/content/WACV2025/html/Rosh_XPose_Towards_Extreme_Low_Light_Hand_Pose_Estimation_WACV_2025_paper.html)**

Penelitian ini menunjukkan bahwa hand-pose estimation pada kondisi gelap dapat ditingkatkan dengan memanfaatkan pasangan gambar gelap dan terang saat training.

Dataset LLHands mencakup sekitar 120 ribu gambar beranotasi. Tetapi halaman DimHand mencatat LLHands belum dapat diakses publik, sehingga gw tidak menganggapnya dataset siap pakai.  [openaccess.thecvf.com](https://openaccess.thecvf.com/content/WACV2025/papers/Rosh_XPose_Towards_Extreme_Low_Light_Hand_Pose_Estimation_WACV_2025_paper.pdf?utm_source=chatgpt.com) [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com)

Ada insight penting dari DimHand. Penelitinya melaporkan bahwa enhancement gambar tertentu justru dapat menghasilkan artefak yang mengacaukan estimasi pose tangan. Jadi **gambar yang terlihat lebih terang bagi manusia belum tentu menghasilkan landmark yang lebih akurat**\.  [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com)

Ini langsung berkaitan dengan source lu.

Di `frontend/implementation/src/camera/frame-source.ts`, NUI sekarang punya CLAHE adaptif dengan input selebar 320 piksel. Belum ada bukti webcam bahwa pemilihan itu paling bagus untuk bentuk jari dalam ruangan.

Karena itu gw lebih mendukung pendekatan **adaptive detection input**, bukan satu filter yang terus diaktifkan.

**Frame webcam asli**

**Evaluasi pencahayaan + kualitas tracking**

**Raw frame**

Untuk kondisi normal

**Enhanced frame**

Untuk kondisi yang benar-benar terbantu enhancement

**Satu MediaPipe inference pipeline**

Arsitektur kandidat. Preview kamera yang dilihat siswa tetap normal. Deteksi berulang pada dua versi frame hanya dipertimbangkan sebagai recovery terbatas karena mahal secara komputasi.

Tetapi jangan berharap enhancement selalu berhasil. Kalau sensor kamera tidak menangkap detail tangan yang cukup, tidak ada jaminan pemulihan lewat software.

## 4. Bagaimana training classifier dibuat jauh lebih matang daripada R17?

R17 sudah memberikan titik awal yang berguna.

Macro-F1 MLP R17

# 0,987

Dataset HaGRIDv2, belum webcam

Ukuran model JSON

# 127 KB

6.025 parameter, tidak di Git

Sumbernya adalah [laporan R17 classifier](https://github.com/lustresense/hitl-momo/blob/3ef4cc3/frontend/implementation/docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md)\.

Nah, untuk versi yang lu sebut "maksimal", gw nggak menyarankan sekadar menambah epoch atau memperbesar jumlah neuron. Model R17 sudah mendapat skor tinggi di dataset statis. Justru yang perlu diperbaiki adalah **cakupan data dan kemampuan generalisasi**\.

**Hard-negative training**

Melatih classifier menghadapi bentuk yang sering salah dibaca. Misalnya empat jari yang hampir menjadi lima, tangan alami yang terlihat seperti telapak terbuka, dan transisi dari kepalan menuju pinch.

Fokusnya menurunkan false Hapus, bukan hanya menaikkan akurasi rata-rata.

---

**Domain adaptation**

Data latih tidak cukup hanya dari landmark HaGRID. Kita juga butuh contoh landmark dari kamera target dalam kondisi yang memang lu alami.

Augmentasi geometris bisa mensimulasikan rotasi, jitter dan sebagian noise landmark. Untuk mempelajari kegagalan deteksi akibat cahaya, perubahan brightness atau blur harus diuji pada **gambar sebelum MediaPipe**, bukan hanya pada koordinat sesudahnya.

---

**Temporal gesture recognition**

Ini diperlukan untuk gerakan seperti swipe dan transisi pinch. Model tidak hanya membaca satu frame, tetapi mempertimbangkan pola dari beberapa frame.

Awalnya bisa menggunakan fitur temporal kecil dan FSM. Model sekuens tambahan baru masuk akal kalau pendekatan sederhana gagal memenuhi kebutuhan.

---

**Confidence calibration dan penolakan aksi**

Output classifier tidak boleh otomatis dianggap benar hanya karena confidence tinggi.

Khusus Hapus, sistem seharusnya menahan aksi yang belum cukup pasti. Untuk Coret, respons harus tetap cepat. Jadi setiap aksi bisa memerlukan kebijakan keselamatan dan waktu respons yang berbeda.

Masih ada batas yang perlu lu tahu. **Membedakan pinch hampir menyentuh dengan pinch benar-benar menyentuh tidak selalu dapat dipastikan dari landmark RGB satu frame.** Kita perlu menguji jarak, perubahan pose, durasi dan kemungkinan occlusion. Jangan sampai model mengklaim bisa mengukur kontak fisik yang tidak terlihat kamera.

Selain itu, data classifier R17 tidak boleh otomatis disebarkan ke siswa. Laporan mencatat lisensi HaGRIDv2 masih perlu pemeriksaan sebelum model hasil training didistribusikan.

## 5. Lebih bagus MLP Claude atau custom MediaPipe Gesture Recognizer?

Dua opsi ini layak dibandingkan menggunakan dataset yang sama.

| Pertimbangan | Hand Landmarker + MLP R17 yang dikembangkan | Custom Gesture Recognizer `.task` |
|--------|--------|--------|
| Fondasi MediaPipe | Tetap | Tetap |
| Classifier dilatih khusus | Ya | Ya |
| Training menggunakan | Fitur landmark | Embedding pretrained |
| Model classifier tambahan | Sekitar 127 KB pada pilot | Terkemas di `.task` |
| Integrasi gesture temporal | Lebih bebas di kode sendiri | Perlu lapisan temporal sendiri |
| Tooling training | Python/TypeScript relatif sederhana | Model Maker, sudah deprecated |
| Ketahanan ketika tangan gagal dideteksi | Tidak menyelesaikan sendiri | Tidak menyelesaikan sendiri |

Ada satu detail menarik. Google memakai *pretrained gesture embedding* pada jalur Model Maker. Jadi kita bisa menguji apakah representasi pretrained tersebut lebih baik daripada 56 fitur buatan R17.  [GitHub](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/gesture_recognizer.py?utm_source=chatgpt.com)

Namun **gw tidak bisa menyimpulkan custom `.task` pasti lebih akurat daripada MLP Claude**\. Belum ada eksperimen *head-to-head* untuk gesture dan perangkat lu.

Rekomendasi riset gw adalah mempertahankan dua kandidat itu sampai ada hasil perbandingan nyata. Tidak perlu membuat keduanya aktif bersama dalam produk.

## 6. Apakah paket di bawah 15 MB realistis?

BASELINE ASET NUI DI MAIN

# 17,68 MB

Total ukuran mentah Hand Landmarker, WASM SIMD, loader dan BlazeFace pada commit `3ef4cc3`, bukan hasil pengukuran download.

---

**Target download NUI**

## \<15 MB

Untuk memenuhi target ukuran mentah, perlu pengurangan setidaknya sekitar 2,68 MB. Untuk target transfer jaringan, kompresi dapat mengubah hasilnya.

Pemeriksaan dokumentasi Caddy mengonfirmasi bahwa `application/wasm` termasuk tipe yang dapat dikompresi dengan zstd atau gzip. Konfigurasi repo utama sudah mengaktifkan keduanya. Tetapi file model `.task` tidak otomatis memperoleh perlakuan kompresi yang sama jika MIME-nya tidak cocok.  [Caddy Documentation](https://caddyserver.com/docs/caddyfile/directives/encode?utm_source=chatgpt.com)

Karena itu, target 15 MB **belum dapat dinyatakan tercapai atau gagal** sebelum kita mengukur transfer aktual di deployment.

Yang paling penting, menambah classifier 127 KB tidak akan menjadi penyebab utama pembengkakan paket. Komponen terbesar justru WASM dan model Hand Landmarker.

Kalau target lu mencakup seluruh game, CSS, ilustrasi dan animasi, batas 15 MB harus dihitung dari seluruh perjalanan onboarding sampai kamera siap, bukan hanya file MediaPipe.

## 7. Pengaruh re-architecture terhadap lag browser

Gw menemukan [implementasi Web Worker resmi dari Google](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts) yang menjalankan Hand Landmarker di Worker dan menerima frame melalui `ImageBitmap`\.

Ini relevan karena `detectForVideo()` bersifat sinkron. Memindahkannya dari main thread dapat membantu mencegah Momo, canvas dan UI terhenti ketika inferensi berlangsung.

Namun **Worker tidak otomatis mengurangi pemakaian CPU, GPU atau RAM**\. Ada tambahan biaya pemindahan frame, sehingga hasilnya tetap harus dibandingkan pada perangkat siswa.

Dari keseluruhan riset, model yang lebih besar bukan otomatis solusi terbaik. Kita perlu memilih sistem berdasarkan kualitas gesture **dan** performa pengguna secara bersamaan.

| Yang diukur | Mengapa penting |
|--------|--------|
| Hand detection recall pada low-light | Apakah tangan masih ditemukan |
| Stabilitas 21 landmark | Apakah posisi jari tidak melompat-lompat |
| False Hapus per sesi | Apakah gambar siswa aman |
| Pinch false activation | Apakah canvas tidak mencoret sendiri |
| Swipe recognition | Apakah perintah gerakan bekerja |
| Latency gesture menjadi aksi | Apakah interaksi terasa responsif |
| FPS, RAM dan long tasks | Apakah UI tetap lancar |
| Cold/warm download | Apakah target paket tercapai |

Angka 0,987 dari R17 hanya menjawab sebagian kecil pengujian itu.

## 8. Hasil akhir riset dan arah yang paling masuk akal

## Arsitektur kandidat yang gw pilih untuk dibandingkan

**Webcam + adaptive preprocessing**

Input deteksi dioptimalkan, preview siswa tetap asli

**MediaPipe Hand Landmarker**

GPU/CPU fallback, idealnya inferensi terpisah dari UI

**Trained gesture recognition**

Bandingkan enhanced R17 MLP dengan custom Gesture Recognizer

**Temporal validation + hand lock + action safety**

Memisahkan prediksi gesture dari keputusan menjalankan aksi

**Canvas NUI**

Coret, Hapus, Undo, Redo

**Kenapa gw memilih arah ini?** Karena dia mengembangkan sistem yang memang sudah lu bangun. Training Claude tidak dibuang, MediaPipe tidak diganti, dan masalah low-light tidak disamarkan sebagai masalah classifier saja.

Untuk meningkatkan deteksi low-light lebih jauh, dataset DimHand dan riset XPose memberi arah yang kuat. Tetapi memakai keduanya untuk melatih jaringan visual baru adalah penelitian yang lebih besar. Belum ada bukti bahwa model hasilnya akan tetap kecil dan cepat di browser. Itu sebabnya gw menempatkannya sebagai eksperimen lanjutan jika pendekatan ringan tidak cukup.

Satu kesimpulan yang menurut gw paling penting adalah **training maksimal tidak berarti model paling besar atau jumlah epoch paling banyak.** Untuk kebutuhan lu, hasil yang maksimal berarti kualitas detection dan recognition meningkat pada kondisi siswa nyata, sementara beban model dan runtime tetap terkendali.

Jadi riset saat ini mendukung **MediaPipe-centric recognition enhancement** dengan training classifier yang lebih serius, adaptasi low-light, dan optimasi runtime. Yang belum tersedia adalah bukti bahwa seluruh kombinasi tersebut sudah memenuhi target kualitas dan paket 15 MB.

Ini masih diskusi arsitektur dan hasil riset. Belum ada keputusan untuk mengganti model, belum ada training baru, dan belum ada pekerjaan yang diarahkan ke Ujang.

![Hand Gesture Recognition in Complex Background Based on Convolutional Pose Machine and Fuzzy Gaussian Mixture Models | International Journal of Fuzzy Systems | Springer Nature Link](https://images.openai.com/static-rsc-4/YZgSFXTjI3dYC3vtt-NiExzoVjqFkM3uZzSOp5FH1guDoIK33YPN80cFA0UekFakNHTXrJyQXT6iHxYJB9FokuaLxnbRshvmrCL-EnispFAs_AAHTri16K9ffVxaxnHGl6edg8KLt19SC-f1KW3Sd4a8CDneOQ346qRwhud_tg19yrDJkz4XWUk9aL9Y1VZj?purpose=fullsize)

![#sensys2025 #ai #robotics #vr #ar #handpose #physicalai #thermalcamera #sensors #visionpro | Fangqiang Ding](https://images.openai.com/static-rsc-4/i5OQfiE-iZMsp2su-SgOm3FXBiyd0w1GwLr7BmIkTnI4czCQosPV5nniFiGnupnYvoVW0jseWFFua7yRjZfXOTJUar5xgG83VuuRnKo9Q0JeplNz-VwMMymPwfezmOxnPzCO1kXlshM6a2fCAnJcq0iQD9Kg1aouGl4q1noKKukX4koyU44oV6zrHXpjLb8s?purpose=fullsize)

---

---

## L4-M088 | User | 2026-11-17 19:17:08


message time: 2026-11-17 19:17:08

# Selected text:

## Selection 1
3. Temuan riset low-light yang paling relevan
Ini bagian yang paling penting buat kondisi lampu ruangan lu.











DimHand, ACM Multimedia 2026

Penelitian ini menggunakan 745.280 frame gerakan tangan pada intensitas cahaya 0,1 sampai 10 lux. Datasetnya mencakup 15 subjek dan 15 jenis gerakan, termasuk finger counting, finger pinching, dan finger bending.

Ini relevan karena masalah lu muncul ketika tangan bergerak, bukan hanya saat memperlihatkan pose statis. Akses dataset dilakukan melalui permohonan, bukan unduhan bebas tanpa syarat. 
hanlingzhan.github.io
## My request:
gw jg mau masukin ini, gimana? sama pastiin sangat akurat kalo ada distraksi dll gitu lah pokoknya. nah sama ada ini mumpung gw inget, kan ini game pake speedometer atau ya telunjuk doang diarahin, nah agak gimana gitu terlalu kenceng. gw mau feelnya beneran kea pake panah keyboard gt meskipun nui

---

---

## L4-M089 | Assistant | waktu tidak ada


Bisa kita masukkan **DimHand sebagai kandidat data R&amp;D low-light**, dan kontrol gerak NUI bisa dibuat terasa seperti tombol panah keyboard, bukan kursor yang terlalu sensitif. Gw cek dulu status akses DimHand dan kode movement game yang sekarang, supaya usulannya tepat dan nggak asal mengubah gesture atau kecepatan.

Gw sudah ketemu penyebab yang lebih spesifik di kode. **Speedometer itu sebenarnya indikator sudut telunjuk, bukan pengatur kecepatan.** Gerak NUI dan keyboard sama-sama mengirim arah digital ke KAPLAY dengan `WALK_SPEED = 130`. Jadi kalau NUI terasa lebih ngebut atau liar, kemungkinan besar masalahnya di perubahan sudut yang langsung menjadi perintah jalan/lompat, bukan angka speedometer itu sendiri. Ada juga celah distraksi yang perlu dibahas, karena kontrol gameplay memilih tangan tanpa memakai filter wajah yang tersedia di bagian kamera lain.

**Gw setuju DimHand masuk ke R&amp;D NUI kita, dan kontrol telunjuk Thinman perlu diubah supaya feel-nya seperti menekan tombol panah keyboard, bukan mengendalikan karakter lewat sudut tangan yang terlalu sensitif.** Dua hal ini bisa dikembangkan tanpa mengganti MediaPipe atau engine KAPLAY.

Gw sudah cek lagi dataset DimHand dan source gameplay di `main`\. Ada beberapa temuan penting.

## 1. DimHand masuknya untuk apa?

**[DimHand, ACM Multimedia 2026](https://hanlingzhan.github.io/DimHand/)**

Dataset ini punya 745.280 frame dari 15 subjek, 15 kategori gerakan, lima sudut kamera, dan pencahayaan 0,1 sampai 10 lux. Ada finger counting, finger bending, finger pinching, serta gerakan tangan alami.  [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com) [HanlingZhan/DimHand · GitHub](https://github.com/HanlingZhan/DimHand?utm_source=chatgpt.com)

Buat kebutuhan lu, DimHand punya tiga fungsi potensial.

- **Low-light benchmarking.** Mengukur seberapa sering MediaPipe kehilangan tangan atau menghasilkan landmark yang tidak stabil saat cahaya redup.
- **Data untuk pengembangan robustness.** Mempelajari bagaimana gerakan dan posisi jari berubah pada pencahayaan sulit. Ini memerlukan pemetaan anotasi ke pipeline kita.
- **Temporal evaluation.** Menguji finger counting, pinch dan transisi gesture yang tidak bisa dievaluasi secara memadai menggunakan gambar statis HaGRID saja.

Tapi ada batas penting. **DimHand bukan otomatis dataset untuk semua distraksi.** Ia difokuskan pada pose tangan dalam low-light dinamis, bukan secara khusus pada dua orang yang sama-sama menggerakkan tangan di depan kamera.

Selain itu, akses dataset masih menggunakan formulir permohonan. Formulir resminya mensyaratkan penggunaan untuk penelitian akademik, tanpa redistribusi maupun penggunaan komersial. Izin penyebaran model hasil training tetap perlu diperiksa secara spesifik.  [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com)

Jadi status yang benar sekarang adalah **kandidat dataset untuk R&amp;D, belum diunduh atau digunakan dalam training kita**\.

## 2. Supaya akurat walaupun ada distraksi, masalahnya bukan cuma classifier

Misalnya lu lagi memainkan Thinman, lalu ada teman lewat di belakang dan tangannya masuk kamera.

Kalau model mengenali gesture teman itu dengan sangat akurat, tetapi sistem mengira itu tangan lu, karakter tetap akan bergerak salah.

Berarti kita perlu **akurasi pengenalan gesture dan akurasi pemilihan tangan pemain**\.

**Kamera + adaptive low-light processing**

**MediaPipe Hand Landmarker**

Membaca hingga dua tangan

**Player hand ownership**

Memilih tangan pemain, mempertahankan lock, menolak perpindahan yang ambigu

**Trained gesture classifier + temporal validation**

Gerakan stabil, confidence masuk akal, false activation ditekan

**Input yang aman → Gameplay**

Ada temuan spesifik dari repo lu.

**`gameplay-hand-driver.ts` sekarang memanggil `pickPrimaryHand()` tanpa memberikan data wajah pemain.** Padahal `primary-hand.ts` sudah mendukung penyaringan berdasarkan area wajah.

Artinya, kontrol gameplay masih bisa memilih kandidat tangan berdasarkan posisi, ukuran dan histori lock tanpa verifikasi area wajah. Kalau lock hilang cukup lama, tangan lain yang lebih dominan bisa menjadi kandidat baru.

Ini celah yang nyata untuk kasus distraksi, walaupun belum terbukti menyebabkan bug tertentu di webcam lu.

Menurut gw, syarat sistem yang lebih robust adalah ketika terjadi persilangan tangan, beberapa kandidat mirip, atau tracking hilang, **Thinman lebih baik berhenti sebentar daripada menerima perintah dari tangan yang salah**\.

Yang harus diuji mencakup orang lewat, tangan orang lain mendekat ke kamera, dua tangan bersilangan, sebagian tangan tertutup, benda menyerupai tangan, serta gesture tidak disengaja.

Tidak ada model yang bisa dijamin 100% akurat dalam semua kondisi. Target yang masuk akal adalah **kesalahan terukur sekecil mungkin, dan kegagalan yang tidak menghasilkan aksi berbahaya**\.

## 3. Soal speedometer, gw menemukan penyebab konkretnya

Di `main`, kontrol gameplay menggunakan sudut telunjuk.

| Sudut telunjuk | Aksi saat ini |
|--------|--------|
| Mendekati horizontal kanan | Jalan kanan |
| Diagonal kanan atas | Lompat + kanan |
| Tegak ke atas | Lompat |
| Diagonal kiri atas | Lompat + kiri |
| Mendekati horizontal kiri | Jalan kiri |
| Di luar zona aksi | Berhenti |

Sistem ini menggunakan hysteresis sudut 5° dan menunggu tiga frame saat tangan baru terdeteksi kembali.

Tapi yang lebih menarik, **speedometer di UI cuma menampilkan sudut telunjuk**\. Dia bukan kontrol kecepatan karakter.

Di `src/game/runtime/constants.ts`, `WALK_SPEED` sekarang **130 world pixel per detik**\. Keyboard dan gesture sama-sama mengirim input digital `left`, `right`, `jump` ke engine KAPLAY.

Jadi bukan karena gesture mempunyai speed multiplier tersembunyi. Yang mungkin membuatnya terasa terlalu cepat adalah perubahan sudut telunjuk langsung diterjemahkan menjadi perintah jalan atau lompat, dengan transisi yang kurang stabil.

## 4. Feel keyboard yang sebenarnya lu mau

Menurut gw, kita tetap mempertahankan ide menunjuk arah, tetapi hasilnya harus berperilaku seperti **virtual keyboard**\.

**KIRI**

Tahan arah, jalan stabil

**LOMPAT**

Satu trigger yang jelas

**KANAN**

Lepas arah, berhenti

Perubahannya bukan mengganti gesture menjadi tombol virtual di layar. **Telunjuk tetap digunakan, tetapi dibaca sebagai niat menekan dan melepaskan tombol.**

Misalnya lu menunjuk kanan. Setelah arahnya cukup stabil, sistem menganggap tombol kanan sedang ditahan. Thinman berjalan dengan aturan movement yang sama seperti keyboard. Ketika jari kembali ke posisi netral, tombol virtual dilepas.

Ada empat hal yang menurut gw akan sangat memengaruhi feel-nya.

**Pertama, neutral zone lebih nyaman.** Tangan manusia tidak selalu diam sempurna. Kita perlu posisi netral yang cukup toleran dan bisa dikalibrasi, supaya sedikit perubahan sudut tidak langsung menggerakkan Thinman.

**Kedua, kestabilan arah berdasarkan waktu, bukan sekadar satu frame.** Misalnya kandidat arah perlu stabil sekitar 80 sampai 120 ms sebelum mengaktifkan gerakan. Ini hanya parameter awal eksperimen, belum angka yang tervalidasi.

**Ketiga, lompat sebagai input yang disengaja.** Arah atas harus menghasilkan trigger lompat yang jelas, dengan penanganan saat jari ditahan agar tidak terjadi pengulangan yang tidak diinginkan. Source game sudah punya *jump buffer* dan *coyote time*, jadi mekanisme itu sebaiknya dipertahankan.

**Keempat, gerakan karakter tidak mengikuti jitter landmark.** Gesture boleh sedikit bergetar, tetapi input yang diterima KAPLAY tetap stabil. Tidak perlu membangun sistem fisika kedua.

Dan satu hal lagi, **gw tidak menyarankan langsung menurunkan WALK\_SPEED dari 130**\. Kalau keyboard sebenarnya sudah nyaman, yang perlu dibenahi dulu adalah kontrol NUI-nya. Menurunkan kecepatan global bisa mengubah jarak lompatan dan keterselesaian level.

## 5. Bagaimana semua ini masuk ke R&amp;D yang sedang kita bahas?

| Area | Sumber atau pendekatan | Target |
|--------|--------|--------|
| Gesture statis | HaGRIDv2 + classifier Claude yang dikembangkan | 3/4/5 jari, false Hapus, tangan alami |
| Gerakan temporal | IPN HandS dan rekaman yang relevan | Swipe, pinch, perubahan pose |
| Low-light dinamis | **DimHand** | Deteksi dan kestabilan landmark dalam cahaya sulit |
| Distraksi | Skenario multi-tangan, occlusion, orang lewat dan data uji berizin | Tangan pemain tidak tertukar |
| Movement feel | Digital input adapter ke KAPLAY | Rasa kontrol seperti tombol panah |
| Performa | Benchmark browser | Total transfer NUI di bawah 15 MB, respons dan RAM terkendali |

DimHand tidak perlu diunduh pengguna siswa. Data tersebut hanya digunakan di lingkungan riset atau training jika izin memungkinkan. Pengguna nantinya cukup mengunduh model dan runtime yang dipilih.

**Jadi dua arah yang gw ambil dari permintaan terbaru lu adalah memperkuat NUI terhadap distraksi dan low-light, serta membenahi feel gerakan Thinman tanpa mengorbankan kontrol telunjuk.** Keduanya saling berkaitan, tetapi movement feel tidak harus menunggu retraining model selesai.

Masih ada satu konflik dengan keputusan aktif **D-20261110-09** yang menetapkan sudut telunjuk sebagai kontrol Thinman. Permintaan lu sekarang tidak otomatis membatalkan mapping itu, tetapi menuntut perubahan cara mapping dijadikan input dan bagaimana gerakannya dirasakan siswa.

⚠️ Kandidat perubahan **keputusan** terdeteksi

- Ringkasan: Penambahan DimHand sebagai kandidat data R&amp;D low-light, penguatan penolakan distraksi, serta perubahan feel kontrol Thinman menjadi seperti keyboard walaupun tetap menggunakan NUI.
- Entri lama yang mungkin terdampak: D-20261110-09 terkait kontrol sudut telunjuk dan aturan NUI/gameplay yang terkait.
- Status bukti: keputusan eksplisit untuk arah pengembangan, belum cukup bukti untuk mengunci parameter atau implementasi.
- Tindakan: `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

![HandFormer: A Dynamic Hand Gesture Recognition Method Based on Attention Mechanism](https://images.openai.com/static-rsc-4/tyTXsW6V_DeA94mGdo3_cItKzu8DX3EdP05gkjWMR7tZylG9ObHT1CArMwg8o9_EJDEzZY1SsB4QS9MkNYcsH7T8MDU9xiu56bqvtHf-CgkQ3M8FOgkDB4Br_EG98NIetwiaTK9mXfSzs9NzrO21djdBpQ5AtsEg_jkEFOou4JyR67hezr5BhcQ_dmXxLmwD?purpose=fullsize)

---

---

## L4-M090 | User | 2026-11-17 19:24:17


message time: 2026-11-17 19:24:17

iya masuk rnd aja, ini baru. biikin md baru. terus maksud gw distraksi ni ya bukan tangan aja, bisa aja benda apapun yang ga kontras sama warna kulit, soalnya kan warna kulit orang beda2 gitu loh dan soal gestur thinman jalan itu ya lu masukin rind. rnd ini versi berapa gitu lah lu tulis file mdnya yang enak dibaca

---

---
