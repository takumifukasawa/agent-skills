---
name: orchestrator-model-split
description: Set up and run Claude Code with a model split between the orchestrator (main loop) and subagents/workers — e.g. orchestrator on Opus, cheap fan-out workers on Sonnet/Haiku. Configures CLAUDE_CODE_SUBAGENT_MODEL in settings.json and explains where the default does NOT apply (Workflow agent() calls, forks). Trigger phrases: "オーケストレーターを○○に", "サブエージェントのモデルを変えたい/opusにしたい", "モデル分担", "実行側だけ強いモデルにして", "set subagent model", "CLAUDE_CODE_SUBAGENT_MODEL", "orchestrator/worker model split", "spawn agents on a different model".
---

# orchestrator-model-split

Run multi-agent work with two model tiers: the **orchestrator** (the main conversation loop — planning, integrating, deciding) on one model, and **execution subagents** (search, implementation, verification) on another. This skill covers how to configure it durably and the runtime rules where the configured default silently does not apply.

Why split at all: the orchestrator's job is mostly control flow over already-summarized results, while subagents do the heavy reading/reasoning. Choosing which tier goes where — strong workers, or cheap fan-out workers under a strong orchestrator — is where the leverage is.

**Baseline (as of 2026-10): orchestrator on Opus 5.5.** It has proven the better orchestrator in practice; use it unless there is a reason not to. The split then means picking the workers' tier — keep them on Opus by default and drop specific spawns to a lower tier — rather than moving the orchestrator.

## Setup (durable, per-user)

1. Set the **orchestrator model** the normal way: the user runs `/model` and picks the main-loop model. This is saved as their default for new sessions; no file editing needed.
2. Set the **subagent default model** via env var in `~/.claude/settings.json` (user scope — this is a personal preference, not a project setting):

   ```json
   {
     "env": {
       "CLAUDE_CODE_SUBAGENT_MODEL": "opus"
     }
   }
   ```

   - **Read the file first and merge** — never overwrite other keys, and if an `env` block already exists, add the key inside it.
   - Model value can be an alias (`"opus"`, `"sonnet"`, `"haiku"`) or a full model id. An alias tracks the latest model of that family automatically, which is usually what "the top X" means.
3. Validate the edit: `jq -e '.env.CLAUDE_CODE_SUBAGENT_MODEL' ~/.claude/settings.json` must print the value. Broken JSON silently disables the whole settings file.

## Timing caveat

`env` from settings.json is read at session start. The change reliably applies **from the next session**. For the current session, pass the model explicitly on each spawn (see below) to get the same behavior immediately.

## Runtime rules — where the default applies and where it doesn't

| Spawn path | Model used |
|---|---|
| `Agent` tool, no `model` param | `CLAUDE_CODE_SUBAGENT_MODEL` default (once active) |
| `Agent` tool with `model: "..."` | the explicit param (wins over everything) |
| `Agent` tool with a custom agent type whose definition declares a model | the definition's model (explicit param still overrides) |
| custom agent type whose definition says `model: inherit` | **the parent (orchestrator) model — the frontmatter beats `CLAUDE_CODE_SUBAGENT_MODEL`**; omit the `model` line to fall through to the env default |
| `subagent_type: "fork"` | **always the parent model — cannot be overridden** |
| `Workflow` script `agent()` calls | **inherits the main-loop model, NOT the subagent env default** — pass `opts.model` explicitly per call |

The bold rows are the traps: `model: inherit` in an agent definition silently overrides the env default (resolution order: spawn-time `model` > definition frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` > main-loop model), a fork deliberately stays on the orchestrator's model, and Workflow scripts need `{model: '...'}` written into each `agent()` call or phase you want on the worker tier.

## Verification

- Config level: the `jq` check above.
- Behavior level (optional): spawn a trivial agent and ask it to report the model named in its own system prompt ("You are powered by the model named ..."). Cheap and conclusive.

## Worked example: Opus 5.5 orchestrator (adapt, don't copy verbatim)

The setup in use as of 2026-10:

- `/model` → `opus` saved as the session default (orchestrator on Opus 5.5).
- `~/.claude/settings.json` has `"env": {"CLAUDE_CODE_SUBAGENT_MODEL": "opus"}` merged in next to the existing keys. Setting it explicitly (rather than relying on "same as main") keeps workers on Opus even in a session where the main loop is temporarily switched to another model. The alias `"opus"` tracks the newest Opus instead of pinning an id.
- Operating rules: plain `Agent` spawns need no `model` param. Cheap, wide fan-out (search sweeps, many parallel reviewers that would otherwise hit rate limits) passes `model: "sonnet"` or `"haiku"` per spawn. Workflow scripts write `opts.model` per `agent()` call whenever a call should differ from the main loop. Forks stay on Opus by design.

Earlier (2026-08) this skill was extracted from the reverse split — orchestrator on Fable, workers on Opus. The mechanics are identical; only the two model names change.

## In agent-harness repos

Repos with agent-harness installed pick the implementer/reviewer model per task in `task-orchestrate` (`stages.json`'s `model`, passed at spawn time), which wins over the defaults set here. Use this skill for the per-user defaults; let `task-orchestrate` decide per task.
