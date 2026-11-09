# Builder per-element custom CSS — 2026-11-09

Branch `feat/builder-custom-css-2026-11-09`, stacked on PR395 (builder AI code). Second slice of the
MoboCom "Elementor Pro" request. Owner merges/deploys.

## Boundary

- `AdvancedStyle.customCss` (site `builder-style.ts`) on any section, column or block; validated by the
  existing `validateAdvancedStyle`, so drafts, saves, templates and history carry it with no schema change.
- `cleanCustomCss` drops `<` (nothing can close the style tag), `@import`, `expression(`, `behavior:`,
  `javascript:`/`vbscript:` and `-moz-binding`; max 8000 chars. `customCssFor` maps the `selector` keyword
  to the element's own class (`.br-x-<id>`), wraps plain declarations in that rule, and writes nothing when
  braces do not balance. It is appended last in `advancedCss`, so it overrides the visual controls.
- Rules not using `selector` are allowed (owner wants free hands) and apply only where that element renders.
  CSS is not script: it follows the builder's existing page permission, not `SCRIPT_PERMISSION`.
- Style panel: «CSS اختصاصی این عنصر» textarea (stored on blur, one undo step) with an AI panel in CSS
  mode (`code-assist` target `css`: `selector`-based prompt, CSS-only result, scan treats `selector` as
  in scope). The AI endpoint still requires `settings.manage`; others can type CSS by hand.

## Evidence (local)

- 130/130 `scripts/ai.test.cjs` + `scripts/builder.test.cjs` incl. a new custom CSS case; full `tsc` clean.
- Browser on page 98: field and AI panel shown; custom CSS committed to the draft through the real save path;
  `/builder-preview/98` HTML contained `.br-x-w-… { outline: 3px … }`. Page 98's draft was backed up and
  restored byte-equal. The empty code-mode `page.builder.draft.home` is a leftover of the PR395 browser test.
- Not run: AI CSS against a real provider; e2e.
