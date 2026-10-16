#!/usr/bin/env node
/**
 * Ad-ready GAMEPLAY VIDEO capture for a web/canvas game.
 *
 * Records the REAL running game (real physics + WebGL postFX) to an mp4 via
 * Chromium -> canvas.captureStream -> MediaRecorder -> ffmpeg. The reusable
 * mechanics live here; you supply the small GAME-SPECIFIC config.
 *
 *   node capture-video.cjs <config.(cjs|json)> [seconds] [auto|manual] [outDir] [name]
 *
 * Why the shape it is (hard-won -- see SKILL.md "Gotchas"):
 *  - HEADED by default. A WebGL bloom/postFX pipeline can STALL a *headless*
 *    loop (the subject freezes at spawn). Headless does work once the GPU is
 *    enabled explicitly (`headless: true` adds GPU flags) -- verify the frame
 *    count of a short take before trusting it.
 *  - captureStream records ONLY the canvas backing buffer, so the on-screen
 *    cursor / any DOM overlay (HUD, buttons) is NEVER in the video.
 *  - Capture resolution is DECOUPLED from the window: the engine's INTERNAL
 *    render size goes up to `target` (ad resolution, or 2x it to downscale
 *    later) while the on-screen canvas stays small.
 *  - Sound (`audio: true`): every connection into an AudioContext's speakers is
 *    teed into a MediaStreamDestination and recorded by a SECOND MediaRecorder
 *    started in the same tick; ffmpeg muxes the two. One recorder with both
 *    tracks stalled right after its header (Chromium).
 *  - `timeline`: an in-page sampler logged EVERY FRAME (state changes, passes,
 *    music beats) with the take's own clock -- precise enough to cut on the
 *    beat. Polling from Node every 100 ms was not.
 *  - Playwright's OWN signal handlers are DISABLED, chunks stream to disk every
 *    second, and stop is unified (Ctrl-C / window close / time cap), so an early
 *    stop never loses the recording.
 *
 * ---- Config fields --------------------------------------------------------
 *   url            (string, required)  running game URL (add the game's own query:
 *                                        seed, fixed step, recording-only layout...)
 *   ready          (fn -> bool, req.)  in-page; true once the game is initialized
 *   target         ({width,height})    capture resolution (default 1080x1920)
 *   displayHeight  (number)            on-screen preview height px (default 760)
 *   canvasSelector (string)            CSS selector for the game canvas (default "canvas")
 *   setRenderSize  (fn({w,h}))         in-page; raise the ENGINE's internal render size
 *                                        (see SKILL.md per engine). Omit = native size.
 *   setDisplaySize (fn({w,h}))         in-page; shrink the on-screen canvas + re-map input
 *   beforeRecord   (fn)                in-page; once, after resizing, before recording
 *                                        (e.g. unlock the game's AudioContext)
 *   autopilot      (fn)                in-page; called ONCE in "auto" mode right after the
 *                                        recorder starts (window.__ap is cleared on stop)
 *   audio          (bool)              also record the game's WebAudio output
 *   timeline       (fn -> object)      in-page, every frame; a flat object of numbers /
 *                                        strings. A change of any key is logged as
 *                                        {t, ...values}. Give `beat` (an integer that
 *                                        counts the music's beats) to cut on the beat.
 *   headless       (bool)              run without a window (GPU flags added); default false
 *   settle         (ms)                wait before recording (shaders compile, sound fades in)
 *   bitrate,fps,seconds,outDir,name,waitFontsReady   optional overrides
 *
 * Outputs <outDir>/<name>.mp4 (+ .webm master, .audio.webm, .timeline.json).
 * fn fields: in a .cjs config write real functions (serialized via toString --
 * keep them self-contained, no Node closures); in a .json config write
 * arrow-function SOURCE STRINGS.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function fail(m) { console.error("[capture] " + m); process.exit(1); }
const src = (f) => (typeof f === "function" ? f.toString() : f);
const call = (f, arg) => "(" + src(f) + ")(" + (arg === undefined ? "" : JSON.stringify(arg)) + ")";

function loadPlaywright() {
  try { return require(require.resolve("playwright", { paths: [process.cwd()] })); } catch {}
  try {
    const npx = path.join(process.env.HOME || "", ".npm", "_npx");
    for (const h of fs.readdirSync(npx)) {
      const p = path.join(npx, h, "node_modules", "playwright");
      if (fs.existsSync(p)) return require(p);
    }
  } catch {}
  try { return require("playwright"); } catch {}
  fail("Playwright not found. Run: npx playwright install chromium");
}

function loadConfig(p) {
  if (!p) fail("usage: node capture-video.cjs <config.(cjs|json)> [seconds] [auto|manual] [outDir] [name]");
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) fail("config not found: " + abs);
  return abs.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : require(abs);
}

// GPU on for headless runs (without it the WebGL loop may stall or fall back to software).
function gpuArgs() {
  const angle = process.platform === "darwin" ? "metal" : process.platform === "win32" ? "d3d11" : "vulkan";
  return [`--use-angle=${angle}`, "--enable-gpu", "--ignore-gpu-blocklist"];
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

(async () => {
  const cfg = loadConfig(process.argv[2]);
  const SECONDS = Number(process.argv[3] || cfg.seconds || 35);
  const MODE = process.argv[4] || cfg.mode || "auto"; // "auto" | "manual"
  const OUT_DIR = process.argv[5] || cfg.outDir || "gameplay-video";
  const NAME = process.argv[6] || cfg.name || `gameplay-${stamp}`;
  const TARGET = cfg.target || { width: 1080, height: 1920 };
  const DISPLAY_H = cfg.displayHeight || 760;
  const DISPLAY = { width: Math.round((TARGET.width / TARGET.height) * DISPLAY_H), height: DISPLAY_H };
  const BITRATE = cfg.bitrate || 40_000_000;
  const FPS = cfg.fps || 60;
  const SELECTOR = cfg.canvasSelector || "canvas";
  if (!cfg.url) fail("config.url is required");
  if (!cfg.ready) fail("config.ready is required");
  if (MODE === "manual" && cfg.headless) fail("manual mode needs a window (headless: false)");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const webmPath = path.join(OUT_DIR, `${NAME}.webm`);
  const audioPath = path.join(OUT_DIR, `${NAME}.audio.webm`);
  const mp4Path = path.join(OUT_DIR, `${NAME}.mp4`);
  const timelinePath = path.join(OUT_DIR, `${NAME}.timeline.json`);
  fs.writeFileSync(webmPath, Buffer.alloc(0));
  fs.writeFileSync(audioPath, Buffer.alloc(0));

  const { chromium } = loadPlaywright();
  // Disable Playwright's own signal handlers -- otherwise Ctrl-C closes the
  // browser and exits the process before we can transcode. We handle stop below.
  const browser = await chromium.launch({
    headless: !!cfg.headless,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
    args: ["--autoplay-policy=no-user-gesture-required", ...(cfg.headless ? gpuArgs() : [])],
  });
  const page = await browser.newPage({ viewport: DISPLAY, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[page error]", e.message));

  await page.exposeFunction("__recSink", (kind, b64) =>
    fs.appendFileSync(kind === "audio" ? audioPath : webmPath, Buffer.from(b64, "base64")));

  if (cfg.audio) {
    // Tee every connection into an AudioContext's speakers into a recordable stream.
    await page.addInitScript(() => {
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dest, ...rest) {
        const ctx = this.context;
        if (dest === ctx.destination) {
          if (!ctx.__capDest) {
            ctx.__capDest = ctx.createMediaStreamDestination();
            window.__capAudio = ctx.__capDest.stream;
          }
          connect.call(this, ctx.__capDest);
        }
        return connect.call(this, dest, ...rest);
      };
    });
  }

  try { await page.goto(cfg.url, { waitUntil: "load", timeout: 20000 }); }
  catch (e) { fail("could not open " + cfg.url + " (" + e.message + ")"); }
  await page.waitForFunction(call(cfg.ready), { timeout: 20000 }).catch(() => fail("game never became ready"));
  if (cfg.waitFontsReady !== false) await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});

  // Decouple capture resolution from the window: raise the engine's internal
  // render size to TARGET, wait for the game to be ready again, then shrink the
  // on-screen canvas and re-map input. See SKILL.md for the per-engine recipe.
  if (cfg.setRenderSize) {
    await page.evaluate(call(cfg.setRenderSize, { w: TARGET.width, h: TARGET.height }));
    await page.waitForFunction(call(cfg.ready), { timeout: 20000 }).catch(() => fail("not ready after render resize"));
    if (cfg.setDisplaySize) await page.evaluate(call(cfg.setDisplaySize, { w: DISPLAY.width, h: DISPLAY.height }));
  }
  if (cfg.beforeRecord) await page.evaluate(call(cfg.beforeRecord));
  if (cfg.audio) {
    await page.waitForFunction(() => !!window.__capAudio, null, { timeout: 5000 })
      .catch(() => console.warn("[capture] no audio yet (the game makes its AudioContext later?) -- recording video only"));
  }
  if (cfg.settle) await page.waitForTimeout(cfg.settle);

  // Recorders (video, + audio in its own recorder), started in the same tick.
  // Each 1s chunk streams straight to disk so an early stop keeps the take.
  await page.evaluate(({ bitrate, fps, selector }) => {
    const canvas = document.querySelector(selector);
    if (!canvas) throw new Error("canvas not found: " + selector);
    const toB64 = (blob) => new Promise((res) => {
      const r = new FileReader();
      r.onloadend = () => res(String(r.result).split(",")[1]);
      r.readAsDataURL(blob);
    });
    const recorders = [];
    const record = (kind, stream, options) => {
      const rec = new MediaRecorder(stream, options);
      let chain = Promise.resolve();
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chain = chain.then(async () => window.__recSink(kind, await toB64(e.data)));
      };
      recorders.push({ rec, done: () => chain });
    };
    const vmime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    record("video", canvas.captureStream(fps), { mimeType: vmime, videoBitsPerSecond: bitrate });
    if (window.__capAudio) record("audio", window.__capAudio, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 256000 });
    window.__finish = async () => {
      if (window.__ap) clearInterval(window.__ap);
      for (const { rec, done } of recorders) {
        await new Promise((res) => { rec.onstop = res; try { rec.stop(); } catch { res(); } });
        await done();
      }
    };
    window.__recStart = performance.now();
    for (const { rec } of recorders) rec.start(1000);
  }, { bitrate: BITRATE, fps: FPS, selector: SELECTOR });

  // Timeline: sampled every frame in the page, logged on change, in take seconds.
  if (cfg.timeline) {
    await page.evaluate(`(() => {
      const sample = ${src(cfg.timeline)};
      const log = (window.__timeline = []);
      let prev = {};
      const frame = () => {
        const t = +((performance.now() - window.__recStart) / 1000).toFixed(3);
        let s = null;
        try { s = sample(); } catch (e) {}
        if (s) {
          const changed = Object.keys(s).filter((k) => s[k] !== prev[k]);
          if (changed.length) log.push(Object.assign({ t }, s));
          prev = s;
        }
        requestAnimationFrame(frame);
      };
      frame();
    })()`);
  }

  // Auto mode: hand the driving to the game-specific autopilot (sets window.__ap).
  if (MODE === "auto" && cfg.autopilot) await page.evaluate(call(cfg.autopilot));

  console.log(`[capture] recording up to ${SECONDS}s (capture ${TARGET.width}x${TARGET.height}, ${cfg.headless ? "headless" : `window ${DISPLAY.width}x${DISPLAY.height}`}, mode=${MODE}${cfg.audio ? ", with sound" : ""})...`);
  if (MODE === "manual") console.log("[capture] MANUAL: play the opened window by hand.");
  console.log("[capture] Stop early anytime with Ctrl-C (or close the window); the clip is saved either way.");

  // Finish on the FIRST of: time cap, Ctrl-C, or window close. Use a PERSISTENT
  // SIGINT listener (not `once`): a `once` listener removes itself when it fires,
  // leaving no handler, so Node reverts to its default terminate-on-SIGINT and
  // dies before we save the mp4. Persistent keeps us alive; repeat Ctrl-C no-ops.
  let resolveStop;
  const stopped = new Promise((r) => (resolveStop = r));
  let done = false;
  const timer = setTimeout(() => { if (!done) { done = true; resolveStop("time cap"); } }, SECONDS * 1000);
  const trigger = (why) => {
    if (done) { console.log("[capture] finishing — please wait (webm already saved)..."); return; }
    done = true; resolveStop(why);
  };
  process.on("SIGINT", () => trigger("Ctrl-C"));
  page.once("close", () => trigger("window closed"));
  browser.once("disconnected", () => trigger("window closed"));
  const reason = await stopped;
  clearTimeout(timer);
  console.log(`[capture] stopping (${reason})...`);

  if (reason !== "window closed") {
    if (cfg.timeline) {
      const events = await page.evaluate(() => window.__timeline).catch(() => []);
      fs.writeFileSync(timelinePath, JSON.stringify({ url: cfg.url, size: [TARGET.width, TARGET.height], events }));
    }
    await page.evaluate(() => window.__finish()).catch(() => {});
  }
  await browser.close().catch(() => {});

  const bytes = fs.existsSync(webmPath) ? fs.statSync(webmPath).size : 0;
  if (bytes === 0) fail("nothing was recorded (stopped too early?)");
  const withAudio = fs.statSync(audioPath).size > 0;
  if (!withAudio) fs.unlinkSync(audioPath);
  console.log(`[capture] wrote ${webmPath} (${(bytes / 1e6).toFixed(1)} MB)${withAudio ? " + audio" : ""}`);

  // Transcode to mp4 (CFR, yuv420p, faststart). The scale filter rounds odd
  // dimensions to even -- H.264 requires even width/height and a backing buffer
  // can be odd. The sound (if any) is muxed in here.
  console.log("[capture] transcoding -> mp4 ...");
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", webmPath,
    ...(withAudio ? ["-i", audioPath] : []),
    "-r", String(FPS),
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p",
    ...(withAudio ? ["-af", "aresample=async=1", "-c:a", "aac", "-b:a", "256k"] : ["-an"]),
    "-movflags", "+faststart", mp4Path,
  ], { stdio: "inherit" });

  console.log(`\n[capture] done`);
  console.log(`  mp4  (edit):   ${mp4Path}`);
  console.log(`  webm (master): ${webmPath}`);
  if (cfg.timeline) console.log(`  timeline:      ${timelinePath}`);
})();
