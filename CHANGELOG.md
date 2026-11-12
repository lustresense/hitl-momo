# CHANGELOG — Sketchbook Universe Engineering

Satu-satunya changelog engineering yang aktif. **Entri terbaru ada di atas.** Riwayat lama (versi 0.0.x, sebelum monorepo) ada di `docs/history/can/implementation-CHANGELOG.md` dan tidak diubah. Arsip changelog sebelum skema versi ada di lampiran paling bawah.

## Skema versi

Format: **`MAJOR.MINOR.PATCH-alpha`** (tanpa nomor `.N`).

| Bagian | Naik kapan |
|---|---|
| `MAJOR` | Tetap `0` sampai Owner memutuskan lain. |
| `MINOR` | Push yang menambah fitur atau membawa batch revisi Owner. `PATCH` kembali ke 0. |
| `PATCH` | Push yang hanya memperbaiki, menguji, atau mendokumentasikan. |
| `-alpha` | Masih dalam pengembangan. Semua versi sekarang `-alpha`. |
| `-beta` | Hanya jika **Owner** menyatakan build aman diuji dengan pengguna. |
| tanpa label | Rilis, hanya jika **Owner** menyatakan PA selesai. |

Aturan:
- Setiap push ke `claude-monorepo` = satu versi dan satu entri. Setiap perubahan yang diterima, termasuk hasil worker yang di-push lead, dapat versi sendiri.
- AI tidak mengubah label `-beta` atau label rilis.
- Penomoran dimulai dari `0.1.0-alpha` (push pertama monorepo, `fe73df3`). Versi `0.2.0` dari `package.json` lama tidak dipakai lagi.
- Cara membaca, contoh: `0.6.2-alpha` = versi dev (alpha) dari paket fitur ke-6 (`0.6`), patch ke-2 sesudah paket itu (`.2`).
- Setiap entri berisi: versi, tanggal (tanggal push), tipe (Fitur / Perbaikan / Dokumen / Tes), Sumber (pesan Owner, ID REVISIONS R10-xx/R11-xx, atau mandat M-0xx), perubahan, commit, dan bukti.
- `contexts/can/REVISIONS.md`: `· Versi:` menunjuk versi tempat baris itu berada, memakai pemetaan di bawah.
- `frontend/implementation/package.json` memakai versi terbaru di daftar ini.

### Pemetaan versi lama ke baru

Versi `-alpha.N` lama dipetakan ke versi baru dari push terakhir grup lama (kolom "Commit terakhir" di tabel lama).

| Versi lama | Versi baru | Commit terakhir |
|---|---|---|
| 0.3.0-alpha.1 | 0.1.1-alpha | `0a2c4ed` |
| 0.3.0-alpha.2 | 0.2.1-alpha | `777e181` |
| 0.3.0-alpha.3 | 0.3.0-alpha | `1b880fa` |
| 0.4.0-alpha.1 | 0.6.2-alpha | `66e9cb6` |
| 0.4.0-alpha.2 | 0.10.1-alpha | `286471a` |
| 0.5.0-alpha.1 | 0.11.3-alpha | `5d3fb2d` |
| 0.5.0-alpha.2 | 0.12.1-alpha | `462ecdf` |

## Daftar versi

