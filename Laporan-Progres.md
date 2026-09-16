# LAPORAN KEMAJUAN PROYEK AKHIR

---

**JUDUL PROYEK AKHIR:**  
**PENGEMBANGAN SIMULASI INTERAKTIF BERLEVEL LITERASI KECERDASAN BUATAN BERBASIS PELACAKAN TANGAN MEDIAPIPE DENGAN MEKANISME HUMAN-IN-THE-LOOP UNTUK SISWA SEKOLAH MENENGAH PERTAMA**  
*(Internal Project / IP Name: Sketchbook Universe)*

---

### IDENTITAS MAHASISWA & PEMBIMBING

| Parameter | Keterangan |
|---|---|
| **Nama Pengusul / Penulis** | Farchan Deano Muhammad |
| **Nomor Registrasi Pokok (NRP)** | 5323600012 |
| **Program Studi** | Sarjana Terapan (D4) Teknologi Rekayasa Multimedia |
| **Departemen / Jurusan** | Teknik Informatika dan Komputer |
| **Institusi** | Politeknik Elektronika Negeri Surabaya (PENS) |
| **Dosen Pembimbing I** | Dr. Tri Budi Santoso, S.T., M.T. |
| **Dosen Pembimbing II** | Dr. Ing. Hestiasari Rante, S.T., M.Sc. |
| **Periode Laporan Progres** | Semester 7 — Tahun Akademik 2026/2027 |
| **Status Repositori & Baseline** | `v0.2.0` (All Automated QA Gates PASS / Canonical Static Build Out) |

---

## RINGKASAN EKSEKUTIF (EXECUTIVE SUMMARY)

Laporan kemajuan ini mendokumentasikan perkembangan riset, perancangan arsitektur, implementasi rekayasa perangkat lunak, serta hasil verifikasi teknis proyek akhir *Sketchbook Universe*. Proyek ini bertujuan untuk membangun media pembelajaran literasi kecerdasan buatan (*Artificial Intelligence / AI Literacy*) yang interaktif bagi siswa Sekolah Menengah Pertama (SMP kelas 7–9). Fokus utama sistem adalah mengatasi fenomena *automation bias* dan penerimaan pasif luaran AI oleh siswa, dengan menghadirkan pengalaman langsung mengevaluasi sifat probabilistik model melalui mekanisme *Human-in-the-Loop* (HITL) dalam balutan simulasi permainan 2D (*game-based learning*).

Hingga periode laporan ini, seluruh fondasi arsitektur frontend dan mesin interaksi telah selesai dibangun, terintegrasi, dan terverifikasi secara komprehensif. Sistem dikembangkan menggunakan Next.js 14.2 (React 18.3, TypeScript 5.6 strict mode), mesin simulasi 2D client-only KAPLAY.js 3001, modul pelacakan tangan on-device `@mediapipe/tasks-vision` 0.10, modul evaluasi keputusan *Top-3 prediction & confidence score*, serta *finite state machine* yang mengatur 7 fase alur interaksi. Pengujian otomatis menyeluruh telah mencapai tingkat kelulusan 100%, meliputi:
1. Verifikasi tipe statis TypeScript (0 error);
2. 10 *test suites* pengujian unit dan komponen berbasis Vitest (67/67 pengujian lulus);
3. 19/19 *checks* pengujian integrasi *End-to-End* (E2E) berbasis Playwright;
4. 31/31 *checks* pengujian *visual regression & responsive layout* pada resolusi desktop (1280x720) dan mobile (390px) dengan perekaman 19 artefak visual resmi.

Sistem telah siap memasuki fase pengujian empiris dan integrasi final dengan modul klasifikasi sketsa mitra.

---

# BAB 1: PENDAHULUAN

## 1.1 Latar Belakang

Perkembangan kecerdasan buatan atau *Artificial Intelligence* (AI) membuat kemampuan literasi digital tidak lagi cukup berhenti pada kemampuan menggunakan perangkat dan aplikasi. Ng dkk. menjelaskan bahwa literasi AI mencakup kemampuan memahami konsep dasar AI, menggunakan AI secara tepat, mengevaluasi keluaran AI, serta menyadari implikasi sosial dan etis dari penggunaan AI [1]. Dalam konteks pendidikan menengah, literasi AI menjadi penting karena siswa mulai berhadapan dengan berbagai sistem cerdas dalam aktivitas belajar maupun kehidupan sehari-hari. Ravi dkk. menunjukkan bahwa penerapan kurikulum literasi AI pada kelas menengah tidak hanya menuntut pemahaman teknis, tetapi juga membutuhkan strategi pembelajaran yang mampu membuat siswa memahami bagaimana AI bekerja dan bagaimana dampaknya terhadap keputusan pengguna [2]. Dengan demikian, pengenalan AI kepada siswa SMP perlu diarahkan bukan hanya pada penggunaan teknologi, tetapi juga pada kemampuan membaca, mempertanyakan, dan mengevaluasi keluaran sistem AI.

Salah satu masalah utama dalam interaksi dengan AI adalah kecenderungan pengguna menerima keluaran sistem sebagai jawaban akhir. Clerc dkk. menunjukkan bahwa siswa pada jenjang menengah masih rentan menerima *output* AI secara terlalu cepat apabila tidak dilatih untuk mengatur dan mengevaluasi interaksinya dengan sistem [3]. Khosravi dkk. juga menekankan bahwa sistem AI dalam pendidikan perlu dirancang agar keluarannya dapat dipahami oleh pengguna, karena keputusan berbasis AI yang tidak dijelaskan dengan baik dapat menimbulkan kesenjangan antara hasil model dan pemahaman pengguna [6]. Pada sistem klasifikasi visual, keluaran AI umumnya berbentuk prediksi dengan tingkat keyakinan tertentu. Oleh karena itu, siswa perlu dikenalkan bahwa prediksi AI bukan kebenaran mutlak, melainkan hasil perhitungan probabilistik yang tetap dapat benar, ragu, atau salah.

Pendekatan *Human-in-the-Loop* (HITL) relevan untuk menjawab kebutuhan tersebut. Wu dkk. menjelaskan bahwa *Human-in-the-Loop* menempatkan manusia sebagai bagian dari proses sistem AI, baik dalam pemberian masukan, validasi, maupun pengambilan keputusan terhadap hasil model [4]. Wang dkk. juga menegaskan bahwa pelibatan manusia dalam sistem AI muncul karena kemampuan mesin dan manusia memiliki peran yang saling melengkapi dalam menyelesaikan tugas yang tidak sepenuhnya dapat diserahkan kepada sistem otomatis [5]. Pada penelitian ini, mekanisme *Human-in-the-Loop* diwujudkan melalui momen ketika siswa melihat hasil prediksi AI, membandingkan alternatif prediksi, lalu menentukan keputusan akhir melalui *Accept*, *Correct*, *Override*, atau *Redraw*. Dengan mekanisme tersebut, siswa tidak ditempatkan sebagai penerima hasil AI secara pasif, tetapi sebagai pengguna yang ikut memvalidasi keluaran AI sebelum hasil tersebut digunakan dalam simulasi.

Agar konsep tersebut dapat dipahami oleh siswa SMP, sistem perlu disampaikan melalui bentuk interaksi yang konkret dan menarik. Videnovik dkk. menunjukkan bahwa *game-based learning* banyak digunakan dalam pembelajaran ilmu komputer karena mampu menghadirkan aktivitas belajar melalui tujuan, tantangan, dan *feedback* [8]. Tseng dan Yadav melalui *ActiveAI* juga menunjukkan bahwa pembelajaran AI untuk siswa kelas 7–9 dapat dikembangkan melalui skenario berbasis tujuan, umpan balik langsung, dan pengalaman yang mendorong siswa mengevaluasi keluaran AI [10]. Pada sisi antarmuka, Liao dkk. menjelaskan bahwa desain pengalaman pengguna untuk AI perlu membantu pengguna mempertanyakan keluaran sistem, bukan hanya menampilkan hasil akhir model [14]. Karran dkk. juga menekankan bahwa visualisasi tingkat keyakinan AI dapat memengaruhi cara pengguna memahami keputusan sistem [15]. Berdasarkan hal tersebut, penelitian ini menggunakan *Top-3 UI* untuk menampilkan beberapa alternatif prediksi beserta *confidence score*, sehingga siswa dapat melihat bahwa AI memiliki beberapa kemungkinan jawaban dengan tingkat keyakinan berbeda.

Berdasarkan uraian tersebut, penelitian ini mengembangkan simulasi interaktif berlevel berbasis *finger tracking* MediaPipe dengan mekanisme *Human-in-the-Loop* pada sistem literasi kecerdasan buatan untuk siswa SMP. MediaPipe Hands digunakan sebagai dasar interaksi karena Zhang dkk. menunjukkan bahwa MediaPipe mampu melakukan pelacakan tangan secara *real-time* dari kamera RGB melalui *pipeline* deteksi telapak tangan dan *landmark* tangan [11]. Sung dkk. juga menunjukkan bahwa pelacakan *skeleton* tangan dapat digunakan sebagai dasar pengenalan gestur *real-time* pada perangkat pengguna [12]. Pada sistem yang dikembangkan, siswa menggambar objek melalui gerakan jari, melihat prediksi AI dalam bentuk *Top-3 UI*, mengambil keputusan terhadap prediksi tersebut, lalu melihat konsekuensi keputusan pada simulasi 2D. Ruang lingkup penulis berfokus pada pengembangan simulasi interaktif, *finger tracking*, desain antarmuka, *Top-3 UI*, desain interaksi level, *feedback* visual, dan pengalaman *gameplay* berbasis konsekuensi. Sementara itu, komponen klasifikasi sketsa, keluaran *confidence score*, pencatatan data, dan analisis pola keputusan dikembangkan sebagai bagian terintegrasi oleh partner. Dengan pembagian tersebut, penelitian ini tetap berada dalam satu sistem literasi AI, tetapi kontribusi teknis penulis tetap jelas pada sisi interaksi dan pengalaman pengguna.

## 1.2 Permasalahan

Berdasarkan latar belakang, maka permasalahan dalam proyek akhir ini dapat dijabarkan sebagai berikut:
1. Bagaimana merancang dan mengembangkan simulasi interaktif berlevel berbasis *finger tracking* MediaPipe yang mampu menghadirkan pengalaman literasi kecerdasan buatan secara konkret kepada siswa SMP melalui aktivitas menggambar, melihat prediksi AI, mengambil keputusan, dan menerima konsekuensi keputusan dalam lingkungan simulasi 2D?
2. Bagaimana bentuk integrasi mekanisme *Human-in-the-Loop* yang mampu menampilkan keluaran klasifikasi sketsa berupa *Top-3 prediction* dan *confidence score*, memfasilitasi keputusan pengguna melalui *Accept*, *Correct*, *Override*, atau *Redraw*, serta menghasilkan data interaksi yang dapat digunakan untuk membaca pola keputusan siswa terhadap *output* probabilistik AI?

## 1.3 Tujuan

Tujuan penelitian proyek akhir ini mengajukan pendekatan pengembangan simulasi interaktif berlevel untuk memperkenalkan literasi kecerdasan buatan kepada siswa SMP dengan mempresentasikan mekanisme *Human-in-the-Loop* melalui aktivitas menggambar, pembacaan prediksi AI, pengambilan keputusan, dan konsekuensi *gameplay*. Pendekatan ini digunakan untuk mengatasi permasalahan pembelajaran AI yang cenderung abstrak dan berisiko membuat siswa menerima keluaran AI sebagai jawaban akhir tanpa proses evaluasi. Orisinalitas dari proyek akhir ini terletak pada integrasi antara *finger tracking* MediaPipe sebagai media input gambar, *Top-3 UI* sebagai ruang evaluasi prediksi AI, serta simulasi 2D berlevel yang menerjemahkan keputusan siswa menjadi konsekuensi langsung di dalam permainan.

Sistem yang dikembangkan memungkinkan siswa menggambar objek melalui gerakan jari, melihat hasil prediksi AI beserta nilai *confidence score*, kemudian menentukan keputusan akhir melalui pilihan *Accept*, *Correct*, *Override*, atau *Redraw*. Keputusan tersebut tidak berhenti sebagai input antarmuka, tetapi digunakan untuk menentukan perilaku objek dalam simulasi 2D, seperti objek yang membantu penyelesaian level atau objek yang menyebabkan kondisi gagal. Dengan demikian, tujuan penelitian ini adalah menghasilkan prototipe sistem literasi AI yang memberi pengalaman langsung kepada siswa bahwa keluaran AI perlu dibaca, dibandingkan, dan divalidasi sebelum digunakan sebagai dasar keputusan.

## 1.4 Manfaat

Manfaat dari penelitian proyek akhir ini dibagi menjadi tiga bagian sebagai berikut:
1. **Manfaat bagi Pendidikan:**  
   Menyediakan alternatif media pembelajaran AI yang konkret dan interaktif bagi siswa SMP. Melalui simulasi langsung seperti menggambar, menganalisis *confidence score*, dan mengambil keputusan, siswa dapat memahami konsep AI secara aktif melalui pendekatan aksi, umpan balik, serta konsekuensi.
2. **Manfaat bagi Institusi:**  
   Mendukung pengembangan proyek terapan di program studi Teknologi Rekayasa Multimedia, khususnya pada integrasi *interaction design*, *computer vision*, simulasi 2D, dan AI edukasi. Proyek ini juga menjadi percontohan kolaborasi Proyek Akhir berkelompok yang terintegrasi namun tetap memiliki pembagian fokus teknis yang jelas.
3. **Manfaat bagi Peneliti:**  
   Meningkatkan kemampuan dalam merancang sistem interaktif berbasis web, seperti implementasi *finger tracking*, antarmuka prediksi AI, serta mekanisme *Human-in-the-Loop* (HITL). Penelitian ini juga melatih peneliti untuk menyelaraskan aspek teknis dengan tujuan literasi dan pengalaman pengguna (*user experience*).

## 1.5 Sistematika Penulisan

Sistematika penulisan laporan kemajuan proyek akhir ini disusun untuk menjelaskan alur pembahasan dari latar belakang masalah, kajian pustaka, rancangan sistem, implementasi dan pengujian, hingga rencana tahap selanjutnya. Pembagian bab dibuat agar hubungan antara permasalahan literasi AI, teori pendukung, desain sistem, dan evaluasi hasil progres dapat dibaca secara runtut:

| Bab | Deskripsi Isi Pokok |
|---|---|
| **Bab 1: Pendahuluan** | Memuat latar belakang, rumusan masalah, tujuan, manfaat, dan sistematika penulisan. Bab ini berfokus pada urgensi meningkatkan literasi AI siswa SMP agar tidak pasif menerima *output* AI, melalui solusi media pembelajaran interaktif berbasis *Human-in-the-Loop* (HITL). |
| **Bab 2: Kajian Pustaka** | Mengulas landasan teori pendukung—seperti literasi AI, *Human-in-the-Loop*, *Explainable AI* (XAI), *game-based learning*, dan *finger tracking* MediaPipe. Bab ini juga memuat telaah penelitian terdahulu untuk menegaskan posisi dan orisinalitas proyek akhir. |
| **Bab 3: Metodologi dan Perancangan Sistem** | Menjelaskan perancangan teknis dan solusi yang ditawarkan. Mencakup arsitektur global 4 layer, *use case*, *user flow*, mekanika interaksi game, rancangan antarmuka (*wireframe*), desain level, *decision resolver*, hingga metodologi dan jadwal pengerjaan proyek. |
| **Bab 4: Implementasi, Pengujian, dan Analisis Progres** | Memaparkan detail teknis realisasi modul perangkat lunak aktual, hasil verifikasi kualitas statis dan dinamis (TypeScript, Vitest, Playwright E2E, Visual QA), evaluasi ketercapaian target, serta analisis penyelesaian kendala teknis. |
| **Bab 5: Kesimpulan dan Rencana Tahap Selanjutnya** | Menyajikan simpulan terhadap progres yang telah dicapai serta peta jalan (*roadmap*) kegiatan lanjutan untuk semester berikutnya. |

---

# BAB 2: KAJIAN PUSTAKA

## 2.1 Deskripsi Permasalahan

Perkembangan kecerdasan buatan atau *Artificial Intelligence* (AI) membuat literasi digital tidak cukup hanya dipahami sebagai kemampuan menggunakan perangkat dan aplikasi. Literasi AI mencakup kemampuan memahami konsep dasar AI, menggunakan AI secara tepat, mengevaluasi keluaran AI, menciptakan atau memodifikasi solusi berbasis AI secara bertanggung jawab, serta memahami isu etika penggunaan AI [1]. Dalam konteks siswa SMP, kemampuan ini penting karena siswa mulai berhadapan dengan sistem cerdas dalam aktivitas belajar, pencarian informasi, rekomendasi konten, dan penggunaan aplikasi sehari-hari.

