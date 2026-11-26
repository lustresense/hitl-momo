# Rencana Migrasi Sandbox r8.3 ke `frontend/implementation` (TypeScript)

| Atribut | Nilai |
|---|---|
| Dokumen | Rencana migrasi lengkap, sumber kebenaran untuk eksekusi oleh AGY (Neon sebagai orkestrator, sub-agent Hydrogen High) |
| Tanggal | 2026-11-25 |
| Basis repo | `lustresense/hitl-momo` branch `main` @ `3908119` (`0.29.6-alpha`, 2026-11-25 06:38 WIB) |
| Basis sandbox | `sketchbook-universe-sandbox-r8.3.zip`: 63 file (83 entri zip termasuk 20 folder), sha256 `d37e02f2bca6dc388133c7cc7c14d35030800a5706db2b0eb17db96f255e8695` |
| Revisi dokumen | v3, 2026-11-25: dibenahi terhadap sandbox r8.3 dan mandat Owner ("plek UI & UX r8.3 ke techstack main"). Koreksi v2→v3 ada di Lampiran F; koreksi v1→v2 di Lampiran E |
| Status | RENCANA. Belum ada baris kode yang dipindah. Semua klaim tentang main berasal dari audit statis (`STATIC_ONLY`) pada SHA di atas |
| Lokasi eksekusi | Laptop Owner, clone lokal. **Tidak ada push, merge, deploy, atau branch remote** |
| Pasangan dokumen | `R83_NEON_PROMPT.md` (prompt orkestrator) |

Kalau sandbox di laptop Owner punya sha256 lain dari angka di atas, salinan Owner yang dipakai, dan sha256-nya dicatat ulang di `docs/migration-r83/BASELINE.md`.

---

## 0. Ringkasan

1. **Strategi.** Layar r8.3 ditambahkan sebagai lapisan UI baru di samping layar lama, di balik flag `NEXT_PUBLIC_UI_R83`. Domain, state machine (`FlowController`), provider prediksi, event, runtime KAPLAY, `StrokeStore`, dan kamera **dipakai ulang**, bukan ditulis ulang. Layar lama baru dihapus setelah Owner tanda tangan di gerbang akhir.
2. **Yang di-"plug" plek 1:1 (UI DAN UX/behavior).** Sandbox r8.3 adalah prototipe UI dan UX yang sudah disetujui Owner. Semua tampilan (CSS, ikon, font Bowlby One + Hanken Grotesk, tekstur cover abu-abu vs halaman dalam dot-grid, tata letak cover dibalik, animasi GSAP/curl buku, copy) **dan** mekanisme perilaku/UX (posisi & morph kamera di cover + PIP kiri-bawah dengan indikator tangan `nui-pip-hand`, transisi buka buku cover-matching curl, alur nama walkie-talkie + animasi keluar, intro kartu Momo ke tengah → pindah kanan bawah → deal 3 kartu, aturan NUI A/B/C/D, durasi ring, joystick, tarik relatif, ribbon pull, penutup 5 fase mulai dari terjun payung) wajib **plek 1:1** dengan r8.3. Bila deskripsi di dokumen ini tertinggal dari r8.3 untuk UI/UX/behavior layar, **r8.3 yang menang**.
3. **Yang tidak bisa di-"plug" mentah**, jadi harus diadaptasi:
   - **Input.** Sandbox mensimulasikan tangan dengan mouse. Di TS, tangan asli datang dari kamera lewat `InputSource`. Kursor kamera wajib memakai resep R1 dari riset kursor: jangkar MCP5, One Euro di ruang px, cubit dengan hysteresis, dan rollback klik.
   - **Prediksi.** Tebakan heuristik sandbox (diberi label "Demo") diganti provider asli: `/predict` model Dias, atau Mock berlabel.
   - **Fisika.** Sandbox punya simulasi sendiri (`sim.js`). TS tetap memakai KAPLAY dengan konstanta yang sudah diuji. Joystick menambah input analog.
   - **Perpindahan halaman.** Sandbox berpindah lewat `sessionStorage`. TS sudah SPA, jadi cukup transisi di memori.
4. **Blocker lintas-owner.** "Nomor absen dihapus, diganti nama" tidak bisa diselesaikan aman dari frontend saja (lihat §5.5). Butuh perubahan kontrak join oleh Dias.
5. **Keputusan produk.** Migrasi ini menyentuh **empat keputusan berstatus Aktif** (D-20261110-07, D-20261110-02, D-20261116-01, D-20261105-23) dan **dua yang Belum dikunci** (D-20261115-02, D-20261105-15) di `contexts/can/DECISIONS.md` (lihat §3). Agent tidak boleh mengubah `DECISIONS.md` kecuali Owner memberi izin tertulis di prompt (O-10).
6. **Jebakan kanvas.** Sandbox membuat Momo menggumamkan tebakan sementara tiap 500 ms selama anak menggambar, dari heuristik demo (`canvas.js:65-69`). Main sengaja membuat Momo diam selama menggambar, tanpa panggilan model sementara (`DrawingScreen.tsx:85`, D-20261110-02 Aktif). Di TS, gumam itu cuma bisa dibuat dengan data palsu atau `/predict` berulang. Default: **mati** (O-13).
7. **Urutan fase.** P0 baseline → P1 kit dan aset ∥ P2 inti NUI → **G2 uji webcam Owner** → P3 sampul dan nama ∥ P5 pilih level → P6 kanvas dan HITL ∥ P8 penutup → P7 dunia ∥ P4 kartu tutorial → P9 integrasi, hardening, **G9 uji webcam akhir**.

---

## 1. Ruang lingkup

### 1.1 Masuk scope
- Semua halaman siswa sandbox r8.3:
  - loading dan sampul;
  - kamera dan nama;
  - kartu tutorial 1–3;
  - pilih level;
  - `levelN` (dunia);
  - `canvasN` (langit dan HITL);
  - penutup.
- Mesin NUI r8.3 (aturan A/B/C/D) sebagai modul TS yang bisa diuji, dengan dua sumber input: tangan (kamera) dan mouse/sentuh (fallback dan dev).
- Kit visual r8.3: 39 ikon Owner, font Bowlby One dan Hanken Grotesk (variable 400–900), token Polo Factory (`lc.css`) + `bold.css`, tekstur serat abu-abu khusus sampul + dot-grid halaman dalam + overlay grain kertas statis 256 px, bubble Momo, ring ber-ikon cubit.
- Copy Momo dan copy layar r8.3, termasuk kalimat kontekstual baru.
- Perbaikan performa r8.3: tanpa filter SVG live, tanpa `mix-blend-mode` di layer besar, penempatan bubble di-throttle, render figur 30 fps.
- Route baru `/ending`.
- Tes unit, tes perilaku dengan input sintetis, paritas visual terhadap sandbox, regresi E2E yang ada, audit CPU, dan checklist webcam fisik untuk Owner.

### 1.2 Di luar scope (jangan disentuh)
- `backend/`, `train/`, `weights/`, `frontend/admin/`, `contracts/openapi.json`. Semuanya scope DIAS. Usulan perubahan kontrak cukup ditulis di laporan.
- NUI Lab (`app/nui-lab/**`, `src/components/nui-lab/**`), MoNUI-7, model R19/R20/R22/R23, worker ONNX. Modul Lab boleh **dibaca dan disalin logikanya** (misalnya `bench/one-euro.ts`, detektor cubit di `bench/action-resolver.ts`), tapi file Lab tidak diubah.
- `contexts/can/research/.context-notforagent/`: **dilarang dibaca**.
- STT Lab (layanan eksternal di VM, `/api/stt/*`, port 5877). Tidak ada di repo dan tidak punya kontrak.
- Deploy, Docker, Caddy, tunnel, versi rilis (`VERSION`, `bump_version.py`), push.
- Desain ulang. Warna dan sistem visual milik Owner (M-003). Acuannya r8.3 apa adanya.

---

## 2. Hasil audit `main` @ `3908119`

### 2.1 Riwayat terbaru yang relevan
| Commit | Isi | Dampak ke migrasi |
|---|---|---|
| `3908119`, `2e83a81`, `99e2cb0`, `21e06be`, `d21395c`, `5bb1a1b`, `6085a9c` (25 Nov) | Snapshot DEV, `SETUP.md` jadi panduan utama, model Dias plus label masuk `weights/`, Caddy DEV di `deploy/Caddyfile.dev` | Cara menjalankan lokal ada di `SETUP.md`. Source frontend tidak berubah |
| `81758b3` (24 Nov, Ujang) | Merge integrasi Dias plus README | Basis audit kursor sebelumnya. Source `frontend/implementation/src` dan `app/` **identik** dengan `3908119`. Di `frontend/implementation`, yang beda cuma baris versi `package.json` dan `tests/fixtures/synthetic-k8-v2-2-export.json` |
| `d3648cc` | Katalog saran per level dibatasi 4 label | Daftar "Bukan ini, pilih lainnya" wajib membaca `levels.ts`, bukan `cat` di sandbox |
| `6fa871d` | Integrasi Dias: `DIAS_CATALOG`, `DIAS_BEHAVIOR`, provider `levelId` | Label runtime = 20 kelas model Dias (lihat §2.4) |
| `b0d9cdd` (HF3) | NUI Lab R22/R23: `action-resolver.ts`, `canvas-tracker.ts`, `worker-owner-guard.ts`, MoNUI-7 YOLO, opsi Lab di `hand-stroke-pipeline.ts` | Game siswa **tidak** memakai mesin HF3. Logika yang terbukti bagus boleh disalin ke `src/nui/` |

### 2.2 Struktur yang dipakai ulang
| Area | File di main | Status untuk r8.3 |
|---|---|---|
| Shell dan routing | `app/*/page.tsx` (semua route siswa merender `SketchbookApp`; `nui-lab` dan `preview` tidak), `src/app/SketchbookApp.tsx` (342 baris), `hooks/useRouteSync.ts`, `route-guard.ts` | Dipakai. Pemilihan layar r83 ditambahkan di sini (hanya oleh Integrator) |
| Alur | `src/app/state-machine.ts` (`FlowController`): `enterLevel`, `submitDrawing`, `retryPrediction`, `decideAccept`, `decideCorrect(2\|3)`, `decideOverride(label)`, `requestRedraw`, `completeFall`, `commitPlacement`, `repositionObject`, `recordGameplayAttempt`, `reportGameplayOutcome` | Dipakai **tanpa perubahan**. Layar r83 hanya memanggil method ini |
| Props layar | `DrawingFlowScreenProps`, `GameplayScreenProps`, `LevelEntryScreenProps` | Layar r83 memakai **tipe props yang sama** (di-import, bukan disalin) |
| Domain | `src/domain/levels.ts` (katalog, `behaviorMap`), `decision-resolver.ts`, `behavior-resolver.ts`, `momo-script.ts`, `tutorial-script.ts`, `world-intro-script.ts`, `ending-script.ts` | Logika dipakai. Copy r8.3 masuk modul baru `src/domain/copy/` |
| Prediksi | `src/prediction/*`, `src/config/env.ts` | Dipakai. Mock selalu berlabel, partner tidak pernah jatuh diam-diam ke Mock |
| Event | `src/events/*`, `src/domain/events.ts` (`decision_made` dan lainnya) | Dipakai tanpa perubahan skema |
| Kelas | `src/app/hooks/useClassroomSession.ts`, `src/api/classroom-client.ts` | Dipakai. Lihat §5.5 |
| Goresan | `src/input/types.ts` `StrokeStore` (hapus parsial `eraseAt`, undo/redo berbasis op), `normalize.ts` | Dipakai. Ditambah `wipe()` (Bersihkan, satu langkah undo) |
| Runtime game | `src/game/runtime/*` (KAPLAY), `constants.ts`: `GRAVITY 1600`, `WALK_SPEED 130`, `JUMP_FORCE 520` | Dipakai. `movement.ts` ditambah input analog (lihat §5.3.6) |
| Momo, Thinman, stage | `components/momo/momo-engine.ts`, `momo-art.ts`, `momo-wing.ts`; `game/character/*`; `stage-preview/StageArtwork.tsx` | Dipakai. Sandbox `thinman.js`, `stage-art.js`, dan `momo-art.js` adalah **hasil generate dari repo**, jadi tidak di-port ulang |
| Kamera | `components/camera/GlobalCamera.tsx` (722 baris, `mode: "cover" \| "floating"`), `camera/hand-landmarker.ts`, `frame-source.ts` | Siklus hidup stream dan izin tetap. Presentasi sampul r83 dipisah (lihat §7.1) |
| Gaya | `app/styles/00-…105-*.css` (urutan import di `app/globals.css`) | Ditambah partial `110-…119-r83-*.css` |

