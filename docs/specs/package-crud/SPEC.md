# Direct package Admin command integrity

Extend the existing package owner, current Identity guard and strict Audit owner to upload/install/upgrade, file write/delete, revision restore and package delete. Revalidate the admitted actor using the transaction reader on every serializable attempt; use current actor in revision/audit. Package, index, theme/Site Config and successful canonical audit commit together. Existing trusted internal/repository/code callers keep their signatures; no new permission, schema, URL or parallel subsystem.

Acceptance: actual post-admission revocation denies before persistence; audit failure leaves package/index/history/theme/Site Config unchanged; authorized commands emit exactly one existing action; prior PATCH authority/atomicity and store overlap still pass; compiled editor upload/write/delete/restore works. A controlled params/body boundary is not a streamed HTTP timing claim. Snapshot authority does not prevent every later external effect.

Verified: [bounded local evidence](../../agent/audits/2026-10-11-package-crud.md).
