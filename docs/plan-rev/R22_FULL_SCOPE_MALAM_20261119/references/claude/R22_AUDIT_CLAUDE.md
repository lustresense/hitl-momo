# R22 — Audit independen (Claude) atas Google AI, paket ChatGPT v2, repo, dan benchmark Owner

**Tanggal:** 19 Nov 2026 · **Status:** audit read-only. Repo tidak diubah. Belum ada kode R22 yang ditulis atau dites.
**Dibaca:** transkrip Google AI (937 baris), transkrip ChatGPT NUI-Lab-6 + 3 screenshot, paket `R22_Revisi_GoogleAI_ReadOnly` (6 file), repo `lustresense/hitl-momo` (`main@e3e74bf`, `research-can@547403f`), paket npm `@mediapipe/tasks-vision@0.10.14` (versi yang dipin di `package-lock.json`), dan dua export benchmark `S-07ba0cde` (versi 4.080 frame dan 7.612 frame).
**Bukti angka:** semua angka di bawah bisa direproduksi dengan `analyze_nui_bench.py` (hasilnya di `bench_analysis_S-07ba0cde.txt`). Tidak ada ground truth di file benchmark, jadi tidak ada angka akurasi di sini.

---

## 1. Lima temuan yang mengubah rencana

### T1. "Detector miss 20–54%" sebagian besar BUKAN detektor gagal
Miss dihitung ulang hanya di antara frame pertama dan terakhir yang ada tangannya (buang periode sebelum tangan diangkat dan sesudah user ninggalin kamera buat ganti dropdown/export):

| Trial | Miss mentah | Miss di jendela aktif | Kedip ≤3 frame | Streak >15 frame |
|---|---:|---:|---:|---:|
| T001 gesture C7+A4 | 20,1% | **9,3%** | 1,3% | 1 streak (4,5 s) |
| T002 gesture C4+A4 | 54,0% | **16,3%** | 1,1% | 2 streak (6,6 s + 2,8 s) |
| T003 gesture C4+RAW | 70,6% | **5,9%** (cuma 3 s aktif) | 0% | 0 |
| T004 canvas C4+RAW | 32,1% | **20,2%** | 0,6% | 1 streak (12,7 s) |

- T002: **1.282 dari 1.570 frame miss** adalah satu periode 216,8 detik di akhir trial (tab di-hide 11×, ganti preprocess). Itu bukan MediaPipe buta.
- "Kedip" tracking (hilang 1–3 frame) cuma ~1%. Sisa miss di jendela aktif terkumpul di 1–2 periode panjang per trial yang **tanpa video tidak bisa dibedakan** antara tangan keluar frame vs detektor gagal. Sebelum hilang, bbox tangan sering sudah menyentuh tepi bawah (y_max 0,91–0,97).
- **Konsekuensi:** trigger "Stage 2 custom detector kalau DETECTOR_MISS > 15%" dari Google AI akan menyala karena artefak pengukuran, lalu AGY menghabiskan waktu melatih detektor untuk masalah yang belum terbukti ada.

### T2. Sesi ini bukan sesi low-light
Luma rata-rata frame p5–p95 = **0,44–0,48** di semua trial, center luma ≈ 0,39, `backlightFrames = 0`. Jadi semua klaim "A4/low-light/glare" **belum punya bukti fisik dari JSON ini**. Kalau keluhan glare/gelap datang dari sesi lain, sesi itu belum terekam/terkirim. Recorder juga belum mencatat persentase piksel putih (≥250) di area tangan, jadi glare tidak bisa diukur sama sekali saat ini.
Efek samping yang terlihat: `R20_DIM_RECOVERY_LUMA = 0.52` (`bench/r20-lowlight.ts:23`) membuat A4 menyala di ruangan normal (luma 0,47). Di luma itu Reinhard dilewati (k = 0,48/0,47 ≤ 1,04), jadi A4 di T001/T002 praktis cuma **downscale ke 320 px + EMA temporal + median-5** pada cahaya normal. Belum ada bukti itu membantu atau merugikan (T001/T002 vs T003/T004 bukan perbandingan terkontrol).

