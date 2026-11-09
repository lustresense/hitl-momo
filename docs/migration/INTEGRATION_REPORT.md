# INTEGRATION_REPORT — acceptance A01–A18 (iterasi 2)

**Tanggal:** 2026-11-09. **Mode:** staging lokal. Branch `claude-monorepo` di `lustresense/hitl-momo`, di atas `can` (`d4bbaec`). `main`, `can`, dan repo Dias tidak diubah.
**Sumber:** Can `d4bbaec`, Dias `81bab5e`. Pin di `SOURCE_MANIFEST.md`.

Legenda status: `PASS`, `FAIL`, `PARTIAL`, `BLOCKED`, `NOT_TESTED`. Kelas bukti: `REAL_MODEL` (bobot asli), `MOCK_MODEL` (provider mock), `UNIT_ONLY`, `STATIC_ONLY`, `NOT_TESTED`.

## Ringkasan

| Status | Gate |
|---|---|
| PASS | A01, A02, A03, A04, A05, A06, A07, A08, A09, A10, A11, A12, A13, A14, A15, A16 |
| PARTIAL | A17 (Caddy dan compose config PASS; build image BLOCKED), A18 (keamanan diperbaiki, sisa risiko tercatat) |
| FAIL | — |

Gate yang sebelumnya FAIL (A04, A11) sekarang PASS, dengan bukti E2E dan test kontrak. Perubahan kontrak perlu persetujuan formal Can dan Dias (lihat `UNRESOLVED.md`).

## Tabel gate

| ID | Gate | Status | Kelas | Bukti |
|---|---|---|---|---|
| A01 | Empat sumber dipin | PASS | STATIC_ONLY | `SOURCE_MANIFEST.md` |
| A02 | Zero-loss mapping | PASS | STATIC_ONLY | `SOURCE_MAP.csv`: setiap file tracked sumber tepat satu baris. `PORT_NEEDED` 50 → `DUPLICATE_VERIFIED` 40 + `SUPERSEDED_BY_CAN` 10. `BLOCKED_SECRET` → `IMPORTED` (instruksi pemilik). `REVIEW_REQUIRED` 1 (`frontend/package-lock.json`). |
| A03 | Game Can terbaru + tes | PASS | UNIT_ONLY | Typecheck exit 0. `vitest run`: **104 file / 681 test PASS**. Diff dari `can`: lihat "Perubahan kode" di bawah. |
| A04 | Fitur classroom donor tidak hilang | PASS | REAL_MODEL + UNIT_ONLY | `PORT_AUDIT.md`: tiap fungsi `session.ts` punya pengganti. E2E classroom 17/17 (join, predict, submit, DB, dashboard). |
| A05 | Backend/admin/train/weights utuh | PASS | STATIC_ONLY | `git diff origin/claude-monorepo -- weights` kosong. Perubahan backend hanya di `classroom.py`, `db.py`, `main.py`, dan `verify_backend.py`. |
| A06 | Satu changelog aktif | PASS | STATIC_ONLY | `CHANGELOG.md` root. Arsip di `docs/history/`. |
| A07 | Governance Can bukan global | PASS | STATIC_ONLY | `AGENTS.md` root netral. `contexts/can/AGENTS.md` = router + kebijakan asli. `DECISIONS.md` Can tidak diubah. |
| A08 | Tidak ada `CLAUDE.md` | PASS | STATIC_ONLY | `git ls-files` dan `find`: 0 file bernama `CLAUDE.md`. |
| A09 | README sesuai repo | PASS | — | Setiap command di README dijalankan (lihat README). |
| A10 | HTTP contract sesuai source | PASS | REAL_MODEL | `openapi.json` diekspor dari app live (18 path). `API_INVENTORY.md` diperbarui. |
| A11 | Client–server schema cocok | PASS | UNIT_ONLY + REAL_MODEL | Fixture `contracts/fixtures/` dipakai dua sisi: test Python 14/14 (`test_classroom_contract.py`) dan test Can `contract-fixtures.test.ts` 3/3. Probe runtime 20/20. `prediction_id` belum dihasilkan backend (lihat gap). |
| A12 | Build frontend Can | PASS | STATIC_ONLY | `npm run build` exit 0 (mock dan partner). |
| A13 | Backend import/tes/model | PASS | REAL_MODEL | `pytest` 14/14. `verify_backend.py` 20/20 dengan bobot asli (`REAL_MODEL`). Tidak ada suite pytest lain di repo. |
| A14 | Dashboard build dan routing | PASS | REAL_MODEL + STATIC_ONLY | Typecheck dan build exit 0. Via Caddy: `/admin/login` dan `/admin/kelas/1` 200. Login dan halaman kelas di browser: PASS (E2E). |
| A15 | Classroom E2E join → submit → DB → dashboard | PASS | REAL_MODEL | `classroom-e2e.mjs`: **17/17 PASS** langsung dan lewat Caddy. Log di `docs/migration/evidence/classroom/`. |
| A16 | Gameplay HITL tidak regresi | PASS | MOCK_MODEL | `normal-journey.mjs`: 3 level PASS, `consoleErrors=0`. `recovery-paths.mjs`: 16/16 PASS. Prediksi mock. |
| A17 | Deployment wiring | PARTIAL | STATIC_ONLY + runtime Caddy | `docker compose config` exit 0. **Caddy 2.10.2 asli** memvalidasi `deploy/Caddyfile` dan melayani `/`, `/level1`, `/onboarding/number`, `/admin/*`, `/api/*`, `/predict`, `/health` (smoke test). Build image **BLOCKED**: daemon Docker tidak tersedia. |
| A18 | Keamanan dan reproducibility | PARTIAL | STATIC_ONLY | Lihat "Keamanan" di bawah. |

