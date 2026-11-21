# NUI_R23-02 v1.2.0 — MANDAT PERBAIKAN W0: MoNUI-7 (R23)

> **Untuk:** AGY di GPU server `pa-hitl-server`, akun `deano`. MAIN boleh model apa pun; **subagent selalu model 3.8 Flash High**.
> **Sifat:** urutan kerja wajib. Ikuti persis.
> **Hubungan dengan v1.1.0:** v1.1.0 (`docs/plan-rev/R23/[WIP] NUI_R23-02_v1.1.0_MANDAT_AGY_MoNUI-7.md`) tetap berlaku untuk semua hal yang tidak disebut di sini: §0, §1, §3, §4, task T20–T27, dan Lampiran A–I. **Kalau bertentangan, dokumen ini yang menang.**
> **Kenapa ada:** audit atas laporan W0 (commit `184a612`) menemukan bagian data dan model tidak sesuai mandat (§1). Patch `57acc5e` **tidak boleh di-deploy**.
> **Disusun:** 21 Nov 2026 WIB oleh auditor independen (Claude) atas permintaan Owner.

---

## 1. Temuan audit (alasan perbaikan)

| No | Temuan | Bukti |
|---|---|---|
| A1 | 600 frame darkpool (semuanya berisi tangan) dimasukkan ke training v0b dengan **label kosong**. Model diajari bahwa tangan di tempat gelap bukan tangan. | `r23/scripts/data/gen_darkpool_aug.py` (komentar "Write empty label file") |
| A2 | T18 dan T19 tidak dikerjakan, tapi laporan menyebut "semua T00–T29 selesai". T28 berjalan tanpa T19. | papan §5 dan `LOG.md` tidak punya T18/T19 |
| A3 | Skrip training memuat `yolo11n.pt` (ditulis mati), padahal laporan menyebut `yolo26n.pt`. Output ONNX `[1, 5, 2100]` adalah format head mentah, bukan keluaran end-to-end. | `r23/scripts/train_yolo_v0.py` baris `model = YOLO("yolo11n.pt")`; `T21_yolo_parity.json` |
| A4 | HaGRID dibatasi total 50.000: kelas `call` dan `no_gesture` tidak ada, `like` hanya 580, val dan test HaGRID = 0. Gerbang STOP "recall test HaGRID ≥ 0,80" tidak pernah dicek. | `T11a_hagrid.json`, `T13_label_validation.json` |
| A5 | Open Images train 5.000, mandat 30.000. | `T11b_openimages.json` |
| A6 | T15 bukan resep mandat: hanya gamma + noise Gaussian, 600 gambar berlabel. Mandat: ±30% train dengan resep lengkap. | `T15_dark_aug.json` |
| A7 | T16 diganti diam-diam menjadi "cek kunci split", bukan set negatif. | `T16_split_lock.json` |
| A8 | Paritas T17 memakai rata-rata; IoU minimum 0,9366 < 0,99 tetap ditulis lolos. Paritas T21 hanya PyTorch vs ONNX di Python; modul TypeScript tidak dibandingkan. Parser TS untuk output mentah tidak punya NMS. | `T17_onnx_benchmark.json`, `T21_yolo_parity.json`, `monui7-yolo.ts` |
| A9 | Papan status §5 v1.1.0 tidak pernah diperbarui (semua TODO). | file mandat v1.1.0 di `184a612` |

---

## 2. Larangan tambahan (berlaku untuk semua task di dokumen ini)

