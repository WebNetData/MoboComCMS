# Current atomic Repository connection commands

Continue the existing client/configuration owner; keep repository.client.v1, settings.manage, URLs, response shapes and fingerprint confirmation. No schema, UI, independent settings or authorization system.

Capture a fresh strict configuration snapshot before network metadata retrieval. Connect/disconnect commit only while that snapshot is current; a changed connection returns409 and remains intact. Reuse shared updateJsonSetting claims/retries. In the same transaction revalidate the authenticated actor and canonical Repository module availability, replace/clear the config and record the existing success audit strictly. Provider metadata requests are outside repeatable transactions. Preserve optional trusted service callers; HTTP supplies command context. Corrupt stored configuration fails closed rather than silently replacing data.

Acceptance: actual controller/Identity/Settings/audit PostgreSQL scenarios for connect/disconnect, revoked authority, module disable, corrupt config, concurrent replacement and strict audit failure; unchanged license map retained; one success audit including no-op disconnect. Baseline and restored fault probes must demonstrate the guards. Compiled browser exercises the actual Admin HTTP flow. Relevant local checks/build/PG evidence recorded only after execution. Remote provider reconciliation and vendor mutations remain separate pending scope.

Executed bounded evidence: [audit](../../agent/audits/2026-10-12-repository-connection.md). Full roadmap/operational release remains active.