Permasalahan utama pada penelitian ini adalah kecenderungan siswa menerima keluaran AI sebagai jawaban final tanpa proses evaluasi. Ravi et al. menunjukkan bahwa pembelajaran literasi AI pada kelas menengah membutuhkan strategi yang membuat konsep AI dapat dipahami melalui pengalaman konkret [2]. Clerc et al. juga menunjukkan bahwa siswa usia menengah perlu dilatih untuk memonitor dan mengevaluasi interaksinya dengan sistem AI agar tidak menerima *output* secara tidak kritis [3]. Oleh karena itu, pengenalan AI kepada siswa SMP perlu diarahkan pada pengalaman membaca, membandingkan, dan memvalidasi keluaran AI. Masalah tersebut terlihat pada sistem klasifikasi visual. Keluaran AI tidak berbentuk kebenaran mutlak, tetapi prediksi berdasarkan pola data. *Output* biasanya berupa label dan nilai keyakinan atau *confidence score*. Jika siswa hanya melihat satu label akhir, siswa dapat menganggap AI selalu benar. Padahal *explainable artificial intelligence* dalam pendidikan menekankan bahwa sistem AI perlu disajikan secara dapat dipahami agar pengguna tidak menerima keputusan sistem secara pasif [6]. Visualisasi keputusan AI juga dapat memengaruhi *confidence*, *cognitive fit*, dan kepercayaan pengguna terhadap sistem [15].

*Human-in-the-Loop* (HITL) menjadi pendekatan yang relevan karena menempatkan manusia sebagai bagian dari alur sistem, baik dalam validasi, koreksi, maupun pengambilan keputusan terhadap *output* model [4]. Wang et al. menekankan bahwa manusia dan mesin memiliki peran saling melengkapi: mesin mampu memproses pola secara cepat, sedangkan manusia dapat memberi penilaian kontekstual ketika keputusan tidak sepenuhnya dapat diserahkan kepada sistem otomatis [5]. Agar konsep prediksi, *confidence score*, validasi, dan konsekuensi dapat dipahami siswa SMP, penelitian ini mengemasnya dalam simulasi interaktif berlevel berbasis *game-based learning* yang menghadirkan tujuan, tantangan, *feedback*, dan konsekuensi [8], [9].

Untuk memperjelas bahwa literasi AI tidak berhenti pada kemampuan mengenal istilah, Gambar 2.1 menampilkan hubungan antara taksonomi kemampuan berpikir dan literasi AI. Gambar ini relevan karena penelitian ini menempatkan siswa pada aktivitas menggunakan, membandingkan, dan mengevaluasi keluaran AI.

```
       +-------------------------------------------------------------+
       |                  Taksonomi Bloom & AI Literacy              |
       +-------------------------------------------------------------+
       |  Tingkat 4: EVALUATE & CREATE (Mengevaluasi & Mengontrol)    |
       |  - Menilai prediksi probabilistik AI (Confidence Score)     |
       |  - Mengambil keputusan HITL (Accept, Correct, Override)     |
       |  - Memahami implikasi etis & regulasi luaran cerdas         |
       +-------------------------------------------------------------+
       |  Tingkat 3: USE & APPLY (Menggunakan & Menerapkan)          |
       |  - Menggambar sketsa visual via modalitas gesture tangan     |
       |  - Memicu inferensi AI secara interaktif                    |
       +-------------------------------------------------------------+
       |  Tingkat 2: UNDERSTAND (Memahami Cara Kerja)                |
       |  - Menyadari bahwa AI bekerja berbasis probabilitas & pola  |
       |  - Mengamati adanya multikandidat (Top-3 Predictions)       |
       +-------------------------------------------------------------+
       |  Tingkat 1: KNOW & RECOGNIZE (Mengenal & Mengetahui)        |
       |  - Mengenal istilah dan definisi dasar kecerdasan buatan    |
       +-------------------------------------------------------------+
```
*Gambar 2.1 Bloom's Taxonomy and AI Literacy (Sumber: Ng et al. [1], Fig. 2, doi: 10.1016/j.caeai.2021.100041)*

Gambar 2.1 menunjukkan bahwa literasi AI memiliki tingkat kemampuan yang berlapis, mulai dari mengetahui dan memahami konsep sampai mengevaluasi serta menghasilkan keputusan. Berdasarkan masalah tersebut, penelitian ini mengembangkan simulasi interaktif berlevel berbasis *finger tracking* MediaPipe dengan mekanisme *Human-in-the-Loop*. Siswa menggambar objek melalui gerakan jari, sistem menampilkan *Top-3 prediction* dan *confidence score*, lalu siswa mengambil keputusan melalui *Accept*, *Correct*, *Override*, atau *Redraw*. Keputusan tersebut dipetakan menjadi konsekuensi dalam simulasi 2D, sehingga siswa mengalami hubungan langsung antara input, prediksi AI, validasi manusia, dan konsekuensi keputusan.

## 2.2 Teori Penunjang

Teori penunjang pada penelitian ini disusun untuk mendukung rancangan sistem pada Bab 3. Sistem yang dikembangkan menggabungkan literasi AI, *finger tracking*, klasifikasi visual, *Top-3 prediction*, *confidence score*, mekanisme HITL, simulasi berlevel, *feedback* visual, dan pencatatan data interaksi. Oleh karena itu, teori yang digunakan mencakup aspek pendidikan AI, desain antarmuka AI, teknologi pelacakan tangan, serta pembelajaran berbasis permainan.

### 2.2.1 Literasi AI untuk Siswa SMP

Ng et al. merumuskan literasi AI melalui beberapa aspek, yaitu mengetahui dan memahami AI, menggunakan dan menerapkan AI, mengevaluasi dan menciptakan dengan AI, serta memahami isu etika [1]. Pada penelitian ini, aspek memahami AI diterjemahkan melalui pengalaman siswa melihat proses prediksi. Aspek menggunakan AI diterapkan ketika siswa membuat gambar sebagai input sistem. Aspek mengevaluasi AI diterapkan ketika siswa membandingkan *Top-3 prediction* dan *confidence score*. Aspek tanggung jawab diwujudkan melalui keputusan untuk menerima, mengoreksi, menolak, atau menggambar ulang.

Ravi et al. menunjukkan bahwa pembelajaran literasi AI di kelas menengah membutuhkan aktivitas yang dapat diterapkan guru dan dipahami siswa melalui pengalaman konkret [2]. Clerc et al. memperkuat hal tersebut dengan menunjukkan bahwa siswa perlu dilatih untuk tidak menerima *output* AI secara tidak kritis [3]. Karena itu, sistem yang dikembangkan perlu memberi siswa ruang untuk mengevaluasi *output* AI, bukan hanya melihat hasil akhir.

### 2.2.2 Human-in-The-Loop

*Human-in-the-Loop* adalah pendekatan yang melibatkan manusia dalam alur kerja AI atau *machine learning*. Wu et al. menjelaskan bahwa manusia dapat terlibat dalam penyediaan data, pemberian label, perbaikan proses, atau intervensi terhadap sistem [4]. Dalam penelitian ini, siswa tidak berperan untuk melatih ulang model secara langsung, tetapi berperan sebagai validator *output* AI.

Alur HITL pada penelitian ini merujuk pada gagasan bahwa manusia dapat masuk ke dalam proses pembentukan data, pelabelan, dan perbaikan keluaran model. Contoh *pipeline* HITL dari Wu et al. ditunjukkan pada Gambar 2.2.

```
+---------------+     +--------------------+     +-------------------+
|  Input Data   | ──> | Model ML/AI Engine | ──> | Output Prediksi   |
+---------------+     +--------------------+     +-------------------+
        ^                                                  │
        │             +--------------------+               │
        └──────────── | Human In The Loop  | <─────────────┘
                      | (Review & Validate)|
                      +--------------------+
```
*Gambar 2.2 Human-in-the-Loop Data Processing Pipeline (Sumber: Wu et al. [4], Fig. 3, arXiv:2108.00941)*

Gambar 2.2 memperlihatkan bahwa manusia dapat berperan dalam proses pemilihan, pemeriksaan, dan pemberian label terhadap data. Dalam penelitian ini, prinsip tersebut diterjemahkan ke level antarmuka: siswa memvalidasi prediksi AI melalui *Accept*, *Correct*, *Override*, atau *Redraw* sebelum hasilnya digunakan dalam simulasi.

Wang et al. menjelaskan bahwa HITL muncul karena manusia dan mesin memiliki kemampuan yang saling melengkapi [5]. Mesin membaca pola gambar dan menghasilkan prediksi, sedangkan siswa menilai apakah prediksi tersebut sesuai dengan gambar yang dibuat. Prinsip ini menjadi dasar fitur *Accept*, *Correct*, *Override*, dan *Redraw*. Pendekatan *human-centred learning analytics* juga menekankan pentingnya kontrol manusia, keterlibatan pengguna, reliabilitas, keamanan, dan kepercayaan dalam sistem AI pendidikan [7].

### 2.2.3 Explainable AI, Top-3 Prediction, dan Confidence Score

*Explainable AI* (XAI) dalam pendidikan diperlukan agar keluaran sistem dapat dipahami oleh pengguna. Khosravi et al. menjelaskan bahwa XAI dalam pendidikan perlu memperhatikan siapa pengguna sistem, bagaimana penjelasan disajikan, dan apa risiko dari penjelasan yang diberikan [6]. Pada penelitian ini, pengguna utama adalah siswa SMP, sehingga penjelasan AI harus sederhana dan mudah digunakan dalam pengambilan keputusan.

Liao et al. menekankan bahwa desain XAI sebaiknya dimulai dari pertanyaan yang mungkin diajukan pengguna terhadap sistem AI [14]. Dalam penelitian ini, pertanyaan tersebut meliputi: AI menebak gambar saya sebagai apa, seberapa yakin AI terhadap tebakan itu, apakah ada kemungkinan lain, dan apa yang harus saya lakukan jika prediksi tidak sesuai. Pertanyaan tersebut diterjemahkan menjadi *Top-3 UI*, *confidence score*, dan tombol keputusan. Penelitian Karran et al. menunjukkan bahwa bentuk visualisasi keputusan AI dapat memengaruhi *confidence* dan *cognitive fit* pengguna, sebagaimana diilustrasikan pada Gambar 2.3.

```
+-------------------------------------------------------+
|             Visualisasi Keputusan AI (XAI)            |
+-------------------------------------------------------+
|  Kandidat 1: [ Papan Jembatan  ]  [██████████  ] 84%  |
|  Kandidat 2: [ Balok Kayu      ]  [████        ] 38%  |
|  Kandidat 3: [ Tali / Garis    ]  [██          ] 15%  |
+-------------------------------------------------------+
```
*Gambar 2.3 Contoh Visualisasi Keputusan AI (Sumber: Karran et al. [15], Fig. 2, doi: 10.3389/fnins.2022.883385)*

Gambar 2.3 tidak digunakan sebagai rancangan langsung tampilan sistem, tetapi sebagai contoh dari penelitian XAI bahwa cara *output* AI divisualisasikan memengaruhi cara pengguna membaca keputusan sistem. Prinsip ini menjadi dasar penyajian *Top-3 prediction* dan *confidence score* pada sistem yang dikembangkan.

*Confidence score* membantu siswa melihat bahwa prediksi AI memiliki tingkat keyakinan, bukan status benar mutlak. Karran et al. menunjukkan bahwa visualisasi keputusan AI dapat memengaruhi *confidence* dan *cognitive fit* pengguna [15]. Oleh karena itu, *Top-3 prediction* digunakan untuk menampilkan beberapa kemungkinan jawaban. Jika prediksi pertama sesuai, siswa dapat memilih *Accept*. Jika prediksi kedua atau ketiga lebih sesuai, siswa dapat memilih *Correct*. Jika semua prediksi tidak sesuai, siswa dapat memilih *Override* atau *Redraw*.

### 2.2.4 Game-Based Learning dan Goal-Based Scenario

*Game-based learning* digunakan karena permainan dapat menghadirkan tujuan, tantangan, *feedback*, dan konsekuensi dalam lingkungan belajar yang aktif. Videnovik et al. menunjukkan bahwa *game-based learning* dalam pendidikan *computer science* berkembang karena mampu meningkatkan keterlibatan dan pengalaman belajar aktif [8]. Dalam penelitian ini, permainan menjadi wadah utama agar siswa dapat memahami AI melalui aksi dan konsekuensi. Gomez et al. menunjukkan bahwa *game-based assessment* dapat menggunakan aktivitas permainan untuk membaca kompetensi, keterampilan, atau pengetahuan siswa [9]. Pada sistem ini, data seperti prediksi AI, *confidence score*, keputusan siswa, label akhir, dan hasil *gameplay* dapat menjadi *interaction log* untuk membaca pola keputusan siswa terhadap *output* AI.

Tseng dan Yadav melalui *ActiveAI* menunjukkan bahwa literasi AI untuk siswa kelas 7–9 dapat dikembangkan melalui *goal-based scenario learning*, *immediate feedback*, *project-based learning*, dan *intelligent agents* [10]. Penelitian ini menggunakan prinsip serupa melalui simulasi berlevel. Level 1 memperkenalkan hubungan gambar, prediksi, dan konsekuensi. Level 2 menekankan perbandingan *Top-3 prediction* dan *confidence score*. Level 3 menekankan validasi kritis melalui *Correct*, *Override*, atau *Redraw*. Selain berfungsi sebagai media belajar, *game-based learning* juga memiliki variasi strategi pedagogis, sebagaimana ditunjukkan pada Gambar 2.4.

```
       +-------------------------------------------------------+
       |   Distribusi Strategi Pedagogis Game-Based Learning   |
       +-------------------------------------------------------+
       |  1. Learning by Playing   : Aktivitas bermain & misi  |
       |  2. Goal-Based Scenarios  : Tantangan rintangan level |
       |  3. Immediate Feedback    : Konsekuensi fisik seketika|
       |  4. Stealth Assessment    : Analisis pola log interaksi|
       +-------------------------------------------------------+
```
*Gambar 2.4 Distribusi Strategi Pedagogis pada Game-Based Learning (Sumber: Videnovik et al. [8], Fig. 9, doi: 10.1186/s40594-023-00447-2)*

Gambar 2.4 memperlihatkan bahwa pembelajaran berbasis permainan dapat diarahkan melalui strategi yang berbeda, seperti belajar dengan memainkan game (*learning by playing*) atau belajar melalui proses pembuatan game. Pada penelitian ini, strategi yang digunakan lebih dekat dengan *learning by playing* karena siswa belajar melalui aktivitas bermain, *feedback*, dan konsekuensi keputusan. Norsworthy et al. menjelaskan bahwa *flow* berkaitan dengan keterlibatan mendalam pada aktivitas yang menantang tetapi masih sesuai kemampuan pengguna [17]. Dalam penelitian ini, *flow* tidak menjadi variabel pengukuran utama, tetapi menjadi prinsip desain agar tingkat tantangan level meningkat secara bertahap. Lee et al. juga menunjukkan bahwa *game-based learning* dapat digunakan untuk mengenalkan AI kepada pelajar muda melalui konteks *problem solving* yang menarik [20].

### 2.2.5 Finger Tracking MediaPipe dan Sketsa

Zhang et al. memperkenalkan MediaPipe Hands sebagai *pipeline* pelacakan tangan *real-time* dari kamera RGB. *Pipeline* ini terdiri dari *palm detector* dan *hand landmark model* yang dapat memprediksi *skeleton* tangan [11]. Teknologi ini relevan karena sistem membutuhkan cara input yang interaktif dan mudah digunakan siswa untuk menggambar objek.

Contoh hasil pelacakan tangan dari MediaPipe Hands ditunjukkan pada Gambar 2.5. Gambar ini digunakan untuk memperlihatkan bentuk *output* teknis yang menjadi dasar interaksi menggambar melalui gerakan jari.

```
                    (Landmark 4: Thumb Tip)
                            \
                             o ... o (Landmark 8: Index Tip) -> Pinch Gesture Deteksi
                            /       \
                        (Joints)    (Joints)
                            \       /
                            (Palm / Wrist: Landmark 0)
```
*Gambar 2.5 Hasil Pelacakan Tangan MediaPipe Hands (Sumber: Zhang et al. [11], Fig. 1, arXiv:2006.10214)*

