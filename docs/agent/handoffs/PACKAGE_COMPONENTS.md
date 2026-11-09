# Package-provided builder components — 2026-11-09

Branch `feat/package-components-2026-11-09`, stacked on PR398 (component library). Slice 4b of the MoboCom
"Elementor Pro" request: extensions add components declaratively, no server code. Owner merges/deploys.

## Boundary

- Package format: `components[]` for declarative packages only (max 30): kebab `name`, `title {fa,en}`,
  optional `category`/`description`, `template` (.html or {fa,en}) and `style` (.css), `fields` (max 20,
  normalized by the site component owner). Missing files, wrong extensions, duplicates and bad names fail
  `parseManifest`.
- `packages/server/components.ts` reads enabled plugins and the active theme package (memo per package
  revision/locale/theme), stable id `cc-p…` from package/name so placed blocks survive updates, CSS through
  `sanitizePackageCss` (asset URLs resolved), never JS. `GET /api/admin/packages/components` is read-only for
  page builders (permission inventory lists it).
- Dependency direction stays packages → site. The renderer (components layer) merges site and package
  components (site ids win), and package HTML goes through `sanitizePackageHtml` after values are filled in
  (values already escaped). The builder picker and the library page list both; package ones are read-only.
- Example `docs/packages/examples/promo-banner` gains `promo-card`; `docs/PACKAGES.md` documents `components`.

## Evidence (local)

- 219/219 package, AI, builder, account-security, navigation and routes cases incl. a new package-component
  case; full `tsc` clean.
- Real flow: the example ZIP packed on Linux, uploaded through the Admin API, enabled; the component listed
  with its stable id (limited staff 403); placed in page 98's draft, preview HTML had the escaped `onerror` image,
  no `javascript:` link, the asset URL rewritten and the CSS scoped. Draft restored byte-equal; package deleted.
- Not run: package component in the browser picker UI, e2e.
