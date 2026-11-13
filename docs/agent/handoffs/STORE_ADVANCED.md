# Store: advanced shopping features (2026-10-27)

Owner request: the store should have the features of a professional shop like Digikala, for example "orders over 5,000,000 Toman ship free inside Qaemshahr". The shop home and the category listing should be redesigned to look professional and attractive. The single product page is approved as it is and must stay.

## Done

## Home shipping recovery and order tracking — authorized 2026-11-14

Continue `.mobocom/store-mobile-category` / `feat/store-mobile-category-2026-11-14` from main `8dfdd63e`, preserving its validated uncommitted mobile-filter/cart-session slice. Owner selected home-address shipping, accurate fee/free-rule presentation, recovery without losing choices or creating duplicate orders, and buyer preparation/shipping/tracking/invoice visibility. Existing Shipping, AddressBook, Store/Checkout/Wallet, Shipment and buyer-order owners remain authoritative. No new financial states, migration, provider, tracking registry or checkout system is planned.

Scoped audit found quote identity only used `addressId`: editing a selected address's province/city in place could leave its old fee/free rule visible. Carrier refusal cleared the selected ID but did not refresh obsolete quotes. The address-save callback also closed its dialog before the address list finished refreshing. The bounded UI fix tags quotes/failures with the actual destination fields consumed by the existing quote API, refetches on carrier refusal, and blocks physical shipping checkout while post-save address refresh is pending/failed. Existing abort fences, retry controls and selection preservation remain. Wider AddressBook overlapping reload semantics are not a new scope.

Acceptance uses isolated native PostgreSQL and actual 390/1440 light/dark browser: local free rule versus edited same-ID country fee; delayed/failing address/quote reads, retry and retained non-first carrier; actual unavailable-carrier rejection; real internal-wallet checkout whose successful response is deliberately lost, then same-key replay with exactly one paid order/debit and correct persisted address/fee/stock; existing authorized shipment creation/status/tracking, buyer invoice and foreign denial. Providers/gateways/SMS are disabled, staff and customers are synthetic. Record executed results/limits and cleanup below; this paragraph is authorization/plan, not passing evidence.

### Implemented and verified locally — 2026-11-14

The authorized slice is implemented locally and uncommitted on the checkout above. Continue these files instead of rebuilding shipping, payment or order tracking:

- `src/components/store/useCarrierQuotes.ts`: quote and failure identity includes the selected address ID plus its province/city, matching the existing quote API's destination inputs. The existing abort fence and explicit retry remain.
- `src/components/store/CartCheckout.tsx`: blocks physical shipping payment during pending/failed post-save address refresh, retains a still-valid carrier, refreshes quotes after actual carrier refusal, and displays the existing network/invalid-response recovery guidance inline. Digital/pickup behavior and canonical financial writes are unchanged.
- `src/components/store/AddressBook.tsx`: rejects malformed successful address envelopes/rows with a friendly retry error while retaining the previous list. It does not introduce broader reload ordering or new address CRUD behavior.
- Maintained acceptance: `scripts/store-shipping-recovery.browser.cjs` and `scripts/store-shipping-recovery.fixture.cjs`. Both require an explicit isolated-fixture flag, private synthetic sessions, local port3115 and the task database name guard. Do not point them at an installed site's database.

Executed evidence is under ignored `var/store-shipping-20261114`:

- Original-code browser baseline reproduced the bug: editing the same saved address from Tehran to Isfahan left the old free-shipping label visible, while the actual current quote was40000IRT (`baseline/result.json`, `baseline/stale-same-id-390.png`).
- Final `run-browser.cjs full` passed: checkout390/1440 light/dark and mobile cart free offer; held address503, quote503 and malformed200-address recovery; keyboard retries with the non-first carrier retained; actual409 `CARRIER_UNAVAILABLE` after staff disables that carrier, followed by a real quote refresh and40000IRT primary fee. The first real successful checkout response was deliberately dropped; the next UI submission reused its idempotency key and returned `replayed:true`. No successful payment response was mocked. Existing staff shipment creation, READY→PICKED_UP→IN_TRANSIT, buyer order/variant/tracking/invoice and foreign-order/invoice denial passed. Public tracking omitted recipient name, phone and street. Final receipt: `final-browser/result-full.json`; ten scoped axe reports have zero violations, with ten final screenshots. These are Store-surface checks, not whole-document accessibility certification; the previously recorded shared brand-label findings remain separate.
- Native PostgreSQL verification passed against a fresh database after all199 existing migrations, private Prisma5.22 client, no `.env` and Linux UID1000. Exactly one paid order/invoice and one wallet PURCHASE survived the lost response/retry: variant quantity2×110000IRT, shipping40000IRT, total260000IRT, wallet2000000→1740000IRT and variant stock8→6. Both ProductDelivery and Shipment retain the edited destination and original street snapshot. Financial order/invoice remain PAID; ProductDelivery is SHIPPED and Shipment is IN_TRANSIT.
- All31 focused shipping/carrier/cart-client tests passed in that non-root Linux toolchain. Scoped TypeScript7.0.2 for the three changed React files, architecture boundaries, source syntax/imports2844, security invariants and diff checks passed. The host's unit/source attempt could not load its absent `typescript-api` alias; the installed isolated Linux toolchain completed those checks. No dependency change was made.
- Final React Doctor: zero errors, six reviewed warnings. The native dialog backdrop handler already has native Escape/close-button dismissal; the quote effect already guards setters with AbortController and destination identity. Existing carrier selection adjustment is constrained by quote availability and the payment gate. Existing complexity and two small duplicated JSX structures remain bounded maintenance observations; nothing was suppressed.
- Test corrections were not product failures: variant fixture uses existing `CartLine.variantKey`; province label includes select options; address chooser stays open during held reload; the held503 route stays installed until fulfilled. One external Docker restart interrupted a run and only the owned preview was restarted. A real lost-response run exposed the generic error presentation and led to the inline recovery-code fix above. Another completed flow stopped on an overly broad test expectation about optional map tiles; final harness keeps all non-local traffic aborted, records only the known blocked tile origin, and rejects any other origin. A fresh complete run and native verification then passed. No real map/provider/gateway/SMS/email call, production build, hosted workflow, PR, merge or deployment is claimed.

Cleanup and continuation: final cleanup is recorded in the active workstate. Keep the baseline/final browser receipts and maintained helpers; remove private sessions, isolated environment/client/source, tunnel and disposable database. The owner app/database remain separate. Normalized hashes of the three final source files match the tested Linux source. Shared Claude/Codex bootstrap, architecture/map/ledger/decision/workstate records point here; regenerate the existing14-document AI knowledge bundle after updating its pinned architecture sources.

Rollback is limited to the three source files above and the two new shipping acceptance helpers, plus their evidence records; preserve the earlier mobile-filter/cart-session changes in this same worktree. There is no schema/data rollback. Gateway handoff, real carrier service calls and production shipment operations remain outside this synthetic-wallet acceptance. Wider address reload concurrency and unrelated shared branding remain separate work.

PR preparation2026-11-14: owner requested publication of both validated Store slices to `main`; branch `feat/store-mobile-category-2026-11-14` is based on current main `8dfdd63e` with no upstream divergence. Final staged diff review, diff check and existing14-document knowledge check passed; all three shipping source hashes still match the accepted browser/PostgreSQL run. Redacted Gitleaks found no leaks in the staged patch. Installed Semgrep with the existing root-local dynamic-code rule scanned the six affected TS/TSX source files with zero findings/errors; it is a scoped one-rule check, not a full security audit. Its sandbox certificate-store startup and missing worktree-local config attempts did not scan source; the completed scan used the existing root rules without changing them. Current Checks workflow is manual-only; no hosted dispatch or production build is added to the earlier evidence. The PR conversation/branch records publication status; owner merges and deploys.

## Historical delivered capabilities

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

**Full shipping control**, branch `feat/shipping-full-control-2026-10-27` (stacked on the free-shipping branch); decision in PLATFORM_DECISIONS §6B.
- Domain: `carriers.ts` (`zones`, `placeMode`, `pricing`, `placeFees`, `extraRial`, order range, `placeAllowed`, `carrierFee`, `CARRIER_PRESETS`/`presetCarrier`).
- Admin: `src/app/admin/shipping-carriers/CarrierEditor.tsx`. Checkout and order views show «پس‌کرایه».
- Evidence:
  - unit tests in `scripts/shipping-carriers.test.cjs`;
  - browser script `.mobocom/claude-tools/pw-shipping-control.cjs`.

## Audit: what already exists

Wishlist, compare, reviews, variants, bundles, coupons, VIP prices, digital codes, returns, delivery slots, carriers, invoices and abandoned-cart reminders all exist. Treat these as present, not as gaps.

## Next slices

1. Shop home (`/products` without filters): a richer storefront. It is built from existing owners only (categories, brands, featured/discounted/new rails, store settings).
2. Category listing: a better header, filters and product grid. The product card must stay consistent with the approved product page.
3. Optional:
   - recently viewed products (per browser);
   - free-shipping hints on product cards;
   - cashback to the wallet.
