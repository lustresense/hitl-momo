# NUI-RESULTS — matriks uji NUI per gestur dan per layar

**Tanggal:** 11 November 2026
**Repo:** `frontend/implementation/`, branch `claude-monorepo`, HEAD `43e4cc3`. Tidak ada perubahan kode dari pekerjaan ini.
**Perintah:** `npx vitest run tests/input tests/camera tests/components tests/game` (dari `frontend/implementation`)
**Hasil:** 166 berkas test, 1330 test, **1330 lulus, 0 gagal** (exit 0). Keluaran lengkap: `scratchpad/run8/D-NUI/vitest-nui.txt`. Ada peringatan `act(...)` di beberapa test `GlobalCamera`; itu peringatan, bukan kegagalan.

**Cara membaca:**
- **Unit sintetis PASS** berarti test dengan landmark buatan (21 titik) dan fake timer lulus. Ini tidak membuktikan kamera.
- **Kamera NOT TESTED** berarti belum ada uji dengan webcam fisik. Semua baris di kolom ini NOT TESTED, kecuali disebut lain.
- **FAIL** dipakai bila perilaku kode tidak memenuhi mandat Owner, meskipun test unitnya lulus.
- Test tidak dijalankan di browser pada pekerjaan ini (tidak diperlukan untuk D-NUI).

---

## A. Gestur per mode dan test unit

