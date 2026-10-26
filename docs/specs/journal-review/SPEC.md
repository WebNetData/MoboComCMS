# Magazine editorial review

## Outcome and owner

On 2026-10-25 the owner asked for the magazine to be completed. One gap was recorded in the domain matrix: drafts
and scheduled publication exist, but there is no review step between a writer and the site. The result: when the
manager turns on «نوشته‌های نویسندگان پیش از انتشار بازبینی شوند», a magazine author (`journal.author`) can only
save a draft or send an article for review. The section's manager then approves it (it goes live, or on its
schedule) or returns it to the author with a note. The author is told either way.

The owner is the Journal module: `src/modules/journal/{domain/journal.ts,server/admin.ts,server/review.ts}` and the
existing cms content route (`src/modules/site/server/http/admin/cms/route.ts`). The existing owners are extended:
- the Journal home settings (`journal.home.v1`, with its history);
- the posts list and form (`AdminCrud`);
- the block-editor document store;
- the staff moderation overview;
- the Inbox notices.

The feature deliberately does not do:
- pending edits of a live article: added as slice 2 below (2026-10-26);
- multi-step or multi-reviewer approval;
- review for other sections.

## Actors and authorization

- **Manager** (`cms.posts`): approves or returns a pending article, from its form or by publishing it in a batch. The
  setting stays the manager's (Journal settings route, `cms.posts`).
- **Author** (`journal.author`, own articles only, unchanged scope). While review is on:
  - may create and edit drafts and pending articles;
  - may move a pending article back to draft;
  - may ask for a delete (trash), as before.
- **Refused for an author while review is on**, every one with 403 and nothing written:
  - publishing through a form, through a batch, or by omitting a status (which defaults to published);
  - any edit of a published (live or scheduled) article: the form, the batch "draft", the block editor.
- With the setting off (the default), an author behaves exactly as before.
- Every writer refuses an unknown status: only `DRAFT`, `PENDING` and `PUBLISHED` come from a form. `TRASHED` stays
  refused, as before.

## Data and compatibility

- `Post.status` gains the value `PENDING`. The column is a string with no database check on it, so no migration is
  needed.
- Public readers ask for `PUBLISHED` (`livePostWhere`), so a pending article is never public.
- The trash keeps `trashedStatus = 'PENDING'` and restores it.
- `JournalSettings.reviewAuthorPosts: boolean` (default `false`), normalised. Older stored settings read as `false`.
- Rollback: reverting the code leaves `PENDING` rows that no public reader shows, and older admin lists show them with
  a grey badge. A manager publishes them by editing.

## Flows

- **Author sends for review:** the status becomes `PENDING`. The article appears in the manager's «در انتظار بازبینی»
  list filter, on the dashboard queue, and in the staff overview source `review-posts`.
