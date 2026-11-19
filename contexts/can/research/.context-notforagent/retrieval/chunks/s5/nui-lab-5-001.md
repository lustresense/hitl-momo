# NUI Lab 5 | pesan 1-13

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afd086e-fa98-83ec-9e5c-9ab57e130980
> Source Git blob: ac091ca4786657adbcb787ba32a6fb0900ae5086

## L5-M001 | User | 2026-11-18 09:07:44


message time: 2026-11-18 09:07:44

baca ini dulu, lu chat ke 5, jadi gw mau lanjutin yang terakhir ya dari situ. bisa ga? '[https://github.com/lustresense/hitl-momo/tree/main/contexts/can/research/.context-notforagent](https://github.com/lustresense/hitl-momo/tree/main/contexts/can/research/.context-notforagent)'

---

---

## L5-M002 | Assistant | waktu tidak ada


Bisa. Gw cek isi folder `.context-notforagent` lewat GitHub, lalu cocokkan dengan konteks keputusan dan state proyek yang ada. Setelah itu gw tentukan titik terakhir yang bisa kita lanjutkan tanpa mengarang progres.

---

---

## L5-M003 | Assistant | waktu tidak ada


**Bisa. Gw sudah berhasil mengakses dan membaca keempat arsip percakapan NUI Lab dari GitHub. Kita bisa lanjut sebagai chat ke-5 tanpa mengulang pembahasan dari nol.**

Folder yang lu kasih memang berisi empat riwayat percakapan.

1. **NUI Lab** berisi riset alternatif MediaPipe, low-light, gesture tracking, dan eksperimen awal.
2. **Cabang NUI Lab** melanjutkan pembahasan hand lock, auto-recovery, dataset, dan classifier.
3. **Cabang Cabang NUI Lab** mencakup audit implementasi, koreksi `0.22.1-alpha`, draft PR \#5, dan rekonsiliasi dokumen proyek.
4. **NUI Lab 4** melanjutkan pengelolaan branch, workflow R&amp;D, dan rancangan dokumentasi untuk agent terminal.

## Titik terakhir yang akan kita lanjutkan

Dari arsip keempat, instruksi terbaru lu adalah menyiapkan arsitektur branch `rnd` khusus R&amp;D dengan ketentuan berikut.

- Branch `rnd` independen dari `main`\.
- Hanya satu `AGENTS.md` dan satu `README.md`, keduanya di root.
- `docs/plan-rev/` menampung rencana revisi dengan status `[WIP]` dan `[DONE]`\.
- `docs/attachments/` menampung konteks dan lampiran.
- Folder `r18/`, `r19/`, dan seterusnya dikelola agent terminal berdasarkan pekerjaan sebenarnya, bukan dibuat kosong oleh ChatGPT.
- Agent terminal bertanggung jawab atas eksperimen, dokumentasi progres, dan publikasi sesuai aturan.

**Status terakhir dalam arsip** menunjukkan rancangan `AGENTS.md`, `README.md`, dan ZIP sudah diberikan, tetapi branch `rnd` belum dibuat atau di-push. Itu status berdasarkan arsip, bukan hasil audit runtime GitHub terbaru.

