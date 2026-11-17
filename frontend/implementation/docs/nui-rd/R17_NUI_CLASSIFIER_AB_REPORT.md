# R17 · RD-03 / RD-04 / RD-05 laporan heuristik, pilot classifier, A/B

Kelas bukti: **DATASET** (HaGRIDv2 landmark otomatis, gambar statis, asumsi 16:9). **Bukan webcam.** Webcam target: **NOT_TESTED**.
MediaPipe tetap deteksi utama. **Tidak ada classifier yang dipasang ke gameplay atau ke jalur gestur NUI Lab.** Auto-lock dan smoothing tidak diubah.

## Protokol

- Sampel: `scripts/nui-rd/rd_extract.py` (benih 17). train 121,858 baris / 21,576 subjek; val 50,196 / 2,652; **test 50,607 / 3,707**. Tumpang-tindih subjek antar-split **0** (dicek skrip dan `rd_train.py` melakukan `assert`).
- **VAL** dipakai untuk kalibrasi dan seleksi model/epoch. **TEST** dilaporkan, dan model dinilai di TEST **sekali** setelah dipilih.
- Ruang label: 9 kelas `FIVE FOUR THREE TWO ONE FIST THUMB_UP PINCH_LIKE OTHER` (pemetaan di `R17_NUI_DATASET_FEASIBILITY.md`). Heuristik tidak punya label "tangan alami", jadi `no_gesture` masuk OTHER untuk semua sistem.
- Anggaran keputusan ditulis **sebelum** model manapun dilatih atau dinilai: `scripts/nui-rd/rd05_budget.json`. Satu amandemen (juga sebelum model dinilai): kriteria macro-F1 dihitung pada 7 label tanpa FIST dan THUMB_UP, karena pose `thumb-up` repo membaca 82% kelas `fist` sebagai jempol-atas di kedua aturan (ketidakcocokan definisi, bukan kualitas model). Macro-F1 9-label tetap dilaporkan.
- Interval 95%: bootstrap klaster subjek, 200 resampel atas 3,707 subjek.

## RD-03 · heuristik lama vs revisi (status: SELESAI untuk DATASET)

Akar masalah per kasus (terbukti pada landmark nyata, TEST, per kelas sumber, "erase-eligible" = pose palm dan hitung = 5):

| Kasus | Baseline (game) | Revisi (lab) | Akar |
|---|---|---|---|
| `palm` → harus bisa Hapus | 54.7% | **100%** | jempol terbuka dibaca tertutup |
| `stop` | 37.9% | **94.6%** | idem |
| `four` → tidak boleh Hapus | **84.4%** | **0.2%** | jempol tertekuk dibaca terbuka (rasio 1.3 terhadap knuckle telunjuk) |
| `three` dibaca 3 jari | 16.8% | **98.3%** | jempol di kelingking dihitung terbuka → 4 |
| `no_gesture` (tangan alami) Hapus | 35.9% | 33.8% (n=607) | **tidak terselesaikan** oleh aturan |
| `grabbing` Hapus | 1.6% | **18.0%** | **regresi** aturan jempol lateral |
| `grip` Hapus | 0.6% | 4.4% | regresi |
| `ok` Hapus | 0% | 3.2% | regresi |

Metrik TEST: macro-F1 9 label 0.406 → **0.666**; 7 label 0.448 → **0.782**; akurasi 0.501 → 0.683. FIVE presisi/recall 0.483/0.463 → **0.841/0.973**.

Kalibrasi ambang jempol `THUMB_OPEN_LATERAL` (hanya VAL; pose tetap pada 1.3, sehingga ini aproksimasi untuk bagian pose):

| tau | recall(palm,stop) | Hapus pada `four` | Hapus pada `no_gesture` |
|---|---|---|---|
| 1.0 | 99.8 | 1.6 | 35.5 |
| 1.2 | 99.2 | 0.6 | 33.3 |
| 1.25 (terbaik di VAL) | 98.7 | 0.4 | 29.9 |
| **1.3 (dipakai)** | 97.3 | 0.4 | 28.1 |
| 1.4 | 87.6 | 0.3 | 23.8 |
| 1.5 | 72.5 | 0.2 | 19.0 |

Di TEST: tau 1.3 → 97.3 / 0.2 / 33.8; tau 1.25 → 98.7 / 0.3 / 36.1. Selisihnya kecil dan kompromi, jadi **1.3 tidak diubah**. Catatan jujur: nilai 1.3 awalnya dipilih dari median kelas yang dihitung memakai val+test, sehingga TEST sudah pernah "terlihat" untuk pemilihan awal; sapuan VAL di atas adalah pemeriksaan independen, bukan pemilihan ulang.

Pinch (R17-05, sintetis pada median `one`+jempol, 16:9, UNIT_ONLY; `scripts/nui-rd/pinch_ab.ts`):

