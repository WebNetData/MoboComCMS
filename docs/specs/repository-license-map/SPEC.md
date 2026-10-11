# Atomic current Repository license commands

Extend shared Settings with strict current JSON-object mutation: exact stored-value claim, serializable conflict/first-creation retry and cache invalidation after commit. The callback is database-only and may repeat; provider requests occur once outside it. Preserve existing setting keys, commands, canonical Identity and module/site/configuration owners.

Activate/deactivate compare only their captured product entry against the current map, preserve unrelated entries and return409 for a replaced/removed target. Refresh skips entries changed after its vendor check, preserves unrelated additions and never restores a removed license or disables a package based on its old key. Current module/connection/site and, for Admin commands, current settings.manage actor are validated in the same commit. Strict success audit shares that transaction. Existing trusted scheduler contract remains context-free. Genuine revocation updates local state/package enablement atomically through the existing public package owner with an additive transaction reader; restoration does not auto-enable.

Acceptance: real PostgreSQL same/different-entry changes, first/existing overlapping transaction retries, strict audit rollback including package enablement, current authority and one connection; compiled delayed real HTTP API scenarios. Vendor effects cannot be undone by local SQL rollback and remain a recovery boundary.

[Evidence](../../agent/audits/2026-10-11-repository-license-map.md).

Absent-license deactivation preserves the existing audit contract with no vendor request; native and compiled repeated-deactivation evidence retained.
