---
name: game-gameplay-video
description: Capture real GAMEPLAY VIDEO of a running web/canvas game and turn it into a finished AD VIDEO (e.g. Meta / TikTok, 800x1000 or 1080x1920, 15-30 s, with sound). Records in Chromium (canvas.captureStream + MediaRecorder -> ffmpeg) with the game's WebAudio sound and a per-frame timeline, then cuts a cut list (JSON) into the ad: speed changes, fades, a music bed, cuts and gate passes landing on the beat, loudness normalised. Also covers making the footage reproducible (seeded, fixed-step), a human-looking autopilot that always clears, and recording-only level scripts. Use when the user asks to "capture gameplay video / record the game / make an ad video / 広告動画を作りたい / 広告用の動画 / プレイ動画を撮る / ゲームプレイをキャプチャ / mp4 で録画 / カットをつないで / 音楽に合わせて / 倍速にして / 人間っぽい自動操作 / 録画用のステージ", or wants footage to edit later (After Effects etc.). Works for Phaser/PixiJS/Three.js/plain-canvas games served locally. Sibling of `game-store-assets` (store screenshots + feature graphic) and `game-icon-from-screenshot` (square app icon).
compatibility: Node + Playwright (Chromium), ffmpeg on PATH; python3 + matplotlib for the trajectory plot. The game runs on a local dev server and exposes a dev handle (e.g. window.__game).
---

# Gameplay video and ad video from the running game

Two layers:

1. **Capture** the real running game to mp4 (`scripts/capture-video.cjs`) — picture,
   optionally its sound, and a per-frame timeline of what happened when.
2. **Edit** takes into the ad (`scripts/ad-edit.cjs`) from a cut list — or hand the raw
   clips to an NLE.

Between them sit the things that make the footage good enough for an ad: a
**reproducible** run, a **human-looking** autopilot that always clears, and (optionally)
a **recording-only level script** so the stage shows its gimmicks on a good rhythm.

```bash
npm run dev                                                     # the game, e.g. http://localhost:5173
node ${CLAUDE_SKILL_DIR}/scripts/capture-video.cjs game.capture.cjs 40 auto out take1
node ${CLAUDE_SKILL_DIR}/scripts/ad-edit.cjs ads/a.json out                  # cut list -> out/<list.out>.mp4
node ${CLAUDE_SKILL_DIR}/scripts/probe-trajectory.cjs probe.cjs 30 t.json    # tune the autopilot (headless, fast)
python3 ${CLAUDE_SKILL_DIR}/scripts/plot-trajectory.py t.png t.json
```

Open each render for the user (`open <file>` on macOS) as soon as it is written —
reviewing is the loop, so don't make them paste paths.

## 1. Capture (`scripts/capture-video.cjs`)

`canvas.captureStream(fps)` records the canvas **backing buffer** — not the window, not the
DOM. So:

- **No cursor / no HUD for free.** DOM overlays (score, buttons, dev finger cursor) are
  never in the video. A clean picture is usually what an ad wants; add text in the edit.
- **Capture resolution is independent of the window.** Raise the engine's internal render
  size to the ad size — or 2x it and let the edit downscale (supersampling beats the
  engine's antialias) — while the window stays small (see **Decoupling**).
- **Sound** (`audio: true`): every connection into an AudioContext's speakers is teed into
  a `MediaStreamDestination` and recorded by its own MediaRecorder; ffmpeg muxes them. Unlock
  the game's AudioContext in `beforeRecord` (Chromium runs with
  `--autoplay-policy=no-user-gesture-required`).
- **Timeline** (`timeline: () => ({state, score, beat, ...})`): sampled every frame in the
  page, written as `<name>.timeline.json` (`{t, ...}` on every change). This is what you cut
  from: when each gate was passed, when the level cleared, where every music beat is.
  Expose the game's music beat as an integer `beat` if it has one.
- **Headed or headless.** Headed is the safe default. Headless works and doesn't steal focus
  (`headless: true` adds GPU flags) — but verify a short take's frame count first (see Gotchas).

