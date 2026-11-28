"""Helpers for the world / Momo (non-vocal) / Thinman / intro / dream / ending sound effects (Worker C).

Everything is original numpy/scipy synthesis built on `common.dsp`. Nothing here is vocal: only paper, cloth, wood, rubber,
air, water/ink and soft tines. All helpers are vectorised (no per-sample Python loops).
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from . import dsp
from .dsp import SR, n_of

# C major pentatonic frequencies (12-TET, A4 = 440) used by the tonal parts of this module.
PENTA = {
    "G3": 196.00, "A3": 220.00, "C4": 261.63, "D4": 293.66, "E4": 329.63, "G4": 392.00, "A4": 440.00,
    "C5": 523.25, "D5": 587.33, "E5": 659.26, "G5": 783.99, "A5": 880.00,
    "C6": 1046.50, "D6": 1174.66, "E6": 1318.51, "G6": 1567.98, "A6": 1760.00, "C7": 2093.00,
}
PENTA_HIGH = [PENTA[k] for k in ("C6", "D6", "E6", "G6", "A6")]


# ------------------------------------------------------------------------------------------------ small utilities
def smooth_noise(n: int, rng: np.random.Generator, fc: float = 8.0) -> np.ndarray:
    """Slowly varying random curve, roughly within [-1, 1]."""
    x = dsp.lowpass(rng.standard_normal(n), fc, 2)
    return x / (np.max(np.abs(x)) + 1e-12)


def bpn(n: int, rng: np.random.Generator, lo: float, hi: float, order: int = 2, color: str = "white") -> np.ndarray:
    """Band-passed noise (unit-ish level)."""
    x = dsp.white(n, rng) if color == "white" else dsp.pink(n, rng)
    return dsp.bandpass(x, lo, hi, order)


def lpn(n: int, rng: np.random.Generator, fc: float, order: int = 2, color: str = "white") -> np.ndarray:
    x = dsp.white(n, rng) if color == "white" else dsp.pink(n, rng)
    return dsp.lowpass(x, fc, order)


def env_hump(n: int, attack: float, tau: float) -> np.ndarray:
    """sin^2 attack (no click) followed by an exponential decay."""
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return np.sin(0.5 * np.pi * a) ** 2 * np.exp(-np.maximum(t - attack, 0) / tau)


def env_swell(n: int, peak_frac: float = 0.5, p_up: float = 2.0, p_down: float = 2.0, floor: float = 0.0) -> np.ndarray:
    """Smooth swell that starts at `floor` (so the sound starts within the latency budget), peaks at peak_frac, ends at 0."""
    x = np.linspace(0, 1, n)
    up = np.sin(0.5 * np.pi * np.clip(x / peak_frac, 0, 1)) ** p_up
    dn = np.cos(0.5 * np.pi * np.clip((x - peak_frac) / (1 - peak_frac), 0, 1)) ** p_down
    e = np.where(x < peak_frac, floor + (1 - floor) * up, dn)
    return e


def seg(total: int, start_s: float, piece: np.ndarray, gain: float = 1.0) -> np.ndarray:
    """Place `piece` into a zero buffer of length `total` at `start_s` (clips at the end). Works for mono/stereo pieces."""
    shape = (total,) + piece.shape[1:]
    out = np.zeros(shape)
    s = int(round(start_s * SR))
    if s < total:
        m = min(total - s, piece.shape[0])
        out[s:s + m] = gain * piece[:m]
    return out


def pan_auto(x: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Equal-power pan with a per-sample pan curve p in [-1, 1] (vectorised)."""
    ang = (np.clip(p, -1, 1) + 1) * np.pi / 4
    return np.stack([x * np.cos(ang), x * np.sin(ang)], axis=1)


def smoothstep(n: int, a: float, b: float) -> np.ndarray:
    u = np.linspace(0, 1, n)
    u = u * u * (3 - 2 * u)
    return a + (b - a) * u


