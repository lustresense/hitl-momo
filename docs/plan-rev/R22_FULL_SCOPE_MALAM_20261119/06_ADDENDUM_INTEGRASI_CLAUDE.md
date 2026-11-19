# 06 — Addendum integrasi (Claude), berlaku bersama 01–05

**Sifat:** menambah aturan, **tidak menghapus atau menunda workstream apa pun** dari `01_MANDAT` / `02_MASTER_SPEC`. Kalau ada yang tampak bertentangan, 01–05 tetap menang untuk *scope*; addendum ini hanya mengatur *cara integrasi* supaya full scope tidak menimbulkan ulang masalah yang sedang diperbaiki.

## A1. Kepemilikan file yang bertabrakan di `02 §G02`
`NuiLabPage.tsx` disentuh oleh tiga workstream sekaligus: UI (layout), scheduler (bug pump frame di `:822–825`, guard di `:896–906`), dan recorder (`recordFrameToBench`). Aturan:
- **Satu pemilik `NuiLabPage.tsx` = worker UI.** Worker scheduler lebih dulu mengekstrak logika submit frame ke modul baru (mis. `bench/frame-scheduler.ts`) dengan antarmuka `onNewCameraFrame(cb)`; worker recorder mengekspos hook dari `bench/manager.ts`. Worker UI hanya memanggil kedua antarmuka itu.
- `lab-analyzer.ts` dan `src/input/hand-stroke-pipeline.ts` hanya dimiliki worker Canvas/FSM. Perubahan di `src/input/**` wajib lewat opsi/adaptor khusus NUI Lab dan menjalankan regresi gameplay terkait (`hand-stroke-surface`, `two-hand-surface`, `eraser-controls`).

## A2. Satu sumber keputusan per jenis, juga setelah model baru dilatih
Akar kerusakan Canvas adalah **beberapa penilai untuk keputusan yang sama** (tiga penilai pinch, pistol ikut menutup stroke). Full-scope training tidak boleh mengulanginya:
- Per route, tepat **satu** `PoseSource` dan **satu** `PinchSource` yang dibaca `ActionIntentResolver`. Implementasi awal = geometri/FSM yang sudah diperbaiki.
- Head hasil training (pose FIST/ONE/TWO/FIVE, pinch/near-pinch, temporal) **menggantikan implementasi di belakang antarmuka yang sama** bila lolos gate, atau tetap `CANDIDATE`. **Dilarang** menambahkannya sebagai penilai paralel yang ikut memveto/menyetujui aksi.
- Classifier pistol hanya dibaca route Gesture.

## A3. Urutan integrasi (bukan pemangkasan)
Semua workstream jalan paralel sejak awal. Yang diatur hanya **urutan merge ke branch integrasi `r22-nui-lab`**:
1. Perbaikan runtime + Canvas (frame unik, 0 `setOptions` runtime, gate pistol keluar dari Canvas, grace via `lost()`, satu resolver, FSM undo/redo) masuk lebih dulu.
2. Evaluasi **perilaku aksi** model kandidat (temporal, pose head, detector) dijalankan di atas pipeline yang sudah diperbaiki di langkah 1, supaya perbandingan dengan C4 tidak tercampur bug gate lama. Training offline di dataset tidak perlu menunggu apa pun.
3. Kalau langkah 1 belum hijau, workstream lain tetap bekerja dan commit di branch masing-masing; mereka tidak di-merge ke atas pipeline yang masih rusak.

## A4. Koreksi yang diterima dari `04_AUDIT`
- Luma rata-rata 0,47 adalah nilai **setelah auto-exposure kamera**, jadi tidak membuktikan ruangan terang ataupun gelap. Klaim Claude "sesi ini bukan low-light" seharusnya berbunyi "frame tidak gelap menurut sensor setelah AE; kondisi ruangan tidak terukur".
- "±40% duplikat" adalah inferensi dari videoFps 15 vs detectHz 22–30 plus jalur pump tanpa guard di source, belum dihitung per frame ID. Instrumentasikan dulu, lalu ukur.

## A6. Model per worker (instruksi Owner: Argon = orchestrator; Neon lebih kuat dari Hydrogen)
Dasar pembagian: workstream yang kalau salah membuat seluruh hasil R22 tidak valid → **Neon**. Workstream dengan kontrak jelas dan dapat dicek lewat tes → **Hydrogen**. Semua workstream tetap dikerjakan; ini hanya penugasan model.

