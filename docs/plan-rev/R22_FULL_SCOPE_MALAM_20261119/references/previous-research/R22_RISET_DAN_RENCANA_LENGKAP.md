# R22 NUI LAB — RISET, ARSITEKTUR, RETRAINING R17–R20, DAN RENCANA IMPLEMENTASI 3 HARI

**Tanggal:** 19 November 2026 · **Revisi kajian:** v2 setelah telaah percakapan Google AI dan pemeriksaan source R20 · **Status:** Mandat riset dan spesifikasi *kandidat R22*, BELUM diimplementasikan dan BELUM diuji · **Repository:** READ-ONLY dalam penyusunan dokumen ini.

**Tujuan Owner:** Membuka `/nui-lab`, memilih **Coba Gestur** atau **Coba Canvas**, bergerak/menggambar menggunakan webcam, lalu memperoleh benchmark otomatis. Tanpa pilihan C4/C7, CPU, cahaya, skenario, atau label ground truth manual. Semua data yang boleh direkam tersimpan lokal dengan consent sekali per sesi/izin persisten yang transparan. Sistem MediaPipe + classifier harus tampak sebagai **satu produk NUI R22**, walaupun secara teknis terdiri dari beberapa komponen.

**Batas scope:** R22 lab/staging dan riset NUI, bukan otomatis perubahan mapping global gameplay siswa, proposal, atau keputusan PA formal. Tidak menyentuh production. Semua status training, score, dan deployment setelah dokumen ini wajib diverifikasi AGY/Ujang melalui artefak dan runtime.

**PENTING:** Audit integrasi atas usulan Google AI ada di §9 dan `R22_AUDIT_GOOGLE_AI_DAN_KEPUTUSAN_TEKNIS.md`. R20 A4v2 sudah memiliki sejumlah teknik yang diusulkan sebagai hal baru, sehingga tindakan R22 adalah evaluasi dan penguatan, bukan penggantian berdasarkan nama fitur.

## 0. VERDICT DAN KONTRAK KEJUJURAN

1. **GO dengan syarat untuk mengembangkan kandidat R22 dalam tiga hari.** Realistis untuk UI sederhana, log otomatis, retuning MediaPipe CPU, revisi FSM, retraining classifier kecil dari seluruh data R17–R20 yang **eligible**, augmentation blur/cahaya, dan uji fisik dengan bukti. **TIDAK realistis** menjanjikan fine-tune bobot internal MediaPipe Hand Landmarker, akurasi sempurna, atau tracking anti-semua-gangguan dalam tiga hari.
2. **R17–R20 wajib diaudit dan digunakan ulang secara sistematis, bukan digabung buta.** Dataset R17 HaGRIDv2 masih *HOLD_LICENSE*; beberapa data pernah menjadi evaluation-only atau locked test. Data yang sama muncul pada banyak revisi, tidak boleh dihitung empat kali dan tidak boleh dipindahkan dari locked test ke train hanya untuk menaikkan skor.
3. **Retrain semua head classifier yang relevan ketika ada label sah.** Minimal head `POINT_READY/POINT_PRESS/OTHER` dilatih ulang; head pose (`FIST/ONE/TWO/FIVE/OTHER`) dan deteksi pinch (`CONTACT/NEAR/OPEN`) dilatih **hanya bila** ada supervision sah setelah audit. Kalau kekurangan label, pakai geometry + temporal FSM dan tulis `DATA_GAP`, jangan melatih classifier dengan pseudo-label yang dianggap kebenaran.
4. **Autolabel ≠ ground truth.** Prediksi model boleh otomatis disimpan sebagai `predicted_label`, temporal rule label sebagai `weak_label`, dan event aksi sebagai `observed_event`. Tidak boleh membuat confusion matrix/precision/recall atau klaim “false press 0” dengan membandingkan prediksi terhadap dirinya sendiri. Tidak perlu meminta Owner mengisi label.
5. **Antiblur dan antilowlight adalah kemampuan bertahan dan gagal secara aman**, bukan kemampuan memulihkan informasi sensor yang sudah hilang. Saat landmark tidak layak, berhenti menggambar/mengontrol, laporkan penyebab, dan reacquire tanpa mengambil alih tangan orang lain.

## 1. BUKTI LANGSUNG DARI OWNER, BUKAN BENCHMARK SINTETIS

Berkas terbaru `nui-lab-benchmark-S-07ba0cde (1).json`, app `0.27.0-alpha` (gitCommit adalah label build `main-0.27.0-alpha-r20lab`, **bukan full Git SHA yang terverifikasi**). Sesi disimpan sebagai `active`, 4 trial, 7.612 frame, 445 event dan 0 dropped record dilaporkan. Screenshot menunjukkan menu model/CPU/cahaya/skenario/GT dan layout kamera yang tidak membantu pengujian; *contact sheets* dua rekaman menunjukkan output gesture dan canvas yang sulit ditafsirkan dan garis yang terfragmentasi. Angka dari laporan sintetis AGY tidak menggantikan bukti ini.

