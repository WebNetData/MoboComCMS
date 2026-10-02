#!/usr/bin/env bash
# Update MoboComCMS on an Ubuntu server: pull, install, build, restart.
# Run as the mobocom user from /opt/mobocom/app:  bash deploy/ubuntu/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

BRANCH="${BRANCH:-main}"
echo "[update] fetching $BRANCH"
git fetch --quiet origin "$BRANCH"
echo "[update] backing up before code replacement"
bash -c "${UPDATE_BACKUP:-bash deploy/ubuntu/backup.sh}"
git checkout --quiet "$BRANCH"
git reset --hard --quiet "origin/$BRANCH"

echo "[update] installing dependencies"
npm ci --no-audit --no-fund

echo "[update] building (PostgreSQL client)"
set -a; . /etc/mobocom/mobocom.env; set +a
NODE_OPTIONS="--max-old-space-size=${BUILD_MEMORY_MB:-3072}" npm run build:postgres

echo "[update] restarting (migrations run on start)"
sudo systemctl restart mobocom
sleep 8
if curl -fsS http://127.0.0.1:3000/api/health/ready >/dev/null; then
  echo "[update] healthy ✓"
else
  echo "[update] health check failed — see: journalctl -u mobocom -n 100" >&2
  exit 1
fi
