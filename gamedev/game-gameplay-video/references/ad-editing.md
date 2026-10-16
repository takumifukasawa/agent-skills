# Editing takes into an ad (`scripts/ad-edit.cjs`)

Read this when building the cut list, laying music under cuts, or when the user says the
cut "doesn't feel on the beat".

## The loop

1. Capture one long take per stage/scene (a full level, ~60 s) with `timeline` on. With
   music in the game, also capture each stage once with the **sound effects muted** (a
   capture-only `?mute=` switch in the game) — those are the music beds.
2. Look at the takes cheaply before cutting: a contact sheet per take
   (`ffmpeg -i take.mp4 -vf "fps=1/5,scale=200:-1,tile=6x2" -frames:v 1 sheet.png`) plus the
   timeline's pass / clear times. Visual layers usually build up over a level, so the
   last third is often the richest part — but also the busiest.
3. Write the cut list, render, **open it for the user**, iterate. Keep every variant's list
   in its own JSON (`ad-a.json`, `ad-a-s090.json`, …) so any version can be re-rendered.

## Fields

| field | meaning |
|---|---|
| `out`, `size` | output name and size (takes are scaled with lanczos — capture at 2x for crisp edges) |
| `speed` | playback speed; a cut may override with its own `speed`. AE "time stretch 90%" = speed 1/0.9 |
| `fade` | crossfade between cuts (s); 0 = hard cuts |
| `fadeIn` / `fadeOut` | picture + sound at the start / end |
| `audioFadeIn` / `audioFadeOut` | sound only — e.g. a hard visual end with a 0.8 s sound tail, a 0.3 s sound fade-in |
| `loudness` | LUFS target (−14) |
| `cuts[]` | `{take, from, to}` in take seconds (+ `speed`, `passAt`) |
| `music` | a bed: `{take, from, snap, gates, speedRange, passAt, passKey, align}` |
| `takesDir`, `outDir` | where takes are (relative to the list) / where the ad goes |

## A music bed under cuts

Each stage of a music game usually has its own song; a montage with each cut's own sound
changes song every 4 s. Instead lay one song under all cuts:

- `music.take` — a sound-effects-free take of one stage. `from` snaps to its nearest beat.
- `snap: 4` — every cut becomes a whole number of 4-beat bars (in output time), so cuts
  change on bar lines.
- `gates: true` — each cut gets **its own speed** within `speedRange` (closest to `speed`),
  chosen so its gate spacing becomes a whole number of bed beats (else half beats, else
  triplets), and its start shifted so a pass sits on that grid.
- `passAt: 2` — the first pass comes 2 beats into the cut (also per cut).
- `align: <cut index>` — that cut must be the bed's own take at speed 1; the bed is placed
  so they coincide there. Use it for the ending: the stage's clear and the song's
  cadence then land together.

Verify sync by measurement, not by ear alone: audio onsets of the render
(spectral flux on a mono wav) against the gate flashes in the picture (frame-to-frame jump
of `signalstats` YAVG in a crop around the subject). Both within ~1 frame = in sync.

## What made it feel "on" or "off" (from user review)

- **Passing a gate right on the cut** read as wrong even when it was exactly on the beat:
  the viewer never sees it approach. Put the first pass a couple of beats into the cut
  (`passAt`), so the cut shows approach → pass on the beat.
- **Half-beat / triplet passes** are on a grid, but a pass that alternates on/off the beat
  (e.g. spacing 3.5 beats) reads as out of sync. Prefer whole-beat spacing; widen
  `speedRange` rather than accept a half-beat grid for a long single cut.
- **No pass sound** makes sync harder to perceive: with a music-only bed the viewer only
  hears the song's own accents. If it must be felt, either keep the game's sound (a single
  take at speed 1 is natively in sync) or overlay the pass sound at the pass times.
- **Speeding the whole take up also speeds the song.** Either keep speed 1 for a single
  take, or use a music bed at speed 1 under sped-up cuts.
- **Too-busy first seconds.** The opening cut should show the control plainly (one clear
  fall + one clear climb into a single gate) and change within ~4 s (the first cut length
  is a hook decision; the user may want ≤ 5 s).
- **Avoid shots where the subject's trail is a tight wiggle** — it reads as nervous;
  pick spans whose trajectory is a few broad arcs (the trajectory plot shows this).
- **Fades**: hard cuts on bar lines read better than crossfades for a beat-driven montage;
  a hard visual end with a short sound fade-out sounded cleanest.

## Worked example: a 4:5 montage of a hold-to-rise music game

From one project (a one-button music game: one song per stage, gates on beats).
Adapt the numbers, don't copy them.

- Capture: 1600×2000 (2× of 800×1000), headless, sound on, timeline with
  `{state, score, beat}`; stages 1–5 once with sound (`L1..L5`) and once with effects
  muted (`M1..M5`, also used as picture sources since their timelines are exact).
- Montage (24 s): stage 1 (4 s, one V-shaped climb through a single gate on beat 2),
  stage 3 (4 s), stage 5's tunnel (4 s), stage 2 (4 s), stage 4's finale + clear (8 s).
  Bed: stage 4's song (60 bpm → beat 1 s, bar 4 s). Per-cut speeds came out 1.07 / 1.0 /
  1.0 / 1.25 / 1.0. The last cut is the bed's own take at speed 1 (`align`), so the clear
  hits the song's cadence. Sound fades in 0.3 s and out 0.8 s; picture ends hard.
- Single-take version: a recording-only level script of stage 1 (see
  `recording-scripts.md`), speed 1 with the game's own sound — natively in sync, 29 s.
