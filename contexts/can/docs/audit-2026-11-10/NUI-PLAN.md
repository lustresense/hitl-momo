# NUI-PLAN — arsitektur NUI yang ada sekarang, kamus gestur, parameter, dan uji kamera

**Tanggal:** 11 November 2026
**Repo:** `frontend/implementation/` pada branch `claude-monorepo`, HEAD `43e4cc3`
**Status:** dokumen keadaan kode, bukan bukti bahwa kamera bekerja. Semua klaim perilaku di sini berasal dari kode dan unit test sintetis. Uji dengan webcam fisik belum dilakukan (lihat bagian 7).
**Dasar:** kode pada HEAD; `PANDUAN-NUI-2026-11-10.md`; `REVISI-NUI-2026-11-10.md`; `NUI-AUDIT.md` (snapshot `1b880fa`, sebagian sudah usang, dikoreksi di sini); `BIGPROMPT-2026-11-10.md`.
**Hasil test:** lihat `NUI-RESULTS.md` di folder yang sama.

Path kode di bawah relatif ke `frontend/implementation/`.

---

## 1. Ringkasan

1. Pipeline sekarang: satu aliran kamera (`src/camera/shared-stream.ts`) dibaca oleh empat pembaca tangan. Setiap pembaca memanggil `HandLandmarker.detectForVideo` sinkron di `requestAnimationFrame`, di main thread, tanpa worker. Pembaca yang aktif tergantung layar.
2. Klasifikasi pose ada di `src/input/hand-gesture.ts`. Penghitung jari (`countExtendedFingers`, 0..5) sudah ada dan sudah masuk `useHandGesture` sebagai `pose` dan `fingerCount`.
3. Gesture router `src/input/gesture-mode.ts` (`actionFor(mode, pose)`) sudah dipakai oleh layar-layar utama: penempatan, gameplay, Top-3, stiker, gagal, daftar bab. Belum semua jalur memakainya (lihat bagian 3.3).
4. Tiga level saja. Tidak ada Level 4 di `src` (dicek dengan grep "Pembuktian", "stage-4", "stage: 4": nihil).
5. ONNX Runtime, CLAHE, screen fill-light, dan RTMPose tidak ada di dependensi, di `src`, maupun di `public` (dicek ulang pada HEAD ini). Status: tidak dipasang (lihat bagian 5).
6. Uji yang bisa dilakukan di sandbox hanya unit test dengan landmark sintetis dan fake timer. Semua perilaku kamera fisik berstatus NOT TESTED.

---

## 2. Arsitektur yang ada sekarang

```text
getUserMedia (satu stream, src/camera/shared-stream.ts)
  |
  +-- WaveTracker          cover, setelah "Nyalakan Kamera"; numHands 1      src/camera/wave-tracker.ts
  +-- HandDrawingDriver    gambar (mode kamera); numHands 2                  src/input/mediapipe-input.ts
  +-- GameplayHandDriver   penempatan dan gameplay; numHands 1               src/input/gameplay-hand-driver.ts
  +-- thumb-tracker        ring konfirmasi (ThumbConfirm, PinchRing, dwell); numHands 1, ref-count
                                                                              src/camera/thumb-tracker.ts
        |
        v  klasifikasi (pure)
  hand-gesture.ts        classifyHandPose, countExtendedFingers, isThumbUp, StableVote
  wave-tracker.ts        detectWave, waveProgress (sapuan pergelangan x)
  gameplay-gesture.ts    sudut telunjuk -> zona kemudi; pinch dengan histeresis
        |
        v  router
  gesture-mode.ts        MODE_* -> actionFor(mode, pose) -> GestureAction
        |
        v  UI
  GestureRing (ring generik, tahan untuk konfirmasi), ThumbConfirm, PinchRing, DwellButton, WaveRing
```

