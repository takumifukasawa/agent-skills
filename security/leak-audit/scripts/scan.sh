#!/usr/bin/env bash
# Scan a git repo for things that must not be published: secrets, personal paths, e-mail addresses,
# private workspace links, sensitive file names, and your own private terms (company / product / host / people).
#
#   scan.sh [--terms FILE] [--max N] MODE
#
# MODE (pick one; run several for a full audit):
#   --tree           every file in the working tree (tracked + untracked, minus gitignored)
#   --staged         lines added in the staged diff (what the next commit adds)
#   --range A..B     lines added, commit messages and file names in commits A..B (e.g. @{u}..HEAD = unpushed)
#   --history        the same over every commit reachable from any ref (branches, tags, stash, remotes),
#                    plus the ref names themselves. Run `git fetch --all --prune` first: the remote may have
#                    branches and commits your clone has not seen yet.
#
# --terms FILE  extra extended regexes, one per line, case-insensitive, '#' comments. Defaults to
#               .public-check.local in the repo root when it exists. Keep this file out of git (gitignore it):
#               the list itself is the private information.
# --max N       print at most N hits per rule (default 30)
#
# Output: one block per rule with "location: text" lines. Location is file:line for --tree / --staged and
# <commit>:file for history modes. Exit 1 if anything was found, 0 if clean, 2 on usage error.
# Author / committer identities in history modes are listed as INFO (they are published with every commit,
# but whether that is acceptable is the owner's call), and never fail the scan.
set -u

TERMS=""
MAX=30
MODE=""
RANGE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --terms) TERMS="$2"; shift 2 ;;
    --max) MAX="$2"; shift 2 ;;
    --tree|--staged|--history) MODE="${1#--}"; shift ;;
    --range) MODE="range"; RANGE="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { sed -n '2,26p' "$0" >&2; exit 2; }

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "not inside a git repo" >&2; exit 2; }
cd "$ROOT" || exit 2
[ -z "$TERMS" ] && [ -f .public-check.local ] && TERMS=.public-check.local

RULES=(
  'home path|/(Users|home)/[A-Za-z0-9._-]+/'
  'home path|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\'
  'e-mail|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}'
  'private workspace link|[a-z0-9-]+\.slack\.com/archives|claude\.ai/(artifact/|chat/|code/session)|docs\.google\.com/|drive\.google\.com/|notion\.so/|atlassian\.net/|[a-z0-9-]+\.zoom\.us/j/'
  'secret|sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,}|gh[ousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|BEGIN [A-Z ]*PRIVATE KEY|hooks\.slack\.com/services/'
  'credential assignment|(password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"'[:space:]]{8,}'
  'provenance trailer|cherry picked from commit [0-9a-f]{7,}'
  'package registry|"resolved":[[:space:]]*"https?://[^"]+|^[[:space:]]*(registry|index-url|extra-index-url)[[:space:]]*=[[:space:]]*https?://'
  'internal host|https?://[a-z0-9.-]+\.(internal|local|lan|corp|intra)(:[0-9]+)?(/|$)|https?://(10|192\.168|172\.(1[6-9]|2[0-9]|3[01]))\.[0-9.]+'
)
# Placeholders and well-known example values: not reported by the generic rules.
ALLOW='noreply@|@example\.(com|org|net)|@users\.noreply\.github\.com|/Users/<|/home/<|/Users/\.\.\.|/Users/me/|/home/user/|/Users/you/|\\Users\\me\\|registry\.npmjs\.org|registry\.yarnpkg\.com|pypi\.org/|files\.pythonhosted\.org|password[^=:]*[:=][[:space:]]*["'"'"'](\$\{|<|xxx|\*\*\*|changeme|your)'
# File names that should almost never be published, whatever their content.
FILE_RE='(^|/)(\.env(\.[a-z]+)?|id_(rsa|dsa|ecdsa|ed25519)|[^/]*\.(pem|key|p12|pfx|keystore|jks|mobileprovision)|credentials\.json|service-account[^/]*\.json|\.netrc|\.npmrc|\.pypirc|google-services\.json|GoogleService-Info\.plist)$'
FILE_ALLOW='\.env\.(example|sample|template)$'

if [ -n "$TERMS" ]; then
  [ -f "$TERMS" ] || { echo "terms file not found: $TERMS" >&2; exit 2; }
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    RULES+=("private term|$line")
  done < "$TERMS"
fi

