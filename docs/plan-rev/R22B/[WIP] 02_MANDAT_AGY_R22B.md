# AGY — R22B: bedakan kepal vs cubit, varian cubit per level, low-light terukur

**Status:** dikirim hanya oleh Owner ke Argon.

Mandat ini **menambah** R22 (paket `R22_FULL_SCOPE_MALAM_20261119` + addendum 06). Aturan A1–A9 dan kontrak K1–K10 tetap berlaku, kecuali kontrak yang dinaikkan versinya di §3.

**Wajib dibaca dulu:**
- `01_BUKTI_DAN_PENALARAN_S970.md` (bukti dan angka).
- Jalankan `python3 -I eval_fist_pinch_gate.py s970_t004_handstate_weaklabels_v1.json`.

Angka di mandat ini berasal dari dua sumber itu.

## 1. Aturan kerja (tidak bisa ditawar)

**Basis dan branch (DIGANTI OLEH KEPUTUSAN OWNER 2026-11-20 WIB)**
- **Keputusan Owner (menggantikan aturan branch kode sebelumnya):** Tidak ada branch kode (`r22-nui-lab` dan `r22b-handstate` di remote dihapus atas izin eksplisit Owner). Satu-satunya branch kerja dan publikasi di GitHub adalah **`research-can`** (mengikuti `research-can/AGENTS.md` sepenuhnya).
- Kode aplikasi dipublikasikan sebagai **kandidat patch** terhadap base **`main@745bb6d840793dcab8558f65aef6bfac58807e79`** (`745bb6d`):
  - Kandidat R22: `r22/candidates/r22-nui-lab/r22_main-745bb6d_to_1bb1a71.patch` (`git write-tree` = `bed64432519e12fa42d927d5e5883df98df3a36c`) + `APPLY.md`.
  - Kandidat R22B (kumulatif untuk DEV): `r22b/candidates/r22b-handstate/r22b_main-745bb6d_to_8f74db4.patch` (`git write-tree` = `16806cb23382a0655c040b3398903feeeaf0fe7b`) + `r22b_incremental_1bb1a71_to_8f74db4.patch` (untuk review) + `APPLY.md`.
- Untuk Wave 2 dan seterusnya: kerja dilakukan di worktree lokal detached dari `main@745bb6d` ditambah patch kandidat terakhir (commit lokal boleh, **push branch selain `research-can` dilarang**). Hasil baru dipublikasikan sebagai patch versi baru (`_v2.patch`, dst.) di folder kandidat yang sama tanpa menimpa patch lama.

**Deploy**
- AGY **tidak deploy**. Tidak boleh membuat tunnel, preview URL, domain, atau container publik.
- Setelah QA PASS, laporkan SHA ke Owner. Owner yang menyuruh Ujang.

**Scope**
- `frontend/implementation/src/components/nui-lab/**`
- `frontend/implementation/tests/nui-lab/**`
- `frontend/implementation/tests/fixtures/**`
- Skrip/riset di branch `research-can` pada folder `r22b/`.
- Kalau harus menyentuh `src/input/**` atau gameplay: berhenti dan laporkan (A1).
- Baseline gameplay `tests/input/{hand-stroke-surface,two-hand-surface,eraser-controls}` = **39/48 pass, 9 fail**, identik dengan `main@745bb6d`. Tidak boleh memburuk.

**Gate tes**
- Pakai **Node 22**. Node 20 gagal di `crypto.subtle.digest` (jsdom).
- `PASS` hanya dari log perintah nyata.

**Larangan**
- Membaca `contexts/can/research/.context-notforagent/`.
- Commit gambar, video, frame kamera mentah, atau wajah.
- Klaim "100%" atau "akurasi" tanpa ground truth.
- **Melatih model dengan label `RULE_DERIVED` sebagai kebenaran.** Label pose di export lama berasal dari aturan yang sedang diperbaiki.

**Kontrak**
- Perubahan kontrak = naik versi + disetujui Argon + dicatat di `R22_HANDOFF_STATE.md` (tambah bagian **R22B**).
- A2 tetap: satu `PinchSource` dan satu `PoseSource` per route. Model terlatih hanya menggantikan aturan **di belakang antarmuka yang sama** setelah lolos aturan keputusan di B6.

