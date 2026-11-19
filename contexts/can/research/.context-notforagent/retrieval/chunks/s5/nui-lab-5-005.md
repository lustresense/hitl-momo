# NUI Lab 5 | pesan 45-52

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afd086e-fa98-83ec-9e5c-9ab57e130980
> Source Git blob: ac091ca4786657adbcb787ba32a6fb0900ae5086

## L5-M045 | Assistant | waktu tidak ada


Gw bakal cari 20 dataset yang bisa dipertanggungjawabkan, bukan sekadar daftar nama. Gw pisahkan dataset low-light asli, gesture/jari dengan gangguan, dan dataset untuk augmentasi cahaya, lalu cek akses serta lisensinya. Sambil itu gw susun prompt riset paralel yang bisa lu kirim ke Agy maupun Meta AI.

**Banyakin data dan training ulang bisa membantu, tapi belum tentu memperbaiki masalah yang lu rasain di webcam.** Gw justru menemukan beberapa dataset gratis yang lebih dekat dengan kondisi penggunaan lu dibanding sekadar menambah data IPN.

Masalahnya perlu dipisah.

- **Tangan hilang saat low-light atau backlight.** Ini masalah gambar dan deteksi landmark MediaPipe. Menambah data untuk MLP UX3 saja tidak cukup.
- **Tangan terdeteksi, tetapi tiga/lima jari, pinch, atau swipe salah.** Ini bisa menjadi target retraining classifier, asalkan label dan data yang dipakai sesuai.
- **Gesture benar, tetapi gambar/hapus terasa terlambat atau salah terpicu.** Ini juga melibatkan temporal filtering, hand lock, cooldown, dan logika tindakan.

