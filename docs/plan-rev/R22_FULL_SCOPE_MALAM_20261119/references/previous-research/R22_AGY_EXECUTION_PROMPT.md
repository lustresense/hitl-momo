# AGY EXECUTION BRIEF — R22 NUI LAB v2 (SETELAH AUDIT GOOGLE AI)

**Status:** belum dikirim ke AGY, belum diimplementasikan; repo READ-ONLY pada penyusunan ini. Ini *prompt eksekusi kandidat* untuk dipakai setelah Owner memerintahkan AGY bekerja pada worktree/branch terisolasi. Tidak memberikan izin deploy, merge `main`, atau ubah production/gameplay siswa.

AGY, baca `R22_RISET_DAN_RENCANA_LENGKAP.md`, `R22_AUDIT_GOOGLE_AI_DAN_KEPUTUSAN_TEKNIS.md`, `R22_ACCEPTANCE_MATRIX.md`, manifest R17–R20, `SOUL.md`, `DECISIONS.md`, `WORKING_STATE.md`, dan AGENTS repo. Jangan membaca ringkasan Google AI sebagai keputusan engineering atau proof of performance. Kerjakan R22 secara terukur dengan prioritas UX/Canvas dan input reliability.

## Product experience non-negotiable

1. `/nui-lab` hanya 2 pilihan **Coba Gestur** dan **Coba Canvas**. Sesudah kamera/benchmark numerical consent sekali yang jelas, Owner langsung mencoba. Tidak ada menu C4/C7, worker, CPU, cahaya, skenario, GT, atau start recorder manual. Internal manifest tetap merekam konfigurasi yang sebenarnya.
2. Desktop kamera di kiri selalu terlihat; kanan scroll mandiri berisi Gesture/Canvas + feedback live. Satu keputusan pose/aksi per actual processed frame dengan frame ID/timestamp; jika stale tampilkan stale. Kamera tidak dipindah otomatis saat scrolling.
3. Automatic session dan trial lintas route/camera restart; record semua frame *yang benar-benar diproses*, skipped/dropped frame counters, hand state, pose, rejected actions, stroke split/erase/undo/redo, latency, gesture state, storage errors. IndexedDB after explicit consent, local, no silent upload/video capture, recovery interrupted, export JSON satu tombol. Auto labels sebagai predictions/events, bukan manual GT atau accuracy truth.
4. Canvas: PINCH DRAW; telapak lima jari ERASE; FIST arming→ONE undo; FIST arming→TWO redo, satu aksi per transisi. No swipe. One authoritative ActionIntentResolver, no double R19/R20 gate changing stroke state. Wrong hand/NO_HAND/ambiguous/late frame = fail closed, no stroke bridging across unknown motion. Pinch-near bukan touch. Lock primary hand, second hand can't silently steal, reacquire when safe.

## Audit source sebelum menulis fitur baru

Buktikan apa yang R20 sudah punya. `r20_lowlight_frame_source.ts` A4v2 memiliki `motionGatedTemporalEmaInPlace`, `sepMedian5RgbaInPlace`, conditional `denoise3x3RgbaInPlace`, dan `reinhardExposureLutInPlace`; CPU worker sudah downscale 320 dan latest-frame-wins; `r20_worker_owner_guard.ts` mengaudit bystander via numHands adaptif. **DILARANG mengklaim fitur baru jika implementasi serupa sudah ada; lakukan ablation dan root cause.** Jangan hapus R20 sebelum comparator lulus.

## R22 candidate input pipeline (semuanya harus diuji)

