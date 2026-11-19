# NUI Lab 3 | pesan 127-131

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afacbc9-6d4c-83ec-bf1a-02c09c6d5c15
> Source Git blob: f8a59b5787461c4c113edb821fc7d16a53a31fcb

## L3-M127 | Assistant | waktu tidak ada


Audit source selesai. Ada perubahan NUI yang memang sudah siap dipindahkan dari `ujang-monorepo`, termasuk **full-frame hand lock**, indikator gestur, cursor menggambar, smoothing, dan tes sintetis. Gw pertahankan 13 commit gameplay yang sudah lebih maju di `main`, lalu integrasikan hanya file NUI yang relevan. Mekanisme lock ini mengunci satu *track* tangan, bukan mengenali identitas orang secara biometrik. Saat dua tangan ambigu, input harus berhenti, bukan asal pindah tangan.

Integrasi yang gw siapkan memakai `main` sebagai basis, bukan menimpa `main` dengan snapshot `ujang-monorepo`. File gameplay baru tetap dipertahankan. Koreksi Hapus lima jari, full-frame lock khusus lab, tiga route utama, serta dokumentasi Ujang sudah masuk paket perubahan. Gw sedang verifikasi daftar file dan commit ke `main`; hasil webcam tetap perlu diuji Ujang di tunnel.

**Gw temukan masalah utamanya. NUI Lab sebenarnya sudah dikembangkan lebih jauh di `ujang-monorepo`, tetapi belum seluruhnya masuk `main`\.** Kedua branch sekarang divergen, jadi menyalin atau merge secara buta berisiko menimpa perubahan lain.

Hasil audit GitHub saat ini menunjukkan

- `main` berada di `6e89a47`, versi `0.19.1-alpha`\.
- `ujang-monorepo` berada di `4d9ebb0`, versi `0.20.0-alpha`\.
- Branch `nui-lab` **sudah tidak ditemukan** di GitHub. Jadi tidak perlu dihapus lagi.

Gw juga menemukan kesalahan mapping di source `main`\. Komentarnya masih mengizinkan kepalan sebagai penghapus pada canvas utama. Source `ujang-monorepo` sudah mengoreksinya. **Kepalan tidak boleh menghapus. Lima jari untuk Hapus, pinch untuk Coret, satu jari Undo, dan dua jari Redo.** Koreksi ini harus konsisten di game dan NUI Lab.

(Push ke main berhasil)

**NUI Lab sekarang sudah gw integrasikan ke `main`, bukan lagi branch eksperimen terpisah.** Commit dan HEAD GitHub sudah gw verifikasi.

HASIL IMPLEMENTASI

# 0.21.0-alpha

Commit `8bafb4d` • 38 file berubah

[Lihat source terbaru di main](https://github.com/lustresense/hitl-momo/tree/main)

[Dokumentasi handoff Ujang](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/docs/execution/NUILAB_MAIN_HANDOFF_2026-11-16.md)

## Yang sudah masuk

| Komponen | Hasil source |
|--------|--------|
| `/nui-lab` | Hub eksperimen |
| `/nui-lab/gesture` | Deteksi gestur, landmark overlay, indikator dan status hand lock |
| `/nui-lab/canvas` | Canvas, kamera kiri bawah, tools kanan, Momo dan cursor menggambar |
| `/nui-lab/diagnostics` | Diagnostik lama tetap tersedia |
| Gesture Hapus | Lima jari, bukan kepalan |
| Hand tracking | Full-frame hand lock khusus lab, dengan penanganan status ambigu dan relock |
| Gameplay | Source gameplay yang lebih baru di `main` dipertahankan |

**Batas penting.** Area deteksi lab tidak lagi dibatasi ROI sekitar wajah. Tapi MediaPipe tetap harus bisa melihat landmark tangan. Jari yang keluar frame, blur berat, atau tertutup bisa gagal. Lock juga bukan pengenal identitas biometrik.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker?utm_source=chatgpt.com)

Status pengujian masih **STATIC\_ONLY / NOT\_TESTED**\. Source dan tes sintetis sudah berada di GitHub, tetapi gw belum menjalankan build, webcam fisik, atau tunnel.

## Sekarang kirim ke Ujang

