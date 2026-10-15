# MoboCom Reference Architecture — mandate adoption 2026-10-10

This is the canonical architecture, extended from v4 against the current repository. It defines invariants and target contracts, not an instruction to rename directories or a claim that all capabilities are implemented.

Read root instructions → [owner decisions](PLATFORM_DECISIONS.md) → relevant sections here → [focused evolution contracts](contracts/platform-evolution.md). Consult the [domain matrix](DOMAIN_CAPABILITY_MATRIX.md) and [roadmap](IMPLEMENTATION_ROADMAP.md) for actual evidence and next slices. Frontend work follows [SDS + React Doctor + browser quality](FRONTEND_QUALITY.md). [Adoption ADR](adr/2026-10-10-platform-mandate.md) records reconciliation; the exact owner attachment is archived once under `requirements/`. Do not load the whole mandate for routine tasks.

Protected public visuals: Homepage, Magazine, Music, Cinema (Movies/TV Series), Games, Software, Store and Community. Preserve URLs, SEO, data, permission keys and established workflows. Admin is also a first-class product. Software joins the target domains; CRM remains integrated, while VPN/reseller/marketplace stay off-focus and switchable.

## Forms, held work and platform safety

Automation (`src/modules/automation`, permission `automation.manage`) is the one owner of rules that run by themselves; other modules announce events with `emitAutomation` and the engine changes their data only through their own owners (handoff: Automation section of `docs/agent/handoffs/FORMS_AND_OPERATIONS.md`).

The form builder (`src/modules/forms`) is the one owner of forms, their answers, paid forms and appointments; it charges through the site's checkout and never beside it. Read `docs/agent/handoffs/FORMS_AND_OPERATIONS.md` before touching forms, staff queues, ticket ownership, SMS limits or sign-in limits.

<!-- mobocom-business-architecture:start -->
## Business experiences — canonical ownership

The optional **businesses** module composes existing platform services for external businesses, existing internal sellers and MoboCom's own store. It requires **reviews**, defaults OFF, has its own **businesses.manage** permission and uses canonical section managers, maintenance and Admin Control Plane. Seller profiles do not implicitly activate Marketplace.

- **BusinessProfile** owns profile metadata and stable kind/slug/domain/SellerId; identity bindings are immutable after creation. Representatives use the canonical UserId and explicit reviewed assignment, never a claimed email/domain alone.
- **BusinessRequest** owns moderated SUGGESTION/CLAIM intake, canonical requester/reviewer UserId and private decision history; it is not another review or identity system. Approval is current `businesses.manage`, serializable status claim + strict audit. A representative cannot approve their own claim; domain/email input never grants authority. `allow-suggestions` / `allow-claims` use existing module settings.
- EXTERNAL and SITE use original ItemReview/Score/Helpful/Stat; SELLER uses original SellerReview, delivered-order eligibility and reply owner. Never copy historical seller reviews into ItemReview or add another review/account/scoring system.
- Public business scores count APPROVED only; preserve legacy content rating behavior. An identical repeat retains approval/reply/helpful history; real rating/body/date/dimension changes re-enter the configured review process.
- External self-reporting never proves purchase. SITE evidence comes from the member's own paid/delivered Order; SELLER requires that member's paid/delivered order containing the bound SellerId. Representatives reply only; they cannot moderate customer experiences.
- A waiting business experience is decided only on /admin/businesses. The general review queue and its badge leave business out (one filter in the reviews owner); the staff overview has its own source **business-experiences** (module businesses, businesses.manage) that reads the owner's waitingForModeration and links there, without yes/no buttons.
- Public module address: src/modules/businesses/server/businesses.ts. Routes: /businesses, /businesses/[slug], private /businesses/activity, /admin/businesses, /api/businesses and /api/admin/businesses; helpful votes retain the existing engagement API. Generic review creation/moderation cannot bypass business policy.
- Additive migrations **20261223120000_business_experiences** and **20270102120000_business_requests** is in the release manifest. Preserve both Prisma schemas, existing reviews/orders and protected public designs; use shared SiteHeader/SiteFooter and SDS/MoboCom tokens.

