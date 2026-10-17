# Connected authoring, metadata and media organization

Owner request2026-10-17: show the complete article excerpt first inside its reading body; formatted Cinema/episode content and remaining long-form editors; IMDb ID/URL enrichment; category-driven fields; explicit bulk media copying with automatic logical and physical folder organization.

## Audit and ownership

- Article lead already exists outside the body and is truncated. Site's existing article/content slot must prepend the complete saved public excerpt without modifying canonical block documents or templates.
- Shared ContentEditor/classic/fallback already exists. Cinema and episode synopsis, Music lyrics and editorial playlist descriptions are plain fields/readers. Extend the existing editor/sanitizer, not an editing engine or document store. Short SEO fields remain plain text. Preserve existing plaintext/newlines and protected page composition.
- Cinema stores IMDb IDs/rating/year/director/cast but has no metadata provider. Add a server-only TMDb adapter using external-ID lookup, optionally OMDb for actual IMDb ratings. Admin-only credentials/configuration, fixed HTTPS hosts, bounded responses/timeouts/rate limits, stale-response fencing, no automatic publishing or silent replacement of edited values. Actual provider authentication requires owner credentials; fixtures cannot certify live service results.
- Canonical TaxonomyTerm/Assignment exists, but genres/category/platform strings can drift. Add an optional semantic field mapping to the same terms and project selected leaves/ancestors atomically through the existing Media save transaction. Missing terms input preserves legacy fields; explicit removal clears only previously projected fields. No parallel taxonomy or permission resolver.
- Imports already has copyAssets/mediaPolicyVersion and immediate/queued/scheduled shared transfers. Preserve explicit unchecked zero-download behavior and historical job semantics. Carry per-record context through existing import services, including download/episode/audio links, covers and embedded media.
- Media library owns folders/assets/transfers; Downloads owns bytes, range serving and public local URLs; Imports owns safe decoded image intake. New copies are organized; do not move old files or rewrite existing published URLs. Additive captured destination metadata belongs to the existing transfer/queue. Explicit folder choice wins; automatic paths are sanitized and guarded against traversal, symlinks, collisions and stale authority.

## Requested organization

Under Downloads root and the same Library folder tree: `download/film/<title>/images|video`; `download/series/<title>/images|Season<number>`; `download/music/<artist>/image` (artist photo), `<artist>/<album>/image` (album cover), `<artist>/<album>` (audio), `<artist>` (single); `download/Sofware/<category>/<title>/images` and parent for files; `download/Game/<category>/<title>/images|videos` and parent for files; `download/Products/<category>/<title>/images|videos`. Preserve the owner's spelling/case; missing optional context uses a disclosed safe fallback. Never infer unknown seasons or overwrite a same-named blob. Configuration and opt-outs integrate with the current Admin Control Plane.

## Authorization and acceptance

Existing cms.posts/cinema.manage/music.manage/games.manage/software.manage/cms.products/imports.manage/media.manage and author ownership stay authoritative; metadata lookup/credentials are manager operations. Writes retain Origin/CSP, strict secret guarding, bounded input, captured transfer authority, serializable claims and audit. Incremental migrations in both schemas and release manifest; no data reset.

Implement in coherent slices with actual units, connected PostgreSQL and deliberate faults, then real localhost3000 light/dark1440 and mobile390 editor/save/public/import/transfer/denial flows, scoped axe/Doctor and final relevant gates. Register native checks in the existing runner. Record evidence and remaining live-provider/production limitations in one handoff and capability ledger; no hosted Actions dispatch.

## Progress

Implementation and bounded local verification are recorded in [the continuation handoff](../../agent/handoffs/CONTENT_AUTHORING.md). Source is on `feat/content-authoring-media-layout-2026-10-17` in `.mobocom/autonomous-foundation`; live metadata activation needs owner credentials. Preserve existing owners and do not restart this work from the root checkout.
