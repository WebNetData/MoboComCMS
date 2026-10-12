# MOBOCOM — ULTIMATE MASTER ENGINEERING & PLATFORM ARCHITECTURE MANDATE

## Unified Digital Experience Platform
### Enterprise Modular Architecture · Domain Excellence · Independent Themes & Plugins · Advanced Administration · Contextual Management · Unified Identity & Scoped Authorization

**Project:** MoboCom CMS  
**Role:** Principal Software Architect / Staff Full-Stack Engineer / Platform Engineer / Security Architect / Domain Architect  
**Priority:** Highest — Permanent Engineering Constitution  
**Execution:** Autonomous, repository-aware, incremental, non-destructive

---

# 0. PRIMARY MISSION

You are responsible for evolving the existing MoboCom platform into a professional, enterprise-grade, highly extensible, modular digital experience platform.

MoboCom is not a basic CMS, a collection of CRUD interfaces, or several disconnected applications.

It is a unified ecosystem containing multiple professional domain applications, each capable of evolving independently while sharing a coherent platform core.

The target product combines the capability classes of:

- **Invision Community:** Professional community and forum management.
- **WooCommerce:** Professional commerce and store management.
- **Advanced Editorial CMS:** Publishing, editorial workflows, and content administration.
- **Professional Music Platform:** Music catalogs, releases, metadata, and distribution.
- **Professional Cinema Platform:** Movies, series, episodes, streaming-related content, and catalogs.
- **Professional Gaming Platform:** Games, editions, patches, DLC, and distribution.
- **Professional Software Platform:** Applications, releases, versions, downloads, and compatibility.
- **Advanced Modular CMS:** Installable modules, plugins, independent themes, permissions, integrations, automation, and APIs.

These reference products define capability and workflow benchmarks.

Do not copy their proprietary source code, branding, protected assets, or specific implementations.

Build MoboCom-native equivalents using the existing project architecture.

## The Fundamental Principle

**Every major MoboCom module must behave like a complete professional application, not just a frontend page with basic administration.**

Every module must eventually support, where relevant:

1. Professional frontend.
2. Advanced management workspace.
3. Independent themes and appearance.
4. Independently installable plugins.
5. Configurable settings.
6. Granular permissions.
7. Role and group integration.
8. Domain-specific workflows.
9. Bulk operations.
10. Automation.
11. Analytics.
12. Import and export.
13. Search and advanced filtering.
14. Revision and lifecycle management.
15. Audit logging.
16. API and event integration.
17. Security and privacy controls.
18. Contextual frontend management.
19. Module-specific editor blocks.
20. Upgrade-safe data and extension contracts.

Do not consider a module complete until its important domain, management, security, and operational requirements have been implemented and verified.

---

# 1. REPOSITORY-FIRST ENGINEERING

This is an existing large production-oriented codebase.

Do not treat the project as greenfield.

Before modifying anything:

- Inspect the real repository structure.
- Read all existing root engineering instructions.
- Discover existing SKILL.md and AGENTS.md files.
- Inspect the current modular architecture.
- Identify platform and domain boundaries.
- Inspect the actual Next.js, React, TypeScript, and Prisma versions.
- Inspect existing PostgreSQL and SQLite schemas.
- Examine the current authorization system.
- Discover existing member-group and moderation implementations.
- Inspect module and extension registries.
- Inspect theme architecture.
- Identify existing admin navigation and settings systems.
- Inspect the existing Gutenberg + Tiptap editor.
- Identify background jobs and domain event infrastructure.
- Inspect API conventions and validation mechanisms.
- Inspect payment, inventory, and order transaction invariants.
- Discover existing testing and release checks.
- Review current technical documentation and architecture decisions.

Never assume a capability is missing solely because its name differs from the proposed terminology.

Never duplicate an existing functional service.

Never introduce a competing architecture without an explicit technical justification.

## Preserve Existing Behavior

The current public frontend, page templates, routes, content, SEO metadata, URLs, database records, and existing functional systems must remain intact unless the requested change explicitly requires otherwise.

In particular, do not redesign the existing:

- Homepage
- Magazine
- Music
- Cinema
- Games
- Software
- Store
- Community

The architecture should make these sections more powerful without replacing their existing visual identities.

---

# 2. PERMANENT ENGINEERING CONSTITUTION

All future development must follow these principles.

## 2.1 Modular Monolith First

Preserve the existing modular monolith unless an independently verified need justifies service extraction.

Each module owns its domain model, business rules, application services, validations, and workflows.

Shared infrastructure belongs to the platform core.

Modules interact through stable contracts, application services, and domain events.

Avoid direct writes into another module's privately owned data.

## 2.2 Domain Excellence

Each module must target the capabilities of mature dedicated software in its domain.

Basic CRUD is a foundation, not a definition of completion.

## 2.3 Administration Is a First-Class Product

Administration quality is as important as frontend quality.

Every major feature must include an appropriate management experience.

## 2.4 Configuration Before Hardcoding

Prefer configurable rules and typed settings over scattered hardcoded behavior.

However, do not create generic rule engines for requirements that simple well-defined configuration can satisfy.

## 2.5 Shared Infrastructure, Independent Capabilities

Modules share core infrastructure while retaining independent domain behavior, themes, plugins, settings, and workflows.

## 2.6 Upgrade and Compatibility Safety

Existing content, metadata, permissions, subscriptions, orders, and financial records must survive safe upgrades.

## 2.7 Security by Design

All authorization is enforced server-side.

Extensions, themes, and contextual administrative actions must never bypass core security.

## 2.8 Evidence-Based Development

A capability is not complete merely because a page, route, table, mock, or placeholder exists.

Completion requires working behavior and appropriate verification.

---

# 3. TARGET PLATFORM ARCHITECTURE

Target logical structure:

```text
MoboCom Platform
│
├── Platform Core
│   ├── Identity & Authentication
│   ├── Users & Member Groups
│   ├── Authorization & RBAC/ABAC
│   ├── Scoped Restrictions & Bans
│   ├── Module Manager
│   ├── Plugin Manager
│   ├── Theme Manager
│   ├── Dynamic Admin Registry
│   ├── Contextual Action Registry
│   ├── Settings & Feature Flags
│   ├── Media Library
│   ├── Gutenberg + Tiptap Editor
│   ├── Search
│   ├── SEO
│   ├── Notifications
│   ├── Events & Jobs
│   ├── Automation
│   ├── Analytics Infrastructure
│   ├── Audit Logs
│   ├── Import/Export
│   └── API & Webhook Infrastructure
│
├── Community Module
│   ├── Domain
│   ├── Administration
│   ├── Permissions
│   ├── Moderation
│   ├── Themes
│   ├── Plugins
│   └── Analytics
│
├── Commerce Module
│   ├── Catalog
│   ├── Orders
│   ├── Inventory
│   ├── Customers
│   ├── Administration
│   ├── Themes
│   ├── Plugins
│   └── Analytics
│
├── Magazine Module
├── Music Module
├── Cinema Module
├── Games Module
├── Software Module
│
└── Future Modules
```

