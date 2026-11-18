# NUI R19-01 v0.1.0 — Pistol PRESS, Dataset, Training & Runtime

**Proyek:** Sketchbook Universe (CAN)  
**Tanggal:** 18 November 2026 WIB  
**Status:** RENCANA / BELUM DIMULAI. **Belum trained, belum diuji kamera fisik, belum menjadi keputusan PA.**  
**Branch sasaran:** `research-can` (orphan).  
**Basis produk:** `main@c14b1d0502634cd63cc1a7be7c1e02270b15abc1`, versi `0.25.0-alpha` pada snapshot audit 18 November 2026.  
**Basis riset:** `research-can/r18/models/MODEL_CARD.md`, `r18/manifests/dataset_manifest.json`, `r18/results/R18_MASTER_REPORT.md`.  
**Evidence legend:** OBSERVED_REMOTE, PUBLIC_DATASET_PAGE, OWNER_DIRECTION, INFERENCE, PROTOTYPE, OFFLINE_DATASET, BROWSER_SIMULATED, PHYSICAL_WEBCAM, NOT_TESTED.

> **Tujuan:** R19 harus meneliti kontrol Thinman seperti tombol keyboard yang **ditekan, ditahan, dikombinasikan dan dilepas** menggunakan webcam RGB biasa. Telunjuk mengarahkan LEFT/RIGHT/JUMP; jempol terbuka menyamping seperti **pistol** menjadi PRESS; jempol dilipat menjadi READY/RELEASE. PRESS harus aman dan dapat dideteksi ketika punggung tangan menghadap kamera, termasuk ketika tangan kanan menunjuk ke kiri. Tombol DOWN tidak dibutuhkan pada Thinman karena gravitasi. Ini **kandidat** untuk diuji, bukan instruksi diam-diam mengganti gameplay main.

---

## 0. Instruksi operasional untuk agent riset

Baca `research-can/AGENTS.md`, `README.md`, `LOG.md`, kemudian dokumen main yang relevan sesuai SOP. Periksa remote, branch dan SHA asli, working tree, disk/RAM/CPU, dependencies, source, dataset dan izin sebelum bertindak. Jangan mengakses `main:contexts/can/research/.context-notforagent/`.

**Izin tugas ini:** agent boleh audit/download dataset yang sah dan muat di storage, buat protokol data, train/tune dan evaluasi kandidat, menulis scripts dan artefak R19 terkurasi, commit serta push **hanya** ke `research-can` sesuai AGENTS. **Tidak** ada izin merge ke `main`, merombak UI/gameplay, deploy, mengubah keputusan PA, menjalankan layanan produksi atau push data mentah/private ke Git.

**Plan state contract:** nama tanpa prefix berarti belum dimulai. Saat eksekusi R19 dimulai dengan izin Owner, rename file yang sama menjadi `[WIP] NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md`. Jangan membuat plan duplikat. Tandai `[DONE]` hanya setelah seluruh acceptance dan evidence plan sendiri lengkap. Blocker, partially failed test dan tidak ada webcam = tetap [WIP].

Bila subagent tersedia, lakukan paralel untuk (1) provenance/license/dataset, (2) geometry/FSM, (3) training/evaluation, (4) runtime/bytes, (5) regression/QA. Kepemilikan file tidak boleh overlap. Orchestrator menyimpulkan dan memeriksa bukti sendiri. Jangan mengukur keberhasilan dari jumlah subagent.

**Non-negotiable git protocol:** setiap commit/push research-can harus mengupdate **root LOG.md (newest-first)** dan **root README.md (Current status)** dalam commit yang sama. Stage hanya allowlisted files, tidak pernah dataset penuh, rekaman kamera pribadi atau identifiable screenshots, credential, database/cache/checkpoint besar. Tidak boleh force push, merge unrelated history atau mengklaim code exists = runtime works. Laporan ke Owner wajib exact command+exit code, branch SHA, evidence type, gagal/NOT_TESTED, ukuran, license dan next action.

## 1. Audit source utama dan masalah R18

