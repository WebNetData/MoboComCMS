# Private Store desk contract

These Admin APIs compose current module owners and are not a versioned public integration API. `src/modules/store/domain/counter-sales.ts` validates the sale input. Every response is private/no-store. The normal session, module, Origin and current permission guards remain authoritative; browser visibility grants nothing.

## Counter and register

`/api/admin/store/counter` requires Store and `orders.manage`. Transactional writes recheck the permission and write strict Audit in the same transaction.

| Method/selector | Input | Result |
| --- | --- | --- |
| GET `q` | bounded product search | active own-store physical/code products, variants, current prices/availability |
| GET `scan` | exact barcode, SKU, `MC-P-id` or `MC-V-id` | one eligible product/variant; ambiguous codes, missing generated IDs and namespace/SKU collisions fail |
| GET `labels=1`, optional `product`, `q` | valid integer product ID | printable product/variant barcode descriptors; no stock write |
| GET `customers` / `customer` | customer search / ID | active identity; authorized minimal purchase/repair history, wallet/club projection |
| GET `lookup` | mobile | read-only: `{customer}` of the one active canonical account, with its stored firstName/lastName, or `null`; ambiguous/inactive/stale alias fail409; creates nothing |
| POST `op: customer.resolve` | phone, optional firstName+lastName (or legacy name) | existing canonical account or a simple unverified account; duplicate-phone identities or stale phone-email aliases after a mobile change fail409 |
| GET `registers=1` | none | register summaries, live open balances, immutable closed counts and ownership |
| POST `op: register.open` | requestId, register, currency, openingCashMinor | own OPEN session; one open session per named register |
| POST `op: register.adjust` | requestId, sessionId, CASH/CARD, signed amountMinor, reason | audited immutable movement on own OPEN session |
| POST `op: register.close` | sessionId, countedCashMinor, countedCardMinor, optional note | locked expected/count/variance snapshot; same counts replay, altered counts conflict |
| POST `op: wallet.otp` | customerId | existing SMS OTP challenge bound to cashier/customer; normal resend/account limits apply |
| POST sale | UUID requestId, confirmed:true, sessionId, customerId/null, optional phone, customerFirstName, customerLastName (or legacy customerName), method, payments, walletCode, redeemPoints, lines | paid orderId and replay flag |
| GET `request` / `order` | actor's request UUID / counter order ID | committed-order recovery / strictly audited private receipt and assigned cards |
| GET `report=1&days=N` | 1–366 days | currency/channel totals, known-cost margin, separate refunds, employee receipts, bestsellers and low-stock candidates |

Each line names productId, optional variantId, quantity, expectedUnitMinor and validated order inputs. Each tender names CASH/CARD/WALLET, a positive integer decimal `amountMinor` string and reference. Methods cannot repeat; sums must equal the authoritative invoice exactly. CARD requires its terminal reference. Money never crosses currencies. A legacy CASH/CARD input without explicit tenders still produces the single exact tender, but a live owned register is required.

The cashier must obtain customer OTP proof before spending wallet or points. Proof, point conversion, wallet debit, invoice/payments, stock/codes, tenders, notification intent and audit commit together. Invalid attempts persist independently; a successful proof is consumed only in the successful transaction. Knowing the phone or having staff access is not proof. Conversion uses existing club settings and can leave extra wallet credit. Simple account creation never verifies the phone or authenticates its holder; ordinary verified login later claims that same identity.

Idempotency is actor+UUID+normalized payload fingerprint. A committed replay succeeds even after its proof has been consumed or register closed. Changed payload fails409. After an ambiguous response, retry the captured request or recover its UUID; do not infer failure from a later429/403. Session storage holds only the request UUID.

## Online collection

Existing checkout/cart payloads accept `shippingMode: PICKUP`. It is valid for a physical purchase only when existing Delivery settings enable collection with an address and the account has a valid mobile. It skips delivery-address/carrier/scheduled-shipping charges, retains the normal account/payment/stock owners and creates StorePickup atomically with the order. Existing delivery remains the default.

`/api/admin/store/pickup` requires `orders.manage` or `store.orders.handle`. Specialists retain existing order claim/assignee scope. GET returns their visible paid queue and whether the caller manages collection. POST accepts orderId and action:

- `ready`: WAITING→READY on a paid invoice, consumes the existing inventory reservation, queues deduplicated ready/code SMS and push. READY replay is harmless.
- `collect`: READY→COLLECTED with the customer’s six-digit code; then claims ProductDelivery→DELIVERED. Wrong proof increments attempts, ten wrong attempts lock collection. Concurrent collection has one winner. Handover never decrements stock a second time.
- `reissue`: manager only, READY only; rotates and encrypts the proof, invalidates the old code, resets attempts and queues a new notification. It never bypasses proof or changes collected goods.

The ordinary fulfillment transition cannot ship/deliver an uncollected pickup order. Refund/cancellation owners and immutable historical orders remain authoritative.

## Public receipt and failure boundaries

`/receipt/store/<48-hex-token>` is a rate-limited bearer receipt exposing invoice number, itemized amounts and status. It contains no gift-code values, mobile, wallet, pickup proof or device secrets. The private customer order shows a READY pickup proof only to its buyer. Repair QR links use the existing receipt token; the public status copy hides the private printed handover code.

Store SMS routing binds the persisted paid order/token/buyer and original phone. It cannot use an arbitrary inbox link to authorize an unverified recipient. Current notification opt-outs, global SMS setup, duplicate/day ceilings and queued delivery still apply. No receipt/card print action creates a sale, consumes inventory or contacts a provider.

Expected failures:400 invalid fields/amounts/proof;403 authority or handover proof;404 disabled module/missing resource;409 price/stock/register/identity/state/idempotency conflict;429 strict limits;503 bounded serialization exhaustion. Unknown infrastructure errors are not converted into paid success. Financial rows and register snapshots retain database constraints and expected-state claims.
