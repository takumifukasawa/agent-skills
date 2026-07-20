#!/usr/bin/env node
/**
 * Ad-ready GAMEPLAY VIDEO capture for a web/canvas game.
 *
 * Records the REAL running game (real physics + WebGL postFX) to an mp4 via
 * headed Chromium -> canvas.captureStream -> MediaRecorder -> ffmpeg. The
 * reusable mechanics live here; you supply the small GAME-SPECIFIC config.
 *
 *   node capture-video.cjs <config.(cjs|json)> [seconds] [auto|manual] [outDir]
 *
 * Why the shape it is (hard-won -- see SKILL.md "Gotchas"):
 *  - HEADED. A WebGL bloom/postFX pipeline commonly STALLS the *headless*
 *    physics loop (the subject freezes at spawn), so live capture must be headed.
 *  - captureStream records ONLY the canvas backing buffer, so the on-screen
 *    cursor / any DOM overlay is NEVER in the video (no cursor for free).
 *  - Capture resolution is DECOUPLED from the window: we bump the engine's
 *    INTERNAL render size up to `target` (ad resolution) and keep the on-screen
 *    canvas small (`displayHeight`), so the video is ad-sized even on a laptop.
 *  - Playwright's OWN signal handlers are DISABLED (handleSIGINT/TERM/HUP:false)
 *    -- otherwise Ctrl-C makes Playwright close the browser and process.exit
 *    before we transcode, leaving a webm with no mp4.
 *  - Chunks stream to DISK every second, and stop is unified (Ctrl-C / closing
 *    the window / time cap), so an early stop never loses the recording.
 *
 * AUDIO: video-only by default (`-an`). For a game with sound, mix the WebAudio
 * graph into the stream in-page (AudioContext -> MediaStreamDestination, add its
 * track to the captureStream) and drop `-an` in the ffmpeg args below.
 *
 * ---- Config fields --------------------------------------------------------
 *   url            (string, required)  running game URL
 *   ready          (fn -> bool, req.)  in-page; true once the game is initialized
 *   target         ({width,height})    capture/ad resolution (default 1080x1920)
 *   displayHeight  (number)            on-screen preview height px (default 760)
 *   canvasSelector (string)            CSS selector for the game canvas
 *                                        (default "#wrapper canvas"; else set `canvas`)
 *   canvas         (fn -> HTMLCanvas)  in-page; overrides canvasSelector
 *   setRenderSize  (fn({w,h}))         in-page; raise the ENGINE's internal render
 *                                        size to w x h (see SKILL.md per engine).
 *                                        Omit to capture at the native window size.
 *   setDisplaySize (fn({w,h}))         in-page; shrink the on-screen canvas to w x h
 *                                        and re-map input coords (engine-specific)
 *   autopilot      (fn)                in-page; called ONCE in "auto" mode. Drive the
 *                                        game (e.g. set window.__ap = setInterval(...));
 *                                        __ap is cleared on stop. Omit for manual-only.
 *   bitrate,fps,seconds,outDir,waitFontsReady   optional overrides
 *
 * fn fields: in a .cjs config write real functions (serialized via toString --
 * keep them self-contained, no Node closures); in a .json config write
 * arrow-function SOURCE STRINGS.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
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
  if (!p) fail("usage: node capture-video.cjs <config.(cjs|json)> [seconds] [auto|manual] [outDir]");
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) fail("config not found: " + abs);
  return abs.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : require(abs);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);

(async () => {
  const cfg = loadConfig(process.argv[2]);
  const SECONDS = Number(process.argv[3] || cfg.seconds || 35);
  const MODE = process.argv[4] || cfg.mode || "auto"; // "auto" | "manual"
  const OUT_DIR = process.argv[5] || cfg.outDir || "gameplay-video";
  const TARGET = cfg.target || { width: 1080, height: 1920 };
  const DISPLAY_H = cfg.displayHeight || 760;
  const DISPLAY = { width: Math.round((TARGET.width / TARGET.height) * DISPLAY_H), height: DISPLAY_H };
  const BITRATE = cfg.bitrate || 40_000_000;
  const FPS = cfg.fps || 60;
  const SELECTOR = cfg.canvasSelector || "#wrapper canvas";
  if (!cfg.url) fail("config.url is required");
  if (!cfg.ready) fail("config.ready is required");

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const webmPath = path.join(OUT_DIR, `gameplay-${stamp}.webm`);
  const mp4Path = path.join(OUT_DIR, `gameplay-${stamp}.mp4`);
  fs.writeFileSync(webmPath, Buffer.alloc(0));

  const { chromium } = loadPlaywright();
  // Disable Playwright's own signal handlers -- otherwise Ctrl-C closes the
  // browser and exits the process before we can transcode. We handle stop below.
  const browser = await chromium.launch({
    headless: false,
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  const page = await browser.newPage({ viewport: DISPLAY, deviceScaleFactor: 1 });

  await page.exposeFunction("__recSink", (b64) => fs.appendFileSync(webmPath, Buffer.from(b64, "base64")));

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

  // Recorder: stream each 1s chunk straight to disk (in order) so an early stop
  // still leaves a valid, near-complete recording.
  await page.evaluate(({ bitrate, fps, selector }) => {
    const canvas = document.querySelector(selector);
    if (!canvas) throw new Error("canvas not found: " + selector);
    const stream = canvas.captureStream(fps);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
    window.__rec = rec;
    const blobToB64 = (blob) => new Promise((res) => {
      const r = new FileReader();
      r.onloadend = () => res(String(r.result).split(",")[1]);
      r.readAsDataURL(blob);
    });
    let sendChain = Promise.resolve();
    let sent = 0;
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      sendChain = sendChain.then(async () => { await window.__recSink(await blobToB64(e.data)); sent++; });
    };
    window.__finish = async () => {
      if (window.__ap) clearInterval(window.__ap);
      await new Promise((res) => { rec.onstop = res; try { rec.stop(); } catch { res(); } });
      await sendChain;
      return sent;
    };
    rec.start(1000);
  }, { bitrate: BITRATE, fps: FPS, selector: SELECTOR });

  // Auto mode: hand the driving to the game-specific autopilot (sets window.__ap).
  if (MODE === "auto" && cfg.autopilot) await page.evaluate(call(cfg.autopilot));

  console.log(`[capture] recording up to ${SECONDS}s (capture ${TARGET.width}x${TARGET.height}, window ${DISPLAY.width}x${DISPLAY.height}, mode=${MODE})...`);
  if (MODE === "manual") console.log("[capture] MANUAL: play the opened window by hand.");
  console.log("[capture] Stop early anytime with Ctrl-C (or just close the window); the clip is saved either way.");

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

  let sent = "streamed";
  if (reason !== "window closed") sent = await page.evaluate(() => window.__finish()).catch(() => "streamed");
  await browser.close().catch(() => {});

  const bytes = fs.existsSync(webmPath) ? fs.statSync(webmPath).size : 0;
  if (bytes === 0) fail("nothing was recorded (stopped too early?)");
  console.log(`[capture] wrote ${webmPath} (${sent} chunks, ${(bytes / 1e6).toFixed(1)} MB)`);

  // Transcode to mp4 (CFR, yuv420p, faststart, no audio). The scale filter
  // rounds odd dimensions to even -- H.264 requires even width/height and a
  // backing buffer can be odd.
  console.log("[capture] transcoding -> mp4 ...");
  execFileSync("ffmpeg", [
    "-y", "-i", webmPath,
    "-r", String(FPS),
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
    mp4Path,
  ], { stdio: "inherit" });

  console.log(`\n[capture] done`);
  console.log(`  webm (master): ${webmPath}`);
  console.log(`  mp4  (for AE): ${mp4Path}`);
})();
