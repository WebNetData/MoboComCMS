# MoboCom — Platform decisions in force

Decisions the owner made, and rules that came out of the work, **after** the v4 master prompt was written. They are part of the platform's algorithm: read this before working on access, the forum, staff, or the local workflow. The master prompt states principles; this file states what was decided here and where it lives in the code.

Keep it short and current. When a decision changes, change the entry; do not append history (git and `.ai/MOBOCOM_WORKSTATE.md` hold that). Each entry: the rule, why, where, and what guards it.

Last revised: 2026-10-07 (main `7483e01`, PRs #95–#119, and the first slices of the capability map's open gaps).

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
- Who may start one is the forum's settings (`clubsEnabled`, `clubsMinTrust`, `clubsMaxOwned`; forum admin → settings); staff are not limited. Clubs have their own page and are laid out neither on the board index nor among user groups.
- The founder **closes** a club (nobody joins, no topic starts, waiting requests are withdrawn; nothing is deleted) and opens it again as the kind it was; closed is `joinMode = CLOSED` with the forum locked, and the kind is read from the forum's permission rows, not from the join mode. The founder **hands it over** to one of its members. A club's forum is moderated by exactly its owners (`syncClubModerators`, also called by the group's own owner toggle).

## 6A. Filing content: more than one taxonomy per section

- The shared taxonomy (`TaxonomyTerm`, `TaxonomyAssignment`; rules in `src/modules/taxonomy/domain/taxonomy.ts`) files a section's items under a tree of terms. **A section may have more than one taxonomy.** Music has two (owner, 2026-10-07): `music` — categories of **albums** — and `music-language` — the language or dialect of a **song** (فارسی، ترکی، لری، مازندرانی to start; more from the admin).
- **One taxonomy, one kind of item.** Assignments are keyed by term and a bare item id, so a taxonomy must never file two kinds of item (albums and songs share ids). A new way of filing is a new taxonomy with its own terms, not a second owner type in an old one.
- To add one: add its id and `TAXONOMY_INFO` entry (label, item word, public base path, module — the module decides the permission, `<module>.manage`); name it in `liveOwnerIds` (which table its items live in); set `taxonomy` on the media resource in `src/modules/media/server/admin.ts`; add the `terms` field to that item's admin form; give it a public archive under its base path; add it to `LEGACY_SOURCES` only if an old free-text field exists to build it from. **Every branch on a taxonomy names it**: an `else` that means "cinema" silently swallows a new one (it did, twice).
- Public: `/music/language` (index), `/music/language/<language>[/<dialect>]` (songs), a link on the song page, a filter on `/music/browse` (`?lang=`, combining with genre, search and order), an entry in the music mega menu (`src/modules/navigation/server/megamenu.ts`). Admin: Categories → «زبان و گویش موزیک», the song form, and the album form's "language of every song in this album" (`trackTerms`: files each song the album holds in the same save; an album has no language of its own).
- A resource whose save changes another taxonomy's counts names it in `alsoCounts` (`src/modules/media/server/admin.ts`).
- Guard: `scripts/music-language.connected.cjs` (counts and lists published songs only; albums and songs with equal ids stay apart).

## 6B. Slices from the capability map's open gaps (2026-10-07)

**Store: a delivered code.** A code leaves the shelf once. Taken back from its buyer it keeps its order and is marked returned (`ProductDigitalCode.returnedAt`, `returnId`, `returnNote`; migration `20261206120000`): void, not the buyer's any more, never sold again.
- Staff **replace** a code that did not work from the product's pool screen (`replaceCode`): the old one is void and a code of the same shelf takes its place on the same order line, in one step; the buyer is told without the code in the notice.
- **Sending a code back** is a return like any other, by its own window: `codeReturnDays` in the return rules, 0 (never) by default, because a code the buyer has read cannot be resold and that is the owner's call. Every such request is reviewed by staff; a line gives back no more units than the codes its buyer still holds, and the reasons offered fit what goes back (`reasonsForGoods`). On refund the codes of the returned units are void (`takeBackCodes`, the ones given last first; safe to repeat).
- A **cancellation** of an order whose codes the buyer has already read is never refunded by itself; it waits for staff.
- Stock of a product that sells from its pool is the pool's count, also after stock is returned (`returnStock` → `syncCodeStock`).

**Cinema: film release calendar.** `CinemaTitle.releaseDate` (additive, migration `20261207120000`; unset = not on the calendar). `/cinema/calendar?kind=films` shows published films opening next and opened last, by day, in the layout the episode side has (`filmCalendar`, `groupDays`). The title pages are untouched (protected visual).

**Cinema: separate subtitle and audio files.** A `MediaLink` may be of kind `SUBTITLE` or `AUDIO` with a `language` from `TRACK_LANGUAGES` (migration `20261209120000`, additive). A track is not a release: it has no dub/original side, is shown in groups of its own under the releases in the order of the language list, is never offered to the player and never what "continue watching" opens (`isTrack`, `trackLinks`, `playbackKind`). It goes through the same protected link route as every file, so tokens, VIP and reports work; it does not count towards the daily download limit. The link editor offers the two kinds for films and episodes only. **In the site's own player:** the subtitle files of the same film or episode that the viewer may open and that are WebVTT or SubRip are offered as tracks (`watchSource` → `subtitles`). Each is served by the site at `/api/media/subtitle/<id>` (`openSubtitle`): the same checks as the link route (module, publication, takedown, price or VIP, page token), read by the server through the downloads module's public-address guard (`fetchRemoteBytes`, at most 2 MB), decoded as UTF-8 or else Windows-1256, and converted to WebVTT (`toWebVtt`); a file without a timed cue is refused. The file's own address never reaches the browser. The player switches on the viewer's language (Persian unless they chose otherwise) and remembers the choice on the device.

**Collections written by staff.** `UserCollection.staffAuthored` (migration `20261210120000`, additive). A staff collection is a draft while `PRIVATE` and published as `EDITORIAL`; it is written at `/admin/collections` and edited by **any** staff member holding a content permission (`CONTENT_EDIT_PERMISSIONS`: a collection holds items of every section, so it takes that list and not `cms.posts`). The public sees the site's byline (`EDITORIAL_BYLINE`), never the staff member's name. The two kinds are kept apart in the service (`src/modules/content/server/collections.ts`): the member paths refuse a staff collection even to the staff member who wrote it, and the staff paths (`*EditorialCollection`, `*EditorialItem`) refuse a member's list; selecting a member's public list (`featureCollection`) stays what it was. Taking a staff collection back to a draft keeps who followed, saved and liked it.

**Search facets, and one question about ratings.** A search can be narrowed by members' rating (3+ or 4+), by who may open the item (free, members) and by how new it is (week, month, year): `src/modules/search/domain/facets.ts`, `searchSite({ facets })`, `/search?rated=&access=&since=`, the same parameters on `/api/search`. A facet only removes results; the ranking and its bounded scan are untouched. The counts by kind follow the facets; a page cursor is bound to the facets it was made under; autocomplete is never narrowed. Access is decided by the item as it is now, not by the index, which can lag. Ratings are **read from their two owners** by one function, `ratingsOfItems` (`src/modules/reviews/server/ratings.ts`): shared item reviews from `ItemStat`, shop products from their approved `ProductReview` rows. It stores nothing and moves nothing; this is the interoperability between the two review stores, and neither is to be copied into the other.

**Recommendations: a provider contract.** The engine of a member's private suggestions (`src/modules/recommendations/server/personal.ts`) owns consent, which signals may be read, the bounds, what the member already has and the publication recheck. What goes with a seed is asked of the **provider for its kind of item** (`RecommendationProvider` in `domain/provider.ts`; the built-in ones in `server/providers.ts` answer from the catalogue). `useRecommendationProvider` puts another provider in charge of one kind and returns the way back; whatever a provider returns is cleaned (`cleanSuggestions`), and one that fails costs its own seed only and is logged. A new signal: the member's own **approved reviews of four stars or more** start suggestions (`rated`, weighed like a favourite), and nothing the member has rated is suggested back. A new kind of signal that is private history (watching, purchases) needs its own consent, as listening has.

**A member has one address.** `/u/<username>` is the member's profile. What the forum knows about them is a part of that page (`?tab=forum`, pieces `&f=activity|topics|badges`), built by the forum (`src/modules/forum/server/pages/profile-section.tsx`) and handed to the profile page by the route, so neither module imports the other's pages. `/forum/u/<username>` redirects permanently there while social profiles are on (`forumAddressTarget` in `src/modules/identity/domain/profile-address.ts` maps the old tabs) and stands in by itself when they are off. A profile the viewer may not see does not show its forum part either. Editing the forum's own fields stays at `/forum/u/<username>/edit`. Links inside the forum still name the old address and arrive through the redirect.

**Playback preferences belong to the account.** `User.playbackPrefs` (migration `20261211120000`; rules in `src/modules/media/domain/playback-prefs.ts`): the audio side shown first (dub or original; nothing is hidden) and the subtitle the player turns on. `GET|PUT /api/media/playback-prefs`; set on the profile page of the dashboard, and the player saves a member's switch of subtitle by itself. A visitor's choice stays on the device.

**Every list a member keeps, read and written one way.** `src/modules/account/{domain,server}/lists.ts`: favourites, game shelves, playlists and collections are named by one key (`favorites`, `games:<SHELF>`, `playlist:<id>`, `collection:<id>`), listed by `memberLists`, looked up for an item by `listsHolding` and changed by `setInList`, which calls **the owner's own function** so the owner's rules apply. `GET|PUT /api/me/lists` (`version: 1`) is the address for apps. No list is copied or moved.

**One case around a waiting item.** `ModerationCase` (migration `20261212120000`; `src/modules/moderation/{domain,server}/cases.ts`): who has taken an item of the staff overview, a note for colleagues, and the record of a decision sent from the overview. The item and its decision stay with the owning module; a case decides nothing. Taking an item is one conditional write (two staff members clicking together: one gets it), a claim frees itself after `CLAIM_HOURS`, taking over is a deliberate second step, and a staff member acts only on sources they may moderate. Claims left a week are closed by the `moderation-cases` step.

**People of films and series.** `CinemaPerson`, `CinemaCredit` (migration `20261213120000`; `src/modules/cinema/{domain,server}/people.ts`): read out of each title's own director line and cast list on save (`syncCredits`), and for titles saved earlier by the `cinema-people` worker step, once. One person across spellings and roles (`normalizePersonName`). `/cinema/people` and `/cinema/people/<id>` show published titles only; the film page links the names it already shows. Nothing is typed twice: the title's fields stay the source.

**Sitemap and canonical addresses.** What the sitemap lists of a module is asked of that module with its own rule for what a visitor may see (`src/modules/seo/server/sitemap-entities.ts`): forums and topics through `visibleCategories(GUEST)` — never by reading the `access` column, which let forums of one group and their topics be advertised — and studios, film people, collections and category pages only when something public stands behind them. A listing page reached with filters gets its canonical address and indexability from `listingMeta` (`src/modules/seo/domain/seo.ts`): filters that make a list of their own stay in the address, a reordering is the same list, any other combination is not indexed.

**Versions of edited items.** `ContentRevision` (migration `20261214120000`; `src/modules/content/{domain,server}/revisions.ts`): after a save that changes one of the item's own columns, those columns are kept as the next version; an item older than versions gets a baseline first, so its history starts with what it was. A version never holds a secret, a counter or a relation. `/admin/history?type=&id=` shows the versions and what each changed, and puts one back **as a new version** through the item's owner (`restoreMediaItem`, the CMS route for posts and pages), with everything that follows an edit; a version whose unique address now belongs to another item is refused. Who may read or restore is whoever may edit the item. The last fifty versions are kept. The audit log remains the record of who did what and can be filtered to one item and a period.

**Where an item came from.** `src/modules/imports/server/provenance.ts` reads, from what every import already records, the imports that made or changed an item, its ids in the source systems, and the fields staff edited since the last import wrote them. It is shown on the history page so a re-import is not run blind over local edits. Nothing new is stored. (The importer already keeps external ids per source for repeatable imports, per-field create/update choices and a rollback that reports conflicts.)

**Admin workspace.** Saved views (`AdminSavedView`, migration `20261215120000`): a staff member names an admin address with its filters; kept with the account, at most thirty, the same name replaces. Keyboard shortcuts (`shortcutFor` in `src/modules/identity/domain/saved-views.ts`): `/` section search, `s` save this page, `v` my views, `g` then a letter for a section the staff member may open, `?` help. A shortcut never acts while a field is being typed in or with a modifier held. The component is mounted once, although the navigation is rendered twice.

**Public timeline of an item, apart from the audit log.** `src/modules/content/{domain,server}/timeline.ts`, `GET /api/items/timeline?item=type:id`, `/activity/<type>/<id>`: releases that are out, episodes that aired, published articles and forum topics a visitor may read about an item, newest first, composed on request. Who edited, restored or approved is privileged and stays in the audit log and the versions. **Retention:** the timeline stores nothing, so it has nothing to keep or prune; the audit log is kept in full (no pruning was added, by choice: it is the record of staff actions).

**Notifications: policy.** `src/modules/notifications/{domain,server}/policy.ts`, admin at `/admin/notifications` (`settings.manage`). Everything is **off until the owner sets it**:
- Keeping times: read notices by when they were read, any notice by its age; removed in bounded passes by the `notification-policy` scheduler step. An unread notice is never removed sooner than a read one.
- Daily summary: one email a day (kind `INBOX_DIGEST`, so the site's mail settings and each member's own switch apply) listing the unread notices of the last day **that have no email of their own**; queued once a day per member (`notification.digest` job, deduped), skipped when read in the meantime.
- Delivery receipts are **read from the channel jobs** (`notification:<id>:<channel>`), not stored again: sent, not sent (the member's switch, no address, channel not set up: not a fault), waiting, failed. Finished jobs live a week, so receipts do.
- A check that prunes or enumerates site-wide state narrows every read and delete to its own fixtures and keeps site-wide cursors in memory (`scripts/notification-policy.connected.cjs`).

## 6C. History: before and after launch (owner, 2026-10-07)

The system is being written from zero and has not launched. **Until launch, a rule that changes a stored number is applied to everything already stored**, not "from now on". **After launch, no update may ignore or reset the past**: it carries history forward by recounting from the stored events or by a data-safe backfill.
- Keep the events a number is made of (each reaction, each order line, each view record that is already kept), so a later rule can be recounted from them.
- A migration that adds a derived number sets its first value from the events in the same migration, and is safe to repeat.
- A setting that changes how history is weighed queues a recount of everybody; the recount sets values, never adds to them, works in batches with a cursor and can be interrupted.

**First use: forum reputation.** `ForumProfile.reputation` (migration `20261208120000_forum_reputation`, first value = the reactions each member had received from others) is the reactions received, each by the weight of its kind (`ForumSettings.reactionWeights`, 0–10, 1 unless set; forum admin → settings). A member's own reaction is worth nothing. Changing a weight queues `forum.reputation-recount` (`recountReputation`), which weighs every reaction ever given again. The leaderboard (period and all time), the profile's standing and the member directory read reputation; `likesReceived` stays the plain count that trust levels and badges ask for; "most liked posts" stays a count.

## 7. Engineering rules learnt here

- **A limit that guards a secret is `rateLimitStrict`** (`src/platform/http/rate-limit.ts`): sign-in, 2-step codes, password reset and change, registration, redeem codes, discount-code checks, the installer and API keys. With Redis the hit is counted there in one atomic step (`Kv.hit`) and that count decides, so the limit holds over all app instances; when Redis does not answer, each instance refuses on what it counted itself, so an outage is never a fresh allowance. `rateLimitHit` (synchronous, eventually shared) stays for throttles that protect capacity, not a secret. A unit test fails when one of the guarded keys goes back to `rateLimitHit`; `npm run test:redis` checks the behaviour against a real Redis (skipped without `REDIS_URL`).

- **Every migration belongs to exactly one release** (`prisma/release-manifest.json`, checked by `npm run release:migrations`, part of `npm run check`). A pull request that adds a migration adds its name to `unreleased` in the same commit. At a release the owner runs `node scripts/release-migrations.cjs seal <version>`, which closes the unreleased migrations as that version with the hash of each file; from then on editing one of them fails the check — a fix is a new migration. `node scripts/release-migrations.cjs list [version]` answers "what does this release run on the database". Release `1.6.0` in the manifest is the baseline: everything merged before the rule existed.

- **A pull request always targets `main`**, even when its branch sits on an unmerged one (it then shows the earlier commits and shrinks once they merge). Stacked bases made six merges land in each other instead of `main`. After the owner reports merges, confirm with `git merge-base --is-ancestor <branch> origin/main`.
- **The agent does not merge**; the owner does. Deploy and production actions are the owner's.
- **Evidence standard for a slice:** a connected PostgreSQL script (`scripts/<name>.connected.cjs`, registered in `scripts/run-pg-checks.cjs`, run by `npm run test:pg`) that asks the same functions the pages call, as several viewers; then deliberate breaks of each rule to prove the script catches them (back the file up and copy it back; never `git checkout --` an uncommitted file). Browser check with Playwright for anything visible, at 1440 light/dark and 390.
- **Data migrations preserve access and are safe to repeat.** Tests of data migrations run inside a transaction that is rolled back.
- Register unit tests by appending to a file already in `test:site`; put `CHECKS` entries on non-adjacent lines so parallel PRs do not conflict.
- **Local site:** `docker compose -f docker-compose.local.yml` (app on 3000, PostgreSQL on 127.0.0.1:5435). The container copies the working tree at start, so **restart it after every code change**.
- Persian dates are built with `formatToParts` and `timeZone: 'Asia/Tehran'`; relative-time components must not differ between server and browser.
- **A deliberate break that widens a write is run only against fixtures.** Breaking "file the songs of this album" into "file every song" rewrote the language of every real song on the local database before the check failed. Break the rule so that it reads more, or run it in a transaction that is rolled back.
- **Staff overview decisions stay with their owners.** A batch in `/admin/moderation` is one request per item to the owning module's admin API (`batchIds`, `batchOutcome`, at most `BATCH_LIMIT`); the overview never decides by itself.
- Floating helpers (translate prompt, support chat, manage bar) step aside while the forum's reply editor is docked (`body:has(.fx-dock)`); anything new that floats at the bottom joins that rule.

## 8. Open, by the owner's decision or still owed

- Production: run `npm run deploy:migrate` (through `20261215120000`), set `STORE_DELIVERY_KEY`, decide the return window for codes, the keeping times of notifications and whether the daily summary goes out (`/admin/store/returns`, `/admin/notifications`), configure SMTP/SMS for password recovery, arrange forums into sections, narrow roles that held `cms.posts`.
- Not yet built: styled subtitles (ASS) and separate audio inside the player; facets by one review dimension and a search ordered by rating or date; a measure of how good the suggestions are, and watching history as a signal (it needs its own consent); follows and notices for a film person, and hubs for other kinds of entity (music labels, game franchises as entities); a case for sources whose decision needs more than yes or no, decided inside the overview; lists shared between members beyond collections; forum links rewritten to the member's one address instead of arriving by redirect.
- Not yet verified in a browser: the full buyer's walk through the store, magazine and media sections; a section manager saving content with a single-section account; split/merge, polls and private messages in the forum.
