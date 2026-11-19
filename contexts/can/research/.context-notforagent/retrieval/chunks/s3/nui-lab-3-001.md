# NUI Lab 3 | pesan 1-7

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afacbc9-6d4c-83ec-bf1a-02c09c6d5c15
> Source Git blob: f8a59b5787461c4c113edb821fc7d16a53a31fcb

## L3-M001 | User | 2026-11-13 19:11:33


message time: 2026-11-13 19:11:33

cariin di internet dong alternative mediapipe finger tracking/mediapipe hands yang lebih akurat dan banyak stars di github gitu sama enteng dan aman di lowlight. kasih gw 5 opsi nomer satu paling ok testinya

---

---

## L3-M002 | Assistant | waktu tidak ada


Gue bakal bandingin kandidat dari GitHub dan benchmark yang tersedia, termasuk stars, akurasi landmark jari, performa real-time, serta pengalaman pengguna. Khusus low-light, gue bakal pisahin klaim yang benar-benar sudah diuji dari yang sekadar demo bagus.

Temuan awalnya menarik: repo dengan stars paling tinggi justru belum tentu cocok buat pengganti MediaPipe Hands. Ada yang populer tapi berat, ada yang lebih presisi untuk rekonstruksi 3D tetapi butuh GPU. Kandidat paling masuk akal buat real-time sejauh ini adalah keluarga RTMPose, sementara WiLoR punya bukti riset yang lebih relevan untuk kondisi pencahayaan bervariasi.

Gue udah telusuri GitHub, dokumentasi model, benchmark, beberapa issue pengguna, dan diskusi komunitas. Per **13 November 2026**, ada 5 kandidat yang layak dipertimbangkan buat menggantikan MediaPipe Hands.

Tapi ada satu temuan penting: **belum ada kandidat yang terbukti sekaligus lebih akurat dari MediaPipe, lebih ringan, dan lebih tahan low-light dalam pengujian head-to-head yang sama.** Jadi gue urutkan berdasarkan keseimbangan performa, kematangan repo, kemudahan implementasi, dan bukti pengujiannya, bukan stars doang.

## Top 5 alternatif MediaPipe Hands

## 1. RTMPose Hand + rtmlib

(Pilihan utama)

8.1k MMPose  702 rtmlib Apache 2.0

