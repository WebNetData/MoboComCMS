#!/usr/bin/env bash
# Update a branch-based Ubuntu checkout. Keep the database backup before any code change.
# Run as the mobocom user from /opt/mobocom/app: bash deploy/ubuntu/update.sh (or, as root: mobocom update)
# UPDATE_ROLLBACK_TO=<commit> goes back to an earlier application commit the same safe way (mobocom rollback,
# mobocom downgrade); UPDATE_TO=<commit> moves to one exact newer commit, such as a release tag (mobocom update VERSION).
set -euo pipefail
# Parse the complete operation before checkout can replace this script on disk.
main() {
cd "$(dirname "$0")/../.."

ENV_FILE="${UPDATE_ENV_FILE:-/etc/mobocom/mobocom.env}"
[ -f "$ENV_FILE" ] || { echo '[update] environment file is missing' >&2; exit 1; }
set -a; . "$ENV_FILE"; set +a

BRANCH="${BRANCH:-main}"
NPM="${UPDATE_NPM:-npm}"
BUILD="${UPDATE_BUILD:-$NPM run build:postgres}"
BACKUP="${UPDATE_BACKUP:-bash deploy/ubuntu/backup.sh}"
RESTART="${UPDATE_RESTART:-sudo -n systemctl restart mobocom}"
HEALTH="${UPDATE_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"
# A release with many migrations applies them while the service starts: allow it about six minutes.
TRIES="${UPDATE_HEALTH_TRIES:-120}"
MIN_FREE_MB="${UPDATE_MIN_FREE_MB:-4096}"
ROLLBACK_TO="${UPDATE_ROLLBACK_TO:-}"
TO_COMMIT="${UPDATE_TO:-}"

git check-ref-format --branch "$BRANCH" >/dev/null || { echo '[update] invalid branch' >&2; exit 2; }
[[ "$TRIES" =~ ^[1-9][0-9]{0,2}$ ]] || { echo '[update] invalid health attempt count' >&2; exit 2; }
[[ "$MIN_FREE_MB" =~ ^[0-9]{1,7}$ ]] || { echo '[update] invalid free space limit' >&2; exit 2; }
[ -z "$ROLLBACK_TO" ] || [[ "$ROLLBACK_TO" =~ ^[0-9a-f]{7,40}$ ]] || { echo '[update] invalid commit' >&2; exit 2; }
[ -z "$TO_COMMIT" ] || [[ "$TO_COMMIT" =~ ^[0-9a-f]{7,40}$ ]] || { echo '[update] invalid commit' >&2; exit 2; }
[ -z "$ROLLBACK_TO" ] || [ -z "$TO_COMMIT" ] || { echo '[update] choose one target commit' >&2; exit 2; }
PREV="$(git rev-parse --verify HEAD)"
PREV_BRANCH="$(git symbolic-ref -q --short HEAD || true)"
clean() { [ -z "$(git status --porcelain --untracked-files=normal)" ]; }
# Files the build itself rewrites: Next.js (next-env.d.ts, tsconfig.json) and scripts/generate-extensions.mjs. They are
# never owner work, but left changed they would block the next update and the rollback. Keep in step with self-update.sh.
BUILD_WRITTEN=(next-env.d.ts tsconfig.json src/extensions/generated src/themes/generated src/themes/generated.css)
STATE_DIR="${UPDATE_STATE_DIR:-storage/update}"
# Keeps a copy of what the build changed in the update folder, then restores the committed files.
reset_build_files() {
  local changed
  changed="$(git diff --name-only -- "${BUILD_WRITTEN[@]}")"
  [ -n "$changed" ] || return 0
  mkdir -p "$STATE_DIR"
  git diff -- "${BUILD_WRITTEN[@]}" > "$(mktemp --suffix=.patch "$STATE_DIR/build-files-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
  # shellcheck disable=SC2086 # one path per line, none with spaces
  git checkout -- $changed && echo "[update] restored files the build had rewritten: $(echo $changed)"
}
reset_build_files
if ! clean; then
  echo '[update] local changes must be resolved before updating' >&2
  exit 2
fi

# Share the lock with the tag-based updater so the two entry points cannot race.
LOCK="$STATE_DIR/lock"
mkdir -p "$(dirname "$LOCK")"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo '[update] another update is running' >&2
  exit 3
fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT

# Problems that are only found half way through an update are checked before anything changes.
FREE_MB="$(df -Pm . | awk 'NR==2 {print $4}')"
if [ "$FREE_MB" -lt "$MIN_FREE_MB" ]; then
  echo "[update] only ${FREE_MB} MB free; at least ${MIN_FREE_MB} MB is needed to build the new version" >&2
  exit 2
fi
if [ -z "${UPDATE_RESTART:-}" ] && ! sudo -n -l /usr/bin/systemctl restart mobocom >/dev/null 2>&1; then
  echo '[update] this user may not restart the service; run once: sudo bash deploy/ubuntu/updater-install.sh' >&2
  exit 2
fi

healthy() {
  local i
  for ((i = 0; i < TRIES; i++)); do
    if curl -fsS -m 5 "$HEALTH" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

build_and_start() {
  # On a restricted network: an npm mirror that answers, and this version's Prisma engines from GitHub (else nothing).
  if [ -f deploy/ubuntu/npm-registry.sh ]; then bash deploy/ubuntu/npm-registry.sh || return 1; fi
  if [ -f deploy/ubuntu/prisma-engines.sh ]; then bash deploy/ubuntu/prisma-engines.sh . || return 1; fi
  # The environment file sets NODE_ENV=production, which would leave out the packages the build needs.
  "$NPM" ci --include=dev --no-audit --no-fund || return 1
  NODE_OPTIONS="--max-old-space-size=${BUILD_MEMORY_MB:-4096}" bash -c "$BUILD" || return 1
  reset_build_files
  bash -c "$RESTART" || return 1
  healthy
}

rollback() {
  echo "[update] failed; restoring application commit $PREV" >&2
  reset_build_files
  clean || { echo '[update] local work appeared during the update; preserved for operator recovery' >&2; return 1; }
  [ "$(git rev-parse HEAD)" = "${CHECKED_SHA:-}" ] || { echo '[update] local commit appeared during update; preserved' >&2; return 1; }
  if [ "$PREV_BRANCH" = "$BRANCH" ]; then
    git reset --keep --quiet "$PREV" || return 1
  else
    if [ -n "$PREV_BRANCH" ]; then
      [ "$(git rev-parse "$PREV_BRANCH")" = "$PREV" ] || return 1
      git checkout --quiet "$PREV_BRANCH" || return 1
    else
      git checkout --quiet --detach "$PREV" || return 1
    fi
  fi
  build_and_start
}

# Remembered for "mobocom rollback" (storage/update is kept across updates and is not part of the code).
remember() { printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PREV" "$(git rev-parse HEAD)" >> "$(dirname "$LOCK")/history.log"; }

if [ -n "$ROLLBACK_TO$TO_COMMIT" ]; then
  TARGET="${ROLLBACK_TO:-$TO_COMMIT}"
  git rev-parse --verify --quiet "$TARGET^{commit}" >/dev/null || { echo '[update] this commit is not in the repository' >&2; exit 2; }
  if [ -n "$ROLLBACK_TO" ]; then echo '[update] backing up before going back'; else echo '[update] backing up before code replacement'; fi
  bash -c "$BACKUP"
  clean || { echo '[update] local changes appeared during backup' >&2; exit 2; }
  if [ -n "$ROLLBACK_TO" ]; then echo "[update] going back to $TARGET"; else echo "[update] switching to $TARGET"; fi
  git checkout --quiet --detach "$TARGET"
  CHECKED_SHA="$(git rev-parse HEAD)"
  if build_and_start; then
    remember
    if [ -n "$ROLLBACK_TO" ]; then echo '[update] healthy on the earlier version; database changes were not reversed'; else echo '[update] healthy'; fi
    exit 0
  fi
  rollback || echo '[update] application rollback failed' >&2
  exit 1
fi

echo "[update] fetching $BRANCH"
if [ -f deploy/ubuntu/git-fetch.sh ]; then bash deploy/ubuntu/git-fetch.sh origin "$BRANCH"; else git fetch --quiet origin "$BRANCH"; fi
TARGET_SHA="$(git rev-parse --verify "refs/remotes/origin/$BRANCH^{commit}")"
if ! git merge-base --is-ancestor "$PREV" "$TARGET_SHA"; then
  echo '[update] local commit history diverges from the target branch' >&2
  exit 2
fi
if git show-ref --verify --quiet "refs/heads/$BRANCH" && ! git merge-base --is-ancestor "refs/heads/$BRANCH" "$TARGET_SHA"; then
  echo '[update] local target branch diverges from the verified commit' >&2; exit 2
fi
echo '[update] backing up before code replacement'
bash -c "$BACKUP"
clean || { echo '[update] local changes appeared during backup' >&2; exit 2; }

echo "[update] switching to origin/$BRANCH"
# A safe fast-forward to the verified immutable commit; never discard owner edits.
git checkout --quiet "$BRANCH"
if ! git merge --ff-only --quiet "$TARGET_SHA"; then
  rollback || echo '[update] application rollback failed' >&2
  exit 1
fi
CHECKED_SHA="$TARGET_SHA"

echo '[update] installing, building and restarting'
if build_and_start; then
  remember
  echo '[update] healthy'
  exit 0
fi
if rollback; then
  echo '[update] application rolled back; database changes were not reversed' >&2
else
  echo '[update] application rollback failed; inspect the service' >&2
fi
exit 1
}
main "$@"
