# Store opening controls — 2026-11-14

Owner authorized all nine selected basics. Continue `.mobocom/platform-integration`
on `feat/store-opening-controls-2026-11-14` from main66e09d04 (merged PR468).
Preserve other worktrees and all existing identity, permissions, money, Pages,
Support, Catalog, Store, Settings/history and presentation owners.

| Slice | Existing owner / implementation boundary | Acceptance |
| --- | --- | --- |
| Explicit demo content | prisma/seed.cjs; bootstrap essentials separated from opt-in samples | Default seed does not publish sample products/posts or overwrite real content/accounts; explicit demo idempotent. |
| Managed store promises | Store merchandising/history; existing TrustStrip and BuyBox | One editable promise list; safe neutral defaults, legacy saved text retained as editable data, no fixed seven-day promise; same list on physical/digital/product surfaces. |
| Pause new online orders | Store settings + canonical Checkout | Visible reason, direct server refusal before money/stock writes; current setting rechecked in order transaction. Existing orders/replays/invoices/tracking and physical counter stay available. In-flight requests that already passed the transactional check may finish. |
| Order-linked support | Existing Support ticket creation/detail and Store own-order reader | Canonical owned order/line association, no foreign order leak, replies stay in existing ticket; current staff department/held-work rules. Schema coordinated centrally. |
| Search/share metadata | Current Site SEO, Catalog metadata and sitemap | Accurate title/description/image, no irrelevant VPN boilerplate, public publication/audience/module boundaries retained. |
| Iranian customer forms | Shared digit/phone/money owners and affected existing address/customer forms | Latin/Persian/Arabic numeric input interpreted identically; field-specific errors and retained drafts; no second validator/service. |
| Actionable error pages | Existing error/not-found routes | Clear retry/home/shop/search/order destinations, no exception details; preserve existing theme/RTL/accessibility. |
| Sold-device identifiers | Counter/Catalog invoice lines/receipt/returns owners | Serial/IMEI bound to exact sold line and quantity; authorized access, idempotency and transactional stock/money preserved; no public-catalog exposure. Schema coordinated centrally. |
| Price warnings | Existing authoritative counter quote/confirmation/cost/discount | Warn on known loss or configured/existing excessive discount rule; unknown cost is never treated as zero. Confirmation bound to current quote; no second approval engine. |

Seed, Support and counter work have separate agent file ownership. Root owns
Prisma/migrations/manifest, shared workstate/spec/handoffs, Store settings,
pause/promises and public quality changes. Any migration is additive with old-row
compatibility and manifest registration; no real serial/customer data invented.

Scoped native PostgreSQL/no-env/UID1000 tests exercise real guards, concurrency,
claims and replay only where behavior is critical. Relevant small units/types/
architecture/source/security and deliberate guard faults, not full release stack.
Actual browser at1440light/dark and390 validates changed controls/flows, failure
retention and scoped axe. Preserve all protected layouts/tokens/URLs, use existing
SDS primitives/Unslop guidance and React Doctor. No provider sends, hosted workflow,
PR/push, merge, deployment or owner-database test is part of this instruction.

Record actual files, executed evidence, remaining gaps and data-preserving
rollback in one shared handoff before delivery. Owner policy/contact content is
still not supplied; editable controls do not approve any particular legal text.
