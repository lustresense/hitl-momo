# Milestone (lead) — 2026-11-11

M1 Restorasi onboarding: R1 hapus Level 4, R2 Momo tidur/bangun/chat, R3 cover kamera+buku, R4 tiga kartu, R5 penggaris.
   Gate: tsc 0, vitest penuh hijau, build, grep level 4 kosong, lead review diff per stream.
M2 Level & NUI gameplay: L1 intro/idle 10s/posisi Momo/"Gambar lagi", L2 penempatan cincin+lepas+rotasi, L3 label model+provenance.
   Gate: sama + level-solvability + contract tests.
M3 Penutup: L4 portal, rekap netral, gate kuis.
M4 Integrasi: wiring SketchbookApp (lead), harness E2E, E2E browser (journey, recovery, finish, classroom via Caddy), dokumen (NOW, draft DECISIONS, NUI-PLAN/RESULTS, CHANGELOG), commit, push claude-monorepo.
Lapor ke Owner hanya saat milestone tuntas.

## Antrian integrasi lead (dari laporan worker)
- L5: DrawingScreen kirim `handMissing` ke DrawingActions (L1 owner sekarang; lakukan setelah L1 selesai).
- L5: test rusak karena Tebak tersembunyi di mode kamera: components.test.tsx:37-38, drawing-submit.test.tsx:7, drawing-finish-confirm.test.tsx:199, nui-drawing-dwell.test.tsx:128,137, top3-prediction-popup.test.tsx:246 (+ :197 "Gambar lagi").
- L5: sisa "Gambar ulang": EnterWorldPopup.tsx:35, MomoGuessChat.tsx:4, e2e/recovery-paths.mjs, e2e/record_full_journey.mjs.
- L5: components.test.tsx:59 ruler 21 vs 20 (cek setelah R5).
- L5/A5: GameplayControls tombol arah tampil di mode kamera; InputStatusChip "(uji coba)"; label "NUI NOT VERIFIED" useHandControl.ts:44,62 (melanggar 5/6.7) -> stream G2.
- Keputusan lead: "Gambar lagi" dan Bantuan 48 px diterima (sekunder; ≥44 px).
- R5 selesai: SketchbookApp ~140 kirim `classStatus` ke StudentRulerSelector (none/joining/joined/failed). Nomor tersimpan: Momo tunggu geser dulu (diterima lead; cocok REVISI §8.2).
- L4 selesai: harness playEnding (harness.mjs ~417-427, record-full-showcase langkah 9, normal-journey ENDING_AFTER): portal ~7 s, thumb ending-understood, thumb ending-recap-next, (kuis) ending-quiz-next, klik ending-back-to-cover.
- L4: SketchbookApp chooseEnding "finish" -> setFinished(true) memunculkan PageEdgeWalkers (easter egg tak diminta) -> lead putuskan (hapus easter egg; tetap di layar akhir).
- L4: useLevelSession recapFromFlow isi firstGuessConfidence + redrawCount.
- L4: gesture-stub.ts TS2739 pose/fingerCount (setelah N1).
- L4: 104-hitl.css aturan .center-page__overview/__epilog/__choice/__meet/__thinman mati.
- R2 selesai: apung ±3,5 px (7 px total) tilt ±2° 4 s; MOMO_WAKE_MS 810; chat 30 ms tetap (tidak dipadatkan). Catat: Owner mungkin ingin ±6–8 px (FLOAT_PX).
- R2: level-intro-motion.test.tsx mock gsap tanpa delayedCall (6 gagal, L1). drawing-finish-confirm.test.tsx btn-submit-drawing hilang (L5 Bantuan; L6).
- L3 selesai: state-machine.ts:262 resolveBehavior pakai candidate.gameLabel (bukan displayName). DevBanner.tsx:8 pakai showDemoNotice(source) (T3/lead).
- L3 BLOKER PRODUK: 20 kelas model Dias tidak punya padanan benda level -> semua keputusan mode model = unresolved. Butuh keputusan Owner/Dias (contracts/LABEL_MAP_PROPOSAL.md §5). Fixture submission-request.json label kucing/anjing/bebek.
- R3 selesai: wave-tracker perlu onProgress?(0..1) (cek N1 kompatibel). guide-flow.mjs:35 "Halo! Aku Momo" + jempol `cover-thumb`. Morph scaleX/scaleY tak seragam (video meregang 0,8 s) -> perbaiki ke skala seragam bila ada waktu. Jadwal setTimeout+tween bukan satu timeline (diterima; batal saat unmount dicek).
- N1 selesai: wave.subscribeProgress(cb) (bukan onProgress -> GlobalCamera perlu glue); warmHandLandmarker/takeHandLandmarker (serah-terima sekali; keputusan lead: cukup, tidak berbagi penuh). G2 driver pakai takeHandLandmarker. Mode Hapus: telapak terbuka tetap menghapus?? -> L6/lead cek (aturan: hanya cubit menggores; hapus = kepal).
- FX selesai. Sisa cleanup (worker Z setelah semua): GameStage !integrated banner "FALLBACK ... BUKAN NUI TERVERIFIKASI" tampil ke siswa; "Gambar ulang" di PredictingScreen.tsx 34,47,51, momo-script.ts 34,43, partner-http-provider.ts:82, e2e run*.mjs; useHandControl flag needsAttention; cek global-camera-lifecycle (GPU/CPU) setelah semua selesai.
- LS selesai: pakai pose via router MODE_LEVEL_SELECT (countExtendedFingers menghitung jempol -> jempol bisa terbaca 1 jari). Diterima. TINDAK: T3 (Top-3/Fail) & GestureRing pakai fingerCount? -> samakan ke pose/router agar jempol tidak memilih kandidat 1 (worker Z).
- ZA selesai. Sisa: GameStage pakai hand.needsAttention (P2). PredictingScreen masih DwellButton+HandCursor (kursor) -> worker S1/ZB ganti ke GestureRing (Coba lagi/Gambar lagi via pose).
- S1 selesai. Z2 (setelah P2+ZB): GameStage ~230 hapus EnterWorldPopup "Masukkan ke dunia" setelah Lempar + tes gamestage btn-enter-world; DrawingSurface.setInkEnabled(false) mematikan tinta DAN perintah (undo/redo/erase) -> dipakai fase fokus L6 dan stiker S1. Keputusan lead: submit tetap saat keputusan HITL (catatan keputusan; dicatat di dokumen). Predicting screen "Gambar lagi" = telapak (diterima).
- VISUAL: cover tanpa kamera: kartu kamera tetap di tengah, Momo (tengah) menutupinya + bubble menimpa kartu. Perbaikan: saat bangun (tombol), kartu juga morph ke PIP kiri bawah. (probe b-15s.png)

## Jawaban Owner 2026-11-11 (dicatat lead, kata-kata Owner diringkas)
1. Label map Dias: ditunda, nanti Dias yang menyesuaikan.
2. D-20261110-01..10: Owner minta penjelasan dulu (belum SETUJUI).
3. Nama tokoh: tetap **Thinman** (pakai H).
4. Waktu kirim data: saat siswa memilih tebakan Top-3 (gestur 1/2/3, 4 = override, 5 = gambar lagi) dan cincin konfirmasi penuh. Cincin itu sudah cukup, tidak perlu konfirmasi tambahan. Kode saat ini sudah begitu: `applyDecision` (`src/app/state-machine.ts`) memanggil `onDecisionApplied` → `SubmissionAdapter.handleDecisionApplied` → outbox, sebelum "Lempar". Tidak ada perubahan kode.
5. Waktu cover sampai cincin pertama: Owner minta penjelasan.
6. Promosi ke `main`: ditunda.
