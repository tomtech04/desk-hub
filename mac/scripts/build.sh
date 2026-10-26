#!/bin/zsh
# Builds "Desk Hub.app" (the Mac app) into mac/build/.
set -euo pipefail
cd "${0:A:h:h}"

swift build -c release

APP="build/Desk Hub.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp .build/release/DeskHub "$APP/Contents/MacOS/"
cp Resources/Info.plist "$APP/Contents/"
# The "Turn On" button in the Claude panel runs this copy of the hook setup.
mkdir -p "$APP/Contents/Resources/scripts" "$APP/Contents/Resources/hooks"
cp scripts/setup-hook.sh "$APP/Contents/Resources/scripts/"
cp hooks/claude-status-hook.sh "$APP/Contents/Resources/hooks/"

# The same icon as the hub's other apps, at every size macOS asks for.
if [[ ! -f build/AppIcon.icns ]]; then
  ICONSET="$(mktemp -d)/AppIcon.iconset"
  mkdir -p "$ICONSET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" ../scripts/mac-app-icon.png --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
    sips -z "$((size * 2))" "$((size * 2))" ../scripts/mac-app-icon.png --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o build/AppIcon.icns
fi
cp build/AppIcon.icns "$APP/Contents/Resources/"

# Ad-hoc signature, so macOS will run it and allow the login item.
codesign --force --sign - "$APP"
echo "Built $APP"
