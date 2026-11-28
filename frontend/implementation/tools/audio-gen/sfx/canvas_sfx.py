"""Worker B SFX: tools, drawing loops, prediction/HITL, book pages, cards, sticker, ribbons (mandate M-047).

Contract: SFX_SPEC.md section "Worker B". Original synthesis (numpy/scipy), no samples, no voice. Paper, wood, rubber, ink, tines and air only.
Importing this module only registers assets; scripts live under __main__ guards (none here).
"""
from __future__ import annotations

import numpy as np

from common import dsp
from common import fx_canvas as fx
from common.dsp import SR, hz, n_of
from registry import sfx, sfx_loop

# Pitch constants (C major pentatonic, 12-TET, A4 = 440)
C5, E5, G5, A5, C6, E6, G6, A6, C7 = (hz(x) for x in ("C5", "E5", "G5", "A5", "C6", "E6", "G6", "A6", "C7"))


def _done(x: np.ndarray, dur: float, hp: float = 90.0, fade_ms: float = 14.0) -> np.ndarray:
    return fx.fit(fx.clean(x, hp), dur, fade_ms)


def _soft_room(x: np.ndarray, rng, rt60: float = 0.25, wet: float = 0.16) -> np.ndarray:
    return dsp.reverb(x, rt60=rt60, wet=wet, damping=4500.0, predelay=0.006, rng=rng)


# =========================================================================== tools

@sfx("tool.pencil", "tool_pencil", "canvas", "sfx", False, -9.0, 40, "graphite/wood tap with a hint of scratch")
def tool_pencil(rng):
    dur = 0.09
    body = fx.wood(1250.0, rng, dur, ratios=(1.0, 2.3, 3.9), amps=(1.0, 0.5, 0.25), taus=(0.012, 0.008, 0.005), lp=4600.0, click=0.22, click_band=(2000.0, 4200.0))
    scr = fx.grains(dur, rng, [0.014, 0.026, 0.038, 0.052], [0.35, 0.30, 0.22, 0.12], 2800.0, bw_oct=1.3, glen=(0.006, 0.012))
    x = body + 0.55 * scr
    return _done(x, dur, fade_ms=10)


@sfx("tool.eraser", "tool_eraser", "canvas", "sfx", False, -9.0, 40, "soft rubber tap")
def tool_eraser(rng):
    dur = 0.10
    n = n_of(dur)
    th = fx.thud(360.0, 250.0, dur, 0.022, rng, noise=0.35, lp=900.0)
    rub = fx.band_noise(n, rng, 700.0, 2300.0) * dsp.env_exp(n, 0.03, 0.002)
    rub /= dsp.peak(rub) + 1e-9
    x = dsp.lowpass(th + 0.3 * rub, 3000.0, 2)
    return _done(x, dur, fade_ms=34)


@sfx("tool.undo", "tool_undo", "canvas", "sfx", False, -9.0, 40, "soft reverse swish (noise swell downward) plus tiny tick")
def tool_undo(rng):
    dur = 0.17
    n = n_of(dur)
    src = dsp.pink(n, rng)
    sw = dsp.sweep_bandpass(src, 2500.0, 850.0, bw_oct=1.5, blocks=24)
    e = fx.env_pts(n, [(0, 0.0), (0.012, 0.12), (0.09, 0.85), (0.115, 1.0), (0.14, 0.08), (0.17, 0.0)])
    x = sw * e
    tick = fx.wood(1500.0, rng, 0.035, ratios=(1.0, 2.6), amps=(1.0, 0.4), taus=(0.008, 0.005), lp=4200.0, click=0.2)
    x = x / (dsp.peak(x) + 1e-9)
    fx.put(x, tick, 0.12, 0.45)
    return _done(x, dur, fade_ms=24)


@sfx("tool.redo", "tool_redo", "canvas", "sfx", False, -9.0, 40, "soft forward swish plus tiny tick")
def tool_redo(rng):
    dur = 0.17
    n = n_of(dur)
    src = dsp.pink(n, rng)
    sw = dsp.sweep_bandpass(src, 850.0, 2500.0, bw_oct=1.5, blocks=24)
    sw = sw * fx.swell_env(n, 0.05, 0.032, 1.2)
    x = sw / (dsp.peak(sw) + 1e-9)
    tick = fx.wood(1700.0, rng, 0.035, ratios=(1.0, 2.6), amps=(1.0, 0.4), taus=(0.008, 0.005), lp=4200.0, click=0.2)
    fx.put(x, tick, 0.0, 0.5)
    return _done(x, dur, fade_ms=30)


