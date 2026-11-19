#!/usr/bin/env python3
"""R20-FIX P0.1 — honest, sequential, stateful evaluation of the adaptive low-light detector policy (A4).

Why this exists (audit finding)
-------------------------------
`augment_hg5g.py::summarize_benchmark` reported `adaptive_union_recall = RAW or CLAHE or A3 succeeded`.
That is an ORACLE UPPER BOUND (three independent detector calls per frame, any success wins). It is not what the
browser worker does: the worker runs ONE detector call per frame, in VIDEO mode (tracking state), and only decides
the next preprocess pass from past misses. This script separates

    raw_recall               A0 only, VIDEO mode, sequential
    oracle_union_recall      the old number (3 stateless IMAGE-mode calls, any hit)  -> upper bound, NOT a result
    actual_adaptive_recall   the real policy, frame by frame, with missingness state and a detector-call budget

Method
------
* Each source image (HandGesture-5G TRAIN subset, CC BY 4.0, cached in the sandbox) becomes a SYNTHETIC SEQUENCE of
  N frames @30 fps: small sinusoidal translation / scale drift + a FRESH sensor-noise realisation per frame
  (shot + read noise in linear light), same photometric condition for all frames. This is derived from stills and is
  NOT a physical camera recording; it is a stand-in until the Owner night webcam run.
* The reference hand centre comes from a detection on the CLEAN base image. Sequences whose clean image has no hand
  are excluded from the primary denominator (a degradation can only lose a hand that existed) but are also counted.
* A frame counts as a correct hit only when a detected hand centre lies within 0.20 (normalised) of the reference.
* Cost: every detector call and preprocessing step is timed (native CPU MediaPipe here; the browser WASM numbers come
  from the Chromium worker harness, see run_a4_browser_sequences.mjs).

Policies compared (all VIDEO mode, numHands=2, same thresholds as the app):
  P0_raw            A0 only
  P1_clahe_always   CLAHE320 every frame
  P2_a3_always      A3 (gamma+denoise+CLAHE320) every frame
  P3_shipped_alt    the policy shipped in R20 worker: one call per frame, alternate RAW/A3 on misses while dim
  P4_a4s_sameframe  RAW (or A3 while it works); on a miss in dim/backlit light probe the other pass on the SAME frame
  P5_a5s            as P4 but recovery pass = A5 (gain normalisation + 3x3 denoise + CLAHE)
  P6_a5t            as P5 with a 3-frame temporal mean before enhancement (static-hand SNR gain)
"""
from __future__ import annotations

import argparse
import collections
import concurrent.futures as cf
import json
import math
import os
import sys
import time

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from augment_hg5g import AUGS, CACHE, preprocess_a3_gamma_denoise_clahe320, select_cohort_rows, train_rows  # noqa: E402
from mp_common import build_landmarker, clahe_rgb_exact, compute_luma_stats, extract_mp_result  # noqa: E402
import mediapipe as mp  # noqa: E402

SANDBOX = os.environ.get("R20_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r20-sandbox")
OUT_DIR = f"{SANDBOX}/data/aug"
N_FRAMES = 24
FRAME_MS = 33
DIM_RECOVERY_LUMA = 0.36
HIT_RADIUS = 0.20

POLICIES = ["P0_raw", "P1_clahe_always", "P2_a3_always", "P3_shipped_alt", "P4_a4s_sameframe", "P5_a5s", "P6_a5t"]


# ---------------------------------------------------------------- preprocessing candidates
def preprocess_a5(s320: np.ndarray, mean_l: float, temporal: list[np.ndarray] | None = None) -> np.ndarray:
    """A5: auto-gain to a target mean luma, 3x3 denoise, moderated CLAHE. Optional temporal mean of the last frames.

    The gain is applied in the encoded domain (cheap in TypeScript: one multiply per channel). Gain is capped so a
    pure-noise frame is not blown up into confident texture."""
    work = s320
    if temporal:
        stack = np.stack([s320.astype(np.float32)] + [t.astype(np.float32) for t in temporal], axis=0)
        work = np.clip(stack.mean(axis=0) + 0.5, 0, 255).astype(np.uint8)
    work = cv2.GaussianBlur(work, (3, 3), 0.85)
    m = max(mean_l, 0.015)
    gain = float(np.clip(0.36 / m, 1.0, 5.0))
    if gain > 1.02:
        work = np.clip(work.astype(np.float32) * gain, 0, 255).astype(np.uint8)
    return clahe_rgb_exact(work, tiles_x=8, tiles_y=8, clip_limit=2.0)


