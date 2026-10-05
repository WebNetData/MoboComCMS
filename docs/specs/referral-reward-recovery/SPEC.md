# Referral rewards that were owed but never paid

## Audit

A member who signs up through a referral link is attributed to the referrer (`ReferralAttribution`). The referrer earns a share of the referred account's **first** paid purchase, credited to their wallet once (the wallet movement is keyed by the attribution).

The reward was attempted only in the moment that first purchase settled, after the payment transaction, and a failure was logged and dropped. Any later purchase was refused as "not the first". So whenever that single attempt did not complete (the wallet credit failed, or the process stopped between settling the payment and paying the reward) the reward was lost for good. Reproduced on `main` with the connected script.

A second, smaller gap: the wallet credit and the mark on the attribution are two writes. If only the first happened, the attribution looked unpaid forever, although the money had been credited.

## Behavior

- The reward still belongs to the referred account's first settled purchase and is still paid once. What changed is when it can be paid: whichever event brings us to an attribution that is still owed, the reward is computed from that first purchase and credited under the attribution's key. A later purchase by the same account therefore makes good a reward that was missed, at the first purchase's amount.
- The order worker has a step, `recoverReferralRewards`, for accounts that never buy again. It looks at accounts with a purchase paid in the last 14 days and settles the attributions among them that are still owed. Referred accounts that never bought anything are not looked at. Every owed attribution among the recent buyers is visited, in pages, so ones that can never be paid do not hide the ones that can; one failure is logged and does not stop the others or the rest of the worker.
- An attribution that was credited but not marked is marked on the next visit without a second payment.
- Unchanged: a first purchase without an order earns nothing; self-referral earns nothing; the percentage is the one stored on the attribution at sign-up.

No schema change, no API change.

## Owner

`referrals` owns attribution and reward; `wallet` is used through its existing idempotent movement; the step runs in the existing order worker next to the other payment recoveries.

## Acceptance

Real PostgreSQL with the real wallet: first purchase pays once, repeated event and second purchase pay nothing more; missed reward made good by a later purchase at the first purchase's amount; failed credit then recovery by the worker step, with the failure counted while it lasts; first purchase without an order; an account that never bought; credited-but-unmarked repaired without paying again; a purchase outside the window not scanned. Fault shown on `main` (`REFERRAL_BASELINE`). Job step test, TypeScript, architecture, source, security and money checks, production build.

## Not in this slice

Rewards lost before this change for accounts whose last purchase is older than 14 days: they are paid the next time that account buys, or by running `recoverReferralRewards` once with a longer window, which is left to the owner.
