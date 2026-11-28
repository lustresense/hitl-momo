# Audio architecture (M-047)

Status: implemented on branch `claude-monorepo`. Evidence classes are stated per claim (`UNIT_ONLY`, `STATIC_ONLY`, `BROWSER_E2E`, `NOT_TESTED`). Nothing here is claimed final, perfect, production-ready or suitable for SMP students: that needs listening tests on real devices, which have **not** been done.

## Principles
1. **One engine.** A single `AudioContext` for the whole app. React, GSAP callbacks and KAPLAY outcome callbacks all call `audio.emit(...)`. Nothing else creates an `AudioContext` or `Audio` element; KAPLAY's own context is closed right after `kaplay()` creates it (`src/game/kaplay-runtime.ts`).
2. **Sound is never the only feedback.** Every sound mirrors a visual state change that already exists. The game is fully playable muted. Nothing visual was removed or changed.
3. **Momo has no voice.** No speech, TTS, STT, gibberish, humming, breathing or yawn. `momo.*` are wing/air/paper sounds. Enforced by name in `tests/audio/registry.test.ts` and by design review (`SFX_SPEC.md`).
4. **Neutral HITL.** `hitl.reveal` and `hitl.decide` are single shared assets: identical for any confidence and for accept/correct/override. `bgm.focus` stays on through drawing, prediction and the decision (no tension build-up, no resolution that could bias a choice).
5. **No per-frame, hover or jitter sounds.** Every trigger is an edge or a discrete action; cooldowns/voice caps live in the event rules.
6. **Truthful sounds.** Success sounds only after the success was really reported.

## Module map (`src/audio/`)
| Module | Role |
|---|---|
| `engine/AudioEngine.ts` | lifecycle (lazy context, unlock on first real gesture, hide/show suspend), gating (locked / hidden / muted), event + loop API, scene + ducking, diagnostics snapshot |
| `engine/Mixer.ts` | buses `music / sfx / ui / amb` -> master -> safety limiter (DynamicsCompressor) -> destination; perceptual volume curve v^2; dev-only recording tap |
| `engine/BufferStore.ts` | fetch + `decodeAudioData` cache, in-flight de-duplication, bounded retries, never throws |
| `sfx/SfxPlayer.ts` | one-shots and loops: variant round-robin (never the same twice in a row), cooldown, per-event voice cap, global polyphony cap with priority stealing, pitch jitter, scene-bound fade-outs, stale-load drop |
| `engine/CrossfadeLoopPlayer.ts` | seamless loops (`loop=true`), equal-power crossfade, token-guarded rapid scene changes, separate fade/trim gain nodes |
| `engine/MusicDirector.ts` | scene -> track + ambience, keep-playing for same track, resume offset (90 s), at most 2 music buffers decoded, ducking, adaptive state patch, idle warm-up. It also owns the ambience player (second `CrossfadeLoopPlayer` on the `amb` bus) |
| `registry/events.ts`, `scenes.ts` | typed event ids with rules; scene map. `assets.generated.ts` is produced by `tools/audio-gen/build_all.py` |
| `prefs/AudioPrefs.ts` | master/music/sfx/mute in `localStorage` (`sketchbook.audio.prefs.v1`), safe when storage throws |
| `diag/Diagnostics.ts` | always-on counters and drop reasons; event ring log only in dev / Audio Lab |
| `react/hooks.ts`, `index.ts` | typed facade `audio`, `useAudioPrefs/State/Scene/Unlock` (`useSyncExternalStore`), SSR/unsupported no-op |
| `bindings/` | `useShellAudio` (route -> scene, camera status, route notice), `nui-bridge` + `NuiAudioBridge` (ring sounds from DOM state), `scene-map` |
| `ui/AudioControl.tsx`, `lab/AudioLab.tsx` | player control (`data-nui-off`, mouse/touch/`M`), developer lab at `/dev/audio` |

Per-feature emits live next to the real events (see `coverage/*.md` and `AUDIO_COVERAGE_MATRIX.md`).

## Autoplay and lifecycle
- No `AudioContext` exists before the first real user activation. `useAudioUnlock` installs capture listeners (`pointerdown/up`, `keydown`, `touchend`, `click`). Hand pinches are synthetic and cannot unlock audio; in practice the first gesture is typing/submitting the nickname in DreamLoader or the camera-consent click. If a session never produces a gesture the game stays silent and fully usable (state `idle`/`locked`).
- Calls before unlock are dropped with reason `locked`; the wanted scene is remembered and starts on unlock. Sounds are never queued for later (no stale sound bursts).
- Tab hidden / `pagehide`: music pauses with a short fade, voices stop, context suspends after 450 ms; on return the context resumes and music fades in. Sounds requested while hidden are dropped (`hidden`).
- Mute / zero volume: master gain -> 0 with a short ramp; events are dropped at the gate (`muted`) so nothing starts or accumulates.
- Unsupported (no Web Audio, or Opus-in-Ogg cannot be decoded, e.g. some Safari versions): decode failures are counted (`failedLoads`, `load-failed`), retried at most 3 times, and the game stays silent. `NOT_TESTED` on Safari/iOS.

## Music and loops
- Assets: Opus in Ogg, 48 kHz. Loops are rendered with baked loop tails and played with `AudioBufferSourceNode.loop` (gapless in the Web Audio graph); decoded-file loop seam is checked in `build_all.py`.
- Scene change: new track fades in (equal power) while the old one fades out; only one track audible in steady state. Rapid changes cannot stack: every request carries a token and stale loads are discarded (`tests/audio/engine.test.ts`, mutation-checked).
- Same track requested again (e.g. all `canvas` screens): keeps playing, no restart.
- Adaptive intensity is done with `musicPatch` (gain/low-pass ramps) and event ducking, not by stacking stems.

## Performance design
- Lazy: the audio chunk only creates a context on first gesture; per-scene warm-up decodes the next scene's assets in idle time (batches of 3).
- Memory: <= 2 music buffers (+ <= 2 ambience) decoded; SFX are small (see `AUDIO_ASSET_MANIFEST.md`). Measured numbers: see `AUDIO_BENCHMARK.md`.
- No React work per frame: the NUI bridge is driven by class mutations on ring elements (edges), the hold loop's rate is read from `aria-valuenow` on a 100 ms interval only while a ring is held.
- Diagnostics counters are cheap and always on; the event log only records in developer builds.

## Dev-only surface
`/dev/audio` (needs `NEXT_PUBLIC_DEV_TOOLS=1`; otherwise "tidak tersedia", same gate as `/dev/nui`), `window.__audioDiag` (only with `TEST_HOOKS=1` or `DEV_TOOLS=1`), recording tap used for the demo video (`audio.recordingTap()` returns `null` unless DEV_TOOLS).

## Owner decisions needed (not self-approved)
- Audio is a new product feature without a D-ID: see `OWNER_PROPOSAL_AUDIO.md`.
- The audio control uses a self-drawn speaker glyph and a leaf pill at top-left, because the locked Owner icon set has no speaker icon. Flagged for Owner approval of placement and style.