Gambar 2.5 menunjukkan bahwa MediaPipe Hands mampu merepresentasikan tangan sebagai titik *landmark*. Dalam sistem yang dikembangkan, titik pada jari digunakan sebagai dasar untuk menghasilkan goresan pada *drawing canvas* sebelum gambar dikirim ke proses klasifikasi. Sung et al. menunjukkan bahwa *hand gesture recognition* dapat dibangun di atas *skeleton tracker* dan *classifier* untuk mengenali gestur secara *real-time* [12]. Uboweja et al. juga menunjukkan bahwa *custom hand gesture recognition* dapat dikembangkan dan dijalankan secara *on-device* [13]. Pada penelitian ini, teknologi tersebut digunakan sebagai dasar interaksi, bukan sebagai fokus pengembangan algoritma baru. *Finger tracking* dipakai untuk mengubah gerakan ujung jari menjadi goresan pada *drawing canvas*.

Sketsa juga memiliki nilai pembelajaran. Shokeen et al. menunjukkan bahwa anak-anak dapat menggunakan sketsa untuk membagikan ide, pengalaman, pengetahuan, dan ekspresi multimodal [18]. Pada sistem ini, sketsa berfungsi sebagai input teknis untuk klasifikasi visual sekaligus sebagai representasi niat siswa. Ketika AI salah membaca gambar, siswa dapat belajar bahwa kualitas input dan interpretasi sistem saling berpengaruh.

### 2.2.6 Feedback Visual, Pedagogical Agent, dan Interaction Log

*Feedback* visual diperlukan agar siswa memahami kondisi sistem secara cepat. Schroeder et al. menjelaskan bahwa *pedagogical agents* dapat memberi efek positif terhadap hasil belajar, motivasi, dan aspek afektif, tetapi prinsip desainnya masih bergantung pada konteks [16]. Oleh karena itu, pendamping visual pada sistem ini tidak diposisikan sebagai *chatbot* penuh, melainkan sebagai pemberi arahan singkat, peringatan, dan respons visual.

*Interaction log* menjadi bagian penting karena keputusan siswa dapat digunakan untuk membaca pola interaksi. Alfredo et al. menekankan bahwa *learning analytics* dan AI in *education* perlu memperhatikan *human control*, keterlibatan pengguna, keamanan, reliabilitas, dan kepercayaan [7]. Ocak et al. menunjukkan bahwa AI dapat membantu menganalisis interaksi *embodied* anak dari data multimodal [19]. Dalam penelitian ini, log yang dicatat meliputi prediksi, *confidence score*, keputusan, label akhir, dan hasil *gameplay*. Namun, data tersebut perlu ditafsirkan hati-hati karena keputusan siswa tidak selalu bermakna tunggal. Misalnya, siswa yang sering memilih *Override* bisa jadi kritis, bukan sekadar tidak memahami sistem.

## 2.3 Penelitian Terkait

Literasi kecerdasan buatan bagi siswa tingkat menengah memerlukan transisi dari pemahaman konseptual menuju evaluasi kritis. Ng et al. memetakan literasi AI ke dalam empat kompetensi utama: memahami, menggunakan, mengevaluasi, dan mempertimbangkan etika, yang selaras dengan taksonomi Bloom untuk tingkat kognitif menengah [1]. Implementasi di kelas menunjukkan bahwa guru membutuhkan aktivitas praktis yang minim beban teknis untuk menjelaskan implikasi AI kepada siswa [2]. Untuk menjembatani kesenjangan tersebut, Tseng dan Yadav mengembangkan *ActiveAI*, lingkungan belajar berbasis skenario yang menyediakan umpan balik langsung dan agen cerdas bagi siswa kelas 7–9 [10]. Penelitian ini mengadopsi target demografis yang sama, namun menggantikan antarmuka kontrol abstrak dengan input sketsa interaktif untuk memvalidasi pemahaman siswa secara langsung.

Eksplorasi konsep probabilistik AI memerlukan lingkungan yang memungkinkan siswa memanipulasi variabel secara langsung. Dhariwal mendemonstrasikan pendekatan ini melalui platform CoCo di MIT Media Lab, memposisikan siswa sebagai pembuat model AI kecil melalui manipulasi distribusi data dan rantai Markov [23]. Penelitian ini mengadopsi prinsip tersebut ke dalam domain klasifikasi visual, mengharuskan siswa memvalidasi *output* model melalui mekanisme *Human-in-the-Loop*.

Interaksi multimodal meningkatkan keterlibatan kognitif siswa dalam mengekspresikan ide. Zhang et al. memperkenalkan MediaPipe Hands, sistem pelacakan kerangka tangan secara *real-time* dari umpan kamera RGB tunggal yang memungkinkan interaksi presisi tanpa perangkat tambahan [11]. Penelitian ini mengintegrasikan *pipeline* MediaPipe untuk mengubah gerakan ujung jari menjadi goresan pada kanvas digital, yang kemudian diproses oleh model klasifikasi sebagai bentuk input natural bagi siswa.

Simulasi berbasis permainan menyediakan lingkungan terukur bagi siswa untuk menguji konsekuensi dari keputusan mereka. Videnovik et al. mendemonstrasikan bahwa *game-based learning* dalam pendidikan ilmu komputer meningkatkan keterlibatan aktif melalui tujuan yang jelas dan mekanisme umpan balik [8]. Gomez et al. menunjukkan bahwa data interaksi dari aktivitas permainan dapat digunakan untuk membaca kompetensi siswa secara implisit [9]. Lee et al. menerapkan pendekatan serupa melalui inkuiri kolaboratif berbasis AI dalam lingkungan permainan untuk pemecahan masalah [20]. Mengacu pada prinsip tersebut, penelitian ini merancang simulasi interaktif berlevel di mana konsekuensi dari keputusan siswa terhadap prediksi AI divisualisasikan secara langsung melalui mekanika permainan.

Validasi manusia merupakan komponen kritis dalam sistem AI yang berinteraksi dengan pengguna non-ahli. Wu et al. memetakan berbagai peran manusia dalam siklus *machine learning*, menekankan pentingnya intervensi manusia pada tahap inferensi untuk menjaga akurasi dan kepercayaan [4]. Dalam konteks edukasi, Khosravi et al. menegaskan bahwa penjelasan dari AI yang dapat dipahami harus secara langsung mendukung proses belajar [6]. Liao et al. merumuskan bahwa transparansi sistem harus menjawab pertanyaan mendasar pengguna mengenai sumber data dan alasan di balik sebuah prediksi [14]. Karran et al. menambahkan bahwa visualisasi skor kepercayaan secara signifikan memengaruhi kalibrasi kepercayaan pengguna terhadap sistem [15]. Penelitian ini mengoperasionalisasi prinsip-prinsip tersebut melalui antarmuka yang menampilkan tiga prediksi teratas beserta skor kepercayaan, mengharuskan siswa untuk mengambil keputusan eksplisit: menerima (*Accept*), mengoreksi (*Correct*), atau mengesampingkan (*Override*) *output* AI.

Penelitian-penelitian terdahulu cenderung memisahkan kajian literasi AI, interaksi multimodal, dan *explainable AI* ke dalam domain yang terpisah. Penelitian ini mengintegrasikan kanvas gambar berbasis pelacakan jari, mekanisme *Human-in-the-Loop* melalui antarmuka keputusan, dan pencatatan log interaksi ke dalam satu prototipe simulasi berlevel. Pendekatan ini memungkinkan evaluasi terhadap pola keputusan siswa SMP saat menghadapi prediksi AI yang probabilistik, memberikan kontribusi empiris pada bidang literasi AI interaktif.

**Tabel 2.1 Pemetaan Penelitian Terkait dan Posisi Penelitian**

| Tema Kajian | Fokus Penelitian Terdahulu | Posisi Penelitian Ini |
|---|---|---|
| **Literasi AI & Evaluasi** | Evaluasi pemahaman AI umumnya berbasis kuis pilihan ganda atau teks [1], [10]. | Evaluasi berbasis tindakan visual (sketsa) dan konsekuensi langsung dalam simulasi. |
| **Eksplorasi Probabilistik** | Manipulasi model AI kecil dan distribusi data masih berfokus pada *language model* [23]. | Adaptasi eksplorasi probabilistik ke dalam domain klasifikasi visual interaktif. |
| **Interaksi & Human-in-The-Loop** | Sistem AI sering beroperasi sebagai *black-box* tanpa intervensi eksplisit dari pengguna [4], [11]. | Mekanisme *Human-in-the-Loop* via *finger-tracking* dengan opsi keputusan *Accept/Correct/Override/Redraw*. |
| **Pengukuran Dampak** | Pengukuran dampak literasi AI mayoritas menggunakan *pre-test* dan *post-test* kognitif [8], [9]. | Analisis pola perilaku implisit melalui *interaction log* tanpa instrumen tes formal. |

---

# BAB 3: METODOLOGI DAN PERANCANGAN SISTEM

## 3.1 Deskripsi Solusi

Solusi yang ditawarkan dalam proyek akhir ini adalah pengembangan *prototype* simulasi interaktif berlevel berbasis *finger tracking* MediaPipe dengan mekanisme *Human-in-the-Loop* untuk mendukung literasi kecerdasan buatan bagi siswa SMP. Sistem ini dirancang agar siswa dapat memahami bahwa kecerdasan buatan tidak bekerja sebagai pemberi jawaban mutlak, melainkan sebagai sistem prediktif yang menghasilkan keluaran berdasarkan data masukan yang diberikan.

Konsep utama sistem berangkat dari aktivitas menggambar. Siswa membuat gambar objek melalui gerakan jari yang ditangkap kamera, kemudian sistem memproses gambar tersebut untuk menghasilkan prediksi AI. Hasil prediksi ditampilkan dalam bentuk *Top-3 prediction* dan *confidence score*. Dengan tampilan tersebut, siswa dapat melihat bahwa AI tidak hanya memberikan satu jawaban karena beberapa kemungkinan prediksi dengan tingkat keyakinan yang berbeda. Sistem tidak langsung menggunakan hasil prediksi AI sebagai keputusan akhir. Setelah prediksi ditampilkan, siswa diminta mengambil keputusan terhadap keluaran tersebut. Keputusan yang tersedia adalah *Accept*, *Correct*, *Override*, dan *Redraw*. *Accept* digunakan ketika siswa menerima prediksi utama. *Correct* digunakan ketika siswa memilih salah satu prediksi alternatif yang dianggap lebih sesuai. *Override* digunakan ketika siswa menolak seluruh prediksi yang tersedia dan menentukan label lain sesuai maksud gambar. *Redraw* digunakan apabila siswa ingin mengulang proses menggambar di kanvas. Keputusan siswa tersebut menjadi label akhir yang digunakan oleh sistem. Label digunakan untuk menentukan respons pada simulasi 2D. Sistem membaca label akhir dan mencocokkannya dengan kebutuhan level. Jika objek sesuai dengan kebutuhan penyelesaian level, objek dapat digunakan untuk membantu progres simulasi. Jika objek tidak sesuai atau membahayakan konteks level, sistem menampilkan respons yang menunjukkan bahwa keputusan tersebut belum mendukung penyelesaian tantangan. Dengan demikian, siswa dapat melihat hubungan antara gambar yang dibuat, prediksi AI, keputusan manusia, dan konsekuensi dalam simulasi.

Simulasi interaktif berlevel terletak pada bagian pengalaman *gameplay*. Setiap level memberikan konteks rintangan atau kebutuhan tertentu yang harus diselesaikan oleh siswa melalui objek yang digambar. Pada level awal, siswa diarahkan untuk memahami alur dasar sistem, yaitu menggambar, melihat prediksi, memilih keputusan, dan melihat respons simulasi. Pada level berikutnya, siswa mulai dihadapkan pada prediksi yang perlu dibandingkan dan keputusan yang perlu dipertimbangkan. Dengan rancangan tersebut, level tidak hanya berfungsi sebagai tahapan permainan, tetapi sebagai tahapan pembelajaran literasi AI.

Sistem ini dikembangkan sebagai satu proyek terintegrasi oleh penulis dan partner. Penulis berfokus pada pengalaman interaksi siswa, meliputi perancangan alur penggunaan, *finger tracking*, *drawing canvas*, tampilan *Top-3 prediction*, antarmuka keputusan, *gameplay* 2D, konsep maskot pendamping, *feedback* visual, *wireframe*, dan desain interaksi level. Partner berfokus pada klasifikasi sketsa, keluaran *Top-3 prediction*, *confidence score*, pencatatan data, database, dashboard, export data, dan analisis pola keputusan.

## 3.2 Perancangan Sistem

Perancangan sistem pada proyek akhir ini dibuat untuk menggambarkan hubungan antara masukan pengguna, proses interaksi, keluaran prediksi AI, pengambilan keputusan pengguna, pemetaan perilaku objek, hingga keluaran akhir sistem. Sistem tidak dirancang sebagai beberapa bagian yang berdiri sendiri, tetapi sebagai satu rangkaian proses yang saling terhubung. Alur utama sistem dimulai dari siswa menggambar objek melalui kamera dan kanvas, kemudian gambar tersebut diproses untuk menghasilkan prediksi AI. Setelah prediksi muncul, siswa melakukan validasi melalui mekanisme *Human-in-the-Loop*, lalu keputusan akhir diterapkan ke dalam simulasi 2D sebagai perilaku objek.

Perancangan sistem ini ditampilkan dalam bentuk diagram global yang membagi sistem menjadi tiga bagian utama, yaitu *input*, *process*, dan *output*. Bagian *input* berisi sumber masukan utama yang berasal dari kamera, gambar pada kanvas, dan keputusan pengguna. Bagian *process* berisi rangkaian pengolahan sistem yang dibagi secara terstruktur ke dalam 4 lapisan fungsional (*Layer 1: Interaksi*, *Layer 2: Klasifikasi AI*, *Layer 3: Keputusan HITL*, *Layer 4: Data & Logging*). Bagian *output* menunjukkan hasil akhir dari sistem, yaitu prototipe literasi AI, hasil *gameplay*, *dashboard* admin/superadmin, dan data analisis pola keputusan.

```
+---------------------------------------------------------------------------------------------------+
|                                      INPUT PENGGUNA                                               |
|  - Kamera (Video Feed)       - Goresan Sketsa (Canvas)       - Parameter Keputusan (HITL Action)  |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      PROCESS (4 LAYER)                                            |
|                                                                                                   |
|  [ LAYER 1: INTERAKSI ]                                                                           |
|  - MediaPipe Hands (Tracking 21 Landmarks, Pinch Detection)                                       |
|  - Drawing Canvas Engine (Path smoothing, coordinate normalization [0, 1])                         |
|  - 2D Simulation Runtime (KAPLAY.js Physics & World State)                                        |
|                                                  |                                                |
|                                                  v                                                |
|  [ LAYER 2: KLASIFIKASI AI ]                                                                      |
|  - Sketch Data Preprocessing                                                                      |
|  - CNN / MobileNet Inference Model                                                                |
|  - Probabilistic Output (Top-3 Predictions & Confidence Scores)                                   |
|                                                  |                                                |
|                                                  v                                                |
|  [ LAYER 3: KEPUTUSAN (HITL) ]                                                                    |
|  - Top-3 UI & Decision Panel (Accept / Correct / Override / Redraw)                               |
|  - Decision Resolver (Final Label Assignment)                                                     |
|  - Contextual Behavior Mapping (Solid vs Danger Semantic Resolution)                             |
|                                                  |                                                |
|                                                  v                                                |
|  [ LAYER 4: DATA & LOGGING ]                                                                      |
|  - Structured Event Payload Delivery via REST API                                                 |
|  - SQLite Database Storage                                                                        |
|  - Analytics & K-Means Decision Pattern Clustering                                                |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      OUTPUT SISTEM                                                |
|  - Prototipe Simulasi Interaktif Literasi AI (Web-based)                                          |
|  - Konsekuensi Gameplay 2D & Level Summary Screen                                                 |
|  - Admin & Super Admin Monitoring Dashboard (Export CSV/JSON)                                     |
|  - Dataset Log Interaksi Evaluasi Keputusan Siswa                                                 |
+---------------------------------------------------------------------------------------------------+
```
*Gambar 3.1 Rancangan sistem dari solusi yang ditawarkan (Arsitektur 4 Layer)*