| Trial | Mode | Konfigurasi | Frame | Frame tanpa tangan | Detector Hz rata-rata | Pipeline p95 | Temuan |
|---|---|---|---:|---:|---:|---:|---|
| T001 | Gesture | R20 C7 + A4 CPU Worker | 2.297 | 468 (20,4%) | 22,395 | 85,14 ms | 30 HAND_LOST |
| T002 | Gesture | R20 C4 + A4 CPU Worker | 2.907 | 1.573 (54,1%) | 9,664 | 88,80 ms | 11 kejadian tab hidden; **bukan perbandingan terkontrol** |
| T003 | Gesture | R20 C4 + RAW CPU Worker | 326 | 231 (70,9%) | 13,578 | 37,80 ms | periode pendek dan ada tab hidden |
| T004 | Canvas | R20 C4 + RAW CPU Worker | 2.082 | 671 (32,2%) | 12,721 | 66,26 ms | 19 stroke, 5 break karena detector miss, 68 ACTION_REJECTED, 4 undo via tombol, 0 redo |

**T004 penting:** 54 event `PINCH_ON`, 54 `PINCH_OFF`, hanya 19 `STROKE_START`; 5 dari 19 stroke berakhir dengan `detector-miss`; 82 frame memakai alasan `Cubit ditolak gate R19`. Jitter tinta pada sampel stillness memang lebih rendah dari raw (`0,677` vs `2,881` px rata-rata), tetapi ini **tidak membuktikan stroke mulus** karena 5 break, 13 hand-loss, dan banyak transisi pinch tidak menjadi stroke. `truth=UNLABELLED` pada 2.082 frame T004. Hitungan `actionsRejected=68` adalah event, tidak sama dengan total frame rejectReasons. T004 berakhir `null` karena export diambil saat sesi masih aktif; perlu lifecycle finalisasi otomatis.

**Prioritas diagnosis yang didukung bukti:** MediaPipe detection/visibility, gate ganda R19/R20 vs tinta, log sinkronisasi, ownership, pinch temporal, dan UI. Menambah sampel training tanpa memperbaiki gate ganda tidak menjawab 82 penolakan tersebut.

## 2. AUDIT SUMBER R17 SAMPAI R20, TANPA MENGHIDUPKAN DATA YANG DILARANG

Sumber internal dibaca pada GitHub `main` dan `research-can` tanggal dokumen; data mentah yang hanya ada di cache VM **belum diperiksa langsung**. `AVAILABLE_IN_MANIFEST` bukan sama dengan berkas ada saat AGY menjalankan training. Setiap data harus melewati `stat`, SHA-256, license receipt, dan manifest provenance saat eksekusi.

| Asal revisi | Dataset/artefak | Status menurut manifest lama | Tugas R22 dan pembatas |
|---|---|---|---|
| **R17** | HaGRIDv2 annotations/landmarks; subset berbagai pose | pernah didownload, **HOLD_LICENSE** untuk weights | Boleh dipakai untuk studi mapping dan evaluasi internal dengan izin yang sesuai; **jangan masuk product training** sampai keputusan lisensi eksplisit. R17 menunjukkan `OK`/pinch-like bukan pinch-touch dan tidak boleh dinyatakan sama. |
| **R17 → R18** | IPN HandS temporal annotations + GT/MPHands landmarks | R17 blocked download, **R18 melaporkan berhasil unduh dan verifikasi checksum** | Reuse 200 video dan split per-person R18/R19; valuable untuk transition, neutral, distractor. Label P1F tidak otomatis `POINT_PRESS`; tidak ada label presisi thumb-index pinch contact. |
| **R18** | Dataset egocentric/exocentric BXR7 dua slice `dim_light_1` dan `natural_light_1` | DOWNLOADED_AND_VERIFIED di R18, pada R19 EVAL_ONLY, beberapa slice terbatas | Kandidat hard negatives dan audit multi-person, motion blur, lowlight. Pertahankan seluruh holdout yang sudah dikunci di R20. Tidak ada label 1:1 untuk gesture PA; kurasi wajib. |
| **R18/R19** | Kandidat MLP/logistic dan feature extractor versi berbeda | artefak/model dan laporan tersedia | Reuse untuk baseline dan ablation, **jangan concat 68D dengan 82D**; sumber yang sama didedup dengan provenance. |
| **R19** | HandGesture-5G L-Sign/Pointing Up/Fist/V-Sign/Open Palm | SELECT CC BY 4.0, dedup dan split cluster | Train pistol READY/PRESS + negative dan pose subset; R20 pernah augment train; jangan mencampur lock test. |
| **R19** | Natural RGB Hand Gestures v3 (26 partisipan, 13 kelas, multiple lighting) | SELECT CC BY 4.0, person-disjoint | Train negative dan pose setelah mapping; `point_left/right` tetap quarantined/ambiguous, bukan PRESS. Kaya variasi dim/backlit/LED. |
| **R19/R20** | HANDS RGB-D Subject 1–5 | CC BY 4.0; sebagian S1/2 training, S3 VAL, S4/5 locked OOD TEST di R20 | Hanya reuse role sesuai R20, bukan semua masuk training. Source untuk open palm/one/two/negative / occlusion setelah audit label asli. |
| **R20** | Hard-negative curated, low-light augmented HG5G, causal landmark features, model C4/C7, teacher-student | Training/eval/model tersedia di branch riset | Semua *training rows* eligible dipertimbangkan, teacher hanya offline. **Jangan** mencampur model-output teacher/pseudo label dengan ground truth tanpa provenance dan kontrol. |
| **R20** | A4v2 lowlight preprocessing, CPU Worker/guard, simulator dan browser benchmark | source+hasil tersedia | Reuse dan ablate, jangan mengulang penelitian lama tanpa pembanding yang jelas. Tidak mengubah bobot MediaPipe. |

