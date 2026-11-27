# Independent MoboCom Cloud customer workspace

## Cloud wallet, support and account surfaces — 2026-11-27

Signed-in Cloud members use a fluid sidebar and mobile drawer to reach
infrastructure, finances, support and account settings. Wallet balance, ledger,
top-ups and payment results are shown in `/cloud/dashboard`. An owned Cloud
top-up returns to Cloud after gateway navigation or retry. A member can create,
open, share and reply to their tickets from the workspace, and update account
settings from the existing identity forms. The ordinary account routes retain
their established presentation.

Hosting's current workspace guard protects Cloud pages and the wallet entry
point. Wallet still owns the ledger and top-up transaction, Support owns ticket
authorization and attachments, and Identity owns the account. Return locations
are selected by a closed surface and persisted with the top-up identity. A
normal wallet invoice, foreign invoice or unrelated order cannot become accessible
through the Cloud routes. Main wallet and support records are shared through their
existing owners, with no new database schema or independent identity.

Acceptance covers both wallet origins and replay, ticket actions and foreign
denial, existing hosting invoice filtering, correct account returns, keyboard
drawer and responsive sidebar, and light/dark Cloud pages at desktop and mobile
widths. Test against a disposable PostgreSQL database and synthetic accounts.

Owner2026-11-26 explicitly protects the public Cloud homepage/pages. Authoritative
checkout `.mobocom/cloud-workspace`, branch `feat/cloud-workspace-2026-11-26`,
basee133b9a3 retaining the owner's preceding local Pay/account slices. Public
`/cloud`, `/hosting`, `/servers`, `/domains`, CloudLanding/CloudBar and their approved
styles remain unchanged. Existing `/dashboard/cloud` overview/lists/wizard,
Hosting service/domain APIs, Checkout/Billing and Support are the current owners.
Graph absent; exact source and current handoffs are the discovery evidence.

## Outcome and boundary

Create private `/cloud/dashboard`: a distinct MoboCom/SDS workspace with desktop
sidebar and native modal hamburger drawer on phone/tablet. One ShellNav renderer,
canonical Identity/session, current Hosting module/maintenance/group guards,
existing Hosting catalog/drivers/actions and shared Billing/Wallet/Support. No
parallel accounts, provider operations, fake utilization charts or resource manager.
Keep the section name editable through existing section-name settings.

Navigation: overview, servers, hosting, domains, new service, Cloud invoices/orders,
support, shared wallet/account and public Cloud return. Services expose the existing
owned details, credential reveal/panel links, renewal/add-ons/hourly actions and domain
nameserver/auth-code flows within the new shell. Reuse parameterized existing
components; old generic detail URLs remain compatible. Existing Cloud dashboard
entry aliases redirect to the new workspace; approved public links can stay as-is.

Overview displays actual owned statuses, near expiries, allocated server resources,
recent persisted actions and recent Cloud invoices. Resource numbers are allocated
plan capacity, never measured CPU/RAM utilization. Invoice/order discovery filters
canonical order metadata exactly and never includes other users or ordinary Store
orders. Seek pagination must not silently lose malformed/legacy metadata or claim
a truncated list is an all-time total. Do not reveal credentials, provider payloads
or raw action error/detail in the summary.

## Contracts, access and compatibility

New private read-only Hosting workspace projection uses current canonical human
authority before reading; guest/revoked/banned401, group403, module-off404,
maintenance503 unless existing section-manager rules permit. Owned detail and
invoice checks reapply server ownership; stale credential/financial writes retain
their existing stricter owners, Origin/limits/state claims/audit and idempotency.

Add closed Checkout presentation `cloud` only for Hosting/domain orders. Persist
the marker in the existing Order.meta transaction; map only known local invoice/
result/service addresses, never arbitrary return URLs. Existing public/dashboard
presentation and external gateway destinations keep their behavior. Root public
payment/invoice callbacks resume the stored Cloud surface for the owned order.
Same-process contracts stay typed/connected-tested; stable payment/event contracts
and money states do not change. No schema/dependency/migration required.

Private Cloud paths are no-store/noindex, skipped by public cache/analytics and
returned to the main identity origin from optional Cloud entry subdomains, including
section aliases. Root public pages and menu structure are protected; only the
member dashboard's existing Cloud links gain the new private destinations.

## Acceptance and rollout

Define usable loading/empty/error/retry/pending/permission states, Persian RTL and
LTR infrastructure identifiers, theme tokens,44px controls, focus/skip/label/Tab/
Escape/backdrop/history/desktop-resize/reduced-motion behavior. Execute real native
PostgreSQL authority/IDOR/module/maintenance/metadata/pagination/once-only checkout
checks and deliberate faults; actual authenticated navigation/detail/wizard/billing/
support flows at1440 light/dark and390, plus tablet/drawer keyboard and scoped axe.
Verify the protected public sources and loaded public pages remain unchanged.
Generated types, relevant architecture/source/security/money gates and React Doctor
complement runtime evidence. No live provider/bank/domain operation, production
deployment, hosted workflow or release build is authorized by this UI request.

Rollback new wrappers/shell/marker readers and writers together, retaining existing
orders/markers, APIs, legacy service URLs and data. Owner merges/deploys. Record
actual results, gaps and cleanup in the existing Cloud/customer handoff.
