#!/usr/bin/env python3
"""Objective checks for Worker A assets (interface, NUI feedback, bubbles). Listening was NOT performed.

Usage (from tools/audio-gen):
  python build_all.py --out OUT --no-ts --only 'ui.*' 'sys.*' 'bubble.*' 'nui.*' --jobs 2
  python checks/check_ui.py OUT            # exit code 1 when a hard check fails
Hard checks: duration within +-35 % of spec, leading silence <= 20 ms, tail decayed, loop seam, variants distinct (xcorr < 0.9),
measured note pitches within 35 cents of the nominal ones, nominal pitches pentatonic (documented exceptions listed below).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from scipy import signal

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from common import dsp, master  # noqa: E402
from common.dsp import SR  # noqa: E402

# id -> (file stem, target seconds, kind)
ASSETS = {
    "ui.tap_a": ("ui_tap_a", 0.070, "sfx"), "ui.tap_b": ("ui_tap_b", 0.070, "sfx"),
    "ui.toggle_on": ("ui_toggle_on", 0.130, "sfx"), "ui.toggle_off": ("ui_toggle_off", 0.100, "sfx"),
    "ui.denied": ("ui_denied", 0.240, "sfx"), "ui.notice": ("ui_notice", 0.200, "sfx"),
    "ui.ring_in": ("ui_ring_in", 0.170, "sfx"), "ui.morph": ("ui_morph", 0.450, "sfx"), "ui.skip": ("ui_skip", 0.110, "sfx"),
    "sys.hiccup": ("sys_hiccup", 0.520, "sfx"), "sys.ready": ("sys_ready", 0.650, "sfx"),
    "bubble.show_a": ("bubble_show_a", 0.150, "sfx"), "bubble.show_b": ("bubble_show_b", 0.150, "sfx"),
    "nui.lit": ("nui_lit", 0.060, "sfx"), "nui.hold": ("nui_hold", 0.900, "loop"), "nui.commit": ("nui_commit", 0.260, "sfx"),
    "nui.release": ("nui_release", 0.150, "sfx"), "nui.track_lost": ("nui_track_lost", 0.380, "sfx"), "nui.track_found": ("nui_track_found", 0.380, "sfx"),
}
VARIANTS = [("ui.tap_a", "ui.tap_b"), ("bubble.show_a", "bubble.show_b"), ("nui.track_lost", "nui.track_found"), ("ui.toggle_on", "ui.toggle_off"), ("ui.ring_in", "bubble.show_a")]

PENTA = {"C", "D", "E", "G", "A"}
NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
# id -> [(start_s, win_s, nominal_hz, note_name)]  segments in which the dominant partial is measured
TONES = {
    "ui.toggle_on": [(0.002, 0.050, dsp.hz("E5"), "E5"), (0.062, 0.050, dsp.hz("G5"), "G5")],
    "ui.toggle_off": [(0.002, 0.070, dsp.hz("C5"), "C5")],
    "ui.notice": [(0.030, 0.150, dsp.hz("A5"), "A5")],
    "sys.hiccup": [(0.005, 0.120, dsp.hz("E5"), "E5"), (0.145, 0.120, dsp.hz("C5"), "C5"), (0.290, 0.150, dsp.hz("G4"), "G4")],
    "sys.ready": [(0.005, 0.100, dsp.hz("C5"), "C5"), (0.120, 0.100, dsp.hz("E5"), "E5"), (0.235, 0.150, dsp.hz("G5"), "G5")],
    "nui.lit": [(0.002, 0.050, dsp.hz("G5"), "G5")],
    "nui.commit": [(0.030, 0.050, dsp.hz("G5"), "G5"), (0.100, 0.130, dsp.hz("C6"), "C6")],
    "nui.track_lost": [(0.004, 0.120, dsp.hz("A4"), "A4"), (0.140, 0.200, dsp.hz("E4"), "E4")],
    "nui.track_found": [(0.004, 0.120, dsp.hz("E4"), "E4"), (0.140, 0.200, dsp.hz("A4"), "A4")],
}
# documented non-pentatonic / unpitched material (not asserted as pitch): see docs/audio/sfx_notes/ui.md
EXCEPTIONS = {"nui.hold": "E4 (pentatonic) + B4 (fifth above E4, requested by the spec; fits C/G major, not in the C pentatonic set)",
              "ui.denied": "unpitched wooden knocks, body ~190/170 Hz (as specified)",
              "ui.ring_in": "glide 400->700 Hz, unpitched sweep", "bubble.show_a": "glide 360->600 Hz, unpitched sweep", "bubble.show_b": "glide 430->720 Hz, unpitched sweep",
              "nui.release": "downward sweep 680->340 Hz, unpitched"}


def dominant(x: np.ndarray, a: float, w: float, lo: float, hi: float) -> float:
    seg = x[int(a * SR): int((a + w) * SR)]
    n = 1 << 16
    S = np.abs(np.fft.rfft(seg * np.hanning(seg.size), n))
    f = np.fft.rfftfreq(n, 1 / SR)
    m = (f > lo) & (f < hi)
    i = np.argmax(np.where(m, S, 0))
    if 0 < i < S.size - 1:                                   # parabolic refinement
        a_, b_, c_ = np.log(S[i - 1] + 1e-12), np.log(S[i] + 1e-12), np.log(S[i + 1] + 1e-12)
        d = 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_ + 1e-12)
        return float((i + d) * SR / n)
    return float(f[i])


def pc_name(f: float) -> str:
    return NAMES[int(round(69 + 12 * np.log2(f / 440.0))) % 12]


def xcorr(a: np.ndarray, b: np.ndarray) -> float:
    n = max(a.size, b.size)
    a, b = dsp.pad_to(a, n), dsp.pad_to(b, n)
    c = signal.correlate(a, b, mode="full", method="fft")
    return float(np.max(np.abs(c)) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def main(out: Path) -> int:
    fails: list[str] = []
    data = {}
    print(f"{'id':<16}{'dur':>7}{'tgt':>7}{'d%':>6}{'peak':>7}{'cent':>7}{'pres':>6}{'a>10k':>7}{'lead':>6}{'tail':>7}  note")
    for sid, (stem, tgt, kind) in ASSETS.items():
        p = out / "sfx" / f"{stem}.ogg"
        if not p.exists():
            fails.append(f"{sid}: missing {p}")
            print(f"{sid:<16} MISSING")
            continue
        x = master.decode_to_array(p)
        m = x if x.ndim == 1 else x.mean(axis=1)
        data[sid] = m
        dur = x.shape[0] / SR
        pk = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
        sr = master.spectral_report(x)
        ab = np.abs(x if x.ndim == 1 else x.max(axis=1))
        idx = np.flatnonzero(ab > dsp.db(-50))
        lead = idx[0] / SR * 1000 if idx.size else 0.0
        tail = 20 * np.log10(dsp.rms(x[-int(0.02 * SR):]) + 1e-12)
        dev = (dur / tgt - 1) * 100
        extra = ""
        if abs(dev) > 35 and kind == "sfx":
            fails.append(f"{sid}: duration {dur:.3f}s vs {tgt:.3f}s ({dev:+.0f}%)")
        if lead > 20:
            fails.append(f"{sid}: leading silence {lead:.0f} ms")
        if kind == "sfx" and tail > -45:
            fails.append(f"{sid}: tail rms {tail:.1f} dB")
        if kind == "loop":
            s2 = dsp.to_stereo(x)
            seam = float(np.max(np.abs(s2[0] - s2[-1])))
            slope = float(np.max(np.abs(s2[1:] - s2[:-1])))
            rms_db = 20 * np.log10(dsp.rms(x) + 1e-12)
            extra = f"seam jump {seam:.4f} (max sample step {slope:.4f}), RMS {rms_db:.1f} dBFS, L/R corr {np.corrcoef(s2[:,0], s2[:,1])[0,1]:.2f}"
            if seam > 0.05:
                fails.append(f"{sid}: decoded loop seam {seam:.3f}")
        print(f"{sid:<16}{dur:7.3f}{tgt:7.3f}{dev:6.0f}{pk:7.1f}{sr['centroid_hz']:7.0f}{sr['presence_2k_5k']:6.2f}{sr['air_gt_10k']:7.4f}{lead:6.1f}{tail:7.1f}  {extra}")
    # pitch classes
    print("\npitch check (measured dominant partial vs nominal, pentatonic membership)")
    for sid, segs in TONES.items():
        if sid not in data:
            continue
        for (a, w, fn, name) in segs:
            fm = dominant(data[sid], a, w, fn * 0.8, fn * 1.25)
            cents = 1200 * np.log2(fm / fn)
            pc = pc_name(fn)
            ok = abs(cents) <= 35 and pc in PENTA
            print(f"  {sid:<16}{name:>4}  nominal {fn:7.2f} Hz  measured {fm:7.2f} Hz  {cents:+6.1f} cents  class {pc:<2} {'ok' if ok else 'FAIL'}")
            if not ok:
                fails.append(f"{sid}: {name} measured {fm:.1f} Hz ({cents:+.0f} cents), class {pc}")
    if "nui.hold" in data:
        for name, fn in (("E4", dsp.hz("E4")), ("B4", dsp.hz("B4"))):
            fm = dominant(data["nui.hold"], 0.0, 0.9, fn * 0.97, fn * 1.03)
            print(f"  nui.hold        {name:>4}  nominal {fn:7.2f} Hz  measured {fm:7.2f} Hz  {1200*np.log2(fm/fn):+6.1f} cents  (loop-snapped)")
    print("\ndocumented exceptions / unpitched material:")
    for k, v in EXCEPTIONS.items():
        print(f"  {k:<16}{v}")
    # variants
    print("\nvariant distinctness (max normalised cross-correlation, must be < 0.9)")
    for a, b in VARIANTS:
        if a in data and b in data:
            c = xcorr(data[a], data[b])
            print(f"  {a:<16}{b:<16}{c:5.2f} {'ok' if c < 0.9 else 'FAIL'}")
            if c >= 0.9:
                fails.append(f"variants {a}/{b} xcorr {c:.2f}")
    # commit determinism: same bytes every render is guaranteed by seeding; check level equality of tap variants
    for a, b in (("ui.tap_a", "ui.tap_b"), ("bubble.show_a", "bubble.show_b")):
        if a in data and b in data:
            d = 20 * np.log10(dsp.rms(data[a]) / dsp.rms(data[b]))
            print(f"  RMS difference {a} vs {b}: {d:+.1f} dB")
    print("\nRESULT:", "PASS (objective checks only, no listening)" if not fails else "FAIL")
    for f in fails:
        print("  -", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/claude-0/audio-work/sfx_out_A")))
