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

Rollback disables the counter entry/command while retaining the additive schema and expanded buyer-aware readers. After guest rows exist, code that requires every buyer relation cannot be restored safely. Schema rollback or deleting sales is outside ordinary code rollback. Existing paid-order returns/refunds remain the financial owners.

## Unified store desk — owner expansion 2026-11-12

The owner now requires mobile-based customer lookup/simple account creation, shared online/counter/repair history, loyalty and wallet earning/spending, split cash/card/wallet payment, daily cashier reconciliation, online store collection with a one-time handover code, barcode labels/scanning, invoice/repair QR links, transactional invoice/ready SMS and combined sales/profit/low-stock reporting. Continue the existing open PR448 and owners; this changes the earlier guest-only default when a mobile is supplied. A sale with no phone can still remain a guest.

### Actors, ownership and invariants

- Identity owns normalized mobile resolution and simple canonical customer creation. Staff-entered numbers are not marked verified and do not authenticate anyone; existing OTP login claims the same simple account after actual proof. Ambiguous legacy numbers are refused rather than merged or guessed. Forms links repair intake to the same canonical customer when its mobile is available; CRM Contact is never an authentication identity.
- Wallet and customer-club owners provide transaction-aware movement/redemption/earning; no second balances or points engine. Spending requires a fresh single-use customer OTP bound to the cashier, customer and requested operation. Failed verification consumes its attempt outside a rolled-back sale; successful proof is claimed inside the financial transaction. A failed sale cannot lose money, points or proof. Guest wallets are forbidden. Exact tender amounts must sum to the invoice, with card reference required for card amounts.
- Store owns register sessions and immutable tender allocations. A register has at most one OPEN session; payment and close lock/claim that same session, fencing late sales. Opening cash, cash/card expected/counted values, differences and employee totals are persisted at close. Existing refunds remain Billing/Returns actions; drawer adjustments are explicit audited movements, not inferred from a wallet refund or a rewritten closed session.
- Shipping owns opt-in collection settings/address. Existing online checkout reserves the same inventory, charges no shipping/address requirement for collection and records its delivery mode. Store owns WAITING/READY/COLLECTED handover data beside existing ProductDelivery; paid and ready claims plus the correct code are required, with bounded attempts, strict limits, audit and one-time concurrent consumption. Pickup never deducts stock twice or bypasses order-work permissions. Customer SMS uses existing durable notification jobs/templates/providers.
- Catalog owns barcode and nullable acquisition cost inputs. Labels encode an exact product/variant identity or saved barcode; ambiguous scans refuse. Order lines freeze nullable unit costs for online and counter sales; historical unknown cost is reported as unknown, never zero or current cost. Reports retain currencies, channel and refunds; they must not claim net accounting profit where costs are unknown.
- Existing receipt owners generate QR data from cryptographic public receipt capabilities. Public projections expose sale/repair status and the minimal printable invoice, not private code-pool secrets, device locks, wallet values or a handover code. Public links are rate-limited/no-store/noindex; private print retains its existing audit. Staff can always reprint without creating another sale.

### Implementation and acceptance slices

1. Additive schema/manifest + canonical mobile customer + shared history + exact split payment/proof + register open/close and tests.
2. Existing notification/receipt QR and barcode labels/scanner; product cost fields and immutable line snapshots.
3. Opt-in online store collection, ready notification and code-verified one-time handover across checkout/Admin/customer views.
4. Combined channel/currency sales, known-cost margin and missing-cost counts, best sellers/low stock and cashier report.

Register connected scenarios for mobile reuse/account login continuity, duplicate/ambiguous lookup, wallet/points balance races and rollback, repeated/split sale, register close-versus-sale race, public receipt privacy, barcode exactness, pickup payment/state/code/concurrency/Origin/module guards and notifications dedupe. Run the real UI at1440/390 light/dark with axe, existing financial/repair regressions, full non-root/no-.env gate and bounded-worker production build. Preserve and update the original handoff with final executed evidence; use synthetic providers/printer output locally. No real customer messages, production deployment, merge or hosted workflow dispatch during development.

Expanded acceptance evidence: real PostgreSQL covers canonical identity/login and stale-alias refusal; scheduled redemption recovery cannot duplicate counter credit; missing/colliding barcodes never select another item; both delivery APIs enforce pickup proof. Actual24 compiled themed/responsive browser views passed axe/overflow/page-error checks, including direct and cart collection, printing, private/public QR boundaries and closing variance. Exact scope, native checks, final artifact seal, limits and rollback are maintained in docs/agent/handoffs/STORE_COUNTER_SALES.md.
