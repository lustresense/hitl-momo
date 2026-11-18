#!/usr/bin/env python3
"""Stream person-disjoint IPN HandS train videos (MPHands + temporal annotations) as NDJSON lines to stdout."""
import json
import os
import sys
import zipfile

IPN_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/ipn_hands"
SPLIT_PATH = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results/ipn_person_split.json"
CLASSES = [
    "NOG", "P1F", "P2F", "C1F", "C2F", "TUP", "TDN", "TLT",
    "TRT", "OP2", "2C1", "2C2", "ZIN", "ZOT", "GRB"
]


def parse_hand_21(hand_obj: dict) -> list[list[float]]:
    lms = hand_obj["landmarks"]
    return [[float(lms[str(i)][0]), float(lms[str(i)][1])] for i in range(21)]


def main() -> None:
    split = json.load(open(SPLIT_PATH))
    train_persons = set(split["train_persons"])
    held_persons = set(split["val_persons"]) | set(split["test_persons"])
    assert len(train_persons & held_persons) == 0, "Subject leakage detected!"

    za = zipfile.ZipFile(os.path.join(IPN_DIR, "IPN_HandS_annotations.zip"))
    zg = zipfile.ZipFile(os.path.join(IPN_DIR, "IPN_HandS_landmarks_GT.zip"))
    zm = zipfile.ZipFile(os.path.join(IPN_DIR, "IPN_HandS_landmarks_MPHands.zip"))

    for vid in split["train_videos"]:
        person = vid.split("_")[1]
        assert person in train_persons and person not in held_persons
        ann_lines = za.read(f"temporal_annotations/{vid}.txt").decode("utf-8").splitlines()
        segs = []
        max_end = 0
        for line in ann_lines:
            if not line.strip():
                continue
            parts = [p.strip() for p in line.split(",")]
            cid, s, e = int(parts[0]), int(parts[1]), int(parts[2])
            segs.append((cid, s, e))
            if e > max_end:
                max_end = e
        frame_cls = [0] * (max_end + 1)
        for cid, s, e in segs:
            for idx in range(s, e + 1):
                if idx < len(frame_cls):
                    frame_cls[idx] = cid

        gt_doc = json.loads(zg.read(f"landmarks_gt/{vid}.json"))
        mp_doc = json.loads(zm.read(f"landmarks_mp_hands/{vid}.json"))
        frames = []
        for k in sorted(gt_doc.keys()):
            fnum = int(k.rsplit("_", 1)[1].split(".")[0])
            cid = frame_cls[fnum] if fnum < len(frame_cls) else 0
            cname = CLASSES[cid] if 0 <= cid < len(CLASSES) else "NOG"
            mp_hands = (mp_doc.get(k) or {}).get("hand_landmarks") or []
            frames.append({
                "f": fnum,
                "cls": cname,
                "mp": [parse_hand_21(mp_hands[0])] if mp_hands else [],
            })
        sys.stdout.write(json.dumps({"video": vid, "person": person, "frames": frames}) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
