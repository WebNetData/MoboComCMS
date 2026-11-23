# Commercial capability isolation — owner2026-11-15

## Outcome and scope

The owner requires a commercially configurable platform: optional customer
capabilities install through the existing extension system, disappear from ordinary
Admin/public UI and direct entry points when inactive, and retain their records.
Core Identity/AuthZ, Settings, Audit, Jobs and financial reconciliation remain shared.
An uploaded executable is trusted code requiring the existing reviewed build/deploy
path; a declarative upload does not dynamically install arbitrary Next.js code.

Checkout: `.mobocom/sms-platform`, `fix/modular-capability-isolation-2026-11-15`,
base main274ada62 after owner merge of PR477. Preserve other checkouts and app3000.
Audit uses existing architecture/contracts/registries; no replacement platform.

## Inspected inventory and target

| Owner/surface | Current source evidence | Finding and target |
| --- | --- | --- |
| Built-ins |42 manifests,37 modules,5 plugins; extension state, generated catalog, filtered navigation | Present; keep one registry |
| Forms/services/repair | Forms domain and aliases; no Forms manifest/guard | DISCONNECTED optional boundary; coherent `forms` module includes current repairs, consent, receipts and templates |
| In-store | Own manifest/counter guard; Store owns money, Forms owns intake | Present; intake needs both instore and forms, counter sales remain independent |
| Automation | Domain/Admin permission exists; scheduler invokes processAutomation unconditionally | DISCONNECTED optional boundary; module gates HTTP, event admission and worker effects |
| AI | Guarded HTTP, manifest/Admin path; client page tree has no server page gate | PARTIAL; add page-tree gate, retain per-action permissions |
| Manager | Effective enablement only; settings visible when inactive; generic PATCH lacks strict audit/fresh transactional authority | PARTIAL; requested/effective availability, blockers, inactive settings withdrawn, canonical authorization/audit |
| Uploaded packages | New installs inactive; existing aggregate/index/runtime; delete destroys files/settings/history, including active packages | WEAK_BACKEND; inactive retained uninstall, no purge, explicit reinstall remains inactive |
| Shared SMS | Identity OTP shares provider; owner-aware notification delivery exists | Preserve Core transport; independent commercial messaging separation remains later audited slice |
| Code package apply | External effect precedes final DB snapshot claim | PARTIAL; recoverable operation protocol is next priority, not claimed fixed by a UI change |
| Other domains | Manifest presence mapped; full off-state journeys not executed | UNVERIFIED; do not infer completeness or create duplicate owners |

## First executable slices

1. Register Forms and Automation with consumed paths/menu contracts, default on for
   upgrade compatibility. All ordinary Forms pages/APIs/compositions and autonomous
   effects honor current state; off preserves form/submission/quote/history/files.
   Public embeds and customer navigation disappear. In-store Forms entry needs both
   modules. Existing payment obligations reconcile through Core owners.
2. Truthful extension management and safe existing commands: current transactional
   settings.manage + strict Audit; requested/effective dependency status; hide
   ordinary settings when off. Reject catalog dependency cycles. Distinguish shipped
   code, declarative installation and staged/applied trusted code.
3. Retain uploaded inactive package aggregate on uninstall; remove runtime/index
   contributions, refuse active/selected or already-applied-code removal, keep
   files/settings/revisions. Reinstall restores retained settings/history inactive.
   All public files/pages/components and editor/source/activation paths must respect
   retained-uninstalled state. No purge action is added or authorized.

## Actors, data and compatibility

Existing forms.handle/cms.pages, automation.manage, settings.manage and
extensions.code retain their canonical meanings; no second User or access resolver.
New manifests do not move domain logic into plugins. UI is only a projection;
server and autonomous effects independently check effective availability.
Keep existing Setting keys, mirrors/defaults, package aggregate/index and strict
corruption refusal. No destructive migration, default activation of off-focus
modules, schema rewrite, provider call, production deployment or hosted workflow.

Manager uses existing SDS/MoboCom tokens and controls, RTL, keyboard/accessible
labels, mobile/light/dark and explicit error/loading/empty states. Lifecycle controls
remain Core-owned recovery controls while ordinary module settings disappear.

## Acceptance

- Connected fresh PostgreSQL/no.env/UID1000: off direct route/API refusal; current
  state inside write/effect; no automation or queued Forms notification effect;
  canonical authority/audit rollback; data retained and reactivation restores access.
