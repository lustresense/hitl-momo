# R&D NUI R18-01
## UX-First MediaPipe Robustness, Low-Light, Distraksi, dan *Keyboard-like Movement Feel*

**Proyek:** Sketchbook Universe  
**Tanggal:** 17 November 2026  
**Versi dokumen:** 0.3.0 (riset lanjutan berorientasi pengalaman siswa dan batas paket 25 MB)  
**Status:** **RISET / BELUM DIKUNCI UNTUK PRODUK**  
**Basis:** R18-01 v0.2.0 yang dibuka langsung; keputusan proyek aktif dan WORKING_STATE; repository `main` SHA `3ef4cc3` yang telah diaudit; riset teknis eksternal ditinjau 17 November 2026  
**Kelas bukti:** `SOURCE` (kode/dokumen), `LITERATURE` (riset eksternal), `USER_REQUIREMENT` (sasaran Owner), `INFERENCE` (penalaran teknis), `PROTOTYPE` (parameter belum dikalibrasi), `NOT_TESTED` (belum diuji pada webcam/perangkat target)  
**Kelanjutan:** R17-01 REV4 dan RD-00 s.d. RD-06  
**Ruang lingkup:** Interaksi NUI dan gameplay Thinman, bukan classifier gambar/Top-3 milik partner

> **Inti arah R&D**  
> **Kontrak arah R18 terbaru:** MediaPipe tetap fondasi deteksi tangan dan 21 landmark; hasil classifier R17 menjadi titik awal. Semua opsi harus memprioritaskan **responsivitas, kestabilan, keamanan aksi dan kenyamanan siswa SMP pada webcam nyata**, termasuk kamera buram/berkualitas rendah, pencahayaan sulit, variasi penampilan tangan dan objek/latar yang mengganggu. **Anggaran paket yang diunduh siswa ditetapkan sebagai target kurang dari 25 MB**, bukan lagi 15 MB. Dataset training dan resource GPU server tidak ikut diunduh siswa; VRAM training tidak mengurangi biaya runtime browser. Kontrol telunjuk diarahkan ke rasa *virtual keyboard*, tanpa mengubah keputusan mapping/fisika otomatis. Status seluruh pendekatan masih riset.

---

## Riwayat revisi

| Versi | Tanggal | Perubahan | Status |
|---|---|---|---|
| 0.1.0 | 17 Nov 2026 | Fondasi R18, DimHand, distraksi lintas objek dan game feel | Riset |
| 0.2.0 | 17 Nov 2026 | Koreksi geometri, negative suite, ground truth, A/B, gate, dan anggaran awal 15 MB | Arsip riset |
| **0.3.0** | **17 Nov 2026** | Mengubah target menjadi **<25 MB first-use journey**, UX/performa sebagai prioritas pertama, riset dataset DimHand + Ego2Hands + AnyHand + PALM + interaksi multi-pemain, metodologi low-light/skin-tone/domain shift, evaluasi aksi dan karakter, stres perangkat serta gate sebelum implementasi | **Riset / usulan parameter, belum deploy** |

### Ringkasan penutupan celah v0.2.0

| ID gap | Masalah v0.1.0 | Penutupan desain riset v0.2.0 | Status bukti |
|---|---|---|---|
| G01 | Salah klasifikasi benda vs tangan tidak punya anotasi independen | Pemisahan *no-real-hand*, *false-landmark*, *real-hand-but-missed* serta ground truth terpisah | Protokol tersedia; `NOT_TESTED` |
| G02 | Penerimaan landmark belum memverifikasi pose pointing | Kandidat *intentional-pointing gate*, geometri tulang/jari dan aturan reject | `SOURCE + INFERENCE`, belum uji |
| G03 | Sudut telunjuk bias aspect ratio | Koreksi vektor pada koordinat piksel atau x dikalikan aspek sebelum atan2 | Analisis kode dan matematika, belum uji webcam |
| G04 | Kontrol lompat/berhenti tidak terdefinisi dalam A/B | FSM keydown/hold/keyup, pemisahan jump repeat vs one-shot, waktu-ke-aksi | Protokol tersedia; `NOT_TESTED` |
| G05 | Ownership saat dua tangan/benda ambigu | Matriks crossing, lock/re-arm, tanpa hand takeover otomatis | `SOURCE + INFERENCE`, belum uji |
| G06 | DimHand langsung dianggap setara kamera siswa | RGB-only, held-out subject/view/light, uji eksternal; periksa hak akses | `LITERATURE`, dataset belum diakses |
| G07 | Target 15 MB lama tidak memisahkan paket dan runtime | **B-USER <25 MB** untuk journey pengguna, rincian sub-budget NUI, serta prioritas FPS/latency/RAM/thermal | `USER_REQUIREMENT + INFERENCE`, belum ukur |
| G08 | Tidak ada acceptance dan baseline berpasangan | Gate G0–G5, definisi metrik/CI, protokol paired A/B dan stop condition | Desain metode; `NOT_TESTED` |
| G09 | Pergantian Drawing/Placement/Gameplay belum diuji | Phase barrier dan neutral/re-arm test case | `SOURCE + INFERENCE`, belum uji |
| G10 | Keadilan warna kulit hanya berupa daftar sampel | Evaluasi berstrata pencahayaan × background × perangkat, tanpa inferensi ras dari kamera | Protokol, belum uji |

**Catatan penting:** menutup *gap dokumentasi dan desain riset* **tidak sama** dengan membuktikan bahwa model baru akurat atau ringan. Seluruh pengukuran webcam, percobaan training dan keputusan deployment tetap belum dilakukan.

## Ringkasan eksekutif v0.3.0: prioritas berdasarkan pengalaman siswa

**Perubahan kebutuhan dari Owner, bukan hasil eksperimen:** batas paket dinaikkan dari 15 MB menjadi **kurang dari 25 MB**, sementara fokus diutamakan pada **kualitas interaksi ketika aplikasi sedang berjalan**. Hal ini **tidak** mengizinkan pemuatan model berlebihan; model tambahan harus membuktikan manfaat yang sebanding dengan kenaikan runtime.

| Prioritas | Sasaran UX | Aturan penelitian |
|---|---|---|
| **S0: keamanan aksi** | Tidak ada gerakan/aksi destruktif dari tangan atau benda yang salah | *No input* lebih aman daripada menebak; ukur false action terhadap coverage |
| **S1: kelancaran** | Canvas, Momo, dan Thinman tetap responsif di perangkat murah; kamera tidak membuat game tersendat | Ukur frame-time UI, freeze, gesture-to-action, stop latency, RAM dan thermal, bukan hanya FPS detector |
| **S2: robust worst case** | Tangan siswa dengan variasi warna/ukuran, webcam burik, low contrast, backlight, ruangan redup, objek ramai | Eval kasus nyata, *slices* dan cross-factor; hindari klaim 'pasti semua kasus' |
| **S3: pengalaman kontrol** | Arah telunjuk seperti keyboard, stabil tetapi tidak lamban atau sulit melepas input | Physics sama untuk A/B; pengukuran + uji pengguna |
| **S4: biaya transfer** | **Total unduhan fresh-profile perjalanan produk <25 MB** (cakupan dijelaskan di §10) | Ukur byte `transferred`, bukan file size atau ukuran model saja; jangan menyingkirkan S0-S3 demi ukuran |

**Prioritas teknis yang diusulkan:** perbaiki terlebih dahulu frame sourcing, klasifikasi, *gating*, scheduling, serta hand ownership pada fondasi MediaPipe. Tambahan detektor berat atau model temporal besar **hanya kandidat cadangan setelah bukti per-slice**. Komputasi training di server dan kebutuhan komputasi siswa adalah dua anggaran yang terpisah.

### Pembedaan bukti dan status saat ini

- **TERBUKTI DI SOURCE:** MediaPipe sebagai dasar; filter/scheduler/CLAHE; model pilot MLP R17 telah dilaporkan; `WALK_SPEED=130`; kontrol telunjuk memiliki zona sudut; akses dataset tambahan belum terbukti dilakukan.
- **FAKTA PERMINTAAN:** Owner mengejar pengalaman siswa yang sangat baik dan meminta paket di bawah 25 MB; contoh laporan kamera low-light dan distraksi adalah observasi pengguna, bukan benchmark perangkat terukur.
- **USULAN RISET:** pipeline adaptif, seleksi data tambahan, uji multi-perangkat, virtual-key FSM, benchmark stress thermal, serta kriteria kelanjutan.
- **BELUM TERBUKTI:** keberhasilan real-cam, generalisasi keragaman warna kulit, perbaikan DimHand pada browser, ukuran journey aktual, dan ketersediaan VRAM 24 GB ketika training dijalankan.

## 1. Mengapa R18-01 dibuat?

R17 sudah menghasilkan perbaikan heuristik di NUI Lab, perekam landmark lokal, serta pilot Logistic Regression (LR) dan Multi-Layer Perceptron (MLP) menggunakan landmark HaGRIDv2. Hasilnya menjanjikan **pada dataset**, tetapi belum membuktikan reliabilitas webcam nyata, low-light, distraksi lingkungan, atau kenyamanan kontrol Thinman.

R18-01 membuka **riset baru**, bukan menganggap R17 gagal dan bukan memutuskan penggantian model yang sudah dipakai game. Pertanyaan intinya:

1. Bisakah sistem tetap menemukan dan melacak tangan pada cahaya ruangan redup, lampu atas, backlight, serta latar dengan kontras rendah?
2. Bisakah sistem menolak **benda apa pun yang bukan tangan**, gangguan visual, tangan orang lain, dan gesture yang tidak disengaja, tanpa bergantung pada warna kulit tertentu?
3. Bisakah classifier tambahan dilatih lebih kuat daripada pilot R17 pada kondisi penggunaan nyata, termasuk *hard negatives* dan gerakan berurutan?
4. Bisakah kontrol telunjuk terasa **setara dengan tombol arah keyboard**: stabil, terprediksi, tidak terlalu sensitif, dan segera berhenti saat arah dilepas?
5. Bisakah pengalaman pengguna pertama kali (unduhan app+game+NUI yang benar-benar dibutuhkan) memenuhi **total transfer <25 MB**, dengan **responsivitas, RAM, frame-time, suhu/performa berkelanjutan dan latensi aksi sebagai sasaran optimasi utama**?

**Batas klaim:** tidak ada jaminan akurasi 100%, ketahanan pada semua pencahayaan, atau ukuran paket tercapai sebelum pengujian. Istilah “fine-tuning” pada diskusi proyek ini dipakai secara informal untuk **penguatan pipeline MediaPipe**, bukan klaim telah memodifikasi bobot pretrained Google.

## 2. Posisi terhadap keputusan dan implementasi yang sudah ada

| Aspek | Baseline yang harus dihormati | Implikasi R18-01 |
|---|---|---|
| Fondasi NUI | MediaPipe Hand Landmarker dan pipeline gesture saat ini | Dipertahankan sebagai baseline dan fallback |
| R17-01 REV4 | Heuristik perbaikan, perekam RD-02, eksperimen LR/MLP | Dilanjutkan; tidak dihapus atau diulang tanpa alasan |
| Kontrol Thinman | **D-20261110-09** memakai arah sudut telunjuk | Mapping tetap baseline; *game feel* baru masih hipotesis riset |
| Fisika gameplay | **D-20261116-01** mempertahankan parameter fisika yang sudah berlaku; source `runtime/constants.ts` memuat kecepatan jalan 130, lompat 520 dan gravitasi 1600 | Jangan mengubah kecepatan global hanya karena NUI terasa liar |
| Gesture per mode | Keputusan D-20261110-07 dan konflik Card 1/Card 3 di D-20261115-02 | Tidak menyamakan aturan NUI Lab dengan produk tanpa peninjauan |
| Privasi | RD-02 merekam angka landmark secara lokal dengan persetujuan | R18 tidak mengaktifkan perekaman gambar/video otomatis |
| Peran partner | Model pengenalan sketsa/Top-3 berada di server partner | Tidak termasuk cakupan dokumen ini |

**Belum ada keputusan implementasi.** Seluruh arsitektur, ambang, dataset tambahan, dan perubahan UI di bawah merupakan kandidat penelitian.

## 3. Baseline bukti R17 yang benar-benar tersedia

**Asal bukti:** laporan dan source di repository `lustresense/hitl-momo`, `main` commit `3ef4cc3`, ditinjau pada 17 November 2026.

