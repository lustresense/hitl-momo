# R22B — Bukti dan penalaran dari tes fisik Owner (S-970f4cb0, 20 Nov 2026)

Penulis: Claude (auditor, repo dibaca **read-only**). Dokumen ini dasar untuk `02_MANDAT_AGY_R22B.md`.

## 0. Ringkasan

Ada tiga masalah yang terlihat seperti satu karena muncul berbarengan. Penyebabnya berbeda:

| # | Gejala yang Owner rasakan | Penyebab yang terbukti dari data | Penanganan |
|---|---|---|---|
| A | Kepal (batu) saat undo/redo kebaca cubit, lalu muncul coretan | Aturan **folded-index pinch** di `bench/action-resolver.ts` (telunjuk menekuk + `pinchRatio ≤ 0.20` dianggap cubit). Asumsi di komentar kodenya, yaitu "kepal asli ≥ 0.24", **salah** untuk tangan Owner: frame kepal turun sampai 0.03. | Gate geometri G1′ saat onset (tanpa training), lalu head terlatih dari data berlabel benar |
| B | Cubit 3 jari (OK) vs cubit rapat vs 3 jari tanpa cubit belum dibedakan | Sistem hanya punya satu keadaan `PINCH`. Jari tengah, manis, dan kelingking sebenarnya sudah terbaca (`fingerStates`), hanya belum dipakai | Taksonomi komposisional (kontak jempol–telunjuk × status tiap jari) + preset mekanisme per level |
| C | Low light + backlight, tangan sering hilang | MediaPipe tidak menemukan telapak (bukan guard kita). Kehilangan menumpuk saat tangan berputar/menyamping, di tepi frame, dan di depan jendela. **Bukan** karena ruangan makin gelap: luma global saat hilang sama dengan saat terdeteksi | Instrumentasi + A/B kamera/confidence + replay offline + UX penataan cahaya. 100% tidak bisa dijanjikan; target terukur ada di §5 |

Masalah kecil lain yang juga terbukti:
- Banner `DATA TERTINGGAL` terlalu sering muncul di 14–15 fps dan ikut menghapus skeleton. Ini bukan penyebab goresan putus.
- Pill "Perintah: UNDO" nyangkut.
- `backlightCandidate` tidak pernah menyala, sedangkan `GLARE_CANDIDATE` menyala di ~99% frame.

## 1. Data

- Export `nui-lab-benchmark` v2: sesi **S-970f4cb0**, app 0.29.1-alpha, commit **1bb1a71**, branch `r22-nui-lab` (build yang live di DEV). Windows Chromium, 12 thread, 16 GB.
  - T001 Gesture: 819 frame, 56 dtk.
  - T002 Canvas: 1.685 frame, 114 dtk.
  - Engine r20-c4, preprocess RAW, `numHands` fixed-2, `runtimeSetOptionsCalls` 0.
  - Kamera melaporkan 1280×720 @30, tapi frame unik hanya ~14,5 fps (p10 13,9).
- Video layar 98,7 dtk (1294×960 @30).
  - **Sinkronisasi:** keberadaan skeleton oranye di panel kamera tiap frame video dikorelasikan dengan `hands>0` di data. Hasilnya `t_sesi = t_video + 87,85 dtk`, cocok 96% di 0–25 dtk pertama dan stabil antar jendela, dengan toleransi ±0,1 dtk.
  - Semua timestamp `v=` di bawah memakai waktu video.
- Pembanding: sesi lama **S-07ba0cde-T004** (R20, 0.27.0, perangkat lain), 19 stroke, undo via tombol.
- **Tidak ada ground truth.** Semua frame `truth = "UNLABELLED"`; `posePred` diturunkan dari aturan yang justru sedang diaudit.

## 2. Masalah A — kepal kebaca cubit

### 2.1 Kejadian (v=68,6–79,6, Owner mencoba undo)

Pengamatan:
- Owner bolak-balik kepal ↔ 1 jari.
- Di sela transisi, **13 frame** diklasifikasikan `pinch`. Di 13/13 frame jempol tidak terbuka dan tengah/manis/kelingking menekuk; telunjuk menekuk di 11/13. `pinchRatio` 0,03–0,34 (median 0,18). Di video pada v=69,4 dan v=76,6, tangan jelas berbentuk kepal (punggung tangan menghadap kamera); lihat `bukti_khusus_owner/01_*.jpg`.

