#!/usr/bin/env bash
# Symlink every skill in this repo into ~/.claude/skills/ (or one or more
# custom destinations) so they are available in all of your projects on
# this machine.
#
# A "skill" is any directory containing a SKILL.md, at any depth
# (e.g. meta/skill-creator/SKILL.md). Skills are linked FLAT into the
# destination by their directory name — categories are for organizing
# this repo, not part of the installed name.
#
# Re-run this after adding a skill. Symlinks point at this repo, so
# edits here are reflected immediately (new sessions only).
#
# Usage:
#   ./install.sh                              # link into ~/.claude/skills/
#   DEST=/path ./install.sh                   # link into a custom destination
#   DEST="/path/one /path/two" ./install.sh   # link into multiple destinations
#
# To avoid typing DEST every time, put it in a gitignored .install.local.sh
# next to this script instead, e.g.:
#   DEST="$HOME/.claude/skills $HOME/.claude-personal/skills"
# It's sourced automatically below when DEST isn't already set.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -z "${DEST:-}" ] && [ -f "$REPO_DIR/.install.local.sh" ]; then
  # shellcheck disable=SC1091
  source "$REPO_DIR/.install.local.sh"
fi

DEST="${DEST:-$HOME/.claude/skills}"
read -ra DESTS <<< "$DEST"

for d in "${DESTS[@]}"; do
  mkdir -p "$d"
done

linked=0
seen=" "
while IFS= read -r skill_md; do
  skill_dir="$(dirname "$skill_md")"
  name="$(basename "$skill_dir")"
  case "$seen" in
    *" $name "*)
      echo "WARN: duplicate skill name '$name' ($skill_dir) — skipped; rename one of them"
      continue
      ;;
  esac
  seen="$seen$name "
  for d in "${DESTS[@]}"; do
    ln -snf "$skill_dir" "$d/$name"
    echo "linked: $name -> $skill_dir ($d)"
  done
  linked=$((linked + 1))
done < <(find "$REPO_DIR" -name .git -prune -o -name .claude -prune -o -name SKILL.md -print)

echo "done. $linked skill(s) linked into: ${DESTS[*]}"
echo "Start a new session (or /clear) for Claude Code to pick them up."