Implementation maturity, executed evidence, current source checkout and remaining slices are recorded once in [Business experiences handoff](handoffs/BUSINESS_EXPERIENCES.md). The feature is PARTIAL, not a production-readiness claim. Read that document before coding; a checkout without these files does not prove the capability is missing.
<!-- mobocom-business-architecture:end -->

## 1. High-level architecture

```text
Clients
├─ Public Web
├─ Admin Web
├─ Future Web Apps
├─ Future Mobile Apps
└─ External Integrations
        │
        ▼
Application/API Boundary
├─ Web/BFF routes
├─ Versioned Public/Mobile API
├─ Realtime Gateway abstraction
└─ Webhooks
        │
        ▼
┌──────────────────────────── MoboCom Modular Monolith ────────────────────────────┐
│                                                                                 │
│ Specialist Modules                                                             │
│ CMS/Magazine | CRM | Music | Cinema | Games | Software | Community | Store ... │
│                                                                                 │
├──────────────────────────── Platform Services ───────────────────────────────────┤
│ Identity | AuthZ | Settings | Modules | Extensions | Themes | Flags | Entities  │
│ Events | Outbox | Jobs | Search | Notify | Media | Moderation | Audit | SEO      │
│ Analytics | i18n | Entitlements | Billing contracts | Observability             │
├──────────────────────────── Infrastructure Adapters ──────────────────────────────┤
│ DB | Cache | Queue | Storage | Email | Push | Search | Payments | AI | Hosting  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Default: one deployable application with hard internal boundaries.

## 2. Dependency direction

Conceptually:

```text
Presentation → Application → Domain
                    │
                    ▼
            Ports / Contracts
                    ▲
                    │
             Infrastructure
