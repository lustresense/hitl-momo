# R23B-HF3 & W-TRAIN (`hf3_v2pre`) — Review Bundle

Semua dokumen review, bukti JSON, diff perubahan kode HF3, skrip verifikasi browser, dan metadata training `hf3_v2pre` dikumpulkan di satu folder ini (tanpa file biner model `.onnx`/`.pt` maupun raw export >2 MB).

## Daftar File di Folder Ini

### 1. Ringkasan & Laporan
- [`HF3_v2pre_report.md`](./HF3_v2pre_report.md) — Laporan lengkap training paralel W-TRAIN (`T-A` s/d `T-F`: paritas `A4v2`, dataset, kurva training, evaluasi recall per bin luma, paritas ONNX).
- [`APPLY.md`](./APPLY.md) — Panduan apply patch & build DEV untuk Ujang (`NEXT_PUBLIC_APP_VERSION="0.29.3-alpha+r23b-monui7-hf3"`, model app tetap `97f778ea…`).
- [`../../LOG.md`](../../LOG.md) — Entri ledger `R23B-HF3` (bagian paling atas).

### 2. Bukti Angka & Tes Otomatis (JSON)
- [`T28_final_gates.json`](./T28_final_gates.json) — Hasil 5 gate final (`tsc` 0 error, `lint` 0 error, `vitest` 31/31 file / 325/325 pass, gameplay 39 PASS / 9 FAIL, `npm run build` 24 halaman).
- [`HF3_browser_check.json`](./HF3_browser_check.json) — Hasil cek headless Chromium (kamera palsu normal + video gelap Y4M dengan `PREPROCESS_AUTO_ON` & `103/108` frame `A4_denoise_reinhard320`).
- [`HF3_v2pre_metrics.json`](./HF3_v2pre_metrics.json) — Metrik evaluasi lengkap `fx_v0a` vs `hf3_v2pre` (test standar & test gelap FX06+A4v2).

### 3. Diff Kode, Checksum & Skrip Tes
- [`r23_incremental_35da19a_to_3680cd9.patch`](./r23_incremental_35da19a_to_3680cd9.patch) — Diff inkremental khusus perubahan HF3 dari HF2.1 (`190 KB`, paling ringkas untuk code review).
- [`SHA256SUMS.txt`](./SHA256SUMS.txt) — Daftar SHA-256 semua patch kandidat & `APPLY.md`.
- [`verify_browser_hf3.mjs`](./verify_browser_hf3.mjs) — Skrip headless Chromium yang menghasilkan `HF3_browser_check.json`.
- Patch kumulatif (`745bb6d -> 3680cd9`, `4.0 MB`, SHA-256 `0bda221ae8e7a5869e658973f078906d78007ff65efe06adec70f82f4de9d778`): [`../../r23/candidates/monui7/r23_main-745bb6d_to_3680cd9.patch`](../../r23/candidates/monui7/r23_main-745bb6d_to_3680cd9.patch).

### 4. Metadata Kandidat Model `hf3_v2pre` (Tanpa Biner Model)
- [`hf3_v2pre_model_meta.json`](./hf3_v2pre_model_meta.json) — Metadata, SHA-256, dan spesifikasi tensor kandidat ONNX.
- [`hf3_v2pre_results.csv`](./hf3_v2pre_results.csv) — Log metrik per epoch (`epochs 1..20`, best epoch 16: `mAP50=0.82534`, `mAP50-95=0.57952`).
- Lokasi biner kandidat (`.onnx` `9.28 MiB` & `best.pt` `5.2 MiB`, tidak di-commit ke git): `D:\monui7-data\release\r23b_hf3_v2pre\` (`/home/deano/mnt/monui7-data/release/r23b_hf3_v2pre/`).

---

## Ringkasan Cepat

- **Candidate Commit (`$WORK`):** `3680cd94eff693690b02614bab162cd4a1f4a3f0` (`3680cd9`)
- **Tree Hash:** `fe0b8b6e5d2cb7823db9090b61ac1abfd531dd59`
- **App Version:** `0.29.3-alpha+r23b-monui7-hf3`
- **Preprocess Mode:** `A4v2` (`A4_denoise_reinhard320`, histeresis `< 0.15 / 1s` ON, `> 0.22 / 2s` OFF)
- **W-TRAIN T-D Recall:** Standar `80.58% -> 80.00%` (`-0.58 pp`, PASS ≤ 1 pp); Gelap FX06+`A4v2` `57.86% -> 69.93%` (`+12.07 pp`; B0 `+20.18 pp`, B1 `+18.39 pp`).
