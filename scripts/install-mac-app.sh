#!/bin/bash
# Installs "Desk Hub" as an app on this Mac: a small launcher (in ~/Applications)
# that opens the hub's workstation in its own browser window, with no tabs or
# address bar. It uses Chrome, Edge or Brave if one is installed, else the default
# browser. Run it again any time to change the address.
#
# usage: bash scripts/install-mac-app.sh https://your-hub-address/
set -euo pipefail

URL="${1:?usage: bash scripts/install-mac-app.sh https://your-hub-address/}"
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HOME/Applications/Desk Hub.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$HOME/Applications"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# The icon, at every size macOS asks for.
ICONSET="$TMP/icon.iconset"
mkdir "$ICONSET"
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$HERE/mac-app-icon.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$HERE/mac-app-icon.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns"

cat > "$APP/Contents/MacOS/desk-hub" <<LAUNCH
#!/bin/bash
URL="$URL"
for browser in "Google Chrome" "Microsoft Edge" "Brave Browser"; do
  if [ -d "/Applications/\$browser.app" ]; then exec open -na "\$browser" --args --app="\$URL"; fi
done
exec open "\$URL"
LAUNCH
chmod +x "$APP/Contents/MacOS/desk-hub"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Desk Hub</string>
  <key>CFBundleDisplayName</key><string>Desk Hub</string>
  <key>CFBundleIdentifier</key><string>dev.deskhub.launcher</string>
  <key>CFBundleExecutable</key><string>desk-hub</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
PLIST

touch "$APP"
echo "Installed: $APP -> $URL"
