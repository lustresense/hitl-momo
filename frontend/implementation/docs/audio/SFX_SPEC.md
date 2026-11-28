# SFX asset spec (contract between sound design, engine and event registry)

Status: design contract for M-047. Sounds are synthesised by `tools/audio-gen/` (numpy/scipy, no samples, no AI audio model).
Subjective listening is NOT_TESTED; only objective QA exists (see AUDIO_ASSET_MANIFEST.md once generated).

## House rules for every sound
- Momo has **no voice**. No speech, TTS, STT, gibberish, humming, breathing, yawning, giggles, vowel-like formant sweeps or syllable-like rhythms. Only physical sounds (paper, wood, cloth, air, ink, tines, rubber).
- **Pitched sounds belong to C major pentatonic** (C D E G A, octaves 3-7) so every tone fits the music (the "Kite motif": G-A-C-A, G-E-D). 12-TET, A4 = 440 Hz.
- **Neutral decisions**: `hitl.*` sounds carry no reward or punishment colour (no rising "success" arpeggio, no buzzer). `ui.denied`/`sys.hiccup` are soft and non-blaming.
- Soft and laptop-speaker friendly: no energy below ~80 Hz, nothing piercing between 2-5 kHz, low harshness (QA flags it). Short attack but never a click (QA checks leading silence <= 20 ms, clean tail).
- Peak target -4 dBFS (`@sfx(peak_db=-4)`), loops use RMS targets. Mono unless the table says stereo. One-shots must start within 20 ms (latency).
- Deterministic (seeded RNG supplied to `fn(rng)`), no randomness outside `rng`.
- `bus`: `ui` = interface feedback (follows the SFX slider), `sfx` = world/game sounds.

## Assets (id | file | kind | group | bus | stereo | target length | design)

### Worker A: interface, NUI feedback, bubbles (files: `sfx/ui_sfx.py`, helper `common/fx_ui.py`)
ui.tap_a|ui_tap_a|sfx|core|ui|mono|70 ms|soft wooden tick, body ~1.6 kHz, tiny noise transient, very soft
ui.tap_b|ui_tap_b|sfx|core|ui|mono|70 ms|variant of tap_a, body ~1.3 kHz, slightly rounder
ui.toggle_on|ui_toggle_on|sfx|core|ui|mono|130 ms|two soft marimba/kalimba tines E5 then G5, 60 ms apart
ui.toggle_off|ui_toggle_off|sfx|core|ui|mono|100 ms|single soft tine C5, short decay
ui.denied|ui_denied|sfx|core|ui|mono|240 ms|two damped low wooden knocks (~190 Hz then ~170 Hz), 90 ms apart; soft; NO buzz; neutral, not punishing
ui.notice|ui_notice|sfx|core|ui|mono|200 ms|small paper pop plus a faint tine A5
ui.ring_in|ui_ring_in|sfx|core|ui|mono|170 ms|soft airy bubble pop, pitch glide ~400 to 700 Hz with a puff of noise (a ring/panel appears)
ui.morph|ui_morph|sfx|core|ui|stereo|450 ms|soft paper slide, band-passed noise sweep 800 to 2500 Hz plus faint low tonal body
ui.skip|ui_skip|sfx|core|ui|mono|110 ms|tiny fast tick with a short swish (developer skip bar only)
sys.hiccup|sys_hiccup|sfx|core|ui|mono|520 ms|two soft falling tines E5 to C5 then G4, low level, short reverb; gentle "not now", not an alarm
sys.ready|sys_ready|sfx|core|ui|mono|650 ms|gentle ascending kalimba shimmer C5-E5-G5, light reverb (used only after a real success: camera live, models ready)
bubble.show_a|bubble_show_a|sfx|core|ui|mono|150 ms|soft paper-bubble pop (airy "ploop"), NON-vocal: no vowel-like formants
bubble.show_b|bubble_show_b|sfx|core|ui|mono|150 ms|variant of show_a, slightly higher
nui.lit|nui_lit|sfx|core|ui|mono|60 ms|very soft tonal tick G5 (a ring target became the lit one)
nui.hold|nui_hold|sfxloop|core|ui|stereo|0.9 s loop|soft airy "charge" bed: filtered noise plus E4/B4 partials with slow tremolo; seamless; RMS -30 dB; the engine raises its playback rate as the ring fills
nui.commit|nui_commit|sfx|core|ui|mono|260 ms|soft "pock" plus short tine G5 to C6; neutral confirm for EVERY ring
nui.release|nui_release|sfx|core|ui|mono|150 ms|quiet soft unwind (small downward tick/sweep), played when a sustained hold is released without commit
nui.track_lost|nui_track_lost|sfx|core|ui|mono|380 ms|very soft descending tine A4 to E4, low-passed; hand tracking dropped
nui.track_found|nui_track_found|sfx|core|ui|mono|380 ms|very soft ascending tine E4 to A4; hand tracking regained

