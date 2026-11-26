# Tombol "Lewati" (skip): cara menampilkan atau menyembunyikan

Untuk siapa saja, manusia atau AI, yang diminta "munculin tombol skip", "sembunyiin tombol skip", atau "matiin skip buat testing".

**Aturan utama: cukup ubah saklarnya. Jangan hapus kode tombolnya.** Saklar ini mengatur bar "Lewati ›" di bagian bawah game tampilan r8.3.

## Shortcut keyboard: Alt+Q

**Alt+Q** sama persis dengan menekan "Lewati ›": satu tekanan, satu adegan. Dipakai karena di mode tangan kursor mouse disembunyikan. Tombol yang ditahan tidak mengulang. Kalau saklar disembunyikan, Alt+Q **ikut mati**.

## Cara 1: satu perintah (dev lokal)

Jalankan dari folder utama repo:

```bash
python scripts/skip_button.py off       # sembunyikan (pakai sebelum pengujian ke siswa)
python scripts/skip_button.py on        # tampilkan (dev dan demo)
python scripts/skip_button.py status    # lihat pilihan sekarang
python scripts/skip_button.py default   # hapus pilihan, game ikut bawaan build
```

- Perintah ini menulis ke database backend `backend/data/momo.sqlite`. Kalau database ada di tempat lain, pakai `--db <path>` atau set `MOMO_DB_PATH`.
- Kalau database belum ada, jalankan backend sekali dulu.

## Cara 2: lewat dashboard admin

Login sebagai **admin**, buka menu **Tombol Lewati**, lalu klik **Tampilkan** atau **Sembunyikan**. Akun guru tidak punya akses.

Di **Docker** pakai cara ini, karena folder `scripts/` tidak ikut masuk image backend.

## Siapa yang menang

1. **Pilihan admin atau script.** Disimpan di database (tabel `app_settings`, key `skip_button`).
2. Kalau belum pernah diatur: `NEXT_PUBLIC_SKIP_BUTTON` saat build game (`1` tampil, `0` sembunyi).
3. Kalau itu juga kosong: `NEXT_PUBLIC_DEV_TOOLS=1` berarti tampil, selain itu sembunyi.

Kalau server tidak bisa dihubungi, game memakai jawaban server terakhir yang tersimpan di browser (`localStorage` `momo.skipButton`). Kalau tidak ada, game ikut bawaan build.

Perubahan variabel `NEXT_PUBLIC_*` baru berlaku setelah game di-**build ulang**. Pilihan admin atau script **tidak** perlu build ulang atau restart. Perubahannya berlaku saat tab game dimuat ulang atau diklik lagi.

## Syarat supaya pilihan admin sampai ke game

- **Restart backend sekali** setelah pembaruan ini, supaya endpoint dan tabel barunya aktif.
- Game membaca `GET /api/settings/skip-button` dari alamat `NEXT_PUBLIC_API_BASE_URL`. Kalau variabel itu kosong, game memakai alamat yang sama dengan game (pola Docker/Caddy).
- **Dev lokal** dengan game di `:3000` dan backend di `:8000`: build game dengan `npm run build:local` (di `frontend/implementation`). Perintah itu sudah mengisi `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000`. Tanpa alamat itu, pilihan admin **tidak terbaca** dan yang berlaku bawaan build.

## Checklist sebelum pengujian ke siswa

1. `python scripts/skip_button.py off`, atau di admin klik **Sembunyikan**.
2. Muat ulang game di perangkat yang akan dipakai, lalu pastikan bar "Lewati" sudah **tidak ada**.
3. Jangan pakai data dari sesi yang sempat menekan "Lewati" sebagai data penelitian.

## Yang tidak diatur saklar ini

Tampilan lama (hanya muncul kalau di-build dengan `NEXT_PUBLIC_UI_R83=0`; bawaannya tampilan r8.3) punya tombol "Lewati" sendiri sebagai bagian produk, misalnya di kartu tutorial. Tombol itu tidak ikut disembunyikan.

## Untuk yang ngoding

| Bagian | File |
|---|---|
| Aturan tampil atau sembunyi | `frontend/implementation/src/config/skip-button.ts` |
| Komponen tombol | `frontend/implementation/src/features/shared/R83SkipBar.tsx` |
| API (`GET` publik, `PUT` hanya admin; `{"enabled": true \| false \| null}`) | `backend/app/dashboard.py` |
| Perintah terminal | `scripts/skip_button.py` |
| Halaman admin | `frontend/admin/app/(dashboard)/tombol-lewati/page.tsx` |
