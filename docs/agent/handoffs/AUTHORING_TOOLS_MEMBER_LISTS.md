# Authoring tools and member lists — 2026-10-19

## Continue here

Authoritative checkout: `.mobocom/autonomous-foundation`, branch
`feat/authoring-tools-member-lists-2026-10-19`, based on local Admin integration
`d51bfd17`. Preserve that batch and the unrelated older root, `.serena/` and
`public/demo/`. The user selected four existing gaps; none was rebuilt.
Scenario: `docs/specs/authoring-tools-member-lists/SPEC.md`.

## Ownership and contracts

1. **Editorial collections:** `content/server/collections.ts` remains the public
   address. Its scheduling part uses `UserCollection`, current canonical staff
   permissions and the existing Notifications scheduler, every60 seconds in bounded
   batches. A future absolute timestamp (at most366 days) records who authorized
   it. Cancel/reschedule/version/visibility claims prevent stale workers from
   publishing a withdrawn schedule. Current identity/standing/2FA/permission and
   live item availability are rechecked. Refused schedules remain private with an
   actionable error; explicitly reschedule after review. Publication and strict
   audit commit together. Public item projection still filters current visibility;
   the preflight item read is not proof of serialization with every external owner.
   The existing Admin cover field now uses shared `LibraryPicker`; selection is
   saved with metadata, without a second media system.
2. **Patterns/templates:** Editor owns `EditorPattern`, scoped to `pages` or
   `posts`, maximum100 per section and200k UTF-8 bytes each. The existing canonical
   MoboCom document is stored, never Gutenberg serialization. Managers of the exact
   section create/delete with strict atomic audit and version claims; section
   authors can read/use. `/api/admin/editor/patterns?entity=posts|pages` supports
   GET/POST/DELETE and obeys the existing editor plugin switch. Save a full layout
   or selected block/subtree. Insertion uses fresh IDs; replacing the current
   document is explicit and undoable. Changing a document does not synchronize a
   previously saved pattern. Unknown/disabled blocks in existing documents and
   loaded patterns survive; creating a new pattern with unavailable blocks is
   refused. The editor can update text inside protected blocks. Canonical optional
   `lock.move/remove` survives adapters and server validation. Authors cannot
   change existing locks, remove removal-locked blocks or reorder movement-locked
   blocks across remaining siblings/parents. New protected blocks must use a
   type/lock combination approved by a stored section pattern. This approval
   permits editable content, not synchronization or a signed full-template claim.
3. **Member lists:** existing `AddToCollection` now presents `/api/me/lists` on all
   detail pages that compose `ItemActionBar`. Favorites, exclusive game shelves,
   personal playlists and collaborative collections stay in their original owner
   tables and commands. No data migration/list engine was added. The same owners'
   controls converge through server refresh and a local invalidation event, which
   grants no authority. Reads are private/no-store, options are type-compatible,
   writes require same-site Origin and bounded JSON. Loading/retry/empty/error and
   guest-login states are explicit; failed writes keep prior selection. Native
   dialog handles Escape/focus restoration and is centered within the viewport.
   Existing adapter listing bounds (100 playlists/collections) remain.
4. **Configuration history:** extend `ContentRevision`, the current History page
   and the original typed owners. No additional settings/history registry.

| History type | Actual form | Permission | Included | Excluded |
|---|---|---|---|---|
| `settings-site` | `/admin/studio` | `settings.manage` | Explicit Site presentation/menu/theme/section fields | Runtime fields, legacy plugin activation, unknown/secret metadata |
| `settings-navigation` | `/admin/mega-menu` | `settings.manage`, mega-menu enabled | Normalized section-menu configuration | Catalogue records and module lifecycle |
| `settings-media` | Library settings tab | `settings.manage` | Intake/organization/size/timeout policy | Storage credentials, files and transfer execution |
| `settings-notifications` | `/admin/notifications` | `settings.manage` | Retention and digest policy | Digest cursor, deliveries, jobs and deleted notices |
| `settings-businesses` | Businesses card in `/admin/extensions` | `settings.manage` | Five declared moderation/intake booleans | Enabled state, ownership, claims/reviews/proofs and unknown settings |