### 2.3 Celah antara main dan r8.3
| Topik | Main sekarang (bukti) | r8.3 | Tindakan |
|---|---|---|---|
| Model interaksi | Router gestur per mode, jumlah jari 1/2/3 untuk pilih (`input/gesture-mode.ts`), jempol untuk selesai gambar (`ui/ThumbConfirm.tsx`), dwell 1200 ms (`hooks/useDwell.ts:18`) | Satu gestur cubit. A: satu target, cubit-tahan di mana saja. B: target terdekat menyala, terkunci saat cubit mulai. C: tarik dan joystick. D: kursor hanya di kanvas | Mesin baru `src/nui/`. Layar lama tetap memakai router lama |
| Sumber kursor | Ujung telunjuk mentah (landmark 8) dari `input/hand-gesture.ts:24-28`, peta 1:1 tanpa kotak kendali, store dengan epsilon 0,003 (`camera/hand-cursor-store.ts:31`) | Mouse (simulasi) | `HandSource` dengan resep R1 (§5.3.4) |
| Detektor cubit | Tiga detektor dengan ambang berbeda (`hand-gesture.ts:93` 0,42/0,55, `hand-stroke-pipeline.ts`, `gameplay-gesture.ts`). Rasio dihitung di 0..1 tanpa koreksi aspek | Klik mouse | Satu `pinch-detector.ts` (0,30/0,42, koreksi aspek) |
| Kursor di layar | `ui/HandCursor.tsx` ada, tapi **tidak di-import di mana pun** | Pensil (hotspot −7/−29 px) dan bulatan hapus 44 px, hanya di kanvas | `CanvasCursor.tsx` |
| Alat kanvas | Gambar, Hapus (3 ukuran), Mundur, Maju lewat gestur satu atau dua jari (`components/drawing/gesture-commands.ts:14`) | Pensil, Hapus parsial, Mundur, Maju, **Bersihkan** (bisa di-undo). Tunjuk lalu cubit | `features/canvas/Toolbar.tsx`, `StrokeStore.wipe()` |
| Selesai gambar | Jempol (D-20261110-02) | Ring "Tebak Gambarku" 2000 ms, mode tunjuk | Ring r83 |
| Top-3 | Panel plus jari 1/2/3 | Baris B (2000 ms untuk Terima/Pakai), "Bukan ini" lalu katalog (2000 ms), Kembali/Gambar lagi (1000 ms), tombol 1–3 di keyboard | `features/canvas/GuessPanel.tsx` |
| Stiker | `StickerStamp.tsx` | Sentil ke atas = Lempar, tahan 2000 ms | `StickerStage.tsx` |
| Penempatan | `PlacementControls.tsx` | Tarik relatif dari mana saja (ambang 12 px), diam = ring "Taruh di sini" 1500 ms | `features/world/Placement*` |
| Jalan Thinman | Keyboard, tombol layar, atau driver tangan | Joystick dari titik awal cubit, tap atau sentil ke atas = lompat | `nui/core/joystick.ts` → input analog KAPLAY |
| Pilih level | `LevelRibbonBookmark.tsx` plus ring jempol "Mulai Bab n" (`LevelRibbonBookmark.tsx:394`). CTA tutorial "Mulai Bab 1" (`tutorial-script.ts:30`) | Pita terdekat menyala, tarik dari mana saja, tanpa ring mulai. CTA tutorial "Pilih level" | `features/level-select/` |
| Momo saat menggambar | Diam, tanpa gumam dan tanpa panggilan model sementara (`DrawingScreen.tsx:85`). Tanya setelah diam `IDLE_PROMPT_MS = 10000` (`canvas-focus.ts:8`) | Gumam tebakan sementara tiap `PROVISIONAL_MS 500` dari heuristik demo. Tanya plus ring "Tebak Gambarku" setelah diam `GUESS_IDLE_MS 1000` (`canvas.js:9,59-73`) | O-13 (gumam) dan O-14 (waktu tanya) |
| Sampul | Bangun dengan jempol | Ring "Ayo" (aturan A, ikon cubit), gerbang izin kamera, langkah nama | `features/cover/` |
| Identitas | Penggaris nomor absen (`/onboarding/number`). Nama dikirim sebagai `Siswa ${n}` (`SketchbookApp.tsx:120`) | Nama lewat suara (simulasi Web Speech), tanpa nomor | §5.5 (blocker kontrak) |
| Penutup | `ending/CenterOfPage.tsx` di dalam fase app, tanpa route | Kolam tinta, Thinman bisa dijalankan, rekap ala chat Momo, ring "Kembali ke sampul" | Route `/ending` plus `features/ending/` |
| Istilah | "Bab 1 · …" di `levels.ts:157,175,202`, `StageArtwork.tsx:64-65` | "Level" | Copy siswa memakai "Level" (O-8) |
| Font | Tidak ada Bowlby One dan Hanken Grotesk di main | Dipakai (Bowlby One + Hanken Grotesk variable 400–900, base64 di `shared/fonts.css`) | Self-host `public/fonts/*.woff2` plus pemberitahuan OFL |
| Ikon | `ui/Icon.tsx`, `GestureGlyph.tsx` | 39 ikon Owner persis (viewBox 48, garis 2,6, oranye `#E86435`, tinta `#1d1d1b`) | `components/ui/owner-icons/` |

### 2.4 Temuan risiko dari audit
1. **Model MoNUI-7 tidak ada di clone.**
   - Bukti: `frontend/implementation/.gitignore` mengecualikan `public/models/*.onnx` dan `public/ort/`.
   - Dampak: jalur YOLO di NUI Lab gagal-tertutup di laptop. Game siswa tidak terdampak.
   - Aturan: jangan mengunduh model dari internet atau server untuk "memperbaiki" ini.
2. **`hand_landmarker.task` diunduh tiga kali** di SPA siswa (25,56 MiB, `contexts/can/NOW.md` entri 0.27.0; audit CDP, belum diukur ulang di `3908119`).
   - Mode r83 wajib memakai **satu** loop detektor (§5.6).
3. **Vitest punya kegagalan bawaan.** Ada 22 tes gagal per `NOW.md` 0.29.1, di area kamera dan penghapus.
   - P0 wajib mencatat daftar nama tes yang gagal. Gerbang berikutnya = "tidak ada kegagalan baru", bukan "semua hijau".
4. **Kontrak join butuh `number`.**
   - `POST /api/join/{token}/students` dengan body `{number, name}`; `number` wajib `≥1` dan `≤ student_count`.
   - Backend melakukan **upsert** pada `(class_id, number)` dan menimpa `name` (`backend/app/classroom.py:73-92`), bukan 409.
   - Konsekuensinya ada di §5.5.
5. **Kosakata label berbeda.**
   - Model Dias punya 20 kelas: tangga, anak tangga, jembatan, bangku, meja, papan luncur, kaktus, api unggun, petir, gergaji, pisau, pedang, ular, laba-laba, pagar, zigzag, garis, awan, ember, payung (`weights/model_4_mobilenetv2.labels.json`).
   - Sandbox memakai papan, balok, batu, duri, tali.
   - Label runtime **wajib** dari provider dan `levels.ts`. Copy statis yang menyebut contoh benda masuk tabel rekonsiliasi (Lampiran B).
6. **Dokumen fisika tidak sinkron.** `ARCHITECTURE_ACTUAL.md` menulis "walk 200", padahal source `game/runtime/constants.ts` = 130. Source yang benar. Jangan ubah konstanta; perbaiki dokumen di P9.
7. **`reactStrictMode: true` dan `output: "export"`** (`next.config.*`).
   - Efek jalan dua kali di dev, jadi timeline GSAP dan singleton mesin harus idempoten dan punya cleanup.
   - Tidak boleh ada API route, middleware, atau fitur server. Route baru harus statis.
8. **Override.** Invariant tes: Override hanya untuk label di luar Top-3.
   - Katalog per level berisi 4 label dan bisa beririsan dengan Top-3.
   - Daftar "pilih lainnya" wajib membuang label Top-3. Sandbox **sudah** melakukannya (`guess.js:28`: `vocab.filter(v => !g.some(c => c.label === v)).slice(0, 4)`). TS wajib mempertahankan aturan itu di atas katalog `levels.ts`.

---

## 3. Keputusan produk yang tersentuh

Agent **tidak** mengubah `contexts/can/DECISIONS.md` kecuali O-10 = "tulis". Draf di Lampiran C ditulis ke `docs/migration-r83/DECISIONS_DRAFT.md`.

| Keputusan (status di `DECISIONS.md`) | Isi sekarang | Yang diubah r8.3 |
|---|---|---|
| D-20261110-07 (Aktif) | Gestur menurut mode, tanpa kursor: pilih dengan 1/2/3 jari, telapak = Bukan ini, dan seterusnya | Diganti model hybrid A/B/C/D, satu gestur cubit, kursor hanya di kanvas |
| D-20261110-02 (Aktif) | Momo diam selama menggambar. Tebakan hanya setelah siswa menahan jempol "selesai". Setelah 10 detik diam, Momo bertanya dan indikator jempol menyala, tanpa menebak otomatis | Jempol diganti ring "Tebak Gambarku" (cubit-tahan 2000 ms, mode tunjuk). Sandbox juga menggumamkan tebakan sementara dan bertanya setelah 1 detik. Gumam = O-13, waktu tanya = O-14 |
| D-20261116-01 (Aktif) | (1) collider = kotak gambar; (3) satu kata "Bab" | (3) diganti "Level" (permintaan dosen). (1) tergantung O-6 |
| D-20261105-15 (Belum dikunci, RISET) | Penutup setelah Level 3 | Penutup r8.3 (kolam tinta, rekap chat, Thinman bisa dijalankan) |
| D-20261115-02 (Belum dikunci) | Mapping gestur Card 1 dan Card 3 | Kartu 1 joystick, Kartu 3 latihan kursor plus 5 alat |
| D-20261105-23 (Aktif), juga M-035 | Semua jempol punya cincin progres (2 detik konfirmasi, 1 detik percakapan) dengan deteksi jempol nyata; Terima = jempol 2 detik; sampul dikonfirmasi jempol | Semua jempol diganti cubit. Sampul memakai ring "Ayo" aturan A. Durasi 1/2 detik tetap |
| Identitas siswa (penggaris nomor absen) | Penggaris nomor | Nama lewat suara, nomor dihapus (Owner, Nov 2026), terblokir kontrak (§5.5) |

---

## 4. Keputusan Owner sebelum eksekusi

Blok ini disalin ke prompt Neon. Default sudah dipilih. Owner cukup mengubah yang tidak setuju.

