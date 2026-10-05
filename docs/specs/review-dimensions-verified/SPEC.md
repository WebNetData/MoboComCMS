# Specialist rating dimensions and the verified-experience badge

## Audit and owner

Shared reviews (`reviews`, `ItemReview`) cover software, games, films and series, albums and tracks with one overall star rating, an optional text, moderation and helpful votes. Two things were missing: a reader could not tell a review by someone who had used the item from one by someone who had not, and every kind of item was scored on the same single number. Store products already have both in their own system (`ProductReview`: quality/value/usability, verified purchase) and are not touched.

The site already records use: `DownloadLog` (downloads), `CinemaWatchProgress` (watching), `MusicListenHistory` (listening) and `ContentPurchase` (paid content). Nothing new is tracked.

`reviews` owns the dimensions, the stored badge and the review list. `content` (which already reads every content type for the public item registry) gets one read, `memberItemExperience`, that answers "does the site have a record of this member using this item".

## Product decisions (owner, 2026-10-05)

- The badge is earned by a download, by watching or listening, or by a purchase.
- Dimensions are designed per section and are specialist-level.

## Behavior

### Verified experience

A review carries a badge when the site itself has a record of its author using the item. Strongest record wins:

| Badge | Record |
| --- | --- |
| Buyer | a non-revoked content purchase of the item (for a track: of the track or its album) |
| Downloaded | a signed-in download of the item or of one of its releases, updates, episodes or tracks |
| Watched | a film or an episode of the series finished, or at least five minutes in |
| Listened | the track, or a track of the album, played |

Anonymous downloads count for nobody. A self-declared game library status is not a record.

The badge is stored on the review when it is saved. It is kept once earned, because download logs are pruned after a while and a later edit must not take it back. A member who reviews first and uses the item later gets the badge the next time they open the item page; that does not change the review's edit date. Writing a review never requires the badge.

The item page shows how many of the people who rated have the badge, and the review form tells the member which badge their review will carry, or what earns one.

### Dimensions

Optional 1–5 scores next to the overall stars:

- Software: features, ease of use, performance, stability, value.
- Game: gameplay, graphics and art, story and characters, audio, technical performance, replay value.
- Film and series: story and screenplay, acting, directing, visuals, music and sound.
- Album: composition, performance, lyrics, production, cohesion.
- Track: melody, performance, lyrics, production.

A member may score any subset. The overall stars stay the member's own choice; until they pick them, the form suggests the rounded mean of the dimension scores. The item page shows the average and the number of votes per dimension (rejected reviews are left out, as they are for the stars), and each published review shows its own scores.

Keys are stored. A key is never renamed or reused; a retired key simply stops being shown.

### Review list

Order by newest (default), most helpful, highest or lowest rating; optionally only reviews with the badge. The filter narrows the list, not the summary.

### Moderation

The queue shows the badge and the dimension scores of each review. Rules are unchanged.

## API (additive)

- `GET /api/engage?item=…` also returns `dimensions`, `verifiedCount`, `sort`, `verifiedOnly`, and per review `verified` and `scores`; accepts `sort=new|helpful|high|low` and `verified=1`.
- `POST /api/engage/review` accepts optional `scores` (for example `{ "gameplay": 5 }`) and also returns `verified` and `scores`. When `scores` is not sent, stored scores are kept, so clients that only know the stars keep working; `{}` clears them. Unknown keys are ignored; a present value outside 1–5 is refused.

## Data and compatibility

Migration `20261125120000_item_review_dimensions`, additive: column `ItemReview.verified` (default empty) and table `ItemReviewScore (reviewId, key, score)` with a 1–5 check, removed with its review. Existing reviews keep their stars and text and start without a badge and without scores; an existing reviewer with a record of use gets the badge the next time they open the item page. No backfill job.

Disabling the reviews module hides all of this and keeps the data.

## Acceptance

Real PostgreSQL: each kind of record for each item type including children (episode, album track), other members' and anonymous records, revoked purchase, score validation per type, partial and cleared scores, stars-only client, averages with a rejected review, badge kept after the log is gone, badge earned later without changing the edit date, every order and the filter, moderation queue, scores removed with the review, database check. Browser, RTL, dark and light, desktop and mobile: summary, form with suggested stars, save, badge, order and filter, a film's own dimensions, signed-out view. TypeScript, architecture, source, schema, security and i18n checks, production build.

## Comparison (second slice)

The comparison table for software, games and films has a group "members' specialist scores (out of 5)": one row per dimension of the type with each item's average, the higher value marked like every other numeric row, and a row with the number of raters who have the badge when any item has one. A dimension nobody scored on any compared item is left out; rejected reviews do not count. With the reviews module off the group is absent. Store products are compared on their own review system as before.

## Badge backfill (third slice)

A review got its badge only when its author saved it or opened the item page again. Reviews written before the badge existed, and members who used the item after reviewing it and never came back, stayed unbadged, and the download logs that would have earned the badge are pruned after 120 days.

The scheduled engagement job (the 15-minute full run) now has a step, placed before the download-log prune, that walks the unbadged reviews in id order, at most 200 per run, and gives each the badge the site's records support. It remembers where it stopped (`Setting reviewBadgeBackfillCursor`) and starts over after the last review, so a review is looked at again on a later pass. Earning a badge does not change the review's edit date; a badge is never taken back; one review that cannot be checked is logged and does not stop the others; with the reviews module off the step does nothing.

## Not in this slice

Dimension averages in search; English labels in the page (they exist in the dimension list, the page is Persian as before); the same for store products, which keep their own system.
