# Checklist QA Webcam Fisik Owner — Migrasi r8.3 (`WEBCAM_QA.md`)

| Atribut | Nilai |
|---|---|
| Kelas bukti | **`WEBCAM_OWNER`** (uji sintetis / mouse **bukan** pengganti bukti webcam fisik) |
| Pelaksana wajib | **Owner (CAN)** di laptop fisik dengan Chrome dan kamera bawaan (O-11) |
| Kondisi pencahayaan | **Terang normal** DAN **Redup** (lampu utama mati / cahaya layar) |
| Rujukan spesifikasi | `docs/migration-r83/R83_MIGRATION_PLAN.md` (§5.3.4 Resep R1, §8, Lampiran D) |
| Aturan privasi | **Dilarang** menyimpan tangkapan wajah, rekaman video, atau frame kamera di repo/laporan. Cukup isi hasil lulus/gagal dan catatan teks di dokumen ini. |

> **Aturan Gerbang (O-11):**
> - **G2** dijalankan setelah fase **I-1** selesai dan **sebelum** layar apa pun (P3–P8) di-port. Agent wajib berhenti dan menunggu Owner menulis **`G2 lulus`**. Bila ada poin gagal, perbaikan dilakukan di **P2** sebelum lanjut.
> - **G9** dijalankan setelah fase **P9** (integrasi penuh & hardening). Flag default `NEXT_PUBLIC_UI_R83` baru boleh dibahas menjadi `1` (atau penghapusan layar lama) setelah Owner menulis **`G9 lulus`**.

---

## 1. Gerbang G2 — Uji Inti NUI di Harness `/dev/nui`

### 1.1 Perintah Menjalankan Lokal (G2)

Jalankan dari folder `frontend/implementation`:

**Windows (PowerShell):**
```powershell
cd "E:\College\PA Sketchboook Universe\hitl-momo\frontend\implementation"
$env:NEXT_PUBLIC_UI_R83 = "1"
$env:NEXT_PUBLIC_DEV_TOOLS = "1"
npm run dev
```

**macOS / Linux (bash/zsh):**
```bash
cd frontend/implementation
NEXT_PUBLIC_UI_R83=1 NEXT_PUBLIC_DEV_TOOLS=1 npm run dev
```

Buka di Google Chrome: `http://localhost:3000/dev/nui` dan izinkan akses kamera.
*(Setelah selesai, hentikan server dengan `Ctrl+C`.)*

### 1.2 Info Sesi Uji G2

| Field | Diisi Owner |
|---|---|
| Tanggal & jam uji | `____-__-__ __:__ WIB` |
| SHA commit lokal (`git rev-parse --short HEAD`) | `_______` |
| OS & versi Chrome | `_______________________` |
| Kamera yang dipakai | `_______________________` |
| Kondisi terang normal | `_______________________` (mis. lampu kamar nyala / siang) |
| Kondisi redup | `_______________________` (mis. lampu utama mati) |

### 1.3 Checklist 7 Poin G2 (PLAN Lampiran D)

| # | Kriteria Uji (`/dev/nui`) | Terang Normal | Redup | Catatan Owner (jitter, delay, salah picu, kenyamanan) |
|---|---|---|---|---|
| **1** | **Stabilitas diam di kanvas mini:** Kursor tidak goyang saat tangan diam di kanvas mini. Dot/titik bidik berdiri tenang dalam kisaran ±1 cm di layar. | [ ] Lulus / [ ] Gagal | [ ] Lulus / [ ] Gagal | |
| **2** | **Aturan A (satu pilihan):** Cubit-tahan di mana saja mengisi ring. Lepas lalu ulang tidak meloncat (tidak langsung penuh / tidak latch palsu). | [ ] Lulus / [ ] Gagal | [ ] Lulus / [ ] Gagal | |
| **3** | **Aturan B (beberapa pilihan):** Dua target 64 px berjarak 24 px. Target yang menyala sesuai arah tangan. Saat cubit dimulai, pilihan terkunci dan **tidak berpindah** walau tangan goyang. | [ ] Lulus / [ ] Gagal | [ ] Lulus / [ ] Gagal | |
| **4** | **Aturan C (joystick & lompat):** Joystick bertambah cepat makin jauh dari titik awal cubit. Tap (< 230 ms, geser ≤ 10 px) = lompat. Sentil ke atas = lompat. **Tidak ada** lompat tak sengaja saat berjalan biasa. | [ ] Lulus / [ ] Gagal | [ ] Lulus / [ ] Gagal | |
| **5** | **Aturan D (kanvas / goresan):** Titik awal goresan tidak meloncat dari titik bidik (rollback 200 ms bekerja). Ujung goresan tidak berekor saat cubit dilepas. | [ ] Lulus / [ ] Gagal | [ ] Lulus / [ ] Gagal | |
| **6** | **Tangan hilang sebentar & orang kedua:** Tangan keluar frame sebentar (< 0,5 s): ring dan goresan tidak langsung putus (kursor membeku sementara). Tangan teman/tangan kedua masuk frame: kendali **tidak** berpindah dari pemilik pertama. | [ ] Lulus / [ ] Gagal | [ ] Lulus / [ ] Gagal | |
| **7** | **Ulangi di kondisi redup:** Poin 1–5 diulangi dalam kondisi lampu utama mati / redup dan seluruhnya tetap dapat digunakan dengan stabil (drain ring 0,5× menoleransi putus cubit singkat). | — *(lihat kolom Redup 1–5)* | [ ] Lulus / [ ] Gagal | |

