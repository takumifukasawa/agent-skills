# Remediation playbook

Read this when a real hit is in git history or has already been pushed.

## 0. Secrets first

If the hit is a credential (API key, token, password, private key, webhook URL):

1. Revoke or rotate it at the issuer **now** (cloud console, GitHub settings, Slack app config, ...).
2. Check the issuer's access logs for use since the leak.
3. Only then clean history. Cleaning history without rotating leaves a working credential in every scraped copy.

GitHub's secret scanning may already have notified the issuer for well-known token types; still rotate.

## 1. Pick the removal strategy

Where the leak got to decides the minimum:

- **Not pushed**: rewrite the local commits (amend, rebase, or recommit); nothing else.
- **Pushed, never in a PR**: rewrite history (`filter-repo`) and force push.
- **Pushed and in a PR** (open, merged or closed): GitHub keeps `refs/pull/<n>/head` and the PR's branch name; the
  repo owner cannot delete them, so a force push leaves the old commits reachable. Delete and recreate the repo.

| Strategy | When | Cost |
|---|---|---|
| Reword in a new commit | Not a secret, repo is private or the leak is trivial, history matters | Old commits still contain it |
| `git filter-repo` rewrite | History matters and must be kept, leak is in a few files/strings | Every commit id changes; force push; all clones must re-clone |
| Recreate as a fresh repo (one squashed commit) | History has little value, many leaks, or you want certainty | Lose history, stars/issues/PRs if you delete the GitHub repo |

All but the first rewrite published history: get explicit approval, and tell the user that open PRs, forks and
other people's clones keep the old objects.

### filter-repo recipes

```bash
pip install git-filter-repo          # or: brew install git-filter-repo
git clone --mirror <url> repo.git && cd repo.git   # work on a fresh mirror, not your working clone

# replace strings everywhere (file content); one rule per line: literal==>replacement, or regex:...==>...
printf '%s\n' 'AcmeGame==>MyGame' 'regex:/Users/[^/]+/==>~/' > ../replacements.txt
git filter-repo --replace-text ../replacements.txt

# drop a file from all history
git filter-repo --invert-paths --path .env

# rewrite commit messages and author e-mails
git filter-repo --replace-message ../replacements.txt
git filter-repo --mailmap ../mailmap.txt     # "New Name <new@x> <old@x>"

git push --force --mirror
```

Keep `replacements.txt` out of the repo: it lists the private terms.

### Recreate-the-repo recipe

```bash
git checkout --orphan fresh && git add -A && git commit -m "Initial public commit"
git branch -D main && git branch -m main
# on GitHub: delete and recreate the repo (or another empty repo), then:
git push -u origin main --force
# local cleanup so the old objects are really gone:
git for-each-ref --format='%(refname)' | grep -v refs/heads/main | xargs -n1 git update-ref -d
git reflog expire --expire=now --all && git gc --prune=now
git rev-list --all | wc -l                     # expect 1
git cat-file -t <old-head-sha>                 # expect "fatal: Not a valid object name"
```

Deleting the GitHub repo is the only way to drop GitHub-side caches (PR refs `refs/pull/*`, cached views). A force
push alone leaves old commits reachable by SHA via the web UI until GitHub garbage-collects them; for sensitive
data, contact GitHub Support to purge cached views.

## 2. Chase down the copies

Also re-point anything that has this repo as a remote (e.g. downstream repos that pull from a template repo):
after a rewrite their remote-tracking refs still hold the old history, and the next push from them restores it.


The remote is fixed; copies are not. Go through each:

- **Your other clones** (other machines, other directories): delete and re-clone. `git pull` onto a rewritten
  history merges the old history back in — and a later push re-publishes it.
- **Forks and collaborators' clones**: tell them to re-clone; you cannot rewrite their copies.
- **CI caches / artifacts, package registries** (npm, PyPI, crates), **Docker images** built from the old tree:
  unpublish or rebuild where the leak was included.
