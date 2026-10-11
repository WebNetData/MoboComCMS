# Scoped restrictions — incremental implementation

## Outcome and existing evidence

Extend the canonical Identity/AuthZ and Moderation owners with independently revocable restrictions, without widening legacy forum sanctions to other modules. Target contract: [platform evolution](../../agent/contracts/platform-evolution.md#4-scoped-restrictions-and-moderation).

Current forum entry points compose `viewerFor` and `Viewer.silenced/suspended`; the Admin writes `ForumProfile.silencedUntil/suspendedUntil`. `User.status` remains the global account standing. Identity's `accountChangeRefusal` protects staff/full-access accounts. Inspection found the existing forum Admin sanction mutation did not call that guard.

## Slice 0: protect staff in the existing sanction path

- Keep `/api/admin/forum` and its `forum.moderate`, module-disable and Origin guards.
- Pass the authenticated actor into member moderation. Before either applying or clearing silence/suspension, call the existing `accountChangeRefusal(actor, userId, { sensitive: true })`.
- A forum-only manager may moderate customers. A manager lacking `roles.manage` cannot sanction staff; non-full staff cannot sanction full-access staff. Full-access actors retain their existing authority. Cosmetic profile edits and trust-level behavior stay as they were.
- A refusal is 403 before any mutation, with no successful audit event. Existing successful changes use the existing Admin audit owner.
- No new permission, identity, setting, URL, sanction store, migration or UI is introduced in this safety slice.

Acceptance: connected PostgreSQL calls to the actual PATCH handler for customers, ordinary staff, full-access staff, role-capable moderators, applying/clearing sanctions and the disabled-module case. Snapshot target profiles before refusals and prove they stay unchanged. Deliberately remove the canonical guard to prove the check fails, then restore it. Add to `run-pg-checks.cjs`; run relevant unit/architecture/source/type checks. A direct live API regression supplements the handler check.

## Slice 1 audit — independent forum restrictions (bounded implementation)

Observed 2026-10-10 after PR #146: there is no canonical restriction-record model in either Prisma schema. `forum/server/http/admin.ts::moderateUser` writes one `ForumProfile.silencedUntil` and one `suspendedUntil`; another action overwrites the timestamp and clearing it loses all effective restrictions of that kind. The profile has one shared moderation note, not independently attributed sanction history. `forum/server/community.ts::viewerFor` reads these dates on every request; `getForumViewer` uses request-local React caching, not a cross-request authorization cache.

Important current semantics: `forum/domain/community.ts::categoryAccess` lets silenced/suspended members read and denies posting, while moderators have an existing category/edit exemption. Personal-message `requireSender` and `canStartMessage` refuse both flags before the staff messaging exemption. Suspension must not be silently redefined as a global account ban or a denial of all forum reading. `forum/server/people.ts` also derives public profile flags from the dates; preserve those consumers and their displayed expiry while introducing the canonical records.

### Outcome, owner and contracts

- Add one restriction-record store under canonical Identity/AuthZ, composed by the current Forum/Moderation owners. It uses the existing numeric UserId; neither ForumProfile nor CRM becomes an identity. General scope/target/capability fields follow platform-evolution §4; the first mutation adapter accepts only the inspected forum module effects. Unsupported GLOBAL/resource/other-module mutations are rejected until their guards are implemented and tested.
- Each row retains subject, module scope, denied capabilities, the forum effect needed for legacy silence/suspension presentation, reason, issuer/start/expiry, immutable issuance audit reference, source/provenance, and separate revocation actor/time/reason/audit reference. Two restrictions may overlap; revocation targets one ID and never erases another row. Expiry is decided at read time even if no cleanup worker runs.
- Keep the existing `/api/admin/forum` guard (`forum.moderate`), Origin/module guards and `accountChangeRefusal(..., { sensitive: true })` for both issue and revoke. Wrong-section staff cannot create/read private sanction history or revoke a record; forum staff cannot create a global account restriction. Applying or clearing a protected staff record follows the canonical staff guard. Issuer provenance does not substitute for authorization.
- Extend that route's typed sections for history/issue/revoke rather than creating another administration system. Add history/revoke controls to the existing member card, preserving the current visual layout and tokens. Server authorization remains authoritative, including when a button is hidden.
- Existing `section: users` and `silenceDays`/`suspendDays` requests keep their URLs/body contract and explicit legacy replace/clear semantics. Record those operations as audited replacements or bulk revocations of that same forum effect. Individual record revocation changes only that row. A compatibility clear is an explicit action, not a side effect of revoking a different record.

### Data, concurrency and migration

- Additive schema parity and registered PostgreSQL migration/backfill; retain both legacy date columns and their note. Backfill all stored non-null sanctions, including expired entries, preserving notes and expiry. Do not invent an issuer or known start date: nullable issuer/source metadata disclose the historical uncertainty. Give backfill rows stable source keys so replay cannot duplicate them.
- The date columns become a compatibility projection for older readers and rollback; record/projection changes are one transaction. Document how legacy replace/clear affects the selected effect. Serialize same-subject issue/revoke/replace commands so concurrent operations cannot lose an independent restriction or restore a revoked one. Repeated revoke returns conflict without another mutation or successful audit.
- Rollback retains records and projects the remaining effective forum dates for the old binary; no destructive down migration. Exercise the old date-only reader against migrated rows and the new reader against existing data. Evaluate rolling old-writer compatibility explicitly before release rather than assuming timestamps and records cannot diverge.
- Authentication, User.status, canonical session/token identity and unrelated Music/Store guards do not change in this forum-only slice. New module restrictions never grant a permission. Preserve the inspected legacy read and staff exemptions; new explicit denial precedence and every exception must be covered by the same policy's actor matrix, not an additional resolver.

### Acceptance before maturity promotion

Register `scripts/scoped-restrictions.connected.cjs` in the existing PG runner. Test actual handlers/services with a customer, forum manager, wrong-section manager, role-capable staff and full-access staff; overlap, independent revoke, future start, boundary expiry, invalid targets, refusal before writes, repeat revoke, concurrent commands, audit references and compatibility projection. Test migration/backfill on both an empty database and stored sanctions with unknown provenance. Deliberately remove the staff guard, ignore an overlapping row, ignore expiry and broaden scope to prove the checks fail; restore source afterward.

Add direct API/browser acceptance for history/individual revoke and forum posting/message refusal while login, Music and Store remain usable. Run affected units, schema/manifest, source/type/architecture checks; React Doctor on the affected member card and real desktop/mobile light/dark plus scoped axe. Never claim the broader global/resource/token/background restriction contract from this bounded forum scenario.

The bounded forum slice is implemented in the isolated delivery branch, with real migration, transactional audit, actor/concurrency/legacy/history checks and compiled browser evidence. A single-connection regression exposed an extra database connection in the canonical staff guard; its optional transaction reader preserves existing callers and resolves that failure. Long legacy notes remain intact when date-only commands create a bounded new reason. Executed gates and remaining release limits are recorded in [the focused audit](../../agent/audits/2026-10-10-scoped-restrictions.md); implementation is not production certification.

## Following slices

Complete global/capability/resource enforcement through the same Identity/AuthZ guards, including existing sessions/tokens/background entry points and narrow recovery exceptions; then deterministic group decisions and other module consumers. Expand scopes only after relevant guards/entry points are assessed. Retain the full platform roadmap and evidence requirements.

## Slice 2A — authentication enforcement foundation

Consume the existing GLOBAL facts with the explicit denied capability identity.authenticate in requireUser, every new/existing JWT callback, and the existing API-key/session-fallback resolver. Read current facts on every decision; no cache, role bypass, new permission, new table, migration, public URL or parallel resolver. MODULE sanctions and unrelated denied capabilities do not revoke authentication. Malformed restriction data or storage outage propagates: never return an authenticated identity on failure. A decision is fresh when checked; this does not promise cancellation of an already-running transaction.

Existing User.status/password-change checks stay in place. Recovery/refund service operations are not granted an implicit exception. GLOBAL issue/revoke/history Admin commands, contextual/download/background policy and their explicit recovery capabilities remain following slices; no global mutation is enabled by this foundation. Keep maturity PARTIAL until those consumers and the actual Admin workflow are proven.

Connected acceptance: real PostgreSQL rows, actual signed cookie decoding, real hashed key, existing/new JWT callbacks, independent module isolation, unrelated capabilities, other subject, overlap/individual revocation, exact scheduled start/expiry, full-access staff without bypass, legacy standing and database outage. Fixture creation/deletion does not stand in for the future authorized global issuance API. Register the connected gate, run existing scoped/staff checks, application check/build and compiled browser regression before committing.

## Slice 2B — current-account composition at raw-token consumers

Replace only the source-confirmed raw-token identity adapters in ads/promo, repository/public and form submission with existing `requireUser`. Retain all module/Origin/rate/ownership guards, per-section staff permissions, URLs, stored states, anonymous serving/public files and independent machine-license consumers. No new table, permission, setting or restriction store. Account-sensitive writes, advertiser image upload and owner download refuse revoked/banned/globally restricted identity before calling the existing owner; database errors propagate rather than acquiring privileges. Forum-only restrictions do not disable these unrelated sections.

Forms use their existing `requireLogin` Admin setting: a denied/stale identity cannot submit a login-required form or receive account attribution. A publicly anonymous form remains usable as a guest and stores userId=null; this is public anonymous behavior, not an implicit authenticated recovery bypass. Do not turn a global account restriction into anonymous-person identification. Password reset and current role/standing are checked by the canonical guard.

Acceptance: actual PostgreSQL users, signed cookies, GLOBAL/MODULE overlap and password reset; invoke each actual HTTP owner and verify delegates are not reached by denied requests, including storage outage. Prove real persisted form attribution/required-login behavior. Then compiled HTTPS browser against the actual advertiser, owner-license/download and form endpoints, with before/after rows and original module configuration restored. Existing ads/repository/forms units, source/architecture/type gates and affected compiled regressions run. Individual revoke restores account access. Machine license entitlement/background/recovery and global Admin workflows remain assessed following slices, never counted as complete here.
