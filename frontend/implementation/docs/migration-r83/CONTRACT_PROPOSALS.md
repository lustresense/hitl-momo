# Usulan Perubahan Kontrak Lintas-Owner (CAN → DIAS) — Migrasi r8.3

| Atribut | Nilai |
|---|---|
| Status | **PROPOSAL SAJA — BELUM DIIMPLEMENTASIKAN** |
| Tanggal | 2026-11-25 |
| Pengusul | Tim Frontend Siswa (CAN) — Migrasi Sandbox r8.3 |
| Tujuan / Pemilik Scope | Tim Backend, Model & Dashboard Admin (**DIAS**) |
| Basis bukti repo | `lustresense/hitl-momo` @ `3908119` (`backend/app/classroom.py`, `backend/app/db.py`, `contracts/API_INVENTORY.md`, `frontend/implementation/src/api/classroom-client.ts`) |
| Rujukan rencana | `docs/migration-r83/R83_MIGRATION_PLAN.md` (§0 butir 4, §2.4 butir 4, §4 O-3/O-4/O-15, §5.5) |

> **Batas Scope:** Dokumen ini **hanya usulan kontrak lintas-owner**. Migrasi frontend r8.3 **tidak menyentuh** `backend/`, `contracts/`, `train/`, `weights/`, atau `frontend/admin/`. Implementasi di sisi backend/kontrak sepenuhnya berada di scope DIAS setelah persetujuan Owner dan DIAS.

---

## 1. Proposal 1 — Mode Join Kelas Berbasis Nama Tanpa `number` (Alokasi ID Atomik di Server)

### 1.1 Masalah Eksisting (Bukti Statis pada `3908119`)

Desain r8.3 yang disetujui Owner menghapus pemilihan **nomor absen** (penggaris) dan menggantinya dengan **kenalan nama lewat suara** di halaman sampul. Namun, kontrak backend join kelas saat ini masih mewajibkan `number` dan berisiko mencampur data siswa secara diam-diam jika frontend mencoba memalsukan nomor:

1. **Validasi wajib `number` (`backend/app/classroom.py:72-81`):**
   - `JoinBody` mendefinisikan `number: int = Field(ge=1)` dan `name: str = Field(min_length=1, max_length=80)`.
   - `POST /api/join/{token}/students` menolak `body.number > c["student_count"]` dengan HTTP `400`.
2. **Skema SQLite (`backend/app/db.py:45-52`):**
   - Tabel `students` mendefinisikan `number INTEGER NOT NULL` dan constraint `UNIQUE (class_id, number)`.
3. **Perilaku upsert menimpa nama tanpa konflik (`backend/app/classroom.py:83-93`):**
   ```sql
   INSERT INTO students (class_id, number, name) VALUES (?, ?, ?)
   ON CONFLICT (class_id, number) DO UPDATE SET name = excluded.name
   ```
   - Backend tidak mengembalikan HTTP `409 Conflict` saat `(class_id, number)` sudah terpakai; sebaliknya ia menimpa `name` dan mengembalikan `student_id` milik baris lama yang sama.
4. **Dampak race condition bila frontend menebak nomor dari `taken_numbers`:**
   - Jika frontend memanggil `GET /api/join/{token}`, membaca `taken_numbers`, lalu memilih nomor kosong terkecil di klien: dua siswa yang bergabung pada waktu berdekatan akan mengambil nomor yang sama. Siswa kedua secara diam-diam **menimpa nama siswa pertama** dan seluruh submission/outcome kedua siswa tergabung pada satu `student_id` tanpa error. Ini merusak integritas data riset HITL.

### 1.2 Usulan Kontrak ke DIAS

Menambahkan dukungan **join berbasis nama tanpa `number`** secara aditif dan backward-compatible (klien lama yang tetap mengirim `{ number, name }` tidak rusak):

#### A. Endpoint & Request
- **Opsi yang disarankan (aditif pada endpoint eksisting):** `POST /api/join/{token}/students`
  - Mode lama (tetap didukung selama masa transisi):
    ```json
    {
      "number": 7,
      "name": "Rani Putri"
    }
    ```
  - Mode baru (`name_only`, tanpa `number`):
    ```json
    {
      "name": "Rani Putri",
      "join_mode": "name_only",
      "client_join_key": "uuid-v4-per-perangkat-opsional"
    }
    ```
    *(Alternatif ekuivalen bila DIAS memilih jalur terpisah: `POST /api/join/{token}/students/by-name` dengan body `{ "name", "client_join_key?" }`.)*

