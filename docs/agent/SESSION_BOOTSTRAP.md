# MoboCom — Session Bootstrap v4

Use the installed MoboCom skills as needed:
`mobocom-audit`, `mobocom-spec`, `mobocom-develop`, `mobocom-contracts`, `mobocom-extensions`, `mobocom-release`.

Continue from the **current repository state**. Previous feature batches may be partial; never restart completed functionality and never create parallel platform systems.

Start with the smallest focused audit needed for the current task. Reuse `docs/agent/MOBOCOM_MAP.md` and `CAPABILITY_LEDGER.md` when present; revalidate only stale/relevant entries.

Read `docs/agent/PLATFORM_DECISIONS.md` first when the task touches access, staff, the forum or the workflow: it holds what the owner decided after this prompt was written, and where each decision lives in the code.

Core constraints:
- MoboCom is a general-purpose modular CMS + CRM super-platform.
- Modular monolith first; preserve clean extraction seams.
- One canonical MoboCom Identity/UserId serves every module and future Messenger/mobile/desktop/web client.
- CRM Contact is separate from auth identity but may link to it.
- Optional modules can be enabled/disabled safely; disable preserves data.
- Platform-wide and module-specific plugins use stable public extension contracts.
- Global and per-module themes control presentation only.
- Different businesses use modules + plugins + themes + settings/Solution Packs, not code forks.
- Public/mobile/Messenger APIs/events are versioned and compatibility-checked.
- Legitimate behavior is manageable in Admin; secrets remain secret.
- Homepage, Magazine, Music, Games, Movies and TV Series are preserve-and-enhance surfaces.
- Figma SDS is the underlying design-system architecture, not MoboCom's visual skin.

Tool discipline:
exact search → `trs search`; conceptual search → Probe; deep symbol/reference work → Serena; verbose commands → `trs`.
Use architecture/API/security/frontend/release tools only when the task warrants them.

Execution:
inspect existing implementation → define compact scenario if non-trivial → identify real gaps → implement smallest production-quality vertical slice → run relevant gates → review data/security/API/UI/module-disable regressions → report actual results concisely.

Decisions in force (details and guards in `docs/agent/PLATFORM_DECISIONS.md`):
- Focus: Store, Magazine, Games, Movies and TV Series, Music, Forum. VPN, resellers and the marketplace are set aside and switchable off.
- One permission per section; `cms.posts` is the magazine only. Never add a shared content permission.
- Staff standing changes only through the staff guard; an account is never left as staff without a role (that is full access).
- Section managers come from `/admin/section-managers`; forum ranks (admin, deputy, forum moderator) from the forum admin's team tab.
- Forum: section → forum → subforum, sections take no topics, moderation is scoped with `inCategory`, the social side is composed from identity, community and reviews, never re-implemented.
- The forum is not a protected visual surface. Homepage, Magazine, Music, Games, Movies and TV Series still are.
- Every pull request targets `main`; the owner merges and deploys. A slice is done when a connected PostgreSQL check and, for anything visible, a browser check have actually run.
- Security floor: a limit that guards a secret is `rateLimitStrict`; a write to `/api` must show where it was made (a session cookie alone never writes; a tool sends `Origin`); scripts run by nonce, so an inline `<script>` takes `nonce` from `x-nonce` and inline event handlers do not run.
- Money rows (orders, invoices, payments, wallet, fulfilment, returns): the database holds their states and amounts. Change a state with a claim (`updateMany` on the state it was decided on, then the count), never an unconditional `update`; a new state or wallet row type needs a migration that widens the constraint.
- Content is written in the block editor (plugin `block-editor`, on by default) for pages and magazine articles. What is stored is the MoboCom document (`src/modules/editor/domain`), never an editing engine's output; `@wordpress/*` is imported only under `src/components/editor/gutenberg`; a new block is a registry definition, not editor code. With the plugin off the forms are the old editor again and every body is kept.
- The site is written in one language; translation is Google Translate's. No English title, excerpt or body fields on the pages and articles forms (the columns are kept).
- A section can be put in maintenance by itself (`/admin/maintenance`): visitors get the owner's notice, only full access and that section's managers see it. A new section with public pages joins `MAINTENANCE_SECTIONS`.
- Every migration is listed in `prisma/release-manifest.json`; every pull request passes `.github/workflows/checks.yml` and the browser suite. A test must pass with no `.env`, on an empty database and as a user who is not root.
- A module past a few hundred lines is a folder of parts behind the same address; other modules import the address, never a part.

<!-- mobocom-business-continuation:start -->
## Business experiences continuation

For business/Trustpilot-style experiences, read docs/agent/handoffs/BUSINESS_EXPERIENCES.md first and the business ownership section of docs/agent/ARCHITECTURE.md. Resolve the authoritative branch/worktree before editing: the implementation may be ahead of this checkout. Continue it; do not rebuild from missing files here. The handoff records verified checks and remaining work, not whole-feature completion.
<!-- mobocom-business-continuation:end -->
