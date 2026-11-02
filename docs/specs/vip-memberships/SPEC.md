# VIP memberships

## Outcome and owner

Owner, 2026-11-03: VIP developed to the level of MemberPress, Restrict Content Pro, WooCommerce Memberships, Paid Memberships Pro and Paid Member Subscriptions, with an attractive design.

Owner: `membership`. It extends the existing plans, periods, member prices, gift days, perks and `access = 'MEMBERS'` marks. Payment stays with Checkout and Billing, coupons with Promotions, audiences with Account's site groups, messages with the inbox. VIP stays a switchable module; `defaultEnabled: false` is unchanged.

## What the five plugins offer, and where it stands

| Capability | State |
|---|---|
| Membership levels with an order | This batch: `MembershipTier` with a rank; a plan is one price of a tier |
| Durations, lifetime, fixed end date | This batch: `billing` DAYS, LIFETIME, FIXED |
| Free or paid trial, signup fee | This batch, one trial per person per tier |
| Pay what you want, limited places, hidden plans | This batch |
| Coupons for a chosen plan | This batch: `Promotion.membershipPlanId` |
| Upgrade with proration | This batch: unused value of paid periods is credited |
| Downgrade | This batch: a lower tier starts when the current period ends |
| Renewal, cancel at period end | This batch: wallet auto-renew. Iranian gateways have no stored-card charge, so a card cannot renew by itself |
| Reminders, expiry and win-back messages | This batch, through the inbox, so also SMS, email and push |
| Content by tier, drip content | This batch: `MembershipRule` per item |
| Member store discount, free shipping, no ads | This batch, per tier |
| Member area | This batch: `/vip/account` |
| Pricing page with comparison | This batch |
| Reports, member filters, notes, CSV export | This batch |
| Member-only products, per-group audiences | Already there (`access`, `audienceGroups`, `vip-plan:<id>`); this batch adds `vip-tier:<id>` |
| Teasers, paid single items, gift days with a purchase | Already there |
| Gift a membership, group seats | Next batch |
| CSV import, approval before activation | Next batch |
| Rules by whole category, per-tier download limits, restricted block in the editor | Next batch |
| Courses, affiliates add-ons | Not adopted: the site's own referral and section modules stand in for them |

## Actors and authorization

- `membership.manage` or `users.manage`: tiers, members, notes, reports, export. Plans keep `membership.manage` or `plans.manage`.
- A section's own permission or `membership.manage`: the rule on an item in that section.
- A signed-in member: only their own auto-renew, cancel, resume and free trial. A tier never gives Admin access.

## Data and compatibility

Additive migration `20270209120000_vip_memberships`. A plan with no tier is rank 1 and behaves as today. A period stored before this reads as `kind = PERIOD`, `amountMinor = 0`, so it earns no upgrade credit. Rollback: columns and tables stay unused and every stored period keeps working; rules and tier perks stop applying.

## Flows

- **Price:** decided on the server in `membershipQuote` (`planCharge`), never taken from the browser. An offered price is only ever raised to the plan's minimum.
- **Trial:** one per person per tier, for someone with no active period. A free trial needs no order; its dedupe key refuses a double claim.
- **Upgrade:** to a higher rank only. Credit is the unused share of paid periods, frozen at checkout on the order. Fulfilment grants a period starting now and then revokes exactly the periods credited, and repeats safely. A credit that covers the whole price is refused, not turned into a refund.
- **Stacking:** the same or a lower tier queues after the current end, so no day is lost.
- **Auto-renew:** within a day of the end, a wallet-only checkout with a key made of user and end date, so it cannot charge twice. Too little balance leaves a message and the member can pay by hand.
- **Refund:** refunding a membership order revokes its periods.
- **Rules:** a tier or drip rule is asked by the file gate and the article gate. A viewer given VIP by a site group counts as rank 1 with no drip wait.

## Admin and public UI

`/admin/vip`: dashboard with reports, members, tiers, plans, perks. A rule panel beside the audience panel in item editors. `/vip`: tiers, duration switch, comparison, coupon. `/vip/account`: status, renewal, cancel, history.

## Contracts and security

`/api/checkout` gains `membershipTrial` and `membershipOffer`. `/api/me/membership` gains POST. `/api/admin/membership/tiers` and `/rules` are guarded and audited. CSV cells are neutralized against formula injection.

## Acceptance

`scripts/vip-memberships.connected.cjs` on real rows through the real checkout: prices, trial once, upgrade credit, stacking, refund, auto-renew once, rules, tier perks. Breaks that must fail it: a trial claimed twice, a refund that keeps the period, a renewal that charges twice. Unit tests in `scripts/content-controls.test.cjs`. Browser journey at 1440 light and dark and 390.
