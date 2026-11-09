# PORT_AUDIT — 50 file donor Dias bertanda PORT_NEEDED

Donor: `docs/history/dias/frontend-implementation-donor/` (Dias `frontend/implementation`, SHA `81bab5e`).
Pembanding: `frontend/implementation/` (Can, SHA `d4bbaec`). Perbandingan per file dengan `cmp` dan `diff`.

## Hasil

| Kategori | Jumlah | Keputusan |
|---|---|---|
| Identik dengan file Can di path yang sama | 40 | Tidak ada yang diport. Status `DUPLICATE_VERIFIED`. |
| Ada di Can, Can lebih baru (lebih banyak baris) | 9 | Can dipertahankan. Baris khusus donor ditinjau (lihat di bawah). Status `SUPERSEDED_BY_CAN`. |
| Tidak ada di Can (`src/classroom/session.ts`) | 1 | Fungsi classroom sudah dipetakan ke modul Can (lihat tabel fitur). Status `SUPERSEDED_BY_CAN`. |

Tidak ada fitur penting yang hilang. Yang tidak diport sengaja: baris donor yang tidak lagi berguna dengan backend ini.

## 9 file yang berbeda: baris khusus donor

| File | Baris khusus donor | Keputusan |
|---|---|---|
| `src/app/hooks/useLevelSession.ts` | `withClassRecording` untuk merekam keputusan kelas | Fungsinya sudah ada lewat `SubmissionAdapter` + outbox (`classContext`). Versi donor tidak punya retry dan idempotensi. Tidak diport. |
| `src/prediction/partner-http-provider.ts` | Membaca header `X-Model-Version` dari respons | Backend tidak mengirim header itu (`grep` di `backend/app` kosong). Tidak diport. Bisa diport bila Dias menambahkannya. |
| `src/input/mediapipe-input.ts` | Import `evaluateGesture` dari `./hand-gesture` | Can punya `hand-gesture.ts` dan logika input sendiri. Tidak diport. |
| `src/prediction/validation.ts` | Refactor kecil (`return {`) | Bukan fitur. Can dipertahankan. |
| `e2e/mediapipe-probe.mjs`, `tests/prediction/*.test.ts` (4 file) | Versi lebih lama | Can punya lebih banyak tes. Tidak diport. |
| `src/prediction/model-contract.ts` | 2 baris beda | Can dipertahankan. |

## Modul `src/classroom/session.ts` (donor) → pengganti di Can

| Fungsi donor | Pengganti di Can |
|---|---|
| `captureClassToken` (baca token dari URL) | `useClassroomSession`: parameter `join`, `join_token`, dan `kelas` (alias yang dipakai dashboard) |
| `fetchClassInfo` | `ClassroomClient.getClassInfo` |
| `joinClass` | `ClassroomClient.joinStudent` (sekarang menerima `student_session_token`) |
| `readClassStudent` (simpan sesi siswa) | `StudentSessionStore` (sessionStorage) |
| `withClassRecording` (rekam keputusan) | `SubmissionAdapter` + `OutboxQueue` (retry, `submission_key`, idempotensi) |
| `errorDetail` (pesan error dari server) | `http-client.ts` membaca `detail` (sudah ada) |

## Perubahan yang ditemukan saat audit

- Outbox Can tidak pernah memanggil `process()` setelah enqueue. Hanya event `online` yang memicunya, jadi keputusan kelas tidak terkirim. Diperbaiki: `enqueue*` memanggil proses, dan retry dijadwalkan setelah backoff. Test: `tests/api/outbox-delivery.test.ts`.
- Link dari dashboard memakai `?kelas=`, sedangkan game hanya membaca `join` dan `join_token`. Diperbaiki: `kelas` juga diterima.
