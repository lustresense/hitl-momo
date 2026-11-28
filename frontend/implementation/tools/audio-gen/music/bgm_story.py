"""bgm.story: narrative intros. Am-F-C-G, 72 BPM, 16 bars. String-like pad, low felt piano (motif in thirds), celesta motif."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D E F G A B")
PAD = {"Am": V("E3", "A3", "C4", "E4"), "F": V("F3", "A3", "F4", "A4"), "C": V("C3", "G3", "E4", "G4"), "G": V("D3", "G3", "B3", "D4")}
LH = {"Am": ("A2", "E3"), "F": ("F2", "C3"), "C": ("C3", "G3"), "G": ("G2", "D3")}
PROG = ["Am", "F", "C", "G"] * 4
SWELL = [[0.45, 0.55, 0.65, 0.5], [0.45, 0.55, 0.65, 0.5], [0.5, 0.65, 0.78, 0.58], [0.5, 0.65, 0.78, 0.55]]


def build() -> Track:
    s = Score(72, 16)
    for bar, name in enumerate(PROG):
        b0 = bar * 4
        s.chord("pad", PAD[name], b0, 5.2, SWELL[bar // 4][bar % 4])
        r, f = LH[name]
        s.add("lh", r, b0, 2.0, 0.55)
        s.add("lh", f, b0 + 2, 2.0, 0.42)
    third = lambda b: (s.seq("lh", "[G3,B3]:1 [A3,C4]:.5 [C4,E4]:1.5 [A3,C4]:1", b, 0.6), s.seq("lh", "[G3,B3]:1 [E3,G3]:1 [D3,B3]:1 r:1", b + 4, 0.6))
    third(24)
    third(56)
    for b, v in [(8, 0.38), (40, 0.5)]:
        s.seq("cel", "G5:1 A5:.5 C6:1.5 A5:1 | G5:1 E5:1 D5:1 r:1", b, v)
    s.seq("cel", "A5:1 C6:1 E6:2 | C6:1 A5:1 G5:2", 48, 0.5)
    parts = {
        "pad": Part("pad", gain_db=-2, pan_spread=0.6, hp=110, lp=2300, send=0.35, jitter_ms=0, vel_var=0, chorus=0.4, kw=dict(kind="string", attack=0.9, release=1.8, voices=3, spread=10.0), role="pad"),
        "lh": Part("felt", gain_db=-3, pan=-0.1, hp=80, lp=3200, send=0.35, jitter_ms=8, vel_var=0.08, kw=dict(rel=0.5, dark=1.15), role="melody"),
        "cel": Part("celesta", gain_db=-1, pan=0.3, hp=300, lp=6500, send=0.6, jitter_ms=8, vel_var=0.08, echo=(1.0, 0.35, 0.22, 3000), role="melody"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=3.2))


bgm_story = registry.music("bgm.story", "bgm_story", "story", bpm=72, bars=16, key="A minor / C major (Am-F-C-G)", kbps=48, rms_db=-25.5,
                           desc="Story: soft string pad, low felt piano with the motif in thirds, celesta motif; slightly cinematic.")(reg("bgm.story", build))
