# Ubuntu host installation and recovery continuation — 2026-10-31

## One-line install, Debian and AlmaLinux, versions and downgrade — 2026-11-03

Branch `feat/one-line-install-2026-11-03` from main `0c17cbf9`. The owner asked for one command that installs on Ubuntu 22.04/24.04/26.04, Debian 12/13 and AlmaLinux 9/10, with update and downgrade just as easy. The existing installer is extended: no second installer, schema, permission or data change.

**Source changes**

- `deploy/ubuntu/platform.sh` holds what differs per system:
  - admission (anything else is refused before changes) and apt/dnf;
  - EPEL+CRB, NodeSource or the AppStream `nodejs:22` module;
  - PGDG PostgreSQL 17, with peer/scram initdb and `psql`/`pg_dump`/`pg_restore` on sudo's path on AlmaLinux;
  - Redis or Valkey, ufw or firewalld;
  - the nginx `sites-*` layout through `conf.d` plus the `httpd_can_network_connect` boolean;
  - swap on XFS and a `/usr/bin/mobocom` link.
- The signed `.run` bundle carries `platform.sh`.
- The root `install.sh` is the one-line entry:
  - its whole body runs only once downloaded, over HTTPS from github.com into a private root folder;
  - prompts go to `/dev/tty`;
  - `update`/`downgrade`/`versions`/`status` act on an installed site;
  - it replaces the root helper only when the new copy's `HELPER_VERSION` is higher.
- `mobocom versions`, `update VERSION` and `downgrade VERSION` work from tags `vX.Y.Z` on the existing `update.sh` exact-commit path. `UPDATE_TO` is new; older checkouts get `UPDATE_ROLLBACK_TO`.
- certbot's `certbot-renew.timer` name is accepted.

**Two defects found by these runs and fixed**

- With the code already present (a second run), `install.sh` read `git remote get-url origin` from the caller's folder and stopped. It now uses `-C "$APP_DIR"` and starts from `/`.
- The wrapper's exit cleanup read a variable local to `main`.

**Evidence**

Isolated privileged systemd containers ran the actual one-line command from the pushed branch, piped without a keyboard, against official images: **Debian 12 (32/32 checks), AlmaLinux 9.8 (34/34) and Ubuntu 24.04.5 (32/32)**.

Real in these runs:
- packages, Node 22, PostgreSQL 17, Redis, nginx, the 8443 listener and its 404 boundary, ufw/firewalld;
- the sudoers rules (restart mobocom only), the private env and password login over TCP, `sudo mobocom`;
- backup plus `pg_restore --list`;
- `versions`, a refused downgrade without confirmation, `downgrade 9.0.0`, `update 9.1.0`, refused missing/same/newer targets;
- a `downgrade 1.6.1` that cannot start, and its automatic return with health;
- a second one-line run that kept env/DB/code, and the one-line `status`.

Limits of that evidence:
- The built site was a stand-in that answers health and `/install`: no Next build or Prisma engine was fetchable for AlmaLinux on this network. The build is OS-independent Node 22 and verified earlier on Ubuntu.
- Container networking went through a loopback test proxy. Mirrors (Aliyun for AlmaLinux/EPEL/PGDG, PGDG apt preinstalled on Debian) were used only in the harness; product source keeps the official repositories.
- SELinux is disabled inside containers, so the boolean was not exercised.
- Debian 13 and AlmaLinux 10 were not run (no local images); their admission, Valkey fallback and EL10 paths are code plus unit tests only.

**Checks**

- `npm run check`: 816+53+4+13 passing, 0 failing. Installer/updater/release: 49/49. Gates green.
- Host-operations Semgrep: 8 targets, 0 findings. The repository's TS/JS Semgrep config has no shell rules. Gitleaks: 0.

**Remaining:** a real VPS per OS with DNS/SSL, AlmaLinux with SELinux enforcing, and Debian 13/AlmaLinux 10. Versions appear only when the publisher pushes `vX.Y.Z` tags.

## Browser host setup follow-up — 2026-11-01

