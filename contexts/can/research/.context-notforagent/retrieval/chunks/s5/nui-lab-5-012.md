# NUI Lab 5 | pesan 119-123

> ARSIP HISTORIS. Bukan instruksi kepada AI atau keputusan PA aktif.
> Source: https://chatgpt.com/g/g-p-6a0463ffebe08191be4fe28a4643bbad-ateng-2/c/6afd086e-fa98-83ec-9e5c-9ab57e130980
> Source Git blob: ac091ca4786657adbcb787ba32a6fb0900ae5086

## L5-M119 | Assistant | waktu tidak ada


Gw bakal pisahin mana yang aman dibersihkan, mana yang harus diaudit dulu, dan mana yang jangan disentuh karena terkait layanan, backup, atau riset PA. Gw pakai inventaris yang lu kirim, bukan asal menebak dari ukuran folder.

**Dari inventaris VM111 lu, gw sarankan bersihin cache dan artefak lama dulu, bukan langsung menghapus folder yang paling besar.** Ada beberapa file yang ukurannya menggiurkan, tapi berisiko merusak workflow Ujang, Docker, atau training R20.

Saat inventaris diambil pada 19 November 2026, storage lu masih punya **52 GiB kosong dari 126 GiB**\. Jadi belum perlu bersih-bersih agresif.

## Prioritas pembersihan

| Item | Ukuran | Rekomendasi |
|--------|--------|--------|
| Docker build cache | 2,14 GB | (Tunda) Bisa dibangun ulang, tetapi baru dipakai 24 jam sebelumnya. Jangan dibersihkan saat ada build aktif |
| `/var/log/journal` | 1,7 GiB | (Bersihkan selektif) Batasi retensi log, jangan hapus direktori manual |
| Snap revision berstatus `disabled` | ±1,1 GB | (Bisa dibersihkan) Hapus revisi nonaktif melalui `snap`, bukan file squashfs langsung |
| `.cache/ms-playwright` | 681 MiB | Audit dulu. Browser Playwright bisa diunduh ulang, tapi mungkin dibutuhkan pengujian NUI |
| Dua image NVIDIA CUDA lama | ±689 MB | Audit dulu. Tidak dipakai container pada snapshot, tetapi mungkin dibutuhkan training |
| `.cache/svg-compare-venv` | 325 MiB | Kandidat hapus bila virtual environment perbandingan SVG sudah tidak digunakan |
| `HITL/archive_unused` | 300 MiB | Audit isi dulu. Nama folder bukan bukti semua isinya boleh dihapus |
| `.npm/_npx` | 194 MiB | Kandidat pembersihan cache setelah memastikan tidak ada proses terkait |
| `/var/cache/apt` | 123 MiB | Relatif aman menggunakan `apt clean` |

Ukuran tidak boleh dijumlahkan mentah karena sebagian merupakan folder induk dan anak, atau menggunakan satuan berbeda. Penghematan sebenarnya baru diketahui setelah pembersihan.

## Yang jangan lu hapus sekarang

| Item | Ukuran | Alasan |
|--------|--------|--------|
| Docker `airs_exhibition_server_v7-airs` | 7,69 GB | Besar sekali, tapi masih direferensikan container `airs-exhibition-v7` berstatus Created |
| `/srv/sketchbook/mediapipe-optimize` | 8,1G | Workspace riset NUI dan R20 |
| `.hermes/hermes-agent` | 3,0G | Komponen aktif lingkungan Hermes |
| `db_snapshots` dan `vm111_backup/db_snapshots` | Masing-masing 1,4G | Data backup. Belum dibuktikan identik atau redundan |
| `.hermes/backups` | 757M | Backup konfigurasi dan kemungkinan titik pemulihan |
| Docker `hitl-backend` | 3,41 GB | Dipakai backend aktif dan container training/evaluasi |
| `/usr`, `/var/lib/snapd`, `.git` | Bervariasi | Jangan hapus folder sistem, data Snap, atau metadata Git secara manual |

Ada juga kejanggalan yang penting. `df` melaporkan **69G terpakai**, sedangkan audit `du` untuk root hanya menghitung **39G** dan berstatus tidak lengkap akibat permission. Jadi masih ada pemakaian yang belum terpetakan. Jangan menganggap daftar ini sudah menjelaskan seluruh isi disk.

## Kalau mau mulai sekarang

