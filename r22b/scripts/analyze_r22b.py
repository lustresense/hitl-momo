#!/usr/bin/env python3
"""R22B B3 Reproducible Analyzer for NUI Lab Benchmark Exports (v1, v2, v2.1).

Upgrades R22 analyzer with R22B requirements:
  - `--session <sessionId>` filter (never silently assumes a single session).
  - Time-based active-window miss rate (in addition to frame-based).
  - Lost episode extraction (> 500 ms and > 1,000 ms) reporting duration, last pose,
    last palm/index position, `clippedPct`, `handRoiLumaP50`, and `lastRoiLumaP50`.
  - Blocked onset breakdown by reason (`PINCH_ONSET_BLOCKED`), confirmed onsets,
    and bridged releases (`PINCH_RELEASE_BRIDGED`).
  - Undo/Redo success rate (`changed == true`) & false strokes during undo windows.
  - K4 v1.1 class & pinch-variant accuracy strictly against `labelSource == "DATASET_GT"`
    excluding `truthMasked == true` (NEVER computes accuracy from RULE_DERIVED/MODEL_PREDICTION).

Usage:
  python3 analyze_r22b.py <export.json> [--session S-xxxx] [--json]
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return round(float(s[0]), 4)
    pos = (len(s) - 1) * q
    lo = int(pos)
    hi = min(len(s) - 1, lo + 1)
    return round(float(s[lo] + (s[hi] - s[lo]) * (pos - lo)), 4)


def extract_sessions_json_slice(raw_text: str) -> str | None:
    marker = '"sessions":'
    idx = raw_text.find(marker)
    if idx < 0:
        return None
    start = raw_text.find("[", idx + len(marker))
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for pos in range(start, len(raw_text)):
        ch = raw_text[pos]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return raw_text[start : pos + 1]
    return None


def verify_checksum(raw_text: str, data: dict[str, Any]) -> dict[str, Any]:
    schema = data.get("schemaVersion") or data.get("schema")
    if schema == "nui-lab-bench-export/1":
        return {"checked": False, "schema": schema, "status": "v1-no-checksum"}
    expected = data.get("contentSha256")
    if not isinstance(expected, str):
        return {"checked": True, "ok": False, "schema": schema, "reason": "missing-contentSha256"}
    slice_text = extract_sessions_json_slice(raw_text)
    if slice_text is None:
        return {"checked": True, "ok": False, "schema": schema, "reason": "missing-sessions-slice"}
    actual = hashlib.sha256(slice_text.encode("utf-8")).hexdigest()
    return {"checked": True, "ok": actual == expected, "schema": schema, "actual": actual, "expected": expected}


def frame_has_hand(f: dict[str, Any]) -> bool:
    if f.get("hands") is not None:
        return int(f["hands"]) > 0
    return f.get("det") == "HAND"


def palm_pos(f: dict[str, Any]) -> list[float] | None:
    lm = f.get("lm")
    if not isinstance(lm, list) or len(lm) < 10:
        return None
    p0 = lm[0]
    p9 = lm[9]
    if isinstance(p0, list) and isinstance(p9, list) and len(p0) >= 2 and len(p9) >= 2:
        return [round((float(p0[0]) + float(p9[0])) * 0.5, 4), round((float(p0[1]) + float(p9[1])) * 0.5, 4)]
    return None


def analyze_trial(
    trial_meta: dict[str, Any],
    frames: list[dict[str, Any]],
    events: list[dict[str, Any]],
) -> dict[str, Any]:
    frames = sorted(frames, key=lambda x: (float(x.get("t", 0.0)), int(x.get("fid", 0))))
    n = len(frames)
    hand_idx = [i for i, f in enumerate(frames) if frame_has_hand(f)]
    raw_miss = sum(1 for f in frames if not frame_has_hand(f))

    # Active window: first hand frame .. last hand frame
    active_frames: list[dict[str, Any]] = []
    active_miss_frames = 0
    active_total_ms = 0.0
    active_miss_ms = 0.0
    lost_episodes: list[dict[str, Any]] = []

    if hand_idx:
        lo, hi = hand_idx[0], hand_idx[-1]
        active_frames = frames[lo : hi + 1]
        for idx, f in enumerate(active_frames):
            is_miss = not frame_has_hand(f)
            if is_miss:
                active_miss_frames += 1
            if idx > 0:
                dt = max(0.0, float(f.get("t", 0.0)) - float(active_frames[idx - 1].get("t", 0.0)))
                active_total_ms += dt
                if is_miss:
                    active_miss_ms += dt

        # Extract continuous lost episodes > 500 ms
        ep_start_idx: int | None = None
        last_seen_frame: dict[str, Any] | None = None
        for idx, f in enumerate(active_frames):
            if frame_has_hand(f):
                if ep_start_idx is not None:
                    start_t = float(active_frames[ep_start_idx].get("t", 0.0))
                    end_t = float(f.get("t", 0.0))
                    dur_ms = round(end_t - start_t, 1)
                    if dur_ms > 500.0:
                        ep_slice = active_frames[ep_start_idx:idx]
                        clipped_vals = [
                            float(x["clippedPct"])
                            for x in ep_slice
                            if x.get("clippedPct") is not None
                        ]
                        last_roi_vals = [
                            float(x["lastRoiLumaP50"])
                            for x in ep_slice
                            if x.get("lastRoiLumaP50") is not None
                        ]
                        lost_episodes.append(
                            {
                                "startT": start_t,
                                "endT": end_t,
                                "durationMs": dur_ms,
                                "gt1s": dur_ms > 1000.0,
                                "missFrames": len(ep_slice),
                                "lastPose": (last_seen_frame or {}).get("rawPose"),
                                "lastPos": palm_pos(last_seen_frame) if last_seen_frame else None,
                                "lastHandRoiLumaP50": (last_seen_frame or {}).get("handRoiLumaP50"),
                                "clippedPctMean": round(sum(clipped_vals) / len(clipped_vals), 2) if clipped_vals else None,
                                "lastRoiLumaP50Mean": round(sum(last_roi_vals) / len(last_roi_vals), 4) if last_roi_vals else None,
                            }
                        )
                    ep_start_idx = None
                last_seen_frame = f
            else:
                if ep_start_idx is None:
                    ep_start_idx = idx

    # Event telemetry breakdown
    blocked_by_reason: dict[str, int] = collections.Counter()
    onset_confirmed = 0
    release_bridged = 0
    stroke_starts = 0
    undo_total = 0
    undo_changed = 0
    redo_total = 0
    redo_changed = 0
    armed_count = 0
    three_actions = 0

    for ev in events:
        et = ev.get("type")
        det = ev.get("data") or ev.get("detail") or {}
        if et == "PINCH_ONSET_BLOCKED":
            blocked_by_reason[str(det.get("reason") or "unknown")] += 1
        elif et == "PINCH_ONSET_CONFIRMED":
            onset_confirmed += 1
        elif et == "PINCH_RELEASE_BRIDGED":
            release_bridged += 1
        elif et == "STROKE_START":
            stroke_starts += 1
        elif et == "UNDO_REDO_ARMED":
            armed_count += 1
        elif et == "UNDO":
            undo_total += 1
            if det.get("changed") is True:
                undo_changed += 1
        elif et == "REDO":
            redo_total += 1
            if det.get("changed") is True:
                redo_changed += 1
        elif et == "THREE_ACTION":
            three_actions += 1

    # False fist pinch count (frames where raw pinchRatio <= 0.30 was blocked by G1' gate)
    g1_blocked_frames = 0
    for f in frames:
        pg = f.get("pinchGate")
        pr = f.get("pinchRatio")
        if (
            isinstance(pg, dict)
            and pg.get("passed") is False
            and isinstance(pr, (int, float))
            and float(pr) <= 0.30
        ):
            g1_blocked_frames += 1

    # Timings
    mp_ms = [float(f["timing"]["mpMs"]) for f in frames if isinstance(f.get("timing"), dict) and f["timing"].get("mpMs") is not None]
    pipe_ms = [float(f["timing"]["pipelineMs"]) for f in frames if isinstance(f.get("timing"), dict) and f["timing"].get("pipelineMs") is not None]
    clipped = [float(f["clippedPct"]) for f in frames if f.get("clippedPct") is not None]
    hand_roi_p50 = [float(f["handRoiLumaP50"]) for f in frames if f.get("handRoiLumaP50") is not None]

    # Strict independent DATASET_GT evaluation (excludes truthMasked == True)
    gt_frames = [
        f
        for f in frames
        if (f.get("labelSources") or {}).get("truth") == "DATASET_GT"
        and not f.get("truthMasked", False)
        and f.get("truth") not in (None, "", "UNLABELLED")
    ]
    gt_report: dict[str, Any]
    if gt_frames:
        cls_total = 0
        cls_ok = 0
        per_class: dict[str, dict[str, int]] = collections.defaultdict(lambda: {"total": 0, "correct": 0})
        variant_total = 0
        variant_ok = 0
        for f in gt_frames:
            truth = str(f["truth"])
            if truth.startswith("TRANSITION_"):
                continue
            hs = f.get("handState") or {}
            if not frame_has_hand(f):
                pred_cls = "NO_HAND"
            else:
                pred_cls = str(hs.get("derivedClass") or f.get("posePred") or "OTHER")
            cls_total += 1
            per_class[truth]["total"] += 1
            if pred_cls == truth:
                cls_ok += 1
                per_class[truth]["correct"] += 1
            if truth in ("PINCH_CLOSED", "PINCH_OK"):
                variant_total += 1
                expected_var = "CLOSED" if truth == "PINCH_CLOSED" else "OK"
                if hs.get("variant") == expected_var:
                    variant_ok += 1
        gt_report = {
            "independentGroundTruthAvailable": True,
            "unmaskedGtFrames": len(gt_frames),
            "staticClassEvaluated": cls_total,
            "staticClassAccuracy": round(cls_ok / cls_total, 4) if cls_total else None,
            "pinchVariantEvaluated": variant_total,
            "pinchVariantAccuracy": round(variant_ok / variant_total, 4) if variant_total else None,
            "perClass": {
                k: {
                    "total": v["total"],
                    "correct": v["correct"],
                    "recall": round(v["correct"] / v["total"], 4) if v["total"] else None,
                }
                for k, v in sorted(per_class.items())
            },
        }
    else:
        gt_report = {
            "independentGroundTruthAvailable": False,
            "note": "No unmasked DATASET_GT frames in trial; accuracy intentionally NOT_AVAILABLE (A06/B06/E05).",
        }

    return {
        "trialId": trial_meta.get("trialId"),
        "route": trial_meta.get("route"),
        "presetId": trial_meta.get("presetId", "default-any-pinch"),
        "reacquirePinchPolicy": trial_meta.get("reacquirePinchPolicy", "require-release"),
        "detectorConfig": trial_meta.get("detectorConfig"),
        "endReason": trial_meta.get("endReason"),
        "frames": n,
        "rawNoHandRate": round(raw_miss / n, 4) if n else None,
        "activeWindow": {
            "frames": len(active_frames),
            "missFrames": active_miss_frames,
            "missRateByFrames": round(active_miss_frames / len(active_frames), 4) if active_frames else None,
            "totalMs": round(active_total_ms, 1),
            "missMs": round(active_miss_ms, 1),
            "missRateByTime": round(active_miss_ms / active_total_ms, 4) if active_total_ms > 0 else None,
        },
        "lostEpisodesGt500msCount": len(lost_episodes),
        "lostEpisodesGt1sCount": sum(1 for e in lost_episodes if e["gt1s"]),
        "lostEpisodes": lost_episodes,
        "events": {
            "strokeStarts": stroke_starts,
            "onsetConfirmed": onset_confirmed,
            "onsetBlockedByReason": dict(blocked_by_reason),
            "releaseBridged": release_bridged,
            "g1BlockedFrames": g1_blocked_frames,
            "undoRedoArmed": armed_count,
            "undoTotal": undo_total,
            "undoChanged": undo_changed,
            "undoSuccessRate": round(undo_changed / undo_total, 4) if undo_total else None,
            "redoTotal": redo_total,
            "redoChanged": redo_changed,
            "redoSuccessRate": round(redo_changed / redo_total, 4) if redo_total else None,
            "threeActions": three_actions,
        },
        "timing": {
            "mpMsP50": pct(mp_ms, 0.5),
            "mpMsP95": pct(mp_ms, 0.95),
            "pipelineMsP50": pct(pipe_ms, 0.5),
            "pipelineMsP95": pct(pipe_ms, 0.95),
        },
        "lightingProxies": {
            "clippedPctP50": pct(clipped, 0.5),
            "clippedPctP95": pct(clipped, 0.95),
            "handRoiLumaP50Median": pct(hand_roi_p50, 0.5),
            "backlightCandidatePct": round(
                100.0 * sum(1 for f in frames if f.get("backlightCandidate")) / n, 2
            )
            if n
            else None,
        },
        "groundTruthEvaluation": gt_report,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="R22B benchmark export analyzer (v1/v2/v2.1)")
    ap.add_argument("export_path", type=Path, help="Path to nui-lab-bench-export JSON file")
    ap.add_argument("--session", default=None, help="Filter to a specific sessionId (e.g. S-970f4cb0)")
    ap.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = ap.parse_args()

    raw_text = args.export_path.read_text(encoding="utf-8")
    data = json.loads(raw_text)
    checksum = verify_checksum(raw_text, data)

    sessions = data.get("sessions") or []
    if args.session:
        sessions = [s for s in sessions if (s.get("meta") or {}).get("sessionId") == args.session]
        if not sessions:
            print(f"ERROR: session {args.session!r} not found in {args.export_path}", file=sys.stderr)
            return 2

    out_sessions = []
    for s in sessions:
        meta = s.get("meta") or {}
        frames = s.get("frames") or []
        events = s.get("events") or []
        trials = s.get("trials") or []
        by_trial_f: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
        by_trial_e: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
        for f in frames:
            by_trial_f[str(f.get("trialId"))].append(f)
        for e in events:
            by_trial_e[str(e.get("trialId"))].append(e)

        trial_reports = []
        for t in trials:
            tm = t.get("meta") or {}
            tid = str(tm.get("trialId"))
            trial_reports.append(analyze_trial(tm, by_trial_f.get(tid, []), by_trial_e.get(tid, [])))
        out_sessions.append(
            {
                "sessionId": meta.get("sessionId"),
                "status": meta.get("status"),
                "app": meta.get("app"),
                "trialCount": len(trial_reports),
                "trials": trial_reports,
            }
        )

    result = {
        "file": str(args.export_path),
        "schema": data.get("schema"),
        "schemaVersion": data.get("schemaVersion") or data.get("schema"),
        "checksum": checksum,
        "sessionsAnalyzed": len(out_sessions),
        "sessions": out_sessions,
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"File: {result['file']} | Schema: {result['schemaVersion']} | Checksum OK: {checksum.get('ok', checksum.get('status'))}")
        for s in out_sessions:
            print(f"\nSession {s['sessionId']} ({s['status']}, {s['trialCount']} trials)")
            for tr in s["trials"]:
                aw = tr["activeWindow"]
                ev = tr["events"]
                print(
                    f"  - {tr['trialId']} [{tr['route']}] preset={tr['presetId']} frames={tr['frames']} "
                    f"activeMiss(f)={aw['missRateByFrames']} activeMiss(t)={aw['missRateByTime']} "
                    f"lost>500ms={tr['lostEpisodesGt500msCount']} lost>1s={tr['lostEpisodesGt1sCount']}"
                )
                print(
                    f"    strokes={ev['strokeStarts']} confirmed={ev['onsetConfirmed']} "
                    f"bridged={ev['releaseBridged']} blocked={ev['onsetBlockedByReason']} "
                    f"undo={ev['undoChanged']}/{ev['undoTotal']} redo={ev['redoChanged']}/{ev['redoTotal']}"
                )
                print(
                    f"    mpMs p50/p95={tr['timing']['mpMsP50']}/{tr['timing']['mpMsP95']} | "
                    f"backlight%={tr['lightingProxies']['backlightCandidatePct']} | "
                    f"GT={tr['groundTruthEvaluation']['independentGroundTruthAvailable']}"
                )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