| ID | Pertanyaan | Default | Alasan default |
|---|---|---|---|
| O-1 | Layar lama dipertahankan di balik flag? | **Ya.** `NEXT_PUBLIC_UI_R83=1` = r8.3, `0` = lama. Default nilai di repo tetap `0` sampai G9 | Migrasi bisa dibalik, E2E lama tetap jadi bukti domain tidak rusak |
| O-2 | Git lokal | **Branch lokal `r83-migration`, tidak pernah di-push.** Commit lokal per fase atas nama Owner, tanpa trailer AI (M-008/M-018) | `main` lokal tetap bersih untuk `git pull`. Tidak ada branch di GitHub |
| O-3 | Identitas siswa | **(b) Nama dulu, lalu penggaris nomor hanya kalau masuk lewat link kelas,** sampai Dias mengubah kontrak. Adapter `name-only` dibuat tapi mati | (c) nomor otomatis dari klien **ditolak**: upsert backend bisa menggabungkan data dua siswa diam-diam |
| O-4 | STT nama | **Antarmuka provider.** `stt-lab` = stub gagal-tertutup sampai ada kontrak. Fallback ketik oleh guru (chrome). Web Speech API hanya saat `NEXT_PUBLIC_DEV_TOOLS=1` dan diberi label SIMULASI | Web Speech di Chrome mengirim audio ke server Google, dan pemakainya anak SMP. STT asli adalah riset Dias |
| O-5 | Ring turun saat cubit lepas | **0,5× kecepatan isi** (seperti V5/main `DWELL_DRAIN_RATIO`) | r8.3 memakai 1,5×. Di cahaya gelap cubit sempat putus sampai 282 ms (data sesi Owner), dan 1,5× menghapus kemajuan anak terlalu cepat |
| O-6 | Collider objek | **Ikut r8.3 (bentuk goresan, L-7), dikerjakan di P7b** setelah P7 lulus dengan kotak | Acuan terbaru Owner adalah r8.3. Kotak dulu supaya ada titik aman yang sudah terbukti |
| O-7 | Hapus memotong segmen di kanvas game | **Ya** (`eraseSegments = true` di kanvas r83) | Perilaku hapus parsial r8.3. Tanpa ini goresan cepat lolos dari penghapus |
| O-8 | "Level" menggantikan "Bab" di semua teks siswa | **Ya** | Permintaan dosen. Identifier kode boleh tetap |
| O-9 | Bar Lewati/Menu sandbox, tombol "Ulangi cover" (`#replay`), ganti gaya Momo (`#sk-momo`) | **Dev saja** (muncul bila `NEXT_PUBLIC_DEV_TOOLS=1`) | Itu alat review, bukan fitur siswa |
| O-10 | Izin menulis `DECISIONS.md` | **Draf saja** (`docs/migration-r83/DECISIONS_DRAFT.md`) | Sesuai SOP CAN |
| O-11 | Gerbang webcam fisik oleh Owner | **Wajib di G2 dan G9** | Uji sintetis bukan bukti webcam |
| O-12 | Jumlah sub-agent paralel | **Maks 2 sekaligus, satu penulis per file** | Mencegah tabrakan file dan laptop tidak tercekik |
| O-13 | Momo menggumamkan tebakan sementara saat anak masih menggambar | **Mati.** Momo hanya memakai kalimat cue (seperti main, D-20261110-02) | Sumber tebakannya di sandbox adalah heuristik demo. Di TS pilihannya cuma dua: data palsu (dilarang AGENTS) atau `/predict` tiap 500 ms (beban server, dan di Level 2–3 confidence diturunkan kesulitan AI). Kalau Owner pilih nyala: hanya mode partner, `/predict` asli dengan jeda ≥1500 ms, berlabel "tebakan sementara" |
| O-14 | Kapan Momo bertanya dan ring "Tebak Gambarku" muncul | **Ikut sandbox: 1000 ms setelah tangan diam** | Bagian dari interaksi r8.3 yang sudah dicoba Owner. Ini mengubah angka 10 detik di D-20261110-02, jadi masuk draf keputusan |
| O-15 | Fallback ketik nama bila mik tidak ada atau STT gagal | **Ya**, input ketik di chrome untuk guru. Ini **tambahan di luar sandbox** (di sandbox ketik ditandai "simulasi" dan nama contoh "Bima" dipakai) | Tanpa fallback, anak tanpa mik buntu di sampul (invariant "tanpa dead-end"). Nama contoh "Bima" **tidak** dipakai di produksi |

---

## 5. Arsitektur target

### 5.1 Prinsip
1. **Aditif dulu, hapus belakangan.** Semua kode r8.3 masuk folder baru. File lama hanya disentuh di titik sambung yang dicatat (§5.2.2).
2. **Drop-in.** Setiap layar r83 menerima props dengan tipe yang sama seperti layar lama dan memanggil `FlowController` yang sama.
3. **Satu sumber per hal.**
   - Angka paritas di `src/nui/core/constants.ts`.
   - Copy di `src/domain/copy/*`.
   - Ikon di `owner-icons.data.ts`.
   - Label dari provider dan `levels.ts`.
4. **Logika murni terpisah dari React.**
   - Mesin NUI, joystick, penempatan, mesin fase sampul, dan mesin penutup ditulis sebagai TS murni dan diuji tanpa DOM.
   - Komponen React hanya merangkai.
5. **Tidak ada state per frame di React.**
   - Posisi kursor, isi ring, dan joystick ditulis lewat ref ke `style.transform` atau atribut SVG di rAF.
   - React hanya menerima perubahan kasar (target menyala atau tidak, fase).
6. **Paritas sebelum perbaikan.** Nilai CSS, durasi, easing, dan copy disalin dari sandbox. "Perbaikan" desain dilarang. Usulan ditulis di laporan.
7. **TS ketat.** Tanpa `any` dan tanpa `@ts-ignore`. Ukuran file ≤300 baris, akar komposisi ≤200 baris. Ekspor bernama dan `index.ts` per modul.
8. **Gagal tertutup.** Kamera mati atau tangan hilang memindahkan input ke mouse atau sentuh tanpa error diam. Provider prediksi gagal menampilkan jalur recovery yang sudah ada.

### 5.2 Struktur folder

```
frontend/implementation/
  proto-html/r83/                         # sandbox r8.3 byte-identik + SHA256SUMS + README (referensi, tidak diimpor)
  public/fonts/                           # BowlbyOne-Regular.woff2, HankenGrotesk-Variable.woff2 (SIL OFL, dari shared/fonts.css r8.3)
  app/ending/page.tsx                     # route baru, merender SketchbookApp seperti route lain
  app/dev/nui/page.tsx                    # harness NUI; tanpa NEXT_PUBLIC_DEV_TOOLS=1 hanya teks "tidak tersedia"
  app/styles/110-r83-fonts.css            # @font-face
  app/styles/111-r83-tokens.css           # tokens.css + bold.css sandbox, di bawah [data-ui="r83"]
  app/styles/112-r83-paper.css            # lc.css (overlay statis 256 px)
  app/styles/113-r83-nui.css              # hand.css (ring, badge, legenda, kursor)
  app/styles/114-r83-momo.css             # layout.css #su-bubble -> .r83-bubble
  src/nui/
    core/types.ts  core/constants.ts  core/engine.ts  core/geometry.ts
    core/hold-duration.ts  core/joystick.ts  core/flick.ts  core/drag.ts
    sources/input-source.ts  sources/source-arbiter.ts
    sources/mouse-source.ts  sources/test-source.ts
    sources/hand-source.ts
    sources/hand/pointer-filter.ts  sources/hand/pinch-detector.ts
    sources/hand/rollback-buffer.ts  sources/hand/loss-hold.ts
    sources/hand/owner-lock.ts  sources/hand/nib-filter.ts
    react/NuiProvider.tsx  react/useNuiTarget.ts  react/NuiRing.tsx
    react/HandLegend.tsx  react/CanvasCursor.tsx  react/PipHand.tsx
    react/useJoystick.ts  react/useFlick.ts  react/useDragRelative.ts
    index.ts
  src/components/ui/owner-icons/owner-icons.data.ts  OwnerIcon.tsx  index.ts
  src/domain/copy/cover.ts tutorial.ts levels.ts canvas.ts world.ts ending.ts nui.ts index.ts
  src/features/shared/     MomoStage.tsx bubble-placement.ts PaperOverlay.tsx ScreenFrame.tsx
  src/features/cover/      (lihat §7.1)
  src/features/tutorial/   (§7.2)
  src/features/level-select/ (§7.3)
  src/features/canvas/     (§7.4)
  src/features/world/      (§7.5)
  src/features/ending/     (§7.6)
  tests/nui/**  tests/features/**  tests/domain/copy-*.test.ts
  e2e/r83/ parity-capture.mjs parity-compare.mjs flow-*.mjs perf-cpu.mjs net-once.mjs
  docs/migration-r83/ STATUS.md BASELINE.md DECISIONS_DRAFT.md COPY_RECONCILIATION.md
                      PARITY_REPORT.md PERF_REPORT.md WEBCAM_QA.md CHANGELOG_DRAFT.md CONTRACT_PROPOSALS.md
```

#### 5.2.1 File yang hanya boleh disentuh Integrator (penulis tunggal)
- `src/app/SketchbookApp.tsx`, `src/app/hooks/useRouteSync.ts`, `src/app/route-guard.ts`, `src/app/screens/AppShell.tsx`
- `src/config/env.ts` (flag `uiR83()` dan `devTools()`)
- `app/globals.css` (import partial 110–119), `app/layout.tsx` (preload font)
- `src/types/window.d.ts` (hook tes baru)
- `package.json` dan `package-lock.json`. **Tidak ada dependensi baru tanpa izin Owner.** GSAP, React, KAPLAY, dan MediaPipe sudah ada.
- `THIRD_PARTY_NOTICES.md` (OFL font)

#### 5.2.2 File lama yang boleh diubah, dengan pemiliknya
| File | Perubahan | Pemilik |
|---|---|---|
| `src/input/types.ts` (`StrokeStore`) | Tambah `wipe(): boolean`. Kertas kosong → `false`. Selain itu: tutup goresan atau penghapusan yang terbuka, push op `{kind:"erase", before: [...strokes], after: []}` (tipe `StoreOp` di `types.ts:38` sudah mendukung), kosongkan `redoOps`/`undone` seperti aksi baru, lalu `true`. `undo()`/`redo()` yang ada sudah memulihkan op erase (`types.ts:157-182`). `clear()` tidak berubah karena dipakai Redraw | Worker Kanvas |
| Jalur input gameplay: `src/game/runtime/types.ts` (`DirectionInput`), `src/game/game-controller.ts` (`setInput`), `src/game/runtime/integrated-scene.ts` (`setInput`, hanya menyalin `axis`), `src/game/runtime/movement.ts` | Tambah field opsional `axis?: number` (−1..1) di `DirectionInput`. `resolveHorizontalMovementIntent(input, gameplay, settled)` (signature tetap): kalau `input.axis` terisi, kecepatan = `clamp(axis)·WALK_SPEED`, kalau kosong rumus lama `(right − left)·WALK_SPEED` byte-sama. `legacy-scene.ts` tidak diubah | Worker Dunia |
| `src/components/camera/GlobalCamera.tsx` | Hanya bila perlu: mode presentasi baru tanpa visual sampul lama. Stream, izin, dan fallback tidak diubah | Integrator (P3) |
| `src/components/stage-preview/StageArtwork.tsx` | Prop opsional untuk teks papan "Lanjut ke …" (default tetap teks lama), supaya dunia r83 bisa menampilkan "Level 2" tanpa mengubah layar lama | Worker Dunia |
| `src/game/runtime/creations.ts`, `integrated-scene.ts` | Hanya P7b: membuat collider dari `shape-collider.ts` saat O-6 = bentuk. Jalur kotak tetap default | Worker Dunia |
| Dokumen `contexts/can/*`, `docs/execution/*` | Rekonsiliasi di P9 | Integrator (P9) |

### 5.3 Lapisan NUI

#### 5.3.1 Kontrak input
```ts
// src/nui/core/types.ts
export type SourceKind = "hand" | "mouse" | "touch" | "keyboard" | "test";
export interface InputSample {
  t: number;              // ms, monoton (performance.now() atau capture time)
  x: number; y: number;   // px viewport, SUDAH difilter, titik yang sama untuk gambar dan hit-test
  inFrame: boolean;       // tangan terlihat / pointer di dalam jendela
  pinch: boolean;         // cubit terkonfirmasi (hysteresis + debounce)
  pinchStrength: number;  // 0..1, hanya untuk umpan balik visual
  nib?: { x: number; y: number }; // ujung telunjuk terfilter untuk tinta (hanya hand)
  clickPoint?: { x: number; y: number }; // titik rollback saat PINCH_ON (hand), sama dengan x,y untuk mouse
  source: SourceKind;
}
export interface InputSource {
  readonly kind: SourceKind;
  start(): void; stop(): void;
  subscribe(cb: (s: InputSample) => void): () => void;
}
```
- `SourceArbiter`: hanya satu sumber yang aktif, yaitu sumber terakhir yang punya input dalam 500 ms. Sampel tidak pernah dicampur. Elemen chrome (gerbang izin, ketik nama, legenda, bar dev, `[data-nui-off]`) selalu memakai klik native.
- `MouseSource` meniru sandbox persis: gerak = tangan, tahan klik = cubit-tahan, lepas = lepas cubit. Sentuh diperlakukan sama. Tombol H (matikan simulasi) hanya ada di mode dev.
- `TestSource` hanya ada bila `NEXT_PUBLIC_TEST_HOOKS=1`, lewat `window.__skbNui.push(sample)`.

