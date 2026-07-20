#!/usr/bin/env node
/**
 * Capture a square icon from a RUNNING web/canvas game by screenshotting it in
 * headless Chromium (Playwright) and cropping around a chosen element.
 *
 * Usage:
 *   node shoot.cjs <config.(json|cjs)> [outPath] [size]
 *
 * The config supplies the GAME-SPECIFIC bits; this script is the reusable
 * harness (Playwright resolution/launch, screenshot+clip, square resize).
 *
 * Config fields:
 *   url            (string)  URL of the running game (include any query, e.g. ?appName=...).
 *   viewport       ({width,height})  browser viewport in CSS px. Portrait for a portrait game.
 *   deviceScaleFactor (number, default 3)  higher = crisper source screenshot.
 *   ready          (string)  arrow-fn SOURCE, evaluated in-page, returns truthy when the
 *                            game is initialized. e.g. "() => !!window.__game?.scene"
 *   clip           (string)  arrow-fn SOURCE, evaluated in-page. May pose the subject and
 *                            hide HUD, and MUST return a crop rect {x,y,width,height} in CSS px.
 *                            Use canvasCssRect() (below) to map game-internal coords -> CSS.
 *   out            (string, default arg2 or "icon.png")  output PNG path.
 *   size           (number, default arg3 or 512)  final square size in px.
 *   pad            (string, default "#000000")  pad color if the crop isn't square.
 *
 * A helper is injected into the page as `window.canvasCssRect(canvas, gx, gy, halfInternalPx)`:
 * it maps a game-INTERNAL point (gx,gy) + a half-size (in internal px) to a square CSS-px rect,
 * so your clip fn can crop around an element whose coords are in the game's internal space.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function fail(msg) {
  console.error("[shoot] " + msg);
  process.exit(1);
}

function loadPlaywright() {
  // 1) local project node_modules
  try {
    return require(require.resolve("playwright", { paths: [process.cwd()] }));
  } catch {}
  // 2) npx cache: ~/.npm/_npx/<hash>/node_modules/playwright
  try {
    const npx = path.join(process.env.HOME || "", ".npm", "_npx");
    for (const h of fs.readdirSync(npx)) {
      const p = path.join(npx, h, "node_modules", "playwright");
      if (fs.existsSync(p)) return require(p);
    }
  } catch {}
  // 3) global resolution
  try {
    return require("playwright");
  } catch {}
  fail(
    "Playwright not found. Install it once, e.g.:\n" +
      "  npx playwright install chromium   (fetches the browser)\n" +
      "  # and ensure the 'playwright' package is resolvable (npm i -D playwright, or run via npx)"
  );
}

function loadConfig(p) {
  if (!p) fail("usage: node shoot.cjs <config.(json|cjs)> [outPath] [size]");
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) fail("config not found: " + abs);
  if (abs.endsWith(".json")) return JSON.parse(fs.readFileSync(abs, "utf8"));
  return require(abs);
}

const INJECT = `
window.canvasCssRect = function (canvas, gx, gy, halfInternalPx) {
  const r = canvas.getBoundingClientRect();
  const sx = r.width / canvas.width;   // css px per internal px
  const sy = r.height / canvas.height;
  const cx = r.left + gx * sx;
  const cy = r.top + gy * sy;
  const half = halfInternalPx * sx;
  return { x: Math.round(cx - half), y: Math.round(cy - half), width: Math.round(half * 2), height: Math.round(half * 2) };
};
`;

(async () => {
  const cfg = loadConfig(process.argv[2]);
  const out = process.argv[3] || cfg.out || "icon.png";
  const size = parseInt(process.argv[4] || cfg.size || 512, 10);
  const pad = cfg.pad || "#000000";
  if (!cfg.url) fail("config.url is required");
  if (!cfg.clip) fail("config.clip (arrow-fn source returning a CSS clip rect) is required");

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: cfg.viewport || { width: 420, height: 820 },
    deviceScaleFactor: cfg.deviceScaleFactor || 3,
  });
  await page.addInitScript(INJECT);

  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  try {
    await page.goto(cfg.url, { waitUntil: "load", timeout: 20000 });
  } catch (e) {
    fail("could not open " + cfg.url + " — is the dev server running? (" + e.message + ")");
  }

  if (cfg.ready) {
    await page
      .waitForFunction("(" + cfg.ready + ")()", { timeout: 20000 })
      .catch(() => fail("ready condition never became true (check config.ready)"));
  }
  await page.waitForTimeout(200);

  const clip = await page.evaluate("(" + cfg.clip + ")()");
  if (!clip || typeof clip.width !== "number") {
    fail("config.clip did not return a {x,y,width,height} rect");
  }
  await page.waitForTimeout(120);

  const raw = path.join(require("os").tmpdir(), "shoot_raw_" + process.pid + ".png");
  await page.screenshot({ path: raw, clip });
  await browser.close();

  // Square + resize via Pillow (installed on demand if missing).
  const py = path.join(__dirname, "resize_square.py");
  try {
    execFileSync("python3", [py, raw, out, String(size), pad], { stdio: "inherit" });
  } catch {
    execFileSync("python3", ["-m", "pip", "install", "--quiet", "Pillow"], { stdio: "inherit" });
    execFileSync("python3", [py, raw, out, String(size), pad], { stdio: "inherit" });
  }
  try { fs.unlinkSync(raw); } catch {}

  console.log("[shoot] wrote " + out + " (" + size + "x" + size + "), clip=" + JSON.stringify(clip));
  if (errors.length) console.log("[shoot] page errors: " + errors.length + " (check the game)");
})();
