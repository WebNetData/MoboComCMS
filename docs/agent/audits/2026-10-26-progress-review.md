# Current development review — 2026-10-26

Resolution: both findings below are fixed by the
[Journal reliability continuation](../handoffs/JOURNAL_REVIEW_RELIABILITY.md),
with new native regression/fault/retry evidence. The original reproduction below
is retained against baselineaef68618; it is not the current open-work list.

Scope: inspect the owner's progress since architecture-kit commit `01c254e2`.
Authoritative checkout is still locally `.mobocom/autonomous-foundation`, now
branch `feat/readable-button-ink-2026-10-26`, HEAD `aef68618`. It is three commits
ahead of `origin/main` (`4f44e44e`). Do not switch back to a branch named in an old
handoff. Six existing CSS changes, `.serena/`, `public/demo/` and the older root's
separate dirty work belong to the owner and were preserved.

## Progress found

- Module management adds search/state/category groups and guarded off-switch
  feedback; themes are integrated into Studio and the existing theme builder.
- Existing builder documents now have ContentRevision save/restore, draft
  clearing and the additional script permission when restoring advanced code.
- Journal adds a focused workspace/list, editorial review and proposed edits of
  published articles. It reuses the original section permissions and Inbox.
- Public changes batch promo requests, resize owned images, derive readable
  accent tokens and improve section metadata/disclosure structure.

These observations do not certify all103 changed files, public designs or the
whole platform. Earlier browser/build numbers in owner handoffs are retained
historical evidence, not new results of this review.

## P1 — author save can cross a concurrent review approval

Classification: `WEAK_SECURITY`, high confidence; reproduced against PostgreSQL
through the real CMS PATCH function, with test JWT/module adapters and a
deterministic database interleaving.

- `src/modules/site/server/http/admin/cms/route.ts:298` reads the article into
  `held`; lines329–334 choose the author/proposal path from that earlier status.
- Its transaction at line419 writes with `where: { id }`, without claiming the
  status/version/author on which that path was decided.
- Reproduction: review is enabled; an author starts saving their own PENDING
  article. After that request reads PENDING, the real `decidePostReview` approves
  it. The original author request then returns200 and changes the now-PUBLISHED
  article's title directly. No PostEditProposal exists. This defeats the intended
  review boundary; it does not require another section's permission.
- The same pre-read pattern exists in BULK at lines533–545. That variant was
  inspected in source, not independently replayed in this review.

Next slice: resolve author policy/current ownership and claim expected row state
at the transactional write. Refuse a changed state with409 or enter the current
proposal path; preserve nested category/link writes, revisions and existing
permissions. Test author/manager interleavings for both single and bulk saves,
including the transition to PUBLISHED, not only static permission denials.

## P2 — editorial decision notices have no durable retry intent

Classification: `PARTIAL` reliability; high confidence. This is distinct from the
already-durable **comment** notices in `journal.comment-published`.

- `src/modules/journal/server/review.ts:69` invokes `tellReviewDecision` after the
  decision transaction. Lines33–43 catch an Inbox failure and only log it.
- `tellProposalDecision` (lines73–86) has the same post-commit best-effort path;
  the proposal decision calls it at line157. This variant was source-inspected.
- Fault replay: inject a temporary createInboxEvent failure, approve a separate
  PENDING article through the real review owner. The article stays PUBLISHED,
  no author Inbox row is stored, no new BackgroundJob is added, and the call
  completes. No real email/SMS/provider delivery was attempted.

Next slice: commit a typed editorial decision intent with the original review/
proposal transaction using existing Operations/Inbox. Retain the decision even
when delivery fails; worker retry/backoff and a stable decision dedupe key should
recover delivery without duplicates. Cover normal form, explicit decisions and
bulk paths, and rollback of a failed intent/audit write.

## Executed checks

- Owned database `mobocom_audit_20261026`, all current migrations applied fresh.
  Source snapshot is exact HEAD, run as Linux UID1000 without `.env`; matching
  existing PostgreSQL client/dependencies reused. No application dependency or
  shared test container source was changed.
- 34 related unit tests passed: journal-scheduling, ads (including contrast),
  feeds-newsletter and moderation-queue.
- Three existing native PostgreSQL suites passed: journal-review,
  journal-proposals and builder-history.
- Additional audit replay confirmed both findings above. Its final exit0 means
  **the defects were reproduced**, not that they were fixed. Initial harness
  failures were corrected; they were not counted as successful checks.
- Raw local helpers: `.mobocom/progress-audit-{runtime,repro}.cjs`; logs retained
  privately under `.mobocom/progress-audit-20261026/`. The snapshot/database were
  removed after verification. Existing site records/settings were not changed.

No fresh full `npm run check`, production build, React Doctor, browser/axe,
deployment, hosted Actions, push or PR was performed in this audit. In particular,
the six pending primary-button/token CSS changes still need their own browser
acceptance before publication. Product source was reviewed, not modified.

## Continue

Fix P1 first through the existing CMS/Journal owners and add the missing
interleaving regression. Then make editorial decision delivery durable through
the shared queue. Preserve the owner's CSS work and validate it separately at
1440/390, light/dark, including MoboCom/Clean and button links inside media/forum.