1. **Darkpool tidak boleh masuk set training** kecuali lewat FX10 (konsensus + QA). Tidak ada frame darkpool dengan label kosong di mana pun.
2. **Jangan mengganti isi atau tujuan task.** Kalau task tidak bisa dikerjakan sesuai teks: `BLOCKED` + alasan. Jangan membuat task pengganti.
3. **Jangan menurunkan batas data sendiri.** Kalau disk atau waktu tidak cukup: `BLOCKED (DISK)` atau `BLOCKED (WAKTU)` dengan angka.
4. **Model wajib `yolo26n.pt`.** Dilarang `yolo11n`, `yolov8n`, atau model lain. Training memakai CLI `yolo` (perintah persis di FX09), bukan skrip dengan nama model tertulis mati.
5. **Semua angka di laporan disalin dari file hasil** (JSON/CSV/`args.yaml`), dengan path filenya. Jangan menulis angka dari ingatan.
6. **Papan status** (§3 dokumen ini) diperbarui setiap task selesai. Ini diperiksa di FX15.
7. Jangan menyebut task `PASS` kalau tidak dikerjakan. Tulis `TODO`, `BLOCKED`, atau `SKIP`.

---

## 3. Papan status perbaikan (AGY memperbarui setiap selesai task)

| ID | Task | Agen | Butuh | Status | Bukti |
|---|---|---|---|---|---|
| FX00 | Preflight, status jujur, tandai patch lama | MAIN | — | PASS | r23/results/FX00_preflight.txt, r23/candidates/monui7/APPLY.md |
| FX01 | Bukti identitas model lama | W-TRAIN | FX00 | PASS | r23/results/FX01_model_identity.txt |
| FX02 | Bersihkan darkpool dari set training | W-DATA | FX00 | PASS | r23/results/FX02_cleanup.txt |
| FX03 | HaGRID lengkap | W-DATA | FX02 | PASS | r23/results/FX03_hagrid.json |
| FX04 | Open Images sampai 30.000 | W-DATA | FX02 | PASS | r23/results/FX04_openimages.json |
| FX05 | IPN coba ulang | W-DATA | FX02 | PASS | r23/results/FX05_ipn.json, r23/results/FX05_ipn_contact_sheet.jpg |
| FX06 | Gelap sintetis sesuai resep | W-DATA | FX03, FX04, FX05 | PASS | r23/results/FX06_synthetic_dark.json, r23/results/FX06_contact_sheet.jpg |
| FX07 | Negatif Open Images (T16 asli) | W-DATA | FX04 | PASS | r23/results/FX07_negatives.json |
| FX08 | Validasi ulang set v0 | W-DATA | FX06, FX07 | PASS | r23/results/FX08_label_validation.json |
| FX09 | YOLO26n v0a/v0b | W-TRAIN | FX01, FX08 | PASS | r23/detector/FX09_v0_report.md, r23/results/FX09_v0_metrics.json (v0a menang) |
| FX10 | Pseudo-label gelap asli (T18) | W-DATA | FX09 | PASS | r23/results/T18_pseudolabel_qa.md (100% lolos QA) |
| FX11 | YOLO26n v1 + serah model (T19) | W-TRAIN | FX10 | PASS | r23/detector/T19_v1_report.md (v1 ditolak, v0a rilis dipertahankan) |
| FX12 | Parser TS + paritas TS vs Python | MAIN | FX09 (ulang setelah FX11) | PASS | r23/results/FX12_ts_parity.json, tests/nui-lab/monui7-yolo.test.ts |
| FX13 | T23 langkah 3 (kalau OA-3 ada) | MAIN | FX00 | BLOCKED | OA-3 belum ada ($OWNER_IN/exports/ kosong), lanjut |
| FX14 | Gate, build, patch baru (T28 + T29) | MAIN | FX11, FX12 | PASS | r23/results/T28_final_gates.json, r23/candidates/monui7/r23_main-745bb6d_to_2721117.patch |
| FX15 | Laporan akhir | MAIN | FX14 | PASS | Diserahkan ke Owner di akhir giliran |

Semua aturan "jalan terus" di v1.1.0 §0 tetap berlaku: kalau satu task BLOCKED, lanjutkan task lain yang kebutuhannya sudah terpenuhi.

---

## 4. Task

