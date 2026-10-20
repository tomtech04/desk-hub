#!/usr/bin/env bash
# Sets up school (or any) mail to reach the desk hub every 15 minutes, without signing in to it from
# the Pi: this Mac already has the account in Mail, so a small program here reads it and pushes it.
#
#   bash scripts/mail-sync-install.sh pi@deskhub.local
#   bash scripts/mail-sync-install.sh pi@deskhub.local --account "Georgia Tech=School=school"
#
# --account "<name in Mail>=<name on the hub>=<school|business|personal>", repeatable. Default is
# "Georgia Tech=School=school". Run it from the desk-hub folder, on the home Wi-Fi, after
# `bash scripts/deploy.sh <same host>` so the hub has the receiving end.
#
# It makes a secret token, puts it in the Pi's .env (HUB_MAIL_TOKEN) and in ~/.deskhub/mail-sync.json
# here, restarts the hub, and installs a launchd job (com.deskhub.mailsync) that runs every 15 minutes
# while you're signed in. To remove it: bash scripts/mail-sync-install.sh --uninstall
set -euo pipefail
cd "$(dirname "$0")/.."

LABEL=com.deskhub.mailsync
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
CONF_DIR="$HOME/.deskhub"
CONF="$CONF_DIR/mail-sync.json"
LOG="$HOME/Library/Logs/deskhub-mail-sync.log"
UIDN="$(id -u)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Removed the job. Your settings are still in $CONF; the token stays in the Pi's .env until you delete HUB_MAIL_TOKEN."
  exit 0
fi

TARGET="${1:?usage: mail-sync-install.sh user@host [--account \"Mail name=Hub name=role\"]}"
shift
ACCOUNTS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --account) ACCOUNTS+=("${2:?--account needs a value}"); shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done
[ ${#ACCOUNTS[@]} -gt 0 ] || ACCOUNTS=("Georgia Tech=School=school")

NODE="$(command -v node)" || { echo "Node isn't installed on this Mac (brew install node)."; exit 1; }
HOST="${TARGET#*@}"
HUB="http://$HOST:8080"
DIR="${DESKHUB_DIR:-desk-hub}"

# The token: keep the one already here, so running this again doesn't break a working setup.
TOKEN="$(CONF="$CONF" "$NODE" -e 'try { console.log(JSON.parse(require("fs").readFileSync(process.env.CONF, "utf8")).token || "") } catch { console.log("") }')"
[ -n "$TOKEN" ] || TOKEN="$(openssl rand -hex 32)"

# Does the hub have the receiving end? (401 means yes, the token was just not offered; 404 means not yet.)
CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 8 -X POST "$HUB/api/mail/push" -H 'Content-Type: application/json' -d '{}' || true)"
if [ "$CODE" = "404" ] || [ "$CODE" = "000" ]; then
  echo "The hub at $HUB didn't answer the way a hub with mail sync does (HTTP $CODE)."
  echo "Run this first, on the home Wi-Fi:   bash scripts/deploy.sh $TARGET"
  exit 1
fi

# 1. The token on the Pi, then a restart (the service has Restart=always).
JS='const fs = require("fs");
const line = "HUB_MAIL_TOKEN=" + fs.readFileSync(0, "utf8");
let env = fs.readFileSync(".env", "utf8");
env = /^HUB_MAIL_TOKEN=.*$/m.test(env) ? env.replace(/^HUB_MAIL_TOKEN=.*$/m, () => line) : env.replace(/\n?$/, "\n") + line + "\n";
fs.writeFileSync(".env", env);'
printf '%s' "$TOKEN" | ssh "$TARGET" "cd $DIR && node -e $(printf %q "$JS") && kill \$(systemctl show -p MainPID --value desk-hub)"
echo "The hub has the token and is restarting."

# 2. The settings here, readable only by you.
mkdir -p "$CONF_DIR"
ACCOUNTS_JOINED="$(printf '%s\n' "${ACCOUNTS[@]}")" HUB="$HUB" TOKEN="$TOKEN" CONF="$CONF" "$NODE" -e '
const fs = require("fs");
const accounts = process.env.ACCOUNTS_JOINED.split("\n").filter(Boolean).map((s) => { const [mail, name, role] = s.split("="); return { mail, name: name || mail, role: role || "school" }; });
fs.writeFileSync(process.env.CONF, JSON.stringify({ hub: process.env.HUB, token: process.env.TOKEN, accounts }, null, 2), { mode: 0o600 });'
chmod 600 "$CONF"

# 3. The every-15-minutes job.
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$PWD/scripts/mail-sync/sync.mjs</string></array>
  <key>StartInterval</key><integer>900</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
PLISTEOF
launchctl bootout "gui/$UIDN/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$UIDN" "$PLIST"
echo "Installed. It runs now and every 15 minutes after. Waiting for the first sync (up to 2 minutes)..."
echo "If macOS asks whether \"node\" may control Mail, choose Allow."

for _ in $(seq 1 60); do
  sleep 2
  if grep -q "messages sent\|couldn't\|failed" "$LOG" 2>/dev/null; then break; fi
done
tail -n 4 "$LOG" 2>/dev/null || true
echo "The log is $LOG. It lists counts only, never what an email says."
