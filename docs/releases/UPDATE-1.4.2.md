> سند تاریخی؛ راهنمای فعلی نصب و معرفی پروژه در [README](../../README.md) است.

# HappVPN 1.4.2 — Customer subscription dashboard

The customer dashboard and Telegram mini app now summarize only current subscriptions. Expired plans no longer inflate traffic totals, and any active unlimited plan keeps the combined allowance marked as unlimited. Subscriptions needing attention are shown first; the web dashboard adds search and status filters. Each subscription card shows remaining data and clearer expiry or low-data guidance.

Subscription loading now tolerates unrelated wallet/order request failures. If the subscription request itself fails, the customer sees a retry action instead of an endless loading state or a false empty account.

No new database migration is introduced by 1.4.2. The 1.4.1 migration remains in the source package for installations upgrading from earlier versions. Keep the existing `.env` and persistent `storage` directory when updating, then run `npm ci` and `npm run build:postgres` as in the deployment guide.

Local source checks, tests, TypeScript validation and PostgreSQL build passed. The live customer journey still needs an end-to-end staging pass with PostgreSQL and the VPN panel before production rollout.
