# Cinema discovery and clear filmography

[Executed evidence and continuation](../../agent/handoffs/CINEMA_DISCOVERY.md). Current branch is stacked on Music profiles commit2c71e7ef; do not recreate it in the older root checkout.

## Evidence and scope

Existing Cinema browse/people/credits/publication rules and shared PosterCard/Pager own the capability. The wide-section stylesheet overrides browse columns and forces children across both columns. Scope the repaired browse layout independently; preserve Homepage/Cinema home, title pages, URLs, published data, module guards and existing filters. Extend canonical CinemaCredit queries for exact actor and director filtering, not cast-JSON matching or a second people registry.

## Outcome and contracts

Wide responsive search panel with visible query, type/genre/year/country, searchable actor/director selection, dubbed choice, sorting, removable active filters, reset, useful empty/error/pending states and normal GET URLs. New actor/director IDs compose with every existing filter using CAST/DIRECTOR credits; invalid IDs match nothing. Public suggestions extend the existing people owner with a bounded names-only projection, require at least two normalized name characters and never load a whole filmography; only people with published credits in the requested role are returned. No authentication or private fields; existing module guard and public request limiter. No mutation, upload, schema or settings change.

Person profiles explain that counts refer to works available on MoboCom; show role labels separately from counts. Use true per-role published totals and bounded latest-work previews with links to the complete filtered catalogue. Directory counts distinct works when the same person has two roles on one title. Keep biography, profile editing, portrait/credits and nonce-bearing Person JSON-LD.

## Acceptance

Register cinema-discovery PostgreSQL check on owned fixtures: exact CAST vs DIRECTOR, old and curated spellings, combined filters, stable pagination/sort, invalid IDs, draft/future/private-only exclusions, empty/id-restricted lists, public option bounds and unique directory counts. Run existing Cinema people/profile regressions; deliberately remove role/live constraints in an isolated snapshot and detect failure. Relevant non-root/no-.env units/types/architecture/source/security, React Doctor and real localhost browser keyboard/suggestions/selection/removal/GET history/sorting/pagination/empty/error flows. Capture baseline and1440/390 light/dark layouts, assert no overlap/overflow and scoped axe. Owner merges/deploys; no hosted Actions.
