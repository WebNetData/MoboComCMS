# Store: shop front design (2026-10-27)

**Owner request:** make the shop's first page and a category's product page look professional, advanced and attractive, like a large Iranian shop (Digikala). The single product page is approved: «صفحه محصول تک الان عالیه». It is out of scope and unchanged.

## Done

Branch `feat/shop-storefront-redesign-2026-10-27`; the decision is recorded in PLATFORM_DECISIONS §6B «the shop front».

**Landing:** `src/components/store/ShopHome.tsx`
- `ShopHero`: the welcome with a product stage, or the slider; beside it the deal and the newest product.
- `QuickRoutes`, `CategoryGrid`, `TopSellers`.
- These are composed in `src/modules/catalog/server/pages/products/page.tsx` (`Landing`).

**Listing:** in the same page (`Listing`):
- the banner (`.sx-lhero`);
- sub-categories with pictures and counts;
- quick filters (`.sx-qf`), built from `shopQueryString`;
- the toolbar count.

**Styles:** `src/app/store-shop.css`, loaded after `store-pro.css`. Everything is scoped to `.sx-landing` / `.sx-listing` or uses new classes. `.sx-offers.is-few` is the only change to a shared block.

**Evidence:**
- tsc;
- React Doctor;
- `.mobocom/claude-tools/pw-shop-front.cjs`: 18 checks, including axe at 1440 light/dark and 390, and no phone overflow;
- screenshots via `.mobocom/claude-tools/shot-shop.cjs`.

## Notes

- A price range is not shown in the listing banner: a category can mix currencies (USD demo products beside Toman ones).
- The landing's stage and side cards need product pictures. Without them, they fall back to an icon tile.

## Possible next slices

- Done since: **two stores and advanced filters** (branch `feat/shop-two-stores-2026-10-27`). Evidence in `.mobocom/claude-tools/pw-shop-stores.cjs`; the decision is in PLATFORM_DECISIONS §6B. Not covered yet:
  - facets on variant attributes (colour or size per variant);
  - a price slider;
  - filters inside the mobile drawer applying while it stays open (they apply and reload the page).

- Free-shipping hint on tiles and in the hero once PR #256 (free shipping rules) is merged.
- Recently viewed products on the landing (per browser).
- Category-level banners managed in Admin, if the owner wants different art per category.