Sumber terakhir yang gw baca ada di [Arsip NUI Lab 4](https://github.com/lustresense/hitl-momo/blob/main/contexts/can/research/.context-notforagent/ChatGPT_NUI-Lab-4_20261118-0902/ChatGPT_NUI-Lab-4_20261118-0902.md)\.

Gw juga sudah punya baseline `SOUL.md`, `DECISIONS.md`, dan `WORKING_STATE.md` dari Project Sources. Kalau nanti status repo terbaru bertentangan dengan arsip, kita pakai bukti terbaru untuk kondisi teknis.

**Jadi, gas. Chat ini resmi kita perlakukan sebagai kelanjutan NUI Lab 5.** Lu tinggal lanjut dari instruksi terakhir tanpa perlu menjelaskan ulang sejarah empat chat sebelumnya.

### Saran update WORKING\_STATE

- **Yang berubah\:** Arsip empat percakapan NUI Lab berhasil diakses sebagai konteks lanjutan chat ke-5.
- **Bagian terdampak\:** Kontinuitas R&amp;D NUI Lab dan workflow branch `rnd`\.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L5-M004 | User | 2026-11-18 09:10:06


message time: 2026-11-18 09:10:06

Jadi ini respon lu terakhir. Berarti keputusan gue buat bikin branch baru itu kayaknya enggak deh, tetap jadiin satu aja di situ. Tapi berarti harus benahin Agents MD lagi. Pokoknya Agents MD dikasih strict. Kalau misal kamu bukan ChatGPT Web, jangan akses ini. Atau pokoknya yang bukan gue suruh. Gimana ya enaknya? Gue bingung deh. Ini kan misalnya bikin branch baru kan. Tapi kayak gimana menurut lu setelah lu baca semua konteks satu sampai... oh udah lu baca semua kan tempatnya.

---

---

## L5-M005 | Assistant | waktu tidak ada


Gw condong ke satu repo dengan R&amp;D tetap terpisah dari kode produk, bukan bikin orphan branch yang berdiri sendiri. Tapi gw mau cek dulu aturan repo dan riwayat keputusan lu, karena `AGENTS.md` bisa membatasi perilaku agent, bukan benar-benar mencegah akses.

---

---

## L5-M006 | User | 2026-11-18 09:14:14


message time: 2026-11-18 09:14:14

apa gini, tetep branch sendiri tapi nanti kalo udah ya merge ke situ ke reseaarch itu. gimana? jadi tetep di dalem research main itu dikaish readme yang bener dll, branch baru tetep ada namanya research-can gitu lah. gimana?

---

---

## L5-M007 | Assistant | waktu tidak ada


**Gw rekomendasikan tetap satu repository `hitl-momo`, tanpa membuat branch permanen `rnd`\.** R&amp;D MediaPipe dan NUI Lab tetap dipisahkan secara struktur folder dan aturan akses, bukan dipisahkan menjadi repository atau histori Git yang baru.

Setelah mencocokkan arsip NUI Lab dengan kondisi GitHub, menurut gw ini lebih masuk akal untuk workflow lu dan Ujang.

Ada satu hal penting yang perlu gw luruskan. Gw sudah mengakses keempat arsip percakapan dan menelusuri bagian relevannya, tapi belum membaca setiap baris dari keempat arsip secara manual. Jadi gw nggak akan mengklaim semua detailnya sudah diaudit sempurna.

## Kenapa gw nggak merekomendasikan branch `rnd` permanen?

| Pilihan | Penilaian gw |
|--------|--------|
| Branch `rnd` permanen dan orphan | Isolasi kuat, tapi dokumentasi, eksperimen, dan integrasi hasil ke produk jadi lebih merepotkan |
| Semua R&amp;D langsung bercampur dengan kode produk | Sederhana, tapi risiko agent mengubah kode game sebelum eksperimen terbukti meningkat |
| **Satu repo, folder R&amp;D terpisah, branch sementara untuk perubahan berisiko** | **Paling sesuai** dengan kebutuhan kontinuitas, eksperimen, dan kontrol perubahan lu |

Ini juga sejalan dengan kondisi repo sekarang. `main` sudah memuat NUI Lab, sementara `AGENTS.md` root punya sistem routing untuk pekerjaan CAN, Dias, dan integrasi bersama. Membuat struktur baru yang menduplikasi aturan itu justru berisiko menimbulkan konflik.

## Masalah sebenarnya ada pada akses agent

Gw cek [AGENTS.md root yang sekarang](https://github.com/lustresense/hitl-momo/blob/main/AGENTS.md)\. Isinya memang dirancang sebagai entry point universal untuk Codex, Claude Code, Antigravity, Ujang, dan agent lainnya.

Sementara folder `.context-notforagent` yang lu kasih berisi ekspor empat chat NUI Lab dan berada di **repository publik**\. README di dalam folder tersebut bahkan masih hanya berisi `tes`\.

Ini penting karena **instruksi di `AGENTS.md` bukan sistem keamanan akses**\. Agent yang patuh bisa diperintahkan agar tidak membaca folder tertentu, tetapi agent yang mengabaikan instruksi atau sudah punya akses GitHub tetap bisa membacanya.

Jadi gw bedakan dua kebutuhan lu.

- **Pembatasan perilaku agent.** Bisa lewat aturan ketat `AGENTS.md`, default deny, dan izin eksplisit per tugas.
- **Kerahasiaan arsip ChatGPT.** Harus lewat pembatasan akses nyata. Kalau benar-benar hanya ChatGPT Web yang boleh membaca, arsip itu sebaiknya dipindahkan dari repo publik ke sumber privat yang aksesnya hanya lu berikan kepada ChatGPT.

Memindahkan arsip dari branch `main` saja tidak cukup untuk menyembunyikannya, karena salinan lama dapat tetap berada di histori Git.

**Nah, skema `research-can` ini justru lebih cocok. Gw setuju pakai satu repository, dua branch dengan fungsi berbeda.** R&amp;D dikerjakan secara terisolasi di `research-can`, lalu hasil yang sudah diverifikasi dipindahkan ke `contexts/can/research/` di `main` melalui Pull Request.

Tapi jangan merge seluruh hasil eksperimen secara membabi buta.

## Arsitektur yang gw sarankan

```svg
<svg viewBox="0 0 340 280" width="100%" xmlns="http://www.w3.org/2000/svg"><rect x="65" y="8" width="210" height="42" rx="9" fill="#64748b" fill-opacity=".15" stroke="#94a3b8" /><text x="170" y="25" text-anchor="middle" fill="currentColor" font-size="12" font-weight="700">hitl-momo</text><text x="170" y="39" text-anchor="middle" fill="currentColor" font-size="10">Satu repository GitHub</text><path d="M170 50 V69 H85 V85 M170 69 H255 V85" fill="none" stroke="#94a3b8" stroke-width="1.8" /><rect x="8" y="85" width="154" height="116" rx="9" fill="#0d9488" fill-opacity=".09" stroke="#0d9488" /><text x="85" y="106" text-anchor="middle" fill="currentColor" font-size="13" font-weight="700">main</text><text x="85" y="125" text-anchor="middle" fill="currentColor" font-size="10">Produk + dokumentasi</text><path d="M25 137 H145" stroke="#94a3b8" opacity=".4" /><text x="85" y="154" text-anchor="middle" fill="currentColor" font-size="10">contexts/can/research/</text><text x="85" y="170" text-anchor="middle" fill="currentColor" font-size="10">Riset terpilih</text><text x="85" y="184" text-anchor="middle" fill="currentColor" font-size="10">dan evidence</text><rect x="178" y="85" width="154" height="116" rx="9" fill="#64748b" fill-opacity=".10" stroke="#94a3b8" /><text x="255" y="106" text-anchor="middle" fill="currentColor" font-size="13" font-weight="700">research-can</text><text x="255" y="125" text-anchor="middle" fill="currentColor" font-size="10">Workspace R&amp;D</text><path d="M194 137 H315" stroke="#94a3b8" opacity=".4" /><text x="255" y="154" text-anchor="middle" fill="currentColor" font-size="10">Plan revisi</text><text x="255" y="170" text-anchor="middle" fill="currentColor" font-size="10">Eksperimen r18, r19 ...</text><text x="255" y="184" text-anchor="middle" fill="currentColor" font-size="10">Benchmark &amp; kandidat</text><path d="M255 201 V232 H85 V201" fill="none" stroke="#0d9488" stroke-width="2" stroke-dasharray="5 4" /><rect x="103" y="221" width="135" height="24" rx="12" fill="#0d9488" /><text x="170" y="237" text-anchor="middle" fill="#fff" font-size="11" font-weight="600">Review + PR terpilih</text><text x="170" y="269" text-anchor="middle" fill="currentColor" font-size="10">Implementasi produk melalui proses terpisah</text></svg>
```

Struktur dalam `contexts/can/research/` bisa dibuat konsisten pada kedua branch.

```text
contexts/can/research/
├── README.md
├── docs/
│   ├── plan-rev/
│   └── attachments/
├── r18/
├── r19/
├── evidence-map/
├── library/
├── notes/
└── .context-notforagent/
```

`r18`, `r19`, dan folder selanjutnya dibuat oleh agent terminal sesuai kebutuhan. Contoh struktur ini bukan instruksi membuat folder kosong. Folder yang sudah ada dipertahankan dan direkonsiliasi dahulu.

## Aturan `AGENTS.md` yang paling tepat

Gw sarankan **root `AGENTS.md` tetap universal**, lalu ditambah aturan khusus untuk R&amp;D. README research menjelaskan workflow dan navigasi. Jadi tidak perlu membuat banyak `AGENTS.md` baru yang saling menduplikasi.

Kontraknya harus ketat.

1. Agent hanya mengerjakan scope yang lu instruksikan.
2. Agent wajib memeriksa branch, status Git, dan otorisasi sebelum bekerja.
3. `research-can` hanya digunakan untuk pekerjaan R&amp;D CAN yang mendapat izin.
4. Agent tidak boleh mengubah source produk, backend Dias, atau kontrak bersama tanpa izin eksplisit.
5. Semua eksperimen wajib punya evidence, status dan laporan kegagalan.
6. Tidak boleh otomatis merge, deploy, atau menghapus branch.
7. `.context-notforagent/` dilarang dibaca oleh agent terminal biasa. Tapi untuk akses yang benar-benar privat, arsipnya harus diamankan di luar repo publik.

Status `[WIP]` dan `[DONE]` di nama dokumen `plan-rev` tetap dipertahankan sesuai instruksi lu.

## Satu aturan Git yang krusial

`research-can` sebaiknya **branch biasa dari `main`, bukan orphan branch**\.

Dengan begitu, perubahan riset bisa dikirim melalui PR ke `main` tanpa memindahkan ulang seluruh struktur secara manual. Namun PR tersebut harus menyeleksi file yang memang layak dipublikasikan. Dataset mentah, cache, artefak besar, dan kandidat yang belum lolos tidak otomatis ikut masuk.

Gw cek GitHub sekarang, **branch `research-can` belum ada**\. Folder `contexts/can/research/` sudah ada di `main`, sehingga kita punya titik integrasi yang jelas.

**Verdict gw**, pakai `research-can` sebagai branch kerja R&amp;D, dan `main` sebagai sumber resmi. Jangan jadikan `research-can` tempat menumpuk perubahan tanpa batas. Setiap batch yang selesai ditinjau, lalu hanya hasil relevan yang masuk PR.

### Saran update WORKING\_STATE

- **Yang berubah\:** Lu mengusulkan mengganti rancangan orphan branch `rnd` dengan branch kerja `research-can` dalam repo yang sama, memakai `contexts/can/research/` sebagai jalur integrasi ke `main`\.
- **Bagian terdampak\:** Workflow R&amp;D, struktur dokumentasi, aturan agent, dan proses PR.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L5-M008 | User | 2026-11-18 09:20:00


message time: 2026-11-18 09:20:00

kenapa ga orphan? kalo plek nanti repo gw kegedean jancok, kan enak tinggal nyuruh ai buat pindahin aja cok. PLS KASIH ALASAN YANG JELAS KONTOL OBJEKTIF TANPA BIAS TANPA YESMAN

---

---

## L5-M009 | Assistant | waktu tidak ada


**Lu punya alasan yang masuk akal buat memilih orphan branch. Gw keliru ketika sebelumnya langsung merekomendasikan branch biasa tanpa mempertimbangkan kebutuhan isolasi R&amp;D lu. Tapi ada satu asumsi teknis yang harus gw koreksi. Orphan branch tidak otomatis membuat ukuran repository GitHub lebih kecil.**

Justru untuk workflow lu, **gw sekarang lebih condong ke orphan branch `research-can`**, tetapi alasannya bukan penghematan ukuran total repository.

## 1. Perbandingan objektif

| Aspek | Branch biasa dari `main` | Orphan branch |
|--------|--------|--------|
| Mewarisi seluruh struktur file `main` | Ya, saat dibuat | Tidak |
| Menggandakan semua file secara fisik | Tidak, Git berbagi objek | Tidak |
| Histori R&amp;D terpisah dari `main` | Tidak sepenuhnya | Ya |
| Bisa berisi R&amp;D saja | Bisa, tapi perlu membersihkan snapshot awal | Bisa langsung |
| Mudah merge biasa ke `main` | Lebih mudah | Lebih sulit karena histori tidak berhubungan |
| Bisa memindahkan hasil terpilih ke `main` | Bisa | Bisa |
| Membuat ukuran total repo lebih kecil | Tidak otomatis | Tidak otomatis |
| Risiko mengikutkan perubahan eksperimen ketika merge | Ada | Bisa dihindari dengan transfer selektif |

**Poin terpentingnya adalah Git menyimpan objek, bukan salinan penuh file per branch.**

Misalnya `main` berisi 500 MB data Git dan lu membuat branch biasa dari `main`\. Itu tidak langsung menjadi 1 GB karena branch baru menunjuk ke objek yang sama.

Sebaliknya, kalau orphan branch lu menyimpan 2 GB model, dataset, dan hasil eksperimen, objek tersebut tetap tersimpan di repository GitHub yang sama. Walaupun tidak pernah di-merge ke `main`, ukuran repository tetap bertambah.

## 2. Kenapa kekhawatiran ukuran repo lu memang beralasan?

GitHub API sebelumnya melaporkan ukuran repo `hitl-momo` sekitar **1,04 GiB**\. Angka ini estimasi dari GitHub, bukan pengukuran langsung folder `.git` di VM.

GitHub sendiri merekomendasikan repository idealnya di bawah 1 GB dan sangat menganjurkan tetap di bawah 5 GB.  [GitHub Docs](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits?utm_source=chatgpt.com) [GitHub Docs](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github?platform=linux&ref=the-mergify-blog&utm_source=chatgpt.com)

Jadi kekhawatiran lu soal repository membengkak bukan asumsi kosong.

Tapi solusi penghematannya bukan memilih orphan saja. Solusinya adalah **mengendalikan apa yang boleh di-commit ke Git**\.

Contohnya, jika eksperimen R18 menghasilkan 5 GB data, hanya source, konfigurasi, laporan, metrik, dan kandidat kecil yang perlu masuk `research-can`\. Dataset mentah, checkpoint berulang, serta cache tetap di storage eksternal dengan manifest dan checksum.

## 3. Kenapa orphan cocok untuk lu?

Karena kebutuhan lu adalah menjadikan `research-can` sebagai **workspace eksperimen independen**, bukan salinan lingkungan game.

Git sendiri mendefinisikan orphan branch sebagai cabang yang memulai histori baru tanpa parent commit.  [git-checkout Documentation](https://git-scm.com/docs/git-checkout.html?utm_source=chatgpt.com)

Dengan begitu, agent terminal cukup bekerja pada R&amp;D MediaPipe tanpa membawa struktur Next.js, backend, gameplay, dan dokumentasi lain ke working tree-nya.

Lu juga memang tidak ingin setiap eksperimen masuk ke produk. Lu ingin AI menyeleksi hasilnya terlebih dahulu.

Nah, **orphan lebih masuk akal untuk alur itu**, asalkan lu menerima bahwa integrasinya melalui penyalinan selektif atau patch, bukan merge seluruh histori.

## 4. Arsitektur pilihan gw

**`research-can`** Orphan branch

R18, R19, dataset manifest, kode eksperimen, laporan benchmark, kandidat model.

AI menyeleksi, verifikasi, izin Owner

---

**`main`** Branch produk

`contexts/can/research/` menerima dokumentasi, hasil terpilih, dan evidence yang relevan. Integrasi model atau kode runtime dilakukan lewat review terpisah.

Aturan pentingnya, `research-can` juga tidak boleh menjadi gudang seluruh eksperimen mentah, karena tetap satu Git repository.

Kalau kebutuhan lu adalah **mengisolasi storage secara fisik**, barulah repository R&amp;D terpisah benar-benar lebih unggul daripada orphan branch dalam repo yang sama.

**Verdict gw berubah dari branch biasa ke orphan branch karena kebutuhan lu adalah pemisahan workspace dan promosi hasil secara selektif. Bukan karena orphan lebih hemat storage.**

Satu langkah konkret sekarang adalah menetapkan `research-can` sebagai orphan branch dengan aturan commit yang membatasi artefak besar, dan prosedur promosi selektif ke `main`\. Jangan buat atau push dulu sebelum aturan `AGENTS.md` dan README-nya disesuaikan dengan workflow tersebut.

---

---

## L5-M010 | User | 2026-11-18 09:30:39


message time: 2026-11-18 09:30:39

yaudah bikinin branchnya sama md2nya lengkap kea readme agent dll lah pokoknya aturan push apa ajanya gitu yang gimana2 gitu lah kea si agent harus lapor apa aja ke gw itu yang dipush jadi kea candidates atau apa itu di nui lab 4 chat gitu lah jancok lu modif hasil agent dan readme mereka dan langsung implement jancok bikin branch barunya gitu lah gw tinggal kasih info ke agy

---

---

## L5-M011 | Assistant | waktu tidak ada


Gw eksekusi branch orphan `research-can` sekarang, dengan `AGENTS.md`, `README.md`, aturan seleksi file, status rencana, dan format laporan wajib untuk Agy. Gw akan cek dulu isi dan aturan repo supaya branch baru ini tidak mengubah `main` atau menelan hasil eksperimen mentah tanpa seleksi.

Isi arsip NUI Lab 4 mengonfirmasi format yang lu minta. `docs/plan-rev/` dan `docs/attachments/` ada di root branch, satu `AGENTS.md` dan satu `README.md`, sedangkan `r18/`, `r19/`, dan seterusnya dibuat Agy berdasarkan artefak nyata. Gw juga sudah menguji bahwa GitHub bisa membuat commit tanpa parent, jadi branch ini bisa benar-benar orphan, bukan salinan `main`.

Branch `research-can` sudah berhasil dibuat di GitHub dan terverifikasi orphan. Commit awalnya tidak punya parent, jadi memang tidak membawa histori atau source `main`. Sekarang gw cek aturan akses folder research di `main` juga, karena lu sebelumnya minta README di sana dan pembatasan untuk arsip chat.

**Branch `research-can` sudah gw buat dan push ke GitHub sebagai orphan branch sungguhan.** `AGENTS.md`, `README.md`, `.gitignore`, serta struktur dokumentasinya sudah tersedia. `main` tetap tidak berubah.

**[research-can](https://github.com/lustresense/hitl-momo/tree/research-can)**

Orphan branch · histori terpisah dari main

(Created)

---

Commit terakhir 56f6812

Jumlah file 6

Produk main Tidak diubah

## Dokumen yang sudah tersedia

**[AGENTS.md](https://github.com/lustresense/hitl-momo/blob/research-can/AGENTS.md)**
Aturan ketat scope agent, larangan akses arsip chat, alur eksperimen, file yang boleh di-push, verifikasi, dan format laporan ke lu.

---

**[README.md](https://github.com/lustresense/hitl-momo/blob/research-can/README.md)**
Peta workspace, mapping dari VM, indeks R18 dan kandidat, status rencana, workflow Agy, serta prosedur promosi hasil riset ke `main`\.

---

**`.gitignore` dan `.gitattributes`**
Filter file sensitif, dataset mentah, database, cache, rekaman, checkpoint, dan artefak besar.

`docs/plan-rev/` dan `docs/attachments/` juga sudah dibuat. Belum ada `r18/` karena sesuai instruksi lu, Agy yang harus membuat dan mengorganisasi folder tersebut berdasarkan hasil lokal sebenarnya.

## Langsung kirim ini ke Agy

> **Chat message**
> 
> Lanjutkan pekerjaan R&D MediaPipe Optimize yang sudah ada.
> 
> Branch GitHub khusus R&D sudah disiapkan:
> 
> https://github.com/lustresense/hitl-momo/tree/research-can
> 
> **Wajib baca seluruh AGENTS.md dan README.md di branch tersebut sebelum bekerja.** Keduanya menjadi kontrak kerja untuk publikasi hasil R&D.
> 
> Instruksi pelaksanaan:
> 
> 1. Gunakan hanya branch `research-can`, yang merupakan orphan branch. Jangan mengubah `main`, branch lain, deployment, atau source eksperimen asli.
> 2. Inventarisasi dahulu seluruh isi `/srv/sketchbook/mediapipe-optimize/`, terutama `docs/plan-rev/` dan `r18-ux0-sandbox/`. Periksa hasil eksperimen R18 yang benar-benar tersedia.
> 3. Pindahkan secara selektif dokumen rencana ke `docs/plan-rev/` dan lampiran aman ke `docs/attachments/`. Pertahankan semua konten penting dan referensi aslinya.
> 4. Buat `r18/` berdasarkan artefak nyata. Organisasikan eksperimen, candidates, results, scripts, models, dan manifests sesuai kebutuhan. Jangan membuat folder revisi kosong atau README/AGENTS tambahan.
> 5. Publikasikan source kandidat, konfigurasi, script reproduksi, metrik JSON, laporan, hasil eksperimen yang gagal maupun berhasil, model card, checksum, serta manifest file yang disertakan dan dikecualikan.
> 6. Jangan upload seluruh sandbox secara mentah. Periksa ukuran, lisensi, data pribadi, secrets, dataset mentah, checkpoint besar, cache, dan database sebelum staging.
> 7. Terapkan aturan penamaan rencana `[WIP]` ketika sedang dikerjakan dan `[DONE]` hanya ketika deliverable rencana memiliki bukti yang sesuai. Dokumen tanpa prefix berarti belum dibahas.
> 8. Perbarui README root dengan indeks seluruh rencana, revisi, kandidat, hasil, evidence, blocker, dan commit relevan. Gunakan status pengujian yang benar, jangan mengklaim webcam PASS berdasarkan tes sintetis.
> 9. Commit dan push hasil terpilih hanya ke `research-can`. Pastikan remote SHA dan file yang dipublikasikan benar-benar cocok. Tidak boleh merge atau deploy.
> 10. Setelah selesai, laporkan seluruh hasil menggunakan format wajib di AGENTS.md. Sertakan URL GitHub, commit SHA, jumlah dan ukuran file, checksum, baseline, perbandingan kandidat, hasil pengujian, kegagalan, file yang dikecualikan beserta alasannya, dan next action.
> 
> Prioritaskan preservasi hasil R18 yang sudah dikerjakan. Jangan melakukan ulang eksperimen yang sudah memiliki bukti memadai hanya karena baru berpindah branch.
> 
> Jika ada konflik dengan struktur lokal atau perintah lama, utamakan instruksi ini dan kontrak branch `research-can`. Jangan melakukan operasi destruktif untuk menyelesaikan konflik.

Satu batas yang masih tersisa adalah **README di `contexts/can/research/` pada `main` belum gw ubah**\. Gw sengaja menjaga perubahan kali ini hanya di branch baru. Hasil R&amp;D juga belum diimpor atau diverifikasi dari VM Agy.

### Saran update WORKING\_STATE

- **Yang berubah\:** `research-can` dibuat sebagai orphan branch dengan dua dokumen aturan utama dan struktur dokumentasi R&amp;D.
- **Bagian terdampak\:** Workflow Agy, publikasi evidence, pengelolaan revisi, dan integrasi riset ke produk.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L5-M012 | User | 2026-11-18 09:58:35


message time: 2026-11-18 09:58:35

ini kata agy '
  Jika ada konflik dengan struktur lokal atau perintah lama, utamakan instruksi ini dan kontrak branch `research-can`.
  Jangan melakukan operasi destruktif untuk menyelesaikan konflik.

○ Thought for 2m 55s (I'm thinking through how to approach this.)
● Explored 3 files (get_file_contents.json, list_commits.json, get_commit.json)
● Ran (ls -la /srv/sketchbook/mediapipe-optimize/ /srv/sketchbook/mediapipe-optimize/docs/ /srv/sketchbook/mediapip...)
… 41 more actions (4 reads, 11 edits, 12 commands, 14 tools: 1 failed) …
● Ran (sha256sum /srv/sketchbook/mediapipe-optimize/research-can/r18/manifests/SHA256SUMS.txt /srv/sketchbook/media...)
● Explored 1 file (published_vs_excluded_manifest.json) (ctrl+o to expand)

  Publikasi terkurasi hasil R&D NUI R18 ke branch orphan research-can selesai dilakukan melalui clone terpisah
  research-can, sementara file sumber asli di /srv/sketchbook/mediapipe-optimize/docs/ dan /srv/sketchbook/mediapipe-
  optimize/r18-ux0-sandbox/, serta branch main, deployment, dan database tetap tidak tersentuh.' githubnya udah dipush tuh coba cek

---

---

## L5-M013 | Assistant | waktu tidak ada


Gw cek langsung remote `research-can`, bukan cuma percaya laporan Agy. Gw audit commit terbaru, file yang benar-benar ter-push, manifest dan checksum, serta pastikan `main` tidak ikut berubah.

**Push Agy ke `research-can` berhasil. Gw sudah cek langsung ke GitHub dan menemukan commit baru beserta seluruh struktur R&amp;D R18.**

**[research-can](https://github.com/lustresense/hitl-momo/tree/research-can)** (Push terverifikasi)

Commit Agy 664de03

Tanggal commit 18 November 2026

Isi branch 68 entri Git, 54 file

Branch `main` Tidak berubah dari pemeriksaan sebelumnya

Folder `r18/` sekarang berisi `candidates`, `experiments`, `results`, `scripts`, `models`, dan `manifests`\. Rencana R18 juga sudah masuk `docs/plan-rev/` dengan status `[WIP]`, bukan ditandai selesai tanpa pengujian.

Gw lanjut periksa isi laporan dan manifestnya supaya jelas apakah Agy hanya berhasil mempublikasikan file atau evidence risetnya juga cukup kuat.

## Hasil audit isi GitHub

**Publikasi dan struktur sesuai**
Ada 57 file dengan total sekitar 1,4 MB. Ini koreksi dari hitungan awal 54 file. Manifest mencatat 51 file riset terkurasi, dan seluruh path serta ukurannya cocok dengan file di remote.

**File besar berhasil dikecualikan**
Manifest mencatat 12 item, total sekitar 3,77 GB, termasuk dataset mentah, virtual environment, dan build. Status penyimpanan lokalnya masih berdasarkan laporan Agy.

**Dokumentasi dan checksum konsisten**
Ada 52 entri dalam `SHA256SUMS.txt`, yaitu 51 file riset dan manifest publikasi. Nilai hash yang dicantumkan konsisten antardokumen. Gw belum menghitung ulang seluruh hash dari byte file.

## Hasil R&amp;D yang berhasil dipublikasikan

Berdasarkan [R18 Master Report](https://github.com/lustresense/hitl-momo/blob/research-can/r18/results/R18_MASTER_REPORT.md) dan [Model Card UX3](https://github.com/lustresense/hitl-momo/blob/research-can/r18/models/MODEL_CARD.md) yang ditulis Agy.

| Eksperimen | Hasil yang dilaporkan |
|--------|--------|
| UX1 | Koreksi sudut, FSM kontrol, dan pengamanan aksi lolos pengujian offline yang ditentukan |
| UX2 | Deteksi pada subset DimLight naik dari 52,08% menjadi 64,58% |
| UX3 | Model MLP berukuran 123 KB, akurasi test 80,45%, Macro-F1 61,56% |
| UX4 | Dataset DimHand masih terhalang lisensi, akses, dan storage |
| UX5 | Simulasi browser 180 detik, 2.271 frame, sekitar 12,59 FPS pada CPU headless |

**Masih ada masalah nyata.** UX3 belum menghilangkan false swipe sepenuhnya, terdapat kasus false erase, dan browser mencatat 2.057 Long Tasks. Pengujian webcam fisik juga belum dilakukan. Jadi hasil ini belum cukup untuk menyatakan NUI sudah akurat dan nyaman digunakan siswa SMP.

Gw belum mereproduksi eksperimen tersebut sendiri. Angka di atas merupakan hasil yang dilaporkan Agy dalam artefak GitHub.

## Verdict

**Untuk tugas publikasi R18, Agy sudah menjalankan instruksi dengan benar berdasarkan bukti remote.** Pemilahan artefak, struktur file, status WIP, dokumentasi kandidat, dan pelaporan sudah tersedia.

Tapi pekerjaan R&amp;D sendiri **belum selesai**\. Jangan merge ke `main` dulu.

Langkah berikutnya adalah menguji kandidat UX3 dengan kamera fisik, terutama lima jari, tiga jari, pinch, low-light, distraksi benda, dan kontrol Thinman. Checklist-nya sudah tersedia di [Physical Webcam Test Protocol](https://github.com/lustresense/hitl-momo/blob/research-can/docs/attachments/OWNER_PHYSICAL_WEBCAM_TEST_PROTOCOL.md)\.

### Saran update WORKING\_STATE

- **Yang berubah\:** Publikasi R18 ke `research-can` terverifikasi pada commit `664de03`\. Artefak, manifest, kandidat, dan laporan tersedia. Webcam fisik belum diuji.
- **Bagian terdampak\:** Workflow R&amp;D Agy, hasil UX0 sampai UX5, dan blocker verifikasi kamera.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---
