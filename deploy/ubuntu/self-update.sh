#!/usr/bin/env bash
if [ -f /run/mobocom-engineering/active.json ]; then
  node /usr/local/lib/mobocom-engineering/native-update-check.cjs || exit 3
fi
# Updates this checkout to a release tag, rebuilds, restarts, and rolls back by itself if the new version does not start.
#
#   bash deploy/ubuntu/self-update.sh v1.6.0
#
# Started by the admin panel through /usr/local/sbin/mobocom-update (a transient systemd unit, so it survives the
# restart of the site). Progress is written to storage/update/state.json and update.log, which the panel shows.
# Database migrations are applied by deploy/docker-start.sh when the service starts.
#
# The build gets BUILD_MEMORY_MB (default 4096) of Node heap, like the installer and update.sh. The fetch goes through
# deploy/ubuntu/git-fetch.sh (time limits, HTTP/1.1 retry, optional UPDATE_GIT_PROXY).
# Test overrides: UPDATE_NPM, UPDATE_BUILD, UPDATE_BACKUP, UPDATE_RESTART, UPDATE_HEALTH_URL, UPDATE_HEALTH_TRIES, UPDATE_STATE_DIR, UPDATE_ENV_FILE.
set -uo pipefail
main() {
cd "$(dirname "$0")/../.."
. deploy/ubuntu/git-build.sh

REF="${1:-}"
[[ "$REF" =~ ^v?[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}([-+][0-9A-Za-z.-]{1,40})?$ ]] || { echo "invalid version: $REF" >&2; exit 2; }

DIR="${UPDATE_STATE_DIR:-storage/update}"
mkdir -p "$DIR"
DIR="$(cd "$DIR" && pwd -P)"
LOG="$DIR/update.log"
STATE="$DIR/state.json"
NPM="${UPDATE_NPM:-npm}"
BUILD="${UPDATE_BUILD:-$NPM run build:postgres}"
BACKUP="${UPDATE_BACKUP:-bash deploy/ubuntu/backup.sh}"
RESTART="${UPDATE_RESTART:-sudo -n systemctl restart mobocom}"
HEALTH="${UPDATE_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}"
TRIES="${UPDATE_HEALTH_TRIES:-120}"
ENV_FILE="${UPDATE_ENV_FILE:-/etc/mobocom/mobocom.env}"
PREV=""
# Files the build itself rewrites: Next.js (next-env.d.ts, tsconfig.json) and scripts/generate-extensions.mjs. They are
# never owner work, but left changed they would block the next update and the rollback. Keep in step with update.sh.
BUILD_WRITTEN=(next-env.d.ts tsconfig.json src/extensions/generated src/themes/generated src/themes/generated.css)

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
say() { echo "[$(now)] $*" >> "$LOG"; }
state() { printf '{"status":"%s","step":"%s","target":"%s","previous":"%s","at":"%s"}\n' "$1" "$2" "$REF" "$PREV" "$(now)" > "$STATE"; }

# A lock is never stolen based on age; an operator verifies abandoned work first.
LOCK="$DIR/lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "another update is running; verify the lock owner before recovering an abandoned run" >&2; exit 3
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

: > "$LOG"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

step() { state running "$1"; say "$1"; }
# Keeps a copy of what the build changed in the update folder, then restores the committed files.
reset_build_files() {
  local changed
  changed="$(git diff --name-only -- "${BUILD_WRITTEN[@]}")"
  [ -n "$changed" ] || return 0
  git diff -- "${BUILD_WRITTEN[@]}" > "$(mktemp --suffix=.patch "$DIR/build-files-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
  # shellcheck disable=SC2086 # one path per line, none with spaces
  git checkout -- $changed && say "restored files the build had rewritten: $(echo $changed)"
}
run() { say "\$ $*"; "$@" >> "$LOG" 2>&1; }
runsh() { say "\$ $1"; bash -c "$1" >> "$LOG" 2>&1; }

healthy() {
  local i
  for ((i = 0; i < TRIES; i++)); do
    if curl -fsS -m 5 "$HEALTH" >/dev/null 2>&1; then return 0; fi
    sleep 3
  done
  return 1
}

build_and_start() {
  run git_build_prepare || return 1
  (
  cd "$GIT_BUILD_STAGE/source" || return 1
  # The environment file sets NODE_ENV=production, which would leave out the packages the build needs.
  # On a restricted network: an npm mirror that answers, and this version's Prisma engines from GitHub (else nothing).
  if [ -f deploy/ubuntu/npm-registry.sh ]; then run bash deploy/ubuntu/npm-registry.sh || return 1; fi
  if [ -f deploy/ubuntu/prisma-engines.sh ]; then run bash deploy/ubuntu/prisma-engines.sh . || return 1; fi
  run "$NPM" ci --include=dev --no-audit --no-fund || return 1
  step "ساخت نسخهٔ تازه"
  # Next.js needs more than Node's default heap; without it a 2 GB limit ends the build half way.
  say "$ $BUILD (heap ${BUILD_MEMORY} MB)"
  NODE_OPTIONS="--max-old-space-size=$BUILD_MEMORY" bash -c "$BUILD" >> "$LOG" 2>&1 || return 1
  ) || return 1
  run git_build_adopt || return 1
  reset_build_files
  step "راه‌اندازی مجدد سرویس"
  runsh "$RESTART" || return 1
  step "بررسی سلامت سرویس"
  healthy
}

BUILD_MEMORY="${BUILD_MEMORY_MB:-4096}"
[[ "$BUILD_MEMORY" =~ ^[1-9][0-9]{2,5}$ ]] || { state failed "BUILD_MEMORY_MB نامعتبر است"; exit 2; }

step "دریافت نسخه‌ها"
PREV="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$PREV" ] || { state failed "مخزن git پیدا نشد"; exit 1; }
reset_build_files
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then state failed "تغییر محلی وجود دارد؛ ابتدا آن را حفظ و بررسی کنید"; exit 2; fi
run git_build_preflight || { state failed "بیلد فعلی یا مسیر ساخت نیازمند بازیابی اپراتور است"; exit 2; }
if [ -f deploy/ubuntu/git-fetch.sh ]; then
  run bash deploy/ubuntu/git-fetch.sh --tags origin || { state failed "دریافت از مخزن ممکن نشد؛ شبکه یا UPDATE_GIT_PROXY را بررسی کنید"; exit 1; }
