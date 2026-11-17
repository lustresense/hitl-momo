# R17 · RD-02 skema rekaman lokal berizin

Kode: `src/components/nui-lab/lab-recorder.ts` (modul), panel "Rekam angka landmark" di NUI Lab rute `/nui-lab/gesture` dan `/nui-lab/canvas`.
Tes dan fixture: `tests/nui-lab/lab-recorder.test.ts` (19 tes), skenario skrip memakai `tests/nui-lab/lab-rig.ts` dan `tests/input/realistic-hands.ts`.

## Aturan

- **Opt-in dan lokal.** Tidak ada rekaman sebelum penguji mencentang persetujuan, kamera menyala, dan menekan "Mulai rekam". `LandmarkRecorder.start(false)` melempar error dan tidak menyimpan apa pun.
- **Angka saja.** 21 landmark (x, y), waktu relatif, bacaan aturan. Tidak ada video, gambar, wajah, nama, tanggal, user-agent. Tes memeriksa himpunan kunci frame persis dan tidak ada panggilan `fetch`/XHR/WebSocket/`sendBeacon`/`localStorage`/`sessionStorage`.
- **Satu-satunya jalan keluar** adalah berkas JSON yang diunduh penguji dengan tombol "Unduh JSON". Menghentikan kamera menghentikan rekaman. "Hapus rekaman" mengosongkan buffer. Batas 20,000 frame (`truncated: true` bila terlampaui).
- **Tidak ada data pribadi di repo.** Berkas rekaman tidak dimasukkan ke Git. Data tanpa `consent: true` tidak boleh dipakai latihan (`validateRecord` menolak).

## Berkas (`nui-landmark-record/1`)

`{schema, consent:true, mode:"baseline"|"experiment", contains, frameCount, truncated, frames[]}`

| Kunci frame | Isi |
|---|---|
| `t` | ms sejak mulai rekam (bilangan bulat) |
| `lm` | 21 × `[x, y]` dibulatkan 1e-4, atau `null` bila tidak ada tangan terkunci |
| `session` | penghitung akuisisi hand-lock (sesi, bukan orang) |
| `lock` | `waiting/locking/locked/lost/ambiguous` |
| `aspect` | lebar/tinggi video yang dipakai geometri |
| `rawPose`, `stablePose` | pose per frame dan setelah vote 3-dari-5 |
| `fingers`, `fingersLegacy` | jumlah jari aturan aktif dan aturan lama untuk frame yang sama |
| `fingerStates` | telunjuk/tengah/manis/kelingking |
| `thumb` | `{legacyRatio, lateral, ipAngleDeg, open}` |
| `pinchRatio` | rasio jempol-telunjuk yang dilihat aturan |
| `truth` | label penguji: `THREE FIVE PINCH_NEAR PINCH_TOUCH NO_GESTURE TRANSITION NO_LANDMARK UNLABELLED` |
| `reject` | alasan aksi ditahan/ditolak |
| `action` | aksi yang benar-benar berjalan: `draw erase undo redo none` |

## Fixture (skenario skrip pada median kelas HaGRID, UNIT_ONLY)

| Kasus | Skenario | Yang ditegaskan |
|---|---|---|
| THREE | tiga jari, jempol menutup kelingking | pose stabil `three-fingers`, `fingers=3`, tanpa aksi |
| FIVE | telapak, jempol keluar | `fingers=5`, jempol terbuka, aksi `erase` muncul |
| near-miss FIVE (negatif) | empat jari, jempol tertekuk | `fingers=4`, `fingersLegacy=5`, tidak pernah `erase` |
| PINCH-NEAR (negatif) | jempol 0.5 span dari ujung telunjuk | 24 frame, semua `none`, rasio > 0.3 |
| PINCH-TOUCH | ujung menyentuh | ada `draw`, rasio minimum < 0.3 |
| NO-GESTURE | tangan L santai | semua `none` |
| TRANSITION | pinch → buka → telapak | urutan label tercatat benar |
| NO-LANDMARK | 15 frame kosong | `lm=null`, `lock=waiting`, `none` |

## Yang belum ada (RD-02 belum selesai tanpa ini)

Fixture di atas **sintetis**. Kasus **PINCH-NEAR/PINCH-TOUCH nyata** dan footage webcam target hanya bisa datang dari Owner/penguji yang menekan perekam ini di perangkat target. Status: **perekam SIAP, data nyata NOT_TESTED**.