Sumber `main` yang harus dibaca ulang ketika eksekusi:
- `frontend/implementation/src/input/gesture-mode.ts`: action per fase, bukan global gesture meaning.
- `src/input/hand-gesture.ts`: sembilan kelas `HandPose` dan count 0–5 jari; legacy thumb counting punya potensi salah baca pistol.
- `src/input/gameplay-gesture.ts`: steering telunjuk langsung, arah horizontal/atas/diagonal/stop; **belum ada pistol PRESS**.
- `src/input/arbiter.ts`, `src/components/game/hooks/useGameplayInput.ts`, `src/input/gameplay-hand-driver.ts`: prioritas input keyboard/manusia, camera lifecycle, release/fail-safe.
- `src/game/jump-assist.ts`: coyote/buffer 100ms di snapshot source; periksa perilaku jumpHeld dan auto repeat.
- `src/components/nui-lab/NuiLabPage.tsx` dan `lab-analyzer.ts`: baseline/R17/R18 pada route **existing** `/nui-lab/gesture` dan `/nui-lab/canvas`.
- `contexts/can/DECISIONS.md`: D-20261110-09 mengatur sudut telunjuk langsung (aktif), D-20261115-02 mencatat konflik Card 1/Card 3 (belum dikunci). **Plan R19 tidak mengubah kedua keputusan itu.**

**Fakta R17:** HaGRIDv2 pernah dipakai dalam eksperimen evaluasi landmark/heuristik 3/5 jari, pinch, false erase. Bobot eksperimen R17 di luar Git, bukan otomatis bobot produk. **Fakta laporan R18:** model UX3 MLP dilatih dengan **IPN HandS saja** menggunakan 68 fitur kausal dan arsitektur `68→96→48→6`, 6 output `NOG`, `POINT_1F`, `POINT_2F`, `GRAB_FIST`, `THROW_SWIPE`, `OPEN_ZOOM`. R18 model card melaporkan JSON `123.141 B` (wire browser simulasi `44.065 B`), locked test macro-F1 `0,6156`. **Tidak ada label pistol PRESS; tidak ada FIVE statis terlatih.** Physical webcam R18/R19 tidak dibuktikan oleh metrik ini.

Source R18 UX3 masuk `main` NUI Lab pada PR #6 (merged), **bukan** kontrol Thinman produksi yang otomatis menggunakan model UX3. Jangan mengganti source gameplay sebelum ada otorisasi lanjutan.

**Hipotesis terpisah:** kesulitan tangan di cahaya rendah dapat datang dari detector tidak mengeluarkan 21 landmark, landmark salah, hand locking, classifier, state key, atau render/physics. Training pose MLP **tidak menyelesaikan** detector miss. Eksperimen harus menandai sumber salah secara terpisah.

## 2. Daftar gesture GAME, NUI LAB, dan R19, untuk iconpack

### 2.1 GAME sekarang berdasarkan gesture router main (fungsi per fase)

| Nama ikon / pose | Fungsi yang tercatat pada source |
|---|---|
| `thumb-confirm`, jempol naik tanpa telunjuk | Konfirmasi, selesai gambar/minta Top-3, lempar stiker, taruh objek, konfirmasi dialog tertentu |
| `pinch`, jempol+telunjuk | Menggambar, grab/memindahkan objek, gambar ulang sesuai mode |
| `one-finger`, telunjuk | Bab 1, Top-3 pertama, Undo kanvas pada router, retry, steering Thinman existing |
| `two-fingers`, telunjuk+tengah | Bab 2, Top-3 kedua, Redo router, aksi saat gagal |
| `three-fingers` | Bab 3, Top-3 ketiga, gambar lagi saat gagal |
| `four-fingers` | Hitungan/pilihan daftar empat, bukan kelas HandPose tersendiri |
| `five-fingers` / `open-palm` | Guard Hapus 5 jari, Bukan ini, Gambar lagi, masuk Putar bergantung fase |
| `split-palm` | Varian telapak untuk Hapus/Putar pada router |
| `fist` | Pose diagnostik, **bukan** erase |
| `palm-rotate` | Rotasi objek hanya setelah mode Putar |
| `neutral` | Tidak memberi perintah |

**Perhatian:** mapping kanvas di `main` saat ini adalah satu jari Undo, dua jari Redo, sementara D-20261110-07 dan D-20261115-02 memuat konflik dengan gagasan redo telapak. Jangan mengubahnya diam-diam. Ikon dibuat berdasarkan **pose fisik**, bukan mengunci arti global.

### 2.2 NUI LAB sekarang

**`/nui-lab/gesture`:** uji `thumb-up`, `pinch-near`, `pinch-touch`, `fist`, satu/dua/tiga/empat/lima jari, `open-palm`, `split-palm`, `swipe-left`, `swipe-right`, `palm-rotate`, `no-hand`, `no-action`. Diagnostik gesture/confidence (bila model ada), jari, primary hand lock/relock, kamera, backlight/luma, FPS, latency.

