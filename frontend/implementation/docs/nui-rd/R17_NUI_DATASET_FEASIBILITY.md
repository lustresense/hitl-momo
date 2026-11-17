# R17 · RD-01 dataset feasibility (`dataset_manifest`)

Status per sumber: **DOWNLOADED** (unduhan nyata, checksum dihitung), **BLOCKED** (dicoba, gagal dengan alasan konkret), **METADATA_ONLY**.
Tidak ada dataset, gambar, video atau landmark mentah di Git. Hanya agregat (`docs/nui-rd/results/*.json`) dan skrip.

## Manifest

| Sumber | Versi / berkas | Ukuran | SHA-256 (hasil unduhan) | Lisensi | Status |
|---|---|---|---|---|---|
| **HaGRIDv2** annotations (landmark otomatis MediaPipe, `user_id`) | `hagrid_annotations.zip` (README HaGRIDv2, 121 entri) | 719,041,314 B | `ca27a177cc9f061e92d59f6a7d9b1b10fe2ee8289ab5f2068cde6ab197d2a286` | "variant of CC BY-SA 4.0" + dokumen lisensi terpisah `license/en_us.pdf` | **DOWNLOADED** (anotasi saja, tanpa gambar). Teks PDF lisensi **tidak terbaca** (HTTP 403 lewat proxy) |
| **IPN HandS** annotations (anotasi temporal, kelas, split) | `IPN_HandS_annotations.zip` | 82,274 B | `520dfbf3d52ecab6535d8841bba55e94d6b512596ed1cff4505d2c1345bcbaec` | CC BY 4.0 (README) | **DOWNLOADED**. Checksum README `4686a2eb…ec71` **tidak cocok** dengan berkas yang diunduh. Isi berkas valid (200 video, 15 kelas) tetapi integritas terhadap rilis resmi **tidak terbukti** |
| IPN HandS landmarks (GT, MPHands, MPHolistic) | tiga zip di Google Drive | tidak diketahui | README: `493bf536…`, `e511bb2b…`, `4746db8a…` | CC BY 4.0 | **BLOCKED**: "Google Drive – Quota exceeded" (HTML 2,040 B) pada 3 percobaan unduh langsung, diulang sekali di akhir sesi dengan hasil sama |
| IPN Hand (video 640x480) | halaman proyek | ratusan GB | tidak diunduh | lisensi halaman proyek | **METADATA_ONLY**. Tidak perlu: yang dibutuhkan hanya landmark/gerak, dan video bukan data yang boleh disimpan di sini |
| VERA-Hand (benchmark tracking) | abstrak/halaman | n/a | n/a | tidak diperiksa | **METADATA_ONLY**. Hanya relevan bila tracking MediaPipe sendiri diteliti, bukan di tiket ini |

Perintah ulang unduh IPN HandS landmarks (jalankan dari jaringan lain atau setelah kuota Drive pulih), lalu verifikasi dengan checksum README:

```
curl -L -o IPN_HandS_landmarks_GT.zip "https://drive.usercontent.google.com/download?id=<ID-dari-README>&export=download&confirm=t"
sha256sum IPN_HandS_landmarks_GT.zip   # harus 493bf53638d5b1477e28f05c41884f0cabdcb7b84f20d68f3d5d94e0b46fad4d
```

## IPN HandS: apa yang ada tanpa landmark

Format `temporal_annotations/<video>.txt`: `class_id, start_frame, end_frame`. 200 video (split resmi: 148 train, 52 test). Segmen per kelas:
NOG 2592 · P1F 1217 · P2F 1189 · C1F 204 · C2F 186 · TUP 201 · TDN 200 · **TLT 197** · **TRT 195** · OP2 194 · 2C1 199 · 2C2 215 · ZIN 232 · ZOT 208 · GRB 534.

Cocok untuk R17-03 (geser): TLT/TRT sebagai kandidat swipe, P1F/P2F sebagai pose satu/dua jari, NOG sebagai negatif. **Tidak bisa dipakai tanpa landmark**, dan videonya tidak diunduh. Evaluasi temporal swipe pada IPN karena itu **BLOCKED**.

## HaGRIDv2 → label PA (ditinjau manual dari lembar kelas)

| Kelas HaGRID | Label | Keputusan |
|---|---|---|
| `palm` | FIVE | included |
| `stop` | FIVE | **uncertain** (jempol sejajar telapak, empat jari rapat; dipakai sebagai FIVE, diuji terpisah) |
| `four` | FOUR | included (negatif keras untuk FIVE) |
| `three` | THREE | included (telunjuk, tengah, manis; jempol menutup kelingking) |
| `one` | ONE | included |
| `two_up`, `peace` | TWO | included |
| `fist` | FIST | included (pose inert) |
| `like` | THUMB_UP | included |
| `ok` | PINCH_LIKE | included, **bukan** pinch gambar: tiga jari lain terbuka |
| `no_gesture` | OTHER | included, hanya 1858 / 231 / 607 baris (train/val/test) |
| `three2`, `three3`, `thumb_index`, `point`, `call`, `grip`, `grabbing`, `rock`, `mute`, `dislike` | OTHER | **excluded** dari definisi pose target, dipakai sebagai kelas lawan |
| `*_inverted`, kelas lain di arsip | tidak dipakai | excluded |

**Kelas yang tidak kompatibel:** tidak ada kelas HaGRID untuk **PINCH-NEAR vs PINCH-TOUCH** (jempol hampir menyentuh vs menyentuh telunjuk). Karena itu R17-05 tidak bisa dilatih/diukur dari dataset publik: **INSUFFICIENT_DATA**. Itu satu-satunya jalur yang butuh rekaman lokal berizin (RD-02).

## Subjek dan pembagian

HaGRIDv2 memuat `user_id`. Skrip `scripts/nui-rd/rd_extract.py` mengambil sampel acak bertanda benih 17 (maks 6000/kelas train, 2500/kelas val dan test, maks 25 per subjek per kelas) lalu **memeriksa** tumpang-tindih subjek:

| Split | Baris | Subjek unik |
|---|---|---|
| train | 121,858 | 21,576 |
| val | 50,196 | 2,652 |
| test | 50,607 | 3,707 |
| tumpang-tindih train∩val / train∩test / val∩test | 0 / 0 / 0 | |

## Gerbang lisensi (RD-01 stop-condition)

- Landmark HaGRID adalah turunan CC BY-SA 4.0 **varian** dengan dokumen lisensi yang tidak bisa dibaca di sesi ini. Tiket melarang **menyebarkan weights bila lisensi belum jelas**. Karena itu **berkas weights (`model_*.json`) tidak dimasukkan ke Git**. Yang masuk Git: skrip pelatihan, checksum weights, metrik agregat, model card.
- Weights diserahkan ke Owner langsung di sesi ini (bukan dipublikasikan). Untuk memakai di luar riset: baca `license/en_us.pdf` dari mesin dengan akses GitHub, putuskan, baru distribusikan.
- Data yang direkam lewat RD-02 hanya boleh masuk pelatihan bila berkas memuat `consent: true` (divalidasi `validateRecord`).