```

Allowed:

```text
Specialist Module → Platform public contract
Specialist Module → external provider through a port
Module A → Module B public integration contract (sparingly)
Module A → domain event → Module B handler
```

Disallowed:

```text
Module A → Module B private repository/table implementation
Theme → business repository
Plugin → arbitrary private internals
Core → optional module at boot time
```


## 2A. Machine-enforced architecture

Architecture rules are not only documentation. Important boundaries should be enforced automatically.

Use:

- TypeScript strictness for type contracts;
- dependency-cruiser / existing `arch:check` for dependency direction and cycles;
- Opengrep custom rules for prohibited code/security patterns;
- oasdiff for public API compatibility;
- Pact for independent consumer/provider contracts;
- tests for module lifecycle, identity and extension compatibility.

Initial architecture rules may start as warnings if legacy code already violates them. Tighten to errors after the canonical path is established. Do not make CI permanently red because of historical debt unrelated to the current change.

## 3. Core does not depend on optional modules

Platform Core must boot with optional modules disabled.

Core may know generic extension contracts. It must not import an optional product module merely to start.

## 4. Registries

Prefer small validated registries over giant switch statements.

Potential registries:

- ModuleRegistry
- ExtensionRegistry
- ThemeRegistry
- SettingsRegistry
- PermissionRegistry
- FeatureFlagRegistry
- SearchProviderRegistry
- NotificationRegistry
- EntityResolverRegistry
- AdminNavigationRegistry
- ProviderRegistry

At startup or activation, validate:

- duplicate IDs;
- dependency cycles;
- missing required capabilities;
- invalid version ranges;
- invalid settings schemas;
- permission collisions;
- invalid extension slots.

## 5. Module manifest

Conceptual example only:

```ts
interface ModuleManifest {
  id: string;
  version: string;
  platform: string;              // compatible platform range
  requires?: string[];
  optional?: string[];
  permissions?: string[];
  settings?: SettingSchema[];
  capabilities?: string[];
}
```

Do not add manifest fields with no real consumer.

## 6. Module lifecycle and Admin contributions

Target: DISCOVERED → PACKAGE_VALIDATED → INSTALLED → INACTIVE → ACTIVATING → ACTIVE → DEACTIVATING → INACTIVE; only inactive packages uninstall. Installation and activation are separate; current uploaded packages already default to inactive. Extend existing packages/effective extension state with claimed operation IDs, idempotency, compatibility/dependency validation, failure/recovery records and compensation. Maintenance remains a separate section policy.

Activation registers validated typed contributions through the current host registry: navigation/pages/settings/widgets/permissions/context actions/blocks/events/jobs/import-export/automation/analytics/theme options. Only add fields with real consumers. Deactivation withdraws effective UI and server access, invalidates caches and reconciles jobs/handlers without losing data or stranding money. Core keeps the recovery path; protect mandatory dependencies. Uninstall removes runtime registrations/code; purge is a separate explicit privileged operation.

Declarative packages execute validated host capabilities. Trusted code requires review and ordinary build/migration/restart/deployment; uploaded TypeScript does not create Next routes dynamically. An interface is not a sandbox: untrusted executable extensions need actual isolation. See [contract §1](contracts/platform-evolution.md#1-modules-packages-and-dynamic-admin) for acceptance and security.

## 7. CMS architecture

Generic CMS capabilities belong to shared CMS domain rather than every specialist module:

```text
CMS
├─ Page
├─ Navigation/Menu
├─ Taxonomy
├─ Content Model Registry
├─ Custom Fields
├─ Revision
├─ Editorial Workflow
├─ Page/Block Builder
├─ Forms
├─ Redirects
└─ SEO integration
```

Specialist modules keep typed canonical domain entities.

A generic Article may be CMS/Publishing. A Movie is Cinema, not a generic custom-content row unless product architecture explicitly chooses otherwise.

Pages and magazine articles use the canonical editor document and revision services. A legacy conversion stays a preview through edits until its explicit first save; omitted parts must be disclosed before acceptance, and autosave resumes only after success. Direction precedence belongs to the editor domain (`resolveTextDirection`), shared by the editing view and public renderer: paragraph choice → block choice → first Unicode letter → page default. See [editor architecture](../editor/ARCHITECTURE.md) for the storage contract and regression checks.

## 8. CRM architecture

```text
CRM
├─ Contact
├─ Organization
├─ Lead
├─ Deal/Opportunity
├─ Pipeline/Stage
├─ Activity
├─ Task
├─ Note
├─ Segment
├─ Custom Fields
├─ Assignment
├─ Consent/Preferences
└─ Timeline references
```

Identity link:

```text
User Account 0..1 ───── 0..1 Contact link
```

Do not merge auth identity and CRM contact lifecycle by accident.


## 9A. Unified Identity & Social Platform invariant — critical

MoboCom has exactly **one canonical human account identity** across the entire platform and all future first-party clients.

```text
Canonical MoboCom Identity
├─ UserId (stable platform identifier)
├─ Authentication / credentials
├─ Sessions
├─ Devices
├─ MFA / recovery
├─ Account status
├─ Privacy/security policy
└─ Profile reference
        │
        ├─ CMS / Magazine
        ├─ CRM link
        ├─ Music
        ├─ Cinema
        ├─ Games
        ├─ Community
        ├─ Store
        ├─ Support
        ├─ Hosting
        ├─ AI
        └─ Future Messenger / Mobile / Desktop apps
