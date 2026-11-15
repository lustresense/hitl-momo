# REV-B04 — Handoff implementasi source 0.18.0-alpha

**Tanggal:** 2026-11-15 WIB  
**Owner:** CAN / Sketchbook Universe  
**Sumber:** Owner `GAS`, `REV-0.17.1-alpha.md`, PRD R&D REV-B04 (sumber turunan).  
**Baseline GitHub:** `ujang-monorepo` SHA `24e17c4fd5bfeafbb518203cf4de7b20adf07f19`, `VERSION=0.17.1-alpha`.  
**Target versi global:** `0.18.0-alpha`, branch `ujang-monorepo`, bukan `main`.  
**Status evidensi saat source diajukan:** `STATIC_ONLY / NOT_TESTED`. Tidak ada klaim deployed, unit lulus, runtime bebas stutter atau lowlight berhasil.

## Batas tidak boleh dilanggar

- **JANGAN ubah camera card Claude.** `GlobalCamera`, `camera-widget-card`, preview, toggle, dan morph PIP tetap dari desain lama; referensi HTML hanya menyumbang loading bar dan geometri chat.
- **JANGAN ubah mapping Card 3 `0.17.1-alpha`.** Owner mengatakan mapping Hapus ini SUDAH BENAR. Card 1 telunjuk, jempol selesai meminta Top-3, dan semua gesture lain tidak diubah.
- **B04-004 belum disetujui.** Momo tetap dibangunkan melalui **lambaian**, dengan ring hold/tombol fallback yang sudah ada. ON kamera otomatis wake adalah opsi yang perlu keputusan tersendiri. Tidak ada revisi senyap ke D-20261110-04.
- Tidak ada voice/NLP/LLM, server OpenPose, perubahan model Dias, API endpoint, skema backend, aturan HITL, atau deploy.
- `main` tidak disentuh oleh pekerjaan ini.

## Traceability per tiket

| Tiket | Source yang ditarget | Status saat handoff | Validasi yang belum dilakukan |
|---|---|---|---|
| B04-001 | `DreamLoader.tsx`, `DreamLoader.css`, `landmarker-warmup.ts` | PATCH SOURCE. Warmup setelah intro, progress 80% hanya setelah startup models settle, Momo naik ke awan sekitar 90%, status failed dengan retry dan skip. | Chrome performance trace; 80% check, cold/warm cache, CPU/GPU, reduced-motion, kegagalan jaringan |
| B04-002 | `app/onboarding/cam/page.tsx`, `SketchbookApp.tsx`, `MomoChat.css` | PATCH SOURCE. Static route baru, replaceState setelah loader dan bubble adaptif. | Static-host direct reload, Back/Forward, capture screenshot semua layar/mobile, zoom 200% |
| B04-003 | `landmarker-warmup.ts`, `wave-tracker.ts`, `GlobalCamera.tsx`, tests | PATCH SOURCE. Single cache warm, model sehat dari wave tracker bisa dikembalikan, idle TTL 30s, invalid model close; frame/primary-miss counters. Stream OFF tetap stop tracks. | Webcam fisik, wave success/false wake, face occlusion, motion blur, multi-hand, repeated toggle, browser GPU context loss |
| B04-004 | Tidak ada perubahan pada trigger produk | BELUM DIKUNCI. Default wave tetap, rekomendasi kamera ON dari PRD belum diadopsi. | Owner perlu menentukan A (wave + fallback) atau B (stream-ready ON) lewat keputusan resmi |

## Kontrak loader

`intro Momo 1s -> warming hand -> warm-up blank inference -> FaceDetector settled/fallback -> "ready" -> 80% -> 90% awan -> 100% blast/morph -> onReady -> /onboarding/cam`.

- Tidak memanggil `getUserMedia` selama loader. Frame model warm-up berupa kanvas sintetis 96px, bukan kamera siswa.
- Gagal hand-model tidak mencapai 80% atau 100%; user dapat `Coba lagi` atau `Lewati` ke pointer fallback. Skip adalah sadar pengguna, bukan 80% model ready.
- Jika FaceDetector gagal, app tetap memakai kebijakan hand-only di `face-anchor.ts`; ini mode degraded dan harus dibedakan dari hand-model gagal.
- Pekerjaan `detectForVideo` tetap sinkron dan bisa menyebabkan jank setelah intro. Tidak boleh mengklaim animasi 60 FPS sebelum trace nyata.
- Timeline/progress menggunakan GSAP, bukan persen buatan timer saja. Angka durasi animasi bukan benchmark.

## Kontrak NUI/standby

`getUserMedia -> WaveTracker.takeHandLandmarker -> detectForVideo -> stop/diagnostics -> return healthy instance -> warm cache 30s -> next toggle ON -> take cached instance`.

