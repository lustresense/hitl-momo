# Arsip sumber Dias @ `94120d4`

Isi folder ini bukan kode aktif. Ia ada supaya tidak ada file Dias yang hilang saat migrasi.

| File | Isi | Cara memulihkan |
|---|---|---|
| `files-not-in-monorepo.tar.gz` | 51 file dari `MuhammadDias/HITL@94120d46` yang blob-nya tidak ada di riwayat monorepo, byte-exact (`git archive`) | `tar xzf files-not-in-monorepo.tar.gz -C /tmp/dias` |
| `frontend-implementation-dias-delta-81bab5e..94120d4.patch` | Edit Dias di `frontend/implementation/` (area Can) yang **tidak** di-port | `git apply --check` di branch Can, hanya setelah Can menyetujui |
| `worktree-DOKUMENTASI-TEKNIS.uncommitted.patch` | Perubahan `docs/DOKUMENTASI-TEKNIS.md` di working tree Dias yang belum di-commit saat migrasi | `patch contexts/dias/docs/DOKUMENTASI-TEKNIS.md < ...` |

Status per file: `docs/migration/dias-94120d4/MANIFEST.csv`.
