#!/usr/bin/env bash
# One-time setup for one-click updates from the admin panel (Ubuntu with systemd and a git checkout).
#
#   sudo bash deploy/ubuntu/updater-install.sh
#
# Installs /usr/local/sbin/mobocom-update and a narrow sudo rule: the site's service user may start that helper
# and restart the site service, nothing else. Idempotent.
set -euo pipefail

APP_USER="${APP_USER:-mobocom}"
SERVICE="${SERVICE:-mobocom}"

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
id "$APP_USER" >/dev/null 2>&1 || { echo "Service user '$APP_USER' does not exist." >&2; exit 1; }

install -m 755 -o root -g root "$(dirname "$0")/mobocom-update" /usr/local/sbin/mobocom-update
chmod +x "$(dirname "$0")/self-update.sh"

cat > /etc/sudoers.d/mobocom-update <<SUDO
# Written by updater-install.sh — the site may only run these exact commands.
${APP_USER} ALL=(root) NOPASSWD: /usr/local/sbin/mobocom-update
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${SERVICE}
SUDO
chmod 440 /etc/sudoers.d/mobocom-update
visudo -cf /etc/sudoers.d/mobocom-update >/dev/null
echo "Done. The admin page 'به‌روزرسانی سایت' can now update this site to a new release."
