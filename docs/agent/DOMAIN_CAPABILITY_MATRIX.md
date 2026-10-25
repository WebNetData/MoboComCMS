# Domain capability maturity matrix

Scoped update2026-10-19: ten public module blocks and five portal-settings history adapters are locally functional in the existing Editor/Content/Settings owners. [Exact scope and evidence](handoffs/MODULE_BLOCKS_SETTINGS_HISTORY.md). This closes the named browser-registry/rendering gap and extends General/Forum history; it does not promote whole domain cells, arbitrary settings, templates or production maturity. The original matrix snapshot below remains historical evidence.

Snapshot: 2026-10-10, branch `fix/editor-maintenance-safety`, current working tree over `main` `0e196a9`. This is the domain view of [CAPABILITY_LEDGER](CAPABILITY_LEDGER.md), not another implementation registry. The ledger keeps findings and executed checks; this matrix assesses the broader mandate. Only scoped structural inspection was performed for this snapshot. Historic ledger checks are not blanket re-verification.

## Status and evidence rules

The [whole-site quality standard](WHOLE_SITE_QUALITY_STANDARD.md) is adopted as
criteria, not implemented capability. Its Present/Partial/Missing/Unverified
observations belong to the existing scoped evidence fields; retain this matrix's
maturity vocabulary and audit finding labels. Unassessed remains U. No domain
cell was promoted by the 2026-10-25 documentation/skill integration.

Maturity vocabulary: **Missing → Planned → Foundation → PartiallyImplemented → Functional → ProductionVerified → Advanced → ReferenceClassEquivalent**. Progress is evidence-based, not automatic; Advanced does not bypass production verification. Missing needs a search of the relevant canonical owner, Planned needs an accepted contract, Foundation means inspected models/contract/consumer exists, PartiallyImplemented means an inspected subset exists with a documented larger target. Functional needs the actual end-to-end acceptance checks. ProductionVerified needs a named deployed version/environment and operational evidence. ReferenceClassEquivalent also requires a benchmark checklist and owner acceptance.

Table shorthand: **F** = Foundation, **PI** = PartiallyImplemented, **P** = Planned target with no implementation found in the inspected owner, **U** = unassessed (not evidence of absence). No cell in this broad snapshot is promoted to Functional or ProductionVerified. See the existing editor/maintenance ledger and audit for their narrower executed tests. Status describes the full dimension for that domain, not every individual feature inside it.

## Domain owners and real gaps

