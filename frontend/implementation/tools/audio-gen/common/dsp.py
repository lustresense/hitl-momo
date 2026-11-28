"""Shared DSP toolkit for the Sketchbook Universe audio generators.

Everything here is original code (numpy + scipy only). No third-party samples, no AI audio models.
All audio is float64 at SR=48000. Mono = shape (n,), stereo = shape (n, 2).
Every generator gets an explicit numpy Generator so output is reproducible bit for bit.
"""
from __future__ import annotations

import hashlib
import numpy as np
from scipy import signal

SR = 48000
NOTE_NAMES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


# --------------------------------------------------------------------------- basics
def rng_for(name: str, salt: int = 0) -> np.random.Generator:
    """Deterministic RNG derived from an asset name."""
    h = hashlib.sha256(f"{name}:{salt}".encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))


def midi(note: str | int | float) -> float:
    """'C4' / 'F#3' / 'Bb2' / 60 -> midi number."""
    if not isinstance(note, str):
        return float(note)
    letter, rest = note[0].upper(), note[1:]
    acc = 0
    while rest and rest[0] in "#b":
        acc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + NOTE_NAMES[letter] + acc


def hz(note: str | int | float) -> float:
    return 440.0 * 2 ** ((midi(note) - 69) / 12)


def db(x: float) -> float:
    return 10 ** (x / 20)


def n_of(dur: float) -> int:
    return int(round(dur * SR))


def tt(dur: float) -> np.ndarray:
    return np.arange(n_of(dur)) / SR


def peak(x: np.ndarray) -> float:
    return float(np.max(np.abs(x))) if x.size else 0.0


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x)))) if x.size else 0.0


def pad_to(x: np.ndarray, n: int) -> np.ndarray:
    if x.shape[0] >= n:
        return x[:n]
    pad = [(0, n - x.shape[0])] + [(0, 0)] * (x.ndim - 1)
    return np.pad(x, pad)


def mix_into(dst: np.ndarray, src: np.ndarray, start: int = 0, gain: float = 1.0) -> np.ndarray:
    """Add src into dst at sample offset (grows nothing; clips to dst length). Handles mono->stereo."""
    if src.ndim == 1 and dst.ndim == 2:
        src = np.stack([src, src], axis=1)
    end = min(dst.shape[0], start + src.shape[0])
    if end > start >= 0:
        dst[start:end] += gain * src[: end - start]
    return dst


# --------------------------------------------------------------------------- envelopes
def env_exp(n: int, tau: float, attack: float = 0.002) -> np.ndarray:
    """Fast linear attack then exponential decay (tau seconds)."""
    t = np.arange(n) / SR
    e = np.exp(-t / max(tau, 1e-4))
    a = max(1, int(attack * SR))
    e[:a] *= np.linspace(0, 1, a)
    return e


def env_adsr(n: int, a: float, d: float, s: float, r: float) -> np.ndarray:
    A, D, R = int(a * SR), int(d * SR), int(r * SR)
    S = max(0, n - A - D - R)
    parts = [np.linspace(0, 1, max(A, 1), endpoint=False), np.linspace(1, s, max(D, 1), endpoint=False), np.full(S, s), np.linspace(s, 0, max(R, 1))]
    return pad_to(np.concatenate(parts), n)


def fade(x: np.ndarray, fin: float = 0.0, fout: float = 0.0, curve: str = "cos") -> np.ndarray:
    x = x.copy()
    fi, fo = int(fin * SR), int(fout * SR)
    if fi > 0:
        w = np.linspace(0, 1, fi)
        w = (1 - np.cos(np.pi * w)) / 2 if curve == "cos" else w
        x[:fi] *= w if x.ndim == 1 else w[:, None]
    if fo > 0:
        w = np.linspace(1, 0, fo)
        w = (1 - np.cos(np.pi * (1 - w))) / 2 if curve == "cos" else w
        w = w[::-1][::-1]
        x[-fo:] *= w if x.ndim == 1 else w[:, None]
    return x


