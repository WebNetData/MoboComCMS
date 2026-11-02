# Public sections quality — 2026-10-26

This continues the magazine's public audit across every public section: cinema, games, software, music, the store, the site home and the magazine. It covers 24 pages, each in light and dark, at 1440 and 390 px.

## Account and utility pages — 2026-11-02

The owner selected item1: review account pages, forms, error pages and empty/loading states. Continue the same pending `feat/search-design-2026-11-02`/main `ea123a23` batch; do not discard Search or unrelated owner work. Initial guest auth views were already styled/axe-clean and their approved design stays. PostgreSQL-backed customer inspection established light contrast defects, ambiguous inline links and invalid activity-grid semantics. A public form had no primary heading. Controlled failures reproduced an indefinitely loading public-profile response and root `reset()` reusing a failed Server Component payload.

An additional regression was ours: the prior Search-only CSS separation removed global `.sr-*` classes still consumed by Favorites, Compare and Copyright. The earlier Search assertion about retaining those styles was incomplete. Their legacy classes now have explicit scoped ownership in `engage.css`; the current Search CSS module stays separate. Screenshots and navigation touch-target checks cover both empty and populated cases now.

### Changes and ownership

- `dashboard-tidy.css` and `account-home.css`: semantic accent ink/primary-on-primary pairs for account links, selected navigation/filters and quick amounts; current-theme muted text for addresses/game shelves; consistent card-like empty/error surfaces, focus rings and existing layout/data. Scope is `.user-shell`; no Admin/public catalogue redesign.
- `dashboard/page.tsx`: existing activity readout uses a native labeled list instead of gridcells without rows. Date/count labels, hover/focus readout and aggregation stay; focus is visible.
- `MemberPromptShelf.module.css`: existing account Prompt empty/section links have readable ink and inline underlines.
- `dashboard/public-profile/page.tsx`, `dashboard/invoices/page.tsx`, `components/site/MyRequests.tsx`: named pending states, friendly failure and keyboard retry of the existing GET. Profile/request reads abort or ignore stale/unmounted results. HTTP failure/malformed JSON no longer masquerades as a perpetual loading state. Invoice query/filter state survives retry. No profile save, money mutation, staff permission or API-contract change.
- `components/site/PublicForm.tsx`, `modules/site/server/pages/forms/[slug]/page.tsx`, `forms-pro.css`: additive `headingLevel` defaults to2 for existing embeds; the standalone page asks for1 in every form state. Explicit submit-button type preserves the current submit behavior; same validation/settings/style/billing/notifications owners.
- `app/login/AuthLoading.tsx`, `login/page.tsx`, `auth.css`: actual existing Suspense fallback is a themed, named pending card. AuthFrame/forms/providers remain unchanged.
- `components/site/feedback/{SiteFeedback.tsx,feedback.module.css}`, `not-found.tsx`, `error.tsx`, `application-polish.css`: shared presentation for existing404/root-error boundaries; wide semantic card, clear recovery actions and optional same-site404 search gated by the existing Search module. HTTP404/metadata preserved; raw error details are not rendered by this UI. Root error now uses current installed routing `refresh()` plus `reset()` in a transition, with a pending button, and actually recovers from a transient server failure. Installed Next16.4.2 exposes `reset`, not the newer canary `retry` prop shown in upstream docs; no dependency upgrade/new error framework.
- `engage.css`: Favorites/Compare/Copyright headers, shortcuts, filters, empty states and supporting labels are scoped together, independent of Search. `compare/page.tsx` makes the decorative thumbnail link hidden from assistive navigation; the adjacent work-title link remains the accessible destination.
- `store/{AddressBook,CartCheckout,ProductCheckout}.tsx`: existing named shipping skeletons gain valid status roles. Checkout logic, amounts, delivery rules and layouts are unchanged; a complete live purchase remains a separate launch test.
- `scripts/utility-pages.browser.cjs`: maintained localhost-only read-only acceptance. Optional `E2E_MEMBER_STATE` is a private Playwright customer storage state; optional `E2E_FORM_PATH` is a disposable published form. Without these, it explicitly reports member/form scope unassessed. It never creates members, submits forms, sends codes or pays. It checks genuine page states plus controlled delayed503/read-only keyboard retries to the real API, including invoice filter retention.

### Executed evidence

