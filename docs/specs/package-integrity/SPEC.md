# Package persistence integrity

Continue the current packages owner and its package.<id>.v1 / packages.index.v1 rows. Actual PG1791725344996-35052 loses edit A after two controlled concurrent file reads;1791725345749-22740 persists new bytes/history despite an index-write exception. These are confirmed lifecycle prerequisites, not justification for another package system.

## Required implementation

- Keep public store.ts import address, URLs, manifest formats, declarative/code trust boundaries, inactive installation and existing revision retention. Split the existing few-hundred-line owner by concern behind that address as necessary.
- Execute mutable package reads, validation against current package, bytes/settings/enabled/codeStatus/revision changes and index membership/revision in one claimed/retried transaction. Do not merge whole stale snapshots. Test independent file edits and fields, first creation, competing index writers, enable/settings versus edits and delete/recreate conflicts.
- Theme registration/selection shares site.config.v1: compose its actual current owner/validation and transaction reader, preserving other site fields. Do not call cached global readers from a transaction or certify theme atomicity by testing only plugin packages.
- Strict mutation reads preserve malformed existing package/index/site JSON rather than treating corruption as an absent package. Missing rows/default and ordinary historical read semantics remain compatible. No blind restore from a changed revision index; preserve explicit selected revision provenance/precondition.
- Preserve installedAt, prior revision history/settings and code staged/applied semantics. Upload validation stays bounded; trusted executable source changes keep normal build/deploy. Filesystem apply/rollback and audit/current human grants are distinct contracts; a DB transaction is not compensation for external effects.

## Acceptance and status

The confirmed failures are corrected; the connected test is registered in run-pg-checks. Actual PG now verifies files/history/field and first-creation races, deletion versus stale enable, theme/config/index rollback, strict corruption preservation and restore/code snapshot provenance. Five meaningful source faults are detected and restored. Final check/build/compiled browser ran; [bounded evidence](../../agent/audits/2026-10-11-package-integrity.md). Full lifecycle/current-human/audit/external compensation and production rollout remain PARTIAL.
