#!/usr/bin/env python3
"""Generate darkpool and synthetic dark augmentations for MoNUI-7 R23 T15."""
import glob
import json
import os
import random
import sys
import time
import cv2
import numpy as np

def clamp(v, min_v=0.0, max_v=1.0):
    return max(min_v, min(max_v, float(v)))

def apply_dark_aug(img, gamma=None, noise_sigma=None):
    if gamma is None:
        gamma = random.uniform(0.3, 0.6)
    if noise_sigma is None:
        noise_sigma = random.uniform(5.0, 15.0)

    # 1. Gamma correction: O = 255 * (I/255) ** (1/gamma) -> wait, to make darker, I ** (1/gamma) with gamma < 1 or I ** gamma?
    # Note: if gamma < 1, e.g. 0.4: (I/255)^2.5 makes midtones much darker!
    # In standard imaging, gamma < 1 means power = 1/gamma (> 1) -> darker image.
    inv_gamma = 1.0 / gamma
    table = np.array([((i / 255.0) ** inv_gamma) * 255.0 for i in range(256)]).astype("uint8")
    darkened = cv2.LUT(img, table)

    # 2. Gaussian noise
    h, w, c = darkened.shape
    noise = np.random.normal(0, noise_sigma, (h, w, c)).astype("float32")
    noisy = np.clip(darkened.astype("float32") + noise, 0, 255).astype("uint8")

    return noisy, gamma, noise_sigma

def main():
    t_start = time.time()
    random.seed(20261120)
    np.random.seed(20261120)

    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")

    darkpool_dir = os.path.join(data_root, "darkpool")
    train_img_dir = os.path.join(data_root, "yolo/monui7_hand_v0/images/train")
    train_lbl_dir = os.path.join(data_root, "yolo/monui7_hand_v0/labels/train")

    out_base = os.path.join(data_root, "yolo/monui7_hand_v0_dark")
    out_img_dir = os.path.join(out_base, "images/train")
    out_lbl_dir = os.path.join(out_base, "labels/train")
    results_json = os.path.join(rc, "r23/results/T15_dark_aug.json")

    os.makedirs(out_img_dir, exist_ok=True)
    os.makedirs(out_lbl_dir, exist_ok=True)

    # 1. Collect sources from darkpool
    darkpool_files = []
    for root, _, files in os.walk(darkpool_dir):
        for f in files:
            if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                darkpool_files.append(os.path.join(root, f))
    darkpool_files.sort()

    # 2. Collect sources from train images
    train_files = []
    if os.path.exists(train_img_dir):
        for f in os.listdir(train_img_dir):
            if f.lower().endswith(('.jpg', '.jpeg', '.png')):
                train_files.append(os.path.join(train_img_dir, f))
    train_files.sort()

    print(f"Found {len(darkpool_files)} darkpool images and {len(train_files)} train images.")

    augmented_records = []
    target_count = 1200  # >= 1000

    # Step A: Augment darkpool images (real dark images with additional sensor noise / exposure drop)
    count = 0
    for dp_path in darkpool_files:
        img = cv2.imread(dp_path)
        if img is None:
            continue

        base_name = os.path.splitext(os.path.basename(dp_path))[0]
        aug_img, g, s = apply_dark_aug(img)

        out_img_name = f"darkaug_dp_{base_name}.jpg"
        out_lbl_name = f"darkaug_dp_{base_name}.txt"

        out_img_path = os.path.join(out_img_dir, out_img_name)
        out_lbl_path = os.path.join(out_lbl_dir, out_lbl_name)

        cv2.imwrite(out_img_path, aug_img, [cv2.IMWRITE_JPEG_QUALITY, 85])

        # Darkpool frames are treated as real low-light negatives or background unless label exists
        # Write empty label file (YOLO negative sample)
        with open(out_lbl_path, "w", encoding="utf-8") as f_lbl:
            pass

        augmented_records.append({
            "image": out_img_name,
            "source": "darkpool",
            "orig_file": dp_path,
            "gamma": round(g, 4),
            "noise_sigma": round(s, 2),
            "n_boxes": 0
        })
        count += 1
        if count >= 600:
            break

    # Step B: Augment train images with hand bounding boxes to synthetic darkness
    random.shuffle(train_files)
    train_aug_count = 0
    for tr_path in train_files:
        if count >= target_count:
            break

        base_name = os.path.splitext(os.path.basename(tr_path))[0]
        src_lbl_path = os.path.join(train_lbl_dir, f"{base_name}.txt")
        if not os.path.exists(src_lbl_path):
            continue

        img = cv2.imread(tr_path)
        if img is None:
            continue

        aug_img, g, s = apply_dark_aug(img)

        out_img_name = f"darkaug_tr_{base_name}.jpg"
        out_lbl_name = f"darkaug_tr_{base_name}.txt"

        out_img_path = os.path.join(out_img_dir, out_img_name)
        out_lbl_path = os.path.join(out_lbl_dir, out_lbl_name)

        cv2.imwrite(out_img_path, aug_img, [cv2.IMWRITE_JPEG_QUALITY, 85])

        # Copy original hand bounding box labels
        with open(src_lbl_path, "r", encoding="utf-8") as f_src, open(out_lbl_path, "w", encoding="utf-8") as f_dst:
            content = f_src.read()
            f_dst.write(content)

        n_boxes = len([l for l in content.strip().split("\n") if l.strip()])
        augmented_records.append({
            "image": out_img_name,
            "source": "train_hand",
            "orig_file": tr_path,
            "gamma": round(g, 4),
            "noise_sigma": round(s, 2),
            "n_boxes": n_boxes
        })
        count += 1
        train_aug_count += 1

    total_aug = len(augmented_records)
    status = "PASS" if total_aug >= 1000 else "FAIL"

    summary = {
        "status": status,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_augmented": total_aug,
        "target": target_count,
        "darkpool_augmented_count": sum(1 for r in augmented_records if r["source"] == "darkpool"),
        "train_hand_augmented_count": sum(1 for r in augmented_records if r["source"] == "train_hand"),
        "gamma_range": [0.3, 0.6],
        "output_directory": out_base,
        "duration_seconds": round(time.time() - t_start, 2)
    }

    os.makedirs(os.path.dirname(results_json), exist_ok=True)
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"Darkpool augmentation complete! Total generated: {total_aug}. Status: {status}")
    print(json.dumps(summary, indent=2))
    return 0 if status == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
