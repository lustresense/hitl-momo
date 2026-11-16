# Handoff NUI Lab — terintegrasi ke ujang-monorepo 0.19.0-alpha

**Tanggal:** 16 November 2026 WIB  
**Owner:** CAN (interaksi/NUI)  
**Branch deploy:** `ujang-monorepo` (NUI Lab ditransfer dari staging `nui-lab`, baseline `a18a6e8`). `main` tetap tidak diubah.  
**Evidence:** `STATIC_ONLY / NOT_TESTED`. Tidak ada hasil npm, Next build, browser/webcam atau deploy dari konektor GitHub.

## Route yang harus tersedia melalui domain/tunnel dev

| URL | Fungsi |
|---|---|
| `/nui-lab` | Landing dua eksperimen. Tidak meminta kamera |
| `/nui-lab/gesture` | Webcam dan overlay landmark, katalog 8 pose sesuai classifier, hand/face counts, inference Hz, luma/CLAHE, uji wave terpisah |
| `/nui-lab/canvas` | Kanvas scratch besar, webcam preview di kiri bawah, tools di kanan, Momo text bubble, pinch drawing, mouse/touch drawing dan penghapus pointer |
| `/nui-lab/diagnostics` | Dashboard lama dipertahankan untuk metrik lengkap dan QA historis |

**Routing** memakai file `frontend/implementation/app/nui-lab/**/page.tsx` Next.js App Router, `output: "export"`. Domain harus menyajikan subpath statis termasuk direct refresh, bukan hanya client-side navigation; Ujang yang memeriksa konfigurasi tunnel/reverse proxy. Tidak ada perubahan `main`, backend, model partner, atau URL siswa yang ada.

## Arsitektur dan batas

- **One classifier source:** `NuiLabPage` satu komponen menerima `variant`, `LabAnalyzer` satu per page mount, `HandStrokePipeline`, `StrokeStore`, `FaceAnchor`, `primary-hand`, `frame-source`, `inference-scheduler`, MediaPipe `hand_landmarker.task`. Jangan membuat model kedua dengan threshold tak konsisten.
- **Gesture page:** `thumb-up`, `pinch`, `fist`, `one-finger`, `two-fingers`, `three-fingers`, `split-palm`, `open-palm`; `none` saat tidak terdeteksi. Display classifier heuristik bukan probabilitas/confidence model, tidak mengeksekusi aksi game.
- **Canvas page:** pinching hand draws to same `StrokeStore`; gesture commander mode drawing mengirim Undo/Redo berdasarkan hold. Pointer/touch punya pen/erase/undo/redo/clear. Camera preview natural, enhanced frames khusus inference sesuai pilihan low-light. Momo pendamping visual, tidak membuat objek atau mengambil keputusan.
- Kamera hanya diminta setelah klik `Nyalakan kamera`; stop/unmount melepaskan track dan model. Tidak ada gameplay atau Top-3 pada lab.
- Tujuan eksperimental: ukur smoothness/akurasi nyata, bukan klaim semuanya sudah baik.

## Perintah Ujang (jalankan setelah pull branch)

```bash
git fetch origin ujang-monorepo
git switch ujang-monorepo
git pull --ff-only origin ujang-monorepo
python3 scripts/bump_version.py --check
cd frontend/implementation
npm ci
npm run typecheck
npm run lint
npm test
NEXT_PUBLIC_TEST_HOOKS=0 npm run build
```

Jangan checkout branch staging `nui-lab`. Setelah verifikasi commit di `ujang-monorepo`, bersihkan branch staging remote dengan `git push origin --delete nui-lab` sesuai instruksi Owner; jangan hapus sebelum kode terverifikasi berada pada HEAD `ujang-monorepo`. Amankan working tree sebelum pull. Jangan menghapus pekerjaan lokal Ujang yang belum disimpan.

## Wajib diuji sebelum live tunnel

