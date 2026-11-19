# NUI Lab 4 | pesan 91-100

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afb0520-54b0-83ec-b789-6680fdb7cb15
> Source Git blob: e04d43f2ce0067c893759488179e9a36c826be8a

## L4-M091 | Assistant | waktu tidak ada


Gw bikin dokumen baru **R&amp;D NUI R18** yang terpisah dari R17, masih berstatus riset, bukan keputusan implementasi. Gw masukin DimHand, distraksi dari **benda apa pun dan variasi warna kulit**, serta feel kontrol Thinman seperti tombol panah. Gw cek dulu aturan proyek dan dokumen R17 supaya versi dan isinya nyambung.

Source R17 sudah cocok. Gw pakai **R18-01** untuk dokumen riset baru, tanpa menimpa R17. Satu koreksi penting yang gw masukkan adalah distraksi **bukan cuma tangan orang lain**, tetapi juga benda, tekstur latar, bayangan, pantulan, dan kontras rendah pada berbagai warna kulit. Risetnya juga akan membedakan salah deteksi tangan, salah memilih tangan pemain, dan salah menerjemahkan gesture menjadi aksi.

**Dokumen R&amp;D NUI R18-01 v0.1.0 sudah gw buat**, sebagai kelanjutan R17 tanpa mengganti keputusan produk atau mengubah kode.

**R&amp;D NUI R18-01**

Markdown • 17 November 2026 • 14 bagian

[Unduh dokumen R18-01 (.md)](sandbox:/mnt/data/NUI_R18-01_RND_Robust_Recognition_LowLight_Distraksi_Gamefeel.md)

Dokumennya mencakup empat fokus riset utama.

1. **Recognition dan low-light.** MediaPipe tetap fondasi, hasil classifier Claude R17 dikembangkan, dan DimHand masuk sebagai kandidat data low-light dinamis.
2. **Distraksi menyeluruh.** Bukan cuma tangan orang lain, tetapi juga benda apa pun, pola background, bayangan, pantulan, kontras rendah, serta variasi warna kulit dan kondisi kamera.
3. **Kontrol Thinman.** Telunjuk tetap dipakai, tetapi diteliti agar karakter terasa seperti dikendalikan tombol panah keyboard. Tidak langsung mengubah kecepatan atau fisika game.
4. **Performa browser.** Target download NUI di bawah 15 MB, pengujian RAM, FPS, latensi, dan keselamatan ketika tracking gagal.

Gw juga memasukkan matriks pengujian R18-E01 sampai R18-E08, perbedaan fakta R17 dan hipotesis baru, serta daftar hal yang belum dikunci.

**Statusnya murni R&amp;D.** Belum ada training baru, pemilihan model, atau instruksi implementasi ke Ujang. `DECISIONS.md` dan repository juga tidak diubah.

### Saran update WORKING\_STATE

- **Yang berubah\:** Dokumen rancangan riset NUI R18-01 v0.1.0 telah dibuat sebagai artefak lokal.
- **Bagian terdampak\:** R&amp;D NUI, dataset, distraksi, low-light, kontrol Thinman, evaluasi browser.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-17 19:30
- 📎 **NUI_R18-01_RND_Robust_Recognition_LowLight_Distraksi_Gamefeel.md** · MD

---

---

## L4-M092 | User | 2026-11-17 19:59:15


message time: 2026-11-17 19:59:15

ada celah ga? coba pikirin

---

---

## L4-M093 | Assistant | waktu tidak ada


Gw audit R18-01 yang tadi sebagai dokumen riset, bukan cuma mengulang idenya. Fokus gw cari celah yang bisa bikin hasil training kelihatan bagus di dataset tapi gagal saat webcam nyata, distraksi, atau gameplay, termasuk batas ukuran dan privasi.

**Ada. Gw nemu beberapa celah penting di R18-01 v0.1.0. Dokumennya sudah menangkap arah yang lu mau, tapi belum cukup kuat sebagai rancangan eksperimen.** Terutama karena ada risiko hasil training terlihat sangat akurat, sementara NUI masih salah mendeteksi benda atau Thinman tetap terasa susah dikontrol.

