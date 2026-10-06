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

## Next slices
1. Topic page, remaining: multi-quote and a topic header with the starter, follow button and counts.
2. Member profile: cover, rank and reputation, content tabs, followers, about.
3. Activity stream, remaining: reviews and follows as entries, and a "people I follow" filter.
4. Leaderboard and reputation: points per reaction, ranks, past leaders.
5. Status updates and the feed merged with the forum identity; clubs (member-run groups with their own forums).
