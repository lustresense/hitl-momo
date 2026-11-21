# HF1 Repo Audit — MoNUI-7 Repository & Worktree Audit Report

**Date:** 2026-11-21  
**Task:** R23-HF1 Bagian A (A1–A6)  
**Executed by:** Antigravity (AGY)  

---

## 1. Audit Semua Repositori Git

Pencarian: `find /srv/sketchbook /home/deano -maxdepth 4 \( -name .git -type d -o -name .git -type f \)`

### 1.1 `/srv/sketchbook/research-can` (CLONE UTAMA / AKTIF)
- **Path:** `/srv/sketchbook/research-can`
- **Ukuran:** `1.5 GB`
- **Remote URL:** `https://github.com/lustresense/hitl-momo.git`
- **Branch:** `research-can`
- **HEAD:** `5b02782f2281d6f8acd646966f21fd54b2c7dca3`
- **Perubahan belum di-commit:** `1` (`?? docs/attachments/R23/` — file benchmark export kiriman Owner, dipindahkan ke `$DATA_ROOT/owner/exports/` di Bagian B)
- **Commit belum di-push:** `0` (Up-to-date dengan `origin/research-can`)
- **Stash:** `0`
- **Worktree:**
  - `/srv/sketchbook/research-can` (`5b02782` [research-can])
  - `/home/deano/monui7-local/work` (`2721117` detached HEAD)
- **Status:** **AKTIF & SAH** (Satu-satunya clone research-can).

---

### 1.2 `/srv/sketchbook/mediapipe-optimize/main-r19` (Repositori Base R19/R20/R22)
- **Path:** `/srv/sketchbook/mediapipe-optimize/main-r19`
- **Ukuran:** `1.9 GB`
- **Remote URL:** `https://github.com/lustresense/hitl-momo.git` (fetch: `blob:none`)
- **Branch:** `main`
- **HEAD:** `de1030ea5dfbab67e1360ed7a3a00a462b46824f`
- **Perubahan belum di-commit:** `0` (Bersih)
- **Commit belum di-push:** `0`
- **Stash:** `0`
- **Worktree:**
  - `/srv/sketchbook/mediapipe-optimize/main-r19` (`de1030e` [main])
  - `/srv/sketchbook/mediapipe-optimize/r22-nui-lab` (`1bb1a71` [r22-nui-lab])
  - `/srv/sketchbook/mediapipe-optimize/r22b-handstate` (`8f74db4` [r22b-handstate])
- **Status:** Dipertahankan untuk sandbox R19/R20/R22 per A6.

---

### 1.3 `/srv/sketchbook/mediapipe-optimize/r22-nui-lab` (Worktree dari main-r19)
- **Path:** `/srv/sketchbook/mediapipe-optimize/r22-nui-lab`
- **Ukuran:** `713 MB`
- **Remote URL:** `https://github.com/lustresense/hitl-momo.git`
- **Branch:** `r22-nui-lab`
- **HEAD:** `1bb1a71fe46c01522f74bdbf45e812c5590b9ce8`
- **Perubahan belum di-commit:** `0` (Bersih)
- **Commit belum di-push:** `0`
- **Stash:** `0`
- **Status:** Dipertahankan untuk sandbox R22 per A6.

---

### 1.4 `/srv/sketchbook/mediapipe-optimize/r22b-handstate` (Worktree dari main-r19)
- **Path:** `/srv/sketchbook/mediapipe-optimize/r22b-handstate`
- **Ukuran:** `713 MB`
- **Remote URL:** `https://github.com/lustresense/hitl-momo.git`
- **Branch:** `r22b-handstate`
- **HEAD:** `8f74db42896fae6428b7050ad3ea092d0237a885`
- **Perubahan belum di-commit:** `0` (Bersih)
- **Commit belum di-push:** `0`
- **Stash:** `0`
- **Status:** Dipertahankan untuk sandbox R22B per A6.

---

### 1.5 `/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo` (Sandbox R18)
- **Path:** `/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo`
- **Ukuran:** `754 MB`
- **Remote URL:** `https://github.com/lustresense/hitl-momo.git`
- **Branch:** `HEAD` (detached `3ef4cc3685fc64bce729c5ae54bc29689f6d3446`)
- **Perubahan belum di-commit:** `0` (Bersih)
- **Commit belum di-push:** `0`
- **Stash:** `0`
- **Status:** Dipertahankan untuk referensi historis R18 per A6.