| Versi | Tanggal | Tipe | Commit |
|---|---|---|---|
| 0.12.8-alpha | 2026-11-12 | Perbaikan | `(0.12.8-alpha)` |
| 0.12.7-alpha | 2026-11-12 | Perbaikan | `(0.12.7-alpha)` |
| 0.12.6-alpha | 2026-11-12 | Dokumen | `(0.12.6-alpha)` |
| 0.12.5-alpha | 2026-11-12 | Dokumen | `(0.12.5-alpha)` |
| 0.12.4-alpha | 2026-11-12 | Dokumen | `(0.12.4-alpha)` |
| 0.12.3-alpha | 2026-11-12 | Dokumen | `(0.12.3-alpha)` |
| 0.12.2-alpha | 2026-11-12 | Dokumen | `385715b` |
| 0.12.1-alpha | 2026-11-12 | Tes | `462ecdf` |
| 0.12.0-alpha | 2026-11-12 | Fitur | `a8e913e` |
| 0.11.15-alpha | 2026-11-12 | Perbaikan | `d121628` |
| 0.11.14-alpha | 2026-11-12 | Dokumen | `003e4a2` |
| 0.11.13-alpha | 2026-11-12 | Dokumen | `b2eafd7` |
| 0.11.12-alpha | 2026-11-12 | Perbaikan | `2e4dff7` |
| 0.11.11-alpha | 2026-11-12 | Dokumen | `083b2f5` |
| 0.11.10-alpha | 2026-11-12 | Dokumen | `8458ead` |
| 0.11.9-alpha | 2026-11-12 | Tes | `b27490c` |
| 0.11.8-alpha | 2026-11-12 | Dokumen | `62870b5` |
| 0.11.7-alpha | 2026-11-12 | Perbaikan | `d278c5e` |
| 0.11.6-alpha | 2026-11-12 | Perbaikan | `6786b80` |
| 0.11.5-alpha | 2026-11-12 | Perbaikan | `ba5c895` |
| 0.11.4-alpha | 2026-11-12 | Dokumen | `bcb154a` |
| 0.11.3-alpha | 2026-11-12 | Perbaikan | `5d3fb2d` |
| 0.11.2-alpha | 2026-11-12 | Dokumen | `7ca3a2d` |
| 0.11.1-alpha | 2026-11-12 | Perbaikan | `7558c05` |
| 0.11.0-alpha | 2026-11-12 | Fitur | `c4d1988`, `d4a6497` |
| 0.10.2-alpha | 2026-11-12 | Dokumen | `9c87e0f` |
| 0.10.1-alpha | 2026-11-11 | Dokumen | `286471a` |
| 0.10.0-alpha | 2026-11-11 | Fitur | `af84c71` |
| 0.9.0-alpha | 2026-11-11 | Fitur | `308b125` |
| 0.8.0-alpha | 2026-11-11 | Fitur | `3d7ddab` |
| 0.7.1-alpha | 2026-11-11 | Tes | `47eadbb` |
| 0.7.0-alpha | 2026-11-11 | Fitur | `a4bf4e7` |
| 0.6.6-alpha | 2026-11-11 | Dokumen | `3f93fd6` |
| 0.6.5-alpha | 2026-11-11 | Dokumen | `0fa6b85` |
| 0.6.4-alpha | 2026-11-11 | Dokumen | `108cb1a` |
| 0.6.3-alpha | 2026-11-11 | Dokumen | `b6b9374` |
| 0.6.2-alpha | 2026-11-11 | Tes | `66e9cb6` |
| 0.6.1-alpha | 2026-11-11 | Perbaikan | `f16b99a` |
| 0.6.0-alpha | 2026-11-11 | Fitur | `80cdba2` |
| 0.5.1-alpha | 2026-11-11 | Tes | `8d27afc` |
| 0.5.0-alpha | 2026-11-11 | Fitur | `408a180` |
| 0.4.3-alpha | 2026-11-11 | Tes | `c54082a` |
| 0.4.2-alpha | 2026-11-11 | Dokumen | `b015c94` |
| 0.4.1-alpha | 2026-11-11 | Perbaikan | `43e4cc3` |
| 0.4.0-alpha | 2026-11-11 | Fitur | `64c4160` (dengan WIP `f8afb71`, `9b80137`) |
| 0.3.0-alpha | 2026-11-09 | Fitur | `1b880fa` (dengan `9ba76d2`) |
| 0.2.1-alpha | 2026-11-09 | Perbaikan | `777e181` |
| 0.2.0-alpha | 2026-11-09 | Fitur | `dd46572` |
| 0.1.1-alpha | 2026-11-09 | Dokumen | `0a2c4ed` (dengan `05b3558`) |
| 0.1.0-alpha | 2026-11-09 | Fitur | `fe73df3` |

---

## 0.12.8-alpha — 2026-11-12 — Perbaikan

**Sumber:** Owner 2026-11-12 (screenshot perangkat asli), REVISIONS R12-02

**Perubahan:**
- Momo tidur tetap hidup saat animasi sistem dikurangi: napas, melayang, angguk 60 % (sebelumnya 35 %, tampak beku).
- Tiga huruf Zzz tidak lagi menumpuk menjadi satu "z"; masing-masing naik pelan.
- REVISIONS: status R12-02 dan R12-04.

**Commit:** commit berjudul `(0.12.8-alpha)`

**Bukti:** vitest momo-sleep-alive 7/7, momo-sleep-wake 17/17, reduced-motion 4/4; tsc bersih; belum dilihat di perangkat Owner

---

## 0.12.7-alpha — 2026-11-12 — Perbaikan

**Sumber:** Owner 2026-11-12, REVISIONS R12-04 (M-019)

**Perubahan:**
- Buka buku semi-3D: lembar berengsel di tepi atas naik ke atas dengan perspektif, tanpa miring ke samping.
- Bayangan lembut menyapu halaman di bawahnya; tebal kertas terlihat di tepi bawah; tanpa kilatan di awal.
- Reduced motion: durasi tetap 0,9 s, hanya bayangan yang diam.

**Commit:** commit berjudul `(0.12.7-alpha)`

**Bukti:** vitest BookFlip 13/13, 18 file cover/kamera 117 lulus; tsc bersih; tampilan belum dilihat di browser

---

## 0.12.6-alpha — 2026-11-12 — Dokumen

**Sumber:** Owner 2026-11-12 (screenshot perangkat asli), REVISIONS R12-01..06

