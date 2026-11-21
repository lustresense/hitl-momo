#!/usr/bin/env python3
"""High-performance multi-process HTTP Range fetcher for HaGRID v2 images (MoNUI-7 R23 T11a)."""
import csv
import glob
import gzip
import json
import os
import struct
import sys
import time
import zlib
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor

import requests

def clamp(v, min_v=0.0, max_v=1.0):
    return max(min_v, min(max_v, float(v)))

# Worker process initializer & worker function
_session = None
_cd_index = None
_img_boxes = None
_yolo_base = None

def init_worker(cd_index_path, boxes_path, yolo_base):
    global _session, _cd_index, _img_boxes, _yolo_base
    _session = requests.Session()
    adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=3)
    _session.mount("https://", adapter)
    _yolo_base = yolo_base

    # Load cd_index
    with gzip.open(cd_index_path, "rt", encoding="utf-8") as f:
        _cd_index = json.load(f)

    # Load boxes
    _img_boxes = {}
    with open(boxes_path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            img_id = row["image_id"]
            if img_id not in _img_boxes:
                _img_boxes[img_id] = []
            _img_boxes[img_id].append((
                float(row["x"]),
                float(row["y"]),
                float(row["w"]),
                float(row["h"])
            ))

def process_chunk(items):
    global _session, _cd_index, _img_boxes, _yolo_base
    url = "https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/hagrid_v2/hagridv2_512.zip"

    def fetch_item(item):
        img_id, split, cls_name = item
        img_path = os.path.join(_yolo_base, "images", split, f"hagrid__{img_id}.jpg")
        lbl_path = os.path.join(_yolo_base, "labels", split, f"hagrid__{img_id}.txt")

        # Resume check
        if os.path.exists(img_path) and os.path.getsize(img_path) > 0 and os.path.exists(lbl_path):
            return {"status": "skipped", "id": img_id, "bytes": os.path.getsize(img_path), "split": split, "cls": cls_name}

        d = _cd_index.get(img_id)
        if not d:
            return {"status": "fail", "id": img_id, "error": "not_in_cd_index", "split": split, "cls": cls_name}

        fname_guess = len(d["filename"].encode("utf-8")) + 16
        fetch_len = 30 + fname_guess + 512 + d["comp_size"]
        start = d["offset"]
        end = start + fetch_len - 1

        for attempt in range(4):
            try:
                r = _session.get(url, headers={"Range": f"bytes={start}-{end}"}, timeout=20)
                if r.status_code not in (200, 206):
                    raise RuntimeError(f"HTTP {r.status_code}")
                buf = r.content
                if len(buf) < 30:
                    raise RuntimeError("Short header")
                lfh_fname_len, lfh_extra_len = struct.unpack_from("<HH", buf, 26)
                data_rel = 30 + lfh_fname_len + lfh_extra_len
                need_total = data_rel + d["comp_size"]
                if len(buf) < need_total:
                    r2 = _session.get(url, headers={"Range": f"bytes={start + len(buf)}-{start + need_total - 1}"}, timeout=20)
                    buf = buf + r2.content

                comp_data = buf[data_rel : data_rel + d["comp_size"]]
                if d["compress_method"] == 0:
                    raw = comp_data
                elif d["compress_method"] == 8:
                    raw = zlib.decompress(comp_data, -zlib.MAX_WBITS)
                else:
                    raise RuntimeError(f"Unsupported method {d['compress_method']}")

                # Write image
                with open(img_path, "wb") as f_img:
                    f_img.write(raw)

                # Write label: 0 cx cy w h
                boxes = _img_boxes.get(img_id, [])
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
                if attempt == 3:
                    return {"status": "fail", "id": img_id, "error": str(e), "split": split, "cls": cls_name}
                time.sleep(0.5 * (attempt + 1))

    with ThreadPoolExecutor(max_workers=16) as ex:
        results = list(ex.map(fetch_item, items))
    return results

def main():
    t_start = time.time()
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/research-can")

    cd_index_path = os.path.join(data_root, "meta/hagrid/cd_index.json.gz")
    selection_csv = os.path.join(data_root, "meta/hagrid/selection.csv")
    boxes_csv = os.path.join(data_root, "meta/hagrid/boxes.csv")
    failures_csv = os.path.join(data_root, "meta/hagrid/fetch_failures.csv")
    results_json = os.path.join(rc, "r23/results/FX03_hagrid.json")
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")

    for s in ["train", "val", "test"]:
        os.makedirs(os.path.join(yolo_base, "images", s), exist_ok=True)
        os.makedirs(os.path.join(yolo_base, "labels", s), exist_ok=True)

    print("Loading selection tasks...")
    all_tasks = []
    selected_set = set()
    with open(selection_csv, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            all_tasks.append((row["image_id"], row["split"], row["class"]))
            selected_set.add((row["image_id"], row["split"]))

    total_tasks = len(all_tasks)
    print(f"Targeting all {total_tasks} HaGRID images from selection.csv across train, val, and test.")

    # Synchronize: delete any hagrid images/labels not in selection.csv
    deleted_count = 0
    for s in ["train", "val", "test"]:
        for img_p in glob.glob(os.path.join(yolo_base, "images", s, "hagrid__*.jpg")):
            fname = os.path.basename(img_p)
            img_id = fname[len("hagrid__"):-4]
            if (img_id, s) not in selected_set:
                os.remove(img_p)
                lbl_p = os.path.join(yolo_base, "labels", s, f"hagrid__{img_id}.txt")
                if os.path.exists(lbl_p):
                    os.remove(lbl_p)
                deleted_count += 1
    print(f"Cleanup check: removed {deleted_count} stale/unselected images.")

    # Split into chunks for ProcessPoolExecutor
    chunk_size = 200
    chunks = [all_tasks[i:i + chunk_size] for i in range(0, total_tasks, chunk_size)]
    print(f"Divided into {len(chunks)} chunks of up to {chunk_size} tasks.")

    success_count = 0
    skipped_count = 0
    failures = []
    total_bytes = 0
    split_counts = {"train": 0, "val": 0, "test": 0}
    class_counts = {}
    split_class_counts = {"train": {}, "val": {}, "test": {}}

    done_tasks = 0
    with ProcessPoolExecutor(max_workers=4, initializer=init_worker, initargs=(cd_index_path, boxes_csv, yolo_base)) as pex:
        for chunk_results in pex.map(process_chunk, chunks):
            for res in chunk_results:
                done_tasks += 1
                if res["status"] in ("ok", "skipped"):
                    if res["status"] == "ok":
                        success_count += 1
                    else:
                        skipped_count += 1
                    total_bytes += res["bytes"]
                    split_counts[res["split"]] += 1
                    class_counts[res["cls"]] = class_counts.get(res["cls"], 0) + 1
                    s_dict = split_class_counts[res["split"]]
                    s_dict[res["cls"]] = s_dict.get(res["cls"], 0) + 1
                else:
                    failures.append(res)

            elapsed = time.time() - t_start
            rate = done_tasks / max(1.0, elapsed)
            print(f"[{done_tasks}/{total_tasks}] ok={success_count} skip={skipped_count} fail={len(failures)} rate={rate:.1f} imgs/s")

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
        "fetched_count": success_count,
        "skipped_count": skipped_count,
        "deleted_count": deleted_count,
        "failure_count": len(failures),
        "failure_rate": round(fail_rate, 4),
        "total_bytes": total_bytes,
        "duration_seconds": round(elapsed_total, 2),
        "split_counts": split_counts,
        "class_counts": class_counts,
        "split_class_counts": split_class_counts
    }

    os.makedirs(os.path.dirname(results_json), exist_ok=True)
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"\nFX03 HaGRID complete! Summary written to {results_json}")
    print(json.dumps(summary, indent=2))
    return 0 if summary["status"] == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
