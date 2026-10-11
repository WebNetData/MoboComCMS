# Atomic extension state — first lifecycle integrity slice

Existing owner: extensions/server/state.ts; current generated manifests and settings.manage Admin route. Actual PostgreSQL reproducer 1791718574352-9748 lost seo.title during two simultaneous settings saves. No new registry/state store, permission, URL or protected design.

Save current settings, stored enabled flag, dependency validation and legacy stateSetting mirror in one Serializable transaction. All readers inside the mutation use its transaction client, including recursive dependency reads. Retry only database serialization/first-row unique conflicts, bounded twenty attempts; other storage/validation failures propagate and roll back both rows. Existing fields, masked secrets, validation hooks, defaults and stored-versus-effective enable semantics stay compatible. No module data purge, source code installation or financial/job cancellation is added.

Acceptance: actual PostgreSQL two writers synchronized before their first upsert, both existing and absent state row, distinct settings retained; injected mirror-write failure rolls back exact two-row snapshot; unknown settings refused; explicit one-connection deployment; relevant existing unit/type/build and compiled Admin/module switch regression evidence. Broader lifecycle publication/compensation, independent legacy flag writers, read snapshot consistency and queued effect reconciliation remain separate gaps, not implicitly solved by this slice.

Bounded acceptance verified: actual PG existing/first-row concurrency, atomic fault rollback and one-connection dependency reads; two detected/restored faults, check638/build and compiled24. [Evidence and limits](../../agent/audits/2026-10-11-extension-state.md). Full lifecycle remains PARTIAL.
