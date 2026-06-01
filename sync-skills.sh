#!/bin/bash
# sync-skills.sh — push local skills to a Git repo so they live in the cloud.
# Resolves symlinks, excludes runtime/secret files, injects a `name:` into any
# SKILL.md frontmatter that lacks one, and commits/pushes only when something changed.
#
# Run manually:  bash sync-skills.sh
# Scheduled:     installed as a launchd job by install.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Load config -------------------------------------------------------------
if [ ! -f "$HERE/config.sh" ]; then
  echo "Missing config.sh — copy config.example.sh to config.sh and edit it." >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$HERE/config.sh"

# Portable PATH (this script needs git/gh/rsync/perl; not node).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

CLONE="$HOME/.cache/skill-sync/repo"
LOG="$HERE/sync-skills.log"

# Commit identity: reuse the user's global git config, with a safe fallback.
GIT_NAME="$(git config --global user.name 2>/dev/null || true)";  GIT_NAME="${GIT_NAME:-skill-sync}"
GIT_EMAIL="$(git config --global user.email 2>/dev/null || true)"; GIT_EMAIL="${GIT_EMAIL:-skill-sync@local}"

exec >>"$LOG" 2>&1
echo "===== $(date '+%Y-%m-%d %H:%M:%S') sync start ====="

# --- 1) Prepare a clean working copy of the cloud repo -----------------------
if [ ! -d "$CLONE/.git" ]; then
  mkdir -p "$(dirname "$CLONE")"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$CLONE" || { echo "clone failed"; exit 1; }
else
  git -C "$CLONE" fetch --quiet origin "$BRANCH" && git -C "$CLONE" reset --quiet --hard "origin/$BRANCH"
fi
mkdir -p "$CLONE/$SKILLS_SUBDIR"

# --- 2) Sync each valid skill (skip broken symlinks / empty dirs) ------------
synced=0
for d in "$SKILLS_DIR"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  if [ ! -e "$d/SKILL.md" ]; then
    echo "skip $name (no resolvable SKILL.md)"
    continue
  fi
  rsync -aL --delete \
    --exclude '.git' --exclude 'node_modules' --exclude '.venv' \
    --exclude '__pycache__' --exclude '*.log' --exclude 'config.json' \
    --exclude 'logs' --exclude 'state-*.json' \
    "$d" "$CLONE/$SKILLS_SUBDIR/$name/"

  # Inject `name:` into frontmatter if missing (many skill loaders require it).
  f="$CLONE/$SKILLS_SUBDIR/$name/SKILL.md"
  if head -1 "$f" | grep -q '^---'; then
    has_name="$(awk 'NR==1&&/^---/{f=1;next} f&&/^---/{exit} f&&/^name:/{print "y";exit}' "$f")"
    if [ -z "$has_name" ]; then
      perl -i -pe "if (\$. == 1 && /^---/) { \$_ .= \"name: $name\n\"; }" "$f"
      echo "  injected name: $name"
    fi
  fi
  synced=$((synced+1))
done
echo "processed skills: $synced"

# --- 3) Commit & push only if something changed ------------------------------
cd "$CLONE" || exit 1
git add "$SKILLS_SUBDIR"
if git diff --cached --quiet; then
  echo "no changes"
else
  git -c user.name="$GIT_NAME" -c user.email="$GIT_EMAIL" \
    commit -q -m "chore(skills): auto-sync $(date '+%Y-%m-%d %H:%M')"
  if git push --quiet origin "$BRANCH"; then
    echo "pushed ✅"
  else
    echo "push failed ❌"
  fi
fi
echo "===== sync done ====="