@sfx("tool.clear", "tool_clear", "canvas", "sfx", True, -8.0, 48, "paper crumple sweep: noise bursts plus low rustle", pannable=True)
def tool_clear(rng):
    dur = 0.52
    n = n_of(dur)
    cnt = 70
    times = fx.crumple_times(rng, 0.40, cnt, skew=1.25)
    ph = times / 0.40
    amps = (0.55 + 0.45 * rng.random(cnt)) * (1.0 - 0.55 * ph)
    centers = 800.0 + 1700.0 * rng.random(cnt)
    pans = rng.uniform(-0.8, 0.8, cnt)
    cr = fx.grains(dur, rng, times, amps, centers, bw_oct=1.2, glen=(0.004, 0.016), pans=pans)
    # a few louder creases
    crease_t = [0.0, 0.07, 0.15, 0.24]
    cs = fx.grains(dur, rng, crease_t, [0.9, 0.8, 0.7, 0.55], [1300.0, 1700.0, 1100.0, 1500.0], bw_oct=1.1, glen=(0.012, 0.022), pans=[-0.5, 0.45, -0.2, 0.3])
    low = fx.rustle(dur, rng, 200.0, 800.0, rate=18.0, depth=0.8) * fx.swell_env(n, 0.05, 0.14, 1.5)
    low2 = fx.rustle(dur, rng, 200.0, 800.0, rate=18.0, depth=0.8) * fx.swell_env(n, 0.05, 0.14, 1.5)
    lowst = np.stack([low, low2], axis=1) * 0.75
    x = dsp.lowpass(1.0 * cr + 0.7 * cs, 4200.0, 2) + lowst
    return _done(x, dur, fade_ms=18)


@sfx("tool.tick", "tool_tick", "tutorial", "ui", False, -9.0, 40, "tiny pentatonic tine C6 pop (tutorial: tool used for the first time)")
def tool_tick(rng):
    dur = 0.13
    n = n_of(dur)
    t = fx.tine(C6, dur, tau=0.032, kind="kalimba")
    pop = fx.band_noise(n, rng, 1800.0, 4200.0) * dsp.env_exp(n, 0.002, 0.0003)
    pop /= dsp.peak(pop) + 1e-9
    x = dsp.lowpass(t + 0.18 * pop, 5200.0, 2)
    return _done(x, dur, fade_ms=45)


# =========================================================================== drawing loops (exactly periodic -> seamless)

LOOP_N = n_of(0.8)


def _loop_finish(chans: list[np.ndarray]) -> np.ndarray:
    k = fx.quiet_seam(chans)
    out = np.stack([np.roll(c, -k) for c in chans], axis=1)
    return out


@sfx_loop("draw.pencil", "draw_pencil", "canvas", "sfx", -28.0, 56, "graphite scratch on paper: band-passed noise with micro amplitude modulation; seamless (engine scales gain/rate with pen speed)")
def draw_pencil(rng):
    L = LOOP_N
    chans = []
    for _ in range(2):
        grit = fx.periodic_noise(L, rng, 1300.0, 3300.0, order=3)
        body = fx.periodic_noise(L, rng, 330.0, 1100.0, order=3)
        # micro amplitude modulation (stroke grain) - periodic, lowpassed random
        m = fx.periodic_noise(L, rng, 25.0, 80.0)
        m = np.clip(m, -2.5, 2.5)
        am = np.exp(0.55 * m) / np.exp(0.55 ** 2 / 2)
        # sparse micro-crackle: impulses -> circular band-pass
        imp = np.zeros(L)
        imp[rng.integers(0, L, 110)] = rng.uniform(0.4, 1.0, 110) * rng.choice([-1, 1], 110)
        crk = fx.periodic_filter(imp, 1500.0, 3600.0, order=3)
        crk /= dsp.rms(crk) + 1e-12
        x = am * (0.75 * grit + 0.70 * body) + 0.22 * crk
        chans.append(x)
    return _loop_finish(chans)


@sfx_loop("draw.eraser", "draw_eraser", "canvas", "sfx", -29.0, 56, "soft rubbing; seamless")
def draw_eraser(rng):
    L = LOOP_N
    chans = []
    for _ in range(2):
        rub = fx.periodic_noise(L, rng, 500.0, 2300.0, order=3)
        low = fx.periodic_noise(L, rng, 180.0, 520.0, order=3)
        # rubbing strokes: ~6 back-and-forth pushes per 0.8 s (period divides the loop exactly) with slow irregular drift
        t = np.arange(L) / SR
        stroke = 0.55 + 0.45 * np.cos(2 * np.pi * 7.5 * t + rng.uniform(0, 6.28)) ** 2
        drift = np.exp(0.35 * fx.periodic_noise(L, rng, 2.0, 9.0))
        m = np.exp(0.4 * np.clip(fx.periodic_noise(L, rng, 15.0, 55.0), -2.5, 2.5))
        x = (0.9 * rub + 0.55 * low) * stroke * drift * m
        chans.append(x)
    return _loop_finish(chans)


# =========================================================================== prediction / HITL

@sfx("mission.open", "mission_open", "canvas", "ui", False, -7.0, 40, "idea-bulb: soft pluck plus bell A5 and a little shimmer")
def mission_open(rng):
    dur = 0.32
    x = np.zeros(n_of(dur))
    fx.put(x, fx.tine(E5, 0.25, tau=0.07, kind="marimba"), 0.0, 0.8)
    fx.put(x, dsp.fm_bell(A5, 0.30, ratio=3.5, index=1.2, tau=0.11), 0.028, 0.65)
    for t, f, g in ((0.055, G6, 0.10), (0.085, C7, 0.08), (0.12, E6, 0.09), (0.15, A6, 0.07)):
        fx.put(x, fx.sparkle(f, 0.14, 0.05), t, g)
    x = dsp.lowpass(x, 6500.0, 1)
    x = _soft_room(x, rng, 0.22, 0.12)
    return _done(x.mean(axis=1) if x.ndim == 2 else x, dur, fade_ms=40)


