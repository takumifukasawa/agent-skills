---
name: game-store-assets
description: >-
  Generate store-listing images for a web/canvas game by driving it in headless
  Chromium: a promo FEATURE GRAPHIC (default 1024x500) and phone/tablet
  SCREENSHOTS at the required store sizes, from the real in-game render. Use when
  the user asks to "make store images / store assets / Play Store screenshots /
  feature graphic / ストア画像 / スクショ(スクリーンショット)一式 / フィーチャーグラフィック",
  or to capture many gameplay screenshots to choose from. Works for
  Phaser/PixiJS/Three.js/plain-canvas games served locally. Sibling of
  `game-icon-from-screenshot` (that one makes the square app icon). Not for
  hand-drawn/from-scratch promo art.
compatibility: >-
  Requires Playwright + Chromium (headless is fine, but keep the capture
  viewport at a size the game actually plays at -- e.g. 1080x1920 -- and use
  `superSample` for AA instead of enlarging it, or a large canvas can stall
  the headless render/physics loop) and Pillow (Python), plus a `.ttf` font
  file for the feature graphic title. The game must already be running at a
  local dev-server URL. For `live` autopilot capture specifically, a WebGL
  bloom/postFX pipeline can additionally stall physics under headless even at
  a reasonable viewport -- use `pose-capture.cjs` instead in that case (see
  SKILL body).
---

# Game store assets from the running game

Produce faithful store images by capturing the real running game (not mockups).
The reusable harness is in `scripts/`; you supply small GAME-SPECIFIC config
(URL, ready check, how to pose/hide/drive the game, title text).

Two deliverables:
1. **Screenshots** (`scripts/screenshots.cjs`) — batches at exact store sizes.
2. **Feature graphic** (`scripts/feature_graphic.py`) — 1024x500 promo banner.

For store size requirements + presets read `references/play-store-sizes.md`.
(The base Playwright/canvas technique is shared with `game-icon-from-screenshot`.)

## Prerequisites

- Game running at a local URL (`npm run dev` → e.g. `http://localhost:5173`).
- **Playwright + Chromium** (auto-resolved from project `node_modules`, the npx
  cache, or global; else `npx playwright install chromium`).
- **Pillow** (`python3 -m pip install Pillow`) for resize/compose.
- A bundled font file for the feature graphic title (a `.ttf`; variable fonts
  supported via weight axes).

## Anti-aliasing: supersample, don't upscale

Capturing at the exact output size looks jaggy. Capture **dense then downscale**:
set `superSample` (deviceScaleFactor) = 2 and let the harness downscale to the
target size. IMPORTANT: do the density with `superSample`, **not** by using a
much larger viewport — a very large canvas can stall the headless render/physics
loop (the game freezes at spawn). Keep the viewport at a size where the game
actually plays (e.g. 1080x1920) and raise `superSample` instead.

## Screenshots

`node scripts/screenshots.cjs <config.(cjs|json)> [outDir]`

- **Static posed shots** (`shots`): each opens a fresh page, runs your `pose`
  fn (set score, position the subject, show the result overlay…), optionally
  hides the HUD, and captures. Good for ready/result screens.
- **Live gameplay** (`live`): starts play, runs your `keepAlive` fn every poll
  to keep the game alive/driving (an "autopilot"), and captures frames when your
  `pick` fn says the frame is good. Live frames show real motion/trails — this
  is how you get "actually playing" shots, not static ones. Capture **many** and
  let the user choose.

`fn` fields run IN THE PAGE. In a `.cjs` config write real functions (they're
serialized with `.toString()`, so keep them self-contained — no Node closures).
In a `.json` config write arrow-function source strings.

### Config (screenshots)

`url`, `ready`, `target {width,height}` (output size + viewport), `superSample`
(2), `waitFontsReady` (true), `hudHide` (fn), `shots [{name, pose?, hideHud?,
settleMs?}]`, `live {count, start, keepAlive, pick, hideHud, buildMs, pollMs,
settleMs, maxTries, prefix}`, `outDir`.

### Example (Phaser, portrait; dev exposes `window.__game`)

One worked example, from one specific game (a ball-through-a-ring game). Swap
in your own scene/object names, pose logic, and drive/pick conditions.

```cjs
// phone.shots.cjs
const G = () => window.__game.scene.scenes[0]; // in-page helper (inlined below)
module.exports = {
  url: "http://localhost:5173/",
  target: { width: 1080, height: 1920 },
  superSample: 2,
  ready: () => !!(window.__game?.scene?.scenes?.[0]?.ring),
  hudHide: () => { const s = window.__game.scene.scenes[0]; ["scoreText","bestText","hintText"].forEach(k => s[k]?.setVisible(false)); },
  shots: [
    { name: "ready", hideHud: false },
    { name: "result", hideHud: true, settleMs: 1200, pose: () => {
        const s = window.__game.scene.scenes[0];
        s.matter.world.pause(); s.score = 18; s.highScore = 18; s.lastRunNewRecord = true; s.showResult();
    } },
  ],
  live: {
    count: 24, prefix: "play", pollMs: 45, buildMs: 700,
    startTap: true,            // trusted tap to begin (Phaser ignores synthetic events)
    hideHud: false,            // keep the score visible in gameplay shots
    start: () => { window.__game.scene.scenes[0].goals = 6; }, // extra setup (e.g. enable variety)
    keepAlive: () => { const s = window.__game.scene.scenes[0]; if (s.state === "playing" && s.ball.y > s.scale.height * 0.5) s.ball.setVelocityY(-13 * s.scaleFactor); },
    pick: () => { const s = window.__game.scene.scenes[0]; return s.state === "playing" && s.ball.body.velocity.y > 4; },
  },
};
```

