#!/usr/bin/env python3
"""Prepare QA dataset and Python predictions for FX12 TS vs Python parity.

Mandate FX12:
- 20 test images (mixed HaGRID, Open Images, HANDS/IPN).
- Write raw RGBA pixels to $DATA_ROOT/qa/fx12/<name>.rgba + <name>.json (width, height).
- Save Python predictions (Ultralytics / PyTorch / ONNX conf=0.35) to py_preds.json.
- No images committed to git.
"""
import argparse
import glob
import json
import os
import sys
from PIL import Image
import numpy as np
import torch

def select_test_images(data_root, target_count=20):
    test_img_dir = os.path.join(data_root, "yolo", "monui7_hand_v0", "images", "test")
    hagrid_imgs = sorted(glob.glob(os.path.join(test_img_dir, "hagrid__*.jpg")))
    oi_imgs = sorted(glob.glob(os.path.join(test_img_dir, "oi__*.jpg")))
    hands_imgs = sorted(glob.glob(os.path.join(test_img_dir, "hands__*.jpg")))
    ipn_imgs = sorted(glob.glob(os.path.join(test_img_dir, "ipn__*.jpg")))

    selected = []
    # 8 HaGRID
    selected.extend(hagrid_imgs[:8])
    # 6 Open Images
    selected.extend(oi_imgs[:6])
    # 3 HANDS + 3 IPN (or 6 HANDS)
    if hands_imgs and ipn_imgs:
        selected.extend(hands_imgs[:3])
        selected.extend(ipn_imgs[:3])
    elif hands_imgs:
        selected.extend(hands_imgs[:6])
    elif ipn_imgs:
        selected.extend(ipn_imgs[:6])

    # If still fewer than target_count, fill from remaining
    if len(selected) < target_count:
        rem = [p for p in hagrid_imgs + oi_imgs + hands_imgs + ipn_imgs if p not in selected]
        selected.extend(rem[:target_count - len(selected)])

    return selected[:target_count]

def main():
    parser = argparse.ArgumentParser(description="Prepare FX12 QA data and Python predictions")
    parser.add_argument("--model", required=True, help="Path to winning model (.pt or .onnx)")
    parser.add_argument("--data-root", default="/home/deano/monui7-local/data")
    parser.add_argument("--out-dir", default="/home/deano/monui7-local/data/qa/fx12")
    parser.add_argument("--conf", type=float, default=0.35)
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    images = select_test_images(args.data_root, target_count=20)
    print(f"Selected {len(images)} test images for FX12 parity.")

    from ultralytics import YOLO
    model = YOLO(args.model)

    py_preds = {}

    for idx, img_path in enumerate(images):
        basename = os.path.splitext(os.path.basename(img_path))[0]
        with Image.open(img_path) as pil_img:
            rgba = pil_img.convert("RGBA")
            w, h = rgba.size
            rgba_bytes = rgba.tobytes()

        # Save .rgba and .json
        rgba_out = os.path.join(args.out_dir, f"{basename}.rgba")
        meta_out = os.path.join(args.out_dir, f"{basename}.json")
        with open(rgba_out, "wb") as f:
            f.write(rgba_bytes)
        with open(meta_out, "w", encoding="utf-8") as f:
            json.dump({"name": basename, "width": w, "height": h}, f)

        # Predict with Ultralytics on the exact letterboxed tensor (identical to TS input)
        scale = min(320.0 / w, 320.0 / h)
        new_w = int(round(w * scale))
        new_h = int(round(h * scale))
        pad_left = (320 - new_w) // 2
        pad_top = (320 - new_h) // 2

        rgba_arr = np.frombuffer(rgba_bytes, dtype=np.uint8).reshape((h, w, 4))
        tensor = np.full((3, 320, 320), 114.0 / 255.0, dtype=np.float32)
        for dy in range(new_h):
            sy = min(h - 1, int(dy / scale))
            for dx in range(new_w):
                sx = min(w - 1, int(dx / scale))
                tensor[0, pad_top + dy, pad_left + dx] = rgba_arr[sy, sx, 0] / 255.0
                tensor[1, pad_top + dy, pad_left + dx] = rgba_arr[sy, sx, 1] / 255.0
                tensor[2, pad_top + dy, pad_left + dx] = rgba_arr[sy, sx, 2] / 255.0

        torch_img = torch.from_numpy(tensor).unsqueeze(0)
        if torch.cuda.is_available():
            torch_img = torch_img.cuda()

        results = model.predict(source=torch_img, conf=args.conf, verbose=False)
        r = results[0]

        dets = []
        if r.boxes is not None and len(r.boxes) > 0:
            boxes_raw = r.boxes.xyxy.cpu().numpy()  # coordinates in [0, 320]
            confs = r.boxes.conf.cpu().numpy()
            classes = r.boxes.cls.cpu().numpy()

            for b, s, c in zip(boxes_raw, confs, classes):
                bx1, by1, bx2, by2 = b
                x1 = max(0.0, min(1.0, (bx1 - pad_left) / float(new_w)))
                y1 = max(0.0, min(1.0, (by1 - pad_top) / float(new_h)))
                x2 = max(0.0, min(1.0, (bx2 - pad_left) / float(new_w)))
                y2 = max(0.0, min(1.0, (by2 - pad_top) / float(new_h)))
                dets.append({
                    "box": [float(x1), float(y1), float(x2), float(y2)],
                    "score": float(s),
                    "classId": int(c)
                })

        # Sort dets by score descending
        dets.sort(key=lambda d: d["score"], reverse=True)
        py_preds[basename] = dets
        print(f"[{idx+1}/20] {basename}: {len(dets)} detections")

    preds_file = os.path.join(args.out_dir, "py_preds.json")
    with open(preds_file, "w", encoding="utf-8") as f:
        json.dump(py_preds, f, indent=2)

    print(f"\nSaved {len(py_preds)} image predictions to {preds_file}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
