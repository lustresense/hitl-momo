# Laporan Evaluasi dan Adopsi Model YOLO26n v1 (FX11 / T19)

**Tanggal:** 2026-11-21 WIB  
**Model:** `yolo26n.pt` (CLI `yolo detect train`)  
**Run Name:** `fx_v1`  
**Base Weights:** `yolo26n.pt` (SHA256: `9fa733d31fe186e2ebae986d0ee35fcb9ef9c222ffda9ae4ad44d6786a347b2c`)  
**Data Training:** `monui7_hand_v1.yaml` (101.844 train v0 + 1.100 train dark real = 102.944 gambar)  
**Hardware:** GPU 0 (NVIDIA RTX A5000 24GB)  

---

## 1. Verifikasi Identitas Model & Pelatihan
* Perintah CLI:
  ```bash
  yolo detect train model=yolo26n.pt data=$DATA_ROOT/yolo/monui7_hand_v1.yaml imgsz=320 epochs=60 patience=15 batch=128 workers=3 seed=20261120 device=0 project=$DATA_ROOT/runs name=fx_v1 single_cls=True
  ```
* Bukti `args.yaml`:
  ```yaml
  model: yolo26n.pt
  ```
* Status: 60 epochs tuntas (`exit 0`), best epoch 48 (mAP50 = 0.82141).

---

## 2. Hasil Evaluasi Test Split Utama (13.147 gambar, 18.412 GT boxes)

Evaluasi dilakukan menggunakan `r23/detector/eval_by_source_and_luma.py` (IoU 0.5, conf 0.35) persis sama dengan evaluasi v0a di FX09:

| Metrik / Subset | `fx_v0a` (Baseline) | `fx_v1` (Kandidat) | Delta |
| :--- | :--- | :--- | :--- |
| **Overall Recall** | **80.58%** (14.837 / 18.412) | **78.26%** (14.410 / 18.412) | -2.32 pts |
| **HaGRID Test** | **99.35%** (6.271 / 6.312) | **99.00%** (6.249 / 6.312) | -0.35 pts |
| **HANDS Test** | **98.90%** (2.077 / 2.100) | **98.48%** (2.068 / 2.100) | -0.42 pts |
| **IPN Test** | **75.43%** (3.875 / 5.137) | **75.32%** (3.869 / 5.137) | -0.11 pts |
| **Open Images Test**| **53.75%** (2.614 / 4.863) | **45.73%** (2.224 / 4.863) | -8.02 pts |
| **B0 ($Y < 0.08$)** | **59.38%** (95 / 160) | **54.37%** (87 / 160) | -5.01 pts |
| **B1 ($0.08 \le Y < 0.15$)** | **81.38%** (686 / 843) | **78.77%** (664 / 843) | -2.61 pts |
| **B2 ($0.15 \le Y < 0.30$)** | **63.85%** (1.688 / 2.644) | **58.77%** (1.554 / 2.644) | -5.08 pts |
| **B3 ($Y \ge 0.30$)** | **84.09%** (11.811 / 14.046) | **81.98%** (12.105 / 14.765) | **-2.11 pts** |

---

## 3. Hasil Evaluasi Set Test Gelap Asli (`dark_real`, 117 gambar, 147 GT boxes)

| Model | Total GT | TP | FN | Recall |
| :--- | :--- | :--- | :--- | :--- |
| **`fx_v0a`** | 147 | 145 | 2 | **98.64%** |
| **`fx_v1`** | 147 | 138 | 9 | **93.88%** |
| **Delta** | - | -7 | +7 | **-4.76 pts** |

---

## 4. Keputusan Adopsi Model (Aturan Mandat v1.2.0 §4 FX11)

**Syarat Adopsi v1:**
1. Recall gelap asli naik vs `fx_v0a` ($> 98.64\%$).
2. Recall B3 turun $\le 1$ poin vs `fx_v0a` ($\ge 83.09\%$).

**Hasil Verifikasi:**
1. Recall gelap asli: $93.88\%$ vs $98.64\%$ (**TURUN 4.76 poin** $\rightarrow$ **GAGAL**).
2. Recall B3: $81.98\%$ vs $84.09\%$ (**TURUN 2.11 poin**, melebihi toleransi $\le 1$ poin $\rightarrow$ **GAGAL**).

**Keputusan Final: `fx_v1` DITOLAK (REJECTED).**  
Model rilis final dipertahankan dari pemenang FX09: **`fx_v0a`**.  
Release model: `$DATA_ROOT/release/monui7-hand-yolo26n-320.onnx` (`modelVersion: fx_v0a`, SHA256: `97f778ea77f4dbf160e91dff021a463ab464cdbf27a34d067d5f28708dbf1ddb`).
