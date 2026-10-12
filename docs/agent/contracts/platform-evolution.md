# Platform evolution contracts

Adopted 2026-10-10. These are target contracts; implementation evidence is in the [domain matrix](../DOMAIN_CAPABILITY_MATRIX.md). Existing owners remain authoritative. Do not rename storage or introduce new services merely to match these names.

## 1. Modules, packages and dynamic Admin

Existing owners: `src/platform/extensions/contracts.ts`, `src/extensions/server/state.ts`, `src/extensions/server/modules.ts`, `src/modules/packages/server`, `src/app/api/admin/extensions/navigation/route.ts`. Extend their contracts and registrations.

Target lifecycle:

```text
DISCOVERED → PACKAGE_VALIDATED → INSTALLED → INACTIVE
INACTIVE → ACTIVATING → ACTIVE → DEACTIVATING → INACTIVE
INACTIVE → UNINSTALLING → UNINSTALLED
```

Installation does not activate. Migration/dependency failure leaves an inactive or explicitly failed operational record with retry/recovery information. A lifecycle operation has an operation ID, expected state/version claim, actor, audit, steps and compensation; external effects are not assumed transactional. Repeated requests are idempotent. Protect mandatory Core and refuse disabling a required dependency while dependents remain active. Maintenance is the existing section availability policy, separate from installation state.

Activation validates manifest/schema/version ranges/dependencies/permission collisions and trusted runtime availability before publishing contributions. Register Admin navigation, pages, settings, widgets, permission definitions, contextual actions, editor blocks, event handlers, jobs, automation actions, import/export providers, analytics and theme options through typed host contracts with real consumers. Names are extension-scoped, versioned and validated. Admin pages use registered host rendering boundaries; uploaded TypeScript cannot create Next.js routes dynamically.

Deactivation atomically withdraws effective contributions where possible, invalidates caches and rejects direct server entry points. Cancel queued work or reconcile it to a documented state; do not strand money operations. In-flight jobs recheck effective state before effects. Keep a Core-owned reactivation/recovery path. Unknown/disabled editor blocks remain stored. Uninstall removes code/registrations, keeps data by default; purge requires a separate explicit privileged request and retention/dependency review.

Runtime trust modes:

- Declarative packages: validated host registries, sanitized presentation and bounded data; no arbitrary privileged JavaScript.
- Trusted code: review, compatibility validation, ordinary build/migration/restart/deployment; narrow installation permissions and audit.
- Untrusted code: an actual isolated process/service boundary with resource/network/secret limits; an SDK interface is not a sandbox.

Acceptance: repeated activation, concurrent operations, partial failure, dependency cycles, disable during queued work, direct hidden-route calls, Core with all optional modules off, uninstall retaining records, authorized explicit purge and rollback with preserved data.

## 2. Independent module themes

Existing owners: `src/themes/types.ts`, `src/themes/runtime.ts`, `src/modules/site/config/types.ts`, package theme loading. Current global theme selection is not evidence of implemented per-module assignment.

Extend the current theme registry with versioned module presentation slots and typed assignments. Resolve assigned module theme → global site theme → Core theme, validating compatibility at every step. Layer tokens/options as defaults → global → module → variant → validated page override. Keep public, Admin, editor and shared component scopes explicit; public theme changes cannot replace privileged Admin UI or permissions. Scope CSS and tokens to the owning module so one assignment cannot leak into other modules. Business rules, queries and authorization remain in module/platform owners. Theme preview is reversible and cannot silently change production assignments.

Acceptance: two modules with different themes, missing/incompatible assignment fallback, light/dark, nested shared components, mobile/RTL, CSS isolation, no server privilege escalation, disable/uninstall fallback and unchanged protected visual baselines. Follow [frontend quality](../FRONTEND_QUALITY.md).

## 3. Canonical identity, groups and authorization

Existing owners: `src/modules/identity/server/access.ts`, `rbac.ts`, `domain/sections.ts`, `server/staff-guard.ts`; forum groups/category policies in `src/modules/forum/{domain,server}/community.ts`. A forum group is not a global administrator role. CRM Contact, paid membership, social block and account restriction are distinct concepts.

Extend the single canonical UserId and existing AuthZ boundary. Target platform memberships include primary, secondary and temporary groups, explicit validity/priority, badges and auditable promotion/demotion rules. Account standing, administrative role, group, capability, entitlement, subscription, resource ownership and restriction remain separate. Promotions use stored metrics/events with expiry and reproducible recount; never reset history. A group can provide scoped capabilities but cannot manufacture global staff standing.

Target decision order: identity → account standing → global restrictions → effective memberships → module restrictions → resource scope/ownership/state → capability decision. Explicit denies outrank ordinary grants; privileged actions default deny. Resolve membership expiry at decision time, not only through a scheduled cleanup. Privileged recovery/break-glass is a separately authorized, audited, narrowly scoped path; never an implicit ADMIN bypass of every denial.

Compatibility: preserve section permission keys, routes, section-manager delegation, forum `inCategory` moderation and current full-access staff semantics. `cms.posts` remains Magazine only. Introduce fine-grained rules behind the same guards through expand/backfill/compare/switch, with equivalence tests for current roles before enforcement. Use the existing staff guard for coupled role/standing changes. UI capability hints do not authorize writes.

Acceptance: existing section-only staff accounts, full-access account without role, scoped forum moderators, primary/secondary conflicts, explicit deny, expiry, temporary promotion reversal, canonical identity across modules and protected staff changes. No second AuthZ resolver.

## 4. Scoped restrictions and moderation

