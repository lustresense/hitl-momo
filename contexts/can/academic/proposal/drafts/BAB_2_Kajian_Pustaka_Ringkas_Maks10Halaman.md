# BAB 2 KAJIAN PUSTAKA

Catatan sitasi:
Naskah ini memakai gaya sitasi numerik IEEE yang umum dipakai Mendeley. Nomor sitasi di dalam teks mengikuti urutan daftar pustaka pada proposal sumber. Metadata daftar pustaka di bagian akhir sudah diverifikasi ulang melalui sumber daring seperti halaman penerbit, DOI, arXiv, ERIC, AAAI, dan repositori institusi.

## 2.1 Deskripsi Permasalahan

Perkembangan kecerdasan buatan atau Artificial Intelligence (AI) membuat literasi digital tidak cukup hanya dipahami sebagai kemampuan menggunakan perangkat dan aplikasi. Literasi AI mencakup kemampuan memahami konsep dasar AI, menggunakan AI secara tepat, mengevaluasi keluaran AI, menciptakan atau memodifikasi solusi berbasis AI secara bertanggung jawab, serta memahami isu etika penggunaan AI [1]. Dalam konteks siswa SMP, kemampuan ini penting karena siswa mulai berhadapan dengan sistem cerdas dalam aktivitas belajar, pencarian informasi, rekomendasi konten, dan penggunaan aplikasi sehari-hari.

Permasalahan utama pada penelitian ini adalah kecenderungan siswa menerima keluaran AI sebagai jawaban final tanpa proses evaluasi. Ravi et al. menunjukkan bahwa pembelajaran literasi AI pada kelas menengah membutuhkan strategi yang membuat konsep AI dapat dipahami melalui pengalaman konkret [2]. Clerc et al. juga menunjukkan bahwa siswa usia menengah perlu dilatih untuk memonitor dan mengevaluasi interaksinya dengan sistem AI agar tidak menerima output secara tidak kritis [3]. Oleh karena itu, pengenalan AI kepada siswa SMP perlu diarahkan pada pengalaman membaca, membandingkan, dan memvalidasi keluaran AI.

Masalah tersebut terlihat pada sistem klasifikasi visual. Keluaran AI tidak berbentuk kebenaran mutlak, tetapi prediksi berdasarkan pola data. Output biasanya berupa label dan nilai keyakinan atau confidence score. Jika siswa hanya melihat satu label akhir, siswa dapat menganggap AI selalu benar. Padahal explainable artificial intelligence dalam pendidikan menekankan bahwa sistem AI perlu disajikan secara dapat dipahami agar pengguna tidak menerima keputusan sistem secara pasif [6]. Visualisasi keputusan AI juga dapat memengaruhi confidence, cognitive fit, dan kepercayaan pengguna terhadap sistem [15].

Human-in-the-Loop (HITL) menjadi pendekatan yang relevan karena menempatkan manusia sebagai bagian dari alur sistem, baik dalam validasi, koreksi, maupun pengambilan keputusan terhadap output model [4]. Wang et al. menekankan bahwa manusia dan mesin memiliki peran saling melengkapi: mesin mampu memproses pola secara cepat, sedangkan manusia dapat memberi penilaian kontekstual ketika keputusan tidak sepenuhnya dapat diserahkan kepada sistem otomatis [5]. Agar konsep prediksi, confidence score, validasi, dan konsekuensi dapat dipahami siswa SMP, penelitian ini mengemasnya dalam simulasi interaktif berlevel berbasis game-based learning yang menghadirkan tujuan, tantangan, feedback, dan konsekuensi [8], [9].

Untuk memperjelas bahwa literasi AI tidak berhenti pada kemampuan mengenal istilah, Gambar 2.1 menampilkan hubungan antara taksonomi kemampuan berpikir dan literasi AI. Gambar ini relevan karena penelitian ini menempatkan siswa pada aktivitas menggunakan, membandingkan, dan mengevaluasi keluaran AI.

**Gambar 2.1 Bloom's Taxonomy and AI Literacy**