---

### 1.6 `/home/deano/monui7-local/work` (Worktree Aktif MoNUI-7 R23)
- **Path:** `/home/deano/monui7-local/work`
- **Ukuran:** `2.3 GB` (termasuk `node_modules` dan build cache)
- **Base Repo:** `/srv/sketchbook/research-can` (telah disambungkan ulang via `worktree repair`)
- **Branch:** `2721117` (detached HEAD dari 57acc5e)
- **Perubahan belum di-commit:** `0` (Bersih)
- **Commit belum di-push:** `0`
- **Stash:** `0`
- **Status:** **AKTIF & SAH** sebagai workspace kandidat MoNUI-7.

---

## 2. Ukuran Subfolder `/srv/sketchbook/mediapipe-optimize/*`

| Folder / File | Ukuran | Deskripsi & Peran |
| :--- | :---: | :--- |
| `r20-sandbox/` | **8.2 GB** | Berisi Playwright browser binaries (`pw/chromium-1255/`), video fixtures (`r20_sim_cam.y4m`), node_modules tools. |
| `r18-ux0-sandbox/` | **2.1 GB** | Sandbox R18 UX-0 offline evaluation data & repo. |
| `main-r19/` | **1.9 GB** | Clone git lokal base untuk R19/R20/R22. |
| `r22-nui-lab/` | **713 MB** | Worktree R22 NUI Lab. |
| `r22b-handstate/` | **713 MB** | Worktree R22B HandState. |
| `r19-sandbox/` | **94 MB** | Fixtures dan model R19 Pistol. |
| `r22-dev-deploy/` | **30 MB** | **JANGAN SENTUH:** Lingkungan deploy DEV aktif milik Ujang. |
| `yolo26n.pt` | **5.3 MB** | Checkpoint awal YOLO26n. |
| `docs/` | **96 KB** | Dokumentasi lokal. |

---

## 3. Rekomendasi Pengarsipan ke `$BIG_ROOT` (Untuk Diputuskan Owner)

Sesuai A6, tidak ada sandbox di `/srv/sketchbook/mediapipe-optimize` yang dihapus saat ini. Rekomendasi pengarsipan remote di masa mendatang:
1. **`r20-sandbox/` (8.2 GB):** Sebagian besar ukuran (±6 GB) adalah binaries browser Playwright (`pw/`) dan video uncompressed `.y4m`. Bila riset R20 selesai, folder ini sangat aman untuk di-tar ke `$BIG_ROOT/backup/sandboxes/r20-sandbox.tar` dan dihapus dari lokal.
2. **`r18-ux0-sandbox/` (2.1 GB):** Berisi artefak R18 yang sudah selesai dan terdokumentasi di LOG/README. Aman untuk di-tar ke `$BIG_ROOT/backup/sandboxes/r18-ux0-sandbox.tar`.
3. **`main-r19` + worktrees `r22-nui-lab` & `r22b-handstate` (~3.3 GB):** Patch R22 dan R22B sudah terdokumentasi penuh di `research-can`. Namun karena mandat v1.1.0/v1.2.0 masih merujuk hash R22B (`R22B_LOCAL_BASE`), sebaiknya dipertahankan hingga seluruh Wave R23 selesai tuntas.
4. **`r22-dev-deploy` (30 MB):** Wajib **TETAP** di lokal karena aktif dipakai Ujang.

---

## 4. Status Sambungan Worktree & `env.sh` (A3 & A4)
- Perintah `git -C /srv/sketchbook/research-can worktree repair /home/deano/monui7-local/work` berhasil dijalankan (`repair: .git file broken: /home/deano/monui7-local/work`).
- `git worktree list` di `/srv/sketchbook/research-can` bersih (0 prunable, 0 rusak).
- `git status` di `/home/deano/monui7-local/work` berjalan normal (working tree clean).
- Variabel `RC` di `/home/deano/monui7-local/env.sh` telah diubah ke `/srv/sketchbook/research-can`. Seluruh skrip di `r23/scripts/` dan `$DATA_ROOT/jobs/` telah disesuaikan dan lolos verifikasi grep.
