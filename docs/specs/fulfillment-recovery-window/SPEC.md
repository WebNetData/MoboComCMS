# Fulfillment recovery: no fixed window, and the store's sale record

## Audit

1. **A paid order could be hidden from its own recovery.** The order worker recovers paid orders that have no fulfillment job. It read the 500 newest paid invoices and looked for uncovered orders among them. On a site with more than 500 newer paid invoices, all already fulfilled, an older paid order without a job was never seen again. The same fixed-window shape that was fixed in the other scheduled jobs. Reproduced on `main` with the connected script (520 newer fulfilled orders).
2. **A delivered order's sale record could stay missing.** The store's sale record (the product's sold count and the "paid" entry of the order's timeline) is written once, as a follow-up of the delivery job, and a failure there is only logged. This was the last of that job's three follow-ups without a recovery (the seller's share and the VIP gift days got theirs earlier).

## Behavior

- The recovery reads paid invoices newest first in pages of 500, up to six pages per run, and stops as soon as it has queued its per-run limit. A paid order behind any number of fulfilled ones within those pages is found. The per-run limit and the order (newest first) are unchanged.
- The order worker records the sale of delivered store orders that have no "paid" timeline entry, for deliveries created in the last three days and at least ten minutes old. Recording is guarded by that entry, so it happens once. Refunded orders are left alone.

No schema change, no API change.

## Owner

`fulfillment` owns the recovery; `store` owns the sale record; both run in the existing order worker.

## Acceptance

Real PostgreSQL: a paid order behind 520 newer fulfilled ones is queued; nothing is queued twice; the per-run limit holds, newest first. An unrecorded delivered sale is recorded once with its timeline entry and sold count; already recorded, young, old and refunded orders are left. Fault 1 shown on `main` (`FULFILLMENT_WINDOW_BASELINE`). Worker step test, TypeScript, architecture, source and security checks, production build.

## Not in this slice

A paid order older than six pages (3,000 paid invoices) without a job is still not found by the recovery.