```

Never introduce parallel account identities such as `MessengerUser`, `ForumUser`, `MusicUser` or `StoreUser` as independent login/account records.

Domain-specific profile/settings records are allowed and should reference the canonical `UserId`, for example:

```text
ArtistProfile.userId
SellerProfile.userId
CommunityMemberSettings.userId
MessengerPreferences.userId
```

### Identity vs CRM

CRM `Contact` is not the authentication identity.

- A Contact may exist without a registered account.
- A User may exist without a CRM Contact.
- When linked, CRM stores an explicit stable reference to canonical `UserId`.
- CRM lifecycle, consent and sales state must not mutate authentication identity by accident.

### Social graph and safety

Platform-level social primitives should use canonical `UserId` where semantics match:

- follow relationships;
- block/mute policies;
- profile visibility;
- notification preferences;
- device/session management.

Do not force distinct concepts into one table merely because they reference users. `Follow`, `Block`, `Contact`, `ConversationMember` and `Entitlement` remain separate domain concepts.

### Messenger future-proofing

Messenger must consume the same identity rather than create accounts.

Messenger may own:

- conversations/channels;
- memberships;
- messages;
- reactions/replies;
- read/delivery receipts;
- typing/presence;
- messenger-specific preferences;
- call state later.

But all human membership references point to canonical MoboCom `UserId`.

Identity APIs/events are long-lived compatibility surfaces because web apps, mobile apps, Messenger and plugins may depend on them.

Disabling or uninstalling an optional module must never delete the canonical account.

## 9. Entity ownership and references

One mutable concept has one canonical owner.

Examples:

```text
Identity    User/Profile
CMS         Page/ContentType/Taxonomy
CRM         Contact/Deal/Pipeline
Music       Artist/Album/Track/Playlist
Cinema      Movie/Series/Season/Episode/Person
Games       Game/Edition/Platform
Community   Forum/Topic/Post/Club
Commerce    Product/Variant/Cart/Order/Fulfillment
Events      Event/RSVP
Media       Asset
```

Other modules reference by explicit typed relations for high-value paths or a stable entity-reference abstraction for generic cross-module features.

Transaction snapshots are legitimate copies when immutability is required (e.g. order line title/price at purchase time).

## 10. Extension architecture

Three extension levels:

```text
Platform Plugin
  └─ can target platform capabilities and multiple modules

Module Plugin
  └─ targets declared extension points of one/few modules

Provider Adapter
  └─ implements payment, email, AI, hosting, storage, etc. port
```

Extension code should compile against **public extension contracts**, not filesystem-private implementation.

### Extension API version

Maintain an extension API compatibility version independent from marketing/app version when useful.

Example:

```text
Platform 2.4.0
Extension API 2
Plugin requires Extension API >=2 <3
```

This avoids breaking all plugins for every product release.

## 11. UI extension slots

Use explicit slots rather than DOM monkey-patching.

Examples:

```text
admin.sidebar
admin.dashboard.widget
music.track.actions
music.artist.sidebar
cinema.title.actions
community.topic.actions
store.product.after-summary
crm.contact.sidebar
```

Slots need typed props/contracts and permission awareness.

Avoid hundreds of unstable slots. Add extension points where real use-cases exist.

## 12. Theme architecture

```text
Semantic Tokens
      ↓
Primitives
      ↓
Compositions
      ↓
Domain Components
      ↓
Layouts / Pages
```

Theme resolution:

```text
module/section assigned theme
    ↓ fallback
site default theme
    ↓ fallback
core/base theme
```

A theme controls presentation; modules own business behavior. Current runtime resolves a global theme; independent module assignments are a target, not an implemented fact. Extend the same registry with compatible module slots, typed Admin assignments, CSS isolation and layers defaults → global → module → variant → validated page override. Keep public/Admin/editor/shared scopes separate and test fallback/rollback. See [contract §2](contracts/platform-evolution.md#2-independent-module-themes) and [frontend quality](FRONTEND_QUALITY.md).

Theme overrides should use documented layout/component boundaries. Pure visual themes should not execute privileged server code.

## 13. Solution Packs

A Solution Pack is configuration, not a fork:

```text
SolutionPack
├─ enabled modules
├─ recommended extensions
├─ theme assignments
├─ settings defaults
├─ role defaults
├─ navigation preset
└─ starter content/templates
```

This is how MoboCom adapts to many business types while remaining one product.

## 14. Settings architecture

Typed settings are registered by owner.

Potential resolution:

```text
resource override (rare)
   ↓
role/group or section override
   ↓
module setting
   ↓
global setting
   ↓
