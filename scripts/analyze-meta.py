#!/usr/bin/env python3
"""Fine zooms: hands/helmet top, face area, bottom legs."""
from PIL import Image
import numpy as np

im = Image.open("assets/meta.jpg").convert("RGB")
a = np.asarray(im).astype(np.float32)
bg = np.array([237, 240, 231], dtype=np.float32)
dist = np.abs(a - bg).sum(-1)
mask = dist > 60
ys, xs = np.where(mask)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
crop = a[y0:y1+1, x0:x1+1]
H, W, _ = crop.shape

CENTS = np.array([
    [200, 217, 40],   # L lime bright
    [150, 160, 26],   # O olive
    [26, 26, 27],     # B black
    [44, 40, 35],     # b lit black
    [205, 202, 189],  # W beige
    [192, 228, 84],   # Y yellow-green glow
], dtype=np.float32)
LEG = "LOBbWY"

labs = np.empty((H, W), dtype=int)
dd = ((crop.reshape(-1, 1, 3) - CENTS[None, :, :]) ** 2).sum(-1)
labs = dd.argmin(-1).reshape(H, W)
bgdist = np.abs(crop - bg).sum(-1)
labs = np.where(bgdist > 60, labs, 6)

def zoom(y0, y1, xa, xb, label, rows=26, cols=64):
    reg = labs[y0:y1, xa:xb]
    rh, rw = reg.shape
    gy = np.linspace(0, rh - 1, rows).astype(int)
    gx = np.linspace(0, rw - 1, cols).astype(int)
    print(f"\n--- {label} (y {y0}-{y1}, x {xa}-{xb}) ---")
    for row in reg[gy][:, gx]:
        print("".join((LEG + ".")[o] for o in row))

zoom(0, 110, 0, 226, "TOP: arms + helmet")
zoom(105, 185, 0, 150, "FACE area", rows=22, cols=56)
zoom(175, 250, 0, 226, "CHEST/BELT")
zoom(240, 348, 0, 226, "LEGS + FEET", rows=26, cols=64)
