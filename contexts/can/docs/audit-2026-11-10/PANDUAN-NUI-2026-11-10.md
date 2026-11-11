# PANDUAN UTAMA NUI — MEDIAPIPE, ONNX OPSIONAL, GERAK DAN KAMERA

**Sketchbook Universe | 10 November 2026 | Dokumen arahan teknis untuk Fable 5.2 dan tim eksekusi Can**  
**Status:** panduan arsitektur dan mandat evaluasi, bukan bukti bahwa pipeline telah diimplementasikan atau lolos runtime.  
**Pasangan dokumen:** `BIGPROMPT-FABLE-52-EKSEKUSI-SKETCHBOOK-2026-11-10.md`. Baca keduanya. Dokumen ini mengatur NUI; big prompt mengatur cerita, UX, animasi, level, owner, eksekusi. Jika ada pertentangan dengan keputusan produk Can yang **terbaru** dalam repo aktif atau instruksi user terbaru, catat konflik dan ikuti prioritas yang dinyatakan di big prompt. Jangan diam-diam menimpa `DECISIONS.md`.

## Isi
1. Batas dan definisi komponen
2. Pembacaan source aktual sebelum coding
3. Arsitektur baseline dan jalur enhancement
4. Kemampuan gestur dan resolusi konflik
5. State kamera, cover, dan Momo
6. Prapemrosesan low-light, gerakan cepat dan filter
7. ONNX/RTMPose dan keputusan capability gate
8. Performa, resource, cold-start
9. Robustness, fallback dan keamanan
10. Parameter prototipe dan eksperimen
11. Kriteria verifikasi dan hasil kerja
12. Sumber dan batas klaim

## 1. Batas dan definisi

- **MediaPipe Hand Landmarker** adalah sumber utama koordinat tangan dan pengenalan gestur berbasis landmark. Paketnya menggunakan palm detection dan hand landmark detection; keluaran per tangan 21 keypoint. Pada `landmarks`, `x/y` dinormalisasi ke koordinat frame, sedangkan `z` merupakan kedalaman relatif pergelangan, **bukan** koordinat `0..1` universal. `worldLandmarks` berbeda satuan.
- **One Euro Filter** adalah filter temporal koordinat untuk kursor/gambar, **bukan model AI**. Path pemrosesan logika gestur harus tetap responsif dan boleh memiliki stabilisasi/thresholdnya sendiri berdasarkan hasil ukur.
- **CLAHE** adalah algoritma peningkatan kontras lokal, **bukan model AI**. Implementasi WebGL CLAHE *tidak sama* dengan shader brightness sederhana: butuh estimasi histogram/tile, clip-limit dan interpolasi. Uji apakah benar membantu model; enhancement agresif juga dapat menambah noise.
- **ONNX Runtime Web** adalah runtime untuk model ONNX, **bukan model deteksi tangan**. `RTMPose-Tiny` bisa merujuk model pose tubuh dengan output 17 COCO keypoint. Model itu tidak cukup mengganti 21 keypoint jari. Bila ingin evaluator/fallback tangan, pilih dan validasi model **hand-specific** yang outputnya kompatibel, berlisensi, ada aset real, dengan urutan keypoint, koordinat dan mapping yang terdokumentasi. MMPose mempunyai varian RTMPose hand. Jangan menganggap setiap RTMPose-Tiny adalah hand-landmarker.
- **Tiga unsur yang sempat disebut 'tiga model'** dalam diskusi dipisahkan dengan benar menjadi baseline MediaPipe, peningkatan citra CLAHE, dan opsi model ONNX. Tidak semua harus di-load atau dijalankan bersamaan. Jangan menghapus ide ONNX dari penelitian desain, tetapi jangan menambah dependensi runtime hanya demi menyebut tiga model.
- NUI mengatur **input dan interaksi saja**, bukan mengambil alih backend classifier sketsa milik Dias. API klasifikasi Top-3 dipanggil setelah siswa selesai gambar dan memberi konfirmasi; data kamera/landmark tidak perlu dikirim ke backend Dias.
- Hanya **3 level permainan**. Jangan menciptakan Level 4, mode Level 4, atau tulisan pembuktian Bab 4 yang tidak diminta; uji engineering ini terpisah dari bab naskah akademik.