registered default
```

Cache resolved settings if needed, with deterministic invalidation.

Maintenance is one existing Setting (`site.maintenance.v1`), not one switch system per section. A partial change claims the exact stored value and re-reads/re-merges after conflict, including concurrent first creation. Writes never use cached or error-fallback reads. Connected check `section-maintenance` proves preservation of different sections and separate fields of one section; no schema change is needed.

Secrets are not normal settings.

## 15. Authorization

Use a policy composed from relevant dimensions:

```text
permission + ownership + resource state + category policy + entitlement
```

Do not spread raw role-name checks through UI/server code.

Plugin-defined permissions must be namespaced and registered.

Extend the canonical Identity/AuthZ guards; do not add a second resolver. Target order: identity → account standing → global restrictions → effective groups → module restrictions → resource scope/ownership/state → capability. Explicit denies outrank ordinary grants; privileged actions default deny. Primary/secondary/temporary groups, roles, entitlements and subscriptions are distinct. Preserve current section keys, staff guard/full-access compatibility and forum `inCategory` scope; a group cannot grant global staff standing.

Restrictions are independently auditable GLOBAL/MODULE/RESOURCE/CAPABILITY records with start/expiry and revocation. Forum-only sanctions preserve unrelated module access and authentication. Global restrictions apply to sessions/tokens and all user-acting entry points, with bounded cache invalidation and narrow recovery exceptions. Anonymous browsing is a separate policy. Additive backfill must preserve legacy sanction scope/history. See [contracts §3–4](contracts/platform-evolution.md#3-canonical-identity-groups-and-authorization).

### Held work and a section's own staff

Work that a member of staff holds — a form answer (`FormSubmission.assigneeId`), a ticket (`Ticket.assignedToId`) — is read by colleagues who may open that form or department and changed only by its holder or a manager of that section (`cms.pages`, `tickets.departments.manage`). Taking unheld work is open to those who may open it; handing work to somebody else is a manager's act. A form may name its handlers (`settings.handlers`), a department its roles. New kinds of handled work (store orders, moderation queues) follow the same shape: a holder column, a guard that runs before every change, a manager permission that already exists for that section. Owners and tests: `docs/agent/handoffs/FORMS_AND_OPERATIONS.md`.

## 16. Events and transactional outbox

Domain events represent facts:

Good:
- `order.completed`
- `crm.lead.created`
- `music.track.liked`
- `forum.topic.created`

Avoid command-like global events such as `doEverything`.

For critical async integration after a DB transaction, use a transactional outbox pattern when current infrastructure supports it or when reliability justifies adding it.

Handlers must be idempotent if retries are possible.

## 17. Jobs

Heavy/retryable work belongs in jobs:

- email/push
- media processing
- indexing
- imports/exports
- provider synchronization
- analytics aggregation
- bulk CRM automation
- notification fan-out

Important jobs need:

- stable payload schema;
- retry/backoff policy;
- idempotency;
- failure visibility;
- cancellation semantics where meaningful.

## 18. Search

One facade, multiple domain providers:

```text
Search
├─ CMS provider
├─ CRM provider (admin/authorized scopes only)
├─ Music provider
├─ Cinema provider
├─ Games provider
├─ Community provider
└─ Commerce provider
```

Search results must honor visibility/permissions.

CRM/customer data must never leak into public universal search.

## 19. Notifications

One notification infrastructure with domain definitions.

Channels may include:
- in-app
- email
- web push
- future mobile push

Messenger real-time delivery is not the same as long-lived notification persistence, though they may integrate.

## 20. Future Messenger extraction path

Initial architectural seam:

```text
Web/Mobile
   ↓
Messaging API / Realtime Gateway
   ↓
Messaging Application Services
   ↓
Messaging Domain
   ↓
Persistence + Media + Event/Outbox
```

Shared via contracts:
- Identity/user ids
- block/mute policies
- media refs
- notification events
- moderation/report refs

If later extracted as a service, preserve API/event contracts and move persistence/runtime behind them.

## 21. Public API / Apps

Browser UI may use internal application routes initially, but future app-facing APIs require explicit versioning and compatibility.

Never make a mobile app depend on direct DB schema or internal React/server module structure.


## 21A. Contract architecture — APIs, apps, Messenger and extensions

MoboCom must treat externally consumed contracts as versioned product surfaces.

Contract layers:

```text
Domain/Application contracts
        ↓
Versioned HTTP/OpenAPI contracts
        ↓
Consumer contracts (Pact where useful)
        ↓
