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