@sfx("hitl.submit", "hitl_submit", "canvas", "sfx", False, -7.0, 40, "'drawing sent': paper swish plus low tine G4 that rises slightly")
def hitl_submit(rng):
    dur = 0.42
    n = n_of(dur)
    sw = fx.swish(0.30, rng, 1000.0, 3300.0, bw_oct=1.7, t_peak=0.07, tau=0.09, a_pow=1.5)
    x = np.zeros(n)
    fx.put(x, sw / (dsp.peak(sw) + 1e-9), 0.0, 0.6)
    # tine: starts ~35 cents flat and settles up onto exactly G4 within 90 ms
    G4 = hz("G4")
    f = G4 * 2 ** (-0.35 / 12 * np.exp(-np.arange(n) / (0.045 * SR)))
    env = dsp.env_exp(n, 0.14, 0.004)
    tn = (fx.glide_sine(f) + 0.45 * fx.glide_sine(2 * f) + 0.06 * fx.glide_sine(5.4 * f)) * env
    tn *= np.concatenate([np.zeros(int(0.03 * SR)), np.ones(n - int(0.03 * SR))])  # starts as the swish gets going
    tn = np.roll(tn, 0)
    x += 0.55 * tn / (dsp.peak(tn) + 1e-9)
    return _done(dsp.lowpass(x, 5500.0, 1), dur, fade_ms=40)


def _card_tap(rng) -> np.ndarray:
    """One soft paper-card tap (a single fixed sample block, reused verbatim for all three reveal taps)."""
    n = n_of(0.11)
    body = dsp.modal([520.0, 1180.0], [1.0, 0.35], [0.014, 0.008], 0.11, attack=0.0008)
    paper = fx.band_noise(n, rng, 1300.0, 3600.0) * dsp.env_exp(n, 0.007, 0.0005)
    paper /= dsp.peak(paper) + 1e-9
    return dsp.lowpass(body + 0.55 * paper, 4200.0, 2)


@sfx("hitl.reveal", "hitl_reveal", "canvas", "sfx", True, -8.0, 48, "THREE soft paper-card taps, same pitch and loudness, 110 ms apart (Top-3 laid down); no confidence hint")
def hitl_reveal(rng):
    dur = 0.52
    tap = _card_tap(rng)
    # one stereo tap block (tiny decorrelated room, rt60 0.12 s, decays well inside the 110 ms spacing); copies are sample-identical
    tap_st = dsp.reverb(dsp.haas_widen(tap, ms=7.0, amount=0.3), rt60=0.12, wet=0.12, damping=3800.0, predelay=0.004, rng=rng)
    x = np.zeros((n_of(dur), 2))
    for t in (0.0, 0.110, 0.220):
        fx.put(x, tap_st, t, 1.0)          # IDENTICAL samples, identical gain, identical stereo position
    # the three cards come to rest: a very quiet paper settle AFTER the taps (does not touch the tap levels)
    times = 0.33 + fx.crumple_times(rng, 0.17, 8, skew=1.5)
    st = fx.grains(dur, rng, times, rng.uniform(0.12, 0.25, 8), rng.uniform(1200, 2200, 8), glen=(0.004, 0.008), pans=rng.uniform(-0.5, 0.5, 8))
    x += 0.30 * st
    return _done(x, dur, fade_ms=90)


@sfx("hitl.decide", "hitl_decide", "canvas", "sfx", False, -7.0, 40, "one soft woodblock tok (body ~E4) plus paper settle; identical for accept/correct/override")
def hitl_decide(rng):
    dur = 0.28
    n = n_of(dur)
    E4 = hz("E4")
    wb = dsp.modal([E4, E4 * 2.0, E4 * 3.1, E4 * 5.4], [1.0, 0.55, 0.22, 0.08], [0.060, 0.035, 0.018, 0.008], dur, attack=0.0008)
    tk = fx.band_noise(n, rng, 1500.0, 4000.0) * dsp.env_exp(n, 0.003, 0.0003)
    tk /= dsp.peak(tk) + 1e-9
    x = dsp.lowpass(wb + 0.16 * tk, 4800.0, 2)
    settle = fx.rustle(0.20, rng, 900.0, 2800.0, rate=30.0, depth=0.9) * fx.env_pts(n_of(0.20), [(0, 0), (0.02, 1.0), (0.07, 0.55), (0.20, 0.0)])
    settle /= dsp.peak(settle) + 1e-9
    fx.put(x, settle, 0.045, 0.16)
    return _done(x, dur, fade_ms=40)


# =========================================================================== book pages

