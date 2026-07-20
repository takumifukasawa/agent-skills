---
name: game-gameplay-video
description: >-
  Capture real GAMEPLAY VIDEO of a running web/canvas game as an ad-ready mp4,
  by recording it in headed Chromium (canvas.captureStream + MediaRecorder ->
  ffmpeg). Use when the user asks to "capture gameplay video / record the game /
  make an ad video / 広告動画用の映像 / プレイ動画を撮る / ゲームプレイをキャプチャ /
  mp4 で録画", or wants footage to edit later (After Effects etc.). Records the
  real in-game render (physics + WebGL bloom/postFX), at an arbitrary ad
  resolution/aspect, with NO cursor, and an autopilot OR hand-played ("manual")
  run. Works for Phaser/PixiJS/Three.js/plain-canvas games served locally.
  Sibling of `game-store-assets` (store screenshots + feature graphic) and
  `game-icon-from-screenshot` (square app icon). Not for editing/compositing the
  video itself (that's the user's NLE) -- this only produces the raw clip.
compatibility: >-
  Requires a HEADED (non-headless) Chromium via Playwright, so a display (or
  Xvfb) must be available -- headless is not safe here, since a WebGL
  bloom/postFX pass can stall the physics loop while headless. Also needs
  ffmpeg on PATH, and the game already running at a local dev-server URL.
---

# Gameplay video from the running game

