#!/bin/bash
# Builds Desk Hub, signs it for the App Store with your team, and uploads it to TestFlight. After
# the one-time setup in ios/README.md ("TestFlight"), shipping an update is:
#
#   bash ios/scripts/testflight.sh
#
# Your team's details are read from ~/.appstoreconnect/desk-hub.env (never from the repo):
#   TEAM_ID=ABCDE12345            Apple Developer team ID (developer.apple.com > Membership details)
#   ASC_KEY_ID=ABC123DEFG         App Store Connect API key ID
#   ASC_ISSUER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# and the key itself in ~/.appstoreconnect/private_keys/AuthKey_<ASC_KEY_ID>.p8.
#
#   --archive-only   build and archive (signed for development, to check the build works) without
#                    uploading; needs only TEAM_ID, so it works with any team.
#
# Your phone installs (Team.xcconfig, the free Personal Team) are untouched: the team is passed on
# the command line here and never written to a file.
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVE_ONLY=0
[ "${1:-}" = "--archive-only" ] && ARCHIVE_ONLY=1

CONF="${DESKHUB_ASC_CONFIG:-$HOME/.appstoreconnect/desk-hub.env}"
# shellcheck disable=SC1090
[ -f "$CONF" ] && . "$CONF"
: "${TEAM_ID:?Set TEAM_ID in $CONF (your Apple Developer team ID)}"
if [ $ARCHIVE_ONLY = 0 ]; then
  : "${ASC_KEY_ID:?Set ASC_KEY_ID in $CONF}" "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID in $CONF}"
  KEY="${ASC_KEY_PATH:-$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8}"
  [ -f "$KEY" ] || { echo "The API key file isn't at $KEY"; exit 1; }
  AUTH=(-authenticationKeyPath "$KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
else
  AUTH=()
fi

# The ring library is Kotlin; it needs a JDK (Homebrew's openjdk@21 works without sudo).
if ! java -version >/dev/null 2>&1 && command -v brew >/dev/null; then
  export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
command -v xcodegen >/dev/null || { echo "XcodeGen is missing: brew install xcodegen"; exit 1; }

# Every upload needs a build number TestFlight hasn't seen: the time, to the minute.
BUILD="$(date +%y%m%d%H%M)"
OUT="build/testflight"
mkdir -p "$OUT"

echo "Building the ring library..."
(cd RingKit && ./gradlew --console=plain -q assembleRingKitReleaseXCFramework)
xcodegen generate >/dev/null

echo "Archiving build $BUILD for team $TEAM_ID..."
xcodebuild -project DeskHub.xcodeproj -scheme DeskHub -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/DeskHub.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD" \
  -allowProvisioningUpdates ${AUTH[@]+"${AUTH[@]}"} archive > "$OUT/archive.log" 2>&1 \
  || { echo "The archive failed. The end of $OUT/archive.log:"; grep -E "error:" "$OUT/archive.log" | sort -u | head -8; exit 1; }
echo "Archived: $OUT/DeskHub.xcarchive"
[ $ARCHIVE_ONLY = 1 ] && exit 0

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
PLIST

echo "Signing for the App Store and uploading to TestFlight..."
xcodebuild -exportArchive -archivePath "$OUT/DeskHub.xcarchive" -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" -allowProvisioningUpdates "${AUTH[@]}" > "$OUT/upload.log" 2>&1 \
  || { echo "The upload failed. The relevant lines of $OUT/upload.log:"; grep -E -i "error|denied|not found|no suitable|agreement|forbidden|403|401" "$OUT/upload.log" | sort -u | head -10; exit 1; }
echo "Uploaded build $BUILD. It shows up in the TestFlight app after Apple finishes processing it (usually 10 to 15 minutes)."
