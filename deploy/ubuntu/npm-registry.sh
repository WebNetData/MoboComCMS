#!/usr/bin/env bash
# Chooses the npm registry of the service user before every "npm ci" on a restricted network: the official registry when
# it answers, otherwise the first mirror below that does; the choice is kept in ~/.npmrc. A mirror cannot change what is
# installed: npm checks every package against the integrity hash in package-lock.json.
#
#   bash deploy/ubuntu/npm-registry.sh      (as the service user; NETWORK_MIRRORS=on always uses a mirror, off never)
set -euo pipefail
MIRRORS="${NPM_MIRRORS:-https://mirror-npm.runflare.com/ https://package-mirror.liara.ir/repository/npm/ https://repo.huaweicloud.com/repository/npm/}"
MODE="${NETWORK_MIRRORS:-auto}"
[ "$MODE" != off ] || exit 0
RC="$HOME/.npmrc"
# A registry answers when it serves a package's metadata; restricted networks drop connections, so two tries.
answers() { local n; for n in 1 2; do [ "$(curl -s -o /dev/null -m 15 -w '%{http_code}' "${1%/}/semver" 2>/dev/null)" = 200 ] && return 0; done; return 1; }
# A fresh server has no ~/.npmrc yet.
current="$( { [ ! -f "$RC" ] || sed -n 's/^registry=//p' "$RC"; } | tail -1)"
others() { [ ! -f "$RC" ] || grep -vE '^(registry|fetch-retries|fetch-retry-mintimeout|fetch-retry-maxtimeout)=' "$RC" || true; }

# A mirror chosen earlier stays while it answers.
if [ -n "$current" ] && [ "$current" != https://registry.npmjs.org/ ] && answers "$current"; then exit 0; fi
if [ "$MODE" != on ] && answers https://registry.npmjs.org/; then
  if [ -n "$current" ]; then others > "$RC.new"; mv "$RC.new" "$RC"; echo '[npm-registry] registry.npmjs.org answers again; the mirror setting is removed'; fi
  exit 0
fi
for mirror in $MIRRORS; do
  if answers "$mirror"; then
    # More patience for a network that drops connections: thousands of packages are fetched.
    { others; printf 'registry=%s\nfetch-retries=6\nfetch-retry-mintimeout=15000\nfetch-retry-maxtimeout=120000\n' "$mirror"; } > "$RC.new"
    chmod 644 "$RC.new"; mv "$RC.new" "$RC"
    echo "[npm-registry] registry.npmjs.org is not reachable; npm packages come from $mirror, each checked against package-lock.json"
    exit 0
  fi
done
echo "[npm-registry] neither registry.npmjs.org nor any npm mirror answers from this server: $MIRRORS" >&2
exit 1