**Limit model**
- Ikuti A9: catat pemetaan `tingkat → model nyata`.
- Tugas T-STRONG tidak boleh turun diam-diam; tandai `DOWNGRADED_MODEL` kalau terpaksa.

## 2. Bukti yang menentukan prioritas (ringkas)

1. **Kepal kebaca cubit (P0).**
   - Di jendela undo S-970 (v=68,6–79,6), 13 frame kepal/transisi diklasifikasikan `pinch`: 11 lewat jalur *folded-index* (`CANONICAL_FOLDED_PINCH_ONSET = 0.2` di `bench/action-resolver.ts`), 2 lewat ambang hold. Akibatnya 2 coretan palsu (stroke 17, 18).
   - Arming kepal ikut terputus. 2 dari 5 UNDO terbuang untuk menghapus coretan palsu itu.
   - Asumsi di kode bahwa "kepal ≥ 0.24" terbantah: kepal turun sampai 0.03.
2. **Pembeda yang terbukti** (median): sudut PIP telunjuk 144° pada cubit vs 16° pada cubit palsu; jarak ujung jempol–MCP telunjuk 0,63 vs 0,20.
   - Gate **G1′** (§B1) memblokir 13/13 cubit palsu.
   - G1′ tetap membuka 98,7% cubit rapat dan 100% cubit OK di S-970, serta 100% di sesi T004 (perangkat lain).
   - Pada cubit OK, G1 polos gagal karena telunjuk melengkung (sudut PIP 21–57°). Itu sebabnya gate harus sadar varian.
3. **Varian cubit sudah terlihat di data.**
   - Stroke 12–15 dibuat dengan cubit OK (tengah/manis/kelingking `extended`); sisanya dengan cubit rapat.
   - Cubit OK berkedip ke "5 jari": `pinchRatio` 0,07 → 0,96 dalam 66 ms. Akibatnya stroke terpotong dan muncul intent `ERASE` 7×.
4. **Low light / backlight.**
   - Di jendela yang tercakup video, tangan hilang 17,4% waktu (9 episode, 0,55–2,1 dtk). Di 8 episode yang dicek, tangan terlihat di video.
   - MediaPipe kosong (`mpMs` turun 60 → 32 ms, alasan guard `no-hand`).
   - Kecerahan global sama saat hilang vs terdeteksi (0,377 vs 0,380). Pemicunya putaran/menyamping, tepi frame, dan posisi di depan jendela.
   - `backlightCandidate` 0/2.504 frame; `GLARE_CANDIDATE` ~99%. Keduanya salah kalibrasi.
   - Kapabilitas eksposur webcam tidak diekspor, hanya boolean.
5. **UI.**
   - Usia frame saat render > 150 ms di 23,3% interval (kamera 14,5 fps). Banner stale menyala dan `clearOverlay()` menghapus skeleton, sehingga terlihat seperti tracking hilang.
   - Jalur aksi hanya menolak 7/1.685 frame; **0** stroke putus karena stale.
   - Pill "Perintah: UNDO" nyangkut (`canvasUndoRedoFsmLabel`, `NuiLabPage.tsx:382`).
6. **Redo belum pernah dicoba** di rekaman ini. Uji redo wajib ada di protokol.

**Input yang diberikan Owner** (numerik saja, aman di-commit sebagai fixture):
- `s970_t004_handstate_weaklabels_v1.json`: 996 frame berlabel lemah, termasuk 13 hard negative.
- `s970-t002-landmark-replay-v1.json`: replay seluruh T002 S-970, format sama dengan `t004-real-landmarks.json`.
- `eval_fist_pinch_gate.py`.

## 3. Kontrak yang diterbitkan Argon sebelum worker menulis kode (DRAFT boleh)

