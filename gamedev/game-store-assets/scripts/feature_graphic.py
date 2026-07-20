#!/usr/bin/env python3
"""Compose a store "feature graphic" (default 1024x500) from a REAL game
screenshot + a title/tagline.

Usage: feature_graphic.py <config.json>

Rendered at `superSample`x then downscaled for clean anti-aliasing. The left
panel is an actual game screenshot in a neon frame (don't hand-draw the game --
a real screenshot is faithful). The right panel is the title + tagline in a
bundled font.

config.json fields (paths/strings):
  out            output PNG path.
  size           [W, H] (default [1024, 500]).
  superSample    supersample factor (default 2).
  screenshot     path to a game screenshot (ideally HUD hidden, a dynamic frame).
  font           path to a .ttf (variable fonts: weights set below).
  title          e.g. "HOP HOOPS".
  tagline        e.g. "ONE-TAP NEON HOOPS" (optional, "" to omit).
  bg             background hex (default "#0a0a1c").
  frameColor     neon frame around the screenshot (default "#27e6ff").
  titleColor / titleGlow / tagColor / accentColor  hex colors.
  titleWeight / tagWeight  variable-font weights (int, or null for static fonts).
"""
import json
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

cfg = json.load(open(sys.argv[1]))
S = int(cfg.get("superSample", 2))
OW, OH = cfg.get("size", [1024, 500])
W, H = OW * S, OH * S


def hx(s, d="#000000"):
    s = (s or d).lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


BG = hx(cfg.get("bg", "#0a0a1c"))
FRAME = hx(cfg.get("frameColor", "#27e6ff"))
TITLE_C = hx(cfg.get("titleColor", "#ffffff"))
TITLE_G = hx(cfg.get("titleGlow", "#27e6ff"))
TAG_C = hx(cfg.get("tagColor", "#8fffe0"))
ACCENT = hx(cfg.get("accentColor", "#27e6ff"))
FONT = cfg["font"]


def font(size, weight):
    f = ImageFont.truetype(FONT, size)
    if weight is not None:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def fit(text, target_w, start, weight):
    for sz in range(start, 20, -2):
        if font(sz, weight).getbbox(text)[2] <= target_w:
            return font(sz, weight)
    return font(24, weight)


def glow(fn, blur, alpha=1.0):
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fn(ImageDraw.Draw(L))
    L = L.filter(ImageFilter.GaussianBlur(blur))
    if alpha < 1.0:
        L.putalpha(L.split()[3].point(lambda v: int(v * alpha)))
    return L


img = Image.new("RGBA", (W, H), BG + (255,))
img.alpha_composite(glow(lambda d: d.ellipse([W * 0.38, -H * 0.3, W * 1.06, H * 1.3], fill=(34, 26, 84, 255)), 130 * S, 0.6))

# left: screenshot in a neon frame
shot = Image.open(cfg["screenshot"]).convert("RGB")
sh = int(0.88 * H)
sw = round(sh * shot.width / shot.height)
shot = shot.resize((sw, sh), Image.LANCZOS)
sx, sy = 64 * S, (H - sh) // 2
img.alpha_composite(glow(lambda d: d.rounded_rectangle([sx - 6 * S, sy - 6 * S, sx + sw + 6 * S, sy + sh + 6 * S], radius=18 * S, outline=FRAME + (255,), width=8 * S), 12 * S, 0.9))
img.paste(shot, (sx, sy))
ImageDraw.Draw(img).rounded_rectangle([sx - 3 * S, sy - 3 * S, sx + sw + 3 * S, sy + sh + 3 * S], radius=14 * S, outline=FRAME + (230,), width=3 * S)

# right: title (+ tagline)
rl, rr = sx + sw + 40 * S, W - 48 * S
rcx, rw = (rl + rr) // 2, rr - (sx + sw + 40 * S)
title = cfg.get("title", "")
tf = fit(title, rw, 124 * S, cfg.get("titleWeight", 800))
tb = tf.getbbox(title)
tw, th = tb[2] - tb[0], tb[3] - tb[1]

tag = cfg.get("tagline", "")
gf = fit(tag, rw - 16 * S, 44 * S, cfg.get("tagWeight", 600)) if tag else None
gb = gf.getbbox(tag) if tag else (0, 0, 0, 0)
gw, gh = (gb[2] - gb[0], gb[3] - gb[1]) if tag else (0, 0)

gap = 30 * S
block = th + (gap + gh if tag else 0)
top = (H - block) // 2 - tb[1]
tx = rcx - tw // 2
img.alpha_composite(glow(lambda d: d.text((tx, top), title, font=tf, fill=TITLE_G + (255,)), 16 * S, 0.8))
d = ImageDraw.Draw(img)
d.text((tx, top), title, font=tf, fill=TITLE_C + (255,))

if tag:
    gy = top + tb[1] + th + gap - gb[1]
    d.text((rcx - gw // 2, gy), tag, font=gf, fill=TAG_C + (255,))
    uy = gy + gb[1] + gh + 18 * S
    d.line([(rcx - gw // 2, uy), (rcx + gw // 2, uy)], fill=ACCENT + (180,), width=3 * S)

img.convert("RGB").resize((OW, OH), Image.LANCZOS).save(cfg["out"], "PNG")
print("[feature_graphic] wrote", cfg["out"], f"{OW}x{OH}")
