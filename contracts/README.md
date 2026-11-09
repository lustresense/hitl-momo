# Contracts — aturan REST bersama

Folder ini berisi kontrak REST antara game Can (client) dan backend Dias (server).

## Isi

- `API_INVENTORY.md` — daftar endpoint dengan status `EXISTING` atau `PROPOSED`. Hanya endpoint yang ditemukan di source FastAPI yang ditandai `EXISTING`.
- `openapi.json` — diekspor dari aplikasi FastAPI live (`tests/integration/verify_backend.py` menulis ulang file ini). Jangan diedit tangan.
- `fixtures/` — belum dibuat. Fixture di kandidat `test` tidak diimpor karena belum divalidasi terhadap source.

## Aturan

1. Endpoint baru atau perubahan skema tidak boleh ditulis sebagai existing tanpa verifikasi di source dan runtime.
2. Perubahan breaking (menghapus field, mengubah tipe, mengubah path, menambah field wajib) butuh persetujuan **Can dan Dias**.
3. Client tidak boleh mengirim field yang tidak ada di skema tanpa koordinasi. Backend memakai Pydantic, jadi field tambahan diabaikan dan tidak tersimpan.
4. Setiap perubahan skema diikuti pembaruan `openapi.json` dan `API_INVENTORY.md`.

## Status saat ini

Kontrak **belum cocok** untuk alur classroom. Probe ada di `tests/integration/probe_client_contract.py`. Detail di `API_INVENTORY.md` dan `docs/migration/UNRESOLVED.md`.
