#!/usr/bin/env python3
"""R19 Adversarial N0/N1 Distractor Generator + MediaPipe HandLandmarker Stress (RAW vs CLAHE320).

Extends R18 N0/N1 scenes with R19 Pistol-specific hard distractors (`N0_l_sticks`: L-shaped pens/rulers
and `N1_poster_pistol`: printed 2D paper cutout L-Sign silhouettes) to measure detector false-hand
hallucinations and extract exact landmarks for downstream G0..G5 false-PRESS regression checks.
"""
from __future__ import annotations

import json
import os
import sys
import cv2
import numpy as np

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/research-can/r18/scripts")
from r18_ux0_c_mendeley import ENHANCE_WIDTH, build_landmarker, clahe_rgb_exact, mean_luma
from r18_ux0_e_n0_negatives import make_n0_n1_scenes
import mediapipe as mp


def make_r19_pistol_distractors(seed: int = 20261118) -> list[tuple[str, str, np.ndarray]]:
    rng = np.random.default_rng(seed)
    H, W = 720, 1280
    scenes = list(make_n0_n1_scenes(seed=42))

    # 1. N0_l_sticks: two skin-toned or wooden sticks/rulers forming ~90 deg L-corner + palm block
    for i in range(10):
        bg = (220, 215, 205) if i % 2 == 0 else (35, 38, 42)
        img = np.full((H, W, 3), bg, dtype=np.uint8)
        cx = 560 + (i - 5) * 28
        cy = 480 + ((i % 3) - 1) * 22
        ang = np.deg2rad((i - 5) * 9)
        c, s = np.cos(ang), np.sin(ang)
        rot = lambda dx, dy: (int(cx + dx * c - dy * s), int(cy + dx * s + dy * c))
        col = (195, 150, 120) if i % 3 != 0 else (180, 138, 108)
        cv2.line(img, rot(0, 0), rot(250, 0), col, 32)       # horizontal stick
        cv2.line(img, rot(0, 0), rot(0, -195), col, 34)      # vertical L stick
        cv2.rectangle(img, rot(-65, -35), rot(25, 65), col, -1)
        if i % 2 == 1:
            noise = rng.integers(-8, 9, size=(H, W, 3), dtype=np.int16)
            img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        scenes.append((f"N0_l_sticks_{i}", "N0", img))

    # 2. N1_poster_pistol: flat printed L-Sign paper/poster silhouette with curled other-finger stubs
    for i, bg in enumerate([(235, 235, 235), (42, 44, 48), (160, 175, 185), (75, 58, 45), (210, 200, 190)]):
        img = np.full((H, W, 3), bg, dtype=np.uint8)
        cx, cy = 620, 440
        col = (205, 162, 136)
        cv2.ellipse(img, (cx, cy), (64, 78), 0, 0, 360, col, -1)
        cv2.line(img, (cx + 10, cy - 55), (cx + 250, cy - 58), col, 34)  # horizontal index silhouette
        cv2.circle(img, (cx + 250, cy - 58), 17, col, -1)
        cv2.line(img, (cx - 10, cy - 50), (cx - 18, cy - 230), col, 38)  # vertical thumb silhouette
        cv2.circle(img, (cx - 18, cy - 230), 19, col, -1)
        for ky in (-15, 20, 52):
            cv2.ellipse(img, (cx + 28, cy + ky), (34, 15), 0, 0, 360, (188, 145, 118), -1)
        scenes.append((f"N1_poster_pistol_{i}", "N1", img))

    return scenes


def run() -> None:
    scenes = make_r19_pistol_distractors()
    det = build_landmarker()
    stats = {
        strata: {m: {"total": 0, "false_hand": 0, "false_large": 0} for m in ("raw", "scaled_320", "clahe_320")}
        for strata in ("N0", "N1")
    }
    by_family = {}
    records = []

    for name, strata, rgb in scenes:
        fam = "_".join(name.split("_")[:-1])
        by_family.setdefault(fam, {"n": 0, "raw_fp": 0, "scaled_fp": 0, "clahe_fp": 0})
        by_family[fam]["n"] += 1

        h, w, _ = rgb.shape
        sh = max(1, int(round((ENHANCE_WIDTH * h) / w)))
        scaled = cv2.resize(rgb, (ENHANCE_WIDTH, sh), interpolation=cv2.INTER_LINEAR)
        clahe = clahe_rgb_exact(scaled)
        rec = {"scene": name, "family": fam, "strata": strata, "aspect": round(w / h, 4), "raw_luma": round(mean_luma(rgb[..., 0]), 4), "modes": {}}

        for mname, arr in (("raw", rgb), ("scaled_320", scaled), ("clahe_320", clahe)):
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(arr))
            res = det.detect(mp_img)
            hands = res.hand_landmarks or []
            stats[strata][mname]["total"] += 1
            large_hands = []
            for lm in hands:
                pts = [[round(float(p.x), 5), round(float(p.y), 5)] for p in lm]
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                sz = max(max(xs) - min(xs), max(ys) - min(ys))
                if sz >= 0.08:
                    large_hands.append(pts)
            if hands:
                stats[strata][mname]["false_hand"] += 1
                by_family[fam][f"{'raw' if mname == 'raw' else ('scaled' if mname == 'scaled_320' else 'clahe')}_fp"] += 1
            if large_hands:
                stats[strata][mname]["false_large"] += 1
            rec["modes"][mname] = large_hands
        records.append(rec)

    det.close()
    out = {
        "evidence_tier": "SYNTHETIC",
        "total_scenes": len(scenes),
        "stats": stats,
        "by_family": by_family,
        "records": records,
    }
    out_path = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/train/n0_n1_distractor_landmarks.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f)
    print("N0/N1 stats:", json.dumps(stats))
    print("By family:", json.dumps(by_family, indent=2))


if __name__ == "__main__":
    run()
