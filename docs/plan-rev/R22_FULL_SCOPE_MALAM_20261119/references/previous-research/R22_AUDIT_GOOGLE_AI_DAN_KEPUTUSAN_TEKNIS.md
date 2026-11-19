# R22 — Audit terhadap percakapan Google AI dan keputusan engineering yang dapat diuji

**Tanggal:** 19 November 2026  
**Status:** Telaah teknis, bukan keputusan PA resmi atau hasil implementasi. Repository hanya dibaca.  
**Basis:** teks percakapan Google AI yang diberikan Owner, `research-can` R20, `main` frontend, benchmark webcam fisik 4 trial / 7.612 frame, dan dokumentasi resmi API Google/MDN.  
**Batas:** Tidak ada training ulang, running browser benchmark baru, atau perubahan repository pada audit ini.

## A. Verdict arsitektur

**Layak dibangun sebagai kandidat R22:** MediaPipe Hand Landmarker tetap pusat landmark; satu CPU Worker untuk NUI Lab; kualitas frame adaptif; temporal filtering dan pose FSM; retraining head sah dari registry R17–R20; satu action resolver untuk Canvas; benchmark otomatis sesudah consent. **Jangan mengikat keberhasilan R22 pada custom detector dalam 3 hari.**

**Conditional:** custom MediaPipe ObjectDetector berbasis TFLite kompatibel dengan metadata, aktif hanya saat pencarian/reacquisition, jika dan hanya jika dataset bbox, legal, export, runtime, dan keuntungan fisik lolos verifikasi.

**Ditolak sebagai fakta:** `0 B WASM tambahan` sebagai arti *satu instance engine*; `background hilang 100%`; `0 lag One-Euro`; `0 false PRESS guaranteed`; semua model tiny pasti `1.5 MB`/`6 ms`; mengatasi clipping putih 255 dengan tone mapping; 20 Hz input unik dari 12 Hz kamera; training detector dari JSON landmarks tanpa bbox/foto; semua R17–R20 menjadi satu dataset supervised dengan label setara; `visibility/presence` per landmark yang belum diekspos API browser.

## B. Pemeriksaan aktual source R20: sebagian inovasi Google AI sudah ada

| Klaim ide Google AI | Bukti pada `research-can` | Tindakan R22 |
|---|---|---|
| Temporal EMA baru | `r20_lowlight_frame_source.ts` punya `motionGatedTemporalEmaInPlace`, dipanggil di `applyA4ChromaRecoveryInPlace` | Ukur ghosting/noise nyata; ubah hanya jika ada perbaikan terukur |
| Reinhard / soft tone mapping baru | `reinhardExposureLutInPlace` sudah ada, dipanggil A4v2 | Audit clipping **sebelum** dan **sesudah** A4v2, histogram p95 dan near-white pixel, bukan sekadar tambah LUT |
| Denoise baru | Ada median dan 3x3 denoise, downscale worker ke 320 pixel | Uji sampling spatial/temporal, sharpness fingertip, overhead, low contrast |
| Drop frame baru | `submitVideoFrame` sudah memakai `video.currentTime` guard, `max inFlight=1`, latest-frame-wins | Tambah `requestVideoFrameCallback` / presentedFrames jika kompatibel, beda capture vs processed, dedup noise-aware bila bermanfaat |
| Dynamic graph rebuild baru ditemukan | `r20_worker_owner_guard.ts` mengatur `numHands` 1/2 untuk owner dan bystander audit | Benchmark trade-off: fixed 2 (melihat distraktor), fixed 1 (kurang deteksi tangan kedua), atau adaptif berbasis bukti; jangan otomatis disable guard |
| Pistol C4/C7 bisa dijadikan semua pose | R19/R20 head utama hanya `POINT_READY/POINT_PRESS/OTHER` | R22 training taxonomy pose, pinch, pistol dibedakan; latih hanya bila ada label valid |

**File bukti:** `r20/candidates/r20_lowlight_frame_source.ts`, `r20_hand_landmarker.worker.ts`, `r20_hand_landmarker_cpu.ts`, `r20_worker_owner_guard.ts`, `r20_model.ts`, serta `frontend/implementation/src/components/nui-lab/lab-analyzer.ts`. Semua diverifikasi read-only pada sesi penyusunan. Jadi jangan meminta AGY membuang A4v2 dulu lalu menamainya A5. Pertahankan baseline dan lakukan ablation.

## C. Fakta dan jebakan API MediaPipe

