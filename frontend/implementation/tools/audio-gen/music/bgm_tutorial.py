"""bgm.tutorial: playful, relaxed, focus-friendly. I-vi-IV-V in C, 100 BPM, 20 bars. Marimba staccato Kite motif, pizzicato bass, very soft brush/shaker."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D E F G A B")
BASS = {"C": ("C3", "G2"), "Am": ("A2", "E3"), "F": ("F2", "C3"), "G": ("G2", "D3")}
DYAD = {"C": "[E4,G4]", "Am": "[C5,E5]", "F": "[A4,C5]", "G": "[B4,D5]"}
PROG = ["C", "C", "Am", "Am", "F", "F", "G", "G"] + ["C", "Am", "F", "G"] * 2 + ["F", "G", "C", "G"]


def build() -> Track:
    s = Score(100, 20)
    for bar, name in enumerate(PROG):
        b0 = bar * 4
        root, fifth = BASS[name]
        s.add("bass", root, b0, 0.9, 0.7)
        s.add("bass", fifth, b0 + 1, 0.5, 0.5)
        s.add("bass", root, b0 + 2, 0.9, 0.6)
        s.add("bass", fifth, b0 + 3, 0.5, 0.45)
        s.grid("shaker", "gxgxgxgx", b0, 0.5, vel=0.5)
        s.add("brush", 0, b0 + 1, 0.5, 0.5)
        s.add("brush", 0, b0 + 3, 0.5, 0.45)
        if 8 <= bar < 16:
            s.seq("comp", f"r:2.5 {DYAD[name]}:.5 r:1", b0, 0.5)
    m = lambda t, b, v=0.8: s.seq("mel", t, b, v, gate=0.42)
    m("G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 r:1", 0)
    m("C5:1 D5:.5 E5:1.5 D5:1 | C5:1 A4:1 G4:1 r:1", 8)
    m("G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 r:1", 16)
    m("G4:.5 A4:.5 C5:1 D5:1 E5:1 | G5:1 E5:1 D5:1 r:1", 24)
    m("E5:.5 E5:.5 G5:1 E5:1 D5:1 | C5:.5 C5:.5 D5:1 C5:1 A4:1 | A4:.5 A4:.5 C5:1 A4:1 G4:1 | G4:1 A4:1 C5:1 D5:1", 32, 0.78)
    m("E5:.5 E5:.5 G5:1 E5:1 D5:1 | C5:.5 C5:.5 D5:1 C5:1 A4:1 | A4:.5 A4:.5 C5:1 A4:1 G4:1 | G4:1 E4:1 D4:1 r:1", 48, 0.78)
    m("A4:1 C5:1 D5:1 C5:1 | D5:1 E5:1 G5:2 | G5:.5 E5:.5 C5:1 D5:1 E5:1 | D5:2 r:2", 64, 0.78)
    parts = {
        "mel": Part("marimba", gain_db=0, pan=0.08, hp=150, lp=4800, send=0.28, jitter_ms=7, vel_var=0.08, role="melody"),
        "comp": Part("marimba", gain_db=-5, pan=-0.3, hp=200, lp=4500, send=0.28, jitter_ms=8, vel_var=0.10, role="harmony"),
        "bass": Part("pizz", gain_db=-1, pan=-0.1, hp=70, lp=2500, send=0.08, jitter_ms=6, vel_var=0.08, role="bass"),
        "shaker": Part("shaker", gain_db=-9, pan=0.4, hp=3000, lp=9000, send=0.10, jitter_ms=5, vel_var=0.15, variants=4, pitched=False, role="perc"),
        "brush": Part("brush", gain_db=-8, pan=-0.25, hp=1200, lp=7500, send=0.12, jitter_ms=8, vel_var=0.15, pitched=False, role="perc"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=1.6))


bgm_tutorial = registry.music("bgm.tutorial", "bgm_tutorial", "tutorial", bpm=100, bars=20, key="C major (I-vi-IV-V)", kbps=48, rms_db=-25.9,
                              desc="Tutorial: playful, relaxed; staccato marimba motif, pizzicato bass, very soft brush/shaker.")(reg("bgm.tutorial", build))