- **Tool-managed clones**. Example: Claude Code plugin marketplaces keep a git clone per marketplace.
  - Locations: `<config dir>/plugins/marketplaces/<marketplace>/` and installed copies under
    `<config dir>/plugins/cache/<marketplace>/<plugin>/<version>/`. The config dir is `~/.claude` unless
    `CLAUDE_CONFIG_DIR` points elsewhere — a machine can have several (one per profile); check each.
  - The usual fix is `/plugin marketplace remove <name>` then `/plugin marketplace add <owner>/<repo>`, then
    reinstall the plugins. **If the marketplace is declared in settings (`extraKnownMarketplaces`), `remove`
    fails** ("not found") and `add` just reports success over the stale clone. Then delete the clone and cache
    directories directly and run `claude plugin marketplace update <name>`, then
    `claude plugin uninstall` / `install <plugin>@<name>`.
  - The `claude plugin ...` CLI acts on the config dir of the environment it runs in; to fix another profile, run
    it with `CLAUDE_CONFIG_DIR=<that dir>`.
  - Verify: `git -C <clone> log --oneline --all` shows only new commits, `git -C <clone> cat-file -t <old-sha>`
    fails, and `installed_plugins.json` lists the new `gitCommitSha`.

## 3. Verify

```bash
git clone <url> /tmp/verify && cd /tmp/verify
python <skill dir>/scripts/scan.py --history --terms <terms file>
```

Clean on a fresh clone is the evidence that the remote is clean. Then check each local copy you cleaned with
`git cat-file -t <old-sha>`.

## 4. Prevent recurrence

A pre-commit hook in the repo (enable with `git config core.hooksPath .githooks`):

```bash
#!/usr/bin/env bash
# .githooks/pre-commit
exec python <path to>/scan.py --staged --terms "$(git rev-parse --show-toplevel)/.public-check.local"
```

Git for Windows runs hooks with its bundled sh, so the same hook works there (use `py` or `python3` if that is the
interpreter name). Add `.public-check.local` (and `.public-check.known`) to `.gitignore`, and create the terms file
on every machine that commits. Commit messages are
published too; a `commit-msg` hook can grep the message file against the same terms.

Other sources to close:

- **GitHub web commits**: Settings → Emails → "Keep my email addresses private" (and block pushes that expose
  it), or make a personal address the primary one. Otherwise web merges author commits with the primary address.
- **Agent session trailers**: some coding agents append a session link trailer (e.g. `Claude-Session: <url>`) to
  commit messages. Turn that off for public repos, or strip it before pushing.
- **Sync / template scripts** that carry commits from a private repo into a public one: name branches without the
  source repo's name (`sync/<timestamp>`), cherry-pick without `-x`, and have the script print the commit messages
  for review before it pushes. Write the rule ("no product / company names in commit messages here") into that
  repo's docs where the next person will read it.

## Worked example: a public template repo fed from private project repos

Adapt, do not copy. A public "game template" repo received fixes cherry-picked from private game repos by a sync
script. The working tree had one hit (an asset file name from a past project); history had far more:

- Author e-mails at the company domain — all on commits GitHub made itself (initial commit, PR merges), which take
  the account's primary e-mail.
- Commit messages naming a former game, describing a game's UI concretely, carrying agent session links, and
  `(cherry picked from commit <sha>)` lines pointing into the private repos.
- Branch names `sync/<private-repo-name>-<date>`, built from the source repo's basename by the sync script.
- A PR on such a branch, so the old commits stayed reachable through `refs/pull/*`.
- An uncommitted edit adding a game name to a doc heading — caught before it was committed.

Fix: renamed the asset; fixed the sync script (timestamp-only branch names, no `-x`) and documented the rule;
because of the PR, deleted and recreated the GitHub repo with clean history; cleaned local clones; turned on
GitHub e-mail privacy. A `git fetch` mid-audit also showed new commits and branches on the remote — the reason to
fetch before scanning.

## Worked example: a public skills repo with an old commit naming a work project

Adapt, do not copy. A personal public repo had a commit (later reworded) mentioning a work product name. The
working tree scanned clean; only `--history` showed the hit. Steps taken:

1. No secret involved, so no rotation. History had no value, so: recreate the repo as one commit (orphan branch),
   delete and recreate the GitHub repo, push.
2. Locally: delete the other branches, expire the reflog, `gc --prune=now`; `git rev-list --all` = 1 and the old
   HEAD no longer resolves.
3. Copies: the repo was also a Claude Code plugin marketplace. The machine had two config dirs (two profiles),
   each with its own marketplace clone and plugin cache still holding the old history. `/plugin marketplace remove`
   failed because the marketplace was declared in settings; deleting the clone + cache directories and running
   `claude plugin marketplace update` plus reinstalling the plugin — once per config dir via `CLAUDE_CONFIG_DIR` —
   fixed both. Verified with `cat-file -t <old-sha>` failing in each clone.
4. Other machines: told the user to delete and re-clone, since a pull would merge the old history back.
