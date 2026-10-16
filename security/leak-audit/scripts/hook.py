#!/usr/bin/env python3
"""Git hook entry point for leak-audit: a fast check that runs on every push / commit, whether or not an agent
remembers to audit. Normally called through assets/leak-audit-hook.sh, which finds this file on each machine.

    python hook.py pre-push <remote> [<url>]   (git passes the pushed refs on stdin)
    python hook.py commit-msg <message-file>
    python hook.py pre-commit

pre-push is the gate that matters: cherry-pick, rebase and merges do not run pre-commit, and most leaks travel
in commit messages and branch names, which pre-commit never sees. It checks, for each pushed ref, the commits
the remote does not have yet (content, messages, file names) and the ref name. commit-msg and pre-commit give
earlier feedback on ordinary commits.

Each mode runs scan.py (generic rules + the private terms in .public-check.local) and, when installed, gitleaks
(vendor token formats). It exits non-zero on a hit, with what to change. A missing gitleaks or terms file is a
warning, never silent; LEAK_AUDIT_STRICT=1 turns a missing gitleaks into a failure.

False positives: add a regex for the line to .leak-audit-allow (committed; public text only). Private terms
cannot be allowed that way.
"""
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ZERO = "0" * 40
STRICT = os.environ.get("LEAK_AUDIT_STRICT") == "1"

FIX = {
    "pre-push": "Nothing was pushed. Fix the commits above, then push again:\n"
                "  - content or message: `git rebase -i <base>` and edit / reword the commit "
                "(`git commit --amend` for the last one)\n"
                "  - branch name: `git branch -m <neutral-name>` and push that instead\n"
                "  - a false positive in public text: add a regex for the line to .leak-audit-allow",
    "commit-msg": "The commit was not made. Reword the message (your text is kept in .git/COMMIT_EDITMSG):\n"
                  "  git commit -e -F .git/COMMIT_EDITMSG",
    "pre-commit": "The commit was not made. Reword the lines above, or unstage the file "
                  "(`git restore --staged <file>`), then commit again.",
}


def scan(*args):
    return subprocess.run([sys.executable, os.path.join(HERE, "scan.py"), "--quiet", *args]).returncode


def gitleaks(*args):
    """0 clean, 1 leaks, 2 error / missing-and-strict."""
    if not shutil.which("gitleaks"):
        print("[leak-audit] warning: gitleaks is not installed, vendor token formats were NOT checked "
              "(brew install gitleaks / scoop install gitleaks)." + (" LEAK_AUDIT_STRICT=1: failing." if STRICT else ""),
              file=sys.stderr)
        return 2 if STRICT else 0
    r = subprocess.run(["gitleaks", "git", *args, "--redact", "--no-banner", "--exit-code", "99", "-v", "."],
                       capture_output=True, encoding="utf-8", errors="replace")
    if r.returncode == 0:
        return 0
    if r.returncode == 99:
        print("\n[gitleaks] secrets found:\n" + r.stdout.strip(), flush=True)
        return 1
    print(f"[leak-audit] gitleaks failed (exit {r.returncode}), NOT checked: {r.stderr.strip()[-200:]}", file=sys.stderr)
    return 2 if STRICT else 0


def pre_push(remote):
    """0 clean, 1 hits, 2 a check could not run (strict)."""
    bad = 0
    for line in sys.stdin.read().splitlines():
        parts = line.split()
        if len(parts) != 4:
            continue
        local_ref, local_sha, remote_ref, remote_sha = parts
        if local_sha == ZERO:
            continue  # deleting a remote ref publishes nothing
        # New branch: everything the remote does not have yet. Existing branch: what is new since its tip.
        revs = f"{local_sha} --not --remotes={remote}" if remote_sha == ZERO else f"{remote_sha}..{local_sha}"
        if remote_sha != ZERO and subprocess.run(["git", "cat-file", "-e", remote_sha],
                                                 capture_output=True).returncode != 0:
            revs = f"{local_sha} --not --remotes={remote}"  # force push over a tip we do not have
        print(f"[leak-audit] pre-push: {remote_ref} ({revs})", file=sys.stderr)
        bad |= 1 if scan("--range", revs, "--ref", remote_ref) != 0 else 0
        bad |= gitleaks(f"--log-opts={revs}")
    return bad


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in FIX:
        print(__doc__, file=sys.stderr)
        return 2
    mode = sys.argv[1]
    if mode == "pre-push":
        rc = pre_push(sys.argv[2] if len(sys.argv) > 2 else "origin")
    elif mode == "commit-msg":
        rc = 1 if scan("--msg", sys.argv[2]) != 0 else 0
    else:
        rc = (1 if scan("--staged") != 0 else 0) | gitleaks("--pre-commit", "--staged")
    sys.stdout.flush()
    if rc & 1:
        print("\n[leak-audit] " + FIX[mode], file=sys.stderr)
    elif rc & 2:
        print("\n[leak-audit] Stopped because a check could not run and LEAK_AUDIT_STRICT=1 (see the warning above). "
              "Install the missing tool, or unset LEAK_AUDIT_STRICT to let it through with a warning.", file=sys.stderr)
    return 1 if rc else 0


if __name__ == "__main__":
    sys.exit(main())
