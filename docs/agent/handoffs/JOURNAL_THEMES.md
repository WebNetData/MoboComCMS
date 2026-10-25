# Magazine light edition — 2026-10-15

## Edit proposals of published articles — 2026-10-26

Spec slice 2: [docs/specs/journal-review/SPEC.md](../../specs/journal-review/SPEC.md).
- **Data:** table `PostEditProposal`, migration `20270119120000_post_edit_proposals`.
- **Logic:** the pure rules sit in the journal domain; the owner in `journal/server/review.ts` handles `proposePostEdit`, `decidePostProposal`, `proposalView` and `waitingProposals`; the cms route wires them in.
- **Admin UI:**
  - `PostProposalPanel` shows the manager a diff and apply/reject;
  - `PostProposalNotice` tells the author what a save does;
  - `AdminCrud` gains `FieldDef.showWhen`, `submitLabel` and a save `notice`;
  - the unused `rowLocked` was removed.
- **Where proposals show:** the dashboard item «پیشنهاد ویرایش», the filter `state=proposed` and the staff-overview source `proposal-posts`.
- **Evidence:**
  - native PG `journal-proposals` passes, and four deliberate faults each fail it;
  - `journal-review` still passes (its live-edit expectation is now a proposal);
  - `npm run check` is 701/6 (schema parity and the migration list pass); the moderation-queue and dashboard units were updated;
  - TypeScript passes with 0 errors;
  - React Doctor reports no warnings beyond the base branch;
  - browser: `pw-journal-proposals` 13/13, `pw-journal-review` 13/13, `pw-journal-admin` 17/17 and `pw-journal-polish` 17/17, fixtures removed and the setting restored.

## Public magazine audit: listing SEO, picture sizes, translate control — 2026-10-25

An audit after the admin batch covered 8 public magazine pages × light/dark × 1440/390 (home, archive, category, search, empty search, two articles, page 2). It measured status, timings, overflow, page and console errors, SEO tags, JSON-LD, pictures and WCAG 2.1 AA (axe). Raw report and helper: `.mobocom/claude-tools/audit-journal-public.cjs`, `shots/journal-public/report*.json`.
- **Listing SEO (was REGRESSED):**
  - category pages, archive pages and page 2 all carried the generic «مجله» title and description, and declared `/blog` as canonical, contradicting the sitemap, which lists `/blog?category=<slug>`;
  - now `journalListingMeta` (pure, `journal/domain/journal.ts`) with `journal/server/seo.ts` gives a category its own title, description and canonical (`?category=<slug>[&page=n]`), and an archive page its own canonical with «صفحهٔ n» in the title;
  - a search, or a category that does not exist, is `noindex, follow`;
  - the home keeps the section SEO settings;
  - unit test in `journal-scheduling.test.cjs`.
- **Picture sizes (WEAK_PERF):**
  - before: a 1.6 MB profile PNG drawn at 20 px, covers 1550 px wide in 229 px boxes, and the 1550 px site logo preloaded on every page;
  - profile pictures now resize like covers (`/api/profile/media/<id>?w=`, a cached WebP; `readProfileMedia`);
  - the shared `sized`/`srcSet` helpers know them, without the covers-only media CDN;
  - the magazine cards, rows, overlays and avatars, the article's pictures, the site logo (`SiteLogo`) and the MoboCom theme home (through the theme SDK: `themeImage`, `themeImageSet`) ask for drawn sizes;
  - full-width backgrounds (the magazine hero, the archive band, the article hero) keep the original for sharpness;
  - first-visit image bytes: /blog 3.2 MB → 220 KB, an article 712 KB → 109 KB, the site home 1.9 MB → 290 KB.
- **Translate plugin (a11y):** the phone language button had no accessible name, and «Translate» was white on light blue (contrast 2.08 in dark, 3.16 in light); it now has an `aria-label` and dark text.
- **Final run:** all 32 page variants return 200 with no overflow, no page or console errors and no broken images, and axe reports 0 violations (before: two on every page).
- **Checks:**
  - TypeScript passes with 0 errors;
  - `npm run check` is 701/6 (one new test; the six known environment-only update-script failures);
  - React Doctor reports the same 24 warnings as main;
  - pictures inspected at 2x density.