**`/nui-lab/canvas`:** tes pinch→ink, lima jari→hapus, satu/dua jari→Undo/Redo dengan baseline hold atau swipe eksperimen, pointer fallback, rearm, stop stroke, false erase/undo/redo. Pistol R19 boleh **diobservasi**, bukan memicu coretan/hapus maupun mengubah gameplay.

### 2.3 Kandidat dua pose Pistol R19

| Label | Tangan | Tujuan |
|---|---|---|
| `POINT_READY` | Telunjuk lurus, jempol **terlipat**, tengah/manis/kelingking terlipat | Arah terbaca, semua tombol OFF |
| `POINT_PRESS` | Telunjuk lurus, jempol **dibuka ke samping**, tiga jari lain terlipat | KEYDOWN dan HELD |
| `POINT_RELEASE` | Transisi PRESS→READY ketika jempol dilipat | KEYUP (bukan kelas gambar wajib) |
| `OTHER` | Thumb-up tunggal, pinch, dua/tiga jari, telapak, fist, pose istirahat, ambiguous | Neutral/negative |
| `NO_HAND` | Tidak ada tangan valid/locked | RELEASE_ALL; status tracker, bukan kelas model |

**Mapping geometric, bukan klasifikasi gambar untuk 5 arah:** POINT_PRESS kanan→RIGHT, kiri→LEFT, atas→JUMP, kanan-atas→RIGHT+JUMP, kiri-atas→LEFT+JUMP. DOWN→neutral. Ready arah apa pun tidak bergerak.

Transisi RIGHT held→RIGHT+UP harus mempertahankan RIGHT, UP hanya pada jump event/hold policy yang diujikan; balik diagonal→kanan harus lepas UP tanpa menghentikan RIGHT. Jempol dilipat, hand lost, browser hidden, hand takeover ambigu harus release aman. Uji edge-trigger vs hold jump karena `jump-assist.ts` dapat mengulang lompat jika jumpHeld terus true. Jangan mengubah physics diam-diam.

**Kondisi tersulit:** tangan kanan menunjuk ke kiri dengan punggung menghadap kamera. Jempol bisa terocclude; gunakan landmark thumb relatif telapak, bukan ukuran “jempol harus ke atas layar”. Jangan hanya pakai count==2 karena pistol bisa tertukar two-fingers/Redo.

### 2.4 Master iconpack Owner (21 nama, bukan 21 kelas AI)

`thumb-confirm`, `pinch`, `one-finger`, `two-fingers`, `three-fingers`, `four-fingers`, `five-fingers`, `open-palm`, `split-palm`, `fist`, `palm-rotate`, `swipe-left`, `swipe-right`, `neutral`, `pistol-ready`, `pistol-press`, `pistol-right`, `pistol-left`, `pistol-up`, `pistol-up-right`, `pistol-up-left`.

Varian arah pistol cukup overlay panah dari satu ilustrasi pistol press; `pistol-release` bila perlu adalah transisi visual press→ready. Iconpack adalah brief visual, **bukan** data yang harus dilatih menjadi 21 kelas.

## 3. Dataset shortlist dan lisensi (prioritas urut)