**Pemanasan model.** `src/camera/landmarker-warmup.ts` memuat HandLandmarker lebih awal (`warmHandLandmarker`, dipanggil dari `GlobalCamera.tsx:590` saat cover) dan menjalankan satu inferensi pada frame kosong 96 px. Instance hangat diserahkan ke satu pembaca (`takeHandLandmarker`). Pembaca yang meminta saat pemanasan berjalan menunggu pemuatan yang sama. Status (`loading`, `warming`, `ready`, `failed`, dengan label delegate GPU atau CPU) bisa dilanggani UI.

**Pemilihan delegate.** `src/camera/hand-landmarker.ts`: coba GPU dulu; bila gagal, satu percobaan CPU dan label "CPU (cadangan)". Model `public/models/hand_landmarker.task` (7.819.105 B, sha256 `fbc2a300…cde1`), paket `@mediapipe/tasks-vision` 0.10.14, wasm di `public/mediapipe/wasm/`.

**Invariant yang diverifikasi dari kode:**
- satu `detectForVideo` sinkron per pembaca; tidak ada antrean frame;
- pembaca dilewati bila `video.currentTime` belum berubah atau tab tersembunyi;
- timestamp memakai `performance.now()`, bukan timestamp frame kamera;
- stall kamera: 500 ms (gambar, `CAMERA_STALL_MS` di `mediapipe-input.ts:300`), 300 ms (gameplay, `gameplay-hand-driver.ts:70`);
- error: wave dan thumb toleran 3 error berturut-turut (`MAX_CONSECUTIVE_DETECT_FAILURES`); gameplay dan gambar berhenti pada error pertama;
- `release()` menutup landmarker dan membatalkan rAF; `wave-tracker.ts` melepas segera setelah lambaian terdeteksi.

**Pembaca per layar (kondisi HEAD ini):**

| Layar | Pembaca | Konfirmasi tangan | Catatan |
|---|---|---|---|
| Cover | WaveTracker | cincin lambaian (progres sapuan, `waveProgress`) | Tidak ada tombol tangan lain |
| Penggaris | thumb-tracker | cubit + geser penggaris (`StudentRulerSelector.tsx`); ThumbConfirm 2000 ms setelah angka menetap (`RULER_SETTLE_MS` 600) | Jalur tangan sudah ada |
| Kartu tutorial 1 | thumb-tracker | `useHandGesture(live)` di `TutorialBrochure.tsx:68`; cubit menjangkar, Thinman mengikuti gerak tangan dan berhenti di bendera (`:102-114`); `TutorialThumb` 1000 atau 2000 ms | Pembacaan 10 detik: `CARD_READ_MS` 10000 (`tutorial-card-gate.ts:12`) |
| Kartu tutorial 3 | thumb-tracker, kanvas latihan = `DrawingSurface` asli | cubit, kepal, dua jari, telapak | Gesture sama dengan layar gambar |
| Daftar bab | thumb-tracker | 1, 2, 3 jari (`MODE_LEVEL_SELECT`), ring 1500 ms (`BAB_RING_HOLD_MS`) | Dwell tetap untuk fallback |
| Intro level | thumb-tracker | ThumbConfirm 1000 ms, "Aku mengerti" (`LevelIntro.tsx:261`) | Jempol hanya setelah bicara Momo selesai (sesuai Owner) |
| Gambar (mode kamera) | HandDrawingDriver | jempol selesai (ThumbConfirm 2000 ms, `DrawingActions.tsx:72`); idle 10 detik memicu pertanyaan Momo (`IDLE_PROMPT_MS` 10000, `canvas-focus.ts:8`) | Kuas, hapus, undo, redo lewat `HandStrokePipeline` |
| Gambar (mode pointer) | thumb-tracker (dibuka oleh dwell) | ThumbConfirm membuka tracker sendiri | Jalur ini belum diuji di kamera |
| Top-3 | thumb-tracker | 1/2/3 jari pilih kandidat; telapak terbuka "Bukan ini"; cubit "Gambar ulang"; ring `TOP3_HOLD_MS` 1500 | Tools kanvas mati di mode ini |
| Stiker | thumb-tracker | jempol "Lempar" dan telapak "Gambar lagi", ring `STAMP_HOLD_MS` 2000 | |
| Penempatan | GameplayHandDriver | cubit tahan "Geser objek" (1500), "Taruh di sini" jempol (2000), telapak "Gambar lagi" (2000) | Konfirmasi lewat ring |
| Gameplay (kamera) | GameplayHandDriver | kemudi sudut telunjuk; cubit "Geser objek" (1500); telapak "Putar" (1500) | Lihat 3.3 soal rotasi |
| Gagal | thumb-tracker | 1 jari "Coba lagi", 2 jari "Geser objek", 3 jari "Gambar lagi" (`FAIL_HOLD_MS` 1500) | |
| Sukses | thumb-tracker | ThumbConfirm 1000 ms (`SuccessPopup.tsx:70`) | Layar tamat memakai ThumbConfirm dan dwell (belum diperiksa ulang pada HEAD ini) |