Current forum `silencedUntil` / `suspendedUntil` and shared moderation provide a foundation; they are not a complete cross-platform restriction model. Extend identity/AuthZ and moderation, not a separate banning system in each module.

Target restriction records: canonical subject UserId, scope (`GLOBAL`, `MODULE`, `RESOURCE`, `CAPABILITY`), typed target, denied capabilities, reason, issuer, start/expiry, revocation actor/time/reason and immutable audit reference. Multiple restrictions coexist independently; revoking one cannot remove another. Warning points, expiry, appeals and automated escalation belong to moderation with typed Admin settings, protected staff rules and bounded automation.

Forum-only sanctions must not disable authentication, Music or Store. Global account restrictions deny new sessions/tokens and are checked for existing sessions, API tokens, upload/download, contextual actions, real-time and background entry points that act for the user. Document bounded cache consistency and revoke/invalidate relevant authorization caches. Public anonymous browsing is governed separately: logout cannot identify an anonymous visitor reliably. Support/refund/account-recovery exceptions are explicit capabilities, never a general ban bypass. A forum moderator cannot impose a global ban or alter protected staff.

Backfill legacy sanctions without dropping reason/history or expanding their scope; if legacy provenance is unavailable, preserve that uncertainty. Use additive tables/columns in both Prisma schemas, constraints/indexes, release-manifest registration and reversible rollout. Expiry and revocation apply immediately to decisions even when cleanup jobs lag.

Acceptance: overlapping scopes, expiry/revocation, invalid targets, escalation permissions, direct APIs, stale sessions/tokens, background jobs, concurrent sanction changes, forum-only access isolation, controlled recovery exceptions and legacy backfill.

## 5. Contextual public administration

Existing `src/components/admin/ManageBar.tsx` links to owning Admin editors; forum has inline moderation. Extend these consumers through the existing extension/Admin registry rather than building a parallel mutation system.

Target contextual action definition: namespaced ID/version, owner, typed resource reference, placement, required capability/resource scope, input schema, confirmation policy, host presentation and owning server handler. Contextual UI uses capability hints, but every action reloads the resource and applies canonical guards, module state, restrictions and concurrency preconditions on the server. Mutating API calls retain Origin enforcement. Record actor/action/resource/outcome; distinguish forbidden, invalid, stale and unavailable results without leaking hidden records.

Use a drawer for bounded edits and the existing fullscreen editor for complex work. Financial/refund/fulfilment actions stay in their authorized, idempotent state machines; a quick-action surface cannot bypass confirmation, state claims or audit. Hidden actions are never the security boundary.

Acceptance: section manager, ordinary visitor, resource owner, wrong-section staff, stale capability cache, disabled module, direct handler call, duplicate financial request and keyboard/focus/mobile behavior.

## 6. Domain contracts and shared services

Benchmarks guide capability requirements, not proprietary implementation copying or parity claims. Community/Invision, Store/WooCommerce and professional editorial/media workflows are domain targets. No WordPress backend; Gutenberg and Tiptap remain adapters to the canonical MoboCom document. Preserve unknown blocks, revisions, legacy content and explicit first-conversion acceptance; no silent truncation of invalid or oversized documents. Blocks/patterns/templates/reusable content use registry definitions and versioned migrations, not engine output.

Magazine targets draft → review → changes requested / approved → scheduled → published → archived with explicit transition permissions, revision/SEO continuity and scheduler idempotency. Preserve existing publication values until a compatible transition migration is approved. Music retains artists/albums/releases/tracks/playlists and adds complete credits/labels/lyrics/languages/quality assets through existing owners. Cinema retains film/season/episode/people/link/watch-history ownership. Games retains platform/developer/publisher/releases and adds editions, patches/DLC and structured requirements. Software preserves historical versions/builds/channels/compatibility and extends checksums/mirrors/licenses/security advisories. Store extends existing catalog/orders/billing/wallet/fulfilment/returns: minor units, database constraints, inventory claims/reservations and idempotent payment/refund callbacks remain mandatory.

Shared Media, Settings, Search, Notifications, Engagement, Moderation, Jobs, Audit, identity and analytics stay singular. Cross-domain relations use typed owned references/contracts, not direct foreign-domain writes. Search and cached aggregates respect publication, permission, restriction and module state. Analytics need purpose, consent where relevant, retention and bounded aggregation; no fake dashboard values.

Import/export uses existing import/job/provider owners: CSV/XLSX/JSON preview → map → validate/dry run → idempotent job → per-row report, with authorization, cancellation/retry and partial-failure recovery. Automation is typed triggers/conditions/actions with limits, audit and Admin configuration; no arbitrary executable rule text. Settings are namespaced, typed and secret-aware in the existing Admin Control Plane.

Public APIs/events are versioned, backward-compatible contracts for web/mobile/desktop/Messenger and plugins; private Prisma/React internals are not client contracts. Deployment remains a modular monolith until measured requirements justify extraction. Database and financial state transitions use expected-version/state claims and transaction boundaries. New states require widened constraints and incremental migrations, parity across PostgreSQL/SQLite, release manifest, backfill, backup/restore and rollback evidence.

Detailed domain gaps, dependencies, priorities and acceptance are in the [matrix](../DOMAIN_CAPABILITY_MATRIX.md) and [roadmap](../IMPLEMENTATION_ROADMAP.md). Future coverage must include each domain's models, public/Admin UX, groups, permissions, restrictions, workflows, themes, plugins, lifecycle, registry, contextual actions, blocks, bulk operations, import/export, automation, search, analytics, security, tests and deployment. Source inspection alone does not certify these behaviors.
