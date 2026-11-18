#!/usr/bin/env python3
"""R18-UX0-B step 1: Audit IPN HandS (CC BY 4.0) GT vs MPHands landmarks directly from zip archives.

Measures:
- File integrity (SHA-256 against README_HandS.md)
- Video/frame/segment counts across official train (148) & test (52) splits
- MediaPipe Hands detection miss rate (F2) when GT has hand, by gesture class
- MediaPipe Hands false hand rate (F1) when GT has 0 hands
- Per-frame landmark error (normalized & 640x480 px) for wrist (0), thumb tip (4), index tip (8), and mean 21 pts
- Exports `ipn_test_sequences.json` (52 official test videos: GT + MPHands + temporal labels) for TS rule/FSM replay
"""
import collections
import hashlib
import json
import math
import os
import zipfile
import numpy as np

IPN_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/ipn_hands"
RESULTS_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results"

CLASSES = [
    "NOG", "P1F", "P2F", "C1F", "C2F", "TUP", "TDN", "TLT",
    "TRT", "OP2", "2C1", "2C2", "ZIN", "ZOT", "GRB"
]

EXPECTED_SHA256 = {
    "IPN_HandS_annotations.zip": "4686a2ebf70a6036166c261bc6992d050cfba08c3b18edcdd460b3fa9f30ec71",
    "IPN_HandS_landmarks_GT.zip": "493bf53638d5b1477e28f05c41884f0cabdcb7b84f20d68f3d5d94e0b46fad4d",
    "IPN_HandS_landmarks_MPHands.zip": "e511bb2b902207b82a296190daadc30a057f3abc16f628579542d2b1274ce598",
}


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_hand_21(hand_obj: dict) -> list[list[float]]:
    lms = hand_obj["landmarks"]
    return [[float(lms[str(i)][0]), float(lms[str(i)][1])] for i in range(21)]


