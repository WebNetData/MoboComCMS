# Builder scroll and pointer effects — 2026-11-09

Branch `feat/builder-scroll-pointer-effects-2026-11-09`, stacked on PR401 → PR400 → PR399 → PR398. Sixth and
last planned slice of the MoboCom "Elementor Pro" request. Owner merges/deploys.

## Boundary

- `AdvancedStyle` (any section, column or block) gains `sticky` top|bottom + `stickyOffset` 0–300px,
  `parallax` −60…60px, `scrollFx` fade|shrink|blur|rotate (while leaving the screen) and `pointer`
  tilt|magnet|spotlight; all through `validateAdvancedStyle` (spotlight is dropped with the beam surface,
  which owns `::before`). No schema change.
- `advancedCss` writes one animation list per element so the entrance (entry range), parallax (cover range,
  `--br-plx`), exit effect (exit range, fill forwards) and loop (auto timeline) never overwrite each other;
  scroll-linked parts only under `@supports (animation-timeline: view())`, everything under
  `prefers-reduced-motion: no-preference`. Keyframes live in `builder-render.css` and use individual
  transform properties like the existing loops.
- Pointer effects: CSS reads `--mx/--my/--ptr-on` under `(hover: hover) and (pointer: fine)` and full motion;
  `PointerEffects` (one document listener, rAF, mouse only) sets them on the `.br-ptr` element under the
  pointer. The renderer mounts it only when the page or a template it uses asks for a pointer effect. Tilt
  and magnet move the element's children so they never fight the element's own animations.
- Style panel «اسکرول و نشانگر» group in Advanced.

## Evidence (local)

- 251 related cases incl. a new effects case; full `tsc` clean.
- Browser on page 98's draft (restored byte-equal each time): parallax + fade-out applied as view-timeline
  animations, removed under reduced motion; sticky section at 80px; spotlight followed the mouse
  (`--mx/--my`, `--ptr-on: 1`) and drew the glow. A first probe hit an empty code block and a sticky section
  covering it — test setup, not a defect.
- Not run: tilt/magnet visual review, Safari/Firefox without scroll timelines (only loops run there), e2e.