Akibat:
- Stroke **17** (v=69,4, 3 titik) dan **18** (v=70,8, 2 titik) tergambar tanpa disengaja.
- Frame cubit palsu itu juga **memutus tahanan kepal**. FSM butuh kepal stabil ≥150 ms (`DEFAULT_FIST_ARM_MS`), jadi pesan yang muncul justru "Kepal dulu untuk mengaktifkan Undo/Redo". UNDO pertama baru jalan di v=72,7, kira-kira 4 dtk setelah percobaan pertama.
- Total ada **5 UNDO** (via `gesture-fist-one`), bukan 2. Dua yang pertama habis untuk menghapus coretan sampah 18 dan 17. Jadi cubit palsu merugikan dua kali: menambah sampah, lalu memakan jatah undo.

### 2.2 Akar di kode

`bench/action-resolver.ts`, `GeometricPinchSource.evaluate()`:
- `CANONICAL_FOLDED_PINCH_ONSET = 0.2` (hold 0.27) dipakai ketika telunjuk berstatus `curled`.
- Komentarnya mengklaim "genuine tight curled pinches like T004 … draw cleanly while real fists ≥ 0.24 stay FIST".

Klaim itu berasal dari aturan, bukan dari label. Data Owner membantahnya: kepal dilihat dari punggung tangan menghasilkan ujung jempol dan ujung telunjuk (yang tertutup jari lain, posisinya ditebak model) sangat berdekatan.

### 2.3 Bukti geometri

Fitur 2D dihitung dengan x × aspect; skala = |pergelangan(0) − MCP tengah(9)|. Nilai di tabel adalah median (p10–p90).

| Kelompok (label lemah) | n | `pinchRatio` | sudut PIP telunjuk (5-6-7) | ujung jempol–MCP telunjuk | jempol "open" |
|---|---|---|---|---|---|
| Cubit sungguhan (stroke ≥20 titik) | 435 | 0,14 (0,09–0,22) | **144° (120–164)** | **0,63 (0,40–0,85)** | 93% |
| Cubit palsu di jendela undo | 13 | 0,18 (0,05–0,22) | **16° (3–154)** | **0,20 (0,09–0,29)** | 0% |
| Kepal di jendela undo | 44 | 0,37 (0,25–0,45) | 14° (4–20) | 0,27 (0,17–0,32) | 0% |
| 1 jari di jendela undo | 110 | 0,95 | 178° | 0,12 | 4% |

`pinchRatio` memang tidak bisa membedakan cubit dari kepal. Pembeda yang kuat adalah sudut PIP telunjuk dan letak ujung jempol.

### 2.4 Gate onset G1′ (aturan, tanpa training, sadar varian)

```
Hanya untuk ONSET tinta (saat cubit akan MEMULAI goresan):
  jika ≥2 dari {tengah, manis, kelingking} 'extended'  → jalur PINCH_OK: kepal mustahil, tidak ada cek tambahan
  selain itu (jalur PINCH_CLOSED)                       → G1: sudutPIP(5,6,7) ≥ 60°
                                                          DAN ( thumb.open ATAU |ujungJempol(4) − MCPtelunjuk(5)| / skala ≥ 0,33 )
```

**Kenapa harus sadar varian:** pada cubit OK, telunjuk melengkung membentuk lingkaran. Di 2D, sudut PIP-nya bisa kecil (21–57° di stroke 13/14), sehingga G1 polos akan ikut memblokir cubit OK sungguhan. Kepal selalu punya tengah/manis/kelingking menekuk (44/44 + 13/13 frame), jadi jalur OK aman dilewatkan.

Hasil di fixture label lemah (`eval_fist_pinch_gate.py`):

| Kelompok | Aturan sekarang membuka onset | G1′ membuka onset |
|---|---|---|
| Cubit palsu (kepal/transisi), S-970 | **13/13** | **0/13** |
| Kepal / 1 jari / 5 jari (hapus) | 0 / 0 / 0 | 0 / 0 / 0 |
| Cubit rapat sungguhan, S-970 | 303/303 | 299/303 (98,7%) |
| Cubit OK sungguhan, S-970 | 103/103 | 103/103 (100%) |
| Cubit sungguhan, sesi lama T004 (perangkat lain) | 204/204 | 204/204 (100%) |

