#!/usr/bin/env python3
"""Reproducible R22 analyzer for NUI Lab benchmark exports (v1 & v2).

Supports both `nui-lab-bench-export/1` (R20 baseline telemetry) and
`nui-lab-bench-export/2` (R22 Contract K8 telemetry with frame freshness,
quality proxies, action resolver events, labelSource, and SHA-256 checksum).

Strict A06 / B06 / E05 rule:
  - Never computes accuracy, precision, recall, confusion matrix, or
    `falsePressFrames: 0` from unlabelled user telemetry or model predictions.
  - When independent dataset GT is absent (`independentGroundTruthAvailable = False`),
    reports action-level invariants, active-window vs raw miss separation, streak
    breakdowns (1-3 flicker, 4-15 short loss, >15 long absence), and sensor-derived
    quality proxies (`labelSource: RULE_DERIVED`) only.

Usage:
  python3 analyze_nui_bench_r22.py <export.json> [--json]
  python3 analyze_nui_bench_r22.py <export_a.json> --compare <export_b.json>
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
    idx = min(len(s) - 1, max(0, int(q * (len(s) - 1) if len(s) > 1 else 0)))
    if len(s) <= 1:
        return round(float(s[0]), 4)
    pos = (len(s) - 1) * q
    lo = int(pos)
    hi = min(len(s) - 1, lo + 1)
    v = s[lo] + (s[hi] - s[lo]) * (pos - lo)
    return round(float(v), 4)


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


def verify_v2_checksum(raw_text: str, data: dict[str, Any]) -> dict[str, Any]:
    schema = data.get("schema") or data.get("schemaVersion")
    if schema == "nui-lab-bench-export/1":
        return {"checked": False, "schema": schema, "status": "v1-no-checksum"}
    expected = data.get("contentSha256")
    if not isinstance(expected, str):
        return {"checked": True, "ok": False, "schema": schema, "reason": "missing-contentSha256"}
    slice_text = extract_sessions_json_slice(raw_text)
    if slice_text is None:
        return {"checked": True, "ok": False, "schema": schema, "expected": expected, "reason": "missing-sessions-slice"}
    actual = hashlib.sha256(slice_text.encode("utf-8")).hexdigest()
    return {
        "checked": True,
        "ok": actual == expected,
        "schema": schema,
        "expected": expected,
        "actual": actual,
    }


def frame_has_hand(f: dict[str, Any]) -> bool:
    if "hands" in f and f["hands"] is not None:
        return int(f["hands"]) > 0
    return f.get("det") == "HAND"


def compute_streaks(frames: list[dict[str, Any]]) -> list[int]:
    out: list[int] = []
    cur = 0
    for f in frames:
        if not frame_has_hand(f):
            cur += 1
        elif cur > 0:
            out.append(cur)
            cur = 0
    if cur > 0:
        out.append(cur)
    return out


def analyze_trial(
    tid: str,
    meta: dict[str, Any],
    frames: list[dict[str, Any]],
    events: list[dict[str, Any]],
    perf: list[dict[str, Any]],
    is_v2: bool,
) -> dict[str, Any]:
    eng = meta.get("engine", {})
    n_frames = len(frames)
    raw_miss = sum(1 for f in frames if not frame_has_hand(f))
    raw_no_hand_rate = round(raw_miss / n_frames, 4) if n_frames else None

    hand_indices = [i for i, f in enumerate(frames) if frame_has_hand(f)]
    if hand_indices:
        lead_in = hand_indices[0]
        tail = n_frames - 1 - hand_indices[-1]
        core = frames[hand_indices[0] : hand_indices[-1] + 1]
        st = compute_streaks(core)
        aw_miss = sum(st)
        aw_dur_ms = max(0.0, float(core[-1]["t"] - core[0]["t"]))
        flicker_streaks = sum(1 for x in st if x <= 3)
        flicker_frames = sum(x for x in st if x <= 3)
        short_streaks = sum(1 for x in st if 3 < x <= 15)
        short_frames = sum(x for x in st if 3 < x <= 15)
        long_streaks = sum(1 for x in st if x > 15)
        long_frames = sum(x for x in st if x > 15)
        aw_miss_rate = round(aw_miss / len(core), 4)
    else:
        lead_in = n_frames
        tail = 0
        core = []
        aw_miss = 0
        aw_dur_ms = 0.0
        flicker_streaks = flicker_frames = 0
        short_streaks = short_frames = 0
        long_streaks = long_frames = 0
        aw_miss_rate = None

    # Missing breakdown (B09/E05)
    hidden_frames = sum(1 for f in frames if f.get("trackingState") == "HIDDEN" or f.get("missReason") == "tab-hidden")
    bystander_ambiguous_frames = sum(
        1
        for f in frames
        if f.get("trackingState") == "AMBIGUOUS_HOLD"
        or f.get("missReason") == "ambiguous-two-hands"
        or f.get("lock") == "ambiguous"
        or ((not frame_has_hand(f)) and (f.get("hands") or 0) >= 2)
    )
    owner_reject_frames = sum(
        1 for f in frames if f.get("missReason") in ("owner-jump-reject", "owner-size-reject")
    )
    miss_reasons = collections.Counter(
        (f.get("missReason") or ("tab-hidden" if f.get("trackingState") == "HIDDEN" else "no-hand"))
        for f in frames
        if not frame_has_hand(f)
    )
    hidden_dur_ms = sum(
        float((e.get("data") or {}).get("hiddenDurationMs") or 0)
        for e in events
        if e.get("type") == "VISIBILITY_VISIBLE"
    )

    # Frame pacing & setOptions
    dt = [float(b["t"] - a["t"]) for a, b in zip(frames, frames[1:]) if b.get("t") is not None and a.get("t") is not None]
    uc_fps = [float(f["uniqueCaptureFps"]) for f in frames if isinstance(f.get("uniqueCaptureFps"), (int, float)) and f["uniqueCaptureFps"] > 0]
    if not uc_fps:
        uc_fps = [float(p["videoFps"]) for p in perf if isinstance(p.get("videoFps"), (int, float)) and p["videoFps"] > 0]
    dh = [float(p["detectHz"]) for p in perf if isinstance(p.get("detectHz"), (int, float)) and p["detectHz"] > 0]
    ui_fps = [float(p["uiFps"]) for p in perf if isinstance(p.get("uiFps"), (int, float)) and p["uiFps"] > 0]
    frame_age = [float(f["frameAgeMs"]) for f in frames if isinstance(f.get("frameAgeMs"), (int, float))]
    dup_skipped = sum(int(f.get("framesSkippedDuplicate") or 0) for f in frames) if is_v2 else None
    busy_dropped = sum(int(f.get("droppedSincePrev") or 0) for f in frames)
    init_set_options = max([int(f.get("initSetOptionsCalls") or 0) for f in frames] + [0])
    runtime_set_options = sum(int(f.get("runtimeSetOptionsCalls") or 0) for f in frames)
    for p in perf:
        if isinstance(p.get("runtimeSetOptionsCalls"), int) and p["runtimeSetOptionsCalls"] > runtime_set_options:
            runtime_set_options = p["runtimeSetOptionsCalls"]

    # Luma & quality proxies (RULE_DERIVED, never factual room measurements)
    lm_mean = [float(f["luma"]["mean"]) for f in frames if f.get("luma") and f["luma"].get("mean") is not None]
    lm_center = [float(f["luma"]["center"]) for f in frames if f.get("luma") and f["luma"].get("center") is not None]
    lm_p10 = [float(f["lumaP10"]) for f in frames if isinstance(f.get("lumaP10"), (int, float))]
    lm_p50 = [float(f["lumaP50"]) for f in frames if isinstance(f.get("lumaP50"), (int, float))]
    lm_p95 = [float(f["lumaP95"]) for f in frames if isinstance(f.get("lumaP95"), (int, float))]
    nw_hand = [float(f["nearWhiteHandPct"]) for f in frames if frame_has_hand(f) and isinstance(f.get("nearWhiteHandPct"), (int, float))]
    blur_vals = [float(f["blurProxy"]) for f in frames if isinstance(f.get("blurProxy"), (int, float))]
    noise_vals = [float(f["noiseProxy"]) for f in frames if isinstance(f.get("noiseProxy"), (int, float))]
    passes = dict(collections.Counter(f.get("preprocessPass") or (f.get("luma") or {}).get("pass") or "—" for f in frames))
    auto_tags = sorted({tag for f in frames for tag in (f.get("captureQualityTags") or [])})

    # Ground-truth audit (A06 / B06 / E05): strictly reject self-GT
    dataset_gt_frames = sum(
        1
        for f in frames
        if (f.get("labelSources") or {}).get("truth") == "DATASET_GT"
    )
    independent_gt_available = dataset_gt_frames > 0

    label_source_counts = dict(collections.Counter(f.get("labelSource") or "UNKNOWN" for f in frames))
    no_hand_actions = sum(
        1
        for f in frames
        if (not frame_has_hand(f))
        and (
            (f.get("action") not in (None, "none"))
            or f.get("vkeyEvent") in ("KEYDOWN", "HELD")
        )
    )
    pistol_rejects = (
        sum(
            1
            for f in frames
            if f.get("reject") in ("Mode pistol aktif: tinta dinonaktifkan", "Cubit ditolak gate R19")
        )
        if meta.get("route") == "canvas"
        else 0
    )
    lock_validating_frames = sum(
        1 for f in frames if frame_has_hand(f) and f.get("det") == "DETECTOR_MISS"
    )

    out: dict[str, Any] = {
        "trialId": tid,
        "route": meta.get("route"),
        "endReason": meta.get("endReason"),
        "engineId": eng.get("engineId"),
        "actualModelId": eng.get("actualModelId") or eng.get("engineId"),
        "modelSha256": eng.get("modelSha256"),
        "modelHashVerified": eng.get("modelHashVerified"),
        "preprocess": eng.get("preprocess"),
        "independentGroundTruthAvailable": independent_gt_available,
        "frames": n_frames,
        "rawNoHandFrames": raw_miss,
        "rawNoHandRate": raw_no_hand_rate,
        "activeWindow": {
            "frames": len(core),
            "durationSec": round(aw_dur_ms / 1000.0, 2),
            "missFrames": aw_miss,
            "activeWindowMissRate": aw_miss_rate,
            "leadInExcludedFrames": lead_in,
            "tailExcludedFrames": tail,
            "flickerStreaks_1_3": flicker_streaks,
            "flickerFrames_1_3": flicker_frames,
            "shortLossStreaks_4_15": short_streaks,
            "shortLossFrames_4_15": short_frames,
            "longAbsenceStreaks_gt15": long_streaks,
            "longAbsenceFrames_gt15": long_frames,
        },
        "missingBreakdown": {
            "hiddenDurationMs": round(hidden_dur_ms, 1),
            "hiddenFrames": hidden_frames,
            "bystanderAmbiguousFrames": bystander_ambiguous_frames,
            "ownerRejectFrames": owner_reject_frames,
            "lockValidatingFrames": lock_validating_frames,
            "missReasons": dict(miss_reasons),
        },
        "pacing": {
            "uniqueCaptureFpsP50": pct(uc_fps, 0.5),
            "uniqueCaptureFpsP95": pct(uc_fps, 0.95),
            "detectHzP50": pct(dh, 0.5),
            "detectHzP95": pct(dh, 0.95),
            "uiFpsP50": pct(ui_fps, 0.5),
            "frameDtP50Ms": pct(dt, 0.5),
            "frameAgeP50Ms": pct(frame_age, 0.5),
            "frameAgeP95Ms": pct(frame_age, 0.95),
            "duplicateFrameSkippedCount": dup_skipped,
            "framesDroppedBusy": busy_dropped,
            "initSetOptionsCalls": init_set_options,
            "runtimeSetOptionsCalls": runtime_set_options,
        },
        "qualityProxies": {
            "labelSource": "RULE_DERIVED",
            "note": "Post-AE camera sensor values, NOT ground-truth room lux",
            "lumaMeanP5": pct(lm_mean, 0.05),
            "lumaMeanP50": pct(lm_mean, 0.5),
            "lumaMeanP95": pct(lm_mean, 0.95),
            "lumaCenterP50": pct(lm_center, 0.5),
            "lumaP10P50": pct(lm_p10, 0.5),
            "lumaP50P50": pct(lm_p50, 0.5),
            "lumaP95P50": pct(lm_p95, 0.5),
            "nearWhiteHandPctP50": pct(nw_hand, 0.5),
            "blurProxyP50": pct(blur_vals, 0.5),
            "noiseProxyP50": pct(noise_vals, 0.5),
            "passes": passes,
            "autoConditionTags": auto_tags or meta.get("autoConditionTags") or [],
        },
        "actionInvariants": {
            "noHandActionsCount": no_hand_actions,
            "pistolRejectsOnCanvas": pistol_rejects,
            "runtimeSetOptionsCalls": runtime_set_options,
            "labelSourceCounts": label_source_counts,
        },
    }

    if meta.get("route") == "canvas":
        pinch_frames = [
            f
            for f in frames
            if frame_has_hand(f) and (f.get("stablePose") == "pinch" or f.get("posePred") == "PINCH")
        ]
        pinch_rejects = dict(collections.Counter(f.get("actionRejectedReason") or f.get("reject") for f in pinch_frames).most_common())
        r19_canvas = dict(collections.Counter(f.get("r19State") for f in frames))
        ends = [e for e in events if e.get("type") == "STROKE_END"]
        gaps = [e for e in events if e.get("type") == "STROKE_GAP"]
        resumes = [e for e in events if e.get("type") == "STROKE_RESUME"]
        end_reasons = dict(collections.Counter((e.get("data") or {}).get("endReason") for e in ends))
        gap_reasons = dict(collections.Counter((e.get("data") or {}).get("gapReason") for e in gaps + ends if (e.get("data") or {}).get("gapReason")))

        miss_breaks: list[dict[str, Any]] = []
        for e in ends:
            edata = e.get("data") or {}
            if edata.get("endReason") not in ("detector-miss", "detector-miss-timeout"):
                continue
            i = next((idx for idx, f in enumerate(frames) if f["t"] >= e["t"] - 1), len(frames))
            k = i
            while k < len(frames) and not frame_has_hand(frames[k]):
                k += 1
            nxt = frames[k] if k < len(frames) else None
            ms = (nxt["t"] - frames[i]["t"]) if (nxt and i < len(frames)) else None
            miss_breaks.append(
                {
                    "strokeId": edata.get("strokeId"),
                    "missFrames": k - i,
                    "missMs": round(float(ms), 1) if ms is not None else None,
                    "nextFrameReject": nxt.get("reject") if nxt else None,
                }
            )

        pon = [e["t"] for e in events if e.get("type") == "PINCH_ON"]
        sst = [e["t"] for e in events if e.get("type") == "STROKE_START"]
        pon_no_stroke = sum(1 for t in pon if not any(0 <= x - t <= 500 for x in sst))
        erases = [e for e in events if e.get("type") == "ERASE_START"]
        undos = dict(collections.Counter((e.get("data") or {}).get("via") for e in events if e.get("type") == "UNDO"))
        redos = dict(collections.Counter((e.get("data") or {}).get("via") for e in events if e.get("type") == "REDO"))
        act_rej = dict(collections.Counter((e.get("data") or {}).get("reason") for e in events if e.get("type") == "ACTION_REJECTED"))

        out["canvas"] = {
            "stablePinchFrames": len(pinch_frames),
            "pinchRejectReasons": pinch_rejects,
            "r19StateDuringCanvas": r19_canvas,
            "strokeStartCount": len(sst),
            "strokeEndCount": len(ends),
            "strokeEndReasons": end_reasons,
            "strokeGapEvents": len(gaps),
            "strokeResumeEvents": len(resumes),
            "strokeGapReasons": gap_reasons,
            "detectorMissBreaks": miss_breaks,
            "pinchOnCount": len(pon),
            "pinchOnWithoutStroke500ms": pon_no_stroke,
            "eraseStartCount": len(erases),
            "undoVia": undos,
            "redoVia": redos,
            "actionRejectedReasons": act_rej,
        }

    return out


def analyze_file(path: Path) -> dict[str, Any]:
    raw_text = path.read_text(encoding="utf-8")
    data = json.loads(raw_text)
    schema = data.get("schema") or data.get("schemaVersion")
    is_v2 = schema == "nui-lab-bench-export/2"
    checksum = verify_v2_checksum(raw_text, data)

    sessions_out: list[dict[str, Any]] = []
    for s in data.get("sessions", []):
        meta = s.get("meta", {})
        by_frames: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
        for f in s.get("frames", []):
            by_frames[f["trialId"]].append(f)
        by_events: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
        for e in s.get("events", []):
            if e.get("trialId"):
                by_events[e["trialId"]].append(e)
        by_perf: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
        for p in s.get("perf", []):
            if p.get("trialId"):
                by_perf[p["trialId"]].append(p)

        trial_metas = {t["meta"]["trialId"]: t["meta"] for t in s.get("trials", [])}
        # Preserve trial order (from trials metadata, then any frames-only fallback)
        ordered_tids = list(trial_metas.keys()) + [tid for tid in by_frames if tid not in trial_metas]

        trials_out = []
        for tid in ordered_tids:
            trials_out.append(
                analyze_trial(
                    tid,
                    trial_metas.get(tid, {"route": "unknown"}),
                    by_frames.get(tid, []),
                    by_events.get(tid, []),
                    by_perf.get(tid, []),
                    is_v2,
                )
            )
        sessions_out.append(
            {
                "sessionId": meta.get("sessionId"),
                "status": meta.get("status"),
                "statusReason": meta.get("statusReason"),
                "app": meta.get("app"),
                "droppedRecords": meta.get("droppedRecords"),
                "storageFailures": meta.get("storageFailures"),
                "trials": trials_out,
            }
        )

    return {
        "file": str(path),
        "schema": schema,
        "app": data.get("app"),
        "checksum": checksum,
        "sessions": sessions_out,
    }


def format_report(report: dict[str, Any]) -> str:
    lines: list[str] = []
    chk = report["checksum"]
    chk_str = f"OK ({chk.get('expected', '')[:12]}...)" if chk.get("ok") else chk.get("status") or f"FAIL ({chk.get('reason')})"
    lines.append(f"File: {report['file']}  schema={report['schema']}  checksum={chk_str}")
    for sess in report["sessions"]:
        lines.append(
            f"Session {sess['sessionId']} status={sess['status']} dropped={sess['droppedRecords']} app={sess.get('app')}"
        )
        for t in sess["trials"]:
            aw = t["activeWindow"]
            pc = t["pacing"]
            qp = t["qualityProxies"]
            mb = t["missingBreakdown"]
            lines.append(
                f"\n===== {t['trialId']}  route={t['route']} endReason={t['endReason']} "
                f"engine={t['actualModelId']} preprocess={t['preprocess']}"
            )
            lines.append(
                f"  independentGroundTruthAvailable={t['independentGroundTruthAvailable']} "
                "(NO accuracy/confusion/falsePress=0 emitted without dataset GT)"
            )
            raw_pct = f"{t['rawNoHandRate']:.1%}" if t["rawNoHandRate"] is not None else "n/a"
            aw_pct = f"{aw['activeWindowMissRate']:.1%}" if aw["activeWindowMissRate"] is not None else "n/a"
            lines.append(f"  raw no-hand: {t['rawNoHandFrames']}/{t['frames']} = {raw_pct}")
            lines.append(
                f"  active window: {aw['frames']} frames / {aw['durationSec']}s, miss {aw['missFrames']} = {aw_pct}"
            )
            lines.append(
                f"    flicker <=3f: {aw['flickerStreaks_1_3']} streak(s) ({aw['flickerFrames_1_3']}f)"
                f" | 4-15f: {aw['shortLossStreaks_4_15']} ({aw['shortLossFrames_4_15']}f)"
                f" | >15f: {aw['longAbsenceStreaks_gt15']} ({aw['longAbsenceFrames_gt15']}f)"
            )
            lines.append(
                f"    excluded lead-in {aw['leadInExcludedFrames']}f, tail {aw['tailExcludedFrames']}f | "
                f"hiddenDurationMs={mb['hiddenDurationMs']} hiddenFrames={mb['hiddenFrames']} "
                f"bystanderAmbiguous={mb['bystanderAmbiguousFrames']} ownerReject={mb['ownerRejectFrames']}"
            )
            lines.append(
                f"  pacing: uniqueCaptureFps p50={pc['uniqueCaptureFpsP50']}  detectHz p50={pc['detectHzP50']}  "
                f"uiFps p50={pc['uiFpsP50']}  dt p50={pc['frameDtP50Ms']}ms  "
                f"dupSkipped={pc['duplicateFrameSkippedCount']}  busyDrop={pc['framesDroppedBusy']}  "
                f"initSetOptions={pc['initSetOptionsCalls']} runtimeSetOptions={pc['runtimeSetOptionsCalls']}"
            )
            if pc["frameAgeP50Ms"] is not None:
                lines.append(f"    frameAge p50={pc['frameAgeP50Ms']}ms p95={pc['frameAgeP95Ms']}ms")
            lines.append(
                f"  quality (RULE_DERIVED post-AE): lumaMean p5/p50/p95={qp['lumaMeanP5']}/{qp['lumaMeanP50']}/{qp['lumaMeanP95']} "
                f"center p50={qp['lumaCenterP50']} nearWhiteHandPct p50={qp['nearWhiteHandPctP50']} "
                f"blurP50={qp['blurProxyP50']} noiseP50={qp['noiseProxyP50']} "
                f"passes={qp['passes']} tags={qp['autoConditionTags']}"
            )
            lines.append(f"  invariants: {t['actionInvariants']}")
            if "canvas" in t:
                cv = t["canvas"]
                lines.append(
                    f"  canvas: stable-pinch={cv['stablePinchFrames']} rejects={cv['pinchRejectReasons']}"
                )
                lines.append(f"    r19State during canvas: {cv['r19StateDuringCanvas']}")
                lines.append(
                    f"    strokes: start={cv['strokeStartCount']} end={cv['strokeEndCount']} "
                    f"endReasons={cv['strokeEndReasons']} gapEvents={cv['strokeGapEvents']} "
                    f"resumedAfterGrace={cv['strokeResumeEvents']} gapReasons={cv['strokeGapReasons']}"
                )
                for b in cv["detectorMissBreaks"]:
                    lines.append(
                        f"      break stroke {b['strokeId']}: miss {b['missFrames']}f ({b['missMs']} ms); "
                        f"nextFrameReject={b['nextFrameReject']}"
                    )
                lines.append(
                    f"    PINCH_ON={cv['pinchOnCount']} withoutStroke500ms={cv['pinchOnWithoutStroke500ms']} "
                    f"ERASE={cv['eraseStartCount']} UNDO={cv['undoVia']} REDO={cv['redoVia']} "
                    f"ACTION_REJECTED={cv['actionRejectedReasons']}"
                )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze R22/R20 NUI Lab benchmark JSON exports.")
    parser.add_argument("input_json", type=Path, help="Primary benchmark JSON export")
    parser.add_argument("--compare", type=Path, default=None, help="Optional second export to audit side-by-side")
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON instead of text")
    args = parser.parse_args()

    primary = analyze_file(args.input_json)
    if args.compare is not None:
        secondary = analyze_file(args.compare)
        if args.json:
            print(json.dumps({"primary": primary, "compare": secondary}, indent=2))
        else:
            print(format_report(primary))
            print("\n" + "=" * 72 + "\nCOMPARE TARGET:")
            print(format_report(secondary))
        return 0

    if args.json:
        print(json.dumps(primary, indent=2))
    else:
        print(format_report(primary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