- `ObjectDetector` resmi tersedia dari `@mediapipe/tasks-vision`, menerima model detector yang **kompatibel dengan task** dan memproduksi bounding box. `FilesetResolver.forVisionTasks()` menyediakan *WasmFileset* (alamat loader/binary), **bukan janji dua task berbagi satu graph/instance/memori**. Byte download bisa sama kalau path dan cache disatukan, namun memory dan CPU masih bertambah ketika membuat task kedua. Harus diuji versi pinned dalam frontend, bukan `@latest`.
- `HandLandmarker` dalam VIDEO mode melakukan tracking internal dan kembali melakukan palm detection saat confidence presence rendah. Masukan yang di-crop atau di-mask berubah tiap frame dapat mengganggu kontinuitas internal; efeknya **hipotesis**, perlu uji track retention, koordinat remap, kehilangan tangan, dan kasus bystander.
- `numHands=1` tidak menjamin tangan yang dipilih adalah tangan Owner. Bila tangan kedua ikut masuk, output satu slot membuat pergantian pemilik sulit diaudit. Satu **active owner** tidak sama dengan satu **detected hand**. Harus evaluasi prioritas ownership dengan 2 kandidat dan cost CPU.
- Web HandLandmarker mendokumentasikan landmarks, worldLandmarks, dan handedness. Jangan menambah required `landmark.visibility` jika hasil JS nyata tidak menyediakannya. Dapat menghitung temporal quality proxy sendiri, ditandai terpisah dari model score.
- `mediapipe-model-maker` custom object detection terdokumentasi tetapi deprecated. Pelatihan memakai dataset foto plus annotation COCO/VOC. TFLite INT8/metadata harus diuji `ObjectDetector.createFromOptions()` pada actual CPU worker. Tidak semua YOLO ONNX otomatis kompatibel dengan MediaPipe ObjectDetector.
- `MediaStreamTrack.getCapabilities` dan `applyConstraints` hanya best effort; webcam murah dapat tidak mengekspos exposure. Tidak boleh menjadi syarat agar aplikasi bisa berjalan.

## D. Dataset R17–R20 dan data baru untuk R22

1. **Pistol:** IPN HandS/Natural RGB/HandGesture-5G serta training rows R20 yang legal dan train-only. Periksa source-level dedup dan frozen splits. `POINT_READY` tidak sama dengan generic `ONE`, `POINT_PRESS` tidak sama dengan conversational pointing; `OTHER` wajib memuat hard negatives.
2. **Pose FIST/ONE/TWO/FIVE + pinch:** Ambil pose labels sah dari datasets, bukan pakai tebak ML/angle sebagai GT. Near/touch pinch bisa tetap geometry temporal jika data kontak teranotasi tidak ada.
3. **Temporal:** prioritaskan *real continuous sequences* dari IPN dan Natural RGB; foto static HG5G dapat dipakai untuk spatial head dan aug frame-level, tetapi tidak boleh disebut real temporal training hanya karena direplikasi 8 kali. Frame timing/duplicate dan label transisi harus valid.
4. **Lowlight/blur:** augmentasi pada RGB train-only sebelum MediaPipe extraction. Miss detection dihitung di jalur detector; jangan menyimpan fitur nol lalu mengklaim klasifikasi benar. Stress test mencakup actual video Owner yang sudah tersedia, plus held-out datasets terpisah.
5. **Custom detector bbox:** dataset tambahan bergambar dengan bbox **harus ditemukan dan dicek lisensi, subjek, domain, kualitas anotasi, ukuran, akses**. Tidak boleh langsung memasukkan HaGRID (HOLD license), EgoHands atau mirror pihak ketiga tanpa memeriksa lisensi rilis aslinya. `nui-lab-benchmark-S-07ba0cde (1).json` berisi telemetry, bukan foto berannotasi bbox. Jika tidak ada foto legal saat deadline, `CUSTOM_DETECTOR=DEFERRED` tanpa menggagalkan seluruh R22.
6. **Tidak ada label manual Owner:** benchmark auto memberi `predicted_label`, `accepted_action`, `rejection_reason`, `weak_label` bila rule menghasilkan, `ground_truth=null` untuk penggunaan bebas. Data baru untuk supervised training memerlukan GT dari label publik yang sah atau label dari skrip/aksi terkontrol yang independen. Data Owner tidak otomatis boleh dijadikan training hanya karena disimpan IndexedDB.

## E. Urutan realisasi R22 selama 3 hari

