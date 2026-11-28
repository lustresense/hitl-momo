"""World / Momo (non-vocal) / Thinman / intro / dream / ending sound effects (Worker C, mandate M-047).

Original numpy/scipy synthesis only. Momo has NO voice: every `momo.*` sound is wings, paper, cloth or air.
Spec: docs/audio/SFX_SPEC.md "Worker C". Every generator returns a mono or stereo float array; mastering normalises the peak.
Design notes and measured values: docs/audio/sfx_notes/world.md. Objective checks: tools/audio-gen/checks/check_world.py.
"""
from __future__ import annotations

import numpy as np

from common import dsp, fx_world as fx
from common.dsp import SR, n_of
from registry import sfx

P = fx.PENTA


def _norm(x, peak=1.0):
    p = dsp.peak(x)
    return x * (peak / p) if p > 0 else x


# =============================================================================================== MOMO (wings / paper / cloth / air)
def _wing_beat(rng, dur, attack, tau, lo, hi, low_fc, low_amt, crackle_amt, paper_rate=260.0):
    """One soft cloth/paper wing beat: band-passed noise hump + muffled low body + a few paper grains."""
    n = n_of(dur)
    body = fx.bpn(n, rng, lo, hi) * fx.env_hump(n, attack, tau)
    body /= np.max(np.abs(body)) + 1e-9
    low = fx.lpn(n, rng, low_fc) * fx.env_hump(n, attack * 1.2, tau * 1.5)
    low /= np.max(np.abs(low)) + 1e-9
    pap = fx.crackle(n, rng, paper_rate, 1800, 3800, 0.002) * fx.env_hump(n, attack, tau * 1.3)
    return body + low_amt * low + crackle_amt * pap


def _flap(rng, beats, lo, hi, tau, attack, low_fc, low_amt, crackle_amt, total=0.23, hp=85.0, hp_order=2):
    n = n_of(total)
    out = np.zeros(n)
    for t0, amp, atk_mul, lo_mul in beats:
        b = _wing_beat(rng, 0.095, attack * atk_mul, tau, lo * lo_mul, hi * (0.85 + 0.3 * rng.random()), low_fc, low_amt, crackle_amt)
        out += fx.seg(n, t0, b, amp)
    return fx.finish(out, total, fade_ms=60, hp=hp, hp_order=hp_order)


@sfx("momo.flap_a", "momo_flap_a", "core", "sfx", peak_db=-14, desc="soft fabric/paper wing flaps, 3 beats (no vocal content)")
def momo_flap_a(rng):
    return _flap(rng, [(0.0, 1.0, 1.0, 1.0), (0.076, 0.82, 1.1, 1.0), (0.146, 0.58, 1.2, 1.1)], 260, 2300, 0.026, 0.016, 240, 0.35, 0.18)


@sfx("momo.flap_b", "momo_flap_b", "core", "sfx", peak_db=-14, desc="variant flap: two close beats then a late soft one (different rhythm)")
def momo_flap_b(rng):
    return _flap(rng, [(0.0, 0.9, 0.9, 1.15), (0.056, 1.0, 1.0, 1.1), (0.138, 0.55, 1.3, 0.9)], 320, 2700, 0.022, 0.015, 280, 0.3, 0.22)


@sfx("momo.flap_c", "momo_flap_c", "core", "sfx", peak_db=-15, desc="softer variant flap: darker, slower, quieter")
def momo_flap_c(rng):
    return _flap(rng, [(0.004, 0.8, 1.35, 1.0), (0.088, 0.7, 1.4, 1.0), (0.158, 0.45, 1.5, 1.0)], 200, 1500, 0.034, 0.024, 200, 0.45, 0.08, hp=115, hp_order=3)


def _flyby(rng, direction, contour, bw=1.4):
    dur = 0.52
    n = n_of(dur)
    src = dsp.pink(n, rng)
    fc = fx.freq_contour(n, contour)
    x = fx.contour_bandpass(src, fc, bw, blocks=34)
    env = fx.env_swell(n, 0.46, 1.6, 1.8, floor=0.06)
    flutter = 0.82 + 0.18 * fx.flutter_mod(n, rng, 23.0, 0.4, 1.0, 1.0)
    x = x * env * flutter
    x += 0.2 * fx.crackle(n, rng, 120.0, 1800, 3800, 0.003) * env
    p = fx.smoothstep(n, -0.9 * direction, 0.9 * direction)
    return fx.finish(fx.pan_auto(x, p), dur, fade_ms=40)


@sfx("momo.whoosh_a", "momo_whoosh_a", "core", "sfx", stereo=True, peak_db=-12, kbps=48, desc="paper kite fly-by, pan left to right, rising-then-falling pitch contour")
def momo_whoosh_a(rng):
    return _flyby(rng, +1, [(0.0, 600), (0.45, 1900), (1.0, 900)])


