#!/usr/bin/env python3
"""Build the store-asset picker page (an Artifact the user ticks) from a JSON spec.

    python3 build_picker.py picker.json out.html

The page shows candidate images and text options in groups; the user ticks what to use, reorders multi picks
(screenshots = upload order), leaves comments per group plus an overall instruction, and copies text with a button.
Every change is saved to the Artifact's db document `doc` (default "picks/current"), which Claude reads back with
ArtifactData (action "get"). Publish the result with the Artifact tool and capabilities {"db": {}}.

Spec (paths are relative to the spec file):

{
  "title": "My Game ストア画像",               # <title>: a short name
  "heading": "My Game ストア画像の選定",         # optional h1 (defaults to title)
  "eyebrow": "Google Play · ストア掲載用",
  "lead": "One or two sentences on how to choose.",
  "doc": "picks/current",
  "groups": [
    {"id": "shots", "type": "image", "pick": "screens", "mode": "multi", "max": 8,
     "title": "スクリーンショット候補", "sub": "1080×1920", "trayLabel": "スクリーンショット",
     "aspect": "9/16", "minCol": 160, "thumbWidth": 540,
     "noteKey": "shotsNote", "noteLabel": "スクショへのコメント（Claude への指示）",
     "items": [{"id": "stage1-03", "path": "shots/stage1-03.png", "label": "ステージ 1 · 中盤", "rec": true}, ...]},
    {"id": "feature", "type": "image", "pick": "feature", "mode": "single", "aspect": "1024/500", "minCol": 300, ...},
    {"id": "retakes", "type": "image", "pick": "feature", ...},     # same pick key = one choice across both grids
    {"id": "icon", "type": "image", "pick": "icon", "mode": "single", "aspect": "1/1", "minCol": 160, "thumbWidth": 512, ...},
    {"id": "short", "type": "text", "pick": "shortDesc", "limit": 80, "title": "簡単な説明",
     "items": [{"id": "A", "text": "English text to submit", "translation": "日本語訳"}]},
    {"id": "full", "type": "text", "pick": "fullDesc", "limit": 4000, "long": true, ...}
  ],
  "choices": [{"key": "titleText", "legend": "フィーチャーグラフィックの文字",
               "options": [{"value": "none", "label": "ゲーム画面だけ"}, {"value": "title", "label": "タイトルを入れる"}]}]
}

Item numbers ("no") default to a per-group prefix + index (S01, F01, ...; set "prefix" on the group). Images are
embedded as JPEG data URIs (thumbWidth px wide, default 540; quality 82) - keep the page under ~12 MB.
"""
import base64
import html as htmllib
import io
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "picker", "picker.template.html")


def data_uri(path, width):
    im = Image.open(path).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()


def validate(spec):
    """Keys share one saved document: pick / choice / note keys must not collide, ids must be unique per pick."""
    keys, modes, ids = {"note": "overall note", "updatedAt": "save time"}, {}, {}
    def claim(k, what):
        if k in keys and not (what.startswith("pick ") and keys[k] == what):
            sys.exit(f"[build_picker] key '{k}' used twice ({keys[k]} / {what})")
        keys[k] = what
    for g in spec["groups"]:
        claim(g["pick"], "pick " + g["pick"])
        mode = g.get("mode", "single")
        if modes.setdefault(g["pick"], mode) != mode:
            sys.exit(f"[build_picker] groups sharing pick '{g['pick']}' must have the same mode")
        if g.get("noteKey"):
            claim(g["noteKey"], "note of group " + g["id"])
        for it in g["items"]:
            if it["id"] in ids.setdefault(g["pick"], set()):
                sys.exit(f"[build_picker] item id '{it['id']}' appears twice under pick '{g['pick']}'")
            ids[g["pick"]].add(it["id"])
    for c in spec.get("choices", []):
        claim(c["key"], "choice " + c["key"])


def main():
    if len(sys.argv) != 3:
        sys.exit("usage: build_picker.py <spec.json> <out.html>")
    spec_path, out = sys.argv[1], sys.argv[2]
    base = os.path.dirname(os.path.abspath(spec_path))
    spec = json.load(open(spec_path, encoding="utf-8"))
    validate(spec)
    for g in spec["groups"]:
        g.setdefault("mode", "single")
        prefix = g.get("prefix", g["id"][:1].upper() if g["type"] == "image" else "")
        for i, it in enumerate(g["items"]):
            it.setdefault("no", f"{prefix}{i + 1:02d}" if prefix else it["id"])
            if g["type"] == "image":
                path = os.path.join(base, it.pop("path"))
                it.setdefault("file", os.path.basename(path))
                it.setdefault("label", it["file"])
                it["src"] = data_uri(path, g.get("thumbWidth", 540))
    html = open(TEMPLATE, encoding="utf-8").read()
    html = html.replace("/*TITLE*/", htmllib.escape(spec.get("title", "Store assets")))
    html = html.replace("/*SPEC*/{}", json.dumps(spec, ensure_ascii=False).replace("</", "<\\/"))
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    mb = len(html.encode()) / 1e6
    print(f"[build_picker] {out} ({mb:.1f} MB)" + ("  WARNING: over 12 MB, lower thumbWidth" if mb > 12 else ""))


if __name__ == "__main__":
    main()