- Baselines:24 guest captures and60 customer/form captures at1440/390 light/dark; later36 additional account/Favorites/Compare views established three further colour gaps and the legacy shared-style regression. Those findings were corrected, not allowlisted. Header/body account navigation was separately inspected with axe.
- Final maintained acceptance with a private disposable customer and public form:120 page views (six guest +24 member/form destinations × four theme/width combinations), main WCAG axe0/no overflow/runtime errors;12 delayed503→real PostgreSQL API recoveries by keyboard. The customer pages cover overview, profile/public profile, orders/invoices/wallet, addresses/requests/tickets/notifications/preferences, collections/reviews/library/Prompt/games/recent/gift cards/referrals/ads, Favorites/Compare and completion. Copyright respects its module state; it was enabled in this local run.
- Additional native UI proof: invalid form fields,404 GET search navigation, activity-cell focus, profile malformed-JSON failure/retry. A temporary **app-container-only** fixture route exercised the actual AuthLoading Suspense fallback and root error boundary at four theme/width combinations; removing the local fault and clicking retry fetched fresh server output. It was not placed in repository `src` or release build. Development framework overlays are separate from the error feedback's raw-message privacy claim.
-16 populated views: two actual public product refs and a Journal ref saved only for the disposable customer through canonical Favorite API with `Origin` and `notify:false`; Favorites/type-filter, real Compare table and Copyright at1440/390 light/dark. Main axe0/no page overflow. Favorite marks were removed through the same API, recomputing their existing aggregates; no provider message was sent by these operations.
- Related unit files (`forms`, `profile-fields`, `site`, `account-security`, `shipping`, `cart-checkout-client`, `store-variant-selection`):80 passed,0failed/0skipped, confirmed in Linux as UID1000 with database/provider environment removed and no env-file loader. A host attempt could not resolve the older root's absent `typescript-api` alias; it was not reported as a pass or fixed by altering owner dependencies. Canonical app dependencies were used for the successful non-root run. Types, architecture boundaries and final source checks2269 passed. This is a scoped batch, not a rerun of every release gate or external provider.
- React Doctor:10 utility files0errors/17advisories; four comparison/shared-shipping files0errors/8advisories. Fixed introduced/relevant semantics/status/explicit-button findings. Retained complexity, existing form effect/dependency patterns, current route Suspense detection, positional rendering keys and guarded async-state advisories were reviewed without suppressions. Profile/request async results have explicit abort checks; no parallel client cache/fetch framework was installed.
- Scoped redacted Gitleaks27 product/test targets0findings; local Semgrep rules17 TS/TSX targets0findings/0errors. Raw audit/screenshots/controlled-state/Doctor/security/build evidence is ignored under `.mobocom/utility-polish`; private member credentials/state never enter Git. Graphify source-only incremental refresh passed; it is static discovery, not runtime proof.

Final production `npm run build:postgres` passed:101 generated pages, with41 retained tracing warnings and27 optional unavailable-Redis events in the isolated validation environment; this is not a Redis-health result. Copied-source hashes are in the private `build-source.json`; the temporary proof route was never included. Validation container stopped. Identified fixture customer/form/submissions, canonical favorite marks and private member state were removed; no real form message/code/payment was sent. App3000 was restarted. A post-restart404 reload loop was traced by CDP to Turbopack HMR `restart`/`handleApply`; clearing only the explicitly verified `mobocom-local_mobocom_next_dev` cache volume restored local readiness200, styled404, absent proof route, guest account redirect and retained Search. Database/storage/dependency volumes were not cleared.

No migration, dependency, role/permission change, hosted Actions, PR, merge, release or production deployment is part of this slice. The site still needs the separately recorded destination-host/provider/load/recovery gates in [LAUNCH_READINESS](../LAUNCH_READINESS.md). Safari/native mobile OS and unexercised optional/Admin flows are unassessed.

Rollback: revert the affected presentation/read-only recovery slice without data conversion. A partial Search rollback must retain either the original shared `.sr-*` definitions or their new scoped Favorites/Compare/Copyright equivalent. Preserve the owner root checkout, client-registry line endings, `.serena/` and `public/demo/`; do not reset customer/content/settings data to match screenshots.

## Public site search — 2026-11-02

Owner requested a professional appearance for `/search` («کشف کنید / جست‌وجو در موبوکام»). The live baseline had loaded legacy CSS, a small form and suggestions surrounded by unused space; this was a presentation gap, not a missing search engine. Continue `feat/search-design-2026-11-02` from main `ea123a23` after owner merged PR298. Other public designs and the older root checkout remain protected.