#### 5.3.2 Mesin aturan (port `shared/hand.js` r8.3)
| Aturan | Perilaku | Sumber sandbox |
|---|---|---|
| A, satu pilihan | Hanya satu target aktif. Cubit-tahan **di mana saja** (bukan di chrome) mengisi ring target itu | `hand.js` header, pool = 1 |
| B, beberapa pilihan | Target terdekat menyala tanpa kursor. Jarak = jarak ke tepi kotak + 0,001 × jarak ke pusat. Target **dikunci saat cubit mulai**. Lepas cubit untuk ganti | `dist()`, `nearest()` |
| C, gerakkan sesuatu | Cubit lalu geser lebih dari 26 px = tarik, dan ring berhenti terisi. Joystick dan tarik relatif ada di §5.3.3 | `MOVE_CANCEL = 26` |
| D, kanvas | Satu-satunya tempat ada kursor (pensil atau bulatan hapus). Ring di kanvas memakai mode `point`, jadi harus ditunjuk | `SU.nui.canvas(on)`, mode `'point'` |
| Latch | Target yang muncul saat cubit masih ditahan menunggu cubit dilepas dulu | latch |
| Klik cepat | Klik tanpa tahan pada target tidak melakukan apa-apa | "quick click suppressed" |
| Keyboard | Enter atau Spasi ditahan = cubit-tahan pada target yang menyala. Panah ← → ↑ untuk jalan dan lompat. 1–3 memilih baris tebakan | sandbox |
| Durasi | Ring lewat `holdMs(label, ms)` (port `msFor`, `hand.js:215`): label diawali "Tebak Gambarku", "Kembali ke sampul", atau "Ya," = 2000; diawali "Taruh di sini" = 1500; selain itu `ms < 1000 ? ms : 1000`. Target yang didaftarkan langsung (tidak lewat `msFor`) memakai `ms`-nya sendiri: baris tebakan Terima/Pakai dan objek katalog 2000 (`guess.js:42-43`), "Ya, itu namaku" 2000, "Ulangi" 1000, "Mulai bicara" 1000, "Ayo" 1000 (`cam/index.html:896,1131,1134`) | `msFor`, `guess.js`, sampul |
| Loop | `dt` per frame dibatasi 50 ms (`hand.js:110`) | `frame()` |
| Turun ring | O-5: 0,5× kecepatan isi | (r8.3 = 1,5×) |

API publik mesin:
```ts
engine.register(el, { holdMs?, mode: "any" | "point", label, onFire, badge?: boolean, group?: string }): () => void
engine.setCanvasMode(on: boolean): void
engine.joystick({ onAxis, onJump, when?, ignore? }): () => void
engine.flick(cb, { ignore? }): () => void
engine.dragRelative({ onStart, onMove, onEnd, threshold = 12 }): () => void
engine.isChrome(el): boolean
```
Mesin berjalan di satu loop rAF milik `NuiProvider`. Komponen mendaftar lewat `useNuiTarget(ref, opts)`.

#### 5.3.3 Gerak (aturan C)
- **Joystick** (`hand.js:160-183`). Origin = titik awal cubit, deadzone 14 px. `axis = sign(dx)·min(1, 0,35 + (|dx|−14)/110·0,65)`. Tap = cubit <230 ms **dan** geser ≤10 px → lompat. Sentil ke atas = naik lebih dari 40 px dalam jendela 140 ms → lompat, dengan jeda antar-sentil 420 ms.
- **Sentil stiker** (`hand.js` `flick()`, `stamp.js:45`). Ambangnya **beda** dari joystick: naik lebih dari 50 px dalam jendela 160 ms → Lempar. Konstanta animasi: `STAMP_THROW_MS 1200`, `THROW_TRAVEL 0,6`. Ring "Lempar" dan "Gambar lagi" dibuka dengan `STAMP_HOLD_MS 2000`, tapi lewat `msFor` (`ui.js:139`) jadi **efektif 1000 ms**. Yang dipakai TS = durasi efektif.
- **Tarik relatif (penempatan, pita level).** Cubit di mana saja lalu geser ≥12 px untuk mulai (`place.js:82`). Benda ikut delta tangan, bukan posisi absolut. Setelah benda diam 700 ms, ring "Taruh di sini" 1500 ms muncul (`place.js:71`).

#### 5.3.4 `HandSource`, resep R1
Sumber: laporan riset "Kursor tangan webcam akurat stabil" (data sesi Owner, satu orang dewasa). **Angka ini titik awal**, divalidasi di G2.

| Komponen | Nilai |
|---|---|
| Jangkar pointer UI | MCP5 (landmark 5), x dicermin `1 − x`. Bukan ujung jari |
| Ruang hitung | px kamera lebar 1280: `X = x·1280`, `Y = y·1280/aspek` (aspek dari `videoWidth/videoHeight`) |
| Filter | One Euro per sumbu: minCutoff 1,0 Hz, β 0,01 /(px/s), dCutoff 1,0 Hz. Selama cubit ditahan, β 0,05. Basisnya `components/nui-lab/bench/one-euro.ts` (disalin, sudah punya reset celah) |
| dt | Nyata dari timestamp frame, monoton. Jangan mengasumsikan fps |
| Zona mati | Lunak ("tali") 4 px di ruang hitung |
| Kotak kendali | x 0,12–0,88, y 0,10–0,80 pada MCP5 mentah, lalu clamp dan dipetakan sekali ke px viewport |
| Tampilan | rAF mengejar titik terfilter dengan τ ≈ 35 ms. Tanpa ekstrapolasi. Hit-test = titik yang digambar |
| Cubit | `r = |P4−P8| / |P0−P9|` (px, dikoreksi aspek). Masuk saat r <0,30 selama 2 frame unik. Tahan selama r <0,42. Lepas setelah r ≥0,42 selama `max(150 ms, 2·dt)`. Jeda 250 ms setelah klik. `pinchStrength = clamp01((0,50−r)/0,20)` |
| Rollback klik | Buffer 600 ms. `clickPoint` = pointer pada `t(PINCH_ON) − 200 ms`. Target B = hover terbanyak dalam 0,4 s sebelum `PINCH_ON` |
| Tangan hilang | `T_gap = clamp(3·median dt, 250, 500) ms`: kursor beku dan abu-abu, ring tidak turun. Lewat `T_gap`: reset filter, batalkan tekan, akhiri goresan di titik terakhir. Ambil ulang butuh tangan terbuka ≥2 frame |
| Pemilik tangan | Tangan pertama yang terlihat terbuka memegang kendali. Tangan lain diabaikan sampai pemilik hilang lebih dari `T_gap` |
| Pena (`nib`) | Ujung telunjuk dengan filter tinta sendiri, rollback 200 ms di awal goresan, potong ekor saat lepas. Kursor tetap MCP5 |
| Target | Min 64 px, celah 24 px. Hover lengket: area kena diperluas 24 px. Magnet mati di kanvas |

`HandSource` **tidak** membuat detektor sendiri. Sumber frame-nya adalah satu loop landmark yang sama dengan `GlobalCamera` (§5.6).

#### 5.3.5 Kanvas (aturan D)
- Mode kanvas aktif hanya di area kertas: `CanvasCursor` tampil, target di luar kertas tetap A/B.
- Pena: `pinch` turun di dalam kertas → `StrokeStore.beginStroke()`; titik dari `nib` (hand) atau pointer (mouse); lepas → `endStroke()`.
- Hapus: mode hapus aktif → `eraseAt(p, r)` dengan `eraseSegments = true` (O-7). Lingkaran tampil 44 px, jadi radius 22 px CSS, dikonversi ke px kanvas lewat `eraserRadiusCanvasPx()` (`input/eraser.ts:26`).
- Bersihkan = `wipe()` (bisa di-undo dalam satu langkah). Mundur dan Maju = undo/redo yang ada.
- Normalisasi untuk prediksi tetap `normalize.ts` → `DrawingInput`.

#### 5.3.6 Jembatan ke KAPLAY
- `features/world/joystick-to-runtime.ts`: `axis` dan lompat → `GameController.setInput({ left, right, jump, axis })`. Ini jalur yang sama dengan `useGameplayInput.ts:86` → `integrated-scene.ts:185` → `movement.ts` (dipanggil di `integrated-scene.ts:377`). `left/right` tetap diisi dari tanda `axis`, supaya animasi karakter yang membaca boolean tetap benar. JumpAssist (coyote/buffer 100 ms) tidak diubah.
- Tes wajib: tanpa `axis`, hasil identik dengan sebelumnya (tabel kasus unit). Dengan `axis = ±1`, kecepatan = ±130. Dengan `axis = 0,35`, kecepatan = 45,5.

### 5.4 Alur dan event
- Tidak ada event baru di sink HTTP. Skema `draft-0` tidak berubah.
- Pemetaan keputusan:
  - "Terima" → `decideAccept()`;
  - "Pakai" baris 2/3 → `decideCorrect(2|3)`;
  - katalog → `decideOverride(label)`. Label Top-3 dibuang dari daftar (§2.4 butir 8).
- "Gambar lagi" → `requestRedraw(...)`. Redraw tetap bukan keputusan keempat.
- Event tidak boleh memuat goresan, nomor, **atau nama** siswa (perluasan invariant yang ada). Tes wajib.
- Metrik NUI (waktu konfirmasi, target salah) hanya ke ring-buffer lokal saat `NEXT_PUBLIC_DEV_TOOLS=1`.

### 5.5 Identitas siswa (nama) dan kontrak join
**Fakta:**
- Join wajib mengirim `number` (1..`student_count`).
- Backend meng-upsert pada `(class_id, number)` dan menimpa `name` (`classroom.py:83-92`).
- STT asli adalah riset Dias, ada di layanan eksternal tanpa kontrak.

**Konsekuensi:**
- Menghapus nomor sepenuhnya dari frontend **tidak aman**. Nomor otomatis dari `taken_numbers` bisa membuat dua siswa memilih angka sama pada saat bersamaan, lalu siswa kedua menimpa nama siswa pertama dan memakai baris datanya. Data riset jadi tercampur tanpa error.
- Perlu kontrak baru dari Dias, misalnya join tanpa `number` dengan server yang membagikan identitas secara atomik. Usulan ditulis di `docs/migration-r83/CONTRACT_PROPOSALS.md`, bukan diimplementasikan di backend.

**Implementasi di migrasi (O-3 default):**
```
features/cover/join/join-identity.ts
  interface JoinIdentityStrategy { needsNumber(ctx): boolean; join(ctx, name, number?): Promise<StudentSession> }
  rulerPlusName   // AKTIF: nama dari langkah nama; penggaris nomor hanya bila ada join token
  nameOnly        // MATI: melempar NotSupported sampai kontrak Dias ada (flag NEXT_PUBLIC_JOIN_NAME_ONLY)
```
- Tanpa join token (main tanpa kelas), alurnya cukup nama, tanpa nomor.
- Dengan join token, alurnya nama lalu penggaris yang sudah ada (`StudentRulerSelector`, dibungkus target NUI r83), lalu `joinClass(number, name)`.
- Nama: `normalize-name.ts` = port **persis** fungsi `clean()` sandbox (`onboarding/cam/index.html:1125-1130`): huruf kecil, buang selain huruf, apostrof, spasi, dan strip; buang sapaan (halo/hai/hi/oke/ok) dan awalan (nama saya, namaku, panggil aja aku, aku, saya, gue, gw, adalah, itu); maks 3 kata; huruf awal tiap kata kapital; maks 24 karakter. Backend menerima sampai 80 karakter, jadi aman. Waktu dengar mik asli 7000 ms (`:1174`).
- Nama contoh "Bima" sandbox hanya untuk provider `sim` (dev). Produksi tidak pernah mengisi nama palsu.
- Nama **tidak** dicatat di event, konsol, atau `localStorage`. Nama hanya dikirim ke join dan disimpan di memori sesi.
- `name-provider.ts`: `NameProvider { listen(signal): Promise<NameResult> }`.
  - `stt-lab`: stub, langsung `unavailable`.
  - `typed`: input chrome untuk guru.
  - `sim`: hanya dev, label "SIMULASI", boleh memakai Web Speech API.
  - Urutan: stt-lab → typed. Copy Momo saat fallback mengikuti sandbox.