def main() -> None:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    hashes = {}
    for fn, exp in EXPECTED_SHA256.items():
        p = os.path.join(IPN_DIR, fn)
        got = sha256_file(p)
        hashes[fn] = {"sha256": got, "matches_readme": got == exp, "bytes": os.path.getsize(p)}
        print(f"SHA256 {fn}: {got} (matches README: {got == exp})", flush=True)

    za = zipfile.ZipFile(os.path.join(IPN_DIR, "IPN_HandS_annotations.zip"))
    zg = zipfile.ZipFile(os.path.join(IPN_DIR, "IPN_HandS_landmarks_GT.zip"))
    zm = zipfile.ZipFile(os.path.join(IPN_DIR, "IPN_HandS_landmarks_MPHands.zip"))

    def read_list(name: str) -> list[str]:
        raw = za.read(name).decode("utf-8").splitlines()
        return [x.strip() for x in raw if x.strip()]

    train_vids = read_list("splits/train_list.txt")
    test_vids = read_list("splits/test_list.txt")
    test_set = set(test_vids)
    all_vids = [(v, "train") for v in train_vids] + [(v, "test") for v in test_vids]

    by_class = collections.defaultdict(lambda: {
        "frames": 0, "gt_has_hand": 0, "mp_missed_when_gt": 0,
        "gt_no_hand": 0, "mp_false_when_no_gt": 0,
        "both_1hand": 0, "err_mean21_norm": [], "err_tip8_norm": [], "err_wrist_norm": [],
        "handedness_mismatch": 0,
    })
    by_split = collections.defaultdict(lambda: {"videos": 0, "frames": 0, "gt_has_hand": 0, "mp_missed": 0, "gt_no_hand": 0, "mp_false": 0})
    video_miss_rates = []
    test_export = []

    for vid, split in all_vids:
        # temporal annotations: class_id, start_frame, end_frame (1-based inclusive)
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

        by_split[split]["videos"] += 1
        vid_gt_pos = 0
        vid_mp_miss = 0
        vid_frames_export = []

        # Sort keys by 1-based frame index
        keys = sorted(gt_doc.keys())
        for k in keys:
            # Frame number from suffix _000123.jpg
            fnum = int(k.rsplit("_", 1)[1].split(".")[0])
            cid = frame_cls[fnum] if fnum < len(frame_cls) else 0
            cname = CLASSES[cid] if 0 <= cid < len(CLASSES) else f"C{cid}"

            gt_hands = gt_doc[k].get("hand_landmarks") or []
            mp_hands = (mp_doc.get(k) or {}).get("hand_landmarks") or []

            cstat = by_class[cname]
            cstat["frames"] += 1
            by_split[split]["frames"] += 1

            if len(gt_hands) > 0:
                cstat["gt_has_hand"] += 1
                by_split[split]["gt_has_hand"] += 1
                vid_gt_pos += 1
                if len(mp_hands) == 0:
                    cstat["mp_missed_when_gt"] += 1
                    by_split[split]["mp_missed"] += 1
                    vid_mp_miss += 1
            else:
                cstat["gt_no_hand"] += 1
                by_split[split]["gt_no_hand"] += 1
                if len(mp_hands) > 0:
                    cstat["mp_false_when_no_gt"] += 1
                    by_split[split]["mp_false"] += 1

            if len(gt_hands) == 1 and len(mp_hands) == 1:
                g_pts = np.array(parse_hand_21(gt_hands[0]), dtype=np.float32)
                m_pts = np.array(parse_hand_21(mp_hands[0]), dtype=np.float32)
                d = np.linalg.norm(g_pts - m_pts, axis=1)
                cstat["both_1hand"] += 1
                cstat["err_mean21_norm"].append(float(d.mean()))
                cstat["err_tip8_norm"].append(float(d[8]))
                cstat["err_wrist_norm"].append(float(d[0]))
                if gt_hands[0].get("handedness") != mp_hands[0].get("handedness"):
                    cstat["handedness_mismatch"] += 1

            if split == "test":
                vid_frames_export.append({
                    "f": fnum,
                    "cls": cname,
                    "gt": [parse_hand_21(h) for h in gt_hands],
                    "mp": [parse_hand_21(h) for h in mp_hands],
                })

        if vid_gt_pos > 0:
            video_miss_rates.append({
                "video": vid,
                "split": split,
                "gt_pos_frames": vid_gt_pos,
                "mp_miss_frames": vid_mp_miss,
                "miss_pct": round(100.0 * vid_mp_miss / vid_gt_pos, 2),
            })
        if split == "test":
            test_export.append({"video": vid, "frames": vid_frames_export})

    class_summary = {}
    for cname in CLASSES:
        st = by_class[cname]
        if st["frames"] == 0:
            continue
        em = np.array(st["err_mean21_norm"]) if st["err_mean21_norm"] else np.array([np.nan])
        e8 = np.array(st["err_tip8_norm"]) if st["err_tip8_norm"] else np.array([np.nan])
        ew = np.array(st["err_wrist_norm"]) if st["err_wrist_norm"] else np.array([np.nan])
        class_summary[cname] = {
            "frames": st["frames"],
            "gt_has_hand": st["gt_has_hand"],
            "mp_missed": st["mp_missed_when_gt"],
            "miss_rate_pct": round(100.0 * st["mp_missed_when_gt"] / max(1, st["gt_has_hand"]), 2),
            "gt_no_hand": st["gt_no_hand"],
            "mp_false_hand": st["mp_false_when_no_gt"],
            "false_hand_rate_pct": round(100.0 * st["mp_false_when_no_gt"] / max(1, st["gt_no_hand"]), 2) if st["gt_no_hand"] else None,
            "both_1hand": st["both_1hand"],
            "mean21_err_p50_norm": round(float(np.nanpercentile(em, 50)), 5),
            "mean21_err_p95_norm": round(float(np.nanpercentile(em, 95)), 5),
            "tip8_err_p50_px640x480": round(float(np.nanpercentile(e8, 50)) * 640.0, 2),
            "tip8_err_p95_px640x480": round(float(np.nanpercentile(e8, 95)) * 640.0, 2),
            "wrist_err_p50_px640x480": round(float(np.nanpercentile(ew, 50)) * 640.0, 2),
            "handedness_mismatch_pct": round(100.0 * st["handedness_mismatch"] / max(1, st["both_1hand"]), 2),
        }

    split_summary = {}
    for sp, st in by_split.items():
        split_summary[sp] = {
            **st,
            "miss_rate_pct": round(100.0 * st["mp_missed"] / max(1, st["gt_has_hand"]), 2),
            "false_hand_rate_pct": round(100.0 * st["mp_false"] / max(1, st["gt_no_hand"]), 2) if st["gt_no_hand"] else None,
        }

    video_miss_rates.sort(key=lambda x: x["miss_pct"], reverse=True)
    summary = {
        "hashes": hashes,
        "split_summary": split_summary,
        "by_class": class_summary,
        "worst_10_videos_by_miss_rate": video_miss_rates[:10],
        "best_5_videos_by_miss_rate": video_miss_rates[-5:],
    }
    with open(os.path.join(RESULTS_DIR, "r18_ux0_b_ipn_detection.json"), "w") as f:
        json.dump(summary, f, indent=2)
    # Write compact test sequences JSON temporarily for TS baseline evaluation
    with open(os.path.join(RESULTS_DIR, "ipn_test_sequences.json"), "w") as f:
        json.dump(test_export, f, separators=(",", ":"))
    print("Saved r18_ux0_b_ipn_detection.json and ipn_test_sequences.json", flush=True)
    print(json.dumps(split_summary, indent=2))


if __name__ == "__main__":
    main()