| Worker | Model | Workstream (lihat 01 §1–8, 02) | Alasan |
|---|---|---|---|
| ORCH | **Argon** | Orkestrasi, kontrak antarmuka (A1–A2), merge ke `r22-nui-lab` sesuai A3, review setiap merge, laporan akhir per acceptance ID | Instruksi Owner |
| W-RUNTIME | **Neon** | MediaPipe CPU worker, `bench/frame-scheduler.ts` (frame unik, `requestVideoFrameCallback`), 0 `setOptions` runtime, A/B `numHands` 1 vs 2, owner track/auto-reacquire | Konkurensi + state tracking MediaPipe; bug di sini merusak semua metrik |
| W-CANVAS | **Neon** | `lab-analyzer.ts`, `ActionIntentResolver`, satu `PinchSource`/`PoseSource`, grace via `lost()`, FSM kepal→1/2, gate pistol keluar dari Canvas, adaptor `src/input/**` + regresi gameplay | Akar kerusakan Canvas; menyentuh kode bersama gameplay |
| W-DATA | **Neon** | Registry R17–R20, lisensi, dedup, split subjek/video, re-encode 68D/82D, retraining pistol/pose/pinch + perbandingan C4/C7 | Kesalahan lisensi/leakage membatalkan semua angka model |
| W-TEMPORAL | **Neon** | Temporal classifier di sekuens nyata (window 3/5/8, causal, dt nyata), ekspor ke TS CPU | Paling mudah menghasilkan hasil palsu (frame statis digandakan) |
| W-UI | **Hydrogen** | `NuiLabPage.tsx`/CSS: dua CTA, kamera kiri sticky, kanan scroll, label stale berbasis frame ID, tanpa selector; memakai antarmuka dari W-RUNTIME dan W-BENCH | Kontrak visual jelas, terverifikasi screenshot/tes |
| W-BENCH | **Hydrogen** | Recorder/autolabel/`labelSource`, field baru (captureFrameId, lumaP95, nearWhiteHandPct, setOptionsCalls, gap/endReason), lifecycle trial, export JSON/CSV, summary jendela aktif | Perluasan recorder yang sudah ada; skema dapat dites |
| W-ROBUST | **Hydrogen** | Ablation preprocessing RAW/A4v2/kandidat pada frame identik, soft-knee/glare proxy, `getCapabilities` opsional, 1-Euro (kursor), riset custom ObjectDetector/ROI + data bbox legal | Eksperimen dengan gate pengukuran; tidak jadi default tanpa bukti |
| W-QA | **Hydrogen** | Fixture regresi T004, fault injection, suite NUI 210 + tes baru, perf/CDP/heap, replay | Penguji berbeda dari pembuat kode Neon, supaya pekerjaan tidak menilai dirinya sendiri |

Aturan tambahan:
- Hasil W-QA (Hydrogen) atas kode Neon dan setiap merge dari worker Hydrogen wajib direview Argon sebelum masuk branch integrasi. Status `PASS` hanya dari log/command nyata.
- Kalau satu model kena limit, worker boleh pindah ke model lain **dan wajib mencatatnya** di laporan (worker, model lama → baru, waktu). Workstream tidak boleh dihentikan karena limit. Aturan pemilihan pengganti ada di A9.
- Catatan Owner: instruksi lama L5-M098 (jangan pakai subagent) **digantikan** oleh keputusan Owner 19 Nov 2026 untuk delegasi paralel dengan model per worker di atas.

## A7. Peta dependensi wajib Argon (termasuk sisi training)
Argon **tidak boleh** sekadar membagi tugas lalu menunggu laporan. Sebelum worker mulai menulis kode, Argon menerbitkan kontrak di bawah (status `DRAFT` boleh), lalu menjaga papan dependensi di setiap laporan progres: `kontrak | produsen | konsumen | status | yang dipakai konsumen sementara`.

