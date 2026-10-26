# Public sections quality — 2026-10-26

This continues the magazine's public audit across every public section: cinema, games, software, music, the store, the site home and the magazine. It covers 24 pages, each in light and dark, at 1440 and 390 px.

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
- **Images that can't be resized:** cinema pictures under `/files/download/…` and the demo SVGs are not site uploads; the cinema home is about 1.1 MB because of them.
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
