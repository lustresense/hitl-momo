"""bgm.levels: level select. Exploratory anticipation. Csus2-Am7-Fmaj7-G6, 92 BPM, 16 bars. Kalimba 3+3+2 arpeggios, light pad, motif echoed by celesta."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D E F G A B")
CH = {  # arp voicing, pad voicing, bass root
    "Cs2": (V("C4", "D4", "G4", "C5", "D5", "G5"), V("C3", "G3", "D4"), "C3"),
    "Am7": (V("A3", "C4", "E4", "G4", "C5", "E5"), V("A3", "E4", "G4"), "A2"),
    "F7":  (V("F3", "A3", "C4", "E4", "A4", "C5"), V("F3", "C4", "E4"), "F2"),
    "G6":  (V("G3", "D4", "E4", "G4", "B4", "D5"), V("G3", "D4", "E4"), "G2"),
}
PROG = ["Cs2", "Am7", "F7", "G6"] * 2 + ["Am7", "F7", "G6", "Cs2"] * 2
ARP_A = "0:.5@1 2:.5@.7 4:.5@.7 3:.5@1 5:.5@.7 3:.5@.7 4:.5@1 2:.5@.7"
ARP_B = "5:.5@1 3:.5@.7 4:.5@.7 2:.5@1 3:.5@.7 1:.5@.7 2:.5@1 0:.5@.7"


def build() -> Track:
    s = Score(92, 16)
    for bar, name in enumerate(PROG):
        arp, padv, root = CH[name]
        b0 = bar * 4
        s.seq("arp", ARP_A if bar < 8 else ARP_B, b0, 0.55, voicing=arp)
        s.chord("pad", padv, b0, 5.0, 0.5)
        s.add("bass", root, b0, 1.0, 0.65)
        s.add("bass", root, b0 + 1.5, 0.5, 0.5)
        s.add("bass", root, b0 + 3, 0.5, 0.45)
    for bar in (1, 5, 9, 13):          # Kite motif, echoed by the celesta (call bar x, response bar x+1)
        s.seq("cel", "G5:1 A5:.5 C6:1.5 A5:1 | G5:1 E5:1 D5:1 r:1", bar * 4, 0.55)
    parts = {
        "arp": Part("kalimba", gain_db=-3, pan_spread=0.6, hp=150, lp=5200, send=0.38, jitter_ms=7, vel_var=0.10, kw=dict(tine=0.8), role="harmony"),
        "pad": Part("pad", gain_db=-3, pan_spread=0.5, hp=110, lp=2000, send=0.35, jitter_ms=0, vel_var=0, chorus=0.4, kw=dict(kind="felt", attack=0.9, release=1.6, voices=3, spread=8.0), role="pad"),
        "bass": Part("pizz", gain_db=-3, pan=-0.1, hp=70, lp=2200, send=0.08, jitter_ms=5, vel_var=0.08, role="bass"),
        "cel": Part("celesta", gain_db=-3, pan=0.25, hp=300, lp=6500, send=0.55, jitter_ms=8, vel_var=0.08, echo=(1.5, 0.4, 0.3, 3000), role="melody"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=2.6))


bgm_levels = registry.music("bgm.levels", "bgm_levels", "levels", bpm=92, bars=16, key="C (sus2 / Am7 / Fmaj7 / G6)", kbps=48, rms_db=-25.7,
                            desc="Level select: exploratory anticipation; kalimba 3+3+2 arpeggios on suspended chords, light pad.")(reg("bgm.levels", build))
