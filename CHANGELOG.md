# CHANGELOG — Sketchbook Universe Engineering

Satu-satunya changelog engineering yang aktif. Riwayat lama (versi 0.0.x, skema sebelum 2026-11-12) ada di `docs/history/can/implementation-CHANGELOG.md` dan tidak diubah.

## Skema versi

Format: **`MAJOR.MINOR.PATCH-alpha.N`** (SemVer 2.0 dengan label pra-rilis).

| Bagian | Naik kapan |
|---|---|
| `MINOR` | Satu batch revisi Owner atau fitur baru (satu instruksi Owner dikerjakan sebagai satu paket). `PATCH` kembali ke 0. |
| `PATCH` | Hanya perbaikan, tanpa fitur baru. Belum dipakai. |
| `-alpha.N` | Setiap batch yang di-push ke `claude-monorepo`. `N` mulai dari 1 di setiap `MINOR` baru. |
| `-beta.N` | Hanya jika **Owner** menyatakan build aman diuji dengan pengguna. |
| tanpa label | Hanya jika **Owner** menyatakan proyek PA (final) selesai. |

Aturan:
- Sekarang semua versi `-alpha`. Label `-beta` dan rilis tanpa label ditetapkan Owner; AI tidak menaikkan label itu sendiri.
- `0.2.0` di `frontend/implementation/package.json` (sebelum skema ini, tanpa label) tidak dipakai lagi. Versi pertama skema ini adalah `0.3.0-alpha.1`, lebih baru dari 0.2.0. MINOR naik untuk tiap paket revisi Owner: 2026-11-09 (0.3.0), big prompt 2026-11-10 dengan lanjutannya 2026-11-11 (0.4.0), dan revisi 2026-11-12 (0.5.0).
- Dokumen, screenshot, atau bukti: tulis versi dan hash commit dari tabel di bawah (contoh: `0.4.0-alpha.2`, `308b125`).
- `contexts/can/REVISIONS.md`: `· Versi:` menunjuk versi tempat baris itu mencapai statusnya sekarang.
- `frontend/implementation/package.json` memakai versi terbaru di tabel.

## Daftar versi

| Versi | Tanggal (push terakhir) | Sumber revisi | Commit terakhir |
|---|---|---|---|
| 0.5.0-alpha.2 | 2026-11-12 | Owner 2026-11-12 (M-026, M-027) | `462ecdf` |
| 0.5.0-alpha.1 | 2026-11-12 | Owner 2026-11-12 (M-026) | `5d3fb2d` |
| 0.4.0-alpha.2 | 2026-11-11 | Owner 2026-11-11 (M-023 s/d M-025) | `286471a` |
| 0.4.0-alpha.1 | 2026-11-11 | Owner 2026-11-10, big prompt (M-022) | `66e9cb6` |
| 0.3.0-alpha.3 | 2026-11-09 | Owner 2026-11-09, PRD 0.0.16 (M-021) | `1b880fa` |
| 0.3.0-alpha.2 | 2026-11-09 | Kontrak classroom dan backend Dias (M-002) | `777e181` |
| 0.3.0-alpha.1 | 2026-11-09 | Integrasi monorepo (M-002, M-008) | `0a2c4ed` |

---

## 0.5.0-alpha.2 — 2026-11-12

**Sumber revisi:** Owner 2026-11-12 (M-026: NUI mode kamera tanpa tombol mouse/touch, REVISI-NUI; M-027: gabung ke `main`, push tetap ke `claude-monorepo`). REVISIONS R11-09, R11-12 (bukti browser), R11-13 s/d R11-18, R10-22 (audit Level 3, menunggu Owner).

**Perubahan:**
- Performa kamera: satu deteksi MediaPipe per frame untuk seluruh app, dengan budget adaptif (lewati frame bila deteksi lambat, minimal ±8/s). GPU software dilewati dan memakai CPU; inferensi dibatasi 50 %. Label "CPU (tanpa GPU)" di `/nui-lab`.
- Mode kamera: arah gameplay menerima tekan-diam (tanpa tombol), tanpa tombol mouse.
- Cover: cincin jempol menunggu keempat kalimat Momo selesai (penanda "kalimat selesai" di-reset saat Momo bangun).
- Tur kamera palsu: `e2e/visual-tour-camera.mjs` (cover sampai L1 menang tanpa tombol mouse/keyboard).
- Layout HP: PIP kamera tidak menutupi kartu rekap; pita "Mode demo" tidak menutupi Momo.
- `/nui-lab`: statistik deteksi (Hz, ms) dan delegate GPU/CPU.
- Gerbang test tangan memakai clock frame 33 ms.
- Dokumen: `contexts/can/REVISIONS.md` diperbarui (R11-12 s/d R11-18), audit Level 3 ditambahkan, merge `claude-monorepo` ke `main` dicatat (`main` = `35e3da3`).