- Forms on/instore off allows self-service, refuses counter entry; Forms off does
  not disable Identity/login or Store invoice settlement. AI off page/API unavailable.
- Active uninstall refuses with unchanged aggregate/index; inactive uninstall
  retains bytes/settings/history; repeated uninstall idempotent; direct retained
  package paths/assets/editor/runtime unavailable; reinstall inactive with history.
- Existing extension/package integrity/authority, Forms/repair regressions; focused
  units, type/import/architecture/security checks; deliberate guard fault detected.
- Real local browser manager toggles and dependency reasons; hidden settings,
  navigation/embeds/account surfaces, mobile/light/dark axe and visual checks.

## Subsequent roadmap and rollback

### Package compatibility and recoverable code apply — owner2026-11-23

Continue on `.mobocom/package-lifecycle`, branch
`feat/package-lifecycle-recovery-2026-11-23`, from fetched main `bcdfbdc7`.
Owner authorized this implementation after the continuation proposal. Existing
Packages aggregate/index, Identity, strict Audit and generated extension catalogs
remain owners; no new registry, identity, executable runtime or destructive migration.

Change envelope: validate actual core/dependency contracts before installation,
editing, activation and trusted source apply. Persist a package-bound operation
ID, exact file fingerprint and nonsecret target before effects. Plan a Git commit
before changing the branch; reconcile its identity after an uncertain response.
Local apply retains the previous directory and prepares the complete replacement;
interrupted swaps are reconciled against the recorded fingerprints, never guessed.
Pending operations prevent package edits/upgrade/uninstall. Repeated apply resumes
the same operation and does not duplicate final history or deployment notification.
Every privileged phase uses current extensions.code authority and strict Audit;
database retry callbacks contain no filesystem/network effects. An unknown webhook
outcome is retained and never automatically resent. Trusted code still needs the
ordinary reviewed build/deploy; apply is not a production-ready certificate.

Acceptance: registered `package-apply.connected.cjs` on disposable PostgreSQL,
without .env/non-root; concurrency, authority revocation, audit rollback, pending
edit refusal, interrupted local swap and Git response loss/recovery, target drift,
unchanged retry and current-version/dependency rejection. Deliberately remove a
critical guard in private test source, observe failure, restore and pass. Scoped
package/extension regressions, types/source/architecture/security checks and real
manager browser light/dark/mobile with scoped axe/visual review. Rollback retains
operation receipts, backup directories and package data; unresolved operations
must be reconciled before downgrade or mutation. No hosted workflow, provider send,
PR publication, merge or production deployment is part of this task.

The bounded2026-11-23 slice above implements consumed core/module compatibility
and recoverable trusted-source apply. Continue wider queued-work lifecycle and
commercial capability boundaries, customer Solution Packs and distribution/
entitlement contracts. Multi-host process-death proof remains operator-owned;
manifests do not certify independently deployed extensions or live providers.

Rollback keeps canonical data. Never downgrade to a package reader that republishes
retained-uninstalled rows or a repair mutation that bypasses consent. Keep the
guards or freeze affected writes until compatible code is restored. Reactivation
is explicit; preserve existing keys, money and historical records.

## Solution Packs and commercial distribution — owner2026-11-23

Continue `feat/solution-packs-distribution-2026-11-23` from9da4d6ac in
`.mobocom/package-lifecycle`. Source audit found no executable Solution Pack;
the architecture describes the target. Existing Packages owns ZIP/parser/storage/
revisions and Repository already owns signed releases, acquisition entitlement,
download integrity and install. Reuse them; no new product kind, license service,
identity, database migration or executable installer. Graphify refresh failed the
existing out-of-corpus CredentialPools.tsx; exact source supplied this inventory.

Version1 is a strictly validated `solutionPack` contribution on a declarative
plugin: named built-in modules, compatible versions, typed nonsecret setting
defaults and advisory extension recommendations. Other runtime contributions,
unknown fields, arbitrary Setting keys, secret defaults and specialized business
policy history writes refuse. Roles, theme/navigation/content publication and
dependent paid extensions retain their existing explicit owners; this contract
does not silently import them or grant their entitlements.

An installed pack remains inert. settings.manage staff previews its current plan,
including modules to enable, missing-only defaults and preserved settings. No
undeclared disabled dependency is silently enabled. Explicit POST applies the
reviewed hash in one serializable transaction through the existing extension
writer, current canonical actor and strict Audit. Recheck source/config/catalog;
a stale plan refuses409. Unreadable state refuses without fallback writes.
An additive validated receipt in the same package aggregate makes concurrent
replays idempotent; upgrade/reinstall/uninstall retain receipts and Audit history.
No filesystem/network/provider effect runs inside a retry callback.

