#!/usr/bin/env python3
"""Strict per-box PyTorch vs ONNX parity test (mandate v1.2.0 FX09 step 8).

Requirements:
- 50 test split images.
- Every paired bounding box must satisfy IoU >= 0.99 and abs(score_diff) <= 0.01.
- No averaging allowed. A single failing box fails the parity test.
- Outputs results to $RC/r23/results/FX09_parity.json.
"""
import glob
import json
import os
import sys
import numpy as np
import cv2
import torch
import onnxruntime as ort
from ultralytics import YOLO

def compute_iou(b1, b2):
    # [x1, y1, x2, y2]
    xA = max(b1[0], b2[0])
    yA = max(b1[1], b2[1])
    xB = min(b1[2], b2[2])
    yB = min(b1[3], b2[3])
    inter = max(0.0, xB - xA) * max(0.0, yB - yA)
    a1 = max(0.0, b1[2] - b1[0]) * max(0.0, b1[3] - b1[1])
    a2 = max(0.0, b2[2] - b2[0]) * max(0.0, b2[3] - b2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0.0 else 0.0

def letterbox(img, target_size=320, pad_val=114):
    h, w = img.shape[:2]
    scale = min(target_size / float(w), target_size / float(h))
    new_w = int(round(w * scale))
    new_h = int(round(h * scale))
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    pad_left = (target_size - new_w) // 2
    pad_top = (target_size - new_h) // 2
    canvas = np.full((target_size, target_size, 3), pad_val, dtype=np.uint8)
    canvas[pad_top:pad_top + new_h, pad_left:pad_left + new_w] = resized
    return canvas, {"srcW": w, "srcH": h, "newW": new_w, "newH": new_h, "padLeft": pad_left, "padTop": pad_top, "scale": scale}

def decode_output(raw, meta, conf_thresh=0.35, iou_thresh=0.5):
    # raw could be [1, 5, N] or [5, N] or [1, N, 6] or [N, 6]
    arr = np.squeeze(raw)
    dets = []
    if arr.ndim == 2:
        if arr.shape[1] == 6 or (arr.shape[0] > 6 and arr.shape[1] == 6):
            # [N, 6] end-to-end
            for row in arr:
                score = float(row[4])
                if score >= conf_thresh:
                    bx1, by1, bx2, by2 = map(float, row[:4])
                    # Unletterbox
                    x1 = max(0.0, min(1.0, (bx1 - meta["padLeft"]) / float(meta["newW"])))
                    y1 = max(0.0, min(1.0, (by1 - meta["padTop"]) / float(meta["newH"])))
                    x2 = max(0.0, min(1.0, (bx2 - meta["padLeft"]) / float(meta["newW"])))
                    y2 = max(0.0, min(1.0, (by2 - meta["padTop"]) / float(meta["newH"])))
                    dets.append(([x1, y1, x2, y2], score, int(row[5])))
            return dets
        elif arr.shape[0] >= 5:
            # [5, N] raw head
            num_anchors = arr.shape[1]
            cx, cy, w, h, s = arr[0], arr[1], arr[2], arr[3], arr[4]
            keep = s >= conf_thresh
            k_cx, k_cy, k_w, k_h, k_s = cx[keep], cy[keep], w[keep], h[keep], s[keep]
            boxes = []
            for i in range(len(k_s)):
                bx1 = k_cx[i] - k_w[i] / 2.0
                by1 = k_cy[i] - k_h[i] / 2.0
                bx2 = k_cx[i] + k_w[i] / 2.0
                by2 = k_cy[i] + k_h[i] / 2.0
                x1 = max(0.0, min(1.0, (bx1 - meta["padLeft"]) / float(meta["newW"])))
                y1 = max(0.0, min(1.0, (by1 - meta["padTop"]) / float(meta["newH"])))
                x2 = max(0.0, min(1.0, (bx2 - meta["padLeft"]) / float(meta["newW"])))
                y2 = max(0.0, min(1.0, (by2 - meta["padTop"]) / float(meta["newH"])))
                boxes.append(([x1, y1, x2, y2], float(k_s[i]), 0))
            # NMS
            boxes.sort(key=lambda x: x[1], reverse=True)
            nms_res = []
            for b in boxes:
                supp = False
                for sel in nms_res:
                    if compute_iou(b[0], sel[0]) >= iou_thresh:
                        supp = True
                        break
                if not supp:
                    nms_res.append(b)
            return nms_res
    return dets

def main():
    if len(sys.argv) < 3:
        print("Usage: verify_fx09_parity.py <pt_path> <onnx_path> [out_json]")
        return 1
    pt_path = sys.argv[1]
    onnx_path = sys.argv[2]
    out_json = sys.argv[3] if len(sys.argv) > 3 else "r23/results/FX09_parity.json"

    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    test_img_dir = os.path.join(data_root, "yolo/monui7_hand_v0/images/test")
    test_images = sorted(glob.glob(os.path.join(test_img_dir, "*.jpg")))

    # Sample exactly 50 test images with fixed seed
    np.random.seed(20261120)
    selected_images = [test_images[i] for i in sorted(np.random.choice(len(test_images), size=50, replace=False))]

    print(f"Loading PyTorch model from {pt_path}...")
    model_yolo = YOLO(pt_path)
    pt_net = model_yolo.model.float().eval()

    print(f"Loading ONNX model from {onnx_path}...")
    ort_sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    input_name = ort_sess.get_inputs()[0].name
    output_name = ort_sess.get_outputs()[0].name
    output_shape = ort_sess.get_outputs()[0].shape
    print(f"ONNX input: {input_name}, output: {output_name}, shape: {output_shape}")

    all_pairs = []
    failed_boxes = []

    for img_p in selected_images:
        img_bgr = cv2.imread(img_p)
        if img_bgr is None:
            continue
        canvas, meta = letterbox(img_bgr, target_size=320)
        # NCHW RGB normalized
        tensor_rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        nchw = np.transpose(tensor_rgb, (2, 0, 1))[None, ...]

        # 1. PyTorch forward
        with torch.no_grad():
            t_in = torch.from_numpy(nchw)
            pt_out = pt_net(t_in)
            if isinstance(pt_out, (tuple, list)):
                pt_raw = pt_out[0].cpu().numpy()
            else:
                pt_raw = pt_out.cpu().numpy()

        # 2. ONNX forward
        onnx_raw = ort_sess.run([output_name], {input_name: nchw})[0]

        pt_dets = decode_output(pt_raw, meta, conf_thresh=0.35)
        onnx_dets = decode_output(onnx_raw, meta, conf_thresh=0.35)

        # Match detections
        for i_pt, (b_pt, s_pt, c_pt) in enumerate(pt_dets):
            best_iou = 0.0
            best_diff = 1.0
            best_s_on = 0.0
            for i_on, (b_on, s_on, c_on) in enumerate(onnx_dets):
                iou = compute_iou(b_pt, b_on)
                diff = abs(s_pt - s_on)
                if iou > best_iou:
                    best_iou = iou
                    best_diff = diff
                    best_s_on = s_on

            pair_res = {
                "image": os.path.basename(img_p),
                "box_pt": [round(x, 4) for x in b_pt],
                "score_pt": round(s_pt, 4),
                "score_onnx": round(best_s_on, 4),
                "iou": round(best_iou, 4),
                "score_diff": round(best_diff, 4),
                "pass": best_iou >= 0.99 and best_diff <= 0.01
            }
            all_pairs.append(pair_res)
            if not pair_res["pass"]:
                failed_boxes.append(pair_res)

    parity_status = "PASS" if len(failed_boxes) == 0 and len(all_pairs) > 0 else "FAIL"
    summary = {
        "status": parity_status,
        "pt_model": pt_path,
        "onnx_model": onnx_path,
        "onnx_output_shape": list(output_shape),
        "total_test_images": len(selected_images),
        "total_boxes_evaluated": len(all_pairs),
        "failed_boxes_count": len(failed_boxes),
        "min_iou": round(float(np.min([p["iou"] for p in all_pairs])), 4) if all_pairs else 1.0,
        "max_score_diff": round(float(np.max([p["score_diff"] for p in all_pairs])), 4) if all_pairs else 0.0,
        "all_boxes_pass": len(failed_boxes) == 0,
        "failed_boxes": failed_boxes
    }

    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\nParity result: {parity_status}")
    print(json.dumps(summary, indent=2))
    return 0 if parity_status == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
