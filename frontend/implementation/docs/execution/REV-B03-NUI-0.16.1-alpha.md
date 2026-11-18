# Engineering audit and patch record: REV-B03-001..006 + NUI — 0.16.1-alpha

**Baseline:** `ujang-monorepo` commit `56bdc2e4b430f80af6b196825d7748d9abb882d5`.  
**Source requirements:** Owner ZIP `Sketchbook-Revisi-Ujang-0.15.5-alpha.zip` containing `REV-0.15.5-alpha.md` and `deepseek_html_20261114_14c00d.html`.  
**Evidence:** STATIC_ONLY / NOT_TESTED. The assistant inspected and changed code via GitHub connector, but has not run the project's Vitest, TypeScript, lint, Next.js build, browser E2E, or a physical webcam. Claims of acceptance must await these tests.

> **Catatan lanjutan 2026-11-15 (0.17.0-alpha / `cebbaa4`):** Tabel di bawah adalah snapshot historis 0.16.1-alpha, bukan status paling baru.
> BookFlip (REV-B03-001), fallback Momo kamera (REV-B03-003), dan ikon custom Card 3 (REV-B03-005) telah mendapat patch source pada 0.17.0-alpha. Seluruh perubahan ini masih `STATIC_ONLY`/`NOT_TESTED` dan belum dapat dinaikkan menjadi PASS.
> Kontrak gesture yang masih bertentangan dengan keputusan lama dicatat di `contexts/can/DECISIONS.md` D-20261115-02 sebagai Belum dikunci. Status revisi terkini di `contexts/can/REVISIONS.md` R15-01..06.
## Ticket status

| Ticket | Static result of 0.16.1-alpha | Remaining / acceptance gap |
|---|---|---|
| REV-B03-001 | NO CHANGE. Current `BookFlip` CSS uses `transform-origin: 50% 100%` (bottom pivot). Cover uses valid thumb before invoking BookFlip. Top-hinge comments in source are stale. | Browser video needed to validate page-turn perception, cover background and midpoint fade without flicker. Do not claim complete. |
| REV-B03-002 | PATCHED. Pinch hint handle moves on the orange ruler body, not the stationary center needle; hint stops during interaction. | Verify pointer, camera pinch and live number on desktop/mobile. |
| REV-B03-003 | PARTIAL. Existing `GlobalCamera` already displays a camera-off nudge; **Momo enlargement across every relevant page remains unimplemented**, to avoid placing a second Momo over existing guide/layout. | Design/test one shared non-duplicated Momo camera recovery state, including permission denial, unplug, intentional off and no-camera fallback. |
| REV-B03-004 | PATCHED. Card 1 reads gameplay index-finger angle zones, continuously walks by frame time, triggers visual jump on upward/diagonal pointing, and does not use pinch for steering. Keeps pointer and keyboard. | Check hardware direction/mirroring, false positives, actual jump visibility, frame rate and rig position. |
| REV-B03-005 | PATCHED. Tutorial router no longer maps fist to erase (global canvas router unchanged). Existing `DrawingSurface` `fixedEraser` already suppresses fist on Card 3, and onToolUsed checks real store mutations. Misleading legacy pose icons replaced with neutral tool glyphs; custom gesture icons remain deferred. | Physical open-palm erase, single-finger undo, two-finger redo and history checklist acceptance. |
| REV-B03-006 | PATCHED. Existing pre-cover DreamLoader warmup retained; effect no longer resets on statusText or changing callback prop, and morph timeline is disposed; explicit pointer fallback text after warmup failure. | True cold/warm start, failure retry/skip path, resize/morph, GPU/CPU startup and performance QA remain. |
| NUI-1 | PATCHED. MediaPipe FaceDetector pixel bounding boxes normalize by actual detection input size (320px enhanced canvas or native webcam), with regression tests. | Camera hardware confirmation and actual false-hand rejection. |
| NUI-2 | PATCHED (prototype). Auto CLAHE checks global and center luma to catch a dark subject under backlight. NUI Lab adds equal-resolution RAW 320 vs CLAHE 320 control, center luma/backlight indicator. The heuristic is not calibrated and is not hand segmentation. | A/B test same USB camera/light with RAW native, RAW 320, CLAHE 320, auto. Compare handCount, primary, FPS and CPU cost. |
| NUI-3 | PATCHED. Wave ring progress no longer looks nearly complete before six samples, NUI Lab movement clock includes vertical motion. | Measure wave wake precision, latency, tracking loss, and non-wave false triggers on real webcam. |

## Owner laptop verification gate

```bash
cd frontend/implementation
npm ci
npm run typecheck
npm test -- tests/camera/face-anchor.test.ts tests/camera/frame-source.test.ts tests/camera/wave-responsive.test.ts tests/camera/lab-vertical-timing.test.ts tests/components/tutorial-walk.test.ts tests/input/gesture-mode.test.ts
npm test
npm run build
```

Then run browser flow cover -> ruler -> cards 1–3 -> canvas/Top-3 -> game, including camera permission denied/unplugged and pointer fallback. For low-light/backlight validation open `http://localhost:3000/nui-lab` and record aggregated metrics only, not student faces/video. Compare RAW native ("Mati") vs RAW 320 vs CLAHE 320 under the same light and viewpoint. All thresholds (0.28, backlight center 0.36, difference 0.18, 30%/s walk) are prototype parameters until measured.

`main` must not be modified. This patch changes only `ujang-monorepo`.