Catatan koreksi terhadap `NUI-AUDIT.md`: pada snapshot itu penggaris, kartu 1 sampai 3, dan penempatan belum punya jalur tangan. Pada HEAD ini semua sudah memakai tangan. `CameraIntro.tsx` masih ada di `src/components/onboarding/` tetapi tidak diimpor oleh layar mana pun. Bila nanti dipasang, ia membuat kamera dan WaveTracker kedua. Sebaiknya dihapus.

---

## 3. Kamus gestur

### 3.1 Definisi pose (`src/input/hand-gesture.ts`, `classifyHandPose`)

Prioritas: jempol naik, cubit, kepal, dua jari, satu jari, tiga jari, telapak (terbelah atau terbuka). Satu pose per frame. Jari "lurus" berarti ujung lebih jauh dari pergelangan daripada sendi PIP (rasio 1,1). Ibu jari dihitung lurus bila ujungnya lebih jauh dari pangkal telunjuk dibanding ruas IP (rasio 1,3, `THUMB_EXTENDED_RATIO`).

| Pose | Definisi singkat |
|---|---|
| `thumb-up` | ujung jempol di atas pangkalnya (minLift 0,45 span); empat jari tertekuk |
| `pinch` | jarak jempol-telunjuk < 0,42 span; bila telunjuk tertekuk, < 0,15 (keluar: 0,55 / 0,20 bila sudah ditahan) |
| `fist` | empat jari tertekuk, jempol tidak naik lebih dari 0,3 span |
| `two-fingers` | telunjuk atau jari tengah lurus; cincin dan kelingking tidak lurus |
| `one-finger` | hanya telunjuk lurus; jempol tidak lurus |
| `three-fingers` | telunjuk, tengah, dan cincin lurus; kelingking tertekuk; jempol tidak lurus |
| `split-palm` | semua jari tidak tertekuk; celah tengah-cincin > 0,25 span dan > 1,8 kali celah lain |
| `open-palm` | semua jari lurus, bila bukan split |
| `none` | selain itu |

`countExtendedFingers` memakai aturan yang sama (jari lurus + jempol), sehingga angka jari dan pose tidak berbeda.

### 3.2 Peta router per mode (`src/input/gesture-mode.ts`, `MAPS`)