# Build "location:text" lines to scan, and a list of file paths for the file-name rule.
SELF_REL=""
case "$(cd "$(dirname "$0")" && pwd)/$(basename "$0")" in "$ROOT"/*) SELF_REL="${0#"$ROOT"/}" ;; esac
TERMS_REL="$TERMS"

added_lines_awk='
  /^commit [0-9a-f]{40}/ { c = substr($2, 1, 10); next }
  /^\+\+\+ b\// { file = substr($0, 7); next }
  /^\+\+\+ / { file = ""; next }
  /^\+/ && file != "" { print c ":" file ":" substr($0, 2) }
'
case "$MODE" in
  tree)
    INPUT=$(git ls-files -z --cached --others --exclude-standard | xargs -0 grep -nIH '' -- 2>/dev/null)
    FILES=$(git ls-files --cached --others --exclude-standard)
    ;;
  staged)
    INPUT=$(git diff --cached -U0 --no-color --diff-filter=ACMR | awk '
      /^\+\+\+ b\// { file = substr($0, 7); next }
      /^@@/ { split($3, a, ","); line = substr(a[1], 2) + 0; next }
      /^\+/ { print file ":" line ":" substr($0, 2); line++ }')
    FILES=$(git diff --cached --name-only --diff-filter=ACMR)
    ;;
  range|history)
    if [ "$MODE" = range ]; then REVS=("$RANGE"); else REVS=(--all); fi
    INPUT=$(git log "${REVS[@]}" -p -U0 --no-color --no-ext-diff --format='commit %H' 2>/dev/null | awk "$added_lines_awk")
    MSGS=$(git log "${REVS[@]}" --format='%h%x09%B%x1e' 2>/dev/null | awk 'BEGIN{RS="\036"} { sub(/^\n+/, "") } { n = split($0, L, "\n"); split(L[1], h, "\t"); if (h[1] == "") next; L[1] = h[2]; for (i = 1; i <= n; i++) if (L[i] != "") print h[1] ":COMMIT_MSG:" L[i] }')
    # Ref names are published too (branch / tag names often carry a repo or project name).
    REFS=$(git for-each-ref --format='REF:%(refname)' 2>/dev/null)
    INPUT=$(printf '%s\n%s\n%s\n' "$INPUT" "$MSGS" "$REFS")
    FILES=$(git log "${REVS[@]}" --name-only --format= --diff-filter=A 2>/dev/null | sort -u)
    ;;
esac

# The scanner and the terms file match their own rules; leave them out.
INPUT=$(printf '%s\n' "$INPUT" | awk -F: -v s="$SELF_REL" -v t="$TERMS_REL" '
  { f = ($1 ~ /^[0-9a-f]{10}$/) ? $2 : $1 } (s == "" || f != s) && (t == "" || f != t)')

hits=0
report() { # name, regex, found
  [ -z "$3" ] && return
  hits=1
  local n; n=$(printf '%s\n' "$3" | wc -l | tr -d ' ')
  printf '\n[%s] %s hit(s)  /%s/\n' "$1" "$n" "$2"
  printf '%s\n' "$3" | head -n "$MAX" | cut -c1-220 | sed 's/^/  /'
  [ "$n" -gt "$MAX" ] && printf '  ... %s more (raise --max)\n' "$((n - MAX))"
}

for rule in "${RULES[@]}"; do
  name="${rule%%|*}"; re="${rule#*|}"
  if [ "$name" = "private term" ]; then
    found=$(printf '%s\n' "$INPUT" | grep -iE -- "$re" || true)          # private terms are never allow-listed
  else
    found=$(printf '%s\n' "$INPUT" | grep -iE -- "$re" | grep -viE -- "$ALLOW" || true)
  fi
  report "$name" "$re" "$found"
done

found=$(printf '%s\n' "$FILES" | grep -iE -- "$FILE_RE" | grep -viE -- "$FILE_ALLOW" || true)
report "sensitive file name" "$FILE_RE" "$found"

if [ "$MODE" = range ] || [ "$MODE" = history ]; then
  printf '\n[INFO] author / committer identities published in these commits:\n'
  git log "${REVS[@]}" --format='%an <%ae>%n%cn <%ce>' 2>/dev/null | sort | uniq -c | sort -rn | sed 's/^/  /'
  # Commits made in the GitHub web UI (initial commit, PR merge, web edits) take the account's primary e-mail as
  # author, which may be a work address even when local commits use a personal one.
  web=$(git log "${REVS[@]}" --format='%h %an <%ae>  %s' --committer='noreply@github.com' 2>/dev/null)
  [ -n "$web" ] && { printf '\n[INFO] commits made in the GitHub web UI (author = account primary e-mail):\n'; printf '%s\n' "$web" | head -n "$MAX" | sed 's/^/  /'; }
fi

[ -z "$TERMS" ] && echo "
[note] no private-terms file: only generic patterns ran. Company / product / people names need --terms FILE." >&2
if [ "$hits" -ne 0 ]; then echo; echo "[leak-audit] hits found ($MODE)"; exit 1; fi
echo; echo "[leak-audit] clean ($MODE)"