- `src/app/search/page.tsx`: existing server page composition; wide initial search, six existing suggested terms with helpful descriptions, search guide, compact query header, result type/counts, real result media/fallback icons, rating/member labels, empty/short-query/cursor notices and previous/next paging. Reuses shared `Icon`, `RatingMeter`, `AppLink` and `MediaShell`.
- `src/components/search/SearchPage.module.css`: private presentation under existing SDS/MoboCom surface/text/border/accent/contrast tokens. Same canonical header width (97% desktop, existing mobile gutters), RTL and automatic input direction, consistent cards, clear selected/focus/hover states, touch targets and reduced-motion handling. No client package, font, idle animation or remote design registry.
- `SearchAdvancedControls.tsx`: existing GET fields in a native keyboard-operable `details` disclosure. It starts open when a specialized dimension/sort is active; clearing returns to its compact state. Existing normalization still decides which fields matter. Explicit accessible select names avoid the enclosing label accidentally incorporating every option.
- `src/app/engage.css`: Search moved to its scoped module. The utility follow-up above corrected the missed `.sr-*` consumers in Favorites/Compare/Copyright; the Search-only checks below did not establish their visual compatibility. Shared overlay search keeps its existing owner.
- `scripts/search-discovery.browser.cjs`: maintained local read-only presentation/GET acceptance. Existing pagination tests in `e2e/tests/search-pagination.spec.ts` and `scripts/search-query-scale.connected.cjs` now target semantic regions/current result headings instead of retired global selectors.

`src/modules/search/server/search.ts`, Content visibility/maintenance/module checks, facet/ranking/index/storage/analytics owners, lower-bound scan counts, cursor scope/reset, query/page URLs and noindex metadata are unchanged. No migration, dependency, parallel search system, permissions change or new Admin settings namespace. This utility-page refinement does not certify all site pages as finished.

Executed against the running local PostgreSQL-backed app:

- `docker exec mobocom-app npx tsc --noEmit`, `npm run arch:check` and `npm run source:check`: exit0; boundaries valid and2267 TS/TSX syntax/import checks. Final production `npm run build:postgres` ran in the existing isolated `/lab` validation container: exit0,101 generated pages; retained optional unavailable-Redis/trace warnings are not a cache-health check.
- `node --test scripts/search-ranking.test.cjs scripts/search-rebuild.test.cjs`:9 passed. `docker exec mobocom-app node scripts/search-facets.connected.cjs`: passed against actual PostgreSQL, including rating/access/recency/counts/cursor binding and unchanged autocomplete behavior.
- `node scripts/search-query-scale.connected.cjs`:1021 temporary published posts; actual API/browser numeric page50→cursor51→back, final page52 and stale withdrawn-source exclusion passed; temporary posts/documents removed and index stamp restored. The first container attempt lacked Chromium; the successful complete run used installed host Chromium and the same local PostgreSQL via127.0.0.1:5435. Do not report the incomplete container attempt as a pass.
- `node scripts/search-discovery.browser.cjs`:40 views (start/results/empty/short/invalid cursor × light/dark ×1440/390/320/1920); main WCAG axe0, no horizontal overflow/runtime errors, real keyboard submission/type/sort/access/clear/result/suggestion navigation in all8 theme/width combinations. Select and disclosure semantics checked in the browser.
- After the final app restart, the existing `playwright test e2e/tests/search-pagination.spec.ts` also passed (1 test, three theme/width states) against localhost3000; readiness returned200 and the final discovery page rendered successfully.
- Additional actual appearance-button light/dark/reload/cookie persistence, hover contrast/affordance, reduced-motion transition, Space-key disclosure, dimension/minimum persistence, automatic advanced open/clear-close, recency and100-character mixed-direction query at320px passed. Local evidence: `.mobocom/search-design/browser/{checks.json,interactions.json,*.png}`. Initial failed test assumptions (label names, navigation timing, mobile gutter) were corrected and the final checks re-executed.
- Installed React Doctor, two affected TSX files, `--scope files --no-telemetry --no-supply-chain --blocking error`: exit0;0errors/2warnings. The unchanged pure word-highlight mapping uses positional keys without child state; the existing route's conditional rendering remains a complexity advisory. No rule suppressions or broad refactor.
- Local Semgrep rules:3 TS/TSX targets,0findings/0errors; redacted Gitleaks:7 scoped product/test files,0findings. `git diff --check` passed. Graphify source-only incremental refresh passed and current status verified; graph relationships are static candidates, not runtime proof.

