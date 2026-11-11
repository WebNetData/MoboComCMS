# Git update build retention

Owner: existing Ubuntu host updater (`deploy/ubuntu/self-update.sh`, `update.sh`).
Risk: R3, installer/updater. No schema, dependency, public API, UI or identity change.

## Incident and outcome

The owner's 1.7.5 update exhausted the 4096 MB V8 heap. Building in the installed
directory had destroyed `.next/BUILD_ID`; rebuilding during rollback could fail for
the same reason. systemd then repeatedly started an incomplete build.

Both Git updater entry points must preserve the installed compiled build and
dependencies when a candidate build fails, and restore their original bytes after
failed adoption or health without rerunning npm/build. Signed-package updates
already build separately and keep their existing owner and trust checks.

## State and permissions

1. Require an existing nonempty BUILD_ID, real build/dependency directories, a
   writable app parent and the existing service-stop permission before backup or
   checkout. Broken installations require operator repair first.
2. Keep the existing update lock, backup, immutable target, owner-edit guards and
   source checkout. Export the target's tracked source into a private sibling
   directory; runtime env, uploads and storage are not archived into it.
3. Run npm and build there with the configured heap. Failure restores source through
   the existing guarded rollback; the installed artifacts remain available.
4. Validate candidate BUILD_ID and directories, recheck local work/HEAD, stop the
   service, retain both old artifact directories and adopt the candidate artifacts.
5. Restart and check readiness. On failure restore source and exact retained
   artifacts, then restart/check readiness; no npm or build replay.

Only the already trusted updater can invoke these commands. This adds no sudo
capability. Existing installations missing stop permission need the trusted
updater-install script. No database restore is automatic. Migrations must remain
compatible with the previous application.

## Disk space and snapshot retention — 2026-11-11

Incident: `/opt/mobocom` reached about 51 GB, mostly retained `.mobocom-build.*`
directories. The v1.7.16 update stopped in `npm ci` with ENOSPC; the Git rollback
then failed on the full disk, and the site kept running only because the old
process was still up.

1. One owner, `deploy/ubuntu/update-space.cjs` (service user, no root), for disk
   checks and retention. `self-update.sh`, `update.sh`, `package-update.sh` (when the
   installed code has the tool) and the Server Panel all use it.
2. Before backup or checkout, `ensure` estimates the need: 1.15 × (current
   `node_modules` + `.next`) + tracked source + 1 GiB margin, never below
   `UPDATE_MIN_FREE_MB` (default 4096). The `before/` snapshot is a move on the same
   filesystem, so it costs no extra space during the update. While space is short,
   removable snapshots are deleted oldest first; if still short, the update stops
   with the numbers and nothing has changed.
3. Git updaters export the target commit into the private directory and build it
   without checking it out. The running checkout moves (`git_build_switch`, which
   fast-forwards a branch for `update.sh`) only after the candidate validated. A
   failed npm ci or build therefore needs no checkout, stop or restart, so it also
   works on a full disk, and the never-adopted candidate is discarded at once.
4. Each directory records `status`: building → adopted → healthy | rolled-back, or
   failed. Retention per kind (`git`, `package`) keeps the newest
   `UPDATE_KEEP_SNAPSHOTS` (default 1) healthy or legacy snapshots that can still
   restore a previous build. Never removed: the caller's current directory; anything
   adopted, or building with bytes in `before/`, or with only part of a build in
   `before/`; everything while another holder has the update lock; everything while
   the installed build lacks `.next/BUILD_ID`. Names are matched exactly, links are
   not followed, and deletion renames to `.mobocom-trash.*` first so an interrupted
   deletion finishes later.
5. A successful update prunes to the policy. The Server Panel (`/admin/updates`,
   «فضای نسخه‌های قبلی») shows each directory's size, state and decision, free and
   needed space, and offers the same prune behind the panel gate, `settings.manage`,
   rate limit and audit (`updates.space-prune`); it refuses while the lock exists.

## Limits and acceptance

The checkout moves just before the service stops for adoption, so this is still not a
zero-downtime release switch. ENOSPC during the short checkout itself, power
loss/kill during filesystem moves, external writers and logical regressions beyond
readiness need an operator. The npm cache (`~/.npm`) is outside the policy. The
package updater keeps a plain free-space floor until the installed code includes
`update-space.cjs`.
An update runs the installed script: the fix does not retrofit an already-running
old updater or a previously destroyed build.

Acceptance: both entry points retain old artifacts on build failure; health failure
and interrupted adoption restore exact bytes without rebuilding; incomplete build,
missing current build/stop permission and concurrent owner work are refused. Run
the real production bundle after artifact move and restore, native PostgreSQL
checks, full project checks, scoped security rules and redacted secret scanning.
Enable the supported Webpack memory optimization and validate a real production
build; heap sizing still depends on host capacity.

Executed evidence and owner recovery: [host handoff](../../agent/handoffs/HOST_INSTALL_UPGRADE.md).
