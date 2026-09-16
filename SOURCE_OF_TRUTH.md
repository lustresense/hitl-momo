# Source of Truth Map

Dokumen ini menentukan **sumber mana yang authoritative untuk jenis pertanyaan tertentu**. Ini bukan pengganti `CHANGELOG.md`.

## 1. Cara AI harus bekerja

Urutan:
1. instruksi eksplisit pengguna terbaru;
2. `INSTRUCTION.md`;
3. `AGENTS.md` dan rules yang tidak bertentangan dengan dua sumber di atas.

## 2. Keputusan produk / PA

Urutan:
1. instruksi eksplisit pengguna terbaru;
2. `CHANGELOG.md`;
3. dokumen formal terbaru + direct transcript dosen/pengguna;
4. `PROJECT_MEMORY.md` / ECC memory hanya sebagai konteks;
5. `archive/ai-history/**` hanya sejarah.

Jika satu hal berstatus **Belum Dikunci**, agent tidak boleh menguncinya sendiri.

## 3. Apa yang benar-benar sudah diimplementasikan

Urutan:
1. `implementation/**` dan test/config aktual;
2. kontrak yang hidup di `implementation/contracts/**`;
3. `WORKING_CONTEXT.md`;
4. docs teknis terbaru;
5. ECC memory.

Dokumen proposal dapat menjelaskan intent, tetapi bukan bukti bahwa suatu fitur sudah ada di codebase.

## 4. Baseline akademik

- Proposal formal terbaru berada di `academic/proposal/current/`.
- Versi lama berada di `academic/proposal/history/` atau `archive/old-proposals/`.
- `CHANGELOG.md` dapat mengoreksi detail keputusan yang sudah berubah setelah proposal.

## 5. Bimbingan / meeting

Sumber berada di `meetings/`.

Di dalam notulensi:
- prioritaskan pernyataan langsung dosen/pengguna;
- `Summary`, `Report`, `Task`, `Claude ver.`, `Gemini ver.`, analisis AI, dan master plan adalah interpretasi sekunder;
- kata “approved/final/wajib” di summary AI bukan persetujuan dosen tanpa dukungan transcript.

## 6. Research

- `research/notes/` dan `research/evidence-map/` adalah lapisan kerja.
- `research/library/raw-papers/` adalah bukti primer untuk verifikasi.
- Jangan mengklaim paper mendukung sesuatu tanpa memeriksa paper yang relevan.

## 7. Visual / design

- `design/` berisi current design work dan eksplorasi.
- Nama file seperti `final`, `option`, atau `preview` tidak otomatis berarti desain telah dikunci.
- Status desain tetap mengikuti `CHANGELOG.md` + keputusan pengguna.

## 8. AI memory

`PROJECT_MEMORY.md`, `WORKING_CONTEXT.md`, dan `.ecc/memory/**` mempercepat recall. Mereka **tidak pernah mengalahkan governed project truth**.

## 9. Archive

`archive/**` adalah cold storage. Isi archive:
- boleh dipakai untuk forensik/riwayat;
- tidak boleh dipakai untuk menghidupkan kembali keputusan lama tanpa verifikasi.
