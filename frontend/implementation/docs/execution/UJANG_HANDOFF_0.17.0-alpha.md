# Handoff Ujang | Sketchbook Universe 0.17.0-alpha | 15 November 2026

## Konteks dan batas kerja
- Base branch: ujang-monorepo dari commit 9452cc64952166c7221655d746fc3fb7a644b2d8.
- Owner meminta perbaikan inkonsistensi icon gestur, audit bug, manifest dependency, dan jalur deployment yang tidak mewajibkan Owner menginstal tool.
- Repo Ujang hanya diberi source/tes/dokumen melalui GitHub. Tidak ada akses dari sesi ini ke VM atau deployment aktif.
- main tidak boleh diubah jika verifikasi belum PASS. Semua perubahan pada batch ini adalah STATIC_ONLY sampai Ujang menyediakan log/build/browser/webcam.

## Implementasi source
1. Artwork SVG original src/components/ui/GestureGlyph.tsx, terintegrasi via Icon.tsx dan enam nama gesture-*; legacy Figma tetap untuk kompatibilitas, bukan ikon tutorial terkini.
2. DrawingToolbar, PinchRing, PlacementControls, ExplorationRings, StudentRulerSelector, TutorialBrochure, dan tutorial-script menunjukkan gesture yang sesuai kontrak terkini.
3. Card 3 memblokir fist pada tutorial, termasuk ketika alat Hapus aktif; open-palm dan split-palm lima jari menghapus; undo satu jari, redo dua jari. Kanvas utama tetap mengizinkan fist, sesuai pemisahan mode.
4. GlobalCamera menyiarkan kondisi gagal/siap/idle melalui camera-assist-state. MomoGuide memperbesar Momo yang SUDAH ADA pada halaman saat kamera gagal, menampilkan instruksi recovery tanpa mengganti dialog, callback atau memasang maskot kedua.
5. NUI Lab mengembalikan preprocessing asli ketika halaman diagnostik di-unmount sehingga mode RAW 320/CLAHE 320 eksperimen tidak terbawa ke permainan siswa.
6. BookFlip dibetulkan ke top hinge dan -180 derajat untuk membuka ke dalam sesuai test existing, dengan perubahan playKey saat animasi aktif yang me-restart timeline secara aman.

## Dependency dan install
- Frontend ini Node.js/Next.js; sumber dependency sebenarnya adalah frontend/implementation/package.json dan package-lock.json, bukan pip.
- frontend/implementation/requirements.txt berisi penjelasan dan sengaja tanpa Python package.
- Paket Python backend yang benar berada di backend/requirements.txt, terpisah dari root requirements.txt untuk pelatihan model.
- Jalankan dari root repo: bash frontend/implementation/scripts/ujang-verify-web.sh.
- Skrip tersebut melakukan npm ci, typecheck, lint, Vitest dan build; gagal pada error pertama. Jangan melanjutkan deploy kalau salah satu gagal.

## Deploy yang hanya dilakukan Ujang
1. Ambil commit terverifikasi pada ujang-monorepo ke workspace build/deploy Ujang. Hindari force push/reset.
2. Verifikasi PASS dari skrip, lalu jalankan E2E relevan memakai browser sesungguhnya sesuai docs/execution/RUN_GUIDE.md.
3. Jika melewati semua gate, deploy di environment yang ditentukan Owner memakai pipeline yang sudah ada. Untuk Docker Compose, variabel environment, Caddy dan sertifikat dikelola di server, bukan dicantumkan di Git/chat.
4. Periksa health web HTTPS dan link halaman utama serta /nui-lab. Lakukan cold start tanpa cache dan warm reload.
5. Owner hanya membuka alamat web yang Ujang laporkan. Owner tidak wajib menjalankan npm/pip, WSL, VS Code atau Antigravity.
6. Jangan menjanjikan branch push langsung terlihat di web. Tanpa pipeline deployment otomatis yang terverifikasi, commit bukan deploy.

## Acceptance dan regresi kamera fisik
- Cover -> wake wave -> thumb -> BookFlip -> ruler -> Card 1 -> Card 2 -> Card 3 -> gameplay.
- Card 1 berjalan hanya dari arah telunjuk, kanan/kiri/atas/diagonal; gesture pinch tidak menjadi jalan rahasia.
- Card 3 pinch menggambar, lima jari menghapus, satu jari undo, dua jari redo; kepalan tidak menghapus, checklist hanya saat store berubah.
- Matikan kamera secara sengaja, tolak izin, lalu cabut dan colok kembali kamera; Momo recovery harus informatif dan tidak duplikat.
- Cek glyph pada ukuran kecil di monitor dan ponsel; jumlah jari harus dapat dibedakan tanpa hanya membaca teks.
- /nui-lab bandingkan RAW native, RAW 320, CLAHE 320, auto menggunakan posisi, kamera dan pencahayaan yang sama; ukur FPS, tracked hands, failure dan latency, jangan klaim threshold valid sebelum data.

## Evidence status
- PATCHED STATIC_ONLY: code dan regression test disiapkan.
- NOT TESTED: tsc, lint, vitest, build, E2E, responsive screenshot, fps, webcam USB, cold/warm start, dan deployment aktif.
- Jika ada tes gagal, perbaiki hasil spesifik sebelum deploy. Jangan menyatakan semua tiket atau bug bebas masalah.
- Ujang wajib melaporkan commit SHA, output tiap gate, URL lingkungan pengujian, dan residual issues. Screenshot/video siswa tidak perlu disalin ke repo.
