# NUI Lab baseline-first and hand-lock QA review (0.22.1-alpha)

**Tanggal:** 16 November 2026. **Status:** `STATIC_ONLY / NOT_TESTED` sebelum verifikasi runtime Ujang.
**Sumber:** Owner 16 November, audit NUI Lab 0.22.0-alpha dan R&D `RND-DATASET-ROBUST-GESTURE-LOCK-2026-11-16-REVISI-UX.md`.
**Workflow:** review branch `nui-lab-qa-0.22.1` dari main `f19b04d`. Jangan langsung mengubah main bila gates belum hijau.

## Perubahan terarah
- `NuiLabPage` untuk `/nui-lab/gesture` dan `/nui-lab/canvas` memulai classifier dengan aturan **baseline** game. Hanya tombol eksperimen ON menyalakan `experimentalRobust`; OFF mengembalikan baseline. Tidak mengubah classifier default game siswa.
- Tombol `Pilih ulang tangan` adalah **fallback** yang terlihat hanya ketika lock membutuhkan intervensi karena kandidat `ambiguous` atau `unmatched-hand`, dan hanya ketika kamera aktif. Bila kamera kosong lalu satu tangan valid muncul, auto-lock tetap berjalan tanpa klik.
- Saat ada tangan lain yang tidak cocok dengan track yang sudah dikunci, UI tidak menjanjikan auto-reacquire yang tidak terjadi; pengguna diminta memperlihatkan satu tangan atau memilih ulang bila perlu.
- `lab-hand-lock.ts` **tidak diubah**. Saat track hilang tetapi bystander tetap terlihat, sistem tidak boleh otomatis menyerahkan kontrol karena itu membuka risiko salah gambar/hapus. Mekanisme memilih identitas personal dari RGB tidak ada.
- Tambahan regression tests untuk opt-in classifier dan reappearance setelah empty interval yang terlewati antarframe.

## Batas bukti
- MediaPipe Hand Landmarker tetap sumber 21 landmark utama. Tidak ada model baru, biometrik, dataset training, pengumpulan raw video, atau perubahan action mapping siswa.
- `PINCH` menggambar; **lima jari** menghapus, bukan kepalan; satu jari Undo dan dua jari Redo. Swipe Undo/Redo masih belum dikunci.
- Belum ada npm typecheck, lint, Vitest, Next build, browser, webcam fisik, latency/FPS benchmark atau tunnel. Kehadiran source/test **bukan** PASS.

## Perintah verifikasi Ujang
```bash
git fetch origin main nui-lab-qa-0.22.1
git switch nui-lab-qa-0.22.1
git pull --ff-only origin nui-lab-qa-0.22.1
python3 scripts/bump_version.py --check
cd frontend/implementation
npm ci
npm run typecheck
npm run lint
npm test
NEXT_PUBLIC_TEST_HOOKS=0 npm run build
```
Periksa dahulu working tree dan backup perubahan lokal sebelum checkout, jangan reset paksa.

## Acceptance di browser webcam
1. Buka langsung `/nui-lab/gesture`, `/nui-lab/canvas`, refresh browser, pastikan permission kamera belum diminta sebelum ON.
2. Pastikan mode awal **baseline**. Coba tiga jari dan pinch, nyalakan eksperimen, ulangi pada gerakan/kondisi yang sama. Kembalikan baseline tanpa reload.
3. Kamera kosong → satu tangan muncul di tepi mana pun → cursor aktif tanpa klik `Pilih ulang`. Tangan keluar >300ms dengan frame kosong cukup → satu tangan baru masuk → lock baru; tinta lama tidak diteruskan.
4. Tangan aktif masih terlihat dan tangan lain masuk → tetap mengikuti tangan aktif. Dua tangan crossing/ambigu → tahan aksi. Saat bystander saja tetap terlihat dan tidak cocok, jangan auto takeover; fallback muncul dan teks memberi alasan.
5. Verifikasi eraser hanya lima jari, kepalan tidak menghapus, pose satu jari Undo/two finger Redo tanpa perubahan mapping. Jangan mengklaim intent swipe.
6. Catat screenshot consent-safe, console error, FPS inferensi, latency pinch-to-ink, false takeover, false ink, hand lock recovery, build SHA dan URL tunnel.

**Promosi ke main:** hanya setelah quality gates dan QA yang relevan hijau, lalu fast-forward/PR merge non-destruktif sesuai aturan repo. Bila merah, perbaiki di branch review dan laporkan.
