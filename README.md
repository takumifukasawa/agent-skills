# agent-skills

A collection repository that aggregates Claude Code skills (Agent Skills).

## What a skill is

A self-contained directory + a single `SKILL.md` — an instruction sheet telling Claude *when* and *how* to act.
Only the `description` in the frontmatter is scanned at all times; the body is loaded and executed when the skill looks relevant.

```markdown
---
name: my-skill          # kebab-case; must match the directory name
description: when to use this skill (be concrete about triggering words)
---

# Body (steps, rules, knowledge — can be long, since it's read only when triggered)
```

## Repository layout

This repository is a *distribution source*. Skills are organized into category folders, each skill being a `<category>/<skill-name>/SKILL.md`.

```
agent-skills/
└── meta/                          # category
    ├── skill-creator/SKILL.md     # create a skill interactively
    ├── retrospective-codify/SKILL.md  # extract a skill from a session
    └── double-check/SKILL.md      # independently re-derive a plan/impl (検算)
```

Categories are for organizing this repo only. `install.sh` links skills **flat** into `~/.claude/skills/` by their directory name (e.g. `~/.claude/skills/skill-creator`), so the frontmatter `name` matches the skill's own folder name — no category prefix needed. The `.claude/skills/` symlinks are git-ignored.

## Using skills (distribute to another PC / repo)

Claude Code loads skills from these locations at session start:

| Location | Scope |
|---|---|
| `~/.claude/skills/` | all of your projects and sessions |
| `<repo>/.claude/skills/` | that project only |

**On this machine (all repos):** run `./install.sh` to symlink *every* skill in this repo into `~/.claude/skills/`. Re-run it after adding a new skill — that's the whole workflow.

```bash
./install.sh        # links every <skill>/SKILL.md into ~/.claude/skills/
```

**On another machine:** copy the folder from GitHub (the copy lives on each machine; no symlink needed).

```bash
# copy a single skill (degit; re-run to update) — note the category in the path
npx degit takumifukasawa/agent-skills/meta/skill-creator ~/.claude/skills/skill-creator

# or clone and run install.sh there (links every skill, any category)
git clone https://github.com/takumifukasawa/agent-skills ~/dev/agent-skills
cd ~/dev/agent-skills && ./install.sh
```

New skills are loaded at session start. If a skill isn't recognized, start a new session or run `/clear`.

### Testing a skill inside this repo (local development)

When you want to try a skill under development in a session opened on this repo, symlink it into `.claude/skills/` (not committed):

```bash
ln -snf ../../skill-creator .claude/skills/skill-creator
```

## Creating a new skill

Invoke the `skill-creator` skill — it interactively generates a scaffold that follows the conventions, symlinks it, and validates it.
(It fires when you say things like "I want to create a skill" or "turn this workflow into a skill".)

## Skills

### meta

| Skill | Description |
|---|---|
| [skill-creator](./meta/skill-creator/SKILL.md) | Create a skill interactively / align it with the conventions |
| [retrospective-codify](./meta/retrospective-codify/SKILL.md) | Extract a reusable skill from the current session's trial-and-error |
| [double-check](./meta/double-check/SKILL.md) | Independently re-derive (検算) a plan or implementation to confirm correctness |

## References

- [anthropics/skills](https://github.com/anthropics/skills) — official collection + spec (`spec/`) + template (`template/`). `skills/skill-creator` and `skills/mcp-builder` are meta-skills. The conventions here follow this.
- [mizchi/skills](https://github.com/mizchi/skills) — community collection distributed via APM.

### Design principles

- **Progressive disclosure** — (1) metadata (~100 words) → (2) body (<500 lines) → (3) bundled resources (unlimited). The heavier the content, the further out it lives.
- **Standard resource directories** — `scripts/` (executable code) / `references/` (docs) / `assets/` (templates, images).
- **Make the description "pushy"** — be concrete about *when* to use it. Triggering is decided by this alone.
- Prefer explaining *why* a step matters in the body over rigid `ALWAYS`/`NEVER` commands.
