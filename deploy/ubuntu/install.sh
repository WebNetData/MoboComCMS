#!/usr/bin/env bash
# Installs MoboComCMS on a fresh Ubuntu 22.04 or 24.04 server with one command.
#
#   sudo bash install.sh --domain example.com --email you@example.com
#
# Options:
#   --domain NAME     the site's domain (asked for when missing)
#   --email ADDRESS   for the Let's Encrypt certificate (asked for when missing)
#   --no-ssl          skip the certificate (DNS not ready yet, or a proxy provides it)
#   --no-firewall     leave the firewall as it is
#   --branch NAME     the code branch to install (default: main)
#   --repo URL        the code repository (default: this project on GitHub)
#
# Safe to run again: it continues where it stopped. It never replaces the settings file, recreates a database or
# touches stored files, and it never updates the code of a site that is already installed (use "mobocom update").
set -euo pipefail

DOMAIN=""
EMAIL=""
SSL=1
FIREWALL=1
BRANCH="${BRANCH:-main}"
REPO="${REPO:-}"
GITHUB_PATH="WebNetData/MoboComCMS"
APP_USER="${APP_USER:-mobocom}"
HOME_DIR="${HOME_DIR:-/opt/mobocom}"
APP_DIR="$HOME_DIR/app"
ENV_DIR=/etc/mobocom
ENV_FILE="$ENV_DIR/mobocom.env"
BACKUP_DIR="${HOST_BACKUP_DIR:-/var/backups/mobocom}"

say() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die() { printf '\n[install] %s\n' "$*" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in --domain|--email|--branch|--repo) [ $# -ge 2 ] && [[ "$2" != --* ]] || die "missing value for $1" ;; esac
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --repo) REPO="${2:-}"; shift 2 ;;
    --no-ssl) SSL=0; shift ;;
    --no-firewall) FIREWALL=0; shift ;;
    -h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
done