| Gestur | Mode / aksi | Unit sintetis | Kamera fisik | Catatan |
|---|---|---|---|---|
| Pose 1 jari | Top-3, daftar bab, gagal (choose-1, level-1, retry) | PASS: `tests/input/hand-pose.test.ts`, `hand-pose-classify.test.ts`, `hand-finger-count.test.ts` (11), `gesture-mode.test.ts` (16), `top3-pose-choice.test.tsx` (9), `level-nui-ribbon.test.tsx` (13) | NOT TESTED | |
| Pose 2 jari | Top-3, daftar bab, gagal (undo di gambar; move-object gagal) | PASS: `hand-pose-classify.test.ts`, `gesture-mode.test.ts`, `drawing-gesture-commands.test.ts` (9), `nui-stage-fail-header.test.tsx` (13) | NOT TESTED | Undo 300 ms |
| Pose 3 jari | Top-3, daftar bab, gagal (choose-3, level-3, redraw) | PASS: `hand-finger-count.test.ts`, `gesture-mode.test.ts`, `top3-pose-choice.test.tsx` | NOT TESTED | |
| Hitungan jari 0..5 | `countExtendedFingers` dan `fingerCount` di `useHandGesture` | PASS: `tests/input/hand-finger-count.test.ts` (11), `tests/camera/thumb-tracker-pose.test.ts` (6) | NOT TESTED | Angka jari dan pose dicek agar sama |
| Pemilihan 4 dan 5 | `fingerCountAction` (choose-4, choose-5) | PASS: `gesture-mode.test.ts` | NOT TESTED | Tidak dipakai layar saat ini |
| Jempol naik | ThumbConfirm (intro, selesai gambar, sukses, penggaris, tamat); stiker "Lempar" (`throw`) | PASS: `tests/input/thumb-up.test.ts` (6), `tests/components/thumb-confirm.test.tsx` (9), `drawing-finish-confirm.test.tsx` (11), `success-popup.test.tsx` (3), `sticker-stamp.test.tsx` (7), `level-nui-intro.test.tsx` (6) | NOT TESTED | Latch dan satu konfirmasi per tahan diuji |
| Jempol "Taruh di sini" | `place` | PASS: `gamestage-placement-gestures.test.tsx` (10), `placement-controls.test.tsx` (10) | NOT TESTED | |
| Cubit (kuas) | `draw` | PASS: `hand-stroke-surface.test.ts` (25), `intent-gating.test.ts` (12), `drawing-surface-ink-gate.test.ts`, `two-hand-surface.test.ts` (11) | NOT TESTED | Tinta hanya saat cubit; jempol dan telapak tidak menggores |
| Cubit (geser objek, gameplay) | `grab` | PASS: `placement-grab.test.ts` (17), `placement-grab-hook.test.tsx` (9), `gameplay-gesture.test.ts` (12), `gameplay-gesture-filter.test.ts` (14) | NOT TESTED | |
| Cubit (geser penggaris) | penggaris kamera | PASS: `ruler-nui.test.tsx` (3), `ruler-confirm.test.tsx` (17) | NOT TESTED | |
| Cubit (kartu 1, jalan Thinman) | tutorial | PASS: `tutorial-pinch.test.tsx` (6), `pinch-ring.test.tsx` (7), `tutorial-flow.test.tsx` (1) | NOT TESTED | Lihat C.2: alur seret tangan |
| Cubit (Gambar ulang di Top-3) | `redraw` | PASS: `nui-decision-panel.test.tsx` (16), `top3-prediction-popup.test.tsx` (9) | NOT TESTED | |
| Kepal | `erase` (hapus) | PASS: `hapus-palm-gating.test.ts` (4), `eraser.test.ts`, `eraser-sizing.test.ts`, `drawing-surface-fixed-eraser.test.ts` | NOT TESTED | Radius tetap 28 px |
| Dua jari | `undo` | PASS: `drawing-gesture-commands.test.ts` (9), `hand-pose.test.ts` | NOT TESTED | Hold 300 ms, sekali per tahan |
| Telapak terbuka | `redo` (gambar), `redraw` (stiker, penempatan), `not-this` (Top-3), `rotate` (gameplay) | PASS: `gesture-mode.test.ts`, `drawing-gesture-commands.test.ts`, `sticker-stamp.test.tsx`, `nui-decision-panel.test.tsx` | NOT TESTED | Lihat C.1 (rotasi) dan C.2 (bentuk redo) |
| Telapak terbelah | `redo` (gambar) | PASS: `hand-pose-classify.test.ts`, `drawing-gesture-commands.test.ts` | NOT TESTED | Bentuk belum diputuskan Owner |
| Sapuan lambaian | WaveTracker (cover) | PASS: `tests/camera/wave-tracker.test.ts` (10), `wave-responsive.test.ts` (9), `global-camera-wave-flow.test.tsx` (10), `global-camera-cover.test.tsx` (7) | NOT TESTED | Ambang baru: 6 sampel, span 0,16, dua ayunan |
| Cincin progres lambaian | `waveProgress` ke cincin | PASS: `global-camera-wave-flow.test.tsx`, `wave-responsive.test.ts` | NOT TESTED | |
| Kemudi sudut telunjuk | zona jalan, lompat, lompat kanan dan kiri, histeresis | PASS: `gameplay-steer-angle.test.ts` (42), `gameplay-steer-dial.test.tsx` (8), `gameplay-hand-mapping.test.ts` (7) | NOT TESTED | Batas derajat adalah tebakan awal |
| Telapak diam, rotasi objek | `rotate` (ring 1500 ms) | PASS sebagai unit ring: `gesture-ring.test.tsx` (17), `gamestage-placement-gestures.test.tsx` (10) | NOT TESTED | **FAIL terhadap mandat**: tidak ada deteksi gerak memutar (C.1) |
| Pendaftaran pembaca tangan | satu pembaca per saat, tanpa pembaca kedua | PASS: `nui-no-second-reader.test.tsx` (5), `hand-readers-publish.test.ts` (6), `hand-drivers-resilience.test.ts` (19), `two-hand-driver.test.ts` (3) | NOT TESTED | Di kamera fisik belum dihitung landmarker |
| Pemanasan model | `warmHandLandmarker`, `takeHandLandmarker`, status delegate | PASS: `tests/camera/landmarker-warmup.test.ts` (8), `global-camera-warmup.test.tsx` (5), `hand-landmarker.test.ts` (6) | NOT TESTED | Waktu cold start belum diukur |
| Kamera tidak bisa dipakai | kegagalan kamera, fallback tombol | PASS: `global-camera-lifecycle.test.tsx` (14), `global-camera-morph.test.ts` (3) | Tidak berlaku | Fallback tombol tidak memerlukan kamera |

---

## B. Per layar