def freq_contour(n: int, pts: list[tuple[float, float]]) -> np.ndarray:
    """Piecewise log-frequency contour from [(t_frac, hz), ...] with smooth (cosine) interpolation."""
    xs = np.array([p[0] for p in pts]); ys = np.log(np.array([p[1] for p in pts]))
    u = np.linspace(0, 1, n)
    idx = np.clip(np.searchsorted(xs, u, side="right") - 1, 0, len(xs) - 2)
    x0, x1 = xs[idx], xs[idx + 1]
    w = np.clip((u - x0) / np.maximum(x1 - x0, 1e-9), 0, 1)
    w = 0.5 - 0.5 * np.cos(np.pi * w)
    return np.exp(ys[idx] * (1 - w) + ys[idx + 1] * w)


def contour_bandpass(x: np.ndarray, fc: np.ndarray, bw_oct: float = 1.2, blocks: int = 36) -> np.ndarray:
    """Band-pass whose centre frequency follows an arbitrary contour fc (one value per sample), by cross-fading block-filtered copies."""
    n = x.shape[0]
    edges = np.linspace(0, n, blocks + 1).astype(int)
    blen = max(edges[1] - edges[0], 2)
    kernel = np.hanning(blen * 2 + 1)
    out = np.zeros_like(x, dtype=float)
    norm = np.zeros(n)
    for i in range(blocks):
        mid = int((edges[i] + edges[i + 1]) / 2)
        f = float(fc[min(mid, n - 1)])
        lo = f / 2 ** (bw_oct / 2)
        hi = min(f * 2 ** (bw_oct / 2), SR / 2 - 300)
        y = dsp.bandpass(x, lo, hi, 2)
        w = np.zeros(n); w[edges[i]:edges[i + 1]] = 1.0
        w = np.convolve(w, kernel, mode="same")
        out += y * (w if x.ndim == 1 else w[:, None]); norm += w
    return out / (np.maximum(norm, 1e-9) if x.ndim == 1 else np.maximum(norm, 1e-9)[:, None])


def contour_lowpass(x: np.ndarray, fc: np.ndarray, blocks: int = 36, order: int = 2) -> np.ndarray:
    n = x.shape[0]
    edges = np.linspace(0, n, blocks + 1).astype(int)
    blen = max(edges[1] - edges[0], 2)
    out = np.zeros_like(x, dtype=float)
    norm = np.zeros(n)
    for i in range(blocks):
        mid = int((edges[i] + edges[i + 1]) / 2)
        y = dsp.lowpass(x, float(fc[min(mid, n - 1)]), order)
        w = np.zeros(n); w[edges[i]:edges[i + 1]] = 1.0
        w = np.convolve(w, np.hanning(blen * 2 + 1), mode="same")
        out += y * (w if x.ndim == 1 else w[:, None]); norm += w
    return out / (np.maximum(norm, 1e-9) if x.ndim == 1 else np.maximum(norm, 1e-9)[:, None])


def flutter_mod(n: int, rng: np.random.Generator, rate: float, jitter: float = 0.3, sharp: float = 1.5, depth: float = 1.0) -> np.ndarray:
    """Cloth / wing flutter amplitude modulator: irregular pulses at `rate` Hz (jittered), 0..1."""
    j = smooth_noise(n, rng, 18.0)
    ph = np.cumsum(rate * (1 + jitter * j)) / SR + rng.random()
    m = (0.5 - 0.5 * np.cos(2 * np.pi * ph)) ** sharp
    return (1 - depth) + depth * m


def crackle(n: int, rng: np.random.Generator, rate: float, lo: float = 1500.0, hi: float = 4500.0, tau: float = 0.003) -> np.ndarray:
    """Sparse random paper crackle: Poisson impulses -> short noisy grains -> band-pass. Unit peak."""
    imp = (rng.random(n) < rate / SR) * (rng.random(n) ** 2) * np.where(rng.random(n) > 0.5, 1.0, -1.0)
    k = rng.standard_normal(max(8, int(5 * tau * SR))) * np.exp(-np.arange(max(8, int(5 * tau * SR))) / (tau * SR))
    y = signal.fftconvolve(imp, k)[:n]
    y = dsp.bandpass(y, lo, hi, 2)
    return y / (np.max(np.abs(y)) + 1e-12)


