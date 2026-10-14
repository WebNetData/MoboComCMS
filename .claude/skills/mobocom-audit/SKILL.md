---
name: mobocom-audit
description: Audit the current MoboCom repository or feature batch before continuing work. Use when implementation state is unclear, previous work is partial, duplication or architectural drift is suspected, or a capability ledger/map must be refreshed.
---

# Focused audit

1. Read root instructions and relevant `docs/agent` map/ledger.
2. Scope only the current goal.
3. Locate exact evidence with `trs search`; use Probe for conceptual location, local Graphify for architecture/relationship candidates (DEVSTACK), and Serena for precise symbols/references. Confirm graph candidates against source and executed checks.
4. Map existing models/services/routes/UI/settings/permissions/tests/contracts.
5. Classify: `GOOD`, `WEAK_UX`, `WEAK_BACKEND`, `WEAK_SECURITY`, `PARTIAL`, `DISCONNECTED`, `DUPLICATE`, `MISSING`, `REGRESSED`.
6. Identify the canonical implementation.
7. Update durable map/ledger facts only; avoid verbose stale documentation.
8. If implementation is requested, hand off directly to the smallest executable development slice rather than stopping at a report.

Load `references/architecture.md`, `references/identity-contract.md` and `references/toolchain.md` only when needed.

## This repository
- Start from `docs/agent/PLATFORM_DECISIONS.md` (what was decided and where it lives), then `MOBOCOM_MAP.md` and `CAPABILITY_LEDGER.md`.
- Access questions: read `src/modules/identity/rbac.ts`, `server/access.ts`, `server/staff-guard.ts`, `domain/sections.ts` before concluding anything. `scripts/account-security.test.cjs` lists every file allowed to name `cms.posts`; a guard that accepts a permission of another section is a finding (`WEAK_SECURITY`).
- Forum questions: who moderates is `viewer.moderator` (everywhere) or `viewer.moderates` (assigned forums) through `inCategory`; a check of `viewer.moderator` on a topic or post that skips it is a finding.
- Applying or clearing a forum silence/suspension on staff composes Identity's `accountChangeRefusal` with the authenticated actor before writing the profile. A forum permission alone cannot sanction protected staff; inspect the canonical guard rather than adding a forum-specific staff hierarchy.
- After an audit, update the ledger row and the map line; if a decision changed, change its entry in PLATFORM_DECISIONS instead of appending.
- Since 2026-10-07 also findings: a secret-guarding limit on `rateLimitHit` instead of `rateLimitStrict`; an unconditional `update` of a money row's state; `@wordpress/` imported outside `src/components/editor/gutenberg`; an inline `<script>` without the nonce or an inline event handler; a file operation of the server panel that skips `guard`; a test that passes only with a `.env`, a busy database or root.

## Focused regression checks
For tooling audits, use `docs/agent/DEVSTACK.md` and its manifest; distinguish installed, configured, CLI/SDK connected and actually available in the current agent. Inspect only relevant owners. Record native scanner failures and advisory candidates separately; never renew baselines automatically to hide findings.

For legacy conversion, inspect whether editing can autosave dropped content before explicit first-save acceptance. For aggregate Settings, check concurrent first creation and stale read/modify/write across different sections and fields. For text direction, compare explicit paragraph/block precedence in editor and public rendering; punctuation and combining marks cannot decide direction. Use the existing owners and report code-only evidence separately from executed browser/PostgreSQL checks.

## Platform mandate routing — 2026-10-10

Read current repository root instructions, then task-relevant sections of `docs/agent/ARCHITECTURE.md` and `PLATFORM_DECISIONS.md`. The canonical contracts, domain matrix and roadmap are linked there; read only the affected scope. If the repository is unavailable, use the fallback from `references/architecture.md` and do not infer current implementation from it.

Use the domain matrix as a view of the existing ledger. Revalidate only relevant owners; mark unassessed explicitly, not missing. Separate finding labels from maturity and code inspection from executed checks. Inspect current groups/sanctions, effective module/package state, theme resolver and ManageBar before claiming a new platform system is needed.

<!-- mobocom-business-skill:start -->
## Business experiences routing

When this workflow touches business/Trustpilot-style experiences, first read docs/agent/handoffs/BUSINESS_EXPERIENCES.md and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve its authoritative checkout; continue existing ItemReview versus SellerReview owners and recorded evidence. Missing files in another checkout do not justify a new system. Load only the pending slice; the handoff is the continuation source.
<!-- mobocom-business-skill:end -->

<!-- mobocom-forms-skill:start -->
## Forms, held work and safety routing

When this workflow touches forms, form payments, appointments, staff queues, ticket ownership, SMS sending, sign-in limits or automation rules, first read docs/agent/handoffs/FORMS_AND_OPERATIONS.md. Extend src/modules/forms; charge through the site checkout; keep the rule that work somebody holds is changed only by its holder or a manager of that section. The handoff lists what is still untested — run those before calling anything ready.
<!-- mobocom-forms-skill:end -->