# --------------------------------------------------------------------------- oscillators and noise
def sine(f: float | np.ndarray, dur: float, phase: float = 0.0) -> np.ndarray:
    n = n_of(dur)
    if np.isscalar(f):
        return np.sin(2 * np.pi * f * np.arange(n) / SR + phase)
    ph = 2 * np.pi * np.cumsum(pad_to(np.asarray(f), n)) / SR
    return np.sin(ph + phase)


def tri(f: float, dur: float) -> np.ndarray:
    return signal.sawtooth(2 * np.pi * f * tt(dur), 0.5)


def saw_bl(f: float, dur: float, partials_limit: float = 9000.0) -> np.ndarray:
    """Band-limited saw by additive synthesis (cheap enough for pads)."""
    t = tt(dur)
    k = int(min(partials_limit, SR / 2 - 200) // f)
    out = np.zeros_like(t)
    for h in range(1, max(k, 1) + 1):
        out += np.sin(2 * np.pi * f * h * t) / h
    return out * (2 / np.pi)


def white(n: int, rng: np.random.Generator) -> np.ndarray:
    return rng.standard_normal(n)


def pink(n: int, rng: np.random.Generator) -> np.ndarray:
    """1/f noise via FFT shaping, unit RMS."""
    X = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    X /= np.sqrt(f)
    x = np.fft.irfft(X, n)
    return x / (rms(x) + 1e-12)


def brown(n: int, rng: np.random.Generator) -> np.ndarray:
    x = np.cumsum(rng.standard_normal(n))
    x -= np.linspace(x[0], x[-1], n)
    return x / (rms(x) + 1e-12)


# --------------------------------------------------------------------------- filters
def _sos(kind: str, fc, order: int, btype_extra=None):
    return signal.butter(order, fc, btype=kind, fs=SR, output="sos")


def lowpass(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(_sos("lowpass", min(fc, SR / 2 - 100), order), x, axis=0)


def highpass(x: np.ndarray, fc: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(_sos("highpass", max(fc, 5.0), order), x, axis=0)


def bandpass(x: np.ndarray, lo: float, hi: float, order: int = 2) -> np.ndarray:
    return signal.sosfilt(signal.butter(order, [max(lo, 5.0), min(hi, SR / 2 - 100)], btype="bandpass", fs=SR, output="sos"), x, axis=0)


def peaking(x: np.ndarray, fc: float, q: float, gain_db: float) -> np.ndarray:
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * fc / SR
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * A, -2 * np.cos(w0), 1 - alpha * A]
    a = [1 + alpha / A, -2 * np.cos(w0), 1 - alpha / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def sweep_lowpass(x: np.ndarray, f0: float, f1: float, blocks: int = 48, order: int = 2) -> np.ndarray:
    """Time-varying low-pass (log sweep f0 -> f1) by crossfading block-filtered copies. Good enough for whooshes."""
    n = x.shape[0]
    edges = np.linspace(0, n, blocks + 1).astype(int)
    out = np.zeros_like(x)
    freqs = np.geomspace(f0, f1, blocks)
    for i in range(blocks):
        seg = lowpass(x, float(freqs[i]), order)
        w = np.zeros(n)
        w[edges[i]:edges[i + 1]] = 1.0
        w = np.convolve(w, np.hanning(max(3, (edges[1] - edges[0]) * 2 + 1)), mode="same")
        out += seg * (w if x.ndim == 1 else w[:, None])
    norm = np.zeros(n)
    for i in range(blocks):
        w = np.zeros(n); w[edges[i]:edges[i + 1]] = 1.0
        norm += np.convolve(w, np.hanning(max(3, (edges[1] - edges[0]) * 2 + 1)), mode="same")
    return out / (np.maximum(norm, 1e-9) if x.ndim == 1 else np.maximum(norm, 1e-9)[:, None])


def sweep_bandpass(x: np.ndarray, f0: float, f1: float, bw_oct: float = 1.2, blocks: int = 40) -> np.ndarray:
    n = x.shape[0]
    edges = np.linspace(0, n, blocks + 1).astype(int)
    out = np.zeros_like(x)
    norm = np.zeros(n)
    freqs = np.geomspace(f0, f1, blocks)
    for i in range(blocks):
        fc = float(freqs[i])
        seg = bandpass(x, fc / 2 ** (bw_oct / 2), fc * 2 ** (bw_oct / 2), 2)
        w = np.zeros(n); w[edges[i]:edges[i + 1]] = 1.0
        w = np.convolve(w, np.hanning(max(3, (edges[1] - edges[0]) * 2 + 1)), mode="same")
        out += seg * (w if x.ndim == 1 else w[:, None]); norm += w
    return out / (np.maximum(norm, 1e-9) if x.ndim == 1 else np.maximum(norm, 1e-9)[:, None])


# --------------------------------------------------------------------------- stereo helpers
def pan(x: np.ndarray, p: float) -> np.ndarray:
    """Equal-power pan, p in [-1, 1]."""
    ang = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(ang), x * np.sin(ang)], axis=1)


def to_stereo(x: np.ndarray) -> np.ndarray:
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def haas_widen(x: np.ndarray, ms: float = 11.0, amount: float = 0.35) -> np.ndarray:
    """Cheap widening of a mono/stereo signal (delay one side a few ms, mix)."""
    s = to_stereo(x)
    d = int(ms / 1000 * SR)
    right = np.concatenate([np.zeros(d), s[:-d, 1]]) if d else s[:, 1]
    out = s.copy()
    out[:, 1] = (1 - amount) * s[:, 1] + amount * right
    return out


# --------------------------------------------------------------------------- effects
def make_ir(rt60: float, rng: np.random.Generator, damping: float = 6000.0, predelay: float = 0.012, early: bool = True) -> np.ndarray:
    """Synthetic stereo room/plate impulse response: decaying band-limited noise + sparse early reflections."""
    n = n_of(rt60 * 1.15)
    ir = np.zeros((n, 2))
    t = np.arange(n) / SR
    for ch in range(2):
        noise = rng.standard_normal(n)
        # frequency-dependent decay: darker as time goes on
        tail = noise * np.exp(-6.91 * t / rt60)
        tail = lowpass(tail, damping, 1)
        ir[:, ch] = tail
        if early:
            for _ in range(7):
                pos = int((0.004 + rng.random() * 0.045) * SR)
                ir[pos, ch] += (rng.random() * 0.8 + 0.2) * (1 if rng.random() > 0.4 else -1)
    pd = int(predelay * SR)
    ir = np.concatenate([np.zeros((pd, 2)), ir])
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
    return ir


def reverb(x: np.ndarray, rt60: float = 1.6, wet: float = 0.25, damping: float = 5500.0, predelay: float = 0.012, rng: np.random.Generator | None = None, tail: bool = True) -> np.ndarray:
    """Convolution reverb. Output is longer than the input by the tail length when tail=True."""
    rng = rng or np.random.default_rng(1234)
    ir = make_ir(rt60, rng, damping, predelay)
    xs = to_stereo(x)
    wet_l = signal.fftconvolve(xs[:, 0], ir[:, 0])
    wet_r = signal.fftconvolve(xs[:, 1], ir[:, 1])
    w = np.stack([wet_l, wet_r], axis=1)
    out = np.zeros_like(w)
    out[: xs.shape[0]] += xs * (1 - wet * 0.5)
    out += w * wet * 1.0
    if not tail:
        out = out[: xs.shape[0]]
    return out


def delay_pingpong(x: np.ndarray, time_s: float = 0.32, feedback: float = 0.35, wet: float = 0.25, tone: float = 4500.0, repeats_tail: float = 1.5) -> np.ndarray:
    xs = to_stereo(x)
    d = int(time_s * SR)
    n = xs.shape[0] + int(repeats_tail * SR)
    out = pad_to(xs, n).copy()
    l = np.zeros(n); r = np.zeros(n)
    src = pad_to(xs.mean(axis=1), n)
    buf_l = np.zeros(n); buf_r = np.zeros(n)
    g = 1.0
    for k in range(1, 12):
        g *= feedback
        if g < 0.01 or k * d >= n:
            break
        seg = np.concatenate([np.zeros(k * d), src[: n - k * d]]) * g
        seg = lowpass(seg, tone, 1)
        (buf_l if k % 2 else buf_r)[:] += seg
    out[:, 0] += buf_l * wet
    out[:, 1] += buf_r * wet
    return out


def chorus(x: np.ndarray, rate: float = 0.35, depth_ms: float = 6.0, mix: float = 0.35, base_ms: float = 14.0) -> np.ndarray:
    xs = to_stereo(x)
    n = xs.shape[0]
    t = np.arange(n) / SR
    out = xs.copy()
    for ch, ph in ((0, 0.0), (1, np.pi / 2)):
        delay = (base_ms + depth_ms * np.sin(2 * np.pi * rate * t + ph)) / 1000 * SR
        idx = np.arange(n) - delay
        idx0 = np.clip(np.floor(idx).astype(int), 0, n - 1)
        frac = idx - np.floor(idx)
        idx1 = np.clip(idx0 + 1, 0, n - 1)
        wet = xs[idx0, ch] * (1 - frac) + xs[idx1, ch] * frac
        out[:, ch] = xs[:, ch] * (1 - mix) + wet * mix
    return out


def soft_clip(x: np.ndarray, drive: float = 1.0) -> np.ndarray:
    return np.tanh(x * drive) / np.tanh(drive)


def compressor(x: np.ndarray, thresh_db: float = -18.0, ratio: float = 3.0, attack: float = 0.008, release: float = 0.12, makeup_db: float = 0.0) -> np.ndarray:
    """Simple feed-forward peak compressor with smoothed envelope."""
    xs = x if x.ndim == 2 else x[:, None]
    lvl = np.max(np.abs(xs), axis=1)
    a = np.exp(-1 / (attack * SR)); r = np.exp(-1 / (release * SR))
    env = np.zeros_like(lvl)
    e = 0.0
    for i, v in enumerate(lvl):          # python loop is fine for our short clips; music uses block version below
        e = a * e + (1 - a) * v if v > e else r * e + (1 - r) * v
        env[i] = e
    return _apply_comp(xs, env, thresh_db, ratio, makeup_db).reshape(x.shape)


def compressor_fast(x: np.ndarray, thresh_db: float = -18.0, ratio: float = 3.0, release: float = 0.15, makeup_db: float = 0.0, block: int = 256) -> np.ndarray:
    """Block-based compressor (fast for long music renders): per-block peak -> smoothed gain."""
    xs = x if x.ndim == 2 else x[:, None]
    n = xs.shape[0]
    nb = int(np.ceil(n / block))
    pk = np.array([np.max(np.abs(xs[i * block:(i + 1) * block])) if i * block < n else 0 for i in range(nb)])
    env = np.zeros(nb); e = 0.0
    rel = np.exp(-block / (release * SR))
    for i, v in enumerate(pk):
        e = v if v > e else rel * e + (1 - rel) * v
        env[i] = e
    env_full = np.interp(np.arange(n), np.arange(nb) * block + block / 2, env)
    return _apply_comp(xs, env_full, thresh_db, ratio, makeup_db).reshape(x.shape)


def _apply_comp(xs, env, thresh_db, ratio, makeup_db):
    env_db = 20 * np.log10(np.maximum(env, 1e-9))
    over = np.maximum(env_db - thresh_db, 0.0)
    gr_db = -over * (1 - 1 / ratio)
    g = 10 ** ((gr_db + makeup_db) / 20)
    return xs * g[:, None]


def limiter(x: np.ndarray, ceiling_db: float = -1.0, lookahead_ms: float = 4.0, release_ms: float = 80.0) -> np.ndarray:
    """Look-ahead peak limiter (vectorised): gain = min(1, ceiling / peak_in_window), smoothed on release."""
    ceil = db(ceiling_db)
    xs = x if x.ndim == 2 else x[:, None]
    lvl = np.max(np.abs(xs), axis=1)
    la = max(1, int(lookahead_ms / 1000 * SR))
    from scipy.ndimage import maximum_filter1d
    win = maximum_filter1d(lvl, size=la * 2 + 1, mode="nearest")
    need = np.minimum(1.0, ceil / np.maximum(win, 1e-9))
    # smooth: instant attack (min filter already looks ahead), exponential release
    rel = np.exp(-1 / (release_ms / 1000 * SR))
    g = np.empty_like(need)
    cur = 1.0
    for i, v in enumerate(need):
        cur = v if v < cur else rel * cur + (1 - rel) * v
        g[i] = cur
    out = xs * g[:, None]
    out = np.clip(out, -ceil, ceil)
    return out.reshape(x.shape)


def normalize_peak(x: np.ndarray, target_db: float = -3.0) -> np.ndarray:
    p = peak(x)
    return x * (db(target_db) / p) if p > 0 else x


def dc_block(x: np.ndarray) -> np.ndarray:
    return signal.sosfilt(signal.butter(1, 20, btype="highpass", fs=SR, output="sos"), x, axis=0)


def loop_wrap(x: np.ndarray, loop_len: int) -> np.ndarray:
    """Make a seamless loop: take loop_len samples, fold the reverb/decay tail that rings past loop_len back onto the start."""
    head = x[:loop_len].copy()
    tail = x[loop_len:]
    m = min(tail.shape[0], loop_len)
    head[:m] += tail[:m]
    return head


# --------------------------------------------------------------------------- instruments (building blocks)
def karplus_strong(freq: float, dur: float, rng: np.random.Generator, decay: float = 0.996, bright: float = 0.5, pick_pos: float = 0.2) -> np.ndarray:
    n = n_of(dur)
    N = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, N)
    buf = lowpass(buf, 2000 + bright * 9000, 1)                  # pick brightness
    k = max(1, int(N * pick_pos))
    buf = buf - np.roll(buf, k) * 0.5                            # pick position comb
    out = np.empty(n)
    idx = 0
    for i in range(n):
        out[i] = buf[idx]
        nxt = (idx + 1) % N
        buf[idx] = decay * 0.5 * (buf[idx] + buf[nxt])
        idx = nxt
    return out / (peak(out) + 1e-9)


