#!/usr/bin/env bash
# Daily backup: PostgreSQL dump + uploaded files, kept for $KEEP_DAYS days.
# Scheduled by deploy/ubuntu/mobocom-backup.timer. Copy /var/backups/mobocom off the server regularly.
set -euo pipefail
set -a; . "${MOBOCOM_ENV_FILE:-/etc/mobocom/mobocom.env}"; set +a
# A backup holds every customer record and the private settings: only its owner may read it.
umask 077

APP_DIR="$(realpath -m -- "${MOBOCOM_APP_DIR:-/opt/mobocom/app}")"
# A database entered in the web installer is kept beside the site, not in the environment file.
if [ -z "${DATABASE_URL:-}" ]; then
  eval "$(cd "$APP_DIR" && node scripts/load-runtime-env.cjs)"
fi
[ -n "${DATABASE_URL:-}" ] || { echo '[backup] no database is configured' >&2; exit 1; }
# BACKUP_DIR belongs to the in-app encrypted backup worker. Retain an absolute
# legacy host path, but never interpret its relative storage/backups default here.
if [ -n "${HOST_BACKUP_DIR:-}" ]; then
  DEST="$HOST_BACKUP_DIR"
elif [[ "${BACKUP_DIR:-}" = /* ]]; then
  DEST="$BACKUP_DIR"
else
  DEST=/var/backups/mobocom
fi
case "$DEST" in
  /*) ;;
  *) echo '[backup] host backup directory must be absolute' >&2; exit 1 ;;
esac
DEST="$(realpath -m -- "$DEST")"
case "$DEST" in
  "$APP_DIR"|"$APP_DIR"/*) echo '[backup] host backup directory must be outside the application directory' >&2; exit 1 ;;
esac
KEEP_DAYS="${KEEP_DAYS:-14}"
[[ "$KEEP_DAYS" =~ ^[1-9][0-9]{0,3}$ ]] || { echo '[backup] invalid retention days' >&2; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"
# Serialize publication and pruning; never remove another live operation's lock.
exec 9>"$DEST/.backup.lock"
flock -n 9 || { echo '[backup] another backup is running' >&2; exit 3; }

DUMP="$DEST/db-$STAMP.dump"
STORAGE="$DEST/storage-$STAMP.tar.gz"
if [ -e "$DUMP" ] || [ -e "$STORAGE" ]; then echo '[backup] timestamp collision; existing archives preserved' >&2; exit 1; fi
TMP_DUMP="$DUMP.partial.$$"
TMP_STORAGE="$STORAGE.partial.$$"
trap 'rm -f -- "$TMP_DUMP" "$TMP_STORAGE"' EXIT

node "$(dirname "$0")/../../scripts/host-backup-db.cjs" dump "$TMP_DUMP"
node "$(dirname "$0")/../../scripts/host-backup-db.cjs" list "$TMP_DUMP"
# storage/update is the running update's own state (its lock too): restoring it would block later updates.
tar -czf "$TMP_STORAGE" --exclude=storage/clean-cache --exclude=storage/backups --exclude=storage/update -C "$APP_DIR" storage
tar -tzf "$TMP_STORAGE" >/dev/null
mv -- "$TMP_DUMP" "$DUMP"
if ! mv -- "$TMP_STORAGE" "$STORAGE"; then rm -f -- "$DUMP"; exit 1; fi
trap - EXIT

find "$DEST" -maxdepth 1 -regextype posix-extended -type f -regex '.*/(db-[0-9]{8}-[0-9]{6}\.dump|storage-[0-9]{8}-[0-9]{6}\.tar\.gz)' -mtime +"$KEEP_DAYS" -delete
echo "[backup] done: $DUMP, $STORAGE"
