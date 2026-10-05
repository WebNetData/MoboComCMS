# VIP gift days that were never granted

## Audit

A plan or product can carry VIP gift days (`vipGiftDays`). They are granted once, as a follow-up of the fulfillment job (`grantGiftForOrder`), and a failure there is only logged while the job completes. Nothing looked again, so a customer whose grant failed never received the gift they paid for. The same shape as the unrecorded marketplace sale (`docs/specs/marketplace-seller-money`).

## Behavior

A scheduled job (every five minutes) looks at paid orders of the last three days, at least ten minutes old, whose plan or product carries gift days, and grants the ones that have no gift period. The grant is idempotent per order (`gift:order:<id>`), so nothing is given twice. Orders that are not paid, carry no gift days, are younger than ten minutes or older than the window are left alone. One order that fails is logged and counted and does not stop the others. With the membership module off nothing is read.

No schema change, no API change. `membership` owns the grant and the job; it is registered in the existing scheduler.

## Acceptance

Real PostgreSQL: an ungranted gift given once and extending an existing period; an order already granted not granted twice; giftless, unpaid, young and old orders left alone; a failing order counted and recovered on a later pass; module off. TypeScript, architecture, source and security checks, production build.

## Not in this slice

Gifts lost more than three days before this change: the job can be run once with a longer window, which is left to the owner. The third follow-up of the delivery job, the store's sold counters and "paid" timeline event, is also only logged on failure; it carries no money or entitlement and was not changed.