### T3. Owner guard me-reset tracking MediaPipe secara periodik (terverifikasi di kode library)
`bench/r20-hand.worker.ts:142–148` memanggil `landmarker.setOptions({ numHands })` setiap kali guard pindah 1↔2: lock setelah 3 frame → 1; audit tiap 45 frame terkunci → 2; tiap miss → 2; reacquire → 1.
Di `@mediapipe/tasks-vision@0.10.14`, `setOptions()` → `l()` → `m()` → `setGraph(...)`: **graph dibangun ulang, state tracking VIDEO hilang**, dan frame berikutnya wajib palm-detection dari nol. Jadi kira-kira tiap ±2 detik keunggulan tracking dibuang tepat di bagian yang paling lemah (palm detector), plus biaya rebuild ±27 ms. Di cahaya normal efeknya kecil (kedip ~1%), tapi di cahaya rendah ini kandidat penyebab "ilang-ilangan" yang paling murah diperbaiki: **0 `setOptions` selama sesi**.
Catatan jujur: `numHands` tetap 2 berarti palm detector jalan tiap frame saat cuma 1 tangan (lebih berat); `numHands` tetap 1 berarti tangan kedua tidak terlihat. Ini trade-off yang harus diukur, tapi *toggle* yang sekarang adalah kombinasi terburuk.

### T4. Kamera fisik cuma 15 FPS, inferensi 22–30 Hz → ±40% inferensi memproses frame duplikat
`perf.videoFps` p50 = 15 di semua trial; `detectHz` p50 = 22–30. Frame dikirim per `requestAnimationFrame` (UI 144 Hz), bukan per frame kamera baru. Dampak: CPU terbuang, `dt` antar-frame salah, dan semua ambang berbasis "N frame stabil" (mis. "Telapak hapus butuh 4 frame stabil") sebenarnya cuma ±2–3 frame kamera nyata. Klaim Google AI soal frame duplikat **terbukti**; angka "≥20 Hz" di laporan R20 bukan 20 frame unik per detik.

### T5. Canvas rusak terutama karena logika gate, bukan model atau detektor
Dari 582 frame pose `pinch` yang stabil di T004, cuma **276 yang benar-benar menggambar**:

| Alasan pinch tidak menggambar | Frame |
|---|---:|
| `Tunggu gestur dilepas sebelum aksi baru` (re-arm) | **208** |
| `Tidak ada aksi gambar` | 59 |
| `Cubit ditolak gate R19` (dua penilai pinch tidak sepakat) | 31 |
| `Pinch dibaca, menunggu validasi tinta` | 8 |

- **29 dari 54** `PINCH_ON` tidak pernah jadi stroke.
- **3 dari 5** stroke putus karena tangan hilang cuma **1–5 frame (62–220 ms)**, lalu frame berikutnya ditolak `Tunggu gestur dilepas`. Mekanismenya: tiap reacquire → `releaseAllInternal()` reset `armed.draw=false` (`lab-analyzer.ts:492, 579–582`), dan `armed.draw` baru kembali true kalau ada frame non-pinch (`:625`). Jadi kedip 62 ms memaksa user melepas cubitan lalu mencubit lagi. Ini pembunuh stroke nomor 1, lebih besar dari "gate R19" yang disorot ChatGPT.
- Classifier pistol tetap jalan di Canvas: 205 frame `POINT_READY` menonaktifkan tinta dan memanggil `store.endStroke()` (`:718–722`). Pistol tidak relevan untuk Canvas.
- Grace 150 ms sebenarnya sudah ada di `src/input/hand-stroke-pipeline.ts` (`LOSS_GRACE_MS`, `lost()`, resume dengan batas lompatan), tapi `lab-analyzer.ts` memanggil `ink.reset()` pada frame `NO_HAND` pertama, jadi grace itu tidak pernah bekerja di NUI Lab. Dua dari tiga break pendek (62 ms dan 99 ms) berada di bawah 150 ms dan seharusnya selamat.
- Penyebab frame duplikat (T4): `NuiLabPage.tsx:822–825` memanggil `submitFrame()` lagi tiap hasil worker datang tanpa guard frame-baru yang dipakai `runFrame` (`:896–906`).
- Ada tiga penilai pinch yang berbeda: `classifyHandPose` (revPose), `r19Step.pinchActive`, dan `HandStrokePipeline` yang tetap di-`feed()` (`:723`). Ini membenarkan arahan ChatGPT soal satu `ActionIntentResolver`.
- Undo yang tercatat 4× semuanya via tombol, bukan gestur. Jitter tinta 0,68 px (raw 2,88 px) sudah rendah; smoothing tinta bukan masalah utama.

---

## 1b. Konteks historis NUI Lab 1–5 (arsip `.context-notforagent`, dibaca atas izin Owner)

