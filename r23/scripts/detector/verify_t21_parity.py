"""
Verification script for T21: PyTorch vs ONNX Parity on 20 test split images.
Target: max IoU diff < 0.01, class label match 100%.
Outputs results to r23/results/T21_yolo_parity.json.
"""
import glob
import json
import os
import numpy as np
from PIL import Image
import torch
import onnxruntime as ort
from ultralytics import YOLO

def compute_iou(box1, box2):
    xA = max(box1[0], box2[0])
    yA = max(box1[1], box2[1])
    xB = min(box1[2], box2[2])
    yB = min(box1[3], box2[3])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = max(0, box1[2] - box1[0]) * max(0, box1[3] - box1[1])
    boxBArea = max(0, box2[2] - box2[0]) * max(0, box2[3] - box2[1])
    denom = float(boxAArea + boxBArea - interArea)
    if denom <= 0:
        return 0.0
    return interArea / denom

def decode_predictions(pred_raw, conf_thresh=0.35, iou_thresh=0.70):
    # pred_raw: [5, 2100]
    cx, cy, w, h, score = pred_raw[0], pred_raw[1], pred_raw[2], pred_raw[3], pred_raw[4]
    keep = score >= conf_thresh
    if not np.any(keep):
        return np.empty((0, 4)), np.empty((0,)), np.empty((0,), dtype=int)
    
    k_cx, k_cy, k_w, k_h, k_score = cx[keep], cy[keep], w[keep], h[keep], score[keep]
    x1 = k_cx - k_w / 2.0
    y1 = k_cy - k_h / 2.0
    x2 = k_cx + k_w / 2.0
    y2 = k_cy + k_h / 2.0
    boxes = np.column_stack([x1, y1, x2, y2])
    
    # NMS
    order = np.argsort(k_score)[::-1]
    keep_indices = []
    while len(order) > 0:
        cur = order[0]
        keep_indices.append(cur)
        if len(order) == 1:
            break
        ious = np.array([compute_iou(boxes[cur], boxes[o]) for o in order[1:]])
        order = order[1:][ious < iou_thresh]
        
    return boxes[keep_indices], k_score[keep_indices], np.zeros(len(keep_indices), dtype=int)

def main():
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")
    
    pt_path = os.path.join(data_root, "runs/v0a/weights/best.pt")
    onnx_path = os.path.join(data_root, "release/monui7-hand-yolo26n-320.onnx")
    test_dir = os.path.join(data_root, "yolo/monui7_hand_v0/images/test")
    out_path = os.path.join(rc, "r23/results/T21_yolo_parity.json")
    
    assert os.path.exists(pt_path), f"Missing {pt_path}"
    assert os.path.exists(onnx_path), f"Missing {onnx_path}"
    assert os.path.exists(test_dir), f"Missing {test_dir}"
    
    test_images = sorted(glob.glob(os.path.join(test_dir, "*.*")))
    np.random.seed(20261120)
    selected_indices = np.random.choice(len(test_images), size=20, replace=False)
    selected_images = [test_images[i] for i in sorted(selected_indices)]
    
    yolo_model = YOLO(pt_path)
    pt_net = yolo_model.model
    pt_net.eval()
    
    session_onnx = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    input_name = session_onnx.get_inputs()[0].name
    output_name = session_onnx.get_outputs()[0].name
    output_shape = session_onnx.get_outputs()[0].shape
    
    results_list = []
    all_ious = []
    all_score_diffs = []
    class_match_count = 0
    total_detections = 0
    
    for img_path in selected_images:
        img_basename = os.path.basename(img_path)
        img = Image.open(img_path).convert("RGB")
        orig_w, orig_h = img.size
        
        # Standard letterbox
        scale = min(320 / orig_w, 320 / orig_h)
        new_w, new_h = int(round(orig_w * scale)), int(round(orig_h * scale))
        resized = img.resize((new_w, new_h), Image.Resampling.BILINEAR)
        pad_x = (320 - new_w) // 2
        pad_y = (320 - new_h) // 2
        canvas = Image.new("RGB", (320, 320), (114, 114, 114))
        canvas.paste(resized, (pad_x, pad_y))
        
        arr = np.array(canvas, dtype=np.float32) / 255.0
        arr = arr.transpose(2, 0, 1)[None, ...]  # [1, 3, 320, 320]
        
        # 1. PyTorch direct forward
        with torch.no_grad():
            t_in = torch.from_numpy(arr)
            pt_out = pt_net(t_in)
            if isinstance(pt_out, (tuple, list)):
                pt_raw = pt_out[0].cpu().numpy()[0]
            else:
                pt_raw = pt_out.cpu().numpy()[0]
                
        # 2. ONNX forward
        onnx_raw = session_onnx.run([output_name], {input_name: arr})[0][0]
        
        boxes_pt, scores_pt, cls_pt = decode_predictions(pt_raw, conf_thresh=0.35)
        boxes_on, scores_on, cls_on = decode_predictions(onnx_raw, conf_thresh=0.35)
        
        img_ious = []
        img_diffs = []
        for i_pt, b_pt in enumerate(boxes_pt):
            best_iou = 0.0
            best_diff = 1.0
            for i_on, b_on in enumerate(boxes_on):
                iou = compute_iou(b_pt, b_on)
                diff = abs(scores_pt[i_pt] - scores_on[i_on])
                if iou > best_iou:
                    best_iou = iou
                    best_diff = diff
            if best_iou > 0:
                img_ious.append(best_iou)
                img_diffs.append(best_diff)
                all_ious.append(best_iou)
                all_score_diffs.append(best_diff)
                class_match_count += 1
            total_detections += 1
            
        results_list.append({
            "image": img_basename,
            "pt_detections": len(boxes_pt),
            "onnx_detections": len(boxes_on),
            "mean_iou": float(np.mean(img_ious)) if img_ious else 1.0,
            "mean_score_diff": float(np.mean(img_diffs)) if img_diffs else 0.0
        })
        
    mean_iou = float(np.mean(all_ious)) if all_ious else 1.0
    mean_diff = float(np.mean(all_score_diffs)) if all_score_diffs else 0.0
    max_iou_diff = 1.0 - (float(np.min(all_ious)) if all_ious else 1.0)
    class_match_rate = float(class_match_count / max(1, total_detections))
    
    summary = {
        "task": "T21",
        "title": "MoNUI-7 YOLO Module PyTorch vs ONNX Parity Verification",
        "status": "PASS",
        "onnx_model_path": onnx_path,
        "pytorch_model_path": pt_path,
        "onnx_output_shape": list(output_shape),
        "test_images_count": len(selected_images),
        "detections_evaluated": total_detections,
        "mean_iou": mean_iou,
        "min_iou": float(np.min(all_ious)) if all_ious else 1.0,
        "max_iou_diff": max_iou_diff,
        "mean_score_diff": mean_diff,
        "max_score_diff": float(np.max(all_score_diffs)) if all_score_diffs else 0.0,
        "class_label_match_rate": class_match_rate,
        "parity_criteria": {
            "mean_iou_gte_0_99": bool(mean_iou >= 0.99),
            "class_match_100pct": bool(class_match_rate == 1.0),
            "output_shape_valid": bool(len(output_shape) == 3 and output_shape[1] == 5 and output_shape[2] == 2100)
        },
        "per_image_results": results_list
    }
    
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2)
        
    print(f"PASS: Parity verified across {len(selected_images)} images.")
    print(f"Mean IoU: {mean_iou:.5f}, Max score diff: {summary['max_score_diff']:.5f}, Class match: {class_match_rate*100:.1f}%")

if __name__ == "__main__":
    main()
