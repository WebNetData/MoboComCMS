# ADR 0001 — Modular monolith before microservices

- Status: Accepted
- Date: 2026-09-20

## Context

HappVPN contains identity, catalog, billing, wallet, provisioning, reseller, support, CMS, integrations and public APIs in one Next.js application. Most business logic currently lives in `src/lib`, and several delivery-layer pages/routes query Prisma directly. The product also needs a stable plugin/theme API.

## Decision

Use a **modular monolith** with strict internal boundaries. Keep one deployable application while separating each business capability into domain/application/infrastructure/server/UI layers. `src/app` remains a delivery/composition layer, not a business-logic layer.

Microservices are deferred until a module has a demonstrated independent scaling, reliability, security or organizational requirement.

## Consequences

- Fast local development and simple transactions are preserved.
- Modules can later be extracted behind the same contracts.
- Cross-module calls must use public module APIs or events, not private infrastructure.
- Architecture checks prevent new direct DB coupling from the App Router.