Produce an ad-ready mp4 of the real running game. The reusable harness is
`scripts/capture-video.cjs`; you supply a small GAME-SPECIFIC config (URL, ready
check, how to resize the engine's internal render, and how to drive it).

```bash
# terminal 1: run the game
npm run dev                                   # -> http://localhost:5173

# terminal 2: capture
node <skill>/scripts/capture-video.cjs game.capture.cjs 300 manual
#                                        ^config        ^sec ^mode(auto|manual)
```

Outputs to `gameplay-video/`: `gameplay-<ts>.mp4` (H.264/yuv420p, for the NLE)
and `gameplay-<ts>.webm` (the high-bitrate master; keep it).

## Why record this way (the technique)

`canvas.captureStream(fps)` records the canvas **backing buffer** — not the
window, not the CSS size, not the DOM. Three consequences the harness leans on:

- **No cursor / no overlay for free.** A finger/cursor indicator drawn as a DOM
  element is never in the video. (If a game wants a hand icon in the ad, composite
  it in the NLE.)
- **Capture resolution is independent of the window.** You can render the game
  internally at 1080×1920 (or any ad size) while the on-screen window stays small
  enough to fit a laptop. The harness does this: it bumps the engine's internal
  render size up to `target`, then shrinks the on-screen canvas via CSS. See
  **Decoupling** below.
- **Headed, not headless.** A WebGL bloom/postFX pass commonly stalls the
  *headless* physics loop (the subject freezes at spawn), so live capture must be
  headed. (This is the same stall documented in `game-store-assets`.)

## Prerequisites

- Game running at a local URL, exposing enough to script it (a dev handle like
  `window.__game`, or DOM/globals) for `ready` / resize / autopilot.
- **Playwright + Chromium** (auto-resolved from project `node_modules`, the npx
  cache, or global; else `npx playwright install chromium`).
- **ffmpeg** on PATH.

## Two modes

- **`manual`** — no autopilot; a small window opens and **you play it by hand**.
  Most authentic; a skilled run makes the best ad. Stop with Ctrl-C when you have
  a good take.
- **`auto`** — a hands-off autopilot (your config's `autopilot`) drives the game.
  Convenient B-roll, but writing an autopilot that plays *by the real rules* and
  still scores well is hard (see `references/autopilot.md`). Prefer manual when
  authenticity matters.

## Decoupling capture resolution from the window

In headed Chromium the window matches the viewport, so a viewport bigger than the
screen makes an oversized, unusable window. Instead, keep the window small and
raise the **engine's internal render size** — `captureStream` records that.

Your config supplies two in-page functions (engine-specific):

- `setRenderSize({w,h})` — raise the internal render (backing buffer) to `w×h`.
- `setDisplaySize({w,h})` — shrink the on-screen canvas CSS to `w×h` **and re-map
  input coordinates** (so taps still land correctly — essential for `manual`).

**Phaser** (mirrors the game's own resize path):

```js
setRenderSize: ({ w, h }) => {
  const g = window.__game;
  g.scale.resize(w, h);            // internal render + canvas backing -> w x h
  g.scene.scenes[0].scene.restart(); // recompute the scene's scaleFactor for the new size
},
setDisplaySize: ({ w, h }) => {
  const g = window.__game;
  g.canvas.style.width = w + "px";
  g.canvas.style.height = h + "px";
  g.scale.refresh();               // re-map pointer coords to the CSS-scaled canvas
},
```

- The **scene restart** matters: many games compute a `scaleFactor = height/refHeight`
  once in `create()` and never update it on resize. Without a restart the gameplay
  scale (speeds, sizes) would be stale for the new render size.
- Other engines: Three.js → `renderer.setSize(w, h, false)` (the `false` keeps the
  CSS size) + camera aspect; PixiJS → `renderer.resize(w, h)` + set canvas style.
  Omit `setRenderSize` entirely to just capture at the native window size.

## Config schema

| field | required | meaning |
|---|---|---|
| `url` | yes | Running game URL. |
| `ready` | yes | In-page `() => boolean`; true once initialized (and after a resize+restart). |
| `target` | no (1080×1920) | Capture/ad resolution `{width,height}`. Any aspect (`CAP_W/H` idea). |
| `displayHeight` | no (760) | On-screen preview height px; width follows `target` aspect. |
| `canvasSelector` | no (`#wrapper canvas`) | CSS selector for the game canvas (or set `canvas` fn). |
| `setRenderSize` | no | In-page `({w,h})`: raise the engine's internal render size. |
| `setDisplaySize` | no | In-page `({w,h})`: shrink CSS + re-map input. |
| `autopilot` | no | In-page fn, called ONCE in `auto` (e.g. sets `window.__ap = setInterval(...)`; cleared on stop). Can read a skill-tier env (e.g. `CAP_SKILL=pro/normal/noob`) to make "good" vs "blooper" reels — see `references/autopilot.md` Rule #4. |
| `bitrate`,`fps`,`seconds`,`outDir` | no | 40 Mbps / 60 / 35s / `gameplay-video`. |

`fn` fields: real functions in a `.cjs` config (serialized with `.toString()` —
keep them self-contained, no Node closures), or arrow-function source strings in
a `.json` config.

## Example config (Phaser, portrait; dev exposes `window.__game`)

One worked example, from one specific game (a one-tap "ball through a gate"
game). The harness itself doesn't know or care about any of this — swap in
whatever your engine's actual resize API and scene/object names are.

```cjs
// game.capture.cjs  ->  node .../capture-video.cjs game.capture.cjs 300 manual
module.exports = {
  url: "http://localhost:5173/",
  target: { width: 1080, height: 1920 },     // 9:16 ad; or 1600x2000 for 4:5, etc.
  displayHeight: 760,
  ready: () => !!(window.__game?.scene?.scenes?.[0]?.ball),
  setRenderSize: ({ w, h }) => { const g = window.__game; g.scale.resize(w, h); g.scene.scenes[0].scene.restart(); },
  setDisplaySize: ({ w, h }) => { const g = window.__game; g.canvas.style.width = w+"px"; g.canvas.style.height = h+"px"; g.scale.refresh(); },
  // auto-mode driver (optional; omit if you only ever play manually):
  autopilot: () => {
    let last = 0;
    window.__ap = setInterval(() => {
      const s = window.__game.scene.scenes[0];
      if (s.state === "ready" || s.state === "gameover") { s.onTap(); return; }
      // ... game-specific "when to hop" logic (see references/autopilot.md) ...
    }, 25);
  },
};
```

## Gotchas / what didn't work (preserve these — they cost hours)

- **Ctrl-C left a webm but no mp4.** Playwright installs its OWN SIGINT/SIGTERM/
  SIGHUP handlers that close the browser and `process.exit` — firing *before* our
  transcode. Fix: launch with `handleSIGINT/handleSIGTERM/handleSIGHUP: false` and
  handle stop yourself. (Symptom: `stopping...` prints, then the process dies with
  no `transcoding`/`done`.)
- **`process.once("SIGINT", …)` also dies.** A `once` listener removes itself when
  it fires, leaving no handler, so Node reverts to default terminate-on-SIGINT.
  Use a **persistent** `process.on("SIGINT", …)`.
- **Headless capture froze the subject at spawn.** WebGL bloom/postFX stalls the
  headless physics loop. Must run headed.
- **Oversized window.** A viewport taller than the screen makes an unusable window.
  Don't scale the window up — raise the *internal render size* and keep the window
  small (the Decoupling section). `captureStream` records the backing buffer, not
  the window.
- **Resize without restart → wrong gameplay scale.** Games cache `scaleFactor` at
  `create()` time; bump the render size *then restart the scene* so it recomputes.
- **Autopilot that "steered" horizontally looked fake.** Forcing the ball's
  horizontal direction toward the target made it reverse in mid-air on every tap —
  a "reflection" the real game never does. If the game only lets the player control
  one axis, the autopilot must too. See `references/autopilot.md`.
- **H.264 rejected odd dimensions.** A backing buffer can be odd (e.g. 1215); add
  `-vf scale=trunc(iw/2)*2:trunc(ih/2)*2`.
- **Losing the take on early stop.** Stream each 1s MediaRecorder chunk to disk as
  it arrives (don't buffer in page memory until the end), so Ctrl-C / closing the
  window keeps everything up to ~1s before the stop. The webm master survives even
  if the mp4 step is interrupted — you can always re-transcode the webm.

## Reusable vs game-specific (the split this skill encodes)

- **Reusable (this skill)**: Playwright resolve + headed launch with signal
  handling disabled, capture-resolution/window decoupling, `captureStream` +
  MediaRecorder streamed-to-disk, unified graceful stop (Ctrl-C / window-close /
  time-cap), webm→mp4 transcode (even-dim fix, CFR, faststart, `-an`), auto/manual
  plumbing.
- **Game-specific (your config)**: URL, `ready`, canvas selector, `setRenderSize`/
  `setDisplaySize` (engine resize API), and the `autopilot` (or nothing, for manual).

## Recover a stray webm (no mp4)

If a webm ever exists without its mp4 (interrupted transcode), re-transcode it —
the master is untouched:

```bash
cd gameplay-video
for f in *.webm; do [ -f "${f%.webm}.mp4" ] || ffmpeg -y -i "$f" -r 60 \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -preset slow -crf 16 \
  -pix_fmt yuv420p -movflags +faststart -an "${f%.webm}.mp4"; done
```
