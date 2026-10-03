# Feature: Journal multi-type entity links

## Outcome
An editor can attach any currently public content entity — game, software, studio, cinema title, album, track, artist or product — to a Journal article through the existing `itemLinks` payload, and readers see those entities in editor order on the article page. Article-to-article and forum-thread links stay out of scope. The product tab keeps its existing product-specific reverse direction.

## Existing evidence
- Products slice: `docs/specs/journal-entity-references/SPEC.md` (PostItemLink table, CMS `itemLinks` transaction, picker, product-tab priority, article rail, tests) is shipped and verified.
- Shared content registry `src/modules/content/domain/items.ts` + `src/modules/content/server/registry.ts` already defines `ITEM_TYPES`, `ITEM_MODULE`, `itemPath`, `enabledItemTypes` and `itemCards` (publication + module gated cards with canonical URLs).
- Admin picker: `GET /api/admin/journal/link-products` (`src/modules/journal/server/http/routes.ts`), UI `src/app/admin/posts/PostProductLinks.tsx`, e2e `e2e/tests/journal-item-links.spec.ts`.
- Storage `PostItemLink(postId, itemType, itemId, position)` with `@@unique([postId, itemType, itemId])`, cascade on post delete, migration `20261121120000_post_item_links`.

## Canonical ownership
Journal owns the relation table, the `itemLinks` payload contract and the authoring UI. The content registry owns public visibility, module enablement and canonical URLs; Journal must not re-implement per-type visibility. Catalog keeps the extra Store/storefront gate for `product` refs.

## Actors & authorization
- Editor: `cms.posts` through the existing admin CMS route; the picker stays behind `adminGuard(req, 'journal', ['cms.posts'])`.
- Reader: public article page, currently public refs only.
- Guest: picker denied (403); article markup never exposes hidden targets.

## Scenarios
### Happy path
1. Editor opens an article, picks an entity type, searches (≥2 chars, bounded 25 results), adds refs in order (max 12).
2. Save validates and writes refs in the same transaction as the post; `GET /api/admin/cms?type=posts` returns them as `itemLinks`.
3. The public article renders a related-entities rail using each card's canonical `url` and `title`.

### Failure / empty / loading / disabled-module paths
- Malformed, duplicate (same type+id), unknown-type (`post`, `thread`) or oversized payload → `Invalid article links`; new ref whose target is not currently public → `Linked public item not found`; both abort the whole post edit (rollback).
- New `product` refs additionally require the Store module and an open storefront → `Store is unavailable`. Existing refs of a withdrawn/disabled target stay editable; they are simply omitted from public output.
- Picker shows loading, empty and error states; selected refs stay visible after clearing the query; disabled types return no matches, and hidden targets never appear in `matches`/`selected`.
- Public rail drops refs whose module is disabled and product refs while Store/storefront is off, keeps other types, and renders no section when nothing is visible. Disabled Journal keeps the product tab empty as before.

## Data invariants
- No schema change. `itemType` is the registry vocabulary constrained at the payload boundary by `LINKABLE_TYPES = ITEM_TYPES \ {post, thread}`; unique `(postId, itemType, itemId)`; `position` = editor order; post delete cascades.
- Max 12 refs, unique `(type, id)` pairs, order preserved end to end.

## Admin settings / feature flags
None new; existing Admin Control Plane module flags (journal/store/games/software/cinema/music) drive availability.

## Contracts
HTTP (admin, authenticated): CMS `itemLinks` optional array of `{ type, id }` unchanged; new `GET /api/admin/journal/link-items?type=&q=&refs=type:id,...` returning `{ matches: Card[], selected: Card[] }` where `Card = { type, id, title, titleEn, url, image }`; legacy `GET /api/admin/journal/link-products` keeps numeric `ids` and the existing product fields (`name`, `nameEn`, `slug`, `active`, `approval`).
Public output: HTML rail only — no new public API, URL or event versions.
Events: none.

## Unified identity impact
None. No new Identity, CRM Contact or settings behavior.

## UI
Admin editor panel only: type select + search + chips in the existing dark Admin card, RTL/LTR via `useI18n`, existing mobile grid. The public rail reuses `journal-related` + `ln-card-plain` in `src/app/journal-design.css`, so the protected Journal visual is preserved.

## Security/privacy
Picker access is `cms.posts`-gated; only currently public items can be selected; every render re-checks visibility through the registry; no secrets and no cross-user data in output.

## Migration & compatibility
No migration. Old clients that omit `itemLinks` keep stored links; explicit empty list clears; legacy `link-products` route keeps answering; product behaviour (validation, product tab, storefront gate) is unchanged.

## Acceptance verification
- Unit: `node --test scripts/journal-item-links.test.cjs scripts/journal-picker.test.cjs scripts/journal-scheduling.test.cjs scripts/journal-dashboard.test.cjs`
- Connected: `node scripts/journal-item-links.connected.cjs` and `node scripts/journal-item-links-api.connected.cjs` against the local app + PostgreSQL
- Browser: `npx playwright test e2e/tests/journal-item-links.spec.ts`
- Gates: `npm run typecheck`, `arch:check`, `schema:check`, `security:check`, `source:check`, `test:site`, `build:postgres`
- Do not report any gate that was not run.
