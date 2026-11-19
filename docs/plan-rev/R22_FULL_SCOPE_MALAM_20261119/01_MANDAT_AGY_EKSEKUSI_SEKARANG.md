# PERINTAH EKSEKUSI AGY — R22 NUI LAB FULL SCOPE, MALAM INI

**STATUS:** Prompt ini disusun untuk dikirim oleh Owner. Ini **perintah implementasi**, bukan permintaan membuat roadmap, bukan izin otomatis merge/deploy, dan bukan bukti bahwa fitur sudah berjalan.

> Instruksi Owner terbaru menggantikan prioritas semua prompt R22 lama. **Seluruh scope harus dikerjakan, bukan dibagi dalam 3 hari atau dipangkas oleh agent.** Jalankan pekerjaan secara paralel dengan worker yang tidak saling menimpa file. Target pelaksanaan malam ini. Jangan meminta Owner memilih konfigurasi teknis; deliver pengalaman yang langsung dapat dicoba. Jika ada klaim tidak dapat dibuktikan, laporkan dengan bukti sambil tetap mengerjakan bagian lain. Jangan mengarang status PASS atau menjanjikan runtime yang belum diuji.

## Input dan sumber wajib

1. **Baca dokumen aktif** `00_BACA_DULU.md`, `02_MASTER_SPEC_R22.md`, `03_ACCEPTANCE_MATRIX.md`, `04_AUDIT_BUKTI_DAN_KOREKSI.md`, dan `05_PENGIRIMAN_DAN_DEPLOYMENT.md`. **Jangan** menjadikan `references/claude/R22_AGY_PROMPT_FINAL.md` sebagai prompt yang menang, karena dokumen itu menyunat scope menjadi P0 3 hari dan menyatakan training/temporal/detector ditunda.
2. Gunakan kedua JSON di `references/benchmarks/` sebagai sumber telemetry Owner. Jalankan `references/claude/analyze_nui_bench.py` pada benchmark **four-trials** untuk reproduksi; jangan mengklaim angka dari file ini sebagai ground truth. Audit perbedaan ekspor two-trials vs four-trials.
3. Baca kode dan manifest R17/R18/R19/R20 serta package `frontend/implementation` yang nyata. Referensi `references/previous-research/` dan `references/claude/R22_AUDIT_CLAUDE.md` membantu memahami hipotesis, tetapi keputusan implementasi harus dari source dan tes.
4. **Jangan mengakses** folder `contexts/can/research/.context-notforagent` tanpa izin eksplisit baru dari Owner; arsipnya bukan instruksi publik untuk agent terminal. Bukti yang relevan disalin/diringkas di paket ini.

## Kontrak repository, eksekusi dan delegasi

- Fetch dan catat HEAD `main` terbaru, snapshot yang terakhir diperiksa adalah `e3e74bf` (0.29.0-alpha). Jangan mulai dari `68a7d9a` atau branch R20 yang tertinggal. Buat worktree/branch **terisolasi** misalnya `r22-nui-lab`, jangan mengubah production atau push ke `main` tanpa izin Owner.
- Delegasikan minimal workstream paralel: **UI**, **MediaPipe/worker/frame pacing**, **Canvas/FSM**, **Recorder/autolabel**, **Data lineage + retraining**, **Temporal model + robustness**, **custom detector/ROI experiment**, **QA/evidence integrator**. Tentukan file ownership, antarmuka/type contracts dan dependency; hindari dua worker mengedit file sama. Orchestrator integrasi, bukan hanya mengeluarkan laporan riset.
- Prioritaskan bug yang menghalangi Owner menggunakan Canvas, tetapi **jangan tunda/menghapus** workstream model, dataset dan experimental detector. Dependency penting dikerjakan tanpa blocking palsu. Bila butuh scope luar NUI Lab untuk interface, isolasi/adapter dan regresi gameplay; laporkan path yang perlu izin Owner sebelum mengubah flow siswa.
- Jangan minta Owner mengatur GT, label skenario, model C4/C7, jenis cahaya, CPU/GPU atau detector. Hal-hal itu milik sistem internal. Owner hanya harus consent kamera, memilih Gesture/Canvas dan mencoba gerakan tangan.

## TUGAS EKSEKUSI WAJIB, SEMUA TERMASUK

