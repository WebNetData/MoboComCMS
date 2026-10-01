# Change Envelope: Helpful Review Votes

Goal: Let signed-in members mark approved public reviews as helpful and undo their vote.
Owner: `reviews` module, with publication checks through the existing `content` registry.
Risk: R3, new member-owned durable interaction and authenticated mutation.

Inputs / outputs:
- Input: review ID and boolean vote state from an authenticated member.
- Output: one persisted vote per member and review, plus a public count and current member state.

Invariants:
- Only approved text reviews on currently public items accept votes.
- Authors cannot vote on their own reviews.
- Anonymous and cross-origin mutations are rejected; repeated writes remain idempotent.
- Deleting a review or member removes its votes through foreign keys.
- Editing review text or rejecting it clears votes on the old evaluation.

Allowed scope:
- Additive Prisma model/migration, reviews service/API and shared review list UI.

Forbidden drift:
- Product-specific feedback and existing rating/moderation behavior remain owned by their current modules.

Failure / race cases:
- Composite primary key prevents duplicate votes. Concurrent publication changes may reject a vote or hide its count after moderation; public reads only include approved reviews.

Proof required:
- Schema parity and migration, connected authorization/idempotency checks, dark browser UI, static gates and PostgreSQL build.
