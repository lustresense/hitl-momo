# CAN-IMPLEMENTATION-PLAN — rencana dan pembagian kerja, 2026-11-10

Lead: Claude Fable 5.2 (`claude-fable-5-2`). Worker: Claude Haiku (`claude-haiku-5-5`, effort max). Satu penulis per file. File bersama (`SketchbookApp.tsx`, `CHANGELOG.md`, dokumen `contexts/can`) hanya diedit lead.

## Urutan

| Tahap | Isi | Syarat mulai |
|---|---|---|
| A | Audit (selesai): `CAN-FRONTEND-AUDIT.md`, `NUI-AUDIT.md` | — |
| C | Restorasi: hapus Level 4, timing kartu, reduced motion, Momo tidur dan bangun, buka buku, kamera cover | A |
| D | Penggaris, tiga kartu (seret cubit, gate 10 detik, jempol), kartu 3 dengan tangan | C untuk file yang sama |
| E | Level: intro, idle 10 detik, posisi Momo, penempatan (cincin, lepas, rotasi), "Gambar lagi", pemetaan label model | C |
| F | Portal, rekap, tempat kuis dengan flag | Level 4 sudah dihapus |
| G | Verifikasi, dokumen, commit, push | semua |

## Stream gelombang 1 (paralel)

| Stream | File milik | Hasil |
|---|---|---|
| R1 Level 4 | `domain/levels.ts`, `types.ts`, `mission-config.ts`, `world-intro-script.ts`, `game/stage-geometry*.ts`, `stage-preview/**`, `prediction/mock-prediction-provider.ts`, `level/LevelRibbonBookmark.tsx`, `app/route-guard.ts`, `level-progress.ts`, test dan e2e terkait | Tiga level. Penutup setelah Bab 3 |
| R2 Momo | `momo/momo-engine.ts`, `MomoAvatar.tsx`, `MomoChat.tsx/.css`, `100-guide.css` (bagian Zzz) | Napas, kedip saat bangun, teks tebal, timing ketik Can |
| R3 Cover | `camera/GlobalCamera.tsx`, `ui/BookFlip.tsx`, `60-global-camera.css`, `prototype-camera.css`, `momo/MomoGuide.tsx`, `guide-script.ts` (bagian cover) | Kamera morph, Momo ke tengah, copy, jempol, buku di titik tengah |
| R4 Kartu | `onboarding/TutorialBrochure.tsx/.css`, `99-tutorial.css`, `ui/PinchRing.*` | Timing `9f9d35d`, seret cubit, gate, kartu 3 |
| R5 Penggaris | `onboarding/StudentRulerSelector.tsx/.css`, `guide-script.ts` (bagian penggaris, lewat lead bila bentrok) | Fokus Momo, tanpa judul, tanya setelah pilih |

## Stream gelombang 2

| Stream | File milik | Hasil |
|---|---|---|
| L1 Intro dan gambar | `level/LevelIntro.tsx`, `drawing/DrawingScreen.tsx`, `useMomoCompanionLayout.ts`, `momo-cue.ts` | Jempol setelah ucapan, Momo terbang, idle 10 detik, Momo kiri atas |
| L2 Penempatan | `game/**` penempatan, `input/arbiter.ts`, `hand-gesture.ts` (rotasi) | Cincin pegang, lepas taruh, rotasi lima jari |
| L3 Prediksi | `prediction/**`, `api/submission-adapter.ts` | Pemetaan label, provenance, mock tidak masuk kelas |
| L4 Penutup | `ending/**`, flag kuis | Portal, rekap, gate kuis |
| L5 Copy | `FailOverlay.tsx`, `DecisionPanel.tsx` | "Gambar lagi" |

## Delta terhadap brief (terlihat, bukan diam-diam)

| Brief | Yang dikerjakan | Alasan |
|---|---|---|
| Nama "Tinman" | "Thinman" dari `character-tokens.ts` | D-20261105-24 aktif. Satu baris untuk diganti bila Owner memilih Tinman |
| Kamera mengecil "saat kamera nyala" dan "saat lambaian" | Kamera besar di tengah sampai lambaian, lalu mengecil dan pindah | Lambaian butuh video besar agar terlihat. Kedua keadaan UI tetap ada |
| Redo "telapak terbuka" | Telapak terbuka DAN telapak terbelah sama-sama redo di kanvas | Kode Can dan ikon Figma memakai telapak terbelah (R12). Lambaian memakai sapuan pergelangan, jadi tidak bentrok |
| Penghapus | Ukuran tetap. Pengatur dua tangan dimatikan dari alur wajib | Owner condong ukuran tetap |
| Reduced motion | Animasi cerita tetap berdurasi normal | Keluhan Owner. Mengubah praktik lama di kode Can |
| Kuis | Tempat dan flag disiapkan. Isi kuis tidak dibuat | Materi belum ada. Toggle admin butuh kontrak Dias |
| ONNX, CLAHE, fill-light | Tidak dipasang. Dicatat sebagai kandidat eksperimen | Tidak ada aset atau lisensi model tangan di repo. Tanpa kamera tidak bisa diuji A/B |

## Batas bukti

Tidak ada kamera fisik di lingkungan kerja. Gestur diuji dengan landmark sintetis dan test hook, lalu ditandai NOT TESTED untuk hardware. Durasi animasi tidak dipersingkat untuk test. Test memakai fake timer.