@sfx("momo.whoosh_b", "momo_whoosh_b", "core", "sfx", stereo=True, peak_db=-12, kbps=48, desc="fly-by right to left, slightly different (higher, falling) pitch contour")
def momo_whoosh_b(rng):
    return _flyby(rng, -1, [(0.0, 1000), (0.5, 2100), (1.0, 700)], bw=1.2)


@sfx("momo.land", "momo_land", "core", "sfx", peak_db=-11, desc="soft paper 'pap' landing")
def momo_land(rng):
    dur = 0.17
    n = n_of(dur)
    x = fx.paper_tap(dur, rng, 700, 2800, 0.016, 0.55, 330)
    x += fx.seg(n, 0.052, fx.paper_tap(0.08, rng, 900, 2600, 0.01, 0.2, 400), 0.32)   # tiny settle
    x += 0.12 * fx.crackle_at(n, rng, [0.075, 0.098, 0.12], [1.0, 0.7, 0.5], 1500, 3300, 0.003)
    return fx.finish(x, dur, fade_ms=25)


@sfx("momo.hop", "momo_hop", "core", "sfx", peak_db=-10, desc="soft wooden/paper 'tok' with a small upward pitch glide (E4), not a voice")
def momo_hop(rng):
    dur = 0.15
    n = n_of(dur)
    t = np.arange(n) / SR
    f = P["E4"] * (1 + 0.075 * (1 - np.exp(-t / 0.018)) - 0.075)        # starts a little flat, glides up to E4
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = (np.sin(ph) + 0.28 * np.sin(2.76 * ph)) * dsp.env_exp(n, 0.04, 0.0015)
    tick = fx.bpn(n, rng, 1200, 3200) * dsp.env_exp(n, 0.004, 0.0004)
    x = body / np.max(np.abs(body)) + 0.3 * tick / (np.max(np.abs(tick)) + 1e-9)
    return fx.finish(dsp.lowpass(x, 3600, 2), dur, fade_ms=30)


@sfx("momo.wave", "momo_wave", "core", "sfx", peak_db=-12, desc="two gentle cloth swishes (back and forth)")
def momo_wave(rng):
    dur = 0.32
    n = n_of(dur)
    out = np.zeros(n)
    for t0, contour in ((0.0, [(0, 600), (1, 1500)]), (0.155, [(0, 1400), (1, 700)])):
        ln = n_of(0.15)
        src = dsp.pink(ln, rng)
        x = fx.contour_bandpass(src, fx.freq_contour(ln, contour), 1.5, blocks=14) * fx.env_hump(ln, 0.045, 0.04)
        x += 0.25 * fx.lpn(ln, rng, 450) * fx.env_hump(ln, 0.05, 0.05)
        out += fx.seg(n, t0, x / (np.max(np.abs(x)) + 1e-9))
    return fx.finish(out, dur, fade_ms=40)


@sfx("momo.startle", "momo_startle", "cover", "sfx", peak_db=-9, desc="paper snap plus a fast wing-flutter burst (wings only)")
def momo_startle(rng):
    dur = 0.38
    n = n_of(dur)
    snap = fx.bpn(n, rng, 1100, 3300) * dsp.env_exp(n, 0.005, 0.0004)
    snap = snap / (np.max(np.abs(snap)) + 1e-9) + 0.5 * fx.wood_tap(820, dur, rng, taus=(0.012, 0.008, 0.004), noise=0.0, lp=3600)
    flut_n = n_of(0.3)
    fl = fx.cloth_flutter(flut_n, rng, rate=27.0, lo=350, hi=2900, jitter=0.25, sharp=1.2, depth=0.95, crackle_amt=0.18)
    fl = fl * np.exp(-np.arange(flut_n) / SR / 0.11) * (1 - np.exp(-np.arange(flut_n) / SR / 0.004))
    x = snap + 0.85 * fx.seg(n, 0.015, fl)
    return fx.finish(x, dur, fade_ms=50)


# =============================================================================================== WORLD / PLACEMENT
@sfx("world.fall", "world_fall", "world", "sfx", peak_db=-10, desc="object falling: airy descending whoosh (noise low-pass sweep down)")
def world_fall(rng):
    dur = 0.85
    n = n_of(dur)
    src = dsp.pink(n, rng)
    fc = fx.freq_contour(n, [(0, 4200), (0.5, 1500), (1, 330)])
    x = fx.contour_lowpass(src, fc, blocks=36)
    env = fx.env_swell(n, 0.14, 1.5, 1.2, floor=0.2)
    x = x * env * (0.88 + 0.12 * fx.flutter_mod(n, rng, 19.0, 0.5, 1.0, 1.0))
    return fx.finish(x, dur, fade_ms=60, hp=115, hp_order=3)


