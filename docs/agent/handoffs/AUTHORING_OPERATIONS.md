# Authoring and operations continuation — 2026-10-18

Current2026-10-19: PR197 below is now owner-merged into main741e7176. Continue the next selected module-block/settings-history slice through [its focused handoff](MODULE_BLOCKS_SETTINGS_HISTORY.md). Publication/branch statements below record the earlier checkpoint; do not reopen that closed PR or rebuild the connected module registry and five section-settings histories.

## Resume here

Authoritative checkout: `.mobocom/autonomous-foundation`, branch `feat/authoring-operations-continuation-2026-10-18`, continuing `61087ae9`. The earlier batch is [PR197](https://github.com/WebNetData/MoboComCMS/pull/197), targeting `main`; the owner merges. The implementation commits remain separate within the consolidated PR. Do not rebuild these capabilities from the older root checkout or stage its unrelated work, `.serena/` or `public/demo/`.

Publication2026-10-18: at the owner's request, this completed continuation is appended to the still-open PR197 on remote branch `feat/content-management-completion-2026-10-18`, targeting `main`. The implementation remains its own commit `a19c89d2` after61087ae9; no force push, auto-merge or workflow change. The canonical local continuation branch above remains usable.

The owner selected items3–7 after the earlier publication. [Scenario](../../specs/authoring-operations-continuation/SPEC.md). This supersedes only the restore atomicity, single-round moderation, table/formatting and search/settings limitations of [the previous handoff](CONTENT_MANAGEMENT.md); its other contracts and historical evidence remain valid.

## Owners and implemented contracts

| Slice | Existing owner/address | Current contract |
|---|---|---|
| Atomic restore | `content/server/http/history.ts`, `site/server/revision-state.ts`, `catalog/server/revision-state.ts`, `media/server/admin.ts` | Owner content changes, strict ContentRevision and strict audit commit together in the owner's Serializable transaction. Failure rolls back all three; events/cache hooks follow commit. Existing section/author scope remains. History writes require Origin. Product snapshots still exclude price, stock, money and ownership. |
| Moderation rounds | `moderation/server/{cases,rounds}.ts` | ModerationCase retains its exact source/item identity. Trusted owner requeue advances its round and archives the previous decision in ModerationDecision. Repeated pending callbacks do not reopen again. Claim/release/note use expected round; old callers default to1 and must refresh later rounds. Overview decision is an acknowledgement of a matching completed owner decision, never authority to decide content. |
| Tables/formatting | `editor/domain/{core-blocks,rich-text,rich-table}.ts`, existing Gutenberg rich-text adapter | `content.richText` version2, identity migration from1; document/blocks-v1 version stays unchanged. Closed table schema validates rectangular spans, maximum100 rows/20 columns, no nested tables/arbitrary styles. Escaped accessible public HTML, semantic theme color/highlight, insert/edit/header/merge/split/delete table controls. Legacy tables carry into the explicit conversion. Older registries preserve unsupported version2 blocks. |
| Advanced search | `search/domain/facets.ts`, `search/server/search.ts`, existing Reviews ratings address | Optional newest/rating sort and supported dimension/minimum filter extend the current facets/cursor. Relevance and old cursor scope remain unchanged by default; suggestions keep relevance. Dimension aggregate reads approved ItemReviewScore rows only, in bounded500-candidate batches. Sorted dates use current public owner cards. Same visibility/module guards; no second search/review store. |
| Typed settings history | `settings/server/general.ts`, `forum/server/settings.ts`, existing ContentRevision/history page | General Settings uses its11-key whitelist and `settings.manage`; Forum Settings retains `forum.moderate` and the same stored aggregate. Sparse writes, optional If-Match claims, Serializable revision/audit, corruption refusal and unknown-field preservation. History types `settings-general`/`settings-forum`, entity1, capture only known fields; no provider secrets or arbitrary Setting values. Forum weight restoration queues a recount from stored events in the same transaction. |

Moderation requeue is connected at existing comment, product feedback, item/business review, copyright and author-trash owners. Business ItemReview and seller reviews remain distinct. Forum/report sources that create new records retain that owner workflow. Forum flag decisions (`resolveFlags`) claim the waiting flags and apply the hide/show/delete and the case decisions in one transaction; a deleted post or topic decides its waiting flags as agreed; `reviewPost` claims the held post while it is still `PENDING` and answers 409 otherwise (2026-10-20, `forum-flag-queue.connected.cjs`, which also loads the forum actions from an older ref through `FORUM_FLAG_BASELINE`). No public section layout or URL was replaced. New controls use existing MoboCom/SDS semantic tokens with scoped contrast fixes.

## Migration and compatibility

- Both Prisma schemas and `prisma/release-manifest.json` include additive migrations `20270109120000_moderation_rounds` and `20270109121000_moderation_pending_rounds`.
- Historical decided cases become immutable round1 decisions. A case whose actual supported source is already pending advances only after that decision exists; exact source predicates isolate business/seller/item histories. Content rows are unchanged.
- Both local databases received the migrations; an owned empty PostgreSQL database applied all124 migrations successfully. The populated-migration check executes actual old-table DDL and both new SQL files, verifies preservation/reconciliation and idempotence, then removes its owned schema. Do not edit applied migrations.
- One exact new dependency: `@tiptap/extension-table`3.31.3, matching installed Tiptap. Isolated Linux `npm ci --ignore-scripts --no-audit --no-fund` passed (538 packages), then Prisma generation passed as UID1000. Package-lock byte preservation matters in this checkout: review its small semantic diff rather than normalizing all historical line endings.

## Executed validation

Native PostgreSQL checks are registered in `scripts/run-pg-checks.cjs`: `content-restore-atomic`, `moderation-rounds`, `moderation-rounds-migration`, `settings-history`, `search-advanced-scale`. Existing content/editor/search/moderation regressions were also exercised. Checks use owned fixtures with cleanup, not production accounts or assumed IDs.

- Atomic HTTP restore tests inject strict revision/audit failures across posts/pages/products/Cinema and verify no content/history/audit/event leak; include missing-Origin and permission refusals.
- Round tests use actual comment/product owner APIs, historical first decisions, stale acknowledgement/claim, transaction failure, repeated pending and concurrent reopen. Real populated SQL migration/backfill is separately tested.
- Settings tests map settings/history to namespaced owned rows; sparse saves, stale ETags, unknown nested data, history-secret exclusion, corruption, restore, strict-audit failure and transactional recount jobs are covered.
- Final consumer audit retained the legacy400 response for invalid General Settings values (restore validation remains422); the real settings-history route test passed that assertion. The older personal-recommendations HTTP harness now sends the required Origin. Its entire standalone HTTP scenario was not rerun; do not count it among the12 native suites.
- Search tests cover old links/default scope, sorted next/back cursors, cross-sort reset, approved-only dimensions, unsupported/unrated items and current source dates. Editor tests cover table bounds/spans/escaping/direction/facts/migration/older registry retention.
- Four deliberate isolated faults were detected: bypass restore callback, suppress round reopening, include pending dimension scores, remove table bounds. Originals were restored before regression validation.
- Actual localhost browser: explicit legacy-table conversion, color/highlight and row addition, save/reopen/public rendering, restore to legacy and back to canonical blocks; sorted/dimension search and next page; journal-only round1/round2 decisions; full-admin General and forum-only Settings save/history/restore; member/scoped/missing-Origin refusals.
- After the final local app restart, the original plugin-off setting was restored with a value claim. Its editor API correctly refused access and the existing public v2 table still rendered with all three rows. A premature socket request and an incorrect harness expectation of200 instead of the disabled guard's403 were corrected before the passing run. All owned browser rows/history/auth were removed; original General/Forum raw settings were restored with concurrent/unknown-field guards and post-cleanup counts were verified. Three orphan rows from an earlier failed fixture were removed only from the owned test database.
-28 scoped views: seven affected surfaces ×1440/390 ×light/dark, zero final axe violations, no horizontal overflow, empty pageerror lists. Screenshots were inspected. Initial contrast failures are retained; the final report combines24 unaffected passing views with the four final moderation reruns. This is scoped evidence, not whole-site WCAG certification.
- Redacted staged-patch Gitleaks found zero leaks.
- React Doctor0.9.17 over eight affected files: zero errors,38 reviewed warnings; new rich-text/search control components have none. Existing large-page/effect/formatting warnings remain, with no suppressions. Scoped Semgrep:41 TypeScript files, zero findings/errors.
- Search OpenAPI1.2.0: Spectral zero errors/warnings, oasdiff v1.33.0 no breaking changes against61087ae9, Hurl8.0.1 seven live GET scenarios passed. Isolated official Windows binaries were checksum-verified and kept in ignored local tooling; no global installation or cloud analysis.

Local evidence is under root `.mobocom/authoring-operations-evidence` and owned container `/tmp/content-management-*.log`; private auth files are not evidence to commit. Final validation passed182 existing focused units plus22 editor/ranking units, full TypeScript with6GiB heap, architecture boundaries, source check2013 files, security, schema parity/money rules, release manifest and audit gates; all12 named native PostgreSQL suites passed. Results are also recorded in the workstate. Initial default2GiB TypeScript OOM and a browser harness selector timeout are not counted as passes; the6GiB type command and corrected browser flow were executed separately.

### Measured bounded-search sample

Owned PostgreSQL fixture:1105 candidates, three batches,20 returned. A warm local run measured newest40ms, rating57ms, rating plus lyrics≥4 at68ms. Observed process heap deltas were5,461,560 /2,275,728 /9,749,264 bytes respectively. Dimension filtering made three aggregate calls,736 aggregate rows total and368 eligible items. The complete expected order and next page were verified independently. These are one local sample, not cold/RSS/production load measurements, an SLA or token-saving evidence.

## Delivery and remaining limits

PR197 publishes the earlier batch for owner review/merge; its hosted check jobs did not start. GitHub's annotation reports failed account payments or the Actions spending limit (run39125540090), not executed code failures. No workflow was rerun/dispatched or weakened; hosted browser testing stays manual. This continuation is now included in the same PR197 for one owner merge. Previously executed local evidence above applies to implementation commit a19c89d2; this publication changes documentation only. Existing PR checks can trigger automatically on the update; no manual dispatch/rerun is requested. No new production build/deployment, real provider delivery or production restore rehearsal is certified here.

Remaining editor work: shared browser registry for module block definitions and module dynamic rendering. The existing LibraryPicker is already wired in Gutenberg FieldControls.tsx and shared FileUpload; retain it rather than building another picker. Browser coverage of every asset/list-field variation is not certified here; patterns/templates are separate future scope. History covers named content owners plus General/Forum settings, not all arbitrary Admin forms/credentials/financial state. Copyright takedown effects and notification delivery retain their existing external transaction boundaries. Search results remain live rather than snapshot pagination; production-size scan behavior needs measured deployment evidence. Graphify assets are absent in this worktree; source/Serena were used, with no graph/token-savings claim.

Before considering launch complete, execute named staging/production payment/delivery/backup/deploy/rollback checks through existing owners. Continue only a verified gap from `REMAINING_GAPS.md`; no second settings registry, moderation resolver, queue or identity system.

## Reproduce

```text
node --test scripts/editor.test.cjs scripts/search-ranking.test.cjs
node scripts/run-pg-checks.cjs content-restore-atomic moderation-rounds moderation-rounds-migration settings-history search-advanced-scale content-revisions editor-page-documents search-facets moderation-cases moderation-queue content-management import-edit-protection
node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/check-schema-parity.mjs
node scripts/check-architecture.mjs
node scripts/check-source.mjs
node scripts/check-security.mjs
```

Use a generated PostgreSQL client, a connected owned database and UID1000/no`.env` for reproducible native checks. HTTP mutations send Origin. Never print browser auth fixtures or database credentials.

`docs/specs/search-continuation/search.hurl` expects an owned25-title public fixture (five acting≥4 matches), an encoded unique query and the explicit expected IDs/counts listed in its variable header. Do not run it against arbitrary production data or weaken its fixed20/5-page assertions to fit unrelated rows.