- **Lazy loading:** pictures below the first screen now load as they near view. That covers the footer logo in the default footer and the MoboCom and Orbital themes (`Wordmark lazy`), the article's author box, and the MoboCom home's member and post-author pictures; the audit found 0 left on the 32 variants and the site home.
- **Open:** demo SVG covers and the static fallback image are not site uploads, so they are not resized.

## Editorial review — 2026-10-25

Spec and owners: [docs/specs/journal-review/SPEC.md](../../specs/journal-review/SPEC.md).
- **Domain** (`journal/domain/journal.ts`): the setting `reviewAuthorPosts`, `PENDING_REVIEW`, the three form statuses, `authorReviewRefusal` and `approvalPublishedAt`.
- **Owner** (`journal/server/review.ts`): the decision with compare-and-set, version, audit and notice; the queue reader.
- **Route** (`site/server/http/admin/cms/route.ts`): create, save, batch and decision.
- **Block-editor lock** (`editor/server/documents.ts`, `authorLocked`).
- **Shared places a decision waits:** the dashboard count (drafts now count only drafts, matching their link), the staff overview source `review-posts`, and the Inbox kind `POST_REVIEW`.
- **UI:**
  - the settings checkbox;
  - the author form offers draft or review only;
  - a published article is locked for the author with its reason;
  - the manager's decision panel sits under the save button (`PostReviewPanel`, via `AdminCrud.renderAsideExtra`);
  - AI autofill, the writing assistant and paid access are hidden from authors, as the section-author decision already said.
- **Evidence:**
  - native PG `journal-review` (registered) passes, and four deliberate faults each fail it: the publish refusal removed, the live-edit refusal removed, the approval time rule removed, the decision without its `PENDING` condition;
  - `npm run check` is 700/6, the same as main; two units were updated (the moderation-queue sources, and the dashboard mock now counts drafts as drafts);
  - TypeScript passes with 0 errors;
  - React Doctor reports 22 warnings on the changed TSX against 26 on the base, with no errors;
  - browser `.mobocom/claude-tools/pw-journal-review.cjs` passes 13/13 on two consecutive runs: settings, author form and lock, dashboard, overview, pending filter, return with a note, approval with the time rule, notices; fixtures removed and the setting restored;
  - `pw-journal-admin` 17/17 and `pw-journal-polish` 17/17 still pass.

## Magazine admin: writing form, phone list, category tree — 2026-10-25

