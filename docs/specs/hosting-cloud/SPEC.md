# Hosting, servers, cloud and domains

## Outcome and owner

Owner, 2026-11-04: add web hosting and infrastructure sales of the ParsPack class, with a more advanced and more
professional look and feature set. Decided in this conversation:

- **One account, one member dashboard.** Hosting is an area of the existing member shell with a service workspace
  of its own, not a second dashboard (see PLATFORM_DECISIONS, *Hosting and cloud*).
- **Web hosting panels:** cPanel/WHM, DirectAdmin, HestiaCP, ISPConfig, Virtualmin GPL, CloudPanel.
- **Domains:** IRNIC (.ir) and international registrars that accept Iranian resellers.
- **Products:** shared hosting, reseller hosting, VPS, dedicated servers, cloud servers and cloud hosting.
- **Servers:** both a provider's API and a direct connection to the owner's own virtualizer. The customer manages
  their server from the site: power on/off, restart, reset, rebuild, and everything else the platform offers.
- **Billing:** cloud services are charged by the hour; every service can also be sold monthly, quarterly,
  half-yearly and yearly.

The result a customer sees: public pages to choose a plan, a server or a domain; checkout through the existing
invoice and wallet; and, in the dashboard, a workspace per service with its state, usage, controls and renewal.

**Owner module: `hosting`** (new plugin `src/plugins/hosting`, `src/modules/hosting`). It is not `server-panel`:
that module manages the server MoboCom itself runs on and stays as it is.

### What already exists and is reused (audit of main `2c1964c6`)

| Need | Existing owner, reused |
|---|---|
| Order, invoice, payment, gateways, receipts, PDF | `billing`, `checkout` (`Order`, `Invoice`, `Payment`) |
| Wallet balance and debits with idempotency | `wallet/server/wallet.ts` `moveWallet` (`WalletTx.idempotencyKey` unique) |
| Durable provisioning after payment, retries, stuck alerts | `FulfillmentJob` + `fulfillment/server/worker.ts` (once a minute) |
| Provider credentials encrypted at rest | `providers/server/panel-credentials.ts` (AES-256-GCM, `PANEL_CREDENTIAL_KEY`) |
| One adapter contract per provider family, registry by type | Pattern of `providers/server/panels/{contract,registry}.ts` |
| Module switch, permission, admin area | Plugin manifest, `whenModuleOn`, `adminMenu.area` |
| Member shell, account design, service tickets | `dashboard` layout, `account-design.css`, support tickets |
| Renewal from the wallet, reminders | Membership's wallet renewal and the inbox (same rules) |
| Recurring invoices staff issue by hand | `RecurringInvoice` (left as it is; services get their own due date) |

What does **not** exist and is built here: a product family for infrastructure, services bound to an outside
system, provider drivers for web panels, registrars and compute, customer actions on a running server, hourly
metering, domains.

The VPN `Plan`/`Panel`/`Subscription` tables are traffic and device shaped and stay VPN's. Hosting does not reuse
or widen them.

## Actors and authorization

| Actor | May | Guard |
|---|---|---|
| Guest | See catalogue, prices, domain availability | Public, rate limited |
| Member | Buy, see and act on **their own** services and domains | Session + `service.userId === viewer.id`, checked in every API |
| Staff with `hosting.manage` | Providers, products, prices, all services, manual actions, suspensions | `requirePerm(..., 'hosting.manage')` |
| Staff with `invoices.manage` | Invoices of hosting orders, as today | Unchanged |
| Reseller customer (later slice) | Their own sub-accounts inside a reseller hosting account | Through the panel's own reseller login |

`hosting.manage` is declared in the manifest, added to `SITE_SECTIONS` (a section manager can be given it), and to
`CORE_ADDED_LATER` semantics so a full administrator keeps everything. Never `cms.*`, `orders.manage` or VPN keys.

Explicit denies: a member never reaches a provider credential, another customer's service, a provider address, or a
raw provider call. Suspended or terminated services allow viewing and paying, not actions. Module off: pages and
APIs close, no metering runs, no provider is called; data stays.