@sfx("world.land", "world_land", "world", "sfx", stereo=True, peak_db=-8, kbps=48, desc="soft wood/paper thud plus eight tiny dust puffs")
def world_land(rng):
    dur = 0.52
    n = n_of(dur)
    th = fx.thud(175, 118, dur, 0.07, rng, 0.025, 0.35, 900, 0.018)
    wood = fx.wood_tap(360, dur, rng, (1, 2.3, 4.1), (1.0, 0.5, 0.2), (0.03, 0.016, 0.008), 0.2, lp=3800)
    mono = th + 0.45 * wood
    mono = mono / np.max(np.abs(mono))
    st = np.stack([mono, mono], axis=1)
    st += 0.55 * fx.dust(n, rng, 8, 0.045, 0.42, 1.0, stereo=True)
    return fx.finish(st, dur, fade_ms=50)


@sfx("place.grab", "place_grab", "world", "sfx", peak_db=-12, desc="pick-up tick: small wooden/paper tick with a hint of upward chirp")
def place_grab(rng):
    dur = 0.09
    n = n_of(dur)
    x = fx.wood_tap(1350, dur, rng, (1.0, 2.35, 3.9), (1.0, 0.45, 0.2), (0.016, 0.009, 0.005), 0.45, (1200, 3400), lp=4300)
    t = np.arange(n) / SR
    chirp = np.sin(2 * np.pi * np.cumsum(700 + 900 * t / 0.04) / SR) * dsp.env_exp(n, 0.012, 0.002) * (t < 0.045)
    x = x / np.max(np.abs(x)) + 0.18 * chirp
    return fx.finish(x, dur, fade_ms=25)


@sfx("place.rotate", "place_rotate", "world", "sfx", peak_db=-13, desc="soft click with a little tone (A5)")
def place_rotate(rng):
    dur = 0.08
    n = n_of(dur)
    click = fx.bpn(n, rng, 1000, 3200) * dsp.env_exp(n, 0.003, 0.0004)
    click /= np.max(np.abs(click)) + 1e-9
    tone = np.sin(2 * np.pi * P["A5"] * np.arange(n) / SR) * dsp.env_exp(n, 0.02, 0.002)
    return fx.finish(dsp.lowpass(click * 0.9 + 0.5 * tone, 4500, 2), dur, fade_ms=25)


@sfx("place.set", "place_set", "world", "sfx", peak_db=-7, desc="settle: soft wood thunk plus short tine (G5); only on a successful commit")
def place_set(rng):
    dur = 0.38
    n = n_of(dur)
    thunk = fx.thud(260, 190, dur, 0.05, rng, 0.02, 0.4, 1100, 0.015)
    thunk += 0.5 * fx.wood_tap(440, dur, rng, (1, 2.4, 4.2), (1.0, 0.5, 0.2), (0.03, 0.015, 0.008), 0.0, lp=3500)
    thunk /= np.max(np.abs(thunk))
    tn = fx.tine(P["G5"], 0.3, 0.12, 0.1)
    x = thunk + 0.42 * fx.seg(n, 0.045, tn)
    return fx.finish(x, dur, fade_ms=70)


@sfx("world.rise", "world_rise", "world", "sfx", stereo=True, peak_db=-12, kbps=48, desc="soft ascending air sweep with light shimmer (camera rise)")
def world_rise(rng):
    dur = 2.2
    n = n_of(dur)
    chans = []
    fc = fx.freq_contour(n, [(0, 380), (0.5, 1100), (1, 3300)])
    for _ in range(2):
        chans.append(fx.contour_bandpass(dsp.pink(n, rng), fc, 1.6, blocks=44))
    x = np.stack(chans, axis=1)
    env = fx.env_swell(n, 0.78, 1.8, 2.2, floor=0.07)
    x *= env[:, None]
    x = x / np.max(np.abs(x))
    sh = np.zeros((n, 2))
    for i, (t0, note) in enumerate([(0.9, "G5"), (1.2, "A5"), (1.45, "C6"), (1.7, "E6"), (1.9, "G6")]):
        tn = fx.tine(P[note], 0.45, 0.16, 0.08)
        sh += fx.seg(n, t0, dsp.pan(tn, -0.5 + 0.25 * i), 0.1 + 0.015 * i)
    return fx.finish(x + sh, dur, fade_ms=120)


