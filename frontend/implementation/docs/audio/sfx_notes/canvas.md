# Worker B sfx notes: tools, drawing, HITL, book and cards, sticker, ribbons

Files: `tools/audio-gen/sfx/canvas_sfx.py`, `tools/audio-gen/common/fx_canvas.py`, `tools/audio-gen/checks/check_canvas.py`.

**Listening was NOT performed.** Everything below comes from objective measurements of the decoded Opus files (duration, peak, centroid, band fractions, pitch peaks, loop seam) made with `checks/check_canvas.py`. Subjective quality (naturalness, paper realism, pleasantness) is `NOT_TESTED`.

Build: `python build_all.py --out <OUT> --no-ts --only 'tool.*' 'draw.*' 'mission.*' 'hitl.*' 'page.*' 'card.*' 'sticker.*' 'ribbon.*' --jobs 2` then `python checks/check_canvas.py <OUT>`.
Result at authoring time: 29 assets (27 one-shots, 2 loops), build QA issues: none; checker FAILS: none, FLAGS: none. Total 95 KiB.

## Design notes
- Nothing vocal. All sounds are paper (band-passed noise, crackle grains, flutter), wood/rubber (inharmonic modal), ink thud, tines (kalimba/marimba/FM bell) and air. Pitch set: C major pentatonic only; measured pitches are within 1 cent (see check output).
- `hitl.reveal` is one fixed tap block copied three times at 0/110/220 ms: raw samples identical (relative error < 0.001), decoded RMS spread 0.2 dB, peak spread 0.5 dB (Opus). The pan is the same for all three taps. A very quiet settle follows the third tap.
- `hitl.decide` is a single asset, so it is identical for accept, correct and override by construction. No rising or falling reward contour.
- `draw.pencil` / `draw.eraser` are built exactly periodic in the frequency domain (period = 38400 samples), rotated so the seam sits at a locally quiet point; decoded seam jump 0.007 / 0.002 (limit 0.05). Encoded at 56 kbps (not the default 40): at 40 kbps Opus under-represents noise by about 2 dB RMS, at 56 kbps the measured RMS is -28.0 / -29.0 dB as specified.
- `ribbon.notch` body is exactly C5 (523.3 Hz measured); with the engine rates 1, 1.122, 1.26, 1.498 it lands on C5, D5, E5, G5 within 1 cent.
- Loudness: LUFS is not reported by ffmpeg's ebur128 for clips under ~0.4 s (shows -70), use peak. Peak targets follow the brief: feedback -9..-7 dB, stamp -6, unlock -5 (measured decoded peak within 0.3 dB). Note decoded `ribbon.unlock` is clearly the loudest by LUFS (-15.4); the engine may trim it.
- Engine hints: the loops are noise textures; playback-rate scaling is safe in roughly 0.8-1.4 (not verified by listening). Both loops carry no pitch, so rate change only shifts the grain colour.
- Not changed: `common/dsp.py`, `common/master.py`, `registry.py`, `build_all.py`.

## Assets (duration / decoded peak / integrated LUFS)

