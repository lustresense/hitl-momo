# REVISIONS — daftar revisi Owner dan progresnya

Berkas ini adalah **daftar tugas hidup** untuk revisi yang diminta Owner (CAN). Tujuannya: kalau satu sesi AI berhenti (limit, error), sesi atau agent lain bisa langsung melanjutkan dari sini.

Pembagian peran berkas:

| Berkas | Isi | Pertanyaan yang dijawab |
|---|---|---|
| `DECISIONS.md` | Keputusan produk yang sudah disahkan Owner | "Apa yang sudah diputuskan?" |
| `REVISIONS.md` (ini) | Setiap revisi Owner, dijabarkan jelas dari ucapan/STT, dengan status kerja | "Apa yang diminta, sudah sampai mana, apa langkah berikutnya?" |
| `../../CHANGELOG.md` (root) | Perubahan teknis per commit/versi | "Apa yang berubah di kode?" |
| `NOW.md` | Ringkasan keadaan terbaru, satu halaman | "Kondisi sekarang seperti apa?" |
| `project/OWNER_MANDATES.md` | Instruksi Owner dalam kata-katanya sendiri | "Owner persisnya bilang apa?" |

Aturan isi:
- Satu baris = satu revisi yang bisa dicek. Tulis maksud Owner dalam kalimat jelas; ejaan STT dibetulkan (contoh: "Finman" dari STT = **Thinman**).
- Status: `SELESAI` (kode + test + bukti), `SELESAI-BELUM-KAMERA` (lulus test dan browser mouse, belum dicoba kamera fisik), `JALAN` (sedang dikerjakan), `BELUM`, `TERTUNDA` (Owner menunda), `BLOKIR` (butuh pihak lain).
- Jangan menghapus revisi. Revisi yang batal diberi status `BATAL` beserta alasannya.
- Kamera fisik tidak ada di sandbox AI. Semua gestur diuji dengan landmark sintetis atau mouse. Uji kamera asli wajib dilakukan Owner sebelum pameran.

## Cara melanjutkan (handoff)

- Repo kerja: cabang `claude-monorepo`. Game: `frontend/implementation/`. Jangan push ke `main` atau `can` tanpa perintah Owner.
- Dokumen kerja revisi 2026-11-10: `docs/audit-2026-11-10/` (BIGPROMPT, PANDUAN-NUI, REVISI-NUI, RECONCILE, NUI-PLAN, NUI-RESULTS, MILESTONES-LOG).
- Gerbang sebelum commit: `npx tsc --noEmit`, `npx next lint`, `npx vitest run` (dari `frontend/implementation`).
- Uji browser (mouse, tanpa kamera): build `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`, lalu satu per satu dengan `NO_VIDEO=1`: `e2e/recovery-paths.mjs`, `e2e/route-canvas.mjs`, `e2e/normal-journey.mjs`, `e2e/finish-thumb-flow.mjs`, `e2e/visual-tour.mjs`.
- Commit memakai identitas environment Owner, tanpa baris atribusi AI (lihat `AGENTS.md` root).

## R-2026-11-10 — Big prompt, PANDUAN NUI, REVISI-NUI