### 5.6 Anggaran performa
| Gerbang | Nilai |
|---|---|
| Detektor tangan | `hand_landmarker.task` diunduh **sekali** per sesi di mode r83 (cek lewat CDP Network). Satu loop deteksi |
| Re-render React | 0 commit React per frame karena gerak kursor (React Profiler di harness `/dev/nui`). Ring diisi lewat ref |
| Long task | Tidak ada task >50 ms selama interaksi stabil (setelah load), diukur dengan `PerformanceObserver('longtask')` |
| CPU halaman | Diukur di laptop Owner (Chrome, kamera menyala), dibandingkan dengan sandbox r8.3 di mesin yang sama. Target ≤ sandbox +15% per halaman. Angka referensi headless r8.3 tanpa GPU: sampul 28%, kartu 72%, pilih level 39%, kanvas 41%, level1 57%, penutup 57% |
| Larangan | Tidak ada filter SVG live, tidak ada `mix-blend-mode` di layer layar penuh, tidak ada `backdrop-filter` baru. Grain = tile statis 256 px. Render figur Thinman di kartu 30 fps dengan cek perubahan. Penempatan bubble dihitung ulang hanya saat signature berubah atau tiap 200 ms |

### 5.7 Kit visual dan aset
- **Font.** Bowlby One (judul/wordmark) dan Hanken Grotesk variable 400–900 (teks UI, bubble, subjudul — menggantikan Architects Daughter sejak r3; `shared/fonts.css:1-4`), SIL OFL.
  - Self-host `woff2` di `public/fonts/` (`BowlbyOne-Regular.woff2` dan `HankenGrotesk-Variable.woff2`) dengan `font-display: swap`.
  - **Tanpa CDN** (jaringan sekolah).
  - Sumber byte = base64 di sandbox `shared/fonts.css`, di-decode lalu dicatat sha256-nya.
  - Tambah pemberitahuan OFL di `THIRD_PARTY_NOTICES.md`.
- **Ikon.** 39 ikon dari `shared/icons.js` dipindah ke `owner-icons.data.ts` **apa adanya** (string SVG utuh: viewBox 48, stroke 2,6, `stroke="currentColor"`, aksen isi `#E86435` di 7 tempat). Warna garis ikut `color` dari CSS (tinta `--nb-ink #1d1d1b`), bukan dari data ikon.
- **Glyph lama yang masih dipakai.** Tiga glyph 24 px dari `shared/glyphs.js` masih dirender r8.3, karena `hand.js` tidak menimpanya dengan ikon Owner: `left` dan `right` (petunjuk joystick kartu 1, `kartu.js:98`) dan `close` (badge "bahaya" kartu 2, `kartu.js:137`). Ketiganya dipindah apa adanya ke `owner-icons/legacy-glyphs.ts`. Glyph lain di `glyphs.js` tidak dipakai (`thumb` hanya fallback bila ikon cubit tidak ada).
  - Tes snapshot membandingkan string path dengan sandbox.
  - Dilarang mengubah ketebalan, crop, atau warna (keputusan Owner).
- **Token.** `shared/tokens.css` dan `bold.css` di-scope ke `[data-ui="r83"]` supaya layar lama tidak berubah.
- **Overlay kertas.** `lc.css` dan `lc.js` jadi `PaperOverlay.tsx` plus CSS. Gradien `lc-defs` dirender sekali per dokumen.
- **GSAP** dari npm (`gsap` ^3.15.0), bukan `gsap.min.js`. Semua timeline dibuat di `useLayoutEffect` (isomorfik) dengan `ctx.revert()` saat unmount.

---

## 6. Pemetaan file sandbox → modul TS

| Sandbox r8.3 | Baris | Tujuan TS | Catatan |
|---|---|---|---|
| `shared/hand.js`, `hand.css` | 228, 88 | `src/nui/**`, `113-r83-nui.css` | Inti. Mouse jadi `MouseSource`, kamera jadi `HandSource` |
| `shared/icons.js` | 49 | `components/ui/owner-icons/*` | Byte-exact |
| `shared/glyphs.js` | – | `owner-icons/legacy-glyphs.ts` (hanya `left`, `right`, `close`) | Sisanya tidak dipakai r8.3. Lihat §5.7 |
| `shared/ui.js` | 276 | `features/shared/bubble-placement.ts`, `MomoStage.tsx`, `react/NuiRing.tsx` | `placeBubble/placeRing` jadi fungsi murni plus tes. Menghindari chip hint, PIP, dan bubble |
| `shared/sketch.js` | 63 | `features/canvas/canvas-controller.ts` di atas `StrokeStore` | Jangan bikin kelas Sketch baru. Pakai store repo plus `wipe()` |
| `shared/momo.js`, `momo-art.js` | 191, – | Pakai `components/momo/*` | Hasil port repo. Cek paritas ekspresi |
| `shared/thinman.js`, `thinrig.js` | 324, 160 | Pakai `game/character/*` | `thinman.js` = esbuild dari repo |
| `shared/stage-art.js` | – | Pakai `StageArtwork.tsx` | Render statis dari repo |
| `shared/tokens.css`, `bold.css`, `fonts.css`, `layout.css`, `lc.css`, `lc.js` | 30, –, –, 53, 295, 38 | `app/styles/110–114`, `PaperOverlay.tsx` | Scope `[data-ui="r83"]` |
| `index.html`, `onboarding/cam/index.html` | 1278 ×2 | `features/cover/**` | Satu sumber (`tools/build_cover.py`). Dipecah per §7.1 |
| `shared/loading/dream.*` | 179, 30 | Pakai `components/onboarding/DreamLoader.tsx` | Cek paritas. Port ulang hanya bagian yang beda |
| `shared/kartu/kartu.js`, `.css` | 246, 76 | `features/tutorial/**` | §7.2 |
| `shared/bab/bab.js`, `.css` | 177, 118 | `features/level-select/**` | §7.3. Nama folder tanpa "bab" |
| `shared/level/canvas.js`, `guess.js`, `stamp.js`, `store.js` | 85, 69, 84, 65 | `features/canvas/**`, `domain/copy/canvas.ts` | §7.4. Heuristik `guessFor` tidak di-port |
| `shared/level/intro.js`, `world.js`, `fallfx.js`, `place.js`, `play.js`, `pages.js` | 100, 101, 33, 106, 112, 105 | `features/world/**` | §7.5. `pages.js` (serah-terima `sessionStorage`) tidak di-port, karena SPA |
| `shared/level/sim.js`, `shape.js` | 36, 61 | Fisika tetap KAPLAY. `shape.js` jadi `game/runtime/shape-collider.ts` hanya di P7b (O-6) | Geometri level pernah diuji BFS di sandbox. Ulangi di KAPLAY |
| `shared/level/data.js` | 79 | Tidak di-port | Pakai `levels.ts`. `vocab/cat/map` sandbox ≠ 20 kelas model. Geometri level (`stage-geometry.ts`) memang sudah dari repo |
| `shared/end/*` | 185, 34, 64, 29, 40, 34 | `features/ending/**` | §7.6. Rekap dari data sesi asli |
| `hub/`, `shared/ready.js`, bar `#skipbar`, `#sk-momo` | – | Tidak di-port (O-9: dev saja) | Alat review |

---

## 7. Modul per halaman

Semua layar: akar komposisi `<Name>Screen.tsx` (≤200 baris), mesin fase murni `*-machine.ts` dengan tes, timeline GSAP di hook `use*Timeline.ts`, copy di `domain/copy/<screen>.ts`, CSS di `<screen>.css` (di-import oleh akar komposisi), `index.ts`.

### 7.1 Sampul, kamera, buka buku, dan nama: `/` dan `/onboarding/cam` → `src/features/cover/`
| Modul | Isi |
|---|---|
| `CoverScreen.tsx` | Akar komposisi. Memilih langkah dari `cover-machine`. Desktop `>=900px` susunan **dibalik (`FL`)**: kartu kamera oranye + Momo tidur + bubble `#gate` di **atas** (ditengahkan), wordmark `SKETCHBOOK UNIVERSE` hijau tua (`--lc-deep-green`) + tagline + logo di **bawah**, spiral binding di tepi atas, doodles di margin, tekstur kertas abu-abu (`--su-paper-texture` + `::after`) khusus sampul |
| `cover-machine.ts` | Fase: `sleep → gate → camera-on → wake → intro → ayo → book-curl → name → name-confirm → name-exit → (ruler) → handoff`. Murni. Tes transisi plus tidak ada dead-end saat kamera ditolak |
| `CameraConsentGate.tsx` | Bubble Momo mengigau, centang, Lanjut, toggle kamera. **Chrome (mouse/sentuh)**. Kalimat kamera + mik sesuai sandbox (`index.html:503`) |
| `useCoverTimeline.ts` | Kaget, balistik (kartu melebar sebagian ke atas `smallY - 36` meluncurkan Momo), menguap, kartu kamera morph ke **PIP kiri-bawah** (`22px` kiri, `26px` bawah, `150×120` desktop / `125×100` mobile), Momo ke tengah. Memakai `momo-engine` yang ada |
| `AyoRing.tsx` | Aturan A, ikon cubit, 1000 ms |
| `BookCurlTransition.tsx` | Transisi buka buku r8.3 (`index.html:1013-1073`): `#cover-hero` & bayangan fade out → Momo terbang keluar → `#book-front-cover` (cover identik tanpa teks: tekstur serat abu-abu + dots + jilid spiral atas + doodles) mengelupas 3D diagonal dari pojok kanan bawah (`clip-path: url(#front-unpeeled-clip)`, flap lipatan kertas krem dengan tepi halus `rgba(55,31,13,.18)`, **tanpa** scrim abu-abu gelap) membuka halaman dot-grid bersih "SIAPA NAMAMU?" |
| `name/NameStep.tsx` | Guide Momo plus ring "Mulai bicara" (`#name-start`, ikon cubit + mik di label, A, 1000 ms). Tampilan mendengarkan ala walkie-talkie (gelombang suara 13 bar hijau `#sound-wave`) sesuai sandbox. Waktu dengar 7000 ms |
| `name/NameConfirm.tsx` | "Ulangi" di kiri (1000 ms) dan "Ya, itu namaku" di kanan (2000 ms), aturan B. Setelah konfirmasi: Momo bilang `"Senang kenalan sama kamu, ${nm}!"` → animasi GSAP seluruh elemen layar nama keluar ke atas (`finishAndGo`, `index.html:1135-1144`) sebelum handoff ke kartu tutorial |
| `name/name-provider.ts`, `providers/{stt-lab,typed,sim}.ts`, `normalize-name.ts` | §5.5 |
| `join/join-identity.ts` | §5.5 |
| `cover.css` | Dari `index.html` `<style>` (tanpa `#skipbar`) |

Kamera: `GlobalCamera` tetap memegang stream, izin, dan fallback, namun **posisi, ukuran, transisi morph cover → PIP kiri-bawah (`#cam-pip`), dan indikator posisi tangan live (`nui-pip-hand`) di dalam kartu kamera wajib plek 1:1 dengan perilaku r8.3** (bukan posisi/tampilan lama). Pilihan integrasi yang diizinkan:
- (a) `GlobalCamera` di-bind ke layout/rect morph sampul r8.3 saat di sampul, lalu pindah mulus ke PIP kiri-bawah r8.3 (dengan overlay `PipHand`) di semua layar berikutnya; atau
- (b) mode presentasi khusus `mode="r83"` di `GlobalCamera` tanpa visual sampul lama.

