---
name: game-store-assets
description: >-
  Make a game's Google Play store listing: the promo FEATURE GRAPHIC (1024x500)
  and phone/tablet SCREENSHOTS captured from the real game running in headless
  Chromium, plus the listing TEXT (short / full description). Use when the user
  asks to "make store images / store assets / Play Store screenshots / feature
  graphic / store description / ストア画像 / スクショ(スクリーンショット)一式 /
  フィーチャーグラフィック / 簡単な説明 / 詳しい説明 / Play Console の説明文", or to
  capture many gameplay screenshots to choose from. Also builds a PICKER page
  (an Artifact with checkboxes, per-section comments and copy buttons) so the
  user ticks the store set -- screenshots, feature graphic, listing text, and
  app icon candidates too ("選定用の artifact", "チェックして選びたい",
  "アイコンも一緒に選びたい"). Works for Phaser/PixiJS/Three.js/plain-canvas games
  served locally. Sibling of `game-icon-from-screenshot` (that one makes the
  square app icon; its candidates can go in this picker). Not for
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

Three deliverables:
1. **Screenshots** (`scripts/screenshots.cjs`) — batches at exact store sizes.
2. **Feature graphic** — 1024x500 promo banner: either a clean full-bleed game
   frame (`screenshots.cjs` with a landscape `target`) or a frame + title
   composition (`scripts/feature_graphic.py`). Ask which; default to full-bleed
   for mood-driven games.
3. **Listing text** — short + full description: read
   `references/listing-text.md` (limits, tone, what not to claim, the
   "AI-generated assets" form question).

For store size requirements + presets read `references/play-store-sizes.md`.

## Workflow: many candidates → the user picks

The user chooses; you supply variety and make choosing easy.

1. Capture **many** frames per stage/level/theme (e.g. 5 stages × 8–10).
   Use the game's progression to vary them too (early / mid / late upgrade
   stages): early frames look empty, late ones can bury the subject.
2. Shortlist ~15 with variety (each stage; pass/burst moments; rich vs calm
   backgrounds). Look at them yourself first with `scripts/contact_sheet.py`
   (numbered). Then let the user choose — in the **picker page** (below) when
   Artifacts are available, which is what users asked for once they saw it;
   otherwise send the numbered sheet image and take numbers.
3. Recommend a set, with a reason (colour / stage variety across the set, not
   repeating the same moment). Re-shoot what the user's comments ask for
   ("被写体をもう少し中央に") and add the retakes to the picker as another group
   sharing the same pick key.
4. Copy the final set into one folder **in upload order** (`1-…png`, `2-…`),
   and record the decision (files, chosen text verbatim, rejected options and
   why, how they were captured) in the project's docs. Keep the generated
   images out of git unless the project already tracks store assets.

`python3 ${CLAUDE_SKILL_DIR}/scripts/contact_sheet.py sheet.png a.png b.png … --cols 5 --thumb 300`
(The base Playwright/canvas technique is shared with `game-icon-from-screenshot`.)

## Picker page (Artifact): the user ticks the set

`python3 ${CLAUDE_SKILL_DIR}/scripts/build_picker.py picker.json picker.html`, then publish
`picker.html` with the Artifact tool and `capabilities: {"db": {}}` (load the
`artifact-design` / `artifact-capabilities` skills first, as the Artifact tool
requires). The spec format is in the header of `scripts/build_picker.py`.

What the page does (all from the spec, nothing game-specific in the template):
- **Image groups** — `mode: "multi"` (screenshots: tick order = upload order,
  ← → to reorder, `max`) or `"single"` (feature graphic, **app icon**). Several
  groups may share one `pick` key (first candidates + retakes = one choice).
  "おすすめ" chips from `rec`, ⤢ zoom, a tray at the top showing the chosen
  set, and an "おすすめで埋める" button.
- **Text groups** — radio options with the submission text, a translation
  under it, a character count against `limit`, and a **copy button** at each
  option's top right (copies the submission text only).
