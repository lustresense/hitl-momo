# Buku Progres PA (elemen-elemen)

Folder ini menampung elemen-elemen **Buku Progres PA**: bahan yang dipakai di buku/laporan, presentasi, dan diskusi dosen. Isinya dokumen dan aset di luar kode aplikasi. Kode aplikasi tetap di `implementation/`.

| Berkas | Isi |
|---|---|
| `karakter-thinman-momo.html` | Halaman HTML mandiri (tanpa internet) berisi **dua papan persegi 1:1**, satu per karakter, tanpa scroll di dalam papan. Desktop (16:9): dua papan kiri-kanan; HP: atas-bawah. Papan Thinman: karakter besar di kiri; tampak kiri/kanan/depan/belakang; animasi lari, loncat, lari + loncat (tombol arah kanan/kiri); 6 pose rig. Papan Momo: Momo besar di kiri; 12 ekspresi (penanda dipakai / di skrip / belum); gerak (mengambang, kepak, terbang); palet. Di bawah papan: catatan cara kerja dan tabel pemakaian ekspresi (bukan bagian papan). |
| `karakter-thinman-1x1.png`, `karakter-momo-1x1.png` | Papan diam 2400 × 2400 px untuk PPT dan Word. |
| `karakter-thinman-1x1.mp4`, `karakter-momo-1x1.mp4` | Papan beranimasi 1080 × 1080 untuk PPT (Thinman ganti arah tiap 4 detik; Momo berganti ke-12 ekspresi tiap 2,2 detik). |
| `karakter-thinman-1x1.gif`, `karakter-momo-1x1.gif` | Versi GIF 540 px untuk Word. |

Papan dirancang pada kanvas tetap 1200 × 1200 yang diskalakan (seperti slide), sehingga tampilannya identik di ukuran berapa pun dan tidak terpotong saat ditempel.

## Membangun ulang

Dari akar repo (butuh `implementation/node_modules`, yaitu setelah `npm ci` di `implementation/`):

```bash
node tools/character-book/build.mjs    # HTML
node tools/character-book/export.mjs   # PNG, MP4, GIF (butuh Chromium dan ffmpeg)
```

Halaman hanya **membaca** kode di `implementation/`; tidak mengubahnya. Karena gambar dan animasi dirender oleh kode yang sama dengan game, setiap perubahan karakter di `implementation/` otomatis ikut setelah build ulang.

## Catatan sumber

- File HTML asli Owner (`stickman-ab.html` untuk Thinman, `momo-ekspresi_1.html` untuk Momo) **tidak ada di repo**. Halaman ini direkonstruksi dari hasil porting ke kode (reverse engineering). Jika file asli ada di laptop Owner, taruh di `design/visual/` supaya bisa dibandingkan.
- Keterangan "dipakai / di skrip / belum dipakai" pada ekspresi Momo diaudit dari komponen UI per 2026-11-05. Jika UI berubah, perbarui tabel `X` di `tools/character-book/template.html`.
- Keputusan terkait: `DECISIONS.md` D-20261105-16.