### 1. UX/UI `/nui-lab`, Gesture, Canvas dan Diagnostics

- Redesign frontend menjadi experience product Owner, bukan dashboard engineer. Entry dua CTA **Coba Gestur** dan **Coba Canvas**; tidak ada selector model, low-light, detector, scenario, manual GT atau benchmark Start. Kamera live **tetap di kiri** pada desktop, dengan skeleton overlay dan status AI sinkron. Panel interaksi/Canvas dan diagnostic ringkas **di kanan**, scroll internal; tidak ada kamera duplikat di header atau kamera yang hilang saat scroll. Responsif, keyboard accessible, status failure manusiawi.
- State kamera/landmarks/gesture/action terikat `captureFrameId`, `processedFrameId`, timestamp. Saat lag tampilkan stale status, jangan memalsukan bahwa label lama adalah hasil tangan saat ini. Status tunggal `R22 · CPU · Otomatis` hanya bila model/engine teridentifikasi benar di metadata, dan diagnostic menunjukkan model SHA; jangan menyembunyikan C4 fallback di balik label R22 seolah sudah trained.
- Kamera tidak otomatis disimpan sebagai video. Sesi benchmark otomatis berjalan **sesudah consent**, tidak ada label manual. JSON/CSV hasil bisa diunduh dalam satu aksi.

### 2. MediaPipe CPU Worker, frame freshness dan owner guard

- Pertahankan `@mediapipe/tasks-vision` HandLandmarker, mode VIDEO, CPU Worker, max 1 in-flight. Periksa dua jalur submit `NuiLabPage.tsx` dan callback worker. Terapkan **frame unik** dengan `requestVideoFrameCallback` bila tersedia, fallback metadata/frame hash. Tidak ada inferensi ulang frame yang sama hanya karena hasil worker tiba. Telemetry pisahkan capture FPS, detection Hz, UI FPS, frame age, duplicate skip dan busy drop.
- Hentikan perubahan `numHands` 1↔2 saat runtime yang memicu `setOptions` berulang. Buat benchmark fixed 1 vs fixed 2 **termasuk tangan kedua**; pilih default CPU berdasarkan keselamatan ownership dan latensi, bukan angka tunggal. Catat `setOptionsCalls` runtime dan per-frame. Jangan menggunakan numHands=1 statis tanpa bukti anti-bystander.
- Satu owner track otomatis, tanpa tombol manual relock; ketika dua tangan berinteraksi, fail-closed, jangan ganti owner semaunya. Pulihkan ketika satu owner baru stabil dan tangan lama hilang.

### 3. Canvas, action resolver, stroke continuity

- Hapus gate pistol `POINT_READY/PRESS` dari route Canvas; pistol tetap untuk Gesture bila relevan. Buat **satu canonical pinch evaluator** dengan contact threshold ketat, hysteresis dan timestamps. Buat **satu `ActionIntentResolver`** yang mengendalikan `StrokeStore` secara terurut dan no mutation on reject. Jangan biarkan `ink.feed()` menulis store ketika gate akhir menolak.
- Betulkan re-arm. `releaseAllInternal()` jangan men-reset seluruh state pada satu frame NO_HAND; gunakan `lost()` / grace pipeline yang sudah ada, dan reset total hanya ketika grace habis/owner berubah/invalid. Uji 62, 99, 220, 603 ms dan 12.657 ms agar tidak menghubungkan stroke yang salah. Batas grace dipilih dari test, jangan asal 150/250 ms.
- Gestur Canvas **pinch rapat→DRAW**, **telapak 5 jari→ERASE**, **kepal→NEUTRAL/ARM**, **kepal stabil→1 jari stabil→UNDO sekali**, **kepal stabil→2 jari stabil→REDO sekali**. Tidak ada swipe Undo/Redo. Durasi threshold dalam milidetik/unique camera frames, edge trigger, cooldown, rearm dan fail-closed bila owner hilang.
- Audit juga fungsi resize radius eraser oleh tangan kedua bila masih ada; jangan diam-diam membuang fitur existing, tetapi pastikan tangan kedua tidak mencoret atau mengambil alih owner. Perbaiki ketidakstabilan jitter, stroke breaks, ghost stroke, hand crossing dan redrawn/mirror coordinate; ukur before/after dengan replay dan webcam. Pertahankan smoothing existing jika lebih unggul, bukan menggantinya hanya karena nama algoritme baru.

