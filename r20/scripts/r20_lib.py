"""Shared helpers for R20 training/eval (numpy only; no torch import here)."""
from __future__ import annotations

import hashlib
import json
import os

import numpy as np

LABELS = ["POINT_READY", "POINT_PRESS", "OTHER"]
READY, PRESS, OTHER = 0, 1, 2

SANDBOX = os.environ.get("R20_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r20-sandbox")
REPO = os.environ.get("R20_REPO", "/srv/sketchbook/mediapipe-optimize/research-can")
FEAT_DIR = os.environ.get("R20_FEAT_OUT", f"{SANDBOX}/data/feat")


def load_split(feat_dir: str, prefix: str, split: str):
    with open(os.path.join(feat_dir, f"{prefix}_{split}.meta.json"), "r", encoding="utf-8") as f:
        meta = json.load(f)
    d = int(meta["feature_count"])
    X = np.fromfile(os.path.join(feat_dir, f"{prefix}_{split}.f32"), dtype=np.float32).reshape(-1, d)
    y = np.asarray(meta["y"], dtype=np.int64)
    assert X.shape[0] == y.shape[0] == int(meta["rows"]), "row mismatch"
    assert np.all(np.isfinite(X)), "non-finite features"
    return meta, X, y


def softmax(z: np.ndarray) -> np.ndarray:
    zm = z - z.max(axis=1, keepdims=True)
    e = np.exp(zm)
    return e / e.sum(axis=1, keepdims=True)


def forward_exported(doc: dict, X: np.ndarray) -> np.ndarray:
    """Float64 forward pass of an exported R19/R20 JSON model; returns temperature-scaled logits/T."""
    mean = np.asarray(doc["mean"], dtype=np.float64)
    std = np.asarray(doc["std"], dtype=np.float64)
    std = np.where(std > 1e-6, std, 1.0)
    h = (X.astype(np.float64) - mean) / std
    layers = doc["layers"]
    for i, l in enumerate(layers):
        h = h @ np.asarray(l["W"], dtype=np.float64) + np.asarray(l["b"], dtype=np.float64)
        if i < len(layers) - 1:
            h = np.maximum(h, 0.0)
    return h / float(doc.get("temperature", 1.0))


def confusion(y: np.ndarray, p: np.ndarray, k: int = 3) -> np.ndarray:
    c = np.zeros((k, k), dtype=np.int64)
    np.add.at(c, (y, p), 1)
    return c


def wilson(k: int, n: int, z: float = 1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (round(float(max(0.0, c - h)), 4), round(float(min(1.0, c + h)), 4))


def metrics(y: np.ndarray, pred: np.ndarray, k: int = 3) -> dict:
    c = confusion(y, pred, k)
    tp = np.diag(c).astype(float)
    sup = c.sum(1).astype(float)
    pr = c.sum(0).astype(float)
    prec = np.divide(tp, pr, out=np.zeros_like(tp), where=pr > 0)
    rec = np.divide(tp, sup, out=np.zeros_like(tp), where=sup > 0)
    f1 = np.divide(2 * prec * rec, prec + rec, out=np.zeros_like(prec), where=(prec + rec) > 0)
    n_other = int(sup[OTHER])
    fp_press = int(c[OTHER, PRESS])
    ready_to_press = int(c[READY, PRESS])
    return {
        "n": int(c.sum()),
        "acc": round(float(tp.sum() / max(1, c.sum())), 4),
        "macroF1": round(float(np.mean(f1[sup > 0])), 4),
        "f1_ready": round(float(f1[READY]), 4),
        "f1_press": round(float(f1[PRESS]), 4),
        "recall_ready": round(float(rec[READY]), 4),
        "recall_press": round(float(rec[PRESS]), 4),
        "precision_press": round(float(prec[PRESS]), 4),
        "support": [int(s) for s in sup],
        "other_to_press": fp_press,
        "other_to_press_rate": round(fp_press / max(1, n_other), 5),
        "other_to_press_wilson95": wilson(fp_press, n_other),
        "ready_to_press": ready_to_press,
        "other_to_ready": int(c[OTHER, READY]),
        "confusion": c.tolist(),
    }


def slice_metrics(y: np.ndarray, pred: np.ndarray, tags: list[str]) -> dict:
    out = {}
    tags_a = np.asarray(tags)
    for t in sorted(set(tags)):
        m = tags_a == t
        c = confusion(y[m], pred[m])
        sup = c.sum(1)
        out[t] = {
            "n": int(m.sum()),
            "support": [int(s) for s in sup],
            "acc": round(float(np.trace(c) / max(1, c.sum())), 4),
            "recall_press": round(float(c[PRESS, PRESS] / sup[PRESS]), 4) if sup[PRESS] else None,
            "recall_ready": round(float(c[READY, READY] / sup[READY]), 4) if sup[READY] else None,
            "other_to_press": int(c[OTHER, PRESS]),
            "other_to_press_rate": round(float(c[OTHER, PRESS] / sup[OTHER]), 5) if sup[OTHER] else None,
        }
    return out


def nll_ece(probs: np.ndarray, y: np.ndarray, bins: int = 15):
    n = len(y)
    nll = float(-np.mean(np.log(np.clip(probs[np.arange(n), y], 1e-7, 1.0))))
    conf = probs.max(1)
    acc = (probs.argmax(1) == y).astype(np.float64)
    ece = 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        mk = (conf >= lo) & ((conf < hi) if b < bins - 1 else (conf <= hi))
        if mk.any():
            ece += mk.sum() / n * abs(acc[mk].mean() - conf[mk].mean())
    return round(nll, 5), round(float(ece), 5)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
