# Section names managed from Admin — 2026-11-10

Branch `feat/section-names-everywhere-2026-11-10`, stacked on PR406 (`fix/magazine-path-social-autopost-2026-11-10`).
Owner merges/deploys.

## Owner rule

Every section's name and address is managed from Admin, and anything newly built must be manageable/editable from
Admin (see PLATFORM_DECISIONS 2026-11-10).

## Boundary

- Owner: `site/domain/section-names.ts` (pure normalize + `sectionLabel`), `site/server/section-names.ts`
  (`site.section-names.v1` through `createSectionSettingsHistory`: revision, If-Match, audit `sections.names.update`,
  history type `settings-section-names` restorable). Empty entry = built-in name (kept as an entry because the history
  merge keeps missing keys).
- Admin: Admin › بخش‌های سایت › each section: «نام بخش» (fa/en, placeholder = built-in) beside «آدرس بخش»;
  `POST /api/admin/sections { id, names }`. Hub cards show the current name and the default.
- Shown everywhere through one table: server `sectionDisplayName(id, fa, fallback)`; components
  `<SectionName id fa en>fallback</SectionName>` (no hooks; works in server and client components) read
  `shared/site/section-names` filled on the server by `getSectionNames()` and in the browser by
  `SectionNamesProvider` in the root layout (same pattern as the address table).
- Applied: admin menu section titles (`/api/admin/extensions/navigation`), journal crumbs (PR406 helper now reads
  the central store; the journal-only manifest keys from PR406 were removed before release), store/product crumbs,
  games/software/cinema/prompts/forum/businesses crumbs and section links in compare/favorites, maintenance notice.
- Not changed: the public header menu (its own editor in «منوها»), action phrases such as «رفتن به فروشگاه», role and
  permission labels in Admin, page `<title>`s (each section already has an SEO title setting).

## Also fixed

PR405's organized upload made `editor.test` fail (lazy import in the media route): the organizer now loads only when
the upload names its item.

## Evidence (local)

- seo 7, routes 18, site 17, editor 26, navigation 27, forum-community 18, store 11, plus the suites that reference
  changed files; full `tsc` clean.
- API + browser: games → «سرگرمی»/Play and store → «بازار موبوکام»: server crumb (/games/top), client crumb
  (game detail), store listing, admin menu titles; admin name card; reset to defaults verified.
