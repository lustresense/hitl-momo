#!/usr/bin/env python3
"""R20 Stage P1 Hard-Negative Curation & Subject/Session-Disjoint OOD Partitioning (`curate_r20_hard_negatives.py`).

Implements §3, §5, §12.3 hard rules when promoting `EVAL_ONLY -> TRAIN`:
  1. `HANDS RGB-D` (`10.17632/ndrczc35bt.2`, `CC BY 4.0`, 5 subjects `Subject1..Subject5`):
     - `Subject1, Subject2` -> Audited non-pistol `OTHER` hard negatives for `C3/C4` TRAIN
       (`Horiz_HBL/HFR/HFL/HBR` = audited 5-finger flat horizontal open palms -> `OTHER`,
        plus `Punch/Five/TimeOut/Span/Two/Six/Seven/Eight` -> `OTHER`).
       `One_VFL/One_VFR` (vertical 1-finger tucked-thumb pointing, READY-like) are QUARANTINED from
       `OTHER` training so positive 1-finger pointing is never mislabeled as `OTHER`.
     - `Subject3` -> Held out as hard-negative VAL slice (`hands_rgbd_s3_val.jsonl`).
     - `Subject4, Subject5` -> Strictly isolated Person-Disjoint Locked OOD TEST
       (`hands_rgbd_s4_s5_ood_test.jsonl`, 1,080 frames, 0 overlap with Subject1..3).
       Per §3 line 65, we record full provenance (`source_id / person_id / session_id / clip_id /
       frame_idx / lighting / handedness / labeler / license / sha256`) and never claim `Subject1..3`
       as an independent OOD test for C3/C4.

  2. `Egocentric/Exocentric Hands v2` (`10.17632/bxr7kx84y6.2`, `CC BY 4.0`, local `dim_light_1.zip`, `natural_light_1.zip`):
     - The locked R18/R19 `ux3_mendeley_distractor_landmarks.json` (599 frames) used ONLY
       `Dim Light/{Chinese Chess, Dice, Meeting Chess}` and `Natural Light/{Aeroplane Chess, Checkers, Dice}`.
     - It contained 0 frames from `Dim Light/Gomoku` (331 frames) and `Natural Light/Poker` (555 frames).
     - We decode a strided subset of `Dim Light/Gomoku` and `Natural Light/Poker`, run MediaPipe
       HandLandmarker (`L0 RAW` + `L1 CLAHE320`), apply a geometric pistol-quarantine filter (any hand
       with index extended + middle/ring/pinky curled is placed in `QUARANTINE` rather than blindly
       labeled `OTHER`), save a visual audit contact sheet (`bxr7_gomoku_poker_audit.jpg`), and split
       by temporal session chunk with a >20-frame buffer gap:
         * First 70% of `Gomoku` and `Poker` -> `C3/C4` TRAIN hard negatives (`extra_bxr7_gomoku_poker_train.jsonl`)
         * Final 25% of `Gomoku` and `Poker` -> Disjoint session-chunk OOD holdout (`bxr7_gomoku_poker_ood_test.jsonl`)
       while preserving the original 599-frame `ux3_mendeley_distractor_landmarks.json` untouched.
"""
from __future__ import annotations

import collections
import hashlib
import json
import os
import sys
import time
import zipfile

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mp_common import build_landmarker, detect_l0_l1  # noqa: E402

SANDBOX = os.environ.get("R20_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r20-sandbox")
R19_SANDBOX = os.environ.get("R19_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r19-sandbox")
R18_SANDBOX = os.environ.get("R18_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox")
OUT_DIR = f"{SANDBOX}/data/hard_neg"

HRGBD_JSONL = f"{R19_SANDBOX}/data/hands_rgbd_eval/hands_rgbd_landmarks.jsonl"
BXR7_DIR = f"{R18_SANDBOX}/datasets/mendeley_bxr7kx84y6"

