"""Helper DSP for the canvas / tools / cards / ribbons SFX (Worker B).

Original code (numpy + scipy). Everything is vectorised; the only Python loops run over events (a few dozen at most).
All functions take an explicit numpy Generator so renders are deterministic. Mono = (n,), stereo = (n, 2).
"""
from __future__ import annotations

import numpy as np
from scipy import signal

from . import dsp
from .dsp import SR, n_of

# --------------------------------------------------------------------------- tiny utilities


def clean(x: np.ndarray, hp: float = 90.0) -> np.ndarray:
    """Laptop-speaker hygiene: nothing below ~hp Hz."""
    return dsp.highpass(x, hp, 2)


def fit(x: np.ndarray, dur: float, fade_ms: float = 14.0) -> np.ndarray:
    """Pad/cut to exactly dur seconds and fade the last fade_ms so nothing is cut mid-ring."""
    n = n_of(dur)
    x = dsp.pad_to(x, n).copy()
    f = min(n, int(fade_ms / 1000 * SR))
    if f > 0:
        w = np.linspace(1, 0, f) ** 1.5
        x[-f:] *= w if x.ndim == 1 else w[:, None]
    return x


def put(dst: np.ndarray, src: np.ndarray, t: float, gain: float = 1.0) -> np.ndarray:
    """Add src into dst at time t (seconds). Mono src into stereo dst is duplicated to both channels."""
    return dsp.mix_into(dst, src, int(round(t * SR)), gain)


def put_pan(dst: np.ndarray, src: np.ndarray, t: float, p: float, gain: float = 1.0) -> np.ndarray:
    """Add a mono src to a stereo dst at time t with equal-power pan p in [-1, 1]."""
    return dsp.mix_into(dst, dsp.pan(src, p), int(round(t * SR)), gain)


def env_pts(n: int, pts, power: float = 1.0) -> np.ndarray:
    """Piecewise-linear envelope through (time_s, value) points (values held at the ends); optional power curve."""
    ts = [p[0] for p in pts]
    vs = [p[1] for p in pts]
    e = np.interp(np.arange(n) / SR, ts, vs)
    return np.maximum(e, 0.0) ** power if power != 1.0 else e


def swell_env(n: int, t_peak: float, tau: float, a_pow: float = 2.0) -> np.ndarray:
    """Rise (sin^a_pow) to a peak at t_peak, then exponential decay with time constant tau."""
    t = np.arange(n) / SR
    up = np.sin(0.5 * np.pi * np.clip(t / max(t_peak, 1e-4), 0, 1)) ** a_pow
    down = np.where(t > t_peak, np.exp(-(t - t_peak) / max(tau, 1e-4)), 1.0)
    return up * down


def band_noise(n: int, rng: np.random.Generator, lo: float, hi: float, order: int = 2, color: str = "white") -> np.ndarray:
    src = {"white": dsp.white, "pink": dsp.pink}[color](n, rng)
    return dsp.bandpass(src, lo, hi, order)


def warp_phase(rate: np.ndarray) -> np.ndarray:
    """Instantaneous frequency array (Hz) -> phase in radians."""
    return 2 * np.pi * np.cumsum(rate) / SR


def glide_sine(f: np.ndarray, phase: float = 0.0) -> np.ndarray:
    return np.sin(warp_phase(f) + phase)


# --------------------------------------------------------------------------- struck / plucked bodies


def wood(f: float, rng: np.random.Generator, dur: float = 0.09, ratios=(1.0, 2.4, 4.1), amps=(1.0, 0.45, 0.2), taus=(0.02, 0.012, 0.006), lp: float = 5000.0, click: float = 0.15, click_band=(2200.0, 5000.0), click_tau: float = 0.0025) -> np.ndarray:
    """Soft wooden tick/knock: inharmonic modal body + a very small band-passed noise transient, rounded by a low-pass."""
    n = n_of(dur)
    body = dsp.modal([f * r for r in ratios], amps, taus, dur, attack=0.0008)
    if click > 0:
        cl = band_noise(n, rng, *click_band) * dsp.env_exp(n, click_tau, 0.0003)
        cl /= dsp.peak(cl) + 1e-9
        body = body + click * cl
    return dsp.lowpass(body, lp, 2)


