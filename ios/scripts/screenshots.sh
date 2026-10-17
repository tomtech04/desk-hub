#!/bin/bash
# Boots an iPhone simulator, installs the app pointed at a hub running on this Mac (start it with
# `npm run demo` for demo data), and takes a screenshot of each screen.
#
# usage: bash ios/scripts/screenshots.sh path/to/DeskHub.app out-dir
set -euo pipefail

APP="$1"
OUT="$2"
# The Mac's LAN address rather than 127.0.0.1, so the hub treats the simulator as a phone,
# not as the desk screen.
HUB="${HUB:-http://$(ipconfig getifaddr en0 2>/dev/null || echo 127.0.0.1):8080}"
BUNDLE=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$APP/Info.plist")
mkdir -p "$OUT"

UDID=$(xcrun simctl create "Desk Hub shots" com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro)
trap 'xcrun simctl shutdown "$UDID" >/dev/null 2>&1; xcrun simctl delete "$UDID" >/dev/null 2>&1' EXIT
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b >/dev/null
xcrun simctl ui "$UDID" appearance dark
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl install "$UDID" "$APP"
echo "Simulator $UDID, hub $HUB"

shot() {
  local name="$1"; shift
  xcrun simctl terminate "$UDID" "$BUNDLE" >/dev/null 2>&1 || true
  xcrun simctl launch "$UDID" "$BUNDLE" -hubAddress "$HUB" "$@" >/dev/null
  sleep "${WAIT:-8}"
  xcrun simctl io "$UDID" screenshot "$OUT/$name.png" >/dev/null
  echo "  $name"
}

shot 01-today -startTab today
shot 02-today-tasks-mail -startTab today -scrollTo tasks
shot 03-today-payit-systems -startTab today -scrollTo payit
shot 04-today-journal -startTab today -scrollTo journal
shot 05-tasks -startTab tasks
shot 06-journal -startTab journal
shot 07-mail -startTab mail
shot 08-mail-detail -startTab mail -openMail p1
shot 09-more -startTab more
shot 10-payit -startTab more -morePage payit
shot 11-schedule -startTab more -morePage schedule
shot 12-systems -startTab more -morePage systems
shot 13-ring -startTab more -morePage ring
shot 14-connection -startTab more -morePage connection
shot 15-full-hub -startTab more -morePage web
