"""bgm.focus: drawing / AI prediction / Top-3 decision. Minimal, static harmony (no 3rd, no cadence, no build-up), 1-2 motif notes."""
from common import instr_music as im
from common.instr_music import Part, Score, V
import registry
from .theme import Track, reg

ALLOWED = im.pcset("C D G A")


def build() -> Track:
    s = Score(60, 16)
    sets = [V("C3", "G3", "D4", "A4"), V("C3", "G3", "D4", "G4"), V("C3", "G3", "A3", "D4"), V("C3", "D4", "G4", "A4")]
    for i, v in enumerate(sets):                      # 4 bars each, 1.5 s overlap into the next set
        s.chord("pad", v, i * 16, 17.5, 0.55)
    # occasional single soft plucks, far apart (1-2 notes of the Kite motif: G ... A, falling/neutral, no line)
    for bar, beat, n in [(2, 1.0, "G4"), (5, 2.0, "A4"), (8, 0.5, "D5"), (10, 3.0, "G4"), (13, 1.5, "A4")]:
        s.add("pluck", n, bar * 4 + beat, 1.0, 0.42)
    parts = {
        "pad": Part("pad", gain_db=0, pan_spread=0.5, hp=110, lp=1900, send=0.30, jitter_ms=0, vel_var=0, chorus=0.40, kw=dict(kind="felt", attack=1.6, release=2.2, voices=3, spread=7.0), role="pad"),
        "pluck": Part("kalimba", gain_db=-3, pan=0.15, lp=4500, send=0.55, jitter_ms=0, vel_var=0.05, kw=dict(tine=0.6), role="melody"),
    }
    return Track(s, parts, ALLOWED, dict(rt60=3.0, hi_ratio=0.4))


bgm_focus = registry.music("bgm.focus", "bgm_focus", "canvas", bpm=60, bars=16, key="C sus2/add9 (no 3rd)", kbps=48, rms_db=-26.7,
                           desc="Calm minimal bed for drawing and the prediction/decision screens: one soft pad, rare plucks, no tension.")(reg("bgm.focus", build))
