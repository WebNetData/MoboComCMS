# Bootstrap role preservation — 2026-10-11

The local startup script runs `prisma/seed.cjs` after migrations. Its Role upsert
updated `permissions` on every seed, overwriting an edited default role and its
updatedAt history. A real namespaced PostgreSQL test reproduced that behavior;
no existing role or identity was altered for the negative test.

The existing seed owner now inserts declared missing roles with a parameterized
targeted `ON CONFLICT (name) DO NOTHING`. Existing ids, labels, permissions,
system flags and timestamps remain untouched. Explicit data-safe migrations
own permission upgrades; startup cannot reset an owner's choices. No migration,
setting, second initializer or authentication model was introduced.

An intermediate empty-update ORM upsert preserved replay but failed 11 of 12
concurrent fresh bootstraps. Native conflict handling fixed this race. The test
adapter initially used an unavailable runtime Prisma.Sql constructor; correcting
it to the supported Prisma.sql tag resolved that fixture error, not an application
defect. PostgreSQL and SQLite then passed 12 concurrent fresh role initializations,
exact declared defaults/types, immutable custom permissions/whole-row history on
replay and creation of a missing declared role. The test runs the actual seed main
only up to its identity boundary, namespacing every role and cleaning in finally;
it does not seed demo identities or settings in the caller's database.

Executed: registered `seed-role-preservation` with six related PostgreSQL checks
all passed (`1791678315399-5804`); equivalent SQLite passed
(`1791678321825-23592`); eight installer units passed after the final SQL change
(`1791678512804-30396`); final source gate passed (`1791678512829-12428`). Two
intentional faults (permission reset and absent conflict handling) were detected
after a green baseline; seed bytes restored (`1791678491728-35764`). All ran as
OS uid1000 and without `.env` in an owned fixture.

The user's local :3000 container then executed the complete fixed startup/seed.
Aggregate private before/after hashes proved all five existing Role rows and
nine accounts' standing/role/credentials unchanged; readiness200 and independent
Chromium homepage/collection checks passed. No sensitive values were emitted.

The combined application build and complete browser58/seven skips passed before
this seed-only repair; compiled application source was not changed afterward.
Seed behavior has its separate database and actual-local-startup evidence above.
The full 638-test check covers the analytics/notification source batch; eight
installer units and the source gate were rerun for the final seed change. Do not
claim a second full build/check/browser run on the final seed script.

No hosted Actions, push or new PR was executed. Existing install/upgrade behavior
outside this bounded initializer and real provider/deployment evidence remain
separate acceptance work.