@sfx("page.curl", "page_curl", "cover", "sfx", True, -8.0, 48, "long page curl/turn: bend creak (slow band-pass sweep), flutter, soft thump at the end")
def page_curl(rng):
    dur = 1.90
    n = n_of(dur)
    t = np.arange(n) / SR
    # bend creak: slow rising band-pass with stick-slip
    cr_len = 1.25
    nc = n_of(cr_len)
    src = dsp.pink(nc, rng)
    creak = dsp.sweep_bandpass(src, 520.0, 1900.0, bw_oct=1.0, blocks=40)
    m = dsp.lowpass(rng.standard_normal(nc), 24.0, 2)
    slip = np.exp(0.8 * m / m.std())
    slip = slip / slip.mean()
    creak = creak * slip * fx.env_pts(nc, [(0, 0.0), (0.12, 0.45), (0.55, 1.0), (1.0, 0.65), (1.25, 0.0)])
    creak /= dsp.peak(creak) + 1e-9
    # body swish
    sw = fx.swish(1.1, rng, 1200.0, 3300.0, bw_oct=1.8, t_peak=0.35, tau=0.30, a_pow=1.6)
    sw /= dsp.peak(sw) + 1e-9
    # flutter as the page lets go
    fl_len = 0.75
    nf = n_of(fl_len)
    fl = fx.flutter(fl_len, rng, 21.0, 12.0, lo=1500.0, hi=3400.0, depth=0.85, jitter=0.2, env=fx.env_pts(nf, [(0, 0.0), (0.08, 1.0), (0.45, 0.6), (0.75, 0.0)]))
    fl /= dsp.peak(fl) + 1e-9
    mono = np.zeros(n)
    fx.put(mono, creak, 0.0, 0.55)
    fx.put(mono, sw, 0.30, 0.50)
    stereo = fx.pan_curve(mono, np.linspace(-0.45, 0.25, n))
    flst = fx.pan_curve(fl, np.linspace(-0.2, 0.75, nf))
    fx.put(stereo, flst, 0.85, 0.62)
    # end thump + settle
    th = fx.thud(170.0, 118.0, 0.2, 0.05, rng, noise=0.5, lp=1000.0)
    th /= dsp.peak(th) + 1e-9
    fx.put(stereo, dsp.pan(th, 0.3), 1.64, 0.85)
    st = fx.rustle(0.18, rng, 600.0, 2400.0, rate=26.0, depth=0.8) * fx.env_pts(n_of(0.18), [(0, 0), (0.01, 1), (0.18, 0)])
    fx.put(stereo, dsp.pan(st / (dsp.peak(st) + 1e-9), 0.2), 1.66, 0.22)
    return _done(stereo, dur, fade_ms=60)


@sfx("page.flick", "page_flick", "canvas", "sfx", False, -9.0, 40, "quick page flick")
def page_flick(rng):
    dur = 0.30
    n = n_of(dur)
    sw = fx.swish(0.20, rng, 900.0, 4300.0, bw_oct=1.8, t_peak=0.012, tau=0.05, a_pow=1.0, blocks=28)
    sw /= dsp.peak(sw) + 1e-9
    x = np.zeros(n)
    fx.put(x, sw, 0.0, 1.0)
    fl_len = 0.17
    fl = fx.flutter(fl_len, rng, 24.0, 14.0, lo=1300.0, hi=3200.0, depth=0.9, jitter=0.25, env=fx.env_pts(n_of(fl_len), [(0, 0.0), (0.02, 1.0), (0.17, 0.0)]))
    fl /= dsp.peak(fl) + 1e-9
    fx.put(x, fl, 0.075, 0.32)
    return _done(x, dur, fade_ms=40)


# =========================================================================== cards (tutorial)

def _snap(rng) -> np.ndarray:
    n = n_of(0.07)
    nz = fx.band_noise(n, rng, 1500.0, 4200.0) * dsp.env_exp(n, 0.005, 0.0004)
    nz /= dsp.peak(nz) + 1e-9
    wd = dsp.modal([760.0, 1650.0], [1.0, 0.35], [0.012, 0.006], 0.07, attack=0.0008)
    return dsp.lowpass(0.8 * nz + 0.7 * wd, 4600.0, 2)


@sfx("card.deal", "card_deal", "tutorial", "sfx", True, -8.0, 48, "three paper snaps at 0/130/260 ms with soft slides, pan spread (cards deal into a fan)")
def card_deal(rng):
    dur = 0.75
    n = n_of(dur)
    x = np.zeros((n, 2))
    pans = (-0.55, 0.0, 0.55)
    for i, t0 in enumerate((0.0, 0.13, 0.26)):
        sn = _snap(rng)
        fx.put_pan(x, sn, t0, pans[i], 1.0)
        sl = fx.swish(0.14, rng, 800.0 + 150 * i, 2400.0 - 200 * i, bw_oct=1.5, t_peak=0.03, tau=0.05, a_pow=1.2, blocks=20)
        sl /= dsp.peak(sl) + 1e-9
        fx.put_pan(x, sl, t0 + 0.02, pans[i] * 0.8, 0.30)
    # settle crackle after the fan lands
    times = 0.30 + fx.crumple_times(rng, 0.38, 16, skew=1.5)
    cr = fx.grains(dur, rng, times, rng.uniform(0.15, 0.35, 16) * np.clip(1.15 - (times - 0.30) / 0.38, 0.1, 1.0), rng.uniform(1300, 2600, 16), bw_oct=1.2, glen=(0.004, 0.009), pans=rng.uniform(-0.6, 0.6, 16))
    x += 0.45 * cr
    return _done(x, dur, fade_ms=100)