def detect(det, rgb_u8, ts=None):
    img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb_u8))
    return det.detect_for_video(img, ts) if ts is not None else det.detect(img)


def hand_center(hand) -> tuple[float, float]:
    lm = hand["landmarks"]
    return 0.5 * (lm[0][0] + lm[9][0]), 0.5 * (lm[0][1] + lm[9][1])


def is_correct(res: dict, ref: tuple[float, float] | None) -> bool:
    if ref is None:
        return res["n_hands"] > 0
    for h in res["hands"]:
        cx, cy = hand_center(h)
        if math.hypot(cx - ref[0], cy - ref[1]) <= HIT_RADIUS:
            return True
    return False


# ---------------------------------------------------------------- synthetic sequence
def make_sequence(base: np.ndarray, aug_fn, seed: int) -> list[np.ndarray]:
    h, w = base.shape[:2]
    frames = []
    for k in range(N_FRAMES):
        rng = np.random.default_rng(seed * 1000 + k)
        dx = 0.012 * w * math.sin(2 * math.pi * k / 18.0)
        dy = 0.010 * h * math.sin(2 * math.pi * k / 14.0 + 1.0)
        sc = 1.0 + 0.012 * math.sin(2 * math.pi * k / 21.0)
        M = np.array([[sc, 0, dx + (1 - sc) * w / 2], [0, sc, dy + (1 - sc) * h / 2]], np.float32)
        moved = cv2.warpAffine(base, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        frames.append(aug_fn(moved, rng))
    return frames


class PolicyRunner:
    """One policy = one VIDEO-mode landmarker + the missingness state the browser worker keeps."""

    def __init__(self, name: str):
        self.name = name
        self.det = build_landmarker("VIDEO")
        self.ts = 0
        self.misses = 0
        self.recovery_worked = False
        self.last_luma = None
        self.last_center = None
        self.dim = False
        self.backlight = False
        self.hist: collections.deque = collections.deque(maxlen=2)  # previous raw s320 frames (temporal)
        self.calls = 0
        self.pre_ms = 0.0
        self.det_ms = 0.0
        self.pass_use = collections.Counter()

    def close(self):
        try:
            self.det.close()
        except Exception:
            pass

    def _luma(self, frame, k):
        # the worker samples luma every 400 ms (~12 frames @30fps); first frame always
        if self.last_luma is None or k % 12 == 0:
            st = compute_luma_stats(frame)
            self.last_luma = st["mean_luma"]
            self.last_center = st["center_luma"]
            self.backlight = st["is_backlight"]
            self.dim = (st["mean_luma"] < DIM_RECOVERY_LUMA) or st["is_backlight"]
            return st["scaled_320"]
        return None

    def _call(self, rgb, pre_ms, passname, aspect):
        self.ts += FRAME_MS
        t0 = time.perf_counter()
        res = extract_mp_result(detect(self.det, rgb, self.ts), aspect)
        self.det_ms += (time.perf_counter() - t0) * 1000.0
        self.pre_ms += pre_ms
        self.calls += 1
        self.pass_use[passname] += 1
        return res

    def _s320(self, frame):
        h, w = frame.shape[:2]
        return cv2.resize(frame, (320, max(1, round(320 * h / w))), interpolation=cv2.INTER_LINEAR)

    def _enh_a3(self, frame):
        t0 = time.perf_counter()
        s = self._s320(frame)
        out = preprocess_a3_gamma_denoise_clahe320(s, self.last_luma)
        return out, (time.perf_counter() - t0) * 1000.0

    def _enh_a5(self, frame, temporal):
        t0 = time.perf_counter()
        s = self._s320(frame)
        out = preprocess_a5(s, self.last_luma, temporal)
        return out, (time.perf_counter() - t0) * 1000.0

    def step(self, frame: np.ndarray, k: int):
        """Returns the single result delivered to the app for this frame."""
        h, w = frame.shape[:2]
        aspect = w / h
        self._luma(frame, k)
        n = self.name
        if n == "P0_raw":
            res = self._call(frame, 0.0, "A0", aspect)
        elif n == "P1_clahe_always":
            t0 = time.perf_counter()
            c = clahe_rgb_exact(self._s320(frame))
            res = self._call(c, (time.perf_counter() - t0) * 1000.0, "CLAHE", aspect)
        elif n == "P2_a3_always":
            a3, ms = self._enh_a3(frame)
            res = self._call(a3, ms, "A3", aspect)
        elif n == "P3_shipped_alt":
            enhance = self.dim and (self.recovery_worked or (self.misses > 0 and self.misses % 2 == 1))
            if enhance:
                a3, ms = self._enh_a3(frame)
                res = self._call(a3, ms, "A3", aspect)
                self.recovery_worked = res["n_hands"] > 0
            else:
                res = self._call(frame, 0.0, "A0", aspect)
                if res["n_hands"] > 0:
                    self.recovery_worked = False
            self.misses = 0 if res["n_hands"] > 0 else self.misses + 1
        elif n in ("P4_a4s_sameframe", "P5_a5s", "P6_a5t"):
            temporal = None
            if n == "P6_a5t" and len(self.hist) > 0:
                temporal = list(self.hist)
            s_now = None
            if n == "P6_a5t":
                s_now = self._s320(frame)

            def enh():
                if n == "P4_a4s_sameframe":
                    return self._enh_a3(frame), "A3"
                return self._enh_a5(frame, temporal), "A5"

            if self.dim and self.recovery_worked:
                (img, ms), pname = enh()
                res = self._call(img, ms, pname, aspect)
                if res["n_hands"] == 0:  # recovery pass failed -> try raw on the same frame (2nd call)
                    res2 = self._call(frame, 0.0, "A0", aspect)
                    if res2["n_hands"] > 0:
                        res = res2
                        self.recovery_worked = False
            else:
                res = self._call(frame, 0.0, "A0", aspect)
                if res["n_hands"] == 0 and self.dim:
                    (img, ms), pname = enh()
                    res2 = self._call(img, ms, pname, aspect)
                    if res2["n_hands"] > 0:
                        res = res2
                        self.recovery_worked = True
            if s_now is not None:
                self.hist.append(s_now)
            self.misses = 0 if res["n_hands"] > 0 else self.misses + 1
        else:
            raise ValueError(n)
        return res


def run_sequence(args):
    sid, cls, label, aug_name, seed, base_path = args
    bgr = cv2.imread(base_path)
    if bgr is None:
        return None
    base = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    h, w = base.shape[:2]
    aspect = w / h
    # reference from CLEAN base image
    det_img = build_landmarker("IMAGE")
    ref_res = extract_mp_result(detect(det_img, base), aspect)
    ref = hand_center(ref_res["hands"][0]) if ref_res["n_hands"] else None
    frames = make_sequence(base, AUGS[aug_name], seed)
    mean_lumas = [compute_luma_stats(f)["mean_luma"] for f in frames[:1]]

    # oracle union: 3 stateless IMAGE-mode calls per frame (the old, misleading number)
    oracle = []
    for f in frames:
        st = compute_luma_stats(f)
        s320 = st["scaled_320"]
        r0 = extract_mp_result(detect(det_img, f), aspect)
        r1 = extract_mp_result(detect(det_img, clahe_rgb_exact(s320)), aspect)
        r3 = extract_mp_result(detect(det_img, preprocess_a3_gamma_denoise_clahe320(s320, st["mean_luma"])), aspect)
        oracle.append(int(is_correct(r0, ref) or is_correct(r1, ref) or is_correct(r3, ref)))
    det_img.close()

    out = {
        "sample_id": sid,
        "cls": cls,
        "label": label,
        "aug": aug_name,
        "mean_luma": mean_lumas[0],
        "ref_detected": ref is not None,
        "n_frames": N_FRAMES,
        "oracle_union_hits": oracle,
        "policies": {},
    }
    for pol in POLICIES:
        pr = PolicyRunner(pol)
        hits, hands = [], []
        for k, f in enumerate(frames):
            res = pr.step(f, k)
            hits.append(int(is_correct(res, ref)))
            hands.append(res["n_hands"])
        pr.close()
        first = next((i for i, x in enumerate(hits) if x), None)
        out["policies"][pol] = {
            "hits": hits,
            "calls": pr.calls,
            "pre_ms": round(pr.pre_ms, 2),
            "det_ms": round(pr.det_ms, 2),
            "first_hit_frame": first,
            "passes": dict(pr.pass_use),
            "no_hand_frames": int(sum(1 for x in hands if x == 0)),
        }
    return out


def summarize(rows: list[dict]) -> dict:
    def agg(sub, key=None):
        res = {}
        nref = [r for r in sub if r["ref_detected"]]
        res["n_sequences"] = len(sub)
        res["n_sequences_ref_detectable"] = len(nref)
        tot_frames = sum(r["n_frames"] for r in nref) or 1
        res["oracle_union_recall"] = round(sum(sum(r["oracle_union_hits"]) for r in nref) / tot_frames, 4)
        pol = {}
        for p in POLICIES:
            hits = sum(sum(r["policies"][p]["hits"]) for r in nref)
            calls = sum(r["policies"][p]["calls"] for r in nref)
            pre = sum(r["policies"][p]["pre_ms"] for r in nref)
            det = sum(r["policies"][p]["det_ms"] for r in nref)
            # post-acquisition: frames from the first correct hit onwards
            post_hits = post_frames = 0
            firsts = []
            never = 0
            for r in nref:
                fh = r["policies"][p]["first_hit_frame"]
                if fh is None:
                    never += 1
                    continue
                firsts.append(fh)
                post_frames += r["n_frames"] - fh
                post_hits += sum(r["policies"][p]["hits"][fh:])
            pol[p] = {
                "recall_all_frames": round(hits / tot_frames, 4),
                "recall_after_first_hit": round(post_hits / post_frames, 4) if post_frames else None,
                "sequences_never_detected": never,
                "median_first_hit_frame": float(np.median(firsts)) if firsts else None,
                "detector_calls_per_frame": round(calls / tot_frames, 3),
                "preprocess_ms_per_frame_native": round(pre / tot_frames, 3),
                "detect_ms_per_frame_native": round(det / tot_frames, 3),
                "recovery_overhead_calls_vs_raw": round(calls / tot_frames - 1.0, 3),
            }
        res["policies"] = pol
        return res

    by_aug = {}
    for aug in AUGS:
        sub = [r for r in rows if r["aug"] == aug]
        if sub:
            by_aug[aug] = agg(sub)
            by_aug[aug]["mean_luma_avg"] = round(float(np.mean([r["mean_luma"] for r in sub])), 4)
    return {"overall": agg(rows), "by_condition": by_aug}


def pick_images(n_per_class: int) -> list[dict]:
    rows = select_cohort_rows(train_rows())
    chosen, cnt = [], collections.Counter()
    for r in rows:
        k = r["class_name"] if r["class_name"] in ("L-Sign", "Pointing Up") else "OTHER"
        if cnt[k] < n_per_class:
            cnt[k] += 1
            chosen.append(r)
    return chosen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=40)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out", default=f"{OUT_DIR}/a4_sequential_eval.json")
    ap.add_argument("--conds", default="")
    a = ap.parse_args()
    imgs = pick_images(a.per_class)
    conds = [c for c in AUGS if (not a.conds or c in a.conds.split(","))]
    jobs = []
    for r in imgs:
        lbl = {"L-Sign": "POINT_PRESS", "Pointing Up": "POINT_READY"}.get(r["class_name"], "OTHER")
        idn = int(r["sample_id"].split("_")[1])
        for ci, c in enumerate(conds):
            jobs.append((r["sample_id"], r["class_name"], lbl, c, 20261120 + idn * 97 + ci, f"{CACHE}/{r['sample_id']}.jpg"))
    print(f"[a4seq] images={len(imgs)} conds={len(conds)} sequences={len(jobs)} frames/seq={N_FRAMES}", flush=True)
    t0 = time.time()
    rows = []
    with cf.ProcessPoolExecutor(max_workers=a.workers) as ex:
        for i, r in enumerate(ex.map(run_sequence, jobs, chunksize=4)):
            if r is not None:
                rows.append(r)
            if (i + 1) % 100 == 0:
                print(f"[a4seq] {i + 1}/{len(jobs)} {time.time() - t0:.0f}s", flush=True)
    summ = summarize(rows)
    summ["config"] = {
        "images": len(imgs),
        "conditions": conds,
        "frames_per_sequence": N_FRAMES,
        "fps": 1000 / FRAME_MS,
        "hit_radius_norm": HIT_RADIUS,
        "policies": POLICIES,
        "note": "synthetic sequences derived from still images; NOT a physical webcam recording",
        "elapsed_s": round(time.time() - t0, 1),
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump({"summary": summ, "rows": rows}, f)
    with open(a.out.replace(".json", "_summary.json"), "w") as f:
        json.dump(summ, f, indent=2)
    print(json.dumps(summ["overall"], indent=2))


if __name__ == "__main__":
    main()