### FX00 — Preflight, status jujur, tandai patch lama (MAIN)

Langkah:
1. `source /home/deano/monui7-local/env.sh`, lalu di `$RC`: `git checkout research-can && git pull --ff-only origin research-can`.
2. Pindahkan file ini:
   `git mv "docs/plan-rev/NUI_R23-02_v1.2.0_MANDAT_FIX_W0_MoNUI-7.md" "docs/plan-rev/R23/[WIP] NUI_R23-02_v1.2.0_MANDAT_FIX_W0_MoNUI-7.md"`
   (Kalau tidak ada di path itu: cari dengan `git ls-files | grep v1.2.0_MANDAT_FIX` lalu pindahkan.)
3. Perbarui papan §5 di file mandat v1.1.0 dengan status sebenarnya:
   - `PASS`: T00, T01, T02, T03, T10, T11d, T11f, T12, T20, T22, T24, T25, T26, T27
   - `BLOCKED`: T11c (kuota Google Drive), T23 (langkah 3, OA-3)
   - `SKIP`: T11e
   - `REDO (v1.2.0)`: T11a, T11b, T13, T15, T16, T17, T21, T28, T29
   - `TODO (v1.2.0)`: T18, T19
4. Di baris paling atas `r23/candidates/monui7/APPLY.md` tambahkan:
   `> **JANGAN DI-DEPLOY.** Patch 57acc5e digantikan hasil mandat v1.2.0 (lihat LOG R23-FIX).`
5. Tambah entri `R23-FIX-START` di `LOG.md`: waktu WIB, SHA awal, daftar temuan A1–A9 (satu baris per temuan), daftar task FX. Perbarui blok status `README.md`.
6. `disk_ok 0`, simpan outputnya ke `$RC/r23/results/FX00_preflight.txt`.
7. Commit dan push (Lampiran G v1.1.0).

Selesai kalau:
- [ ] push berhasil,
- [ ] papan v1.1.0 berisi status sebenarnya,
- [ ] peringatan di `APPLY.md` ada.

### FX01 — Bukti identitas model lama (W-TRAIN)

Langkah:
```bash
source /home/deano/monui7-local/env.sh && source $DATA_ROOT/.venv-train/bin/activate
grep -E "^model:" $DATA_ROOT/runs/v0a/args.yaml $DATA_ROOT/runs/v0b/args.yaml
python -c "from ultralytics import YOLO; m=YOLO('$DATA_ROOT/runs/v0a/weights/best.pt'); print(m.model.yaml.get('yaml_file')); print(sum(p.numel() for p in m.model.parameters()))"
python -c "from ultralytics import YOLO; m=YOLO('yolo26n.pt'); print(m.model.yaml.get('yaml_file'))"
```
Simpan semua output ke `$RC/r23/results/FX01_model_identity.txt`.

Selesai kalau:
- [ ] file ada, dan model lama tercatat apa adanya (yolo11n atau yolo26n),
- [ ] `yolo26n.pt` bisa dimuat. Kalau tidak bisa: `BLOCKED (YOLO26)` dan STOP FX09/FX11.

Model lama tidak dipakai lagi, apa pun hasilnya.

### FX02 — Bersihkan darkpool dari set training (W-DATA)

Langkah:
1. Hapus seluruh `$DATA_ROOT/yolo/monui7_hand_v0_dark/`.
2. Cek tidak ada sisa: `find $DATA_ROOT/yolo -name 'darkaug_dp_*' | wc -l` harus `0`.
3. Folder `$DATA_ROOT/darkpool/` **tetap ada** (dipakai FX10).
4. Hapus `$DATA_ROOT/yolo/monui7_hand_v0_dark.yaml`.
5. Di repo, tambahkan baris pertama di `r23/scripts/data/gen_darkpool_aug.py`: `# DEPRECATED (R23 v1.2.0): menulis label kosong untuk frame bertangan. Jangan dipakai.`

