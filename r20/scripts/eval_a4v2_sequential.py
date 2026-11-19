#!/usr/bin/env python3
"""R20-FIX P0.1 — Sequential VIDEO-mode evaluation of A4v2 (Chroma-Preserving Motion-Gated Temporal EMA +
Separable Median-5 + Reinhard LUT) merged apples-to-apples with the baseline sequential run (`a4_seq_run1_summary.json`).

Outputs:
  1. `r20/results/r20_a4_sequential_audit.json`:
     - Explicitly separates `oracle_union_recall` (upper bound ONLY), `P0_raw`, `P1_clahe_always`,
       `P2_a3_always`, `P3_shipped_alt` (old R20 A4), `P4_a4s_sameframe` (old same-frame A3),
       `P7_a4v2_chroma_singlecall` (NEW R20-FIX A4v2, 1.000 detector call/frame), and
       `P8_a4v2_chroma_sameframe` (same-frame A4v2 probe, reporting exact detector-call overhead).
  2. `r20-sandbox/data/aug/a4v2_detected_landmarks.jsonl`:
     - Every frame (both HAND and DETECTOR_MISS) of `P0_raw` and `P7_a4v2_chroma_singlecall` so the exact
       TypeScript C0/C4/C7 classifiers can measure DETECTOR_MISS vs CLASSIFIER_ERROR per condition.
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
from augment_hg5g import AUGS, CACHE  # noqa: E402
from eval_a4_sequential import FRAME_MS, HIT_RADIUS, N_FRAMES, detect, hand_center, is_correct, make_sequence, pick_images  # noqa: E402
from mp_common import build_landmarker, compute_luma_stats, extract_mp_result  # noqa: E402

SANDBOX = os.environ.get("R20_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r20-sandbox")
REPO = os.environ.get("R20_REPO", "/srv/sketchbook/mediapipe-optimize/research-can")
BASELINE_RUN1 = f"{SANDBOX}/data/aug/a4_seq_run1_summary.json"
OUT_JSON = f"{REPO}/r20/results/r20_a4_sequential_audit.json"
OUT_LM_JSONL = f"{SANDBOX}/data/aug/a4v2_detected_landmarks.jsonl"

DIM_RECOVERY_LUMA = 0.52  # exact match of r20-lowlight.ts R20_DIM_RECOVERY_LUMA
POLICIES = ["P0_raw", "P7_a4v2_chroma_singlecall", "P8_a4v2_chroma_sameframe"]


def sep_median5_rgb(rgb: np.ndarray) -> np.ndarray:
    """Exact Python mirror of sepMedian5RgbaInPlace in r20-lowlight.ts (5-tap H then 5-tap V)."""
    a = np.pad(rgb, ((0, 0), (2, 2), (0, 0)), mode="edge")
    hmed = np.median(np.stack([a[:, :-4], a[:, 1:-3], a[:, 2:-2], a[:, 3:-1], a[:, 4:]], axis=0), axis=0).astype(np.uint8)
    b = np.pad(hmed, ((2, 2), (0, 0), (0, 0)), mode="edge")
    return np.median(np.stack([b[:-4], b[1:-3], b[2:-2], b[3:-1], b[4:]], axis=0), axis=0).astype(np.uint8)


def motion_gated_ema(curr: np.ndarray, prev: np.ndarray | None, thresh: int = 28) -> tuple[np.ndarray, np.ndarray]:
    """Exact Python mirror of motionGatedTemporalEmaInPlace in r20-lowlight.ts."""
    if prev is None or prev.shape != curr.shape:
        cp = curr.copy()
        return cp, cp.copy()
    diff = np.abs(curr.astype(np.int16) - prev.astype(np.int16))
    still = (diff[..., 0] < thresh) & (diff[..., 1] < thresh) & (diff[..., 2] < thresh)
    blended = ((curr.astype(np.int16) * 3 + prev.astype(np.int16) * 5 + 4) >> 3).astype(np.uint8)
    out = np.where(still[..., None], blended, curr)
    return out, out.copy()


def reinhard_lut(rgb: np.ndarray, mean_l: float, target: float = 0.48) -> np.ndarray:
    """Exact Python mirror of reinhardExposureLutInPlace in r20-lowlight.ts."""
    m = max(mean_l, 0.015)
    k = float(np.clip(target / m, 1.0, 14.0))
    if k <= 1.04:
        return rgb
    x = np.arange(256, dtype=np.float32) / 255.0
    y = (k * x) / (1.0 + (k - 1.0) * x)
    lut = np.rint(np.clip(y, 0.0, 1.0) * 255.0).astype(np.uint8)
    return lut[rgb]


def apply_a4v2_chroma(s320: np.ndarray, mean_l: float, prev: np.ndarray | None) -> tuple[np.ndarray, np.ndarray]:
    ema_out, next_prev = motion_gated_ema(s320, prev, 28)
    med = sep_median5_rgb(ema_out)
    if mean_l < 0.14:
        med = cv2.GaussianBlur(med, (3, 3), 0.75)
    return reinhard_lut(med, mean_l, 0.48), next_prev


class A4v2PolicyRunner:
    def __init__(self, name: str):
        self.name = name
        self.det = build_landmarker("VIDEO")
        self.ts = 0
        self.misses = 0
        self.recovery_worked = False
        self.last_luma: float | None = None
        self.backlight = False
        self.dim = False
        self.temporal_prev: np.ndarray | None = None
        self.calls = 0
        self.pre_ms = 0.0
        self.det_ms = 0.0
        self.pass_use = collections.Counter()

    def close(self):
        try:
            self.det.close()
        except Exception:
            pass

    def _s320(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        return cv2.resize(frame, (320, max(1, round(320 * h / w))), interpolation=cv2.INTER_AREA)

    def _luma(self, frame: np.ndarray, k: int) -> None:
        if self.last_luma is None or k % 12 == 0:
            st = compute_luma_stats(frame)
            self.last_luma = st["mean_luma"]
            self.backlight = st["is_backlight"]
            self.dim = (st["mean_luma"] < DIM_RECOVERY_LUMA) or st["is_backlight"]

    def _call(self, rgb: np.ndarray, pre_ms: float, passname: str, aspect: float) -> dict:
        self.ts += FRAME_MS
        t0 = time.perf_counter()
        res = extract_mp_result(detect(self.det, rgb, self.ts), aspect)
        self.det_ms += (time.perf_counter() - t0) * 1000.0
        self.pre_ms += pre_ms
        self.calls += 1
        self.pass_use[passname] += 1
        return res

    def _enh(self, frame: np.ndarray) -> tuple[np.ndarray, float]:
        t0 = time.perf_counter()
        s320 = self._s320(frame)
        out, self.temporal_prev = apply_a4v2_chroma(s320, self.last_luma or 0.5, self.temporal_prev)
        return out, (time.perf_counter() - t0) * 1000.0

    def step(self, frame: np.ndarray, k: int) -> dict:
        h, w = frame.shape[:2]
        aspect = w / h
        self._luma(frame, k)

        if self.name == "P0_raw":
            return self._call(frame, 0.0, "A0_raw", aspect)

        if self.name == "P7_a4v2_chroma_singlecall":
            # Exact mirror of r20-hand.worker.ts! Strictly 1 detector call per frame.
            enhance = self.dim and (self.recovery_worked or self.misses >= 1)
            if enhance:
                img, ms = self._enh(frame)
                res = self._call(img, ms, "A4_denoise_reinhard320", aspect)
                if res["n_hands"] > 0:
                    self.misses = 0
                    self.recovery_worked = True
                else:
                    self.misses += 1
                    if self.misses % 4 == 0:
                        self.recovery_worked = False
            else:
                if self.dim:
                    # Keep temporal buffer warm in dim light
                    self.temporal_prev = self._s320(frame)
                else:
                    self.temporal_prev = None
                res = self._call(frame, 0.0, "A0_raw", aspect)
                if res["n_hands"] > 0:
                    self.misses = 0
                    self.recovery_worked = False
                else:
                    self.misses += 1
            return res

        if self.name == "P8_a4v2_chroma_sameframe":
            if self.dim and self.recovery_worked:
                img, ms = self._enh(frame)
                res = self._call(img, ms, "A4_denoise_reinhard320", aspect)
                if res["n_hands"] == 0:
                    res2 = self._call(frame, 0.0, "A0_raw", aspect)
                    if res2["n_hands"] > 0:
                        res = res2
                        self.recovery_worked = False
            else:
                res = self._call(frame, 0.0, "A0_raw", aspect)
                if res["n_hands"] == 0 and self.dim:
                    img, ms = self._enh(frame)
                    res2 = self._call(img, ms, "A4_denoise_reinhard320", aspect)
                    if res2["n_hands"] > 0:
                        res = res2
                        self.recovery_worked = True
                elif self.dim:
                    self.temporal_prev = self._s320(frame)
            self.misses = 0 if res["n_hands"] > 0 else self.misses + 1
            return res

        raise ValueError(self.name)


def run_seq(args):
    sid, cls, label, aug_name, seed, base_path = args
    bgr = cv2.imread(base_path)
    if bgr is None:
        return None
    base = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    h, w = base.shape[:2]
    aspect = w / h

    det_img = build_landmarker("IMAGE")
    ref_res = extract_mp_result(detect(det_img, base), aspect)
    ref = hand_center(ref_res["hands"][0]) if ref_res["n_hands"] else None
    det_img.close()

    frames = make_sequence(base, AUGS[aug_name], seed)
    ml0 = compute_luma_stats(frames[0])["mean_luma"]

    out = {
        "sample_id": sid,
        "cls": cls,
        "label": label,
        "aug": aug_name,
        "mean_luma": ml0,
        "ref_detected": ref is not None,
        "n_frames": N_FRAMES,
        "policies": {},
        "landmarks_for_clf": [],
    }
    for pol in POLICIES:
        pr = A4v2PolicyRunner(pol)
        hits = []
        for k, f in enumerate(frames):
            res = pr.step(f, k)
            hit = int(is_correct(res, ref))
            hits.append(hit)
            # Sample frames (every 4th frame of ref-detectable sequences) for exact TS C0/C4/C7 classifier-vs-detector separation
            if ref is not None and pol in ("P0_raw", "P7_a4v2_chroma_singlecall") and (k % 4 == 3):
                chosen_lm = None
                if hit and res["hands"]:
                    # Pick hand closest to reference
                    best_h = min(res["hands"], key=lambda hh: math.hypot(hand_center(hh)[0] - ref[0], hand_center(hh)[1] - ref[1]))
                    chosen_lm = best_h["landmarks"]
                out["landmarks_for_clf"].append({
                    "policy": pol,
                    "sample_id": sid,
                    "aug": aug_name,
                    "label": label,
                    "aspect": round(aspect, 5),
                    "frame_idx": k,
                    "detected": bool(chosen_lm is not None),
                    "landmarks": chosen_lm,
                })
        pr.close()
        first = next((i for i, x in enumerate(hits) if x), None)
        out["policies"][pol] = {
            "hits": hits,
            "calls": pr.calls,
            "pre_ms": round(pr.pre_ms, 2),
            "det_ms": round(pr.det_ms, 2),
            "first_hit_frame": first,
            "passes": dict(pr.pass_use),
        }
    return out


def agg_policies(sub: list[dict]) -> dict:
    nref = [r for r in sub if r["ref_detected"]]
    tot_frames = sum(r["n_frames"] for r in nref) or 1
    pol = {}
    for p in POLICIES:
        hits = sum(sum(r["policies"][p]["hits"]) for r in nref)
        calls = sum(r["policies"][p]["calls"] for r in nref)
        pre = sum(r["policies"][p]["pre_ms"] for r in nref)
        det = sum(r["policies"][p]["det_ms"] for r in nref)
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
    return pol


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=16)
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()

    imgs = pick_images(a.per_class)
    conds = list(AUGS.keys())
    jobs = []
    for r in imgs:
        lbl = {"L-Sign": "POINT_PRESS", "Pointing Up": "POINT_READY"}.get(r["class_name"], "OTHER")
        idn = int(r["sample_id"].split("_")[1])
        for ci, c in enumerate(conds):
            jobs.append((r["sample_id"], r["class_name"], lbl, c, 20261120 + idn * 97 + ci, f"{CACHE}/{r['sample_id']}.jpg"))

    print(f"[a4v2] running {len(jobs)} sequences ({len(imgs)} imgs x {len(conds)} conds x {N_FRAMES} frames) on {a.workers} workers...", flush=True)
    t0 = time.time()
    rows = []
    lm_rows = []
    with cf.ProcessPoolExecutor(max_workers=a.workers) as ex:
        for i, r in enumerate(ex.map(run_seq, jobs, chunksize=4)):
            if r is not None:
                lm_rows.extend(r.pop("landmarks_for_clf"))
                rows.append(r)
            if (i + 1) % 100 == 0:
                print(f"[a4v2] {i + 1}/{len(jobs)} ({time.time() - t0:.1f}s)", flush=True)

    with open(OUT_LM_JSONL, "w", encoding="utf-8") as f:
        for lr in lm_rows:
            f.write(json.dumps(lr) + "\n")

    # Merge apples-to-apples with baseline run1 (oracle_union_recall + P1..P6)
    base = json.load(open(BASELINE_RUN1, encoding="utf-8")) if os.path.exists(BASELINE_RUN1) else None
    overall_new = agg_policies(rows)
    by_cond = {}
    for c in conds:
        sub = [r for r in rows if r["aug"] == c]
        if not sub:
            continue
        p_new = agg_policies(sub)
        merged_pol = {}
        oracle_val = None
        if base and c in base["by_condition"]:
            oracle_val = base["by_condition"][c]["oracle_union_recall"]
            for k in ("P0_raw", "P1_clahe_always", "P2_a3_always", "P3_shipped_alt", "P4_a4s_sameframe"):
                if k in base["by_condition"][c]["policies"]:
                    merged_pol[k] = base["by_condition"][c]["policies"][k]
        merged_pol.update(p_new)
        by_cond[c] = {
            "n_sequences": len(sub),
            "n_sequences_ref_detectable": sum(1 for r in sub if r["ref_detected"]),
            "mean_luma_avg": round(float(np.mean([r["mean_luma"] for r in sub])), 4),
            "oracle_union_recall_upper_bound": oracle_val,
            "policies": merged_pol,
        }

    overall_pol = {}
    if base:
        for k in ("P0_raw", "P1_clahe_always", "P2_a3_always", "P3_shipped_alt", "P4_a4s_sameframe"):
            if k in base["overall"]["policies"]:
                overall_pol[k] = base["overall"]["policies"][k]
    overall_pol.update(overall_new)

    result = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "methodology_note": (
            "Sequential VIDEO-mode evaluation (24 frames @30fps per sequence, fresh sensor shot+read noise per frame, "
            "mild hand drift, reference hand center from clean base image). Explicitly separates stateless 3-call "
            "oracle_union_recall_upper_bound from actual sequential policies, counts detector calls per frame and "
            "recovery overhead honestly. Synthetic sequences derived from still images — NOT a physical webcam recording."
        ),
        "n_sequences": len(rows),
        "n_sequences_ref_detectable": sum(1 for r in rows if r["ref_detected"]),
        "frames_per_sequence": N_FRAMES,
        "elapsed_sec": round(time.time() - t0, 1),
        "overall": {
            "oracle_union_recall_upper_bound": base["overall"]["oracle_union_recall"] if base else None,
            "policies": overall_pol,
        },
        "by_condition": by_cond,
    }
    os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"\n[a4v2] DONE in {time.time() - t0:.1f}s -> {OUT_JSON}", flush=True)
    print(f"{'cond':16s} {'oracle*':>7s} {'P0_raw':>7s} {'P1_cla':>7s} {'P3_old':>7s} {'P7_a4v2':>8s} {'P8_sf':>7s} {'calls7':>6s} {'calls8':>6s}")
    for c, v in by_cond.items():
        p = v["policies"]
        orc = f"{v['oracle_union_recall_upper_bound']:.1%}" if v["oracle_union_recall_upper_bound"] is not None else "   n/a"
        print(
            f"{c:16s} {orc:>7s} "
            f"{p['P0_raw']['recall_all_frames']:7.1%} "
            f"{p.get('P1_clahe_always', {}).get('recall_all_frames', 0):7.1%} "
            f"{p.get('P3_shipped_alt', {}).get('recall_all_frames', 0):7.1%} "
            f"{p['P7_a4v2_chroma_singlecall']['recall_all_frames']:8.1%} "
            f"{p['P8_a4v2_chroma_sameframe']['recall_all_frames']:7.1%} "
            f"{p['P7_a4v2_chroma_singlecall']['detector_calls_per_frame']:6.2f} "
            f"{p['P8_a4v2_chroma_sameframe']['detector_calls_per_frame']:6.2f}"
        )


if __name__ == "__main__":
    main()
