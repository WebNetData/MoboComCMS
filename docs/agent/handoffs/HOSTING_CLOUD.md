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

## Next

Slice 2 (DirectAdmin first), then 3–10 per the spec. Owner still to provide: an international registrar reseller
account, licensed cPanel/DirectAdmin test servers, the IRNIC reseller account, a Hetzner token for live checks.
