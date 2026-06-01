#!/bin/bash
# install.sh — set up the daily skill auto-sync on this machine (macOS / launchd).
# Idempotent: re-running reloads the job. Reads settings from config.sh.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/sync-skills.sh"
TEMPLATE="$HERE/com.skill-sync.autosync.plist"
LABEL="com.skill-sync.autosync"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HERE/sync-skills.log"
UID_N="$(id -u)"

# --- Config preflight --------------------------------------------------------
if [ ! -f "$HERE/config.sh" ]; then
  echo "▶ No config.sh found. Creating one from the template..."
  cp "$HERE/config.example.sh" "$HERE/config.sh"
  echo "❗ Edit $HERE/config.sh (set REPO_URL) then re-run ./install.sh"
  exit 1
fi
# shellcheck disable=SC1091
source "$HERE/config.sh"
SCHEDULE_HOUR="${SCHEDULE_HOUR:-11}"

# --- Dependency preflight ----------------------------------------------------
echo "▶ Checking dependencies..."
for c in git gh rsync perl; do
  command -v "$c" >/dev/null 2>&1 || { echo "❌ Missing '$c' (install gh with: brew install gh)"; exit 1; }
done
if ! gh auth status >/dev/null 2>&1; then
  echo "❌ Not logged in to GitHub. Run: gh auth login"; exit 1
fi
echo "  dependencies OK ✅"

chmod +x "$SCRIPT"
mkdir -p "$HOME/Library/LaunchAgents"

# --- Generate the launchd job (paths/hour filled from config) ----------------
echo "▶ Generating launchd job (daily at ${SCHEDULE_HOUR}:00)..."
sed -e "s#__SCRIPT_PATH__#$SCRIPT#g" \
    -e "s#__LOG_PATH__#$LOG#g" \
    -e "s#__HOUR__#$SCHEDULE_HOUR#g" \
    "$TEMPLATE" > "$PLIST_DST"

# --- (Re)load --------------------------------------------------------------
launchctl bootout "gui/$UID_N" "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap "gui/$UID_N" "$PLIST_DST"
echo "  registered: $LABEL ✅"

# --- First sync --------------------------------------------------------------
echo "▶ Running an initial sync..."
bash "$SCRIPT" || true
echo
echo "✅ Done!"
echo "   Schedule: daily at ${SCHEDULE_HOUR}:00"
echo "   Manual:   bash $SCRIPT"
echo "   Log:      $LOG"
echo "   Remove:   ./uninstall.sh"
tail -6 "$LOG" 2>/dev/null || true
