# Customer club: point redemptions that never reached the wallet

## Audit

A member turns club points into wallet credit (`redeemPoints`). The points are taken and a `REDEEM` ledger entry is written in one transaction; the wallet credit follows as a second step, keyed by that entry. When the credit fails the request gives the points back. When the process stops between the two steps, nothing does: the points are gone, the wallet was never credited, and no job looked for this state. The same shape as the gift-card redemption fixed in `docs/specs/gift-card-integrity`.

## Behavior

The marketing jobs (every minute) get a step, `recoverPointRedemptions`:

- it looks at `REDEEM` entries of the last seven days that are at least ten minutes old, so a request still in flight is left to finish or undo itself;
- an entry whose wallet credit exists, or that was undone, is settled and skipped;
- for the rest the wallet is credited under the entry's own key, so nothing is ever paid twice, at the points' current wallet value;
- when points no longer have a wallet value (the conversion was switched off), the points are given back instead, once;
- one entry that fails is logged and counted, and does not stop the others or the other marketing jobs.

## Data and compatibility

Additive migration `20261128120000_loyalty_entry_kind_index`: an index on `LoyaltyEntry(kind, createdAt)` so the step does not read the whole ledger every minute. No API change.

The credit uses the conversion value in force when the recovery runs, not the one at the time of the redemption (the entry does not record it). Redemptions interrupted more than seven days before this change are not looked at.

## Owner

`store` owns the club ledger; `wallet` is used through its existing idempotent movement.

## Acceptance

Real PostgreSQL with the real wallet: a complete redemption and one undone by its own request left alone; an interrupted one credited once; one younger than ten minutes and one older than a week not touched, the young one picked up later; a failing credit counted and retried; valueless points returned once and not credited afterwards; two simultaneous full refunds of one order reversing exactly what was earned, a repeated refund key, and a partial then full refund. TypeScript, architecture, source, schema, security and money checks, production build.

## Refund reversals (same change)

Taking back the points of a refunded order read the order's ledger entries and then wrote the reversal as separate steps. Two refunds of one order processed at the same moment each saw "nothing reversed yet" and together took back more points than the order had earned. The reversal now runs in one transaction that first takes the member's account row, so the second refund waits and then sees the first one's reversal. A repeated call for the same refund still records nothing new.
