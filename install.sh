#!/usr/bin/env bash
# MoboComCMS on a server with one command: Ubuntu 22.04/24.04/26.04, Debian 12/13 or AlmaLinux 9/10.
#
#   curl -fsSL https://raw.githubusercontent.com/WebNetData/MoboComCMS/main/install.sh | sudo bash
#
# The same command with a word after "bash -s --" works on a server where the site is already installed:
#   ... | sudo bash -s -- update [VERSION]    newer code or one release; backup first, back by itself on failure
#   ... | sudo bash -s -- downgrade VERSION   an earlier release; backup first, the database is kept
#   ... | sudo bash -s -- versions            the releases and which one is installed
#   ... | sudo bash -s -- status
# Installation options are those of deploy/ubuntu/install.sh, for example: ... | sudo bash -s -- --no-firewall
# Afterwards the same actions are a short command: sudo mobocom update, sudo mobocom downgrade VERSION, ...
#
# It fetches the code over HTTPS from GitHub into a private root folder and runs deploy/ubuntu/install.sh from
# there. On an installed server it first refreshes the root-owned "mobocom" command from that code when newer.
set -euo pipefail

# Everything is inside main, so a download cut off half way runs nothing.
main() {
  local repo=https://github.com/WebNetData/MoboComCMS.git ref="${MOBOCOM_REF:-main}" action=install work bundle arg
  die() { printf '\n[mobocom] %s\n' "$*" >&2; exit 1; }
  [ "$(id -u)" -eq 0 ] || die 'run it as root: curl -fsSL .../install.sh | sudo bash'
  [[ "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$ ]] && [[ "$ref" != *..* ]] || die 'invalid MOBOCOM_REF'
  case "${1:-}" in
    update|downgrade|versions|status) action="$1"; shift ;;
    install) shift ;;
    help|-h|--help) sed -n '2,15p' "${BASH_SOURCE[0]}" 2>/dev/null | sed 's/^# \{0,1\}//' || true; return 0 ;;
  esac
  [ -r /etc/os-release ] || die 'unknown system: /etc/os-release is missing'
  # shellcheck disable=SC1091
  . /etc/os-release
  # Only git is needed to fetch the code; install.sh checks the system before it changes anything else.
  if ! command -v git >/dev/null 2>&1; then
    case "${ID:-}" in
      ubuntu|debian) { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq git ca-certificates; } </dev/null >/dev/null ;;
      almalinux) dnf install -y -q git ca-certificates </dev/null >/dev/null ;;
      *) die 'this installer supports Ubuntu 22.04/24.04/26.04, Debian 12/13 and AlmaLinux 9/10' ;;
    esac
  fi

  work="$(mktemp -d /root/mobocom-get.XXXXXXXX)"
  trap 'rm -rf -- "$work"' EXIT
  printf '==> Fetching MoboComCMS (%s)\n' "$ref"
  GIT_TERMINAL_PROMPT=0 git -c core.hooksPath=/dev/null clone -q --depth 1 --branch "$ref" -- "$repo" "$work/src" </dev/null \
    || die "could not fetch $repo ($ref); check that this server can reach github.com"
  bundle="$work/src/deploy/ubuntu"

  # Questions (a private repository's key, a legacy e-mail) go to the keyboard, not to the downloaded script.
  local input=/dev/null
  if [ -t 0 ]; then input=/dev/stdin; elif { : </dev/tty; } 2>/dev/null; then input=/dev/tty; fi

  if [ "$action" = install ]; then
    local args=("$@") given=0
    for arg in "$@"; do [ "$arg" != --branch ] || given=1; done
    [ "$ref" = main ] || [ "$given" = 1 ] || args+=(--branch "$ref")
    bash "$bundle/install.sh" "${args[@]}" <"$input"
    return
  fi

  [ -f /opt/mobocom/app/package.json ] || die 'the site is not installed on this server yet; run the command without a word after it'
  local helper=/usr/local/bin/mobocom
  if [ ! -e "$helper" ] || [ "$(helper_version "$bundle/mobocom")" -gt "$(helper_version "$helper")" ]; then
    install -m 755 -o root -g root "$bundle/mobocom" "$helper"
    printf '==> The mobocom command was refreshed\n'
  fi
  # sudo's search path on AlmaLinux leaves out /usr/local/bin.
  if [ "${ID:-}" = almalinux ] && [ ! -e /usr/bin/mobocom ]; then ln -s "$helper" /usr/bin/mobocom; fi
  "$helper" "$action" "$@" <"$input"
}
helper_version() { local v; v="$(sed -n 's/^HELPER_VERSION=\([0-9]\{1,4\}\)$/\1/p' "$1" 2>/dev/null | head -1)"; printf '%s\n' "${v:-1}"; }

main "$@"
