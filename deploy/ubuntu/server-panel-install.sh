#!/usr/bin/env bash
# One-time setup for the admin "Server panel" on Ubuntu 22.04/24.04.
#
#   sudo MAIL_HOSTNAME=mail.example.com ADMIN_IP=203.0.113.7 bash deploy/ubuntu/server-panel-install.sh
#   sudo systemctl restart mobocom
#
# What it does (idempotent — safe to run again):
#  1. Turns the panel on in /etc/mobocom/mobocom.env (optionally locked to ADMIN_IP).
#  2. Lets the site service see the whole filesystem (systemd drop-in) and
#     restart/reload a fixed list of services through a narrow sudo rule.
#  3. Unless NO_MAIL=1: installs Postfix + Dovecot + OpenDKIM for domain
#     mailboxes managed from the panel (virtual users in /etc/mobocom/mail).
#
# File access: the panel acts as the service user (mobocom). To edit files
# owned by others, grant it explicitly, e.g.:
#   sudo usermod -aG adm,www-data mobocom                 # read logs, web roots
#   sudo setfacl -R -m u:mobocom:rwX /etc/nginx/sites-available
set -euo pipefail

APP_USER="${APP_USER:-mobocom}"
ENV_FILE="${ENV_FILE:-/etc/mobocom/mobocom.env}"
MAIL_DIR="${MAIL_CONFIG_DIR:-/etc/mobocom/mail}"
MAIL_HOSTNAME="${MAIL_HOSTNAME:-}"
NO_MAIL="${NO_MAIL:-0}"

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
id "$APP_USER" >/dev/null 2>&1 || { echo "Service user '$APP_USER' does not exist." >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Environment file $ENV_FILE not found." >&2; exit 1; }
if [ "$NO_MAIL" != "1" ] && [ -z "$MAIL_HOSTNAME" ]; then
  echo "Set MAIL_HOSTNAME (e.g. mail.example.com), or NO_MAIL=1 to skip email." >&2; exit 1
fi

set_env() { # KEY VALUE — replace or append in the env file
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"; else printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"; fi
}

echo "==> Tools"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq zip unzip acl p7zip-full >/dev/null
# RAR tools (multiverse); optional — without them the download center handles ZIP/7z only.
apt-get install -y -qq unrar rar >/dev/null 2>&1 || echo "   (rar/unrar not installed — enable the multiverse repository to manage RAR archives)"

echo "==> SSL (Let's Encrypt, incl. Cloudflare DNS for wildcard certificates)"
apt-get install -y -qq certbot python3-certbot-dns-cloudflare >/dev/null
mkdir -p /var/www/letsencrypt
install -d -m 700 -o "$APP_USER" -g "$APP_USER" /etc/mobocom/secrets
# Certificates renew by themselves (certbot.timer, twice a day); nginx reloads after each renewal.
systemctl enable --now certbot.timer >/dev/null 2>&1 || true
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/mobocom-reload-nginx
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/mobocom-reload-nginx

echo "==> Web helper (domains, SSL, site address)"
install -m 755 -o root -g root "$(dirname "$0")/mobocom-webctl" /usr/local/sbin/mobocom-webctl

echo "==> Download center folder"
DL_ROOT="${DOWNLOADS_ROOT:-/var/www/dl}"
install -d -m 2775 -o "$APP_USER" -g www-data "$DL_ROOT"
set_env DOWNLOADS_ROOT "$DL_ROOT"

echo "==> Panel switch"
set_env SERVER_PANEL_ENABLED true
[ -n "${ADMIN_IP:-}" ] && set_env SERVER_PANEL_ALLOWED_IPS "$ADMIN_IP"
chmod 640 "$ENV_FILE"; chown root:"$APP_USER" "$ENV_FILE"

echo "==> systemd drop-in (whole-filesystem view, sudo allowed)"
mkdir -p /etc/systemd/system/mobocom.service.d
cat > /etc/systemd/system/mobocom.service.d/server-panel.conf <<'UNIT'
# Written by server-panel-install.sh. The server panel needs to see the whole
# filesystem and to run the narrow sudo rule in /etc/sudoers.d/mobocom-panel.
[Service]
NoNewPrivileges=false
ProtectSystem=false
ProtectHome=false
UNIT
systemctl daemon-reload

echo "==> sudo rule"
SERVICES="mobocom nginx postgresql postfix dovecot ssh fail2ban cron mobocom-backup.timer opendkim"
RULES=""
for s in $SERVICES; do
  for a in restart reload start stop; do RULES="${RULES}/usr/bin/systemctl ${a} ${s}, "; done
done
cat > /etc/sudoers.d/mobocom-panel <<SUDO
# Written by server-panel-install.sh — the site may only run these exact commands.
${APP_USER} ALL=(root) NOPASSWD: ${RULES%, }
# Domains, SSL and site address: a helper that validates every argument itself.
${APP_USER} ALL=(root) NOPASSWD: /usr/local/sbin/mobocom-webctl
SUDO
chmod 440 /etc/sudoers.d/mobocom-panel
visudo -cf /etc/sudoers.d/mobocom-panel >/dev/null

if [ "$NO_MAIL" = "1" ]; then
  echo "Done (email skipped). Now: sudo systemctl restart mobocom"; exit 0
fi

echo "==> Mail packages"
DOMAIN_GUESS="${MAIL_HOSTNAME#*.}"
debconf-set-selections <<DEB
postfix postfix/main_mailer_type select Internet Site
postfix postfix/mailname string ${DOMAIN_GUESS}
DEB
apt-get install -y -qq postfix postfix-pcre dovecot-core dovecot-imapd dovecot-lmtpd opendkim opendkim-tools ssl-cert >/dev/null

echo "==> Registry files ($MAIL_DIR)"
getent group vmail >/dev/null || groupadd -g 5000 vmail
id vmail >/dev/null 2>&1 || useradd -u 5000 -g vmail -s /usr/sbin/nologin -d /var/mail/vhosts -M vmail
mkdir -p /var/mail/vhosts && chown vmail:vmail /var/mail/vhosts && chmod 770 /var/mail/vhosts
mkdir -p "$MAIL_DIR/dkim"
for f in domains mailboxes aliases passwd; do [ -f "$MAIL_DIR/$f" ] || : > "$MAIL_DIR/$f"; done
usermod -aG dovecot,opendkim "$APP_USER"
chown root:"$APP_USER" "$MAIL_DIR" && chmod 2770 "$MAIL_DIR"
chown "$APP_USER":"$APP_USER" "$MAIL_DIR"/domains "$MAIL_DIR"/mailboxes "$MAIL_DIR"/aliases
chown "$APP_USER":dovecot "$MAIL_DIR/passwd" && chmod 640 "$MAIL_DIR/passwd"
chown "$APP_USER":opendkim "$MAIL_DIR/dkim" && chmod 2750 "$MAIL_DIR/dkim"
touch "$MAIL_DIR/dkim/KeyTable" "$MAIL_DIR/dkim/SigningTable"
chown "$APP_USER":opendkim "$MAIL_DIR/dkim/KeyTable" "$MAIL_DIR/dkim/SigningTable"

CERT=/etc/ssl/certs/ssl-cert-snakeoil.pem; KEY=/etc/ssl/private/ssl-cert-snakeoil.key
if [ -f "/etc/letsencrypt/live/${MAIL_HOSTNAME}/fullchain.pem" ]; then
  CERT="/etc/letsencrypt/live/${MAIL_HOSTNAME}/fullchain.pem"; KEY="/etc/letsencrypt/live/${MAIL_HOSTNAME}/privkey.pem"
fi

echo "==> Postfix"
# Each mailbox may send only as itself (login name = address).
printf '%s\n' '/^(.+)$/ ${1}' > /etc/postfix/mobocom-sender-login.pcre
postconf -e \
  "myhostname = ${MAIL_HOSTNAME}" \
  "mydestination = localhost" \
  "inet_interfaces = all" \
  "virtual_mailbox_domains = texthash:${MAIL_DIR}/domains" \
  "virtual_mailbox_maps = texthash:${MAIL_DIR}/mailboxes" \
  "virtual_alias_maps = texthash:${MAIL_DIR}/aliases" \
  "virtual_transport = lmtp:unix:private/dovecot-lmtp" \
  "smtpd_tls_cert_file = ${CERT}" "smtpd_tls_key_file = ${KEY}" \
  "smtpd_tls_security_level = may" "smtp_tls_security_level = may" \
  "smtpd_sasl_type = dovecot" "smtpd_sasl_path = private/auth" \
  "smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination" \
  "smtpd_sender_login_maps = pcre:/etc/postfix/mobocom-sender-login.pcre" \
  "milter_default_action = accept" "smtpd_milters = inet:localhost:8891" "non_smtpd_milters = inet:localhost:8891" \
  "message_size_limit = 52428800"
postconf -M submission/inet="submission inet n - y - - smtpd"
postconf -P "submission/inet/syslog_name=postfix/submission" "submission/inet/smtpd_tls_security_level=encrypt" \
  "submission/inet/smtpd_sasl_auth_enable=yes" "submission/inet/smtpd_recipient_restrictions=permit_sasl_authenticated,reject" \
  "submission/inet/smtpd_sender_restrictions=reject_sender_login_mismatch"

echo "==> Dovecot"
MASTER_USER="panel"
MASTER_PASS="$(grep '^MAIL_MASTER_PASSWORD=' "$ENV_FILE" | cut -d= -f2- || true)"
[ -n "$MASTER_PASS" ] || MASTER_PASS="$(openssl rand -hex 24)"
printf '%s:%s\n' "$MASTER_USER" "$(doveadm pw -s BLF-CRYPT -p "$MASTER_PASS")" > /etc/dovecot/mobocom-master.passwd
chown root:dovecot /etc/dovecot/mobocom-master.passwd && chmod 640 /etc/dovecot/mobocom-master.passwd
cat > /etc/dovecot/conf.d/99-mobocom.conf <<DOVE
# Written by server-panel-install.sh
protocols = imap lmtp
mail_location = maildir:/var/mail/vhosts/%d/%n/Maildir
mail_uid = vmail
mail_gid = vmail
first_valid_uid = 5000
disable_plaintext_auth = yes
auth_mechanisms = plain login
auth_master_user_separator = *
ssl = required
ssl_cert = <${CERT}
ssl_key = <${KEY}
passdb {
  driver = passwd-file
  args = /etc/dovecot/mobocom-master.passwd
  master = yes
  result_success = continue
}
passdb {
  driver = passwd-file
  args = scheme=BLF-CRYPT username_format=%u ${MAIL_DIR}/passwd
}
userdb {
  driver = static
  args = uid=vmail gid=vmail home=/var/mail/vhosts/%d/%n
}
service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}
service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
}
# Plain IMAP only on loopback (the panel); clients use 993.
service imap-login {
  inet_listener imap {
    address = 127.0.0.1
    port = 143
  }
  inet_listener imaps {
    port = 993
    ssl = yes
  }
}
# The panel logs in over loopback without TLS.
remote 127.0.0.1 {
  disable_plaintext_auth = no
  ssl = yes
}
namespace inbox {
  mailbox Drafts { special_use = \Drafts
    auto = subscribe }
  mailbox Sent { special_use = \Sent
    auto = subscribe }
  mailbox Trash { special_use = \Trash
    auto = subscribe }
  mailbox Junk { special_use = \Junk
    auto = subscribe }
}
DOVE
# The stock auth-system include would accept Unix accounts; keep only ours.
sed -i 's/^!include auth-system.conf.ext/#!include auth-system.conf.ext/' /etc/dovecot/conf.d/10-auth.conf

