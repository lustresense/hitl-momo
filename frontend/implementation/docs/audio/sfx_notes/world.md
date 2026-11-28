# World / Momo / Thinman / intro-dream / ending sound effects (Worker C, M-047)

Source: `tools/audio-gen/sfx/world_sfx.py` with helpers in `tools/audio-gen/common/fx_world.py`. Objective checks: `tools/audio-gen/checks/check_world.py`.

**Listening was NOT performed.** Everything below comes from objective measurement (duration, peak, loudness, spectral fractions, pitch peaks,
cross-correlation, pan balance) of the decoded Opus files. Subjective quality (naturalness, charm, harshness on real speakers) is NOT_TESTED.

Rules followed: original numpy/scipy synthesis only; no samples/AI/vocals. Momo sounds are wings, paper, cloth and air only (the yawn is deliberately silent).
Pitched parts are C major pentatonic (documented in the recipe column; `check_world.py` verifies each against the decoded file). Nothing below ~85 Hz
(HP 85 Hz order 2; 115 Hz order 3 on the noise beds `momo.flap_c`, `world.fall`, `ending.descend`). `hazard.hit` and `fall.abyss` are soft and non-punishing.

Render: `python build_all.py --out <dir> --no-ts --only 'momo.*' 'world.*' 'place.*' 'thinman.*' 'hazard.*' 'fall.*' 'goal.*' 'win.*' 'intro.*' 'dream.*' 'ending.*' 'pond.*' 'recap.*'`
(39 assets, 0 QA issues, about 152 KiB total). Output is deterministic at sample level (decoded files identical across two builds; the Ogg container bytes differ
between runs because ffmpeg writes a random stream serial).

Measured values are from the decoded Opus files. LUFS is shown only where the integrated gate yields a value (assets under ~0.4 s read -70).

