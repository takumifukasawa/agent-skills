#!/usr/bin/env node
/**
 * Record a Chrome trace of the audio thread on an Android phone over USB (skill mobile-audio-render).
 *
 *   adb forward tcp:9222 localabstract:chrome_devtools_remote
 *   node <skill>/scripts/trace.mjs <url> <out.json> [seconds]
 *   python3 <skill>/scripts/analyze.py <out.json>
 *
 * Opens <url> in the phone's Chrome, taps the page once (audio needs a user gesture),
 * records for [seconds] (30), then writes the trace. Needs Node 22+ (global WebSocket).
 *
 * Env overrides:
 *   TRACE_TAP    "x,y" CSS px of the starting tap ("200,400"). "none" = no tap.
 *   TRACE_READY  JS expression; wait until it is truthy before tapping (default: document loaded).
 *   TRACE_UNTIL  JS expression; stop early once it is truthy (e.g. the game reached its clear state).
 *   TRACE_AFTER  ms to keep recording after TRACE_UNTIL fires (4000).
 *   TRACE_CATS   trace categories ("webaudio,audio,toplevel"). Never add
 *                disabled-by-default-webaudio.audionode: it is heavy enough to cause the crackle itself.
 *   ADB          adb binary ("adb").
 *
 * Use a URL the phone can reach (the dev server on the LAN, or a deployed URL), and add a
 * cache-busting query (&v=123) so an old copy is not reused.
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";

const [, , url, out, secondsArg = "30"] = process.argv;
if (!url || !out) { console.error("usage: node trace.mjs <url> <out.json> [seconds]"); process.exit(2); }
const env = process.env;
const seconds = Number(secondsArg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ws = new WebSocket("ws://localhost:9222/devtools/browser");
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else listeners.forEach(l => l(m));
};
ws.onerror = () => { console.error("cannot connect: run `adb forward tcp:9222 localabstract:chrome_devtools_remote` and open Chrome on the phone"); process.exit(1); };
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({id: i, method, params, sessionId})); });
await new Promise(r => ws.onopen = r);

const {result: {targetId}} = await send("Target.createTarget", {url});
const {result: {sessionId}} = await send("Target.attachToTarget", {targetId, flatten: true});
// Bring Chrome to the front: a page in the background tab or behind another app gets throttled.
try { execFileSync(env.ADB || "adb", ["shell", "am", "start", "-n", "com.android.chrome/com.google.android.apps.chrome.Main"]); } catch { /* not fatal */ }
await send("Target.activateTarget", {targetId});
const ev = async expr => (await send("Runtime.evaluate", {expression: expr, returnByValue: true}, sessionId)).result?.result?.value;

const ready = env.TRACE_READY || "document.readyState === 'complete'";
for (let i = 0; i < 120 && !(await ev(`!!(${ready})`)); i++) await sleep(500);

const cats = (env.TRACE_CATS || "webaudio,audio,toplevel").split(",");
const started = await send("Tracing.start", {traceConfig: {includedCategories: cats, recordMode: "recordContinuously"}, transferMode: "ReturnAsStream"});
if (started.error) { console.error("Tracing.start failed", started.error); process.exit(1); }
const t0 = Date.now();

// Tap the page through CDP, never `adb shell input tap`: the phone screen may be showing another app.
if (env.TRACE_TAP !== "none") {
    const [x, y] = (env.TRACE_TAP || "200,400").split(",").map(Number);
    await send("Input.dispatchTouchEvent", {type: "touchStart", touchPoints: [{x, y}]}, sessionId);
    await send("Input.dispatchTouchEvent", {type: "touchEnd", touchPoints: []}, sessionId);
}
await sleep(1500);
const info = await ev("(() => { const c = window.__audioContext; return c ? `${c.sampleRate}Hz base ${Math.round(c.baseLatency * 1000)}ms out ${Math.round((c.outputLatency || 0) * 1000)}ms ${c.state}` : 'no window.__audioContext'; })()");
console.log("after tap:", info);

while (Date.now() - t0 < seconds * 1000) {
    await sleep(500);
    if (env.TRACE_UNTIL && await ev(`!!(${env.TRACE_UNTIL})`)) { console.log("until fired at", ((Date.now() - t0) / 1000).toFixed(1) + "s"); await sleep(Number(env.TRACE_AFTER || 4000)); break; }
}

const done = new Promise(r => listeners.push(m => m.method === "Tracing.tracingComplete" && r(m.params)));
await send("Tracing.end");
const {stream} = await done;
const fd = fs.openSync(out, "w");
for (;;) {
    const {result} = await send("IO.read", {handle: stream, size: 1 << 20});
    fs.writeSync(fd, result.base64Encoded ? Buffer.from(result.data, "base64") : result.data);
    if (result.eof) break;
}
fs.closeSync(fd);
await send("IO.close", {handle: stream});
await send("Target.closeTarget", {targetId});
console.log("wrote", out, (fs.statSync(out).size / 1e6).toFixed(1) + "MB", "(" + ((Date.now() - t0) / 1000).toFixed(1) + "s)");
process.exit(0);
