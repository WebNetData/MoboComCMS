# Hosting, servers, cloud and domains — handoff

Spec and slices: [docs/specs/hosting-cloud/SPEC.md](../../specs/hosting-cloud/SPEC.md). Decision: PLATFORM_DECISIONS *Hosting and cloud*.

2026-11-10: [Public Cloud navigation](CLOUD_PUBLIC_NAVIGATION.md) adds an editable
header mega menu for fresh and existing installs;1.7.14 backfills only the missing
branch and preserves owner configuration. Existing theme/Settings owners remain.

2026-11-09: [Member Cloud continuation](MEMBER_CLOUD.md) records the dashboard
menu, family lists, native location wizard and chat-close completion, with scoped
browser/accessibility and ownership evidence. Continue the existing owners there.

## MoboCom Cloud — one section (2026-11-04, `feat/mobocom-cloud-2026-11-04` from main `dce11c77`)

Owner: bring hosting, servers and domains together as one section named «موبوکام کلاد», professional and modern.

- Same module (`hosting`), ids, permission (`hosting.manage`), data and addresses. Renamed only where people read it:
  the manifest name and Admin menu («موبوکام کلاد», cloud icon), the section-manager and maintenance labels, the member
  menu entry (`/dashboard/services`, now «موبوکام کلاد») and that page's heading, which links to `/cloud`.
- New public overview `/cloud` (`src/components/hosting/CloudLanding.tsx`, `cloud.css`): hero with an orbit visual,
  four family cards (web hosting, VPS/dedicated, hourly cloud, domains) with the real lowest price of each from the
  catalog and TLD list ("به‌زودی" when a family has nothing on sale), the domain search when TLDs exist, three steps with
  a dashboard sketch, features and FAQ. Reuses the approved `hx-*` language of /hosting and /servers.
- `CloudBar` (shared section bar: overview, web hosting, servers and cloud, domains, my services) on `/cloud`, `/hosting`,
  `/servers` and `/domains`; each page keeps its address, SEO and canonical. `/cloud` joined `publicPaths`, so module-off
  and maintenance close it with the rest.
- Evidence: full check 868/1 existing skip + 53 + 4 + 13 on a clean Linux tree. Browser on a temporary second preview
  (port 3001, copy of the local database, schedulers off; removed afterwards): `/cloud`, `/hosting`, `/servers`,
  `/domains` at 1440/390 light/dark = 16 views, all HTTP 200, axe 0, no horizontal overflow, no console errors; viewport
  shots read for the bar and hero on mobile and desktop.
- Not verified: the member dashboard label in a browser (signed-in view), a site with TLDs on sale (the local data has
  none, so the domain search section of /cloud was not shown). Menus of the site header are the owner's: add `/cloud`
  from Admin → menus to show it in the main navigation.

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

## Slice 3 — renewal and due dates (2026-11-04, `feat/hosting-renewal-2026-11-04` from main `f37c69cd`)

Built (no schema change):
- Checkout item `hostingRenewServiceId`: one more term of the customer's own ACTIVE or SUSPENDED fixed-term service at its
  bought price (no setup fee). Refused for another member's service, a terminated or hourly one, and with discount codes.
- Fulfillment kind `HOSTING_RENEW` (`server/renewal.ts` `applyHostingRenewal`): adds one term to the due date (not to
  the payment day), once per order (action key `renew:order:<id>`, due date claimed). A system suspension for the
  unpaid term is lifted; a staff suspension stays. A renewal paid for a service terminated meanwhile goes back to the
  wallet (idempotent refund). Lost renewal jobs are recovered by the same worker step.
- Hourly scheduler job `hosting-lifecycle` (`runHostingLifecycle`): reminders on the configured days, wallet renewal
  from a day before the due date (key per service and due date, so repeats find the same order), suspension after the
  grace days, a warning 3 days before termination and termination after the termination days. Only suspensions made
  by the system for an unpaid term are ever terminated. Pure rules in `domain/services.ts` (`lifecycleStep`).
