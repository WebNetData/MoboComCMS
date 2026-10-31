#!/usr/bin/env bash
# Root-owned transport adapter of the existing Updater. Runs as the service user.
set -euo pipefail
main() {
umask 077
[ "$(id -u)" -ne 0 ] || { echo '[release] run through the service-user helper, not root' >&2; exit 2; }
ID="${1:-}"
[[ "$ID" =~ ^[a-f0-9]{64}$ ]] || { echo '[release] invalid package id' >&2; exit 2; }
APP="${MOBOCOM_APP_DIR:-/opt/mobocom/app}"
TOOLS="$(cd "$(dirname "$0")" && pwd)"
KEY="${UPDATE_PUBLIC_KEY_FILE:-/etc/mobocom/release-public.pem}"
ENV_FILE="${UPDATE_ENV_FILE:-/etc/mobocom/mobocom.env}"
STATE="$APP/storage/update"
LOCK="$STATE/lock"
mkdir -p "$STATE"
mkdir "$LOCK" 2>/dev/null || { echo '[release] update or restore already running' >&2; exit 3; }
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
cd "$APP"
set -a; . "$ENV_FILE"; set +a
export MOBOCOM_APP_DIR="$APP" MOBOCOM_ENV_FILE="$ENV_FILE"
CURRENT="$(node -p "require('./package.json').version")"
TRIES="${UPDATE_HEALTH_TRIES:-120}"
[[ "$TRIES" =~ ^[1-9][0-9]{0,2}$ ]] || exit 2
healthy() {
  local i
  for ((i=0;i<TRIES;i++)); do
    if curl -fsS -m 5 "${UPDATE_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}" >/dev/null; then return 0;fi
    sleep 3
  done
  return 1
}
TARGET=''; HOLD=''; ADOPTED=0; STOPPED=0; COMPLETE=0
write_state() { node -e 'require("fs").writeFileSync(process.argv[1],JSON.stringify({status:process.argv[2],step:process.argv[3],target:process.argv[4],previous:process.argv[5],at:new Date().toISOString()}),{mode:0o600})' "$STATE/state.json" "$1" "$2" "$TARGET" "$CURRENT"; }
restart() { bash -c "${UPDATE_RESTART:-sudo -n systemctl start mobocom}"; }
finish() {
  local code=$?
  trap - EXIT
  if [ "$COMPLETE" = 0 ]; then
    if [ "$ADOPTED" = 1 ]; then
      if python3 "$TOOLS/release-extract.py" undo "$APP" "$HOLD"; then
        if [ -f "$HOLD/inventory.before" ]; then
          cp "$HOLD/inventory.before" "$STATE/current-files.json"
        else
          rm -f -- "$STATE/current-files.json"
        fi
        if restart && healthy; then write_state rolled-back 'نسخهٔ جدید ناموفق بود؛ کد قبلی برگشت'; else write_state failed 'کد قبلی برگشت اما سرویس نیازمند بررسی است'; fi
      else
        write_state failed 'بازیابی کد ناموفق؛ سرویس خاموش است و مسیر بازیابی حفظ شد'
      fi
    else
      if [ "$STOPPED" = 1 ]; then restart || true; fi
      write_state failed 'نصب بسته انجام نشد؛ لاگ و مسیر خصوصی بازیابی را بررسی کنید'
    fi
  fi
  rmdir "$LOCK" 2>/dev/null || true
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT TERM HUP
exec >>"$STATE/update.log" 2>&1
if [ -n "${DOWNLOADS_ROOT:-}" ]; then
  DATA_ROOT="$(realpath -m -- "$DOWNLOADS_ROOT")"
  case "$DATA_ROOT/" in
    "$APP/storage/"*|"$APP/public/demo/"*|"$APP/public/uploads/"*) ;;
    "$APP/"*) echo '[release] custom downloads inside the code tree require operator storage adoption; nothing replaced' >&2; exit 2 ;;
  esac
