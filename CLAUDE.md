# Claude workflow — MoboCom

Read and follow [AGENTS.md](AGENTS.md) for the shared repository invariants, owner decisions and tool routing. It is the canonical root guidance; this file does not duplicate it.

Use the existing `.claude/skills/mobocom-*` workflows for this agent. Audit current implementation before adding anything; continue the existing batch. Read only relevant architecture/contracts via [MASTER_PROMPT](docs/agent/MASTER_PROMPT.md). For frontend design follow [FRONTEND_QUALITY](docs/agent/FRONTEND_QUALITY.md): preserve the approved surfaces, use Figma SDS and React Doctor, and actually verify affected UI in a browser.

The domain matrix records evidence and uncertainty; the roadmap sequences safe slices. Do not infer implementation or production readiness from adopted requirements. Owner merges/deploys; PRs target main. Preserve unrelated local changes and the current data, APIs, URLs and section-specific permissions.

<!-- mobocom-business-continuation:start -->
## Business experiences continuation

For business/Trustpilot-style experiences, read docs/agent/handoffs/BUSINESS_EXPERIENCES.md first and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve the authoritative branch/worktree before editing: the implementation may be ahead of this checkout. Continue it; do not rebuild from missing files here. The handoff records verified checks and remaining work, not whole-feature completion.
<!-- mobocom-business-continuation:end -->

## Forms, held work and safety continuation

For the form builder, automation rules, staff queues, work that somebody holds (forms and tickets), SMS limits and the October 2026 safety review, read docs/agent/handoffs/FORMS_AND_OPERATIONS.md first. It names the owners, the rules that must keep holding, what ran and what is still untested. Extend the forms module; do not build a second form, payment or queue system beside it.

## Admin organization, staff roles and modular features continuation

For the Admin menu (areas, groups, labels, tabs), staff roles and member groups, or putting a feature in its own module, read docs/agent/handoffs/ADMIN_ORGANIZATION.md first: its rules (by job, never change an address or permission while moving a link, a switchable feature is a module whose code stays with its data owner, tabs from the filtered menu, roles in identity/domain/staff-roles.ts) and its ordered next slices. Continue them; do not invent a parallel menu, role or permission registry.

<!-- mobocom-engineering-skills:start -->
## Supporting engineering skills

For supporting UI/design, React, accessibility, browser testing, documentation or MCP authoring, first read `docs/agent/ENGINEERING_SKILLS.md` in the active MoboCom checkout and load only its relevant task skill. Existing module owners, SDS/MoboCom tokens, protected visuals and actual local validation remain authoritative; generic upstream stack/aesthetic preferences are not architecture decisions.
For requested interface design, styling, polish or redesign, use `unslop` with the relevant installed UI Skills (`baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`), plus `ui-ux-pro-max` and selected Vercel React rules as needed. Follow `docs/agent/FRONTEND_QUALITY.md` and `ENGINEERING_SKILLS.md`; preserve approved MoboCom/SDS tokens and scoped layout. Other catalog skills stay task-specific.
<!-- mobocom-engineering-skills:end -->

<!-- mobocom-whole-site-quality:claude:start -->
## Whole-site design and architecture workflow (Claude Code)

For tasks involving site-wide architecture, Admin organization, extensibility, themes or plugins, follow the shared quality contract at `docs/agent/WHOLE_SITE_QUALITY_STANDARD.md` and the scoped start brief `docs/agent/WHOLE_SITE_EXECUTION_PROMPT.md`. Existing `AGENTS.md` remains the shared root source of repository invariants; do not duplicate or override it here.

Before proposing work, inspect the live branch/worktree, relevant owners, approved UI baselines and current handoffs; distinguish evidence from planned contracts. First deliver read-only inventory, gaps, target IA/architecture and a small-slice roadmap. Apply only an authorized slice, validate with project checks and real browser evidence for UI, and report unrun checks. Preserve protected design, data, URL, permission and module lifecycle contracts. Reuse existing theme, extension, settings and vocabulary owners; no unrestricted server code edits from Admin.

Scope and already-granted authorization come from the current user request. Read the adoption note before running a whole-site brief; use existing status documents and do not reopen approval for an authorized slice.
<!-- mobocom-whole-site-quality:claude:end -->
