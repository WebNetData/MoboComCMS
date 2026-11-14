# Store opening controls — 2026-11-14

Owner authorized the nine selected opening basics and repeated continuation.
Authoritative checkout: `.mobocom/platform-integration`, branch
`feat/store-opening-controls-2026-11-14`, base `66e09d04489147afad1e53bd1aa280c79af097d6`
(owner merged PR468). This is a new local slice; other dirty worktrees were preserved.
Scope/acceptance: [spec](../../specs/store-opening-controls/SPEC.md).

## Implemented ownership and behavior

| Request | Source owners and final behavior |
| --- | --- |
| Explicit samples | `prisma/seed.cjs`: only `SEED_DEMO_DATA=true` enables demo users/providers/plans/products/posts/forms/forum/published samples. Normal bootstrap creates missing essential roles/settings/departments and missing starter legal Pages as **DRAFT**. Existing users/passwords/roles, Pages/layouts, settings and commercial rows are preserved. Demo invoice repair is restricted to demo customer/demo transaction rows. |
| Managed promises | Store `domain/store.ts`, existing storefront settings/history, `ServicePromises.tsx`, `Storefront`/Catalog/BuyBox: up to six editable promises, neutral defaults, explicit empty list hides them; old saved badges migrate through normalization without overwriting stored text. No fixed seven-day promise in the service strip. |
| Online order pause | Store `order-acceptance.ts` and canonical Checkout: direct uncached DB check before processing and again inside order creation, refusal before money/stock writes, visible owner notice on listing/PDP/cart/checkout. Existing order replay/invoices/tracking, physical counter and other purchase domains remain available. An in-flight transaction already past its check may finish. |
| Order support | Existing Support ticket create/options/detail, `TicketCenter`, Store own-order links: nullable owned `orderId`, stored line names/variants/quantities, product ownership validation and unchanged customer/staff department guards. Missing and foreign orders share a 404 on creation; no parallel conversation system. |
| Search/share | Catalog metadata uses public current prices/brand/category instead of unrelated VPN keywords. Restricted audiences stay noindex; existing sitemap publication/module/audience boundaries retained. JSON-LD scripts take CSP nonce; Site SEO converts internal IRT to the corresponding ISO IRR amount and only emits an actual product brand. |
| Iranian forms | Shared money parser accepts Persian/Arabic digits and Arabic decimal separator while retaining exact precision checks. Existing Shipping validator identifies the failed field; AddressBook retains the draft, focuses that field, shows its error via `aria-describedby` and keeps its accessible name stable. Existing phone/postal normalization is reused. |
| Error recovery | Existing `error.tsx`/`not-found.tsx`: retry/search/home/shop and previous-order destinations, respecting Store module availability on 404. No exception details added. |
| Sold devices | Store counter domain/quote/commit, persisted `OrderLine.deviceIdentifiers`, authorized reader/receipt, own-order view and counter-return lookup: optional serial/15-digit IMEI normalized and bound to each exact line/unit, quantity and duplicate checks, idempotent sale retained. Printable A4/roll document includes the identifiers. Public catalog and bearer receipt projection do not expose them. |
| Price warnings | Existing counter quote/commit plus `counter-sales/warnings.ts`: known-cost loss and configurable discount threshold (default20%, zero disables the threshold). Unknown cost is not zero. Server recomputes warnings and requires confirmation bound by HMAC to current prices/costs/settings/identifiers; stale or missing confirmation fails before sale writes. No second approval engine. |

Existing protected layouts, URLs, canonical identity, permissions, stock and money
owners remain in place. New controls reuse MoboCom/SDS tokens. Browser discovery
also corrected the user-message avatar's dark-theme contrast in scoped Ticket CSS.
The counter does not establish a global serialized inventory registry or IMEI
hardware authenticity; a partial return still uses the existing line/quantity model.

## Data and update contract

Both Prisma schemas and manifest register additive migration
`20270318120000_store_opening_controls`: nullable indexed Ticket→Order relation
(`SET NULL` on deletion), and OrderLine JSON array text default `[]` with array
constraint. Old rows remain readable; no money state/type or amount is rewritten.
Deploy the migration before the new application. No migration has been applied
to the owner's database by this task.

Settings stay in the existing revisioned storefront owner; no second settings,
identity, support, validation or financial store. Stored policy text remains owner
data; enabling the editor does not approve any particular legal promise.

