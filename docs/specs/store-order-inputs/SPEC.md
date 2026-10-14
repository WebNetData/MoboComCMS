# Orders that need something from the buyer, paying a foreign site, and staff-opened tickets

Three requests of the owner (2026-10-13) that share one need: the shop sells services a member of staff carries out by hand, and to carry them out the staff needs information from the buyer — before the purchase (account details), and sometimes after it (a one-time code).

## Audit (what exists)

- **FX pricing** (`fx`): a product can follow a foreign cost — `pricingMode = FX`, `fxCurrency`, `fxAmountMinor`, `markupBps` (percentage), `markupFixedMinor` (fixed profit in the selling currency) — priced from the rate source set in the admin (`fxPrice`, `fxBreakdown`). The cost is set by the staff, per product or variant.
- **Encryption at rest** (`catalog/server/digital-delivery.ts`): AES-256-GCM under `STORE_DELIVERY_KEY`, used for what the staff hands to the buyer.
- **Cart and checkout** (`store`, `checkout`): a cart line is product + variant + quantity; checkout snapshots lines into `OrderLine`. Neither carries anything typed by the buyer.
- **Tickets** (`support`): a customer opens a ticket; staff with `tickets.handle` answer. Staff could not open one.

## Slice 1 — staff open a ticket to a customer (built)

- `POST /api/admin/tickets` `{ user, subject, message, department?, priority? }`, permission `tickets.handle`, and the department must be one the member of staff handles. `user` is an account number, or the exact e-mail or phone of one account; no match or more than one is refused.
- The ticket is the customer's (`userId`), born `PENDING` (answered by support, waiting for the customer), assigned to the member of staff, its first message `fromAdmin`. The customer is told in their inbox; their answer returns it to `OPEN` through the existing reply path.
- A department that hangs a ticket on a subscription or a purchase cannot be used (there is nothing to hang it on).
- Desk: "new ticket to a customer" on `/admin/tickets`; `?new=1&user=…&subject=…` opens it filled in, and the order page links there.
- The message goes through `sanitizeMessage` like every ticket message. The action is audited (`ticket.open_for_customer`).

## Slice 2 — a product asks the buyer for information (built)

- **Outcome.** A product (for instance "ChatGPT Plus") lists the information an order needs — fields with a label, a kind (text, long text, secret, address of a site, e-mail), required or not — and each field may be limited to some of the product's options ("on your own account" asks for the login; "ready-made" asks for nothing). The buyer fills them on the product page; they travel with the cart line into the order.
- **Data.** `Product.orderFields` (validated JSON), `CartLine.inputs` and `OrderLine.inputs` (encrypted JSON of label, kind and value — the labels are a snapshot, so a later edit of the product does not relabel an old order). Additive migration.
- **Who sees it.** The buyer sees their own answers with secrets masked. Staff with `orders.manage` see them on the order; showing a secret is a deliberate click and is audited. Nothing else (lists, exports, notifications, logs) carries the values.
- **Erasure.** Staff can erase the answers of an order line at any time (`erase-inputs`, audited, with a hidden timeline entry). All answers are erased by themselves seven days after the order is delivered, cancelled or returned, or after an order that was never paid (`eraseFinishedOrderInputs`, a step of the fulfilment worker). The owner accepted this default on 2026-10-13.
- **Where it lives.** Rules: `src/modules/store/domain/order-inputs.ts` (pure). At rest: `src/modules/store/server/order-inputs.ts` (the same key and cipher as digital deliveries). The admin edits the fields in the product editor (`OrderAsk.tsx`); the buy box renders them for the chosen option; `POST /api/admin/store/orders/:id` has `reveal-inputs` and `erase-inputs`.
- **Limits.** A product that asks something, or has a typed amount, is bought through the cart only (the direct purchase and the Telegram purchase answer `INPUT_REQUIRED` / `OPEN_AMOUNT`). Adding it to the cart again replaces the answers. Sellers of the marketplace cannot define order fields or an open amount (their allow-list does not carry them). Options without attributes of their own are told apart by name.
- **Invariants.** Checkout refuses a line whose required answers are missing; a guest cart keeps its answers through the sign-in merge; two lines of the same product and option are one line with one set of answers.

## Slice 3 — paying a foreign site with a Visa card (built)

- **Outcome.** A service product whose amount the buyer types in dollars or euros. The page shows the cost in toman at once — amount × the rate of the admin's source, plus the product's percentage, plus its fixed profit (the same three numbers FX products already use) — and the buyer adds the address of the site, their username and password there and any note (slice 2 fields).
- **Data.** An "open amount" flag on the product with a minimum and a maximum; the typed amount and the rate used are stored on the order line, so the order shows how its price was reached.
- **Invariants.** The server recomputes the price at checkout from the stored amount and the current rate; a rate that moved between the page and the payment changes the price before the buyer pays, never after. A locked or missing rate refuses the purchase.
- Staff with `orders.manage` carry the payment out and mark the order delivered, as with any hand-delivered product.
- **As built.** `Product.openAmount`, `openCurrencies`, `openMinMinor`, `openMaxMinor` (cents); it requires FX pricing and no variants. `POST /api/cart/quote` prices a typed amount for the page; the cart prices the line again on every read; checkout prices it once more and stores `openAmountMinor`, `openCurrency` and `openRate` on the order line. One per order line (quantity 1). A discount code is refused on an order with such a line (`PROMOTION_NOT_APPLICABLE`): the amount is money passed on, not a margin. The product's own "foreign price" is only the sample shown on product cards.

## Acceptance

Slices 2 and 3 were run in a browser on the local preview (40 checks): saving both products and reading them back; an open amount without FX pricing refused; the own-account option refused without its password and the ready-made one accepted; direct purchase refused; the quote refusing an amount below the minimum, above the maximum, in a currency not offered and a non-number; 100 USD priced as rate + 5% + 150,000; the page showing only the fields of the chosen option, no direct-purchase button, no quantity stepper; the cart pricing the line from the typed amount, never returning the password, holding the service at one; a discount code refused; the order placed; the customer seeing masked answers; staff getting the amount, the rate and masked answers; a customer unable to reveal; one click revealing to staff; erasing one line only. Unit tests cover the rules; not run: a paid order through to delivery, the seven-day automatic erasure against a database, and the Telegram purchase path.

Slice 1 was run in a browser on the local preview: a visitor and a customer are refused; a ticket needs subject and message; an unknown customer is refused; the customer sees the ticket, is told in the inbox, cannot run markup from it, answers it and it returns as open; nobody else can read it; the desk form opens filled in from the link and sends.
