#!/usr/bin/env python3
"""Scan a git repo for things that must not be published: secrets, personal paths, e-mail addresses, private
workspace links, sensitive file names, and your own private terms (company / product / host / people names).

Pure Python 3.8+ and git; runs the same on macOS, Linux and Windows. Run it inside the target repo:

    python scan.py [--terms FILE] [--max N] MODE

MODE (pick one; run several for a full audit):
  --tree          every file in the working tree (tracked + untracked, minus gitignored)
  --staged        lines added in the staged diff (what the next commit adds)
  --range A..B    lines added, commit messages, file names and ref names for commits A..B (@{u}..HEAD = unpushed)
  --history       the same over every commit reachable from any ref (branches, tags, stash, remotes).
                  Run `git fetch --all --prune --tags` first: the remote may have commits your clone has not seen.

--terms FILE  extra regexes, one per line, case-insensitive, '#' comments. Defaults to .public-check.local in the
              repo root when it exists. Keep it out of git (gitignore it): the list itself is the private information.
--max N       print at most N hits per rule (default 30)

Output: one block per rule with "location: text" lines. Location is file:line for --tree / --staged and
<commit>:file for history modes (COMMIT_MSG for messages, REF for ref names). Exit 1 if anything was found,
0 if clean, 2 on usage error. History modes also print INFO: author / committer identities and commits made in
the GitHub web UI (those take the account's primary e-mail) -- these never fail the scan.
"""
import argparse
import os
import re
import subprocess
import sys

RULES = [
    ("home path", r"/(Users|home)/[A-Za-z0-9._-]+/"),
    ("home path", r"[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\"),
    ("e-mail", r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}"),
    ("private workspace link", r"[a-z0-9-]+\.slack\.com/archives|claude\.ai/(artifact/|chat/|code/session)|"
     r"docs\.google\.com/|drive\.google\.com/|notion\.so/|atlassian\.net/|[a-z0-9-]+\.zoom\.us/j/"),
    ("secret", r"sk-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,}|gh[ousr]_[A-Za-z0-9]{20,}|"
     r"github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|"
     r"BEGIN [A-Z ]*PRIVATE KEY|hooks\.slack\.com/services/"),
    ("credential assignment", r"""(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["']?\s*[:=]\s*["'][^"'\s]{8,}"""),
    ("ad / analytics ID", r"ca-app-pub-\d{16}|(?-i:\b(G-[A-Z0-9]{10}|UA-\d{4,10}-\d{1,4}|GTM-[A-Z0-9]{6,8}|AW-\d{9,11})\b)|"
     r"fbq\(\s*['\"]init['\"]\s*,\s*['\"]\d{15,16}"),
    ("cloud project", r"[a-z0-9-]+\.(firebaseio\.com|firebaseapp\.com|appspot\.com)|\"project_id\"\s*:\s*\"[^\"]+\"|"
     r"storage\.googleapis\.com/[a-z0-9._-]+|[a-z0-9.-]+\.s3[.-]([a-z0-9-]+\.)?amazonaws\.com"),
    ("chat ID", r"<@[UW][A-Z0-9]{8,}>|<#C[A-Z0-9]{8,}|(?-i:\b[CDGUW]0[A-Z0-9]{8,10}\b)"),
    ("provenance trailer", r"cherry picked from commit [0-9a-f]{7,}"),
    ("package registry", r'"resolved":\s*"https?://[^"]+|^\s*(registry|index-url|extra-index-url)\s*=\s*https?://'),
    ("internal host", r"https?://[a-z0-9.-]+\.(internal|local|lan|corp|intra)(:[0-9]+)?(/|$)|"
     r"https?://(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9.]+"),
]
# Placeholders and well-known example values: not reported by the generic rules (never applied to private terms).
ALLOW = re.compile(
    r"noreply@|@example\.(com|org|net)|@users\.noreply\.github\.com|/Users/<|/home/<|/Users/\.\.\.|/Users/me/|"
    r"/home/user/|/Users/you/|\\Users\\me\\|\\Users\\<|registry\.npmjs\.org|registry\.yarnpkg\.com|pypi\.org/|"
    r"files\.pythonhosted\.org|password[^=:]*[:=]\s*[\"'](\$\{|<|xxx|\*\*\*|changeme|your)", re.I)
# File names that should almost never be published, whatever their content.
FILE_RE = re.compile(
    r"(^|/)(\.env(\.[a-z]+)?|id_(rsa|dsa|ecdsa|ed25519)|[^/]*\.(pem|key|p12|pfx|keystore|jks|mobileprovision)|"
    r"credentials\.json|service-account[^/]*\.json|\.netrc|\.npmrc|\.pypirc|google-services\.json|"
    r"GoogleService-Info\.plist)$", re.I)
FILE_ALLOW = re.compile(r"\.env\.(example|sample|template)$", re.I)
SKIP_FILES = {"scan.py", "find_candidates.py", ".public-check.local", ".public-check.known"}


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, encoding="utf-8", errors="replace")
    return r.stdout


