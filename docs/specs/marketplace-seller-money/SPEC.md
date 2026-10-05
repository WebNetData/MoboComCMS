# Marketplace: seller payouts and unrecorded sales

## Audit

Sellers earn each sale minus commission into a ledger (`SellerLedger`) and withdraw through payout requests that staff pay by bank transfer (`SellerPayout`). Two faults.

1. **Two payout requests at once reserved more than the seller had.** A request checked "no open request" and "amount within the available balance", then created the payout and its reserving ledger entry in a transaction that did not include those checks. Two requests in the same instant both passed: two open requests, together above the balance, each waiting for staff to pay it. Reproduced on `main` with the connected script (two open requests of 80,000 against a balance of 100,000).
2. **A sale that failed to record was never credited.** The seller's share is written once, as a follow-up of the delivery job, and a failure there is only logged while the job completes. Nothing looked again, so the seller was never credited for a paid, delivered order.

## Behavior

- A payout request checks the "one open request" rule and the balance inside its transaction, under a lock on the seller row (`SELECT … FOR UPDATE` on PostgreSQL; SQLite serializes writers). The second of two simultaneous requests is refused as "a request is already open". Amount rules, rejection and payment are unchanged.
- A scheduled job (every five minutes) finds seller lines of paid, delivered orders from the last three days, at least ten minutes old, that have no sale entry in the ledger, and records those orders through the ordinary recorder, which is idempotent per line. Orders that are not paid, not delivered, younger than ten minutes or older than the window are left alone. One order that fails is logged and counted and does not stop the others. With the marketplace module off nothing is read.

No schema change, no API change.

## Owner

`marketplace` owns the ledger, payouts and both changes; the job is registered in the existing scheduler.

## Acceptance

Real PostgreSQL on two connections: two simultaneous payout requests leave one open request and reserve its amount only; a further request is refused while one is open; after a rejection the money can be requested again and an amount above the balance is still refused. Sale recovery: an unrecorded delivered sale credited once with sale and commission and the sales count; an order already recorded not recorded twice; young, old, undelivered and unpaid orders left alone; a failing order counted and recovered later; module off. Payout fault shown on `main` (`MARKETPLACE_BASELINE`). Marketplace unit tests, TypeScript, architecture, source, security and money checks, production build.

## Not in this slice

Sales lost more than three days before this change: `recoverMarketplaceSales` can be run once with a longer window, which is left to the owner. Pairs of open payout requests that already exist are not detected. The two other follow-ups of the delivery job (store sale counters and gift membership) are also only logged on failure and were not changed here.