**Requirement Owner yang konsisten sejak awal** (ID pesan arsip):
- MediaPipe tetap jadi dasar karena judul PA (L4-M038, L4-M084); "fine-tune" yang dimaksud Owner = memperkuat, bukan melatih ulang MediaPipe (L4-M080).
- Unduhan < 25 MB, runtime tidak lag, worst case: kamera burik, warna kulit beda, low-light, objek yang kontrasnya mirip kulit (L4-M090, L4-M096). Retrain classifier boleh pakai GPU, user cukup CPU (L5-M088).
- Gambar tidak boleh gemetar dan tangan tidak boleh terdistraksi wajah (L3-M007). Peningkatan cahaya hanya di belakang layar; tampilan kamera user tetap normal (L3-M036).
- Hapus = telapak 5 jari, kepal bukan hapus (L3-M078, L3-M125). Pinch harus benar-benar rapat supaya tidak takut kecoret (L4-M036).
- Lock: kalau tidak ada tangan, tangan baru yang muncul langsung dikunci; jangan ada relock manual; tangan lain di belakang tidak boleh merebut (L3-M128, L3-M130, L3-M132).
- Pistol (jempol muncul = jalan) adalah gestur **gameplay Thinman** (L5-M060), bukan gestur Canvas.
- Undo/redo: dulu swipe (L3-M128), sekarang diganti kepal→1 jari / kepal→2 jari (NUI-Lab-6, terbaru, berlaku).
- Semua percobaan di `/nui-lab` direkam otomatis (L5-M122).

**Canvas pernah enak, lalu memburuk tiap revisi.** Owner menyebut pinch "sangat oke dan cukup smooth" (L4-M032) dan "R17 smooth banget gambarnya" (L5-M082). Jejak git di `lab-analyzer.ts`/`NuiLabPage.tsx`:

| Revisi | Yang berubah di jalur Canvas |
|---|---|
| R17 `db68039` | Landmarker di main thread, delegate GPU dengan fallback CPU, `numHands=2` tetap, **satu** penilai pinch. Re-arm setelah tangan hilang sudah ada. |
| R19 `8969502` | Menambah penilai pinch kedua (`r19Step.pinchActive`), re-arm lebih sulit (dua syarat), dan state pistol `POINT_READY/PRESS` menutup stroke di Canvas. |
| R20 `de1030e` | Pindah ke CPU worker, owner guard yang bolak-balik `setOptions({numHands})` (reset tracking), dan pump frame tanpa guard frame-baru. |

Catatan jujur: R17 juga dites siang hari dan memakai GPU, jadi tidak semua perbedaan rasa bisa dibebankan ke R19/R20. Tapi tiga lapisan di atas terbukti menambah jalur gagal di Canvas.

**Bukti R20 sendiri (`research-can`, juga dicatat ChatGPT di L5-M121):** pada evaluasi offline berurutan, `A4_adaptive` recall 23,61% sama persis dengan RAW, dan kondisi hampir hitam baru 2,10% deteksi. Jadi A4 belum terbukti membantu bahkan di data sintetis. Ini menguatkan keputusan untuk tidak bertumpu pada preprocessing.

**Status keputusan:** di `contexts/can/DECISIONS.md` (`main`) belum ada entri untuk mapping gestur NUI Lab (pinch/5 jari/kepal→1/kepal→2), dan D-20261115-02 (mapping Card 1/Card 3 gameplay) masih "Belum dikunci". Mapping baru ini berlaku untuk NUI Lab; kalau mau dibawa ke gameplay siswa, perlu keputusan terpisah.

## 2. Verdict atas Google AI

| Klaim Google AI | Verdict | Dasar |
|---|---|---|
| Fine-tune `hand_landmarker.task` tidak realistis | **Benar** | Konsisten dengan ChatGPT dan dokumentasi |
| Webcam murah kirim frame duplikat / FPS rendah | **Benar, terbukti** | T4: kamera 15 FPS vs inferensi 22–30 Hz |
| Glare diperparah A4v2 | **Sebagian** | Kurva Reinhard selalu mencerahkan (y ≥ x) dan k dihitung dari luma rata-rata frame, jadi di kamar gelap dengan tangan diterangi monitor highlight tangan terdorong ke putih. Tapi di sesi ini k ≈ 1, LUT tidak aktif. Belum ada data glare. |
| `setOptions` rebuild 26,8 ms menjatuhkan throughput | **Benar dan lebih parah** | Tidak cuma lambat: me-reset tracking (T3) |
| "MediaPipe Palm Detector buta" sebagai akar masalah | **Belum terbukti** | T1: miss mayoritas periode tanpa tangan |
| Stage 2 detector kalau miss > 15% | **Tolak** | Angka miss mentah tidak mengukur kegagalan detektor |
| ObjectDetector "0 KB WASM, 1 instance" | **Tolak sebagai fakta** | Setuju dengan audit ChatGPT: berbagi file ≠ berbagi instance/memori |
| Temporal TCN 8-frame, C8/C9, `visibility` per landmark | **Tunda** | Tidak ada data sekuens berlabel siap pakai; API web tidak memberi visibility |
| ROI crop/mask "anti-distraksi 100%" | **Tunda** | Distraksi tangan kedua hampir tidak muncul di data (hand count 2 = 9 frame dari 7.612) |
| A5 / "burik pipeline" sebagai fitur baru | **Sebagian besar sudah ada di R20** | Setuju dengan ChatGPT: EMA, median, Reinhard, downscale sudah ada |