**Perubahan:**
- REVISIONS: revisi R12-01..R12-06 (judul cover, animasi tidur Momo, transisi Momo dan latar, buka buku, lambaian cepat dan akurat, cara kerja).
- Salinan aturan versi dan rilis di `contexts/can/AGENTS.md` supaya tetap berlaku bila aturan global diubah.
- Screenshot Owner disimpan: `contexts/can/docs/audit-2026-11-10/owner-2026-11-12-cover.webp`.

**Commit:** commit berjudul `(0.12.6-alpha)`

**Bukti:** Dokumen saja

---

## 0.12.5-alpha — 2026-11-12 — Dokumen

**Sumber:** Owner 2026-11-12 (M-030), alur rilis

**Perubahan:**
- `main` digabung ke `claude-monorepo` sebelum rilis: `Proposal/` dan `LICENSE.md` dari main lama kini juga ada di `claude-monorepo`.
- Sesudah ini `main` diperbarui dengan fast-forward dari `claude-monorepo`.

**Commit:** commit berjudul `(0.12.5-alpha)`

**Bukti:** Tidak ada perubahan kode; gerbang terakhir: tsc, eslint, vitest 243/1894 lulus; e2e journey, recovery 16/16 lulus

---

## 0.12.4-alpha — 2026-11-12 — Dokumen

**Sumber:** Owner 2026-11-12 (M-030)

**Perubahan:**
- Versi global untuk seluruh repo: file `VERSION` di root; game, dashboard admin, dan backend memakai nomor yang sama.
- Skrip `scripts/bump_version.py` menaikkan versi dan menulis entri CHANGELOG di paling atas; `--check` memeriksa semua angka sama.
- Aturan wajib di `AGENTS.md` root: satu versi per push, agen memberi tahu versi ke Owner, kerja yang sudah hijau dibawa dari `claude-monorepo` ke `main` tanpa force push.
- Aturan ini juga dirujuk dari `contexts/can/AGENTS.md`; mandat M-030 dicatat.

**Commit:** commit berjudul `(0.12.4-alpha)`

**Bukti:** bump_version.py --check: ok

---

## 0.12.3-alpha — 2026-11-12 — Dokumen

**Sumber:** Owner 2026-11-12 (M-028, M-029)

**Perubahan:**
- Skema versi diganti menjadi `0.MINOR.PATCH-alpha` tanpa `.N`: satu versi per push, MINOR untuk fitur/paket revisi Owner, PATCH untuk perbaikan, tes, dan dokumen.
- Semua versi lama dinomori ulang (0.1.0-alpha s/d 0.12.2-alpha) dan disusun terbaru di atas.
- Tabel OWNER_MANDATES dibalik (terbaru di atas); M-028 dan M-029 dicatat.
- Catatan `· Versi:` di REVISIONS memakai nomor baru.

**Commit:** commit berjudul `(0.12.3-alpha)` di `claude-monorepo`

**Bukti:** Hash yang dikutip dicek dengan git cat-file; isi REVISIONS dan mandat sama kecuali nomor versi dan urutan.

---

## 0.12.2-alpha — 2026-11-12 — Dokumen

**Sumber:** Owner 2026-11-12: changelog wajib berversi (M-028).

**Perubahan:**
- CHANGELOG versi pertama dengan skema `-alpha.N`, berisi daftar versi dari push `claude-monorepo`; riwayat lama dilampirkan utuh.
- `frontend/implementation/package.json` diisi `0.5.0-alpha.2`; `contexts/can/REVISIONS.md` mencatat versi tiap baris.

**Commit:** `385715b`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.12.1-alpha — 2026-11-12 — Tes

**Sumber:** REVISIONS R11-13 (gerbang uji tangan saat performa kamera).

**Perubahan:**
- Tes gameplay tangan memakai clock frame 33 ms. Gerbang inferensi bersama memakai anggaran waktu dinding, jadi frame cepat di mesin yang sibuk tidak membuat voting steering gagal.

**Commit:** `462ecdf`

**Bukti:** Jumlah tes tidak dicatat di commit (bukti di luar repo).

---

## 0.12.0-alpha — 2026-11-12 — Fitur

**Sumber:** REVISIONS R11-18 (`/nui-lab` menampilkan statistik deteksi dan delegate).

**Perubahan:**
- `/nui-lab` mendeteksi lewat gerbang bersama dan menampilkan Hz efektif, rata-rata inferensi, busy %, delegate (GPU / CPU / CPU tanpa GPU), alasan, dan status ganti delegate.

**Commit:** `a8e913e`

**Bukti:** Tidak ada uji tercatat di commit. Belum dibuka di browser (R11-08); kamera fisik belum diuji.

---

## 0.11.15-alpha — 2026-11-12 — Perbaikan

**Sumber:** REVISIONS R11-11 dan R11-16 (tata letak HP).

**Perubahan:**
- Pita "Mode demo" tidak lagi menutupi Momo pada lebar 640 px ke bawah.
- Layar penutup menyisakan 124 px supaya PIP kamera tidak menutupi kartu rekap.
- Hanya CSS; tampilan 1280×720 tidak berubah.

**Commit:** `d121628`