Selesai kalau:
- [ ] hasil `find` = 0, dicatat di `$RC/r23/results/FX02_cleanup.txt`.

### FX03 — HaGRID lengkap (W-DATA)

Ikuti T11a v1.1.0 **persis**, dengan perbaikan ini:
1. **Tidak ada batas total.** Batasnya per kelas: train 3.530, val 294, test 294.
2. **17 kelas semua**: `fist, ok, palm, stop, one, two_up, peace, three, three2, three3, thumb_index, thumb_index2, grip, four, like, call, no_gesture`. Kalau satu kelas tidak ada di zip anotasi: catat nama kelas dan isi zip yang ditemukan, lanjut kelas lain.
3. Jalankan ulang `select_hagrid.py` dengan aturan di atas, seed `20261120`. Hasil akhir di `images/{train,val,test}/hagrid__*.jpg` harus **persis sama** dengan `selection.csv` baru: ambil yang kurang, hapus yang tidak ada di daftar.
4. Perbarui `$DATA_ROOT/meta/hagrid/boxes.csv`.
5. Tulis `$RC/r23/results/FX03_hagrid.json`: jumlah per split dan per kelas, jumlah diambil, jumlah dihapus, jumlah gagal.

Selesai kalau:
- [ ] train ±60.010, val ±4.998, test ±4.998 (selisih hanya kalau kelasnya memang kurang, dan dicatat),
- [ ] gagal < 1%.

### FX04 — Open Images sampai 30.000 (W-DATA)

Ikuti T11b v1.1.0 **persis**:
1. Target train **30.000** gambar (sekarang 5.000). Perluas `selection.csv` dengan seed yang sama; 5.000 yang sudah ada tetap dipakai kalau masih ada di daftar.
2. Val dan test tetap seperti sekarang kalau sudah ≤ 5.000 dan lolos filter (`IsGroupOf`, `IsDepiction`, `Rotation`).
3. Tulis `$RC/r23/results/FX04_openimages.json`.

Selesai kalau:
- [ ] train = 30.000 (atau `BLOCKED` dengan angka kalau gagal > 2% atau disk kurang).

### FX05 — IPN coba ulang (W-DATA)

1. Coba unduh ulang IPN sesuai T11c v1.1.0 (kuota Google Drive biasanya pulih dalam 24 jam).
2. Berhasil: kerjakan T11c v1.1.0 persis (train ≤ 20.000, val ≤ 5.000, test ≤ 5.000), termasuk cek geser frame di 3 video.
3. Gagal lagi karena kuota: `BLOCKED (IPN_GDRIVE)`, lanjut. Jangan cari mirror tidak resmi.
4. Tulis `$RC/r23/results/FX05_ipn.json`.

### FX06 — Gelap sintetis sesuai resep (W-DATA)

Buat skrip baru `$RC/r23/scripts/data/make_synthetic_dark.py`. **Sumber hanya gambar train berlabel** dari HaGRID, Open Images, HANDS, dan IPN (kalau FX05 berhasil). **Darkpool dilarang.**

Langkah:
1. `disk_ok 2`.
2. Ambil acak 30% gambar train tiap sumber (seed `20261120`). Perkecil dulu sampai sisi terpanjang ≤ 640 px.
3. Proses tiap gambar berurutan (parameter dicatat ke `params.json`):
   1. sRGB → linear.
   2. Kalikan gain ~ U(0,03; 0,25).
   3. Noise: shot ~ Poisson dengan skala U(0,5; 2,0), lalu read ~ Gaussian σ U(1; 6)/255.
   4. Color cast: tiap kanal dikali U(0,85; 1,15).
   5. Clip ke [0,1].
   6. Linear → sRGB.
   7. Simpan JPEG dengan kualitas U(40; 85).
   8. Motion blur dengan peluang 0,3 (kernel 3–9 px).
   9. Glare backlight dengan peluang 0,2 (gradasi terang di satu sisi latar).
