#!/usr/bin/env python3
"""Pad a screenshot to a square (centered, on a pad color) and resize to NxN PNG.

Usage: resize_square.py <in.png> <out.png> <size> [padColor]
padColor: #rrggbb (default #000000)
"""
import sys
from PIL import Image


def hex_rgb(s: str):
    s = s.lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def main():
    src, out = sys.argv[1], sys.argv[2]
    size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    pad = hex_rgb(sys.argv[4]) if len(sys.argv) > 4 else (0, 0, 0)

    im = Image.open(src).convert("RGB")
    w, h = im.size
    side = max(w, h)
    if (w, h) != (side, side):
        canvas = Image.new("RGB", (side, side), pad)
        canvas.paste(im, ((side - w) // 2, (side - h) // 2))
        im = canvas
    im = im.resize((size, size), Image.LANCZOS)
    im.save(out, "PNG")
    print(f"[resize_square] {out} {size}x{size}")


if __name__ == "__main__":
    main()
