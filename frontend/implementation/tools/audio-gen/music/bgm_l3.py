"""bgm.l3: Level 3. Mysterious, challenging, not scary. A minor / A dorian, 96 BPM, 16 bars. Low pizzicato, soft bells (inverted/slowed Kite motif), subtle tick-tock, quiet drone."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("A B C D E F# G F")        # A dorian + F natural (Fmaj7 in the B part)
PAD = {"Am9": V("A3", "C4", "E4", "G4", "D5"), "D": V("D3", "A3", "F#4", "A4", "E5"), "G": V("G3", "B3", "D4", "A4"), "F": V("A3", "C4", "F4", "G4")}
BASS = {"Am9": ("A2", "E3"), "D": ("D3", "A2"), "G": ("G2", "D3"), "F": ("F2", "C3")}
PROG = ["Am9"] * 2 + ["D"] * 2 + ["Am9"] * 2 + ["G"] * 2 + ["F"] * 2 + ["G"] * 2 + ["Am9"] * 2 + ["D"] * 2


def build() -> Track:
    s = Score(96, 16)
    for bar, name in enumerate(PROG):
        b0 = bar * 4
        if bar % 2 == 0:
            s.chord("pad", PAD[name], b0, 9.0, 0.5)
        r, f = BASS[name]
        s.add("bass", r, b0, 0.9, 0.7)
        s.add("bass", f, b0 + 2, 0.6, 0.5)
        s.add("bass", r, b0 + 3.5, 0.4, 0.4)
        if bar not in (6, 7, 14, 15):
            for k in range(4):
                s.add("tick", 88 if k % 2 == 0 else 84, b0 + k, 0.1, 0.55 if k == 0 else 0.4)
    s.chord("drone", V("A2", "E3"), 0, 36.0, 0.5)
    s.chord("drone", V("A2", "A3"), 32, 36.0, 0.5)
    s.seq("bell", "G5:2 E5:1 D5:3 E5:2 | A5:2 B5:2 D6:2 r:2", 0, 0.6)                 # inverted motif, twice as slow
    s.seq("bell", "G4:2 A4:1 C5:3 A4:2 | G4:2 E4:2 D4:2 r:2", 32, 0.6, transpose=0)  # original motif, twice as slow, lower
    s.seq("bell", "A4:4 | C5:2 E5:2 | A4:2 D5:2 | A4:4", 48, 0.5)
    parts = {
        "pad": Part("pad", gain_db=-5, pan_spread=0.5, hp=110, lp=1500, send=0.35, jitter_ms=0, vel_var=0, chorus=0.35, kw=dict(kind="felt", attack=1.3, release=2.0, voices=3, spread=9.0), role="pad"),
        "drone": Part("pad", gain_db=-7, pan=0.0, hp=80, lp=700, send=0.15, jitter_ms=0, vel_var=0, kw=dict(kind="felt", attack=2.0, release=3.0, voices=2, spread=5.0), role="drone"),
        "bass": Part("pizz", gain_db=0, pan=-0.1, hp=70, lp=2000, send=0.10, jitter_ms=5, vel_var=0.08, role="bass"),
        "bell": Part("bell", gain_db=-2, pan=0.2, hp=250, lp=6000, send=0.6, jitter_ms=8, vel_var=0.08, echo=(1.5, 0.4, 0.25, 2800), role="melody"),
        "tick": Part("tick", gain_db=-8, pan=-0.3, hp=500, lp=5000, send=0.10, jitter_ms=3, vel_var=0.1, pitched=False, role="perc"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=3.0, hi_ratio=0.4), exceptions="F# in the D chord (dorian 6th); F natural in Fmaj7")


bgm_l3 = registry.music("bgm.l3", "bgm_l3", "world3", bpm=96, bars=16, key="A minor / A dorian", kbps=48, rms_db=-25.6,
                        desc="Level 3: mysterious but friendly; low pizzicato, soft bells (inverted/slowed motif), tick-tock, quiet drone.")(reg("bgm.l3", build))