App3000 is restarted with final source; validation container is stopped. No hosted Actions, PR, merge, release, production deployment, settings change or production migration was performed. Rollback is this presentation/test batch; no stored data conversion is required. Preserve unrelated `client-registry.ts` line-ending work, `.serena/`, `public/demo/` and root checkout owner work. Destination-host production gates remain in [LAUNCH_READINESS](../LAUNCH_READINESS.md).

## Historical section audits

The helper is `.mobocom/claude-tools/audit-public.cjs <label> <route…>`. It runs with reduced motion, so the scroll-reveal fade-in of the cinema, games and software stages isn't read as low contrast. Raw reports are in `shots/public-audit/{sections,sections-final}.json`.

## Found and fixed

- **Promotions: 10 requests per page view.** Every promo slot asked on its own, so a page used 10 of a visitor's 240/min `promo:serve` allowance. Quick browsing, or many visitors behind one shared address, got 429 and empty slots.
  - The slots a page mounts together now ask in one request: `GET /api/promo/serve?ps=a,b,c` returns `{ ads: { a, b, c } }` (`parsePlacementList`, at most 16 valid keys, otherwise 400).
  - `p=` still serves a single placement.
  - Result: 50 → 5 requests over five pages, and no 429.
- **Pictures at drawn size** (the shared `sized`/`srcSet` helper, as the magazine does):
  - music track lists, the hero queue and artist cards;
  - review avatars;
  - cinema hero thumbnails;
  - software news cards.

  First-visit image bytes: `/music` 1.3 MB → 144 KB, `/music/browse` 1.6 MB → 78 KB, a track page 2.6 MB → 36 KB.
- **Readable accent, whatever accent the owner picks.** `src/shared/color/contrast.ts` is pure and unit-tested. From the theme's own colours, `layout.tsx` derives two pairs of tokens:
  - `--site-on-accent` / `--site-light-on-accent`: the ink for text on the accent;
  - `--site-accent-ink` / `--site-light-accent-ink`: the nearest shade of the accent that reads as text on the page. An accent that already reads is kept exactly.

  `studio.css` exposes them as `--on-accent` and `--accent-ink`. Light pages now follow the light accent for `--sds-theme-accent` too; the store used the dark one.

  The components that failed now use these tokens:
  - store «more» links, brands and the active tree or category;
  - the store rank badge;
  - the home eyebrows, links and product categories;
  - the section bar's active link (accent mixed with the bar text);
  - the music language chip.
- **Fixed colours deepened:**
  - deal badges (`--sx-deal-badge`);
  - the shop's light muted text and low-stock text;
  - software light muted and teal, the teal button, the dark chips and download controls, and the badge on the title band;
  - the cinema active season tab;
  - the quality badge, which now mixes with the stage text `--md-text`. The cinema and games stages stay dark in light mode.
- **Cinema in light mode:** the episode summary was dark text on the dark stage (1.03:1); it and the watch note now use the stage colours.
- **Structure:**
  - the big play button's accessible name now begins with its visible text;
  - the home section-tab labels are a named, focusable group instead of an empty `tablist`.
- **SEO:**
  - a shop category listing is titled and described by its category (`catalog/server/seo.ts`), and an unknown category is not indexed;
  - a music artist without a biography gets a description.

## Result (24 pages × light/dark × desktop/phone)

| Measure | Before | After |
|---|---|---|
| axe violations | 59 | 12 |
| Page/console errors | 7 | 0 |
| Overflow | 0 | 0 |
| Non-200 statuses | 0 | 0 |
| Image bytes, dark desktop (22 → 24 pages) | 7.9 MB | 2.8 MB |

## Checks

- TypeScript passes with 0 errors.
- `npm run check` is 702/6; the six are the known environment-only update-script failures. New units cover the placement list and the contrast helper.
- The architecture check passes.
- React Doctor shows 33 warnings on the changed TSX against 35 on main.
- Browser regressions still pass: `pw-themes` 17/17, `pw-journal-admin` 17/17, `pw-journal-review` 13/13, `pw-journal-proposals` 13/13 and `pw-journal-polish` 17/17.
- Store and software were inspected visually in light mode.