| Mode | Pose -> aksi | Dipakai layar? |
|---|---|---|
| `MODE_CANVAS_DRAWING` | pinch -> draw; fist -> erase; two-fingers -> undo; split-palm dan open-palm -> redo | Tidak lewat `actionFor`. Gambar memakai `drawingCommandFor` (`hand-gesture.ts:311`), tabel kedua yang sama isinya |
| `MODE_CANVAS_PREDICT_TRIGGER` | thumb-up -> request-prediction | Tidak. Jempol selesai memakai ThumbConfirm |
| `MODE_CANVAS_STAMP_READY` | thumb-up -> throw; open-palm -> redraw | Ya (`StickerStamp.tsx`, `PredictingScreen.tsx`) |
| `MODE_GAMEPLAY_PLACEMENT` | thumb-up -> place; open-palm -> redraw; pinch -> grab | Ya (`placement-gesture.ts`, `PlacementControls.tsx`) |
| `MODE_GAMEPLAY_EXPLORATION_CAM` | pinch -> grab; open-palm -> rotate; one-finger -> steer | Ya untuk grab dan rotate (`ExplorationRings.tsx`). Steer tidak dibaca dari pose, melainkan dari sudut (lihat 3.4) |
| `MODE_TOP3_PANEL` | one/two/three-fingers -> choose-1/2/3; open-palm -> not-this; pinch -> redraw | Ya (`Top3Panel.tsx`, `DecisionPanel.tsx`) |
| `MODE_TOP3_ALTERNATIVES` | one/two/three-fingers -> choose-1/2/3 | Ya (`DecisionPanel.tsx:40`) |
| `MODE_DIALOG_ACK` | thumb-up -> ack | Tidak. Dialog memakai ThumbConfirm |
| `MODE_TUTORIAL` | thumb-up -> ack; pinch, fist, two-fingers, split/open-palm | Tidak. Tutorial memakai ThumbConfirm, PinchRing, dan DrawingSurface |
| `MODE_COVER_WAVE` | (kosong; lambaian adalah gerak, bukan pose) | Tidak ada pemakai |
| `MODE_LEVEL_SELECT` | one/two/three-fingers -> level-1/2/3 | Ya (`LevelRibbonBookmark.tsx:314`) |
| `MODE_FAIL` | one-finger -> retry; two-fingers -> move-object; three-fingers -> redraw | Ya (`FailOverlay.tsx:26`, `PredictingScreen.tsx:29`) |

### 3.3 Temuan dari pemeriksaan kode (perlu keputusan atau tindak lanjut)

1. **Rotasi tidak sesuai mandat.** Telapak terbuka diam yang ditahan 1500 ms memutar objek (`ExplorationRings`, `ROTATE_HOLD_MS`). Mandat Owner (Lampiran 17) meminta gerak memutar lima jari. `BIGPROMPT-2026-11-10.md` baris 177 juga melarang menyamakan telapak diam dengan rotasi. Tidak ada deteksi gerak memutar di `src` (grep rotat/putar/twist/spin di `src/input`, `src/game`, `src/components/game`: tidak ada). Status: **TIDAK SESUAI**, perlu keputusan produk.
2. **Bentuk telapak untuk redo belum final.** Owner menulis telapak terbuka (`BIGPROMPT` baris 149; komentar `hand-gesture.ts:316`). PRD R12 mengusulkan telapak terbelah. Kode menerima keduanya sebagai redo. Risiko: telapak terbuka biasa bisa terbaca sebagai telapak terbelah atau sebaliknya, dan keduanya dekat dengan "Mundur" (dua jari). Perlu uji kamera (bagian 6, butir 6).
3. **Router belum tunggal.** Lima mode (`MODE_CANVAS_DRAWING`, `MODE_CANVAS_PREDICT_TRIGGER`, `MODE_DIALOG_ACK`, `MODE_TUTORIAL`, `MODE_COVER_WAVE`) tidak punya pemakai di layar. Gambar dan tutorial memakai tabel sendiri. Akibatnya perubahan pose harus diubah di dua tempat. Usulan: arahkan `drawingCommandFor` ke `actionFor(MODE_CANVAS_DRAWING, ...)`. Hasil uji tidak berubah, hanya sumber kebenarannya.
4. **Kemudi memakai sudut, bukan pose.** `one-finger -> steer` di router tidak dikonsumsi. Kemudi dihitung di `gameplay-gesture.ts` (`steerFromAngle`) dan ditampilkan di `SteerDial.tsx`.
5. **Komentar usang.** `hand-gesture.ts:145-146` menulis "open palm used for the wave" (lambaian memakai sapuan pergelangan). `arbiter.ts:7` menulis "NOT wired into the UI yet", padahal `useGameplayInput.ts` memakai `InputArbiter`.
6. **Lambaian dan jumlah sampel.** `WINDOW_MS` 1300 ms dan `WAVE_MIN_SAMPLES` 6 berarti butuh sekitar 4,6 frame per detik agar ambang bisa terpenuhi. Kamera redup pada sekolah bisa jatuh di bawah itu (perkiraan dari konstanta, belum diukur).
7. **React.** `REVISI-NUI` menyebut React 19. Paket terpasang React 18.3.1 (`package.json` `^18.3.1`, lock 18.3.1). Dokumen itu perlu dikoreksi; kode tidak berubah.

