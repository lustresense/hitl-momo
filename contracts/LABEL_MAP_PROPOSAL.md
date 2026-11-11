# Usulan: pemetaan label model ke benda level dan provenance submission

Status: USULAN (belum diputuskan). Pemilik keputusan: Dias (backend, `BE/`) dan Can (produk). Dokumen ini tidak mengubah `contracts/openapi.json`.

## 1. Masalah

- Model partner (`config.py:8-13`) memakai 20 kelas QuickDraw bahasa Inggris: apple, banana, bicycle, bird, book, car, cat, cloud, dog, fish, flower, house, moon, star, sun, tree, airplane, sailboat, chair, mountain.
- Benda level (`frontend/implementation/src/domain/levels.ts`, vocabulary dan behaviorMap) memakai kata Indonesia: papan, balok, tangga, batu, duri, tali, ember.
- Tanpa pemetaan, irisan keduanya kosong. Setiap label model menjadi `unresolved` di gameplay.
- Klien sekarang memetakan 20 kelas ke nama Indonesia untuk Top-3 (`frontend/implementation/src/prediction/label-map.ts`). Untuk benda level, `gameLabel` diisi `null` untuk semua kelas. Alasannya: tidak ada padanan yang jujur. Pemetaan yang dipaksakan (mis. mountain menjadi batu) akan membuat data dan gameplay keliru.

## 2. Tabel pemetaan (20 kelas)

Urutan dan confidence yang dikirim model tidak diubah. Kolom `modelLabel` selalu disimpan di klien.

| modelLabel (model) | displayName (siswa) | gameLabel (benda level) |
|---|---|---|
| apple | Apel | null |
| banana | Pisang | null |
| bicycle | Sepeda | null |
| bird | Burung | null |
| book | Buku | null |
| car | Mobil | null |
| cat | Kucing | null |
| cloud | Awan | null |
| dog | Anjing | null |
| fish | Ikan | null |
| flower | Bunga | null |
| house | Rumah | null |
| moon | Bulan | null |
| star | Bintang | null |
| sun | Matahari | null |
| tree | Pohon | null |
| airplane | Pesawat | null |
| sailboat | Perahu layar | null |
| chair | Kursi | null |
| mountain | Gunung | null |

Sumber: `frontend/implementation/src/prediction/label-map.ts`, diuji oleh `frontend/implementation/tests/prediction/label-map.test.ts`.

## 3. Submission: label dan provenance

Kondisi saat ini (`frontend/implementation/src/api/submission-adapter.ts:57`):

- Hanya prediksi dengan `provenance.source === "model"` yang dikirim ke `POST /api/submissions`. Demo (mock) dan prediksi tanpa provenance tidak dikirim.
- Field `candidates[].label` yang dikirim adalah `displayName` (nama Indonesia yang dilihat siswa), bukan `modelLabel`. `final_label` juga memakai label tampilan.
- `contracts/openapi.json` (`Candidate`) hanya punya `label` dan `confidence`. Tidak ada field provenance atau mode. Backend menyimpan `candidates_json` apa adanya (`BE/classroom.py:173-176`).

Usulan untuk Dias:

1. Putuskan label mana yang disimpan untuk riset: `modelLabel` (kelas asli model, stabil) atau `displayName` (yang dilihat siswa). Untuk integritas data, `modelLabel` lebih aman karena nama tampilan bisa berubah.
2. Bila keduanya perlu, tambahkan field opsional `model_label` di `Candidate`, dan pastikan backend tidak membuangnya diam-diam. Perlu dicek dulu apakah schema backend mengabaikan field tak dikenal.
3. Tambahkan field opsional `prediction_source` (nilai: `"model"`) pada `SubmissionBody`. Dengan begitu data riset dapat dibedakan dari data demo, meski klien sekarang tidak pernah mengirim demo.
4. Keputusan Owner D-20261027-03 menyatakan prediksi asli dan mock harus bisa dibedakan dalam data. Usulan ini memenuhinya di sisi klien dan sisi kontrak.

## 4. Benda level yang tidak dikenal model

Ketujuh benda ini tidak punya kelas di model 20 kelas:

- papan (L1, L2, L3)
- balok (L1, L2)
- tangga (L1, L2, L3)
- batu (L1)
- duri (L2)
- tali (L3)
- ember (L3)

Akibatnya, dengan model 20 kelas, setiap keputusan Top-3 dari model asli menjadi `unresolved` di gameplay.

## 5. Keputusan yang dibutuhkan

Pilih salah satu (lihat juga `frontend/implementation/src/prediction/label-map.ts`):

- (a) Latih ulang model dengan kelas yang sama dengan kosakata level (papan, balok, tangga, batu, duri, tali, ember), atau kelas tambahan yang memetakan ke kosakata itu.
- (b) Tambahkan tabel pemetaan di backend: model mengirim kelas asli, backend mengembalikan `gameLabel` yang jujur, dan kontrak `contracts/openapi.json` mencantumkannya.
- (c) Pemetaan di klien (sudah ada, tetapi `gameLabel` masih `null` semua). Pilihan ini hanya sementara. Setiap padanan baru harus dicatat di tabel bagian 2.

Sampai keputusan diambil, demo (mock) tetap memakai kosakata level dan tidak masuk data kelas.

## 6. Perilaku sementara di kode

- Partner: `NEXT_PUBLIC_PREDICTION_OOV_POLICY=reject` membuat kelas di luar 20 kelas gagal dengan `out-of-vocabulary` (`partner-http-provider.ts`, `toTop3`). Default `allow` menampilkan label apa adanya dengan `gameLabel: null`.
- Retry: satu kali untuk gangguan jaringan, 5xx, dan 429. Timeout, 4xx, dan body rusak tidak di-retry.
- Token sesi siswa hanya dikirim ke `/api/*` pada origin backend kelas (`src/config/env.ts`, `sessionTokenAllowedFor`). Endpoint `/predict` tidak pernah menerima token.
- Hal yang perlu diubah di luar file milik L3 (untuk lead): `src/app/state-machine.ts:262` memanggil `resolveBehavior(decision.finalLabel, level)`. Sekarang `finalLabel` adalah `displayName`. Agar aman terhadap pemetaan masa depan, resolusi sebaiknya memakai `gameLabel` (null berarti `unresolved`).

## 7. Yang belum terbukti

- Model asli di runtime tidak diuji. Berkas `weights/*.keras` tidak dibuka. Daftar 20 kelas diambil dari `config.py`, bukan dari model yang berjalan.
- `contracts/openapi.json` tidak punya skema respons untuk `/predict` (`"schema": {}`). Validasi respons ada di klien (`src/prediction/validation.ts`) dan belum dicocokkan dengan backend.
- Fixture `contracts/fixtures/submission-request.json` memakai label `kucing`, `anjing`, `bebek`. Label itu tidak ada di 20 kelas model maupun di kosakata level. Fixture tidak diubah dalam dokumen ini.
