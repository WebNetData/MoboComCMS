#!/usr/bin/env bash
# Updates this checkout to a release tag, rebuilds, restarts, and rolls back by itself if the new version does not start.
#
#   bash deploy/ubuntu/self-update.sh v1.6.0
#
# Started by the admin panel through /usr/local/sbin/mobocom-update (a transient systemd unit, so it survives the
# restart of the site). Progress is written to storage/update/state.json and update.log, which the panel shows.
# Database migrations are applied by deploy/docker-start.sh when the service starts.
#
# Test overrides: UPDATE_NPM, UPDATE_BUILD, UPDATE_BACKUP, UPDATE_RESTART, UPDATE_HEALTH_URL, UPDATE_HEALTH_TRIES, UPDATE_STATE_DIR, UPDATE_ENV_FILE.
set -uo pipefail
main() {
cd "$(dirname "$0")/../.."

REF="${1:-}"
[[ "$REF" =~ ^v?[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}([-+][0-9A-Za-z.-]{1,40})?$ ]] || { echo "invalid version: $REF" >&2; exit 2; }

DIR="${UPDATE_STATE_DIR:-storage/update}"
mkdir -p "$DIR"
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
  # The environment file sets NODE_ENV=production, which would leave out the packages the build needs.
  run "$NPM" ci --include=dev --no-audit --no-fund || return 1
  step "ساخت نسخهٔ تازه"
  runsh "$BUILD" || return 1
  step "راه‌اندازی مجدد سرویس"
  runsh "$RESTART" || return 1
  step "بررسی سلامت سرویس"
  healthy
}

step "دریافت نسخه‌ها"
PREV="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$PREV" ] || { state failed "مخزن git پیدا نشد"; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=normal)" ]; then state failed "تغییر محلی وجود دارد؛ ابتدا آن را حفظ و بررسی کنید"; exit 2; fi
run git fetch --quiet --tags origin || { state failed "دریافت از مخزن ممکن نشد"; exit 1; }
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
if [ -z "$(git status --porcelain --untracked-files=normal)" ] && [ "$(git rev-parse HEAD)" = "$TARGET_SHA" ] && run git checkout --quiet --detach "$PREV" && build_and_start; then
  state rolled-back "نسخهٔ جدید بالا نیامد؛ به نسخهٔ قبلی برگشت"
  say "rolled back"
  exit 1
fi
state failed "به‌روزرسانی و بازگشت هر دو ناموفق بودند؛ لاگ را بررسی کنید"
say "rollback failed"
exit 1
}
main "$@"