- Module settings: reminder days (7,3,1), grace days (3), termination days (14), wallet renewal on/off.
- Service page: renewal panel (price per term, due date, renew now, auto-renew switch that moves at once and reverts
  if not saved). Staff delivery now completes the waiting delivery entry instead of adding a second one.

Evidence (actually run):
- `npm run check` on a clean LF tree: 852 pass / 1 skip that was already in the suite, then 53, 4, 13. `tsc` clean.
- `scripts/hosting-renewal.connected.cjs` on a fresh database (real checkout, wallet, fulfilment, scheduler): manual
  renewal, replay, double application, another member, discount refusal, reminders once, wallet renewal once,
  short wallet, grace, suspension, warning, termination, staff suspension kept, reopen on payment, refund for a
  deleted service, recovery. Breaks `HOSTING_FAULT=twice|grace|staff|refund` each fail it; clean rerun passes.
  `hosting-catalog` and `hosting-services` still pass.
- Browser on the local preview with a test customer (bought and delivered through the real APIs): auto-renew switched
  on and kept after reload; renew paid from the wallet; due date moved one month; history shows it. 1440/390,
  light/dark: axe 0 (apart from the existing shell notification link), page errors none. Found and fixed: the switch
  track covered its checkbox, and the switch waited for the server before moving.
- The test customer and their data were removed. **Left on purpose for the owner:** the module switched on and the
  ten sample plans (slugs `hxdemo-`, tagline ends with «(نمونه)»).

Not run: React Doctor, production build.

## Slice 5 — hourly cloud billing (2026-11-04, `feat/hosting-hourly-2026-11-04` from main `f87ffda4`)

Built:
- Migration `20270215120000_hosting_hourly` (unreleased): `HostingService.powerState` (RUNNING/STOPPED),
  `stoppedHourlyMinor`, `chargedUntil`; `HostingUsageCharge` with unique (service, hour), unique wallet movement, an
  hour that starts on the hour and a non-negative amount.
- Buying (`server/metering.ts` `createHourlyService`, `POST /api/hosting/hourly` with Idempotency-Key): no checkout and
  no upfront charge; the wallet must cover the configured minimum hours (setting `hourly-min-hours`, 24); at most three
  hourly services waiting for delivery per customer; delivery is the same `HOSTING_PROVISION` job (by service id).
  Checkout still refuses HOURLY.
- Charging (`chargeHourlyService`, scheduler job `hosting-metering` every 5 minutes): each completed hour from the start
  hour, one transaction per hour (claim `chargedUntil`, wallet debit with key `hosting:usage:<id>:<hour>`, charge row);
  a stopped server pays the disk and IP rate; at most 72 hours per run. The wallet never goes below zero: an hour it
  cannot pay suspends the service (system suspension), a top-up resumes it without charging the suspended hours, and
  it is terminated after the termination days with a warning 3 days before. Low-credit notices at under 24 and under 3
  hours, once a day, on the customer's total hourly rate.
- Deleting by the customer (`terminateHourlyByCustomer`): the typed name must match; the hour in progress is charged
  in full; nothing is charged after.
- Service page: hourly header rate, usage panel (live meter for the hour, 24 h / month / total, 48-hour chart with
  stopped hours marked), wallet runway gauge with top-up, delete section. The order sheet offers «ساعتی» with the
  monthly estimate and minimum credit; cards show «ساخت سرویس ساعتی» on the hourly tab.

Evidence (actually run):
- `npm run check` on a clean LF tree: 854 pass / 1 skip that was already in the suite, then 53, 4, 13. `tsc` clean.
- `scripts/hosting-hourly.connected.cjs` (fresh database): refusal without credit, repeated key, no prepayment,
  checkout refusal, nothing charged before delivery, completed hours charged once under three concurrent runs, DB
  refusal of a duplicate or off-hour row, stopped rate, usage totals equal the rows, warning, suspension without a
  negative wallet, resume without charging suspended hours, deletion (name check, current hour, nothing after),
  termination after the days, fixed term not deletable, wallet debits equal the hour rows. Breaks
  `HOSTING_FAULT=rate|unpaid|resume` each fail it. The other three hosting scripts still pass.
