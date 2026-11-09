# Opsi Penutup Permainan Setelah Level 3

Status: **RISET**. Bahan diskusi dengan dosen pembimbing; belum ada keputusan dan belum ada perubahan pada aplikasi.
Disusun: 2026-11-05. Pemilik keputusan: CAN (Owner). Kandidat keputusan terkait ada di bagian 7.

## 1. Kondisi saat ini

Setelah siswa menyelesaikan Level 3, Momo mengucapkan selamat di dalam dunia permainan, kemudian aplikasi kembali ke halaman pilih level dengan tulisan "Semua bab selesai". Belum ada penutup cerita maupun refleksi akhir.

Ada satu janji naratif yang belum dituntaskan. Pada awal setiap level, Momo menyampaikan bahwa Thinman harus mencapai tujuan "supaya dia bisa jalan sendiri tanpa bantuanmu". Penutup permainan perlu membayar janji tersebut.

Hierarki pengalaman yang berlaku (DECISIONS.md, Keputusan Aktif): **Interaksi → Gameplay/Storyline → Edukasi**. Edukasi hadir lewat pengalaman, bukan ceramah.

## 2. Ringkasan tiga opsi

| | Opsi A: Thinman berjalan sendiri | Opsi B: Catatan keputusanmu | Opsi C: Halaman bebas (sandbox) |
|---|---|---|---|
| Fokus | Penutup cerita | Refleksi literasi AI | Bermain bebas |
| Inti tampilan | Semua benda gambaran siswa menjadi satu jalan; Thinman berjalan tanpa input | Tiga halaman kecil: gambar, tebakan Momo, keputusan siswa | Kanvas tanpa misi; Momo tetap menebak |
| Kekuatan utama | Emosional; gambar siswa menjadi pusat | Paling kuat untuk tujuan pembelajaran | Paling menyenangkan dan mengulang loop HITL |
| Risiko utama | Pengulangan permainan perlu aturan benda yang jelas | Mudah berubah menjadi layar penuh teks | Konten gambar tidak pantas; keterbatasan MOCK paling terlihat |
| Perkiraan pekerjaan | Sedang | Sedang | Paling besar |

## 3. Opsi A: Thinman berjalan sendiri

**Alur.** Level 3 selesai → Momo: "Lihat, Thinman sekarang bisa jalan sendiri." → kamera turun ke satu halaman terakhir. Ketiga benda yang digambar siswa (satu dari setiap level) tersusun menjadi satu jalur. Thinman berjalan sendiri sampai bendera akhir tanpa input siswa → Momo menutup: "Semua benda ini kamu yang gambar. Aku cuma menebak, kamu yang memutuskan." → satu tombol jempol "Selesai" kembali ke pilih level dengan ketiga pita tercentang.

**Kelebihan**
- Menuntaskan janji naratif secara langsung dan mudah dipahami siswa SMP.
- Gambar siswa sendiri menjadi bintang penutup; memperkuat lore bahwa siswa adalah Illustrator dan pencipta objek.
- Pesan HITL ("kamu yang memutuskan") tersampaikan lewat peristiwa, bukan teks panjang.
- Memakai pola yang sudah ada (kamera bergerak seperti pada intro), sehingga tetap konsisten secara visual.

**Kekurangan**
- Bersifat tontonan pasif; tidak ada keputusan baru dari siswa.
- Jika siswa mengulang level, perlu aturan benda mana yang ditampilkan (misalnya benda terakhir yang berhasil).
- Tidak menampilkan secara eksplisit bagaimana siswa menilai tebakan AI.

## 4. Opsi B: Catatan keputusanmu

**Alur.** Level 3 selesai → muncul "buku catatan" berisi tiga halaman kecil (satu per level): gambar siswa, tiga tebakan Momo, dan keputusan siswa (Terima / Pilih lain / Bukan semua) dengan ikon yang sama seperti di dalam permainan → Momo menyampaikan satu kalimat sesuai pola keputusan, misalnya "Kamu dua kali tidak langsung percaya tebakan pertamaku. Itu kebiasaan bagus." → tombol jempol kembali ke pilih level.

