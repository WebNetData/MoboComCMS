#!/usr/bin/env bash
# Explicit setup for the conventional /opt/mobocom Ubuntu installation.
# No production migration, traffic switch or feature deployment is performed.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run as root after reviewing docs/AI-ENGINEERING-FA.md'; exit 1; }
APP_DIR=/opt/mobocom/app
ENV_FILE=/etc/mobocom/mobocom.env
TOOLS=/usr/local/lib/mobocom-engineering
APP_UID="$(id -u mobocom)"; APP_GID="$(id -g mobocom)"
for bin in git docker node tar systemctl; do command -v "$bin" >/dev/null || { echo "Install prerequisite: $bin"; exit 2; }; done
[ -d "$APP_DIR" ] && [ -f "$ENV_FILE" ] || exit 2
[ ! -e /etc/mobocom/engineering.json ] && [ ! -e "$TOOLS/node_modules" ] || { echo 'Existing tools/config retained; follow the reviewed tool-upgrade procedure.'; exit 3; }
# Native releases and the trusted dependency image must have compatible Node/glibc.
/usr/bin/node -e "if(process.versions.node.split('.')[0]!=='22')process.exit(1)" || { echo 'This profile requires /usr/bin/node22; existing services were not changed.'; exit 2; }
. /etc/os-release
[ "$ID" = ubuntu ] && dpkg --compare-versions "$VERSION_ID" ge 24.04 || { echo 'This native profile requires Ubuntu24.04 or newer; no host changes made.'; exit 2; }
TASK_DIR="$(mktemp -d /var/tmp/mobocom-engineering.XXXXXX)"
cleanup() { case "$TASK_DIR" in /var/tmp/mobocom-engineering.*) rm -rf -- "$TASK_DIR";; *) exit 2;; esac; }
trap cleanup EXIT
if [ -d "$APP_DIR/.git" ] || [ -f "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" archive HEAD | tar -xf - -C "$TASK_DIR"
else
  git clone --depth 1 --branch main https://github.com/WebNetData/MoboComCMS.git "$TASK_DIR/source"
  git -C "$TASK_DIR/source" archive HEAD | tar -xf - -C "$TASK_DIR"
  rm -rf -- "$TASK_DIR/source"
fi
[ -f "$TASK_DIR/scripts/engineering/host.cjs" ] || { echo 'Install the engineering feature release first.'; exit 2; }
cat > "$TASK_DIR/Dockerfile.engineering-deps" <<'DOCKER'
FROM node:22-bookworm
WORKDIR /opt/deps
COPY . .
RUN npm ci && node node_modules/prisma/build/index.js generate --schema prisma/schema.postgresql.prisma
DOCKER
echo 'Preparing dependencies from committed source; no production env is copied.'
docker build -f "$TASK_DIR/Dockerfile.engineering-deps" -t mobocom-engineering-dependencies:local "$TASK_DIR"
IMAGE="$(docker image inspect mobocom-engineering-dependencies:local --format '{{.Id}}')"
docker image inspect postgres:16-bookworm >/dev/null 2>&1 || docker pull postgres:16-bookworm
PG_IMAGE="$(docker image inspect postgres:16-bookworm --format '{{.Id}}')"
install -d -m 0755 "$TOOLS" /etc/mobocom /run/mobocom-engineering
install -d -m 0700 /var/lib/mobocom-engineering
for file in protocol workspace github deployment host host-job broker validate git-credential native-update-check watchdog repair seal artifact native-runtime export; do install -m 0755 "$TASK_DIR/scripts/engineering/$file.cjs" "$TOOLS/$file.cjs"; done
install -m 0644 "$TASK_DIR/scripts/generate-ai-knowledge.cjs" "$TOOLS/generate-ai-knowledge.cjs"
install -d -m 0755 "$TOOLS/host/deploy/ubuntu" "$TOOLS/host/scripts"
install -m 0755 "$TASK_DIR/deploy/ubuntu/backup.sh" "$TOOLS/host/deploy/ubuntu/backup.sh"
for file in host-backup-db backup-core; do install -m 0644 "$TASK_DIR/scripts/$file.cjs" "$TOOLS/host/scripts/$file.cjs"; done
install -d -m 0755 "$TASK_DIR/worker"
docker run --rm --network none --mount "type=bind,source=$TASK_DIR/worker,target=/out" --entrypoint node "$IMAGE" /opt/deps/scripts/build-engineering-worker.cjs /out
cp -a "$TASK_DIR/worker/." "$TOOLS/"
DEPS_CONTAINER="$(docker create --entrypoint node "$IMAGE" --version)"
docker cp "$DEPS_CONTAINER:/opt/deps/node_modules" "$TASK_DIR/dependencies"
docker rm "$DEPS_CONTAINER" >/dev/null
# Approval runs with host authority: dependencies must be root-owned copies.
mv -- "$TASK_DIR/dependencies" "$TOOLS/node_modules"
chown -R root:root "$TOOLS"
chmod -R go-w "$TOOLS"
export APP_UID APP_GID IMAGE PG_IMAGE TASK_DIR
node <<'NODE'
const fs=require('fs'),path=require('path'),crypto=require('crypto'),tools='/usr/local/lib/mobocom-engineering';
const env=require(tools+'/protocol.cjs').environment('/etc/mobocom/mobocom.env');
if(!/^postgres(?:ql)?:/.test(env.DATABASE_URL||''))throw new Error('Root-owned DATABASE_URL required; app source is never executed to discover it');
const publicUrl=new URL(env.NEXTAUTH_URL);if(publicUrl.protocol!=='https:')throw new Error('Configure the public HTTPS URL first');
const config={protocol:1,repository:'WebNetData/MoboComCMS',dependencyImage:process.env.IMAGE,postgresImage:process.env.PG_IMAGE,dependencyLock:crypto.createHash('sha256').update(fs.readFileSync(path.join(process.env.TASK_DIR,'package-lock.json'))).digest('hex'),appDir:'/opt/mobocom/app',envFile:'/etc/mobocom/mobocom.env',storage:'/opt/mobocom/app/storage',proxyInclude:'/etc/nginx/mobocom-engineering-location.conf',tokenFile:'/etc/mobocom/engineering-github.token',backupScript:tools+'/host/deploy/ubuntu/backup.sh',publicUrl:publicUrl.origin,runtimeUid:Number(process.env.APP_UID),runtimeGid:Number(process.env.APP_GID),runtimeMemoryMb:2048,buildMemoryMb:4096,buildSwapMb:3072,buildHeapMb:5120,reserveMemoryMb:1024,autoRollbackMinutes:30};
fs.writeFileSync('/etc/mobocom/engineering.json',JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
if(!fs.existsSync(config.proxyInclude))fs.writeFileSync(config.proxyInclude,require(tools+'/deployment.cjs').proxyText(3000),{mode:0o644,flag:'wx'});
NODE
cat > /usr/local/sbin/mobocom-engineering <<'HELPER'
#!/bin/sh
exec /usr/bin/node /usr/local/lib/mobocom-engineering/host.cjs "$@"
HELPER
chmod 0755 /usr/local/sbin/mobocom-engineering
for name in broker worker watchdog; do install -m 0644 "$TASK_DIR/deploy/ubuntu/mobocom-ai-engineering-$name.service" "/etc/systemd/system/mobocom-ai-engineering-$name.service"; done
install -m 0644 "$TASK_DIR/deploy/ubuntu/mobocom-ai-engineering-watchdog.timer" /etc/systemd/system/mobocom-ai-engineering-watchdog.timer
systemctl daemon-reload
echo 'Installed; production traffic/database were not changed.'
echo 'Save a restricted GitHub token at /etc/mobocom/engineering-github.token (root0600).'
echo 'Review /etc/mobocom/engineering.json. In existing location / replace only proxy_pass with:'
echo 'include /etc/nginx/mobocom-engineering-location.conf;'
echo 'Keep headers/timeouts/TLS. Run nginx -t before graceful reload.'
echo 'Then enable --now mobocom-ai-engineering-broker.service mobocom-ai-engineering-worker.service mobocom-ai-engineering-watchdog.timer.'