**Commit:** `bcb154a`, `ba5c895`, `6786b80`, `d278c5e`, `62870b5`, `b27490c`, `8458ead`, `083b2f5`, `2e4dff7`, `b2eafd7`, `003e4a2`, `d121628`, `a8e913e`, `462ecdf`

**Bukti:** tidak ada log tersimpan di repo. Hasil uji kamera palsu dan browser ada di `contexts/can/REVISIONS.md` (R11-12, R11-13, R11-15). Kamera fisik belum diuji.

---

## 0.5.0-alpha.1 — 2026-11-12

**Sumber revisi:** Owner 2026-11-12 (M-026: "gausah onnx", NUI kamera tanpa tombol touch/mouse). M-024 (ONNX dinilai dulu). REVISIONS R11-07 (BATAL), R11-08, R11-11, R11-12 (mulai).

**Perubahan:**
- ONNX dibatalkan (R11-07). Kombinasi untuk pameran: MediaPipe + One Euro + CLAHE. Riset tetap disimpan di `contexts/can/docs/audit-2026-11-10/ONNX-HAND-RESEARCH.md`.
- Mode kamera: tombol mouse/touch dihapus dari mode kamera; semua kontrol juga menerima tekan-diam.
- `/nui-lab`: halaman uji deteksi tangan di laptop (tersembunyi, tidak ditautkan dari alur siswa).
- Layout: bubble Momo di rekap, kanvas di layar 390 px, PIP, dan pita "Mode demo" (CSS saja).
- Dokumen: keputusan ONNX dicatat, status nui-lab dan layout di REVISIONS.
- Lint: `counter-ref` bump untuk `/nui-lab` didokumentasikan.

**Commit:** `9c87e0f`, `c4d1988`, `d4a6497`, `7558c05`, `7ca3a2d`, `5d3fb2d`

**Bukti:** tidak ada log tersimpan di repo. Layout belum dicek visual (R11-11). `/nui-lab` belum dibuka di browser (R11-08). Kamera fisik belum diuji.

---

## 0.4.0-alpha.2 — 2026-11-11

**Sumber revisi:** Owner 2026-11-11 (M-023: D-20261110-01 s/d 10 disahkan, Thinman tetap dengan H, data dikirim saat siswa memilih Top-3; M-024: cover maksimal 10 detik, NUI akurat, tidak mendeteksi tangan orang lain; M-025: `REVISIONS.md`). REVISIONS R10-21 (JALAN), R11-01 s/d R11-06, R11-10.

**Perubahan:**
- Keputusan D-20261110-01 s/d 10 disahkan Owner. D-20261111-01 (data dikirim saat cincin keputusan Top-3) dicatat.
- Nama tokoh tetap **Thinman** (dengan H). "Finman" dari STT dikoreksi.
- `contexts/can/REVISIONS.md` dibuat sebagai daftar tugas revisi Owner dan statusnya.
- Cover: cincin jempol siap ±7,8 detik setelah lambaian (sebelumnya 20,8 detik). Kamera diminta 720p 24 s/d 60 fps.
- Deteksi tangan: kunci ke tangan pemain, abaikan tangan orang lain; `numHands` 2, confidence 0,6.
- Gambar: One Euro dengan dead zone lunak; getar diam 0,39 menjadi 0,08 px (sintetis).
- CLAHE untuk ruangan gelap, aktif otomatis (±2 ms per frame di sandbox).
- Tur visual mengikuti alur normal-journey (19 layar).

**Commit:** `b6b9374`, `108cb1a`, `0fa6b85`, `3f93fd6`, `a4bf4e7`, `47eadbb`, `3d7ddab`, `308b125`, `af84c71`, `286471a`