## 2. Audit source sebelum menulis kode

Fable wajib membuka project aktif dan mencatat path aktual, commit, build setup, serta implementasi status untuk: `AGENTS.md` root, `contexts/can/` (termasuk `DECISIONS.md`, `SOUL.md`, `SOURCE_OF_TRUTH.md` bila ada), `frontend/implementation/` dan dokumentasi arsitektur bersama. Jika repo berbeda dari contoh path, jangan mengarang path. Dokumentasi lokal lama di konteks ChatGPT bukan bukti keputusan terkini.

Temukan dan buat peta `camera video -> frame scheduler -> detector -> landmark tracker -> gesture classifier -> FSM -> canvas/game -> Momo state`. Temukan semua event dari UI tutorial, wave, pinch, fist, victory, open palm, thumbs-up, five-finger rotate, dan keyboard/mouse fallback. Catat mana yang saat ini simulasi, mana yang memakai webcam sungguhan, dan mana yang didukung kode tetapi belum diuji. Cari pengganda listener/timer serta animation speed global yang berisiko mempercepat seluruh flow.

Pemeriksaan minimal yang harus dilaporkan: versi package MediaPipe, runningMode, model asset URL, batas jumlah hands, apakah `detectForVideo()` dipanggil di main thread, current event router, hand-off ke physics/gamestate, pilihan mock-vs-live, ada/tidaknya ONNX/CLAHE sesungguhnya, dan apa yang berubah dari code terbaru.

## 3. Arsitektur inti, tanpa membuat UI macet

```text
Webcam (permission + track lifecycle, resolusi adaptif)
  -> Frame Scheduler: latest-frame wins, satu inference in-flight, timestamp monotonic
  -> OPTIONAL exposure/contrast processor (baseline OFF; enable only if measured useful)
  -> MediaPipe Hand Landmarker (primary, real 21 finger landmarks)
  -> Detection validity / hand persistence / handedness / frame quality
  -> +-------------------------------+-------------------------------------+
     |                               |
     v                               v
  Pointer path                    Gesture path
  normalized -> One Euro          raw/appropriate stable geometric features
  -> canvas cursor                -> contextual classifier + time-based FSM
     |                               |
     +------------- context-sensitive gesture router -------------------+
                   -> tutorial/card/dialog/canvas/placement/game states
                   -> animated Momo / feedback / 2D game loop

OPTIONAL enhancement, separately gated:
- CLAHE/contrast processor if light test improves BOTH reliability and frame budget
- Hand-specific ONNX model, lazy-loaded if suitable, used only in justified fallback/experiment
- Pointer, touch/mouse, keyboard fallback independent of ML availability
```

**Invariants.** Tidak memproses video frame bertumpuk; UI animation timeline tidak menunggu inferensi; render/game physics tetap terpisah dari sample kamera; setiap hasil inference membawa timestamp/frameId; buang hasil usang; cancel pending init/detection saat izin dicabut/unmount; release camera tracks, WebGL resources dan inference sessions. Jangan memanggil webcam sebelum pengguna memberikan izin. Jangan membuat dua classifier berebut output gesture tanpa arbitration.

**Browser Web:** dokumentasi Google menyatakan `detectForVideo()` bersifat sinkron dan dapat memblokir UI thread. Pertimbangkan worker jika kompatibel dengan API, worker transfer frame, GPU delegate, bundler, dan target browser; bila tidak kompatibel, inference budget/frame skipping terukur. Jangan mengklaim worker selalu memungkinkan atau latensi 0ms.

## 4. Gesture dictionary dan modal routing

Implementasi final mapping harus diperiksa pada keputusan terbaru dan code. Skenario eksplisit pengguna yang **wajib didukung/direncanakan**:

| Konteks | Gerak fisik | Efek | Aturan interaksi |
|---|---|---|---|
| Cover setelah kamera aktif | Wave / dada-dada | Bangunkan Momo dan lanjut transisi kamera ke kiri atas | Harus benar-benar terdeteksi, tidak boleh auto-trigger semata timer |
| Dialog Momo | Thumbs-up | Menyatakan pesan sudah dipahami | **Bukan** skip dialog, transisi baru setelah pesan terbaca |
| Tutorial kartu 1 | Pinch + gerak tangan | Menggerakkan Thinman dari kiri ke kanan sampai bendera | Bendera adalah completion, thumbs ring baru muncul setelah target terpenuhi |
| Tutorial kartu 2 | Sesuai guidance yang diverifikasi di repo | Belajar solid/danger; membaca penjelasan | Jangan mengarang task interaktif jika sumber terbaru tidak mendukung; tetap 10 detik before thumbs |
| Tutorial kartu 3 / drawing | Pinch | Membuat goresan dengan brush | Cegah putus-putus akibat flicker gesture |
| Tutorial kartu 3 / drawing | Kepalan tangan / fist | Menghapus pada brush eraser berukuran tetap dulu | Jangan ikut mengubah besar-kecil eraser kecuali hasil audit/eksperimen membuktikan manfaat |
| Tutorial kartu 3 | Dua jari / victory | Undo | Harus benar-benar dicoba sebelum selesai |
| Tutorial kartu 3 | Telapak terbuka / open palm | Redo | Harus benar-benar dicoba sebelum selesai |
| Canvas level | Thumbs-up setelah selesai | Konfirmasi siap ditebak dan tampilkan Top-3 | Tidak mengubah keputusan HITL; bukan skip dialog; idle 10s hanya prompt Momo |
| Penempatan objek | Pinch dengan progress ring | Menangkap dan memindah objek, release untuk meletakkan | Jangan mengganti behavior objek saat genggam hilang sebentar |
| Penempatan objek | Lima jari dan gerakan memutar | Rotasi objek | Bedakan secara kontekstual dari open palm untuk redo |
| Kegagalan dan recovery | Gesture untuk `Gambar lagi` belum dipastikan | Tampilkan kontrol NUI yang discoverable | Pilih mapping setelah cek konflik; tombol UI tetap ada sebagai fallback |

Penting: pinch pada kartu 1, pinch brush, pinch drag objek **harus punya satu sumber gesture yang sama tetapi efek mengikuti state**. Open palm untuk redo dan lima jari untuk rotasi juga hanya boleh aktif pada state berbeda. Wave yang membuka Momo di cover tidak boleh menghapus stroke di canvas. Thumb tidak otomatis melakukan semua action jika pengguna sedang di dialog, kartu, menggambar atau memilih jawaban. Atur precedence eksplisit:

1. modal dialog yang belum selesai / butuh acknowledgement,
2. tutorial stage yang sedang aktif,
3. gesture yang berbahaya/irreversible seperti submit prediction dan commit object,
4. canvas editing,
5. object manipulation,
6. ambient reactions.

Tidak ada `ack` ganda akibat hand jitter atau satu gesture ditahan melintasi transisi layar. Gunakan gesture lifecycle `candidate -> active -> confirmed -> released/cooldown` dengan hysteresis, debounce, dwell, cooldown, dan no-hand recovery yang **dikalibrasi**. Angka `thumb 2 detik`, `10 detik` reading gate, dan `idle 10 detik` adalah target UX dari user, bukan hasil pengukuran gesture sensor. Jangan menyamakan 10 detik membaca sebagai instruksi auto-lanjut.

## 5. Camera dan Momo state, disinkronkan dengan big prompt

```text
COVER_SLEEP
    | permission camera
    v
CAMERA_COVER_ACTIVE (kamera besar tengah, Momo tidur sungguhan, waving detection)
    | wave terverifikasi
    v
WAVE_ACK / MOMO_WAKE (mata berkedip, bangun, melayang membesar, halo)
    | animated camera choreography
    v
CAMERA_MINI_TOP_LEFT + MOMO_STORY_EMPHASIS
    | dialog benar-benar acknowledged
    v
BOOK_OPEN / RULER / ATTENDANCE / THUMB_CONFIRM
    | onboarding cards, level select, gameplay, exit portal
```

