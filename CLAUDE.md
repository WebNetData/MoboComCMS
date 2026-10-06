# CLAUDE.md — MoboCom v4

Use the repo-local `.claude/skills/mobocom-*` skills for scoped workflows.

## Non-negotiable repository invariants
- Audit current code before creating new architecture; repository truth wins.
- Continue incomplete work; do not rebuild capabilities that already exist.
- Preserve approved visuals of Homepage, Magazine, Music, Games, Movies and TV Series.
- Figma SDS guides tokens/primitives/compositions underneath MoboCom; do not generic-redesign protected surfaces.
- Keep a modular monolith by default with explicit domain/public extension boundaries.
- Keep exactly one canonical MoboCom human Identity/UserId for all modules and future Messenger/mobile/desktop/web clients.
- CRM Contact is not the authentication identity; link explicitly when appropriate.
- Never duplicate shared Identity/AuthZ/Settings/Media/Search/Notifications/Engagement/Moderation/Jobs/Audit systems.
- Optional module disable preserves data and must not break Core.
- Plugins/themes/modules have version/dependency/compatibility contracts; themes contain presentation, not business rules.
- CMS + CRM are first-class integrated domains.
- Use Solution Packs/configuration for business variants, not code forks.
- Future Messenger/apps use stable versioned APIs/events and the same canonical identity.
- Production migrations are incremental/data-safe; update compatibility matters.
- Keep changes focused, typed, tested and diff-reviewed.

## Decisions in force
Decided by the owner after the v4 prompt; full text, code locations and guards in `docs/agent/PLATFORM_DECISIONS.md`.
- Focus: Store, Magazine, Games, Movies and TV Series, Music, Forum. VPN, resellers and the marketplace are set aside and stay switchable off.
- One permission per section; `cms.posts` is the magazine only. No shared content permission, no second authorization system.
- Staff standing changes only through the staff guard; standing and role change together; staff without a role is full access.
- Managers per site section come from `/admin/section-managers`; forum ranks (admin, deputy, forum moderator) name access that already exists.
- Forum: section → forum → subforum; a section takes no topics; moderation is scoped with `inCategory`; follow, feed and reviews are composed from their owner modules. The forum is not a protected visual surface.
- Every pull request targets `main`; the owner merges and deploys. Done means a connected PostgreSQL check and, for anything visible, a browser check actually ran.

## Tool routing
- Exact text/symbol → `trs search`/normal exact search.
- Conceptual code location → Probe.
- Symbol references/semantic edit → Serena.
- Verbose terminal command → `trs`.
- Architecture boundary/cycle → dependency-cruiser + existing architecture checks.
- API scenario → Hurl; API lint → Spectral; breaking API diff → oasdiff; independent consumer contract → Pact.
- DB/integration behavior → Testcontainers when useful; invariants → fast-check; critical test strength → Stryker.
- Frontend component → Storybook; React review → React Doctor; browser/E2E/visual → Playwright CLI; accessibility → axe/a11y.
- Security → Opengrep + Trivy; GitHub Actions → zizmor.
- Dead code → Knip; large structural refactor → ast-grep.

Use only relevant tools for the task. Do not run the full release stack after every edit.