# =============================================================================================== THINMAN
def _step(rng, kind):
    dur = 0.075
    n = n_of(dur)
    if kind == "a":    # paper-foot tap
        x = fx.bpn(n, rng, 900, 3000) * dsp.env_exp(n, 0.010, 0.0006)
        x = x / (np.max(np.abs(x)) + 1e-9) + 0.55 * fx.wood_tap(560, dur, rng, (1, 2.3), (1, 0.35), (0.018, 0.008), 0.0, lp=3500)
    elif kind == "b":  # duller, lower: fabric/soft pad
        x = fx.lpn(n, rng, 1400) * dsp.env_exp(n, 0.012, 0.001)
        x = x / (np.max(np.abs(x)) + 1e-9) + 0.8 * fx.wood_tap(330, dur, rng, (1, 1.9), (1, 0.3), (0.026, 0.012), 0.0, lp=2200)
    elif kind == "c":  # crisper, higher
        x = fx.bpn(n, rng, 1600, 4200) * dsp.env_exp(n, 0.006, 0.0004)
        x = x / (np.max(np.abs(x)) + 1e-9) + 0.5 * fx.wood_tap(980, dur, rng, (1, 2.5), (1, 0.4), (0.012, 0.006), 0.0, lp=4200)
    else:              # scuff: two micro grains ("t-p") with a low shuffle
        g1 = fx.bpn(n, rng, 1100, 3400) * dsp.env_exp(n, 0.005, 0.0004)
        g2 = fx.bpn(n, rng, 800, 2600) * dsp.env_exp(n, 0.008, 0.0004)
        x = g1 / (np.max(np.abs(g1)) + 1e-9) + 0.9 * fx.seg(n, 0.017, g2 / (np.max(np.abs(g2)) + 1e-9)) + 0.4 * fx.lpn(n, rng, 300) * dsp.env_exp(n, 0.02, 0.003)
    return fx.finish(x, dur, fade_ms=18)


@sfx("thinman.step_a", "thinman_step_a", "world", "sfx", peak_db=-16, desc="tiny paper-foot tap, quiet")
def thinman_step_a(rng):
    return _step(rng, "a")


@sfx("thinman.step_b", "thinman_step_b", "world", "sfx", peak_db=-19, desc="footstep variant: duller, lower, fabric pad")
def thinman_step_b(rng):
    return _step(rng, "b")


@sfx("thinman.step_c", "thinman_step_c", "world", "sfx", peak_db=-15, desc="footstep variant: crisper, higher")
def thinman_step_c(rng):
    return _step(rng, "c")


@sfx("thinman.step_d", "thinman_step_d", "world", "sfx", peak_db=-16, desc="footstep variant: soft two-grain scuff")
def thinman_step_d(rng):
    return _step(rng, "d")


@sfx("thinman.jump", "thinman_jump", "world", "sfx", peak_db=-10, desc="soft upward whoosh plus push-off tap")
def thinman_jump(rng):
    dur = 0.21
    n = n_of(dur)
    src = dsp.pink(n, rng)
    x = fx.contour_bandpass(src, fx.freq_contour(n, [(0, 520), (1, 2300)]), 1.5, blocks=22) * fx.env_hump(n, 0.07, 0.07)
    x /= np.max(np.abs(x)) + 1e-9
    tap = fx.wood_tap(430, dur, rng, (1, 2.3, 4.0), (1, 0.4, 0.2), (0.025, 0.012, 0.006), 0.35, lp=3500)
    return fx.finish(0.8 * x + 0.6 * tap / np.max(np.abs(tap)), dur, fade_ms=50)


@sfx("thinman.land_soft", "thinman_land_soft", "world", "sfx", peak_db=-11, desc="small landing thud")
def thinman_land_soft(rng):
    dur = 0.15
    x = fx.thud(165, 112, dur, 0.04, rng, 0.02, 0.4, 800, 0.014)
    x += 0.2 * fx.crackle_at(n_of(dur), rng, [0.03, 0.05], [1.0, 0.6], 1500, 3200, 0.003)
    return fx.finish(x, dur, fade_ms=40)


@sfx("thinman.land_hard", "thinman_land_hard", "world", "sfx", peak_db=-8, desc="larger landing thud (still soft) with a small rustle")
def thinman_land_hard(rng):
    dur = 0.28
    n = n_of(dur)
    x = fx.thud(135, 92, dur, 0.09, rng, 0.03, 0.4, 900, 0.022)
    x += 0.4 * fx.wood_tap(300, dur, rng, (1, 2.2, 3.9), (1, 0.45, 0.2), (0.04, 0.02, 0.01), 0.0, lp=3000)
    x += 0.22 * fx.crackle_at(n, rng, [0.05, 0.075, 0.1, 0.14], [1.0, 0.7, 0.55, 0.35], 1400, 3200, 0.004)
    return fx.finish(x, dur, fade_ms=70)