| # | Kontrak | Perubahan | Produsen → Konsumen |
|---|---|---|---|
| K3.1 | `PinchReading` | Tambah:<br>• `variant: "CLOSED"\|"OK"\|null`<br>• `gate: { path: "OK"\|"CLOSED"; passed: boolean; reasons: string[]; indexPipDeg; thumbTipToIndexMcp; thumbOpen; mrpExtendedCount }`<br>• `onset: "NONE"\|"PENDING"\|"CONFIRMED"` | W-CANVAS → W-UI, W-BENCH, W-QA |
| K4 v1.1 | Taksonomi | Additif dan komposisional:<br>• `contact` ∈ {TOUCH, NEAR, OPEN} × status `thumb/index/middle/ring/pinky` ∈ {EXT, CURL, BETWEEN}<br>• Kelas turunan: `FIST, ONE, TWO, THREE{IMR\|TIM\|MRP}, FOUR, FIVE, PINCH_CLOSED, PINCH_OK, NEAR_PINCH, OTHER`<br>• Kelas v1.0 tetap valid (tabel pemetaan wajib)<br>• Tambah field `labelProvenance` (mis. `guided-capture-v1`, `weak-s970-v1`); enum `labelSource` tidak berubah | W-DATA (disetujui Argon) → semua |
| K5 | Encoder | **Tetap 82D.** Kandidat `handstate-extra-12d-v1` (94D) hanya dipakai kalau menang di B6, dan kalau dipakai = versi baru | W-DATA → W-TEMPORAL |
| K7 | Registry | Tambah dataset `weak-s970-t004-v1` (**eval/hard-negative saja**), `guided-capture-p1-v1`, `guided-capture-p2-v1`. Split dibekukan + hash **sebelum** angka model dilaporkan | W-DATA → W-TEMPORAL, W-QA |
| K8 v2.1 | Export | Field baru di B3 | W-BENCH → W-UI, W-QA, analyzer |
| **K11** | **Preset mekanisme Canvas (per level)** | Skema di B1.7 | W-CANVAS → W-UI, W-QA, gameplay (nanti) |

Papan dependensi wajib ada di setiap laporan progres:

| kontrak | produsen | konsumen | status | yang dipakai konsumen sementara |
|---|---|---|---|---|

## 4. Workstream (semua dikerjakan; urutan di §5)

### B1 — W-CANVAS (**Neon**) — onset/release cubit, FSM, preset level

1. **Gate onset G1′** di `GeometricPinchSource`. Gate ini syarat AND tambahan saat onset; ambang `pinchRatio` yang ada tidak berubah sampai di-refit di B6.

   ```
   mrpExtendedCount ≥ 2                         → path OK:     lolos (kepal mustahil)
   selain itu                                    → path CLOSED: indexPipDeg(5,6,7) ≥ 60
                                                     DAN (thumbOpen ATAU thumbTipToIndexMcp ≥ 0,33)
   ```

   - Geometri 2D: x × aspect; skala = |0−9|.
   - Konstanta di config: `pipMinDeg`, `thumbIdxMcpMin`, `mrpExtendedMin`.
   - Komentar "real fists ≥ 0.24" di kode diganti dengan rujukan bukti S-970.
2. **Konfirmasi onset + backfill.**
   - Onset butuh G1′ lolos selama **2 frame berurutan**.
   - Kalau dalam 400 ms terakhir pose stabil = FIST/ONE/TWO, atau `undoRedoFsmState ≠ NEUTRAL`, onset butuh **≥ 300 ms** (berbasis waktu, bukan jumlah frame).
   - Saat terkonfirmasi, titik sejak frame pertama ikut dimasukkan (backfill). Tidak boleh ada tinta yang hilang.
3. **Debounce pelepasan + retro-trim.**
   - Pelepasan (rasio > hold atau pose berganti) harus bertahan **≥ 150 ms**. Kalau cubit kembali sebelum itu, stroke yang sama berlanjut (event `PINCH_RELEASE_BRIDGED`).
   - Kalau pelepasan terkonfirmasi, titik selama masa debounce dibuang.
   - Ini terpisah dari `HOLD_GRACE`, yang mengurus frame tanpa tangan.