**Bukti:** Tes `narrow-layout-leftovers.test.ts` ditambahkan. Cek visual belum dilakukan.

---

## 0.11.14-alpha — 2026-11-12 — Dokumen

**Sumber:** REVISIONS R10-22 (audit Level 3, menunggu Owner).

**Perubahan:**
- Audit Level 3 terhadap brief Owner ditambahkan di `contexts/can/docs/audit-2026-11-10/L3-AUDIT.md`. Status R10-22 tetap MENUNGGU OWNER.

**Commit:** `003e4a2`

**Bukti:** Tidak ada uji (dokumen). Isi audit ada di `L3-AUDIT.md`.

---

## 0.11.13-alpha — 2026-11-12 — Dokumen

**Sumber:** REVISIONS R11-15.

**Perubahan:**
- Catatan urutan cincin cover di `REVISIONS.md` diperbaiki.

**Commit:** `b2eafd7`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.11.12-alpha — 2026-11-12 — Perbaikan

**Sumber:** REVISIONS R11-15 (cek waktu cover mode kamera).

**Perubahan:**
- Cincin jempol cover menunggu empat kalimat Momo. Penanda "kalimat selesai" dari sapaan tidur ("Zzz...") di-reset saat Momo bangun. Sebelumnya cincin muncul sebelum kalimat selesai (2,1 detik di browser).
- Cincin bisa ditahan sekitar 7,8 detik, dengan keempat kalimat tampil berurutan.

**Commit:** `2e4dff7`

**Bukti:** Tes `global-camera-cover-order.test.tsx` ditambahkan. Angka 7,8 detik dari pesan commit; kamera fisik belum diuji.

---

## 0.11.11-alpha — 2026-11-12 — Dokumen

**Sumber:** REVISIONS R11-14 s/d R11-18 dan R10-22.

**Perubahan:**
- Baris R11-14 s/d R11-18 ditambahkan ke `REVISIONS.md`; audit R10-22 dicatat.

**Commit:** `083b2f5`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.11.10-alpha — 2026-11-12 — Dokumen

**Sumber:** REVISIONS R11-12 (NUI mode kamera).

**Perubahan:**
- Status mode kamera NUI dan performa yang sudah diverifikasi di browser dicatat di `REVISIONS.md`.

**Commit:** `8458ead`

**Bukti:** Hasil browser ada di `contexts/can/REVISIONS.md` (R11-12, R11-13).

---

## 0.11.9-alpha — 2026-11-12 — Tes

**Sumber:** REVISIONS R11-12 (mode kamera tanpa tombol mouse).

**Perubahan:**
- Tur visual dengan kamera palsu (Chromium): tetap di mode kamera tanpa klik Mouse, membangunkan Momo dengan tahan cincin diam, sampai gameplay (bar gestur dan dial sudut). Layar setelahnya belum disambung.

**Commit:** `b27490c`

**Bukti:** Skrip `frontend/implementation/e2e/visual-tour-camera.mjs`; hasil di `contexts/can/REVISIONS.md` (R11-12).

---

## 0.11.8-alpha — 2026-11-12 — Dokumen

**Sumber:** M-027 (gabung ke `main`), REVISIONS R11-09.

**Perubahan:**
- Merge `claude-monorepo` ke `main` (`35e3da3`, tanpa force) dicatat untuk Dias.
- Mandat M-027 ditambahkan ke `OWNER_MANDATES.md`.

**Commit:** `62870b5`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.11.7-alpha — 2026-11-12 — Perbaikan

**Sumber:** REVISIONS R11-13 (game melambat saat kamera nyala).

**Perubahan:**
- Software GPU (mis. SwiftShader) langsung memakai delegate CPU. GPU yang rata-rata di atas 120 ms selama 20 deteksi dibangun ulang sekali di CPU.
- Inferensi dibatasi 50 % waktu dinding, termasuk di batas bawah 8 Hz.
- Profil awal: 7,9 s dari 8 s intro level ada di `readPixels` MediaPipe pada GPU software.

**Commit:** `d278c5e`

**Bukti:** vitest 240 berkas / 1868 tes, tsc, eslint bersih (pesan commit). Tes baru: `gpu-probe.test.ts`, `hand-landmarker.test.ts`.

---

## 0.11.6-alpha — 2026-11-12 — Perbaikan

**Sumber:** REVISIONS R11-13.

**Perubahan:**
- Semua pembaca tangan lewat satu gerbang (`pollDetection`): paling banyak satu deteksi per frame video; inferensi dibatasi sekitar 35 % waktu dinding, batas bawah 8 Hz. Statistik lewat `getInferenceStats()`.
- Audit: tidak ada layar yang menjalankan dua detektor. Biaya awal berasal dari membaca setiap frame tanpa batas.

**Commit:** `6786b80`

**Bukti:** vitest 239 berkas / 1843 tes, tsc, eslint bersih (pesan commit). Tes baru: `inference-scheduler.test.ts`, `inference-budget-drivers.test.ts`.

