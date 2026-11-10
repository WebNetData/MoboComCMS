# Whole-page article styles and new form themes — 2026-11-10

Branch `feat/post-form-styles-2026-11-10` from main `c7dec8e7`. Owner: «besides the default the post styles are not
attractive; design several professional, advanced styles with beautiful effects — and several for forms».

## Article styles (journal post styles owner)

The ten earlier bases dress only the header. Five new bases dress the whole article — header and reading column
(headings, quotes, lists, links, pictures, contents box):
- `vogue` «مجلهٔ مد»: wide cover plate, title card overlapping it, outlined chapter numerals, centred pull quotes.
- `glass` «شیشهٔ مات»: cover with the title on smoky frosted panels; reading column and contents on glass over soft light.
- `story` «داستان»: 3D-tilted cover that straightens as you scroll, «فصل ۱، ۲…» heading cards, text rising in.
- `prism` «طیف»: moving colour field, tilted glass-framed cover with a passing glare, spectrum links/quotes/contents.
- `ink` «جوهری»: fine rules, black-and-white cover that takes colour as you read/hover, accent title rule.
Registered in `POST_STYLE_BASES` + `BASE_DEFAULTS`, drawn in the admin gallery (`post-styles.module.css`), selectable
as default, per format, per post and as the base of the owner's own styles; previews via `?style=ps-<base>`.
CSS in `journal-post-styles.css` (selector `.journal-post.journal-post:is(...)[data-post-style]`), effects under
`prefers-reduced-motion: no-preference`, scroll-linked ones under `@supports (animation-timeline: view())`.

## Form themes

`neon` (turning light border, glowing fields), `soft` (raised panel, pressed fields, pill buttons), `prism` (moving
spectrum border, colour line that fills under the chosen field), `studio` (editorial: numbered questions, underline
answers, full-width bold button); fields arrive one after another. Added to `THEMES`/`THEME_LABEL`, thumbnails in the
form editor, CSS in `forms-pro.css`; reduced motion stops the moving borders.

## Evidence (local)

builder 36 (+ new registration case; base count now 15), forms 27, media-admin 34; full `tsc` clean. Browser:
each new article style at 1440 light, vogue dark, prism/story at 390 — no overflow or page errors; four form themes on
a throwaway form (deleted) with a focused field and a chosen option, light and dark. Not run: Safari/Firefox without
scroll timelines (entrance effects only there), React Doctor.