| Domain | Evidence inspected / existing owner | Gap to target / next change | Dependency / priority / risk | Acceptance |
|---|---|---|---|---|
| Platform Core | `src/modules/identity/server/access.ts`, `src/modules/identity/domain/sections.ts`, `src/platform/extensions/contracts.ts`, `src/extensions/server/state.ts`, `src/modules/packages/server/store.ts`, `src/modules/packages/server/code-apply.ts`, `src/themes/runtime.ts`, `src/app/api/admin/extensions/navigation/route.ts`, `src/components/admin/ManageBar.tsx` | Existing Role guards and section delegation; forum groups are not a platform group resolver. The merged forum slice adds canonical restriction records and bounded forum consumers with local Functional evidence; the fresh-main authentication slice consumes GLOBAL identity.authenticate facts in existing guards, with bounded PostgreSQL/compiled-browser evidence. Former raw-token ads/repository/form consumers now have PostgreSQL and18 compiled-browser cases; global Admin commands, remaining resource/background consumers and safe local rollout remain open (PARTIAL). Global theme resolution exists; module assignments not found in inspected theme contracts. Packages already install inactive; richer operation journal/compensation and typed Admin/action contributions still need extension. ManageBar is links, not a mutation-action registry. | Same owners; roadmap 2–6; P0/P1, H | Compatibility comparison for roles, overlapping restrictions, lifecycle failure/idempotency, theme isolation, direct contextual handler rejection. |
| Community | `src/modules/forum/domain/community.ts`, `src/modules/forum/server/community.ts`, `src/modules/forum/server/team.ts`, `src/modules/forum/server/http/admin.ts`; existing forum groups/category permissions, canonical UserId, scoped moderators and sanction timestamps | Extend existing category/group decisions and moderation; the isolated forum slice adds independently revocable module records/history while retaining timestamp compatibility; appeals and broader policy remain open. Split/merge/polls/messages are existing capabilities to verify, not recreate. | Core restrictions/groups; roadmap 7; P2, H | Scope, expiry, appeals and staff protection; current multi-actor forum flows and visual baselines. |
| Store | Existing `src/modules/store/server` catalog/orders/pricing/cart/bundles/digital-codes/returns and canonical billing/wallet/fulfilment owners; names/ownership cross-checked, individual workflows not fully re-audited | First verify buyer journey and financial concurrency against current owners. Do not label variants, reservations, promotion/tax/shipping completeness from file names. Professional commerce gaps need workflow-level audit. | Release evidence, existing financial claims; roadmap 1/8; P0/P2, H | Payment/refund/stock state claims, repeat callbacks, money constraints, real buyer flow and historical amount preservation. |
| Magazine | `src/modules/journal/server/admin.ts`, item links and canonical editor/document/revision owners | Existing drafts/scheduled publication are not a complete review/approval transition contract. 2026-10-25: an author→manager review step (setting, off by default) was added with native PG and browser evidence ([spec](../specs/journal-review/SPEC.md)); multi-step approval and pending edits of live articles remain out of scope. Extend after preserving status compatibility; retain fixed conversion/CAS/direction behavior. | Existing CMS/editor/scheduler; roadmap 1/9; P0/P2, M | Authorized transitions, scheduled retry, document/revision/SEO retention and section-only editor flow. |
| Music | `src/modules/music/server/personal-playlists.ts`, listening history, release notifications, admin facade and Prisma Music models | Personal playlist owner CRUD already exists. Complete professional metadata/import/editorial requirements need field/workflow audit; do not rebuild artist/album/playlist systems. | Shared media/import/jobs, restriction/permission contracts; roadmap 10; P2, M | Artist/album discoverability, private playlist authorization, structured asset metadata and idempotent import. |
| Cinema | `src/modules/cinema/server/admin.ts`, `progress.ts`, `people.ts`, metadata facade, episode notifications and shared media administration | Seasons/episodes/people/progress exist. Scoped2026-10-17 follow-up verified keyless title details, available exact-identity actor/director photos and real local Library copies; source roster completeness/direct title-page access remain partial. Separate advanced audio/styled subtitles and full staff/buyer paths still need targeted work, not a new player. | Shared media/downloads/jobs; roadmap11; P2, M; [scoped photo evidence](handoffs/CONTENT_AUTHORING.md#keyless-actordirector-photos--2026-10-17) | Preserve access, URLs/assets and existing person photos; never guess missing identities or treat this as production verification. |
| Games | `src/modules/games/server/admin.ts`, `library.ts`, `portal.ts`, release notifications and structured Game models | Library and release alerts exist. Editions/DLC/patch/requirements completeness is unassessed; audit fields and consumers before adding. | Shared media/search/notifications; roadmap 12; P2, M | Structured release relationships, manager scope, preserved item URLs and user library. |
| Software | `src/modules/software/server/admin.ts`, `releases.ts`, `current-version.ts`, release notifications and release models | Version history/compatibility already exist. Build channels/checksums/mirrors/licenses/advisories need a targeted gap audit; do not replace versions with one mutable current-version row. | Shared media/import/search; roadmap 12; P2, M | Historical versions remain reachable, validated artifacts/compatibility, permission and module-state enforcement. |

## Models, presentation and access

| Domain | Models | Public frontend | Admin UX | Groups | Permissions | Restrictions | Workflows |
|---|---|---|---|---|---|---|---|
| Platform Core | PI | F | PI | PI | PI | PI | PI |
| Community | PI | F | PI | PI | PI | PI | PI |
| Store | F | PI | F | U | F | P | PI |
| Magazine | F | F | PI | U | F | P | PI |
| Music | F | F | F | U | F | P | PI |
| Cinema | F | F | F | U | F | P | PI |
| Games | F | F | F | U | F | P | PI |
| Software | F | F | F | U | F | P | PI |

Core/Community restriction PI includes account standing, legacy timestamps and the isolated locally verified forum-record slice; the full generalized restriction contract is incomplete. Other domain P cells mean the new generalized restriction integration is planned, not that current publication/ownership/entitlement checks are missing. Core/Community groups PI reflect different existing Role and forum membership subsets, not a completed central advanced group policy.

## Extensibility and editing

| Domain | Independent themes | Plugins | Lifecycle | Admin registry | Contextual actions | Blocks/editor | Bulk operations |
|---|---|---|---|---|---|---|---|
| Platform Core | PI | PI | PI | PI | PI | PI | U |
| Community | P | F | F | F | PI | U | U |
| Store | P | F | F | F | PI | U | U |
| Magazine | P | F | F | F | PI | PI | U |
| Music | P | F | F | F | PI | U | U |
| Cinema | P | F | F | F | PI | U | U |
| Games | P | F | F | F | PI | U | U |
| Software | P | F | F | F | PI | U | U |

Core themes PI reflects implemented global themes and planned module assignment. Domain plugin/lifecycle/registry F reflects existing section manifests, effective module switches and navigation contributions, not the full lifecycle state machine. Contextual PI reflects existing manage links/inline actions; the typed mutation contract is planned. Existing bulk selection/pagination from prior work must be inspected before rating per-domain behavior. Specialist content is typed data; blocks are optional registered integrations, not a demand to store every domain entity as an editor document.

## Operations and verification

Shared Media now has a bounded, locally verified catalog/folder/transfer implementation composing existing storage/import/queue owners. New imports explicitly opt out; historical behavior stays compatible. Use [Media library continuation](handoffs/MEDIA_LIBRARY.md) for actual PostgreSQL/browser/build evidence and limits (metadata trash, no reference-aware blob purge). This does not promote unrelated domain cells to production-ready.

The library also composes existing guarded SFTP/FTP/FTPS browsing and ZIP/RAR password/content tools. Source-preserving content versions and explicit host-to-local copies register in that catalog; current authority, strict storage audit and bounded unsafe-entry refusal were exercised on real tools/protocol fixtures. The same continuation records prerequisites and untested real FTPS/production-provider boundaries; no new storage owner or remote in-place archive editor.

| Domain | Import/export | Automation | Search | Analytics | Security | Testing | Deployment |
|---|---|---|---|---|---|---|---|
| Platform Core | F | U | F | PI | PI | PI | U |
| Community | U | U | U | U | PI | U | U |
| Store | U | U | U | U | PI | PI | PI |
| Magazine | U | U | U | U | U | PI | U |
| Music | U | U | U | U | U | U | U |
| Cinema | U | U | U | U | U | U | U |
| Games | U | U | U | U | U | U | U |
| Software | U | U | U | U | U | U | U |

Shared import providers/jobs, search and security owners already exist. U means this adoption review did not execute that domain's operation/security/test/release scenarios. Narrow previous editor/maintenance tests justify PI test evidence for Core/Magazine only, not platform-wide launch certification. Never convert U to Missing without inspection, or to Functional from a file's existence.

## Updating this view

2026-10-18 bounded Identity/Admin continuation: shared avatar writers/session refresh and permission-aware control discovery have local Functional evidence. Owner screenshots subsequently exposed disconnected business-review/Journal-card readers; the focused correction adds guarded customer/ticket/invoice projections,168 units/full types/gates, four PG regressions/fault checks and actual themed/browser picture flows. This does not promote all Identity dimensions or assert universal field-level Admin configuration. Continue the [scoped handoff and remaining limits](handoffs/UNIFIED_AVATAR_ADMIN_CONTROLS.md).

2026-10-10 Store PI cells above reflect only the [real buyer/return compiled-runtime slice](audits/2026-10-10-buyer-return-runtime.md): wallet checkout/replay, delivered-code privacy, scoped return/refund, inspected light/dark/mobile views, and isolated HTTPS/PostgreSQL execution. They do not assess all Store surfaces, all security, real providers or a deployed production environment. Other domain cells are unchanged.

Audit the named owner, select one [roadmap](IMPLEMENTATION_ROADMAP.md) slice and update the existing ledger row with real findings/checks. Change only the supported cells here, including date/version/test evidence and remaining gaps. The maturity vocabulary supplements the ledger's GOOD/PARTIAL/WEAK_* finding labels; GOOD alone does not imply ProductionVerified. Priority and risk live on the domain and slice rows so unassessed cells do not masquerade as proven missing features.

## Release-safety delivery checkpoint

[PR #146](https://github.com/WebNetData/MoboComCMS/pull/146) merged; [actual scope and verification](audits/2026-10-10-release-safety-pr.md). Staff guard, maintenance CAS, CMS labels, editor conversion/direction/contrast and portable inserts were verified. Broader domain maturity is unchanged; production and full real buyer/return evidence remain outstanding.

2026-10-11 bounded continuation: shared Analytics counter integrity and Notifications queue/replay integrity passed actual PostgreSQL/SQLite concurrency/rollback, check638/build and compiled browser58/seven skips/zero retries. Core Analytics is PI for those proven counters, not full advanced analytics certification. Bootstrap role preservation passed both databases, 12 concurrent initializations and an actual :3000 restart preserving all five roles/nine accounts. See the three [capability evidence rows](CAPABILITY_LEDGER.md). Provider delivery, global/resource/token enforcement and deployment remain open.

<!-- mobocom-business-status-route:start -->
Business experiences remain PARTIAL overall. The2026-10-15 trust continuation adds actual local Functional evidence for shared reports, private independently reviewed purchase proof, version-bound badges, private activity and Admin queues, with additive migration/empty+populated PostgreSQL and real desktop/mobile theme/axe checks. This does not promote unrelated broad cells or deployed maturity. Use [the canonical handoff](handoffs/BUSINESS_EXPERIENCES.md) for current checkout, exact gates and optional remaining request leases/notifications; preserve ownership in ARCHITECTURE.md.
<!-- mobocom-business-status-route:end -->
