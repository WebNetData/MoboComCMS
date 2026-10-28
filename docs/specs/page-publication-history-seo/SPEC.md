# Page publication, layout revisions and metadata

Scope: complete the existing CMS Page lifecycle; preserve all published Pages, URLs, editor documents, protected visuals and section permissions. No migration or new page/history/SEO store.

| Capability | Audited state | Owner / bounded change |
|---|---|---|
| New Page | PARTIAL: direct builder creates an empty published Page | Existing Pages Admin and CMS create default to DRAFT; explicit existing API publication remains supported. Builder save keeps Page status; guarded preview remains private, final publication uses Pages Admin. |
| Complete Page revision | PARTIAL: Page row only, layout Settings omitted | Existing ContentRevision captures known typed page layout in versioned relation metadata; legacy snapshots keep current layout. Body/layout/revision/audit rollback atomically. Canonical block saves retain the same metadata. |
| Page description | PARTIAL: Page.content only | Existing metadata helper composes published builder text and canonical/legacy Page body, respecting module-off state and bounded nested templates. No draft, script/style/source URLs or unrelated widget configuration in descriptions. |

Actors: `cms.pages` managers edit/create/publish/restore Pages. Existing builder script permission `settings.manage`, plugin switches, Origin, private previews/nonce and canonical editor rules remain. No new form builder or arbitrary configuration editor.

Invariants: omitted creation status is draft, existing explicit published clients work; saving a builder design never publishes a draft Page; metadata and public output use only persisted live documents; old revisions never reset newer unrecorded layout; unsupported/corrupt layout versions are refused before any write; unknown layout metadata survives; concurrent save/restore cannot split body and layout; history/audit failure rolls back the whole operation. Builder-document history remains its current independent owner.

Admin UI: same SDS/MoboCom controls, draft-first form options, private preview link and a clear route from the builder to existing publication/settings controls. No public redesign. History explains Page settings in Persian.

Acceptance: existing registered unit suites plus `page-lifecycle.connected.cjs` in an owned empty PostgreSQL database, canonical editor/builder regressions, deliberate layout/history/metadata faults, permission/Origin/stale/legacy/invalid/rollback checks; actual browser create → private preview → save → explicit publish → public metadata → layout/body restore, themed desktop/mobile captures and scoped accessibility. Run Doctor and scoped security/full relevant gates; report only executed results. No hosted Actions or deployment.

Compatibility/rollback: additive JSON revision metadata only. No stored Page is bulk converted to draft; no content/layout/backfill deletion. Legacy snapshots preserve layout. Roll back presentation/services while retaining all Page and history data.

Result2026-10-28: implemented and locally validated. [Actual commands/results, source ownership, fault and browser evidence, rollout limits](../../agent/handoffs/PAGE_LIFECYCLE.md). No production/deployed-crawler certification.