## Perbaikan setelah audit untuk `main` (iterasi 3)

Tiap perbaikan diawali test yang gagal (RED), lalu kode minimal (GREEN).

**Game (Can):**
- `outbox.ts`: job yang tertinggal di `sending` (tab ditutup saat kirim) dikirim ulang lewat `resume()`, dipanggil saat aplikasi mulai. Aman, server memakai `submission_key`.
- `outbox.ts`: job yang diblokir 401 (sesi habis) menyimpan `lastErrorCode` dan dikirim ulang lewat `requeueUnauthorized()` setelah siswa bergabung lagi. Job yang ditolak 422 tetap diblokir.
- `outbox.ts`: outcome yang menunggu submission yang belum terkirim dilewati. Sebelumnya `process()` memutar 20 kali dan membaca penyimpanan 41 kali tanpa hasil.
- `classroom-client.ts` dan `submission-adapter.ts`: token kelas disimpan bersama sesi siswa, dan `classContextFrom()` memakainya bila URL tidak lagi punya query `?kelas=`. Tanpa ini, reload membuat keputusan berhenti terkirim tanpa pesan.
- `submission-adapter.ts` dan `useLevelSession.ts`: kegagalan pengiriman tidak lagi bisa menjadi unhandled rejection di gameplay.

**Backend (Dias):**
- `classroom.py`: sesi siswa kedaluwarsa dihapus setiap kali ada join.
- `main.py`: `/predict` menolak gambar lebih dari 20.000 titik (422). Endpoint ini tidak punya auth.
- `deploy/Caddyfile`: badan permintaan ke backend dibatasi 1 MB.

**Bukti run ulang (bersih, setelah perbaikan):** typecheck game dan dashboard PASS; vitest 104 file / 681 test PASS; pytest 14/14; `verify_backend.py` 20/20 dengan bobot asli; E2E classroom 17/17 lewat Caddy 2.10.2 asli; build game (partner dan mock) dan dashboard PASS.

## Iterasi 4: perbaikan game atas instruksi Owner (2026-11-09)

Dikerjakan oleh tim worker Haiku (effort xhigh), diintegrasikan dan diverifikasi oleh lead. Rincian perubahan: `CHANGELOG.md`. Keputusan yang perlu disahkan Can: `UNRESOLVED.md` bagian E.

| Pemeriksaan | Hasil |
|---|---|
| `tsc --noEmit`, `next lint` | 0 error, bersih |
| `vitest run` | 156 file, 1178 test PASS |
| E2E classroom lewat Caddy, backend model asli | 17/17 PASS |
| E2E gameplay Level 1 sampai 4 dan layar tamat (mock) | PASS |
| E2E recovery paths | 16/16 PASS |
| E2E alur selesai-gambar (diam 5 detik = tanpa tebakan, tahan jempol = tebakan lalu Top-3) | 12/12 PASS |

Bukti: `docs/migration/evidence/iter4/`. E2E menemukan satu bug produk nyata (cincin selesai-gambar tertutup kartu kamera) dan sudah diperbaiki.

**Belum terbukti:** kamera fisik, MediaPipe, dua tangan nyata, kalibrasi ambang gestur, pemetaan kursor ke layar, tampilan di HP. Level 4 lolos di browser pada percobaan ke-3 (jatuh ke duri dua kali), jadi mungkin terlalu ketat untuk siswa. Build image Docker tetap belum dicoba.

## Perubahan kode di iterasi ini