[ "$(id -u)" -eq 0 ] || die "run this as root: sudo bash install.sh"
# The supplied systemd units have fixed paths/users. Do not silently install mismatched units.
[ "$APP_USER" = mobocom ] && [ "$HOME_DIR" = /opt/mobocom ] || die 'automatic installation uses mobocom and /opt/mobocom; use the manual guide for custom paths'
[[ "$BACKUP_DIR" = /* ]] && [[ "$BACKUP_DIR" != *[[:space:]\'\"\$\`\\]* ]] || die 'invalid absolute host backup path'
case "$BACKUP_DIR/" in /opt/mobocom/*) die 'host backups must be outside the service home' ;; esac
exec 9>/run/lock/mobocom-install.lock
flock -n 9 || die 'another installation is running'
. /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:22.04|ubuntu:24.04) ;;
  *) die "this installer supports Ubuntu 22.04 and 24.04; see docs/DEPLOY-COOLIFY.md or docs/DEPLOY-VPS-HOST-FA.md for other systems" ;;
esac

[ -n "$DOMAIN" ] || read -r -p "Site domain (example.com): " DOMAIN
DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN%%/*}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] || die "invalid domain: $DOMAIN"
if [ "$SSL" = 1 ] && [ -z "$EMAIL" ]; then read -r -p "Email for the SSL certificate: " EMAIL; fi
if [ "$SSL" = 1 ]; then [[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || die "invalid email: $EMAIL"; fi
[[ "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$ ]] && [[ "$BRANCH" != *..* ]] || die "invalid branch: $BRANCH"
if [ -n "$REPO" ]; then
  [[ "$REPO" =~ ^https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ || "$REPO" =~ ^git@github.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]] || die 'automatic installation supports HTTPS or SSH GitHub repositories only'
fi

FREE_GB="$(df -Pk / | awk 'NR==2 {print int($4 / 1048576)}')"
[ "$FREE_GB" -ge 15 ] || die "only ${FREE_GB} GB free on the disk; at least 15 GB is needed"

say "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates gnupg openssl sudo nginx redis-server ufw certbot python3 python3-certbot-nginx >/dev/null
git check-ref-format --branch "$BRANCH" >/dev/null || die 'invalid branch'

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 22 ? 0 : 1)' 2>/dev/null; then
  say "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi

if ! command -v pg_ctlcluster >/dev/null 2>&1 || [ ! -x /usr/lib/postgresql/17/bin/postgres ]; then
  say "PostgreSQL 17"
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq postgresql-17 >/dev/null
fi
systemctl enable --now postgresql redis-server >/dev/null

MEMORY_MB="$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)"
SWAP_MB="$(awk '/SwapTotal/ {print int($2 / 1024)}' /proc/meminfo)"
if [ $((MEMORY_MB + SWAP_MB)) -lt 6000 ] && [ ! -e /swapfile ]; then
  say "Swap (building the site needs more memory than this server has)"
  if fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  else
    rm -f /swapfile
    note "swap could not be created; the build may run out of memory"
  fi
fi

if [ "$FIREWALL" = 1 ]; then
  say "Firewall"
  # Whatever port this very connection uses stays open, not only the default one.
  SSH_PORTS="$(sshd -T 2>/dev/null | awk '$1 == "port" {print $2}')" || die 'cannot inspect SSH ports; firewall left unchanged'
  [ -n "$SSH_PORTS" ] || die 'no SSH ports detected; firewall left unchanged'
  for port in $SSH_PORTS; do ufw allow "$port/tcp" >/dev/null; done
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null || note "the firewall could not be enabled; open only ports 22, 80 and 443"
fi

say "Service user and code"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$HOME_DIR" --shell /bin/bash "$APP_USER"
as_app() { sudo -u "$APP_USER" -H "$@"; }

# A public repository is read over HTTPS; a private one with a read-only deploy key belonging to the service user.
if [ ! -d "$APP_DIR/.git" ]; then
  if [ -z "$REPO" ]; then
    if as_app env GIT_TERMINAL_PROMPT=0 git ls-remote -q "https://github.com/$GITHUB_PATH.git" HEAD >/dev/null 2>&1; then
      REPO="https://github.com/$GITHUB_PATH.git"
    else
      REPO="git@github.com:$GITHUB_PATH.git"
    fi
  fi
  case "$REPO" in
    git@*|ssh://*)
      KEY="$HOME_DIR/.ssh/id_ed25519"
      as_app mkdir -p -m 700 "$HOME_DIR/.ssh"
      [ -f "$KEY" ] || as_app ssh-keygen -q -t ed25519 -N '' -C "mobocom-deploy@$DOMAIN" -f "$KEY"
      # Pinned public key from GitHub's official SSH fingerprint documentation, not an unauthenticated keyscan.
      printf '%s\n' 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' | as_app tee "$HOME_DIR/.ssh/known_hosts" >/dev/null
      as_app chmod 600 "$HOME_DIR/.ssh/known_hosts"
      until as_app env GIT_TERMINAL_PROMPT=0 GIT_SSH_COMMAND='ssh -o BatchMode=yes -o StrictHostKeyChecking=yes' git ls-remote -q "$REPO" HEAD >/dev/null 2>&1; do
        printf '\nThe repository is private. On GitHub open Settings > Deploy keys > Add deploy key,\n'
        printf 'paste this line and leave "Allow write access" off:\n\n'
        cat "$KEY.pub"
        printf '\nPress Enter when it is added (Ctrl+C to stop): '
        read -r _
      done
      ;;
  esac
  as_app git clone -q --branch "$BRANCH" -- "$REPO" "$APP_DIR"
else
  note "code already present; left as it is"
fi
as_app mkdir -p "$APP_DIR/storage" "$APP_DIR/var"

say "Settings"
secret() { openssl rand -hex 32; }
install -d -m 755 "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  if [ "$(sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='mobocom'")" = "1" ]; then
    die "the database user already exists but $ENV_FILE is missing; put back your saved copy of that file and run this again"
  fi
  DB_PASS="$(openssl rand -hex 24)"
  ( umask 027
    cat > "$ENV_FILE.new" <<EOF
NODE_ENV=production
NEXTAUTH_URL=https://$DOMAIN
NEXTAUTH_SECRET=$(secret)
INTERNAL_JOBS_SECRET=$(secret)
PANEL_CREDENTIAL_KEY=$(secret)
BACKUP_ENCRYPTION_KEY=$(secret)
BACKUP_SCHEDULER=false
REDIS_URL=redis://127.0.0.1:6379
DATABASE_URL=postgresql://mobocom:$DB_PASS@127.0.0.1:5432/mobocom?schema=public
HOST_BACKUP_DIR=$BACKUP_DIR
RUN_MIGRATIONS_ON_START=true
SITE_LOCALES=fa
SITE_APPEARANCE=light
EOF
  )
  chown "root:$APP_USER" "$ENV_FILE.new"
  mv "$ENV_FILE.new" "$ENV_FILE"
else
  note "$ENV_FILE already present; kept unchanged"
fi
chown "root:$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

say "Database"
DB_PASS="$(sed -n 's|^DATABASE_URL=postgresql://mobocom:\([a-f0-9]\{48\}\)@127.0.0.1:5432/mobocom?schema=public$|\1|p' "$ENV_FILE")"
# Existing custom/external database configurations are never reinterpreted as local SQL.
if [ -n "$DB_PASS" ]; then
if [ "$(sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='mobocom'")" != "1" ]; then
  [ -n "$DB_PASS" ] || die "$ENV_FILE does not use the local database; create the database yourself and run this again"
  # Through stdin, so the password never appears in the process list.
  sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<EOF
CREATE USER mobocom WITH PASSWORD '$DB_PASS';
EOF
fi
if [ "$(sudo -u postgres psql -tAc "select 1 from pg_database where datname='mobocom'")" != "1" ]; then
  sudo -u postgres createdb -O mobocom mobocom
else
  note "database already present; left as it is"
fi
else
  note 'custom database configuration kept; no local role/database created'
fi

if [ ! -f "$APP_DIR/.next/BUILD_ID" ]; then
  say "Building the site (about 5 to 15 minutes)"
  as_app bash -c "cd '$APP_DIR' && set -a && . '$ENV_FILE' && set +a && npm ci --include=dev --no-audit --no-fund && NODE_OPTIONS=--max-old-space-size=\${BUILD_MEMORY_MB:-4096} npm run build:postgres"
else
  note "site already built; left as it is"
fi

say "Service, backups and the mobocom command"
# Privileged assets come from a separate root-owned remote snapshot, never the app-writable checkout.
# An existing installation is not an authorization to execute its local files as root.
ROOT_ASSETS="$(mktemp -d /root/mobocom-install.XXXXXXXX)"
trap 'rm -rf -- "$ROOT_ASSETS"' EXIT
if [ -z "$REPO" ]; then REPO="$(as_app git remote get-url origin)"; fi
[[ "$REPO" =~ ^https://github.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ || "$REPO" =~ ^git@github.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]] || die 'untrusted repository URL'
printf '%s\n' 'github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl' > "$ROOT_ASSETS/known_hosts"
GIT_SSH_COMMAND="ssh -i /opt/mobocom/.ssh/id_ed25519 -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$ROOT_ASSETS/known_hosts" GIT_TERMINAL_PROMPT=0 git -c core.hooksPath=/dev/null clone -q --no-checkout --depth 1 --branch "$BRANCH" -- "$REPO" "$ROOT_ASSETS/repo"
for asset in mobocom.service mobocom-backup.service mobocom-backup.timer updater-install.sh mobocom-update mobocom nginx-mobocom.conf; do
  git -C "$ROOT_ASSETS/repo" show "HEAD:deploy/ubuntu/$asset" > "$ROOT_ASSETS/$asset"
done
install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$BACKUP_DIR"
install -m 644 "$ROOT_ASSETS/mobocom.service" "$ROOT_ASSETS/mobocom-backup.service" "$ROOT_ASSETS/mobocom-backup.timer" /etc/systemd/system/
systemctl daemon-reload
bash "$ROOT_ASSETS/updater-install.sh" >/dev/null
install -m 755 -o root -g root "$ROOT_ASSETS/mobocom" /usr/local/bin/mobocom
systemctl enable --now mobocom-backup.timer >/dev/null
systemctl enable mobocom >/dev/null
systemctl restart mobocom

printf '    waiting for the site'
READY=0
for _ in $(seq 1 120); do
  if curl -fsS -m 5 http://127.0.0.1:3000/api/health/ready >/dev/null 2>&1; then READY=1; break; fi
  printf '.'; sleep 3
done
printf '\n'
[ "$READY" = 1 ] || die "the site did not start; see: sudo journalctl -u mobocom -n 80 --no-pager"

say "Web server"
SITE=/etc/nginx/sites-available/mobocom
if [ ! -f "$SITE" ]; then
  sed "s/example\.com/$DOMAIN/g" "$ROOT_ASSETS/nginx-mobocom.conf" > "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/mobocom
  rm -f /etc/nginx/sites-enabled/default
else
  note "$SITE already present; kept unchanged"
fi
nginx -t >/dev/null 2>&1 || die "the web server configuration is invalid; see: sudo nginx -t"
systemctl reload nginx 2>/dev/null || systemctl restart nginx

SSL_DONE=0
if [ "$SSL" = 1 ]; then
  say "SSL certificate"
  NAMES=(-d "$DOMAIN")
  getent hosts "www.$DOMAIN" >/dev/null 2>&1 && NAMES+=(-d "www.$DOMAIN")
  if certbot --nginx --non-interactive --agree-tos --no-eff-email -m "$EMAIL" "${NAMES[@]}" --redirect; then
    SSL_DONE=1
  else
    note "the certificate was not issued. Point the domain's A record at this server, then run:"
    note "sudo certbot --nginx ${NAMES[*]} --redirect"
  fi
fi

say "Installed"
TOKEN_FILE="$APP_DIR/storage/config/install.token"
if [ -f "$TOKEN_FILE" ] && [ ! -f "$APP_DIR/storage/config/installed.lock" ]; then
  note "Finish through HTTPS:  https://$DOMAIN/install"
  [ "$SSL_DONE" = 1 ] || note 'HTTPS must be supplied by your proxy or configured with certbot before entering installation secrets.'
  note "Installation code:      $(cat "$TOKEN_FILE")"
  note "The page closes for good after the first administrator is created."
fi
note "Keep a copy of $ENV_FILE outside this server now, and never change PANEL_CREDENTIAL_KEY."
note "Status: sudo mobocom status   Update: sudo mobocom update   Guide: docs/UPGRADE-FA.md"