4. **Toleransi tahan kepal.** Satu frame non-FIST ≤ 100 ms yang bukan ONE/TWO/FIVE tidak me-reset `fistHoldStartMs`. Frame cubit yang ditolak G1′ dihitung kompatibel dengan FIST.
5. **`FIVE` ketat** untuk preset yang memakai `PINCH_OK` dan hapus sekaligus: kelima jari EXT, `pinchRatio ≥ 0,55`, sudut PIP telunjuk ≥ 160°. Syarat stabil 160 ms tetap.
6. **`lastCommand`** di snapshot diberi `atMs`. Analyzer menghapusnya setelah 1.500 ms atau saat tangan hilang ≥ 300 ms.
7. **K11 `CanvasMechanismPreset`:**

   ```ts
   export interface CanvasMechanismPreset {
     id: string;                       // kebab-case
     label: string;                    // label UI Bahasa Indonesia
     draw: Array<"PINCH_CLOSED" | "PINCH_OK">;   // [] = menggambar mati
     three: null | { variant: "IMR" | "TIM" | "MRP"; action: "THREE_ACTION" };
     undoRedo: "FIST_ONE_TWO" | "OFF";
     erase: "FIVE" | "OFF";
     experimental?: boolean;
   }
   ```

   Preset bawaan Lab:

   | Preset | Isi | Catatan |
   |---|---|---|
   | `default-any-pinch` | draw [CLOSED, OK], undo/redo, hapus | Default |
   | `ok-pinch-only` | draw [OK] | Kandidat untuk anak |
   | `closed-pinch-only` | draw [CLOSED] | |
   | `three-imr-action` | + THREE IMR → `THREE_ACTION` | |
   | `three-mrp-vs-ok` | draw [OK], THREE MRP | `experimental: true` sampai pemisahan ≥ 98% |

   Aturan:
   - Kelas di luar preset tidak pernah menghasilkan aksi.
   - Kalau preset berisi pasangan rawan (FIST+PINCH_CLOSED, THREE_MRP+PINCH_OK, PINCH_OK+FIVE), gate ketat wajib aktif dan metrik pasangannya wajib dilaporkan.
8. **Kebijakan reacquire (flag, default tidak berubah).** `reacquirePinchPolicy: "require-release" | "allow-after-confirm"`.
   - Nilai kedua mengizinkan stroke baru tanpa lepas cubit, dengan syarat:
     - tangan kembali ≤ 1,5 dtk,
     - jaraknya ≤ 12% diagonal kanvas dari kursor terakhir,
     - G1′ lolos ≥ 3 frame.
   - Diuji A/B di protokol Owner: fragmen/menit dan coretan tak sengaja saat tangan masuk.
9. **Telemetri:**
   - Per frame: `pinchGate{…}` (K3.1) dan `handState{contact, variant, fingers, threeVariant}`.
   - Event: `PINCH_ONSET_BLOCKED{reason}`, `PINCH_ONSET_CONFIRMED{waitedMs, backfilledPoints}`, `PINCH_RELEASE_BRIDGED{gapMs}`, `THREE_ACTION`.
10. **Tes** (vitest, Node 22, fixture numerik):
    - Gate: 13/13 hard negative ditolak; 0 onset di 44 FIST + 110 ONE + 186 FIVE.
    - Gate: ≥ 98% cubit rapat dan 100% cubit OK (S-970), serta ≥ 99% T004, lolos.
    - Replay `s970-t002-landmark-replay-v1.json` lewat `LabAnalyzer`:
      - **0 `STROKE_START`** di `undoWindowMs`;
      - `UNDO` ≥ 5, masing-masing didahului `ARMED_FIST`;
      - stroke panjang di luar jendela undo (2, 6, 9, 10, 11, 12, 15, 16) tetap tercipta.
    - Replay T004 lama tetap PASS. Kalau ekspektasi berubah, laporkan baris tes + buktinya. **Jangan** sekadar memperbarui snapshot.
    - Unit test untuk debounce + retro-trim, backfill, toleransi kepal, dan setiap preset K11.

### B2 — W-UI (**Hydrogen**) — perbaikan UI + mode rekam berpandu

1. **Banner stale berbasis kedatangan hasil.**
   - Stale tampilan = `now − lastResultArrivalMs > max(250, 2,5 × p50 interval hasil)`. Ini menggantikan "usia capture saat render > 150 ms".
   - Overlay **tidak pernah dihapus** karena stale tampilan; cukup diredupkan.
   - Teks "Kamera tersendat" hanya muncul kalau tidak ada hasil > 500 ms.
   - Aturan C15 di jalur aksi (usia hasil > 150 ms → tidak mengubah StrokeStore) **tetap**.
