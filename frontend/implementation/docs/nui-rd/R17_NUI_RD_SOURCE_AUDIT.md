# R17 · RD-00 audit dan preflight (NUI-REVISION 0.23.0-alpha R17-01 REV4)

Evidence class per baris: **SOURCE** (dibaca di kode), **UNIT** (tes sintetis), **DATASET** (landmark publik nyata), **WEBCAM** (kamera fisik).
Tidak ada baris WEBCAM yang dijalankan di sesi ini: semua klaim "gagal di webcam" berasal dari laporan Owner di tiket.

## Preflight

| Item | Hasil |
|---|---|
| Base | `origin/main` = `584cbb6` (tree identik dengan `4465b8d`, riwayat ditulis ulang oleh Owner), VERSION `0.23.1-alpha` |
| PR #5 | tidak di-merge dan tidak di-patch ulang (sesuai tiket) |
| `DECISIONS.md` | tidak disentuh |
| Auto-lock (`FullFrameHandLock`) | tidak ditulis ulang. Satu bug pengurutan diperbaiki (lihat G-lock) |
| Smoothing & cursor mapping | tidak diubah. Tes A/B membuktikan titik tinta pinch identik baseline vs lab (`tests/input/pinch-gate.test.ts`) |

## Sumber dan path fungsi

Base: `origin/main` `584cbb6` (0.23.1-alpha). Hasil kerja: `db68039` (0.24.0-alpha), cabang kerja lokal `gameplay-lead`, didorong ke `main`.

| Fungsi / modul | Path | Perubahan |
|---|---|---|
| `evaluateGesture`, `classifyHandPose`, `countExtendedFingers`, `thumbLateral`, `thumbDiagnostics`, `withAspect` | `src/input/hand-gesture.ts` | opsi `experimentalRobust` + `aspect`; tanpa opsi = perilaku lama |
| `HandStrokePipeline` (`debugState`, `aspect`) | `src/input/hand-stroke-pipeline.ts` | geometri beraspek hanya mode lab |
| `StrokeStore.eraseAt` + `cutStroke` | `src/input/types.ts` | `eraseSegments` opt-in, default `false` |
| `LabAnalyzer` (`diag`, `LabCommandResult`, `computeHandStatus`, `primaryLandmarks`) | `src/components/nui-lab/lab-analyzer.ts` | diagnostik, swipe, status Hapus |
| `SwipeCommander` | `src/components/nui-lab/lab-swipe.ts` (baru) | FSM idle→pose-armed→tracking-motion→fired→cooldown |
| `LandmarkRecorder`, `validateRecord` | `src/components/nui-lab/lab-recorder.ts` (baru) | RD-02 |
| `FullFrameHandLock.pick` | `src/components/nui-lab/lab-hand-lock.ts:100` | hanya komparator `a.d-b` → `a.d-b.d` |
| panel R17 + perekam | `src/components/nui-lab/NuiLabPage.tsx` | `GestureDiagnostics`, `RecorderPanel`, `aspect` dari `videoWidth/videoHeight` |

## Beda dengan draft PR #5

PR #5 (`nui-lab-qa-0.22.1`, `424e077`, 0.22.1-alpha, **belum di-merge**) hanya mengubah UX opt-in eksperimen dan relock yang jujur: `NuiLabPage.tsx` (14 baris), `lab-hand-lock.test.ts` (+11), `nui-lab-page.test.tsx` (+17), dokumen, versi. Ia **tidak** menyentuh pengenalan jempol, pinch, penghapus, atau swipe, jadi tidak ada patch PR #5 yang diulang di sini. **Akan konflik saat PR #5 di-merge** pada `NuiLabPage.tsx`, `lab-hand-lock.test.ts`, `nui-lab-page.test.tsx` dan semua berkas versi (0.22.1 vs 0.24.x); rekonsiliasi manual oleh Owner/IT, tidak ditimpa diam-diam.

## Matriks: ada di source / pernah diuji / belum diuji / gagal di webcam