### Config

| field | meaning |
|---|---|
| `url` (req.) | running game URL, with the game's own capture query (seed, fixed step, script…) |
| `ready` (req.) | in-page `() => boolean` |
| `target` | capture size `{width,height}` (1080×1920 default; e.g. 1600×2000 for a 800×1000 ad) |
| `displayHeight` | on-screen canvas height (760) |
| `canvasSelector` | the game canvas (`canvas`) |
| `setRenderSize` / `setDisplaySize` | in-page; raise the engine's render size / shrink CSS + re-map input |
| `beforeRecord` | in-page, once before recording (unlock audio, hide a debug overlay…) |
| `autopilot` | in-page, once right after recording starts, in `auto` mode |
| `audio`, `timeline`, `headless`, `settle` (ms) | see above |
| `bitrate`, `fps`, `seconds`, `outDir`, `name` | overrides (CLI: `config seconds mode outDir name`) |

Functions are serialized (`toString`), so keep them self-contained. Outputs:
`<name>.mp4` (H.264/AAC, for editing), `<name>.webm` (+ `.audio.webm`, the masters — keep
them), `<name>.timeline.json`.

### Decoupling capture resolution from the window

Per engine (the window stays small; `captureStream` records the backing buffer):

- **Phaser**: `g.scale.resize(w, h)` then **restart the scene** (games cache a
  `scaleFactor` in `create()`); for manual play also `g.canvas.style.width/height` +
  `g.scale.refresh()` so taps map correctly.
- **Three.js**: `renderer.setPixelRatio(w / cssW)` then the game's own resize with the CSS
  size (so the camera aspect and postFX buffers follow). A portrait-capped game
  (letterboxed to a max aspect) must have the cap lifted for a wider ad aspect like 4:5.
- **PixiJS**: `renderer.resize(w, h)` + canvas style.

### Modes

- `manual` — you play the window by hand (headed only). Most authentic.
- `auto` — the config's `autopilot` drives. For ads, make it *look* human and never miss —
  see `references/autopilot.md`.

## 2. Make the run reproducible (worth it before tuning anything)

Tuning a cut, an autopilot or a level means re-recording many times; if every take plays
differently you can never converge. Add two capture-only switches to the game (query
params; the shipped game ignores them):

