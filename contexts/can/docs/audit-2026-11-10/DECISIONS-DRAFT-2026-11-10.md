# Draft entri DECISIONS — 2026-11-10 (BELUM AKTIF)

Draft ini disusun dari instruksi Owner 10 November 2026 (big prompt dan REVISI-NUI). Sesuai aturan `contexts/can/DECISIONS.md`, entri baru baru berlaku setelah Owner mengesahkan. `DECISIONS.md` tidak diubah. Untuk mengesahkan, tulis `SETUJUI D-20261110-01..10` atau sebut nomor yang disetujui.

### D-20261110-01 — Usulan Aktif — Hanya tiga level
- Keputusan: produk hanya Level 1–3. Level 4 "Pembuktian" yang ditambahkan AI pada 2026-11-09 dihapus. Kuis/survei bukan level.
- Mengubah: tidak ada entri lama (Level 4 tidak pernah dikunci).

### D-20261110-02 — Usulan Aktif — Selesai gambar dengan jempol, bukan auto-ask
- Keputusan: Momo diam selama menggambar. Tebakan dan Top-3 hanya setelah siswa menahan jempol "selesai". Setelah 10 detik diam, Momo bertanya dan indikator jempol menyala; tidak menebak otomatis.
- Mengubah: PRD 0.0.16 R11 (tebakan sambil menggambar, auto-ask setelah tangan diam) di D-20261105-24.

### D-20261110-03 — Usulan Aktif — Animasi cerita tidak dipersingkat
- Keputusan: durasi animasi kartu, buka buku, Momo, kamera kembali ke nilai `9f9d35d`; tutup kartu 1,0 s, jeda 1,1 s. `prefers-reduced-motion` mengurangi amplitudo, tidak memotong durasi cerita.
- Mengubah: praktik di kode (`timeScale(6)`, fade 0,2 s) dan nilai `8520cda`.

### D-20261110-04 — Usulan Aktif — Cover: lambaian, kamera turun ke kiri bawah
- Keputusan: kamera besar di tengah cover; lambaian (dengan cincin progres) membangunkan Momo; kartu kamera mengecil ke PIP KIRI BAWAH; Momo terbang ke tengah; teks "Lambaikan tanganmu" dihapus; cerita "Aku Momo, gambar satu-satunya yang hidup ..."; jempol "Aku mengerti" membuka buku.
- Mengubah: D-20261105-19 (kamera menyala membangunkan Momo), copy cover lama, bypass morph `be7c8b2` (sekarang satu morph cover→PIP diizinkan).

### D-20261110-05 — Usulan Aktif — Penggaris
- Keputusan: hanya angka + penggaris; mulai nomor 1; fokus Momo di tengah dengan latar gelap lalu Momo ke kanan; pertanyaan hanya setelah digeser; pegangan 48×70; cubit+geser; jempol 2 s.

### D-20261110-06 — Usulan Aktif — Tiga kartu
- Keputusan: kartu 1 seret Thinman dengan cubit sampai bendera (bukan auto-jalan); jeda baca 10 detik dengan cincin jempol terkunci yang menunjukkan progres; kartu 3 semua alat dicoba dengan tangan; penghapus ukuran tetap di tutorial.
- Mengubah: D-20261105-23 (cincin), praktik 2026-11-09 (PinchRing sebagai tombol lanjut).

### D-20261110-07 — Usulan Aktif — Gestur menurut mode (tanpa kursor)
- Keputusan: router mode tunggal (`src/input/gesture-mode.ts`). Pilih bab 1/2/3 jari; Top-3 1/2/3 jari, telapak = Bukan ini, cubit = Gambar lagi; layar gagal 1/2/3 jari; kanvas hanya cubit menggores; redo = telapak terbuka atau terbelah; semua aksi dengan cincin progres.
- Mengubah: pilih-dengan-melayang (dwell kursor) 2026-11-09 untuk layar-layar ini.

### D-20261110-08 — Usulan Aktif — Stiker dan "Lempar"
- Keputusan: setelah keputusan HITL, gambar siswa menjadi stiker di kanvas; "Lempar" (jempol) menjatuhkannya ke dunia; "Gambar lagi" (telapak). Penempatan: "Taruh di sini" (jempol), "Geser objek" (cubit), "Putar" 90° (telapak).
- Mengubah: D-20261105-02 (tawaran "Masukkan ke dunia").

### D-20261110-09 — Usulan Aktif — Kontrol Thinman dengan sudut telunjuk
- Keputusan: ~90° lompat; 45–75° lompat+kanan; 105–135° lompat+kiri; horizontal jalan. Bar bawah mode kamera tanpa label keyboard.
- Status ambang: asumsi awal, belum dikalibrasi dengan kamera.

### D-20261110-10 — Usulan Aktif — Penutup portal, rekap netral, tempat kuis
- Keputusan: Thinman masuk portal dan hidup; Momo memberi pesan singkat tentang AI; rekap benda, tebakan, keputusan, jumlah, tanpa skor; kuis hanya bila flag admin menyala (kontrak usulan ke Dias).
- Mengubah: D-20261105-15 (penutup masih RISET) — butuh `SETUJUI D-20261105-15` atau entri ini.

## Konflik yang tetap butuh keputusan Owner
1. Nama "Tinman" (brief) vs "Thinman" (D-20261105-24). Kode memakai Thinman.
2. Model Dias mengenali 20 kelas umum (apel, sepeda, kucing, rumah, kursi, gunung, …) dan tidak satu pun benda level. Dengan model asli semua keputusan menjadi "tidak dikenali" di gameplay. Pilihan: Dias melatih kelas benda level, atau benda level diganti. Usulan: `contracts/LABEL_MAP_PROPOSAL.md`.
3. Submission ke backend tetap dikirim saat keputusan HITL, juga bila siswa lalu memilih "Gambar lagi" pada stiker.