Web / Mobile / Messenger / external integrations
```

Rules:

- OpenAPI (or an equivalent machine-readable contract) is required for real public/mobile APIs.
- Lint API definitions before release.
- Detect breaking OpenAPI changes in CI.
- Use Pact consumer/provider contracts for independent consumers or event-driven boundaries where consumer expectations matter.
- Pact is not required for every internal function call inside the modular monolith.
- Contract tests should describe only fields/behaviors the consumer truly relies on; avoid brittle exact-response matching.
- Event schemas used by future Messenger/services/plugins need explicit versioning or backward-compatible evolution.
- Never make apps/plugins depend directly on database schema or private module imports.

Recommended ownership:

```text
Internal same-process module boundary
→ TypeScript types + architecture tests + integration tests

Public/mobile HTTP API
→ OpenAPI + Spectral + oasdiff + Hurl

Independent client/service expectation
→ Pact + provider verification

Event/message contract
→ typed/versioned schema + Pact message contract when valuable
```

## 22. Update architecture

Safe schema evolution:

```text
Release N: expand schema + compatible code
Background: backfill
Release N+1: switch fully
Release N+2: contract obsolete schema after confidence window
```

Plugin/module/theme compatibility is checked before activation/update.

Update center should distinguish:

- package downloaded
- compatibility verified
- backup verified
- migration pending/running/failed
- app health
- rollback/disable options

## 23. Observability

Track real operational signals for:

- app health
- database
- queues/jobs
- scheduler
- webhook delivery
- search indexing
- provider adapters
- storage
- update/migration state
- module/plugin health

Do not expose secrets in logs/status payloads.

## 24. Data deletion rules

Differentiate:

- disable feature/module;
- uninstall runtime extension;
- archive domain data;
- purge data;
- user privacy deletion/anonymization.

These are not the same operation.

## 25. Future multi-tenancy

Do not add tenant IDs to every table merely because MoboCom serves many businesses as separate deployments.

If SaaS multi-tenancy becomes a real requirement, design it explicitly with isolation, authorization and migration strategy. Keep current architecture from making future tenancy impossible, but do not pay its complexity without a product requirement.

## 26. Contextual administration and domain excellence

Extend existing ManageBar/inline moderation through typed contextual contributions delegated to owning Admin handlers. Hidden buttons never authorize: reload target, validate input, check canonical resource permissions/restrictions/module state, claim concurrency and audit on the server. Quick edits use host drawers; complex editing stays fullscreen; financial state transitions keep their protected workflow. See [contract §5](contracts/platform-evolution.md#5-contextual-public-administration).

Community/Invision, Store/WooCommerce and professional Magazine/Music/Cinema/Games/Software are capability benchmarks, not parity claims or implementation copies. Reuse typed entities, canonical editor documents and shared services; import/automation/analytics are bounded, audited, privacy-aware and configurable through the existing Admin Control Plane. Use typed cross-module references and versioned public API/event contracts for future apps. See [contract §6](contracts/platform-evolution.md#6-domain-contracts-and-shared-services) and the [matrix](DOMAIN_CAPABILITY_MATRIX.md).

## 27. Evidence and delivery

Engineering tools follow the [scoped devstack](DEVSTACK.md): pinned agent documentation/browser MCPs, reusable semantic tooling and the offline incremental Graphify source graph for relationship discovery (confirmed with Serena and existing tests), local security/secret scans and reviewed graph/dead-code baselines. This extends current MoboCom skills and gates; it creates no new runtime service, specification tree or agent orchestrator.

Architecture/skill adoption is documentation completion only. Maturity progresses through Missing, Planned, Foundation, PartiallyImplemented, Functional, ProductionVerified, Advanced and ReferenceClassEquivalent with named evidence; unassessed is not missing. Keep the existing ledger's finding labels separate from maturity. Audit then implement safe vertical slices with relevant actual tests; no new platform owner without an inspected gap. Preserve PostgreSQL/SQLite parity, release-manifest migrations, state claims, old APIs/URLs/data and realistic rollback. PRs target main; owner merges/deploys. [Roadmap](IMPLEMENTATION_ROADMAP.md) prioritizes launch essentials and foundation reuse before advanced breadth.
