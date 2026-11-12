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
| R10-01 | Hanya 3 level. Level 4 "Pembuktian" dihapus, tidak ada Bab 4 baru di game. | SELESAI | D-20261110-01; journey L1→L3 + ending lulus |
| R10-02 | Animasi tidak dipercepat. Kartu, buka buku, Momo, kamera kembali ke durasi normal, juga saat reduced motion. | SELESAI | D-20261110-03 |
| R10-03 | Momo tidur betul-betul animasi: napas, melayang, mengangguk, Zzz. Bukan gambar ditumpuk. | SELESAI-BELUM-KAMERA | `momo-engine.ts` |
| R10-04 | Lambaian di cover membangunkan Momo: kedip, bangun, dadah, melayang ke tengah dan membesar. Tanpa teks kaku "Lambaikan tanganmu". | SELESAI-BELUM-KAMERA | Deteksi lambaian nyata (`wave-tracker.ts`), bukan timer |
| R10-05 | Kamera cover besar di tengah, lalu mengecil dan pindah ke pojok (PIP). | SELESAI | Morph cover→PIP |
| R10-06 | Teks cover: "Aku Momo, gambar satu-satunya yang hidup …", nama **Thinman** tebal; jempol "Aku mengerti" membuka buku. | SELESAI | Nama: Thinman (Owner 2026-11-11) |
| R10-07 | Transisi buka buku ke atas terlihat jelas. | SELESAI | |
| R10-08 | Penggaris: hanya angka + penggaris; Momo di tengah dengan latar gelap lalu ke pojok; tanya "Benar ini nomor absenmu?" hanya setelah siswa menggeser; konfirmasi jempol. | SELESAI | |
| R10-09 | Kartu 1: seret Thinman dengan cubit sampai bendera (tidak jalan sendiri); cincin jempol muncul setelah sampai. | SELESAI-BELUM-KAMERA | |
| R10-10 | Kartu 2 tetap ada, jeda baca normal. | SELESAI | |
| R10-11 | Kartu 3: cubit = kuas, kepalan = penghapus ukuran tetap, dua jari = undo, telapak = redo; semua harus dicoba. | SELESAI-BELUM-KAMERA | Sisa kecil: ikon redo masih telapak terbelah |
| R10-12 | Jeda baca 10 detik sebelum cincin jempol aktif; bukan lanjut otomatis. | SELESAI | |
| R10-13 | Pilih level: 3 level, siswa baru diarahkan ke Level 1. | SELESAI | |
| R10-14 | Level 1: gambar tidak diberi kotak lagi. | SELESAI | |
| R10-15 | Dialog Momo butuh jempol (bukan skip); Momo di pojok saat menggambar. | SELESAI | |
| R10-16 | Top-3 baru muncul setelah siswa menahan jempol "selesai"; idle 10 detik hanya membuat Momo bertanya. | SELESAI | D-20261110-02 |
| R10-17 | Prediksi asli dari model Dias (REST), asal prediksi jujur, Accept/Correct/Override. | BLOKIR | Wiring siap. 20 kelas model Dias tidak ada yang cocok dengan benda level. Owner: "biar Dias yang adjust" (TERTUNDA) |
| R10-18 | Objek: cubit + cincin untuk pindah, lepas untuk taruh; lima jari diputar untuk rotasi (dua arah). | SELESAI-BELUM-KAMERA | D-20261110-08 |
| R10-19 | "Gambar lagi" untuk recovery, gestur tidak bentrok. | SELESAI | recovery-paths 16/16 |
| R10-20 | NUI penuh; fallback mouse/keyboard ada tapi tidak dipamerkan di awal; siswa tanpa kamera tidak terjebak. | SELESAI | Fix refresh tanpa kamera `f16b99a` |
| R10-21 | NUI MediaPipe + One Euro + CLAHE + ONNX (opsional) dinilai sesuai PANDUAN. | JALAN | Lihat R11-03..R11-07 |
| R10-22 | Level 3 lebih menantang, Momo bisa "halu" secara naratif, hasil model tidak direkayasa. | BELUM DICEK ULANG | Perlu audit ulang terhadap kode terbaru |
| R10-23 | Penutup: Thinman masuk portal dan hidup, Momo menjelaskan AI, rekap netral tanpa skor. | SELESAI | D-20261110-10 |
| R10-24 | Kuis/survei setelah penutup, bisa dinyalakan/dimatikan admin. | SEBAGIAN | Flag di game ada; toggle di dashboard admin/backend baru usulan kontrak ke Dias |
| R10-25 | Lead merencanakan, worker Haiku, Caveman hanya untuk jawaban ke Owner, Superpowers dipakai. | SELESAI | Cara kerja |

## R-2026-11-11 — revisi hari ini

