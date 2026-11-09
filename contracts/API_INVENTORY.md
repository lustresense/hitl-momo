# API Inventory — Sketchbook Universe

Sumber: router FastAPI di `backend/app/` (`main.py`, `classroom.py`, `dashboard.py`). Skema live diekspor ke `contracts/openapi.json` (18 path).
Status: `EXISTING` = ada di source dan diuji. `PROPOSED` = belum ada di source.

## Endpoint game (dipakai client Can)

| Method | Path | Status | Auth | Consumer | Catatan |
|---|---|---|---|---|---|
| GET | `/health` | EXISTING | none | ops | `{"status":"ok"}` |
| POST | `/predict` | EXISTING | none | Can `partner-http-provider` | body `{"drawing": {...}}`; respons `{"candidates": [3 item]}`. Model asli dari `MODEL_PATH`. `prediction_id` belum dikirim. |
| GET | `/api/join/{token}` | EXISTING | token kelas di path | Can `classroom-client.ts` | info kelas + `taken_numbers` |
| POST | `/api/join/{token}/students` | EXISTING | token kelas di path | Can `classroom-client.ts` | body `{number, name}`. Respons: `student_id`, `number`, `name`, `class_name`, **`student_session_token`**, `expires_in` (28800), `joined_at`. Token disimpan sebagai SHA-256. |
| POST | `/api/submissions` | EXISTING | **`Authorization: Bearer <student_session_token>`** | Can `submission-client.ts` | body `submission_key` (wajib, idempoten per siswa), `join_token`, `student_id`, `level_id`, `attempt_id?`, `prediction_id?`, `strokes`, `candidates` (tepat 3), `decision_type`, `source_rank?`, `final_label`, `redraw_count?`. Respons **201** `{id, status:"created"}`, atau **200** `{id, status:"duplicate"}` bila key sudah ada. 401 tanpa/salah token, 403 bila token bukan milik murid/kelas tersebut. |
| PATCH | `/api/submissions/{id}/outcome` | EXISTING | Bearer (pemilik submission) | Can `submission-client.ts` | body `{outcome: success\|fail, behavior: solid\|danger\|unresolved, retry_count?}`. Respons 200 `{id, status:"updated"}`. 404 bila submission bukan milik sesi ini. |

## Endpoint dashboard (dipakai admin Dias)

| Method | Path | Status | Auth |
|---|---|---|---|
| POST | `/api/auth/login` | EXISTING | email + password → `token` (Bearer) |
| GET | `/api/auth/me`, POST `/api/auth/logout` | EXISTING | Bearer |
| GET/POST | `/api/schools`, GET `/api/schools/{id}`, POST `/api/schools/{id}/admins` | EXISTING | superadmin |
| GET/POST | `/api/classes`, GET/DELETE `/api/classes/{id}` | EXISTING | Bearer |
| GET | `/api/classes/{id}/submissions` | EXISTING | Bearer. Kolom: `id, level_id, decision_type, source_rank, final_label, candidates, created_at, student_id, student_number, student_name` |
| GET | `/api/submissions/{id}/image.png` | EXISTING | Bearer atau `?token=` |
| GET | `/api/classes/{id}/export.csv`, `export.zip` | EXISTING | Bearer |

## Belum ada (PROPOSED)

| Method | Path | Catatan |
|---|---|---|
| GET | `/api/v1/model-info` | Ada di client (`getModelInfo`) tetapi tidak dipanggil di alur mana pun. Tetap PROPOSED. |

Gap yang tercatat: `prediction_id` dan `model_version` belum dihasilkan backend. Kolom `prediction_id` di submission tersimpan `NULL` untuk alur saat ini.

## Perubahan kontrak pada iterasi ini (atas instruksi pemilik)

1. Join sekarang mengembalikan `student_session_token` (sebelumnya tidak ada).
2. `POST /api/submissions` wajib Bearer token dan `submission_key`. Sebelumnya keduanya tidak ada.
3. `PATCH .../outcome` diimplementasikan (sebelumnya 404).
4. CORS: origin dibatasi lewat env `CORS_ORIGINS`. `allow_credentials=False`. Sebelumnya `*` dengan credentials.

Perubahan 1–3 bersifat aditif untuk respons, tetapi wajib auth untuk request. Persetujuan formal Can dan Dias untuk perubahan breaking ini belum ada (lihat `UNRESOLVED.md`).

## Risiko yang masih ada

- `/predict` tanpa auth.
- Sesi admin (`sessions` di `db.py`) menyimpan token mentah, bukan hash.
- `load_model(..., safe_mode=False)`.
