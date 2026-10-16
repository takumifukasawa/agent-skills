#!/usr/bin/env node
/**
 * Capture a batch of store screenshots from a RUNNING web/canvas game.
 *
 * Usage: node screenshots.cjs <config.(cjs|json)> [outDir]
 *
 * Playwright must be resolvable from the cwd (or the npx cache). This file is
 * CommonJS, so NODE_PATH=<dir>/node_modules also works.
 *
 * Reusable harness (this file): Playwright launch, supersampled capture for
 * clean anti-aliasing, resize to the exact store size, static posed shots and
 * a live "autopilot" loop for in-play frames.
 *
 * GAME-SPECIFIC bits come from the config. In a .cjs config the fn fields are
 * real functions (serialized with .toString(), so they must be self-contained
 * and run IN THE PAGE — no closures over Node scope). In a .json config they
 * are arrow-function source strings.
 *
 * Config:
 *   url            game URL (include any query string).
 *   ready          in-page fn -> truthy when the game is initialized.
 *   target         {width,height} = the OUTPUT size (and logical viewport).
 *                  Use a size where the game physics actually runs (a huge
 *                  viewport can stall the headless render/physics loop). For a
 *                  9:16 game, 1080x1920 works.
 *   viewport       optional {width,height} to capture at instead of `target`.
 *                  When its aspect differs, each frame is cropped to the
 *                  target aspect (centered; `cropY` 0..1 moves the band) and
 *                  resized. Use it for a landscape banner of a game whose wide
 *                  view shows world edges: capture a squarer view, crop.
 *   cropY          vertical anchor of that crop (default 0.5).
 *   launchArgs     extra Chromium args. WebGL / three.js games usually need
 *                  ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
 *                  or the canvas renders black in headless.
 *   executablePath Chromium binary. If omitted and the default launch fails
 *                  (Playwright package newer than the installed browser), the
 *                  newest browser in the ms-playwright cache is tried.
 *   css            CSS injected after load -- the simplest HUD hide for DOM
 *                  HUDs, e.g. "body > div:not(#app) { display: none !important; }".
 *   routes         [{match, replace: [[from, to], ...]}] capture-only source
 *                  patches: responses whose URL contains `match` get the string
 *                  replacements (e.g. lift a portrait-only aspect cap in the
 *                  game's config module). The game's files are not touched.
 *   timed          optional {urls: [{prefix, url}], count, warmupMs, intervalMs}:
 *                  for games that can play themselves (an autoplay query, a
 *                  demo mode). Each url is opened in turn (one page at a time:
 *                  parallel WebGL pages time out) and shot every intervalMs.
 *                  Writes <prefix>-<n>.png.
 *   superSample    deviceScaleFactor for the screenshot (default 2). This is
 *                  how we get anti-aliasing: capture dense, then downscale.
 *   waitFontsReady wait for document.fonts.ready before shooting (default true).
 *   hudHide        in-page fn that hides HUD/score/hint text (optional).
 *   shots          [{name, pose?, hideHud?, settleMs?}] static posed shots.
 *                  Each opens a fresh page so posed state never bleeds.
 *   live           optional {count, start, keepAlive, pick, hideHud, buildMs,
 *                  pollMs, settleMs, maxTries, prefix} for autopilot capture:
 *                    start     - begin play (e.g. tap once).
 *                    keepAlive - run every pollMs to keep the ball alive / drive.
 *                    pick      - -> truthy when the current frame is worth a shot.
 *                  Live frames show real motion/trails; keepAlive must keep the
 *                  game alive or you get game-over frames.
 *   outDir         default arg2 or "store-shots".
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");

function fail(m) { console.error("[screenshots] " + m); process.exit(1); }
const src = (f) => (typeof f === "function" ? f.toString() : f);
const call = (f) => "(" + src(f) + ")()";

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
  fail("Playwright not found. Run: npx playwright install chromium (and make 'playwright' resolvable).");
}

function cachedChromium() {
  const roots = [path.join(os.homedir(), "Library", "Caches", "ms-playwright"), path.join(os.homedir(), ".cache", "ms-playwright")];
  const bins = [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
    "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-linux/chrome",
    "chrome-linux64/chrome",
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const d of dirs) for (const b of bins) { const p = path.join(root, d, b); if (fs.existsSync(p)) return p; }
  }
  return null;
}

async function launch(chromium, cfg) {
  const args = cfg.launchArgs || [];
  if (cfg.executablePath) return chromium.launch({ args, executablePath: cfg.executablePath });
  try { return await chromium.launch({ args }); }
  catch (e) {
    const exe = cachedChromium();
    if (!exe) fail("Chromium launch failed and no cached browser found: " + e.message);
    console.log("[screenshots] default launch failed; using cached " + exe);
    return chromium.launch({ args, executablePath: exe });
  }
}

function loadConfig(p) {
  if (!p) fail("usage: node screenshots.cjs <config.(cjs|json)> [outDir]");
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) fail("config not found: " + abs);
  return abs.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : require(abs);
}

(async () => {
  const cfg = loadConfig(process.argv[2]);
  const outDir = process.argv[3] || cfg.outDir || "store-shots";
  fs.mkdirSync(outDir, { recursive: true });
  const T = cfg.target || { width: 1080, height: 1920 };
  const dsf = cfg.superSample || 2;
  if (!cfg.url && !cfg.timed) fail("config.url is required");

  const { chromium } = loadPlaywright();
  const browser = await launch(chromium, cfg);
  const V = cfg.viewport || T;
  const tmp = os.tmpdir();

  async function fresh(url = cfg.url) {
    const p = await browser.newPage({ viewport: { width: V.width, height: V.height }, deviceScaleFactor: dsf });
    for (const r of (cfg.routes || [])) {
      await p.route((u) => u.href.includes(r.match), async (route) => {
        const res = await route.fetch();
        let body = await res.text();
        for (const [from, to] of r.replace) {
          if (!body.includes(from)) console.warn(`[screenshots] route ${r.match}: "${from}" not found`);
          body = body.split(from).join(to);
        }
        await route.fulfill({ response: res, body });
      });
    }
    try { await p.goto(url, { waitUntil: "load", timeout: 20000 }); }
    catch (e) { fail("could not open " + url + " — dev server running? (" + e.message + ")"); }
    if (cfg.css) await p.addStyleTag({ content: cfg.css });
    if (cfg.ready) await p.waitForFunction(call(cfg.ready), { timeout: 20000 }).catch(() => fail("ready never true"));
    if (cfg.waitFontsReady !== false) await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await p.waitForTimeout(250);
    return p;
  }
  async function grab(p, name) {
    const raw = path.join(tmp, `ss_${process.pid}_${name}.png`);
    await p.screenshot({ path: raw });
    execFileSync("python3", [path.join(__dirname, "resize.py"), raw, path.join(outDir, name + ".png"), String(T.width), String(T.height), String(cfg.cropY ?? 0.5)]);
    try { fs.unlinkSync(raw); } catch {}
    console.log("wrote", name + ".png");
  }

  for (const shot of (cfg.shots || [])) {
    const p = await fresh();
    if (shot.pose) await p.evaluate(call(shot.pose));
    if (cfg.hudHide && shot.hideHud !== false) await p.evaluate(call(cfg.hudHide));
    await p.waitForTimeout(shot.settleMs || 200);
    await grab(p, shot.name);
    await p.close();
  }

  if (cfg.live) {
    const L = cfg.live;
    const cx = T.width / 2, cy = T.height / 2;
    const p = await fresh();
    // startTap / tapAlive send TRUSTED pointer taps (Phaser input may ignore
    // synthetic in-page events). keepAlive runs in-page (direct state, e.g.
    // setVelocity) for games you can drive without real input.
    if (L.startTap) await p.mouse.click(cx, cy);
    if (L.start) await p.evaluate(call(L.start));
    if (cfg.hudHide && L.hideHud !== false) {
      await p.waitForTimeout(L.buildMs || 600);
      await p.evaluate(call(cfg.hudHide));
    }
    let got = 0;
    for (let i = 0; i < (L.maxTries || 400) && got < (L.count || 10); i++) {
      await p.waitForTimeout(L.pollMs || 45);
      if (L.tapAlive) await p.mouse.click(cx, cy);
      if (L.keepAlive) await p.evaluate(call(L.keepAlive));
      const ok = L.pick ? await p.evaluate(call(L.pick)) : true;
      if (ok) {
        got++;
        await p.waitForTimeout(L.settleMs || 30);
        await grab(p, (L.prefix || "play") + "-" + String(got).padStart(2, "0"));
      }
    }
    await p.close();
  }

  if (cfg.timed) {
    const M = cfg.timed;
    if (!cfg.url && !M.urls) fail("timed needs urls (or config.url)");
    for (const { prefix, url } of (M.urls || [{ prefix: "shot", url: cfg.url }])) {
      const p = await fresh(url);
      await p.waitForTimeout(M.warmupMs ?? 3000);
      for (let k = 0; k < (M.count || 8); k++) {
        await p.waitForTimeout(M.intervalMs ?? 3500);
        await grab(p, `${prefix}-${String(k).padStart(2, "0")}`);
      }
      await p.close();
    }
  }

  await browser.close();
  console.log("[screenshots] done ->", outDir);
})();
