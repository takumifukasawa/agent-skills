# Reproducible runs and recording-only level scripts

Read this before tuning footage over many takes, or when the user wants the stage itself to
look different "for the recording only".

## Reproducible: seed + fixed step

Add capture-only query switches to the game (it's game code, but harmless: without the
query the game is unchanged).

- `?seed=N` — one seeded PRNG (e.g. mulberry32) for **gameplay** randomness: obstacle
  layout and the autopilot's choices. Keep visual-only randomness (particles) on
  `Math.random` — it doesn't change the run, and threading it through gains nothing.
- `?fixedstep=1` — `acc += dt; while (acc >= 1/60) { update(1/60, last); acc -= 1/60 }`,
  rendering only on the last step. The run is then identical at any frame rate.

Gotchas:

- **The same seed played differently in the probe and in the capture** when the
  autopilot was started differently (via the URL at boot vs. a call after the recorder
  started): both share one PRNG with the layout, so the draw order changed. Start it the
  same way in both, or give the autopilot its own seeded stream.
- **Any change to the layout or the autopilot reshuffles every seed.** A seed chosen
  yesterday is not "the good run" after today's tweak — re-sweep.
- **Choose seeds by criteria, not by eye.** Sweep 8–16 seeds with
  `scripts/probe-trajectory.cjs` (parallel, ~30 s each) and filter by what the user asked
  for, e.g.: no miss; ≥ 1 press between gate 1 and 2, made at or below gate 2's height;
  ≥ 2 presses before the first gimmick; peak height before the tunnel < 1.0. Say which
  criteria no seed met instead of silently relaxing them.

## Recording-only level script

When the real stage is too uniform for an ad (same spacing, same heights), lay out a
capture-only level:

```ts
// ?script=<name> — holes on beats of the stage's music
type ScriptHole = {beat: number; y: number; opening?: number;
                   sway?: {amp, period, phase?}; breathe?: {depth, beats}};
type AdScript = {holes: ScriptHole[]; waypoints?: {beat: number; y: number}[];
                 escalation?: Partial<...>};   // e.g. bring a visual layer in sooner
```

- Place by **beat**, so every pass stays on the music (x = firstHoleX + beat × unitsPerBeat).
- The level length = the script length; the game's progress-driven visuals (layers that
  build up over a level) then compress into the short level — override a layer's start in
  the script if it arrives too late for the ad.
- **Waypoints**: invisible targets the autopilot steers through before the next real gate.
  They add a stroke (a press, a hop) without adding gates — more gates in the opening made
  the control harder to read. The autopilot's safety check must keep guarding the *real*
  gate while it heads for a waypoint (a waypoint one beat before a gate caused a miss
  until it did).

### Pacing for a 15–30 s ad

- First ~5 s: the control at a glance — a high gate, let go and fall, hold and climb into
  the next. **Two gates**, not three (three read as busy). One extra small stroke between
  them via a waypoint, made near the next gate's height (pressing far above it read as a
  surprising jolt; too low read as falling too long).
- Then a new gimmick roughly every 8 beats (~5 s), first one reached at ~5 s. Measure how
  far ahead the camera shows: project a gate's position to NDC at several distances — in
  one game a gate entered the frame ~4.5 s before the subject reached it, so "visible at
  3.5 s, reached at 5 s" was impossible without moving the camera; the user chose "reach
  at 5 s" (it is then in view from ~0.5 s).
- Vary the rhythm: a few off-grid waypoints (e.g. beat 9, 13.5, 22.5) broke a metronomic
  feel; keep gates themselves on beats.
- Heights flow with momentum: after a climb through a gate, the next gimmick should start
  at or below the crest (stairs going *down*), not demand a reversal — a stair going up
  right after a low gate produced a hard drop before it.
- Gimmick speed: slow and subtle reads better on video. A ring that pulsed every 2 beats
  (depth 45%) was "too fast, too much"; every 8 beats at 25% was right. A swaying ring at
  4 s per sway was "too fast"; 8 s with a slightly larger swing was right.

## Worked example: a stage script (90 bpm, beat 0.67 s)

```ts
holes: [
  {beat: 0, y: 2.0}, {beat: 4, y: -0.5},                      // intro: fall, climb
  {beat: 8, y: 1.6}, {beat: 10, y: 0.6}, {beat: 12, y: -0.4},  // stairs going down
  {beat: 16, y: -0.4, breathe: {depth: 0.25, beats: 8}}, ...   // slow pulsing rings
  ...tunnel(24, 6, -1.0, 1.6),                                 // 6 small rings a beat apart, on an arc
  {beat: 32, y: 0.6, sway: {amp: 1.2, period: 8}}, ...         // slow sway
  {beat: 40, y: 0},                                            // finale
],
waypoints: [{beat: 2.6, y: 0.1}, {beat: 6, y: 0.4}, {beat: 9, y: 1.4}, {beat: 13.5, y: 0.3}, {beat: 22.5, y: 0.4}],
escalation: {layerB: {unlockAt: 14, fadeIn: 8}},             // a layer ~5 s sooner
```

The ad then is one take from 0.33 s before the first gate to 2 s after the clear (~29 s),
at speed 1 with the game's own sound.
