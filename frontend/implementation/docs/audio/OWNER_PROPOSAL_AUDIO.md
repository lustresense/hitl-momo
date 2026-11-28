# Draft proposal for Owner decision: immersive game audio

Status: **DRAFT, not approved.** This file is not `DECISIONS.md`. Product decisions only change through an explicit Owner approval ("SETUJUI D-..."). The audio work itself was implemented under mandate M-047 on branch `claude-monorepo`; nothing was merged to `main`.

## What was built (facts)
- One Web Audio engine; 87 SFX + music loops + stingers + ambience, all original synthesis (see `AUDIO_ASSET_MANIFEST.md`, `THIRD_PARTY_NOTICES.md` section 4). No third-party sample, no AI audio model.
- Scene-aware background music from one motif, event-driven SFX for real game events, local audio preferences, a small audio control, a developer-only `/dev/audio` lab.
- Hard constraints honoured by design: Momo has no voice (no speech/TTS/STT/gibberish/yawn sound); HITL accept/correct/override and the Top-3 reveal are sonically neutral; no per-frame or hover sounds; the game is fully playable muted; no visual change.

## Decisions requested (each independent)
1. **Approve audio as a product feature** (new D-ID) with the principles above as binding rules for any future sound.
2. **Audio control placement and style.** Default: leaf pill at top-left, self-drawn speaker glyph (the locked Owner icon set has no speaker icon), mouse/touch/`M` key only, excluded from NUI (`data-nui-off`). Alternative: no visible control (sound always on) is **not** recommended: students need a mute.
3. **Defaults.** master 0.8, music 0.6, effects 0.9, not muted (perceptual curve v^2, safety limiter). Alternative: start muted until the first tap.
4. **First-gesture rule.** Browsers forbid sound before a real click/key. The first such gesture is the nickname submit in DreamLoader (or the camera-consent click). Hand pinches cannot unlock audio. If an Owner flow ever starts with hand-only input, sound stays off until the first click/key. Option: add an explicit "Nyalakan suara" affordance (visual change, needs approval).
5. **Tracking-loss cue.** One very soft cue after a real hand-tracking dropout (>= 700 ms) and one on regain, max once per 6 s. Alternative: silent (visual only).
6. **Unverified subjective quality.** All sounds were validated objectively only (peak, loudness, spectrum, latency, seams). Listening tests with real SMP students on school devices/headphones have not been done and are required before any "ready for students" claim.

## NOT_TESTED (must stay listed until tested)
Real webcam + audio together; headphones; school devices; Safari/iOS (Opus-in-Ogg decode); long sessions (> 30 min) memory; subjective loudness balance and fatigue; Bluetooth latency; student acceptance.