**Bukti:** matriks NUI di `contexts/can/docs/audit-2026-11-10/NUI-RESULTS.md`. Hasil e2e tur visual (19 layar PASS) dan angka unit ada di catatan commit; log lengkap di luar repo. Belum diukur di kamera fisik (R11-03 s/d R11-06 berstatus SELESAI-BELUM-KAMERA).

---

## 0.4.0-alpha.1 — 2026-11-11 (revisi Owner 2026-11-10)

**Sumber revisi:** Owner 2026-11-10: big prompt, PANDUAN NUI, REVISI-NUI-PA (M-022). Dokumen: `contexts/can/docs/audit-2026-11-10/` (BIGPROMPT-2026-11-10.md, PANDUAN-NUI-2026-11-10.md, REVISI-NUI-2026-11-10.md, DECISIONS-DRAFT-2026-11-10.md, CAN-FRONTEND-AUDIT.md, NUI-AUDIT.md). REVISIONS R10-01 s/d R10-24. Keputusan draf D-20261110-01 s/d 10.

**Perubahan:**
- Revert: Level 4 "Pembuktian" (ditambahkan 2026-11-09, lihat 0.3.0-alpha.3) dihapus atas instruksi Owner. Produk hanya tiga level; penutup setelah Bab 3.
- Restore: durasi kartu kembali ke `9f9d35d`; tutup kartu 1,0 s + jeda 1,1 s; `timeScale(6)` dan aturan `animation-duration:.01ms` dihapus. Reduced motion mengurangi amplitudo, tidak memotong durasi cerita.
- Momo: tidur bernapas, mengapung, miring; Zzz tiga huruf; bangun dengan dua kedipan; teks tebal; tidak ada skip efek ketik.
- Cover: cincin progres lambaian; kartu kamera mengecil ke PIP kiri bawah (juga tanpa kamera); Momo terbang ke tengah; cerita baru; jempol "Aku mengerti" membuka buku; warmup model tangan.
- Penggaris: mulai nomor 1; Momo fokus di tengah lalu ke kanan; pertanyaan hanya setelah digeser; pegangan 48×70; cubit untuk menggeser.
- Tutorial: brosur lebih besar; kartu 1 seret cubit ke bendera; cincin jempol terkunci dengan progres baca 10 detik; kartu 3 semua alat dicoba dengan tangan, penghapus ukuran tetap.
- Pilih bab dengan 1/2/3 jari + cincin; intro level dengan latar gelap, Momo 290 px bergerak, naik awan 2,1 detik; route kanvas `/canvas1..3`.
- Kanvas: fase fokus (sekali per level); hanya cubit menggores; telapak terbuka = maju; diam 10 detik membuat Momo bertanya dan indikator jempol menyala.
- Top-3 dan layar gagal: pilih dengan jari + cincin (tanpa kursor); jempol tidak memilih kandidat.
- Stiker di kanvas: "Lempar" (jempol) dan "Gambar lagi" (telapak); popup "Masukkan ke dunia" dihapus.
- Penempatan: Taruh (jempol), Geser (cubit), Putar 90° (telapak) dengan collider berputar. Kontrol Thinman dengan sudut telunjuk + speedometer.
- Penutup: portal, pesan Momo tentang AI, rekap netral, tempat kuis dengan flag (`contracts/QUIZ_TOGGLE_PROPOSAL.md`).
- Prediksi: pemetaan label model Dias ke tampilan Indonesia (`contracts/LABEL_MAP_PROPOSAL.md`); tebakan demo tidak dikirim ke data kelas; token siswa tidak dikirim ke endpoint prediksi. Model asli belum bisa main (R10-17 BLOKIR).
- Input: `countExtendedFingers`, pose satu/tiga jari, router mode tunggal `src/input/gesture-mode.ts`, pembaca tangan bersama untuk tombol.
- Rotasi objek dengan memutar telapak terbuka, dua arah (`408a180`, `80cdba2`).
- Mouse fallback tetap ada setelah refresh; mode kamera diam-diam (`f16b99a`).
- E2E recovery mengikuti reposition dan alur lanjut (`66e9cb6`).
- Catatan: `f8afb71` dan `9b80137` berstatus checkpoint WIP (pesan commit: "not pushed"); keduanya ikut ter-push bersama `64c4160`.

