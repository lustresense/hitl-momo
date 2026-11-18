# Usulan: toggle kuis/survei di penutup

Status: **PROPOSED**. Belum ada di backend (`backend/`) dan belum disetujui Can dan Dias. Dokumen ini tidak mengubah `openapi.json` atau `API_INVENTORY.md`; itu dilakukan setelah persetujuan.

Sumber: BIGPROMPT §6.9 dan Lampiran §16. Owner: "admin/superadmin mempunyai toggle untuk mengaktifkan kuis", materi dan gestur kuis belum final.

## Yang sudah ada di client (Can)

`src/config/quiz-flag.ts`, `isQuizEnabled(server?)`. Urutan:

1. Nilai server, bila endpoint memberi `boolean`.
2. `NEXT_PUBLIC_QUIZ_ENABLED`: `1` atau `true` = ON, `0` atau `false` = OFF, teks lain = tidak diset.
3. Default OFF.

Penutup (`src/components/ending/CenterOfPage.tsx`) memakai urutan ini lewat prop `quizEnabled`. Saat ON: setelah rekap, Momo mengantar ke placeholder "Kuis belum tersedia", lalu penutup selesai. Saat OFF: rekap langsung ke "Kembali ke sampul". Penutup lengkap dalam kedua kasus.

## Usulan A: kolom di respons kelas (siswa)

`GET /api/join/{token}` (EXISTING, dipakai `classroom-client.ts`) menambah field opsional:

```json
{ "quiz_enabled": true }
```

- Tipe: `boolean`, opsional. Bila tidak ada, client memakai langkah 2 di atas.
- Aditif untuk respons. Client lama mengabaikan field ini.
- Pembacaan di client (`classroom-client.ts`) belum ditulis. File itu dipegang worker L3; perubahannya perlu koordinasi dengan lead.

## Usulan B: pengaturan admin (dashboard Dias)

Toggle dikelola admin/superadmin di dashboard, scope Dias. Usulan endpoint (bentuk saja, nama bisa diubah Dias):

| Method | Path | Auth | Catatan |
|---|---|---|---|
| GET | `/api/classes/{id}/settings` | Bearer, admin kelas atau superadmin | `{ "quiz_enabled": false }` |
| PATCH | `/api/classes/{id}/settings` | Bearer, admin kelas atau superadmin | body `{ "quiz_enabled": true }`, respons 200 |

Pengaturan per kelas, bukan global, supaya sekolah bisa mencoba kuis bertahap. Bila Owner ingin satu saklar global, cukup satu field di `schools`.

Dashboard Dias TIDAK diubah oleh Can. Dias yang menambah UI toggle dan endpoint ini.

## Yang belum diputuskan (pertanyaan untuk Owner dan Dias)

1. Toggle per kelas atau per sekolah?
2. Bentuk materi kuis dan gestur jawaban (belum final, BIGPROMPT §6.9).
3. Kuis disimpan ke submission atau tabel terpisah? Tidak diusulkan di sini.

## Langkah berikutnya

1. Owner setuju arah (per kelas, dan kuis tetap di luar level).
2. Dias menilai kelayakan endpoint dan menambah field di `classroom.py` bila setuju.
3. Can menambah field di adapter dan menghapus fallback env bila server sudah mengirim nilai.
4. `openapi.json`, `API_INVENTORY.md`, dan fixture diperbarui oleh pemilik kontrak, sesuai aturan `contracts/README.md`.
