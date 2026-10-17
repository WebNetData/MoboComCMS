# Cinema people management

## Outcome and owner

Manage canonical CinemaPerson profiles independently at `/admin/cinema/people`: search, role filters, existing shared pagination, create and edit display name, picture and formatted biography; inspect linked titles. Reuse CinemaPerson/Credit, Cinema guards/Admin shell, shared ContentEditor/sanitizer and Media Library/uploads. Existing public person IDs/URLs, title source fields and credits remain unchanged; no separate actor/director identity tables. Roles derive from credits and a person may have both.

## Access and contracts

Only `cinema.manage` via `adminGuard` and current canonical Identity, with module-off404; Cinema authors and Magazine-only managers cannot edit shared people. GET list/detail and POST create/PATCH update at `/api/admin/cinema/people`. Mutations require same-site Origin, strict rate limit, bounded JSON, validation and atomic audit. A profile version claim returns409 on stale edits; duplicate canonical name returns409 on create. Unknown IDs404. No deletion/merge or reassignment of historical credits in this slice.

Display-name edits do not rewrite the immutable normalized matching key or names stored in title credits. Initial manual creation uses the same name normalizer/deduplication as metadata imports. Public search includes curated display names. Existing per-title names and role/character strings remain source evidence; public picture presentation prefers the canonical person's image.

## Data and compatibility

Add `profileVersion Int default0` (concurrency token, not a second revision history), `imageLocked Boolean default false` and `displayNameKey String default empty` (portable normalized display-name search) to the existing person model in both schemas and an additive PostgreSQL migration/release manifest. Existing names remain searchable through their canonical keys; curated names fill the extra search key on save. Manual saves may lock a selected or intentionally cleared picture against subsequent metadata synchronization. The same transaction claims the version, increments it and records audit. Automatic photo promotion uses an unlocked-picture claim. Locked blanks suppress optional photo enrichment; existing unlocked behavior remains. Biography uses shared cleanRichText/renderEditorialText, with plain SEO projection and CSP nonce on modified public profile scripts. Library image selection uses existing public paths/transfer queue; no remote fetch during profile save.

## UI and failure paths

Existing wide Admin/SDS tokens, keyboard/RTL/light/dark/mobile. Default20, shared20/50/100/500/all page sizes; search/filter resets page. Loading, fetch errors with retry, empty state, saving/error/success/conflict states; retain unsaved edits on failure and require explicit reload/discard. Show public link only for people with public credits. Add existing Cinema navigation entry and public ManageBar edit link. Image upload/Library selection and rich biography reuse existing components. Imported profiles/credits/URLs survive subsequent title saves.

## Acceptance

Native `scripts/cinema-people-admin.connected.cjs`: actual PG create/dedupe/roles/search/pagination/biography sanitization/version conflict/audit rollback/manual photo and clear preservation/repeated sync/public projection. HTTP/browser checks: authors/unrelated managers/anonymous/foreign-Origin/module-off denial. Deliberately break a claim/photo lock and detect failure, then restore/pass. Relevant no-.env/non-root units/types/migration/schema/architecture/security; actual local Admin create/edit/upload-or-Library/bio/save/reload/conflict, public profile/title picture and draft exclusions, light/dark1440/390 scoped axe/keyboard/Doctor. No hosted Actions; record only executed checks in one continuation handoff.

Implementation and executed scope: [Cinema profile continuation](../../agent/handoffs/CINEMA_PEOPLE_ADMIN.md). This is a same-process Admin contract, covered by typed consumers/native/HTTP/browser tests; it does not add a public/mobile protocol.