This is a logical architecture, not a command to reproduce this exact filesystem.

Follow the actual project conventions.

Avoid introducing unnecessary microservices.

---

# 4. INSTALLABLE AND ACTIVATABLE MODULE SYSTEM

**All optional MoboCom domains and capabilities must support a controlled installation and activation lifecycle.**

Installing and activating are separate operations.

Installing a module must not automatically make it operational.

Support these categories:

### Core Modules

Essential platform infrastructure.

Examples:

- Identity
- Authorization
- Extension Management
- Media Infrastructure
- Editor Infrastructure

Core modules may be protected from arbitrary removal.

### Domain Modules

Examples:

- Community
- Store
- Magazine
- Music
- Cinema
- Games
- Software

### Module Plugins

Extend a specific domain.

Examples:

- Community Advanced Moderation
- Community Achievements
- Store Advanced Coupons
- Music Lyrics Provider
- Cinema Subtitle Management

### Global Plugins

Extend the shared platform.

Examples:

- Authentication Providers
- Analytics Integrations
- Search Providers
- Notification Providers

### Cross-Module Plugins

Provide integrations between multiple modules.

Examples:

- Product Support Topics
- Movie Soundtrack Relationships
- Premium Membership Benefits

## 4.1 Module Lifecycle

Implement or specify:

```text
DISCOVERED
   ↓
PACKAGE_VALIDATED
   ↓
INSTALLED
   ↓
INACTIVE
   ↓
ACTIVATING
   ↓
ACTIVE
   ↓
DEACTIVATING
   ↓
INACTIVE
   ↓
UNINSTALLING
   ↓
UNINSTALLED
```

Also define failed installation, failed activation, incompatibility, and recovery states.

Required operations:

- Discover
- Upload/register
- Validate
- Install
- Activate
- Configure
- Update
- Deactivate
- Uninstall
- Inspect dependencies
- Inspect compatibility
- View logs
- Recover failed operations

Uninstalling executable code must not automatically delete domain data.

Data removal requires explicit authorization and confirmation.

## 4.2 Next.js Deployment Reality

Do not pretend that uploaded TypeScript or React files can become application routes automatically inside an already compiled Next.js deployment.

Support two extension models.

**Trusted code extensions:** installed through a controlled deployment process and may require build, migration, restart, or redeployment.

**Declarative extensions:** activate supported configuration and host-provided capabilities through safe runtime registries without arbitrary code execution.

Do not load arbitrary uploaded JavaScript or server code into the privileged application process.

Make deployment requirements visible in the extension manager.

---

# 5. AUTOMATIC ADMINISTRATION REGISTRATION

**After activation, a module or plugin must automatically expose its supported administrative capabilities.**

Do not require manual edits to the global admin sidebar for every new module.

Extensions should contribute:

- Admin navigation items
- Management pages
- Settings panels
- Dashboard widgets
- Permission definitions
- Contextual frontend actions
- Editor blocks
- Events and handlers
- Automation actions
- Import/export adapters
- Analytics widgets
- Theme options

Use a typed, versioned registration contract.

Conceptual interface:

```ts
interface ModuleManifest {
  id: string
  version: string
  name: string
  dependencies: string[]
  admin?: {
    navigation?: AdminContribution[]
    settings?: SettingsContribution[]
    dashboard?: DashboardContribution[]
  }
  contributions?: ModuleContributions
}
```

Adapt interfaces to actual existing project types.

## Activation Behavior

When activated:

1. Validate compatibility and dependencies.
2. Validate installation state.
3. Execute supported activation operations safely.
4. Register active capabilities.
5. Register permissions.
6. Resolve settings and defaults.
7. Register admin navigation.
8. Register contextual actions.
9. Register supported editor integrations.
10. Register supported events/jobs.
11. Invalidate relevant caches.
12. Expose operational status.

When disabled:

- Remove active navigation and actions.
- Reject disabled-module operations server-side.
- Stop or safely reconcile module-owned background work.
- Preserve domain records and settings unless explicitly removed.
- Preserve content belonging to disabled plugins.
- Avoid leaving dangling privileged registrations.

Do not assume database transactions can atomically roll back external deployments or filesystem changes. Use staged activation and compensating recovery where necessary.

---

# 6. DYNAMIC ADMIN PANEL

MoboCom administration must become registry-driven.

The global Admin Panel manages the entire platform.

Each active module contributes its own professional administration workspace.

Example:

```text
MoboCom Admin
│
├── Platform
│   ├── Dashboard
│   ├── Users
│   ├── Groups
│   ├── Permissions
│   ├── Modules
│   ├── Global Plugins
│   ├── Themes
│   ├── Media
│   ├── Security
│   └── Settings
│
├── Community
│   ├── Overview
│   ├── Forums
│   ├── Members
│   ├── Groups & Permissions
│   ├── Moderation
│   ├── Reports
│   ├── Warnings
│   ├── Analytics
│   ├── Themes
│   ├── Plugins
│   └── Settings
│
├── Store
│   ├── Overview
│   ├── Products
│   ├── Orders
│   ├── Inventory
│   ├── Customers
│   ├── Coupons
│   ├── Shipping
│   ├── Taxes
│   ├── Analytics
│   ├── Themes
│   ├── Plugins
│   └── Settings
│
├── Magazine
├── Music
├── Cinema
├── Games
└── Software
```

Navigation visibility is permission-aware.

But hiding menu entries is never considered authorization.

An unauthorized user must not access privileged endpoints directly.

---

# 7. INDEPENDENT THEMES FOR EVERY MODULE

**Every domain must be able to use its own frontend theme independently of other domains.**

Examples:

- Community → Community Theme
- Store → Commerce Theme
- Magazine → Editorial Theme
- Music → Music Theme
- Cinema → Streaming Theme
- Games → Gaming Theme
- Software → Download Portal Theme

Themes must support:

- Installation
- Validation
- Activation
- Deactivation
- Updates
- Preview
- Versioning
- Compatibility checks
- Customization
- Presets
- Responsive layouts
- RTL/LTR
- Light/dark variations
- Theme-specific blocks
- Component variants
- Fallbacks

