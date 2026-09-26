# HappVPN 1.4.1 — Agency team and sales reports

This update adds a reseller team panel. The agency owner can attach an existing active customer account and grant separate permissions to view or manage customer services, view or edit retail offers, and view or review bot receipts. Access is enforced by the server routes; wallet details, bot token installation, and team membership remain owner-only. Pausing or removing a teammate takes effect on the next request.

The reseller panel now includes sales reports for 7, 30, 90, and 365 days. Delivered retail amounts are grouped by currency, with order status counts and a review queue. Bot and website receipt approvals record who made the decision and when, visible in reseller and platform-admin order views.

## Upgrade

1. Back up PostgreSQL and persistent storage. Keep the existing `.env`, `storage`, and `PANEL_CREDENTIAL_KEY`.
2. Replace the application source with this update, run `npm ci`, and build with `npm run build:postgres`.
3. Apply migrations with `npm run deploy:migrate` before starting the new application. The new `ResellerMember` table and receipt-review audit columns are additive; existing data is preserved.
4. Start the application and open **Reseller → Agency team** and **Sales reports**. Teammates must already have active customer accounts.

`npm run check` and `npm run build:postgres` passed locally. The migration and full bot purchase flow still require testing against a real PostgreSQL staging copy and Telegram bot before a production rollout.
