# Current atomic vendor license administration

Extend existing grantLicense/setLicenseStatus/extendLicense/releaseSite through the same vendor public address and a private database-only command transaction. Admin supplies optional context; preserve existing trusted callers and buyer release-site ownership signature. No new license, Identity, Settings, module, job or audit system; no schema/API/UI change.

In the transaction revalidate current canonical Identity/2FA/GLOBAL and the existing any-of repository.manage/settings.manage contract plus canonical Repository module. Strict existing success audit shares the mutation transaction. Issuing uses the transaction reader; no key in audit. Extending uses current stored date and bounded serializable retry so concurrent accepted increments accumulate. Keep numeric validation, status behavior and site normalization. Provider/file effects, public machine concurrency and buyer/payment atomicity remain separate audited gaps; do not claim they are solved by Admin tests.

Acceptance: real Admin controller/Identity/module/SQL/audit scenarios for all four operations with full/current delegated managers, standing/permission/GLOBAL/2FA/module changes after initial admission and strict audit failure. Preserve exact licensed product/activation rows on rejection, exactly one existing success audit and no plaintext secret. Overlapping extensions retain both durations; one-connection portability is explicitly serial. Baselines and restored fault probes, relevant PG/check/build/compiled HTTP tests; retain only executed evidence.

Executed bounded evidence: [audit](../../agent/audits/2026-10-12-repository-vendor-licenses.md). Native39 includes two buyer ownership checks; financial/whole roadmap readiness remains open.