def tine(f: float, dur: float, tau: float = 0.2, kind: str = "kalimba") -> np.ndarray:
    """Soft tine. kalimba: 1 : 5.4 : 13, marimba: 1 : 4 : 10. Upper partials decay faster."""
    r = (1.0, 5.4, 13.0) if kind == "kalimba" else (1.0, 4.0, 10.0)
    return dsp.modal([f * r[0], f * r[1], f * r[2]], [1.0, 0.10, 0.025], [tau, tau * 0.28, tau * 0.12], dur, attack=0.0012)


def sparkle(f: float, dur: float, tau: float = 0.12) -> np.ndarray:
    """Very small glassy tine (pure partial plus a faint octave)."""
    return dsp.modal([f, f * 2.0], [1.0, 0.12], [tau, tau * 0.4], dur, attack=0.0015)


# --------------------------------------------------------------------------- paper


def grains(dur: float, rng: np.random.Generator, times, amps, centers, bw_oct: float = 1.3, glen=(0.004, 0.012), pans=None, n_bands: int = 6) -> np.ndarray:
    """Crackle / crumple: short windowed slices of band-limited noise at the given event times.

    centers: scalar or per-event centre frequency (snapped to n_bands log-spaced noise beds, so each event has its own colour).
    pans: None -> mono result; array of per-event pan values -> stereo result.
    """
    n = n_of(dur)
    times = np.asarray(times, float)
    amps = np.broadcast_to(np.asarray(amps, float), times.shape)
    centers = np.broadcast_to(np.asarray(centers, float), times.shape)
    lo_c, hi_c = float(centers.min()), float(centers.max())
    bed_f = np.geomspace(lo_c, hi_c, n_bands) if hi_c > lo_c * 1.02 else np.array([lo_c])
    beds = [band_noise(n, rng, fc / 2 ** (bw_oct / 2), fc * 2 ** (bw_oct / 2)) for fc in bed_f]
    out = np.zeros((n, 2)) if pans is not None else np.zeros(n)
    gl = glen if isinstance(glen, (tuple, list)) else (glen, glen)
    for i, (t, a, c) in enumerate(zip(times, amps, centers)):
        k = int(np.argmin(np.abs(bed_f - c)))
        L = max(8, int(rng.uniform(*gl) * SR))
        s0 = int(t * SR)
        if s0 >= n:
            continue
        L = min(L, n - s0)
        w = np.exp(-np.arange(L) / (L / 3.0))
        w[: min(L, 20)] *= np.linspace(0, 1, min(L, 20))
        g = beds[k][s0:s0 + L] * w * a
        if pans is None:
            out[s0:s0 + L] += g
        else:
            out[s0:s0 + L] += dsp.pan(g, float(pans[i]))
    return out


def crumple_times(rng: np.random.Generator, dur: float, count: int, skew: float = 1.0) -> np.ndarray:
    """Event times in [0, dur); skew > 1 packs events early (crumple dying out), < 1 packs them late."""
    u = np.sort(rng.random(count))
    return (u ** skew) * dur


def swish(dur: float, rng: np.random.Generator, f0: float, f1: float, bw_oct: float = 1.6, t_peak: float = 0.04, tau: float = 0.08, a_pow: float = 1.5, blocks: int = 32, color: str = "pink") -> np.ndarray:
    """Soft paper swish: noise -> swept band-pass -> swell/decay envelope."""
    n = n_of(dur)
    src = dsp.pink(n, rng) if color == "pink" else dsp.white(n, rng)
    y = dsp.sweep_bandpass(src, f0, f1, bw_oct=bw_oct, blocks=blocks)
    return y * swell_env(n, t_peak, tau, a_pow)


def flutter(dur: float, rng: np.random.Generator, rate0: float, rate1: float, lo: float = 1400.0, hi: float = 3600.0, depth: float = 0.85, jitter: float = 0.18, env=None) -> np.ndarray:
    """Paper flutter: band-passed noise gated by raised pulses at rate0 -> rate1 Hz (with random jitter). Not breath-like: pulses are crisp."""
    n = n_of(dur)
    t = np.arange(n) / SR
    rate = np.linspace(rate0, rate1, n)
    rate = rate * (1 + jitter * dsp.lowpass(rng.standard_normal(n), 8.0, 1) * 3.0)
    ph = warp_phase(np.maximum(rate, 1.0)) + rng.uniform(0, 2 * np.pi)
    pulse = (0.5 + 0.5 * np.sin(ph)) ** 2.2
    am = (1 - depth) + depth * pulse
    x = band_noise(n, rng, lo, hi) * am
    if env is not None:
        x = x * env
    return x