| ID | Revisi (maksud Owner) | Status | Bukti / catatan |
|---|---|---|---|
| R10-01 | Hanya 3 level. Level 4 "Pembuktian" dihapus, tidak ada Bab 4 baru di game. | SELESAI | D-20261110-01; journey L1→L3 + ending lulus · Versi: 0.6.2-alpha |
| R10-02 | Animasi tidak dipercepat. Kartu, buka buku, Momo, kamera kembali ke durasi normal, juga saat reduced motion. | SELESAI | D-20261110-03 · Versi: 0.6.2-alpha |
| R10-03 | Momo tidur betul-betul animasi: napas, melayang, mengangguk, Zzz. Bukan gambar ditumpuk. | SELESAI-BELUM-KAMERA | `momo-engine.ts` · Versi: 0.6.2-alpha |
| R10-04 | Lambaian di cover membangunkan Momo: kedip, bangun, dadah, melayang ke tengah dan membesar. Tanpa teks kaku "Lambaikan tanganmu". | SELESAI-BELUM-KAMERA | Deteksi lambaian nyata (`wave-tracker.ts`), bukan timer · Versi: 0.6.2-alpha |
| R10-05 | Kamera cover besar di tengah, lalu mengecil dan pindah ke pojok (PIP). | SELESAI | Morph cover→PIP · Versi: 0.6.2-alpha |
| R10-06 | Teks cover: "Aku Momo, gambar satu-satunya yang hidup …", nama **Thinman** tebal; jempol "Aku mengerti" membuka buku. | SELESAI | Nama: Thinman (Owner 2026-11-11) · Versi: 0.6.2-alpha |
| R10-07 | Transisi buka buku ke atas terlihat jelas. | SELESAI | Versi: 0.6.2-alpha |
| R10-08 | Penggaris: hanya angka + penggaris; Momo di tengah dengan latar gelap lalu ke pojok; tanya "Benar ini nomor absenmu?" hanya setelah siswa menggeser; konfirmasi jempol. | SELESAI | Versi: 0.6.2-alpha |
| R10-09 | Kartu 1: seret Thinman dengan cubit sampai bendera (tidak jalan sendiri); cincin jempol muncul setelah sampai. | SELESAI-BELUM-KAMERA | Versi: 0.6.2-alpha |
| R10-10 | Kartu 2 tetap ada, jeda baca normal. | SELESAI | Versi: 0.6.2-alpha |
| R10-11 | Kartu 3: cubit = kuas, kepalan = penghapus ukuran tetap, dua jari = undo, telapak = redo; semua harus dicoba. | SELESAI-BELUM-KAMERA | Sisa kecil: ikon redo masih telapak terbelah · Versi: 0.6.2-alpha |
| R10-12 | Jeda baca 10 detik sebelum cincin jempol aktif; bukan lanjut otomatis. | SELESAI | Versi: 0.6.2-alpha |
| R10-13 | Pilih level: 3 level, siswa baru diarahkan ke Level 1. | SELESAI | Versi: 0.6.2-alpha |
| R10-14 | Level 1: gambar tidak diberi kotak lagi. | SELESAI | Versi: 0.6.2-alpha |
| R10-15 | Dialog Momo butuh jempol (bukan skip); Momo di pojok saat menggambar. | SELESAI | Versi: 0.6.2-alpha |
| R10-16 | Top-3 baru muncul setelah siswa menahan jempol "selesai"; idle 10 detik hanya membuat Momo bertanya. | SELESAI | D-20261110-02 · Versi: 0.6.2-alpha |
| R10-17 | Prediksi asli dari model Dias (REST), asal prediksi jujur, Accept/Correct/Override. | BLOKIR | Wiring siap. 20 kelas model Dias tidak ada yang cocok dengan benda level. Owner: "biar Dias yang adjust" (TERTUNDA) |
| R10-18 | Objek: cubit + cincin untuk pindah, lepas untuk taruh; lima jari diputar untuk rotasi (dua arah). | SELESAI-BELUM-KAMERA | D-20261110-08 · Versi: 0.6.2-alpha |
| R10-19 | "Gambar lagi" untuk recovery, gestur tidak bentrok. | SELESAI | recovery-paths 16/16 · Versi: 0.6.2-alpha |
| R10-20 | NUI penuh; fallback mouse/keyboard ada tapi tidak dipamerkan di awal; siswa tanpa kamera tidak terjebak. | SELESAI | Fix refresh tanpa kamera `f16b99a` · Versi: 0.6.2-alpha |
| R10-21 | NUI MediaPipe + One Euro + CLAHE + ONNX (opsional) dinilai sesuai PANDUAN. | JALAN | Lihat R11-03..R11-07 · Versi: 0.10.1-alpha |
| R10-22 | Level 3 lebih menantang, Momo bisa "halu" secara naratif, hasil model tidak direkayasa. | MENUNGGU OWNER | Audit `docs/audit-2026-11-10/L3-AUDIT.md`. Sesuai: kabut 0/0,4/0,9 dan menutup wajah Momo di L3; confidence model tidak diubah; mock berlabel demo. Kurang: (1) L3 hanya butuh 1 benda (`cyclesRequired` 1) sedangkan L2 butuh 2, jadi L3 tidak lebih menantang; (2) model asli belum bisa main (label map Dias, R10-17); (3) bukti L3 hanya mode demo; (4) D-20261027-01 (Kabut Penghapus) masih "Belum dikunci" · Versi: 0.12.1-alpha |
| R10-23 | Penutup: Thinman masuk portal dan hidup, Momo menjelaskan AI, rekap netral tanpa skor. | SELESAI | D-20261110-10 · Versi: 0.6.2-alpha |
| R10-24 | Kuis/survei setelah penutup, bisa dinyalakan/dimatikan admin. | SEBAGIAN | Flag di game ada; toggle di dashboard admin/backend baru usulan kontrak ke Dias · Versi: 0.6.2-alpha |
| R10-25 | Lead merencanakan, worker Haiku, Caveman hanya untuk jawaban ke Owner, Superpowers dipakai. | SELESAI | Cara kerja |