**Sumber resmi dataset:**
- IPN Hand: https://gibranbenitez.github.io/IPN_Hand/ (video kontinu, gesture + non-gesture, clutter + perubahan cahaya, CC BY 4.0).
- HandGesture-5G: https://data.mendeley.com/datasets/wj25crzdbm/1 (lima pose statis, CC BY 4.0 sesuai katalog).
- Natural RGB v3: https://data.mendeley.com/datasets/n66hhk695h/3 (RGB/video multi-lighting, lisensi versi wajib dicek ulang).
- BXR7: https://data.mendeley.com/datasets/bxr7kx84y6/2 (blur, bayangan, cahaya sangat redup, multi-person, CC BY 4.0 tercantum pada halaman dataset; lisensi artikel penerbit **berbeda**, simpan bukti file lisensi dataset).
- HANDS RGB-D: https://data.mendeley.com/datasets/ndrczc35bt/2 (pose dan RGB-D, gunakan RGB only untuk jalur webcam).
- HaGRIDv2: https://github.com/hukenovs/hagrid (lisensi custom/ShareAlike, **HOLD** pada manifest R17–R20).

### 2.1 Dataset tambahan *baru*, bukan janji data sudah diunduh

| Kandidat | Kontribusi | Status saat riset | Keputusan tiga hari |
|---|---|---|---|
| **Mendeley `bpkd429sxt.1`** landmarks MediaPipe 10 gesture, CC BY 4.0 | Posisi berbeda, data berbentuk CSV landmark, kecil secara konseptual | Halaman resmi dan lisensi terlihat, belum audit mapping/volume/split subjek | **P2 OPT-IN** hanya bila cocok dengan pose target dan tidak mengganggu jalur P0; tidak wajib untuk baseline R22. https://data.mendeley.com/datasets/bpkd429sxt/1 |
| **IPN Hand video/HandS landmarks yang sudah ada** | Motion/occlusion/background/idle, temporal evidence | Cache R18 *reported*, belum dicek runtime saat ini | **P0** reuse verified local cache, bukan download ulang 4,6 GB video kecuali perlu dan disk cukup. |
| **BXR7 dim/natural dua slice** | Real blur, lowlight, multi-hand | Cache R18/R20 *reported*, video/source label gesture tidak tersedia | **P0** held-out detection/negative performance, P1 training hanya kurasi train slice legal dan nonholdout. |
| **HaGRIDv2** | Banyak pose, `no_gesture`, variasi user | HOLD_LICENSE dan versi arsip besar | **NO product training**, tanpa signoff. |
| **DimHand / LLHands / MGR-Dark** | Pose under low-light | Lisensi/akses dibatasi atau tidak tersedia, menurut R18/R19 | **NO training/deploy** tiga hari. |
| **FreiHAND/InterHand/HO-3D** | Pose estimation, bukan label tindakan Sketchbook | Domain, lisensi, ukuran, dan kebutuhan detektor baru berbeda | **DEFER**, bukan cara cepat menjadikan classifier gesture anti-blur. |

**Catatan penting:** Dataset yang memuat gambar blur tidak otomatis menyediakan **label `DRAW`, `ERASE`, `UNDO`, atau `REDO`**. Training langsung dengan menebak label dari gambar akan mengajari model mengikuti salah tebak. Pilihan yang masuk akal ialah training pose/gesture pada label yang benar, temporal rule pada transisi, dan image-level stress test detektor pada blur/lowlight yang tidak berlabel pose.

### 2.2 Protokol penggabungan data R17–R20 yang WAJIB

1. Buat `dataset_registry` dari R17 feasibility, manifests R18/R19/R20, training script, checksum, dan cache aktual. Setiap item ada source ID/version, license receipt, file SHA-256, subject/video/cluster, split asal, label asal, target label, feature extractor hash, augmentation provenance, `supervision_type`, dan `usage=train|val|test|audit|hold`.
2. **Dedup lintas revisi**, gunakan prioritas source-file hash dan original frame/video/subject/cluster; jangan hitung ulang dataset yang sama di R17, R18, R19, R20 sebagai data baru.
3. **Frozen splits:** locked TEST R19/R20 dan OOD S4/S5/BXR7 tidak dipindah ke train. Bila test sudah sering dipakai memilih model, tandai `historically_exposed` dan buat holdout alternatif yang sah. Tidak ada augmentation sebelum split.
4. **Mapping jangan disamakan:** pistol `POINT_READY`, `POINT_PRESS` tidak identik dengan pose `ONE` biasa atau IPN P1F; label `OK` tidak identik dengan pinch touch; `OTHER` tidak boleh dibuang karena amat penting untuk antigerakan salah.
5. **Hanya source berlisensi aman** dipakai membangun weights kandidat product. Dataset HOLD/BLOCKED/NC masuk tabel eksplisit pengecualian. Data webcam Owner dari benchmark **bukan training berlabel** tanpa izin pemakaian untuk training dan tanpa label valid.
6. **Augment RGB TRAIN saja** lalu ulangi MediaPipe extraction. Missing-landmark menjadi `DETECTOR_MISS` dan dicatat dalam denominasi evaluasi detektor. Jangan masukkan zero-vector sebagai sampel pose valid atau mengklaim classifier memperbaiki miss.
7. Ekstrak canonical 82D dengan per-user/session normalization dan temporal causality yang sama seperti inference target. Versi feature schema dijamin melalui hash. Jangan campur feature 68D tanpa adaptor teruji.
8. **Ablation wajib** baseline R20 C4 vs retrain gabungan legal, lalu +RGB augmentation, lalu +FSM/smoothing. Laporkan dampak terpisah pada detector recall, pose confusion, false action dan latency, bukan hanya macro-F1 agregat.