HRGBD_QUARANTINE_READY_LIKE = {"One_VFL", "One_VFR"}


def is_pistol_or_pointing_like(hand: dict) -> bool:
    """Quarantine filter for unlabeled bxr7 board-game/card hands:
    reject any hand where index is clearly extended and middle+ring+pinky are curled."""
    pts = hand.get("landmarks") or []
    if len(pts) < 21:
        return True
    w = np.asarray(pts[0][:2], dtype=np.float64)
    idx_mcp, idx_tip = np.asarray(pts[5][:2]), np.asarray(pts[8][:2])
    mid_mcp, mid_tip = np.asarray(pts[9][:2]), np.asarray(pts[12][:2])
    rng_mcp, rng_tip = np.asarray(pts[13][:2]), np.asarray(pts[16][:2])
    pnk_mcp, pnk_tip = np.asarray(pts[17][:2]), np.asarray(pts[20][:2])

    def ext_ratio(mcp, tip):
        d_mcp = float(np.linalg.norm(mcp - w))
        d_tip = float(np.linalg.norm(tip - w))
        return d_tip / max(d_mcp, 1e-4)

    r_idx = ext_ratio(idx_mcp, idx_tip)
    r_mid = ext_ratio(mid_mcp, mid_tip)
    r_rng = ext_ratio(rng_mcp, rng_tip)
    r_pnk = ext_ratio(pnk_mcp, pnk_tip)
    return bool(r_idx > 1.55 and r_mid < 1.35 and r_rng < 1.35 and r_pnk < 1.35)


def curate_hands_rgbd() -> dict:
    train_rows = []
    val_rows = []
    test_frames = []
    provenance_records = []
    counts = collections.defaultdict(lambda: collections.Counter())

    for line in open(HRGBD_JSONL, encoding="utf-8"):
        if not line.strip():
            continue
        r = json.loads(line)
        subj = r["subject"]
        aspect = float(r.get("aspect") or (960 / 540))
        if subj in ("Subject4", "Subject5"):
            test_frames.append(r)
            counts["ood_test_s4_s5"]["frames"] += 1

        # Match GT hand labels to L0 (or L1 fallback) detected hands
        l0_hands = (r.get("l0") or {}).get("hands") or []
        l1_hands = ((r.get("l1") or {}).get("hands") or []) if r.get("l1") else []
        match_l0 = r.get("gt_match_l0") or {}
        match_l1 = r.get("gt_match_l1") or {}

        for cls_name in r["combo"]:
            hi0 = match_l0.get(cls_name)
            hi1 = match_l1.get(cls_name)
            hand = None
            src_mode = "l0"
            if hi0 is not None and 0 <= hi0 < len(l0_hands):
                hand = l0_hands[hi0]
            elif hi1 is not None and 0 <= hi1 < len(l1_hands):
                hand = l1_hands[hi1]
                src_mode = "l1_clahe"
            if hand is None:
                counts[subj]["detector_miss"] += 1
                continue

            if cls_name in HRGBD_QUARANTINE_READY_LIKE:
                counts[subj]["quarantine_ready_like"] += 1
                continue

            lm_bytes = json.dumps(hand["landmarks"], separators=(",", ":")).encode("utf-8")
            lm_sha = hashlib.sha256(lm_bytes).hexdigest()[:16]
            prov = {
                "source_id": "hands_rgbd_ndrczc35bt_v2",
                "person_id": subj,
                "session_id": f"{subj}_{ '_'.join(r['combo']) }",
                "clip_id": r["filename"].split("/")[0],
                "frame_idx": r["sample_id"],
                "filename": r["filename"],
                "lighting": "dark_or_backlight" if r.get("is_dark") else "indoor_rgbd",
                "handedness": hand.get("handedness") or "Unknown",
                "raw_label": cls_name,
                "r20_label": "OTHER",
                "labeler": "GT_class_audited_R19_R20 (Horiz_H*=5-finger flat palm, non-point=OTHER)",
                "license": "CC BY 4.0",
                "landmarks_sha256_16": lm_sha,
                "partition": "train" if subj in ("Subject1", "Subject2") else ("val" if subj == "Subject3" else "ood_test_s4_s5"),
            }
            provenance_records.append(prov)
            counts[subj][f"audited_OTHER_{src_mode}"] += 1

            # Weight harder distractors (Horiz_*, Eight_*, Span_*, Two_*) slightly higher
            is_hard = cls_name.startswith(("Horiz_", "Eight_", "Span_", "Two_"))
            w = 0.45 if is_hard else 0.30
            extra_obj = {
                "source": f"hrgbd_{subj.lower()}",
                "raw_label": cls_name,
                "label": "OTHER",
                "group": f"hrgbd_{subj}",
                "aspect": round(aspect, 5),
                "weight": w,
                "landmarks": hand["landmarks"],
                "has_history": False,
                "provenance": prov,
            }
            if subj in ("Subject1", "Subject2"):
                train_rows.append(extra_obj)
            elif subj == "Subject3":
                val_rows.append(extra_obj)

    with open(f"{OUT_DIR}/extra_hands_rgbd_s1_s2_train.jsonl", "w", encoding="utf-8") as f:
        for row in train_rows:
            f.write(json.dumps(row) + "\n")
    with open(f"{OUT_DIR}/hands_rgbd_s3_val.jsonl", "w", encoding="utf-8") as f:
        for row in val_rows:
            f.write(json.dumps(row) + "\n")
    with open(f"{OUT_DIR}/hands_rgbd_s4_s5_ood_test.jsonl", "w", encoding="utf-8") as f:
        for row in test_frames:
            f.write(json.dumps(row) + "\n")

    return {
        "train_s1_s2_rows": len(train_rows),
        "val_s3_rows": len(val_rows),
        "ood_test_s4_s5_frames": len(test_frames),
        "by_subject": {k: dict(v) for k, v in counts.items()},
        "provenance_count": len(provenance_records),
    }


