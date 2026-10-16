# Web Audio crackle on Android Chrome: facts and numbers

Measured on a Pixel 5 (Android Chrome, 48 kHz) with one web game: a synth soundtrack built
note by note, a convolver reverb, and three.js with bloom.

## Finished notes left connected slow the audio thread down over time

- **Symptom:** fine on PC and iPhone, crackle only in Android Chrome. It gets worse the longer you play, and at worst goes silent for a few seconds. Volume, reverb, rendering and buffer size changes made it smaller but never gone.
- **Cause:** each note builds an `OscillatorNode` / `AudioBufferSourceNode` with a `GainNode` envelope, a `BiquadFilterNode` and a send to the reverb, all wired into shared buses. After the source stopped, the nodes behind it stayed connected. Chrome keeps walking silent nodes in every render quantum until JS GC collects them. Dozens are added per second, so the render time creeps up until one quantum (128 frames, 2.7 ms at 48 kHz) misses its deadline. More free memory means later GC and more nodes piled up. Fast devices still meet the deadline, so it never shows there.
- **Fix:** on the source's `ended`, disconnect every node built for that note.

  ```ts
  function releaseWhenDone(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
      source.addEventListener("ended", () => {
          source.disconnect();
          for (const n of nodes) n.disconnect();
      }, {once: true});
  }
  // one note: osc -> filter -> env -> (dry -> master, send -> reverb)
  osc.start(t);
  osc.stop(t + decay + 0.05);
  releaseWhenDone(osc, filter, env, dry, send);
  ```

  For a note with two sources stopping at the same time, release the shared nodes on one source's `ended`. Voices faded out at a chord change get the same treatment.
- **Numbers (one ~50 s stage):**
  - Missed deadlines went from 5/s at the start to 290/s near the end, 8097 in the stage.
  - After releasing the nodes: 511.
  - Median render time per quantum: 2.5 ms to 1.1 ms.
- **If it comes back:** the number of voices sounding at once is steady but render time grows with play time. Suspect this first.

## Output buffer (`latencyHint`)

- With `new AudioContext()` (default `"interactive"`), Android Chrome renders 128 frames at a time (`baseLatency` about 3 ms). One busy moment, such as many notes at once, is enough to drop out.
- `new AudioContext({latencyHint: "balanced"})` on the Pixel 5:
  - `baseLatency` 20 ms; `outputLatency` 24 ms to 56 ms.
  - Missed deadlines 511 to 41, together with the fix above.
  - It is honoured; check `ctx.baseLatency`.
- `"playback"` should be larger still, but on the Pixel 5 it dropped out more: same conditions, `balanced` 0 vs `playback` 24. Bigger is not always better; count on the device.
- Cost: about 30 ms more delay. Notes scheduled ahead on the beat and sounds at a pass moment did not feel late. If an instant tap response matters, listen before deciding.

## Do not send the same automation every frame

`param.setTargetAtTime(target, now, tc)` every frame queues an event even when the target has not changed (5 params at 60 fps is about 300 events/s). It was not the deciding cause, but it is waste. Send only when the target or time constant changes, e.g. skip changes within 2%.

## Recording on the device (what the trace shows)

`scripts/trace.mjs` records the categories `webaudio,audio,toplevel` over CDP; `scripts/analyze.py` summarises.

- `Glitch!` and `SyncReader::Read timed out`: a missed deadline. One miss logs one timeout and several glitch lines, so count the timeouts.
- `RealtimeAudioDestinationHandler::Render`: time to produce one quantum. Over 2.7 ms at 128 frames means a gap.
- `args.frames` / `playout_delay`: the buffer actually in use.
- `disabled-by-default-webaudio.audionode` (per-node events) makes the render several times slower and causes crackle by itself. Leave it off.

Order for isolating on the device:

1. **Sound-only page** (`scripts/audio-test.html`: one sine, then a chord, then a chord with reverb).
   - Crackle here: the device or browser.
   - Clean: the game.
2. **The game with rendering off and an autoplay** (a black screen is not playable by hand). If it improves, rendering is part of the load.
3. **Still there:** record a trace. Leave time between runs; a hot phone makes later runs look worse.

## A quiet mix buzzes on small speakers

- A different symptom from crackle. The whole mix was quiet: -27 LUFS, where phone games and social video sit around -14 to -16. On Android you had to turn the volume far up. At that level, sharp downbeat peaks and low notes made the small speaker buzz. iPhones have more speaker headroom and hide it.
- **Fix:** master chain of high-pass (about 110 Hz; small speakers cannot play below it), then compressor, then makeup gain, then limiter (`DynamicsCompressorNode` with ratio 20, attack 2 ms). Record and check with `ffmpeg -i rec.webm -af ebur128=peak=true -f null -` for about -15 LUFS with peaks under -1 dBFS.

## Pops that are not underruns

If the trace shows 0 missed deadlines and you still hear it, the sound design is the cause.

- **Underruns** are irregular and grow with load.
- **Sound-design pops** land on a particular sound or moment (a note onset, a chord change, a downbeat), and they are in a PC recording too.

| What you hear | Cause | Fix |
|---|---|---|
| Click at a note's start or stop | Started or stopped at a non-zero gain; attack too short (4 to 6 ms) | Ramp from 0.0001; stop after the gain has fallen; attack 10 to 15 ms even for sharp sounds. Test pages too: a hard stop clicks on every device and misleads the test |
| Pop at a chord or timbre change | `cancelScheduledValues(t)` then `setValueAtTime(param.value, t)`. `param.value` is the value at the last rendered quantum, not at `t`, so cutting a ramp midway can jump (unverified candidate) | `cancelAndHoldAtTime(t)` where available; otherwise switch while the voice is quiet |
| Low notes (kick, bass) sound torn | Compressor `attack` too fast (3 ms) bends the waveform within one low cycle | About 10 ms for a compressor that low notes pass through |
| Gritty low tail after the kick | Kick sent into a reverb whose impulse is built from noise | Do not send low drums to the reverb; only higher sounds |
| "Tick tick" on every beat of a quiet song | Very bright noise (above 7 kHz) with a few-ms attack (a hat); in a quiet mix it reads as crackle | Remove it or make it much softer |
| Buzz on downbeats at high volume | The mix is quiet, so the user turns the phone up past the speaker's limit | The master chain in the section above |
| Slight distortion only on the loudest moments | Master limiter attack too fast (2 ms) (unverified candidate) | Slower attack, or lower the peaks before it |
| Dropout at a moment that starts many notes (a clear fanfare) | That quantum alone misses its deadline: an underrun, not design | Fewer notes, spread them tens of ms apart, a larger output buffer |

Method: record the master output while playing (`MediaStreamAudioDestinationNode` + `MediaRecorder`), zoom in on the waveform for jumps, and match the moment against a log of the notes started. If it happens only on the phone, record inside the phone the same way and compare.