@sfx("card.flip", "card_flip", "tutorial", "sfx", False, -8.0, 40, "swoosh plus paper tap (card flies to centre and flips)")
def card_flip(rng):
    dur = 0.52
    n = n_of(dur)
    sw = fx.swish(0.34, rng, 650.0, 3100.0, bw_oct=1.8, t_peak=0.15, tau=0.07, a_pow=1.6, blocks=30)
    sw /= dsp.peak(sw) + 1e-9
    x = np.zeros(n)
    fx.put(x, sw, 0.0, 0.8)
    # mid-flip rustle (card turns over)
    fl = fx.flutter(0.14, rng, 26.0, 18.0, lo=1500.0, hi=3300.0, depth=0.8, env=fx.env_pts(n_of(0.14), [(0, 0), (0.03, 1), (0.14, 0)]))
    fl /= dsp.peak(fl) + 1e-9
    fx.put(x, fl, 0.22, 0.30)
    tap = _snap(rng)
    fx.put(x, tap, 0.335, 0.9)
    tl = fx.crumple_times(rng, 0.12, 8, skew=1.6)
    fx.put(x, fx.grains(0.16, rng, tl, rng.uniform(0.10, 0.25, 8), rng.uniform(1500, 2600, 8), glen=(0.004, 0.008)), 0.35, 0.5)
    return _done(x, dur, fade_ms=90)


@sfx("card.bifold", "card_bifold", "tutorial", "sfx", False, -8.0, 40, "paper unfolding crackle")
def card_bifold(rng):
    dur = 0.64
    n = n_of(dur)
    # two fold cracks (the hinge opens, then the second leaf) wrapped in unfolding crackle
    cnt = 46
    times = fx.crumple_times(rng, 0.50, cnt, skew=1.0)
    env = fx.env_pts(n, [(0, 0.45), (0.10, 1.0), (0.30, 0.7), (0.50, 0.25), (0.64, 0.0)])
    amps = (0.35 + 0.65 * rng.random(cnt)) * np.interp(times, np.arange(n) / SR, env)
    centers = 1400.0 + 1900.0 * rng.random(cnt)
    cr = fx.grains(dur, rng, times, amps, centers, bw_oct=1.2, glen=(0.004, 0.014))
    cracks = fx.grains(dur, rng, [0.0, 0.17, 0.33], [1.0, 0.85, 0.6], [1900.0, 1500.0, 2100.0], bw_oct=1.1, glen=(0.014, 0.024))
    low = fx.rustle(dur, rng, 220.0, 800.0, rate=16.0, depth=0.7) * fx.env_pts(n, [(0, 0.2), (0.15, 1.0), (0.45, 0.5), (0.64, 0.0)])
    x = cr + 0.8 * cracks + 0.30 * low
    return _done(x, dur, fade_ms=60)


@sfx("card.close", "card_close", "tutorial", "sfx", False, -8.0, 40, "fold closing plus soft tap")
def card_close(rng):
    dur = 0.42
    n = n_of(dur)
    cnt = 26
    times = fx.crumple_times(rng, 0.20, cnt, skew=0.8)
    amps = (0.3 + 0.7 * rng.random(cnt)) * (0.4 + 0.6 * times / 0.20)
    cr = fx.grains(dur, rng, times, amps, 1400.0 + 1800.0 * rng.random(cnt), glen=(0.004, 0.012))
    sw = fx.swish(0.22, rng, 2800.0, 900.0, bw_oct=1.6, t_peak=0.07, tau=0.05, a_pow=1.4, blocks=22)
    sw /= dsp.peak(sw) + 1e-9
    x = cr * 0.9
    fx.put(x, sw, 0.0, 0.45)
    th = dsp.lowpass(dsp.modal([440.0, 980.0], [1.0, 0.35], [0.020, 0.010], 0.09, attack=0.001), 3500.0, 2)
    fx.put(x, th, 0.205, 0.9)
    fx.put(x, _snap(rng), 0.205, 0.35)
    st = fx.rustle(0.12, rng, 700.0, 2200.0, rate=24.0, depth=0.8) * fx.env_pts(n_of(0.12), [(0, 0), (0.01, 1), (0.12, 0)])
    fx.put(x, st / (dsp.peak(st) + 1e-9), 0.23, 0.13)
    return _done(x, dur, fade_ms=50)


