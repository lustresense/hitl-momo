"""Shared instruments + a small sequencer/mixer for the Sketchbook Universe music generators.

Original synthesis only (numpy + scipy). No samples, no downloads, no AI audio models, no voices.
Everything is deterministic: instruments derive their RNG from (instrument, pitch, length, velocity bucket),
the sequencer draws humanisation (timing/velocity jitter) from the generator rng handed in by build_all.

Layout
  pitch helpers          mtof / N / pcs
  instruments            felt_piano, kalimba, marimba, pizz, pad, bell, celesta + percussion (shaker, brush, wood, tom, tick)
  Score / Part           note events + per-part mixer settings
  render()               events -> notes (cached) -> part FX -> warm convolution reverb -> fold (seamless loop)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from fractions import Fraction

import numpy as np
from scipy import signal

from . import dsp
from .dsp import SR

TAU = 2.0 * np.pi


# ----------------------------------------------------------------------------- pitch helpers
def mtof(m: float) -> float:
    return 440.0 * 2.0 ** ((float(m) - 69.0) / 12.0)


def N(name) -> float:
    """'C4' / 'F#3' / 60 -> midi number."""
    return dsp.midi(name)


def V(*names) -> list[float]:
    """Voicing helper: V('C3','G3','E4') -> [48, 55, 64]."""
    return [dsp.midi(n) for n in names]


def pcs(midis) -> set[int]:
    return {int(round(m)) % 12 for m in midis}


PC = {"C": 0, "C#": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def pcset(names: str) -> set[int]:
    """'C D E G A' -> {0,2,4,7,9}"""
    return {PC[n] for n in names.split()}


def _tt(n: int) -> np.ndarray:
    return np.arange(n) / SR


def _fade_out(x: np.ndarray, ms: float = 8.0) -> np.ndarray:
    k = min(len(x), int(ms / 1000 * SR))
    if k > 1:
        w = 0.5 * (1 + np.cos(np.linspace(0, np.pi, k)))
        x[-k:] *= w if x.ndim == 1 else w[:, None]
    return x


def _attack(x: np.ndarray, ms: float) -> np.ndarray:
    k = min(len(x), max(2, int(ms / 1000 * SR)))
    x[:k] *= 0.5 * (1 - np.cos(np.linspace(0, np.pi, k)))
    return x


def _finish(x: np.ndarray, fade_ms: float = 8.0) -> np.ndarray:
    x = np.asarray(x, float)
    _fade_out(x, fade_ms)
    p = float(np.max(np.abs(x)))
    return x / p if p > 0 else x


def _modal(freqs, amps, taus, n: int, attack_ms: float = 1.0, lim: float = 9000.0) -> np.ndarray:
    t = _tt(n)
    out = np.zeros(n)
    for f, a, tau in zip(freqs, amps, taus):
        if f >= lim or a <= 1e-5:
            continue
        out += a * np.sin(TAU * f * t) * np.exp(-t / tau)
    return _attack(out, attack_ms)


# ----------------------------------------------------------------------------- instruments
# signature: fn(midi, dur_s, vel, rng, **kw) -> mono array, peak ~1.0 (level comes from velocity/part gain)
def felt_piano(midi, dur, vel, rng, rel=0.3, ring=1.0, dark=1.0):
    """Soft felt piano: inharmonic additive partials, 2-string beating, slow hammer, damper release after `dur`."""
    f0 = mtof(midi)
    tau1 = float(np.clip(3.0 * 2 ** (-(midi - 48) / 15.0), 0.6, 4.2)) * ring
    n = max(int(min(dur + 5 * rel, 7.0 * tau1 + 0.4) * SR), int(0.25 * SR))
    t = _tt(n)
    kmax = int(max(1, min(14, 5200.0 // f0)))
    ks = np.arange(1, kmax + 1)
    B = 3.5e-5 * 2 ** ((midi - 40) / 13.0)
    fk = ks * f0 * np.sqrt(1 + B * ks ** 2)
    tilt = (1.05 + 0.95 * (1 - vel)) * dark
    ak = ks ** (-tilt) * (0.7 + 0.3 * np.abs(np.sin(np.pi * ks / 7.0)))
    tk = tau1 / (1 + 0.55 * (ks - 1) ** 0.95)
    out = np.zeros(n)
    for k in range(kmax):
        if fk[k] > 9000:
            break
        wob = 1.0 + 0.28 * np.cos(TAU * fk[k] * 0.00032 * t + rng.uniform(0, TAU))
        out += ak[k] * np.sin(TAU * fk[k] * t + rng.uniform(0, TAU)) * wob * np.exp(-t / tk[k])
    pk = float(np.max(np.abs(out))) + 1e-9
    out += (0.035 + 0.05 * vel) * pk * dsp.lowpass(rng.standard_normal(n), 700, 2) * np.exp(-t / 0.011) * 3.0
    _attack(out, 3.5 + 7.0 * (1 - vel))
    m = t > dur
    out[m] *= np.exp(-(t[m] - dur) / rel)
    return _finish(out, 10)


def kalimba(midi, dur, vel, rng, ring=1.0, tine=1.0):
    """Thumb piano: long sine body + short beam-mode tines (1 : 6.27 : 17.5) + tiny thumb click."""
    f0 = mtof(midi)
    T = float(np.clip(1.5 * 2 ** (-(midi - 60) / 22.0), 0.55, 2.4)) * ring
    n = int(min(6.5 * T, 6.0) * SR)
    freqs = f0 * np.array([1.0, 2.0, 6.27, 17.55])
    amps = np.array([1.0, 0.08, (0.10 + 0.14 * vel) * tine, 0.035 * vel * tine])
    out = _modal(freqs, amps, [T, 0.45 * T, 0.055, 0.018], n, 0.8, lim=8000.0)
    m = int(0.012 * SR)
    click = dsp.bandpass(rng.standard_normal(m), 1400, 5200, 2) * np.exp(-_tt(m) / 0.0022)
    out[:m] += click * (0.05 + 0.07 * vel) * float(np.max(np.abs(out)))
    return _finish(out, 12)


def marimba(midi, dur, vel, rng, ring=1.0):
    """Rosewood bar: partials 1 : 3.99 : 9.88 with woody mallet knock."""
    f0 = mtof(midi)
    T = float(np.clip(1.2 * 2 ** (-(midi - 55) / 12.0), 0.17, 2.0)) * ring
    n = int(min(6.0 * T, 3.0) * SR)
    amps = [1.0, 0.08 + 0.30 * vel, 0.02 + 0.10 * vel]
    out = _modal(f0 * np.array([1.0, 3.99, 9.88]), amps, [T, 0.26 * T, 0.085 * T], n, 1.2, lim=7500.0)
    m = int(0.03 * SR)
    knock = dsp.bandpass(rng.standard_normal(m), 900, 3400, 2) * np.exp(-_tt(m) / 0.005)
    out[:m] += knock * (0.10 + 0.16 * vel) * float(np.max(np.abs(out)))
    return _finish(out, 10)


def pizz(midi, dur, vel, rng, ring=1.0, pos=0.17):
    """Plucked string (additive, vectorised): harmonics shaped by pluck position, upper partials decay faster."""
    f0 = mtof(midi)
    tau1 = float(np.clip(0.55 * 2 ** (-(midi - 40) / 28.0), 0.15, 0.55)) * ring
    n = int(min(8.0 * tau1, 2.6) * SR)
    t = _tt(n)
    kmax = int(max(1, min(18, 4600.0 // f0)))
    ks = np.arange(1, kmax + 1)
    fk = ks * f0 * np.sqrt(1 + 2.0e-5 * ks ** 2)
    ak = (0.25 + np.abs(np.sin(np.pi * ks * pos))) / ks ** 1.1
    if f0 < 170:                       # small speakers: let harmonics 2-4 carry the pitch
        ak[1:4] *= 1.0 + 0.7 * np.clip((170 - f0) / 80, 0, 1)
    tk = tau1 / (1 + 0.85 * (ks - 1) ** 0.85)
    out = np.zeros(n)
    for k in range(kmax):
        out += ak[k] * np.sin(TAU * fk[k] * t + rng.uniform(0, 1.2)) * np.exp(-t / tk[k])
    _attack(out, 1.2)
    m = int(0.012 * SR)
    snap = dsp.highpass(rng.standard_normal(m), 1200, 2) * np.exp(-_tt(m) / 0.0025)
    out[:m] += snap * 0.07 * vel * float(np.max(np.abs(out)))
    return _finish(out, 25)


_WT: dict = {}


def _table(kind: str, kmax: int, size: int = 4096) -> np.ndarray:
    key = (kind, kmax)
    if key in _WT:
        return _WT[key]
    k = np.arange(1, kmax + 1)
    if kind == "saw":
        amp = 1.0 / k
    elif kind == "tri":
        amp = np.where(k % 2 == 1, 1.0 / k ** 2, 0.0) * (-1.0) ** ((k - 1) // 2)
    elif kind == "felt":
        amp = np.array([1.0, 0.30, 0.12, 0.05, 0.02] + [0.0] * kmax)[:kmax]
    else:
        raise ValueError(kind)
    spec = np.zeros(size // 2 + 1, complex)
    spec[k] = -1j * amp * (size / 2)
    tab = np.fft.irfft(spec, size)
    tab /= np.max(np.abs(tab))
    _WT[key] = tab
    return tab


def _read(tab: np.ndarray, phase: np.ndarray) -> np.ndarray:
    size = tab.shape[0]
    idx = (phase % 1.0) * size
    i0 = idx.astype(np.int64)
    fr = idx - i0
    return tab[i0 % size] * (1 - fr) + tab[(i0 + 1) % size] * fr


def pad(midi, dur, vel, rng, attack=1.0, release=1.6, kind="string", voices=3, spread=9.0, bright=0.65, lim=3300.0, drift=0.0010):
    """Sustained pad note: detuned band-limited wavetable voices. kind='string' (tri->saw bloom) or 'felt' (soft sine-ish)."""
    f0 = mtof(midi)
    n = int((dur + release) * SR)
    t = _tt(n)
    kmax = int(np.clip(lim // f0, 2, 120))
    out = np.zeros(n)
    bl = bright * (1 - np.exp(-t / max(attack, 0.2) * 1.5)) if kind == "string" else None
    for i in range(voices):
        c = spread * ((i - (voices - 1) / 2) / max(1.0, (voices - 1) / 2)) + rng.uniform(-1.5, 1.5)
        f = f0 * 2 ** (c / 1200)
        lfo = 1 + drift * np.sin(TAU * (0.07 + 0.045 * i) * t + rng.uniform(0, TAU))
        ph = np.cumsum(f * lfo) / SR + rng.random()
        if kind == "string":
            out += (1 - bl) * _read(_table("tri", kmax), ph) + bl * _read(_table("saw", kmax), ph)
        else:
            out += _read(_table("felt", kmax), ph)
    a = int(min(attack, 0.6 * n / SR) * SR)
    r = int(min(release, 0.6 * n / SR) * SR)
    out[:a] *= 0.5 * (1 - np.cos(np.linspace(0, np.pi, a)))
    out[n - r:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, r)))
    p = float(np.max(np.abs(out)))
    return out / p if p > 0 else out


def bell(midi, dur, vel, rng, ring=1.0, shimmer=0.35):
    """Soft bell: near-harmonic partials + a slightly detuned twin for slow shimmer."""
    f0 = mtof(midi)
    T = float(np.clip(3.0 * 2 ** (-(midi - 72) / 20.0), 1.0, 5.0)) * ring
    n = int(min(5.5 * T, 9.0) * SR)
    ratios = np.array([1.0, 2.0, 3.01, 4.17, 5.43])
    amps = np.array([1.0, 0.38, 0.17, 0.08, 0.04])
    taus = T * np.array([1.0, 0.6, 0.38, 0.22, 0.12])
    out = _modal(f0 * ratios, amps, taus, n, 2.0, lim=7000.0)
    out += shimmer * _modal(f0 * 1.0032 * ratios, amps, taus, n, 2.0, lim=7000.0)
    return _finish(out, 15)


def celesta(midi, dur, vel, rng, ring=1.0):
    f0 = mtof(midi)
    T = float(np.clip(1.5 * 2 ** (-(midi - 72) / 20.0), 0.5, 2.5)) * ring
    n = int(min(6.0 * T, 5.0) * SR)
    out = _modal(f0 * np.array([1.0, 2.0, 3.0, 5.2]), [1.0, 0.22, 0.08, 0.03 + 0.04 * vel], T * np.array([1.0, 0.5, 0.3, 0.12]), n, 1.5, lim=7000.0)
    return _finish(out, 12)


# percussion (midi = pitch of the drum/wood where it matters; v = round-robin variant)
def shaker(midi, dur, vel, rng, tone=1.0):
    n = int(0.16 * SR)
    t = _tt(n)
    x = dsp.bandpass(rng.standard_normal(n), 3800 * tone, 8200, 2)
    e = np.exp(-t / 0.03)
    _attack(e, 7.0)
    return _finish(x * e, 10)


def brush(midi, dur, vel, rng):
    n = int(0.34 * SR)
    t = _tt(n)
    x = dsp.bandpass(rng.standard_normal(n), 1500, 6500, 2)
    e = np.exp(-t / 0.085)
    _attack(e, 24.0)
    return _finish(x * e, 20)


def wood(midi, dur, vel, rng):
    f = mtof(midi)
    n = int(0.22 * SR)
    out = _modal(f * np.array([1.0, 1.52, 2.6]), [1.0, 0.4, 0.15], [0.030, 0.020, 0.010], n, 0.6, lim=7000.0)
    m = int(0.01 * SR)
    out[:m] += dsp.bandpass(rng.standard_normal(m), 1200, 4500, 2) * np.exp(-_tt(m) / 0.002) * 0.25
    return _finish(out, 10)


def tom(midi, dur, vel, rng):
    f0 = mtof(midi)
    n = int(0.75 * SR)
    t = _tt(n)
    ph = np.cumsum(f0 * (1 + 0.45 * np.exp(-t / 0.035))) / SR
    out = np.sin(TAU * ph) * np.exp(-t / 0.16)
    out += 0.3 * np.sin(TAU * ph * 1.58) * np.exp(-t / 0.05)
    _attack(out, 3.0)
    out += 0.08 * dsp.lowpass(rng.standard_normal(n), 300, 2) * np.exp(-t / 0.012)
    return _finish(out, 25)


def tick(midi, dur, vel, rng):
    f = mtof(midi)
    n = int(0.06 * SR)
    out = _modal(f * np.array([1.0, 2.0]), [1.0, 0.3], [0.0075, 0.004], n, 0.4, lim=7000.0)
    return _finish(out, 6)


INSTRUMENTS = {
    "felt": felt_piano, "kalimba": kalimba, "marimba": marimba, "pizz": pizz, "pad": pad, "bell": bell, "celesta": celesta,
    "shaker": shaker, "brush": brush, "wood": wood, "tom": tom, "tick": tick,
}
_NOISY = {"shaker", "brush", "wood", "tom", "tick"}
_VB = (0.4, 0.65, 0.9)
_NOTES: dict = {}


def note_audio(inst: str, midi: float, dur: float, vel: float, kw: dict, v: int = 0) -> np.ndarray:
    vb = min(_VB, key=lambda b: abs(b - vel))
    key = (inst, round(float(midi), 3), round(dur * 20) / 20, vb, tuple(sorted(kw.items())), v)
    x = _NOTES.get(key)
    if x is None:
        rng = dsp.rng_for("note:" + repr(key))
        x = INSTRUMENTS[inst](midi, key[2], vb, rng, **kw)
        _NOTES[key] = x
    return x


# ----------------------------------------------------------------------------- score
@dataclass
class Ev:
    part: str
    pitch: float
    beat: float
    dur: float
    vel: float
    pan: float | None = None


@dataclass
class Part:
    inst: str
    gain_db: float = 0.0
    pan: float = 0.0
    hp: float | None = 80.0
    lp: float | None = 9000.0
    send: float = 0.25
    jitter_ms: float = 8.0
    vel_var: float = 0.10
    swing: float = 0.0
    kw: dict = field(default_factory=dict)
    pan_spread: float = 0.0
    echo: tuple | None = None       # (time_beats, feedback, mix, lp_hz)
    chorus: float = 0.0
    variants: int = 1
    pitched: bool = True
    role: str = ""                  # free text: melody / harmony / bass / perc / pad


_TOK = re.compile(r"^(\[[^\]]+\]|[A-Ga-g][#b]?-?\d|r|-?\d+[ud]*)\s*:\s*([0-9./]+)(?:@([0-9.]+))?$")


class Score:
    def __init__(self, bpm: float, bars: int, bpb: int = 4):
        self.bpm, self.bars, self.bpb = bpm, bars, bpb
        self.events: list[Ev] = []

    @property
    def spb(self) -> float:
        return 60.0 / self.bpm

    @property
    def L(self) -> int:
        return int(round(self.bars * self.bpb * self.spb * SR))

    def add(self, part: str, pitch: float, beat: float, dur: float, vel: float = 0.8, pan: float | None = None):
        self.events.append(Ev(part, dsp.midi(pitch), float(beat), float(dur), float(vel), pan))

    def chord(self, part: str, pitches, beat: float, dur: float, vel: float = 0.7, strum: float = 0.0):
        for i, p in enumerate(pitches):
            self.add(part, p, beat + i * strum, dur, vel)

    def seq(self, part: str, text: str, start: float = 0.0, vel: float = 0.8, transpose: int = 0, gate: float = 1.0, voicing=None, bar_check: bool = False):
        """Mini notation: 'G4:1 A4:.5 C5:1.5@0.8 | r:1 [C4,E4]:2'. Rests 'r'. With a voicing list, bare ints index it (2u = +octave, 2d = -octave).
        Returns the beat after the last token."""
        b = start
        tot = 0.0
        for raw in text.replace("|", " ").split():
            m = _TOK.match(raw)
            if not m:
                raise ValueError(f"bad token {raw!r} in {text!r}")
            name, d, vm = m.group(1), float(Fraction(m.group(2))), m.group(3)
            v = vel * (float(vm) if vm else 1.0)
            if name != "r":
                if name.startswith("["):
                    for sub in name[1:-1].split(","):
                        self.add(part, dsp.midi(sub.strip()) + transpose, b, d * gate, v)
                elif re.match(r"^-?\d+[ud]*$", name):
                    base = int(re.match(r"-?\d+", name).group(0))
                    off = 12 * (name.count("u") - name.count("d"))
                    self.add(part, voicing[base] + off + transpose, b, d * gate, v)
                else:
                    self.add(part, dsp.midi(name) + transpose, b, d * gate, v)
            b += d
            tot += d
        if bar_check and abs(tot % self.bpb) > 1e-6:
            raise ValueError(f"phrase length {tot} not a whole number of bars: {text!r}")
        return b

    def grid(self, part: str, pattern: str, start: float, step: float, pitch: float = 0, vel: float = 0.7, accents: dict | None = None):
        """Percussion/rhythm grid: chars  X accent  x normal  g ghost  . rest ; one char per `step` beats."""
        w = {"X": 1.0, "x": 0.7, "g": 0.4}
        for i, c in enumerate(pattern.replace(" ", "")):
            if c in w:
                self.add(part, pitch, start + i * step, step, vel * w[c])


# ----------------------------------------------------------------------------- effects
def warm_ir(rt60: float, rng: np.random.Generator, predelay: float = 0.018, hi_ratio: float = 0.45) -> np.ndarray:
    """Stereo convolution IR: three bands with their own decay (highs die first = warm), soft build-up, a few early reflections."""
    n = int(rt60 * 1.2 * SR)
    t = np.arange(n) / SR
    ir = np.zeros((n, 2))
    bands = [(110, 700, 1.0, 1.0), (700, 2600, 0.8, 0.8), (2600, 6000, hi_ratio, 0.35)]
    for ch in range(2):
        for lo, hi, rr, g in bands:
            nz = dsp.bandpass(rng.standard_normal(n), lo, hi, 2)
            ir[:, ch] += g * nz * np.exp(-6.91 * t / (rt60 * rr))
        ir[:, ch] *= 1 - np.exp(-t / 0.012)
        for _ in range(6):
            pos = int((0.005 + rng.random() * 0.04) * SR)
            ir[pos, ch] += (rng.random() * 0.6 + 0.2) * (1 if rng.random() > 0.4 else -1) * np.max(np.abs(ir[:, ch])) * 0.5
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-12
    return ir


def reverb_wet(x: np.ndarray, rt60: float, rng: np.random.Generator, predelay: float = 0.018, hp: float = 180.0, lp: float = 6500.0, hi_ratio: float = 0.45) -> np.ndarray:
    ir = warm_ir(rt60, rng, predelay, hi_ratio)
    xs = dsp.lowpass(dsp.highpass(x, hp, 2), lp, 2)
    return np.stack([signal.fftconvolve(xs[:, 0], ir[:, 0]), signal.fftconvolve(xs[:, 1], ir[:, 1])], axis=1)


def echo(x: np.ndarray, time_s: float, fb: float = 0.4, mix: float = 0.3, lp: float = 3500.0, taps: int = 5, pingpong: bool = True) -> np.ndarray:
    d = int(round(time_s * SR))
    out = x.copy()
    cur = x * (mix / max(fb, 1e-6))
    for _ in range(taps):
        sh = np.zeros_like(cur)
        sh[d:] = cur[:-d] * fb
        cur = dsp.lowpass(sh, lp, 1)
        if pingpong:
            cur = cur[:, ::-1]
        out += cur
    return out


# ----------------------------------------------------------------------------- render
def _pan_gains(p: float):
    a = (float(np.clip(p, -0.95, 0.95)) + 1) * np.pi / 4
    return np.cos(a), np.sin(a)


def render(score: Score, parts: dict[str, Part], rng: np.random.Generator, rt60: float = 2.4, hi_ratio: float = 0.45, predelay: float = 0.018,
           rv_hp: float = 180.0, rv_lp: float = 6000.0, tail_s: float = 7.0, peak: float = 0.2, master_lp: float = 9500.0,
           master_hp: float = 70.0, stems: bool = False, loop: bool = True, out_len_s: float | None = None):
    """Events -> stereo loop of EXACT length score.L. Notes ringing past the end and the reverb tail are folded onto the start."""
    L = score.L
    T = L + int(tail_s * SR)
    spb = score.spb
    dry = np.zeros((T, 2))
    send = np.zeros((T, 2))
    stem_out: dict = {}
    by_part: dict[str, list[Ev]] = {}
    for ev in score.events:
        by_part.setdefault(ev.part, []).append(ev)
    for name, evs in by_part.items():
        P = parts[name]
        buf = np.zeros((T, 2))
        for i, ev in enumerate(sorted(evs, key=lambda e: e.beat)):
            beat = ev.beat
            if P.swing and abs(beat % 1.0 - 0.5) < 1e-6:
                beat += P.swing
            j = rng.uniform(-P.jitter_ms, P.jitter_ms) / 1000.0 if P.jitter_ms else 0.0
            vel = float(np.clip(ev.vel * (1 + rng.uniform(-P.vel_var, P.vel_var)), 0.05, 1.2))
            i0 = int(round((beat * spb + j) * SR))
            if loop:
                if i0 < 0:
                    i0 += L
                i0 %= L
            else:
                i0 = max(0, i0)
            x = note_audio(P.inst, ev.pitch, ev.dur * spb, vel, P.kw, (i % P.variants) if P.variants > 1 else 0)
            end = min(T, i0 + len(x))
            seg = x[: end - i0]
            if end - i0 < len(x):
                seg = _fade_out(seg.copy(), 40)
            pn = ev.pan if ev.pan is not None else P.pan + P.pan_spread * float(np.clip((ev.pitch - 72) / 12.0, -1.5, 1.5))
            gl, gr = _pan_gains(pn)
            a = vel ** 1.25
            buf[i0:end, 0] += seg * (gl * a)
            buf[i0:end, 1] += seg * (gr * a)
        if P.hp:
            buf = dsp.highpass(buf, P.hp, 2)
        if P.lp:
            buf = dsp.lowpass(buf, P.lp, 2)
        if P.echo:
            tb, fb, mx, elp = P.echo
            buf = echo(buf, tb * spb, fb, mx, elp)
        if P.chorus:
            buf = dsp.chorus(buf, rate=0.23, depth_ms=4.5, mix=P.chorus)
        g = 10 ** (P.gain_db / 20)
        buf *= g
        dry += buf
        send += buf * P.send
        if stems:
            stem_out[name] = buf
    wet = reverb_wet(send, rt60, dsp.rng_for("rv:" + str(rt60) + str(L)), predelay, rv_hp, rv_lp, hi_ratio)
    n_out = max(T, wet.shape[0])
    mix = np.zeros((n_out, 2))
    mix[:T] += dry
    mix[: wet.shape[0]] += wet
    mix = dsp.lowpass(dsp.highpass(mix, master_hp, 2), master_lp, 2)
    mix = dsp.peaking(mix, 3300, 0.9, -1.5)
    if not loop:                       # one-shot (stinger): keep the natural tail, fade the very end
        ol = out_len_s or (L / SR + tail_s)
        out = _fade_out(mix[: int(ol * SR)].copy(), 1000 * min(0.9, 0.3 * ol))   # (dsp.fade's 'cos' fade-out curve is inverted, so not used)
        return out * (peak / (float(np.max(np.abs(out))) + 1e-12))
    out = dsp.loop_wrap(mix, L)
    k = peak / (float(np.max(np.abs(out))) + 1e-12)
    out *= k
    if stems:
        return out, {n: dsp.loop_wrap(np.pad(s, ((0, 0), (0, 0))), L) * k for n, s in stem_out.items()}
    return out
