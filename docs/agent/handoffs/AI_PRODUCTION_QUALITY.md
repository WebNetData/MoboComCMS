# Bulk production quality control — 2026-11-09

Branch `feat/ai-production-quality-2026-11-09`, stacked on PR390 (AI Admin area).
Owner asked that bulk output be checked before save so it is publishable. Owner merges/deploys.

## Boundary

- AI owns the check; it adds no table, migration, dependency or model call.
  `domain/production-quality.ts` holds pure rules; `server/production/quality.ts`
  adds read-only lookups (similar titles, internal link targets).
- Areas: similar content on the site and inside the batch; links (internal
  `/blog`, `/products`, `/p` resolved against Post/Product/Page after route
  aliases; other internal paths and every external link are listed for manual
  review, never fetched by the server); claims (numbers/years/ranking/research
  language absent from the brief, long quotes); image/text agreement (missing
  images, empty alt, the image's own description sharing no word with its
  section); profile rules.
- Profiles: `magazine`, `music`, `film` (Magazine posts), `product`, `page`.
  Product: invented numbers, any price in text, undeclared warranty and health
  claims block. Page: invented contact details block. Music: lyric-length quotes
  block, release/chart/award facts warn. Film: cast/release/box-office facts and
  spoilers warn. Magazine: fabricated first-person testing blocks; excerpt,
  headings and keyword coverage warn. `config.qualityProfile` is optional and
  validated against kind; old batches use the kind's default.
- `GET /api/admin/ai/production?id=&quality=itemId` returns the report under the
  batch owner's existing permission. Save recomputes it; a blocking report needs
  `acknowledged:true`, and the audit row records profile, level, counts and
  acknowledgement. "Save all" keeps blocked rows for individual review.

## Evidence (local)

- 87/87 `scripts/ai.test.cjs` cases including 3 new quality cases; full `tsc`
  clean, both in an LF copy inside the preview container.
- Browser (preview, admin, 1440 dark / 390 light): a seeded REVIEW item showed
  all nine expected findings, save disabled until acknowledged, API save without
  acknowledgement returned 409, no overflow or page errors. Fixture removed.
- Not run: e2e suites, a real generation batch, non-admin section staff walk.

Heuristics are Persian/English word rules, not fact checking: a clean report
still needs human review, which the panel says.