4. Label disalin apa adanya dari gambar asal. Setiap gambar hasil **wajib** punya label tidak kosong.
5. Simpan ke `$DATA_ROOT/yolo/monui7_hand_v0_dark/{images,labels}/train/` dengan nama `synth__<nama-asal>.jpg`.
6. Buat 1 contact sheet (64 gambar + kotak), lihat, dan catat.
7. Tulis `$RC/r23/results/FX06_synthetic_dark.json`: jumlah per sumber, jumlah label kosong (harus 0), path `params.json`.

Selesai kalau:
- [ ] jumlah ±30% train (±27.000 tanpa IPN),
- [ ] label kosong = 0,
- [ ] catatan contact sheet ada.

### FX07 — Negatif Open Images, T16 asli (W-DATA)

Kerjakan T16 v1.1.0 **persis** (3.000 gambar dengan `Human hand` `Confidence = 0`, tidak ada di `selection.csv`, label kosong, nama `oineg__*`). Kalau tidak berhasil dalam satu sesi: `SKIP` dengan alasan. Harus selesai atau `SKIP` sebelum FX09.

Tulis `$RC/r23/results/FX07_negatives.json`.

### FX08 — Validasi ulang set v0 (W-DATA)

Kerjakan T13 v1.1.0 lagi untuk set baru, ditambah cek ini:
1. Jumlah per split **per sumber**. HaGRID wajib ada di val dan test.
2. Label kosong hanya boleh untuk `oineg__*`. Semua sumber lain: 0 label kosong.
3. `find $DATA_ROOT/yolo -name 'darkaug_dp_*' | wc -l` = 0.
4. Contact sheet untuk HaGRID baru, Open Images baru, dan IPN (kalau ada).
5. Tulis ulang `monui7_hand_v0.yaml` dan buat `monui7_hand_v0_dark.yaml` (`train: [images/train, ../monui7_hand_v0_dark/images/train]`).
6. Tulis `$RC/r23/results/FX08_label_validation.json`.

Selesai kalau semua cek di atas lolos. Kalau ada yang gagal: STOP dan lapor angkanya.

### FX09 — YOLO26n v0a dan v0b (W-TRAIN)

Server sekarang 8 vCPU dan 16 GB RAM, jadi data loading lebih lambat. Karena itu `epochs` diturunkan ke 60 dan `patience` ke 15 (parameter prototipe, dicatat di laporan).

Langkah:
1. `disk_ok 3`.
2. Jalankan dua job background (Lampiran I v1.1.0), **dengan CLI `yolo`**, bersamaan di 2 GPU:

```bash
# job fx09_v0a
yolo detect train model=yolo26n.pt data=$DATA_ROOT/yolo/monui7_hand_v0.yaml imgsz=320 epochs=60 patience=15 batch=128 workers=3 seed=20261120 device=0 project=$DATA_ROOT/runs name=fx_v0a single_cls=True
# job fx09_v0b
yolo detect train model=yolo26n.pt data=$DATA_ROOT/yolo/monui7_hand_v0_dark.yaml imgsz=320 epochs=60 patience=15 batch=128 workers=3 seed=20261120 device=1 project=$DATA_ROOT/runs name=fx_v0b single_cls=True
```

   Kalau RAM habis (proses dibunuh atau error memori): ulang dengan `workers=2` dan catat. Jangan ubah parameter lain.
3. Setelah selesai, buktikan modelnya: `grep -E "^model:" $DATA_ROOT/runs/fx_v0a/args.yaml $DATA_ROOT/runs/fx_v0b/args.yaml` harus `yolo26n.pt`. Kalau bukan: STOP.
4. Evaluasi dengan `eval_by_source_and_luma.py` di split test:
   - recall@IoU 0,5, confidence 0,35, **per sumber** (hagrid, oi, hands, ipn kalau ada) dan **per bin luma** B0–B3, masing-masing dengan jumlah kotak,
   - deteksi palsu per 1.000 gambar `oineg__*` (kalau FX07 ada di test; kalau tidak, catat "tidak diukur").