else
  run git fetch --quiet --tags origin || { state failed "دریافت از مخزن ممکن نشد"; exit 1; }
fi
git rev-parse -q --verify "refs/tags/${REF}^{commit}" >/dev/null || { say "tag $REF not found"; state failed "این نسخه در مخزن نیست"; exit 1; }
TARGET_SHA="$(git rev-parse "refs/tags/${REF}^{commit}")"
git merge-base --is-ancestor "$PREV" "$TARGET_SHA" || { state failed "تاریخچهٔ محلی از نسخهٔ مقصد جداست؛ ادغام باید دستی بررسی شود"; exit 2; }
if [ "${UPDATE_REQUIRE_SIGNED_TAG:-false}" = "true" ]; then
  run git verify-tag "$REF" || { state failed "امضای نسخه تأیید نشد"; exit 2; }
fi

step "Backing up before update"
runsh "$BACKUP" || { state failed "Backup failed before code replacement"; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then state failed "Local work appeared during backup; preserved"; exit 2; fi

step "جایگزینی کد با ${REF}"
run git checkout --quiet --detach "$TARGET_SHA" || { state failed "تعویض کد ناموفق بود"; exit 1; }
step "نصب وابستگی‌ها"
if build_and_start; then
  printf '%s %s %s
' "$(now)" "$PREV" "$TARGET_SHA" >> "$DIR/history.log"
  state done "به‌روزرسانی کامل شد"
  say "done"
  exit 0
fi

say "the new version did not start: rolling back to $PREV"
step "بازگشت به نسخهٔ قبلی"
reset_build_files
if [ -z "$(git status --porcelain --untracked-files=normal)" ] && [ "$(git rev-parse HEAD)" = "$TARGET_SHA" ] && run git checkout --quiet --detach "$PREV" && run git_build_restore && runsh "$RESTART" && healthy; then
  state rolled-back "نسخهٔ جدید بالا نیامد؛ به نسخهٔ قبلی برگشت"
  say "rolled back"
  exit 1
fi
state failed "به‌روزرسانی و بازگشت هر دو ناموفق بودند؛ لاگ را بررسی کنید"
say "rollback failed"
exit 1
}
main "$@"
