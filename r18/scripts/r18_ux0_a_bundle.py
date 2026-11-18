#!/usr/bin/env python3
"""R18-UX0-A: Static export bundle & transfer-size audit (raw, gzip-9, zstd).

Measures exact file sizes in `out/` produced by `next build` (output: "export"),
parses HTML/JS chunk references per route (Onboarding + Bab 1-3 + MediaPipe NUI),
and separates raw size (B-RAW) from compressed transfer estimates under gzip/zstd.
"""
import gzip
import json
import os
import re
import subprocess
import zipfile

OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/repo/frontend/implementation/out"
RESULTS_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results"


def compress_sizes(path: str) -> dict:
    raw = open(path, "rb").read()
    gz = gzip.compress(raw, compresslevel=9)
    zst = subprocess.check_output(["zstd", "-q", "-c", path])
    return {"raw": len(raw), "gzip": len(gz), "zstd": len(zst)}


def parse_html_assets(html_path: str) -> set[str]:
    txt = open(html_path, "r", encoding="utf-8", errors="replace").read()
    assets = set()
    # Match _next/static/... or /mediapipe/... or /models/... or /assets/...
    for m in re.findall(r'(?:src|href)=["\'](/[^"\']+)["\']', txt):
        assets.add(m.split("?")[0])
    for m in re.findall(r'/_next/static/[A-Za-z0-9_./-]+', txt):
        assets.add(m)
    return assets


