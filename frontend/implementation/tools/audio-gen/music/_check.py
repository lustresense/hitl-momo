#!/usr/bin/env python3
"""Objective QA for the music loops (we cannot listen, so we measure). Import-safe (nothing runs on import).

  python music/_check.py [--ogg DIR] [--stems] [--only bgm.l1 ...]

For every bgm.* loop it reads the Opus file that build_all.py wrote (default /tmp/claude-0/audio-work/music_out/music), decodes it
(what the browser gets) and prints a table: exact loop length vs the score, loop seam jump and seam click ratio, full-length spectral centroid,
2-5 kHz and >10 kHz energy fractions, peak / crest, L/R correlation, quietest bar, note onsets per bar (from the score) and the LUFS from the manifest.
Score-level checks: every pitched note must belong to the track's pitch-class set (exceptions documented in the Track), and a simple
clash detector lists simultaneous minor-2nd / minor-9th pairs between different parts. --stems renders the parts separately and prints their level
relative to the mix. Exit code 1 when a hard limit is broken.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common import dsp, master, instr_music as im  # noqa: E402
import registry  # noqa: E402

LIM = dict(centroid=2600.0, presence=0.30, air10=0.01, peak=0.99, seam=0.02, tp=-1.5)


def full_spectrum(x: np.ndarray) -> dict:
    m = x.mean(axis=1)
    seg = 1 << 16
    P = None
    n = 0
    for i in range(0, len(m) - seg, seg // 2):
        s = np.abs(np.fft.rfft(m[i:i + seg] * np.hanning(seg))) ** 2
        P = s if P is None else P + s
        n += 1
    f = np.fft.rfftfreq(seg, 1 / dsp.SR)
    tot = P.sum() + 1e-18
    return dict(centroid=float((f * P).sum() / tot), presence=float(P[(f >= 2000) & (f < 5000)].sum() / tot), air10=float(P[f >= 10000].sum() / tot),
                low=float(P[f < 200].sum() / tot))


def seam_click(x: np.ndarray) -> float:
    """Ratio of the high-passed (>3 kHz) peak within +-3 ms of the loop seam to the 99.9th percentile elsewhere (~1 = no click)."""
    h = dsp.highpass(np.concatenate([x[-2400:], x[:2400]]).mean(axis=1), 3000, 2)
    ref = dsp.highpass(x.mean(axis=1), 3000, 2)
    ref_p = np.percentile(np.abs(ref[48000:-48000]), 99.9) + 1e-9
    k = 2400
    return float(np.max(np.abs(h[k - 144:k + 144])) / ref_p)


def per_bar_rms_db(x: np.ndarray, bar_samples: float, bars: int) -> list[float]:
    out = []
    for b in range(bars):
        seg = x[int(b * bar_samples):int((b + 1) * bar_samples)]
        out.append(20 * np.log10(dsp.rms(seg) + 1e-9))
    return out


def clashes(track) -> list[str]:
    ev = [(e, track.parts[e.part]) for e in track.score.events if track.parts[e.part].pitched]
    ev.sort(key=lambda t: t[0].beat)
    out = []
    for i, (a, pa) in enumerate(ev):
        for b, pb in ev[i + 1:]:
            if b.beat >= a.beat + a.dur - 0.5:
                break
            if a.part == b.part or min(a.dur, b.dur) < 0.75:
                continue
            d = abs(a.pitch - b.pitch)
            if d in (1.0, 13.0):
                out.append(f"beat {b.beat:g}: {a.part}:{a.pitch:g} vs {b.part}:{b.pitch:g}")
    return out


def pitch_report(track) -> tuple[list[str], int]:
    bad = []
    n = 0
    for e in track.score.events:
        if not track.parts[e.part].pitched:
            continue
        n += 1
        allowed = track.sets.get(e.part, track.allowed)
        if int(round(e.pitch)) % 12 not in allowed:
            bad.append(f"{e.part} {e.pitch:g}@{e.beat:g}")
    return bad, n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ogg", default="/tmp/claude-0/audio-work/music_out")
    ap.add_argument("--stems", action="store_true")
    ap.add_argument("--only", nargs="*", default=[])
    a = ap.parse_args()
    import music  # noqa: F401  (registers specs and score builders)
    from music.theme import BUILDERS
    mf = json.loads((Path(a.ogg) / "manifest.json").read_text())
    lufs = {r["id"]: r for r in mf["assets"]}
    ids = sorted(i for i in registry.SPECS if registry.SPECS[i].kind == "music" and (not a.only or i in a.only))
    hard = 0
    print(f"{'id':<13}{'len(s)':>7}{'exact':>6}{'seam':>7}{'click':>6}{'cent':>6}{'2-5k':>7}{'>10k':>7}{'peak':>6}{'crest':>6}{'LRcor':>6}{'minbar':>7}{'edge':>6}{'ons/bar':>8}{'LUFS':>7}{'tp':>6}{'KB':>5}")
    notes = []
    for sid in ids:
        spec = registry.SPECS[sid]
        tr = BUILDERS[sid]()
        f = Path(a.ogg) / "music" / f"{spec.file}.ogg"
        x = master.decode_to_array(f)
        L = tr.score.L
        exact = x.shape[0] == L
        seam = float(np.max(np.abs(x[0] - x[-1])))
        w = np.concatenate([x[-8:], x[:8]])
        slope = float(np.max(np.abs(np.diff(w, axis=0))))
        click = seam_click(x)
        sp = full_spectrum(x)
        pk = float(np.max(np.abs(x)))
        crest = 20 * np.log10(pk / (dsp.rms(x) + 1e-9))
        cor = float(np.corrcoef(x[:, 0], x[:, 1])[0, 1])
        edge = 20 * np.log10(max(dsp.rms(x[:4800]), dsp.rms(x[-4800:])) + 1e-9)
        bars = per_bar_rms_db(x, L / tr.score.bars, tr.score.bars)
        pitched_on = sum(1 for e in tr.score.events if tr.parts[e.part].pitched and tr.parts[e.part].role in ("melody", "harmony", "sparkle"))
        r = lufs[sid]
        print(f"{sid:<13}{L / dsp.SR:>7.2f}{'yes' if exact else 'NO':>6}{seam:>7.4f}{click:>6.1f}{sp['centroid']:>6.0f}{sp['presence']:>7.3f}{sp['air10']:>7.4f}{pk:>6.2f}{crest:>6.1f}{cor:>6.2f}{min(bars):>7.1f}{edge:>6.1f}{pitched_on / tr.score.bars:>8.1f}{r['lufsI']:>7.1f}{r['truePeakDb']:>6.1f}{r['bytes'] // 1024:>5}")
        if not exact or seam > max(LIM["seam"], 4 * slope) or sp["centroid"] > LIM["centroid"] or sp["presence"] > LIM["presence"] or sp["air10"] > LIM["air10"] or pk > LIM["peak"] or r["truePeakDb"] > LIM["tp"]:
            hard += 1
            notes.append(f"{sid}: HARD LIMIT broken")
        bad, n = pitch_report(tr)
        notes.append(f"{sid}: {n} pitched notes, {len(bad)} outside {sorted(tr.allowed)}" + (f" -> {bad[:6]}" if bad else "") + (f"  [documented: {tr.exceptions}]" if tr.exceptions else ""))
        cl = clashes(tr)
        if cl:
            notes.append(f"{sid}: {len(cl)} m2/m9 overlaps (>=0.75 beat) : {cl[:8]}")
        if a.stems:
            out, st = im.render(tr.score, tr.parts, dsp.rng_for(sid), stems=True, **tr.render)
            def p95(v, w=9600):
                m = v[: len(v) // w * w].reshape(-1, w, 2)
                return float(np.percentile(np.sqrt((m ** 2).mean(axis=(1, 2))), 95)) + 1e-12
            tot = p95(out)
            rel = ", ".join(f"{k} {20 * np.log10(p95(v) / tot):.1f}" for k, v in st.items())
            notes.append(f"{sid}: stem in-note level (p95 of 200 ms RMS) dB vs mix: {rel}")
    print()
    print("\n".join(notes))
    print(f"\n{'ALL LIMITS OK' if not hard else str(hard) + ' track(s) broke a hard limit'}")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
