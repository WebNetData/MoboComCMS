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

## Limits and acceptance

Source checkout still precedes the build, so this is artifact isolation, not a
zero-downtime release switch. Disk exhaustion, power loss/kill during filesystem
moves, external writers and logical regressions beyond readiness need an operator.
Retained private sibling directories consume disk until deliberately cleaned up.
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
