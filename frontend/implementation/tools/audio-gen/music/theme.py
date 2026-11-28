"""Shared musical identity and the glue between score builders and the registry.

KITE MOTIF (C major pentatonic = C D E G A = A minor pentatonic), 2 bars of 4/4, lilting rhythm:
    bar 1:  G4 (1)  A4 (1/2)  C5 (1 1/2)  A4 (1)
    bar 2:  G4 (1)  E4 (1)    D4 (1)      rest (1)
Every track quotes or transforms it (see docs/audio/MUSIC_DESIGN.md).
"""
from __future__ import annotations

from dataclasses import dataclass, field

from common import instr_music as im

KITE = "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 r:1"
KITE_ANSWER = "G4:1 A4:.5 C5:1.5 A4:1 | G4:1 E4:1 D4:1 C4:1"       # same figure, lands on the tonic
KITE_INV = "G4:1 E4:.5 D4:1.5 E4:1 | G4:1 A4:1 C5:1 r:1"            # inversion (pentatonic degrees mirrored), used by l3
BUILDERS: dict = {}


@dataclass
class Track:
    score: im.Score
    parts: dict
    allowed: set                       # pitch classes the pitched parts may use
    render: dict = field(default_factory=dict)
    exceptions: str = ""               # documented out-of-set notes
    sets: dict = field(default_factory=dict)   # optional per-part pitch-class sets, overrides `allowed`


def make(builder):
    """fn(rng) for the registry from a builder() -> Track."""
    def fn(rng):
        t = builder()
        return im.render(t.score, t.parts, rng, **t.render)
    return fn


def reg(id: str, builder):
    BUILDERS[id] = builder
    return make(builder)
