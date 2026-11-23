# Kandidat MobileNetV2 HF3: BELUM SIAP DEPLOY

Target: DEV HF3, bukan main atau production. Patch frontend berbasis HF3 tree `fe0b8b6e5d2cb7823db9090b61ac1abfd531dd59`, bukan langsung terhadap commit dasar saja. Jangan terapkan sebelum mencocokkan tree dan memastikan `git apply --check frontend-hf3.patch` lulus pada checkout HF3 terisolasi. Patch tidak mencakup model, label JSON, runtime, konfigurasi service, reverse proxy, atau environment build.

`server.py` menggunakan `rasterize_ref.py` yang diserahkan Owner. Model hanya dipakai bila SHA-256 `ecd1638605ecdd61596bb518d80771af444e2698670a2babf16c109ac71d69bc`; label disediakan terpisah sebagai `model_4_mobilenetv2.labels.json`. Jangan commit model atau data. Kandidat perlu hardening server, pengujian payload/timeouts, service user systemd, reverse proxy same-origin dan pengujian browser sebelum deploy. `server.py` saat ini hanya proses uji lokal port 5567, bukan unit service final.

Kandidat build memakai `NEXT_PUBLIC_PREDICTION_MODE=partner`, endpoint `https://dev.momominum.tech/api/predict`, dan `NEXT_PUBLIC_APP_VERSION=0.29.4-alpha+r23b-hf3-mnv2`. Cek sendiri bahwa versi terpasang benar-benar tampil sebelum mengklaimnya.

Rollback target HF3: belum diuji untuk kandidat ini. Jangan memindahkan service DEV sampai rollback dan batas routing production telah diverifikasi.

## Hasil sementara
- Referensi rasterizer diterima; uji bentuk, rentang dan polaritas lulus.
- Prediksi localhost: 20 permintaan identik menghasilkan p90 75,16 ms pada saat pengukuran. Ini bukan p90 browser atau jaringan publik.
- Tes prediction 150/150; NUI 325/325; tes game/app/domain 470/470; TSC dan build lulus. Lint lulus dengan satu warning hook yang sudah ada.
- Baseline tiga berkas tes input: 39 lulus, 9 gagal, sesuai jumlah HF3. Bukan bukti browser end-to-end.
- Belum dites: browser gambar ke prediksi dan dampak di game untuk 3 kategori; same-origin tunnel; p90 end-to-end; rollback; ketahanan beban dan keamanan publik.
- Belum deploy. Admin tidak dikerjakan.
