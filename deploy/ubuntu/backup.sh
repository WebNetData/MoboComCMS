#!/usr/bin/env bash
# Daily backup: PostgreSQL dump + uploaded files, kept for $KEEP_DAYS days.
# Scheduled by deploy/ubuntu/mobocom-backup.timer. Copy /var/backups/mobocom off the server regularly.
set -euo pipefail
set -a; . /etc/mobocom/mobocom.env; set +a

DEST="${BACKUP_DIR:-/var/backups/mobocom}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$DEST"

pg_dump --format=custom --no-owner --dbname="${DATABASE_URL%%\?*}" --file="$DEST/db-$STAMP.dump"
tar -czf "$DEST/storage-$STAMP.tar.gz" -C /opt/mobocom/app storage

find "$DEST" -type f \( -name 'db-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "[backup] done: $DEST/db-$STAMP.dump, $DEST/storage-$STAMP.tar.gz"
