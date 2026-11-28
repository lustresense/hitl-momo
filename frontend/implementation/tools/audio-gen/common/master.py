"""Mastering, measurement, QA gates and Opus encoding shared by the SFX and music generators."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy.io import wavfile

from . import dsp
from .dsp import SR, db, peak, rms


def write_wav(path: str | Path, x: np.ndarray) -> None:
    wavfile.write(str(path), SR, np.asarray(x, dtype=np.float32))


def trim_silence(x: np.ndarray, floor_db: float = -66.0, keep_ms: float = 8.0) -> np.ndarray:
    """Trim leading silence (latency!) and trailing silence below floor_db."""
    xs = x if x.ndim == 1 else np.max(np.abs(x), axis=1)
    a = np.abs(xs)
    th = db(floor_db)
    idx = np.flatnonzero(a > th)
    if idx.size == 0:
        return x
    keep = int(keep_ms / 1000 * SR)
    lo = max(0, idx[0] - keep)
    hi = min(x.shape[0], idx[-1] + keep)
    return x[lo:hi]


def finalize_sfx(x: np.ndarray, peak_db: float = -3.0, fade_in_ms: float = 0.8, fade_out_ms: float = 12.0, stereo: bool = False) -> np.ndarray:
    """One-shot SFX: DC block, trim, tiny fades (no clicks), peak-normalise to peak_db (true-peak safe margin)."""
    x = dsp.dc_block(x)
    x = trim_silence(x)
    x = dsp.fade(x, fin=fade_in_ms / 1000, fout=fade_out_ms / 1000, curve="lin")
    if not stereo and x.ndim == 2:
        x = x.mean(axis=1)
    if stereo and x.ndim == 1:
        x = np.stack([x, x], axis=1)
    return dsp.normalize_peak(x, peak_db)


def finalize_loop(x: np.ndarray, target_rms_db: float = -22.0, ceiling_db: float = -2.0) -> np.ndarray:
    """Music/ambience loops: DC block, gentle glue compression, RMS-target, safety limiter. Loop length is preserved exactly."""
    x = dsp.dc_block(dsp.to_stereo(x))
    x = dsp.compressor_fast(x, thresh_db=-20.0, ratio=2.0, release=0.2)
    cur = rms(x)
    if cur > 0:
        x = x * (db(target_rms_db) / cur)
    return dsp.limiter(x, ceiling_db=ceiling_db)


def encode_opus(wav: Path, ogg: Path, kbps: int = 64, application: str = "audio") -> None:
    ogg.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-c:a", "libopus", "-b:a", f"{kbps}k", "-vbr", "on", "-application", application, "-frame_duration", "20", str(ogg)],
        check=True,
    )


def decode_to_array(path: Path) -> np.ndarray:
    """Decode an encoded asset back to float32 stereo/mono via ffmpeg (used to QA what the browser will really get)."""
    with tempfile.TemporaryDirectory() as d:
        out = Path(d) / "x.wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-ar", str(SR), "-c:a", "pcm_f32le", str(out)], check=True)
        sr, data = wavfile.read(str(out))
        return data.astype(np.float64)


def ebur128(path: Path) -> dict:
    """Integrated loudness (LUFS), loudness range and true peak (dBTP) of a file using ffmpeg's ebur128 filter."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    txt = r.stderr
    def grab(pat):
        m = re.findall(pat, txt)
        return float(m[-1]) if m else None
    return {"lufs_i": grab(r"I:\s+(-?[\d.]+)\s+LUFS"), "lra": grab(r"LRA:\s+(-?[\d.]+)\s+LU"), "true_peak_db": grab(r"Peak:\s+(-?[\d.]+)\s+dBFS")}


def sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def spectral_report(x: np.ndarray) -> dict:
    """Objective harshness indicators (we cannot listen in CI, so we measure)."""
    m = x if x.ndim == 1 else x.mean(axis=1)
    if m.shape[0] < 2048:
        m = np.pad(m, (0, 2048 - m.shape[0]))
    n = 1 << int(np.floor(np.log2(min(m.shape[0], 1 << 18))))
    seg = m[:n] * np.hanning(n)
    P = np.abs(np.fft.rfft(seg)) ** 2
    f = np.fft.rfftfreq(n, 1 / SR)
    tot = P.sum() + 1e-18
    centroid = float((f * P).sum() / tot)
    band = lambda lo, hi: float(P[(f >= lo) & (f < hi)].sum() / tot)
    return {"centroid_hz": round(centroid, 1), "low_lt_200": round(band(0, 200), 4), "mid_200_2k": round(band(200, 2000), 4), "presence_2k_5k": round(band(2000, 5000), 4), "air_gt_5k": round(band(5000, 24000), 4), "air_gt_10k": round(band(10000, 24000), 5)}


def qa_sfx(name: str, x: np.ndarray) -> list[str]:
    issues = []
    pk = peak(x)
    if pk > 0.995:
        issues.append(f"clip risk peak={pk:.3f}")
    if abs(float(np.mean(x))) > 0.01:
        issues.append("dc offset")
    lead = np.flatnonzero((np.abs(x if x.ndim == 1 else x.max(axis=1))) > db(-50))
    if lead.size and lead[0] / SR > 0.02:
        issues.append(f"leading silence {lead[0] / SR * 1000:.0f} ms (latency)")
    tail = x[-int(0.02 * SR):]
    if rms(tail) > db(-45):
        issues.append("tail not decayed (click risk)")
    sr = spectral_report(x)
    if sr["presence_2k_5k"] > 0.55 and sr["air_gt_5k"] > 0.25:
        issues.append(f"harsh: presence {sr['presence_2k_5k']} air {sr['air_gt_5k']}")
    return issues


def qa_loop(name: str, x: np.ndarray, relaxed: bool = False) -> list[str]:
    issues = []
    xs = dsp.to_stereo(x)
    if peak(xs) > 0.99:
        issues.append(f"clip risk peak={peak(xs):.3f}")
    jump = float(np.max(np.abs(xs[0] - xs[-1])))
    slope = float(np.max(np.abs(xs[1] - xs[0])))
    if jump > max(0.02, 4 * slope):
        issues.append(f"loop seam jump {jump:.4f} (slope {slope:.4f})")
    sr = spectral_report(xs)
    if sr["presence_2k_5k"] > (0.62 if relaxed else 0.4):
        issues.append(f"harsh: presence {sr['presence_2k_5k']}")
    if sr["air_gt_10k"] > (0.05 if relaxed else 0.02):
        issues.append(f"too bright: >10k {sr['air_gt_10k']}")
    return issues
