#!/usr/bin/env python3
"""Reproducible analysis of a NUI Lab benchmark export (nui-lab-bench-export/1).

Usage:  python3 analyze_nui_bench.py nui-lab-benchmark-XXXX.json

Prints, per trial:
  - raw missing-hand rate vs. "active window" rate (between first and last frame with a hand)
  - miss streak breakdown (<=3 frames = tracking flicker, 4-15, >15 = long absence or real failure)
  - real camera FPS (perf.videoFps) vs. processed detect Hz  -> duplicate-frame inference
  - luma distribution (is this session actually low-light?)
  - canvas: why pinch frames did not draw, what ended strokes, miss length behind each break
No ground truth exists in these files; nothing here is an accuracy number.
"""
import collections
import json
import sys


def pct(a, q):
    a = sorted(a)
    return a[min(len(a) - 1, int(q * len(a)))] if a else None


def streaks(frames):
    out, c = [], 0
    for f in frames:
        if f["hands"] == 0:
            c += 1
        elif c:
            out.append(c)
            c = 0
    if c:
        out.append(c)
    return out


def main(path):
    d = json.load(open(path))
    s = d["sessions"][0]
    by = collections.defaultdict(list)
    for f in s["frames"]:
        by[f["trialId"]].append(f)
    perf = collections.defaultdict(list)
    for p in s["perf"]:
        perf[p["trialId"]].append(p)
    meta = {t["meta"]["trialId"]: t["meta"] for t in s["trials"]}

    for tid, F in by.items():
        m = meta.get(tid, {})
        eng = m.get("engine", {})
        print(f"\n===== {tid}  route={m.get('route')} engine={eng.get('engineId')} preprocess={eng.get('preprocess')}")
        raw_miss = sum(1 for f in F if f["hands"] == 0)
        idx = [i for i, f in enumerate(F) if f["hands"] > 0]
        print(f"raw missing-hand: {raw_miss}/{len(F)} = {raw_miss/len(F):.1%}")
        if idx:
            core = F[idx[0]: idx[-1] + 1]
            st = streaks(core)
            miss = sum(st)
            dur = (core[-1]["t"] - core[0]["t"]) / 1000
            print(f"active window: {len(core)} frames / {dur:.0f}s, miss {miss} = {miss/len(core):.1%}")
            print(f"  flicker <=3 frames: {sum(x for x in st if x <= 3)} ({sum(x for x in st if x <= 3)/len(core):.1%})"
                  f" | 4-15: {sum(x for x in st if 3 < x <= 15)} | >15: {sum(x for x in st if x > 15)}"
                  f" in {sum(1 for x in st if x > 15)} streak(s)")
            print(f"  excluded lead-in {idx[0]} frames, tail {len(F)-1-idx[-1]} frames (hand not yet shown / user left camera)")
        dt = [b["t"] - a["t"] for a, b in zip(F, F[1:])]
        P = perf.get(tid, [])
        vf = [p["videoFps"] for p in P if p["videoFps"] > 0]
        dh = [p["detectHz"] for p in P if p["detectHz"] > 0]
        print(f"camera videoFps p50={pct(vf,.5)}  processed detectHz p50={pct(dh,.5)}  frame dt p50={pct(dt,.5)}ms")
        lm = [f["luma"]["mean"] for f in F if f.get("luma") and f["luma"].get("mean") is not None]
        lc = [f["luma"]["center"] for f in F if f.get("luma") and f["luma"].get("center") is not None]
        print(f"luma mean p5/p50/p95={pct(lm,.05)}/{pct(lm,.5)}/{pct(lm,.95)}  center p50={pct(lc,.5)}"
              f"  passes={dict(collections.Counter(f['luma']['pass'] for f in F if f.get('luma')))}")

        if m.get("route") == "canvas":
            pinch = [f for f in F if f["stablePose"] == "pinch"]
            print(f"canvas: stable-pinch frames {len(pinch)}; reject reason on those frames:")
            for k, v in collections.Counter(f["reject"] for f in pinch).most_common():
                print(f"    {v:4d}  {k}")
            print(f"  r19State during canvas: {dict(collections.Counter(f['r19State'] for f in F))}")
            E = [e for e in s["events"] if (e.get("trialId") or "") == tid]
            ends = [e for e in E if e["type"] == "STROKE_END"]
            print(f"  STROKE_END reasons: {dict(collections.Counter(e['data'].get('endReason') for e in ends))}")
            for e in ends:
                if e["data"].get("endReason") != "detector-miss":
                    continue
                i = next(k for k, f in enumerate(F) if f["t"] >= e["t"] - 1)
                k = i
                while k < len(F) and F[k]["hands"] == 0:
                    k += 1
                nxt = F[k] if k < len(F) else None
                ms = (nxt["t"] - F[i]["t"]) if nxt else None
                print(f"    break stroke {e['data']['strokeId']}: miss {k-i} frames ({ms} ms); next frame reject = "
                      f"{nxt['reject'] if nxt else None}")
            pon = [e["t"] for e in E if e["type"] == "PINCH_ON"]
            sst = [e["t"] for e in E if e["type"] == "STROKE_START"]
            print(f"  PINCH_ON {len(pon)}, STROKE_START {len(sst)}, PINCH_ON with no stroke within 500 ms: "
                  f"{sum(1 for t in pon if not any(0 <= x - t <= 500 for x in sst))}")
            print(f"  UNDO via: {dict(collections.Counter((e.get('data') or {}).get('via') for e in E if e['type']=='UNDO'))}")


if __name__ == "__main__":
    main(sys.argv[1])
