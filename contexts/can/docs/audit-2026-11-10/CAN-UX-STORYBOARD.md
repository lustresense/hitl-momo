# CAN-UX-STORYBOARD — urutan scene, 2026-11-10

Sumber: brief Owner 10 November 2026 (big prompt bagian 6, 7, 16, 17). Hanya tiga level. Nama karakter memakai `character-tokens.ts` (Thinman, D-20261105-24); brief menulis "Tinman", dicatat sebagai delta untuk Owner.

Aturan umum: satu konfirmasi = satu event. Jempol adalah tanda "aku mengerti", tidak memotong ucapan Momo. Tidak ada auto-skip. Durasi animasi normal juga saat `prefers-reduced-motion` (amplitudo boleh dikurangi). Fallback mouse dan keyboard ada, tetapi baru ditampilkan saat kamera gagal.

| # | Scene | Aksi siswa / gestur | Momo dan kamera | Syarat keluar |
|---|---|---|---|---|
| 1 | Cover, kamera mati | Menyalakan kamera (tombol) | Momo tidur di kanan: mata tertutup, napas, Zzz mengambang, sayap turun pelan. Kartu kamera besar di tengah | Kamera aktif |
| 2 | Cover, kamera aktif | Melambaikan tangan | Momo masih tidur. Video hidup di tengah. Tidak ada teks "Lambaikan tanganmu". Petunjuk: ikon tangan halus. Setelah 8 detik tanpa lambaian: bantuan bertahap. Tanpa kamera: tombol "Bangunkan Momo" | Lambaian terdeteksi |
| 3 | Bangun | Tidak ada | Momo berkedip dua kali, melek, kaget dan mengepak. Kamera mengecil dan pindah ke pojok kiri atas (0,8 s, satu kali). Momo melayang ke tengah dan membesar (1,1 s), lalu dadah | Animasi selesai |
| 4 | Cerita cover | Membaca. Jempol 1 detik setelah baris terakhir | Bubble di samping Momo, tidak menutup wajah. "Aku Momo, gambar satu-satunya yang hidup di dunia Sketchbook Universe." "Aku barusan menemukan **Thinman**. Kayaknya dia butuh bantuanmu supaya bisa hidup juga sepertiku." "Yuk, antar dia ke tempat yang tepat." Cincin jempol baru muncul setelah baris terakhir selesai | Jempol |
| 5 | Buka buku | Tidak ada | Daun buku membuka ke atas 0,9 s. Layar berganti di titik tengah. Momo cover memudar 0,3 s | Animasi selesai |
| 6 | Penggaris, fokus Momo | Membaca | Hanya angka dan penggaris. Latar digelapkan. Momo besar di tengah: "Sebelum kita masuk, pilih nomor absenmu dulu, ya." Lalu Momo mengecil ke pojok kanan (0,6 s), latar terang | Baris selesai |
| 7 | Penggaris, pilih | Menggeser penggaris | Momo kecil di pojok kanan, tetap terlihat. Tidak ada pertanyaan sebelum siswa menggeser | Penggaris diam 0,6 s setelah digeser |
| 8 | Penggaris, konfirmasi | Jempol 2 detik, atau geser lagi untuk membetulkan | "Benar ini nomor absenmu, N?" Cincin jempol setelah kalimat selesai. Bila kelas belum terhubung, Momo mengatakannya dengan jujur | Jempol |
| 9 | Buka ke kartu | Tidak ada | Transisi buku 0,9 s. Kartu masuk bertumpuk, menyebar 1-2-3 (0,95 s) | Animasi selesai |
| 10 | Kartu 1 | Mencubit Thinman dan menyeretnya dari kiri ke bendera. Lepas = berhenti | Kartu membuka seperti buku (0,95 s). Momo menjelaskan. Thinman mengikuti tangan selama dicubit, berhenti di bendera. Setelah sampai: jeda baca 10 detik, lalu cincin jempol | Sampai bendera, 10 detik, jempol 1 detik. Kartu menutup 0,5 s |
| 11 | Kartu 2 | Membaca aman dan bahaya | Momo menjelaskan pijakan aman dan bahaya. Cincin jempol setelah 10 detik | 10 detik, jempol 1 detik |
| 12 | Kartu 3 | Cubit = coret. Kepal = hapus (ukuran tetap). Dua jari = mundur. Telapak = maju. Semua dicoba | Status per alat menyala hanya setelah aksi sungguhan. Setelah keempatnya: jeda baca 10 detik, lalu cincin jempol | Empat alat, 10 detik, jempol 2 detik |
| 13 | Pilih level | Menarik pita Bab 1 | Tiga pita. Pengguna baru: Momo mengarahkan ke Bab 1. Bab 2 dan 3 terkunci sesuai progres | Pita ditarik |
| 14 | Intro level | Membaca. Jempol setelah ucapan selesai | Momo bercerita dan menyarankan benda. Jempol tidak tersedia sebelum baris terakhir selesai. Setelah jempol: Momo terbang ke atas dengan animasi penuh, kamera mengikuti, lalu Momo diam | Jempol, animasi selesai |
| 15 | Menggambar | Cubit, kepal, dua jari, telapak | Momo di pojok kiri atas, diam. Tidak ada Top-3 | Jempol selesai 2 detik |
| 16 | Diam 10 detik | Tidak ada | Momo bertanya: "Sudah selesai gambarnya? Kalau sudah, acungkan jempol, ya." Tidak menebak otomatis | Kembali menggambar, atau jempol |
| 17 | Menebak | Menunggu | Momo tetap di pojok kiri atas, sedikit membesar. Status memuat. Galat ditampilkan jujur. `/predict` dipanggil satu kali | Respons |
| 18 | Top-3 | Melayang di pilihan, atau jempol untuk Terima | Terima, Pilih lain, Bukan semua. "Gambar lagi" sebagai pemulihan. Label asal tebakan jujur (demo atau model) | Keputusan |
| 19 | Masukkan ke dunia | Melayang atau jempol | Gambar asli siswa menjadi objek berlabel, tanpa kotak | Konfirmasi |
| 20 | Penempatan | Cubit tahan sampai cincin penuh = pegang. Gerak = pindah. Lepas = taruh. Lima jari terbuka lalu putar tangan = rotasi | Cincin di objek. Putus cubit di bawah 150 ms tidak menjatuhkan objek | Objek ditaruh |
| 21 | Bermain | Telunjuk di kiri atau kanan = jalan. Cubit = lompat | Panduan kontrol 6 detik | Sampai tujuan, atau gagal |
| 22 | Gagal | Melayang di "Gambar lagi", "Coba lagi", "Geser objek" | Momo menjelaskan sebabnya | Pilihan |
| 23 | Menang Bab N | Jempol 1 detik | Momo merayakan. Bab N+1 terbuka | Jempol |
| 24 | Portal, setelah Bab 3 | Tidak ada | Thinman masuk portal dan menjadi hidup. Momo bereaksi | Animasi selesai |
| 25 | Rekap | Membaca. Jempol | Benda yang digambar, tebakan pertama Momo, keputusan siswa, jumlah per jenis keputusan. Tanpa skor pintar atau tidak. Data kosong ditulis "tidak tercatat" | Jempol |
| 26 | Kuis atau survei, bila aktif | Mengikuti Momo | Hanya bila flag admin menyala. Bukan level. Bila mati, langsung ke akhir | Selesai |
| 27 | Akhir | Memilih kembali ke sampul | Tidak ada loop otomatis ke Bab 1 | Pilihan |

## Router gestur per state

| State | Cubit | Kepal | Dua jari | Telapak | Jempol | Lambaian |
|---|---|---|---|---|---|---|
| Cover | tidak aktif | tidak aktif | tidak aktif | tidak aktif | "aku mengerti" setelah dialog | bangunkan Momo |
| Dialog Momo | tidak aktif | tidak aktif | tidak aktif | tidak aktif | "aku mengerti" setelah baris terakhir | tidak aktif |
| Kartu 1 | seret Thinman | tidak aktif | tidak aktif | tidak aktif | lanjut setelah syarat | tidak aktif |
| Kartu 3 dan kanvas | coret | hapus | mundur | maju | selesai (kanvas), lanjut (kartu) | tidak aktif |
| Top-3 | tidak aktif | tidak aktif | tidak aktif | tidak aktif | Terima | tidak aktif |
| Penempatan | pegang dan pindah | tidak aktif | tidak aktif | rotasi (dengan gerak putar) | taruh selesai | tidak aktif |
| Bermain | lompat | tidak aktif | tidak aktif | tidak aktif | tidak aktif | tidak aktif |