## R-2026-11-12 — revisi Owner dari perangkat asli (screenshot `docs/audit-2026-11-10/owner-2026-11-12-cover.webp`)

| ID | Revisi (maksud Owner) | Status | Bukti / catatan |
|---|---|---|---|
| R12-01 | Cover jangan polos: tetap ada tulisan judul (bukan hanya pita "Sketchbook Universe Present" dan kartu kamera). | SELESAI-BELUM-DICEK-BROWSER | Judul "Sketchbook Universe" di cover, di bawah pita dan di atas kartu kamera, di mode kamera dan tanpa kamera; tidak ikut ke PIP. · Versi: 0.12.9-alpha |
| R12-02 | Momo tidur di cover tidak beranimasi sama sekali di perangkat Owner (hanya diam, satu "z"). Harus benar-benar animasi tidur. | SELESAI-BELUM-DICEK-BROWSER | Akar masalah (screenshot Owner cocok dengan jalur "animasi dikurangi" Windows/browser): tiga huruf Zzz menumpuk jadi satu "z", dan gerak tidur dikecilkan ke 35 % sehingga tampak beku. Sekarang tidur tetap 60 %: napas, melayang, angguk, dan tiga Zzz naik. · Versi: 0.12.8-alpha |
| R12-03 | Perpindahan Momo antar layar tidak mulus; latar berganti sendiri sebelum transisi selesai (bug). | SELESAI-BELUM-DICEK-BROWSER | Latar cover tetap sampai buku membalik (dulu berubah saat kartu kamera mendarat di pojok). Momo cover memudar mulai di tengah balikan buku, layar berikutnya memudar masuk; tidak ada dua Momo. Level baru muncul di tengah balikan. Belum: perpindahan penggaris→kartu→level masih navigasi langsung. · Versi: 0.12.9-alpha · Sisa selesai 0.14.2-alpha: penggaris → kartu → level → dunia berpindah dengan balikan halaman buku; layar baru di tengah balikan; Momo lama memudar, Momo baru memudar masuk |
| R12-04 | Transisi "buku naik ke atas" jelek dan tidak sesuai; harus buka buku semi-3D dari bawah ke atas (M-019) yang halus. | SELESAI-BELUM-DICEK-BROWSER | `046484a`: engsel atas, rotateX dengan perspektif, bayangan menyapu, tebal kertas, 0,9 s; reduced motion durasi sama. · Versi: 0.12.7-alpha |
| R12-05 | Lambaian terlalu lama: deteksi otomatis begitu melambai, tapi akurat. Boleh tambah ONNX sedikit atau OpenCV untuk membatasi tangan siapa yang dipakai: jangan deteksi muka, jangan terganggu objek/orang lain. | SELESAI-BELUM-KAMERA | Tanpa OpenCV/ONNX: MediaPipe Face Detector (BlazeFace 229.746 B, sha256 b4578f35…52f) menandai wajah pemain; hanya tangan di area wajah pemain yang dihitung, kotak wajah tidak bisa jadi "tangan", kepala menoleh tidak dihitung lambaian. Lambaian dikenali setelah ±1,5 kali balik arah, termasuk ayunan kecil: paling lama ±1,0 s (sintetis 30 Hz). Nilai area wajah masih nilai awal. · Versi: 0.13.0-alpha |
| R12-07 | Regresi: perjalanan normal gagal di Level 3 pada build terbaru (run20: area permainan hilang saat Momo bicara setelah menang; run21 bersih: tombol "Lempar" tidak muncul). Lulus di d278c5e. `main` tidak diperbarui sampai ini beres. | JALAN | Worker W-BISECT (bisect commit + perbaikan) |
| R12-06 | Cara kerja: worker Haiku effort high, lead push bila hasil sesuai; Dias mengikuti alur yang sama; aturan versi dan rilis disalin juga ke `contexts/can/` supaya tetap aman bila Dias mengubah aturan global. | SELESAI | `contexts/can/AGENTS.md` |

