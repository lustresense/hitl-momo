# proto-html — prototipe visual standalone

Kumpulan HTML satu-file untuk eksplorasi **cover Momo dan alur masuk** (kamera → Momo bangun → buku → penggaris nomor absen). Ini **bukan bagian aplikasi**: tidak ada di `app/`, `src/`, `public/` atau `out/`, tidak diimpor kode mana pun, dan tidak dimuat `tsconfig.json` maupun `vitest.config.mts`. Build Next.js tidak berubah.

- Kamera **disimulasikan**. Tidak ada webcam, izin kamera, MediaPipe, model, jaringan atau penyimpanan.
- Cara buka: klik dua kali file `.html` di browser. Tidak perlu server atau `npm`.
- Jangan salin mentah ke `src/`. Port ke komponen repo harus lewat token, kit dan komponen yang sudah ada (lihat "Aset repo yang diaudit").

## Isi

| Berkas | Peran |
|---|---|
| `welcome-flow2/COVER_MOMO_WELCOME_FLOW2_V5.html` | **Terbaru.** Alur 2: gerbang kamera di bubble Momo yang mengigau, lalu cover, buku, penggaris. |
| `welcome-flow2/archive/V1..V4_*.html` | Riwayat. Hanya untuk melihat bagaimana V5 sampai di sana. |
| `reference/COVER_MOMO_SANDBOX_REVISI_R20_CAM.html` | Sandbox masukan Owner (dasar V1). Apa adanya. |
| `reference/COVER_MOMO_SANDBOX_REVISI_R21_CAM.html` | Sandbox R21 dari GPT. Apa adanya. Hanya art dan timing menguapnya yang dipakai di V3 ke atas. Gaya visual GPT (ring jempol oranye, pill ON/OFF) **dikoreksi Owner** dan tidak dipakai. |

Semua file tersalin **byte-identik** dengan yang dikirim ke Owner (sha256 di bawah).

## Alur di V5

1. **Gerbang.** Momo tidur dan mengigau. Bubble berisi catatan "Soal kamera" (satu paragraf justify), checkbox, dan tombol Lanjut. Toggle kamera terkunci sampai centang dan Lanjut.
2. Centang: Momo melek setengah dan mengigau. Lanjut: Momo lebih melek, toggle terbuka.
3. Toggle ON: kartu membuka, Momo terpental langsung kencang (balistik), keluar layar sekitar 3 detik, turun dengan mulut bergelombang, mulut datar, menguap, melek dikit, kartu morph ke PIP kiri bawah, Momo turun ke tengah sambil mulai tersenyum, lalu menjelaskan (satu aksi per baris).
4. Ring jempol: tahan 2 detik (mouse, sentuh, Enter atau Spasi). Lepas sebelum penuh, ring turun setengah kecepatan.
5. Momo menukik ke kanan bawah, kertas membuka, Momo masuk lagi ke halaman penggaris yang digelapkan, mendemokan tarik penggaris (ekspresi O saat menarik), kembali ke kanan atas, halaman terang, bantuan pinch dengan ring muncul.
6. Bar bawah (dock) hanya alat review: lompat state (Tidur, Centang, Lanjut, Kamera ON, Ring, Penggaris) dan pilih judul A sampai E atau "Lama".

## Aset repo yang diaudit (hanya dibaca, tidak diubah)

Sumber: `main` pada `6e89a47`. Yang dicocokkan:
`src/components/momo/momo-art.ts`, `momo-wing.ts`, `momo-engine.ts`; `src/components/ui/ThumbConfirm.tsx`, `PinchRing.tsx`, `GestureGlyph.tsx`; `app/styles/60-global-camera.css` (PIP), `96-kit-base.css` (kartu, bubble), `98-kit-flow.css` (bookmark level), `102-gesture.css`; `src/components/onboarding/StudentRulerSelector.*`; `src/domain/guide-script.ts`, `ruler-script.ts`.

Temuan yang sudah diterapkan di V2 ke atas:
- Sandbox R20 punya path **sayap kanan (bagian oranye) terpotong**: segmen `1275.8 899.6` hilang. Itu penyebab error konsol `<path> attribute d: Expected number` dan sayap tampak separuh. Diganti path `momo-art.ts` persis.
- Matematika sayap sandbox identik dengan `momo-wing.ts`. Mata, mulut dan alis disamakan dengan `momo-engine.ts`.
- PIP repo **mempertahankan toggle** (kanan bawah, skala 0,72). Sandbox menyembunyikannya.
- Ring jempol: `ThumbConfirm` (hold 2000 ms, drain 0,5x). Bantuan pinch: `PinchRing`. Bubble: `.momo-chat__bubble`. Penggaris: `.student-ruler`. Kartu kamera mengambil bahasa bookmark level (`bm-*`).

