# Configurable permalinks — continuation

Current2026-11-04: `feat/miniapp-platform-2026-11-04`, base `5bdc7c93`; continue the existing Site router and the preceding uncommitted Mini App batch. Preserve older-root work, `.serena/` and `public/demo/`. Owner merges/deploys; four later origin/main PR333/334 commits require reconciliation at publication. No dependency, schema, identity, permission-key, API-address or content-row migration.

## Links reach the final address without a redirect — 2026-11-04

Owner: a home-page link `/music/track/banoo-jan` sent visitors through a 308 to `/music/komeil-nasri/track/banoo-jan`.
A link that knows only the slug cannot name the artist, so `presentContentPath` (and the shared Link) kept the old
address. Branch `fix/home-permalinks-2026-11-04` from main `e1e404b8`:

- `src/modules/site/server/routes/links.ts` (exported from the `routes.ts` address): `canonicalContentLinks(paths)`
  resolves track/album paths without an artist with one query per kind (published items only, at most 300 paths),
  and `withCanonicalContentLinks(value)` returns a copy of a stored document with whole-path strings and `href`
  attributes in HTML rewritten. Nothing is queried when neither template names `{artist}`; unknown, draft and
  free-text values stay as written, and the stored document is never modified.
- Applied where stored links are rendered: `BuilderRenderer` (every builder page, home included, and user templates)
  and `getPublicSiteConfig` (menus, footer and home sections, once per request).
- Code that had the artist but wrote the old address now uses `contentPath`: the music landing hero/queue, a
  playlist's track rows, the track/album pages' review, VIP and purchase return paths, and the follower notification
  of a new track (it loads the routing state first; stored inbox links keep the pattern of their day).
- Evidence: `permalink-routing` PG suite extended (button with query/hash, HTML href, draft, unknown, words, renamed
  section, input not mutated); two deliberate breaks (tracks skipped; query/hash dropped) each failed it and the
  restored code passed; `section-maintenance` and `module-availability` passed on the same fresh database.
- Not changed: IndexNow pings, admin "view" links, the download/purchase redirects of `/api/media/track`, the login
  `next` of the player and the paywall's purchase list still write the old address and are redirected once. The
  owner's production home was in maintenance during this work, so the exact block holding the link was not seen;
  every stored and builder link on a page now goes through the resolver.

- `src/modules/site/server/routes.ts` remains the Site router address. Its `routes/state.ts`, `commands.ts`, `resolve.ts` parts own fresh/cached policy, serializable writes and public resolution. Other modules import the address, not the parts.
- Existing `site.routes.v1` remains section aliases. Additive `site.permalinks.v1` holds typed templates, previous public templates and section-alias history in the existing Settings table. Do not create another redirect service or entity identity. Combined SHA256 revision covers both settings; compare-and-swap, retryable serialization and strict same-transaction audit protect saves. Section Admin writes an alias patch against fresh state instead of clobbering the whole table.
- Existing `/api/admin/site/routes` GET/PUT and `settings.manage` remain authoritative. GET adds templates/history/types/revision; PUT accepts optional templates and If-Match/revision, preserving legacy alias-only callers. Foreign Origin is refused. A stale revision is409 with no mutation. Public rendering retains the existing five-second settings cache; fresh Admin failures throw rather than replacing corrupt state.
- `src/shared/routing/permalinks.ts` is pure presentation/validation; aliases and the existing provider/shared Link/navigation compose it. Thirteen content kinds are typed. Only pages have a root-variable template; only track/album allow primary `{artist}`. Unknown artist coordinates preserve the valid legacy URL, resolved by the server. This is not an authorization registry.
- Proxy redirects old public patterns, internal legacy paths and incorrect artist segments to canonical308, retaining the query. Current public paths rewrite to the original module routes before maintenance, audience and cache decisions. Existing page/module/paywall guards stay in their owners. Published Page existence and real primary MusicArtist slug are queried; unknown/draft root pages do not mount.
- `reserved.ts`, runtime module-root identity aliases and explicit protected static subtrees prevent taking over system, file, module listing/tool/category routes. Tests compare static reservations with current route directories. A reserved/root file-looking Page slug keeps its `/p/{slug}` fallback. Maintain this inventory when adding static module routes.
- Main Music cards/player/album TrackList, content registry, metadata, sitemap and feeds use the same policy. Sitemap filters by original internal paths before publishing customized URLs, preserving module-off/maintenance behavior. Existing stored links do not require bulk rewriting and can follow308. Music JSON-LD now receives the existing request nonce.
- The installed App Router supplies encoded dynamic values. Actual Unicode fixtures found the stored raw Music slug was not matched. Shared `contentRouteParams` now decodes once at13 existing content-page/metadata boundaries; domain/API lookup contracts stay raw and unchanged. Invalid encoded/path segments become not-found. Existing Celebrity decoding moved to that same boundary; canonical comparisons no longer compare encoded versus raw values. Sitemap music keys normalize percent encoding too.
- `/admin/permalinks` is scoped, responsive, RTL and token-based with local validation/live previews, pending/error/conflict/success, preserved failed drafts and presets. A preset changes page/track/album only. Deployment defaults remain legacy until the owner saves; the requested preset was intentionally saved on localhost only.

## Executed evidence

