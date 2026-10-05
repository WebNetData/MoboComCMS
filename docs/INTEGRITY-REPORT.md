# Integrity report

`npm run integrity:report` lists records that the money and entitlement fixes of October 2026 (pull requests #83 to #92) could not repair by themselves, because what to do with each is a business decision. It **only reads**: it changes nothing, and it is safe to run against production.

```
node --env-file=.env scripts/integrity-report.cjs            # text
node --env-file=.env scripts/integrity-report.cjs --json     # every record, machine-readable
node --env-file=.env scripts/integrity-report.cjs --days=90  # how far back the time-bounded findings look (default 365)
```

Each finding prints a count and up to 20 records. A finding stops scanning at 5,000 rows and says so.

| Finding | What it means | What happens by itself | What needs a decision |
| --- | --- | --- | --- |
| Orders refunded for more than their total | The refunded requests of an order sum to more than the order total (a double refund before #86) | Nothing | Whether to take the excess back from the customer's wallet |
| Refunds recorded without a wallet credit | Marked refunded, amount set, no wallet movement | The order worker credits it once, ten minutes after the claim | Only if it stays listed: the wallet credit keeps failing |
| Gift cards issued more than once for one purchase | Several cards share one purchase; one wallet debit paid for them (before #83) | Nothing | Which card to disable, if any is still unused |
| Gift cards redeemed without a wallet credit | The card is used, its value never reached the wallet | The member can enter the code again and receives it once | Whether to credit it for them |
| Referral rewards owed and not paid | The referred account has a paid purchase, the referrer was not rewarded | The worker pays it for purchases of the last 14 days; a later purchase pays it otherwise | Whether to run the recovery once with a longer window |
| Delivered seller sales missing from the seller ledger | The seller was not credited for a paid, delivered line | A scheduled job records the last 3 days | Whether to run it once with a longer window |
| Sellers with more than one open payout request | Requests that together may exceed the balance (before #87) | Nothing | Reject all but one before paying |
| Paid orders whose VIP gift days were not granted | The gift that came with the purchase is missing | A scheduled job grants the last 3 days | Whether to run it once with a longer window |
| Void invoices that still hold wallet credit | Reserved credit was not given back | The order worker gives it back once, ten minutes after the void | Only if it stays listed |
| Wallet renewals that never finished | `charged: true` means the customer paid and was not renewed | A scheduled job settles charged ones and closes uncharged ones among the most recent orders; a customer retry finishes it too | Older charged ones |
| Reseller sales provisioned for the wrong user | The account of the sale is owned by someone other than the customer the sale names (recovered before #91) | Nothing | Move or recreate the account for the customer |
| Club points taken without wallet credit | Points were redeemed, no credit and no undo | The marketing job finishes the last 7 days | Older ones |
| Paid orders with no fulfillment job | Paid and never queued for delivery | The order worker queues the most recent ones | Older ones |

The longer windows are arguments of the recovery functions (`recoverReferralRewards(days)`, `recoverMarketplaceSales(days)`, `recoverGiftMemberships(days)`); running them with a larger value is a write and is left to the operator.

`scripts/integrity-report.connected.cjs` (part of `npm run test:pg`) plants one record per finding with a healthy twin and checks that the report finds the first and not the second, on a database client that refuses every write.
