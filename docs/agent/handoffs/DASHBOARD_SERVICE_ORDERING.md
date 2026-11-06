# Service ordering inside the customer dashboard

2026-11-07; branch `feat/dashboard-service-ordering-2026-11-07`, from
owner-merged PR366/main `901cac5d`. Scope: the customer's ordering journey,
not a new financial, provisioning, identity or staff-work system.

## Continue these owners

| Concern | Owner and extension |
| --- | --- |
| Member entry/access | Account `server/service-ordering.ts`; `/dashboard/order`, existing sidebar, quick actions and owned-services links |
| Hosting/servers/domains | Existing Hosting catalog, HostingOrder, DomainSearch and service/domain APIs; optional dashboard presentation |
| Published virtual services | Store `server/catalog.ts::memberServiceCards`; existing publication, audience and price projections; 12-row pagination, bounded search |
| Paid service forms | Forms `server/service.ts::publishedOrderForms`; published paid forms, optionally containing `fxamount`; only slug/title/description leave discovery |
| Product/form details | Private routes compose the existing ProductPage/BuyBox and sanitized PublicForm; current server validation, sealed fields and FX remain authoritative |
| Order/payment | Checkout transaction and cart/form adapters; additive literal `surface: 'dashboard'`, stored as `Order.meta.checkoutSurface` |
| Return URLs | Checkout `domain/surface.ts` maps a closed set of local paths; Billing Invoice/PaymentResult retain ownership and redirect owned marked orders from old public entry URLs |
| Follow-up | Existing services/domains, orders, requests and invoices; renew/add-on/form payment can use the same presentation |

The desk offers hosting, virtual/cloud servers, domains, foreign payments,
digital services and paid service forms. Existing cart lines remain reviewable;
ordering another service does not silently replace the cart. Required fields,
current FX quote, current totals and explicit payment confirmation are the
existing components. Hourly service creation retains its wallet requirement and
idempotency key. Fixed-term/manual delivery can remain pending after payment.
Dashboard payment success confirms payment and asks the customer to track
preparation/delivery; it does not assert that a subscription/service is active.

Hosting and Store discovery respect current module/mirror, maintenance and
canonical section-group access. Product audience/publication rules are applied
again by the original detail/checkout owners. Forms retain their own publication,
availability, human-check and submission rules. A guest enters through existing
login; invoices, services and requests still belong to the canonical user.
No new permission key, resolver, database schema, dependency, scheduler or driver.

## Internal web contract and compatibility

Only literal `surface: 'dashboard'` is accepted as the opt-in presentation marker
by checkout/cart checkout. It is stored in the existing order transaction.
Absent/invalid markers retain public defaults. No caller `returnTo`/redirect URL
is trusted. External bank URLs remain the original gateway URLs; old callback
entry pages resolve the owned order and resume the dashboard. Monetary amounts,
state claims, gateway verification, audit and idempotent receipts are unchanged.
Orders without the marker retain their public presentation. Existing invoice
PDF/official-document addresses are unchanged.

Thin typed App Router wrappers delegate public and private invoice/result pages
to the same Billing owners. Dashboard content uses one outer main landmark.
The invoice's existing horizontal items region is labelled and keyboard-focusable.
TypeScript includes Next16 generated production and development route validators;
the repository's existing JSX setting is preserved.

## Executed local evidence

All runtime checks used the task-owned Node22/Linux preview and native PostgreSQL
database, synthetic customers, test credit/catalogue and no production secrets.
The final source/configuration hashes are retained in ignored
`.mobocom/dashboard-orders/source-hashes.json`.

- **16 focused unit cases**, no skipped tests: cart/client replay, closed path
  mapping/marker parsing and Hosting/domain invoice subjects. New cases are
  registered through the existing cart test; the connected check is registered
  in `scripts/run-pg-checks.cjs`.
- **Native connected PostgreSQL** exercised the actual discovery/access,
  Checkout/Wallet/Hosting/Forms owners: session/module/maintenance/group rules,
  publication/audience/non-file discovery, sanitized form listing, paid service,
  hosting/domain/form/cart orders, once-only wallet replay, persisted marker and
  legacy absence. A separate empty database applied all **173 existing migrations**
  and ran the suite as UID1000 with no `.env`. Three isolated faults were caught:
  omitted persisted marker, publication filter and canonical group restriction.
  The four temporary databases were removed; source was never faulted in place.
- **Actual signed-in browser** configured and paid synthetic hosting/VPS/domain,
  foreign-amount and digital services, created an hourly wallet service and paid
  a submitted service form. Results/invoices/tracking stayed in the dashboard.
  A second customer exercised immediate form payment. Guest, missing-Origin,
  cross-customer invoice/service/request and restricted-product cases ran.
  Module-off, empty search, original public hosting dialog, old public return
  entries, client category switching and search reset also ran.
- **40 loaded views**: ten affected surfaces at1440/390 in server-rendered
  light/dark themes, scoped WCAG2A/AA/2.1AA axe0, one main landmark, no horizontal
  page overflow or browser page errors. The corrected payment message was then
  checked in its four affected views; no purchases were repeated for visual QA.
  Actual mobile invoice-region keyboard focus was checked.
- Final TypeScript (including generated routes), architecture, source,
  security/audit, money primitives and money-UI checks passed. Scoped Semgrep
  (two local unsafe-code/SQL rules) and redacted Gitleaks found0. React Doctor
  reported0 errors/65 reviewed warnings (principally existing component
  complexity, effects and request handling; no suppression or baseline change).
  Final Graphify refresh is static architecture evidence, not runtime proof.

The harness corrected an expected form status from200 to the actual201 and an
invalid FX fixture to the real `5 USD` answer format. Existing paid receipts
were recovered read-only after a lost browser response; already-paid orders were
not resubmitted. Next's development worker restarted at its configured heap
threshold; the task container recorded no kernel OOM. Interrupted views resumed
only incomplete cases. A local Windows certificate-store access failure in the
first scan was resolved by rerunning the same local scan with access; rules did
not change. These are bounded local results, not a first-pass/full-release claim.

## Limits, operations and rollback

No production build/release, hosted workflow dispatch, deployment, real bank
payment, registrar operation or real infrastructure provisioning ran. Providers
and fulfillment retain their current configured behavior; manual pending states
are not simulated as successful deployment. Form discovery currently scans at
most100 published forms; product discovery is paginated12 and caps page1000.
The task's background schedulers were disabled after initial local baseline
startup; all data/connections were synthetic and no live provider was configured.

Admin continues to configure existing Hosting plans/drivers/TLDs, Store virtual
products/order fields/FX and published paid Forms/handlers. See the
[Persian operator guide](../../DASHBOARD-SERVICES-FA.md) and
[implementation scenario](../../specs/dashboard-service-ordering/SPEC.md).

Rollback is a code revert or optional-module disable, preserving all order,
invoice, wallet, form and service data. Old public routes and unmarked orders
remain supported; no data deletion or schema rollback is necessary. Owner merges
and deploys. Task container/database/ephemeral session cleanup is recorded in the
local evidence; unrelated owner resources and working-tree receipts are retained.
