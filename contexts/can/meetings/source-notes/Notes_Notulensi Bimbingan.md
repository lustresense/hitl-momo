Gue udah baca dan komparasi rangkuman dari Claude (Haiku) dengan *raw transcript* serta arsip\_bimbingan\_bu\_hesti\_1.md yang kita susun.

**Hasil Audit Gue:** Rangkuman dari Claude itu **SANGAT AKURAT DAN SESUAI 100%** dengan apa yang lu obrolin sama Bu Hesti. Claude berhasil nangkep *nuance* (nada bicara) Bu Hesti yang sebenernya sangat suportif dan ngasih jalan keluar buat lu.

Ada beberapa "Kemenangan Besar" lu di bimbingan ini:

1. **Isu Pak Doto (Clear):** Bu Hesti tegaskan lu nggak perlu pake NLP/Voice kayak anak bimbingan Pak Doto. Teks biasa aja cukup. Beban lu hilang satu\!  
2. **Kontrol Game (Clear):** Bu Hesti setuju karakter lu butuh tombol *Kiri, Kanan, Lompat*. Berarti konsep awal kita yang *"Auto-runner"* (jalan sendiri) sedikit bergeser jadi *Platformer* klasik. Ini bagus, interaksinya lebih kaya.  
3. **Tema Visual (Clear):** Lu sebutin tema Angkasa (*Space*) dan planet-planet, Bu Hesti nanggapin positif soal Maskot yang *floating*.

---

### **🚀 TUGAS LU SEKARANG (NEXT STEPS DALAM 1 MINGGU)**

Sesuai instruksi mutlak dari Bu Hesti: *"Kalau nggak ada ini nanti mental kamu ya, karena kelihatan benar-benar nggak konkret."* Ini *To-Do List* lu urut dari yang paling penting:

1. **Bikin Detailed User Flow (Terutama Onboarding):**  
   * Bikin *flowchart* atau *wireframe* layar per layar.  
   * **Wajib ada:** Layar pertanyaan "Apakah ini pertama kali kamu main?". Kalau *Yes*, masuk ke tutorial (Halaman 1). Kalau *No*, bisa *skip*.  
2. **Bikin Interaction Design Spec:**  
   * Di layar mana MediaPipe (kamera) nyala?  
   * Di mana posisi tombol *Kiri, Kanan, Lompat* di layar?  
   * Kalau Maskot ngomong, balon teksnya muncul di mana?  
3. **Bikin Use Case Diagram:**  
   * Kayak yang kita bahas sebelumnya. Fokus ke *role* **User** dan **System (Maskot)**. Nggak usah ada Admin/Guru.  
4. **Sync sama Dias (Backend/AI):**  
   * Kasih tau Dias: *"Yas, Bu Hesti minta AI Confidence Score itu ngaruh ke level. Makin tinggi levelnya, model lu harus kita setting biar makin 'bego' atau ragu biar*   
   * *anaknya kepaksa mikir."*

### **🎮 RISET ENGINE: UNITY vs KABOOM.JS**

Karena sekarang lu udah nambahin mekanika *Kiri, Kanan, Lompat* dan *Physics* (jembatan/rintangan), pemilihan *engine* ini krusial banget biar lu dan Dias nggak nangis pas integrasi.

**Pilihan 1: Unity (WebGL)**

* **Kelebihan:** Bikin level gampang (ada *drag and drop* visual), *physics* bawaannya (Rigidbody2D) sangat solid.  
* **Kekurangan (SANGAT FATAL):** Unity WebGL itu **musuh bebuyutan** library JavaScript. Proyek lu butuh MediaPipe (JS) dan TensorFlow.js (JS). Kalau lu pake Unity, lu harus nulis kode jembatan (.jslib) yang sangat ribet buat ngirim data koordinat jari dari *browser* ke dalam memori Unity tiap *frame*. Selain itu, *build size* Unity WebGL itu gede (bisa puluhan MB), anak SMP buka di *browser* sekolah bisa nge- *lag* parah.  
* **Verdict:** ❌ **JANGAN PAKE UNITY.**