| Item | Bukti tersedia | Hal yang belum dibuktikan |
|---|---|---|
| MLP R17 | Arsitektur 56 → 64 → 32 → 9; 6.025 parameter; laporan ukuran JSON 127.134 byte | Bobot tidak tersedia di Git; belum terintegrasi ke NUI game |
| Hasil classifier | Macro-F1 0,987 pada dataset uji HaGRIDv2; perbandingan A/B offline | Akurasi dan false action webcam siswa **NOT_TESTED** |
| Dataset HaGRIDv2 | Anotasi landmark otomatis yang dipakai dalam pilot R17 | Bukan ground truth untuk seluruh kegagalan detektor visual |
| IPN HandS | Anotasi temporal tersedia; landmark yang dibutuhkan masih **BLOCKED** di laporan R17 | Evaluasi swipe temporal pada data tersebut belum berjalan |
| RD-02 | Perekam lokal berizin untuk angka landmark, pose, status lock dan aksi | Rekaman webcam nyata terlabel belum tersedia di bukti R17 |
| Hand lock | Seleksi kandidat tangan berdasarkan ukuran/posisi/histori; dukungan filter area wajah tersedia di modul | Belum terbukti aman terhadap semua kasus distraksi dan *hand takeover* |
| Kontrol Thinman | Arah telunjuk → input digital `left/right/jump`; physics `WALK_SPEED = 130` | *Keyboard-like feel* melalui kamera fisik belum diuji |
| Beban browser | Model tangan dan WASM sudah tersedia di frontend | RAM aktif/idle, *cold download* dan frame-time perangkat siswa belum diukur |

**Catatan kode yang relevan:** `gameplay-hand-driver.ts` memanggil `pickPrimaryHand()` tanpa menyuplai area wajah, meskipun `primary-hand.ts` mendukung parameter `face` opsional. Ini **risiko yang layak diuji**, bukan bukti bahwa deteksi orang lain pasti salah.

## 4. Taksonomi kegagalan yang harus dipisah

| Kode | Lapisan gagal | Contoh | Evaluasi utama |
|---|---|---|---|
| F1 | *False hand detection* | Patung, boneka, kain, poster, bayangan, refleksi atau benda lain dianggap tangan | *False positive* ketika tidak ada tangan sungguhan |
| F2 | *Missed detection* | Tangan asli tidak ditemukan pada low-light atau latar serupa | *Hand detection recall* menurut kondisi |
| F3 | *Landmark instability* | Titik telunjuk lompat, jari tertukar, pose berubah karena blur | Deviasi/jitter landmark dan durasi *tracking loss* |
| F4 | *Wrong hand ownership* | Tangan orang lain dipakai mengendalikan game, tangan pemain diganti saat bersilangan | *Identity/ownership switch*, aksi dari non-pemain |
| F5 | *Gesture misclassification* | Empat jari terbaca lima, tangan santai memicu Hapus, pinch dekat dianggap menyentuh | Kesalahan per kelas, false Hapus dan false Coret |
| F6 | *Temporal/action error* | Swipe dianggap dua perintah, arah berganti saat jitter, lompat berulang | *False trigger*, input stuck, waktu respons |
| F7 | *Runtime bottleneck* | Kamera aktif membuat animasi atau canvas tersendat | UI frame-time, long tasks, RAM, latensi, download |
| F8 | *Unintentional pointing* | Gestur non-pointing tetap memberikan sudut dari landmark 5→8 | False movement pada tangan rileks/pose non-pointing |
| F9 | *Geometry / mirror error* | Sudut dari koordinat 0–1 tidak proporsional pada video 16:9 atau mirror ganda | Salah zona arah dan diagonal |
| F10 | *Phase carryover* | Jari masih berada di zona aksi saat Drawing→Placement→Gameplay | False grab, jalan, atau jump pada perpindahan mode |
| F11 | *Evaluation leakage* | Frame berdekatan atau kamera orang sama terpisah ke train dan test | Skor yang terlalu optimistis |
| F12 | *Unmeasured abstention cost* | Banyak gesture ditolak dan kontrol jadi tidak responsif | Coverage, usability dan delay buruk |

**Kunci evaluasi:** classifier sempurna tidak menyelesaikan F2 jika MediaPipe gagal menghasilkan landmark. Sistem pengunci tangan yang kuat tidak menyelesaikan F1 jika benda keliru dinilai sebagai tangan yang sah. Semua lapisan harus dibedakan pada log dan laporan.

### 4.1 Bukti yang tidak disediakan API Hand Landmarker

Google mendokumentasikan keluaran Hand Landmarker berupa landmark image/world dan *handedness*. **Skor handedness bukan skor kepastian bahwa objek benar-benar tangan**. Threshold `minHandDetectionConfidence`, `minHandPresenceConfidence`, dan `minTrackingConfidence` memengaruhi proses di dalam task, tetapi tidak boleh diasumsikan tersedia sebagai skor validity per-kandidat pada JavaScript API. `SOURCE`: [Google Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker).

Konsekuensi eksperimen: jangan menulis aturan “tolak jika confidence tangan < X” apabila API tidak mengeluarkan variabel tersebut. Sebagai kandidat, teliti konsistensi skeleton, panjang relatif segmen jari, temporal plausibility, lokasi, *tracked ownership* dan *intentional gesture*, lalu bandingkan efeknya **tanpa mengklaim identitas atau keaslian objek pasti diketahui**. Validasi skeleton hanya heuristik dan dapat menolak tangan asli pada occlusion atau disabilitas/bentuk tangan berbeda.

### 4.2 Unit pengamatan dan kegagalan harus berbeda

- **Frame level:** apakah tangan asli terlihat menurut anotasi eksternal, apakah MediaPipe mengeluarkan landmark, dan apakah terletak pada tangan yang benar.
- **Track level:** urutan tangan pemain bertahan atau berpindah, termasuk jeda selama occlusion dan waktu pulih.
- **Gesture level:** apakah prediksi kelas benar, atau justru ditolak karena ambigu.
- **Action level:** apakah Coret/Hapus/Undo/Redo/Jalan/Lompat benar-benar dieksekusi dan dikehendaki.
- **Session level:** berapa salah aksi per menit, fraksi sesi bebas kesalahan, kualitas pengalaman siswa dan penggunaan memori.

Skor model yang baik pada frame **tidak** berarti kesalahan aksi per sesi rendah. Semua pelaporan harus mempertahankan penyebut dan jenis unit.

## 5. Definisi distraksi R18-01

Distraksi **tidak dibatasi pada tangan orang lain**. Pengujian mencakup hal berikut.

| Kelompok | Skenario konkret | Risiko |
|---|---|---|
| Benda bukan tangan | Mainan, alat tulis, botol, boneka, patung, kain, kertas, poster tangan, objek berbentuk/bertekstur menyerupai tangan | *False hand detection* |
| Background kompleks | Meja berantakan, rak, pola geometris, warna mirip tangan, perabot di belakang pemain | Detektor salah atau landmark tidak stabil |
| Kontras rendah | Kulit dan latar memiliki kecerahan/warna tampak yang mirip; objek sekitar juga mirip | Deteksi atau pelacakan sulit |
| Variasi penampilan tangan | Beragam warna kulit, ukuran tangan, bentuk jari, tangan kiri/kanan, rotasi, jarak kamera | Ketidakmerataan performa dan salah gesture |
| Pencahayaan dan optik | Lampu atas, backlight, cahaya redup, glare, refleksi kaca, motion blur, kompresi webcam | Tangan hilang, landmark salah |
| Gerakan dan occlusion | Tangan keluar-masuk frame, menutup wajah, jari tertutup, tangan bersilangan | Lock berpindah, gerakan salah |
| Banyak orang atau tangan | Orang lain lewat/melambaikan tangan, dua tangan pemain, tangan non-pemain mendekat | Salah kepemilikan input |
| Distraksi tanpa tangan aktif | Kamera hanya menampilkan benda dan latar tanpa tangan | Sistem seharusnya **tidak menghasilkan aksi** |

### 5.1 Prinsip inklusivitas warna kulit

- **Jangan** menggunakan rentang warna kulit tetap, seperti ambang RGB/HSV/YCrCb universal, sebagai satu-satunya syarat “ini tangan”. Warna kulit manusia dan pencahayaan sangat bervariasi.
- MediaPipe tetap menjadi detektor/landmarker utama; warna hanya boleh dipertimbangkan sebagai salah satu properti kondisi visual saat analisis, bukan bukti kepemilikan tangan atau identitas.
- Evaluasi perlu mencakup peserta dengan variasi penampilan kulit yang memadai, serta **kombinasi silang** antara pencahayaan, latar dan perangkat. Jangan menilai performa dari kategori warna kulit saja karena dapat mencampurkan pengaruh exposure kamera.
- Jika atribut warna kulit hendak dicatat untuk analisis bias, harus ada tujuan, persetujuan eksplisit, minimisasi data, dan metode kategorisasi yang tidak menebak ras/etnis. Tanpa kebutuhan dan izin itu, utamakan pengelompokan kondisi visual, *measured contrast*, pencahayaan, dan perangkat.
- **Tidak ada klaim “adil untuk semua warna kulit”** sebelum ada data representatif dan pengujian terstratifikasi.

### 5.2 Aturan aman ketika ambigu

Hipotesis *fail-safe* yang akan diuji: ketika kepemilikan tangan atau gesture tidak cukup pasti, sistem mengirim **input netral** (tidak bergerak, tidak Hapus, tidak Coret) dan memulihkan tracking secara terkendali. Hanya ada satu tangan pengendali aktif dalam satu waktu. Ketika tangan hilang lalu muncul kembali, sistem tidak boleh otomatis mengambil kandidat lain hanya karena lebih besar atau lebih dekat tanpa melewati pemeriksaan stabilitas dan ambiguitas.

Penyaringan area relatif terhadap wajah boleh **dibandingkan sebagai sinyal spasial opsional**, bukan sistem identitas/biometrik. Jika wajah tidak terdeteksi, perlu *fallback* yang terukur, bukan menjadikan semua kandidat sah tanpa batas.

### 5.3 Desain *negative suite* lintas objek (G01)

Alih-alih menyebut “semua benda” tanpa sampel yang dapat direproduksi, kelompokkan pengujian menjadi empat *strata*.

| Strata | Contoh | Ground truth | Kegagalan yang diukur |
|---|---|---|---|
| N0, *no hand present* | Meja, kain, botol, pena, mainan, bantal, gambar tangan | Tidak ada tangan fisik | False hand track dan false action per menit |
| N1, *visual hand-like object* | Boneka tangan, manekin, cetakan/poster telapak, tangan di layar perangkat lain | Bukan tangan pemain fisik yang berwenang | False track dan false ownership |
| N2, *real hand but not authorized* | Tangan orang kedua, dua tangan pemain, orang melintas, refleksi tangan | Tangan nyata ada, tetapi bukan tangan yang memegang kendali | Unauthorized action dan hand takeover |
| N3, *authorized hand difficult* | Kulit/latar mirip, glare, sarung tangan, tangan setengah tertutup, motion blur | Tangan pemain memang hadir | Missed detection, rejection rate dan latency |

**Kritis:** gambar tangan pada poster memang memiliki struktur visual tangan yang nyata. Tanpa sensor depth atau interaksi temporal, membedakannya dari tangan fisik mungkin *tidak teridentifikasi secara pasti* dari satu frame RGB. Yang diuji adalah kemampuan sistem **mencegah aksi** pada kondisi tersebut, bukan janji klasifikasi objek sempurna.

**Saat model menghasilkan landmark palsu pada N0/N1:** catat keluaran lengkap kandidat secara internal pada test yang diberi izin, cek geometri dan kestabilan. Sebagian contoh dapat menjadi kelas reject *landmark-level* hanya jika benar-benar menghasilkan landmark dan label aslinya diketahui. **Jangan** memasukkan frame tanpa landmark ke kelas `OTHER` milik MLP R17.

**Kontras warna kulit:** bukan *skin-color threshold*. Buat pengukuran relatif tangan vs lingkungan saat anotasi tersedia, misalnya perbedaan luminansi median *region of interest* tangan dan latar sekitarnya; bila tangan tidak dapat dilokalisasi dengan sumber independen, tandai metrik kontras `unavailable`, bukan hitung dari prediksi MediaPipe dan mengklaim *ground truth*.

### 5.4 Ownership dan fail-safe (G05)

Pilihan riset untuk *player-hand ownership*: posisi dan kontinuitas wrist, plausible velocity, *session age*, satu tangan aktif, serta face-box sebagai petunjuk spasial **opsional**. Tidak ada biometrik, *face verification*, atau identifikasi orang. Penggunaan face box dapat bias pada orang yang tidak menampilkan wajah atau pada kamera dengan framing sempit sehingga **harus punya fallback yang diuji**.

Rekomendasi hipotesis keamanan: *ambiguity → neutral → deliberate re-arm*; kandidat baru tidak mewarisi input tangan lama. Setelah hilang atau pindah fase, harus muncul pelepasan input tangan sebelum boleh aktif lagi. Periksa konflik dengan keputusan aktif mengenai *auto-reacquire*: **reacquire otomatis tetap menjadi tujuan; yang diuji adalah syarat keamanan sebelum menerima aksi**, bukan menambahkan tombol manual.

