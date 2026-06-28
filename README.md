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

This repository is a *distribution source*. Skills are a plain collection of folders, each `<skill-name>/SKILL.md` at the root.

```
agent-skills/
└── skill-creator/SKILL.md    # meta-skill that creates skills
```

The `.claude/skills/` symlinks are only a local convenience for testing skills, and are git-ignored (not distributed).

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
# copy a single skill (degit; re-run to update)
npx degit takumifukasawa/agent-skills/skill-creator ~/.claude/skills/skill-creator

# or clone and run install.sh there
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

| Skill | Description |
|---|---|
| [skill-creator](./skill-creator/SKILL.md) | Meta-skill that creates skills / aligns them with the conventions (official-compliant) |

## References

- [anthropics/skills](https://github.com/anthropics/skills) — official collection + spec (`spec/`) + template (`template/`). `skills/skill-creator` and `skills/mcp-builder` are meta-skills. The conventions here follow this.
- [mizchi/skills](https://github.com/mizchi/skills) — community collection distributed via APM.

### Design principles

- **Progressive disclosure** — (1) metadata (~100 words) → (2) body (<500 lines) → (3) bundled resources (unlimited). The heavier the content, the further out it lives.
- **Standard resource directories** — `scripts/` (executable code) / `references/` (docs) / `assets/` (templates, images).
- **Make the description "pushy"** — be concrete about *when* to use it. Triggering is decided by this alone.
- Prefer explaining *why* a step matters in the body over rigid `ALWAYS`/`NEVER` commands.
