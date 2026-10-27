# Store: advanced shopping features (2026-10-27)

Owner request: the store should have the features of a professional shop like Digikala, for example "orders over 5,000,000 Toman ship free inside Qaemshahr". The shop home and the category listing should be redesigned to look professional and attractive. The single product page is approved as it is and must stay.

## Done

**Free shipping rules**, branch `feat/free-shipping-rules-2026-10-27`. Decision recorded in PLATFORM_DECISIONS §6B.
- Domain: `src/modules/shipping/domain/carriers.ts` (`FreeShippingRule`, `normalizeFreeRules`, `freeRuleFor`, `freeShippingOffers`, `quote().freeBy`).
- Cart: `src/modules/store/server/cart.ts` (`freeShipping`), `src/components/store/CartPage.tsx` (`FreeShippingProgress`).
- Checkout: `src/components/store/CartCheckout.tsx` (`.sh-free-by`).
- Admin: `src/app/admin/shipping-carriers/FreeRules.tsx` on the carriers page. Dates use the shared Persian picker.
- Evidence:
  - `scripts/shipping-carriers.test.cjs`;
  - browser script `.mobocom/claude-tools/pw-free-shipping.cjs`, which checks the admin, trial quote, cart and checkout, runs axe, and puts back settings and fixtures.
- Also fixed on the way, found by axe:
  - the cart image link without a name;
  - the contrast of the upcoming checkout step and of grey text on the selected carrier.
- **Owner action:** at `/admin/shipping-carriers`, set the origin to مازندران / قائم‌شهر and turn carriers on. The default is Tehran and off.

## Audit: what already exists

Wishlist, compare, reviews, variants, bundles, coupons, VIP prices, digital codes, returns, delivery slots, carriers, invoices and abandoned-cart reminders all exist. Treat these as present, not as gaps.

## Next slices

1. Shop home (`/products` without filters): a richer storefront. It is built from existing owners only (categories, brands, featured/discounted/new rails, store settings).
2. Category listing: a better header, filters and product grid. The product card must stay consistent with the approved product page.
3. Optional:
   - recently viewed products (per browser);
   - free-shipping hints on product cards;
   - cashback to the wallet.