- `WaveTracker` milik cover diberi `cacheOnStop=true`; pemakai tanpa flag menutup model seperti sebelumnya. Tidak ada pemilik kedua untuk instance yang sedang leased.
- Cache dibatasi satu instance dengan identitas `numHands + modelUrl + wasmRoot`. Idle cache ditutup otomatis (prototype TTL 30s), atau saat `pagehide`; model error ditutup dan tidak dicache.
- Kamera OFF tetap memanggil `stop()` setiap media track, menghapus `video.srcObject`, membersihkan sharedStream dan menghentikan loop.
- Pada peristiwa stale load/stop saat model belum selesai, model dibuat ditutup untuk menghindari lease stale.
- Wave rule `WAVE_WINDOW_MS`, sample minimum, reversal minimum, `FaceAnchor`, `pickPrimaryHand` tidak di-tune berdasarkan tebakan. Instrument `WaveTracker.diagnostics` hanya menunjukkan deteksi dan primary rejection; ini bukan metrik produk sampai data nyata dicatat.

## Matriks QA wajib Ujang

| Kasus | Prosedur | PASS yang harus dibuktikan |
|---|---|---|
| Loader cold/warm | Chrome trace + cache kosong dan hangat | Intro mulus, kerja berat dimulai sesudah posisi tengah, 80% setelah ready, 90% mendekati awan |
| Loader gagal/slow | Simulasikan model network 404, offline, throttle, CPU fallback | Tidak muncul 100% sukses palsu, retry dan skip dapat dipakai, tanpa permission kamera otomatis |
| Routing | Serve `out/` lalu load `/`, `/onboarding/cam` langsung, refresh, Back, Forward | URL sesuai, bukan 404, tepat satu camera card/stream, cover React asli |
| Bubble | Screenshot 320/390/768/1280px, portrait/landscape, zoom 200% | Tidak klip/tumpuk, anchor tetap ke Momo, tidak menutupi kontrol, styling Claude tetap |
| Wave | Webcam biasa, depan/atas/backlight, gestur cepat/pelan, wajah tengah/di luar frame | Catat success/miss/false wake dan latensi; jangan PASS sebelum uji fisik |
| Distraksi | Tangan di depan wajah, orang kedua masuk, gerakan kepala, hand lock | Tidak ada false wake bystander; laporkan primary reject vs landmark loss |
| Camera lifecycle | Toggle 10x, unplug, denied, hidden tab, reload, pagehide | Track OFF, tidak ada rAF setelah stop, cache reuse normal, no duplicate model, GPU recovery jika error |
| Regression | Penggaris, 3 kartu, drawing, thumb, HITL, gameplay, Momo bubble | Tidak mengubah gesture Card1/3 atau flow produk |

## Perintah uji yang harus dijalankan di environment Ujang

```bash
python3 scripts/bump_version.py --check
cd frontend/implementation
npm ci
npm run typecheck
npm run lint
npm test
NEXT_PUBLIC_TEST_HOOKS=0 npm run build
NO_VIDEO=1 node e2e/recovery-paths.mjs
NO_VIDEO=1 node e2e/route-canvas.mjs
NO_VIDEO=1 node e2e/normal-journey.mjs
```

Untuk browser, gunakan static host yang mendukung deep links dari `out/`, bukan hanya History API lokal. Tambahkan Playwright route/camera tests baru dan screenshot baseline jika environment tersedia. Validasi webcam nyata melalui `/nui-lab`; catat `capture FPS`, `effective inference Hz`, `GPU/CPU delegate`, `detectForVideo ms`, `hand count`, `primary index`, `wave reset`, `p50/p95 time-to-wave`, false wake, toggle ON/OFF count dan created/disposed model. Semua threshold numerik sampai hasil kalibrasi adalah **parameter prototype**, bukan klaim akurasi.

## Status penerimaan

- B04-001 **PARTIAL / STATIC_ONLY** hingga pengukuran perf dan visual PDF asli.
- B04-002 **PARTIAL / STATIC_ONLY** hingga static build, deep-link, bubble screenshots dan QA browser.
- B04-003 **PARTIAL / STATIC_ONLY** hingga webcam fisik dan metrik risiko.
- B04-004 **BLOCKED BY PRODUCT DECISION**; wave tetap aktif sesuai keputusan terakhir.

**Tidak tersedia pada sesi source patch:** PDF tiga halaman `REVISIONS.pdf` dan HTML referensi asli; audit visual belum bisa menegaskan kemiripan dengan caption/screenshot. Catatan dalam `REV-0.17.1-alpha.md` dipakai sebagai source tertulis. Tidak ada klaim patch ini sudah diinstal atau di-deploy. Owner cukup membuka URL setelah Ujang memberikan hasil verifikasi.