Ada temuan penting. **LLHands memang dataset low-light tangan berisi sekitar 120 ribu gambar, tetapi halaman resmi DimHand menandainya tidak dapat diakses.** Jadi jangan menyuruh agent langsung mengunduh LLHands tanpa bukti akses. Sebaliknya, beberapa dataset RGB dengan cahaya redup dan distraksi sudah tersedia untuk diunduh melalui Mendeley.  [openaccess.thecvf.com](https://openaccess.thecvf.com/content/WACV2025/html/Rosh_XPose_Towards_Extreme_Low_Light_Hand_Pose_Estimation_WACV_2025_paper.html?utm_source=chatgpt.com) [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com) [Mendeley Data](https://data.mendeley.com/datasets/bxr7kx84y6/2?utm_source=chatgpt.com) [Mendeley Data](https://data.mendeley.com/datasets/wj25crzdbm/1?utm_source=chatgpt.com)

## 20 dataset yang gw temukan

Diurutkan berdasarkan kedekatan dengan masalah webcam lu. Status akses mengacu pada halaman publik, bukan bukti bahwa seluruh file berhasil diunduh.

**Legenda**
`RGB` berarti bisa memakai kamera warna biasa. `RGB-D` berarti dataset menyediakan depth juga, tetapi bagian RGB-nya dapat diteliti secara terpisah. `Landmark` berarti data koordinat tangan, bukan gambar mentah.

### A. Low-light dan variasi pencahayaan

| No. | Dataset | Kegunaan buat R18 | Akses |
|--------|--------|--------|--------|
| 1 | [Egocentric and Exocentric View Hands](https://data.mendeley.com/datasets/bxr7kx84y6/2) | **47.166 frame RGB**, cahaya sangat redup, bayangan, blur, dan beberapa orang/tangan. Bagus untuk stress test distraksi.  [Mendeley Data](https://data.mendeley.com/datasets/bxr7kx84y6/2?utm_source=chatgpt.com) | **CC BY 4.0** |
| 2 | [Exocentric View Hand Interaction](https://data.mendeley.com/datasets/9d37m3nfgm/2) | **7.221 frame RGB**, dim light, shadow, deformasi, beberapa tangan dan permainan meja.  [Mendeley Data](https://data.mendeley.com/datasets/9d37m3nfgm/2?utm_source=chatgpt.com) | **CC BY 4.0** |
| 3 | [HandGesture-5G](https://data.mendeley.com/datasets/wj25crzdbm/1) | **2.653 gambar**, lima pose termasuk pointing, open palm, fist dan V-sign dengan low/normal/high exposure.  [Mendeley Data](https://data.mendeley.com/datasets/wj25crzdbm/1?utm_source=chatgpt.com) | **CC BY 4.0** |
| 4 | [RGB Natural Hand Gestures](https://data.mendeley.com/datasets/n66hhk695h/2) | **1.352 video RGB**, 13 gesture, dim indoor, backlight dan variasi lampu. Cocok untuk kamera konsumen.  [Mendeley Data](https://data.mendeley.com/datasets/n66hhk695h/2?utm_source=chatgpt.com) | **CC BY 4.0** |
| 5 | [Cambridge Hand Gesture](https://github.com/Ha0Tang/HandGestureRecognition) | **900 sequence**, sembilan kelas, lima kondisi pencahayaan. Cocok untuk menguji perubahan cahaya.  [pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC13175500/?utm_source=chatgpt.com) | Ada skrip unduh, lisensi perlu dicek |
| 6 | [IPN Hand](https://gibranbenitez.github.io/IPN_Hand/) | RGB webcam, background ramai, pencahayaan ekstrem, transisi gesture dan non-gesture.  [IPN Hand](https://gibranbenitez.github.io/IPN_Hand/?utm_source=chatgpt.com) | **CC BY 4.0** |
| 7 | [HaGRIDv2](https://github.com/hukenovs/hagrid) | Lebih dari **1 juta gambar**, variasi cahaya indoor, background, pose jari, serta kelas `no_gesture`\.  [GitHub](https://github.com/hukenovs/hagrid/blob/master/README.md?utm_source=chatgpt.com) | Unduhan publik, lisensi khusus turunan CC BY-SA |
| 8 | [HANDS RGB-D](https://data.mendeley.com/datasets/ndrczc35bt/1) | Pose satu dan dua tangan pada background dan kondisi cahaya berbeda. Bisa menggunakan RGB saja.  [Mendeley Data](https://data.mendeley.com/datasets/ndrczc35bt/1?utm_source=chatgpt.com) | **CC BY 4.0** |

### B. Gesture, jari, dan distraksi

| No. | Dataset | Kegunaan buat R18 | Akses |
|--------|--------|--------|--------|
| 9 | [NUS Hand Posture II](https://sites.google.com/view/vadakkepat/hand-posture-datasets) | **Background kompleks** dan gambar tanpa tangan, untuk menguji false detection.  [pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC4732069/?utm_source=chatgpt.com) | Unduhan publik |
| 10 | [EgoHands](https://vision.soic.indiana.edu/projects/egohands/) | Sekitar **4.800 frame beranotasi** untuk segmentasi, tangan saling menutupi dan interaksi dengan orang lain.  [GitHub](https://github.com/UTNuclearRoboticsPublic/EgoHands_Dataset?utm_source=chatgpt.com) | Unduhan publik |
| 11 | [IPN HandS](https://github.com/GibranBenitez/IPN-hand) | Sekitar **800 ribu frame dengan skeleton annotation**\. Ini sumber yang sudah dipakai R18, relevan untuk gesture temporal.  [mdpi.com](https://www.mdpi.com/2076-3417/15/11/6321?utm_source=chatgpt.com) | Publik |
| 12 | [MediaPipe Hand Gesture Landmarks](https://data.mendeley.com/datasets/bpkd429sxt/1) | CSV landmark dari sepuluh gesture. Berguna untuk eksperimen classifier kecil dan konversi label.  [Mendeley Data](https://data.mendeley.com/datasets/bpkd429sxt/1?utm_source=chatgpt.com) | **CC BY 4.0** |
| 13 | [FreiHAND](https://lmb.informatik.uni-freiburg.de/resources/datasets/FreihandDataset.en.html) | RGB dengan anotasi pose tangan, cocok untuk evaluasi ketepatan jari dan keypoint.  [lmb.informatik.uni-freiburg.de](https://lmb.informatik.uni-freiburg.de/resources/datasets/FreihandDataset.en.html?utm_source=chatgpt.com) | Gratis untuk penelitian |
| 14 | [Rendered Handpose Dataset (RHD)](https://lmb.informatik.uni-freiburg.de/resources/datasets/RenderedHandposeDataset.en.html) | Sekitar **44 ribu gambar sintetis**, 21 keypoint, visibility dan mask jari. Berguna untuk occlusion dan variasi pose.  [lmb.informatik.uni-freiburg.de](https://lmb.informatik.uni-freiburg.de/resources/datasets/RenderedHandposeDataset.en.html?utm_source=chatgpt.com) | Unduhan publik |
| 15 | [InterHand2.6M](https://mks0601.github.io/InterHand2.6M/) | Interaksi dua tangan dan saling menutupi. Cocok untuk hand ownership dan occlusion.  [GitHub](https://github.com/facebookresearch/InterHand2.6M?utm_source=chatgpt.com) | **CC BY-NC 4.0** |
| 16 | [DexYCB](https://dex-ycb.github.io/) | Tangan memegang objek, jari terhalang dan pose sulit.  [dex-ycb.github.io](https://dex-ycb.github.io/?utm_source=chatgpt.com) | **CC BY-NC 4.0** |
| 17 | [HO-3D](https://github.com/bearpaw/ho3d) | Occlusion berat antara tangan dan objek, serta anotasi pose.  [GitHub](https://github.com/bearpaw/ho3d?utm_source=chatgpt.com) | Gratis untuk riset akademik nonkomersial |
| 18 | [First-Person Hand Action](https://kcvl-kaist.github.io/FPHA/) | Video RGB-D berurutan dengan anotasi aksi dan pose tangan. Berguna untuk temporal tracking.  [kcvl-kaist.github.io](https://kcvl-kaist.github.io/FPHA/?utm_source=chatgpt.com) | Akses akademik, cek ketentuan |

### C. Dataset low-light tambahan, bukan dataset gesture

| No. | Dataset | Kegunaan buat R18 | Akses |
|--------|--------|--------|--------|
| 19 | [LOL-v2 Real](https://github.com/flyywh/CVPR-2020-Semi-Low-Light) | Pasangan gambar redup dan normal untuk meneliti preprocessing/enhancement. **Tidak menyediakan label tangan.**  [GitHub](https://github.com/JIA-Lab-research/SNR-Aware-Low-Light-Enhance/blob/main/README.md?plain=1&utm_source=chatgpt.com) | Unduhan publik, verifikasi lisensi sebelum training |
| 20 | [See-in-the-Dark (SID)](https://cchen156.github.io/SID) | Foto RAW sangat gelap dan referensi long-exposure, untuk mempelajari noise dan pemulihan gambar. **Bukan dataset gesture.**  [cchen156.github.io](https://cchen156.github.io/SID?utm_source=chatgpt.com) | Unduhan penelitian, cek ketentuan |

**Catatan penting.** Nomor 19 dan 20 tidak bisa langsung dipakai melatih gesture classifier. Dataset pose beranotasi 3D juga tidak otomatis menghasilkan label `pinch`, `erase`, `undo`, atau `redo`\. Konversi dan validasi anotasi tetap diperlukan.

## Tiga dataset khusus gelap yang masih terkendala

| Dataset | Kenapa menarik | Kendala |
|--------|--------|--------|
| [DimHand](https://hanlingzhan.github.io/DimHand/) | 745 ribu frame, 0,1 sampai 10 lux, finger crossing, pinching dan finger counting | Memerlukan persetujuan akses akademik |
| [LLHands / XPose](https://openaccess.thecvf.com/content/WACV2025/html/Rosh_XPose_Towards_Extreme_Low_Light_Hand_Pose_Estimation_WACV_2025_paper.html) | 120 ribu gambar tangan dengan pencahayaan ekstrem | Publikasi ada, tetapi data ditandai tidak accessible di perbandingan resmi DimHand |
| [MGR-Dark](https://doi.org/10.1145/3664647.3681267) | Gesture dalam kondisi gelap, menggunakan RGB dan IR | Belum terverifikasi ada paket data RGB publik yang bisa langsung diunduh |

 [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com) [openaccess.thecvf.com](https://openaccess.thecvf.com/content/WACV2025/html/Rosh_XPose_Towards_Extreme_Low_Light_Hand_Pose_Estimation_WACV_2025_paper.html?utm_source=chatgpt.com) [doi.org](https://doi.org/10.1145/3664647.3681267?utm_source=chatgpt.com)

## Dataset mana yang paling masuk akal dicoba dulu?

Gw prioritaskan **enam kandidat** ini untuk investigasi awal.

**Prioritas low-light**
Dataset \#1, \#2, \#3 dan \#4. Ini punya gambar tangan dari kamera RGB nyata dengan variasi cahaya yang jelas, dan lisensinya CC BY 4.0.

**Prioritas false detection dan pose jari**
HaGRIDv2 (\#7) dan NUS-II (\#9), terutama `no_gesture`, background kompleks dan pose yang mirip tetapi seharusnya memiliki aksi berbeda.

Jangan langsung melatih model dengan semua 20 dataset. Ukuran HaGRIDv2 versi 512 piksel saja sekitar **119 GB**, sedangkan DexYCB lengkap sekitar **119 GB**\. Mengunduh semuanya tanpa eksperimen terarah bakal menghabiskan storage dan waktu sebelum kita tahu sumber error-nya.  [GitHub](https://github.com/hukenovs/hagrid?utm_source=chatgpt.com) [dex-ycb.github.io](https://dex-ycb.github.io/?utm_source=chatgpt.com)

Untuk R18, skema evaluasi yang lebih berguna adalah membandingkan empat kondisi berikut pada data uji yang sama.

| Kandidat | Tujuan |
|--------|--------|
| R17 existing | Baseline |
| R18 UX3 saat ini | Mengukur kontribusi MLP terlatih |
| R18 retrained + data tambahan | Mengukur manfaat dataset dan tuning |
| Preprocessing low-light + detector existing | Mengukur keberhasilan mendapatkan 21 landmark sejak awal |

**Jangan hanya membandingkan accuracy training.** Yang penting buat lu adalah detection recall saat cahaya jelek, akurasi jumlah jari, false erase, false swipe, latency, dan kelancaran menggambar. Split data harus berdasarkan subjek atau sesi independen untuk menghindari data leakage.

## Prompt riset paralel untuk Agy dan Meta AI

Prompt ini sengaja netral, bisa diberikan ke agent mana pun. Isinya fokus penelitian mendalam dulu, bukan langsung mengubah source atau training membabi buta.

> **Chat message**
> 
> # DEEP RESEARCH TASK: Robust RGB Webcam Hand Tracking and Gesture Recognition
> 
> ## Context
> 
> I am conducting technical research for Sketchbook Universe, an interactive application for Indonesian junior high school students.
> 
> The NUI prototype uses standard laptop RGB webcams, MediaPipe HandLandmarker with 21 hand landmarks, a hand-locking mechanism, and gesture processing for drawing, erasing, Undo/Redo, and directional input.
> 
> The current experiment, R18 UX3, uses a trained auxiliary MLP classifier built from IPN HandS landmark data. The classifier operates on MediaPipe landmarks. It does not replace the Media

---

---

## L5-M046 | User | 2026-11-18 14:36:30


message time: 2026-11-18 14:36:30

gausah deh agy dan meta, dari lu aja. gini, kalo cc kan kita harus credit ga sih? nah itu nanti lu masih inget kan data apa aja yang dibuat train r17 r18? nah r19 ini gw mau trainingnya lebih menyeluruh biar sangat akurat dan yang soal gestur dari jalannya thinman ini masih belum loh? satu2 kah apa gimana ya? pembahasan gestur dulu baru diatur buat dataset2nya ga sih biar gestur yang terpilih terutama itu lebih akurat gitu, sama kalo didownload user itu seberapa dan runtimenya lag atau engga cok itu yang penting anjay pls lah

---

---

## L5-M047 | Assistant | waktu tidak ada


Menurut gw, **gestur dan cara main Thinman harus dikunci dulu sebagai target uji R19, baru dataset dipilih**. Kalau dibalik, kita bisa melatih model yang makin bagus di benchmark tetapi tetap salah membaca aksi yang lu butuhkan. Gw cek data training R17/R18, mapping Thinman di repo, lisensi, dan ukuran model yang sudah ada supaya usulannya nggak asal.

---

---

## L5-M048 | User | 2026-11-18 14:37:56


message time: 2026-11-18 14:37:56

yaudah lu riset soal gestur thinman kea yang gw bilang feelnya harus kea pake keyboard dengan tab panah kanan kiri atas bawah dan kombinasi misal panah atas sama maju bisa loncat sambil maju nah gitu

---

---

## L5-M049 | Assistant | waktu tidak ada


Gw fokus riset kontrol Thinman dulu. Targetnya gesture terasa seperti tombol panah keyboard yang bisa ditahan dan dikombinasikan, terutama kanan + atas buat lompat sambil maju. Gw cek mapping yang sudah ada di `main`, lalu bandingkan dengan prinsip kontrol game berbasis gesture supaya jelas mana masalah klasifikasi, mana masalah respons gerakan.

Temuan awalnya menarik. Mapping `main` sebenarnya sudah mengenal telunjuk kanan, kiri, atas, kanan+atas, dan kiri+atas. Yang belum ada adalah aksi panah bawah yang jelas, dan R18 baru menampilkan output Thinman sebagai diagnostik. Jadi fokus R19 bukan sekadar menambah kelas gesture, melainkan membuat **satu intent gesture menjadi state tombol virtual yang stabil, bisa ditahan, dan bisa dikombinasikan**.

**Buat Thinman, gw rekomendasikan satu telunjuk sebagai D-pad virtual, dengan perilaku tombol yang bisa ditahan dan dikombinasikan seperti keyboard.** R19 sebaiknya menguji *keyboard feel* ini dulu, baru menentukan data apa yang perlu ditambahkan untuk training.

Setelah gw cek `DECISIONS.md`, source `main`, pipeline UX3, dan referensi HCI, ada beberapa temuan penting.

## 1. Apa yang sudah ada di Thinman sekarang?

Di `main` versi `0.25.0-alpha`, Thinman sebenarnya sudah memiliki kontrol berdasarkan sudut telunjuk.

| Arah telunjuk | Output | Status |
|--------|--------|--------|
| Kanan | Tahan kanan, Thinman berjalan | Sudah ada |
| Kiri | Tahan kiri, Thinman berjalan | Sudah ada |
| Atas | Lompat | Sudah ada |
| Kanan atas | Kanan + lompat | Sudah ada |
| Kiri atas | Kiri + lompat | Sudah ada |
| Bawah | Belum punya aksi khusus | Belum dikunci |
| Jari tidak menunjuk | Netral, lepas kontrol | Sudah ada |

Sumbernya [gameplay-gesture.ts](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/src/input/gameplay-gesture.ts) dan keputusan aktif D-20261110-09.

**Ada dua hal yang menjelaskan kenapa peningkatan R18 belum terlalu terasa pada Thinman.**

Pertama, model MLP R18 yang baru kita merge dipakai dalam NUI Lab. Jalur kontrol gameplay Thinman masih memakai `GameplayHandDriver` dan `GameplayGestureFilter` existing, bukan langsung model UX3.

Kedua, mapping sudut yang ada mempunyai zona netral antara jalan horizontal dan lompat diagonal. Akibatnya, ketika lu menggerakkan telunjuk perlahan dari kanan menuju kanan atas, output berpotensi melewati kondisi berhenti. Ini perlu diuji karena bisa membuat gerakan terasa tersendat.

## 2. Seperti apa *keyboard feel* yang kita inginkan?

Bayangkan lu benar-benar menahan tombol panah kanan. Thinman terus berjalan sampai lu melepasnya. Saat lu menambahkan panah atas, Thinman melompat **tanpa kehilangan gerakan horizontal**\.

SIMULASI KONSEP TOMBOL VIRTUAL

Output kontrol yang disimulasikan

LEFT=  RIGHT=  UP=  DOWN=

[Coba kombinasi kanan + atas]

Coba aktifkan atau nonaktifkan tombol. Ini simulasi logika keyboard, bukan pengujian webcam atau implementasi Thinman.

Kuncinya, **jangan membuat model yang harus mengenali setiap kombinasi sebagai kelas baru**\. Kita cukup mengubah pose tangan menjadi state tombol virtual.

Misalnya satu telunjuk menunjuk ke kanan atas, maka hasilnya `right=true` dan `jump=true`\. Input itu diberikan ke pengendali game yang sama dengan keyboard.

## 3. Temuan riset yang relevan

**Kontrol terus-menerus berbeda dari gesture sesaat.** Penelitian An Investigation of Hand Gestures for Controlling Video Games in a Rehabilitation Exergame System membahas pemetaan gesture webcam ke kontrol arah permainan. Untuk Thinman, gesture yang cocok harus dapat ditahan secara stabil, bukan swipe yang hanya memicu satu perintah.  [mdpi.com](https://www.mdpi.com/2073-431X/14/1/25?utm_source=chatgpt.com)

---

**Stabilisasi berlebihan menghasilkan lag.** Penelitian 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems menjelaskan trade-off antara jitter dan keterlambatan. Ini alasan untuk menghaluskan arah secara adaptif, bukan menambah dwell panjang pada setiap perubahan sudut.  [gery.casiez.net](https://gery.casiez.net/1euro/?utm_source=chatgpt.com)

---

**Game harus memaafkan timing yang meleset sedikit.** Coyote time dan jump buffering merupakan teknik umum dalam kontrol platformer. Thinman sudah punya keduanya pada source, masing-masing lima langkah simulasi 50 Hz, setara parameter 100 ms. Itu perlu dipertahankan dan diuji bersama input kamera.  [academia.edu](https://www.academia.edu/78261627/Designing_Game_Feel_A_Survey?utm_source=chatgpt.com)

---

**Kenyamanan tangan juga menentukan performa.** Riset mid-air interaction menunjukkan risiko kelelahan ketika tangan harus ditahan di udara terlalu lama. Karena targetnya siswa SMP, satu telunjuk dengan posisi lengan nyaman perlu dibandingkan dengan gesture yang menuntut dua tangan atau posisi pergelangan ekstrem.  [pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC4447613/?utm_source=chatgpt.com) [doi.org](https://doi.org/10.1145/3795011.3795044?utm_source=chatgpt.com)

Referensi eksternal ini untuk arah eksperimen teknis. Belum otomatis menjadi sitasi proposal PA.

## 4. Arsitektur kandidat R19 yang gw rekomendasikan

**Webcam RGB + MediaPipe 21 landmark**

**Intent gate**

Apakah siswa benar-benar sedang menunjuk?

**Direction FSM**

Sudut telunjuk, zona, hysteresis, stabilitas

**Virtual keyboard state**

LEFT / RIGHT / UP / DOWN

**Existing InputArbiter + Thinman physics**

Ada empat perbaikan yang paling layak diteliti untuk R19.

1. **Continuous hold.** Ketika menunjuk kanan, tombol kanan virtual tetap aktif. Jangan perlu mendeteksi gesture dari nol setiap beberapa frame lalu membuat Thinman berhenti-jalan.
2. **Transisi diagonal mulus.** Dari kanan ke kanan atas, horizontal tetap aktif saat jump ditambahkan. Jangan sampai ada zona netral yang membuat Thinman kehilangan momentum.
3. **Jump press dan release yang konsisten.** R18 memakai jump satu-pemicu (`J2_edge`\), sedangkan `JumpAssist` gameplay sekarang bisa memicu lompatan lagi ketika tombol atas masih ditahan dan Thinman mendarat. Dua perilaku ini perlu diuji berdampingan sebelum dipilih. Jangan biarkan satu frame gesture menghilang membuat input lompat terlewat.
4. **Fail-safe cepat.** Ketika tangan hilang, dua tangan bertabrakan, atau pose bukan menunjuk, output segera netral. Jangan mempertahankan tombol kanan hanya karena hasil klasifikasi terakhir adalah kanan.

### Ada satu celah keputusan

**Panah bawah belum punya fungsi dalam gameplay Thinman sekarang.** Bahkan keyboard gameplay di `main` hanya memetakan kiri, kanan, dan lompat.

Gw nggak akan mengarang bahwa bawah berarti jongkok, turun platform, atau mempercepat jatuh. R19 bisa mengukur kemampuan mendeteksi arah bawah, tetapi tindakan Thinman-nya harus menunggu kebutuhan gameplay yang jelas.

## 5. Seberapa cepat harus terasa?

R18 pernah mencatat sekitar **12,59 FPS** dalam pengujian browser dengan video simulasi dan CPU. Itu berarti ada kira-kira 79 ms antarsampel deteksi, sebelum kita menghitung waktu stabilisasi atau pembaruan frame game.

Jadi, kalau kita menambahkan dwell 50 sampai 100 ms secara sembarangan, gerakan bisa terasa tertahan. Ini alasan kenapa meningkatkan accuracy classifier saja belum cukup.

Untuk R19 gw sarankan mengukur\:

| Metrik | Yang diuji |
|--------|--------|
| *Input-to-motion latency* | Dari tangan mulai menunjuk sampai Thinman bergerak |
| *Hold continuity* | Apakah berjalan terus tanpa putus ketika arah ditahan |
| *Diagonal success* | Berapa kali lompat sambil berjalan berhasil |
| *False jump* | Lompat tanpa niat siswa |
| *Stop latency* | Seberapa cepat Thinman berhenti ketika arah dilepas |
| *Direction jitter* | Kanan/kiri bolak-balik padahal jari diam |
| *Tracking recovery* | Waktu pemulihan setelah tangan sempat hilang |
| *Physical comfort* | Apakah siswa bisa memakai kontrol tanpa cepat lelah |

## 6. Baru setelah itu kita pilih dataset

Untuk training R19, target utama bukan sepuluh kelas arah dan kombinasi. **Arah cukup dihitung dari geometri telunjuk**, sedangkan model tambahan difokuskan pada hal yang sulit diputuskan dengan sudut saja.

Contohnya membedakan menunjuk sengaja vs tangan istirahat, telunjuk vs dua/tiga jari, pinch vs pointing, gesture yang sedang bertransisi, dan landmark yang salah akibat low-light atau distraksi.

Dari sisi ukuran, model MLP UX3 saat ini hanya **123.141 byte**, atau sekitar **44 KB dalam pengujian transfer terkompresi**\. MediaPipe sendiri jauh lebih besar, sekitar **7,82 MB** untuk `hand_landmarker.task` yang ada di repo. Jadi prioritas performa R19 adalah memperbaiki pipeline frame, inferensi, dan temporal handling. Kita tidak perlu langsung membuat model besar.

**Arah R19 yang gw rekomendasikan adalah prototipe kontrol Thinman berbasis virtual keyboard satu tangan, diuji berdampingan dengan keyboard asli.** Kalau gerakannya sudah masuk akal, baru kita kurasi dataset yang benar-benar memperbaiki false pointing, low-light, dan stabilitas kombinasi arah.

Ini masih rancangan eksperimen, bukan perubahan resmi mapping gameplay.

Satu langkah paling konkret berikutnya adalah **membuat matriks gesture dan acceptance test untuk kontrol arah Thinman**, termasuk kanan+atas dan kiri+atas, sebelum satu pun training R19 dijalankan.

---

---

## L5-M050 | User | 2026-11-18 15:14:10


message time: 2026-11-18 15:14:10

ya jadi gestur yang dipake apa jancok biar feelnya kea tombol panah itu, yang bawah gausah ga sih kan dia emang jatuh. nah gw mau kea kalo pake panah ini kan dia dipencet dulu baru jalan gitu, sama buat yang lain juga anjay biar gesturnya itu kerasa nunggu dipencet gitu lah

---

---

## L5-M051 | Assistant | waktu tidak ada


**Nah, berarti gestur Thinman yang gw rekomendasikan adalah telunjuk untuk memilih arah, lalu jempol dan jari tengah dicubit sebagai tombol PRESS.** Jadi sekadar menunjuk kanan nggak bikin Thinman jalan. Dia baru bergerak ketika lu benar-benar menekan dan menahan gesturnya.

Ini kandidat kontrol R19 yang menurut gw paling mendekati rasa menekan tombol keyboard.

## Gestur Thinman R19

**Pilih arah dengan telunjuk**

Telunjuk mengarah ke kanan, kiri, atas, atau diagonal. Tapi karakter masih diam karena tombol virtual belum ditekan.

---

**Tekan dengan jempol + jari tengah**

Sentuhkan kedua jari itu sambil telunjuk tetap lurus. Ini menjadi sinyal `KEYDOWN`\. Tahan untuk mempertahankan input. Lepaskan cubitan untuk `KEYUP`\.

Gambar hanya ilustrasi kandidat pose. Keterbacaan thumb-middle pinch pada webcam masih perlu diuji.

| Arah telunjuk saat PRESS | Hasil Thinman |
|--------|--------|
| Kanan | Jalan kanan terus selama ditahan |
| Kiri | Jalan kiri terus selama ditahan |
| Atas | Lompat di tempat |
| Kanan atas | Lompat sambil berjalan kanan |
| Kiri atas | Lompat sambil berjalan kiri |
| Lepas PRESS | Semua tombol virtual dilepas |

**Panah bawah nggak perlu.** Thinman memang jatuh mengikuti gravitasi. Selama belum ada mekanik jongkok atau turun platform, gesture bawah cukup dianggap netral.

## Cara kerjanya supaya terasa seperti keyboard

Misalnya lu mau jalan kanan lalu melompat sambil tetap maju.

1. **Telunjuk ke kanan**
   
   Tombol belum ditekan. Thinman diam.
2. **Cubit jempol + tengah**
   
   (RIGHT DOWN) Thinman mulai berjalan kanan.
3. **Tetap mencubit, arahkan telunjuk ke kanan atas**
   
   (RIGHT + UP) Thinman melompat sambil terus maju.
4. **Kembalikan telunjuk ke kanan**
   
   Input lompat dilepas, kanan tetap ditahan. Thinman terus maju.
5. **Lepaskan cubitan**
   
   Seluruh input dilepas. Thinman berhenti menerima perintah bergerak.

Untuk lompat, gw lebih memilih **satu lompatan setiap kali komponen UP baru ditekan**, bukan otomatis melompat terus saat gestur ditahan. Kalau lu mengarahkan telunjuk dari kanan ke kanan atas, UP menjadi aktif sekali. Untuk lompat berikutnya, lu harus kembali ke kanan lalu ke diagonal lagi, atau lepas dan tekan ulang.

## Kenapa bukan cuma telunjuk seperti sekarang?

Karena pada source existing, arah telunjuk saja sudah dapat mengaktifkan movement. Akibatnya, gerakan tangan yang kebetulan menunjuk ke samping bisa ikut menggerakkan Thinman.

R19 memisahkan dua hal.

- **Direction** menentukan tombol mana yang dipilih.
- **Press** menentukan kapan tombol tersebut benar-benar ditekan.

Tapi ada risiko yang harus diuji. Cubitan jempol dan tengah bisa membuat bentuk tangan berubah atau sebagian landmark tertutup. Kalau ternyata sulit dideteksi dengan stabil, kita perlu membandingkannya dengan mekanisme PRESS lain, bukan langsung melatih model besar untuk memaksakannya.

Selain itu, cubitan jempol-telunjuk tetap dipakai untuk menggambar atau memindahkan objek pada fase yang relevan. Jangan dicampur dengan PRESS gameplay.

**Verdict gw untuk eksperimen R19 adalah satu tangan, telunjuk sebagai arah, thumb-middle pinch sebagai PRESS, dan tanpa tombol bawah.** Uji dulu apakah gesture itu nyaman ditahan dan akurat dibaca webcam. Baru kita tentukan kebutuhan dataset dan training agar tidak salah sasaran.

---

⚠️ Kandidat perubahan **keputusan** terdeteksi

- **Ringkasan\:** Kontrol Thinman diusulkan memakai mekanisme PRESS sebelum movement aktif, kombinasi arah horizontal dan lompat, serta tanpa input bawah. Gestur thumb-middle pinch masih usulan gw, belum keputusan lu.
- **Entri lama yang mungkin terdampak\:** D-20261110-09 tentang kontrol gesture gameplay dan pemetaan arah telunjuk.
- **Status bukti\:** Keputusan eksplisit untuk kebutuhan PRESS sebelum bergerak. Bentuk gesture fisik dan penghapusan arah bawah masih belum dikunci.
- **Tindakan\:** `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

![hand](https://images.openai.com/static-rsc-4/1Fbjfjg_FQVwA1FQYWC170Lxpg5wqTK_lia3Dheo9oAwXtJgga9PpxpGqxGQtrwks_6RMnbnl__6ydtISH_rM7eeJInWWqJ8hM9fRj1bHvvEpGuA3WVAloKP4d8J6Aa-g89O8UP3m6jugH2rZv0g4rf65nIoHrpZQZDxOf38uZivG6HJO7MYad6hbkx3-ArE?purpose=fullsize)

![Woman palm hand, fingers bent, index finger pointing upwards, isolated on white background with clipping path](https://images.openai.com/static-rsc-4/RHZKYIKPG7Xa_NsXbdFhiRdCoVjVYy0vTeViRgWjKIdNOFEHS-mdXWBxIKyg0FjQJi60ACXsGq8u_aYknKEmUqlz_MeaYWcF3LM48YVF69wNoz56WI0xTlrZzG8fMwPg0g6msrTNfLv0F7635Mw90WwwgpvpSKiytdEPkJvq_jlhn_YSJUoML4m64CY7MamR?purpose=fullsize)

---

---

## L5-M052 | User | 2026-11-18 15:16:32


message time: 2026-11-18 15:16:32

gapaham

---

---
