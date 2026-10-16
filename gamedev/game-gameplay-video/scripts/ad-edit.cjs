#!/usr/bin/env node
/**
 * Cut an ad from takes recorded by capture-video.cjs (mp4 + optional timeline).
 *
 *   node ad-edit.cjs <cut list .json> [takesDir]
 *
 * Takes are read from (first found): the CLI's takesDir, the list's "takesDir"
 * (relative to the list file), or ./gameplay-video. The ad is written next to
 * them (or to the list's "outDir").
 *
 * The cut list (JSON):
 *   {
 *     "out": "ad-a",                 // -> <outDir>/ad-a.mp4
 *     "size": [800, 1000],           // output size (takes are supersampled; scaled with lanczos)
 *     "fade": 0.25,                  // seconds of crossfade between cuts (0 = hard cut)
 *     "fadeIn": 0, "fadeOut": 0.6,   // start / end of the whole ad (output seconds)
 *     "audioFadeIn": 0.3, "audioFadeOut": 0.8, // the sound's own fades (default: fadeIn / fadeOut)
 *     "loudness": -14,               // LUFS (social feeds normalise to about -14)
 *     "speed": 1.176,                // playback speed (1 = as recorded; After Effects' time stretch 85% = 1 / 0.85).
 *                                    // A cut may set its own "speed". Sound keeps its pitch.
 *     "cuts": [{"take": "stage1", "from": 3.0, "to": 7.5}, ...],
 *     // Optional: one music bed under all the cuts instead of each cut's own sound
 *     // (a take with only the music: the game's sound effects muted). It plays at its own speed from the
 *     // beat nearest `from`.
 *     //   snap: cuts are trimmed to whole multiples of this many beats (4 = a bar
 *     //         of 4/4), so the cuts change on the beat.
 *     //   gates: true = each cut gets its own speed (within speedRange, nearest
 *     //         `speed`) and start, so its gate passes land on the bed's beats
 *     //         (else half beats, else triplets). Needs the cut's take timeline.
 *     //   passAt: beats from a cut's start to its first gate pass (e.g. 2; a cut may set its own).
 *     //   align: index of a cut of the music take itself, played at speed 1: the bed
 *     //         is lined up with it (its sound and picture match there, e.g. the clear).
 *     "music": {"take": "music4", "from": 30.0, "snap": 4, "gates": true, "speedRange": [1, 1.25], "passAt": 2, "align": 4}
 *   }
 * Takes are <takesDir>/<take>.mp4 (+ <take>.timeline.json for beats / passes; beats are
 * timeline events carrying an integer `beat`).
 */
const fs = require("fs");
const path = require("path");
const {execFileSync} = require("child_process");

const listPath = process.argv[2];
if (!listPath) {
    console.error("usage: node ad-edit.cjs <cut list .json> [takesDir]");
    process.exit(1);
}
const list = JSON.parse(fs.readFileSync(listPath, "utf8"));
const DIR = path.resolve(process.argv[3] || (list.takesDir ? path.resolve(path.dirname(listPath), list.takesDir) : "gameplay-video"));
const OUT_DIR = list.outDir ? path.resolve(path.dirname(listPath), list.outDir) : DIR;
const [W, H] = list.size || [800, 1000];
const fade = list.fade ?? 0.25;
const fadeIn = list.fadeIn ?? 0;
const fadeOut = list.fadeOut ?? 0.6;
const audioFadeIn = list.audioFadeIn ?? fadeIn;
const audioFadeOut = list.audioFadeOut ?? fadeOut;
const loudness = list.loudness ?? -14;
const speed = list.speed ?? 1;
const music = list.music || null;
const cuts = list.cuts.map((c) => ({...c, speed: c.speed ?? speed, own: c.speed !== undefined}));

const timeline = (take) => JSON.parse(fs.readFileSync(path.join(DIR, `${take}.timeline.json`), "utf8")).events;
const median = (xs) => [...xs].sort((x, y) => x - y)[Math.floor(xs.length / 2)];
/** Seconds of each gate pass in a take (the timeline's pass key going up). */
function passes(take) {
    const key = (list.music && list.music.passKey) || "score";
    const out = [];
    let score = 0;
    for (const e of timeline(take)) {
        if (e[key] === undefined) continue;
        if (e[key] > score) out.push(e.t);
        score = e[key];
    }
    return out;
}

