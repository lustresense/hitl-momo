"""Helpers for the interface / NUI / bubble sounds (Worker A). numpy + scipy only, no samples, no AI audio model.

Design vocabulary: soft wooden ticks, kalimba/marimba tines, paper pops, airy bubbles. Nothing vocal.
Every helper returns float64 arrays at dsp.SR and is deterministic given the rng it receives.
"""
from __future__ import annotations

import numpy as np

from . import dsp
from .dsp import SR, n_of

# Pentatonic pitches used by the interface sounds (C major pentatonic, 12-TET, A4 = 440)
G4, A4, C5, D5, E5, G5, A5, C6 = (dsp.hz(n) for n in ("G4", "A4", "C5", "D5", "E5", "G5", "A5", "C6"))
E4 = dsp.hz("E4")


# --------------------------------------------------------------------------- shaping
def end_at(x: np.ndarray, dur: float, fade: float = 0.02, power: float = 2.0) -> np.ndarray:
    """Cut/pad to exactly `dur` seconds and fade the end with a raised cosine so one-shots finish at zero (no tail, no click)."""
    n = n_of(dur)
    y = dsp.pad_to(x, n).copy()
    f = min(n_of(fade), n)
    if f > 1:
        w = (0.5 * (1 + np.cos(np.linspace(0, np.pi, f)))) ** power
        y[-f:] *= w if y.ndim == 1 else w[:, None]
    return y


def place(dst: np.ndarray, src: np.ndarray, at: float, gain: float = 1.0) -> np.ndarray:
    return dsp.mix_into(dst, src, n_of(at), gain)


def soft_lp(x: np.ndarray, fc: float = 5000.0) -> np.ndarray:
    """Round off a sound: gentle 2nd-order low-pass plus a high-pass below the laptop-speaker floor."""
    return dsp.highpass(dsp.lowpass(x, fc, 2), 90.0, 1)


def rescale(x: np.ndarray, level: float = 1.0) -> np.ndarray:
    return x * (level / (dsp.peak(x) + 1e-12))


# --------------------------------------------------------------------------- tonal building blocks
def tine(f: float, dur: float, tau: float = 0.12, kind: str = "kalimba", bright: float = 1.0, attack: float = 0.0015) -> np.ndarray:
    """Soft struck tine (kalimba 1 : 5.4 : 13, marimba 1 : 4 : 10). Upper partials are quiet and decay quickly."""
    ratios = (1.0, 5.4, 13.0) if kind == "kalimba" else (1.0, 4.0, 10.0)
    amps = (1.0, 0.16 * bright, 0.035 * bright)
    taus = (tau, tau * 0.38, tau * 0.14)
    x = dsp.modal([f * r for r in ratios], amps, taus, dur, attack)
    # a very slightly detuned twin of the fundamental gives a soft "tine" beat instead of a sterile sine
    x = x + 0.12 * dsp.modal([f * 1.0035], [1.0], [tau * 1.2], dur, attack)
    return x / (dsp.peak(x) + 1e-12)


def woody(f: float, dur: float, tau: float, rng: np.random.Generator, ratios=(1.0, 2.35, 3.9), amps=(1.0, 0.35, 0.12), click: float = 0.25, fc: float = 4500.0) -> np.ndarray:
    """Wooden tick/knock: 2-3 inharmonic partials with short decays and a tiny band-passed noise transient, then rounded."""
    taus = (tau, tau * 0.55, tau * 0.3)
    body = dsp.modal([f * r for r in ratios], amps, taus, dur, 0.0006)
    n = n_of(dur)
    tr = dsp.bandpass(rng.standard_normal(n), 1200.0, 5000.0, 2) * dsp.env_exp(n, 0.0025, 0.0003)
    x = body + click * tr / (dsp.peak(tr) + 1e-12)
    return soft_lp(x, fc)


def paper_pop(rng: np.random.Generator, dur: float = 0.04, lo: float = 1100.0, hi: float = 3800.0, tau: float = 0.007) -> np.ndarray:
    """Tiny paper "pop": band-passed noise burst with a very fast decay and a sparse crackle on top (moderate 2-5 kHz energy)."""
    n = n_of(dur)
    nz = dsp.bandpass(rng.standard_normal(n), lo, hi, 2) * dsp.env_exp(n, tau, 0.0004)
    imp = (rng.random(n) < 0.004) * rng.standard_normal(n)
    crack = dsp.bandpass(imp, lo, hi, 1) * dsp.env_exp(n, tau * 2.2, 0.0003)
    x = nz / (dsp.peak(nz) + 1e-12) + 0.35 * crack / (dsp.peak(crack) + 1e-12)
    return x / (dsp.peak(x) + 1e-12)


def glide_sine(f0: float, f1: float, dur: float, tau: float, attack: float = 0.003, curve: float = 1.0, h2: float = 0.0) -> np.ndarray:
    """Sine with an exponential pitch glide f0 -> f1 (curve > 1 front-loads the movement) and a soft exponential decay."""
    n = n_of(dur)
    t = np.arange(n) / SR
    prog = 1 - np.exp(-curve * 5 * t / dur)
    prog = prog / prog[-1] if prog[-1] else prog
    f = f0 * (f1 / f0) ** prog
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + h2 * np.sin(2 * ph)
    return x * dsp.env_exp(n, tau, attack)


def airy_puff(rng: np.random.Generator, dur: float, lo: float = 1500.0, hi: float = 4500.0, tau: float = 0.02, attack: float = 0.004) -> np.ndarray:
    n = n_of(dur)
    nz = dsp.bandpass(rng.standard_normal(n), lo, hi, 2) * dsp.env_exp(n, tau, attack)
    return nz / (dsp.peak(nz) + 1e-12)


def soft_room(x: np.ndarray, rt60: float, wet: float, rng: np.random.Generator, damping: float = 4500.0) -> np.ndarray:
    """Very short reverb; returns mono (mid) with the tail kept (caller trims with end_at)."""
    y = dsp.reverb(x, rt60=rt60, wet=wet, damping=damping, predelay=0.006, rng=rng, tail=True)
    return y.mean(axis=1)


# --------------------------------------------------------------------------- circular (seamless) helpers for the hold loop
def circular_noise(n: int, rng: np.random.Generator, lo: float, hi: float, slope_db_oct: float = 0.0) -> np.ndarray:
    """Band-limited noise built in the frequency domain, so it is exactly periodic over n samples (perfect loop)."""
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.zeros_like(f)
    inb = (f >= lo) & (f <= hi)
    # smooth raised-cosine edges in log frequency
    lf = np.log2(np.maximum(f, 1e-3))
    a, b = np.log2(lo), np.log2(hi)
    edge = 0.5
    up = np.clip((lf - a) / edge, 0, 1)
    dn = np.clip((b - lf) / edge, 0, 1)
    g = 0.5 * (1 - np.cos(np.pi * up)) * 0.5 * (1 - np.cos(np.pi * dn))
    if slope_db_oct:
        g = g * 10 ** ((slope_db_oct * np.log2(np.maximum(f, 1.0) / lo)) / 20)
    g[f < 60] = 0.0
    x = np.fft.irfft(X * g, n)
    return x / (dsp.rms(x) + 1e-12)


def loop_freq(f: float, loop_s: float) -> float:
    """Snap a frequency to an integer number of cycles per loop so a pure partial is perfectly periodic."""
    return round(f * loop_s) / loop_s