Dua temuan paling serius dari audit dokumennya adalah sebagai berikut.

1. **R18 belum cukup menjelaskan cara membuktikan sistem tidak salah mendeteksi benda sebagai tangan.** Daftar distraksinya sudah luas, tetapi protokol uji dan data yang diperlukan belum lengkap. Kalau MediaPipe mengeluarkan 21 landmark palsu pada benda, classifier gesture masih bisa menghasilkan prediksi.
2. **R18 belum memeriksa geometri sudut telunjuk secara memadai.** Padahal ini sangat relevan dengan keluhan lu tentang Thinman yang terasa terlalu sensitif. Mapping sudah menggunakan input digital seperti keyboard, sehingga masalahnya belum tentu selesai hanya dengan menambahkan *dwell* atau smoothing.

Gw juga menemukan satu kesalahan rujukan keputusan di dokumen. `D-20261116-01` adalah keputusan tentang objek siswa, tiga bab, dan aturan terkait. Angka fisika memang dipertahankan dalam batas keputusan tersebut, tetapi ID itu bukan keputusan khusus penetapan kecepatan Thinman. Kalimat R18 bagian 2 perlu dibuat lebih presisi.

## Hasil audit R18-01

Pemeriksaan terhadap dokumen 320 baris, keputusan proyek, serta kode gameplay dan perekam NUI di commit `3ef4cc3`\.

| Prioritas | Celah | Risiko |
|--------|--------|--------|
| P0 | Perhitungan sudut telunjuk belum dikoreksi aspect ratio | Salah arah atau lompat |
| P0 | Tidak ada validasi pose telunjuk sebelum bergerak | Tangan biasa bisa menggerakkan Thinman |
| P0 | Data perekam belum cukup untuk membuktikan distraksi dan low-light | Evaluasi bisa menyesatkan |
| P0 | Penolakan objek yang menghasilkan landmark palsu belum didefinisikan | False action tetap lolos |
| P1 | Aturan lompat saat telunjuk ditahan belum dikunci untuk R&amp;D | Potensi lompat berulang |
| P1 | Perilaku saat kehilangan lalu mendapatkan kembali tangan ambigu | Hand takeover atau kontrol tersendat |
| P1 | DimHand belum punya protokol transfer ke kamera RGB siswa | Hasil riset tidak generalizable |
| P1 | Target 15 MB dan batas penerimaan belum tegas | Model bagus tetapi browser berat |
| P2 | Rencana uji transisi mode dan efektivitas interaksi siswa kurang | Kesalahan baru saat alur game berubah |

## Temuan teknis yang menurut gw paling penting

### 1. Sudut telunjuk berpotensi salah sejak perhitungannya

Di `gameplay-gesture.ts`, sudut dihitung langsung dari selisih koordinat x dan y yang dinormalisasi MediaPipe.

Masalahnya, pada kamera 16:9, satu unit x dan satu unit y tidak mewakili jarak piksel yang sama.

Contoh matematisnya\:

Arah fisik telunjuk

# 45°

Sudut dari koordinat normalisasi 16:9

# 60,6°

Itu ilustrasi geometri, bukan hasil webcam. Tetapi perhitungannya memang menunjukkan potensi bias sudut.

Akibatnya, telunjuk yang sedikit naik bisa lebih cepat masuk zona lompat daripada yang lu bayangkan. Ini jauh lebih spesifik daripada sekadar mengatakan kontrolnya terlalu sensitif.

**R18 perlu menambahkan pemeriksaan aspect ratio sebelum eksperimen smoothing atau dwell.** Kalau sudut dasarnya salah, smoothing hanya membuat pembacaan yang salah menjadi lebih halus.

### 2. Sistem bisa bergerak walaupun siswa tidak sengaja menunjuk

Fungsi `evaluateGameplayGesture()` menghitung arah dari landmark 5 dan 8, lalu langsung menghasilkan input gerak.

