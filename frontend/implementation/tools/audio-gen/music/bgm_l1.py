"""bgm.l1: Level 1 gameplay. Cheerful light adventure, C major, 112 BPM, 20 bars. Marimba Kite-motif melody, kalimba off-beat dyads, pizzicato bass, wood + shaker."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D E F G A B")
BASS = {"C": ("C3", "G2"), "Am": ("A2", "E3"), "F": ("F2", "C3"), "G": ("G2", "D3"), "Em": ("E2", "B2")}
DYAD = {"C": "[E4,G4]", "Am": "[C5,E5]", "F": "[A4,C5]", "G": "[B4,D5]", "Em": "[G4,B4]"}
PROG = ["C", "Am", "F", "G"] * 2 + ["F", "G", "Em", "Am"] + ["C", "Am", "F", "G"] + ["F", "G", "C", "G"]


def build() -> Track:
    s = Score(112, 20)
    for bar, name in enumerate(PROG):
        b0 = bar * 4
        root, fifth = BASS[name]
        s.add("bass", root, b0, 0.9, 0.8)
        s.add("bass", fifth, b0 + 1.5, 0.4, 0.55)
        s.add("bass", root, b0 + 2, 0.9, 0.7)
        s.add("bass", fifth, b0 + 3.5, 0.4, 0.5)
        s.seq("comp", f"r:.5 {DYAD[name]}:.5 r:1.5 {DYAD[name]}:.5 r:1", b0, 0.55)
        s.grid("shaker", "gxgxgxgx", b0, 0.5, vel=0.6)
        s.grid("wood", "..x...x.", b0, 0.5, pitch=84, vel=0.55)
    m = s.seq
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 r:1", 0, 0.8, transpose=12)
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 C4:1", 8, 0.76, transpose=12)
    m("mel", "C5:1 D5:.5 E5:1.5 D5:1 | C5:1 A4:1 G4:1 r:1", 16, 0.78)
    m("mel", "A4:1 C5:.5 D5:1.5 C5:1 | D5:1 E5:1 G5:2", 24, 0.78)
    m("mel", "E5:.5 G5:.5 A5:1 G5:1 E5:1 | D5:.5 E5:.5 G5:1 E5:1 D5:1 | E5:.5 G5:.5 A5:1 G5:1 E5:1 | C5:1 D5:1 E5:2", 32, 0.78)
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 r:1", 48, 0.8, transpose=12)
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:2", 56, 0.76, transpose=12)
    m("mel", "A5:.5 G5:.5 E5:1 D5:1 C5:1 | D5:1 E5:1 G5:2 | G5:1 E5:1 C5:2 | D5:2 r:2", 64, 0.78)
    parts = {
        "mel": Part("marimba", gain_db=0, pan=0.1, hp=150, lp=4800, send=0.30, jitter_ms=7, vel_var=0.08, role="melody"),
        "comp": Part("kalimba", gain_db=-8, pan=-0.3, hp=200, lp=5000, send=0.30, jitter_ms=8, vel_var=0.10, kw=dict(tine=0.7), role="harmony"),
        "bass": Part("pizz", gain_db=-1, pan=-0.1, hp=70, lp=2500, send=0.08, jitter_ms=5, vel_var=0.08, role="bass"),
        "shaker": Part("shaker", gain_db=-9, pan=0.4, hp=3000, lp=9000, send=0.10, jitter_ms=5, vel_var=0.15, variants=4, pitched=False, role="perc"),
        "wood": Part("wood", gain_db=-7, pan=-0.35, hp=300, lp=6000, send=0.15, jitter_ms=5, vel_var=0.12, variants=2, pitched=False, role="perc"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=1.8))


bgm_l1 = registry.music("bgm.l1", "bgm_l1", "world1", bpm=112, bars=20, key="C major", kbps=48, rms_db=-25.3,
                        desc="Level 1: cheerful light adventure; marimba Kite-motif melody, pizzicato bass, soft wood/shaker.")(reg("bgm.l1", build))