- Browser and the real scheduler on the local preview: a test customer ordered Cloud 4 hourly from `/servers`, staff
  delivered it, the start was moved 9 hours back and the running scheduler charged 9 × 1,250 toman from the wallet.
  Service page at 1440/390, light/dark: axe 0 (apart from the existing shell notification link), no page errors, the
  live meter advances. Found and fixed: a lone login card at the top (usage now leads and cards fill gaps).
- The test customer, their service, charges and wallet movements were removed; the module and ten sample plans stay.

Not run: React Doctor, production build, a real driver (power state changes arrive with the drivers).

## Add-ons — traffic packs and upgrades (2026-11-04, `feat/hosting-addons-2026-11-04` from `release/v1.7.1` `4d3c6315`)

Based on the release branch because 1.7.1 seals the earlier hosting migrations; this slice's migration is the only
unreleased one. The PR also shows the release commit until the 1.7.1 metadata PR is merged.

Built:
- Migration `20270216120000_hosting_addons` (unreleased): `HostingService.extraTrafficGb` (non-negative).
- `domain/addons.ts`: packs 1–20, per-service switch over product switch, upgrade targets (same kind, on sale, priced
  for the service's cycle, dearer than it pays), prorated upgrade charge (difference × time left, rounded up; nothing
  for an ended term or an hourly service).
- `server/addons.ts`: checkout item `hostingAddon` (TRAFFIC with packs, UPGRADE with a target) for the customer's own
  ACTIVE or SUSPENDED service; discount codes refused. Fulfilment `HOSTING_ADDON` applies once per order (action key
  `addon:order:<id>`): traffic adds GB; an upgrade moves the service to the new plan and renewal price, claiming the
  plan it was bought from. A manually delivered service gets a WAITING task; staff mark it «اعمال شد» and the customer
  is told. Hourly services upgrade without payment (new hourly and stopped rates from the next hour). Recovery of lost
  add-on jobs joins the hosting worker step.
- Customer page: «افزودنی‌ها» panel (pack stepper with live total, upgrade list with specs, new renewal price and what
  is paid now); specs show the extra traffic; the old ticket link shows only when there is no panel.
- Admin services: «کارهای افزودنی» filter with a count, waiting tasks on each row with a done button.

Evidence (actually run):
- `npm run check` on a clean LF tree: 856 pass / 1 skip that was already in the suite, then 53, 4, 13. `tsc` clean.
- `scripts/hosting-addons.connected.cjs` (fresh database, real checkout/wallet/fulfilment): offer, traffic paid and
  added once, replay, staff task and double completion refused, other member, too many packs, discount, closed
  switch, wrong target, prorated upgrade within bounds, new renewal price, new plan's own switch, renew first,
  hourly upgrade with new rates, recovery. Breaks `HOSTING_FAULT=twice|owner|closed` each fail it; clean rerun passes.
  The other four hosting scripts still pass on the same database.
- Browser on a temporary second preview (port 3001, this branch, a copy of the local database, background jobs off):
  2 packs bought (specs 2,200 GB with 200 extra), upgrade to VPS-M paid, admin showed 2 tasks and one was completed.
  1440/390 light/dark axe 0 (apart from the existing shell notification link), no page errors. The container and the
  database copy were removed; the owner's localhost:3000 and its database were not touched.

Not run: React Doctor, production build, a real driver applying traffic or resize on a server.

## Domains (2026-11-04, `feat/hosting-domains-2026-11-04` from main `6dfbdaf0`)

