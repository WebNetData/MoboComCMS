# Forum flags and moderator decisions

## Audit

Members flag forum posts; each flag has a weight and, when the pending weight on a post reaches the configured threshold (3 by default), the post is hidden automatically, or the whole topic when it is the opening post. Moderators decide in the flag queue (agree, disagree, delete), which marks the flags handled.

Moderators can also hide or show a post or a topic directly, from the topic page. That path did not touch the flags. Two consequences, the first reproduced on `main` with the connected script:

1. **One flag undid a moderator's decision.** After a moderator showed an auto-hidden post again, its flags were still pending and their weight still counted. The next flag from any member, of any weight, reached the threshold again and hid the post at once.
2. **Decided items stayed in the queue.** A flagged post that a moderator hid directly stayed in the flag queue and in the pending count until someone decided it a second time there.

## Behavior

A moderator's direct hide or show is a decision on the flags waiting on that item:

- hiding a reply marks its pending flags agreed; showing it marks them disagreed;
- changing a topic's visibility does the same for the flags on its opening post. Flags on the topic's replies keep waiting for their own decision;
- the moderator and the time are recorded on the flags, as the flag queue already does;
- pinning, locking or moving a topic, or saving it with an unchanged visibility, is not a decision and leaves flags alone.

After a decision, new flags start from zero, so restored content needs the full threshold again before it is hidden automatically.

The flag queue's own actions are unchanged. No schema change.

## Owner

`forum` owns flags, posts and both moderation paths.

## Acceptance

Real PostgreSQL: auto-hide at the threshold, show settling the flags with moderator and time, a single new flag not hiding again, direct hide agreeing, the same for a topic through its opening post with a reply's flag untouched, pin and lock not settling, the flag queue's agree. Existing forum tests, TypeScript, architecture, source and security checks, production build.

## Not in this slice

Telling the author that hidden content was restored; one shared moderation queue across community, forum and reviews.
