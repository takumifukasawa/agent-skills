---
name: mobile-audio-render
description: >-
  Find and fix Web Audio crackle, pops, clicks, distortion, dropouts or low volume on real
  phones (above all Android Chrome), and heavy rendering (three.js resolution, antialias,
  post-processing) that drags audio down with it. Tells an audio-thread underrun from a
  sound-design pop, checks the code in order, and records the audio thread on the phone
  over USB (adb + CDP tracing) to count missed deadlines instead of guessing. Also a review
  checklist when writing Web Audio code or setting up a three.js renderer for low-end phones.
  Use when the user says "音がぶつぶつする / たまにブツっとなる / ぷちっと鳴る / 音が割れる /
  ビリつく / 音が途切れる / 音が小さい / Android だけ音がおかしい / 低スペック端末で重い /
  かくつく / 解像度を下げたい / antialias どうする", or "audio crackles on Android",
  "audio glitches", "game is slow on low-end phones".
compatibility: Web game using the Web Audio API (any engine). Device tracing needs an Android phone with USB debugging, adb (brew install android-platform-tools), Node 22+ (global WebSocket) and python3. Loudness checks need ffmpeg.
---

# Audio crackle and render cost on real phones

Often fine on PC and iPhone, broken only in Android Chrome. **Do not make the user try
URL after URL of guessed settings on the phone**; that took many round trips and mostly
missed. First tell which kind of problem it is (step 1). If that does not settle it, plug
the phone in over USB and record the audio thread (step 3). One recording answers it.

- Facts, numbers and why: `references/webaudio-crackle.md` (audio), `references/render-cost.md` (three.js)
- Tools in `scripts/`:
  - `trace.mjs`: records the audio thread in the phone's Chrome
  - `analyze.py`: summarises the recording
  - `audio-test.html`: a sound-only test page with no graphics

## 1. Tell the kind apart

| What it sounds like | Kind | Next |
|---|---|---|
| Irregular crackle that grows with play time or busy moments; at worst seconds of silence | Underrun: the audio thread misses its deadline (128 frames = 2.7 ms at 48 kHz) | 2, then 3 |
| A pop or click at a fixed moment: a note onset, the downbeat, a chord change. It is also in a PC recording | Sound design | 4 |
| Buzz on low notes and downbeats only when the volume is turned up; iPhone sounds fine | Mix too quiet overall (small-speaker limit) | 4, last row |
| Frames stutter and the sound goes with them | Rendering too heavy (it starves the audio thread too) | 5 |

## 2. Underrun: check the code first, most likely first

1. **Finished notes left connected.** Per-note `GainNode` / `BiquadFilterNode` / send gains stay wired to the master or reverb bus after the source stops. Chrome keeps processing them until JS GC, so the render time grows with play time. `disconnect()` all of them on the source's `ended`. This was the big one (missed deadlines 8097 to 511 in one stage).
2. **`latencyHint`.** The default `"interactive"` renders 128 frames (about 3 ms) at a time, with no slack. `new AudioContext({latencyHint: "balanced"})` gave 20 ms (511 to 41). `"playback"` is not always better; on one phone it got worse. Compare counts on the device. Check what you got with `ctx.baseLatency`. Sound arrives about 30 ms later; if instant tap feedback matters, listen too.
3. **Automation sent every frame with the same value** (`setTargetAtTime` in the update loop). Send only when the target changes.
4. **Many notes started at the same instant** (a clear fanfare). Fewer notes, or spread them a few tens of ms apart.
5. **Circuits that never sound** (a noise source or reverb at gain 0). Do not build them.
6. **Rendering too heavy** (step 5). Add a no-render switch (e.g. `?render=0`), run with an autoplay, and compare.

## 3. Underrun: record on the phone

1. On the phone: Developer options, then USB debugging on. Use a data cable; if the Mac shows nothing, the cable is probably charge-only (`ioreg -p IOUSB`).
2. Once `adb devices` lists the phone: `adb forward tcp:9222 localabstract:chrome_devtools_remote`, and open Chrome on the phone.
3. Record and summarise:

   ```sh
   node ${CLAUDE_SKILL_DIR}/scripts/trace.mjs "http://<PC LAN IP>:<port>/?<conditions>&v=$RANDOM" out.json 60
   python3 ${CLAUDE_SKILL_DIR}/scripts/analyze.py out.json
   ```

   - `TRACE_UNTIL='<JS expression true at the clear>'` stops early.
   - `TRACE_TAP=x,y` moves the starting tap.
   - Expose the context as `window.__audioContext` in dev builds to get its latency printed.
   - If nobody can play the game while it records, pair it with the game's autoplay.
4. Reading it:
   - **Missed per second** rising over time: suspect 2.1. A spike at one moment: look at what starts there (2.4).
   - **render dur**: over 2.7 ms at 128 frames means a gap.
   - **args** (`frames`): the buffer size Chrome actually uses.
5. Comparing:
   - Make each condition a URL query (`?latency=` `?reverb=` `?render=0` `?msaa=` `?ratio=`) so A/B needs no rebuild.
   - Phones slow down when hot. Leave about 45 s between runs and swap the order to confirm.
   - Never add `disabled-by-default-webaudio.audionode`: it is heavy enough to cause the crackle.
   - Never use `adb shell input tap`: it presses whatever app is in front. `trace.mjs` taps the page through CDP.
6. To rule the phone or browser in or out, open `scripts/audio-test.html` on the phone (sound only, no graphics). Fade in and out when switching sounds, or the switch itself clicks.

## 4. Sound design: quick table

When missed deadlines are 0 but you still hear it. Details: the "pops that are not underruns" section in `references/webaudio-crackle.md`.

| What you hear | Look at |
|---|---|
| Click at note start or stop | Ramps start from 0.0001; attack at least 10 to 15 ms; stop only after the gain has fallen |
| Pop at a chord or timbre change | `cancelScheduledValues` followed by `setValueAtTime(param.value, t)` jumping (use `cancelAndHoldAtTime`) |
| Low notes sound torn | Compressor `attack` too fast; about 10 ms |
| Gritty low tail after the kick | Low drums sent into a noise-built convolver reverb |
| "Tick tick" on every beat in a quiet song | Very bright noise hats with an attack of a few ms |
| Buzz when the volume is turned up | Overall loudness. Record and run `ffmpeg -i rec.webm -af ebur128=peak=true -f null -`. Aim for about -15 LUFS with peaks under -1 dBFS. Master chain: high-pass about 110 Hz, then compressor, then makeup gain, then limiter |

Method: record the master output while playing (`MediaStreamAudioDestinationNode` + `MediaRecorder`). Zoom in on the waveform for jumps. Line the moment up with a log of the notes started then.

## 5. Rendering too heavy (three.js)

1. **With post-processing (EffectComposer), set the canvas `antialias: false`.** The scene is drawn into the composer's render target, so canvas MSAA only smooths one full-screen quad.
2. **Cap the pixel ratio** (`setPixelRatio`) around 1.5. Pixels drawn grow with its square.
3. Let a URL query lower the **render target MSAA** (`samples`) and the **bloom resolution**. Half-resolution bloom makes thin lights flicker more.
4. Do not set `preserveDrawingBuffer: true`.
5. Measure, do not judge by eye: replay the same input automatically and compare frame time or missed audio deadlines (step 3).

## 6. After the fix

Write the device numbers (before and after counts, phone, conditions) into the project's docs, so the next person does not redo the search. New game-independent findings go into `references/` here.
