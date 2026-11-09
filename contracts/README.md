# Contracts — aturan REST bersama

Kontrak antara game Can (client) dan backend Dias (server).

## Isi
- `API_INVENTORY.md` — endpoint dengan status `EXISTING` atau `PROPOSED`, termasuk auth dan perubahan iterasi ini.
- `openapi.json` — diekspor dari aplikasi FastAPI live oleh `tests/integration/verify_backend.py`. Jangan diedit tangan.
- `fixtures/` — contoh request dan respons yang **dipakai dua sisi**:
  - `submission-request.json`: test Python (`test_classroom_contract.py`) memvalidasi dengan `SubmissionBody`. Test Can (`tests/api/contract-fixtures.test.ts`) memastikan adapter menghasilkan payload yang sama persis.
  - `outcome-request.json`: sama, dengan `OutcomeBody`.
  - `submission-response-created.json`, `submission-response-duplicate.json`, `outcome-response.json`, `join-response.json`: bentuk respons, dipakai sebagai referensi.

## Aturan
1. Endpoint baru atau perubahan skema tidak boleh ditulis sebagai existing tanpa verifikasi di source dan runtime.
2. Perubahan breaking (menghapus field, mengubah tipe atau path, menambah field wajib) butuh persetujuan **Can dan Dias**.
3. Client tidak mengirim field di luar skema. Backend memakai Pydantic, jadi field tambahan diabaikan dan tidak tersimpan.
4. Perubahan skema diikuti pembaruan `openapi.json`, `API_INVENTORY.md`, dan fixture. Test kedua sisi harus tetap hijau.

## Cara menjalankan
- Backend: `python -m pytest tests/integration/test_classroom_contract.py -q` (dari root)
- Client: `npx vitest run tests/api` (dari `frontend/implementation`)