Authoritative checkout: `.mobocom/autonomous-foundation`, branch `feat/browser-host-setup-2026-11-01`, from Ubuntu26 fix1231d9e5. Version1.6.1 changes package metadata only; dependencies/schema are unchanged. Owner requests domain/email/SSL entirely in the browser. Continue existing Installer/Server Panel/Updater; do not recreate a setup service, identity, database manager or queue.

Default no-argument signed bootstrap prepares the app/DB and private temporary HTTPS8443 with a root-owned14-day self-signed certificate, console fingerprint and existing installation code. Only installer API/assets/fonts are proxied; other paths404. The operator verifies the fingerprint before entering secrets. Domain/www/ACME email/consent and HTTP-webroot, Cloudflare DNS or validated private PEM compose canonical Server Panel services through a narrow installation facade. No Nginx stop, external-TLS bypass or credential URL. Canonical site URL changes restart the app; the browser polls the same private origin and reloads persisted settings. Fresh state/origin/strict rate/bounded JSON/exclusive operation guards precede writes. First-owner creation requires the matching configured HTTPS URL, uses canonical identity and closes the temporary listener. Existing installed/disabled/outage refusal and Admin password/TOTP controls remain. Standalone and externally managed TLS remain existing Admin/operator flows.

Root changes: reviewed bootstrap assets only; exact webctl sudo and systemd writable paths, mutation flock, private nofollow/nonblocking bounded Cloudflare snapshot for Certbot renewal, existing512MiB streamed package location in generated app vhosts. App-writable DNS input is never retained as Certbot's root renewal path. Legacy helper capability handshake preserves older deployments. Pre-owner operations use existing safe system journal; there is no fake human audit identity.

Old unfinished1.6.0 code requires explicit `--resume-uninstalled`; normal retry never silently replaces it. A trusted read-only PG probe rejects Admin/installed.lock/INSTALL_DISABLED/unreadable database before backup, after build and after service stop; the existing signed worker builds separately, requires backup, preserves DB/env/storage/var/legacy uploads and refuses downgrade/local edits after explicit baseline adoption. Existing installed sites use normal updates. No delete/reset/reopen of owner or lock.

Executed local evidence (owned isolated labs, no owner data/source.env): full `npm run check` **837 passes,0fail,0skip** on actual Ubuntu26 UID1000; production build and production env preflight passed. Native empty-PG `installer-host-setup` and `web-operations` passed, including credential secrecy, claims/concurrency, TLS/origin/body limits, provider failure, PEM and canonical owner. Two deliberate guard omissions were detected and restored. Actual sudo/CF probe verified root600 snapshot and rejected symlink/FIFO/oversize without replacing it. Host package/restore **14/14** used real local PostgreSQL/non-superuser backup and code adoption; service/build boundaries are fixtures. Full installer-controller **1/1** on Ubuntu26 used real signed fixture extraction/old-version adoption with OS/package/DB/service command doubles. Initial early root-tool-path defect was detected and fixed by this controller test.

Actual production Next + real Nginx/OpenSSL TLS + PostgreSQL + Redis browser flow passed in Edge: token/origin refusal, ACME failure/retry, private PEM import, actual process restart, persisted refresh, canonical owner/final URL and closed listener/API404. Four light/dark1440/390 captures were inspected; no overflow/pageerror, axe0. A real dark-button contrast failure was fixed, then the workflow reran successfully. Independent HTTPS probe verified the fixture CA/hostname without disabling TLS validation. ACME/systemd are explicit local boundary fixtures: no real CA issuance or VM boot is claimed. UI is plain JS/CSS, with no affected React component; React Doctor is not a substitute for this browser evidence.

Scoped final Semgrep:19 production targets,0 findings/errors; redacted Gitleaks:40 changed files,0 findings. No telemetry/cloud scan or hosted workflow dispatch. Signed1.6.1 artifact smoke verified publisher signature/SHA256/source commit, bounded extraction, all new assets, no runtime/agent/private-key payload, self-extracting help and actual Ubuntu26 argument admission. The publisher key remains outside Git. The existing localhost3000 app was restarted and readiness returned200; owner data preserved. Local Graphify refreshed incrementally in code-only mode (no semantic tokens), then source status was current.