| id | recipe | measured | known weaknesses |
|---|---|---|---|
| tool.pencil | wood modal ~1.25 kHz (3 inharmonic partials, tau 5-12 ms) + 2-4 kHz noise tick + 4 band-passed scratch grains | 90 ms / -8.9 dBFS / n/a (<0.4 s, gate) | very dry; no real graphite grit at 90 ms |
| tool.eraser | falling sine 360->250 Hz + low-passed noise thump + 0.7-2.3 kHz rub, LP 3 kHz | 100 ms / -9.2 dBFS / n/a (<0.4 s, gate) | may read as a generic soft thud |
| tool.undo | pink noise swept 2.5->0.85 kHz band-pass, swell peaking at 115 ms, tiny wood tick at 120 ms | 170 ms / -10.1 dBFS / n/a (<0.4 s, gate) | reverse feel relies on the envelope only |
| tool.redo | pink noise swept 0.85->2.5 kHz, fast swell then decay, tick at t=0 | 170 ms / -9.5 dBFS / n/a (<0.4 s, gate) | mirror of undo is approximate |
| tool.clear | 70 band-noise grains (0.8-2.5 kHz, random pan) + 4 louder creases + low 200-800 Hz rustle, LP 4.2 kHz | 520 ms / -7.9 dBFS / -24.9 | crumple is synthetic crackle; density tuned by number only |
| tool.tick | kalimba modal C6 (1:5.4:13, tau 32 ms) + 2 ms noise pop, LP 5.2 kHz | 130 ms / -8.7 dBFS / n/a (<0.4 s, gate) | very short; tine barely audible as pitch |
| draw.pencil | exactly periodic (FFT-built) noise 1.3-3.3 kHz + 0.33-1.1 kHz body, random micro-AM (exp of 25-80 Hz noise) + 110 sparse crackle impulses, seam rotated to a quiet point; 56 kbps | 800 ms / -11.3 dBFS / -23.4 | loop is 0.8 s: repetition may be audible over long strokes; rate scaling untested |
| draw.eraser | periodic noise 0.5-2.3 kHz + 180-520 Hz body, ~6 rub strokes per loop, slow drift; 56 kbps | 800 ms / -10.9 dBFS / -25.3 | rub strokes at 7.5 Hz could pulse audibly at high playbackRate |
| mission.open | marimba modal E5 pluck + FM bell A5 (28 ms later) + four tiny G6/C7/E6/A6 sparkles + very short room | 320 ms / -7.3 dBFS / n/a (<0.4 s, gate) | bell/pluck balance is a guess |
| hitl.submit | pink swish 1.0->3.3 kHz + G4 tine (35 cents flat settling to G4 in ~45 ms, octave partial)  | 420 ms / -7.9 dBFS / -23.8 | glide is subtle; pitch is low for laptop speakers (octave partial G5 carries it) |
| hitl.reveal | ONE stereo tap block (modal 520/1180 Hz + 1.3-3.6 kHz paper noise, tiny room) copied sample-identically at 0/110/220 ms, very quiet settle after | 505 ms / -7.9 dBFS / -24.8 | identical taps by design; Opus adds ~0.2-0.5 dB wobble |
| hitl.decide | woodblock modal E4 (1:2:3.1:5.4, tau 60 ms) + noise tick + quiet paper settle | 280 ms / -7.1 dBFS / n/a (<0.4 s, gate) | single asset; neutral by construction |
| page.curl | rising 0.5->1.9 kHz band-pass creak with stick-slip AM, broad swish, 21->12 Hz flutter panned L->R, thump 170->118 Hz + settle at 1.64 s | 1855 ms / -8.1 dBFS / -24.2 | long and noise-based; creak may sound like wind |
| page.flick | pink swish 0.9->4.3 kHz (5-12 ms attack) + short flutter tail | 250 ms / -8.9 dBFS / n/a (<0.4 s, gate) | short; 17% under target length |
| card.deal | 3 x (snap: 1.5-4.2 kHz noise + 760 Hz wood; slide swish) at 0/130/260 ms, pan -0.55/0/+0.55, then settle crackle | 642 ms / -8.9 dBFS / -27.7 | 0.64 s vs 0.75 s target |
| card.flip | 0.65->3.1 kHz swish (150 ms swell) + mid flutter + snap tap at 335 ms + crackle | 446 ms / -8.2 dBFS / -24.5 | swell start is gradual (leading ~11 ms to -50 dB) |
| card.bifold | 46 crackle grains with bell-shaped density + 3 louder fold cracks + low rustle | 626 ms / -9.1 dBFS / -28.2 | crackle shape random; seed-dependent |
| card.close | 26 rising crackle grains + descending 2.8->0.9 kHz swish + soft tap at 205 ms + settle | 357 ms / -7.9 dBFS / n/a (<0.4 s, gate) | 0.36 s vs 0.42 s target |
| card.stamp | 120 Hz (+28% pitch drop) thump with octave, LP noise thump, ink hiss, tiny tine E5 at 22 ms | 368 ms / -6.4 dBFS / n/a (<0.4 s, gate) | 120 Hz body is weak on laptop speakers |
| card.exit | 3 overlapping swishes (decreasing level, 1.0-3.2 kHz) + faint rustle | 440 ms / -9.8 dBFS / -23.0 | 0.44 s vs 0.52 s target |
| sticker.pop | 34 peel crackle grains (rising colour) + falling-sine pop at 235 ms + quiet G6/E6 sparkles (L/R) | 558 ms / -7.9 dBFS / -24.5 | pop may sound like a cartoon bubble |
| sticker.throw | 2 decorrelated pink noise channels, low-pass sweep 450->3600 Hz, swell/decay, pan -0.25->+0.55 + faint band air | 900 ms / -8.4 dBFS / -21.6 | long soft whoosh; very low centroid (~490 Hz), could be muddy |
| sticker.shrink | pink noise band-pass 2.7->0.8 kHz (0.9 oct) with spin tremolo 34->11 Hz | 420 ms / -10.1 dBFS / -22.8 | narrow-ish sweep: may be slightly whistly |
| ribbon.drop | 4 x (flutter 19->9 Hz + falling swish + wood tap 380-455 Hz) at 0/120/240/360 ms, pan -0.6..+0.6, paper settle | 869 ms / -8.5 dBFS / -22.4 | tail fades quickly (0.87 s) |
| ribbon.notch | modal C5 523.25 Hz (+C6, +G6 partials 0.22/0.07, tau 17 ms) + 1.8-4.2 kHz tick; measured pitch 523.3 Hz | 90 ms / -7.6 dBFS / n/a (<0.4 s, gate) | engine rates 1/1.122/1.26/1.498 give C/D/E/G within 1 cent; tick shifts with rate |
| ribbon.armed | 1.9 kHz bright tick + 1.3 kHz lock clack at 42 ms + kalimba C6+G6 | 240 ms / -7.8 dBFS / n/a (<0.4 s, gate) | clack is soft |
| ribbon.launch | 2 decorrelated pink noise whooshes 0.45->3.8 kHz + narrow resonant rising sweep + release tick + 20->12 Hz flutter | 700 ms / -8.4 dBFS / -23.2 | spring character comes from the resonant sweep only |
| ribbon.rebound | inharmonic sine partials (1:2.31:3.7) on 320->230 Hz glide, 12.5 Hz damped vibrato (9%), snap; LP 1.5 kHz | 500 ms / -9.2 dBFS / -26.1 | pitch wobble could read cartoon-like; lowered depth to avoid voice-like wah |
| ribbon.unlock | FM bells C6/E6/G6 (45 ms stagger, tau 0.3 s) + rising elastic twang + swish + 9 random quiet high tines + short reverb | 948 ms / -4.9 dBFS / -15.4 | densest/loudest asset (LUFS -15); engine may trim |

## Known limitations
- Cannot judge realism of crumple/peel/flutter; densities and filter bands were chosen from recipes in the brief and checked only for spectrum (presence 2-5 kHz fraction max 0.38 on `draw.pencil` and `tool.undo`, `air>10k` <= 0.001) and timeline (energy per 50 ms).
- Some durations land short of target but inside +-35 %: page.flick -17 %, card.deal -14 %, card.flip -14 %, card.close -15 %, card.exit -15 %.
- Three assets fade in over 9-15 ms (page.curl, card.flip, sticker.throw); all start audible within 20 ms (build QA ok).
