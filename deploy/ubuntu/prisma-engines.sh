#!/usr/bin/env bash
# Puts Prisma's engines into the service user's Prisma cache when this server cannot reach binaries.prisma.sh, from the
# project's prisma-engines branch on GitHub, after checking them against the SHA-256 values in prisma-engines.txt.
# Prisma then copies them from its cache during "npm ci" and downloads nothing.
#
#   bash deploy/ubuntu/prisma-engines.sh /opt/mobocom/app      (as the service user, before npm ci)
#
# It does nothing when the engines are already cached or Prisma's own server answers.
# PRISMA_ENGINES_FROM_GIT=1 takes them from GitHub without asking binaries.prisma.sh first.
set -euo pipefail
die() { echo "[prisma-engines] $*" >&2; exit 1; }
cd "${1:-.}"
# The pins beside this code; PRISMA_ENGINES_PINS names the installer's copy for code that predates them.
PINS="${PRISMA_ENGINES_PINS:-deploy/ubuntu/prisma-engines.txt}"
[ -f package-lock.json ] && [ -f "$PINS" ] || exit 0
# The engine version this code needs, from the lockfile; code without Prisma needs nothing.
HASH="$(node -e 'const v=(require("./package-lock.json").packages||{})["node_modules/@prisma/engines-version"]?.version||"";const h=v.split(".").pop();if(!/^[0-9a-f]{40}$/.test(h))process.exit(1);process.stdout.write(h)' 2>/dev/null)" || exit 0
. /etc/os-release
case "${ID:-}" in almalinux|rhel|rocky|centos|fedora) PLATFORM=rhel-openssl-3.0.x ;; *) PLATFORM=debian-openssl-3.0.x ;; esac
CACHE="${XDG_CACHE_HOME:-$HOME/.cache}/prisma/master/$HASH/$PLATFORM"
pin() { awk -v h="$HASH" -v p="$PLATFORM" -v f="$1" -v c="$2" '$1 == h && $2 == p && $3 == f { print $c }' "$PINS"; }
sum() { sha256sum "$1" | cut -c1-64; }
cached() {
  local f
  for f in libquery-engine schema-engine; do
    [ -s "$CACHE/$f" ] && [ -s "$CACHE/$f.sha256" ] && [ -s "$CACHE/$f.gz.sha256" ] || return 1
    [ -n "$(pin "$f" 4)" ] && [ "$(sum "$CACHE/$f")" = "$(pin "$f" 4)" ] || return 1
  done
}
cached && exit 0
if [ "${PRISMA_ENGINES_FROM_GIT:-0}" != 1 ] && [ "$(curl -s -o /dev/null -m 10 -w '%{http_code}' https://binaries.prisma.sh/ 2>/dev/null)" != 000 ]; then exit 0; fi
[ -n "$(pin libquery-engine 4)" ] && [ -n "$(pin schema-engine 4)" ] || die "Prisma engine $HASH for $PLATFORM is not in $PINS; this server cannot download it from binaries.prisma.sh"

# The site's own repository, or the project's; PRISMA_ENGINES_REPO names another copy of the branch (a fork, a test).
REPO="${PRISMA_ENGINES_REPO:-$(git remote get-url origin 2>/dev/null || true)}"
if [ -z "${PRISMA_ENGINES_REPO:-}" ]; then
  case "$REPO" in https://github.com/*|git@github.com:*) ;; *) REPO=https://github.com/WebNetData/MoboComCMS.git ;; esac
fi
WORK="$(mktemp -d)"
trap 'rm -rf -- "$WORK"' EXIT
echo "[prisma-engines] binaries.prisma.sh is not reachable; taking Prisma's engines from the prisma-engines branch on GitHub"
for try in 1 2 3; do
  GIT_TERMINAL_PROMPT=0 git -c core.hooksPath=/dev/null clone -q --depth 1 --single-branch --branch prisma-engines --no-checkout -- "$REPO" "$WORK/repo" && break
  rm -rf -- "$WORK/repo"
  [ "$try" = 3 ] && die 'could not fetch the prisma-engines branch from GitHub'
  echo "[prisma-engines] fetching failed; trying again ($try/3)"; sleep 5
done
for f in libquery-engine schema-engine; do
  git -C "$WORK/repo" show "HEAD:$HASH/$f.gz" > "$WORK/$f.gz" || die "$HASH/$f.gz is not on the prisma-engines branch"
  gunzip -c "$WORK/$f.gz" > "$WORK/$f"
  [ "$(sum "$WORK/$f")" = "$(pin "$f" 4)" ] || die "$f does not match its pinned SHA-256; nothing was installed"
done
# Verified: the cache Prisma reads, with the checksum files it expects beside each engine.
mkdir -p "$CACHE"
for f in libquery-engine schema-engine; do
  install -m 755 "$WORK/$f" "$CACHE/$f"
  printf '%s' "$(pin "$f" 4)" > "$CACHE/$f.sha256"
  printf '%s' "$(pin "$f" 5)" > "$CACHE/$f.gz.sha256"
done
echo "[prisma-engines] Prisma engines ${HASH:0:12} ($PLATFORM) are in place"
