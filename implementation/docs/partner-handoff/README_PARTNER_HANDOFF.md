# Partner Handoff — Sketchbook Universe Model Adapter

## Freeze Status: 1 November 2026 Ready
Dokumen ini merupakan ringkasan resmi serah terima teknis (partner handoff) antara tim pengembang gameplay/author-side dan tim AI Model Classifier Partner.

---

## Ringkasan Eksekutif Kontrak Wire-Level

1. **Input Sketsa (Author → Partner):**
   - HTTP `POST` JSON dengan payload `{ drawing: DrawingInput }`.
   - Koordinat titik coretan (`strokes`) dinormalisasi ke rentang unit `[0.0, 1.0]` dengan bounding box minimum di `(0.0, 0.0)` dan bounding box maksimum di `(1.0, 1.0)`.
   - Rasio aspek asli kanvas disertakan pada `aspectRatio` (`width / height`).
   - Flag `hasInk` menyatakan ada minimal 1 stroke dengan >= 2 titik.

2. **Output Prediksi (Partner → Author):**
   - HTTP `200 OK` JSON dengan payload `{ candidates: [ { label, confidence }, ... ] }`.
   - Tepat **Top-3 kandidat** terurut menurun berdasarkan confidence.
   - Nilai confidence bertipe floating-point dalam batas aman `0.0 <= confidence <= 1.0`.

3. **Pemisahan Bersih MOCK vs REAL:**
   - **MOCK Provider:** `MockPredictionProvider` berjalan lokal di peramban, deterministik (berbasis hash geometri FNV-1a), berlabel `DEV / MOCK`.
   - **REAL Provider:** `PartnerHttpPredictionProvider` memanggil endpoint eksternal partner via fetch, berlabel `DEV / PARTNER ADAPTER`.
   - Pergantian penyedia dilakukan via Dependency Injection / konfigurasi environment variable (`NEXT_PUBLIC_PREDICTION_MODE=partner`) tanpa mengubah logika aplikasi.
   - Tidak ada skema database baru atau penyimpanan persisten backend yang diada-adakan; semua inferensi bersifat transien.

4. **Status DRAFT:**
   - Semua parameter operasional yang belum disepakati bersama partner (skema token otentikasi, SLA latensi, metadata versi model) ditandai secara eksplisit sebagai **[DRAFT]**.

---

## Berkas Terkait Kontrak

| Berkas | Deskripsi |
|--------|-----------|
| `docs/partner-handoff/MODEL_INTEGRATION_CONTRACT.md` | Spesifikasi detail payload request/response wire schema, SLA, aturan normalisasi, dan penanganan error. |
| `docs/partner-handoff/LEVEL_LABEL_BEHAVIOR_MATRIX.md` | Matriks pemetaan label model ke perilaku dunia fisik (*Solid*, *Danger*, *Fallback*) untuk Stage 1–3. |
| `src/prediction/model-contract.ts` | Definisi TypeScript, skema validasi runtime, konstanta batas, dan helper verifikasi kontrak. |
| `tests/prediction/partner-contract.test.ts` | Rangkaian pengujian otomatis untuk memverifikasi kepatuhan terhadap kontrak wire-level. |

---

## Verifikasi Kesiapan (Author-Side)

Jalankan perintah berikut di lingkungan sandbox:
```bash
# Menjalankan pengujian kontrak partner
npm test tests/prediction/partner-contract.test.ts

# Menjalankan verifikasi tipe TypeScript
npm run typecheck
```