| # | Kontrak/artefak | Produsen | Konsumen | Sebelum siap, konsumen memakai |
|---|---|---|---|---|
| K1 | Antarmuka `frame-scheduler` (event frame kamera baru: `captureFrameId`, `captureTs`, `dtMs`, bitmap) | W-RUNTIME | W-UI, W-BENCH, W-CANVAS, W-QA | Stub yang memancarkan frame dari video rekaman/fixture |
| K2 | Bentuk hasil worker (landmarks, handedness, `numHandsActive`, `setOptionsCalls`, timing, luma stats) | W-RUNTIME | W-CANVAS, W-BENCH, W-ROBUST | Tipe `LabWorkerResultMsg` yang ada + field baru opsional |
| K3 | `PoseSource` / `PinchSource` / `ActionIntent` (nilai, confidence, `labelSource`, alasan reject) | W-CANVAS | W-UI, W-BENCH, W-DATA, W-TEMPORAL, W-QA | Implementasi geometri existing di belakang antarmuka |
| K4 | **Taksonomi label R22** (pistol READY/PRESS/OTHER; pose FIST/ONE/TWO/FIVE/OTHER; pinch TOUCH/NEAR/OPEN) dan pemetaan dari label dataset asli | W-DATA (disetujui Argon) | W-CANVAS (FSM), W-TEMPORAL, W-QA | Tidak ada stub: wajib diterbitkan paling awal karena training dan FSM bergantung padanya |
| K5 | **Encoder fitur beku** (`r19_features.ts` 82D + versi/hash; fitur tambahan temporal seperti velocity diberi versi sendiri) | W-DATA | W-TEMPORAL, runtime classifier, W-QA | Encoder 82D yang ada, hash dicatat; perubahan encoder = versi baru, bukan edit diam-diam |
| K6 | **Format ekspor model** untuk TS CPU (perluasan `R19ExportedModel` / loader `bench/engines.ts`, termasuk temporal) + SHA + model card | W-DATA, W-TEMPORAL (disetujui Argon) | Runtime, W-UI (diagnostics), W-BENCH | Loader C4 yang ada |
| K7 | Registry dataset + split beku (train/val/test/OOD, hash) | W-DATA | W-TEMPORAL, W-ROBUST (detector), W-QA | Tidak ada stub: training kandidat tidak boleh dilaporkan sebelum split beku |
| K8 | Skema recorder/export baru + reader | W-BENCH | W-UI, W-QA, `analyze_nui_bench.py` versi baru | Skema `nui-lab-bench-export/1` yang ada |
| K9 | Fixture replay T004 + kasus 62/99/220/603/12.657 ms | W-QA | W-CANVAS, W-RUNTIME | Dibuat dari JSON four-trials di paket |
| K10 | Dataset bbox legal untuk detector | W-ROBUST | Training detector | Status `BLOCKED` dengan bukti bila tidak ada; riset tetap jalan |

**Dependensi sumber daya yang juga diatur Argon:**
- **GPU:** server punya 2× RTX A5000 (laporan R20). Jadwalkan eksplisit, mis. GPU0 = W-DATA (pistol/pose/pinch), GPU1 = W-TEMPORAL; training detector W-ROBUST antre di GPU yang kosong. Catat `CUDA_VISIBLE_DEVICES` per run. Jangan dua job berat di satu GPU tanpa cek VRAM.
- **Disk:** inventaris 19 Nov menunjukkan ±52 GiB kosong (snapshot lama). Cek `df` sebelum ekstraksi/unduh; pakai cache R18–R20 yang ada lebih dulu, unduh baru hanya bila perlu.
- **Kode bersama gameplay** (`src/input/**`): perubahan W-CANVAS di sana menjadi dependensi bagi W-QA untuk menjalankan regresi gameplay sebelum merge.

**Aturan dependensi:**
1. Urutan terbit kontrak: K4 dan K5 paling awal, lalu K1–K3, K6–K8. Worker mulai kerja di atas stub begitu kontrak `DRAFT` ada; tidak ada yang menganggur menunggu implementasi selesai.
2. Perubahan kontrak setelah terbit wajib lewat Argon, dengan versi baru dan pemberitahuan ke semua konsumen di tabel. Tidak ada perubahan bentuk data diam-diam.
3. Hasil model hanya sah bila tercatat versi K4/K5/K7 yang dipakai. Model yang dilatih dengan encoder atau split berbeda dari runtime ditandai `INVALID_FOR_RUNTIME`.
4. Bila produsen telat, Argon memutuskan: konsumen lanjut dengan stub, atau tugas dipindah. Keputusan dicatat. Tidak ada workstream yang dihapus karena dependensi telat.
5. Jalur kritis untuk Owner bisa mencoba malam ini: K1 → K2 → K3 → W-CANVAS + W-UI → W-QA → build lokal/dev. Jalur training (K4 → K5 → K7 → training → K6 → evaluasi di atas pipeline perbaikan, lihat A3) berjalan paralel dan tidak memblokir jalur kritis.

## A8. Ketertelusuran: setiap masalah Owner → tempat penanganannya
Argon wajib memakai tabel ini sebagai checklist laporan akhir: tiap baris diberi status `PASS/FAIL/NOT_TESTED/BLOCKED` beserta bukti. Baris bertanda **(baru)** belum ada di 01–05 dan ditambahkan oleh addendum ini.