**Commit:** `f8afb71`, `9b80137`, `64c4160`, `43e4cc3`, `b015c94`, `c54082a`, `408a180`, `8d27afc`, `80cdba2`, `f16b99a`, `66e9cb6`

**Bukti:**
- `docs/migration/evidence/iter5/summary.txt` (dari `c54082a`): finish flow 12/12 PASS; journey L1 s/d L3 dan penutup PASS; recovery 14/16 (summary mencatat FAIL "B: setelah Gambar ulang dengan label solid, level bisa dimenangkan"). Hasil ulang setelah `f16b99a` dan `66e9cb6` tidak tersimpan di repo.
- Bukti tambahan: `docs/migration/evidence/iter5/journey-evidence.json`, `finish-evidence.json`.

---

## 0.3.0-alpha.3 — 2026-11-09

**Sumber revisi:** Owner 2026-11-09 (M-021: eksekusi PRD 0.0.16 dengan agent team; QA harus lulus sebelum push; instruksi "selesai gambar = tahan jempol 2 detik"). PRD: `contexts/can/project/PRD_REVISI_0.0.16.md`; keputusan D-20261105-23 dan D-20261105-24 (M-019, M-020). Belum ada ID R (REVISIONS.md dibuat 2026-11-11).

**Perubahan:**
- Selesai gambar = tahan jempol 2 detik. Momo diam selama menggambar; tebakan dan Top-3 baru muncul setelah itu. Menggantikan auto-ask lama. Tombol Tebak tetap ada untuk mouse.
- Klasifikasi pose tangan: cubit tidak lagi terbaca kepal; histeresis dan voting 3 dari 5 frame; coretan tidak putus oleh hilang tracking di bawah 150 ms; undo dan redo dilonggarkan untuk tangan anak.
- Penghapus sebagian (kepal), ukuran diatur tangan kedua (cubit), roda mouse, tombol `[` dan `]`, tombol S/M/L.
- Kartu tutorial memakai cincin cubit; kontras cincin jempol dan cubit diperbaiki.
- `DwellButton` (pilih dengan melayang ±1,2 detik) dan `hand-cursor-store`: satu pembaca tangan memberi kursor ke semua tombol (Top-3, keputusan, layar gagal, tombol sudut, Tebak, misi).
- Panduan kontrol Thinman (kiri, kanan, lompat). Kontrol tangan otomatis di mode kamera.
- Collider Level 2: tiga gedung menjadi blok padat sampai dasar halaman; pijakan bawah diperpanjang ke dinding (gambar ikut berubah).
- Gambar asli siswa tampil sebagai objek di dunia, dengan label, tanpa kotak pembungkus.
- Level 4 "Pembuktian" ditambahkan (dihapus lagi di 0.4.0-alpha.1).
- Cincin selesai-gambar yang tertutup kartu kamera di kiri bawah dipindah ke kanan bawah.
- UX chat Momo: efek ketik bisa dilewati, `prefers-reduced-motion` dihormati, baris panjang dipecah.

**Commit:** `9ba76d2`, `1b880fa`

**Bukti:**
- `docs/migration/evidence/iter4/run6-summary.txt`: TSC 0; ESLint tanpa peringatan; vitest 156 berkas, 1178 test lulus; build 0; recovery 16/16; finish flow 12/12; journey PASS.
- `docs/migration/evidence/iter4/` (screenshot finish-flow, recovery, journey, dan `evidence.json`).

---

## 0.3.0-alpha.2 — 2026-11-09

**Sumber revisi:** Kontrak classroom dan backend Dias, dengan adapter klasifikasi dari kontrak partner (M-002). Audit kesiapan `main` (`777e181`). Belum ada ID R.

**Perubahan:**

*Can — Student Game*
- Outbox tidak pernah mengirim setelah enqueue. Sekarang `enqueue*` memicu proses, dan retry dijadwalkan setelah backoff (`tests/api/outbox-delivery.test.ts`).
- `resume()` mengirim ulang job yang tertinggal di `sending`. `requeueUnauthorized()` mengirim ulang job yang diblokir 401 setelah join ulang. Outcome yang menunggu submission tidak lagi memutar loop.
- `submission-client.ts` mengikuti skema backend: respons `{id, status}`, outcome `PATCH`. Test `tests/api/contract-fixtures.test.ts` memakai fixture bersama dengan backend.
- Konteks kelas dibaca lewat ref (`SketchbookApp.tsx`), bukan closure usang. Parameter link `?kelas=` diterima (link dari dashboard).
- Token kelas disimpan bersama sesi siswa (`classContextFrom`), jadi reload tanpa `?kelas=` tetap mengirim. Kegagalan kirim tidak menjadi unhandled rejection di gameplay.

