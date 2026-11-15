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

Continue real-core compatibility and dependency versions using existing semantics;
claimed recoverable trusted-code apply and queued-work lifecycle reconciliation;
then remaining commercial capability boundaries, customer Solution Packs and
distribution/entitlement contracts. These are pending, not delivered by manifests.

Rollback keeps canonical data. Never downgrade to a package reader that republishes
retained-uninstalled rows or a repair mutation that bypasses consent. Keep the
guards or freeze affected writes until compatible code is restored. Reactivation
is explicit; preserve existing keys, money and historical records.