### 3.4 Kemudi sudut telunjuk (`src/input/gameplay-gesture.ts`)

Sudut dihitung dari pangkal telunjuk (landmark 5) ke ujung (landmark 8), dengan x dibalik agar sesuai pratinjau cermin. 0 derajat = kanan, 90 = atas.

| Zona | Sudut | Input |
|---|---|---|
| jalan kanan | < 30 derajat | kanan |
| jalan kiri | > 150 derajat | kiri |
| lompat | 75 sampai 105 | lompat |
| lompat kanan | 45 sampai < 75 | lompat + kanan |
| lompat kiri | > 105 sampai 135 | lompat + kiri |
| berhenti | selain itu | tidak ada |

Histeresis 5 derajat. Pinch tidak lagi melompat: pinch memegang objek (`InputArbiter`). Keterangan di file: "a first guess, not a tested calibration".

---

## 4. Parameter, nilai, dan asalnya

Asal: **Owner** = kutipan atau keputusan langsung dari Owner (BIGPROMPT, REVISI). **Dokumen** = angka dari PANDUAN, REVISI, atau catatan lead, bukan kutipan Owner. **Kode** = nilai yang ditetapkan developer, tanpa bukti pengukuran.

| Parameter | Nilai | Lokasi | Asal | Catatan |
|---|---|---|---|---|
| Baca kartu sebelum jempol | 10 detik | `tutorial-card-gate.ts:12` | Owner | Jangan dipersingkat; tidak auto-tutup |
| Idle canvas, pertanyaan Momo | 10 detik | `canvas-focus.ts:8` | Owner | Tidak memicu prediksi |
| Jumlah level | 3 | `domain/levels.ts` | Owner | Tidak ada Level 4 |
| Penggaris default | 1 | `StudentRulerSelector.tsx:106` | Owner (REVISI §8) | |
| Konfirmasi penggaris setelah menetap | 600 ms | `RULER_SETTLE_MS` | Kode | Owner minta "setelah digeser dan settle" |
| Jempol selesai gambar | 2000 ms | `DrawingActions.tsx:72` | Dokumen (PRD, REVISI §21) | Owner tidak menyebut angka |
| Jempol "Aku mengerti" intro | 1000 ms | `LevelIntro.tsx:261` | Kode | |
| Top-3 pilih kandidat | 1500 ms | `Top3Panel.tsx:20` | Kode | PRD menyebut 2 detik untuk Terima; kode 1500 ms. Belum jelas mana yang dipakai |
| Stiker Lempar / Gambar lagi | 2000 ms | `StickerStamp.tsx:21` | Dokumen (REVISI §21.B) | |
| Penempatan: pegang / taruh / gambar ulang | 1500 / 2000 / 2000 ms | `placement-gesture.ts:11-13` | Kode | |
| Penempatan: lepas sebelum jatuh | 150 ms | `GRAB_DROP_MS` | Kode | Sentakan tangan tidak melepas objek |
| Putar objek | 1500 ms | `ROTATE_HOLD_MS` | Kode | Lihat 3.3 butir 1 |
| Gagal: tiga aksi | 1500 ms | `FAIL_HOLD_MS` | Kode | |
| Lambaian: sampel minimum | 6 | `wave-tracker.ts:29` | Kode (REVISI: "lebih responsif") | Dulu 8 |
| Lambaian: rentang minimum | 0,16 | `wave-tracker.ts:30` | Kode | Dulu 0,22 |
| Lambaian: kembali ke awal | < 0,18 | `wave-tracker.ts:31` | Kode | |
| Lambaian: ayunan | 2 ayunan, masing-masing 0,05 | `wave-tracker.ts:32-33` | Kode | Mencegah geseran satu arah |
| Lambaian: jendela waktu | 1300 ms | `wave-tracker.ts:103` | Kode | Lihat 3.3 butir 6 |
| Lambaian: frame tanpa tangan yang dimaafkan | 3 | `wave-tracker.ts:88` | Kode | |
| Jempol: tinggi minimal | 0,45 span | `hand-gesture.ts:119` | Kode | |
| Cubit: masuk / keluar | 0,42 / 0,55 | `hand-gesture.ts:189-190` | Kode ("provisional") | |
| Cubit telunjuk tertekuk: masuk / keluar | 0,15 / 0,20 | `hand-gesture.ts:196-197` | Kode | Agar kepal tidak menggambar |
| Kepal: jempol maksimal naik | 0,3 span | `hand-gesture.ts:199` | Kode | |
| Jari lurus | 1,1 kali PIP | `hand-gesture.ts:201` | Kode | Dilonggarkan untuk tangan anak |
| Ibu jari lurus | 1,3 kali | `hand-gesture.ts:165` | Kode | |
| Telapak terbelah | celah > 0,25 span, > 1,8 kali | `hand-gesture.ts:203, 205` | Kode | |
| Stabilisasi pose dan jumlah jari | 3 dari 5 frame | `StableVote` (`hand-gesture.ts:334-335`) | Kode | |
| Kuas: One Euro | minCutoff 1,0; beta 5,0; dCutoff 1,0 | `smoothing.ts:90` | Kode (alasan di komentar) | PANDUAN menyebut beta 0,007 sebagai contoh awal; kode berbeda |
| Placement: One Euro | minCutoff 0,8; beta 0,015 | `smoothing.ts:84` | Kode | Dicatat sebagai risiko lag |
| Gameplay: cubit masuk / keluar / konfirmasi | 0,42 / 0,50 / 2 frame | `gameplay-gesture.ts:40, 177, 181` | Kode | |
| Gameplay: frame pemulihan | 3 frame | `gameplay-gesture.ts:179` | Kode | |
| Kemudi: batas zona | 30 / 75-105 / 45-135 derajat; histeresis 5 | `gameplay-gesture.ts:30-38` | Dokumen (REVISI §18B) lalu kode | Ditandai sendiri di kode sebagai tebakan |
| Dwell (fallback tunjuk) | 1200 ms; tebak 2000 ms | `useDwell.ts:18`; `DrawingActions.tsx` | Kode | Hanya untuk kursor tangan dan fallback |
| Undo / redo tahan | 300 ms | `gesture-commands.ts:12` | Kode | |
| Stall kamera | 500 ms (gambar), 300 ms (gameplay) | `mediapipe-input.ts:300`; `gameplay-hand-driver.ts:70` | Kode | |
| Radius hapus | 28 px tetap (ukuran tetap sesuai Owner) | `eraser.ts:5` | Owner (ukuran tetap); kode menyisakan opsi dinamis | Perlu audit (NUI-AUDIT butir 13) |
| Gambar ulang setelah jatuh | ring 1500 ms | `FailOverlay.tsx:20` | Kode | |

