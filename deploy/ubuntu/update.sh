#!/usr/bin/env bash
# Update a branch-based Ubuntu checkout. Keep the database backup before any code change.
# Run as the mobocom user from /opt/mobocom/app: bash deploy/ubuntu/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE="${UPDATE_ENV_FILE:-/etc/mobocom/mobocom.env}"
[ -f "$ENV_FILE" ] || { echo '[update] environment file is missing' >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

BRANCH="${BRANCH:-main}"
NPM="${UPDATE_NPM:-npm}"
BUILD="${UPDATE_BUILD:-$NPM run build:postgres}"
BACKUP="${UPDATE_BACKUP:-bash deploy/ubuntu/backup.sh}"
RESTART="${UPDATE_RESTART:-sudo systemctl restart mobocom}"
HEALTH="${UPDATE_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"
TRIES="${UPDATE_HEALTH_TRIES:-40}"

git check-ref-format --branch "$BRANCH" >/dev/null || { echo '[update] invalid branch' >&2; exit 2; }
[[ "$TRIES" =~ ^[1-9][0-9]{0,2}$ ]] || { echo '[update] invalid health attempt count' >&2; exit 2; }
PREV="$(git rev-parse --verify HEAD)"
PREV_BRANCH="$(git symbolic-ref -q --short HEAD || true)"
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo '[update] tracked local changes must be resolved before updating' >&2
  exit 2
fi

# Share the lock with the tag-based updater so the two entry points cannot race.
LOCK="${UPDATE_STATE_DIR:-storage/update}/lock"
mkdir -p "$(dirname "$LOCK")"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo '[update] another update is running' >&2
  exit 3
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

healthy() {
  local i
  for ((i = 0; i < TRIES; i++)); do
    if curl -fsS -m 5 "$HEALTH" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

build_and_start() {
  "$NPM" ci --no-audit --no-fund || return 1
  NODE_OPTIONS="--max-old-space-size=${BUILD_MEMORY_MB:-3072}" bash -c "$BUILD" || return 1
  bash -c "$RESTART" || return 1
  healthy
}

rollback() {
  echo "[update] failed; restoring application commit $PREV" >&2
  if [ "$PREV_BRANCH" = "$BRANCH" ]; then
    git reset --hard --quiet "$PREV" || return 1
  else
    git reset --hard --quiet HEAD || return 1
    if [ -n "$PREV_BRANCH" ]; then
      git checkout --quiet "$PREV_BRANCH" || return 1
    else
      git checkout --quiet --detach "$PREV" || return 1
    fi
  fi
  build_and_start
}

echo "[update] fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
git rev-parse --verify "refs/remotes/origin/$BRANCH^{commit}" >/dev/null
if ! git merge-base --is-ancestor "$PREV" "origin/$BRANCH"; then
  echo '[update] local commit history diverges from the target branch' >&2
  exit 2
fi
echo '[update] backing up before code replacement'
bash -c "$BACKUP"

echo "[update] switching to origin/$BRANCH"
git checkout --quiet "$BRANCH"
if ! git reset --hard --quiet "origin/$BRANCH"; then
  rollback || echo '[update] application rollback failed' >&2
  exit 1
fi

echo '[update] installing, building and restarting'
if build_and_start; then
  echo '[update] healthy'
  exit 0
fi
if rollback; then
  echo '[update] application rolled back; database changes were not reversed' >&2
else
  echo '[update] application rollback failed; inspect the service' >&2
fi
exit 1
