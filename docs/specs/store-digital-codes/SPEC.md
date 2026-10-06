# Digital goods that deliver themselves

## Audited evidence / scope
A real purchase was walked through in a browser on the running site: product page, cart, checkout, wallet payment, payment result. It worked without an error. What happened next did not match what the shop said: every virtual product carried "تحویل آنی" (instant delivery) on its card, its page, the cart, the checkout and the comparison table, while delivery was a staff member typing the code into each order by hand (`ProductDelivery.digitalDelivery`). There was no stock of codes at all, and the member's order page did not show a digital delivery; only the invoice page did. For a shop about to launch with gift cards and licences this is a promise it cannot keep and a job that does not scale.

## Outcome
A virtual product can have a pool of codes. With the pool on:
- a paid order receives its codes by itself, within seconds, and is marked delivered; the buyer is told through the existing "delivered" notice (which does not carry the code) and reads the codes on the order page, with a copy button, and on the invoice as before;
- the product can be sold only while a code is on the shelf: its stock is the number of codes on the shelf minus the units open orders already hold;
- the shop says "تحویل آنی" only for such a product while it has a code; every other virtual product says "تحویل دیجیتال" and, at checkout, that it is delivered in the account after the order is confirmed.
Products without a pool behave exactly as before.

## Ownership and data
- `ProductDigitalCode` (product, optional variant, encrypted secret, keyed fingerprint, order, order line, delivered time) and `Product.digitalMode` (`MANUAL` | `CODES`), migration `20261201120000_product_digital_codes`, additive; every existing product stays `MANUAL`.
- Store module: `src/modules/store/server/digital-codes.ts` (pool, delivery, buyer view) with pure rules in `src/modules/store/domain/digital-codes.ts`. Catalog module: `src/modules/catalog/server/code-stock.ts` (the stock rule), used by the inventory holds.
- Codes are stored with the existing delivery encryption (`STORE_DELIVERY_KEY`); a keyed fingerprint refuses the same code twice for one product. Staff see codes masked; the audit log never receives a code. A delivered code is readable by the member who bought that order, while the order is paid, and by nobody else.

## Rules
- Turning the pool on makes an empty pool out of stock, not unlimited. Turning it off returns the product to staff delivery without a stock limit; its codes are kept.
- Pasted codes: one per line; a repeat in the paste or a code the product already has is skipped and counted; a line with markup or over 500 characters refuses the whole paste, so no code is silently lost. A product with variants takes codes per variant.
- Nobody types the stock of such a product. It is recomputed, under the product's row lock, before every hold, after every change to the pool and by a worker step, so a stock value written by another screen cannot sell a code that is not there and two buyers cannot be promised the last one.
- Delivery runs in the existing delivery job and again whenever codes are added. Each line takes the codes it still misses (rows another delivery is taking are skipped, not waited for). A line is never given a code twice.
- An order of code goods only, fully served, is marked delivered with its codes as the digital delivery. An order that also holds other goods keeps its delivery open for them; its codes are the buyer's at once.
- An order paid while the shelf was empty stays open, gets one staff-only timeline note and appears in the integrity report; adding codes delivers waiting orders, oldest first.
- Orders staff delivered, cancelled or took back by hand are closed: they neither take codes nor hold stock (orders delivered by hand before a product got its pool must not empty it).
- A code on the shelf can be removed; a delivered one cannot. A product that holds codes is switched off instead of deleted.

## Acceptance
- `scripts/store.test.cjs`: parsing, masking, the delivery text, the "instant" rule, that no screen prints the promise without asking, the keyed fingerprint.
- `scripts/digital-codes.connected.cjs` in `npm run test:pg`, real PostgreSQL through the real inventory and order code: pool and encrypted storage, self-delivery once, two buyers and the last code (two database clients), an overwritten stock column, two paid orders and one code, refill, mixed orders, hand-delivered orders, variants, removal, mode switch.
- `scripts/integrity-report.connected.cjs`: the new finding and its healthy twin.
- Browser, running site: the owner turns the pool on and pastes codes (one repeated); an order that had waited for staff since before is delivered by that refill; the shop shows "instant" on that product and "digital" on a manual one; a member buys with the wallet and reads the code on the order page four seconds after pressing pay, copies it, at desktop and phone width; another member opening that order gets nothing.

## Deployment
`STORE_DELIVERY_KEY` (or `PANEL_CREDENTIAL_KEY`), 64 hex characters, must be set before codes can be stored; without it the admin section says so instead of failing. Run `npm run deploy:migrate`.

## Not included
Returning a delivered code to the shelf after a refund (a revealed code cannot be sold again), a pool managed by marketplace sellers, low-pool alerts to staff by SMS, importing codes from a file, and codes with an expiry date.

## Added: a code is replaced or sent back (2026-10-07)
- Storage: `returnedAt`, `returnId`, `returnNote` on `ProductDigitalCode` (migration `20261206120000_digital_code_returns`, additive). A returned code keeps its order; it counts neither as on the shelf nor as held by the buyer.
- Replace (staff, pool screen → latest deliveries): refused when the shelf of that variant is empty, when the code is not with a buyer, or when the order is no longer paid. The order's delivery text is written again from the codes held now.
- Send back (buyer, order page): only when `codeReturnDays` > 0 and within that many days of delivery; reasons "does not work", "was already used", "other"; no photos asked; staff approve and refund as with any return. Shipped goods of the same order keep their own window.
- Cancellation: with a code already read, the request waits for staff even when cancellations refund by themselves.
- Acceptance: `scripts/digital-codes.connected.cjs` (replacement, return off and on, partial refund, repeat, window, cancellation), `scripts/returns-invoice.test.cjs` (rules), ten deliberate breaks.
- Still not included: a pool managed by marketplace sellers, low-pool alerts by SMS, importing codes from a file.
