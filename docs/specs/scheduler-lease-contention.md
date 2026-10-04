# Background scheduler lease contention

## Audit and implementation

`Settings.acquireLease` is the existing scheduler lock owner. Its previous update-then-create path attempted an insert for every held lease, generating unique-constraint errors during normal contention and treating database failure as a held lock. All existing job names, Setting keys, ISO expiries and strict expiry comparison are preserved.

The same owner now uses one parameterized conditional upsert with RETURNING. An absent or expired row grants one slot; a held row returns no rows and keeps its expiry. Database failure propagates to the existing scheduler error handler. Invalid nonpositive/nonfinite durations are rejected before writing. This is an expiry lease, not a guarantee against a job outliving its lease; long jobs still require their existing idempotency/claim checks.

No migration, configuration, public API or visual change is needed. Lease rows remain excluded from normal Settings reads and caching. Rollback is the previous application version; stored rows remain compatible.

## Executed checks

- Three focused tests: grant/contention, database outage propagation and invalid duration rejection.
- Real PostgreSQL and isolated SQLite through Prisma 5.22: 20 concurrent first acquisitions, held acquisitions and expired acquisitions; exactly one winner for available slots, zero while held, unchanged held expiry, one stored row, Settings exclusion and zero Prisma error events. Namespaced fixtures were removed.
- Linux site502, TypeScript, source1574, architecture boundaries and security invariants passed. Release checks are recorded in the workstate when complete.

Production deployment and actual external background providers were not exercised.