*Dias — Backend, Model, Admin*
- Join kelas mengembalikan `student_session_token` (SHA-256 disimpan di `student_sessions`).
- `POST /api/submissions` wajib Bearer token. Idempoten lewat `submission_key` (unique `(student_id, submission_key)`). Respons 201 `created` atau 200 `duplicate`.
- `PATCH /api/submissions/{id}/outcome` (sebelumnya tidak ada).
- CORS dari env `CORS_ORIGINS`, `allow_credentials=False`. Sebelumnya `*` dengan credentials.
- Migrasi: kolom submission ditambahkan otomatis (`_migrate` di `backend/app/db.py`).
- Compose: `CORS_ORIGINS` untuk backend.
- Sesi siswa kedaluwarsa dihapus saat join. `/predict` menolak gambar di atas 20.000 titik (422).

*Shared Integration*
- Test: `tests/integration/test_classroom_contract.py` (11), `tests/integration/verify_backend.py` (20 probe runtime dengan bobot asli).
- Test: `frontend/implementation/e2e/classroom-e2e.mjs` (17 cek, langsung dan via Caddy).
- Kontrak: `contracts/fixtures/` dipakai dua sisi. `contracts/openapi.json` diekspor ulang (18 path). `API_INVENTORY.md` diperbarui.
- Audit: `docs/migration/PORT_AUDIT.md`. 50 file donor `PORT_NEEDED` dicek satu per satu.
- Known: `prediction_id` belum dihasilkan backend. Build image Docker belum dibuktikan (daemon tidak ada).

**Commit:** `dd46572`, `777e181`

**Bukti:** `docs/migration/evidence/classroom/` (`classroom-e2e-caddy.json`, `classroom-e2e-direct.log`, screenshot dashboard dan game), `docs/migration/evidence/backend_verify.json`, `docs/migration/evidence/backend_verify.out`. Semua di dalam repo.

---

## 0.3.0-alpha.1 — 2026-11-09

**Sumber revisi:** Integrasi monorepo: game Can (`frontend/implementation/`) dan backend Dias dalam satu workspace (M-002). Governance Can di `contexts/can/` ("per owner instruction", `05b3558`). Identitas commit Owner (M-008).

**Perubahan:**
- Staging: game dipindah ke `frontend/implementation/` (baseline `d4bbaec`). Governance Can di `contexts/can/` (byte-preserved).
- Staging: `frontend/implementation/Dockerfile` ditambahkan dari donor Dias (service `web` membutuhkannya). `frontend/implementation/.dockerignore` ditambahkan.
- Staging: path aset di `icon-gestures.test.tsx` dipindah ke `contexts/can/design/`.
- Staging: Caddy membatasi badan permintaan ke backend 1 MB (`deploy/Caddyfile`).
- REST API client Bagian II, prediction receipts, dan outbox durable (`1a3eb9f`): `classroom-client.ts`, `http-client.ts`, `outbox.ts`, `submission-client.ts`, hook `useClassroomSession`.
- Submission adapter tersambung ke state machine dan app (`d4bbaec`): mengirim `join_token`, `student_id`, dan `candidates`. Tidak mengirim saat di luar kelas.

**Commit:** `1a3eb9f`, `d4bbaec` (baseline, sudah ada di `can`), `fe73df3`, `05b3558`, `0a2c4ed`

**Bukti:** log gerbang lokal `docs/migration/evidence/can-test-rerun.log` (vitest 667/667 lulus setelah rerun; log pertama 4 gagal). Log ini di-ignore git (`*.log`), jadi tidak ter-commit.

---

## Riwayat sebelum monorepo

- Can (versi lama 0.0.x): `docs/history/can/`. Label lama tidak dipakai lagi untuk nomor baru. PRD Revisi 0.0.16 diselesaikan di 0.3.0-alpha.3.
- Dias: `docs/history/dias/`.

---

## Lampiran: isi CHANGELOG sebelum skema versi (apa adanya, 2026-11-12)

