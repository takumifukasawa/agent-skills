#!/usr/bin/env python3
"""Lay candidate images out on one labeled sheet, so the user can pick by number.

Usage: contact_sheet.py <out.png> <image> [<image> ...] [--cols N] [--thumb W]

Labels are "NN  <file stem>" (NN = 1-based position). Thumbnails keep each
image's aspect; --thumb sets their width (default 300). Pass the files in the
order you want them numbered (e.g. grouped by stage/level).
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("images", nargs="+")
ap.add_argument("--cols", type=int, default=5)
ap.add_argument("--thumb", type=int, default=300)
a = ap.parse_args()


def font(size):
    for f in ("/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


ims = [Image.open(p).convert("RGB") for p in a.images]
tw = a.thumb
th = max(round(tw * im.height / im.width) for im in ims)
gap, label = 16, round(tw * 0.15)
cols = min(a.cols, len(ims))
rows = (len(ims) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (tw + gap) + gap, rows * (th + label + gap) + gap), (24, 24, 28))
d = ImageDraw.Draw(sheet)
f = font(max(14, round(tw * 0.09)))
for i, (p, im) in enumerate(zip(a.images, ims)):
    x = gap + (i % cols) * (tw + gap)
    y = gap + (i // cols) * (th + label + gap)
    d.text((x, y), f"{i + 1:02d}  {os.path.splitext(os.path.basename(p))[0]}", fill=(255, 230, 120), font=f)
    t = im.resize((tw, round(tw * im.height / im.width)), Image.LANCZOS)
    sheet.paste(t, (x, y + label))
sheet.save(a.out)
print(f"[contact_sheet] {a.out} ({len(ims)} images)")
