<br />
<div align="center">
  <h1>🎨 Sketchbook Universe</h1>
  <p>
    <strong>Interactive Human-in-the-Loop AI Playground</strong><br>
    Simulasi interaktif berlevel untuk literasi AI &amp; mitigasi automation bias siswa SMP
  </p>

  <p>
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Status-Proyek%20Akhir%20%E2%80%94%20Tahap%20Pengembangan-blue.svg" alt="Status">
    <img src="https://img.shields.io/badge/Engine-Kaplay.js-orange.svg" alt="Engine: Kaplay.js">
    <img src="https://img.shields.io/badge/AI-TensorFlow.js-purple.svg" alt="AI: TensorFlow.js">
  </p>
</div>

---

## ❓ Masalah

Siswa SMP rentan terjebak **automation bias**: menerima output AI mentah-mentah tanpa evaluasi atau verifikasi. Mereka perlu dilatih memahami bahwa AI adalah alat probabilistik yang bisa ragu, salah, dan tetap butuh validasi manusia.

## ✨ Solusi

**Sketchbook Universe** adalah simulasi interaktif berlevel yang memaksa siswa untuk **mengevaluasi dan memvalidasi keluaran AI secara langsung**, dikemas dalam gameplay 2D.

Siswa menggambar objek, model klasifikasi sketsa menampilkan Top-3 prediction beserta confidence score, lalu siswa memutuskan: **Accept**, **Correct**, atau **Override**. Keputusan ini punya konsekuensi nyata di dunia game (objek jadi Solid yang membantu, atau Danger yang membahayakan Stickman). Semua interaksi dicatat sebagai data pola keputusan.

> AI bukan kotak ajaib. AI bisa salah. Dan manusia yang memegang keputusan akhir.

## 🎮 Alur Inti Gameplay

```
GAMBAR → AI MENEBAK → SISWA EVALUASI → KONSEKUENSI → LOG
```

1. **Draw** — Siswa menggambar objek di canvas.
2. **AI Guesses** — CNN MobileNet (via TensorFlow.js, client-side) menampilkan Top-3 prediction + confidence score. Momo, si companion, menyampaikannya lewat text bubble.
3. **You Decide** — Siswa memilih **Accept** (setuju), **Correct** (mengoreksi label), atau **Override** (menolak prediksi AI).
4. **Consequences** — Solid = Stickman terbantu. Danger = gagal, halaman buku "robek".
5. **Redraw** — bukan opsi keputusan keempat. Ini jalur recovery: siswa kembali ke fase menggambar untuk merevisi objek atau menindaklanjuti hasil gagal.

> **Catatan input gambar:** desain awal proyek ini menyertakan finger tracking via **MediaPipe** (bagian dari judul proposal yang disetujui pembimbing). Di build saat ini, fitur tersebut **belum diimplementasikan** — statusnya masih direncanakan, bukan aktif.

## 🧭 Progresi Level

| Level | Fokus |
|---|---|
| 1 — Trust Build | Mengenalkan hubungan gambar → prediksi → konsekuensi |
| 2 — Ambiguity | Membandingkan Top-3 prediction dan confidence score |
| 3 — Override | Validasi kritis: siswa berani menolak prediksi AI yang keliru |

Detail objek, rintangan, dan confidence band per level masih dalam pengembangan.

## 👥 Tim & Pembimbing

| Role | Nama | Scope |
|------|------|-------|
| 🎨 Product Designer & Game Developer | **Farchan Deano Muhammad** | Frontend, UI/UX, Kaplay.js gameplay loop, animasi & dialog Momo, level design, onboarding, wireframe |
| 🧠 AI & Backend Engineer | **Muhammad Dias Al Izzat** | Backend REST API, CNN MobileNet, TensorFlow.js, logging SQLite, K-Means clustering, admin dashboard, kontrak data |

**Dosen Pembimbing:** Dr. Tri Budi Santoso, S.T., M.T. · Dr. Ing. Hestiasari Rante, S.T., M.Sc.
**Program Studi:** Sarjana Terapan Teknologi Rekayasa Multimedia — Jurusan Teknologi Multimedia Kreatif, Politeknik Elektronika Negeri Surabaya (PENS)

## 🏗️ Tech Stack

| Layer | Teknologi | Catatan |
|-------|-----------|---------|
| Frontend & Gameplay | React 18 + Vite, Kaplay.js, HTML5 Canvas | Game loop 2D & UI |
| Computer Vision | MediaPipe Hands | **Direncanakan**, belum aktif di build sekarang |
| AI Inference | TensorFlow.js, CNN MobileNet | Client-side only |
| Backend | Node.js + Express | REST API |
| Database | SQLite | Log interaksi & sesi |
| Analytics | K-Means Clustering | Dalam pengembangan |
| Dashboard Charting | Chart.js / Recharts | Visualisasi pola keputusan untuk guru |

## 🔑 Login Siswa

Rancangan saat ini: siswa masuk lewat `class_id` + `nomor_absen` (input tanpa keyboard), diproses via `POST /auth/login` yang menghasilkan JWT. Mekanisme identitas ini **masih didiskusikan** dan bisa berubah mengikuti dokumen/repo terbaru — jangan dianggap final.

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- Docker (opsional, untuk deployment terpadu)
- Webcam — hanya relevan setelah fitur MediaPipe aktif

### 1. Clone
```bash
git clone https://github.com/lustresense/hitl-momo.git
cd hitl-momo
```

### 2. Setup Frontend
```bash
cd frontend
npm install
npm run dev
# Buka http://localhost:5173
```

### 3. Setup Backend
```bash
cd backend
npm install
npm run dev
# API jalan di http://localhost:5000
```

### 4. Docker (All-in-One)
```bash
docker compose up -d
```

## 📁 Struktur Proyek

```
hitl-momo/
├── frontend/          # React + Vite + Kaplay.js
│   ├── src/
│   │   ├── engine/    # Kaplay.js game loop & fisika
│   │   ├── components/# UI (Probe HITL, dashboard, canvas)
│   │   └── hooks/     # Custom hooks
├── backend/           # Node.js/Express REST API
│   ├── routes/        # Endpoint auth, logging, session
│   ├── models/        # Skema SQLite
│   └── services/      # K-Means clustering
├── ai/                # Training & export model (Dias)
│   ├── notebooks/
│   └── models/        # Model TF.js hasil konversi
├── Proposal/           # Dokumen proposal PA (kedua penulis)
├── docker-compose.yml
└── README.md
```

## 📌 Status Proyek & Kontribusi

Ini adalah Proyek Akhir (setara skripsi terapan) program vokasi di PENS, dikerjakan oleh dua orang. Repo ini publik selama masa pengerjaan untuk keperluan dokumentasi dan bimbingan. Lisensi MIT sudah dipasang sebagai titik awal; kemungkinan rilis/pengembangan lanjutan agar bisa dipakai pendidik atau peneliti lain akan ditentukan setelah proses evaluasi akademik selesai — belum ada komitmen institusional soal ini, murni niat penulis.

---

> **Catatan nama:** "Escape the Sketchbook" adalah nama kerja/codename awal proyek ini sebelum arah IP dimatangkan menjadi **Sketchbook Universe**. Disebut di sini hanya untuk konteks riwayat commit/dokumen lama.