@sfx("hazard.hit", "hazard_hit", "world", "sfx", peak_db=-8, desc="gentle rubbery bonk plus small paper clatter; not gory, not startling")
def hazard_hit(rng):
    dur = 0.42
    n = n_of(dur)
    t = np.arange(n) / SR
    f = 150 + 120 * np.exp(-t / 0.05)
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.025 * np.sin(2 * np.pi * 21 * t) * np.exp(-t / 0.1))) / SR
    body = (np.sin(ph) + 0.18 * np.sin(2.01 * ph)) * dsp.env_exp(n, 0.085, 0.004)
    body = dsp.lowpass(body, 1800, 2)
    nz = fx.lpn(n, rng, 1100) * dsp.env_exp(n, 0.012, 0.002)
    clat = fx.crackle_at(n, rng, [0.09, 0.125, 0.17, 0.22, 0.27], [1.0, 0.8, 0.7, 0.5, 0.35], 1400, 3600, 0.004)
    x = body / np.max(np.abs(body)) + 0.3 * nz / (np.max(np.abs(nz)) + 1e-9) + 0.28 * clat / (np.max(np.abs(clat)) + 1e-9)
    return fx.finish(x, dur, fade_ms=80)


@sfx("fall.abyss", "fall_abyss", "world", "sfx", peak_db=-10, desc="descending airy tone that fades into nothing; no vocal character")
def fall_abyss(rng):
    dur = 1.0
    n = n_of(dur)
    fc = fx.freq_contour(n, [(0, 900), (1, 190)])
    air = fx.contour_bandpass(dsp.pink(n, rng), fc, 0.55, blocks=34)
    air /= np.max(np.abs(air)) + 1e-9
    f = fx.freq_contour(n, [(0, P["G5"]), (1, P["C4"])])                  # G5 down to C4, smooth glide, no vibrato
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR)
    tone = dsp.lowpass(tone, 1300, 2)
    env = np.exp(-np.linspace(0, 1, n) * 3.2) * np.sin(0.5 * np.pi * np.clip(np.arange(n) / SR / 0.03, 0, 1))
    x = (0.65 * air + 0.38 * tone) * env
    return fx.finish(x, dur, fade_ms=250)


@sfx("goal.reach", "goal_reach", "world", "sfx", peak_db=-5, desc="flag reached: warm pluck C5 to G5 plus soft cloth flutter")
def goal_reach(rng):
    dur = 0.7
    n = n_of(dur)
    x = fx.seg(n, 0.0, fx.pluck(P["C5"], 0.5, 0.26), 0.8) + fx.seg(n, 0.13, fx.pluck(P["G5"], 0.55, 0.3), 1.0)
    fl = fx.cloth_flutter(n_of(0.5), rng, 13.0, 300, 2400, 0.35, 1.5, 0.85, 0.1) * fx.env_swell(n_of(0.5), 0.3, 1.5, 1.6, 0.1)
    x = x + 0.22 * fx.seg(n, 0.1, fl)
    return fx.finish(dsp.lowpass(x, 5200, 2), dur, fade_ms=150)


@sfx("win.sparkle", "win_sparkle", "world", "sfx", stereo=True, peak_db=-5, kbps=48, desc="confetti glitter burst: random high pentatonic tines, decaying")
def win_sparkle(rng):
    dur = 1.2
    n = n_of(dur)
    out = np.zeros((n, 2))
    count = 26
    times = np.sort(0.9 * rng.random(count) ** 1.6)
    times[0] = 0.0
    last = -1
    for i, t0 in enumerate(times):
        k = int(rng.integers(0, 5))
        if k == last:
            k = (k + 2) % 5
        last = k
        f = fx.PENTA_HIGH[k] * (2.0 if rng.random() < 0.12 else 1.0)
        amp = (0.35 + 0.65 * rng.random()) * np.exp(-t0 / 0.55)
        tn = fx.tine(f, 0.4, 0.07 + 0.09 * rng.random(), 0.1)
        out += fx.seg(n, float(t0), dsp.pan(tn, float(rng.uniform(-0.85, 0.85))), amp)
    out += 0.07 * fx.seg(n, 0.0, np.stack([fx.bpn(n_of(0.6), rng, 1800, 3500) * dsp.env_exp(n_of(0.6), 0.1, 0.002)] * 2, axis=1))
    return fx.finish(out, dur, fade_ms=200)


# =============================================================================================== INTRO / DREAM
@sfx("intro.spotlight", "intro_spotlight", "world", "sfx", peak_db=-13, desc="soft airy swell with faint G4/D5 tone (spotlight moves to the next story beat)")
def intro_spotlight(rng):
    dur = 0.9
    n = n_of(dur)
    fc = fx.freq_contour(n, [(0, 650), (0.55, 1500), (1, 1000)])
    air = fx.contour_bandpass(dsp.pink(n, rng), fc, 1.5, blocks=30)
    air /= np.max(np.abs(air)) + 1e-9
    t = np.arange(n) / SR
    tone = 0.5 * np.sin(2 * np.pi * P["G4"] * t) + 0.35 * np.sin(2 * np.pi * P["D5"] * t)
    env = fx.env_swell(n, 0.5, 1.4, 1.8, floor=0.1)
    return fx.finish((air + 0.16 * tone) * env, dur, fade_ms=100)