**Pilihan 2: Kaboom.js (Atau Phaser.js)**

* **Kelebihan:** Ini *engine* murni JavaScript. Karena MediaPipe dan TF.js juga JavaScript, integrasinya **semanis madu**. Lu tinggal ambil data dari kamera, dan di file yang sama lu bisa langsung nge- *spawn* kotak di Kaboom. Ukurannya sangat ringan (\< 1MB), jalan mulus di laptop kentang sekalipun. Bikin kontrol lompat/jalan di Kaboom itu cuma butuh 3 baris kode.  
* **Kekurangan:** Nggak ada *editor visual*. Lu harus nulis kordinat level pakai kode (misal: add(\[pos(100, 200), rect(50, 50)\])). Tapi karena level lu simpel (cuma platform lompat-lompat), ini nggak masalah sama sekali.  
* **Verdict:** ✅ **PAKE KABOOM.JS (Sangat Direkomendasikan).**

**Saran Tambahan: Excalidraw / p5.js**

Kalau lu pengen visualnya bener-bener berasa kayak "Buku Gambar" dan coretan tangan, *library* kayak **p5.js** digabung sama **Matter.js** (buat fisikanya) juga sangat mematikan. Tapi kalau mau yang cepet jadi game platformer, **Kaboom.js** juaranya.

**Langkah lu hari ini:** Istirahat dulu, lu udah menang banyak hari ini. Besok, mulai corat-coret *Wireframe/Interaction Design* di Figma buat menuhin PR dari Bu Hesti\! Kalau butuh dibuatin draf *Use Case* atau *Flow* yang udah pakai tema "Space/Angkasa" dan tombol kontrol baru, *ping* gue aja\!

\================

# **MASTER PLAN & FRAMEWORK DESAIN: ESCAPE THE SKETCHBOOK**

*(Dokumen Acuan Bimbingan & Penyusunan SPPA)*

Dokumen ini merangkum kerangka kerja sistem dari sisi desain visual, interaksi, hingga batasan arsitektur teknis. Disusun dengan pendekatan pragmatis agar memenuhi standar akademis (defensible) dan feasible untuk dieksekusi dalam ruang lingkup Tugas Akhir.

## **FASE 1: PROBLEM STATEMENT & BATASAN RUANG LINGKUP**

**Fokus Masalah (Problem Statement)**

Mitigasi **Automation Bias** pada siswa SMP (13-15 tahun) yang cenderung menerima output AI secara pasif. Solusi yang diajukan adalah sistem pembelajaran berbasis *Consequence-driven learning* terintegrasi dengan antarmuka *Human-in-the-Loop* (HITL).

**Batasan Ruang Lingkup (Scope Limitations) \- Sangat Penting:**

Untuk menjaga performa aplikasi agar stabil berjalan di *browser* (Edge Computing) tanpa mengorbankan *framerate*, sistem dibatasi pada:

1. Model CNN (TF.js) hanya dilatih untuk mengenali \~10-15 kelas objek/coretan sederhana.  
2. Lingkungan game berbasis 2D murni menggunakan *engine* ringan (Kaboom.js).  
3. Evaluasi pengguna tidak menggunakan integrasi database/otentikasi yang rumit, melainkan deteksi berbasis *session* sederhana.

## **FASE 2: TEMA VISUAL & MEKANIKA INTERAKSI**

**Tema Visual: The Sketchbook**

Lingkungan permainan terjadi di atas selembar kertas bergaris dengan karakter *Stickman*. Maskot sistem (Momo) direpresentasikan sebagai "Robot Stabilo" berwarna hijau neon, bertindak sebagai *game master* dan perwujudan model AI.

**Mekanika Interaksi & Pengamanan Sistem:**

* **Draw (Input):** Siswa menggambar rintangan di udara via kamera (MediaPipe).  
  * *Defensible Tech:* Untuk mencegah input yang buruk akibat gestur tangan yang bergetar (*Gorilla Arm*), *frontend* akan mengimplementasikan algoritma *line smoothing* sederhana sebelum gambar dikirim ke TF.js.  
