# Forum: an Invision Community-class board with a social layer

## Direction
The owner wants the forum to look and work like Invision Community and to be a social network as well: advanced, modern, beautiful. The forum is one of the launch sections and is not one of the protected visuals, so its look may change; it keeps the site tokens and both themes.

## Audited evidence
The forum already has the machinery of a serious board: categories with subcategories, colours and icons, group permissions and VIP access, trust levels, groups, badges, flags and a review queue, polls, reactions, bookmarks, tags, solved answers, wiki posts, private messages, watched categories, profiles with avatar, cover, title and counters, presence (`lastSeenAt`). The community module adds public profiles, follows, a feed and posts. What it lacked is the Invision presentation: its home was a flat list of topics in the manner of Discourse, with the forums only as links in a side menu.

## Slice 1 (this change): the board index
`/forum` is now the board index.
- **Header**: title, a line about the place, totals (topics, posts, active members, online) and the two actions (new topic, all topics).
- **Sections of forums**: a top-level category with subcategories is a section with its subforums as rows; top-level categories without any share the first section, so no forum sits alone under a heading that repeats its name. Each row: icon in the forum's colour (dimmed when nothing was posted for a month), name, description, VIP and announcement marks, numbers of topics and posts, and the last post (author's avatar, topic title, author, time).
- **Beside them**: latest discussions, the five most active members of the last 30 days, who is online, totals and the newest member.
- **Navigation**: the filters of the side menu become a strip of links above the index; the topic list lives at `/forum/latest` (`/forum?page=N` still opens the list).

Rules: everything is limited to the categories the viewer may see, so a private forum gives away neither a topic title nor a name; hidden and unlisted topics and hidden posts are left out and do not count; names of who is online are for signed-in members, a visitor sees the number. A page-builder landing set for the forum section still takes precedence.

Owner: `src/modules/forum/server/board.ts` on top of the existing `visibleCategories`, `authorsFor` and `forumStats`; view `src/components/forum/BoardIndex.tsx`; styles `fb-` in `src/app/forum.css`. No schema change.

Acceptance: `scripts/forum-board-index.connected.cjs` in `npm run test:pg` (three viewers on real PostgreSQL: sections and order, last post and its author, quiet forums, contributor counts, presence, and nothing from a private forum; three deliberate faults each make it fail); browser at 1440 px light and dark and at 390 px without horizontal overflow or script errors.

## Slice 2: the topic page as cards
Every post is a card with the author beside it: avatar, name, group (or the trust rank when the member has no group), title, posts written, reputation (likes received) and the month they joined. The post keeps its header (reply mark, edits, time), body, reactions and tools, with the tools at the foot of the card. The topic title sits in a framed header and the page uses the whole width, with the filters as a strip above. On a phone the author panel folds into a row above the post. `AuthorView` gained `posts` and `reputation` from the forum profile; no schema change and no change to what a member may do.

Checked in a browser as a member: five posts with five author panels, a reaction added and taken back, the reply composer opening, 1440 px light and dark and 390 px without overflow or script errors.

## Slice 3: the activity stream
`/forum/activity` shows what the whole community is doing, newest first and grouped by day: new topics, replies and, while the social module is on, the posts of the feed. Each entry names who did what and where, with a plain excerpt, and leads to the post. Filters: all, new topics, replies, members' posts. Older entries are reached with a time cursor.

Each source keeps its own rules. Forum entries come only from categories the viewer may see (hidden posts and unlisted topics are left out); feed posts come through the feed's own function, so its visibility (public or followers), profile privacy and blocks apply unchanged. With the social module off the stream is the forum alone and the posts filter is not offered. Owner: `src/modules/forum/server/stream.ts`; no schema change.

Acceptance: `scripts/forum-activity-stream.connected.cjs` in `npm run test:pg` (a stranger, a follower, a member of a private group and a visitor; the three filters; the cursor; the module switch). It caught that a feed post came through without its text before the page was ever shown.

## Slice 4: members and user groups
`/forum/users` is a directory of member cards in place of a table: avatar, name and handle, the member's title, group or trust rank, posts, reputation and solutions, and last visit. Six orders (reputation, posts, topics, solutions, days visited, last seen); while the list is a ranking its first three stand on a podium. The directory can be narrowed to one user group. `/forum/g` shows each group as a card in its own colour with its icon, description, the first members as faces, member count, how to join, and the viewer's own state in it.

Rules. Only groups the viewer may see are offered as a filter; the slug of a hidden group is ignored and the plain list is returned, so the filter cannot be used to learn who is in a members-only group. Faces are read only for visible groups, owners first, and never include a pending request or a suspended account. A group shows all of its members, including those who have never posted; the plain list still leaves quiet accounts out. Owner: `src/modules/forum/server/people.ts` (`userDirectory`, `listGroups`); no schema change.

Acceptance: `scripts/forum-members-groups.connected.cjs` in `npm run test:pg` (an outsider, a member of a members-only group and a visitor). Removing the visibility rule from the filter, or the status rule from the faces, fails it.

## Slice 5: the member profile
`/forum/u/<username>` in the wide layout: cover, avatar, name and handle, trust rank, title and standing by reputation ("rank N"), a bar of the numbers a visitor looks for (reputation, posts, topics, solutions, followers, following), tabs of what the member wrote, and a side column with about, facts, groups and badges.

