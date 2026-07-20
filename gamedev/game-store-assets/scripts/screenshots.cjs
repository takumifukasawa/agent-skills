#!/usr/bin/env node
/**
 * Capture a batch of store screenshots from a RUNNING web/canvas game.
 *
 * Usage: node screenshots.cjs <config.(cjs|json)> [outDir]
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
  if (!cfg.url) fail("config.url is required");

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const tmp = os.tmpdir();

  async function fresh() {
    const p = await browser.newPage({ viewport: { width: T.width, height: T.height }, deviceScaleFactor: dsf });
    try { await p.goto(cfg.url, { waitUntil: "load", timeout: 20000 }); }
    catch (e) { fail("could not open " + cfg.url + " — dev server running? (" + e.message + ")"); }
    if (cfg.ready) await p.waitForFunction(call(cfg.ready), { timeout: 20000 }).catch(() => fail("ready never true"));
    if (cfg.waitFontsReady !== false) await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await p.waitForTimeout(250);
    return p;
  }
  async function grab(p, name) {
    const raw = path.join(tmp, `ss_${process.pid}_${name}.png`);
    await p.screenshot({ path: raw });
    execFileSync("python3", [path.join(__dirname, "resize.py"), raw, path.join(outDir, name + ".png"), String(T.width), String(T.height)]);
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

  await browser.close();
  console.log("[screenshots] done ->", outDir);
})();
