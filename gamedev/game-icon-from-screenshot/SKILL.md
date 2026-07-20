---
name: game-icon-from-screenshot
description: >-
  Generate a square PNG icon (app icon / store icon / favicon / thumbnail, default 512x512)
  by screenshotting a RUNNING web/canvas game in headless Chromium and cropping around a
  chosen element — so the icon is the real in-game render, not a hand-drawn approximation.
  Use when the user asks to "make/generate a game icon", "アイコン作って", "512x512 のアイコン",
  "app/store icon", "favicon", or specifically "screenshot the running game and crop it into an
  icon / 実際のゲーム画面をスクショしてアイコンにする". Works for Phaser/PixiJS/Three.js/plain-canvas
  games served locally (Vite/webpack dev server, or any localhost URL). Not for drawing an icon
  from scratch (that's freehand image work).
compatibility: >-
  Requires Playwright + Chromium (headless is fine here) and Pillow (Python).
  The game must already be running at a local dev-server URL and expose
  enough (a dev handle, DOM, or globals) for the `clip` fn to pose/measure
  the subject.
---

# Game icon from a screenshot of the running game

Produce a faithful square icon by capturing the actual running game. The reusable harness
lives in `scripts/`; you only supply the small GAME-SPECIFIC config (URL, ready condition,
and how to pose/crop the subject).

## When this beats drawing an icon by hand

Hand-drawn icons drift from the real game (wrong shapes/colors). Screenshotting the live
game guarantees the icon matches what players see. Prefer this whenever the game is (or can
be) running locally.

### Fallback: hand-compose from the game's real elements

Sometimes a faithful crop looks timid at 512px — the subject is small in the frame and
cropping tight enough to fill the tile clips it. When a screenshot crop won't make a bold,
frame-filling tile, **reconstruct the game's real element geometry in PIL** (same
shapes/colors/glow, pulled from the game config, scaled to fill the icon). That's different
from drawing from scratch — you copy the real look, just resized for the tile. Read
`references/hand-composed-icon.md` for the technique and the PIL alpha/AA/glow/trail
gotchas (notably: soft elements MUST go on a transparent layer + `alpha_composite`, or
`convert("RGB")` drops their alpha and they render as full-opacity blobs).

## Prerequisites

- The game is **running at a local URL** (e.g. `npm run dev` → `http://localhost:5173`). Start
  it first; the harness errors if the URL can't be opened.
- **Playwright + Chromium.** The harness auto-resolves `playwright` from the project
  `node_modules`, the npx cache (`~/.npm/_npx/*/node_modules/playwright`), or a global install.
  If missing: `npx playwright install chromium` (and make the `playwright` package resolvable,
  e.g. `npm i -D playwright` or run once via `npx playwright`).
- **Pillow** (Python) for the square/resize step — auto-installed on first run if absent.

## Steps

1. **Make sure the game is running** at a known URL. Add query params if the game needs them
   (e.g. a test appName). Portrait game → use a portrait viewport.
2. **Write a config** (`icon.config.json` or `.cjs`) with the game-specific bits (schema below).
   The two functions run *in the page*: `ready` (when is the game initialized?) and `clip`
   (pose the subject / hide HUD, then return the crop rectangle in CSS px).
3. **Run the harness**:
   ```bash
   node <skill>/scripts/shoot.cjs icon.config.json public/icon-512.png 512
   ```
   (outPath and size may also come from the config.)
4. **Preview** the result (Read the PNG, or send it to the user) and iterate on the config
   (subject pose, crop tightness, viewport).

## Config schema

| field | required | meaning |
|---|---|---|
| `url` | yes | Running game URL (include any query string). |
| `viewport` | yes | `{width,height}` in CSS px. Portrait for a portrait game. |
| `deviceScaleFactor` | no (3) | Higher = crisper source screenshot. |
| `ready` | no | Arrow-fn **source string**, run in-page, truthy when the game is initialized. |
| `clip` | yes | Arrow-fn **source string**, run in-page. May pose the subject and hide HUD; **must return** `{x,y,width,height}` in CSS px. |
| `out` | no | Output PNG path (arg 2 overrides). |
| `size` | no (512) | Final square size (arg 3 overrides). |
| `pad` | no (`#000000`) | Pad color if the crop isn't square. Use the game's bg color. |

### `window.canvasCssRect(canvas, gx, gy, halfInternalPx)` helper (injected)

Games render in an internal coordinate space that differs from CSS px (DPR / letterboxing).
The harness injects `window.canvasCssRect(...)` so your `clip` fn can crop around an element
whose position is in the game's internal coords: pass the internal `(gx,gy)` and a half-size
in internal px; it returns a square CSS-px rect ready to use as the clip.

## Example config (Phaser, portrait game)

One worked example, from one specific game (a ball-through-a-ring game): expose
the game in dev (`window.__game`), pose the subject "just before" a key moment,
hide the HUD, and crop a square around it. The harness doesn't know about any
of this — substitute your own scene/object names and pose logic.

```json
{
  "url": "http://localhost:5173/",
  "viewport": { "width": 420, "height": 820 },
  "deviceScaleFactor": 3,
  "pad": "#0a0a1c",
  "out": "public/icon-512.png",
  "size": 512,
  "ready": "() => { const s = window.__game?.scene?.scenes?.[0]; return !!(s && s.ring && s.ball); }",
  "clip": "() => { const s = window.__game.scene.scenes[0]; const r = s.ring; s.ball.setPosition(r.x, r.y - r.holeRadius*0.95); for (const k of ['hintText','scoreText','bestText']) s[k]?.setVisible(false); return window.canvasCssRect(s.game.canvas, r.x, r.y - r.holeRadius*0.5, r.holeRadius + 130); }"
}
```

- `window.__game` here is a dev-only handle the game exposes (e.g. `if (import.meta.env.DEV) window.__game = game`). Any way to reach the scene/objects works.
- The `clip` fn does three things: **pose** (`setPosition`), **hide HUD** (`setVisible(false)`),
  and **return the crop** via `canvasCssRect`. Cropping a mid-screen element naturally excludes
  a top/bottom HUD anyway.

## Tips

- **Pose the "just before" moment**, not mid-overlap — e.g. a ball just above a gate reads as
  "about to score" and looks more dynamic than dead-center overlap.
- **Hide HUD/score/hint text** so the icon is clean; or crop tightly enough to exclude it.
- **Tighten/loosen the crop** by changing the half-size passed to `canvasCssRect` (or the
  returned rect). Leave a little margin around the subject.
- **Non-square crops** are letterboxed to a square on `pad` (use the game bg color) before
  resizing, so the subject stays centered and uncropped.
- **Ready condition matters**: a full page reload after code edits may need a moment; the
  harness waits on `ready` (up to 20s) before posing.

## Reusable vs game-specific (the split this skill encodes)

- **Reusable (this skill provides)**: Playwright resolution/launch, viewport + DPR, the
  `canvasCssRect` coord-mapping helper, `clip` screenshot, square-pad + resize to NxN, temp
  cleanup, error messages.
- **Game-specific (you supply in the config)**: the URL/query, the `ready` predicate, and the
  `clip` function (how to reach the scene, pose the subject, hide HUD, choose the crop).

## Limitations

- The game must be reachable at a local URL and expose enough (a dev handle, DOM, or globals)
  for the `clip` fn to pose/measure the subject. If it exposes nothing, you can still crop a
  static region by returning a fixed rect from `clip` (no posing).
- Real-time/physics games: pose the subject deterministically inside `clip` (set positions,
  pause if possible) rather than trying to time a live frame.
