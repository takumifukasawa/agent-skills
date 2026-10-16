# Fallback: hand-composed icon from the game's REAL elements

The default flow (screenshot + crop) is best when a game frame already reads as a
strong icon. But sometimes it doesn't:

- The subject is small relative to the frame; cropping tight enough to fill the
  icon either clips it or pulls in dead background.
- Store icons want a **bold, centered, high-contrast** subject that fills the
  tile. A faithful gameplay crop can look timid at 512px / on a home screen.

In that case, **hand-compose the icon in PIL from the game's real element
geometry** — same shapes, same colors, same glow as the game, just arranged and
scaled to fill the icon frame. This is NOT "draw an icon from scratch" (which
drifts from the real look): reproduce the exact shapes the game draws (pulled
from the game's own config: sizes, colors, glow ratios), sized for the tile.

## PIL gotchas that bit us (general — apply to any game's elements)

- **Alpha compositing.** Draw every soft/semi-transparent element (glow halos,
  a motion trail, particles) onto its OWN transparent RGBA layer, then
  `Image.alpha_composite` it onto the base. If you draw an RGBA fill straight
  onto the base image and later `convert("RGB")`, the alpha is DROPPED and the
  element renders at full opacity (a glow becomes a hard blob). Compose in
  RGBA throughout; convert to RGB only at the very end (or keep RGBA if the
  tile allows it).

- **Supersample for AA.** Render at 2–3× the target size, then `resize(...,
  Image.LANCZOS)` down. PIL's circle/line drawing is jaggy at 1×; downsampling
  from 2–3× gives clean edges.

- **Glow = blurred copy.** For a neon/soft glow on any shape, draw the shape on
  a transparent layer, `GaussianBlur` it, composite it under the crisp shape.
  Layer 2–3 blurs of increasing radius / decreasing alpha for a bloom-like
  falloff.

## Subject framing (general)

- Fill the frame: the main subject should occupy most of the tile with a small
  margin, not float in a sea of background.
- Pose the moment that reads best for your game (often "just before" a key
  outcome — about to succeed/collide/score) rather than a static idle pose; it
  reads as more dynamic.
- If your subject has directional motion you want to show (a trail, comet
  tail, afterimage, speed lines), see the trail-shape notes below — the same
  compositing techniques apply regardless of what the moving object is.

### If the icon shows motion: trail shape

- A trail should read as a **monotonic arc** in the direction of travel — a
  single curved sweep, no apex/bounce. A parabola with a visible peak reads as
  "bouncing", which is misleading unless that's literally what's happening.
- Make it a **quadratic bezier** with a sideways control-point offset (not a
  straight line) so it curves the way real motion in your game actually
  curves (gravity, momentum, a curved path — whatever your game's physics
  produce).
- Taper it: elements shrink and fade toward the tail. Keep it light — it
  should support the subject, not compete with it.

## Worked example: a ball-through-a-ring game

The above came out of one specific game — a ball falling through a ring/gate,
with a particle trail behind it. Concretely: the icon reproduced the ring, rim
glow, ball, and trail using the game's real radii/colors/glow ratios, posed
the ball just above the ring opening ("about to score"), and rendered the
falling trail as a tapering quadratic-bezier arc. Swap in whatever your own
game's actual subject/motion is — the technique (real geometry, alpha
compositing, supersampling, bold centered framing) transfers directly; the
specific shapes don't.