Per stroke, G1′ hanya memblokir **stroke 17 dan 18** (coretan palsu saat undo). 16 stroke lain tidak berubah.

**Masalah tambahan yang ditemukan saat mengecek cubit OK (v=54,4–60,4):**
- Cubit OK berkedip ke "telapak 5 jari" selama 1–2 frame. `pinchRatio` melompat 0,07 → 0,96 dalam 66 ms, terlalu cepat untuk gerakan tangan sungguhan; ini goyangan landmark di cahaya belakang.
- Akibatnya stroke 12 selesai lebih awal, stroke 13/14 hanya 2–3 titik, dan intent `ERASE` muncul 7 kali. Hapus tidak sampai jalan karena syarat stabil 160 ms.
- Perlu **debounce pelepasan ~150 ms dengan retro-trim**: titik selama masa debounce dibuang kalau pelepasan terkonfirmasi. Pasangannya adalah **konfirmasi onset dengan backfill**.
- Untuk level yang memakai cubit OK dan hapus 5 jari sekaligus, `FIVE` harus didefinisikan ketat: kelima jari tegak, `pinchRatio ≥ 0,55`, dan telunjuk lurus.

**Batas:** ambang ini dipasang dari **satu orang, dua sesi**, dengan label proksi. Ambang harus di-refit dan diuji pada data guided capture minimal 2 orang sebelum dibekukan.

### 2.5 Kenapa jangan "train langsung pakai data ini"

Label pose di export berasal dari aturan yang salah tadi (`labelSource = RULE_DERIVED`, `truth = UNLABELLED`). Model yang dilatih di atas label itu hanya akan belajar meniru bug. Data ini tetap berguna untuk tiga hal:
1. 996 frame **berlabel lemah**, sebagian dicek ke video: `s970_t004_handstate_weaklabels_v1.json`, berisi 13 hard negative, 4 transisi, 44 kepal, 110 satu jari, 186 lima jari, dan 639 cubit (rapat/OK/tak jelas).
2. Kalibrasi ambang G1.
3. Fixture replay protokol undo.

Data latih yang benar harus labelnya berasal dari **instruksi**, bukan dari aturan: mode *guided capture* (lihat mandat).

## 3. Masalah B — varian cubit

- Stroke 12–15 (v=50,8–66) digambar dengan **cubit OK** (tengah/manis/kelingking tegak `EEE`: 40/59 dan 62/91 frame). Stroke lain digambar dengan **cubit rapat** (`...`).
- Sekarang keduanya sama-sama `PINCH`, dan tidak ada keadaan "3 jari tanpa cubit".
- Kalau dilihat dari punggung tangan, cubit rapat dan kepal **nyaris identik**. Titik kontak jempol–telunjuk tertutup jari lain, dan landmark ujung jari hanya tebakan model.
  - Itu sebabnya Owner refleks mengangkat 3 jari supaya cubitnya kelihatan.
  - Batas fisik kamera RGB tunggal: untuk level yang memakai kepal (undo/redo) dan cubit rapat sekaligus, cubit rapat wajib lolos gate ketat. Cubit OK jauh lebih aman untuk anak.
- Varian bisa diturunkan dari status jari tengah/manis/kelingking, tapi perlu smoothing. Stroke 12 berkedip 6 kali antara `EEE` dan `...`.
- Taksonomi yang diusulkan (K4 v1.1, komposisional):
  - `contact` ∈ {TOUCH, NEAR, OPEN} (sudah ada di K4) + G1.
  - Status ekstensi I/M/R/P + jempol.
- Kelas turunan:

| Kelas | Kontak jempol–telunjuk | Jari tengah/manis/kelingking | Catatan |
|---|---|---|---|
| `PINCH_CLOSED` | TOUCH + G1 | ≥2 dari 3 menekuk | "pinch doang tanpa 3 jari" |
| `PINCH_OK` | TOUCH + G1 | ≥2 dari 3 tegak | "3 jari dengan pinch" |
| `THREE` | OPEN | 3 jari terkonfigurasi tegak, sisanya menekuk | "3 jari doang tanpa pinch"; varian `IMR`, `TIM`, `MRP` |
| `FIST`, `ONE`, `TWO`, `FIVE`, `NEAR_PINCH`, `OTHER` | — | — | sama dengan K4 v1.0 |

