#!/usr/bin/env python3
"""Create R20 multi-condition 640x360 Y4M simulated camera feed (`r20_sim_cam.y4m`) in `r20-sandbox/browser/`.

Combines:
  - Interleaved `Pointing Up` (`POINT_READY`) <-> `L-Sign` (`POINT_PRESS`) transitions (bright + low-light/backlight)
    so the browser FSM exercises real `KEYDOWN`, `HELD`, `KEYUP`, `JUMP`, and `A3` low-light recovery.
  - Non-pistol `V-Sign` / `Fist` (`OTHER`), Mendeley `bxr7kx84y6` `dim_light_1.zip` & `natural_light_1.zip`,
    and R19 `N0/N1` adversarial pistol distractors (`N0_l_sticks`, `N1_poster_pistol`).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import zipfile

import cv2
import numpy as np

SANDBOX = os.environ.get("R20_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r20-sandbox")
R19_SANDBOX = os.environ.get("R19_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r19-sandbox")
R18_SANDBOX = os.environ.get("R18_SANDBOX", "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox")
REPO = os.environ.get("R20_REPO", "/srv/sketchbook/mediapipe-optimize/research-can")

sys.path.insert(0, f"{REPO}/r20/scripts")
sys.path.insert(0, f"{REPO}/r19/scripts")
from augment_hg5g import backlight, low_light  # noqa: E402
from n0_n1_pistol_distractors import make_r19_pistol_distractors  # noqa: E402

HG5G_JSONL = f"{R19_SANDBOX}/data/handgesture_5g_derived/handgesture_5g_landmarks.jsonl"
CACHE_720 = f"{SANDBOX}/data/hg5g_720"
MENDELEY_DIR = f"{R18_SANDBOX}/datasets/mendeley_bxr7kx84y6"
OUT_Y4M = f"{SANDBOX}/browser/r20_sim_cam.y4m"
META_JSON = f"{SANDBOX}/browser/r20_sim_cam_meta.json"


def fit_letterbox_640x360(rgb: np.ndarray) -> np.ndarray:
    th, tw = 360, 640
    h, w = rgb.shape[:2]
    scale = min(tw / max(1, w), th / max(1, h))
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    resized = cv2.resize(rgb, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((th, tw, 3), 26, dtype=np.uint8)
    y0, x0 = (th - nh) // 2, (tw - nw) // 2
    canvas[y0 : y0 + nh, x0 : x0 + nw] = resized
    return canvas


def load_hg5g_cached_transitions() -> list[tuple[str, np.ndarray]]:
    rows = [json.loads(line) for line in open(HG5G_JSONL, encoding="utf-8") if line.strip()]
    avail = [
        r for r in rows
        if r["l0"]["n_hands"] > 0 and os.path.exists(f"{CACHE_720}/{r['sample_id']}.jpg")
    ]
    by_cls = {c: [r for r in avail if r["class_name"] == c] for c in ("L-Sign", "Pointing Up", "V-Sign", "Fist")}
    l_list = by_cls["L-Sign"][:12]
    p_list = by_cls["Pointing Up"][:12]
    rng = np.random.default_rng(20261119)

    frames: list[tuple[str, np.ndarray]] = []
    for i in range(min(len(l_list), len(p_list))):
        for r, tag in [(p_list[i], "READY"), (l_list[i], "PRESS")]:
            bgr = cv2.imread(f"{CACHE_720}/{r['sample_id']}.jpg")
            if bgr is None:
                continue
            rgb = fit_letterbox_640x360(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            # Alternate bright, dim, and backlit cycles so low-light A3 fallback is exercised in browser
            if i % 3 == 1:
                rgb = low_light(rgb, 0.35, 0.004, rng)
                sub = f"hg5g_dim:{tag}"
            elif i % 3 == 2:
                rgb = backlight(rgb, rng)
                sub = f"hg5g_backlight:{tag}"
            else:
                sub = f"hg5g_bright:{tag}"
            for _ in range(15):
                frames.append((sub, rgb))

    for c in ("V-Sign", "Fist"):
        for r in by_cls[c][:4]:
            bgr = cv2.imread(f"{CACHE_720}/{r['sample_id']}.jpg")
            if bgr is not None:
                rgb = fit_letterbox_640x360(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
                for _ in range(10):
                    frames.append((f"hg5g_other:{c}", rgb))
    return frames


def load_mendeley_frames(zip_name: str, tag: str, limit: int) -> list[tuple[str, np.ndarray]]:
    zf = zipfile.ZipFile(os.path.join(MENDELEY_DIR, zip_name))
    names = sorted(
        n for n in zf.namelist()
        if n.lower().endswith((".jpg", ".jpeg", ".png")) and not n.startswith("__MACOSX")
    )
    out: list[tuple[str, np.ndarray]] = []
    for n in names[:limit]:
        bgr = cv2.imdecode(np.frombuffer(zf.read(n), dtype=np.uint8), cv2.IMREAD_COLOR)
        if bgr is not None:
            out.append((tag, fit_letterbox_640x360(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))))
    return out


def main() -> None:
    os.makedirs(os.path.dirname(OUT_Y4M), exist_ok=True)
    hg = load_hg5g_cached_transitions()
    dim = load_mendeley_frames("dim_light_1.zip", "mendeley_dim", 30)
    nat = load_mendeley_frames("natural_light_1.zip", "mendeley_nat", 20)
    neg = [(f"neg:{name}", fit_letterbox_640x360(rgb)) for name, _, rgb in make_r19_pistol_distractors()][:20]

    seq = hg + dim + nat + neg
    cmd = [
        "/usr/bin/ffmpeg", "-y",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "640x360", "-framerate", "30", "-i", "-",
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
        "fps": 30,
        "resolution": "640x360",
        "frames": len(seq),
        "loop_duration_sec": round(len(seq) / 30.0, 2),
        "segment_counts": counts,
    }
    with open(META_JSON, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(json.dumps(meta, indent=2), flush=True)


if __name__ == "__main__":
    main()