---

## 0.11.5-alpha — 2026-11-12 — Perbaikan

**Sumber:** M-026 (mode kamera tanpa tombol), REVISIONS R11-12.

**Perubahan:**
- Ikon arah di bar gameplay (kiri, kanan, lompat) menerima tekan-diam, bukan hanya tombol. Siswa yang tangannya tidak terdeteksi tidak terjebak.

**Commit:** `ba5c895`

**Bukti:** Tidak ada uji tercatat di commit (bukti di luar repo).

---

## 0.11.4-alpha — 2026-11-12 — Dokumen

**Sumber:** REVISIONS R11-13.

**Perubahan:**
- Progres mode kamera dan tugas anggaran inferensi dicatat di `REVISIONS.md`.

**Commit:** `bcb154a`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.11.3-alpha — 2026-11-12 — Perbaikan

**Sumber:** M-026 (mode kamera tanpa tombol mouse/touch), REVISIONS R11-12.

**Perubahan:**
- Mode kamera tidak menampilkan tombol mouse/touch dan tidak pernah terjebak.
- Cincin cover menerima tahan diam 1 detik (mouse/touch/Enter/Space) di mode kamera.
- Mode tangan tetap menjalankan pointer secara diam-diam, sehingga kartu 3 dan kanvas tidak buntu saat tangan tidak terdeteksi.

**Commit:** `5d3fb2d`

**Bukti:** vitest 235 berkas / 1820 tes, tsc, eslint bersih (pesan commit).

---

## 0.11.2-alpha — 2026-11-12 — Dokumen

**Sumber:** REVISIONS R11-08 dan R11-11.

**Perubahan:**
- Status `/nui-lab` dan perbaikan tata letak dicatat di `REVISIONS.md`.

**Commit:** `7ca3a2d`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.11.1-alpha — 2026-11-12 — Perbaikan

**Sumber:** REVISIONS R11-08 (`/nui-lab`).

**Perubahan:**
- Komentar dan `eslint-disable` satu baris di `NuiLabPage.tsx`: penambahan counter ref memang disengaja. Tidak ada perubahan perilaku.

**Commit:** `7558c05`

**Bukti:** Tidak ada uji tercatat (perubahan komentar).

---

## 0.11.0-alpha — 2026-11-12 — Fitur

**Sumber:** M-026 (NUI mode kamera), REVISIONS R11-08 (`/nui-lab`) dan R11-11 (tata letak).

**Perubahan:**
- `/nui-lab`: halaman uji tersembunyi, tidak ditautkan dari alur siswa. Kamera menyala hanya setelah klik. Menampilkan landmark pemain, resolusi dan fps, p50/p95 inferensi, pose, jitter tinta mentah vs halus, timer lambaian, luma, dan saklar CLAHE.
- Tata letak HP (CSS): bubble Momo di rekap, kanvas di layar 390 px, PIP kamera, dan pita "Mode demo" (`c4d1988`).

**Commit:** `c4d1988`, `d4a6497`

**Bukti:** Belum dibuka di browser (R11-08); tata letak belum dicek visual (R11-11).

---

## 0.10.2-alpha — 2026-11-12 — Dokumen

**Sumber:** M-026 ("gausah onnx deh"), REVISIONS R11-07 (BATAL).

**Perubahan:**
- ONNX dibatalkan Owner. Kombinasi untuk pameran: MediaPipe + One Euro + CLAHE. Riset tetap di `ONNX-HAND-RESEARCH.md`.
- Celah NUI mode kamera dicatat sebagai pekerjaan terbuka.

**Commit:** `9c87e0f`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.10.1-alpha — 2026-11-11 — Dokumen

**Sumber:** REVISIONS R11-03 s/d R11-06.

**Perubahan:**
- Status cover dan akurasi tangan diperbarui di `REVISIONS.md`.

**Commit:** `286471a`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.10.0-alpha — 2026-11-11 — Fitur

**Sumber:** M-024 (NUI akurat, tidak mendeteksi tangan orang lain), REVISIONS R11-04.

**Perubahan:**
- Deteksi tangan dikunci ke tangan pemain: `numHands` 2, confidence 0,6, dan semua pembaca lewat `frameForDetection`.
- Tangan kecil/jauh diabaikan; tangan orang lain tidak merebut saat tangan pemain hilang sebentar.
- Nilai awal, belum diukur di kamera.

**Commit:** `af84c71`

**Bukti:** vitest 228 berkas / 1770 tes, tsc, eslint bersih (pesan commit). Belum diukur di kamera fisik.

---

## 0.9.0-alpha — 2026-11-11 — Fitur

**Sumber:** M-024 (cover maksimal 10 detik), REVISIONS R11-03 dan R11-06.

**Perubahan:**
- Cincin jempol cover siap ±7,8 detik setelah lambaian (sebelumnya 20,8 detik). Keempat kalimat Momo tetap utuh; kecepatan ketik cover 0,45×.
- Kamera diminta 720p, 24–60 fps (melawan motion blur), dengan percobaan ulang bila resolusi itu tidak didukung.

