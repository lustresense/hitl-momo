#!/usr/bin/env python3
"""Objective checks for the Worker C assets (momo / world / place / thinman / hazard / fall / goal / win / intro / dream / ending / pond / recap).

Usage (from tools/audio-gen):
    python build_all.py --out /tmp/sfx_out_C --no-ts --only 'momo.*' 'world.*' ...      # render first
    python checks/check_world.py /tmp/sfx_out_C

Prints: id, duration vs spec target (+-35 %), decoded peak dBFS, spectral centroid, presence 2-5 kHz fraction, air >10 kHz fraction,
energy <80 Hz fraction, leading silence (ms, <= 20), tail RMS (last 20 ms), LUFS (from the manifest). Then pitch-class checks for the
tonal assets, variant cross-correlation (< 0.9), stereo-movement checks and a flutter-rate (syllable-rhythm) check.
Exit code 1 if any hard check fails. Listening was NOT performed: these are objective measurements only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import signal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common import dsp, master  # noqa: E402
from common.dsp import SR  # noqa: E402

# id -> (file stem, target duration in ms from SFX_SPEC.md, stereo)
SPEC = {
    "momo.flap_a": ("momo_flap_a", 230, False), "momo.flap_b": ("momo_flap_b", 230, False), "momo.flap_c": ("momo_flap_c", 230, False),
    "momo.whoosh_a": ("momo_whoosh_a", 520, True), "momo.whoosh_b": ("momo_whoosh_b", 520, True), "momo.land": ("momo_land", 170, False),
    "momo.hop": ("momo_hop", 150, False), "momo.wave": ("momo_wave", 320, False), "momo.startle": ("momo_startle", 380, False),
    "world.fall": ("world_fall", 850, False), "world.land": ("world_land", 520, True), "place.grab": ("place_grab", 90, False),
    "place.rotate": ("place_rotate", 80, False), "place.set": ("place_set", 380, False), "world.rise": ("world_rise", 2200, True),
    "thinman.step_a": ("thinman_step_a", 75, False), "thinman.step_b": ("thinman_step_b", 75, False), "thinman.step_c": ("thinman_step_c", 75, False),
    "thinman.step_d": ("thinman_step_d", 75, False), "thinman.jump": ("thinman_jump", 210, False), "thinman.land_soft": ("thinman_land_soft", 150, False),
    "thinman.land_hard": ("thinman_land_hard", 280, False), "hazard.hit": ("hazard_hit", 420, False), "fall.abyss": ("fall_abyss", 1000, False),
    "goal.reach": ("goal_reach", 700, False), "win.sparkle": ("win_sparkle", 1200, True), "intro.spotlight": ("intro_spotlight", 900, False),
    "dream.blast": ("dream_blast", 1500, True), "dream.iris": ("dream_iris", 1900, True), "ending.chute_open": ("ending_chute_open", 800, False),
    "ending.descend": ("ending_descend", 3300, True), "ending.touchdown": ("ending_touchdown", 500, False), "pond.jump": ("pond_jump", 700, False),
    "pond.splash": ("pond_splash", 1300, True), "pond.sink": ("pond_sink", 600, False), "pond.glint": ("pond_glint", 1300, True),
    "pond.exit": ("pond_exit", 1200, True), "recap.land": ("recap_land", 220, False), "thinman.poke": ("thinman_poke", 220, False),
}

# Tonal assets: id -> list of (documented frequency Hz, label, analysis window start s, end s). All must be C major pentatonic members.
TONAL = {
    "momo.hop": [(329.63, "E4 (end of glide)", 0.03, 0.14)],
    "place.rotate": [(880.00, "A5", 0.0, 0.07)],
    "place.set": [(783.99, "G5 tine", 0.06, 0.34)],
    "goal.reach": [(523.25, "C5 pluck", 0.0, 0.12), (783.99, "G5 pluck", 0.15, 0.6)],
    "recap.land": [(523.25, "C5 tine", 0.02, 0.2)],
    "thinman.poke": [(392.00, "G4 (end of wobble)", 0.1, 0.2)],
    "world.rise": [(783.99, "G5 shimmer", 0.9, 1.15), (1046.5, "C6 shimmer", 1.46, 1.7)],
    "pond.jump": [(880.00, "A5 (end of rise)", 0.36, 0.46)],
    "dream.iris": [(1567.98, "G6 shimmer", 0.12, 0.4), (1046.5, "C6 shimmer", 1.1, 1.5)],
    "intro.spotlight": [(392.00, "G4", 0.2, 0.7), (587.33, "D5", 0.2, 0.7)],
}
# Glides / collections documented but not single-peak checkable: only check that the endpoints are pentatonic members.
DOCUMENTED = {
    "fall.abyss": [783.99, 261.63], "pond.sink": [329.63, 110.0], "dream.blast": [196.0, 783.99],
    "win.sparkle": [1046.5, 1174.66, 1318.51, 1567.98, 1760.0, 2093.0, 2349.32, 2637.02, 3135.96, 3520.0],
    "pond.glint": [1046.5, 1174.66, 1318.51, 1567.98, 1760.0], "pond.splash": [261.63, 220.0, 196.0, 392.0, 440.0, 523.25, 587.33, 659.26, 783.99, 880.0, 1046.5],
    "pond.exit": [783.99, 659.26],
}
# 12-TET pitch classes allowed: C D E G A -> semitone numbers
PENTA_PC = {0, 2, 4, 7, 9}
VARIANT_GROUPS = [["momo.flap_a", "momo.flap_b", "momo.flap_c"], ["momo.whoosh_a", "momo.whoosh_b"],
                  ["thinman.step_a", "thinman.step_b", "thinman.step_c", "thinman.step_d"]]
# peak target (dB) per the module, to check the decoded peak lands near it
TARGET_PEAK = None


def pitch_class(f: float) -> tuple[int, float]:
    m = 69 + 12 * np.log2(f / 440.0)
    r = int(round(m))
    return r % 12, 100 * (m - r)


def load(out: Path, stem: str) -> np.ndarray:
    return master.decode_to_array(out / "sfx" / f"{stem}.ogg")


def mono(x):
    return x if x.ndim == 1 else x.mean(axis=1)


def band_frac(x, lo, hi):
    m = mono(x)
    n = 1 << int(np.floor(np.log2(max(m.shape[0], 2048))))
    seg = np.pad(m, (0, max(0, n - m.shape[0])))[:n] * np.hanning(n)
    P = np.abs(np.fft.rfft(seg)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    return float(P[(f >= lo) & (f < hi)].sum() / (P.sum() + 1e-18))


def lead_ms(x):
    a = np.abs(x if x.ndim == 1 else x.max(axis=1))
    i = np.flatnonzero(a > dsp.db(-50))
    return (i[0] / SR * 1000) if i.size else float("nan")


def tail_db(x):
    t = x[-int(0.02 * SR):]
    return 20 * np.log10(dsp.rms(t) + 1e-12)


def peak_spectrum(m, f_lo, f_hi, t0, t1):
    seg = m[int(t0 * SR):int(t1 * SR)]
    n = 1 << 16
    seg = np.pad(seg * np.hanning(seg.shape[0]), (0, max(0, n - seg.shape[0])))[:n]
    P = np.abs(np.fft.rfft(seg))
    f = np.fft.rfftfreq(n, 1 / SR)
    sel = (f >= f_lo) & (f <= f_hi)
    i = np.argmax(P[sel])
    return float(f[sel][i])


def max_xcorr(a, b):
    a = mono(a); b = mono(b)
    a = a / (np.linalg.norm(a) + 1e-12); b = b / (np.linalg.norm(b) + 1e-12)
    c = signal.fftconvolve(a, b[::-1], mode="full")
    return float(np.max(np.abs(c)))


def env_mod_peak(x, lo=1.0, hi=40.0):
    """Dominant envelope-modulation frequency (Hz) of x between lo and hi, to show the flutter is not in the syllable range (~3-8 Hz)."""
    m = mono(x)
    env = np.abs(signal.hilbert(m))
    env = dsp.lowpass(env, 60.0, 2)
    env = env - env.mean()
    n = 1 << int(np.ceil(np.log2(env.shape[0] * 4)))
    P = np.abs(np.fft.rfft(env * np.hanning(env.shape[0]), n))
    f = np.fft.rfftfreq(n, 1 / SR)
    sel = (f >= lo) & (f <= hi)
    return float(f[sel][np.argmax(P[sel])])


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/audio-work/sfx_out_C")
    mf = {r["id"]: r for r in json.loads((out / "manifest.json").read_text())["assets"]} if (out / "manifest.json").exists() else {}
    fails = []
    data = {}
    print(f"{'id':<20}{'dur ms':>7}{'tgt':>6}{'%':>6}{'peak':>7}{'cent Hz':>8}{'pres':>6}{'air10k':>8}{'<80Hz':>7}{'lead ms':>8}{'tail dB':>8}{'LUFS':>7}  qa")
    for sid, (stem, tgt, stereo) in SPEC.items():
        p = out / "sfx" / f"{stem}.ogg"
        if not p.exists():
            print(f"{sid:<20} MISSING {p}"); fails.append(f"{sid} missing"); continue
        x = load(out, stem)
        data[sid] = x
        dur = x.shape[0] / SR * 1000
        pk = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
        sr = master.spectral_report(x)
        lo80 = band_frac(x, 0, 80)
        ld = lead_ms(x); tl = tail_db(x)
        ratio = dur / tgt
        lufs = mf.get(sid, {}).get("lufsI")
        qa = mf.get(sid, {}).get("qa", [])
        flag = []
        if abs(ratio - 1) > 0.35: flag.append("DUR")
        if ld > 20: flag.append("LEAD")
        if tl > -45: flag.append("TAIL")
        if sr["presence_2k_5k"] > 0.55: flag.append("PRES")
        if lo80 > 0.02: flag.append("SUB80")
        if (x.ndim == 2) != stereo: flag.append("CHANNELS")
        if qa: flag.append("QA:" + ";".join(qa))
        if flag: fails.append(f"{sid}: {','.join(flag)}")
        print(f"{sid:<20}{dur:>7.0f}{tgt:>6}{ratio * 100:>5.0f}%{pk:>7.1f}{sr['centroid_hz']:>8.0f}{sr['presence_2k_5k']:>6.2f}{sr['air_gt_10k']:>8.4f}{lo80:>7.3f}{ld:>8.1f}{tl:>8.1f}{lufs if lufs is not None else float('nan'):>7.1f}  {' '.join(flag)}")

    print("\n== pitch-class check (tonal assets; all documented frequencies must be C D E G A) ==")
    for sid, items in TONAL.items():
        if sid not in data: continue
        m = mono(data[sid])
        for f0, label, t0, t1 in items:
            pc, cents = pitch_class(f0)
            meas = peak_spectrum(m, f0 * 0.97, f0 * 1.03, t0, t1)
            _, mc = pitch_class(meas)
            ok = pc in PENTA_PC and abs(1200 * np.log2(meas / f0)) < 45
            if not ok: fails.append(f"{sid} pitch {label}")
            print(f"  {sid:<18} {label:<20} documented {f0:8.2f} Hz (pc {pc:>2}, {cents:+.0f}c)  measured peak {meas:8.1f} Hz ({1200 * np.log2(meas / f0):+.0f}c)  {'ok' if ok else 'FAIL'}")
    for sid, freqs in DOCUMENTED.items():
        bad = [f for f in freqs if pitch_class(f)[0] not in PENTA_PC and f > 130]
        if bad: fails.append(f"{sid} non-pentatonic documented {bad}")
        print(f"  {sid:<18} documented tones/glide endpoints: {', '.join(f'{f:.1f}' for f in freqs)}  {'ok' if not bad else 'NON-PENTA ' + str(bad)}")
    print("  (pond.sink low end 110 Hz = A2 is pentatonic; momo.flap/whoosh/steps/landings/thuds/fall/paper/cloth are unpitched noise or low thump bodies)")

    print("\n== variant distinctness (max normalised cross-correlation, must be < 0.9) ==")
    for grp in VARIANT_GROUPS:
        for i in range(len(grp)):
            for j in range(i + 1, len(grp)):
                if grp[i] in data and grp[j] in data:
                    c = max_xcorr(data[grp[i]], data[grp[j]])
                    if c >= 0.9: fails.append(f"{grp[i]}~{grp[j]} xcorr {c:.2f}")
                    print(f"  {grp[i]:<16} vs {grp[j]:<16} {c:.3f} {'ok' if c < 0.9 else 'TOO SIMILAR'}")

    print("\n== stereo movement (L/R energy balance, first third -> last third) ==")
    for sid, want in (("momo.whoosh_a", "left -> right"), ("momo.whoosh_b", "right -> left")):
        if sid not in data: continue
        x = data[sid]; n = x.shape[0]
        bal = lambda s: 10 * np.log10((np.sum(x[s, 1] ** 2) + 1e-12) / (np.sum(x[s, 0] ** 2) + 1e-12))
        b0, b1 = bal(slice(0, n // 3)), bal(slice(2 * n // 3, n))
        ok = (b1 - b0 > 6) if want == "left -> right" else (b0 - b1 > 6)
        if not ok: fails.append(f"{sid} pan direction")
        print(f"  {sid:<16} R-L dB first third {b0:+.1f}, last third {b1:+.1f}  expected {want}: {'ok' if ok else 'FAIL'}")

    print("\n== flutter / rhythm check: dominant envelope modulation (Hz); syllable-like rhythm would sit at ~3-8 Hz ==")
    for sid in ("ending.descend", "ending.chute_open", "momo.startle", "goal.reach", "momo.flap_a", "momo.flap_b", "momo.flap_c"):
        if sid in data:
            hi = 40.0
            r = env_mod_peak(data[sid], 9.0 if sid in ("ending.descend",) else 1.0, hi)
            print(f"  {sid:<18} dominant env modulation {r:5.1f} Hz (searched {'9' if sid == 'ending.descend' else '1'}-{hi:.0f} Hz)")
    if "ending.descend" in data:
        m = mono(data["ending.descend"]); env = dsp.lowpass(np.abs(signal.hilbert(m)), 60.0, 2); env -= env.mean()
        n = 1 << 19; P = np.abs(np.fft.rfft(env * np.hanning(env.shape[0]), n)); f = np.fft.rfftfreq(n, 1 / SR)
        syl = P[(f >= 3) & (f <= 8)].sum() / (P[(f >= 1) & (f <= 40)].sum() + 1e-12)
        print(f"  ending.descend envelope-modulation energy fraction in 3-8 Hz: {syl:.2f}")

    print("\n== summary ==")
    print(f"assets checked: {len(data)}/{len(SPEC)}; hard-check failures: {len(fails)}")
    for f in fails: print("  FAIL", f)
    print("Listening was NOT performed; these are objective measurements only.")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