### 5.5 Pembuktian yang memisahkan warna kulit, kontras, optik kamera, dan distractor

**Hipotesis yang harus ditolak bila data tidak mendukung:** kesalahan MediaPipe tidak boleh otomatis disebabkan 'warna kulit'. Kamera dengan auto-exposure, white balance, sensor noise, kompresi, jarak, ukuran tangan di frame, dan latar yang mirip dapat menghasilkan gejala yang sama. Model secara visual bisa gagal pada kulit terang dengan latar terang maupun kulit gelap dengan latar gelap.

- **Evaluasi lintas kondisi:** tangan × latar dengan kontras tinggi/rendah, terang/redup, backlight, spektrum lampu hangat/dingin, webcam murah dan kamera laptop/HP, dekat/jauh, serta gerakan lambat/cepat. Variasikan satu faktor per *paired test* dan kombinasikan faktor terpilih pada *stress set*.
- **Kontras yang terukur:** bila tersedia ROI anotasi independen, catat selisih luminansi atau metrik tekstur tangan-latar. Jangan menghitung 'kontras ground truth' dari *predicted bounding box* saja; hal ini membiasakan kasus gagal.
- **Representasi:** rekrut penguji sukarela dewasa dengan penampilan tangan beragam dan beberapa tipe kamera. Apabila analisis skin-tone ingin dilakukan, gunakan prosedur persetujuan khusus dan penilaian manual/deskriptif yang tidak menebak etnis atau mengidentifikasi orang; ukuran sampel tiap strata tetap dilaporkan.
- **Negatif yang benar:** poster telapak, benda organik menyerupai jari, sarung tangan, bayangan, figur mainan, pantulan, gambar pada monitor, meja dengan warna kulit, kertas bertekstur, dan tangan orang kedua. Beberapa berisi tangan sungguhan tetapi bukan tangan yang berwenang; ground truth-nya berbeda.
- **Keluaran evaluator:** confusion by condition, per-condition *missed detection* dan false active minutes, interval kepercayaan serta ukuran sampel. Bila satu strata sangat kecil, laporkan 'DATA TIDAK CUKUP', bukan angka keberhasilan global.

