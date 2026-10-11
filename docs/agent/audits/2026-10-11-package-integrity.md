# Package aggregate persistence — verified local slice

## Findings and implementation

Baseline PG1791725344996-35052 lost one concurrent file edit/history; PG1791725345749-22740 left new bytes/history after index failure. Both were native failures, not passing checks. The current package owner is retained; public store.ts delegates to private persistence/files/editor/theme parts. Every mutable read/validation/package write/index update and declarative theme registration/selection/removal now shares one Serializable transaction, bounded P2034/P2002 retry using fresh current rows. Strict mutations preserve malformed existing package/index/site data; normal rendering fallback and healthy absent rows remain compatible. Upload input validation, inactive install, enabled/settings/installedAt preservation, history limits, paths and permission keys remain.

Site Config owns an explicit transaction reader; theme commands use its strict current document instead of request-cached rendering data. Revision restore pins the selected entry across a retry and refuses a shifted index. Code apply supplies the snapshot actually written externally; later edits cannot be mislabeled applied. External filesystem/Git effects are not rolled back by this transaction.

## Executed evidence

- Actual PostgreSQL: overlapping independent file/history, settings/enabled and two settings-field reads; simultaneous first index creation and same-package first creation; stale enable versus deletion; upgrade/activation preservation; index failure rolls back package/history, delete and theme changes; invalid JSON/index shapes/site data stay raw; controlled serialization retry refuses a shifted restore, stable restore succeeds; stale applied source snapshot refused and matching snapshot accepted. Transaction clients are also intercepted by the fixture barrier/fault proxy; no bypass through a bound root client. Real Site Config validation/persistence; catalog and public-availability boundaries are explicitly doubled.
- Final PG log: .mobocom/restrictions-1791726865065-16332.log. Final non-root/no.env check: .mobocom/restrictions-1791726543272-45940.log, 639 tests plus TypeScript, native0. Final source build: .mobocom/restrictions-1791726632138-30752.log, native0; existing CSS autoprefixer warnings remain.
- Five deliberately removed safeguards produced meaningful AssertionErrors, fixture source restored: atomic-current .mobocom/restrictions-1791726539291-33512.log; strict-index .mobocom/restrictions-1791726539930-21640.log; selected-revision .mobocom/restrictions-1791726540667-42692.log; applied-snapshot .mobocom/restrictions-1791726541354-45696.log; strict-site .mobocom/restrictions-1791726542127-25728.log.
- Compiled HTTPS browser: .mobocom/restrictions-1791726867075-28840.log, 10 passed, no retry. Actual admin ZIP upload, existing editor Ctrl+S/save, concurrent API file/settings/enable, reload and preserved history; existing repository and security cases. No React/CSS changes and no new React Doctor/a11y scan claimed.

## Limits and next work

This is bounded local package persistence evidence, not completed operational lifecycle or production rollout. Audit records/current human authority around all commands, multi-action PATCH atomicity, independent Site Studio writers, dependency/version/compatibility publication, executable apply compensation/recovery, repair UX, public cache races and full lifecycle operations remain separate work. No new registry, schema, queue, reset, migration, provider upload, root app change, Actions, push, PR, merge or deploy.