- Final Linux Node22 UID1000/no `.env`: full check **903pass/one existing Linux certificate-helper skip** (833 site,53 mock-connected,4 backup,13 billing). Types, source, architecture, schema/migration, money, security, audit and i18n gates executed. The host's direct Node test attempt lacked the existing `typescript-api` dependency; the maintained installed validator ran the real gates, with no dependency changes.
- Fresh unseeded, fully migrated PostgreSQL: **six suites** `permalink-routing`, `section-maintenance`, `module-availability`, `journal-pagination`, `music-artist-profiles`, `page-lifecycle` passed after final Unicode changes. New suite exercises real current-account guards, published/draft root Pages, primary artist lookup, repeated aliases, Origin/permissions, stale concurrent writes, fresh disjoint patches, strict audit rollback and unchanged content. Only the two physical settings keys are namespaced; module runtime/env/logger are declared doubles, database transactions/identity/audit are real.
- In the isolated validator, wrong primary artist injected into the real resolver caused the native suite to fail; restored exact bytes passed. No mutant remains. Static-directory checks and Proxy maintenance/group/cache ordering assertions ran; the final route suite also covers decode-once/invalid parameters.
- Actual localhost Admin keyboard preset/save and public Page/track/album/article: **20 final captures at light/dark1440/390**, Admin-scoped axe0, no overflow/page errors. The same flows passed first with ASCII slugs, then with real Persian Page/article/track/album fixture slugs. Real308 including HEAD/wrong singer/query preservation, canonical metadata, album track links, sitemap new/old exclusions and foreign-Origin403 passed. Initial runs found header contrast and Unicode404; both were fixed and the actual flows rerun. This is local browser evidence, not destination-host deployment proof.
- Final React Doctor0.9.17 on21 changed/new TSX: **0errors/52advisories**. New page complexity remains advisory; asynchronous reads check AbortSignal before setting state and abort on cleanup. Most warnings concern existing content/Admin/layout complexity, formatting/media/anchors and independent reads. No suppression or blocking-policy change.
- Scoped Gitleaks over42 explicit source/test files: **0leaks**. Graphify incremental source-only refresh2371files/15794nodes/58663edges, semanticTokens0. Graph relationships are candidates, not runtime proof; no token-savings claim.
- Final production `npm run build:postgres` ran as UID1000 against the owned fresh PostgreSQL with generated ephemeral secrets, using the existing supported Webpack path. It passed compilation/types/page collection and the runtime-storage gate: **793 NFT manifests/301849 entries, no runtime storage**. No private `.env` or production data was included in the artifact.

## Limits and next-agent rules

History covers pattern/section changes, not arbitrary entity slug renames. Do not delete history to permit a colliding route. History is bounded100/type and refuses excess rather than erasing old URLs. Root dynamic patterns for non-Page content, arbitrary scripts, API/file rewrites and administrator-defined executable routing are intentionally unsupported. External cached URLs and destination-host/proxy rollout remain unverified. Preserve the existing owner configuration, slug ownership and published data.

Operator guide: [Persian permalinks](../../PERMALINKS-FA.md). Scenario: [spec](../../specs/permalink-management/SPEC.md). Tests: `node --test scripts/routes.test.cjs scripts/content-controls.test.cjs`; `node scripts/run-pg-checks.cjs permalink-routing section-maintenance module-availability journal-pagination music-artist-profiles page-lifecycle`; browser `node scripts/permalink-routing.browser.cjs` requires an ignored private owned fixture and intentionally leaves the selected local policy. Never stage its session cookie. Evidence/hash manifests are ignored under `.mobocom/permalink-management/`.

Rollback: change the pattern using the same Admin controls to preserve redirect history. Code rollback also needs the two Settings rows restored from a reviewed backup; no entity/data rollback. Current fixture cleanup removes only owned test users/content/audit; keep the requested local preset, original Magazine pattern and all owner aliases. No PR, hosted Action, merge or deployment is part of this turn.

Final cleanup: owned browser user, Page/article/track/album/artist and actor audit removed; private host/container cookie files and owned test database removed. Settings comparison verified the requested three patterns and unchanged original Magazine/aliases. All37 product-source hashes match the final validator snapshot;42-file source/test manifest and executed logs remain ignored locally. Owner localhost3000/PostgreSQL remain running.

## Publication reconciliation —2026-11-04

The combined Mini App/permalink PR is prepared on `feat/miniapp-permalinks-2026-11-04` from fresh main `d3d236ea` (PR333/334 included). No product-source conflict; retained both work-state histories. Normalized62 feature product files match prior browser-validated source; an extra EOF blank line was removed. Integrated UID1000/no.env `npm run check`:911pass/one existing Linux certificate-helper skip. Eleven selected fresh/unseeded PostgreSQL suites passed. Production build102pages,795 NFT manifests/302193 entries passed the runtime-storage exclusion gate. Redacted Gitleaks on82 reviewed files:0leaks; existing single dynamic-code Semgrep rule on60 targets:0findings/errors (narrow scope only). Previous themed23 Mini App and20 permalink browser/axe0 evidence remains bounded as recorded above; real Telegram/provider/destination-host limits remain. Owner requested the PR and will merge; one `[skip ci]` commit/push, no hosted workflow dispatch or deployment.
