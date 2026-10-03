#!/usr/bin/env bash
# Switch the hub from the Supabase service-role key to the read-only
# `deskhub_reader` Postgres role. Run once, from this Mac:
#   PAYIT_TEST_EMAILS="a@x.com b@y.com" bash scripts/setup-readonly-db.sh
#
# THIS CHANGES PAYIT'S PRODUCTION DATABASE (adds one role and four SELECT-only
# policies for it; see sql/deskhub_reader_role.sql). Get the team's sign-off
# first. It does not touch the PayIt git repo or its migration history; the
# repo's Supabase link is only read to know which project to talk to.
#
# 1. Runs sql/deskhub_reader_role.sql against the linked project.
# 2. Gives the role a random password. It's never printed or written to git;
#    it goes straight into the Pi's .env.
# 3. Points the hub at the role and removes the service key from the Pi.
set -euo pipefail

HUB="$(cd "$(dirname "$0")/.." && pwd)"
POS=${POS_APP:-$HOME/Developer/POS-App}   # read-only: used for its Supabase link
PI=${PI:-pi@deskhub.local}
FILE="$HUB/sql/deskhub_reader_role.sql"
# Team/test accounts whose businesses don't count as revenue (space-separated).
TEST_EMAILS=${PAYIT_TEST_EMAILS:?set PAYIT_TEST_EMAILS to the team/test account emails}

cd "$POS"
REF=$(cat supabase/.temp/project-ref)
POOLER_HOST=$(sed -E 's#.*@([^:/]+).*#\1#' supabase/.temp/pooler-url)
echo "Project $REF via $POOLER_HOST"
echo
echo "This will create the deskhub_reader role and its read-only policies in the"
echo "PRODUCTION database of project $REF."
read -r -p "Type the project ref to continue: " CONFIRM
[ "$CONFIRM" = "$REF" ] || { echo "Cancelled; nothing was changed."; exit 1; }

echo "==> Creating the read-only role"
if supabase db query --linked "select 'ROLE_PRESENT' as marker from pg_roles where rolname = 'deskhub_reader'" --output-format json | grep -q ROLE_PRESENT; then
  echo "   deskhub_reader already exists; leaving it as is"
else
  supabase db query --linked -f "$FILE" >/dev/null
  echo "   created"
fi

echo "==> Setting its password"
PW=$(openssl rand -hex 24)
supabase db query --linked "alter role deskhub_reader with password '$PW'" >/dev/null

echo "==> Looking up the team accounts' user ids"
EMAIL_LIST=$(printf "'%s'," $TEST_EMAILS); EMAIL_LIST=${EMAIL_LIST%,}
OWNER_IDS=$(supabase db query --linked --output-format json "select id from auth.users where email in ($EMAIL_LIST)" \
  | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | sort -u | paste -sd, -)
echo "   found $(echo "$OWNER_IDS" | tr ',' '\n' | grep -c . || true) of $(echo $TEST_EMAILS | wc -w | tr -d ' ')"

echo "==> Updating the Pi"
DB_URL="postgresql://deskhub_reader.$REF:$PW@$POOLER_HOST:5432/postgres"
printf '%s\n%s\n' "$DB_URL" "$OWNER_IDS" | ssh "$PI" 'python3 -c "
import os, sys
url, owners = sys.stdin.read().splitlines()[:2]
p = os.path.expanduser(\"~/desk-hub/.env\")
drop = {\"SUPABASE_URL\", \"SUPABASE_SERVICE_ROLE_KEY\", \"PAYIT_TEST_ACCOUNT_EMAILS\", \"PAYIT_DATABASE_URL\", \"PAYIT_TEST_OWNER_IDS\"}
lines = [l for l in open(p).read().splitlines() if l.split(\"=\", 1)[0] not in drop]
lines += [\"PAYIT_DATABASE_URL=\" + url, \"PAYIT_TEST_OWNER_IDS=\" + owners]
open(p, \"w\").write(\"\n\".join(lines) + \"\n\")
os.chmod(p, 0o600)
"'

echo "==> Restarting the hub"
ssh "$PI" 'kill $(systemctl show -p MainPID --value desk-hub); sleep 8; curl -s localhost:8080/api/dashboard' \
  | node -e '
    const d = JSON.parse(require("fs").readFileSync(0));
    const p = d.payit;
    if (p.error || !p.data) { console.log("   PayIt error:", p.error || "no data yet — check: journalctl -u desk-hub -n 20"); process.exit(1); }
    console.log(`   PayIt via ${p.data.access}: ${p.data.week.length} days loaded, ${p.data.excludedBusinesses} test businesses excluded, systems: ${p.data.systems.map((s) => s.system + " " + s.status).join(", ")}`);
  '
echo "Done. The service key is no longer on the Pi."