| id | recipe | duration | peak dBFS | LUFS-I | known weaknesses |
|---|---|---|---|---|---|
| `momo.flap_a` | 3 wing beats (0/76/146 ms, gains 1/.82/.58): band-passed noise 260-2300 Hz with sin^2 attack ~16 ms, muffled low noise body (240 Hz LP) and sparse paper grains | 230 ms | -14.5 | n/a (<0.4 s, gated) | Noise-based; real wing/cloth realism unverified by ear. Beat contrast (3rd beat) is subtle. |
| `momo.flap_b` | 3 beats with a different rhythm (0/56/138 ms: two close beats then a late soft one), brighter band 320-2700 Hz | 230 ms | -13.9 | n/a (<0.4 s, gated) | Highest presence of the three flaps (0.21, still under the 0.55 harsh limit). |
| `momo.flap_c` | softer variant: 3 slower beats (attack ~22 ms), darker 200-1500 Hz, less paper crackle, HP 115 Hz order 3 | 230 ms | -15.1 | n/a (<0.4 s, gated) | Level equal to a/b by RMS only approximately; by design quieter peak (-15 dB). |
| `momo.whoosh_a` | pink noise through a log-contour band-pass 600->1900->900 Hz (1.4 oct), swell envelope, 23 Hz paper flutter, faint crackle, pan -0.9 -> +0.9 | 516 ms | -12.8 | -24.1 | Pan law is amplitude only (no Doppler/ITD); mono sum loses the movement. |
| `momo.whoosh_b` | same engine, contour 1000->2100->700 Hz, pan +0.9 -> -0.9 | 516 ms | -12.9 | -23.2 | As whoosh_a. |
| `momo.land` | paper 'pap': band-passed noise burst 700-2800 Hz tau 16 ms + muffled 330 Hz noise body + tiny settle tap and three paper grains | 170 ms | -12.4 | n/a (<0.4 s, gated) | Very short; may read as a click on tiny speakers. |
| `momo.hop` | E4 'tok': sine (+2.76x partial) gliding ~7 % upward over ~18 ms into E4 (329.6 Hz), tau 40 ms, small noise tick, LP 3.6 kHz | 150 ms | -11.0 | n/a (<0.4 s, gated) | Tonal glide could be heard as a 'boing'; no formants, no vibrato. |
| `momo.wave` | two cloth swishes (0 and 155 ms): pink noise, contour band-pass 600->1500 then 1400->700 Hz, hump envelope + faint low rustle | 315 ms | -12.4 | n/a (<0.4 s, gated) | Swishes are subtle; level near the noise floor of a busy scene. |
| `momo.startle` | paper snap (1.1-3.3 kHz noise tick + 820 Hz wood partials) then 0.3 s wing flutter burst at ~27 Hz, decaying | 323 ms | -9.4 | n/a (<0.4 s, gated) | Shorter than target (323 vs 380 ms, inside +-35 %); highest presence among Momo sounds (0.35). |
| `world.fall` | pink noise through a falling low-pass contour 4200->1500->330 Hz, fast onset (floor 0.2) then long fade, light 19 Hz flutter; HP 115 Hz order 3 | 843 ms | -10.2 | -26.7 | Whoosh-only; no pitch cue for height. |
| `world.land` | thud (175->118 Hz sine glide, tau 70 ms) + wood tap 360 Hz partials, plus eight tiny band-passed dust puffs (45-420 ms) randomly panned | 488 ms | -9.0 | -22.7 | Stereo detail lives only in the puffs. |
| `place.grab` | wood tick (1350 Hz partials 1/2.35/3.9, tau 16 ms) + noise transient + a 40 ms upward chirp 700->1600 Hz at low level | 90 ms | -12.5 | n/a (<0.4 s, gated) | 90 ms; chirp is very faint. |
| `place.rotate` | noise click (1-3.2 kHz, tau 3 ms) + A5 (880 Hz) sine tone tau 20 ms | 80 ms | -13.8 | n/a (<0.4 s, gated) | Tone is pentatonic (A5); engine may pitch-shift rate, then it leaves the pentatonic set. |
| `place.set` | thunk (260->190 Hz glide thud + 440 Hz wood partials) then G5 (784 Hz) kalimba tine at +45 ms | 354 ms | -7.8 | n/a (<0.4 s, gated) | Played only on a real commit (truthful); tine quiet by design. |
| `world.rise` | two decorrelated pink-noise channels through a rising contour band-pass 380->1100->3300 Hz (1.6 oct), slow swell (floor 0.07), plus five soft tines G5-A5-C6-E6-G6 at 0.9-1.9 s | 2196 ms | -12.0 | -23.2 | Shimmer is quiet and sits under the noise sweep. |
| `thinman.step_a` | paper-foot tap: noise 900-3000 Hz tau 10 ms + 560 Hz wood partials | 75 ms | -16.8 | n/a (<0.4 s, gated) | Variants are distinguished by timbre only; peak -16 dB. |
| `thinman.step_b` | duller fabric pad: LP 1400 Hz noise + 330 Hz soft partials (peak target -19 dB to match the RMS of the others) | 75 ms | -18.7 | n/a (<0.4 s, gated) | Lowest centroid (~460 Hz): weak on laptop speakers. |
| `thinman.step_c` | crisp tap: 1.6-4.2 kHz noise tau 6 ms + 980 Hz partials (peak -15 dB) | 75 ms | -16.2 | n/a (<0.4 s, gated) | None. |
| `thinman.step_d` | soft two-grain 'scuff' (0 and 17 ms) plus a 300 Hz shuffle | 75 ms | -18.3 | n/a (<0.4 s, gated) | Decoded peak lands 2 dB under the -16 target (codec on a 75 ms transient). |
| `thinman.jump` | rising pink-noise contour band-pass 520->2300 Hz with 70 ms hump + 430 Hz push-off wood tap | 210 ms | -10.4 | n/a (<0.4 s, gated) | None known. |
| `thinman.land_soft` | small thud: 165->112 Hz glide (tau 40 ms) + LP noise + two paper grains | 150 ms | -12.0 | n/a (<0.4 s, gated) | Body ~130 Hz: audible mainly as a click on laptops. |
| `thinman.land_hard` | larger thud: 135->92 Hz glide (tau 90 ms) + 300 Hz wood partials + four-grain paper rustle | 280 ms | -8.6 | n/a (<0.4 s, gated) | Body ~110 Hz; HP 85 Hz leaves it thin on laptops. |
| `hazard.hit` | rubbery bonk: sine 150+120*exp(-t/50ms) Hz with a damped 21 Hz wobble, tau 85 ms, LP 1.8 kHz + five paper-clatter grains; attack ~4 ms; peak -8 dB | 412 ms | -7.9 | -22.7 | 'Bonk' glide is cartoonish by intent; no impact transient above 3.6 kHz so it should not startle. |
| `fall.abyss` | band-passed pink noise (0.55 oct) sweeping 900->190 Hz + pure sine glide G5->C4 (LP 1.3 kHz), 30 ms attack, exponential fade to nothing, no vibrato | 986 ms | -10.2 | -26.6 | Glide sine could be heard as a slide whistle; listening not done. |
| `goal.reach` | warm pluck C5 (0 ms) then G5 (+130 ms): near-harmonic modal partials tau 0.26-0.3 s, LP 5.2 kHz, plus a 0.5 s 13 Hz cloth flutter at low level | 688 ms | -5.0 | -17.0 | Peak -5 dB: loudest world cue by design; no vocal content. |
| `win.sparkle` | 26 soft kalimba tines (partials 1/2/5.4/13, <9 kHz) from C6-D6-E6-G6-A6 (12 % an octave up), times weighted early, decaying gain, random pans, faint 1.8-3.5 kHz noise glitter | 1177 ms | -5.5 | -17.6 | Random pitches chosen by the seeded RNG: dense pentatonic clusters can sound busy. |
| `intro.spotlight` | pink noise contour band-pass 650->1500->1000 Hz, swell envelope (floor 0.1), faint G4 + D5 sine pair | 886 ms | -13.8 | -26.1 | Airy swell is gentle; may be inaudible under music at low SFX volume. |
| `dream.blast` | 0-0.9 s charge: noise contour band-pass 350->3200 Hz + G3->G5 sine glide, quadratic crescendo; then stereo pink-noise low-pass whoosh 5200->450 Hz (attack 50 ms, tau 220 ms) at +0.86 s | 1486 ms | -8.2 | -22.2 | Charge uses an exponential glide; 5 dB level dip at the hand-over. |
| `dream.iris` | two decorrelated noise channels, contour band-pass 3300->800->260 Hz, stereo width collapsing to centre, A3->A2 low sine sweep, four quiet tines G6-E6-D6-C6 | 1858 ms | -9.5 | -20.6 | Low sweep (110-230 Hz) will be inaudible on small speakers. |
| `ending.chute_open` | fwump: LP 750 Hz noise hump + 115->155 Hz body + paper snap, then 0.62 s 15 Hz cloth flutter decaying | 728 ms | -9.4 | -30.5 | Shorter than target (728 vs 800 ms). |
| `ending.descend` | 3.3 s bed: two noise-flutter layers (11-13 Hz and 15.5-17 Hz, jittered) + LP pink air, slow level wander, 0.9 s fade in / 1.1 s fade out, HP 115 Hz order 3; peak -18 dB | 3280 ms | -18.0 | -31.1 | Starts at -58 dBFS rms (very soft) by design; dominant env modulation 10.5 Hz, 3-8 Hz fraction 0.13. |
| `ending.touchdown` | thud 150->100 Hz (tau 90 ms) + paper tap + six dust puffs | 479 ms | -8.7 | -25.2 | Distinct from world.land mainly by lower body and mono. |
| `pond.jump` | arc whoosh (noise contour 520->1900->800 Hz) + faint E5->A5 tonal rise + small push-off tap | 689 ms | -10.7 | -22.0 | Tonal rise is faint (gain 0.17). |
| `pond.splash` | 0.3 s noise splash burst + 14 'ink drops' (pentatonic upward bloop glides, random pans) + three slow ripples C4/A3/G3 with water-band noise | 1252 ms | -7.8 | -23.1 | Ripples are sine-based and may sound like soft tones; drops are randomised by seeded RNG. |
| `pond.sink` | sine glide E4 (330 Hz) -> A2 (110 Hz) + 2nd harmonic, swell envelope, faint late A4 bloop | 585 ms | -10.0 | -18.0 | Low end (110 Hz) is thin on laptop speakers. |
| `pond.glint` | eleven sine glints (+2nd harmonic) from C6-D6-E6-G6-A6 in a fixed contour sequence, spaced 45-145 ms, decaying gain, random pans | 1254 ms | -11.9 | -24.3 | Pure sines at 1-1.8 kHz: keep level low in the engine. |
| `pond.exit` | rising noise contour 350->2000->4200 Hz with an accelerating spin pan (1.2->4.2 Hz) + five drop blips | 1177 ms | -9.3 | -21.2 | Highest centre frequency of the water cues; presence only 0.06. |
| `recap.land` | paper tap (900-3000 Hz, tau 12 ms) + C5 kalimba tine (523 Hz) at +12 ms; base pitch chosen so rates 1/1.122/1.26/1.498/1.682 = C D E G A | 220 ms | -9.1 | n/a (<0.4 s, gated) | Engine rates above 1.7 leave the pentatonic set. |
| `thinman.poke` | rubber-band 'doing': G4 (392 Hz) sine with 26 Hz damped pitch wobble (+10 % start glide) + 2.76x partial, LP 3.2 kHz, tau 65 ms, small tick | 220 ms | -9.3 | n/a (<0.4 s, gated) | Spring wobble is syllable-adjacent (~26 Hz is above the syllable range) but listening was not done. |

## Engine notes
- Footsteps `thinman.step_a..d`: pick randomly without immediate repeats; peaks -16 to -19 dB, equalised by RMS rather than peak.
- `recap.land`: base tine is C5; rates 1, 1.122, 1.26, 1.498 stay on C D E G (1.682 = A5). `place.rotate` is A5 at rate 1.
- `ending.descend` is a one-shot bed (3.3 s, faded in and out): trigger it once per descent, not as a loop.
- `momo.whoosh_a/b` are stereo with the movement baked in (a: left to right, b: right to left); do not pan them again.
- The Ogg `LUFS` of short one-shots is not meaningful; use `peak_db` in the registry for relative level.