## Theme Resolution

Define a deterministic resolution hierarchy:

```text
Platform Defaults
       ↓
Global Theme
       ↓
Module Theme
       ↓
Component Variant
       ↓
Validated Page Override
```

Use scoped CSS and controlled design tokens.

A Community theme must not unintentionally modify Store components.

Changing themes must never destroy canonical content.

Do not couple domain data to theme-specific markup.

## Administrative Theme Separation

Distinguish:

- Public frontend appearance
- Admin interface
- Editor preview
- Shared design-system components

Untrusted public themes must not gain privileged access through admin rendering.

---

# 8. INDEPENDENT PLUGINS FOR EVERY MODULE

Each module must have its own plugin ecosystem.

A plugin may extend one module, several modules, or the core platform.

Plugin examples:

### Community

- Advanced Moderation
- Member Awards
- Reputation Rules
- Trust Levels
- Automated Promotions
- Custom Topic Types

### Store

- Payment Integration
- Shipping Provider
- Inventory Automation
- Dynamic Pricing
- Advanced Coupons
- Loyalty System

### Magazine

- Editorial Workflow
- SEO Enhancements
- Content Scheduling

### Music

- Lyrics Providers
- Audio Metadata Importers
- Audio Processing

### Cinema

- Subtitle Providers
- Video Processing
- Metadata Importers

### Games

- Requirements Providers
- Release Importers
- Download Integrations

### Software

- Version Tracking
- Download Mirrors
- Security Advisories

## Plugin Security

Plugins must use controlled and versioned extension APIs.

Distinguish trusted executable plugins from untrusted declarative extensions.

Do not treat TypeScript interfaces, module folders, or permission declarations as actual process isolation.

Untrusted executable code requires appropriate sandboxing or an explicitly supported external execution boundary.

Protect:

- Environment variables
- Database credentials
- Filesystem access
- Authentication/session material
- Payments
- Privileged APIs
- User private data

Provide extension lifecycle auditing.

---

# 9. CENTRALIZED USER GROUPS AND PERMISSION SYSTEM

MoboCom must support advanced centralized identity and authorization.

Use shared accounts across all domains.

Support:

- Primary groups
- Secondary groups
- Unlimited custom groups
- Temporary memberships
- Group expiration
- Group display priority
- Group badges and styles
- Group-specific capabilities
- Automatic promotions
- Resource-scoped permissions
- Ownership rules
- Explicit grants and denials
- Delegated administrative authority
- Permission templates
- Conditional access where justified

## Permission Resolution

Design a deterministic capability-based engine.

Conceptually:

```text
Identity
   ↓
Account Status
   ↓
Global Restrictions
   ↓
Group Memberships
   ↓
Module Restrictions
   ↓
Resource Scope
   ↓
Capability Evaluation
   ↓
Authorization Decision
```

Default deny for privileged operations.

Define explicit precedence and conflict behavior.

A group named `Administrator` must not be hardcoded as the only permission source.

However, retain a secure and explicitly managed platform superadministrator or break-glass recovery mechanism.

Prevent privilege escalation through self-assigned groups or permission updates.

---

# 10. COMMUNITY — INVISION-CLASS MANAGEMENT

The MoboCom Community must reach the capability class of Invision Community.

Preserve its existing frontend appearance unless explicitly requested otherwise.

Concentrate development on professional administration and community operations.

## 10.1 Forum Organization

Support:

- Categories
- Forums
- Subforums
- Topic types
- Question/answer topics
- Solved answers
- Polls
- Topic prefixes
- Tags
- Pinned topics
- Featured topics
- Topic locking
- Topic merging
- Topic splitting
- Topic moving
- Scheduled topics
- Attachments
- Reactions
- Reputation
- Mentions
- Followed topics
- Bookmarks
- Community clubs where applicable

## 10.2 Advanced Member Groups

The forum must support configurable group behavior equivalent in depth to professional community systems.

Examples:

- Guests
- Members
- Verified Members
- Premium Members
- VIP Members
- Contributors
- Moderators
- Senior Moderators
- Community Managers
- Custom Groups

Names are examples, not hardcoded requirements.

Each group may configure:

- Forum visibility
- Topic creation
- Reply permissions
- Attachments
- Upload limits
- Download permissions
- Poll creation
- Reactions
- Signatures
- Profile permissions
- Post-editing limits
- Content approval
- Private community access
- Rate limits
- Advanced editor capabilities

## 10.3 Permission Matrix

Permissions must support hierarchy and resource scope.

```text
Global Community Permissions
         ↓
Category Permissions
         ↓
Forum Permissions
         ↓
Subforum Permissions
         ↓
Resource-Specific Overrides
```

Group memberships and explicit restrictions must resolve deterministically.

Support an administrative permission matrix with clear effective-permission inspection.

## 10.4 Scoped Moderators

Support:

- Global Community Moderators
- Category Moderators
- Forum Moderators
- Club Moderators
- Custom Moderation Scopes

A moderator of one forum must not automatically moderate unrelated forums.

Community moderation must not automatically grant access to the global Admin Panel.

## 10.5 Moderator Control Panel

Provide a professional moderation workspace:

- Report Queue
- Approval Queue
- Spam Queue
- Flagged Content
- Warning History
- Active Restrictions
- Ban Management
- Appeals
- Moderator Notes
- Moderator Activity
- Content History
- Moderation Analytics

Include bulk moderation with authorization and auditing.

## 10.6 Warnings and Discipline

Support configurable:

- Warning reasons
- Warning points
- Warning expiry
- Automatic consequences
- Posting restrictions
- Approval requirements
- Temporary suspensions
- Permanent suspensions
- Internal notes
- Member-visible explanations
- Appeal workflow

Do not hardcode punishment thresholds.

## 10.7 Member Promotions

Support configurable promotion rules based on:

- Account age
- Reputation
- Contribution count
- Activity
- Membership purchases
- Trust indicators
- Active warnings

Use deterministic rule evaluation and durable processing.

## 10.8 Community Analytics

Provide reporting for:

- New registrations
- Active members
- Retention
- Engagement
- Topics
- Replies
- Reports
- Moderation actions
- Popular forums
- Popular topics
- Unanswered questions
- Member-group performance

---

# 11. COMMERCE — WOOCOMMERCE-CLASS MANAGEMENT

The Store must become a professional commerce platform.

Reuse current MoboCom payment, order, database, and financial infrastructure.

Do not embed WordPress or WooCommerce.

## 11.1 Product Types

Support where applicable:

- Physical products
- Digital products
- Premium accounts/services
- Simple products
- Variable products
- Grouped products
- Bundles
- External/affiliate products
- Subscription products

