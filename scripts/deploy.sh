#!/usr/bin/env bash
# Push code from this Mac to the Pi and restart the hub. Never copies .env or data/,
# or the iPhone app (ios/), which the Pi doesn't run.
#   bash scripts/deploy.sh pi@deskhub.local
set -euo pipefail
TARGET="${1:?usage: deploy.sh user@host}"
DIR="${2:-desk-hub}"

rsync -az --delete \
  --exclude node_modules --exclude .env --exclude data --exclude .git --exclude .claude --exclude .DS_Store --exclude /ios \
  "$(cd "$(dirname "$0")/.." && pwd)/" "$TARGET:$DIR/"

# The service runs as this user with Restart=always, so stopping its process restarts it on
# the new code without sudo (which can't ask for a password over ssh).
ssh "$TARGET" "cd $DIR && npm ci --omit=dev --silent && if systemctl is-enabled desk-hub >/dev/null 2>&1; then \
  sudo -n systemctl restart desk-hub 2>/dev/null || kill \$(systemctl show -p MainPID --value desk-hub); \
  else echo 'First time? Run: bash scripts/install-pi.sh'; fi"
echo "Deployed. The screen picks up UI changes on its next reload (Settings → Reload)."
