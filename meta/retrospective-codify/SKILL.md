---
name: retrospective-codify
description: Meta-skill that looks back over the current session's trial-and-error and extracts a reusable skill from it. Invoke ONLY when the user explicitly asks, e.g. "このセッションをスキル化して", "今やった手順を skill にして", "codify what we did", "retrospective". Do NOT auto-invoke just because a task finished.
---

# retrospective-codify — Turn a session into a skill

Distill the generalizable, reusable procedure out of what just happened in this session, and codify it as a new skill following the repository conventions.

This is the meta-skill the gist calls central: *automate the learning by codifying it.* It builds on [skill-creator](../skill-creator/SKILL.md) — read that for the SKILL.md conventions and the three-condition check; this skill is about *extracting* the content from a session rather than gathering it by interview.

## When to use

Explicit invocation only. The user just finished some work (debugging, a setup, a workflow) and wants the knowledge captured so they don't re-derive it next time. Do not fire automatically.

## What to extract from the session

Look back over the conversation and pull out:

1. **The task that was actually solved** — stated as a recurring situation, not a one-off ("set up X", "debug Y class of failure").
2. **The working procedure** — the steps/commands/decisions that led to success, in order.
3. **The failures and gotchas** — what was tried first and *why it didn't work*. This is the highest-value part: per the gist, the value is in sharing failures. Keep the "why", not just the fix.
4. **Deterministic steps worth scripting** — if a step was a fixed command or transform, note it as a candidate for a `scripts/` file rather than prose.

## Procedure

1. **Summarize the candidate** to the user in a few lines: the recurring task, the procedure, the gotchas. Confirm this is worth codifying.
2. **Apply the three-condition filter** (from skill-creator): does it solve a problem, is it reproducible, is it novel? If it's a one-off or trivially obvious, say so and stop — a memory may be enough instead.
3. **Draft the skill**:
   - `name` (kebab-case), `description` with the trigger words the user would actually say next time.
   - Body = the working procedure + a **"Gotchas / what didn't work"** section preserving the failures and their reasons.
   - If a step was deterministic, write it as a `scripts/` file and reference it from the body (progressive disclosure).
4. **Write** `<repo>/<category>/<name>/SKILL.md` (and any `scripts/`), following skill-creator's conventions.
5. **Install & verify**: run `./install.sh`; check `name` matches the directory and the trigger words are concrete.
6. **Inform**: new skills load at session start (`/clear` or a new session).

## Notes

- Prefer one focused skill over a grab-bag. If the session covered two unrelated things, extract two skills (or ask which one).
- Don't invent steps that didn't happen. Codify what the session actually established; mark anything uncertain as "unverified" rather than asserting it.
