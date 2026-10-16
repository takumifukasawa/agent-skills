#!/usr/bin/env python3
"""Run the established external scanners that are installed, and print one compact summary.

    python external.py [--history] [--verify]          (run inside the repo; macOS / Linux / Windows)

- gitleaks   secrets by vendor-specific rules + entropy. --history: every commit reachable from any ref, stash
             included (`gitleaks git`), otherwise the working tree (`gitleaks dir`). Findings are redacted.
- trufflehog secrets by vendor-specific detectors. Without --verify it runs offline (--no-verification). With --verify it
             asks each issuer's API whether a found credential is LIVE -- the strongest signal there is, but it
             sends the candidate secret to that issuer, so use it only when the user agrees.
- exiftool   metadata of the media files in the working tree (author, GPS, software, owner, paths).

Working-tree mode keeps only findings in files that would be published (tracked + untracked, minus gitignored),
like scan.py: both tools also read gitignored files (a local .env) and trufflehog reads .git/objects.

A missing tool is reported with how to install it, and a tool that fails is reported as ERROR -- neither is
ever treated as clean. Exit 1 if any tool reported findings, 2 if a tool failed (an error wins over findings).
scan.py covers what these do not (private terms, home paths, e-mails, workspace links, ref names, commit
messages); run both.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

INSTALL = {
    "gitleaks": "brew install gitleaks | scoop install gitleaks | https://github.com/gitleaks/gitleaks/releases",
    "trufflehog": "brew install trufflehog | scoop install trufflehog | "
                  "https://github.com/trufflesecurity/trufflehog/releases",
    "exiftool": "brew install exiftool | scoop install exiftool | https://exiftool.org/",
}
MEDIA_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".heic", ".gif", ".pdf", ".psd", ".ai", ".svg",
             ".mp4", ".mov", ".m4a", ".mp3", ".wav", ".docx", ".xlsx", ".pptx"}
EXIF_KEYS = ("Author", "Artist", "Creator", "CreatorTool", "Copyright", "Software", "Producer", "OwnerName",
             "CameraOwnerName", "LastModifiedBy", "GPSLatitude", "GPSLongitude", "GPSPosition", "UserComment",
             "Comment", "Title", "Description", "DocumentID", "OriginalDocumentID", "HostComputer")


ERR = []  # tools that failed


def error(tool, rc, err):
    ERR.append(tool)
    tail = " / ".join(l.strip() for l in err.strip().splitlines()[-2:])
    print(f"\n[{tool}] ERROR (exit {rc}) -- not checked: {tail[:200]}")
    return 0


def published_files():
    out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], capture_output=True,
                         encoding="utf-8", errors="replace").stdout
    return set(out.splitlines())


def keep_published(tool, found, path_of):
    """Working-tree mode: drop findings in files that are not published (gitignored, .git internals)."""
    pub = published_files()
    def norm(p):
        p = (p or "").replace("\\", "/")
        return p[2:] if p.startswith("./") else p
    kept = [x for x in found if norm(path_of(x)) in pub]
    if len(kept) < len(found):
        print(f"\n[{tool}] note: {len(found) - len(kept)} finding(s) in gitignored files or .git internals left out")
    return kept


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace")
    return r.returncode, r.stdout, r.stderr


def missing(tool):
    print(f"\n[{tool}] NOT INSTALLED -- not checked. Install: {INSTALL[tool]}")


def gitleaks(history):
    if not shutil.which("gitleaks"):
        return missing("gitleaks") or 0
    fd, report = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    sub = ["git", "."] if history else ["dir", "."]
    # gitleaks exits 1 both on leaks and on errors by default; a distinct leak code tells them apart.
    rc, _, err = run(["gitleaks", *sub, "--redact", "--no-banner", "--exit-code", "99",
                      "--report-format", "json", "--report-path", report])
    try:
        with open(report, encoding="utf-8") as f:
            found = json.load(f) or []
    except (OSError, ValueError):
        found = None
    finally:
        os.remove(report)
    if rc not in (0, 99) or found is None:
        return error("gitleaks", rc, err)
    if not history:
        found = keep_published("gitleaks", found, lambda x: x.get("File"))
    print(f"\n[gitleaks] {len(found)} finding(s) ({'history' if history else 'tree'})")
    for x in found[:50]:
        where = f"{x.get('Commit', '')[:7]}:{x.get('File')}" if x.get("Commit") else x.get("File")
        print(f"  {x.get('RuleID')}  {where}:{x.get('StartLine')}  {x.get('Match', '')[:80]}")
    return 1 if found else 0


def trufflehog(history, verify):
    if not shutil.which("trufflehog"):
        return missing("trufflehog") or 0
    src = ["git", Path(os.getcwd()).as_uri()] if history else ["filesystem", "."]
    cmd = ["trufflehog", *src, "--json", "--no-update", "--fail"]  # --fail: exit 183 on results
    cmd += ["--results=verified,unknown,unverified"] if verify else ["--no-verification"]
    rc, out, err = run(cmd)
    if rc not in (0, 183):
        return error("trufflehog", rc, err)
    found = []
    for line in out.splitlines():
        try:
            found.append(json.loads(line))
        except ValueError:
            pass
    mode = "verified against issuers" if verify else "offline, not verified"
    if not history:
        def path_of(x):
            return (x.get("SourceMetadata", {}).get("Data", {}).get("Filesystem") or {}).get("file")
        found = keep_published("trufflehog", found, path_of)
    print(f"\n[trufflehog] {len(found)} finding(s) ({'history' if history else 'tree'}, {mode})")
    for x in found[:50]:
        meta = x.get("SourceMetadata", {}).get("Data", {})
        g = meta.get("Git") or meta.get("Filesystem") or {}
        where = f"{g.get('commit', '')[:7]}:{g.get('file')}" if g.get("commit") else g.get("file")
        live = "LIVE" if x.get("Verified") else ("unverified" if not verify else "not live / unknown")
        print(f"  {x.get('DetectorName')}  {live}  {where}:{g.get('line', '')}  {x.get('Redacted', '')[:60]}")
    return 1 if found else 0


def exiftool():
    if not shutil.which("exiftool"):
        return missing("exiftool") or 0
    media = [p for p in sorted(published_files()) if os.path.splitext(p)[1].lower() in MEDIA_EXT]
    if not media:
        print("\n[exiftool] no media files in the working tree")
        return 0
    hits = []
    for i in range(0, len(media), 200):
        rc, out, err = run(["exiftool", "-j", "-a", *media[i:i + 200]])
        try:
            rows = json.loads(out or "[]")
        except ValueError:
            return error("exiftool", rc, err)
        for row in rows:
            tags = {k: v for k, v in row.items() if k.split(":")[-1] in EXIF_KEYS and str(v).strip()}
            if tags:
                hits.append((row.get("SourceFile"), tags))
    print(f"\n[exiftool] {len(hits)} of {len(media)} media file(s) carry identifying metadata")
    for path, tags in hits[:50]:
        print(f"  {path}: " + " | ".join(f"{k}={str(v)[:40]}" for k, v in tags.items())[:200])
    return 1 if hits else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--history", action="store_true", help="scan every commit instead of the working tree")
    ap.add_argument("--verify", action="store_true", help="let trufflehog check found secrets with their issuers")
    a = ap.parse_args()
    root = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, encoding="utf-8").stdout.strip()
    if not root:
        print("not inside a git repo", file=sys.stderr)
        return 2
    os.chdir(root)
    rc = gitleaks(a.history) | trufflehog(a.history, a.verify) | exiftool()
    if ERR:
        print(f"\n[external] ERROR in {', '.join(ERR)}: those checks did not run" + (" (and findings above)" if rc else ""))
        return 2
    print(f"\n[external] {'findings reported' if rc else 'nothing reported by the installed tools'}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