@sfx("card.stamp", "card_stamp", "tutorial", "sfx", False, -6.0, 40, "ink stamp thud (low body ~120 Hz) plus tiny tine E5 (green 'done' stamp)")
def card_stamp(rng):
    dur = 0.38
    n = n_of(dur)
    t = np.arange(n) / SR
    f = 120.0 * (1 + 0.28 * np.exp(-t / 0.012))
    body = fx.glide_sine(f) * dsp.env_exp(n, 0.06, 0.002)
    body += 0.55 * fx.glide_sine(2 * f) * dsp.env_exp(n, 0.035, 0.002)
    thump = dsp.lowpass(dsp.white(n, rng), 650.0, 2) * dsp.env_exp(n, 0.012, 0.0005)
    thump /= dsp.peak(thump) + 1e-9
    ink = fx.band_noise(n, rng, 900.0, 2600.0) * dsp.env_exp(n, 0.02, 0.001)
    ink /= dsp.peak(ink) + 1e-9
    x = dsp.lowpass(body / (dsp.peak(body) + 1e-9) + 0.5 * thump + 0.18 * ink, 3500.0, 2)
    fx.put(x, fx.tine(E5, 0.28, tau=0.11, kind="marimba"), 0.022, 0.20)
    return _done(x, dur, hp=85.0, fade_ms=50)


@sfx("card.exit", "card_exit", "tutorial", "sfx", False, -9.0, 40, "swish of cards sliding away")
def card_exit(rng):
    dur = 0.52
    n = n_of(dur)
    x = np.zeros(n)
    for i, (t0, g) in enumerate(((0.0, 1.0), (0.085, 0.8), (0.17, 0.6))):
        sw = fx.swish(0.26, rng, 1000.0 + 120 * i, 3200.0 - 400 * i, bw_oct=1.7, t_peak=0.06, tau=0.07, a_pow=1.4, blocks=22)
        sw /= dsp.peak(sw) + 1e-9
        fx.put(x, sw, t0, g)
    rs = fx.rustle(0.4, rng, 500.0, 1600.0, rate=20.0, depth=0.7) * fx.env_pts(n_of(0.4), [(0, 0), (0.05, 1.0), (0.4, 0.0)])
    fx.put(x, rs / (dsp.peak(rs) + 1e-9), 0.0, 0.18)
    return _done(x, dur, fade_ms=70)


# =========================================================================== sticker

@sfx("sticker.pop", "sticker_pop", "canvas", "sfx", True, -7.0, 48, "peel crackle, soft pop and very quiet sparkle tines (G6, E6)")
def sticker_pop(rng):
    dur = 0.56
    n = n_of(dur)
    x = np.zeros((n, 2))
    # peel: crackle with slowly rising colour
    cnt = 34
    times = fx.crumple_times(rng, 0.22, cnt, skew=0.9)
    amps = 0.25 + 0.55 * rng.random(cnt) * (0.5 + 0.5 * times / 0.22)
    centers = 1300.0 + 2100.0 * (times / 0.22) * (0.7 + 0.3 * rng.random(cnt))
    x += fx.grains(dur, rng, times, amps, centers, bw_oct=1.2, glen=(0.004, 0.012), pans=rng.uniform(-0.5, 0.5, cnt))
    # pop: short falling sine plus a puff
    pn = n_of(0.07)
    f = 820.0 * np.exp(-np.arange(pn) / (0.020 * SR)) + 380.0
    pop = fx.glide_sine(f) * dsp.env_exp(pn, 0.014, 0.0012)
    puff = dsp.lowpass(dsp.white(pn, rng), 2400.0, 2) * dsp.env_exp(pn, 0.008, 0.0006)
    pop = pop + 0.35 * puff / (dsp.peak(puff) + 1e-9)
    fx.put_pan(x, pop, 0.235, 0.0, 1.1)
    # very quiet sparkle tines
    fx.put_pan(x, fx.sparkle(G6, 0.28, 0.10), 0.265, 0.45, 0.085)
    fx.put_pan(x, fx.sparkle(E6, 0.26, 0.10), 0.325, -0.45, 0.075)
    return _done(x, dur, fade_ms=60)


@sfx("sticker.throw", "sticker_throw", "canvas", "sfx", True, -8.0, 48, "whoosh forward/up with a low-pass sweep; fades away")
def sticker_throw(rng):
    dur = 0.90
    n = n_of(dur)
    chans = []
    for _ in range(2):
        src = dsp.pink(n, rng)
        y = dsp.sweep_lowpass(src, 450.0, 3600.0, blocks=40)
        y = dsp.highpass(y, 180.0, 2)
        chans.append(y * fx.swell_env(n, 0.20, 0.26, 1.15))
    x = np.stack(chans, axis=1)
    x /= dsp.peak(x) + 1e-9
    # drift to one side as it flies away
    ang = np.linspace(-0.25, 0.55, n)
    x = np.stack([x[:, 0] * np.cos((ang + 1) * np.pi / 4) * 1.2, x[:, 1] * np.sin((ang + 1) * np.pi / 4) * 1.2], axis=1)
    air = fx.swish(0.7, rng, 1300.0, 3200.0, bw_oct=1.6, t_peak=0.18, tau=0.18, a_pow=1.5, blocks=26)
    air /= dsp.peak(air) + 1e-9
    fx.put_pan(x, air, 0.02, 0.15, 0.18)
    return _done(x, dur, fade_ms=120)


