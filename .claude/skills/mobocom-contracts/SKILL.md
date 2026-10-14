---
name: mobocom-contracts
description: Design, test, or evolve MoboCom API/event contracts for public APIs, mobile/desktop apps, future Messenger, independent services, integrations or extension APIs. Use for OpenAPI, Hurl, Spectral, oasdiff, Pact, versioning, deprecation and consumer compatibility.
---

# Contract workflow

Tooling: `docs/agent/DEVSTACK.md`. A Context7 query may clarify an installed-version library API; it cannot replace OpenAPI/provider/consumer compatibility evidence. Keep queries public and scoped; use the existing contract tools for the affected boundary.

1. Read `references/contracts.md` and `references/identity-contract.md`.
2. Identify consumers and whether they are same-process, public/mobile, or independently deployable.
3. Internal boundary: use typed contracts/integration tests; do not add Pact unnecessarily.
4. Public/mobile API: OpenAPI + Spectral + Hurl + oasdiff.
5. Independent consumer/provider or message contract: Pact with minimal consumer expectations.
6. Identity/session/profile/notification/media/entitlement/Messenger contracts receive extra compatibility scrutiny.
7. Prefer additive evolution and explicit deprecation.
8. Run provider verification and breaking-change checks when the relevant contract changes.
9. Never make clients depend on DB schema/private module internals.

## This repository
- Stable request shapes added outside the public API so far: `POST /api/admin/section-managers { email | userId, sections[] }`, `POST /api/admin/forum { section: 'team', action, username, categoryId? }`, `POST /api/forum/clubs`, `?edit=<id>` on the shared admin editors. They are same-process contracts: typed and covered by connected tests, no Pact.
- `AuthorView.rank` (`admin` | `deputy` | `moderator`) and `Viewer.moderates` are part of the forum's internal contract; a client must treat an unknown rank as none.
- A future app or Messenger reads standing from the same Identity and the same permissions (`docs/agent/PLATFORM_DECISIONS.md` §2–§4); do not mint a second notion of role for it.
- Added 2026-10-07 (same-process, typed, covered by checks): `GET/PUT /api/admin/editor/:entity/:id` with `entity` `pages` | `posts`, body `{ document, updatedAt }`, answers 409 `CHANGED`, 422 `DOCUMENT_INVALID` with `issues`, 404 `EDITOR_OFF`; `GET /api/admin/editor` `{ enabled }`; `GET/PUT /api/admin/maintenance` `{ section, enabled?, title?, message? }`. The document format is versioned (`version: 1`, each block its own `version`); a client keeps blocks it does not know and sends them back unchanged.
- A page of a section in maintenance answers 503 with `Retry-After`; a client treats it as "come back later", not as an error of its own.

## Platform mandate routing — 2026-10-10

Read current repository root instructions, then task-relevant sections of `docs/agent/ARCHITECTURE.md` and `PLATFORM_DECISIONS.md`. The canonical contracts, domain matrix and roadmap are linked there; read only the affected scope. If the repository is unavailable, use the fallback from `references/architecture.md` and do not infer current implementation from it.

Evolve manifest/contribution/action/theme and public API/event schemas additively and version them where consumed. Validate targets, capability scopes and disabled state on the owning server boundary. Cover old section roles and unknown fields/blocks, denial/expiry/revocation and repeat callbacks. Clients never depend on private storage; SDK typing does not sandbox executable plugins.

<!-- mobocom-business-skill:start -->
## Business experiences routing

When this workflow touches business/Trustpilot-style experiences, first read docs/agent/handoffs/BUSINESS_EXPERIENCES.md and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve its authoritative checkout; continue existing ItemReview versus SellerReview owners and recorded evidence. Missing files in another checkout do not justify a new system. Load only the pending slice; the handoff is the continuation source.
<!-- mobocom-business-skill:end -->

<!-- mobocom-forms-skill:start -->
## Forms, held work and safety routing

When this workflow touches forms, form payments, appointments, staff queues, ticket ownership, SMS sending, sign-in limits or automation rules, first read docs/agent/handoffs/FORMS_AND_OPERATIONS.md. Extend src/modules/forms; charge through the site checkout; keep the rule that work somebody holds is changed only by its holder or a manager of that section. The handoff lists what is still untested — run those before calling anything ready.
<!-- mobocom-forms-skill:end -->
