#!/usr/bin/env bash
# Private part of the trusted installer. Uses the existing backup-protected package worker.
[ "${BASH_SOURCE[0]}" != "$0" ] || { echo "Use the signed installer with --resume-uninstalled" >&2; exit 2; }

assert_uninstalled_source() {
  say 'Checking unfinished installation (read-only database probe)'
  PROBE_ROOT="$(mktemp -d /etc/mobocom/.install-probe.XXXXXXXX)"
  chmod 755 "$PROBE_ROOT"
  install -m 644 -o root -g root "$ROOT_ASSETS/host-backup-db.cjs" "$ROOT_ASSETS/backup-core.cjs" "$PROBE_ROOT/"
  if ! INSTALL_STATE="$(as_app bash -c 'set -a; . "$1"; set +a; cd "$2"; export MOBOCOM_APP_DIR="$2"; exec node "$3" install-state' _ "$ENV_FILE" "$APP_DIR" "$PROBE_ROOT/host-backup-db.cjs")"; then
    rm -rf -- "$PROBE_ROOT"; die 'cannot verify that this site is uninstalled; existing code/data left unchanged'
  fi
  rm -rf -- "$PROBE_ROOT"
  case "$INSTALL_STATE" in no-admin|no-schema) ;; *) die 'site is installed, disabled or locked; use the normal backup-protected updater, not incomplete-install refresh' ;; esac
}

refresh_uninstalled_source() {
  if [ "$NEW_PACKAGE_INSTALL" = 0 ]; then
  CURRENT_VERSION="$(installed_version)"
  if [ "$CURRENT_VERSION" != "$VERSION" ]; then
    node "$ROOT_ASSETS/release-package.cjs" compare "$VERSION" "$CURRENT_VERSION" || die 'unfinished installation cannot be downgraded'
    say 'Refreshing unfinished source with the existing signed updater'
    note 'Explicit source adoption requested; current data/env are retained and the worker requires backup before replacement.'
    install_package_tools
    install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$BACKUP_DIR"
    install -m 644 "$ROOT_ASSETS/mobocom.service" /etc/systemd/system/mobocom.service
    bash "$ROOT_ASSETS/updater-install.sh" >/dev/null
    if [ "$WEB_SETUP" = 1 ]; then bash "$ROOT_ASSETS/web-setup-install.sh" closed; fi
    as_app mkdir -p "$APP_DIR/storage/update/packages"
    PACKAGE_ID="$(sha256sum "$PACKAGE" | cut -d' ' -f1)"
    install -m 600 -o "$APP_USER" -g "$APP_USER" "$PACKAGE" "$APP_DIR/storage/update/packages/$PACKAGE_ID.mbrelease"
    if [ ! -f "$APP_DIR/storage/update/current-files.json" ]; then as_app node /usr/local/lib/mobocom/release-package.cjs inventory "$APP_DIR" "$APP_DIR/storage/update/current-files.json"; fi
    as_app env UPDATE_REQUIRE_UNINSTALLED=1 bash /usr/local/lib/mobocom/package-update.sh "$PACKAGE_ID" || die 'unfinished refresh stopped safely; inspect /opt/mobocom/app/storage/update/update.log locally (redact secrets before sharing)'
  elif [ ! -f "$APP_DIR/storage/update/current-files.json" ]; then
    ADOPT_INVENTORY=1
  fi
  fi
}
