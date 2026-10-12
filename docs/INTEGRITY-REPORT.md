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
| Paid orders waiting for a digital code | The product delivers codes from its own pool and had none left when the order was paid | Adding codes to the product delivers the waiting orders at once, oldest first | Add codes, or deliver the order by hand and refund if the code cannot be supplied |

The longer windows are arguments of the recovery functions (`recoverReferralRewards(days)`, `recoverMarketplaceSales(days)`, `recoverGiftMemberships(days)`); running them with a larger value is a write and is left to the operator.

`scripts/integrity-report.connected.cjs` (part of `npm run test:pg`) plants one record per finding with a healthy twin and checks that the report finds the first and not the second, on a database client that refuses every write.

## Repository payments and local archives

Default output also includes the three Repository purchase findings (unfulfilled, ambiguous, invalid). Their bounded scan covers all payment dates; continue with `--after-repository-payment=<id>`. Review a historical payment in Repository Admin, with the existing Repository and finance permissions. The report never executes recovery.

Filesystem diagnosis is explicit, local and read-only. Run from the deployed application directory, on the host/container that actually holds `storage/repository`:

```sh
node scripts/integrity-report.cjs --json --repository-files --repository-file-limit=250
node scripts/integrity-report.cjs --json --repository-files --verify-repository-hashes
node scripts/integrity-report.cjs --json --repository-files --after-repository-release=123 --after-repository-file=<uuid.zip>
```

With filesystem inspection enabled, four additional findings cover unreferenced, missing, unsafe/unavailable and size/checksum mismatch observations. Default findings stay at17; opt-in adds4. `--verify-repository-hashes` is optional and requires `--repository-files`; otherwise equal size does not prove equal content. Only valid archive filenames are opened, never configuration/documents or symlink targets. Files above the3MiB inspection ceiling are unverified (`inspection-size-limit`), not declared invalid. Permission/read errors and changes during observation remain uncertain. A missing directory with existing release rows is reported; on an empty deployment the directory may simply not have been created yet.

`coverage` records the directory state, inspected counts, ignored/visited names, checksum mode, page limits/caps and separate release-ID/filename cursors. Each page is1–500 records/names (default250). Directory names are streamed completely to retain only the smallest page candidates; directory traversal time is not bounded by the page limit, but retained candidates and opened files are bounded. When `continuation` is present, pass both of its cursor fields on the next call, retaining the completed stream's last position while the other continues. An empty capped page of findings does not prove a clean directory/database. Concurrent changes can shift observed pages; this is not an atomic filesystem/database snapshot.

The same inspector is available to authorized administrators through `GET /api/admin/repository?view=archives`, with `limit`, `afterReleaseId`, `afterFileId`, and `verifyHashes=true`. Authority is checked before and after observation. The response always has `mutationAllowed:false`; a filename or finding never grants file deletion or restoration authority. No automatic cleanup follows the report. Durable upload fencing and reviewed quarantine/restore controls remain the next recovery steps; see [recovery specification](specs/repository-archive-recovery/SPEC.md).