### Worker B: tools, drawing, prediction/HITL, book and cards, sticker, ribbons (files: `sfx/canvas_sfx.py`, helper `common/fx_canvas.py`)
tool.pencil|tool_pencil|sfx|canvas|sfx|mono|90 ms|graphite/wood tap with a hint of scratch
tool.eraser|tool_eraser|sfx|canvas|sfx|mono|100 ms|soft rubber tap
tool.undo|tool_undo|sfx|canvas|sfx|mono|170 ms|soft reverse swish (noise swell downward) plus tiny tick
tool.redo|tool_redo|sfx|canvas|sfx|mono|170 ms|soft forward swish plus tiny tick
tool.clear|tool_clear|sfx|canvas|sfx|stereo|520 ms|paper crumple sweep: noise bursts plus low rustle
tool.tick|tool_tick|sfx|tutorial|ui|mono|130 ms|tiny pentatonic tine C6 pop (tutorial: tool used for the first time)
draw.pencil|draw_pencil|sfxloop|canvas|sfx|stereo|0.8 s loop|graphite scratch on paper: band-passed noise with micro amplitude modulation; seamless; not harsh; RMS -28 dB (engine scales gain/rate with pen speed)
draw.eraser|draw_eraser|sfxloop|canvas|sfx|stereo|0.8 s loop|soft rubbing; seamless; RMS -29 dB
mission.open|mission_open|sfx|canvas|ui|mono|320 ms|idea-bulb: soft pluck plus bell A5 and a little shimmer
hitl.submit|hitl_submit|sfx|canvas|sfx|mono|420 ms|"drawing sent": paper swish plus low tine G4 that rises slightly
hitl.reveal|hitl_reveal|sfx|canvas|sfx|stereo|520 ms|THREE soft paper-card taps at the SAME pitch and loudness, 110 ms apart (Top-3 laid down); must not hint at confidence
hitl.decide|hitl_decide|sfx|canvas|sfx|mono|280 ms|one soft woodblock "tok" (body ~E4) plus paper settle; played IDENTICALLY for accept, correct and override (no reward or punishment colour)
page.curl|page_curl|sfx|cover|sfx|stereo|1900 ms|long paper page curl/turn: bend creak (slow band-pass sweep), flutter, soft thump at the end
page.flick|page_flick|sfx|canvas|sfx|mono|300 ms|quick page flick
card.deal|card_deal|sfx|tutorial|sfx|stereo|750 ms|three paper snaps at 0/130/260 ms with soft slides, slight pan spread (cards deal into a fan)
card.flip|card_flip|sfx|tutorial|sfx|mono|520 ms|swoosh plus paper tap (card flies to centre and flips)
card.bifold|card_bifold|sfx|tutorial|sfx|mono|640 ms|paper unfolding crackle
card.close|card_close|sfx|tutorial|sfx|mono|420 ms|fold closing plus soft tap
card.stamp|card_stamp|sfx|tutorial|sfx|mono|380 ms|ink stamp thud (low body ~120 Hz) plus tiny tine E5 (the green "done" stamp)
card.exit|card_exit|sfx|tutorial|sfx|mono|520 ms|swish of cards sliding away
sticker.pop|sticker_pop|sfx|canvas|sfx|stereo|560 ms|peel crackle, soft pop and very quiet sparkle tines (G6, E6)
sticker.throw|sticker_throw|sfx|canvas|sfx|stereo|900 ms|whoosh forward/up with a low-pass sweep; fades away
sticker.shrink|sticker_shrink|sfx|canvas|sfx|mono|420 ms|shrink-spin swish (descending narrow-band sweep)
ribbon.drop|ribbon_drop|sfx|levels|sfx|stereo|900 ms|four paper flutter drops staggered 120 ms (chapter ribbons drop in)
ribbon.notch|ribbon_notch|sfx|levels|sfx|mono|90 ms|wooden tick with tonal body exactly C5 (the engine plays it at rates 1, 1.122, 1.26, 1.498 = C D E G)
ribbon.armed|ribbon_armed|sfx|levels|sfx|mono|260 ms|click-lock: bright tick plus soft tine C6+G6
ribbon.launch|ribbon_launch|sfx|levels|sfx|stereo|700 ms|spring release whoosh upward plus paper flutter
ribbon.rebound|ribbon_rebound|sfx|levels|sfx|mono|500 ms|rubber-band rebound wobble, damped, low
ribbon.unlock|ribbon_unlock|sfx|levels|sfx|stereo|950 ms|shimmer plus elastic spring; bell cluster C6/E6/G6 (only for a real fresh unlock)

