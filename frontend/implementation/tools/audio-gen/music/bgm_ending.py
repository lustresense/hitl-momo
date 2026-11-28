"""bgm.ending: closing screen. Warm, emotional. C major, 76 BPM, 16 bars. Felt piano + string pad + kalimba echo; the Kite motif in augmentation resolving to C."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D E F G A B")
PAD = {"C": V("E3", "G3", "C4", "E4"), "Am": V("E3", "A3", "C4", "E4"), "F": V("F3", "A3", "C4", "A4"), "G": V("D3", "G3", "B3", "D4"), "C9": V("C3", "G3", "D4", "E4", "A4")}
LH = {"C": "C3", "Am": "A2", "F": "F2", "G": "G2", "C9": "C3"}
PROG = ["C", "Am", "F", "G", "C", "Am", "F", "C", "F", "G", "C", "Am", "F", "G", "C9", "C9"]


def build() -> Track:
    s = Score(76, 16)
    for bar, name in enumerate(PROG):
        b0 = bar * 4
        s.chord("pad", PAD[name], b0, 5.2 if bar < 14 else 6.0 if bar == 14 else 0.01, 0.55 if bar < 14 else 0.62)
        if bar < 14:
            s.add("lh", LH[name], b0, 3.0, 0.5)
            s.add("lh", LH[name], b0 + 2, 2.0, 0.35, )
    s.chord("lh", V("C3", "G3", "C4", "E4", "G4", "D5"), 56, 6.0, 0.55, strum=0.08)
    s.seq("mel", "G4:2 A4:1 C5:3 A4:2 | G4:2 E4:2 D4:2 r:2", 0, 0.72)                    # augmentation (x2), ends on the dominant: a question
    s.seq("mel", "G4:2 A4:1 C5:3 A4:2 | G4:2 E4:2 D4:2 C4:2", 16, 0.7)                   # same, resolving to C
    s.seq("kal", "G5:1 A5:.5 C6:1.5 A5:1 | G5:1 E5:1 D5:1 r:1", 32, 0.55)               # kalimba echo of the motif at original speed
    s.seq("mel", "E5:2 G5:2 | E5:2 D5:2", 40, 0.62)
    s.seq("mel", "A4:2 C5:2 | D5:2 B4:2", 48, 0.62)
    s.seq("mel", "C5:6", 56, 0.68)                                                      # final warm C
    s.seq("kal", "E5:1 G5:1 C6:2", 58, 0.4)
    parts = {
        "pad": Part("pad", gain_db=-3, pan_spread=0.6, hp=110, lp=2400, send=0.35, jitter_ms=0, vel_var=0, chorus=0.4, kw=dict(kind="string", attack=0.9, release=2.0, voices=3, spread=10.0), role="pad"),
        "lh": Part("felt", gain_db=-5, pan=-0.12, hp=80, lp=3500, send=0.35, jitter_ms=8, vel_var=0.08, kw=dict(rel=0.6, dark=1.1), role="harmony"),
        "mel": Part("felt", gain_db=0, pan=0.1, hp=150, lp=5500, send=0.45, jitter_ms=8, vel_var=0.08, kw=dict(rel=0.7), role="melody"),
        "kal": Part("kalimba", gain_db=-1, pan=0.3, hp=200, lp=5500, send=0.5, jitter_ms=8, vel_var=0.08, echo=(1.5, 0.45, 0.3, 3000), role="melody"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=3.2))


bgm_ending = registry.music("bgm.ending", "bgm_ending", "ending", bpm=76, bars=16, key="C major", kbps=48, rms_db=-25.6,
                            desc="Ending: warm closure; felt piano, string pad, kalimba echo; augmented Kite motif resolving to C.")(reg("bgm.ending", build))
