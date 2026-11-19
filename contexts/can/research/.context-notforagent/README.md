# NUI Lab conversation archives

Arsip percakapan NUI Lab telah disatukan dalam **[NUI_LAB_HISTORY.toon](NUI_LAB_HISTORY.toon)**, berformat **TOON (Token-Oriented Object Notation)**, bukan JSON.

Urutan pembacaan **5 → 4 → 3 → 2 → 1** (paling baru di atas). Urutan pesan *di dalam setiap sesi* tetap sesuai percakapan aslinya. Semua isi arsip dipertahankan, **tanpa deduplikasi**; pemisah tiap sesi ada sebagai komentar TOON dan metadata sesi.

Semua **17 aset gambar lokal** berada di **[images/](images/)** dengan nama khusus sesi, misalnya `images/nui-lab-5-image-001.png`. Teks arsip mereferensikan path relatif ke berkas TOON dan setiap sesi memiliki daftar `images[N]` yang menunjuk ke aset yang sama. Tautan gambar eksternal yang sejak awal berupa URL luar tetap dipertahankan sebagai URL, bukan diklaim tersimpan lokal.

Untuk mengambil isi percakapan, gunakan decoder TOON yang mendukung spesifikasi v4.x. Setiap `sessions[N].messages[N].text` menyimpan teks asli dengan newline escaped sesuai aturan string TOON; `speaker` dan `timestamp` disediakan sebagai metadata. `source_path` dan `source_blob_sha` mengacu pada arsip asli yang masih dapat diperiksa lewat riwayat Git.

Folder ini adalah konteks arsip milik Owner. Jangan menganggap isinya keputusan PA yang otomatis aktif. Prioritas keputusan tetap mengikuti SOUL.md dan DECISIONS.md.