def main() -> None:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    all_files = []
    for root, _, files in os.walk(OUT_DIR):
        for fn in files:
            full = os.path.join(root, fn)
            rel = "/" + os.path.relpath(full, OUT_DIR).replace(os.sep, "/")
            all_files.append((rel, full))

    by_rel = {rel: full for rel, full in all_files}
    ext_totals = {}
    file_stats = {}
    for rel, full in sorted(all_files):
        ext = os.path.splitext(rel)[1].lower() or "(noext)"
        sz = compress_sizes(full)
        file_stats[rel] = sz
        agg = ext_totals.setdefault(ext, {"count": 0, "raw": 0, "gzip": 0, "zstd": 0})
        agg["count"] += 1
        for k in ("raw", "gzip", "zstd"):
            agg[k] += sz[k]

    # Inspect .task archive internal structure
    task_rel = "/models/hand_landmarker.task"
    task_members = []
    if task_rel in by_rel:
        with zipfile.ZipFile(by_rel[task_rel]) as zf:
            for info in zf.infolist():
                task_members.append({
                    "name": info.filename,
                    "compress_type": info.compress_type,
                    "file_size": info.file_size,
                    "compress_size": info.compress_size,
                })

    # Journey routes: cover + onboarding + levels + chapters 1-3 + canvas 1-3
    journey_html = [
        "/index.html",
        "/onboarding/cam.html",
        "/onboarding/number.html",
        "/onboarding/card.html",
        "/levels.html",
        "/level1.html",
        "/level2.html",
        "/level3.html",
        "/canvas1.html",
        "/canvas2.html",
        "/canvas3.html",
    ]
    lab_html = [
        "/nui-lab.html",
        "/nui-lab/gesture.html",
        "/nui-lab/canvas.html",
        "/nui-lab/diagnostics.html",
    ]

    def collect_route_assets(html_list: list[str]) -> set[str]:
        refs = set()
        for h in html_list:
            if h in by_rel:
                refs.add(h)
                for a in parse_html_assets(by_rel[h]):
                    if a in by_rel:
                        refs.add(a)
        # Also walk referenced JS chunks for dynamic chunk references
        queue = [r for r in refs if r.endswith(".js")]
        seen = set(queue)
        while queue:
            cur = queue.pop()
            js = open(by_rel[cur], "r", encoding="utf-8", errors="replace").read()
            for m in re.findall(r'static/chunks/[A-Za-z0-9_./-]+\.js', js):
                cand = "/_next/" + m
                if cand in by_rel and cand not in seen:
                    seen.add(cand)
                    refs.add(cand)
                    queue.append(cand)
            for m in re.findall(r'static/css/[A-Za-z0-9_./-]+\.css', js):
                cand = "/_next/" + m
                if cand in by_rel:
                    refs.add(cand)
        return refs

    journey_static = collect_route_assets(journey_html)
    # Also scan ALL _next/static/chunks/pages/app for dynamic kaplay/mediapipe chunks not statically linked in HTML
    all_next_js_css = {rel for rel in by_rel if rel.startswith("/_next/static/") and (rel.endswith(".js") or rel.endswith(".css"))}
    nui_simd = {
        "/models/hand_landmarker.task",
        "/mediapipe/blaze_face_short_range.tflite",
        "/mediapipe/wasm/vision_wasm_internal.js",
        "/mediapipe/wasm/vision_wasm_internal.wasm",
    }
    nui_nosimd = {
        "/models/hand_landmarker.task",
        "/mediapipe/blaze_face_short_range.tflite",
        "/mediapipe/wasm/vision_wasm_nosimd_internal.js",
        "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
    }
    other_public = {"/assets/momo.svg", "/icon.svg"}

    def sum_set(rels: set[str]) -> dict:
        s = {"count": 0, "raw": 0, "gzip": 0, "zstd": 0}
        for r in rels:
            if r in file_stats:
                s["count"] += 1
                for k in ("raw", "gzip", "zstd"):
                    s[k] += file_stats[r][k]
        return s

    # Worst-case full app shell (all _next/static JS/CSS + journey HTML + other public) + 1 NUI SIMD set
    app_all_chunks = {r for r in journey_html if r in by_rel} | all_next_js_css | {r for r in other_public if r in by_rel}
    journey_parsed_plus_nui = journey_static | {r for r in other_public if r in by_rel} | nui_simd
    upper_bound_plus_nui = app_all_chunks | nui_simd

    # Also compute scenario where Caddy default encode does NOT compress .task / .tflite (octet-stream)
    def caddy_sim(rels: set[str], compress_task_tflite: bool) -> dict:
        total_gz = 0
        total_zst = 0
        for r in rels:
            if r not in file_stats:
                continue
            ext = os.path.splitext(r)[1].lower()
            is_bin_uncompressed = ext in (".task", ".tflite") and not compress_task_tflite
            total_gz += file_stats[r]["raw"] if is_bin_uncompressed else file_stats[r]["gzip"]
            total_zst += file_stats[r]["raw"] if is_bin_uncompressed else file_stats[r]["zstd"]
        return {"gzip_bytes": total_gz, "zstd_bytes": total_zst}

    report = {
        "out_dir": OUT_DIR,
        "total_out_all_files": sum_set(set(by_rel.keys())),
        "by_extension": ext_totals,
        "nui_simd_assets": {r: file_stats[r] for r in sorted(nui_simd) if r in file_stats},
        "nui_simd_sum": sum_set(nui_simd),
        "nui_nosimd_sum": sum_set(nui_nosimd),
        "hand_landmarker_task_members": task_members,
        "app_journey_html_plus_parsed_static": sum_set(journey_static),
        "app_all_next_static_chunks_upper_bound": sum_set(app_all_chunks),
        "b_user_parsed_plus_nui_simd_sum": sum_set(journey_parsed_plus_nui),
        "b_user_upper_bound_all_chunks_plus_nui_simd": sum_set(upper_bound_plus_nui),
        "caddy_default_no_task_tflite_compress": {
            "parsed_plus_nui_simd": caddy_sim(journey_parsed_plus_nui, False),
            "upper_bound_plus_nui_simd": caddy_sim(upper_bound_plus_nui, False),
        },
        "caddy_with_all_compressed": {
            "parsed_plus_nui_simd": caddy_sim(journey_parsed_plus_nui, True),
            "upper_bound_plus_nui_simd": caddy_sim(upper_bound_plus_nui, True),
        },
        "largest_next_chunks": sorted(
            [(r, file_stats[r]) for r in all_next_js_css],
            key=lambda x: x[1]["raw"],
            reverse=True,
        )[:15],
        "lab_only_html_static": sum_set(collect_route_assets(lab_html)),
    }
    out_path = os.path.join(RESULTS_DIR, "r18_ux0_a_bundle.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps({
        "nui_simd_sum": report["nui_simd_sum"],
        "app_journey_parsed": report["app_journey_html_plus_parsed_static"],
        "app_upper_bound": report["app_all_next_static_chunks_upper_bound"],
        "b_user_parsed_raw_gz_zst": report["b_user_parsed_plus_nui_simd_sum"],
        "b_user_upper_raw_gz_zst": report["b_user_upper_bound_all_chunks_plus_nui_simd"],
        "caddy_no_task_tflite_compress": report["caddy_default_no_task_tflite_compress"],
        "hand_landmarker_task_members": task_members,
    }, indent=2))


if __name__ == "__main__":
    main()
