#!/usr/bin/env python3
"""Create a multi-condition 640x360 Y4M camera feed in sandbox browser/ combining ONLY held-out TEST splits:
  - HandGesture-5G `test` split via HTTP Range (L-Sign POINT_PRESS, Pointing Up POINT_READY, V-Sign/Fist OTHER)
  - Natural RGB v3 `test` clips (`p02/p05` dim, green_led, backlit, thumbs_up, peace_sign, point_left/right)
  - Cached Mendeley bxr7kx84y6 DimLight & NaturalLight + R19 N0/N1 distractors (`N0_l_sticks`, `N1_poster_pistol`).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request
import zipfile
import cv2
import numpy as np

sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/r19-sandbox/work")
sys.path.insert(0, "/srv/sketchbook/mediapipe-optimize/r19-sandbox/train")
from range_zip import RangeZipReader
from n0_n1_pistol_distractors import make_r19_pistol_distractors

HG5G_API = "https://data.mendeley.com/api/datasets/wj25crzdbm/files?version=1"
HG5G_JSONL = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl"
TMP_CLIPS_DIR = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/browser/tmp_p02_test_clips"
MENDELEY_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6"
OUT_Y4M = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/browser/r19_sim_cam.y4m"
META_JSON = "/srv/sketchbook/mediapipe-optimize/r19-sandbox/browser/r19_sim_cam_meta.json"


def fit_letterbox_640x360(rgb: np.ndarray) -> np.ndarray:
    """Preserve hand aspect ratio while scaling cleanly into 640x360."""
    th, tw = 360, 640
    h, w = rgb.shape[:2]
    scale = min(tw / max(1, w), th / max(1, h))
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    resized = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((th, tw, 3), 26, dtype=np.uint8)
    y0, x0 = (th - nh) // 2, (tw - nw) // 2
    canvas[y0:y0 + nh, x0:x0 + nw] = resized
    return canvas


def load_hg5g_test_frames() -> list[tuple[str, np.ndarray]]:
    rows = [json.loads(line) for line in open(HG5G_JSONL)]
    test_rows = [r for r in rows if r["split"] == "test" and r["l0"]["n_hands"] > 0]
    by_cls = {c: [r for r in test_rows if r["class_name"] == c] for c in ("L-Sign", "Pointing Up", "V-Sign", "Fist")}

    # Interleave Pointing Up -> L-Sign -> Pointing Up -> L-Sign so FSM exercises READY <-> PRESS transitions
    chosen = []
    l_list = by_cls["L-Sign"][:14]
    p_list = by_cls["Pointing Up"][:10]
    for i in range(max(len(l_list), len(p_list))):
        if i < len(p_list):
            chosen.append(p_list[i])
        if i < len(l_list):
            chosen.append(l_list[i])
    chosen.extend(by_cls["V-Sign"][:4])
    chosen.extend(by_cls["Fist"][:4])

    with urllib.request.urlopen(urllib.request.Request(HG5G_API, headers={"User-Agent": "R19/1.0"}), timeout=25) as r:
        files = json.loads(r.read().decode("utf-8"))
    fobj = next(f for f in files if f["filename"].endswith(".zip"))
    url = fobj.get("content_details", {}).get("download_url") or f"https://data.mendeley.com/public-files/datasets/wj25crzdbm/files/{fobj['id']}/file_downloaded"

    rdr = RangeZipReader(url)
    by_name = {e.filename: e for e in rdr.parse_central_directory()}
    frames: list[tuple[str, np.ndarray]] = []
    for row in chosen:
        ent = by_name.get(row["filename"])
        if not ent:
            continue
        raw = rdr.fetch_entry_bytes(ent)
        bgr = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
        if bgr is None:
            continue
        rgb = fit_letterbox_640x360(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        # Repeat 8 frames (~0.8s @ 10fps) per test posture so dwell & lockout FSM react cleanly
        for _ in range(8):
            frames.append((f"hg5g_test:{row['class_name']}", rgb))
    return frames


def load_p02_test_clip_frames() -> list[tuple[str, np.ndarray]]:
    wanted = [
        "point_left_p02_01_hand_only.mp4",
        "point_right_p02_01_hand_only.mp4",
        "thumbs_up_p02_01_hand_only.mp4",
        "peace_sign_p02_01_hand_only.mp4",
        "come_here_p02_04_full_body.mp4",
        "come_here_p05_01_full_body.mp4",
        "come_here_p05_03_full_body.mp4",
    ]
    out: list[tuple[str, np.ndarray]] = []
    for fn in wanted:
        p = os.path.join(TMP_CLIPS_DIR, fn)
        if not os.path.exists(p):
            continue
        cap = cv2.VideoCapture(p)
        tot = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        idxs = [int(round(i * max(0, tot - 1) / 9)) for i in range(10)] if tot >= 10 else list(range(tot))
        for fi in idxs:
            cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
            ok, bgr = cap.read()
            if ok and bgr is not None:
                out.append((f"n66_test:{fn}", fit_letterbox_640x360(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))))
        cap.release()
    return out


def load_mendeley_frames(zip_name: str, tag: str, limit: int) -> list[tuple[str, np.ndarray]]:
    zf = zipfile.ZipFile(os.path.join(MENDELEY_DIR, zip_name))
    names = sorted(n for n in zf.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png")) and not n.startswith("__MACOSX"))
    out: list[tuple[str, np.ndarray]] = []
    for n in names[:limit]:
        bgr = cv2.imdecode(np.frombuffer(zf.read(n), dtype=np.uint8), cv2.IMREAD_COLOR)
        if bgr is not None:
            out.append((tag, fit_letterbox_640x360(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))))
    return out


def main() -> None:
    hg = load_hg5g_test_frames()
    n66 = load_p02_test_clip_frames()
    dim = load_mendeley_frames("dim_light_1.zip", "mendeley_dim", 30)
    nat = load_mendeley_frames("natural_light_1.zip", "mendeley_nat", 20)
    neg = [(f"neg:{name}", fit_letterbox_640x360(rgb)) for name, _, rgb in make_r19_pistol_distractors()][:18]
    # Put N0_l_sticks + N1_poster_pistol first among negatives
    neg_l = [(f"neg:{name}", fit_letterbox_640x360(rgb)) for name, _, rgb in make_r19_pistol_distractors() if "l_sticks" in name or "poster_pistol" in name]
    neg_all = (neg_l[:10] + neg[:10])

    seq = hg + n66 + dim + nat + neg_all
    cmd = [
        "/usr/bin/ffmpeg", "-y",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "640x360", "-framerate", "10", "-i", "-",
        "-pix_fmt", "yuv420p", OUT_Y4M,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    for _, rgb in seq:
        proc.stdin.write(np.ascontiguousarray(rgb).tobytes())
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(proc.stderr.read().decode("utf-8", errors="replace"))

    counts: dict[str, int] = {}
    for tag, _ in seq:
        counts[tag] = counts.get(tag, 0) + 1
    meta = {
        "y4m_path": OUT_Y4M,
        "bytes": os.path.getsize(OUT_Y4M),
        "fps": 10,
        "resolution": "640x360",
        "frames": len(seq),
        "loop_duration_sec": round(len(seq) / 10.0, 2),
        "segment_counts": counts,
    }
    with open(META_JSON, "w") as f:
        json.dump(meta, f, indent=2)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
