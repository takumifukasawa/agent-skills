# agent-skills

[日本語](./README.ja.md)

A collection of Claude Code skills (Agent Skills), distributed as a plugin marketplace with one plugin per category.

## Install

### Claude Code (recommended): as plugins

```
/plugin marketplace add takumifukasawa/agent-skills
/plugin install meta@takumifukasawa-agent-skills
/plugin install gamedev@takumifukasawa-agent-skills
/plugin install blog@takumifukasawa-agent-skills
```

Install only the categories you want, then run `/reload-plugins` (or start a new session). Plugin skills are namespaced (`/gamedev:mobile-audio-render`) and still trigger from their `description`.

To update: `/plugin marketplace update takumifukasawa-agent-skills`, then `/plugin update <plugin>@takumifukasawa-agent-skills` — or enable auto-update for the marketplace in `/plugin`. No `version` is set, so every commit is a new version.

If you registered this marketplace under its old name `takumi-agent-skills`, remove it and add it again:

```
/plugin marketplace remove takumi-agent-skills
/plugin marketplace add takumifukasawa/agent-skills
```

### Codex, or a machine without the plugin: symlink / copy

**Do not combine this with the plugin in the same Claude profile**: both load, so each skill appears twice.

```bash
git clone https://github.com/takumifukasawa/agent-skills ~/dev/agent-skills
cd ~/dev/agent-skills && ./install.sh            # links every skill flat into ~/.claude/skills/
DEST="/path/one /path/two" ./install.sh          # link into multiple destinations (e.g. a second profile)
```

Re-run `./install.sh` after adding a new skill. To avoid typing `DEST=...` every time, put `DEST="..."` in a gitignored `.install.local.sh` next to `install.sh` — it's sourced automatically.

A single skill can be copied without cloning (re-run to update; note the category in the path):

```bash
npx degit takumifukasawa/agent-skills/meta/skill-creator ~/.claude/skills/skill-creator
```

**Windows (native PowerShell, no WSL):** use `install.ps1`.

```powershell
./install.ps1                           # copies every skill into %USERPROFILE%\.claude\skills\
./install.ps1 -Link                     # link instead of copy — edits apply without re-running
./install.ps1 -Dest 'C:\one','C:\two'   # install into multiple destinations
```

A gitignored `.install.local.ps1` (setting `$Dest = @('...', '...')`) is dot-sourced when `-Dest` isn't passed. It **copies** by default, so re-run it after `git pull` or after editing a skill. `-Link` uses directory junctions (no admin rights or Developer Mode needed, works across drives), falling back to a symlink and then to a copy. If PowerShell refuses to run the file (`UnauthorizedAccess`), run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or `powershell -ExecutionPolicy Bypass -File .\install.ps1`. Inside WSL, use `./install.sh`.

Skills are loaded at session start. If a skill isn't recognized, start a new session or run `/clear`.

## Skills

Each skill folder has a `SKILL.md` (what Claude reads) and a `README.ja.md` (a Japanese explanation for people).

### meta

| Skill | Description |
|---|---|
| [skill-creator](./meta/skill-creator/SKILL.md) | Create a skill interactively, or align an existing one with the conventions |
| [retrospective-codify](./meta/retrospective-codify/SKILL.md) | Extract a reusable skill from the current session's trial-and-error |
| [double-check](./meta/double-check/SKILL.md) | Independently re-derive (検算) a plan or implementation to confirm it is correct |
| [context-catchup](./meta/context-catchup/SKILL.md) | At session start, read docs, memory and VCS state into a "where are we" briefing (repos without agent-harness) |
| [context-handoff](./meta/context-handoff/SKILL.md) | Before ending a session, bring docs and memory up to date and leave a resume point (repos without agent-harness) |
| [task-eta](./meta/task-eta/SKILL.md) | Check progress and estimate time remaining on a background Claude Code task |
| [orchestrator-model-split](./meta/orchestrator-model-split/SKILL.md) | Split models between the orchestrator and subagents (`CLAUDE_CODE_SUBAGENT_MODEL`) and know where the default does not apply |

### blog

| Skill | Description |
|---|---|
| [blog-review](./blog/blog-review/SKILL.md) | Review a Markdown blog article for content, Japanese proofreading, and platform-format checks |

### cosense

| Skill | Description |
|---|---|
| [vocab-add](./cosense/vocab-add/SKILL.md) | Add one term to the Cosense (Scrapbox) vocabulary stock, reading the format rules from Cosense itself |

### gamedev