2. **Pill perintah** tampil 1,5 dtk lalu kembali ke status FSM; reset saat tangan hilang ≥ 300 ms.
3. **HUD komposisional:** "Kontak: RAPAT/DEKAT/LEPAS · Varian: OK/RAPAT · Jari: I M R P". Kalau onset ditolak, tampilkan alasannya ("Ditahan: mirip kepal").
4. **Pemilih preset K11** di route Canvas; default `default-any-pinch`; bisa di-set via `?preset=`.
5. **Mode rekam berpandu `?capture=1`** sesuai protokol §7:
   - Prompt besar + hitung mundur, langkah berurutan, tombol ulangi langkah.
   - Menulis `truth = <kelas>`, `labelSource = "DATASET_GT"`, `labelProvenance = "guided-capture-v1"`, `captureStep`, `variation` (palm/back/side/moving/near-face/edge), `lighting` (dipilih Owner: `A-lampu-depan-mati` / `B-lampu-depan-nyala`), `subjectCode` (`P1`, `P2`; tanpa nama).
   - 700 ms pertama tiap prompt dan 300 ms terakhir ditandai `truthMasked = true`.
   - Drill transisi ditandai per segmen: `TRANSITION_<dari>_<ke>`.
6. **Rekam video mentah khusus pengembang `?rawrec=1`.**
   - `MediaRecorder` pada `MediaStream` yang sama, WebM, unduh lokal, tidak diunggah.
   - Default mati, dengan persetujuan terpisah: "Rekam video kamera mentah (khusus pengembang, lokal, tidak diunggah)".
   - Tidak pernah tampil untuk siswa.
   - Nama file memuat `sessionId`/`trialId` dan waktu mulai, supaya bisa disinkronkan dengan `truth`.
   - Encoding menambah beban CPU. Ukur overheadnya (`mpMs` dengan dan tanpa `rawrec`), dan **jangan** aktifkan `rawrec` saat uji A/B performa.
7. **Kartu tips cahaya** (non-blocking) saat aturan backlight B7 menyala > 3 dtk: "Ada cahaya terang di belakang tangan — hadap ke jendela atau nyalakan lampu di depan".
8. **Saat tangan hilang > 600 ms di Canvas:** kursor bayangan di posisi terakhir + teks "Tangan tidak terlihat — hadapkan telapak ke kamera".

### B3 — W-BENCH (**Hydrogen**) — export v2.1 + analyzer

**Trial meta:**
- `CameraExposureCapabilities` lengkap + nilai sekarang. Sekarang hanya `exposureProbeSupported`.
- Confidence MediaPipe yang dipakai, `presetId`, meta mode capture/rawrec.

**Per frame:**
- `mpRawHandCount` (output MediaPipe sebelum guard) dan `mpHandednessScores[]`
- `pinchGate{…}`, `handState{…}`
- `clippedPct` (luma ≥ 0,96), `handRoiLumaP50`, `lastRoiLumaP50` (frame hilang, bbox terakhir ×1,5)
- `truth`, `truthMasked`, `labelProvenance`

**Analyzer** (`analyze_r22b.py`, atau perbaiki `analyze_nui_bench.py`):
- Pilih sesi via `--session`. Bug lama: selalu memakai `sessions[0]`.
- Miss jendela aktif berbasis **waktu**.
- Episode hilang > 500 ms / > 1 dtk, lengkap dengan pose terakhir, posisi, `clippedPct`, `lastRoiLumaP50`.
- Onset diblokir per alasan; cubit palsu dari kepal; sukses undo/redo per percobaan (dari langkah protokol).
- Akurasi varian dan kelas vs `truth`.

### B4 — W-RUNTIME (**Neon**)

1. **Parameter URL tersembunyi** `?mdc=&mpc=&mtc=` (rentang 0,2–0,9).
   - Dipasang **hanya saat landmarker dibuat**. Tetap 0 `setOptions` saat runtime.
   - Dicatat di trial meta.
   - Default tetap 0,6/0,45/0,45 sampai A/B membuktikan lain.
2. **K2 diperluas:** `mpRawHandCount`, skor handedness per tangan.
   - API JS tidak mengekspos skor presence; jangan diada-adakan.
