#!/bin/sh
set -eu

RUNTIME_ENV="${INSTALL_CONFIG_DIR:-storage/config}/runtime.env"

# Settings saved by the web installer (database address, generated secrets). Real environment variables win.
eval "$(node scripts/load-runtime-env.cjs)"

# No database configured yet: start the web installer instead of failing. It asks for the database in the
# browser, saves it, and restarts this script (Docker/systemd restart the process when it exits).
if [ -z "${DATABASE_URL:-}" ] && [ "${INSTALL_DISABLED:-false}" != "true" ]; then
  echo "[deploy] DATABASE_URL is not set: starting the web installer (open /install)"
  SETUP_MODE=1
  NEXTAUTH_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  INTERNAL_JOBS_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  PANEL_CREDENTIAL_KEY="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  export SETUP_MODE NEXTAUTH_SECRET INTERNAL_JOBS_SECRET PANEL_CREDENTIAL_KEY
  exec npm start
fi

if ! node scripts/production-preflight.cjs; then
  # Settings written by the installer must never leave the site unable to start: set them aside and offer the installer again.
  if [ -f "$RUNTIME_ENV" ] && grep -q '^# web-installer' "$RUNTIME_ENV"; then
    echo "[deploy] the installer's saved settings failed the preflight; setting them aside and reopening the installer"
    mv -f "$RUNTIME_ENV" "$RUNTIME_ENV.rejected"
    echo "تنظیمات ذخیره‌شده در بررسی راه‌اندازی رد شد (فایل runtime.env.rejected). دوباره وارد کنید." > "$(dirname "$RUNTIME_ENV")/last-error.txt"
    for key in ${INSTALLER_LOADED_KEYS:-}; do unset "$key"; done
    exec sh "$0"
  fi
  exit 1
fi

if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  echo "[deploy] applying PostgreSQL migrations"
  npx prisma migrate deploy --schema prisma/schema.postgresql.prisma
fi

# Idempotently migrate historical plaintext VPN-panel credentials to AES-256-GCM.
# Fresh installs normally report 0 after the first boot.
node scripts/encrypt-panel-credentials.cjs

exec npm start