Integrator memilih dengan bukti di laporan P3. `/onboarding/number` di mode r83 hanya muncul lewat `rulerPlusName`.

### 7.2 Kartu tutorial: `/onboarding/card` → `src/features/tutorial/`
| Modul | Isi |
|---|---|
| `TutorialScreen.tsx` | Spread kartu + **koreografi intro pasca-nama r8.3** (`kartu.js:170-209`): layar mulai bersih (kertas dot-grid tanpa shade gelap & 3 kartu belum muncul) → Momo terbang dari kanan atas ke **tengah (`mid`)** → menyapa nama siswa (`"Halo, **${nm}**! Selanjutnya kamu bisa baca **3 kartu panduan** ini untuk tahu cara main dan bantu Thinman, ya."`) → bubble tutup → Momo pindah mulus ke **kanan bawah (`strip`)** → baru `.tut-shade` masuk dan 3 kartu oranye di-deal (`"Kita mulai dari kartu pertama, ya."`). Layout dari viewport (port `tutorial-layout` sandbox) |
| `tutorial-gate.ts` | Waktu baca `CARD_READ_MS 3333` sebelum ring terbuka. Kartu 3 selesai bila 5 alat sudah dicoba (`used.size ≥ 5`) |
| `cards/CardWalk.tsx` | Kartu 1: joystick Thinman sampai bendera. Render figur 30 fps |
| `cards/CardSafeDanger.tsx` | Kartu 2: baca plus contoh |
| `cards/CardCanvasTools.tsx` | Kartu 3: memakai `features/canvas/canvas-controller` dan `Toolbar` yang sama (mode kanvas sampai `page.all`) |
| `tutorial.css` | Dari `kartu.css` |

CTA kartu terakhir: "Pilih level".

### 7.3 Pilih level: `/levels` → `src/features/level-select/`
| Modul | Isi |
|---|---|
| `LevelSelectScreen.tsx` | Rak pita. Ikon Owner (gembok, bendera, bintang) |
| `ribbon-pull.ts` | Pegangan virtual: pita terdekat menyala (B), cubit di mana saja lalu tarik. Ambang dan easing dari `bab.js`. Tanpa ring "Mulai Level" |
| `level-select.css` | Dari `bab.css` (yang berasal dari `98-kit-flow.css` `bm-*`) |

Kunci level tetap dari `isLevelUnlocked` / `level-progress.ts`.

### 7.4 Kanvas dan HITL: `/canvasN` → `src/features/canvas/`
| Modul | Isi |
|---|---|
| `CanvasScreen.tsx` | Drop-in untuk `DrawingFlowScreen` (props sama) |
| `canvas-controller.ts` | Pena dan hapus di atas `StrokeStore` (§5.3.5). Mode kanvas mesin NUI |
| `Toolbar.tsx`, `tools.ts` | 5 alat `pencil`, `eraser`, `undo`, `redo`, `clear` ("Bersihkan"), tunjuk lalu cubit. Ukuran target sesuai §5.3.4 |
| `GuessRing.tsx` | "Tebak Gambarku" 2000 ms, mode `point`, di samping kotak gambar. Muncul bersama kalimat tanya setelah tangan diam (O-14, default 1000 ms). Saat kertas kosong: kalimat cue. Saat tangan bergerak: **tanpa** gumam tebakan dan tanpa panggilan provider (O-13 default) |
| `GuessPanel.tsx`, `guess-model.ts` | Top-3 dari provider (label dan confidence asli). Baris B; "Bukan ini, pilih lainnya" → katalog `levels.ts` minus Top-3; Kembali; Gambar lagi. Keyboard 1–3. Chip "Demo" sandbox **diganti** label provenance Mock yang sudah ada |
| `StickerStage.tsx` | Stiker plus sentil Lempar. Ring "Gambar lagi" |
| `MissionBulb.tsx` | Misi di balik bohlam (ikon Owner) |
| `canvas.css` | Dari `level.css` bagian kanvas |

### 7.5 Dunia: `/levelN` → `src/features/world/`
| Modul | Isi |
|---|---|
| `WorldScreen.tsx` | Drop-in untuk `LevelEntryScreen` + `GameplayScreen` sesuai fase snapshot |
| `useIntroTimeline.ts` | Panggung gelap plus spotlight (pindah sesuai aturan fokus sandbox) |
| `sky-transition.ts` | Kamera naik ke langit, lalu turun membawa stiker. Frame pertama halaman tujuan sama dengan frame terakhir halaman asal (di SPA cukup transisi kontinu) |
| `fall-fx.ts` | Ayunan, bayangan, squash, pantulan, debu. Hanya visual, hasil fisika tidak berubah |
| `Placement.tsx`, `placement-controller.ts` | Tarik relatif plus ring "Taruh di sini" 1500 ms → `commitPlacement()` / `repositionObject()` |
| `GameplayHud.tsx`, `joystick-to-runtime.ts` | Joystick (C) plus legenda. Jembatan analog ke KAPLAY (§5.3.6) |
| `FailPanel.tsx`, `SuccessPanel.tsx` | Target B. Durasi sesuai sandbox |
| `world.css` | Dari `level.css` |
| (P7b) `game/runtime/shape-collider.ts` | `shape.js`: goresan setebal T=3,2 satuan sumber, area tertutup padat, daftar persegi per rotasi, tanjakan ≤5 satuan. Ditambah tes keterselesaian per level |

### 7.6 Penutup: `/ending` → `src/features/ending/`
| Modul | Isi |
|---|---|
| `EndingScreen.tsx`, `ending-machine.ts` | Urutan 5 fase plek r8.3 (`end.js:67-182`): **terjun payung (`payung`) → kolam tinta (`kolam`) → penjelasan Momo (`bicara`) → rekap (`rekap`) → selesai (`akhir`)** |
| `ParachuteScene.tsx` | Thinman turun pakai parasut ke Pusat Halaman (`end.js:67-105`), debu mendarat |
| `end-camera.ts` | Zoom berbasis tinggi layar (Thinman 21%) |
| `pond-timeline.ts`, `PondScene.tsx` | Joystick antar Thinman ke kolam tinta, menyelam, keluar bercahaya lalu jadi oranye (`"Eh! Kamu... hidup?"`) |
| `end-walker.ts` | Joystick (hanya di fase kolam) plus LUT tanah 1-unit (`end.js:22-30`, `walker.js`). Pada fase `bicara`, Thinman berjalan ke kiri-tengah menghadap user dengan rig GSAP `thinrig` (bernapas, melambai, mengangguk — tidak lagi dijalankan), Momo di anchor `ending` di sebelah kanannya, ring `"Aku mengerti"` (A, 1000 ms) |
| `RecapChat.tsx` | Rekap gaya chat Momo dari `recapFromFlow` / `level-summary` asli. Benda terbang dari kiri urut level. **Tanpa data contoh** |
| `CenterArt.tsx` | Art Pusat Halaman (`center-art.js`) |
| `BackToCoverRing.tsx` | "Kembali ke sampul", A, 2000 ms (di dalam bubble Momo) |
| `ending.css` | Dari `end.css` |

Guard route: `/ending` hanya setelah Level 3 selesai, selain itu redirect ke `/levels` dengan notice yang sudah ada.

---

## 8. Fase dan gerbang

Legenda pemilik: **I** = Integrator, **Q** = QA (read-only kecuali `tests/`, `e2e/r83/`, dan `docs/migration-r83/*REPORT*`). Maks 2 sub-agent jalan bersamaan.

| Fase | Pemilik | Bergantung | Hasil | Gerbang lulus |
|---|---|---|---|---|
| **P0 Baseline** | Q | – | Sandbox di `proto-html/r83/` (byte-identik plus `SHA256SUMS`), `docs/migration-r83/BASELINE.md`: SHA, versi tool, hasil `npm ci`, `typecheck`, `lint`, `test` (daftar nama tes yang gagal), `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`, E2E terawat (`normal-journey`, `recovery-paths`, `classroom-e2e`, `route-canvas`, `guide-flow`). Screenshot acuan sandbox (§9.2) | Semua angka tercatat dengan perintah dan exit code. Tidak ada perubahan di `src/` |
| **P1 Kit dan aset** | Worker Kit | P0 | Font, partial CSS 110–114, `owner-icons`, `PaperOverlay`, `MomoStage` / `bubble-placement` plus tes | Tes ikon byte-exact, tes `bubble-placement`. Build lulus |
| **P2 Inti NUI** | Worker NUI | P0 | `src/nui/**` lengkap, harness `/dev/nui` (A, B, C-joystick, C-drag, D-kanvas mini, latch, keyboard) | Setiap fungsi ekspor `src/nui/core` dan `sources/hand/*` punya tes (tanpa menambah paket coverage). Tes perilaku sintetis untuk semua baris tabel §5.3.2–5.3.4. Profiler 0 commit per frame |
| **I-1** | I | P1, P2 | Flag `uiR83()` / `devTools()`, import CSS, route `/dev/nui`, hook `__skbNui`, `NuiProvider` di root (hanya saat flag) | Flag 0: E2E lama sama dengan baseline |
| **G2 Webcam Owner** | Owner | I-1 | `WEBCAM_QA.md` bagian G2 (Lampiran D) | Owner menulis "G2 lulus". Kalau gagal, perbaiki P2 dulu |
| **P3 Sampul dan nama** | Worker Sampul | G2 | `features/cover/**`, `domain/copy/cover.ts` | Paritas visual (§9.2) per state. Tes `cover-machine`. Kamera ditolak → fallback mouse tanpa dead-end |
| **P5 Pilih level** | Worker Level | G2 | `features/level-select/**` | Paritas. Tes kunci level |
| **I-2** | I | P3, P5 | Sambungan `SketchbookApp` (flag 1), routing sampul → nama → (penggaris) → kartu → level | `classroom-e2e` lulus di mode lama dan r83 |
| **P6 Kanvas dan HITL** | Worker Kanvas | I-2 | `features/canvas/**`, `StrokeStore.wipe()` plus tes | Invariant HITL lulus (§9.1). Paritas. Bersihkan lalu Mundur memulihkan semua goresan |
| **P8 Penutup** | Worker Penutup | I-2 | `features/ending/**`, `app/ending/page.tsx` (via I) | Paritas. Rekap dari data sesi |
| **I-3** | I | P6, P8 | Sambungan kanvas dan penutup, guard `/ending` | E2E r83 alur kanvas lulus |
| **P7 Dunia** | Worker Dunia | I-3 | `features/world/**`, jalur `axis` opsional (§5.2.2: `types.ts`, `game-controller.ts`, `integrated-scene.ts`, `movement.ts`) | Unit `movement` (tanpa `axis` identik). E2E r83 L1–L3 bisa diselesaikan dengan input sintetis |
| **P4 Kartu tutorial** | Worker Kartu | I-3 | `features/tutorial/**` | Paritas. Gerbang 5 alat |
| **P7b Collider bentuk** (O-6) | Worker Dunia | P7 | `shape-collider.ts` | Tes keterselesaian L1–L3, minimal 2 objek tetap wajib, "satu objek tidak cukup" tetap berlaku |
| **I-4** | I | P7, P4, (P7b) | Sambungan semua route | E2E r83 penuh lulus |
| **P9 Hardening** | Q, lalu I | I-4 | `PARITY_REPORT.md`, `PERF_REPORT.md`, a11y, rekonsiliasi dokumen (§10), `CHANGELOG_DRAFT.md` | Semua gerbang §9 hijau atau tercatat jujur |
| **G9 Webcam akhir Owner** | Owner | P9 | `WEBCAM_QA.md` bagian G9 | Owner menulis "G9 lulus". Baru setelah itu O-1 boleh dibahas (flag default 1 / hapus layar lama) |

Batch paralel (maks 2): {P1, P2} → I-1 → G2 → {P3, P5} → I-2 → {P6, P8} → I-3 → {P7, P4} → (P7b) → I-4 → P9 → G9.

---

## 9. Verifikasi