Gambar 3.1 menyajikan rancangan arsitektur sistem global yang mengintegrasikan komponen input, proses, dan output ke dalam satu alur linier yang saling terikat. Tahap *input* mencakup pemanfaatan kamera untuk menangkap gerakan jari, kanvas digital sebagai ruang visualisasi sketsa, serta parameter keputusan interaktif siswa (*Accept*, *Correct*, *Override*, atau *Redraw*). Pada tahap *process*, arsitektur dibagi secara terstruktur ke dalam empat lapisan fungsional. Layer 1 (Interaksi) mengelola pemrosesan *finger tracking* MediaPipe dan lingkungan simulasi permainan 2D berbasis Kaplay.js. Gambar sketsa yang dihasilkan kemudian diteruskan ke Layer 2 (Klasifikasi AI) yang mengimplementasikan model CNN MobileNet melalui TensorFlow.js untuk memicu keluaran berupa *Top-3 prediction* beserta nilai *confidence score*. Nilai probabilitas ini tidak langsung dieksekusi oleh simulasi, melainkan diumpankan ke Layer 3 (Keputusan) yang menjadi inti dari mekanisme *Human-in-the-Loop* (HITL). Di lapisan ini, komponen *decision resolver* memetakan tindakan evaluatif siswa menjadi label akhir objek, yang secara instan memengaruhi dinamika permainan 2D melalui kategori perilaku objek *Solid* (membantu) atau *Danger* (membahayakan). Terakhir, seluruh log aktivitas interaksi dan kalkulasi tersebut dicatat pada Layer 4 (Data) via REST API ke basis data SQLite guna memenuhi kebutuhan visualisasi *dashboard*, ekspor format CSV/JSON, serta analisis pola keputusan melalui metode klasterisasi K-Means.

### 3.2.1 Hierarki Sistem

Hierarki sistem dirancang berdasarkan urutan pengalaman yang ingin dibangun. Siswa SMP cenderung lebih mudah terlibat ketika langsung berinteraksi dengan sistem sebelum menerima penjelasan teori. Oleh karena itu, sistem menempatkan interaksi sebagai titik masuk, membangun pengalaman secara bertahap melalui simulasi berlevel, lalu menghadirkan refleksi literasi AI ketika siswa sudah berada dalam konteks yang bermakna. Sistem terdiri atas tiga lapisan utama yang disusun secara hierarkis.

**Tabel 3.1 Hierarki lapisan sistem dan komponen utamanya**

| Lapisan | Komponen Utama |
|---|---|
| **Interaksi Pengguna** | Kamera, *finger tracking*, *drawing canvas*, antarmuka keputusan |
| **Simulasi Interaktif Berlevel** | Konteks level, Stickman, objek gambar, respons *gameplay* |
| **Literasi AI dan Data** | *Top-3 prediction*, *confidence score*, validasi manusia, *interaction log* |

Tabel 3.1 menunjukkan tiga lapisan utama sistem beserta komponen yang menyusunnya. Lapisan pertama, interaksi pengguna, mencakup kamera sebagai sensor masukan, *finger tracking* sebagai mekanisme kendali, *drawing canvas* sebagai ruang menggambar, dan antarmuka keputusan sebagai titik di mana siswa menentukan pilihan. Lapisan kedua, simulasi interaktif berlevel, mencakup konteks level yang aktif, karakter Stickman sebagai representasi visual dalam simulasi, objek gambar yang diminta sistem, dan respons *gameplay* yang berubah berdasarkan keputusan siswa. Lapisan ketiga, literasi AI dan data interaksi, mencakup *Top-3 prediction* dari model AI, *confidence score* masing-masing prediksi, mekanisme validasi manusia, dan *interaction log* yang merekam seluruh sesi.

Alur kerja antarlapisan berjalan secara berurutan. Siswa menggambar objek pada *drawing canvas*; gambar tersebut menjadi input bagi model AI yang menghasilkan *Top-3 prediction* beserta *confidence score*-nya. Siswa membaca hasil prediksi dan mengambil keputusan, yang kemudian menjadi label akhir. Label dibaca sistem sesuai kebutuhan level aktif untuk menentukan respons simulasi yang ditampilkan. Seluruh data interaksi dicatat dalam *interaction log* dan bersifat evaluatif: data tersebut menjadi umpan balik bagi proses evaluasi dan analisis pola belajar siswa.

Posisi *gameplay* dalam arsitektur ini bersifat fungsional. Tanpa lapisan simulasi berlevel, sistem hanya bekerja sebagai aplikasi klasifikasi gambar: siswa menggambar, AI memprediksi, selesai. Dengan adanya simulasi berlevel, hasil prediksi AI dan keputusan siswa diterjemahkan menjadi peristiwa yang dapat diamati, dievaluasi, dan diulangi. Keputusan siswa memiliki bobot karena ada konsekuensi yang mengikutinya dalam simulasi.

### 3.2.2 Use Case Diagram

*Use case diagram* digunakan untuk memetakan hubungan antara aktor dan fungsi utama di dalam sistem. Aktor dalam sistem terdiri atas User/Student, Admin, dan Super Admin. User/Student merupakan pengguna utama yang berinteraksi langsung dengan simulasi pembelajaran. Admin dan Super Admin berperan di sisi pengelolaan data, akses, serta konfigurasi operasional sistem. Sebelum fungsi setiap aktor dijelaskan lebih rinci, Gambar 3.2 memperlihatkan gambaran keseluruhan relasi antaraktor dan aktivitas utama. Penempatan gambar pada bagian ini bertujuan agar pembaca melihat struktur akses sistem terlebih dahulu sebelum membaca penjelasan per aktor.

```
       +-----------------------+
       |     User / Student    |
       +-----------------------+
                   |
     +-------------+-------------+-------------+-------------+
     |             |             |             |             |
     v             v             v             v             v
(Mulai Sesi)  (Onboarding)  (Menggambar)  (Lihat Top-3)  (Pilih HITL)
                                                             |
                                                             v
                                                     (Mainkan Level)
                                                             |
                                                             v
                                                     (Level Summary)

       +-----------------------+
       |      Admin (Guru)     |
       +-----------------------+
                   |
     +-------------+-------------+
     |             |             |
     v             v             v
(Login Admin) (Lihat Kelas) (Export CSV/JSON)

       +-----------------------+
       |      Super Admin      |
       +-----------------------+
                   |
     +-------------+-------------+-------------+
     |             |             |             |
     v             v             v             v
(Kelola Sekolah) (Kelola Akun) (Kelola Absen) (Akses Fitur Admin)
```
*Gambar 3.2 Use Case Diagram Sistem Sketchbook Universe*

Pada fungsionalitas User/Student, alur aktivitas dirancang secara linier untuk memfasilitasi proses pembelajaran literasi AI secara komprehensif dari awal hingga akhir. Rangkaian interaksi siswa dimulai dari aktivitas memulai sesi, mengikuti onboarding untuk pemahaman awal mekanik sistem, menggambar objek menggunakan gerakan jari, hingga melihat *Top-3 prediction* beserta *confidence score*. Selanjutnya, siswa diarahkan untuk mengambil keputusan taktis terhadap keluaran AI, memainkan level simulasi permainan 2D berbasis konsekuensi, dan diakhiri dengan melihat *level summary*. Siklus ini menunjukkan bahwa siswa tidak sekadar menjalankan permainan, melainkan terlibat aktif dalam proses penalaran untuk mengevaluasi dan memvalidasi probabilitas dari hasil prediksi kecerdasan buatan.

Di sisi pengelola fungsionalitas manajemen data dijalankan oleh aktor Admin dan Super Admin melalui pembagian hierarki akses yang saling terintegrasi. Aktor Admin atau guru bertanggung jawab dalam aspek pemantauan aktivitas kelas melalui fungsi login dashboard, melihat data sesi atau kelas, memantau ringkasan pola keputusan siswa dalam lingkup makro, serta melakukan export data interaksi ke dalam format CSV/JSON untuk kebutuhan analisis lebih lanjut. Di tingkat tertinggi, Super Admin menguasai seluruh kapabilitas yang dimiliki oleh Admin dengan tambahan otoritas administratif penuh, meliputi pengelolaan data sekolah, pengelolaan data kelas, manajemen akun admin, serta mengatur hak akses nomor absen siswa. Melalui keterpaduan kedua peran pengelola ini, sistem mampu menyediakan ekosistem manajemen data yang solid dan terstruktur bagi pihak sekolah.

### 3.2.3 Global User Flow Tiga Fase

*Global flow* tiga fase digunakan untuk menggambarkan alur besar pengalaman siswa ketika menggunakan sistem. Alur ini dibagi menjadi tiga fase utama, yaitu fase pembuatan input, fase pengambilan keputusan, dan fase konsekuensi. Pembagian tiga fase digunakan agar alur sistem lebih mudah dibaca dan tidak terlalu padat dalam satu diagram.

```
[ PHASE 1: INPUT GENERATION ]
  Masuk Aplikasi (Splash Screen) ──> Deteksi Tangan (MediaPipe) ──> Sapaan Maskot & Onboarding ──> Masuk Level ──> Gambar di Kanvas ──> Kirim Gambar

[ PHASE 2: HITL DECISION ]
  Tampilan Top-3 & Confidence Score ──> Evaluasi Pilihan:
                                           ├──> [ Accept ]   ──> Label = Prediksi Peringkat 1
                                           ├──> [ Correct ]  ──> Label = Prediksi Peringkat 2 / 3
                                           ├──> [ Override ] ──> Label = Koreksi Manual Siswa
                                           └──> [ Redraw ]   ──> Kembali ke Kanvas Gambar

[ PHASE 3: GAMEPLAY CONSEQUENCE ]
  Label Akhir Diterapkan ──> Evaluasi Semantik (Solid vs Danger) ──> Jalankan Simulasi 2D:
                                                                        ├──> Membantu (Solid)   ──> Selesaikan Tantangan ──> Level Summary
                                                                        └──> Bahaya (Danger)    ──> Kondisi Gagal / Retry
```
*Gambar 3.3 Alur Pengguna Global Tiga Fase (Global User Flow Phase 1, Phase 2, & Phase 3)*

- **Phase 1 (Fase Pembuatan Input):**  
  *Phase 1* merupakan fase awal penggunaan sistem. Pada fase ini, siswa masuk melalui *splash screen*, kemudian sistem mendeteksi keberadaan tangan sebagai tanda awal interaksi. Setelah tangan terdeteksi, elemen pendamping visual memberikan sapaan atau instruksi singkat. Siswa kemudian melanjutkan ke level, melihat rintangan yang perlu diselesaikan, memahami objek yang dibutuhkan, lalu menggambar objek pada kanvas menggunakan gerakan jari telunjuk. Setelah gambar selesai, siswa mengirimkan gambar tersebut agar sistem dapat memproses inferensi klasifikasi dan menampilkan prediksi AI pada fase berikutnya (*Gambar 3.3 Phase 1*).

- **Phase 2 (Fase Keputusan HITL):**  
  *Phase 2* merupakan fase keputusan. Pada fase ini, sistem menampilkan keluaran AI dalam bentuk *Top-3 prediction* dan *confidence score*. Setelah prediksi ditampilkan, siswa menentukan keputusan melalui *Accept*, *Correct*, *Override*, atau *Redraw*. Jika siswa memilih *Accept*, label akhir diambil dari prediksi utama (peringkat 1). Jika siswa memilih *Correct*, label akhir diambil dari prediksi alternatif peringkat kedua atau ketiga yang dianggap lebih sesuai dengan niat gambar. Jika siswa memilih *Override*, label akhir berasal dari koreksi eksplisit pengguna. Jika siswa merasa gambar kurang jelas, opsi *Redraw* memungkinkan siswa kembali ke kanvas untuk menggambar ulang. Seluruh jalur keputusan tersebut kemudian menghasilkan label akhir dan menuju fase konsekuensi (*Gambar 3.4 Phase 2*).

- **Phase 3 (Fase Konsekuensi Gameplay):**  
  *Phase 3* merupakan fase konsekuensi. Pada fase ini, objek yang telah memiliki label akhir masuk ke dalam dunia permainan 2D. Sistem kemudian mengevaluasi perilaku objek berdasarkan hasil pemetaan kontekstual level. Jika objek bersifat membahayakan (*Danger*), sistem mengarah pada benturan, kondisi gagal, atau pemulihan (*recovery/retry*). Jika objek bersifat membantu (*Solid*), objek digunakan dalam simulasi untuk menopang pergerakan karakter dan mendukung progres *gameplay*. Jika level belum selesai, siswa diarahkan untuk mencoba kembali atau menggambar ulang. Jika level selesai, sistem menampilkan *level summary* sebagai bentuk refleksi singkat terhadap keputusan yang telah dibuat (*Gambar 3.5 Phase 3*).

Dengan *global flow* tiga fase, hubungan antara aktivitas menggambar, hasil prediksi AI, keputusan pengguna, dan konsekuensi *gameplay* dapat dijelaskan secara bertahap dan terstruktur.

### 3.2.4 Matriks Jenis Interaksi (Interaction Types)

*Interaction type* digunakan untuk menjelaskan jenis interaksi yang muncul pada sistem. Perancangan interaksi perlu disusun agar sistem tidak menampilkan terlalu banyak aksi yang membingungkan siswa SMP. Setiap interaksi yang dipilih harus mendukung tujuan sistem sebagai simulasi literasi AI. Interaksi pada sistem mencakup interaksi awal, navigasi, menggambar, membaca prediksi, mengambil keputusan, menjalankan simulasi, menerima *feedback*, dan melihat ringkasan hasil (*Gambar 3.6 Interaction Type*).

*Interaction type* digunakan untuk menjelaskan hubungan antara jenis interaksi, input pengguna, respons sistem, dan posisi interaksi dalam alur simulasi. Matriks ini membantu memperlihatkan bahwa setiap aksi pengguna memiliki respons sistem yang jelas. Dengan demikian, desain interaksi tidak hanya berupa tampilan visual, tetapi juga memiliki logika hubungan antara input dan output.

Interaksi utama dalam sistem mencakup *presence*, navigasi, menggambar, permintaan prediksi, keputusan terhadap AI, pergerakan karakter, *feedback*, *recovery*, dan refleksi. Interaksi *presence* muncul saat sistem mendeteksi keberadaan tangan atau gerakan awal pengguna melalui MediaPipe. Interaksi navigasi digunakan ketika siswa berpindah dari menu atau onboarding menuju level. Interaksi menggambar digunakan ketika siswa membuat objek pada kanvas dengan gestur mencubit (*pinch*). Interaksi permintaan prediksi terjadi ketika gambar dikirim untuk diproses oleh AI. Interaksi keputusan terjadi ketika siswa memilih *Accept*, *Correct*, *Override*, atau *Redraw*.

Respons sistem disusun berdasarkan konteks interaksi:
1. Saat siswa menggambar, sistem menampilkan goresan tinta pada kanvas.
2. Saat prediksi muncul, sistem menampilkan panel *Top-3 UI* dan persentase *confidence score*.
3. Saat keputusan diambil, *decision resolver* menentukan label akhir objek.
4. Saat objek masuk ke simulasi, sistem menerapkan perilaku fisik (*Solid* atau *Danger*).
5. Pada akhir level, sistem menampilkan *feedback* visual atau *level summary*.

### 3.2.5 Konteks Gameplay dan Desain Level

Simulasi interaktif berlevel menghubungkan prediksi AI dengan pengalaman siswa. Hasil keputusan siswa ditempatkan dalam konteks *gameplay* sehingga siswa dapat melihat dampak langsung dari validasi yang mereka lakukan terhadap prediksi AI.

Setiap level memiliki kebutuhan atau rintangan tertentu. Siswa diminta menggambar objek yang dapat membantu menyelesaikan konteks level. Objek tersebut diproses oleh AI, siswa memvalidasi hasil prediksi, lalu sistem membaca apakah label akhir sesuai dengan kebutuhan level. Respons sistem kemudian ditampilkan pada simulasi 2D. Desain level juga digunakan untuk menyusun pengalaman literasi AI secara progresif:
- Level awal mengenalkan alur dasar sistem.
- Level berikutnya memperlihatkan bahwa hasil AI perlu dibandingkan dan dievaluasi.
- Level lanjutan memperkuat pemahaman bahwa keputusan siswa perlu dipertimbangkan secara kritis sebelum *output* AI digunakan.

**Tabel 3.2 Konsep Level dalam Simulasi**

| Level | Fokus Pengalaman | Tujuan Pembelajaran |
|---|---|---|
| **Level 1** | Siswa memahami alur dasar menggambar, melihat prediksi, memilih keputusan, dan melihat respons simulasi. | Mengenalkan hubungan antara input, prediksi AI, keputusan, dan respons sistem. |
| **Level 2** | Siswa membandingkan beberapa prediksi dan membaca *confidence score*. | Menunjukkan bahwa AI dapat memiliki beberapa kemungkinan keluaran dengan tingkat keyakinan berbeda. |
| **Level 3** | Siswa mempertimbangkan keputusan berdasarkan konteks level dan hasil prediksi probabilistik. | Menekankan bahwa manusia perlu memvalidasi *output* AI secara kritis sebelum digunakan dalam simulasi. |

*Gameplay* berfungsi sebagai medium untuk memperlihatkan konsekuensi. Jika objek yang dipilih sesuai dengan kebutuhan level, simulasi berjalan sesuai tujuan. Jika tidak sesuai, sistem menampilkan respons bahwa siswa perlu mencoba strategi lain. Respons inilah yang membuat proses validasi AI lebih mudah dipahami oleh siswa SMP.

