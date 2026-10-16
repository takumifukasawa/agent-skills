#!/usr/bin/env node
/**
 * Record an autopilot's TRAJECTORY (headless, fast) to tune how human it looks
 * and to check it clears -- before spending a real capture on it.
 *
 *   node probe-trajectory.cjs <config.(cjs|json)> <seconds> <out.json> [url]
 *   python3 plot-trajectory.py <out.png> <a.json> [b.json ...]
 *
 * Config (in-page fns, like capture-video.cjs; `url` may be overridden by argv,
 * e.g. to sweep seeds):
 *   url      (string)              the game with its autopilot on (query params etc.)
 *   ready    (fn -> bool)          in-page; true once the game runs
 *   start    (fn)                  in-page; optional, once after ready (e.g. start the autopilot)
 *   sample   (fn -> {x, y, holding, state})   in-page, every frame:
 *                                   x = progress along the course (any unit),
 *                                   y = the controlled height, holding = input down,
 *                                   state = the game state string ("playing", ...)
 *   markers  (fn -> [[x, y, size, id], ...])  in-page, optional: obstacles / gates near
 *                                   the subject (kept by id, last seen), drawn on the plot
 *   fail     (fn -> bool)          in-page, optional: true while a miss is showing
 *                                   (each rising edge is reported as a miss)
 */
const fs = require("fs");
const path = require("path");

function fail(m) { console.error("[probe] " + m); process.exit(1); }
const src = (f) => (typeof f === "function" ? f.toString() : f);
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
function gpuArgs() {
  const angle = process.platform === "darwin" ? "metal" : process.platform === "win32" ? "d3d11" : "vulkan";
  return [`--use-angle=${angle}`, "--enable-gpu", "--ignore-gpu-blocklist"];
}

(async () => {
  const [cfgPath, secs, out, urlArg] = process.argv.slice(2);
  if (!cfgPath || !secs || !out) fail("usage: node probe-trajectory.cjs <config> <seconds> <out.json> [url]");
  const abs = path.resolve(cfgPath);
  const cfg = abs.endsWith(".json") ? JSON.parse(fs.readFileSync(abs, "utf8")) : require(abs);
  const url = urlArg || cfg.url;
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: gpuArgs() });
  const page = await browser.newPage({ viewport: { width: 400, height: 640 } });
  await page.goto(url);
  await page.waitForFunction("(" + src(cfg.ready) + ")()", null, { timeout: 20000 }).catch(() => fail("never ready: " + url));
  if (cfg.start) await page.evaluate("(" + src(cfg.start) + ")()");
  await page.evaluate(`(() => {
    const sample = ${src(cfg.sample)};
    const markers = ${cfg.markers ? src(cfg.markers) : "null"};
    const failing = ${cfg.fail ? src(cfg.fail) : "null"};
    window.__probe = { samples: [], markers: {}, misses: [] };
    let wasFailing = false;
    const frame = () => {
      const s = sample();
      if (s) window.__probe.samples.push([s.x, s.y, s.holding ? 1 : 0, s.state]);
      if (markers) for (const m of markers() || []) window.__probe.markers[m[3] ?? m[0]] = m;
      if (failing) {
        const f = !!failing();
        if (f && !wasFailing && s) window.__probe.misses.push([s.x, s.y]);
        wasFailing = f;
      }
      requestAnimationFrame(frame);
    };
    frame();
  })()`);
  await page.waitForTimeout(Number(secs) * 1000);
  const r = await page.evaluate(() => window.__probe);
  fs.writeFileSync(out, JSON.stringify({ url, samples: r.samples, markers: Object.values(r.markers), misses: r.misses }));
  const s = r.samples;
  const presses = s.filter((a, i) => i > 0 && a[2] && !s[i - 1][2]).length;
  console.log(`[probe] ${out}: ${s.length} frames, ${presses} presses, ${r.misses.length} misses`);
  await browser.close();
})();