Belum ada persyaratan bahwa telunjuk benar-benar berada dalam pose *pointing* yang disengaja. Klasifikasi pose memang ada di driver, tetapi tidak menjadi syarat arah tersebut.

Artinya, gesture lain yang menghasilkan sudut telunjuk valid juga berpotensi mengaktifkan pergerakan.

Ini harus masuk R18 sebagai **intentional pointing validation**, bukan hanya penstabil sudut.

### 3. Perekam R17 belum cukup untuk R18

Perekam `lab-recorder.ts` saat ini menyimpan landmark tangan yang terkunci, label tester, status lock, dan aksi. Itu bagus untuk audit gesture, tetapi belum cukup untuk mengevaluasi semua kasus baru.

Misalnya ketika kamera melihat boneka dan MediaPipe salah menghasilkan landmark tangan, kita perlu mengetahui apakah landmark tersebut berasal dari tangan asli atau benda. Perekam sekarang tidak menyimpan anotasi independen tentang keberadaan tangan asli, identitas kandidat pengendali, atau jenis objek distraksi.

Begitu pula ketika landmark hilang akibat cahaya. Data `lm=null` saja tidak membuktikan apakah tangan benar-benar ada tetapi gagal dideteksi, atau memang tidak ada tangan.

**R18 membutuhkan protokol ground truth terpisah**, tanpa berarti harus merekam video siswa secara otomatis. Anotasi pengamat terkontrol atau rekaman sukarela berizin bisa menjadi kandidat metode, dengan batas privasi yang jelas.

### 4. Lompat berulang perlu diuji secara eksplisit

Di `jump-assist.ts`, selama `jumpHeld` tetap bernilai `true`, karakter bisa melakukan lompatan baru ketika kembali menyentuh tanah.

Perilaku itu juga berlaku untuk keyboard. Jadi belum tentu bug.

Tetapi karena telunjuk bisa tertahan dalam zona atas tanpa sengaja, pengalaman NUI-nya bisa terasa berbeda.

R18 harus membandingkan dua kemungkinan, yaitu lompat sekali per aktivasi dan lompat berulang saat ditahan. Jangan langsung mengubah keduanya karena yang lu minta adalah **feel seperti keyboard**, bukan mekanik lompat baru.

## Celah metodologi yang masih harus ditutup

**DimHand tidak otomatis mewakili kamera siswa.** Dataset itu melibatkan kondisi low-light terkontrol dan tersedia dalam format multimodal. Eksperimen harus memisahkan pengujian RGB-only dari informasi depth atau anotasi 3D. Selain itu, rentang 0,1 sampai 10 lux tidak boleh disamakan begitu saja dengan seluruh kondisi lampu kamar atau laptop siswa.

**Akurasi perlu diukur sampai ke aksi, bukan berhenti di model.** Misalnya model menghasilkan klasifikasi FIVE dengan benar, tetapi FSM mengeksekusi Hapus dua kali, maka pengalaman pengguna tetap gagal. Sebaliknya, classifier bisa salah sesaat, tetapi safety gate menolak aksi sehingga siswa tidak terdampak. Dokumen sudah memisahkan F1 sampai F7, tetapi belum menyusun *end-to-end action acceptance criteria* yang disepakati sebelum eksperimen.

**Klaim tahan distraksi perlu batas yang realistis.** MediaPipe dan classifier tidak bisa dijamin menolak semua poster tangan, boneka, benda, atau pantulan pada setiap kondisi. Ukuran keberhasilan harus berfokus pada false action dalam kondisi tertentu, waktu pemulihan, serta seberapa sering sistem keliru mengambil alih tangan pemain.

**Target ukuran juga belum tepat sasaran sepenuhnya.** Bagian 10 membatasi 15 MB pada aset NUI, bukan seluruh transfer browser. Kalau yang lu maksud adalah total paket yang diunduh siswa ketika pertama kali menjalankan pengalaman kamera, dokumen harus mengukur seluruh jalur itu. Target ini juga perlu menjadi batas evaluasi awal, bukan baru dicek setelah arsitektur terpilih.