**Batas inferensi dari literatur:** penelitian segmentasi berbasis landmark+warna juga mencatat kegagalan pada bayangan kuat, saturasi sensor, dan latar yang mirip warna tangan. Ini mendukung pengujian, **bukan** membuktikan bahwa menambah modul segmentasi warna akan meningkatkan produk. Lihat [Lightweight real-time hand segmentation leveraging MediaPipe landmark detection, 2023](https://link.springer.com/article/10.1007/s10055-023-00858-0).

## 6. DimHand sebagai kandidat data baru

**Sumber eksternal yang dipilih untuk ditinjau:** [DimHand: A Large-Scale Benchmark for Hand Pose Estimation under Dynamic Low-Light Conditions](https://hanlingzhan.github.io/DimHand/), ACM Multimedia 2026, Zhan dkk.

Menurut halaman proyek, DimHand berisi **745.280 frame**, **15 subjek**, **15 jenis aktivitas**, **lima sudut pengambilan**, dan rentang pencahayaan **0,1–10 lux**. Bentuknya sekuens RGB+depth dengan anotasi pose tangan 3D, parameter MANO, serta data terkait. Aktivitas yang relevan meliputi *finger counting*, *finger bending*, *finger tapping*, *finger pinching*, *finger crossing* dan *random gestures*.

**Mengapa berguna:** berbeda dari pilot HaGRID R17 yang memakai pose statis, DimHand berpotensi untuk memeriksa keberhasilan landmark pada cahaya sangat rendah **saat tangan bergerak** dan menjadi sumber *hard cases* untuk eksperimen temporal.

**Yang tidak boleh diasumsikan:**

1. Dataset **belum diunduh, belum disetujui aksesnya, dan belum digunakan** di proyek ini.
2. Halaman proyek mensyaratkan **permohonan akses** serta pembatasan penggunaan penelitian akademik dan larangan redistribusi/komersial. Kelayakan ekspor atau distribusi bobot turunan ke browser siswa memerlukan pemeriksaan izin khusus.
3. Lima belas subjek tidak cukup untuk mengklaim cakupan seluruh variasi warna kulit, bentuk tangan, perangkat atau distraksi benda. Komposisi variasi warna kulit tidak diverifikasi.
4. Label aktivitas DimHand **tidak otomatis sama** dengan perintah Sketchbook Universe. `finger pinching` bukan ground truth bahwa ujung jari benar-benar bersentuhan; `random gestures` tidak otomatis menjadi *negative class* yang sudah bersih.
5. Riset DimHand tidak otomatis membuktikan bahwa model hasil adaptasi cocok dengan target **transfer journey pengguna <25 MB**, atau efisien di RAM/GPU browser.

### Rencana penggunaan DimHand yang dibandingkan, bukan diasumsikan

| Jalur | Tujuan | Syarat sebelum dipakai |
|---|---|---|
| D1, benchmark eksternal | Mengukur kegagalan MediaPipe pada sekuens low-light dinamis | Akses sah, format/split yang dapat diverifikasi, metrik sebanding |
| D2, analisis gap | Menentukan kesalahan terutama pada detection, landmark, atau action | Anotasi referensi yang sesuai, alat sinkronisasi frame |
| D3, adaptasi classifier | Memanfaatkan sekuens yang landmark-nya valid untuk *temporal robustness* | Pemetaan label, split per subjek, pemeriksaan lisensi dan leakage |
| D4, studi preprocessing | Bandingkan raw frame dan enhancement pada sekuens yang sama | Bukti kenaikan deteksi, bukan hanya gambar terlihat lebih terang |

**Catatan:** penggunaan DimHand untuk melatih ulang *detector* memerlukan pipeline vision trainable dan izin yang terpisah. Ini bukan akibat otomatis dari memilih dataset.

### 6.1 Koreksi protokol DimHand dari literatur (G06)

Halaman primer DimHand menyatakan dataset berupa **sekuens RGB + depth**, dengan anotasi *3D joints*, MANO dan *mesh* dalam lima view; ukuran 745.280 frame berasal hanya dari **15 subjek**. Ini sumber yang berbeda dari low-light kamera kelas biasa. [Sumber primer](https://hanlingzhan.github.io/DimHand/).

- **Input pengujian:** hanya frame **RGB** yang dapat diberikan ke MediaPipe. Depth, 3D joint, dan parameter kamera dapat membantu memproyeksikan ground truth jika koordinat, kalibrasi dan sinkronisasi diverifikasi, **bukan** menjadi input model browser siswa.
- **Pemisahan data:** peserta/subjek harus terpisah antara train, validation dan test. Kamera berbeda dari subjek yang sama **tidak boleh** dianggap subjek independen. Gunakan evaluasi *held-out subject*, *held-out view* dan potongan lux, dengan ketidakpastian lebih besar karena n=15 subjek.
- **Kualitas label:** verifikasi proyeksi 3D→2D (intrinsics/extrinsics dan resolusi), missing/corrupt RGB frames dan occlusion. Jangan samakan semua label `finger pinching` dengan benar-benar kontak dua ujung jari.
- **Domain gap:** exposure, auto-gain, low-light sensor, frame rate dan latar kelas belum terbukti setara dengan DimHand. Tambahkan pengujian eksternal webcam target untuk klaim praktis.
- **Izin:** halaman publik belum sama dengan hak unduh; pengelola menyediakan formulir akses. Periksa syarat redistribusi/derivative model sebelum training untuk produk.
- **Jika akses ditolak:** gunakan DimHand sebagai literatur dan struktur stress-test saja. R18 tidak berhenti; benchmark webcam lokal berizin dan data publik lain tetap dapat dipakai jika lisensinya cocok.

**Dataset pembanding untuk distraksi/occlusion:** [HO-3D dari TU Graz](https://www.tugraz.at/institute/icg/research/team-lepetit/research-projects/hand-object-3d-pose-annotation) memiliki interaksi tangan-benda dan occlusion dengan anotasi; ini **opsi benchmark tambahan, belum diunduh**, bukan dataset utama untuk benda tanpa tangan. Ketersediaan, lisensi dan kesesuaian resolusi perlu ditinjau sebelum pemakaian.

### 6.2 Kandidat dataset tambahan v0.3.0 berdasarkan masalah yang berbeda

Satu dataset tidak dapat mewakili seluruh variasi kamera, kontras, orang, benda, dan gesture. Berikut hasil telaah sumber primer, **bukan daftar data yang sudah dimiliki atau akan otomatis digabung**.

| Sumber | Bukti dari penerbit/pemilik | Kegunaan yang paling masuk akal | Keterbatasan/pintu akses | Prioritas eksplorasi |
|---|---|---|---|---|
| **DimHand, ACM MM 2026** | 745.280 frame, 15 subjek, lima view, RGB+depth 0,1–10 lux, gesture dinamis | **Stress test RGB-only** low-light tracking/landmark dan gesture berurutan | Akses dimohon; anotasi depth/3D hanya boleh untuk referensi evaluasi; subjek terbatas | **P0 riset** |
| **A dataset of egocentric and exocentric view hands in interactive senses (2024)** | 47.166 frame dari video iPhone tersinkron, dua sampai empat pemain, cahaya alami/putih/kuning/redup, blur/bayangan | Uji interaksi **multi-tangan, objek meja, latar permainan dan cahaya nyata** | CC BY 4.0 pada Mendeley; raw frames tidak otomatis memiliki landmark/label action; perlu audit anotasi | **P0 riset** |
| **Exocentric view hand interaction dataset (2025)** | 7.221 frame PNG, game Ludo/Poker/Snakes and Ladders, dua sampai empat orang; empat peserta dewasa laki-laki | *Small stress set* khusus occlusion, tangan bergerak, objek meja, cahaya remang | CC BY 4.0; ukuran/keragaman subjek rendah; bukan benchmark fairness | **P1** |
| **Ego2Hands (2020)** | Dataset RGB dua tangan, variasi latar, skin tone dan iluminasi; evaluasi multi-sekuens | Deteksi dua tangan, occlusion, perubahan latar; menguji *skin-color shortcut* | View egosentris berbeda dari webcam depan; cek tiap lisensi gambar latar/artefak | **P1** |
| **PALM, 3DV 2026** | 263 subjek, sekitar 90 ribu RGB multi-view dan 13 ribu pemindaian tangan; penampilan dan ukuran beragam | Evaluasi representasi bentuk tangan/penampilan, bukan khusus gesture real-time | Sebagian besar CC BY-NC, akses melalui registrasi; subjek tidak mewakili populasi SMP | **P1** |
| **AnyHand (2026)** | Dataset sintetis RGB(-D), jutaan adegan tangan/objek, variasi tekstur dan lighting | *Pretraining/augmentation* kandidat untuk kasus benda, warna kulit, occlusion dan pose yang jarang | Situs menyebut beta, klaim jumlah pada halaman berbeda; konfirmasi snapshot, lisensi dan subset resmi sebelum pemakaian | **P1/P2** |
| **DexYCB, CVPR 2021** | Hand-object RGB-D, 10 subjek dan 20 objek, multi-view | *Hard occlusion / interaction stress set* | CC BY-NC 4.0; unduhan penuh 119 GB, tidak ekonomis untuk eksperimen awal | **P2 / selective only** |
| **HaGRIDv2 (existing R17)** | Sumber pose/landmark yang sudah dipakai R17; mencakup window/backlight dan no-gesture | Mengembangkan classifier R17 dengan hard negative dan split subjek | Kekurangan near-pinch dan temporal; hak redistribusi weights turunan belum jelas | **Baseline** |
| **IPN HandS (existing R17)** | Anotasi temporer tersedia namun landmark terblokir dari sumber sesuai laporan R17 | Swipe, one/two-finger motion, temporal negatives | Belum memenuhi verifikasi integritas landmark, tidak boleh dianggap tersedia | **BLOCKED** |

**Sumber primer teknis (di luar Dapus PA formal):** [DimHand](https://hanlingzhan.github.io/DimHand/), [dataset interactive senses / CC BY 4.0](https://data.mendeley.com/datasets/bxr7kx84y6/2), [exocentric game dataset / CC BY 4.0](https://data.mendeley.com/datasets/9d37m3nfgm/2), [Ego2Hands](https://github.com/AlextheEngineer/Ego2Hands), [PALM](https://github.com/facebookresearch/PALM), [AnyHand](https://chen-si-cs.github.io/projects/AnyHand/), [DexYCB](https://dex-ycb.github.io/), [HaGRIDv2](https://github.com/hukenovs/hagrid).

#### 6.2.1 Urutan pemanfaatan data yang efisien

1. **Bekukan baseline pengujian.** Simpan *held-out webcam target scenes* yang tidak digunakan memilih preprocessing, classifier, atau ambang. Buat daftar kondisi dengan label keberadaan tangan yang independen.
2. **Uji tanpa training dulu.** Jalankan model dasar pada DimHand (jika sah diakses) dan dataset game multi-pemain, tandai gagal *detection*, *ownership*, *gesture* serta runtime yang memang bisa dihitung.
3. **Latih classifier lanjutan pada baris landmark yang sah.** Gunakan HaGRID + data NUI nyata berizin, kelas OTHER dan transisi yang representatif; frame `NO_LANDMARK` bukan contoh kelas gesture.
4. **Pertimbangkan dataset RGB sintetis hanya jika ada bukti masalah detector.** Pembesaran jumlah data sintetis tidak boleh menggantikan tes webcam asli. Training detektor visual tidak dapat dilakukan hanya dengan anotasi landmark tanpa gambar.
5. **Audit lisensi per dataset dan model turunan** sebelum distribusi kepada siswa; lisensi untuk riset/dataset tidak sama dengan izin redistribusi bobot di produk.

#### 6.2.2 Cara mencegah evaluasi yang tampak hebat tetapi sebenarnya bias

- **Split per orang, sesi dan sumber:** urutan video yang berdekatan tidak boleh terpisah acak train/test; *hold-out* perangkat, posisi view, dan pencahayaan yang tidak pernah dipakai untuk tuning.
- **Data anotasi otomatis:** label *MediaPipe-generated landmark* bukan ground truth bebas error bagi detector MediaPipe itu sendiri. Pada frame gelap tanpa landmark, jangan menghitung akurasi classifier sebagai nol tanpa mendefinisikan denominator dan status deteksi.
- **Augmentasi fotometrik sebelum detector:** perubahan gamma/exposure, noise, white balance, motion blur, JPEG compression harus diujikan pada **frame RGB**, dengan kontrol agar label pose masih terlihat secara fisik. Augmentasi jitter koordinat berguna untuk classifier tetapi tidak memulihkan tangan yang tidak terdeteksi.
- **Negative subsets:** contoh tanpa tangan, objek menyerupai tangan, tangan orang lain, tangan dengan benda, dan tangan yang menjadi non-pointing harus dilabel terpisah. Jangan menjadikan semua sebagai `OTHER` generik.
- **Keterbatasan kamera:** gunakan RGB biasa pada inferensi; tidak mengasumsikan sensor depth, IR, NIR, beberapa kamera atau lampu khusus pada perangkat siswa.

**Temuan pendukung:** studi *metamorphic testing* pada MediaPipe Hands dan model lain mengonfirmasi bahwa motion blur diagonal, underexposure dan occlusion dapat sangat menurunkan keberhasilan estimasi. Temuan publikasi adalah hasil pada desain tes mereka, **bukan angka failure-rate produk Sketchbook Universe**. [Pu dkk., IEEE/ACM MET 2023](https://research.monash.edu/en/publications/robustness-evaluation-in-hand-pose-estimation-models-using-metamo/).

## 7. Kandidat arsitektur MediaPipe-centric

```text
Kamera siswa (preview normal, tidak dimanipulasi)
              |
      Frame quality / light diagnostics
              |
      [raw / adaptive enhancement]
              |
     MediaPipe Hand Landmarker
        palm + 21 landmarks
              |
      Validity checks + hand ownership
       |                 |
       |        uncertain / no hand -> NEUTRAL
       |
       v
  Gesture recognition
  baseline heuristik vs MLP R17 dikembangkan vs
  opsi custom Gesture Recognizer `.task`
              |
       Temporal validation + action safety
              |
  Input arbiter -> Drawing / Placement / Thinman gameplay
              |
   Browser runtime: FPS, RAM, cold download, latency
```

**R18 tidak menetapkan tiga classifier untuk dijalankan bersama.** Semuanya merupakan **kandidat A/B** pada input yang sama. MediaPipe Hand Landmarker tetap baseline; opsi custom Gesture Recognizer tidak dipilih otomatis dan tidak boleh membangun dua hand detector aktif tanpa alasan yang terukur.

### 7.1 Penguatan classifier seperti R17, tetapi lebih matang

- Mulai dari skema dan hasil R17, bukan membuat model besar dari nol.
- Tambahkan contoh *hard negatives* yang mewakili benda yang salah dideteksi sebagai tangan, tangan alami, empat hampir-lima jari, gripping, occlusion, serta *near-pinch* dan transisi. **Contoh benda tanpa landmark tidak boleh secara keliru dimasukkan sebagai pose `OTHER` untuk melatih classifier landmark.** Contoh itu dipakai untuk uji deteksi dan *fail-safe*.
- Latih atau adaptasikan classifier pada landmark webcam nyata berizin, termasuk kondisi cahaya sulit **selama landmark masih tersedia**.
- Pisahkan subjek/sesi/perangkat train, validation, dan test untuk mengurangi leakage; jangan acak frame dari satu rekaman ke kedua split.
- Bandingkan MLP kecil R17 yang dikembangkan terhadap custom gesture classifier berbasis embedding pretrained. Tidak ada keputusan untuk memilih yang lebih rumit sebelum ada keuntungan nyata.
- Kalibrasi ketidakpastian dengan data validasi dan evaluasi per kelas, bukan percaya angka *softmax confidence* mentah.

### 7.2 Ketahanan low-light pada tahap visual

- Pertahankan frame preview siswa apa adanya. Pemrosesan pencahayaan hanya terjadi pada jalur input detektor.
- Bandingkan **raw**, **scaled**, dan **CLAHE/adaptive** pada frame yang identik. Pencerahan berlebihan dapat merusak tepi jari dan menambah false positive.
- Ukur missing landmarks, variasi posisi titik, dan biaya preprocessing. Jika MediaPipe gagal total, MLP gesture tidak bisa memperbaikinya.
- Pertimbangkan recovery bertahap dan efisiensi frekuensi deteksi, bukan menjalankan dua inferensi pada setiap frame tanpa pengukuran.
- Fine-tuning bobot visual Google **bukan syarat R18**. Jalur detector alternatif hanya riset lanjutan jika ditemukan pretrained weights, arsitektur terbuka, data sesuai dan paket browser yang feasible.

### 7.3 Ownership dan distraksi

- Audit penggunaan `pickPrimaryHand()` pada gameplay; bandingkan penguncian posisi/waktu, pemeriksaan area pemain, dan penolakan ambiguitas.
- Tangan lain maupun objek bukan tangan **tidak boleh menghasilkan aksi**. Ketika lebih dari satu kandidat layak dan belum ada pemilik yang jelas, keluaran netral diprioritaskan.
- Jangan menambahkan identifikasi biometrik wajah/siswa atau mekanisme login wajah. Penggunaan kotak wajah, bila diuji, hanya petunjuk spasial sementara dan harus punya fallback.

### 7.4 Seleksi classifier dan *abstention* berbasis bukti (G01/G08)

Bandingkan bertahap **(i)** heuristik produksi, **(ii)** heuristik R17 di Lab, **(iii)** MLP R17 (jika artefak sah tersedia), **(iv)** MLP retraining yang menggunakan data tambahan berlabel, dan **(v)** Gesture Recognizer custom hanya bila evaluasi dan lisensi mendukung. Semua dinilai pada **held-out webcam scenes yang sama**.

Konsep *selective classification* adalah mengizinkan model menjawab `UNKNOWN/ABSTAIN` saat bukti lemah. Hasil riset [Geifman & El-Yaniv, NIPS 2017](https://proceedings.neurips.cc/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html) mendukung mengukur **risk vs coverage**, bukan memilih threshold confidence untuk menaikkan akurasi sembari menolak hampir semua gesture. Batas dari literatur tersebut tidak menjadi angka jaminan bagi NUI ini.

- Ukur `accepted-gesture precision`, `coverage` (proporsi kesempatan gesture sah yang berhasil diterima), `false action` dan latency bersamaan.
- *Class-dependent policy* boleh diuji: Hapus/Undo/Redo dengan verifikasi berbeda dari hover atau jalan; jangan menambah delay ke semua aksi hanya karena Hapus berisiko.
- Threshold/persyaratan *rearm* ditentukan menggunakan validation; test tidak dipakai menyesuaikan parameter.
- Kalibrasi softmax confidence perlu dipisahkan dari skor deteksi MediaPipe; **handedness confidence bukan ukuran “benar-benar tangan”.**
- Perlu uji *out-of-distribution* untuk occlusion, visual hand-like objects, jari berdekat, pakaian/tangan berwarna serupa dan input sengaja di luar vocabulary.

### 7.5 Recovery visual raw vs enhancement (G02/G08)

Uji *paired replay* yang menjaga video input, timestamps, serta device/delegate sama. Bandingkan jalur RAW, RESIZED RAW dan CLAHE yang memang ada pada `frame-source.ts`. Untuk setiap frame, simpan tag `enhancement applied` dan alasan pemilihan (tanpa merekam frame jika tidak ada izin). Ukur recall, false tracks, *landmark error*, dan biaya CPU, bukan kualitas subjektif gambar.

Hipotesis alternatif adalah menjalankan enhancement sebagai **recovery terkontrol** ketika detektor gagal atau scene sangat gelap. Jangan menginferensi dua versi frame pada setiap video tick kecuali biaya dan keuntungannya diuji. Pantau *oscillation* raw↔enhanced agar switching tidak sendiri membuat tracking goyang.

### 7.6 Opsi optimasi runtime yang diprioritaskan sebelum memperbesar model

| Kandidat | Hipotesis | Risiko atau trade-off | Bukti minimal sebelum dilanjutkan |
|---|---|---|---|
| **C0: baseline MediaPipe + heuristik** | Titik pembanding yang tidak boleh hilang | Kegagalan R17 tetap ada | Profil kamera fisik per slice, frame-time, action error |
| **C1: MediaPipe + enhanced MLP R17** | Akurasi gesture naik tanpa model besar (pilot 127 KB JSON) | Domain shift, abstention buruk, lisensi HaGRID | A/B di webcam dan biaya CPU/alloc parser nyata |
| **C2: camera-adaptive raw/enhanced** | Beberapa kasus low-light membaik | Noise/artefak, hilangnya detail 320px, CPU preprocessing | Paired replay raw / scaled / CLAHE; deteksi dan false action harus keduanya membaik |
| **C3: constrained hand ownership + intentional-pointing FSM** | Distraksi dan gerakan tidak sengaja ditekan tanpa tambahan model visual | Terlalu banyak reject, false stop, mengorbankan inklusivitas bentuk tangan | Risk-coverage per sesi dan tugas Thinman; recovery/rearm sehat |
| **C4: MediaPipe di Worker** | UI lebih responsif karena `detectForVideo()` tidak menghalangi main thread | GPU context kompatibilitas, bitmap transfer, memori ekstra, race, cold start | Long Animation Frames, gesture-action latency, RAM, FPS pada GPU/CPU fallback |
| **C5: custom Gesture Recognizer `.task`** | Representasi pretrained bisa membantu pose sulit | Model Maker tidak aktif dipelihara, bundle berbeda, dataset butuh gambar, size bertambah | Artifact export kompatibel, head-to-head, training dan lisensi terverifikasi |
| **C6: detector baru/ensemble** | Mampu menemukan tangan yang gagal di MediaPipe | Model kedua menambah transfer, panas, RAM, dan latensi | Hanya uji jika G1 membuktikan *detection* bottleneck utama dan kandidat lolos anggaran |

**Catatan desain:** tidak ada syarat harus memilih semua kandidat. Cari *Pareto frontier* antara akurasi per kondisi, risiko salah aksi, *coverage*, responsivitas, RAM, dan total transfer. Setelah melewati batas 25 MB atau membuat UX lebih buruk, peningkatan F1 marginal tidak dapat menjadi alasan integrasi.

## 8. Riset khusus: rasa kontrol Thinman seperti keyboard

**Permintaan pengguna:** kontrol tetap memakai telunjuk NUI, tetapi karakter harus terasa seperti ketika siswa menekan dan menahan tombol `←`, `→`, atau `↑`. Indikator berbentuk speedometer tidak boleh dianggap alasan untuk gerak yang serba cepat dan sensitif.

### Fakta implementasi saat ini

- `src/input/gameplay-gesture.ts` memetakan **sudut** telunjuk ke `walk-left`, `walk-right`, `jump`, kombinasi diagonal, atau `stop`; hysteresis sudut saat ini 5°, dan *reacquire* menunggu tiga frame.
- `src/components/game/SteerDial.tsx` merupakan **visualisasi arah telunjuk**, bukan pengatur kecepatan.
- `src/game/runtime/constants.ts` menetapkan `WALK_SPEED = 130`; keyboard dan NUI mengirim boolean `left/right/jump` melalui `InputArbiter`.
- `src/game/jump-assist.ts` mempunyai *coyote time* dan *jump buffer*. Perubahan cara gesture memicu lompat harus diuji bersama mekanisme tersebut.

**Implikasi:** jika NUI terasa terlalu cepat, penyebab kandidat adalah *steering jitter*, pergantian zona, lamanya tombol virtual “tertahan”, atau *jump retrigger*, **bukan bukti bahwa NUI memakai speed lebih tinggi dari keyboard**.

### Kandidat desain *virtual-key semantics*

| Peristiwa tangan | Semantik virtual keyboard | Prinsip *game feel* |
|---|---|---|
| Telunjuk stabil ke kanan | `ArrowRight keydown`, lalu *hold* | Jalan stabil seperti menahan tombol kanan |
| Telunjuk stabil ke kiri | `ArrowLeft keydown`, lalu *hold* | Jalan stabil seperti menahan tombol kiri |
| Kembali ke zona netral | `keyup` arah aktif | Berhenti terkendali, tanpa gerakan tersisa |
| Arah atas sebagai gesture lompat | *Jump press* yang disengaja, dengan rearm | Tidak memicu lompatan berulang karena jitter atau hold tidak sengaja |
| Pergantian kiri-kanan terlalu cepat | Tidak langsung mempercayai arah baru yang ambigu | Mencegah karakter *zig-zag* |
| Tracking hilang, stale, atau objek non-tangan terdeteksi | `keyup` semua input tangan | *Fail-safe neutral*, tidak ada *stuck key* |
| Keyboard fisik digunakan bersamaan | Aturan `InputArbiter` tetap berlaku | Input manual tetap punya prioritas sesuai keputusan lama |

**Parameter uji, bukan nilai produk:** calon zona netral/dead zone yang lebih toleran, *direction dwell* singkat, hysteresis masuk/keluar yang berbeda, dan smoothing sudut pada pengambilan keputusan. Waktu aktivasi harus dibandingkan terhadap respons keyboard; jangan memperbaiki stabilitas dengan menambah delay yang terasa berat.

**Pengujian feel harus membandingkan input yang sama** pada engine/level yang sama. Ukur durasi dari perubahan arah sampai gerak terlihat, jumlah salah arah per menit, penghentian setelah tangan netral, lompatan tak sengaja, dan jumlah kegagalan menyelesaikan rintangan. Perubahan `WALK_SPEED`, gravitasi, atau jump force baru relevan jika tes keyboard dan NUI sama-sama menunjukkan kebutuhan itu.

**UI dial:** bentuk speedometer belum ditetapkan untuk diganti. R18 perlu menguji apakah indikator sudut mentah membingungkan siswa saat perintah hasil hysteresis berbeda dari posisi jarum. Alternatif indikator *virtual key state* hanya bahan eksplorasi UX.

### 8.1 Koreksi matematika sudut dan aspek (G03)

Saat ini `indexPointAngle()` memakai `(base.x - tip.x, base.y - tip.y)` dari landmark yang sudah ternormalisasi 0–1. Pada video lebar `W`, tinggi `H`, arah yang sebanding dengan piksel adalah:

```text
dx = (base.x - tip.x) * W
dy = (base.y - tip.y) * H
theta = atan2(dy, dx) * 180 / PI
```

Atau `atan2((base.y-tip.y), (base.x-tip.x) * (W/H))`. Mirror satu kali **tetap perlu dikonfirmasi** terhadap preview kamera di perangkat nyata. Contoh geometri `W/H=16/9`: arah fisik 45° dapat terbaca sekitar `atan(16/9)=60,64°` jika hanya memakai normalisasi. Ini *mathematical illustration*, bukan pengukuran bug webcam.

**Evaluasi:** fixture sudut 0, 30, 45, 60, 90, 120, 135, 150, 180 derajat pada rasio 4:3, 16:9 dan portrait, termasuk mirror, rotasi kamera, nilai invalid dan tangan kiri/kanan. Pengukuran webcam diikuti untuk memeriksa pose fisik sebenarnya. Koreksi rumus **belum berarti mengubah sudut zona menjadi nilai tertentu**.

### 8.2 *Intentional pointing*, bukan sekadar vektor 5→8 (G02)

Sebelum menyetujui `keydown` dari telunjuk, bandingkan dua kandidat.

- **P1:** vektor telunjuk saja, setelah aspek dikoreksi; paling sederhana, baseline tanpa syarat pose.
- **P2:** validasi pose pointing berdasarkan ekstensi telunjuk relatif tiga jari lain, konformasi MCP/PIP/DIP, panjang proyeksi yang cukup dan kontinuitas beberapa frame. Jangan menggunakan satu rasio jari yang diasumsikan cocok untuk semua bentuk tangan.

**Hard cases:** telunjuk sedikit tertekuk, palm facing sideways, pose tiga/lima jari, tangan memegang benda, occlusion, motion blur, perubahan jarak ke kamera, dan pointing ke arah kamera (foreshortening). Tangan yang tidak memenuhi syarat jangan mengeluarkan arah terduga. Tetapi evaluasi harus menilai juga *false rejection* pada pointing yang benar.

### 8.3 *Virtual key FSM* yang mengikuti pengalaman keyboard (G04/G09)

```text
NO_HAND -> NEUTRAL
HAND_CANDIDATE -> VALIDATE_POINTING -> NEUTRAL/ARMED
ARMED + stable LEFT/RIGHT -> KEYDOWN + HELD
HELD + retained direction -> HELD (bukan keydown berulang)
HELD + deliberate neutral -> KEYUP -> NEUTRAL
HELD + valid opposite direction -> release prior, confirm other -> KEYDOWN
ANY + tracking loss / stale / ambiguity / phase change -> RELEASE_ALL
RELEASE_ALL + reacquired hand -> re-arm (tidak mewarisi input lama)
```

Dua *kandidat jump policy* diuji terpisah: **J1** `jump held` seperti keyboard saat ini, termasuk potensi lompat ulang saat mendarat; **J2** *edge-triggered once per arm*, harus keluar dari zona jump untuk memicu ulang. Keduanya dipisah dari pengaturan `JumpAssist` yang sudah ada. Jangan memutuskan J2 lebih benar hanya karena mengurangi lompat berulang; pengguna menginginkan *keyboard-like*, sehingga dua feel harus dibandingkan.

**Tidak disarankan:** menaikkan smoothing terlalu besar sampai `keyup` terasa berat. *1€ filter* merupakan teknik dengan trade-off jitter/lag; sumber aslinya memberikan prosedur tuning, bukan nilai universal ([Casiez dkk., CHI 2012](https://gery.casiez.net/1euro/)). Pertimbangkan smoothing koordinat *atau* sudut, lalu hysteresis dan dwell **berbasis waktu milidetik**, bukan banyaknya frame semata. Urutan filter harus diujikan karena perubahan urutan dapat mengubah lag dan tepi zona. Tracking hilang/phase change harus melakukan release **tanpa menunggu smoothing**.

### 8.4 Uji feel berskala sesi

A/B berpasangan pada level, physics dan rintangan yang identik. Bandingkan keyboard asli, NUI sekarang, NUI dengan aspect fix saja, dan kandidat FSM. Urutan kondisi dikonterbalans antarpenguji untuk mengurangi efek belajar. Catat `time to first intentional movement`, stop latency, accidental movement duration, false jump per menit, jumlah koreksi posisi, waktu menyelesaikan rintangan dan penilaian kemudahan kontrol. *Perceived fast* harus dibedakan antara kecepatan karakter yang benar-benar berbeda dan aktivasi gerak yang tidak dimaksudkan.

### 8.5 Kriteria *keyboard-equivalent feel* pada sumber yang sama

Source yang diverifikasi: `gameplay-gesture.ts` memetakan landmark telunjuk 5→8 dan sudut ke arah; `runtime/movement.ts` memberi kecepatan horizontal **130 world px/s** yang sama pada semua sumber input; `SteerDial.tsx` hanya indikator sudut. *Keyboard-like* berarti **semantik input kiri/kanan/lompat, stabilitas dan waktu stop sebanding**, bukan mengubah speedometer menjadi throttle analog.

**Empat eksperimen terpisah:**

1. **Geometri dan intentional pointing.** Koreksi aspect ratio berdasarkan `videoWidth/videoHeight`, mirror tepat sekali, validitas pose telunjuk, dan pembacaan pada rotasi tangan. Bandingkan terhadap gestur non-pointing yang kebetulan mempunyai vektor 5→8 valid.
2. **Virtual-key FSM.** Kandidat `idle → candidate direction → keydown → held → keyup/rearm`, dengan hysteresis waktu/angle yang tidak membuat UI terasa tertunda. Berhenti ketika masuk neutral zone atau tracking benar-benar hilang; jangan menahan arah lama saat frame macet.
3. **Jump semantics dan phase barrier.** Uji *hold-to-repeat* vs *one-shot* untuk NUI tanpa memodifikasi *jump buffer* KAPLAY terlebih dahulu; ketika Drawing→Placement→Gameplay terjadi, perintah lama harus dilepas sebelum dapat aktif lagi.
4. **User-feel A/B.** Pada level, kecepatan dan layout yang sama, catat waktu menyelesaikan tujuan, jumlah overshoot/korban lompatan, false movement, waktu berhenti, subjektif mudah diprediksi, dan fatigue karena mempertahankan postur jari.

**Risiko baru v0.3:** menambah dwell 100 ms secara membabi buta dapat membuat karakter terasa lamban meski mengurangi jitter. Dwell kandidat harus ditimbang terhadap *gesture-to-visual response*, bukan diambil sebagai angka final. Latensi sampling kamera, inferensi, temporal FSM, arbiter, fixed update dan render harus diukur per tahap.

## 9. Rencana pengujian terstruktur

| Paket | Yang diuji | Metrik kunci | Status awal |
|---|---|---|---|
| R18-E01 | Baseline R17 di webcam nyata | Recall tangan, kesalahan gesture, false Hapus/Coret | **NOT_TESTED** |
| R18-E02 | Benda apa pun tanpa tangan | False hand detection, false action, waktu kembali netral | **NOT_TESTED** |
| R18-E03 | Variasi warna kulit × latar × cahaya | Recall dan galat per kondisi, selisih antar kelompok terukur | **NOT_TESTED** |
| R18-E04 | Multi-tangan, occlusion, crossing, re-entry | Hand ownership switch, hand takeover, recovery | **NOT_TESTED** |
| R18-E05 | DimHand (jika akses disetujui) | Low-light detection/landmark, temporal performance | **BLOCKED: akses dan lisensi belum dipastikan** |
| R18-E06 | Heuristik R17 vs MLP R17 vs classifier kandidat | Macro-F1 per kelas, false Hapus, missed gesture, latency | **Belum dibandingkan pada webcam** |
| R18-E07 | Kontrol Thinman *keyboard-like* A/B | Salah arah, stop latency, jump retrigger, subjektif usability | **NOT_TESTED** |
| R18-E08 | Efisiensi browser | Cold/warm transfer NUI, active/idle RAM, FPS, p50/p95, long tasks | **NOT_TESTED** |
| R18-E09 | Aspect-corrected steering + mirror | Akurasi zona pada multi-aspect dan fisik | **UNIT GEOMETRY kandidat; WEBCAM NOT_TESTED** |
| R18-E10 | Intentional pointing gate | False movement dari pose non-pointing vs pointing recall | **NOT_TESTED** |
| R18-E11 | Negative suite N0–N3 dan hand takeover | False landmark, unauthorized action dan recovery | **NOT_TESTED** |
| R18-E12 | Phase barrier dan jump policy | Carryover action, jump retrigger, time to rearm | **NOT_TESTED** |
| R18-E13 | Selective classifier risk–coverage | False action vs coverage dan latency | **NOT_TESTED** |
| R18-E14 | DimHand RGB-only dan generalisasi | Kinerja pada held-out subject/view/lux, external webcam | **BLOCKED: akses belum diverifikasi** |
| R18-E15 | Skin/latar/illuminance/device strata | Performa per kondisi + ketidakpastian interval | **NOT_TESTED** |

### 9.1 Matriks kondisi minimal yang disarankan untuk eksperimen

- Pencahayaan: cukup terang, lampu ruangan/atas, backlight, redup, glare/refleksi.
- Latar: polos kontras, polos kontras rendah, pola ramai, objek diam, objek bergerak.
- Perangkat: laptop kelas menengah dan ponsel target siswa jika tersedia, termasuk kamera dan kondisi exposure berbeda.
- Aktivitas: diam, tiga/empat/lima jari, pinch dekat dan kontak visual, menunjuk arah, lompat, tangan masuk/keluar, swipe, gerak bebas.
- Distraksi: tidak ada tangan, benda non-tangan, satu tangan pemain, dua tangan pemain, tangan orang lain, persilangan, occlusion.
- Inklusivitas: variasi penampilan dan warna kulit yang terwakili secara etis, terutama pada kombinasi dengan latar kontras rendah. Evaluasi tidak boleh mengklaim keseimbangan demografis yang belum diketahui.

**Pengukuran:** jika memungkinkan ukur lux dengan alat yang layak, catat exposure perangkat dan video resolution yang benar-benar didapat. Label “gelap” dari persepsi saja bukan pengukuran kondisi pencahayaan.

### 9.2 Definisi metrik agar tidak tercampur

- **Detection recall:** proporsi interval/frame beranotasi tangan yang berhasil menghasilkan deteksi benar.
- **False hand detection:** keluaran tangan pada kondisi tanpa tangan sungguhan.
- **Landmark quality:** deviasi terhadap anotasi dan jitter selama pose seharusnya stabil.
- **Ownership switch:** pengendali berpindah dari pemain ke kandidat lain tanpa proses otorisasi yang semestinya.
- **False action rate:** Hapus, Coret, Lompat, atau perpindahan yang tidak dimaksudkan penguji. Laporkan per jumlah kesempatan dan per durasi sesi, bukan hanya per-frame.
- **Gesture latency:** waktu antara niat/pose valid dan aksi yang benar-benar terlihat.
- **Performa:** ukuran transfer *cold*/*warm*, waktu model siap, RAM sebelum load/setelah warm/kamera ON/setelah OFF, CPU/GPU, UI frame-time, dan inference p50/p95.

Metrik harus disajikan per kondisi dan per perangkat. Angka agregat saja dapat menutupi kegagalan pada latar kontras rendah atau warna kulit tertentu. Nilai batas kelulusan belum dikunci; baru ditetapkan setelah baseline valid dan tujuan risiko tiap aksi jelas.

### 9.3 Ground truth independen dan rancangan data (G01/G08/G10)

**Jangan menjadikan hasil MediaPipe sebagai satu-satunya label kebenaran MediaPipe.** Sumber *truth* harus independen dari sistem yang dinilai.

| Bidang anotasi kandidat | Arti | Sumber sah |
|---|---|---|
| `real_hand_present` | Tangan fisik memang terlihat | Pengamat berizin / referensi visual lokal berizin |
| `authorized_player_hand` | Kandidat pengendali yang sah pada interval itu | Instruksi penguji dan penanda sesi; bukan face recognition |
| `hand_object_class` | N0, N1, N2, N3; foto/manekin/latar/occlusion | Skenario dan pengamat |
| `intended_action` | No action, left/right/jump, draw/erase/undo/redo | Skrip eksperimen + annotation timecode independen |
| `lighting_setup` | Lampu depan/atas/backlight/dim/glare | Catatan setup; lux bila ada alat |
| `device_and_view` | Resolusi aktual, orientasi, fps, kamera, delegate | Browser getSettings/diagnostik aktual jika didukung |
| `detected_landmarks` | Output kandidat semua tangan + timestamps | Sistem yang diuji, bukan label kebenaran |
| `executed_actions` | Aksi game dan waktu eksekusi | Log input arbiter + game event, bukan hanya prediksi classifier |

Perekam RD-02 sekarang hanya menyimpan **21 landmark tangan terkunci atau null**, action dan `truth` terbatas `THREE/FIVE/PINCH_NEAR/PINCH_TOUCH/NO_GESTURE/TRANSITION/NO_LANDMARK/UNLABELLED`. Status `NO_LANDMARK` adalah **observasi sistem**, bukan bukti bahwa kamera kosong. Menambahkan ground truth N0–N3 memerlukan **rancangan rekaman R18 yang terpisah** dan mekanisme persetujuan sendiri bila melibatkan citra. Jangan mengasumsikan semua metadata terpasang pada perekam lama.

**Privasi alternatif:** untuk suite benda/no-hand yang tidak melibatkan wajah/manusia, gambar fixture dapat disimpan di lingkungan riset yang sesuai bila sumbernya sah. Untuk webcam manusia, utamakan anotasi langsung/angka lokal; bila frame/video diperlukan untuk bukti deteksi dan 3D pose, minta persetujuan khusus, jelaskan retensi dan pilih jendela pengambilan minimal. Jangan otomatis mengunggah data siswa atau identitas ke GitHub.

### 9.4 Protokol split dan statistik (G08/G10)

1. *Development set* boleh berisi R17 HaGRID dan klip eksperimental. *Locked test set* ditahan dan tidak dipakai tuning model maupun threshold.
2. Grouping minimal menurut orang/sesi dan sekuens video; pastikan tidak ada frame berdekatan dari satu klip pada train dan test. Jika jumlah perangkat memadai, laporkan juga *held-out device*.
3. Model pipeline yang dibandingkan membaca klip yang identik dengan timestamp yang sebanding. RAW vs CLAHE memerlukan input video sama; untuk uji *actual live latency* gunakan kamera fisik karena replay bisa tidak merepresentasikan eksekusi.
4. Laporkan estimator utama per **sesi/episode**, bukan menganggap ribuan frame dari satu orang sebagai ribuan penguji. Gunakan CI dengan *cluster bootstrap* per subjek atau sesi bila jumlahnya mencukupi.
5. Untuk *false action*, laporkan **events per minute of exposure**, per jumlah kesempatan gesture, dan porsi sesi bebas salah aksi. *Zero observed* bukan risiko nol; tulis durasi total dan interval ketidakpastian.
6. Untuk *detection recall*, evaluator harus tahu kapan tangan hadir walau sistem mengembalikan null; untuk false detection gunakan interval N0/N1 yang memang tidak memuat tangan pemain sah.
7. Jelaskan setiap rekaman yang gagal atau ambigu, termasuk *failures-to-start*, dropped frames, dan klip yang dikeluarkan. Jangan membuang kondisi paling gelap hanya karena model tidak mendeteksi tangan.

**Parameter awal desain sampling, bukan target keberhasilan produk:** minimal mencakup berbagai perangkat, lighting, background, orang/pose dan episode hand crossing; jumlah orang/sesi, durasi, ambang kelulusan serta kekuatan statistik ditetapkan lewat feasibility dan data baseline, bukan angka tebakan dokumen ini.

### 9.5 Gate penelitian dan kondisi berhenti

| Gate | Pertanyaan untuk maju | Bukti minimum | Jika gagal |
|---|---|---|---|
| G0, provenance | Apakah source, bobot baseline dan lisensi model/dataset jelas? | Manifest SHA/version, kondisi izin, definisi pipeline | Jangan distribusi weights/data |
| G1, ground truth | Dapatkah F1–F12 dilabel independen dan diulang? | Skema label, prosedur persetujuan, klip/skenario teridentifikasi | Jangan klaim model lebih akurat |
| G2, validity | Apakah geometri pointing dan ownership dasar benar? | Tes numerik multi-aspect + live target | Jangan tuning FSM di atas sudut bias |
| G3, robustness | Apakah kandidat menurunkan salah aksi tanpa membuat banyak perintah benar tertolak? | Paired metrics, risk–coverage, false-action per episode dan CI | Pertahankan baseline, investigasi error |
| G4, UX | Apakah Thinman benar-benar terasa seperti keyboard tanpa mengorbankan kontrol? | A/B dengan fisika sama, latency dan usability | Jangan memaksa kebijakan steering baru |
| G5, browser | Apakah jaringan, idle/aktif RAM, frame-time dan lifecycle sesuai perangkat target? | HAR/trace, model sizes, profil beberapa perangkat | Jangan pasang model atau Worker hanya karena teorinya ringan |

**Tidak ada gate dinyatakan PASS** pada revisi ini. Seluruh penilaian harus menggunakan metrik dan toleransi yang disepakati sebelum membuka locked test set; model dengan recall tinggi tetapi salah Hapus berbahaya tetap tidak boleh dipromosikan hanya dari macro-F1.

### 9.6 Matriks minimum worst case yang menyasar pengalaman nyata

**Strata kondisi wajib dicatat secara terpisah** (bukan otomatis dikalikan seluruh kombinasi hingga tak terjangkau):

| ID | Kondisi / kombinasi | Ground truth eksternal | Risiko / gejala utama | Metrik tingkat sesi |
|---|---|---|---|---|
| W01 | Webcam laptop murah 480p/15–30 fps atau output aktual rendah | Tangan asli ada/tidak; gesture dimaksud | Landmark kurang presisi, latency | Recall, false actions, stutter |
| W02 | Satu ruangan dengan lampu plafon, wajah terang tetapi tangan redup | Label pose/aksi, tangan berizin | Kontras lokal gagal | Recall/first detection time |
| W03 | Backlight jendela/lampu belakang, background lebih terang | Label pose/aksi, lokasi tangan | Underexposed hand / missing landmark | Miss rate, recovery |
| W04 | Kulit dan latar mirip kecerahan atau warna pada beberapa penampilan tangan | Anotasi ROI independen + consent | Model bergantung pada shortcut warna | Error menurut kontras dan perangkat |
| W05 | Benda berwarna mirip tangan, tanpa tangan manusia | `no physical hand` | False positive objek | False landmark dan false action/min |
| W06 | Poster/gambar tangan di layar atau manekin | `object, not authorized hand` | False-hand persistent | False action/min, lock mistaken |
| W07 | Tangan pemain dan orang lain saling menutup/bersilang | Tangan berwenang berbeda dari distraktor | Ownership switch | Unauthorized action, recovery |
| W08 | Satu tangan memakai sarung tangan / bandage, bentuk jari atypical | Anotasi tangan nyata | Filter keaslian menolak tangan sungguhan | False reject/coverage |
| W09 | Pinch nyaris menyentuh vs menyentuh; transisi cepat | Anotasi fase niat penguji | False Coret/Hapus dan delay | False strokes, time-to-ink |
| W10 | Thinman jalan+lompat dekat tepi; tracking hilang | Urutan tombol/niat penguji | Stuck walk, jump repeat, collision | Overshoot, stop latency, completion |
| W11 | Kamera mati, izin dicabut, tab tersembunyi, resume / rotasi | Tidak ada hak input pada interval tersebut | Aksi lanjutan/kehilangan state | Ghost action, memory release |
| W12 | 5–10 menit kamera aktif, laptop/HP panas/baterai rendah | Beban sama saat awal/akhir | Thermal throttling, browser jank | p95 per periode dan RAM trend |

**Protokol pembuktian fairness:** lakukan evaluasi menurut perangkat, kondisi pencahayaan, kontras dan variasi penampilan tangan secara silang dengan data berizin. Tidak menjanjikan 'semua warna kulit pasti aman' dari satu dataset; bila kelompok/subjek sangat sedikit, ketidakpastian harus dilaporkan. Kamera dalam kondisi **W04** tidak boleh membuat sistem mengandalkan segmentasi warna kulit tetap sebagai syarat keberadaan tangan.

**Pengukuran action-level:** pakai urutan target aksi yang disepakati sebelum tes. Hitung false action per *minute without authorized action*, recall gesture pada *eligible segments*, waktu mulai/berhenti bergerak, jumlah *aborted sessions*, dan gangguan rendering. Laporkan berapa lama sistem memilih netral agar penurunan false-positive tidak ditukar dengan aplikasi yang tidak responsif.

## 10. Batas paket <25 MB dan optimasi runtime yang berorientasi pengalaman

### 10.1 Kontrak ukuran versi 0.3.0

**Perubahan kebutuhan eksplisit Owner:** target R18 kini adalah **total paket yang diunduh siswa kurang dari 25 MB**, bukan lagi 15 MB untuk NUI saja. Di web, 'paket download' diterjemahkan menjadi **transfer jaringan aktual** pada kunjungan pertama, bukan `.task` mentah, nilai `Content-Length` jika dikompresi berbeda, total cache disk, atau direktori dataset di server.

| Anggaran / laporan | Cakupan | Aturan ukur |
|---|---|---|
| **B-USER = KPI utama <25.000.000 byte (desimal)** | App shell, halaman onboarding, UI, CSS/JS, font yang diunduh, gambar, animasi/audio bila ada, `.task`, WASM, face model, classifier tambahan, game assets, dan respons yang otomatis diminta sampai pengalaman utama **Bab 1–3** selesai pada kunjungan pertama | Browser fresh profile, cold cache, preserve log, `transferredSize` atau ekspor HAR yang diverifikasi, deduplikasi cache; catat skenario gagal/retry terpisah |
| **B-NUI = sublaporan** | Hanya aset yang benar-benar dipakai menyalakan MediaPipe/NUI | Tidak lagi memiliki cap 15 MB tersendiri; gunakan sebagai rincian untuk mengendalikan B-USER |
| **B-START = sublaporan** | Dari awal kunjungan sampai tangan pertama siap dipakai | Catat byte dan waktu, termasuk proses kompilasi/inferensi dan *warm-up* |
| **B-WARM / revisits** | Kunjungan ulang dengan cache normal | Laporkan byte tambahan, invalidasi cache dan apakah warm start benar-benar lebih cepat |
| **B-RAW / installed** | Total byte mentah file `.task`, WASM, `.js`, dll pada build | Informasi diagnostik, **bukan** bukti cap download <25 MB |

**Catatan uji ukuran:** jika perjalanan 3 level berbeda skenario asetnya, gunakan *full journey* konservatif dengan skenario Bab 1–3 yang memang memuat konten normal. Jangan mengklaim lulus hanya karena kamera berhasil menyala atau karena halaman pertama belum memuat level berikutnya. File dataset training dalam VM tidak dihitung; transfer payload prediksi dari server dihitung bila benar-benar muncul pada journey. Laporkan kebijakan pramuat/lazy-load dan storage cache yang dipakai.

Baseline yang diketahui dari audit source **sekitar 17,68 MB mentah untuk model tangan + satu varian WASM SIMD + JS loader + BlazeFace**, belum termasuk JS/CSS/game imagery. `Caddyfile` mengaktifkan `zstd gzip` tetapi ukuran transfer `.task` tergantung MIME `Content-Type` dan `Content-Encoding` aktual. Nilai target 25 MB **belum diverifikasi** dengan HAR perangkat nyata. Jangan menghitung varian SIMD dan non-SIMD sekaligus tanpa bukti kedua file diminta browser.

**Ambiguitas teknis yang belum diketahui:** aset Bab 1–3 dapat ditransfer berbeda menurut jalur siswa. Untuk itu ukur *normal path* dan jalur *upper-bound first play* serta tampilkan per-aset pada waterfall; keputusan apakah `B-USER` pada full experience dijadikan syarat mutlak produk harus dikunci lewat audit keputusan, bukan diasumsikan dari R&D.

### 10.2 Hierarki performa pengguna, bukan hanya ukuran model

Memenuhi `<25 MB` **tidak otomatis membuat browser ringan**. Anggaran performa harus mencakup fase berikut.

| Fase | Bukti yang harus dicatat | Mengapa penting |
|---|---|---|
| Halaman pertama | Transfer bytes, FCP/LCP bila relevan, total JS dan kompilasi | Pengalaman menunggu sebelum kamera |
| Kamera diizinkan | `getSettings()` resolusi/FPS aktual; waktu sampai video first frame; waktu sampai **first valid hand** | Kamera burik dan auto-exposure bisa membuat model lambat siap |
| Inference steady-state | p50/p95/p99 `detectForVideo`, frames diproses per detik, frame drop, GPU/CPU fallback | Inference bisa terlampau berat walau `.task` kecil |
| UI/game aktif | p95 frame interval, Long Animation Frames/long tasks, canvas responsiveness, jank Momo/Thinman | **KPI UX utama**: siswa merasa game lancar |
| Gesture→aksi | p50/p95 sampai coret/hapus/jalan/lompat terlihat; stop latency; wrong action/min | Model cepat tapi FSM lambat tetap buruk |
| RAM/lifecycle | Idle sebelum load, warm, active, face+two-hand, low-light enhanced, kamera off, 30 s after stop, GC, return | Model yang tidak dilepas bisa membebani seluruh game |
| Performa berkelanjutan | Ulangi 5–10 menit dan bila mungkin kondisi perangkat hangat vs dingin, CPU use, baterai | Perangkat murah bisa turun performanya akibat thermal throttling |

**Nilai p95/ketentuan numerik yang belum didukung data target disebut *parameter prototype*.** Tujuan pengalaman adalah UI terasa responsif dengan *fallback* saat resource tertekan, tanpa mendefinisikan klaim PASS dari benchmark satu mesin pengembang. Rujukan eksternal Google untuk halaman web menilai INP yang baik pada 200 ms atau kurang, tetapi **INP bukan metrik yang sama dengan latency gesture NUI** dan tidak boleh menggantikannya. Sumber: [web.dev INP](https://web.dev/articles/inp), [Chrome Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames).

**Pilihan degradasi graceful yang perlu dievaluasi**, bertingkat dan tidak mengganggu pengalaman:

1. Hindari inference ganda pada satu frame; batasi *in-flight* frame, buang frame lama bila sistem sibuk, gunakan staleness neutral yang sudah ada.
2. Lepaskan kerja sekunder dulu (mis. deteksi wajah frekuensi rendah, diag overlay) hanya bila keamanan hand ownership masih terpenuhi; jangan menonaktifkan pengaman secara diam-diam.
3. Uji adaptive input resolution (raw video vs 320px scaled vs intermediate) dan cadence inferensi terpisah dari FPS render. Resizing terlalu agresif dapat menghilangkan detail ujung jari; hasil harus diuji pada W01/W03/W09.
4. Uji GPU → CPU fallback dan MediaPipe Worker sebagai A/B. **Worker bisa mengurangi macet main thread tetapi tidak mengurangi total kerja model**; overhead ImageBitmap/memory harus dihitung. Rujukan [sampel Google](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts).
5. Jika perangkat tidak mampu memenuhi input kameranya, pertahankan fallback keyboard/touch yang jelas. Fallback bukan 'NUI berhasil'; catat *coverage* dan pengalaman pengguna.

### 10.3 Metode ukur RAM browser yang tidak mengarang angka

- Gunakan `performance.measureUserAgentSpecificMemory()` **hanya** pada browser yang mendukung dan memenuhi `crossOriginIsolated`/secure context. Ketiadaan API bukan bukti nol RAM. Lihat [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory).
- Bila tidak tersedia, gunakan Chrome/Edge DevTools Memory/Performance, process task manager, dan profiler Android sesuai perangkat; **jangan bandingkan nilai heap JS dengan total renderer process** atau mengklaim pemakaian GPU VRAM dari angka heap.
- Catat baseline browser kosong dengan tab lain ditutup, ukuran perangkat, OS/browser, model hand/wasm SHA dan delegate GPU/CPU. Lakukan cold/restart, steady-state, stop/GC, tab hidden, permission revoke, dan repeat run.
- Periksa apakah warm cache 30 detik dan face detector cached Promise masih mempertahankan memori setelah `stop`; ukur bukan hanya menilai source `close()`.

### 10.4 Antarmuka kamera adaptif dan worst-case perangkat

- `getUserMedia({width: {ideal:1280}, height:{ideal:720}, frameRate:{ideal:60}})` adalah **permintaan ideal**, bukan jaminan FPS/sensor. Pada cahaya redup, kamera bisa menurunkan exposure/frame rate aktual; log `getSettings()` serta throughput frame yang benar-benar diterima. Lihat [MDN getSettings](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings).
- **Baseline pengujian** meliputi webcam laptop noise tinggi, laptop low-power tanpa GPU efektif, Android kelas menengah/rendah, Chrome/Edge, setidaknya satu browser berbeda bila memungkinkan. Tidak boleh mengekstrapolasi dari GPU server atau GPU laptop developer.
- Preview kamera tetap tampak normal sesuai kebutuhan pengguna. CLAHE/normalisasi dipakai **hanya untuk inferensi**, bila A/B membuktikan peningkatan. Input gambar yang diubah tidak otomatis lebih akurat, dan proses enhancement sendiri berpotensi menambah lag.
- Runtime GPU server 24 GB VRAM yang dilaporkan Owner hanya menjadi *resource budget* training kandidat. Browser siswa tetap berjalan pada RAM/GPU mereka; model yang sudah diekspor wajib lolos pengukuran ukuran/latency pada perangkat rendah.

### 10.5 Anggaran keputusan berbasis kualitas total

Model **tidak** direkomendasikan untuk dipasang jika hanya memenangi F1 dataset tetapi membuat salah satu hal ini memburuk tanpa trade-off yang dapat dipertanggungjawabkan:

- false Hapus atau unauthorized movement naik pada hard-negative/occlusion;
- gesture->aksi atau stop latency menghambat penyelesaian tugas;
- p95 UI frame-time/jank memburuk signifikan dibanding baseline pada perangkat target;
- RAM sesudah kamera OFF tidak kembali ke baseline yang dapat diterima atau meningkat tiap sesi;
- paket B-USER melebihi 25 MB atau model bergantung pada API browser yang tidak tersedia pada perangkat siswa;
- performa slice low-contrast / kondisi tangan tertentu memburuk walaupun skor agregat naik.

Kriteria *signifikan* harus diisi **sebelum A/B** berdasarkan baseline dan pilot UX, bukan dipilih setelah melihat p-value. Gunakan G0–G5 (§9.5) dengan penekanan G5 menjadi gerbang wajib yang setara dengan safety dan robust accuracy.

## 11. Data, etika, dan lisensi

- **HaGRIDv2:** laporan R17 menyatakan lisensi varian belum dituntaskan dan pilot weights tidak dimasukkan ke Git. Status ini tetap berlaku sampai dibuktikan lain.
- **DimHand:** memerlukan aplikasi akses dan pembatasan riset akademik. Jangan mendistribusikan data atau weights turunan sebelum dasar izinnya jelas.
- **Webcam nyata:** RD-02 saat ini merekam **angka landmark lokal**, tanpa video, wajah atau data identitas, dan butuh persetujuan. Penelitian yang membutuhkan gambar untuk melatih detector harus punya protokol persetujuan, retensi, penyimpanan, dan pemusnahan tersendiri sebelum dilakukan.
- **Warna kulit:** tidak dijadikan autentikasi, filter eksklusi, atau klasifikasi identitas. Evaluasi keadilan harus mempertimbangkan variasi perangkat dan penerangan serta tidak menggunakan atribut sensitif tanpa alasan dan izin yang sah.
- **Siswa SMP:** pengumpulan data siswa tidak boleh diasumsikan sah hanya karena aplikasi dapat mengakses kamera. Untuk fase awal, pengujian oleh pengembang dewasa dan data publik berizin lebih aman; desain pengujian peserta usia SMP memerlukan persetujuan/pengawasan yang tepat.

### 11.1 Protokol khusus penggunaan data visual dan hak pengguna

1. Perekam RD-02 saat ini **angka landmark saja**. Itu cukup untuk mengevaluasi beberapa kesalahan classifier, tetapi **tidak** cukup untuk memverifikasi objek tanpa tangan, warna latar atau kegagalan visual saat landmark `null`. Evaluasi visual diperlukan hanya pada fixture publik, set pengujian dewasa berizin dan pengamatan langsung yang tidak otomatis diunggah.
2. Jika perekaman gambar/video lokal suatu saat dibutuhkan, sediakan persetujuan khusus, tujuan, horizon retensi, akses dan cara menghapusnya; jangan memasukkan wajah atau video anak ke repo, log produksi, dashboard atau konektor. Protokol khusus peserta usia SMP harus melalui persetujuan wali/lembaga bila relevan.
3. Catat per-dataset *manifest* meliputi URL primer, versi, pemilik, tanggal akses, lisensi, kategori raw-vs-derivative, jumlah subjek, modality, hak training dan hak distribusi weights turunan. Bila belum jelas, dataset hanya dapat menjadi referensi literatur.
4. Untuk fairness, prioritaskan metrik fungsional yang transparan menurut kondisi, bukan pengenalan atribut sensitif dari kamera. Laporkan cakupan peserta/strata dan batas generalisasi.

## 12. Prioritas pertanyaan R&D, bukan daftar implementasi

| Prioritas | Pertanyaan yang harus dijawab | Kriteria lanjut |
|---|---|---|
| P0 | Error dominan berasal dari deteksi, landmark, hand ownership, classifier, atau input mapping? | Ada baseline video/landmark berlabel dan analisis per lapisan |
| P1 | Apakah MediaPipe + preprocessing adaptif memberi peningkatan di low-light tanpa lebih banyak false positives? | Perbandingan A/B pada scene sama dan biaya runtime terukur |
| P1 | Apakah penguatan classifier R17 menurunkan false Hapus dan false activation pada webcam nyata? | Hasil per kelas dan temporal, bukan dataset statis saja |
| P1 | Apakah digital key semantics membuat Thinman lebih mudah dikontrol? | A/B melawan keyboard dengan physics sama, respons tidak terasa berat |
| P2 | Apakah DimHand memberi bukti/hasil tambahan yang belum ditutup data lokal? | Akses, lisensi, label, dan pemetaan yang valid |
| **P0** | Apakah **full journey transfer <25 MB** sekaligus UI lancar saat kamera aktif selama sesi? | HAR cold/warm, FPS/frame-time p95, RAM/lifecycle dan tes sustained pada perangkat rendah |

**Hasil akhir R18-01 yang diharapkan** adalah *decision evidence*: perbandingan kandidat beserta kualitas pada kondisi buruk, distraksi lintas objek, inklusivitas penampilan tangan, rasa kontrol Thinman, dan biaya browser. **Dokumen ini tidak memilih model produksi dan tidak menginstruksikan pelaksanaan training/deploy.**

### 12.1 Tahapan keputusan riset sebelum implementasi agar tidak salah mengoptimasi

| Tahap bukti | Eksperimen | Keluaran yang dibutuhkan | Kondisi berhenti / eskalasi |
|---|---|---|---|
| **R18-UX0** | Baseline kamera asli + keyboard vs NUI | Error taxonomy per-slice, HAR, render p95, gesture latency, RAM, sample perangkat | Tidak ada ground truth/trace yang cukup → jangan menyimpulkan butuh model besar |
| **R18-UX1** | Geometri telunjuk, pointing intent, virtual-key, ownership | A/B virtual-key, stop/overshoot, false actions, respons tanpa jank | UX terlalu lamban karena dwell → kalibrasi ulang, bukan tambahkan model |
| **R18-UX2** | Raw / scaled / CLAHE + Worker/pacing | Peningkatan recall di low-light **dan** dampak p95 UI, CPU, RAM | Recall naik tetapi false actions atau jank naik → bukan kemenangan |
| **R18-UX3** | MLP R17 yang diperkuat dan kandidat embedder custom | Per-slice model comparison, risk-coverage, parity, ukuran artefak, lisensi | Tidak lebih baik pada webcam eksternal → tidak promosi |
| **R18-UX4** | Dataset DimHand / interactive game / Ego2Hands dan transfer domain | Generalisasi subject-view-device/light dan biaya anotasi | Akses/licensing tidak jelas → gunakan hanya sebagai referensi desain tes |
| **R18-UX5** | Sesi end-to-end Bab 1–3, 5–10 menit kamera ON, stop/resume | Kualitas pengalaman, false movement/erase, memory leak, total transfer <25 MB | Gagal pada hard safety/perf → revisi kandidat, jangan deploy |

**Inti pilihan:** ukuran model bukan KPI utama. Pilih kandidat dengan pengalaman terbaik pada perangkat target yang tetap masuk batas transfer; jangan memaksakan arsitektur terpadu `.task` bila pendekatan MediaPipe + MLP kecil justru lebih cepat, mudah diuji dan lebih aman.

### 12.2 Lima hipotesis penelitian yang dapat dibantah

- H1. **Domain-adapted classifier** memperbaiki false Hapus dan near-gesture dibanding R17 tanpa menaikkan latency yang dirasakan.
- H2. **Adaptive preprocessing** meningkatkan deteksi pada slice low-light nyata tanpa menambah false hand/action dan jank.
- H3. **Hand ownership + reject** menurunkan aksi dari benda/tangan lain sekaligus mempertahankan *coverage* pemain.
- H4. **Virtual-key semantics** meningkatkan kontrol Thinman dibanding mapping sudut mentah dengan fisika KAPLAY sama, tanpa perlu menurunkan WALK_SPEED global.
- H5. **Worker/pacing + adaptive resolution** menghasilkan UI lebih lancar pada perangkat bawah dan tidak melampaui paket 25 MB, termasuk saat kamera berjalan beberapa menit.

Semua hipotesis perlu baseline berpasangan dan dapat dinyatakan **DITOLAK**; bukan janji hasil.

## 13. Hal yang belum dikunci

1. Ketersediaan dan izin penggunaan DimHand, termasuk izin distribusi bobot turunan.
2. Skema evaluasi variasi warna kulit/latar dan sumber peserta dengan persetujuan.
3. Pilihan classifier R17 MLP yang dikembangkan atau custom Gesture Recognizer.
4. Ambang confidence, hysteresis, dead zone, *dwell*, rearm, dan *stop latency*.
5. Apakah filter spasial berbasis wajah membantu gameplay atau justru terlalu membatasi.
6. Nilai target perangkat uji, batas FPS/p95/thermal/RAM, dan kontrak pengukuran B-USER <25 MB untuk *full first-use journey* (termasuk aset Bab 1–3).
7. Perubahan tampilan atau penggantian speedometer.
8. Penggunaan model detektor visual baru apabila MediaPipe baseline tetap gagal pada kondisi tertentu.

## 14. Referensi dan jejak sumber

### Sumber primer internal (repository, bukan hasil uji webcam)

- [R17 NUI classifier A/B report](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md)
- [R17 dataset feasibility](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/docs/nui-rd/R17_NUI_DATASET_FEASIBILITY.md)
- [R17 NUI handoff 2026-11-17](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/docs/execution/NUI_R17_REV4_HANDOFF_2026-11-17.md)
- [Gameplay gesture mapping](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/src/input/gameplay-gesture.ts)
- [Primary hand selection](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/src/camera/primary-hand.ts)
- [Gameplay hand driver](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/src/input/gameplay-hand-driver.ts)
- [Steer dial UI](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/src/components/game/SteerDial.tsx)
- [Gameplay physics constants](https://github.com/lustresense/hitl-momo/blob/3ef4cc3685fc64bce729c5ae54bc29689f6d3446/frontend/implementation/src/game/runtime/constants.ts)

### Sumber riset eksternal (untuk R&D, **belum otomatis menjadi sitasi proposal/daftar pustaka PA**)

- [Zhan dkk., DimHand, ACM Multimedia 2026, halaman proyek dan formulir akses](https://hanlingzhan.github.io/DimHand/)
- [DimHand, repository publik](https://github.com/HanlingZhan/DimHand)
- [MediaPipe Hands, dokumentasi pipeline](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md)
- [Contoh resmi MediaPipe Hand Landmarker Web Worker](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts)
- [Google AI Edge: Hand Landmarker, output API, threshold dan palm re-detection](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)
- [MediaPipe Model Maker: dataset gesture, valid indices dan sample tanpa landmark dibuang](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/model_maker/python/vision/gesture_recognizer/dataset.py)
- [DimHand, susunan data RGB+depth dan anotasi per subjek](https://github.com/HanlingZhan/DimHand)
- [HO-3D, TU Graz, hand-object occlusions](https://www.tugraz.at/institute/icg/research/team-lepetit/research-projects/hand-object-3d-pose-annotation)
- [Casiez, Roussel & Vogel (2012), 1€ Filter](https://gery.casiez.net/1euro/)
- [Geifman & El-Yaniv (2017), Selective Classification (risk–coverage)](https://proceedings.neurips.cc/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html)
- [Caddy encode, default Content-Type kompresi](https://caddyserver.com/docs/caddyfile/directives/encode)
- [MDN, measureUserAgentSpecificMemory, dukungan dan syarat](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory)

- [AnyHand (2026), dataset sintetis RGB(-D) tangan-benda / situs penulis](https://chen-si-cs.github.io/projects/AnyHand/)
- [PALM (3DV 2026), keragaman 263 subjek dan lisensi proyek](https://github.com/facebookresearch/PALM)
- [Ego2Hands (2020), dua tangan, kulit, latar dan iluminasi](https://github.com/AlextheEngineer/Ego2Hands)
- [DexYCB (CVPR 2021), hand-object/occlusion dan CC BY-NC 4.0](https://dex-ycb.github.io/)
- [Dataset game egocentric/exocentric 2024, Mendeley v2, CC BY 4.0](https://data.mendeley.com/datasets/bxr7kx84y6/2)
- [Dataset game exocentric 2025, Mendeley v2, CC BY 4.0](https://data.mendeley.com/datasets/9d37m3nfgm/2)
- [Pu dkk. (2023), Metamorphic robustness testing hand pose models](https://research.monash.edu/en/publications/robustness-evaluation-in-hand-pose-estimation-models-using-metamo/)
- [Lightweight hand segmentation MediaPipe, kegagalan akibat warna latar/cahaya](https://link.springer.com/article/10.1007/s10055-023-00858-0)
- [MDN MediaStreamTrack.getSettings, format kamera aktual](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getSettings)
- [Chrome Long Animation Frames API, profiling jank](https://developer.chrome.com/docs/web-platform/long-animation-frames)
- [web.dev INP, definisi responsivitas event UI](https://web.dev/articles/inp)

---

**Kendali perubahan:** versi 0.3.0 menggantikan dokumen riset R18-01 v0.2.0 sebagai artefak lengkap. Prioritas UX-first dan target <25 MB adalah kebutuhan terbaru Owner; rencana dataset dan parameter pengujian tetap usulan R&D. Tidak mengubah `DECISIONS.md`, `WORKING_STATE.md`, source, model, produk, atau repository GitHub. Promosi gagasan menjadi keputusan produk memerlukan audit terpisah dan bukti runtime.


---

## 15. Execution Tracker (`research-can` Sandbox Status, 2026-11-18 WIB)

> **Plan Status:** `[WIP]` — R18-UX0..UX3 and isolated simulated-video browser runtime are evidenced and verified against `main` `3ef4cc3685fc`; R18-UX4 (`DimHand`) is `BLOCKED` by access/non-commercial license/disk limits, and R18-UX5 physical webcam validation (`docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md`) remains `NOT_TESTED`.

| Stage | Status | Linked Evidence (`research-can`) | Key Measured Summary & Open Caveats |
| --- | --- | --- | --- |
| **R18-UX0** Baseline & Dataset Audit | **PASS** | `r18/experiments/exp_r18_ux0_baseline.md`, `r18/results/r18_ux0_*.json` | Scoped app build PASS (`11.46 MB` Caddy-default / `9.49 MB` all-zstd); Vitest 75/82 files (838/852 tests, 14 fail); IPN GT/MP miss `7.54%` test / `10.45%` train; `NOG` false steer `48.38%`, `N0_fan_sticks` `10/35` CLAHE; `16:9` aspect error `16.22°`. |
| **R18-UX1** Geometry, FSM & Ownership | **PASS** *(Offline / Unit)* | `r18/experiments/exp_r18_ux1_geometry_fsm.md`, `r18/candidates/ux1_candidates.ts`, `r18/results/r18_ux1_ab.json` | Multi-aspect angle error **`0°`**; `F10` phase barrier & `J2_edge` jump (`26 -> 1` trigger) & `FaceAnchor` fallback PASS; `99.60%` TEST skeleton retention; `NOG` steer `57.99% -> 2.57%`. Residual: `SafeSwipeGuard` on continuous pointing `106 -> 21` (`P1F`), `51 -> 15` (`P2F`). |
| **R18-UX2** Adaptive `RAW-first` + `CLAHE-320` | **PASS** *(Offline Dataset)* | `r18/experiments/exp_r18_ux2_adaptive_clahe.md`, `r18/results/r18_ux2_adaptive.json` | Mendeley `DimLight` detection `52.08% (RAW) -> 60.83% (auto_320) -> 64.58% (M3)`; `NaturalLight` `37.50% -> 50.00% -> 59.17%`; avoids `10/35` CLAHE `N0_fan_sticks` hallucinations in bright frames. |
| **R18-UX3** Lightweight IPN `CC BY 4.0` Classifier + Exported A/B | **PASS** *(Offline / Synth / Unit)* | `r18/experiments/exp_r18_ux3_ipn_classifier.md`, `r18/models/ux3_model_mlp.json`, `r18/models/MODEL_CARD.md`, `r18/results/r18_ux3_exported_eval.json` | Person-disjoint IPN (19/5/5): TEST `acc=0.8045`, `macroF1=0.6156`, `POINT_1F F1=0.8898`, `ECE=0.01671`, `123 KB` (`44 KB` zstd); TS parity `max_diff=7.24e-6`, `p50=20.8 µs`. Locked TEST `NOG` steer `0.27%`, `NOG` erase `0.76%`, `TUP` erase `0.84%`; Mendeley 600f false steer/erase **`0.00%`**; static `FIVE` `3/3`, `FOUR/THREE` `0/3`, Pinch `10/10` (`<=0.25`) vs `0/10` (`>=0.35`). Residual: `N0_raw` `1/35` false erase if static `5x` identical. |
| **R18-UX4** DimHand (ACM MM 2026) | **BLOCKED** | `docs/attachments/DIMHAND_AUDIT_SUMMARY.md`, `r18/manifests/dataset_manifest.json` | No direct download (manual approval form); `supp.pdf` D.4/D.5 prohibits commercial/external distribution (`CC BY-NC-ND 4.0`); full archive > `4.0 GiB` free disk. |
| **R18-UX5 (Pre-check)** Browser WASM 180s Harness (`BROWSER_SIMULATED_VIDEO`) | **PASS** *(Sim-Video)* | `r18/experiments/exp_r18_ux5_browser_sim_harness.md`, `r18/results/r18_ux4_browser_runtime.json` | Cold transfer **`10.811 MB` (`11,336,623 B`) < 25 MB**; `2,271` continuous frames (`180.43s`), `12.59 fps`, UX3 `p95 = 0.2 ms`, `[falseSteer=0, falseErase=0, falseSwipe=0]` vs baseline `[370, 141]`, stable heap (`8.89 -> 8.31 MB` post-stop), track stop `1/1`. CPU XNNPACK logged `2,057` Long Tasks (`detect p95 = 99.6 ms`). |
| **R18-UX5 (Physical)** Owner Physical Webcam & Classroom Run | **NOT_TESTED** | `docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md` | No physical webcam on VM (`/dev/video*` absent); product promotion remains gated on Owner physical tests. |