- `THREE_MRP` (tengah/manis/kelingking tegak, telunjuk ditekuk ke telapak, sering ditahan jempol) vs `PINCH_OK` adalah **pasangan paling rawan**:
  - Jempol yang menahan telunjuk juga memberi `pinchRatio` kecil.
  - Pembedanya postur telunjuk: melengkung ke depan membentuk lingkaran, atau menekuk ke telapak. Kandidat fitur: jarak ujung telunjuk ke pusat telapak, sudut PIP/DIP telunjuk, ada-tidaknya "lubang" lingkaran.
  - Data ini **tidak berisi** `THREE_MRP`, jadi ambangnya wajib dari guided capture.
  - Rekomendasi: jangan aktifkan `THREE_MRP` dan `PINCH_OK` di level yang sama, kecuali uji menunjukkan pemisahan ≥ 98%.
- **Asumsi yang perlu dikonfirmasi Owner:** "3 jari" default = telunjuk + tengah + manis (`IMR`). Guided capture tetap merekam `TIM` dan `MRP` juga, supaya preset level bisa memilih tanpa capture ulang.

## 4. Masalah C — low light / backlight

### 4.1 Angka

- **Jendela yang tercakup video** (80 dtk aktivitas): tangan tidak terdeteksi **13,9 dtk (17,4%)**, dalam **9 episode** berdurasi 0,55–2,1 dtk.
  - Di 8 dari 9 episode yang frame-nya dicek, tangan **terlihat jelas** di video (`bukti_khusus_owner/02_*.jpg`). Episode ke-9 (v=38,9, 1,0 dtk) tidak dicek.
  - Angka miss 30,1% di T002 tercemar 14,3 dtk sebelum video mulai (v<0), saat kemungkinan tangan memang di luar kamera. Itu tidak bisa diverifikasi, jadi tidak dipakai.
- T001 (Gesture, kebanyakan telapak menghadap kamera): miss jendela aktif 6,6%.

### 4.2 Yang terbukti

- **MediaPipe yang tidak menemukan tangan**, bukan guard kita:
  - Saat episode hilang, `mpMs` turun dari ~60 ms ke ~32 ms. Tahap landmark tidak jalan; hanya detektor telapak.
  - Alasan dari guard adalah `no-hand`, yang berarti output MediaPipe kosong.
  - `minHandDetectionConfidence` 0,6 / presence 0,45 / tracking 0,45 (`r20-hand.worker.ts:442–444`).
- **Kecerahan global tidak menjelaskan kehilangan:**
  - `lumaP50` saat hilang 0,377 vs saat terdeteksi 0,380.
  - `nearWhiteHandPct` tepat sebelum hilang (median 11,9) malah lebih rendah daripada saat terlacak (19,2).
  - Preprocessing global juga sudah kalah di bxr7 (RAW 60% > A4v2 40% > R22 35,6%). Jadi "terangkan gambarnya" bukan jawaban.
- **Yang berkorelasi:**
  - Pose sebelum hilang. Onset hilang per 100 frame: `thumb-up` 26,7, `none` 11,8, `open-palm` 5,3, `fist` 1,8, `pinch` 1,6, `one-finger` 0,6. Dua tertinggi adalah frame tangan sedang berputar/menyamping.
  - Tangan di dekat tepi frame (cx 0,16–0,20).
  - Tangan di depan jendela yang terbakar putih (v=34,3, 37,8, 41,1, 49,3, 56,3).
  - Frame kamera yang turun ke ~14,5 fps (eksposur panjang → blur saat bergerak).
  - Satu kejadian tangan dekat wajah (v=37,8).
- **Tag kondisi salah kalibrasi:**
  - `backlightCandidate` = false di **2.504/2.504** frame. Rumusnya (`centerLuma < 0,36` dan `mean − center ≥ 0,18`) tidak menangkap jendela di samping.
  - `GLARE_CANDIDATE` menyala di ~99% frame (`p95 ≥ 0,94`), jadi tidak informatif.
