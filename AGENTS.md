# Rules for agents editing this repo

This repo is **public**. Every committed line is published, and skills are installed onto other people's machines.
Most edits arrive from a session working in some other project (a skill updated from what was just learned there),
so that project's names travel with them unless something stops them.

## Every edit, by any route

Whether you use `meta/skill-creator`, `meta/retrospective-codify`, or edit a file directly (also through the
`~/.claude/skills/<name>` symlinks, which point here):

1. **Write in neutral terms.** No names of a company, product, game, team, person, internal host or channel; no
   absolute home paths, e-mail addresses, workspace links (Slack, claude.ai artifacts / sessions, Google Docs) or
   secrets. Examples use placeholders ("My Game", `stage1-03`, `~/dev/...`). A real worked example is fine only when
   it names nothing private, and it is labeled as an example (`meta/skill-creator/SKILL.md`, "Genericity check").
   Watch the small places: example values in script docstrings, placeholder text in templates, quoted user comments,
   sample file names, lessons phrased in the source project's vocabulary.
2. **Scan before you report the change as done**, not only at commit time:
   `scripts/check-public.sh --all` (whole tree) — fix every hit by rewording, never by weakening the script.
3. **Commit only with the hook on.** `git config core.hooksPath .githooks` (`install.sh` sets it); the pre-commit hook
   runs `scripts/check-public.sh` on the added lines. Never `--no-verify`.

`scripts/check-public.sh` checks generic patterns, plus the private terms in `.public-check.local` (gitignored, one
regex per line: your company / products / games / hosts / people). Without that file only the generic rules run, so
create it on every machine you commit from.

If something private was already pushed, rewording it in a new commit stops new copies but the history keeps it;
tell the user, and leave any history rewrite to them.
