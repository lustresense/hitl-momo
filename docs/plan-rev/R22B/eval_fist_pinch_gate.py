"""Reproduce the R22B fist-vs-pinch onset gate (G1) on the weak-label fixture.

Usage:  python3 -I eval_fist_pinch_gate.py s970_t004_handstate_weaklabels_v1.json

Geometry is computed exactly like the TS PinchSource should: 2D landmarks, x multiplied by
the frame aspect (so distances are isotropic), hand scale = |wrist(0) - middleMCP(9)|.

Onset gate G1' (variant-aware, applied only when the pinch would START ink):
  - middle/ring/pinky: >= 2 of 3 'extended'  -> PINCH_OK path: a fist is impossible, no extra check
  - otherwise (PINCH_CLOSED path)            -> G1: indexPipAngle(5,6,7) >= 60 deg
                                                AND (thumbOpen OR |thumbTip(4) - indexMCP(5)| / scale >= 0.33)
Why variant-aware: in an OK-sign pinch the arched index often projects with a small PIP angle
(21-57 deg seen in S-970 strokes 13/14), so plain G1 would block real OK-sign onsets.
Thresholds were fitted on ONE person, TWO sessions. They are a starting point, not a final answer:
re-fit them on guided-capture data from >= 2 people and report the ROC before freezing.
"""
import json, math, sys, collections

PIP_MIN_DEG = 60.0
THUMB_IDXMCP_MIN = 0.33


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def angle(a, b, c):
    v1 = (a[0] - b[0], a[1] - b[1])
    v2 = (c[0] - b[0], c[1] - b[1])
    n = math.hypot(*v1) * math.hypot(*v2)
    if n == 0:
        return float("nan")
    cos = (v1[0] * v2[0] + v1[1] * v2[1]) / n
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def features(row):
    asp = row.get("aspect") or 1.7778
    L = [(p[0] * asp, p[1]) for p in row["lm"]]
    scale = dist(L[0], L[9])
    pc = tuple(sum(L[i][k] for i in (0, 5, 9, 13, 17)) / 5 for k in (0, 1))
    return {
        "pinchRatio": dist(L[4], L[8]) / scale,
        "indexPipAngle": angle(L[5], L[6], L[7]),
        "thumbTipToIndexMcp": dist(L[4], L[5]) / scale,
        "indexTipToIndexMcp": dist(L[8], L[5]) / scale,
        "indexTipToPalm": dist(L[8], pc) / scale,
        "thumbOpen": bool(row["rule"].get("thumbOpen")),
    }


def g1(fe):
    return fe["indexPipAngle"] >= PIP_MIN_DEG and (fe["thumbOpen"] or fe["thumbTipToIndexMcp"] >= THUMB_IDXMCP_MIN)


def onset_gate(fe, finger_states):
    mrp = (finger_states or ["?"] * 4)[1:]
    if sum(1 for v in mrp if v == "extended") >= 2:
        return True  # PINCH_OK path
    return g1(fe)  # PINCH_CLOSED path


def main(path):
    fx = json.load(open(path))
    tally = collections.defaultdict(lambda: [0, 0])
    for row in fx["frames"]:
        lab = row["label"]
        fe = features(row)
        rule_pinch = row["rule"]["rawPose"] == "pinch"
        key = f'{row["trialId"]}  {lab["pose"]}/{lab["contact"]}/{lab["variant"]}'
        # positives: a pinch the current rule accepted that G1 must keep; negatives: anything G1 must not open
        passed = rule_pinch and onset_gate(fe, row["rule"].get("fingerStates"))
        tally[key][0] += int(passed)
        tally[key][1] += 1
    print(f"G1': MRP>=2 extended -> allow; else indexPipAngle >= {PIP_MIN_DEG} and (thumbOpen or thumbTip-indexMCP >= {THUMB_IDXMCP_MIN})\n")
    print(f'{"group":62s} {"pinch onset allowed":>22s}')
    for k in sorted(tally):
        a, n = tally[k]
        print(f"{k:62s} {a:5d}/{n:<5d} ({100*a/n:5.1f}%)")
    print("\nWant: PINCH/TOUCH rows close to 100%; FIST, ONE, FIVE, FIST_OR_TRANSITION, TRANSITION rows at 0%.")


if __name__ == "__main__":
    main(sys.argv[1])
