"""Worker A: interface, NUI feedback and bubble sounds (SFX_SPEC.md, "Worker A").

Soft, short, never harsh. All pitched material is C major pentatonic (documented exceptions: nui.hold uses E4/B4 as the
spec asks, glides in ring_in/bubble/release are unpitched sweeps, knocks in ui.denied are unpitched wood). Nothing vocal.
Top-level code only registers assets; the real work lives in common/fx_ui.py.
"""
from __future__ import annotations

import numpy as np

from registry import sfx, sfx_loop
from common import dsp
from common import fx_ui as F
from common.dsp import SR, n_of


# --------------------------------------------------------------------------- taps
def _tap(rng, f: float, tau: float, ratios, amps, click: float, fc: float):
    x = F.woody(f, 0.07, tau, rng, ratios=ratios, amps=amps, click=click, fc=fc)
    return F.end_at(x, 0.070, 0.022)


@sfx("ui.tap_a", "ui_tap_a", "core", bus="ui", peak_db=-12, desc="soft wooden tick, body ~1.6 kHz, tiny noise transient, very soft")
def ui_tap_a(rng):
    return _tap(rng, 1600.0, 0.011, (1.0, 2.4, 3.8), (1.0, 0.30, 0.10), 0.22, 4800.0)


@sfx("ui.tap_b", "ui_tap_b", "core", bus="ui", peak_db=-12, desc="variant of tap_a, body ~1.3 kHz, slightly rounder")
def ui_tap_b(rng):
    return _tap(rng, 1300.0, 0.0135, (1.0, 2.2, 3.5), (1.0, 0.24, 0.07), 0.15, 3800.0)


# --------------------------------------------------------------------------- toggles
@sfx("ui.toggle_on", "ui_toggle_on", "core", bus="ui", peak_db=-9, desc="two soft kalimba tines E5 then G5, 60 ms apart")
def ui_toggle_on(rng):
    out = np.zeros(n_of(0.13))
    F.place(out, F.tine(F.E5, 0.13, tau=0.035, bright=0.6), 0.0, 0.85)
    F.place(out, F.tine(F.G5, 0.07, tau=0.035, bright=0.6), 0.060, 1.0)
    return F.end_at(F.soft_lp(out, 5200.0), 0.13, 0.055)


@sfx("ui.toggle_off", "ui_toggle_off", "core", bus="ui", peak_db=-10, desc="single soft kalimba tine C5, short decay")
def ui_toggle_off(rng):
    x = F.tine(F.C5, 0.10, tau=0.032, bright=0.5)
    return F.end_at(F.soft_lp(x, 4800.0), 0.10, 0.05)


# --------------------------------------------------------------------------- denied / notice
@sfx("ui.denied", "ui_denied", "core", bus="ui", peak_db=-10, desc="two damped soft wooden knocks (~190 then ~170 Hz); neutral, no buzz")
def ui_denied(rng):
    out = np.zeros(n_of(0.24))
    k1 = F.woody(190.0, 0.14, 0.024, rng, ratios=(1.0, 2.3, 3.7), amps=(1.0, 0.7, 0.30), click=0.18, fc=2300.0)
    k2 = F.woody(170.0, 0.14, 0.024, rng, ratios=(1.0, 2.3, 3.7), amps=(1.0, 0.7, 0.30), click=0.18, fc=2300.0)
    F.place(out, k1, 0.0, 1.0)
    F.place(out, k2, 0.090, 0.8)
    return F.end_at(out, 0.24, 0.045)


@sfx("ui.notice", "ui_notice", "core", bus="ui", peak_db=-8, desc="small paper pop plus a faint tine A5")
def ui_notice(rng):
    out = np.zeros(n_of(0.20))
    F.place(out, F.paper_pop(rng, 0.04, 1000.0, 3400.0, 0.008), 0.0, 0.55)
    F.place(out, F.tine(F.A5, 0.18, tau=0.07, bright=0.5), 0.012, 0.8)
    return F.end_at(F.soft_lp(out, 5200.0), 0.20, 0.05)


# --------------------------------------------------------------------------- ring appears / morph / skip
@sfx("ui.ring_in", "ui_ring_in", "core", bus="ui", peak_db=-11, desc="soft airy bubble pop, glide ~400 to 700 Hz with a puff of noise")
def ui_ring_in(rng):
    out = np.zeros(n_of(0.17))
    body = F.glide_sine(400.0, 700.0, 0.17, 0.05, attack=0.006, curve=1.3, h2=0.12)
    F.place(out, body, 0.0, 1.0)
    F.place(out, F.airy_puff(rng, 0.10, 1400.0, 3800.0, 0.028, 0.006), 0.0, 0.30)
    return F.end_at(F.soft_lp(out, 4800.0), 0.17, 0.05)


