# Hosting, servers, cloud and domains — handoff

Spec and slices: [docs/specs/hosting-cloud/SPEC.md](../../specs/hosting-cloud/SPEC.md). Decision: PLATFORM_DECISIONS *Hosting and cloud*.

## Slice 1 — foundation (2026-11-04, `feat/hosting-cloud-spec-2026-11-04` from main `2c1964c6`)

Built:
- Plugin `hosting` (off by default), permission `hosting.manage`, admin area *commerce* → *Hosting & servers*; joins
  `SITE_SECTIONS` (a section manager can be given it) and `MAINTENANCE_SECTIONS`. Section settings at `/admin/sections/hosting`
  (SEO title/description).
- Migration `20270213120000_hosting_catalog` (unreleased): `HostingProvider`, `HostingProduct`, `HostingPrice`. Database
  rules: family/kind/cycle lists, DRIVER needs a provider, a traffic add-on needs size and price, prices positive, one
  price per (product, cycle, currency), a provider with products cannot be deleted (RESTRICT).
- `src/modules/hosting/domain/catalog.ts`: kinds, drivers (all six panels, Hetzner Cloud, eight virtualizers, IRNIC),
  cycles, 730-hour month, exact BigInt saving, product/provider validation, public shape.
- `server/drivers/{contract,registry,hetzner-cloud}.ts`: one contract per family with capability lists; registry with
  `registerHostingDriver` (test drivers `TEST_*`); Hetzner Cloud connection check (`GET /v1/locations`) is the only real
  driver call so far. Every other driver answers its check with "built in a later slice".
- `server/catalog.ts`: Admin catalogue (secret only as `hasSecret`), save/delete provider (secret encrypted with
  `PANEL_CREDENTIAL_KEY`, empty field keeps it, new secret clears the last check), connection check recorded on the row,
  product save replacing prices in one transaction, public catalogue per page.
- `/api/admin/hosting` (GET, POST ops), audited, test calls rate-limited (`rateLimitStrict`, 10/min/person).
- Admin `/admin/hosting` (products: kind, resources, delivery, manual add-ons, price per cycle with saving and hourly
  estimate, stopped-server charge) and `/admin/hosting/providers`.
- Public `/hosting` and `/servers` (`components/hosting/HostingLanding.tsx`, `HostingCatalog.tsx`, `hosting.css`): hero
  with animated rack and status card, kind tabs, cycle switch with the best saving, hourly estimator, plan cards,
  features, FAQ. Ordering is not open yet: the buy button says so and "consultation" goes to tickets.
- Icons `cpu`, `activity`, `terminal`, `cloud` added to `Icon.tsx`.

Evidence (actually run):
- `npm run check` in the clean LF check tree: 846 pass / 1 skip (that skip was already in the suite), then 53, 4, 13 pass. `tsc --noEmit` clean.
- `scripts/hosting-catalog.connected.cjs` on a fresh database with all 165 migrations: pass. Deliberate breaks
  `HOSTING_FAULT=secret|plain|prices` each fail it. Scratch database dropped.
- Browser on the local preview with sample products made through the API: `/hosting`, `/servers`, `/admin/hosting`,
  `/admin/hosting/providers` at 1440 and 390, light and dark: axe 0, no horizontal overflow, no page errors (only the
  dev HMR socket). One contrast defect found and fixed; feature grid and phone rack layout fixed. The editor saved an
  hourly price through the UI and the row changed. Sample data and the module state were removed afterwards.

Not run: React Doctor; a real Hetzner token (owner's account); production build.

## Slice 2 — purchase, delivery, My services (2026-11-04, `feat/hosting-purchase-2026-11-04` from main `0d72970b`)

Built:
- Migration `20270214120000_hosting_services` (unreleased): `HostingService` (one per order, status/cycle/price checks, an
  ACTIVE fixed-term service must have start and due dates, one service per machine per system via a partial unique
  index) and `HostingAction` (history and audit, unique idempotency key).
- Checkout: `hostingProductId`, `hostingCycle`, `hostingName` as one more purchasable item through the existing order,
  invoice, wallet and gateway path. `hostingQuote` (`server/services.ts`) freezes price, setup and name on the order.
  Refused: hourly (`HOSTING_HOURLY_LATER`, waits for metering), unknown cycle, invalid domain for web hosting, inactive
  product, inactive or full system. Discount codes are refused on hosting for now.
- Fulfillment kind `HOSTING_PROVISION` (meta `kind: 'hosting'`), included in stuck alerts and operations; the worker's
  `recoverHostingOrders` re-queues paid hosting orders that lost their job (plan/product recovery never saw them).
- Delivery: a driver that lists `create` provisions (`ProvisioningDriver.provision`, generated 20-character password,
  stored encrypted); failure sets FAILED, records the action and throws so the job retries with backoff. Without such a
  driver (all real drivers today) the service waits for staff with a WAITING `DELIVER` action.
- Staff `/admin/hosting/services` (`/api/admin/hosting/services`): filters, search, deliver/edit (IP, IPv6, hostname,
  https panel URL, login, password kept when empty, note, per-service add-on overrides), suspend, unsuspend, terminate,
  history. Status changes claim the status they were decided on.
- Customer `/dashboard/services` (menu "سرویس‌های من" while the module is on) and `/dashboard/services/[id]`: status hero
  with days-left ring, delivery steps while waiting, login details with copy, password reveal (owner only, ACTIVE or
  SUSPENDED, `rateLimitStrict` 6/min, recorded), specs, staff note, history. APIs `/api/hosting/services[/id]`.
- Public order dialog (`components/hosting/HostingOrder.tsx`): term, domain/hostname, gateway, wallet first.
- Notification kind `HOSTING` (module-owned, in the email event list). Maintenance of the hosting section also closes
  `/dashboard/services`. Icon `close` added (`x` is the X logo).

Evidence (actually run):
- `npm run check` on a clean LF tree: all suites pass after two pinned tests were updated for the new checkout item
  and worker step (forms checkout regex, worker step mocks). `tsc --noEmit` clean.
- `scripts/hosting-services.connected.cjs` on a fresh database: real checkout/wallet/fulfilment, replay, ownership,
  concurrent delivery, encryption, reveal, states, driver failure then retry, capacity, refusals, DB checks, recovery.
  Deliberate breaks `HOSTING_FAULT=owner|claim|plain|once` each fail it; a clean rerun passes.
- Browser on the local preview with a test customer: ordered a VPS (yearly, wallet) and a web plan (domain validated
  in the dialog), saw both waiting, staff delivered the VPS, the customer revealed the password. Pages 1440/390,
  light/dark: axe 0 on every hosting surface; page errors none. Found and fixed: the dialog closed itself on open
  (effect cleanup under React's double mount), it was not centred, and its close icon was the X logo. The one axe
  item seen in the member shell is the existing notification link (also on Invoices and Wallet), not this work.
- Test customer, orders, invoices, wallet, services, sample products, provider and module state were removed.

Not run: React Doctor, production build, any real panel/virtualizer (none connected yet).

## Next

Slice 3 (renewal invoices, wallet auto-renew, suspend and terminate by due date), then 4–10 per the spec. Each real
driver (DirectAdmin first, Proxmox, Hetzner) plugs into `ProvisioningDriver` when the owner provides access. Owner still to provide: an international registrar reseller
account, licensed cPanel/DirectAdmin test servers, the IRNIC reseller account, a Hetzner token for live checks.