**Kelebihan**
- Paling selaras dengan tujuan pembelajaran: siswa melihat bukti bahwa mereka menilai dan memvalidasi keluaran AI, bukan menerimanya mentah-mentah.
- Data yang dibutuhkan sudah ada di alur aplikasi (keputusan dan tebakan per level).
- Dapat menjadi bahan diskusi guru di kelas.

**Kekurangan**
- Berisiko menjadi layar teks atau "rapor", bertentangan dengan arahan agar siswa tidak banyak membaca.
- Kalimat refleksi Momo harus hati-hati agar tidak terkesan menilai benar atau salah; Momo tidak boleh memutuskan.
- Batas cakupan: refleksi ini hanya tampilan di sisi antarmuka. Analisis pola, penyimpanan data, dan dashboard tetap cakupan partner. Tampilan tidak boleh terlihat seperti skor atau penilaian resmi.

## 5. Opsi C: Halaman bebas (sandbox)

**Alur.** Level 3 selesai → Momo: "Sekarang dunia ini milikmu." → satu halaman tanpa misi. Siswa boleh menggambar apa saja; Momo tetap menebak tiga kemungkinan; siswa memutuskan; benda jatuh ke dunia. Tidak ada menang atau kalah. Tombol jempol "Selesai" tersedia kapan saja.

**Kelebihan**
- Paling terasa sebagai permainan dan memberi alasan untuk bermain lebih lama.
- Mengulang loop HITL (gambar → tebakan → keputusan → konsekuensi) tanpa tekanan misi.
- Memberi ruang kreativitas, selaras dengan tema sketchbook.

**Kekurangan**
- **Risiko konten gambar tidak pantas** (dibahas khusus di bagian 6).
- Keterbatasan prediksi MOCK paling terlihat: gambar di luar daftar benda akan menghasilkan tebakan yang terasa asal. Opsi ini baru masuk akal setelah model asli dari partner tersedia.
- Pekerjaan paling besar: halaman baru, aturan benda bebas, batas jumlah benda, dan cara keluar yang jelas.
- Tidak memiliki penutup cerita jika berdiri sendiri.

## 6. Kajian risiko gambar tidak pantas (khusus Opsi C)

### 6.1 Temuan riset

1. **Fenomena ini universal, bukan khas Indonesia.** Permainan "Quick, Draw!" dari Google mengumpulkan sekitar 50 juta gambar dari seluruh dunia. Dokumentasinya menyatakan setiap gambar dimoderasi, tetapi masih mungkin memuat konten tidak pantas. Studio Moniker bahkan membuat proyek "Do Not Draw a Penis" sebagai respons terhadap celah moderasi itu, dan mengumpulkan lebih dari sepuluh ribu gambar penis dari pengguna. Proyek tersebut juga menunjukkan bahwa pengklasifikasi khusus untuk mendeteksi gambar seperti itu dapat dilatih.
2. **Penelitian di Indonesia membahas vandalisme, bukan gambar asusila secara khusus.** Studi pada siswa SMP (misalnya di Sampang dan Pontianak) mencatat coretan di meja, dinding, dan toilet berupa identitas, nama kelompok, coretan tak beraturan, dan tokoh kartun, dengan faktor seperti impulsivitas dan rendahnya rasa memiliki fasilitas. Tidak ditemukan penelitian yang menunjukkan siswa Indonesia lebih sering menggambar konten asusila dibandingkan remaja di negara lain. **Kekhawatiran ini valid sebagai perilaku remaja pada umumnya, tetapi tidak didukung bukti sebagai sifat khas orang Indonesia.**
3. **Penjelasan psikologisnya belum kuat secara empiris.** Yang tersedia sebagian besar komentar populer: humor transgresif (melanggar aturan untuk mengejutkan), dinamika teman sebaya, dan teori psikoanalisis. Penelitian kualitatif tentang remaja di Inggris menyinggung budaya candaan kelompok terkait gambar alat kelamin. Belum ada studi yang menguji secara langsung alasan remaja menggambar doodle seperti ini.
4. **Penonton memperbesar perilaku.** Pada permainan menggambar beramai-ramai, moderasi yang lemah (contoh: skribbl.io) dikeluhkan pengulas, sedangkan permainan yang dirancang untuk keluarga (Drawful 2) menyediakan peran moderator dan filter. Prinsip pengelolaan kelas yang sering dipakai adalah *planned ignoring*: perilaku mencari perhatian yang ringan cenderung menurun jika tidak mendapat respons yang diinginkan, terutama jika dipasangkan dengan penguatan untuk perilaku pengganti. Bukti untuk remaja secara khusus masih tipis, jadi ini dipakai sebagai prinsip desain, bukan klaim efektivitas.

