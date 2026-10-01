# Game update release notifications

Goal: Tell followers once when a game update becomes publicly available, including updates scheduled for a later date.
Owner: `games` owns update releases and follower pagination; `notifications` owns the durable inbox; `content` runs the existing engagement job.
Risk: R3 (additive Prisma migration, durable cursor and scheduled delivery).

Inputs / outputs: Saving a game update registers a release cursor in the same transaction. The engagement worker pages opted-in game followers after both update and parent game are public and writes deduplicated inbox events before advancing the cursor.
Invariants: No notice for future/draft content, opted-out followers, or a follower added after the scheduled release. Repeated worker runs and crashes do not duplicate inbox events. External providers remain on their own queue.
Allowed scope: Both Prisma schemas, additive migration, game update save, game release worker, existing engagement scheduler, connected tests.
Forbidden drift: New notification provider, immediate network calls in transactions, changes to music release semantics, unrelated game UI.
Failure / race cases: Concurrent worker runs, edit/reschedule before completion, release during downtime, inbox failure after one follower, deleted game/update.
Proof required: Schema parity/migration, connected PostgreSQL delivery and retry check, full project check and PostgreSQL build.