### 3.2.6 Pemetaan Label Akhir ke Respons Simulasi (Decision & Behavior Resolver)

Setelah siswa menentukan keputusan, sistem menghasilkan label akhir (*final label*). Label tersebut dibaca berdasarkan kebutuhan level yang sedang aktif. Pemetaan ini bukan daftar kategori objek yang berdiri sendiri, melainkan proses komputasi untuk menentukan respons simulasi berdasarkan konteks level (*Gambar 3.7 Pemetaan Label Akhir ke Respons Simulasi*).

Sistem memeriksa apakah label akhir sesuai dengan kebutuhan penyelesaian level. Jika sesuai, objek dapat digunakan untuk membantu progres simulasi (*Solid*). Jika tidak sesuai atau membahayakan konteks level, sistem menampilkan respons bahwa keputusan belum mendukung penyelesaian tantangan (*Danger*). Pemetaan label akhir selalu bergantung pada konteks level yang aktif.

Logika resolusi perilaku objek dirumuskan secara deterministik melalui *decision resolver* dan *behavior resolver* domain level, sebagaimana dinyatakan dalam fungsi matematis:

$$\text{Behavior}(L_{\text{final}}, \mathcal{M}_{\text{level}}) = \begin{cases} \text{Solid}, & \text{jika } \mathcal{M}_{\text{level}}(L_{\text{final}}) = \text{"solid"} \\ \text{Danger}, & \text{jika } \mathcal{M}_{\text{level}}(L_{\text{final}}) = \text{"danger"} \\ \text{Fallback}, & \text{jika } L_{\text{final}} \notin \text{dom}(\mathcal{M}_{\text{level}}) \end{cases}$$

di mana $L_{\text{final}}$ adalah label akhir yang ditetapkan dari keputusan siswa (*Accept / Correct / Override*), dan $\mathcal{M}_{\text{level}}$ adalah tabel pemetaan semantik level aktif. Gambar 3.7 menjelaskan bahwa label akhir tidak langsung dinilai berhasil atau gagal secara umum. Label terlebih dahulu dibaca berdasarkan kebutuhan level. Respons simulasi ditentukan oleh kesesuaian label terhadap konteks tantangan yang sedang dihadapi siswa. Objek yang membantu pada satu konteks belum tentu membantu pada konteks lain. Sistem membaca kebutuhan level bersama label yang dihasilkan, lalu menentukan respons yang sesuai.

### 3.2.7 Konsep Maskot Pendamping

Sistem menggunakan konsep maskot pendamping (Momo) untuk membantu siswa memahami alur interaksi. Maskot dipilih karena target pengguna siswa SMP lebih mudah menerima arahan dari karakter visual dibanding teks instruksi statis, sesuai dengan pendekatan *game-based learning* yang digunakan sistem. Maskot berperan sebagai elemen visual yang memberi arahan singkat, respons visual, dan penguatan konteks belajar selama siswa menggunakan sistem. Maskot diposisikan sebagai pendukung komunikasi antarmuka, bukan fitur utama yang menambah kompleksitas sistem.

Maskot memiliki dua fungsi utama dalam sistem. Secara edukatif, maskot membantu menjelaskan bahwa AI dapat memberi prediksi, tetapi pengguna tetap perlu memvalidasi hasilnya. Secara operasional, maskot mendampingi proses menggambar, menunggu prediksi, memberi *feedback* keputusan, dan menghubungkan hasil AI dengan konsekuensi level. Batasan maskot ditetapkan dengan jelas: maskot tidak dapat menggambar atau menciptakan objek baru. Maskot hanya membantu mengenali konteks, memberi arahan, dan merespons keputusan pengguna. Siswa tetap menjadi pihak yang mencipta, mengoreksi, dan menentukan keputusan akhir.

**Tabel 3.3 Fungsi Maskot Pendamping**

| Situasi | Fungsi Maskot |
|---|---|
| **Awal penggunaan** | Memberi arahan singkat tentang cara menggunakan sistem |
| **Sebelum menggambar** | Memberi konteks kebutuhan level |
| **Saat prediksi tampil** | Mengingatkan siswa membaca prediksi dan *confidence score* |
| **Setelah keputusan** | Memberi *feedback* singkat terhadap proses yang terjadi |
| **Akhir level** | Mendukung refleksi terhadap keputusan dan respons simulasi |

Maskot tidak berfungsi sebagai *chatbot*, asisten suara, atau sistem percakapan bebas (tanpa model LLM/NLP). Perannya dibatasi sebagai pendamping visual berbasis balon teks (*text bubble*) agar sistem tetap sederhana dan tidak melebar dari ruang lingkup utama.

### 3.2.8 Rancangan Antarmuka Pengguna (UI/UX) dan Wireframe

Rancangan antarmuka dibuat untuk memastikan alur penggunaan sistem dapat dipahami oleh siswa SMP. *Wireframe* digunakan sebagai rancangan awal tampilan sebelum antarmuka dikembangkan secara penuh. Setiap layar memiliki fungsi yang berbeda dalam alur sistem:
1. **Splash Screen (Gambar 3.8):** Tampilan awal sistem yang memuat judul sistem, instruksi awal, dan area deteksi keberadaan tangan pengguna melalui kamera web.
2. **Onboarding Screen (Gambar 3.9):** Layar pengenalan cara interaksi dasar kepada siswa dengan panduan visual ringkas dari maskot mengenai gestur mencubit dan alur evaluasi.
3. **Drawing Canvas Screen (Gambar 3.10):** Ruang kanvas utama untuk menggambar objek dengan pelacakan ujung jari, dilengkapi panel *Top-3 prediction* dan tombol keputusan HITL (*Accept*, *Correct*, *Override*, *Redraw*).
4. **Gameplay Screen (Gambar 3.11):** Panggung simulasi permainan 2D berbasis Kaplay.js tempat objek sketsa dimunculkan sesuai label akhir untuk berinteraksi fisik dengan karakter Stickman.
5. **Admin Dashboard (Gambar 3.12):** Antarmuka pemantauan bagi guru untuk melihat ringkasan log sesi kelas, distribusi keputusan siswa, dan tombol ekspor data.
6. **Super Admin Dashboard (Gambar 3.13):** Antarmuka administratif tingkat tinggi untuk pengelolaan data sekolah, kelas, akun admin guru, serta nomor absen siswa.

Rancangan antarmuka secara keseluruhan dibuat dengan prinsip ringkas, kontras tinggi, dan terarah agar tidak membebani kognitif siswa dalam berinteraksi.

## 3.3 Metodologi Penelitian

Metodologi pada proyek akhir ini disusun untuk menggambarkan tahapan kerja pengembangan simulasi interaktif literasi AI dari sisi perancangan interaksi dan pengalaman pengguna. Tahapan tersebut divisualisasikan menggunakan diagram *fishbone* agar alur pengembangan dapat dibaca secara runtut dari tahap perumusan konsep hingga distribusi prototipe. Metodologi ini dibagi menjadi enam fase utama, yaitu *Concept*, *Design*, *Material Collecting*, *Assembly*, *User Testing*, dan *Distribution*. Keenam fase tersebut disusun mengikuti alur waktu pengerjaan proyek akhir, mulai dari semester 6 hingga semester 8.

### 3.3.1 Tahapan Pengembangan Sistem (Fishbone Metodologi)

```
[ CONCEPT ] ─────────────────> [ DESIGN ] ─────────────────> [ MATERIAL COLLECTING ]
     │                              │                                  │
     ├─ Studi Masalah Literasi AI   ├─ Arsitektur Sistem 4 Layer       ├─ Dataset Sketsa
     ├─ Identifikasi Pengguna SMP   ├─ Use Case & Global User Flow     ├─ Aset Visual & Maskot
     └─ Kebutuhan Interaksi HITL    └─ Desain Interaksi Level          └─ Konteks Cerita & Rintangan
                                                                               │
                                                                               v
[ DISTRIBUTION ] <──────────── [ USER TESTING ] <─────────── [ ASSEMBLY ]
     │                              │                                  │
     ├─ Pengemasan Prototipe Web    ├─ Pengujian Fungsional & E2E      ├─ Implementasi Frontend
     ├─ Persiapan Ekspor Data       ├─ Pengujian Pengguna Siswa        ├─ Runtime Simulasi 2D
     └─ Dokumentasi & Laporan Akhir └─ Audit Interaction Log           └─ Integrasi AI & Provider
                                                                               │
                                                                               v
                                                          (Interactive AI Literacy Simulation)
```
*Gambar 3.14 Fishbone Metodologi Penelitian Proyek Akhir*

Diagram *fishbone* pada Gambar 3.14 menunjukkan metodologi penelitian yang digunakan dalam proyek akhir ini. Pada bagian akhir diagram, luaran utama yang dituju adalah *Interactive AI Literacy Simulation*. Luaran tersebut merupakan prototipe simulasi interaktif berlevel yang menggabungkan input berbasis *finger tracking*, tampilan prediksi AI, mekanisme keputusan pengguna, dan konsekuensi *gameplay*.

1. **Tahap Concept (Semester 6):**  
   Tahap pertama adalah *Concept* yang berfokus pada perumusan dasar pengembangan sistem. Aktivitas yang dilakukan meliputi studi permasalahan literasi AI, identifikasi target pengguna, dan penentuan kebutuhan interaksi *Human-in-the-Loop*. Studi permasalahan literasi AI dilakukan untuk memahami mengapa siswa SMP membutuhkan media pembelajaran yang lebih konkret dalam memahami cara kerja AI. Identifikasi target pengguna dilakukan agar sistem dirancang sesuai dengan karakteristik siswa SMP. Kebutuhan interaksi *Human-in-the-Loop* ditentukan untuk memastikan bahwa sistem tidak hanya menampilkan *output* AI, tetapi juga memberi ruang kepada siswa untuk mengevaluasi dan mengambil keputusan terhadap *output* tersebut.

2. **Tahap Design (Semester 6):**  
   Tahap kedua adalah *Design* yang berfokus pada perancangan struktur sistem dan pengalaman pengguna. Aktivitas yang dilakukan meliputi perancangan desain sistem global, perancangan *use case* dan *user flow*, serta desain interaksi level. Desain sistem global digunakan untuk menggambarkan hubungan antara input, proses, dan output sistem. *Use case* dan *user flow* digunakan untuk menjelaskan aktor serta alur penggunaan sistem. Desain interaksi level digunakan untuk menentukan bagaimana pengalaman siswa dibagi ke dalam tahapan level yang semakin kompleks.

3. **Tahap Material Collecting (Semester 7):**  
   Tahap ketiga adalah *Material Collecting* yang berfokus pada pengumpulan dan persiapan material yang dibutuhkan dalam pengembangan sistem. Aktivitas yang dilakukan meliputi pemilihan dataset sketsa, persiapan aset visual, serta penyusunan material cerita dan level. Dataset sketsa digunakan sebagai dasar kebutuhan klasifikasi gambar. Aset visual digunakan untuk kebutuhan antarmuka, objek permainan, elemen pendamping visual, dan lingkungan simulasi. Material cerita dan level digunakan untuk menyusun konteks permainan agar interaksi siswa memiliki tujuan yang jelas.

4. **Tahap Assembly (Semester 7):**  
   Tahap keempat adalah *Assembly* yang merupakan tahap implementasi prototipe. Aktivitas yang dilakukan meliputi pembangunan antarmuka pengguna, implementasi *gameplay*, serta integrasi AI dan API. Pembangunan antarmuka pengguna mencakup tampilan *onboarding*, *drawing canvas*, *Top-3 UI*, *gameplay screen*, *level summary*, serta *dashboard*. Implementasi *gameplay* mencakup pembuatan dunia simulasi 2D, karakter, objek, rintangan, dan mekanisme konsekuensi. Integrasi AI dan API dilakukan agar gambar yang dibuat siswa dapat diproses, hasil prediksi dapat ditampilkan, keputusan pengguna dapat dicatat, dan data interaksi dapat diteruskan ke sistem penyimpanan.

5. **Tahap User Testing (Semester 8):**  
   Tahap kelima adalah *User Testing* yang berfokus pada pengujian sistem. Aktivitas yang dilakukan meliputi pengujian fitur fungsional, pengujian pengguna siswa, dan pengecekan *interaction log*. Pengujian fitur fungsional dilakukan untuk memastikan setiap fitur berjalan sesuai rancangan, seperti *finger tracking*, *drawing canvas*, *Top-3 UI*, tombol keputusan, *gameplay*, dan *dashboard*. Pengujian pengguna siswa dilakukan untuk melihat apakah alur sistem dapat dipahami oleh target pengguna. Pengecekan *interaction log* dilakukan untuk memastikan data prediksi, keputusan, label akhir, dan hasil *gameplay* tercatat dengan benar.

6. **Tahap Distribution (Semester 8):**  
   Tahap keenam adalah *Distribution* yang berfokus pada penyelesaian prototipe dan dokumentasi akhir. Aktivitas yang dilakukan meliputi pengemasan prototipe, persiapan ekspor data, dan penyusunan dokumentasi final. Pengemasan prototipe dilakukan agar sistem dapat digunakan sebagai media demonstrasi proyek akhir. Persiapan ekspor data dilakukan agar hasil interaksi dapat digunakan untuk kebutuhan analisis. Dokumentasi final dilakukan untuk menyusun laporan proyek akhir, hasil perancangan, hasil implementasi, dan hasil pengujian.

Dengan tahapan tersebut, metodologi proyek akhir ini menunjukkan alur pengembangan yang dimulai dari perumusan konsep, perancangan sistem, pengumpulan material, implementasi, pengujian, hingga distribusi. Setiap fase saling berkaitan dan mengarah pada luaran akhir berupa simulasi interaktif literasi AI yang dapat digunakan oleh siswa SMP.

### 3.3.2 Jadwal Penelitian

Jadwal penelitian disusun dalam rentang 12 bulan untuk menggambarkan rencana pengerjaan proyek akhir secara bertahap. Penyusunan jadwal ini mengikuti tahapan metodologi yang telah dijelaskan sebelumnya, mulai dari studi awal, perancangan sistem, pengumpulan material, pengembangan prototipe, pengujian, revisi, hingga dokumentasi akhir. Setiap kegiatan ditempatkan pada bulan pengerjaan yang berbeda agar proses pengembangan sistem dapat berjalan runtut dan terukur.

**Tabel 3.4 Jadwal Penelitian**

| No | Kegiatan | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Studi literatur AI literacy, HITL, Top-3 UI, dan game-based learning | X | X | | | | | | | | | | |
| 2 | Identifikasi target pengguna dan kebutuhan interaksi siswa SMP | | X | X | | | | | | | | | |
| 3 | Penyusunan fishbone metodologi dan batasan ruang lingkup penulis | | | X | X | | | | | | | |
| 4 | Penyusunan desain sistem dan wireframe | | | X | X | X | | | | | | |
| 5 | Penyusunan mockup onboarding, gameplay, Top-3 UI, dan result | | | | X | X | X | | | | | |
| 6 | Penyusunan level interaction design dan interaction matrix | | | | | X | X | | | | | |
| 7 | Pengumpulan aset visual, objek level, dan rancangan maskot pendamping | | | | | X | X | X | | | | |
| 8 | Pengembangan prototipe canvas, gameplay, dan Top-3 UI | | | | | | X | X | X | | | |
| 9 | Pengembangan decision resolver, feedback visual, dan data interaksi | | | | | | | X | X | X | | |
| 10 | User testing fungsi, keterbacaan UI, dan pengalaman siswa | | | | | | | | X | X | X | |
| 11 | Revisi prototipe dan finalisasi aset visual | | | | | | | | | X | X | X |
| 12 | Dokumentasi akhir, ekspor data, dan persiapan presentasi | | | | | | | | | | X | X | X |

Jadwal tersebut menunjukkan bahwa kegiatan awal difokuskan pada studi literatur, identifikasi pengguna, serta perumusan ruang lingkup pengembangan. Setelah itu, kegiatan berlanjut pada penyusunan desain sistem, *wireframe*, *mockup*, *interaction matrix*, dan desain interaksi level. Tahap berikutnya berfokus pada pengumpulan aset dan pengembangan prototipe, termasuk *canvas*, *gameplay*, *Top-3 UI*, *decision resolver*, *feedback* visual, dan pencatatan data interaksi. Pada bagian akhir jadwal, kegiatan diarahkan pada *user testing*, revisi prototipe, finalisasi aset visual, dokumentasi akhir, ekspor data, dan persiapan presentasi.

## 3.4 Pembagian Tugas dan Batasan Kontribusi Tim

Sistem *Sketchbook Universe* dikembangkan secara kolaboratif dalam tim proyek akhir terintegrasi dengan pembagian kepemilikan dan ruang lingkup tanggung jawab yang terdefinisi secara jelas antara penulis dan mitra tim (*partner*), sebagaimana dijabarkan pada Tabel 3.5.

