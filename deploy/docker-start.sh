#!/bin/sh
set -eu

node scripts/production-preflight.cjs

if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  echo "[deploy] applying PostgreSQL migrations"
  npx prisma migrate deploy --schema prisma/schema.postgresql.prisma
fi

# Idempotently migrate historical plaintext VPN-panel credentials to AES-256-GCM.
# Fresh installs normally report 0 after the first boot.
node scripts/encrypt-panel-credentials.cjs

exec npm start
