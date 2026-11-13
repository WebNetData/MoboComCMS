---
name: mobocom-extensions
description: Design or implement MoboCom modules, plugins, provider adapters, themes, per-module themes, module lifecycle, Solution Packs or extension APIs without forking or coupling the core.
model: sonnet
---

# Extension workflow

Read only what the task touches; open large docs at the named heading (Grep the heading, then Read with offset/limit), never whole.
- `docs/agent/ARCHITECTURE.md`: §3 Core does not depend on optional modules, §4 Registries, §5 Module manifest, §6 Module lifecycle, §10 Extension architecture, §11 UI extension slots, §12 Theme architecture, §13 Solution Packs; §9 Entity ownership when an extension acts as a user.
- `docs/agent/PLATFORM_DECISIONS.md`: §9 Platform mandate adoption, plus Grep for the module/plugin id. Never read it whole (~200 KB).
- `docs/agent/DEVSTACK.md`: only when running dependency-graph/Knip checks.

## Rules
1. Extend existing registries, state, packages, navigation and the global theme owner; never a parallel registry.
2. Core boots with every optional module off.
3. Install and activate are separate; validate dependency/version/extension-API compatibility before activation; operations are claimed, idempotent, with failure compensation.
4. Deactivate rejects direct access and reconciles queued work; disable and uninstall keep data; purge needs explicit authorization.
5. Plugins use public contracts/events/slots/providers only. Server plugins are trusted code (ordinary build/deploy, narrow install/update permission + audit); declarative packages use validated host contributions.
6. Themes are presentation only: module theme → site theme → core fallback, with CSS isolation.
7. Solution Packs configure businesses, never fork MoboCom. Anything acting as a user references the canonical UserId.
8. Follow canonical public addresses; review new import edges against the baseline; dynamic registries explain Knip candidates.
9. Add lifecycle/compatibility tests, and contract gates where external plugins rely on a stable API.

## This repository
- A plugin is `src/plugins/<id>/manifest.json`; run `npm run extensions:generate` after changing one. `requires` makes a module effectively off when what it needs is off.
- A plugin that adds a section declares **its own** permission and uses only that in its guards and admin menu. It never lists `cms.posts` unless it is the magazine (a unit test fails otherwise). To make the section delegable, add it to `SITE_SECTIONS` (`src/modules/identity/domain/sections.ts`); if its editors upload pictures, to `CONTENT_EDIT_PERMISSIONS`.
- Wrap admin APIs of an optional module with `whenModuleOn(id, handler)`; pages with `requireModule(id)`; compositions with `isModuleEnabled(id)`. Tell notifications which module an event belongs to (`notifications/domain/event-modules.ts`).
- In-person work is the module `instore` (owner 2026-11-13): new shop-desk, register, counter-return, shelf-label or service-intake screens go under its adminPaths/menu and its APIs call `moduleGuard('instore')`; a cashier holds `instore.sell`. The code stays with its owner (Store sales/stock/returns, Forms intake); do not move money logic into the plugin.
- VPN, reseller and marketplace are set aside by the owner: keep them working behind their switches, do not extend them unasked.
- The block editor is the plugin `block-editor` (on by default); off, the forms fall back to the old editor and documents are kept. A module adds block types with `registerModuleBlocks` (`src/modules/editor/server/documents.ts`); a block of a module that is off is kept in the document and shown as unsupported, never dropped.
- A plugin that adds a section with public pages adds it to `MAINTENANCE_SECTIONS` (`src/modules/site/domain/maintenance.ts`) so it can be put in maintenance by itself.

<!-- mobocom-business-skill:start -->
## Business experiences routing

When this workflow touches business/Trustpilot-style experiences, first read docs/agent/handoffs/BUSINESS_EXPERIENCES.md and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve its authoritative checkout; continue existing ItemReview versus SellerReview owners and recorded evidence. Missing files in another checkout do not justify a new system. Load only the pending slice; the handoff is the continuation source.
<!-- mobocom-business-skill:end -->

<!-- mobocom-forms-skill:start -->
## Forms, held work and safety routing

When this workflow touches forms, form payments, appointments, staff queues, ticket ownership, SMS sending, sign-in limits or automation rules, first read docs/agent/handoffs/FORMS_AND_OPERATIONS.md. Extend src/modules/forms; charge through the site checkout; keep the rule that work somebody holds is changed only by its holder or a manager of that section. The handoff lists what is still untested — run those before calling anything ready.
<!-- mobocom-forms-skill:end -->

<!-- mobocom-engineering-skills:start -->
## Supporting engineering skills

For supporting UI/design, React, accessibility, browser testing, documentation or MCP authoring, first read `docs/agent/ENGINEERING_SKILLS.md` in the active MoboCom checkout and load only its relevant task skill. Existing module owners, SDS/MoboCom tokens, protected visuals and actual local validation remain authoritative; generic upstream stack/aesthetic preferences are not architecture decisions.
<!-- mobocom-engineering-skills:end -->

<!-- mobocom-whole-site-quality-skill:start -->
## Whole-site quality routing

Read task-relevant sections of `docs/agent/WHOLE_SITE_QUALITY_STANDARD.md` under the current architecture/owner decisions. Use sections8/9 for declarative versus trusted-code boundaries, existing registries, validated contributions, lifecycle retention and fallback; requirement adoption is not runtime support.
The shared execution brief is for an explicit whole-site task; this routing does not start one.
<!-- mobocom-whole-site-quality-skill:end -->