## Open

- **`nested-interactive` (12, all software): resolved 2026-10-26.** The trees (`TermTree` and the platform tree in `SoftwarePortal`) now give each branch a row link (`.sp-branch-head`) and its own disclosure: count plus chevron, named «N نرم‌افزار، زیرشاخه‌های …», placed where it was. axe reports 0 on the software pages, and `pw-software-tree` passes 4/4 (mouse, Enter, name, link).
- **Main buttons: resolved 2026-10-26 (owner's choice «متن خوانا»).** `--on-primary` and `--sds-theme-accent-on` now take the derived `--on-accent` in `studio.css` and in the MoboCom and Clean themes, with `src/themes/generated.css` regenerated. Links drawn as main buttons keep that ink in the media pages and the forum (`a.btn-primary`).
- **Images that can't be resized: resolved 2026-10-27.**
  - Pictures copied into the files storage (`/files/download/….webp|png|jpg|avif`, and their `/api/media/transfers/<id>` addresses, which pass `?w=` through the redirect) now answer an allowed width with a cached WebP copy, like covers. The copy lives in a dot folder that is never served.
  - `sized()`/`srcSet()` recognise both.
  - The cinema hero asks for a 1280 copy (960 on phones, chosen by CSS so only one is fetched), and only the active, previous and next slides carry their backdrop.
  - Posters, portraits, cast, game covers, software icons, gallery thumbnails and the player cover are drawn at their size.
  - **Results:**
    - cinema home 1103 KB → 445 KB on desktop and 378 KB on phone;
    - a title page 805 KB → 275/181 KB.
  - **Checks:**
    - the public audit of 7 pages × light/dark × 1440/390 shows axe 0, no errors, no overflow;
    - `pw-hero-backdrops` passes 4/4.
  - Demo SVGs are vectors and stay as they are.
- The home canonical is set by the root layout; the audit's «no canonical» for `/` is its own false positive, from stripping the origin.

## Forum and community — 2026-10-26

The audit covered 15 pages (board, forum, two topics, activity, leaderboard, clubs, badges, members, profile, search, people, feed, the community profile and categories), light/dark × 1440/390.

- **Avatars:** every forum and community avatar (`fx-avatar` in `forum/shared`, `Messages`, `TopicView` and `Composer`; `cm-avatar` in `CommunityIcons`) is now asked at twice its drawn size. A 1.6 MB PNG had been drawn at 20–76 px on most pages. Image bytes over the 15 pages: **13.3 MB → 266 KB**.
- **Text on the forum accent:**
  - `--fx-on-accent` (from the derived `--on-accent`) covers the active strips and filters, periods, unread, pager, notification counts, follow and quality toggles;
  - accent text on the page uses `--accent-ink`;
  - accent text on tinted chips uses a deeper mix (the side groups, the community side menu and the staff badge).
- **Board index:** a section heading had its link inside `<summary>`. The heading is now a row with its link, and folding is its own `summary.bi-fold-toggle` at the row's end, named «انجمن‌های …». `pw-board-fold` passes 5/5 (open, fold, Enter, name, link).
- **Activity avatars** are named by hidden text, and a group flair is `role="img"` with its name.
- **Result:** axe 63 → 34. The **28 left are all main buttons** (`.btn`/`.btn-primary`, white on the light accent), which wait for the owner's decision on `--on-primary`. Outside the main buttons there are 0 violations, and 0 page errors.
- **Checks:**
  - TypeScript passes with 0 errors;
  - `npm run check` passes, with only the six known environment-only failures;
  - React Doctor reports 45 warnings, the same as main.

## Main buttons — 2026-10-26

This follows the owner's choice of readable ink.

- **Result:** the whole public audit (37 pages × light/dark × 1440/390 = 148 variants, on the latest main including the owner's #242 and the review-reliability work) shows **0 axe violations**, 0 page or console errors, 0 non-200 and 0 overflow.
- **Browser checks:** pw-journal-review, pw-journal-proposals, pw-journal-admin, pw-themes, pw-journal-polish, pw-board-fold and pw-software-tree all pass.
- **Editorial decisions:** they now reach the author as durable `journal.editorial-decision` intents (owner's c05311aa). The two review browser checks accept the decision as queued or delivered, and remove their queued intents in cleanup.
