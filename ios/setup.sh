#!/bin/bash
# Builds RingKit (the Kotlin wrapper around the Index 01's Bluetooth library) and generates
# ios/DeskHub.xcodeproj. Run it once, and again after pulling changes to ios/.
#
# Needs Xcode, a JDK 17 or newer (brew install --cask temurin) and XcodeGen (brew install xcodegen).
#
# usage: bash ios/setup.sh
#        TEAM_ID=ABCDE12345 bash ios/setup.sh            (your Apple team, so you don't pick it in Xcode)
#        BUNDLE_ID=com.you.deskhub bash ios/setup.sh     (if Xcode says the bundle ID is taken)
set -euo pipefail
cd "$(dirname "$0")"

command -v xcodegen >/dev/null || { echo "XcodeGen is missing: brew install xcodegen"; exit 1; }
java -version >/dev/null 2>&1 || { echo "A JDK is missing: brew install --cask temurin"; exit 1; }

if [ -n "${TEAM_ID:-}${BUNDLE_ID:-}" ]; then
  : > Config/Team.xcconfig
  if [ -n "${TEAM_ID:-}" ]; then echo "DEVELOPMENT_TEAM = $TEAM_ID" >> Config/Team.xcconfig; fi
  if [ -n "${BUNDLE_ID:-}" ]; then echo "DESKHUB_BUNDLE_ID = $BUNDLE_ID" >> Config/Team.xcconfig; fi
fi

echo "Building RingKit (the first time downloads Kotlin, a few minutes)..."
(cd RingKit && ./gradlew --console=plain assembleRingKitReleaseXCFramework)

xcodegen generate
echo
echo "Done. Open ios/DeskHub.xcodeproj, pick your iPhone at the top, and press Run."