### 2.3 Anti-motion-blur dan anti-lowlight, bukan 'AI halu'

- TRAIN RGB: constrained directional motion blur (bervariasi kernel/panjang/arah), exposure, gamma/brightness/contrast, backlight, color temperature, colored LED, additive sensor noise, compression, defocus, partial hand occlusion, background clutter. **Parameter eksperimen** harus dicatat dan dicek tidak merusak visibilitas label; jangan membuat label geometris palsu setelah augment.
- TRAIN landmark: spatial jitter realistis, joint dropout/missing masks, temporal hold/recovery **hanya pada data train**; jangan menyamar sebagai keberhasilan deteksi tangan pada frame yang seharusnya miss.
- EVAL: silang real vs synthetic; slice blur severity, lowlight/backlight, overlap tangan kedua, scale/distance, skin/background contrast, palm/dorsal, direction, hand-size, penutupan ibu jari, fast movement, camera fps, browser/device.
- RUNTIME: pilih A4 otomatis bila membantu, tetapi audit downside pada normal light dan latency; threshold presence/tracking MediaPipe dikalibrasi dari validation, bukan dipaksa rendah untuk memunculkan tangan palsu. Satu in-flight inference, konsumsi newest **actual video frame** bukan vsync palsu. Bila CPU lambat, turunkan processing frequency dengan graceful degradation.
- FAILURE POLICY: saat blur/gelap membuat landmark tidak pasti, `UNKNOWN/NO_HAND`, hentikan aksi aktif, visual warning; **tidak mengklaim gestur meski tidak ada bukti**. Frame stale tidak boleh meneruskan tinta atau virtual key.

## 3. R22 = SATU PRODUK NUI, BUKAN SATU FILE NEURAL NETWORK

```
Camera RGB actual-frame timestamp
  -> automatic quality/lighting diagnostics [NO manual slider]
  -> R22 adaptive pixel gate (reuse/ablate R20 A4v2; mask only when ROI has proven value)
  -> one MediaPipe Hand Landmarker CPU Web Worker [single action owner; 1/2-hand monitoring policy benchmarked]
  -> [optional CUSTOM ObjectDetector TFLite during SEARCHING only after independent GO decision]
  -> deterministic lock/tracking of primary hand [spatial+temporal ownership, no person identity]
  -> landmark quality/One-Euro ablation + canonical features (82D + pose geometry + causal REAL-time history)
  -> R22 trained heads (pistol retrained from eligible R17–R20; temporal head only on valid sequences; pose/pinch if supervised)
  -> ONE authoritative ActionIntentResolver + temporal FSM per UI mode
  -> Cursor and ink pipelines (separate smoothing, one StrokeStore writer)
  -> event/benchmark recorder local IndexedDB + safety/freshness overlays
```

**Satu mode saja yang terlihat kepada Owner:** `NUI R22 · CPU · Otomatis`. C4/C7 bukan UI options. R20 C4 adalah baseline internal/rollback. Bila retraining R22 tidak lulus gate, **tidak boleh sekadar mengganti label menjadi R22**; kandidat R22 dapat tetap menggunakan C4 dengan perbaikan pipeline dan harus mendeklarasikan komponen sebenarnya dalam manifest internal.

**Arsitektur classifier realistis:**
- `head_pistol`: 3 kelas READY/PRESS/OTHER (82D input, re-train dari supervised R19/R20 yang bersih).
- `head_static_pose`: FIST, ONE, TWO, FIVE, OTHER jika label subject-disjoint cukup. Kalau belum, geometry multi-joint + abstain.
- `head_pinch`: TOUCH/NEAR/OPEN **jangan klaim trained** sampai tersedia label pinch yang memisahkan posisi hampir menyentuh dan benar-benar menyentuh. Fallback geometric ratio + hysteresis terukur.
- `ActionIntentResolver`: hanya satu sumber `acceptedAction` per frame, disertai `reason`, `sourceModel`, `confidence`, `isFresh`; tidak boleh ada dua gate R19/R20 dan ink yang menulis aksi berbeda.
- Output yang dilihat user tetap lima kata sederhana `Tangan`, `Gestur`, `Aksi`, `Kamera`, `Hasil`.

### 3.1 State machine gesture spesifik Canvas Lab

