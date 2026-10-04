# FrenzyEx payment reconciliation selection

Goal: Every open FrenzyEx request that is due for a status poll is polled, however many other requests are open.
Owner: `billing` owns payment requests, reconciliation scheduling (`raw.reconcile`) and settlement.
Risk: R3 (payment state; selection only, settlement untouched).

Inputs / outputs:
- Pending FrenzyEx payments of unpaid invoices, their `reconcile.nextAt`/`lastCheckedAt`.
- At most `limit` status polls per batch; counters `checked/paid/pending/expired/canceled/failed/untracked/deferred`.

Invariants:
- Requests that are not due or cannot be polled never hide requests that are due (all open requests are scanned in id pages, up to 10,000).
- With more due requests than one batch, the ones checked longest ago (never-checked first) go first, so no request is polled repeatedly while another waits.
- A request is re-read before its poll; one settled by a callback meanwhile is skipped.
- A poll that throws is counted as failed and logged; the batch and the rest of the order worker continue.
- `reconcileOne`, validation, settlement, cancellation and backoff are unchanged; create is still never retried.

Allowed scope: `processFrenzyReconciliationBatch` and focused verification.
Forbidden drift: Settlement/validation logic, callback path, gateway client, schema.
Failure / race cases: more than 200 open requests; callback settles between scan and poll; poll throws.
Proof required: Connected PostgreSQL reproduction at the previous revision and passing run with a provider double, payment tests, type/source/architecture/security/money checks, PostgreSQL build.
