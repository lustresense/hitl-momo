# Buku Progres PA (elemen-elemen)

Folder ini menampung elemen-elemen **Buku Progres PA**: bahan yang dipakai di buku/laporan, presentasi, dan diskusi dosen. Isinya dokumen dan aset di luar kode aplikasi. Kode aplikasi tetap di `implementation/`.

| Berkas | Isi | Cara dibuat |
|---|---|---|
| `karakter-thinman-momo.html` | Pengenalan karakter dalam satu halaman HTML mandiri (tanpa internet): Thinman (kiri, kanan, depan, belakang; animasi lari, loncat, lari + loncat; pose rig) dan Momo (karakter besar, 12 ekspresi beserta status pemakaiannya di aplikasi, gerak, palet), plus catatan reverse engineering. Responsif: dua kolom di desktop, kotak-kotak dua kolom di HP. Tiap kotak bisa diunduh sebagai SVG. | Dibangun otomatis dari kode di `implementation/src` oleh `tools/character-book/build.mjs`. |

## Membangun ulang

Dari akar repo (butuh `implementation/node_modules`, yaitu setelah `npm ci` di `implementation/`):

```bash
node tools/character-book/build.mjs
```

Halaman hanya **membaca** kode di `implementation/`; tidak mengubahnya. Karena gambar dan animasi dirender oleh kode yang sama dengan game, setiap perubahan karakter di `implementation/` otomatis ikut setelah build ulang.

## Catatan sumber

- File HTML asli Owner (`stickman-ab.html` untuk Thinman, `momo-ekspresi_1.html` untuk Momo) **tidak ada di repo**. Halaman ini direkonstruksi dari hasil porting ke kode (reverse engineering). Jika file asli ada di laptop Owner, taruh di `design/visual/` supaya bisa dibandingkan.
- Keterangan "dipakai / di skrip / belum dipakai" pada ekspresi Momo diaudit dari komponen UI per 2026-11-05. Jika UI berubah, perbarui tabel `X` di `tools/character-book/template.html`.
- Keputusan terkait: `DECISIONS.md` D-20261105-16.
