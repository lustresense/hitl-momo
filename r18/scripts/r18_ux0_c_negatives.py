#!/usr/bin/env python3
"""R18-UX0-C2: Controlled N0 non-hand negative benchmark (RAW vs 320px Scaled vs 320px CLAHE).

Generates reproducible N0 (strictly NO physical hand) frames:
- Low-light dark room / sensor noise
- Skin-toned blocks / ellipses / wooden desk / paper / cluttered stripes
- Backlit bright rectangles + dark foreground silhouettes
Runs the exact `hand_landmarker.task` + `hand-config.ts` thresholds to measure
whether 320px CLAHE introduces false hand detections (F1) on non-hand scenes.
"""
import json
import os
import sys
import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

sys.path.insert(0, os.path.dirname(__file__))
from r18_ux0_c_mendeley import TASK_PATH, NUM_HANDS, MIN_DET_CONF, MIN_PRES_CONF, MIN_TRACK_CONF, ENHANCE_WIDTH, clahe_rgb_exact, pixel_luma, mean_luma

OUT_PATH = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/r18_ux0_c_negatives.json"


def generate_n0_scenes() -> list[tuple[str, str, np.ndarray]]:
    rng = np.random.default_rng(18)
    scenes = []
    H, W = 720, 1280

    # 1. Dark room sensor noise (various low luma levels)
    for lvl in (8, 20, 40):
        for k in range(10):
            img = rng.integers(0, lvl * 2 + 1, size=(H, W, 3), dtype=np.uint8)
            scenes.append((f"dark_noise_{lvl}", f"dark_{lvl}_{k}", img))

    # 2. Skin-toned ellipses/cylinders (wooden desk, arm-like shapes, blobs without fingers)
    skin_tones = [(220, 180, 150), (185, 135, 100), (120, 82, 60), (75, 50, 38)]
    for idx, col in enumerate(skin_tones):
        for k in range(8):
            bg = rng.integers(25, 80, size=(H, W, 3), dtype=np.uint8)
            cx, cy = int(rng.integers(250, 1030)), int(rng.integers(180, 540))
            ax1, ax2 = int(rng.integers(60, 180)), int(rng.integers(40, 120))
            ang = int(rng.integers(0, 180))
            cv2.ellipse(bg, (cx, cy), (ax1, ax2), ang, 0, 360, col, -1)
            # Add subtle texture noise
            noise = rng.integers(-8, 9, size=(H, W, 3), dtype=np.int16)
            img = np.clip(bg.astype(np.int16) + noise, 0, 255).astype(np.uint8)
            scenes.append(("skin_blob_no_fingers", f"blob_{idx}_{k}", img))

    # 3. Hand-like 5-prong forks / stationery clutter (objects with elongated parallel bars)
    for k in range(20):
        bg = rng.integers(15, 65, size=(H, W, 3), dtype=np.uint8)
        col = skin_tones[k % len(skin_tones)]
        bx, by = int(rng.integers(300, 800)), int(rng.integers(260, 460))
        cv2.rectangle(bg, (bx, by), (bx + 140, by + 160), col, -1)
        for p in range(5):
            px = bx + 8 + p * 28
            cv2.rectangle(bg, (px, by - 120), (px + 18, by), col, -1)
        bg = cv2.GaussianBlur(bg, (7, 7), 1.5)
        scenes.append(("five_prong_object", f"prong_{k}", bg))

    # 4. High-contrast cluttered desk lines & backlight window
    for k in range(20):
        img = rng.integers(15, 45, size=(H, W, 3), dtype=np.uint8)
        # Bright window behind
        cv2.rectangle(img, (50, 20), (500, 520), (240, 240, 235), -1)
        # Random clutter bars (books/pens/bottles)
        for _ in range(12):
            x1, y1 = int(rng.integers(0, W - 100)), int(rng.integers(0, H - 100))
            x2, y2 = x1 + int(rng.integers(30, 180)), y1 + int(rng.integers(30, 220))
            c = tuple(int(v) for v in rng.integers(40, 200, size=3))
            cv2.rectangle(img, (x1, y1), (x2, y2), c, -1)
        scenes.append(("backlight_clutter", f"back_{k}", img))

    return scenes


def main():
    scenes = generate_n0_scenes()
    opts = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=TASK_PATH),
        running_mode=mp_vision.RunningMode.IMAGE,
        num_hands=NUM_HANDS,
        min_hand_detection_confidence=MIN_DET_CONF,
        min_hand_presence_confidence=MIN_PRES_CONF,
        min_tracking_confidence=MIN_TRACK_CONF,
    )
    det = mp_vision.HandLandmarker.create_from_options(opts)
    stats = {}
    false_examples = []
    for cat, sid, rgb in scenes:
        st = stats.setdefault(cat, {"n": 0, "fp_raw": 0, "fp_scaled": 0, "fp_clahe": 0})
        st["n"] += 1
        h, w, _ = rgb.shape
        sh = max(1, int(round((ENHANCE_WIDTH * h) / w)))
        scaled = cv2.resize(rgb, (ENHANCE_WIDTH, sh), interpolation=cv2.INTER_LINEAR)
        clahe = clahe_rgb_exact(scaled)
        for mode, arr, fk in [("raw", rgb, "fp_raw"), ("scaled", scaled, "fp_scaled"), ("clahe", clahe, "fp_clahe")]:
            res = det.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(arr)))
            if res.hand_landmarks:
                st[fk] += 1
                if len(false_examples) < 20:
                    false_examples.append({"cat": cat, "id": sid, "mode": mode, "hands": len(res.hand_landmarks), "luma": round(mean_luma(pixel_luma(scaled)), 3)})
    det.close()
    tot_n = sum(v["n"] for v in stats.values())
    out = {
        "total_n0_frames": tot_n,
        "by_category": stats,
        "totals": {
            "fp_raw": sum(v["fp_raw"] for v in stats.values()),
            "fp_scaled": sum(v["fp_scaled"] for v in stats.values()),
            "fp_clahe": sum(v["fp_clahe"] for v in stats.values()),
        },
        "false_examples": false_examples,
    }
    with open(OUT_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