## Executed evidence

Disposable PostgreSQL `mobocom_opening_test_20261114`, private source/client under
`/tmp/mobocom-opening-20261114`, explicit synthetic environment without `.env`,
UID1000,201 applied migrations. Existing application/container data were not used
as fixtures. SMS/email/outside services were blocked or doubled; no provider send.

- `scripts/store-opening-controls.connected.cjs`: pause before processing and
  inside transaction, unchanged wallet/stock on refusal, old replay, persisted
  settings/revision conflict and customer refusal, exact localized amount/field errors.
- `scripts/store-device-support.connected.cjs`: known loss, missing/stale/current
  warning confirmation, one-sale replay, exact serial/IMEI line, stock decrement,
  authorized receipt, unknown cost, own-order support and foreign order refusals.
- Existing `scripts/store-counter.connected.cjs` passed with the new contract.
- `node --test scripts/shipping.test.cjs scripts/store-v2.test.cjs`:25 passed.
- `scripts/seed-launch-controls.test.cjs` passed on host and UID1000 Linux;
  exercises the actual seed with an in-memory Prisma boundary for opt-in/default
  and preservation cases. It is separate from the native DB receipt below.
- Full TypeScript, source syntax/import2879 files, architecture, schema parity,
  release manifest, security/audit invariants, money primitives/UI checks passed.
  Host source gate lacks `typescript-api`; the installed container gate passed.
- React Doctor:20 changed TSX files, exit0 with71 warnings and no blocking errors.
  Reviewed diagnostics: existing effect/fetch/complexity concerns, deliberate
  submit buttons, native dialog behavior, client-only dates, route-wrapper metadata
  and controlled index-key lists. No diagnostic suppression/config change.
- `scripts/store-opening-controls.browser.cjs`:21 actual views at1440 light/dark
  and390 dark, seven surfaces (settings, PDP, counter, receipt, address error,
  linked support,404). Scoped axe0, overflow0, page errors0; persisted settings,
  counter sale while online paused, localized address and linked ticket exercised.
  Public product is in sitemap; draft Page is absent; structured price and nonce checked.

Initial browser attempts found and fixed IRT structured pricing, error text inside
the address label, and dark avatar contrast. Test harness expected address200
instead of the correct201; corrected. Next dev restarted at its memory threshold,
causing transport failures; the harness only retries that transport failure with
local readiness, never a failed application assertion. Earlier failed native
fixture doubles/child cleanup were corrected before successful execution.

Final native receipt: removed the pause guard only in the disposable source;
the pause assertion failed, source restored, then all three native scripts,
25 units, seed boundary test and full types passed. The actual default seed ran
twice against PostgreSQL: existing users/passwords/roles, products, orders,
invoices, Pages, settings and post count remained unchanged; missing starter
Pages stayed DRAFT. All46 changed application/schema file hashes matched the host.

Cleanup completed: three exact-cwd preview processes stopped; the named test DB,
private client/env/sessions/TLS and task archives were removed. Original app
readiness/session both200. Redacted secret/Semgrep review is recorded with the
local seal below; it is not a claim of deployment or a full release-stack run.
Final64-file diff review retained prior shared history; redacted Gitleaks0 and
scoped local Semgrep38 TS/TSX targets0. Initial sandbox Semgrep failed opening
the Windows certificate store; the same local-rule scan succeeded outside that
sandbox without enabling metrics/version checks. Whitespace review passed after
normalizing TicketCenter line endings only. The46 byte-hash receipt predates
that formatting-only normalization and the regenerated canonical documentation
bundle; `generate-ai-knowledge.cjs --check` passed for all14 documents.
Ignored local receipts/screenshots: `var/launch-next-20261114/`; private cookies,
keys and fixture credentials must never be committed.

## Continuation, limits and rollback

Owner still supplies real contact/hours/warranty/return text, real catalog and
device identifiers. Live provider payment/message delivery, hardware printer,
public domain/social crawler behavior and production restore were not exercised.
No deployment, workflow dispatch, push or new PR is authorized by this slice.

After the final local seal, the next action is owner review/PR when requested;
do not restart the nine basics or execute the deferred advanced backlog. For a
failure, continue the existing owner/path above with scoped evidence. Online
acceptance and promises can be changed from existing Admin settings. Roll back
application code together if necessary, retaining the additive columns and their
data; do not drop serials, tickets or existing history to reverse a release.