Interpretasi urutan di atas **harus Fable konfirmasi dengan melihat source dan user brief lengkap** karena user menyebut kamera mengecil saat aktif dan juga ketika wave terdeteksi. Jangan paksa memilih salah satu hanya dari asumsi. Implementasikan dua state jelas: kamera aktif untuk deteksi wave di cover dan transisi visual ke pojok setelah wave, atau rekomendasikan penyesuaian dengan prototype animasi. Semua hasil harus mempertahankan visibility Momo dan bebas flash/transisi mendadak.

Animasi Momo tidur bukan statis/stack ekspresi. Perlu loop tidur yang tampak hidup (gerak napas, pergeseran halus tubuh, ekspresi mengantuk, timing wajar), kedip saat bangun, melayang untuk storytelling. Gunakan aset 12 ekspresi milik Owner bila ada pada repo. Jangan menambahkan voice, LLM/NLP/chat bebas.

## 6. Low-light, blur dan temporal filter

Baseline tanpa enhancement lebih dahulu; uji variasi kualitas kamera. Tiga kelompok eksperimen yang diizinkan tanpa mengubah arah produk:

- **Baseline:** MediaPipe saja, image direct, no display smoothing.
- **Filter visual:** MediaPipe + One Euro pada cursor/brush. Periksa lag, overshoot, jitter ketika tangan statis, gesture disengage/reacquire, cepat/lambat.
- **Contrast A/B:** pipeline CLAHE atau adaptif yang implementasinya nyata dan bisa dibandingkan dengan baseline. Jangan mengganti gamma/brightness biasa dengan nama CLAHE. Test potensi artifacts, washed-out edges, amplified noise, GPU/CPU budget.
- **ONNX hand fallback/ablation:** hanya saat model outputnya benar-benar hand-specific dan resource perangkat memadai. Bukan syarat onboarding atau gesture dasar.

One Euro: `minCutoff=1.0`, `beta=0.007` dari dokumen sumber adalah **contoh parameter awal**, bukan optimum yang terbukti. Gunakan timestamp frame sebenarnya untuk dt; reset filter saat tangan hilang lama, kamera berubah orientasi atau pengguna berganti. Jika filter membuat pinch terasa terlambat, gesture path tidak boleh menggunakan koordinat display-smoothing yang sama secara buta.

**Screen fill-light:** ide cahaya putih lembut di border canvas dapat diprototipekan tanpa menyilaukan. Klaim penambahan `15–20 lux` dan threshold `30 lux` tidak boleh dinyatakan pasti kecuali diukur dengan sensor/fotometer. `image luma` bukan lux fisik. Saat terlalu gelap, tampilkan instruksi alami untuk menambah cahaya dan berikan fallback pointer.

## 7. ONNX dan RTMPose gate

Sebelum Fable memasang ONNX:

1. Inventaris aset dan lisensi model yang **memang ada di repo** (nama, hash, ukuran, keypoint definition, input tensor shape, output shape, preprocessing, model version). Jangan mengunduh dan memasukkan model tidak berlisensi tanpa keputusan.
2. Verifikasi apakah kandidat menghasilkan **landmark jari** 21 titik, bukan hanya body pose 17 titik; bila berbeda, tulis mapping/adapter yang realistis atau nyatakan `NOT COMPATIBLE`.
3. Verifikasi hardware capability `WebGPU`, dukungan browser, fallback WASM, GPU memory dan asset compression. Gunakan `dynamic import` dan lazy initialization tanpa menghalangi cover/gameplay.
4. Uji A/B apakah benar memperbaiki false negative pada hand, jitter, kualitas konfirmasi gesture dan pengalaman siswa. Bila tidak menambah manfaat nyata, jangan hidupkan pada default production.
5. Pastikan `ONNX` tidak melakukan inference berkala di dua runtime bersamaan sehingga rendering lag; kebijakan satu inference at a time atau jadwal sampling terkontrol.
6. Laporkan **penjelasan apa yang dimaksud user dengan 'kombinasi'** secara teknis. Opsi secara prinsip baseline MediaPipe + filter + optional contrast, dengan ONNX hanya sebagai fallback enhancement. Kombinasi tidak wajib berarti ensemble 3 model paralel.

