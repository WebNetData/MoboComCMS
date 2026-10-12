# Atomic package PATCH command

## Confirmed findings

Actual native baselines: PG1791727218383-33168 returns400 for a later invalid setting after persisting enabled=true/index/audit; PG1791727219243-18876 returns200 after the second audit failed. These failures are corrected, not called successful checks.

## Implementation

The same PATCH URL/settings.manage guard/input normalization now sends accepted actions to patchPackage through the current store.ts address. Private fields.ts is reused by old single-field services and the combined command. Package settings/enabled, declarative theme selection and index mutation share the existing fresh Serializable transaction/retry. The same package.enable/disable/settings/activate-theme audit names and sanitized metadata are recorded through canonical auditAdminStrict with the transaction client. A later validation or audit error rolls back everything; a retry cannot leave aborted audit records. No-op/missing responses, declarative/code boundaries, public exports, data/history, protected UI and owner files remain. No schema/new registry/permission/queue/system.

## Executed evidence

- Actual controller/package/index/audit/Site Config SQL: invalid later field/wrong theme kind causes no persisted partial change; injected second/third audit failure rolls back package/index/theme and prior audit rows; controlled serialization abort/retry leaves exactly the canonical records; successful combined theme command selects it and reports active=true; no-op/missing compatibility retained. Admission and unused code-apply boundaries doubled; this is not proof of actual role/2FA revocation during execution.
- PG owners 3, native0: .mobocom/restrictions-1791727910617-22708.log; one-connection actual controller/audit native0: .mobocom/restrictions-1791727496781-4256.log.
- Four deliberate source faults detected meaningful AssertionErrors, restored: split-request .mobocom/restrictions-1791727493192-11820.log; nonatomic .mobocom/restrictions-1791727494097-15936.log; audit-outside .mobocom/restrictions-1791727494863-43668.log; audit-swallowed .mobocom/restrictions-1791727495618-43464.log.
- Non-root/no.env check639/TypeScript native0 .mobocom/restrictions-1791727497807-31396.log; final build native0 .mobocom/restrictions-1791727636649-40928.log,82 pages, existing CSS warnings. Compiled HTTPS10/zero retry native0 .mobocom/restrictions-1791727912732-22828.log: real editor/save plus invalid combined request stays inactive/original; valid combined request and separate concurrent writes; existing repository and visitor/Origin security cases. No React/CSS modifications or new React Doctor/a11y scan claimed.

## Remaining scope

This closes the verified multi-action PATCH/strict-audit gap only. Upload/delete/file/restore/repository-client audits still use their existing separate contracts; executable Git/filesystem apply is not transactional/compensated here. Mid-flight current-human revalidation, independent site writers, version/dependency publication, repair UX, runtime cache consistency and production rollout are not certified by this slice. Next focused audit should target the actual remaining command owners rather than invent parallel lifecycle systems. No Actions/push/PR/merge/deploy; isolated runtime only.