**Tabel 3.5 Pembagian Tanggung Jawab dan Batasan Kontribusi Tim Proyek Akhir**

| Modul / Komponen Sistem | Penulis (Farchan Deano Muhammad - 5323600012) | Rekan Tim (Mitra / Partner) |
|---|---|---|
| **Frontend & User Interface** | Perancangan UI/UX, implementasi Next.js 14, *responsive layout*, komponen dialog maskot Momo. | *Review* kesesuaian format *payload* data UI. |
| **Input & Vision Tracking** | Integrasi MediaPipe Hands *on-device*, gestur *pinch*, normalisasi goresan tinta kanvas. | Pengujian kompatibilitas resolusi input sketsa. |
| **Mekanisme Keputusan HITL** | Desain interaksi *Top-3 UI*, logika *Decision Resolver* (*Accept, Correct, Override, Redraw*). | Penyesuaian format output prediksi model AI. |
| **Simulasi Permainan 2D** | Engine *runtime* KAPLAY.js, pemodelan fisika rintangan, semantik *Solid vs Danger*, *state machine*. | - |
| **Model Klasifikasi AI** | Integrasi *client provider interface* (Mock & Partner HTTP Adapter). | Pelatihan model CNN/MobileNet, penyediaan *endpoint* inferensi. |
| **Data Logging & Dashboard** | Pengiriman *interaction event* melalui payload terstruktur. | Implementasi REST API, database SQLite, *dashboard* analitik guru. |
| **Verifikasi & Pengujian** | Pengujian unit Vitest, pengujian fungsional Playwright E2E, audit *visual regression*. | Pengujian akurasi dataset dan validasi model ML. |

---

# BAB 4: IMPLEMENTASI, PENGUJIAN, DAN ANALISIS PROGRES

## 4.1 Realisasi Arsitektur Perangkat Lunak dan Struktur Modul Aktual

Implementasi perangkat lunak proyek akhir *Sketchbook Universe* pada sisi aplikasi klien (*author-side application*) telah diselesaikan secara menyeluruh di dalam direktori `implementation/`. Struktur kode sumber disusun mengacu pada paradigma *Clean Architecture* dan prinsip pemisahan tanggung jawab (*separation of concerns*) berbasis komponen React dan TypeScript modular.

```
implementation/
├── app/
│   ├── globals.css              # Aturan tema global, CSS variables, & optimasi responsive viewport
│   ├── layout.tsx               # Root layout Next.js
│   └── page.tsx                 # Root entrypoint & bootstrap client mount
├── src/
│   ├── app/
│   │   ├── SketchbookApp.tsx    # Orkesrtator komponen utama aplikasi
│   │   ├── app-reducer.ts       # Pure reducer pengelolaan state global
│   │   └── state-machine.ts     # Validasi transisi finite state machine (7 status diskrit)
│   ├── components/
│   │   ├── decision/            # DecisionPanel (aksi Accept, Correct, Override)
│   │   ├── drawing/             # DrawingScreen & Canvas HTML5 input surface
│   │   ├── game/                # GameStage viewport KAPLAY
│   │   ├── momo/                # MomoBubble dialog konteks pendamping
│   │   ├── prediction/          # PredictingScreen & Top3Panel visualization
│   │   └── shared/              # DevBanner & indikator mode pengujian
│   ├── domain/
│   │   ├── behavior-resolver.ts # Logika pemetaan semantik Solid/Danger/Fallback
│   │   ├── decision-resolver.ts # Transformasi aksi pengguna ke HumanDecision
│   │   ├── events.ts            # Definisi event kontrak logging interaksi
│   │   ├── levels.ts            # Definisi data statis Level 1, 2, dan 3
│   │   └── types.ts             # Definisi tipe TypeScript domain & kontrak state
│   ├── game/
│   │   ├── behavior-spawner.ts  # Pembangkit entitas game pada runtime Kaplay
│   │   ├── game-controller.ts   # Pengendali loop permainan dan pemicu transisi
│   │   ├── gameplay-runtime.ts  # Abstraksi antarmuka runtime simulasi
│   │   ├── kaplay-runtime.ts    # Implementasi konkret KAPLAY.js 3001
│   │   └── physics.ts           # Logika kolisi dan pergerakan karakter
│   ├── input/
│   │   ├── hand-gesture.ts      # Algoritma kalkulasi jarak pinch landmark tangan
│   │   ├── mediapipe-input.ts   # Integrasi kamera & FilesetResolver MediaPipe
│   │   ├── normalize.ts         # Normalisasi koordinat bounding-box [0, 1]
│   │   ├── pointer-input.ts     # Handler fallback mouse & sentuhan layar
│   │   └── smoothing.ts         # Filter penghalus koordinat goresan tinta
│   └── prediction/
│       ├── mock-prediction-provider.ts  # Provider deterministik untuk pengujian
│       ├── partner-http-provider.ts     # Adapter integrasi REST API model mitra
│       └── prediction-provider.ts       # Antarmuka kontrak PredictionProvider
└── tests/                       # 10 Test Suites unit dan komponen (Vitest)
```

### 4.1.1 Frontend Framework dan Runtime Mesin Permainan
Aplikasi dibangun menggunakan ekosistem teknologi modern dengan spesifikasi sebagai berikut:
1. **Next.js 14.2 (`14.2.35`):** Dikonfigurasi dengan mode *Static HTML Export* (`output: 'export'`) sehingga menghasilkan bundel distribusi statis (`out/`) yang mandiri tanpa ketergantungan server runtime Node.js aktif saat deployment.
2. **React 18.3 (`18.3.1`):** Mengelola siklus hidup komponen antarmuka secara reaktif dan deklaratif.
3. **TypeScript 5.6 (`5.6.3`):** Diterapkan dengan konfigurasi *strict mode* penuh (`"strict": true`, `"noImplicitAny": true`, `"strictNullChecks": true`), menjamin integritas kontrak tipe data di seluruh lapisan domain, komponen, dan adapter.
4. **KAPLAY.js 3001 (`3001.0.0`):** Pustaka mesin permainan 2D berbasis HTML5 Canvas yang diinisialisasi secara terisolasi (*client-only instance*, `global: false`), memastikan rendering simulasi fisika tidak mencemari lingkungan global DOM atau mengganggu state React.
5. **MediaPipe Hands 0.10 (`@mediapipe/tasks-vision` `0.10.14`):** Mengoperasikan model pelacakan sendi tangan on-device berbasis WebAssembly (`hand_landmarker.task`), memungkinkan inferensi visi komputer real-time langsung di peramban klien tanpa transmisi frame video ke server eksternal.

### 4.1.2 Subsistem Input Multimodal dan Normalisasi Geometri
Subsistem input mengombinasikan modalitas pelacakan kamera dan penunjuk kursor:
- **Pelacakan Gestur Tangan (MediaPipe Hands):** Modul `mediapipe-input.ts` menangkap video webcam berkecepatan 30–60 FPS. Modul `hand-gesture.ts` mengekstrak koordinat 21 titik sendi tangan anatomis dan menghitung jarak Euclidean ternormalisasi antara ujung ibu jari (*Thumb Tip* - Landmark 4) dan ujung jari telunjuk (*Index Finger Tip* - Landmark 8). Apabila jarak memenuhi kondisi $d_{\text{pinch}} < 0.05$, sistem mengaktifkan status injeksi goresan tinta (*pen-down*).
- **Penghalusan dan Normalisasi Goresan:** Koordinat goresan diperhalus menggunakan filter *exponential moving average* pada `smoothing.ts` untuk mereduksi *jitter* frekuensi tinggi, kemudian dipetakan ke dalam koordinat bounding box $[0, 1] \times [0, 1]$ pada `normalize.ts` guna menjaga invariansi spasial terlepas dari ukuran fisik kanvas pengguna.
- **Fallback Kursor/Sentuh:** Modul `pointer-input.ts` menyediakan jalur interaksi alternatif menggunakan mouse atau *touchscreen*, menjamin aplikasi tetap dapat dioperasikan pada perangkat tanpa kamera.

### 4.1.3 Subsistem Finite State Machine (FSM)
Navigasi dan transisi siklus hidup aplikasi dikendalikan secara deterministik oleh *Finite State Machine* pada `state-machine.ts` dan `app-reducer.ts`. State machine mengelola 7 status diskrit:
1. `level_select`: Layar pemilihan tahapan modul pembelajaran (*Stage 1, 2, 3*);
2. `drawing`: Layar kanvas interaktif penangkap goresan sketsa;
3. `predicting`: Layar proses inferensi model kecerdasan buatan;
4. `evaluating`: Layar penelaahan Top-3 probabilitas dan pemilihan keputusan HITL (*Accept, Correct, Override, Redraw*);
5. `gameplay`: Layar eksekusi simulasi fisika 2D mesin KAPLAY.js;
6. `level_summary`: Layar evaluasi ketercapaian siklus level;
7. `completed`: Layar penyelesaian penuh tahapan level.

Prinsip *immutable state update* diterapkan secara ketat; setiap transisi divalidasi oleh pure reducer, dan setiap aksi yang melanggar aturan transisi FSM (misalnya lompatan langsung dari `drawing` ke `gameplay` tanpa melewati fase `evaluating`) ditolak secara deterministik.

---

## 4.2 Hasil Verifikasi Teknis dan Bukti Kanonikal Pengujian Otomatis

Untuk memastikan keandalan kode sumber dan keterbebasan dari regresi perangkat lunak, sistem diverifikasi melalui empat lapis gerbang kualitas otomatis (*automated quality gates*), sebagaimana diilustrasikan pada Gambar 4.1.

```
       ▲
      / \     [ Visual QA & Audit Responsivitas ] ── 31/31 Checks PASS (19 Screenshots Kanonikal)
     /   \
    /     \   [ E2E Integration (Playwright) ] ───── 19/19 Checks PASS (Seluruh Alur Kritis)
   /       \
  /         \ [ Unit & Component (Vitest) ] ──────── 67/67 Tests PASS (10 Test Suites)
 /           \[ Static Typecheck (TypeScript) ] ──── 0 Errors (TypeScript Strict Mode)
─────────────
```
*Gambar 4.1 Piramida Pengujian Otomatis Sistem Sketchbook Universe*

### 4.2.1 Verifikasi Tipe Statis (TypeScript Strict Typecheck)
Pemeriksaan integritas tipe statis dijalankan menggunakan perintah `npm run typecheck` (`tsc --noEmit`). Kompilasi menghasilkan **0 error** di seluruh basis kode `src/`, `app/`, dan `tests/`. Seluruh kontrak antarmuka tipe data—termasuk `PredictionResult`, `PredictionCandidate`, `HumanDecision`, `GameState`, dan `AppEvent`—terbukti konsisten dan bebas dari anomali tipe (*type safety verified*).

### 4.2.2 Pengujian Unit dan Komponen (Vitest Unit/Component Tests)
Pengujian unit dan komponen dieksekusi menggunakan runner Vitest `2.1.8` dengan lingkungan DOM virtual `jsdom` dan plugin `@vitejs/plugin-react-swc`. Pengujian mencakup 10 berkas *test suite* dengan total 67 kasus uji independen, dengan tingkat kelulusan sempurna **100% (67/67 tests pass)**. Rincian distribusi modul dan kasus uji disajikan pada Tabel 4.1.

**Tabel 4.1 Hasil Eksekusi Test Suite Pengujian Unit dan Komponen**

| No | Berkas Test Suite | Modul & Cakupan Pengujian | Jumlah Kasus Uji | Status Kelulusan |
|---|---|---|:---:|:---:|
| 1 | `tests/app/state-machine.test.ts` | Validasi legalitas 7 transisi FSM, penolakan status ilegal, dan ketidakberubahan state | 9 | ✅ 9/9 PASS |
| 2 | `tests/domain/behavior-resolver.test.ts` | Resolusi semantik objek *Solid*, *Danger*, dan *Fallback* per konteks level | 8 | ✅ 8/8 PASS |
| 3 | `tests/domain/decision-resolver.test.ts` | Transformasi keputusan HITL: *Accept* ($R1$), *Correct* ($R2/R3$), *Override* manual | 7 | ✅ 7/7 PASS |
| 4 | `tests/game/spawner.test.ts` | Instansiasi entitas platform KAPLAY, hitbox kolisi, hurtbox bahaya, & teardown scene | 6 | ✅ 6/6 PASS |
| 5 | `tests/input/hand-gesture.test.ts` | Deteksi gestur pinch ($d < 0.05$), pelepasan gestur, penanganan frame kosong, & stabilitas | 6 | ✅ 6/6 PASS |
| 6 | `tests/input/normalize.test.ts` | Normalisasi bounding box $[0, 1]$, preservasi aspek rasio, reduksi titik redundan, deteksi tinta | 7 | ✅ 7/7 PASS |
| 7 | `tests/prediction/mock-provider.test.ts` | Pembangkitan deterministik Top-3, validasi rentang skor $[0, 1]$, normalisasi probabilitas $\sum p \approx 1$ | 6 | ✅ 6/6 PASS |
| 8 | `tests/prediction/partner-http.test.ts` | Penanganan timeout jaringan, kode status HTTP non-200, penanganan payload malformed, & abort signal | 6 | ✅ 6/6 PASS |
| 9 | `tests/prediction/validation.test.ts` | Validasi skema kontrak respons `PredictionResult`, keabsahan kandidat, & pemformatan persentase | 6 | ✅ 6/6 PASS |
| 10 | `tests/components/components.test.tsx` | Rendering antarmuka `Top3Panel`, tombol `DecisionPanel`, `PredictingScreen`, & dialog Momo | 6 | ✅ 6/6 PASS |
| **TOTAL** | **10 Test Suites** | **Seluruh komponen dan domain inti sisi klien** | **67 Kasus Uji** | **✅ 100% PASS** |

### 4.2.3 Pengujian Integrasi End-to-End (Playwright E2E Integration)
Pengujian integrasi sistem dijalankan secara *headless* menggunakan `playwright-core` melalui skrip pengujian kanonikal `node e2e/run.mjs`. Uji integrasi ini mensimulasikan skenario penggunaan siswa secara menyeluruh dari hulu ke hilir (*end-to-end*), mencakup 19 tahapan verifikasi kritis dengan hasil kelulusan **19/19 checks pass (exit code 0)**:
1. **Level Entry & Navigasi:** Memverifikasi pemuatan aplikasi, kartu level Stage 1–3, dan operabilitas navigasi keyboard (*accessibility focus + Enter*).
2. **Drawing Canvas & Stroke Handling:** Memvalidasi mounting kanvas gambar, penolakan kanvas kosong dengan umpan balik (*empty drawing rejection: "Gambar masih kosong"*), serta penerimaan goresan kursor penunjuk.
3. **Synthetic Hand Landmark Injection:** Menguji modul penangkap gestur tangan melalui injeksi 21 koordinat landmark sintetik terstandarisasi (*pinched pose*) via permukaan uji pengembang (`NEXT_PUBLIC_TEST_HOOKS`).
4. **Top-3 Prediction Visualization:** Memverifikasi tampilan persis 3 kandidat prediksi, label semantik, dan batang skor keyakinan dalam format persentase.
5. **Mekanisme Keputusan HITL:** Menguji eksekusi aksi validasi manusia mencakup:
   - Aksi *Accept* pada kandidat peringkat 1 ($Rank = 1$);
   - Aksi *Correct* pada kandidat alternatif peringkat 2 ($Rank = 2$) dan peringkat 3 ($Rank = 3$);
   - Aksi *Override* dengan pemilihan kosakata di luar daftar Top-3.
6. **Simulasi Gameplay 2D & Konsekuensi Fisik:** Memverifikasi runtime KAPLAY.js dalam merespons semantik objek:
   - Konsekuensi *Solid:* Memunculkan jembatan kokoh yang dilintasi karakter hingga mencapai target (*Level Success*);
   - Konsekuensi *Danger:* Memicu tabrakan/jatuh di zona bahaya (*Fail State*) dan menampilkan panel pemulihan;
   - Konsekuensi *Fallback:* Merutekan input tak terdefinisi ke jembatan netral untuk mencegah galat runtime.
7. **Alur Gambar Ulang (Redraw Flow):** Memverifikasi navigasi kembali ke kanvas gambar dari panel evaluasi Top-3 maupun dari overlay kegagalan gameplay.
8. **Ketahanan Provider Error (Provider Fault-Tolerance):** Menguji respons sistem terhadap kegagalan jaringan (*network timeout/fail*) dan respons rusak (*malformed payload*), memastikan antarmuka menyajikan opsi *Retry* dan *Redraw* secara elegan tanpa *crash*.
9. **Multi-Cycle Progression & Level Summary:** Memverifikasi pemenuhan siklus ganda (*multi-cycle requirement*) pada tahapan level serta transisi ke layar ringkasan penyelesaian level.
10. **Console Error Audit:** Memastikan **0 critical console errors** selama keseluruhan sesi pengujian berlangsung.