- **Post form:** WordPress-like layout. The writing column holds the title (first, full width), the address, the excerpt, the body, related content and the writing assistant. A side column holds publishing (with the save button and version history at its top), categories and the cover, and it stays in view while writing (shared `AdminCrud`: new optional `aside` and `FieldDef.wide`). Below 1180px it is one column.
- **Phone list:** under 700px every `AdminCrud` list (posts, pages, products) is a stack of cards. Each cell names its column, the title (a product's name) leads, and the selection box and actions keep their place. Desktop keeps the table.
- **Category tree:** the meta line reads the address (LTR), then a count in the reader's digits or «بدون زیرشاخه»; it no longer jumbles direction.
- The sticky column needed the panels' main area to stop being a scroll box (see PLATFORM_DECISIONS, layout).
- Evidence:
  - browser `.mobocom/claude-tools/pw-journal-polish.cjs` passes 17/17 on two consecutive runs: form order, side sections, side column beside the writing column and the save button in view mid-form, phone cards for posts, pages and products, desktop tables unchanged, category meta, read-only;
  - `pw-journal-admin.cjs` still passes 17/17;
  - a sweep of 31 admin pages at 390 and 1440 px found no content cut off;
  - TypeScript passes with 0 errors, and `npm run check` is 700/6, the same as main;
  - React Doctor warnings are equal to the base branch.

## Magazine admin: one workspace, a narrowable posts list — 2026-10-25

- The posts, categories and comments pages now sit in the same magazine tabs as the dashboard and settings (`JournalShell` from `src/app/admin/journal/shared.tsx`, the CinemaShell/MediaCrud pattern).
- The posts list (shared `AdminCrud`, new optional `filters` and `thumbnailKey` props) narrows by state (live, scheduled, draft, trash, with counts), category (its sub-categories and secondary placements included), featured, and VIP access while the membership module is on. The filters are kept in the address. Covers sit beside titles, and ids read in the reader's digits.
- Server: `parseAdminPostFilters` and `adminPostStateWhere` (pure, `journal/domain/journal.ts`) and `adminPostFilterWhere` / `adminPostStateCounts` (`journal/server/admin.ts`) are applied by the existing cms list route inside the author's own scope and together with search and paging. Unknown values get 400. There are no new routes, permissions, settings or schema changes.
- The dashboard's draft, scheduled and featured queues open the matching narrowed list, and a quality row opens that article's form (`?edit=<id>`).
- Evidence:
  - native PG `journal-admin-filters` (registered) passes, and four deliberate faults each fail it: a scheduled post leaking into live, a category without its sub-categories, an unknown state ignored, filters not applied;
  - `npm run check` 700/6, the same as main (the 6 failures are the known env-only update-script tests);
  - TypeScript passes with 0 errors;
  - React Doctor shows warnings identical to main;
  - browser `.mobocom/claude-tools/pw-journal-admin.cjs` passes 17/17 on two consecutive runs (desktop and 390px, read-only).

## Cover visibility and archive pagination — 2026-10-16

Continue `.mobocom/autonomous-foundation`, branch `fix/journal-cover-pagination-2026-10-16`. It is stacked on the locally completed business presentation commit `8856859e`; preserve that batch and unrelated root/untracked `.serena`/`public/demo` work. Both slices continue the existing owners.

- Confirmed `WEAK_UX`/`REGRESSED`: category TextCards covered their images with90% dark or96% light masks. Scoped `.lh-text` now uses a bottom gradient and explicit cinematic light copy in both themes. Original image URLs/files, homepage hero, surrounding light canvas and the other card compositions are retained. This supersedes the historical light TextCard treatment below.
- Pagination already existed in the canonical BlogPage count/take/skip queries with Admin `journal.home.v1.pageSize`. The broken landing decision treated a clamped first archive page as home; six homepage archive links also began at page2. `/blog` remains the editorial/builder homepage; explicit `/blog?page=1` is the first complete archive page. Invalid/high pages clamp inside the archive. All existing archive links now begin at1; homepage gains a clear all-stories entry. Category/search/secondary category/publication rules and stable publishedAt/id ordering remain in the same query owner.
- Pure `journal/domain/pagination.ts` supplies URL/page/window math; server-only `components/journal/JournalPagination` supplies numbered links, first/last reachability, gaps, current/disabled states, prev/next relationships and actual range/count. URLs preserve category/query; selecting all categories and clearing archive search keep the complete archive. Existing Admin page size is reused, with no new setting, route, permission, data store or migration.
- Executed Linux UID1000 in an owned tracked-source snapshot without `.env`: full TypeScript, architecture/source checks and12 journal picker/scheduling/pagination units passed. Registered native PostgreSQL `journal-pagination` tests the actual BlogPage/query owner: exact/disjoint/tie-ordered pages, primary/secondary/child categories, search, page-size settings, draft/future exclusion, empty/invalid/last pages, explicit archive/home and unchanged fixture content/status. Three faults in a separate owned source copy (archive→home, lost offset, future leak) each failed; restored source passed. No live source was faulted.
- Actual localhost cover checks passed light/dark1440/1920/390: original picture loaded, scoped block axe/no overflow and article navigation; hero/background/canvas computed values matched the pre-batch CSS rendered in an isolated page. Before/after screenshots retained and desktop image visually inspected. The baseline is a reconstruction from the pre-change tracked stylesheet, not a claimed second live deployment.
- With245 disposable public posts and the current Admin page size, actual category/search/next/previous/page5/last/empty navigation passed exact non-overlapping sets. Eight light/dark1920/1440/768/390 listing views passed scoped WCAG2/2.1AA axe, overflow, visible focus and real keyboard next-page activation. Page anchors clear sticky navigation. Final cover/paging runtime errors were empty; mobile light pagination visually inspected. After cleanup the original19-post dataset correctly gives one archive page even for a high requested page, without switching to home.
- React Doctor three files exited0/no errors. Four existing diagnostics were reviewed: required section export, owner-page complexity/sequential await and metadata declared in the route wrapper. The introduced array-index key warning was fixed with stable gap keys. Scoped Semgrep ran the existing single dynamic-code rule on four production files with0 findings; path-pattern advisories remain. No comprehensive security/SEO, fresh full-check/build/release or whole-magazine accessibility claim.

Raw ignored evidence/helpers: root `.mobocom/journal-paging-evidence` and `journal-paging-{browser,fixture,validate,faults}.cjs`. Native/browser fixtures were removed; module/journal/security settings and stored article content/covers were not rewritten. Normal browser reading can emit existing view/analytics events. The first exploratory navigation before local startup readiness failed; no check success is claimed from it. No Actions/push/PR/merge/deploy for this slice.

Owner requested a working light/white version of the existing magazine. Continue the current authoritative `.mobocom/autonomous-foundation`; this extends the existing Liona composition, not a new theme or page implementation.

## Ownership and behavior

- `src/app/journal-liona.css`: explicit `html[data-theme="light"] .journal-lh` semantic surface/text/border tokens; readable cyan accent, pale category/panel colors, white hero list and light archive wash. The photographic hero and image-overlay story cards retain their cinematic treatment (see owner correction below). Existing dark declarations, geometry, content ordering and interactions remain unchanged.
- `src/app/journal-design.css`: light article canvas uses existing `--card`; cinematic article cover and syntax/code treatment remain. Existing site theme control/cookie and Admin semantic colors are authoritative; no parallel toggle/settings/theme registry.
- No source React, API, permissions, data, schema, public URL or package changes. Existing section navigation/search/listing and shared header/footer are retained.

## Executed evidence

- Real localhost PostgreSQL-backed browser before/after1440 and390, light/dark: original light magazine background18/19/28 was reproduced; final light255/255/255 with dark text, original dark colors retained. Final light landing scoped axe has zero violations at both widths; no page overflow.
- Actual independent desktop/mobile contexts: theme control light→dark→light, category navigation, search/empty state, existing article navigation/white canvas and article contrast passed; final runtime/hydration errors empty. The harness waits for actual rendered styles across theme reloads; early mixed-context/transition/hidden-input selector attempts were corrected and are not passing evidence.
- Article mobile code block has a pre-existing `scrollable-region-focusable` finding on `pre`, reproduced in light and dark and recorded separately. Existing dark landing has white-on-cyan badge contrast findings; the light edition fixes its own badges. Do not claim whole-magazine WCAG compliance. These untouched legacy issues are follow-up candidates.
- Linux UID1000:10 existing journal picker/scheduling tests passed; their legacy revision mocks log errors while tests pass. Native read-only PostgreSQL version/Settings query passed; no rows written by this batch.
- Installed React Doctor on unchanged `LionaHome.tsx`: exit0, one existing required section-export warning, no blocking errors. No suppression or clean-file claim. CRLF-aware owned diff whitespace check passed. No full TypeScript/build/release/hosted Actions rerun for this CSS-only slice.

Root ignored evidence: `.mobocom/journal-theme-evidence` (before/after screenshots/colors, landing axe files, `acceptance.json`, separate article legacy finding). `dark-article-existing-scroll-check-390.png` is explicitly the dark comparison; final `light-article-390.png` / `light-article-reading-390.png` are fresh actual light captures. Desktop landing and mobile article screenshots visually inspected. No push/PR/deploy in this batch.

## Article width, reading tools and category breadcrumb — 2026-10-15

Continue the same implementation and branch. The owner requested wider articles, a reading percentage that stays visible beneath the sticky magazine navigation, and a styled topic-page breadcrumb.

- `journal-design.css`: article shell follows the existing MoboCom `--mb-chrome` width; the reading rail clears the section bar and its lower veil in the MoboCom design. Other designs retain their existing rail offset. The existing progress calculation, sharing controls and mobile rail visibility are unchanged.
- `journal-liona.css` and the existing blog page: semantic ordered-list breadcrumb with shared portal icons, current-page marker, focus styles and wrapping; theme-aware category heading panel/count. Existing URLs, category/search logic, permissions and data owners are unchanged. No schema, settings or package changes.
- Reproduced before: article shell1280px at1440/1920 while header1408/1888; the reading meter could sit at107px under the section bar ending144px, with hit-testing reaching navigation. After: shell1408/1888 (mobile390 shell366), meter187px/rail176px, and hit-testing reaches the meter itself. Actual down/up scrolling updates the existing percentage.
- Actual PostgreSQL-backed browser checks passed light/dark1440, light1920 and light390: rail clearance, wide shell, no page overflow, category current marker, breadcrumb navigation and scoped category-heading axe0; final runtime/hydration errors empty. Desktop category and scrolled article screenshots visually inspected. Root ignored evidence: `.mobocom/journal-layout-evidence` (`before.json`, `after.json`, screenshots).
- Native read-only PostgreSQL version/Settings query and architecture check passed. Scoped React Doctor exit0 with three existing warnings (route-owned metadata, complexity, sequential awaits), no blocking errors or suppressions. Initial TypeScript check caught an unsupported icon name; replaced it with the existing typed `grid` icon before final verification. See the final gate entry below for the rerun result.
- Existing dark badge contrast/mobile article code-block keyboard findings from the light-edition handoff remain outside this slice. No whole-magazine accessibility, full build, hosted Actions, push, PR or deployment claim.

Final gate: after using the supported icon and restarting the app from the authoritative source, full Linux UID1000 TypeScript (`tsc --noEmit --incremental false`) passed, and all four browser variants above passed again. CRLF-aware owned diff whitespace check passed. No additional unit suite was run for this layout/markup slice.

## Owner correction: photographic hero — 2026-10-15

The owner rejected the washed-out landing cover: the light veil used88–94% white opacity. Keep this photographic surface cinematic in both themes, with light heading/summary/meta/category labels; the surrounding light page and light side-list retain their semantic surfaces. The existing veil now accepts a local `--lh-hero-bg` override in light mode instead of a second white gradient. No image URL, source data, composition, interaction or dark-mode value changed.

Executed before/after browser evidence: light1440/1920/390 and dark1440/390; original cover URL retained and decoded, light page/list colors preserved, dark computed values unchanged, no document overflow or runtime/hydration errors. All five variants passed hero-copy scoped axe, keyboard focus and actual heading-link navigation to the article. Desktop/mobile light screenshots visually inspected. Native read-only PostgreSQL query passed; React Doctor on unchanged LionaHome exit0 with its existing section-export warning, no blocking errors or suppression. CRLF-aware whitespace gate passed. Raw ignored root evidence: `.mobocom/journal-hero-evidence`. No unit/TypeScript/build rerun for this CSS-only correction; no whole-magazine accessibility claim, Actions, push, PR or deploy.

## Remaining journal accessibility fixes — 2026-10-15

Owner approved closing the two recorded legacy issues after merged PR188. Dark badges/active small category chips now mix the existing category hue with the cinematic dark surface to preserve white-label contrast; the light edition and photographic hero remain unchanged. Canonical rich-text code rendering and sanitized legacy pre blocks supply a fixed tabindex0, named region and no authored tab order/handlers; journal CSS shows a visible focus outline. Stored documents/content are not rewritten.

Executed: four actual localhost browser variants1440/390 light/dark; full landing color-contrast axe and article reading-region WCAG2/2.1AA axe returned zero violations. Native ArrowRight scroll moved the real overflowing mobile pre40px in both themes; focus outline/accessible name checked. Runtime errors empty.19 editor tests passed as Linux UID1000, including escaping and hostile authored tabindex/handler rejection; read-only actual PostgreSQL check passed. Initial suite18/19 failed an unrelated Windows CRLF-only source regex; made that assertion newline-portable without loosening its semantic check, then all19 passed. Raw ignored root `.mobocom/journal-a11y-evidence`. No full-release/production claim; no hosted Actions.
