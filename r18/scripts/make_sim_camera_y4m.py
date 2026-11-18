#!/usr/bin/env python3
"""Create a 640x360 Y4M simulated camera feed inside sandbox harness-dist/ from Mendeley DimLight, NaturalLight, and N0 distractors."""
import os
import subprocess
import zipfile
import cv2
import numpy as np

from r18_ux0_e_n0_negatives import make_n0_n1_scenes

OUT_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/harness-dist"
Y4M_PATH = os.path.join(OUT_DIR, "sim_cam.y4m")


def fit_640x360(rgb: np.ndarray) -> np.ndarray:
    return cv2.resize(rgb, (640, 360), interpolation=cv2.INTER_AREA)


def load_frames(zip_path: str, count: int) -> list[np.ndarray]:
    zf = zipfile.ZipFile(zip_path)
    imgs = sorted(n for n in zf.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png")) and not n.startswith("__MACOSX"))
    out = []
    for nm in imgs[:count]:
        bgr = cv2.imdecode(np.frombuffer(zf.read(nm), dtype=np.uint8), cv2.IMREAD_COLOR)
        if bgr is not None:
            out.append(fit_640x360(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
    return out


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    dim = load_frames("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6/dim_light_1.zip", 60)
    nat = load_frames("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6/natural_light_1.zip", 60)
    neg = [fit_640x360(rgb) for _, st, rgb in make_n0_n1_scenes() if st == "N0"][:30]

    seq = dim + nat + neg
    cmd = [
        "/usr/bin/ffmpeg", "-y",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "640x360", "-framerate", "12", "-i", "-",
        "-pix_fmt", "yuv420p", Y4M_PATH,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    for rgb in seq:
        proc.stdin.write(np.ascontiguousarray(rgb).tobytes())
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(proc.stderr.read().decode("utf-8", errors="replace"))
    print("Generated", Y4M_PATH, "frames:", len(seq), "bytes:", os.path.getsize(Y4M_PATH))


if __name__ == "__main__":
    main()
