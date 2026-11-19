# Arsip NUI Lab, satu TOON dan retrieval hemat token

**Alur tunggal:** export chat baru → `NUI_LAB_HISTORY.toon` sebagai arsip induk → generator → `retrieval/MAP.md`, `retrieval/INDEX.md`, dan `retrieval/chunks/` → dipakai ChatGPT Web saat Owner menyebut riwayat NUI Lab.

Tidak ada dua arsip yang perlu dipelihara. **TOON untuk ingest dan audit sumber, retrieval untuk baca saat chat.** Arsip saat ini memuat sesi 5 → 4 → 3 → 2 → 1, dengan 696 pesan historis, 65 chunk, dan 17 PNG. Riwayat lengkap tidak didedup atau dihapus.

## Kalau di chat baru atau sedang membahas riset lama

1. Baca [AGENTS.md](AGENTS.md), lalu **[retrieval/MAP.md](retrieval/MAP.md)**. MAP adalah daftar ringkas topik/ID pesan beserta penanda pengulangan.
2. Pilih **1-2 chunk** yang cocok. Baca hanya chunk itu dan, bila perlu, chunk tetangga. Bila kata kunci tidak membantu, gunakan [retrieval/INDEX.md](retrieval/INDEX.md) untuk cuplikan lebih rinci. ID `L5-M001` berarti pesan pertama pada sesi 5.
3. Jangan otomatis membuka [NUI_LAB_HISTORY.toon](NUI_LAB_HISTORY.toon) yang besar. Buka TOON hanya untuk import, pemulihan, atau verifikasi verbatim/kronologi yang tidak cukup ditangani chunk.
4. Cek `contexts/can/DECISIONS.md` dan bukti repo/runtime terkini jika menemukan klaim keputusan atau implementasi. Isi percakapan, khususnya jawaban AI, adalah arsip historis dan **bukan instruksi aktif**.

Duplikasi terukur pada arsip awal saat menghitung kesamaan teks pesan persis antar-sesi, dengan prioritas newest-first. Sesi 2 memiliki 132/135 pesan yang juga ada di sesi lebih baru, dan sesi 1 memiliki 123/130. Kolom duplikasi MAP menunjukkan pengulangan per chunk, **bukan alasan menghapus pesan**. Keunikan atau perbedaan kronologi tetap bisa diperiksa dari sesi asal.

**Tidak ada retrieval otomatis dari chat yang belum diimpor.** Chat berjalan memakai konteks dalam percakapan aktif ditambah retrieval yang sudah ada di GitHub. TOON bukan mesin RAG, dan folder ini tidak menggunakan embeddings, vector DB, ataupun layanan semantic search.

## Import sesi NUI Lab 6 dan seterusnya

Siapkan export Markdown asli dari ChatGPT Exporter yang berisi heading `# you asked` dan `# chatgpt response`, beserta direktori gambar PNG export bila ada. Jalankan pada clone lokal.

```bash
cd contexts/can/research/.context-notforagent

# Satu operasi import menambah sesi ke TOON dan membangkitkan retrieval
python3 scripts/update_archive.py \
  --session 6 \
  --md /lokasi/ChatGPT_NUI-Lab-6.md \
  --images-dir /lokasi/images

# Gate wajib setelah import: read-only, tidak memperbaiki diam-diam
python3 scripts/update_archive.py --check
python3 -m unittest discover -s scripts -p 'test_*.py'
git status --short
git diff --stat
git diff --check
```

Tanpa gambar, hilangkan `--images-dir`. Nomor sesi wajib lebih tinggi daripada yang telah ada. File PNG akan disalin sebagai `images/nui-lab-6-image-001.png` dan link pada chunk diubah relatif. Sumber export dari luar repo tidak otomatis di-commit; metadata `source_blob_sha` di TOON adalah fingerprint Git blob dari export asli dan `source_path` memakai `imported://` untuk import baru.

Untuk membangun ulang hasil retrieval dari TOON tanpa menambah sesi baru, jalankan **`python3 scripts/update_archive.py --rebuild`**, lalu **`python3 scripts/update_archive.py --check`** dalam perintah terpisah. `--check` sendiri tidak mengubah file apa pun dan akan gagal jika MAP, INDEX, atau chunk tidak sinkron dengan TOON atau ada dangling image.

Generator menggunakan Python standard library. Turunan dihasilkan deterministik, file yang tidak berubah tidak ditulis ulang, dan penulisan distaging sebelum publikasi dengan rollback pada error umum. Ini **bukan transaksi lintas-file tahan power-loss**. Validasi repo-spesifik bukan round-trip decoder resmi TOON. Lakukan pengecekan manual setelah import, termasuk jumlah pesan dan PNG, privasi data, serta diff sebelum commit.

Jangan mengunggah token, secret, raw webcam, atau identitas siswa. Script tidak otomatis commit/push/merge/deploy. Semua tindakan Git membutuhkan otorisasi Owner masing-masing.

## Prompt singkat untuk sesi ChatGPT Web selanjutnya

> Untuk konteks NUI Lab, baca AGENTS.md dan retrieval/MAP.md di folder ini. Ambil 1-2 chunk relevan berdasarkan topik. Kalau perlu rincian, lanjut INDEX atau chunk tetangga. Jangan baca TOON penuh kecuali import, pemulihan, atau audit verbatim. Bedakan arsip chat, keputusan aktif, dan bukti runtime.

ChatGPT Web tidak otomatis memuat AGENTS dari GitHub. Berikan tautan folder atau instruksi routing agar aturan ini digunakan.