Terakhir, R18 masih kurang memberi perhatian pada **pergantian fase** seperti Drawing → keputusan Top-3 → Placement → Gameplay. Gesture yang masih ditahan dari fase sebelumnya jangan otomatis menjadi aksi fase berikutnya. Ini berpotensi mengganggu interaksi utama PA.

## Apa yang perlu dibenahi di dokumen?

Gw menilai **R18-01 v0.1.0 belum siap dijadikan dasar eksekusi training**, tetapi sudah cukup sebagai dasar diskusi R&amp;D.

Revisi berikutnya sebaiknya menjadi **R18-01 v0.2.0**, bukan membuat R19. Isinya perlu mempertajam geometri kontrol, validasi pose yang disengaja, protokol data/ground truth, hard negatives berupa landmark palsu, recovery kepemilikan tangan, batas performa, dan pengujian aksi menyeluruh.

Satu langkah paling penting sekarang adalah **mendefinisikan apa yang dianggap berhasil dan gagal pada setiap lapisan NUI sebelum model dilatih lagi**\. Kalau tidak, kita berisiko mengulang R17 dengan skor dataset yang lebih tinggi tetapi masalah webcam lu tetap sama.

Gw belum mengubah file R18-01. Ini hasil audit terhadap versi yang lu minta periksa.

---

---

## L4-M094 | User | 2026-11-17 20:04:14


message time: 2026-11-17 20:04:14

yaudah lu lanjutin risetnya buat nutup gap itu

---

---

## L4-M095 | Assistant | waktu tidak ada


Gw lanjutkan R18-01 jadi riset yang lebih operasional, tetap tanpa mengubah kode atau menyuruh Ujang eksekusi. Gw akan verifikasi celah satu per satu terhadap dokumen R18, keputusan proyek, kode aktual, dan riset eksternal, lalu susun revisi **v0.2.0** dengan protokol uji serta kriteria keberhasilan yang jelas.

Dari source dan riset, ada tiga tambahan yang wajib masuk revisi. **Confidence MediaPipe Hand Landmarker di API web tidak menyediakan skor validitas setiap tangan seperti yang mungkin kita bayangkan**, jadi penolakan benda tidak boleh bergantung pada satu angka confidence. Lalu kontrol telunjuk perlu koreksi aspect ratio sekaligus validasi pose pointing. Terakhir, benchmark low-light wajib punya ground truth independen karena frame tanpa landmark tidak memberi tahu apakah tangan memang tidak ada atau gagal ditemukan.

Gw juga sudah menutup dua gap metodologi yang tadinya mudah kelewat. Pengujian harus memisahkan **benda tanpa tangan**, **benda yang memicu landmark palsu**, dan **tangan asli yang kehilangan landmark**. Untuk feel Thinman, perbandingan harus memakai fisika keyboard yang sama, lalu menilai salah arah, berhenti, lompat berulang, dan jeda respons, bukan sekadar skor akurasi model. Gw susun ini sebagai revisi R18-01 v0.2.0.

**Riset lanjutannya mengonfirmasi bahwa R18 perlu diperkuat di level deteksi, pemilihan tangan, keputusan gesture, dan kontrol gameplay sekaligus.** Menambah data training saja tidak akan menutup semua celah.

Ada empat hasil yang paling menentukan.