| Layar | Pembaca / gestur yang diuji | Unit sintetis | Kamera fisik | Catatan |
|---|---|---|---|---|
| Cover (tidur, bangun) | WaveTracker, cincin lambaian | PASS: `wave-tracker.test.ts`, `global-camera-cover.test.tsx`, `global-camera-wave-flow.test.tsx`, `global-camera-stationary.test.tsx` (6) | NOT TESTED | Momo tidur: `MomoAvatar.tsx:41-49` (tidur, kedip saat bangun). Zzz: `momo-zzz` (`100-guide.css:32`), versi pengurangan gerak `momo-zzz-soft` (`:55`). Napas dan apung tidur (6 sampai 8 px, tilt 2 derajat) tidak ditemukan sebagai keyframe; belum dinilai visual (REVISI §7) |
| Kamera PIP kiri bawah | posisi `bottom: 24px; left: 24px` | PASS: `global-camera-morph.test.ts` (3); posisi CSS dicek di `app/styles/60-global-camera.css:8-22` | NOT TESTED | Tidak ada pengukuran layout di browser |
| Penggaris | cubit geser, lepas snap, ThumbConfirm setelah menetap | PASS: `ruler-nui.test.tsx` (3), `ruler-confirm.test.tsx` (17) | NOT TESTED | Nomor default 1 |
| Kartu tutorial 1 | Thinman dengan cubit, bendera, 10 detik baca, jempol | PASS: `tutorial-pinch.test.tsx` (6), `tutorial-flow.test.tsx` (1), `tutorial-canvas-remeasure.test.tsx` | NOT TESTED | C.2 |
| Kartu tutorial 2 | baca 10 detik, jempol | PASS: `tutorial-flow.test.tsx` (1) | NOT TESTED | |
| Kartu tutorial 3 | coret, hapus, undo, redo; gate lulus setelah semua alat dicoba | PASS: `hand-stroke-surface.test.ts` (25), `drawing-gesture-commands.test.ts` (9) | NOT TESTED | Jalur tutorial memakai DrawingSurface |
| Daftar bab | 1/2/3 jari, ring, tarik pita dengan mouse | PASS: `level-nui-ribbon.test.tsx` (13), `ribbon-pull.test.tsx` | NOT TESTED | Level 4 tidak ada |
| Intro level | ThumbConfirm 1000 ms, latar gelap | PASS: `level-nui-intro.test.tsx` (6), `level-intro-motion.test.tsx` | NOT TESTED | Animasi tidak dipercepat |
| Gambar (mode kamera) | cubit, kepal, undo, redo, jempol selesai, idle 10 detik | PASS: `drawing-finish-confirm.test.tsx` (11), `drawing-finish-placement.test.ts` (2), `nui-drawing-dwell.test.tsx` (10) | NOT TESTED | Jempol tidak menggores: `intent-gating.test.ts` |
| Top-3 | pilih 1/2/3 jari, Bukan ini (telapak), Gambar ulang (cubit) | PASS: `top3-pose-choice.test.tsx` (9), `nui-decision-panel.test.tsx` (16) | NOT TESTED | Tools kanvas mati di mode ini: belum ada test eksplisit untuk mode ini |
| Stiker | Lempar (jempol), Gambar lagi (telapak) | PASS: `sticker-stamp.test.tsx` (7), `gamestage-sticker-entry.test.tsx` (2) | NOT TESTED | |
| Penempatan | geser (cubit), taruh (jempol), gambar ulang (telapak) | PASS: `placement-controls.test.tsx` (10), `placement-grab-hook.test.tsx` (9), `gamestage-placement-gestures.test.tsx` (10), `placement-grab.test.ts` (17) | NOT TESTED | |
| Gameplay (kamera) | kemudi sudut, geser, putar | PASS: `gameplay-steer-dial.test.tsx` (8), `gameplay-steer-angle.test.ts` (42), `gameplay-hand-driver.test.ts` (4), `gamestage-input-mode.test.tsx` (8) | NOT TESTED | Bar kontrol mode kamera: tanpa label keyboard (lihat catatan C.4) |
| Gagal | 1 jari coba lagi, 2 jari geser, 3 jari gambar lagi | PASS: `nui-stage-fail-header.test.tsx` (13), `predicting-recovery.test.tsx` (4) | NOT TESTED | |
| Sukses | ThumbConfirm 1000 ms | PASS: `success-popup.test.tsx` (3) | NOT TESTED | |
| Tamat (penutup, kuis) | ThumbConfirm, dwell, pilihan NUI | PASS: `ending-nui-options.test.tsx` (3), `ending-recap.test.tsx`, `nui-level-ending-targets.test.ts` (6) | NOT TESTED | |

