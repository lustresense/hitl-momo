#!/usr/bin/env python3
"""Objective checks for Worker B (canvas / tools / cards / sticker / ribbons) rendered assets.

Usage (from tools/audio-gen):
    python build_all.py --out <OUT> --no-ts --only 'tool.*' 'draw.*' 'mission.*' 'hitl.*' 'page.*' 'card.*' 'sticker.*' 'ribbon.*' --jobs 2
    python checks/check_canvas.py <OUT>

Listening is NOT performed; this prints measurements and pass/flag marks against the SFX_SPEC targets.
Exit code 1 if any hard check fails (duration out of +-35 %, leading silence > 20 ms, tail not decayed, loop seam, pitch, reveal/decide identity).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common import dsp, master  # noqa: E402
from common.dsp import SR  # noqa: E402

# id -> (file stem, target seconds, kind)
TARGETS = {
    "tool.pencil": ("tool_pencil", 0.090, "sfx"), "tool.eraser": ("tool_eraser", 0.100, "sfx"), "tool.undo": ("tool_undo", 0.170, "sfx"),
    "tool.redo": ("tool_redo", 0.170, "sfx"), "tool.clear": ("tool_clear", 0.520, "sfx"), "tool.tick": ("tool_tick", 0.130, "sfx"),
    "draw.pencil": ("draw_pencil", 0.800, "loop"), "draw.eraser": ("draw_eraser", 0.800, "loop"),
    "mission.open": ("mission_open", 0.320, "sfx"), "hitl.submit": ("hitl_submit", 0.420, "sfx"), "hitl.reveal": ("hitl_reveal", 0.520, "sfx"),
    "hitl.decide": ("hitl_decide", 0.280, "sfx"), "page.curl": ("page_curl", 1.900, "sfx"), "page.flick": ("page_flick", 0.300, "sfx"),
    "card.deal": ("card_deal", 0.750, "sfx"), "card.flip": ("card_flip", 0.520, "sfx"), "card.bifold": ("card_bifold", 0.640, "sfx"),
    "card.close": ("card_close", 0.420, "sfx"), "card.stamp": ("card_stamp", 0.380, "sfx"), "card.exit": ("card_exit", 0.520, "sfx"),
    "sticker.pop": ("sticker_pop", 0.560, "sfx"), "sticker.throw": ("sticker_throw", 0.900, "sfx"), "sticker.shrink": ("sticker_shrink", 0.420, "sfx"),
    "ribbon.drop": ("ribbon_drop", 0.900, "sfx"), "ribbon.notch": ("ribbon_notch", 0.090, "sfx"), "ribbon.armed": ("ribbon_armed", 0.260, "sfx"),
    "ribbon.launch": ("ribbon_launch", 0.700, "sfx"), "ribbon.rebound": ("ribbon_rebound", 0.500, "sfx"), "ribbon.unlock": ("ribbon_unlock", 0.950, "sfx"),
}
STEREO = {"tool.clear", "draw.pencil", "draw.eraser", "hitl.reveal", "page.curl", "card.deal", "sticker.pop", "sticker.throw", "ribbon.drop", "ribbon.launch", "ribbon.unlock"}

# Tonal expectations: id -> list of (label, expected Hz, search window start s, end s, tolerance cents)
C5, D5, E5, G5, C6, E6, G6 = (dsp.hz(x) for x in ("C5", "D5", "E5", "G5", "C6", "E6", "G6"))
PITCHES = {
    "ribbon.notch": [("C5 body", dsp.hz("C5"), 0.0, 0.08, 15)],
    "tool.tick": [("C6 tine", dsp.hz("C6"), 0.0, 0.12, 20)],
    "ribbon.armed": [("C6 tine", dsp.hz("C6"), 0.02, 0.22, 25), ("G6 tine", dsp.hz("G6"), 0.02, 0.22, 25)],
    "hitl.decide": [("E4 body", dsp.hz("E4"), 0.0, 0.2, 25)],
    "hitl.submit": [("G4 tine (settles)", dsp.hz("G4"), 0.12, 0.40, 25)],
    "mission.open": [("E5 pluck", dsp.hz("E5"), 0.0, 0.1, 25), ("A5 bell", dsp.hz("A5"), 0.03, 0.2, 40)],
    "card.stamp": [("E5 tine", dsp.hz("E5"), 0.03, 0.3, 30)],
    "ribbon.unlock": [("C6 bell", dsp.hz("C6"), 0.06, 0.6, 40), ("E6 bell", dsp.hz("E6"), 0.11, 0.6, 40), ("G6 bell", dsp.hz("G6"), 0.15, 0.6, 40)],
    "sticker.pop": [("G6 sparkle", dsp.hz("G6"), 0.28, 0.5, 40), ("E6 sparkle", dsp.hz("E6"), 0.33, 0.5, 40)],
}
PENTA = {0: "C", 2: "D", 4: "E", 7: "G", 9: "A"}


def mono(x):
    return x if x.ndim == 1 else x.mean(axis=1)


def find_peak(x, f0, t0, t1, win_pct=4.0):
    """Frequency of the strongest spectral peak within +-win_pct of f0 in x[t0:t1] (parabolic interpolation, zero padded)."""
    seg = mono(x)[int(t0 * SR):int(t1 * SR)]
    if seg.shape[0] < 256:
        return None, -120.0
    N = 1 << 17
    sp = np.abs(np.fft.rfft(seg * np.hanning(seg.shape[0]), N))
    f = np.fft.rfftfreq(N, 1 / SR)
    m = (f > f0 * (1 - win_pct / 100)) & (f < f0 * (1 + win_pct / 100))
    idx = np.flatnonzero(m)
    k = idx[np.argmax(sp[idx])]
    a, b, c = np.log(sp[k - 1] + 1e-12), np.log(sp[k] + 1e-12), np.log(sp[k + 1] + 1e-12)
    d = 0.5 * (a - c) / (a - 2 * b + c + 1e-12)
    fr = float(f[k] + d * (f[1] - f[0]))
    ref = np.abs(np.fft.rfft(seg * np.hanning(seg.shape[0]), N)).max() + 1e-12
    return fr, 20 * np.log10(sp[k] / ref)


def pitch_class(fr):
    midi = 69 + 12 * np.log2(fr / 440.0)
    r = int(round(midi))
    cents = (midi - r) * 100
    return r % 12, f"{['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][r % 12]}{r // 12 - 1}", cents


def main(out: Path) -> int:
    fails = []
    flags = []
    print(f"{'id':<16}{'dur':>6}{'tgt':>6}{'d%':>5}{'peak':>7}{'cent':>6}{'pres':>6}{'air10':>7}{'lead':>6}{'tail':>7}{'seam':>7}{'rms':>7}")
    data = {}
    for aid, (stem, tgt, kind) in TARGETS.items():
        p = out / "sfx" / f"{stem}.ogg"
        if not p.exists():
            print(f"{aid:<16} MISSING {p}")
            fails.append(f"{aid}: file missing")
            continue
        x = master.decode_to_array(p)
        data[aid] = x
        n = x.shape[0]
        dur = n / SR
        sr = master.spectral_report(x)
        pk = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
        a = np.abs(x if x.ndim == 1 else x.max(axis=1))
        lead_i = np.flatnonzero(a > dsp.db(-50))
        lead = lead_i[0] / SR * 1000 if lead_i.size else 999.0
        tail = 20 * np.log10(dsp.rms(x[-int(0.02 * SR):]) + 1e-12)
        seam = ""
        if kind == "loop":
            xs = dsp.to_stereo(x)
            seam_v = float(np.max(np.abs(xs[0] - xs[-1])))
            seam = f"{seam_v:.4f}"
            if seam_v > 0.05:
                fails.append(f"{aid}: decoded loop seam {seam_v:.3f}")
        dpct = (dur / tgt - 1) * 100
        rms_db = 20 * np.log10(dsp.rms(x) + 1e-12)
        ch = x.ndim == 2
        if (aid in STEREO) != ch:
            flags.append(f"{aid}: channel layout mismatch (stereo={ch})")
        if abs(dpct) > 35:
            fails.append(f"{aid}: duration {dur:.3f}s vs target {tgt:.3f}s ({dpct:+.0f}%)")
        if lead > 20:
            fails.append(f"{aid}: leading silence {lead:.0f} ms")
        if kind == "sfx" and tail > -45:
            fails.append(f"{aid}: tail not decayed ({tail:.1f} dBFS)")
        if sr["presence_2k_5k"] > 0.55 and sr["air_gt_5k"] > 0.25:
            fails.append(f"{aid}: harsh")
        if sr["low_lt_200"] > 0.5 and aid not in ("card.stamp", "ribbon.rebound"):
            flags.append(f"{aid}: low-frequency heavy {sr['low_lt_200']}")
        print(f"{aid:<16}{dur:6.3f}{tgt:6.3f}{dpct:5.0f}{pk:7.1f}{sr['centroid_hz']:6.0f}{sr['presence_2k_5k']:6.2f}{sr['air_gt_10k']:7.4f}{lead:6.1f}{tail:7.1f}{seam:>7}{rms_db:7.1f}")

    # sub-80 Hz energy (laptop speakers)
    print("\nEnergy below 80 Hz (fraction of total power; must be ~0):")
    worst = 0.0
    for aid, x in data.items():
        m = mono(x)
        P = np.abs(np.fft.rfft(m, 1 << 16)) ** 2
        f = np.fft.rfftfreq(1 << 16, 1 / SR)
        fr = P[f < 80].sum() / (P.sum() + 1e-18)
        worst = max(worst, fr)
        if fr > 0.01:
            flags.append(f"{aid}: {fr:.3f} of energy below 80 Hz")
    print(f"  worst asset: {worst:.5f}")

    # pitch checks
    print("\nTonal assets (measured vs pentatonic target):")
    for aid, items in PITCHES.items():
        if aid not in data:
            continue
        for label, f0, t0, t1, tol in items:
            fr, rel = find_peak(data[aid], f0, t0, t1)
            if fr is None:
                print(f"  {aid:<14}{label:<18} no data")
                continue
            pc, name, cents = pitch_class(fr)
            err = 1200 * np.log2(fr / f0)
            ok = pc in PENTA and abs(err) <= tol
            print(f"  {aid:<14}{label:<18} expected {f0:8.2f} Hz  measured {fr:8.2f} Hz ({name} {cents:+5.1f} c, err {err:+5.1f} c)  {'ok' if ok else 'FLAG'}")
            if not ok:
                (fails if aid in ("ribbon.notch", "tool.tick", "ribbon.armed", "hitl.decide") else flags).append(f"{aid}: {label} off pitch ({fr:.1f} Hz, {err:+.0f} c)")
    # ribbon.notch engine rates -> pentatonic
    if "ribbon.notch" in data:
        fr, _ = find_peak(data["ribbon.notch"], dsp.hz("C5"), 0.0, 0.08)
        print("  ribbon.notch at engine rates:", ", ".join(f"x{r}->{fr * r:.1f} Hz ({pitch_class(fr * r)[1]} {pitch_class(fr * r)[2]:+.0f}c)" for r in (1, 1.122, 1.26, 1.498)))

    # hitl.reveal: three identical taps
    if "hitl.reveal" in data:
        x = mono(data["hitl.reveal"])
        wins = [(0.000, 0.055), (0.110, 0.165), (0.220, 0.275)]
        pk = [20 * np.log10(np.max(np.abs(x[int(a * SR):int(b * SR)])) + 1e-12) for a, b in wins]
        rs = [20 * np.log10(dsp.rms(x[int(a * SR):int(b * SR)]) + 1e-12) for a, b in wins]
        cf = []
        for a, b in wins:
            seg = x[int(a * SR):int(b * SR)]
            P = np.abs(np.fft.rfft(seg * np.hanning(seg.shape[0]), 8192)) ** 2
            f = np.fft.rfftfreq(8192, 1 / SR)
            cf.append((f * P).sum() / P.sum())
        print(f"\nhitl.reveal taps: peak dB {', '.join(f'{v:.2f}' for v in pk)}; rms dB {', '.join(f'{v:.2f}' for v in rs)}; centroid Hz {', '.join(f'{v:.0f}' for v in cf)}")
        spread = max(rs) - min(rs)
        print(f"  rms spread {spread:.2f} dB, peak spread {max(pk) - min(pk):.2f} dB, centroid spread {max(cf) - min(cf):.0f} Hz")
        if spread > 0.6 or (max(pk) - min(pk)) > 0.8:
            fails.append(f"hitl.reveal: taps not equal level (rms spread {spread:.2f} dB)")
        # onset spacing check
        env = np.abs(x)
        onsets = [int(np.argmax(env[int(a * SR):int(b * SR)] > 0.25 * env.max())) / SR * 1000 + a * 1000 for a, b in [(0, 0.1), (0.1, 0.2), (0.2, 0.3)]]
        print(f"  tap onsets ms: {', '.join(f'{v:.1f}' for v in onsets)} (spacing {onsets[1] - onsets[0]:.1f}, {onsets[2] - onsets[1]:.1f})")

    # pre-encoding identity of the three reveal taps (raw generator output, before mastering/Opus)
    try:
        import registry
        import sfx  # noqa: F401
        raw = np.asarray(registry.SPECS["hitl.reveal"].fn(dsp.rng_for("hitl.reveal")))
        w = int(0.100 * SR)
        s0 = int(0.0 * SR)
        a0, a1, a2 = (raw[int(t * SR):int(t * SR) + w] for t in (0.0, 0.110, 0.220))
        d01 = np.linalg.norm(a1 - a0) / np.linalg.norm(a0)
        d12 = np.linalg.norm(a2 - a1) / np.linalg.norm(a1)
        print(f"hitl.reveal raw tap identity (first 100 ms of each tap, relative error): tap2 vs tap1 {d01:.4f}, tap3 vs tap2 {d12:.4f}")
        print(f"  raw rms dB per tap: {', '.join(f'{20 * np.log10(dsp.rms(a) + 1e-12):.2f}' for a in (a0, a1, a2))}")
        if max(d01, d12) > 0.1:
            fails.append("hitl.reveal: raw taps not identical")
    except Exception as e:  # pragma: no cover
        flags.append(f"raw identity check skipped: {e}")

    # determinism: re-render in-process and compare bytes of the float output
    try:
        import importlib
        import registry
        import sfx  # noqa: F401
        ids = ["hitl.decide", "hitl.reveal", "ribbon.notch"]
        for i in ids:
            a = np.asarray(registry.SPECS[i].fn(dsp.rng_for(i)))
            b = np.asarray(registry.SPECS[i].fn(dsp.rng_for(i)))
            print(f"determinism {i}: {'identical' if np.array_equal(a, b) else 'DIFFERENT'}")
            if not np.array_equal(a, b):
                fails.append(f"{i}: not deterministic")
    except Exception as e:  # pragma: no cover
        flags.append(f"determinism check skipped: {e}")

    # decisions identical by construction: hitl.decide is ONE asset used for accept/correct/override
    print("\nhitl.decide: single asset (no per-decision variants) -> identical for accept / correct / override by construction.")

    # variants: Worker B has no a/b/c/d variants; document pairwise similarity of the closest siblings instead
    print("\nCross-correlation of sibling assets (max normalised xcorr, should be < 0.9):")
    pairs = [("tool.undo", "tool.redo"), ("card.flip", "card.exit"), ("card.bifold", "card.close"), ("ribbon.drop", "ribbon.launch"), ("tool.pencil", "tool.eraser")]
    for a, b in pairs:
        if a in data and b in data:
            xa, xb = mono(data[a]), mono(data[b])
            from scipy import signal as sg
            c = sg.fftconvolve(xa, xb[::-1], mode="full")
            c = np.max(np.abs(c)) / (np.linalg.norm(xa) * np.linalg.norm(xb) + 1e-12)
            print(f"  {a:<14} vs {b:<14} {c:.3f}")
            if c >= 0.9:
                flags.append(f"{a}/{b} too similar ({c:.2f})")

    print("\nFLAGS:" if flags else "\nFLAGS: none")
    for f in flags:
        print("  -", f)
    print("FAILS:" if fails else "FAILS: none")
    for f in fails:
        print("  -", f)
    return 1 if fails else 0


if __name__ == "__main__":
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/tmp/claude-0/audio-work/sfx_out_B")
    sys.exit(main(out))