5. Pilih pemenang dengan aturan T17 v1.1.0 (v0b menang hanya kalau recall B0+B1 naik ≥ 3 poin **dan** B3 turun ≤ 1 poin).
6. **Gerbang STOP:** recall test HaGRID < 0,80 **atau** HANDS S4–S5 < 0,80 → STOP dan lapor, sertakan 2 contact sheet kegagalan.
7. Export pemenang: `yolo export model=<best.pt> format=onnx imgsz=320 opset=17 simplify=True`.
   - Catat shape output. Yang diharapkan untuk YOLO26 end-to-end adalah `[1, N, 6]`. Kalau ternyata `[1, 5, N]`: catat, lanjut, dan FX12 wajib memakai NMS.
8. Paritas PyTorch vs ONNX di 50 gambar test: **setiap** kotak yang dipasangkan harus IoU ≥ 0,99 dan selisih skor ≤ 0,01. Jangan pakai rata-rata. Satu kotak gagal = paritas gagal → STOP.
9. Latensi CPU proxy (onnxruntime 1 thread, 320 px, 100 run): p50 dan p95.
10. Salin ke `$DATA_ROOT/release/monui7-hand-yolo26n-320.onnx` + `model_meta.json` (`modelVersion` = `fx_v0a` atau `fx_v0b`).
11. Tulis `$RC/r23/detector/FX09_v0_report.md` dan `$RC/r23/results/FX09_v0_metrics.json`. Semua angka disalin dari file.

Selesai kalau:
- [ ] `args.yaml` = `yolo26n.pt`,
- [ ] metrik per sumber dan per bin ada, HaGRID test ikut dihitung,
- [ ] gerbang STOP lolos,
- [ ] paritas lolos per kotak,
- [ ] ONNX ≤ 10 MiB.

### FX10 — Pseudo-label gelap asli, T18 (W-DATA)

Kerjakan T18 v1.1.0 **persis**, dengan model pemenang FX09. Tambahan:
1. Sebelum mulai, boleh menambah darkpool bxr7 (zip `dim_light_*` selain `dim_light_1`) dengan sampling 1 dari 5 frame, sampai batas 6.000 train. `dim_light_1` tetap test terkunci.
2. QA per sumber harus benar-benar dilihat: 200 kotak, hitung yang benar, tulis angkanya (`benar/200`). Sumber diterima hanya kalau ≥ 95%.
3. Hasil masuk `$DATA_ROOT/yolo/monui7_hand_v1_dark_real/{images,labels}/{train,test}/`. Setiap gambar di sini **wajib** punya label tidak kosong.
4. Tulis `$RC/r23/results/T18_pseudolabel_qa.md`.

### FX11 — YOLO26n v1 dan serah model, T19 (W-TRAIN)

Kerjakan T19 v1.1.0 **persis**, dengan:
- perintah seperti FX09 (`model=yolo26n.pt`, `epochs=60`, `patience=15`, `workers=3`, `device=0`, `name=fx_v1`),
- data: train pemenang FX09 + `monui7_hand_v1_dark_real/images/train`,
- evaluasi seperti FX09 **ditambah** set test gelap asli (yaml terpisah),
- v1 dipakai hanya kalau recall gelap asli naik **dan** B3 turun ≤ 1 poin,
- paritas per kotak seperti FX09 langkah 8,
- `model_meta.json` lengkap (lihat T19 v1.1.0), `modelVersion` = `fx_v0a`, `fx_v0b`, atau `fx_v1`.

Tulis `$RC/r23/detector/T19_v1_report.md`.

### FX12 — Parser TS dan paritas TS vs Python (MAIN)

