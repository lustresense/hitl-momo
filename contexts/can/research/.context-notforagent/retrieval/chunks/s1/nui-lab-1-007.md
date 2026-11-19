# NUI Lab 1 | pesan 69-75

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6af91610-8118-83ec-a99a-7da7066a2d11
> Source Git blob: 97f069a5376d0dece332731902ab3b2d0b93b622

## L1-M069 | Assistant | waktu tidak ada


Gw akan bongkar ZIP revisi, cocokin setiap tiket dan HTML dengan kode terbaru di `ujang-monorepo`, lalu kerjakan kekurangannya sekaligus perbaikan NUI yang sudah kita audit. Targetnya perubahan yang bisa diuji di laptop, bukan sekadar klaim sudah beres. `main` tetap nggak gw sentuh.

Dari kode terbaru, ada tiga gap yang paling jelas. Card 1 masih memakai gerak tangan sebagai drag, Card 3 masih punya mapping tutorial yang mengizinkan kepalan, dan DreamLoader punya dependency effect yang bisa mengulang animasi saat teks status berubah. Gw juga sudah memastikan bug dimensi FaceAnchor masih ada di `ujang-monorepo`.

Gw akan prioritaskan jalur ini dulu karena dampaknya langsung ke pengalaman dan tes webcam. Untuk efek visual yang belum bisa gw verifikasi di browser, gw nggak akan asal mengubah motion yang sebenarnya sudah benar.

Gw sudah menyiapkan perubahan, tapi operasi GitHub dalam satu batch kena batas jumlah panggilan konektor sebelum ada file yang tertulis. Gw pecah jadi beberapa batch kecil dan akan menggabungkannya menjadi satu commit di `ujang-monorepo`, supaya nggak ada kondisi setengah terpasang.

Gw sudah bongkar ZIP `Sketchbook-Revisi-Ujang-0.15.5-alpha.zip`\. Isinya enam tiket `REV-B03-001` sampai `REV-B03-006` dan prototype HTML loading Momo. Acuan implementasi sekarang adalah `ujang-monorepo` versi **`0.16.0-alpha`**, bukan versi lama pada nama ZIP.

**Temuan awal gw, laporan Ujang menyebut keenam tiket sudah dikerjakan, tetapi kode yang gw periksa belum sepenuhnya memenuhi tiket itu.**

Contohnya, Card 1 masih menggerakkan Thinman berdasarkan perpindahan posisi tangan, bukan arah telunjuk yang menjadi kontrol gameplay. Pinch juga masih diterima sebagai alternatif gerak. Sementara itu, DreamLoader sudah ada, tetapi lifecycle loading dan transisinya masih perlu diperiksa sebelum bisa dianggap aman untuk cold start.

Jadi gw nggak akan mengulang keenam tiket dari nol atau menganggap laporan `6/6` sebagai bukti. Gw akan memperbaiki bagian yang memang masih bermasalah, mempertahankan bagian yang sudah benar, dan memasukkan perbaikan NUI backlight serta wake-up wave ke batch yang sama.

## Implementasi sudah masuk ke `ujang-monorepo`

(Perlu pengujian laptop) Versi 0.16.1-alpha

