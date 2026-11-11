# TASKS — spesifikasi tugas worker (lead, 2026-11-11)

Semua worker: baca dulu `scratchpad/worker-brief-2.md` (+ `worker-brief.md`), lalu `scratchpad/audit2/RECONCILE.md` (revisi terbaru vs big prompt), lalu bagian tugasmu di file ini.

KONDISI POHON: worker gelombang sebelumnya terhenti di tengah jalan. Banyak file milikmu mungkin SUDAH setengah diedit. JANGAN mulai dari nol: jalankan `git status --short` dan `git diff -- <file milikmu>`, baca test baru yang belum ter-track, verifikasi, lanjutkan, perbaiki yang rusak. Bila edit setengah jadi salah arah terhadap spesifikasi ini, perbaiki.

Path relatif ke `frontend/implementation/`. Audit rinci: `scratchpad/audit2/A1-timing.md`, `A2-cover-momo.md`, `A3-cards.md`, `A4-levels.md`, `A5-nui.md`. Revisi Owner: `scratchpad/audit2/REVISI-NUI.md`. Big prompt: `scratchpad/audit2/BIGPROMPT.md`.

Kontrak bersama input tangan (dibuat N1; boleh dipakai worker lain lebih dulu dengan mock di test):
- `src/input/hand-gesture.ts`: `countExtendedFingers(landmarks): 0..5`, `HandPose` ditambah `"one-finger"` dan `"three-fingers"`.
- `src/camera/thumb-tracker.ts` → `useHandGesture()` mengembalikan juga `pose: HandPose` dan `fingerCount: number` (selain `ready, handVisible, thumbUp, pinch, cursor`).
- `src/components/ui/GestureRing.tsx` (dibuat T3): cincin progres generik: props `active: boolean` (pose yang diminta sedang terlihat), `holdMs`, `onConfirm`, `label`, `icon`, `locked?: boolean` (tampil abu-abu + gembok), `lockedProgress?: number` (0..1, misal progres jeda baca), `disabled`, fallback mouse = tahan klik. Latch: harus lepas dulu sebelum bisa konfirmasi lagi. Sampai T3 selesai, worker lain memakai `ThumbConfirm`.

---

