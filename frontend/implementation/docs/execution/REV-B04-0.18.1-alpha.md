# REV-B04-004 — Koreksi Owner, kamera ON membangunkan Momo

**Versi source target:** 0.18.1-alpha (patch sesudah batch 0.18.0-alpha)  
**Branch:** `ujang-monorepo`, **main tidak disentuh**  
**Tanggal:** 2026-11-15 WIB  
**Owner evidence:** perintah langsung “wavinghand diganti” dan “PRD LU INI YANG LU IMPLEMENT”, dalam sesi GAS REV-B04.  
**Acuan:** `REV-0.17.1-alpha.md`, PRD REV-B04 bagian 6 opsi B, D-20261115-03, M-035.  
**Status:** `STATIC_ONLY / NOT_TESTED` sampai ada bukti runtime dari Ujang.

## Apa yang memang berubah

PRD REV-B04 bagian 6 sebelumnya meletakkan dua opsi yang belum dipilih. Implementasi `0.18.0-alpha` mempertahankan A dan tidak sesuai dengan instruksi terbaru Owner yang secara eksplisit meminta waving hand diganti. **Owner sekarang memilih opsi B.** Pada cover pengguna tidak harus melambaikan tangan untuk membuka alur. Perubahan hanya pada **pemicu bangun Momo**, bukan gestur lain dalam Sketchbook Universe.

### Perilaku aktif yang harus diuji

1. Domain root tetap menjalankan DreamLoader B04-001. Tanpa izin kamera otomatis.
2. `/onboarding/cam` tetap menggunakan camera card React desain Claude yang sudah ada, awal kamera OFF dan Momo tidur.
3. User mengaktifkan toggle kamera. **Hanya setelah** `getUserMedia` menghasilkan stream non-stale, `video.play()` berhasil dan tidak ada video track yang berstatus ended, Momo terbangun.
4. Animasi Momo kaget, pergerakan camera card ke PIP kiri bawah, Momo menyapa dengan sayap dan teks bubble menggunakan koreografi existing.
5. `Aku mengerti` muncul setelah percakapan Momo ditampilkan, konfirmasi jempol tetap membuka buku dan pindah ke penggaris pada midpoint.
6. Jika kamera tidak ada atau izin ditolak, user dapat melanjutkan lewat fallback pointer manual. Klik toggle saja **tidak** mengesahkan wake.
7. Kamera OFF memanggil `track.stop()`; perangkat yang terputus, request lama (OFF saat permission prompt), pemutaran video gagal, unmount dan `pagehide` harus menutup stream serta tidak membuat wake palsu.
8. Dalam satu sesi cover, wake/terbang/navigation hanya boleh satu kali. ON/OFF berulang tidak memicu perkenalan ganda.

### Batas yang dilarang diubah

- **Card 3 Hapus pada `0.17.1-alpha` benar menurut Owner.** Jangan mengubah mapping Card 3 atau Card 1 telunjuk, maupun gestur jempol.
- Camera card Claude existing, warna, shape, preview natural, morph PIP, Momo avatar, Momo text bubble, dan koreografi visual tetap. Ini bukan redesign HTML cover.
- Momo masih boleh **melambaikan sayap dalam animasi menyapa**. Yang dihapus adalah **kewajiban siswa melakukan waving tangan** untuk bangun Momo.
- `wave-tracker.ts` tetap modul riset/troubleshooting terpisah, bukan gate cover. B04-003 (model warm standby, diagnostic) dan tiket loader/route B04-001/002 yang sudah dipush `0.18.0-alpha` tetap dipertahankan.
- Tidak mengubah backend, model partner, DB, dashboard, API, keputusan HITL, atau branch `main`.

### Delta teknis

- `frontend/implementation/src/components/camera/GlobalCamera.tsx`: cover tidak lagi membuat `WaveTracker`, ring wave atau nudge menunggu wave. Handler `startCamera` membangunkan Momo setelah preview video playable dan state request aman. Tombol `Bangunkan Momo` pada no-camera fallback tetap.
- Tes `global-camera-cover.test.tsx`, `global-camera-wave-flow.test.tsx`, `global-camera-cover-order.test.tsx`, `global-camera-lifecycle.test.tsx`: kontrak cover baru, no-fake-wake, one flight, no wave gate, dialog/confirm tidak regresi.
- `contexts/can/DECISIONS.md` D-20261115-03, `REVISIONS.md`, `OWNER_MANDATES.md`, `NOW.md`, `WORKING_CONTEXT.md`, `PROJECT_MEMORY.md`, root CHANGELOG/version, architecture/run guide dan root NOW diselaraskan.
- `frontend/implementation/docs/execution/REV-B04-0.18.0-alpha.md` tetap dipertahankan sebagai **riwayat**, diberi peringatan bahwa aturan wave B04-004 lama sudah superseded.

### Ujang menguji, bukan mengimplementasi ulang

Dari root repo, verifikasi `python3 scripts/bump_version.py --check`. Dari `frontend/implementation`, jalankan `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, dan `NEXT_PUBLIC_TEST_HOOKS=0 npm run build`. Lanjutkan static-host/browser E2E, screenshot per breakpoint, serta tes webcam nyata. Jika build atau tes gagal, perbaiki berdasarkan bukti, jangan mengubah keputusan produk agar tes hijau.

**Matriks QA kamera:**
- Default OFF, Momo sleeping; test hooks OFF.
- Izin granted + `video.play()` berhasil → wake tepat satu kali dan card morph.
- Permission rejected, no device, playback rejected → tidak wake; status/fallback jelas.
- OFF saat permission prompt dan ON/OFF berulang → no stale stream, no phantom wake.
- Kamera unplug / tab unload → tracks dilepas dan preview aman.
- Cover → dialog penuh → jempol → buku → `/onboarding/number`; tidak ada duplikasi Momo/card.
- Main canvas tetap bisa memakai hand gestures; Card1/3 tetap sesuai 0.17.1-alpha.
- Low-light, lampu plafon dan backlight perlu verifikasi kamera fisik; **jangan mengklaim akurasi meningkat** hanya karena wave gate cover dihapus.

**Batas evidensi:** file source dapat disiapkan melalui GitHub, tetapi `npm`, browser/video dan webcam nyata tidak dijalankan oleh connector. Status adalah `STATIC_ONLY` sampai Ujang mengirim log verifikasi dan URL tunnel dev.
