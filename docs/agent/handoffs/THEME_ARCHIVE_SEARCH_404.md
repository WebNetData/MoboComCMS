# Theme templates for archive, search and not-found — 2026-11-09

Branch `feat/theme-archive-search-404-2026-11-09`, stacked on PR399 → PR398. Fifth slice of the MoboCom
"Elementor Pro" request. Owner merges/deploys.

## Boundary

- Theme builder types `archive` (code `archive`), `search` (`search`), `not-found` (`notfound`): page ids,
  labels, icons, default rule `all`, permission `settings.manage` through `permFor`.
- Rules: archive offers all / magazine (`blog`) / shop / post-category / product-category; scoring uses a new
  `archive` render context with `archiveOf` and the listed category's ancestry. Search and not-found accept
  only `all`. Header/footer scoring is unchanged (covered by a case).
- `ThemeFrame` (components layer) resolves the published template and renders it with the owner's output in
  the existing `surface-content` slot (or after the template when it has none); without a template nothing
  changes. Values for the dynamic value block: title, excerpt (count) and url.
- Owners wrapped: magazine listing (category, query, archive pages; landing and placed pages unchanged),
  filtered shop listing (`ShopArchive`, category ancestry by slug), search results (inside MediaShell), and
  `not-found` (status 404 kept, header/footer unchanged).
- Starting designs: list + newsletter CTA, results + browse CTA, 404 message + latest posts.

## Evidence (local)

- 237 related cases incl. a new theme case; later 151-case rerun after preset changes; full `tsc` clean.
- Real flow: three templates created from presets and published through the theme API; /blog?page=1,
  /blog?category=news, /products?q=router, /search?q=test and a missing URL each rendered inside their
  template with the right dynamic title and the original content (404 kept). Browser 1280/390: no overflow or
  page errors; the 404 preset showed three real posts. Templates deleted; theme index restored byte-equal.
- Not run: editing these templates in the builder UI with live preview data; e2e.