### 6.2 Implikasi desain

- Tidak ada filter garis yang bisa mencegah 100%. Setiap garis bebas, sehingga bentuk apa pun tetap bisa digambar. Pertanyaannya adalah **apa yang terjadi setelah digambar**.
- Pada sistem ini label benda selalu dipilih dari daftar kosakata level. Gambar tidak pantas tetap akan "menjadi" balok, papan, atau tangga. Namun **goresan asli siswa dirender sebagai tampilan benda di dunia**. Di situlah paparan sebenarnya, terutama jika layar dilihat teman sekelas.
- Pemicu utama perilaku ini adalah reaksi penonton dan reaksi sistem. Respons yang heboh (misalnya Momo kaget, atau peringatan merah) justru menjadi hadiah.

### 6.3 Pengaman yang dapat diusulkan jika Opsi C dipakai

1. **Bebas tetapi bertema.** Momo memberi tema ringan per giliran ("gambar sesuatu yang bisa terbang"), bukan kanvas kosong tanpa arah. Ini mengurangi ruang iseng tanpa membuat terasa dilarang.
2. **Respons datar, bukan dramatis.** Jika tebakan tidak cocok, Momo cukup bilang "Hmm, aku belum kenal benda ini." Tidak ada animasi khusus, dan tidak ada efek yang bisa dijadikan tontonan.
3. **Tidak ada galeri, tidak ada berbagi, tidak ada penyimpanan.** Gambar di halaman bebas hilang saat keluar. Ini menghilangkan motif "pamer" dan selaras dengan kebijakan bahwa event tidak menyimpan goresan.
4. **Tampilan benda boleh digambar ulang oleh sistem.** Di halaman bebas, benda di dunia dapat memakai ikon label (balok, papan) alih-alih goresan asli. Ini mengurangi paparan, dengan konsekuensi berkurangnya rasa "gambarku jadi benda".
5. **Batas waktu dan jumlah benda**, lalu penutup otomatis.
6. **Kendali guru.** Halaman bebas dapat dibuat sebagai fitur yang bisa dimatikan guru, atau hanya muncul setelah penutup.
7. **Deteksi konten tidak pantas oleh model** adalah cakupan partner (model klasifikasi). Kontrak data dapat menambahkan kelas "tidak dikenali/ditolak". Pihak penulis tidak boleh mengarang model atau hasil deteksi.

## 7. Saran

1. **Rekomendasi utama: gabungan Opsi A dan Opsi B, dengan B dibuat ringan.** Ini juga sejalan dengan preferensi Owner.
   - Urutannya: Thinman berjalan sendiri di atas tiga benda gambaran siswa (A). Di atas setiap benda muncul ikon keputusan siswa (Terima / Pilih lain / Bukan semua) beserta tebakan pertama Momo (B), tanpa tabel atau paragraf. Penutupnya satu kalimat Momo yang menyimpulkan pola keputusan siswa.
   - Alasannya: cerita tuntas, gambar siswa menjadi pusat, pesan literasi AI tersampaikan lewat pengalaman, dan teks tetap sedikit.
   - **Detail yang dikaji (gabungan A + B):** layar penutup menampilkan objek-objek hasil pilihan siswa. Untuk tiap level: goresan asli siswa, label akhir yang dipilih, dan **kategori perilaku** (Solid = bisa dipijak, Danger = berbahaya) sesuai konteks level, ditambah ikon keputusan (Terima / Pilih lain / Bukan semua) dan tebakan pertama Momo. Thinman berjalan di atas objek-objek itu, lalu satu kalimat Momo menutup. Data ini sudah ada di alur aplikasi (label akhir, perilaku, keputusan); belum ada yang dibangun.