fi
write_state running 'بررسی بستهٔ امضاشده'
HOLD="$(mktemp -d "$(dirname "$APP")/.package.XXXXXXXX")"
if [ -f "$STATE/current-files.json" ]; then cp "$STATE/current-files.json" "$HOLD/inventory.before"; fi
cp --no-dereference -- "$STATE/packages/$ID.mbrelease" "$HOLD/release.mbrelease"
[ ! -L "$HOLD/release.mbrelease" ] || exit 2
[ "$(sha256sum "$HOLD/release.mbrelease" | cut -d' ' -f1)" = "$ID" ] || exit 2
node "$TOOLS/release-package.cjs" verify "$HOLD/release.mbrelease" "$KEY" "$HOLD/payload.tar.gz" >"$HOLD/manifest.json"
TARGET="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).version" "$HOLD/manifest.json")"
node "$TOOLS/release-package.cjs" compare "$TARGET" "$CURRENT"
clean() {
  if [ -f "$STATE/current-files.json" ]; then node "$TOOLS/release-package.cjs" clean "$APP" "$STATE/current-files.json"
  elif [ -d "$APP/.git" ]; then local changes; changes="$(git status --porcelain --untracked-files=normal)" || return 1; [ -z "$changes" ]
  else echo '[release] source inventory missing; operator adoption required' >&2; return 1; fi
}
clean || { echo '[release] local changes preserved; update refused' >&2; exit 2; }
FREE="$(df -Pm "$APP" | awk 'NR==2 {print $4}')"
[ "$FREE" -ge "${UPDATE_MIN_FREE_MB:-4096}" ] || { echo '[release] insufficient build space' >&2; exit 2; }
python3 "$TOOLS/release-extract.py" extract "$HOLD/payload.tar.gz" "$HOLD/source" "$TARGET"
write_state running 'آماده‌سازی نسخهٔ جدید در پوشهٔ جدا'
( cd "$HOLD/source"; "${UPDATE_NPM:-npm}" ci --include=dev --no-audit --no-fund; NODE_OPTIONS="--max-old-space-size=${BUILD_MEMORY_MB:-4096}" bash -c "${UPDATE_BUILD:-npm run build:postgres}" )
rm -rf -- "$HOLD/source/storage" "$HOLD/source/var" "$HOLD/source/public/demo" "$HOLD/source/public/uploads"
cp "$HOLD/manifest.json" "$HOLD/source/.release.json"
node "$TOOLS/release-package.cjs" inventory "$HOLD/source" "$HOLD/current-files.json"
clean || { echo '[release] new local changes preserved; update refused' >&2; exit 2; }
write_state running 'پشتیبان‌گیری اجباری پیش از جایگزینی'
bash -c "${UPDATE_BACKUP:-bash deploy/ubuntu/backup.sh}"
clean || exit 2
write_state running 'راه‌اندازی نسخهٔ جدید'
bash -c "${UPDATE_STOP:-sudo -n systemctl stop mobocom}"; STOPPED=1
if python3 "$TOOLS/release-extract.py" adopt "$APP" "$HOLD"; then
  ADOPTED=1
else
  RESULT=$?
  # If adoption's compensation itself failed, do not start an uncertain code tree.
  if [ "$RESULT" = 2 ]; then
    write_state failed 'جابه‌جایی کد ناموفق؛ اپراتور باید مسیر خصوصی را بررسی کند'
    STOPPED=0
  fi
  exit 1
fi
restart
healthy || exit 1
mv "$HOLD/current-files.json" "$STATE/current-files.json"
printf '%s package:%s package:%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CURRENT" "$TARGET" >>"$STATE/history.log"
write_state done 'به‌روزرسانی بسته کامل شد'
COMPLETE=1
rm -f -- "$STATE/packages/$ID.mbrelease" "$STATE/packages/$ID.json"
echo "[release] healthy; previous code retained in $HOLD/before; database not rewound"
}
main "$@"