def crackle_at(n: int, rng: np.random.Generator, times: list[float], amps: list[float] | None = None, lo: float = 1500.0, hi: float = 4000.0, tau: float = 0.004) -> np.ndarray:
    """Paper grains at given times (seconds)."""
    out = np.zeros(n)
    amps = amps or [1.0] * len(times)
    glen = max(16, int(6 * tau * SR))
    g_env = np.exp(-np.arange(glen) / (tau * SR))
    for t0, a in zip(times, amps):
        s = int(t0 * SR)
        if s >= n:
            continue
        g = rng.standard_normal(glen) * g_env
        m = min(glen, n - s)
        out[s:s + m] += a * g[:m]
    out = dsp.bandpass(out, lo, hi, 2)
    return out


# ------------------------------------------------------------------------------------------------ physical building blocks
def wood_tap(f: float, dur: float, rng: np.random.Generator, ratios=(1.0, 2.4, 4.3), amps=(1.0, 0.5, 0.25), taus=(0.02, 0.012, 0.006),
             noise: float = 0.3, noise_band=(900.0, 4000.0), lp: float = 5000.0) -> np.ndarray:
    """Small knock: 2-4 inharmonic decaying partials + a tiny noise transient, rounded by a low-pass."""
    n = n_of(dur)
    x = dsp.modal([f * r for r in ratios], amps, taus, dur, attack=0.0006)
    if noise > 0:
        tr = bpn(n, rng, *noise_band) * dsp.env_exp(n, 0.003, 0.0004)
        x = x + noise * tr / (np.max(np.abs(tr)) + 1e-9)
    return dsp.lowpass(x, lp, 2)


def thud(f0: float, f1: float, dur: float, tau: float, rng: np.random.Generator, glide_tau: float = 0.03,
         noise: float = 0.35, noise_fc: float = 800.0, noise_tau: float = 0.02, attack: float = 0.002) -> np.ndarray:
    """Soft landing thud: sine with a falling pitch + low-passed noise transient."""
    n = n_of(dur)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / glide_tau)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * dsp.env_exp(n, tau, attack)
    nz = lpn(n, rng, noise_fc, 2) * dsp.env_exp(n, noise_tau, attack)
    nz = nz / (np.max(np.abs(nz)) + 1e-9)
    return body + noise * nz


def paper_tap(dur: float, rng: np.random.Generator, lo: float = 800.0, hi: float = 3200.0, tau: float = 0.014, low: float = 0.4, low_fc: float = 380.0) -> np.ndarray:
    """Soft paper 'pap': band-passed noise burst + a muffled low body."""
    n = n_of(dur)
    top = bpn(n, rng, lo, hi) * dsp.env_exp(n, tau, 0.0015)
    top /= np.max(np.abs(top)) + 1e-9
    bod = lpn(n, rng, low_fc, 2) * dsp.env_exp(n, tau * 2.4, 0.003)
    bod /= np.max(np.abs(bod)) + 1e-9
    return top + low * bod


def tine(f: float, dur: float, tau: float = 0.25, bright: float = 0.12, attack: float = 0.002, max_partial_hz: float = 9000.0) -> np.ndarray:
    """Soft kalimba-like tine: partials 1 : 5.4 (and 13 only if low enough), partials above max_partial_hz dropped (never shrill)."""
    ratios = [1.0, 2.0, 5.4, 13.0]
    amps = [1.0, 0.12, bright, bright * 0.3]
    taus = [tau, tau * 0.5, tau * 0.3, tau * 0.12]
    keep = [(f * r, a, ta) for r, a, ta in zip(ratios, amps, taus) if f * r < max_partial_hz]
    return dsp.modal([k[0] for k in keep], [k[1] for k in keep], [k[2] for k in keep], dur, attack=attack)


