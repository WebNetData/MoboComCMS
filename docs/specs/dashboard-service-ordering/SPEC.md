# Ordering services without leaving the member dashboard

2026-11-07; R3; base owner-merged PR366/main901cac5d.

Outcome: a signed-in customer chooses, configures, reviews, pays and follows
services inside the existing dashboard. Only an external payment gateway is an
intentional departure; its return resumes the same dashboard. No new financial,
identity, provisioning, order or request authority.

Evidence: /dashboard/services manages owned HostingService/domain rows but all
new-service links leave for /cloud, /hosting, /servers and /domains (WEAK_UX).
HostingCatalog/HostingOrder and DomainSearch already perform canonical fixed-term,
hourly-wallet and domain checkout. Store virtual products already support sealed
order fields and typed foreign amounts through FX/cart; published forms already
support payment, uploads, staff queues and /dashboard/requests (DISCONNECTED from
dashboard ordering). Existing cart, invoice and payment-result views own totals,
authorization and gateway handling. Extend those views with an optional dashboard
presentation instead of making another checkout or embedding public pages.

Account owns /dashboard/order: overview and categories for hosting, servers,
domains, foreign payments, digital services and published service forms. Existing
Hosting/Store/Forms owners supply safe public projections. Search/pagination are
bounded. Current module state, maintenance, section/group and product audience
rules apply inside the shared dashboard too. Never list provider secrets,
unpublished/restricted products, private form settings or another user's data.

Customer flow: choose service family → choose published offering → supply required
details → review authoritative price/cycle/fees → submit explicitly → gateway or
wallet → dashboard result/invoice → owned service/order/request. Creating hourly
service still needs sufficient wallet funds and uses the existing once-only key.
Domain availability may be unknown; preserve the owner's existing disclosure.
No fake "created" state or live-provider claim. Existing Admin catalog/prices/TLDs,
FX/order fields, form builder and driver configuration remain the controls.

Optional literal checkout surface 'dashboard' is an additive internal web contract,
not a caller-provided return URL. Persist it in existing order metadata. Canonical
invoice/result owners route those owned orders back to dashboard views, including
gateway callbacks that use the old entry URL. Old absent-surface orders retain
their public presentation. Server-price, current ownership, stock/audience,
payment state claims, strict audit and idempotency must remain unchanged. No new
schema, dependency, money state, scheduler, provider connection or live purchase.

Dashboard product/form/cart/invoice/result routes compose the existing owners;
presentation props default to public for backwards compatibility. Existing cart
lines remain visible/removable before payment; do not silently replace a cart.
Empty catalogues explain availability and offer dashboard support. Loading/error/
retry states never become a successful empty order or erase typed answers.

Visual direction under unslop/SDS: retain the approved dashboard identity;
calm, task-oriented service desk; neutral semantic surfaces and existing accent;
one clear family chooser, compact real plan cards and a visible order summary;
the same choose/details/pay/track trail across families. RTL, mobile stack,
keyboard/dialog focus, contrast and reduced motion use existing primitives.
No new public landing redesign or competing design system.

Acceptance: focused pure context/URL/filter cases; native PostgreSQL service
discovery/publication/audience/module/maintenance/group checks, wallet purchase,
hourly/domain/service-form order and persisted surface/idempotent receipt; existing
order owners with several customers and strict audit; deliberate guard faults.
Actual signed-in browser chooses/submits supported families, stays in dashboard,
sees real owned invoice/result/order/service/request, checks negative/empty/error
states and scoped axe/theme/mobile views. Use recorded external transports, not
live spending. Final types/architecture/source/security/Doctor and exact tested
source hashes; no redundant full release stack or hosted browser dispatch.

Rollback: old URLs and public presentation remain. Disable optional modules or
revert this presentation; retained orders, metadata, services and requests still
work through canonical owners. Owner merges/deploys after the focused PR.
