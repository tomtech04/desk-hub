#!/bin/sh
# Claude Code hook for Claude Status. Records the latest event for a session in
# ~/.claude/claude-status/events/<session_id>.json so the menu bar app can tell
# when a chat is stuck on a permission prompt, a question or a plan review.
# It never prints anything, so it can't change what Claude does.

input=$(/bin/cat)

# First value of a top-level string field, still JSON-escaped (safe to embed again).
field() {
  printf '%s' "$input" | /usr/bin/head -c 16384 \
    | /usr/bin/grep -oE "\"$1\" *: *\"([^\"\\\\]|\\\\.)*\"" | /usr/bin/head -n 1 \
    | /usr/bin/sed -E "s/^\"$1\" *: *\"//; s/\"\$//"
}

sid=$(field session_id)
case "$sid" in
  '' | *[!A-Za-z0-9_-]*) exit 0 ;;
esac

event=$(field hook_event_name)
tool=$(field tool_name)
ntype=""
message=""
if [ "$event" = "Notification" ]; then
  ntype=$(field notification_type)
  message=$(field message)
fi

dir="$HOME/.claude/claude-status/events"
/bin/mkdir -p "$dir" || exit 0
tmp="$dir/.$sid.$$"
printf '{"event":"%s","tool":"%s","notification_type":"%s","message":"%s","at":%s}\n' \
  "$event" "$tool" "$ntype" "$message" "$(/bin/date +%s)" > "$tmp" \
  && /bin/mv -f "$tmp" "$dir/$sid.json"
exit 0
