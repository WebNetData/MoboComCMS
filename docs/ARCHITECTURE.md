# HappVPN Architecture

This document is the source of truth for new development. Existing legacy code is migrated incrementally; new code must follow these boundaries.

## 1. Architectural style

HappVPN is a **modular monolith**. Next.js is the delivery/runtime framework, not the domain model. Business rules must remain usable without React, Route Handlers or Prisma types.

```text
src/
├── app/                         # Delivery only: routes, pages, layouts, composition
├── modules/                     # Business capabilities
│   └── <module>/
│       ├── domain/              # Entities, value objects, domain rules, ports
│       ├── application/         # Use-cases / commands / queries
│       ├── infrastructure/      # Prisma, HTTP provider adapters, persistence
│       ├── server/              # Composition root for server-side use
│       └── ui/                  # Module-owned React UI when appropriate
├── platform/                    # Technical platform shared by modules
│   ├── config/
│   ├── database/
│   ├── extensions/
│   ├── http/
│   ├── audit/                   # privileged mutation audit trail
│   └── observability/           # request IDs + structured logging
├── shared/                      # Small framework-free primitives only
├── components/                  # Legacy/shared UI; migrate toward module/ui + shared/ui
├── plugins/                     # Bundled plugin implementations
└── themes/                      # Bundled theme implementations
```

## 2. Dependency rule

Dependencies point inward:

```text
app/ui -> server/composition -> infrastructure -> application -> domain
                         platform ----^              shared ----^
```

Rules:

1. `domain` imports no Next.js, React, Prisma, database or provider SDK.
2. `application` depends on domain contracts, not infrastructure implementations.
3. Prisma is an infrastructure detail. New page/route code must not query it directly.
4. Route Handlers parse authentication/input and call a use-case. They do not contain billing/provisioning rules.
5. Cross-module integration goes through a module public API or a typed domain event.
6. Extension/plugin code depends on the extension SDK/contracts, never private Core files.

Run `npm run arch:check` to enforce the rules that can be checked statically today.

## 3. Bounded contexts

Target modules:

- `identity`: users, authentication, sessions, roles and permissions
- `catalog`: plans, products, pricing and availability
- `orders`: carts/orders and order state transitions
- `billing`: invoices, payments, gateways, refunds and financial ledger
- `wallet`: wallet balance and wallet ledger
- `subscriptions`: customer subscription lifecycle
- `provisioning`: VPN provider orchestration and provisioning jobs
- `providers`: Remnawave/PasarGuard adapters
- `reseller`: reseller policy, quotas and reseller pricing
- `support`: tickets and support messaging
- `cms`: pages, posts, forms and site content
- `site`: navigation, SEO, public presentation configuration
- `notifications`: Telegram/email/SMS adapters and notification policies

A module may expose `server/index.ts` or explicit command/query functions. Importing another module's `infrastructure/*` is forbidden.

## 4. Frontend architecture

- Prefer Server Components for data composition and small Client Components for interaction.
- UI receives DTO/view models, never Prisma records as an architectural contract.
- Domain/API errors use stable machine-readable codes; translations happen in UI.
- Shared design primitives live under a future `shared/ui`; feature UI belongs to `modules/<feature>/ui`.
- Theme tokens are CSS variables. Code themes may replace approved layout/render slots through the Theme API, not copy business logic.
- Accessibility, responsive behavior, semantic HTML and keyboard use are release requirements.

## 5. Backend/API architecture

Every mutating use-case follows this shape:

```text
Route Handler -> auth + input validation -> application use-case
              -> transaction/repository/provider ports
              -> domain event/outbox
              -> typed response DTO
```

Do not pass `NextRequest`, `NextResponse`, Prisma models or provider response payloads into domain logic.

External callbacks/webhooks must be authenticated, idempotent and recorded before effects are applied. Financial/provisioning state transitions must be transaction-safe.

## 6. Global product requirements

