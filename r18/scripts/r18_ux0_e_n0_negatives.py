#!/usr/bin/env python3
"""R18-UX0-E: Controlled N0/N1 Non-Hand False-Positive Baseline (F1) under RAW vs 320px CLAHE.

Tests `hand_landmarker.task` (with exact repo thresholds) on deterministic synthetic non-hand scenes
(NO physical human hand present): flat/noisy low-light frames, skin-toned blobs, finger-like wooden/pen
strips, cluttered high-contrast grids, and a drawn stylized palm silhouette (N1 visual hand-like object),
comparing RAW vs 320px Scaled vs 320px CLAHE (exact `clahe.ts` port).
"""
import json
import os
import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from r18_ux0_c_mendeley import (
    TASK_PATH, NUM_HANDS, MIN_DET_CONF, MIN_PRES_CONF, MIN_TRACK_CONF,
    ENHANCE_WIDTH, clahe_rgb_exact, build_landmarker, summarize_hands,
)

RESULTS_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results"


def make_n0_n1_scenes(seed: int = 42) -> list[tuple[str, str, np.ndarray]]:
    rng = np.random.default_rng(seed)
    H, W = 720, 1280
    scenes = []

    # 1. Dark noisy webcam room (N0)
    for i in range(10):
        img = rng.integers(5, 35, size=(H, W, 3), dtype=np.uint8)
        cv2.rectangle(img, (100 + i*20, 200), (450 + i*20, 620), (48, 36, 28), -1)
        scenes.append((f"N0_dark_room_{i}", "N0", img))

    # 2. Skin-toned desk / bottle / cloth shapes without fingers (N0)
    for i in range(10):
        img = np.full((H, W, 3), (40, 45, 50), dtype=np.uint8)
        # Warm skin-toned oval + rectangle
        cv2.ellipse(img, (640 + (i-5)*30, 380), (95, 160), (i-5)*8, 0, 360, (195, 150, 125), -1)
        cv2.rectangle(img, (220, 300), (340, 680), (175, 130, 105), -1)
        noise = rng.integers(-12, 13, size=(H, W, 3), dtype=np.int16)
        img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
        scenes.append((f"N0_skin_blobs_{i}", "N0", img))

    # 3. Five pencils/bars arranged fan-like (N0 distractor)
    for i in range(10):
        img = np.full((H, W, 3), (210, 205, 195), dtype=np.uint8)
        cx, cy = 640, 560
        for f_idx, ang_deg in enumerate([-50, -25, 0, 25, 45]):
            rad = np.deg2rad(ang_deg + (i - 5) * 3)
            x2 = int(cx + 220 * np.sin(rad))
            y2 = int(cy - 220 * np.cos(rad))
            cv2.line(img, (cx, cy), (x2, y2), (185, 140, 110), 28)
        cv2.ellipse(img, (cx, cy + 40), (75, 85), 0, 0, 360, (185, 140, 110), -1)
        scenes.append((f"N0_fan_sticks_{i}", "N0", img))

    # 4. Cluttered stripes / high-frequency pattern (N0)
    for i in range(5):
        img = np.zeros((H, W, 3), dtype=np.uint8)
        for x in range(0, W, 24 + i * 4):
            img[:, x:x+12] = (180, 150, 130)
        scenes.append((f"N0_stripes_{i}", "N0", img))

    # 5. Realistic N1 poster/silhouette of a palm with thumb + 4 fingers (visual hand-like object)
    for i, bg in enumerate([(235, 235, 235), (45, 45, 45), (140, 160, 180), (60, 45, 35), (200, 195, 185)]):
        img = np.full((H, W, 3), bg, dtype=np.uint8)
        cx, cy = 640, 450
        col = (205, 162, 136)
        # Palm + 5 digits
        cv2.ellipse(img, (cx, cy), (70, 88), 0, 0, 360, col, -1)
        digits = [
            ((cx - 58, cy + 15), (cx - 145, cy - 65), 22),   # thumb
            ((cx - 45, cy - 70), (cx - 60, cy - 230), 18),   # index
            ((cx - 12, cy - 82), (cx - 15, cy - 260), 19),   # middle
            ((cx + 22, cy - 78), (cx + 35, cy - 240), 18),   # ring
            ((cx + 52, cy - 62), (cx + 82, cy - 195), 16),   # pinky
        ]
        for p1, p2, thick in digits:
            cv2.line(img, p1, p2, col, thick * 2)
            cv2.circle(img, p2, thick, col, -1)
        scenes.append((f"N1_poster_hand_{i}", "N1", img))

    return scenes


def main() -> None:
    scenes = make_n0_n1_scenes()
    det_raw = build_landmarker()
    det_scl = build_landmarker()
    det_cla = build_landmarker()

    stats = {strata: {m: {"total": 0, "false_hand": 0, "false_large": 0} for m in ("raw", "scaled_320", "clahe_320")} for strata in ("N0", "N1")}
    examples = []

    for name, strata, rgb in scenes:
        h, w, _ = rgb.shape
        sh = max(1, int(round((ENHANCE_WIDTH * h) / w)))
        scaled = cv2.resize(rgb, (ENHANCE_WIDTH, sh), interpolation=cv2.INTER_LINEAR)
        clahe = clahe_rgb_exact(scaled)
        for mname, arr, det in [("raw", rgb, det_raw), ("scaled_320", scaled, det_scl), ("clahe_320", clahe, det_cla)]:
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(arr))
            res = det.detect(mp_img)
            sm = summarize_hands(res)
            stats[strata][mname]["total"] += 1
            if sm["n_hands"] > 0:
                stats[strata][mname]["false_hand"] += 1
                examples.append({"scene": name, "strata": strata, "mode": mname, **sm})
            if sm["n_large"] > 0:
                stats[strata][mname]["false_large"] += 1

    det_raw.close()
    det_scl.close()
    det_cla.close()

    out = {"stats": stats, "false_positives": examples[:30]}
    with open(os.path.join(RESULTS_DIR, "r18_ux0_e_n0_n1.json"), "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
