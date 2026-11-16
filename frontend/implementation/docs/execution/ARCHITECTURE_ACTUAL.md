# Actual architecture (derived from source, not from proposals)

Static-export Next.js 14 app (no server code) + React 18 + KAPLAY 3001 (gameplay canvas only) + `@mediapipe/tasks-vision` (hand input). Everything partner-specific is a client adapter.

## Layers and where they live
| Layer | Files | Responsibility |
|---|---|---|
| Shell / routing | `app/*`, `src/app/SketchbookApp.tsx`, `route-guard.ts` | History-API routes (`/`, `/onboarding/*`, `/levels`, `/level1..3`), onboarding → level select → level flow, summary |
| Flow state machine | `src/app/state-machine.ts` (`FlowController`) | `level-entry → drawing → predicting → evaluating/prediction-error → falling → placing → gameplay → complete`; Accept/Correct/Override; Redraw = recovery; emits interaction events |
| Domain | `src/domain/*` | levels (placeholder fixtures), decision resolver (Accept/Correct ranks 2–3/Override ∉ Top-3), behavior resolver (per-level `solid/danger/unresolved`), Momo script, mission config |
| Input | `src/input/*`, `src/camera/*` | `DrawingSurface` (pointer + MediaPipe pinch), normalisation to unit-square strokes, `InputArbiter` (pure conflict rules), camera stream sharing, GPU→CPU landmarker fallback |
| Prediction | `src/prediction/*` | `PredictionProvider` interface, `MockPredictionProvider` (default, MOCK), `PartnerHttpProvider` (adapter), strict `validation.ts`, provenance |
| Events | `src/events/*`, `src/domain/events.ts` | envelope (+ids, schema `draft-0`), console / ring-buffer / HTTP-batch sinks; HTTP off unless `NEXT_PUBLIC_EVENT_ENDPOINT` |
| Game runtime | `src/game/*`, `src/game/runtime/*` (`kaplay-runtime.ts` is a facade) | stage geometry (L1 gap, L2 vertical/2 objects, L3 hazard), KAPLAY runtime, placement rules, sketch renderer (student strokes → object sprite), Character A, `JumpAssist` (coyote/buffer 100 ms) |
| UI | `src/components/*` (thin composition roots + `hooks/` + presentational parts: e.g. `game/{StageHeader,EnterWorldPopup,WorldMomo,SuccessPopup,FailOverlay,...}`), `src/app/{hooks,screens}`, `app/styles/*.css` (ordered partials imported by `app/globals.css`) | screens, animated Momo (`components/momo/*`), design system |
| Config | `src/config/env.ts` | `NEXT_PUBLIC_*` getters + provider factory (never falls back from a broken partner config to MOCK) |

## Data flow
`pointer|hand → StrokeStore → DrawingInput{strokes∈[0,1]², hasInk, aspectRatio} → provider.predict() → Top-3 {label, confidence}[3] (+provenance) → student Accept/Correct/Override → finalLabel → behavior (per-level map) → WorldCreation{drawingInput, x, y, w, h, behavior} → KAPLAY body (solid) / hazard (danger) / inert (unresolved) → outcome → events`.
The original strokes travel with the creation and are rendered as the object's sprite (undistorted contain-fit).

## Invariants worth protecting (all unit- or E2E-tested)
* Redraw never produces a `decision_made`; Correct accepts only rank 2/3; Override only labels outside Top-3.
* A failing/misconfigured provider never fabricates a prediction; MOCK is always labelled.
* No `window.__skb*` hooks unless `NEXT_PUBLIC_TEST_HOOKS=1`.
* Physics constants (walk 200, jump 520, g 1600, body 24×40) unchanged; only coyote/buffer assists added.
* Events contain no strokes and no student number unless explicitly enabled.

## Addendum hasil inspeksi source pada 2026-11-15 (belum diuji runtime)
- UI gesture baru: `src/components/ui/GestureGlyph.tsx` dan `Icon.tsx`; enam glyph SVG original dipakai pada toolbar, penggaris, Card1/Card3, cincin gestur dan kontrol objek. Legacy Figma disimpan untuk kompatibilitas.
- Pipeline Card 3: `src/input/gesture-mode.ts` dan `hand-stroke-pipeline.ts` memisahkan gestur tutorial dari kanvas utama; mode tutorial melarang fist erase, sedangkan telapak lima jari bisa menghapus. Perbedaan mapping terhadap keputusan aktif lama ditandai sebagai `Belum dikunci` di `contexts/can/DECISIONS.md` D-20261115-02.
- Kamera: `src/camera/camera-assist-state.ts` menyalurkan state gagal/siap/idle; `GlobalCamera.tsx` menerbitkannya dan `MomoGuide.tsx` merender recovery pada maskot yang sama. `src/camera/frame-source.ts` mendukung RAW 320/CLAHE 320 dan heuristik luma pusat; `face-anchor.ts` menormalisasi box sesuai frame input; `nui-lab` mengembalikan mode global ketika unmount.
- Animasi `BookFlip` memakai top hinge `rotateX` dan restart saat `playKey` berubah. Ini masih STATIC_ONLY pada commit `cebbaa4`.
- Pemasangan frontend memakai `npm ci`; `requirements.txt` hanya metadata penjelas. Handoff dan gate verifikasi di `docs/execution/UJANG_HANDOFF_0.17.0-alpha.md` serta `scripts/ujang-verify-web.sh`.
- Tidak ada bukti baru untuk mengganti status model partner, database, CI, build, screenshot atau webcam. Seluruh item addendum harus dianggap perubahan source, bukan hasil uji.
## Known structural limits
Level data are placeholders (`levels.ts`); creations persist through Redraw (no delete, only "Geser"); integrated gameplay uses keyboard / on-screen buttons unless the hand-control toggle is wired (see INPUT_ARCHITECTURE.md); progression unlock is client-side (localStorage); the integrated canvas forces `pixelDensity ≥ 2`.

