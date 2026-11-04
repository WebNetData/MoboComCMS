#!/usr/bin/env bash
# Installs Xray-core for the site's social-network proxy, from reviewed root-owned assets (install.sh runs it):
#   • the xray binary of the pinned release: from Xray's GitHub release, or where GitHub release files are blocked, the
#     same archive from the project's xray-core branch; either way only after its pinned SHA-256 matches;
#   • a system user of its own and a hardened unit that stays off until the Server Panel applies an outbound;
#   • mobocom-xrayctl and its configuration builder, and the one sudo rule the site needs to call them.
# Safe to run again: an installed binary of the same release is kept; a running proxy restarts only on a new binary.
set -euo pipefail
ASSETS="$(cd "$(dirname "$0")" && pwd)"
REPO="${XRAY_REPO:-https://github.com/WebNetData/MoboComCMS.git}"
LIB=/usr/local/lib/mobocom/xray
note() { printf '    %s\n' "$*"; }
die() { printf '\n[xray] %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die 'run as root'

case "$(uname -m)" in
  x86_64|amd64) FILE=Xray-linux-64.zip ;;
  aarch64|arm64) FILE=Xray-linux-arm64-v8a.zip ;;
  *) note "Xray-core is not offered for $(uname -m); the social-network proxy stays unavailable"; exit 0 ;;
esac
VERSION="$(awk '!/^#/ && NF { print $1; exit }' "$ASSETS/xray-core.txt")"
SUM="$(awk -v f="$FILE" '!/^#/ && $2 == f { print $3; exit }' "$ASSETS/xray-core.txt")"
[[ "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ "$SUM" =~ ^[0-9a-f]{64}$ ]] || die 'xray-core.txt is not valid'

id mobocom-xray >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin mobocom-xray

NEW_BINARY=0
if [ ! -x "$LIB/xray" ] || [ "$(cat "$LIB/RELEASE" 2>/dev/null)" != "$VERSION $SUM" ]; then
  WORK="$(mktemp -d)"
  trap 'rm -rf -- "$WORK"' EXIT
  sum() { sha256sum "$1" | cut -c1-64; }
  got=0
  for _ in 1 2; do
    if curl -fsSL -m 180 -o "$WORK/xray.zip" "https://github.com/XTLS/Xray-core/releases/download/$VERSION/$FILE" 2>/dev/null && [ "$(sum "$WORK/xray.zip")" = "$SUM" ]; then got=1; break; fi
  done
  if [ "$got" = 0 ]; then
    note "GitHub release files are not reachable; taking Xray-core $VERSION from the project's xray-core branch"
    for try in 1 2 3; do
      GIT_TERMINAL_PROMPT=0 git -c core.hooksPath=/dev/null clone -q --depth 1 --single-branch --branch xray-core --no-checkout -- "$REPO" "$WORK/repo" </dev/null && break
      rm -rf -- "$WORK/repo"
      [ "$try" = 3 ] && die 'could not fetch Xray-core from GitHub'
      note "fetching failed; trying again ($try/3)"; sleep 5
    done
    git -C "$WORK/repo" show "HEAD:$VERSION/$FILE" > "$WORK/xray.zip" || die "$VERSION/$FILE is not on the xray-core branch"
  fi
  [ "$(sum "$WORK/xray.zip")" = "$SUM" ] || die "$FILE does not match its pinned SHA-256; nothing was installed"
  # Only the binary is taken from the archive, streamed, with a size limit.
  python3 - "$WORK/xray.zip" "$WORK/xray" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    entry = archive.getinfo('xray')
    if entry.file_size > 200 * 1024 * 1024:
        raise SystemExit('xray is unexpectedly large')
    with archive.open(entry) as source, open(sys.argv[2], 'wb') as target:
        while True:
            chunk = source.read(1 << 20)
            if not chunk:
                break
            target.write(chunk)
PY
  install -d -m 755 -o root -g root "$LIB"
  install -m 755 -o root -g root "$WORK/xray" "$LIB/xray.new"
  mv -f -- "$LIB/xray.new" "$LIB/xray"
  printf '%s %s\n' "$VERSION" "$SUM" > "$LIB/RELEASE"
  NEW_BINARY=1
fi

install -d -m 750 -o root -g mobocom-xray /etc/mobocom/xray
install -d -m 755 -o root -g root /usr/local/libexec/mobocom
install -m 755 -o root -g root "$ASSETS/xray-config.cjs" /usr/local/libexec/mobocom/xray-config.cjs
install -m 755 -o root -g root "$ASSETS/mobocom-xrayctl" /usr/local/sbin/mobocom-xrayctl
install -m 644 -o root -g root "$ASSETS/mobocom-xray.service" /etc/systemd/system/mobocom-xray.service
install -d -m 750 /etc/sudoers.d
cat > /etc/sudoers.d/mobocom-xray <<'SUDO'
# The site may only run the social-network proxy helper, which validates every input itself.
mobocom ALL=(root) NOPASSWD: /usr/local/sbin/mobocom-xrayctl
SUDO
chmod 440 /etc/sudoers.d/mobocom-xray
visudo -cf /etc/sudoers.d/mobocom-xray >/dev/null || { rm -f /etc/sudoers.d/mobocom-xray; die 'sudo rule for the proxy helper was refused'; }
systemctl daemon-reload
if [ "$NEW_BINARY" = 1 ] && [ -s /etc/mobocom/xray/config.json ]; then systemctl restart mobocom-xray || note 'the proxy did not restart; see: journalctl -u mobocom-xray'; fi
note "Xray-core $VERSION is ready for the social-network proxy (Server Panel → social-network proxy)"