#### B. Semantik Server (Wajib Atomik & Tanpa Race Condition)
1. **Alokasi atomik di server:** Dalam satu transaksi terkunci (di SQLite menggunakan `BEGIN IMMEDIATE` atau mekanisme antrean tulis atomik), server membuat baris `students` baru dengan `student_id` unik.
2. **Penanganan kolom `number` / `student_number`:**
   - **Pilihan 1 (paling kompatibel dengan dashboard/export eksisting):** Server mengalokasikan slot urutan atomik `next_number = MAX(number) + 1` (atau `1` bila kosong) pada transaksi `BEGIN IMMEDIATE`, tidak pernah melakukan `ON CONFLICT DO UPDATE` pada mode `name_only`.
   - **Pilihan 2 (skema longgar):** `students.number` dijadikan `NULLABLE` pada mode `name_only`, dan dashboard/export menampilkan `-` atau nomor urut tampilan dari `student_id`.
3. **Penanganan nama sama (dua siswa bernama sama di satu kelas):**
   - Dua siswa SMP di satu kelas dapat memiliki nama panggilan yang sama (mis. dua anak bernama `"Rani"`). Mode `name_only` **tidak boleh** menggabungkan dua siswa hanya karena `name` identik.
   - Retry jaringan pada perangkat yang sama dihindari duplikasinya lewat `client_join_key` (idempoten per `(class_id, client_join_key)` dalam jendela sesi), bukan berdasarkan kecocokan `name`.
4. **Batas kapasitas kelas (`student_count`):**
   - Bila alokasi melampaui `student_count` (jika batas masih diberlakukan), kembalikan HTTP `409 Conflict` dengan detail Bahasa Indonesia yang jelas, jangan menimpa baris siswa lain.
5. **Validasi nama:**
   - `name`: `min_length=1`, `max_length=80` (tetap sesuai backend sekarang; frontend r8.3 menormalisasi nama maksimal 3 kata / 24 karakter).

#### C. Respons (Kompatibel dengan `StudentSession` Eksisting)
```json
{
  "student_id": 42,
  "number": 12,
  "name": "Rani Putri",
  "class_name": "7A",
  "student_session_token": "<opaque-token>",
  "expires_in": 28800,
  "joined_at": "2026-11-25T04:00:00+00:00",
  "join_mode": "name_only"
}
```
- Field `number` bernilai `int` (Pilihan 1) atau `null` (Pilihan 2; jika `null`, `StudentSession.number` di klien akan dibuat opsional saat kontrak disepakati).
- Endpoint hilir `POST /api/submissions` dan `PATCH /api/submissions/{id}/outcome` tetap memakai `Authorization: Bearer <student_session_token>` dan `student_id` tanpa perubahan skema.

#### D. Dampak Dashboard Admin DIAS
- `GET /api/classes/{id}/submissions`, `export.csv`, dan `export.zip` saat ini menampilkan `student_number` dan `student_name`. DIAS dan Owner perlu menyepakati apakah `student_number` di export tetap terisi nomor urut alokasi server (Pilihan 1) atau kosong/opsional (Pilihan 2).

### 1.3 Mitigasi Sementara di Frontend CAN (Selama Menunggu DIAS)
Sesuai keputusan Owner **O-3 default `(b)`**:
- `features/cover/join/join-identity.ts` menyiapkan antarmuka `JoinIdentityStrategy`:
  - `rulerPlusName` (**AKTIF**): tanpa link kelas cukup nama; dengan link kelas menjalankan langkah nama lalu penggaris nomor (`StudentRulerSelector`) dan memanggil `joinClass(number, name)` yang sudah ada.
  - `nameOnly` (**MATI**, di balik flag `NEXT_PUBLIC_JOIN_NAME_ONLY`): melempar `NotSupported` sampai kontrak DIAS di atas terpasang dan terverifikasi.

---

## 2. Proposal 2 — Kontrak Layanan STT Nama (`POST /api/stt/name` atau Ekivalen) Tanpa Rekaman Tersimpan

### 2.1 Masalah Eksisting
- Sandbox r8.3 memakai `window.SpeechRecognition` / `webkitSpeechRecognition` (Web Speech API) sebagai simulasi pengenalan nama.
- Di Chrome, Web Speech API mengirimkan audio suara siswa ke server eksternal Google. Untuk pengguna anak SMP dan jaringan sekolah lokal, perilaku ini tidak sesuai prinsip privasi anak dan kebutuhan deployment lokal.
- Layanan STT riset DIAS (STT Lab) saat ini berjalan sebagai layanan eksternal di VM (`/api/stt/*`, port `5877`), belum terdokumentasi di `contracts/openapi.json` maupun `contracts/API_INVENTORY.md`.

### 2.2 Usulan Kontrak ke DIAS

#### A. Endpoint & Request
- **Endpoint usulan:** `POST /api/stt/name` (atau path di bawah `/api/stt/*` yang disepakati, diproxy lewat origin yang sama agar aman dari CORS lintas jaringan sekolah).
- **Content-Type:** `multipart/form-data`
  - `audio`: berkas biner audio pendek dari MediaRecorder (rekomendasi: `audio/webm;codecs=opus` atau `audio/wav` PCM 16 kHz mono; batas ukuran mis. ≤ 512 KiB untuk durasi maks 7 detik sesuai `NAME_LISTEN_MS = 7000`).
  - `lang`: `"id-ID"` (default).
  - `max_duration_ms`: `7000` (opsional, untuk validasi server).