## REV-B04 source addendum — 2026-11-15 (0.18.0-alpha, STATIC_ONLY)

- Root `/` memuat DreamLoader lalu mengganti URL memakai `history.replaceState` ke `/onboarding/cam` setelah morph. Entry `app/onboarding/cam/page.tsx` disediakan untuk Next.js `output: "export"`. Ini hanya kontrak source, static-host deep link belum diuji.
- Loader memisahkan intro GSAP dari warmHandLandmarker agar tugas berat mulai setelah Momo mencapai tengah. Status `ready` menahan progress 80% sampai hand blank-inference dan face startup selesai/ditangani fallback. 90% mendekati awan, failed berhenti sebelum 80% dengan retry/skip.
- Kamera off melepaskan MediaStream tracks dan WaveTracker menghentikan rAF. Instance `HandLandmarker` yang sehat milik cover dapat dikembalikan ke cache warmup (single owner, config identity, TTL prototype 30 detik); crash menutupnya. Event `pagehide` membebaskan instance standby. Model bisa dibuat ulang jika cache habis/berbeda config.
- Perhitungan wave thresholds, hand-to-face gating, gestures Card 1/3, mekanisme wake lambaian, dan camera card existing tidak dimodifikasi pada batch ini. Counters diagnostik ada pada WaveTracker tetapi belum menjadi benchmark kamera nyata.
- Bukti STATIC_ONLY; tidak ada pengujian typecheck, Vitest, build, FPS, webcam, visual capture atau deployment terbaru. Lihat `REV-B04-0.18.0-alpha.md`.

## Owner REV-B04-004 correction — 2026-11-15 (0.18.1-alpha, STATIC_ONLY)

Keputusan Owner D-20261115-03 menggantikan **waving siswa sebagai trigger cover**. `GlobalCamera` adalah single persistent React camera card existing dan tetap mengelola MediaStream, cover→PIP GSAP morph, Momo cover, bubble serta thumb/book handoff. Alur baru adalah `cover OFF + Momo tidur → user ON → getUserMedia berhasil → video.play berhasil dan track masih aktif → wakeMomo tepat sekali → Momo terkejut/terbang/bubble → thumb confirm → book midpoint menuju ruler`. Izin ditolak, playback gagal atau request stale tidak boleh membangunkan Momo; fallback tanpa kamera tetap tersedia.

Tidak ada lagi `WaveTracker`, ring progress wave atau sleep-nudge yang mewajibkan lambaian pada cover. Modul `wave-tracker.ts` tetap tersedia untuk diagnosis/riset, tetapi bukan syarat membuka cover. Model `landmarker-warmup.ts` dan cache 30 detik dari B04-003 tetap untuk kebutuhan interaksi tangan berikutnya, bukan proof wave berhasil di cover. Identitas `onWave` prop dipertahankan sebagai callback navigasi setelah konfirmasi jempol agar pemanggil lama tidak patah.

Tidak mengubah HTML card Claude, CSS cover, gesture Card1/3, Top-3 HITL, model partner atau rest API. Seluruh perubahan `STATIC_ONLY` sampai npm, browser, webcam dan deploy diverifikasi oleh Ujang.

## NUI Lab in main (2026-11-16, 0.21.0-alpha)
`frontend/implementation/app/nui-lab/{page.tsx,gesture/page.tsx,canvas/page.tsx,diagnostics/page.tsx}` share `NuiLabPage` variant, shared MediaPipe 21-landmark acquisition and `LabAnalyzer`. Canvas uses `HandStrokePipeline`, `StrokeStore`, gesture mode router and pointer fallback; preview, cursor and overlay are separate layers. Full-frame lab only uses `FullFrameHandLock`, tracking one wrist/scale track without facial ROI. Lost/ambiguous tracking pauses actions and requires explicit relock, no bystander auto-promotion. It is not biometric authentication or full edge-visibility guarantee. Main game still uses its existing player selection policy. Evidence STATIC_ONLY until Ujang QA.

## NUI Lab owner-hand recovery & gesture A/B (0.22.0-alpha, 2026-11-16)
`FullFrameHandLock` tracks wrist and bounding-box size without face ROI; a short lost period suspends input. After multiple sampled empty frames and a prototype 300 ms gap, the owner is released, and the next single stable hand acquires automatically. If an unmatched bystander remains, the original session is not transferred. An epoch counter ensures a stale old gesture cannot be inherited by a new hand. This **does not authenticate identity** and cannot see landmarks outside frame. `LabAnalyzer` surfaces pinch thresholds/ratios/finger states and action-gate rejection, and allows comparing baseline and experimental classifier in the NUI Lab only. The main game's default `classifyHandPose` and `HandStrokePipeline` mapping stays unchanged. No model training or runtime webcam proof is available.
