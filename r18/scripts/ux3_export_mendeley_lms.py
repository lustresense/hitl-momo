#!/usr/bin/env python3
"""Extract MediaPipe landmarks on Mendeley DimLight/NaturalLight blocks + N0/N1 distractors for exported TS evaluation."""
import json
import os
import zipfile
import cv2
import mediapipe as mp
import numpy as np

from r18_ux0_c_mendeley import build_landmarker, clahe_rgb_exact, pixel_luma, mean_luma, center_luma, DARK_LUMA, BACKLIGHT_CENTER_MAX, BACKLIGHT_LUMA_GAP
from r18_ux0_e_n0_negatives import make_n0_n1_scenes

RESULTS_DIR = "/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/results"


def load_block(zip_path: str, per_block: int = 100, blocks: int = 3):
    zf = zipfile.ZipFile(zip_path)
    imgs = sorted(n for n in zf.namelist() if n.lower().endswith((".jpg", ".jpeg", ".png")) and not n.startswith("__MACOSX"))
    step = max(1, len(imgs) // blocks)
    out = []
    for b in range(blocks):
        for nm in imgs[b * step: b * step + per_block]:
            bgr = cv2.imdecode(np.frombuffer(zf.read(nm), dtype=np.uint8), cv2.IMREAD_COLOR)
            if bgr is not None:
                out.append((nm, cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)))
    return out


def lm_to_list(res):
    if not res.hand_landmarks:
        return []
    return [[[round(float(p.x), 5), round(float(p.y), 5)] for p in h] for h in res.hand_landmarks]


def eval_stream(frames):
    det_r, det_c320 = build_landmarker(), build_landmarker()
    rows = []
    rec = 0
    for idx, (nm, rgb) in enumerate(frames):
        h, w, _ = rgb.shape
        sh320 = max(1, int(round((320 * h) / w)))
        s320 = cv2.resize(rgb, (320, sh320), interpolation=cv2.INTER_LINEAR)
        lp = pixel_luma(s320)
        ml = mean_luma(lp, 2)
        cl = center_luma(lp, 2)
        is_dark = (ml < DARK_LUMA) or (cl < BACKLIGHT_CENTER_MAX and (ml - cl) >= BACKLIGHT_LUMA_GAP)

        out_r = det_r.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        c320 = clahe_rgb_exact(s320)
        out_c = det_c320.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c320)))

        # Adaptive M3: RAW-first sticky recovery with clahe320 fallback
        m3 = []
        if rec > 0:
            rec -= 1
            if out_c.hand_landmarks:
                m3 = lm_to_list(out_c)
            else:
                m3 = lm_to_list(out_r)
                rec = 0
        else:
            if out_r.hand_landmarks or not is_dark:
                m3 = lm_to_list(out_r)
            else:
                m3 = lm_to_list(out_c)
                if m3:
                    rec = 5

        rows.append({
            "idx": idx,
            "name": nm,
            "aspect": round(w / max(1, h), 4),
            "is_dark": bool(is_dark),
            "raw": lm_to_list(out_r),
            "clahe320": lm_to_list(out_c),
            "adaptive_m3": m3,
        })
    det_r.close(); det_c320.close()
    return rows


def main():
    dim = load_block("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6/dim_light_1.zip", 100, 3)
    nat = load_block("/srv/sketchbook/mediapipe-optimize/r18-ux0-sandbox/datasets/mendeley_bxr7kx84y6/natural_light_1.zip", 100, 3)

    det_r, det_c = build_landmarker(), build_landmarker()
    neg_rows = []
    for name, strata, rgb in make_n0_n1_scenes():
        h, w, _ = rgb.shape
        sh320 = max(1, int(round((320 * h) / w)))
        c320 = clahe_rgb_exact(cv2.resize(rgb, (320, sh320), interpolation=cv2.INTER_LINEAR))
        or_ = det_r.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
        oc_ = det_c.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(c320)))
        neg_rows.append({
            "name": name, "strata": strata, "aspect": round(w / max(1, h), 4),
            "raw": lm_to_list(or_), "clahe320": lm_to_list(oc_),
        })
    det_r.close(); det_c.close()

    out = {
        "dim_light": eval_stream(dim),
        "natural_light": eval_stream(nat),
        "negatives": neg_rows,
    }
    p = os.path.join(RESULTS_DIR, "ux3_mendeley_distractor_landmarks.json")
    with open(p, "w") as f:
        json.dump(out, f)
    print("Saved:", p, "bytes:", os.path.getsize(p))


if __name__ == "__main__":
    main()
