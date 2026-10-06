# Feature: a manager for every section, and the forum's team

## Outcome
The owner names a manager for each part of the site from one page, and for the forum names a team in three ranks: forum admin, deputy, forum moderator. Nobody builds roles by hand for this, and nobody gains more than was given.

## Existing evidence
- An account has one role (`User.role`, `User.roleId`, `Role.permissions`). Staff without a role is full access (the owner's account).
- Each section has its own permission since the magazine permission was narrowed (docs/specs/manage-bar).
- The forum already had the access behind all three ranks: `forum.moderate` (staff, the forum's admin pages), a group marked "moderator" (moderates every forum), and `ForumCategoryModerator` (one forum and what is under it). What was missing was a place to set them and a name shown to members.
- **Found while auditing:** `users.manage` (which the support role holds) could make any account, its own included, a full-access admin, create one, set the owner's password or ban the owner. `roles.manage` without full access could edit its own role or create a full-access role. Neither was written to the audit log for roles.

## Canonical ownership
- Identity: `src/modules/identity/domain/sections.ts` (the sections and the role each choice stands for), `server/section-managers.ts`, `server/staff-guard.ts`.
- Forum: `src/modules/forum/server/team.ts` (ranks, deputies, forum moderators); `forumTeam` in `server/board.ts` for the public page.
- No new authorization system: sections are permissions, ranks are names for existing access.

## Actors & authorization
- Section managers page and API: `roles.manage`.
- Forum team tab: the forum admin API (`forum.moderate`). Making someone a *forum admin* is a site role, so it is done on the section managers page (section "تالار گفتمان").
- The staff guard, for every route that changes an account:
  - giving or taking staff standing needs `roles.manage`;
  - full access (no role, or a full-access role) is given only by full access;
  - a full-access account is changed (role, status, password) only by full access;
  - a staff account's password or status needs `roles.manage`;
  - nobody changes their own standing.
- Roles: without full access a role can be made or edited only within the editor's own permissions, never to full access, and never the role the editor holds.

## Scenarios
### Happy path
Section managers: enter an email, tick "موزیک" and "بازی", add. The account becomes staff with the role `sections:music+games` holding the panel and those two permissions. Untick one and save: the role becomes `sections:music`. Remove: the account is an ordinary member again.

Forum team: add a deputy by username; add a forum moderator by username and forum. Their rank shows beside their posts, on their profile, in the member list and on `/forum/staff`.

### Failure / empty / loading / disabled-module paths
- Unknown email or username: named in the message, nothing changes.
- An account with a hand-made role (support, accounting): not changed here; the page says to use the role form.
- A full-access account, or the actor's own: refused.
- A list of sections naming nothing known: refused, not treated as "remove".
- The forum module off: its public pages and admin API are closed as before; the section stays tickable and does nothing until it is on.

## Data invariants
- An account is never left as staff without a role by these pages.
- A `sections:*` role holds exactly its sections' permissions; it is reset to them whenever it is assigned.
- A person's rank is the highest of the three they hold.

## Admin settings / feature flags
None.

## Contracts
- `GET/POST /api/admin/section-managers` `{ email | userId, sections: string[] }`.
- `POST /api/admin/forum` `{ section: 'team', action: 'deputy-add' | 'deputy-remove' | 'moderator-add' | 'moderator-remove', username, categoryId? }`; `GET` returns `team`.
- `AuthorView.rank?: 'admin' | 'deputy' | 'moderator'`.

## Unified identity impact
One identity and one role per account, as before. Deputies are members of an ordinary forum group (`deputies`, made on first use).

## UI
`/admin/section-managers`, a "تیم تالار" tab in the forum admin, a rank pill in the topic's author panel, the profile and the member cards, and the public `/forum/staff`.

## Security/privacy
`/forum/staff` names no forum the viewer may not see and lists no moderator of only such forums. Section-manager changes, role changes and team changes are written to the audit log.

## Migration & compatibility
No schema change. Behaviour change by design: an account holding `users.manage` without `roles.manage` can no longer give roles or touch staff accounts' passwords and status; it still manages customers.

## Acceptance verification
- `scripts/staff-teams.connected.cjs` in `npm run test:pg`; six deliberate breaks each fail it.
- Unit: the sections domain and that every account-changing route calls the guard (`scripts/account-security.test.cjs`).
- Browser and live API on the local site: adding, editing and removing a section manager; the forum team; the public page; eight attempts by a support-role account.