| Uji | Baseline | Lab |
|---|---|---|
| Tahan jempol 0.4 / 0.5 / 0.6 span dari ujung (titik tinta dalam 2 dtk) | 34 / 34 / 34 | **0 / 0 / 0** |
| Celah saat ink pertama muncul, menutup 0.7 / 1.5 / 3 / 6 span/dtk | 0.63 / 0.60 / 0.50 / 0.40 | 0.28 / 0.20 / 0.20 / 0.05 |
| Jeda dari kontak ke ink (frame) | 0 | 0 |
| Titik tinta setelah celah > 0.5 saat membuka 0.7 / 1.5 / 3 / 6 | 25 / 13 / 7 / 4 | 12 / 6 / 3 / 2 |
| Titik tinta sentuhan tetap, smoothing | identik | identik |

Delay dan hysteresis: tidak ada penambahan jeda masuk pada pinch yang disengaja (0 frame). Pinch dekat-tapi-tidak-menyentuh tidak lagi menggambar. Efek pada webcam asli: **NOT_TESTED**.

## RD-04 · pilot classifier ringan OFFLINE (status: SELESAI, artefak ada, tidak dipasang)

- Fitur (56): 20 landmark × (x, y) setelah translasi ke pergelangan, skala jarak pergelangan→knuckle tengah (aspek 16:9 dikoreksi), rotasi sehingga jari tengah menghadap atas, dan cermin sehingga knuckle telunjuk selalu di kiri; jarak ujung ke pergelangan (5); sudut tekuk (5); jarak antar-ujung bersebelahan (4); jarak jempol-telunjuk (1); posisi lateral jempol (1). Kode: `scripts/nui-rd/rd_lib.ts` (`handFeatures`), sama untuk pelatihan dan inferensi.
- Normalisasi: mean/std dari TRAIN, tersimpan di artefak. Kelas diberi bobot akar-terbalik frekuensi. Adam, batch 512, ≤ 40 epoch, epoch terbaik dipilih dari macro-F1 VAL. Benih pelatihan 20260517.
- Hyperparameter (macro-F1 9-label di VAL): LR l2=1e-4 0.9730; LR l2=1e-3 0.9568; MLP[32] 0.9863; **MLP[64,32] l2=1e-4 0.9871 (dipilih, epoch 22)**; MLP[64,32] l2=1e-3 0.9852.
- Artefak (**tidak di Git**, lihat gerbang lisensi): `model_lr.json` 13,827 B sha256 `bf47cdc6cf988eff33928b9f83400a83d2e97977d11c7666ad850134711b4bb3` (513 parameter); `model_mlp.json` 127,134 B sha256 `de56248b0c476a9f560637462b03c4286543f6b34a6cd5c9fc6bb6e7a462a1ef` (56→64→32→9, 6,025 parameter).
- Paritas inferensi TypeScript vs Python pada 200 baris: selisih maks LR 2.64e-7, MLP 1.73e-7 (batas lulus 1e-4).
- Dependensi: hanya `numpy` untuk pelatihan dan TypeScript murni untuk inferensi. Tidak ada framework, GPU, atau model berat.
- Model card: dilatih pada landmark otomatis HaGRIDv2 (CC BY-SA 4.0 varian; teks lisensi PDF tidak terbaca di sesi ini). Tujuan: riset. **Tidak untuk dipakai di aplikasi siswa.** Tidak mengenali identitas. Keterbatasan: gambar statis, 16:9, tangan alami (`no_gesture`) hanya 1,858 baris latih, tidak ada kelas near-pinch, tidak ada data webcam target.

## RD-05 · A/B benchmark (status: DATASET SELESAI; WEBCAM/KLIP NOT_TESTED)

TEST, 50,607 baris, 3,707 subjek yang sama untuk keempat sistem. "False Hapus" = sistem membolehkan Hapus pada tangan yang bukan FIVE.

| Sistem | macro-F1 (7 label) [95%] | macro-F1 (9) | akurasi | FIVE P / R | **False Hapus** [95%] | Recall FIVE |
|---|---|---|---|---|---|---|
| baseline (game) | 0.448 [0.438, 0.458] | 0.406 | 0.501 | 0.483 / 0.463 | 5.43% [5.17, 5.73] | 46.3% |
| revisi (lab) | 0.782 [0.774, 0.790] | 0.666 | 0.683 | 0.841 / 0.973 | 2.01% [1.85, 2.21] | 97.3% |
| pilot LR | 0.976 [0.973, 0.978] | 0.971 | 0.974 | 0.955 / 0.996 | 0.51% [0.44, 0.58] | 99.6% |
| **pilot MLP** | **0.987 [0.985, 0.989]** | 0.987 | 0.990 | 0.997 / 0.997 | **0.04% [0.02, 0.06]** | 99.7% |

Selisih terhadap revisi (bootstrap subjek): MLP macro-F1(7) +0.198 sampai +0.213, false Hapus −2.17 sampai −1.80 poin. LR +0.187 sampai +0.200, −1.67 sampai −1.34 poin.

