#!/usr/bin/env bash
# One-time, on the Pi: let the hub's user reboot the Pi without a password, so
# the "Restart the Pi" button in Settings works. Grants reboot only.
#   bash scripts/allow-restart.sh
set -euo pipefail
USER_NAME="$(id -un)"
sudo tee /etc/polkit-1/rules.d/50-desk-hub-reboot.rules >/dev/null <<RULE
// Desk Hub: allow $USER_NAME to reboot (and nothing else) without a password.
polkit.addRule(function (action, subject) {
  if ((action.id == "org.freedesktop.login1.reboot" || action.id == "org.freedesktop.login1.reboot-multiple-sessions")
      && subject.user == "$USER_NAME") {
    return polkit.Result.YES;
  }
});
RULE
sudo systemctl restart polkit
echo "Done. Can reboot: $(busctl call org.freedesktop.login1 /org/freedesktop/login1 org.freedesktop.login1.Manager CanReboot)"