| Gate | Eksekusi | Kriteria bukti |
|---|---|---|
| G0 | Baseline sumber, source hash, data/label/license registry, audit JSON/video, bandingkan `R20 RAW/A4` | Cek temuan khusus webcam fisik, pisahkan *observed no-landmark* vs actual detector miss dengan hand-present GT yang tidak tersedia |
| G1 | UI dua pilihan, kiri kamera sticky/fixed dan kanan independen scroll, CPU-only runtime, satu consent, auto-trials dan export JSON | E2E halaman/route, numerik canvas dan gesture tercatat, frame ID sync, no manual GT/scenario |
| G2 | Resolusi ink gate tunggal, finger-state FSM FIST→1/2, ownership/acquisition, blur fail-closed, smoothing ablation | Replay event tests no ghost stroke/no unauthorized action; kasus T004 19 stroke/5 gap menjadi regression fixture |
| G3 | R22 retrain eligible dataset + temporal candidate **hanya bila valid sequences**, capture-window timestamps dan derived quality | Source/split hashes, frozen holdout, real vs synthetic, macro F1 + action-error + detector missing + CPU size/latency |
| G4 | `ObjectDetector` as conditional research; offline export-load and CPU trial; no blocking dependency | Model bbox berlisensi/terverifikasi, runtime/API metadata, side-by-side latency and miss on same physical frames, genuine ROI benefit |
| G5 | Physical webcam owner validation + CPU/network/privacy gates, pinned preview | Per-condition known limits, auto-export screenshot, callback evidence, status NOT_TESTED where absent |

**Stage 2 Go/No-Go custom detector:** Jangan trigger dengan angka `>15%` tanpa konteks; dari JSON tidak diketahui apakah tangan benar-benar terlihat selama seluruh no-hand frames. Tentukan berdasarkan **false negative saat tangan memang hadir**, error ownership, improvement yang meaningful pada physical clips, dan overhead CPU. Angka threshold, ROI margin, temporal window, weights bytes dan transfer size semua *prototype candidates*, bukan pass guarantees.

**Critical path:** hari pertama harus memperbaiki UX/recorder dan ink gating; retrain small heads paralel setelah audit source. Hari ketiga untuk eksperimen perbandingan dan delivery dev yang mendapat izin; jika custom detector masih investigasi, R22 bisa tetap dilanjutkan dengan MediaPipe yang ada, tanpa memalsukan klaim anti-seluruh kondisi.

## F. Pengukuran yang wajib dipisah agar hasil tidak menipu

- `capture_unique_fps` dari timestamps camera/presentedFrames; `processed_inference_hz` dari completed inference; `ui_render_fps` dari rAF; `action_latency_ms` dari capture→accepted event; `queue_delay_ms`, detector/landmarker/temporal head p50/p95.
- `NO_HAND_OBSERVED` berarti model tidak mengeluarkan landmark; **tidak selalu false negative** jika tangan memang tidak berada pada frame. Tanpa GT keberadaan tangan dari video/anotasi, tidak boleh dilabeli `DETECTOR_MISS_RATE` sebagai recall biologis. Gunakan nama telemetry yang jujur.
- `ROI_MISS`, `TRACK_SWAP_SUSPECTED`, `LOW_QUALITY_FRAME`, `STALE_FRAME`, `FRAME_DROPPED_BUSY`, `DUP_FRAME_CANDIDATE` adalah heuristic yang perlu dijelaskan; bukan label kebenaran mandiri.
- `network_bytes` harus dihitung CDP journey nyata (lab dan gameplay siswa); `WASM alloc`, model init peak memory, GC stall, worker count dan latency harus dicatat. Reuse file WASM tidak berarti memory zero-cost.
- Frame skipping hanya untuk inferensi yang memang tidak perlu; **timer FSM/fail-closed harus tetap maju** sehingga virtual keys/ink tidak menggantung saat frame identik, tab hidden, atau webcam berhenti.
- Jika physical sensor hanya 12–15 unique FPS, tidak boleh mengklaim ≥20 Hz real new-frame inference. UI 60 FPS bukan bukti deteksi 60 FPS.

## G. Verifikasi sumber teknis resmi

*Ini rujukan API, bukan sitasi akademik proposal; hanya Dapus proyek boleh dipakai untuk sitasi proposal.*

- https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://developers.google.com/edge/api/mediapipe/js/tasks-vision.filesetresolver
- https://developers.google.com/edge/mediapipe/solutions/customization/object_detector
- https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities
- Source code: https://github.com/lustresense/hitl-momo/tree/research-can/r20/candidates
