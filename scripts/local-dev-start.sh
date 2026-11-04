#!/bin/sh
# Start of the local development container (docker-compose.local.yml).
#
# The project folder is mounted read-only at /src. Docker Desktop serves a Windows or macOS folder to
# the container far more slowly than the container's own disk, and `next dev` looks at thousands of
# files on every request, so the code is copied to /app once at start and the site runs from there.
# Restarting the container picks up the current code; `docker compose ... up --watch` also sends
# edits across while it runs. Uploads stay on the host (./storage is mounted on its own).
set -e
cd /app
echo "Copying the project into the container..."
rm -rf /app/src /app/public /app/prisma
# tar asks the mounted folder fewer questions per file than cp -a does.
tar -C /src -cf - src public prisma | tar -C /app -xf -
mkdir -p /app/scripts
find /app/scripts -maxdepth 1 -type f -delete
# Only the files directly in scripts/ are needed, not what may lie in folders below it.
for file in /src/scripts/*; do
  if [ -f "$file" ]; then cp "$file" /app/scripts/; fi
done
for file in package.json package-lock.json next.config.js tsconfig.json next-env.d.ts .env; do
  if [ -f "/src/$file" ]; then cp "/src/$file" "/app/$file"; fi
done
[ -d node_modules/next ] || npm ci --ignore-scripts --no-audit --no-fund
node scripts/generate-extensions.mjs
node scripts/generate-db-client.cjs
npx prisma migrate deploy --schema prisma/schema.postgresql.prisma
node prisma/seed.cjs
# Use Webpack for this branch-changing checkout; avoid carrying the large persistent Turbopack cache.
exec npx next dev --webpack -p 3000 -H 0.0.0.0
