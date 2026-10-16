#!/usr/bin/env python3
"""Summarise an audio trace from trace.mjs (skill mobile-audio-render).

    python3 <skill>/scripts/analyze.py <trace.json>

What to read:
  render dur      time to produce one render quantum. At 128 frames / 48 kHz the deadline is 2.7 ms.
  glitches        "Glitch!" / "SyncReader::Read timed out" = the audio thread missed its deadline (an audible gap).
  per second      missed deadlines per second. Rising over play time = nodes left connected
                  (references/webaudio-crackle.md). Spikes at one moment = a burst of work there.
  frames          the buffer size Chrome actually uses (128 for latencyHint "interactive").
"""
import collections
import json
import sys

RENDER = "RealtimeAudioDestinationHandler::Render"
GLITCH = "Glitch!"
TIMEOUT = "SyncReader::Read timed out"
WANT = {RENDER, GLITCH, TIMEOUT}


def pct(xs, p):
    return xs[min(len(xs) - 1, int(len(xs) * p))]


def main(path):
    render, glitch, timeout, stack = [], [], [], {}
    with open(path) as f:
        # The trace is one big JSON array with one event per line; parse line by line to keep memory low.
        for line in f:
            i = line.find('"name":"')
            if i < 0:
                continue
            name = line[i + 8:line.find('"', i + 8)]
            if name not in WANT:
                continue
            try:
                e = json.loads(line.rstrip().rstrip(","))
            except ValueError:
                continue
            ph, key = e["ph"], (e["tid"], name)
            if ph == "B":
                stack.setdefault(key, []).append(e["ts"])
                continue
            if ph == "E":
                if not stack.get(key):
                    continue
                begin = stack[key].pop()
                dur, e["ts"] = e["ts"] - begin, begin
            else:
                dur = e.get("dur", 0)
            if name == RENDER:
                render.append((e["ts"], dur, e.get("args")))
            elif name == GLITCH:
                glitch.append(e["ts"])
            else:
                timeout.append(e["ts"])

    if not render:
        print("no audio renders in the trace: did the sound start? (it needs a tap on the page)")
        return
    render.sort()
    t0 = render[0][0]
    d = sorted(r[1] for r in render)
    print("renders %d over %.1fs" % (len(render), (render[-1][0] - t0) / 1e6))
    print("render dur us  p50 %d  p90 %d  p99 %d  max %d" % (pct(d, .5), pct(d, .9), pct(d, .99), d[-1]))
    print("args sample   ", render[0][2])
    print("glitches %d  timeouts %d" % (len(glitch), len(timeout)))
    # One missed deadline logs one timeout and several "Glitch!" lines, so count the timeouts (or glitches if none).
    per_s = collections.Counter(int((t - t0) / 1e6) for t in (timeout or glitch))
    print("missed per second:", dict(sorted(per_s.items())) or "none")
    for ts, dur, _ in sorted(render, key=lambda r: -r[1])[:5]:
        print("long render at %.2fs  %d us" % ((ts - t0) / 1e6, dur))


if __name__ == "__main__":
    main(sys.argv[1])