**Commit:** `308b125`

**Bukti:** Angka dari pesan commit (sintetis/browser). Belum diukur di kamera fisik (R11-03).

---

## 0.8.0-alpha — 2026-11-11 — Fitur

**Sumber:** M-024 (gambar tidak boleh bergetar), REVISIONS R11-05.

**Perubahan:**
- Tinta lebih stabil: One Euro dengan dead zone lunak. Getar diam 0,39 → 0,08 px, lag garis ±55 ms, overshoot 1 → 0,33 px.
- Nilai awal dari noise sintetis; perlu kalibrasi kamera.

**Commit:** `3d7ddab`

**Bukti:** Angka sintetis dari pesan commit (bukti di luar repo).

---

## 0.7.1-alpha — 2026-11-11 — Tes

**Sumber:** M-022 (tur visual mengikuti alur normal).

**Perubahan:**
- Tur visual mengikuti alur normal-journey: 19 layar.

**Commit:** `47eadbb`

**Bukti:** 19 screenshot PASS (pesan commit; bukti di luar repo). Skrip `frontend/implementation/e2e/visual-tour.mjs`.

---

## 0.7.0-alpha — 2026-11-11 — Fitur

**Sumber:** M-024 (anti motion blur dan ruangan gelap), REVISIONS R11-06.

**Perubahan:**
- CLAHE otomatis saat ruangan gelap (luma rata-rata di bawah 0,28): deteksi memakai frame CLAHE 320 px, selain itu frame asli.
- Nilai awal, belum diukur di kamera.

**Commit:** `a4bf4e7`

**Bukti:** 29 tes baru; CLAHE median ±2 ms pada 320×180 (pesan commit).

---

## 0.6.6-alpha — 2026-11-11 — Dokumen

**Sumber:** M-024 (ONNX dinilai dulu), REVISIONS R11-07.

**Perubahan:**
- Riset model tangan ONNX 21 titik (lisensi, ukuran) untuk kombinasi NUI.

**Commit:** `3f93fd6`

**Bukti:** `contexts/can/docs/audit-2026-11-10/ONNX-HAND-RESEARCH.md`.

---

## 0.6.5-alpha — 2026-11-11 — Dokumen

**Sumber:** M-025 (REVISIONS.md).

**Perubahan:**
- `contexts/can/REVISIONS.md` dibuat: daftar tugas revisi Owner dan statusnya. Baris di `NOW.md` dan `OWNER_MANDATES.md` ikut ditambah.

**Commit:** `0fa6b85`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.6.4-alpha — 2026-11-11 — Dokumen

**Sumber:** M-023 (Owner menyetujui D-20261110-01..10), REVISIONS R11-01 dan R11-02.

**Perubahan:**
- D-20261110-01 s/d 10 disahkan Owner. D-20261111-01 (kirim data saat siswa memilih Top-3) ditambahkan.

**Commit:** `108cb1a`

**Bukti:** Tidak ada uji (dokumen). Keputusan di `contexts/can/DECISIONS.md`.

---

## 0.6.3-alpha — 2026-11-11 — Dokumen

**Sumber:** M-023 (jawaban Owner 2026-11-11).

**Perubahan:**
- Jawaban Owner atas pertanyaan terbuka dicatat di `MILESTONES-LOG.md`: nama Thinman tetap dengan H, data dikirim saat Top-3, promosi ke `main` ditunda.

**Commit:** `b6b9374`

**Bukti:** `contexts/can/docs/audit-2026-11-10/MILESTONES-LOG.md`.

---

## 0.6.2-alpha — 2026-11-11 — Tes

**Sumber:** M-022, REVISIONS R10-19 (recovery).

**Perubahan:**
- Jalur recovery mengikuti reposition baru dan alur lanjut; pengambilalihan otomatis setelah menang ditoleransi.

**Commit:** `66e9cb6`

**Bukti:** Browser: recovery 16/16, route-canvas 15/15 (pesan commit; bukti di luar repo).

---

## 0.6.1-alpha — 2026-11-11 — Perbaikan

**Sumber:** M-022, REVISIONS R10-20 (fallback mouse tetap ada).

**Perubahan:**
- Mode mouse tetap ada setelah refresh tanpa kamera. Kegagalan kamera diingat di `sessionStorage`, sehingga reload tidak mengurung siswa di mode kamera.
- Tahan diam (mouse/touch/Enter/Space) di mode kamera juga menyelesaikan cincin jempol.

**Commit:** `f16b99a`

**Bukti:** vitest 216 berkas / 1694 tes, tsc, eslint bersih (pesan commit).

---

## 0.6.0-alpha — 2026-11-11 — Fitur

**Sumber:** M-022 (Owner 2026-11-10), REVISIONS R10-18; D-20261110-08.