MEDIA_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".heic", ".gif", ".pdf", ".psd", ".ai", ".svg",
             ".mp4", ".mov", ".m4a", ".mp3", ".wav", ".docx", ".xlsx", ".pptx"}
META_KEYS = re.compile(rb"(GPSLatitude|GPSLongitude|Author|Artist|Creator(Tool)?|Copyright|Software|Producer|"
                       rb"OwnerName|CameraOwnerName|dc:creator|xmp:CreatorTool|LastModifiedBy|/Users/|C:\\Users\\)"
                       rb"[\x00\s:=>\"'(]{0,4}[\x20-\x7e]{0,80}")


def media_metadata(path):
    """Printable metadata snippets (EXIF / XMP / PNG text / PDF info) in a media file, without extra libraries.
    Rough by design: it looks for well-known keys in the head and tail of the file, where metadata lives."""
    try:
        with open(path, "rb") as f:
            head = f.read(512_000)
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - 128_000))
            tail = f.read()
    except OSError:
        return []
    out = []
    for m in META_KEYS.finditer(head + b"\n" + tail):
        snip = re.sub(rb"[\x00-\x20]+", b" ", m.group(0)).decode("ascii", "replace").strip()
        if len(snip) > len(m.group(1)) + 1 and snip not in out:
            out.append(snip)
    return out[:6]


def text_file_lines(path):
    try:
        with open(path, "rb") as f:
            data = f.read(5_000_000)
    except OSError:
        return []
    if b"\0" in data[:8000]:
        return []
    return data.decode("utf-8", "replace").splitlines()


