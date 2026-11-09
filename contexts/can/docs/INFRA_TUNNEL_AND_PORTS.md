# Panduan Infrastruktur, Tunneling, & Alokasi Port

Dokumen teknis arsitektur port, Cloudflare Zero Trust Tunnel, dan panduan migrasi layanan dari server program studi ke homeserver pribadi Farchan Deano.

---

## 1. Executive Summary & Tujuan Dokumen

Server program studi saat ini menampung sejumlah layanan web, AI gateway, dan sistem riset. Demi keberlanjutan deployment, kepemilikan resource mandiri, serta persiapan evaluasi Proyek Akhir (PA), seluruh ekosistem layanan akan dimigrasikan ke homeserver fisik milik pribadi Farchan Deano.

Dokumen ini mendefinisikan:
1. **Peta Eksisting**: Port lokal, domain eksternal, konfigurasi systemd, dan token tunnel yang sedang berjalan di server prodi.
2. **Standar Port & Alokasi Domain PA**: Konvensi penomoran port terstruktur untuk domain utama `momominum.tech`.
3. **Prosedur Migrasi Homeserver**: Panduan komprehensif langkah demi langkah, mulai dari backup aset, transfer token, hingga setup auto-start (lingering) dan ingress Cloudflare Tunnel.

---

## 2. Tabel Port & Tunneling Saat Ini (Live Server Prodi)

### 2.1 Layanan Publik Terowongan (Cloudflare Tunnels)

| Layanan | Port Lokal | Public URL | Systemd Unit | Lokasi Token Cloudflared | Direktori Kerja / Binary | Catatan / Data Dir |
|---|---|---|---|---|---|---|
| **9Router** | `20128` (TCP) | `https://9router.momominum.tech` | `cloudflared-9router.service` & `9router.service` | `~/.config/cloudflared/9router.token` | `~/.local/bin/9router-server` | AI Model Router & Gateway. Data: `~/.9router/` |
| **PA Sketchbook Universe v2** | `3000` (TCP) | `https://app.momominum.tech` | `cloudflared-pa.service` & `pa-demo.service` | `~/.config/cloudflared/pa.tunnel-token` | `/srv/sketchbook/Sketchbook-Universe-v2/implementation` | Ekosistem PA. Exec: `npx --yes serve -s out -l 3000` |
| **AIRS Exhibition** | `8081` (TCP) | `https://airs-demo.lustresense.me` | `cloudflared-airs.service` & `airs-demo.service` | `~/.config/cloudflared/airs.tunnel-token` | `/srv/sketchbook/airs-demo` (static) / Docker `airs-exhibition-v7` | Web demo statis AIRS via Python HTTP server |

### 2.2 Layanan Internal & Infrastruktur Jaringan

| Layanan / Protokol | Port & Interface | Deskripsi / Fungsi | Konfigurasi / Target |
|---|---|---|---|
| **SSH** | `22` (TCP / `0.0.0.0` & `[::]`) | Akses terminal remote terenkripsi | OpenSSH daemon |
| **Research Controller** | `8765` (TCP / `127.0.0.1`) | Ujang Autonomous Research Controller | `research-controller.service` (`~/research-controller/`) |
| **NetBird VPN Mesh** | `51820` (UDP / `0.0.0.0` & `[::]`) | Koneksi WireGuard overlay VPN mesh private | IP internal VPN: `100.115.156.202` |
| **Cloudflared Metrics (9Router)** | `20241` (TCP / `127.0.0.1`) | Metrik internal Prometheus instance Cloudflared | Process PID tunnel 9router |
| **Cloudflared Metrics (AIRS)** | `20242` (TCP / `127.0.0.1`) | Metrik internal Prometheus instance Cloudflared | Process PID tunnel AIRS |
| **Cloudflared Metrics (PA Demo)** | `20243` (TCP / `127.0.0.1`) | Metrik internal Prometheus instance Cloudflared | Process PID tunnel PA |

---

## 3. Rekomendasi Alokasi Port & Subdomain PA (`momominum.tech`)

