#!/usr/bin/env bash
# Symlink every skill in this repo into ~/.claude/skills/ so they are
# available in all of your projects on this machine.
#
# A "skill" is any top-level directory containing a SKILL.md.
# Re-run this after adding a new skill. Symlinks point at this repo,
# so edits here are reflected immediately (new sessions only).
#
# Usage:
#   ./install.sh            # link into ~/.claude/skills/
#   DEST=/path ./install.sh # link into a custom destination
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${DEST:-$HOME/.claude/skills}"

mkdir -p "$DEST"

linked=0
for skill_md in "$REPO_DIR"/*/SKILL.md; do
  [ -e "$skill_md" ] || continue
  skill_dir="$(dirname "$skill_md")"
  name="$(basename "$skill_dir")"
  ln -snf "$skill_dir" "$DEST/$name"
  echo "linked: $name -> $skill_dir"
  linked=$((linked + 1))
done

echo "done. $linked skill(s) linked into $DEST"
echo "Start a new session (or /clear) for Claude Code to pick them up."
