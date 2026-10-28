# CMS Page lifecycle — 2026-10-28

Continue `feat/page-publication-history-seo-2026-10-28`, based on main `46c929d8` (PR276), in `.mobocom/autonomous-foundation`. The older outer checkout has separate owner work. This completes the audited Page lifecycle gaps; it does not add file sales or certify the whole platform. [Scenario and acceptance](../../specs/page-publication-history-seo/SPEC.md).

## Existing owners and behavior

- Pages Admin and the CMS Pages create API default omitted status to `DRAFT`. Existing explicitly published API requests remain supported; existing published Pages are unchanged. Blank and whole-template entry points create drafts.
- The existing Page Builder saves design independently of Page publication. Drafts show a private preview, an explanation and the link to Pages publication/settings. The existing final review dialog publishes explicitly. Preview authorization and `noindex` remain in their existing owner.
- `site/server/page-commands.ts` coordinates existing Page, Settings, ContentRevision and audit owners in one serializable transaction. It claims the Page timestamp and advances it monotonically. The Admin form submits `expectedUpdatedAt`; stale forms retain their input on409. Older clients may omit the claim but writes still claim the state read in the transaction. Bulk state changes use the same owner, with per-item failures and existing IndexNow behavior.
- `page-layout.ts` validates the six known layout fields. `pageRevisionState` adds `__relations = {version:1,pageLayout:{…}}` to the existing flat revision snapshot. Layout includes design template (`companyPanel`), cover, layout, title visibility, frame and attached form slug. Unknown Settings metadata is preserved but excluded from snapshots. Strict mutation reads refuse corrupt settings rather than replacing them with defaults; public rendering keeps its prior fallback.
- Page restore validates and restores the Page row/canonical document and recorded layout in the same transaction as history/audit. Old snapshots without layout keep the current layout. Unsupported, incomplete or unsafe metadata is refused before any write. Canonical Editor saves capture the same layout metadata. Independent `builder:<pageId>` document history is retained; restoring a Page does not rewind its separate builder design.
- `page-description.ts` uses canonical public block HTML or the legacy body plus the live saved builder design, in the public composition order. `builder-content.ts` uses explicit text fields, the renderer's shared module ownership, bounded template traversal and the existing plain-text utility. It excludes private preview drafts, scripts, styles, source URLs and unrelated widget configuration; dynamic feed records are not fetched to invent a description. Empty content falls back to the Page title. Existing SEO metadata/canonical/cover owners remain.
- Admin selected builder tabs use existing text/soft-primary tokens for accessible contrast. No protected public layout was redesigned.

## Executed evidence

On an owned empty PostgreSQL database, migrated through the existing release migrations, Linux UID1000 and no `.env` file:

- `npm run check`: passed734 site +53 connected unit +4 backup +10 billing tests (801 total), TypeScript, architecture/source/schema/migration/money/security/audit/i18n gates.
- `node scripts/page-lifecycle.connected.cjs`: passed actual CMS permissions, draft and explicit published creates, full typed layout snapshots, old-snapshot preservation, unsupported/unsafe metadata rejection, unknown-setting preservation, audit/revision outage rollback, concurrent Page claims, canonical Editor, bulk status and live-source descriptions with page-builder off fallback. Registered in `run-pg-checks.cjs`.
- Existing `editor-page-documents`, `builder-history` and `content-revisions` native PostgreSQL suites passed. Builder history intentionally logs its injected audit outage while asserting rollback.
- Three deliberate isolated source faults (omit restored layout, weaken strict revision recording, omit builder description) were each detected by the maintained Page suite. Originals restored; the unmodified suite passed again.
- Production Next build passed. Existing updater filesystem tracing warnings remain; this task does not certify updater deployment packaging.
- `e2e/tests/page-lifecycle.spec.ts`: one maintained actual Chromium/Edge case passed on localhost3000. It exercised the real new-template menu, private save/preview, unauthorized preview/history denials, middleware Origin refusal, final review then publish, two-tab409/input retention, matching description/OG/Twitter/canonical, history comparison and restoration to a private Page with its prior layout.
- Four light/dark1440/390 toolbar states and the history comparison had scoped axe0 findings and no toolbar viewport overflow. Five screenshots were retained locally; desktop light, mobile dark and history were visually inspected. The test exposed and verified the fix for the light selected-tab contrast defect. No whole-site accessibility claim.
- React Doctor: five affected React files,0 errors/46 existing warnings; changed-scope review0 errors/1 new warning (`await` in bulk Page loop). This loop intentionally processes independently claimed Page transactions sequentially to bound database pressure and preserve per-item outcomes. No diagnostic suppression or unrelated component rewrite.
- Scoped Semgrep:15 production TS/TSX targets,0 findings/errors; redacted changed-code Gitleaks0. Incremental local Graphify source graph refreshed. No token savings claimed.

Ignored local evidence is under `.mobocom/page-lifecycle-evidence/`. The private browser fixture file is not an artifact for Git or other agents; fixture identities/pages/settings/history/audit are removed after validation. The source-copy database is disposable and removed separately. Never overwrite real SiteConfig contacts/map/plugin switches to recreate these tests.

## Rollout, rollback and remaining limits

No schema migration, package addition, bulk data rewrite, hosted Actions or deployment is part of this task. The owner subsequently requested PR publication and will merge/deploy. Rollback the scoped code while retaining existing Page/Settings/ContentRevision data; legacy snapshots and clients remain compatible. New revision metadata has explicit version1 and never includes arbitrary Settings keys.

The Page body/layout and builder design retain independent revision lifecycles; the Admin confirmation explains this. External search-engine/share-card behavior was not tested against a deployed public URL. Real provider delivery, deployment-sized load, backup/rollback rehearsal and production readiness remain the existing release work; do not infer their completion from local tests. Read current Git state and this handoff before continuing; do not rebuild Pages, Editor, History, Preview or SEO as parallel systems.
