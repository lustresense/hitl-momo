# SFX notes: interface, NUI feedback, bubbles (Worker A, task AUDIO-SFX-A)

Sources: `tools/audio-gen/sfx/ui_sfx.py` (assets), `tools/audio-gen/common/fx_ui.py` (helpers), `tools/audio-gen/checks/check_ui.py` (objective checks).

**Listening was NOT performed.** Everything below is objective evidence only (build QA from `build_all.py`, plus `checks/check_ui.py` on the decoded Opus files). Evidence class: `STATIC_ONLY` for perceived quality, measured values are from decoded renders. Subjective softness, pleasantness and "not vocal" character are unverified until a human listens on laptop speakers and headphones.

Measured with `build_all.py --out <scratch> --no-ts --only 'ui.*' 'sys.*' 'bubble.*' 'nui.*'` (19 assets, 0 QA issues, 37 KiB total). "Peak" is the decoded peak in dBFS (Opus lowers noisy transient peaks by up to ~3 dB versus the `peak_db` target). LUFS for clips shorter than 400 ms is reported as -70 by ffmpeg (gating window) and is not meaningful. Values come from the render of this commit's synth code; re-render after any change.

| id | recipe (1 line) | dur s (spec) | peak dB | LUFS | known weaknesses |
|---|---|---|---|---|---|
| ui.tap_a | `woody` 1.6 kHz body + 2.4x/3.8x partials, tau 11 ms, 0.2 click noise, LP 4.8 kHz | 0.069 (0.070) | -13.3 | n/a (<400 ms) | very short, may feel dry; level -12 dB target |
| ui.tap_b | same, 1.3 kHz, tau 13.5 ms, less click, LP 3.8 kHz | 0.070 (0.070) | -11.7 | n/a | a/b are 1.1 dB apart in RMS (peak-matched, timbre differs) |
| ui.toggle_on | kalimba tines E5 then G5 at 60 ms, tau 35 ms | 0.130 (0.130) | -9.0 | n/a | tines are quick: more "tick-tine" than ringing kalimba because the 130 ms budget forces a fast fade |
| ui.toggle_off | kalimba tine C5, tau 32 ms | 0.098 (0.100) | -10.0 | n/a | as above |
| ui.denied | two `woody` knocks 190 and 170 Hz (partials 2.3x/3.7x give audibility on laptops), 90 ms apart, 2nd at 0.8 gain, LP 2.3 kHz | 0.226 (0.240) | -12.8 | n/a | fundamental below ~200 Hz is nearly inaudible on laptop speakers, perceived pitch comes from 440/700 Hz partials; unpitched by design |
| ui.notice | paper pop (band 1-3.4 kHz) + kalimba tine A5 tau 70 ms | 0.197 (0.200) | -8.7 | n/a | pop and tine can read as two events on very good speakers |
| ui.ring_in | sine glide 400 to 700 Hz (+12 % 2nd harmonic), airy noise puff 1.4-3.8 kHz, tau 50 ms | 0.167 (0.170) | -11.1 | n/a | a smooth sine glide is "bloop"-like; could resemble bubble.show (xcorr 0.53, distinct but same family) |
| ui.morph | stereo: two decorrelated noise channels, `sweep_bandpass` 800 to 2500 Hz, sparse crackle, faint C4 body gliding up, attack 22 ms, half-cosine decay | 0.435 (0.450) | -14.9 | -35.7 | quiet (decoded peak 3 dB under target because noise peaks shrink in Opus); no true stereo movement beyond a slight L to R gain drift |
| ui.skip | `woody` 1.5 kHz tick + 80 ms band-passed swish 2.4 to 1.2 kHz | 0.105 (0.110) | -13.5 | n/a | highest 2-5 kHz fraction of the set (0.49), developer-only bar |
| sys.hiccup | marimba tines E5, C5, G4 at 0/140/285 ms, low level, LP 3.6 kHz, short room (rt60 0.28 s) | 0.507 (0.520) | -13.0 | -22.5 | three notes (spec text says "E5 to C5 then G4"); deliberately dull |
| sys.ready | kalimba tines C5, E5, G5 every 115 ms + quiet octave shimmer, room rt60 0.40 s | 0.632 (0.650) | -6.9 | -18.2 | reverb tail is cut by a 160 ms fade; shimmer is subtle |
| bubble.show_a | sine glide 360 to 600 Hz (+18 % 2nd harmonic), thin paper pop and tiny puff, tau 40 ms | 0.147 (0.150) | -11.6 | n/a | only sine plus noise: no formants, but "ploop" naturalness untested |
| bubble.show_b | same, 430 to 720 Hz, different pop band | 0.147 (0.150) | -12.3 | n/a | audibly "slightly higher" only by pitch; xcorr with a = 0.32 |
| nui.lit | kalimba tine G5, tau 16 ms | 0.060 (0.060) | -13.8 | n/a | at 60 ms it is a tonal tick, pitch hard to identify |
| nui.hold (loop) | stereo: circular band-limited noise 420-2000 Hz, E4 and B4 partials snapped to whole cycles per loop, 3 and 4 Hz tremolo, soft octave; periodic by construction | 0.900 (0.900) | -20.3 | -27.9 (RMS -30.3 dBFS) | B4 is not in C pentatonic (spec asks for it); partials snapped by +1.9/-2.0 cents; decoded seam jump 0.021 (build limit 0.05) |
| nui.commit | `woody` "pock" 520 Hz + kalimba tines G5 (16 ms) and C6 (80 ms), identical bytes of synthesis every call | 0.255 (0.260) | -5.1 | n/a | loudest of the set by design (-5 dB target) |
| nui.release | sine glide 680 to 340 Hz, faint downward low-passed noise | 0.147 (0.150) | -14.2 | n/a | unpitched sweep, quiet |
| nui.track_lost | marimba tines A4 then E4 at 130 ms, LP 2.6 kHz | 0.372 (0.380) | -12.0 | n/a | low centroid (340 Hz): weak on laptop speakers, the tine fundamentals sit at 330-440 Hz |
| nui.track_found | marimba tines E4 then A4 | 0.373 (0.380) | -12.1 | n/a | same; mirror of lost (xcorr 0.49) |

## Objective checks (checks/check_ui.py)
- Duration within +-35 % of spec for every asset (largest deviation -6 %); leading silence <= 7 ms (ui.morph) else <= 0.3 ms; tail RMS of the last 20 ms below -48 dBFS for all one-shots.
- Measured note pitches are within 5 cents of nominal for all tonal assets; all nominal notes are pentatonic (C D E G A). Documented exceptions: `nui.hold` B4, unpitched knocks (`ui.denied`), unpitched glides (`ui.ring_in`, `bubble.show_*`, `nui.release`).
- Variant distinctness: tap_a/tap_b xcorr 0.10, bubble a/b 0.32 (both < 0.9).
- Presence 2-5 kHz fraction <= 0.49 for every asset, air >10 kHz <= 0.023.
- Synthesis is deterministic (arrays identical on re-run). The encoded Ogg bytes are NOT byte-identical between runs (Ogg stream serial number from ffmpeg), which is a property of `build_all.py`, not of these generators.

## Engine notes
- `nui.hold` is a 0.9 s loop with an RMS target of -30 dB; pitch rises with playback rate (E4/B4 move with it, so keep rates roughly 0.8 to 1.6 where the partials stay below ~800 Hz and the noise bed stays under 3.2 kHz).
- `nui.commit` is one asset for every ring (no per-ring variants).
