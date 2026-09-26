# HappVPN 1.3.3 — Ticket operations, journal, and visual pages

This source update builds on 1.3.2. It redesigns the admin ticket desk as a compact two-pane inbox with full-width conversation cards, clearer status controls, and a focused reply editor. Admins can create and deactivate ticket departments, set bilingual names, require an active subscription or purchased product, define up to 12 required or optional fields, and grant each department to selected staff roles. Department access is enforced for ticket lists, ticket details, replies, and status changes. Existing roles with `tickets.handle` retain access to the four original departments after migration; new departments start owner-only until assigned.

The journal category manager now shows a searchable, expandable tree with quick child creation. Categories can nest without a fixed depth, and posts continue to support multiple category selections. The public journal adds a topic tree alongside the editorial cards. The page manager now links to a visual builder with seven sections (hero, text, image, features, statistics, CTA, FAQ), bilingual content, drag-and-drop or arrow ordering, image upload, style choices, and live preview. Sections render on the published page above its existing rich content and optional form.

## Deploy

1. Take a current PostgreSQL backup and keep the production `.env`, database volume, and `/app/storage` outside the source replacement.
2. Build this full source package with `APP_RELEASE=1.3.3`.
3. Apply committed migrations with `npm run deploy:migrate` before serving requests, or retain the Docker startup migration step. Migration `20260923140000_ticket_department_management` adds ticket custom fields and department configuration without deleting tickets.
4. Verify Admin → Customers & support → Ticket departments, create a test department and role assignment, then check an authorized and unauthorized staff account. Also check Admin → Journal → Categories and Admin → Pages → Visual builder.

`npm run check` and `npm run build:postgres` passed locally. The migration has not been applied to the production database. Authenticated visual QA against production content was not available in this workspace.
