# MoboCom Reference Architecture v4

This document defines architectural invariants and extension boundaries. It is a target dependency model, not an instruction to rename every directory.

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
│ CMS | CRM | Music | Cinema | Games | Community | Store | Support | Hosting ... │
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

## 6. Module lifecycle

State model:

```text
not-installed → installed/disabled → enabled
                            ↘ maintenance (optional)
```

Disable:
- preserve data/schema;
- deactivate routes/nav/jobs/indexing/handlers as appropriate;
- keep dependency graph consistent;
- keep admin reactivation path.

Uninstall:
- separate from disable;
- remove runtime package/registration;
- retain data by default;
- explicit data purge is a distinct privileged operation.

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

A theme controls presentation; modules own business behavior.

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

Secrets are not normal settings.

## 15. Authorization

Use a policy composed from relevant dimensions:

```text
permission + ownership + resource state + category policy + entitlement
```

Do not spread raw role-name checks through UI/server code.

Plugin-defined permissions must be namespaced and registered.

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