Untuk mencegah tabrakan port antar layanan di homeserver, seluruh subdomain di bawah domain utama `momominum.tech` diorganisasi berdasarkan skema blok port terstruktur.

### 3.1 Skema Alokasi Subdomain PA

| Subdomain | Port Target | Komponen Aplikasi | Deskripsi Fungsional |
|---|---|---|---|
| `app.momominum.tech` | `3000` | **User / Siswa Web App** | Frontend interaktif, MediaPipe HITL, KAPLAY Canvas, gameplay loop |
| `momominum.tech` / `www.momominum.tech` | `3001` | **Landing Page / Web PA** | Profil proyek, pengenalan sistem PA, dokumentasi publik |
| `admin.momominum.tech` | `3002` | **Dashboard Guru / Pembimbing** | Panel analitik evaluasi, monitoring kelas, approval guru/dosen |
| `api.momominum.tech` | `3005` | **Backend REST / WebSocket API** | Sinkronisasi data real-time, auth, storage backend (jika dideploy mandiri) |
| `9router.momominum.tech` | `20128` | **AI Gateway / LLM Proxy** | Multi-provider routing (OpenAI, Gemini, OpenRouter, local inference) |

### 3.2 Aturan Konvensi Blok Port (Port Allocation Rules)

1. **Blok `3000 - 3099` (PA Ecosystem Dedicated Block)**:
   - Dikhususkan eksklusif untuk seluruh komponen Proyek Akhir Sketchbook Universe (Frontend, Landing, Admin, API).
   - Layanan di luar PA dilarang memakai port pada rentang ini.
2. **Blok `8000 - 8099` (Standalone Demos & Internal Research Services)**:
   - Digunakan untuk demo independen dan service pendukung (misal: AIRS Exhibition di `8081`, Research Controller di `8765`).
3. **Blok `20000+` (Gateways, Proxies, & Infrastructure Metrics)**:
   - Digunakan untuk router/gateway terintegrasi (9Router di `20128`) dan listener metrik/telemetri tunnel (`20241 - 20249`).

---

## 4. Panduan Migrasi Homeserver Step-by-Step

Panduan ini ditujukan untuk eksekusi transfer dari server prodi ke mesin homeserver Linux Farchan Deano.

### 4.1 Tahap 1: Checklist Backup & Eksfiltrasi Data (Server Asal)

Sebelum mematikan layanan di server asal, amankan komponen berikut:

1. **Token Cloudflare Tunnel**:
   - `~/.config/cloudflared/pa.tunnel-token`
   - `~/.config/cloudflared/9router.token`
   - `~/.config/cloudflared/airs.tunnel-token`
2. **Unit File Systemd User**:
   - `~/.config/systemd/user/pa-demo.service`
   - `~/.config/systemd/user/cloudflared-pa.service`
   - `~/.config/systemd/user/9router.service`
   - `~/.config/systemd/user/cloudflared-9router.service`
   - `~/.config/systemd/user/airs-demo.service`
   - `~/.config/systemd/user/cloudflared-airs.service`
3. **Source Code & Build Artifacts**:
   - Repository PA: `/srv/sketchbook/Sketchbook-Universe-v2/`
   - Demo AIRS: `/srv/sketchbook/airs-demo/`
   - Controller Riset: `~/research-controller/`
4. **Data Direktori & Kredensial**:
   - Database/Konfigurasi 9Router: `~/.9router/`
   - Environment variables / `.env` di tiap repositori.

Contoh perintah pembuatan arsip backup:
```bash
# Backup token dan systemd user service
tar -czvf /tmp/backup_infra_config.tar.gz   ~/.config/cloudflared   ~/.config/systemd/user/*.service   ~/.9router

# Backup repository Sketchbook
tar -czvf /tmp/backup_sketchbook_universe.tar.gz   -C /srv/sketchbook Sketchbook-Universe-v2
```

---

### 4.2 Tahap 2: Setup Awal di Homeserver (Server Tujuan)