Tablet set: same config with `target: { width: 1440, height: 2560 }`. (You can
also upscale chosen phone shots to 1440x2560 to keep the exact chosen frames.)

### Posed animation (`scripts/pose-capture.cjs`) — for postFX/bloom games

`live` mode assumes the game's physics runs in headless. **It often doesn't.** A
WebGL **bloom / postFX** pipeline can STALL the headless render+physics loop, so
the subject freezes at its spawn (velocity is set but position never
integrates) — every "live" frame comes out identical, ball stuck at the top.
This bit hard on a real project. Symptom to check first: probe the subject's
`y` across two polls; if it never changes, physics is stalled.

When that happens, don't fight it — **drive the subject by hand**:

`node scripts/pose-capture.cjs <config.(cjs|json)> [outDir]`

Each shot pauses the world, then animates the subject along a path YOU define
over N frames (with the trail emitter running), so a real moving-ball trail
builds up regardless of physics. Config per shot: `{name, setup, poseAt(t),
steps, stepMs}` — `setup` runs once (spawn the gate, `state="playing"`,
`world.pause()`, `trail.start()`, hide the ready-hint, set a score), `poseAt(t)`
positions the subject for `t` in `[0..1]`.

Two things make the posed trail read as a real fall:
- **Bezier path, not a straight lerp.** A straight path makes a stiff, ruler-
  straight trail; a quadratic bezier with a sideways control-point offset gives
  the natural curved arc the game actually produces. Vary the curve per shot.
- **Ease-in `t*t`** (accelerating) reads as gravity.
- **Moderate emitter boost** for the shot only (higher `frequency` + longer
  `lifespan`), because hand-animation is slower than a real fast fall and the
  default emitter leaves too few particles. Boost MODERATELY — an over-juiced
  trail looks nothing like the game.

## Feature graphic

`python3 scripts/feature_graphic.py <config.json>`

Composes: dark bg → real game **screenshot** (left, neon frame) → **title** +
**tagline** (right, bundled font) → accent line. Rendered at `superSample`x then
downscaled.

Config: `out`, `size` ([1024,500]), `superSample` (2), `screenshot`, `font`,
`title`, `tagline`, `bg`, `frameColor`, `titleColor`, `titleGlow`, `tagColor`,
`accentColor`, `titleWeight`, `tagWeight`.

Example values below are from one specific game — substitute your own title,
tagline, colors, and font.

```json
{
  "out": "store-assets/feature-graphic-1024x500.png",
  "screenshot": "store-assets/feature-shot.png",
  "font": "public/fonts/Orbitron.ttf",
  "title": "HOP HOOPS", "tagline": "ONE-TAP NEON HOOPS",
  "bg": "#0a0a1c", "frameColor": "#27e6ff",
  "titleColor": "#ffffff", "titleGlow": "#27e6ff", "tagColor": "#8fffe0", "accentColor": "#27e6ff",
  "titleWeight": 800, "tagWeight": 600
}
```

## Lessons (do these)

- **Real screenshot, not hand-drawn.** A hand-drawn game motif drifts from the
  real look. Represent the game with an actual screenshot.
- **Feature graphic = clean game frame.** Hide the HUD (score/best); show a
  dynamic moment (e.g. the ball falling toward a gate, with its trail).
- **Effects must match the game.** If you temporarily boost an effect for a shot
  (e.g. lengthen a particle trail's lifespan), keep it subtle — an over-juiced
  trail that the game never shows looks wrong. Prefer capturing a fast-motion
  frame over faking it.
- **Shoot where the game plays.** Use a normal viewport (physics runs) + high
  `superSample` for AA. Don't use a giant viewport.
- **Bloom/postFX freezes headless physics → pose by hand.** If the game uses a
  WebGL bloom/postFX pass, `live` autopilot will likely capture a frozen ball at
  spawn. Use `pose-capture.cjs` (deterministic animation) instead. Probe the
  subject `y` first to confirm the stall.
- **PIL compositing: use a transparent layer + `alpha_composite`.** When adding
  a soft glow / semi-transparent trail in the feature graphic, draw it onto a
  separate transparent RGBA layer and `Image.alpha_composite` it. Drawing an
  RGBA fill straight onto the base and then `convert("RGB")` DROPS the alpha —
  the "soft" element renders at full opacity. (Same trap bites the icon skill.)
- **Capture many, let the user pick.** Live-capture 20–30 varied frames.

## Reusable vs game-specific

- **Reusable (this skill)**: Playwright resolve/launch, supersampled capture +
  exact-size resize, static + live + posed-animation capture loops, HUD-hide
  hook plumbing, feature-graphic composition, store-size presets.
- **Game-specific (your config)**: URL, ready check, pose/hud/keepAlive/pick and
  posed-animation `setup`/`poseAt` fns, title/tagline/colors/font.
