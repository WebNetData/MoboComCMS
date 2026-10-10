# Refunded-order status explanation — 2026-10-10

## Confirmed defect and change

The preceding real buyer/return browser run exposed the return panel calling a `REFUNDED` order unpaid. `store/server/returns.ts::orderEligibility` supplied `paid: false` for that terminal state, so the domain eligibility function returned its unpaid explanation before its fully-refunded explanation.

The existing owner now recognizes `PAID` or `REFUNDED` as having been paid for this read-only explanation. The existing `fullyRefunded` guard still refuses another cancellation/return. Other unpaid statuses, permission keys, monetary states/amounts, historical rows, URLs and response fields stay unchanged. No schema migration or React/style change was needed.

## Actual checks

- `node --test scripts/returns-invoice.test.cjs`: 11 passed.
- Registered PostgreSQL `return-refund-integrity`: passed on the disposable migrated PostgreSQL17 database, two connections, no `.env`, uid1000. It now asserts both closed eligibility flags and the correct reason after an actual refund.
- Deliberately restored the old `PAID`-only predicate inside that owned test container: the new PostgreSQL assertion failed for the expected explanation; original corrected bytes restored in `finally`.
- A fresh `npm run build` passed with Next15.5.27/Prisma5.22.0, two CPUs/seven GiB and Node heap4096 MiB, against isolated PostgreSQL/Redis. Earlier attempts failed on root-owned copied Prisma artifacts; artifact ownership was repaired in the owned container, while all checks/build/browser still ran as uid1000. No failed attempt is reported as a pass.
- `node scripts/e2e-production.cjs --retries=0 e2e/tests/store-buyer-return.spec.ts`: one passed (9.8 seconds). Real wallet purchase/replay, delivery/privacy, customer return, scoped staff refund/replay and preserved stock/history still passed. The returned order asserts the corrected message and absence of the unpaid message. Light/dark1440 and dark390 screenshots were inspected; no overflow or captured JavaScript/console error.
- Local `mobocom-app` restarted on its existing port3000 after the source change; `/api/health/ready` returned HTTP200. No fixture balance or test sanction was written to its database.
- Source syntax/import (1733 TS/TSX files), architecture boundaries, security invariants, engineering docs and scoped refund/spec whitespace checks passed. Fresh Next production build included its TypeScript check; the previous root typecheck remains separately recorded in the preceding audit.

Evidence runner: `.mobocom/run-refund-gates.cjs`; latest log/result paths in `.mobocom/refund-gates-current.json` (exit0). Browser screenshots are under the existing runtime fixture's `refund-browser-results`. The previous full suite was 56 passed/seven fixture skips/zero retries; this correction reran only its meaningful buyer scenario and connected money regressions, not another full suite.

## Next stage and limits

The [scoped restriction spec](../../specs/scoped-restrictions/SPEC.md) now records the inspected existing semantics: forum suspension permits reading, posting is denied, category/edit and messaging staff exemptions differ, and two timestamp fields cannot represent independent overlapping history/revocation. Its record/backfill/compatibility/API/browser acceptance requirements are planned; no restriction model or consumer was added in this batch. Canonical Identity/AuthZ, staff guards and current Forum owners remain the implementation path.

Real configured providers, named staging/deployment/rollback and the remaining platform roadmap stay outstanding. Goal remains active; no GitHub Actions run, push, PR or deployment was made in this correction batch.