- **seed** — the gameplay randomness (obstacle layout *and* the autopilot's choices) from a
  seeded PRNG instead of `Math.random`. Leave purely visual randomness alone.
- **fixed step** — simulate in fixed 1/60 s steps with an accumulator (render once per
  frame, run 0..n steps). Real frame times jitter; a fixed step makes the simulation
  identical whatever the frame rate (60 Hz, 120 Hz, a dropped frame under a heavy capture).

Then the same URL is the same run — in the browser for the user to check, in the probe,
and in the capture. Pick a good run by **seed** (sweep a few with the probe and choose by
measurable criteria), not by re-rolling captures. Details and gotchas:
`references/recording-scripts.md`.

## 3. Edit (`scripts/ad-edit.cjs`)

A cut list (JSON) → one mp4 at the ad size (lanczos downscale), CRF 17, AAC, loudness
normalised (default −14 LUFS, what social feeds normalise to). Main fields:

```json
{
  "out": "ad-a", "size": [800, 1000], "speed": 1.111,
  "fade": 0, "fadeOut": 0, "audioFadeIn": 0.3, "audioFadeOut": 0.8,
  "cuts": [{"take": "stage1", "from": 20.3, "to": 24.6, "passAt": 2}, {"take": "stage3", "from": 37.2, "to": 41.2}],
  "music": {"take": "music4", "snap": 4, "gates": true, "speedRange": [1, 1.25], "passAt": 2, "align": 4}
}
```

- `speed` is playback speed. After Effects' "time stretch 85%" is speed **1/0.85**. Sound
  keeps its pitch (`atempo`). Sped up → written at 60 fps (frames dropped); slowed → at
  60·speed fps (no repeated frames).
- `music` lays ONE continuous bed (a take recorded with the game's sound effects muted)
  under hard cuts — the montage then has one song instead of a new song per cut.
  `snap` trims cuts to whole bars; `gates` gives each cut its own speed and start so its
  gate passes land on the bed's beats; `passAt` puts the first pass N beats after the cut;
  `align` lines the bed up with a cut of the same take (its clear and the song's cadence
  coincide).

What made cuts feel "on" or "off", and the music-bed recipe: `references/ad-editing.md`.

## 4. Recording-only level scripts (optional)

When the stage itself is too even for an ad, add a capture-only layout: holes/obstacles
placed by **beat** with explicit heights and gimmicks, plus invisible **waypoints** that
only the autopilot steers through (an extra stroke without extra obstacles). Pace it so a
new gimmick arrives every ~5 s and the first is reached by ~5 s. See
`references/recording-scripts.md`.

## Gotchas / what didn't work (keep the "why")

- **One MediaRecorder with video + audio tracks stalled** right after the webm header
  (tens of bytes, ffmpeg "EBML header parsing failed"). Two recorders started in the same
  tick, muxed by ffmpeg, work. A trailing "Error parsing Opus packet header" from ffmpeg is
  the last partial chunk and harmless.
- **Ctrl-C left a webm but no mp4.** Playwright's own SIGINT/SIGTERM/SIGHUP handlers close
  the browser and exit first — launch with `handleSIG*: false`, and use a *persistent*
  `process.on("SIGINT")` (a `once` listener removes itself and Node then dies on the
  second signal).
- **Headless froze the subject at spawn** on one bloom-heavy Phaser game; on a Three.js
  game headless was fine once the GPU was enabled (`--use-angle=metal|d3d11|vulkan
  --enable-gpu --ignore-gpu-blocklist`). Count frames of a short take (`ffprobe
  -count_frames`) — ~60/s means it's real.
- **Oversized window.** Don't scale the window up; raise the internal render size.
- **Resize without restart → wrong gameplay scale** (cached `scaleFactor`).
- **H.264 rejected odd dimensions** — `scale=trunc(iw/2)*2:trunc(ih/2)*2`.
- **Polling the game from Node every 100 ms** gave pass times ±0.1 s — useless for cutting
  on the beat. Sample in the page every frame (`timeline`).
- **Starting the autopilot at a different moment gave a different run** with the same
  seed (it changes how the shared PRNG is consumed against the layout). Start it the same
  way in the probe and the capture, and re-probe after every script/autopilot change.
- **A black rectangle took over the screen mid-take, at capture resolution only.** Point
  sprites divided by view depth (`size / -mv.z`, streak tails `xy / w`); a particle
  crossing the camera plane produced an infinite/NaN-sized *square* sprite, and the bloom's
  temporal history then kept the NaN forever. Fix both ends: skip points at the camera
  plane and clamp sizes in the shaders; make the bloom chain replace non-finite values
  (`isnan`/`isinf` → 0, clamp) in its bright pass and when mixing history. Diagnose by
  reading back each post-process buffer (`readRenderTargetPixels`) and counting
  `0x7c00`-exponent half-floats.
- **Losing a take on early stop** — chunks stream to disk every second; the webm master
  survives an interrupted transcode:
  ```bash
  ffmpeg -y -i take.webm -i take.audio.webm -r 60 -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
    -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -movflags +faststart take.mp4
  ```

## Reusable vs game-specific

- **Reusable (this skill)**: the capture harness (sound tee, timeline, resize decoupling,
  stop handling, transcode), the cut-list editor (speed, fades, music bed, beat-locked
  gates, loudness), the trajectory probe/plot, and the methods in `references/`.
- **Game-specific (your config / your game)**: URL and query, `ready`, resize hooks, the
  timeline sampler, the autopilot itself, the seed / fixed-step switches, level scripts.