3. **Ukur `mpMs` p50/p95** di setelan default vs rendah, pada mesin yang sama.

### B5 — W-DATA (**Neon**) — dataset dari label yang benar

1. Terbitkan **K4 v1.1** + tabel pemetaan v1.0 ↔ v1.1.
2. **Builder** dari export guided capture:
   - Fitur dari 21 landmark mentah lewat `extractR19Features` (82D), plus kandidat 12D.
   - Frame `truthMasked` dibuang.
   - Statis disubsampel ≤ 5 Hz per segmen. Sekuens penuh dipertahankan untuk temporal.
3. **Split dibekukan + hash:**

   | Split | Isi |
   |---|---|
   | `train` | P1, lighting A+B, semua variasi kecuali satu |
   | `val` | P1, variasi yang ditahan |
   | `test-person` | P2 |
   | `test-hardneg` | `weak-s970-t004-v1` |
   | `test-replay` | Replay T002 |

   Kalau P2 tidak ada:
   - tulis `PERSON_HELD_OUT = NOT_AVAILABLE`;
   - pakai sesi P1 di hari/jam lain sebagai `test-person`, dan tulis itu dengan jelas.
4. **Dataset publik** hanya boleh untuk pretraining:
   - definisi kelasnya diverifikasi dari dataset card;
   - lisensi dicatat;
   - pemetaan ke K4 v1.1 ditulis.
   Tanpa itu, jangan dipakai.

### B6 — W-TEMPORAL / heads (**Neon**) — training + keputusan

**Baseline:**
- **B0** = aturan lama.
- **B1** = aturan G1′ (dari B1).

**Kandidat:**
- **M1:** MLP statis, K5 82D → 64 → 32 → 10 kelas (`FIST, ONE, TWO, THREE, FOUR, FIVE, PINCH_CLOSED, PINCH_OK, NEAR_PINCH, OTHER`).
- **M1x:** sama, dengan 94D.
- **M2:** temporal `r22-temporal-146d-v1`, W=5 kausal, untuk niat onset cubit (onset sungguhan vs transisi) dari drill transisi.

**Augmentasi:**
- Statis: mirror x (tangan kiri/kanan), rotasi ±25°, skala ±15%, jitter landmark σ 0,004.
- Temporal: drop frame 10%, resample 12–20 fps.

**Metrik di `test-person`, `test-hardneg`, `test-replay`:**
- P/R/F1 per kelas dan matriks konfusi. Fokus pasangan FIST↔PINCH_CLOSED, PINCH_OK↔THREE_MRP, PINCH_OK↔FIVE, NEAR↔PINCH.
- Onset palsu per 100 siklus transisi; latensi onset.
- Latensi CPU di TS pada kelas mesin Owner (p95 ≤ 2 ms M1, ≤ 4 ms M2); ukuran model.

**Aturan keputusan (A2)** — kandidat menggantikan B1 di belakang `PinchSource`/`PoseSource` **hanya kalau semua terpenuhi:**
- onset palsu dari kepal ≤ B1 dan ≤ 1 per 100 siklus;
- recall cubit (CLOSED dan OK) ≥ B1 − 1 poin;
- akurasi varian ≥ 95% per frame dan ≥ 99% setelah mayoritas 300 ms;
- konfusi THREE↔PINCH_OK ≤ 2% (untuk preset yang memakainya).

Kalau tidak terpenuhi: `MODEL_NOT_ADOPTED` + angka, dan B1 tetap dipakai.

**Ekspor:** K6 + model card (data, hash split, metrik, jumlah subjek, keterbatasan).

### B7 — W-ROBUST (**Hydrogen**) — low light/backlight

1. **Kalibrasi ulang tag** (diagnostik saja, tidak pernah meng-gate aksi):
   - `backlightCandidate = clippedPct ≥ 8% DAN (handRoiLumaP50 ≤ 0,35 ATAU lastRoiLumaP50 ≤ 0,35)`
   - `GLARE_CANDIDATE = nearWhiteHandPct ≥ 25%`
   - Validasi: S-970 harus mayoritas `true`; sesi lampu depan menyala mayoritas `false`.
