---
name: mobocom-contracts
description: Design, test, or evolve MoboCom API/event contracts for public APIs, mobile/desktop apps, future Messenger, independent services, integrations or extension APIs. Use for OpenAPI, Hurl, Spectral, oasdiff, Pact, versioning, deprecation and consumer compatibility.
---

# Contract workflow

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