![Gambar 2.1 Bloom's Taxonomy and AI Literacy](image/bab2_paper_01_ai_literacy_bloom.jpg)

*Sumber: Ng et al. [1], Fig. 2, doi: 10.1016/j.caeai.2021.100041.*

Gambar 2.1 menunjukkan bahwa literasi AI memiliki tingkat kemampuan yang berlapis, mulai dari mengetahui dan memahami konsep sampai mengevaluasi serta menghasilkan keputusan. Berdasarkan masalah tersebut, penelitian ini mengembangkan simulasi interaktif berlevel berbasis finger tracking MediaPipe dengan mekanisme Human-in-the-Loop. Siswa menggambar objek melalui gerakan jari, sistem menampilkan Top-3 prediction dan confidence score, lalu siswa mengambil keputusan melalui Accept, Correct, Override, atau Redraw. Keputusan tersebut dipetakan menjadi konsekuensi dalam simulasi 2D, sehingga siswa mengalami hubungan langsung antara input, prediksi AI, validasi manusia, dan konsekuensi keputusan.

## 2.2 Teori Penunjang

Teori penunjang pada penelitian ini disusun untuk mendukung rancangan sistem pada Bab 3. Sistem yang dikembangkan menggabungkan literasi AI, finger tracking, klasifikasi visual, Top-3 prediction, confidence score, mekanisme HITL, simulasi berlevel, feedback visual, dan pencatatan data interaksi. Oleh karena itu, teori yang digunakan mencakup aspek pendidikan AI, desain antarmuka AI, teknologi pelacakan tangan, serta pembelajaran berbasis permainan.

Tabel 2.1 Pemetaan teori penunjang terhadap rancangan sistem

| Komponen Sistem | Kebutuhan Teori | Referensi |
|---|---|---|
| Literasi AI siswa SMP | Memahami, menggunakan, mengevaluasi, dan bersikap etis terhadap AI | [1], [2], [3], [10] |
| HITL | Validasi manusia terhadap output AI | [4], [5], [7] |
| Top-3 prediction dan confidence score | Transparansi output AI dan visualisasi keputusan | [6], [14], [15] |
| Simulasi berlevel | Tujuan, tantangan, feedback, konsekuensi, dan assessment berbasis game | [8], [9], [10], [17], [20] |
| Finger tracking dan sketsa | Pelacakan tangan real-time dan sketsa sebagai input multimodal | [11], [12], [13], [18] |
| Feedback visual dan interaction log | Agen pedagogis, scaffolding, dan learning analytics | [7], [16], [19] |

### 2.2.1 Literasi AI untuk Siswa SMP

Ng et al. merumuskan literasi AI melalui beberapa aspek, yaitu mengetahui dan memahami AI, menggunakan dan menerapkan AI, mengevaluasi dan menciptakan dengan AI, serta memahami isu etika [1]. Pada penelitian ini, aspek memahami AI diterjemahkan melalui pengalaman siswa melihat proses prediksi. Aspek menggunakan AI diterapkan ketika siswa membuat gambar sebagai input sistem. Aspek mengevaluasi AI diterapkan ketika siswa membandingkan Top-3 prediction dan confidence score. Aspek tanggung jawab diwujudkan melalui keputusan untuk menerima, mengoreksi, menolak, atau menggambar ulang.

Ravi et al. menunjukkan bahwa pembelajaran literasi AI di kelas menengah membutuhkan aktivitas yang dapat diterapkan guru dan dipahami siswa melalui pengalaman konkret [2]. Clerc et al. memperkuat hal tersebut dengan menunjukkan bahwa siswa perlu dilatih untuk tidak menerima output AI secara tidak kritis [3]. Karena itu, sistem yang dikembangkan perlu memberi siswa ruang untuk mengevaluasi output AI, bukan hanya melihat hasil akhir.

### 2.2.2 Human-in-the-Loop

Human-in-the-Loop adalah pendekatan yang melibatkan manusia dalam alur kerja AI atau machine learning. Wu et al. menjelaskan bahwa manusia dapat terlibat dalam penyediaan data, pemberian label, perbaikan proses, atau intervensi terhadap sistem [4]. Dalam penelitian ini, siswa tidak berperan untuk melatih ulang model secara langsung, tetapi berperan sebagai validator output AI.

Alur HITL pada penelitian ini merujuk pada gagasan bahwa manusia dapat masuk ke dalam proses pembentukan data, pelabelan, dan perbaikan keluaran model. Contoh pipeline HITL dari Wu et al. ditunjukkan pada Gambar 2.2.

**Gambar 2.2 Human-in-the-Loop Data Processing Pipeline**

![Gambar 2.2 Human-in-the-Loop Data Processing Pipeline](image/bab2_paper_03_hitl_pipeline.png)

*Sumber: Wu et al. [4], Fig. 3, arXiv:2108.00941.*

Gambar 2.2 memperlihatkan bahwa manusia dapat berperan dalam proses pemilihan, pemeriksaan, dan pemberian label terhadap data. Dalam penelitian ini, prinsip tersebut diterjemahkan ke level antarmuka: siswa memvalidasi prediksi AI melalui Accept, Correct, Override, atau Redraw sebelum hasilnya digunakan dalam simulasi.

Wang et al. menjelaskan bahwa HITL muncul karena manusia dan mesin memiliki kemampuan yang saling melengkapi [5]. Mesin membaca pola gambar dan menghasilkan prediksi, sedangkan siswa menilai apakah prediksi tersebut sesuai dengan gambar yang dibuat. Prinsip ini menjadi dasar fitur Accept, Correct, Override, dan Redraw. Pendekatan human-centred learning analytics juga menekankan pentingnya kontrol manusia, keterlibatan pengguna, reliabilitas, keamanan, dan kepercayaan dalam sistem AI pendidikan [7].

### 2.2.3 Explainable AI, Top-3 Prediction, dan Confidence Score

Explainable AI dalam pendidikan diperlukan agar keluaran sistem dapat dipahami oleh pengguna. Khosravi et al. menjelaskan bahwa XAI dalam pendidikan perlu memperhatikan siapa pengguna sistem, bagaimana penjelasan disajikan, dan apa risiko dari penjelasan yang diberikan [6]. Pada penelitian ini, pengguna utama adalah siswa SMP, sehingga penjelasan AI harus sederhana dan mudah digunakan dalam pengambilan keputusan.

Liao et al. menekankan bahwa desain XAI sebaiknya dimulai dari pertanyaan yang mungkin diajukan pengguna terhadap sistem AI [14]. Dalam penelitian ini, pertanyaan tersebut meliputi: AI menebak gambar saya sebagai apa, seberapa yakin AI terhadap tebakan itu, apakah ada kemungkinan lain, dan apa yang harus saya lakukan jika prediksi tidak sesuai. Pertanyaan tersebut diterjemahkan menjadi Top-3 UI, confidence score, dan tombol keputusan.

Penelitian Karran et al. menunjukkan bahwa bentuk visualisasi keputusan AI dapat memengaruhi confidence dan cognitive fit pengguna. Contoh variasi visualisasi keputusan AI pada penelitian tersebut ditunjukkan pada Gambar 2.3.

**Gambar 2.3 Contoh Visualisasi Keputusan AI**

![Gambar 2.3 Contoh Visualisasi Keputusan AI](image/bab2_paper_04_xai_task_design.jpg)

*Sumber: Karran et al. [15], Fig. 2, doi: 10.3389/fnins.2022.883385.*

Gambar 2.3 tidak digunakan sebagai rancangan langsung tampilan sistem, tetapi sebagai contoh dari penelitian XAI bahwa cara output AI divisualisasikan memengaruhi cara pengguna membaca keputusan sistem. Prinsip ini menjadi dasar penyajian Top-3 prediction dan confidence score pada sistem yang dikembangkan.

Confidence score membantu siswa melihat bahwa prediksi AI memiliki tingkat keyakinan, bukan status benar mutlak. Karran et al. menunjukkan bahwa visualisasi keputusan AI dapat memengaruhi confidence dan cognitive fit pengguna [15]. Oleh karena itu, Top-3 prediction digunakan untuk menampilkan beberapa kemungkinan jawaban. Jika prediksi pertama sesuai, siswa dapat memilih Accept. Jika prediksi kedua atau ketiga lebih sesuai, siswa dapat memilih Correct. Jika semua prediksi tidak sesuai, siswa dapat memilih Override atau Redraw.

### 2.2.4 Game-Based Learning dan Goal-Based Scenario

Game-based learning digunakan karena permainan dapat menghadirkan tujuan, tantangan, feedback, dan konsekuensi dalam lingkungan belajar yang aktif. Videnovik et al. menunjukkan bahwa game-based learning dalam pendidikan computer science berkembang karena mampu meningkatkan keterlibatan dan pengalaman belajar aktif [8]. Dalam penelitian ini, permainan menjadi wadah utama agar siswa dapat memahami AI melalui aksi dan konsekuensi.

Gomez et al. menunjukkan bahwa game-based assessment dapat menggunakan aktivitas permainan untuk membaca kompetensi, keterampilan, atau pengetahuan siswa [9]. Pada sistem ini, data seperti prediksi AI, confidence score, keputusan siswa, label akhir, dan hasil gameplay dapat menjadi interaction log untuk membaca pola keputusan siswa terhadap output AI.

Tseng dan Yadav melalui ActiveAI menunjukkan bahwa literasi AI untuk siswa kelas 7-9 dapat dikembangkan melalui goal-based scenario learning, immediate feedback, project-based learning, dan intelligent agents [10]. Penelitian ini menggunakan prinsip serupa melalui simulasi berlevel. Level 1 memperkenalkan hubungan gambar, prediksi, dan konsekuensi. Level 2 menekankan perbandingan Top-3 prediction dan confidence score. Level 3 menekankan validasi kritis melalui Correct, Override, atau Redraw.

Selain berfungsi sebagai media belajar, game-based learning juga memiliki variasi strategi pedagogis. Videnovik et al. menunjukkan perbandingan strategi implementasi game-based learning dalam penelitian computer science education, sebagaimana ditunjukkan pada Gambar 2.4.

**Gambar 2.4 Distribusi Strategi Pedagogis pada Game-Based Learning**

![Gambar 2.4 Distribusi Strategi Pedagogis pada Game-Based Learning](image/bab2_paper_05_game_based_pedagogy.png)

*Sumber: Videnovik et al. [8], Fig. 9, doi: 10.1186/s40594-023-00447-2.*

Gambar 2.4 memperlihatkan bahwa pembelajaran berbasis permainan dapat diarahkan melalui strategi yang berbeda, seperti belajar dengan memainkan game atau belajar melalui proses pembuatan game. Pada penelitian ini, strategi yang digunakan lebih dekat dengan learning by playing karena siswa belajar melalui aktivitas bermain, feedback, dan konsekuensi keputusan.

Norsworthy et al. menjelaskan bahwa flow berkaitan dengan keterlibatan mendalam pada aktivitas yang menantang tetapi masih sesuai kemampuan pengguna [17]. Dalam penelitian ini, flow tidak menjadi variabel pengukuran utama, tetapi menjadi prinsip desain agar tingkat tantangan level meningkat secara bertahap. Lee et al. juga menunjukkan bahwa game-based learning dapat digunakan untuk mengenalkan AI kepada pelajar muda melalui konteks problem solving yang menarik [20].

### 2.2.5 Finger Tracking MediaPipe dan Sketsa

Zhang et al. memperkenalkan MediaPipe Hands sebagai pipeline pelacakan tangan real-time dari kamera RGB. Pipeline ini terdiri dari palm detector dan hand landmark model yang dapat memprediksi skeleton tangan [11]. Teknologi ini relevan karena sistem membutuhkan cara input yang interaktif dan mudah digunakan siswa untuk menggambar objek.

Contoh hasil pelacakan tangan dari MediaPipe Hands ditunjukkan pada Gambar 2.5. Gambar ini digunakan untuk memperlihatkan bentuk output teknis yang menjadi dasar interaksi menggambar melalui gerakan jari.

**Gambar 2.5 Hasil Pelacakan Tangan MediaPipe Hands**

![Gambar 2.5 Hasil Pelacakan Tangan MediaPipe Hands](image/bab2_paper_06_mediapipe_hand_tracking.png)

*Sumber: Zhang et al. [11], Fig. 1, arXiv:2006.10214.*

Gambar 2.5 menunjukkan bahwa MediaPipe Hands mampu merepresentasikan tangan sebagai titik landmark. Dalam sistem yang dikembangkan, titik pada jari digunakan sebagai dasar untuk menghasilkan goresan pada drawing canvas sebelum gambar dikirim ke proses klasifikasi.

Sung et al. menunjukkan bahwa hand gesture recognition dapat dibangun di atas skeleton tracker dan classifier untuk mengenali gestur secara real-time [12]. Uboweja et al. juga menunjukkan bahwa custom hand gesture recognition dapat dikembangkan dan dijalankan secara on-device [13]. Pada penelitian ini, teknologi tersebut digunakan sebagai dasar interaksi, bukan sebagai fokus pengembangan algoritma baru. Finger tracking dipakai untuk mengubah gerakan ujung jari menjadi goresan pada drawing canvas.

Sketsa juga memiliki nilai pembelajaran. Shokeen et al. menunjukkan bahwa anak-anak dapat menggunakan sketsa untuk membagikan ide, pengalaman, pengetahuan, dan ekspresi multimodal [18]. Pada sistem ini, sketsa berfungsi sebagai input teknis untuk klasifikasi visual sekaligus sebagai representasi niat siswa. Ketika AI salah membaca gambar, siswa dapat belajar bahwa kualitas input dan interpretasi sistem saling berpengaruh.

### 2.2.6 Feedback Visual, Pedagogical Agent, dan Interaction Log

Feedback visual diperlukan agar siswa memahami kondisi sistem secara cepat. Schroeder et al. menjelaskan bahwa pedagogical agents dapat memberi efek positif terhadap hasil belajar, motivasi, dan aspek afektif, tetapi prinsip desainnya masih bergantung pada konteks [16]. Oleh karena itu, pendamping visual pada sistem ini tidak diposisikan sebagai chatbot penuh, melainkan sebagai pemberi arahan singkat, peringatan, dan respons visual.

Interaction log menjadi bagian penting karena keputusan siswa dapat digunakan untuk membaca pola interaksi. Alfredo et al. menekankan bahwa learning analytics dan AI in education perlu memperhatikan human control, keterlibatan pengguna, keamanan, reliabilitas, dan kepercayaan [7]. Ocak et al. menunjukkan bahwa AI dapat membantu menganalisis interaksi embodied anak dari data multimodal [19]. Dalam penelitian ini, log yang dicatat meliputi prediksi, confidence score, keputusan, label akhir, dan hasil gameplay. Namun, data tersebut perlu ditafsirkan hati-hati karena keputusan siswa tidak selalu bermakna tunggal. Misalnya, siswa yang sering memilih Override bisa jadi kritis, bukan sekadar tidak memahami sistem.

## 2.3 Penelitian Terkait

Penelitian terkait dipilih berdasarkan kedekatannya dengan masalah literasi AI, desain interaksi AI, HITL, game-based learning, finger tracking, dan analisis interaksi siswa.

Ng et al. merumuskan kerangka literasi AI yang mencakup pemahaman, penggunaan, evaluasi, penciptaan, dan etika [1]. Penelitian ini menggunakan kerangka tersebut sebagai dasar tujuan pembelajaran, tetapi menerjemahkannya ke dalam simulasi interaktif berbasis keputusan. Ravi et al. meneliti pengalaman guru dalam penerapan kurikulum literasi AI di kelas menengah [2]. Penelitian tersebut relevan karena menunjukkan perlunya media yang konkret dan dapat digunakan dalam pembelajaran. Clerc et al. menunjukkan bahwa siswa perlu dilatih untuk mempertanyakan output AI agar tidak terlalu bergantung pada sistem [3]. Penelitian ini menerapkan prinsip tersebut melalui Top-3 UI dan keputusan HITL.

Wu et al. dan Wang et al. membahas Human-in-the-Loop dalam machine learning [4], [5]. Kedua penelitian tersebut menjadi dasar bahwa manusia dapat dilibatkan untuk memvalidasi sistem AI. Perbedaannya, penelitian ini menggunakan HITL sebagai mekanisme pembelajaran untuk siswa SMP, bukan hanya sebagai strategi peningkatan performa model. Khosravi et al., Liao et al., dan Karran et al. membahas XAI, kebutuhan penjelasan yang berpusat pada pengguna, serta dampak visualisasi keputusan AI [6], [14], [15]. Penelitian ini menyederhanakan prinsip tersebut menjadi Top-3 prediction, confidence score, dan tombol keputusan yang mudah dipahami siswa.

Videnovik et al. dan Gomez et al. memberi dasar penggunaan game sebagai media pembelajaran dan sumber data evaluasi [8], [9]. Tseng dan Yadav melalui ActiveAI menunjukkan bahwa literasi AI untuk siswa menengah dapat dikembangkan melalui goal-based scenario dan immediate feedback [10]. Lee et al. juga menunjukkan bahwa game-based learning dapat digunakan untuk mengenalkan AI kepada pelajar muda melalui konteks problem solving [20]. Penelitian ini berada pada jalur yang sama, tetapi memiliki keunikan pada integrasi sketsa, finger tracking, Top-3 prediction, dan konsekuensi gameplay.

Zhang et al., Sung et al., dan Uboweja et al. menjadi dasar teknis untuk penggunaan hand tracking dan gesture recognition secara real-time [11]-[13]. Penelitian ini tidak mengembangkan algoritma pelacakan tangan baru, tetapi menggunakan teknologi tersebut sebagai media input menggambar. Shokeen et al. memperkuat dasar bahwa sketsa dapat menjadi aktivitas multimodal yang bermakna bagi anak [18], sedangkan Ocak et al. menunjukkan bahwa interaksi embodied anak dapat dianalisis sebagai data pembelajaran [19].

Salah satu penelitian terkait yang paling dekat dengan aspek teknis sistem adalah MediaPipe Hands. Selain menampilkan hasil landmark, Zhang et al. juga menjelaskan graph MediaPipe yang mengatur kapan hand detection dan hand landmark dijalankan. Contoh graph tersebut ditunjukkan pada Gambar 2.6.

**Gambar 2.6 MediaPipe Graph untuk Hand Tracking**

![Gambar 2.6 MediaPipe Graph untuk Hand Tracking](image/bab2_paper_07_mediapipe_graph.png)

*Sumber: Zhang et al. [11], Fig. 5, arXiv:2006.10214.*

Gambar 2.6 memperlihatkan bahwa pelacakan tangan MediaPipe bekerja sebagai alur pemrosesan kamera, deteksi tangan, pemotongan area tangan, estimasi landmark, dan rendering hasil. Penelitian ini memanfaatkan prinsip tersebut pada sisi input, lalu menggabungkannya dengan mekanisme HITL dan simulasi 2D.

Tabel 2.2 Sintesis penelitian terkait

| Penelitian | Fokus | Keterkaitan | Gap yang Diisi |
|---|---|---|---|
| Ng et al. [1] | Konsep literasi AI | Dasar kemampuan memahami dan mengevaluasi AI | Implementasi konsep ke simulasi interaktif |
| Ravi et al. [2] | Kurikulum AI kelas menengah | Kebutuhan media konkret untuk siswa | Prototipe interaktif untuk siswa SMP |
| Clerc et al. [3] | Regulasi penggunaan AI | Siswa perlu mempertanyakan output AI | Validasi output melalui Top-3 UI dan HITL |
| Wu et al. [4], Wang et al. [5] | Human-in-the-Loop | Dasar pelibatan manusia dalam sistem AI | HITL sebagai pengalaman belajar |
| Khosravi et al. [6], Liao et al. [14], Karran et al. [15] | XAI dan visualisasi keputusan | Dasar confidence score dan explainability | Antarmuka evaluasi sederhana untuk siswa |
| Videnovik et al. [8], Gomez et al. [9] | Game-based learning dan assessment | Dasar game sebagai media belajar dan sumber data | Log keputusan siswa terhadap output AI |
| Tseng dan Yadav [10], Lee et al. [20] | AI learning berbasis skenario/game | Dasar pembelajaran AI untuk pelajar muda | Fokus pada sketsa, Top-3, HITL, dan konsekuensi |
| Zhang et al. [11], Sung et al. [12], Uboweja et al. [13] | Pelacakan tangan dan gestur | Dasar finger tracking real-time | Penerapan untuk drawing canvas literasi AI |
| Shokeen et al. [18], Ocak et al. [19] | Sketsa dan interaksi embodied | Sketsa dan interaksi sebagai data belajar | Menghubungkan input sketsa, prediksi, dan keputusan |

## 2.4 Sintesis Kajian Pustaka

Berdasarkan kajian pustaka, penelitian ini memiliki dasar teoritis yang jelas. Literasi AI untuk siswa SMP perlu menekankan kemampuan memahami dan mengevaluasi output AI, bukan hanya mengenal definisi AI [1]-[3]. Human-in-the-Loop memberi dasar agar siswa memiliki peran aktif dalam validasi output AI [4], [5], [7]. Explainable AI, Top-3 prediction, dan confidence score membantu siswa melihat bahwa prediksi AI bersifat probabilistik dan perlu dipertimbangkan sebelum digunakan [6], [14], [15].

Game-based learning dan goal-based scenario learning memberi dasar bahwa konsep AI yang abstrak dapat dibuat lebih konkret melalui tujuan, tantangan, feedback, dan konsekuensi [8]-[10], [20]. Finger tracking MediaPipe memberi dasar teknis untuk membuat aktivitas menggambar lebih interaktif [11]-[13], sedangkan sketsa dan interaction log memperkuat bahwa tindakan siswa dapat menjadi bagian dari pengalaman belajar dan data evaluasi [18], [19].

Dengan demikian, posisi penelitian ini adalah pengembangan simulasi interaktif berlevel berbasis finger tracking MediaPipe dengan mekanisme Human-in-the-Loop untuk literasi AI siswa SMP. Orisinalitas penelitian terletak pada integrasi antara input sketsa berbasis gerakan jari, Top-3 prediction, confidence score, keputusan Accept/Correct/Override/Redraw, serta pemetaan keputusan ke konsekuensi gameplay 2D. Integrasi tersebut membuat siswa tidak hanya membaca konsep AI, tetapi mengalami langsung proses membuat input, melihat prediksi, memvalidasi output, dan menerima konsekuensi dari keputusan yang diambil.

## DAFTAR PUSTAKA

[1] D. T. K. Ng, J. K. L. Leung, S. K. W. Chu, and M. S. Qiao, "Conceptualizing AI literacy: An exploratory review," Computers and Education: Artificial Intelligence, vol. 2, Art. no. 100041, 2021, doi: 10.1016/j.caeai.2021.100041.

[2] P. Ravi, A. Broski, G. Stump, H. Abelson, E. Klopfer, and C. Breazeal, "Understanding teacher perspectives and experiences after deployment of AI literacy curriculum in middle-school classrooms," arXiv:2312.04839, 2023, doi: 10.48550/arXiv.2312.04839.

[3] O. Clerc, R. Abdelghani, C. Desvaux, E. Poisson, P.-Y. Oudeyer, and H. Sauzéon, "Teaching students to question the machine: An AI literacy intervention improves students' regulation of LLM use in a science task," arXiv:2604.01955, 2026, doi: 10.48550/arXiv.2604.01955.

[4] X. Wu, L. Xiao, Y. Sun, J. Zhang, T. Ma, and L. He, "A survey of human-in-the-loop for machine learning," arXiv:2108.00941, 2021, doi: 10.48550/arXiv.2108.00941.

[5] J. Wang, B. Guo, and L. Chen, "Human-in-the-loop machine learning: A macro-micro perspective," arXiv:2202.10564, 2022, doi: 10.48550/arXiv.2202.10564.

[6] H. Khosravi et al., "Explainable artificial intelligence in education," Computers and Education: Artificial Intelligence, vol. 3, Art. no. 100074, 2022, doi: 10.1016/j.caeai.2022.100074.

[7] R. Alfredo et al., "Human-centred learning analytics and AI in education: A systematic literature review," Computers and Education: Artificial Intelligence, vol. 6, Art. no. 100215, 2024, doi: 10.1016/j.caeai.2024.100215.

[8] M. Videnovik, T. Vold, L. Kiønig, A. M. Bogdanova, and V. Trajkovik, "Game-based learning in computer science education: A scoping literature review," International Journal of STEM Education, vol. 10, Art. no. 54, 2023, doi: 10.1186/s40594-023-00447-2.

[9] M. J. Gomez, J. A. Ruipérez-Valiente, and F. J. García Clemente, "A systematic literature review of game-based assessment studies: Trends and challenges," IEEE Transactions on Learning Technologies, vol. 16, no. 4, pp. 500-515, 2023, doi: 10.1109/TLT.2022.3226661.

[10] Y. J. Tseng and G. Yadav, "ActiveAI: Introducing AI literacy for middle school learners with goal-based scenario learning," arXiv:2309.12337, 2023, doi: 10.48550/arXiv.2309.12337.

[11] F. Zhang et al., "MediaPipe Hands: On-device real-time hand tracking," arXiv:2006.10214, 2020, doi: 10.48550/arXiv.2006.10214.

[12] G. Sung et al., "On-device real-time hand gesture recognition," arXiv:2111.00038, 2021, doi: 10.48550/arXiv.2111.00038.

[13] E. Uboweja et al., "On-device real-time custom hand gesture recognition," arXiv:2309.10858, 2023, doi: 10.48550/arXiv.2309.10858.

[14] Q. V. Liao, D. Gruen, and S. Miller, "Questioning the AI: Informing design practices for explainable AI user experiences," in Proceedings of the 2020 CHI Conference on Human Factors in Computing Systems, 2020, pp. 1-15, doi: 10.1145/3313831.3376590.

[15] A. J. Karran, T. Demazure, A. Hudon, S. Senecal, and P.-M. Léger, "Designing for confidence: The impact of visualizing artificial intelligence decisions," Frontiers in Neuroscience, vol. 16, Art. no. 883385, 2022, doi: 10.3389/fnins.2022.883385.

[16] N. L. Schroeder, R. O. Davis, and E. Yang, "Designing and learning with pedagogical agents: An umbrella review," Journal of Educational Computing Research, vol. 62, no. 8, pp. 1907-1936, 2025, doi: 10.1177/07356331241288476.

[17] C. Norsworthy, B. Jackson, and J. A. Dimmock, "Advancing our understanding of psychological flow: A scoping review of conceptualizations, measurements, and applications," Psychological Bulletin, vol. 147, no. 8, pp. 806-827, 2021, doi: 10.1037/bul0000337.

[18] E. Shokeen, N. Katirci, C. Williams-Pierce, and E. Bonsignore, "Children learning to sketch: Sketching to learn," Information and Learning Sciences, vol. 123, no. 7/8, pp. 482-499, 2022, doi: 10.1108/ILS-03-2022-0023.

[19] C. Ocak, T. J. Kopcha, and R. Dey, "An AI-enhanced pattern recognition approach to temporal and spatial analysis of children's embodied interactions," Computers and Education: Artificial Intelligence, vol. 5, Art. no. 100146, 2023, doi: 10.1016/j.caeai.2023.100146.

[20] S. Lee et al., "AI-infused collaborative inquiry in upper elementary school: A game-based learning approach," in Proceedings of the AAAI Conference on Artificial Intelligence, vol. 35, no. 17, pp. 15591-15599, 2021, doi: 10.1609/aaai.v35i17.17836.