1. **Distraksi benda harus diuji dari keluaran MediaPipe sampai aksi game.** Classifier landmark tidak bisa mengenali benda yang sama sekali tidak menghasilkan landmark. Jika MediaPipe justru menghasilkan landmark palsu, sistem perlu pengujian kewajaran bentuk, konsistensi temporal, dan penolakan aksi. Tidak ada satu pemeriksaan yang menjamin semua benda tertolak.
2. **Low-light harus diuji menggunakan referensi keberadaan tangan yang independen.** DimHand menyediakan sekuens RGB, depth, dan anotasi 3D, tetapi pengujian yang relevan untuk siswa harus menggunakan RGB saja sebagai input model. Depth boleh menjadi referensi evaluasi, bukan kemampuan tambahan yang diam-diam diasumsikan tersedia di webcam siswa.  [hanlingzhan.github.io](https://hanlingzhan.github.io/DimHand/?utm_source=chatgpt.com)
3. **Kontrol Thinman memerlukan koreksi geometri sebelum penambahan smoothing.** Koordinat landmark dinormalisasi terhadap lebar dan tinggi video. Tanpa koreksi aspect ratio, arah diagonal fisik 45° pada video 16:9 dapat terbaca sekitar 60,6°. Ini bisa mengubah zona gerakan.
4. **Keputusan untuk tidak menjalankan gesture saat ambigu harus dievaluasi bersama responsivitasnya.** Pendekatan *selective classification* memang mengenal pilihan menolak prediksi yang tidak cukup tepercaya, tetapi ada trade-off antara banyaknya aksi yang diterima dan risiko salah aksi.  [proceedings.neurips.cc](https://proceedings.neurips.cc/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html?utm_source=chatgpt.com)

## R18-01 v0.2.0 sudah gw susun

**R&amp;D NUI R18-01 v0.2.0**

Markdown • 543 baris • Revisi lengkap dari v0.1.0

[Unduh hasil riset dan penutupan gap (.md)](sandbox:/mnt/data/NUI_R18-01_v0.2.0_Riset_Penutupan_Gap.md)

Dokumen baru mempertahankan isi R18 sebelumnya, sekaligus memperjelas cara meneliti dan membandingkan kandidatnya.

| Area | Penambahan utama |
|--------|--------|
| Distraksi | Empat kelompok skenario benda, tangan lain, objek menyerupai tangan, dan tangan asli yang sulit terdeteksi |
| Low-light | Evaluasi RGB-only DimHand, raw vs CLAHE, recovery, dan pengukuran landmark gagal |
| Recognition | Hard negatives, classifier R17, penolakan prediksi tidak pasti, dan evaluasi *risk–coverage* |
| Thinman | Koreksi aspect ratio, validasi pointing, virtual-key FSM, serta uji lompat dan berhenti |
| Evaluasi | Ground truth independen, protokol A/B, 15 paket eksperimen, dan enam gerbang penelitian G0 sampai G5 |
| Performa | Pemisahan download NUI dan total perjalanan pengguna, RAM, FPS, latency, serta lifecycle kamera |

Ada satu batas pengukuran yang juga sudah gw pertegas. API browser untuk mengukur memori total masih terbatas dan memiliki syarat keamanan tertentu. Jadi R18 sekarang meminta pencatatan metode pengukuran agar angka RAM tidak dibandingkan secara keliru antarbrowser.  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Performance/measureUserAgentSpecificMemory?utm_source=chatgpt.com)

**Status setelah revisi**

(Gap metodologi diperinci) (Webcam belum diuji) (Training belum dilakukan)

Risetnya sekarang lebih siap dijadikan dasar eksperimen, tetapi **belum ada bukti bahwa NUI sudah lebih akurat, tahan semua distraksi, atau memenuhi paket 15 MB**\. Semua itu tetap harus melewati pengujian fisik.

Gw juga tidak mengubah repository, `DECISIONS.md`, model, atau gameplay. R18 tetap dokumen penelitian, bukan keputusan implementasi.

### Saran update WORKING\_STATE

- **Yang berubah\:** R18-01 v0.2.0 dibuat berdasarkan audit source dan riset tambahan, dengan protokol penutupan celah dan gerbang evaluasi.
- **Bagian terdampak\:** R&amp;D NUI, dataset low-light, distraksi, kontrol Thinman, pengujian dan performa browser.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-17 20:07
- 📎 **NUI_R18-01_v0.2.0_Riset_Penutupan_Gap.md** · MD

---

---

## L4-M096 | User | 2026-11-17 20:15:48


message time: 2026-11-17 20:15:48

gini, paket itu di bawah 25mb pas didownload aman, pas runtime jg kalo bisa ga ngelag banget, jadi itu yang paling dioptimize. pls banget di sini prlu lu pahami kalo gw ngerjar exp user yang sangat ok dengan banyak worst case entah itu cam burik, warna kulit user, tempat lowlight apapun itu. lu cari lu riset sampe kea lu nemuin dim multimedia itu, benerang sangat membantu. riset yang bener dan pahamin arah gw daritadi gimana, mdnya lu edit lagi dengan prompt baru gw ini pls maksimal sebelum diimplement, soalnya server gw vram 24gb mah kuenceng banget soalnya, jadi implement ya sangat2 siap

---

---

## L4-M097 | Assistant | waktu tidak ada


Gw revisi R18 dengan prioritas yang lu pertegas. **Download sampai 25 MB boleh, tapi pengalaman siswa saat dipakai harus jadi ukuran keberhasilan utama**, termasuk kamera burik, low-light, variasi warna kulit, distraksi benda, dan kontrol Thinman yang nyaman. Gw akan baca ulang dokumen v0.2.0 beserta keputusan proyek, lalu cari bukti riset tambahan sebelum menyusun MD penggantinya. VRAM server 24 GB gw perlakukan sebagai kapasitas training yang perlu diverifikasi, bukan alasan membuat model browser lebih berat.

Gw nemu kandidat dataset tambahan yang lebih tepat sasaran untuk worst case lu. Selain **DimHand** untuk low-light dinamis, ada **PALM** untuk keragaman bentuk dan warna kulit, **AnyHand** untuk tangan berinteraksi dengan benda/latar kompleks, serta dataset **interaksi game multi-pemain** untuk tangan bersilangan, blur, dan pencahayaan redup. Tapi kualitas bukti dan izin pakainya berbeda, jadi gw akan pisahkan mana yang realistis untuk evaluasi, mana yang hanya kandidat training. Satu hal juga berubah jelas, **batas 25 MB adalah anggaran download, sementara prioritas pertama tetap responsivitas dan stabilitas browser**.

Ada satu temuan yang memperkuat alasan revisinya. Studi tentang segmentasi tangan berbasis MediaPipe menunjukkan pendekatan yang mengikuti warna kulit tetap bisa gagal saat bayangan ekstrem atau **warna latar mirip tangan**, bahkan ketika model warnanya adaptif. Jadi R18 tidak akan menjadikan *skin-color filtering* sebagai solusi utama. Untuk dataset tambahan, gw juga menemukan dua dataset permainan multi-pemain dengan cahaya redup dan occlusion yang lebih dekat ke situasi interaksi nyata, bukan sekadar pose studio.

**R18-01 v0.3.0 sudah gw revisi dengan prioritas utama pengalaman siswa, bukan sekadar mengejar akurasi model.** Dokumen ini menggantikan v0.2.0 secara lengkap dan tetap berstatus R&amp;D sebelum implementasi.

**R&amp;D NUI R18-01 v0.3.0**

Markdown • 742 baris • 17 November 2026

[Unduh R18-01 v0.3.0, UX-First & Worst-Case Research](sandbox:/mnt/data/NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md)

## Apa yang berubah secara substansial?

**1\. Runtime dan pengalaman pengguna menjadi prioritas**

Batas download berubah menjadi **kurang dari 25 MB untuk perjalanan pengalaman pertama**, termasuk aset game dan NUI yang diunduh. Tetapi kelancaran canvas, animasi Momo, gerakan Thinman, RAM, latency, dan kestabilan setelah kamera aktif beberapa menit menjadi fokus optimasi utama.

---

**2\. Worst case diuji jauh lebih lengkap**

Dokumen sekarang memisahkan kamera burik, low-light, backlight, warna kulit dan latar yang serupa, poster atau benda menyerupai tangan, tangan orang lain, occlusion, serta masalah tracking. Ada **12 skenario khusus W01 sampai W12** dengan ground truth dan metrik kegagalan masing-masing.

---

**3\. Dataset riset diperluas**

Selain DimHand, gw menambahkan kandidat **Ego2Hands, PALM, AnyHand, DexYCB**, dan dua dataset interaksi game multi-pemain.

Salah satu temuan paling relevan adalah dataset 47.166 frame interaksi dua sampai empat pemain pada berbagai pencahayaan, termasuk cahaya redup, blur dan bayangan. Dataset tersebut dipublikasikan di Mendeley dengan lisensi CC BY 4.0.  [Mendeley Data](https://data.mendeley.com/datasets/bxr7kx84y6/2?utm_source=chatgpt.com) [chen-si-cs.github.io](https://chen-si-cs.github.io/projects/AnyHand/?utm_source=chatgpt.com) [GitHub](https://github.com/facebookresearch/PALM?utm_source=chatgpt.com)

---

**4\. Kontrol Thinman diperlakukan sebagai masalah UX**

Sudut telunjuk, koreksi aspect ratio, validasi pose, virtual-key FSM, waktu berhenti, lompatan berulang dan transisi fase dimasukkan ke eksperimen. Tujuannya kontrol NUI terasa seperti keyboard tanpa langsung mengubah kecepatan global KAPLAY.

## Ada satu hal yang harus tetap kita bedakan

**VRAM server 24 GB bisa memberi ruang besar untuk eksperimen training, tetapi tidak otomatis membuat model hasilnya ringan di browser siswa.** Kapasitas VRAM juga tidak sendirian menentukan kecepatan GPU. Karena itu dokumen memisahkan kebutuhan training dan biaya inference di perangkat pengguna.

Riset ini juga memasukkan hasil penelitian yang menunjukkan MediaPipe dapat terganggu oleh motion blur, underexposure, dan occlusion. Jadi peningkatan tidak akan dinilai berdasarkan macro-F1 saja, melainkan kemampuan sistem tetap menghasilkan **aksi yang benar dan responsif** dalam kondisi sulit.  [Monash University](https://research.monash.edu/en/publications/robustness-evaluation-in-hand-pose-estimation-models-using-metamo/?utm_source=chatgpt.com)

Dokumen sekarang punya enam tahapan evaluasi `R18-UX0` sampai `R18-UX5`, dari baseline kamera hingga pengujian menyeluruh Bab 1 sampai Bab 3. Semua kandidat harus dibandingkan dengan sistem yang sekarang, termasuk biaya performanya.

**Yang masih belum terbukti** adalah keberhasilan pada webcam siswa, akses semua dataset, penggunaan VRAM aktual, total transfer di bawah 25 MB, dan hasil perbaikan recognition. Belum ada training, perubahan kode, atau deployment baru. Rujukan penelitian tambahan juga tetap dipisahkan dari Dapus resmi proposal.

### Saran update WORKING\_STATE

\- **Yang berubah\:** R18-01 v0.3.0 dibuat sebagai dokumen R&amp;D pengganti. Fokus beralih ke UX-first, target transfer

📦 **Files delivered** · 2026-11-17 20:26
- 📎 **NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md** · MD

---

---

## L4-M098 | User | 2026-11-17 20:28:39


message time: 2026-11-17 20:28:39

kelamaan nunggu ujang setup cli, gw agy aja kali ya langsung ssh, kalo lu liat session lain ada yang audit repo mobile cli biar enak tapi keanya kelamaan. bisa ga ya itu md langsung gw kasih ke agy yang di server, nvidia-smi jg aman

---

---

## L4-M099 | Assistant | waktu tidak ada


**Bisa, lu langsung kasih R18-01 v0.3.0 ke Agy yang jalan di server lewat SSH. Nggak perlu nunggu Ujang selesai setup CLI.** Kalau `nvidia-smi` sudah berhasil di server, kita bisa lanjut dari situ.

Tapi ada batas penting. **MD R18 itu dokumen R&amp;D, bukan instruksi untuk langsung mengganti model produksi.** Agy boleh mulai meneliti, menyiapkan dataset, mengukur baseline, dan menguji training kandidat secara terisolasi. Jangan langsung menyuruhnya menimpa MediaPipe yang dipakai siswa.

Gw sudah baca ulang MD-nya. Isinya memang menetapkan MediaPipe sebagai fondasi, hasil classifier Claude R17 sebagai baseline, download pengalaman pertama **kurang dari 25 MB**, dan prioritas utama kelancaran browser, low-light, distraksi, serta feel gerakan Thinman.

[Ambil MD R18-01 v0.3.0 untuk Agy](sandbox:/mnt/data/NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md)

## Cara paling aman sekarang

Upload MD tadi ke server melalui SSH atau berikan langsung sebagai file ke Agy. Kalau Agy sudah punya akses GitHub, dia bisa membaca source `lustresense/hitl-momo` melalui GitHub MCP. **Training tetap dijalankan di VM, bukan di GitHub MCP.**

Ini pesan pendek yang bisa lu kirim bersama MD.

> **Chat message**
> 
> Baca seluruh dokumen `NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md` sebagai basis R&D NUI terbaru.
> 
> Lanjutkan dari hasil R17, jangan mengulang pekerjaan yang sudah terbukti. MediaPipe harus tetap menjadi fondasi, dengan prioritas utama UX siswa, robustness pada webcam buruk/low-light/distraksi, kualitas gesture, kontrol Thinman yang nyaman, dan total transfer kurang dari 25 MB.
> 
> Gunakan GitHub MCP untuk mengaudit repository `lustresense/hitl-momo` pada commit aktual. Jangan menganggap laporan lama sama dengan kondisi runtime terbaru.
> 
> `nvidia-smi` sudah dilaporkan berjalan. Verifikasi kapasitas GPU dan VRAM bebas, proses aktif, RAM, storage, serta keamanan penggunaan resource sebelum menjalankan eksperimen.
> 
> Mulai dari audit dan baseline R18-UX0. Identifikasi dataset yang benar-benar tersedia, izin penggunaan, artefak classifier R17, serta eksperimen yang feasible di VM.
> 
> Training kandidat boleh direncanakan, tetapi jangan langsung memulai training berat sebelum data, lisensi, dan baseline diverifikasi. Gunakan workspace terisolasi dan jangan mengganggu service produksi.
> 
> Jangan mengubah `main`, deployment, database, gateway, atau konfigurasi service lain. Jangan melakukan cleanup agresif.
> 
> Laporkan terlebih dahulu temuan, blocker, kebutuhan resource, risiko, dan eksperimen pertama yang layak dijalankan. Semua klaim performa harus didukung hasil pengukuran, bukan estimasi.

**Satu hal yang perlu lu perhatikan.** Kalau `nvidia-smi` sudah aman, nggak perlu mengulang troubleshooting GPU dari nol. Tapi pastikan **VRAM bebas**, bukan cuma VRAM total. Jangan sampai job training mengambil memori yang sedang dipakai service lain.

Dan gw nggak akan menunggu setup mobile CLI sebagai prasyarat. Jalur SSH langsung sudah cukup untuk memulai tahap audit dan eksperimen terisolasi.

### Saran update WORKING\_STATE

- **Yang berubah\:** Pengguna mempertimbangkan memakai Agy langsung melalui SSH server karena setup CLI Ujang belum selesai. `nvidia-smi` dilaporkan berhasil oleh pengguna.
- **Bagian terdampak\:** Tooling R&amp;D NUI R18, eksekusi VM, akses GitHub MCP, ketersediaan GPU.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-17 20:29
- 📎 **NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md** · MD

---

---

## L4-M100 | User | 2026-11-17 20:33:23


message time: 2026-11-17 20:33:23

bentar, ini belum gw pasangin mcp server. perlu ga sih dia? gaperlu buat training kah? terus biar yolo gimana ya biar gausah acc2 mulu itu aynya

---

---
