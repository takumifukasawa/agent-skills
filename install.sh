#!/usr/bin/env bash
# Symlink every skill in this repo into ~/.claude/skills/ so they are
# available in all of your projects on this machine.
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
#   ./install.sh            # link into ~/.claude/skills/
#   DEST=/path ./install.sh # link into a custom destination
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${DEST:-$HOME/.claude/skills}"

mkdir -p "$DEST"

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
  ln -snf "$skill_dir" "$DEST/$name"
  echo "linked: $name -> $skill_dir"
  linked=$((linked + 1))
done < <(find "$REPO_DIR" -name .git -prune -o -name .claude -prune -o -name SKILL.md -print)

echo "done. $linked skill(s) linked into $DEST"
echo "Start a new session (or /clear) for Claude Code to pick them up."
