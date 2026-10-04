# Sign-in cart merge at the cart size limit

## Audit and owner

Store owns Cart/CartLine and the sign-in merge (`findCart` → `mergeInto`). Additions enforce `MAX_CART_LINES` (50), but the merge copied every guest-only line, so an owned cart could exceed the limit, and repeated sign-ins from fresh guest carts could grow it without bound. Checkout rejects a cart above the limit (`BAD_ITEM`), so the customer was left with a cart that cannot be bought and no explanation. The guest-cart-ownership spec forbids dropping guest lines silently to impose a limit.

## Behavior / compatibility

The merge moves guest-only lines into the owned cart oldest first until the limit is reached. A guest line whose product/variant is already owned is settled as before: the owned quantity wins. Lines that do not fit stay in the guest cart, which remains a guest cart with its token; nothing is deleted. Every later cart read retries the merge, so the waiting lines move as soon as the customer removes or buys lines. A guest cart is deleted only when all of its lines are settled.

While lines wait, a full owned cart is only read: no lock, no `updatedAt`/reminder change. The cart DTO gains an optional `waiting` count (absent when zero), and its `token` is the guest token while lines wait so the browser cookie keeps pointing at them; it returns to the owned token afterwards. Signed out, the same browser sees the waiting lines as its guest cart. The cart page shows one notice with the waiting count. The change is additive for existing clients; no migration, setting or URL change.

Owned carts that already exceed the limit from earlier merges are not shrunk; they receive no further guest lines until they are below the limit. Their lines are never removed automatically. The cart DTO reports optional `overLimit` (lines above the limit) and `blocked`, the cart page says how many lines to remove, and cart checkout answers `CART_FULL` (409) with that count instead of the generic checkout `BAD_ITEM`. Once trimmed, the cart checks out and takes waiting lines again.

## Acceptance

Reproduce the over-limit merge on real PostgreSQL against the previous revision. Check the limit, oldest-first order, owned-quantity duplicates, waiting lines and guest ownership, an untouched full owned cart, refill after removal, concurrent readers moving a line once, duplicate-only and empty guest carts, and the signed-out view. Actual HTTP: `waiting`, cookie token while waiting and after refill. Browser: notice at desktop and mobile widths without horizontal overflow. Existing ownership, cart-write and checkout-snapshot connected checks, scoped tests, TypeScript/source/architecture/security and build/CI before merge.
