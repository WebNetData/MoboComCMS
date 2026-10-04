# Stock hold expiry

Goal: The expiry job returns only the stock of unpaid orders whose hold really ran out.
Owner: `catalog` owns stock, reservations (`InventoryReservation`) and their expiry.
Risk: R3 (stock correctness, paid orders).

Inputs / outputs:
- `HELD` reservations past `expiresAt`, the order's status.
- Unpaid: reservation `RELEASED` and stock incremented once. Paid: hold kept, `expiresAt` moved an hour ahead.

Invariants:
- A paid (`PAID`/`COMPLETED`) order keeps its hold until delivery consumes it, however long delivery is delayed; the job never puts its units back on sale.
- A hold is released only if it is still expired when the release is written, so an extension by an arriving payment wins.
- Extending an expired hold (`ensureInventoryReservation`) only counts if the row is still held; otherwise the line is taken again.
- Release by staff or by a failed/cancelled payment (`releaseInventoryReservation`), consume and restock are unchanged.

Allowed scope: `releaseExpiredReservations` and the extension branch of `ensureInventoryReservation`.
Forbidden drift: Checkout reservation, consume, restock, delivery handler, schema.
Failure / race cases: delivery delayed beyond the 60-minute post-payment hold (worker outage, retries); payment arriving between the job's listing and its release; order paid after listing.
Proof required: Connected PostgreSQL reproduction at the previous revision and passing run, store tests, type/source/architecture/security checks, PostgreSQL build.
