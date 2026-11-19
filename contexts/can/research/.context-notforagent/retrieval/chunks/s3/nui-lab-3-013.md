# NUI Lab 3 | pesan 132-144

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afacbc9-6d4c-83ec-bf1a-02c09c6d5c15
> Source Git blob: f8a59b5787461c4c113edb821fc7d16a53a31fcb

## L3-M132 | User | 2026-11-16 15:34:50


message time: 2026-11-16 15:34:50

1. oke gw lagi baca soal dataset publiknya
2. ini maksudnya apa? gw ga terlalu paham teknis jadi lu harus kasih gw best practicenya banget
3. ambil tangan baru apapun ini maksud gw kalo lagi gaada tangan sama sekali di cam, ya tangan yang baru itu yang dilock. emang ada solusi apa lu bisa lock baca jari orang? lu baca sidik jari? jangan lah anjay. jadi mekanisme locknya biar enak jg ga terlalu ribet, asal di crowd atau latar belakang tangan itu banyak apapun distraksi termasuk ada tangan lain. candidate validation gw ujur gapaham dll parameternya perlu lu jabarin lagi dah.
4. gw bingunug yang B ini maksudnya gimana? adamediapipe handlandmarker bukannya kita udah pake dan gw ada masalah nih, pokoknya tetep based on mediapipe sebagai yang utama krn itu masuk ke judul pa gw, sama soal ipn hands ini apa? dataset yang menguatkan mediapipe atau libr baru?&#x20;
5. soal yang design udah lu jabarin ini kuatkan lagi dengan agumen2 gw barusan, intuitive dan bikin ux sangat enak pokoknya. lu jangan kea jadi user, tapi gimana caranya serve user yang gatau apa2 dan tinggal pake tapi dari segi teknisnya lu lock dan aman. dari sini lu riset lagi dan modify rnd ini, gw baca beberapa aja sisanya gw rasa buat implementasi lu dah, gimana? riset lagi buruan, kalo butuh audit ya audit repo. jangan ubah apapun di repo

---

---

## L3-M133 | Assistant | waktu tidak ada


Gw akan revisi dokumen R&amp;D dengan fokus UX yang lu jelaskan. Aturannya sederhana. Kalau kamera kosong lalu satu tangan muncul, tangan itu otomatis aktif. Kalau tangan aktif hilang, sistem berhenti menggambar, lalu memilih lagi saat situasinya aman, tanpa menyuruh pengguna mengurus parameter lock.

Gw baca ulang dokumen R&amp;D sebelumnya dan source `main`, lalu cek riset MediaPipe dan dataset yang relevan. Repo tetap read-only.

Setelah cek source terbaru, gw bisa memperjelas parameter yang sebelumnya bikin bingung. Angka seperti batas perpindahan tangan `0,18`, rasio ukuran `1,7`, dan timeout `600 ms` itu **aturan buatan aplikasi**, bukan kemampuan atau batas wajib MediaPipe. Justru aturan timeout inilah yang membuat lock bisa macet sampai tombol relock ditekan.

Gw juga sudah pastikan IPN HandS bukan library pengganti MediaPipe. Itu dataset untuk mengukur dan melatih pengenal gerakan, sedangkan MediaPipe tetap mendeteksi 21 titik tangan. Gw masukkan penjelasan nonteknis dan rancangan auto-lock yang baru ke revisi R&amp;D sekarang.

**Gw revisi arah R&amp;D-nya. MediaPipe tetap jadi fondasi utama, dan mekanisme lock harus otomatis tanpa pengenalan identitas orang, sidik jari, atau tombol yang terus-menerus harus ditekan.**

Ada satu koreksi penting dari penjelasan gw sebelumnya. **Kalau kamera benar-benar kosong, lalu satu tangan baru masuk, tangan itu memang seharusnya otomatis diambil sebagai tangan aktif.** Lu nggak perlu membuktikan bahwa itu tangan orang yang sama.

Masalahnya hanya muncul ketika beberapa tangan terlihat bersamaan. Di situ aplikasi perlu memilih dengan hati-hati agar tangan orang lain tidak tiba-tiba menghapus gambar lu.