| ID | Temuan | Source | Diuji sebelum | Diuji sekarang | Webcam |
|---|---|---|---|---|---|
| R17-02/04 | Aturan jempol lama `tip-gap > ip-gap * 1.3` terhadap knuckle telunjuk membaca jempol tertekuk sebagai terbuka | `src/input/hand-gesture.ts` `thumbExtended` | tidak ada tes pada landmark nyata | UNIT 30 tes + DATASET (di bawah) | GAGAL (laporan Owner), tidak diukur ulang |
| R17-02 | `four` (empat jari, jempol tertekuk) lolos sebagai "lima jari" lalu Hapus | sama | belum | DATASET: erase-eligible `four` **84.4% → 0.2%** (test, n=2500) | belum |
| R17-04 | `three` terbaca empat jari | sama | belum | DATASET: count 3 untuk `three` 16.8% → 98.3%; pose three-fingers 16.3% → 97.3% | belum |
| R17-05 | Pinch masuk di rasio 0.42 pada koordinat mentah x/width,y/height; di 16:9 jarak horizontal tampak 0.5625 kali | `PINCH_ENTER`, `evaluateGesture` | belum | UNIT 16 tes gate + 2 tes e2e (near vs touch lewat analyzer); gate lab 0.30/0.42 pada geometri terkoreksi aspek | GAGAL (laporan Owner), tidak diukur ulang |
| R17-02 (G-04) | Penghapus hanya memotong titik sampel, goresan cepat (titik jarang) lolos | `StrokeStore.eraseAt` | belum | UNIT 9 tes + 1 e2e (potong antar-vertex), default game tidak berubah | belum |
| R17-01 (G-06) | HUD tidak menunjukkan jawaban store untuk Undo/Redo | `lab-analyzer.ts` | belum | UNIT: `lastCommand.changed` dari `store.undo()/redo()` | belum |
| G-lock | Comparator `a.d-b` (TS2363) di `lab-hand-lock.ts` sudah gagal `tsc` di main | `lab-hand-lock.ts:100` | `tsc` merah | diperbaiki, 2 tes urutan (merah dengan kode lama, hijau dengan perbaikan) | n/a |
| R17-03 | Undo/Redo = tahan pose 300 ms di `gesture-commands.ts` | source | ada | lab: FSM geser (17 tes + 5 e2e); game tetap pose-hold | belum |

## Pemeriksaan baseline yang dijalankan

- `tsc --noEmit`: exit 0 setelah perbaikan. Di worktree bersih `4465b8d` sebelumnya merah (TS2363).
- Vitest di worktree bersih: 8 file / **22 tes gagal** dari 2170 (pra-ada, tidak terkait): `components.test.tsx` (7), `two-hand-surface.test.ts` (6), `tutorial-pinch.test.tsx` (2), `eraser-controls.test.ts` (2), `drawing-surface-eraser-radius.test.ts` (2), `global-camera-lifecycle.test.tsx` (1), `hand-stroke-surface.test.ts` (1), `drawing-surface-fixed-eraser.test.ts` (1).
- Vitest setelah perubahan: 8 file / **22 tes gagal** dari 2262 (+92 tes baru, semua lulus). Himpunan nama tes yang gagal **identik** dengan baseline (`diff` kosong).

## Catatan yang jujur

- Angka DATASET memakai landmark otomatis MediaPipe pada gambar statis HaGRIDv2 dengan asumsi bingkai 16:9. Itu bukan footage webcam target.
- Aturan baru **tidak** menyelesaikan semuanya: `no_gesture` (tangan alami terbuka) tetap erase-eligible 33.8% di aturan revisi (35.9% baseline), dan `grabbing` naik 1.6% → 18.0%, `grip` 0.6% → 4.4%, `ok` 0 → 3.2% (regresi dari aturan jempol baru). Pada gameplay, Hapus masih butuh pose stabil 3-dari-5, rearm, dan frame berturut, jadi angka per-gambar melebihi laju aksi sebenarnya, tetapi **itu tidak terukur dari gambar statis** (INSUFFICIENT_DATA untuk efek temporal).
- Pose `thumb-up` repo membaca 82% kelas HaGRID `fist` sebagai jempol-atas di **kedua** aturan (2050/2500). Tidak diubah (di luar lingkup, Kepal tetap inert untuk gambar/hapus), tetapi ini risiko konfirmasi-jempol yang perlu keputusan Owner.