* **Drag & Drop (Placement):** \* *Defensible Tech:* Penempatan objek menggunakan sistem **Grid-Snapping**. Objek akan otomatis menyesuaikan ke ukuran *tile* standar terdekat. Ini meminimalisir *bug physics* (seperti objek tersangkut atau menutupi jalan karakter).  
* **Control:** Menggerakkan karakter menggunakan tombol Kiri, Kanan, Lompat.  
* **Intervene (HITL):** Memberikan validasi (Setuju/Koreksi) terhadap tebakan AI (Momo).

## **FASE 3: USER FLOW & ONBOARDING**

Alur dirancang linier untuk menjaga imersi, sekaligus menghindari kompleksitas pembuatan *level-selector* yang memakan waktu.

**1\. Layar Start & Onboarding**

* Sistem bertanya: *"Apakah ini pertama kali kamu main?"* (Yes/No).  
* **Jika Yes:** Masuk ke Onboarding. Momo menjelaskan aturan:  
  * *Solid:* Benda aman dipijak.  
  * *Danger:* Benda tajam/berbahaya yang memicu *Game Over* (kertas robek).  
* **Jika No:** Langsung loncat ke Stage/Level 1\.

**2\. Core Gameplay Loop**

* **Observasi:** Melihat rintangan.  
* **Kreasi:** Menggambar rintangan di udara. Game *pause* (menunggu input selesai).  
* **Inferensi:** AI menebak gambar.  
* **Interupsi (Probe UI):** Momo muncul di tengah layar menampilkan Top-3 tebakan AI.  
* **Resolusi:** Siswa menekan *Accept* atau *Override*. Objek dirender, game dilanjutkan.

## **FASE 4: LEVEL DESIGN & MANIPULASI LOGIKA AI**

Leveling dirancang untuk memancing keraguan siswa. **Catatan Teknis:** Menurunkan "kecerdasan" AI tidak dilakukan dengan me-retrain model ML secara real-time (karena tidak *feasible*). Manipulasi dilakukan pada *layer Controller/Aplikasi*.

* **Level 1 (Pemanasan):** \* Tantangan sederhana. AI menebak dengan akurasi tinggi (Normal Inference).  
* **Level 2 (Transisi):** \* Tantangan menengah. AI memunculkan tebakan alternatif yang mengecoh di urutan ke-2 dan ke-3.  
* **Level 3 (Jebakan Literasi):** \* Tantangan kompleks. *Controller* aplikasi dimanipulasi agar memaksa objek *Danger* (Pisau/Berbahaya) masuk ke urutan *Top-Prediction* dengan *confidence score* artifisial yang cukup tinggi.  
  * *Tujuan:* Jika siswa terkena *Automation Bias* (asal klik *Accept*), kertas akan robek. Siswa **wajib** melakukan *Override* untuk membuktikan pemahamannya.

## **FASE 5: PARAMETER KEBERHASILAN (EVALUASI METRIK)**

Untuk memastikan Tugas Akhir ini memiliki bobot keilmuan Ilmu Komputer (IT) yang berimbang dengan UX/Psikologi, evaluasi akan mengukur dua domain:

**1\. Metrik Sistem (System Performance)**

* **Inference Latency:** Waktu rata-rata (dalam milidetik) yang dibutuhkan TF.js untuk mengklasifikasi gambar di browser.  
* **Framerate Stability:** Dampak menjalankan MediaPipe dan TF.js secara bersamaan terhadap FPS (*Frames Per Second*) game Kaboom.js.  
* **Resource Usage:** Konsumsi memori (RAM) pada browser saat sistem berjalan.

**2\. Metrik Perilaku (Behavioral Analytics)**

* **Decision Latency (Jeda Kognitif):** Berapa detik siswa berhenti dan melihat "Probe UI" Momo sebelum menekan tombol (mengukur waktu evaluasi).  
* **Override Ratio:** Persentase seberapa sering siswa menolak (Override) keputusan AI pada Level 3 dibandingkan Level 1\.