Business policy remains configurable while the module is off; restoring it never
activates the module or reverses a moderation decision. Both extension-writing
entrypoints delegate to this owner. Studio validates installed themes/plugins on
restore and preserves current extension state. Large validated configuration JSON
uses bounded `configurationDocument` snapshots without the old200k scalar
truncation. Corrupt versions fail closed. Other Admin forms are **not** claimed
covered. Never add credentials, money, stock or ownership to snapshots.

## Migrations

Additive `20270110120000_editorial_schedule` adds nullable scheduling fields, an
empty error default, a SetNull canonical publisher FK and due-work index.
`20270110130000_editor_patterns` adds the Editor-owned table with section/kind
constraints and SetNull creator FK. Both schemas and release manifest agree.
Apply with the existing release procedure; do not edit applied SQL or reset data.

## Executed local evidence

- Linux UID1000 tracked-source snapshot without `.env`: `npm run check` passed,
  including705 site tests, TypeScript and the repository's architecture/source/
  schema/migration/security/audit gates plus its existing isolated/backup/billing
  tests. Isolated tests are not native PostgreSQL tests.
- Registered native PostgreSQL: `authoring-migrations`, `configuration-history`,
  `editorial-schedule`, `editorial-collections`, `member-lists`, `editor-patterns`,
  `editor-page-documents`, `editor-module-blocks`, `section-settings-history`,
  `content-restore-atomic`, `notification-policy`, `media-library`, `extension-state`
  and `extension-state-integrity` passed. Actual additive SQL on populated legacy
  tables preserved IDs/content/owner/visibility and tested new defaults/FKs.126
  migrations applied through the owned database's existing incremental history.
- Actual localhost UI: schedule/save/reload/cancel, existing Library cover
  selection/save/reload, template create/independent insertion/save/reload,
  favorites/game-exclusive shelf/collection convergence, playlist add/remove,
  failed-write retention, Escape/focus restoration and real Control Plane history
  links passed with no page errors. Maintained `e2e/tests/authoring-tools.spec.ts`
  passed1/1 with zero retries. Sixteen scoped1440/390 light/dark views passed axe
  WCAG2/2.1AA and document-overflow checks. Screenshots were inspected; a discovered
  dialog alignment issue was corrected and rechecked.
- React Doctor15 affected TSX files: exit0, zero errors,43 warnings remain (existing
  page complexity, effect-based data loading/state convergence, JSX reuse and
  parsing advisories). No suppression or warning-free claim.
- Three isolated deliberate faults (structure enforcement, empty-collection
  publication and unknown configuration leakage) failed assertions. Source was
  restored and all three native suites re-passed. An earlier actor-guard fault
  stopped at strict-audit validation rather than the intended assertion; it is
  not counted among these three results.
- Production Next build passed with4GiB and matching PostgreSQL client in the
  owned snapshot. Final CSS centering was subsequently verified in the browser;
  final build/checkpoint details are appended below.

Failures were fixed, not hidden: initial new test mocks lacked a request-ID
boundary; an existing serializable editor race exposed raw P2034 and now maps to
the established409/CHANGED contract; menu snapshot comparison initially counted
JSON-omitted `undefined` values as corruption; a legacy unit loader pulled in
eager Site history imports and was fixed by lazy public forwarding; the existing
notification native check was updated for the changed settings boundary while
preserving the prior full-policy save semantics. Actual browser testing found
the preexisting local editor switch off and that Businesses has no section-hub
form; the history link now targets its real extension card. Test-only activation
is restored by exact raw-value claim.

Ignored local evidence/helpers live in root `.mobocom/authoring-evidence`,
`authoring-browser.cjs`, `authoring-e2e.cjs`, `authoring-quality.cjs`; the owned
runtime source is `/tmp/mobocom-admin-integration-20261019`. No token-saving or
current Graphify completeness claim: the source graph adapter is absent in this
worktree, so source/Serena established ownership. No hosted workflow dispatched,
PR/push/merge or deployment requested for this batch.

## Remaining scope

