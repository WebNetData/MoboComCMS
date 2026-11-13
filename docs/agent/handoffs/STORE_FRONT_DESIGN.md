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

## Mobile category shopping — authorized 2026-11-14

Owner selected one mobile category-shopping slice through variant selection, cart, payment and the customer's order. Worktree `.mobocom/store-mobile-category`, branch `feat/store-mobile-category-2026-11-14`, from refreshed main `8dfdd63e`. Preserve the approved product-page design and existing Catalogue/Store/Identity/Shipping/Billing/Wallet owners. Existing price slider and variant facets are implemented; historical suggestions below are not a missing-feature inventory.

Source audit reproduced the mobile filter contract gap: hidden-checkbox/label controls lack a keyboard dialog contract, while checkbox/radio and slider changes submit immediately, closing the drawer after each choice. The authorized change gives mobile users a native dialog with draft selections, explicit Apply, draft-only Clear, Cancel/Escape, focus return and scroll locking. Apply keeps category/search/store/sort context in the canonical URL and resets pagination; Back/Forward must restore applied fields including the price slider. Desktop filtering and protected product layout remain. No schema, permission, money-state or payment-provider changes are planned.

Acceptance: real browser at 390 and 1440 light/dark with keyboard/focus, axe, no overflow; multi-filter draft/apply/clear/cancel, price changes and history restoration. Verify existing variant → cart → internal synthetic-wallet payment → own-order journey and cross-customer denial using task-owned PostgreSQL fixtures. No real gateway, SMS or customer data. Use the existing app container for an isolated test process/database; preserve the owner's localhost3000 runtime and restore/remove owned verification state. Record actual commands/results, failures and cleanup here when executed; this paragraph is a plan, not a passing check.

### Implemented and verified locally — 2026-11-14

- `src/components/store/ShopFilters.tsx` and the existing Catalogue listing use one native dialog and one server GET form. Mobile choices stay draft until Apply; Clear retains category/search/store/sort, Cancel/Escape/backdrop discards draft immediately, focus returns to the trigger, and the actions stay visible while content scrolls. Price controls and price presets obey the same draft/reset contract. Desktop remains an immediately applied nonmodal sidebar; changing between desktop and mobile does not strand the panel. Without client hydration the same form stays available inline.
- Applied navigation uses MoboCom's existing section-address router and a URL-keyed component; repeated brands/specs, price bounds and history restore agree. Browser inspection caught and corrected a native history/control mismatch and a close-event timing race during implementation. No query/domain/variant filtering policy was replaced.
- The actual mobile journey additionally reproduced checkout being sent to login while `useSession` was still loading. `src/components/store/CartPage.tsx` now disables both checkout controls and guards navigation until that lookup finishes. Authenticated and guest destinations remain the same; the approved product view was not edited.
- Maintained acceptance lives in `scripts/store-mobile-category.browser.cjs` and `scripts/store-mobile-category.fixture.cjs`. Fixtures require an explicitly isolated PostgreSQL database name/host, an empty database for setup, a private fixture path and local port3114. They do not use `.env` or the owner's DB. The browser calls actual cart/checkout APIs, delays the real session response without substituting its contents, and exercises one internal-wallet purchase plus idempotent replay and a foreign-customer denial. No gateway/payment/stock response is stubbed. The category is representative synthetic phone data; no production best-seller ranking was measured.

Executed evidence:

- In the existing `mobocom-app` container, isolated source `/tmp/mobocom-store-mobile-20261114`, Linux UID1000, Node22.23.3, Next16.4.6, TypeScript7.0.2 and private generated Prisma5.22 client; all199 existing PostgreSQL17 migrations applied to the empty owned `mobocom_store_mobile_20261114` database. The original app source/client, source mount, settings and storage were not replaced; no new container was created.
- `node --test scripts/cart-checkout-client.test.cjs scripts/store-v2.test.cjs`: **29/29 passed**. The new session-readiness case covers both mobile/desktop buttons and authenticated/guest routes. Supplying original CartPage source in memory with `var/baseline-cart.cjs` made that assertion fail; no product file was replaced. The baseline browser also reproduced the label-only trigger and a single checkbox navigating/closing the panel; the new native-button regression failed against that old page.
- `node scripts/cart-checkout-snapshot.connected.cjs`: passed against the task PostgreSQL database, including current cart snapshots, concurrent quantity/revision/new/replaced-row preservation, owner binding and legacy cleanup.
- Host Playwright via `node var/store-mobile-category/run-browser.cjs filters final-browser`: passed 390 light/dark mobile and1440 light/dark desktop, plus800 resize/reopen. Includes keyboard Tab containment/Escape/focus, actual slider keyboard/thumb changes, draft cancel, repeated values, price Apply, URL/controls Back/Forward, empty results and Clear recovery. `purchase final-browser` then passed variant/quantity/cart, a deliberately delayed real session, physical pickup choice, real internal wallet checkout, same-key replay, own order and foreign denial. Final tested page errors and external browser requests were0. Nine screenshots and eleven scoped Store-surface axe reports (all0 violations) are ignored under `var/store-mobile-category/final-browser`.
- `node scripts/store-mobile-category.fixture.cjs assert var/result-purchase.json`: native PostgreSQL proved one paid owned order/invoice, chosen variant quantity2 at110000 IRT, total220000 IRT, one wallet purchase debit, remaining balance1780000 IRT and variant stock6→4. Rejected earlier fixture requests created no paid order/debit. Canonical transaction and financial guards were not weakened.
- `node node_modules/typescript/bin/tsc --noEmit -p var/typecheck.json`: scoped changed React/listing types passed with the repository's existing ambient declarations. `check-architecture.mjs`, `check-security.mjs` and final `check-source.mjs` (2844 TS/TSX files) passed. `git diff --check` passed. No full suite or production build claim.
- Installed React Doctor0.9.17 on ShopFilters, CartPage and the listing with `--scope files --no-telemetry --no-supply-chain --blocking error`: **0 errors,11 reviewed warnings**. Ten are existing formatting/lookups/complexity/metadata findings; the dialog-backdrop click warning is a native dialog boundary check, with keyboard dismissal handled by the browser and tested. No suppression or dependency upgrade.