| Skill | Description |
|---|---|
| [game-icon-from-screenshot](./gamedev/game-icon-from-screenshot/SKILL.md) | Generate a square app icon by screenshotting the real running game |
| [game-store-assets](./gamedev/game-store-assets/SKILL.md) | Generate store screenshots, a feature graphic and listing text from the real running game, and a picker page (Artifact) to choose the set, app icons included |
| [game-gameplay-video](./gamedev/game-gameplay-video/SKILL.md) | Capture real gameplay video of a web/canvas game and cut it into a finished ad video |
| [version-history-update](./gamedev/version-history-update/SKILL.md) | Update a per-version changelog from the repo's version signals (AB variants, analyses, rollout tables) |
| [mobile-audio-render](./gamedev/mobile-audio-render/SKILL.md) | Find and fix Web Audio crackle/pops on real phones (Android Chrome) and heavy three.js rendering, with on-device audio tracing over USB |
| [verify-in-unity](./gamedev/verify-in-unity/SKILL.md) | Self-verify a change inside the Unity Editor via Unity MCP: compile check, play mode, driving the UI, logs/asserts/screenshots, restore |

## Repository layout

Skills are organized into category folders, each skill being `<category>/<skill-name>/`. Each category is one plugin in `.claude-plugin/marketplace.json`.

```
agent-skills/
├── .claude-plugin/marketplace.json   # one plugin per category, listing its skills
├── meta/
│   └── skill-creator/
│       ├── SKILL.md                  # what Claude reads (drives behavior)
│       └── README.ja.md              # Japanese explanation for people
├── blog/
└── gamedev/
```

Categories are for organizing this repo only. `install.sh` links skills **flat** into `~/.claude/skills/` by their directory name, so the frontmatter `name` matches the skill's own folder name — no category prefix.

### Languages

- **`SKILL.md` body and `references/`: English or Japanese**, whichever is easier to write and maintain. Claude follows either equally well.
- **`description`: include the phrases users actually type**, Japanese trigger phrases included. Triggering is decided by the `description` alone, so this matters more than the body's language.
- **`README.ja.md`: a Japanese entry point for people**, in every skill folder (plus this repo's `README.ja.md`). Claude never loads it, so it has no effect on behavior. When the `SKILL.md` body is already Japanese, a short summary and when-to-use is enough. Keep it in sync when a skill changes.

## Developing skills

- **Create one**: invoke the `skill-creator` skill ("I want to create a skill", "turn this workflow into a skill"). It generates a scaffold that follows the conventions.
- **Register it**: add the skill to its plugin's `skills` list in `.claude-plugin/marketplace.json`, and check with `claude plugin validate .`.
- **Bundled files** are referenced as `${CLAUDE_SKILL_DIR}/scripts/...` in SKILL.md, because a plugin runs from a cache copy, not from this checkout.
- **Keep it public-safe**: this repo is public. Agents follow [AGENTS.md](./AGENTS.md): neutral terms only, `scripts/check-public.sh --all` before calling an edit done, and commits through the pre-commit hook (`git config core.hooksPath .githooks`, set by `install.sh`). Put your private terms (company / product / game / host names) in a gitignored `.public-check.local`, one regex per line.
- **Try one inside this repo**: symlink it into `.claude/skills/` (git-ignored), e.g. `ln -snf ../../meta/skill-creator .claude/skills/skill-creator`.

### What a skill is

A self-contained directory + a single `SKILL.md` — an instruction sheet telling Claude *when* and *how* to act. Only the `description` in the frontmatter is scanned at all times; the body is loaded when the skill looks relevant.

```markdown
---
name: my-skill          # kebab-case; must match the directory name
description: when to use this skill (be concrete about triggering words)
---

# Body (steps, rules, knowledge — can be long, since it's read only when triggered)
```

### Design principles

- **Progressive disclosure** — (1) metadata (~100 words) → (2) body (<500 lines) → (3) bundled resources (unlimited). The heavier the content, the further out it lives.
- **Standard resource directories** — `scripts/` (executable code) / `references/` (docs) / `assets/` (templates, images).
- **Make the description "pushy"** — be concrete about *when* to use it. Triggering is decided by this alone.
- Prefer explaining *why* a step matters in the body over rigid `ALWAYS`/`NEVER` commands.

## References

- [anthropics/skills](https://github.com/anthropics/skills) — official collection + spec (`spec/`) + template (`template/`). The conventions here follow this.
- [mizchi/skills](https://github.com/mizchi/skills) — community collection distributed via APM.