def modal(freqs, amps, taus, dur: float, attack: float = 0.001) -> np.ndarray:
    """Sum of exponentially decaying sines (bars, bells, tines)."""
    n = n_of(dur)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, a, tau in zip(freqs, amps, taus):
        if f < SR / 2 - 500:
            out += a * np.sin(2 * np.pi * f * t) * np.exp(-t / tau)
    at = max(1, int(attack * SR))
    out[:at] *= np.linspace(0, 1, at)
    return out / (peak(out) + 1e-9)


def fm_bell(freq: float, dur: float, ratio: float = 3.5, index: float = 3.0, tau: float = 0.6) -> np.ndarray:
    n = n_of(dur)
    t = np.arange(n) / SR
    env = np.exp(-t / tau)
    mod = np.sin(2 * np.pi * freq * ratio * t) * index * np.exp(-t / (tau * 0.5))
    out = np.sin(2 * np.pi * freq * t + mod) * env
    return out / (peak(out) + 1e-9)


def noise_burst(dur: float, rng: np.random.Generator, color: str = "white", tau: float = 0.05, attack: float = 0.001) -> np.ndarray:
    n = n_of(dur)
    src = {"white": white, "pink": pink, "brown": brown}[color](n, rng)
    return src * env_exp(n, tau, attack)
