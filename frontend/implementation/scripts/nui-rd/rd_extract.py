#!/usr/bin/env python3
"""RD-04 step 1: sample hand landmarks from the public HaGRIDv2 annotation archive.

Reads ONLY the annotation zip (no images). Writes compact landmark-only JSON per split to an output directory that
must be OUTSIDE the repository (the data is CC BY-SA 4.0 third-party material and is never committed).

  python3 -I scripts/nui-rd/rd_extract.py <hagrid_annotations.zip> <out_dir>

Sampling is seeded, capped per class and per subject, and each landmark row keeps its HaGRID `user_id` so the split
can be audited. The official HaGRID split is by subject; this script also CHECKS that no user_id appears in two splits.
"""
import collections
import json
import os
import random
import sys
import zipfile

SEED = 17
CLASSES = ["palm", "stop", "four", "three", "three2", "three3", "one", "two_up", "peace", "fist", "ok", "no_gesture",
           "thumb_index", "like", "call", "grip", "grabbing", "point", "rock", "mute", "dislike"]
CAP_CLASS = {"train": 6000, "val": 2500, "test": 2500}
CAP_USER_CLASS = {"train": 25, "val": 25, "test": 25}


def main(zip_path: str, out_dir: str) -> None:
    random.seed(SEED)
    os.makedirs(out_dir, exist_ok=True)
    z = zipfile.ZipFile(zip_path)
    names = set(z.namelist())
    users = {}
    report = {}
    for split in ("train", "val", "test"):
        rows, rep = [], {}
        for c in CLASSES:
            name = f"annotations/{split}/{c}.json"
            if name not in names:
                rep[c] = {"missing": True}
                continue
            data = json.loads(z.read(name))
            items = []
            for key, e in data.items():
                labels = e.get("labels") or []
                lms = e.get("hand_landmarks") or []
                for i, l in enumerate(labels):
                    if l != c or i >= len(lms) or not lms[i] or len(lms[i]) != 21:
                        continue
                    items.append((key, e.get("user_id"), lms[i]))
            total = len(items)
            random.shuffle(items)
            per_user = collections.Counter()
            kept = []
            for key, u, lm in items:
                if per_user[u] >= CAP_USER_CLASS[split]:
                    continue
                per_user[u] += 1
                kept.append((key, u, lm))
                if len(kept) >= CAP_CLASS[split]:
                    break
            rep[c] = {"hands_with_landmarks": total, "kept": len(kept), "users_kept": len({u for _, u, _ in kept})}
            for key, u, lm in kept:
                rows.append({"c": c, "k": key, "u": u, "lm": [[round(p[0], 5), round(p[1], 5)] for p in lm]})
            del data
            print(split, c, rep[c], flush=True)
        users[split] = {r["u"] for r in rows}
        report[split] = rep
        json.dump(rows, open(os.path.join(out_dir, f"landmarks_{split}.json"), "w"))
    overlap = {
        "train&val": len(users["train"] & users["val"]),
        "train&test": len(users["train"] & users["test"]),
        "val&test": len(users["val"] & users["test"]),
    }
    report["subject_overlap"] = overlap
    report["users"] = {s: len(u) for s, u in users.items()}
    report["caps"] = {"class": CAP_CLASS, "user_class": CAP_USER_CLASS, "seed": SEED}
    json.dump(report, open(os.path.join(out_dir, "extract_report.json"), "w"), indent=1)
    print("subject overlap", overlap, "users", report["users"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