**[Lihat commit 9452cc6 di GitHub](https://github.com/lustresense/hitl-momo/commit/9452cc64952166c7221655d746fc3fb7a644b2d8)**

Gw membuat satu commit yang mengubah **25 file**, termasuk regression test, dokumentasi audit, dan sinkronisasi versi monorepo.

Gw sudah cek ulang setelah commit.

- `ujang-monorepo` sekarang di `9452cc6`\.
- `main` tetap di `56bdc2e`, **tidak disentuh**\.
- Versi di `VERSION`, frontend, admin, dan backend konsisten pada `0.16.1-alpha`\.

## Status enam tiket revisi

| Tiket | Hasil |
|--------|--------|
| **REV-B03-001** Cover dan BookFlip | Tidak gw ubah. CSS sekarang sudah memakai pivot bawah, tetapi persepsi transisi dan kemungkinan flicker tetap perlu dicek lewat browser. |
| **REV-B03-002** Penggaris | Hint pinch dipindahkan dari marker putih ke badan penggaris oranye. Animasi hint ikut bergerak horizontal. |
| **REV-B03-003** Kamera mati | **Belum tuntas.** Pesan kamera mati sudah ada, tetapi pembesaran Momo secara konsisten di seluruh halaman masih membutuhkan penanganan layout agar tidak menggandakan maskot. |
| **REV-B03-004** Card 1 | Kontrol kamera diubah menjadi arah telunjuk sesuai aturan gameplay. Jalan terus selama arah ditahan, telunjuk ke atas memicu animasi loncat, dan pinch tidak lagi menjadi shortcut berjalan. |
| **REV-B03-005** Card 3 | Mapping kepalan lama dihapus dari mode tutorial. Ikon yang salah menggambarkan gestur lama diganti ikon alat netral. Jalur checklist tetap berdasarkan perubahan kanvas nyata. |
| **REV-B03-006** DreamLoader | Memperbaiki effect yang sebelumnya berisiko restart ketika status loading atau callback berubah, membersihkan timeline morph saat unmount, dan memperjelas fallback pointer jika warmup gagal. |

## Perbaikan NUI yang sudah dimasukkan

**1\. FaceAnchor**

Bounding box wajah kini dihitung dari resolusi input yang benar-benar diterima MediaPipe. Gw juga menambahkan tes untuk membandingkan koordinat RAW 1280×720 dan CLAHE 320×180.

**2\. Deteksi backlight**

Mode otomatis sekarang mempertimbangkan kecerahan area tengah dibandingkan seluruh frame. Ini ditujukan untuk kasus latar terang tetapi wajah atau tangan gelap. Ambangnya masih parameter prototype, bukan hasil kalibrasi webcam lu.

**3\. Perbandingan RAW dan CLAHE**

Di `/nui-lab`, sekarang ada pilihan **RAW 320** dan **CLAHE 320**, supaya kita bisa menguji peningkatan gambar tanpa mencampurnya dengan perbedaan resolusi.

**4\. Wake-up wave**

Progress ring tidak lagi terlihat hampir selesai ketika jumlah sampel belum memenuhi syarat. Pengukuran waktu lambaian vertikal di NUI Lab juga dibetulkan.

Dokumentasi audit lengkap per tiket beserta acceptance gap sudah ada di [REV-B03-NUI-0.16.1-alpha.md](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/frontend/implementation/docs/execution/REV-B03-NUI-0.16.1-alpha.md)\.

## Yang wajib lu uji saat membuka laptop

Jalankan dari `frontend/implementation`

Terminal [Salin]

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Setelah itu, buka `/nui-lab` menggunakan webcam USB lu. Bandingkan mode **Mati**, **RAW 320**, **CLAHE 320**, dan **Otomatis** dengan posisi serta pencahayaan yang sama. Perhatikan jumlah tangan yang terdeteksi, tangan utama, deteksi efektif per detik, dan apakah lambaian benar-benar membangunkan Momo.

**Batas verifikasi gw saat ini adalah audit kode, commit, diff, dan konsistensi versi.** Gw belum menjalankan typecheck, Vitest, build, atau webcam fisik. Jadi belum ada dasar untuk menyebut seluruh tiket PASS atau menyatakan masalah backlight sudah selesai di perangkat lu.

Satu langkah berikutnya adalah **jalankan empat perintah terminal di atas**, kemudian uji Card 1, Card 3, dan wake-up wave pada kamera asli.

---

Saran update WORKING\_STATE

- **Yang berubah\:** Commit `9452cc6` pada `ujang-monorepo`, versi `0.16.1-alpha`, memuat koreksi REV-B03 dan NUI. Sebanyak 25 file berubah. Tes dan runtime kamera belum terverifikasi. Tiket REV-B03-003 masih memiliki gap implementasi.
- **Bagian terdampak\:** Workflow GitHub, tutorial onboarding, gesture routing, DreamLoader, FaceAnchor, low-light, wave tracker, dan NUI Lab.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L1-M070 | User | 2026-11-15 07:08:52


message time: 2026-11-15 07:08:52

Oke gini, lu fix kan bug-bug yang ada di Ujang Monorepo. Cukup banyak bug, terutama icon-icon yang kurang sesuai. Jadi iconnya nggak pakai gambar jari gesture gitu. Jadi lo buat sendirilah gambarnya. Lo kan punya GPT image. Terus habis itu ya udah gitu lah, lo implement semuanya. Terus lo bikin requirements.txt di dalam frontend atau di manalah terserah pokoknya. Gini, gue buka laptop tuh cuma buka webnya, karena yang install dan lain-lain itu si Ujang. Ujang yang install. Jadi requirements.txt itu harus ada. Karena Ujang ini pakai model nemotron goblok. Jadi ya antigravity gue lagi kenapa-kenapa gitu lah. Jadi nggak bisa dipakai, pake @GitHub cok tadi bisa anjing

---

---

## L1-M071 | Assistant | waktu tidak ada


Gw langsung audit `ujang-monorepo` versi terbaru, beresin bug yang bisa dibuktikan dari kode, lalu ganti ikon gestur yang salah dengan artwork SVG buatan sendiri. Gw juga akan pasang manifest dependency dan instruksi deploy untuk Ujang, jadi lu cukup buka web setelah Ujang menjalankan instalasi dan deploy. Perubahan tetap di `ujang-monorepo`, bukan `main`.

Audit awal nemu sumber inkonsistensi yang nyata. Ikon gesture lama dari Figma masih tersimpan dengan mapping kepalan, dua jari, dan telapak terbelah, sedangkan tutorial sekarang mengajarkan pinch, lima jari, satu jari, dan dua jari. Ada juga jalur klasifikasi `split-palm` yang bisa membuat telapak lima jari tidak masuk ke aksi Hapus di Card 3.

Gw akan bikin glyph tangan SVG baru yang jelas jumlah jarinya, menyambungkannya ke UI, dan memperbaiki jalur gestur itu. Satu hal teknis penting, frontend ini Next.js, jadi instalasinya memakai `package-lock.json` dan `npm ci`, bukan `pip requirements.txt`. File `requirements.txt` frontend tetap gw buat sebagai penjelas agar Ujang tidak salah install.

Glyph tangan SVG baru sudah gw buat di source, dan pemakaiannya sudah gw sambungkan ke Card 1, Card 3, penggaris, toolbar gambar, pinch ring, serta kontrol placement. Ikon lama tetap tersimpan untuk kompatibilitas, tetapi UI yang gw sentuh tidak lagi memakai ikon dengan arti gestur yang keliru.

Gw juga menutup celah Card 3 yang sebelumnya belum benar-benar dites. Kepalan sekarang diblokir sebagai Hapus pada mode tutorial, termasuk setelah tombol Hapus dipilih. Telapak dengan lima jari yang terbaca sebagai `split-palm` tetap bisa menghapus. Mode kanvas utama tidak ikut diubah aturannya.

Gw sudah push perbaikan ke **`ujang-monorepo` versi `0.17.0-alpha`**, termasuk ikon tangan SVG buatan sendiri, perbaikan gesture Card 3, BookFlip, recovery Momo, dan berkas instalasi untuk Ujang.

Commit terbaru (Sudah di GitHub)

## cebbaa4

35 file berubah • 478 baris ditambahkan • 148 baris dihapus

[Lihat commit implementasi](https://github.com/lustresense/hitl-momo/commit/cebbaa4797c963da80090d54728a5b0e39c811e4)

## Yang gw perbaiki

| Area | Perubahan |
|--------|--------|
| **Ikon NUI** | Enam glyph SVG original untuk pinch, lima jari, satu jari, dua jari, telunjuk kanan, dan telunjuk atas. |
| **Card 1** | Petunjuk visual sekarang menunjukkan telunjuk, bukan pinch. |
| **Card 3** | Kepalan diblokir sebagai Hapus di tutorial, termasuk saat tool Hapus aktif. Telapak terbuka dan `split-palm` lima jari bisa menghapus. |
| **Toolbar dan gesture ring** | Ikon disesuaikan dengan gesture yang dipakai, bukan mapping lama. |
| **Momo dan kamera** | Saat kamera gagal, Momo yang sudah ada pada halaman membesar dan memberi petunjuk fallback. Tidak membuat Momo kedua. |
| **BookFlip** | Arah rotasi dan titik engsel dibetulkan. Animasi dapat dimulai ulang saat `playKey` berubah. |
| **NUI Lab** | Mode preprocessing eksperimen dikembalikan saat halaman ditutup agar tidak terbawa ke gameplay. |

Ikon baru berupa **artwork vektor yang gw gambar langsung dalam kode**, bukan hasil generator GPT Image. Aset legacy tetap disimpan untuk kompatibilitas.

## Soal `requirements.txt` dan Ujang

Gw sudah tambahkan [requirements.txt frontend](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/frontend/implementation/requirements.txt)\.

Ada satu hal yang perlu diluruskan. **Frontend ini menggunakan Next.js dan TypeScript, bukan Python.** Jadi `requirements.txt` frontend sengaja tidak berisi paket `pip`\. Dependency yang harus Ujang instal tetap berasal dari `package.json` dan `package-lock.json` menggunakan `npm ci`\.

Buat menghindari Ujang salah langkah, gw juga menyiapkan\:

**[Skrip verifikasi untuk Ujang](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/frontend/implementation/scripts/ujang-verify-web.sh)**

Instal dependency, typecheck, lint, Vitest, dan production build. Berhenti jika ada kegagalan.

---

**[Handoff instalasi dan deployment](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/frontend/implementation/docs/execution/UJANG_HANDOFF_0.17.0-alpha.md)**

Tugas Ujang, urutan verifikasi, acceptance test webcam, dan aturan deploy. Lu cukup membuka URL web setelah Ujang menyelesaikannya.

## Status yang belum boleh dianggap selesai

**Source sudah masuk GitHub, tetapi web belum terbukti menjalankan versi baru.**

Gw sudah verifikasi branch dan konsistensi versi frontend, backend, serta admin. `main` tetap di `56bdc2e` dan tidak gw sentuh.

Namun, **belum ada hasil CI atau GitHub Actions pada commit ini**\. Typecheck, unit test, build, E2E, tampilan responsif, dan webcam fisik belum dijalankan. Jadi gw belum bisa menjamin semua bug hilang atau menyebut versi ini siap dipakai siswa.

Langkah selanjutnya ada di **Ujang**\. Jalankan skrip verifikasi, perbaiki kegagalan yang ditemukan, lakukan browser QA, lalu deploy setelah semua gate lulus. Setelah itu lu tinggal membuka web dan menguji NUI langsung.

---

Saran update WORKING\_STATE

- **Yang berubah\:** Implementasi `0.17.0-alpha`, commit `cebbaa4` di `ujang-monorepo`, 35 file berubah. Ditambahkan glyph SVG original, perbaikan gesture, recovery Momo, BookFlip, manifest dependency frontend, dan handoff Ujang. Status runtime masih BELUM-TERBUKTI.
- **Bagian terdampak\:** NUI, UI/UX, onboarding, gesture engine, icon system, versioning, workflow instalasi dan deployment.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

⚠️ Kandidat perubahan **keputusan** terdeteksi

- **Ringkasan\:** Lu secara eksplisit mengubah arahan lama yang menunda pembuatan ikon custom. Sekarang lu meminta artwork gestur dibuat sendiri dan diimplementasikan.
- **Entri lama yang mungkin terdampak\:** Ketentuan ikon dalam REV-B03 dan keputusan visual/gesture terkait.
- **Status bukti\:** keputusan eksplisit.
- **Tindakan\:** `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

---

---

## L1-M072 | User | 2026-11-15 07:41:37


message time: 2026-11-15 07:41:37

Oh iya, dengan lo ubah-ubah kayak gitu, lo udah ngubah MDMD sesuai, gini, lo dari situ harus membaca agents.md-nya kalau lagi buka repo gua dan implementasi langsung. Kalau gue minta tolong untuk implementasi dan lo akseskan implementasi ini sekarang pakai ChatGPT ini kan. Nah, lo harus baca dulu agents.md di dalam konteks Chan, di dalam folder konteks ada folder chan. Nah itu lo baca agents.md-nya. Jadi lo harus ubah semua, bukan cuma versioning, decisions.md kalau gue udah merubah sesuatu. Baca di situ ada panduannya semua, semua MD yang terkait itu harus lo ubah biar AI manapun atau gue ngerjain manual itu bisa paham apa aja yang berubah. benahin @GitHub

---

---

## L1-M073 | Assistant | waktu tidak ada


Gw benahin dokumentasi di `ujang-monorepo` berdasarkan aturan repo, bukan sekadar bump versi. Gw baca `contexts/can/AGENTS.md` dan dokumen turunannya dulu, cocokkan dengan perubahan di commit sebelumnya, lalu update MD yang memang wajib ikut berubah. `main` tetap nggak disentuh.

Ketemu masalah dokumentasinya. `contexts/can/AGENTS.md` memang mewajibkan pembaruan lintas `DECISIONS`, `OWNER_MANDATES`, `REVISIONS`, dan state teknis, sementara commit `0.16.1` dan `0.17.0` kemarin baru memperbarui `CHANGELOG` dan handoff. Beberapa snapshot `NOW` juga masih menunjuk branch dan kondisi November awal.

Gw akan mencatat perubahan produk secara terpisah dari hasil implementasi yang masih `STATIC_ONLY`, supaya AI berikutnya nggak salah menganggap tes webcam sudah lulus.

Dokumen keputusan, mandat Owner, daftar revisi, serta `NOW`/memory teknis sudah gw susun ulang sebagai perubahan tambahan tanpa menghapus riwayat. Konflik penting juga gw catat terbuka. Kode Card 1/Card 3 versi terbaru berbeda dari beberapa keputusan lama, jadi gw **nggak diam-diam menganggap keputusan lama dicabut**.

Sekarang gw rapikan panduan di level `frontend/implementation`, karena masih ada path dan instruksi run lama yang bisa menyesatkan Ujang.

Gw sudah benahin dokumentasi GitHub di **`ujang-monorepo`**, setelah membaca `contexts/can/AGENTS.md` dan panduan turunannya. Total **20 berkas diperbarui** tanpa menyentuh `main`\.

Commit sinkronisasi dokumentasi (Sudah di GitHub)

## 24e17c4

Versi 0.17.1-alpha • Dokumentasi saja

[Lihat commit dan seluruh perubahan](https://github.com/lustresense/hitl-momo/commit/24e17c4fd5bfeafbb518203cf4de7b20adf07f19)

## Dokumen yang sudah disinkronkan

| Dokumen | Perubahan |
|--------|--------|
| [contexts/can/AGENTS.md](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/contexts/can/AGENTS.md) | Memperjelas kewajiban membaca aturan dan memperbarui seluruh dokumentasi terkait setiap implementasi. |
| [DECISIONS.md](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/contexts/can/DECISIONS.md) | Menambahkan keputusan artwork gestur `D-20261115-01` dan mencatat konflik mapping gesture `D-20261115-02` sebagai **Belum dikunci**\. |
| [OWNER_MANDATES.md](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/contexts/can/project/OWNER_MANDATES.md) | Menambahkan mandat `M-032` dan `M-033` berdasarkan instruksi lu. |
| [REVISIONS.md](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/contexts/can/REVISIONS.md) | Menambahkan `R15-01` sampai `R15-06`, termasuk pekerjaan yang masih perlu pengujian. |
| NOW, WORKING\_CONTEXT, PROJECT\_MEMORY | Memperbarui keadaan teknis, commit, branch, dan pekerjaan yang belum terbukti berjalan. |
| SOURCE\_OF\_TRUTH, tiga AGENTS.md | Memperbaiki routing dokumen, path monorepo, dan prosedur sinkronisasi lintas AI. |
| CHANGELOG, panduan arsitektur, RUN\_GUIDE, handoff Ujang | Mencatat perubahan dua versi sebelumnya dan langkah verifikasi berikutnya. |

## Ada satu konflik yang sengaja nggak gw tutup diam-diam

Keputusan lama masih mencatat Card 1 menggunakan cubit dan beberapa gesture tutorial lama. Source sekarang menggunakan arah telunjuk untuk Card 1, serta lima jari untuk Hapus, satu jari Undo, dan dua jari Redo di Card 3.

Gw catat ketidaksesuaian itu sebagai **D-20261115-02, Belum dikunci**, bukan langsung mencabut keputusan yang sebelumnya aktif.

**Hasil verifikasi GitHub**

- `ujang-monorepo` sekarang `24e17c4`\.
- `main` tetap `56bdc2e`\.
- Versi global, frontend, admin, dan backend konsisten pada `0.17.1-alpha`\.
- Build, test, webcam fisik, dan deployment masih belum terbukti. Skrip version-check juga belum bisa dijalankan lewat konektor.

Satu hal lagi. **`DECISIONS.md` yang ada di Project GPT lu belum otomatis ikut berubah.** Yang gw update sekarang adalah salinan di GitHub. Untuk menyamakan Project Sources, lu tetap perlu mengganti berkasnya secara manual.

---

Saran update WORKING\_STATE

- **Yang berubah\:** GitHub `ujang-monorepo` mencapai `24e17c4`, versi `0.17.1-alpha`, dengan sinkronisasi 20 berkas dokumentasi. Aturan dokumentasi M-033 kini tercatat di repo.
- **Bagian terdampak\:** Workflow ChatGPT GitHub, dokumentasi Can, versioning, handoff Ujang, dan status pengujian.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

⚠️ Kandidat perubahan **keputusan** terdeteksi

- **Ringkasan\:** Mapping gesture Card 1 dan Card 3 pada source terbaru belum sepenuhnya cocok dengan keputusan aktif lama.
- **Entri lama yang mungkin terdampak\:** D-20261110-06 dan D-20261110-07.
- **Status bukti\:** belum cukup bukti untuk menganggap keputusan lama telah dicabut.
- **Tindakan\:** `DECISIONS.md` lokal perlu ditinjau; ketik `AUDIT SEKARANG` untuk Patch Changelog Usulan.

---

---

## L1-M074 | User | 2026-11-15 07:58:57


message time: 2026-11-15 07:58:57

Oke, cuma di session yang gue suruh implement langsung kayak gini aja, harus baca agents.md di dalam context itu ya. Karena ya bisa aja gue pakai akun pro atau akun plus beli kayak biasanya itu nggak mungkin karena kita konektornya pakai punya orang dan nggak mungkin dia masuk ke kontributor gue. Nah sekarang gini, dari situ kan lo lihat tuh decisions.md. Gue mau lo beneran rekonsiliasi sekarang juga. At least minimal yang ada di project context ini meskipun lo fokus ke GitHub gue kalau lo gue suruh implementation. Biar lo nggak kebanyakan output di akhir kayak misal, kandidat perubahan keputusan terdeteksi gitu. Sebisa mungkin gue meminimalisir itu dengan update decisions.md ini. Nah, yang ada di repo GitHub adalah source of truth karena Ujang udah implement itu. Tapi yang ada di ChatGPT ini, ChatGPT project web ini, eh project chat web ini, kalau misal ada yang baru dan nggak ada di situ, tapi lebih ke arah ke depan, baru lo tulis. Pokoknya rekonsiliasi gitu lah. Jangan push ke repo-nya. Lo audit only untuk saat ini. Audit only decisions.md. Hasil rekonsiliasi lo laporin ke sini. Jangan ditaruh di GitHub. Kirim ke chat gue dan kasih tahu apa yang berubah, konfliknya apa, dan kenapa lo pilih demikian. soal card 1, yg udh gw setujui adalah yg telunjuk. pake @GitHub buat audit aja, jangan ubah apapun di gitub repo gw.

---

---

## L1-M075 | Assistant | waktu tidak ada


Gw audit dua `DECISIONS.md` secara read-only. Gw bandingkan file Project GPT dengan `contexts/can/DECISIONS.md` di `ujang-monorepo`, lalu cek source yang relevan kalau ada konflik. Card 1 gw pegang sebagai keputusan terbaru lu, yaitu kontrol **arah telunjuk**, bukan cubit. Hasilnya gw laporkan di chat, tanpa mengubah GitHub atau Project Sources.

# Audit rekonsiliasi DECISIONS.md

**Verdict gw, `DECISIONS.md` GitHub jadi baseline utama, tetapi file Project GPT jangan langsung diganti tanpa rekonsiliasi.** Ada konflik nomor ID, keputusan lama yang sudah digantikan, dan status Card 1 yang perlu dikoreksi berdasarkan persetujuan terbaru lu.

Audit ini membandingkan dua file berikut.

**Project GPT** v2026.11.05-audit.8

65 ID keputusan unik, dengan riwayat sampai 5 November 2026.

---

**[GitHub ujang-monorepo](https://github.com/lustresense/hitl-momo/blob/ujang-monorepo/contexts/can/DECISIONS.md)** Commit 24e17c4

95 referensi ID unik, termasuk dua ID contoh dalam petunjuk. Ada 28 entri keputusan tambahan yang tidak terdapat di Project GPT.

Seluruh **65 ID dari Project GPT masih ditemukan dalam dokumen GitHub**, tetapi itu belum menjamin maknanya identik. Justru ada tabrakan identitas yang harus dibereskan.

## 1. Konflik paling serius, ID keputusan 5 November

| ID | Project GPT | GitHub | Hasil rekonsiliasi |
|--------|--------|--------|--------|
| D-20261105-01 | Sistem visual dikunci | Sistem visual dikunci | Sama |
| D-20261105-02 | HITL langsung berlaku dan pop-up | HITL langsung berlaku dan pop-up | Sama secara substansi |
| D-20261105-03 | Ringkasan level | Ukuran panel Tebakan Momo | **Tabrakan ID** |
| D-20261105-04 | Artwork Momo | Ringkasan level | **Tabrakan ID** |
| D-20261105-05 | Kontrol dan tombol Gambar lagi | Artwork Momo | **Tabrakan ID** |
| D-20261105-06 | Label prediksi simulasi | Kontrol dan tombol Gambar lagi | **Tabrakan ID** |
| D-20261105-07 | Tidak ada | Label prediksi simulasi | Ada di GitHub |

**Pilihan gw adalah mempertahankan penomoran GitHub sebagai identitas kanonis**, lalu menyimpan pemetaan ID lama Project GPT sebagai riwayat. Jangan membuat dua keputusan aktif berbeda dengan ID yang sama.

Ukuran panel Tebakan Momo juga harus dipertahankan. Itu keputusan terpisah di GitHub, bukan alasan untuk menghapus rincian yang ada di Project GPT.

## 2. Konflik keputusan produk dan verdict

| Topik | Konflik yang ditemukan | Pilihan gw dan alasannya |
|--------|--------|--------|
| **Card 1** | D-20261110-06 menyebut cubit untuk menyeret Thinman. Kode terbaru memakai arah telunjuk. | **Telunjuk menjadi keputusan aktif.** Lu sudah menegaskan bahwa ini yang lu setujui. Pernyataan terbaru lu mengalahkan aturan lama. |
| **Card 3** | D-20261110-07 menyebut telapak untuk Redo. Kode sekarang menggunakan lima jari Hapus, satu jari Undo, dua jari Redo. | Gunakan mapping kode sebagai **acuan prototype saat ini**\. Konflik persetujuan mapping tetap dicatat, bukan dihapus atau dianggap otomatis teruji. |
| **Memulai prediksi** | D-20261105-24 memuat ide Momo menebak sambil menggambar. D-20261110-02 mengharuskan jempol selesai. | **Jempol selesai berlaku.** Keputusan 10 November lebih baru dan tercatat telah disetujui 11 November. |
| **Membangunkan Momo** | D-20261105-19 menggunakan kamera menyala. D-20261110-04 menggunakan lambaian. | **Lambaian berlaku.** Kamera menyala otomatis hanya mekanisme sementara ketika NUI belum tersedia. |
| **Masuk ke dunia** | D-20261105-02 masih menyebut pop-up Masukkan ke dunia. D-20261110-08 menetapkan stiker dan Lempar. | **Stiker dan Lempar berlaku.** Simpan pop-up lama sebagai riwayat keputusan yang direvisi. |
| **Penutup Level 3** | D-20261105-15 masih berstatus RISET, sementara D-20261110-10 telah menetapkan portal dan rekap netral. | **Portal dan rekap netral aktif.** Detail lama Opsi A+B yang tidak tercakup keputusan baru tetap menjadi riwayat riset, bukan fitur wajib. |
| **Ikon gestur** | D-20261105-24 merujuk aset Figma. D-20261115-01 menetapkan gambar tangan buatan sendiri. | **Artwork SVG baru berlaku** untuk komponen yang telah direvisi. Aset lama tidak dihapus. |

### Koreksi khusus Card 1

(Keputusan terkonfirmasi) **Card 1 menggunakan arah telunjuk.**

Ini bukan usulan baru yang menunggu persetujuan.

Gw juga memeriksa `TutorialBrochure.tsx`, `tutorial-walk.ts`, dan `gesture-mode.ts`\. Source saat ini memang memakai `steerFromAngle(hand.angle)` dan menjalankan gerakan berdasarkan arah telunjuk.

Artinya rekonsiliasi yang tepat adalah merevisi bagian Card 1 pada D-20261110-06, mempertahankan bagian lain dari keputusan tiga kartu, serta mengoreksi D-20261115-02 agar **Card 1 tidak lagi dicatat sebagai konflik belum dikunci**\.

Keputusan gameplay Thinman pada D-20261110-09 mendukung pendekatan sudut telunjuk, tetapi persetujuan Card 1 gw dasarkan pada penegasan langsung lu, bukan menyamakan tutorial dengan gameplay secara otomatis.

## 3. Masalah tambahan dalam struktur GitHub

Ada tiga masalah dokumentasi yang juga perlu dibereskan ketika membuat salinan rekonsiliasi.

**Pertama, keputusan lama masih sering berlabel Aktif meskipun sebagian isinya sudah direvisi.** Contohnya pop-up Masukkan ke dunia, kamera menyala membangunkan Momo, dan prediksi saat menggambar. Riwayatnya tidak perlu dihapus, tetapi harus diberi penanda bagian yang sudah digantikan supaya AI baru tidak mengambil keputusan lama sebagai aturan sekarang.

**Kedua, beberapa entri sebenarnya bukan keputusan produk PA.** D-20261105-08 membahas modularisasi, D-20261105-09 membahas branch dan push, sedangkan D-20261105-10 membahas tata kelola dokumentasi. Itu lebih tepat sebagai mandat kerja atau sejarah teknis. ID lama boleh tetap ada untuk penelusuran, tetapi tidak perlu menjadi bagian keputusan produk aktif.

**Ketiga, struktur GitHub masih mencampur keputusan aktif, perubahan teknis, dan Lampiran historis Project GPT.** Riwayat 1 sampai 14 sudah diimpor, sedangkan Section 15 dari Project GPT muncul sebagian dalam entri November GitHub dengan penomoran berbeda. Menggabungkannya secara mentah justru berisiko menggandakan atau salah menautkan keputusan.

## 4. Hasil rekonsiliasi untuk Project GPT

| Bagian | Perlakuan yang gw tetapkan |
|--------|--------|
| Keputusan Aktif | Mengikuti keputusan GitHub yang masih berlaku, ditambah klarifikasi terbaru lu tentang Card 1. |
| Entri D-20261110 | Dipertahankan dengan koreksi bagian yang sudah digantikan oleh instruksi terbaru. |
| Entri D-20261115 | Artwork gestur aktif. Konflik Card 1 ditutup berdasarkan persetujuan lu; bagian Card 3 tetap dibedakan antara source dan keputusan formal. |
| Section 15 Project GPT | Konten dipertahankan, tetapi ID lama dipetakan ke identitas GitHub tanpa membuat keputusan ganda. |
| Section 1 sampai 14 | Dipertahankan sebagai sejarah lengkap, termasuk usulan, penolakan, dan informasi yang belum dikunci. |
| Tool, branch, commit, instalasi, deploy | Tidak dijadikan keputusan PA baru. Rujuk WORKING\_STATE dan dokumen teknis. |

**Satu prinsip yang perlu gw luruskan.** GitHub memang acuan terbaru untuk kode dan implementasi yang Ujang kerjakan. Tetapi keberadaan kode bukan bukti semua gestur sudah lolos pengujian, dan bukan otomatis persetujuan akademik untuk setiap detail desain. Pemisahan itu tetap harus dijaga dalam `DECISIONS.md`\.

Untuk sesi biasa, gw juga mengikuti batas yang lu tetapkan. Membaca `contexts/can/AGENTS.md` secara khusus wajib ketika melakukan implementasi langsung ke repo. Audit dan diskusi tidak perlu diperlakukan seperti sesi deployment.

## Status audit

- **GitHub** tetap pada commit `24e17c4`\. Tidak ada file, commit, branch, atau PR yang gw ubah dalam audit ini.
- **Project GPT** belum diubah. Laporan ini adalah hasil rekonsiliasi untuk menentukan isi salinan pengganti, bukan klaim bahwa file Project Sources sudah tersinkronisasi.
- **Card 1 telunjuk** tidak perlu dimintakan ACC lagi.
- **Riwayat lama** harus tetap ada, tetapi keputusan yang sudah digantikan tidak boleh tampil seolah-olah masih berlaku bersamaan.

**Kesimpulan auditnya adalah memakai GitHub sebagai kerangka utama, membawa seluruh informasi unik dari Project GPT, memperbaiki ID yang bertabrakan, dan menggunakan persetujuan terbaru lu sebagai penentu ketika dokumentasi lama berbeda.**

---

---