- **Kapabilitas eksposur webcam tidak terekam.** Export hanya menyimpan `exposureProbeSupported: true`; rentang `exposureCompensation`/`brightness` tidak ada.

### 4.3 Soal "harusnya 100%"

Tidak ada pelacak tangan berbasis webcam RGB yang bisa menjamin 100% dalam kondisi ini:
- tangan gelap di depan jendela yang terbakar putih,
- diputar menyamping,
- ditangkap kamera 14 fps yang blur.

Pada frame seperti itu, informasi tepi dan tekstur jari memang hilang dari gambarnya. Yang bisa dijanjikan adalah **angka yang diukur** dan **perilaku yang benar saat hilang**:

| Kondisi (kursi, protokol, dan kamera yang sama) | Baseline sekarang | Target uji R22B |
|---|---|---|
| Lampu depan mati, jendela di belakang | 82,6% waktu terdeteksi; 8 hilang >1 dtk | ≥ 90%; tidak ada hilang > 1 dtk saat telapak menghadap kamera |
| Lampu depan menyala / tidak membelakangi jendela | belum diukur | ≥ 97% |
| Stroke putus karena hilang ≤ 360 ms | sudah ditahan (grace) | tetap |
| Coretan palsu dari kepal | 2 stroke dalam 12 dtk undo | 0 di 20 siklus undo + 20 siklus redo |

Kalau target pertama tidak tercapai setelah A/B, itu dicatat sebagai keterbatasan. Mitigasinya adalah UX penataan cahaya (dan, untuk studi pengguna, pengaturan kursi/lampu yang dikontrol).

## 5. Cek silang laporan Gemini

| Klaim Gemini | Status | Bukti |
|---|---|---|
| Kepal→1 jari tersabotase "Cubit (seret)" dan membuat coretan | **Benar** | 13 frame pinch palsu; stroke 17 & 18; arming kepal terputus |
| Undo cuma 2 kali | **Salah** | 5 event `UNDO`; 2 yang pertama menghapus coretan sampah |
| `DATA TERTINGGAL` terlalu agresif di 11–16 Hz | **Benar untuk UI** | Usia frame saat render > 150 ms di 23,3% interval hasil. Banner menyala dan `clearOverlay()` menghapus skeleton, sehingga terlihat seperti tracking hilang |
| `DATA TERTINGGAL` memutus goresan (00:42–00:45) | **Salah** | Jalur aksi hanya menolak 7/1.685 frame karena stale. 18 stroke berakhir karena `pinch-release` (14) dan `detector-miss-timeout` (4), **0** karena stale. Stroke 11 putus di v=45,3 karena detector miss |
| "Dibuang 0" bertentangan dengan banner stale | **Salah tafsir** | `Dibuang` menghitung record benchmark yang gagal disimpan, bukan frame stale |
| Tangan hilang padahal terlihat, backlight jendela | **Benar sebagian** | Benar tangan terlihat dan MediaPipe kosong. Tapi pemicu utamanya putaran tangan, tepi frame, dan posisi di depan jendela, bukan kegelapan global |
| Pill "Perintah: UNDO" nyangkut | **Benar** | `canvasUndoRedoFsmLabel()` (`NuiLabPage.tsx:382`) menampilkan `lastCommand` selama masih ada, tanpa batas waktu dan tanpa reset saat tangan hilang |

Yang tidak disebut Gemini:
- akar masalah di kode (aturan folded-index),
- kepal palsu yang ikut memutus arming,
- bukti `mpMs` turun saat hilang,
- tag backlight/glare yang rusak kalibrasinya,
- **redo tidak pernah dicoba** di rekaman ini (setiap kepal selalu diikuti 1 jari), jadi `redo = 0` bukan bukti bug.

## 6. Batas analisis ini

- Satu orang. Label proksi (protokol, stroke panjang, aksi hapus yang diterima) plus pengecekan video secara acak. Toleransi sinkronisasi video ±0,1 dtk.
- Perekaman layar kemungkinan menambah beban CPU: `mpMs` p50 ~60 ms; jalur aksi stale naik di jendela undo.
- Video hanya menampilkan sebagian panel kamera dengan overlay, jadi tidak bisa dipakai sebagai input detektor untuk replay. Untuk itu perlu rekaman mentah (lihat mandat §Owner).
