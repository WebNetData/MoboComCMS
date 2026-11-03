#!/usr/bin/env bash
# Install only the existing Server Panel web capabilities, from reviewed root-owned assets.
# No mail stack, arbitrary service commands or global filesystem sandbox relaxation.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run as root' >&2; exit 1; }
case "${1:-open}" in open|closed) ;; *) echo 'Invalid listener state' >&2; exit 2 ;; esac
id mobocom >/dev/null
ASSETS="$(cd "$(dirname "$0")" && pwd)"
install -m 755 -o root -g root "$ASSETS/mobocom-webctl" /usr/local/sbin/mobocom-webctl
install -d -m 755 -o root -g root /usr/local/libexec/mobocom
install -m 755 -o root -g root "$ASSETS/certificate-import.py" "$ASSETS/bootstrap-web.sh" /usr/local/libexec/mobocom/
install -d -m 700 -o root -g root /etc/mobocom/certificates /etc/mobocom/installation
install -d -m 700 -o mobocom -g mobocom /etc/mobocom/secrets
install -d -m 755 /etc/letsencrypt /var/www/letsencrypt /etc/letsencrypt/renewal-hooks/deploy /etc/systemd/system/mobocom.service.d
cat > /etc/sudoers.d/mobocom-web <<'SUDO'
# Fixed root-owned web helper validates every argument; no arbitrary shell.
mobocom ALL=(root) NOPASSWD: /usr/local/sbin/mobocom-webctl
SUDO
chmod 440 /etc/sudoers.d/mobocom-web
visudo -cf /etc/sudoers.d/mobocom-web >/dev/null
cat > /etc/systemd/system/mobocom.service.d/web-setup.conf <<'UNIT'
[Service]
NoNewPrivileges=false
ReadWritePaths=/etc/nginx /etc/letsencrypt /etc/mobocom /var/www/letsencrypt
UNIT
chmod 644 /etc/systemd/system/mobocom.service.d/web-setup.conf
printf '#!/bin/sh\nexec systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/mobocom-reload-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/mobocom-reload-nginx
systemctl daemon-reload
# Debian and Ubuntu name the renewal timer certbot.timer; EPEL (AlmaLinux) names it certbot-renew.timer.
RENEW_TIMER=certbot.timer
systemctl cat certbot.timer >/dev/null 2>&1 || RENEW_TIMER=certbot-renew.timer
systemctl enable --now "$RENEW_TIMER" nginx >/dev/null
if [ "${1:-open}" = closed ]; then /usr/local/sbin/mobocom-webctl setup-close; else /usr/local/sbin/mobocom-webctl setup-open; fi
