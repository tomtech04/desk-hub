#!/usr/bin/env bash
# One-time setup on the Raspberry Pi. Run from the desk-hub folder:
#   bash scripts/install-pi.sh
# Safe to re-run.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(id -un)"
cd "$APP_DIR"

echo "==> Node.js 22+"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

echo "==> Dependencies"
npm ci --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
  echo "   Created .env — fill it in, then: sudo systemctl restart desk-hub"
fi

echo "==> Let the hub control the Touch Display 2 backlight (no sudo at runtime)"
sudo tee /etc/udev/rules.d/99-desk-hub-backlight.rules >/dev/null <<'EOF'
SUBSYSTEM=="backlight", RUN+="/bin/chmod 666 /sys/class/backlight/%k/brightness /sys/class/backlight/%k/bl_power"
EOF
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=backlight
ls /sys/class/backlight/ || echo "   (no backlight device found — is the display connected?)"

echo "==> Server as a systemd service"
sudo tee /etc/systemd/system/desk-hub.service >/dev/null <<EOF
[Unit]
Description=Desk Hub
After=network-online.target
Wants=network-online.target

[Service]
User=$USER_NAME
WorkingDirectory=$APP_DIR
ExecStart=$(command -v node) --env-file-if-exists=.env server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now desk-hub
sudo systemctl restart desk-hub

echo "==> Kiosk browser on login"
chmod +x "$APP_DIR/scripts/kiosk.sh"
if [ -d "$HOME/.config/labwc" ] || command -v labwc >/dev/null; then
  mkdir -p "$HOME/.config/labwc"
  # A user autostart replaces the system one, so start from a copy of it
  # (keeps the desktop/panel running behind the kiosk).
  if [ ! -f "$HOME/.config/labwc/autostart" ] && [ -f /etc/xdg/labwc/autostart ]; then
    cp /etc/xdg/labwc/autostart "$HOME/.config/labwc/autostart"
  fi
  touch "$HOME/.config/labwc/autostart"
  grep -q kiosk.sh "$HOME/.config/labwc/autostart" || echo "$APP_DIR/scripts/kiosk.sh &" >> "$HOME/.config/labwc/autostart"
  echo "   Added to labwc autostart"
elif [ -f "$HOME/.config/wayfire.ini" ]; then
  grep -q kiosk.sh "$HOME/.config/wayfire.ini" || printf '\n[autostart]\ndeskhub = %s\n' "$APP_DIR/scripts/kiosk.sh" >> "$HOME/.config/wayfire.ini"
  echo "   Added to wayfire autostart"
else
  echo "   Couldn't find labwc or wayfire — start scripts/kiosk.sh from your desktop's autostart."
fi

echo "==> Never blank the screen (the hub manages brightness itself)"
sudo raspi-config nonint do_blanking 1 || true

echo
echo "Done. Hub: http://$(hostname).local:8080"
echo "Logs: journalctl -u desk-hub -f"
echo "Reboot to start the kiosk: sudo reboot"
