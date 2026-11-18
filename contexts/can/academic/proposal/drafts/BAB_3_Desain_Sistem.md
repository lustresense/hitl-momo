# BAB 3 DESAIN SISTEM

## 3.1 Deskripsi Solusi

Solusi yang ditawarkan dalam proyek akhir ini adalah pengembangan simulasi interaktif berlevel berbasis *finger tracking* MediaPipe dengan mekanisme *Human-in-the-Loop* pada sistem literasi kecerdasan buatan untuk siswa SMP. Sistem dirancang untuk memperkenalkan AI sebagai sistem prediktif yang menghasilkan keluaran berdasarkan pola data dan tingkat keyakinan tertentu, bukan sebagai sistem yang selalu memberi jawaban mutlak.

Pada sistem yang dikembangkan, siswa berinteraksi melalui aktivitas menggambar objek. Aktivitas menggambar dilakukan menggunakan gerakan jari yang ditangkap oleh kamera dan diproses melalui *finger tracking* MediaPipe. Gerakan jari tersebut divisualisasikan menjadi goresan pada *drawing canvas*, sehingga siswa dapat membuat gambar secara langsung tanpa bergantung sepenuhnya pada perangkat input konvensional seperti mouse. Gambar yang dibuat siswa kemudian diproses sebagai input klasifikasi sketsa.

Setelah gambar diproses, sistem menampilkan keluaran AI dalam bentuk *Top-3 prediction* beserta *confidence score*. Tampilan ini digunakan agar siswa dapat melihat bahwa AI memiliki beberapa kemungkinan jawaban dengan tingkat keyakinan yang berbeda. Siswa tidak hanya menerima satu hasil prediksi, tetapi diberi kesempatan untuk membandingkan, menilai, dan menentukan keputusan akhir terhadap keluaran AI.

Mekanisme *Human-in-the-Loop* diterapkan melalui proses pengambilan keputusan setelah prediksi AI ditampilkan. Siswa dapat memilih **Accept** apabila menerima prediksi utama, **Correct** apabila memilih alternatif prediksi lain, **Override** apabila menolak prediksi yang tersedia, atau **Redraw** apabila ingin menggambar ulang. Keputusan tersebut menjadi label akhir yang digunakan oleh sistem untuk menentukan perilaku objek di dalam simulasi.

Objek yang telah memiliki label akhir kemudian dipetakan menjadi perilaku *gameplay*. Objek yang bersifat membantu diperlakukan sebagai objek **Solid**, sedangkan objek yang bersifat membahayakan diperlakukan sebagai objek **Danger**. Pemetaan ini membuat keputusan siswa terhadap keluaran AI memiliki konsekuensi langsung dalam simulasi 2D. Jika keputusan sesuai, objek dapat membantu penyelesaian level. Jika keputusan tidak sesuai, objek dapat menyebabkan kondisi gagal atau mengharuskan siswa mencoba ulang.

Sistem dikembangkan sebagai satu proyek terintegrasi oleh dua mahasiswa. Penulis berfokus pada pengembangan simulasi interaktif, desain antarmuka, *finger tracking*, *Top-3 UI*, desain interaksi level, *feedback* visual, dan pengalaman *gameplay* berbasis konsekuensi. Partner mengembangkan komponen klasifikasi sketsa, keluaran prediksi, *confidence score*, pencatatan data, dan analisis pola keputusan. Pembagian ini tidak menjadikan sistem terpisah, tetapi memperjelas kontribusi masing-masing bagian dalam satu alur literasi AI.

## 3.2 Perancangan Sistem

Perancangan sistem dibuat untuk menggambarkan hubungan antara masukan pengguna, proses interaksi, keluaran prediksi AI, pengambilan keputusan pengguna, pemetaan perilaku objek, hingga keluaran akhir sistem. Sistem tidak dirancang sebagai beberapa bagian yang berdiri sendiri, tetapi sebagai satu rangkaian proses yang saling terhubung.

Alur utama sistem dimulai dari siswa menggambar objek melalui kamera dan kanvas. Gambar tersebut diproses untuk menghasilkan prediksi AI. Setelah prediksi muncul, siswa melakukan validasi melalui mekanisme *Human-in-the-Loop*. Keputusan akhir kemudian diterapkan ke dalam simulasi 2D sebagai perilaku objek.

### 3.2.1 Rancangan Sistem Global