**Kenapa nomor satu\:** RTMPose punya model khusus hand keypoints, sedangkan rtmlib menyediakan implementasi ONNX yang lebih sederhana tanpa dependensi besar seperti MMCV dan MMDetection. Mendukung 21 keypoints dan CPU inference.  [GitHub](https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/inference.md?utm_source=chatgpt.com) [GitHub](https://github.com/Tau-J/rtmlib?utm_source=chatgpt.com)

**Bukti/testimoni\:** komunitas GitHub menggunakan RTMPose untuk real-time pose estimation. Namun, ada permintaan pengguna agar rtmlib menambahkan filtering untuk mengurangi jitter, yang belum direncanakan maintainer. Jadi kestabilan tracking tetap perlu diuji.  [GitHub](https://github.com/Tau-J/rtmlib/issues/58?utm_source=chatgpt.com) [GitHub](https://github.com/open-mmlab/mmpose/discussions/3135?utm_source=chatgpt.com)

**Low-light\:** belum menemukan benchmark khusus yang membuktikan lebih unggul dari MediaPipe saat pencahayaan rendah.

Paling cocok untuk prototipe real-time Python/OpenCV, terutama saat ingin fleksibilitas CPU dan optimasi ONNX.

[GitHub rtmlib](https://github.com/Tau-J/rtmlib) · [GitHub MMPose](https://github.com/open-mmlab/mmpose)

---

## 2. Ultralytics YOLO26 Pose — Hand Keypoints

63.3k stars AGPL 3.0 / Enterprise

YOLO punya ekosistem sangat matang untuk deteksi dan custom training. Varian nano cocok dijadikan kandidat inference ringan. Dataset resmi hand keypoints menyediakan 26.768 gambar dan 21 titik landmark. **Namun model pose standar bukan model tangan siap pakai; perlu fine-tuning.**  [GitHub](https://github.com/ultralytics/ultralytics?utm_source=chatgpt.com) [Ultralytics](https://docs.ultralytics.com/datasets/pose/hand-keypoints?utm_source=chatgpt.com)

**Bukti pengujian\:** implementasi komunitas YOLO26s hand pose melaporkan mAP50 0,942 dan mAP50–95 0,843 pada dataset hand keypoints. Ini laporan pembuat model, bukan pengujian independen atau bukti mengungguli MediaPipe. Label dataset tersebut juga berasal dari MediaPipe.  [GitHub](https://github.com/marceloeatworld/yolo26-training?utm_source=chatgpt.com) [Ultralytics](https://docs.ultralytics.com/datasets/pose/hand-keypoints?utm_source=chatgpt.com)

**Low-light\:** berpotensi bagus setelah fine-tuning menggunakan data gelap yang representatif, tetapi belum terverifikasi sebagai keunggulan bawaan.

Paling cocok kalau lo bersedia melatih model sendiri untuk lingkungan kamera tertentu.

[GitHub Ultralytics](https://github.com/ultralytics/ultralytics)

---

## 3. WiLoR

741 stars Model nonkomersial

WiLoR adalah model rekonstruksi tangan 3D dari riset CVPR 2025. Dataset pengembangannya mencakup variasi pencahayaan dan occlusion, dengan opsi `--fast` yang diklaim mempercepat inference hingga 1,6×.  [openaccess.thecvf.com](https://openaccess.thecvf.com/content/CVPR2025/papers/Potamias_WiLoR_End-to-end_3D_Hand_Localization_and_Reconstruction_in-the-wild_CVPR_2025_paper.pdf?utm_source=chatgpt.com) [GitHub](https://github.com/rolpotamias/WiLoR?utm_source=chatgpt.com)

**Bukti low-light paling kuat di daftar ini\:** studi CHI 2026 melaporkan error 3D sebesar 15,4 mm untuk WiLoR dibanding 45,2 mm untuk MediaPipe pada kondisi low illumination. Itu hasil pada setup penelitian tertentu, bukan jaminan webcam biasa.  [DOI](https://doi.org/10.1145/3772318.3790626?utm_source=chatgpt.com)

**Kekurangan\:** memerlukan stack PyTorch/GPU yang jauh lebih berat dari MediaPipe, dengan batasan lisensi model.

Paling menarik untuk akurasi 3D dan riset low-light, tetapi bukan pilihan utama untuk perangkat CPU lemah.

[GitHub WiLoR](https://github.com/rolpotamias/WiLoR)

---

## 4. OpenPose — Hand Keypoint Detection

34.6k stars Nonkomersial gratis

Salah satu proyek paling mapan untuk pelacakan tubuh dan tangan. Mendukung 21 keypoints per tangan dan beberapa orang sekaligus. Memiliki dukungan C++, Python, serta CPU/GPU.  [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose?utm_source=chatgpt.com)

**Bukti komunitas\:** punya rekam jejak riset panjang dan adopsi besar, tetapi itu tidak membuktikan performa lebih baik dari MediaPipe. Riset robustness juga menemukan bahwa variasi pencahayaan, motion blur, dan occlusion masih menjadi tantangan model-model hand pose, termasuk OpenPose.  [IEEE Xplore](https://ieeexplore.ieee.org/abstract/document/10190429?utm_source=chatgpt.com)

**Kekurangan\:** instalasi dan komputasi relatif berat; bukan pengganti praktis untuk aplikasi ringan.

[GitHub OpenPose](https://github.com/CMU-Perceptual-Computing-Lab/openpose)

---

## 5. HaMeR — Hand Mesh Recovery

1.2k stars MIT code, model dependencies restricted

Menggunakan transformer untuk merekonstruksi bentuk tangan 3D dengan detail tinggi. Lebih berorientasi pada rekonstruksi daripada tracking jari ringan.  [GitHub](https://github.com/geopavlakos/hamer?utm_source=chatgpt.com)

**Bukti benchmark\:** pengujian egoBench mencatat PA-MPJPE 11,1 mm untuk HaMeR dibanding 17,8 mm untuk MediaPipe pada pengaturan tersebut. Namun, untuk absolute world-position error, MediaPipe + PnP justru mengungguli HaMeR + PnP.  [GitHub](https://github.com/stray128/egoBench?utm_source=chatgpt.com)

**Kekurangan\:** model besar, kebutuhan GPU tinggi, dan belum ada bukti yang cukup bahwa HaMeR lebih tahan low-light untuk webcam real-time.

[GitHub HaMeR](https://github.com/geopavlakos/hamer)

## Perbandingan cepat

| Model | Ringan | Bukti akurasi lebih baik | Bukti low-light |
|--------|--------|--------|--------|
| **RTMPose + rtmlib** | Relatif | Belum vs MediaPipe | Belum |
| YOLO26 Hand | Bisa, varian nano | Hasil fine-tuning tersedia | Belum |
| WiLoR | Tidak | Ada, pada metrik tertentu | Ada |
| OpenPose | Tidak | Belum secara umum | Terbatas |
| HaMeR | Tidak | Ada, pada metrik tertentu | Belum |

## Jadi, mana yang gue pilih?

**RTMPose Hand melalui rtmlib** adalah pilihan pertama untuk *dicoba*, bukan otomatis pemenang akurasi. Integrasinya relatif ringan dan tidak menuntut GPU besar. Tapi buat kebutuhan low-light, **WiLoR justru punya bukti lebih kuat**, dengan konsekuensi kebutuhan komputasi jauh lebih tinggi.

Ada temuan yang juga penting: dalam diskusi Reddit pada November 2026, seorang pembuat sistem motion capture menyebut RTMPose whole-body cepat dan stabil untuk 2D, tetapi tetap memakai MediaPipe untuk kedalaman jari. Ini tidak langsung menguji RTMPose Hand khusus, tetapi memperkuat alasan untuk tidak menganggap semua model RTMPose unggul dalam finger tracking.  [Reddit](https://www.reddit.com/r/TouchDesigner/comments/1xs0chj/motion_capture_studio_in_touchdesginer/?utm_source=chatgpt.com)

Kalau target lo adalah webcam real-time, gue akan benchmark RTMPose melawan MediaPipe pada rekaman yang sama dalam tiga kondisi: pencahayaan normal, redup, dan redup dengan gerakan cepat. Ukur detection recall, error ujung jari, jitter, FPS, dan penggunaan RAM. Tanpa pengujian itu, mengganti engine bisa saja malah menurunkan kualitas.

**Satu pertanyaan penting\:** finger tracking ini mau lo pakai di **web/browser (JavaScript)** atau **Python/OpenCV di desktop**? Soalnya kalau browser, rankingnya bisa berubah cukup jauh.

---

---

## L3-M003 | User | 2026-11-13 19:23:30


message time: 2026-11-13 19:23:30

아,  kenapa bukan open pose aja yang dipakai? Kan dia udah banyak stars-nya, tapi apakah berat buat client side?

---

---

## L3-M004 | Assistant | waktu tidak ada


Iya, **OpenPose memang berat buat client-side, terutama kalau yang lo maksud aplikasi web yang berjalan langsung di browser pengguna.**

Tapi bukan berarti OpenPose jelek. Justru dia termasuk proyek computer vision yang matang, punya puluhan ribu GitHub stars, dan mendukung 21 landmark per tangan.

Masalahnya, **OpenPose dirancang untuk kebutuhan yang berbeda dari MediaPipe Hands.**

## 1. Seberapa berat OpenPose?

Ini kebutuhan hardware dari dokumentasi resmi OpenPose, bukan perkiraan gue.

| Kebutuhan | OpenPose |
|--------|--------|
| GPU NVIDIA | Minimal sekitar 1,6 GB VRAM tersedia |
| RAM dengan GPU | Sekitar 2–2,5 GB |
| CPU-only | Sekitar 8 GB RAM |
| CPU disarankan | Minimal 8 core |
| Browser native | Tidak tersedia secara resmi |
| Framework utama | C++, Caffe, CUDA/OpenCL |

 [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/installation/0_index.md?plain=1&utm_source=chatgpt.com) [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/installation/1_prerequisites.md?utm_source=chatgpt.com)

Angka RAM tersebut adalah kebutuhan sistem yang dicantumkan untuk konfigurasi OpenPose, **bukan berarti modelnya sendiri memakan 8 GB RAM**\.

Bahkan dokumentasinya menyebut bahwa mengaktifkan hand detection akan menambah kebutuhan GPU dan memperlambat inference.  [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/include/openpose/flags.hpp?utm_source=chatgpt.com)

Jadi untuk website yang penggunanya bisa pakai laptop biasa, HP Android, atau iPhone, OpenPose tidak ideal.

## 2. Kenapa GitHub stars-nya banyak, tapi bukan pilihan pertama?

Stars OpenPose mencerminkan pengaruhnya di dunia riset dan computer vision, bukan jaminan efisiensi inference.

Ada perbedaan arsitektur yang cukup penting\:

OpenPose — konfigurasi hand detection standar

Frame dari kamera

Deteksi pose tubuh

Estimasi lokasi tangan

Deteksi 21 landmark jari

OpenPose juga mendukung bounding box tangan yang disediakan dari luar, sehingga tahap deteksi tubuh dapat dilewati dengan integrasi khusus.  [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/include/openpose/wrapper/wrapperAuxiliary.hpp?utm_source=chatgpt.com)

---

MediaPipe Hands — mode video

Frame dari kamera

Deteksi telapak tangan

Estimasi 21 landmark jari

Memanfaatkan tracking dari frame sebelumnya agar tidak selalu perlu menjalankan deteksi ulang.

 [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js?authuser=01&utm_source=chatgpt.com)

Selain itu, MediaPipe memang menyediakan JavaScript SDK berbasis WebAssembly dan akselerasi GPU untuk browser. OpenPose resmi menyediakan API C++ dan Python, bukan paket browser siap pakai.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/setup_web?utm_source=chatgpt.com) [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose?utm_source=chatgpt.com)

## 3. Bagaimana kalau dipaksakan client-side?

Tergantung platformnya\:

- **Browser laptop/HP\:** tidak gue rekomendasikan. Perlu porting runtime/model, mengatasi kompatibilitas browser, dan mengoptimalkan performanya sendiri.
- **Aplikasi desktop native dengan NVIDIA GPU\:** OpenPose masih layak dicoba.
- **Client-side dengan CPU atau perangkat low-end\:** MediaPipe lebih masuk akal sebagai baseline.

Dan soal **low-light**, OpenPose juga belum terbukti secara umum lebih tahan cahaya redup dibanding MediaPipe. GPU kuat sekalipun tidak otomatis membuat input kamera gelap lebih mudah dikenali.

## Kesimpulan

Kalau prioritas lo **finger tracking akurat + low-light + ringan + client-side**, gue tetap tidak akan menempatkan OpenPose di nomor satu.

Bahkan ada kemungkinan **MediaPipe Hands yang sudah dioptimalkan untuk pencahayaan redup lebih efektif** daripada menggantinya dengan OpenPose yang jauh lebih berat.

Tapi gue pengin pastiin satu hal: **client-side yang lo maksud browser web (JavaScript), atau aplikasi desktop yang inference-nya berjalan lokal di PC pengguna?** Karena itu bakal sangat menentukan pilihan model terbaiknya.

---

---

## L3-M005 | User | 2026-11-14 05:19:40


message time: 2026-11-14 05:19:40

Ini, media, gue pakai media pipe hands untuk client side-nya. Terus di server pakai OpenPose gini bisa nggak ya? Tapi latency ya. Tapi ya gimana lagi biar low latency ada acara ngakalinnya nggak lo? Soalnya ini beneran, gue butuh engineering, cuma pakai kamera. Jadi bisa detection tangan gitu loh. Nggak pakai lidar, nggak pakai Kinect

---

---

## L3-M006 | Assistant | waktu tidak ada


Bisa, dan arsitektur hybrid itu masuk akal. Tapi kuncinya bukan mengirim semua frame ke OpenPose: MediaPipe harus tetap responsif di browser, sementara server hanya membantu saat tracking mulai tidak yakin. Gue cek dulu opsi hand-only OpenPose dan transport yang cocok supaya desainnya nggak malah menambah lag.

**Bisa banget. Bahkan ada pendekatan hybrid yang menurut gue jauh lebih masuk akal daripada mengganti MediaPipe Hands sepenuhnya dengan OpenPose.**

Lo tetap pakai kamera RGB biasa, tanpa LiDAR, Kinect, atau depth sensor. MediaPipe menangani tracking real-time di browser, sedangkan OpenPose di server menjadi *secondary estimator* untuk membantu mengoreksi landmark tangan.

Tapi ada satu prinsip engineering penting\:

**Jangan sampai browser harus menunggu hasil OpenPose sebelum bisa menampilkan gerakan tangan.** Kalau begitu, latency jaringan dan inference server bakal langsung terasa di setiap gerakan.

## 1. Arsitektur yang gue usulkan

**RGB Webcam / Kamera HP**

Single camera, 30 FPS sebagai target awal

**CLIENT — Browser** (Real-time)

MediaPipe Hands

21 landmarks + bounding box

Prediksi + smoothing

Crop tangan

**Render gesture / interaksi langsung**

Tidak menunggu server

Async: ROI image + timestamp ↔ koreksi landmark

**SERVER — GPU** (Asynchronous)

OpenPose Hand-Only

Inference hanya pada area tangan

Validasi + 21 refined keypoints

Ternyata **OpenPose secara resmi mendukung standalone hand estimation**\. Melalui konfigurasi `--body 0 --hand --hand_detector 2`, kita bisa memberikan lokasi tangan sendiri tanpa menjalankan body pose estimation. Implementasinya menggunakan C++ API dan rectangular bounding box.  [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/advanced/standalone_face_or_hand_keypoint_detector.md?utm_source=chatgpt.com)

Artinya, MediaPipe bisa membantu mencari posisi tangan, lalu OpenPose tinggal mengestimasi landmark pada area tersebut. Ini menghindari pekerjaan deteksi tubuh yang tidak diperlukan.

Namun, hasil OpenPose belum tentu lebih akurat dari MediaPipe. Kita tetap perlu mengukur error-nya agar server tidak justru mengoreksi landmark yang sudah benar.

## 2. Lima optimasi supaya latency rendah

**Kirim potongan tangan, bukan seluruh video.**

Gunakan bounding box dari MediaPipe, tambahkan margin sekitar 10–20%, lalu buat ROI persegi. OpenPose sendiri merekomendasikan margin serupa untuk standalone hand inference.  [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/advanced/standalone_face_or_hand_keypoint_detector.md?utm_source=chatgpt.com)

Misalnya, dari kamera 1280×720 cukup kirim crop tangan sekitar 256–384 piksel. Jangan mengompresi terlalu agresif sampai detail jari hilang.

---

**Jangan mengirim 30 FPS ke server.**

MediaPipe tetap berjalan lokal dengan target 30 FPS. Server cukup menerima 3–8 sampel/detik sebagai konfigurasi awal, atau dipanggil ketika tracking terlihat tidak stabil.

Jika OpenPose belum selesai memproses frame sebelumnya, buang frame lama dan prioritaskan yang paling baru (*latest-frame-wins*\).

---

**Mulai dengan WebSocket, bukan request HTTP berulang.**

WebSocket cocok untuk prototipe karena koneksinya persisten. Tetapi implementasikan pembatasan antrean memakai `bufferedAmount` dan maksimal satu request inference yang sedang berjalan per sesi.  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/bufferedAmount?utm_source=chatgpt.com)

Kalau nanti benar-benar perlu streaming video kontinu, pertimbangkan WebRTC. Data channel bisa dikonfigurasi tanpa kewajiban pengiriman berurutan.  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createDataChannel?utm_source=chatgpt.com)

---

**Gunakan One Euro Filter untuk landmark.**

Filter ini menyesuaikan smoothing dengan kecepatan gerakan: jari diam dibuat lebih stabil, sementara jari bergerak cepat tidak terlalu tertahan. Metode tersebut memang dirancang untuk menekan jitter tanpa menambah banyak lag.  [pepite-depot.univ-lille.fr](https://pepite-depot.univ-lille.fr/LIBRE/HDR/2012/HDR2012LIL102.pdf?utm_source=chatgpt.com)

Kalau perlu, tambahkan prediksi posisi jangka pendek dengan pembatasan agar tangan tidak terlihat bergerak melampaui posisi aslinya.

---

**Jalankan model OpenPose sekali, tetap aktif di GPU.**

Jangan load model setiap request. Mulai dari `hand_scale_number=1` dan uji resolusi input tangan 256×256 versus default 368×368. Dokumentasi OpenPose mengonfirmasi pengurangan resolusi dapat mempercepat inference, dengan konsekuensi akurasi.  [GitHub](https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/doc/advanced/demo_advanced.md?utm_source=chatgpt.com)

## 3. Bagaimana dengan latency sebenarnya?

Kita bisa mengestimasi *jalur server* menggunakan asumsi hipotetis berikut.

Simulasi latency server correction

---

**Total simulasi**

# ms

Ini ilustrasi perhitungan, bukan hasil benchmark OpenPose. Belum termasuk antrean server dan penundaan capture kamera; performa aktual sangat bergantung pada GPU, jaringan, dan jumlah pengguna.

Kalau server mengembalikan hasil sekitar 96 ms kemudian, browser mungkin sudah memproses 2–3 frame baru.

Makanya **jangan langsung menimpa landmark terkini dengan hasil server dari frame lama.** Gunakan `frameId` dan timestamp untuk menyelaraskan hasil, bandingkan estimasi kedua model pada frame yang sama, lalu terapkan koreksi secara bertahap. Kalau hasilnya sudah terlalu lama, buang.

Server juga tidak harus selalu dipercaya: kalau estimasi OpenPose menyimpang dari anatomi atau pergerakan tangan yang masuk akal, pertahankan estimasi lokal.

## 4. Masalah low-light: justru di sinilah tantangannya

Ada satu masalah fundamental. **OpenPose tidak otomatis bisa melihat tangan yang gagal terlihat oleh MediaPipe.** Kalau gambar gelap, penuh noise, atau jari mengalami motion blur, keduanya menerima informasi visual yang sama-sama terbatas.

Bahkan kalau MediaPipe kehilangan tangan sepenuhnya, arsitektur hand-only tadi kehilangan bounding box untuk dikirim. Solusinya perlu jalur fallback: perluas ROI terakhir selama beberapa frame atau kirim frame penuh sesekali ke detektor tangan server yang independen.

Gue akan menambahkan *low-light pipeline* dengan urutan berikut\:

1. **Camera-aware enhancement\:** periksa exposure, noise, dan brightness. Sesuaikan exposure kamera jika perangkat/browser mendukungnya, tanpa membuat shutter terlalu lambat.
2. **Selective enhancement\:** uji CLAHE/gamma pada ROI saja, dan kombinasikan dengan denoising ringan. Jangan menganggap gambar yang terlihat lebih terang pasti lebih akurat untuk model.
3. **Temporal tracking\:** gunakan informasi frame sebelumnya saat keypoint hilang sementara, dengan batas waktu dan ketidakpastian.
4. **Server verification\:** validasi landmark lewat model kedua ketika hasil lokal meragukan.

Ada juga riset menarik bernama **XPose: Towards Extreme Low Light Hand Pose Estimation** \(WACV 2025). Penelitinya menggunakan dataset sekitar 120.000 gambar dan mengembangkan metode khusus estimasi tangan pada kondisi sangat gelap, termasuk di bawah 1 lux. Ini lebih relevan untuk riset ketahanan low-light daripada sekadar memilih model yang stars-nya tinggi, meski belum berarti cocok untuk real-time production.  [openaccess.thecvf.com](https://openaccess.thecvf.com/content/WACV2025/html/Rosh_XPose_Towards_Extreme_Low_Light_Hand_Pose_Estimation_WACV_2025_paper.html?utm_source=chatgpt.com)

## 5. Satu keterbatasan kamera RGB yang perlu lo tahu

Dengan satu kamera RGB biasa, lo bisa mendeteksi 21 landmark, posisi 2D, gesture, arah jari, dan mengestimasi bentuk tangan 3D.

Tetapi lo tidak otomatis mendapatkan **kedalaman absolut yang akurat** atau posisi ujung jari dalam ruang fisik, terutama ketika jari menutupi satu sama lain. MediaPipe menyediakan world landmarks 3D yang diestimasi model, tetapi itu bukan pengukuran kedalaman sensor. OpenPose Hand standar pun merupakan estimator 2D.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?tab=Python&utm_source=chatgpt.com) [GitHub](https://github.com/cmu-perceptual-computing-lab/openpose?utm_source=chatgpt.com)

Jadi kalau targetnya gesture control, virtual button, pinch, drag, atau interaksi layar, satu kamera sangat memungkinkan. Kalau targetnya pengukuran posisi 3D absolut dengan presisi tinggi, tantangannya jauh lebih sulit.

## 6. Stack yang akan gue pakai

| Layer | Teknologi |
|--------|--------|
| Camera capture | getUserMedia, 720p/30 FPS sebagai target |
| Client inference | MediaPipe Hand Landmarker |
| Threading | Web Worker jika kompatibel dengan jalur GPU |
| Stabilization | One Euro Filter |
| Transport | WebSocket + binary JPEG ROI |
| Backend API | Python FastAPI |
| GPU inference | OpenPose Hand-only |
| Latency control | Latest-frame-wins, timestamp matching |
| Fallback | Local-only tracking saat server lambat |

Google sendiri mencatat `detectForVideo()` pada MediaPipe Web berjalan sinkron dan dapat memblokir UI thread, sehingga pemisahan inference dari rendering perlu diperhatikan.  [Google for Developers](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js?authuser=01&utm_source=chatgpt.com)

**Saran gue\:** prototipekan dua server estimator, OpenPose Hand-only dan RTMPose Hand ONNX. Uji keduanya dengan video yang identik sebelum memilih satu. Jangan dulu membangun mekanisme fusion rumit sebelum terbukti estimator server memang memperbaiki hasil MediaPipe.

---

Nah, gue perlu tahu **satu hal paling menentukan**\: tracking tangan lo ini dipakai buat apa persisnya?

Apakah untuk **gesture control** \(pinch, klik, drag, menggerakkan objek), **tracking setiap ruas jari secara presisi**, atau **interaksi 3D/AR**?

Soalnya kalau cuma gesture control, ada pendekatan yang bisa memangkas hampir seluruh kebutuhan server dan memberi latency jauh lebih rendah.

---

---

## L3-M007 | User | 2026-11-14 05:23:56


message time: 2026-11-14 05:23:56

Lu udah gue pindah ke konteks proyek gue. Kira-kira bisa nggak ya? Dan apa ya, itu juga tergantung dari internet di tempat kan. Nah, gue udah coba pakai kamera laptop gue Asus tuh gaming. Ya kita nggak tahu di user itu kameranya kayak gimana. Tapi di kamera gue itu masih gemeter buat gambar. Terus buat deteksi kadang kedeteksi, kedistraksi sama muka. Jadi kalau tangan udah masuk ke ranah muka, itu susah dideteksi

---

---