Disalin utuh dari `CHANGELOG.md` di `462ecdf` supaya tidak ada catatan lama yang hilang saat disusun ulang per versi. Judul digeser satu tingkat.


### [Unreleased]

#### Can — Student Game: restorasi dan NUI (Owner 2026-11-10, big prompt + REVISI-NUI)
Draft keputusan: `contexts/can/docs/audit-2026-11-10/DECISIONS-DRAFT-2026-11-10.md`. Audit: `CAN-FRONTEND-AUDIT.md`, `NUI-AUDIT.md` di folder yang sama.
- Revert: Level 4 dihapus. Hanya tiga level; penutup setelah Bab 3.
- Restore: durasi kartu kembali ke `9f9d35d`; tutup kartu 1,0 s + jeda 1,1 s; `timeScale(6)` dan aturan `animation-duration:.01ms` dihapus. Reduced motion mengurangi amplitudo, tidak memotong durasi cerita.
- Momo: tidur bernapas, mengapung, miring; Zzz tiga huruf; bangun dengan dua kedipan; teks tebal; tidak ada skip efek ketik.
- Cover: cincin progres lambaian; kartu kamera mengecil ke PIP kiri bawah (juga tanpa kamera); Momo terbang ke tengah; cerita baru; jempol "Aku mengerti" membuka buku; warmup model tangan.
- Penggaris: mulai nomor 1; Momo fokus di tengah lalu ke kanan; pertanyaan hanya setelah digeser; pegangan 48×70; cubit untuk menggeser.
- Tutorial: brosur lebih besar; kartu 1 seret cubit ke bendera; cincin jempol terkunci dengan progres baca 10 s; kartu 3 semua alat dicoba dengan tangan, penghapus ukuran tetap.
- Pilih bab dengan 1/2/3 jari + cincin; intro level dengan latar gelap, Momo 290 px bergerak, naik awan 2,1 s; route kanvas `/canvas1..3`.
- Kanvas: fase fokus (sekali per level); hanya cubit menggores; telapak terbuka = maju; diam 10 s → Momo bertanya + indikator jempol menyala.
- Top-3 dan layar gagal: pilih dengan jari + cincin (tanpa kursor); jempol tidak memilih kandidat.
- Stiker di kanvas: "Lempar" (jempol) dan "Gambar lagi" (telapak); popup "Masukkan ke dunia" dihapus.
- Penempatan: Taruh (jempol), Geser (cubit), Putar 90° (telapak) dengan collider berputar. Kontrol Thinman dengan sudut telunjuk + speedometer.
- Penutup: portal, pesan Momo tentang AI, rekap netral, tempat kuis dengan flag (`contracts/QUIZ_TOGGLE_PROPOSAL.md`).
- Prediksi: pemetaan label model Dias ke tampilan Indonesia (`contracts/LABEL_MAP_PROPOSAL.md`); tebakan demo tidak dikirim ke data kelas; token siswa tidak dikirim ke endpoint prediksi.
- Input: `countExtendedFingers`, pose satu/tiga jari, router mode tunggal `src/input/gesture-mode.ts`, pembaca tangan bersama untuk tombol.

