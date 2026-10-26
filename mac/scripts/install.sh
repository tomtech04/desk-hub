#!/bin/zsh
# Builds Desk Hub for the Mac, puts it in ~/Applications and opens it.
#   bash mac/scripts/install.sh                         uses the hub address the mail sync saved
#   bash mac/scripts/install.sh https://your-hub/       opens the hub at that address instead
# It replaces Claude Status and the old browser launcher (scripts/install-mac-app.sh), if they're there.
set -euo pipefail
cd "${0:A:h:h}"

scripts/build.sh

ID=com.tomasnavedo.claude-status
[[ -n "${1:-}" ]] && defaults write "$ID" hubURL "$1"

pkill -f "Desk Hub.app/Contents/MacOS/DeskHub" 2>/dev/null || true
pkill -x ClaudeStatus 2>/dev/null || true
sleep 0.5
mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Claude Status.app" "$HOME/Applications/Desk Hub.app"
ditto "build/Desk Hub.app" "$HOME/Applications/Desk Hub.app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$HOME/Applications/Desk Hub.app"
open "$HOME/Applications/Desk Hub.app"
echo "Installed $HOME/Applications/Desk Hub.app"
