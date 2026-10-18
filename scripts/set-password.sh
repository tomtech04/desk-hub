#!/usr/bin/env bash
# Set or change the hub's sign-in password (HUB_PASSWORD in the Pi's .env), then restart the hub.
# The password is asked for here and sent over ssh's input, so it never appears on a command
# line or in shell history.
#   bash scripts/set-password.sh pi@deskhub.local
set -euo pipefail
TARGET="${1:?usage: set-password.sh user@host}"
DIR="${2:-desk-hub}"

read -rsp "New hub password: " PW; echo
read -rsp "Same again: " PW2; echo
if [ "$PW" != "$PW2" ]; then echo "Those didn't match. Nothing changed."; exit 1; fi
# Kept to what .env holds unquoted and a phone keyboard types as-is.
case "$PW" in
  *[[:space:]\"\'\#\$\`\\]*) echo "Leave out spaces, quotes, #, \$, \` and \\. Nothing changed."; exit 1 ;;
esac
if [ ${#PW} -lt 8 ]; then echo "Use at least 8 characters. Nothing changed."; exit 1; fi

JS='const fs = require("fs");
const line = "HUB_PASSWORD=" + fs.readFileSync(0, "utf8");
let env = fs.readFileSync(".env", "utf8");
env = /^HUB_PASSWORD=.*$/m.test(env) ? env.replace(/^HUB_PASSWORD=.*$/m, () => line) : env.replace(/\n?$/, "\n") + line + "\n";
fs.writeFileSync(".env", env);'

# The service runs as this user with Restart=always, so stopping it restarts it with the new password.
printf '%s' "$PW" | ssh "$TARGET" "cd $DIR && node -e $(printf %q "$JS") && kill \$(systemctl show -p MainPID --value desk-hub)"
unset PW PW2
echo "Done. The hub restarts in a few seconds; sign in again with the new password on each phone and laptop."