## Data and compatibility

All new tables, additive migration, line in `prisma/release-manifest.json`, both Prisma schemas in parity. Money as
`BigInt` minor units with a currency, as everywhere else (`IRT` by default).

| Model | Purpose and rules the database enforces |
|---|---|
| `HostingProvider` | A connected system: `family` WEB_PANEL / REGISTRAR / COMPUTE, `driver` (CPANEL, DIRECTADMIN, HESTIACP, ISPCONFIG, VIRTUALMIN, CLOUDPANEL, IRNIC, …, PROXMOX, …), address, encrypted `secret`, non-secret `config` JSON, `active`, capacity limit |
| `HostingProduct` | `kind` SHARED / RESELLER / VPS / DEDICATED / CLOUD_SERVER / CLOUD_HOSTING; resources (CPU, RAM, disk, traffic, sites, mailboxes…) as typed columns plus a spec JSON for display; provider package/template name; `fulfillment` DRIVER / MANUAL; `allowTraffic`, `allowUpgrade` (manual add-ons, off by default) and the traffic pack price; `active`, `featured`, sort |
| `HostingPrice` | `productId`, `cycle` HOURLY / MONTH / QUARTER / HALF / YEAR, `amountMinor`, `setupMinor`, `currency`; unique `(productId, cycle, currency)` |
| `HostingService` | One bought thing: `userId`, product, provider, `status` PENDING / PROVISIONING / ACTIVE / SUSPENDED / TERMINATED / FAILED, `cycle`, `externalId` unique per provider, hostname, IPs, `nextDueAt`, `suspendedAt`, `terminateAt`, `autoRenew`; order and invoice links; for manual delivery the login username and encrypted password, and per-service add-on overrides (empty: the product's) |
| `HostingAction` | Every customer or staff action: service, actor, `kind`, `status` QUEUED / RUNNING / DONE / FAILED, provider task id, `idempotencyKey` unique, error. The audit and the history the workspace shows |
| `HostingUsageCharge` | One hour of a metered service: unique `(serviceId, hourStart)`, `amountMinor`, `walletTxId`. The unique key is the rule that an hour is never charged twice |
| `DomainTld` | Suffix, registrar provider, register/renew/transfer/restore price per year, min/max years, `active` |
| `Domain` | Name unique, `userId`, TLD, registrar, `status`, `expiresAt`, `autoRenew`, nameservers, lock, encrypted auth code, IRNIC handle or contact set |

Older readers are not affected: nothing existing is renamed or widened. Rollback: reverting the code leaves the
new tables unused; services already provisioned keep running at the provider and are listed by staff from the
provider's own panel.

## Drivers (one contract per family)

`src/modules/hosting/server/drivers/{web,registrar,compute}/contract.ts` and a registry like VPN's. A driver states
what it **can** do (`capabilities`), and the workspace only shows those actions.

- **Web panel:** test, create account (package, domain, username), suspend, unsuspend, terminate, change package,
  change password, usage, single sign-on link.
  cPanel/WHM (WHM API 1, token), DirectAdmin (API, login key), HestiaCP (API hash), ISPConfig (remote API),
  Virtualmin GPL (remote API over HTTPS), CloudPanel (**no HTTP API; `clpctl` over SSH** with a key, fixed command
  templates, arguments validated, never interpolated into a shell).
- **Registrar:** check availability, price check, register, renew, transfer in, nameservers, lock, auth code,
  contacts/handle, sync expiry. IRNIC over EPP with the owner's reseller handle. International: one driver per
  registrar the owner contracts with.
- **Compute:** create from template/OS image, start, stop, shutdown, reboot, reset, rebuild, root password reset,
  console ticket, rescue/ISO, snapshots, backups, resize, IP list, reverse DNS, firewall, usage graphs, delete.
  Two connection kinds behind the same contract: **direct** to the owner's virtualizer — Proxmox VE,
  XCP-ng through Xen Orchestra, OpenNebula, Apache CloudStack, Virtualizor, VMware (vCenter), SolusVM, OpenStack —
  and **provider API**, where the owner's own account at a cloud provider (first: Hetzner Cloud) creates the
  customer's server and the customer manages it fully from the site; the provider is never shown to the customer.
- **Manual (no driver).** Staff deliver the server by hand: IP, username, password (encrypted, shown to the owner
  only in the workspace). The customer gets no controls, only the details, renewal and the add-ons staff allow:
  extra traffic and an upgrade to another plan. Each is off unless switched on for the product, and staff may
  switch it on or off per service. A paid add-on becomes a staff task (`HostingAction` waiting for staff) with a
  notice; staff mark it done after applying it.

Every driver has a fake twin for tests; a driver is accepted only after a contract test against a real instance.

## Flows

**Buy (fixed term).** Plan + cycle (+ domain) → existing checkout → invoice → paid → `FulfillmentJob`
`HOSTING_PROVISION` → driver create → service ACTIVE, credentials shown once in the workspace and sent by the inbox.
A failed provider call retries with backoff; after the limit the job is FAILED, the service stays PROVISIONING
and staff are alerted (existing stuck alerts). The payment is never lost: staff retry or refund through the invoice.

**Renew.** An invoice is issued N days before `nextDueAt` (setting). Auto-renew pays it from the wallet when the
member turned it on (Iranian gateways keep no card). Unpaid after due + grace → SUSPENDED at the provider; after the
retention days → TERMINATED, with notices before each step. Paying a suspended service unsuspends it.

**Hourly (cloud).** Requires a wallet balance for at least the setting's minimum hours. Every hour the metering
job, per active metered service, inserts `HostingUsageCharge` for that hour and debits the wallet with
`moveWallet` (`idempotencyKey = hosting:usage:<serviceId>:<hourStart>`) in one transaction. A crashed run repeats
safely. A stopped server is still charged its disk and its IP addresses (owner, 2026-11-04); only compute stops. Low balance: warnings at 24 h and 2 h left. Zero:
power off (data kept), then delete after the retention days. Switching an hourly service to a monthly term is a
cycle change with its own invoice.

**Server action.** Member presses an action → API checks ownership, status, capability, rate limit → writes
`HostingAction` QUEUED with an idempotency key → driver call → RUNNING with the provider task id → poll until DONE
or FAILED; the workspace shows progress live. Destructive actions (rebuild, delete, restore snapshot) need the
typed hostname and a fresh password or 2-step confirmation. Console: a one-use ticket that lives a minute.

**Domain.** Search → availability through the registrar driver (cached a minute) → cart with years → paid →
`DOMAIN_REGISTER` job → ACTIVE with expiry from the registry. `.ir` needs the member's IRNIC handle (field on the
order, validated). Renewal and expiry follow the same notices as services.

