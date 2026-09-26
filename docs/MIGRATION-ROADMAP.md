# HappVPN architecture migration roadmap

Last updated: 2026-09-20

The refactor is incremental. Production behavior should remain stable while coupling is removed slice by slice.

## Phase 1 — architecture foundation (implemented in this revision)

- [x] Add `platform/`, `modules/`, `shared/` boundaries.
- [x] Move database bootstrap to `platform/database`.
- [x] Move identity/RBAC/access control into the identity module.
- [x] Make production authentication fail closed when `NEXTAUTH_SECRET` is missing.
- [x] Organize billing, wallet, providers, subscriptions, reseller, notifications, public API and site services under business modules.
- [x] Keep deprecated `src/lib` compatibility re-exports for low-risk migration.
- [x] Add versioned extension manifest contracts and registry validation.
- [x] Remove Prisma model types from the public landing UI contract.
- [x] Migrate public plans to domain/application/repository composition.
- [x] Add architecture checks that block new direct DB coupling from `src/app`.

## Phase 2 — financial and persistence correctness (foundation implemented; production cutover pending)

- [x] Add PostgreSQL shadow schema, export/import tooling, row-count + digest verification and documented rollback gate.
- [ ] Rehearse the production cutover against a production-sized copy before launch.
- [x] Introduce integer minor-unit fields/primitives as the authoritative path while retaining allowlisted legacy Float mirrors for compatibility.
- [ ] Remove legacy Float mirrors after PostgreSQL cutover and reconciliation.
- [x] Add executable wallet/invoice/payment reconciliation tooling; run it before and after migration.
- [x] Make wallet debit atomic, invoice settlement idempotent, inventory reservation explicit and provisioning/renewal durable.
- [x] Add idempotency keys, webhook inbox claims and retryable fulfillment jobs with stale-worker recovery.
- [ ] Replace comma-separated permissions with normalized relations or structured storage.

## Phase 3 — application/API boundaries

- [x] Remove direct DB access from App Router; all 60 legacy files now delegate to owning module server/page adapters and the architecture gate allows no exceptions.
- [ ] Introduce request schemas/validation at every public/admin mutation boundary.
- [ ] Standardize API errors on stable error codes plus localized UI messages.
- [ ] Generate/maintain OpenAPI for `/api/v1`.
- [ ] Add audit logs for privileged admin actions.

## Phase 4 — reliability and global operations

- [ ] Structured logging with request/correlation IDs and secret redaction.
- [ ] Metrics/tracing for checkout, provider latency, provisioning and webhook failures.
- [ ] Durable job/outbox processing for provisioning and notifications.
- [ ] Distributed rate limiting only where multi-instance deployment requires it.
- [ ] Object storage for uploaded/media assets.
- [ ] UTC storage + explicit timezone/locale presentation strategy.

## Phase 5 — extension/theme platform (implemented foundation)

- [x] Versioned Plugin API/contracts and generated registries.
- [x] Core events/hooks with explicit capability declarations.
- [x] Namespaced extension settings and KV storage.
- [x] Durable extension jobs using the existing retry/lease queue.
- [x] Admin Extension Manager for enable/disable/settings.
- [x] UI slots, extension permissions and dynamic admin navigation.
- [x] Code-theme contracts for Header/Footer/Home with design-theme fallback/child-theme inheritance.
- [ ] Add extension-owned relational migrations only when a real plugin cannot use namespaced storage.

## Phase 6 — framework modernization

- [x] Upgrade from the legacy Next.js 14 line to the patched Next.js 15 release used by production.
- [ ] Upgrade compatible React/Auth/Prisma dependencies with migration tests.
- [ ] Run full dependency, auth, payment, webhook and provisioning regression tests before production rollout.

Do not combine Phase 2 financial schema changes with a framework major upgrade in the same production release.

## Operations / security hardening

- [x] Add request/correlation IDs and structured JSON logging with redaction.
- [x] Add append-only admin audit logging plus `audit.view` viewer/permission.
- [x] Remove predictable seed credentials and gate demo financial data behind explicit opt-in.
- [ ] Ship logs to the chosen production backend and configure metrics/tracing/alerts.
- [ ] Move uploads/media to object storage before horizontal scaling.
