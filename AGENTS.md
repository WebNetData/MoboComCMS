# AGENTS.md — MoboCom — platform mandate 2026-10-10

Use the repo-local `mobocom-*` skills for scoped workflows.

## Non-negotiable repository invariants
- Audit current code before creating new architecture; repository truth wins.
- Continue incomplete work; do not rebuild capabilities that already exist.
- Preserve approved visuals and URLs of Homepage, Magazine, Music, Cinema (Movies/TV Series), Games, Software, Store and Community.
- Frontend design uses Figma SDS for tokens/primitives/compositions and React Doctor for affected React components, followed by actual browser/a11y checks; follow `docs/agent/FRONTEND_QUALITY.md`. Preserve MoboCom visual identity.
- Keep a modular monolith by default with explicit domain/public extension boundaries.
- Keep exactly one canonical MoboCom human Identity/UserId for all modules and future Messenger/mobile/desktop/web clients.
- CRM Contact is not the authentication identity; link explicitly when appropriate.
- Never duplicate shared Identity/AuthZ/Settings/Media/Search/Notifications/Engagement/Moderation/Jobs/Audit systems.
- Optional module disable preserves data and must not break Core. Install/activate/uninstall/purge are separate; trusted code uses normal build/deploy, declarative packages use validated host registries.
- Plugins/themes/modules have version/dependency/compatibility contracts; independent module themes use the existing registry and fallback. Themes contain presentation, not business rules.
- CMS + CRM are first-class integrated domains.
- Use Solution Packs/configuration for business variants, not code forks.
- Future Messenger/apps use stable versioned APIs/events and the same canonical identity.
- Production migrations are incremental/data-safe; update compatibility matters.
- Keep changes focused, typed, tested and diff-reviewed.

## Decisions in force
Owner decisions and reconciliation: `docs/agent/PLATFORM_DECISIONS.md`. Canonical architecture: `docs/agent/ARCHITECTURE.md`; focused contracts, evidence matrix and incremental roadmap are linked there. Read only task-relevant sections; the archived mandate is source material, not a replacement task.
- Focus: Store, Magazine, Games, Movies and TV Series, Music, Software, Community/Forum. VPN, resellers and the marketplace are set aside and stay switchable off.
- Preserve section-specific permission keys and current staff access; `cms.posts` is Magazine only. Advanced groups/capabilities/restrictions extend the same canonical AuthZ guards, never a shared cross-section permission or second resolver.
- Staff standing changes only through the staff guard; standing and role change together; staff without a role is full access.
- Managers per site section come from `/admin/section-managers`; forum ranks (admin, deputy, forum moderator) name access that already exists.
- Authors per section (magazine, film and series, music, games, software, Prompt Master) come from the same page: an author holds the section's author permission (`journal.author`, `cinema.author`, `music.author`, `games.author`, `software.author`, `prompts.author`), is held to the items they created by `requireContentScope`, and never deletes — their delete sends the item to the trash (`status` `TRASHED`) for the section's manager or the owner to delete or restore.
- Forum: section → forum → subforum; a section takes no topics; moderation is scoped with `inCategory`; follow, feed and reviews are composed from their owner modules. Its current visual design is now protected by the 2026-10-10 mandate.
- History: before launch a rule that changes a stored number is applied to everything already stored; after launch no update ignores or resets the past (recount from the stored events, or a data-safe backfill).
- Every pull request targets `main`; the owner merges and deploys. Done means a connected PostgreSQL check and, for anything visible, a browser check actually ran.
- Security floor: a limit that guards a secret is `rateLimitStrict`; a write to `/api` must show where it was made (a session cookie alone never writes; a tool sends `Origin`); scripts run by nonce, so an inline `<script>` takes `nonce` from `x-nonce` and inline event handlers do not run.
- Money rows (orders, invoices, payments, wallet, fulfilment, returns): the database holds their states and amounts. Change a state with a claim (`updateMany` on the state it was decided on, then the count), never an unconditional `update`; a new state or wallet row type needs a migration that widens the constraint.
- Content is written in the block editor (plugin `block-editor`, on by default) for pages and magazine articles. What is stored is the MoboCom document (`src/modules/editor/domain`), never an editing engine's output; `@wordpress/*` is imported only under `src/components/editor/gutenberg`; a new block is a registry definition, not editor code. With the plugin off the forms are the old editor again and every body is kept.
- The site is written in one language; translation is Google Translate's. No English title, excerpt or body fields on the pages and articles forms (the columns are kept).
- A section can be put in maintenance by itself (`/admin/maintenance`): visitors get the owner's notice, only full access and that section's managers see it. A new section with public pages joins `MAINTENANCE_SECTIONS`.
- Every migration is listed in `prisma/release-manifest.json`; every pull request passes `.github/workflows/checks.yml` and has executed local browser evidence for visible changes. Owner decision after PR #147: hosted browser tests are manual only; do not repeat them automatically after local validation. A test must pass with no `.env`, on an empty database and as a user who is not root.
- A module past a few hundred lines is a folder of parts behind the same address; other modules import the address, never a part.

