# HappVPN 1.2.0 update guide

This release adds **Admin → Finance → Order operations**. It lists recent paid orders waiting for fulfillment, shows the last failure and next automatic attempt, and lets an administrator retry a failed job through the existing deduplicated queue. It also lists failed gateway webhooks and FrenzyEx payments that have no provider transaction ID for manual investigation.

## Deploy

1. Back up PostgreSQL and the persistent `/app/storage` directory.
2. Preserve all production environment variables and secrets. Set `APP_RELEASE=1.2.0`.
3. Build and redeploy the application using the existing Docker/Coolify configuration.
4. Run the usual `deploy:migrate` step. There are **no new Prisma migrations** in this release.
5. Confirm the scheduled fulfillment job still runs every minute (`node scripts/run-internal-job.cjs fulfillment`). Telegram alerts are evaluated in that worker.
6. Open **Admin → Finance → Order operations**. If desired, enable alerts, enter the Telegram admin chat ID, save, and send a test message.

Manual retry is available only for a paid service or product order. It uses the original fulfillment job and cannot repeat a completed job. If a renewal job is missing, the page marks it for manual investigation so that a previous renewal cannot be added twice.

The queue scans the latest 500 paid invoices. The payment issue panel shows the latest 25 failed webhooks and 25 untracked FrenzyEx payments. It never creates or retries a payment request.