### Worker C: Momo (non-vocal), Thinman, world, intro/dream, ending (files: `sfx/world_sfx.py`, helper `common/fx_world.py`)
momo.flap_a|momo_flap_a|sfx|core|sfx|mono|230 ms|soft fabric/paper wing flaps, 2-3 beats (no vocal content)
momo.flap_b|momo_flap_b|sfx|core|sfx|mono|230 ms|variant flap, different rhythm
momo.flap_c|momo_flap_c|sfx|core|sfx|mono|230 ms|variant flap, softer
momo.whoosh_a|momo_whoosh_a|sfx|core|sfx|stereo|520 ms|paper kite fly-by with pan sweep left to right
momo.whoosh_b|momo_whoosh_b|sfx|core|sfx|stereo|520 ms|fly-by right to left, slightly different pitch contour
momo.land|momo_land|sfx|core|sfx|mono|170 ms|soft paper "pap" landing
momo.hop|momo_hop|sfx|core|sfx|mono|150 ms|soft tonal "tok" with a small upward pitch; not a cartoon voice
momo.wave|momo_wave|sfx|core|sfx|mono|320 ms|two gentle cloth swishes
momo.startle|momo_startle|sfx|cover|sfx|mono|380 ms|fast flutter burst plus a snap (Momo startles: wings only)
world.fall|world_fall|sfx|world|sfx|mono|850 ms|object falling: descending airy whoosh (noise low-pass sweep down)
world.land|world_land|sfx|world|sfx|stereo|520 ms|soft wood/paper thud plus eight tiny dust puffs
place.grab|place_grab|sfx|world|sfx|mono|90 ms|pick-up tick
place.rotate|place_rotate|sfx|world|sfx|mono|80 ms|soft click with a little tone
place.set|place_set|sfx|world|sfx|mono|380 ms|settle: soft wood thunk plus short tine (truthful: only on a successful commit)
world.rise|world_rise|sfx|world|sfx|stereo|2200 ms|soft ascending air sweep with light shimmer (camera rise: story intro end and "draw another" gate)
thinman.step_a|thinman_step_a|sfx|world|sfx|mono|75 ms|tiny paper-foot tap, quiet
thinman.step_b|thinman_step_b|sfx|world|sfx|mono|75 ms|footstep variant, different timbre
thinman.step_c|thinman_step_c|sfx|world|sfx|mono|75 ms|footstep variant
thinman.step_d|thinman_step_d|sfx|world|sfx|mono|75 ms|footstep variant
thinman.jump|thinman_jump|sfx|world|sfx|mono|210 ms|soft upward whoosh plus tap
thinman.land_soft|thinman_land_soft|sfx|world|sfx|mono|150 ms|small landing thud
thinman.land_hard|thinman_land_hard|sfx|world|sfx|mono|280 ms|larger landing thud, still soft
hazard.hit|hazard_hit|sfx|world|sfx|mono|420 ms|gentle bonk: soft rubbery thump plus small paper clatter; not gory, not startling
fall.abyss|fall_abyss|sfx|world|sfx|mono|1000 ms|descending airy tone that fades into nothing (fell into a gap); no vocal character
goal.reach|goal_reach|sfx|world|sfx|mono|700 ms|flag reached: warm pluck C5 to G5 plus cloth flutter
win.sparkle|win_sparkle|sfx|world|sfx|stereo|1200 ms|confetti glitter burst: random high pentatonic tines, decaying
intro.spotlight|intro_spotlight|sfx|world|sfx|mono|900 ms|soft airy swell (spotlight moves to the next story beat)
dream.blast|dream_blast|sfx|dream|sfx|stereo|1500 ms|loader blast: rising charge into a soft whoosh
dream.iris|dream_iris|sfx|dream|sfx|stereo|1900 ms|iris closing: soft exponential swoosh with a low sweep and shimmer
ending.chute_open|ending_chute_open|sfx|ending|sfx|mono|800 ms|canopy opening: soft "fwump" plus fabric flutter
ending.descend|ending_descend|sfx|ending|sfx|stereo|3300 ms|gentle fabric/air flutter bed for the slow descent, faded in and out
ending.touchdown|ending_touchdown|sfx|ending|sfx|mono|500 ms|soft landing thud plus dust puffs
pond.jump|pond_jump|sfx|ending|sfx|mono|700 ms|arc whoosh plus a tiny tonal rise
pond.splash|pond_splash|sfx|ending|sfx|stereo|1300 ms|ink splash: fourteen soft drops plus three ripples
pond.sink|pond_sink|sfx|ending|sfx|mono|600 ms|sinking bloop: low sine glide downward
pond.glint|pond_glint|sfx|ending|sfx|stereo|1300 ms|eleven soft high pentatonic glints, decaying
pond.exit|pond_exit|sfx|ending|sfx|stereo|1200 ms|emerge spin whoosh with a rising sweep
recap.land|recap_land|sfx|ending|sfx|mono|220 ms|soft paper tap plus a small tine (the engine steps its pitch up the pentatonic per card)
thinman.poke|thinman_poke|sfx|ending|sfx|mono|220 ms|soft rubbery "doing" (non-vocal) when Thinman is poked

### Music worker (already briefed; listed for completeness)
bgm.dream bgm.cover bgm.tutorial bgm.levels bgm.story bgm.focus bgm.l1 bgm.l2 bgm.l3 bgm.ending (music loops); jingle.level_complete jingle.fail_soft jingle.ending_close jingle.level_intro (stingers); amb.dream_wind amb.paper_room amb.world_air (ambience loops).
