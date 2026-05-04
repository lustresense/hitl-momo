
<!-- PROJECT LOGO -->
<br />
<div align="center">
  <h1>🎨 Escape the Sketchbook</h1>
  <p>
    <strong>Interactive Human-in-the-Loop AI Playground</strong><br>
    Game 2D Platformer untuk Literasi AI & Mitigasi Automation Bias Siswa SMP
  </p>

  <!-- BADGES -->
  <p>
    <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT">
    <img src="https://img.shields.io/badge/Status-SPPA-blue.svg" alt="Status: SPPA">
    <img src="https://img.shields.io/badge/Engine-Kaplay.js-orange.svg" alt="Engine: Kaplay.js">
    <img src="https://img.shields.io/badge/AI-TensorFlow.js-purple.svg" alt="AI: TensorFlow.js">
    <img src="https://img.shields.io/badge/Docker-ready-blue.svg" alt="Docker: ready">
  </p>
</div>

---

## ❓ Problem

Siswa SMP terjebak **Automation Bias**—menerima output AI mentah-mentah tanpa mikir, tanpa verifikasi. Mereka nggak paham bahwa AI itu mesin probabilitas yang bisa ragu, berhalusinasi, dan bikin kesalahan fatal.

## ✨ Solution

**Escape the Sketchbook** adalah game 2D platformer interaktif yang memaksa siswa untuk **mengevaluasi dan mengoreksi AI secara langsung**.

Siswa menggambar objek dengan jari di udara (MediaPipe), AI menebak (CNN/TensorFlow.js), lalu siswa memutuskan: **Accept** atau **Override**? Keputusan itu punya konsekuensi nyata—kalau salah, Stickman mati dan kertas buku robek. Semua interaksi di-log sebagai data behavioral.

> AI bukan kotak ajaib. AI bisa salah. Dan manusia yang harus memegang kendali.

## 🎮 Core Gameplay

```
  GAMBAR → AI NEBAK → SISWA EVALUASI → KONSEKUENSI
  (MediaPipe)   (TF.js)   (HITL Moment)   (Game World)
```

1. **Draw** — Gambar jembatan/tangga pakai telunjuk di udara
2. **AI Guesses** — Momo (maskot AI) nampilin Top-3 prediksi + confidence score
3. **You Decide** — Accept kalau bener, Override kalau Momo ngaco
4. **Consequences** — Solid = Stickman selamat. Danger = buku robek, game restart

## 👥 Team

| Role | Name | Scope |
|------|------|-------|
| 🎨 Product Designer & Game Developer | **Farchan Deano Muhammad (Can)** | IP & Narrative, UI/UX, Kaplay.js Game Engine, MediaPipe Integration |
| 🧠 AI & Data Engineer | **[Nama Dias]** | CNN MobileNet, TensorFlow.js, REST API, Logging, K-Means Clustering |

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| 🎮 Game Engine | Kaplay.js (2D Platformer) |
| 🖐️ Input | MediaPipe Hand Tracking (Real-time Gesture) |
| 🧠 AI Inference | TensorFlow.js — MobileNet CNN, Client-Side Only |
| 🎨 Frontend | React + HTML5 Canvas |
| ⚙️ Backend | Node.js / Express — REST API (hybrid REST + WebSocket) |
| 💾 Database | SQLite |
| 📊 Analytics | K-Means Clustering (Behavioral Patterns) |
| 🐳 DevOps | Docker + Proxmox VM + Tailscale |
| 🔒 Security | Session-based (No NISN), JWT Auth |

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- Docker Desktop
- Webcam (for MediaPipe gesture input)

### 1. Clone
```bash
git clone https://github.com/deanodayes/escape-the-sketchbook.git
cd escape-the-sketchbook
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
# FE di :3000, BE di :5000
```

⚡ **Done!** Buka http://localhost:5173 untuk mulai main.

## 🌳 Branching Strategy

```
main        ← Production-ready (protected)
├── develop ← Integration branch
│   ├── feature/*    ← Can's features (ui/momo-dialogue, feat/level-2-gameplay)
│   ├── feature/*    ← Dias' features (feat/cnn-training, feat/rest-api)
│   └── fix/*        ← Bug fixes
└── hotfix/*  ← Production emergencies
```

**Workflow:** Branch dari `develop` → Coding → PR → Review → Merge ke `develop` → Test → Merge ke `main` untuk release.

## 📁 Project Structure

```
escape-the-sketchbook/
├── frontend/          # React + Kaplay.js + MediaPipe
│   ├── src/
│   │   ├── engine/    # Kaplay.js game loop & physics
│   │   ├── components/# React UI (Probe UI, panels)
│   │   └── hooks/     # MediaPipe hooks
│   └── public/
├── backend/           # Node.js/Express REST API
│   ├── routes/        # /api/logs/session, /api/sessions/:id
│   ├── models/        # SQLite schema
│   └── services/      # K-Means clustering service
├── ai/                # Model training (Dias)
│   ├── notebooks/     # Jupyter notebooks
│   ├── models/        # TF.js exported models
│   └── dataset/       # QuickDraw subset (15 kelas)
├── docker-compose.yml
└── README.md
```

## 🔌 API Architecture: REST + WebSocket Hybrid

Mengikuti pola hybrid industry-standard (dipakai oleh Stream, Slack, dan major chat providers):

**REST → Stateless Data Operations**
- `GET /api/sessions/:id` — Fetch session history
- `POST /api/logs/session` — Submit interaction log

**WebSocket → Real-Time Events**
- `wss://` — AI inference streaming (token-by-token confidence updates?)
- `wss://` — Real-time game state sync? (optional multiplayer future)

**Kenapa Hybrid?** REST handles stateless CRUD and data retrieval efficiently, while WebSocket handles stateful, real-time event streaming that keeps connections open for live feedback. This pattern ensures the system is reliable, scalable, and low-latency—core requirements for HITL interaction logging.

**Fallback Strategy:** If WebSocket disconnects → automatic REST recovery → fetch messages newer than last timestamp → merge without duplicates.

<br>

> 🎨 **Momo: Si Robot Highlighter yang Jago Nebak, Tapi Sering Salah.**  
> Proyek ini bukan cuma game—ini adalah **playground** buat ngajarin anak SMP bahwa AI bisa salah,  
> dan manusia yang harus berani **Overriding** keputusan mesin.  
> ── *"AI bukan selalu benar. Tapi kamu bisa verifikasi."* ──
