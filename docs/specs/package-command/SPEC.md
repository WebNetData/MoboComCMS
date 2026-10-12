# Atomic package Admin PATCH

The existing PATCH accepts enabled, settings and activate in the same request. Actual PG1791727218383-33168 returns400 for an invalid later settings action after enabling the package; PG1791727219243-18876 returns200 after the second audit fails. These are confirmed failures. Continue the existing packages owner, Admin Control Plane, Identity guard and canonical AuditLog; no new lifecycle system/schema/permission/API.

## Contract

- Normalize the same accepted input shapes and retain legacy no-op/read and missing-package responses. A request's accepted mutations share one fresh package/index/theme transaction and bounded serialization retry.
- Reuse field validation with existing single-field services. Keep declarative/code activation boundaries, upload/history and source apply semantics.
- Record the same canonical action names, human actor and sanitized metadata with auditAdminStrict on the transaction client. A later validation or audit error rolls back every accepted mutation and earlier audit rows. Retry must not duplicate audit records.
- Theme enable/settings/selection belongs to the same command. Verify actual Site Config/audit/index/package rows, not only plugin state or a mocked audit callback.
- Keep permission admission through existing settings.manage. This slice does not certify in-flight authority revalidation, other command audits or external Git/filesystem compensation.

## Evidence

Baseline native failures above; package-command.connected.cjs creates namespaced actor/package/theme SQL fixtures and restores index/site in finally. Admission and unused code-apply boundaries are doubled, actual controller/package/audit/Site Config executed. Register only after corrected PG passes. Run relevant native fault/one-connection/check/build/compiled browser evidence; preserve protected UI.

## Verified status

Corrected and registered. Native PG/one-connection, four restored faults, check639/TypeScript/build and compiled HTTPS10 passed. [Evidence](../../agent/audits/2026-10-11-package-command.md). Full lifecycle/external effects/other command audits/current-human revalidation remain separate; goal active.
