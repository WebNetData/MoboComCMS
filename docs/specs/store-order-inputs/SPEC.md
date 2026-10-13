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

## Slice 2 — a product asks the buyer for information (next)

- **Outcome.** A product (for instance "ChatGPT Plus") lists the information an order needs — fields with a label, a kind (text, long text, secret, address of a site, e-mail), required or not — and each field may be limited to some of the product's options ("on your own account" asks for the login; "ready-made" asks for nothing). The buyer fills them on the product page; they travel with the cart line into the order.
- **Data.** `Product.orderFields` (validated JSON), `CartLine.inputs` and `OrderLine.inputs` (encrypted JSON of label, kind and value — the labels are a snapshot, so a later edit of the product does not relabel an old order). Additive migration.
- **Who sees it.** The buyer sees their own answers with secrets masked. Staff with `orders.manage` see them on the order; showing a secret is a deliberate click and is audited. Nothing else (lists, exports, notifications, logs) carries the values.
- **Erasure.** Staff can erase the answers of an order at any time. *Proposed default, to be confirmed by the owner:* secrets are erased automatically seven days after the order is delivered or cancelled.
- **Invariants.** Checkout refuses a line whose required answers are missing; a guest cart keeps its answers through the sign-in merge; two lines of the same product and option are one line with one set of answers.

## Slice 3 — paying a foreign site with a Visa card (after slice 2)

- **Outcome.** A service product whose amount the buyer types in dollars or euros. The page shows the cost in toman at once — amount × the rate of the admin's source, plus the product's percentage, plus its fixed profit (the same three numbers FX products already use) — and the buyer adds the address of the site, their username and password there and any note (slice 2 fields).
- **Data.** An "open amount" flag on the product with a minimum and a maximum; the typed amount and the rate used are stored on the order line, so the order shows how its price was reached.
- **Invariants.** The server recomputes the price at checkout from the stored amount and the current rate; a rate that moved between the page and the payment changes the price before the buyer pays, never after. A locked or missing rate refuses the purchase.
- Staff with `orders.manage` carry the payment out and mark the order delivered, as with any hand-delivered product.

## Acceptance

Slice 1 was run in a browser on the local preview: a visitor and a customer are refused; a ticket needs subject and message; an unknown customer is refused; the customer sees the ticket, is told in the inbox, cannot run markup from it, answers it and it returns as open; nobody else can read it; the desk form opens filled in from the link and sends.
