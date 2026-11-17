# NUI-REVISION R17-01 REV4 — handoff teknis (0.24.0-alpha)

Evidence class: **UNIT** (vitest), **DATASET** (HaGRIDv2 landmark publik), **BUILD** (tsc/lint/next build). **WEBCAM: NOT_TESTED.** Tidak ada perubahan di `DECISIONS.md`, `.task` MediaPipe, mapping game, atau auto-lock selain satu perbaikan komparator.

## Status per ID

| ID | Status | Bukti |
|---|---|---|
| R17-01 diagnostik | DONE (lab) | `GestureDiagnostics` di `NuiLabPage.tsx` (19 baris `data-testid="lab-diag-*"`), `LabDiagnostics` di `lab-analyzer.ts`, 3 tes page |
| R17-02 lima jari / Hapus | DONE (lab) | aturan jempol lateral beraspek, penghapus segmen, status Hapus jujur; DATASET `four` 84.4%→0.2%, `palm` 54.7%→100% |
| R17-03 swipe Undo/Redo | DONE (lab, kandidat uji, bukan keputusan) | `lab-swipe.ts` FSM, 17 tes + 5 e2e; mapping satu jari kiri = Undo, dua jari kanan = Redo hanya untuk uji |
| R17-04 tiga jari terbaca empat | DONE (lab) | `three` count-3 16.8%→98.3% |
| R17-05 pinch prematur | DONE (lab) | gerbang lab 0.30/0.42 + geometri beraspek; 0 titik tinta pada jempol 0.4-0.6 span (baseline 34) |
| RD-00 | DONE | `docs/nui-rd/R17_NUI_RD_SOURCE_AUDIT.md` |
| RD-01 | DONE sebagian | HaGRIDv2 + IPN HandS anotasi diunduh; IPN HandS landmark **BLOCKED** (Drive quota) |
| RD-02 | perekam + fixture sintetis DONE; data nyata NOT_TESTED | `lab-recorder.ts`, 19 tes |
| RD-03 | DONE (DATASET) | `docs/nui-rd/R17_NUI_CLASSIFIER_AB_REPORT.md` |
| RD-04 | DONE (artefak ada, di luar Git) | LR 513 param, MLP 6,025 param, paritas 2.6e-7 |
| RD-05 | DATASET DONE, PROMISING (terbatas); webcam NOT_TESTED | false Hapus MLP 0.04%, revisi 2.01%, baseline 5.43% |
| RD-06 | TIDAK DIMULAI | syarat footage webcam belum ada |

## Cara melanjutkan (urutan yang disarankan)

1. Owner uji webcam di `/nui-lab/gesture`: nyalakan panel "Rekam angka landmark", centang persetujuan, rekam kasus THREE / FIVE / PINCH_NEAR / PINCH_TOUCH / NO_GESTURE, unduh JSON.
2. Jalankan ulang `scripts/nui-rd/rd05_ab.ts` pada fitur dari rekaman itu (adaptasi `rd_features.ts`; skema di `R17_NUI_LABEL_SCHEMA.md`).
3. Hanya bila hasil webcam lolos anggaran `scripts/nui-rd/rd05_budget.json`, buka RD-06 (switch A/B lab). Promosi ke gameplay butuh izin Owner terpisah.
4. Ulang unduh IPN HandS landmarks bila kuota Drive pulih (perintah di `R17_NUI_DATASET_FEASIBILITY.md`).

## Risiko yang diketahui (jangan disembunyikan)

- Tangan alami terbuka (`no_gesture`) tetap erase-eligible 33.8% pada aturan revisi (per gambar). Hapus nyata masih butuh pose stabil + rearm, efek temporal tidak terukur.
- Aturan jempol baru menaikkan Hapus pada `grabbing` 1.6%→18.0%, `grip` 0.6%→4.4%, `ok` 0%→3.2%.
- Pose `thumb-up` repo membaca 82% `fist` HaGRID sebagai jempol-atas (di kedua aturan): risiko jempol-konfirmasi, tidak diubah.
- Weights pilot tidak di Git (lisensi HaGRID variant belum terbaca, PDF 403). Checksum ada di laporan.
- 22 tes gagal pra-ada di main (8 file) tidak terkait dan tidak disentuh; himpunan namanya identik sebelum dan sesudah.
