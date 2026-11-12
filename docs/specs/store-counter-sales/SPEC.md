# Store counter sales

Owner request 2026-11-12 includes gift cards taken from their product's code pool, a recorded sale, printed cards and reduced online inventory, plus physical goods. The owner explicitly requires buyers without an account.

## Existing owners and change envelope

Risk R3, Commerce/Data/Security/UI. Store owns the counter command, order history and print projection. Catalog owns stock reservation and code availability. Billing owns invoice numbers, invoice settlement and payment records. Identity and the existing Store module/Origin guards own access. The existing print page currently edits a transient card and records no sale.

Orders and invoices retain their current financial records and exact minor amounts. Their buyer relation becomes optional only for a COUNTER sale. Order stores the actual cashier relation and customer name/phone snapshots. Historical rows default to ONLINE and retain their buyer. A guest sale creates no account and cannot use wallet credit. The migration adds source/actor/customer columns and expands nullability with database checks. Existing account-only owners reject or skip guest-only actions explicitly.

## Counter flow and contracts

- `orders.manage` opens `/admin/store/counter`. Order specialists alone cannot record received money. GET `/api/admin/store/counter` supplies bounded searched product/variant choices and current server prices. Physical products and code-pool virtual products use their existing catalog records. A saved active product can be sold at the counter regardless of its public publication state.
- Staff select items/options/quantities, enter optional customer details or link an existing customer, choose cash/card, record an optional reference, review the total and explicitly confirm receipt of that amount. POST sends a persistent request UUID and expected exact prices. The server refuses stale quotes and unsupported product types or options.
- One transaction rechecks cashier authority, claims the request, creates the existing Order/OrderLine/Invoice/Payment records, reserves and consumes shared inventory, assigns the exact code-pool rows, records sale/delivery and audit. Failure rolls back the entire transaction. Repeat submission returns the same order only for the same actor and normalized request. Different payload reuse is409. Database serialization/deadlock retries are bounded.
- Counter code sales require immediately available codes even when online empty-pool sales go to staff. Existing online holds retain their claim. Two counter sales or an online checkout competing for the last unit produce one winner. Variants remain scoped to their product. Reprinting reads assigned codes and never takes another code.
- A private counter receipt displays the persisted invoice number, payment method, lines, amount and customer snapshot. Gift cards reuse the product's existing card design and each assigned code. Physical goods are handed over immediately and print an itemized receipt. Printer cancellation leaves the recorded sale available for reprinting.

## Acceptance and rollback

Register `scripts/store-counter.connected.cjs` with the PostgreSQL runner. Verify guest and linked-customer sales, money/stock/code atomicity, same-key races/replay, changed-key conflict, last-unit races with online holds, injected payment/audit/code failures, permissions/Origin/module-off and secret-safe list responses. Exercise actual desktop/mobile light/dark counter, receipt/cards and repeated print in a browser with axe. Run affected Store/Billing/Inventory tests, TypeScript, source/architecture/security/schema/manifest gates and a production build when practical. Record actual results in the Store handoff and workstate.

Rollback uses the prior app code with the additive schema retained. Guest rows require the expanded buyer-aware readers. Schema rollback or deleting sales is outside ordinary code rollback. Existing paid-order returns/refunds remain the financial owners.