echo "==> OpenDKIM"
cat > /etc/opendkim.conf <<DKIM
# Written by server-panel-install.sh
Syslog yes
UMask 007
Mode sv
Canonicalization relaxed/simple
KeyTable refile:${MAIL_DIR}/dkim/KeyTable
SigningTable refile:${MAIL_DIR}/dkim/SigningTable
InternalHosts 127.0.0.1, ::1
Socket inet:8891@localhost
PidFile /run/opendkim/opendkim.pid
UserID opendkim
DKIM

echo "==> Environment"
set_env MAIL_CONFIG_DIR "$MAIL_DIR"
set_env MAIL_HOSTNAME "$MAIL_HOSTNAME"
set_env MAIL_MASTER_USER "$MASTER_USER"
set_env MAIL_MASTER_PASSWORD "$MASTER_PASS"

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 25/tcp >/dev/null; ufw allow 587/tcp >/dev/null; ufw allow 993/tcp >/dev/null
fi

systemctl enable --now postfix dovecot opendkim >/dev/null
systemctl restart opendkim dovecot postfix

cat <<DONE

Done. Next:
  sudo systemctl restart mobocom
  Admin → پنل سرور → ایمیل: add your domain, publish the DNS records it shows
  (MX, SPF, DKIM, DMARC) and set reverse DNS (PTR) of this IP to ${MAIL_HOSTNAME}
  at your hosting provider. Many providers block port 25 until you ask.
DONE
