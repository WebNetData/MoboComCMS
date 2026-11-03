# The systems install.sh supports and how each one installs packages and names its services.
# Sourced by install.sh from the same trusted bundle; it only defines variables and functions.
# Needs: die, note (install.sh) and the fields of /etc/os-release (ID, VERSION_ID, VERSION_CODENAME).

# Debian family: Ubuntu 22.04/24.04/26.04 LTS, Debian 12/13. RHEL family: AlmaLinux 9/10.
platform_admit() {
  case "${ID:-}:${VERSION_ID:-}" in
    ubuntu:22.04|ubuntu:24.04|ubuntu:26.04|debian:12|debian:13) PLATFORM=debian ;;
    almalinux:9|almalinux:9.[0-9]*|almalinux:10|almalinux:10.[0-9]*) PLATFORM=rhel ;;
    *) die "this installer supports Ubuntu 22.04, 24.04 and 26.04 LTS, Debian 12 and 13, and AlmaLinux 9 and 10; see docs/DEPLOY-COOLIFY.md or docs/DEPLOY-VPS-HOST-FA.md for other systems" ;;
  esac
  OS_MAJOR="${VERSION_ID%%.*}"
}

# Restricted networks: some countries block the hosts below. "auto" takes a mirror only for a host this server cannot
# reach; --mirrors (on) always, --no-mirrors (off) never. What comes from a mirror is checked as from the original:
# PostgreSQL's packages by their signing key (pinned below), npm packages by the hashes in package-lock.json.
NETWORK_MIRRORS="${NETWORK_MIRRORS:-auto}"
NPM_MIRROR=https://mirror-npm.runflare.com/
PG_MIRROR=https://mirrors.aliyun.com/postgresql
PGDG_KEY_FINGERPRINT=B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8
reachable() { [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$1" 2>/dev/null)" != 000 ]; }
use_mirror() { case "$NETWORK_MIRRORS" in on) return 0 ;; off) return 1 ;; esac; ! reachable "$1"; }

pkg_install() {
  if [ "$PLATFORM" = debian ]; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null
  else
    dnf install -y -q "$@" >/dev/null
  fi
}
pkg_available() {
  if [ "$PLATFORM" = debian ]; then apt-cache show "$1" >/dev/null 2>&1; else dnf -q info "$1" >/dev/null 2>&1; fi
}

# System packages: web server, cache, certificates, firewall and the tools the installer itself uses.
# $1 = 1 when the browser setup needs the Cloudflare DNS plugin, $2 = 1 when the code comes from Git.
platform_packages() {
  local cloudflare="$1" git="$2" extra=()
  if [ "$PLATFORM" = debian ]; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    # Debian 13 and newer Ubuntu may ship Valkey (the Redis fork, same protocol) in place of Redis.
    if pkg_available redis-server; then REDIS_PKG=redis-server; REDIS_SERVICE=redis-server; else REDIS_PKG=valkey-server; REDIS_SERVICE=valkey-server; fi
    [ "$cloudflare" = 1 ] && extra+=(python3-certbot-dns-cloudflare)
    [ "$git" = 1 ] && extra+=(git)
    pkg_install curl ca-certificates gnupg openssl sudo nginx "$REDIS_PKG" ufw certbot python3 python3-certbot-nginx "${extra[@]}"
    FIREWALL_TOOL=ufw
  else
    # Certbot and its plugins come from EPEL; some of their Python dependencies from CRB.
    pkg_install epel-release dnf-plugins-core
    dnf config-manager --set-enabled crb >/dev/null 2>&1 || note 'could not enable the CRB repository; continuing'
    # RHEL 10 replaced Redis with Valkey (the Redis fork, same protocol and port).
    if pkg_available redis; then REDIS_PKG=redis; REDIS_SERVICE=redis; else REDIS_PKG=valkey; REDIS_SERVICE=valkey; fi
    [ "$cloudflare" = 1 ] && extra+=(python3-certbot-dns-cloudflare)
    [ "$git" = 1 ] && extra+=(git)
    # curl is already there as curl-minimal; asking for the full package would conflict with it.
    command -v curl >/dev/null 2>&1 || extra+=(curl)
    pkg_install ca-certificates gnupg2 openssl sudo tar hostname util-linux nginx "$REDIS_PKG" firewalld certbot python3 python3-certbot-nginx "${extra[@]}"
    FIREWALL_TOOL=firewalld
  fi
}