@sfx("dream.blast", "dream_blast", "dream", "sfx", stereo=True, peak_db=-8, kbps=48, desc="loader blast: rising charge into a soft whoosh")
def dream_blast(rng):
    dur = 1.5
    n = n_of(dur)
    t = np.arange(n) / SR
    ch = n_of(0.9)
    tc = np.arange(ch) / SR
    fcn = fx.freq_contour(ch, [(0, 350), (1, 3200)])
    noise = fx.contour_bandpass(dsp.pink(ch, rng), fcn, 0.8, blocks=30)
    noise /= np.max(np.abs(noise)) + 1e-9
    f = fx.freq_contour(ch, [(0, P["G3"]), (1, P["G5"])])
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.25 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    tone = dsp.lowpass(tone, 1800, 2)
    cenv = (0.1 + 0.9 * (tc / 0.9) ** 2.2) * (1 - np.exp(-tc / 0.01))
    charge = (0.7 * noise + 0.3 * tone) * cenv
    wh = np.zeros((n, 2))
    wn = n - n_of(0.86)
    for c in range(2):
        w = fx.contour_lowpass(dsp.pink(wn, rng), fx.freq_contour(wn, [(0, 5200), (1, 450)]), blocks=30)
        w *= fx.env_hump(wn, 0.05, 0.22)
        wh[n - wn:, c] = w
    wh /= np.max(np.abs(wh))
    out = fx.seg(n, 0.0, np.stack([charge, charge], axis=1), 0.85) + 1.4 * wh
    return fx.finish(out, dur, fade_ms=250)


@sfx("dream.iris", "dream_iris", "dream", "sfx", stereo=True, peak_db=-9, kbps=48, desc="iris closing: soft exponential swoosh with low sweep and shimmer")
def dream_iris(rng):
    dur = 1.9
    n = n_of(dur)
    t = np.arange(n) / SR
    fc = fx.freq_contour(n, [(0, 3300), (0.6, 800), (1, 260)])
    ch = [fx.contour_bandpass(dsp.pink(n, rng), fc, 1.4, blocks=44) for _ in range(2)]
    st = np.stack(ch, axis=1)
    mid = st.mean(axis=1, keepdims=True)
    side = st - mid
    narrow = np.exp(-3.0 * np.linspace(0, 1, n) ** 1.5)[:, None]            # closing: stereo width collapses toward the centre
    st = mid + side * (0.4 + 0.9 * narrow)
    env = fx.env_swell(n, 0.3, 1.2, 1.7, floor=0.18)
    st *= env[:, None]
    st /= np.max(np.abs(st))
    f = fx.freq_contour(n, [(0, 230), (1, 110)])                              # low sweep (A3 down to A2)
    low = np.sin(2 * np.pi * np.cumsum(f) / SR) * fx.env_swell(n, 0.35, 1.2, 1.5, 0.15)
    sh = np.zeros((n, 2))
    for i, (t0, note) in enumerate([(0.12, "G6"), (0.42, "E6"), (0.78, "D6"), (1.1, "C6")]):
        sh += fx.seg(n, t0, dsp.pan(fx.tine(P[note], 0.7, 0.2, 0.08), (-0.4, 0.4, -0.25, 0.2)[i]), 0.11)
    out = st + 0.22 * np.stack([low, low], axis=1) + sh
    return fx.finish(out, dur, fade_ms=200)


# =============================================================================================== ENDING
@sfx("ending.chute_open", "ending_chute_open", "ending", "sfx", peak_db=-9, desc="canopy opening: soft 'fwump' plus fabric flutter")
def ending_chute_open(rng):
    dur = 0.8
    n = n_of(dur)
    fw = fx.lpn(n, rng, 750) * fx.env_hump(n, 0.018, 0.08)
    fw /= np.max(np.abs(fw)) + 1e-9
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(115 + 40 * np.exp(-t / 0.05)) / SR) * fx.env_hump(n, 0.012, 0.1)
    snap = fx.bpn(n, rng, 900, 2800) * fx.env_hump(n, 0.006, 0.02)
    snap /= np.max(np.abs(snap)) + 1e-9
    fl = fx.cloth_flutter(n_of(0.62), rng, 15.0, 280, 2400, 0.4, 1.4, 0.9, 0.12)
    fl_env = fx.env_hump(n_of(0.62), 0.05, 0.2)
    x = 0.9 * fw + 0.5 * body + 0.28 * snap + 0.5 * fx.seg(n, 0.1, fl * fl_env)
    return fx.finish(x, dur, fade_ms=140)