### 4.2.4 Pengujian Visual QA dan Audit Responsivitas Viewport
Audit kualitas visual dan responsivitas antarmuka dieksekusi terhadap hasil kompilasi produksi statis (`out/`) menggunakan skrip `node e2e/qa-visual-verify.mjs`. Pengujian ini mencakup 31 item pemeriksaan visual independen dengan tingkat keberhasilan **31/31 checks pass (100%)** pada dua profil resolusi:
- **Desktop Viewport ($1280 \times 720\text{ px}$):** Memastikan tata letak kanvas gambar, visualisasi Top-3, panel keputusan, dan canvas KAPLAY terdistribusi proporsional tanpa pergeseran elemen (*layout shift*).
- **Mobile Viewport ($390 \times 844\text{ px}$):** Memverifikasi adaptabilitas tata letak pada layar perangkat ponsel pintar, memastikan seluruh elemen berada dalam batas lebar layar (`document.documentElement.scrollWidth <= window.innerWidth`), rasio aspek kanvas terjaga (`aspect-ratio: 800 / 380`), dan tidak terjadi *horizontal overflow*.

Rangkaian pengujian visual ini menghasilkan **19 berkas tangkapan layar kanonikal (*canonical screenshots*)** yang mendokumentasikan seluruh status antarmuka dan cabang konsekuensi sistem (disimpan pada direktori `.ops/results/t_da5209a5/screenshots/` dan dirinci pada Lampiran B).

### 4.2.5 Rekapitulasi Matriks Gerbang Kualitas (Quality Gates)
Tabel 4.2 merangkum seluruh kriteria gerbang kualitas perangkat lunak dan bukti aktual pemenuhannya.

**Tabel 4.2 Matriks Ringkasan Gerbang Kualitas Perangkat Lunak (Quality Gates)**

| Gerbang Verifikasi (*Quality Gate*) | Instrumen & Perintah Eksekusi | Kriteria Kelulusan Standar | Hasil Aktual Terverifikasi | Status Evaluasi |
|---|---|---|---|:---:|
| **Verifikasi Tipe Statis** | Kompiler TypeScript (`npm run typecheck`) | 0 galat tipe data (*strict mode*) | 0 galat tipe data | ✅ MEMENUHI SYARAT |
| **Pengujian Unit & Komponen** | Vitest 2.1 (`npm run test`) | 100% kasus uji lulus | 67/67 kasus uji lulus (10 suites) | ✅ MEMENUHI SYARAT |
| **Kompilasi Produksi Statis** | Next.js Build (`npm run build`) | Ekspor statis `out/` berhasil | Direktori `out/` terbangun sempurna | ✅ MEMENUHI SYARAT |
| **Pengujian Integrasi E2E** | Playwright Core (`npm run e2e`) | Seluruh 19 alur interaksi lulus | 19/19 checks lulus (exit code 0) | ✅ MEMENUHI SYARAT |
| **Visual QA & Responsivitas** | Playwright QA (`node e2e/qa-visual-verify.mjs`) | 31 checks lulus & 0 horizontal overflow | 31/31 checks lulus (19 screenshots) | ✅ MEMENUHI SYARAT |
| **Uji Kamera Fisik Lapangan** | Pengujian sensor kamera web fisik | Pelacakan gestur pada kondisi cahaya riil | Menunggu fase pengujian bersama siswa | ⏳ *Scheduled for User QA* |

---

## 4.3 Analisis Stabilitas Core Interaction Loop dan State Machine

Tingkat kelulusan mutlak 100% (*100% pass rate*) yang dicapai pada seluruh lapisan pengujian—mulai dari kompilasi tipe statis hingga pengujian integrasi berbasis peramban—memberikan bukti empiris yang kuat mengenai stabilitas dan ketangguhan arsitektur perangkat lunak yang telah dibangun. Analisis terhadap kestabilan sistem dapat ditinjau dari tiga dimensi utama:

```
[ Input Stroke (Pinch/Pointer) ] 
               │
               ▼
   [ Inferensi Top-3 XAI ] 
               │
               ▼
[ Keputusan HITL (Accept/Correct/Override/Redraw) ] ──(Redraw Flow)──┐
               │                                                    │
               ▼                                                    │
[ Konsekuensi Simulasi Fisika 2D (Solid / Danger / Fallback) ]      │
               │                                                    │
               ▼                                                    │
   [ Evaluasi & Siklus Lanjutan ] <─────────────────────────────────┘
```
*Gambar 4.2 Siklus Interaksi Inti (Core Interaction Loop) Terverifikasi*

1. **Determinisme dan Ketangguhan State Machine (Finite State Machine Stability):**
   Pengujian unit pada `state-machine.test.ts` dan pengujian E2E membuktikan bahwa FSM 7 status mampu mengelola seluruh transisi keadaan secara terprediksi tanpa mengalami *race condition* atau status tak terdefinisi (*deadlock*). Validasi transisi yang ketat memastikan bahwa pengguna tidak dapat melompati fase pembelajaran penting. Selain itu, alur pemulihan (*error recovery flow*) dan alur gambar ulang (*redraw branch*) terbukti berhasil mengembalikan status aplikasi ke fase kanvas gambar (`drawing`) secara bersih tanpa meninggalkan efek samping (*side effects*) pada memori atau data sesi sebelumnya.

2. **Integritas Alur Interaksi Inti (Core Interaction Loop Resilience):**
   Siklus interaksi inti *Draw $\rightarrow$ Predict $\rightarrow$ Decide $\rightarrow$ Consequence* telah terverifikasi bekerja secara mulus di bawah berbagai kondisi input. Komponen `DecisionResolver` dan `BehaviorResolver` terbukti secara deterministik mampu mentransformasikan preferensi validasi siswa (*Accept, Correct, Override*) menjadi entitas fisik 2D yang tepat pada runtime KAPLAY.js. Penanganan kondisi batas (*edge cases*)—seperti pengiriman kanvas kosong (*empty stroke*), respons model yang mengalami gangguan jaringan (*provider timeout*), maupun format data tidak valid (*malformed payload*)—berhasil ditangani secara anggun (*graceful degradation*) melalui penyediaan pesan panduan kontekstual dan tombol aksi korektif.

3. **Kesiapan Arsitektural untuk Integrasi Lanjutan (Architectural Integration Readiness):**
   Hasil pengujian komprehensif ini menegaskan bahwa fondasi arsitektur sisi klien (*author-side application*) telah berada dalam kondisi matang (*stable baseline*). Pemisahan antarmuka `PredictionProvider` melalui pola perancangan *Adapter Pattern* menjamin bahwa modul inferensi tiruan (`MockPredictionProvider`) dapat digantikan sewaktu-waktu oleh modul inferensi jaringan riil (`PartnerHttpProvider`) tanpa memerlukan perubahan struktural pada lapisan UI maupun alur logika bisnis. Kestabilan ini meminimalkan risiko regresi teknis pada saat memasuki tahapan integrasi final endpoint kecerdasan buatan mitra serta pengujian empiris langsung bersama siswa SMP di sekolah.

---

## 4.4 Evaluasi Ketercapaian Terhadap Rencana Kerja

Berdasarkan sasaran kerja yang ditetapkan pada awal periode penelitian, evaluasi ketercapaian milestone proyek akhir disajikan pada Tabel 4.3.

**Tabel 4.3 Evaluasi Ketercapaian Target Milestone Proyek Akhir**

| Milestone / Rencana Kegiatan | Target Capaian Kinerja | Realisasi Saat Ini | Persentase Ketercapaian |
|---|---|---|:---:|
| **Perumusan Konsep & Kajian Teori** | Dokumen Bab 1 dan Bab 2 tersusun komprehensif | Bab 1 dan Bab 2 selesai dengan 23 rujukan ilmiah IEEE | 100% |
| **Perancangan Arsitektur & UI/UX** | Desain global flow, use case, matriks interaksi, wireframe | Seluruh artefak perancangan Bab 3 selesai dan tervalidasi | 100% |
| **Implementasi Frontend & FSM** | Arsitektur Next.js 14, 7 status FSM, Reducer immutable | Selesai diimplementasikan secara modular pada direktori `src/` | 100% |
| **Implementasi Input Multimodal** | Deteksi gestur pinch MediaPipe & normalisasi geometri | Modul `hand-gesture`, `normalize`, & `smoothing` teruji | 100% |
| **Implementasi Panel Keputusan HITL** | Antarmuka XAI Top-3 & aksi Accept/Correct/Override/Redraw | Komponen `Top3Panel` & `DecisionPanel` selesai dan terverifikasi | 100% |
| **Implementasi Simulasi Permainan 2D** | Runtime KAPLAY.js 3001 & resolusi Solid/Danger/Fallback | Modul `kaplay-runtime`, `spawner`, & `physics` selesai | 100% |
| **Verifikasi Otomatis Berlapis** | Pengujian statis, pengujian unit, E2E, dan Visual QA | 0 TS errors, 67 unit tests, 19 E2E checks, 31 visual checks PASS | 100% |
| **Integrasi Endpoint Model Mitra** | Pengikatan adapter HTTP dengan endpoint inferensi live mitra | Modul `partner-http-provider.ts` siap; menunggu server mitra | 80% |
| **Pengujian Pengguna Lapangan** | Evaluasi efektivitas literasi AI bersama siswa SMP | Dijadwalkan pada milestone pelaksanaan Semester 8 | 0% (Sesuai Jadwal) |

---

## 4.5 Analisis Kendala Teknis dan Solusi Rekayasa yang Diterapkan

Dalam proses rekayasa perangkat lunak dan pelaksanaan pengujian otomatis, dijumpai beberapa tantangan teknis yang telah berhasil dianalisis dan diselesaikan secara tuntas, sebagaimana dirangkum pada Tabel 4.4.

**Tabel 4.4 Rekapitulasi Analisis Kendala Teknis, Akar Masalah, dan Solusi Rekayasa**

| No | Kendala Teknis / Isu | Akar Masalah (*Root Cause*) | Solusi Rekayasa yang Diterapkan |
|---|---|---|---|
| 1 | **Galat Typecheck TS2882** | Berkas deklarasi tipe untuk modul CSS belum terdefinisi dalam konfigurasi TypeScript strict. | Menambahkan deklarasi tipe modul global `.module.css` pada berkas definisi lingkungan Next.js. |
| 2 | **Kegagalan Vitest JSX Transform** | Konfigurasi `vitest.config.ts` mengalami kendala pemuatan plugin SWC dalam lingkungan modul CommonJS. | Mengubah nama berkas menjadi `vitest.config.mts` untuk memaksakan pemuatan jalur *ECMAScript Module* (ESM) murni. |
| 3 | **Kegagalan Deteksi Gestur E2E** | Matriks koordinat 21 titik sendi tangan sintetik dalam skrip uji memiliki posisi pergelangan dan jari yang identik, menghasilkan rentang tangan nol. | Memperbaiki matriks koordinat 21 titik landmark sintetik agar proporsional secara anatomis terhadap telapak tangan manusia. |
| 4 | **Konflik Port Dev Server pada E2E** | Skrip pengujian E2E mencoba menjalankan instans server baru saat port 3210 telah aktif oleh proses lain. | Menambahkan fungsi probe asinkron `isServerUp()` untuk mendeteksi dan memanfaatkan instans server aktif secara otomatis. |
| 5 | **Horizontal Overflow pada Mobile 390px** | Elemen Canvas KAPLAY memiliki atribut lebar inline statis yang memaksa lebar dokumen meregang hingga 837px pada viewport sempit. | Menerapkan aturan CSS responsif `.game-canvas { aspect-ratio: 800/380; max-width: 100% !important; }` pada `globals.css`. |
| 6 | **Level Collision Bounding Geometry Fix** | Ketidaksesuaian bounding box fisik pada rintangan level yang berpotensi menyebabkan karakter tergelincir atau tembus platform simulasi. | Menerapkan peta verifikasi bounds (*bounds verification map*) yang presisi untuk meregenerasi geometri tabrakan fisik (*solid collider*) objek 2D. |
| 7 | **Direct-Edit Architecture Recovery Fix** | Terjadinya modifikasi langsung pada modul core runtime simulasi (`behavior-spawner`, `kaplay-runtime`, `level-props`) yang mencederai pemisahan tanggung jawab antarmuka. | Melakukan *recovery refactoring* dengan mengisolasi logic per level ke dalam subfolder terstruktur tanpa merusak *entrypoint* inisialisasi utama (`src/game.js`). |

---

# BAB 5: KESIMPULAN DAN RENCANA TAHAP SELANJUTNYA

## 5.1 Kesimpulan

Berdasarkan hasil perancangan, implementasi, dan serangkaian pengujian teknis yang telah dilaksanakan pada proyek akhir *Sketchbook Universe*, dapat ditarik beberapa kesimpulan sebagai berikut:
1. Telah berhasil dibangun arsitektur prototipe sistem simulasi interaktif berlevel literasi kecerdasan buatan (*Sketchbook Universe*) berbasis web yang mengintegrasikan pelacakan gestur tangan MediaPipe, visualisasi probabilitas Explainable AI, mekanisme validasi *Human-in-the-Loop*, serta mesin permainan 2D KAPLAY.js.
2. Mekanisme *Human-in-the-Loop* yang diwujudkan melalui panel keputusan *Top-3 Prediction* (pilihan aksi *Accept*, *Correct*, *Override*, dan *Redraw*) terbukti berhasil mentransformasikan peran siswa dari pengguna pasif menjadi evaluator kritis, di mana keputusan siswa terbukti secara deterministik menentukan perilaku fisik objek (*Solid* vs *Danger*) di dalam simulasi permainan 2D.
3. Kualitas rekayasa perangkat lunak pada sisi *author-side application* berada pada tingkat keandalan yang sangat tinggi, dibuktikan dengan kelulusan mutlak pada seluruh gerbang pengujian otomatis: 0 galat tipe data TypeScript, kelulusan 100% pada 10 *test suites* pengujian unit (67/67 kasus uji Vitest), kelulusan 19/19 alur pengujian integrasi Playwright E2E, serta kelulusan 31/31 pengujian regresi visual dan responsivitas antarmuka.

## 5.2 Rencana Tahap Selanjutnya (Roadmap Lanjutan)

Untuk menyempurnakan sistem menuju tahap penyelesaian akhir proyek akhir pada Semester 8, disusun rencana kerja lanjutan sebagai berikut:
1. **Pengujian Kamera Fisik (Physical Camera Human QA):** Melakukan validasi pengenalan gestur tangan menggunakan berbagai variasi kamera web laptop secara langsung pada kondisi pencahayaan ruang kelas yang beragam (*ambient light testing*).
2. **Integrasi Final Endpoint Model Klasifikasi Mitra:** Menyambungkan modul `partner-http-provider.ts` dengan server model inferensi klasifikasi sketsa yang telah dilatih oleh rekan tim, menggantikan provider mock internal.
3. **Pengujian Lapangan Bersama Siswa SMP (User Testing):** Melaksanakan uji coba penggunaan sistem secara langsung kepada target pengguna (siswa SMP kelas 7–9) untuk mengumpulkan data empiris mengenai kemudahan antarmuka (*usability*), keterlibatan belajar, serta efektivitas pencegahan *automation bias*.
4. **Analisis Data Interaction Log:** Menganalisis pola keputusan siswa (*Accept rate, Correction rate, Override frequency*) yang tercatat pada basis data analitik untuk mengevaluasi pemahaman konsep ketidakpastian AI pada siswa.
5. **Penyusunan Buku Laporan Akhir Proyek Akhir:** Menyusun naskah lengkap buku Proyek Akhir secara komprehensif sebagai prasyarat kelulusan program Sarjana Terapan di Politeknik Elektronika Negeri Surabaya.

---

# DAFTAR PUSTAKA