@sfx("sticker.shrink", "sticker_shrink", "canvas", "sfx", False, -9.0, 40, "shrink-spin swish (descending narrow-band sweep)")
def sticker_shrink(rng):
    dur = 0.42
    n = n_of(dur)
    src = dsp.pink(n, rng)
    y = dsp.sweep_bandpass(src, 2700.0, 800.0, bw_oct=0.9, blocks=36)
    # spin: tremolo that slows down as the sticker shrinks away
    rate = np.linspace(34.0, 11.0, n)
    spin = 0.62 + 0.38 * np.sin(fx.warp_phase(rate))
    e = fx.env_pts(n, [(0, 0.0), (0.02, 1.0), (0.22, 0.75), (0.42, 0.0)])
    x = y * spin * e
    return _done(x, dur, fade_ms=60)


# =========================================================================== ribbons (levels)

@sfx("ribbon.drop", "ribbon_drop", "levels", "sfx", True, -8.0, 48, "four paper flutter drops staggered 120 ms (chapter ribbons drop in)")
def ribbon_drop(rng):
    dur = 0.90
    n = n_of(dur)
    x = np.zeros((n, 2))
    pans = (-0.6, -0.2, 0.2, 0.6)
    for i in range(4):
        t0 = 0.12 * i
        fl_len = 0.22
        nf = n_of(fl_len)
        fl = fx.flutter(fl_len, rng, 19.0 - 1.5 * i, 9.0, lo=1100.0 + 60 * i, hi=2700.0, depth=0.85, env=fx.env_pts(nf, [(0, 0.0), (0.02, 1.0), (0.10, 0.7), (0.22, 0.0)]))
        fl /= dsp.peak(fl) + 1e-9
        sw = fx.swish(fl_len, rng, 2400.0, 1100.0, bw_oct=1.6, t_peak=0.04, tau=0.07, a_pow=1.3, blocks=18)
        sw /= dsp.peak(sw) + 1e-9
        fx.put_pan(x, fl, t0, pans[i], 0.55)
        fx.put_pan(x, sw, t0, pans[i], 0.35)
        # soft landing tap at the end of the drop
        tap = fx.wood(380.0 + 25 * i, rng, 0.07, ratios=(1.0, 2.2), amps=(1.0, 0.4), taus=(0.016, 0.008), lp=2800.0, click=0.10, click_band=(1200.0, 3000.0))
        fx.put_pan(x, tap, t0 + 0.17, pans[i], 0.45)
    # hush of paper settling
    times = 0.55 + fx.crumple_times(rng, 0.32, 13, skew=1.4)
    x += 0.4 * fx.grains(dur, rng, times, rng.uniform(0.12, 0.3, 13), rng.uniform(1200, 2400, 13), glen=(0.004, 0.009), pans=rng.uniform(-0.7, 0.7, 13))
    return _done(x, dur, fade_ms=90)


@sfx("ribbon.notch", "ribbon_notch", "levels", "sfx", False, -7.0, 40, "wooden tick with tonal body exactly C5 (the engine plays it at rates 1, 1.122, 1.26, 1.498 = C D E G)")
def ribbon_notch(rng):
    dur = 0.09
    n = n_of(dur)
    # tonal body: exactly C5, light upper partials at near-integer ratios so the pitch stays clean
    body = dsp.modal([C5, C5 * 2.0, C5 * 3.0], [1.0, 0.22, 0.07], [0.017, 0.009, 0.005], dur, attack=0.0008)
    tk = fx.band_noise(n, rng, 1800.0, 4200.0) * dsp.env_exp(n, 0.0018, 0.0003)
    tk /= dsp.peak(tk) + 1e-9
    x = dsp.lowpass(body + 0.14 * tk, 4800.0, 2)
    return _done(x, dur, hp=150.0, fade_ms=30)


@sfx("ribbon.armed", "ribbon_armed", "levels", "sfx", False, -7.0, 40, "click-lock: bright tick plus soft tine C6+G6")
def ribbon_armed(rng):
    dur = 0.26
    n = n_of(dur)
    x = np.zeros(n)
    t1 = fx.wood(1900.0, rng, 0.03, ratios=(1.0, 2.5), amps=(1.0, 0.5), taus=(0.006, 0.004), lp=5500.0, click=0.5, click_band=(2800.0, 5200.0), click_tau=0.0018)
    t2 = fx.wood(1300.0, rng, 0.04, ratios=(1.0, 2.5), amps=(1.0, 0.5), taus=(0.009, 0.005), lp=4500.0, click=0.35, click_band=(2200.0, 4500.0), click_tau=0.002)
    fx.put(x, t1, 0.0, 1.0)
    fx.put(x, t2, 0.042, 0.8)           # the lock "clack" after the click
    tn = fx.tine(C6, 0.22, tau=0.09, kind="kalimba") + 0.8 * fx.tine(G6, 0.22, tau=0.09, kind="kalimba")
    fx.put(x, tn / (dsp.peak(tn) + 1e-9), 0.012, 0.42)
    return _done(dsp.lowpass(x, 6000.0, 1), dur, fade_ms=90)


