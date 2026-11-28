"""bgm.dream: DreamLoader. Floating, no beat. Soft felt pad on C Lydian colour chords, sparse kalimba/bell notes with long reverb.
The Kite motif is stretched x4 (one note per bar or so). 66 BPM, 16 bars."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D E F G A B")      # + F# on purpose (Lydian #11), see exceptions

CHORDS = [  # 2 bars each
    V("C3", "G3", "D4", "E4", "A4"),     # Cmaj9 (6/9 voicing: no B against the motif C)
    V("F3", "C4", "E4", "A4", "B4"),     # Fmaj7#11
    V("E3", "B3", "D4", "G4", "C5"),     # Cmaj9/E
    V("A3", "C4", "F4", "B4", "E5"),     # Fmaj7#11/A
    V("A3", "C4", "E4", "G4", "D5"),     # Am7(add11)
    V("F3", "C4", "E4", "A4", "B4"),     # Fmaj7#11
    V("C3", "G3", "D4", "E4", "A4"),     # Cmaj9 (6/9 voicing: no B against the motif C)
    V("C3", "G3", "E4", "F#4", "A4"),    # C6#11 (the Lydian colour)
]


def build() -> Track:
    s = Score(66, 16)
    for i, v in enumerate(CHORDS):
        s.chord("pad", v, i * 8, 9.5, 0.55)
    # Kite motif x4 (augmentation): kalimba (A), bells an octave up (B)
    for beat, n in [(0, "G4"), (4, "A4"), (6, "C5"), (12, "A4"), (16, "G4"), (20, "E4"), (24, "D4")]:
        s.add("kal", n, beat, 2, 0.62)
    for beat, n in [(32, "G5"), (36, "A5"), (38, "C6"), (44, "A5"), (48, "G5"), (52, "E5"), (56, "D5"), (60, "C5")]:
        s.add("bell", n, beat, 3, 0.5)
    for beat, n in [(2.5, "E6"), (10.5, "E6"), (14, "A5"), (18.5, "G6"), (26, "E6"), (30, "A5"),
                    (34.5, "E6"), (42, "A5"), (50.5, "D6"), (54, "E5"), (58.5, "E6"), (61, "F#5")]:
        s.add("twinkle", n, beat, 3, 0.30)
    parts = {
        "pad": Part("pad", gain_db=0, pan_spread=0.6, hp=100, lp=2000, send=0.35, jitter_ms=0, vel_var=0, chorus=0.45, kw=dict(kind="felt", attack=1.8, release=2.6, voices=3, spread=8.0), role="pad"),
        "kal": Part("kalimba", gain_db=-1, pan=-0.2, lp=5000, send=0.55, jitter_ms=10, vel_var=0.08, echo=(1.5, 0.45, 0.28, 2800), role="melody"),
        "bell": Part("bell", gain_db=-3, pan=0.25, lp=6000, send=0.65, jitter_ms=10, vel_var=0.08, kw=dict(ring=1.0), role="melody"),
        "twinkle": Part("bell", gain_db=-9, pan_spread=0.7, lp=6000, send=0.7, jitter_ms=12, vel_var=0.12, role="sparkle"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=4.0, hi_ratio=0.4), exceptions="F#4 in the last chord and F#5 twinkle (C Lydian #11 colour)")


bgm_dream = registry.music("bgm.dream", "bgm_dream", "dream", bpm=66, bars=16, key="C Lydian colour", kbps=48, rms_db=-26.8,
                           desc="DreamLoader: floating felt pad, sparse kalimba/bell, motif stretched x4, long reverb, no beat.")(reg("bgm.dream", build))
