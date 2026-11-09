# Builder custom component library — 2026-11-09

Branch `feat/builder-components-2026-11-09`, stacked on PR397 → PR396 → PR395. Fourth slice (4a) of the
MoboCom "Elementor Pro" request. 4b (components declared by declarative packages) is next. Owner merges/deploys.

## Boundary

- `site/domain/components.ts`: definitions (id `cc-…`, name, category, description, ≤20 typed fields
  text|textarea|color|number|url|image|select|toggle, HTML template, CSS, JS; ≤60 components). Placeholders
  follow the package format: `{{field.key}}`, `{{site.brand}}`, `{{locale}}`, and `{{#field.key}}…{{/field.key}}`.
  Values are typed (safe URLs only, colours as hex/var()/keywords, select within options) and always
  HTML-escaped; textarea keeps line breaks. CSS maps `selector` to `.cc-<id>`, drops `<`, imports, script URLs
  and expressions, and writes nothing if braces do not balance. JS runs once per instance with `root`.
- `site/server/components.ts` on the settings history owner (key `site.components.v1`); `GET/PUT
  /api/admin/components`: read by anyone who builds pages (cms.pages|posts|products|settings.manage), write
  only `SCRIPT_PERMISSION` with If-Match. Permission inventory lists the read path with its reason.
- Builder block `component` (Advanced group): props `componentId` + `values` (text, ≤20k). Inspector picks a
  component and edits values from its fields; the code itself is never edited per block. `BuilderRenderer`
  loads the library only when a page places a component; it server-renders escaped HTML + scoped CSS and
  `ComponentScript` runs the instance script once per page load (nonce + strict-dynamic CSP).
- Admin «ظاهر سایت → ظاهر و برند → کتابخانهٔ کامپوننت‌ها» (`/admin/components`): grouped cards, edit/copy/
  delete, fields editor, code, AI (`code-assist` target `component` returns fields too) and a sandboxed preview
  with default values at 390/820/1280.
- Preview frames (this and PR395's AI panel) now give their script the page's nonce: a srcdoc frame inherits
  the page CSP, so scripts never ran in previews before. The sandbox keeps no origin.

## Evidence (local)

- 212 related cases (AI, builder, navigation, routes, account-security, brand) incl. 2 new component cases;
  full `tsc` clean.
- Real API: save with revision; limited staff 403.
- Browser: a component block in page 98's draft rendered with `<script>` shown as text (no script element, no
  dialog), toggle section, scoped border and JS run once with `root`. The library editor preview rendered
  defaults, CSS and (after the nonce fix) JS. Draft 98 restored byte-equal; test library deleted.
- Not run: AI component generation against a real provider; e2e.