Pola umum Google AI: berganti arah 4 kali (OpenCV → tanpa OpenCV; fine-tune C4/C7 → stop → temporal; YOLO+ONNX → MediaPipe ObjectDetector), angka performa disajikan sebagai fakta tanpa pengukuran, dan rencananya dibangun di atas angka miss mentah.

## 3. Verdict atas paket ChatGPT v2

**Arah besarnya benar dan jujur:** MediaPipe tetap, CPU-only, satu mode, autolabel ≠ ground truth, satu ActionIntentResolver, Undo/Redo kepal→1/2 jari, detector tambahan bukan blocker, jangan klaim tanpa bukti. Itu dipertahankan.

**Yang kurang atau keliru:**
1. Tidak memecah miss per streak, jadi masih memperlakukan "671 detector miss" sebagai masalah deteksi dan mempertahankan custom detector sebagai jalur conditional.
2. Tidak menemukan bahwa `setOptions` me-reset tracking; cuma "benchmark trade-off".
3. Menyorot `Cubit ditolak gate R19` (31 frame) tapi melewatkan re-arm setelah reacquire (208 frame) sebagai penyebab utama stroke gagal.
4. Tidak menyadari sesi ini bukan low-light (luma 0,47), sehingga "ablation A4 vs RAW dari data Owner" tidak bisa dilakukan dengan data yang ada.
5. Test plan mengasumsikan kamera 30 FPS; kenyataannya 15.
6. **Scope terlalu besar untuk 3 hari:** registry lisensi R17–R20 + retrain pistol + pose head + pinch head + temporal + detector + UI + recorder + QA. Retrain classifier tidak menyentuh satu pun penyebab di T5.
7. Tidak mengingatkan bahwa `main` sudah maju ke `e3e74bf` (0.29.0, migrasi Dias) dan worktree Ujang masih di `68a7d9a`; serta bahwa deploy dev tetap terblokir 14 test lama sampai Owner memberi pengecualian.

## 4. Soal "retrain semua classifier pakai R17–R20" (permintaan Owner)

Objektifnya: **jangan masukkan ke jalur kritis 3 hari.** Alasannya:
- Di Canvas, classifier pistol justru harus dimatikan (T5). Retrain tidak mengubah 208 frame re-arm, 3 stroke putus karena kedip, atau 29 pinch tanpa stroke.
- Di Gesture, tidak ada ground truth di benchmark, jadi tidak bisa dibuktikan model baru lebih baik dari C4 di webcam lu.
- Audit lisensi/dedup/split R17–R20 sendiri makan ±1 hari kerja agen sebelum training dimulai.
Kalau GPU nganggur, boleh jalan **paralel di branch terpisah** dengan syarat tidak memblokir apa pun dan hanya dipakai kalau menang di held-out test. Kalau tidak sempat, R22 tetap pakai C4 dan itu harus ditulis jujur di manifest.

## 5. Tech stack R22 (final, 3 hari)

- `@mediapipe/tasks-vision@0.10.14` HandLandmarker, `runningMode: "VIDEO"`, CPU, satu Web Worker, **tanpa `setOptions` selama sesi** (numHands tetap; 1 vs 2 dipilih dari pengukuran hari 1).
- Frame pacing pakai `requestVideoFrameCallback` (fallback `video.currentTime`): hanya frame kamera baru yang diinferensi; semua ambang FSM berbasis milidetik, bukan jumlah frame.
- Preprocessing: A4v2 yang sudah ada, ambang aktif diturunkan ke cahaya benar-benar gelap (kandidat: luma < 0,30) sampai ada data low-light nyata. Tanpa OpenCV, tanpa detector kedua, tanpa ONNX.
- Classifier: R20 C4 untuk route Gesture saja. Route Canvas tanpa classifier pistol.
- Canvas: satu penilai pinch dengan hysteresis, satu `ActionIntentResolver` sebagai satu-satunya penulis `StrokeStore`, grace tracking-loss berbasis waktu, FSM kepal→1 (Undo) / kepal→2 (Redo) / 5 jari (Hapus).
- Smoothing: pertahankan smoother tinta yang ada (jitter sudah 0,68 px). One-Euro opsional untuk kursor.
- Recorder: sudah ada, ditambah field yang hilang (§ di prompt AGY).
