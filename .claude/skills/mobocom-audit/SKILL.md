---
name: mobocom-audit
description: Audit the current MoboCom repository or feature batch before continuing work. Use when implementation state is unclear, previous work is partial, duplication or architectural drift is suspected, or a capability ledger/map must be refreshed.
---

# Focused audit

1. Read root instructions and relevant `docs/agent` map/ledger.
2. Scope only the current goal.
3. Locate exact evidence with `trs search`; use Probe when location is conceptual; use Serena only for deep symbol/reference analysis.
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
- After an audit, update the ledger row and the map line; if a decision changed, change its entry in PLATFORM_DECISIONS instead of appending.
- Since 2026-10-07 also findings: a secret-guarding limit on `rateLimitHit` instead of `rateLimitStrict`; an unconditional `update` of a money row's state; `@wordpress/` imported outside `src/components/editor/gutenberg`; an inline `<script>` without the nonce or an inline event handler; a file operation of the server panel that skips `guard`; a test that passes only with a `.env`, a busy database or root.


## Verified staff-sanction and editor safety

Applying or clearing forum silence/suspension calls canonical Identity `accountChangeRefusal(actor, targetId, { sensitive: true })` before the profile write, with the authenticated actor and existing forum permission. A forum-only manager cannot restrict protected staff. Reuse current guards; do not add a forum staff hierarchy.

Legacy block conversion requires explicit first-save acceptance before autosave; aggregate Setting writes claim the exact stored value and retry on conflict; text direction is explicit paragraph → block → first Unicode letter → page default. Verify affected flows against PostgreSQL and the actual browser, preserving protected visuals.
