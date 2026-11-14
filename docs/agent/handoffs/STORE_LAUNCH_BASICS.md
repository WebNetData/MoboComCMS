# Store opening basics — 2026-11-14

## Published pull request — 2026-11-14

Opening basics `5712455d` and purchase guidance `c7ff51e8` are included
with the platform journeys in [PR #468](https://github.com/WebNetData/MoboComCMS/pull/468),
open/non-draft to main from `feat/platform-integration-2026-11-14`. Source/evidence
head `8b534e15` is followed only by this publication-status receipt; no
application source or validation baseline changed. Complete PR-range review:
72files, Gitleaks0, scoped Semgrep40targets0, whitespace/knowledge consistent.
Owner merges/deploys; contact/policy content and real provider/printer/restore
requirements below remain unresolved. No hosted workflow was dispatched.
Earlier unpushed/local-only status entries are historical checkpoints.


## Essential pages and purchasing information — continuation 2026-11-14

Implementation/evidence committed locally as `c7ff51e8` (20 files); clean
worktree after commit. Final documentation receipt records this identity.

Owner accepted the five proposed opening basics, with essential pages and
product information first. Same authoritative checkout/branch; this continuation
starts after `5712455d` / documentation receipt `e95f513`. Local development only;
no owner data, deployment settings, publication or provider was changed.

### Implemented and verified

- Existing Store merchandising settings add `purchaseGuidePageIds`: up to6
  ordered, unique positive numeric CMS Page IDs, default empty. The existing
  storefront settings form selects/reorders/removes published pages; existing
  revision claims, history, audit, `settings.manage`/`cms.products` and Store
  module guards remain. Draft titles/content are not supplied to Store managers.
- Site owns `server/public-pages.ts`: minimal public title/address projections,
  current publication and slug resolution, preserved order. Draft/deleted Pages
  disappear from public links without destroying the saved selection; a public
  optional read failure omits links. Admin read failure still fails visibly.
- Catalog's product page supplies these links to the existing BuyBox. The
  «پیش از خرید بخوانید» navigation uses current Store tokens, keyboard focus and
  ordinary canonical Page links. Empty configuration produces no extra panel.
  Native selects have explicit labels so option text is not their field name.
- The first empty storefront settings save exposed an existing revision bug:
  the read returned the default object in a different key order from the write's
  normalization. `getStoreSettings` now always uses the same normalizer; the
  normal current revision succeeds and a stale one is still refused. No claim
  check or history rule was weakened.
- No migration/dependency, second Page store, policy engine, notification system
  or readiness dashboard. Old settings/snapshots remain readable. The private
  settings GET adds only published Page options; public API contracts are intact.

Fresh disposable `mobocom_guides_test_20261114`,200 migrations, private Prisma,
no `.env`, UID1000. Registered `store-purchase-guides.connected.cjs` passed real
Store-only staff access, no draft-title leak, first/current save, stale409,
ordered public projection, slug/draft/delete changes and injected read failures.
Removing publication filtering in the disposable source made the private-title
assertion fail; original source was restored and the suite passed. The initial
fault attempt lacked write ownership after Docker copy; only the exact temporary
file was assigned UID1000 before repeating. Product source was never faulted.

`store-v2.test.cjs`:17 passed. Final TS7, source2874, architecture and security
gates passed. Semgrep local rule scanned8 TS/TSX files with0 findings; its existing
rule-path warning remains. Doctor's3-page review:0 blocking errors/17 reviewed
warnings; final new-selector review:0 errors/2 bounded lookup warnings (six
selected IDs), no suppression. Other warnings concern existing BuyBox effects,
numeric inputs, formatters and settings editor lists, not new guide behavior.

Actual `store-purchase-guides.browser.cjs`: Admin selected and saved5 synthetic
published pages, then product → legal guide by keyboard → footer → contact,
configured phone/hours and guest403.12 actual1440light/dark and390dark captures:
scoped axe0, overflow0, page errors0. Four representative images were inspected.
The empty configuration baseline has no panel. An initial cold navigation failed
with transport retries; an over-broad select label was fixed explicitly. The
hours assertion originally expected a separate text node although its parent
also contains the label; the assertion was corrected. Resumed capture kept the
already-proven saved settings rather than repeating the write. This is combined
evidence, not a whole-site or uninterrupted full-suite claim.

Final proof matched all9 application source hashes; five selected guides and
the fixture's1 user/6 Pages were retained after native cleanup, money rows0.
Task preview's3 exact-cwd processes and verified tunnel stopped; named disposable
DB/runtime/private client/env/sessions/TLS/archive removed; original app readiness
and session both200. Ignored receipts: `var/purchase-guides-20261114/`.
Changed20-file payload passed redacted Gitleaks with0 findings; whitespace and
generated14-document knowledge consistency passed. Graphify has no corpus in
this worktree; no graph/runtime inference was claimed. Exact source owners and
the executed native/browser gates are the evidence.

### Five requested basics: current scope and remaining work

| Area | Verified state | Remaining |
| --- | --- | --- |
| Essential pages/contact/footer | CMS Pages/company/legal templates and navigation already existed; synthetic published pages, footer/contact paths and phone/hours exercised here. | Real phone/address/hours and approved warranty/return text were requested asynchronously and not supplied. No real Page was overwritten/published. |
| Product information | Existing product warranty/specifications/delivery facts plus newly configured Page guides, persisted and browsed. | Real photos/specifications/terms need the owner's catalog data. Existing hard-coded TrustStrip seven-day returns/support wording in `components/store/Storefront.tsx` remains unmodified pending policy reconciliation; guide links do not certify those promises. |
| Order confirmation/tracking | Source audit: `store/server/pages/my-orders.tsx` and existing customer-order owner provide status, invoice, delivery timeline and ReturnPanel. Prior Store/launch evidence remains attributed below. | No new order-purchase browser rerun in this Page-link slice. |
| Essential notifications | Source audit: Billing settlement → `invoicePaidEvent`/deduped durable inbox/channel jobs and `ADMIN_ORDER` SMS; Store transition and Shipping tracking emit customer events. Existing Admin notifications/SMS settings remain owners. | Actual SMS/email delivery and intended staff recipients were not configured or sent. Source presence is not provider proof. |
| Public navigation/mobile | Existing header/footer discovery and related fixture paths exercised at both themes/widths; no parallel menu/configuration. | No complete production link/empty-section/search crawl claimed. Existing Search evidence is historical. Owner menu choices are preserved. |

Continue with the missing real content values and the existing Pages/Studio
owners. Do not infer their approval from «ادامه بده», invent a phone/guarantee or
publish seed sample policy. Rollback this scoped source slice while retaining
Page, Settings and revision rows; older readers ignore the optional IDs.

## Earlier launch setup slice

Owner authorized the existing launch essentials after explicitly deferring the
advanced proposal backlog. Continue the authoritative checkout
`.mobocom/platform-integration`, branch `feat/platform-integration-2026-11-14`,
base `68746778` (owner-merged Store PR467), after local platform commits
`96ac5736` / `a3821468`. This slice is local; no push, PR, merge, deployment,
hosted workflow, real payment/provider test or customer message was performed.
Preserve unrelated root/autonomous-foundation/repair/bank worktrees and every
saved proposal in [the platform handoff](PLATFORM_INTEGRATION.md).

Implementation and shared evidence are committed locally as `5712455d`
(22 files); the worktree was clean after that commit. This final documentation
receipt records its identity. Nothing has been pushed or published.

## Implemented slice and ownership

- Store domain `sellableStock` now supplies the same existing aggregate cap to
  public Catalog cards and the Admin product list. Parent stock3 and variant
  stock5+5 show3, including the unlimited-variant case. Admin distinguishes
  minimum active-variant price from base price. No public price rule changed.
- Existing Billing gateway POST/PATCH wrap default clearing and the resulting
  insert/update in one transaction. Invalid minimums and failed writes keep the
  previous default. Existing `gateways.manage`, secret masking and Origin guards
  remain authoritative. The form starts minimum amount at0: the previous blank
  value was rejected by the server even on a normal first save.
- `/admin/gateways` distinguishes initial read failure, pending, genuine empty
  state and saved state; explicit retry/refresh, abort fencing and synchronous
  pending lock prevent stale reads/duplicate UI submissions. Failed writes keep
  the draft and explain uncertain network results. No provider call is automatic.
- `/admin/shipping-carriers` retries failed initial reads, retains failed-save
  edits, locks controls while saving, and accepts Persian/Arabic digits through
  the existing shared digit converter. Inactive carrier text keeps full opacity
  after the actual light-theme contrast failure; existing tokens/layout remain.
- `/admin/store/registers` shows location loading/error/empty states and blocks
  opening until an active location is known. Default-option copy describes the
  existing shop-or-main-warehouse selection. Backend location invariants remain.
- The old `store-counter.connected.cjs` fixture now opens through the real
  register API so it obtains the required location. It no longer creates an
  invalid locationless register directly. No financial guard was weakened.

No schema, migration, dependency, API shape, shared owner or protected URL was
added. Eight runtime source files changed; helpers/fixtures are scoped tests.
[Opening guide](../../STORE-OPENING-FA.md), [spec](../../specs/store-launch-basics/SPEC.md).

## Executed evidence

Fresh disposable PostgreSQL `mobocom_launch_test_20261114`, all200 migrations,
private Prisma client, no `.env`, UID1000, isolated Next preview3118 and synthetic
staff/products/settings only; the owner's app/database were not test targets.

- `store-launch-basics.connected.cjs`: real guards, invalid minimum, injected
  insert/update failures, retained default and product/variant price-stock
  projections; passed. Initial fixture incorrectly inherited USD, so100 minor
  units read as1; explicit IRT corrected the fixture, not the money conversion.
- Existing `content-management`, `store-counter`, `repair-invoice` and
  `return-refund-integrity` connected scripts passed. This includes catalog
  persistence/revisions, actual cash/mixed counter sales/invoices/stock and
  replay/race/refusal/rollback paths, repair invoice/handover gates and duplicate
  refund protection. Their console summaries remain bounded to these scripts.
- `node --test scripts/store-v2.test.cjs`:17 passed as UID1000 without `.env`.
- Removed both default-gateway transactions only in the disposable source;
  the native test failed on default preservation. Restored the exact source and
  reran successfully. Final TypeScript7 `--noEmit --incremental false` and source
  syntax/import check2872 TS/TSX passed; architecture and security gates passed.
  The host source check lacked `typescript-api`; the successful source check
  ran against the installed container toolchain instead.
- Actual `store-launch-basics.browser.cjs`: gateway failed read/retry, pending
  lock, failed save retained draft, one persisted manual gateway; shipping failed
  read/retry and failed save retention, Persian250 and persisted origin/weight;
  failed location read prevented register opening, retry opened one register
  with a real default inventory location. No provider test button was clicked.
-12 actual captures: four changed surfaces at1440 light/dark and390 dark;
  scoped axe0, horizontal overflow0 and page errors0. Four representative images
  were visually inspected. The first runner used an ambiguous alert selector,
  then wrongly expected an empty install despite the seeded CARD_TRANSFER;
  both fixture assumptions were corrected. Real first save then exposed the
  blank minimum bug. Shipping contrast failed3.72:1 before the opacity fix.
  Successful gateway/shipping operations were retained when resuming captures;
  this is combined evidence, not an uninterrupted full-suite claim.
- React Doctor on the four affected pages: exit0, no blocking errors,
  14 reviewed warnings (complexity/size, existing repeated lookups and numeric
  parsing; loading resets are already in abort-aware `finally`; mutation bodies
  are parsed to read errors then HTTP status is checked). Connection-test
  success now also checks HTTP status. No diagnostic was suppressed.
- Final proof matched all8 runtime hashes to the validated source, one manual
  gateway and one location-bound register; orders/invoices/payments all0 after
  native cleanup. Receipts/screenshots live in ignored `var/launch-20261114/`;
  tracked scripts retain reproducible scenarios, never private session values.
- Scoped Semgrep local rule:7 TS/TSX files,0 findings; only an existing rule-path
  compatibility warning. Redacted Gitleaks scanned the complete22-file changed
  payload,0 findings. `git diff --check` and generated14-document knowledge
  consistency passed. Shared workstate history and deferred proposals survived.

Earlier physical-goods cart → checkout → invoice → shipment/tracking and bank
stand-in browser evidence remains attributed to
[Store continuation](STORE_ADVANCED.md); customer login evidence remains in
[Identity continuation](PASSWORDLESS_ENTRY.md). They were not rerun here.
The current browser checked setup/register operations, not a new whole-customer
purchase, real repair intake or printer. Existing owners were reused throughout.

## Next continuation and rollback

Task preview's3 exact-cwd processes and the verified host tunnel were stopped;
only the named disposable database/runtime/private client/env/sessions/TLS and
archive were removed. Host private fixture and TLS files were removed as well.
Original app readiness and auth-session endpoints both returned200. Cleanup
receipt is ignored `var/launch-20261114/cleanup.json`.

Use the opening guide with real intended catalog and deployment settings:
verify provider credentials, domain/TLS, actual delivery/printer/message paths
and a separate restore drill. These operator checks remain unverified; synthetic
success is not production readiness. Do not reopen the advanced backlog as the
next task or create a second readiness/configuration system.

Rollback this bounded source/test slice through Git; retain every customer,
product, stock, invoice and settings row. No reverse migration or database
snapshot restore is needed. Owner merges and deploys.
