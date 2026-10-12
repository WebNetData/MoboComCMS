---
name: mobocom-extensions
description: Design or implement MoboCom modules, plugins, provider adapters, themes, per-module themes, module lifecycle, Solution Packs or extension APIs without forking or coupling the core.
---

# Extension workflow

1. Read extension + architecture + identity references as relevant.
2. Extend existing registries; do not create parallel registries.
3. Core boots with optional modules disabled.
4. Disable preserves data; uninstall and purge are separate.
5. Validate dependency/version/extension API compatibility before activation.
6. Plugins use public contracts/events/slots/providers, not private module/database internals.
7. Server plugins are trusted executable code; use narrow privileged install/update permissions + audit.
8. Themes contain presentation, not business rules, and resolve module theme → site theme → core fallback.
9. Solution Packs configure businesses; they do not fork MoboCom.
10. Any extension representing/acting as a human user references canonical MoboCom UserId.
11. Add lifecycle/compatibility tests and contract gates where external plugins rely on a stable API.

## This repository
- A plugin is `src/plugins/<id>/manifest.json`; run `npm run extensions:generate` after changing one. `requires` makes a module effectively off when what it needs is off.
- A plugin that adds a section declares **its own** permission and uses only that in its guards and admin menu. It never lists `cms.posts` unless it is the magazine (a unit test fails otherwise). To make the section delegable, add it to `SITE_SECTIONS` (`src/modules/identity/domain/sections.ts`); if its editors upload pictures, to `CONTENT_EDIT_PERMISSIONS`.
- Wrap admin APIs of an optional module with `whenModuleOn(id, handler)`; pages with `requireModule(id)`; compositions with `isModuleEnabled(id)`. Tell notifications which module an event belongs to (`notifications/domain/event-modules.ts`).
- VPN, reseller and marketplace are set aside by the owner: keep them working behind their switches, do not extend them unasked.
- The block editor is the plugin `block-editor` (on by default); off, the forms fall back to the old editor and documents are kept. A module adds block types with `registerModuleBlocks` (`src/modules/editor/server/documents.ts`); a block of a module that is off is kept in the document and shown as unsupported, never dropped.
- A plugin that adds a section with public pages adds it to `MAINTENANCE_SECTIONS` (`src/modules/site/domain/maintenance.ts`) so it can be put in maintenance by itself.

<!-- mobocom-business-skill:start -->
## Business experiences routing

When this workflow touches business/Trustpilot-style experiences, first read docs/agent/handoffs/BUSINESS_EXPERIENCES.md and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve its authoritative checkout; continue existing ItemReview versus SellerReview owners and recorded evidence. Missing files in another checkout do not justify a new system. Load only the pending slice; the handoff is the continuation source.
<!-- mobocom-business-skill:end -->
