#!/usr/bin/env python3
"""Plot trajectories recorded by probe-trajectory.cjs, one row per file.

    python3 plot-trajectory.py <out.png> <a.json> [b.json ...]

Black line = the controlled height over progress; orange spans = input held;
cyan bars = markers (gates: y +- size); red x = misses. Reading it: a sawtooth
of thin orange slivers = fine tapping on a straight line (robotic); even-width
spans at even spacing = a metronome (also robotic); a deep dip before a gate,
or a peak far above one = what a viewer reads as a jolt.
"""
import json
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

out, files = sys.argv[1], sys.argv[2:]
fig, axes = plt.subplots(len(files), 1, figsize=(16, 3.2 * len(files)), squeeze=False)
for ax, f in zip(axes[:, 0], files):
    d = json.load(open(f))
    s = d["samples"]
    if not s:
        continue
    xs = [a[0] for a in s]
    ys = [a[1] for a in s]
    ax.plot(xs, ys, lw=1.2, color="k")
    for i in range(1, len(s)):
        if s[i][2]:
            ax.axvspan(s[i - 1][0], s[i][0], color="orange", alpha=0.35, lw=0)
    for m in d.get("markers", []):
        ax.plot([m[0], m[0]], [m[1] - m[2], m[1] + m[2]], color="c", lw=3)
    for x, y in d.get("misses", []):
        ax.plot([x], [y], "rx", ms=10, mew=2)
    presses = sum(1 for i in range(1, len(s)) if s[i][2] and not s[i - 1][2])
    ax.set_title(f"{f.split('/')[-1]}  presses={presses}  misses={len(d.get('misses', []))}")
plt.tight_layout()
plt.savefig(out, dpi=70)
print(out)
