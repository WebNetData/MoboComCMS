# Release 1.7.26 — 2026-11-27

The owner requested stable publication of 1.7.26. The release preparation
worktree is `.mobocom/release-1.7.26` on `release/1.7.26`, based on
owner-merged `main` at `ba666260`. The release includes the bank SMS and
fee-sharing changes, Support ticket claims, the Persian customer desk,
assigned follow-ups, reviewed Automation recovery, durable Forms webhooks,
sales opportunities and Store quotations. [Persian notes](../../releases/1.7.26.md)

The release manifest seals the six existing SQL migrations without editing
their bytes. A populated isolated PostgreSQL upgrade from 1.7.25 preserved
the previous form, submission, ticket and exact order amount. Empty database
migration and non-demo seed passed on PostgreSQL 17 under an isolated
unprivileged database owner and Node UID1000.

The existing Ed25519 key corresponds to the previously distributed trust
anchor. Stable artifacts are generated from the exact validated, merged
commit. The owner applies the destination update after verifying a restorable
backup. An application rollback retains the migrated data. Hold queue workers
when running the previous application if work of the new job kinds is pending.
