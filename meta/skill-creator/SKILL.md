---
name: skill-creator
description: Meta-skill for creating a new Claude Code skill in this repository, or bringing an existing skill in line with the conventions. Use this when the user says "I want to create a skill", "add a skill", "write a SKILL.md", "turn this workflow into a skill", or "I need a skill scaffold".
---

# skill-creator — A skill that creates skills

Interactively generate and validate a new skill that follows the conventions of this repository (`agent-skills`).

## Repository layout (background)

- Skills live under a category folder as `<category>/<skill-name>/SKILL.md` (e.g. `meta/skill-creator/`). This repo is a *distribution source*.
- Categories are for organizing the repo only. `install.sh` links skills **flat** into `~/.claude/skills/` by their own folder name, so the frontmatter `name` matches the skill's directory basename — no category prefix.
- To use a skill elsewhere, run `./install.sh` (this machine) or copy the folder from GitHub (other machines). A `.claude/skills/` symlink is git-ignored.

```
agent-skills/
└── meta/
    ├── skill-creator/SKILL.md
    ├── retrospective-codify/SKILL.md
    └── double-check/SKILL.md
```

When creating a new skill, place it under the right category (create a new one if needed, e.g. `cg/`, `webgl/`, `testing/`). Use `meta/` for skills that operate on skills/plans/process.

## SKILL.md conventions

The frontmatter requires `name` and `description`. `compatibility` (required tools or dependencies — rarely needed) is optional.

```markdown
---
name: <kebab-case; must match the directory name>
description: <when to use it, stated concretely; pack in the triggering words/situations>
---

# Body (steps, rules, domain knowledge)
```

Rules:
- `name` is kebab-case and matches the directory name.
- The `description` is what makes the skill trigger. Claude decides whether to fire based on the description alone, so list the words and situations the user is likely to say. Be "pushy" — explicitly state the contexts where the skill applies. Vague descriptions cause missed triggers or misfires.
- Avoid heavy use of rigid all-caps commands like `ALWAYS`/`NEVER` in the body. Explaining *why* a step matters makes Claude follow it more reliably.
- The body can be long (it is read only when the skill fires). Put steps, checklists, and examples in it.

### Progressive disclosure (three layers)

Design a skill in three layers with different loading costs. The heavier the content, the further out it should live.

1. **Metadata (~100 words)** — `name` + `description`. Always in context. Keep it minimal.
2. **SKILL.md body (ideally under 500 lines)** — the steps and rules read when the skill fires.
3. **Bundled resources (unlimited size)** — read only when needed. Put them in the standard directories below.

```
skill-name/
├── SKILL.md          # required
├── scripts/          # executable code (script out deterministic work instead of letting the LLM do it)
├── references/       # detailed docs/specs (referenced from the body: "read this when ...")
└── assets/           # templates, icons, fonts, etc.
```

Move details that don't fit in the body, or that aren't needed every time, into `references/`, and point to them from the body ("when doing X, read `references/foo.md`"). This keeps the body — the layer read every time — thin.

## Three conditions for a good skill (from mizchi's meta-skill writing)

1. **It solves a problem** — it moves a concrete task forward.
2. **It is reproducible** — the same steps yield the same result.
3. **It is novel** — don't build something already covered by an existing skill or by Claude's baseline ability.

Ask whether these three hold before building. If not, a memory or a one-shot instruction is probably enough.

## Steps (when this skill is invoked)

1. **Gather requirements** (ask only about what's unclear; decide what you can):
   - Skill name (kebab-case) and its category folder (e.g. `meta/`, `cg/`, `testing/`)
   - The concrete task / situation to solve
   - Triggering conditions (how should the user phrase things to fire it)
   - The steps, knowledge, and prohibitions for the body
   - Whether bundled files are needed (scripts, templates, references)
2. **Three-condition check** — confirm it solves a problem, is reproducible, and is novel. If doubtful, tell the user "a memory may be enough rather than a skill".
3. **Generate**:
   - Create `<repo>/<category>/<name>/SKILL.md` (following the conventions above).
   - Create bundled files in the same directory if needed.
4. **Make it usable**: run `./install.sh` (links every skill, any category, flat into `~/.claude/skills/`).
5. **Validate**:
   - Does the frontmatter `name` match the skill's directory basename?
   - Does the `description` concretely include triggering words?
   - Is the symlink in place (`ls -la ~/.claude/skills/<name>`)?
   - Does it pass the genericity check below?
6. **Inform**: tell the user "new skills are loaded at session start; if this session doesn't see it yet, restart (`/clear` or a new session)".

## Genericity check (no project-specific content)

This repo is a *distribution source* — a skill written here should work for whatever project the installing user brings, not just the one it was extracted from. Run this check on every new or edited skill, not only ones built from a session's trial-and-error (via [retrospective-codify](../retrospective-codify/SKILL.md)) — that path is the highest-risk one, since it distills real work on one real project by construction.

- **Scripts must be fully parameter-driven.** Grep `scripts/*` for anything that looks like a specific project's names, IDs, hardcoded paths outside the repo, or one app's internal object model. A reusable script takes that as a config/argument; it never assumes it.
- **Prose may use ONE concrete worked example — but it must be labeled.** A worked example (real object names, a real config, a real bug that was hit) is valuable and worth keeping — it's what gives a skill novelty over generic advice. The failure mode is letting that example's vocabulary bleed into what reads as a *general rule*, so a reader for a different project can't tell which parts to keep and which to swap out. Structure this as: general principles stated in project/genre-neutral terms, then a clearly headed "Worked example: <specific case>" section applying them, explicitly told to adapt rather than copy.
- **Don't generalize away the "why."** When you do split principle from example, re-derive by comparing line-by-line against the source material (the session, or the original doc) — it's easy to keep the abstracted rule but silently drop the concrete diagnostic reasoning that made it a real "gotcha" (e.g. *why* a bug happened, not just that it did). That reasoning belongs in the Worked example section, not nowhere.
- **Prerequisites that determine whether the skill can even run belong in `compatibility` (frontmatter), not only in the body.** Hard environment requirements (a display/headed browser, a specific binary on PATH, a running local server) are decide-to-trigger information — surface them at the metadata layer; keep the install/detail steps in the body.

## Iteration cycle (a skill is never done in one shot)

The improvement loop the official guidance recommends:

```
draft → test (actually invoke it) → user review → improve (tune description/body) → repeat
```

In particular, you can't know how well a `description` triggers until you invoke it with various phrasings. Adjust the triggering words when you see missed triggers or misfires.

### Optional: quantitative evaluation with evals

For a skill whose triggering or output quality you want to track over time, add `evals/evals.json` to its directory (test prompts + expected behavior + assertions). Run the test cases, grade pass/fail, and confirm the effect of changes numerically. Not needed for small skills — consider it for skills you intend to grow or share with a team.

## Anti-patterns (don't build / do fix)

- A description that only says "assists with X" with no triggering words → no one knows when it fires, so it sits dead.
- A body that is only generalities with no concrete steps → no advantage over Claude's baseline ability (no novelty).
- Cramming unrelated features into one skill → split it.
- One project's specific names/paths/object-model woven into what reads as a general rule, with no labeled example boundary → split into general principle + labeled "Worked example" (see Genericity check above).