The current SQLite schema is suitable for local/single-node development, not the long-term global target. Production architecture should move to PostgreSQL before horizontal/multi-region scaling.

Financial accounting uses integer minor-unit authoritative fields with an explicit currency. Allowlisted `Float` fields remain compatibility mirrors until the PostgreSQL cutover is reconciled; new accounting logic must never use binary floating-point as its source of truth.

Additional global rules:

- UTC in storage; locale/timezone formatting at presentation boundaries.
- BCP-47 locale identifiers and extensible dictionaries; avoid domain types hard-coded to only `fa | en`.
- Region/country/currency are explicit data, not inferred business rules.
- Object storage for user/media assets; no local-disk dependency in production.
- Redis/distributed store only when a concrete need exists (rate limits, locks, cache, queue coordination).
- Background work uses durable jobs/outbox for provisioning, notification and retryable provider calls.
- Structured logs include request/correlation id, actor id, operation and provider; secrets/tokens are always redacted.

## 7. Extension architecture

Core extensions use a versioned manifest (`platform/extensions/contracts.ts`). The stable direction is:

```text
src/plugins/<id>/
├── manifest.json  # version/capabilities/settings/permissions/admin navigation
├── client.tsx     # approved UI slots + optional admin page
└── server.ts      # namespaced API, events and durable jobs through the SDK
```

Capabilities are explicit (`ui`, `admin`, `api`, `events`, `jobs`, `settings`, `storage`). Extension IDs are unique kebab-case, manifests use semantic versions and declare Core compatibility. Registries are generated at dev/build time; adding a package never requires editing a central registry.

Uploaded arbitrary JavaScript is not executed at runtime. Code extensions are installed/deployed as trusted application code; enable/disable and settings are runtime state. This avoids turning the admin upload surface into remote-code execution.

## 8. Theme architecture

Two theme levels are supported by design:

1. **Design themes**: runtime-installable safe tokens (currently colors/radius; extend only through validated fields).
2. **Code themes**: trusted build-time packages implementing approved Header/Footer/Home contracts with fallback to Core renderers. Customized design themes can `extends` an installed code theme to preserve its renderer.

Themes never query the database directly and never implement checkout/auth/billing rules.

## 9. Data migration roadmap

Do not combine all migrations into one release.

1. Add PostgreSQL-compatible schema and migration tooling.
2. Convert financial fields away from `Float`; backfill and reconcile balances/invoices.
3. Normalize permission storage instead of comma-separated values.
4. Replace string status fields with constrained enums/state transitions where safe.
5. Add idempotency/event records for payment + provisioning workflows.
6. Consider opaque UUID/ULID public identifiers while retaining internal IDs during migration.

Each financial migration requires reconciliation queries and rollback/backups before production cutover.

## 10. Security baseline

- Production refuses to start without `NEXTAUTH_SECRET`.
- Secrets are read through platform config and must never be returned by DTOs/logs.
- Public mutation endpoints require validation, authorization and rate limiting appropriate to abuse risk.
- Provider/webhook handlers use replay/idempotency protection.
- Privileged mutations write append-only audit records with actor, target, request ID, IP and redacted metadata. Access to the viewer requires `audit.view`.
- Dependency security updates are release blockers for internet-facing production.

## 11. Migration strategy for the existing codebase

This repository is migrated **incrementally**, not via a big-bang rewrite. Compatibility re-exports under `src/lib` temporarily keep old imports working. They are not the destination for new code.

The App Router delivery layer has now been decoupled from direct database access. Public plan/catalog remains the reference vertical slice for deeper domain/application layering:

```text
modules/catalog/domain/PublicPlanRepository
      -> application/listPublicPlans
      -> infrastructure/prismaPublicPlanRepository
      -> server/getPublicPlans
      -> app page / API
```

Use that pattern for the next slices. Highest priority: checkout/billing/wallet/provisioning, because those combine money, external providers and multiple writes.
