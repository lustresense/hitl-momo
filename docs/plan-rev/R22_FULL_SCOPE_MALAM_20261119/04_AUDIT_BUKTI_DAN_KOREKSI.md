# Audit bukti terikat sumber untuk R22

## 1. Baseline yang benar-benar tersedia

Repository diperiksa **read-only** pada 19 November 2026. Snapshot `main` yang diperiksa adalah commit `e3e74bfdbe466850061205c83ad9fea5a60cebc1` (`0.29.0-alpha`), sedangkan `research-can` adalah `547403f90529450c14c7fd3a498f7302c3726fe2`. AGY wajib `fetch` dan verifikasi HEAD lagi sebelum membuat worktree agar tidak bekerja dari commit kedaluwarsa. Branch `main` telah memuat integrasi recorder R20; jangan membuatnya ulang.

Input bukti langsung:
- Export **dua trial Gesture** dan export **empat trial (7.612 frame)**, keduanya disertakan di `references/benchmarks`.
- `references/claude/analyze_nui_bench.py` dan `bench_analysis_S-07ba0cde.txt` untuk mengulang ringkasan statistik. Jalankan ulang dengan JSON yang sesuai; jangan menganggap output statis sebagai runtime baru.
- Rekaman video Owner pada sesi sebelumnya adalah bukti pengalaman visual, tetapi file video tidak ada dalam paket ZIP ini. AGY perlu meminta atau mengambil ulang dari input Owner bila ingin menjalankan replay video, bukan mengaku sudah mengujinya.

## 2. Statistik dari output analisis Claude, bukan GT independen

| Trial | Route | Model/mode | Frame | Raw no-hand | Miss di jendela first-last hand | Informasi lain |
|---|---|---|---:|---:|---:|---|
| T001 | Gesture | C7 + A4 | 2.297 | 461 (20,1%) | 189/2.025 (9,3%) | Median videoFps terlapor 15, detectHz 23 |
| T002 | Gesture | C4 + A4 | 2.907 | 1.570 (54,0%) | 260/1.597 (16,3%) | Tail 1.282 frame tanpa tangan; median videoFps 15, detectHz 22 |
| T003 | Gesture | C4 + RAW | 326 | 230 (70,6%) | 6/102 (5,9%) | Trial pendek; median videoFps 15, detectHz 30 |
| T004 | Canvas | C4 + RAW | 2.082 | 668 (32,1%) | 357/1.771 (20,2%) | 19 stroke, 5 detector-miss stroke ends |

**Caveat:** Jendela dari deteksi tangan pertama sampai terakhir *bukan* anotasi bahwa tangan selalu ada di kamera. `no-hand` mencakup tangan yang memang keluar frame, kamera tertutup, pengguna mengurus UI, dan kegagalan detector. JSON tanpa ground truth tidak bisa menghitung detector recall atau classifier accuracy secara absolut.

Pada T004, menurut output script Claude:
- 582 frame dalam pose pinch stabil; 276 berstatus `Tinta aktif`, 208 `Tunggu gestur dilepas sebelum aksi baru`, 59 `Tidak ada aksi gambar`, 31 `Cubit ditolak gate R19`, 8 `Pinch dibaca, menunggu validasi tinta`.
- 54 `PINCH_ON`, 19 `STROKE_START`; 29 `PINCH_ON` tidak disusul stroke dalam 500 ms.
- 5 `STROKE_END` dengan alasan detector miss. Durasi break yang dilaporkan 12.657, 603, 99, 220, dan 62 ms. **Tidak semua 5 break bisa atau harus di-resume**; 3 putus pendek 62–220 ms layak diuji dengan grace window, dan 220 ms > grace existing 150 ms.
- `POINT_READY` muncul pada 205 frame Canvas; kode `lab-analyzer.ts` menutup stroke ketika state bukan OTHER, sekalipun route Canvas seharusnya tidak bergantung pada gate pistol.
- Empat aksi Undo via button, bukan bukti Undo gestur bekerja.

## 3. Konflik sumber dan koreksi penyebab

