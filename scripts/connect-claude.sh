#!/usr/bin/env bash
# Connect Claude Code on this computer to the hub's MCP server.
#   bash scripts/connect-claude.sh
#
# Makes a token on the Pi if there isn't one (HUB_MCP_TOKEN in its .env),
# restarts the hub so it takes effect, and registers the server with Claude
# Code for your user. The token is never printed.
set -euo pipefail
PI=${PI:-pi@deskhub.local}
URL=${HUB_URL:-https://deskhub.example.com}/mcp

TOKEN=$(ssh "$PI" 'cd ~/desk-hub
  if ! grep -q "^HUB_MCP_TOKEN=.\+" .env; then
    sed -i "/^HUB_MCP_TOKEN=/d" .env
    echo "HUB_MCP_TOKEN=$(openssl rand -hex 32)" >> .env
    kill "$(systemctl show -p MainPID --value desk-hub)"; sleep 8
  fi
  grep "^HUB_MCP_TOKEN=" .env | cut -d= -f2-')
[ ${#TOKEN} -ge 32 ] || { echo "Couldn't read a token from the Pi."; exit 1; }

if command -v claude >/dev/null; then
  claude mcp remove desk-hub --scope user >/dev/null 2>&1 || true
  claude mcp add --scope user --transport http desk-hub "$URL" --header "Authorization: Bearer $TOKEN" >/dev/null
else
  # No CLI (desktop app only): write the same user-scope entry the CLI would,
  # in ~/.claude.json, keeping a backup of the file first.
  CFG="$HOME/.claude.json"
  [ -f "$CFG" ] && cp "$CFG" "$CFG.bak-desk-hub"
  URL="$URL" TOKEN="$TOKEN" CFG="$CFG" node -e '
    const fs = require("fs");
    const p = process.env.CFG;
    const c = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
    c.mcpServers = { ...(c.mcpServers || {}), "desk-hub": { type: "http", url: process.env.URL, headers: { Authorization: "Bearer " + process.env.TOKEN } } };
    fs.writeFileSync(p + ".tmp", JSON.stringify(c, null, 2)); fs.renameSync(p + ".tmp", p); fs.chmodSync(p, 0o600);'
fi
echo "Connected. New Claude Code sessions will have the desk-hub tools."
echo "For the Claude desktop chat app or claude.ai: Customize > Connectors > Add custom connector,"
echo "URL $URL, request header 'authorization' = 'Bearer <token>' (the token is HUB_MCP_TOKEN in the Pi's .env)."
