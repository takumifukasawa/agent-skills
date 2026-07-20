---
name: task-eta
description: Use when the user asks how much longer a background Claude Code task will take, or wants a progress/ETA check on work happening "behind the scenes" — a Bash command launched with run_in_background, or an Agent launched in the background (the default for Agent). Triggers on phrasing like "あとどれくらいで終わる?", "進捗どう?", "終わりそう?", "how much longer", "is it done yet", "check progress on the background task/agent". Explains how to inspect a running background task's live output without blocking, extract a time estimate from progress signals, and when to say "unknown" instead of guessing.
---

# task-eta

## Two different "task" systems — don't confuse them

1. **Background processes** — a `Bash` command launched with `run_in_background: true`, or an `Agent` launched with `run_in_background: true` (the default). Each returns a `task_id` in its tool result when launched. Inspect these with `TaskOutput`, cancel with `TaskStop`. This skill is about these.
2. **The planning task board** (`TaskCreate`/`TaskList`/`TaskGet`/`TaskUpdate`) — a todo list for organizing multi-step work (`pending`/`in_progress`/`completed`, dependencies). It has nothing to do with a running process's real-time progress and cannot produce an ETA.

If the user asks something like "あの裏で動いてるやつ、あとどれくらい？", they mean #1. Reaching for `TaskList` here is a dead end — it won't have the process at all.

## Step 1 — find the task_id

You already have it: it was returned in the tool result when you (or an earlier turn in this conversation) launched the background `Bash`/`Agent` call. Scroll back rather than guessing. There is no tool that enumerates all currently-running background processes — if the conversation was compacted and the id is genuinely lost, say so and ask the user to re-share it or restart the task, rather than fabricating one.

## Step 2 — peek without blocking

Call `TaskOutput` with `block: false` and a short `timeout` (e.g. `timeout: 1000`). This returns the current status/output immediately. Using `block: true` (the default) to "check" progress will instead hang until the task actually finishes — the opposite of what an ETA check needs.

For a bash task, prefer `Read` on the output file path returned by the launch (cheaper than repeated `TaskOutput` round-trips). For a `local_agent` task, use the `TaskOutput` result directly — do not `Read` its `.output` file; it's a symlink to the full subagent transcript and will overflow context.

## Step 3 — estimate from progress signals

Look for, roughly most to least reliable:
- **Explicit progress markers** — "step 4/12", "45%", "processed 1200/5000 rows", a bounded loop counter. `elapsed ÷ progress-so-far × remaining = ETA`.
- **Log cadence** — no explicit fraction, but lines emit at a roughly steady rate (one per file/test/item) and the total count is known or inferable (e.g. input file count seen earlier). Same math, count in place of percentage.
- **Comparison to a prior run** — if this repeats a command whose duration you already observed this session, use that as a rough anchor.

If none of these are available (silent process, unstructured output), say so plainly rather than inventing a number. "No progress signal in the output — it's been running N minutes, last line was X" is a better answer than a fabricated ETA.

## Step 4 — report and avoid re-polling

State elapsed time, the estimate (or "unknown" and why), and which signal it's based on. If the user is likely to ask again soon, suggest `Monitor` instead of manual re-checks — a filtered tail/poll that pushes one notification when a completion marker appears costs one setup versus repeated `TaskOutput` calls or a hand-rolled sleep loop.

## Anti-patterns

- Calling `TaskOutput` with `block: true` (or its default) to "check" progress — it blocks until completion.
- Reaching for `TaskList`/`TaskGet` — that's the todo board, unrelated to a running process.
- Reporting a numeric ETA with no underlying signal.
- Writing your own polling loop (`sleep` + re-check) when `Monitor` already exists for exactly this.