### 9.1 Unit dan perilaku (Vitest)
- `src/nui/core`: semua aturan A/B/C/D, latch, ambang 26 px, `holdMs` (termasuk "Lempar" → 1000), turun ring 0,5×, `dt` dibatasi 50 ms, keyboard, rumus joystick (titik uji: dx = 13, 14, 15, 69, 124, 200, −200).
  - Tap: <230 ms dan geser ≤10 px → lompat; geser 11 px → bukan lompat.
  - Sentil joystick: >40 px dalam 140 ms; sentil kedua dalam 420 ms diabaikan.
  - Sentil stiker: >50 px dalam 160 ms; 45 px → bukan sentil.
- `hand/*`: One Euro (langkah, tidak overshoot), zona mati 4 px, kotak kendali, hysteresis cubit 0,30/0,42 dengan dt 33 ms dan 140 ms, rollback 200 ms, `T_gap`, pemilik tangan. Fixture landmark sintetis plus fixture rekaman yang sudah ada di `tests/fixtures/` (dibaca saja).
- Invariant HITL (wajib, disalin dari tes lama bila ada):
  - Redraw tidak menghasilkan `decision_made`;
  - Correct hanya rank 2/3;
  - Override hanya label di luar Top-3;
  - katalog r83 membuang Top-3;
  - Mock selalu berlabel;
  - event tanpa goresan, nomor, atau nama.
- `StrokeStore.wipe()`: undo memulihkan semua, redo membersihkan lagi, `clear()` lama tidak berubah.
- `movement.ts`: tanpa `axis` identik (snapshot). Dengan `axis` linear.
- `normalize-name.ts`, `join-identity.ts` (`nameOnly` melempar, `rulerPlusName` memanggil `joinClass(number, name)`).

### 9.2 Paritas visual
- **Acuan.** Playwright membuka sandbox dari `file://` di `proto-html/r83/`. State digerakkan dengan mouse, seperti simulasi di sandbox.
- **Kandidat.** Build statis (`NEXT_PUBLIC_UI_R83=1`, `NEXT_PUBLIC_PREDICTION_MODE=mock`, `NEXT_PUBLIC_TEST_HOOKS=1`). State digerakkan dengan `TestSource`.
- **Determinisme.**
  - Font sudah termuat (`document.fonts.ready`).
  - Animasi dibekukan pada waktu yang sama di kedua sisi: `gsap.globalTimeline.pause()` lalu `seek(T)`, plus `getAnimations().forEach(a => { a.pause(); a.currentTime = T })`.
  - Kamera PIP dan area video ditutup mask.
  - Metodenya ditulis di `PARITY_REPORT.md`.
- **Viewport.** 1280×720 dan 1920×1080 (sama dengan uji sandbox).
- **Ambang.** `pixelmatch` threshold 0,1. **≤2%** piksel beda untuk state statis, ≤4% untuk state dengan Momo bergerak. Setiap state menghasilkan gambar berdampingan (sandbox | TS | diff) untuk ditinjau Owner. Angka lulus tanpa tinjauan Owner belum dianggap lulus.
- **Daftar state minimum** (dari uji sandbox r8.3):
  - sampul: tidur, gerbang, Ayo menyala, nama mendengarkan, konfirmasi nama;
  - kartu 1, 2, 3 (dengan 5 alat tercentang);
  - pilih level: pita menyala, pita ditarik;
  - kanvas: kosong, menggambar, kursor pensil, kursor hapus, ring Tebak Gambarku, panel Top-3 dengan baris 2 menyala, katalog, stiker;
  - dunia: intro, penempatan dengan ring, main, gagal, menang;
  - penutup: kolam, rekap, ring kembali.

### 9.3 E2E
- Cara menjalankan (`docs/execution/RUN_GUIDE.md:13-19`): semua suite menyajikan `./out`, jadi `npm run build` dulu, lalu `node e2e/<suite>.mjs`. Butuh Chromium (`CHROMIUM_PATH` atau `/opt/pw-browsers/chromium`). `NO_VIDEO=1` untuk `normal-journey`. `e2e/run.mjs` berlabel STALE/LEGACY, jadi bukan gerbang.
- `classroom-e2e.mjs` butuh backend dan dashboard yang dijalankan terpisah (lihat header file). Tanpa itu: `NOT_TESTED`.
- Mode lama (flag 0): suite terawat **sama dengan baseline P0**.
- Mode r83 (flag 1), suite baru di `e2e/r83/`:
  - `flow-cover-name`, `flow-tutorial`, `flow-levels`, `flow-canvas-hitl` (Accept, Correct, Override, Redraw, provider gagal/retry);
  - `flow-world-l1..l3`, `flow-ending`, `flow-classroom` (link kelas → nama → penggaris → join);
  - `net-once` (landmarker satu kali), `perf-cpu`.
- `classroom-e2e` memakai backend lokal hanya bila Owner sedang menjalankannya. Kalau tidak, tandai `NOT_TESTED`, jangan mengarang lulus.

### 9.4 Kelas bukti
Setiap klaim di laporan diberi kelas: `STATIC_ONLY`, `UNIT_ONLY`, `MOCK_MODEL` (browser E2E), `REAL_MODEL` (backend lokal plus `weights/`), `WEBCAM_OWNER` (G2/G9). Tes sintetis bukan bukti webcam. Setiap klaim menyertakan SHA commit lokal, perintah, dan exit code.

---

## 10. Rekonsiliasi dokumen (P9, lokal)
| Dokumen | Isi |
|---|---|
| `frontend/implementation/docs/execution/ARCHITECTURE_ACTUAL.md` | Lapisan `src/nui`, `src/features`, `src/domain/copy`, flag. Perbaiki "walk 200" jadi 130 sesuai source |
| `docs/execution/RUN_GUIDE.md` | Cara menjalankan mode r83, `/dev/nui`, paritas |
| `contexts/can/project/OWNER_MANDATES.md` | M-042: instruksi migrasi ini dalam kata-kata Owner |
| `contexts/can/REVISIONS.md`, `NOW.md`, `WORKING_CONTEXT.md`, `SESSION_HANDOFF.md` | Status migrasi, blocker kontrak join, gerbang webcam |
| `contexts/can/DECISIONS.md` | **Hanya bila O-10 = tulis**. Kalau tidak, cukup `docs/migration-r83/DECISIONS_DRAFT.md` |
| Root `CHANGELOG.md`, `VERSION` | **Tidak diubah** (tidak ada push). Draf di `CHANGELOG_DRAFT.md`. Saat push nanti, Owner atau Ujang yang menjalankan `bump_version.py` |
| `contracts/*` | Tidak diubah. Usulan di `CONTRACT_PROPOSALS.md` |

---

## 11. Risiko dan mitigasi
| Risiko | Dampak | Mitigasi |
|---|---|---|
| Worker "memperbaiki" desain (drift visual) | Hasil tidak plug | Nilai disalin dari sandbox. Paritas piksel plus tinjauan Owner per batch. Larangan eksplisit di prompt |
| Klaim lulus palsu | Owner tertipu | Neon menjalankan ulang setiap gerbang sendiri. QA terpisah membaca diff. Bukti = perintah, exit code, dan SHA |
| Rasa tangan beda dari sandbox | NUI terasa buruk | Resep R1, harness `/dev/nui`, G2 sebelum layar apa pun di-port |
| Kontrak join | Data siswa tercampur | O-3 default (b). `nameOnly` mati. Usulan ke Dias |
| Regresi event atau telemetri | Data riset rusak | Tes invariant. Skema tidak berubah |
| Performa (React per frame, landmarker 3×) | Lag di laptop sekolah | Anggaran §5.6 sebagai gerbang |
| Main berubah selama migrasi (Ujang push) | Konflik rebase | Perubahan aditif, titik sambung kecil, SHA basis dicatat. Rebase oleh Owner, bukan agent |
| Agent menyentuh scope lain (Lab, backend, admin) | Kerusakan lintas-owner | Allowlist path per worker. Pelanggaran = fase gagal |
| SSR atau ekspor statis | Build gagal | `"use client"`, guard `window`, tanpa API route |
| Privasi anak | Masalah etika dan PA | Tanpa rekam audio, tanpa nama di log atau event, tanpa frame kamera tersimpan |
| Lisensi font | Masalah distribusi | OFL dicatat |

---

## 12. Rollback
- Per fase: setiap fase = satu commit lokal (atau lebih) di `r83-migration`. Rollback dengan `git revert <sha>` lokal. **Jangan** `reset --hard` pada commit yang sudah dilaporkan.
- Global: set `NEXT_PUBLIC_UI_R83=0`, layar lama aktif tanpa rebuild kode.
- Darurat: `git switch main`. Branch lokal tetap utuh sebagai arsip.

---

## 13. Definition of Done
1. Semua fase P0–P9 lulus gerbangnya dengan kelas bukti yang jujur. G2 dan G9 ditandatangani Owner.
2. Mode lama (flag 0): suite terawat dan Vitest **tanpa kegagalan baru** dibanding baseline.
3. Mode r83: E2E r83 lulus. Paritas ≤ ambang **dan** disetujui Owner. Anggaran performa terpenuhi.
4. Tidak ada perubahan di `backend/`, `train/`, `weights/`, `frontend/admin/`, `contracts/`, NUI Lab, `.context-notforagent`.
5. Tidak ada push, branch remote, deploy, atau perubahan versi.
6. `docs/migration-r83/STATUS.md` berisi ringkasan akhir, daftar blocker (kontrak join dan STT), dan langkah berikut untuk Owner, Ujang, dan Dias.

---

## Lampiran A. Konstanta paritas (`src/nui/core/constants.ts`)
| Nama | Nilai | Sumber |
|---|---|---|
| `MOVE_CANCEL_PX` | 26 | `hand.js` |
| `HOLD_MS_DEFAULT` / `HOLD_MS_DECISION` / `HOLD_MS_PLACE` | 1000 / 2000 / 1500 | `hand.js:215` `msFor`, `guess.js:42-43` |
| `RING_DRAIN_RATIO` | 0,5 (O-5). Sandbox: 1,5 (`hand.js:125`) | V5 `proto-html/README.md:25`, main `useDwell.ts:19-20` |
| `RING_DT_CAP_MS` | 50 | `hand.js:110` |
| `JOY_DEADZONE_PX`, `JOY_BASE`, `JOY_SPAN_PX`, `JOY_GAIN` | 14, 0,35, 110, 0,65 | `hand.js:180` |
| `TAP_JUMP_MS`, `TAP_MAX_MOVE_PX` | 230, 10 | `hand.js:171,176` |
| `JOY_FLICK_UP_PX`, `JOY_FLICK_WINDOW_MS`, `JOY_FLICK_COOLDOWN_MS` | 40, 140, 420 | `hand.js:172-173` |
| `STICKER_FLICK_UP_PX`, `STICKER_FLICK_WINDOW_MS` | 50, 160 | `hand.js` `flick()` |
| `DRAG_START_PX` | 12 | `place.js:82` |
| `PLACE_RING_DELAY_MS` | 700 | `place.js:71` |
| `STAMP_THROW_MS`, `THROW_TRAVEL` | 1200, 0,6 | `stamp.js:11` |
| Ring stiker "Lempar" / "Gambar lagi" | efektif 1000 (`STAMP_HOLD_MS 2000` dipotong `msFor`) | `stamp.js:42-43`, `ui.js:139` |
| `GUESS_IDLE_MS` | 1000 (O-14) | `canvas.js:9` |
| `PROVISIONAL_MS`, `MUMBLE_POLL_MS` | 500, 100. Hanya dipakai bila O-13 = nyala | `canvas.js:9` |
| `CARD_READ_MS` | **3333** | `kartu.js:15` |
| `TUTORIAL_TOOLS_REQUIRED` | 5 | `kartu.js:148-151` |
| `CURSOR_PENCIL` | offset (−7, −29) px, ukuran 36 px | `hand.css:18` |
| `ERASER_DIAMETER_PX` | 44 (garis putus 2,5 px) | `hand.css:19` |
| `LEGEND_BOTTOM_PX` | 136 | `hand.css:64` |
| `BUBBLE_REPLACE_MS` | 200 (atau saat signature berubah) | `ui.js:154-158` |
| `FIGURE_FPS` | 30 | `kartu.js:39-41` |
| `GRAIN_TILE_PX` | 256 (feTurbulence fractalNoise, baseFrequency 0,65, 3 oktaf, dirasterisasi sekali) | `lc.js:22-31`, `lc.css:234` |
| `NAME_LISTEN_MS`, `NAME_MAX_WORDS`, `NAME_MAX_CHARS` | 7000, 3, 24 | `cam/index.html:1125-1130,1174` |
| Ikon | 39 entri, viewBox 48, stroke 2,6, `currentColor`, aksen `#E86435` | `icons.js` |
| R1 (§5.3.4) | lihat tabel | riset kursor |

