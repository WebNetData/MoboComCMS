---
name: mobocom-spec
description: Define a compact implementation scenario/spec for a substantial MoboCom feature before coding. Use for new modules, cross-module flows, major CRM/CMS/community/music/store capabilities, Messenger-ready APIs, risky migrations, or features with multiple actors/states/contracts.
---

# Scenario-first design

1. Audit existing implementation first; a spec cannot assume missing functionality.
2. Read `references/spec-workflow.md`, plus architecture/identity/contracts references relevant to the feature.
3. Keep the spec compact and executable: outcome, actors, authorization, happy path, edge paths, invariants, Admin controls, contracts, security, compatibility, acceptance tests.
4. Preserve protected UI. New UI follows MoboCom + SDS architecture.
5. Make canonical ownership and cross-module boundaries explicit.
6. If future apps/Messenger/independent consumers may rely on the interface, define the versioned contract now.
7. Do not over-design microservices or future scale without evidence.
8. When accepted by repository reality, continue into `mobocom-develop`.

GitHub Spec Kit is an optional installed helper; use compact scenario/acceptance/convergence concepts within the existing `docs/specs` workflow. Do not initialize a parallel `.specify` system or use `init --force` as routine development. Tool routing and current installation evidence: `docs/agent/DEVSTACK.md`.

## This repository
- Specs live in `docs/specs/<feature>/SPEC.md`, from `docs/specs/_TEMPLATE.md`. A feature built in slices keeps one spec with a section per slice (see `docs/specs/forum-invision/SPEC.md`).
- "Actors & authorization" names the exact permission from `src/modules/identity/rbac.ts`; the existing section-specific keys, preserving catalog/order distinctions. For the forum, say which of the three ranks may do it and whether it is scoped to a forum.
- "Acceptance verification" names the connected PostgreSQL script and the deliberate breaks that must fail it.
- When the owner makes a decision the spec depends on, record it in `docs/agent/PLATFORM_DECISIONS.md` as well.
- Page or article content in a spec means the block editor and the MoboCom document (`docs/editor/ARCHITECTURE.md`): name the block types involved, their fields and, for a dynamic block, the question it stores. A feature that changes a money state names the claim it makes and the database rule it relies on.

## Platform mandate routing — 2026-10-10

Read current repository root instructions, then task-relevant sections of `docs/agent/ARCHITECTURE.md` and `PLATFORM_DECISIONS.md`. The canonical contracts, domain matrix and roadmap are linked there; read only the affected scope. If the repository is unavailable, use the fallback from `references/architecture.md` and do not infer current implementation from it.

For group/restriction/lifecycle/theme/contextual changes, load the relevant platform-evolution contract and record current owner, compatibility comparison, actors/explicit denies, failure/expiry/concurrency paths, typed Admin configuration, migration/backfill/rollback and concrete acceptance. Define one vertical slice; benchmark breadth does not authorize a rewrite.

<!-- mobocom-business-skill:start -->
## Business experiences routing

When this workflow touches business/Trustpilot-style experiences, first read docs/agent/handoffs/BUSINESS_EXPERIENCES.md and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve its authoritative checkout; continue existing ItemReview versus SellerReview owners and recorded evidence. Missing files in another checkout do not justify a new system. Load only the pending slice; the handoff is the continuation source.
<!-- mobocom-business-skill:end -->

<!-- mobocom-forms-skill:start -->
## Forms, held work and safety routing

When this workflow touches forms, form payments, appointments, staff queues, ticket ownership, SMS sending or sign-in limits, first read docs/agent/handoffs/FORMS_AND_OPERATIONS.md. Extend src/modules/forms; charge through the site checkout; keep the rule that work somebody holds is changed only by its holder or a manager of that section. The handoff lists what is still untested — run those before calling anything ready.
<!-- mobocom-forms-skill:end -->
