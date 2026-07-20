# Writing an auto-play autopilot (and why it's hard)

`auto` mode is convenient B-roll, but a bot that plays *by the real rules* and
still scores is genuinely hard. If authenticity matters, prefer `manual`.

## General principles (apply to any game/genre)

### Rule #1: only control what the player controls

The tempting cheat — drive an axis or state the player can't actually touch
(e.g. steering the subject sideways toward a target every tick) — makes the
bot perform better, but it looks FAKE: the subject moves in ways the real
physics/input never produces, and a viewer (or the client) will notice.

Enumerate the game's real input surface (one tap = one vertical impulse; arrow
keys = four directions; a drag = a continuous vector; ...) and give the
autopilot exactly that, nothing more. Everything else must emerge from the
real simulation. This makes scoring/success opportunistic rather than
guaranteed — accept a modest result, or fall back to a manual recording.

### Rule #2: use the game's real input path

Call the actual handler the game wires up for that input (a tap/click/key
handler, a scene method) rather than poking internal state (position,
velocity, score) directly. Going through the real handler gets you the real
state transitions (ready→playing, scoring, retry, telemetry hooks) for free,
and guarantees the bot can't do anything a real player couldn't.

### Rule #3: dial the skill on purpose (pro / normal / noob tiers)

For ads you often want more than one "quality" of run from the same bot: a
"pro" reel that performs well, and a "noob" blooper reel that fumbles.
Parameterize the autopilot on a skill level (e.g. an env var
`CAP_SKILL=pro|normal|noob`) and vary only **timing/error-rate** knobs — never
the input-surface rule (Rule #1) — so every tier stays legal and authentic.
Useful knobs, genre-independent:

- **reaction cooldown** (min ms between actions): lower = snappier.
- **tolerance window** (how close counts as "aligned"/"safe"): wider = more
  forgiving, narrower = more misses.
- **panic threshold** (how early the bot reacts to an imminent failure):
  lower = bails out earlier, dies less.
- **miss chance**: probability an action that SHOULD fire is dropped
  intentionally. 0 for pro; a healthy fraction (e.g. 0.4) makes a convincing
  "bad player" that fails a lot.

### Predictive beats reactive, when motion is predictable

If part of the game's motion is constant/deterministic (constant horizontal
speed, a fixed fall curve, a bounce rule), a reactive bot that only responds
to the CURRENT state will trail behind what a real skilled player does.
Instead, predict a few frames ahead (from the known constant/deterministic
part) and act just before the predicted moment, not after observing it. This
tends to roughly double a "pro" tier's success streak versus a purely reactive
version, at the cost of needing to model that predictable motion correctly.

### Bugs the autopilot exposes may be the game's, not the bot's

If the bot dies unfairly often in a way that feels like "no human could react
in time" (e.g. an obstacle spawns with no reaction distance), suspect the
game's spawn/difficulty logic before adding autopilot hacks to compensate.
Fixing it in the game (e.g. bias new obstacles away from the player + clamp a
minimum reaction distance) is the right layer; patching around it in the
autopilot just hides the bug and makes the recording less representative.

### Reality check

On a hard game, a rule-legal autopilot may perform modestly and fail often.
That's the game's real difficulty, not a bug in the bot. For an ad, a short
skilled **manual** run usually beats a robotic auto run — treat `auto` as a
fallback, not the default.

## Worked example: a one-tap "thread the gap" game

The rules above come from repeatedly getting this wrong on one specific game
genre: a Flappy-like one-tap game where a vertical tap is the only control,
horizontal speed is constant and only flips on wall contact, and the goal is
to pass through a gap in a gate. This section is that specific case study —
adapt it to your own game's mechanics rather than assuming it transfers
literally.

**The chattering-at-the-gate bug.** The number-one bug: the subject hovers at
the gate and never scores. Cause: tapping the instant it dips just below the
gate plane pushes it back up; it enters and exits the sensor on the SAME side,
so no crossing registers. Fix: commit to a single clean crossing — define a
zone around the gate plane and, while inside it, do not reverse the current
vertical velocity (if rising, let it rise through; if falling, let it fall
through):

```
inSpan  = |lateral offset from gap center| < safeCorridor      // aligned right now?
if (inSpan) {
  if (below the gate zone)      tap;         // climb up toward / through it
  else if (above the gate zone) /* fall */;  // let gravity carry it down through
  else /* inside the gate */    if (rising) tap;  // keep the current direction; don't reverse
} else {
  keep the subject hovering clear of the deadly parts (e.g. just below the rims),
  ready to pass when its own sweep lines it up
}
plus an emergency tap if it's about to fall off-screen
```

**Applying "use the real input path" here**: call the scene's actual tap
handler (e.g. `scene.onTap()`) rather than setting velocity directly, and
auto-retry on game-over by calling it again after the retry lock — this turns
the recording into one continuous reel across several runs.

**Applying "predictive beats reactive" here**: horizontal motion is constant
and wall-bounced, so you can predict when the subject's horizontal position
will line up with the gap and only rise through the gap right as that
happens, instead of reacting once already aligned. One subtlety that cost
real debugging time: hovering too close under an obstacle so that a single
tap's arc could launch the subject INTO it from below — hover deeper than one
tap's apex clears.

**Applying "bugs the autopilot exposes may be the game's" here**: gates
sometimes spawned right on top of the subject with no reaction time at all.
The culprit was a tall multi-ring gate — because it's centred vertically, it
can only gain reaction distance horizontally, so a purely-vertical spawn
placement left none. The fix was in the game's spawn logic (bias fresh gates
to the far side of the subject + clamp a minimum horizontal clearance), not
in the autopilot.
