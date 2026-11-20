#!/usr/bin/env python3
"""Fetch HaGRID v2 images via HTTP Range and write YOLO format labels according to mandate §6 T11a."""
import csv
import gzip
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/research-can/r20/scripts")
from range_zip import RangeZipReader, ZipEntry

def clamp(v, min_v=0.0, max_v=1.0):
    return max(min_v, min(max_v, float(v)))

def main():
    t_start = time.time()
    url = "https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/hagrid_v2/hagridv2_512.zip"
    print("Initializing RangeZipReader...")
    rz = RangeZipReader(url, timeout=60.0, max_retries=8)
    
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")
    
    cd_index_path = os.path.join(data_root, "meta/hagrid/cd_index.json.gz")
    selection_csv = os.path.join(data_root, "meta/hagrid/selection.csv")
    boxes_csv = os.path.join(data_root, "meta/hagrid/boxes.csv")
    failures_csv = os.path.join(data_root, "meta/hagrid/fetch_failures.csv")
    results_json = os.path.join(rc, "r23/results/T11a_hagrid.json")
    
    print("Loading cd_index...")
    with gzip.open(cd_index_path, "rt", encoding="utf-8") as f:
        cd_index = json.load(f)
        
    print("Loading boxes...")
    img_boxes = {}
    with open(boxes_csv, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            img_id = row["image_id"]
            if img_id not in img_boxes:
                img_boxes[img_id] = []
            img_boxes[img_id].append((
                float(row["x"]),
                float(row["y"]),
                float(row["w"]),
                float(row["h"])
            ))
            
    print("Loading selection...")
    tasks = []
    with open(selection_csv, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            tasks.append((row["image_id"], row["split"], row["class"]))
            
    total_tasks = len(tasks)
    print(f"Total images to process: {total_tasks}")
    
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")
    for s in ["train", "val", "test"]:
        os.makedirs(os.path.join(yolo_base, "images", s), exist_ok=True)
        os.makedirs(os.path.join(yolo_base, "labels", s), exist_ok=True)
        
    failures = []
    success_count = 0
    skipped_count = 0
    total_bytes = 0
    
    def process_item(item):
        img_id, split, cls_name = item
        img_path = os.path.join(yolo_base, "images", split, f"hagrid__{img_id}.jpg")
        lbl_path = os.path.join(yolo_base, "labels", split, f"hagrid__{img_id}.txt")
        
        # Resume check
        if os.path.exists(img_path) and os.path.getsize(img_path) > 0 and os.path.exists(lbl_path):
            return {"status": "skipped", "id": img_id, "bytes": os.path.getsize(img_path), "split": split, "cls": cls_name}
            
        d = cd_index.get(img_id)
        if not d:
            return {"status": "fail", "id": img_id, "error": "not_in_cd_index", "split": split, "cls": cls_name}
            
        entry = ZipEntry(
            filename=d["filename"],
            compress_method=d["compress_method"],
            crc32=d["crc32"],
            comp_size=d["comp_size"],
            uncomp_size=d["uncomp_size"],
            local_header_offset=d["offset"],
            flag_bits=d["flag_bits"]
        )
        
        try:
            raw = rz.fetch_entry_bytes(entry, verify_crc=True)
            # Write image
            with open(img_path, "wb") as f_img:
                f_img.write(raw)
                
            # Write label: 0 (x+w/2) (y+h/2) w h
            boxes = img_boxes.get(img_id, [])
            lines = []
            for (x, y, w, h) in boxes:
                cx = clamp(x + w / 2.0)
                cy = clamp(y + h / 2.0)
                cw = clamp(w)
                ch = clamp(h)
                lines.append(f"0 {cx:.6f} {cy:.6f} {cw:.6f} {ch:.6f}\n")
                
            with open(lbl_path, "w", encoding="utf-8") as f_lbl:
                f_lbl.writelines(lines)
                
            return {"status": "ok", "id": img_id, "bytes": len(raw), "split": split, "cls": cls_name}
        except Exception as e:
            return {"status": "fail", "id": img_id, "error": str(e), "split": split, "cls": cls_name}

    print("Starting ThreadPoolExecutor(max_workers=8)...")
    split_counts = {"train": 0, "val": 0, "test": 0}
    class_counts = {}
    
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(process_item, t): t for t in tasks}
        done_count = 0
        for f in as_completed(futures):
            res = f.result()
            done_count += 1
            if res["status"] in ("ok", "skipped"):
                if res["status"] == "ok":
                    success_count += 1
                else:
                    skipped_count += 1
                total_bytes += res["bytes"]
                split_counts[res["split"]] += 1
                class_counts[res["cls"]] = class_counts.get(res["cls"], 0) + 1
            else:
                failures.append(res)
                
            if done_count % 1000 == 0 or done_count == total_tasks:
                elapsed = time.time() - t_start
                rate = done_count / max(1.0, elapsed)
                print(f"[{done_count}/{total_tasks}] ok={success_count} skip={skipped_count} fail={len(failures)} rate={rate:.1f} imgs/s ({rate*0.04:.2f} MB/s)")
                
    # Retry failures once
    if failures:
        print(f"Retrying {len(failures)} failed items...")
        retry_items = [(f_res["id"], f_res["split"], f_res["cls"]) for f_res in failures]
        failures = []
        for item in retry_items:
            res = process_item(item)
            if res["status"] in ("ok", "skipped"):
                if res["status"] == "ok":
                    success_count += 1
                else:
                    skipped_count += 1
                total_bytes += res["bytes"]
                split_counts[res["split"]] += 1
                class_counts[res["cls"]] = class_counts.get(res["cls"], 0) + 1
            else:
                failures.append(res)
                
    # Save failures if any
    with open(failures_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["id", "split", "cls", "error"])
        w.writeheader()
        for fail in failures:
            w.writerow({"id": fail.get("id"), "split": fail.get("split"), "cls": fail.get("cls"), "error": fail.get("error")})
            
    fail_rate = len(failures) / float(total_tasks) if total_tasks > 0 else 0.0
    elapsed_total = time.time() - t_start
    
    summary = {
        "status": "PASS" if fail_rate < 0.01 else "FAIL",
        "total_requested": total_tasks,
        "success_count": success_count,
        "skipped_count": skipped_count,
        "failure_count": len(failures),
        "failure_rate": fail_rate,
        "total_bytes": total_bytes,
        "duration_seconds": round(elapsed_total, 2),
        "split_counts": split_counts,
        "class_counts": class_counts
    }
    
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
        
    print(f"T11a complete! Summary written to {results_json}")
    print(f"Result: {summary['status']} (failures: {len(failures)}/{total_tasks} = {fail_rate*100:.2f}%)")

if __name__ == "__main__":
    main()
