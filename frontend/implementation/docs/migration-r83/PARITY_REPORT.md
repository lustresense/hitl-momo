# Laporan QA & Paritas — Fase P1 (Kit & Aset) & P2 (Inti NUI)

| Atribut | Nilai |
|---|---|
| Fase yang ditinjau | **P0 Docs/Skrip (`169199c`) + P1 Kit & Aset (`86b9e71`) + P2 Inti NUI (`f7aad84`)** |
| Rentang diff | `c0a65b5..f7aad84` pada branch lokal `r83-migration` (basis `main` @ `3908119`) |
| Reviewer | QA Worker (read-only untuk `src/`, `app/`, `public/`, `tests/`, `package*.json`) |
| Tanggal | 2026-11-25 (WIB) |
| Kelas bukti | **`STATIC_ONLY`** (audit diff, pola terlarang, scoping CSS, byte-exact font/ikon/glyph, cross-check integrasi) + **`UNIT_ONLY`** (eksekusi independen 22 suite Vitest r83: `163/163 PASS`) |
| Bukti webcam / browser | **`NOT_TESTED`** (menunggu I-1 selesai & gerbang **G2** oleh Owner di `/dev/nui`) |

---

## 1. Ringkasan Eksekutif & Rekomendasi Gerbang G2

| Kategori | Jumlah | Rangkuman |
|---|---:|---|
| **`BERAT`** | **5** | 4 temuan berdampak langsung pada uji webcam G2 (`/dev/nui` & Resep R1); 1 temuan berdampak ke semua layar bermaskot Momo mulai P3. |
| **`SEDANG`** | **6** | Sinkronisasi copy `HandLegend` vs `domain/copy/nui.ts`, selector CSS `R83Bubble` (`[data-side="down"]`, `.has-extra`), umpan balik abu-abu pensil saat `frozen`, overlay `#cam-pip::before/::after` menimpa video live, duplikasi konstanta R1, dan potensi nesting `<NuiProvider>`. |
| **`RINGAN`** | **5** | Jumlah baris > 300 pada berkas non-`src` (4 partial CSS, `parity-capture.mjs`, 1 tes), potensi `overflow: hidden` di `<main>` harness, goresan < 200 ms di mini-canvas harness, opsi `group` belum terpakai, dan edge case keyboard saat `frozen`. |

### Rekomendasi Kesiapan Lanjut ke G2 (Setelah I-1)

**BELUM SIAP langsung ke G2 sebelum patch kecil P2 diterapkan.**
Alasan konkret:
1. **`BERAT-1` (`.nui-joy` di luar `[data-ui="r83"]`)** akan langsung merusak visual joystick di Skenario 3 `/dev/nui` begitu I-1 mengimpor `113-r83-nui.css`.
2. **`BERAT-2` (`tGapMs` divergen di `HandSource` vs `LossHold`)** dapat menyebabkan hijack tangan orang kedua atau putus prematur pada Checklist G2 #6 & #7 (cahaya redup / CPU lambat).
3. **`BERAT-3` (`mostHovered` 0,4 s & `R1_STICKY_HOVER_PAD_PX` 24 px belum tersambung)** membuat pengujian Resep R1 pada Checklist G2 #3 (Mode B, 2 target 64 px jarak 24 px) tidak menguji resep R1 secara utuh.
4. **`BERAT-4` (`CanvasCursor` return `null` saat `simOn=false`)** menghilangkan kursor pensil/hapus kamera jika Owner menekan `H` di `/dev/nui`.
5. **`SEDANG-3` & `SEDANG-4`** (pensil tidak abu-abu saat `frozen`, siluet `#cam-pip::after` menimpa `<video>` live) juga langsung tampak pada sesi webcam G2.

Adapun **`BERAT-5` (`MomoStage` vs CSS `112`/`114` & `MomoEngine`)** dan **`SEDANG-2` (`R83Bubble` CSS)** tidak muncul di `/dev/nui`, sehingga **tidak memblokir G2 secara fungsional**, tetapi **wajib diperbaiki sebelum P3 (Sampul & Nama)** dimulai agar tidak memicu kegagalan paritas visual massal di P3–P8.

---

## 2. Verifikasi Kepatuhan Aturan Keras & Spesifikasi

### 2.1 Allowlist, Dependensi, Privasi, dan Pola Terlarang (`STATIC_ONLY`)