| Gerakan Owner | Arming/aksi | Safety rule |
|---|---|---|
| **Cubit telunjuk + jempol** | Mulai/lanjutkan goresan | Touch confirmed, same primary hand, fresh frame, RELEASE dwell/hysteresis; jangan jadikan setiap near-pinch sebagai stroke baru. |
| **Telapak terbuka 5 jari** | Hapus pada kanvas | FIVE stable, thumb valid, bukan `split-palm` ambigu, no pistol active. Satu writer Ink. |
| **Kepal → 1 jari** | Undo **satu** operasi | FIST stable disimpan di Canvas FSM, ONE stable dalam window temporal; edge triggered, cooldown dan harus rearm dengan FIST. |
| **Kepal → 2 jari** | Redo **satu** operasi | Syarat sama, tidak trigger saat mode gameplay atau pose TWO biasa tanpa arming. |
| **Kepal sendiri / tangan hilang / ambigu** | Netral, no action | Tutup aksi aman dan jangan trigger swipe/undo palsu. |

**Hard conflict yang harus diuji:** `ONE` vs pistol `POINT_READY`, `TWO` saat control mode lain, near-pinch vs pistol thumb-open, telapak lima jari vs four/split-palm, tangan kedua vs primary, exit canvas vs stroke active, missing-hand dan reacquisition. Mode router memastikan command Canvas tidak bocor ke `PLAY/PROBE/PLACE`.

**Smoothing:** cursor display dapat memakai One-Euro adaptive, tinta memakai filter terpisah dengan velocity-based lag limit. Hanya smooth posisi valid; jangan menggambar garis interpolasi melintasi missing-hand gap yang tidak diketahui. Saat gap pendek, tahan state tidak langsung restart stroke, **tetapi jangan menambahkan segmen tak terobservasi**; jika poin baru terlalu jauh lakukan segment break dengan alasan. Tuning diuji pada onset latency, path error, stroke segmentation, jitter stillness, bukan atas feeling saja.

**Ownership/distraksi:** temporal + spatial track continuity pada satu primary hand, `numHands` cukup untuk mengetahui ada distraktor, tetapi satu active action source; tangan tambahan tidak otomatis menggantikan primary. Saat identitas dua track ambigu, fail closed. Tidak ada face recognition atau biometrik identitas. Auto reacquire saat hanya satu kandidat konsisten, tanpa menuntut manual relock kecuali fallback error.

## 4. DESAIN NUI LAB OWNER-ONLY

### 4.1 Entry dan layout

- `/nui-lab` langsung menampilkan dua pilihan besar **Coba Gestur** dan **Coba Canvas**, bukan dashboard konfigurasi. Saat memilih, satu view split konsisten, tanpa halaman onboarding ekstra setelah izin kamera/benchmark yang memang diperlukan.
- **Desktop:** kolom kiri 38–42% lebar dengan kamera **tetap terlihat sepanjang viewport**; kolom kanan sisa lebar dengan **scroll internal independen**. Satu viewport lab dengan header compact, tidak ada scrollbar halaman tambahan. Kamera kiri berisi processed frame/overlay yang timestamp-nya konsisten; jangan menempelkan hasil inferensi lama pada video terbaru tanpa indikasi stale. Saat layar sempit, layout responsif stack dengan kamera tetap tersedia secara masuk akal (bukan kamera menutupi canvas).
- Kamera kiri menunjukkan landmark primary/secondary berbeda, status tangan, label gestur dan aksi akhir, detail age frame, FPS dan latency. Bila model lambat, tampilkan *frame age*, status `Memproses...`/`Data lama`, dan jangan mengaku sinkron.
- Kanan pada **Gesture** berisi *live action feedback* ukuran besar (mis. `MENUNJUK`, `LOMPAT`, `DITAHAN`), key virtual sebagai visual indikator, riwayat aksi ringkas dan indikator rekam. Tidak perlu ribuan stat card.
- Kanan pada **Canvas** berisi kanvas besar di viewport, panduan gesture ringkas, undo/redo mouse fallback, status last action, dan hasil auto benchmark. Diagnostics lanjutan dalam collapsible, tetap scrollable kanan.
- Hilangkan dari UI Owner selector engine C4/C7, detector worker/main, A4/RAW/CLAHE, scenario/GT, consent recorder ganda, relock normal, dan pilihan auto-export teknis. Jangan menghapus kemampuan diagnostik internal untuk engineer, tetapi **pisahkan** dari primary user flow.

### 4.2 Otomasi benchmark tanpa label manual

