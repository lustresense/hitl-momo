# Rekonsiliasi BIGPROMPT (10 Nov) + REVISI-NUI (10 Nov, terbaru)

Aturan: REVISI-NUI = terbaru dan menang bila bentrok. Kecuali bila bertentangan dengan kutipan langsung Owner di BIGPROMPT §16–17; maka kutipan Owner menang dan konflik dicatat. Semua yang lain di BIGPROMPT tetap berlaku (3 level saja, animasi tidak dipercepat, jempol = "aku mengerti", tidak auto-skip, fallback tidak dipamerkan di awal).

| Topik | BIGPROMPT | REVISI (terbaru) | Keputusan lead |
|---|---|---|---|
| Kamera PIP | "pojok kiri" / kiri atas | KIRI BAWAH `bottom:24px; left:24px`, konsisten di semua halaman | Kiri bawah |
| Pemicu kamera mengecil | dua penyebutan (nyala / lambaian) | §6.3 setelah lambaian; §19 mengingatkan Owner bilang "saat kamera menyala" | Tetap setelah lambaian (Owner §17: "dadah-dadah baru deteksi animasi itu pindah"). Dicatat sebagai delta |
| Lambaian | harus terdeteksi | ambang lebih responsif (motion blur), CINCIN PROGRES lambaian | Tambah cincin progres lambaian + ambang responsif |
| Momo tidur | napas, Zzz | napas naik-turun ~6–8 px + tilt ~2°; Zzz bertingkat melayang; reduced motion: alternatif yang menghormati preferensi | Gabung: napas skala + apung 6–8 px + tilt 2°. Reduced: amplitudo dikurangi, Zzz opacity; tidak dimatikan |
| Penggaris | Momo fokus tengah lalu kanan; tanya setelah pilih | DEFAULT NOMOR 1 untuk siswa baru; tanya hanya setelah digeser + settle; HANDLE ~48×70 px dengan grip; cubit+geser, lepas = snap | Semua digabung |
| Kartu: timing | normal, tidak dipercepat | perlambat; tutup ~1,0 s `power2.out`; jeda buka kartu berikut ~1,0–1,2 s; buka awal sudah oke | Tutup 1,0 s power2.out + jeda 1,1 s; deal/buka nilai `9f9d35d` |
| Kartu: ukuran | — | brosur lebih besar (`computeLayout` gw 320–480, pw ≈1,6 gw, oh 480–720 ≈ vh·0,76; margin bawah ≈22% vh, tidak menyenggol kamera kiri bawah/Momo kanan bawah) | Ikuti |
| Kartu 1 | seret cubit ke bendera, jeda 10 s, jempol | copy "Cubit dan geser Thinman ke kanan sampai menyentuh bendera."; cincin jempol tampil TERKUNCI (abu-abu + gembok) sebelum eligible, dengan indikator progres jeda baca; §19 meragukan gate 10 s | Gate 10 s DIPERTAHANKAN (kutipan Owner §17 "Kasih 10 detik baru muncul jempol"), tetapi transparan: cincin terkunci + progres baca terlihat |
| Kartu 3 | semua alat dicoba | gestur tangan di kanvas latihan | Sama |
| Pilih level | 3 level, pengguna baru ke Bab 1 | ikon pita jari 1/2/3; tunjukkan 1/2/3 jari = pilih bab (hormati kunci); copy Momo "Tunjukkan 1, 2, atau 3 jarimu ke kamera buat memilih bab yang mau kamu mainkan!" | Ikuti; kunci tidak bisa dilewati; jari + cincin konfirmasi |
| Intro level | jempol setelah ucapan; Momo naik | tanpa hening ~10 s; backdrop gelap rgba(0,0,0,.55); Momo 280–300 px maju; Momo bergerak dekat Thinman (kalimat 1) lalu ke kanan menunjuk jurang/tujuan; katalog benda PINDAH ke layar kanvas | Ikuti |
| Naik ke awan | animasi penuh | panning kamera melewati `CloudBand`, tanpa dissolve; Momo ikut naik lalu berhenti mantap | Ikuti |
| Kanvas fase fokus | — | backdrop gelap; Momo ulas 4 alat; rekomendasi benda; jempol "Mulai Menggambar" menutup backdrop | Ikuti |
| Intent gating | — | HANYA cubit yang menggores; jempol/telapak/telunjuk tidak pernah menggores | Ikuti (verifikasi pipeline) |
| Idle 10 s | Momo bertanya | indikator jempol pudar saat aktif; 10 s diam → menyala + animasi "tuwing" 3 s; reset saat menggambar/menghapus | GABUNG: Momo bertanya + indikator menyala |
| Top-3 | Terima/Pilih lain/Bukan semua; Redraw pemulihan | TANPA kursor: 1/2/3 jari pilih kandidat + cincin; telapak terbuka = "Bukan ini"; cubit tahan = gambar ulang; tools kanvas mati | Ikuti (menggantikan dwell kursor dari iterasi lalu). Daftar label setelah "Bukan ini" dipilih dengan jumlah jari (1–5) + cincin |
| Setelah keputusan | "Masukkan ke dunia" (D-20261105-02) | STIKER di atas kanvas; tombol "Lempar" (jempol + cincin 2 s) dan "Gambar lagi" (telapak terbuka + cincin); animasi stiker turun melewati awan ke dunia | Ikuti; "Lempar" menggantikan copy "Masukkan ke dunia" (delta terhadap D-20261105-02, dicatat) |
| Penempatan | cubit + cincin, lepas taruh; rotasi lima jari memutar | "Taruh di sini" = jempol + cincin; "Gambar lagi" = telapak + cincin; "Geser objek" = cubit + cincin; "Rotate" = telapak terbuka + cincin → putar 90°, collider tukar w↔h | Ikuti REVISI: rotasi per 90° lewat telapak+cincin (menggantikan "gerak memutar" bebas) |
| Kontrol Thinman (kamera) | — | kemudi sudut telunjuk: ~90° lompat; 45–75° lompat+kanan; 105–135° lompat+kiri; horizontal (<30°/>150°) jalan; widget speedometer; bar bawah tanpa label keyboard di mode kamera | Ikuti; kalibrasi = asumsi, NOT TESTED kamera |
| Gagal | "Gambar lagi" | 1 jari Coba lagi, 2 jari Geser objek, 3 jari Gambar lagi; cincin | Ikuti |
| Route kanvas | — | `/canvas1..3`, terasa satu dunia (pushState, tanpa flash) | Ikuti |
| Cold start | — | preload + warmup HandLandmarker di cover; status delegate GPU/CPU transparan | Ikuti |
| Mode gestur | router berbasis state | daftar MODE_* eksplisit (§18C) | Ikuti sebagai router tunggal |