Failed verification attempts remain bounded: fresh DB initially redirected to installer until a synthetic owner existed; pickup required a synthetic phone; its encrypted proof required valid64hex test keys. These were corrected only in fixture/environment setup. Browser selectors were corrected for separate cart attributes, the mobile checkout button and hydration readiness. A Docker restart interrupted the first test process; only the owned test process was restarted. These are not successful runs. Earlier full-document axe found two existing brand-link label/name findings in shared header/footer, outside the changed Store surfaces; the eleven final scans are scoped, not a whole-site accessibility certification.

### Continuation, limits and rollback

This slice is local/uncommitted on `feat/store-mobile-category-2026-11-14`. Owner merges/deploys; no PR, hosted workflow, production release, real payment gateway, SMS/email/provider, printer or destination-host check ran. Pickup/wallet success does not certify home shipping/carriers or every category. Existing variant facets and price slider are present; do not rebuild them from the historical queue. Cross-variant filtering semantics and shared brand-link accessibility remain separate assessed follow-ups, not claims of a new defect fix here.

After final assertions, stop only the verified test PID group, drop only the named disposable database, remove its isolated source/archive/tunnel and synthetic cookie fixture; retain non-sensitive local test receipts. Confirm the original port3000 app readiness/session afterward. See current workstate for executed cleanup status. Rollback reverts the five changed presentation/component files and their tests; no schema, amount, identity, permission or stored history needs reversal. Preserve the independent prior Claude/Codex documentation reconciliation and autonomous-foundation platform diffs. Future agents use the shared session protocol and this handoff, not the temporary test directory as their only instructions.

Cleanup executed: the verified task process group and uniquely matched host tunnel were stopped; `mobocom_store_mobile_20261114` was dropped; the exact isolated source, copied private client, task environment/cookies, archive and container helpers were removed. Shared dependency symlinks were unlinked without deleting their targets. The original app's `/api/health/ready` and `/api/auth/session` both returned200 afterward. All five tested presentation source hashes matched the feature checkout before cleanup. The shared-record check passed eight documents/461 local links and byte-preserved history; the existing14-document AI bundle passed `generate-ai-knowledge.cjs --check`. No generated-client/schema/runtime adoption into the owner's app occurred.

For a future isolated run: provide `DATABASE_URL` pointing to an empty migrated `mobocom_store_mobile_<suffix>` database, `MOBOCOM_ISOLATED_FIXTURE=1`, a task-only `NEXTAUTH_SECRET`, valid synthetic64hex `STORE_DELIVERY_KEY`, a private `STORE_MOBILE_FIXTURE_PATH` and a matching app on localhost3114. Run `node scripts/store-mobile-category.fixture.cjs seed`, then the browser helper with that private JSON and explicit ignored output directory; finally run `node scripts/store-mobile-category.fixture.cjs assert <result-purchase.json>`. Stop/drop only the environment you created. The registered `cart-checkout-snapshot` suite and existing unit files remain independently runnable. Fixtures never establish real phone verification or provider delivery.

## Historical suggestions — reconcile with current source before implementation

- Done since: **two stores and advanced filters** (branch `feat/shop-two-stores-2026-10-27`). Evidence in `.mobocom/claude-tools/pw-shop-stores.cjs`; the decision is in PLATFORM_DECISIONS §6B. Not covered yet:
  - variant facets and a price slider: already present in the reviewed2026-11-14 source;
  - mobile filter draft/application/accessibility: implemented and locally verified in the slice above.

- Free-shipping hint on tiles and in the hero once PR #256 (free shipping rules) is merged.
- Recently viewed products on the landing (per browser).
- Category-level banners managed in Admin, if the owner wants different art per category.