- **Setelah persetujuan eksplisit untuk menyimpan telemetry numerik**, mulai satu session otomatis pada pertama kali kamera siap; trial auto-begin per route, reconnect, worker restart, version change. Rekam terus sampai Owner memilih selesai, menutup tab, atau navigasi pergi (recovery status `interrupted` bila page terputus).
- Jika consent telah tersimpan secara sah untuk masa berlaku yang transparan, tidak perlu berulang kali menekan Start Benchmark. Tetapi saat tidak ada consent, kamera boleh tetap diuji hanya jika sesuai privacy UI, **jangan merekam diam-diam**. Jangan menyimpan video, foto, raw face atau identitas otomatis.
- Log per actual processed frame termasuk `capture_ts`, `inference_ts`, `frame_id`, `hand_count`, `lock_state`, quality estimate, blur/luma flags, detector result/miss, feature schema, `head_probs`, `predicted_pose`, `acceptedAction`, `rejectReason`, crop mode, source/rev/sha, pipeline stage latency, dropped/skipped frame, route, stroke ID, index tip raw/smoothed.
- Event: `HAND_ACQUIRED/LOST`, `POSE_CANDIDATE/CONFIRMED`, `PINCH_CONTACT_ON/OFF`, `STROKE_START/POINT/END`, `ERASE`, `UNDO/REDO`, `REJECT`, `MODE_ENTER/LEAVE`, `CAMERA_PAUSE`, `VISIBILITY_HIDDEN`, `WORKER_RESTART`, `RECORDER_FLUSH`, `CONSENT_CHANGE`, `EXPORT`.
- Automated tags only: `predicted_label`, `weak_label`, `observed_action`; `ground_truth=null` kecuali ada sumber GT independen seperti skrip terkontrol yang diketahui. Owner tidak diminta labeling.
- **Metrik otomatis yang valid tanpa GT:** fraction detector miss (pisahkan visible/hidden dan hand-present *unknown*), hand-loss/reacquire, percentile latency, update Hz, stale overlay, gesture-state churn, PINCH_ON per stroke, unexplained stroke breaks, path straightness/cursor tremor, undo/redo triggers, unintended state transitions detected by invariants, storage dropped records, route/session completeness. Ini **proxy kualitas**, bukan precision/recall gesture yang tervalidasi.
- Rekaman disimpan IndexedDB dan diselesaikan otomatis. Ekspor **satu JSON** dengan manifest/checksum + optional CSV; tombol `Unduh Hasil` untuk user. Browser tidak bisa dijanjikan menulis file lokal otomatis tanpa izin, jangan memalsukan auto-download. Ringkas hasil otomatis saat sesi selesai.
- Jika rekam gagal/kuota storage habis, UI menyatakan error dan jangan mengklaim benchmark tersimpan. Batasi retensi dan ukuran, dukung hapus data, recovery interrupted, consistency check dan schema migration.

## 5. TEST PLAN: ANTI-CELAH, ANTI-HALU, ANTI-DISTRAKSI

**Prinsip gate:** kegagalan keras pada properti keamanan input, data integritas, atau akurasi label versi bukan masalah kosmetik. Bukan berarti semua kondisi fisik akan sempurna. Parameter performa di bawah adalah **TARGET PROTOTYPE untuk dievaluasi**, bukan hasil eksperimen.

| Risiko | Kasus minimum | Bukti PASS yang harus disimpan |
|---|---|---|
| Lowlight/backlit/red LED | normal light vs dim light vs backlight dari dataset terverifikasi + webcam Owner | Detector miss dan action stability per condition; A4 vs RAW ablation, bukan angka tunggal |
| Motion blur | fast movement/blurred images + real fast gesture; berbagai durasi | Detection miss, false action proxy, jitter/path error, latency, do-not-draw saat UNKNOWN |
| Distraksi tangan kedua | satu aktif, tangan kedua masuk/pulang/silang, occlusion | Primary lock stabil; tidak ada transfer otomatis; ambiguous => action OFF |
| Background clutter | wajah, layar, objek tangan palsu, poster/phone, palm-like texture | no-hand tidak memicu tindakan; log false-hand suspicion hanya heuristic, bukan GT |
| Near-pinch vs true contact | ratio melewati threshold dekat lalu lepas | Tidak memulai ghost strokes; state/pinch hysteresis dan arming |
| Gesture konflik | FIST, ONE, TWO, FIVE, pistol READY/PRESS | Command sesuai mode, satu aksi per transisi, FIST netral |
| Canvas continuity | garisan lambat/cepat, draw pause, camera drop 1–N frame | Break count beralasan, tidak ada garis menyeberang gap tanpa observasi |
| Undo/redo idempotent | FIST→ONE, FIST→TWO, hold ONE/TWO, release, FIST lagi | Tepat satu event per arming, tidak triggered saat pose biasa |
| Multi-page/session | gesture→canvas→gesture, tab hidden, worker restart, reload | Semua trial masuk 1 sesi dengan status dan metadata benar |
| Recorder no loss | 1000+ frame, quota/error, tab crash, double click export | counted frame/event consistent; tidak ada silent drop; integrity checker |
| Frame sync | kamera 30fps, detector 10–25 Hz | overlay tidak menampilkan landmark lama sebagai saat ini; age terlihat |
| CPU performance | browser Windows/midrange dan CPU limited | percentile video-to-action latency, detectHz, main-thread long tasks, downloadable bytes |
| Licenses/leakage | dedup, train/test split, HOLD, hash | 0 forbidden sources used, overlap audit, deterministic train manifest |

**Calon ambang, harus dipilih berdasarkan baseline:** nol illegal action saat `NO_HAND`/ambiguity, nol action state bleed antar-mode, nol kehilangan record diam-diam, nol model checksum mismatch yang dianggap success, nol unverified trial diklaim valid. Untuk FPS/latency/missing-hand **wajib bandingkan R20 vs R22 di perangkat yang sama**; jangan menetapkan angka absolut tanpa pengukuran dan toleransi tradeoff.

## 6. EKSEKUSI 3 HARI, KETENTUAN GO/NO-GO

