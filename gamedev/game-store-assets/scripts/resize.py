#!/usr/bin/env python3
"""Fit an image to exactly WxH (LANCZOS). If its aspect differs from W:H it is
first cropped to that aspect: centered horizontally, and vertically at CROP_Y
(0 = top, 0.5 = middle, 1 = bottom; default 0.5).
Usage: resize.py <in> <out> <W> <H> [CROP_Y]"""
import sys
from PIL import Image

src, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
cy = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
im = Image.open(src).convert("RGB")
iw, ih = im.size
if abs(iw / ih - w / h) > 1e-3:
    if iw / ih > w / h:  # too wide: crop the sides
        cw = round(ih * w / h)
        left = (iw - cw) // 2
        im = im.crop((left, 0, left + cw, ih))
    else:  # too tall: crop a band
        ch = round(iw * h / w)
        top = round((ih - ch) * min(1.0, max(0.0, cy)))
        im = im.crop((0, top, iw, top + ch))
im.resize((w, h), Image.LANCZOS).save(out, "PNG")
print(f"[resize] {out} {w}x{h}")
