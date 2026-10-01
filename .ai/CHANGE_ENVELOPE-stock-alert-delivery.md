# Store stock alert delivery

Goal: Notify only for publicly available products and retain an alert until its inbox event is durable.
Owner: `store` owns stock alert eligibility and scheduler; `notifications` owns the deduplicated inbox write.
Risk: R3 (durable job and publication state).

Inputs / outputs:
- Pending StockAlert, current product approval, active variants and stock.
- One deduplicated `STOCK_BACK` inbox event per subscription cycle; `notifiedAt` is set after the event exists.

Invariants:
- A hidden, unapproved or unpurchasable product never triggers an alert.
- Retry after a failed inbox write or failed final alert update cannot duplicate the inbox event.
- The customer's alert remains removable and variant-specific.

Allowed scope: Existing Store marketing domain/server and focused verification.
Forbidden drift: Product pricing, checkout, broad notification delivery redesign or schema migration.
Failure / race cases: Inbox persistence fails; two scheduler runs see the same alert; inactive-only variant products; product approval changes before delivery.
Proof required: Focused eligibility test, connected retry/idempotency check, type/source/architecture/security checks, PostgreSQL build.