| Hari | Pekerjaan P0 | Deliverable yang diverifikasi |
|---|---|---|
| **Hari 1 — Readiness + UX + telemetry** | AGY audit cache/manifest data R17–R20, license & split; verifikasi main `head`; design UI kamera kiri static/kanan scroll; satu runtime CPU Worker, A4 auto; recorder auto-after-consent & trial routing. | Dataset registry legal/split, demo browser UI actual, result JSON Gesture+Canvas terbaca, unit tests layout/recorder. |
| **Hari 2 — Training + action architecture** | In parallel bila aman: training R22 head pistol dari union sumber legal serta augment train-only; head pose/pinch hanya bila label tersedia; satu action resolver/FSM, smoothing, auto-reacquire, FIST→1 Undo/FIST→2 Redo, erase five fingers. | Model hashes + split/metrics + baseline ablation; tests command invariants, no-hand, second-hand, stroke continuity; unit/head parity TS CPU. |
| **Hari 3 — QA fisik + tuning + preview** | Replay event/landmark trace dari JSON; uji dataset stress; AGY/uji webcam sesuai akses nyata; load/network/long-run; validasi schema dan route; staging preview di dev hanya lewat persetujuan dan gate yang ditentukan. | Perbandingan R20/R22, 2 video/demo screen evidence, 1 export semua routes, stats runtime, known limitations, commit SHA/rollback; **NO GO** jika gate keamanan/telemetry/izin gagal. |

**Jalur kritis:** Jika model training belum melewati eval sebelum H2 berakhir, jangan menggantung UI, recorder, FSM menunggu weights. R22 Preview dapat memakai C4 **dengan deklarasi jelas** sebagai baseline internal; klaim `R22 trained model` tetap `NOT_READY`. Demikian juga bila cache R18 tidak lagi ada, tandai `CACHE_MISSING`, jangan mengunduh puluhan GB tanpa disk/network budget.

**Resource gate:** cek CPU/GPU training availability nyata, free disk, cache SHA, RAM, dependency lock, export size, inbound/outbound network. R19 pernah melaporkan VM free ~3,2 GB dan floor >=2 GB, itu *snapshot lama*, bukan kapasitas sekarang. Unduh terukur dan streaming, bukan ekstraksi monolitik. Gunakan worktree terisolasi agar tidak menabrak Ujang/AGY lain. Repo READ-ONLY untuk dokumen ini; AGY boleh coding hanya setelah prompt/otorisasi Owner dikirim.

## 7. SATU MANDAT BERBASIS HASIL, BUKAN STOP UNTUK BERTANYA

AGY harus melaporkan tiap perubahan dalam format evidence: `Claim | Actual command/input | Input SHA | Dataset/split | Actual output | Test result | Environment/commit | Status [PASS/FAIL/NOT_TESTED]`. Tidak boleh status “proven”, “fully anti blur”, “zero hallucination”, “all auto-labelled correctly” tanpa independent GT/runtime evidence. Jika training gagal, tetap deliver implementasi UI+telemetry+FSM dan diagnosis faktual. Jangan menyembunyikan model/selector di detail yang Owner harus buka. Jangan mengubah gameplay siswa dan production otomatis.

## 8. SOURCES DAN BATAS EVIDENCE

**Sumber repo internal (dibaca READ-ONLY):**
- R17 dataset feasibility: https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/docs/nui-rd/R17_NUI_DATASET_FEASIBILITY.md
- R18 dataset manifest: https://github.com/lustresense/hitl-momo/blob/research-can/r18/manifests/dataset_manifest.json
- R19 dataset audit: https://github.com/lustresense/hitl-momo/blob/research-can/r19/results/R19_DATASET_AUDIT.md
- R19 gesture label schema: https://github.com/lustresense/hitl-momo/blob/research-can/r19/results/R19_GESTURE_LABEL_SCHEMA.md
- R20 datasets/training: https://github.com/lustresense/hitl-momo/blob/research-can/r20/manifests/dataset_manifest.json dan https://github.com/lustresense/hitl-momo/blob/research-can/r20/results/R20_TRAINING_AND_EVAL_REPORT.md
- Current lab: https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/src/components/nui-lab/lab-analyzer.ts dan https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/src/components/nui-lab/NuiLabPage.tsx

**Sumber teknis eksternal (referensi kerja engineering, BUKAN penambahan sitasi proposal PA/Dapus):**
- Google MediaPipe Hand Landmarker: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker (threshold tracking/presence, running mode, CPU/GPU)
- Google Gesture Recognizer: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer (landmarker dan classifier berbeda)
- Google Model Maker customization: https://ai.google.dev/edge/mediapipe/solutions/customization/gesture_recognizer (classifier custom, tidak setara fine-tune Hand Landmarker; cek status maintenance)
- Albumentations: https://albumentations.ai/docs/3-basic-usage/choosing-augmentations/ (motion blur, brightness, noise dan compression)
- 1€ filter paper: https://www.mikrocontroller.net/attachment/421642/p2527-casiez.pdf (jitter/lag tradeoff)
- Dataset leakage: https://scikit-learn.org/stable/common_pitfalls.html dan https://dataeval.readthedocs.io/en/latest/concepts/Leakage.html
- Dataset official URLs tercantum di Bagian 2.

**Status keseluruhan:** spesifikasi riset dibuat dari file user, source GitHub, dan halaman sumber. Belum ada training R22, commit, uji QA R22, atau deployment R22 dari kerja ini. File ini adalah instruksi untuk eksekusi AGY setelah Owner mengirim, bukan klaim sudah selesai.