## 1. Cara lock yang paling masuk akal

**Satu tangan masuk**

Sistem otomatis mengambil tangan tersebut setelah tracking stabil. Cursor muncul, tanpa perlu klik atau kalibrasi manual.

---

**Tangan aktif bergerak**

Sistem mengikuti pergelangan, telapak, ukuran, dan lintasan geraknya. Tangan bisa bergerak ke kiri, kanan, atas, dan bawah frame, tidak dipaksa berada di tengah.

---

**Tangan aktif hilang**

Tinta langsung berhenti. Sistem mencoba menyambungkan tracking yang terputus. Kalau tidak ada tangan lagi, kepemilikan lama dilepas otomatis dan sistem siap menerima tangan baru.

---

**Ada beberapa tangan**

Sistem mempertahankan tangan aktif yang sedang diikuti. Kalau belum ada tangan aktif dan beberapa kandidat sama-sama mungkin, aksi ditahan sementara agar tidak salah menggambar atau menghapus.

Ini bukan fingerprint atau pengenalan orang. Yang diikuti adalah **jejak gerak tangan dari frame kamera sebelumnya ke frame berikutnya**\.

Ada keterbatasan yang perlu lu tahu. Kalau tangan lu hilang dan hanya tangan orang lain yang terlihat, kamera RGB biasa tidak selalu bisa mengetahui bahwa pemiliknya berganti. Karena itu, proteksi utama harus mencakup pencegahan *aksi tak sengaja*, bukan sekadar pemilihan tangan.

## 2. MediaPipe, dataset, dan retraining itu hubungannya apa?

MediaPipe tetap fondasi pendeteksian tangan. Classifier tambahan hanya dipakai kalau terbukti meningkatkan pengenalan gestur.

