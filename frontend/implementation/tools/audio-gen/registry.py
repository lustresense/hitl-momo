"""Asset registry shared by the generators.

Generator modules declare assets with the decorators below. `build_all.py` renders, masters, encodes (Opus/Ogg),
QA-checks, measures and writes public/audio/manifest.json plus src/audio/registry/assets.generated.ts.

Contract:
  sfx(...)      fn(rng) -> mono or stereo float array, any level (mastering normalises to peak_db). One-shot, trimmed automatically.
  ambience(...) fn(rng) -> stereo float array of EXACT loop length (seamless loop, build it with dsp.loop_wrap). Level is set by target RMS.
  music(...)    fn(rng) -> stereo float array of EXACT loop length (seamless loop). bpm/bars document the length.
  stinger(...)  fn(rng) -> stereo float array, one-shot jingle (not looped), keeps its natural tail.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

SPECS: dict[str, "Spec"] = {}


@dataclass
class Spec:
    id: str                      # e.g. "sfx.paper.flip.1" (dot-separated, lowercase)
    file: str                    # file stem, e.g. "paper_flip_1" -> public/audio/<kind>/<file>.ogg
    kind: str                    # sfx | amb | music | stinger
    group: str                   # preload group: core | cover | tutorial | canvas | world | ending | dream ...
    bus: str                     # sfx | ui | music | amb
    fn: Callable
    desc: str = ""
    loop: bool = False
    stereo: bool = False
    peak_db: float = -4.0        # sfx/stinger peak target
    rms_db: float = -22.0        # loops target RMS (music/amb)
    kbps: int = 48
    meta: dict = field(default_factory=dict)


def _reg(spec: Spec) -> None:
    assert spec.id not in SPECS, f"duplicate asset id {spec.id}"
    assert spec.id == spec.id.lower() and " " not in spec.id
    SPECS[spec.id] = spec


def sfx(id: str, file: str, group: str, bus: str = "sfx", stereo: bool = False, peak_db: float = -4.0, kbps: int = 40, desc: str = "", **meta):
    def deco(fn):
        _reg(Spec(id, file, "sfx", group, bus, fn, desc, False, stereo, peak_db, -22.0, kbps, meta))
        return fn
    return deco


def stinger(id: str, file: str, group: str, peak_db: float = -3.0, kbps: int = 64, desc: str = "", **meta):
    def deco(fn):
        _reg(Spec(id, file, "stinger", group, "music", fn, desc, False, True, peak_db, -22.0, kbps, meta))
        return fn
    return deco


def ambience(id: str, file: str, group: str, rms_db: float = -34.0, kbps: int = 40, desc: str = "", **meta):
    def deco(fn):
        _reg(Spec(id, file, "amb", group, "amb", fn, desc, True, True, -4.0, rms_db, kbps, meta))
        return fn
    return deco


def music(id: str, file: str, group: str, bpm: float, bars: int, key: str, rms_db: float = -23.0, kbps: int = 64, desc: str = "", **meta):
    meta = {**meta, "bpm": bpm, "bars": bars, "key": key}
    def deco(fn):
        _reg(Spec(id, file, "music", group, "music", fn, desc, True, True, -4.0, rms_db, kbps, meta))
        return fn
    return deco
