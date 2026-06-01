#!/bin/bash
# uninstall.sh — remove the scheduled auto-sync job (does NOT touch your skills or repo).
set -euo pipefail
LABEL="com.skill-sync.autosync"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
UID_N="$(id -u)"

launchctl bootout "gui/$UID_N" "$PLIST_DST" 2>/dev/null || true
rm -f "$PLIST_DST"
echo "✅ Removed scheduled job: $LABEL"
echo "   (Your local skills and the cloud repo are untouched.)"
