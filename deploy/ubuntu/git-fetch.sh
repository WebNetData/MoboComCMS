#!/usr/bin/env bash
# Fetches from the code repository for the updaters (self-update.sh, update.sh, the mobocom command) without hanging.
#
#   bash deploy/ubuntu/git-fetch.sh <git fetch arguments>      e.g. --tags origin
#
# A filtered network can stall a fetch forever or cut it half way (curl 92, "early EOF"). Here a fetch stops when
# fewer than 1 KB/s arrive for UPDATE_FETCH_STALL seconds (default 60) or after UPDATE_FETCH_TIMEOUT seconds in all
# (default 900), and one failed try is repeated over HTTP/1.1. UPDATE_GIT_PROXY (set in /etc/mobocom/mobocom.env,
# e.g. socks5h://127.0.0.1:10808) sends only this fetch through a proxy the operator runs. A local origin, such as a
# Git bundle, needs no network. Nothing here changes the checkout: only refs and objects are fetched.
set -uo pipefail

STALL="${UPDATE_FETCH_STALL:-60}"
LIMIT="${UPDATE_FETCH_TIMEOUT:-900}"
PROXY="${UPDATE_GIT_PROXY:-}"
# The Server Panel writes this file while the "updates" purpose has an Xray profile (the site's local proxy).
PANEL_PROXY="${UPDATE_STATE_DIR:-storage/update}/git-proxy"
if [ -z "$PROXY" ] && [ -f "$PANEL_PROXY" ]; then PROXY="$(head -c 200 "$PANEL_PROXY" | head -1 | tr -d '\r\n ')"; fi
[[ "$STALL" =~ ^[1-9][0-9]{0,3}$ ]] || { echo '[fetch] invalid UPDATE_FETCH_STALL' >&2; exit 2; }
[[ "$LIMIT" =~ ^[1-9][0-9]{0,4}$ ]] || { echo '[fetch] invalid UPDATE_FETCH_TIMEOUT' >&2; exit 2; }
[ -z "$PROXY" ] || [[ "$PROXY" =~ ^(socks5h?|socks4a?|https?)://[A-Za-z0-9._~%:@-]+(:[0-9]{1,5})?/?$ ]] || { echo '[fetch] invalid UPDATE_GIT_PROXY' >&2; exit 2; }
[ "$#" -gt 0 ] || { echo 'usage: git-fetch.sh <git fetch arguments>' >&2; exit 2; }

options=(-c "http.lowSpeedLimit=1024" -c "http.lowSpeedTime=$STALL")
# The proxy address may hold a password, so it is never printed.
[ -z "$PROXY" ] || options+=(-c "http.proxy=$PROXY")
attempt() { GIT_TERMINAL_PROMPT=0 timeout --kill-after=10 "$LIMIT" git "${options[@]}" "$@" fetch --quiet "${ARGS[@]}"; }
ARGS=("$@")

echo "[fetch] fetching from the code repository$([ -z "$PROXY" ] || echo ' through UPDATE_GIT_PROXY') (stops after ${STALL}s without progress)" >&2
attempt && exit 0
code=$?
echo "[fetch] the fetch stopped (code $code); trying once more over HTTP/1.1" >&2
attempt -c http.version=HTTP/1.1 && exit 0
code=$?
echo "[fetch] the code repository could not be reached (code $code). On a filtered network set UPDATE_GIT_PROXY in /etc/mobocom/mobocom.env, or update from a Git bundle (docs/UPGRADE-FA.md)." >&2
exit 1