def pluck(f: float, dur: float, tau: float = 0.3) -> np.ndarray:
    """Warm plucked string/xylophone-ish tone: near-harmonic partials with fast-decaying upper partials."""
    return dsp.modal([f, 2 * f, 3.01 * f, 4.03 * f], [1.0, 0.45, 0.18, 0.07], [tau, tau * 0.55, tau * 0.3, tau * 0.18], dur, attack=0.0015)


def bloop(f0: float, f1: float, dur: float, tau: float, glide_tau: float = 0.03, attack: float = 0.004, harm: float = 0.0) -> np.ndarray:
    """Sine glide from f0 towards f1 with an exponential envelope (water drop = upward, sinking = downward)."""
    n = n_of(dur)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t / glide_tau)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + harm * np.sin(2 * ph)
    return x * dsp.env_exp(n, tau, attack)


def dust(total: int, rng: np.random.Generator, count: int, t0: float, t1: float, level: float = 1.0, stereo: bool = False,
         lo: float = 1300.0, hi: float = 3600.0, spread: float = 0.6, decay: bool = True) -> np.ndarray:
    """`count` tiny dust puffs (short soft noise grains) scattered between t0 and t1 seconds; optionally panned."""
    out = np.zeros((total, 2)) if stereo else np.zeros(total)
    times = np.sort(t0 + (t1 - t0) * rng.random(count) ** 1.2)
    for i, ts in enumerate(times):
        ln = n_of(0.03 + 0.02 * rng.random())
        g = bpn(ln, rng, lo * (0.8 + 0.4 * rng.random()), hi * (0.8 + 0.3 * rng.random())) * env_hump(ln, 0.004, 0.009 + 0.006 * rng.random())
        g /= np.max(np.abs(g)) + 1e-9
        amp = level * (0.35 + 0.65 * rng.random()) * (1 - 0.5 * i / max(count - 1, 1) if decay else 1.0)
        s = int(ts * SR)
        if s >= total:
            continue
        m = min(ln, total - s)
        if stereo:
            out[s:s + m] += dsp.pan(g[:m] * amp, float(rng.uniform(-spread, spread)))
        else:
            out[s:s + m] += g[:m] * amp
    return out


def cloth_flutter(n: int, rng: np.random.Generator, rate: float = 14.0, lo: float = 280.0, hi: float = 2300.0, jitter: float = 0.35,
                  sharp: float = 1.6, depth: float = 0.9, crackle_amt: float = 0.15) -> np.ndarray:
    """Fabric / wing flutter: band-passed noise gated by irregular soft pulses (+ faint paper crackle). Never breath or voice-like."""
    x = bpn(n, rng, lo, hi, 2) * flutter_mod(n, rng, rate, jitter, sharp, depth)
    x = x / (np.max(np.abs(x)) + 1e-9)
    if crackle_amt > 0:
        x = x + crackle_amt * crackle(n, rng, 90.0, 1500, 3800, 0.003)
    return x


def end_fade(x: np.ndarray, ms: float = 20.0) -> np.ndarray:
    k = min(int(ms / 1000 * SR), x.shape[0])
    if k <= 1:
        return x
    w = 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, k))
    y = x.copy()
    y[-k:] *= w if x.ndim == 1 else w[:, None]
    return y


def finish(x: np.ndarray, dur: float, fade_ms: float = 20.0, hp: float = 85.0, peak: float = 0.9, hp_order: int = 2) -> np.ndarray:
    """Pad/crop to `dur` seconds, remove sub-85 Hz energy (laptop speakers), fade the end to zero, normalise to a working peak."""
    n = n_of(dur)
    x = dsp.pad_to(np.asarray(x, dtype=float), n)
    x = dsp.highpass(x, hp, hp_order)
    x = end_fade(x, fade_ms)
    p = dsp.peak(x)
    return x * (peak / p) if p > 0 else x