---

## 5. ONNX, CLAHE, fill-light, RTMPose: status

| Komponen | Status di kode | Alasan tidak dipasang | Syarat sebelum dipertimbangkan |
|---|---|---|---|
| MediaPipe Hand Landmarker | Dipasang (inti) | - | - |
| One Euro (kursor, tinta) | Dipasang | - | Uji A/B dan ukur lag pada placement (bagian 6, butir 11) |
| ONNX Runtime Web | Tidak ada di `package.json` | Owner minta dinilai, bukan wajib dimuat (BIGPROMPT baris 204). PANDUAN §7 mensyaratkan model hand-specific 21 titik, berlisensi, dengan adapter. Tidak ada kandidat seperti itu di repo | Model tangan 21 titik berlisensi dengan urutan keypoint terdokumentasi; uji A/B menunjukkan manfaat pada false negative atau jitter; hardware WebGPU atau WASM diukur |
| RTMPose (ONNX) | Tidak ada | RTMPose yang dirujuk PANDUAN adalah pose tubuh 17 keypoint, tidak kompatibel dengan 21 jari | Sama dengan ONNX di atas. Body-pose tidak boleh menjadi fallback jari |
| CLAHE | Tidak ada | Belum ada A/B. Gamma atau brightness biasa tidak boleh diberi nama CLAHE | Implementasi nyata (histogram per tile, clip limit, interpolasi); A/B baseline vs CLAHE pada kamera redup: false negative, artefak, noise, biaya GPU/CPU |
| Screen fill-light | Tidak ada | Klaim lux (15-20 lux, 30 lux) tidak terukur; luma gambar bukan lux | Pengukuran dengan luxmeter; uji kenyamanan; instruksi alami bila gelap tetap ada |

