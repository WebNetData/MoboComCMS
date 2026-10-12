# ADR: Adopt the platform mandate through existing owners

Status: accepted for architecture/skill guidance on 2026-10-10; runtime contracts remain incremental targets. Source: [archived owner mandate](../requirements/platform-mandate-2026-10-10.md). This decision does not authorize production deployment or agent merging.

## Context

The owner requests architecture and skill updates for a mature modular platform, preserving frontend identity and using Figma SDS plus React Doctor. The current repository already has canonical identity/Role guards, forum groups, module switches, package installation, dynamic Admin navigation, global themes, document editing and financial workflows. A previous editor/maintenance fix batch is uncommitted in the same working tree and must remain intact. Copying the mandate into every skill would make discovery expensive and allow competing/stale instructions.

## Decisions and alternatives

| Area | Decision | Rejected alternative / rationale | Tradeoff / risk |
|---|---|---|---|
| Source of truth | Keep `ARCHITECTURE.md`, focused contracts and owner decisions canonical; preserve exact attachment once. Skills route to relevant sections. Matrix is a domain view of the existing ledger. | New parallel master architecture/ledger or entire mandate in every skill: duplication and false certainty. | Focused documents need routing/integrity checks; installed fallback is explicitly secondary. |
| Shape/ownership | Modular monolith; typed extension/public API boundaries, one shared owner per service. Domains benchmark capabilities without copying proprietary products. | Rebuild existing owners or start microservices/WordPress backend: data/API drift and unnecessary complexity. | Stronger boundaries require gradual legacy cleanup, not directory churn. |
| Authorization | Extend canonical UserId/AuthZ with scoped restrictions and deterministic group/capability rules; preserve current section keys, full-access and staff guard. | Forum groups become global administrators, or a new parallel policy engine: escalation and incompatible decisions. | Central decisions have performance/cache and migration risks; compare legacy decisions before switching. |
| Restrictions | Auditable independent scope records, expiry/revocation at decision time, controlled exceptions; forum sanction does not disable unrelated modules. | One global banned flag for all sanctions, or sanction timestamps only: lost provenance and scope ambiguity. | Additive models/backfills, multi-entry-point enforcement and bounded invalidation required. |
| Lifecycle/Admin | Extend existing state/packages/registries with claimed operations, failure recovery and typed real contributions; install separate from activate. | Uploaded TS automatically becomes Next routes or SDK types imply a sandbox: unsafe and incompatible with builds. | Trusted code requires normal release process; external actions need compensation. |
| Themes | Extend existing global runtime with compatible per-module presentation contracts, scoped CSS and fallback; typed Admin assignment. | Business rules in themes or a new theme subsystem per domain: leaks and conflicting ownership. | Compatibility/preview/fallback tests needed; protected visuals constrain change. |
| Contextual actions | Typed registry consumer delegates to existing owning handler with fresh authorization, validation, concurrency and audit. | Mutations implemented in ManageBar/React or hidden buttons as access control: direct-call bypass. | Host contract and accessible quick/full edit flows add work; financial transitions stay protected. |
| Frontend quality | SDS guides tokens/primitives/compositions; React Doctor plus actual browser/accessibility evidence for affected UI. | Demo reskin or a static score treated as bug-free/beautiful certification. | Baselines and real multi-state tests take time but preserve approved identity. |
| Delivery/maturity | Expand/backfill/switch/contract with manifest and schema parity; evidence-based maturity, small verified slices and launch essentials early. | Benchmark parity declared from docs or broad destructive migration. | Advanced targets ship progressively; no production claim without deployment evidence. |

## Explicit reconciliation with prior owner decisions

- Protected public surfaces now also include **Software, Store and Community**. The 2026-10-06 permission to redesign Forum is historical; its resulting current design is protected from broad redesign from this adoption onward. Movies and TV Series remain Cinema and keep their URLs.
- Software joins the active target domains. CRM remains a first-class integrated domain and canonical Contact/Identity distinction; VPN, reseller and marketplace remain switchable off and out of focus.
- “One permission per section” keeps its anti-cross-section meaning. Existing keys and Store's catalog/order distinctions are preserved. Advanced groups/resource capabilities extend the same guards, not a second permission system or immediate incompatible replacement.
- Existing full-access staff behavior remains compatible; new restriction/recovery policies need an explicit narrowly audited path, not an implicit elevation via group or forum rank.
- Owner merges and deploys; PRs target `main`. The new document's engineering ambition does not supersede that operational decision.
- Canonical MoboCom editor documents, explicit conversion acceptance, one-language forms, nonce/Origin/strict rate limits, money-state claims, aggregate Setting CAS, maintenance and history preservation remain in force.

## Security, migration and reversibility

This adoption changes documents/skills only: no database migration, package activation, permission grant or public visual change. Future restriction/group/lifecycle/theme migrations need a compact spec, additive parity, release-manifest registration, protected data backfill and real PostgreSQL checks. Keep old routes/fields until compatibility is proven. Roll out policy with comparison/feature configuration, not silent enforcement changes. Theme rollback restores assignments; disable/uninstall preserves domain data; financial rollback cannot erase ledger history. Exact source can be re-read, and documentation changes can be reverted without touching current application data.

## Consequences and acceptance

The [matrix](../DOMAIN_CAPABILITY_MATRIX.md) records structural evidence and uncertainty; the [roadmap](../IMPLEMENTATION_ROADMAP.md) orders executable slices. [Frontend quality](../FRONTEND_QUALITY.md) defines the owner's SDS/Doctor requirement. Existing local Codex/Claude skills and installed MoboCom entrypoints are synchronized, without adding duplicate domain skills or changing invocation policies. Validate frontmatter, routing/local links, archive hash and sync consistency, then existing architecture/source gates. No runtime success is inferred from these documentation checks.
