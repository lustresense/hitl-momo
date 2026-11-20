# Paket R22B (20 Nov 2026)

| File | Untuk | Isi |
|---|---|---|
| `02_MANDAT_AGY_R22B.md` | **Kirim ke Argon (AGY)** | Mandat kerja: workstream B1–B8, kontrak, urutan, acceptance, protokol Owner |
| `01_BUKTI_DAN_PENALARAN_S970.md` | Owner + AGY | Bukti dan penalaran dari tes S-970f4cb0 + video, termasuk cek silang laporan Gemini |
| `s970_t004_handstate_weaklabels_v1.json` | AGY (boleh jadi fixture repo) | 996 frame berlabel lemah, numerik saja (13 hard negative kepal→cubit) |
| `s970-t002-landmark-replay-v1.json` | AGY (boleh jadi fixture repo) | Replay seluruh T002, format sama dengan `t004-real-landmarks.json`, beserta jendela undo dan event asli |
| `eval_fist_pinch_gate.py` | AGY | Reproduksi angka gate G1′ dari fixture |
| `skrip_analisis/` | Jejak audit | Skrip yang dipakai Claude (path masih hardcoded, bukan untuk dijalankan ulang apa adanya) |
| `bukti_khusus_owner/` | **Owner saja** | Potongan frame video (ada kamar dan sebagian wajah). **Jangan** dikirim ke AGY dan jangan masuk repo |

AGY tidak perlu video. Semua yang dibutuhkan AGY ada dalam bentuk angka.
