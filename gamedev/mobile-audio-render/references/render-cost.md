# three.js render cost on low-end phones

Heavy rendering does more than drop frames. On Android it can delay the audio thread too, and the sound crackles (see `webaudio-crackle.md`).

## With post-processing (EffectComposer), turn the canvas antialias off

- **Symptom:** no visible difference, but extra GPU work and memory.
- **Cause:** `new THREE.WebGLRenderer({antialias: true})` puts MSAA on the canvas (the screen buffer). With EffectComposer (bloom etc.), the scene is drawn into the composer's `WebGLRenderTarget`. The canvas only receives one full-screen quad at the end. Canvas MSAA smooths a quad that has no edges, every frame, for nothing.
- **Fix:** `antialias: false` when post-processing is on. Edge smoothing then comes from the render target's `samples` (MSAA). Use `antialias: true` only when drawing straight to the canvas without post-processing. Check your renderer wrapper's default: many default to `true`.

## Expensive settings, and switches to compare them on the device

Make these switchable by URL query (e.g. `?msaa=0&ratio=1&bloomscale=0.5`) so they can be compared on the phone without a rebuild.

| Setting | Why it is heavy | Look when lowered |
|---|---|---|
| Pixel ratio (`setPixelRatio`) | Pixels drawn grow with the square of the ratio. Using a dense phone's ratio as is (2.75 etc.) is heavy | Capping at about 1.5 is barely visible; 1 is slightly soft |
| Render target MSAA (`samples`) | 2x to 4x MSAA on a half-float target costs a lot of memory traffic | Thin lines get slightly jagged edges |
| Bloom buffer resolution | Bright-pass and blur cost scale with resolution | At half, thin lights flicker more |
| `preserveDrawingBuffer: true` | Keeps the screen buffer every frame instead of discarding it; heavy on mobile GPUs | Leave it at the default false. If you need a screenshot, read right after drawing |

Measure whether it helped rather than judging by eye: replay the same input automatically and compare frame time, or the audio thread's missed deadlines (`scripts/trace.mjs`). Leave time between runs; a hot phone makes later runs look worse.