2. **Panel kamera pengembang `?camdev=1`:**
   - Tampilkan `getCapabilities()`.
   - Kontrol `exposureMode`, `exposureCompensation`, `brightness`, `contrast` (hanya yang didukung), lewat `applyConstraints` dengan try/catch.
   - Event `CAMERA_SETTING_CHANGED{before, after}`; tombol reset.
3. **Harness replay offline** (`research-can`, `r22b/`):
   - Input: WebM `?rawrec=1` milik Owner. **Tidak masuk git.** Lokasi penyimpanan dicatat di handoff; hapus setelah analisis.
   - Mesin: tasks-vision 0.10.14, VIDEO, CPU, 1280×720.
   - Grid:

     | Parameter | Nilai |
     |---|---|
     | `mdc` | {0,6, 0,5, 0,4} |
     | `mpc`/`mtc` | {0,45, 0,3} |
     | ROI-rescue | {off; on = saat hilang, crop bbox terakhir ×2, gamma/CLAHE **lokal di ROI saja**, landmarker IMAGE mode di ROI ≤ 1 dtk} |
     | center-crop | {off, 0,8} |

   - Ground truth: segmen `truth` dari capture (tangan ada / NO_HAND).
   - Preprocessing global sudah kalah di bxr7; jangan diulang sebagai kandidat default.
4. **Prototipe ROI-rescue online** di balik `?roirescue=1`, hanya kalau replay menunjukkan recall naik ≥ 5 poin tanpa kenaikan FP.
5. **Laporan `r22b_lowlight_ab.json`**, per kondisi:
   - rasio waktu tangan terdeteksi;
   - episode hilang > 500 ms dan > 1 dtk;
   - latensi reacquire p50/p95;
   - FP/menit di adegan kosong;
   - `uniqueCaptureFps`, `mpMs` p50/p95.

### B8 — W-QA (**Hydrogen**, sebisa mungkin model berbeda dari pembuat kode)

1. Node 22:
   - suite NUI + tes baru PASS;
   - baseline gameplay tetap 39/48 dengan 9 kegagalan yang sama;
   - 0 `setOptions` runtime.
2. `next build` dengan `NEXT_PUBLIC_GIT_COMMIT`, `NEXT_PUBLIC_GIT_BRANCH`, `NEXT_PUBLIC_APP_VERSION` di-set.
   - `/nui-lab` render tanpa hydration error.
   - Label versi menunjukkan `r22b`.
3. Fault injection:
   - throttle tab → banner stale hanya setelah > 500 ms tanpa hasil;
   - skeleton tidak hilang selama hasil masih datang.
4. Perbarui `R22_HANDOFF_STATE.md` (bagian R22B) dan kirim laporan (§8).

## 5. Urutan dan dependensi

**Jalur kritis:**

```
K3.1 + K4 v1.1 + K11 (DRAFT, Argon)
  → B1 (1–6, 9, 10) ∥ B2 (1, 2, 5, 6) ∥ B3 ∥ B4 ∥ B7 (1, 2)
  → B8 QA → SHA ke Owner → Owner minta Ujang deploy DEV
  → Owner: protokol §7 (rekam berpandu + A/B + rawrec)
  → B5 → B6 (keputusan) ∥ B7 (3–5) ∥ B1 (7, 8) + B2 (3, 4, 7, 8)
  → B8 QA → DEV → retest Owner
```

| Gelombang | Isi | Target |
|---|---|---|
| 1 | Perbaikan tanpa training + instrumen + mode rekam | Hari ini, sebelum malam |
| 2 | Dataset, training, keputusan model, replay low-light, preset level | Besok |
| 3 | Retest Owner; merge ke `main` | Lusa, **hanya** dengan izin eksplisit Owner, eksekusi lewat Ujang |

Jangan menunggu training untuk mengirim Gelombang 1. Perbaikan G1′ sendiri sudah menghilangkan coretan palsu di data yang ada.

## 6. Acceptance (diuji Owner live di DEV, kursi dan kamera yang sama)