2026-10-19 follow-up: **synced patterns and in-place edits** are implemented on the same Editor owner. `EditorPattern.kind`
adds `synced` (migration `20270110140000_editor_synced_patterns` widens the kind CHECK). A core dynamic block
`content.pattern { pattern, title }` (data source `pattern`, no plugin owner, so it keeps rendering with the editor
plugin off) is inserted only from the library; public/preview rendering reads the pattern's current blocks, one level
deep (references inside a synced pattern are refused on save and dropped on render), wrapped in a `display: contents`
element. Saves accept only existing synced patterns of the same section, checked in the save transaction.
`PATCH /api/admin/editor/patterns` renames/replaces blocks with an updatedAt claim and strict `editor.pattern.update`
audit; synced edits schedule the page-cache purge. Deleting a synced pattern still referenced by a page, article or
another pattern is refused (bounded scan). The editor shows a badge, live preview and a “detach” action that
replaces the reference with an independent copy. Evidence: `editor-synced-patterns.connected.cjs` (registered) and a
real browser create/insert/save/public render/update/detach run, cleaned afterwards. Pattern content history,
role-specific template assignment and future custom module layouts remain separate slices. Production-scale collection/list latency,
actual deployment scheduler/rollback and external-provider delivery remain
operational acceptance. Local success does not certify the whole platform.

## Final checkpoint

- All126 migrations also applied from a genuinely empty owned PostgreSQL
  database; all five new/affected authoring-migrations/schedule/pattern/history/
  list native checks passed there without seed data or `.env`, as Linux UID1000.
  The temporary database was removed. Existing populated data checks passed
  separately. Studio restore additionally retains newer nested metadata by
  stable node identity and removes only fields known to the owner.
- Final `npm run check` passed after that restore refinement. Actual
  journal-author browser proved own-document/pattern reading, absent pattern
  management controls, direct create/removal403 and editable protected text.
  The maintained E2E re-passed after transaction-current pattern permission
  rechecks. Local browser evidence is a dev runtime plus a separate successful
  production build, not a claimed compiled-runtime browser run.
- Final centered-dialog16-view matrix re-passed. All owned actors, roles,
  editorial/personal collections, playlists, games/tracks/artists, test posts,
  patterns, counters, history/audits and private browser state were cleaned.
  Original raw editor activation and Journal settings were verified restored by
  exact-value claims; the owner's existing data was retained.
- Redacted Gitleaks directory scan exited1 with two reviewed **non-secret**
  `notifications.policy.v1` setting-identifier findings (the production constant
  and the native test boundary). No credential was found or exposed, and no
  ignore/baseline/suppression was introduced. This is not a clean scanner exit
  or comprehensive security certification. Raw redacted report remains local.
- Both project Codex/Claude `mobocom-develop` routing edits passed the installed
  skill validator. Architecture/map/ledger/gaps/workstate reference this handoff.

## PR203 conflict reconciliation — 2026-10-19

After the owner merged Admin PR202, main advanced to976b4e16 and conflicted with
the already integrated/refined copy in this branch. Main is now merged into the
same PR203 branch. The five conflicts were content-controls, admin-tidy CSS,
Audit, Roles and Studio. Preserve the reviewed scoped CSS, Audit request fencing/
hydration/history links, connected Roles labels and Studio history control.
The automatically restored root-layout Admin CSS import was removed; the Admin
layout still owns it. No feature, migration, permission or public style is dropped.

Product/test/schema/dependency files are identical to previously validated
a44db218 after reconciliation; only continuation documentation changes. Six
resolved/boundary files also matched the owned Linux snapshot. Executed again as
UID1000 without .env:83 content-control tests and native content-management/
configuration-history passed. All three maintained Admin Playwright cases passed
with zero retries, including actual draft save/reload/error retention, same-page
Admin→Home CSS isolation and late Audit-result/error recovery. Fixture-boundary
automation warnings remain in the unit log; there was no browser page error.
Owned actors/content/history/audits/private auth are cleaned afterward. Existing
full check/build/themed evidence above remains the unchanged-source evidence;
those broader suites were not claimed rerun for a Git ancestry reconciliation.
One ordinary push updates PR203; no manual hosted workflow or auto-merge.
