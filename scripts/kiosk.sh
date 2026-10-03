#!/usr/bin/env bash
# Full-screen Chromium pointed at the hub. Started by the desktop's autostart.
URL="${DESK_HUB_URL:-http://localhost:8080}"

# Wait for the server (it starts in parallel at boot).
for _ in $(seq 1 60); do curl -fs "$URL/api/dashboard" >/dev/null && break; sleep 1; done

BROWSER="$(command -v chromium || command -v chromium-browser)"
exec "$BROWSER" \
  --kiosk "$URL" \
  --ozone-platform=wayland \
  --noerrdialogs --disable-infobars --no-first-run \
  --disable-session-crashed-bubble --disable-features=Translate \
  --autoplay-policy=no-user-gesture-required \
  --overscroll-history-navigation=0 --disable-pinch \
  --password-store=basic \
  --check-for-update-interval=31536000