### 4. Auto benchmark lengkap tanpa kerja manual Owner

- Recorder IndexedDB otomatis semua route/canvas/gesture. Tidak ada manual GT, skenario, pemilihan engine, consent berulang per-route atau tombol perekaman wajib setiap coba. Autocapture setelah consent, autosave, recover setelah reload, lifecycle `hidden`, `pagehide`, camera reset, crash dan route switch. Export satu JSON yang memuat seluruh trial dan event, plus optional CSV.
- Autolabel semua **prediksi/event/aksi/quality secara otomatis** dengan `labelSource`. Jangan memakai prediksi classifier sebagai GT. Source-independent eval GT hanya dari dataset legal yang memang berlabel. Telemetry wajib menangkap new camera frame IDs, actual model/preprocess, luma ROI, clipping/glare, blur proxy, owner hand, reasons, latency, stroke gaps, shake/jitter, rejection, undos/redos dan jumlah dropped records.
- Perbaiki summary agar raw no-hand tidak disalahartikan sebagai detector miss tanpa GT. Bedakan jendela first-last, tab hidden, user off-frame, short flicker, and true uncertain. Jangan klaim zero false press dari file tanpa GT.

### 5. Adaptif webcam murah, low-light, glare, motion blur, distraksi, sudut ekstrem

- Audit A4v2 existing terlebih dahulu. Sudah ada temporal EMA, denoise, downscale dan Reinhard. Jangan hanya rename jadi A5. Implement kandidat perbaikan yang betul-betul baru atau perubahan terukur: duplicate frame pacing, shadow chroma handling, highlight soft-knee/bypass, percentile and hand ROI glare proxy, webcam capabilities opportunistic (tanpa hard dependency), mode adaptif, motion blur quality detection, 1-Euro filter variable dt dan masking/crop ROI research.
- Ukur pada same-frame ablation RAW vs A4 vs kandidat. Uji RGB fisik yang tersedia serta dataset kondisi buruk berlisensi. Jika kamera benar-benar underexposed/overexposed/blur sampai informasi hilang, fail-closed dan beri petunjuk UI minimal, jangan fabrikasi landmarks atau meneruskan tinta berdasarkan prediksi imajinatif.
- ROI/masking bukan jaminan 100% anti distraksi. Uji camera-to-canvas transform, hand enters/leaves ROI, bystander crossing, loss and reacquire; jangan memotong tangan owner atau menghilangkan tangan lain yang diperlukan owner safety.

### 6. Retraining classifier dari seluruh sumber R17–R20, bukan opsional

- Jalankan audit dataset lengkap R17, R18, R19, R20. Verifikasi file, hash, status legal, label mapping, split per person/session/video, duplicate clusters dan consistency 68D/82D. Reuse yang eligible; `HOLD_LICENSE`, NC, blocked dan locked-test **tidak** dimasukkan training produk. Cari sumber baru yang legal untuk lowlight, glare, motion blur, occlusion, cheap webcam and distractors.
- Di GPU training yang tersedia, **jalankan training ulang untuk semua head classifier yang relevan**: pistol READY/PRESS/OTHER, pose fist/one/two/five/other, pinch/near-pinch jika label sah, dan temporal classifier TCN/MLP. Jika sumber berlabel untuk suatu head belum cukup, cari/curate legal source, uji geometry+FSM fallback, dan laporkan DATA_GAP secara jelas tanpa berpura-pura ada trained head. Training bukan pengganti fix Canvas.
- Lakukan augmentasi realistik train-only: exposure/glare, shot/chroma noise, blur, compression, perspective, occlusion, finger dropout, landmark jitter, frame-rate drop/variable dt dan hard negatives. Jangan train dari Owner JSON sebagai GT tanpa label; gunakan telemetry untuk robustness/proxy/unsupervised consistency dengan provenance yang jelas.
- Bandingkan semua kandidat dengan C4/C7 dan baseline R17–R20 pada person/video-disjoint heldout and OOD. Laporkan per-class metrics, false-trigger negatives, calibration, latency, weight bytes, CPU browser runtime. Output model binaries + deterministic conversion to pure TS / CPU Worker, manifest dan model card. **Training semua kandidat wajib, mengaktifkan model yang tidak lulus tidak boleh.**

