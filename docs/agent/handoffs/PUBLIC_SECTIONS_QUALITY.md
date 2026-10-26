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

- **`nested-interactive` (12, all software):** the platform tree puts a link inside `<summary>`. Fixing it needs that tree's markup and styles reworked (a link plus a separate toggle).
- **Main buttons:** they still carry white ink on the light accent (2.1:1 dark, 3.3:1 light). `--on-accent` is ready; switching `--on-primary` to it changes every main button's look, so it waits for the owner's decision.
- **Images that can't be resized:** cinema pictures under `/files/download/…` and the demo SVGs are not site uploads; the cinema home is about 1.1 MB because of them.
- The home canonical is set by the root layout; the audit's «no canonical» for `/` is its own false positive, from stripping the origin.