@sfx("ending.descend", "ending_descend", "ending", "sfx", stereo=True, peak_db=-18, kbps=48, desc="gentle fabric/air flutter bed for the slow descent, faded in and out")
def ending_descend(rng):
    dur = 3.3
    n = n_of(dur)
    chans = []
    for c in range(2):
        a = fx.cloth_flutter(n, rng, 11.0 + 2.0 * c, 250, 2000, 0.5, 1.7, 0.75, 0.05)
        b = fx.cloth_flutter(n, rng, 17.0 - 1.5 * c, 400, 2600, 0.5, 1.6, 0.8, 0.0)
        air = fx.lpn(n, rng, 1300, 2, "pink") * 0.5
        slow = 0.7 + 0.3 * fx.smooth_noise(n, rng, 1.2)
        chans.append((0.7 * a + 0.4 * b + air) * slow)
    x = np.stack(chans, axis=1)
    x /= np.max(np.abs(x))
    tsec = np.linspace(0, dur, n)
    fin = 0.08 + 0.92 * np.sin(0.5 * np.pi * np.clip(tsec / 0.9, 0, 1)) ** 2
    fout = np.sin(0.5 * np.pi * np.clip((dur - tsec) / 1.1, 0, 1)) ** 2
    env = fin * fout
    return fx.finish(x * env[:, None], dur, fade_ms=60, hp=115, hp_order=3)


@sfx("ending.touchdown", "ending_touchdown", "ending", "sfx", peak_db=-8, desc="soft landing thud plus dust puffs")
def ending_touchdown(rng):
    dur = 0.5
    n = n_of(dur)
    th = fx.thud(150, 100, dur, 0.09, rng, 0.03, 0.4, 800, 0.02)
    th += 0.3 * fx.paper_tap(dur, rng, 700, 2400, 0.02, 0.3, 320)
    th /= np.max(np.abs(th))
    x = th + 0.5 * fx.dust(n, rng, 6, 0.06, 0.34, 1.0, stereo=False)
    return fx.finish(x, dur, fade_ms=100)


@sfx("pond.jump", "pond_jump", "ending", "sfx", peak_db=-10, desc="arc whoosh plus a tiny tonal rise (E5 to A5)")
def pond_jump(rng):
    dur = 0.7
    n = n_of(dur)
    fc = fx.freq_contour(n, [(0, 520), (0.4, 1900), (1, 800)])
    x = fx.contour_bandpass(dsp.pink(n, rng), fc, 1.4, blocks=34)
    x = x / (np.max(np.abs(x)) + 1e-9) * fx.env_swell(n, 0.4, 1.4, 1.6, floor=0.15)
    tn = n_of(0.3)
    f = fx.freq_contour(tn, [(0, P["E5"]), (1, P["A5"])])
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * fx.env_hump(tn, 0.04, 0.09)
    tap = fx.wood_tap(420, dur, rng, (1, 2.3, 4.0), (1, 0.4, 0.2), (0.025, 0.012, 0.006), 0.3, lp=3200)
    out = 0.85 * x + 0.17 * fx.seg(n, 0.06, tone) + 0.35 * tap / np.max(np.abs(tap))
    return fx.finish(out, dur, fade_ms=130)


@sfx("pond.splash", "pond_splash", "ending", "sfx", stereo=True, peak_db=-8, kbps=48, desc="ink splash: fourteen soft drops plus three ripples")
def pond_splash(rng):
    dur = 1.3
    n = n_of(dur)
    out = np.zeros((n, 2))
    burst_n = n_of(0.3)
    burst = fx.bpn(burst_n, rng, 500, 3000) * fx.env_hump(burst_n, 0.008, 0.06)
    burst = np.stack([burst, np.roll(burst, 23)], axis=1)
    out += 0.7 * fx.seg(n, 0.0, burst / np.max(np.abs(burst)))
    times = np.sort(0.04 + 0.78 * rng.random(14) ** 1.4)
    notes = ["C5", "D5", "E5", "G5", "A5", "C6", "G4", "A4"]
    for i, t0 in enumerate(times):
        f = P[notes[int(rng.integers(0, len(notes)))]]
        d = fx.bloop(f * 0.78, f, 0.16, 0.045 + 0.03 * rng.random(), 0.02, 0.003)
        out += fx.seg(n, float(t0), dsp.pan(d, float(rng.uniform(-0.8, 0.8))), (0.5 + 0.5 * rng.random()) * (1.0 - 0.45 * t0))
    for t0, note, pp in ((0.28, "C4", -0.5), (0.55, "A3", 0.5), (0.85, "G3", 0.0)):                # three slow ripples
        rn = n_of(0.4)
        r = np.sin(2 * np.pi * P[note] * np.arange(rn) / SR) * fx.env_hump(rn, 0.06, 0.1) * 0.5
        r += 0.35 * fx.bpn(rn, rng, 500, 1500) * fx.env_hump(rn, 0.07, 0.09)
        out += fx.seg(n, t0, dsp.pan(r, pp), 0.55)
    return fx.finish(out, dur, fade_ms=250)