---

## C. Temuan yang tidak lolos mandat (FAIL) atau belum diputuskan

### C.1 FAIL (sedang diperbaiki, Z3): rotasi objek tidak memakai gerak memutar

Koreksi lead 2026-11-11 (RECONCILE.md): telapak + cincin hanya masuk mode putar; gerak memutar tangan ±45° memutar objek 90°.

- Kode: telapak terbuka diam tahan 1500 ms (`src/components/game/ExplorationRings.tsx`, `ROTATE_HOLD_MS` di `placement-gesture.ts:14`).
- Mandat: lima jari dengan gerakan memutar (BIGPROMPT Lampiran 17, baris 352), dan larangan menyamakan telapak diam dengan rotasi (BIGPROMPT baris 177).
- Unit test lulus, tetapi hanya mengetes ring. Tidak ada test gerak memutar karena fiturnya belum ada.
- Status: **FAIL** terhadap mandat. Perlu keputusan produk dan implementasi.

### C.2 FAIL: penggaris dan kartu 1 memakai cubit seret, bukan jalur yang diminta
- Kartu 1: mandat Owner meminta cubit menggerakkan Thinman sampai bendera. Test `tutorial-pinch.test.tsx` lulus. Perlu konfirmasi di kamera bahwa Thinman mengikuti tangan dan berhenti di bendera.
- Status: unit lulus; kamera NOT TESTED.

### C.3 OPEN: bentuk telapak untuk redo
- Owner menulis telapak terbuka. PRD R12 mengusulkan telapak terbelah. Kode menerima keduanya (`drawingCommandFor`, `hand-gesture.ts:316-318`).
- Status: **belum diputuskan**. Uji kamera butir 6 di NUI-PLAN.

### C.4 Catatan: label keyboard di mode kamera
- Bar kontrol gameplay mode kamera tidak lagi memakai label keyboard: `GameplayControls.tsx` (tombol hanya ikon, "No keyboard hints") dan teks `ControlGuide.tsx` mode kamera. `gamestage-input-mode.test.tsx:218` mengunci teks mode fallback ("Pakai keyboard atau tombol"), tetapi tidak mengunci ketiadaan teks keyboard di mode kamera.
- Status: **belum dibuktikan**.

### C.5 Catatan: router belum tunggal
- Lima mode di `gesture-mode.ts` (`MODE_CANVAS_DRAWING`, `MODE_CANVAS_PREDICT_TRIGGER`, `MODE_DIALOG_ACK`, `MODE_TUTORIAL`, `MODE_COVER_WAVE`) tidak dipanggil layar. Test `gesture-mode.test.ts` mengunci tabelnya, tetapi perilaku layar memakai jalur lain.
- Status: **terbukti dari kode** (grep). Perubahan pose harus dijaga di dua tempat.

### C.6 Catatan: kamera PIP dan ambang lambaian
- Posisi PIP kiri bawah diverifikasi dari CSS, bukan dari layout di browser.
- Ambang lambaian baru belum diuji dengan kamera redup. Dengan jendela 1300 ms, ambang 6 sampel memerlukan sekitar 4,6 fps.
- Status: **NOT TESTED**.

---

## D. Yang tidak terbukti

- Tidak ada uji dengan webcam, cahaya redup, motion blur, tangan kiri, dua tangan, atau tangan anak.
- Tidak ada pengukuran fps, latensi, cold start, memori, atau VRAM.
- Tidak ada uji ONNX, CLAHE, atau fill-light (tidak dipasang; lihat NUI-PLAN bagian 5).
- Angka ambang (pinch, jari, kemudi, lambaian, hold) adalah nilai kode, belum dikalibrasi.
- Test lulus tidak sama dengan kamera berfungsi. Semua kolom kamera tetap NOT TESTED sampai Owner menjalankan daftar uji di NUI-PLAN bagian 6.
