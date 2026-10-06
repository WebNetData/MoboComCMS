# Feature: manage from the page, and a manager per site section

## Outcome
A staff member reading a public page (a post, a film or series, a song, an album, an artist, a playlist, a game, a software title, a product) gets a link straight to editing that very item, as WordPress offers "edit post". The owner can hand one part of the site to one person with a ready-made role.

## Existing evidence
- Roles and permissions already exist (`Role.permissions`, `src/modules/identity/rbac.ts`, `requirePerm`). Each content section already has its own permission, declared by its plugin: `music.manage`, `cinema.manage`, `games.manage`, `software.manage`, `forum.moderate`; products use `cms.products`.
- `cms.posts` is the magazine's permission and is also accepted by the music, cinema, games and software admin APIs and by forum moderation. It is used in 36 files.
- No public page linked to the panel. The two shared editors (`AdminCrud`, `MediaCrud`) could only open an item picked from their own list; both list APIs already answer `?id=`.
- `/api/me` returns the signed-in account's role and freshly resolved permissions (the panel shell uses it).

## Canonical ownership
- Authorization stays where it is: identity (`rbac.ts`, `access.ts`). Nothing new decides access.
- `src/components/admin/ManageBar.tsx` only decides what to show.

## Actors & authorization
- Visitor, customer: nothing is shown and no request is made.
- Staff with a role: the bar shows when the role holds one of the permissions the page names (the same ones its admin API accepts).
- Staff without a role (the owner): always.
- The panel page and its API check the permission again; a hand-made link gives nothing.

## Scenarios
### Happy path
The music manager opens a song's page, sees "مدیریت آهنگ · ویرایش آهنگ", follows it and lands in the music library on the tracks tab with that song's form open.

### Failure / empty / loading / disabled-module paths
- The same manager on a film's page: no bar.
- `?edit=` naming an item that no longer exists: the list opens with a "not found" message.
- A section switched off: its public pages are gone, and so is the bar on them.
- Preview inside the page builder: no bar.

## Data invariants
None; no data is written.

## Admin settings / feature flags
Role form (`/admin/roles`): ready-made roles "مدیر موزیک", "مدیر فیلم و سریال", "مدیر بازی", "مدیر نرم‌افزار", "مدیر تالار گفتمان", "مدیر فروشگاه", each with `dashboard.view` and its own section's permission, and "ویراستار محتوا" with `cms.posts`.

## Contracts
- `?edit=<id>` on `/admin/posts`, `/admin/cinema/titles`, `/admin/software/titles` and `/admin/music/library?tab=tracks|albums|artists|playlists` opens that item's form. Games and products already have a page per item.

## Unified identity impact
None. One identity, one role per account, as before.

## UI
A small dark pill fixed at the bottom corner (above the mobile tab bar on phones), closable to a single button. Shown to staff only, so the protected visuals of the public pages are unchanged for everyone else.

## Security/privacy
The bar reveals admin URLs only to accounts that are already staff. It asks `/api/me` only when the session says the account is staff.

## Migration & compatibility
No schema change. Existing roles are untouched; presets apply only when a new role is created from one.

## Decision (owner, 2026-10-06): the magazine permission is the magazine only
The owner asked for the permissions to be told apart. `cms.posts` now guards the magazine and nothing else: posts, post categories, article comments, the journal dashboard and settings, post templates and the blog placement in the builder, the post actions of the AI assistant, a post's paywall, the newsletter, and the editorial collections its editors feature. It stays in two "any content editor" lists that name every section (file uploads, form auto-fill).

It no longer opens: music, films and series, games, software (their admin APIs, media library, categories, paywall, menus, manage bars), forum moderation and the forum admin, or review moderation. Each takes its own permission only.

- **Studios** are shared by the games and the film catalogues; changing one takes `games.manage` and `cinema.manage` together (it took `cms.posts` before, for the same reason).
- **Picture upload** (`/api/admin/media`) accepted `cms.pages`, `cms.posts` or `settings.manage`, so a music-only manager could not upload a cover. It now accepts any content section's permission (`CONTENT_EDIT_PERMISSIONS`).
- **Nobody loses access.** Migration `20261203120000_posts_permission_is_the_magazine` (data only) gives every role that holds `cms.posts` the six permissions it used to imply: `music.manage`, `cinema.manage`, `games.manage`, `software.manage`, `forum.moderate`, `reviews.moderate`. It is safe to run twice. To narrow a person to the magazine, remove those from their role, or make a role from the "مدیر مجله" preset.
- Presets: "مدیر مجله" (`cms.posts`), "مدیر محتوا" (the magazine and every content section). The seeded "content backup" role and its preset carry the six permissions too, so new installs match migrated ones.
- SQLite installs have no migration runner here; a role holding `cms.posts` there needs the six permissions added by hand.

## Acceptance verification
- Unit: section presets hold known permissions, stay inside their section and never carry `cms.posts` (`scripts/account-security.test.cjs`).
- Browser: owner, music manager, customer and visitor on all eight page kinds; the bar's link opens the right item's form.
- Unit: the files that name `cms.posts` are an exact list, no section guard or plugin menu takes it, and the migration grants exactly `FORMERLY_OPENED_BY_POSTS` (`scripts/account-security.test.cjs`).
- PostgreSQL: the migration on roles made for the test (`scripts/posts-permission-migration.connected.cjs`).
- Live admin API: nine single-role staff accounts against 27 endpoints.