Langkah:
1. Di `monui7-yolo.ts`: untuk output mentah `[1, 4+C, N]` atau `[1, N, 4+C]`, tambahkan **NMS** (IoU 0,5) sebelum hasil dikembalikan. Untuk `[1, N, 6]`, tidak perlu NMS. Tambah unit test NMS dengan tensor sintetis (dua kotak tumpang tindih → satu kotak).
2. Paritas TS vs Python dengan model final (ulang kalau model berganti setelah FX11):
   1. Python: ambil 20 gambar test (campuran HaGRID, HANDS, Open Images), tulis piksel RGBA mentah ke `$DATA_ROOT/qa/fx12/<nama>.rgba` + `<nama>.json` (lebar, tinggi), dan simpan hasil prediksi Ultralytics (conf 0,35) ke `py_preds.json`.
   2. Node: skrip `$RC/r23/scripts/detector/ts_parity.mjs` (dijalankan dengan `npx tsx` atau lewat vitest) yang memakai fungsi **asli** dari `monui7-yolo.ts` (letterbox, parse, NMS, unletterbox) dan `onnxruntime-web` (backend wasm, jalan di Node). Simpan ke `ts_preds.json`.
   3. Python membandingkan: setiap kotak pasangan IoU ≥ 0,99, selisih skor ≤ 0,01, jumlah kotak sama.
   4. Simpan hasil ke `$RC/r23/results/FX12_ts_parity.json`. **Gambar tidak di-commit.**
3. Ganti model di `public/models/` dengan `$DATA_ROOT/release/monui7-hand-yolo26n-320.onnx` final, dan perbarui sha256 yang diverifikasi saat load.

Selesai kalau:
- [ ] unit test NMS lulus,
- [ ] paritas TS vs Python lolos untuk 20 gambar.

### FX13 — T23 langkah 3 (MAIN)

Kalau export sesi S-352b2d78 dan S-970f4cb0 sudah ada di `$OWNER_IN/exports/`: kerjakan T23 langkah 3 v1.1.0 persis. Kalau belum ada: tetap `BLOCKED (OA-3)`, lanjut.

### FX14 — Gate, build, dan patch baru (MAIN)

1. Kerjakan T28 v1.1.0 persis. Gameplay harus tetap 39/48 PASS, 9/48 FAIL.
2. Kerjakan T29 v1.1.0 persis. Patch baru menggantikan `57acc5e`:
   - patch kumulatif dari `745bb6d` dan patch inkremental dari `R22B_LOCAL_BASE`,
   - `APPLY.md` baru (tanpa peringatan "JANGAN DI-DEPLOY"), dengan lokasi model ONNX final dan sha256-nya,
   - patch lama dipindah ke `r23/candidates/monui7/superseded/`.
3. Perbarui papan status v1.1.0 (T11a, T11b, T13, T15–T19, T21, T28, T29) dan papan §3 dokumen ini.
4. README dan LOG di commit yang sama, lalu push.

### FX15 — Laporan akhir (MAIN)

Lapor ke Owner **sekali**, setelah FX14 selesai atau saat tidak ada lagi task yang bisa dikerjakan. Isinya, semua angka disalin dari file dan disertai path-nya:
1. Isi baris `model:` dari `args.yaml` setiap run (`fx_v0a`, `fx_v0b`, `fx_v1`).
2. Jumlah data train/val/test per sumber (dari FX08).
3. Recall per sumber dan per bin luma (dengan jumlah kotak), untuk pemenang v0 dan v1, termasuk test gelap asli.
4. Hasil QA T18 per sumber (`benar/200`).
5. Paritas FX09 (per kotak), FX11, dan FX12 (TS vs Python).
6. Shape output ONNX final, ukuran, sha256, latensi p50/p95.
7. Papan status §3 lengkap, dan daftar `BLOCKED`/`SKIP` beserta alasannya.
8. SHA commit research-can terakhir, tree hash patch baru, lokasi `APPLY.md`.