| ID | Uji | Lulus |
|---|---|---|
| U1 | 20× kepal→1 jari, 20× kepal→2 jari | 0 `STROKE_START`; ≥ 19/20 UNDO dan ≥ 19/20 REDO; median kepal→perintah ≤ 1,0 dtk |
| U2 | 10 goresan cubit rapat + 10 cubit OK (3 dtk) | 0 putus selama tangan terlacak; median latensi mulai stroke ≤ 200 ms |
| U3 | Preset `ok-pinch-only` | Cubit rapat 0/10 menggambar; cubit OK 10/10 menggambar |
| U4 | Preset `three-imr-action` | THREE 10/10 memicu aksi, 0 menggambar |
| U5 | 10 goresan OK dengan lingkaran sengaja digoyang | 0 hapus terpicu; stroke tidak terpotong oleh kedip < 150 ms |
| U6 | A/B low-light (§7) | Lampu depan mati: target ≥ 90% waktu terdeteksi, tidak ada hilang > 1 dtk saat telapak menghadap kamera. Lampu menyala: target ≥ 97%. **FAIL boleh dilaporkan** asal angkanya ada |
| U7 | UI | Banner stale tidak muncul selama hasil datang; pill reset; tips cahaya muncul di kondisi A |
| U8 | Regresi | Suite NUI PASS (Node 22); gameplay 39/48 tetap; 0 `setOptions` runtime |

## 7. Protokol Owner (mode `?capture=1` wajib mengikuti urutan ini)

**Rekam berpandu P1 (Owner).** Ulangi untuk kondisi **A** (lampu depan mati, jendela di belakang, seperti S-970) dan **B** (lampu depan menyala).

- **Kelas**, tiap kelas 6 dtk × 6 variasi:
  - `FIST`, `PINCH_CLOSED`, `PINCH_OK`
  - `THREE_IMR`, `THREE_TIM`, `THREE_MRP`
  - `ONE`, `TWO`, `FIVE`
  - `NEAR_PINCH` (jempol–telunjuk ±1–2 cm)
  - `OTHER` (bebas: jempol, metal, telepon)
  - `NO_HAND`
- **Variasi:**
  1. telapak menghadap kamera
  2. punggung tangan
  3. menyamping 45°
  4. bergerak pelan kiri–kanan
  5. dekat wajah
  6. dekat tepi frame
- **Drill transisi** (segmen berlabel):

  | Transisi | Ulangan |
  |---|---|
  | FIST→ONE | 10× |
  | FIST→TWO | 10× |
  | ONE→FIST | 5× |
  | OPEN→PINCH_CLOSED→OPEN | 10× |
  | PINCH_CLOSED↔PINCH_OK | 10× |
  | FIST→PINCH_CLOSED (sengaja) | 10× |
  | PINCH_OK↔FIVE (goyang) | 5× |

- **Putaran pendek tangan kiri:** FIST, PINCH_CLOSED, PINCH_OK, THREE_IMR, ONE, TWO, FIVE × variasi 1–3.
- Durasi: ±10 menit per kondisi, total ±23 menit.
- `?rawrec=1` aktif saat kondisi A.

**P2 (orang kedua, bila ada; dewasa, dengan izin):** kondisi B + drill transisi, ±10 menit. Hanya data numerik yang disimpan.

**A/B di kondisi A** (kursi sama, urutan ABAB, masing-masing 2 menit protokol menggambar + undo/redo):
1. `?mdc=0.6` (default) vs `?mdc=0.5&mpc=0.35&mtc=0.35`.
2. Eksposur otomatis vs `exposureCompensation` +1 (kalau didukung, via `?camdev=1`).
3. 30 dtk adegan tanpa tangan untuk FP.
4. `reacquirePinchPolicy` require-release vs allow-after-confirm.

## 8. Format laporan

1. Pemetaan model (A9): `tingkat → model nyata → platform`, beserta setiap pergantian karena limit.
2. Per workstream:
   - SHA commit;
   - file yang diubah;
   - perintah tes + hasil (jumlah PASS/FAIL);
   - metrik beserta sumbernya (file + `sessionId`);
   - daftar `NOT_TESTED`.
3. Papan dependensi (§3) dan status U1–U8. Uji yang butuh Owner ditulis `NOT_TESTED (menunggu Owner)`, bukan PASS.
4. Keputusan model B6 beserta tabel angkanya (termasuk kalau `MODEL_NOT_ADOPTED`).
5. Tidak ada angka tanpa sumber, dan tidak ada klaim di luar data.
