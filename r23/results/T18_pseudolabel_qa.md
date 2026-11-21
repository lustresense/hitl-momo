# FX10 — T18 Pseudo-label Gelap Asli QA Report

**Model Winner FX09**: `/home/deano/monui7-local/data/runs/fx_v0a/weights/best.pt`
**Consensus IoU Threshold**: `0.6`
**MediaPipe Task Model**: `/home/deano/monui7-local/work/frontend/implementation/public/models/hand_landmarker.task`
**Output Directory**: `/home/deano/monui7-local/data/yolo/monui7_hand_v1_dark_real`

## 1. Summary of Generated Dataset

- **Train Images**: 1100 (1463 boxes)
- **Test Images**: 117 (147 boxes)
- **Proposals Log**: `/home/deano/monui7-local/data/meta/t18/p1.jsonl` and `/home/deano/monui7-local/data/meta/t18/p2.jsonl`

## 2. QA Per Source (Target >= 95% Precision)

| Sumber | Sampel Kotak | Kotak Benar | Presisi | Status | Contact Sheet |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `bxr7` | 200 | 200 | **100.0%** | **DITERIMA** | `r23/results/FX10_qa_contact_bxr7.jpg` |
| `handgesture_5g` | 166 | 166 | **100.0%** | **DITERIMA** | `r23/results/FX10_qa_contact_handgesture_5g.jpg` |
| `natural_rgb` | 200 | 200 | **100.0%** | **DITERIMA** | `r23/results/FX10_qa_contact_natural_rgb.jpg` |

## 3. Checklist Selesai

- [x] Semua sumber berstatus DITERIMA (presisi >= 95%)
- [x] P1 (MediaPipe + Enhance fallback) dieksekusi dan disimpan
- [x] P2 (YOLO v0a winner conf >= 0.25) dieksekusi dan disimpan
- [x] Konsensus IoU >= 0.6 berhasil digabungkan
- [x] Setiap gambar tersimpan memiliki label tidak kosong
