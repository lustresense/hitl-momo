#!/usr/bin/env python3
"""R22B B5.2–B5.3 Guided-Capture Dataset Builder (94D Features + Frozen Splits).

Strictly enforces Contract K4 v1.1 & K7 anti-contamination rules:
  - Accepts ONLY frames with `labelSources.truth == "DATASET_GT"` and `labelProvenance == "guided-capture-v1"`.
  - Drops ALL frames with `truthMasked == true` (first 700 ms / last 300 ms of every guided step).
  - Never uses `RULE_DERIVED`, `MODEL_PREDICTION`, `UNKNOWN`, or unlabelled user telemetry.
  - Subsamples static prompt steps to <= 5 Hz to avoid frame-autocorrelation memorization.
  - Preserves full temporal sequences for `TRANSITION_*` drills.
  - Extracts 94D numeric features (82D baseline + 12D R22B pinch/finger/depth-invariant features).
  - Produces frozen deterministic splits (lighting/variation held-out + person held-out if P2 exists,
    otherwise explicitly sets `personHeldOut = "NOT_AVAILABLE"`) with SHA-256 checksums.

Usage:
  python3 build_r22b_dataset.py --input <export1.json> [<export2.json> ...] --output-dir <out_dir>
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import math
from pathlib import Path
from typing import Any

STATIC_CLASSES = {
    "FIST",
    "ONE",
    "TWO",
    "THREE_IMR",
    "THREE_TIM",
    "THREE_MRP",
    "FOUR",
    "FIVE",
    "PINCH_CLOSED",
    "PINCH_OK",
    "NEAR_PINCH",
    "OTHER",
    "NO_HAND",
}


def dist2(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def angle_deg(a: tuple[float, float], b: tuple[float, float], c: tuple[float, float]) -> float:
    v1x, v1y = a[0] - b[0], a[1] - b[1]
    v2x, v2y = c[0] - b[0], c[1] - b[1]
    n1 = math.hypot(v1x, v1y)
    n2 = math.hypot(v2x, v2y)
    if n1 < 1e-6 or n2 < 1e-6:
        return 0.0
    cos_v = max(-1.0, min(1.0, (v1x * v2x + v1y * v2y) / (n1 * n2)))
    return math.degrees(math.acos(cos_v))


def extract_features_94d(lm_raw: list[list[float]], aspect: float = 16 / 9) -> list[float]:
    """Extracts 94D numeric feature vector (82D normalized base + 12D R22B pinch/PIP/MCP invariants)."""
    pts = [(float(p[0]) * aspect, float(p[1])) for p in lm_raw[:21]]
    wrist = pts[0]
    palm = max(dist2(wrist, pts[9]), 1e-4)

    # 1. 42D wrist-relative palm-normalized coordinates (21 x 2)
    feats: list[float] = []
    for x, y in pts:
        feats.append(round((x - wrist[0]) / palm, 6))
        feats.append(round((y - wrist[1]) / palm, 6))

    # 2. 20D distances from wrist to landmarks 1..20 normalized by palm
    for i in range(1, 21):
        feats.append(round(dist2(wrist, pts[i]) / palm, 6))

    # 3. 10D pairwise tip-to-tip distances among [4, 8, 12, 16, 20]
    tips = [4, 8, 12, 16, 20]
    for i in range(len(tips)):
        for j in range(i + 1, len(tips)):
            feats.append(round(dist2(pts[tips[i]], pts[tips[j]]) / palm, 6))

    # 4. 10D finger joint angles (PIP & DIP for 5 fingers) normalized to [0, 1] via / 180.0
    triplets = [
        (1, 2, 3), (2, 3, 4),
        (5, 6, 7), (6, 7, 8),
        (9, 10, 11), (10, 11, 12),
        (13, 14, 15), (14, 15, 16),
        (17, 18, 19), (18, 19, 20),
    ]
    for a, b, c in triplets:
        feats.append(round(angle_deg(pts[a], pts[b], pts[c]) / 180.0, 6))

    assert len(feats) == 82, f"Expected 82D base features, got {len(feats)}"

    # 5. 12D R22B candidate features (S-970 fist-vs-pinch & OK-vs-MRP/FIVE separation)
    # (1) pinchRatio (4-8 / palm)
    feats.append(round(dist2(pts[4], pts[8]) / palm, 6))
    # (2) thumbTip-to-indexMCP (4-5 / palm)
    feats.append(round(dist2(pts[4], pts[5]) / palm, 6))
    # (3) thumbTip-to-indexPIP (4-6 / palm)
    feats.append(round(dist2(pts[4], pts[6]) / palm, 6))
    # (4) thumbTip-to-middleMCP (4-9 / palm)
    feats.append(round(dist2(pts[4], pts[9]) / palm, 6))
    # (5) indexTip-to-wrist / indexMCP-to-wrist
    idx_mcp_w = max(dist2(wrist, pts[5]), 1e-4)
    feats.append(round(dist2(wrist, pts[8]) / idx_mcp_w, 6))
    # (6..8) middle, ring, pinky tip-to-wrist / mcp-to-wrist
    for mcp, tip in ((9, 12), (13, 16), (17, 20)):
        feats.append(round(dist2(wrist, pts[tip]) / max(dist2(wrist, pts[mcp]), 1e-4), 6))
    # (9) thumb lateral separation (thumb tip distance from index-pinky palm line / palm)
    feats.append(round(dist2(pts[4], pts[17]) / palm, 6))
    # (10) index PIP angle / 180
    feats.append(round(angle_deg(pts[5], pts[6], pts[7]) / 180.0, 6))
    # (11) index MCP angle (0-5-6) / 180
    feats.append(round(angle_deg(pts[0], pts[5], pts[6]) / 180.0, 6))
    # (12) palm width ratio (5-17 / palm)
    feats.append(round(dist2(pts[5], pts[17]) / palm, 6))

    assert len(feats) == 94, f"Expected 94D total features, got {len(feats)}"
    return feats


def build_dataset(input_paths: list[Path], output_dir: Path, max_static_hz: float = 5.0) -> dict[str, Any]:
    min_dt_ms = 1000.0 / max(0.5, max_static_hz)
    static_rows: list[dict[str, Any]] = []
    transition_sequences: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    rejected_counts: dict[str, int] = collections.Counter()

    for path in input_paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        for sess in data.get("sessions") or []:
            sid = str((sess.get("meta") or {}).get("sessionId") or "unknown")
            frames = sorted(sess.get("frames") or [], key=lambda x: (str(x.get("trialId")), float(x.get("t", 0.0))))
            last_kept_t_by_step: dict[tuple[str, str], float] = {}

            for f in frames:
                ls = (f.get("labelSources") or {}).get("truth") or f.get("labelSource")
                if ls != "DATASET_GT":
                    rejected_counts["non_dataset_gt"] += 1
                    continue
                if f.get("labelProvenance") != "guided-capture-v1":
                    rejected_counts["wrong_provenance"] += 1
                    continue
                if f.get("truthMasked", False):
                    rejected_counts["truth_masked"] += 1
                    continue
                truth = str(f.get("truth") or "")
                if not truth or truth == "UNLABELLED":
                    rejected_counts["unlabelled"] += 1
                    continue

                tid = str(f.get("trialId") or "")
                step_id = str(f.get("captureStep") or "unknown")
                variation = str(f.get("variation") or "unknown")
                lighting = str(f.get("lighting") or "unknown")
                subject = str(f.get("subjectCode") or "P1")
                t_ms = float(f.get("t", 0.0))
                aspect = float(f.get("aspect") or (16 / 9))
                lm = f.get("lm")

                if truth.startswith("TRANSITION_"):
                    seq_key = f"{sid}:{tid}:{step_id}"
                    transition_sequences[seq_key].append(
                        {
                            "t": t_ms,
                            "truth": truth,
                            "subjectCode": subject,
                            "lighting": lighting,
                            "variation": variation,
                            "hasHand": isinstance(lm, list) and len(lm) == 21,
                            "features94d": extract_features_94d(lm, aspect) if isinstance(lm, list) and len(lm) == 21 else None,
                        }
                    )
                    continue

                if truth not in STATIC_CLASSES:
                    rejected_counts["unknown_class"] += 1
                    continue
                if truth != "NO_HAND" and (not isinstance(lm, list) or len(lm) != 21):
                    rejected_counts["missing_landmarks_for_hand_class"] += 1
                    continue

                # Subsample static frames to <= 5 Hz per (trialId, captureStep)
                key = (tid, step_id)
                prev_t = last_kept_t_by_step.get(key)
                if prev_t is not None and (t_ms - prev_t) < min_dt_ms:
                    rejected_counts["subsampled_over_5hz"] += 1
                    continue
                last_kept_t_by_step[key] = t_ms

                static_rows.append(
                    {
                        "sessionId": sid,
                        "trialId": tid,
                        "t": t_ms,
                        "truth": truth,
                        "captureStep": step_id,
                        "variation": variation,
                        "lighting": lighting,
                        "subjectCode": subject,
                        "features94d": extract_features_94d(lm, aspect) if isinstance(lm, list) and len(lm) == 21 else None,
                    }
                )

    subjects = sorted({r["subjectCode"] for r in static_rows})
    lightings = sorted({r["lighting"] for r in static_rows})
    class_counts = dict(sorted(collections.Counter(r["truth"] for r in static_rows).items()))

    # Deterministic splits
    splits: dict[str, Any] = {
        "variationHeldOut": {
            "valVariations": ["side", "edge"],
            "trainCount": sum(1 for r in static_rows if r["variation"] not in ("side", "edge")),
            "valCount": sum(1 for r in static_rows if r["variation"] in ("side", "edge")),
        },
        "lightingHeldOut": {
            "available": len(lightings) >= 2,
            "trainLighting": "B-lampu-depan-nyala",
            "valLighting": "A-lampu-depan-mati",
        },
        "personHeldOut": (
            {
                "available": True,
                "trainSubjects": ["P1"],
                "valSubjects": [s for s in subjects if s != "P1"],
            }
            if len(subjects) >= 2
            else "NOT_AVAILABLE"
        ),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    static_path = output_dir / "r22b_static_94d.jsonl"
    with static_path.open("w", encoding="utf-8") as fh:
        for row in static_rows:
            fh.write(json.dumps(row, separators=(",", ":")) + "\n")

    trans_path = output_dir / "r22b_transitions_seq.json"
    trans_path.write_text(json.dumps(transition_sequences, separators=(",", ":")), encoding="utf-8")

    manifest = {
        "schema": "r22b-guided-dataset-manifest/1",
        "featureDim": 94,
        "baseFeatureDim": 82,
        "candidateFeatureDim": 12,
        "maxStaticHz": max_static_hz,
        "subjects": subjects,
        "lightings": lightings,
        "staticCount": len(static_rows),
        "transitionSequenceCount": len(transition_sequences),
        "classCounts": class_counts,
        "rejectedCounts": dict(rejected_counts),
        "splits": splits,
        "files": {
            "static": {
                "path": static_path.name,
                "sha256": hashlib.sha256(static_path.read_bytes()).hexdigest(),
            },
            "transitions": {
                "path": trans_path.name,
                "sha256": hashlib.sha256(trans_path.read_bytes()).hexdigest(),
            },
        },
    }
    (output_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main() -> int:
    ap = argparse.ArgumentParser(description="Build frozen 94D R22B dataset from ?capture=1 exports")
    ap.add_argument("--input", nargs="+", type=Path, required=True, help="Guided-capture JSON export(s)")
    ap.add_argument("--output-dir", type=Path, required=True, help="Destination directory for frozen dataset")
    ap.add_argument("--max-static-hz", type=float, default=5.0, help="Max sampling rate for static segments (default 5 Hz)")
    args = ap.parse_args()
    manifest = build_dataset(args.input, args.output_dir, args.max_static_hz)
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
