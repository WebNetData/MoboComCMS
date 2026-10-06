# Notification policy: keeping times, daily summary, delivery receipts

Owner: `notifications` (`domain/policy.ts` pure rules, `server/policy.ts`). No new table. Reuses the inbox (`UserNotification`), the Jobs queue, the mail module's notification email and each member's notification switches.

## Rules
- Everything is off until the owner sets it at `/admin/notifications` (`settings.manage`); the setting is `notifications.policy.v1`.
- Keeping times: `readDays` (after a notice was read) and `unreadDays` (after it was made, read or not); 0 = for good. An unread notice is never removed sooner than a read one. Removal is by the `notification-policy` scheduler step, at most 2,000 a pass, oldest first.
- Daily summary: from the set hour (Tehran), one `notification.digest` job per member who has unread notices from the twenty-four hours before that hour whose kind has no email of its own (kinds in `EMAIL_EVENTS` are left out). Members are walked in id order with a cursor; a day is queued once and the job's key makes a repeat harmless. The email lists the newest eight titles and how many more, and links to the inbox. Sent as kind `INBOX_DIGEST`: the site's mail settings and the member's own switch decide whether it goes. Read in the meantime, or switched off after queueing: nothing is sent.
- Delivery receipts: read from the channel jobs (`notification.deliver`) of the last week — sent, not sent (not a fault), waiting, failed — with the latest faults. Nothing is stored again.

## Acceptance
`scripts/notification-policy.connected.cjs` in `npm run test:pg`, real PostgreSQL, narrowed to its own members: keeping times (off, read, age, batch), who gets a summary (window, kinds, the hour, paging, once a day, a lost cursor), the email (titles, cap, provider failure, read, off), receipts. Thirteen deliberate breaks fail it.

## Not included
Batching of browser push, a receipt on the member's own inbox row, a weekly summary, per-kind keeping times.
