# Level Label Behavior Matrix — Stage 1–3

## Purpose & Status: FROZEN DRAFT (Handoff 1 November)
Matriks pemetaan antara vocabulary keluaran model classifier partner dan resolusi perilaku gameplay author-side (Solid / Danger / Fallback).

Semua status konfirmasi partner saat ini bertanda [DRAFT / Pending Partner Confirmation]. Tidak ada skema DB backend yang dibuat — matriks ini merujuk langsung ke konfigurasi level di src/domain/levels.ts.

---

## 1. Stage 1 — Foundation (Level: stage-1-foundation)

| Label | Status Partner | Perilaku Gameplay | Deskripsi Efek |
|-------|----------------|-------------------|----------------|
| `papan` | [DRAFT / Pending] | `solid` | Menjadi pijakan datar aman di atas jurang |
| `balok` | [DRAFT / Pending] | `solid` | Menjadi balok pijakan fisik |
| `tangga` | [DRAFT / Pending] | `solid` | Menjadi struktur pijakan miring/tangga |
| `batu` | [DRAFT / Pending] | `danger` | Memunculkan rintangan bahaya / bahaya tabrakan |

- Vocabulary Katalog Stage 1: `papan`, `balok`, `batu`, `tangga`
- Mock Provider Stage Fixture: Stage 1 spread [0.86, 0.09, 0.05]

---

## 2. Stage 2 — Ambiguity / Comparison (Level: stage-2-ambiguity)

| Label | Status Partner | Perilaku Gameplay | Deskripsi Efek |
|-------|----------------|-------------------|----------------|
| `papan` | [DRAFT / Pending] | `solid` | Menjadi pijakan datar aman |
| `balok` | [DRAFT / Pending] | `solid` | Menjadi balok pijakan fisik |
| `tangga` | [DRAFT / Pending] | `solid` | Menjadi struktur pijakan miring |
| `duri` | [DRAFT / Pending] | `danger` | Menjadi jebakan duri tajam berbahaya |

- Vocabulary Katalog Stage 2: `papan`, `balok`, `duri`, `tangga`
- Mock Provider Stage Fixture: Stage 2 spread [0.42, 0.35, 0.23]

---

## 3. Stage 3 — Critical Validation (Level: stage-3-validation)

| Label | Status Partner | Perilaku Gameplay | Deskripsi Efek |
|-------|----------------|-------------------|----------------|
| `tali` | [DRAFT / Pending] | `danger` | Bahaya jeratan / rintangan |
| `papan` | [DRAFT / Pending] | `solid` | Menjadi pijakan stabil |
| `tangga` | [DRAFT / Pending] | `solid` | Menjadi pijakan menuju target tinggi |
| `ember` | [DRAFT / Pending] | `fallback` | Bukan item navigasi langsung; memicu fallback |

- Vocabulary Katalog Stage 3: `papan`, `tali`, `tangga`, `ember`
- Mock Provider Stage Fixture: Stage 3 spread [0.55, 0.38, 0.07]

---

## 4. Mekanisme Resolusi Fallback

Apabila model partner mengembalikan label yang tidak terdaftar dalam behaviorMap level aktif:
1. Engine mencatat peringatan resolusi: Label not in behaviorMap - fallback.
2. Resolusi diarahkan ke `kind: "fallback"` dengan `fallbackLabel = level.vocabulary[0]`.
3. UI menampilkan indikator visual netral/peringatan tanpa merusak siklus permainan.

---

## 5. Union Vocabulary untuk Pelatihan Model Partner

Partner disarankan memasukkan seluruh himpunan label berikut ke dalam kamus deteksi model:
```json
["balok", "batu", "duri", "ember", "papan", "tali", "tangga"]
```
