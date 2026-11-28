"""Ambience beds (seamless by construction: noise is synthesised circularly in the frequency domain, modulators are periodic).
amb.dream_wind (16 s), amb.paper_room (16 s), amb.world_air (18 s). Stereo, very quiet, no pitched content."""
import numpy as np

from common import dsp
import registry

SR = dsp.SR


def circ_noise(n, rng, lo, hi, slope=0.0):
    """Periodic band-limited noise (random phase spectrum, smooth band edges), unit RMS."""
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = 1.0
    mag = (f ** slope) / np.sqrt(1 + (lo / f) ** 4) / np.sqrt(1 + (f / hi) ** 4)
    mag[0] = 0.0
    X = mag * np.exp(2j * np.pi * rng.random(len(f)))
    x = np.fft.irfft(X, n)
    return x / (np.sqrt(np.mean(x ** 2)) + 1e-12)


def circ_mod(n, rng, cutoff, depth):
    """Periodic slow modulator in [1-depth, 1+depth] (low-passed circular noise)."""
    m = circ_noise(n, rng, 0.02, cutoff, 0.0)
    m = m / (np.max(np.abs(m)) + 1e-12)
    return 1.0 + depth * m


def _norm(x, peak):
    return x * (peak / np.max(np.abs(x)))


@registry.ambience("amb.dream_wind", "amb_dream_wind", "dream", rms_db=-34.0, kbps=40, desc="Soft airy wind with slow gentle gusts (seamless, stereo).")
def dream_wind(rng):
    n = 16 * SR
    out = np.zeros((n, 2))
    for ch in range(2):
        for lo, hi, g, cut, depth in [(110, 420, 1.0, 0.22, 0.55), (420, 1500, 0.7, 0.28, 0.65), (1500, 3400, 0.18, 0.35, 0.7)]:
            out[:, ch] += g * circ_noise(n, rng, lo, hi, -0.3) * circ_mod(n, rng, cut, depth)
        out[:, ch] *= circ_mod(n, rng, 0.12, 0.35)
    return _norm(out, 0.1)


def _rustle(rng, dur, lo=2400, hi=6500):
    n = int(dur * SR)
    t = np.arange(n) / SR
    nz = dsp.bandpass(rng.standard_normal(n), lo, hi, 2)
    crinkle = np.abs(dsp.lowpass(rng.standard_normal(n), 60, 2))
    crinkle = (crinkle / (crinkle.max() + 1e-9)) ** 1.5
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2 * np.exp(-t / (dur * 0.6))
    return nz * (0.35 + crinkle) * env


@registry.ambience("amb.paper_room", "amb_paper_room", "cover", rms_db=-35.0, kbps=40, desc="Faint room tone with a few tiny, soft paper rustles.")
def paper_room(rng):
    n = 16 * SR
    out = np.zeros((n + 2 * SR, 2))
    for ch in range(2):
        out[:n, ch] += 1.0 * circ_noise(n, rng, 70, 900, -0.5) * circ_mod(n, rng, 0.15, 0.2)
        out[:n, ch] += 0.25 * circ_noise(n, rng, 900, 3000, -0.8)
    for t0, dur, g, pan in [(2.3, 0.45, 0.22, -0.3), (6.9, 0.30, 0.16, 0.4), (7.35, 0.22, 0.12, 0.3), (11.6, 0.55, 0.20, 0.2), (14.8, 0.35, 0.15, -0.4)]:
        r = _rustle(rng, dur) * g
        i = int(t0 * SR)
        out[i:i + len(r), 0] += r * (1 - pan) / 2 * 1.4
        out[i:i + len(r), 1] += r * (1 + pan) / 2 * 1.4
    out = dsp.loop_wrap(out, n)
    return _norm(out, 0.1)


@registry.ambience("amb.world_air", "amb_world_air", "world", rms_db=-35.0, kbps=40, desc="Faint outdoor illustrated-world air with two extremely sparse pencil-hiss textures.")
def world_air(rng):
    n = 18 * SR
    out = np.zeros((n + 2 * SR, 2))
    for ch in range(2):
        out[:n, ch] += circ_noise(n, rng, 140, 2600, -0.7) * circ_mod(n, rng, 0.14, 0.3)
        out[:n, ch] += 0.12 * circ_noise(n, rng, 2600, 6500, -0.5) * circ_mod(n, rng, 0.2, 0.5)
    for t0, dur, g, pan in [(5.2, 0.55, 0.16, 0.35), (13.1, 0.42, 0.13, -0.4)]:
        m = int(dur * SR)
        t = np.arange(m) / SR
        h = dsp.bandpass(rng.standard_normal(m), 3200, 7200, 2)
        stroke = 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * (5.5 + 3 * t / dur) * t))
        h = h * stroke * np.sin(np.pi * t / dur) ** 2 * g
        i = int(t0 * SR)
        out[i:i + m, 0] += h * (1 - pan) / 2 * 1.4
        out[i:i + m, 1] += h * (1 + pan) / 2 * 1.4
    out = dsp.loop_wrap(out, n)
    return _norm(out, 0.1)
