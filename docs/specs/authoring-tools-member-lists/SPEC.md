# Authoring tools, member lists and configuration history

## Scope / continuation

Continue `d51bfd17` in the authoritative worktree, branch
`feat/authoring-tools-member-lists-2026-10-19`. Preserve the unpublished Admin
batch, merged navigation, canonical identity, existing URLs and protected UI.
Use mobocom-audit → mobocom-spec → mobocom-develop. No hosted workflow or
automatic publication. Implement and verify each slice before advancing.

## 1. Editorial collections

Extend UserCollection and existing collections Admin/API. Staff with the
existing CONTENT_EDIT_PERMISSIONS may choose a future publication instant,
reschedule/cancel, publish immediately, or withdraw without losing members,
followers/saves/reactions. The existing media LibraryPicker supplies covers.
Schedule fields are additive/null by default; old collections are unchanged.
The existing scheduler dispatches bounded due rows, rechecks the scheduling
human's current Identity/permissions/2FA and public item availability, and claims
the exact schedule/version before publication. Strict audit and status write
are atomic. A stale worker cannot undo cancellation or a changed schedule;
blocked work is disclosed and requires staff review. No copied content.

## 2. Editor patterns and layout protection

Editor owns reusable named patterns/templates of canonical MoboCom documents,
separately scoped to pages or posts. Managers of that exact section manage
patterns; existing section authors may use allowed patterns on their own work.
Unknown/module-off content remains stored; unsupported patterns cannot silently
drop blocks. Insertion allocates fresh IDs; replacing a document is explicit.
Pattern data is schema/size bounded, version claimed and audited. No engine
serialization is persisted. Structural locks round-trip canonically and the
server prevents an author from bypassing them; managers may change protection.
Templates use the same editor and block registry, not another page builder.

## 3. My lists on content pages

Add one shared, accessible picker on canonical public detail surfaces, composed
over /api/me/lists and its existing Favorites/Games/Music/Collections owners.
Respect type/module/current publication/privacy and collection collaboration;
no copied lists or identity. Guests receive sign-in navigation. Loading, empty,
failure/retry, selected and per-command pending states are explicit. Changes in
the owner buttons and the new control must converge after refresh/events.

## 4. More configuration history

Audit remaining forms before extending existing ContentRevision and typed
settings adapters. Cover the audited Site Studio, navigation, Media Library,
Business and notification-policy configuration owners through their current
guards/forms. Compare versions and restore only allowlisted configuration;
preserve unknown metadata, strict atomic audit and concurrency claims.
Credentials, money/stock/ownership, execution cursors and operational state are
excluded from snapshots/restores. Never advertise universal history over such
fields. Keep an explicit coverage table and disclose genuinely unassessed forms.

## Acceptance / safety

- Additive migration(s) in both Prisma schemas and release manifest, tested on
  empty and populated owned PostgreSQL; preserve existing rows and numbers.
- Registered connected tests compose actual owners; concurrency, cancellation,
  stale version, scope/member/guest/module-off and rollback cases. Deliberate
  faults must fail; restore source and rerun.
- Relevant non-root/no-.env units, TypeScript/architecture/source/security and
  migration checks after each coherent batch.
- Actual browser saved/reopened workflows;1440/390 light/dark, keyboard, errors,
  scoped axe/overflow, React Doctor and visual inspection under SDS/MoboCom.
- Clean all owned fixtures and restore temporary settings with exact claims.
  Record exact evidence/limits in existing map/ledger/workstate + one handoff.

## Execution status — 2026-10-19

All four bounded slices are implemented. Scope, ownership, executed checks,
cleanup and remaining limits are recorded in
`docs/agent/handoffs/AUTHORING_TOOLS_MEMBER_LISTS.md`. Empty126-migration and
populated legacy PostgreSQL checks passed; actual source-browser/E2E and themed
axe/keyboard checks ran. Broader synchronized templates, universal configuration
history and deployed operational certification are not part of this completion.