## 11.2 Product Data

First-class management for:

- Products
- Variations
- Attributes
- Attribute groups
- Specifications
- Categories
- Brands
- Tags
- Images
- Product media
- Pricing
- Inventory
- Downloads
- SEO
- Reviews
- Questions
- Related products
- Upsells
- Cross-sells

## 11.3 Variation Management

Variation-specific:

- SKU
- Price
- Sale price
- Stock
- Availability
- Attributes
- Image
- Weight
- Dimensions
- Downloadable files
- Purchase restrictions

Support efficient bulk variation management.

## 11.4 Inventory Management

Support:

- Stock quantities
- Stock movements
- Stock reservations
- Backorders
- Low-stock thresholds
- Inventory history
- Inventory adjustments
- Concurrent purchase safety
- Fulfillment reconciliation

Never rely solely on client-side stock checks.

## 11.5 Order Management

Professional capabilities:

- Order searching/filtering
- Validated status transitions
- Payment timeline
- Fulfillment timeline
- Internal notes
- Customer-visible notes
- Full refunds
- Partial refunds
- Download fulfillment
- Customer history
- Bulk actions
- Exports
- Audit history

Maintain financial idempotency and transaction integrity.

## 11.6 Promotions

Support configurable:

- Coupons
- Scheduled discounts
- Fixed/percentage discounts
- Category discounts
- Group-based discounts
- Product bundles
- Purchase restrictions
- Usage limits
- Customer limits
- Promotional campaigns
- Price history
- Price-drop alerts

## 11.7 Shipping and Taxes

Create configurable and modular:

- Shipping zones
- Shipping methods
- Shipping classes
- Delivery restrictions
- Weight/price rules
- Tax classes
- Tax rules
- Region-based configuration

## 11.8 Store Administration

Provide:

- Product Manager
- Variation Manager
- Inventory Manager
- Orders
- Customers
- Promotions
- Taxes
- Shipping
- Store Reports
- Theme Manager
- Plugin Manager
- Settings

Support dedicated Store Manager permissions without requiring global administrator privileges.

## 11.9 Financial Security

Preserve or improve:

- Minor-unit monetary representation
- Transaction boundaries
- Idempotency
- Webhook verification
- Refund consistency
- Stock reservation consistency
- Durable fulfillment
- Auditability

Financial invariants override plugin convenience.

---

# 12. MAGAZINE — PROFESSIONAL EDITORIAL CMS

The Magazine must offer a complete editorial-management system.

Capabilities:

- Articles
- Authors
- Editors
- Editorial teams
- Categories
- Tags
- Content series
- Drafts
- Reviews
- Approval workflow
- Scheduled publishing
- Revisions
- Editorial notes
- Content ownership
- SEO
- Canonical URLs
- Redirects
- Structured data
- Related articles
- Featured content
- Analytics
- Bulk actions

Example workflow:

```text
Draft
 → In Review
 → Changes Requested
 → Approved
 → Scheduled
 → Published
 → Archived
```

Implement explicit transition permissions.

Integrate with Gutenberg + Tiptap.

Magazine-specific themes, blocks and plugins must be supported.

---

# 13. MUSIC — PROFESSIONAL MUSIC MANAGEMENT

Music must be a structured music catalog and publishing application.

Support:

- Artists
- Albums
- Singles
- Tracks
- Genres
- Labels
- Composers
- Producers
- Featured artists
- Credits
- Artwork
- Audio assets
- Quality variants
- Lyrics metadata
- Release dates
- Languages
- Related releases
- Publication statuses

Administrative features:

- Catalog management
- Artist relationship management
- Bulk metadata editing
- Release scheduling
- Audio validation
- Duplicate detection
- Metadata import
- Release history
- Playlist integration
- Analytics
- Media processing

Allow Music-specific themes, extensions and editor blocks.

---

# 14. CINEMA — MOVIES AND SERIES MANAGEMENT

Cinema must provide professional audiovisual catalog administration.

Support:

- Movies
- Series
- Seasons
- Episodes
- Cast
- Crew
- Studios
- Production companies
- Genres
- Countries
- Languages
- Posters
- Backdrops
- Trailers
- Subtitles
- Dubbing
- Video assets
- Release metadata
- Related titles
- Collections

Administrative features:

- Season/episode bulk editing
- Episode release scheduling
- Metadata inheritance
- Cast/crew relationship management
- Video/subtitle asset management
- Publication workflow
- Availability management
- Notifications
- Watch-progress integration
- Analytics

Support independent Cinema themes and extensions.

---

# 15. GAMES — PROFESSIONAL GAME MANAGEMENT

The Games domain must support:

- Games
- Editions
- Platforms
- Developers
- Publishers
- Genres
- Releases
- Versions
- Patches
- DLC
- Requirements
- Compatibility
- Screenshots
- Videos
- Download assets
- Languages

Administrative features:

- Game catalog management
- Version history
- Release scheduling
- Compatibility metadata
- System requirements
- Download distribution
- Bulk editing
- Import/export
- Analytics
- Game-specific extensions

Use structured metadata rather than storing all requirements as rich text.

---

# 16. SOFTWARE — PROFESSIONAL SOFTWARE DISTRIBUTION

Software must support:

- Applications
- Developers
- Publishers
- Platforms
- OS compatibility
- Architectures
- Versions
- Builds
- Release channels
- Changelogs
- System requirements
- Download assets
- Mirrors
- Checksums
- License metadata
- Release history
- Security advisories where relevant

Administrative features:

- Version publishing
- Release history
- Download management
- Mirror management
- Integrity validation
- Scheduled releases
- Bulk metadata editing
- Import/export
- Analytics
- Software-specific plugins

Never destructively overwrite historical release records.

---

# 17. CONTEXTUAL FRONTEND ADMINISTRATION

**Authorized administrators, editors, managers, and moderators must be able to perform appropriate actions directly from the public frontend.**

A staff member should not have to open the central Admin Panel for every routine operation.

Create a shared Contextual Administration Layer.

## 17.1 Frontend Article Actions

When authorized:

- Edit article
- Quick edit
- Open Gutenberg editor
- Change publication status
- Schedule content
- View revisions
- View analytics
- Feature/unfeature
- Change category
- Open full administration

## 17.2 Frontend Community Actions

Topic actions:

- Edit
- Hide
- Delete
- Move
- Merge
- Split
- Pin
- Lock
- Approve
- Mark as spam
- View moderation history

Post actions:

- Edit
- Hide
- Delete
- Approve
- View history

Member actions:

- Issue warning
- Add moderator note
- Restrict posting
- Require post approval
- Temporarily ban from Community
- Permanently ban from Community
- Remove Community ban
- View moderation history

## 17.3 Frontend Store Actions

When authorized:

- Quick-edit product
- Update stock
- Change visibility
- Edit description
- Inspect product state
- Open full product management

Keep financially sensitive operations in appropriately protected workflows.

## 17.4 Frontend Media Actions

Authorized managers may:

- Edit music metadata
- Edit artist information
- Edit movie metadata
- Edit episode information
- Change publishing status
- Edit game metadata
- Edit software release information

## 17.5 Contextual Action Registry

Use a central registry.

Conceptually:

```ts
registerContextAction({
  id: 'community.member.ban',
  resourceType: 'community.member',
  capability: 'community.member.ban',
  requiresConfirmation: true,
  handler: 'community.banMember'
})
```

The actual interfaces must follow MoboCom conventions.

Every action requires:

- Target validation
- Permission checks
- Applicable resource scope
- Safe mutation handling
- Audit logging
- Appropriate confirmation
- Error handling

Frontend visibility never replaces backend authorization.

Use full-screen editing for complex operations and drawers/modals for efficient quick actions.

---

# 18. GLOBAL AND MODULE-SCOPED BAN SYSTEM

**A user must be ban-able from one module without automatically being banned from the entire platform.**

This is a mandatory cross-platform security and moderation capability.

Do not implement all bans as a single `isBanned` boolean.

## 18.1 Restriction Scopes

Support:

### GLOBAL

Platform-wide account suspension.

The account cannot authenticate or use protected authenticated functionality across modules.

Revoke or reject applicable active sessions and tokens.

Public anonymous browsing is a separate policy: a suspended account cannot reliably be identified after logout solely through account restrictions.

### MODULE

Ban or restriction affecting one module.

Example:

A user banned from Community may still access Store, Magazine, Music, Cinema, Games and Software.

### RESOURCE

A restriction affecting a particular forum, club, category, or another supported resource.

### CAPABILITY

A restriction affecting a particular operation.

Examples:

- Cannot create topics
- Cannot reply
- Cannot upload
- Cannot react
- Must obtain approval before posting

## 18.2 Restriction Data

Design an auditable model with:

- Restriction ID
- User ID
- Scope
- Module ID
- Resource reference
- Restricted capability
- Restriction type
- Reason
- Start time
- Expiration time
- Issuing administrator
- Revocation metadata
- Audit information

A user may have multiple independent active restrictions.

Revoking one must not remove unrelated restrictions.

## 18.3 Example: Community Ban

Expected behavior:

```text
Community Posting    BLOCKED
Community Interaction BLOCKED
Store                AVAILABLE
Magazine             AVAILABLE
Music                AVAILABLE
Cinema               AVAILABLE
Games                AVAILABLE
Software             AVAILABLE
Account Authentication ACTIVE
```

Whether the banned member can still read Community content must be configurable.

## 18.4 Example: Global Suspension

Expected behavior:

```text
Authenticated Community  BLOCKED
Authenticated Store      BLOCKED
Authenticated Magazine   BLOCKED
Authenticated Music      BLOCKED
Authenticated Cinema     BLOCKED
Authenticated Games      BLOCKED
Authenticated Software   BLOCKED
New Account Login        BLOCKED
Existing Sessions        REVOKED / REJECTED
```

Preserve lawful or required recovery, support, refund and data-access processes through explicitly controlled exceptions where necessary.

## 18.5 Permission Separation

A Community Moderator must not be able to issue global account suspensions unless explicitly given that privilege.

Define independent capabilities:

- View restrictions
- Issue Community ban
- Revoke Community ban
- Issue resource restriction
- Issue global suspension
- Revoke global suspension
- Manage restriction policies
- Review audit history

Prevent moderators from restricting higher-privileged staff without explicit authorization.

## 18.6 Enforcement

Enforce restrictions through shared application services and appropriate entry points:

- API endpoints
- Server Actions
- Upload operations
- User mutations
- Real-time operations
- Background workflows
- Authentication/session validation

Respect expiration and revocation immediately or within documented consistency bounds.

Invalidate permission caches when restrictions change.

---

# 19. ADVANCED MEMBERSHIP AND GROUP MANAGEMENT

The platform must distinguish:

- Identity
- User group
- Administrative role
- Permission
- Module entitlement
- Paid subscription
- Account restriction
- Resource ownership

These concepts must not be collapsed into one ambiguous role field.

Support group-specific:

- Capabilities
- Module access
- Resource access
- Appearance
- Posting limits
- Upload limits
- Membership duration
- Automatic promotions
- Paid membership benefits

Provide a professional group administration interface.

Allow authorized administrators to inspect effective permissions.

Maintain a deterministic conflict-resolution policy.

---

# 20. GUTENBERG + TIPTAP EDITOR ARCHITECTURE

Preserve the previously established editor architecture.

**Gutenberg:** Visual Block Editor and layout composition.

**Tiptap:** Rich text editing inside suitable blocks.

**MoboCom Document:** Canonical content representation.

Gutenberg must not become the permanent source of truth for content storage.

Do not require WordPress as a backend.

Use a MoboCom-owned schema and adapters.

Support:

- Custom blocks
- Nested blocks
- Drag/drop
- Columns
- Sections
- Block patterns
- Templates
- Block locking
- Reusable/global blocks
- Module-specific blocks
- Theme-specific block styles
- Media integration
- RTL/LTR
- Revisions
- Autosave
- Optimistic concurrency
- Versioned document migrations

Each domain and approved extension should contribute blocks through stable registration contracts.

Examples:

- Store → Product Grid
- Music → Album Tracklist
- Cinema → Episode List
- Games → Requirements
- Software → Download Box
- Community → Poll/Discussion Embed
- Magazine → Editorial Callout

## Content Integrity

Never truncate canonical structured documents into invalid JSON.

Revision capture and restore must preserve valid complete content.

Legacy-to-block conversion must preserve recoverable original content and use atomic persistence where supported.

Unknown extension blocks must remain preserved when plugins are disabled.

Frontend content rendering must not require loading Gutenberg.

---

# 21. SHARED PLATFORM SERVICES

Use or extend shared services for:

- Users
- Authentication
- Groups
- Permissions
- Restrictions
- Media
- Editor
- Search
- SEO
- Comments
- Reviews
- Reactions
- Notifications
- User Library
- Saved Content
- Background Jobs
- Scheduling
- Auditing
- Import/Export
- Analytics
- Extension Management
- Theme Management