## Tool routing
- Exact text/symbol → `trs search`/normal exact search.
- Conceptual code location → Probe.
- Architecture/relationship discovery → local Graphify; confirm candidates with source/Serena, never infer runtime proof.
- Symbol references/semantic edit → Serena.
- Persistent work tracking → Beads when installed; otherwise the existing workstate.
- Verbose terminal command → `trs`.
- Architecture boundary/cycle → dependency-cruiser + existing architecture checks.
- API scenario → Hurl; API lint → Spectral; breaking API diff → oasdiff; independent consumer contract → Pact.
- DB/integration behavior → Testcontainers when useful; invariants → fast-check; critical test strength → Stryker.
- Frontend component → Storybook; React review → React Doctor; browser/E2E/visual → Playwright CLI; accessibility → axe/a11y.
- Version-sensitive library docs → Context7; frontend review → selected Vercel skills under MoboCom/SDS constraints; exploratory browser → isolated Playwright MCP.
- Security → Semgrep or Opengrep (one scoped engine) + Trivy; secrets → redacted Gitleaks; GitHub Actions → zizmor.
- Dead code → Knip; large structural refactor → ast-grep.

Use only relevant tools for the task. Do not run the full release stack after every edit.
Verified tooling, baselines, pins and activation: `docs/agent/DEVSTACK.md`.

<!-- mobocom-business-continuation:start -->
## Business experiences continuation

For business/Trustpilot-style experiences, read docs/agent/handoffs/BUSINESS_EXPERIENCES.md first and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve the authoritative branch/worktree before editing: the implementation may be ahead of this checkout. Continue it; do not rebuild from missing files here. The handoff records verified checks and remaining work, not whole-feature completion.
<!-- mobocom-business-continuation:end -->

## Forms, held work and safety continuation

For the form builder, automation rules, staff queues, work that somebody holds (forms and tickets), SMS limits and the October 2026 safety review, read docs/agent/handoffs/FORMS_AND_OPERATIONS.md first. It names the owners, the rules that must keep holding, what ran and what is still untested. Extend the forms module; do not build a second form, payment or queue system beside it.

<!-- mobocom-engineering-skills:start -->
## Supporting engineering skills

For supporting UI/design, React, accessibility, browser testing, documentation or MCP authoring, first read `docs/agent/ENGINEERING_SKILLS.md` in the active MoboCom checkout and load only its relevant task skill. Existing module owners, SDS/MoboCom tokens, protected visuals and actual local validation remain authoritative; generic upstream stack/aesthetic preferences are not architecture decisions.
For requested interface design, styling, polish or redesign, use `unslop` with the relevant installed UI Skills (`baseline-ui`, `fixing-accessibility`, `fixing-motion-performance`), plus `ui-ux-pro-max` and selected Vercel React rules as needed. Follow `docs/agent/FRONTEND_QUALITY.md` and `ENGINEERING_SKILLS.md`; preserve approved MoboCom/SDS tokens and scoped layout. Other catalog skills stay task-specific.
<!-- mobocom-engineering-skills:end -->

<!-- mobocom-whole-site-quality:start -->
## Whole-site architecture and administration quality (Codex + Claude)

- `docs/agent/WHOLE_SITE_QUALITY_STANDARD.md` is the cross-site quality contract for architecture, data, backend, APIs, public/admin UX, themes, plugins, security, operations and long-term extensibility. Read task-relevant sections before architecture, Admin, content, theme/plugin or cross-cutting changes; it does not override `docs/agent/PLATFORM_DECISIONS.md` or `docs/agent/ARCHITECTURE.md`.
- Audit the real checkout, its owner boundaries and active handoffs before proposing new layers. Preserve protected public visuals, existing routes, data, identity, permissions and module-off behavior. No second shared system or unrestricted Admin code execution.
- For each affected feature, define its owner, typed schema/relationships, page and form information hierarchy, permissions, editor/extension points, failure states, accessibility/RTL/responsive behavior and evidence-backed acceptance tests. Extend existing Admin builders, vocabularies and extension/theme registries, not parallel implementations.
- Whole-site work starts with read-only inventory + evidence matrix + target blueprint + phased vertical-slice roadmap; never interpret a broad architecture mandate as authorization to rewrite the full repository, deploy, purge data or change protected designs.
- For current whole-site architecture work, follow `docs/agent/WHOLE_SITE_EXECUTION_PROMPT.md`. After each slice, report actual files, executed checks, browser proof when UI changed, gaps and rollback, never claim unrun tests passed.

Scope and already-granted authorization come from the current user request. Read the adoption note before running a whole-site brief; use existing status documents and do not reopen approval for an authorized slice.
<!-- mobocom-whole-site-quality:end -->

## AI connection and Xray continuation

For Gemini/AI connection failures, encrypted AI settings or proxy deadlines, read `docs/agent/handoffs/AI_CONNECTION.md` first. Continue the existing AI client and Social egress owners; preserve explicit per-purpose routing, fixed host allowlists and root-helper ownership. Local fixtures do not establish destination-server or live-provider readiness.
