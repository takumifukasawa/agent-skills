#!/usr/bin/env python3
"""Resize an image to exactly WxH (LANCZOS). Assumes the source already has the
target aspect ratio (the capture supersamples at the target aspect, so this is a
clean downscale). Usage: resize.py <in> <out> <W> <H>"""
import sys
from PIL import Image

src, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
Image.open(src).convert("RGB").resize((w, h), Image.LANCZOS).save(out, "PNG")
print(f"[resize] {out} {w}x{h}")