Edge paths for every flow: provider down (retry, never mark done), action on an already-in-state server (DONE
without a call), two clicks (same idempotency key), member deleted or banned (services suspended, not removed),
product deactivated (existing services continue and renew), price changed (existing services keep their price
until the owner chooses otherwise; recorded on the service).

## Admin and public UI

**Admin** (area *commerce*, group *Hosting & servers*): providers (test connection, capacity, health), products and
prices (cycle matrix), TLDs, services (search, filters by status/product/provider/due, bulk suspend), domains,
actions log, settings (notice days, grace, retention, hourly minimum, disk rate).

**Public:** `/hosting`, `/servers`, `/cloud`, `/domains`, a page per product family. Plan cards with a cycle
switcher that shows the saving, a server configurator (CPU/RAM/disk sliders with a live hourly and monthly price),
instant domain search with suggestions, comparison table, locations. Effects from the existing builder library
(surfaces, entrances, glow), all off under reduced motion. SEO through the shared share-card and permalinks.

**Member:** *My services* in the existing shell (one list for hosting, servers, domains and VPN) and a workspace
per service: status hero with live state, resource gauges and graphs, power bar, rebuild with OS picker, console
window, snapshots, activity timeline from `HostingAction`, renewal and invoices, SSO to the hosting panel. The
member shell's design sheet and `dt-` pieces; RTL first, phone and both themes; keyboard-reachable controls.