Referensi resmi: ONNX Runtime Web deployment, conditional imports, WebGPU secure context; MMPose membedakan varian `human` dan `hand`; runtime Web tidak memiliki jaminan kemampuan yang identik untuk semua browser.

## 8. Perf, cold-start dan jaringan

Tidak ada klaim `zero-lag`, `0 ms freeze`, `8–12 ms`, `0.4 ms CLAHE`, `12.1 MB` transfer atau `>150MB` crash tanpa pengukuran yang bisa direproduksi. Hitung secara terpisah:

- `first paint`, UI interactive, camera permission time, first valid landmark, first wave acknowledgement, first brush latency
- per-stage `preprocess ms`, `inference ms`, `gesture classify ms`, render/game frame time, p50/p95/p99
- decoded FPS, inference FPS, game FPS, frame drops, long tasks, memory/VRAM, CPU, thermal/throttling
- transfer Brotli/Gzip **aktual**, WASM/JS/model artifacts, cold cache vs warm cache; asset hash dan versi; jangan menganggap semua `.task` terkompres 6.2MB
- perangkat rendah, perangkat menengah, desktop, browser aktual; izin kamera ditolak, pencahayaan redup, blur motion, tangan kiri/kanan dan berhenti-gerak cepat

Camera opening **tidak boleh ditahan** sampai seluruh future enhancement terunduh. Warmup boleh dilakukan setelah permission/resources memungkinkan, tapi jangan menyembunyikan error atau berpura-pura shader sudah siap bila belum.

## 9. Robustness dan fallback

Kasus wajib: kamera tak tersedia, izin ditolak, kamera sibuk, reload/unmount, tab background/throttle, browser non-WebGPU, GPU context loss, sinkronisasi hand mirroring, pointer di luar viewport, dua tangan muncul, jari/hand tertutup, no hand > grace period, hand switching, jitter, false wave, false thumbs, pinch cepat, gesture tertahan melewati modal, network offline saat submit Top-3, backend Dias lambat/500/timeout, ONNX unavailable, memori rendah, dan teks bubble menutupi kontrol.

UX fallback boleh pointer/mouse/touch serta keyboard secara *progressive disclosure*. Permintaan user: jangan menampilkan instruksi keyboard sejak awal. Tetapi fallback tetap harus bisa ditemukan saat kamera gagal, demi aksesibilitas; jangan menjebak siswa pada layar yang tidak bisa dilanjutkan. Seluruh dialog tidak boleh hanya bergantung pada gesture yang kamera gagal mendeteksi.

## 10. Parameter dari user vs eksperimen

| Parameter | Asal | Status |
|---|---|---|
| Tiga level, tidak ada level 4 | Instruksi owner terbaru | Kebutuhan produk |
| Kamera center ke pojok kiri atas, animated | Owner | Kebutuhan storyboard, audit koordinat dan timing |
| Momo tidur/membangun/lambaian | Owner | Kebutuhan storyboard |
| 10 detik sebelum ring jempol di tutorial | Owner | Kebutuhan UX, tidak otomatis melanjutkan |
| Idle drawing 10 detik -> dialog tanya | Owner | Kebutuhan UX, tidak otomatis predict |
| Thumb confirm nominal 2 detik | Dokumen NUI asal | Parameter prototipe, kalibrasi dengan UX terkini |
| Fist eraser ukuran tetap | Owner | Default yang direkomendasikan, ukur kenyamanan |
| MediaPipe sebagai core | Judul proyek dan arah owner | Baseline |
| `fcmin 1.0`, `beta .007` | Dokumen NUI asal | Starting tuning values |
| Transfer 12 MB dan rendering 30FPS | Dokumen NUI asal | Target eksperimen, bukan bukti |
| CLAHE, screen fill-light, RTMPose ONNX | Dokumen NUI asal | Kandidat enhancement, verifikasi dahulu |