Built:
- Migration `20270217120000_hosting_domains` (unreleased): `DomainTld` (suffix unique and checked, register/renew/transfer
  prices, allowed years, IRNIC handle flag, optional registrar), `Domain` (ASCII lowercase name check, one live row
  per name via a partial unique index, dates required once registered, one per order), `DomainAction` (history and
  staff tasks, unique key).
- `domain/domains.ts`: input cleaning, longest-suffix match, label rules (IRNIC three characters, punycode), years,
  IRNIC handle (ab1234-irnic), 2–6 name servers, expiry arithmetic, lifecycle step (reminders 30/7/1, wallet renewal
  from three days before, EXPIRED after the date, wallet renewal still tried for 30 days after).
- `server/domain-check.ts`: availability from fixed public hosts only: WHOIS whois.nic.ir:43 for .ir, RDAP via
  rdap.org for the rest; one-minute cache; anything unreadable or blocked is "unknown" (orderable, staff confirm).
- `server/domains.ts`: price list (staff), public search on the typed extension plus featured ones, checkout items
  `domainOrder` (register or transfer, handle, encrypted auth code) and `domainRenew`; fulfilment `DOMAIN_ORDER` creates
  the domain and a registry task (a name taken by a concurrent paid order is refunded in full, once); staff register
  (expiry given or years from today), cancel with refund, complete tasks (renewal, name servers, transfer code, with
  a note); renewal adds years to the expiry once per order; customer name servers (stored, newest request replaces a
  waiting one), transfer code once a day, wallet auto-renew; `domain-lifecycle` hourly job; recovery joins the hosting
  worker step.
- Public `/domains` (manifest public path): hero search with register/transfer modes, result rows with availability,
  order sheet (years, IRNIC handle, auth code), featured chips, steps, full price table, FAQ.
- Member: domains section in «سرویس‌های من», `/dashboard/domains/[id]` (expiry ring, renewal by years, auto-renew,
  name servers, transfer code, history). Maintenance of the hosting section also closes `/dashboard/domains`.
- Admin: `/admin/hosting/domains` (filters including registry tasks, register / cancel and refund / task done) and
  `/admin/hosting/tlds` (price list). Setting `domain-reminder-days`.

Evidence (actually run):
- `npm run check` on a clean LF tree: 859 pass / 1 skip that was already in the suite, then 53, 4, 13. `tsc` clean.
- `scripts/hosting-domains.connected.cjs` (fresh database, real checkout/wallet/fulfilment, lookup double): price
  list rules, search, handle and years, paid once, replay, already ordered, taken, transfer rules, encrypted code,
  deterministic two-order race (one live row, loser refunded once), staff register/cancel/refund, freed name, renewal
  once, ownership, name servers, transfer code limit, reminders, wallet renewal once, expiry, price-list deletion
  refusal, recovery. Breaks `HOSTING_FAULT=norefund|owner|twice` each fail it; clean rerun passes. The five other
  hosting scripts pass on the same database.
- Browser on a temporary second preview (port 3001, a copy of the local database, background jobs off): six sample
  extensions saved through the API; search returned real IRNIC WHOIS answers for .ir («آزاد است»), while RDAP was not
  reachable from this network so .com/.net/.org showed «قابل سفارش»; a .com was ordered for 2 years from the wallet,
  staff marked it registered, the customer saved name servers. Public, results, order sheet, services, domain page
  and both admin pages at 1440/390 light/dark: axe 0 after one fix (the phone-width price table was not keyboard
  focusable), no page errors. Container and database copy removed; the owner's localhost:3000 untouched.

Not run: a registrar driver (IRNIC EPP or an international registrar), React Doctor, production build.

## Next

Among slices that need no outside access: manual add-on purchase (traffic, upgrade), domain search and IRNIC order flow UI; then the drivers (4, 6–9) as access arrives. Each real
driver (DirectAdmin first, Proxmox, Hetzner) plugs into `ProvisioningDriver` when the owner provides access. Owner still to provide: an international registrar reseller
account, licensed cPanel/DirectAdmin test servers, the IRNIC reseller account, a Hetzner token for live checks.