Kalau nilai di file sandbox berbeda dari tabel ini, **file sandbox yang benar**. Worker mencatat selisihnya di laporan.

## Lampiran B. Rekonsiliasi copy (keputusan Owner)
| Lokasi | Teks sekarang | Masalah | Usulan |
|---|---|---|---|
| Kartu 2 (`kartu.js:27`, juga `tutorial-script.ts:22` di main) | "…benda padat kayak balok atau tangga… benda bahaya kayak duri…" | "balok" dan "duri" tidak ada di 20 kelas model | "…benda padat kayak tangga atau jembatan… benda bahaya kayak kaktus…" |
| `play.js:10` alasan gagal | "kena duri" | Duri di sini hazard panggung L2/L3, bukan label | Biarkan |
| `world-intro-script.ts:22,42` | "lantainya penuh duri" | Sama, hazard panggung | Biarkan |
| Rekap contoh `end.js:35-36` | balok, papan, tali | Data contoh | Tidak di-port. Rekap memakai data sesi |
| `levels.ts:157,175,202` judul | "Bab 1 · …" | Dosen melarang "bab" | "Level 1 · …" (O-8) |
| `StageArtwork.tsx:64-65` | "Lanjut ke / Bab 2" | Sama | "Lanjut ke / Level 2" |

Penerapan: perubahan di tabel ini masuk **modul copy r83** (`src/domain/copy/*`) dan prop opsional `StageArtwork`. `levels.ts`, `tutorial-script.ts`, dan copy layar lama **tidak diubah** selama layar lama masih ada, supaya E2E lama tetap sama dengan baseline. Baris "Bab → Level" sudah diputuskan (O-8), jadi langsung diterapkan di copy r83. Baris kartu 2 baru dipakai setelah Owner menyetujuinya di `COPY_RECONCILIATION.md`. Sebelum itu, worker memakai teks sandbox apa adanya dan menandainya `// COPY-PENDING-OWNER`.

Worker **tidak** mengubah copy di luar tabel ini. Copy lain disalin dari sandbox apa adanya.

## Lampiran C. Draf entri `DECISIONS.md` (ditulis hanya bila O-10 = tulis)
- **D-20261125-01, NUI hybrid satu gestur.**
  - Keputusan: satu gestur cubit untuk semua aksi siswa setelah kamera menyala. Aturan A (satu pilihan, cubit-tahan di mana saja), B (target terdekat menyala, dikunci saat cubit mulai), C (tarik; Thinman memakai joystick dari titik awal cubit; tap atau sentil = lompat), D (kursor hanya di kanvas: pensil/hapus, tunjuk lalu cubit). Ring ber-ikon cubit: 1000 ms untuk aksi biasa, 2000 ms untuk keputusan, 1500 ms untuk "Taruh di sini".
  - Mengubah: D-20261110-07, D-20261110-02 (bagian jempol), dan D-20261105-23 (bagian "semua jempol").
  - Sumber: diskusi Owner–Claude November 2026 dan sandbox r8.3.
- **D-20261125-02, "Level" menggantikan "Bab"** di teks siswa (permintaan dosen). Mengubah D-20261116-01 butir (3).
- **D-20261125-03, Identitas siswa = nama lewat suara.** Nomor absen dihapus setelah kontrak join Dias mendukung identitas tanpa nomor. Sampai saat itu nama diikuti penggaris hanya untuk link kelas.
- **D-20261125-04, Collider objek** sesuai O-6.
- **D-20261125-05, Penutup r8.3** (kolam tinta, rekap chat, Thinman bisa dijalankan, ring kembali ke sampul). Mengunci D-20261105-15.
- **D-20261125-06, Kanvas lima alat** (Pensil, Hapus parsial, Mundur, Maju, Bersihkan yang bisa di-undo), tanpa gestur jari untuk undo/redo.
- **D-20261125-07, Momo di kanvas.** Sesuai O-13 dan O-14: Momo tidak menggumamkan tebakan saat anak menggambar (default). Ring "Tebak Gambarku" dan pertanyaan Momo muncul 1 detik setelah tangan diam. Mengubah angka 10 detik di D-20261110-02.

## Lampiran D. Checklist webcam Owner (`WEBCAM_QA.md`)
Dijalankan di laptop Owner, Chrome, kamera bawaan. Kondisi: terang normal dan redup (lampu utama mati). Hasil diisi Owner: lulus/gagal plus catatan.

**G2, harness `/dev/nui`:**
1. Kursor tidak goyang saat tangan diam di kanvas mini. Dot berdiri tenang ±1 cm di layar.
2. A: cubit-tahan di mana saja mengisi ring. Lepas lalu ulang tidak meloncat.
3. B: dua target 64 px berjarak 24 px. Yang menyala sesuai arah tangan. Saat cubit, pilihan tidak pindah walau tangan goyang.
4. C: joystick bertambah cepat makin jauh. Tap = lompat. Sentil ke atas = lompat. Tidak ada lompat tak sengaja saat jalan.
5. D: titik awal goresan tidak meloncat dari titik bidik. Ujung goresan tidak berekor saat lepas.
6. Tangan keluar frame sebentar (<0,5 s): ring dan goresan tidak putus. Tangan teman masuk frame: kendali tidak pindah.
7. Redup: ulangi 1–5.

**G9, alur penuh mode r83 (backend lokal bila sempat):** sampul sampai penutup tanpa mouse setelah kamera menyala. Catat titik yang membingungkan atau lambat.

## Lampiran E. Koreksi dari v1 (verifikasi ulang 2026-11-25)
| # | v1 bilang | Fakta (bukti) | Dampak kalau tidak dikoreksi |
|---|---|---|---|
| 1 | Sandbox 83 file | 63 file. 83 = entri zip termasuk 20 folder (`unzip -Z1`) | P0 gagal verifikasi |
| 2 | Lima keputusan **aktif** ditimpa | Empat Aktif (D-20261110-07, -02, D-20261116-01, D-20261105-23) dan dua Belum dikunci (D-20261115-02, D-20261105-15) | Draf keputusan salah status |
| 3 | GuessRing "gumam tebakan sesuai sandbox" | Gumam sandbox dari heuristik demo (`canvas.js:65-69`); main sengaja diam (`DrawingScreen.tsx:85`, D-20261110-02) | Agent mengarang tebakan atau memanggil `/predict` tiap 500 ms → O-13 |
| 4 | Sandbox belum membuang Top-3 dari katalog | Sudah (`guess.js:28`) | Kecil, tapi klaimnya salah |
| 5 | `resolveHorizontalMovementIntent(input, axis?)` | Signature asli `(input, gameplay, settled)`; `axis` harus lewat `DirectionInput` → `game-controller.ts` → `integrated-scene.ts:185` | Worker mengubah signature dan memecah pemanggil `integrated-scene.ts:377` |
| 6 | `STAMP_HOLD_MS 2000` untuk ring stiker | Efektif 1000 karena `msFor` (`ui.js:139`, `hand.js:215`) | Ring Lempar dua kali lebih lama dari sandbox |
| 7 | `CARD_READ_MS 3300` | 3333 (`kartu.js:15`) | Paritas waktu |
| 8 | Ambang sentil sama untuk joystick dan stiker; tanpa syarat geser untuk tap | Joystick 40 px/140 ms + jeda 420 ms; stiker 50 px/160 ms; tap butuh geser ≤10 px | Lompat atau lempar tak sengaja |
| 9 | `glyphs.js` tidak di-port | `left`, `right`, `close` masih dirender (`kartu.js:98,137`) | Panah petunjuk kartu 1 dan badge bahaya hilang |
| 10 | Nama 1–40 karakter, tanpa angka (karangan v1) | Port `clean()` sandbox: maks 3 kata, 24 karakter, buang sapaan/awalan | Perilaku nama beda dari sandbox |
| 11 | Ikon punya warna tinta `#1d1d1b` | Ikon memakai `currentColor`; tinta dari CSS | Kecil |
| 12 | Catatan landmarker 3× di root `NOW.md` | Ada di `contexts/can/NOW.md` entri 0.27.0 | Rujukan salah |
| 13 | Main pilih level punya ring "Mulai Level" | Main: ring jempol "Mulai Bab n" (`LevelRibbonBookmark.tsx:394`) | Kecil |
| 14 | Frontend beda dari `81758b3` cuma satu fixture | Ditambah baris versi `package.json` | Kecil |

Yang dicek ulang dan **tetap benar**:
- upsert join (`classroom.py:73-92`) dan risiko data tercampur;
- drain 0,5× main vs 1,5× sandbox;
- `.onnx` di-gitignore dan tidak ada impor NUI Lab dari kode siswa;
- 20 label model;
- font Owner belum ada di main;
- 22 tes gagal bawaan (root `NOW.md:5`);
- konstanta fisika 1600/130/520;
- `ThumbConfirm` 1000|2000;
- `HandCursor.tsx` tidak dipakai;
- undo/redo 300 ms satu atau dua jari;
- `StoreOp` erase `{before, after}`;
- `output: "export"` dan `reactStrictMode`;
- 39 ikon;
- rumus joystick;
- `msFor`;
- angka R1 dari laporan riset;
- main `3908119` tanpa push baru (cek `ls-remote` 07:58 WIB).

## Lampiran F. Koreksi v3 (2026-11-25 — Mandat Owner: Plek UI & UX r8.3)
Diselaraskan terhadap isi aktual `sketchbook-universe-sandbox-r8.3` dan mandat Owner bahwa r8.3 adalah prototipe UI dan UX/perilaku yang disetujui:
1. **Font:** `shared/fonts.css` r8.3 memakai **Bowlby One + Hanken Grotesk (variable 400–900)**, bukan Architects Daughter.
2. **Sampul, posisi kamera & PIP (§7.1):** Susunan desktop dibalik (`FL`: kamera + Momo + `#gate` di atas, wordmark `SKETCHBOOK UNIVERSE` hijau tua + logo di bawah), kartu kamera melebar sebagian ke atas saat aktif lalu morph ke **PIP kiri-bawah** di semua halaman lengkap dengan indikator tangan live (`nui-pip-hand`).
3. **Transisi buka buku (§7.1):** Cover-matching 3D curl (`#book-front-cover`: tekstur serat abu-abu + dots + spiral atas + doodles, tanpa teks `#cover-hero`, tanpa scrim gelap `#ruler-scrim`) membuka halaman "SIAPA NAMAMU?".
4. **Transisi pasca-nama → Kartu tutorial (§7.1–7.2):** Setelah konfirmasi nama, elemen layar nama dianimasikan keluar ke atas (`finishAndGo`), lalu di `/onboarding/card` Momo terbang ke **tengah (`mid`)** terlebih dahulu menyapa nama siswa & mengenalkan 3 kartu panduan sebelum pindah ke **kanan bawah (`strip`)** dan men-deal 3 kartu oranye.
5. **Penutup 5 fase (§7.6):** Mencakup fase 1 **Terjun payung (`payung`)** sebelum Kolam tinta, lalu `bicara` dengan Thinman pose depan `thinrig` (tidak lagi dijalankan) + Momo di anchor `ending`, `rekap`, dan `akhir`.
6. **Tekstur kertas (§5.7):** Cover memakai tekstur serat abu-abu (`--su-paper-texture` + `::after`) + dots; halaman isi setelah cover murni kertas krem dot-grid 22 px + overlay grain statis ubin 256 px tanpa `mix-blend-mode`.