@sfx("ui.morph", "ui_morph", "core", bus="ui", stereo=True, peak_db=-12, desc="soft paper slide: band-passed noise sweep 800 to 2500 Hz plus faint low tonal body")
def ui_morph(rng):
    n = n_of(0.45)
    t = np.arange(n) / SR
    ch = []
    for c in range(2):
        nz = dsp.bandpass(rng.standard_normal(n), 500.0, 4500.0, 1)
        nz = dsp.sweep_bandpass(nz, 800.0, 2500.0, bw_oct=1.6, blocks=36)
        imp = (rng.random(n) < 0.0016) * rng.standard_normal(n)             # sparse paper crackle
        crack = dsp.bandpass(imp, 1200.0, 4200.0, 1)
        nz = nz / (dsp.rms(nz) + 1e-12) + 0.55 * crack / (dsp.rms(crack) + 1e-12)
        ch.append(nz)
    # immediate soft attack (latency), plateau, then a half-cosine decay
    env = (1 - np.exp(-t / 0.022)) * np.where(t < 0.14, 1.0, 0.5 * (1 + np.cos(np.pi * np.clip((t - 0.14) / 0.31, 0, 1))))
    # faint low body: C4 sliding up a little with the paper
    body = np.sin(2 * np.pi * np.cumsum(262.0 * (1 + 0.12 * t / 0.45)) / SR) * env * 0.35
    out = np.zeros((n, 2))
    for c in range(2):
        g = np.linspace(0.8, 1.0, n) if c else np.linspace(1.0, 0.8, n)      # slight L->R drift of the slide
        out[:, c] = ch[c] * env * g * 0.5 + body * (0.7 if c else 0.7)
    out = dsp.highpass(out, 90.0, 1)
    return F.end_at(out, 0.45, 0.09)


@sfx("ui.skip", "ui_skip", "core", bus="ui", peak_db=-12, desc="tiny fast tick with a short swish (developer skip bar only)")
def ui_skip(rng):
    out = np.zeros(n_of(0.11))
    F.place(out, F.woody(1500.0, 0.04, 0.0055, rng, ratios=(1.0, 2.4, 3.9), amps=(1.0, 0.22, 0.06), click=0.15, fc=3300.0), 0.0, 0.9)
    n = n_of(0.08)
    sw = dsp.bandpass(rng.standard_normal(n), 900.0, 3200.0, 2)
    sw = dsp.sweep_bandpass(sw, 2400.0, 1200.0, bw_oct=1.4, blocks=16)
    sw = sw * np.sin(np.pi * np.clip(np.arange(n) / n, 0, 1)) ** 1.2
    F.place(out, sw / (dsp.peak(sw) + 1e-12), 0.018, 0.28)
    return F.end_at(out, 0.11, 0.03)


# --------------------------------------------------------------------------- system cues
@sfx("sys.hiccup", "sys_hiccup", "core", bus="ui", peak_db=-13, desc="three soft falling tines E5, C5, G4, short reverb; gentle 'not now'")
def sys_hiccup(rng):
    out = np.zeros(n_of(0.62))
    F.place(out, F.tine(F.E5, 0.30, tau=0.09, kind="marimba", bright=0.5), 0.0, 0.85)
    F.place(out, F.tine(F.C5, 0.30, tau=0.10, kind="marimba", bright=0.5), 0.140, 0.80)
    F.place(out, F.tine(F.G4, 0.32, tau=0.12, kind="marimba", bright=0.5), 0.285, 0.75)
    out = F.soft_lp(out, 3600.0)
    out = F.soft_room(out, 0.28, 0.28, rng, damping=3500.0)
    return F.end_at(out, 0.52, 0.12)


@sfx("sys.ready", "sys_ready", "core", bus="ui", peak_db=-7, desc="gentle ascending kalimba shimmer C5-E5-G5 with light reverb (only after a real success)")
def sys_ready(rng):
    out = np.zeros(n_of(0.85))
    for i, (f, g) in enumerate(((F.C5, 0.80), (F.E5, 0.88), (F.G5, 1.0))):
        t0 = 0.115 * i
        F.place(out, F.tine(f, 0.50, tau=0.17, bright=0.7), t0, g)
        F.place(out, F.tine(f * 2, 0.28, tau=0.09, bright=0.3), t0 + 0.012, 0.13 * g)     # quiet octave shimmer (C6 E6 G6)
    out = F.soft_lp(out, 5600.0)
    out = F.soft_room(out, 0.40, 0.30, rng, damping=4200.0)
    return F.end_at(out, 0.65, 0.16)


# --------------------------------------------------------------------------- bubbles
def _bubble(rng, f0: float, f1: float, pop_lo: float, pop_hi: float):
    out = np.zeros(n_of(0.15))
    F.place(out, F.glide_sine(f0, f1, 0.15, 0.040, attack=0.005, curve=1.6, h2=0.18), 0.0, 1.0)
    F.place(out, F.paper_pop(rng, 0.03, pop_lo, pop_hi, 0.006), 0.0, 0.30)          # thin paper skin
    F.place(out, F.airy_puff(rng, 0.07, 1800.0, 4200.0, 0.016, 0.004), 0.004, 0.12)
    return F.end_at(F.soft_lp(out, 4600.0), 0.15, 0.045)


