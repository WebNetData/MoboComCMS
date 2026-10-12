# Release safety PR — 2026-10-10

Scope: continue the existing editor/maintenance batch and close the native CMS label and forum staff-sanction regressions. No new schema, permission, URL, dependency or duplicate platform owner. Existing section visuals and canonical content are preserved.

## Changes

- Native CMS controls have associated labels and an explicit submit button.
- Applying or clearing a forum silence/suspension composes Identity's staff guard before mutation. Forum-only sanctions keep global standing unchanged.
- Maintenance updates claim the exact persisted Setting value and retry merges, including concurrent first creation; cached/error fallback data is never used for writes.
- Converted legacy content requires an explicit first save before ordinary autosave resumes. Lossy conversion requires visible acceptance.
- Light/dark CMS primary controls use SDS on-brand foreground tokens after axe detected insufficient dark-mode contrast. Protected public backgrounds and layouts are unchanged.
- Editor and public renderer share paragraph/block/Unicode-first-letter direction precedence. Editor surfaces and controls use existing semantic tokens.
- Inherited editor direction is committed in an effect, not written to a ref during render; React Doctor caught this during review.
- The existing browser workflow has 8 GB Node heap headroom after a reproducible 6 GB development-server restart. Its existing jobs/triggers and test assertions remain. Actions v4 are pinned to verified official commit refs, checkout credentials are not persisted and token permissions are read-only.
- Digital-code and digest inserts use parameterized, chunked `ON CONFLICT DO NOTHING` against their existing unique keys on PostgreSQL/SQLite. Exact inserted counts and existing encrypted codes/job state are preserved. No table, API, setting or provider is introduced.
- Connected regressions and actual browser coverage are registered in the existing runners; focused guidance is mirrored in the existing Codex/Claude skills.

## Executed evidence

Initial runtime/test snapshot: Git tree `de82f7c59cc6adc485d53f67536ad5c6fd169bf8`, based on main `0e196a9e5de9d6ea021cbb850040bb1bb235b039`. Subsequent insert compatibility, workflow and contrast fixes were checked separately as described below; this initial tree is not the final PR tree.

- Linux Node 22, uid 1000, no `.env`: `npm ci` and `npm run check` passed; 577 site tests, 53 connected test-double tests and 4 backup tests (634 total), plus TypeScript and the existing architecture/source/schema/security/release-manifest gates.
- Fresh empty PostgreSQL: `deploy:migrate`, `deploy:seed`, `test:pg` passed all 65 registered checks, including real handler/staff-guard and maintenance concurrency checks. Redis `test:redis` passed. Tests ran as uid 1000 with fixture credentials, no `.env`; the running user database was untouched.
- Production `npm run build` passed in the same isolated Linux snapshot, uid 1000, no `.env`, 4 GB Node heap. Existing media/maintenance CSS autoprefixer warnings remain.
- Initial staged diff Gitleaks scan: 44.89 KB, zero leaks, redacted output. Scoped Semgrep dynamic-code rule: 17 parsed source files, zero findings. This single rule is not a general security certification.
- React Doctor 0.9.17: all four affected React files analyzed, zero errors and 17 advisory warnings after fixing the render-time ref mutation. Telemetry and network supply-chain checks were disabled. Existing maintainability/effect warnings are not a zero-defect claim.
- Initial development browser run: 51 passed, 7 skipped, 3 did not run, 1 failed (`forms` request ECONNRESET during an observed Next development heap restart). This failed run is not counted as a passing gate. Full rerun with 8 GB headroom: 55 passed, 7 skipped, zero failures and zero retries (62 cases). Five skips need optional sample extensions and two need absent music fixtures. After the final contrast CSS changes, all six focused editor/section-manager browser cases passed again.
- A production browser rehearsal exposed two existing SQLite `skipDuplicates` type errors. After the portable insert fix, production startup correctly refused the localhost/SQLite test environment under the existing HTTPS/PostgreSQL validation. No production browser success is claimed; configured production-runtime testing remains a subsequent slice.
- Final portable inserts: fresh PostgreSQL migration/seed + `database-insert-compat.connected.cjs`, `digital-codes.connected.cjs` and `notification-policy.connected.cjs` passed. Fresh SQLite + portable insert/digest checks and `typecheck` passed as uid 1000 without `.env`. Checks cover 151-row chunk boundaries, exact added counts, duplicate encrypted-row preservation and digest replay. The new portable check detects the old SQLite implementation's unsupported `skipDuplicates` argument (expected baseline failure).
- The final-source SQLite `npm run check` rerun passed all 634 tests and its architecture/source/schema/security/type checks. The new portable check is additionally registered in `test:pg` (66 registered checks in this PR).
- Offline zizmor regular-persona scan of the affected browser workflow: exit 0, no reported findings (2 suppressed by the scanner); official action pins verified with GitHub's refs API. This is a scoped workflow check, not a complete CI audit.

## Limits and next work

This is local release evidence, not ProductionVerified. The encrypted PostgreSQL backup/restore rehearsal reported for the earlier batch was not rerun on this PR snapshot. Staging/deployment rollback, real configured payment/SMTP/SMS/delivery providers and the full buyer/return journey remain required. Existing checkout browser coverage stubs the payment response.

Independently revocable/overlapping scoped restriction records, module editor blocks/table/colour/gallery controls, broader revision snapshots and owner-screen moderation case closure remain subsequent slices through their existing owners. Unassessed domains are not classified as missing. Pending architecture/devstack installation work stays outside this bounded safety PR.

Only one consolidated PR to main is intended. Required Checks and Browser tests must be green on its actual head before merge; no manual workflow dispatch or gate bypass.

Final scoped axe check: light and dark CMS forms each passed 19 WCAG 2 A/AA and 2.1 AA checks with zero reported violations. This covers the affected form, not the entire platform.

Final runtime sources: production `npm run build` passed again as uid 1000 without `.env`, after the portable insert and contrast fixes.

Final staged diff: redacted Gitleaks passed with zero leaks (~114 KB scanned). The same scoped Semgrep rule also parsed the two added insert owners with zero errors/findings.


CI browser follow-up: PR #146 passed the configured gate with 53 direct passes, 2 flaky cases that passed on retry, and 7 fixture-dependent skips. The flaky cases were `/music does not crash` and the magazine-only section-manager save. Local full suite passed 55 cases without retries. Reproduce and stabilize the CI-resource behavior without weakening assertions or adding retries; then continue the real buyer/return scenario. No additional workflow was dispatched.