### 1.4 Tanda Tangan Gerbang G2 (Owner)

- **Keputusan G2:** [ ] **`G2 lulus`** (boleh lanjut ke P3 & P5) / [ ] **`G2 gagal`** (kembali ke P2 untuk penyetelan R1)
- **Parameter R1 yang perlu disesuaikan (bila gagal):** `______________________________________________`
- **Tanda tangan / Inisial Owner & Tanggal:** `____________________` · `____-__-__`

---

## 2. Gerbang G9 — Uji Alur Penuh Mode r8.3 Tanpa Mouse

### 2.1 Perintah Menjalankan Lokal (G9)

**Opsi A — Build statis (rekomendasi, mendekati produksi):**

*PowerShell (Windows):*
```powershell
cd "E:\College\PA Sketchboook Universe\hitl-momo\frontend\implementation"
$env:NEXT_PUBLIC_UI_R83 = "1"
$env:NEXT_PUBLIC_TEST_HOOKS = "0"
npm run build
# Sajikan folder ./out di localhost (mis. npx serve out -l 3000 atau http-server out -p 3000)
```

*bash/zsh:*
```bash
cd frontend/implementation
NEXT_PUBLIC_UI_R83=1 NEXT_PUBLIC_TEST_HOOKS=0 npm run build
# Sajikan ./out di localhost
```

**Opsi B — Dev server cepat:**

*PowerShell (Windows):*
```powershell
cd "E:\College\PA Sketchboook Universe\hitl-momo\frontend\implementation"
$env:NEXT_PUBLIC_UI_R83 = "1"
npm run dev
```

*bash/zsh:*
```bash
cd frontend/implementation
NEXT_PUBLIC_UI_R83=1 npm run dev
```

> **Catatan uji `REAL_MODEL` (opsional):** Jika Owner ingin menguji sekaligus dengan model DIAS lokal (`weights/`), jalankan backend lokal sesuai panduan di `SETUP.md` dan arahkan `NEXT_PUBLIC_PREDICTION_MODE=partner` sesuai konfigurasi lokal. Tanpa backend, catat mode prediksi sebagai `MOCK_MODEL` (label simulasi wajib terlihat jelas).

### 2.2 Info Sesi Uji G9

| Field | Diisi Owner |
|---|---|
| Tanggal & jam uji | `____-__-__ __:__ WIB` |
| SHA commit lokal (`git rev-parse --short HEAD`) | `_______` |
| Mode build | [ ] Static export (`./out`) / [ ] `next dev` |
| Mode prediksi | [ ] `MOCK_MODEL` / [ ] `REAL_MODEL` (backend lokal `SETUP.md`) |
| Pencahayaan | [ ] Terang normal / [ ] Redup / [ ] Keduanya |

### 2.3 Checklist Alur Penuh G9 (Tanpa Mouse Setelah Kamera Menyala)

Aturan uji: mouse hanya digunakan pada gerbang izin kamera (dan input ketik guru bila mik/STT tidak aktif). Setelah kamera menyala di sampul, seluruh alur hingga penutup harus dapat diselesaikan dengan tangan saja.