@sfx("bubble.show_a", "bubble_show_a", "core", bus="ui", peak_db=-12, desc="soft paper-bubble pop (airy 'ploop'), non-vocal")
def bubble_show_a(rng):
    return _bubble(rng, 360.0, 600.0, 1100.0, 3200.0)


@sfx("bubble.show_b", "bubble_show_b", "core", bus="ui", peak_db=-12, desc="variant of show_a, slightly higher")
def bubble_show_b(rng):
    return _bubble(rng, 430.0, 720.0, 1300.0, 3500.0)


# --------------------------------------------------------------------------- NUI feedback
@sfx("nui.lit", "nui_lit", "core", bus="ui", peak_db=-14, desc="very soft tonal tick G5 (a ring target became the lit one)")
def nui_lit(rng):
    x = F.tine(F.G5, 0.06, tau=0.016, bright=0.4, attack=0.001)
    return F.end_at(F.soft_lp(x, 4800.0), 0.06, 0.035)


@sfx_loop("nui.hold", "nui_hold", "core", bus="ui", rms_db=-30, desc="soft airy charge bed: filtered noise plus E4/B4 partials with slow tremolo; seamless (engine raises rate as the ring fills)")
def nui_hold(rng):
    L = 0.9
    n = n_of(L)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    f_e = F.loop_freq(F.E4, L)                       # E4, snapped to a whole number of cycles per loop (+-2 cents)
    f_b = F.loop_freq(dsp.hz("B4"), L)               # B4 (the spec's fifth above E4)
    for c in range(2):
        nz = F.circular_noise(n, rng, 420.0, 2000.0, slope_db_oct=-3.0)
        trem_n = 0.8 - 0.3 * np.cos(2 * np.pi * (3 * t / L) + 0.5 * c)     # starts at its low point
        ph = 0.6 * c
        trem_a = 1 + 0.28 * np.sin(2 * np.pi * (4 * t / L) + ph)
        trem_b = 1 + 0.28 * np.sin(2 * np.pi * (4 * t / L) + ph + 1.7 + 0.8 * c)
        tone = 0.9 * np.sin(2 * np.pi * f_e * t) * trem_a + 0.55 * np.sin(2 * np.pi * f_b * t) * trem_b
        tone += 0.16 * np.sin(2 * np.pi * (2 * f_e) * t)                    # soft octave for presence on small speakers
        out[:, c] = 0.45 * nz * trem_n + tone
    return out


@sfx("nui.commit", "nui_commit", "core", bus="ui", peak_db=-5, desc="soft 'pock' plus short tine G5 to C6; neutral confirm for EVERY ring")
def nui_commit(rng):
    out = np.zeros(n_of(0.26))
    pock = F.woody(520.0, 0.09, 0.015, rng, ratios=(1.0, 1.9, 3.1), amps=(1.0, 0.35, 0.12), click=0.18, fc=3000.0)
    F.place(out, pock, 0.0, 0.95)
    F.place(out, F.tine(F.G5, 0.16, tau=0.07, bright=0.5), 0.016, 0.62)
    F.place(out, F.tine(F.C6, 0.20, tau=0.09, bright=0.45), 0.080, 0.70)
    return F.end_at(F.soft_lp(out, 5200.0), 0.26, 0.07)


@sfx("nui.release", "nui_release", "core", bus="ui", peak_db=-14, desc="quiet soft unwind, a small downward sweep (hold released without commit)")
def nui_release(rng):
    out = np.zeros(n_of(0.15))
    F.place(out, F.glide_sine(680.0, 340.0, 0.15, 0.045, attack=0.004, curve=1.1, h2=0.10), 0.0, 1.0)
    n = n_of(0.12)
    nz = dsp.sweep_lowpass(rng.standard_normal(n), 3600.0, 900.0, blocks=14)
    nz = nz * dsp.env_exp(n, 0.04, 0.003)
    F.place(out, nz / (dsp.peak(nz) + 1e-12), 0.0, 0.18)
    return F.end_at(F.soft_lp(out, 3800.0), 0.15, 0.05)


def _tracking(f_first: float, f_second: float):
    out = np.zeros(n_of(0.38))
    F.place(out, F.tine(f_first, 0.30, tau=0.10, kind="marimba", bright=0.4), 0.0, 0.85)
    F.place(out, F.tine(f_second, 0.32, tau=0.12, kind="marimba", bright=0.4), 0.130, 1.0)
    return F.end_at(F.soft_lp(out, 2600.0), 0.38, 0.09)


@sfx("nui.track_lost", "nui_track_lost", "core", bus="ui", peak_db=-12, desc="very soft descending tine A4 to E4, low-passed; hand tracking dropped")
def nui_track_lost(rng):
    return _tracking(F.A4, F.E4)


@sfx("nui.track_found", "nui_track_found", "core", bus="ui", peak_db=-12, desc="very soft ascending tine E4 to A4; hand tracking regained")
def nui_track_found(rng):
    return _tracking(F.E4, F.A4)