Keputusan lead yang tersirat: jangan menambah dependensi runtime demi "tiga model" (PANDUAN §1).

---

## 6. Daftar uji kamera fisik untuk Owner

Untuk setiap uji: siapkan layar dengan kamera menyala, cahaya biasa dulu, lalu cahaya redup. Catat hasil di `NUI-RESULTS.md` sebagai PASS, FAIL, atau NOT TESTED beserta waktu dan kondisi cahaya. Jangan menutup kamera selama uji karena tangan harus terlihat.

1. **Lambaian dada-dada (cover).** Tekan "Nyalakan Kamera", lambai dada-dada 2 sampai 3 kali dalam sekitar 2 detik.
   - Amati: cincin lambaian terisi; Momo bangun setelah lambaian; kamera mengecil ke kiri bawah.
   - Uji negatif: diam, lalu miringkan tangan pelan satu arah. Tidak boleh terpicu.
   - Uji lambaian kecil dan cepat (motion blur). Bila gagal, catat fps kamera.
   - Ambang: `wave-tracker.ts:29-33`, `WINDOW_MS` `:103`.
2. **Jempol untuk konfirmasi (intro, selesai gambar, sukses).** Angkat jempol, tahan.
   - Amati: ring terisi; setelah terisi, harus lepas dulu sebelum ring terisi lagi (latch); tangan yang terus memegang jempol tidak mengulang konfirmasi.
   - Ambang: `isThumbUp` `hand-gesture.ts:119`; durasi tiap pemanggil.
3. **Cubit untuk kuas (gambar).** Cubit lalu gerakkan perlahan.
   - Amati: goresan mulai dan berhenti sesuai cubit; tidak putus-putus karena kedip deteksi.
   - Ambang: `hand-gesture.ts:189-197`; `hand-stroke-pipeline.ts` (2 frame mulai, 3 dari 5 selesai).
4. **Kepal untuk hapus.** Kepalkan tangan dan gerakkan di atas goresan.
   - Amati: hapus hanya saat kepal; jempol yang diangkat tidak menghapus.
   - Ambang: `FIST_MAX_THUMB_LIFT` `hand-gesture.ts:199`.
5. **Dua jari untuk undo.** Tahan dua jari sekitar 0,3 detik.
   - Amati: satu undo per tahan; tidak berulang selama tahan.
   - Ambang: `gesture-commands.ts:12`.
6. **Telapak untuk redo.** Tunjukkan telapak terbuka biasa, lalu telapak terbelah.
   - Amati: keduanya redo; dua jari tidak terbaca sebagai telapak.
   - Ambang: `SPLIT_GAP_RATIO`, `SPLIT_MIN_SPREAD` (`hand-gesture.ts:203, 205`). Keputusan bentuk belum final (3.3 butir 2).
7. **Satu, dua, tiga jari (daftar bab, Top-3, gagal).** Tunjukkan 1, lalu 2, lalu 3 jari, tahan ring.
   - Amati: angka benar; jempol terlipat tidak menambah angka; 3 jari tanpa jempol terbaca 3.
   - Ambang: `THUMB_EXTENDED_RATIO` 1,3 dan `EXTENDED_RATIO` 1,1 (`hand-gesture.ts:165, 201`); `StableVote` 3 dari 5.
8. **Cubit geser penggaris.** Cubit angka, geser horizontal, lepas.
   - Amati: penggaris ikut tangan; lepas memantul ke angka terdekat; Momo bertanya hanya setelah digeser dan menetap.
   - Ambang: `RULER_SETTLE_MS` 600; kepekaan geser di `StudentRulerSelector.tsx`.
