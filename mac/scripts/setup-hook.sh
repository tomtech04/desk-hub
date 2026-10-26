#!/bin/zsh
# Adds the Claude Status hook to ~/.claude/settings.json, or takes it out again.
#   scripts/setup-hook.sh           install (safe to run more than once)
#   scripts/setup-hook.sh --remove  uninstall
# Other settings and hooks in the file are left alone. A backup is saved first.
set -euo pipefail
cd "${0:A:h:h}"

JQ=$(command -v jq || echo /opt/homebrew/bin/jq)
[[ -x "$JQ" ]] || { echo "jq is needed: brew install jq"; exit 1; }

SETTINGS="$HOME/.claude/settings.json"
HOOK_DIR="$HOME/.claude/claude-status"
CMD='$HOME/.claude/claude-status/hook.sh'

# Events that mean "Claude is waiting on you", and events that mean it moved on.
EVENTS='[
  {"name": "PermissionRequest"},
  {"name": "Notification"},
  {"name": "Elicitation"},
  {"name": "PreToolUse", "matcher": "AskUserQuestion|ExitPlanMode"},
  {"name": "ElicitationResult"},
  {"name": "PermissionDenied"},
  {"name": "PostToolUse"},
  {"name": "PostToolUseFailure"},
  {"name": "UserPromptSubmit"},
  {"name": "Stop"},
  {"name": "StopFailure"}
]'

[[ -f "$SETTINGS" ]] || echo '{}' > "$SETTINGS"
cp "$SETTINGS" "$SETTINGS.bak-claude-status"

# Drop any earlier copy of our hook, and events left with no hooks.
STRIP='
  def strip: map(.hooks |= map(select(.command != $cmd))) | map(select(.hooks | length > 0));
  if .hooks then
    .hooks |= with_entries(.value |= strip) | .hooks |= with_entries(select(.value | length > 0))
  else . end
'

if [[ "${1:-}" == "--remove" ]]; then
  "$JQ" --arg cmd "$CMD" "$STRIP"' | if .hooks == {} then del(.hooks) else . end' \
    "$SETTINGS.bak-claude-status" > "$SETTINGS"
  rm -rf "$HOOK_DIR"
  echo "Removed the Claude Status hook."
  exit 0
fi

mkdir -p "$HOOK_DIR"
cp hooks/claude-status-hook.sh "$HOOK_DIR/hook.sh"
chmod 755 "$HOOK_DIR/hook.sh"

"$JQ" --arg cmd "$CMD" --argjson events "$EVENTS" "$STRIP"' |
  reduce $events[] as $e (.;
    .hooks[$e.name] = ((.hooks[$e.name] // []) + [
      {hooks: [{type: "command", command: $cmd, timeout: 5}]}
      + (if $e.matcher then {matcher: $e.matcher} else {} end)
    ]))
' "$SETTINGS.bak-claude-status" > "$SETTINGS"

echo "Installed the Claude Status hook ($("$JQ" '.hooks | length' "$SETTINGS") events). Backup: $SETTINGS.bak-claude-status"
