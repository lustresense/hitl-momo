"""bgm.cover: warm, curious. Felt-piano arpeggios carry the Kite motif (arpeggiated), soft pizzicato bass, tiny shaker. 84 BPM, 16 bars, C major."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D E F G A B")        # diatonic; the motif and top line stay in C D E G A

# chord: (arp voicing low->high, bass root, bass fifth)
CH = {
    "C":   (V("C3", "G3", "C4", "E4", "G4"), "C3", "G2"),
    "Am":  (V("A2", "E3", "A3", "C4", "E4"), "A2", "E3"),
    "F":   (V("F2", "C3", "F3", "A3", "C4"), "F2", "C3"),
    "G":   (V("G2", "D3", "G3", "B3", "D4"), "G2", "D3"),
    "Em":  (V("E2", "B2", "E3", "G3", "B3"), "E2", "B2"),
    "Dm":  (V("D3", "A3", "D4", "F4", "A4"), "D3", "A2"),
    "Gs":  (V("G2", "D3", "G3", "C4", "D4"), "G2", "D3"),
}
PROG = ["C", "Am", "F", "G", "C", "Em", "F", "Gs", "F", "Em", "Dm", "G", "C", "Am", "F", "G"]
ARP_A = "0:.5 2:.5 3:.5 4:.5 3:.5 2:.5 3:.5 1:.5"
ARP_B = "0:.5 1:.5 3:.5 2:.5 4:.5 3:.5 2:.5 1:.5"


def build() -> Track:
    s = Score(84, 16)
    for bar, name in enumerate(PROG):
        v, root, fifth = CH[name]
        arp = ARP_A if (bar // 4) % 2 == 0 else ARP_B
        # accent the first note of each beat group a little
        s.seq("arp", arp, bar * 4, vel=0.42, voicing=v, gate=1.6)
        s.add("bass", root, bar * 4, 1.4, 0.75)
        s.add("bass", fifth, bar * 4 + 2, 1.0, 0.6)
        if bar % 4 == 3:
            s.add("bass", root if name != "G" else "G2", bar * 4 + 3.5, 0.4, 0.4)
        s.grid("shaker", "gxgxgxgx", bar * 4, 0.5, vel=0.6)
    # melody = Kite motif, arpeggiated feel (felt piano, one octave above the arpeggio)
    m = s.seq
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 r:1", 0, 0.78)
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:2", 8, 0.74)
    m("mel", "G5:1 A5:.5 C6:1.5 A5:1 | G5:1 E5:1 D5:1 r:1", 16, 0.62)
    m("mel", "E5:1 D5:.5 C5:1.5 D5:1 | E5:1 G5:2 r:1", 24, 0.66)
    m("mel", "E5:2 D5:2 | C5:2 A4:2 | A4:2 G4:2 | D4:3 r:1", 32, 0.7)
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 r:1", 48, 0.78)
    m("mel", "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:2", 56, 0.72)
    parts = {
        "arp": Part("felt", gain_db=-6, pan_spread=0.5, hp=90, lp=5500, send=0.35, jitter_ms=9, vel_var=0.12, kw=dict(rel=0.35), role="harmony"),
        "mel": Part("felt", gain_db=0, pan=0.12, hp=150, lp=6000, send=0.40, jitter_ms=7, vel_var=0.08, kw=dict(rel=0.4), role="melody"),
        "bass": Part("pizz", gain_db=-2, pan=-0.15, hp=70, lp=2500, send=0.10, jitter_ms=5, vel_var=0.08, role="bass"),
        "shaker": Part("shaker", gain_db=-8, pan=0.35, hp=3000, lp=9000, send=0.12, jitter_ms=5, vel_var=0.15, variants=4, pitched=False, role="perc"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=2.2))


bgm_cover = registry.music("bgm.cover", "bgm_cover", "cover", bpm=84, bars=16, key="C major", kbps=48, rms_db=-25.7,
                           desc="Warm, curious cover-screen loop: felt piano arpeggios, pizzicato bass, tiny shaker.")(reg("bgm.cover", build))
