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
[[ "$APP_USER" =~ ^[a-z_][a-z0-9_-]{0,31}$ && "$SERVICE" =~ ^[a-z][a-z0-9_-]{0,63}$ ]] || { echo 'Invalid service/user' >&2; exit 2; }
id "$APP_USER" >/dev/null 2>&1 || { echo "Service user '$APP_USER' does not exist." >&2; exit 1; }

install -m 755 -o root -g root "$(dirname "$0")/mobocom-update" /usr/local/sbin/mobocom-update

cat > /etc/sudoers.d/mobocom-update <<SUDO
# Written by updater-install.sh — the site may only run these exact commands.
${APP_USER} ALL=(root) NOPASSWD: /usr/local/sbin/mobocom-update
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart ${SERVICE}
SUDO
chmod 440 /etc/sudoers.d/mobocom-update
visudo -cf /etc/sudoers.d/mobocom-update >/dev/null
# sudo cannot elevate under NoNewPrivileges. Retain all other systemd sandboxing.
install -d -m 755 "/etc/systemd/system/$SERVICE.service.d"
printf '[Service]\nNoNewPrivileges=false\n' > "/etc/systemd/system/$SERVICE.service.d/updater.conf"
chmod 644 "/etc/systemd/system/$SERVICE.service.d/updater.conf"
systemctl daemon-reload
echo "Done. The admin page 'به‌روزرسانی سایت' can now update this site to a new release."
