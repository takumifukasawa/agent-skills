---
name: leak-audit
description: Audit a git repo for information that must not be published — secrets and tokens, credential files (.env, keys), absolute home paths, e-mail addresses, private workspace links (Slack, Google Docs, claude.ai), internal hosts, and the user's own private terms (company / product / game / teammate names) — across the working tree, the staged diff, unpushed commits AND the full git history including commit messages and author identities. Then plan the remediation (reword vs. rewrite history vs. recreate the repo, rotate secrets, and chase down copies: other clones, forks, plugin marketplace clones, caches). Use when the user says "機密情報検査", "入っちゃいけない情報を検査して", "漏れてないか確認", "公開前チェック", "public にして大丈夫?", "push して大丈夫?", "履歴に残ってない?", "社名が入ってないか", "secret scan", "leak check", "audit before making the repo public", or after something private was found already pushed.
---

# leak-audit — find what must not be published, then clean it up properly

A leak is rarely only in the files you see. It sits in an old commit that a later commit "fixed", in a commit
message, in the author e-mail, in a deleted `.env`, and in every copy of the repo that already pulled it. This skill
scans all of those layers and then plans the cleanup so the user does not stop at "reworded the line" while the
history still serves the original.

## 1. Scope the audit

Ask only if unclear; otherwise pick from context:

| Situation | Modes to run |
|---|---|
| About to commit | `--staged` |
| About to push | `--range @{u}..HEAD` (or `origin/main..HEAD` when there is no upstream) |
| About to make a repo public / publish a package / "is this safe?" | `--tree` **and** `--history` |
| Something private was found already pushed | `--history`, then step 4 |

Before any history scan, `git fetch --all --prune` (and `--tags`): the remote often has branches and commits the
local clone has not seen, and those are what the public sees.

## 2. Collect the private terms

The generic patterns cannot know the user's company, products, games, teammates or internal hosts — and those are
the leaks that matter most in a personal or work-adjacent repo. Before scanning:

- If the repo has `.public-check.local` (one regex per line), the script uses it automatically.
- Otherwise ask the user for the names that must not appear, and write them to a file **outside the repo or
  gitignored** (e.g. the scratchpad). The list itself is private: never commit it, never paste it into an issue/PR.
- Include likely variants: romanized and native spellings, the company's e-mail domain, abbreviations and short
  repo-name prefixes (a project is often named only by its repo slug), the internal hostname, the GitHub org,
  teammates' handles, the user's real name, past projects' asset names. Case is ignored.
- Vendor names (ad / analytics / attribution SDKs, cloud projects) are worth a look too: in a "generic template"
  repo they reveal what business it came from. Add them to a one-off terms file and judge each hit.

## 3. Scan

```bash
${CLAUDE_SKILL_DIR}/scripts/scan.sh --tree    [--terms FILE]
${CLAUDE_SKILL_DIR}/scripts/scan.sh --history [--terms FILE]
```

Run it from inside the target repo. It reports per rule: home paths, e-mails, private workspace links, token-shaped
secrets, `password = "..."`-style assignments, internal hosts / private IPs, sensitive file names (`.env`, `id_rsa`,
`*.pem`, `credentials.json`, ...) and private terms. History modes add commit messages, every file ever added, and
ref names (branches, tags, remote branches), cherry-pick provenance lines (`(cherry picked from commit <sha>)`
points at a private repo), lockfile registry URLs that are not the public registry, and INFO lists of author /
committer identities and of commits made in the GitHub web UI. Exit 1 means hits.

If `gitleaks` or `trufflehog` is installed, also run it (`gitleaks git -v .`) — they know hundreds of vendor token
formats; this script knows the common ones plus the user's private terms, which those tools do not.

The script does not see everything. Also check, by hand:
- **GitHub-side metadata**: PR titles, bodies and branch names, issues, releases
  (`gh pr list --state all --json number,title,headRefName,body`, `gh issue list --state all`, `gh release list`).
- **Binary metadata**: images and documents can carry author / software / GPS tags (`exiftool -a -G1 <file>`).
- **The tooling that writes into this repo**: if a script syncs or cherry-picks commits from a private repo into a
  public one, it is the source of leaks, not a one-off — look for the repo's basename in branch names,
  `cherry-pick -x`, and copied commit messages, and fix the script along with the history.
- **Commit message text** beyond names: a "generic" repo's messages can describe the private product concretely
  (its UI, levels, features). Read the subjects and bodies of commits brought in from elsewhere.

Then **triage each hit yourself** rather than dumping the list on the user:
- **False positive** (placeholder, `example.com`, a documented pattern): note it and move on. If the repo has its
  own checker, prefer rewording the line over loosening the checker.
- **Real, only in the working tree / staged**: reword in neutral terms (placeholder, `~/...`, "your game").
- **Real and in history** (hit location is `<commit>:file`, or a `COMMIT_MSG`): rewording alone is not enough — go
  to step 4.
- **Author identity**: show it as information. A personal e-mail in commits is the owner's decision; if unwanted,
  the fix is a history rewrite with a noreply address (GitHub: `<id>+<user>@users.noreply.github.com`). Commits
  made in the GitHub web UI (initial commit, PR merges) use the account's **primary** e-mail, so a work address can
  appear even when every local commit uses a personal one.

Report as a short table: what, where (latest location + first commit), severity (secret > private name > path/e-mail),
and the proposed fix.

## 4. Remediate (when it is in history or already pushed)

Read `references/remediation.md` for the full playbook. The decisions, in order:

1. **A live secret → revoke / rotate it first.** Once pushed to a public repo, assume it was scraped within minutes.
   Rewriting history does not un-leak a credential; rotation does. Do this before anything else.
2. **Choose how to remove it from history**, by where it got to:
   - not pushed yet → rewrite the local commits (amend / rebase / recommit); done.
   - pushed, no PR ever referenced it → `git filter-repo` + force push.
   - pushed and a PR (open or closed) contains it → GitHub keeps `refs/pull/*` and the owner cannot delete them,
     so force push is not enough: delete and recreate the GitHub repo.
   Rewriting published history needs explicit user approval; say what will break (open PRs, forks, other clones).
3. **Chase down every copy.** The rewritten remote does not reach copies that already exist: other machines' clones,
   forks, CI caches, package registries, and tool-managed clones such as Claude Code plugin marketplaces under
   `<config dir>/plugins/marketplaces/` and `<config dir>/plugins/cache/`. Check each and refetch or delete.
4. **Verify**: re-run `scan.sh --history` on a fresh clone of the remote, and confirm the old commit id no longer
   resolves (`git cat-file -t <old-sha>` fails) in every local copy you cleaned.
5. **Prevent recurrence**: offer a pre-commit hook that runs `scan.sh --staged` with the terms file (see the
   reference for a 3-line hook), and a gitignored terms file on each machine that commits.

Actions that touch a remote (force push, deleting/recreating a repo) or delete local data are outward-facing and
hard to reverse: confirm with the user before each, even mid-flow.