- **Comments as instructions** — a comment box per group (`noteKey`) plus one
  overall "全体への指示". Users write instructions there ("2 案目の最後の行は
  いらない", a Japanese draft to edit and translate) and say "保存しました".
- **choices** — small yes/no radios (title text on the feature graphic or not).
- Everything is saved to one db document (`doc`, default `picks/current`); read
  it with `ArtifactData` (`action: "get", collection: "picks", doc_id: "current"`
  for the default). Pick / choice / note keys share that document, so the
  builder refuses colliding keys and duplicate item ids
  whenever the user says they saved. Act on every non-empty note, then tell
  them what changed. To change the page, edit the spec and rebuild, then
  publish the same file path (same URL; the saved picks survive because the
  ids stay the same). After the first publish, do one read of `picks` to
  confirm the store answers.

App icons use the same page: an icon-only picker (one `"single"` group,
`aspect: "1/1"`, `thumbWidth: 512`) or icons as one more group next to the
store images. Make the candidates with `game-icon-from-screenshot`.

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

`node ${CLAUDE_SKILL_DIR}/scripts/screenshots.cjs <config.(cjs|json)> [outDir]`

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

- **Timed** (`timed`): for games that can play themselves (an `?autoplay=`
  query, a demo/attract mode). Opens each url in turn and shoots every
  `intervalMs` — the easiest way to get many real frames per stage.

### Config (screenshots)

`url`, `ready`, `target {width,height}` (output size + viewport), `viewport`
(capture size when it should differ; frames are cropped to the target aspect,
`cropY` anchors the band), `superSample` (2), `launchArgs`, `executablePath`,
`css` (injected; simplest HUD hide for DOM HUDs), `routes [{match, replace:
[[from,to]…]}]` (capture-only patches of served source), `waitFontsReady`
(true), `hudHide` (fn), `shots [{name, pose?, hideHud?, settleMs?}]`, `live
{count, start, keepAlive, pick, hideHud, buildMs, pollMs, settleMs, maxTries,
prefix}`, `timed {urls: [{prefix, url}], count, warmupMs, intervalMs}`,
`outDir`. Full field docs are in the header of `scripts/screenshots.cjs`.

Playwright must be resolvable: run from a dir with it in `node_modules`, or
`NODE_PATH=<dir>/node_modules node ${CLAUDE_SKILL_DIR}/scripts/screenshots.cjs …` (CommonJS). If
the installed browser is older than the package, the script falls back to the
newest Chromium in the ms-playwright cache.

### Example (WebGL / three.js, self-playing, DOM HUD)

```json
{
  "target": {"width": 1080, "height": 1920},
  "viewport": {"width": 540, "height": 960},
  "superSample": 2,
  "launchArgs": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  "css": "body > div:not(#app) { display: none !important; }",
  "timed": {
    "urls": [{"prefix": "stage1", "url": "http://localhost:5173/?level=1&autoplay=1"},
             {"prefix": "stage2", "url": "http://localhost:5173/?level=2&autoplay=1"}],
    "count": 10, "warmupMs": 3000, "intervalMs": 3500
  }
}
```

Full-bleed 1024x500 banner of a **portrait-only** game (it letterboxes wide
viewports, and its world ends past the portrait view): lift the aspect cap for
the capture only, capture a squarer view at 2x, crop the band.

```json
{
  "target": {"width": 1024, "height": 500},
  "viewport": {"width": 820, "height": 640},
  "superSample": 2,
  "launchArgs": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  "css": "body > div:not(#app) { display: none !important; }",
  "routes": [{"match": "GameConfig", "replace": [["maxAspect: 0.6", "maxAspect: 0"]]}],
  "timed": {"urls": [{"prefix": "banner", "url": "http://localhost:5173/?level=1&autoplay=1"}],
            "count": 6, "warmupMs": 3000, "intervalMs": 5000}
}
```

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

`node ${CLAUDE_SKILL_DIR}/scripts/pose-capture.cjs <config.(cjs|json)> [outDir]`

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

`python3 ${CLAUDE_SKILL_DIR}/scripts/feature_graphic.py <config.json>`

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
  "title": "MY GAME", "tagline": "ONE-TAP ARCADE",
  "bg": "#0a0a1c", "frameColor": "#27e6ff",
  "titleColor": "#ffffff", "titleGlow": "#27e6ff", "tagColor": "#8fffe0", "accentColor": "#27e6ff",
  "titleWeight": 800, "tagWeight": 600
}
```

## Lessons (do these)

- **WebGL in headless needs SwiftShader.** Without
  `--use-angle=swiftshader --enable-unsafe-swiftshader` a three.js canvas is
  black. It is slow: open **one page at a time** (5 parallel WebGL pages timed
  out the screenshot call).
- **Hiding the HUD with CSS: don't hide the canvas's parent.** A blanket
  `div { visibility: hidden }` hid the canvas too (every frame identical, ~8 KB).
  Probe the DOM once and exclude the canvas wrapper by id. Identical tiny files
  = nothing rendered.
- **Portrait-only games and landscape banners.** A max-aspect cap letterboxes a
  wide viewport (a narrow column in the middle). Lift it per capture via
  `routes`; the game files stay untouched. If the widened view then shows a hard
  edge where the world/backdrop ends, capture a squarer `viewport` at 2x and
  crop the band instead of widening further.
- **One 9:16 1080x1920 set fits phone + 7" + 10" tablet.** Don't produce a
  smaller size (e.g. 963x1712) just because a form shows it as an example —
  check each tab's px range against `references/play-store-sizes.md`.
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
- **Feature graphic from a portrait game: crop a band, don't widen the field.**
  Lifting the aspect cap gave a very wide play field where the subject came
  out tiny. Cropping a 1024:500 band of the field's full width around the
  subject from normal portrait play (no HUD in the band) read much better.
- **"Subject in the centre" needs an in-page wait + pause.** Checking the
  subject's position from Node and then calling `page.screenshot` misses: a
  software-GL screenshot takes long enough for the subject to move away. Wait
  in the page (`requestAnimationFrame` loop until it is within ~6% of the
  centre), pause the scene there (Phaser `scene.pause()`; rendering continues),
  compute the clip, shoot, then resume. Steer the autopilot toward targets near
  the centre so it gets there.
- **Check the game's own coordinates once before blaming them.** When a crop
  looks off, print the subject / play-field / canvas rect from the page (one probe)
  before rewriting the maths; here the coordinates were right and timing was
  the bug.

## Reusable vs game-specific

- **Reusable (this skill)**: Playwright resolve/launch (with cached-browser
  fallback), supersampled capture + crop/resize to the exact size, static /
  live / timed / posed-animation capture loops, CSS + fn HUD hiding,
  capture-only source patches, contact sheets for picking, the picker page
  (template + builder), feature-graphic composition, store-size presets,
  listing-text guidance.
- **Game-specific (your config)**: URL, ready check, pose/hud/keepAlive/pick and
  posed-animation `setup`/`poseAt` fns, title/tagline/colors/font, the picker
  spec (which candidates, labels, recommendations, text options).
