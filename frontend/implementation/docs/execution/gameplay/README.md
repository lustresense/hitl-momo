# Gameplay: objek siswa dan hitbox (Owner 2026-11-16, D-20261116-01)

## Masalah yang diperbaiki
Dulu semua objek siswa berupa papan yang sama (130,6 x 19,6 satuan dunia) dan gambarnya dipaksa muat di dalamnya. Gambar hati yang besar di tahap stiker menjadi kira-kira 30 piksel di tengah papan 209 piksel yang tidak terlihat. Thinman bisa berdiri di udara kosong di kiri dan kanan gambar, jadi yang dilihat siswa berbeda dari yang diinjak.

## Aturan sekarang
- **Collider = kotak gambar sendiri.** `src/game/runtime/footprint.ts` `inkFootprint()` mempertahankan proporsi gambar dan memperbesarnya sampai memenuhi kotak terbesar level. Kotak itu mengikuti tinta sampai selisih tebal goresan.
  - gambar lebar: lebar penuh, tinggi sesuai proporsi;
  - gambar tinggi: tinggi penuh, lebar sesuai proporsi;
  - garis datar atau garis tegak: papan atau tiang tipis; titik: balok terkecil level.
- **Batas ukuran per level** ada di `src/game/object-limits.ts`, dalam satuan sumber art (490 x 325, skala dunia 1,6327). Tiap level punya satu baris yang disetel dengan tes keterselesaian.
  | Level | maxW | maxH | minW | minH |
  |---|---|---|---|---|
  | 1 | 60 | 36 | 24 | 6 |
  | 2 | 50 | 36 | 24 | 6 |
  | 3 | 80 | 36 | 24 | 6 |
- **Objek tidak boleh menimpa titik awal Thinman atau bendera** (`spawnBodyOf`, `integratedPlacementAllowed` di `src/game/runtime/rules.ts`).
- **Objek bahaya (duri) melukai hanya di dalam gambar:** zona luka 12% lebih kecil di tiap sisi (`hazardZone`). Aturan penempatan tetap memakai kotak penuh.
- **Papan petunjuk akhir level** (`StageArtwork.tsx`): hanya satu panah, tanpa papan "Bab N selesai". Level 1 dan 2: "Lanjut ke Bab 2/3". Level 3: "Menuju Pusat Halaman". Teks selalu muat di panah.

## Yang tetap
Fisika (`WALK_SPEED` 130, `JUMP_FORCE` 520, `GRAVITY` 1600, badan 24 x 40), geometri tanah (terikat art), minimal 2 objek per level, dan satu objek saja tidak pernah cukup.

## Rencana e2e
`e2e/lib/level-plans.json`: tiap siklus membawa `w` dan `h` (kotak gambar yang dipakai perjalanan: "block" 130,6 x 49,5 di Level 3; "spike" 80,5 x 58,8 untuk siklus genap). `x,y` adalah pojok kiri atas.

## Alat
- `node e2e/collider-audit.mjs` (`SHAPE=free`, `LEVELS=n`): screenshot polos dan dengan overlay collider (pink objek, biru tanah, hijau bendera, oranye pemain).
- `node e2e/signpost-shot.mjs`: screenshot papan petunjuk tiap level.
- `UNLOCK_ALL=1 LEVELS=n node e2e/normal-journey.mjs`: jalankan satu level saja.
