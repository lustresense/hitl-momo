"""Referensi rasterizer: output normalizeStrokes() game (goresan di kotak unit [0,1], y ke bawah)
-> tensor (1,28,28,1) float32 [0,1], goresan putih di latar hitam."""
import numpy as np
from PIL import Image, ImageDraw
S, M, LW = 256, 24, 20   # kanvas 256, margin 24 px, tebal garis 20 px (di skala 256)
def rasterize(strokes):
    img = Image.new("L", (S, S), 0); d = ImageDraw.Draw(img)
    span = S - 2 * M
    for st in strokes:
        pts = [(M + p["x"] * span, M + p["y"] * span) for p in st]
        if len(pts) == 1:
            x, y = pts[0]; r = LW / 2; d.ellipse((x - r, y - r, x + r, y + r), fill=255)
        else:
            d.line(pts, fill=255, width=LW, joint="curve")
    a = np.asarray(img.resize((28, 28), Image.BILINEAR), np.float32) / 255.0
    return a[None, :, :, None]