Every service requires clearly documented ownership.

Modules must not bypass shared integrity and security rules.

---

# 22. CROSS-MODULE RELATIONSHIPS

MoboCom must support intentional relationships between entities across domains.

Examples:

- Movie ↔ Soundtrack Album
- Movie ↔ Magazine Article
- Game ↔ Software Release
- Product ↔ Community Support Topic
- Artist ↔ Album
- User ↔ Purchases
- User ↔ Community Reputation
- Software ↔ Release Notes

Avoid uncontrolled cross-module foreign-key coupling where it would violate established ownership boundaries.

Use validated references and application-level contracts as appropriate.

---

# 23. ADVANCED IMPORT AND EXPORT

All content-heavy domains must support professional import/export workflows.

Formats as relevant:

- CSV
- XLSX
- JSON

Requirements:

- Preview
- Field mapping
- Validation
- Dry run
- Duplicate detection
- Error reporting
- Background execution
- Idempotent retries
- Audit logs
- Partial-failure handling
- Batch processing

Do not run very large imports as blocking HTTP requests.

Use existing job infrastructure.

---

# 24. AUTOMATION AND DOMAIN EVENTS

Domains must expose clear events and controlled actions.

Examples:

```text
community.topic.created
community.member.warned
community.member.banned

store.order.paid
store.order.refunded
store.inventory.low

magazine.article.published
music.release.published
cinema.episode.published
games.release.published
software.version.published
```

Use events for:

- Notifications
- Analytics
- Search indexing
- Automation
- Webhooks
- Cache invalidation
- Activity feeds

Where required, use durable outbox/job patterns.

Handlers should be retry-safe and idempotent.

Avoid deeply coupled synchronous event chains.

Do not build an arbitrary-script automation system.

Use validated actions and controlled execution.

---

# 25. PROFESSIONAL ADMIN EXPERIENCE

Each domain's administration must support appropriate:

- Dashboards
- Advanced search
- Filtering
- Sorting
- Pagination
- Saved views
- Configurable columns
- Bulk selection
- Bulk operations
- Inline actions
- Contextual actions
- Background progress
- Audit history
- Confirmation dialogs
- Recoverable errors
- Accessible controls
- Responsive layouts
- RTL support

Avoid placing every module's settings into one giant generic form.

Prefer workflows designed around actual administrative operations.

---

# 26. ANALYTICS AND OPERATIONAL REPORTING

Every major module must expose relevant metrics.

Community:

- Registrations
- Engagement
- Moderation workload
- Reputation
- Retention

Store:

- Gross/net revenue
- Orders
- Refunds
- Average order value
- Product performance
- Inventory
- Customers

Magazine:

- Content performance
- Publishing activity
- Engagement

Music:

- Catalog activity
- Plays/downloads where tracked
- Release performance

Cinema:

- Viewing activity
- Content availability
- Release performance

Games and Software:

- Downloads
- Release performance
- Version adoption where legitimately measured

Avoid expensive unbounded analytics queries on transactional tables.

Use aggregation, background processing and caching when warranted.

Define data retention and privacy boundaries.

---

# 27. MODULE-LEVEL SETTINGS AND FEATURE FLAGS

Each module must have validated, namespaced settings.

Examples:

```text
community.settings
store.settings
magazine.settings
music.settings
cinema.settings
games.settings
software.settings
```

Settings must be:

- Typed
- Validated
- Permission-controlled
- Versioned when required
- Safely migrated
- Audited when sensitive
- Compatible with defaults

Sensitive credentials must not be exposed to client code.

Modules should be independently configurable and disable-able subject to dependency constraints.

---

# 28. SECURITY REQUIREMENTS

Maintain strong platform security across every module and extension.

Requirements include:

- Server-side authorization
- Default-deny privileged operations
- Runtime validation
- CSRF protection
- Rate limiting
- Safe HTML rendering
- XSS prevention
- Permission cache invalidation
- Secure session handling
- Secret protection
- Privileged-action auditing
- Safe file uploads
- Dependency review
- Safe extension deployment
- Database transaction consistency
- Idempotency
- Privacy controls

Do not weaken financial security or authorization because a feature is exposed through a plugin or contextual frontend action.

Administrative user interfaces must not become alternative privilege-escalation paths.

---

# 29. DATABASE, MIGRATION AND DATA INTEGRITY

Use existing Prisma and database conventions.

Inspect both PostgreSQL and SQLite requirements if both are actively supported.

Every schema change must consider:

- Migration correctness
- Indexes
- Constraints
- Referential integrity
- Transactions
- Concurrency
- Backwards compatibility
- Release boundaries
- Rollback strategy
- Data retention
- Existing records

Avoid destructive migrations without explicit authorization and verified backups.

Do not run potentially destructive production migrations simply to validate architecture.

Protect financial, membership, moderation and content history records.

Preserve existing revision and restore workflows.

---

# 30. EXTENSION AND MODULE UPGRADE SAFETY

Define stable API contracts and supported compatibility ranges.

Module updates must handle:

- Manifest compatibility
- Dependency resolution
- Schema migration
- Settings migration
- Plugin compatibility
- Theme compatibility
- Permission additions
- Navigation changes
- Editor block compatibility
- Background job compatibility

Do not silently remove unknown content.

Disable incompatible contributions safely and report the problem.

Provide an operational recovery path.

---

# 31. OBSERVABILITY AND RECOVERY

Every domain and infrastructure subsystem should expose appropriate:

- Structured logging
- Metrics
- Health indicators
- Job status
- Error reporting
- Audit trails
- Retry outcomes
- Failure recovery
- Operational dashboards

Important lifecycle events should be traceable.

Examples:

- Module activation failed
- Plugin dependency unavailable
- Theme compatibility rejected
- Global suspension applied
- Payment fulfillment retried
- Content migration failed
- Permission cache invalidated

Avoid logging credentials, access tokens or unnecessary personal data.

---

# 32. ENTERPRISE CAPABILITY MATURITY MODEL

Maintain documented implementation maturity for each domain.

Use these statuses:

1. Missing
2. Planned
3. Foundation
4. Partially Implemented
5. Functional
6. Production Verified
7. Advanced
8. Reference-Class Equivalent

A capability is not complete simply because a component or endpoint exists.

Completion evidence may include:

- Domain behavior
- Administrative workflow
- Permission enforcement
- Persistence
- Tests
- Integration verification
- Operational readiness

Use factual implementation status.

Do not fabricate maturity scores.

---

# 33. DOMAIN CAPABILITY MATRIX

Maintain a matrix covering:

- Platform Core
- Community
- Store
- Magazine
- Music
- Cinema
- Games
- Software

Evaluate:

- Domain model
- Public frontend
- Administration
- Groups
- Permissions
- Scoped restrictions
- Workflows
- Independent themes
- Independent plugins
- Module lifecycle
- Dynamic admin registration
- Contextual frontend actions
- Editor blocks
- Bulk operations
- Import/export
- Automation
- Search
- Analytics
- Security
- Testing
- Deployment readiness

For each capability record:

- Current implementation
- Missing capabilities
- Required architectural changes
- Dependencies
- Priority
- Implementation risk
- Acceptance criteria
- Verification evidence

Never mark planned functionality as implemented.

---

# 34. ARCHITECTURAL DECISION RECORDS

Document important decisions involving:

- Modular Monolith
- Shared Core Services
- Domain Ownership
- Module Lifecycle
- Plugin Lifecycle
- Trusted/Untrusted Extension Execution
- Independent Theme Resolution
- Dynamic Admin Registry
- Centralized RBAC
- Scoped Restrictions
- Frontend Administration
- Gutenberg/Tiptap Integration
- Cross-Module Events
- Database Migration Strategy

Each ADR should include:

- Context
- Decision
- Alternatives
- Rationale
- Trade-offs
- Security implications
- Migration implications
- Reversibility

Keep ADRs aligned with actual implementation.

---

# 35. TESTING STANDARDS

Create or extend meaningful tests.

## Authorization Tests

- Primary and secondary groups
- Permission inheritance
- Explicit-deny handling
- Scoped moderation
- Unauthorized admin access
- Cross-module privilege escalation
- Group expiration
- Permission cache invalidation

## Module Lifecycle Tests

- Install without activation
- Activation
- Dependency validation
- Failed activation recovery
- Settings registration
- Admin navigation registration
- Deactivation
- Uninstallation data preservation
- Disabled endpoint rejection

## Theme Tests

- Module theme isolation
- Safe theme switching
- Missing-theme fallback
- Responsive behavior
- RTL rendering

## Plugin Tests

- Manifest validation
- Compatibility validation
- Dependency handling
- Permission boundaries
- Data preservation
- Upgrade behavior
- Contribution cleanup

## Frontend Administration Tests

- Authorized actions appear
- Unauthorized actions remain unavailable
- Direct unauthorized API calls fail
- Scoped moderators cannot exceed scope
- Important mutations are audited

## Restriction Tests

- Community ban only
- Global ban
- Resource restriction
- Capability restriction
- Expiration
- Revocation
- Multiple simultaneous restrictions
- Active session handling
- Unauthorized global ban attempt

## Commerce Tests

- Payment integrity
- Stock concurrency
- Refund consistency
- Fulfillment idempotency

## Editor Tests

- Block serialization
- Unknown block preservation
- Valid revision recovery
- Atomic legacy migration
- RTL
- Save/reload
- Concurrency

Use real integration/E2E tests where unit tests cannot prove the behavior.

Do not claim tests pass unless executed successfully.

---

# 36. MANDATORY ENGINEERING SKILL INTEGRATION

**This mandate must become a permanent part of MoboCom's canonical engineering skill and architecture system.**

Do not simply print this document and stop.

Inspect the actual repository and update the appropriate existing files.

Potential locations include:

- Root AGENTS.md
- Root CLAUDE.md
- Existing SKILL.md files
- Principal Engineer Skill
- Architecture Skill
- Module Development Skill
- Plugin Development Skill
- Theme Development Skill
- Backend Skill
- Frontend Skill
- Database Skill
- Security Skill
- Testing Skill
- Community Skill
- Commerce Skill
- Content/Media Skills

Use the real repository structure.

Do not create redundant parallel skill systems.

## Skill Hierarchy

Prefer:

```text
Root Engineering Instructions
        ↓
MoboCom Master Architecture Contract
        ↓
Platform Capability Contracts
        ↓
Domain Engineering Skills
        ↓
Implementation Checklists
        ↓
Tests and Architecture Enforcement
```

There must be one canonical source for important architecture rules.

Other skills should reference it rather than copy large sections.

Use concise rules in root instructions and detailed guidance in focused documents.

## Permanent Agent Behavior

When an agent works on any domain feature:

1. Identify the relevant domain.
2. Read the applicable skill.
3. Inspect existing implementation.
4. Identify reusable platform infrastructure.
5. Compare current capabilities with the professional target.
6. Consider administration and permissions.
7. Consider contextual frontend management.
8. Consider themes/plugins.
9. Define acceptance criteria.
10. Implement safely.
11. Test.
12. Update documentation and capability status.

This behavior must persist across future Claude Code and Codex sessions through repository instructions.

---

# 37. REQUIRED SKILL COVERAGE

Ensure engineering guidance exists for these areas:

### Platform Architecture

Module boundaries, shared services, lifecycle contracts, events, and versioning.

### Community Engineering

Invision-class management, groups, moderation, scoped permissions, and restrictions.

### Commerce Engineering

WooCommerce-class management, transactional integrity, products, variations, inventory, orders, and promotions.

### Publishing Engineering

Editorial workflows, content revisions, SEO, author/editor roles, and scheduling.

### Media Engineering

Music, cinema, games, and software metadata, publishing, distribution, and administration.

### Module/Plugin Development

Install/activate/configure/update/deactivate/uninstall contracts.

### Theme Development

Independent themes, scoped styling, registries, compatibility, and safe switching.

### Authorization Engineering

Groups, capabilities, resources, restrictions, global suspensions, and administrative delegation.

### Frontend Administration

Contextual actions, quick editing, moderation, confirmation, and auditing.

### Editor Engineering

Gutenberg, Tiptap, canonical documents, custom blocks, migrations, and rendering.

### Security & Quality

Threat modeling, validation, testing, observability, migration safety, and production readiness.

Create a dedicated skill only when it provides value beyond existing documentation.

---

# 38. IMPLEMENTATION PRIORITIES

Do not implement every benchmark capability in one giant change.

Prioritize shared foundations that unlock many features.

## Phase 0 — Repository Audit and Skill Integration

- Discover existing skill architecture
- Analyze current modules
- Build capability matrix
- Consolidate master requirements
- Update root/skill instructions
- Document ADRs
- Create roadmap

## Phase 1 — Platform Foundations

- Unified group/capability contracts
- Scoped restriction architecture
- Module lifecycle contracts
- Plugin lifecycle contracts
- Dynamic Admin Registry
- Settings registration
- Module theme contracts
- Contextual Action Registry

Reuse existing implementations whenever possible.

