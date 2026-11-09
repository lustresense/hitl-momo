# Ekstraksi Bahasa Desain Faktual: Onboarding & Sketchbook Universe (Phase 1)

Dokumen ini mendokumentasikan token desain, palet warna, tipografi, dan metafora visual yang diekstrak langsung dari implementasi kanonikal `CameraIntro.tsx` (`prototype-camera.css`) dan `TutorialBrochure.tsx` (`prototype-tutorial.css`) untuk diterapkan secara konsisten ke seluruh alur antarmuka Sketchbook Universe.

---

## 1. Metafora & Arah Visual
- **Buku Sketsa Fisik (Warm Crafted Paper)**: Menghindari estetika SaaS dashboard generik, gradient neon acak, atau dark mode AI blue/purple.
- **Tekstur Lembar Kertas**: Kertas krem hangat dengan pola grid titik (*dot-grid pattern*) mikro sebagai panduan visual menggambar.
- **Garis & Batas (Hand-drawn Ink Feeling)**: Garis batas halus berbahan tinta gelap (*warm charcoal ink*) dengan transparansi alami (`rgba(35, 33, 29, 0.14)`).
- **Karakter Momo**: Pendamping tekstual (*text bubble*) yang ramah, hangat, dan tidak mendominasi panggung.

---

## 2. Palet Warna & Token CSS Kanonikal

### A. Kertas & Latar Belakang (Paper & Canvas)
```css
--paper: #f5efe4;              /* Warna dasar kertas krem hangat */
--paper-light: #f7f5ea;        /* Kertas cerah / isi kartu */
--paper-pattern: radial-gradient(circle at 1px 1px, rgba(49, 45, 38, 0.16) 1px, transparent 1.2px) 0 0 / 22px 22px;
--paper-gradient: linear-gradient(180deg, #f8f3ea 0%, #f3ecdf 100%);
```

### B. Tinta & Tipografi (Ink & Text)
```css
--ink: #23211d;                /* Tinta utama / teks hitam arang hangat */
--ink-strong: #111111;         /* Teks tebal / judul penting */
--muted: #756f65;              /* Teks sekunder / petunjuk pembantu */
--muted-strong: #4f5646;       /* Teks sekunder nuansa alam */
```

### C. Aksen & Status Karakter (Craft Accents)
```css
--accent-orange: #ef7a37;      /* Aksen utama / tombol aksi aktif */
--orange-deep: #ba4c10;        /* Hover / penekanan aksen */
--green-soft: #eff3db;         /* Background status aman / orientasi */
--green-card: #c8d9a4;         /* Kartu hijau pistachio */
--green-strong: #4a8c1f;       /* Status lulus / valid */
--yellow-card: #f0d487;        /* Kartu kuning hangat */
--blue-card: #a8c8d8;          /* Kartu biru pastel lembut */
--danger: #d94336;             /* Peringatan / rintangan berbahaya */
```

### D. Garis & Bayangan Kertas (Line & Paper Shadow)
```css
--line: rgba(35, 33, 29, 0.14);
--line-strong: rgba(35, 33, 29, 0.28);
--shadow-paper:
  0 2px 2px rgba(55, 31, 13, 0.10),
  0 8px 18px rgba(55, 31, 13, 0.12),
  0 24px 46px rgba(55, 31, 13, 0.10);
--shadow-focus:
  0 3px 5px rgba(45, 24, 10, 0.16),
  0 14px 30px rgba(45, 24, 10, 0.18),
  0 38px 72px rgba(45, 24, 10, 0.17),
  0 68px 120px rgba(45, 24, 10, 0.11);
```

---

## 3. Tipografi & Hierarki
- **Font Family**: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Eyebrow / Tag Kategori**: `13px`, font-weight 600, letter-spacing `0.02em`, color `var(--ink-strong)`
- **Judul Layar (H1)**: `clamp(24px, 3.2vw, 36px)`, letter-spacing `-0.02em`, font-weight 700
- **Subjudul / Penjelasan (Lead)**: `15px–16px`, line-height 1.5, color `var(--muted)`
- **Body & Label Tombol**: `14px–15px`, font-weight 600

---

## 4. Perlakuan Komponen (Component Treatment)
1. **Tombol (Buttons)**:
   - Bentuk kapsul (*pill*) atau rounded rectangle (`border-radius: 12px` / `999px`).
   - Warna putih kertas dengan border tinta `1.5px solid var(--line)`.
   - Hover / Active: transisi halus `cubic-bezier(.2, .75, .2, 1)`, elevasi mikro dengan bayangan kertas hangat.
2. **Kartu Level & Panel Evaluasi (Cards & Panels)**:
   - Background `var(--paper-light)` atau gradasi kertas, sudut `border-radius: 16px`.
   - Border halus `1px solid var(--line)`.
   - Padding luas (min `20px–24px`) dengan ritme spasi yang lapang.
3. **Momo Bubble**:
   - Background krem hangat / hijau lembut (`var(--green-soft)`), border `1.5px solid var(--green-card)` atau `var(--accent-orange)`.
