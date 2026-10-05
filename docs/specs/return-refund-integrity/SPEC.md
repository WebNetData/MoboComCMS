# Returns and cancellations: never refund more than the order holds

## Audit

A customer cancels or returns an order; the refund is credited to their wallet (`store`, `ReturnRequest`; money through `wallet`). By default a cancellation before shipping is refunded at once (`autoRefundCancel`). Four faults, the first three reproduced on `main` with the connected script.

1. **"Cancel order" twice at once refunded the order twice.** Opening a request checked "no open request for this order" and then created one, inside a transaction but without a lock, so two submissions in the same instant both passed and two requests were opened. Each was then refunded automatically. With an existing wallet the customer received twice the order total.
2. **Two requests of one order refunded together exceeded the order.** A refund read how much of the order had already gone back, clamped its amount to the rest, and claimed its own request. Two refunds of different requests of the same order (two staff members, or the two requests from fault 1) each saw the full remainder.
3. **An interrupted refund was lost.** The request is marked refunded before the wallet is credited. If the process stopped in between, the request stayed "refunded" with nothing credited, and a retry was refused because the request was no longer open, although the code's own comment promised a safe retry.
4. **Two wallet movements meeting on a unique key failed.** A member's first two wallet movements at once both tried to create the wallet account, and the same idempotency key sent twice at once both tried to record it; the loser threw a database error instead of an answer. On a brand-new wallet this is what stopped fault 2's second credit, leaving a request recorded as refunded that was not.

## Behavior

- **One lock per order.** Opening a request and deciding a refund amount both run in a transaction that first locks the order row (`SELECT … FOR UPDATE` on PostgreSQL; SQLite serializes writers). The second of two simultaneous submissions sees the first one's request and is refused as "a request is already open". The second of two simultaneous refunds sees the first one's refund and is clamped to what is left, or refused when nothing is.
- **The amount and the claim are decided together** under that lock, from the refunds of the order's other requests as they are at that moment.
- **An interrupted refund can be finished.** A request marked refunded with an amount but no wallet movement is completed by the same refund call, at the amount it had claimed. The wallet credit is keyed by the request, so it is paid once. The order worker does this automatically for requests claimed at least ten minutes ago (`recoverInterruptedRefunds`); one that fails is logged and tried again.
- **A missing record is repaired without side effects.** If the credit turns out to have been made already, only the reference to it is stored: the order-level effects (order state, restock, seller share, club points) are not repeated, because it cannot be told from there whether they ran, and repeating them could restock twice. That case is logged for review.
- **Wallet movements that collide on a unique key are run again** (up to twice): the account then exists, and a repeated key is answered from the recorded movement.

No schema change, no API change.

## Owner

`store` owns returns; `wallet` owns movements. The recovery runs in the existing order worker.

## Acceptance

Real PostgreSQL on two connections with the real wallet: two first movements and one key twice; double cancel (one request, one refund, order refunded); two requests refunded together; partial then full; a finished refund not paid again; an interrupted refund failing, then finished once with its effects; a refund younger than ten minutes left; a missing record repaired without paying or restocking. Each of faults 1 to 3 shown on `main` (`RETURN_REFUND_BASELINE`, `RETURN_REFUND_SKIP`). Worker step test, TypeScript, architecture, source, security and money checks, production build.

## Not in this slice

Orders already refunded twice, or requests recorded as refunded without a credit, before this change. The second kind is finished automatically by the worker; the first kind is not detected here. They show as an order whose refunded requests sum to more than its total.