Hapus per kelas sumber (baseline | revisi | LR | MLP), hanya yang ≥ 0.5% di salah satu:
`four` 84.4 | 0.2 | 0.2 | 0.1 · `no_gesture` (n=607) 35.9 | 33.8 | 15.5 | **0.8** · `grabbing` 1.6 | **18.0** | 3.0 | 0.2 · `grip` 0.6 | 4.4 | 0.8 | 0 · `ok` 0 | 3.2 | 0.1 | 0 · `palm` 54.7 | 100 | 99.5 | 99.7 · `stop` 37.9 | 94.6 | 99.7 | 99.7.

Latensi (Node v22.23.4, Intel Xeon 2.30 GHz, 4 core, kontainer cloud; **bukan laptop siswa, bukan browser, bukan di bawah beban MediaPipe**), 10,000 sampel per baris:

| Langkah | p50 | p95 | p99 |
|---|---|---|---|
| heuristik baseline | 0.0014 ms | 0.0024 ms | 0.0038 ms |
| heuristik revisi | 0.0019 ms | 0.0028 ms | 0.0040 ms |
| fitur + LR | 0.0046 ms | 0.0057 ms | 0.0080 ms |
| fitur + MLP | 0.0109 ms | 0.0123 ms | 0.0268 ms |

### Keputusan menurut anggaran (`rd05_budget.json`)

| | (a) false Hapus ≤ revisi | (b) recall FIVE ≥ revisi − 2 poin | (c) macro-F1(7) ≥ revisi + 0.03 | (d) p95 ≤ 1 ms | Hasil |
|---|---|---|---|---|---|
| pilot LR | ya | ya | ya | ya | **PROMISING (DATASET saja)** |
| pilot MLP | ya | ya | ya | ya | **PROMISING (DATASET saja)** |

**Arti "PROMISING" di sini terbatas.** Itu berarti lolos anggaran pada gambar statis HaGRIDv2 yang sedistribusi dengan data latih. Itu **bukan** bukti untuk webcam target. Alasan untuk tidak percaya angka 0.987 begitu saja: kelas HaGRID dirancang mudah dibedakan, kondisi cahaya/kamera/jarak siswa berbeda, `no_gesture` hanya 607 baris uji, dan tidak ada kelas near-pinch.

### Tidak tercakup

| Item | Status | Alasan / langkah |
|---|---|---|
| Klip dan footage webcam target (false erase/pen-down, missed detection, reassignment) | **NOT_TESTED** | perlu rekaman Owner dengan perekam RD-02 (`R17_NUI_LABEL_SCHEMA.md`) lalu jalankan ulang `rd05_ab.ts` pada fitur hasil rekaman |
| Pinch dekat vs sentuh | **INSUFFICIENT_DATA** | tidak ada kelas HaGRID untuk itu |
| Evaluasi temporal swipe (TLT/TRT/P1F/P2F) | **BLOCKED** | landmark IPN HandS: Drive "Quota exceeded" (3 file, 2 percobaan). Perintah ulang di `R17_NUI_DATASET_FEASIBILITY.md` |
| Efek hysteresis/pose-stabil terhadap laju false Hapus nyata | **INSUFFICIENT_DATA** | butuh urutan, bukan gambar statis |
| Dampak lock (reassignment) | **NOT_TESTED** | lock tidak diubah; hanya komparator urutan yang diperbaiki |

## RD-06 · prototipe lab-only (opsional): **TIDAK DIMULAI**

Syarat tiket: pilot harus lolos RD-05 **termasuk footage webcam target**. Bagian webcam belum ada, jadi RD-06 tidak dimulai. Tidak ada switch A/B classifier di NUI Lab. Promosi ke gameplay: **STOP**, butuh review dan izin Owner terpisah dan keputusan mapping gestur yang belum dikunci.

## Reproduksi

```
# 1. ambil arsip anotasi HaGRIDv2 (sha256 di manifest), taruh di luar repo
python3 -I scripts/nui-rd/rd_extract.py <hagrid_annotations.zip> <data_dir>
./node_modules/.bin/vite-node scripts/nui-rd/rd_features.ts <data_dir>
./node_modules/.bin/vite-node scripts/nui-rd/rd03_heuristics.ts <data_dir> <data_dir>/rd03_results.json
python3 -I scripts/nui-rd/rd_train.py <data_dir> <model_dir>
./node_modules/.bin/vite-node scripts/nui-rd/rd05_ab.ts <data_dir> <model_dir> <data_dir>/rd05_results.json
./node_modules/.bin/vite-node scripts/nui-rd/pinch_ab.ts
```

Angka agregat dari eksekusi ini: `docs/nui-rd/results/` (tanpa baris landmark). Bila `model_*.json` dilatih ulang, checksum dapat berbeda karena urutan float numpy; paritas dan metrik tetap dapat dibandingkan.
