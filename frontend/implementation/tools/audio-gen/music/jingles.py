"""Stingers (one-shots, natural tail): level complete, soft fail, ending close, level intro. Score time unit = seconds (bpm=60)."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track

ALLOWED = im.pcset("C D E F G A B")


def _shot(s: Score, parts: dict, rng, rt60: float, length: float):
    return im.render(s, parts, rng, rt60=rt60, tail_s=length, peak=0.5, loop=False, out_len_s=length)


def _parts(**over):
    base = {
        "mar": Part("marimba", gain_db=0, pan=0.0, hp=150, lp=5000, send=0.30, jitter_ms=3, vel_var=0.05, role="melody"),
        "piano": Part("felt", gain_db=-3, pan=-0.1, hp=120, lp=6000, send=0.40, jitter_ms=3, vel_var=0.05, kw=dict(rel=0.6), role="harmony"),
        "pad": Part("pad", gain_db=-8, pan_spread=0.5, hp=110, lp=2400, send=0.35, jitter_ms=0, vel_var=0, chorus=0.35, kw=dict(kind="string", attack=0.3, release=1.4, voices=3), role="pad"),
        "bell": Part("bell", gain_db=-10, pan_spread=0.7, lp=6500, send=0.60, jitter_ms=6, vel_var=0.10, role="sparkle"),
        "cel": Part("celesta", gain_db=-6, pan=0.2, lp=6500, send=0.45, jitter_ms=3, vel_var=0.05, role="melody"),
        "kal": Part("kalimba", gain_db=-6, pan=-0.2, lp=5500, send=0.5, jitter_ms=3, vel_var=0.05, role="melody"),
    }
    base.update(over)
    return base


def build_level_complete() -> Track:
    s = Score(60, 1, bpb=4)
    for i, (n, v) in enumerate([("G4", .62), ("A4", .66), ("C5", .72), ("E5", .78), ("G5", .85)]):    # rising motif (kite G A C) -> pentatonic run
        s.add("mar", n, 0.12 * i, 0.3, v)
        s.add("cel", n, 0.12 * i + 0.01, 0.3, v * 0.5)
    s.chord("piano", V("C4", "G4", "C5", "E5", "G5"), 0.62, 1.6, 0.7, strum=0.02)
    s.chord("pad", V("C3", "G3", "E4", "C5"), 0.55, 1.3, 0.6)
    s.add("cel", "C6", 0.64, 1.0, 0.7)
    for t, n, v in [(0.85, "E6", .5), (1.0, "G6", .45), (1.17, "C6", .45), (1.32, "D6", .4), (1.5, "G5", .35)]:    # shimmer
        s.add("bell", n, t, 2.0, v)
    return Track(s, _parts(), ALLOWED)


def build_fail_soft() -> Track:
    s = Score(60, 1, bpb=4)
    for t, n, v in [(0.0, "E5", .55), (0.26, "D5", .5), (0.54, "C5", .5)]:                 # soft descending sigh
        s.add("mar", n, t, 0.3, v)
    s.chord("piano", V("C4", "G4", "D5", "E5"), 0.9, 1.0, 0.5, strum=0.03)                  # warm Cadd9 resolution
    s.chord("pad", V("C3", "G3", "E4"), 0.85, 0.7, 0.5)
    return Track(s, _parts(pad=Part("pad", gain_db=-9, pan_spread=0.4, hp=110, lp=2000, send=0.35, jitter_ms=0, vel_var=0, kw=dict(kind="felt", attack=0.25, release=1.0, voices=3), role="pad")), ALLOWED)


def build_ending_close() -> Track:
    s = Score(60, 1, bpb=4)
    # F -> G -> Cmaj9 (long). Kite motif head (G A C) whispered by the celesta over the last chord.
    s.chord("piano", V("F3", "C4", "F4", "A4", "C5"), 0.0, 1.2, 0.55, strum=0.03)
    s.chord("pad", V("F3", "A3", "C4", "F4"), 0.0, 1.3, 0.6)
    s.chord("piano", V("G3", "D4", "G4", "B4", "D5"), 1.15, 1.2, 0.58, strum=0.03)
    s.chord("pad", V("G3", "B3", "D4", "G4"), 1.1, 1.3, 0.6)
    s.chord("piano", V("C3", "G3", "C4", "E4", "G4", "D5"), 2.3, 3.0, 0.62, strum=0.035)
    s.chord("pad", V("C3", "G3", "E4", "B4", "D5"), 2.25, 3.2, 0.7)
    for t, n, v in [(2.6, "G5", .5), (3.1, "A5", .45), (3.6, "C6", .5), (4.3, "E6", .35)]:
        s.add("cel", n, t, 2.0, v)
    for t, n in [(3.9, "G6"), (4.5, "D6")]:
        s.add("bell", n, t, 2.0, 0.4)
    return Track(s, _parts(pad=Part("pad", gain_db=-7, pan_spread=0.5, hp=110, lp=2200, send=0.4, jitter_ms=0, vel_var=0, chorus=0.35, kw=dict(kind="string", attack=0.5, release=2.0, voices=3), role="pad")), ALLOWED)


def build_level_intro() -> Track:
    s = Score(60, 1, bpb=4)
    for t, n, v in [(0.0, "G4", .5), (0.22, "A4", .55), (0.44, "C5", .62)]:                  # the first notes of the Kite motif, "page opens"
        s.add("kal", n, t, 1.0, v)
        s.add("cel", n, t, 1.0, v * 0.45)
    s.chord("pad", V("C3", "G3", "D4"), 0.1, 0.8, 0.45)
    s.add("bell", "E5", 0.62, 1.5, 0.4)
    return Track(s, _parts(), ALLOWED)


JINGLES = {"jingle.level_complete": (build_level_complete, 3.6, 2.4), "jingle.fail_soft": (build_fail_soft, 2.3, 1.6),
           "jingle.ending_close": (build_ending_close, 5.8, 3.0), "jingle.level_intro": (build_level_intro, 2.2, 1.6)}


PEAK = {"jingle.level_complete": -4.0, "jingle.fail_soft": -9.0, "jingle.ending_close": -5.0, "jingle.level_intro": -8.0}


def _reg(id, file, group, desc):
    b, length, rt = JINGLES[id]
    def fn(rng):
        t = b()
        return _shot(t.score, t.parts, rng, rt, length)
    registry.stinger(id, file, group, peak_db=PEAK[id], kbps=96, desc=desc)(fn)
    from .theme import BUILDERS
    BUILDERS[id] = b


_reg("jingle.level_complete", "jingle_level_complete", "core", "Satisfying short celebration: rising Kite-motif run, C major chord, shimmer.")
_reg("jingle.fail_soft", "jingle_fail_soft", "core", "Gentle 'oops, try again': soft descending marimba E-D-C then a warm C chord. Not a buzzer.")
_reg("jingle.ending_close", "jingle_ending_close", "ending", "Final warm F-G-Cmaj9 phrase with a celesta echo of the motif head.")
_reg("jingle.level_intro", "jingle_level_intro", "core", "2 s 'page opens' cue: first notes of the Kite motif.")
