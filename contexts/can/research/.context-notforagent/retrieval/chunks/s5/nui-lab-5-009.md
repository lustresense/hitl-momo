# NUI Lab 5 | pesan 81-90

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afd086e-fa98-83ec-9e5c-9ab57e130980
> Source Git blob: ac091ca4786657adbcb787ba32a6fb0900ae5086

## L5-M081 | Assistant | waktu tidak ada


**IYA COK, UJANG UDAH BISA PULL SEKARANG WKWKWK.** Gw cek langsung GitHub, dan `main` memang sudah menunjuk ke commit yang Agy laporkan.

(Terverifikasi di GitHub) 18 November 2026

| Komponen | Hasil |
|--------|--------|
| Branch `main` | `8969502` |
| Model R19 | Ada, 122.768 byte |
| `NuiLabPage.tsx` | Sudah memuat R19 |
| `lab-analyzer.ts` | Sudah memuat R19 |
| Training ulang | Tidak perlu sekarang |
| Webcam fisik | Belum diuji |

[Lihat commit R19 di main](https://github.com/lustresense/hitl-momo/commit/8969502df4e106d8428055c2ca6f80f4f59250ee)

## Prompt buat Ujang

> **Chat message**
> 
> Ujang, pull `main` terbaru dari repository `lustresense/hitl-momo`.
> 
> Target commit:
> `8969502df4e106d8428055c2ca6f80f4f59250ee`
> 
> Agy sudah mengintegrasikan R19 G4 Hybrid sebagai satu-satunya engine NUI Lab.
> 
> Instruksi:
> 1. Periksa branch, remote, HEAD, dan working tree sebelum pull. Jangan overwrite perubahan lokal.
> 2. Fetch dan fast-forward ke main terbaru. Jangan force reset atau melakukan merge yang tidak diperlukan.
> 3. Jalankan dependency install bila diperlukan, typecheck, lint, tests terkait NUI Lab, dan build.
> 4. Jalankan aplikasi melalui deployment/tunnel existing sesuai konfigurasi yang sudah ada. Jangan membuat tunnel atau route baru.
> 5. Verifikasi `/nui-lab`, `/nui-lab/gesture`, dan `/nui-lab/canvas` menggunakan browser.
> 6. Pastikan R19 aktif, model berhasil dimuat, dan tidak ada toggle Baseline/R17/R18.
> 7. Pastikan gameplay siswa tidak mengalami regresi.
> 8. Laporkan commit yang benar-benar berjalan, URL yang dapat diakses, hasil QA, dan blocker.
> 
> Jangan retrain model, jangan mengubah gesture atau desain UI dulu. Fokus pull, build, deployment, dan verifikasi.
> 
> Kalau ada masalah, laporkan bukti dulu sebelum mengedit source.
> 
> Kerjakan sendiri tanpa subagent untuk tugas ini.

**Satu hal penting\:** Agy melaporkan 195 tes NUI Lab lulus dan build berhasil, tetapi itu bukan bukti deployment Ujang sudah memakai commit tersebut.

Jadi urutannya sekarang **Ujang pull → build → deploy lewat tunnel existing → lu tes pistol pakai webcam asli**\.

### Saran update WORKING\_STATE

- **Yang berubah\:** Integrasi R19 terverifikasi di `main@8969502`\. Model dan source NUI Lab tersedia. Deployment Ujang belum diverifikasi.
- **Bagian terdampak\:** Status implementasi NUI Lab, handoff Ujang, dan pengujian webcam fisik.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L5-M082 | User | 2026-11-18 21:37:04


message time: 2026-11-18 21:37:04

ini gw lagi tes malem hari kondisi low light sangat gajelas cok beneran dah. selain dim ada ga yang bneran opensource? dimhand sombong banget cok kenapa sih kalo penelitian ya dibuka aja gituloh, terus respon dulu hasil riset soal dataset train buat lowlight dan antidistracknya anjay baru ingetin gw soal cek main apakah sistemnya main yang nui lab itu masih pake antiglare atau yang smooth gitu lah dari r17? sumpah r17 smooth banget gambarnya, apa karena lagi siang ya?

---

---

## L5-M083 | Assistant | waktu tidak ada


Gw riset dulu dataset low-light dan anti-distraksi yang benar-benar bisa diakses, termasuk lisensi, label, dan apakah cocok buat training MediaPipe atau cuma evaluasi. Setelah itu gw cek `main` NUI Lab untuk memastikan pipeline anti-glare, CLAHE, dan smoothing R17 masih dipakai atau ada yang berubah di R19.

---

---

## L5-M084 | User | 2026-11-18 21:40:06


message time: 2026-11-18 21:40:06

gini, kasih list gw dari r17 sampe r19 itu apa aja yang udah dipake buat train, dataset dari mana aja dan perubahan dari tiap r itu apa, apakah yang barusan lu temuin ini belum dipake train apa gimana

---

---

## L5-M085 | Assistant | waktu tidak ada


Gw luruskan berdasarkan **data yang benar-benar masuk training**, bukan cuma pernah diunduh atau diuji. Gw cek laporan R17, model card R18, dan manifest R19 supaya lu bisa lihat dataset mana yang sudah dipakai, mana cuma evaluasi, dan mana yang memang masih baru.

**Ada alternatif DimHand yang benar-benar terbuka, dan buat masalah NUI lu sekarang gw lebih menyarankan kombinasi dataset low-light RGB, data anti-distraksi, dan pengujian detektor daripada langsung retrain R19.**

Masalah paling penting adalah membedakan dua hal.

- **Tangan tidak terdeteksi** ketika ruangan gelap. Ini masalah MediaPipe, kualitas frame, atau preprocessing. Training classifier pistol R19 saja tidak menyelesaikannya.
- **Tangan terdeteksi tetapi gesturnya salah.** Ini baru wilayah dataset gesture, classifier, dan temporal filtering.

Dari laporan R19 Agy sebelumnya, pada subset video Natural RGB v3 dengan pencahayaan sulit, MediaPipe hanya mendeteksi sekitar 14,72% pada green LED, 21,99% pada red LED, dan 51,67% pada kondisi dim, meski menggunakan preprocessing adaptif. Angka tersebut adalah hasil eksperimen Agy, bukan pengukuran webcam malam lu.

## 1. Dataset terbuka yang paling relevan

| Dataset | Kegunaan untuk NUI lu | Akses dan lisensi |
|--------|--------|--------|
| [Natural RGB Hand Gestures v3](https://data.mendeley.com/datasets/n66hhk695h/3) | **Low-light dan backlight.** Video gestur dalam cahaya normal, redup, LED merah/hijau, dan dari belakang | Terbuka, CC BY 4.0 |
| [Egocentric/Exocentric Hands](https://data.mendeley.com/datasets/bxr7kx84y6/2) | **Anti-distraksi.** Tangan tertutup objek, bayangan tajam, blur, sangat redup, interaksi banyak orang | Terbuka, CC BY 4.0 |
| [HandGesture-5G](https://data.mendeley.com/datasets/wj25crzdbm/1) | **Pistol R19.** `L-Sign`, pointing, punggung tangan, variasi underexposure/overexposure | Terbuka, CC BY 4.0 |
| [Exocentric Hand Interaction](https://data.mendeley.com/datasets/9d37m3nfgm/2) | Banyak tangan, objek permainan, occlusion, background ramai dan cahaya redup | Terbuka, CC BY 4.0 |
| [HANDS RGB-D](https://data.mendeley.com/datasets/ndrczc35bt/2) | Tangan kiri/kanan, variasi background dan cahaya, negative gesture untuk pistol | Terbuka, CC BY 4.0 |

Sumber resmi menjelaskan bahwa Natural RGB v3 memiliki 1.352 video RGB dari 26 peserta, sementara Egocentric/Exocentric berisi 47.166 frame dari aktivitas nyata dengan pencahayaan berbeda. HANDS RGB-D berisi gesture statis pada lingkungan dan pencahayaan bervariasi.  [data.mendeley.com](https://data.mendeley.com/datasets/n66hhk695h/3?utm_source=chatgpt.com) [data.mendeley.com](https://data.mendeley.com/datasets/bxr7kx84y6/2?utm_source=chatgpt.com) [Mendeley Data](https://data.mendeley.com/datasets/compare/wj25crzdbm?utm_source=chatgpt.com) [data.mendeley.com](https://data.mendeley.com/datasets/9d37m3nfgm/2?utm_source=chatgpt.com) [data.mendeley.com](https://data.mendeley.com/datasets/ndrczc35bt/2?utm_source=chatgpt.com)

**Yang perlu lu tahu, sebagian besar dataset ini sudah dipakai Agy untuk training atau evaluasi R19.** Jadi mengunduh ulang semuanya dan melatih ulang dengan resep sama kemungkinan cuma mengulang hasil sebelumnya.

Khusus anti-distraksi, data dengan objek, tangan lain, atau gestur negatif perlu diberi label yang sesuai. Foto gelap tanpa anotasi bukan otomatis data training `POINT_PRESS`\.

**Dari R17 sampai R19, dataset yang benar-benar dipakai untuk training model ada empat sumber unik.** Sisanya dipakai buat evaluasi, uji low-light, anti-distraksi, atau cuma diaudit. Jadi **sebagian besar dataset yang baru gw sebut tadi ternyata memang sudah disentuh Agy**, tetapi tidak semuanya masuk training.

Gw cocokkan langsung laporan R17 di `main`, model card R18, dan model card serta dataset manifest R19 di `research-can`\.

## 1. Riwayat R17 sampai R19

| Revisi | Dataset yang benar-benar dipakai training | Model dan perubahan utama | Hasil laporan |
|--------|--------|--------|--------|
| **R17** | **HaGRIDv2** landmark MediaPipe | Pilot LR dan MLP 9 kelas, perbaikan pembacaan 3/5 jari, pinch, Undo/Redo dan erase | MLP macro-F1 0,987 pada data uji HaGRIDv2 |
| **R18** | **IPN HandS** saja | MLP 6 kelas dengan 68 fitur, motion temporal, guard false action, eksperimen low-light dan keyboard-like steering | Macro-F1 0,6156 |
| **R19** | **HandGesture-5G + Natural RGB Hand Gestures v3 + IPN HandS** | MLP 3 kelas dengan 82 fitur, geometri pistol, G4 Hybrid, jempol PRESS/RELEASE dan VirtualKey FSM | Macro-F1 0,9567 |

Angka F1 ini **tidak boleh dibandingkan langsung** sebagai bukti R19 lebih akurat daripada R17, karena kelas, dataset, dan locked test-nya berbeda.

Referensi repository ada di [Laporan R17](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md), [Model Card R18](https://github.com/lustresense/hitl-momo/blob/research-can/r18/models/MODEL_CARD.md) dan [Model Card R19](https://github.com/lustresense/hitl-momo/blob/research-can/r19/models/MODEL_CARD.md)\.

## 2. Dataset yang sudah benar-benar dipakai training

| Dataset | R17 | R18 | R19 |
|--------|--------|--------|--------|
| [HaGRIDv2](https://github.com/hukenovs/hagrid) | **Training** model pilot | Tidak dipakai | Tidak dipakai, terkendala lisensi |
| [IPN HandS](https://gibranbenitez.github.io/IPN_Hand/) | Anotasi diunduh, landmark saat itu gagal diakses | **Training utama** | **Training kelas OTHER**, sekaligus evaluasi |
| [HandGesture-5G](https://data.mendeley.com/datasets/wj25crzdbm/1) | Belum | Belum | **Training READY/PRESS/OTHER** |
| [Natural RGB v3](https://data.mendeley.com/datasets/n66hhk695h/3) | Belum | Belum | **Training OTHER**, termasuk contoh pencahayaan sulit |

**Yang paling penting untuk masalah malam hari lu adalah Natural RGB v3.** Agy memang sudah memasukkan contoh `dim`, `backlit`, `green_led`, dan `red_led` ke training R19 sebagai kelas negatif `OTHER`\.

Tapi ini bukan berarti MediaPipe telah dilatih ulang agar bisa mendeteksi tangan dalam gelap. Yang dilatih adalah classifier gestur **setelah landmark berhasil diperoleh**\.

R19 juga memakai contoh HandGesture-5G yang diproses dengan CLAHE pada bagian TRAIN. Itu membantu menguji robustness classifier, tetapi tidak sama dengan memperbaiki keseluruhan hand detector.

## 3. Dataset low-light dan anti-distraksi yang baru gw sebut tadi

Ini status sebenarnya menurut [audit 22 dataset R19](https://github.com/lustresense/hitl-momo/blob/research-can/r19/results/R19_DATASET_AUDIT.md) dan manifest Agy.

| Dataset | Status R19 | Perlu training ulang? |
|--------|--------|--------|
| **HandGesture-5G** | Sudah training | Tidak sebelum ada bukti gagal webcam |
| **Natural RGB v3** | Sudah training | Tidak perlu mengulang data yang sama |
| **IPN HandS** | Sudah training | Tidak perlu |
| **Egocentric/Exocentric Hands v2** | **Evaluasi saja**, dua subset sudah tersedia | Bisa jadi kandidat tambahan, tapi perlu anotasi gesture yang benar |
| **HANDS RGB-D** | **Evaluasi saja**, 2.700 frame | Bisa dipertimbangkan untuk hard-negative training setelah audit label |
| **Exocentric Hand Interaction v2** | **Ditolak Agy** karena ukuran sekitar 2,48 GiB dan data tanpa label pistol | Belum dipakai, tidak prioritas |
| **HaGRIDv2** | Training R17 saja, R19 ditahan karena lisensi | Jangan campurkan sembarangan |
| **DimHand** | Blocked, belum dipakai | Tidak bisa mengandalkannya |
| **LLHands/XPose dan MGR-Dark** | Blocked, akses publik/lisensi belum terbukti | Belum bisa dipakai |

Jadi **bukan berarti kelima dataset yang gw temukan tadi baru dan belum digunakan**\. Koreksi dari jawaban gw sebelumnya, Exocentric Hand Interaction bahkan sudah diaudit dan ditolak Agy, sedangkan HANDS RGB-D dan Egocentric/Exocentric sudah dipakai untuk evaluasi saja.

## 4. Apa yang masih kurang dari training R19?

Komposisi training R19 17.086 baris

READY 302

PRESS 196

OTHER 16.588

**R19 sangat kaya contoh negatif, tetapi miskin contoh pistol positif.** Locked test-nya hanya memiliki 35 baris PRESS dan 21 READY.

Artinya ada tiga gap yang masih masuk akal diteliti.

1. **Pistol positif di low-light nyata.** Natural RGB v3 sudah memasok negatif dalam gelap, tetapi belum membuktikan pistol PRESS/READY terbaca baik dalam gelap.
2. **Transisi jempol nyata.** Belum ada dataset video publik yang dipakai untuk melatih urutan alami READY → PRESS → RELEASE. Perpindahannya masih diuji secara sintetis.
3. **Deteksi tangan sebelum klasifikasi.** Jika MediaPipe kehilangan landmark di malam hari, tambahan contoh OTHER tidak menyelesaikan akar masalah.

## 5. Perubahan teknis dari R17 ke R19

| Bagian | R17 | R18 | R19 |
|--------|--------|--------|--------|
| Detektor utama | MediaPipe | MediaPipe | MediaPipe |
| Fitur model | 56 | 68 | 82 |
| Kelas model | 9 | 6 | 3 |
| Fokus | Akurasi pose jari dan canvas | Gerak temporal dan safety | Pistol PRESS/RELEASE |
| Kontrol Thinman | Telunjuk berdasarkan arah | Virtual-key candidate/FSM | Jempol sebagai trigger dan telunjuk pengarah |
| Anti-distraksi | Negative gesture HaGRIDv2 | IPN NOG dan action guards | Lebih banyak negative + geometri + FSM |
| Low-light | CLAHE/preprocessing dan heuristik | Riset RAW/adaptive CLAHE | Evaluasi multi-light dan sebagian augmentasi training |
| Webcam fisik R&amp;D | Belum dibuktikan | Belum dibuktikan | Belum dibuktikan dalam laporan Agy |

Semua model itu merupakan **classifier pendamping MediaPipe**, bukan hasil fine-tuning model HandLandmarker MediaPipe sendiri.

## 6. Gw juga sudah cek `main` terkait smoothing R17

Di `main@8969502`, kode saat ini membuktikan bahwa\:

- **One Euro smoothing masih ada** dengan parameter `DRAWING_ONE_EURO` untuk titik tinta di Canvas Lab.
- **CLAHE 320 masih ada** untuk frame yang diberikan kepada detektor.
- **Deteksi backlight heuristik masih ada**, menggunakan kecerahan area tengah dibanding seluruh frame.
- NUI Lab mempunyai pilihan `Otomatis`, `Mati`, `CLAHE 320`, dan `RAW 320`\.
- Preview kamera menggunakan elemen video asli. CLAHE diterapkan ke frame deteksi, **bukan mempercerah tampilan kamera yang lu lihat**\.
- Gw tidak menemukan modul anti-glare khusus dalam pipeline frame yang diperiksa. CLAHE tidak sama dengan penghilangan pantulan cahaya.

Jadi belum ada bukti smoothing R17 dihapus oleh R19. Kalau lu merasa R17 jauh lebih mulus, **perbedaan cahaya siang dan malam sangat mungkin memengaruhi exposure, noise, motion blur, dan FPS kamera**, tetapi penyebab pastinya belum terukur.

**Kesimpulan gw, jangan retrain dulu menggunakan dataset yang sama.** Kita perlu menguji webcam malam lu untuk membedakan kegagalan detektor, classifier, dan performa. Kalau landmark sudah bagus tetapi pistol sering salah, baru tambahkan contoh PRESS/READY low-light nyata dan retrain R19.

### Tindakan sekarang

Di `/nui-lab/gesture`, gunakan kondisi lampu malam yang sama, lalu bandingkan `Otomatis`, `CLAHE 320`, dan `RAW 320`\. Yang perlu dicatat adalah **FPS deteksi, engine GPU/CPU, luma, status CLAHE aktif, apakah kerangka tangan muncul stabil, dan status READY/PRESS**\. Dari situ baru kelihatan bagian mana yang perlu diperbaiki.

### Saran update WORKING\_STATE

- **Yang berubah\:** Audit sumber training R17/R18/R19 dan pemeriksaan source `main@8969502` untuk smoothing, CLAHE serta pipeline kamera. Laporan pengguna menunjukkan masalah low-light pada pengujian malam, akar masalah belum terukur.
- **Bagian terdampak\:** R&amp;D NUI, dataset provenance, status low-light dan pengujian webcam.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L5-M086 | User | 2026-11-18 21:44:45


message time: 2026-11-18 21:44:45

# Selected text:

## Selection 1
Dataset	Kegunaan untuk NUI lu	Akses dan lisensi
Natural RGB Hand Gestures v3	Low-light dan backlight. Video gestur dalam cahaya normal, redup, LED merah/hijau, dan dari belakang	Terbuka, CC BY 4.0
Egocentric/Exocentric Hands	Anti-distraksi. Tangan tertutup objek, bayangan tajam, blur, sangat redup, interaksi banyak orang	Terbuka, CC BY 4.0
HandGesture-5G	Pistol R19. L-Sign, pointing, punggung tangan, variasi underexposure/overexposure	Terbuka, CC BY 4.0
Exocentric Hand Interaction	Banyak tangan, objek permainan, occlusion, background ramai dan cahaya redup	Terbuka, CC BY 4.0
HANDS RGB-D	Tangan kiri/kanan, variasi background dan cahaya, negative gesture untuk pistol	Terbuka, CC BY 4.0

## My request:
ini digas ga sih buat r20? tapi gw mau r20 ini beneran sudah sesuai sama concern gw kea model pas diload sama user di bawah 25mb terus runtime pake cpu aman. jangan gpu pls

---

---

## L5-M087 | Assistant | waktu tidak ada


**R20 layak digas, tapi fokusnya harus CPU-only dan low-light, bukan otomatis retrain lima dataset sekaligus.** Gw cek batas 25 MB dan bottleneck dari hasil R19 dulu, lalu tentukan dataset mana yang benar-benar memberi nilai tambah dan gate performa yang harus lulus.

**Gas R20, tapi jangan langsung retrain lima dataset itu.** Gw lebih setuju R20 dijadikan revisi khusus **CPU-only, low-light, anti-distraksi, dan performa pada laptop siswa**\.

Target lu masuk akal. Yang perlu kita buktikan bukan cuma model kecil atau akurasi tinggi, tetapi seluruh alur webcam tetap responsif tanpa mengandalkan GPU.

## Posisi R19 sekarang

Transfer awal R19

# 10,83 MiB

Pengujian browser simulasi Agy

Kecepatan deteksi CPU

# 14,18 FPS

Headless Chromium, CPU WASM

R19 memang sudah di bawah target transfer 25 MB pada pengujian tersebut. Masalahnya, deteksi MediaPipe membutuhkan sekitar 67 ms per frame dan menghasilkan **2.349 long tasks selama 180 detik**\. Inference classifier pistol sendiri hanya sekitar 0,2 ms pada p95.

Artinya, **melatih MLP lebih besar bukan prioritas yang tepat untuk R20**\. Bottleneck-nya justru deteksi tangan dan pemrosesan frame.

Google juga menjelaskan bahwa `detectForVideo()` pada MediaPipe Web bersifat sinkron dan bisa memblokir main thread. Menjalankannya di Web Worker adalah salah satu pendekatan yang layak diuji.  [ccn.web.tr](https://ccn.web.tr/web-api/iframe-proxy?url=https%3A%2F%2Fai.google.dev%2Fedge%2Fmediapipe%2Fsolutions%2Fvision%2Fhand_landmarker%2Fweb_js&utm_source=chatgpt.com) [GitHub](https://github.com/google-ai-edge/mediapipe-samples-web/blob/main/src/workers/hand-landmarker.worker.ts?utm_source=chatgpt.com)

## 1. Target R20 yang gw rekomendasikan

**NUI R20-01: CPU-First Low-Light &amp; Robustness** (Usulan R&amp;D)

Parameter awal eksperimen, belum hasil terukur atau keputusan produk yang disahkan.

| Runtime ML | **CPU only** melalui WASM, tanpa GPU delegate |
|--------|--------|
| Total unduhan | **Kurang dari 25 MB** pada cold first-use journey |
| Deteksi CPU | Target ≥20 Hz pada laptop uji yang disepakati |
| Respons tombol | Target p95 ≤150 ms dari gestur ke aksi |
| UI | Target ≥30 FPS, tanpa long task deteksi di main thread |
| Low-light | Peningkatan recall tangan dibanding R19 dengan false action tetap terkendali |
| Anti-distraksi | Menekan false PRESS, false erase, dan salah hand lock |

Ada satu temuan penting dari pengecekan source. **`main` sekarang masih GPU-first**, bukan CPU-only.

File [hand-landmarker.ts](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/src/camera/hand-landmarker.ts) mencoba GPU dulu bila renderer bukan software, kemudian CPU sebagai fallback. Jadi R20 memang perlu perubahan kebijakan delegate, bukan sekadar training dataset.

MediaPipe mendukung delegate CPU menggunakan WebAssembly. Tetapi CPU-only untuk inference tidak berarti seluruh browser harus dipaksa software rendering. Itu justru bisa membuat tampilan game lebih lambat.  [developers.google.cn](https://developers.google.cn/edge/mediapipe/solutions/setup_web?utm_source=chatgpt.com)

## 2. Dataset yang masuk rencana R20

| Dataset | Perlakuan R20 |
|--------|--------|
| **Natural RGB v3** | Pakai ulang data dan baseline. Fokus evaluasi detektor pada dim/backlight, bukan mengulang training OTHER |
| **HandGesture-5G** | Tambahkan variasi positif pistol low-light jika datanya tersedia dan label benar |
| **Egocentric/Exocentric Hands** | Perluas stress test low-light, blur, objek dan multiple hands |
| **HANDS RGB-D** | Pertahankan evaluasi out-of-domain, gunakan tambahan training hanya bila labelnya relevan dan diaudit |
| **Exocentric Hand Interaction** | Tetap cadangan, bukan prioritas download 2,48 GiB |

Prioritas sebenarnya adalah **mengumpulkan contoh webcam malam nyata untuk `POINT_READY`, `POINT_PRESS`, dan `RELEASE`**\. Lima dataset publik tersebut belum menutup kebutuhan transisi jempol lu.

## 3. Urutan eksekusi R20

1. **CPU baseline dulu.** Paksa delegate CPU, ukur ulang R19 pada webcam dan browser yang sama. Catat detector FPS, UI FPS, RAM, transfer, latency, dan long tasks.
2. **Optimasi pipeline.** Uji MediaPipe di Web Worker, pembatasan jumlah tangan, resolusi input adaptif, latest-frame-wins dan pengurangan pemanggilan detektor lain. Pertahankan hasil game dan akurasi yang bisa diukur.
3. **Uji low-light.** Bandingkan RAW, CLAHE existing, dan preprocessing adaptif ringan tanpa membuat video preview siswa ikut berubah. Ukur apakah tambahan preprocessing benar-benar meningkatkan hand detection.
4. **Anti-distraksi.** Jalankan pengujian hard-negative pada dataset yang sudah tersedia, termasuk objek, tangan lain, bayangan dan background ramai.
5. **Retrain hanya jika perlu.** Kalau landmark valid tetapi pose pistol salah, barulah perluas dataset positif low-light dan retrain classifier kecil R19. Kalau MediaPipe tidak mengeluarkan landmark, retraining classifier bukan solusinya.
6. **Acceptance CPU-only.** Uji cold first-use kurang dari 25 MB dan kelancaran runtime pada laptop tanpa GPU acceleration untuk inference. Jangan menyebut PASS sebelum bukti browser nyata ada.

**Gw nggak menyarankan mengganti MediaPipe atau menambah model detektor kedua dulu.** Satu model besar bisa saja membantu cahaya rendah tetapi memperburuk CPU, RAM, dan respons. R20 perlu membuktikan perbaikan yang terukur dengan fondasi yang sudah ada.

## 4. Syarat sebelum R20 dinyatakan berhasil

R20 tidak cukup lolos macro-F1 atau benchmark headless. Harus ada uji pada laptop fisik, termasuk kondisi malam lu sekarang. Perbandingan wajib menggunakan R19 CPU-only pada input dan perangkat yang sama, lalu laporkan peningkatan atau regresi setiap metrik.

Kalau target CPU belum tercapai, statusnya tetap `[WIP]`, meskipun ukuran model kecil dan dataset sudah dilatih.

**Verdict gw, gas R20 dengan CPU-only sebagai syarat utama dan anggaran total unduhan kurang dari 25 MB. Tapi fokus fase pertama adalah optimasi detektor, scheduling, serta validasi low-light. Training ulang berada di fase berikutnya berdasarkan hasil uji, bukan otomatis dilakukan di awal.**

---

⚠️ Kandidat perubahan **keputusan** terdeteksi

- **Ringkasan\:** Owner menginginkan R20 dengan runtime inference NUI menggunakan CPU saja, tanpa GPU delegate, dan target transfer pengguna kurang dari 25 MB.
- **Entri lama yang mungkin terdampak\:** Kebijakan runtime GPU-first pada source `hand-landmarker.ts`, rencana R18/R19, serta batas teknologi MediaPipe yang sudah dicatat.
- **Status bukti\:** Keputusan eksplisit pengguna mengenai target R20; kelayakan CPU-only pada perangkat siswa belum terbukti.
- **Tindakan\:** `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

---

---

## L5-M088 | User | 2026-11-18 21:48:28


message time: 2026-11-18 21:48:28

# Selected text:

## Selection 1
R20 layak digas, tapi fokusnya harus CPU-only dan low-light, bukan otomatis retrain lima dataset sekaligus. Gw cek batas 25 MB dan bottleneck dari hasil R19 dulu, lalu tentukan dataset mana yang benar-benar memberi nilai tambah dan gate performa yang harus lulus.

## My request:
KENAPA ENGGA COKKKKK RETRAIN KAN BUTUH GPU, SERVER GW GPU JAGO COKKKKKKK APALAH. INI RETRAIN CLASSIFIERNYA ITU LOH ASUUU BUKAN GANTIIN MEDIAPIPE JANCOKKK POKOKNYA CPU AJA ANJINGGGGGG KALO UDAH JADI

---

---

## L5-M089 | Assistant | waktu tidak ada


**IYA, R20 RETRAIN CLASSIFIER-NYA PAKE GPU SERVER LU. PAS UDAH JADI, MODELNYA JALAN DI CPU LAPTOP SISWA. MEDIAPIPE TETAP DIPAKAI.**

Gw salah nangkep kebutuhan lu tadi. Gw terlalu fokus ke bottleneck MediaPipe sampai malah menyarankan nggak retrain, padahal **training di GPU server dan inference di CPU pengguna itu dua hal berbeda**\.

Jadi arah R20 yang benar begini.

**GPU SERVER LU**

Download, kurasi, augmentasi, retrain classifier R19, tuning, evaluasi, dan ekspor model R20.

**CPU LAPTOP SISWA**

MediaPipe HandLandmarker CPU + classifier R20 CPU + gameplay 2D. Tanpa GPU delegate untuk inference.

## Scope R20 yang gw koreksi

1\. **RETRAIN WAJIB.** Jadikan R19 G4 Hybrid sebagai baseline, lalu latih kandidat classifier R20 menggunakan data low-light, backlight, dorsal hand, dan hard negatives yang relevan. Manfaatkan GPU server semaksimal yang berguna untuk eksperimen, bukan membesarkan model tanpa batas.

2\. **Dataset diperluas.** Pakai ulang HandGesture-5G, Natural RGB v3, IPN HandS. Evaluasi Egocentric/Exocentric dan HANDS RGB-D untuk kemungkinan tambahan training setelah anotasinya cocok. Exocentric Hand Interaction tetap kandidat bila memberi data distraksi yang belum tercakup. Prioritaskan tambahan **POINT\_READY dan POINT\_PRESS dalam low-light**, karena data positif R19 masih sedikit.

3\. **MediaPipe tidak diganti.** Tetap fondasi 21 landmark. Classifier baru dilatih dari landmark yang sesuai dengan pipeline browser. Optimasi preprocessing dan tracking tetap boleh, khususnya untuk kondisi gelap ketika MediaPipe kehilangan tangan.

4\. **Deployment CPU-only.** Setelah training GPU selesai, ekspor bobot kecil yang bisa diinferensikan melalui JavaScript/WASM di CPU. Ukur full runtime, bukan cuma waktu inference MLP.

5\. **Total download kurang dari 25 MB.** Hitung seluruh aset yang benar-benar diunduh siswa, termasuk MediaPipe WASM, model `.task`, classifier R20, JS/CSS dan aset aplikasi. Dataset training tidak ikut diunduh.

6\. **R20 harus mengalahkan R19 pada kondisi yang lu pedulikan.** Ukur akurasi PRESS/READY, false action, low-light, backlight, distraksi, CPU FPS, latency, RAM dan ukuran transfer. Jangan mengklaim CPU lancar hanya karena training selesai di GPU.

**Satu batas teknis yang tetap perlu gw tekankan.** Retrain classifier memang harus dilakukan sesuai arahan lu, tetapi kalau MediaPipe tidak menghasilkan landmark ketika gelap, classifier baru tetap tidak punya input. Karena itu R20 perlu mengerjakan retraining **dan** optimasi pipeline CPU, bukan memilih salah satu.

Jadi \*\*R20 = GPU untuk training, CPU-only untuk pengguna, MediaPipe tetap, classifier diretrain, target download

---

---

## L5-M090 | User | 2026-11-18 21:51:49


message time: 2026-11-18 21:51:49

YAUDAH RISET BURUAN COK BISA GA GW MAU LU PLAN BENERAN ANJING MENDALAM KRN BESOK SIANG GW MAU TRAIN SEMUANYA DAN MALEM ITU WAKTUNYA TESTING LOWLIGHT JANCOK

---

---