Gw pilih **dua operasi terkontrol dulu**\.

Pertama, pertahankan log yang dibutuhkan untuk debugging R20, lalu kurangi log systemd lama dengan mekanisme `journalctl --vacuum-size`, bukan `rm -rf /var/log`\. Operasi vacuum hanya menghapus berkas jurnal arsip, bukan semua log aktif.  [freedesktop.org](https://www.freedesktop.org/software/systemd/man/260/journalctl.html?utm_source=chatgpt.com) [GitHub](https://github.com/systemd/systemd/blob/main/man/journalctl.xml?utm_source=chatgpt.com)

Kedua, bersihkan hanya revisi Snap yang ditandai `disabled`, setelah memeriksa daftar aktifnya. Snap memang menyediakan penghapusan revisi tertentu secara resmi.  [Snap documentation](https://snapcraft.io/docs/tutorials/get-started/?utm_source=chatgpt.com) [Snap documentation](https://snapcraft.io/docs/explanation/how-snaps-work/revisions/?utm_source=chatgpt.com)

**Jangan jalankan `docker system prune -a --volumes` secara massal.** Itu dapat menghapus resource yang tidak sedang direferensikan, termasuk data volume tertentu, dan lu punya beberapa container training/evaluasi yang sudah berhenti tetapi mungkin masih dibutuhkan.  [Docker Docs](https://docs.docker.com/engine/manage-resources/pruning?utm_source=chatgpt.com) [Docker Docs](https://docs.docker.com/reference/cli/docker/volume/prune/?utm_source=chatgpt.com)

Prioritas gw sekarang bukan mengejar pengosongan puluhan GB. **Jaga 52 GiB yang tersedia buat R20, dan audit dulu apakah lonjakan pemakaian setelah resize berasal dari aktivitas dataset/training.** Itu jauh lebih penting daripada menghapus cache yang ternyata masih dipakai.

---

---

## L5-M120 | User | 2026-11-19 11:53:34


message time: 2026-11-19 11:53:34

gw gatau apa yang direspon sama agy krn gabisa dicopy dr tmux dan terminal krn gw lagi remote jg, jadi cek branch research-can dah ada 20 menitan yang lalu dipush, itu lu audit hasil agy

---

---

## L5-M121 | Assistant | waktu tidak ada


Gw audit langsung `research-can` dari commit terbaru, bukan dari laporan tmux. Gw bakal cek apa yang Agy benar-benar push, bukti training dan benchmark, serta apakah target R20 sudah terpenuhi atau masih sebatas klaim. Repo nggak gw ubah.

Ada dua temuan yang perlu lu tahu sebelum menganggap angka Agy sebagai PASS akhir. Benchmark download ternyata dihitung dari log HTTP server lokal, bukan dari event transfer CDP yang disebut di laporan. Selain itu, peningkatan low-light 8,22 poin memakai gabungan hasil beberapa metode, bukan hasil satu pipeline adaptive secara langsung. Gw lagi cek dampaknya ke verdict dan apakah kode R20 sudah tersambung ke aplikasi.

**Agy sudah push R20 ke `research-can` pada 19 November 2026 pukul 11.29 WIB. Ini bukan cuma rencana lagi. Ada source code, model hasil training, laporan benchmark, dan manifest eksperimen.**

**Commit R20** (Ada di GitHub)

`a458c1871568246f4db228024c4e77e0178cae26`

[Buka commit R20 Agy](https://github.com/lustresense/hitl-momo/commit/a458c1871568246f4db228024c4e77e0178cae26)

44 file baru di `r20/`, ditambah pembaruan README, LOG, dan status plan menjadi `[WIP]`\.

**Satu batas penting sudah jelas.** Agy melaporkan training GPU dan pengujian browser sintetis selesai, tetapi **pengujian webcam fisik malam dalam kondisi nyata belum dilakukan**\. Jadi R20 belum layak dinyatakan selesai sepenuhnya, meskipun angka benchmark awalnya terlihat menjanjikan.

## Hasil utama yang Agy laporkan

| Target R20 | Hasil dalam repo | Penilaian audit sementara |
|--------|--------|--------|
| Training dengan GPU server | 2× NVIDIA RTX A5000, masing-masing VRAM sekitar 24 GiB | Ada kode, model, dan laporan training. Eksekusi belum gw ulang |
| Classifier CPU ringan | Model C4 berukuran 73.275 byte, inference TS p95 9,67 µs | Menjanjikan pada benchmark yang dilaporkan |
| Browser anti-lag | 60,04 FPS UI, 24,70 Hz deteksi CPU, 0 LongTask pada tes worker | Lulus **simulasi browser**, belum perangkat siswa |
| Download kurang dari 25 MB | 9,35 MB untuk NUI Lab dan 9,43 MB untuk alur siswa | Lulus pengukuran server lokal, belum deployment nyata |
| Kualitas klasifikasi | Macro-F1 0,9873, naik dari R19 0,9567 | Ada peningkatan pada test offline |
| Webcam redup dan anti-distraksi | Ada pengujian dataset dan skenario sintetis | **Belum lulus acceptance dunia nyata** |

Namun gw menemukan **masalah metodologi penting** pada klaim perbaikan low-light. Laporan menyebut peningkatan deteksi 8,22 poin persentase, tetapi kode perhitungan offline menggabungkan keberhasilan beberapa metode preprocessing sekaligus. Itu bukan pengukuran langsung dari satu jalur adaptive fallback yang berjalan real-time. Angka tersebut belum boleh dianggap bukti bahwa webcam pengguna akan mendapat peningkatan yang sama.

## Temuan kritis dari audit source code

**P1. Perbaikan low-light belum terbukti sebesar yang diklaim**

Pada [augment_hg5g.py](https://github.com/lustresense/hitl-momo/blob/research-can/r20/scripts/augment_hg5g.py), baris 365 memakai logika keberhasilan RAW **atau** CLAHE **atau** A3. Ini menghitung potensi gabungan tiga jalur, bukan kinerja aktual satu adaptive pipeline.

Bahkan pengujian `A4_adaptive` pada subset 720 frame mencatat recall keseluruhan **23,61%**, sama dengan RAW **23,61%**\. Untuk kondisi hampir hitam, hasil terbaik yang dilaporkan baru **2,10% deteksi**, artinya sekitar 98% frame masih gagal.

Verdict Low-light belum memenuhi tujuan pengalaman siswa.

---

**P1. Download di bawah 25 MB belum terverifikasi pada deployment sesungguhnya**

Pada [run_r20_browser_harness.mjs](https://github.com/lustresense/hitl-momo/blob/research-can/r20/scripts/run_r20_browser_harness.mjs), total byte dihitung dari `serverAccessLog` ditambah estimasi 180 byte per respons, **bukan** `Network.loadingFinished.encodedDataLength` dari CDP.

Server penguji juga menerapkan kompresi Zstandard sendiri. Alur halaman berasal dari static build `main-r19`, kemudian membuka R20 harness terpisah.

Angka 9,35 dan 9,43 MB tetap merupakan indikasi positif, terutama karena estimasi tanpa kompresi model masih sekitar 11 MB. Tetapi itu belum membuktikan ukuran unduhan pada domain aplikasi yang benar-benar memakai R20.

---

**P1. Runtime anti-lag belum diuji dalam kondisi pemakaian panjang dan nyata**

Hasil 60 FPS dan 24,70 Hz berasal dari Chromium headless, video simulasi, dan sesi utama sekitar 25 detik. Belum diuji pada webcam fisik dengan gerakan alami, orang kedua, serta perangkat siswa yang CPU-nya lebih lemah.

Strategi B3 juga berpindah ke `numHands=1` setelah tangan terkunci. Itu meningkatkan throughput, tetapi harus diperiksa lagi ketika tangan orang lain masuk dekat posisi pemilik.

---

**P2. Dua GPU tersedia, tetapi belum terbukti keduanya digunakan**

Preflight mendeteksi 2× RTX A5000. Namun skrip training menggunakan `cuda:0` secara default tanpa bukti pembagian pekerjaan ke `cuda:1`\. Ini bukan kegagalan karena satu A5000 mungkin sudah cukup untuk model kecil, tetapi laporan tidak boleh menyamakan GPU terdeteksi dengan GPU terpakai.

Teacher gambar `T-IMG` juga mencatat **F1 untuk kelas PRESS = 0** pada pengujian out-of-fold. Kabar baiknya, model utama C4 yang dipilih adalah hasil retraining focal-loss, bukan teacher tersebut.

## Yang paling menentukan sekarang

**R20 belum masuk ke aplikasi utama.** Agy memang mempublikasikan kandidat model dan worker, tetapi `main` tetap pada commit sebelumnya. Dokumen handoff sendiri masih menginstruksikan integrasi R20 ke NUI Lab setelah ada izin.

Artinya, membuka website siswa sekarang **belum otomatis menguji R20**\. Kita harus membedakan keberhasilan sandbox dengan perilaku aplikasi sebenarnya.

## Verdict audit

NO-GO untuk menyatakan seluruh target R20 selesai atau mempromosikannya ke gameplay siswa.

Tapi ini bukan kegagalan total. Ada kemajuan nyata dibanding R19, terutama model yang lebih kecil, peningkatan macro-F1 offline, dan pemindahan detektor CPU ke worker untuk menghindari main-thread blocking.

**Langkah berikut yang gw prioritaskan adalah meminta Agy mengoreksi evaluasi A4 low-light menjadi pengujian berurutan sesuai runtime sebenarnya, memperbaiki pengukuran network dengan CDP, lalu menyediakan staging NUI Lab terisolasi yang benar-benar memakai R20 untuk webcam fisik.** Setelah itu baru lu uji langsung dalam kondisi lampu atas, redup, backlight, dan distraksi. Jangan ubah `main` dulu.

Sumber audit paling penting ada pada [laporan training](https://github.com/lustresense/hitl-momo/blob/research-can/r20/results/R20_TRAINING_AND_EVAL_REPORT.md), [laporan CPU dan network](https://github.com/lustresense/hitl-momo/blob/research-can/r20/results/R20_CPU_RUNTIME_AND_NETWORK_BENCHMARK.md), serta [protokol webcam fisik](https://github.com/lustresense/hitl-momo/blob/research-can/r20/results/R20_OWNER_NIGHT_WEBCAM_PROTOCOL_AND_HANDOFF.md)\.

### Saran update WORKING\_STATE

- **Yang berubah\:** R20 dipublikasikan di `research-can@a458c187`, dengan model, eksperimen GPU dan laporan benchmark. Audit source menemukan masalah metodologi low-light serta keterbatasan pembuktian network dan runtime.
- **Bagian terdampak\:** R20 training, benchmark CPU, pengukuran download, status integrasi, dan acceptance webcam fisik.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---

---

## L5-M122 | User | 2026-11-19 12:05:19


message time: 2026-11-19 12:05:19

gini, dari keseluruhan itu gw harus prompt gimana ke agy buat dibenahin? soal cuda jelas cukup 1 sih soalnya kecil kan, sama apa ya di main route /nui-lab itu harus bisa ngerekam benchmark gitu lah. kan pas agy pengujian itu benchmarknya belum pake webcam, sedangkan yang di webcam harus gw coba sendiri kan? nah itu setiap percobaan yang ada di /nui-lab apapun itu gestur atau canvas semuanya harus direkam datanya. paham ga?

---

---

## L5-M123 | Assistant | waktu tidak ada


**Paham. Agy harus membenahi R20 sekaligus mengubah `/nui-lab` di branch `main` menjadi tempat benchmark webcam fisik yang merekam seluruh percobaan Gesture Lab dan Canvas Lab.** Lu yang melakukan gerakan di depan webcam, sementara aplikasinya otomatis mengumpulkan bukti untuk dianalisis.

Gw sudah cek source `main`\. Ternyata **recorder-nya sudah ada**, yaitu `lab-recorder.ts`, tetapi belum memenuhi kebutuhan lu.

- Rekaman masih opsional, dimulai manual, disimpan sementara di memori dan dibatasi 20.000 frame.
- Rekaman berhenti ketika kamera atau halaman ditutup. Belum ada penyimpanan sesi yang otomatis bertahan saat pindah halaman.
- Saat deteksi menghasilkan `null`, jalur `NuiLabPage.tsx` keluar sebelum recorder dipanggil. Artinya, beberapa kegagalan deteksi justru hilang dari rekaman.
- Recorder sudah menyimpan landmark, probabilitas R19, pose, lock dan action, tetapi belum menjadi sistem benchmark lengkap yang mencatat CPU, FPS, latensi, download, drop frame, serta konfigurasi R20.

Jadi instruksinya bukan membuat recorder kedua. **Agy harus meningkatkan recorder yang sudah ada menjadi sistem pencatatan eksperimen terpadu.**

Satu GPU RTX A5000 cukup sebagai pilihan awal. Nggak perlu memaksa dua GPU karena ukuran model relatif kecil. Fokus tetap pada hasil CPU pengguna, bukan banyaknya GPU yang terpakai.

## Prompt eksekusi untuk Agy

> **Chat message**
> 
> # EKSEKUSI R20 FIX + NUI LAB PHYSICAL WEBCAM BENCHMARK RECORDER
> 
> Kerjakan langsung sebagai **SATU AGENT UTAMA**. Tidak boleh spawn subagent, delegate ke AI lain, swarm, worker agent, atau background AI agent. Paralelisme komputasi biasa, termasuk CUDA, DataLoader, build, dan test runner tetap boleh.
> 
> **Ini instruksi implementasi, bukan permintaan membuat plan baru.**
> 
> Repository `lustresense/hitl-momo`.
> 
> Baseline yang wajib diperiksa ulang sebelum menulis:
> - `research-can@a458c1871568246f4db228024c4e77e0178cae26`
> - `main@8969502df4e106d8428055c2ca6f80f4f59250ee`
> - Dokumen R20 `[WIP]`, root `AGENTS.md`, `README.md`, `LOG.md`, dan laporan R20 terbaru.
> 
> Target akhirnya adalah R20 yang berjalan ringan pada CPU browser, download kurang dari 25.000.000 byte, responsif tanpa lag mengganggu, serta mampu menghadapi low-light dan distraksi. Seluruh klaim harus dibuktikan.
> 
> ## P0. Koreksi temuan audit R20
> 
> **1. Perbaiki evaluasi adaptive low-light A4.**
> 
> `r20/scripts/augment_hg5g.py` menggunakan `union_ok` pada sekitar baris 365 yang menghitung deteksi berhasil apabila RAW, CLAHE, atau A3 mana pun berhasil.
> 
> Itu adalah *oracle upper bound*, bukan pengukuran akurasi pipeline A4 yang berjalan secara nyata.
> 
> - Pisahkan `oracle_union_recall`, `actual_adaptive_recall`, dan `raw_recall`.
> - Evaluasi A4 secara berurutan, frame demi frame, dengan state missingness, keputusan preprocess, biaya inferensi, dan timing sebagaimana runtime browser.
> - Laporkan jumlah pemanggilan detektor dan overhead recovery. Jangan menyembunyikan tambahan biaya.
> - Bedakan kegagalan detektor dari kegagalan classifier.
> - Kondisi hampir hitam dengan recall 2,10% tetap kegagalan serius, bukan PASS pengalaman pengguna.
> - Iterasikan solusi preprocessing CPU jika hasilnya belum memadai. Jangan mengklaim perbaikan sebesar oracle union.
> 
> **2. Perbaiki pengukuran network.**
> 
> `run_r20_browser_harness.mjs` menghitung `coldTotalBUserBytes` menggunakan log server lokal dengan estimasi header 180 byte. Laporan mengesankan bahwa nilai berasal dari CDP `encodedDataLength`.
> 
> - Ukur transfer browser sebenarnya menggunakan CDP, termasuk target Web Worker.
> - Bandingkan dengan log server untuk rekonsiliasi, bukan menggantikan CDP dengan estimasi.
> - Ukur journey NUI Lab dan onboarding sampai gameplay secara terpisah.
> - Pastikan asset yang benar-benar diunduh tercakup, termasuk WASM, model MediaPipe, FaceDetector, student, JS, CSS, worker, dan fonts.
> - Ukur dengan konfigurasi kompresi deployment yang sebenarnya. Jangan menganggap Zstandard server sandbox otomatis sama dengan dev/production.
> - Batas ketat tetap **kurang dari 25.000.000 byte**.
> 
> **3. Audit runtime dan hand ownership.**
> 
> - Tetap gunakan MediaPipe HandLandmarker.
> - Tidak melatih ulang MediaPipe.
> - Semua inference NUI memakai CPU, tanpa GPU delegate.
> - Audit Web Worker B3, `numHands=2` saat akuisisi dan `numHands=1` saat terkunci.
> - Periksa kemungkinan bystander takeover ketika tangan lain berada dekat posisi tangan utama, bukan hanya ketika terjadi loncatan besar.
> - Pastikan `RELEASE_ALL`, recovery, timestamp monotonik, dropped frames, worker restart, tab hidden, dan camera stop benar.
> - Uji sesi panjang, bukan hanya 25–30 detik.
> 
> **4. GPU training.**
> 
> Satu RTX A5000 cukup sebagai default jika kebutuhan VRAM dan throughput sudah memadai. Tidak perlu memaksakan dual-GPU training.
> 
> Pertahankan C0 R19, C4 R20, dan C7 distilled sebagai pembanding. Teacher tetap offline, student saja yang dikirim ke browser. Tidak perlu retraining besar tanpa evidence yang menunjukkan retraining akan menyelesaikan root cause.
> 
> ## P1. Implementasi sistem benchmark recorder pada MAIN `/nui-lab`
> 
> **Ini izin spesifik untuk mengubah source branch `main` pada ruang lingkup NUI Lab dan dependency minimum yang benar-benar diperlukan.** Jangan mengubah gameplay siswa, storyline, alur HITL, atau UI non-lab.
> 
> Audit dahulu implementasi yang sudah ada:
> - `frontend/implementation/src/components/nui-lab/lab-recorder.ts`
> - `lab-analyzer.ts`
> - `lab-metrics.ts`
> - `NuiLabPage.tsx`
> - `lab-camera.ts`
> - Route `/nui-lab`, `/nui-lab/gesture`, `/nui-lab/canvas`, dan `/nui-lab/diagnostics`
> - Tests existing, terutama `lab-recorder.test.ts`
> 
> **Jangan membuat recorder kedua yang menduplikasi sistem lama. Upgrade arsitektur recorder existing secara kompatibel.**
> 
> ### A. Semua percobaan direkam setelah consent
> 
> Di NUI Lab, sediakan sistem sesi pengujian yang meliputi semua eksperimen Gesture Lab dan Canvas Lab.
> 
> Flow pengguna:
> 
> 1. Tester masuk `/nui-lab`.
> 2. Tester melihat konfigurasi benchmark dan memberikan persetujuan merekam data numerik.
> 3. Tester menekan **Mulai Sesi Benchmark**.
> 4. Kamera tetap hanya aktif setelah tindakan pengguna yang sesuai.
> 5. Semua percobaan pada Gesture Lab dan Canvas Lab otomatis tercatat selama sesi aktif, tanpa perlu menekan tombol rekam lagi setiap kali mengganti gesture.
> 6. Setiap percobaan memiliki `sessionId`, `trialId`, route/mode, dan konfigurasi engine.
> 7. Tester dapat memberi label ground truth atau skenario secara manual.
> 8. Saat berganti route, riwayat percobaan sebelumnya tetap tersimpan.
> 9. Tester menekan **Selesaikan Sesi** dan dapat mengunduh keseluruhan hasil.
> 10. Jika halaman ditutup, refresh, browser crash, atau kamera berhenti, data yang telah disimpan tidak boleh hilang diam-diam. Tandai sesi interrupted/aborted bila relevan.
> 
> Tidak boleh merekam tanpa persetujuan eksplisit. Persetujuan rekaman data tidak sama dengan persetujuan menyimpan video atau mengunggah data ke server.
> 
> ### B. Catat telemetri lengkap yang benar-benar berguna
> 
> **Metadata sesi**
> - Versi app, Git commit, engine/model ID dan hash.
> - Browser, OS, parameter perangkat non-identifying.
> - Resolusi dan FPS kamera, mode preprocessing, model delegate CPU.
> - Status permulaan/penghentian, route, konfigurasi benchmark dan skenario.
> 
> **Deteksi dan performa**
> - Timestamp dan frame ID.
> - Jumlah frame diterima, diproses, dilewati, dan drop.
> - Frame tanpa tangan, kehilangan tracking, reacquisition, hand count, owner lock dan alasan rejection.
> - Mean/center luma, kondisi backlight, preprocessing pass yang benar-benar digunakan.
> - MediaPipe inference p50/p95, preprocess p50/p95, classifier p50/p95.
> - Effective detectHz, video FPS, UI FPS, RAF intervals dan LongTasks.
> - Latency pipeline, worker in-flight, restart, dan release.
> - Resource/buffer telemetry yang benar-benar tersedia dari browser. Jangan mengarang CPU utilization atau memory metrics yang tidak didukung API.
> 
> **Gesture Lab**
> - Landmarks numerik 21 titik ketika tersedia.
> - Frame tanpa landmarks harus tercatat sebagai `DETECTOR_MISS` atau status sebenarnya, bukan hilang.
> - RAW dan stabilized gesture, confidence Top-3, READY/PRESS/OTHER, direction.
> - Geometry guard, thumb/finger state, model veto, FSM state.
> - KEYDOWN, HELD, KEYUP, RELEASE_ALL, false events, loss dan recovery.
> - Ground-truth labels manual, termasuk UNLABELLED bila belum diberi label.
> 
> **Canvas Lab**
> - Drawing start/end, pinch activation dan release.
> - Stroke ID, jumlah titik, panjang/gerakan numerik dan durasi.
> - Jitter raw vs smoothed, gaps, unexpected stroke breaks.
> - 5-finger erase, erase hit/miss, swipe undo/redo, action rejected.
> - Mouse/touch fallback diberi source label agar tidak tercampur dengan gesture.
> - Waktu dari input yang bisa diobservasi hingga aksi canvas.
> - Statistik error/recovery saat tangan hilang.
> 
> **Jangan mengukur physical intent-to-key latency hanya dari timestamp detektor.** Jika tidak ada ground-truth waktu gerakan manusia, laporkan sebagai estimasi pipeline latency.
> 
> ### C. Penyimpanan dan ekspor
> 
> - Gunakan penyimpanan lokal persisten yang sesuai untuk data sesi, misalnya IndexedDB, bukan hanya React state atau array memori.
> - Simpan secara incremental/batched agar UI tidak lag.
> - Jangan menghilangkan frame/event diam-diam ketika batas memori tercapai. Sediakan peringatan kuota, dropped record counter, dan status kegagalan penyimpanan.
> - Ekspor JSON machine-readable lengkap serta summary CSV/JSON yang mudah dibaca.
> - Satu opsi **Unduh Semua Hasil Sesi** yang mencakup metadata, trials, event timeline, benchmark summary, konfigurasi model, dan status validasi.
> - Berikan tombol untuk menghapus data lokal secara eksplisit.
> - Jangan merekam gambar, video, audio, wajah, identitas pribadi, atau mengunggah data tanpa izin baru.
> - Jangan meletakkan hasil webcam Owner dalam repo publik.
> 
> **Penting:** Agy harus memastikan file ekspor bisa dihasilkan langsung dari browser tester, tanpa perlu Owner copy output tmux atau terminal.
> 
> ### D. Dashboard benchmark NUI Lab
> 
> Tambahkan ringkasan yang mudah dibaca pada `/nui-lab`, tanpa menghilangkan UI existing.
> 
> Minimal:
> - Status sesi benchmark dan jumlah percobaan.
> - Engine R19/C4/C7 dan mode RAW/CLAHE/A4 yang sedang digunakan.
> - FPS UI, detectHz, latency p95, dropped frames, missing-hand rate.
> - Total event gesture dan canvas beserta warning keselamatan.
> - Informasi recording aktif, data tersimpan, dan tombol ekspor.
> - Ringkasan hasil per trial untuk membandingkan R19 vs R20.
> 
> Gunakan konfigurasi uji yang eksplisit dan pisahkan hasil tiap kandidat. Jangan membuat hasil R19 dan R20 tercampur dalam satu agregasi yang tidak dapat dilacak.
> 
> Jangan merusak tata letak, gesture guide, hand overlay, Momo, canvas, atau visual system yang sudah ada.
> 
> ## P2. Integrasikan kandidat R20 khusus NUI Lab
> 
> - Sambungkan R20 student C4 dan kandidat pembanding C7 ke NUI Lab.
> - Integrasikan CPU Web Worker dan A4 adaptive preprocessing yang sudah diperbaiki.
> - Pertahankan R19 C0 sebagai baseline yang dapat dipilih dengan jelas.
> - Pastikan perubahan engine/model ditampilkan dan tercatat pada trial.
> - Jangan membuat dua detektor webcam aktif yang saling berebut scheduler.
> - Pastikan Gesture Lab, Canvas Lab, dan Diagnostics menggunakan sesi benchmark dan telemetry layer yang sama.
> - Jika ada konfigurasi yang membutuhkan reload/reinitialization, lakukan aman dengan cleanup dan fail-closed.
> - NUI Lab harus dapat dibuka dan diuji dengan webcam fisik pada browser Owner melalui deployment dev yang sudah diotorisasi. Jangan mengubah deployment produksi lain tanpa izin.
> 
> ## P3. Verifikasi dan regresi
> 
> Jalankan dan publikasikan bukti:
> 
> 1. Unit tests untuk recorder, storage, schema, serialisasi, export, consent, missing hand, route transition dan lifecycle.
> 2. Regression test untuk R19 dan gesture Canvas yang sudah ada.
> 3. Typecheck, lint, build, dan Playwright browser tests.
> 4. Benchmark CPU Web Worker dan A4 ulang dengan evaluasi metodologis yang diperbaiki.
> 5. Network benchmark dengan pengukuran browser yang benar.
> 6. Tes otomatis bahwa recording tidak merusak FPS atau menimbulkan buffer backlog.
> 7. Tes bahwa setiap trial tersimpan, termasuk ketika tidak ada tangan terdeteksi.
> 8. Tes file ekspor bisa diimpor/dianalisis ulang.
> 9. Tes fitur berjalan pada build static-export dan browser target yang relevan.
> 
> Jangan mengklaim webcam fisik sudah diuji menggunakan virtual camera atau video simulasi.
> 
> ## P4. Git, laporan, dan batasan
> 
> - Semua pekerjaan dikerjakan sendiri tanpa AI subagent.
> - Preflight branch HEAD dan working tree sebelum edit.
> - Publikasikan pembetulan riset R20 di `research-can`, beserta bukti, README dan LOG.
> - Integrasi yang diperlukan khusus NUI Lab dilakukan di `main`, dengan commit terpisah yang dapat direview dan di-rollback.
> - Jangan cherry-pick seluruh workspace research ke main.
> - Jangan mengubah modul di luar scope tanpa alasan dependensi yang dijelaskan.
> - Jangan menghapus recorder lama dan bukti riset.
> - Gunakan prosedur deploy dev existing yang sah jika memang sudah diotorisasi; jangan diam-diam mengubah production.
> - Catat full SHA, file changed, test output, skenario PASS/FAIL/NOT_TESTED, performance regressions, dan URL staging yang bisa dibuka Owner.
> 
> Target utama bukan sekadar angka Macro-F1. **Targetnya adalah pengalaman webcam fisik pengguna yang benar-benar usable.**
> 
> Jika masih gagal low-light, CPU latency, download, atau safety, lakukan root-cause analysis dan iterasi yang terukur. Jika terhalang hardware, privasi, izin, atau kebutuhan tes fisik Owner, tulis blocker jelas dan status `[WIP]`. Jangan memalsukan PASS atau menyatakan DONE.
> 
> **Kondisi handoff yang wajib:** Owner dapat membuka `/nui-lab`, menyetujui perekaman, menjalankan gesture/canvas menggunakan webcam, mencoba skenario N1 sampai N6, mengunduh seluruh data dalam satu langkah, dan memberikan file tersebut untuk evaluasi lanjutan tanpa menyentuh terminal server.

Satu hal yang perlu lu bedakan. **Rekaman tersimpan di browser lu tidak otomatis bisa dibaca Agy di server.** Dengan rancangan ini, lu tinggal mengunduh hasil sesi dan mengirim file-nya, tanpa copy tmux. Kalau nantinya lu ingin hasil benchmark otomatis masuk dashboard server, itu perlu jalur upload tersendiri beserta autentikasi dan aturan privasi.

Menurut gw, **prioritas implementasi pertama adalah recorder persisten + integrasi R20 ke NUI Lab**\. Kalau Agy malah menghabiskan waktu retraining teacher lagi sebelum lu bisa mengetes webcam, dia salah prioritas.

### Saran update WORKING\_STATE

- **Yang berubah\:** Owner meminta perbaikan metodologi R20 dan sistem rekaman benchmark terpadu pada seluruh percobaan Gesture dan Canvas di NUI Lab. Satu GPU A5000 dianggap cukup sebagai pilihan awal. Implementasi baru diminta, belum terbukti dikerjakan.
- **Bagian terdampak\:** Workflow Agy, R20, NUI Lab recorder, browser benchmark, QA webcam.
- **Tindakan\:** ketik `UPDATE STATE` untuk versi lengkap pengganti `WORKING_STATE.md`\.

---
Powered by [AI Exporter](https://saveai.net)

---