## Phase 2 — Community Management

- Advanced groups
- Permission matrix
- Scoped moderators
- Moderator Control Panel
- Warning/restriction workflows
- Community-only bans
- Contextual moderation

## Phase 3 — Commerce Management

- Product/variation administration
- Inventory operations
- Order administration
- Promotion rules
- Store permissions
- Store analytics
- Store themes/plugins

## Phase 4 — Editorial and Media Domains

- Magazine workflows
- Music administration
- Cinema administration
- Games administration
- Software administration

## Phase 5 — Advanced Platform Features

- Reusable automation
- Advanced extension compatibility
- Cross-module workflows
- Advanced analytics
- Marketplace-oriented extension packaging where appropriate

These are dependency-based phases, not rigid release dates.

Adjust ordering based on the actual repository.

---

# 39. DEFINITION OF DONE

A platform architectural requirement is considered integrated only when:

- Canonical instructions are updated.
- Relevant skills reference the correct contracts.
- Existing architecture is accurately represented.
- Missing functionality is distinguished from implemented functionality.
- Required module/theme/plugin contracts are documented.
- Authorization and scoped-ban rules are unambiguous.
- Contextual administration rules are documented.
- Domain benchmark capability matrices exist.
- The implementation roadmap is actionable.
- Architecture checks or tests are added where appropriate.
- Relevant existing checks remain passing.
- Changes are consistent with existing conventions.

A runtime feature is considered implemented only when working behavior and appropriate tests demonstrate it.

**Documented architecture is not the same as implemented functionality.**

Never claim all Invision or WooCommerce capabilities have been implemented merely because their target requirements are included in the skills.

---

# 40. AUTONOMOUS EXECUTION INSTRUCTIONS

Execute this task as an integrated repository-level engineering assignment.

Do not ask for confirmation at every step.

Work autonomously using the actual repository and available tools.

Follow this workflow:

### Step 1 — Inspect

Analyze the existing codebase, skills, architecture, modules, permissions, extensions, themes, admin system, and editor.

### Step 2 — Reconcile

Compare this mandate with existing engineering instructions.

Preserve correct existing decisions.

Resolve contradictions explicitly.

Avoid duplicate instructions.

### Step 3 — Update Canonical Skills

Integrate the full architectural mandate into the existing skill system.

Ensure future agents discover and follow it.

### Step 4 — Define Architecture Contracts

Create or update the specifications for:

- Module lifecycle
- Plugin lifecycle
- Dynamic admin registration
- Independent module themes
- Independent module plugins
- Centralized permissions
- Scoped restrictions
- Global bans
- Contextual frontend administration
- Domain-specific management standards

### Step 5 — Assess Domains

Create the evidence-based capability matrix for every existing major module.

### Step 6 — Produce Roadmap

Define priorities, dependencies, migration considerations, and acceptance criteria.

### Step 7 — Add Enforcement

Where low-risk and feasible, add architectural validation or focused tests that protect the established contracts.

Do not implement unrelated functionality or broad speculative rewrites.

### Step 8 — Verify

Run relevant existing:

- Architecture checks
- Source/import checks
- Documentation validation
- Type checks when affected
- Security checks
- Schema checks when affected
- Relevant unit/integration tests

Do not bypass failing checks.

### Step 9 — Report

Summarize what changed and what remains planned.

Do not merely provide recommendations if the task can be completed through actual repository edits.

---

# 41. IMPLEMENTATION SAFETY RULES

Do not:

- Rewrite working modules unnecessarily.
- Replace existing frontend templates.
- Introduce WordPress as the backend.
- Embed WooCommerce or Invision source code.
- Introduce independent authentication systems.
- Duplicate the Media Library.
- Duplicate permission engines.
- Replace the existing editor architecture.
- Add unrestricted runtime plugin execution.
- Introduce unsafe migrations.
- Remove existing production data.
- Modify payment integrity rules casually.
- Claim production readiness without validation.
- Claim benchmark feature parity without verified evidence.
- Create hundreds of placeholder features.
- Convert documented requirements into fake completion reports.

Preserve backwards compatibility where reasonably possible.

Use safe migrations and explicit failure handling.

---

# 42. REQUIRED FINAL DELIVERABLES

At the end of the assignment, provide:

1. **Repository Assessment** — Current architecture and important findings.
2. **Updated Master Engineering Rules** — Permanent canonical instructions.
3. **Updated Skill Files** — Exact changed/created skill paths.
4. **Module Architecture Contract** — Installation and activation.
5. **Plugin Architecture Contract** — Lifecycle, security, dependencies, and registration.
6. **Theme Architecture Contract** — Independent per-module theme system.
7. **Administration Architecture** — Dynamic module/plugin panels.
8. **Authorization Architecture** — Groups, capabilities, scopes, and effective permissions.
9. **Restriction Architecture** — Module-specific bans and global account suspensions.
10. **Contextual Administration Architecture** — Frontend editing and moderation.
11. **Domain Capability Matrix** — Community, Store, Magazine, Music, Cinema, Games, Software.
12. **Architecture Decision Records** — Major decisions and trade-offs.
13. **Implementation Roadmap** — Priorities, dependencies, and acceptance criteria.
14. **Testing Results** — Commands executed and actual outcomes.
15. **Remaining Risks** — Known technical, security, migration, and licensing considerations.

For every deliverable, distinguish between:

- Already existed
- Updated now
- Newly created
- Planned but not implemented
- Blocked or unverified

Do not make unsupported claims.

---

# 43. FINAL PLATFORM VISION

MoboCom must ultimately provide:

**Invision-Class Community**
+
**WooCommerce-Class Commerce**
+
**Professional Editorial CMS**
+
**Professional Music Platform**
+
**Professional Cinema and Series Platform**
+
**Professional Games Platform**
+
**Professional Software Distribution**
+
**Independent Themes for Every Module**
+
**Independent Plugins for Every Module**
+
**Installable and Activatable Modules**
+
**Automatically Registered Administrative Interfaces**
+
**Contextual Frontend Administration**
+
**Advanced User Groups and Granular Permissions**
+
**Module-Scoped and Global Account Restrictions**
+
**Gutenberg + Tiptap Content Editing**
+
**One Secure, Unified and Extensible Platform Core**

MoboCom must not become seven unrelated systems glued together.

It must become **one coherent platform containing professional-grade domain applications**, each with its own administration, design, plugins, settings, workflows, and operational lifecycle.

**Final mandatory action: Integrate this complete mandate into the actual MoboCom engineering skills and architecture documentation, validate consistency, and create the implementation roadmap without destructively modifying existing functional systems.**