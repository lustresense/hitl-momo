"""bgm.l2: Level 2. G major / E minor feel (Em-C-G-D), 124 BPM, 24 bars. Marimba 3-3-2 sixteenth arpeggios, syncopated Kite hook (transposed to G pentatonic) on kalimba, soft toms/wood."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("G A B C D E F#")
CH = {"Em": (V("E3", "B3", "E4", "G4", "B4", "E5"), "E2", "B2"), "C": (V("C3", "G3", "C4", "E4", "G4", "C5"), "C3", "G2"),
      "G": (V("G3", "B3", "D4", "G4", "B4", "D5"), "G2", "D3"), "D": (V("D3", "A3", "D4", "F#4", "A4", "D5"), "D3", "A2")}
PROG = ["Em", "C", "G", "D"] * 6
STEPS = [0, 2, 4, 2, 3, 5, 3, 2, 0, 2, 4, 3, 5, 3, 4, 2]
ACC = {0, 3, 6, 8, 11, 14}


def build() -> Track:
    s = Score(124, 24)
    for bar, name in enumerate(PROG):
        b0 = bar * 4
        v, root, fifth = CH[name]
        for i, st in enumerate(STEPS):
            s.add("arp", v[st], b0 + i * 0.25, 0.3, 0.62 if i in ACC else 0.36)
        s.add("bass", root, b0, 0.9, 0.7)
        s.add("bass", fifth, b0 + 1.5, 0.5, 0.55)
        s.add("bass", root, b0 + 3, 0.5, 0.5)
        s.grid("shaker", "gxgxgxgxgxgxgxgx", b0, 0.25, vel=0.45)
        s.grid("tom", "x...x...", b0, 0.5, pitch=55, vel=0.5)
        s.grid("tom", "......g.", b0, 0.5, pitch=50, vel=0.5)
        s.grid("wood", "..x..x.x", b0, 0.5, pitch=88, vel=0.5)
    h = lambda t, b, v=0.8, tr=0: s.seq("hook", t, b, v, transpose=tr)
    HK = "D5:.5 E5:.5 G5:1 E5:.5 D5:.5 B4:1 | A4:1.5 r:.5 D5:.5 E5:.5 G5:1 | B4:.5 D5:.5 G5:1 D5:.5 B4:.5 A4:1 | G4:1.5 r:.5 A4:.5 B4:.5 D5:1"
    h(HK, 0)
    h(HK, 16, 0.8)
    h("E5:2 G5:1 A5:1 | G5:2 E5:2 | D5:1 E5:1 G5:2 | A5:1 G5:1 E5:2", 32, 0.75)
    h("G5:2 A5:1 B5:1 | A5:2 G5:2 | E5:1 G5:1 A5:2 | B5:1 A5:1 G5:2", 48, 0.75)
    h(HK, 64)
    h(HK, 80, 0.78, 12)
    parts = {
        "hook": Part("kalimba", gain_db=-1, pan=0.12, hp=200, lp=5200, send=0.30, jitter_ms=6, vel_var=0.08, role="melody"),
        "arp": Part("marimba", gain_db=-7, pan_spread=0.5, hp=150, lp=4200, send=0.22, jitter_ms=5, vel_var=0.10, role="harmony"),
        "bass": Part("pizz", gain_db=0, pan=-0.1, hp=70, lp=2500, send=0.08, jitter_ms=4, vel_var=0.08, role="bass"),
        "shaker": Part("shaker", gain_db=-8, pan=0.4, hp=3000, lp=9000, send=0.08, jitter_ms=4, vel_var=0.15, variants=4, pitched=False, role="perc"),
        "tom": Part("tom", gain_db=-8, pan=-0.2, hp=100, lp=2500, send=0.15, jitter_ms=5, vel_var=0.12, pitched=False, role="perc"),
        "wood": Part("wood", gain_db=-6, pan=-0.4, hp=300, lp=6000, send=0.15, jitter_ms=4, vel_var=0.12, pitched=False, role="perc"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=1.7), exceptions="F# is the D-chord third (G major); bass/arps use it")


bgm_l2 = registry.music("bgm.l2", "bgm_l2", "world2", bpm=124, bars=24, key="G major / E minor (Em-C-G-D)", kbps=48, rms_db=-25.4,
                        desc="Level 2: busier 3-3-2 marimba arpeggios, syncopated Kite hook in G, soft toms/wood.")(reg("bgm.l2", build))