Rancangan sistem global dibagi menjadi tiga bagian utama, yaitu **input**, **process**, dan **output**. Bagian input berisi sumber masukan utama yang berasal dari kamera, gambar pada kanvas, dan keputusan pengguna. Bagian process berisi rangkaian pengolahan sistem, mulai dari interaksi, klasifikasi AI, keputusan pengguna, pemetaan objek, hingga pencatatan data. Bagian output menunjukkan hasil akhir sistem, yaitu prototipe literasi AI, hasil *gameplay*, dashboard admin/superadmin, dan data analisis pola keputusan.

Pembagian tersebut divisualisasikan pada Gambar 3.1. Gambar ini diletakkan setelah alur umum dijelaskan agar pembaca lebih dahulu memahami hubungan konseptual antarkomponen sebelum melihat representasi visual sistem.

**Gambar 3.1 Rancangan Sistem dari Solusi yang Ditawarkan**

![Gambar 3.1 Rancangan Sistem](image/bab3_01_rancangan_sistem.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.1 menunjukkan arsitektur sistem global yang mengintegrasikan komponen input, proses, dan output ke dalam satu alur linier. Tahap input mencakup pemanfaatan kamera untuk menangkap gerakan jari, kanvas digital sebagai ruang visualisasi sketsa, serta parameter keputusan interaktif siswa berupa Accept, Correct, Override, atau Redraw.

Pada tahap process, arsitektur dibagi ke dalam empat lapisan fungsional. **Layer 1 (Interaksi)** mengelola *finger tracking* MediaPipe dan lingkungan simulasi 2D berbasis Kaplay.js. **Layer 2 (Klasifikasi AI)** mengimplementasikan model CNN MobileNet melalui TensorFlow.js untuk menghasilkan *Top-3 prediction* dan *confidence score*. **Layer 3 (Keputusan)** menjadi inti mekanisme HITL melalui *decision resolver*. **Layer 4 (Data)** mencatat aktivitas interaksi melalui REST API ke basis data SQLite untuk kebutuhan dashboard, ekspor data, dan analisis pola keputusan.

Secara visual, warna pada diagram menunjukkan pembagian kontribusi pengembangan. Blok berwarna oranye menandakan ranah interaksi pengguna dan simulasi visual yang menjadi fokus penulis. Blok berwarna biru merepresentasikan komponen klasifikasi AI dan manajemen basis data yang dikerjakan oleh partner. Blok berwarna hijau menjadi lapisan keputusan yang menjembatani keluaran AI dengan intervensi pengguna.

### 3.2.2 Use Case Diagram

Use case diagram digunakan untuk memetakan hubungan antara aktor dan fungsi utama di dalam sistem. Aktor dalam sistem terdiri atas **User/Student**, **Admin**, dan **Super Admin**. User/Student merupakan pengguna utama yang berinteraksi langsung dengan simulasi pembelajaran. Admin dan Super Admin berperan di sisi pengelolaan data, akses, serta konfigurasi operasional sistem.

Sebelum fungsi setiap aktor dijelaskan lebih rinci, Gambar 3.2 memperlihatkan gambaran keseluruhan relasi antaraktor dan aktivitas utama. Penempatan gambar pada bagian ini bertujuan agar pembaca melihat struktur akses sistem terlebih dahulu sebelum membaca penjelasan per aktor.

**Gambar 3.2 Use Case Diagram**

![Gambar 3.2 Use Case Diagram](image/bab3_02_use_case_diagram.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.2 menunjukkan bahwa User/Student memiliki alur aktivitas yang bersifat linier dari awal hingga akhir sesi. Siswa memulai sesi, mengikuti onboarding, menggambar objek menggunakan gerakan jari, melihat *Top-3 prediction* dan *confidence score*, mengambil keputusan, memainkan level simulasi 2D, lalu melihat ringkasan level. Rangkaian ini menunjukkan bahwa siswa tidak hanya bermain, tetapi terlibat dalam proses mengevaluasi dan memvalidasi output AI.

Pada sisi pengelolaan data, Admin bertanggung jawab untuk login dashboard, melihat data sesi atau kelas, memantau ringkasan pola keputusan siswa, serta mengekspor data interaksi ke format CSV/JSON. Super Admin memiliki seluruh kapabilitas Admin dengan tambahan kewenangan untuk mengelola data sekolah, data kelas, akun admin, dan hak akses nomor absen siswa. Pembagian ini dibuat agar sistem dapat digunakan dalam konteks pembelajaran sekolah secara lebih terstruktur.

### 3.2.3 Global User Flow

Global user flow digunakan untuk menggambarkan alur besar pengalaman siswa ketika menggunakan sistem. Alur ini dibagi menjadi tiga fase utama, yaitu fase pembuatan input, fase pengambilan keputusan, dan fase konsekuensi. Pembagian tiga fase digunakan agar alur sistem lebih mudah dibaca dan tidak terlalu padat dalam satu diagram.

Fase pertama adalah tahap pembuatan input. Pada fase ini, siswa masuk melalui *splash screen*, kemudian sistem mendeteksi keberadaan tangan sebagai tanda awal interaksi. Setelah tangan terdeteksi, elemen pendamping visual memberikan sapaan atau instruksi singkat. Siswa kemudian melanjutkan ke level, melihat rintangan yang perlu diselesaikan, memahami objek yang dibutuhkan, lalu menggambar objek pada kanvas.

**Gambar 3.3 Global Flow Phase 1**

![Gambar 3.3 Global Flow Phase 1](image/bab3_03_global_flow_phase_1.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.3 memperlihatkan bahwa fase pertama berfokus pada pembentukan input dan kesiapan interaksi. Fase ini penting karena kualitas gambar yang dibuat siswa akan memengaruhi prediksi yang dihasilkan oleh sistem AI.

Fase kedua merupakan fase keputusan. Pada fase ini, sistem menampilkan keluaran AI dalam bentuk *Top-3 prediction* dan *confidence score*. Setelah prediksi ditampilkan, siswa menentukan keputusan melalui Accept, Correct, Override, atau Redraw. Jika siswa memilih Accept, label akhir diambil dari prediksi pertama. Jika siswa memilih Correct, label akhir diambil dari prediksi kedua atau ketiga. Jika siswa memilih Override, label akhir berasal dari koreksi pengguna. Jika siswa memilih Redraw, siswa kembali ke proses menggambar.

Keputusan pada fase kedua menjadi titik utama mekanisme HITL karena sistem tidak langsung memakai prediksi AI sebagai hasil akhir. Alur tersebut divisualisasikan pada Gambar 3.4.

**Gambar 3.4 Global Flow Phase 2**

![Gambar 3.4 Global Flow Phase 2](image/bab3_04_global_flow_phase_2.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.4 menunjukkan bahwa siswa diberi ruang untuk menerima, mengoreksi, menolak, atau mengulang input. Dengan cara ini, pengambilan keputusan siswa menjadi bagian inti dari proses literasi AI.

Fase ketiga merupakan fase konsekuensi. Objek yang telah memiliki label akhir masuk ke dalam dunia permainan. Sistem mengevaluasi perilaku objek berdasarkan hasil pemetaan. Jika objek bersifat membahayakan, sistem mengarah pada kondisi gagal atau recovery. Jika objek bersifat membantu, objek digunakan untuk mendukung progres karakter. Jika level belum selesai, siswa dapat mencoba kembali atau menggambar ulang. Jika level selesai, sistem menampilkan level summary sebagai bentuk refleksi singkat.

**Gambar 3.5 Global Flow Phase 3**

![Gambar 3.5 Global Flow Phase 3](image/bab3_05_global_flow_phase_3.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.5 memperlihatkan bahwa konsekuensi gameplay menjadi penutup alur interaksi. Fase ini membuat keputusan terhadap output AI tidak berhenti sebagai pilihan antarmuka, tetapi berubah menjadi akibat yang dapat dilihat langsung oleh siswa.

### 3.2.4 Interaction Type

Interaction type digunakan untuk menjelaskan hubungan antara jenis interaksi, input pengguna, respons sistem, dan posisi interaksi dalam alur simulasi. Matriks ini membantu memperlihatkan bahwa setiap aksi pengguna memiliki respons sistem yang jelas.

| Jenis Interaksi | Bentuk Input | Respons Sistem | Posisi dalam Alur |
|---|---|---|---|
| Presence | Deteksi tangan atau gerakan awal | Sistem memberi tanda siap dan arahan awal | Awal sesi |
| Navigasi | Pilihan menu atau lanjut onboarding | Sistem berpindah ke layar berikutnya | Onboarding dan level |
| Menggambar | Gerakan jari pada kamera | Sistem menampilkan goresan pada kanvas | Drawing canvas |
| Permintaan prediksi | Tombol submit gambar | Sistem memproses gambar ke AI | Setelah gambar selesai |
| Keputusan AI | Accept, Correct, Override, Redraw | Sistem menentukan label akhir atau mengulang gambar | Top-3 UI |
| Gameplay | Pergerakan karakter dan objek | Sistem menerapkan perilaku Solid atau Danger | Simulasi 2D |
| Feedback | Kondisi berhasil, gagal, atau perlu ulang | Sistem memberi respons visual dan ringkasan | Akhir aksi atau level |

Rangkaian jenis interaksi tersebut divisualisasikan pada Gambar 3.6. Pada bagian ini, gambar ditempatkan setelah matriks ringkas agar pembaca lebih mudah menghubungkan istilah interaksi dengan alur visual.

**Gambar 3.6 Interaction Type**

![Gambar 3.6 Interaction Type](image/bab3_06_interaction_type.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.6 menegaskan bahwa desain interaksi tidak hanya berupa tampilan visual, tetapi juga logika hubungan antara input dan output. Saat siswa menggambar, sistem menampilkan goresan pada kanvas. Saat prediksi muncul, sistem menampilkan Top-3 UI. Saat keputusan diambil, sistem menentukan label akhir objek. Saat objek masuk ke simulasi, sistem menerapkan perilaku objek sesuai hasil pemetaan.

### 3.2.5 Mekanisme Human-in-the-Loop dan Pemetaan Objek

Mekanisme *Human-in-the-Loop* pada sistem ini terjadi ketika siswa melihat hasil prediksi AI dan mengambil keputusan terhadap keluaran tersebut. Sistem tidak langsung menggunakan prediksi AI sebagai hasil akhir, tetapi menampilkannya terlebih dahulu melalui Top-3 UI. Pada tahap ini, siswa dapat membaca prediksi, melihat nilai *confidence score*, kemudian menentukan apakah prediksi diterima, dikoreksi, ditolak, atau digambar ulang.

Pilihan **Accept** digunakan ketika siswa menerima prediksi pertama sebagai label akhir. Pilihan **Correct** digunakan ketika siswa memilih prediksi kedua atau ketiga yang dianggap lebih sesuai. Pilihan **Override** digunakan ketika siswa menolak seluruh prediksi yang tersedia dan menentukan label lain secara manual. Pilihan **Redraw** digunakan ketika siswa merasa gambar yang dibuat belum cukup jelas dan perlu diperbaiki.

Label akhir objek diproses oleh *decision resolver* untuk menentukan perilaku gameplay. Objek yang membantu penyelesaian level dipetakan sebagai objek **Solid**. Objek ini dapat digunakan sebagai pijakan, penghubung, atau elemen yang membantu karakter menyelesaikan rintangan. Objek yang membahayakan dipetakan sebagai objek **Danger**. Objek ini dapat menyebabkan kondisi gagal, reset, atau memaksa siswa mengulang bagian tertentu. Jika objek tidak memberikan fungsi jelas terhadap penyelesaian level, sistem dapat mengarahkannya sebagai objek netral atau memicu proses recovery sesuai kebutuhan level.

Dengan mekanisme ini, keputusan siswa terhadap keluaran AI tidak berhenti pada pemilihan label. Keputusan tersebut diterjemahkan menjadi konsekuensi di dalam simulasi. Hal ini membuat pengalaman HITL menjadi lebih konkret karena siswa dapat melihat dampak dari menerima, mengoreksi, atau menolak prediksi AI.

### 3.2.6 Konsep Maskot Pendamping

Maskot pendamping pada sistem ini dirancang untuk membantu siswa memahami alur interaksi tanpa harus membaca instruksi panjang. Peran utamanya adalah menjadi penghubung antara aktivitas edukasi AI dan pengalaman gameplay. Melalui maskot, proses menggambar, menunggu prediksi, membaca hasil AI, mengambil keputusan, dan melihat konsekuensi dapat terasa lebih jelas bagi siswa SMP.

Maskot tidak diposisikan sebagai karakter dekoratif. Maskot berfungsi untuk memberi arahan singkat, menunjukkan status sistem, dan memberi respons visual terhadap hasil interaksi. Pada saat siswa menggambar, maskot dapat memberi petunjuk sederhana. Saat sistem menampilkan Top-3 prediction, maskot berperan sebagai pendamping yang membantu siswa memahami bahwa hasil tersebut adalah tebakan AI. Saat siswa memilih Accept, Correct, Override, atau Redraw, maskot memberi respons visual yang memperkuat bahwa keputusan akhir tetap berada pada siswa.

Secara konsep, maskot merepresentasikan AI sebagai pendamping. Maskot dapat membantu mengenali gambar, tetapi tidak dapat menciptakan objek baru dan tidak dapat mengambil keputusan akhir. Batasan ini penting karena sesuai dengan tujuan literasi AI dalam sistem: AI dapat membantu memberi prediksi, tetapi manusia tetap menjadi pihak yang mencipta, mengevaluasi, mengoreksi, dan mengendalikan permainan.

Konteks dunia permainan digunakan secara sederhana sebagai latar agar peran maskot lebih mudah dipahami. Game berlangsung di dalam buku sketsa. Pengguna hadir sebagai pihak yang dapat menggambar objek ke dalam halaman, sedangkan maskot membantu membaca gambar dan memberi arahan. Dengan konsep ini, maskot menjadi jembatan antara input gambar, prediksi AI, keputusan pengguna, dan konsekuensi gameplay.


| Elemen / Konsep | Deskripsi |
|---|---|
| Peran Maskot | Memberi arahan singkat, respons visual, dan penguatan konteks belajar. |
| Fungsi Edukasi | Membantu menjelaskan bahwa AI dapat menebak dan memberi prediksi, tetapi pengguna tetap perlu memvalidasi hasilnya. |
| Fungsi Gameplay | Mendampingi proses menggambar, menunggu prediksi, memberi feedback keputusan, dan menghubungkan hasil AI dengan konsekuensi level. |
| Batasan Maskot | Tidak dapat menggambar atau menciptakan objek baru. Maskot hanya membantu mengenali, memberi arahan, dan merespons keputusan pengguna. |
| Inti Interaksi | Maskot membantu, tetapi pengguna tetap menjadi pihak yang mencipta, mengoreksi, dan menentukan keputusan akhir. |

Pada tahap proposal ini, desain visual maskot belum berada pada bentuk final. Perancangan maskot akan dilanjutkan pada semester 7 dalam fase **Material Collecting**. Output yang direncanakan meliputi eksplorasi bentuk, sketsa alternatif, ekspresi dasar, palet warna, serta kebutuhan aset sederhana untuk mendukung feedback visual.

Dengan rancangan ini, maskot menjadi bagian dari sistem feedback visual, bukan sekadar elemen ilustratif. Detail bentuk final, ekspresi, dan aset pendukung akan ditentukan pada tahap perancangan visual semester 7.

### 3.2.7 Rancangan Antarmuka dan Wireframe

Rancangan antarmuka dibuat untuk memastikan alur penggunaan sistem dapat dipahami oleh siswa SMP. Wireframe digunakan sebagai rancangan awal tampilan sebelum antarmuka dikembangkan secara penuh. Setiap layar memiliki fungsi berbeda dalam alur sistem, mulai dari masuk ke aplikasi, menerima instruksi, menggambar objek, melihat prediksi, memainkan level, hingga melihat data pada dashboard.

Splash screen digunakan sebagai tampilan awal sistem. Tampilan ini berisi judul atau identitas sistem, instruksi awal, dan area untuk memberi arahan sebelum siswa masuk ke simulasi. Pada rancangan awal, instruksi utama dapat berupa arahan untuk melambaikan tangan agar sistem mendeteksi keberadaan pengguna.

**Gambar 3.7 Wireframe Splash Screen**

![Gambar 3.7 Wireframe Splash Screen](image/bab3_07_wireframe_splash_screen.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.7 menunjukkan bahwa layar awal tidak dipenuhi banyak teks. Tujuannya adalah membantu siswa masuk ke pengalaman utama secara cepat dan memahami aksi awal yang perlu dilakukan.

Setelah layar awal, siswa diarahkan ke onboarding. Layar onboarding digunakan untuk memperkenalkan cara interaksi dasar, seperti cara memulai, cara menggambar, dan cara mengikuti arahan sistem. Onboarding dibuat singkat agar siswa tidak terlalu lama berada pada bagian instruksi.

**Gambar 3.8 Wireframe Onboarding**

![Gambar 3.8 Wireframe Onboarding](image/bab3_08_wireframe_onboarding.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.8 memperlihatkan posisi pendamping visual pada alur onboarding. Pendamping ini direpresentasikan sebagai maskot yang memberi arahan singkat, respons visual, dan penguatan konteks interaksi tanpa mengambil alih kontrol dari siswa.

Layar drawing canvas menjadi ruang utama untuk membuat objek. Pada tampilan ini, area kanvas menjadi elemen utama. Selain itu, terdapat area level, elemen pendamping visual, serta panel Top-3 prediction yang muncul setelah gambar diproses. Rancangan ini menggabungkan aktivitas menggambar dan pengambilan keputusan dalam satu konteks layar agar siswa memahami hubungan antara gambar dan prediksi.

**Gambar 3.9 Wireframe Drawing Canvas**

![Gambar 3.9 Wireframe Drawing Canvas](image/bab3_09_wireframe_drawing_canvas.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.9 menunjukkan bahwa kanvas, informasi level, dan panel prediksi perlu berada dalam tata letak yang mudah dipahami. Posisi Top-3 UI harus cukup terlihat, tetapi tidak boleh mengganggu area menggambar.

Setelah keputusan terhadap output AI diambil, objek masuk ke layar gameplay. Layar gameplay digunakan untuk menampilkan dunia simulasi 2D, indikator level, panduan pergerakan, serta konsekuensi dari objek yang telah dipetakan.

**Gambar 3.10 Wireframe Gameplay Screen**

![Gambar 3.10 Wireframe Gameplay Screen](image/bab3_10_wireframe_gameplay_screen.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.10 memperlihatkan area dunia permainan sebagai fokus utama. Objek hasil keputusan siswa ditempatkan ke dalam dunia tersebut dan memengaruhi progres karakter. Dengan demikian, siswa dapat melihat dampak keputusan AI secara langsung.

Admin dashboard digunakan untuk menampilkan data penggunaan sistem pada lingkup kelas atau sesi. Dashboard ini berisi tampilan ringkasan log, daftar kelas, dan akses untuk melihat data interaksi. Fitur ini mendukung penggunaan sistem dalam konteks pembelajaran karena guru dapat melihat hasil penggunaan sistem tanpa mengganggu alur simulasi siswa.

**Gambar 3.11 Wireframe Admin Dashboard**

![Gambar 3.11 Wireframe Admin Dashboard](image/bab3_11_wireframe_admin_dashboard.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.11 menunjukkan bahwa dashboard admin difokuskan pada pemantauan ringkas dan akses data interaksi. Informasi yang ditampilkan perlu mendukung kebutuhan guru untuk membaca pola kelas.

Super admin dashboard digunakan untuk mengelola data administratif sistem. Tampilan ini mencakup pengelolaan data sekolah, kelas, akun admin, serta akses nomor absen. Super Admin juga dapat melihat fitur dashboard yang tersedia untuk Admin.

**Gambar 3.12 Wireframe Super Admin Dashboard**

![Gambar 3.12 Wireframe Super Admin Dashboard](image/bab3_12_wireframe_super_admin_dashboard.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.12 memperlihatkan bahwa Super Admin memiliki cakupan pengelolaan yang lebih luas dibanding Admin. Struktur ini diperlukan agar sistem dapat digunakan pada beberapa kelas atau sekolah dengan hak akses yang terkontrol.

### 3.2.8 Desain Interaksi Level

Desain interaksi level disusun untuk memperkenalkan konsep AI secara bertahap. Level tidak dirancang sebagai konten permainan yang panjang, tetapi sebagai tahapan interaksi yang menunjukkan peningkatan kompleksitas keputusan. Setiap level memiliki fokus interaksi, tampilan AI, tugas siswa, dan tujuan interaksi yang berbeda.

| Level | Fokus Interaksi | Tampilan AI | Tugas Siswa | Tujuan Interaksi |
|---|---|---|---|---|
| Level 1 | Pengenalan alur dasar | Prediksi sederhana | Menggambar objek dan menerima hasil prediksi | Siswa memahami hubungan antara gambar, prediksi, keputusan, dan konsekuensi |
| Level 2 | Perbandingan prediksi | Top-3 prediction dan confidence score | Membandingkan prediksi dan memilih hasil paling sesuai | Siswa memahami bahwa AI memiliki beberapa kemungkinan prediksi |
| Level 3 | Validasi kritis | Prediksi dapat terlihat meyakinkan tetapi belum tentu tepat | Melakukan Correct, Override, atau Redraw | Siswa memahami bahwa manusia perlu memvalidasi keluaran AI |

Pembagian level tersebut membuat kompleksitas sistem meningkat secara bertahap. Siswa tidak langsung dihadapkan pada seluruh konsep AI sejak awal, tetapi diarahkan dari pemahaman dasar menuju proses evaluasi yang lebih kritis.

Pada setiap level, maskot berperan sebagai penghubung antara instruksi permainan dan konsep edukasi AI. Pada level awal, maskot membantu menjelaskan tujuan dan meminta siswa menggambar objek. Pada level berikutnya, maskot menjadi pendamping saat sistem menampilkan tebakan AI, sementara siswa tetap menentukan apakah tebakan tersebut diterima, dikoreksi, ditolak, atau perlu digambar ulang. Dengan cara ini, maskot menjadi bagian dari mekanisme pembelajaran dan feedback, bukan sekadar elemen visual.

### 3.2.9 Pembagian Tugas

Pengembangan proyek akhir ini dilakukan secara berkelompok dalam satu sistem yang sama. Pembagian tugas disusun untuk memperjelas kontribusi masing-masing pengembang tanpa memisahkan sistem menjadi dua aplikasi berbeda.

| Bagian Sistem | Tanggung Jawab Penulis | Tanggung Jawab Partner |
|---|---|---|
| Interaksi pengguna | Merancang dan mengembangkan alur interaksi, finger tracking, kanvas gambar, navigasi, konsep maskot pendamping, dan feedback visual | Menyesuaikan kebutuhan input gambar agar dapat diproses oleh model klasifikasi |
| Antarmuka prediksi | Merancang tampilan Top-3 UI, panel prediksi, nilai confidence, dan tombol keputusan | Menyediakan keluaran Top-3 prediction dan confidence score |
| Mekanisme keputusan | Merancang alur Accept, Correct, Override, dan Redraw pada sisi antarmuka | Menerima data keputusan sebagai bagian dari interaction log |
| Simulasi 2D | Mengembangkan gameplay 2D, perilaku objek, level, fail state, retry, summary, dan integrasi peran maskot dalam gameplay | Menggunakan hasil interaksi sebagai data untuk analisis pola keputusan |
| Data dan dashboard | Menghasilkan data keputusan melalui interaksi pengguna | Mengembangkan pencatatan data, basis data, dashboard, ekspor data, dan analisis pola keputusan |

Pembagian tugas tersebut menunjukkan hubungan kerja antara sisi pengalaman pengguna dan sisi pemrosesan data. Penulis berfokus pada bagaimana siswa menggunakan sistem, melihat prediksi, mengambil keputusan, dan mengalami konsekuensi di dalam simulasi. Partner berfokus pada bagaimana prediksi AI dihasilkan, bagaimana data keputusan dicatat, dan bagaimana pola keputusan dianalisis.

## 3.3 Metodologi

Metodologi pada proyek akhir ini disusun untuk menggambarkan tahapan kerja dalam pengembangan simulasi interaktif literasi AI. Tahapan divisualisasikan menggunakan diagram fishbone agar alur pengembangan dapat dibaca secara runtut dari tahap perumusan konsep hingga distribusi prototipe.

Tahapan metodologi dibagi menjadi enam fase utama, yaitu **Concept**, **Design**, **Material Collecting**, **Assembly**, **User Testing**, dan **Distribution**. Keenam fase tersebut disusun mengikuti alur waktu pengerjaan proyek akhir, mulai dari semester 6 hingga semester 8. Sebelum penjelasan tiap fase dijabarkan, Gambar 3.13 menampilkan gambaran metodologi secara keseluruhan.

**Gambar 3.13 Fishbone Metodologi Penelitian**

![Gambar 3.13 Fishbone Metodologi Penelitian](image/bab3_13_fishbone_metodologi.png)

*Sumber: Perancangan penulis, 2026.*

Gambar 3.13 menunjukkan bahwa luaran utama metodologi adalah **Interactive AI Literacy Simulation**. Luaran tersebut merupakan prototipe simulasi interaktif berlevel yang menggabungkan input berbasis *finger tracking*, tampilan prediksi AI, mekanisme keputusan pengguna, dan konsekuensi gameplay.

Tahap **Concept** dilakukan pada semester 6. Tahap ini berfokus pada studi permasalahan literasi AI, identifikasi target pengguna, dan penentuan kebutuhan interaksi Human-in-the-Loop. Studi masalah digunakan untuk memahami mengapa siswa SMP membutuhkan media pembelajaran yang lebih konkret dalam memahami AI.

Tahap **Design** juga dilakukan pada semester 6. Tahap ini berfokus pada perancangan desain sistem global, use case, user flow, wireframe, desain interaksi level, dan konsep awal fungsi maskot pendamping. Hasil tahap ini menjadi dasar struktur sistem sebelum implementasi prototipe dilakukan.

Tahap **Material Collecting** dilakukan pada semester 7. Tahap ini mencakup pemilihan dataset sketsa, persiapan aset visual, perancangan maskot pendamping, serta penyusunan kebutuhan konteks level. Dataset sketsa digunakan sebagai dasar kebutuhan klasifikasi gambar, sedangkan aset visual digunakan untuk antarmuka, objek permainan, pendamping visual, dan lingkungan simulasi.

Secara khusus, perancangan maskot ditempatkan pada fase Material Collecting karena masih berada pada tahap konsep dan belum memiliki desain final. Aktivitas yang direncanakan meliputi eksplorasi referensi visual, pembuatan sketsa alternatif, penentuan gaya visual, serta perencanaan kebutuhan aset sederhana. Hasil fase ini menjadi bahan untuk tahap Assembly ketika maskot mulai diintegrasikan ke onboarding, drawing canvas, feedback prediksi, dan gameplay.

Tahap **Assembly** dilakukan pada semester 7. Tahap ini merupakan tahap implementasi prototipe. Aktivitas yang dilakukan mencakup pembangunan antarmuka pengguna, implementasi gameplay, integrasi aset maskot, serta integrasi AI dan API. Pembangunan antarmuka meliputi onboarding, drawing canvas, Top-3 UI, gameplay screen, level summary, serta dashboard.

Tahap **User Testing** dilakukan pada semester 8. Tahap ini berfokus pada pengujian fitur fungsional, pengujian pengguna siswa, dan pengecekan interaction log. Pengujian dilakukan untuk memastikan fitur seperti finger tracking, drawing canvas, Top-3 UI, decision button, gameplay, dan dashboard berjalan sesuai rancangan.

Tahap **Distribution** dilakukan pada semester 8. Tahap ini berfokus pada pengemasan prototipe, persiapan ekspor data, dan penyusunan dokumentasi akhir. Dokumentasi final mencakup hasil perancangan, implementasi, pengujian, dan persiapan presentasi proyek akhir.

## 3.4 Jadwal Penelitian

Jadwal penelitian disusun dalam rentang 12 bulan untuk menggambarkan rencana pengerjaan proyek akhir secara bertahap. Penyusunan jadwal mengikuti tahapan metodologi, mulai dari studi awal, perancangan sistem, pengumpulan material, pengembangan prototipe, pengujian, revisi, hingga dokumentasi akhir.

| No | Kegiatan | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Studi literatur AI literacy, HITL, Top-3 UI, dan game-based learning | X | X |  |  |  |  |  |  |  |  |  |  |
| 2 | Identifikasi target pengguna dan kebutuhan interaksi siswa SMP |  | X | X |  |  |  |  |  |  |  |  |  |
| 3 | Penyusunan fishbone metodologi dan batasan ruang lingkup penulis |  |  | X | X |  |  |  |  |  |  |  |  |
| 4 | Penyusunan desain sistem dan wireframe |  |  | X | X | X |  |  |  |  |  |  |  |
| 5 | Penyusunan mockup onboarding, gameplay, Top-3 UI, dan result |  |  |  | X | X | X |  |  |  |  |  |  |
| 6 | Penyusunan level interaction design dan interaction matrix |  |  |  |  | X | X |  |  |  |  |  |  |
| 7 | Pengumpulan aset visual, objek level, konsep interaksi, dan rancangan maskot pendamping |  |  |  |  | X | X | X |  |  |  |  |  |
| 8 | Pengembangan prototipe canvas, gameplay, dan Top-3 UI |  |  |  |  |  | X | X | X |  |  |  |  |
| 9 | Pengembangan decision resolver, feedback visual maskot, dan data interaksi |  |  |  |  |  |  | X | X | X |  |  |  |
| 10 | User testing fungsi, keterbacaan UI, dan pengalaman siswa |  |  |  |  |  |  |  | X | X | X |  |  |
| 11 | Revisi prototipe dan finalisasi aset visual |  |  |  |  |  |  |  |  | X | X | X |  |
| 12 | Dokumentasi akhir, ekspor data, dan persiapan presentasi |  |  |  |  |  |  |  |  |  | X | X | X |

Jadwal tersebut menunjukkan bahwa kegiatan awal difokuskan pada studi literatur, identifikasi pengguna, dan perumusan ruang lingkup pengembangan. Setelah itu, kegiatan berlanjut pada desain sistem, wireframe, mockup, interaction matrix, desain level, serta konsep awal fungsi maskot pendamping. Tahap berikutnya berfokus pada pengumpulan aset dan pengembangan prototipe, termasuk canvas, gameplay, Top-3 UI, decision resolver, feedback visual maskot, dan pencatatan data interaksi.

Pada bagian akhir jadwal, kegiatan diarahkan pada user testing, revisi prototipe, finalisasi aset visual, dokumentasi akhir, ekspor data, dan persiapan presentasi. Dengan pembagian waktu tersebut, proses penelitian dapat berjalan bertahap dari perencanaan hingga penyelesaian prototipe akhir.