| Pemeriksaan | Hasil | Bukti |
|---|---|---|
| Allowlist path (`c0a65b5..f7aad84` & `3908119..f7aad84`) | **LULUS** | 89 berkas ditambah (`A`), 0 berkas diubah di `backend/`, `train/`, `weights/`, `frontend/admin/`, `contracts/`, `contexts/`, NUI Lab, `package.json`, `package-lock.json`, `VERSION`, `CHANGELOG.md`. |
| Dependensi baru / CDN / unduhan eksternal | **LULUS** | 0 perubahan `package*.json`; 0 URL `http://`/`https://` eksternal (hanya namespace `http://www.w3.org/2000/svg` pada `PaperOverlay.tsx:86`, `113-r83-nui.css:55-56`, `nui-bindings.ts:10`). |
| Data palsu & privasi anak (§4, §5.5) | **LULUS** | 0 kemunculan `"Bima"` di `src/`/`app/`; tidak ada nama siswa/audio/frame yang disimpan ke log atau storage (`mouse-source.ts:20,29` hanya menyimpan preferensi dev `"on"\|"off"` di `localStorage`; `HandLegend.tsx:36,45` hanya menyimpan `"1"` di `sessionStorage`). |
| Pola terlarang (`: any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `eslint-disable`, `console.log`, `fetch(`, `eval(`) | **LULUS** | 0 temuan di `src/` dan `app/`. (`console.log` hanya ada di skrip CLI `e2e/r83/parity-capture.mjs:84,403,484,521`.) |
| `innerHTML` / `dangerouslySetInnerHTML` dinamis | **LULUS (statis aman)** | 4 pemakaian di `src/` seluruhnya berupa template SVG statis/ter-escape: `OwnerIcon.tsx:38,55` (key typed + `escapeAttr`), `nui-bindings.ts:106` (konstanta statis + ikon statis `"gesture-pinch"`), `nui-bindings.ts:161` (literal statis). Tidak ada input pengguna yang disuntikkan. |

### 2.2 Kepatuhan PLAN §5.1, §5.3, §5.6, §5.7, dan §7.2

| Bagian PLAN | Status | Catatan Verifikasi |
|---|---|---|
| **§5.1** Prinsip (aditif, logika murni terpisah, TS ketat, satu sumber) | **SEBAGIAN** | Logika murni `core/` & `sources/hand/` terpisah bersih dari React & DOM; **melanggar "satu sumber"** pada `HandLegend.tsx` vs `domain/copy/nui.ts` (`SEDANG-1`) dan duplikasi konstanta R1 di `sources/hand/*` (`SEDANG-5`). |
| **§5.3.1–§5.3.3** Kontrak input, aturan A/B/C/D, latch, `holdMs`, joystick, flick, drag | **LULUS (dengan catatan integrasi)** | Seluruh konstanta Lampiran A (`MOVE_CANCEL_PX=26`, `HOLD_MS 1000/2000/1500`, `RING_DRAIN_RATIO=0.5`, `RING_DT_CAP_MS=50`, joystick `14/0.35/110/0.65`, tap `230/10`, flick joy `40/140/420`, flick stiker `50/160`, drag `12`) dan mesin inti cocok dengan sandbox `hand.js` + O-5. Bug integrasi ada di lapisan React/DOM (`BERAT-1`, `BERAT-4`). |
| **§5.3.4** `HandSource`, Resep R1 | **PERLU PERBAIKAN** | Komponen dasar (`one-euro`, `pointer-filter`, `pinch-detector`, `rollback-buffer`, `loss-hold`, `owner-lock`, `nib-filter`) terimplementasi dan seluruh ekspor fungsinya memiliki tes unit; namun ada **2 bug integrasi kritis**: `tGapMs` divergen (`BERAT-2`) serta `mostHovered` 0,4 s & `R1_STICKY_HOVER_PAD_PX` 24 px belum disambung (`BERAT-3`). |
| **§5.6** Anggaran performa (tanpa live SVG filter fullscreen, tanpa `mix-blend-mode`, tanpa `backdrop-filter` baru, 0 React commit/frame) | **LULUS** | `112-r83-paper.css` bersih dari `mix-blend-mode` & `backdrop-filter`; `PaperOverlay.tsx:85-115` memakai tile grain statis 256×256 `data:image/svg+xml` yang dirasterisasi sekali (identik `lc.js:22-33`); `NuiController`/`NuiRing`/`CanvasCursor`/`PipHand`/`MomoStage`/`R83Bubble` menulis posisi & progres lewat DOM ref + rAF (terbukti 0 commit/frame di `tests/nui/react/nui-provider.test.tsx:48-115`); `WebcamHandDetector` memakai `takeHandLandmarker`/`returnHandLandmarker` tunggal (`DEFAULT_NUM_HANDS = 2`). |
| **§5.7** Kit visual (font, 39 ikon + 3 legacy glyphs byte-exact, CSS scoped `[data-ui="r83"]`) | **LULUS (aset), GAGAL (wiring CSS Momo)** | `BowlbyOne-Regular.woff2` (21.536 B, sha256 `e2f3c84b26df8512d2cda4a9595e278e67b3efc86c5866b0a89ac45a16625e35`) & `HankenGrotesk-Variable.woff2` (34.704 B, sha256 `e9201eddf1d41d0b62253295d869ce3cf65768f7102b797f02c7f8c876b4a9d5`) **byte-exact** terhadap `proto-html/r83/shared/fonts.css`. 39 ikon `owner-icons.data.ts` & 3 glyph `legacy-glyphs.ts` **byte-exact** (0 mismatch). 0 selector bocor di luar `[data-ui="r83"]` pada `110`–`114`. Namun selector Momo & beberapa selector bubble/joystick tidak cocok dengan markup komponen (`BERAT-1`, `BERAT-5`, `SEDANG-2`). |
| **§7.2 / §5.1.7** Ukuran file (`≤ 300` baris, akar komposisi `≤ 200` baris) | **LULUS (`src/**`), CATATAN (non-`src`)** | Seluruh berkas TS/TSX di `src/**` ≤ 300 baris (terbesar `PaperOverlay.tsx` 291, `nui-controller.ts` 289, `hand-source.ts` 288); akar komposisi `NuiHarness.tsx` (128) & `ScreenFrame.tsx` (55) ≤ 200 baris. 4 berkas CSS, 1 E2E, dan 1 berkas tes > 300 baris (`RINGAN-1`). |

### 2.3 Bukti Pengujian Independen (`UNIT_ONLY`)

- **SHA commit lokal:** `f7aad84` (branch `r83-migration`)
- **Perintah:** `npx vitest run tests/components/owner-icons.test.ts tests/features/shared/ tests/nui/` (di `frontend/implementation`)
- **Exit code:** `0`
- **Hasil:** **22/22 test files PASS, 163/163 tests PASS** (durasi 6,26 dtk). Seluruh fungsi ekspor di `src/nui/core/*` dan `src/nui/sources/hand/*` terverifikasi memiliki referensi uji di `tests/nui/`.

---

## 3. Daftar Temuan Kode

### 3.1 Temuan `BERAT` (5)

#### `BERAT-1` — Overlay joystick `.nui-joy` ditambahkan ke `document.body` di luar scope `[data-ui="r83"]`
- **Lokasi:**
  - `frontend/implementation/src/nui/react/nui-bindings.ts:157-166`
  - `frontend/implementation/app/styles/113-r83-nui.css:263-296`
  - `frontend/implementation/src/nui/dev/NuiHarness.tsx:51-53`
- **Masalah:** `bindJoystick` menempelkan `<svg class="nui-joy">` langsung ke `document.body` (`nui-bindings.ts:162`), sedangkan seluruh aturan gaya `.nui-joy` (`position: fixed`, `inset: 0`, `width: 100vw`, `height: 100vh`, `pointer-events: none`, `display: none`, `.nui-joy.on`, `.a`, `.l`, `.k`) di-scope ke `[data-ui="r83"] .nui-joy` (`113-r83-nui.css:263-296`). Atribut `data-ui="r83"` terpasang di `<main>` (`NuiHarness.tsx:52`) atau `<ScreenFrame>` (`ScreenFrame.tsx:45`), bukan di `<body>`. Akibatnya, overlay joystick tidak pernah cocok dengan CSS-nya dan muncul sebagai `<svg>` aliran dokumen 300×150 tanpa garis oranye di bagian bawah halaman saat G2 Skenario 3 dan seluruh layar dunia.
- **Rekomendasi perbaikan (sebelum G2):** Pasang overlay ke elemen `[data-ui="r83"]` terdekat (`document.querySelector('[data-ui="r83"]') ?? document.body`), ATAU set `svg.setAttribute("data-ui", "r83")` pada `<svg class="nui-joy">` dan tambahkan selector `[data-ui="r83"].nui-joy` (beserta `.on`, `.a`, `.l`, `.k`) di `113-r83-nui.css:263-296`.

#### `BERAT-2` — `tGapMs` di `HandSource` dihitung dari `this.dts` terpisah (tercemar frame kosong), menyimpang dari `LossHold.tGap()`
- **Lokasi:**
  - `frontend/implementation/src/nui/sources/hand-source.ts:67, 147-160, 232`
  - `frontend/implementation/src/nui/sources/hand/loss-hold.ts:40-76`
- **Masalah:** `LossHold` menghitung `T_gap = clamp(3 * median(dts), 250, 500)` hanya dari interval frame saat tangan pemilik terlihat (`loss-hold.ts:41-45`), sedangkan `HandSource` mengelola array `this.dts` sendiri yang mencatat interval **semua** frame termasuk frame kosong saat tangan hilang (`hand-source.ts:147-153`). Pada webcam nyata dengan delegate CPU / CLAHE redup, frame dengan tangan bisa ~120 ms (`lossHold.tGap() = 360 ms`), tetapi saat tangan keluar frame sebentar, frame kosong tiba tiap ~33 ms sehingga `tGapFor(this.dts)` turun ke `250 ms`. Pada selang 250–360 ms:
  1. `matchHands` (`hand-source.ts:232`) menghapus `TrackedHand` pemilik dan `ownerLock.update` (`hand-source.ts:157`) melepas `owner` lebih dini.
  2. Jika tangan terbuka orang kedua hadir di frame pada 250–360 ms, `ownerLock` langsung mengunci orang kedua dan `lossHold.update(t, true, true)` melihat `t - lastSeen <= 360` lalu beralih `held -> tracking` **tanpa `expired`** — kendali (dan cubit) berpindah ke orang kedua.
  3. Jika pemilik kembali dalam keadaan mencubit di 280 ms (< 360 ms), tangannya diberi ID baru dan tidak bisa mengambil alih `ownerLock` (butuh `open`), sehingga ring/goresan terputus sebelum `T_gap` habis.
- **Rekomendasi perbaikan (sebelum G2):** Hapus `this.dts` duplikat di `HandSource` dan gunakan satu sumber tunggal `const tGapMs = this.lossHold.tGap();` untuk `matchHands` dan `ownerLock.update`. Tambahkan unit test regresi di `tests/nui/sources/hand-source.test.ts` untuk skenario `dt` tangan 120 ms + frame kosong 33 ms selama 280 ms dengan tangan orang kedua hadir.

#### `BERAT-3` — Dua mekanisme Resep R1 (PLAN §5.3.4) belum tersambung: rollback hover mayoritas 0,4 detik (`mostHovered`) & hover lengket 24 px (`R1_STICKY_HOVER_PAD_PX`)
- **Lokasi:**
  - `frontend/implementation/src/nui/react/nui-controller.ts:146-152, 232-241`
  - `frontend/implementation/src/nui/core/engine.ts:75-94, 130, 179-189`
  - `frontend/implementation/src/nui/core/constants.ts:140`
  - `frontend/implementation/src/nui/sources/hand-source.ts:30, 142, 213-214`
- **Masalah:**
  1. PLAN §5.3.4 mensyaratkan *"Target B = hover terbanyak dalam 0,4 s sebelum `PINCH_ON`"*. Walau `rollback-buffer.ts:54` sudah menyediakan `mostHovered(tEnd, 400)` dan `HandSource` menyediakan `getHoverId` / `mostHovered`, `NuiController.setHandDetector` (`nui-controller.ts:146-152`) tidak meneruskan `getHoverId`, dan `NuiEngine.lockAt` (`engine.ts:179-189`) tidak pernah menerima target hasil `mostHovered`. Akibatnya `mostHovered` menjadi kode mati dan Mode B hanya bergantung pada satu titik `clickPoint` pada `t - 200 ms`.
  2. PLAN §5.3.4 mensyaratkan *"Hover lengket: area kena diperluas 24 px. Magnet mati di kanvas"*. Konstanta `R1_STICKY_HOVER_PAD_PX = 24` (`constants.ts:140`) tidak diimpor maupun dipakai di `NuiEngine` atau `geometry.ts`, sehingga sorotan Mode B pada dua target 64 px berjarak 24 px langsung berpindah tanpa histeresis di batas tengah (padahal `HarnessPanelAB.tsx:14` mengklaim menguji *"hover lengket"*).
- **Rekomendasi perbaikan (sebelum G2):**
  1. Berikan `id` stabil per target di `NuiEngine`/`NuiController`, sambungkan `getHoverId` di `NuiController.setHandDetector` (membaca target aktif/terdekat saat ini pada Mode B non-kanvas), dan saat `PINCH_ON` dari `source === "hand"`, teruskan `preferredTargetId = handSource.mostHovered(sample.t, R1_HOVER_LOOKBACK_MS)` ke `NuiEngine.feed` / `lockAt` sebagai prioritas kunci Mode B sebelum fallback ke `nearestItem(pool, clickPoint)`.
  2. Terapkan sticky-hover di `NuiEngine.tick` untuk Mode B non-kanvas: bila `lastLit` masih aktif dan pointer masih berada di dalam rect `lastLit` yang diperluas `R1_STICKY_HOVER_PAD_PX` (24 px) serta belum masuk ke dalam rect aktual target lain, pertahankan `lastLit` agar sorotan tidak berkedip; pastikan tetap mati saat `canvasMode === true`.

#### `BERAT-4` — `CanvasCursor` di-unmount saat `simOn === false` walaupun sumber aktif adalah tangan kamera (`activeSource === "hand"`)
- **Lokasi:**
  - `frontend/implementation/src/nui/react/CanvasCursor.tsx:56, 88`
  - *(Bandingkan dengan pola yang benar di `frontend/implementation/src/nui/react/PipHand.tsx:35`.)*
- **Masalah:** `CanvasCursor.tsx:56` dan `:88` mengecek `if (!status.canvasMode || !status.simOn) return null;`. Jika `simOn` mati (mis. Owner menekan tombol `H` di `/dev/nui` agar mouse menjadi kursor normal saat menguji tangan kamera, atau `autoSim={false}`), kursor pensil/hapus kanvas hilang sepenuhnya padahal `status.activeSource === "hand"`.
- **Rekomendasi perbaikan (sebelum G2):** Ubah syarat pada `CanvasCursor.tsx:56` dan `:88` menjadi `const active = status.canvasMode && (status.simOn || status.activeSource === "hand");` agar konsisten dengan `PipHand.tsx:35`.

#### `BERAT-5` — Mismatch kelas container & struktur SVG `MomoStage` (`MomoEngine`) terhadap CSS Polo Factory `112-r83-paper.css` & `114-r83-momo.css`
- **Lokasi:**
  - `frontend/implementation/src/features/shared/MomoStage.tsx:194, 197`
  - `frontend/implementation/src/components/momo/momo-engine.ts:20, 44-68`
  - `frontend/implementation/app/styles/112-r83-paper.css:574-647`
  - `frontend/implementation/app/styles/114-r83-momo.css:353-387`
- **Masalah:**
  1. `MomoStage.tsx:194` merender `className="r83-momo-stage"`, sedangkan `112-r83-paper.css:574-647` dan `114-r83-momo.css:353-387` menyasar `.r83-momo` / `#momo` — 0 aturan CSS Momo yang cocok!
  2. Walaupun kelas `.r83-momo` ditambahkan, `MomoStage` merender `<MomoAvatar>` yang membangkitkan SVG dari `src/components/momo/momo-engine.ts:44-68` dengan struktur & warna berbeda dari `proto-html/r83/shared/momo-art.js`:
     - Grup badan `.root` (CSS menyasar `.sleep-breath`);
     - Sayap `.fL`, `.fR` (CSS menyasar `.wing-left`, `.wing-right`);
     - Ekor & pita `.tA`, `.bow` (CSS menyasar `.tail-twirl`, `.momo-bow`);
     - Mata terpejam `.cL`, `.cR` (CSS `114-r83-momo.css:372` menyasar `#eyes-closed path`);
     - Atribut `fill` case-sensitive & beda hex: `fill="#2E0D06"` (CSS menyasar `#2e0d06`), `fill="#B2DB8E"` (CSS menyasar `#b5da93`), `fill="#E4551B"` (CSS menyasar `#e4551b`).
     Akibatnya seluruh skin Polo Factory Momo (penghapusan outline gelap, gradien `url(#lc-body)` / `url(#lc-wing)`, ekor `--lc-deep-green`, drop-shadow) tidak aktif pada `MomoStage`.
  3. `MomoStage.tsx:197` memasang inline `zIndex: 45`, berbeda dari `114-r83-momo.css:358` & sandbox `layout.css:39` (`z-index: 30`).
- **Rekomendasi perbaikan (wajib sebelum P3; tidak memblokir G2):**
  1. Tambahkan kelas `r83-momo` pada `MomoStage.tsx:194` (mis. `r83-momo r83-momo-stage`) dan selaraskan default `zIndex` ke `30` (sesuai `layout.css:39` & `114-r83-momo.css:358`, dengan opsi prop override bila suatu layar perlu).
  2. Tambahkan selector padanan SVG `MomoEngine` di `112-r83-paper.css:574-647` dan `114-r83-momo.css:372-387` (`.r83-momo .root > path[fill="#2E0D06" i]`, `.r83-momo .fL`, `.r83-momo .fR`, `.r83-momo .tA`, `.r83-momo .bow`, `path[fill="#B2DB8E" i]`, `path[fill="#E4551B" i]`, `.cL`/`.cR`), sambil mempertahankan selector `#momo` lama untuk kompatibilitas.

---

### 3.2 Temuan `SEDANG` (6)

#### `SEDANG-1` — `HandLegend.tsx` tidak sinkron dengan `src/domain/copy/nui.ts` (duplikasi sumber copy & teks berbeda)
- **Lokasi:**
  - `frontend/implementation/src/nui/react/HandLegend.tsx:11-25, 101-119`
  - `frontend/implementation/src/domain/copy/nui.ts:13-27, 61-63`
  - `frontend/implementation/src/nui/react/NuiRing.tsx:106`
- **Masalah:** `HandLegend.tsx` tidak mengimpor `src/domain/copy/nui.ts` melainkan mendefinisikan `NUI_LEGEND_COPY` sendiri (melanggar PLAN §5.1.3). Terdapat 3 ketidaksinkronan nyata:
  1. `HandLegend.tsx:23-24` memuat copy mode kamera (`handLead`/`handTail`: *"Tangan kamera aktif · cubit dan tahan = pilih · cubit lalu geser = tarik · kursor cuma ada di kanvas"*) yang belum ada di `src/domain/copy/nui.ts`.
  2. `HandLegend.tsx:112` hanya menampilkan `" · H = mouse biasa"` ketika `status.devTools === true`, sedangkan `src/domain/copy/nui.ts:18, 21` menggabungkannya secara tetap ke `simOnSegments`/`simOnPlain` (kurang tepat untuk produksi karena tombol `H` khusus dev per §5.3.1).
  3. `NuiRing.tsx:106` menulis literal `` `${label}, cubit dan tahan` `` alih-alih memakai `ringAriaLabel(label)` dari `src/domain/copy/nui.ts:61`.
- **Rekomendasi perbaikan (sebelum G2 / saat patch P2):** Pindahkan `handSegments` dan pisahkan suffix dev `" · H = mouse biasa"` ke `src/domain/copy/nui.ts`, lalu impor `NUI_LEGEND` di `HandLegend.tsx` dan `ringAriaLabel` di `NuiRing.tsx`.

#### `SEDANG-2` — Selector CSS `R83Bubble` yang hilang: `[data-side="down"]::after`, `.r83-bubble.has-extra`, dan `.r83-bubble__extra`
- **Lokasi:**
  - `frontend/implementation/src/features/shared/R83Bubble.tsx:17, 36, 81, 102-106, 194, 209`
  - `frontend/implementation/src/features/shared/bubble-placement.ts:24, 160-175`
  - `frontend/implementation/app/styles/114-r83-momo.css:43-118`
  - *(Rujukan sandbox: `proto-html/r83/shared/level/level.css:75-77`.)*
- **Masalah:**
  1. `R83Bubble` dan `placeBubble` mendukung `side="down"` (bubble di bawah Momo, menyetel `--tail-x` dan menghapus `--tail-y`), tetapi `114-r83-momo.css` (dan `111`/`112`) tidak memiliki `[data-side="down"]::after`. Akibatnya ekor bubble jatuh ke sisi kiri default (`left: -11px; top: var(--tail-y)`).
  2. `R83Bubble.tsx:194, 209` merender `.r83-bubble.has-extra` dan `.r83-bubble__extra`, tetapi aturan sandbox `level.css:75-77` (`width: min(clamp(340px, 30vw, 460px), calc(100vw - 24px)) !important; pointer-events: auto` untuk `.has-extra`, dan `margin-top: 10px; font-weight: 700` untuk extra slot) tidak ada di `114-r83-momo.css`.
  3. `.r83-bubble.is-visible` diset di `R83Bubble.tsx:194` tetapi tidak punya rule CSS (jika GSAP dibekukan di `T = 0` sebelum tween masuk, elemen tetap `opacity: 0` dari `114-r83-momo.css:60`).
- **Rekomendasi perbaikan (sebelum P3):** Tambahkan `[data-side="down"]::after` (ekor di `top: -11px; left: var(--tail-x, 50%); transform: translateX(-50%) rotate(45deg)`), `.r83-bubble.has-extra`, dan `.r83-bubble__extra` di `114-r83-momo.css` (plus aturan transparan border pada `112-r83-paper.css` bila perlu).

#### `SEDANG-3` — Kursor pensil di atas kertas (`CanvasCursor`) tidak berubah abu-abu saat `frozen` (`< T_gap`)
- **Lokasi:**
  - `frontend/implementation/src/nui/react/CanvasCursor.tsx:68-84, 108-122`
  - `frontend/implementation/app/styles/113-r83-nui.css:90-94`
- **Masalah:** PLAN §5.3.4 menyatakan saat tangan hilang `< T_gap`: *"kursor beku dan abu-abu, ring tidak turun"*. `CanvasCursor.tsx:70` menyalakan kelas `.is-lost`, tetapi `113-r83-nui.css:90-94` hanya mengatur `#hand-cursor.is-lost .hc-ring` — padahal saat di atas kertas `.hc-ring` berstatus `display: none` (`CanvasCursor.tsx:74`). Akibatnya `.r83-cursor-pencil` tetap berwarna hitam penuh (`--nb-ink`) tanpa indikasi visual beku/abu-abu, dan ikon di dalam `.r83-cursor-eraser` tidak ikut meredup.
- **Rekomendasi perbaikan (sebelum G2):** Pada `CanvasCursor.tsx:75-84` (atau di `113-r83-nui.css` untuk `#hand-cursor.is-lost .r83-cursor-pencil` / `.r83-cursor-eraser`), ubah `color: #9a968c` dan `opacity: 0.55` saat `lost === true` (dan kembalikan saat pulih).

#### `SEDANG-4` — `HarnessCameraPip` memakai `id="cam-pip"` di dalam `[data-ui="r83"]`, sehingga siluet placeholder `#cam-pip::before/::after` menimpa `<video>` live saat G2
- **Lokasi:**
  - `frontend/implementation/src/nui/dev/HarnessCameraPip.tsx:79-110`
  - `frontend/implementation/app/styles/114-r83-momo.css:393-428`
- **Masalah:** Di sandbox, `#cam-pip` adalah kotak mock kamera tanpa `<video>`, sehingga `layout.css:45-46` (`114-r83-momo.css:408-428`) menggambar kotak putus-putus (`::before`) dan persegi lensa abu-abu (`::after`) di tengahnya. Di `HarnessCameraPip.tsx:80-108`, `<video>` live diletakkan di dalam `<div id="cam-pip">` di bawah `<main data-ui="r83">`; begitu `114-r83-momo.css` diimpor di I-1, `::after` akan tergambar di atas feed video kamera Owner.
- **Rekomendasi perbaikan (sebelum G2):** Tambahkan kelas `has-video` / `is-live` pada `#cam-pip` saat `camOn === true` (atau gunakan class khusus di harness) dan sembunyikan `::before`/`::after` ketika video live aktif (`[data-ui="r83"] #cam-pip.has-video::before, [data-ui="r83"] #cam-pip.has-video::after { display: none; }` — sekaligus berguna untuk `GlobalCamera` PIP di P3–P8).

#### `SEDANG-5` — Duplikasi konstanta Resep R1 di 5 modul `src/nui/sources/hand/*` (tidak mengambil dari `src/nui/core/constants.ts`)
- **Lokasi:**
  - `frontend/implementation/src/nui/core/constants.ts:114-140`
  - `frontend/implementation/src/nui/sources/hand/pointer-filter.ts:13-19`
  - `frontend/implementation/src/nui/sources/hand/pinch-detector.ts:3-7`
  - `frontend/implementation/src/nui/sources/hand/rollback-buffer.ts:3-5`
  - `frontend/implementation/src/nui/sources/hand/loss-hold.ts:1-3`
  - `frontend/implementation/src/nui/sources/hand/nib-filter.ts:5-8`
- **Masalah:** Seluruh parameter R1 didefinisikan dua kali sebagai literal angka terpisah. Melanggar PLAN §5.1.3 (*"Satu sumber per hal: Angka paritas di `src/nui/core/constants.ts`"*), dan berisiko tinggi menimbulkan bug diam-diam bila Owner meminta penyetelan parameter R1 pasca-G2 dan hanya satu lokasi yang diubah.
- **Rekomendasi perbaikan (sebelum G2 / saat patch P2):** Impor konstanta `R1_*` dari `../../core/constants` di kelima berkas `src/nui/sources/hand/*` dan ekspor ulang alias yang sudah ada (mis. `export const PINCH_ENTER_R = R1_PINCH_ENTER_R;`) agar kompatibel dengan seluruh tes yang ada.

#### `SEDANG-6` — `NuiHarness` selalu membungkus `<NuiProvider devTools testHooks>` sendiri (risiko nesting provider dengan I-1 & `testHooks` selalu aktif)
- **Lokasi:**
  - `frontend/implementation/src/nui/dev/NuiHarness.tsx:50`
  - `frontend/implementation/src/nui/react/NuiProvider.tsx:30-65`
- **Masalah:**
  1. `NuiHarness.tsx:50` memanggil `<NuiProvider devTools testHooks>` tanpa memeriksa apakah sudah berada di dalam `<NuiProvider>` induk. Jika I-1 memasang `<NuiProvider>` di root aplikasi saat `NEXT_PUBLIC_UI_R83=1` dan `/dev/nui` mewarisinya, dua `NuiController` akan hidup bersamaan (2 rAF, 2 `MouseSource`, 2 listener `keydown`/`click`, saling timpa kelas `html.hand-sim`/`nui-canvas` dan `window.__skbNui`).
  2. Properti `testHooks` di-hardcode `true`, sehingga memasang `window.__skbNui` pada `/dev/nui` bahkan ketika `NEXT_PUBLIC_TEST_HOOKS=0` (PLAN §5.3.1: `TestSource` hanya ada bila `NEXT_PUBLIC_TEST_HOOKS=1`).
- **Rekomendasi perbaikan (sebelum G2):** Pastikan route `app/dev/nui/page.tsx` tidak berada di bawah `<NuiProvider>` kedua (atau sediakan guard context di `NuiHarness` agar menggunakan provider induk bila sudah ada), dan hapus override `testHooks` literal pada `NuiHarness.tsx:50` agar mengikuti default `process.env.NEXT_PUBLIC_TEST_HOOKS === "1"`.

---

### 3.3 Temuan `RINGAN` (5)

1. **`RINGAN-1` — Jumlah baris > 300 pada berkas non-`src` (CSS, E2E, tes):**
   - `frontend/implementation/app/styles/111-r83-tokens.css` (328 baris), `112-r83-paper.css` (972 baris), `113-r83-nui.css` (398 baris), `114-r83-momo.css` (451 baris), `frontend/implementation/e2e/r83/parity-capture.mjs` (528 baris), `frontend/implementation/tests/features/shared/bubble-placement.test.ts` (403 baris).
   - Catatan: Seluruh berkas TS/TSX di `src/**` mematuhi batas `≤ 300` baris (`PaperOverlay.tsx` 291, `nui-controller.ts` 289, `hand-source.ts` 288) dan akar komposisi `≤ 200` baris (`NuiHarness.tsx` 128, `ScreenFrame.tsx` 55).
2. **`RINGAN-2` — `NuiHarness` `<main data-ui="r83">` berisiko terpotong di viewport pendek karena `111-r83-tokens.css:44-52`:**
   - `frontend/implementation/app/styles/111-r83-tokens.css:46-48` menyetel `height: 100%; overflow: hidden;` pada `[data-ui="r83"]`. Di `frontend/implementation/src/nui/dev/NuiHarness.tsx:51-64`, tambahkan `height: "auto"` dan `overflowY: "auto"` pada inline style `<main>` agar halaman harness dev tetap bisa digulir pada layar 720p.
3. **`RINGAN-3` — Goresan kamera < 200 ms hilang saat lepas di mini-canvas `HarnessPanelD`:**
   - `frontend/implementation/src/nui/dev/HarnessPanelD.tsx:146-149` & `frontend/implementation/src/nui/sources/hand/nib-filter.ts:15-20`. `trimTail` mempertahankan 1 titik untuk goresan yang durasinya ≤ 200 ms, lalu `if (finalStroke.length >= 2)` di `HarnessPanelD.tsx:149` membuangnya (khusus mini-canvas harness; kanvas P6 akan memakai `StrokeStore`).
4. **`RINGAN-4` — Prop `group?: string` pada API target NUI belum diteruskan ke `NuiEngine`:**
   - `frontend/implementation/src/nui/react/nui-controller.ts:173-175`, `src/nui/react/nui-bindings.ts:42`, `src/nui/react/useNuiTarget.ts:16`, `src/nui/react/NuiRing.tsx:27`. Saat ini belum dipakai oleh sandbox `hand.js`, bersifat reserved API.
5. **`RINGAN-5` — Edge case keyboard Enter/Spasi saat kamera macet total di kondisi `frozen`:**
   - `frontend/implementation/src/nui/react/nui-controller.ts:213` menahan `this.engine.tick(now)` selama `this.status.frozen === true`. Jika video kamera berhenti mengirim frame permanen tepat saat `frozen`, keyboard Enter/Spasi ikut tertahan hingga mouse digerakkan (SourceArbiter mengambil alih setelah 500 ms dan mereset `frozen: false`). Dapat dimitigasi ringan dengan melepas `frozen` saat `now - lastHandFrameT > R1_T_GAP_MAX_MS`.

---

## 4. Rencana Perbaikan Konkret (Prioritas)

### Paket Patch Pra-G2 (wajib sebelum Owner menjalankan `WEBCAM_QA.md` G2)
1. **`BERAT-1`:** Pindahkan penempelan `<svg class="nui-joy">` ke kontainer `[data-ui="r83"]` (atau beri `data-ui="r83"` + selector `[data-ui="r83"].nui-joy`) di `nui-bindings.ts:157-166` & `113-r83-nui.css:263-296`.
2. **`BERAT-2`:** Ganti `tGapFor(this.dts)` di `hand-source.ts:153` menjadi `this.lossHold.tGap()`, hapus `this.dts` duplikat, dan tambah tes unit regresi.
3. **`BERAT-3`:** Sambungkan `getHoverId` + `mostHovered(400 ms)` dari `HandSource` ke `NuiController`/`NuiEngine` untuk Mode B saat `PINCH_ON`, serta terapkan sticky-hover `R1_STICKY_HOVER_PAD_PX` (24 px) di Mode B non-kanvas.
4. **`BERAT-4` & `SEDANG-3`:** Izinkan `CanvasCursor` aktif saat `status.activeSource === "hand"` (walau `simOn === false`) dan terapkan gaya abu-abu/redup pada `.r83-cursor-pencil` & `.r83-cursor-eraser` saat `frame.frozen === true`.
5. **`SEDANG-4` & `SEDANG-6`:** Sembunyikan `#cam-pip::before/::after` saat `<video>` live aktif di `HarnessCameraPip`/`114-r83-momo.css`, pastikan tidak ada nesting `<NuiProvider>`, dan hormati `NEXT_PUBLIC_TEST_HOOKS` di `NuiHarness.tsx:50`.
6. **`SEDANG-1` & `SEDANG-5`:** Sinkronkan `HandLegend.tsx` & `NuiRing.tsx` ke `src/domain/copy/nui.ts` dan jadikan `src/nui/core/constants.ts` sumber tunggal konstanta R1 bagi `src/nui/sources/hand/*`.

### Paket Patch Pra-P3 (wajib sebelum Worker P3 Sampul & P5 Pilih Level)
7. **`BERAT-5`:** Tambahkan kelas `.r83-momo` dan selaraskan `zIndex: 30` pada `MomoStage.tsx:194,197`; tambahkan selector Polo Factory untuk struktur SVG `MomoEngine` (`.root`, `.fL`, `.fR`, `.tA`, `.bow`, `.cL`/`.cR`, `#2E0D06`, `#B2DB8E`, `#E4551B`) pada `112-r83-paper.css` & `114-r83-momo.css`.
8. **`SEDANG-2`:** Tambahkan `[data-side="down"]::after`, `.r83-bubble.has-extra`, dan `.r83-bubble__extra` pada `114-r83-momo.css`.

---

# Bagian II — Rekonsiliasi Wave 2–5 (`P2 Patch`, `I-1`, `P3–P8`, `P4`, `P7b`, `I-2`, `P9` & `P9a MoNUI-7`)

| Atribut | Nilai |
|---|---|
| Tanggal rekonsiliasi | 2026-11-25 (WIB) |
| Basis commit terverifikasi di repo | `238dfeb` (P2 QA patch) → `34c15f6` (I-1) → `0a75d29`..`eaa5a20` (Wave 2: P3/P5/P6/P7/P8) → `a3e4c48` (Wave 3: P4 & P7b) → `c2a7e9a` (Wave 4: I-2) |
| Sumber fakta | `docs/migration-r83/STATUS.md`, `DECISIONS_DRAFT.md`, `COPY_RECONCILIATION.md`, `e2e/r83/logs/r83-perf-report.json`, serta berkas kode di `src/` & `e2e/r83/` |

## 5. Progres P2 Patch, I-1, dan Wave 2 (Tercatat di `STATUS.md`)

1. **Penutupan Temuan Pra-G2 (`238dfeb`):** Seluruh `5 BERAT` dan `6 SEDANG` pada Bagian I ditutup; verifikasi unit NUI r83 naik ke **187/187 PASS** (`UNIT_ONLY`).
2. **Integrasi Awal `I-1` (`34c15f6`):** Flag `uiR83()` / `devTools()`, import CSS `110-114`, preload font self-host, `/dev/nui`, dan NOTICE OFL lulus dengan `NEW_FAILS=0`, build flag=0 exit `0`, dan E2E flag=0 (`route-canvas` `15/15 PASS`, `guide-flow` PASS).
3. **Gerbang `G2` Webcam Owner:** Status **`DITUNDA_OWNER`** (digabung ke Gerbang **G9** atas arahan eksplisit Owner pada `2026-11-25 12:39 WIB`, bukti webcam tetap jujur **`NOT_TESTED`**).
4. **Wave 2 (`0a75d29`, `a0b3c50`, `fc80de5`, `a1f4364`, `eaa5a20`):** P3 Cover/Nama, P5 LevelSelect, P6 Canvas 5 Alat + Wipe + O-7/O-13/O-14, P7 World + KAPLAY `axis`, dan P8 Ending 5 fase selesai dengan **48/48 test files, 340/340 tests PASS**, build exit `0`, serta E2E flag=0 `15/15 PASS` (`UNIT_ONLY` + `STATIC_ONLY` + `MOCK_MODEL`).

---

## 6. Status Wave 3 — `P4` Tutorial 3 Kartu & `P7b` Shape Collider (`a3e4c48`)

| Pekerjaan | Implementasi & Paritas Terverifikasi | Bukti Repo (`STATUS.md`) | Catatan / Open Item |
|---|---|---|---|
| **P4 — Tutorial 3 Kartu** (`src/features/tutorial/**`, `src/domain/copy/tutorial.ts`) | - 3 kartu: `CardWalk.tsx` (joystick Aturan C + keyboard, `FIGURE_FPS = 30`), `CardSafeDanger.tsx` (dua sisi Aman vs Kertas sobek, `FIGURE_FPS = 30`), `CardCanvasTools.tsx` (memakai `CanvasController` + `Toolbar` 5 alat Aturan D).<br>- Koreografi Momo pasca-nama (`mid` → sapaan nama → `strip` → deal 3 kartu) + `CARD_READ_MS = 3333` (`TutorialThumbRing.tsx`).<br>- CTA akhir memakai `"Pilih level"` (O-8). | `74/74` tes Wave 3 PASS, `tsc` `0`, `eslint --max-warnings 0` `0` (`STATIC_ONLY` + `UNIT_ONLY`). | **Copy `PENDING_OWNER` (`COPY_RECONCILIATION.md` #1):** `src/domain/copy/tutorial.ts:41-42` sengaja mempertahankan teks sandbox `"balok atau tangga"` & `"duri"` dengan tag `// COPY-PENDING-OWNER` sampai Owner menyetujui usulan `"tangga atau jembatan"` / `"kaktus"` di `COPY_RECONCILIATION.md §4`. |
| **P7b — Shape Collider O-6** (`src/game/runtime/shape-collider.ts`, `creation-renderer.ts`, `integrated-scene.ts`, `game-controller.ts`) | - Port murni `shape.js` (`SHAPE_SOURCE_STROKE_WIDTH = 3.2`, `SHAPE_SOURCE_CELL = 0.5`): rasterisasi goresan, rotasi `0\|90\|180\|270`, flood-fill ruang tertutup, penggabungan rect minimal, fallback ke box/`hazardZone` saat goresan absen atau `useShape=false`.<br>- Konstanta fisika (`1600/130/520`) dan syarat minimal 2 objek tidak diubah. | Tercakup dalam `74/74` tes Wave 3 PASS (`tests/game/shape-collider.test.ts`), `tsc` `0`, `eslint` `0` (`STATIC_ONLY` + `UNIT_ONLY`). | — |

---

## 7. Status Wave 4 — Integrator `I-2` (`c2a7e9a`)

| Aspek Integrasi | Status Terverifikasi | Bukti Repo |
|---|---|---|
| Isolasi Flag=0 vs Flag=1 (`src/app/SketchbookApp.tsx`) | `uiR83() === false` tetap menjalankan `LegacySketchbookApp`; `uiR83() === true` merender `R83SketchbookShell` dengan 1 `NuiProvider` tunggal. | `tests/app/i2-integration.test.tsx` `5/5 PASS`; build flag=0 exit `0`; E2E flag=0 `route-canvas` `15/15 PASS` + `guide-flow` PASS. |
| Route statis & Guard (`src/app/r83-routes.ts`, `app/ending/page.tsx`) | Route `/`, `/onboarding/cam`, `/onboarding/card`, `/levels`, `/level1..3`, `/canvas1..3`, `/ending` terpetakan. `/level2` terkunci mengalihkan ke `/levels` dengan notice beristilah `"Level"` (O-8, bebas `"Bab"`). | `i2-integration.test.tsx:47-64,93-99` (`UNIT_ONLY`) + build flag=1 exit `0` (`STATUS.md`). |
| Penutup `/ending` (`EndingScreen.tsx`, `RecapChat.tsx`) | 5 fase (`payung` → `kolam` → `bicara` → `rekap` → `akhir`, sesuai draf `D-20261125-05`) membaca `recaps` sesi asli (`RecapChat`), nol data contoh `SAMPLE` (`COPY_RECONCILIATION.md` #4). | `i2-integration.test.tsx:107-115` (`UNIT_ONLY`). |
| Copy Barrel (`src/domain/copy/index.ts`) | Mengekspor ke-7 modul copy r8.3 (`cover`, `tutorial`, `levels`, `canvas`, `world`, `ending`, `nui`). | `i2-integration.test.tsx:37-45` (`UNIT_ONLY`). |
| Rekonsiliasi Draf Keputusan (`DECISIONS_DRAFT.md`) | Seluruh usulan `D-20261125-01` s.d. `D-20261125-07` berstatus **DRAF SAJA (`O-10 = TIDAK`)**; `contexts/can/DECISIONS.md` belum diubah hingga tinjauan Owner. | `DECISIONS_DRAFT.md:5,12,144-154`. |

---

## 8. Status Wave 5 (`P9` Hardening & `P9a MoNUI-7`) & Paritas Visual

### 8.1 Temuan Baseline Flag=1 Pra-Fix & Perbaikan Suite E2E (`e2e/r83/r83-flow.mjs`)
- **Run pra-fix (`e2e/r83/logs/r83-perf-report.json` @ `2026-11-25T08:17:25.727Z`, `MOCK_MODEL`):**
  - Alur Sampul → Fallback Kamera → Nama (`"Rani"`, nol `Rani` di `localStorage`/`sessionStorage`) → 3 Kartu Tutorial (termasuk 5 alat) → `/levels` → `/level2` lock guard → `/level1` intro → `/canvas1` (0 longtask saat 20 gerak kursor, GuessRing, Mock Top-3 bebas kata `"Demo"`, Sticker Throw → `/level1`) → `/ending` menghasilkan **23/24 PASS, 1 FAIL**.
  - **1 FAIL (`Zero runtime console/page errors`):** tercatat **20 `pageerror` React hydration mismatch** (`17× #418`, `3× #423`) akibat pembacaan state browser (`readBrowserPathname()`, `listCompletedStages()`) langsung pada render awal SSR/hidrasi di `useR83AppState.ts`. Selain itu, `R83CameraDock.tsx` pada `c2a7e9a` dirender sebagai sibling di luar `[data-ui="r83"]` sehingga aturan `position: fixed` kiri-bawah pada `#cam-pip` tidak cocok saat di luar `ScreenFrame`.
- **Penguatan `e2e/r83/r83-flow.mjs` (Wave 5 P9, diverifikasi sintaks `node --check`):**
  - Ditambahkan assertion eksplisit **zero React hydration errors** (`#418`, `#423`, `Hydration failed`, `did not match`) bersama `errors.length === 0`.
  - Ditambahkan pemeriksaan **`O-11` & `P9a`** pada `[data-testid="r83-cam-pip"]` (`#cam-pip`) di `/onboarding/card`, `/levels`, `/canvas1`, dan `/ending`: wajib tepat 1 node, `position: fixed`, `y > 400` (kiri-bawah viewport, bukan `y < 200` menggeser layout), serta `hasAttribute("data-monui-mode")` dan fail-closed tanpa kamera fisik.
  - Ditambahkan pengecekan **direct static load** pada `/levels`, `/level1`, dan `/ending` untuk memastikan nol console/page/hydration error per rute.
  - Kalibrasi `HOLD_MS` dipertahankan (`2300` ms `r83-name-yes`, `1300` ms default kartu tutorial) dan koordinat animasi GSAP (`r83-guess-ring`, `r83-guess-accept`, `r83-sticker-throw`) diberi jeda settle sebelum `boundingBox()`.

### 8.2 Status `P9` & `P9a` MoNUI-7 + Kontrak DIAS/KAPLAY (Pasca-Perbaikan Akhir)
- **Fix paritas visual & hidrasi:**
  - `R83SketchbookShell.tsx`: client hydration gate (`0` error `#418`/`#423`), pembungkus `[data-ui="r83"]` mencakup `#cam-pip` (menghilangkan bar hitam 150px), dan `<WorldScreen key={s.activeLevel.levelId}>` mencegah balapan `WEBGL_lose_context`.
  - Cover (`cover.css`, `cover-camera.css`, `cover-dom-layout.ts`, `cover-phase-timelines.ts`, `112-r83-paper.css`): perbaikan `[data-ui="r83"].r83-cover-root`, pemulihan spotlight `#shade`/`#spot`/`#bubble` di `cover-ayo`, `#book` layering, serta sembunyikan `.speaker`.
  - Post-cover: `:where(...)` di `tutorial.css`, `canvas.css`, `world.css`; `MissionBulb` `--nb-leaf`; `.r83-hint` kanvas & world intro (`r83-intro-skip` digate `devTools`); senyum `Semangat` Momo; `114-r83-momo.css` `#app { max-width: none }` + `box-sizing: content-box` bubble; fallback ancestor `.world`/`.cam` di `ParachuteScene`/`PondScene`.
- **Penyambungan `MoNUI-7` (`P9a`), DIAS & KAPLAY:**
  - `R83CameraDock.tsx` + `src/app/monui-hand-detector.ts` (`LabCpuWorkerClient` -> `r20-hand.worker.ts` + HF3 + MoNUI-7 + perbaikan `enqueueInFlight`) lulus 9/9 unit test dan membubuhkan `data-monui-mode` ("idle" saat fallback headless).
  - `src/api/submission-adapter.ts`: memetakan `behavior: "neutral"` -> `"unresolved"` agar `PATCH /api/submissions/{id}/outcome` tidak terkena HTTP `422` dari backend DIAS (`submission-adapter.test.ts` 3/3 PASS).
  - `useR83AppState.ts` & `R83SketchbookShell.tsx`: meneruskan `joinToken` ke `StudentRulerSelector` (`rulerSlot`) dan menjaga error jaringan offline (`r83-classroom-join.test.tsx` 3/3 PASS).
- **Verifikasi sweep penuh pasca-edit:** `tsc --noEmit` exit `0`, `eslint --max-warnings 0` (22 berkas `src/`) exit `0`, Vitest penuh **2734 passed / 37 failed / 2771 total** (`NEW_FAILS=0`), Flag=0 build + E2E PASS (`route-canvas`, `guide-flow`), Flag=1 build exit `0` + `e2e/r83/r83-flow.mjs` **`40/40 PASS`**.

### 8.3 Status Paritas Visual (`docs/migration-r83/parity/`, PLAN §9.2)
Perbandingan Chromium 2D canvas `1280×720` pasca-perbaikan (`e2e/r83/logs/r83-perf-report.json`, mengecualikan area masker PIP `x < 210, y > 540`) plus inspeksi visual berdampingan `prod-r83/*.png` vs `sandbox-ref/*.png` (`63/63` SHA-256 `sketchbook-universe-sandbox-r8.3` identik dengan `proto-html/r83/`):

| State (`1280×720`) | `sandboxBytes` | `prodBytes` | `diffPct` piksel | Hasil Audit Visual |
|---|---:|---:|---:|---|
| `canvas-empty` | 467.544 | 452.317 | **1,04%** | Cocok 1:1 (dock 5 alat, ikon lampu hijau `--nb-leaf`, hint bawah, kursor pensil) |
| `ending-init` | 464.854 | 449.470 | **2,54%** | Cocok 1:1 (tanpa margin 130px, parasut & garis tali terbuka, Momo corner 2 baris) |
| `cover-name-confirm` | 467.237 | 483.069 | **2,69%** | Cocok 1:1 (`"Rani"`, `"Ulangi"` / `"Ya, itu namaku"`, Momo kanan-atas) |
| `levels-idle` | 597.636 | 568.658 | **3,16%** | Cocok 1:1 (3 pita Level 1–3 + gembok, `↓ Pilih level`, hint & bubble 2 baris) |
| `cover-ayo` | 658.854 | 671.217 | **3,32%** | Cocok 1:1 (shade gelap, spotlight, bubble Momo, ring `"Ayo!"`, PIP kanan-kiri bawah) |
| `cover-sleep` | 850.845 | 854.133 | **3,76%** | Cocok 1:1 (kartu kamera oranye + gembok, tanpa `.speaker`, hero + logo BNW bawah) |
| `cover-gate` | 854.303 | 858.579 | **6,08%** | Cocok 1:1 secara tata letak (beda kecil di fase gerak Momo & status checklist `checked`) |
| `kartu-1` | 393.997 | 742.964 | 69,99% | Beda timing tangkap terverifikasi: `sandbox-ref` menangkap sambutan `"Halo, Rani!"` pra-kartu, sedangkan `prod-r83` menangkap Kartu 1 terbuka; secara komponen & CSS Polo Factory cocok 1:1 |
| `world-intro` | 610.820 | 542.750 | 97,87% | Beda fase terverifikasi: `sandbox-ref` sebelum vignette spotlight aktif & papan `"Bab 2"`, sedangkan `prod-r83` saat spotlight sorot Thinman & papan **`"Level 2"` (O-8)** tanpa tombol skip |

- **Yang tetap berstatus `NOT_TESTED`:** tangkap gambar viewport `1920×1080`, state lanjutan animasi mid-flow (`cover-name-listen`, `kartu-2/3`, penutup kolam/rekap), serta uji webcam fisik **G9** oleh Owner (`WEBCAM_QA.md`).