### 7. Temporal classifier, One-Euro dan custom detector tidak boleh dicoret dari pekerjaan

- Buat, train, dan uji **temporal gesture classifier** dengan sequence sebenarnya dan delta waktu nyata; bukan menyalin satu frame ke 8 posisi. Eksperimen window 3/5/8, causal inference, loss reset, variable frame rate dan negative transitions; latensi serta benefit harus dibandingkan dengan C4 + FSM. Jangan mengarang landmark `visibility` kalau API tidak mengembalikannya.
- Buat 1-Euro filter proof dan test dengan real jitter/fast press, pisah dari ink smoothing.
- Buat **custom hand detector workstream** mulai dari riset data bbox berlisensi, proof MediaPipe ObjectDetector TFLite dan CPU Worker integration, eksperimen tiny INT8 model beserta metadata, ROI-to-HandLandmarker behavior, acquisition performance, wire/heap/latency. ObjectDetector tidak otomatis menggantikan palm detector internal, dan FilesetResolver tidak membuktikan reuse satu WASM instance. Bila data bbox sah tersedia, latih dan ekspor candidate; bila tidak, buktikan gap dan cari data legal lain serta uji prototype. ONNX/YOLO boleh dijadikan comparator riset jika perlu, bukan default runtime. Tidak boleh memaksa extra detector ke default jika menurunkan hasil.

### 8. QA, regression dan perf wajib sebelum menyebut selesai

- Reproduce `references/claude` script + baseline T004, unit/integration per kontrak, fault injection, race/lifecycle, multi-hand, near-pinch negative, blur+lowlight stress, different skin/background and camera quality, consent+IndexedDB+export, UI viewport screenshot, genuine webcam if physical access ada.
- Jalankan NUI Lab 210-test suite (baseline Ujang PASS), serta test baru khusus R22. Catat actual count & failures, jangan memakai laporan lama sebagai hasil test sekarang. Full Vitest legacy memiliki 22 fail di R19/R20; 8 sudah dipatch di worktree Ujang menurut laporan, 14 tersisa. Jangan mengulang diagnosis itu sebagai alasan menolak test NUI spesifik, tetapi jangan klaim full gate PASS.
- Ukur cold transfer <25 MB pada journey spesifik, heap/CPU/fps/p95, `setOptions` transitions, number unique frame processed, 0 ghost/stuck actions pada replay yang relevan. Benchmark tetap disertai kondisi pengujian dan input digest.
- Proof report berisi commit SHA, branch, perubahan file, semua tests, model artifacts, dataset lineage/legal, CPU measurement, screenshot/video, JSON before-after, daftar isu yang tersisa **tanpa disembunyikan**. Jangan bilang `100% anti-*`, approved atau done tanpa bukti runtime.

## DEFINISI HASIL YANG HARUS DIKIRIM KE OWNER

Semua berikut adalah deliverables wajib, tidak dipindah ke 'next sprint':

- Code R22 terintegrasi pada worktree/branch dan commit terisolasi, dengan diff review.
- UI baru untuk dua route yang langsung bisa dipakai tanpa selector teknis, kamera kiri tetap terlihat, scroll kanan.
- Pipeline CPU + hand ownership + frame pacing + adaptation yang direview dan dibenchmark.
- Canvas FSM/resolver + gestur Undo/Redo baru, stroke continuity dan eraser 5 jari.
- Auto benchmark + autolabel prediksi/action + export JSON/CSV, schema reader dan privacy controls.
- Dataset lineage R17–R20, license gate, scripts training, output masing-masing candidate + temporal, model cards dan perbandingan valid.
- Custom detector/ROI research implementation + evidence A/B; keputusan integrasi berdasarkan hasil, bukan dugaan.
- Tests dan evidence fisik/sintetis terpisah, per-komponen PASS/FAIL/NOT_TESTED yang jujur, CPU/wire runtime.
- Handoff Ujang untuk deployment dev terisolasi dengan verifikasi, rollback dan approval yang benar; tidak menyentuh production.

**Jangan membalas hanya dengan plan 3 hari. Mulai delegasi dan implementasi sekarang. Kerjakan seluruh workstream secara paralel malam ini, tidak ada izin membuang area pekerjaan yang diminta Owner.**