| ID | Revisi (maksud Owner) | Status | Bukti / catatan |
|---|---|---|---|
| R11-01 | Nama tokoh tetap **Thinman** (pakai H). "Finman" di pesan Owner = salah ketik STT. | SELESAI | D-20261111-01 |
| R11-02 | Data dikirim ke backend saat siswa memilih di Top-3 (gestur 1/2/3, 4 = override) dan cincin konfirmasi penuh. Tidak perlu konfirmasi tambahan. Gestur 5 (gambar lagi) tidak mengirim. | SELESAI | Kode sudah begitu; D-20261111-01 |
| R11-03 | Cover terlalu lama. Dari lambaian sampai cincin jempol maksimal 10 detik, lebih baik kurang (target kerja: ≤ 8 detik; sebelumnya 20,8 detik). Semua kalimat Momo tetap utuh. | SELESAI-BELUM-KAMERA | Cincin jempol siap 7,8 s setelah lambaian (sebelumnya 20,8 s); konfirmasi paling cepat ±8,8 s karena tahan 1 s. Keempat kalimat utuh, kecepatan ketik cover 0,45×. `308b125` |
| R11-04 | Deteksi tangan harus akurat untuk pameran kampus: kunci ke tangan pemain, abaikan tangan orang lain di belakang. | SELESAI-BELUM-KAMERA | `af84c71`: numHands 2, confidence 0,6, tangan kecil/jauh diabaikan, kunci tangan pemain, tangan orang lain tidak bisa merebut saat tangan pemain hilang sesaat. Nilai awal, belum diukur di kamera |
| R11-05 | Gambar tidak boleh bergetar dan goresan tidak putus-putus. | SELESAI-BELUM-KAMERA | `3d7ddab`: getar diam 0,39 → 0,08 px (sintetis), lag garis pelan ±55 ms. Hysteresis cubit sudah ada |
| R11-06 | Tahan motion blur dan ruangan gelap (kamera 60 fps bila bisa, CLAHE saat gelap). | SELESAI-BELUM-KAMERA | Kamera minta 720p 24–60 fps (`308b125`); CLAHE otomatis saat gelap (`a4bf4e7`, ±2 ms/frame di sandbox) |
| R11-07 | "Kombinasi" MediaPipe + filter + ONNX. ONNX dinilai dulu (model tangan 21 titik, lisensi, ukuran) sebelum dipasang. | BATAL | Owner 2026-11-12: "gausah onnx deh". Kombinasi untuk pameran = MediaPipe + One Euro + CLAHE. Riset tetap disimpan: `docs/audit-2026-11-10/ONNX-HAND-RESEARCH.md` |
| R11-08 | Halaman uji NUI untuk Owner (FPS, getaran, waktu deteksi lambaian, CLAHE on/off) supaya bisa diukur di laptop sendiri sebelum pameran. | SELESAI-BELUM-KAMERA | `d4a6497`: `/nui-lab` (tidak ditautkan dari alur siswa). Buka: `npm run dev` → `http://localhost:3000/nui-lab` → "Nyalakan kamera". Belum dibuka di browser |
| R11-09 | Gabungkan semua isi `claude-monorepo` ke `main` supaya Dias bekerja di `main`; pekerjaan AI tetap di-push ke `claude-monorepo`. | SELESAI | 2026-11-12: merge `35e3da3` (tanpa force; `Proposal/` dan `LICENSE.md` main lama tetap). Gabungan berikutnya ke `main` hanya atas perintah Owner |
| R11-11 | Bug tata letak dari visual-tour: bubble Momo menutupi kartu bab di rekap; kanvas tampak kosong di layar sempit 390 px; PIP kamera menutupi tombol gameplay di layar sempit; pita "Mode demo" menutupi instruksi kartu. | SELESAI-BELUM-DICEK-VISUAL | `c4d1988` (CSS saja). Sisa: PIP menutupi kartu rekap di 390 px; pita "Mode demo" menutupi Momo di layar gambar/gameplay 390 px |
| R11-12 | NUI penuh di mode kamera: Owner melihat tombol mouse/touch di screenshot. Mode kamera harus memakai afordans gestur (cincin jempol, ikon gestur di bar gameplay, 1/2/3 jari) sesuai REVISI-NUI §16–20; tombol hanya untuk cadangan tanpa kamera. | JALAN | `5d3fb2d`: cover tanpa tombol di mode kamera (tahan cincin lambaian 1 s), kartu 3 dan kanvas level menerima mouse diam-diam. Terbukti di browser kamera palsu sampai kanvas L1. Sisa: gameplay mode kamera (ikon gerak belum bisa ditekan, worker W-GAMEPAD); audit mode kamera sampai akhir belum selesai (`e2e/visual-tour-camera.mjs`, bukti `run13-cam/GAP.md`) |
| R11-13 | Game melambat berat saat kamera nyala (uji kamera palsu: ketik intro 120–160 s vs ±27 s; coretan mouse hilang). Deteksi MediaPipe sinkron di thread utama. Target: satu deteksi per frame untuk seluruh app, lewati frame otomatis bila deteksi lambat (min ±8/s). | JALAN | Worker W-BUDGET (`src/camera/inference-scheduler.ts`); PANDUAN §3, §8 |
| R11-10 | Berkas `REVISIONS.md` ini sebagai daftar tugas dan penjabaran revisi Owner. | SELESAI | |

## Belum diuji (wajib Owner/tim di perangkat asli)

- Kamera fisik + MediaPipe: lambaian, jempol, cubit, kepalan, dua jari, telapak, putar lima jari, sudut telunjuk.
- Ruang pameran: cahaya redup, banyak orang di belakang pemain, tangan anak, tangan kiri.
- Alur kelas penuh (backend + Caddy + dashboard) dengan kode terbaru.