| # | Tahap Alur | Kriteria Verifikasi | Hasil | Titik Membingungkan / Lambat / Catatan |
|---|---|---|---|---|
| **1** | **Loading & Sampul** | Loader Momo Dream → morph mulus ke sampul terbalik (`FL`), gerbang izin kamera (mouse) → kamera menyala → Momo bangun, kartu morph ke PIP kiri-bawah dengan indikator tangan `nui-pip-hand`, ring **"Ayo!"** (aturan A, 1000 ms) berhasil tanpa mouse. | [ ] Lulus / [ ] Gagal | |
| **2** | **Buka Buku & Kenalan Nama** | Transisi curl 3D cover-matching mulus ke "SIAPA NAMAMU?". Ring **"Mulai bicara"** (aturan A) → suara/fallback ketik guru → konfirmasi aturan B (**"Ulangi"** kiri / **"Ya, itu namaku"** kanan 2000 ms) → animasi keluar mulus. *(Bila via link kelas: penggaris nomor berjalan mulus.)* | [ ] Lulus / [ ] Gagal | |
| **3** | **Kartu Tutorial 1–3** | Intro pasca-nama: Momo ke tengah menyapa nama → pindah kanan bawah → deal 3 kartu oranye. Kartu 1 (joystick sampai bendera), Kartu 2 (baca + lanjut), Kartu 3 (kursor + 5 alat tercentang: Pensil, Hapus, Mundur, Maju, Bersihkan) → **"Pilih level"**. | [ ] Lulus / [ ] Gagal | |
| **4** | **Pilih Level** | Pita terdekat menyala (aturan B), tarik relatif dari mana saja untuk membuka Level 1; Level 2–3 terkunci sampai level sebelumnya selesai. Tidak ada ring "Mulai Level". | [ ] Lulus / [ ] Gagal | |
| **5** | **Kanvas & HITL (L1–L3)** | Kursor hanya tampil di atas kertas (pensil / bulatan hapus 44 px). Hapus parsial memotong segmen, Bersihkan + Mundur memulihkan semua goresan. Momo diam saat menggambar (tidak menggumam); setelah diam 1 detik ring **"Tebak Gambarku"** muncul (mode `point`, 2000 ms). Panel Top-3 (baris B, Terima/Pakai 2000 ms), **"Bukan ini, pilih lainnya"** (tanpa label Top-3), **"Gambar lagi"** berfungsi. Stiker dapat dilempar lewat sentil ke atas atau ring. | [ ] Lulus / [ ] Gagal | |
| **6** | **Dunia & Gameplay (L1–L3)** | Intro spotlight → kamera naik/turun langit → benda jatuh → tarik relatif penempatan + ring **"Taruh di sini"** (1500 ms) → main pakai joystick & tap/sentil lompat. Uji jalur **gagal** (panel Belum berhasil di bubble Momo, aturan B) dan jalur **menang** sampai Level 3 selesai. | [ ] Lulus / [ ] Gagal | |
| **7** | **Penutup `/ending` (5 Fase)** | Urutan lengkap: terjun payung (`payung`) → tuntun Thinman ke kolam tinta (`kolam`) → penjelasan Momo + Thinman pose depan `thinrig` + ring `"Aku mengerti"` (`bicara`) → rekap chat Momo dari data sesi asli tanpa data contoh (`rekap`) → ring **"Kembali ke sampul"** 2000 ms (`akhir`). | [ ] Lulus / [ ] Gagal | |
| **8** | **Performa & Pengalaman Keseluruhan** | Tidak terasa patah-patah / lag berat di laptop Owner dengan kamera menyala; semua teks memakai **"Level"** (bukan "Bab"); tidak ada tampilan yang bergeser jauh dari sandbox r8.3. | [ ] Lulus / [ ] Gagal | |

### 2.4 Tanda Tangan Gerbang G9 (Owner)

- **Keputusan G9:** [ ] **`G9 lulus`** (siap bahas pengaktifan default flag O-1 / pembersihan layar lama) / [ ] **`G9 gagal`** (perlu perbaikan sebelum finalisasi)
- **Daftar temuan / hal yang masih terasa lambat atau membingungkan:**
  - `1. ______________________________________________________________`
  - `2. ______________________________________________________________`
  - `3. ______________________________________________________________`
- **Tanda tangan / Inisial Owner & Tanggal:** `____________________` · `____-__-__`