- **Auth (untuk didiskusikan):** Karena langkah nama terjadi **sebelum** `POST /api/join/{token}/students`, siswa belum memiliki `student_session_token`. Bila diperlukan pembatasan akses, dapat memakai `join_token` opsional (untuk sesi kelas) dan/atau rate-limit per IP di Caddy/backend.

#### B. Respons Sukses (`200 OK`)
```json
{
  "transcript": "nama saya rani putri",
  "alternatives": ["nama saya rani putri", "nama saya roni putri"],
  "confidence": 0.89,
  "language": "id-ID",
  "latency_ms": 420
}
```
- Frontend CAN akan menjalankan normalisasi deterministik `normalize-name.ts` (membuang sapaan/awalan seperti `"nama saya"`, mengambil maks 3 kata / 24 karakter) lalu meminta siswa mengonfirmasi nama secara eksplisit lewat aturan B (`"Ulangi"` / `"Ya, itu namaku"`).

#### C. Respons Error & Perilaku Fail-Closed
| HTTP Status | Kode (`error_code`) | Arti | Reaksi Frontend CAN |
|---|---|---|---|
| `400` | `invalid_audio` | Format audio tidak didukung atau payload kosong | Minta siswa coba ulang atau alihkan ke input ketik guru |
| `413` | `audio_too_large` | Audio melebihi batas ukuran/durasi | Minta siswa sebut nama lebih singkat / fallback ketik |
| `422` | `no_speech` | Audio valid, tetapi ucapan tidak terdeteksi | Momo: `"Hmm, suaramu belum kedengaran..."`, siap ulang |
| `429` | `rate_limited` | Terlalu banyak permintaan | Fallback ke input ketik guru |
| `503` | `stt_unavailable` | Model/layanan STT tidak siap atau sedang mati | Fail-closed: langsung tawarkan input ketik guru tanpa error menggantung |

#### D. Persyaratan Privasi Anak & Keamanan (WAJIB)
1. **Tanpa rekaman tersimpan:** Buffer audio **wajib diproses di memori** (atau file temp yang langsung di-unlink dalam blok `finally` sebelum respons dikirim). **Tidak boleh** ada rekaman suara siswa yang disimpan ke disk permanen, database, bucket, atau backup.
2. **Tanpa nama di log server:** Field `transcript` tidak boleh dicetak ke access log, error log, atau telemetri produksi.
3. **Pemrosesan lokal:** Inferensi STT berjalan di server lokal/VM proyek (bukan mengirim audio anak ke API cloud pihak ketiga tanpa persetujuan tertulis).
4. **Timeout ketat:** Target waktu respons end-to-end ≤ 2–3 detik untuk klip ≤ 7 detik agar alur kenalan terasa alami bagi siswa SMP.

### 2.3 Mitigasi Sementara di Frontend CAN (Selama Menunggu DIAS)
Sesuai keputusan Owner **O-4** dan **O-15**:
- `features/cover/name/name-provider.ts` mendefinisikan antarmuka `NameProvider { listen(signal): Promise<NameResult> }`.
- Provider `stt-lab` diimplementasikan sebagai stub **gagal-tertutup** (langsung mengembalikan `unavailable`) sampai kontrak endpoint STT DIAS tersedia dan disepakati.
- Urutan produksi: `stt-lab` → fallback `typed` (kolom ketik di chrome untuk guru, agar tidak ada dead-end).
- Provider `sim` (Web Speech API + nama contoh `"Bima"`) hanya aktif jika `NEXT_PUBLIC_DEV_TOOLS=1` dan selalu menampilkan label **`SIMULASI`**.

---

## 3. Ringkasan Koordinasi Lintas-Owner

| Topik | Pemilik Perubahan | File Scope DIAS yang Terdampak (Referensi Saja) | Status Saat Ini | Syarat Pembukaan Blocker di Frontend CAN |
|---|---|---|---|---|
| Join berbasis nama tanpa `number` | DIAS (+ persetujuan Owner) | `backend/app/classroom.py`, `backend/app/db.py`, `contracts/openapi.json`, `contracts/API_INVENTORY.md`, `frontend/admin/` | **PROPOSAL** (belum dibahas/disetujui DIAS) | Kontrak disetujui & lulus uji konkurensi join → aktifkan `NEXT_PUBLIC_JOIN_NAME_ONLY` + adapter `nameOnly`. |
| Layanan STT nama tanpa simpan audio | DIAS (+ persetujuan Owner) | Layanan STT (`/api/stt/name`), proxy Caddy, `contracts/openapi.json`, `contracts/API_INVENTORY.md` | **PROPOSAL** (STT Lab masih eksternal tanpa kontrak) | Kontrak disetujui + audit privasi (0 rekaman tersimpan) → ganti stub `stt-lab` dengan client HTTP nyata. |