@sfx("ribbon.launch", "ribbon_launch", "levels", "sfx", True, -7.0, 48, "spring release whoosh upward plus paper flutter")
def ribbon_launch(rng):
    dur = 0.70
    n = n_of(dur)
    chans = []
    for _ in range(2):
        src = dsp.pink(n, rng)
        w = dsp.sweep_bandpass(src, 450.0, 3800.0, bw_oct=1.9, blocks=36)
        chans.append(w * fx.swell_env(n, 0.14, 0.20, 1.4))
    x = np.stack(chans, axis=1)
    x /= dsp.peak(x) + 1e-9
    # resonant "spring" sweep under the whoosh: narrower, quieter, rising
    sp = dsp.sweep_bandpass(dsp.pink(n, rng), 380.0, 2600.0, bw_oct=0.8, blocks=36) * fx.swell_env(n, 0.10, 0.12, 1.3)
    x += 0.35 * fx.pan_curve(sp / (dsp.peak(sp) + 1e-9), np.linspace(-0.2, 0.35, n))
    # release tick + paper flutter trailing up
    tick = fx.wood(900.0, rng, 0.04, ratios=(1.0, 2.3), amps=(1.0, 0.5), taus=(0.010, 0.006), lp=4200.0, click=0.3)
    fx.put_pan(x, tick, 0.0, 0.0, 0.55)
    fl_len = 0.5
    fl = fx.flutter(fl_len, rng, 20.0, 12.0, lo=1500.0, hi=3500.0, depth=0.85, env=fx.env_pts(n_of(fl_len), [(0, 0.0), (0.06, 1.0), (0.3, 0.5), (0.5, 0.0)]))
    fl /= dsp.peak(fl) + 1e-9
    fx.put_pan(x, fl, 0.10, 0.35, 0.40)
    return _done(x, dur, fade_ms=100)


@sfx("ribbon.rebound", "ribbon_rebound", "levels", "sfx", False, -9.0, 40, "rubber-band rebound wobble, damped, low")
def ribbon_rebound(rng):
    dur = 0.50
    n = n_of(dur)
    t = np.arange(n) / SR
    wob = np.exp(-t / 0.11)
    f = (230.0 + 90.0 * np.exp(-t / 0.10)) * (1 + 0.09 * wob * np.sin(2 * np.pi * 12.5 * t))
    amp = np.exp(-t / 0.16) * (1 + 0.30 * wob * np.sin(2 * np.pi * 12.5 * t + 1.1))
    body = fx.glide_sine(f) + 0.35 * fx.glide_sine(2.31 * f) * np.exp(-t / 0.07) + 0.18 * fx.glide_sine(3.7 * f) * np.exp(-t / 0.04)
    x = body * amp
    x[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    snap = dsp.lowpass(dsp.white(n, rng), 1800.0, 2) * dsp.env_exp(n, 0.006, 0.0004)
    x = x / (dsp.peak(x) + 1e-9) + 0.22 * snap / (dsp.peak(snap) + 1e-9)
    return _done(dsp.lowpass(x, 1500.0, 2), dur, hp=95.0, fade_ms=70)


@sfx("ribbon.unlock", "ribbon_unlock", "levels", "sfx", True, -5.0, 56, "shimmer plus elastic spring; bell cluster C6/E6/G6 (only for a real fresh unlock)")
def ribbon_unlock(rng):
    dur = 0.95
    n = n_of(dur)
    x = np.zeros((n, 2))
    # elastic spring: quick rising twang with damped wobble
    sn = n_of(0.30)
    t = np.arange(sn) / SR
    f = 190.0 * np.exp(1.0 * np.clip(t / 0.18, 0, 1)) * (1 + 0.05 * np.exp(-t / 0.10) * np.sin(2 * np.pi * 17.0 * t))
    sp = (fx.glide_sine(f) + 0.3 * fx.glide_sine(2.4 * f)) * dsp.env_exp(sn, 0.09, 0.003)
    sp = dsp.lowpass(sp / (dsp.peak(sp) + 1e-9), 1800.0, 2)
    fx.put_pan(x, sp, 0.0, 0.0, 0.30)
    # whoosh of paper under it
    wh = fx.swish(0.30, rng, 700.0, 3000.0, bw_oct=1.8, t_peak=0.08, tau=0.09, a_pow=1.4, blocks=22)
    fx.put_pan(x, wh / (dsp.peak(wh) + 1e-9), 0.0, 0.0, 0.22)
    # bell cluster C6 / E6 / G6, slightly staggered, spread across the field
    for f0, t0, p in ((C6, 0.05, -0.35), (E6, 0.095, 0.0), (G6, 0.14, 0.35)):
        b = dsp.fm_bell(f0, 0.8, ratio=3.5, index=1.0, tau=0.30)
        fx.put_pan(x, b, t0, p, 0.62)
    # shimmer: tiny quiet high pentatonic tines scattered over the first half second
    sh_t = np.sort(rng.uniform(0.10, 0.52, 9))
    sh_f = rng.choice([G6, A6, C7, E6, hz("E7")], 9)
    sh_p = rng.uniform(-0.8, 0.8, 9)
    for tt_, ff, pp in zip(sh_t, sh_f, sh_p):
        fx.put_pan(x, fx.sparkle(float(ff), 0.22, 0.07), float(tt_), float(pp), float(rng.uniform(0.05, 0.09)))
    x = dsp.reverb(x, rt60=0.45, wet=0.18, damping=4200.0, predelay=0.008, rng=rng)
    return _done(x, dur, fade_ms=110)