def rustle(dur: float, rng: np.random.Generator, lo: float = 250.0, hi: float = 900.0, rate: float = 22.0, depth: float = 0.6) -> np.ndarray:
    """Low paper rustle: band-limited noise with irregular slow-ish AM."""
    n = n_of(dur)
    m = dsp.lowpass(rng.standard_normal(n), rate, 2)
    m = m / (m.std() + 1e-9)
    am = np.exp(depth * m)
    return band_noise(n, rng, lo, hi) * am / np.exp(depth * depth / 2)


def pan_curve(x: np.ndarray, p: np.ndarray) -> np.ndarray:
    """Per-sample equal-power pan (p array in [-1, 1]) of a mono signal -> stereo."""
    ang = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([x * np.cos(ang), x * np.sin(ang)], axis=1)


def decorrelated(make, rng: np.random.Generator) -> np.ndarray:
    """Call make(rng) twice with independent noise to get an uncorrelated stereo pair (n, 2)."""
    a = make(rng)
    b = make(rng)
    n = min(a.shape[0], b.shape[0])
    return np.stack([a[:n], b[:n]], axis=1)


def thud(f0: float, f1: float, dur: float, tau: float, rng: np.random.Generator, noise: float = 0.25, lp: float = 700.0) -> np.ndarray:
    """Soft thump: falling sine plus lowpassed noise burst."""
    n = n_of(dur)
    f = np.linspace(f0, f1, n)
    s = glide_sine(f) * dsp.env_exp(n, tau, 0.0015)
    nz = dsp.lowpass(dsp.white(n, rng), lp, 2) * dsp.env_exp(n, tau * 0.45, 0.0006)
    nz /= dsp.peak(nz) + 1e-9
    return s + noise * nz


# --------------------------------------------------------------------------- periodic (seamless loop) material


def periodic_noise(L: int, rng: np.random.Generator, lo: float, hi: float, order: int = 2) -> np.ndarray:
    """Exactly periodic (period L samples) band-limited noise built in the frequency domain; unit RMS."""
    f = np.fft.rfftfreq(L, 1 / SR)
    f[0] = 1e-3
    mag = 1.0 / np.sqrt(1.0 + (lo / f) ** (2 * order)) / np.sqrt(1.0 + (f / hi) ** (2 * order))
    ph = rng.uniform(0, 2 * np.pi, f.shape[0])
    X = mag * np.exp(1j * ph)
    X[0] = 0
    x = np.fft.irfft(X, L)
    return x / (dsp.rms(x) + 1e-12)


def periodic_filter(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    """Circular (zero-phase) band-pass of an already periodic signal."""
    L = x.shape[0]
    f = np.fft.rfftfreq(L, 1 / SR)
    f[0] = 1e-3
    mag = 1.0 / np.sqrt(1.0 + (lo / f) ** (2 * order)) / np.sqrt(1.0 + (f / hi) ** (2 * order))
    return np.fft.irfft(np.fft.rfft(x) * mag, L)


def quiet_seam(chans: list[np.ndarray], win: int = 96) -> int:
    """Rotation offset k so that the seam (between sample k-1 and k of the periodic signal) sits where all channels are
    locally quiet and smooth. Rolling a periodic loop does not change what is heard, but it makes the decoded loop jump tiny."""
    L = chans[0].shape[0]
    e = np.zeros(L)
    for c in chans:
        e += np.convolve(np.concatenate([c[-win:], c, c[:win]]) ** 2, np.ones(2 * win), mode="valid")[:L]
    # also require both samples adjacent to the seam to be small
    adj = np.zeros(L)
    for c in chans:
        adj += c ** 2 + np.roll(c, 1) ** 2
    score = e + 40.0 * adj * win
    return int(np.argmin(score))