## Contracts and security

- APIs under `/api/hosting/*` (member) and `/api/admin/hosting/*` (staff), behind the module switch, origin check,
  rate limits (actions per service per minute), audit row per action. A versioned contract for the mobile apps
  comes with the member API slice, not before.
- Secrets: encrypted with the existing credential key; never returned to a browser; logs redact them.
- Outbound calls go only to a provider's configured address. A virtualizer on a private network is allowed
  because staff configure it; a member never supplies an address.
- Money claims: an hour is charged once (unique hour row + wallet idempotency key); a paid invoice provisions once
  (`FulfillmentJob.dedupeKey`); a refund of a service order terminates or suspends it, never leaves it running.

## Slices

| # | Slice | Done when |
|---|---|---|
| 0 | This spec, owner decisions recorded | Done |
| 1 | Foundation: plugin (off by default), permission, models, driver contracts and registry with fake drivers, Admin providers/products/prices, public catalogue pages with the designed look | **Done 2026-11-04** ([handoff](../../agent/handoffs/HOSTING_CLOUD.md)); nothing is sold yet |
| 2 | Web hosting sale and provisioning with the first panel driver (DirectAdmin), *My services* and the hosting workspace with SSO | Real purchase provisions a real account |
| 3 | Fixed-term lifecycle: renewal invoice, wallet auto-renew, suspend, unsuspend, terminate, notices | Connected PG test of every state change |
| 4 | Servers: Proxmox VE direct driver and Hetzner Cloud API driver, VPS purchase, workspace power bar, rebuild, password, console, graphs; manual delivery with allowed add-ons (traffic, upgrade) | Real Proxmox in a VM; Hetzner with the owner's token |
| 4b | Other virtualizers: XCP-ng/Xen Orchestra, OpenNebula, CloudStack, Virtualizor, VMware vCenter, SolusVM, OpenStack | Each against a real instance |
| 5 | Hourly cloud metering and the wallet rules | Connected PG test: double run charges once; zero balance powers off |
| 6 | Domains with IRNIC: TLDs, search, register, renew, nameservers, handle | IRNIC test environment (OT&E) |
| 7 | International registrar driver chosen by the owner | Its sandbox |
| 8 | Other panels: HestiaCP, ISPConfig, Virtualmin, CloudPanel, the second of cPanel/DirectAdmin | Each against a real instance |
| 9 | Reseller hosting, dedicated servers (manual + IPMI/Redfish power), snapshots, backups, firewall, rDNS, resize, more virtualizers/providers | Per driver |
| 10 | Operations: capacity and placement across providers, reports, member API for apps | — |

## Acceptance

- `scripts/hosting.connected.cjs` (registered in `scripts/run-pg-checks.cjs`): provisioning once per paid invoice,
  hourly charge once per hour under two concurrent runs, suspension at zero balance, ownership refusal for another
  member's service. Deliberate breaks that must fail it: dropping the hour unique key, skipping the ownership check.
- Driver contract tests against fakes in `npm run check`; against real instances per slice, recorded in the handoff.
- Browser: public pages and the workspace at 1440 and 390, light and dark, axe 0; React Doctor error gate.
- Not run until the owner provides them: licensed cPanel/DirectAdmin, the IRNIC reseller account, the chosen
  international registrar and the owner's own virtualizer.

## Owner answers (2026-11-04) and what stays open

1. Virtualizers: all eight listed under *Drivers*, Proxmox VE first. Provider API: Hetzner Cloud with the owner's
   account first. Manual sale with staff-allowed traffic and upgrade add-ons.
2. International registrar: none yet; the owner will take a reseller account. Slice 7 waits for it.
3. Web panels: all six. Slice 2 starts with DirectAdmin; the rest follow in slice 8.
4. A stopped cloud server pays for its disk and IP addresses.

Open: the registrar (2); licensed cPanel and DirectAdmin test servers; the IRNIC reseller account; whether the
owner's Hetzner account terms allow reselling to the site's customers is for the owner to confirm.