#### Can — Student Game
- Staging: game dipindah ke `frontend/implementation/` (baseline `d4bbaec`). Governance Can di `contexts/can/` (byte-preserved).
- Fix: outbox tidak pernah mengirim setelah enqueue. Sekarang `enqueue*` memicu proses, dan retry dijadwalkan setelah backoff (`tests/api/outbox-delivery.test.ts`).
- Fix: `submission-adapter` mengirim `join_token`, `student_id`, dan `candidates`. Tidak mengirim saat di luar kelas.
- Fix: parameter link `?kelas=` diterima (link dari dashboard).
- Contract: `submission-client.ts` mengikuti skema backend. Respons `{id, status}`. Outcome `PATCH`.
- Fix: konteks kelas dibaca lewat ref (`SketchbookApp.tsx`), bukan closure usang.
- Test: `tests/api/contract-fixtures.test.ts` memakai fixture bersama dengan backend.
- Fix: outbox `resume()` mengirim ulang job yang tertinggal di `sending`. `requeueUnauthorized()` mengirim ulang job yang diblokir 401 setelah join ulang. Outcome yang menunggu submission tidak lagi memutar loop.
- Fix: token kelas disimpan bersama sesi siswa (`classContextFrom`), jadi reload tanpa `?kelas=` tetap mengirim. Kegagalan kirim tidak jadi unhandled rejection di gameplay.
- Change (Owner 2026-11-09): selesai gambar = tahan jempol 2 detik. Momo diam selama menggambar, tebakan dan Top-3 baru muncul setelah itu. Menggantikan R11 (auto-ask setelah tangan diam dan tebakan sementara). Tombol Tebak tetap ada untuk mouse.
- Fix: klasifikasi pose tangan. Cubit tidak lagi terbaca kepal. Histeresis dan voting 3 dari 5 frame. Coretan tidak putus oleh hilang tracking di bawah 150 ms. Undo dan redo dilonggarkan untuk tangan anak.
- Feature: penghapus sebagian (kepal), ukuran diatur tangan kedua (cubit), roda mouse, `[` dan `]`, tombol S/M/L.
- Feature: kartu tutorial memakai cincin cubit. Kontras cincin jempol dan cubit diperbaiki.
- Feature: `DwellButton` (pilih dengan melayang ±1,2 detik) dan `hand-cursor-store`: satu pembaca tangan memberi kursor ke semua tombol. Dipakai di Top-3, keputusan, layar gagal, tombol sudut, Tebak, misi.
- Feature: panduan kontrol Thinman (kiri, kanan, lompat). Kontrol tangan otomatis di mode kamera.
- Fix: collider Level 2. Tiga gedung menjadi blok padat sampai dasar halaman. Pijakan bawah diperpanjang ke dinding (gambar ikut berubah).
- Feature: gambar asli siswa tampil sebagai objek di dunia, dengan label, tanpa kotak pembungkus.
- Revert: Level 4 "Pembuktian" (ditambah 2026-11-09) dihapus atas instruksi Owner 2026-11-10. Produk hanya tiga level; penutup setelah Bab 3.
- Fix: cincin selesai-gambar tertutup kartu kamera di kiri bawah. Dipindah ke kanan bawah.
- Change: UX chat Momo. Efek ketik bisa dilewati, `prefers-reduced-motion` dihormati, baris panjang dipecah.
- Staging: `frontend/implementation/Dockerfile` ditambahkan dari donor Dias (service `web` membutuhkannya).
- Staging: `frontend/implementation/.dockerignore` ditambahkan.
- Staging: path aset di `icon-gestures.test.tsx` dipindah ke `contexts/can/design/`.

#### Dias — Backend, Model, Admin
- Feature: join kelas mengembalikan `student_session_token` (SHA-256 disimpan di `student_sessions`).
- Feature: `POST /api/submissions` wajib Bearer token. Idempoten lewat `submission_key` (unique `(student_id, submission_key)`). Respons 201 `created` atau 200 `duplicate`.
- Feature: `PATCH /api/submissions/{id}/outcome` (sebelumnya tidak ada).
- Security: CORS dari env `CORS_ORIGINS`, `allow_credentials=False`. Sebelumnya `*` dengan credentials.
- Migrasi: kolom submission ditambahkan otomatis (`_migrate` di `db.py`).
- Compose: `CORS_ORIGINS` untuk backend.
- Security: sesi siswa kedaluwarsa dihapus saat join. `/predict` menolak gambar di atas 20.000 titik (422).
- Deploy: Caddy membatasi badan permintaan ke backend 1 MB.

#### Shared Integration
- Test: `tests/integration/test_classroom_contract.py` (11), `tests/integration/verify_backend.py` (20 probe runtime dengan bobot asli).
- Test: `frontend/implementation/e2e/classroom-e2e.mjs` (17 cek, langsung dan via Caddy).
- Kontrak: `contracts/fixtures/` dipakai dua sisi. `contracts/openapi.json` diekspor ulang (18 path). `API_INVENTORY.md` diperbarui.
- Audit: `docs/migration/PORT_AUDIT.md`. 50 file donor `PORT_NEEDED` dicek satu per satu.
- Bukti: `docs/migration/evidence/`.
- Known: `prediction_id` belum dihasilkan backend. Build image Docker belum dibuktikan (daemon tidak ada).

### Pre-monorepo history
- Can: `docs/history/can/`
- Dias: `docs/history/dias/`