> **Chat message**
> 
> Ujang, NUI Lab sudah diintegrasikan langsung ke `main`.
> 
> Commit: `8bafb4d0ed97b85c0c4bfd87b177a2db103e025f`
> Versi: `0.21.0-alpha`
> 
> Sekarang deployment tunnel dev harus memakai `main`, bukan snapshot lama `ujang-monorepo`.
> 
> Baca `AGENTS.md`, `contexts/can/AGENTS.md` dan `frontend/implementation/docs/execution/NUILAB_MAIN_HANDOFF_2026-11-16.md`.
> 
> Periksa dan backup working tree dulu, lalu fetch dan pull `main` secara aman. Jangan reset atau menimpa pekerjaan lokal.
> 
> Jalankan version check, npm ci, typecheck, lint, Vitest, production build dan smoke test. Setelah quality gates lulus, deploy ke tunnel dev seperti workflow sebelumnya.
> 
> Verifikasi `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, `/nui-lab/diagnostics`, termasuk direct refresh.
> 
> Khusus kamera, uji ujung kiri/kanan/atas/bawah, tangan depan wajah, dua tangan, hand lock/relock, low-light, backlight, dan gesture drawing yang sama dengan game.
> 
> Mapping wajib adalah pinch Coret, lima jari Hapus, satu jari Undo, dua jari Redo. Kepalan tidak menghapus.
> 
> Kirim SHA deployed, URL tunnel, dan hasil PASS/FAIL. Jangan mengubah gameplay di luar scope NUI Lab.

---

Saran update WORKING\_STATE

- **Yang berubah\:** NUI Lab dipindahkan ke `main` versi `0.21.0-alpha`, commit `8bafb4d`\. Branch `nui-lab` sudah tidak ditemukan saat audit.
- **Bagian terdampak\:** GitHub workflow, NUI, gesture mapping, hand lock, routing frontend, deployment Ujang.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L3-M128 | User | 2026-11-16 14:38:32


message time: 2026-11-16 14:38:32

bisa ga di nui lab ini gw retrain data2 gitu biar mediapipe sangat akurat? terus gini, undo dan redo itu pake geser. misal undo kan peace sign, nah itu peace signnya harus geser ke kiri gitu lah, terus ini kadang tiga jari tapi ga kedeteksi sama apa ya parameter kunci tangannya gimana ya? kok ada kunci tangan gitu dan harus dipencet lagi biar tangan gw ga kekunci. kita diskusi dulu aja, terus jadi apa ya gitu dah planning dulu sama gw sebelum implement, sama biar jaari selalu kedeteksi aman gitu pas ada objek distraksi sekitar sama tangan gw pinch itu kadang ga kedetek munculin tinta. jadi cursor muncul kalo ada tangan(kalo di canvas), dan tinta muncul kalo pinch kedeteeksi. nah itu lah lu riset audit tanpa ubah apapun. gw mau audit mmendalam cari di internet dll github2 gitu biar mediapipe sangat akurat, inii gw cobanya dengan penerangan depan yang sangat oke jadi kea lumayan gitu

---

---

## L3-M129 | Assistant | waktu tidak ada


Gw audit read-only dulu, tanpa commit, push, atau perubahan file repo. Gw akan cek pipeline NUI Lab dan gesture game yang sekarang, lalu bandingkan dengan dokumentasi MediaPipe, riset hand tracking, dan masalah serupa di GitHub/komunitas. Fokusnya apakah retraining benar-benar membantu, kenapa pinch dan tiga jari gagal, serta bagaimana hand lock dan gesture geser seharusnya dirancang.

Temuan yang paling menjelaskan pengalaman lu sudah kelihatan. Di NUI Lab, lock dibuat dari posisi pergelangan dan ukuran tangan. Kalau tangan hilang lebih dari **600 ms**, statusnya bisa tetap `lost` sampai lu menekan relock. Itu pilihan safety di kode, bukan kewajiban MediaPipe. Selain itu, pinch perlu melewati klasifikasi dan **dua frame pinch berturut-turut** sebelum tinta mulai, jadi bisa gagal walaupun cursor sempat terlihat. Gw sedang pisahkan mana yang bisa dibenahi lewat logic, mana yang benar-benar butuh data training.

Riset luar repo menguatkan dua hal. Google menyediakan jalur melatih **custom gesture recognizer** dari dataset, tetapi itu tidak otomatis melatih ulang model pencari 21 landmark tangan. Dokumentasi Google juga menandai MediaPipe Model Maker sebagai tidak lagi aktif dipelihara. Jadi arah yang lebih masuk akal adalah menjadikan NUI Lab alat diagnosis dan pengumpulan sampel, sementara keputusan retraining diambil setelah ada data kegagalan nyata.

Untuk Undo/Redo, gw juga menemukan konflik mapping. Kode game sekarang memakai satu jari untuk Undo dan dua jari untuk Redo, sedangkan contoh baru lu menyebut peace sign untuk Undo. Di rencana nanti gw pisahkan dua alternatif supaya kita nggak diam-diam mengubah kontrol yang sudah ada.

**Bisa, lu bisa mengembangkan NUI Lab menjadi tempat mengumpulkan data dan melatih pengenal gestur yang lebih akurat. Tapi retraining bukan solusi pertama yang gw rekomendasikan.** Dari audit source dan dokumentasi MediaPipe, ada beberapa masalah di logic aplikasi yang perlu dibenahi lebih dahulu.

Gw sudah cek `main` pada commit `8bafb4d`, versi `0.21.0-alpha`\. **Audit ini read-only. Tidak ada file, branch, commit, maupun konfigurasi GitHub yang gw ubah.**

## 1. Hasil audit awal

| Masalah yang lu alami | Temuan di source | Penilaian |
|--------|--------|--------|
| Tangan terkunci dan harus klik lagi | `FullFrameHandLock` bisa tetap berstatus `lost` setelah melewati 600 ms | Masalah desain recovery |
| Pinch terlihat tetapi tinta tidak keluar | Pinch memakai batas rasio tertentu, lalu perlu 2 frame pinch berurutan untuk mulai menggambar | Perlu audit classifier dan pen-start tinta |
| Tiga jari sering tidak dikenali | Aturan menuntut telunjuk, tengah, manis lurus, kelingking terlipat, jempol tidak terbuka | Terlalu bergantung pada geometri tertentu |
| Undo/Redo | Saat ini cukup menahan pose satu atau dua jari selama 300 ms | Belum memakai gerakan geser |
| Cursor hilang | Cursor mengikuti tangan yang lolos hand lock, bukan setiap tangan yang terdeteksi | Perlu pemisahan tracking dan hak menjalankan aksi |
| Distraksi objek atau tangan lain | Lab melacak maksimal dua tangan dan memakai kesesuaian posisi/ukuran tangan, bukan identitas manusia | Masih ada risiko salah asosiasi |

Angka di atas berasal dari source, **bukan benchmark webcam lu**\. Pengalaman lu bahwa deteksi cukup baik ketika pencahayaan depan bagus menunjukkan pipeline punya baseline yang bisa dipakai, tetapi belum membuktikan penyebab setiap kegagalan.

Ada satu pembedaan penting.

- **Hand detection** menentukan apakah tangan ditemukan.
- **Hand landmark tracking** memperkirakan 21 titik tangan.
- **Gesture recognition** menafsirkan titik-titik itu menjadi pinch, tiga jari, dan sebagainya.
- **Interaction logic** menentukan kapan gesture memicu tinta, undo, redo, atau hapus.

Melatih gesture classifier bisa memperbaiki lapisan ketiga. Tetapi kalau MediaPipe gagal menemukan tangan, atau hand lock menolaknya, classifier yang sudah dilatih pun tidak menerima input yang diperlukan.

## 2. Apakah retraining benar-benar bisa membuat MediaPipe lebih akurat?

Ada dua jenis training yang harus lu bedakan.

**A. Melatih pengenal gestur**

Lebih realistis untuk proyek lu. Dataset gestur bisa dipakai melatih classifier ringan yang membaca landmark MediaPipe.

Cocok untuk meningkatkan pengenalan pinch, tiga jari, dan membedakan gesture yang bentuknya mirip.

---

**B. Melatih ulang hand landmarker**

Jauh lebih kompleks. Membutuhkan anotasi posisi jari, dataset visual yang beragam, serta pipeline training dan validasi model deteksi.

Ini relevan kalau MediaPipe sendiri memang gagal menemukan tangan, bukan sekadar gagal mengenali pose.

Google memang mendokumentasikan custom gesture training melalui Model Maker, tetapi **Model Maker sekarang berstatus deprecated dan tidak lagi aktif dipelihara**\. Contoh training resminya juga membuang gambar yang gagal dideteksi tangan. Artinya, menambah banyak gambar tangan yang tidak terbaca tidak otomatis menyelesaikan kegagalan deteksi itu.  [developers.google.com](https://developers.google.com/edge/mediapipe/solutions/customization/gesture_recognizer?utm_source=chatgpt.com) [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe/issues/5667?utm_source=chatgpt.com)

Dapus proyek lu, khususnya Uboweja et al. (2023), juga mendukung kemungkinan mengembangkan custom gesture recognizer. Tapi itu belum membuktikan custom model bakal lebih baik daripada aturan yang dipakai game lu.

**Rekomendasi gw, NUI Lab menjadi alat pengumpulan data dan pembanding model terlebih dahulu.** Training dilakukan offline setelah cukup sampel kegagalan, bukan setiap siswa membuka aplikasi.

## 3. Bagian teknis yang paling perlu diperbaiki

### Pinch dan tinta

Ada ketidakkonsistenan yang patut diuji di `hand-gesture.ts`\.

- Pinch normal mulai pada rasio di bawah `0.42`\.
- Jika telunjuk diklasifikasikan terlipat, pinch baru masuk di bawah `0.15`\.
- Pinch yang berhasil diklasifikasikan masih harus bertahan dua frame berturut-turut sebelum goresan dimulai.

Perbedaan `0.42` dengan `0.15` cukup besar. Ini kandidat penyebab saat lu merasa sudah mempertemukan jempol dengan telunjuk, tetapi aplikasi tidak membuat tinta. Namun gw belum bisa memastikan itulah yang terjadi pada video kamera lu.

Gw menyarankan NUI Lab menampilkan **pinch distance secara live, ambang pinch, status pen-down, dan alasan tinta belum dimulai**\.

### Tiga jari

Classifier saat ini hanya menerima kombinasi jari yang sangat spesifik. Sedikit melengkungnya jari manis atau terbukanya jempol dapat mengubah hasil. Di tabel tes utama `hand-pose.test.ts`, kasus tiga jari juga belum tercakup.

Pendekatan yang layak diuji adalah fitur sudut ruas jari dan koordinat relatif terhadap telapak, bukan semata membandingkan jarak 2D terhadap pergelangan. Referensi implementasi komunitas seperti [hand-gesture-3d](https://github.com/leonardo-carnevalli/hand-gesture-3d) juga menggunakan koreksi aspect ratio, hysteresis, dan tes variasi pose. Itu contoh arsitektur, bukan bukti akurasi pada perangkat lu.  [GitHub](https://github.com/leonardo-carnevalli/hand-gesture-3d?utm_source=chatgpt.com)

### Hand lock dan distraksi

Gw lebih menyarankan konsep **Tangan Aktif**, bukan lock permanen yang membuat lu terus menekan tombol.

Rancangan state machine, bukan perilaku yang sudah diimplementasikan.

Saat tangan aktif hilang sejenak, sistem mencoba menemukan kembali tangan yang cocok. Kalau ada dua kandidat yang sulit dibedakan, input dihentikan sementara. Tombol pilih ulang tetap ada sebagai fallback, bukan sesuatu yang harus lu tekan setiap kali kehilangan tracking.

Hal ini penting karena MediaPipe tetap bisa memperkirakan landmark yang tertutup atau sebagian keluar frame, tetapi perkiraannya tidak otomatis dapat dipercaya.  [GitHub](https://github.com/google-ai-edge/mediapipe/issues/3008?utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe/issues/217?utm_source=chatgpt.com)

### Cursor dan tinta harus independen

Gw setuju dengan kebutuhan interaksi yang lu jelaskan, dengan batas satu tangan aktif.

- **Tangan aktif terdeteksi** berarti cursor terlihat walaupun tidak sedang pinch.
- **Pinch terkonfirmasi** berarti mulai atau melanjutkan goresan.
- **Pinch dilepas** berarti goresan berhenti, cursor tetap terlihat.
- **Tracking hilang** berarti tidak ada tinta baru. Cursor bisa menampilkan transisi kehilangan tracking, bukan tiba-tiba menggambar garis panjang.
- **Tangan lain masuk** berarti tangan lain boleh terlihat di overlay diagnostik, tetapi tidak mengambil kontrol canvas.

Ini juga sesuai temuan dari proyek webcam pointer di komunitas. Variasi tangan antar pengguna dan pergeseran fingertip ketika pinch merupakan masalah praktis yang dilaporkan, sehingga kalibrasi ringan dan hysteresis patut dibandingkan. Namun laporan Reddit tersebut masih anekdotal, bukan benchmark formal.  [reddit.com](https://www.reddit.com/r/computervision/comments/1x1iy4x/webcam_handtracking_pointer_built_on_mediapipe/?utm_source=chatgpt.com) [reddit.com](https://www.reddit.com/r/computervision/comments/1w2hb7s/mediapipe_hand_tracking_works_for_me_and_breaks/?utm_source=chatgpt.com)

## 4. Undo dan Redo dengan swipe

Ada dua desain yang perlu kita pilih sebelum mengubah source.

Opsi A

**Pose tetap berbeda**

Satu jari + swipe kiri untuk Undo, peace sign + swipe kanan untuk Redo.

Lebih dekat ke mapping game sekarang, tetapi pengguna harus mengingat dua pose sekaligus arah.

---

Opsi B

**Satu pose, dua arah**

Peace sign + swipe kiri untuk Undo, peace sign + swipe kanan untuk Redo.

Lebih sederhana secara vocabulary gestur, tetapi mengubah pemetaan game dan tutorial saat ini.

Gw lebih condong **menguji Opsi B terlebih dahulu**, bukan langsung menetapkannya. Aksi swipe harus memakai lintasan beberapa frame, bukan hanya posisi awal dan akhir. Harus ada mekanisme arm, validasi arah, konfirmasi satu aksi, dan cooldown. Referensi implementasi komunitas [gesture_detection](https://github.com/utsab-robotics/gesture_detection) membahas pendekatan motion window, velocity, dan konsistensi arah.  [utsab-robotics/gesture_detection · GitHub](https://github.com/utsab-robotics/gesture_detection?utm_source=chatgpt.com)

## 5. Rencana kerja sebelum kita implementasi

| Tahap | Pekerjaan | Kriteria lanjut |
|--------|--------|--------|
| **P0** | Tambahkan rancangan observabilitas untuk pinch ratio, per-finger state, status tracking, FPS, dan alasan aksi ditolak | Bisa diketahui lapisan mana yang gagal |
| **P1** | Desain recovery Tangan Aktif, cursor independen, dan pinch ink FSM | Tidak perlu relock berulang pada gangguan singkat dan tidak ada salah ambil tangan |
| **P2** | Bandingkan klasifikasi tiga jari, kalibrasi pinch dan Undo/Redo swipe | Peningkatan terukur dari data yang sama |
| **P3** | Rancang dataset collector di NUI Lab dan eksperimen custom classifier | Dikerjakan jika P0 sampai P2 masih menunjukkan kelemahan classifier |
| **P4** | Validasi webcam berbeda, distraksi, edge frame, low-light, dan latency | Ada bukti lintas kondisi, bukan hanya satu laptop |

Yang harus kita jaga adalah membandingkan **baseline dengan kandidat menggunakan rekaman dan kondisi identik**\. Jangan langsung menambahkan banyak model karena setiap tambahan juga membawa overhead CPU/GPU, ukuran unduhan, dan potensi interaksi yang lebih lambat.

Untuk NUI Lab, metrik penting bukan sekadar akurasi klasifikasi. Kita juga perlu ukur seberapa sering tangan ditemukan, waktu sampai tinta mulai, jumlah pinch yang gagal, false Undo/Redo, dan seberapa cepat tracker pulih.

## 6. Dokumen audit lengkap

Gw simpan laporan teknisnya sebagai Markdown lokal berisi temuan source, lokasi file, konstanta aktual, rencana arsitektur, skenario worst-case, dan tautan riset.

**AUDIT-NUI-LAB-RND-2026-11-16.md**

202 baris • Audit source + rencana eksperimen • Tanpa implementasi

[Buka / unduh laporan Markdown](sandbox:/mnt/data/AUDIT-NUI-LAB-RND-2026-11-16.md)

**Pertanyaan yang perlu lu putuskan dulu sebelum implementasi.** Untuk Undo dan Redo, lu mau **peace sign geser kiri/kanan untuk keduanya**, atau tetap menggunakan **satu jari untuk Undo dan dua jari untuk Redo**, masing-masing ditambah gerakan geser?

---

Saran update WORKING\_STATE

- **Yang berubah\:** Owner melaporkan uji NUI Lab dengan penerangan depan bagus. Masih terjadi kegagalan pinch, tiga jari, dan kebutuhan relock manual. Audit statis `main` versi `0.21.0-alpha` menemukan kandidat penyebab dan opsi perbaikan, belum ada tes fisik dari sesi ini.
- **Bagian terdampak\:** NUI Lab, gesture classifier, hand ownership, stroke pipeline, evaluasi runtime, dan rencana pengumpulan data.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

📦 **Files delivered** · 2026-11-16 14:41
- 📎 **AUDIT-NUI-LAB-RND-2026-11-16.md** · MD

---

---

## L3-M130 | User | 2026-11-16 15:13:35


message time: 2026-11-16 15:13:35

sembari gw baca md yang lu kasih, gw mau lu riset data2 kea dataset2 buat retrain itu gestur detection nui, jadi kea jari yang di belakangnya kurang kontras, terus jari yang ada distraksi di belakangnya, dll gitu lah. soal lock, gw mau kan ini cuma satu tangan, nah kalo tangan ilang, ada  tangan baru lagi itu yang dilock aja ga sih jadi mencegah tangannya kena tangan lain di belakang. nah gw mau lu train data2 kea gitu tangan kebalik dikit rotasi dikit gitu lah. overall plan lu oke sih dari gw. sekarang coba riset dan audit kalo perlu audit, asal ga ubah apapun di repo, kalo ternyata ada orang yang udah solve ini lebih oke gas kasih tau gw

---

---

## L3-M131 | Assistant | waktu tidak ada


Gw riset dataset dan solusi komunitas yang memang relevan buat kamera RGB biasa, terutama tangan kurang kontras, background ramai, rotasi, occlusion, dan pinch. Gw juga audit lagi mekanisme lock di `main` secara read-only. Satu hal yang perlu diuji ketat adalah ide auto-lock tangan baru, karena kalau tangan lu hilang lalu tangan orang lain masuk, sistem belum tentu bisa membedakannya. Gw akan pisahkan solusi yang sudah punya bukti dari yang masih perlu eksperimen.

Dataset yang paling menjanjikan sejauh ini bukan satu dataset raksasa saja. **HaGRIDv2** punya variasi orang, latar dan pencahayaan yang besar, sedangkan **IPN Hand** lebih cocok untuk gerakan berurutan seperti swipe dan transisi antarpose. Ada juga **IPN HandS** yang menyediakan anotasi skeleton untuk mempelajari gerakan tanpa harus melatih ulang model landmark. Gw sedang cek lisensi, ukuran data, dan kecocokan labelnya, karena dataset besar belum tentu punya contoh pinch atau tiga jari yang persis seperti kontrol game lu.

Ada temuan yang lebih berguna daripada sekadar mencari dataset besar. Tim IPN Hand merilis **IPN HandS pada Oktober 2026**, lengkap dengan landmark yang dikoreksi manual dan keluaran MediaPipe pada video yang sama. Jadi kita bisa mengukur kesalahan MediaPipe, bukan cuma melatih classifier dari prediksinya sendiri. Ada juga **VERA-Hand**, benchmark Oktober 2026 yang khusus mengukur tangan hilang, salah tangan, posisi landmark, dan kestabilan antarframe. Ini cocok buat menguji usulan auto-relock tanpa langsung melatih model berat.

**Gw nemu dataset dan pendekatan yang jauh lebih cocok buat masalah NUI lu.** Bahkan ada rilis Oktober 2026 yang memungkinkan kita mengukur kesalahan MediaPipe memakai landmark yang sudah dikoreksi manusia, bukan cuma menebak-nebak threshold.

Kesimpulan riset gw adalah **tetap pakai MediaPipe sebagai baseline, perbaiki auto-relock, lalu eksperimen classifier gestur ringan menggunakan data nyata dan dataset publik**\. Jangan langsung retrain seluruh MediaPipe.

Gw juga sudah buat laporan R&amp;D terpisah. Semua masih audit only.

**R&amp;D Dataset dan Robust Hand Tracking**

Markdown • 20 KB • Dataset, arsitektur lock, augmentasi, eksperimen training, dan benchmark

[Download laporan R&D lengkap](sandbox:/mnt/data/RND-DATASET-ROBUST-GESTURE-LOCK-2026-11-16.md)

## 1. Dataset yang paling cocok

| Dataset | Keunggulan | Rekomendasi |
|--------|--------|--------|
| [IPN HandS](https://github.com/GibranBenitez/IPN-hand/blob/master/README_HandS.md) | Landmark yang dikoreksi manual, tracking bergerak, tangan saling menutupi | **Prioritas 1** untuk audit kesalahan MediaPipe |
| [HaGRIDv2](https://github.com/hukenovs/hagrid) | 1 juta lebih gambar, variasi pencahayaan, background, bentuk tangan dan gestur | **Prioritas 1** untuk eksperimen classifier |
| [VERA-Hand](https://arxiv.org/abs/2610.32517) | Benchmark tangan hilang, salah tangan, landmark dan jitter | **Prioritas 1** untuk evaluasi tracking |
| [IPN Hand](https://gibranbenitez.github.io/IPN_Hand/) | Gerakan swipe kiri/kanan, gesture berurutan, latar ramai | Prioritas 2 untuk gestur dinamis |
| [Rendered Handpose](https://lmb.informatik.uni-freiburg.de/resources/datasets/RenderedHandposeDataset.en.html) | Pose sintetis, rotasi, 21 keypoints, visibility | Prioritas 2 untuk augmentasi |

Dataset terakhir berlisensi research-only. HaGRIDv2 juga perlu verifikasi ketentuan lisensi spesifik sebelum dipakai untuk distribusi model.

### Temuan paling menarik

**IPN HandS** dirilis secara publik pada Oktober 2026. Data yang tersedia mencakup 674 MB landmark ground truth yang dikoreksi manual dan 375 MB prediksi MediaPipe Hands untuk frame yang sama. Jadi kita bisa membandingkan langsung posisi jari sebenarnya dengan posisi yang diperkirakan MediaPipe.  [GitHub](https://github.com/GibranBenitez/IPN-hand?utm_source=chatgpt.com) [mdpi.com](https://www.mdpi.com/2076-3417/15/11/6321?utm_source=chatgpt.com)

**HaGRIDv2** punya variasi pose tiga jari seperti `three`, `three2`, dan `three3`, serta variasi peace sign. Penelitian Hobbs dan Ali (2025) sudah mencoba menggabungkan pose-pose serupa menjadi satu kelas lalu melatih classifier kecil dari 63 koordinat landmark. Penelitian tersebut melaporkan akurasi validasi 90% pada tugasnya dan sekitar 20,4 FPS pada Raspberry Pi 5 dalam kondisi uji tertentu. Ini contoh yang bisa kita adaptasi, bukan angka performa untuk game lu.  [mdpi.com](https://www.mdpi.com/2079-9292/14/20/3976?utm_source=chatgpt.com) [GitHub](https://github.com/hukenovs/hagrid/?utm_source=chatgpt.com)

**VERA-Hand**, diterbitkan 23 Oktober 2026, justru menemukan bahwa tidak ada satu estimator tangan yang unggul pada semua ukuran performa. Mereka juga mengevaluasi pembersihan prediksi ganda dan gangguan temporal tanpa retraining. Ini relevan banget buat kasus tangan utama tertukar atau tracker salah mendeteksi tangan tambahan.  [arxiv.org](https://arxiv.org/abs/2610.32517?utm_source=chatgpt.com)

## 2. Soal tangan hilang lalu tangan baru otomatis terkunci

**Gw setuju dengan auto-relock, tetapi tidak dengan memilih sembarang tangan yang muncul berikutnya.** Itu dua hal yang berbeda.

Misalnya tangan lu keluar frame, lalu tangan orang lain muncul. Kalau sistem selalu memilih tangan berikutnya, berarti distraksi yang ingin kita cegah justru mendapatkan kendali canvas.

Rancangan yang gw sarankan adalah\:

Usulan state machine untuk auto-recovery, belum diimplementasikan.

Prinsipnya tangan yang sama dicari dahulu. Kalau tangan itu tidak lagi terlihat dan muncul satu kandidat baru yang konsisten selama beberapa frame, kandidat tersebut boleh diaktifkan otomatis. Kalau ada dua kandidat atau lintasannya ambigu, tinta dan perintah ditahan.

Dengan begitu, lu nggak perlu bolak-balik menekan **Kunci ulang tangan** setiap tracking drop. Tapi kita tetap tidak bisa menjamin identitas pemilik tangan hanya dari kamera RGB dan landmark.

## 3. Bagaimana data latihnya nanti?

Gw mau eksperimen yang terukur, bukan asal membuat gambar sintetis lalu mengklaim model jadi akurat.

Data perlu mencakup kondisi tangan lu ketika jari\:

- Berada di depan dinding atau objek yang warnanya mirip kulit.
- Berputar sedikit, miring, memperlihatkan punggung tangan, atau sebagian tertutup.
- Melakukan pinch kecil, setengah pinch, hingga benar-benar bertemu.
- Membentuk tiga jari dengan jari manis sedikit melengkung.
- Bergerak cepat, berhenti, keluar frame, lalu masuk lagi.
- Terlihat bersamaan dengan tangan orang lain atau objek yang menyerupai bentuk jari.

Di NUI Lab nantinya perlu ada **dataset collector opt-in** yang merekam landmark, raw frame bila diperlukan dan diizinkan, gesture yang dimaksud, serta status ketika MediaPipe gagal.

Training classifier kecil bisa dilakukan offline memakai fitur posisi relatif terhadap telapak, sudut ruas jari, dan jarak antarujung jari. Modelnya dibandingkan dengan classifier aturan yang sekarang. Dataset besar tidak perlu ikut diunduh oleh siswa.

## 4. Urutan yang paling masuk akal

Gw tetap mempertahankan rencana awal lu, tetapi hasil riset ini membuat prioritasnya lebih jelas.

1. **Perbaiki dan ukur hand lock serta pinch logic dahulu.** Dua masalah ini sudah punya kandidat penyebab konkret di source.
2. **Bandingkan aturan sekarang dengan classifier ringan.** Mulai dari tiga jari, pinch, lima jari, dan `no_gesture`\. Gunakan HaGRID sebagai referensi variasi dan data nyata untuk label game.
3. **Gunakan IPN HandS dan VERA-Hand untuk menguji reliabilitas.** Jangan cuma hitung akurasi pose, tetapi juga missed hands, false hand switch, waktu pemulihan, dan jitter.
4. **Uji dengan webcam sebenarnya.** Termasuk warna latar mirip tangan, distraksi, low contrast, punggung tangan, dan tepi kamera.

Model belum gw latih karena sampel nyata dan benchmark baseline belum tersedia untuk eksperimen yang bisa dipertanggungjawabkan. Training secara prematur berisiko menghasilkan model yang terlihat bagus di data latih tetapi tetap gagal pada kamera lu.

**Status GitHub tetap aman.** Audit read-only, tidak ada commit, push, atau penggantian model.

---

Saran update WORKING\_STATE

- **Yang berubah\:** Riset menemukan IPN HandS, VERA-Hand, HaGRIDv2 dan contoh classifier ringan sebagai kandidat evaluasi/training. Audit menguatkan kebutuhan auto-reacquire dengan validasi kandidat.
- **Bagian terdampak\:** R&amp;D dataset, gesture classifier, hand ownership, evaluasi webcam, dan eksperimen NUI Lab.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti WORKING\_STATE.md.

📦 **Files delivered** · 2026-11-16 15:24
- 📎 **RND-DATASET-ROBUST-GESTURE-LOCK-2026-11-16.md** · MD

---

---
