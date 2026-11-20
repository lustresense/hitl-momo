#!/usr/bin/env python3
"""Reproducible B0 (existing R22 rule) vs B1 (R22B G1' gate) evaluation on weak-s970-t004-v1.

Strictly labels results as WEAK_REGRESSION_EVAL (NOT independent DATASET_GT).
Outputs JSON metrics for Section 8 B6 baseline reporting.
"""
from __future__ import annotations

import collections
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WEAK_FIXTURE = ROOT / "docs/plan-rev/R22B/s970_t004_handstate_weaklabels_v1.json"
OUT_PATH = ROOT / "r22b/results/r22b_b0_vs_b1_baseline.json"


def dist(a, b, aspect=16 / 9):
    return math.hypot((a[0] - b[0]) * aspect, a[1] - b[1])


def angle_deg(a, b, c, aspect=16 / 9):
    v1 = ((a[0] - b[0]) * aspect, a[1] - b[1])
    v2 = ((c[0] - b[0]) * aspect, c[1] - b[1])
    n1 = math.hypot(*v1)
    n2 = math.hypot(*v2)
    if n1 < 1e-6 or n2 < 1e-6:
        return 0.0
    cos_v = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
    return math.degrees(math.acos(cos_v))


def eval_g1_prime(frame: dict) -> bool:
    if frame["rule"]["rawPose"] != "pinch":
        return False
    lm = frame["lm"]
    aspect = frame["aspect"]
    palm = dist(lm[0], lm[9], aspect)
    if palm < 1e-5:
        return False
    fs = frame["rule"]["fingerStates"]
    mrp_ext = sum(1 for s in fs[1:4] if s == "extended")
    if mrp_ext >= 2:
        return True  # PINCH_OK path (exact parity with eval_fist_pinch_gate.py)
    thumb_open = bool(frame["rule"]["thumbOpen"])
    idx_pip = angle_deg(lm[5], lm[6], lm[7], aspect)
    t_imcp = dist(lm[4], lm[5], aspect) / palm
    return idx_pip >= 60.0 and (thumb_open or t_imcp >= 0.33)


def eval_b0_r22(frame: dict) -> bool:
    return frame["rule"]["rawPose"] == "pinch"


def main() -> int:
    data = json.loads(WEAK_FIXTURE.read_text(encoding="utf-8"))
    frames = data["frames"]
    b0_counts = collections.defaultdict(lambda: [0, 0])
    b1_counts = collections.defaultdict(lambda: [0, 0])

    for f in frames:
        key = f"{f['trialId']}:{f['label']['pose']}/{f['label']['contact']}/{f['label']['variant']}"
        b0_counts[key][1] += 1
        b1_counts[key][1] += 1
        if eval_b0_r22(f):
            b0_counts[key][0] += 1
        if eval_g1_prime(f):
            b1_counts[key][0] += 1

    rows = []
    for k in sorted(b0_counts.keys()):
        b0_ok, tot = b0_counts[k]
        b1_ok, _ = b1_counts[k]
        rows.append(
            {
                "bucket": k,
                "total": tot,
                "b0Allowed": b0_ok,
                "b0Rate": round(b0_ok / tot, 4),
                "b1Allowed": b1_ok,
                "b1Rate": round(b1_ok / tot, 4),
            }
        )

    out = {
        "schema": "r22b-baseline-eval/1",
        "datasetId": "weak-s970-t004-v1",
        "labelSource": "WEAK_REGRESSION_ONLY_NOT_DATASET_GT",
        "totalFrames": len(frames),
        "models": {
            "B0_rule_R22": "Geometric pinch threshold only (0.20 curled / 0.30 otherwise, no G1' gate)",
            "B1_rule_R22B_G1prime": "R22B G1' onset gate (OK: mrpExt>=2 -> allow; CLOSED: idxPip>=60 & (thumbOpen || tIdxMcp>=0.33))",
            "M1_tiny_mlp_82d": "NOT_TESTED (menunggu Owner guided-capture DATASET_GT)",
            "M1x_tiny_mlp_94d": "NOT_TESTED (menunggu Owner guided-capture DATASET_GT)",
            "M2_temporal_tcn_gru": "NOT_TESTED (menunggu Owner guided-capture DATASET_GT)",
        },
        "buckets": rows,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
