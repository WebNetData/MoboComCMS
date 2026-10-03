#!/usr/bin/env bash
# Daily backup: PostgreSQL dump + uploaded files, kept for $KEEP_DAYS days.
# Scheduled by deploy/ubuntu/mobocom-backup.timer. Copy /var/backups/mobocom off the server regularly.
set -euo pipefail
set -a; . "${MOBOCOM_ENV_FILE:-/etc/mobocom/mobocom.env}"; set +a

APP_DIR="$(realpath -m -- "${MOBOCOM_APP_DIR:-/opt/mobocom/app}")"
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
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

DUMP="$DEST/db-$STAMP.dump"
STORAGE="$DEST/storage-$STAMP.tar.gz"
if [ -e "$DUMP" ] || [ -e "$STORAGE" ]; then echo '[backup] timestamp collision; existing archives preserved' >&2; exit 1; fi
TMP_DUMP="$DUMP.partial.$$"
TMP_STORAGE="$STORAGE.partial.$$"
trap 'rm -f -- "$TMP_DUMP" "$TMP_STORAGE"' EXIT

pg_dump --format=custom --no-owner --dbname="${DATABASE_URL%%\?*}" --file="$TMP_DUMP"
pg_restore --list "$TMP_DUMP" >/dev/null
tar -czf "$TMP_STORAGE" --exclude=storage/clean-cache --exclude=storage/backups -C "$APP_DIR" storage
tar -tzf "$TMP_STORAGE" >/dev/null
mv -- "$TMP_DUMP" "$DUMP"
if ! mv -- "$TMP_STORAGE" "$STORAGE"; then rm -f -- "$DUMP"; exit 1; fi
trap - EXIT

find "$DEST" -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "[backup] done: $DUMP, $STORAGE"