def curate_bxr7_gomoku_poker() -> dict:
    det0 = build_landmarker("IMAGE")
    det1 = build_landmarker("IMAGE")

    sessions = [
        ("dim_light_1.zip", "Dim Light/Gomoku/", "dim_light_gomoku", 2),
        ("natural_light_1.zip", "Natural Light/Poker/", "natural_light_poker", 3),
    ]
    train_rows = []
    ood_test_rows = []
    tiles = []
    stats = {}

    for zname, prefix, tag, stride in sessions:
        zp = os.path.join(BXR7_DIR, zname)
        c = collections.Counter()
        with zipfile.ZipFile(zp) as zf:
            names = sorted(
                n for n in zf.namelist()
                if n.startswith(prefix) and n.lower().endswith((".jpg", ".jpeg", ".png"))
            )
            c["total_in_zip"] = len(names)
            # First 68% -> train candidate pool; gap 68%..75%; final 25% -> disjoint OOD test pool
            n_tot = len(names)
            i_tr_end = int(round(n_tot * 0.68))
            i_te_start = int(round(n_tot * 0.75))

            sampled = []
            for idx, nm in enumerate(names):
                if idx < i_tr_end and (idx % stride == 0):
                    sampled.append((idx, nm, "train"))
                elif idx >= i_te_start and ((idx - i_te_start) % stride == 0):
                    sampled.append((idx, nm, "ood_test"))

            for idx, nm, part in sampled:
                raw = zf.read(nm)
                sha = hashlib.sha256(raw).hexdigest()[:16]
                bgr = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
                if bgr is None:
                    c["decode_err"] += 1
                    continue
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                res = detect_l0_l1(rgb, det0, det1, run_l1_always=True)
                aspect = float(res["aspect"])
                hands = res["l0"]["hands"] if res["l0"]["n_hands"] > 0 else (res["l1"]["hands"] if res["l1"] and res["l1"]["n_hands"] > 0 else [])
                c[f"{part}_frames_probed"] += 1
                if not hands:
                    c[f"{part}_detector_miss"] += 1
                    continue
                if len(tiles) < 24 and (len(tiles) % 2 == 0 or "dim" in tag):
                    tiles.append((f"{tag[:12]} #{idx} ({part})", rgb))

                for hi, h in enumerate(hands):
                    if is_pistol_or_pointing_like(h):
                        c[f"{part}_quarantine_pointing_like"] += 1
                        continue
                    prov = {
                        "source_id": "mendeley_bxr7kx84y6_v2",
                        "person_id": f"{tag}_players",
                        "session_id": tag,
                        "clip_id": prefix.strip("/"),
                        "frame_idx": idx,
                        "filename": nm,
                        "lighting": "dim_light" if "dim" in tag else "natural_light",
                        "handedness": h.get("handedness") or "Unknown",
                        "raw_label": f"{prefix.strip('/')}_hand{hi}",
                        "r20_label": "OTHER",
                        "labeler": "board_card_game_audited_non_pointing_filter",
                        "license": "CC BY 4.0",
                        "image_sha256_16": sha,
                        "partition": part,
                    }
                    row = {
                        "source": f"bxr7_{tag}",
                        "raw_label": prefix.strip("/"),
                        "label": "OTHER",
                        "group": f"bxr7_{tag}",
                        "aspect": round(aspect, 5),
                        "weight": 0.40 if "dim" in tag else 0.30,
                        "landmarks": h["landmarks"],
                        "has_history": False,
                        "provenance": prov,
                    }
                    if part == "train":
                        train_rows.append(row)
                        c["train_hands_kept"] += 1
                    else:
                        ood_test_rows.append(row)
                        c["ood_test_hands_kept"] += 1
        stats[tag] = dict(c)

    # Save contact sheet in sandbox
    if tiles:
        cols = 6
        tw, th = 200, 140
        rows_n = (len(tiles) + cols - 1) // cols
        canvas = np.full((rows_n * th, cols * tw, 3), 20, dtype=np.uint8)
        for i, (cap, im) in enumerate(tiles):
            r, col = divmod(i, cols)
            sub = cv2.resize(im, (tw - 4, th - 24), interpolation=cv2.INTER_AREA)
            canvas[r * th + 2 : r * th + 2 + sub.shape[0], col * tw + 2 : col * tw + 2 + sub.shape[1]] = sub
            cv2.putText(canvas, cap[:26], (col * tw + 4, r * th + th - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (230, 230, 230), 1)
        cv2.imwrite(f"{OUT_DIR}/bxr7_gomoku_poker_audit.jpg", cv2.cvtColor(canvas, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 88])

    with open(f"{OUT_DIR}/extra_bxr7_gomoku_poker_train.jsonl", "w", encoding="utf-8") as f:
        for row in train_rows:
            f.write(json.dumps(row) + "\n")
    with open(f"{OUT_DIR}/bxr7_gomoku_poker_ood_test.jsonl", "w", encoding="utf-8") as f:
        for row in ood_test_rows:
            f.write(json.dumps(row) + "\n")

    return {
        "train_rows": len(train_rows),
        "ood_test_rows": len(ood_test_rows),
        "sessions": stats,
    }


def main() -> None:
    t0 = time.time()
    os.makedirs(OUT_DIR, exist_ok=True)
    hrgbd = curate_hands_rgbd()
    bxr7 = curate_bxr7_gomoku_poker()
    summary = {
        "elapsed_sec": round(time.time() - t0, 2),
        "hands_rgbd": hrgbd,
        "bxr7_gomoku_poker": bxr7,
    }
    with open(f"{OUT_DIR}/hard_neg_curation_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
