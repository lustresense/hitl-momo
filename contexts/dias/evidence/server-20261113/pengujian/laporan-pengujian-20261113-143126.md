# Laporan Pengujian Backend Sketchbook Universe

- Waktu pengujian: 2026-11-13 14:31:26
- Mesin penguji: pa-hitl-server (Linux 7.0.0-42-generic)

## Uji black-box

Target: `http://127.0.0.1:8090` (database uji terpisah)

| No | Skenario | Langkah | Hasil yang diharapkan | Hasil sebenarnya | Status |
|---|---|---|---|---|---|
| 1 | Pemeriksaan status layanan | GET /health | 200, status ok | 200 {'status': 'ok'} | **Berhasil** |
| 2 | Prediksi gambar | POST /predict dengan goresan tangga | 200, tepat 3 kandidat, confidence 0–1 | 200 tangga 97.5%, anak tangga 0.7%, pagar 0.2% | **Berhasil** |
| 3 | Login dengan kata sandi salah | POST /api/auth/login | 401, akses ditolak | 401 Email atau password salah. | **Berhasil** |
| 4 | Guru mengakses kelas sekolah lain | Guru sekolah B: GET /api/classes/{id} kelas sekolah A | 404, data tidak ditemukan | 404 Data tidak ditemukan. | **Berhasil** |
| 5 | Tautan kelas tidak valid | GET /api/join/token-tidak-ada | 404, Link kelas tidak valid | 404 Link kelas tidak valid. | **Berhasil** |
| 6 | Nomor absen melebihi jumlah siswa | Kelas 5 siswa: daftar dengan nomor 6 | 400, ditolak | 400 Nomor absen di kelas ini hanya 1–5. | **Berhasil** |
| 7 | Terima / Pilih lain / Bukan semua tercatat | 3 keputusan dari 1 siswa, lalu buka detail kelas | Masing-masing tercatat 1 (Menerima, Merevisi, Menolak) | kode [201, 201, 201], rekap {'accept': 1, 'correct': 1, 'override': 1} | **Berhasil** |
| 8 | Nomor absen sama dari perangkat lain | Daftar ulang nomor 1 dengan nama lain | Tetap 1 siswa (ID sama), nama diperbarui | ID 1→1, siswa ['Andi Saputra'] | **Berhasil** |
| 9 | Export data per kelas | Superadmin: export CSV & ZIP; guru: export CSV | CSV 3 baris data, ZIP berisi data.csv + 3 PNG; guru ditolak (403) | CSV 200 (3 baris), ZIP 200 (3 PNG), guru 403 | **Berhasil** |
| 10 | Hapus kelas | Guru: DELETE /api/classes/{id}, lalu buka kelas & tautannya | 204; kelas dan tautannya tidak ditemukan lagi (404) | hapus 204, kelas 404, tautan 404 | **Berhasil** |

**10 dari 10 skenario berhasil.**

## Waktu respons POST /predict

Gambar uji: tangga (5 goresan). Diukur dari klien (termasuk jaringan), 50 percobaan per target setelah 1 permintaan pemanasan.

| Target | Berhasil | Rata-rata (ms) | Median (ms) | Min (ms) | P95 (ms) | Maks (ms) |
|---|---|---|---|---|---|---|
| `http://localhost:8006` | 50/50 | 65.8 | 64.0 | 56.7 | 81.7 | 102.9 |
| `https://<quick-tunnel-redacted>.trycloudflare.com` | 50/50 | 222.4 | 193.8 | 175.5 | 394.8 | 519.1 |