Following is not the forum's. The page reads followers, following, feed posts and the viewer's relation from the shared identity (`profileCards`, `profileByUsername`, `relationBetween`) by user id, and the button calls the endpoint the feed already uses, so a follow made here is the same follow everywhere. While the social module is off none of it is shown and the forum profile stands alone. A visitor is offered the button and sent to sign in; a blocked pair is offered nothing, in either direction. Standing counts active members only and is absent before the first like. Owner: `getProfile` in `src/modules/forum/server/people.ts`, `src/components/forum/FollowMember.tsx`; no schema change.

Acceptance: `scripts/forum-member-profile.connected.cjs` in `npm run test:pg`. Counting suspended accounts in the standing, offering the button to a blocked pair, or ignoring the module switch each fails it.

## Slice 6: sections, forums and subforums; the topic list and the topic heading
Owner feedback on the first slices: the board did not look professional, it had no real sections, forums had no subforums, and the topic list and the topic page needed a far stronger design.

**Structure.** The category tree has three levels: section, forum, subforum (`MAX_CATEGORY_DEPTH` in `src/modules/forum/domain/tree.ts`, with `categoryTree`, `categoryFamily`, `categoryPath`). No schema change: `ForumCategory.parentId` already allowed it; the admin rule that refused a second level now refuses a fourth, counting the children a moved category brings along. A forum is sized and dated over itself and every subforum the viewer may see, and its page lists its own topics and theirs. The composer's picker, the sidebar, the move dialog and the admin table walk the same tree. New installs are seeded with three sections; existing installs keep their categories and arrange them in the admin panel.

**Board index.** Each section is a foldable card (`<details>`, no script) with its sign, description and totals. A forum row shows its sign in the forum's colour (dimmed when quiet for a month), description, subforums as links with their topic counts, topics and posts, and the last post. The same row (`ForumRow`) lists subforums on a forum's page.

**Forum page and topic lists.** Wide layout, breadcrumb, a banner in the forum's colour with its numbers, new-topic and watch buttons, the subforums, then the topics as rows of a card: who started it, state (pinned, solved, closed, hot, new, unread count), forum and tags, replies and views, and who wrote last. Pinned topics stand first on a tinted band. The table is gone, on phones too.

**Topic heading.** Breadcrumb through forums the viewer may open, state, title, who started it and when, forum and tags, and a bar of replies, views, likes, participants and the last reply. Posts carry their number and the starter is marked.

Rules. A subforum the viewer may not see adds nothing to its parent: not to the counts, not to the last post, not to the breadcrumb. Acceptance: `scripts/forum-board-index.connected.cjs` (subforums, sizes over the family, a private subforum, `subforumRows`, a forum's and a section's topic list) and the tree tests in `scripts/forum.test.cjs`.

## Slice 7: a moderator for each section or forum; sections take no topics
Owner request: name a moderator for any section or forum, with the right to check, delete and move there, working on the page itself; and sections, as in Invision, only hold forums.

**Audited first.** Moderation was all-or-nothing: `Viewer.moderator` is true for staff (role permission `forum.moderate` or `cms.posts`) and for members of a group marked "moderator", everywhere. The moderator tools on the topic page already exist and are driven by that flag.

**Model.** `ForumCategoryModerator(categoryId, userId)`, migration `20261202120000_forum_category_moderators` (additive; nothing changes until someone is assigned). `Viewer.moderates` lists the forums a member was assigned, with everything under them. `inCategory(viewer, categoryId)` gives the viewer as they stand in one forum: a moderator there, an ordinary member elsewhere. Every entry point that loads a topic or post applies it, so the rules already written for "moderator" hold for an assigned moderator inside their forums and nowhere else. This is forum-local standing, not a second authorization system: staff roles and permissions are untouched, and an assigned moderator gets no access to the admin panel or its API.

**What an assigned moderator can do**, in their forum and under it: see hidden and waiting posts, pin, lock, hide, delete, set timers and slow mode, split and merge, mark solutions, edit, and work the review queue (`/forum/review` shows only their forums). Moving a topic: into a forum they moderate or could post in anyway; never into one hidden from them. Moving posts into another topic: only a topic of a forum they moderate. Not theirs: suspending or silencing members, groups, badges, settings.

**Sections.** A top-level category that holds forums takes no topics: not offered by the composer, refused by `createTopic`, refused as a move target, for staff too. A top-level forum without children still takes topics.

**Admin.** Forum → Categories: a "moderators" field of usernames per section or forum; an unknown name stops the save and is named. The forum's page names its moderators (its own and those of what it sits under).

Acceptance: `scripts/forum-category-moderators.connected.cjs` in `npm run test:pg`. Five deliberate breaks (any forum instead of their own, the whole queue, moving anywhere, sections taking topics, posts into any topic) each fail it.

Not in this slice: inline "manage" links for the rest of the site (magazine, music, cinema, games, store) and ready-made roles per site section. The permissions for those exist already (`cms.posts`, `music.manage`, `cinema.manage`, `games.manage`, `software.manage`, `cms.products`).

## Next slices
1. Topic page, remaining: multi-quote and a topic header with the starter, follow button and counts.
2. Member profile, remaining: one page for the forum profile and the feed profile (today they link to each other).
3. Activity stream, remaining: reviews and follows as entries, and a "people I follow" filter.
4. Leaderboard and reputation: points per reaction, ranks, past leaders.
5. Status updates and the feed merged with the forum identity; clubs (member-run groups with their own forums).
