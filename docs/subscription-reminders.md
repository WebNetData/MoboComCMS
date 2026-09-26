# Telegram subscription reminders

Admin → Telegram → Subscription alerts controls the feature, thresholds and plain
text templates. Defaults: disabled, three days, 20% remaining data. Enable after
configuring the bot and the site's public HTTPS URL. Saving preferences does not
send a test message. Customer opt-out is available in Profile and the mini app.

## Operation

The Next.js Node server starts a timer through instrumentation. It polls every
minute; a database lease and last-run time admit one batch every five minutes.
Each batch reads up to 50 eligible subscriptions, stopping between accounts after
60 seconds. The persistent cursor continues where the previous batch stopped.
Large installations therefore take more than five minutes for a complete scan.
The panel is read directly; unavailable or invalid data is skipped, never guessed.
Accounts expired more than 24 hours ago are skipped. Unlimited traffic has no
volume warning. Disabled accounts and banned/unlinked/opted-out users are skipped.

The reminder button opens `/miniapp?subscription=<id>&renew=1`. Authentication and
ownership still apply. This only opens the renewal preview; it does not pay.

The reminder cycle is determined by subscription, Telegram recipient, expiration
and total allowance. Paid renewals change that cycle. Each kind has its own unique
delivery record; editing templates or thresholds does not resend old warnings.
HTTP 429 responses retry after at least 15 minutes, at most four attempts. Other
definite 4xx failures stop. Network errors, ambiguous server failures and abandoned
claims are marked unknown and are not automatically resent. Telegram has no
sendMessage idempotency key, so this deliberately prioritizes avoiding duplicate
messages over retrying uncertain deliveries. Admin statistics expose these cases.

## Deployments

Back up the database, stop the server, run `npm run db:push`, then build and restart.
For PostgreSQL use its matching Prisma schema. Both schema variants are updated.

The internal timer requires a continuously running Node process. On serverless
hosting, disable it with `SUBSCRIPTION_REMINDER_SCHEDULER=false` and schedule a
POST to `/api/internal/reminders/run` every five minutes, authenticated with
`Authorization: Bearer <INTERNAL_JOBS_SECRET>`. Use a request time budget of at
least 120 seconds. The endpoint refuses requests when the secret is missing.
Never put this secret in a URL or public browser configuration.

No production messages are sent by automated tests; they mock Telegram delivery.