- **Manager approves** (the form's «تأیید و انتشار», a regular save to published, or a batch publish):
  - the status becomes `PUBLISHED`;
  - the publication time is kept if it lies in the future (scheduled), otherwise it becomes now, so an article
    written a week ago is not published with an old date;
  - a version is recorded and the author gets an Inbox notice.
- **Manager returns:** the status becomes `DRAFT`, with an optional note (at most 1000 characters) in the author's
  notice, and a version is recorded.
- **Concurrency:** the transactional claim includes the server-read status, author and updatedAt. A changed
  single save or decision gets409 with no nested writes; a bulk request reports a raced row failed and keeps
  eligible results. Authors cannot overwrite a publication approved after their earlier request read.
- **Delivery:** owner changes and a typed `journal.editorial-decision` intent commit together. A failed intent
  or strict decision audit rolls them back; an Inbox failure after commit retries through existing Operations.
  The captured decision UUID deduplicates Inbox/channel rows even after interrupted completion.

## Admin and public UI

- **Journal settings:** a checkbox with the setting.
- **Posts list:**
  - the state filter gains «در انتظار بازبینی», with its count;
  - the status badge reads «در انتظار بازبینی»;
  - for an author while review is on, a live article shows «منتشرشده؛ ویرایش با سردبیر» instead of edit actions.
- **Form status options:**
  - a manager gets «منتشرشده», «در انتظار بازبینی» and «پیش‌نویس»;
  - an author while review is on gets «پیش‌نویس» and «ارسال برای بازبینی», and the save button reads accordingly.
  - A manager opening a pending article sees a review panel with «تأیید و انتشار» and «بازگرداندن به نویسنده»
    (with a note field).
- **Dashboard:** a «در انتظار بازبینی» queue item linking to `/admin/posts?state=pending`.
- **Public:** unchanged.

## Contracts and security

- `PATCH /api/admin/cms?type=posts` with `{ id, review: 'approve' | 'return', note? }`:
  - manager only (an author gets 403);
  - the same origin and session guard as the route;
  - writes the audit rows `cms.posts.review.approve` and `cms.posts.review.return`.
- The list response (`GET …?type=posts&paged=1`) adds `reviewing: boolean` and a `pending` count to `counts.state`.
- The `review-posts` moderation source: permission `cms.posts`, module `journal`, decided on the owning page (no
  inline decision).

## Acceptance

Native PostgreSQL check `journal-review.connected.cjs` (registered), through the real cms route, the review owner
and the editor document store. It covers:
1. Setting off: an author publishes as before.
2. Setting on, author refusals: a publish (status `PUBLISHED`, or no status at all) is 403 on create, update and
   batch; an edit or batch draft of a live article is 403; a block-editor save of a live article is 403; nothing
   is written in any of these cases.
3. Setting on, author allowed: send for review, back to draft, trash request.
4. Manager decisions:
   - approve sets `PUBLISHED`, moves an old publication time to now and keeps a future one, and records a
     version, an audit row and an author notice;
   - return sets `DRAFT` and delivers the note;
   - a second decision is 409;
   - an author's decision is 403.
5. Batch publish of a pending article applies the same publication-time rule.
6. An unknown status is 400 for everyone.
7. The list's pending filter and count, the dashboard pending count and the staff overview source.

Deliberate faults that must fail it:
- the publish refusal removed;
- the live-edit refusal removed;
- the approval time rule removed;
- the decision written without the `PENDING` condition.

Browser (real admin):
- the setting toggles;
- the author form offers only draft or review;
- the manager sees the pending queue, approves from the form and returns with a note;
- the author sees the notice;
- the setting is restored afterwards.

## Slice 2: edit proposals of published articles (2026-10-26)

**Outcome.** While review is on, an author's save of their own published article no longer gets refused. It is kept as that article's proposal and the site keeps the live version. The manager sees it beside the live values and applies it, or sets it aside with a note.

**Data.** `PostEditProposal` (migration `20270119120000_post_edit_proposals`, both schemas, manifest unreleased):
- one row per article (`postId` unique, cascades with the article);
- `changes` holds a JSON object of only the proposed fields;
- `baseUpdatedAt` records when the live article was last saved as the proposal was made.

Rollback leaves an unused table.

**Rules** (`journal/domain/journal.ts`: `PROPOSAL_TEXT_FIELDS`, `proposalChanges`, `readProposalChanges`; owner `journal/server/review.ts`):
- A proposal carries title, excerpt, body, cover and categories (and their English fields), and only those that differ from the live article. Status, publication time, address, featuring, access and item links are never proposed.
- A save that changes nothing gets 400.
- A newer proposal replaces the open one.
- The body of an article written in blocks is not proposed through the form, and the block editor still refuses the author with a message that points to the form.
- **Apply**, in one transaction: delete the proposal by compare-and-set (`id` + `updatedAt`), write the fields, rewrite the categories (only ones that still exist; otherwise 400 and the proposal stays), record a version and an audit row `cms.posts.proposal.apply`, then send the author an Inbox notice `POST_REVIEW`.
- **Reject:** delete the proposal by compare-and-set, write the audit row `cms.posts.proposal.reject` and send a notice with the note.
- A decision carries the `proposalAt` it read. If the author has since replaced the proposal, or it is already decided, the decision gets 409.
- The form marks a proposal "stale" when the live article changed after it was made; applying replaces only the proposed fields.
- With review off, an author edits their published article directly, as before.

**API.**
- `PATCH /api/admin/cms?type=posts`:
  - an author's ordinary save of a published article (review on) answers `{ proposed, fields, notice }`;
  - the manager sends `{ id, proposalDecision: "apply" | "reject", proposalAt, note? }`; an author sending it gets 403.
- List and single reads carry `proposal: { changes, at, stale } | null`.
- The state filter gains `proposed`, with a count.
- The dashboard gains `kpis.proposals`.
- The staff overview gains the source `proposal-posts`.

**Acceptance.** Native PG `journal-proposals` (registered) passes, and four deliberate faults each fail it:
- the proposal path removed;
- unchanged fields proposed;
- a decision that keeps the proposal;
- a replaced proposal decided.

Browser `pw-journal-proposals` passes 13/13: the author form hides status, time and address and says «ارسال پیشنهاد ویرایش»; the save is a proposal and the live article stays; the dashboard, staff overview and filter list it; the diff panel shows both versions; apply changes the live article and the author is told.

## Reliability follow-up — 2026-10-26

The new native `journal-review-reliability` suite covers actual single/bulk
approval interleavings, content-version/owner changes, fresh proposal retry,
Operations backoff/completion, interrupted Inbox/channel dedupe, transactional
intent/audit rollback and the existing100-item batch. Current implementation,
executed evidence and rollout limits: [continuation](../../agent/handoffs/JOURNAL_REVIEW_RELIABILITY.md).
Older browser results above are historical; no fresh browser run is claimed for
the backend-only reliability fix.