## 11. Acceptance untuk eksekutor

**Audit di awal, lalu bukti minimal setelah perubahan.** User meminta agar animasi yang rusak dipulihkan dulu, **bukan** testing yang terus merombak timing animation. Jangan memulai dengan auto-fix berbasis snapshot/video yang mempercepat animasi. Setelah perubahan stabil, lakukan verifikasi tanpa mengubah intent/kecepatan animasi.

Checklist:

- [ ] Kamera fisik menampilkan live feed; permission tidak diasumsikan; aktif dengan explicit user action.
- [ ] Wave terdeteksi dari sample webcam nyata, bukan timer atau click simulator.
- [ ] Momo benar-benar tidur, bangun, berkedip, melayang, dialog tepat posisi.
- [ ] Kamera dari tengah cover mengecil dan pindah ke pojok kiri dengan animation handoff yang halus.
- [ ] Gestures pada tutorial dan level bekerja sesuai state, tidak saling tertukar.
- [ ] Pinch brush dan fist erase, undo/redo, thumbs acknowledge benar-benar memengaruhi state.
- [ ] Mode kamera non-available memiliki fallback UI, tidak langsung menampilkan tutorial keyboard kepada semua siswa.
- [ ] MediaPipe 21-landmark terbukti; tidak mengklaim body-pose ONNX sebagai hand model.
- [ ] Memory/network/performance dilaporkan sebagai pengukuran perangkat, bukan angka dari dokumen.
- [ ] Tidak ada Level 4, tidak ada Bab 4 baru di runtime atau tugas eksekusi.
- [ ] `/predict` Dias dan error state adalah concern integrasi game; tidak ditipu dengan mock confidence.
- [ ] Semua tes yang gagal diberi `FAIL`, hardware tidak tersedia diberi `NOT TESTED`, asumsi disimpan sebagai `UNVERIFIED`.

**Bukti:** `NUI-AUDIT.md` (inventory + SHA), `NUI-PLAN.md` (dependency + ownership), `NUI-RESULTS.md` (test matrix/runtime evidence), screenshot/video bila tersedia dari alur normal, build log, DevTools timing. Jangan membuat video palsu atau injection gesture lalu menyebut uji kamera asli.

## 12. Sumber, yang bisa dan tidak bisa diklaim

Referensi resmi teknis yang telah diperiksa untuk penyusunan panduan (bukan otomatis Dapus skripsi):
- Google MediaPipe Hand Landmarker Web: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- Google MediaPipe Hand Landmarker landmarks: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
- ONNX Runtime Web introduction/deploy: https://onnxruntime.ai/docs/tutorials/web/ dan https://onnxruntime.ai/docs/tutorials/web/deploy.html
- ONNX Runtime WebGPU: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- MMPose inference model aliases (`hand` vs `human`): https://github.com/open-mmlab/mmpose/blob/main/docs/en/user_guides/inference.md
- RTMPose body model example (17 COCO body keypoints, **bukan 21 jari**): https://mmla.gse.harvard.edu/tools/rtmpose/
- Superpowers dan Caveman dibahas di big prompt, bukan bagian pipeline kamera.

Rujukan Dapus dari proyek yang tersedia: `[11] Zhang et al. 2020 - MediaPipe Hands.pdf`, `[12] Sung et al. 2021 - Hand gesture recognition.pdf`. Dokumen asal mengutip Pu et al. 2023 dan Casiez et al. 2012; sumber itu perlu ditambahkan ke Dapus dan dicek metadata lengkap sebelum dipakai di naskah resmi. Jangan menulis kalimat `kebal kondisi gelap`, `zero lag`, `pasti anti-bantah`, atau `PCK@0.2` tanpa hand-annotated ground truth.

**Perhatian atas keputusan repo terbaru:** tautan `contexts/can/DECISIONS.md` branch `claude-monorepo` tidak dapat dibuka dari lingkungan penyusun pada 10 November. Eksekutor **harus** membuka file aktual di checkout aktif dan menyatakan SHA sebelum mengubah kode. File keputusan lokal lama di luar checkout bukan pengganti versi tersebut.
