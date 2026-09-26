# HappVPN 1.3.2 — Support Center and incident reporting

This release adds a unified bilingual ticket center to the website and Telegram Mini App. Customers choose Sales, General, Subscription, or Product support. Subscription support requires selection of an owned, active, unexpired subscription. Product support requires selection of an active product from the customer's paid orders. Sales and General support require no purchase. These rules are enforced on the server as well as in the form. The subscription incident form creates tickets in Subscription support.

The ticket composer and incident report now use the rich-text editor. The conversation displays sanitized content in readable message cards. Operators can filter tickets by department and see the selected subscription or product. Existing general tickets remain in General support; legacy tickets with a linked subscription move to Subscription support.

An operator reply moves the ticket to Waiting unless the operator closes it. A customer reply reopens it for support. The admin view supports department, status, and text filters.

## Deployment

1. Back up PostgreSQL and preserve the production `.env`, database volume, and `/app/storage`.
2. Build from this full source package with `APP_RELEASE=1.3.2`.
3. Run `npm run deploy:migrate` before serving requests, or retain the default Docker startup migration step. Migration `20260923130000_ticket_departments` adds `Ticket.department` and `Ticket.productId` without deleting existing rows.
4. Check a Sales ticket without a purchase, a Subscription ticket with an active subscription, a Product ticket with a paid active product, and an incident report from a subscription card. Verify department filters and replies in Admin → Tickets.

`npm run release:check` and `npm run build:postgres` passed locally. The migration was not applied to the production database and visual testing against authenticated production data was not performed in this workspace.