node22_ready() { node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 22 ? 0 : 1)' 2>/dev/null; }
platform_node() {
  node22_ready && return 0
  if [ "$PLATFORM" = debian ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    pkg_install nodejs
  else
    # The system's own Node.js 22 first (an AppStream module on 9, the default on 10), NodeSource otherwise.
    if [ "$OS_MAJOR" = 9 ]; then dnf -y -q module reset nodejs >/dev/null 2>&1 || true; dnf -y -q module enable nodejs:22 >/dev/null 2>&1 || true; fi
    pkg_install nodejs npm || true
    if ! node22_ready; then
      curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null
      dnf install -y -q --allowerasing nodejs >/dev/null
    fi
  fi
  node22_ready || die 'Node.js 22 could not be installed'
}

# PostgreSQL 17 from the PostgreSQL project's own repository, its service name and where its programs are.
platform_postgres() {
  if [ "$PLATFORM" = debian ]; then
    PG_SERVICE=postgresql
    if ! command -v pg_ctlcluster >/dev/null 2>&1 || [ ! -x /usr/lib/postgresql/17/bin/postgres ]; then
      local base=https://apt.postgresql.org/pub/repos/apt key=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc url fpr=''
      if use_mirror "$base/"; then
        base="$PG_MIRROR/repos/apt"
        note "apt.postgresql.org is not reachable; PostgreSQL's packages come from $PG_MIRROR, signed by the same key"
      fi
      install -d /usr/share/postgresql-common/pgdg
      # The repository key is accepted only with PostgreSQL's own fingerprint, wherever it was fetched from.
      for url in https://www.postgresql.org/media/keys/ACCC4CF8.asc "$PG_MIRROR/repos/apt/ACCC4CF8.asc"; do
        curl -fsSL -m 30 "$url" -o "$key.new" 2>/dev/null || continue
        fpr="$(gpg --show-keys --with-colons "$key.new" 2>/dev/null | awk -F: '$1 == "fpr" { print $10; exit }')"
        [ "$fpr" = "$PGDG_KEY_FINGERPRINT" ] && break
      done
      [ "$fpr" = "$PGDG_KEY_FINGERPRINT" ] || { rm -f "$key.new"; die "PostgreSQL's repository key could not be fetched with its expected fingerprint"; }
      mv "$key.new" "$key"
      echo "deb [signed-by=$key] $base ${VERSION_CODENAME}-pgdg main" > /etc/apt/sources.list.d/pgdg.list
      apt-get update -qq
      pkg_install postgresql-17
    fi
    return 0
  fi
  PG_SERVICE=postgresql-17
  if [ ! -x /usr/pgsql-17/bin/postgres ]; then
    if ! rpm -q pgdg-redhat-repo >/dev/null 2>&1; then
      local base=https://download.postgresql.org/pub mirror=0
      if use_mirror "$base/repos/yum/"; then base="$PG_MIRROR"; mirror=1; note "download.postgresql.org is not reachable; PostgreSQL's packages come from $PG_MIRROR, signed by the same key"; fi
      dnf install -y -q "$base/repos/yum/reporpms/EL-${OS_MAJOR}-$(uname -m)/pgdg-redhat-repo-latest.noarch.rpm" >/dev/null
      # dnf checks every package against the keys this repository package installs.
      if [ "$mirror" = 1 ]; then sed -i "s|https://download.postgresql.org/pub/|$PG_MIRROR/|" /etc/yum.repos.d/pgdg-redhat-all.repo; fi
    fi
    # On 9 the system's own PostgreSQL module would hide the project's packages.
    dnf -y -q module disable postgresql >/dev/null 2>&1 || true
    pkg_install postgresql17-server postgresql17
  fi
  if [ ! -s /var/lib/pgsql/17/data/PG_VERSION ]; then
    # Same rules as Debian's clusters: the local postgres account by peer, network logins with a password.
    PGSETUP_INITDB_OPTIONS='--auth-local=peer --auth-host=scram-sha-256 --encoding=UTF8' /usr/pgsql-17/bin/postgresql-17-setup initdb >/dev/null
  fi
  # sudo searches only /usr/sbin and /usr/bin here; backups and the installer call these by name.
  local tool
  for tool in psql pg_dump pg_restore; do
    [ -e "/usr/bin/$tool" ] || ln -s "/usr/pgsql-17/bin/$tool" "/usr/bin/$tool"
  done
}

# The npm registry of the service user ($1 home, $2 user): a mirror when registry.npmjs.org is not reachable, kept for
# later updates. npm still checks every package against the integrity hash in package-lock.json.
platform_npm_registry() {
  local rc="$1/.npmrc"
  use_mirror https://registry.npmjs.org/ || return 0
  reachable "$NPM_MIRROR" || die "neither registry.npmjs.org nor the npm mirror $NPM_MIRROR is reachable from this server"
  note "registry.npmjs.org is not reachable; npm packages come from $NPM_MIRROR, each checked against package-lock.json"
  { [ ! -f "$rc" ] || grep -v '^registry=' "$rc" || true; printf 'registry=%s\n' "$NPM_MIRROR"; } > "$rc.new"
  chown "$2:$2" "$rc.new"; chmod 644 "$rc.new"; mv "$rc.new" "$rc"
}

platform_services() { systemctl enable --now "$PG_SERVICE" "$REDIS_SERVICE" >/dev/null; }

# Opens the SSH ports in use plus web ports; $@ = TCP ports.
platform_firewall() {
  local port
  if [ "$FIREWALL_TOOL" = ufw ]; then
    for port in "$@"; do ufw allow "$port/tcp" >/dev/null; done
    ufw allow OpenSSH >/dev/null 2>&1 || true
    ufw --force enable >/dev/null || note "the firewall could not be enabled; open only the ports: $*"
  else
    systemctl enable --now firewalld >/dev/null 2>&1 || { note "firewalld could not be started; open only the ports: $*"; return 0; }
    for port in "$@"; do firewall-cmd -q --permanent --add-port="$port/tcp"; done
    firewall-cmd -q --permanent --add-service=ssh >/dev/null 2>&1 || true
    firewall-cmd -q --reload
  fi
}

# The site files live in sites-available/sites-enabled on every system (mobocom-webctl writes them there).
# On AlmaLinux nginx reads only conf.d, so one include joins them; SELinux must let nginx reach the app.
platform_nginx() {
  install -d -m 755 /etc/nginx/sites-available /etc/nginx/sites-enabled
  if [ "$PLATFORM" = rhel ]; then
    printf '%s\n' '# MoboCom: sites managed in sites-available/sites-enabled (mobocom-webctl).' 'include /etc/nginx/sites-enabled/*;' > /etc/nginx/conf.d/mobocom-sites.conf
    chmod 644 /etc/nginx/conf.d/mobocom-sites.conf
    if command -v getenforce >/dev/null 2>&1 && [ "$(getenforce)" != Disabled ]; then
      setsebool -P httpd_can_network_connect 1 || die 'SELinux refused to let nginx reach the application (httpd_can_network_connect)'
    fi
  fi
  systemctl enable --now nginx >/dev/null
}

# A swap file for the build; XFS (AlmaLinux) needs a written file, fallocate is enough elsewhere.
platform_swap() {
  if fallocate -l 4G /swapfile 2>/dev/null && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile 2>/dev/null; then return 0; fi
  swapoff /swapfile 2>/dev/null || true; rm -f /swapfile
  dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
}

# sudo's search path on AlmaLinux leaves out /usr/local/bin, so "sudo mobocom" needs a name in /usr/bin too.
platform_command_link() {
  if [ "$PLATFORM" = rhel ] && [ ! -e /usr/bin/mobocom ]; then ln -s /usr/local/bin/mobocom /usr/bin/mobocom; fi
}