1. **A4v2 bukan sekadar single-frame brightness lift.** Source `bench/r20-lowlight.ts` sudah menerapkan downscale, motion-gated temporal EMA, median filtering, optional denoise, dan Reinhard LUT. Klaim bahwa semua ini belum ada adalah salah. R22 wajib membandingkan baseline A4v2, bukan sekadar menggantinya nama A5.
2. **`setOptions({numHands})` benar-benar dipanggil** di `bench/r20-hand.worker.ts` lewat `syncNumHands`, dengan perubahan ke 1/2 berasal dari `worker-owner-guard.ts`. Biaya panggilannya sudah diinstrumentasi. Hipotesis graph rebuilding/kehilangan tracking perlu diuji dengan varian fixed 1/fixed 2, bukan dinyatakan otomatis menjelaskan semua miss.
3. **Dua jalur submit frame ditemukan.** `NuiLabPage.tsx` punya `runFrame` yang memeriksa `totalVideoFrames` atau fallback `currentTime`, tetapi setelah hasil worker callback, ada `submitFrame(v, performance.now())` langsung. Worker client belum memastikan media frame ID unik pada jalur callback. Karena itu mismatch videoFps vs detectHz adalah indikator kuat perlu audit duplikasi, **bukan bukti checksum frame duplikat persis 40%**. Instrument capture ID/metadata sebelum memperbaiki scheduler.
4. **Luma rata-rata sekitar 0,47 bukan pengukuran iluminansi ruangan.** Auto exposure, area background, dan preprocessing memengaruhi nilai tersebut. Tidak bisa membuktikan bukan lowlight, sama seperti tidak bisa membuktikan lowlight. Tambahkan luma percentile per ROI, exposure metadata bila tersedia, dan dokumentasi kondisi eksperimen.
5. **Canvas `ink.feed()` tetap dipanggil di jalur yang menganggap pistol sebagai gate**, sehingga konsistensi stroke store harus diinspeksi. `releaseAllInternal()` memanggil `ink.reset()` dan mematikan `armed.draw`; ini didukung source. Jalur `lost()` existing perlu digunakan dengan uji fail-closed yang memisahkan kehilangan singkat dari tangan pengganti.
6. **MediaPipe Hand Landmarker bukan model yang dapat di-fine-tune lewat Model Maker standar.** Jangan menyebut classifier downstream atau model ObjectDetector sebagai `fine-tuned Hand Landmarker`. Detector tambahan hanya bisa memasok ROI/frame ke task yang ada dengan mapping koordinat yang diuji, bukan mengganti palm detector internal lewat API publik begitu saja.
7. **Satu `FilesetResolver.forVisionTasks()` tidak membuktikan satu instance WASM/heap** untuk ObjectDetector dan HandLandmarker. Network size, memory, latensi, startup, dan kompatibilitas custom TFLite memerlukan pengukuran nyata.
8. **`numHands=1` bukan otomatis anti-distraksi.** Itu justru bisa menyembunyikan tangan kedua ketika masuk frame. Audit fixed 1/fixed 2 dan continuity ID, refusal saat ambiguous; pilih berdasarkan sumber bukti.
9. **Retrain R17–R20 diminta Owner dan tidak dibatalkan.** Namun locked test dan data berstatus HOLD_LICENSE tidak boleh dimasukkan train. `C8/C9` dan bobot/latensi usul Google AI belum terukur. Semua model calon tetap dieksperimenkan, tidak otomatis mengalahkan C4.

## 4. File runtime penting yang sudah dikonfirmasi berada di `main`

- `frontend/implementation/src/components/nui-lab/NuiLabPage.tsx`
- `frontend/implementation/src/components/nui-lab/NuiLabPage.css`
- `frontend/implementation/src/components/nui-lab/lab-analyzer.ts`
- `frontend/implementation/src/components/nui-lab/bench/r20-hand.worker.ts`
- `frontend/implementation/src/components/nui-lab/bench/r20-worker-client.ts`
- `frontend/implementation/src/components/nui-lab/bench/worker-owner-guard.ts`
- `frontend/implementation/src/components/nui-lab/bench/r20-lowlight.ts`
- `frontend/implementation/src/components/nui-lab/bench/manager.ts`, `schema.ts`, `writer.ts`, `export.ts`, `store.ts`
- `frontend/implementation/src/input/hand-stroke-pipeline.ts` (jalur existing yang tidak boleh diubah lintas gameplay tanpa regression).

**Perubahan kode malam ini belum dilakukan oleh penulis dokumen ini.** Daftar di atas adalah lokasi audit dan integrasi, bukan klaim commit baru.