**Perubahan:**
- Rotasi ke dua arah: "Putar kiri/kanan" mengikuti arah putaran tangan; fallback Q/E untuk mode mouse.
- CSS intro kamera yang sudah mati dihapus.

**Commit:** `80cdba2`

**Bukti:** Tidak ada uji tercatat di commit (bukti di luar repo).

---

## 0.5.1-alpha — 2026-11-11 — Tes

**Sumber:** M-022, REVISIONS R10-19.

**Perubahan:**
- Uji e2e rute kanvas, refresh, dan Back: 14 dari 16 lulus. Dua gagal menunjukkan mode input tidak direset setelah refresh; diperbaiki di 0.6.1.

**Commit:** `8d27afc`

**Bukti:** 14/16 PASS, 2 FAIL (pesan commit; bukti di luar repo).

---

## 0.5.0-alpha — 2026-11-11 — Fitur

**Sumber:** M-022 (Owner 2026-11-10), REVISIONS R10-18; D-20261110-08.

**Perubahan:**
- Objek diputar dengan memutar telapak terbuka: ditahan sampai cincin penuh masuk mode putar; setiap ±45° putaran tangan = seperempat putaran objek. Telapak diam tidak memutar.
- Satu router gestur untuk kanvas dan tutorial; `CameraIntro` yang mati dihapus.

**Commit:** `408a180`

**Bukti:** vitest 215 berkas / 1677 tes, tsc, eslint bersih (pesan commit). Tes `tutorial-pinch` sekali timeout di bawah beban browser.

---

## 0.4.3-alpha — 2026-11-11 — Tes

**Sumber:** M-022 (pemulihan animasi, alur lengkap, NUI per mode).

**Perubahan:**
- Bukti browser setelah perubahan Owner 2026-11-10 (mouse fallback, tanpa kamera): finish flow 12/12; journey L1–L3 dan penutup PASS; recovery 14/16. Satu FAIL: "setelah Gambar ulang dengan label solid, level bisa dimenangkan".

**Commit:** `c54082a`

**Bukti:** `docs/migration/evidence/iter5/summary.txt`, `journey-evidence.json`, `finish-evidence.json`.

---

## 0.4.2-alpha — 2026-11-11 — Dokumen

**Sumber:** M-022 (PANDUAN NUI, REVISI-NUI-PA), REVISIONS R10-18.

**Perubahan:**
- Rencana NUI dan matriks hasil ditambahkan. Koreksi: rotasi objek lewat memutar telapak, bukan telapak diam.

**Commit:** `b015c94`

**Bukti:** `contexts/can/docs/audit-2026-11-10/NUI-PLAN.md`, `NUI-RESULTS.md`.

---

## 0.4.1-alpha — 2026-11-11 — Perbaikan

**Sumber:** M-022.

**Perubahan:**
- Fase fokus kanvas hanya sekali per level.
- Harness E2E menunggu kartu 3; E2E kelas mengikuti alur stiker.

**Commit:** `43e4cc3`

**Bukti:** Tidak ada uji tercatat di commit (lihat 0.4.0 dan 0.4.3).

---

## 0.4.0-alpha — 2026-11-11 — Fitur

**Sumber:** M-022 (big prompt Owner 2026-11-10, PANDUAN NUI, REVISI-NUI-PA), REVISIONS R10-01 s/d R10-24; keputusan draf D-20261110-01..10.

**Perubahan:**
- Hanya tiga level; Level 4 "Pembuktian" dihapus (R10-01). Animasi cerita dipulihkan dengan durasi normal (R10-02).
- Momo tidur (napas, mengambang, Zzz) dan bangun dengan dua kedipan. Cover dengan cincin progres lambaian; kamera mengecil ke PIP kiri bawah.
- Tutorial tiga kartu; penggaris mulai dari 1; pilih level dan Top-3 dengan jari + cincin; penempatan Taruh / Geser / Putar; penutup dengan portal dan rekap netral.
- Commit WIP `f8afb71` dan `9b80137` (ditandai "checkpoint, not pushed") ikut ter-push bersama `64c4160`.

**Commit:** `f8afb71`, `9b80137`, `64c4160`

**Bukti:** vitest 211 berkas / 1644 tes, tsc, eslint bersih; browser (mouse): finish flow 12/12. Journey dan recovery diulang setelah perbaikan harness (lihat 0.4.3). Kamera fisik belum diuji.

---

## 0.3.0-alpha — 2026-11-09 — Fitur

**Sumber:** M-021 (eksekusi PRD 0.0.16), D-20261105-23 dan D-20261105-24 (M-019, M-020).

**Perubahan:**
- Selesai gambar = tahan jempol 2 detik. Momo diam saat menggambar; tebakan dan Top-3 muncul setelah itu. Cincin jempol memakai pembaca tangan gambar yang sama.
- Klasifikasi pose: cubit tidak lagi terbaca kepal; histeresis dan voting 3 dari 5 frame; penghapus sebagian; ukuran dengan tangan kedua; roda mouse dan `[` `]`; tombol S/M/L.
- NUI untuk daftar level dan penutup (dwell dengan fallback mouse); gambar siswa tampil sebagai objek di dunia; alur E2E baru.
- Level 4 "Pembuktian" ditambahkan di sini dan dihapus lagi di 0.4.0.