Remaining destination gates: real VPS/systemd/UFW/NodeSource, public DNS and actual issuance/renewal, live operator retry and installed-site upgrade combinations. Existing installation reported inactive service/missing BUILD_ID; no remote SSH/deploy or claim that the live404 is repaired. Operator guide: [INSTALL-FA](../../INSTALL-FA.md); current source contract: [spec](../../specs/web-package-updates/SPEC.md#browser-host-setup--owner-decision2026-11-01). Rollback before adoption is source revert; after adoption use retained code/safety backup under existing recovery guidance; never automatically rewind schema/data. Owner merges/deploys; no hosted workflow dispatch.

## Ubuntu 26.04 follow-up — 2026-11-01

Authoritative continuation: `fix/ubuntu-26-installer-2026-10-31` from merged PR292/current main. Extend the existing bootstrap; no new installer, schema, permissions, runtime identity or data reset. The old packaged installer refused Ubuntu26.04 before apt. `deploy/ubuntu/install.sh` now admits exactly Ubuntu22.04/24.04/26.04 LTS, keeps the unsupported-release refusal (including26.10) and explains that compilation/TypeScript precede the final `Installed` message and service/Nginx setup. Operator guides and Server Panel header agree. Keep the same publisher key outside Git; rebuild the signed `.run` from the committed source, rather than altering `/etc/os-release` or bypassing signatures.

Executed in an isolated official `ubuntu:26.04` container (reported26.04.1, libc2.43):

- Existing installer/updater/release suites: **47/47**, UID1000, source without.env. Includes the actual shell admission branch for22.04/24.04/26.04 and refusal of unsupported/missing/foreign systems. An initial run lacked Git/Prisma test dependencies; after installing them the complete run passed. No assertion was removed.
- Actual PostgreSQL17.11 from the signed `resolute-pgdg` repository; package-update and host-restore rehearsals **10/10**, including real non-superuser database backup/data preservation and worker root refusal. Build/service lifecycle remains a fixture, not a full Next/systemd rollout.
- Python3.14 archive/adoption **3/3** and Ubuntu shell syntax checks passed. Actual Nginx1.28.3 accepted the existing complete reverse-proxy template via `nginx -t`; Redis8.0.5 and Certbot4.0.0 version commands passed.
- 109 official Ubuntu dependency packages were fetched through the Windows host and SHA256-checked against apt metadata after the container network failed HTTP downloads/TLS. Native apt installed them; no signature/TLS bypass or network workaround was added to product source. Git test dependencies used the same checked route. The subsequent existing package-install block completed, including native PGDG installation. Node22.23.3 was preinstalled from the official cached Node22 image; this proves its execution on26.04, **not** a fresh NodeSource download. The installer supports a preinstalled Node22 already. [PGDG distribution](https://apt.postgresql.org/pub/repos/apt/dists/resolute-pgdg/Release).
- Scoped Semgrep and redacted secrets checks recorded locally; fresh signed artifact verification/checksum/bootstrap smoke is performed when publishing the local installer. Do not substitute previous full-app check/build/browser evidence for a new run; this follow-up changes shell admission/messages and documentation only.

Owner-server diagnosis: a public GET to the supplied IP and the same GET with `Host: mobocom.net` returned Nginx's own404 HTML. Owner then confirmed inactive service and missing `.next/BUILD_ID`; the appended curl in their combined command did **not** execute. This is an incomplete installation, not evidence that the application's install guard is broken. No SSH/session access or mutation of the server was performed. [Safe diagnostic/retry guidance](../../INSTALL-FA.md) is under the Persian404 subsection; preserve existing env/DB/files, wait for an active build, otherwise inspect its final error and retry the trusted installer. DNS/HTTPS still belongs to the operator. Never reopen a working site's wizard by deleting its owner/lock.

Remaining: complete fresh VPS/systemd/UFW, NodeSource provisioning, real DNS/SSL and destination build validation. This extends admission/runtime evidence to26.04 without claiming those rollout gates. Rollback is the previous reviewed installer for its supported OS; existing application/data are untouched by this admission change. The old1.6.0 installer file does not acquire the fix automatically; deliver the rebuilt file/checksum.

## Source and bounded contract

Authoritative checkout: `.mobocom/autonomous-foundation`, branch `feat/secure-host-install-upgrade-2026-10-31`, based on main `4b8bc95a` and final import evidence `b5e44437`. Continues Claude's `docs/install-upgrade-guide-2026-10-31`/`1af215e1` plus a SHA-256 snapshot of its ten dirty documentation/test files. The source worktree was preserved. Do not rebuild the already merged web wizard, server panel, Media, Imports or updater API.

Owners: existing `deploy/ubuntu`, Updater, Installer, Server Panel and `scripts/backup-core.cjs`. No schema, public URL, permission, identity, module state or public visual change. Operator-facing guides are [INSTALL-FA](../../INSTALL-FA.md) and [UPGRADE-FA](../../UPGRADE-FA.md). [Web operations](WEB_OPERATIONS.md) remains the application-side handoff.

Acceptance for this slice: supported Ubuntu bootstrap with existing state retained; root-owned CLI; mandatory successful backup before code replacement/restore; no forced discard of local work; serialized update/restore; low-privilege archive/DB handling; bounded archive extraction; DB failure compensates file changes; accurate operator instructions and executed local evidence. Production rollout is a separate operator action.

## Implementation

- `deploy/ubuntu/install.sh`: Ubuntu22.04/24.04, Node22, PG17, Redis, Nginx, optional Certbot/UFW; exclusive install lock, validated arguments/default unit paths, private secrets, resume without replacing existing env/DB/code. Existing custom DB URLs are not interpolated into local SQL. Root assets come from a separate private clone of the explicitly trusted GitHub repository, never root execution of the app-writable installer. GitHub SSH host key is pinned from its official documentation; HTTPS remains required even with `--no-ssl`.
- `deploy/ubuntu/mobocom`: status/update/backup/backups/code rollback/explicit confirmed data restore. Root only controls service lifecycle and delegates operations to `mobocom`. Source/extraction/DB processes run as the service user. Root does not source runtime env or unpack tar files.
- `update.sh` and `self-update.sh`: parsed into a function before checkout can replace the executing script; immutable target, no forced checkout/hard reset, clean preflight and post-backup recheck, no discard of new work during failed build. Branch path uses fast-forward and safe `reset --keep` for eligible rollback. History records previous/current commits. DB migrations are never automatically rewound.
- `backup.sh`, `scripts/host-backup-db.cjs`: external host archive directory distinct from encrypted app backups; shared libpq adapter keeps credentials out of argv/logs. Backup publication/pruning lock, retention validation, private temporary files and verified pair publication.
- `restore-files.py`: standard-library streaming extraction accepts only regular files/directories under `storage`; rejects traversal, links, special/sparse files, duplicate entries and bounded entry/disk overflow. Staging is private. Adoption keeps the live storage root and `config`, `backups`, `update`, `clean-cache`. Existing shared update lock remains in place. On ordinary adoption failure files are compensated; recovery failure leaves service stopped.
- Restore order: claim shared lock → private copied archives → DB-list/extract preflight → stop app → mandatory current safety backup → adopt files → single-transaction DB restore → restart/health. DB failure undoes adopted files before restart. Current runtime secrets/config remain local. Staging and old files are retained for operator recovery.
- `updater-install.sh`: narrow existing sudo commands; only `NoNewPrivileges` is overridden for sudo, other systemd sandbox settings stay. Privileged adoption requires trusted/reviewed operator sources. The public app gets no general root shell or restore command.

## Executed evidence

- Isolated container `mobocom-hostops-20261031`, no published ports/network, Node22, actual PostgreSQL17, Python3, real sudo transition from root to service UID1000. This is Linux host-script rehearsal, **not** a full Ubuntu/systemd/DNS deployment. `systemctl` is a fixture that records lifecycle commands; health uses a local file.
- `node --test scripts/updater.test.cjs`: **30 passed, 0 failed, 0 skipped**. Real disposable Git repositories cover success, health/build rollback, manual downgrade followed by update, failed backup, tracked/untracked/late owner edits, divergent commits, locks, disk preflight, credential-free dump argv, backup permissions/retention and invalid backup publication.
- `MOBOCOM_HOST_REHEARSAL=1 PGHOST=127.0.0.1 node --test scripts/host-restore.test.cjs` (root inside isolated lab only): **5 passed, 0 failed, 0 skipped**. Actual non-superuser PostgreSQL dump/restore and upload adoption; extra dependent view forces transaction failure and proves old DB/files retained; traversal archive and corrupt DB fail before service stop; concurrent update refused; safety-backup failure restarts unchanged site. All current MoboCom migrations were also applied to an owned empty PostgreSQL database, dumped, and imported into the lab with `MOBOCOM_HOST_SCHEMA_DUMP=/opt/hostops/schema.dump`: the same **5 tests passed again against the full application schema**, retaining `_prisma_migrations` and empty canonical User data. Each owned DB/role and fixture directory is removed by teardown.
- `python3 scripts/host-restore-files.test.py`: **3 passed** with traversal/absolute/backslash/dot paths, symlink/hardlink/FIFO/device entries, duplicate/disk limits and injected rename failure compensation.
- `npm run check`: **828 passed, 0 failed, 1 Python-only skip** across site/connected/backup/billing suites; architecture/source/schema/migration/money/security/i18n/type gates all exited0. Ran as UID1000, no source `.env`, against a separately owned empty PostgreSQL database. Subsequent host-only guard changes were rechecked with the affected updater30 and real host/PG/archive suites. Earlier full152 PG/build/browser proofs belong to main4b8bc95a, not this host-only delta. No UI changed, so no new UI/browser proof is claimed for this slice.
- Scoped local Semgrep: **9 production targets, 0 findings, 0 errors**, covering forced Git replacement, DB credentials in argv, unauthenticated SSH keyscan and arbitrary Python archive extraction. **4/4 deliberately unsafe samples caught**. Redacted Gitleaks: **28 changed files, 0 findings**. No finding baseline was silently refreshed; no cloud scan or hosted workflow dispatch.

Tests do not use production data, source `.env`, real domains/certificates or real payment providers. The isolated root test must never be run on a live server. Invoke it only in a disposable container/VM with a local PG server and a `mobocom` service account; it deliberately exercises replacement and compensating recovery.

## Remaining deployment evidence and recovery limits

- Complete Ubuntu22.04/24.04 bootstrap/retry on a fresh VM with real systemd/UFW, private read-only deploy key, external HTTPS and real cert issuance/renewal remains operator validation. No such result is claimed from Docker command fixtures. Keep OS/PG packages updated; archives are trusted operator backups, not arbitrary uploaded SQL.
- Builds replace `.next` in place; this is not a zero-downtime release system. Migration backwards compatibility is checked per release, not guaranteed by code checkout alone. Health retry duration includes request timeout as well as sleeps.
- DB transactions do not include the filesystem. Power loss/SIGKILL/storage failure during adoption or immediately after DB commit requires operator review of the retained `.restore.*`/`moves.json`/`before` and safety backup before restart. Do not steal a lock by age. External DB writers/workers must be stopped separately for consistent restore.
- Restoring an older schema is not a schema downgrade: `pg_restore --clean` replaces objects present in the archive and may leave objects introduced later. Reapplying newer migrations can conflict with them. Rehearse an old-version restore/migration in an isolated database before choosing it on a live site; this slice proves current-schema recovery, not every historical version combination. No automatic schema purge is introduced.
- Host dumps/tar are private but unencrypted; preserve root env/keys off-server separately. Restore deliberately preserves current `storage/config` rather than replacing DB destination/encryption keys. New-host disaster recovery must install matching secrets explicitly.
- Failed health after a successful DB restore retains restored DB/files for diagnosis; it never silently rewinds newer production records. Code rollback changes only app code. To undo a data restore, explicitly select the current-state safety backup after review.
- Optional Server Panel SSL/helper activation is still the existing operator step in [WEB_SETUP_AND_SERVER](../../WEB_SETUP_AND_SERVER.md), not unrestricted automatic server administration.

Rollback of this development slice: revert its host scripts/docs before adoption, leaving application data untouched. An already installed root helper is updated only by explicit trusted operator installation. Owner merges and deploys; no hosted workflow dispatch.