## 9. TAMBAHAN AUDIT PERCAKAPAN GOOGLE AI, 19 NOVEMBER 2026 (WAJIB DIBACA SEBELUM IMPLEMENTASI)

Audit lengkap, matriks GO/HOLD/REJECT, protokol eksperimen, dan referensi API tersedia pada `R22_AUDIT_GOOGLE_AI_DAN_KEPUTUSAN_TEKNIS.md`. Kesimpulan yang mengubah rencana awal:

1. **R20 A4v2 sudah memakai `motionGatedTemporalEmaInPlace`, `sepMedian5RgbaInPlace`, `denoise3x3RgbaInPlace` pada low-light tertentu, `reinhardExposureLutInPlace`, downscale melalui `OffscreenCanvas` 320-pixel, dan mekanisme latest-frame-wins.** Jangan membuat ulang hal yang sama sebagai fitur baru `A5` sebelum membuktikan gap spesifik di source, lalu lakukan RAW vs R20 vs kandidat R22 pada *input frame identik*. Pemeriksaan `research-can/r20/candidates/r20_lowlight_frame_source.ts` dan `r20_hand_landmarker.worker.ts`.
2. **Custom `ObjectDetector` memang tersedia pada `@mediapipe/tasks-vision`, bukan otomatis satu WASM runtime instance dengan `HandLandmarker`.** Reuse URL/cache aset JS/WASM mungkin menekan *network bytes*, tetapi masing-masing task dapat memiliki graph, model dan memory sendiri. Ukuran `~1.5 MB`, tambahan `0 B`, 12 MiB total, latensi `6–8 ms`, dan efektivitas deteksi bukan bukti. Ukur CDP cold wire, in-memory WASM, init, detector p95, hand-landmarker p95, CPU, dan real low-light.
3. **ROI black-out/crop tidak menjamin 100% anti-distraksi.** Mask bisa memutus hand track saat jari melampaui batas; kotak lama bisa mengikuti tangan yang salah; ROI berubah menyebabkan pergeseran prior pada tracker. Pertahankan full-frame acquisition dan fallback, soft margin/velocity/hysteresis, koordinat konsisten, deteksi ambigu dan fail-closed. A/B `numHands=1` vs `numHands=2` statis vs R20 guard dinamis, karena satu tangan output tidak memberi bukti keberadaan tangan kedua.
4. **Data R17–R20 relevan untuk classifier, tetapi belum otomatis tersedia sebagai rangkaian temporal delapan frame.** R17/R19 HandGesture-5G banyak pose statis. IPN dan Natural RGB memiliki video/sekuens, tapi mapping label pistol, ONE/TWO/FIVE, pinch contact harus diaudit. Jangan membuat contoh temporal palsu dengan mengulang gambar statis lalu mengaku real.
5. **JSON Owner 7.612 frame bukan dataset gambar berlabel kotak tangan dan tidak berisi ground truth gesture independen.** Boleh dipakai untuk audit telemetry, replay landmark/action, memvalidasi invariants, dan weak-label/unsupervised reliability. Tidak boleh dipakai sebagai supervised truth untuk detektor baru atau klaim accuracy tanpa anotasi independen. Jika perlu data RGB tambahan, gunakan dataset publik legal + explicit opt-in capture video lokal, tanpa mewajibkan Owner melabel manual.
6. **Jangan menjanjikan 20 Hz inferensi gambar baru jika kamera fisik hanya menghasilkan 10–15 frame unik per detik.** UI dapat merender 60 FPS, tetapi `unique_capture_fps`, `inference_hz` dan `action_latency` wajib dipisah. Frame skip tidak boleh menghambat timer release/fail-closed.
7. **Output HandLandmarker Web terdokumentasi berupa landmarks, worldLandmarks dan handedness.** Jangan merancang kebutuhan `per-landmark visibility/presence` seolah field itu pasti tersedia. Jika tidak, pakai quality proxy yang diberi label *derived*, tidak mengaku skor model asli.
8. **Detector kustom hanya conditional R&D, bukan jalur wajib yang memblokir UX.** Latih hanya bila memiliki foto+COCO/Pascal VOC bbox berlisensi eligible, model TFLite yang benar-benar kompatibel dengan ObjectDetector/metadata, dan runtime terbukti unggul pada alat CPU target. `mediapipe-model-maker` tercatat *deprecated/no longer actively maintained* pada dokumentasi Google, jadi kompatibilitas toolchain perlu dibuktikan dengan smoke export-load, bukan diasumsikan.
9. **Prioritas tiga hari tetap UX+telemetry+ink gate tunggal, lalu robustness dan temporal ablation.** Custom detector menjadi percobaan paralel/conditional bila data dan waktu memadai; tidak boleh menunda uji Canvas/rekorder yang sudah bermasalah. Semua angka ambang `15%`, `45%`, `~160 KB`, `~0.4 ms`, dan `0 false press` dari Google AI adalah hipotesis desain/parameter prototipe, bukan hasil ukur R22.

**Dokumen resmi engineering/API untuk verifikasi (bukan sumber sitasi akademik proposal):**
- https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://developers.google.com/edge/api/mediapipe/js/tasks-vision.filesetresolver
- https://developers.google.com/edge/mediapipe/solutions/customization/object_detector
- https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/getCapabilities