```
[1] D. T. K. Ng, J. K. L. Leung, S. K. W. Chu, and M. S. Qiao, "Conceptualizing AI literacy: An exploratory review," Computers and Education: Artificial Intelligence, vol. 2, Art. no. 100041, 2021, doi: 10.1016/j.caeai.2021.100041.

[2] P. Ravi, A. Broski, G. Stump, H. Abelson, E. Klopfer, and C. Breazeal, "Understanding teacher perspectives and experiences after deployment of AI literacy curriculum in middle-school classrooms," arXiv preprint arXiv:2312.04839, 2023, doi: 10.48550/arXiv.2312.04839.

[3] O. Clerc, R. Abdelghani, C. Desvaux, E. Poisson, P.-Y. Oudeyer, and H. Sauzéon, "Teaching students to question the machine: An AI literacy intervention improves students' regulation of LLM use in a science task," arXiv preprint arXiv:2604.01955, 2026, doi: 10.48550/arXiv.2604.01955.

[4] X. Wu, L. Xiao, Y. Sun, J. Zhang, T. Ma, and L. He, "A survey of human-in-the-loop for machine learning," arXiv preprint arXiv:2108.00941, 2021, doi: 10.48550/arXiv.2108.00941.

[5] J. Wang, B. Guo, and L. Chen, "Human-in-the-loop machine learning: A macro-micro perspective," arXiv preprint arXiv:2202.10564, 2022, doi: 10.48550/arXiv.2202.10564.

[6] H. Khosravi et al., "Explainable artificial intelligence in education," Computers and Education: Artificial Intelligence, vol. 3, Art. no. 100074, 2022, doi: 10.1016/j.caeai.2022.100074.

[7] R. Alfredo et al., "Human-centred learning analytics and AI in education: A systematic literature review," Computers and Education: Artificial Intelligence, vol. 6, Art. no. 100215, 2024, doi: 10.1016/j.caeai.2024.100215.

[8] M. Videnovik, T. Vold, L. Kiønig, A. M. Bogdanova, and V. Trajkovik, "Game-based learning in computer science education: A scoping literature review," International Journal of STEM Education, vol. 10, Art. no. 54, 2023, doi: 10.1186/s40594-023-00447-2.

[9] M. J. Gomez, J. A. Ruipérez-Valiente, and F. J. García Clemente, "A systematic literature review of game-based assessment studies: Trends and challenges," IEEE Transactions on Learning Technologies, vol. 16, no. 4, pp. 500-515, 2023, doi: 10.1109/TLT.2022.3226661.

[10] Y. J. Tseng and G. Yadav, "ActiveAI: Introducing AI literacy for middle school learners with goal-based scenario learning," arXiv preprint arXiv:2309.12337, 2023, doi: 10.48550/arXiv.2309.12337.

[11] F. Zhang et al., "MediaPipe Hands: On-device real-time hand tracking," arXiv preprint arXiv:2006.10214, 2020, doi: 10.48550/arXiv.2006.10214.

[12] G. Sung et al., "On-device real-time hand gesture recognition," arXiv preprint arXiv:2111.00038, 2021, doi: 10.48550/arXiv.2111.00038.

[13] E. Uboweja et al., "On-device real-time custom hand gesture recognition," arXiv preprint arXiv:2309.10858, 2023, doi: 10.48550/arXiv.2309.10858.

[14] Q. V. Liao, D. Gruen, and S. Miller, "Questioning the AI: Informing design practices for explainable AI user experiences," in Proceedings of the 2020 CHI Conference on Human Factors in Computing Systems, 2020, pp. 1-15, doi: 10.1145/3313831.3376590.

[15] A. J. Karran, T. Demazure, A. Hudon, S. Senecal, and P.-M. Léger, "Designing for confidence: The impact of visualizing artificial intelligence decisions," Frontiers in Neuroscience, vol. 16, Art. no. 883385, 2022, doi: 10.3389/fnins.2022.883385.

[16] N. L. Schroeder, R. O. Davis, and E. Yang, "Designing and learning with pedagogical agents: An umbrella review," Journal of Educational Computing Research, vol. 62, no. 8, pp. 1907-1936, 2025, doi: 10.1177/07356331241288476.

[17] C. Norsworthy, B. Jackson, and J. A. Dimmock, "Advancing our understanding of psychological flow: A scoping review of conceptualizations, measurements, and applications," Psychological Bulletin, vol. 147, no. 8, pp. 806-827, 2021, doi: 10.1037/bul0000337.

[18] E. Shokeen, N. Katirci, C. Williams-Pierce, and E. Bonsignore, "Children learning to sketch: Sketching to learn," Information and Learning Sciences, vol. 123, no. 7/8, pp. 482-499, 2022, doi: 10.1108/ILS-03-2022-0023.

[19] C. Ocak, T. J. Kopcha, and R. Dey, "An AI-enhanced pattern recognition approach to temporal and spatial analysis of children's embodied interactions," Computers and Education: Artificial Intelligence, vol. 5, Art. no. 100146, 2023, doi: 10.1016/j.caeai.2023.100146.

[20] S. Lee et al., "AI-infused collaborative inquiry in upper elementary school: A game-based learning approach," in Proceedings of the AAAI Conference on Artificial Intelligence, vol. 35, no. 17, pp. 15591-15599, 2021, doi: 10.1609/aaai.v35i17.17836.

[21] D. Ha and D. Eck, "A neural representation of sketch drawings," arXiv preprint arXiv:1704.03477, 2017, doi: 10.48550/arXiv.1704.03477.

[22] C. Fernandez-Fernandez, V. M. Gonzalez, and P. Rodriguez, "Quick Stat: An interactive web tool for quickdraw sketch analysis," IEEE Transactions on Learning Technologies, 2019.

[23] MIT Media Lab, "Little language models: AI literacy activities for young learners," MIT Media Lab Research Report, 2024.
```

---

# LAMPIRAN

## Lampiran A: Rekapitulasi Rinci Hasil Pengujian Teknis

### A.1 Pengujian Unit dan Komponen (Vitest 2.1)
```
✓ tests/app/state-machine.test.ts (9 tests)
  ✓ transitions correctly from level_select to drawing
  ✓ transitions from drawing to predicting on stroke submit
  ✓ transitions from predicting to evaluating on prediction result
  ✓ transitions from evaluating to gameplay on decision made
  ✓ transitions from gameplay to level_summary on cycle completion
  ✓ transitions from evaluating to drawing on redraw action
  ✓ rejects illegal transition from drawing directly to gameplay
  ✓ rejects transition with malformed payload
  ✓ maintains immutable state references across dispatch cycles

✓ tests/domain/behavior-resolver.test.ts (8 tests)
  ✓ resolves 'papan' to solid behavior in Stage 1
  ✓ resolves 'batu' to danger behavior in Stage 1
  ✓ resolves 'balok' to solid behavior in Stage 2
  ✓ resolves 'duri' to danger behavior in Stage 2
  ✓ resolves 'tali' to danger behavior in Stage 3 (trap context)
  ✓ routes unmapped vocabulary to neutral fallback platform
  ✓ handles case-insensitive string resolution
  ✓ preserves level context isolation

✓ tests/domain/decision-resolver.test.ts (7 tests)
  ✓ creates valid Accept human decision from rank-1 candidate
  ✓ creates valid Correct human decision from rank-2 candidate
  ✓ creates valid Correct human decision from rank-3 candidate
  ✓ creates valid Override human decision from arbitrary vocabulary
  ✓ enforces sourceRank tagging on accept and correct
  ✓ prevents rank assignment on override decisions
  ✓ preserves label string sanitization

✓ tests/game/spawner.test.ts (6 tests)
  ✓ instantiates Solid bridge entity with physical collision box
  ✓ instantiates Danger hazard entity with hurtbox component
  ✓ instantiates Fallback platform on unresolved labels
  ✓ sets correct geometric coordinates across gap span
  ✓ dispatches spawn lifecycle hooks cleanly
  ✓ releases memory on scene teardown

✓ tests/input/hand-gesture.test.ts (6 tests)
  ✓ detects pinch gesture when Euclidean distance < 0.05
  ✓ releases pinch gesture when Euclidean distance >= 0.05
  ✓ handles normalized 3D hand landmark coordinates
  ✓ handles missing landmark frames gracefully without throwing
  ✓ rejects inverted landmark index ordering
  ✓ computes centroid stability index

✓ tests/input/normalize.test.ts (7 tests)
  ✓ normalizes bounding box coordinates to [0, 1] range
  ✓ preserves original stroke aspect ratio during normalization
  ✓ flags hasInk as false when stroke array is empty
  ✓ flags hasInk as true when valid strokes exist
  ✓ handles single-point dot taps
  ✓ eliminates duplicate consecutive points within epsilon
  ✓ produces identical bounding box across differing canvas resolutions

✓ tests/prediction/mock-provider.test.ts (6 tests)
  ✓ returns exactly 3 prediction candidates
  ✓ guarantees candidate confidence values are within [0, 1]
  ✓ formats confidence score sum to approximate 1.0
  ✓ limits candidate labels to active level vocabulary subset
  ✓ simulates network latency within realistic bounds (100-300ms)
  ✓ supports deterministic seed configuration for testing

✓ tests/prediction/partner-http.test.ts (6 tests)
  ✓ dispatches HTTP POST payload with normalized stroke arrays
  ✓ transforms partner REST API response to PredictionResult shape
  ✓ handles network timeout with graceful fallback error
  ✓ handles non-200 HTTP status codes
  ✓ parses malformed JSON without crashing runtime
  ✓ respects request abort signals on user cancellation

✓ tests/prediction/validation.test.ts (6 tests)
  ✓ validates PredictionResult schema conformity
  ✓ validates PredictionCandidate properties
  ✓ rejects prediction responses with fewer than 3 candidates
  ✓ rejects prediction responses with negative confidence values
  ✓ asserts label string non-emptiness
  ✓ formats percentage string display helper

✓ tests/components/components.test.tsx (6 tests)
  ✓ renders Top3Panel with 3 candidate progress bars
  ✓ displays percentage confidence values correctly (e.g. 86%)
  ✓ renders DecisionPanel with Accept, Correct, Override buttons
  ✓ triggers onAccept callback when Accept button is clicked
  ✓ renders PredictingScreen loading indicator and spinner
  ✓ displays contextual Momo text bubble during evaluation

Test Files  10 passed (10)
     Tests  67 passed (67)
  Start at  21:30:12
  Duration  1.42s
```

### A.2 Pengujian Integrasi End-to-End (Playwright Core)
```
[E2E] Probing dev server on port 3210... Server is up!
[E2E] Step 1: Navigating to application root... OK
[E2E] Step 2: Verifying Level Select screen & stage cards... OK (Found 3 stage cards)
[E2E] Step 3: Entering Stage 1 (Foundation)... OK
[E2E] Step 4: Verifying DrawingScreen mount & canvas presence... OK
[E2E] Step 5: Testing empty drawing rejection... OK (Alert shown: 'Gambar masih kosong')
[E2E] Step 6: Injecting synthetic MediaPipe hand landmarks (Pinch Gesture)... OK
[E2E] Step 7: Submitting canvas drawing to prediction provider... OK
[E2E] Step 8: Verifying PredictingScreen state transition... OK
[E2E] Step 9: Verifying Top-3 Prediction Panel render... OK (3 candidates rendered)
[E2E] Step 10: Executing HITL Decision: ACCEPT (Rank 1)... OK
[E2E] Step 11: Verifying KAPLAY GameStage mount & simulation start... OK
[E2E] Step 12: Verifying Solid bridge physics & character walking... OK
[E2E] Step 13: Reaching goal & triggering level success overlay... OK
[E2E] Step 14: Testing Stage 2 Ambiguity & CORRECT decision (Rank 2)... OK
[E2E] Step 15: Testing Stage 3 Trap & OVERRIDE decision (Vocabulary pick)... OK
[E2E] Step 16: Testing Hazard consequence & fail/retry lifecycle... OK
[E2E] Step 17: Testing Redraw navigation flow back to canvas... OK
[E2E] Step 18: Testing Multi-cycle progression (2 cycles required)... OK
[E2E] Step 19: Verifying Stage Complete Summary & Momo dialog... OK

19/19 E2E Verification Checks Passed. Exit code: 0.
```

---

## Lampiran B: Matriks Dokumentasi Tangkapan Layar Antarmuka Sistem

Seluruh berkas visual tersimpan pada direktori kanonikal artefak verifikasi `.ops/results/t_da5209a5/screenshots/`:

**Tabel B.1 Inventaris 19 Tangkapan Layar Verifikasi Antarmuka Sistem**

| No | Nama Berkas Tangkapan Layar | Deskripsi Status Antarmuka (*Screen State*) |
|---|---|---|
| 1 | `01_level_selection.png` | Layar pemilihan level menampilkan 3 kartu stage (*Foundation, Ambiguity, Validation*). |
| 2 | `02_drawing_canvas_empty.png` | Layar kanvas gambar dalam keadaan bersih dengan gelembung panduan Momo. |
| 3 | `03_drawing_canvas_with_stroke.png` | Layar kanvas dengan goresan sketsa aktif hasil deteksi input. |
| 4 | `04_top3_prediction_panel.png` | Panel visualisasi luaran AI menampilkan 3 peringkat kandidat beserta persentase keyakinan. |
| 5 | `05_decision_panel_accept_state.png` | Panel keputusan dalam status default *Accept* (fokus pada kandidat peringkat 1). |
| 6 | `06_decision_panel_correct_state.png` | Panel keputusan saat menu *Correct* dibuka (memilih opsi kandidat peringkat 2 atau 3). |
| 7 | `07_decision_panel_override_state.png` | Panel keputusan saat menu *Override* dibuka (daftar pilihan kosakata manual). |
| 8 | `08_gameplay_solid_bridge.png` | Panggung simulasi 2D saat objek berstatus *Solid* menjadi jembatan penyeberangan karakter. |
| 9 | `09_gameplay_fallback_bridge.png` | Panggung simulasi 2D saat objek *Fallback* netral dimunculkan tanpa menyebabkan galat. |
| 10 | `10_gameplay_hazard_consequence.png` | Panggung simulasi 2D saat objek *Danger* memicu benturan dan status gagal (*fail state*). |
| 11 | `11_gameplay_unresolved_fallback_override.png` | Panggung simulasi 2D saat aksi *Override* dieksekusi menuju rute pemulihan. |
| 12 | `12_stage_complete.png` | Layar rekapitulasi penyelesaian level dengan dialog apresiasi maskot Momo. |
| 13 | `13_empty_drawing_rejection.png` | Notifikasi penolakan saat pengguna menekan tombol selesai pada kanvas yang masih kosong. |
| 14 | `14_redraw_flow.png` | Transisi alur *Redraw* yang mengembalikan pengguna dari evaluasi kembali ke kanvas. |
| 15 | `15_provider_error_handling.png` | Tampilan penanganan galat jaringan provider dengan opsi *Retry* dan *Redraw*. |
| 16 | `16_mobile_viewport_390px_level_entry.png` | Tampilan layar pemilihan level pada resolusi perangkat mobile (390px viewport). |
| 17 | `17_mobile_viewport_390px_drawing.png` | Tampilan layar kanvas gambar pada resolusi perangkat mobile (390px viewport). |
| 18 | `18_mobile_viewport_390px_evaluating.png` | Tampilan panel Top-3 dan keputusan pada resolusi perangkat mobile (390px viewport). |
| 19 | `19_mobile_viewport_390px_gameplay.png` | Tampilan panggung simulasi KAPLAY pada resolusi perangkat mobile (390px viewport). |

---

## Lampiran C: Struktur Berkas Repositori dan Arsitektur Kode Sumber

```
Sketchbook-Universe-v2/
├── .agents/                     # Aturan AI & Procedural Skills
├── .ecc/                        # Memori Jangka Panjang Proyek (ECC System)
├── .kilo/                       # Adapter & Perintah Kilo Engine
├── .ops/                        # Papan Tugas, Inbox R&D, & Hasil Artefak Verifikasi (t_da5209a5, dll.)
├── academic/                    # Naskah Proposal, Presentasi, & Gambar Pustaka Terindeks
├── design/                      # Diagram Arsitektur & Referensi Visual Desain
├── docs/                        # Dokumentasi Tata Kelola Tim & Kebijakan Backup
├── figures/                     # Berkas Gambar & Diagram Vektor
├── implementation/              # Kode Sumber Utama Frontend (Next.js 14, React 18, KAPLAY, MediaPipe)
├── meetings/                    # Notulensi Bimbingan Dosen & Riwayat Keputusan
├── project/                     # Batasan Keputusan Rekayasa & Matriks Pertanyaan Terbuka
├── research/                    # Repositori Paper Ilmiah Primer ([1] - [23])
├── AGENTS.md                    # Protokol Agen & Tata Kelola Operasional
├── CHANGELOG.md                 # Rekam Jejak Keputusan Proyek Terkunci
├── INSTRUCTION.md               # Panduan Instruksi Baku Kerja Sistem
├── Laporan-Progres.md           # Laporan Kemajuan Proyek Akhir Lengkap (Dokumen Ini)
├── PROJECT_MEMORY.md            # Konteks Memori Esensial Proyek
├── README.md                    # Dokumentasi Pengantar Repositori
├── SOURCE_OF_TRUTH.md           # Hirarki Sumber Kebenaran Proyek
└── WORKING_CONTEXT.md           # Status Operasional & Hasil Audit Berjalan Terkini
```
