# Merchant account selection and optional section hosts

Owner request2026-11-26; checkout `.mobocom/pay-account-domains`, based on merged
mainbac9e4aa/PR491. This is an additive continuation, not an update of published1.7.22.

## Existing evidence and owners

Billing Pay `merchants.ts` and `merchant-admin/commands.ts` deny every self
membership operation. Admin form only accepts email despite canonical SMS/Identity
mobile accounts. Identity `findPhoneCustomer` already resolves normalized phone
aliases and rejects ambiguity; it must not create users during merchant enrollment.
Site `routes` owns aliases/permalinks and strict Settings CAS/audit. `/admin/sections`
owns module public addresses. Server Panel already configures same-app Nginx vhosts,
DNS and TLS; storing an application route must not run a privileged host helper.
Graphify has no graph in this checkout; source inspection is the current evidence.

## Contract

- Canonical full-access Admin may provision/activate/configure their own merchant
  with current permissions, explicit note, standard default fees and PENDING
  creation. Restricted Pay managers cannot self provision or self manage. Ordinary
  merchant commands, bank evidence, payment/receipt review and settlement reviews
  retain all existing no-self, independent-review and exactly-once money guards.
- Enrollment accepts exactly one of `phone`, `self:true`, existing `userId` or
  existing `email`. Phone is primary UI; no email requirement, second Identity,
  OTP claim or wallet creation. Lookup uses Identity's transaction reader and
  refuses absent/ambiguous/inactive accounts. Existing userId/email selectors
  remain compatible; merchant administration requires a current human session.
- Optional section hostname belongs to Site routing Settings. Main-domain paths,
  aliases and canonical SEO remain intact. A configured first-party hostname maps
  `/` to the chosen public section base; that module's other public paths continue
  to work. Unrelated sections, sign-in, dashboard and Admin navigate to the main
  origin. Sessions remain host-only; no wildcard cookie, SSO token or second login.
- Hosts must be explicit unique subdomains of configured NEXTAUTH_URL hostname,
  with no URL/path/port/wildcard, no implicit trust in forwarded-host headers.
  Missing/corrupt configuration cannot invent a mapping. Disabled modules remain
  disabled under both addresses; maintenance/group guards run on internal paths.
- Settings writes require settings.manage, Origin, strict audit and a version
  claim. Each host patch preserves other bases; a stale simultaneous writer gets
  409 instead of erasing the first write. Host-only saves reject mixed section
  settings payloads before any mutation, avoiding a partially applied form.
  Host configuration creates no DNS record/certificate and does not execute code.
  Admin explains prerequisite DNS/TLS/same-app vhost using existing Server Panel.
  Public aliases bypass guest page-cache until host-aware behavior is proven.
  Auth reads redirect to the canonical origin; credential-bearing/private writes
  on aliases return403 without redirecting a submitted body.

## Acceptance and rollback

Native PostgreSQL: full/restricted managers, mobile Persian/E.164/local aliases,
duplicate/ambiguous/missing accounts, self activation/terminal/bot integration,
audit rollback, permission revocation; own payment/settlement approval still denied.
Host pure cases and real proxy/PG configuration cover invalid/foreign/duplicate
hosts, CAS/audit rollback, main routes unchanged, root/internal rewrites, maintenance,
module-off, private redirects, no cookie scope changes and query preservation.
Actual browser1440 light/dark and390: phone/self forms, activation, Telegram bot
setup, section host editing and optional subdomain navigation. React Doctor and
scoped security/type/architecture gates follow the existing quality contract.
No schema/data migration. Disable/remove a host setting to return to main paths;
preserve merchant/payment/wallet history. DNS/TLS production commissioning remains
an operator action, not implied by local tests. Record actual evidence in handoffs.
