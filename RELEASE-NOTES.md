# HappVPN deployable baseline — 2026-09-22

## 1.7.0 — MoboCom 1.0.0 Beta (pre-release, 2026-11-03)

The first public beta. Its public name is **MoboCom 1.0.0 Beta**. The package, panel and Git tag carry **1.7.0** (`v1.7.0`), because a release must be numbered above the earlier 1.6.x releases for updates and the migration order to stay correct. Releases everything merged after 1.6.1 (PRs #290–#329).

- **Install and operations:**
  - one-line install for Ubuntu 22.04/24.04/26.04, Debian 12/13 and AlmaLinux 9/10 (`install.sh`);
  - `mobocom versions`, `update VERSION` and `downgrade VERSION` on the safe update path;
  - browser-based domain/email/SSL setup on a private temporary HTTPS listener;
  - signed `.run` installer and `.mbrelease` web updates;
  - host backup and restore.
- **Admin:**
  - the panel is organized by area;
  - whole-site and per-section maintenance notices;
  - announcement popups with audiences and repeat rules.
- **Members:**
  - redesigned member dashboard;
  - mobile sign-up with first-use password setup;
  - several user groups per member;
  - VIP tiers, trials, gifts and group seats;
  - group pricing and group-only content.
- **Page builder:**
  - effects library and landing templates;
  - slider and twelve advanced blocks;
  - global brand kit;
  - column layout and accordion;
  - owner-set widths and heights.
- **Content and store:**
  - Prompt Master studio and library;
  - profile bulk imports;
  - private file sales and content pricing;
  - billing, invoice and shipping fixes for launch.
- **Database:** 69 migrations (`20261214120000_content_revisions` … `20270212120000_digital_content_pricing`), sealed as release 1.7.0 and applied automatically on start. Take a backup first; the updaters do so themselves.

## 1.6.0 — MoboComCMS multi-section CMS and bulk import

Releases everything merged after 1.5.0 (PRs #1–#17). Upgrade notes, the migration list and post-update checks: [UPDATE-1.6.0](docs/releases/UPDATE-1.6.0.md); installation: [README](README.md#نصب-روی-سرور) and [VPS/shared hosting](docs/DEPLOY-VPS-HOST-FA.md).

- Sections: MoboCom homepage, software, games, cinema, music and magazine portals with their own taxonomies, mega menus, templates and configurable addresses; Discourse-style forum (v3); unified profiles and community; pro user dashboard; live search, reviews, compare, social publishing, PWA/push, analytics, copyright reports; AI auto-fill; paid content and VIP.
- Store v2: cart, brands, attribute groups, variants, filters, advanced admin; address book and delivery dates, returns, official invoices, carriers, back-in-stock, abandoned carts, gift cards, loyalty, installments, Torob/Emalls feeds; multi-vendor marketplace; FX pricing with live rates (variants included); Mellat and card-to-card gateways, IPPanel SMS, 2-step sign-in.
- Admin tools: bulk import (JSON/CSV/XLSX → store, magazine, movies, series, games, software, music) with dry run, per-field create/update/ignore, reports and rollback (`imports.manage`); server panel, download center, secure/masked links, watermarking, source-trace and file-metadata cleaning; ads, form builder, newsletter, live chat and CRM, monitoring, page cache, Redis/CDN; web installer, one-click updater, plugin/theme repository with licensing.
- Security: `safeJsonLd` for every JSON-LD script; connect-time SSRF checks for imported images.
- 30 database migrations (`20260927120000_software_forum` … `20261030120000_bulk_import`), applied automatically on start.

## 1.5.0 — Flexible page builder (completed)

- Live preview moved to `/builder-preview/<pageId>` (outside the client-rendered admin layout, which kept the preview bridge from ever running); server-side permission check, noindex, robots-disallowed. The bridge is a client component with a MutationObserver instead of an inline script and timers.
- Palette blocks and sections can be dropped straight into the live preview; device width toggle (desktop/tablet/mobile).
- Section settings: content width (boxed/narrow/full), column vertical alignment, equal widths, move up/down; section and block visibility per device.
- Columns keep their relative widths on desktop (the old percentage flex-basis plus gap wrapped two-column rows).
- Undo groups continuous edits per field; Ctrl+Z in text fields is left to the field; the preview draft is discarded when the document returns to the saved state.
- Custom-code block gets its advanced-mode toggle; template block picks from a list; hero image alt text; empty live blocks show placeholders in the preview only.
- Adding or changing advanced (JavaScript) code requires `settings.manage`; unchanged approved code can still be saved by content editors. Template/draft/post-template APIs rewritten under `src/modules/site/server/http/builder/` with audit logging.
- CSP `frame-src` allows YouTube (nocookie), Aparat and Vimeo players; common watch links are converted to embed URLs. Bundled template links fixed.
- New `scripts/builder.test.cjs` (part of `npm run test:site`). No database migration.

## 1.4.6 — Magazine widening and Digikala-style store feedback

- Shipped the magazine build: news ticker, cinematic hero slider with side slides, trending/fresh grids, category tiles, tabbed article rows, accent band and topic browser on the blog landing page.
- Single-post page is sidebar-free with a full-width author box, reading controls, share row, prev/next pager and related articles; magazine shells widened to 1440px (list) and 1280px (post) using logical, RTL/LTR-safe CSS.
- Product hero now shows digital/physical chips, an anchor rating chip that jumps to the reviews tab, an instant-delivery card for virtual products, purchase perks and a four-tile USP strip.
- Reviews are Digikala-style: score summary with star histogram, quality/value/experience bars, per-criterion stars in each card, verified-buyer badge and server-derived criteria averages; submission still requires sign-in plus a paid order with a paid invoice for that product.
- Questions stay open to everyone including guests, with ask form, store-answer tags, pending-reply state and live tab counts; the reviews tab reports signed-in / already-reviewed / buy-to-review states.
- Product list cards display the average rating and review count; fixed a hydration mismatch in the share row.
- No database migration in this release.

## 1.4.5 — Store product and editorial magazine

- Reworked product detail into a responsive gallery/information/purchase layout with seven on-demand tabs, loading/error states and related content.
- Added server-calculated quality/value/usability scores for reviews. Only users with a paid order and paid invoice for the exact product can submit a review.
- Opened moderated product questions to guests with name validation and rate limits.
- Refined category-scoped conditional attributes so unrelated values are rejected and hidden.
- Rebuilt the magazine landing page and single-post layout around cinematic imagery, editorial grids, category tiles, a reading sidebar, author information and related articles.
- PostgreSQL migration `20260925180000_store_feedback_v145` adds review criteria and guest-question fields. See `docs/STORE-MAGAZINE-1.4.5.md` for architecture, deployment and test notes.

## 1.4.4 — Mini-app payment navigation fix

- Wallet top-ups and plan purchases open internal invoices in the current tab.
- External payment gateways navigate directly in a regular browser and use Telegram's external-link API inside Telegram.
- A visible payment link remains available if Telegram does not open the gateway automatically.

## 1.4.3 — Subscription center and private ticket images

- Dedicated subscription detail page in web and mini app, with the existing connection/device/renewal controls plus linked purchase, invoice and ticket history.
- PNG/JPEG/WebP images can be attached to customer tickets, connection reports and staff replies. Private downloads enforce ticket ownership or department-scoped staff access.
- PostgreSQL migration adds ticket attachment metadata. Image bytes live in persistent `/app/storage/tickets`; include that path in storage backups.

## 1.4.2 — Customer subscription dashboard

- Web and mini app use the same active-subscription summary, including unlimited traffic.
- Web dashboard adds search, status filters and attention-first ordering.
- Subscription cards show remaining traffic and clearer expiry guidance.
- Failed subscription loading exposes a retry action instead of an endless spinner.

## 1.4.1 — Agency team and sales reports

- Reseller owners can assign scoped team access to existing customer accounts.
- Agency sales reports show status counts and delivered amounts by currency.
- Receipt decisions record the approving website user or Telegram owner.
- PostgreSQL migration adds team membership and receipt-review audit fields.

This package is the production-oriented baseline for the first Coolify deploy.

## Deployment guarantees added

- Docker multi-stage build with release checks and PostgreSQL build gate.
- PostgreSQL migrations applied with `prisma migrate deploy`; production never
  uses `db push`.
- Disposable app container with persistent `/app/storage`.
- Liveness and migration-aware readiness endpoints.
- Production env fail-fast validation.
- VPN subscription fetches use DNS-aware/pinned SSRF protection.
- Fresh installs disable the old shop-domain raw Happ subscription proxy.
- VPN-panel credentials are AES-256-GCM encrypted at rest using the dedicated
  `PANEL_CREDENTIAL_KEY`; historical plaintext rows are upgraded idempotently.
- Provider adapter registry + generic non-secret `Panel.config` allows most new
  VPN providers without changing customer/order/subscription schema.
- Coolify scheduled-task entrypoints for fulfillment/reconciliation/reminders.
- Update/data-separation and disaster-recovery runbooks.

## Dependency baseline

- Node.js 22 container
- Next.js 15.5.25 (Maintenance LTS security-backport line)
- React / React DOM 19.2.8
- NextAuth 4.24.15
- Prisma 5.22.0

## Verification performed in the review environment

Passed:

- architecture boundaries
- TS/TSX source/import syntax scan
- SQLite/PostgreSQL schema parity
- money schema + money UI checks
- security invariants
- audit/observability checks
- i18n audit
- connected regression tests: 24/24
- backup tests: 4/4
- production preflight happy-path

The review container has no outbound npm DNS access, so a real dependency
installation, `tsc` and `next build` could not be executed here. The Dockerfile
runs the full `release:check` and `build:postgres` during the actual online
build and will fail the deployment if either fails.

## package-lock note

The original lockfile targeted the old Next.js 14 / React 18 baseline and was
intentionally not shipped because using it with the upgraded package manifest
would make `npm ci` invalid. All root production dependencies are pinned to
exact versions. On the first internet-connected development machine, run:

```bash
npm install --package-lock-only --ignore-scripts
npm ci
npm run release:check
npm run build:postgres
```

Then commit the generated `package-lock.json` to the private repository. Future
Docker builds automatically switch to `npm ci` when that matching lockfile is
present.


## 1.1.0 build-verified patch set (2026-09-22)

- Upgraded `react-simple-maps` to `5.0.5` for React 19 compatibility and removed the external type package.
- Updated `WorldMap` for the v5 callback, GeoJSON, and SVG style typings.
- Installed OpenSSL in Docker build/runtime stages for Prisma compatibility on Debian slim.
- Added a build-only `NEXTAUTH_SECRET` placeholder in the builder stage; runtime secrets still come only from deployment environment variables.
- Made the FrenzyEx webhook route runtime declaration statically analyzable by Next.js.
- This patch set is the source configuration that completed the production Docker build successfully on the deployment server.

## 1.1.2 — multi-gateway checkout + USD/Toman fallback fix (2026-09-22)

- Fixed `usdRateToman="0"` incorrectly overriding a valid `FRENZYEX_USD_RATE_TOMAN` environment fallback.
- Added a central positive-rate resolver and applied it to FrenzyEx checkout and Toman price display paths.
- Added customer-selectable multiple active gateways to plan/product checkout, wallet top-ups, Telegram Mini App and Telegram bot purchase flow.
- Changed gateway `isDefault` semantics to preselection/fallback only; other active usable gateways remain available.
- Added the sanitized `/api/payment/gateways` discovery endpoint and server-side validation of explicit gateway selections.
- Bound Plisio callback verification to the invoice's exact gateway secret, enabling safe multi-account operation.
- Preserved clickable customer name/email navigation to customer management.
- Added `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a Docker build argument without exposing the Turnstile secret at build time.
- No new Prisma migration; 1.1.1 → 1.1.2 is schema-compatible.

Verification in the packaging environment: architecture, source/import, schema parity, money, money UI, security, audit, i18n and connected regression tests all pass; connected tests are 28/28. A full `npm ci`/Next.js build could not be completed in this packaging environment because dependency installation did not complete. The production Dockerfile remains the final gate and runs the full `release:check` and `build:postgres` during the online server build.
# 1.2.0 — Order operations center (2026-09-22)

- Added an admin operations page for paid orders awaiting subscription provisioning, renewal, or product delivery.
- Shows fulfillment attempts, last failure, next automatic retry, and recent gateway webhook/reconciliation issues.
- Allows an authorized administrator to retry the existing fulfillment job immediately. The same job claim and order deduplication are used; completed jobs cannot run again.
- Missing renewal jobs require manual investigation because recreating them could add time or traffic twice.
- Added optional Telegram alerts after repeated fulfillment failures, with a configurable chat ID and a test action.
- Added regression tests for paid-only retry, completed-job rejection, and missing-renewal protection.
- No Prisma schema migration is required.
# 1.2.1 — Prominent website Telegram login and native bot menu (2026-09-23)

- Moved Telegram login to the top of the website login form, ahead of email/password, with clearer loading and unavailable states.
- The login widget uses the already configured Telegram bot and verifies its signed response server-side before creating a session.
- Kept the bot's native Telegram menu (`setChatMenuButton` with `type: default`), matching the production menu fix. The Mini App remains accessible from bot message buttons.
- No database migration is required.

# 1.2.2 — Bilingual Telegram bot and login icon (2026-09-23)

- Fixed the Telegram icon layout and replaced its malformed path on the website login page.
- New bot chats choose English or Persian at `/start`; the choice is stored per Telegram ID in the existing settings table. `/language` offers the choice again.
- Bot account, subscription, plan, checkout, wallet and help messages follow the selected language, as do subscription-ready notifications and reminders. English remains the fallback before a choice is stored.
- Added Persian bot command descriptions and tests for persisted language selection and the start/callback flow.
- No database migration is required.

# 1.2.3 — Telegram website login CSP fix (2026-09-23)

- Changed the login widget from a JavaScript callback to Telegram's signed redirect flow. The old callback required `eval`, which the production Content Security Policy correctly blocked.
- Added a website callback page that passes only Telegram's signed fields through the existing server-side verifier, removes them from browser history, and returns the user to the requested local page.
- Kept the strict CSP unchanged and added a bot-link fallback when the external widget script cannot load.
- No database migration is required.