**Commit:** `9ba76d2`, `1b880fa`

**Bukti:** `docs/migration/evidence/iter4/run6-summary.txt`: tsc 0, ESLint bersih, vitest 156 berkas / 1178 tes, build 0, recovery 16/16, finish flow 12/12, journey PASS. Classroom E2E 17/17 via Caddy (pesan commit).

---

## 0.2.1-alpha — 2026-11-09 — Perbaikan

**Sumber:** M-002 (audit kesiapan `main`); tidak ada ID R.

**Perubahan:**
- Audit `claude-monorepo` menemukan celah kehilangan data dan pengiriman; tiap perbaikan kode ditulis dengan tes lebih dulu.
- Outbox: `resume()` mengirim ulang job yang tertinggal di `sending`; `requeueUnauthorized()` mengirim ulang job yang kena 401 setelah join ulang.
- Repo: 253 berkas Can yang diabaikan `.gitignore` di-force-add; izin exec 26 berkas dipulihkan; `.dockerignore` game ditambahkan; README dan dokumen arsitektur ditulis ulang.
- Keamanan: `/predict` menolak gambar di atas 20.000 titik (422); sesi siswa kedaluwarsa dihapus saat join.
- Deploy: Caddy membatasi body request ke backend 1 MB (`deploy/Caddyfile`).

**Commit:** `777e181`

**Bukti:** Tidak tercatat angka uji di commit (bukti di luar repo).

---

## 0.2.0-alpha — 2026-11-09 — Fitur

**Sumber:** M-002 (kontrak classroom dan backend Dias).

**Perubahan:**
- Jalur kelas end-to-end: link kelas → join (token sesi) → `/predict` → Accept → `POST /api/submissions` → database → dashboard guru.
- Backend: join mengembalikan `student_session_token` (disimpan sebagai hash); submission dan outcome wajib Bearer; submission idempoten per siswa lewat `submission_key` (201 created / 200 duplicate); `PATCH /api/submissions/{id}/outcome` ditambahkan.
- Keamanan: CORS dari env `CORS_ORIGINS`, `allow_credentials=False` (sebelumnya `*` dengan credentials).
- Migrasi: kolom submission ditambahkan otomatis (`_migrate` di `backend/app/db.py`).
- Game: kontrak submission dan outbox pengiriman mengikuti backend.

**Commit:** `dd46572`

**Bukti:** `tests/integration/test_classroom_contract.py` (11 tes), `tests/integration/verify_backend.py` (20 probe, bobot asli), `frontend/implementation/e2e/classroom-e2e.mjs` (17 cek, langsung dan via Caddy), `docs/migration/evidence/classroom/`, `docs/migration/evidence/backend_verify.json`.

---

## 0.1.1-alpha — 2026-11-09 — Dokumen

**Sumber:** M-002 (struktur monorepo); instruksi Owner untuk berkas konteks infra (tanpa ID mandat).

**Perubahan:**
- `docs/INFRA_TUNNEL_AND_PORTS.md` (byte-identik dengan Can) dipindah ke `contexts/can/docs/`; status di SOURCE_MAP menjadi IMPORTED.

**Commit:** `05b3558`, `0a2c4ed`

**Bukti:** Tidak ada uji (dokumen).

---

## 0.1.0-alpha — 2026-11-09 — Fitur

**Sumber:** M-002 (implementer utama, integrasi monorepo), M-008 (identitas commit Owner).

**Perubahan:**
- Game Can dipindah ke `frontend/implementation/` (baseline `d4bbaec`). Backend, admin, train, weights, deploy, dan compose Dias masuk ke satu workspace.
- Router `contexts/can/` dan `contexts/dias/` dipisah; satu `CHANGELOG.md` aktif; changelog lama diarsipkan di `docs/history/`.
- `contracts/API_INVENTORY.md` dan `openapi.json` dari rute FastAPI; `docs/migration/` memuat peta sumber tiap berkas.
- REST client Bagian II dan outbox durable sudah ada di `can` sebelum monorepo (`1a3eb9f`).

**Commit:** `fe73df3`

**Bukti:** `docs/migration/SOURCE_MANIFEST.md` (peta sumber).

---

## Riwayat sebelum monorepo

- Can (versi lama 0.0.x): `docs/history/can/`. Label lama tidak dipakai lagi untuk nomor baru. PRD Revisi 0.0.16 diselesaikan di 0.3.0-alpha.
- Dias: `docs/history/dias/`.

---

## Lampiran: isi CHANGELOG sebelum skema versi (apa adanya, 2026-11-12)

Arsip pra-versi: isi di bawah ini adalah changelog sebelum skema versi. Disimpan utuh, tidak dipakai untuk penomoran baru.

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
