#!/usr/bin/env python3
"""Verify test split immutability and zero leakage/overlap for MoNUI-7 R23 T16."""
import json
import os
import sys
import time

def main():
    t_start = time.time()
    data_root = os.environ.get("DATA_ROOT", "/home/deano/monui7-local/data")
    rc = os.environ.get("RC", "/srv/sketchbook/mediapipe-optimize/research-can")
    yolo_base = os.path.join(data_root, "yolo/monui7_hand_v0")
    results_json = os.path.join(rc, "r23/results/T16_split_lock.json")

    print(f"Verifying test split isolation at {yolo_base}...")

    # Expected locked test count: 3,149 (1,080 hands + 2,069 oi)
    EXPECTED_TEST_COUNT = 3149
    EXPECTED_TEST_PREFIXES = {
        "hands": 1080,
        "oi": 2069
    }

    test_imgs = os.listdir(os.path.join(yolo_base, "images/test"))
    val_imgs = os.listdir(os.path.join(yolo_base, "images/val"))
    train_imgs = os.listdir(os.path.join(yolo_base, "images/train"))

    test_basenames = {os.path.splitext(f)[0] for f in test_imgs if f.lower().endswith(('.jpg', '.jpeg', '.png'))}
    val_basenames = {os.path.splitext(f)[0] for f in val_imgs if f.lower().endswith(('.jpg', '.jpeg', '.png'))}
    train_basenames = {os.path.splitext(f)[0] for f in train_imgs if f.lower().endswith(('.jpg', '.jpeg', '.png'))}

    # 1. Check exact test count
    test_count = len(test_basenames)
    count_stable = (test_count == EXPECTED_TEST_COUNT)

    # 2. Check prefix breakdown in test
    prefix_counts = {}
    for b in test_basenames:
        prefix = b.split('__')[0] if '__' in b else b.split('_')[0]
        prefix_counts[prefix] = prefix_counts.get(prefix, 0) + 1

    prefix_match = (prefix_counts == EXPECTED_TEST_PREFIXES)

    # 3. Check for any overlap between test and train/val
    overlap_test_train = sorted(list(test_basenames.intersection(train_basenames)))
    overlap_test_val = sorted(list(test_basenames.intersection(val_basenames)))

    # Also check underlying dataset IDs (strip prefix)
    test_ids = {b.split('__', 1)[1] if '__' in b else b for b in test_basenames}
    train_ids = {b.split('__', 1)[1] if '__' in b else b for b in train_basenames}
    val_ids = {b.split('__', 1)[1] if '__' in b else b for b in val_basenames}

    id_overlap_test_train = sorted(list(test_ids.intersection(train_ids)))
    id_overlap_test_val = sorted(list(test_ids.intersection(val_ids)))

    is_isolated = (
        len(overlap_test_train) == 0 and
        len(overlap_test_val) == 0 and
        len(id_overlap_test_train) == 0 and
        len(id_overlap_test_val) == 0
    )

    status = "PASS" if (count_stable and is_isolated) else "FAIL"

    summary = {
        "status": status,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_count": test_count,
        "expected_test_count": EXPECTED_TEST_COUNT,
        "count_stable": count_stable,
        "prefix_counts": prefix_counts,
        "expected_prefixes": EXPECTED_TEST_PREFIXES,
        "prefix_match": prefix_match,
        "overlap_test_train_count": len(overlap_test_train),
        "overlap_test_val_count": len(overlap_test_val),
        "id_overlap_test_train_count": len(id_overlap_test_train),
        "id_overlap_test_val_count": len(id_overlap_test_val),
        "duration_seconds": round(time.time() - t_start, 2)
    }

    os.makedirs(os.path.dirname(results_json), exist_ok=True)
    with open(results_json, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"Test split verification complete! Status: {status}")
    print(json.dumps(summary, indent=2))
    return 0 if status == "PASS" else 1

if __name__ == "__main__":
    sys.exit(main())