@sfx("pond.sink", "pond_sink", "ending", "sfx", peak_db=-10, desc="sinking bloop: low sine glide downward (E4 to A2)")
def pond_sink(rng):
    dur = 0.6
    n = n_of(dur)
    f = fx.freq_contour(n, [(0, P["E4"]), (1, 110.0)])
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) + 0.15 * np.sin(2 * ph)) * fx.env_swell(n, 0.12, 1.0, 1.6, floor=0.2)
    x += 0.12 * fx.seg(n, 0.1, fx.bloop(P["A4"] * 0.8, P["A4"], 0.15, 0.04, 0.02))
    return fx.finish(x, dur, fade_ms=150)


@sfx("pond.glint", "pond_glint", "ending", "sfx", stereo=True, peak_db=-12, kbps=48, desc="eleven soft high pentatonic glints, decaying")
def pond_glint(rng):
    dur = 1.3
    n = n_of(dur)
    out = np.zeros((n, 2))
    times = np.cumsum(0.045 + 0.1 * rng.random(11))
    times = times * (0.95 / times[-1])
    times[0] = 0.0
    seq = [4, 2, 3, 1, 4, 0, 3, 2, 4, 1, 3]
    for i, t0 in enumerate(times):
        f = fx.PENTA_HIGH[seq[i]]
        n_g = n_of(0.35)
        t = np.arange(n_g) / SR
        g = (np.sin(2 * np.pi * f * t) + 0.18 * np.sin(2 * np.pi * 2 * f * t)) * dsp.env_exp(n_g, 0.07 + 0.04 * rng.random(), 0.002)
        out += fx.seg(n, float(t0), dsp.pan(g, float(rng.uniform(-0.9, 0.9))), np.exp(-t0 / 0.55) * (0.7 + 0.3 * rng.random()))
    return fx.finish(out, dur, fade_ms=250)


@sfx("pond.exit", "pond_exit", "ending", "sfx", stereo=True, peak_db=-9, kbps=48, desc="emerge spin whoosh with a rising sweep, a few drops falling away")
def pond_exit(rng):
    dur = 1.2
    n = n_of(dur)
    fc = fx.freq_contour(n, [(0, 350), (0.6, 2000), (1, 4200)])
    x = fx.contour_bandpass(dsp.pink(n, rng), fc, 1.3, blocks=40)
    x = x / (np.max(np.abs(x)) + 1e-9) * fx.env_swell(n, 0.55, 1.5, 1.7, floor=0.15)
    ph = 2 * np.pi * np.cumsum(fx.smoothstep(n, 1.2, 4.2)) / SR            # accelerating spin: 1.2 Hz -> 4.2 Hz
    p = 0.85 * np.sin(ph)
    spin = fx.pan_auto(x * (0.8 + 0.2 * np.cos(ph)), p)
    out = spin
    for t0 in (0.05, 0.14, 0.22, 0.34, 0.5):
        d = fx.bloop(P["G5"] * 0.8, P["G5"] if rng.random() > 0.5 else P["E5"], 0.14, 0.04, 0.02)
        out = out + fx.seg(n, t0, dsp.pan(d, float(rng.uniform(-0.7, 0.7))), 0.12)
    return fx.finish(out, dur, fade_ms=200)


@sfx("recap.land", "recap_land", "ending", "sfx", peak_db=-9, desc="soft paper tap plus a small tine C5 (the engine steps pitch up the pentatonic per card)")
def recap_land(rng):
    dur = 0.22
    n = n_of(dur)
    tap = fx.paper_tap(0.1, rng, 900, 3000, 0.012, 0.4, 420)
    tn = fx.tine(P["C5"], 0.2, 0.09, 0.1)
    x = fx.seg(n, 0.0, tap / np.max(np.abs(tap)), 0.7) + fx.seg(n, 0.012, tn, 0.7)
    return fx.finish(x, dur, fade_ms=60)


@sfx("thinman.poke", "thinman_poke", "ending", "sfx", peak_db=-9, desc="soft rubbery spring 'doing' (damped, wobbling rubber-band partials G4; non-vocal)")
def thinman_poke(rng):
    dur = 0.22
    n = n_of(dur)
    t = np.arange(n) / SR
    wob = 1 + 0.07 * np.sin(2 * np.pi * 26 * t) * np.exp(-t / 0.07)
    f = P["G4"] * (1.0 + 0.1 * np.exp(-t / 0.025)) * wob
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) + 0.3 * np.sin(2.76 * ph) * np.exp(-t / 0.03)) * dsp.env_exp(n, 0.065, 0.002)
    tick = fx.bpn(n, rng, 900, 2800) * dsp.env_exp(n, 0.004, 0.0004)
    x = x / np.max(np.abs(x)) + 0.25 * tick / (np.max(np.abs(tick)) + 1e-9)
    return fx.finish(dsp.lowpass(x, 3200, 2), dur, fade_ms=60)
