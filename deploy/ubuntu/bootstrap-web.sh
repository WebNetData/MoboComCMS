#!/usr/bin/env bash
# Private implementation behind root-owned mobocom-webctl; no uploaded templates or paths.
set -euo pipefail
umask 077
NGINX_DIR="${WEBCTL_NGINX_DIR:-/etc/nginx}"
ROOT="${WEBCTL_BOOTSTRAP_DIR:-/etc/mobocom/installation}"
FILE="$NGINX_DIR/sites-available/mobocom-install-bootstrap.conf"
LINK="$NGINX_DIR/sites-enabled/mobocom-install-bootstrap.conf"
DRY="${WEBCTL_DRY:-0}"
die() { echo "ERROR: $*" >&2; exit 2; }
reload() { [ "$DRY" = 1 ] || { nginx -t >&2 && systemctl reload nginx; }; }
[ "$DRY" = 1 ] || [ "$(id -u)" -eq 0 ] || die 'run through the root web helper'
case "${1:-}" in
  setup-close)
    if [ -f "$FILE" ]; then
      grep -q '^# MoboCom private installation listener$' "$FILE" || die 'unrecognized bootstrap configuration; left unchanged'
      saved="$(mktemp)"; cp "$FILE" "$saved"
      rm -f -- "$LINK" "$FILE"
      if ! reload; then install -m 644 "$saved" "$FILE"; ln -s "$FILE" "$LINK"; rm -f "$saved"; die 'nginx rejected removal; previous listener restored'; fi
      rm -f "$saved"
    fi
    echo 'OK temporary installation listener closed' ;;
  setup-open)
    [ ! -L "$FILE" ] || die 'bootstrap configuration must not be a symlink'
    if [ -f "$FILE" ]; then grep -q '^# MoboCom private installation listener$' "$FILE" || die 'unrecognized bootstrap configuration; left unchanged'; fi
    install -d -m 700 "$ROOT"
    if [ ! -s "$ROOT/certificate.pem" ] || [ ! -s "$ROOT/private-key.pem" ] || ! openssl x509 -checkend 86400 -noout -in "$ROOT/certificate.pem" >/dev/null; then
      san="$(python3 - $(hostname -I) <<'PY'
import ipaddress
import sys
values = ['DNS:localhost', 'IP:127.0.0.1']
for value in sys.argv[1:21]:
    try:
        values.append('IP:' + str(ipaddress.ip_address(value)))
    except ValueError:
        pass
print(','.join(dict.fromkeys(values)))
PY
)"
      work="$(mktemp -d "$ROOT/.certificate.XXXXXXXX")"
      trap 'rm -rf -- "$work"' EXIT
      openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 14 -subj '/CN=MoboCom installation' -addext "subjectAltName=$san" -addext 'basicConstraints=critical,CA:FALSE' -addext 'extendedKeyUsage=serverAuth' -keyout "$work/key.pem" -out "$work/cert.pem" >/dev/null 2>&1
      install -m 600 "$work/key.pem" "$ROOT/private-key.pem"
      install -m 600 "$work/cert.pem" "$ROOT/certificate.pem"
      rm -rf -- "$work"; trap - EXIT
    fi
    install -d -m 755 "$NGINX_DIR/sites-available" "$NGINX_DIR/sites-enabled"
    backup=''; if [ -f "$FILE" ]; then backup="$(mktemp)"; cp "$FILE" "$backup"; fi
    cat > "$FILE" <<CONF
# MoboCom private installation listener
server {
    listen 8443 ssl;
    listen [::]:8443 ssl;
    server_name _;
    ssl_certificate $ROOT/certificate.pem;
    ssl_certificate_key $ROOT/private-key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 256k;
    location = / { return 302 /install; }
    location ~ ^/(install/?|api/install/?|installer/.*|fonts/.*)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        proxy_read_timeout 300s;
    }
    location / { return 404; }
}
CONF
    chmod 644 "$FILE"
    ln -sf "$FILE" "$LINK"
    if ! reload; then
      if [ -n "$backup" ]; then install -m 644 "$backup" "$FILE"; else rm -f -- "$FILE" "$LINK"; fi
      rm -f -- "$backup"; die 'nginx rejected installation listener; previous configuration restored'
    fi
    rm -f -- "$backup"
    echo 'OK temporary HTTPS installation listener: port 8443'
    openssl x509 -in "$ROOT/certificate.pem" -noout -fingerprint -sha256 ;;
  *) die 'unknown installation listener action' ;;
esac