Repository PLUGIN acquisition remains the same signed ZIP/manifest identity,
SHA/size/version/current site/config/entitlement admission. A pack purchase grants
that pack's distribution, never other paid products. Existing license behavior is
acquisition/update authorization, not continuous module DRM. Uninstall/revocation
never undoes customer configuration, deletes data or disables included modules.

Admin extends the existing scoped manager with a review panel, truthful receipt,
keyboard controls and busy/error/stale feedback under SDS/MoboCom tokens. No new
Admin directory or public visual change. Provide real customer example archives
through the current examples workflow and vendor publishing instructions.

Acceptance: strict parser/ZIP/export/reimport and repository units; registered
`solution-packs.connected.cjs` on fresh PostgreSQL/no.env/UID1000 for actual preview,
apply, atomic Audit rollback, current authority, stale state/source, concurrent
replay, dependency/schema refusal, preserved settings/data and retained receipt.
Deliberately break a critical guard and observe failure, then restore/pass.
Existing package-command/extension-state/repository install checks, full types,
source/architecture and scoped security; actual1440 light/dark and390 browser
preview/apply/error/replay plus axe/focus and guest/Origin refusals. Doctor reviews
affected components. No live purchase/provider, hosted workflow, merge or deploy.

Rollback withdraws the pack UI/commands; keep existing configured modules/settings
and receipts. Before downgrading, retain/export package receipts and do not install
an older writer that silently discards them. No automatic configuration reversal.

## Solution Pack v2 composition — owner2026-11-23

The owner selected roadmap item2 after PR482 merged. Continue from main78fe059c
in `.mobocom/package-lifecycle`, `feat/solution-packs-v2-2026-11-23`.
Source audit confirms SiteConfig/theme registry/menu writer, canonical staff-role
templates and page/block-editor/revision owners already exist. Reuse those owners;
no new registry, identity, editor format, permission resolver or database migration.
Graphify refresh encountered the existing out-of-corpus CredentialPools source;
exact source and Serena supplied the bounded owner inventory.

Version1 input and historical receipts remain compatible. Version2 adds bounded
installed theme selection, navigation, canonical role-template IDs and portable
canonical document templates creating draft pages. A v2 pack requires a nonempty
composition. It never acquires paid dependencies, assigns users to roles, changes
staff standing, publishes pages, imports local synced-pattern IDs or writes arbitrary
settings/permissions. Preview validates installed owners and required permissions
before any write; roles.manage and cms.pages are required for their contributions,
in addition to settings.manage. No full-access role template is accepted.

Existing explicit theme and navigation (including empty navigation) are preserved.
These two defaults initialize a missing site configuration; a complete existing
configuration remains authoritative. New roles use canonical preset permissions
and the existing anti-escalation policy. New pages use canonical blocks-v1 JSON,
derived HTML, layout, strict history and Audit, DRAFT and showInNav=false. Public
navigation cannot reference an unpublished local page. Slug/name collisions remain
untouched and are not adopted. Package-created identities are retained by numeric
ID across rename, upgrade, temporary omission and deletion; deletion is never undone.
Retained bindings are bounded, never silently trimmed.

Preview fingerprints include actual site, role/page versions, registry/module
state and package source. Stale apply refuses409; all owner writes, revisions,
strict Audit and additive receipt commit in one serializable transaction. Real
module availability is checked again after declared modules are enabled. Cache
invalidation occurs only after commit. Same-artifact replay returns historical
evidence without restoring customer changes. Uninstall never reverses provisioning.

Acceptance: registered v2 connected PostgreSQL scenarios without .env/non-root,
all four owners, permissions/escalation, stale state, concurrency, strict-Audit
rollback, rename/deletion/collision retention and unchanged User rows; parser v1/v2,
existing owner regressions and deliberate critical-guard fault detection. Actual
manager browser1440 light/dark and390 with preview/apply/replay/errors, keyboard,
axe and React Doctor. No hosted workflows, live Pay calls, merge or deployment.
Rollback freezes pack commands and retains/export receipts and canonical resources;
restore site history or manually manage draft pages/role definitions using owners.
Do not downgrade to a receipt reader that drops resource bindings.