| Tier | Sumber resmi | Kegunaan dan batas |
|---|---|---|
| **T1** | [HandGesture-5G v1](https://data.mendeley.com/datasets/wj25crzdbm/1) | 2.653 RGB images, kelas `L-Sign` 537 gambar + Pointing Up, V, Fist, Palm, dorsal/palmar, low/normal/high exposure. **CC BY 4.0**. L-Sign **kandidat** PRESS, bukan otomatis label identik; foto statis dari 7 partisipan, tidak menyediakan transisi buka-tutup jempol. |
| **T1** | [IPN Hand / IPN HandS](https://gibranbenitez.github.io/IPN_Hand/) | 200 video/landmarks temporal, pointing/NOG, baseline R18. **CC BY 4.0** pada official data; atribusi MPHands sesuai model card. TIDAK ada kelas pistol PRESS eksplisit. |
| **T2** | [Natural RGB Hand Gestures v1](https://data.mendeley.com/datasets/n66hhk695h/1) | RGB video bright/dim, view hand-only/full-body. **CC BY 4.0**. V1 menyebut 312 video/2 peserta; jangan campur statistik rilis v1 dengan versi lainnya. External stress dahulu. |
| **T2** | [Egocentric/Exocentric Hands v2](https://data.mendeley.com/datasets/bxr7kx84y6/2) | 47.166 frame RGB, bayangan/blur/extremely dim dan beberapa tangan. **CC BY 4.0**. Manifest R18 melaporkan 2 slice diunduh, belum berlabel pistol. |
| **T2** | [Exocentric Hand Interaction v2](https://data.mendeley.com/datasets/9d37m3nfgm/2) | 7.221 frame, low-light, shadow, multi-person, permainan/objek. **CC BY 4.0**; kamera smartphone third-person ≠ webcam laptop. |
| **HOLD** | [HaGRIDv2](https://github.com/hukenovs/hagrid) | Hard negatives, jari/gesture. Varian lisensi ShareAlike: **jangan masukkan ke bobot distribusi tanpa izin/penilaian hukum Owner**. |
| **BLOCKED** | [DimHand](https://hanlingzhan.github.io/DimHand/) | Low-light RGB-D; aplikasi akses akademik Owner belum dijawab. Tidak boleh mengklaim sudah diunduh/digunakan; ketentuan NC/ND/redistribution memerlukan pemisahan evaluasi. |

**Status historis manifest R18:** IPN HandS (annotations+GT+MPHands) DOWNLOADED_AND_VERIFIED, dua Mendeley low-light slices DOWNLOADED_AND_VERIFIED, HaGRIDv2 annotation belum diunduh saat snapshot, DimHand BLOCKED. **Recheck file/checksum/df -h saat ini**, jangan mengira storage masih sama. Pada snapshot R18 disk tersisa sekitar 4,8 GiB, bukan angka runtime terkini.

**Backlog 15 dataset lain dari riset 20 sumber, bukan batch train otomatis:**
1. Cambridge Hand Gesture (lighting; license TBD)
2. NUS Hand Posture II (clutter/no-hand)
3. EgoHands (hand-human occlusion)
4. MediaPipe Hand Gesture Landmarks CSV (landmark/label mismatch)
5. FreiHAND (keypoints, bukan label PRESS)
6. RHD / Rendered Handpose (synthetic 21 pose, domain gap)
7. InterHand2.6M (two-hand occlusion, NC)
8. DexYCB (occlusion/hand-object, NC/large)
9. HO-3D (hand-object, restricted research)
10. FPHA (hand action temporal, RGB-D)
11. HANDS RGB-D (poses/light variance)
12. LOL-v2 Real (enhancement only, **bukan hand gesture**)
13. See-in-the-Dark SID (RAW low-light only)
14. LLHands/XPose (low-light keypoints, data accessibility unverified)
15. MGR-Dark (gesture RGB/IR, public RGB download unverified)

Dataset audit harus berujung `SELECT / EVAL_ONLY / HOLD_LICENSE / BLOCKED / REJECT`, bukan sekadar daftar nama. Jangan ambil semua data karena besar. Dataset 3D, enhancement atau segmented hand tidak otomatis mempunyai label trigger pistol.

### 3.1 Kewajiban CC dan attribution

Untuk setiap data yang dipakai simpan **judul dataset, creator, versi, DOI/official URL, link lisensi, jenis penggunaan, perubahan/relabel dan checksum**. CC BY 4.0 memerlukan atribusi. Data license dan aturan terhadap model turunan harus ditinjau kasus per kasus. Data dengan NC/ND/ShareAlike tidak boleh dicampur sembarangan ke weights yang akan didistribusikan. Tidak boleh commit dataset mentah, wajah, rekaman webcam pengguna atau data siswa ke repo publik.

## 4. Dataset baru untuk transisi READY/PRESS

**Bottleneck label penting:** dataset HandGesture-5G menyediakan pose statis L-Sign, bukan sequence KEYDOWN/HELD/KEYUP. Buat protokol rekam **dengan persetujuan** untuk gesture yang benar-benar dibutuhkan. Anak SMP memerlukan izin dan ketentuan institusi yang sesuai; jangan meminta/menyimpan footage siswa tanpa dasar.

Rekam/check:
- Tangan kanan dan kiri, **punggung tangan ke kamera**, telapak ke kamera, jari berputar ke arah kiri/kanan/atas/diagonal, jarak/edge frame.
- READY→PRESS→RELEASE; PRESS kanan→kanan-atas→kanan, PRESS kiri→kiri-atas→kiri; hand switching/loss.
- Lampu ruangan, overhead, backlight, side light, low-light, motion blur, lampu belakang.
- Thumb-up biasa, two/three/four/five fingers, pinch-near, pinch-touch, fist, open-palm, no-action, object distractor, no-hand, 2 tangan.
- Ground truth **intent interval dari anotator manusia**, bukan otomatis pose classifier yang sedang diuji. Saat MediaPipe tidak mendeteksi tangan, catat `DETECTOR_MISS` terpisah dari OTHER.
- Train/VAL/locked test **subject/session/camera-disjoint**, tidak acak frame berdampingan. Deduplikasi/scene split; test tidak boleh dipakai untuk threshold tuning.
- Simpan data raw di private storage; publish skema, ringkasan aggregate, contoh sintetis dan checksum non-sensitive saja.

## 5. Training bertahap dan eksperimen

| ID | Kandidat | Bukti yang dicari |
|---|---|---|
| G0 | Steering Thinman existing | Baseline feel/latency tanpa pistol PRESS |
| G1 | Geometri pistol murni (21 landmark) | Apakah READY/PRESS terpisah tanpa model ML |
| G2 | Logistic Regression kecil | Improvement atas G1 pada hard negatives |
| G3 | MLP kecil | Improvement pada rotasi/occlusion/sudut |
| G4 | Hybrid G1+MLP+FSM temporal | False PRESS turun tanpa membuat latency berat |
| G5 | Transfer R18 68 fitur (opsional) | Apakah fitur R18 membantu tanpa menganggap POINT_1F = PRESS |
| L0–L2 | RAW/AUTO-CLAHE/existing vs kandidat adaptive RAW-first | Isolasi detector low-light dari classifier dan biaya CPU |

Urutan: verifikasi license/disk → audit label → G1 baseline → kurasi data webcam → model LR/MLP → calibration/ablation → Python↔TypeScript parity → browser runtime (separate safety gate) → Owner physical webcam. Gunakan fitur yang sama seperti MediaPipe target, bukan melatih pada 3D GT lalu mengasumsikan fit webcam. Hyperparameter, class balance, thresholds dan augmentation disetel dengan Train/Val saja. Locked test jangan dipakai memilih model.

**Metrik wajib:** detection recall/no-hand false positives; PRESS precision/recall/macro-F1/confusion vs thumb-up/pinch/two-fingers; false KEYDOWN/minute negatif; false KEYUP/stuck key/held continuity; stop/start/diagonal jump latency; input-to-motion p50/p95, handedness + dorsal/palmar + low-light per-slice; browser FPS, main-thread long tasks, RAM, cold/warm transferred bytes; model size; CPU software renderer vs GPU bila ada.

Jangan menyamakan macro-F1 offline dengan keberhasilan bermain. Rekam error khusus arah kiri dengan tangan kanan dan punggung ke kamera, serta perubahan RIGHT→RIGHT+UP tanpa putus horizontal. Uji jump single press vs repeated hold berdasarkan controller existing, jangan otomatis mengganti fisika.

## 6. Unduhan siswa dan performa

Siswa **tidak** mengunduh dataset training. Hanya browser application, MediaPipe assets, hand_landmarker.task, code, dan bobot model ringan bila dipilih.

Target R&D dari plan R18 v0.3.0 adalah **total fresh first-use journey <25 MB** (belum tentu tercapai). Sub-budget usulan R19 ≤200 KB transfer terkompresi untuk model classifier tambahan adalah **parameter prototipe** yang perlu diuji, bukan threshold PA. R18 MLP dilaporkan 123.141 B uncompressed dan ~44 KB wire pada browser simulasi, tidak mewakili total aplikasi.

**Satu instance MediaPipe**. Jangan menambah 2nd detector/model berat jika tidak perlu. Ukur total transfer, cold/warm cache, latency kamera→virtual key→Thinman, FPS game/CPU, memory, long-task dan responsiveness ketika stream on. R18 browser simulated video pernah melaporkan ~12,59 FPS, bukan bukti pada laptop siswa. Jika accuracy naik tapi sistem lag/false action, **NO-GO**.

## 7. Acceptance & penghentian

**P0:** preflight branch, main SHA, disk, license, doc, status [WIP].  
**P1:** audit dataset dan anotasi; keluarkan manifest + legal gate, bukan hanya nama.  
**P2:** geometry baseline dan FSM tests; tidak ada aksi saat READY.  
**P3:** training LR/MLP + ablation + locked evaluation; model card/source scripts.  
**P4:** offline negative/false action, hand ownership, thumb occlusion, low-light/regression.  
**P5:** benchmark browser, wire bytes dan latency; proposal integrasi NUI Lab **dua route existing saja**.  
**P6:** webcam fisik Owner; kamera laptop backlit/overhead/dim, right-to-left dorsal and gesture comfort. Jangan klaim PHYSICAL_WEBCAM PASS dari fake media.

**NO-GO:** dataset tidak legal/label tidak sesuai; leakage; false press/stuck key; gagal release saat tracking lost; performance regress tanpa manfaat; belum ada validasi webcam untuk klaim produk. Jika data pistol belum cukup, jangan melatih “semua 20 dataset” secara membabi buta. Laporkan kebutuhan rekaman.

## 8. Deliverable hasil R19 di branch research-can (wajib)

| Lokasi | Isi |
|---|---|
| `r19/manifests/dataset_manifest.json` | source/version/license/DOI, ukuran/hash, status download, split, label mapping, excluded |
| `r19/results/R19_DATASET_AUDIT.md` | audit kandidat 20 dataset, provenance, attribution, legal gate |
| `r19/results/R19_GESTURE_LABEL_SCHEMA.md` | READY/PRESS/OTHER/NO_HAND, interval, transisi, negative |
| `r19/experiments/` | G0–G5, L0–L2, configs, seeds, ablation |
| `r19/scripts/` | download/checksum yang sah, features, train/eval/export, parity, perf |
| `r19/candidates/` | geometry-only, ML candidate dan virtual-key FSM + unit tests |
| `r19/models/` | model card + safe/reviewed small weights **hanya dengan hak distribusi jelas dan izin Owner** |
| `r19/results/R19_TRAINING_REPORT.md` | hasil split, per-class metrics, confusion, limitations, command |
| `r19/results/R19_RUNTIME_BENCHMARK.md` | browser/device/FPS/latency/memory/wire bytes/evidence |
| `r19/results/R19_MAIN_INTEGRATION_HANDOFF.md` | handoff dua route existing `/nui-lab/gesture` & `/nui-lab/canvas`, tidak langsung ubah main |
| `r19/manifests/published_vs_excluded_manifest.json` | retained/excluded file/hash/size and reason |
| `docs/plan-rev/[WIP] NUI_R19-01_v0.1.0_Pistol_Press_Dataset_Training_Runtime_Research.md` | status pekerjaan dan evidence link |
| **root `LOG.md` + `README.md`** | **update pada SETIAP commit/push** sesuai AGENTS `7A |

Agent wajib laporkan remote commit SHA, files added/excluded, dataset real yang dipakai, run commands/exit codes, exact metrics+denominator, model & license provenance, cross-device limits, UNTESTED portions, residual failure cases, rencana next gate. No model/training result yet bukan DONE.

## 9. Referensi kerja

- [R18 model card](https://github.com/lustresense/hitl-momo/blob/research-can/r18/models/MODEL_CARD.md), [dataset manifest R18](https://github.com/lustresense/hitl-momo/blob/research-can/r18/manifests/dataset_manifest.json), [training script](https://github.com/lustresense/hitl-momo/blob/research-can/r18/scripts/ux3_train.py), [R18 WIP plan](https://github.com/lustresense/hitl-momo/blob/research-can/docs/plan-rev/%5BWIP%5D%20NUI_R18-01_v0.3.0_UX_First_Worst_Case_Research.md).
- [Main gesture mode](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/src/input/gesture-mode.ts), [main hand pose](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/src/input/hand-gesture.ts), [Thinman steering](https://github.com/lustresense/hitl-momo/blob/main/frontend/implementation/src/input/gameplay-gesture.ts), [merged PR #6](https://github.com/lustresense/hitl-momo/pull/6).
- [HandGesture-5G v1](https://data.mendeley.com/datasets/wj25crzdbm/1), [IPN Hand](https://gibranbenitez.github.io/IPN_Hand/), [Natural RGB v1](https://data.mendeley.com/datasets/n66hhk695h/1), [Egocentric/Exocentric v2](https://data.mendeley.com/datasets/bxr7kx84y6/2), [Exocentric v2](https://data.mendeley.com/datasets/9d37m3nfgm/2), [HaGRIDv2](https://github.com/hukenovs/hagrid), [DimHand](https://hanlingzhan.github.io/DimHand/).

**Penutup status:** rencana saja. R19 model/training/performance/physical webcam adalah **NOT_TESTED**; keputusan mapping PA masih berlaku sampai audit dan persetujuan Owner.
