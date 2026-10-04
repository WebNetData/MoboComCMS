# Customer club order awards

Goal: Every paid order in the award window earns its points once, however many other orders are in the window.
Owner: `store` owns loyalty settings, ledger (`LoyaltyEntry`), account totals and the scheduler.
Risk: R3 (durable job, customer balance).

Inputs / outputs:
- Paid/completed orders created since the club started and updated in the last three days.
- One `EARN_ORDER` ledger entry per order (idempotency key `order:<id>`), account balance/lifetime, one deduplicated inbox event.

Invariants:
- Orders that already have their entry never hide orders that do not (the window is read in id pages).
- One order whose award fails is logged and retried; the others continue.
- An order earns once, also with two schedulers; points, tier and notification rules are unchanged.
- A run awards at most `limit` orders; the rest follow on the next run.

Allowed scope: `runLoyaltyAwards` in the Store marketing server and focused verification.
Forbidden drift: Point formula, tiers, reversal, redemption, settings shape, schema.
Failure / race cases: more than 500 awarded orders in the window; an account that cannot be read; concurrent runs.
Proof required: Connected PostgreSQL reproduction at the previous revision and passing run, focused marketing tests, type/source/architecture/security checks, PostgreSQL build.