9. **Kartu 1: seret Thinman dengan cubit.** Cubit di kiri, geser ke kanan sampai bendera.
   - Amati: Thinman berhenti di bendera; jempol baru muncul setelah bendera dan 10 detik baca.
   - Ambang: `CARD_READ_MS` 10000 (`tutorial-card-gate.ts:12`).
10. **Kartu 3: gambar dan coba semua alat.** Cubit (coret), kepal (hapus), dua jari (undo), telapak (redo).
    - Amati: setiap alat terhitung; jempol tidak menyebabkan coretan; kartu tidak lolos tanpa semua alat dicoba.
11. **Geser objek (gameplay).** Cubit objek, tahan 1,5 detik sampai ring terisi, geser, lepas.
    - Amati: objek ikut tangan setelah ring; lepas menaruh; sentakan sebentar tidak melepas (150 ms).
    - Ambang: `GRAB_HOLD_MS`, `GRAB_DROP_MS`, `GAMEPLAY_PINCH_*` (`gameplay-gesture.ts:40, 177`). Uji lag placement dengan One Euro beta 0,015 (`smoothing.ts:84`).
12. **Taruh di sini.** Jempol tahan 2 detik.
    - Amati: objek menetap di posisi terakhir.
    - Ambang: `PLACE_HOLD_MS` 2000.
13. **Putar objek.** Telapak terbuka tahan 1,5 detik. Catat apakah terasa seperti "memutar" atau seperti "menunggu". Catat juga apakah telapak diam terbaca sebagai putar secara tidak sengaja.
    - Ambang: `ROTATE_HOLD_MS` (`placement-gesture.ts:14`). Keputusan rotasi: 3.3 butir 1.
14. **Kemudi sudut telunjuk (gameplay).** Telunjuk ke atas (sekitar 90 derajat): lompat di tempat. Miring kanan atas (45 sampai 75): lompat sambil ke kanan. Miring kiri atas (105 sampai 135): lompat sambil ke kiri. Mendatar (di bawah 30 atau di atas 150): jalan.
    - Amati: SteerDial menunjukkan zona yang benar; zona tidak bergetar di batas.
    - Ambang: `gameplay-gesture.ts:30-38`. Kalibrasi per siswa belum ada.
15. **Gagal dan pemulihan.** Buat Thinman jatuh. Tunjukkan 1, 2, lalu 3 jari.
    - Amati: setiap angka menyorot tombol yang benar; ring terisi sebelum aksi.
    - Ambang: `FAIL_HOLD_MS`.
16. **Cold start dan delegate.** Buka halaman, catat waktu sampai status "ready" dan label delegate (GPU atau CPU cadangan). Ulangi di perangkat sekolah yang lemah.
    - Amati: kamera tidak tertahan oleh pemuatan model; error tampil, tidak diam-diam.
17. **Kondisi buruk.** Cahaya redup, dua tangan, tangan kiri dan kanan, tangan keluar dari bingkai lalu kembali, kamera ditolak. Tiap kasus: fallback tombol tetap bisa dipakai tanpa kamera.

Semua uji di atas adalah uji kamera fisik dan belum dilakukan (NOT TESTED).

---

## 7. Batas bukti

- Tidak ada webcam di sandbox. Semua perilaku gestur diuji dengan landmark sintetis (21 titik) dan fake timer.
- Tidak ada pengukuran fps, latensi, memori, atau VRAM. Angka di atas dari kode, bukan dari perangkat.
- Versi model `.task` tidak tercatat di repo; hanya ukuran dan sha256 yang diketahui.
- Owner belum memutuskan bentuk telapak untuk redo dan bentuk rotasi.
- Ambang kemudi dan lambaian adalah tebakan awal. Belum diuji pada anak SMP dengan kamera sekolah.
- Dokumen ini tidak mengklaim kamera "sudah jalan". Tidak ada uji yang dijalankan dengan kamera fisik.
