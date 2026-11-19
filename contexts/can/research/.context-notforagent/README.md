# Arsip NUI Lab untuk ChatGPT Web

**Arsip percakapan lengkap** adalah [NUI_LAB_HISTORY.toon](NUI_LAB_HISTORY.toon). Ini satu file TOON dengan sesi paling baru di atas, yaitu **5 → 4 → 3 → 2 → 1**. Urutan pesan dalam setiap sesi tetap aslinya dan pesan berulang tidak dihapus. Semua **17 PNG** ada di [images/](images/).

## Untuk mencari konteks di sesi baru

1. Baca [AGENTS.md](AGENTS.md) dalam folder ini, lalu [retrieval/INDEX.md](retrieval/INDEX.md).
2. Cari isu, frasa atau nomor riset, kemudian buka hanya file relevan di `retrieval/chunks/s5/` sampai `s1/`. ID `L5-M001` berarti sesi 5, pesan pertama.
3. Jika konteks masih terpotong, buka chunk tetangga atau sumber TOON lengkap. Jika ada klaim keputusan atau hasil tes, periksa `contexts/can/DECISIONS.md` dan source/runtime terbaru. Riwayat chat bukan sumber keputusan aktif.
4. Path gambar pada TOON berbentuk `images/nui-lab-5-image-001.png`. Pada chunk Markdown link-nya `../../../images/nui-lab-5-image-001.png`, relatif dari `retrieval/chunks/s5/`. URL luar tetap dipertahankan sebagai URL luar.

**Status retrieval:** 65 chunk Markdown dengan indeks newest-first. Ini **RAG-ready**, belum menjadi RAG live. Tidak ada embeddings, vector database, similarity-search service atau reranker. TOON adalah format serialisasi, bukan mesin RAG.

## Cara update untuk NUI Lab 6 dan seterusnya

Siapkan **Markdown export asli** percakapan baru yang punya heading `# you asked` dan `# chatgpt response`, serta folder PNG export (bila ada). Pada clone lokal repo:

```bash
cd contexts/can/research/.context-notforagent

python3 scripts/update_archive.py \
  --session 6 \
  --md /lokasi/ChatGPT_NUI-Lab-6.md \
  --images-dir /lokasi/images

python3 scripts/update_archive.py --check
git diff --stat
git diff --check
```

Jika export tidak memiliki gambar, hilangkan argumen `--images-dir`. Nomor sesi baru harus lebih tinggi daripada semua sesi lama. Script memasukkan sesi ke **atas** TOON, menyalin PNG ke `images/` dengan prefix sesi, memperbarui indeks dan chunk. Script menggunakan Python standard library, tidak perlu paket lain.

Untuk membangun ulang indeks dan potongan setelah koreksi TOON, jalankan `python3 scripts/update_archive.py --rebuild --check`. **Jangan edit chunk turunan sebagai sumber utama**, sebab akan tertimpa. File Markdown export dari luar repo tidak otomatis disimpan di Git; fingerprint Git blob export dicatat dalam metadata TOON sebagai `imported://...`, bukan diklaim sebagai file yang ada di Git.

### Gate sebelum commit

- Periksa `git status`, isi diff, nomor sesi newest-first, jumlah pesan dan keberadaan PNG yang direferensikan.
- Pastikan tidak mengunggah token, credentials, raw webcam, identitas siswa atau informasi privat lain.
- Script `--check` memvalidasi struktur repo-spesifik dan referensi gambar. **Belum menguji round-trip menggunakan decoder resmi TOON.**
- Commit, push, merge dan deploy adalah izin terpisah dari Owner. Script tidak melakukan operasi Git secara otomatis.

## Prompt untuk sesi ChatGPT Web berikutnya

> Baca folder GitHub `contexts/can/research/.context-notforagent/` dimulai dari `AGENTS.md`, `README.md` dan `retrieval/INDEX.md`. Cari pembahasan [topik] pada chunk yang relevan. Gunakan TOON utama jika butuh konteks penuh. Arsip bukan keputusan aktif. Pisahkan ucapan pengguna, pernyataan AI dan bukti runtime.

**Catatan:** File `AGENTS.md` di GitHub **tidak otomatis masuk ke konteks setiap sesi ChatGPT Web**. Owner harus memberikan tautan folder atau memasukkan instruksi routing ke pengaturan proyek. Jika konektor GitHub tidak tersedia, ChatGPT harus menjelaskan bahwa ia belum bisa membacanya.