2. **Tidak disarankan memasang A, B, dan C sekaligus.** Tiga lapis penutup berturut-turut terlalu panjang untuk siswa SMP dan membuat penutup kehilangan fokus.
3. **Opsi C ditunda.** Opsi ini baru layak diuji setelah model partner tersedia dan pengaman pada bagian 6.3 disetujui. Jika tetap ingin dicoba, sebaiknya dalam bentuk "mode bebas bertema" yang bisa dimatikan guru, bukan kanvas kosong.
4. **Penutup penuh hanya pada kemenangan pertama.** Pada permainan ulang, tampilkan versi singkat agar tidak membosankan.

## 8. Pertanyaan untuk dosen pembimbing

1. Apakah penutup cerita (A) dan refleksi keputusan (B) sudah cukup untuk menunjukkan capaian literasi AI di prototype?
2. Apakah refleksi Momo boleh menyimpulkan pola keputusan siswa, atau sebaiknya hanya menampilkan tanpa komentar?
3. Apakah mode bebas (C) perlu ada untuk PA ini, atau cukup dicatat sebagai pengembangan lanjutan?
4. Jika C dipakai di kelas, apakah perlu persetujuan sekolah atau guru terkait risiko konten?

## 9. Kandidat perubahan keputusan

> ⚠️ **Kandidat perubahan keputusan terdeteksi**
> - **Ringkasan:** Menetapkan penutup permainan setelah Level 3. Usulan: gabungan A dan B (Thinman berjalan sendiri di atas benda gambaran siswa dengan ikon keputusan), C ditunda dengan pengaman.
> - **Entri lama yang mungkin terdampak:** butir "Level" di `DECISIONS.md` (detail skrip level belum dikunci), Lore Momo (Momo hanya menebak dan mendorong, tidak memutuskan), dan butir terbuka "akhir permainan setelah L3" di `NOW.md`.
> - **Status:** RISET. Preferensi Owner (A digabung B) adalah bahan kajian, bukan keputusan; menunggu diskusi dengan dosen.
> - **Tindakan:** `DECISIONS.md` perlu ditinjau setelah diskusi. Ketik `AUDIT SEKARANG` untuk Patch Keputusan Usulan.

## 10. Sumber

- [Quick, Draw! dataset (README, catatan moderasi)](https://github.com/googlecreativelab/quickdraw-dataset) dan ringkasan [V7 Labs](https://www.v7labs.com/open-datasets/quick-draw-dataset)
- [Studio Moniker: Do Not Draw a Penis](https://studiomoniker.com/projects/do-not-draw-a-penis); [Creative Bloq](https://www.creativebloq.com/news/do-not-draw-a-penis); [Fast Company](https://www.fastcompany.com/90377628/the-world-needs-more-penis-drawings-really); [PC Gamer](https://www.pcgamer.com/someone-taught-an-ai-to-draw-dicks-after-feeding-it-25000-doodles-of-penises)
- [Studi perilaku vandalisme siswa SMP se-Kecamatan Sampang (Jurnal BK Unesa)](https://ejournal.unesa.ac.id/index.php/jurnal-bk-unesa/article/view/17889)
- [Kajian vandalisme siswa (e-journal UPR)](https://e-journal.upr.ac.id/index.php/JP-IPS/article/download/15099/6203)
- [Penelitian kualitatif remaja Inggris tentang gambar dan budaya candaan (Springer, Sex Roles 2021)](https://link.springer.com/10.1007/s11199-021-01236-3)
- [HuffPost: mengapa gambar anak sering terlihat seperti alat kelamin](https://huffingtonpost.co.uk/entry/kids-funny-drawings-penises_uk_5cc97271e4b0d123954c9aa9); [Vice: penjelasan psikoanalisis](https://www.vice.com/en/article/a-psychoanalyst-explains-why-men-draw-dicks-on-everything) (komentar populer, bukan penelitian)
- [Ulasan moderasi skribbl.io (Mechanics of Magic)](https://mechanicsofmagic.com/2021/04/19/critical-play-bluffing-judging-and-getting-vulnerable-skribbl-io/); [Jackbox Drawful 2 (peran moderator)](https://www.jackboxgames.com/drawful-2)
- [Illinois State Board of Education: Planned Ignoring](https://www.isbe.net/Documents/plannedignoring.pdf)