def collect(mode, rng):
    """Return (lines as (location, file, text), file names, revs or None)."""
    lines, files = [], []
    if mode == "tree":
        files = git("ls-files", "--cached", "--others", "--exclude-standard").splitlines()
        for p in files:
            for i, t in enumerate(text_file_lines(p), 1):
                lines.append((f"{p}:{i}", p, t))
        return lines, files, None
    if mode == "staged":
        path, n = "", 0
        for l in git("diff", "--cached", "-U0", "--no-color", "--no-ext-diff", "--diff-filter=ACMR").splitlines():
            if l.startswith("+++ "):
                path = l[6:] if l.startswith("+++ b/") else ""
            elif l.startswith("@@"):
                m = re.search(r"\+(\d+)", l)
                n = int(m.group(1)) if m else 0
            elif l.startswith("+") and path:
                lines.append((f"{path}:{n}", path, l[1:]))
                n += 1
        files = git("diff", "--cached", "--name-only", "--diff-filter=ACMR").splitlines()
        return lines, files, None
    revs = [rng] if mode == "range" else ["--all"]
    commit, path = "", ""
    for l in git("log", *revs, "-p", "-U0", "--no-color", "--no-ext-diff", "--format=commit %H").splitlines():
        if l.startswith("commit ") and len(l) == 47:
            commit = l[7:17]
        elif l.startswith("+++ "):
            path = l[6:] if l.startswith("+++ b/") else ""
        elif l.startswith("+") and path:
            lines.append((f"{commit}:{path}", path, l[1:]))
    for block in git("log", *revs, "--format=%h%x09%B%x1e").split("\x1e"):
        sha, _, body = block.strip("\n").partition("\t")
        for t in body.splitlines():
            if t.strip():
                lines.append((f"{sha}:COMMIT_MSG", "", t))
    # Ref names are published too (branch / tag names often carry a repo or project name).
    for ref in git("for-each-ref", "--format=%(refname)").splitlines():
        lines.append(("REF", "", ref))
    files = sorted(set(git("log", *revs, "--name-only", "--format=", "--diff-filter=A").split("\n")) - {""})
    return lines, files, revs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--tree", action="store_const", const="tree", dest="mode")
    g.add_argument("--staged", action="store_const", const="staged", dest="mode")
    g.add_argument("--history", action="store_const", const="history", dest="mode")
    g.add_argument("--range", metavar="A..B")
    ap.add_argument("--terms")
    ap.add_argument("--max", type=int, default=30)
    a = ap.parse_args()
    mode = "range" if a.range else a.mode

    if a.terms:
        a.terms = os.path.abspath(a.terms)
    root = git("rev-parse", "--show-toplevel").strip()
    if not root:
        print("not inside a git repo", file=sys.stderr)
        return 2
    os.chdir(root)
    terms = a.terms or (".public-check.local" if os.path.exists(".public-check.local") else None)
    rules = [(n, re.compile(r, re.I | re.M), False) for n, r in RULES]
    if terms:
        if not os.path.exists(terms):
            print(f"terms file not found: {terms}", file=sys.stderr)
            return 2
        with open(terms, encoding="utf-8") as f:
            for t in f:
                t = t.strip()
                if t and not t.startswith("#"):
                    rules.append(("private term", re.compile(t, re.I), True))

    lines, files, revs = collect(mode, a.range)
    skip = SKIP_FILES | ({os.path.basename(terms)} if terms else set())
    lines = [x for x in lines if os.path.basename(x[1]) not in skip]

    hits = False

    def report(name, pattern, found):
        nonlocal hits
        if not found:
            return
        hits = True
        print(f"\n[{name}] {len(found)} hit(s)  /{pattern}/")
        for s in found[: a.max]:
            print("  " + s[:220])
        if len(found) > a.max:
            print(f"  ... {len(found) - a.max} more (raise --max)")

    for name, rx, private in rules:
        found = [f"{loc}:{t}" for loc, _, t in lines if rx.search(t) and (private or not ALLOW.search(t))]
        report(name, rx.pattern, found)
    report("sensitive file name", FILE_RE.pattern,
           [p for p in files if FILE_RE.search(p) and not FILE_ALLOW.search(p)])

    if mode == "tree":
        meta = [(p, media_metadata(p)) for p in files if os.path.splitext(p)[1].lower() in MEDIA_EXT]
        meta = [(p, m) for p, m in meta if m]
        if meta:
            print("\n[INFO] metadata embedded in media files (author / GPS / software / paths) -- check each:")
            for p, m in meta[: a.max]:
                print(f"  {p}: " + " | ".join(m)[:200])

    if revs:
        tz = {}
        for l in git("log", *revs, "--format=%ai").splitlines():
            tz[l[-5:]] = tz.get(l[-5:], 0) + 1
        print("\n[INFO] commit time zones (every commit publishes its timestamp and UTC offset):")
        print("  " + ", ".join(f"{k} x{v}" for k, v in sorted(tz.items(), key=lambda x: -x[1])))
        print("\n[INFO] author / committer identities published in these commits:")
        ids = {}
        for l in git("log", *revs, "--format=%an <%ae>%n%cn <%ce>").splitlines():
            ids[l] = ids.get(l, 0) + 1
        for ident, n in sorted(ids.items(), key=lambda x: -x[1]):
            print(f"  {n:5d} {ident}")
        web = git("log", *revs, "--committer=noreply@github.com", "--format=%h %an <%ae>  %s").splitlines()
        if web:
            print("\n[INFO] commits made in the GitHub web UI (author = account primary e-mail):")
            for l in web[: a.max]:
                print("  " + l)

    if not terms:
        print("\n[note] no private-terms file: only generic patterns ran. "
              "Company / product / people names need --terms FILE (find_candidates.py helps build it).", file=sys.stderr)
    print(f"\n[leak-audit] {'hits found' if hits else 'clean'} ({mode})")
    return 1 if hits else 0


if __name__ == "__main__":
    sys.exit(main())