## R-2026-11-11 — revisi hari ini

| ID | Revisi (maksud Owner) | Status | Bukti / catatan |
|---|---|---|---|
| R11-01 | Nama tokoh tetap **Thinman** (pakai H). "Finman" di pesan Owner = salah ketik STT. | SELESAI | D-20261111-01 · Versi: 0.10.1-alpha |
| R11-02 | Data dikirim ke backend saat siswa memilih di Top-3 (gestur 1/2/3, 4 = override) dan cincin konfirmasi penuh. Tidak perlu konfirmasi tambahan. Gestur 5 (gambar lagi) tidak mengirim. | SELESAI | Kode sudah begitu; D-20261111-01 · Versi: 0.10.1-alpha |
| R11-03 | Cover terlalu lama. Dari lambaian sampai cincin jempol maksimal 10 detik, lebih baik kurang (target kerja: ≤ 8 detik; sebelumnya 20,8 detik). Semua kalimat Momo tetap utuh. | SELESAI-BELUM-KAMERA | Cincin jempol siap 7,8 s setelah lambaian (sebelumnya 20,8 s); konfirmasi paling cepat ±8,8 s karena tahan 1 s. Keempat kalimat utuh, kecepatan ketik cover 0,45×. `308b125` · Versi: 0.10.1-alpha |
| R11-04 | Deteksi tangan harus akurat untuk pameran kampus: kunci ke tangan pemain, abaikan tangan orang lain di belakang. | SELESAI-BELUM-KAMERA | `af84c71`: numHands 2, confidence 0,6, tangan kecil/jauh diabaikan, kunci tangan pemain, tangan orang lain tidak bisa merebut saat tangan pemain hilang sesaat. Nilai awal, belum diukur di kamera · Versi: 0.10.1-alpha |
| R11-05 | Gambar tidak boleh bergetar dan goresan tidak putus-putus. | SELESAI-BELUM-KAMERA | `3d7ddab`: getar diam 0,39 → 0,08 px (sintetis), lag garis pelan ±55 ms. Hysteresis cubit sudah ada · Versi: 0.10.1-alpha |
| R11-06 | Tahan motion blur dan ruangan gelap (kamera 60 fps bila bisa, CLAHE saat gelap). | SELESAI-BELUM-KAMERA | Kamera minta 720p 24–60 fps (`308b125`); CLAHE otomatis saat gelap (`a4bf4e7`, ±2 ms/frame di sandbox) · Versi: 0.10.1-alpha |
| R11-07 | "Kombinasi" MediaPipe + filter + ONNX. ONNX dinilai dulu (model tangan 21 titik, lisensi, ukuran) sebelum dipasang. | BATAL | Owner 2026-11-12: "gausah onnx deh". Kombinasi untuk pameran = MediaPipe + One Euro + CLAHE. Riset tetap disimpan: `docs/audit-2026-11-10/ONNX-HAND-RESEARCH.md` · Versi: 0.11.3-alpha |
| R11-08 | Halaman uji NUI untuk Owner (FPS, getaran, waktu deteksi lambaian, CLAHE on/off) supaya bisa diukur di laptop sendiri sebelum pameran. | SELESAI-BELUM-KAMERA | `d4a6497`: `/nui-lab` (tidak ditautkan dari alur siswa). Buka: `npm run dev` → `http://localhost:3000/nui-lab` → "Nyalakan kamera". Belum dibuka di browser · Versi: 0.11.3-alpha |
| R11-09 | Gabungkan semua isi `claude-monorepo` ke `main` supaya Dias bekerja di `main`; pekerjaan AI tetap di-push ke `claude-monorepo`. | SELESAI | 2026-11-12: merge `35e3da3` (tanpa force; `Proposal/` dan `LICENSE.md` main lama tetap). Gabungan berikutnya ke `main` hanya atas perintah Owner · Versi: 0.12.1-alpha |
| R11-11 | Bug tata letak dari visual-tour: bubble Momo menutupi kartu bab di rekap; kanvas tampak kosong di layar sempit 390 px; PIP kamera menutupi tombol gameplay di layar sempit; pita "Mode demo" menutupi instruksi kartu. | SELESAI-BELUM-DICEK-VISUAL | `c4d1988` (CSS saja). Sisa: PIP menutupi kartu rekap di 390 px; pita "Mode demo" menutupi Momo di layar gambar/gameplay 390 px · Versi: 0.11.3-alpha |
| R11-12 | NUI penuh di mode kamera: Owner melihat tombol mouse/touch di screenshot. Mode kamera harus memakai afordans gestur (cincin jempol, ikon gestur di bar gameplay, 1/2/3 jari) sesuai REVISI-NUI §16–20; tombol hanya untuk cadangan tanpa kamera. | SELESAI-BELUM-KAMERA | Mode kamera (kamera palsu Chromium, `e2e/visual-tour-camera.mjs`, `b27490c`) jalan dari cover sampai L1 menang tanpa tombol mouse/keyboard: cincin lambaian, cincin jempol, Top-3 ikon 1/2/3/5 jari, bar gameplay ikon gestur + speedometer + panel "Pakai tanganmu". Semua kontrol juga menerima tekan diam-diam (`5d3fb2d`, `ba5c895`). Sisa: skrip tour belum lanjut setelah L1 (layar gagal, portal, rekap belum difoto) · Versi: 0.12.1-alpha |
| R11-13 | Game melambat berat saat kamera nyala (uji kamera palsu: ketik intro 120–160 s vs ±27 s; coretan mouse hilang). Deteksi MediaPipe sinkron di thread utama. Target: satu deteksi per frame untuk seluruh app, lewati frame otomatis bila deteksi lambat (min ±8/s). | SELESAI-BELUM-KAMERA | Profil CPU: 7,9 s dari 8 s di MediaPipe `readPixels` pada GPU software. `6786b80` (satu deteksi per frame, budget adaptif) + `d278c5e` (GPU software → CPU, batas 50%). Browser: label "CPU (tanpa GPU)", intro tidak macet, baris pertama Momo 3,3 s · Versi: 0.12.1-alpha |
| R11-14 | Tour mode kamera sampai akhir: layar gagal, portal, rekap, layar akhir difoto di mode kamera dan dicocokkan dengan REVISI-NUI. | JALAN | Worker W-TOUR2 · Versi: 0.12.1-alpha |
| R11-15 | Cek waktu cover di mode kamera (tercatat 2,1 s, sebelumnya 7,8 s): keempat kalimat Momo harus tetap tampil utuh sebelum cincin bisa ditahan. | SELESAI-BELUM-DICEK-BROWSER | Bug nyata: kalimat "Zzz..." (sapaan saat tidur) menyalakan penanda "kalimat selesai" dan tidak di-reset, jadi cincin muncul sebelum Momo selesai bicara. `2e4dff7`: di-reset saat bangun; cincin siap ±7,8 s dengan keempat kalimat utuh dan berurutan (jsdom). Ukur ulang di browser pada build berikutnya · Versi: 0.12.1-alpha |
| R11-16 | Tata letak HP sisa: pita "Mode demo" menutupi Momo di layar gambar/gameplay; kamera kecil menutupi kartu rekap. | JALAN | Worker W-LAYOUT2 · Versi: 0.12.1-alpha |
| R11-17 | Uji kelas penuh (backend + Caddy + dashboard) dengan kode terbaru. | JALAN | Worker W-CLASS · Versi: 0.12.1-alpha |
| R11-18 | `/nui-lab` menampilkan statistik deteksi (Hz, ms) dan delegate GPU/CPU yang baru. | JALAN | Worker W-LAB2 · Versi: 0.12.1-alpha |
| R11-10 | Berkas `REVISIONS.md` ini sebagai daftar tugas dan penjabaran revisi Owner. | SELESAI | Versi: 0.10.1-alpha |

## Belum diuji (wajib Owner/tim di perangkat asli)

- Kamera fisik + MediaPipe: lambaian, jempol, cubit, kepalan, dua jari, telapak, putar lima jari, sudut telunjuk.
- Ruang pameran: cahaya redup, banyak orang di belakang pemain, tangan anak, tangan kiri.
- Alur kelas penuh (backend + Caddy + dashboard) dengan kode terbaru.