- Same-camera capture frame ID/media timestamp via `requestVideoFrameCallback` bila tersedia; distinct rendering FPS vs processed frames vs unique camera frames. Dedupe pixel checksum hanya jika tidak men-drop valid gerak subtle dan tidak menghambat FSM/release timers.
- Reuse A4v2; ablate RAW vs R20 vs kandidat perbaikan: peak-clipping detection *before preprocessing*, tone-map selectively, quality-gated temporal denoise, ROI-quality and shadow chroma changes. Jangan klaim memperbaiki pixel hardware yang sudah saturasi putih. `getCapabilities/applyConstraints` opsional dan graceful fallback.
- Ownership anti-distraction: test R20 dynamic numHands vs fixed numHands=2 vs fixed numHands=1 + ownership guard. One active owner tidak sama dengan only one detected. ROI mask/crop hanya bila memberi **perbaikan terukur** pada prerecorded physical input, tetap koordinat video konsisten; verify hand crossing/miss/reacquire. Jangan mengklaim ROI 100% anti-distraksi atau setOptions selalu harus dimatikan.
- One-Euro smoothing dengan dt dari actual unique capture, separate cursor/stroke model. Jaga lag di transisi CLICK/RELEASE dan hard fail-closed.
- R22 classifier: re-audit seluruh dataset & hasil R17/R18/R19/R20, cek license, usable train-only rows, dedup, canonical 82D feature hash, label mapping, frozen train/val/test, person/video/cluster leakage. Retrain pistol classifier; temporal model candidate hanya bila ada real sequence supervisi. Jangan membuat 8-frame real training dari foto statis dengan menggandakan frame. Pose head/pinch head hanya bila label sah, selain itu geometry FSM. Structured landmark jitter/dropout/occlusion/RGB blur lowlight augmentation TRAIN only. Jangan menganggap JSON webcam Owner unlabeled sebagai supervised ground truth.
- OPTIONAL DETECTOR RESEARCH **separate gate:** `@mediapipe/tasks-vision` ObjectDetector dengan `.tflite`+metadata valid, training RGB+bbox berlisensi aman (COCO/VOC; HaGRIDv2 HOLD), CPU browser API smoke, CDP wire + peak memory + init + p95 dual-task inference + Owner sample ROI correctness. `FilesetResolver` hanya mengonfirmasi fileset; tidak membuktikan satu WASM instance/0 memory. Custom detector bukan blocker 3 hari. Model Maker deprecated, pin toolchain dan verifikasi export-load. Jika gagal salah satu, `DEFERRED` dengan laporan, bukan memaksa ONNX/YOLO berat.

## Existing Owner evidence & regressions

Use latest `nui-lab-benchmark-S-07ba0cde (1).json`, 4 trials/7,612 frames. Canvas T004 2,082 frames, 671 no-landmark, 19 strokes, 5 unexpected breaks, 54 pinch ON, 68 rejection events and 82 `Cubit ditolak gate R19` frame reasons. Don't claim 671 false-negative cases without GT for hand presence. 4 undo via button, not proof of gesture undo. Keep two physical videos as visual evidence; they are not automatically shareable training footage. Solve gate conflict, jitter and ownership before expensive model experiments.

## Execution / deliverables

- Day 1: verified registry/cache and UI/recorder/Canvas gate baseline fixes. E2E visual/screenshots and JSON export covering both routes.
- Day 2: FSM/ownership/smoothing and retrain eligible classifier+temporal ablation, regression from real traces. Separate media input gate and model output gate.
- Day 3: side-by-side physical/recorded footage evaluations, CPU/wire/memory, fallback candidate if feasible; QA and report. Physical human hand testing only if genuinely available. Gate name/test details + NOT_TESTED where absent.
- Source modifications in isolated worktree. No new git push/merge/deploy unless separate Owner permission. Do not modify student gameplay/production.

**Report:** exact SHA and changes, dataset provenance/checksums/licenses, baseline vs R22 (raw/preprocess, detector, classifier, action pipeline), source-verified features reused, missing frame vs true detector false-negative qualification, temporal train validity, tests including no-hand/second-hand/fist→1/2/5/pinch+stroke, actual CPU/browser network, memory, benchmark JSON, UI screenshots, known limits. State whether optional ObjectDetector is FEASIBLE/DEFERRED/FAILED based on measured evidence. Do not claim 'final', '100%', 'accuracy' without GT, 'MediaPipe fine-tuned', or '2 tasks 1 WASM instance' absent runtime proof.
