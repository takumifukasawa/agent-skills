#!/usr/bin/env node
/**
 * Deterministic "posed animation" capture for store screenshots / hero shots.
 *
 * Use this INSTEAD of the autopilot/live capture in screenshots.cjs when the
 * game can't be driven by physics in headless -- most importantly, a WebGL
 * bloom/postFX pipeline can STALL the headless render+physics loop, so the
 * subject just freezes at its spawn (velocity is set but position never
 * integrates). Here we drive the subject BY HAND along a path over frames, so
 * a moving-ball trail builds up regardless of physics.
 *
 * Usage: node pose-capture.cjs <config.(cjs|json)> [outDir]
 *
 * Config:
 *   url, ready, viewport {width,height}, superSample (2), waitFontsReady,
 *   outDir,
 *   shots: [ {
 *     name,
 *     setup,    // in-page fn, run once: spawn the gate/obstacle, set state to
 *               //   "playing", PAUSE physics, start+boost the trail emitter,
 *               //   hide/show HUD, set a score, and stash a path on window.
 *     poseAt,   // in-page fn(t) for t in [0..1]: position the subject along the
 *               //   path (use a BEZIER, not a straight lerp -- a straight path
 *               //   makes a stiff, straight trail). Ease-in (t*t) reads as gravity.
 *     steps,    // animation steps (default 22)
 *     stepMs,   // ms between steps (default 30). ~emitter frequency so the
 *               //   trail lays down enough particles.
 *   } ]
 *
 * TRAIL TIP: in setup, temporarily boost the emitter (higher frequency, longer
 * lifespan) MODERATELY so the trail matches a real fast fall -- but don't
 * over-boost, or it looks nothing like the game. It's a screenshot-only tweak.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const os = require("os");

function fail(m) { console.error("[pose-capture] " + m); process.exit(1); }
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
  fail("Playwright not found. Run: npx playwright install chromium.");
}

function loadConfig(p) {
  if (!p) fail("usage: node pose-capture.cjs <config.(cjs|json)> [outDir]");
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) fail("config not found: " + abs);
  return abs.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : require(abs);
}

(async () => {
  const cfg = loadConfig(process.argv[2]);
  const outDir = process.argv[3] || cfg.outDir || "store-shots";
  fs.mkdirSync(outDir, { recursive: true });
  const T = cfg.viewport || { width: 1080, height: 1920 };
  const dsf = cfg.superSample || 2;
  const tmp = os.tmpdir();
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();

  for (const shot of (cfg.shots || [])) {
    const p = await browser.newPage({ viewport: T, deviceScaleFactor: dsf });
    try { await p.goto(cfg.url, { waitUntil: "load", timeout: 20000 }); }
    catch (e) { fail("could not open " + cfg.url + " (" + e.message + ")"); }
    if (cfg.ready) await p.waitForFunction(call(cfg.ready), { timeout: 20000 }).catch(() => fail("ready never true"));
    if (cfg.waitFontsReady !== false) await p.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    if (shot.setup) await p.evaluate(call(shot.setup));
    const steps = shot.steps || 22;
    const stepMs = shot.stepMs || 30;
    if (shot.poseAt) {
      for (let i = 0; i <= steps; i++) {
        await p.evaluate(call(shot.poseAt, i / steps));
        await p.waitForTimeout(stepMs);
      }
    }
    await p.waitForTimeout(40);
    const raw = path.join(tmp, `pose_${process.pid}_${shot.name}.png`);
    await p.screenshot({ path: raw });
    execFileSync("python3", [path.join(__dirname, "resize.py"), raw, path.join(outDir, shot.name + ".png"), String(T.width), String(T.height)]);
    try { fs.unlinkSync(raw); } catch {}
    console.log("wrote", shot.name + ".png");
    await p.close();
  }
  await browser.close();
  console.log("[pose-capture] done ->", outDir);
})();