#### 1. Instalasi Binary Cloudflared
Unduh binary resmi Cloudflared untuk arsitektur Linux x86_64 / arm64:
```bash
# Unduh binary cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Atau pasang binary lokal mandiri pada ~/.hermes/bin atau /usr/local/bin
sudo install -m 755 /usr/local/bin/cloudflared /usr/bin/cloudflared
```

#### 2. Restorasi File Token & Pengetatan Izin (Permission Hardening)
Pindahkan token ke path user homeserver dan set izin baca ketat (`600`):
```bash
mkdir -p ~/.config/cloudflared
# Salin file token ke direktori tersebut
chmod 700 ~/.config/cloudflared
chmod 600 ~/.config/cloudflared/*.token
chmod 600 ~/.config/cloudflared/*.tunnel-token
```

#### 3. Konfigurasi Lingering User (Auto-Start Systemd User Mode)
Agar unit `systemd --user` tetap hidup saat user logout atau mesin reboot:
```bash
# Aktifkan session lingering untuk user saat ini
loginctl enable-linger $USER

# Verifikasi status lingering
loginctl show-user $USER | grep Linger
# Output wajib: Linger=yes
```

#### 4. Penataan Systemd Unit & Aktivasi Layanan
Salin unit file ke `~/.config/systemd/user/` dan sesuaikan path direktori jika username di homeserver berbeda:
```bash
mkdir -p ~/.config/systemd/user
# Letakkan file .service di ~/.config/systemd/user/

# Reload daemon user
systemctl --user daemon-reload

# Aktifkan dan jalankan unit aplikasi
systemctl --user enable --now pa-demo.service
systemctl --user enable --now cloudflared-pa.service

systemctl --user enable --now 9router.service
systemctl --user enable --now cloudflared-9router.service

systemctl --user enable --now airs-demo.service
systemctl --user enable --now cloudflared-airs.service
```

---

### 4.3 Tahap 3: Konfigurasi Cloudflare Zero Trust DNS & Ingress Routing

Setiap tunnel yang dikelola melalui dashboard Cloudflare Zero Trust (atau CLI) mengarahkan traffic hostname langsung ke listener lokal:

1. **Routing Ingress Rules (Cloudflare Dashboard / Config)**:
   - Hostname `app.momominum.tech` -> Service `http://127.0.0.1:3000`
   - Hostname `momominum.tech` -> Service `http://127.0.0.1:3001`
   - Hostname `admin.momominum.tech` -> Service `http://127.0.0.1:3002`
   - Hostname `api.momominum.tech` -> Service `http://127.0.0.1:3005`
   - Hostname `9router.momominum.tech` -> Service `http://127.0.0.1:20128`
   - Hostname `airs-demo.lustresense.me` -> Service `http://127.0.0.1:8081`

2. **Peralihan Traffic Tanpa Downtime**:
   - Karena Cloudflare Named Tunnel menggunakan arsitektur outbound connection ke edge Cloudflare, setelah binary `cloudflared` pada homeserver dijalankan menggunakan token yang sama, edge Cloudflare secara otomatis mengarahkan koneksi ke konektor homeserver yang aktif.
   - Nonaktifkan service tunnel pada server lama setelah memastikan homeserver menerima request dengan lancar:
     ```bash
     # Di server lama setelah homeserver online
     systemctl --user stop cloudflared-pa.service cloudflared-9router.service cloudflared-airs.service
     systemctl --user disable cloudflared-pa.service cloudflared-9router.service cloudflared-airs.service
     ```

---

### 4.4 Tahap 4: Verifikasi & Health Check Pasca-Migrasi

Lakukan pengecekan status di homeserver:
```bash
# 1. Cek port lokal yang sedang listen
ss -tulpn | grep -E '3000|3001|3002|3005|8081|20128'

# 2. Cek status unit systemd
systemctl --user status pa-demo.service cloudflared-pa.service --no-pager
systemctl --user status 9router.service cloudflared-9router.service --no-pager

# 3. Pengujian respon HTTP lokal
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:20128/health

# 4. Pengujian endpoint publik
curl -I https://app.momominum.tech
curl -I https://9router.momominum.tech
```