| # | Masalah/permintaan Owner | Asal | Ditangani di |
|---|---|---|---|
| 1 | Gambar gemetar | NUI Lab 1–3, NUI-Lab-6 | 02 C06/B03, 03 C14/P07 |
| 2 | **(baru)** Tangan sulit terdeteksi saat dekat/menutupi wajah; wajah tidak boleh dikira tangan | NUI Lab 1–3 | Tambah kasus "tangan di depan/dekat wajah" ke matriks 02 F01 dan rekaman fisik Owner. Catatan: `lab-analyzer.ts` NUI Lab sengaja mengabaikan gate area wajah; ukur dampaknya, jangan asumsikan |
| 3 | Low-light, lampu atas, backlight | NUI Lab 3, 5, Google AI | 02 C04/C05, 03 P02/P03. **(baru)** Lampu atas dan backlight wajib jadi kondisi eksplisit di rekaman fisik dan stress test |
| 4 | Tampilan kamera user tetap normal; enhancement hanya di belakang | NUI Lab 3 | 02 A07 |
| 5 | Glare dari layar/lampu | Google AI | 02 C04, 03 P04 |
| 6 | Motion blur | NUI-Lab-6, Google AI | 02 C05/D06, 03 P05 |
| 7 | Objek latar kontras rendah, warna kulit beragam | NUI Lab 4 | 02 C05/F01, 03 P06/D10 |
| 8 | Tangan miring/terputar, jari belakang tertutup | NUI Lab 3, Google AI | 02 D05/D06/F01 |
| 9 | **(baru)** Tiga jari (dan empat jari) tidak terbaca | NUI Lab 3, 4 | Gesture Lab wajib menampilkan jumlah jari 0–5 dengan benar sebagai diagnostik; tambah fixture 3 dan 4 jari ke W-QA. Bukan aksi Canvas |
| 10 | Hapus = telapak 5 jari, kepal bukan hapus | NUI Lab 3 | 02 B01, 03 C08/C09 |
| 11 | **(baru)** Split palm | Test lama `hand-stroke-surface` | Kode saat ini mengizinkan split-palm 5 jari menghapus, sedangkan test lama mengharapkan tidak. Audit dan laporkan konflik ke Owner; jangan memilih sendiri |
| 12 | Pinch harus benar-benar rapat | NUI Lab 4 | 02 B03, 03 C01/C07 |
| 13 | **(baru)** Kursor muncul saat ada tangan; tinta hanya saat pinch | NUI Lab 3 | Tambah ke tes W-CANVAS/W-QA bersama 03 C15 |
| 14 | Undo kepal→1, Redo kepal→2, tanpa swipe | NUI-Lab-6 | 02 B05, 03 C10–C12 |
| 15 | Stroke putus, pinch tidak jadi stroke, re-arm, gate pistol di Canvas | Benchmark T004 | 01 §3, 02 B02/B04, 03 C02–C06, 06 A2 |
| 16 | Lock otomatis tangan baru, tanpa relock manual, tangan lain tidak merebut | NUI Lab 3 | 02 B06, 03 W05/W06 |
| 17 | **(baru)** Gestur pistol terasa seperti tombol panah: ditahan = tertekan, dilepas = berhenti, kombinasi (maju + lompat) | NUI Lab 5 | Gesture Lab mempertahankan `PistolVirtualKeyFSM` yang ada; W-QA mengukur latensi key down/up, stuck key, dan kombinasi. Pistol tidak dipakai di Canvas |
| 18 | MediaPipe tetap dasar (judul PA); "fine-tune" = memperkuat | NUI Lab 4 | 02 C01 |
| 19 | Retrain classifier dari R17–R20 di GPU, user cukup CPU | NUI Lab 5, NUI-Lab-6 | 01 §6, 02 D, 06 A6/A7 |
| 20 | Dataset anti-blur, anti-lowlight, anti-distraksi | NUI-Lab-6 | 02 D03/D06, 03 D09/D10 |
| 21 | Temporal classifier, custom detector | Google AI, GPT | 01 §7, 02 C08/D05 |
| 22 | Unduhan < 25 MB, tidak lag di CPU | NUI Lab 4, 5 | 02 C09, 03 T05/T06. **(baru)** Tanpa `opencv.js` dan tanpa runtime ONNX di jalur default (ONNX hanya pembanding offline) |
| 23 | Frame duplikat, kamera 15 FPS | Benchmark | 02 C02, 03 W02/W03/P08 |
| 24 | Satu mode CPU, tanpa pilihan C4/C7, cahaya, skenario, GT | NUI-Lab-6 | 02 A04, 03 U06/U07 |
| 25 | Kamera kiri tetap, kanan scroll, data sinkron dengan tangan di kamera | NUI-Lab-6 | 02 A02/A03, 03 U02/U05 |
| 26 | Benchmark otomatis semua percobaan, autolabel tanpa label manual | NUI Lab 5, NUI-Lab-6 | 02 A05/A06/E, 03 B01–B12 |
| 27 | Yang diuji harus versi terbaru di dev | NUI-Lab-6 | 05, 03 T10 (butuh izin dev deploy Owner) |
| 28 | Canvas dulu enak di R17 | NUI Lab 4, 5 | 02 F04 |