**Backend (Dias):**
- `db.py`: tabel `student_sessions` (token disimpan sebagai SHA-256). Migrasi kolom submission (`submission_key`, `attempt_id`, `prediction_id`, `redraw_count`, `outcome`, `behavior`, `retry_count`, `outcome_at`). Unique index `(student_id, submission_key)`.
- `classroom.py`: join mengembalikan `student_session_token`. `POST /api/submissions` wajib Bearer, idempoten (200 `duplicate`), menolak token milik orang lain (403). `PATCH /api/submissions/{id}/outcome` diimplementasikan.
- `main.py`: CORS dari env `CORS_ORIGINS`, `allow_credentials=False`.
- `docker-compose.yml`: `CORS_ORIGINS: ${PUBLIC_URL}` untuk backend.

**Game (Can):**
- `submission-client.ts`: tipe request dan respons sesuai backend.
- `submission-adapter.ts`: mengirim `join_token`, `student_id`, `candidates`. Tidak mengirim saat tidak di kelas (solo play).
- `outbox.ts`: **bug yang ditemukan dan diperbaiki**. Outbox tidak pernah memproses setelah enqueue. Sekarang `enqueue*` memanggil proses, dan retry dijadwalkan setelah backoff.
- `SketchbookApp.tsx`: konteks kelas lewat `ref` (menghindari closure usang).
- `useClassroomSession.ts`: menerima parameter `kelas` (link dashboard).
- `useLevelSession.ts`: opsi `classContext`.

**Tes baru:** `tests/integration/test_classroom_contract.py` (11), `tests/api/contract-fixtures.test.ts` (3), `tests/api/outbox-delivery.test.ts` (2), `frontend/implementation/e2e/classroom-e2e.mjs`.

## Bukti per item permintaan

1. **A11 dan A04.** Kontrak submission disamakan. Respons `{id, status}`. Endpoint outcome ada. Bukti: test kontrak dan E2E.
2. **Idempotensi.** Unique index DB, respons `duplicate`. E2E menjatuhkan respons pertama setelah server menyimpan, outbox retry, dan hasilnya tetap 1 baris (`rows=1`, `db id = answer id`).
3. **Identitas sesi dan CORS.** Token wajib dan dicek kepemilikannya (401 tanpa token, 403 token orang lain, 401 bila kedaluwarsa). CORS hanya origin yang diizinkan (test: origin asing tidak mendapat `Access-Control-Allow-Origin`). Alur join tetap berjalan (E2E).
4. **Contract test dan classroom E2E.** Lihat tabel A11 dan A15.
5. **Inferensi model asli lewat frontend.** E2E: label Top-3 di UI sama dengan respons `/predict` dari backend dengan bobot asli (`["car","book","cloud"]`). Build game memakai `NEXT_PUBLIC_PREDICTION_MODE=partner`.
6. **Compose, Caddy, API, dashboard.** Compose config PASS. Caddy asli PASS. API dan admin berjalan sebagai proses (admin `node .next/standalone/server.js`, sama seperti Dockerfile). Build image BLOCKED.
7. **Audit donor PORT_NEEDED.** Lihat `PORT_AUDIT.md`. 40 identik, 9 kalah baru dari Can, 1 sudah digantikan. Tidak ada yang diport membabi buta.
8. **Push.** Lihat ringkasan jawaban (diverifikasi dengan `git ls-remote`).

## Yang belum diuji

- Build image Docker dan `docker compose up` (BLOCKED: daemon Docker tidak tersedia).
- Outcome gameplay dari browser (`PATCH .../outcome` dari game sungguhan). Endpoint dan client sudah diuji lewat test, tetapi belum lewat browser. **NOT_TESTED.**
- Kamera fisik dan MediaPipe. Sesuai E2E, fallback tombol dipakai.
- Perilaku retry outbox lebih dari 8 jam (sesi kedaluwarsa, lalu outbox gagal dengan 401).

## Keamanan (A18)

Yang diperbaiki: submission dan outcome butuh token sesi, CORS dibatasi, submission idempoten.

Sisa risiko (tercatat di `UNRESOLVED.md`):
- `/predict` tanpa auth.
- Token sesi admin disimpan mentah di tabel `sessions` (bukan hash).
- `load_model(..., safe_mode=False)`.
- Secret scan pola pada tree final: 0 hit. Dokumen infra masih ada di riwayat branch `can`.

## Artefak

- Log dan bukti: `docs/migration/evidence/`.
- Test: `tests/integration/`, `frontend/implementation/tests/api/`, `frontend/implementation/e2e/classroom-e2e.mjs`.
- Audit: `SOURCE_MAP.csv`, `PORT_AUDIT.md`, `BRANCH_COMPARISON.md`, `SOURCE_MANIFEST.md`.