## R1 — Hapus TOTAL Level 4
Panduan baris: `A4-levels.md` §1.1 (file dihapus) dan §1.2 (baris dikembalikan ke `777e181`; `git show 777e181:<path>`). Hapus `STAGE_4`, `stage-geometry-final.ts`, `StageArtworkFinal.tsx`, union `| 4`, `SceneIndex` 4, SCRIPT[4]/NUDGE[4]/TONES[4]/STAGE_TEMPLATES[4]/STAGE_SPREADS[4], SIGNPOST 'Pembuktian', plan "4" di `e2e/lib/level-plans.json`, langkah L4 di `e2e/normal-journey.mjs`, test L4 (`*four*`, `*final*`, `level-four*`, `level-summary-final`, `stage-artwork-final`, `stage-geometry-final`, `level-ribbon-four`). JANGAN kembalikan: collider padat L2 + plan L2 baru, pemecahan baris SCRIPT, `shelfLayout` (benar untuk 3 pita), solvability generik 1..3. `FINAL_LEVEL_STAGE` boleh tetap (=3). `LevelIntro.tsx`: hanya baris `getFinalStageGeometry`.
Verifikasi: `grep -rniE "stage-?4|level ?4|bab ?4|pembuktian|STAGE_4|geometry-final|ArtworkFinal" src tests e2e app` kosong. tsc + `vitest run tests/game tests/domain tests/app tests/components/components.test.tsx tests/components/stage-artwork.test.tsx tests/components/level-*.test.tsx`.
Milik: levels.ts, types.ts, mission-config.ts, world-intro-script.ts, momo-script.ts (hanya TONES/stage), stage-geometry*.ts, stage-preview/**, mock-prediction-provider.ts (hanya stage), env.ts (hanya union stage), LevelRibbonBookmark.tsx (hanya L4), route-guard.ts, level-progress.ts, level-summary.ts, hooks/useRouteSync.ts, e2e/lib/level-plans.json, e2e/normal-journey.mjs (hanya L4), test level/stage.

## R2 — Momo tidur hidup, bangun dengan kedip, chat normal
1. `momo-engine.ts`: TIDUR: napas (properti `breath` dibaca di `step()`: scaleY = 1+breath, scaleX = 1−0,6·breath; yoyo 0↔0,015, 2,1 s sine.inOut), APUNG naik-turun 6–8 px dan TILT ±2° lembut (periode ~4 s), sayap turun pelan (`SPECS.Ngantuk.flut` 0,5→0,15; droop 8↔12, 3 s yoyo), anggukan tetap. Mulai di `sleep()`, dibunuh di `set()`/`destroy()`; jangan pakai `P.sx/P.sy`. Hapus gate `calm` (9ba76d2) yang mematikan loop pada reduced motion; reduced = amplitudo ×0,35, tetap bergerak.
2. BANGUN `wake(expression)`: kelopak 0→0,35 (0,15 s)→0 (0,12 s)→0,5 (0,14 s)→0 (0,10 s)→1 (0,30 s back.out), lalu `set(expression)`. Ekspor `MOMO_WAKE_MS`. `MomoAvatar.tsx`: `sleeping` true→false memanggil `wake()`.
3. Zzz (`100-guide.css`, hanya blok Zzz): 3 huruf melayang bertingkat; reduced = 3 huruf opacity lembut 4,8 s (bukan 1 huruf diam).
4. `MomoChat.tsx/.css`: `**tebal**` → `<strong>` (penanda tidak diketik, panjang tanpa penanda, aria tanpa penanda); waktu ketik dan jeda baca tidak lebih cepat dari `d4bbaec` (laporkan sebelum/sesudah); HAPUS skip klik/tap/Spasi/Enter; prop opsional `onAllShown?()` sekali per set baris setelah baris terakhir + jeda baca.
Test fake timer. Milik: momo-engine.ts, MomoAvatar.tsx, MomoChat.tsx/.css, momo-wing.ts, 100-guide.css (blok Zzz), tests/components/momo-*.

## R3 — Cover: kamera, lambaian, Momo, cerita, buka buku
Cover = `src/components/camera/GlobalCamera.tsx`. Milik juga `guide-script.ts` (SATU-SATUNYA editor), BookFlip.tsx, MomoGuide.tsx, 60-global-camera.css, prototype-camera.css, 100-guide.css (hanya `.momo-guide--cover`/posisi), 101-onboarding.css, tests global-camera-*, book-flip.
1. Kamera mati: Momo tidur di kanan. Kamera aktif: kartu video besar TENGAH. Hapus headline "Lambaikan Tanganmu!" + subteks dari tampilan (visually-hidden boleh). Petunjuk: ikon tangan halus. CINCIN PROGRES LAMBAIAN di kartu kamera: terisi mengikuti progres lambaian dari `wave-tracker` (N1 mengekspos `progress` 0..1; sampai ada, baca state yang tersedia). Bantuan bertahap: 8 s tanpa lambaian → bubble Momo tidur "Zzz... coba sapa aku, dong."; 20 s → tombol kecil "Bangunkan Momo". Tanpa kamera: tombol "Bangunkan Momo" tetap.
2. Lambaian → SATU timeline (batal saat unmount; lambaian kedua diabaikan): `sleeping=false` (kedip `MOMO_WAKE_MS`, lokal 810 ms bila belum diekspor), kaget+kepak; ±0,75 s: KARTU KAMERA mengecil + meluncur ke PIP KIRI BAWAH (`bottom:24px; left:24px`, 150×120; pastikan semua halaman konsisten kiri bawah dan tidak terpotong), 0,8 s power2.inOut, `transform` translate+scale, video tetap hidup, sekali; lalu mode floating tanpa loncatan. Bypass `be7c8b2` tetap untuk layar lain; perbarui `global-camera-stationary.test.tsx` (izinkan tepat satu morph). Bersamaan: Momo melayang dari kanan ke TENGAH, 250→320 px, 1,1 s, lalu dadah. Teks cover memudar. Dialog mulai setelah Momo tiba (±2000 ms).
3. Copy cover (guide-script blok cover): "Aku Momo, gambar satu-satunya yang hidup di dunia Sketchbook Universe." / "Aku barusan menemukan **{nama}**. Kayaknya dia butuh bantuanmu supaya bisa hidup juga sepertiku." / "Yuk, antar dia ke tempat yang tepat." ({nama} dari `character-tokens.ts`). Bubble di samping Momo, tidak menutup wajah/kamera, terbaca di 1280×720 dan 390×844.
4. Setelah baris terakhir + jeda baca: `ThumbConfirm holdMs={1000}` "Aku mengerti" (`extrasFrom="last"`). Buku TIDAK otomatis; `onConfirm` → BookFlip.
5. BookFlip 0,9 s juga reduced (tanpa skew boleh, daun tetap membuka ke atas, durasi sama); navigasi di `onMidpoint`; Momo cover memudar 0,3 s setelah midpoint.
6. Hapus blanket `prototype-camera.css:266` (`animation-duration:.01ms!important`); aturan spesifik.
7. Copy penggaris/tutorial di guide-script: biarkan; R4/R5 punya modul copy sendiri.

## R4 — Tiga kartu tutorial
Baca `A3-cards.md` + tabel kartu `A1-timing.md`. Milik: TutorialBrochure.tsx/.css, file baru di onboarding/, `src/domain/tutorial-script.ts`, 99-tutorial.css, PinchRing.*, `useDrawingSurface.ts` (minimal: callback opsional `onToolUsed?(tool)` dipanggil hanya bila aksi benar-benar mengubah state; undo/redo/eraseAt mengembalikan boolean), tests tutorial-*, pinch-ring.
1. TIMING: deal/spread dan buka/flip/bifold = nilai `9f9d35d` (0,95 s; cek `git show 9f9d35d:implementation/src/components/onboarding/TutorialBrochure.tsx`). TUTUP/menaruh kartu ~1,0 s `power2.out`, jeda sebelum kartu berikut membuka ~1,1 s. Hapus `timeScale(6)`. Tidak ada jalur cepat.
2. UKURAN brosur lebih besar: `computeLayout()` gw 320–480 px, pw ≈1,6·gw, oh 480–720 (≈ vh·0,76); margin bawah ≈22% vh agar tidak menyenggol kamera kiri bawah dan Momo kanan bawah.
3. GATE per kartu (reducer kecil, satu sumber event, timer batal saat unmount): opening → explaining → practicing → reading(10 s) → ackEligible → closing → next. Ekspor `CARD_READ_MS = 10000`. Cincin JEMPOL selalu TERLIHAT tetapi TERKUNCI (abu-abu + gembok) sebelum eligible, dengan indikator progres jeda baca yang jelas (mis. cincin abu terisi pelan + teks "Baca dulu, ya"); setelah aksi wajib selesai DAN 10 s → aktif. 10 s tidak menutup kartu. Kartu 1–2 jempol 1 s "Lanjut", kartu 3 jempol 2 s "Mulai Level 1". Tidak ada tombol web kotak "Lanjut 🔒". PinchRing bukan tombol lanjut. Pakai `GestureRing` bila sudah ada (prop `locked`, `lockedProgress`), bila belum: `ThumbConfirm` + lapisan terkunci milikmu.
4. KARTU 1 seret cubit: hook `useHandGesture(mode === "camera")` di `WalkPlayground`: saat `pinch` true simpan jangkar `cursor.x` + posisi Thinman; perubahan `cursor.x` selama cubit → `place(next)` proporsional (halus); lepas = berhenti; jalan dianimasikan saat bergerak; `next >= WALK_END` → selesai, Thinman berhenti di bendera, Momo "{nama} sampai!", tidak bisa digeser lagi. Fallback seret mouse/sentuh + panah kiri/kanan (tanpa petunjuk keyboard). Hapus WALK_MS/PINCH_HOLD_MS auto-jalan. Copy hint: "Cubit dan geser {nama} ke kanan sampai menyentuh bendera."
5. KARTU 2 "Pijakan Aman vs Bahaya" (duri, tanpa pisau): gate baca 10 s.
6. KARTU 3: kanvas latihan pakai `DrawingSurface` + `useDrawingSurface` (cubit coret, kepal hapus ukuran TETAP, dua jari mundur, telapak maju; HANYA cubit yang menggores). Status alat menyala hanya oleh aksi nyata. Empat alat → 10 s → jempol 2 s. Toolbar fallback mouse. Tanpa pengatur ukuran penghapus. Cincin pakai `externalThumbUp` dari pose driver, jangan tracker kedua.
7. Tidak ada lompatan kartu (latch). Copy di `tutorial-script.ts`. Laporkan langkah harness E2E baru (testid, urutan, waktu, hook uji).

## R5 — Penggaris nomor absen
Milik: StudentRulerSelector.tsx/.css, file baru di onboarding/, `src/domain/ruler-script.ts`, tests ruler-*. Jangan edit MomoGuide/MomoChat/momo-engine/guide-script (R3 menambah `className` opsional ke MomoGuide; bila belum ada, bungkus dengan elemenmu).
1. Hanya angka + penggaris; H1 visually-hidden.
2. DEFAULT NOMOR 1 untuk siswa baru (tidak ada nomor tersimpan): posisi 0, value 1. Nomor tersimpan dari sesi sebelumnya: tampilkan nomor itu.
3. Fase A fokus Momo: scrim gelap ±0,5, penggaris terkunci, Momo BESAR tengah (±320 px) "Sebelum kita masuk, pilih nomor absenmu dulu, ya."; setelah kalimat + jeda: scrim pudar 0,4 s, Momo mengecil ke pojok kanan 0,6 s (±150 px). Tidak dipersingkat pada reduced motion.
4. Fase B: Momo kecil kanan, terlihat; bubble tidak menutup angka/handle. Tidak ada pertanyaan sebelum `hasInteracted` (hapus `armSettle()` saat mount). Sebelum digeser Momo menampilkan panduan umum tanpa cincin.
5. HANDLE: kotak pegangan tactile papercraft ~48×70 px dengan garis grip di penanda tengah (`student-ruler-handle`), gaya kit Can.
6. Fase C: setelah digeser dan diam 0,6 s: "Benar ini nomor absenmu, {n}?" + `ThumbConfirm holdMs={2000}` setelah kalimat. Geser lagi = kembali ke B. Jempol → `onConfirm(n)` sekali.
7. NUI: cubit + gerak horizontal `cursor.x` menggeser penggaris real-time; lepas = snap ke angka terdekat. Fallback mouse/sentuh/keyboard/roda tanpa petunjuk keyboard.
8. Prop opsional `classStatus?: "none"|"joining"|"joined"|"failed"`: "none"/"failed" → setelah konfirmasi Momo menambah "Nomormu kusimpan di perangkat ini. Kelas belum terhubung." Laporkan perubahan yang perlu lead buat di SketchbookApp.

## N1 — Pipeline input: hitung jari, pose, lambaian, cold start, intent gating
Milik: src/input/hand-gesture.ts, mediapipe-input.ts, hand-stroke-pipeline.ts, smoothing.ts, types.ts, index.ts, src/camera/thumb-tracker.ts, wave-tracker.ts, hand-landmarker.ts, hand-cursor-store.ts, src/hooks/useHandGesture.ts, file baru `src/input/gesture-mode.ts`, `src/camera/landmarker-warmup.ts`, tests/input/** (kecuali gameplay-*), tests/camera/**.
1. `countExtendedFingers(landmarks)` murni (0..5; jempol dihitung dengan aturan terpisah yang jujur) + pose `one-finger`, `three-fingers` di `classifyHandPose` tanpa merusak pose lama (matriks test pose sintetis: tiap pose hanya dirinya sendiri; histeresis/voting yang ada tetap).
2. `HandGestureState` + `pose` + `fingerCount` (stabil: voting beberapa frame), terekspos lewat `useHandGesture`. Kompatibel dengan konsumen lama.
3. Lambaian (`wave-tracker.ts`): lebih responsif untuk lambaian wajar di webcam biasa (toleran frame hilang karena blur: jangan reset seluruh progres saat 1–3 frame hilang; ambang amplitudo/jumlah ayunan dikalibrasi wajar, dokumentasikan angka lama vs baru) dan ekspos `progress` 0..1 (subscribe) untuk cincin lambaian. Satu lambaian sah = sekali.
4. Cold start: `landmarker-warmup.ts`: preload model + inisialisasi HandLandmarker sedini mungkin setelah izin kamera (atau saat idle di cover) + satu inferensi dummy (warmup) agar shader terkompilasi; satu instance dipakai bersama pembaca lain (jangan dua model bersamaan); status delegate GPU/CPU dan kesiapan dipublikasikan (tanpa memblokir frame). Jangan memanggil kamera sebelum izin.
5. INTENT GATING: verifikasi dengan test bahwa di kanvas HANYA pose `pinch` yang menggores; `thumb-up`, `open-palm`, `split-palm`, `one-finger`, `three-fingers` tidak pernah memulai/menambah coretan (termasuk saat transisi pose).
6. `gesture-mode.ts`: router mode tunggal sesuai REVISI §18C (MODE_CANVAS_DRAWING, MODE_CANVAS_PREDICT_TRIGGER, MODE_CANVAS_STAMP_READY, MODE_GAMEPLAY_PLACEMENT, MODE_GAMEPLAY_EXPLORATION_CAM, MODE_TOP3_PANEL, plus MODE_DIALOG_ACK, MODE_TUTORIAL, MODE_COVER_WAVE, MODE_LEVEL_SELECT, MODE_FAIL): fungsi murni `allowedActions(mode)` → peta pose→aksi; dipakai worker lain lewat impor. Test: tiap mode hanya aksinya.
Laporkan API final ke lead.

## T3 — Pilihan dengan jumlah jari + cincin (tanpa kursor): Top-3 dan layar gagal
Milik: src/components/ui/GestureRing.tsx (+css, baru), src/components/prediction/Top3Panel.tsx, MomoGuessChat.tsx, Top3PredictionPopup.tsx, src/components/decision/DecisionPanel.tsx/.css, src/components/game/FailOverlay.tsx, tests top3-*, momo-guess-chat, nui-decision-panel, nui-stage-fail-header, gesture-ring (baru).
Kontrak: lihat atas (pakai `useHandGesture().fingerCount/pose`; mock di test bila N1 belum selesai).
1. `GestureRing` sesuai kontrak di atas, kontras tinggi, target ≥ 56 px, latch.
2. Top-3 (TANPA kursor; tools kanvas mati): kandidat 1/2/3 dipilih dengan 1/2/3 jari ditahan sampai cincin penuh (#1 = Terima, #2/#3 = Pilih lain). "Bukan ini" = telapak terbuka (5 jari) + cincin → daftar label lain; daftar itu dipilih dengan jumlah jari 1..N (maks 5) + cincin. "Gambar lagi" = cubit ditahan + cincin (pemulihan, terpisah visual). Ikon jari di tiap kandidat. Logika keputusan tidak berubah; mouse klik tetap.
3. Layar gagal: 1 jari = "Coba lagi", 2 jari = "Geser objek", 3 jari = "Gambar lagi"; cincin per tombol (1,5–2 s). Ikon jari di tombol.
4. Ganti `DwellButton` kursor di dua layar ini dengan GestureRing (DwellButton boleh tetap ada untuk layar lain).
5. Test jsdom + fake timer: tiap pose hanya memicu targetnya; tahan < holdMs tidak memicu; latch; pose lain diabaikan; klik fallback.

## G2 — Kontrol Thinman dengan sudut telunjuk + bar kontrol mode kamera
Milik: src/input/gameplay-gesture.ts, gameplay-hand-driver.ts, src/components/game/GameplayControls.tsx, DirectionButton.tsx, ControlGuide.tsx, game-directions.ts, hooks/useHandControl.ts, hooks/useGameplayInput.ts, gameplay-guide.css, tests gameplay-*, gamestage-*, control-guide*.
1. Kemudi sudut (REVISI §18B): sudut telunjuk (pangkal → ujung, dicerminkan) θ: ~90° (±15°) = lompat di tempat; 45–75° = lompat + kanan; 105–135° = lompat + kiri; horizontal (<30° atau >150°) = jalan kanan/kiri; di luar itu = berhenti. Fungsi murni `steerFromAngle(theta)` + histeresis. Angka = asumsi awal, ekspor sebagai konstanta.
2. Bar bawah mode kamera: TANPA label keyboard `[A] [D] [Spasi] [Klik Kiri + Geser]`; tampilkan widget speedometer/kompas sudut real-time + ikon gestur. Mode fallback: label keyboard seperti sekarang. Hapus chip "(uji coba)" dan label "NUI NOT VERIFIED" yang tampil ke siswa (`useHandControl.ts:44,62`).
3. Kontrol "Geser objek" (cubit + cincin) dan "Putar" (telapak + cincin, di kanan Geser objek) DITAMPILKAN di bar sebagai affordance; aksi aslinya dikerjakan L2 (penempatan): sediakan props `onMoveRequest`, `onRotateRequest`.
4. ControlGuide teks sesuai mode. Test: sudut sintetis → input benar; bar kamera tanpa label keyboard; fallback dengan label.

## L1 — Intro level (LevelIntro)
Milik: src/components/level/LevelIntro.tsx (kecuali baris getFinalStageGeometry milik R1), CSS intro, tests level-intro*.
1. Tanpa hening: Momo langsung menyambut setelah transisi buka level selesai.
2. Backdrop gelap rgba(0,0,0,.55) di panggung selama cerita; Momo, bubble, dan objek yang sedang dijelaskan tetap terang.
3. Momo 280–300 px, efek maju mendekat. Gerak GSAP: kalimat tentang Thinman → Momo melayang dekat Thinman (tebing kiri); kalimat rintangan/tujuan → Momo meluncur ke kanan menunjuk jurang dan papan tujuan.
4. Katalog pilihan benda (`intro-cards`) DIHAPUS dari intro (dipindah ke layar kanvas oleh L6; pastikan datanya tetap bisa diambil dari level).
5. Jempol "Aku mengerti" hanya setelah baris terakhir + jeda (`extrasFrom="last"`/`onAllShown`). Tanpa jempol Momo tidak naik.
6. Naik ke awan setelah jempol: kamera panning vertikal melewati `CloudBand`, Momo ikut naik, berhenti mantap di kanvas; tanpa dissolve/fade instan; durasi normal (cerita intro 1500 ms dari sebelum `8926992`), juga pada reduced motion.
Test fake timer.

## L6 — Layar kanvas (DrawingScreen)
Milik: src/components/drawing/DrawingScreen.tsx, hooks/useMomoCompanionLayout.ts, momo-cue.ts, drawing-finish.css, file baru di drawing/, tests drawing-* (kecuali drawing-actions-input-mode milik L5 lama: boleh disesuaikan), drawing-momo-motion.
1. FASE FOKUS saat tiba di kanvas: backdrop gelap; Momo mengulas singkat 4 alat (cubit coret, kepal hapus, dua jari mundur, telapak maju) sambil menyorot toolbar kanan; lalu menampilkan rekomendasi benda level (katalog dari level, dipindah dari intro); jempol "Mulai Menggambar" (cincin) menutup backdrop dan mengaktifkan kanvas. Kanvas tidak menerima coretan selama fase fokus.
2. Momo POJOK KIRI ATAS selama menggambar, menebak, hasil; tidak bergeser ke kanan/tengah; emphasis = membesar sedikit (170→190 px).
3. Top-3 tidak pernah muncul sebelum jempol selesai-gambar (sudah benar; jaga).
4. IDLE 10 s (konstanta `IDLE_PROMPT_MS`): indikator jempol selesai di kanan bawah PUDAR saat aktif menggambar/menghapus; 10 s tanpa aktivitas → indikator menyala jelas + animasi "tuwing" 3 s DAN Momo bertanya "Sudah selesai gambarnya? Kalau sudah, acungkan jempol, ya." Tanpa prediksi otomatis. Aktivitas lagi → pudar, timer ulang. Reduced motion: tanpa pantulan, tetap menyala.
5. Prop `handMissing` ke `DrawingActions` (true bila tidak ada tangan di frame > 15 s; jangan pakai `handPose === "none"`).
Test fake timer.

## L2 — Penempatan: geser, putar 90°, taruh
Milik: src/input/arbiter.ts, src/input/hand-rotation.ts (baru, opsional), file penempatan di src/components/game/ (PlacementControls dll.), hooks penempatan, src/game/runtime/creations.ts, creation-renderer.ts, src/game/creation-store.ts, integrated-scene.ts (bagian objek buatan), placement-rules, tests placement-*, creation-*, arbiter. GameStage.tsx: perubahan minimal untuk memasang komponen (sebutkan).
1. MODE_GAMEPLAY_PLACEMENT (stiker baru mendarat): "Taruh di sini" = jempol + cincin 2 s; "Gambar lagi" = telapak terbuka + cincin; selama cubit dipegang setelah cincin cubit penuh, objek mengikuti tangan; putus < 150 ms tidak menjatuhkan; lepas stabil = posisi baru (masih fase placement sampai "Taruh di sini").
2. MODE_GAMEPLAY_EXPLORATION_CAM (objek sudah ditaruh, sebelum/selama bermain sesuai alur yang ada): "Geser objek" = cubit + cincin → pegang → lepas = taruh; "Putar" = telapak terbuka + cincin → putar 90° (0/90/180/270), collider tukar w↔h dan aturan legal placement tetap benar.
3. Simpan `angle` di data creation; render gambar berputar; level tetap solvable pada 0° (`tests/game/level-solvability.test.ts`). Tombol fallback mouse + Q/E tetap (tanpa petunjuk keyboard di layar).
Test landmark/pose sintetis + fake timer.

## L3 — Prediksi: label, provenance, mock tidak masuk data kelas
Milik: src/prediction/** (kecuali baris stage di mock-prediction-provider.ts), src/api/submission-adapter.ts, submission-client.ts, http-client.ts, classroom-client.ts (hanya getModelInfo), src/config/demo.ts, env.ts (hanya prediksi), contracts/LABEL_MAP_PROPOSAL.md (baru), tests/prediction/**, tests/api/**.
1. `label-map.ts`: 20 kategori `config.py` → `displayName` Indonesia + `gameLabel` (padanan jujur atau null). Usulan kontrak `contracts/LABEL_MAP_PROPOSAL.md` + daftar benda level yang tidak dikenal model.
2. Partner provider: pemetaan (urutan + confidence asli, `modelLabel` disimpan), validasi `contracts/openapi.json`, timeout, retry terbatas, galat Indonesia jujur, in-flight guard.
3. `source: "model"|"demo"`; pita demo hanya saat demo.
4. Demo → tidak dikirim ke `/api/submissions`. Fixture + `tests/api/contract-fixtures.test.ts` tetap hijau.
5. Token sesi tidak ke endpoint prediksi beda origin.
6. `getModelInfo` deprecated, tidak dipanggil runtime.

## L4 — Penutup: portal, rekap netral, tempat kuis
Milik: src/components/ending/**, src/domain/ending-script.ts, src/config/quiz-flag.ts, contracts/QUIZ_TOGGLE_PROPOSAL.md, CSS baru, tests ending-*, tests/config/**.
1. Portal (±6–8 s, kit Can) → Thinman masuk, keluar hidup → Momo senang → pesan AI 2–3 baris → jempol 1 s "Aku mengerti" → rekap. Tidak dipersingkat pada reduced motion.
2. Rekap netral dari data tercatat (gambar asli, tebakan pertama Momo + persen, keputusan, label akhir, perilaku; jumlah per jenis keputusan, gambar lagi bila tercatat, tebakan pertama yang diubah). Tanpa skor/kata penilai; data kosong → "tidak tercatat".
3. `isQuizEnabled()`: server → `NEXT_PUBLIC_QUIZ_ENABLED` → false. Usulan kontrak toggle admin di `contracts/QUIZ_TOGGLE_PROPOSAL.md`. ON → Momo mengantar → placeholder "Kuis belum tersedia". OFF → selesai.
4. Akhir: "Kembali ke sampul" (gestur + klik), tanpa loop otomatis. Props `CenterOfPage` lama kompatibel.

---
# GELOMBANG 2 (setelah M1 sebagian besar selesai)

## I1 — Sambungan cover: cincin lambaian, warmup model, morph rapi
Milik: src/components/camera/GlobalCamera.tsx, app/styles/101-onboarding.css (blok cincin lambaian), tests global-camera-*.
1. Cincin lambaian: N1 menyediakan `WaveTracker.progress` dan `subscribeProgress(cb) -> unsub` (bukan `onProgress` di options). Sambungkan agar cincin terisi sesuai progres nyata; lepas langganan saat unmount/stop. Test dengan tracker tiruan.
2. Cold start: panggil `warmHandLandmarker({...})` dari `src/camera/landmarker-warmup.ts` saat cover idle setelah izin kamera (tanpa memblokir UI; satu kali). Tampilkan status kesiapan secara halus hanya bila gagal (pesan jujur + fallback), tidak memamerkan teks teknis.
3. Morph kartu kamera ke PIP: sekarang scaleX/scaleY tidak seragam sehingga video meregang 0,8 s. Ubah ke skala seragam + translate (atau clip/rounded mask) agar video tidak terdistorsi; durasi tetap 0,8 s.
Test fake timer.

## RT — Route kanvas terpisah + wiring app (file lead didelegasikan)
Milik: src/app/SketchbookApp.tsx, src/app/route-guard.ts, src/app/hooks/useRouteSync.ts, src/app/hooks/useRouteState.ts, src/app/hooks/useLevelSession.ts, src/app/state-machine.ts, app/canvas1/page.tsx, app/canvas2/page.tsx, app/canvas3/page.tsx (baru; ikuti pola app/level1/page.tsx), src/components/shared/DevBanner.tsx, tests/app/**, tests route terkait.
1. Route `/canvas1..3` (REVISI §17, §18C): saat naik ke awan dari `/levelN` URL menjadi `/canvasN` lewat `history.pushState` tanpa reload/flash; turun kembali (setelah stiker dilempar) → `/levelN`. Refresh di `/canvasN` membuka kanvas level itu bila terbuka (cek kunci) atau mengarah aman ke `/levels`. Tombol Back browser tidak merusak state. Hanya tiga level. Static export (`next build` output export) harus tetap bekerja (cek `next.config` dan pola halaman yang ada).
2. `StudentRulerSelector` prop `classStatus`: kirim "joined" bila sesi kelas tergabung, "joining" saat proses, "failed" bila join gagal, "none" bila tidak ada token kelas (lihat `useClassroomSession`). Join tidak lagi ditelan diam-diam.
3. Akhir permainan: `chooseEnding("finish")` sekarang memunculkan PageEdgeWalkers (easter egg tak diminta). Hapus pemicu itu; layar akhir CenterOfPage yang baru sudah menyediakan "Kembali ke sampul". Pastikan "Kembali ke sampul" kembali ke cover dengan rapi.
4. `useLevelSession.recapFromFlow`: isi `firstGuessConfidence` (confidence kandidat #1 tebakan pertama per level) dan `redrawCount` bila datanya ada di snapshot flow; jangan mengarang.
5. `state-machine.ts:~262`: `resolveBehavior` memakai `candidate.gameLabel` hasil pemetaan label (null = unresolved), bukan `finalLabel` (displayName). Untuk override dari daftar level, label level dipakai langsung.
6. `DevBanner.tsx`: pita demo memakai `showDemoNotice(source)` dari `src/config/demo.ts` (provenance prediksi), bukan mode global.
7. Investigasi laporan Owner "hening ±10 detik saat masuk level" (REVISI §12.1): LevelIntro hanya memiliki jeda 1,5 s + buka buku 0,9 s; cari sumber jeda lain di SketchbookApp/entryHold/useRouteSync/LevelEntryScreen (mis. timer, menunggu pita, menunggu promise). Perbaiki penyebab yang terbukti dengan test; laporkan bila tidak ditemukan.
Test untuk tiap butir.

## LS — Pilih bab dengan 1/2/3 jari
Milik: src/components/level/LevelRibbonBookmark.tsx, level-nui.css, src/app/screens/LevelEntryScreen.tsx, src/components/ui/Icon.tsx (hanya menambah ikon jari bila belum ada; atau pakai `FingerGlyph` dari GestureRing.tsx), src/domain/world-intro-script.ts (hanya copy nudge), tests level-*.
1. Ikon `arrow-down` di lingkaran bawah tiap pita → ikon jari: Bab 1 satu jari, Bab 2 dua jari, Bab 3 tiga jari (pakai `FingerGlyph` yang diekspor `GestureRing.tsx` bila cocok).
2. Gestur: `useHandGesture().fingerCount` 1/2/3 ditahan sampai cincin penuh (pakai `GestureRing`, ±1,5 s) → memilih bab itu (animasi tarik pita yang ada dimainkan). Bab terkunci: tidak bisa dipilih; tampilkan cincin terkunci + Momo menjelaskan singkat. Tarik pita mouse tetap (fallback).
3. Copy Momo di daftar level: "Tunjukkan 1, 2, atau 3 jarimu ke kamera buat memilih bab yang mau kamu mainkan!" (mode kamera); mode fallback tetap ajakan menarik pita. Pengguna baru diarahkan ke Bab 1 (sudah ada; pertahankan).
4. `world-intro-script.ts` nudge "Kamu mau bikin yang mana?" merujuk kartu benda yang sudah dipindah ke kanvas: ubah agar sesuai (Momo mengajak naik ke langit untuk menggambar), tanpa mengubah baris cerita lain.
Test fake timer + stub pose.

## FX — Perbaikan kecil lintas file (dari laporan worker)
Milik: src/components/game/GameStage.tsx (hanya baris chip), tests/input/hand-drivers-resilience.test.ts, src/components/ui/nui-actions.css, app/styles/104-hitl.css (hanya aturan mati), src/components/prediction/EnterWorldPopup.tsx (hanya copy), MomoGuessChat.tsx (hanya komentar), e2e/recovery-paths.mjs dan e2e/record_full_journey.mjs (hanya string "Gambar ulang").
1. `GameStage.tsx` ~baris 204: hapus " (uji coba)" dari `<InputStatusChip>{hand.status} (uji coba)</InputStatusChip>`; chip status teknis jangan tampil ke siswa di mode kamera yang berfungsi (tampilkan hanya bila ada masalah kamera/tangan).
2. `tests/input/hand-drivers-resilience.test.ts`: dua kasus gagal karena kemudi sudut baru (G2): "applies hysteresis ... 0.35 / 0.40" dan "enableJump maps a held pinch to jump; default does not". Tulis ulang terhadap perilaku baru memakai `pointingHand` dari `tests/input/gameplay-fixtures.ts` (jangan hapus cakupan; jangan ubah kode produksi).
3. `nui-actions.css`: hapus aturan `.dwell-btn` untuk fail/primary yang tidak dipakai lagi (FailOverlay pindah ke FailOverlay.css); pastikan test `nui-*`/`dwell-*` tetap hijau.
4. `104-hitl.css`: hapus aturan mati `.center-page__overview`, `__epilog`, `__choice`, `__meet`, `__thinman` bila memang tidak dipakai (grep dulu).
5. Copy: "Gambar ulang" → "Gambar lagi" di EnterWorldPopup.tsx:35, komentar MomoGuessChat.tsx:4, e2e/recovery-paths.mjs, e2e/record_full_journey.mjs.
Jalankan `npx vitest run` penuh di akhir dan laporkan setiap kegagalan per nama (yang bukan milikmu cukup dilaporkan).

---
# GELOMBANG 3

## P2 — Gestur penempatan (sisa L2)
Milik: file penempatan di src/components/game/ (PlacementControls dll.), hooks/usePlacement.ts, hooks/useStageActions.ts, src/components/game/GameStage.tsx, src/input/gameplay-hand-driver.ts (hanya menambah `pose` ke frame gameplay), tests placement-*, gamestage-*, creation-*.
Sudah ada (L2): rotasi 90° + footprint + legalitas, `rotate()` di controller, props `onMoveRequest/onRotateRequest` dari bar kontrol G2. Sudah ada: `GestureRing` (T3), router `src/input/gesture-mode.ts` (N1: `MODE_GAMEPLAY_PLACEMENT`, `MODE_GAMEPLAY_EXPLORATION_CAM`, `actionFor(mode, pose)`).
1. Frame gameplay membawa `pose` (stabil, dari classifier N1). Mode tidak diturunkan dari jumlah jari mentah (jempol bisa terhitung jari).
2. MODE_GAMEPLAY_PLACEMENT: "Taruh di sini" = jempol + GestureRing 2 s; "Gambar lagi" = telapak terbuka + cincin; cubit + cincin 1,5 s → objek mengikuti tangan; putus < 150 ms tidak menjatuhkan; lepas = posisi baru (tetap fase placement sampai Taruh).
3. MODE_GAMEPLAY_EXPLORATION_CAM: "Geser objek" = cubit + cincin → pegang → lepas = taruh; "Putar" = telapak terbuka + cincin → `rotate()` 90°; pesan bila tidak legal.
4. GameStage cabang `!integrated` menampilkan "FALLBACK pointer/keyboard — BUKAN NUI TERVERIFIKASI" ke siswa: hapus dari tampilan siswa (boleh komentar/atribut data untuk debug).
5. Tombol mouse/keyboard tetap sebagai fallback. Test pose sintetis + fake timer.

## ZA — Penyelarasan pose dan copy
Milik: src/components/ui/GestureRing.tsx, src/components/prediction/Top3Panel.tsx, MomoGuessChat.tsx, PredictingScreen.tsx, src/components/decision/DecisionPanel.tsx, src/components/game/FailOverlay.tsx, src/domain/momo-script.ts (hanya copy "Gambar ulang"), src/prediction/partner-http-provider.ts (hanya copy :82), src/components/game/hooks/useHandControl.ts (hanya flag), e2e/run.mjs, e2e/run-standalone.mjs, e2e/run_full_journey.mjs (hanya string), tests/components/nui-contrast.test.ts, tests top3-*, nui-decision-panel, nui-stage-fail-header, gesture-ring.
1. Pemilihan 1/2/3 jari di Top-3 dan layar gagal: pakai `pose` lewat router (`actionFor(MODE_TOP3_PANEL|MODE_TOP3_ALTERNATIVES|MODE_FAIL, pose)` dari `src/input/gesture-mode.ts`), BUKAN `fingerCount` mentah, karena `countExtendedFingers` ikut menghitung jempol sehingga jempol bisa memilih kandidat 1. Untuk daftar label 4 pilihan, bila router belum punya pose empat jari, gunakan `fingerCount` hanya bila `pose` bukan `thumb-up`. Test: jempol tidak pernah memilih kandidat/aksi; 1/2/3 jari memilih yang benar.
2. "Gambar ulang" → "Gambar lagi" di PredictingScreen.tsx (34, 47, 51), momo-script.ts (34, 43), partner-http-provider.ts:82, dan regex/string di e2e run*.mjs.
3. `nui-contrast.test.ts` "locked advance": kunci kartu kini `.tut-thumb--locked` (wajah #e4dfd2, gembok #5b564c); ganti asersi ke aturan itu (tetap uji kontras ≥ 3:1).
4. `useHandControl.ts`: ekspos `needsAttention: boolean` (true bila kamera/tangan bermasalah) agar chip di GameStage tidak lagi mencocokkan teks; (P2 akan memakainya di GameStage).
Test untuk tiap butir.

## S1 — Siklus stiker di kanvas: "Lempar" dan "Gambar lagi", tanpa popup kursor
Milik: src/components/drawing/DrawingScreen.tsx, src/components/game/EnterWorldPopup.tsx, src/components/prediction/PredictingScreen.tsx, src/components/drawing/ (file baru, mis. StickerStamp.tsx), src/app/SketchbookApp.tsx (hanya wiring yang perlu), CSS baru, tests drawing-*, enter-world-*, predicting-*. JANGAN sentuh GameStage.tsx dan file penempatan (worker P2).
Baca REVISI-NUI.md §18A dan §18C, RECONCILE.md baris "Setelah keputusan".
1. Setelah keputusan HITL (Terima/Pilih lain/Bukan semua) berlaku: gambar asli siswa ditampilkan sebagai STIKER di atas kanvas (goresan asli + label akhir, gaya kit Can, tanpa kotak generik). Popup terpisah `EnterWorldPopup` ("Masukkan ke dunia") tidak lagi dipakai untuk alur ini (boleh dihapus bila tidak dipakai lain; cek pemakai).
2. Tombol utama "Lempar" = jempol + `GestureRing` 2 s (mode `MODE_CANVAS_STAMP_READY`); "Gambar lagi" di kiri bawah = telapak terbuka + `GestureRing` 2 s → hapus stiker, kembali ke kanvas untuk menggambar ulang. Kuas mati di mode ini. Klik mouse (tahan) tetap fallback.
3. "Lempar" → animasi stiker terlepas dari kanvas dan meluncur turun (±1,2 s; tidak dipersingkat pada reduced motion; kurangi rotasi saja) lalu alur yang sudah ada melanjutkan ke dunia/penempatan (route kembali `/levelN` sudah ditangani RT lewat state). Tanpa flash putih.
4. `PredictingScreen.tsx`: ganti DwellButton + HandCursor (kursor) dengan GestureRing: "Coba lagi" = 1 jari, "Gambar lagi" = telapak terbuka (lewat `actionFor`); klik tetap fallback.
5. Test fake timer + stub pose: stiker muncul setelah keputusan; jempol 2 s → lempar sekali (latch); telapak → kembali menggambar; kuas tidak menggores di mode stiker; prediksi tidak dipanggil ulang.

## ZB — Penghapus ukuran tetap di tutorial; redo dengan telapak terbuka
Milik: src/input/index.ts, src/input/hand-stroke-pipeline.ts, src/input/eraser.ts, src/input/hand-gesture.ts (hanya `drawingCommandFor`), src/components/drawing/gesture-commands.ts, src/components/onboarding/TutorialBrochure.tsx (hanya meneruskan opsi), src/components/drawing/hooks/useDrawingSurface.ts (hanya meneruskan opsi), tests/input/**, tests/components/tutorial-*, drawing-gesture-commands.
1. `DrawingSurfaceOptions.fixedEraser?: boolean`: bila true, radius penghapus tetap default (roda mouse, `[`/`]`, dan pengatur dua tangan tidak mengubahnya; lingkaran ukuran tidak tampil). Tutorial kartu 3 memakai `fixedEraser: true`. Layar gambar level tidak berubah perilakunya kecuali bila Owner memutuskan lain (default false).
2. Redo: pose `open-palm` (telapak terbuka) DAN `split-palm` sama-sama memicu "Maju" di kanvas (Owner menyebut telapak terbuka; kode lama memakai telapak terbelah). Telapak tetap tidak pernah menggores dan tidak menghapus. Pastikan lambaian di cover (sapuan pergelangan) tidak terpengaruh. Update ikon/tooltip toolbar hanya bila teksnya menyebut "terbelah" (milik ZB bila di DrawingToolbar? tidak: laporkan saja).
3. Test: fixedEraser menahan radius terhadap roda, `[ ]`, dua tangan; open-palm tahan ≥300 ms → redo sekali; split-palm tetap redo; open-palm tidak menggores/menghapus.

## Z2 — Integrasi akhir sebelum E2E
Milik: src/components/game/GameStage.tsx, src/components/game/GameplayControls.tsx, src/components/game/StageHeader.tsx, src/input/index.ts (hanya `setInkEnabled`), src/input/hand-stroke-pipeline.ts (hanya gerbang), src/components/drawing/hooks/useDrawingSurface.ts (hanya gerbang perintah), src/components/drawing/DrawingScreen.tsx (hanya memanggil gerbang), src/input/gesture-mode.ts (hanya baris open-palm), tests terkait (gamestage-*, gesture-mode, drawing-*, sticker-stamp).
1. `GameStage.tsx` (~baris 230): `EnterWorldPopup` ("Masukkan ke dunia") tidak lagi muncul setelah "Lempar" di kanvas (S1) — stiker langsung jatuh ke dunia dan masuk penempatan. Perbarui test yang memakai `btn-enter-world`. `EnterWorldPopup.tsx` boleh dihapus bila tidak ada pemakai lagi.
2. `DrawingSurface.setInkEnabled(on: boolean)` (src/input/index.ts): saat false, tangan dan pointer TIDAK menggores dan TIDAK menjalankan perintah undo/redo/erase (gerbang juga di `useDrawingSurface` untuk perintah dari pose). Dipakai fase fokus L6 dan stiker S1 (S1 sudah memanggil `setInkEnabled(false)`; pastikan sambungannya nyata). Test: fase fokus dan stiker → cubit/telapak/dua jari tidak mengubah kanvas.
3. `GameplayControls.tsx` cabang kamera: tombol klik "Geser objek"/"Putar" duplikat dengan cincin `ExplorationRings` (P2) → di mode kamera tampilkan hanya cincin; tombol klik hanya di fallback.
4. `gesture-mode.ts`: `MODE_CANVAS_DRAWING` dan `MODE_TUTORIAL` tambahkan `"open-palm": "redo"`; perbarui `tests/input/gesture-mode.test.ts` (baris ~38, ~46).
5. `StageHeader.tsx` "Gambar lagi" klik: di mode kamera jangan bersaing dengan gestur telapak (Putar). Biarkan sebagai tombol klik fallback yang tidak dipamerkan (kecil/sekunder) di mode kamera; jalur tangan ke "Gambar lagi" tetap lewat layar gagal (3 jari) dan stiker (telapak).
Jalankan `npx vitest run` penuh dan `npx tsc --noEmit`; laporkan kegagalan per nama.

---
## H2 — Harness E2E untuk alur baru + jalankan di browser
Kamu satu-satunya worker aktif. BOLEH: `npm run build` dan skrip Playwright di `frontend/implementation`. Tetap dilarang: git commit/push/checkout/stash/reset, npm install, mengubah contexts/**, backend/, frontend/admin/. Ubah `frontend/implementation/e2e/**`; bila E2E membuktikan bug produk nyata, perbaiki `src/**` dengan test dulu dan laporkan tiap perubahan src. JANGAN mempercepat animasi produk untuk test (tidak boleh mengubah durasi produksi; tunggu saja).
Perubahan alur (catatan worker):
- Cover: cincin lambaian; tanpa kamera tombol "Bangunkan Momo"; setelah dialog jempol `cover-thumb` 1 s membuka buku (navigasi di midpoint). `e2e/guide-flow.mjs:35` masih mengharapkan "Halo! Aku Momo".
- Penggaris: mulai nomor 1; Momo fokus di tengah dulu (penggaris terkunci sampai Momo selesai bicara dan mengecil); pertanyaan hanya setelah digeser + diam 0,6 s; jempol 2 s.
- Tutorial (R4): kartu 1 drag mouse di `[data-testid=tutorial-walk]` sampai ≥76%; tunggu `tutorial-thumb-N` tidak terkunci (~10 s setelah Momo selesai/aksi selesai); tahan 1000 ms (kartu 1–2), 2000 ms (kartu 3). Kartu 3: `canvas.tut-draw__canvas` dan `[data-tool=draw|erase|undo|redo]` (semua harus benar-benar dicoba). Hook uji: __skbPinch, __skbThumb, __skbInputMode, __skbTestHooks.surface (butuh NEXT_PUBLIC_TEST_HOOKS=1 untuk hook; journey lama memakai =0 — pilih mode fallback mouse untuk journey).
- Pilih bab: mode fallback tarik pita (sama); mode kamera cincin jari.
- Intro level (L1): kartu benda tidak ada lagi; tunggu `intro-continue` (±30 s), tahan 1000 ms, tunggu `level-intro` hilang (naik awan 2,1 s).
- Kanvas (L6): fase fokus dulu (jempol "Mulai Menggambar" menutup backdrop); tombol Tebak di mode kamera tersembunyi di balik `btn-drawing-help` (fallback: tampil).
- Top-3 (T3/ZA): fallback = TAHAN (bukan klik cepat) pada kandidat/aksi.
- Stiker (S1): setelah keputusan, stiker di kanvas; "Lempar" tahan 2 s; `btn-enter-world` sudah DIHAPUS (`harness.mjs:395`, `run.mjs:147`).
- Penempatan (P2): fallback tombol `btn-confirm-placement` tetap; kamera cincin `ring-place`. Kontrol eksplorasi: fallback `btn-reposition`/`btn-rotate`, kamera `ring-move`/`ring-rotate`.
- Penutup (L4): portal ~7 s; tahan `ending-understood`, tahan `ending-recap-next`, (kuis OFF default) klik/tahan `ending-back-to-cover` → cover. Tidak ada edge-walker. Penutup setelah Bab 3.
- Route: kanvas di `/canvasN`.
Tugas: perbarui `e2e/lib/harness.mjs`, `normal-journey.mjs`, `recovery-paths.mjs`, `finish-thumb-flow.mjs`, `classroom-e2e.mjs` (alur gambar/keputusan saja), `guide-flow.mjs`. Build mock (`NEXT_PUBLIC_TEST_HOOKS=0 npm run build`, mode fallback seperti E2E lama), jalankan dengan `NO_VIDEO=1`, keluaran ke `JOURNEY_OUT=/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/run7/journey`, `RECOVERY_OUT=.../run7/recovery`, `FLOW_OUT=.../run7/finish`. Perintah panjang di latar belakang; tunggu notifikasi. Jalankan: normal-journey (L1→L3 + penutup), recovery-paths, finish-thumb-flow, guide-flow. Ambil screenshot 1280×720 ke `.../run7/shots/` untuk: cover tidur, cover setelah lambaian (PIP kiri bawah), penggaris fase fokus, kartu 1 cincin terkunci, kartu 3, pilih bab, intro level gelap, kanvas fase fokus, Top-3, stiker, penempatan, portal, rekap. Laporkan PASS x/y atau FAIL + sebab per skrip, bug produk yang ditemukan/diperbaiki, dan path screenshot. Jangan klaim PASS tanpa melihat keluaran.

## R4b — BUG BROWSER: kartu 3 tidak pernah terbuka (ditemukan lead lewat E2E)
Milik: src/components/onboarding/TutorialBrochure.tsx, tutorial-*.ts di onboarding/, TutorialBrochure.css, app/styles/99-tutorial.css, tests tutorial-*. Kamu satu-satunya worker aktif. BOLEH `NEXT_PUBLIC_TEST_HOOKS=0 npm run build` dan menjalankan probe browser.
Bukti (Chromium, build produksi, mode fallback mouse): setelah kartu 2 dikonfirmasi jempol, elemen `.tut-card.tutorial-card-3` tetap `matrix(0.1198, 0, 0, 0.1198, 62, 345.6)` (skala tumpukan) dan `.tut-play.play-panel` di dalamnya `matrix3d(-0.0349, 0, 0.9994, …)` (berputar ±92°). Kanvas latihan `canvas.tut-draw__canvas` (satu-satunya canvas) berukuran 47×267 px di (726,614), atribut 11×338. Halaman "Coba gestur tanganmu" yang tampak terbuka bukan induk kanvas itu. Akibatnya coretan mouse tidak mengenai kanvas, tidak ada alat yang tercatat, cincin kartu 3 terkunci selamanya. Kartu 1 dan 2 normal. Dugaan: timeline buka kartu 3 bertabrakan/terbunuh oleh timeline tutup kartu 2 (1,0 s) + jeda 1,1 s yang ditambahkan R4, atau `resizeForDpr` kanvas dijalankan saat halaman masih tertutup.
Tugas (pakai superpowers:systematic-debugging): temukan penyebab di kode GSAP/urutan kartu, perbaiki tanpa mempersingkat durasi (tutup 1,0 s power2.out, jeda 1,1 s, buka 0,95 s tetap), pastikan kanvas diukur ulang setelah halaman benar-benar terbuka (dan saat resize). Tambah test yang menangkap urutan timeline (mock gsap yang mencatat urutan/kill) bila mungkin. Verifikasi di browser dengan probe: `cp /tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/probe/card3-probe.mjs e2e/zz-card3-probe.mjs && SHOT=/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/probe/card3-after.png node e2e/zz-card3-probe.mjs; rm e2e/zz-card3-probe.mjs` (setelah build). Lulus bila mencetak "TUTORIAL PASSED" dan kanvas berukuran besar tanpa transform skala/rotasi. Laporkan keluaran probe.

## V1 — Cover tanpa kamera: Momo menutupi kartu kamera
Milik: src/components/camera/GlobalCamera.tsx, app/styles/100-guide.css (blok cover), app/styles/101-onboarding.css, tests global-camera-*. JANGAN build atau menjalankan E2E (lead sedang menjalankan E2E dari build lama).
Bukti (screenshot `/tmp/claude-0/-home-user-hitl-momo/70f1ddc5-ed67-5bfc-8173-b01b43d2907b/scratchpad/probe/b-15s.png`, 1280×720, tanpa kamera): setelah tombol "Bangunkan Momo", kartu kamera tetap besar di tengah (karena morph hanya saat lambaian kamera), Momo terbang ke tengah sehingga menutupi kartu, bubble menimpa judul kartu, cincin "Aku mengerti" di sisi kanan kartu.
Perbaikan: saat bangun lewat tombol (tanpa kamera) jalankan morph kartu yang sama ke PIP kiri bawah (0,8 s, skala seragam, sekali) sehingga panggung tengah bebas untuk Momo; PIP menampilkan status "Kamera tidak ditemukan..." yang sudah ada dalam ukuran kecil yang tetap terbaca. Bubble dan cincin tidak menutup wajah Momo dan tetap dalam viewport di 1280×720 dan 390×844. Test fake timer: tanpa kamera + tombol → morph terjadi sekali; dengan kamera tetap seperti sekarang.
