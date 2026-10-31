# Final validation — consolidated import/editor/server batch

Date:2026-10-31. Published implementation17b06bba was merged by PR[#290](https://github.com/WebNetData/MoboComCMS/pull/290) into main4b8bc95a with an identical source tree. Claude published the branch while Codex was completing the final checks; no duplicate PR is needed.

## Executed evidence

| Gate | Verified result and scope |
| --- | --- |
| `npm run check` | Exit0,821 Node passes,0 failures,1 Python-only skip. Reconfirmed after publication in the isolated Linux UID1000/no-.env source snapshot with PostgreSQL configured; includes typecheck/architecture/schema/migration/security/audit and registered unit/mock-connected suites. |
| Fresh migration/seed | Both exit0, owned `mobocom_editor_media_20261028` only, no demo data or live-site reset. |
| `scripts/run-pg-checks.cjs` | Exit0, all152 default named PostgreSQL checks passed together after the six fixture corrections, fresh migration and seed. Optional checks are explicitly reported as not run by this command. |
| Explicit import checks | `import-content-compat`, `import-edit-protection`, `import-execution-authority`, `import-provenance` passed separately; exact assertions/doubles are in the handoff and source. |
| `scripts/rate-limit.redis.cjs` | Actual `rate-limit.redis: ok` against a temporary Redis7 container, private test network, no published port/volume/shared production data. Container removed afterward. |
| Production build | Exit0 in the isolated source/UID/PG harness. Existing dynamic-filesystem tracing warnings remain; no suppression or package upgrade. |
| Browser | Edge wizard upload/dry-run/draft/queue/report/confirmed rollback passed on owned localhost3205/PostgreSQL. Light/dark1440/390, scoped guide axe0, no runtime errors/overflow. |
| React/scanners | Imports page/guide Doctor0 errors/18 inherited page warnings; consolidated Semgrep85 JS/TS targets0 findings/errors, redacted161-file Gitleaks0 and subsequent13-file docs/test-correction scan0. |

The previous slice separately executed9/9 Python/OpenSSL helper tests and native first-owner checks on owned empty databases. Main app's Python-only skip is not a pass. Target-host ACME/renewal/deployment and external-provider constraints remain in the existing handoffs. The native sample check validates all seven schemas; the browser executes Magazine end to end, not every adapter/provider.

## Failed attempts and corrections

The first full native attempt overlapped dependency copying for the build and could not load modules. It was not successful. A stable full run then exposed six stale fixture contracts. Each corrected case passed individually; all152 subsequently passed together from fresh migration/seed:

- Digital-code fixture loader resolves JSON manifests rather than TypeScript directories.
- Digest fixture uses the actual policy-history key; replay preserves enabled policy, so zero new jobs proves deduplication rather than a disabled service.
- Editor fixture asserts ten module sources and the additional synced-pattern source separately.
- Masked-file fixture explicitly doubles the current section-settings reader boundary.
- Activity stream asserts the canonical `/u/` profile address; forum/topic URLs retain their own routes.
- Reputation fixture keeps Settings/recount jobs inside its declared in-memory boundary; real reactions/profile recount remain PostgreSQL-backed.

No production rule, permission or baseline was loosened. The six fixture fixes are in the merged PR. Earlier browser session/locator/confirmation/repeated-title harness attempts were corrected before the final maintained pass and are not counted as passes. Claude's748/6 check-container record is retained in the handoff as a separate environment; it does not replace the final821/0 isolated execution.

## Continuation boundaries

The implementation and operator guides are on main: [installation](../../WEB_SETUP_AND_SERVER.md), [bulk import](../../BULK_IMPORT.md) and README. Local gates do not certify a live deployment, external delivery or zero-downtime updates.

Claude's `.mobocom/claude-post-styles` is separately on `docs/install-upgrade-guide-2026-10-31`, commit1af215e1 (`wip: rehearsal`), with additional uncommitted docs/tests observed during this audit. It adds a host installer/CLI and changes backup/update scripts. Those files were inspected read-only and preserved; they were not copied into main or included in the successful gates above. Resolve its latest state and validate privileged operations/security/recovery separately before recommending or publishing that WIP. Do not overwrite a concurrently active worktree.

Raw ignored evidence: `.mobocom/imports-release-evidence/check-final.log`, `postgresql-final.log`, `build-final.log`, `redis.log`, browser/Doctor/scanner artifacts. Only owned temporary containers/databases/source copies are eligible for cleanup; original settings/content/files/archives and unrelated work remain. The final validation record can accompany the next reviewed installation/documentation batch without dispatching another hosted workflow merely to repeat local evidence.