**IPN HandS bukan library pengganti MediaPipe.** Itu dataset berisi video, landmark yang dikoreksi manusia, dan hasil prediksi MediaPipe pada frame yang sama. Berguna untuk mengukur kesalahan, meneliti tracking, dan melatih pengenal gestur tertentu.  [GitHub](https://github.com/GibranBenitez/IPN-hand?utm_source=chatgpt.com) [mdpi.com](https://www.mdpi.com/2076-3417/15/11/6321?utm_source=chatgpt.com)

Sedangkan HaGRIDv2 menyediakan lebih dari satu juta gambar dari banyak orang dengan variasi background, pencahayaan, jarak, dan pose. Ini kandidat untuk memperkaya data latihan. Tapi bukan berarti mengunduhnya langsung memperbaiki model MediaPipe yang sekarang.  [GitHub](https://github.com/hukenovs/hagrid/?utm_source=chatgpt.com)

Untuk proyek lu, urutannya adalah **perbaiki tracking dan rules dahulu, baru latih classifier ringan bila masih diperlukan**\. Google sendiri masih menyediakan jalur kustomisasi gesture, tetapi Model Maker sudah deprecated dan tidak aktif dipelihara, jadi jangan jadikan itu satu-satunya fondasi training.  [developers.google.cn](https://developers.google.cn/edge/mediapipe/solutions/vision/gesture_recognizer/index?authuser=3&utm_source=chatgpt.com) [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/model_maker?utm_source=chatgpt.com)

## 3. Parameter dan UX yang gw sarankan

| Bagian | Pengalaman pengguna | Penanganan sistem |
|--------|--------|--------|
| Kamera aktif | Langsung pakai tangan | Deteksi dan akuisisi otomatis |
| Cursor | Muncul saat tangan aktif terbaca | Terpisah dari status pinch |
| Pinch | Tinta keluar ketika benar-benar pinch | Hysteresis dan validasi pose |
| Tangan hilang | Tidak perlu pencet relock | Hentikan tinta, cari ulang otomatis |
| Tangan baru | Otomatis bisa dipakai | Pastikan satu kandidat stabil |
| Banyak tangan | Tidak salah menggambar | Pertahankan track aktif, tahan aksi saat ambigu |
| Gagal berulang | Petunjuk singkat | Manual recovery hanya fallback |

Parameter seperti toleransi perpindahan pergelangan `0,18`, perubahan ukuran `1,7`, dan timeout `600 ms` yang ada di kode sekarang **belum gw anggap ideal**\. Semuanya harus dibandingkan menggunakan rekaman gerakan tangan yang sama.

Prinsip terbaiknya adalah **konfigurasi kompleks ada di engineering, bukan dilempar kepada siswa**\. Pengguna cukup melihat cursor, menggambar dengan pinch, dan mendapatkan pemulihan otomatis ketika tracking terganggu.

## 4. Revisi R&amp;D sudah gw buat

**R&amp;D NUI Lab, Revisi UX dan Auto-Lock**

Markdown • 257 baris • Pengganti lengkap dokumen R&amp;D sebelumnya

[Download RND revisi lengkap](sandbox:/mnt/data/RND-DATASET-ROBUST-GESTURE-LOCK-2026-11-16-REVISI-UX.md)

Dokumennya sudah mencakup penjelasan nonteknis, audit parameter aktual `main`, state machine auto-lock yang diperbaiki, penanganan crowd, dataset, strategi retraining, dan skenario worst-case sebelum implementasi.

**Rekomendasi kerja gw tetap P0 observabilitas, P1 auto-relock, P2 perbaikan pinch dan tiga jari, baru P3 eksperimen dataset dan training.** Training jangan didahulukan karena banyak kegagalan yang lu alami bisa berasal dari pengaturan interaction pipeline, bukan modelnya.

Gw belum mengubah GitHub, model `.task`, atau kode NUI Lab. Hasil riset eksternal juga tetap bahan R&amp;D, bukan otomatis sitasi proposal.

⚠️ Kandidat perubahan **keputusan** terdeteksi

- Ringkasan: Auto-lock tangan baru setelah kamera kosong, tanpa relock manual pada penggunaan normal, dan tanpa identifikasi biometrik.
- Entri lama yang mungkin terdampak: Mekanisme `FullFrameHandLock` yang sekarang memerlukan relock manual setelah status `lost`\.
- Status bukti: keputusan eksplisit untuk perilaku yang diinginkan, implementasi dan parameter belum disahkan.
- Tindakan: `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

Saran update WORKING\_STATE

- Yang berubah: Audit read-only menguatkan kebutuhan auto-relock tanpa friksi dan prioritas perbaikan rules sebelum training. R&amp;D revisi UX sudah dibuat.
- Bagian terdampak: NUI Lab, hand ownership, gesture classifier, benchmark, dan dataset R&amp;D.
- Tindakan: ketik `UPDATE STATE` untuk versi lengkap pengganti WORKING\_STATE.md.

📦 **Files delivered** · 2026-11-16 15:37
- 📎 **RND-DATASET-ROBUST-GESTURE-LOCK-2026-11-16-REVISI-UX.md** · MD

---

---

## L3-M134 | User | 2026-11-16 16:24:58


message time: 2026-11-16 16:24:58

ini session sebelumnya, gw mau lanjut di sini krn limit. nah gw mau lanjut terakhir, udah sempet lu push sih di repo gw coba lu cek audit apa aja dan sesuai kah dengan prd rdn yang lu buat itu?

---

---

## L3-M135 | Assistant | waktu tidak ada


Gw audit read-only dari ZIP sesi sebelumnya dan source GitHub terbaru. Gw bakal cocokkan PRD/R&amp;D dengan file yang benar-benar dipush, lalu pisahkan mana yang sudah ada di kode, mana yang baru punya test, dan mana yang belum terbukti di webcam. Repo nggak akan gw ubah.

---

---

## L3-M136 | Assistant | waktu tidak ada


Gw sudah cocokkan ZIP dengan GitHub. Ternyata sesi lama berhenti saat melaporkan kandidat implementasi, tapi **commit `0.22.0-alpha` memang sudah ada di `main`**. Ada 23 file berubah, termasuk auto-reacquire, diagnostik pinch, aturan tiga jari eksperimental, dan tes. Sekarang gw cek apakah perilaku kodenya betul-betul memenuhi PRD, bukan cuma mengikuti isi changelog.

Ada dua gap yang mulai jelas. Pertama, **P0 sampai sebagian P2 memang dipush**, tetapi training dataset, gesture swipe, dan validasi webcam belum dikerjakan. Kedua, hand lock baru masih bisa bertahan di status `lost` kalau tangan lain terus terlihat di frame. Itu aman dari salah ambil tangan, tetapi belum sepenuhnya memenuhi target UX yang gampang dipakai di tempat ramai.

Gw juga menemukan mode classifier eksperimen langsung ON saat membuka lab, padahal dokumentasinya menyebut opt-in. Gw cek konsekuensinya sebelum menutup audit.

**Udah gw audit. NUI Lab versi `0.22.0-alpha` memang sudah dipush ke `main`, dan sebagian besar implementasi P0 sampai P2 sesuai R&amp;D revisi kita. Tapi belum semuanya terpenuhi.**

Ada **dua gap desain yang perlu dibenahi** dan beberapa pengujian penting yang belum dilakukan. Jadi statusnya **PARTIAL**, bukan implementasi yang sudah terbukti akurat.

**GitHub terbaru** (Commit terverifikasi)

# 0.22.0-alpha

Branch `main` • Commit `f19b04d` • 23 file berubah dari 0.21.0-alpha

[Lihat commit implementasi NUI Lab](https://github.com/lustresense/hitl-momo/commit/f19b04da49caa8cace7faf983b26e938400f1399)

## 1. Kecocokan dengan R&amp;D sebelumnya

| Rencana | Hasil audit source | Status |
|--------|--------|--------|
| P0, diagnostik pinch, jumlah jari, status lock dan alasan penolakan | Sudah ditambahkan ke NUI Lab | (Ada di kode) |
| P1, auto-lock setelah kamera kosong | Sudah ada mekanisme auto-reacquire | (Parsial) |
| P1, mencegah tangan lain mengambil alih | Ada pemilihan track dan penolakan kondisi ambigu | (Belum tervalidasi) |
| P1, cursor muncul tanpa harus pinch | Sudah memakai pipeline cursor terpisah dari tinta | (Ada di kode) |
| P2, perbaikan pinch dan tiga jari | Ada classifier eksperimental khusus lab | (Ada di kode) |
| Undo/Redo swipe | Belum diterapkan, mapping lama dipertahankan | Belum dikunci |
| P3, dataset dan retraining | Belum ada dataset collector maupun model hasil training | Belum dikerjakan |
| P4, benchmark webcam dan worst-case | Tes sintetis tersedia, belum ada bukti browser/webcam nyata | Belum diuji |

## 2. Dua gap yang gw temukan

### Gap 1. Hand lock masih bisa macet saat ada tangan lain

Source `lab-hand-lock.ts` sekarang sudah bisa melepas lock lama jika kamera benar-benar kosong selama rentang tertentu.

Tetapi bayangkan kondisi berikut.

1. Tangan lu aktif dan sedang menggambar.
2. Tangan lu keluar frame.
3. Tangan orang lain masih terlihat di belakang.
4. Sistem menolak tangan lain tersebut, sesuai aturan anti-takeover.
5. Namun karena kamera tidak pernah benar-benar kosong, lock lama bisa tetap berstatus `lost`\.

**Artinya, auto-relock belum sepenuhnya menyelesaikan pengalaman menggunakan NUI Lab di lingkungan ramai.**

Perlu mekanisme pemulihan yang aman ketika kandidat pengganti terus terlihat, tanpa asal mengambil tangan lain.

### Gap 2. Mode eksperimen langsung ON

Di `NuiLabPage.tsx`, source menggunakan `useState(true)` untuk mode eksperimental.

Akibatnya, saat lu membuka halaman Gesture atau Canvas, aturan pinch dan tiga jari yang masih eksperimen sudah aktif.

Padahal untuk membuktikan peningkatan, kita perlu membandingkan baseline dan eksperimen secara konsisten. Gw lebih menyarankan lab mulai dari baseline, atau paling tidak status eksperimen dibuat sangat jelas dan disertakan dalam hasil pengukuran.

## 3. Yang belum terbukti

Dokumentasi commit menyebut **12 dari 12 skenario lock sintetis PASS di pengujian JavaScript V8**\. Itu laporan dari sesi implementasi sebelumnya, bukan hasil eksekusi ulang dalam audit ini.

Gw juga periksa GitHub Actions dan status commit. Tidak ada hasil workflow atau status check yang ditemukan untuk commit tersebut.

Jadi belum ada bukti bahwa\:

- Typecheck, lint, Vitest, dan production build lulus.
- MediaPipe berhasil mengambil kembali tangan pada webcam fisik.
- Pinch lebih akurat daripada versi sebelumnya.
- Tiga jari lebih sering dikenali pada rotasi dan kondisi latar sulit.
- Tidak terjadi salah ambil tangan saat orang lain masuk frame.
- Latency, jitter, dan ukuran download memenuhi target.

**Penting juga, classifier eksperimen belum menjadi custom trained model.** Saat ini masih aturan geometris yang diperbaiki. MediaPipe Hand Landmarker utama belum diubah.

## 4. Dokumen audit lengkap

Gw buat MD yang mencocokkan setiap tahapan R&amp;D dengan source GitHub, termasuk path terkait, risiko yang tersisa, dan pengujian yang harus dijalankan Ujang.

**Audit Implementasi NUI Lab 0.22.0-alpha**

Traceability PRD/R&amp;D, temuan source, gap dan langkah QA

[Download hasil audit Markdown](sandbox:/mnt/data/AUDIT_IMPLEMENTASI_NUI_LAB_0.22.0_ALPHA_2026-11-16.md)

## 5. Prioritas setelah audit

Gw menyarankan **jangan langsung lompat ke training dataset dulu**\. Ada alasan teknisnya. Kita belum punya bukti apakah kegagalan pinch dan tiga jari berasal dari MediaPipe, classifier, atau penguncian tangan. Menambah dataset sekarang bisa membuat kita melatih bagian yang salah.

Langkah paling konkret sekarang adalah menyuruh Ujang menjalankan quality gates dan menguji build `f19b04d` melalui tunnel, lalu lu cobain langsung khusus kasus lock, pinch, tiga jari, dan distraksi. Dari hasil itu baru kita benahi dua gap tadi dan putuskan apakah retraining benar-benar diperlukan.

**Repo tidak gw ubah selama audit ini.**

---

Saran update WORKING\_STATE

- **Yang berubah\:** Audit commit `f19b04d` versi `0.22.0-alpha` menemukan P0 dan sebagian P1/P2 sudah ada di source, dengan dua gap UX dan belum ada bukti runtime.
- **Bagian terdampak\:** NUI Lab, auto-reacquire, classifier eksperimental, pengujian Ujang, dan R&amp;D dataset.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-16 19:15
- 📎 **AUDIT_IMPLEMENTASI_NUI_LAB_0.22.0_ALPHA_2026-11-16.md** · MD

---

---

## L3-M137 | User | 2026-11-16 19:22:04


message time: 2026-11-16 19:22:04

lu udah baca zip session sebelumnya kan? terus kenapa itu p1 ada yang masih belum? terus pertanyaan gw belum kejawab sih, jadi dataset itu apa maksudnya? apakah modelnya masih mediapipe dll soalnya tentang judul pa gw ah anjing harusnya ada di session sebelumnya yang gw zip, ada ga pembahasan itu? di zip jg ada pembahasan kenapa gw suruh lu bikin prd anjing krn gw udah cobain jancok jangan ngeyel. soul-session.md itu harus lu baca di session ini. selalu.

---

---

## L3-M138 | Assistant | waktu tidak ada


Lu bener, jawaban gw tadi belum nyambung dengan alasan lu bikin PRD. Gw bakal buka ulang ZIP percakapan asli, bukan mengandalkan ringkasan sesi, dan baca `SOUL-SESSION.md` beserta konteks proyek. Habis itu gw luruskan kenapa P1 gw nilai parsial, apa fungsi dataset, dan apakah MediaPipe tetap jadi model utama.

---

---

## L3-M139 | User | 2026-11-16 19:23:45


message time: 2026-11-16 19:23:45

sorry bukan prd, rnd. nih lu kalo gabisa liat gw kasih ulang dari sesison sebelumnya

---

---

## L3-M140 | Assistant | waktu tidak ada


**Iya, yang lu maksud R&amp;D, bukan PRD. Dan lu nggak perlu kirim ulang ZIP-nya.** Gw sudah buka dan periksa berkas yang tersedia di sesi ini, termasuk\:

- `ChatGPT_Cabang-NUI-Lab_20261116-1623.zip`
- `ChatGPT_Cari-Alternatif-MediaPipe-Hands_20261115-0915.zip`
- `SOUL-SESSION.md`
- Riwayat pembahasan R&amp;D, auto-lock, dataset, dan instruksi `gas eksekusi`\.

Ada tiga hal yang perlu gw luruskan dari jawaban sebelumnya.

### 1. R&amp;D itu memang dibuat karena lu sudah mencoba NUI Lab

Di ZIP, lu sudah menjelaskan bahwa dengan **pencahayaan depan yang bagus**, deteksi lumayan, tetapi masih ada masalah pinch yang tidak menghasilkan tinta, tiga jari yang gagal dikenali, dan hand lock yang memerlukan tombol ulang.

Jadi keliru kalau gw memperlakukan seluruh pengujian webcam sebagai sesuatu yang belum pernah lu lakukan.

Yang **belum terbukti** adalah apakah *perbaikan versi `0.22.0-alpha`* sudah menyelesaikan masalah tersebut pada webcam nyata. Itu berbeda.

### 2. Penilaian P1 gw sebelumnya perlu dikoreksi

Di R&amp;D revisi, permintaan lu jelas.

**Kamera kosong → satu tangan masuk → otomatis lock. Tangan hilang → recovery otomatis. Banyak tangan ambigu → jangan sembarangan ambil alih.**

Berdasarkan audit source `0.22.0-alpha`, mekanisme auto-acquire setelah kamera kosong sudah ditambahkan.

Jadi kasus tangan pengganggu yang terus terlihat **bukan otomatis bukti P1 gagal**\. Menahan aksi saat kondisi ambigu justru sesuai tujuan anti-distraksi lu.

Penilaian yang lebih tepat adalah **P1 sudah diimplementasikan pada level source untuk skenario utama, tetapi belum tervalidasi pada webcam nyata dan masih memiliki edge-case UX yang perlu dievaluasi**\.

### 3. MediaPipe tetap model utama PA lu

Ini tidak berubah.

**Kamera → MediaPipe Hand Landmarker → 21 titik tangan**

**Gesture classifier**

Aturan sekarang, atau model ringan hasil training jika terbukti lebih baik

**Cursor, tinta, Undo, Redo, Hapus**

Dataset seperti IPN HandS dan HaGRID bukan pengganti MediaPipe. Itu **bahan pelatihan dan evaluasi**\. Jadi kalau nanti kita melatih classifier gestur dari 21 titik MediaPipe, fondasi deteksi tangan proyek lu tetap MediaPipe.

Satu hal penting lagi, **ZIP sesi `Cabang-NUI-Lab` berakhir setelah perintah `gas eksekusi` dan laporan kandidat source P1/P2**\. Bukti bahwa perubahan kemudian benar-benar dipush berasal dari inspeksi GitHub, bukan dari ZIP itu sendiri.

Mulai sekarang gw pakai `SOUL-SESSION.md` sebagai konteks wajib tambahan untuk pekerjaan NUI di sesi ini, setelah `SOUL.md`, `DECISIONS.md`, dan `WORKING_STATE.md`\.

**Posisi kerja kita sekarang tetap audit implementasi `0.22.0-alpha` terhadap R&amp;D yang sudah lu minta eksekusi, bukan mengulang brainstorming atau mempertanyakan lagi alasan lu membuat R&amp;D.**

---

---

## L3-M141 | User | 2026-11-16 19:29:16


message time: 2026-11-16 19:29:16

yaudah lu lakuin yang lu harus lakuin, dah.

---

---

## L3-M142 | Assistant | waktu tidak ada


Gw lanjutkan eksekusi dari audit terakhir. Fokus gw menutup gap auto-relock dan konsistensi classifier di NUI Lab, mempertahankan MediaPipe sebagai fondasi, lalu memverifikasi hasilnya. Gw baca ulang `SOUL-SESSION.md`, R&amp;D revisi, dan aturan repo dulu supaya perubahan nggak merusak mapping gesture atau gameplay yang sudah benar.

Dari kode terbaru, auto-lock setelah kamera benar-benar kosong ternyata **sudah sesuai R&amp;D**, dan menahan kandidat ketika masih ada tangan lain merupakan perlindungan yang memang lu minta. Jadi gw nggak akan “memperbaiki” itu dengan asal mengambil tangan orang lain.

Gap yang nyata sekarang adalah mode eksperimen yang otomatis aktif tetapi didokumentasikan sebagai opt-in, serta belum adanya bukti tes eksekusi. Gw lanjut buat koreksi terarah dan regression test. Swipe dan retraining tetap nggak gw nyalakan karena mapping serta hasil modelnya belum dikunci.

Koreksi kode dan tes regresinya sudah gw siapkan. Perubahannya sengaja kecil. Lab sekarang dirancang mulai dari baseline, aturan eksperimen baru aktif kalau dipilih, dan tombol pilih ulang hanya muncul ketika recovery memang relevan. Logika auto-lock yang sudah aman dari pengambilalihan tangan lain tetap gw pertahankan.

Karena sandbox ini nggak bisa menjalankan build monorepo lengkap atau webcam fisik, gw akan taruh hasilnya di branch review terpisah. `main` nggak gw geser tanpa quality gates yang dibutuhkan repo.

**Gw sudah eksekusi koreksi NUI Lab berdasarkan audit `0.22.0-alpha` dan R&amp;D lu.** Hasilnya sudah gw push ke GitHub sebagai **`0.22.1-alpha`**, tetapi sengaja dalam draft PR supaya Ujang bisa menjalankan quality gates sebelum perubahan masuk `main`\.

**NUI Lab 0.22.1-alpha**

Commit `f96dfd7` • 14 file berubah • Draft PR \#5

[Lihat perubahan dan draft PR di GitHub](https://github.com/lustresense/hitl-momo/pull/5)

## Yang gw kerjakan

| Perbaikan | Hasil |
|--------|--------|
| Mode classifier | Lab mulai dari **baseline game**\. Eksperimen baru aktif setelah toggle dinyalakan |
| Hand lock | Mekanisme auto-lock yang sudah benar dipertahankan, termasuk pencegahan salah ambil tangan |
| Tombol relock | Hanya muncul ketika recovery memerlukan intervensi |
| Informasi tracking | Pesan dibedakan antara tangan hilang sementara dan tangan lain yang tidak cocok |
| Regression test | Ditambah pengujian pergantian mode serta auto-reacquire ketika interval kosong terlewati |

**MediaPipe tetap model utama.** Mapping pinch Coret, lima jari Hapus, satu jari Undo, dua jari Redo tidak gw ubah. Dataset training dan swipe juga belum gw aktifkan karena belum ada bukti evaluasi atau keputusan yang cukup.

## Status GitHub

- `main` tetap di commit `f19b04d`, versi `0.22.0-alpha`\.
- Branch QA baru adalah `nui-lab-qa-0.22.1`\.
- Perbaikan berada di commit `f96dfd7`\.
- Draft PR sudah dibuka, **belum di-merge atau di-deploy**\.

Gw juga periksa status GitHub. Belum ada hasil workflow atau pemeriksaan CI untuk commit baru, jadi **belum boleh disebut lulus runtime**\.

Langkah konkret berikutnya adalah Ujang checkout branch QA, menjalankan version check, typecheck, lint, Vitest, build, lalu menguji kamera melalui tunnel dev. Panduannya sudah ada di repository.

[Handoff QA lengkap untuk Ujang](https://github.com/lustresense/hitl-momo/blob/nui-lab-qa-0.22.1/frontend/implementation/docs/execution/NUILAB_BASELINE_REVIEW_2026-11-16.md)

---

Saran update WORKING\_STATE

- **Yang berubah\:** Koreksi NUI Lab `0.22.1-alpha` sudah dipush ke branch QA dan draft PR \#5. `main` belum berubah.
- **Bagian terdampak\:** Mode classifier NUI Lab, UI hand recovery, regression test, dan workflow verifikasi Ujang.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L3-M143 | User | 2026-11-16 19:49:18


message time: 2026-11-16 19:49:18

sekarang gue mau lo baca juga zip yang gue kasih. Jadi, ada dua zip. Lagi, zip yang gue kasih tadi itu zip untuk branch pertama, cabang chat pertama. Dan chat pertama juga gue kasih ke lo, gue ganti namanya. Jadi lo lihat runtutan working state dan runtutan decisions.md dari semua chat, dari dua chat itu. Apakah udah ditulis di decisions.md? Kalau belum lo masukin, dan kalau ada konflik, lo solve berdasarkan yang terbaru gue bilang. Sama yang barusan lo kerjain ini apakah tercatat juga di decisions.md? Nah buat working state lo lihatlah dua chat itu sama chat kita barusan, baru lo bikin working state.md dan dua-duanya kirim ke sini. Jadi decisions.md dan working state.md kirim ke gue. Bedanya decisions.md ini lo beneran combine dari yang ada di project context, sama yang ada di dua chat zip itu, termasuk chat zip. Oh gue lupa deh, zip yang gue kasih itu harusnya chat zip untuk yang kedua, gue kasih yang pertama. Nah decisions.md-nya itu lo cek dulu yang pertama, sumber pertama, source of truth itu yang dari repo, yang di context chat, folder context chat. Baru lo lihat di zip pertama, zip yang gue kasih tadi, sama chat ini. Nah lo combine. Bukan lo combine, lo tambahin yang belum ada mana. Jadi runtut gitu loh. Meskipun ada tapi tidak dipakai gitu-gitu. Pokoknya harus solve juga konfliknya. Tapi decisions.md-nya jangan langsung di-push ke repo. working state.md sama decisions.md-nya kirim ke gue. Baru gue lihat. Lo laporin juga apakah sudah sangat rapi. Harusnya udah sangat rapi ya. Baru dimasukin ke repo kalau gue bilang gas. jadi yang pertama zip nui lab ini, baru zip tadi yang cabang nui lab, baru chat lu, itu urutannya

---

---

## L3-M144 | Assistant | waktu tidak ada


Gw akan rekonsiliasi dalam urutan yang lu tetapkan. `DECISIONS.md` dari `contexts/can` di GitHub jadi basis, lalu ZIP NUI Lab pertama, ZIP Cabang NUI Lab kedua, dan terakhir chat kita sekarang. Gw cek juga versi Project Context supaya riwayat yang cuma ada di sana nggak hilang.

Hasilnya dua file Markdown lengkap untuk lu review, bukan patch dan bukan push. Konflik akan gw tulis beserta alasan memilih keputusan terbaru.

Sumbernya sudah kebaca. Dua ZIP ternyata punya **banyak riwayat yang sama**, jadi nggak boleh dianggap dua rangkaian keputusan independen. ZIP NUI Lab pertama berisi 65 pesan pengguna sampai 16 November pukul 10.35, sedangkan ZIP Cabang melanjutkan sampai instruksi `gas eksekusi` pukul 15.52.

Di repo, `DECISIONS.md` sudah mengimpor histori Project Context lama. Yang masih perlu direkonsiliasi terutama keputusan NUI Lab 16 November dan status teknis sesudah commit `0.22.0-alpha` serta draft PR `0.22.1-alpha`. Gw cek konflik statusnya satu per satu sebelum menyusun kedua file.

Konflik terpenting sudah ketemu. `DECISIONS.md` repo masih menandai mapping Card 1 dan Card 3 sebagai **belum dikunci**, padahal di ZIP lu sudah tegas memilih Card 1 telunjuk dan mempertahankan Hapus lima jari pada `0.17.1-alpha`\. Repo juga sudah mengunci wake Momo lewat kamera siap, jadi keputusan lambaian yang lebih lama nggak boleh dihidupkan lagi.

Gw akan mempertahankan ID dan riwayat lama, lalu menulis koreksi terbaru sebagai entri baru. R&amp;D dataset dan aturan eksperimen nggak akan gw sulap menjadi keputusan model yang sudah terlatih.

---
Powered by [AI Exporter](https://saveai.net)

---
