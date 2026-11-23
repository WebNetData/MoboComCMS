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