**Di luar R22, dicatat supaya tidak lupa (jangan diubah tanpa izin Owner):**
- Gameplay siswa memetakan Canvas `one-finger → undo`, `two-fingers → redo` langsung (`src/input/gesture-mode.ts:80`), berbeda dengan R22 NUI Lab (kepal→1/2). R22 tidak mengubah gameplay.
- Journey gameplay siswa tercatat 26,80 MB (> 25 MB) di laporan R20 karena model MediaPipe diunduh tiga kali. Bukan scope NUI Lab.

## A9. Kalau pelaksana bukan AGY, atau Argon/Neon/Hydrogen tidak tersedia
Paket ini bisa dijalankan oleh pelaksana lain (mis. Ujang dengan model GPT atau Claude, atau agent lain), termasuk **berpindah di tengah pekerjaan** karena limit. Nama Argon/Neon/Hydrogen di A6 adalah **tingkat kemampuan**, bukan syarat merek:

| Tingkat | Di A6 | Kriteria memilih model pengganti | Dipakai untuk |
|---|---|---|---|
| T-ORCH | Argon | Model dengan penalaran dan konteks terpanjang yang tersedia di platform pelaksana | Orkestrasi, kontrak, dependensi, review merge |
| T-STRONG | Neon | Model terkuat berikutnya untuk koding + penalaran (setara atau di atas tingkat Neon) | W-RUNTIME, W-CANVAS, W-DATA, W-TEMPORAL |
| T-LIGHT | Hydrogen | Model lebih cepat/hemat yang masih andal untuk koding berkontrak jelas | W-UI, W-BENCH, W-ROBUST, W-QA |

Aturan:
1. Pelaksana memetakan model yang benar-benar ada di platformnya ke tiga tingkat di atas, **mencatat pemetaannya** di awal laporan (`tingkat → nama model nyata → platform`), dan memakai model sesuai kecerdasan yang dibutuhkan tugas.
2. Tugas T-STRONG **tidak boleh turun diam-diam** ke model T-LIGHT. Kalau memang hanya model ringan yang tersedia, tandai `DOWNGRADED_MODEL`, dan hasilnya wajib direview oleh model T-ORCH/T-STRONG sebelum di-merge.
3. Sebisa mungkin W-QA memakai model yang berbeda dari pembuat kode yang diujinya.
4. Kalau platform tidak punya subagent/paralel, pelaksana mengerjakan workstream bergantian dengan tetap mematuhi A1–A8; tidak ada workstream yang dihapus.

**Serah-terima saat ganti pelaksana atau model di tengah jalan:**
- Pelaksana menjaga file `R22_HANDOFF_STATE.md` di root worktree `r22-nui-lab`, diperbarui setiap kali ada commit penting: HEAD/branch per workstream, versi kontrak K1–K10, papan dependensi A7, status baris A8, pemetaan model A9, job GPU yang sedang berjalan (perintah, GPU, log, checkpoint), blocker, dan langkah berikutnya.
- Commit WIP sering di branch masing-masing; jangan menahan pekerjaan hanya di memori sesi.
- Pelaksana baru **membaca `R22_HANDOFF_STATE.md` dan git log dulu**, melanjutkan dari situ, dan tidak mengulang training atau audit yang sudah punya artefak + hash, kecuali artefaknya terbukti rusak.
- Larangan membaca `contexts/can/research/.context-notforagent/` berlaku untuk semua pelaksana, termasuk Ujang.

## A5. Yang hanya bisa dikerjakan Owner malam ini (catat sebagai `NOT_TESTED` sampai ada)
- Rekam sesi fisik setelah build R22 jalan, tanpa label: Canvas cahaya normal; Canvas kamar gelap + layar terang; Canvas dengan lampu atas atau membelakangi cahaya; tangan di dekat wajah; Gesture (pistol ditahan/dilepas, 3 dan 4 jari).
- Izin eksplisit dev deploy (atau tetap lokal), karena full Vitest lama masih FAIL.
