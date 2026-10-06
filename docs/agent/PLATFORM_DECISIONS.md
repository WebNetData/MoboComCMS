# MoboCom — Platform decisions in force

Decisions the owner made, and rules that came out of the work, **after** the v4 master prompt was written. They are part of the platform's algorithm: read this before working on access, the forum, staff, or the local workflow. The master prompt states principles; this file states what was decided here and where it lives in the code.

Keep it short and current. When a decision changes, change the entry; do not append history (git and `.ai/MOBOCOM_WORKSTATE.md` hold that). Each entry: the rule, why, where, and what guards it.

Last revised: 2026-10-07 (main `ee8f668`, PRs #95–#116).

---

## 1. Product focus and module switches

- **Focus surfaces:** Store, Magazine, Games, Movies and TV Series, Music, Forum. VPN sales, resellers and the seller marketplace are set aside for now (owner, 2026-10-06).
- **A switched-off module disappears from the admin menu and its APIs close; its data stays.** `reseller` is its own module and requires `vpn`.
- Where: `src/plugins/*/manifest.json` (generated catalog: `npm run extensions:generate`), effective state with `requires` in `src/extensions/server/state.ts`, `whenModuleOn(id, handler)` in `src/extensions/server/modules.ts`, `src/modules/notifications/domain/event-modules.ts`. Spec: `docs/specs/module-switches/SPEC.md`.

## 2. Authorization: one permission per section

- **Every part of the site is opened by its own permission and by nothing else.** There is no shared "content" permission.

| Permission | Opens |
|---|---|
| `cms.posts` | The magazine only: posts, post categories, article comments, journal, post templates, newsletter, editorial collections |
| `music.manage`, `cinema.manage`, `games.manage`, `software.manage` | That section's admin, media library, categories, paywall, menu and manage bar |
| `cms.products` (+ `orders.manage`) | Store products (and orders) |
| `forum.moderate` | Forum admin and moderation of every forum |
| `reviews.moderate` | Ratings and reviews of content |
| `games.manage` **and** `cinema.manage` | Studios (shared by both catalogues) |

- Until migration `20261203120000_posts_permission_is_the_magazine`, `cms.posts` also opened music, films, games, software, forum and review moderation. That migration gave every role holding it those six permissions, so nobody lost access. **Never accept `cms.posts` in a new guard unless the thing guarded is the magazine.**
- Guard: `scripts/account-security.test.cjs` holds the exact list of files allowed to name `cms.posts`; a new file fails the test until it is reviewed and listed.
- When a plugin adds a section: declare its own permission in the manifest, use only that in its guards and menu, add it to `SITE_SECTIONS` if it should be delegable, and to `CONTENT_EDIT_PERMISSIONS` if its editors upload pictures.
- Where: `src/modules/identity/rbac.ts` (`PERMISSIONS`, `ROLE_PRESETS`, `FORMERLY_OPENED_BY_POSTS`, `CONTENT_EDIT_PERMISSIONS`), `src/modules/identity/server/access.ts` (`requirePerm`), `src/modules/identity/server/admin-guard.ts`. Spec: `docs/specs/manage-bar/SPEC.md`.

## 3. Staff: who may change whom

- An account has **one role**. Staff without a role (`role = ADMIN`, `roleId = null`) is **full access** — the owner. Therefore: *standing and role always change in the same write; never leave an account as staff without a role.*
- Rules, enforced for every route that changes an account (`accountChangeRefusal` in `src/modules/identity/server/staff-guard.ts`):
  - giving or taking staff standing needs `roles.manage`; `users.manage` is for customers' accounts;
  - full access is given, and a full-access account changed (role, status, password), only by full access;
  - a staff account's password or status needs `roles.manage`;
  - nobody changes their own standing.
- A role is made or edited only within its editor's own permissions, never to full access, never the role the editor holds (`roleRefusal` in the roles route). Role changes are audited.
- **Any new route that sets `role`, `roleId`, `status` or `passwordHash` of a user must call the guard.** A unit test counts the calls in the existing routes.
- Known gap: the reseller admin route sets passwords and is not behind the guard yet.

## 4. Managers of site sections

- The owner names a manager per section from **`/admin/section-managers`** (needs `roles.manage`). No role is built by hand: a choice of sections stands for one role, `sections:<ids joined by +>`, holding `dashboard.view` and exactly those sections' permissions; it is reset to exactly that on every assignment.
- Sections: `magazine`, `music`, `cinema`, `games`, `software`, `store`, `forum`, `reviews` (`SITE_SECTIONS` in `src/modules/identity/domain/sections.ts`). No section may carry `users.manage`, `roles.manage`, `settings.manage`, `finance.manage` or `extensions.code` (unit-tested).
- Hand-made roles (support, accounting) and full-access accounts are shown there and changed only in the role form.
- Where: `src/modules/identity/server/section-managers.ts`, `/api/admin/section-managers`. Spec: `docs/specs/staff-teams/SPEC.md`.

## 5. Manage from the page

- Public item pages (post, film/series, song, album, artist, playlist, game, software, product) show staff a small bar with "edit" straight to that item: `src/components/admin/ManageBar.tsx`.
- **The bar decides what to show, never what is allowed.** The panel and its API check the permission again. Visitors and customers get nothing and no request is made for them.
- Admin editors open one item from a link: `?edit=<id>` on `/admin/posts`, `/admin/cinema/titles`, `/admin/software/titles`, `/admin/music/library?tab=tracks|albums|artists|playlists`; games and products have a page per item.
- A new public item page gets a `ManageBar` with its section's permission; a new shared editor honours `?edit=`.

## 6. The forum (Invision-class, with a social layer)

Owner's direction (2026-10-06): a board as capable and good-looking as Invision Community, with the social network built in. The forum is **not** a protected visual surface; it was redesigned on the site's tokens. Spec with every slice: `docs/specs/forum-invision/SPEC.md`.

**Structure**
- Three levels: **section → forum → subforum** (`MAX_CATEGORY_DEPTH`, `categoryTree`, `categoryFamily`, `categoryPath` in `src/modules/forum/domain/tree.ts`). No schema beyond `ForumCategory.parentId`.
- **A section takes no topics** (a top-level category that holds forums): not offered by the composer, refused on create and as a move target, for staff too.
- A forum is sized and dated over itself and the subforums *the viewer may see*; a hidden subforum adds nothing to its parent (counts, last post, breadcrumb).
- Every list that shows the tree walks it with `categoryTree` (composer picker, sidebar, move dialog, admin table). Do not write another two-level walk.

**Team: three ranks, each a name for access that already exists**

| Rank | Access behind it | Set where |
|---|---|---|
| مدیر کل تالار (`admin`) | staff holding `forum.moderate` | section managers page, section "forum" |
| معاون تالار (`deputy`) | member of a group with `moderator = true` (group `deputies`) | forum admin → تیم تالار |
| مدیر انجمن (`moderator`) | `ForumCategoryModerator` row: that forum and everything under it | forum admin → تیم تالار, or the category form |

- `Viewer.moderator` = moderates everywhere; `Viewer.moderates` = forums assigned. **`inCategory(viewer, categoryId)`** gives the viewer as they stand in one forum; every entry point that loads a topic or post applies it. New forum code must not test `viewer.moderator` on a topic or post without going through `inCategory` / `moderatesCategory`.
- An assigned moderator moves a topic only into a forum they moderate or could post in; posts only into a topic of a forum they moderate. They have no access to the admin panel.
- Rank is shown beside posts, on the profile, in the member list and on `/forum/staff` (`forumRanks`, `forumTeam` — the public page names no forum the viewer may not see).
- Where: `src/modules/forum/server/team.ts`, `actions.ts`, `moderation.ts`, `community.ts` (`viewerFor`).

**Pages**
`/forum` board index (`server/board.ts`, `ForumRow`), `/forum/c/<slug>` forum page and all topic lists (`TopicListPage`, `TopicList`), `/forum/t/<id>` (`TopicView`), `/forum/activity` (`server/stream.ts`), `/forum/users`, `/forum/g`, `/forum/u/<username>` (`server/people.ts`), `/forum/leaderboard` (`server/leaderboard.ts`), `/forum/staff`, `/forum/clubs` (`server/clubs.ts`). Styles are appended blocks in `src/app/forum.css`, one prefix per area (`fb-` hero and widgets, `bi-` board rows, `fc-` forum page, `tl-` topic list, `tp-` topic heading, `fs-` stream, `fm-` members, `fg-` groups, `fp-` profile, `fl-` leaderboard, `ft-` team, `fk-` clubs).

**Rules that hold across them**
- Everything public is limited to the forums the viewer may see (`visibleCategories`); hidden posts and unlisted topics never count.
- Reputation = one point per reaction from someone else. Leaderboard days turn at midnight in **Tehran**.
- The social side belongs to its owners: following is identity's (`UserFollow`, `/api/people/<username>/follow`), feed posts are community's (`homeFeed`, `ProfileSocial`), reviews are the reviews module's (`recentReviews`). The forum composes them; it never re-implements them. Each respects its module's switch.
- "Who follows whom" is not published as activity: follow lists are private for members who chose so.

**Clubs**
- A club = a forum group (joining, requests, owners) + a forum under the section `clubs` whose access is that group's + the founder as that forum's moderator. Linked by the nullable `ForumGroup.clubCategoryId` (migration `20261204120000_forum_clubs`). Open: everyone reads, members write. Private: members only, joining by request.
- From trust level 1, three per founder (`CLUB_MIN_TRUST`, `CLUB_MAX_OWNED`, fixed in code for now). Clubs have their own page and are laid out neither on the board index nor among user groups.

## 7. Engineering rules learnt here

- **A pull request always targets `main`**, even when its branch sits on an unmerged one (it then shows the earlier commits and shrinks once they merge). Stacked bases made six merges land in each other instead of `main`. After the owner reports merges, confirm with `git merge-base --is-ancestor <branch> origin/main`.
- **The agent does not merge**; the owner does. Deploy and production actions are the owner's.
- **Evidence standard for a slice:** a connected PostgreSQL script (`scripts/<name>.connected.cjs`, registered in `scripts/run-pg-checks.cjs`, run by `npm run test:pg`) that asks the same functions the pages call, as several viewers; then deliberate breaks of each rule to prove the script catches them (back the file up and copy it back; never `git checkout --` an uncommitted file). Browser check with Playwright for anything visible, at 1440 light/dark and 390.
- **Data migrations preserve access and are safe to repeat.** Tests of data migrations run inside a transaction that is rolled back.
- Register unit tests by appending to a file already in `test:site`; put `CHECKS` entries on non-adjacent lines so parallel PRs do not conflict.
- **Local site:** `docker compose -f docker-compose.local.yml` (app on 3000, PostgreSQL on 127.0.0.1:5435). The container copies the working tree at start, so **restart it after every code change**.
- Persian dates are built with `formatToParts` and `timeZone: 'Asia/Tehran'`; relative-time components must not differ between server and browser.
- Floating helpers (translate prompt, support chat, manage bar) step aside while the forum's reply editor is docked (`body:has(.fx-dock)`); anything new that floats at the bottom joins that rule.

## 8. Open, by the owner's decision or still owed

- Production: run `npm run deploy:migrate` (through `20261204120000`), set `STORE_DELIVERY_KEY`, configure SMTP/SMS for password recovery, arrange forums into sections, narrow roles that held `cms.posts`.
- Not yet built: closing or handing over a club; settings for who may start one; a weight per kind of reaction; one address for a member's profile (`/u/<username>` and `/forum/u/<username>` both exist).
- Not yet verified in a browser: the full buyer's walk through the store, magazine and media sections; a section manager saving content with a single-section account; split/merge, polls and private messages in the forum.