## Bukti dan batas

Kelas bukti: **browser headless (Chromium via Playwright), bukan perangkat nyata**.
- Dijalankan di 1440x900, 1024x768, 390x844 dan 375x667: gerbang, launch, yawn, morph PIP, dialog, ring, dive, penggaris, pinch help, replay. Error konsol 0.
- Gerak direkam per frame dan dihitung: launch puncak 3826 px/dtk di 0,1 detik pertama; dive berangkat 43 sampai 1200 px/dtk dengan putar maksimal 176 derajat/dtk; sampai di penggaris mengerem ke 62 px/dtk.
- **Belum**: perangkat sentuh nyata, Safari/Firefox, webcam fisik, `prefers-reduced-motion` secara visual, pemeriksaan frame-by-frame sayap dan ekor. Penilaian "enak ditonton" tetap oleh Owner.

## Catatan konten dan keputusan terbuka

- **Klaim privasi** di gerbang hanya "videonya nggak direkam" dan "diproses langsung di browser". Di kode frontend tidak ada `MediaRecorder`, capture atau upload frame (di luar folder game), tetapi event log (`http-batch-sink`) dan data gambar stiker (`POST /predict` saat provider mitra aktif, `partner-http-provider.ts`) **tetap dikirim**. Klaim "tidak dipakai untuk training" **tidak ditulis** karena belum dikonfirmasi DIAS.
- **Bubble saat Momo tidur** bertentangan dengan butir lama "tidak ada chat saat tidur" di brief GPT. Dipertahankan karena instruksi Owner yang lebih baru; repo sudah punya preseden `COVER_SLEEP_NUDGE` ("Zzz... coba sapa aku, dong.").
- Belum ada: takik swallowtail bookmark di kartu kamera (kartu memuat toggle dan dropdown); persetujuan gerbang belum disimpan (di app pakai `sessionStorage`); langkah repo "Benar ini nomor absenmu, N?" plus ring 2 detik di penggaris tidak dimodelkan; loading root (`DreamLoader`) tidak termasuk; HTML referensi loading DeepSeek tidak tersedia.
- Layar lebih pendek dari sekitar 700 px: judul cover disembunyikan selama bubble gerbang tampil.

## Riwayat versi

| Versi | Perubahan utama |
|---|---|
| V1 | Gerbang Alur 2 di atas sandbox R20: checkbox, Lanjut, toggle terkunci, melek setengah, dock review. |
| V2 | Koreksi brief R21: 3 detik di luar layar, yawn dulu baru morph, `ThumbConfirm`, PIP toggle repo, dialog repo, path sayap diperbaiki. |
| V3 | Yawn dan morph material dari R21, Momo turun ke tengah setelah PIP, dive berorientasi, pelajaran penggaris (scrim, demo tarik, pinch help), kartu kamera gaya bookmark. |
| V4 | Lintasan berangkat dan sampai dibuat per-waktu (tidak ada putaran mendadak). |
| V5 | Launch balistik, urutan ekspresi baru, aksi per baris dialog, ekspresi O saat menarik, bubble dan penggaris ke kit repo, paragraf justify, judul tanpa shadow. |

## sha256

```
f5880f9cc9a4b14499fbb6fec7bb529799314aa7bd0fafd69858f4e477bf2601  reference/COVER_MOMO_SANDBOX_REVISI_R20_CAM.html
f410f2b763f198e427dd3b69f943701c1c3a3e04e22a06426e0b922a62a9202f  reference/COVER_MOMO_SANDBOX_REVISI_R21_CAM.html
494e2cc62f7bbe66354cbfa81393399d6cddb2b322da320fcc8f29e0ffdf1c9c  welcome-flow2/COVER_MOMO_WELCOME_FLOW2_V5.html
d6d0323cc7bde5fb07fd199e7d8dc38f953f8347ae2a56542b5c8a873c77bd49  welcome-flow2/archive/V1_WELCOME_FLOW2_MOMO_NGELINDUR.html
c42489efce9e530dc41f5604abc0de3cb99376a286d40cf772e3de7c94beca8a  welcome-flow2/archive/V2_COVER_MOMO_WELCOME_FLOW2.html
5664aa5d925ccc4b2ca176749ecf498313c1eb6ca99ac9b5c893afbf50d8321f  welcome-flow2/archive/V3_COVER_MOMO_WELCOME_FLOW2.html
e289000ad1a12dd5588bbb92862fdff9179bb6c5f9e828dda0c273a1fdf2efea  welcome-flow2/archive/V4_COVER_MOMO_WELCOME_FLOW2.html
```
