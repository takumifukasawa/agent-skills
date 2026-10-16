#!/usr/bin/env bash
# Public-safety scan for this repo (it is public: anything committed here is published).
#
#   scripts/check-public.sh          scan the lines ADDED in the staged diff (the pre-commit hook runs this)
#   scripts/check-public.sh --msg F  scan a commit message file (the commit-msg hook runs this)
#   scripts/check-public.sh --all    scan every file in the tree (tracked + untracked, minus gitignored)
#
# It flags things that identify a person, a company, a project or a secret:
#   - absolute home paths (/Users/<name>/, /home/<name>/, C:\Users\<name>\)
#   - e-mail addresses
#   - links into private workspaces (Slack archives, claude.ai artifacts / sessions, Google Docs / Drive)
#   - token-shaped secrets (sk-..., xoxb-/xoxp-, ghp_, github_pat_, AKIA..., private key blocks)
#   - every regex in .public-check.local (gitignored, one extended regex per line, case-insensitive, # comments):
#     the names of your company, products, games, internal hosts and teammates. It is never committed, so the
#     list itself does not leak.
#
# A hit fails with the file, the line and the rule. Fix it by rewriting the line in neutral terms (a placeholder,
# "your game", ~/...); a real worked example stays only if it names nothing private (meta/skill-creator/SKILL.md,
# "Genericity check" and "Public-safety check"). Do not bypass with --no-verify.
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

SELF="scripts/check-public.sh"
RULES=(
  'home path|/(Users|home)/[A-Za-z0-9._-]+/'
  'home path|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\'
  'e-mail|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]*[A-Za-z]{2,}'
  'private workspace link|[a-z0-9-]+\.slack\.com/archives|claude\.ai/(artifact|code/session|chat)/|docs\.google\.com/|drive\.google\.com/'
  'secret|sk-[A-Za-z0-9_-]{20,}|xox[abpr]-[A-Za-z0-9-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY'
)
# Lines allowed to match the generic rules: placeholders and well-known example addresses.
ALLOW='noreply@|@example\.(com|org)|@users\.noreply\.github\.com|/Users/<|/home/<|/Users/\.\.\.|/Users/me/|/home/user/|\\Users\\me\\'

LOCAL=".public-check.local"
if [ -f "$LOCAL" ]; then
  while IFS= read -r line; do
    case "$line" in ''|'#'*) continue ;; esac
    RULES+=("private term (.public-check.local)|$line")
  done < "$LOCAL"
fi

# lines to scan, as "path:line:text"
if [ "${1:-}" = "--msg" ]; then
  # commit-msg hook: the message is published too
  INPUT=$(grep -v '^#' "$2" | awk '{ print "COMMIT_MSG:" NR ":" $0 }')
elif [ "${1:-}" = "--all" ]; then
  INPUT=$(git ls-files -z --cached --others --exclude-standard | xargs -0 grep -nIH '' -- 2>/dev/null | grep -v "^$SELF:")
else
  INPUT=$(git diff --cached -U0 --no-color --diff-filter=ACMR | awk -v self="$SELF" '
    /^\+\+\+ b\// { file = substr($0, 7); next }
    /^@@/ { split($3, a, ","); line = substr(a[1], 2) + 0; next }
    /^\+/ && file != self { print file ":" line ":" substr($0, 2); line++ }
  ')
fi

hits=0
for rule in "${RULES[@]}"; do
  name="${rule%%|*}"; re="${rule#*|}"
  found=$(printf '%s\n' "$INPUT" | grep -iE -- "$re" | grep -viE -- "$ALLOW" || true)
  # private terms are never allow-listed
  case "$name" in private*) found=$(printf '%s\n' "$INPUT" | grep -iE -- "$re" || true) ;; esac
  [ -z "$found" ] && continue
  hits=1
  printf '\n[check-public] %s  (/%s/)\n' "$name" "$re"
  printf '%s\n' "$found" | cut -c1-200 | sed 's/^/  /'
done

if [ "$hits" -ne 0 ]; then
  cat <<'EOF'

[check-public] This repo is public. Rewrite the lines above in neutral terms (a placeholder, "your game",
~/...), then stage again. Rules: meta/skill-creator/SKILL.md ("Genericity check", "Public-safety check").
If a hit is a false positive, reword the line rather than weakening this script.
EOF
  exit 1
fi
[ -f "$LOCAL" ] || echo "[check-public] note: no $LOCAL (private terms) on this machine; only the generic rules ran" >&2
echo "[check-public] ok"