- Root `/nui-lab` dapat memilih dua workspace, akses langsung ke kedua route tanpa onboarding dan tanpa automatic camera permission.
- `/nui-lab/gesture` memastikan 8 pose ditampilkan, indikator aktif sesuai pose, skeleton/primary-hand/face tampil; semua uji hand-in-front-face, multi-hand, backlight, motion blur wajib dicatat PASS/FAIL terukur.
- `/nui-lab/canvas` dipakai menggambar gerakan kecil dan cepat, deteksi jitter dan effective FPS; pointer fallback, pen, erase, undo, redo, clear; Momo tidak menutupi kanvas.
- Preview kamera kecil berada di kolom kiri bawah desktop, canvas tengah, tools kanan. Layout mobile tetap bisa di-scroll tanpa kliping dan tanpa scrolling saat drawing.
- Stop/refresh/nav page harus menutup MediaStream tracks, tidak ada duplicate landmarker / RAF. Ulang ON/OFF 10x termasuk denied permission.
- Uji direct reload `/nui-lab/canvas` dan `/nui-lab/gesture` lewat HTTPS tunnel, bukan hanya localhost. Static-host mungkin perlu rewrite/trailing-slash sesuai config deploy yang sudah dipakai.

**Jika satu gate gagal:** laporkan error dan perbaiki scope NUI Lab saja. Jangan deploy atau mengubah Momo cover, card tutorial, gameplay, branch `main`. Ujang bukan diminta mengimplementasikan ulang workspace, hanya memverifikasi source dan memperbaiki kegagalan berdasarkan bukti.

**Status saat file ini dibuat:** source sudah dipindahkan ke tree `ujang-monorepo`, tetapi build/webcam/deploy belum terverifikasi. `0.19.0-alpha` adalah versi source frontend terintegrasi, bukan klaim deployed.

## Perubahan topologi branch (Owner 16 November 2026)
Ujang sudah memiliki domain tunnel dev yang mengambil frontend dari `ujang-monorepo`. Maka `nui-lab` bukan branch deploy. Halaman NUI Lab adalah folder App Router dan src/components/nui-lab di frontend yang sama. Setelah verifikasi sumber, branch staging boleh dihapus melalui Git CLI; konektor yang digunakan sesi ini tidak mendukung penghapusan ref.

## Delta 0.20.0-alpha — koreksi user 16 November 2026

**Target branch:** tetap `ujang-monorepo` dengan frontend pada domain/tunnel yang sama. Tidak checkout branch `nui-lab`, jangan merge `main`.

**Gesture canvas game + NUI Lab:** cubit telunjuk-jempol = Coret; kelima jari terbuka = Hapus; satu jari = Undo; dua jari = Redo. Pose kepal boleh muncul sebagai diagnostik tetapi tidak menghapus. `split-palm` pun baru boleh menghapus bila `countExtendedFingers` benar-benar 5. Jangan membuat classifier kedua atau mengecilkan aturan lima jari diam-diam. Mapping Top-3, dialog jempol dan gameplay exploration tidak diubah.

**Perilaku eksperimen:** `/nui-lab/gesture` menunjukkan pose dan jari tanpa menggambar. `/nui-lab/canvas` menggambar di 1280×720, cursor hover/near/draw/ring penghapus mengikuti pipeline game, ikon `GestureGlyph` dan HUD status lock. Kamera tetap natural untuk user, preprocessing hanya pada inference source. `FullFrameHandLock` khusus lab menerima tangan dari area mana pun dalam frame dan berhenti saat identitas ambigu/lost sampai lock dipulihkan. Mode ini **bukan** penggantian face gate produk/game dan belum menjamin tidak pernah salah lock pada webcam nyata.

**Bukti dibutuhkan Ujang sebelum deploy:** `python3 scripts/bump_version.py --check`, npm CI/typecheck/lint/Vitest/build, file statis deep-link, screenshot desktop/mobile, validasi kamera ON/OFF, 1/2 tangan, hand-over-face, crosshands, blur, backlight, lowlight, FPS dan p50/p95, scroll/gesture UI. Setiap FAIL diperbaiki berdasarkan log. Source sekarang `STATIC_ONLY / NOT_TESTED`.
