---
name: double-check
description: Meta-skill that independently re-derives ("検算") a plan or an implementation to confirm it is actually correct, instead of trusting the agent's own summary. Invoke ONLY when the user explicitly asks, e.g. "検算して", "この計画を見直して", "本当にこれで合ってる？", "ダブルチェックして", "cross-check this plan/implementation". Do NOT auto-invoke.
---

# double-check — 検算 (independent re-derivation)

Re-verify a plan or an implementation by deriving the answer **independently from primary sources** (the actual code, files, specs) — not by re-reading and agreeing with the plan or the prior summary.

Treat the thing being checked as a **claim to be refuted**: default to skeptical. This is distinct from the built-ins — `/code-review` hunts for bugs in a diff, `/verify` runs the app; this skill checks whether the *reasoning* and the *intent-match* hold up.

## When to use

Explicit invocation only. The user wants a second, adversarial pass over a plan (before coding) or over an implementation (often after auto-mode already wrote it). Do not fire automatically.

## Two modes

### Mode A — Plan check (before implementation)

Verify the plan against reality *before* any code is written:

- **Assumptions (前提)** — for each assumption the plan states or implies, check it against the real codebase. Does that file / function / API / type actually exist and behave as assumed? Read it; don't take the plan's word.
- **Requirement coverage (要件カバレッジ)** — list every part of the user's request, map each to a plan step, and flag anything unaddressed.
- **Contradictions & ordering (矛盾/順序)** — internal contradictions, missing prerequisites, steps in the wrong order.
- **Missed alternatives & risks** — is there a simpler or more correct approach the plan overlooked? What would break?

### Mode B — Implementation check (after code is written; common in auto-mode)

The code already exists (in auto-mode the agent may have written it without asking). Re-derive whether the diff actually does what the intent requires:

- **Read the real changed files** — do not trust the summary of what was done.
- **Map each requirement / plan step to where it is satisfied** in the code; flag unmet or partial ones.
- **Check failure modes** — edge cases, error handling, and whether anything adjacent was broken.
- **Remediation** — if there are discrepancies, propose a concrete fix. If auto-mode wrote something wrong, state the remediation path (revert vs patch) explicitly.

## Procedure

1. **Identify the target & intent** — is this checking a plan, a diff, or both? Restate the underlying intent / requirements in one or two lines; confirm if unclear.
2. **Re-derive from sources** — read the actual files, code, and specs involved. Reach the conclusion yourself before comparing it to the plan/implementation.
3. **Verdict per item** — mark each ✅ confirmed / ⚠️ uncertain / ❌ wrong, each with evidence (`file:line`) and the reasoning that supports it.
4. **Fixes** — for every ❌/⚠️, give a concrete correction or the next check needed.
5. **Overall judgment** — end with: safe to proceed *or* needs changes, plus the top 1–3 risks.

## Rules

- Re-reading the plan and nodding is failure. The whole point is **independent derivation** from sources.
- If a claim cannot be verified from sources, mark it **unverified** — never pass it as confirmed.
- Don't invent problems to look thorough; a clean item is a valid result, but say what evidence makes it clean.