let musicFrom = 0;
if (music) {
    const beats = timeline(music.take).filter((e) => e.beat !== undefined).map((e) => e.t);
    const beat = median(beats.slice(1).map((t, i) => t - beats[i]));
    const unit = beat * (music.snap || 0);
    const [lo, hi] = music.speedRange || [1, 1.25];
    cuts.forEach((c, i) => {
        if (music.gates && !c.own && !(music.align === i)) {
            // The cut's gate spacing: the smallest pass interval, if the others are
            // whole multiples of it (tunnels), else the typical one.
            const ps = passes(c.take).filter((t) => t >= c.from - 1 && t <= c.to + 1);
            const gaps = ps.slice(1).map((t, k) => t - ps[k]);
            const step = gaps.length ? Math.min(...gaps) : 0;
            const whole = gaps.every((g) => Math.abs(g / step - Math.round(g / step)) < 0.1);
            const spacing = whole ? median(gaps.map((g) => g / Math.round(g / step))) : median(gaps);
            for (const grid of [1, 1 / 2, 1 / 3]) {
                let best = 0;
                for (let k = 1; k < 64; k++) {
                    const s = spacing / (k * grid * beat);
                    if (s >= lo * 0.99 && s <= hi * 1.01 && (!best || Math.abs(s - speed) < Math.abs(best - speed))) best = s;
                }
                if (best) {
                    c.speed = +best.toFixed(4);
                    c.grid = grid;
                    break;
                }
            }
            // Start so a pass lands on the grid (the cuts themselves change on bar lines):
            // `passAt` beats after the cut (the gate is seen coming, not passed on the cut),
            // else on the grid nearest the cut's own start.
            const g = (c.grid || 1) * beat * c.speed;
            const passAt = c.passAt ?? music.passAt;
            if (passAt !== undefined) {
                const lead = passAt * beat * c.speed;
                // The pass nearest that spot (not "the first after it": a hair late skipped a whole gate).
                const first = ps.reduce((best, t) => (Math.abs(t - c.from - lead) < Math.abs(best - c.from - lead) ? t : best), c.from + lead);
                c.from = +(first - lead).toFixed(3);
            } else {
                const first = ps.find((t) => t >= c.from) ?? c.from;
                c.from = +(first - Math.round((first - c.from) / g) * g).toFixed(3);
            }
        }
        if (music.align === i) {
            c.speed = 1;
        }
        if (unit) {
            const overlap = i < cuts.length - 1 ? fade : 0;
            const n = Math.max(1, Math.round(((c.to - c.from) / c.speed - overlap) / unit));
            c.to = +(c.from + (n * unit + overlap) * c.speed).toFixed(3);
        }
    });
    if (music.align !== undefined) {
        // Line the bed up with that cut (a cut of the music take at speed 1).
        const outStart = cuts.slice(0, music.align).reduce((sum, c) => sum + (c.to - c.from) / c.speed - fade, 0);
        musicFrom = cuts[music.align].from - outStart;
    } else {
        musicFrom = beats.reduce((best, t) => (Math.abs(t - music.from) < Math.abs(best - music.from) ? t : best), beats[0]);
    }
    console.log(`[ad-edit] beat ${beat.toFixed(3)} s; cuts:\n${cuts.map((c) => `  ${c.take} ${c.from}-${c.to} x${c.speed}${c.grid && c.grid !== 1 ? ` (on 1/${Math.round(1 / c.grid)} beats)` : ""}`).join("\n")}`);
}
// Slowed down: 60 * speed fps, so no frame repeats. Sped up: 60 fps (frames are dropped, which reads smoother).
const outFps = +Math.min(60, 60 * Math.min(...cuts.map((c) => c.speed))).toFixed(3);

const inputs = [];
const filters = [];
cuts.forEach((c, i) => {
    inputs.push("-ss", String(c.from), "-to", String(c.to), "-i", path.join(DIR, `${c.take}.mp4`));
    const sp = c.speed !== 1 ? `,setpts=PTS/${c.speed}` : "";
    filters.push(`[${i}:v]scale=${W}:${H}:flags=lanczos,setsar=1,fps=60,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS${sp}[v${i}]`);
    if (!music) {
        // Hard cuts: 10 ms ramps at each cut's ends, or the joins click.
        const d = (c.to - c.from) / c.speed;
        const ramp = fade > 0 ? "" : `,afade=t=in:st=0:d=0.01,afade=t=out:st=${(d - 0.01).toFixed(3)}:d=0.01`;
        const tempo = c.speed !== 1 ? `,atempo=${c.speed}` : "";
        filters.push(`[${i}:a]aresample=48000,asetpts=PTS-STARTPTS${tempo}${ramp}[a${i}]`);
    }
});

// Chain the cuts (output time): xfade / acrossfade overlap each joint by `fade` seconds.
let v = "v0";
let a = "a0";
let length = (cuts[0].to - cuts[0].from) / cuts[0].speed;
for (let i = 1; i < cuts.length; i++) {
    const d = (cuts[i].to - cuts[i].from) / cuts[i].speed;
    if (fade > 0) {
        filters.push(`[${v}][v${i}]xfade=transition=fade:duration=${fade}:offset=${(length - fade).toFixed(3)}[vx${i}]`);
        if (!music) filters.push(`[${a}][a${i}]acrossfade=d=${fade}[ax${i}]`);
        length += d - fade;
    } else if (music) {
        filters.push(`[${v}][v${i}]concat=n=2:v=1:a=0[vx${i}]`);
        length += d;
    } else {
        filters.push(`[${v}][${a}][v${i}][a${i}]concat=n=2:v=1:a=1[vx${i}][ax${i}]`);
        length += d;
    }
    v = `vx${i}`;
    a = `ax${i}`;
}
if (music) {
    inputs.push("-ss", musicFrom.toFixed(3), "-t", length.toFixed(3), "-i", path.join(DIR, `${music.take}.mp4`));
    a = `${cuts.length}:a`;
}
const ends = (f, inn, out) => [inn > 0 ? `${f}=t=in:st=0:d=${inn}` : "", out > 0 ? `${f}=t=out:st=${(length - out).toFixed(3)}:d=${out}` : ""].filter(Boolean);
const vEnd = ends("fade", fadeIn, fadeOut);
const aEnd = [...ends("afade", audioFadeIn, audioFadeOut), `loudnorm=I=${loudness}:TP=-1.5:LRA=11`, "aresample=48000"];
filters.push(`[${v}]${vEnd.length ? vEnd.join(",") : "null"}[vout]`);
filters.push(`[${a}]${aEnd.join(",")}[aout]`);

fs.mkdirSync(OUT_DIR, {recursive: true});
const out = path.join(OUT_DIR, `${list.out}.mp4`);
execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", ...inputs,
    "-filter_complex", filters.join(";"), "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", String(outFps),
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
], {stdio: "inherit"});
console.log(`[ad-edit] ${out} (${length.toFixed(1)} s, ${W}x${H}, ${outFps} fps${music ? `, music ${music.take} from ${musicFrom.toFixed(2)} s` : ""})`);
