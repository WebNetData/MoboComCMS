# Switching the VPN service, resellers and the seller marketplace off

## Audited evidence / scope
The owner wants to set VPN sales, resellers and third-party sellers aside and concentrate on the store, the magazine, games, movies and series, music and the forum. A module switched off in Extensions & modules must leave the admin menu completely.

What existed: the Extension Manager already stores an on/off state per module (`extension.<id>.state.v1`), the admin menu already leaves out every item under a disabled module's `adminPaths` and shows a "module disabled" card on such a page, and the marketplace already closes its admin and seller APIs. `vpn` and `marketplace` were modules; resellers were part of `vpn` and had no switch of their own. Gaps found: the admin APIs of the VPN sections and of resellers answered while the module was off, so did the reseller panel API, the reseller sales bot webhook, the trial API and plan checkout; a few core pages still linked into VPN sections.

## Rules
- `reseller` is a module of its own (`src/plugins/reseller`), requires `vpn`, owns `/admin/resellers` and `/admin/reseller-sales`. The RemnaWave control plugin requires `vpn` as well.
- An extension whose required module is off is off, whatever was saved for it, and comes back when that module is turned on again. Saving its settings meanwhile does not store "off". Turning a required module off is still refused while an extension that needs it is on (existing rule).
- Off means closed for new business and for administration, never deleted: plans, subscriptions, panels, reseller contracts, sellers and their ledgers stay. Already paid orders are still fulfilled, existing subscription links keep working, recovery jobs keep running.
- VPN off: `/plans` and `/trial` are 404 (existing), `/api/plans` returns an empty list, plan checkout answers `VPN_DISABLED`, `/api/trial` and the admin APIs for plans, volume offers, trials, subscriptions, panels, Happ and the connection guide are 404.
- Reseller off (or VPN off): the reseller panel API and the admin reseller APIs are 404, `/api/me` reports no reseller, so the panel link disappears and `/reseller` leads back to the dashboard; the reseller bot webhook acknowledges updates without selling.
- Marketplace off: unchanged, already closed.
- Service incidents (`/admin/incidents`) are announced per server panel on subscription cards, so the section and its admin API belong to `vpn`.
- Notification kinds have an owner module (`src/modules/notifications/domain/event-modules.ts`). Kinds of a module that is off are left out of the member's preference list and of the admin email and SMS event settings; sending and stored choices are unaffected.
- While VPN is off the admin settings, users and roles pages and the member wallet, profile and invoice pages do not show subscription fields, columns, permissions or wording. A role keeps the permissions it already has.

## Acceptance
`scripts/routes.test.cjs`: dependency states on a fresh site and through every switch, the refusals, settings saved while off, and that each admin menu item of these sections is owned by a module and each of their API route files is wrapped in the module guard. Checked on the running local site as an admin: menu data, API status codes and the public pages. A browser crawl of 50 public, member and admin pages with the three modules off looked for leftover VPN, reseller and seller wording; what it found in code was fixed and the affected pages were crawled again.

## Not included
Core pages that mention these features in text (homepage builder templates, Telegram bot commands) are unchanged; the homepage sections already hide with their module. `plans.manage` stays in the roles list because discount codes use it. Demo articles and an existing "reseller" role are data, not code, and are left to the owner.
