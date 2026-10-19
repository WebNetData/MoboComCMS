# Module blocks and section settings history

Continues merged PR197/main741e7176 on `feat/module-blocks-settings-history-2026-10-19`. The owner selected remaining items3 and4; no deployment or PR publication is requested in this implementation turn.

## Existing owners and gaps

- Editor already owns canonical MoboCom documents, version validation, core rendering, module registration and Gutenberg adaptation. Its browser still creates only a core registry; module definitions have no connected live renderer. Existing LibraryPicker/table/formatting stay intact.
- Content's public item registry already enforces publication/module visibility and canonical URLs. Module blocks must compose that address, not copy catalogue data or build another query system.
- General/Forum history is implemented. Journal/Cinema/Music/Games/Software portal forms save through existing section owners but do not yet keep strict revision/audit history; Games/Journal/Software still replace their JSON aggregate.

## Outcomes and boundaries

1. Share actual registered, enabled module definitions with the existing browser editor. Canonical versions/migrations stay server-owned; unknown/disabled blocks survive unchanged. Definitions and renderers come from trusted deployed code, never database JavaScript or HTML.
2. Supply bounded catalogue/list blocks for the seven focused content sections through module-owned definitions and the existing public-card owner. Store selection criteria/IDs, never catalogue snapshots. Public pages and the guarded editor preview render current public items; drafts/future/private/module-off content never leaks. Preserve existing page/article frames and plain generated HTML compatibility.
3. History for the five named portal forms reuses ContentRevision, existing section permissions and history UI. Sparse version-claimed saves/restore, setting changes, revision and strict audit commit together via updateJsonSetting. Unknown/future fields and unrelated settings survive; secrets, money, ownership and provider credentials are outside this scope. Legacy callers without a version remain supported; new forms send If-Match.

## Actors, configuration and failures

Page editors use cms.pages; magazine managers/authors retain cms.posts/journal.author and own-item scope. Referencing public cards grants no permission to edit the referenced section. Preview requires the same document owner scope, an enabled editor, Origin and bounded JSON. Module-off blocks are unavailable to insert and preserved on save. Dynamic work is capped per document/request; errors do not expose private provider details or erase stored blocks.

Portal settings retain each current adminGuard: journal/cms.posts, cinema/cinema.manage, music/music.manage, games/games.manage, software/software.manage, including each existing settings.manage configuration fallback. Module disable guards still apply. History restore is a new version, never a rollback of audit records or external financial state. Stale form/restore preconditions fail409; malformed input fails before writing. Existing migration/schema/data are retained; no new table is planned.

## Acceptance verification

Same-process typed contract additions (existing request/response fields remain):

| Address | Additive contract |
|---|---|
| GET `/api/admin/editor/:entity/:id` | `blockDefinitions: BlockDescriptor[]`, declarative enabled definitions only; migrations/renderers stay in trusted server code |
| PUT at the same address | Same `{ document, updatedAt }`; body+strict revision+audit now atomic, Origin required, stale409 and invalid422 retained |
| POST `/api/admin/editor/:entity/:id/preview` | `ModulePreviewRequest`: `{ block }` → `{ html }`, or `{ action: 'items', type, query?, ids? }` → public `{ items, selected }` choices; same owner/author scope, Origin,80k body, no-store |
| Existing five section settings GET/POST | Add `settingsRevision` to existing answers; optional If-Match for sparse writes; existing section-manager/configuration-manager permissions remain |

Additional history correction: canonical contentDocument JSON is never clipped at the generic200k text cap. Page/article restore validates it and regenerates the derived HTML; an already corrupt historical document is refused without changing the current body. Block-editor writes claim a strictly advancing version timestamp and commit history/audit atomically. No schema/data reset or public API/Pact boundary is introduced.

- Existing editor units extended for descriptor compatibility, owner definitions, safe rendering and bounded dynamic traversal. Existing tests remain meaningful.
- Registered `editor-module-blocks` native PostgreSQL: persisted legacy/core/custom/module blocks, enabled/disabled owners, current visibility, selected order, bounded load, escaping, author/member denials and actual preview composition. Deliberately bypass visibility/disabled filtering and confirm failures.
- Registered `section-settings-history` native PostgreSQL: all five owner/API guards, baseline/edit/restore, stale claims, first-row/different-field contention, nested unknown preservation, corruption and injected revision/audit rollback. Mutants bypass the claim/history callback and must fail.
- Actual localhost browser: insert/configure/save/reopen/live public module block, editor disabled/module disabled behavior, scoped author boundaries; five settings save/history/detail/restore paths and stale tab feedback. Light/dark1440/390, scoped axe/screenshots/keyboard/no overflow, installed React Doctor and scoped source/security/TypeScript gates. No hosted workflow dispatch/rerun.

Durable status and executed evidence go in the existing architecture/map/ledger/workstate and a focused handoff. Unexecuted checks and remaining limits must be explicit.
